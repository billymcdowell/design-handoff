import type {
  FoundationAliasStep,
  FoundationHistoryEntry,
  FoundationResolvedModeValue,
  FoundationSemanticValue,
  FoundationSource,
  FoundationsData,
  FoundationToken,
} from "@/lib/types"

const HISTORY_CAP = 50
const ALIAS_MAX_DEPTH = 20

/** Normalize token path names for fuzzy alias matching (`Orange/9` ≈ `Orange 9`). */
function normalizeTokenName(name: string): string {
  return name.trim().toLowerCase().replace(/[/\s_-]+/g, "/")
}

/** Look up a token by Figma id, stable library key, or (last resort) unique name. */
export function findCatalogToken(
  catalog: Record<string, FoundationToken>,
  figmaId: string,
  opts?: { key?: string | null; name?: string | null },
): FoundationToken | null {
  if (figmaId) {
    const direct = catalog[figmaId]
    if (direct) return direct
    for (const token of Object.values(catalog)) {
      if (token.sourceId === figmaId || token.id === figmaId) return token
    }
    for (const [key, token] of Object.entries(catalog)) {
      if (key.endsWith(`:${figmaId}`)) return token
    }
  }

  const aliasKey = opts?.key?.trim()
  if (aliasKey) {
    for (const token of Object.values(catalog)) {
      if (token.key && token.key === aliasKey) return token
    }
  }

  const aliasName = opts?.name?.trim()
  if (aliasName) {
    const needle = normalizeTokenName(aliasName)
    const matches = Object.values(catalog).filter(
      (token) => normalizeTokenName(token.name) === needle,
    )
    const matchesPrefixed = Object.values(catalog).filter((token) => {
      const parts = token.name.split(" / ")
      const leaf = parts[parts.length - 1] ?? token.name
      return normalizeTokenName(leaf) === needle
    })
    const unique =
      matches.length === 1
        ? matches[0]
        : matchesPrefixed.length === 1
          ? matchesPrefixed[0]
          : null
    if (unique) return unique
  }

  return null
}

/**
 * Resolve an inspector/style id against the catalog.
 * Effect styles may be stored as `${id}:shadow` / `${id}:blur`.
 */
export function resolveTokenIdInCatalog(
  catalog: Record<string, FoundationToken>,
  tokenId: string,
): FoundationToken | null {
  const direct = findCatalogToken(catalog, tokenId)
  if (direct) return direct
  return (
    findCatalogToken(catalog, `${tokenId}:shadow`) ??
    findCatalogToken(catalog, `${tokenId}:blur`)
  )
}

function pickModeValue(
  token: FoundationToken,
  preferredModeId: string | null,
  preferredModeName: string | null,
): FoundationSemanticValue | undefined {
  const values = token.valuesByMode
  if (values) {
    if (preferredModeId && values[preferredModeId]) {
      return values[preferredModeId]
    }
    if (preferredModeName && token.modes) {
      const match = token.modes.find((m) => m.name === preferredModeName)
      if (match && values[match.modeId]) return values[match.modeId]
    }
    const first = Object.values(values)[0]
    if (first) return first
  }
  return token.value
}

function cssFromSemantic(value: FoundationSemanticValue | undefined): string | undefined {
  if (!value) return undefined
  switch (value.kind) {
    case "color":
      return value.css || value.hex
    case "paint":
      return value.css ? `background-color: ${value.css}` : undefined
    case "number":
      return `${value.value}px`
    default:
      return undefined
  }
}

export function resolveSemanticValue(
  catalog: Record<string, FoundationToken>,
  start: FoundationSemanticValue | undefined,
  preferredModeId: string | null,
  preferredModeName: string | null,
): FoundationResolvedModeValue | undefined {
  if (!start) return undefined
  if (start.kind !== "alias") {
    return { value: start, aliasChain: [] }
  }

  const aliasChain: FoundationAliasStep[] = []
  let current: FoundationSemanticValue = start
  let modeId = preferredModeId
  let modeName = preferredModeName
  const visited = new Set<string>()

  for (let depth = 0; depth < ALIAS_MAX_DEPTH; depth += 1) {
    if (current.kind !== "alias") {
      return { value: current, aliasChain }
    }
    const aliasId = current.aliasId
    if (visited.has(aliasId)) {
      return { value: current, aliasChain, unresolved: true }
    }
    visited.add(aliasId)
    const target = findCatalogToken(catalog, aliasId, {
      key: current.aliasKey,
      name: current.aliasName,
    })
    if (!target) {
      aliasChain.push({ id: aliasId, name: current.aliasName })
      return { value: current, aliasChain, unresolved: true }
    }
    aliasChain.push({
      id: target.id,
      name: target.name || current.aliasName,
    })

    const next = pickModeValue(target, modeId, modeName)
    if (!next) {
      return { value: current, aliasChain, unresolved: true }
    }

    if (modeName && target.modes) {
      const match = target.modes.find((m) => m.name === modeName)
      if (match) modeId = match.modeId
    } else if (target.modes && target.modes.length > 0) {
      const match =
        (modeId && target.modes.find((m) => m.modeId === modeId)) ||
        target.modes[0]
      modeId = match.modeId
      modeName = match.name
    }

    current = next
  }

  return { value: current, aliasChain, unresolved: true }
}

