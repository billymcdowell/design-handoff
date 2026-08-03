import { pb } from "../pocketbase"
import { resolveOwnerUserId } from "../auth"
import { framesByNameFilter, projectFilter, escapeFilterValue } from "../pb-filter"
import { removeFoundationSourceFromData } from "@/features/foundations/catalog"
import type { Foundation, FoundationsData, Frame, Layer, LayerDetail, Project, Section } from "../types"

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

// ─── Sections ───────────────────────────────────────────────
export async function getProjectSections(projectId: string): Promise<Section[]> {
  return pb.collection("sections").getFullList<Section>({
    filter: projectFilter(projectId),
    sort: "sort_order,name",
  })
}

export async function createSection(data: {
  project: string
  name: string
  sort_order?: number
}): Promise<Section> {
  return pb.collection("sections").create<Section>({
    project: data.project,
    name: data.name,
    sort_order: data.sort_order ?? 0,
  })
}

export async function updateSection(data: {
  id: string
  name?: string
  sort_order?: number
}): Promise<Section> {
  return pb.collection("sections").update<Section>(data.id, {
    name: data.name,
    sort_order: data.sort_order,
  })
}

export async function deleteSection(id: string): Promise<boolean> {
  try {
    await pb.collection("sections").delete(id)
    return true
  } catch {
    return false
  }
}

// ─── Frames ─────────────────────────────────────────────────
const frameExpand = "project.owner,section"

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
  section?: string | null
}): Promise<Frame> {
  return pb.collection("frames").update<Frame>(data.id, {
    name: data.name,
    figma_url: data.figma_url,
    ...(data.section !== undefined ? { section: data.section || "" } : {}),
  })
}

/** Assign every version of a screen (project + name) to a section (or clear it). */
export async function setScreenSection(
  projectId: string,
  frameName: string,
  sectionId: string | null,
): Promise<void> {
  const versions = await getFramesByName(projectId, frameName)
  await Promise.all(
    versions.map((frame) =>
      pb.collection("frames").update(frame.id, { section: sectionId || "" }),
    ),
  )
}

/** Move multiple screens (by name) into a section. Dedupes names. */
export async function setScreensSection(
  projectId: string,
  frameNames: string[],
  sectionId: string | null,
): Promise<void> {
  const unique = new Set(frameNames.filter(Boolean))
  if (unique.size === 0) return
  const all = await getProjectFrames(projectId)
  const toUpdate = all.filter((frame) => unique.has(frame.name))
  // Sequential batches avoid PocketBase autocancel races on many parallel writes.
  const chunkSize = 8
  for (let i = 0; i < toUpdate.length; i += chunkSize) {
    const chunk = toUpdate.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map((frame) =>
        pb.collection("frames").update(frame.id, { section: sectionId || "" }),
      ),
    )
  }
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

export async function updateFoundationRecord(
  id: string,
  body: {
    data: FoundationsData
    variables_count: number
    styles_count: number
  },
): Promise<Foundation> {
  return await pb.collection("foundations").update<Foundation>(id, body)
}

export async function removeFoundationSource(
  foundation: Foundation,
  fileKey: string,
): Promise<Foundation> {
  const result = removeFoundationSourceFromData(foundation.data, fileKey)
  if (!result.historyEntry) return foundation
  return await updateFoundationRecord(foundation.id, {
    data: result.data,
    variables_count: result.counts.variables_count,
    styles_count: result.counts.styles_count,
  })
}
