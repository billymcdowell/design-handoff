// ─── UPLOAD_DATA: BackendPayload → stock PocketBase records ────────────────
// Replaces the plan's /bulk endpoints with looped record creates against the
// stock records API, in dependency order: project → frames → layers (by depth)
// → layer_details. Relations use native field names (project, frame, parent,
// layer). Frames are always CREATED (each is a new version snapshot).

import type { BackendPayload, Layer } from "../types"
import { runWithConcurrency } from "./concurrency"
import { getPendingImage } from "./imageStore"
import {
  createFrameRecord,
  createLayerDetailRecord,
  createLayerRecord,
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

  try {
    const { nextFrameCount } = await resolveProjectForPublish({
      token,
      selectedProjectId: projectId,
      framesToAdd: payload.projectFrames.frames.length,
    })
    apiCallCount++ // list projects

    // Progress accounting.
    const frameCount = payload.projectFrames.frames.length
    let layerCount = 0
    for (const frame of Object.values(payload.frames)) {
      layerCount += collectLayerIds(frame.layers).length
    }
    const totalItems = 1 + frameCount + layerCount
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
    await updateProjectRecord(token, projectId, {
      figma_file_url: payload.project.figmaFileUrl,
      frame_count: nextFrameCount,
    })
    apiCallCount++

    // 2. Create frames ──────────────────────────────────────────────────────
    const frameIdMap: Record<string, string> = {} // Frame.id → backend id
    const frameList = payload.projectFrames.frames
    await runWithConcurrency(
      frameList,
      async (frame, index) => {
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
      },
      3,
    )

    // 3. Create layers, level by level ──────────────────────────────────────
    const layerIdMap: Record<string, string> = {} // Figma node id → backend id

    interface LevelItem {
      originalId: string
      frameBackendId: string
      fields: LayerFields
      parentLayerId?: string
    }
    const byLevel = new Map<number, LevelItem[]>()

    for (const [frameKey, frameDetail] of Object.entries(payload.frames)) {
      const backendFrameId = frameIdMap[frameKey]
      if (!backendFrameId) continue

      const flattened = flattenLayersByLevel(frameDetail.layers)
      for (const item of flattened) {
        const fields: LayerFields = {
          frame: backendFrameId,
          name: item.layer.name,
          type: item.layer.type,
          x: item.layer.x,
          y: item.layer.y,
          width: item.layer.width,
          height: item.layer.height,
          clickable: item.layer.clickable,
          sort_order: item.siblingIndex,
        }
        const list = byLevel.get(item.depth) ?? []
        list.push({
          originalId: item.layer.id,
          frameBackendId: backendFrameId,
          fields,
          parentLayerId: item.parentLayerId,
        })
        byLevel.set(item.depth, list)
      }
    }

    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b)
    for (const level of sortedLevels) {
      const items = byLevel.get(level)!
      await runWithConcurrency(
        items,
        async (item) => {
          if (item.parentLayerId && layerIdMap[item.parentLayerId]) {
            item.fields.parent = layerIdMap[item.parentLayerId]
          }
          onProgress?.(++currentItem, totalItems, `Layer: ${item.fields.name}`)
          const created = await createLayerRecord(token, item.fields)
          apiCallCount++
          layerIdMap[item.originalId] = created.id
        },
        5,
      )
    }

    // 4. Create layer_details ───────────────────────────────────────────────
    interface DetailItem {
      layer: string
      layout: unknown
      styles: unknown
      typography: unknown
      code: unknown
    }
    const detailsToCreate: DetailItem[] = []

    for (const frameDetail of Object.values(payload.frames)) {
      const layerIds = collectLayerIds(frameDetail.layers)
      for (const layerId of layerIds) {
        const backendLayerId = layerIdMap[layerId]
        const layerDetail = payload.layers[layerId]
        if (backendLayerId && layerDetail) {
          detailsToCreate.push({
            layer: backendLayerId,
            layout: layerDetail.layout,
            styles: layerDetail.styles,
            typography: layerDetail.typography,
            code: layerDetail.code,
          })
        }
      }
    }

    await runWithConcurrency(
      detailsToCreate,
      async (detail) => {
        await createLayerDetailRecord(token, detail)
        apiCallCount++
      },
      5,
    )

    figma.notify(`🚀 Published successfully! (${apiCallCount} API calls)`)
    return { success: true, apiCallCount }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
