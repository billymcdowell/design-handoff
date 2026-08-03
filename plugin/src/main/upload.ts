// ─── UPLOAD_DATA: BackendPayload → stock PocketBase records ────────────────
// Dependency order: project → frames → layers (by depth) → layer_details.
// Frame PNGs stay as individual multipart POSTs. Layers / layer_details use
// stock POST /api/batch in chunks of ≤50 with client-pregenerated ids so
// parent relations resolve without waiting for server ids.
// Unchanged frames (matching content_hash) are skipped so republishing does
// not create a duplicate version.

import { APP_ORIGIN } from "../constants"
import type { BackendPayload, Layer, UploadedFrameLink } from "../types"
import { runWithConcurrency } from "./concurrency"
import { computeFrameContentHash } from "./frameContentHash"
import { getPendingImage } from "./imageStore"
import {
  BATCH_MAX_REQUESTS,
  createFrameRecord,
  createRecordsInBatches,
  FRAME_UPLOAD_CONCURRENCY,
  generateRecordId,
  getLatestFrameByName,
  LayerDetailFields,
  LayerFields,
  projectExists,
  updateProjectRecord,
} from "./pbClient"
import { resolveProjectForPublish } from "./planLimits"

type ProgressFn = (current: number, total: number, currentItemName: string) => void

export interface UploadResult {
  success: boolean
  error?: string
  apiCallCount?: number
  /** Frames that were created as new versions (with shareable viewer URLs). */
  uploadedFrames?: UploadedFrameLink[]
  /** Frames skipped because content matched the latest published version. */
  skippedFrames?: string[]
}

function frameShareUrl(frameId: string, projectId: string): string {
  return `${APP_ORIGIN}/frame/${frameId}?projectId=${projectId}`
}

function batchHttpCalls(recordCount: number): number {
  if (recordCount <= 0) return 0
  return Math.ceil(recordCount / BATCH_MAX_REQUESTS)
}

// ── Layer flattening by depth (12.1) ────────────────────────────────────────
interface FlatLayer {
  layer: Layer
  parentLayerId?: string
  depth: number
  siblingIndex: number
}

function flattenLayersByLevel(
  layers: Layer[],
  depth = 0,
  parentLayerId?: string,
): FlatLayer[] {
  const result: FlatLayer[] = []
  layers.forEach((layer, siblingIndex) => {
    result.push({ layer, parentLayerId, depth, siblingIndex })
    if (layer.children && layer.children.length > 0) {
      result.push(...flattenLayersByLevel(layer.children, depth + 1, layer.id))
    }
  })
  return result
}

function collectLayerIds(layers: Layer[]): string[] {
  const ids: string[] = []
  for (const layer of layers) {
    ids.push(layer.id)
    if (layer.children) ids.push(...collectLayerIds(layer.children))
  }
  return ids
}

