import { pb } from "../pocketbase"
import { resolveOwnerUserId } from "../auth"
import { framesByNameFilter, projectFilter, escapeFilterValue } from "../pb-filter"
import { removeFoundationSourceFromData } from "@/features/foundations/catalog"
import { removeComponentLibrarySourceFromData } from "@/features/components/catalog"
import type {
  ComponentLibrariesData,
  ComponentLibrary,
  Feedback,
  FeedbackType,
  Foundation,
  FoundationsData,
  Frame,
  Layer,
  LayerDetail,
  LibraryComponent,
  LibraryComponentVariantRecord,
  Project,
  Section,
} from "../types"

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

export type LayerDetailSummary = {
  padding?: { top: number; right: number; bottom: number; left: number }
  component?: LayerDetail["component"]
}

/** Batch-fetch padding + component specs for many layers in one filtered query (avoids N+1). */
export async function getLayerPaddingMap(
  layerIds: string[]
): Promise<Record<string, LayerDetailSummary>> {
  if (layerIds.length === 0) return {}
  const filter = layerIds.map((id) => `layer = "${escapeFilterValue(id)}"`).join(" || ")
  const details = await pb.collection("layer_details").getFullList<LayerDetail>({ filter })
  const map: Record<string, LayerDetailSummary> = {}
  for (const d of details) {
    const padding = d.layout?.padding
    const component = d.component
    if (!padding && !component) continue
    map[d.layer] = {
      ...(padding ? { padding } : {}),
      ...(component ? { component } : {}),
    }
  }
  return map
}

// ─── Foundations (single-tenant singleton; readable by all; designers write) ─

/** Fixed singleton key for this deploy. */
export const SHARED_FOUNDATIONS_SLUG = "default"

