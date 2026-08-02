import type { Project } from "../types.js"
import { getPb } from "../pb.js"

export async function listProjects() {
  const pb = getPb()
  const projects = await pb.collection("projects").getFullList<Project>({
    sort: "-updated",
  })

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      frame_count: p.frame_count,
      updated: p.updated,
      figma_file_url: p.figma_file_url,
    })),
  }
}