// ── Main sequence (13.1) ─────────────────────────────────────────────────────
export async function uploadData(
  payload: BackendPayload,
  msgToken: string,
  onProgress?: ProgressFn,
): Promise<UploadResult> {
  const token =
    msgToken || (await figma.clientStorage.getAsync("speclyToken"))
  if (!token) {
    return { success: false, error: "Not authenticated" }
  }

  const projectId = payload.project.id
  let apiCallCount = 0
  const uploadedFrames: UploadedFrameLink[] = []
  const skippedFrames: string[] = []

  try {
    // Decide which frames need a new version before bumping frame_count.
    const frameList = payload.projectFrames.frames
    const framesToUpload: Array<{
      frame: (typeof frameList)[number]
      index: number
      contentHash: string
      section?: string
    }> = []

    for (let index = 0; index < frameList.length; index++) {
      const frame = frameList[index]
      const detail = payload.frames[frame.id]
      if (!detail) {
        framesToUpload.push({ frame, index, contentHash: "" })
        continue
      }
      const image = getPendingImage(frame.id)
      const contentHash = computeFrameContentHash({
        frame,
        detail,
        layers: payload.layers,
        imageBytes: image?.bytes,
      })

      onProgress?.(
        index + 1,
        frameList.length,
        `Checking: ${frame.name}`,
      )

      const latest = await getLatestFrameByName(token, projectId, frame.name)
      apiCallCount++
      const previousHash =
        latest && typeof latest.content_hash === "string"
          ? latest.content_hash
          : null
      const previousSection =
        latest && typeof latest.section === "string" && latest.section
          ? latest.section
          : undefined

      if (previousHash && previousHash === contentHash) {
        skippedFrames.push(frame.name)
        continue
      }
      framesToUpload.push({ frame, index, contentHash, section: previousSection })
    }

    const { nextFrameCount } = await resolveProjectForPublish({
      token,
      selectedProjectId: projectId,
      framesToAdd: framesToUpload.length,
    })
    apiCallCount++ // list projects

    // Progress accounting (project + frames to upload + their layers).
    let layerCount = 0
    for (const { frame } of framesToUpload) {
      const detail = payload.frames[frame.id]
      if (detail) layerCount += collectLayerIds(detail.layers).length
    }
    const totalItems = 1 + framesToUpload.length + layerCount
    let currentItem = 0

    // 1. Update project ────────────────────────────────────────────────────
    onProgress?.(++currentItem, totalItems, `Project: ${payload.project.name}`)
    const exists = await projectExists(token, projectId)
    apiCallCount++
    if (!exists) {
      throw new Error(
        "Selected project no longer exists. Please refresh projects or create one in the dashboard.",
      )
    }
    const projectPatch: { figma_file_url: string; frame_count?: number } = {
      figma_file_url: payload.project.figmaFileUrl,
    }
    // Only bump frame_count when at least one new version is created.
    if (framesToUpload.length > 0) {
      projectPatch.frame_count = nextFrameCount
    }
    await updateProjectRecord(token, projectId, projectPatch)
    apiCallCount++

    // 2. Create frames (changed only) — individual multipart POSTs ─────────
    const frameIdMap: Record<string, string> = {} // Frame.id → backend id
    await runWithConcurrency(
      framesToUpload,
      async ({ frame, index, contentHash, section }) => {
        onProgress?.(++currentItem, totalItems, `Frame: ${frame.name}`)
        const detail = payload.frames[frame.id]
        const image = getPendingImage(frame.id)

        const created = await createFrameRecord(
          token,
          {
            project: projectId,
            name: frame.name,
            width: frame.width,
            height: frame.height,
            figma_url: frame.figmaUrl,
            sort_order: index,
            content_hash: contentHash || undefined,
            section,
            // Only set image_url when there is an external URL and no bytes.
            image_url:
              !image && detail?.imageUrl && !detail.imageUrl.startsWith("__PENDING")
                ? detail.imageUrl
                : undefined,
          },
          image,
        )
        apiCallCount++
        frameIdMap[frame.id] = created.id
        uploadedFrames.push({
          id: created.id,
          name: frame.name,
          url: frameShareUrl(created.id, projectId),
        })
      },
      FRAME_UPLOAD_CONCURRENCY,
    )

    // 3. Create layers via /api/batch (pregenerated ids, depth order) ───────
    const layerIdMap: Record<string, string> = {} // Figma node id → backend id

    interface PreparedLayer {
      originalId: string
      fields: LayerFields
      parentLayerId?: string
      depth: number
    }
    const preparedLayers: PreparedLayer[] = []

    for (const [frameKey, frameDetail] of Object.entries(payload.frames)) {
      const backendFrameId = frameIdMap[frameKey]
      if (!backendFrameId) continue

      const flattened = flattenLayersByLevel(frameDetail.layers)
      for (const item of flattened) {
        const backendId = generateRecordId()
        layerIdMap[item.layer.id] = backendId
        preparedLayers.push({
          originalId: item.layer.id,
          parentLayerId: item.parentLayerId,
          depth: item.depth,
          fields: {
            id: backendId,
            frame: backendFrameId,
            name: item.layer.name,
            type: item.layer.type,
            x: item.layer.x,
            y: item.layer.y,
            width: item.layer.width,
            height: item.layer.height,
            clickable: item.layer.clickable,
            sort_order: item.siblingIndex,
          },
        })
      }
    }

    // Parents before children so same-batch and cross-chunk refs resolve.
    preparedLayers.sort((a, b) => a.depth - b.depth)
    for (const item of preparedLayers) {
      if (item.parentLayerId && layerIdMap[item.parentLayerId]) {
        item.fields.parent = layerIdMap[item.parentLayerId]
      }
    }

    const layerBodies = preparedLayers.map((item) => {
      onProgress?.(++currentItem, totalItems, `Layer: ${item.fields.name}`)
      return item.fields as unknown as Record<string, unknown>
    })
    await createRecordsInBatches(token, "layers", layerBodies)
    apiCallCount += batchHttpCalls(layerBodies.length)

    // 4. Create layer_details via /api/batch ───────────────────────────────
    const detailsToCreate: LayerDetailFields[] = []

    for (const [frameKey, frameDetail] of Object.entries(payload.frames)) {
      if (!frameIdMap[frameKey]) continue
      const layerIds = collectLayerIds(frameDetail.layers)
      for (const layerId of layerIds) {
        const backendLayerId = layerIdMap[layerId]
        const layerDetail = payload.layers[layerId]
        if (backendLayerId && layerDetail) {
          detailsToCreate.push({
            id: generateRecordId(),
            layer: backendLayerId,
            layout: layerDetail.layout,
            styles: layerDetail.styles,
            typography: layerDetail.typography,
            code: layerDetail.code,
          })
        }
      }
    }

    const detailBodies = detailsToCreate.map(
      (d) => d as unknown as Record<string, unknown>,
    )
    await createRecordsInBatches(token, "layer_details", detailBodies)
    apiCallCount += batchHttpCalls(detailBodies.length)

    if (uploadedFrames.length === 0 && skippedFrames.length > 0) {
      figma.notify(
        `Skipped ${skippedFrames.length} frame(s) — no changes detected`,
      )
    } else if (skippedFrames.length > 0) {
      figma.notify(
        `🚀 Published ${uploadedFrames.length}; skipped ${skippedFrames.length} unchanged (${apiCallCount} API calls)`,
      )
    } else {
      figma.notify(`🚀 Published successfully! (${apiCallCount} API calls)`)
    }

    return {
      success: true,
      apiCallCount,
      uploadedFrames,
      skippedFrames,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
