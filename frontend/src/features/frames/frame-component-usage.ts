import { catalogKeyFor } from "@/features/components/catalog-key"
import type { Layer, LayerDetail, LibraryComponent } from "@/lib/types"

export type FrameComponentUsage = {
  /** Stable group id: catalog key, or `name:…` fallback when no Figma key. */
  groupKey: string
  /** Figma catalog key when known (enables navigation when in library). */
  catalogKey?: string
  name: string
  count: number
  layerIds: string[]
  inLibrary: boolean
  libraryComponent?: LibraryComponent
}

export type LayerComponentSummary = {
  component?: LayerDetail["component"]
}

function displayNameFor(
  component: NonNullable<LayerDetail["component"]>,
): string {
  return (
    component.componentSetName ||
    component.mainComponentName ||
    component.name
  )
}

/**
 * Aggregate unique components used on a frame from published layer_details.component.
 * Includes nested instances; groups by catalog key (or display name when key missing).
 */
export function deriveFrameComponentUsages(
  layers: Layer[],
  detailsByLayerId: Record<string, LayerComponentSummary | undefined>,
  libraryComponents: LibraryComponent[] | undefined,
): FrameComponentUsage[] {
  const libraryByKey = new Map(
    (libraryComponents ?? []).map((c) => [c.key, c]),
  )

  type Acc = {
    catalogKey?: string
    name: string
    layerIds: string[]
  }
  const byGroup = new Map<string, Acc>()

  for (const layer of layers) {
    const component = detailsByLayerId[layer.id]?.component
    if (!component) continue

    const catalogKey = catalogKeyFor(component)
    const name = displayNameFor(component)
    const groupKey = catalogKey ?? `name:${name}`

    const existing = byGroup.get(groupKey)
    if (existing) {
      existing.layerIds.push(layer.id)
      continue
    }
    byGroup.set(groupKey, {
      catalogKey,
      name,
      layerIds: [layer.id],
    })
  }

  const usages: FrameComponentUsage[] = [...byGroup.entries()].map(
    ([groupKey, acc]) => {
      const libraryComponent = acc.catalogKey
        ? libraryByKey.get(acc.catalogKey)
        : undefined
      return {
        groupKey,
        catalogKey: acc.catalogKey,
        name: libraryComponent?.name ?? acc.name,
        count: acc.layerIds.length,
        layerIds: acc.layerIds,
        inLibrary: !!libraryComponent,
        libraryComponent,
      }
    },
  )

  usages.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })

  return usages
}
