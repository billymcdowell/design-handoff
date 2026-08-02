import type { Layer, LayerDetail } from "../types.js"
import { layerFilter } from "../filter.js"
import { getPb } from "../pb.js"
import { toLayerSpecs } from "./shared.js"
import type { CodeFormat } from "../types.js"

export type GetLayerSpecsArgs = {
  layer_id: string
  include_code?: boolean
  code_formats?: CodeFormat[]
}

const ALL_CODE_FORMATS: CodeFormat[] = ["css", "tailwind", "react"]

export async function getLayerSpecs(args: GetLayerSpecsArgs) {
  const layerId = args.layer_id.trim()
  if (!layerId) throw new Error("layer_id is required")

  const includeCode = args.include_code !== false
  const codeFormats =
    args.code_formats && args.code_formats.length > 0
      ? args.code_formats
      : ALL_CODE_FORMATS

  const pb = getPb()

  let layer: Layer
  try {
    layer = await pb.collection("layers").getOne<Layer>(layerId)
  } catch {
    throw new Error(`Layer not found: ${layerId}`)
  }

  let detail: LayerDetail | undefined
  try {
    detail = await pb
      .collection("layer_details")
      .getFirstListItem<LayerDetail>(layerFilter(layerId))
  } catch {
    detail = undefined
  }

  return {
    layer: {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      parent: layer.parent,
      frame: layer.frame,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      sort_order: layer.sort_order,
      specs: toLayerSpecs(detail, { includeCode, codeFormats }),
    },
  }
}
