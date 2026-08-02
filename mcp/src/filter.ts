/** Escape user input before interpolating into a PocketBase filter string. */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function projectFilter(projectId: string): string {
  return `project = "${escapeFilterValue(projectId)}"`
}

export function layerFilter(layerId: string): string {
  return `layer = "${escapeFilterValue(layerId)}"`
}

export function frameLayersFilter(frameId: string): string {
  return `frame = "${escapeFilterValue(frameId)}"`
}

/** Build an OR filter for many layer ids, suitable for batching layer_details. */
export function layersOrFilter(layerIds: string[]): string {
  return layerIds.map((id) => `layer = "${escapeFilterValue(id)}"`).join(" || ")
}
