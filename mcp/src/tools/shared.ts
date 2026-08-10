import type { CodeFormat, Layer, LayerDetail, LayerSpecs, SpecLayer } from "../types.js"
import { layersOrFilter } from "../filter.js"
import { getPb } from "../pb.js"

const DETAIL_CHUNK_SIZE = 50

export function toLayerSpecs(
  detail: LayerDetail | undefined,
  options: { includeCode: boolean; codeFormats: CodeFormat[] }
): LayerSpecs | null {
  if (!detail) return null

  const specs: LayerSpecs = {
    layout: detail.layout,
    styles: detail.styles,
    typography: detail.typography ?? null,
    component: detail.component,
  }

  if (options.includeCode && detail.code) {
    const code: NonNullable<LayerSpecs["code"]> = {}
    for (const format of options.codeFormats) {
      const value = detail.code[format]
      if (value !== undefined) code[format] = value
    }
    if (Object.keys(code).length > 0) specs.code = code
  }

  return specs
}

export function mergeLayersWithDetails(
  layers: Layer[],
  detailsByLayerId: Map<string, LayerDetail>,
  options: { includeCode: boolean; codeFormats: CodeFormat[] }
): SpecLayer[] {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    parent: layer.parent,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    sort_order: layer.sort_order,
    figma_node_id: layer.figma_node_id,
    specs: toLayerSpecs(detailsByLayerId.get(layer.id), options),
  }))
}

/** Batch-fetch layer_details for many layer ids (chunked OR filters). */
export async function fetchLayerDetailsMap(
  layerIds: string[]
): Promise<Map<string, LayerDetail>> {
  const pb = getPb()
  const map = new Map<string, LayerDetail>()
  if (layerIds.length === 0) return map

  for (let i = 0; i < layerIds.length; i += DETAIL_CHUNK_SIZE) {
    const chunk = layerIds.slice(i, i + DETAIL_CHUNK_SIZE)
    const filter = layersOrFilter(chunk)
    const details = await pb.collection("layer_details").getFullList<LayerDetail>({
      filter,
    })
    for (const d of details) {
      map.set(d.layer, d)
    }
  }

  return map
}