export async function getSharedFoundations(): Promise<Foundation | null> {
  if (!pb.authStore.isValid) return null
  try {
    return await pb.collection("foundations").getFirstListItem<Foundation>(
      `slug = "${SHARED_FOUNDATIONS_SLUG}"`,
      { requestKey: null },
    )
  } catch {
    return null
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

// ─── Components library (singleton meta + library_components rows) ───────────

export const SHARED_COMPONENT_LIBRARIES_SLUG = "default"

export async function getSharedComponentLibrary(): Promise<ComponentLibrary | null> {
  if (!pb.authStore.isValid) return null
  try {
    return await pb
      .collection("component_libraries")
      .getFirstListItem<ComponentLibrary>(
        `slug = "${SHARED_COMPONENT_LIBRARIES_SLUG}"`,
        { requestKey: null },
      )
  } catch {
    return null
  }
}

export async function listLibraryComponents(): Promise<LibraryComponent[]> {
  if (!pb.authStore.isValid) return []
  return pb.collection("library_components").getFullList<LibraryComponent>({
    sort: "name",
    requestKey: null,
  })
}

export async function getLibraryComponentByKey(
  key: string,
): Promise<LibraryComponent | null> {
  if (!pb.authStore.isValid || !key) return null
  try {
    return await pb
      .collection("library_components")
      .getFirstListItem<LibraryComponent>(
        `key = "${escapeFilterValue(key)}"`,
        { requestKey: null },
      )
  } catch {
    return null
  }
}

export async function listLibraryComponentVariants(
  libraryComponentId: string,
): Promise<LibraryComponentVariantRecord[]> {
  if (!pb.authStore.isValid || !libraryComponentId) return []
  return pb
    .collection("library_component_variants")
    .getFullList<LibraryComponentVariantRecord>({
      filter: `library_component = "${escapeFilterValue(libraryComponentId)}"`,
      sort: "name",
      requestKey: null,
    })
}

export async function updateComponentLibraryRecord(
  id: string,
  body: {
    data: ComponentLibrariesData
    components_count: number
  },
): Promise<ComponentLibrary> {
  return await pb.collection("component_libraries").update<ComponentLibrary>(id, body)
}

export async function removeComponentLibrarySource(
  library: ComponentLibrary,
  fileKey: string,
): Promise<ComponentLibrary> {
  const result = removeComponentLibrarySourceFromData(library.data, fileKey)
  if (!result.historyEntry) return library

  for (const key of result.deleteKeys) {
    try {
      const row = await getLibraryComponentByKey(key)
      if (row) await pb.collection("library_components").delete(row.id)
    } catch {
      /* best-effort cleanup */
    }
  }

  return await updateComponentLibraryRecord(library.id, {
    data: result.data,
    components_count: result.componentsCount,
  })
}

/**
 * Find published layer usages of a catalog component on latest frame versions.
 * Matches mainComponentKey, componentSetKey, or componentKey on layer_details.component.
 */
export async function findComponentUsages(componentKey: string): Promise<
  Array<{
    layerId: string
    layerName: string
    frameId: string
    frameName: string
    pageName?: string
    projectId: string
    projectName: string
    variantProperties?: Record<string, string>
  }>
> {
  if (!componentKey) return []

  const escaped = escapeFilterValue(componentKey)
  // PocketBase JSON path filters — try several identity fields.
  const filter = [
    `component.mainComponentKey = "${escaped}"`,
    `component.componentSetKey = "${escaped}"`,
    `component.componentKey = "${escaped}"`,
  ].join(" || ")

  let details: LayerDetail[] = []
  try {
    details = await pb.collection("layer_details").getFullList<LayerDetail>({
      filter,
      requestKey: null,
    })
  } catch {
    // Fallback: scan a page of recent details if JSON filters unsupported
    try {
      const page = await pb.collection("layer_details").getList<LayerDetail>(1, 500, {
        requestKey: null,
      })
      details = page.items.filter((d) => {
        const c = d.component
        if (!c) return false
        return (
          c.mainComponentKey === componentKey ||
          c.componentSetKey === componentKey ||
          c.componentKey === componentKey
        )
      })
    } catch {
      return []
    }
  }

  if (details.length === 0) return []

  const layerIds = [...new Set(details.map((d) => d.layer))]
  const layers = await Promise.all(
    layerIds.map(async (id) => {
      try {
        return await pb.collection("layers").getOne<Layer>(id)
      } catch {
        return null
      }
    }),
  )
  const layerById = new Map(
    layers.filter((l): l is Layer => !!l).map((l) => [l.id, l]),
  )

  const frameIds = [...new Set([...layerById.values()].map((l) => l.frame))]
  const frames = await Promise.all(
    frameIds.map(async (id) => {
      try {
        return await pb.collection("frames").getOne<Frame>(id, { expand: "project" })
      } catch {
        return null
      }
    }),
  )
  const frameById = new Map(
    frames.filter((f): f is Frame => !!f).map((f) => [f.id, f]),
  )

  // Keep usages on latest version only (per project+name).
  const latestByScreen = new Map<string, Frame>()
  for (const frame of frameById.values()) {
    const screenKey = `${frame.project}::${frame.name}`
    const prev = latestByScreen.get(screenKey)
    if (!prev) {
      latestByScreen.set(screenKey, frame)
      continue
    }
    const prevTime = new Date(prev.updated || prev.created || 0).getTime()
    const nextTime = new Date(frame.updated || frame.created || 0).getTime()
    if (nextTime >= prevTime) latestByScreen.set(screenKey, frame)
  }
  const latestFrameIds = new Set([...latestByScreen.values()].map((f) => f.id))

  const detailByLayer = new Map(details.map((d) => [d.layer, d]))
  const usages: Array<{
    layerId: string
    layerName: string
    frameId: string
    frameName: string
    pageName?: string
    projectId: string
    projectName: string
    variantProperties?: Record<string, string>
  }> = []

  for (const layer of layerById.values()) {
    if (!latestFrameIds.has(layer.frame)) continue
    const frame = frameById.get(layer.frame)
    if (!frame) continue
    const detail = detailByLayer.get(layer.id)
    const expand = frame.expand as { project?: Project } | undefined
    const projectName =
      expand?.project?.name ??
      (typeof frame.project === "string" ? frame.project : "Project")
    usages.push({
      layerId: layer.id,
      layerName: layer.name,
      frameId: frame.id,
      frameName: frame.name,
      pageName: frame.page_name,
      projectId: frame.project,
      projectName,
      variantProperties: detail?.component?.variantProperties,
    })
  }

  usages.sort((a, b) => {
    const p = a.projectName.localeCompare(b.projectName)
    if (p !== 0) return p
    return a.frameName.localeCompare(b.frameName)
  })
  return usages
}

// ─── Feedback (create by any authed user; Admin reads in PocketBase) ─
export async function createFeedback(data: {
  type: FeedbackType
  message: string
  page?: string
}): Promise<Feedback> {
  const author = await resolveOwnerUserId({ createIfMissing: true })
  return pb.collection("feedback").create<Feedback>({
    author,
    type: data.type,
    message: data.message,
    page: data.page,
  })
}
