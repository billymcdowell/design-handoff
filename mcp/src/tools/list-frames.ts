import type { Frame } from "../types.js"
import { projectFilter } from "../filter.js"
import { getPb } from "../pb.js"

export async function listFrames(projectId: string) {
  const pb = getPb()
  const frames = await pb.collection("frames").getFullList<Frame>({
    filter: projectFilter(projectId),
    sort: "-updated,-created",
  })

  return {
    project_id: projectId,
    frames: frames.map((f) => ({
      id: f.id,
      name: f.name,
      section: f.section || null,
      width: f.width,
      height: f.height,
      updated: f.updated,
      created: f.created,
      figma_url: f.figma_url,
      image_url: f.image_url,
      page_name: f.page_name,
      url_path: `/frame/${f.id}?projectId=${projectId}`,
    })),
  }
}