export function applyCatalogResolution(
  catalog: Record<string, FoundationToken>,
): Record<string, FoundationToken> {
  const out: Record<string, FoundationToken> = {}

  for (const [id, token] of Object.entries(catalog)) {
    // Always recompute from raw valuesByMode/value so key/name fallbacks apply
    // even when PocketBase still has pre-key unresolved snapshots.
    const resolvedByMode: Record<string, FoundationResolvedModeValue> = {}
    if (token.valuesByMode && token.modes && token.modes.length > 0) {
      for (const mode of token.modes) {
        const raw = token.valuesByMode[mode.modeId]
        const resolved = resolveSemanticValue(
          catalog,
          raw,
          mode.modeId,
          mode.name,
        )
        if (resolved) resolvedByMode[mode.modeId] = resolved
      }
    } else if (token.valuesByMode) {
      for (const [modeId, raw] of Object.entries(token.valuesByMode)) {
        const modeName =
          token.modes?.find((m) => m.modeId === modeId)?.name ?? null
        const resolved = resolveSemanticValue(catalog, raw, modeId, modeName)
        if (resolved) resolvedByMode[modeId] = resolved
      }
    }

    let resolved: FoundationResolvedModeValue | undefined
    if (token.value) {
      resolved = resolveSemanticValue(catalog, token.value, null, null)
    } else if (Object.keys(resolvedByMode).length > 0) {
      resolved = Object.values(resolvedByMode)[0]
    }

    const leaf = resolved?.unresolved ? undefined : resolved?.value
    const derivedCss = cssFromSemantic(leaf)

    out[id] = {
      ...token,
      ...(Object.keys(resolvedByMode).length > 0 ? { resolvedByMode } : {}),
      ...(resolved ? { resolved } : {}),
      ...(derivedCss ? { css: derivedCss } : token.css ? { css: token.css } : {}),
    }
  }

  return out
}

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
      const originalId = token.sourceId ?? token.id
      const catalogId =
        catalog[originalId] && catalog[originalId].sourceFileKey !== source.fileKey
          ? `${source.fileKey}:${originalId}`
          : originalId
      catalog[catalogId] = {
        ...token,
        id: catalogId,
        name: displayName,
        ...(catalogId !== originalId ? { sourceId: originalId } : {}),
      }
    }
  }

  return applyCatalogResolution(catalog)
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

export function catalogFromData(
  data: FoundationsData,
): Record<string, FoundationToken> {
  if (data.catalog && Object.keys(data.catalog).length > 0) {
    return applyCatalogResolution(data.catalog)
  }
  if (data.sources) return flattenCatalog(data.sources)
  return {}
}

export function tokensFromData(data: FoundationsData): FoundationToken[] {
  return Object.values(catalogFromData(data))
}

/** Prefer resolved leaf for display; fall back to raw mode/value. */
export function displayValueForToken(
  token: FoundationToken,
  modeId: string | null,
): {
  raw: FoundationSemanticValue | undefined
  resolved: FoundationResolvedModeValue | undefined
  leaf: FoundationSemanticValue | undefined
} {
  const raw =
    (modeId && token.valuesByMode?.[modeId]) ||
    (token.valuesByMode && Object.values(token.valuesByMode)[0]) ||
    token.value

  const resolved =
    (modeId && token.resolvedByMode?.[modeId]) ||
    token.resolved ||
    (token.resolvedByMode && Object.values(token.resolvedByMode)[0])

  const leaf = resolved && !resolved.unresolved ? resolved.value : raw
  return { raw, resolved, leaf }
}
