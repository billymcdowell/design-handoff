/** Escape user input before interpolating into a PocketBase filter string. */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function projectFilter(projectId: string): string {
  return `project = "${escapeFilterValue(projectId)}"`
}

export function framesByNameFilter(projectId: string, name: string): string {
  return `project = "${escapeFilterValue(projectId)}" && name = "${escapeFilterValue(name)}"`
}

export function framesSearchFilter(projectId: string, query: string): string {
  return `project = "${escapeFilterValue(projectId)}" && name ~ "${escapeFilterValue(query)}"`
}
