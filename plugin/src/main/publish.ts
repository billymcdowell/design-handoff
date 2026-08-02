/// <reference types="@figma/plugin-typings" />

// ─── Publish pipeline: Figma selection → BackendPayload ────────────────────

import {
  FRAME_PROCESSING_CONCURRENCY,
  MAX_DIMENSIONS,
  MAX_FILE_SIZE,
  PLACEHOLDER_THUMBNAIL,
} from "../constants"
import type {
  BackendPayload,
  Frame,
  FrameDetail,
  Layer,
  LayerDetail,
  Project,
} from "../types"
import { batchLoadFonts, processFramesInParallel } from "./concurrency"
import {
  isNodeVisibleInFrame,
  nodeToLayer,
  nodeToLayerDetail,
} from "./cssEngine"
import { clearPendingImages, setPendingImage } from "./imageStore"

const VALID_FRAME_TYPES = ["FRAME", "COMPONENT", "INSTANCE"]

export function isPublishableFrame(node: SceneNode): boolean {
  return VALID_FRAME_TYPES.includes(node.type)
}

type ProgressFn = (current: number, total: number, message: string) => void

// 10.3 ── exportFramePng — dimension-fallback ladder under MAX_FILE_SIZE ─────
export async function exportFramePng(frame: SceneNode): Promise<Uint8Array> {
  const estimatedPixelCount = frame.width * frame.height
  let startIndex = 0
  if (estimatedPixelCount > 8_000_000) startIndex = 2
  else if (estimatedPixelCount > 4_000_000) startIndex = 1

  const lastIndex = MAX_DIMENSIONS.length - 1

  for (let attempt = startIndex; attempt <= lastIndex; attempt++) {
    const MAX_DIMENSION = MAX_DIMENSIONS[attempt]

    let constraint: ExportSettingsImage["constraint"]
    if (frame.width > MAX_DIMENSION || frame.height > MAX_DIMENSION) {
      constraint =
        frame.width > frame.height
          ? { type: "WIDTH", value: MAX_DIMENSION }
          : { type: "HEIGHT", value: MAX_DIMENSION }
    } else if (attempt === startIndex) {
      constraint = { type: "SCALE", value: 2 } // retina
    } else {
      constraint =
        frame.width > frame.height
          ? { type: "WIDTH", value: MAX_DIMENSION }
          : { type: "HEIGHT", value: MAX_DIMENSION }
    }

    try {
      const bytes = await (frame as ExportMixin).exportAsync({
        format: "PNG",
        constraint,
      })

      if (bytes.length > MAX_FILE_SIZE) {
        if (attempt < lastIndex) continue
        const mb = (bytes.length / (1024 * 1024)).toFixed(2)
        throw new Error(
          `Image file size (${mb} MB) is too large even at minimum resolution. Maximum allowed: 4.5 MB.`,
        )
      }

      return bytes
    } catch (exportError) {
      const msg = exportError instanceof Error ? exportError.message : String(exportError)
      if (msg.includes("too large") && attempt < lastIndex) continue
      throw exportError
    }
  }

  throw new Error(
    `Failed to export image for frame "${frame.name}" within size limit after multiple attempts.`,
  )
}

// 9.6 ── processLayerDetailsRecursively ──────────────────────────────────────
async function processLayerDetailsRecursively(
  node: SceneNode,
  parentFrame: SceneNode,
  sink: Record<string, LayerDetail>,
): Promise<void> {
  if (!isNodeVisibleInFrame(node, parentFrame)) return

  const layerDetail = await nodeToLayerDetail(node, parentFrame)
  if (layerDetail) sink[layerDetail.id] = layerDetail

  if ("children" in node && node.children.length > 0) {
    await Promise.all(
      node.children.map((child) =>
        processLayerDetailsRecursively(child, parentFrame, sink),
      ),
    )
  }
}

interface FrameProcessingResult {
  frameEntry: Frame
  frameDetail: FrameDetail
}

