/** Minimal shape needed to resolve a catalog / grouping key from a layer component spec. */
export type ComponentIdentity = {
  componentSetKey?: string
  mainComponentKey?: string
  componentKey?: string
}

/**
 * Prefer set key (library COMPONENT_SET), then instance main key, then standalone component key.
 * Matches how the catalog stores `library_components.key`.
 */
export function catalogKeyFor(
  component: ComponentIdentity | null | undefined,
): string | undefined {
  if (!component) return undefined
  return (
    component.componentSetKey ||
    component.mainComponentKey ||
    component.componentKey ||
    undefined
  )
}
