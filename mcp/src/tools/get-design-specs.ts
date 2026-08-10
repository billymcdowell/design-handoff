import type { Frame, Project } from "../types.js"
import { frameLayersFilter } from "../filter.js"
import { getPb } from "../pb.js"
import { parseFrameUrl } from "../url.js"
import type { CodeFormat, Layer } from "../types.js"
import { fetchLayerDetailsMap, mergeLayersWithDetails } from "./shared.js"

export type GetDesignSpecsArgs = {
  url?: string
  frame_id?: string
  include_code?: boolean
  code_formats?: CodeFormat[]
}

const ALL_CODE_FORMATS: CodeFormat[] = ["css", "tailwind", "react"]

export async function getDesignSpecs(args: GetDesignSpecsArgs) {
  const frameId = resolveFrameId(args)
  const includeCode = args.include_code !== false
  const codeFormats =
    args.code_formats && args.code_formats.length > 0
      ? args.code_formats
      : ALL_CODE_FORMATS

  const pb = getPb()

  let frame: Frame
  try {
    frame = await pb.collection("frames").getOne<Frame>(frameId, {
      expand: "project",
    })
  } catch {
    throw new Error(`Frame not found: ${frameId}`)
  }

  const layers = await pb.collection("layers").getFullList<Layer>({
    filter: frameLayersFilter(frameId),
    sort: "sort_order",
  })

  const detailsMap = await fetchLayerDetailsMap(layers.map((l) => l.id))
  const merged = mergeLayersWithDetails(layers, detailsMap, {
    includeCode,
    codeFormats,
  })

  const projectExpand = frame.expand?.project
  const project: Pick<Project, "id" | "name"> | null = projectExpand
    ? { id: projectExpand.id, name: projectExpand.name }
    : frame.project
      ? { id: frame.project, name: "" }
      : null

  // If expand didn't populate the name, try a lightweight fetch
  if (project && !project.name && frame.project) {
    try {
      const p = await pb.collection("projects").getOne<Project>(frame.project)
      project.name = p.name
    } catch {
      // leave name empty
    }
  }

  return {
    frame: {
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      project: frame.project,
      figma_url: frame.figma_url,
      image_url: frame.image_url,
      page_name: frame.page_name,
    },
    project,
    layer_count: merged.length,
    layers: merged,
  }
}

function resolveFrameId(args: GetDesignSpecsArgs): string {
  if (args.frame_id?.trim()) {
    return args.frame_id.trim()
  }
  if (args.url?.trim()) {
    return parseFrameUrl(args.url).frameId
  }
  throw new Error("Provide either url or frame_id")
}
