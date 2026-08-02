import { pb } from "../pocketbase"
import { resolveOwnerUserId } from "../auth"
import { framesByNameFilter, projectFilter, escapeFilterValue } from "../pb-filter"
import type { Foundation, Frame, Layer, LayerDetail, Project } from "../types"

// ─── Projects ───────────────────────────────────────────────
/** All projects visible to the signed-in user (admins + developers). */
export async function getUserProjects(): Promise<Project[]> {
  if (!pb.authStore.isValid) return []
  return pb.collection("projects").getFullList<Project>({
    sort: "-updated",
    // Allow concurrent callers (layout + page) without autocancelling each other.
    requestKey: null,
  })
}

export async function getUserProjectById(id: string): Promise<Project> {
  return pb.collection("projects").getOne<Project>(id)
}

export async function createUserProject(data: {
  name?: string
  thumbnail_url?: string
  figma_file_url?: string
  frame_count?: number
}): Promise<Project> {
  const owner = await resolveOwnerUserId({ createIfMissing: true })
  return pb.collection("projects").create<Project>({
    owner,
    name: data.name ?? "Untitled",
    thumbnail_url: data.thumbnail_url,
    figma_file_url: data.figma_file_url,
    frame_count: data.frame_count ?? 0,
  })
}

export async function updateUserProject(data: {
  id: string
  name?: string
  thumbnail_url?: string
  figma_file_url?: string
  frame_count?: number
}): Promise<Project> {
  return pb.collection("projects").update<Project>(data.id, {
    name: data.name,
    thumbnail_url: data.thumbnail_url,
    figma_file_url: data.figma_file_url,
    frame_count: data.frame_count,
  })
}

export async function deleteUserProject(id: string): Promise<boolean> {
  try {
    await pb.collection("projects").delete(id)
    return true
  } catch {
    return false
  }
}

// ─── Frames ─────────────────────────────────────────────────
const frameExpand = "project.owner"

export async function getFrame(frameId: string): Promise<Frame | null> {
  try {
    return await pb.collection("frames").getOne<Frame>(frameId, { expand: frameExpand })
  } catch {
    return null
  }
}

export async function getProjectFrames(projectId: string): Promise<Frame[]> {
  return pb.collection("frames").getFullList<Frame>({
    filter: projectFilter(projectId),
    sort: "-updated,-created",
    expand: frameExpand,
  })
}

/** All versions of a screen (same project + name). */
export async function getFramesByName(projectId: string, name: string): Promise<Frame[]> {
  return pb.collection("frames").getFullList<Frame>({
    filter: framesByNameFilter(projectId, name),
    sort: "-updated,-created",
    expand: frameExpand,
  })
}

export async function updateFrame(data: {
  id: string
  name?: string
  figma_url?: string
}): Promise<Frame> {
  return pb.collection("frames").update<Frame>(data.id, {
    name: data.name,
    figma_url: data.figma_url,
  })
}

export async function deleteFrame(id: string): Promise<boolean> {
  try {
    await pb.collection("frames").delete(id)
    return true
  } catch (error) {
    console.error("Error deleting frame:", error)
    return false
  }
}

// ─── Layers ─────────────────────────────────────────────────
export async function getLayersByFrame(frameId: string): Promise<Layer[]> {
  return pb.collection("layers").getFullList<Layer>({
    filter: `frame = "${escapeFilterValue(frameId)}"`,
    sort: "sort_order",
  })
}

export async function getLayer(layerId: string): Promise<Layer | null> {
  try {
    return await pb.collection("layers").getOne<Layer>(layerId)
  } catch {
    return null
  }
}

// ─── Layer Details ──────────────────────────────────────────
export async function getLayerDetails(layerId: string): Promise<LayerDetail | null> {
  try {
    return await pb
      .collection("layer_details")
      .getFirstListItem<LayerDetail>(`layer = "${escapeFilterValue(layerId)}"`)
  } catch {
    return null
  }
}

/** Batch-fetch padding for many layers in one filtered query (avoids N+1). */
export async function getLayerPaddingMap(
  layerIds: string[]
): Promise<Record<string, { padding?: { top: number; right: number; bottom: number; left: number } }>> {
  if (layerIds.length === 0) return {}
  const filter = layerIds.map((id) => `layer = "${escapeFilterValue(id)}"`).join(" || ")
  const details = await pb.collection("layer_details").getFullList<LayerDetail>({ filter })
  const map: Record<string, { padding?: { top: number; right: number; bottom: number; left: number } }> = {}
  for (const d of details) {
    if (d.layout?.padding) map[d.layer] = { padding: d.layout.padding }
  }
  return map
}

// ─── Foundations (readable by all; written by admins) ───────
export async function getUserFoundations(): Promise<Foundation | null> {
  if (!pb.authStore.isValid) return null
  try {
    const ownerId = await resolveOwnerUserId()
    return await pb.collection("foundations").getFirstListItem<Foundation>(
      `owner = "${ownerId}"`,
      { requestKey: null },
    )
  } catch {
    // Developers (and admins without a row yet) see the latest shared set.
    try {
      const rows = await pb.collection("foundations").getList<Foundation>(1, 1, {
        sort: "-updated",
        requestKey: null,
      })
      return rows.items[0] ?? null
    } catch {
      return null
    }
  }
}
