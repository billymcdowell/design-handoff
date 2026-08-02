import type {
  FoundationHistoryEntry,
  FoundationSource,
  FoundationsData,
  FoundationToken,
} from "@/lib/types"

const HISTORY_CAP = 50

/** Rebuild flat catalog from all sources (mirrors plugin flattenCatalog). */
export function flattenCatalog(
  sources: Record<string, FoundationSource>,
): Record<string, FoundationToken> {
  const catalog: Record<string, FoundationToken> = {}
  const entries = Object.values(sources)
  const multiFile = entries.length > 1

  const nameCounts = new Map<string, number>()
  for (const source of entries) {
    for (const token of Object.values(source.tokens ?? {})) {
      nameCounts.set(token.name, (nameCounts.get(token.name) ?? 0) + 1)
    }
  }

  for (const source of entries) {
    for (const token of Object.values(source.tokens ?? {})) {
      const collided = multiFile && (nameCounts.get(token.name) ?? 0) > 1
      const displayName = collided
        ? `${source.fileName} / ${token.name}`
        : token.name
      const catalogId =
        catalog[token.id] && catalog[token.id].sourceFileKey !== source.fileKey
          ? `${source.fileKey}:${token.id}`
          : token.id
      catalog[catalogId] = {
        ...token,
        id: catalogId,
        name: displayName,
      }
    }
  }

  return catalog
}

export function countCatalogTokens(catalog: Record<string, FoundationToken>): {
  variables_count: number
  styles_count: number
} {
  let variables_count = 0
  let styles_count = 0
  for (const token of Object.values(catalog)) {
    if (token.origin === "variable") variables_count += 1
    else styles_count += 1
  }
  return { variables_count, styles_count }
}

function makeHistoryId(): string {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Remove a source and rebuild catalog + history (mirrors plugin). */
export function removeFoundationSourceFromData(
  data: FoundationsData,
  fileKey: string,
): {
  data: FoundationsData
  historyEntry: FoundationHistoryEntry | null
  counts: { variables_count: number; styles_count: number }
} {
  const sources = { ...(data.sources ?? {}) }
  const prev = sources[fileKey]
  if (!prev) {
    const catalog = data.catalog ?? flattenCatalog(sources)
    return {
      data,
      historyEntry: null,
      counts: countCatalogTokens(catalog),
    }
  }

  delete sources[fileKey]
  const now = new Date().toISOString()
  const removedTokens = Object.values(prev.tokens ?? {})
  const historyEntry: FoundationHistoryEntry = {
    id: makeHistoryId(),
    at: now,
    fileKey,
    fileName: prev.fileName,
    summary: {
      kind: "source_removed",
      added: [],
      removed: removedTokens.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
      })),
      changed: [],
      counts: { tokens: removedTokens.length },
    },
  }

  const catalog = flattenCatalog(sources)
  const history = [...(data.history ?? []), historyEntry].slice(-HISTORY_CAP)
  const counts = countCatalogTokens(catalog)

  return {
    data: {
      version: 2,
      sources,
      catalog,
      history,
    },
    historyEntry,
    counts,
  }
}

export function tokensFromData(data: FoundationsData): FoundationToken[] {
  const catalog = data.catalog
  if (catalog && Object.keys(catalog).length > 0) {
    return Object.values(catalog)
  }
  // Fallback: rebuild from sources if catalog missing
  if (data.sources) return Object.values(flattenCatalog(data.sources))
  return []
}