// 9.4 ── createBackendPayload ────────────────────────────────────────────────
export async function createBackendPayload(
  frames: SceneNode[],
  selectedProjectId: string,
  _token: string,
  onProgress?: ProgressFn,
): Promise<BackendPayload> {
  if (frames.length === 0) throw new Error("No frames selected")

  clearPendingImages()

  // Build file URL.
  const fileKey = figma.fileKey
  let fileUrl: string
  if (fileKey) {
    fileUrl = `https://figma.com/file/${fileKey}`
  } else {
    console.warn(
      "File not saved to Figma servers — using placeholder file URL.",
    )
    fileUrl = "https://figma.com/file/unknown"
  }

  const project: Project = {
    id: selectedProjectId,
    name: figma.root.name || "Untitled Project",
    thumbnail: PLACEHOLDER_THUMBNAIL,
    figmaFileUrl: fileUrl,
    frameCount: frames.length,
    lastUpdated: new Date().toISOString(),
    createdBy: "Figma User",
  }

  const projectFrames: Frame[] = []
  const framesDetail: Record<string, FrameDetail> = {}
  const layersDetail: Record<string, LayerDetail> = {}
  const frameProcessingResults: FrameProcessingResult[] = []

  const validFrames = frames.filter(isPublishableFrame)
  const totalSteps = 1 + validFrames.length + validFrames.length
  let currentStep = 0

  // Pre-load fonts.
  onProgress?.(0, totalSteps, "Pre-loading fonts...")
  await batchLoadFonts(frames)
  currentStep++

  // Process frames (concurrency 3).
  await processFramesInParallel(
    validFrames,
    async (frame, index) => {
      onProgress?.(
        currentStep + index + 1,
        totalSteps,
        `Processing ${frame.name} (${index + 1}/${validFrames.length})...`,
      )

      const frameId = `frame_${frame.id.replace(/[:;]/g, "_")}`
      const frameUrl = `${fileUrl}?node-id=${frame.id.replace(/[:;]/g, "-")}`
      const thumbnail = `/placeholder.svg?height=${Math.round(
        frame.height,
      )}&width=${Math.round(frame.width)}`
      const fileName = `${frame.name.replace(/[^a-z0-9]/gi, "_")}_${frame.id.replace(
        /[:;]/g,
        "_",
      )}.png`

      const imageBytes = await exportFramePng(frame)
      setPendingImage(frameId, { bytes: imageBytes, fileName })

      const frameEntry: Frame = {
        id: frameId,
        name: frame.name,
        width: Math.round(frame.width),
        height: Math.round(frame.height),
        thumbnail,
        figmaUrl: frameUrl,
      }

      let layers: Layer[] = []
      if ("children" in frame && frame.children.length > 0) {
        const visibleChildren = frame.children.filter((child) =>
          isNodeVisibleInFrame(child, frame),
        )
        layers = visibleChildren
          .map((child) => nodeToLayer(child, frame))
          .filter((l): l is Layer => l !== null)
        await Promise.all(
          visibleChildren.map((child) =>
            processLayerDetailsRecursively(child, frame, layersDetail),
          ),
        )
      }

      const frameDetail: FrameDetail = {
        ...frameEntry,
        imageUrl: `__PENDING_UPLOAD__${frameId}`,
        layers,
      }

      frameProcessingResults.push({ frameEntry, frameDetail })
    },
    FRAME_PROCESSING_CONCURRENCY,
  )

  currentStep += validFrames.length

  // Combine results (images are attached during the upload step, straight to
  // the frames.image file field — no separate upload endpoint).
  for (const result of frameProcessingResults) {
    projectFrames.push(result.frameEntry)
    framesDetail[result.frameEntry.id] = result.frameDetail
  }

  onProgress?.(totalSteps, totalSteps, "Design serialized.")

  return {
    project,
    projectFrames: { projectId: selectedProjectId, frames: projectFrames },
    frames: framesDetail,
    layers: layersDetail,
  }
}
