// ─── Project fetch/mapping + publish-time project resolution ───────────────

import { PLACEHOLDER_THUMBNAIL } from "../constants"
import type { Project } from "../types"
import { listProjectRecords, PBRecord } from "./pbClient"

/** Map a stock PocketBase `projects` record → the plugin's Project shape. */
export function mapProjectRecord(item: PBRecord): Project {
  return {
    id: item.id,
    name: (item.name as string) || "Untitled Project",
    thumbnail: (item.thumbnail_url as string) || PLACEHOLDER_THUMBNAIL,
    figmaFileUrl: (item.figma_file_url as string) || "",
    frameCount: (item.frame_count as number) || 0,
    lastUpdated:
      (item.updated as string) || (item.created as string) || "",
    createdBy: "User",
  }
}

export async function fetchProjectsFromApi(token: string): Promise<Project[]> {
  const records = await listProjectRecords(token)
  return records.map(mapProjectRecord)
}

export interface ProjectResolveResult {
  selectedProject: Project
  existingFrameCount: number
  nextFrameCount: number
}

/** Resolve the selected project and compute the next frame count for upload. */
export async function resolveProjectForPublish(args: {
  token: string
  selectedProjectId: string
  framesToAdd: number
}): Promise<ProjectResolveResult> {
  const { token, selectedProjectId, framesToAdd } = args
  const projects = await fetchProjectsFromApi(token)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  if (!selectedProject) {
    throw new Error(
      "Selected project not found. Please refresh projects and try again.",
    )
  }

  const existingFrameCount = selectedProject.frameCount || 0
  const nextFrameCount = existingFrameCount + framesToAdd

  return { selectedProject, existingFrameCount, nextFrameCount }
}
