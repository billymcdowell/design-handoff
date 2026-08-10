import type {
  FoundationCategory,
  FoundationHistoryEntry,
  FoundationSemanticValue,
  FoundationToken,
} from "@/lib/types"
import { displayValueForToken } from "../catalog"

/** Sidebar label for tokens without a variable collection (Figma styles). */
export const STYLES_GROUP_NAME = "Styles"

export type CollectionGroup = {
  key: string
  collectionName: string
  sourceFileKey: string
  sourceFileName: string
  /** True for the per-file styles group (no variable collection). */
  isStyles: boolean
  modes: { modeId: string; name: string }[]
  tokens: FoundationToken[]
}

export type SourceSection = {
  sourceFileKey: string
  sourceFileName: string
  /** Named variable collections for this file. */
  collections: CollectionGroup[]
  /** Styles from this file (paint/text/effect/grid), shown under collections. */
  styles: CollectionGroup | null
  tokenCount: number
}

export const CATEGORY_LABELS: { id: FoundationCategory; label: string }[] = [
  { id: "color", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "number", label: "Numbers" },
  { id: "shadow", label: "Shadows" },
  { id: "blur", label: "Blurs" },
  { id: "grid", label: "Grids" },
  { id: "other", label: "Other" },
]

export function collectionKeyFor(token: FoundationToken): string {
  const name = token.collectionName?.trim()
    ? token.collectionName.trim()
    : STYLES_GROUP_NAME
  return `${token.sourceFileKey}::${name}`
}

/** Group tokens by source + collection. Ungrouped → per-file styles. */
export function groupByCollection(tokens: FoundationToken[]): CollectionGroup[] {
  const map = new Map<string, CollectionGroup>()
  for (const token of tokens) {
    const isStyles = !token.collectionName?.trim()
    const collectionName = isStyles
      ? STYLES_GROUP_NAME
      : token.collectionName!.trim()
    const key = `${token.sourceFileKey}::${collectionName}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        collectionName,
        sourceFileKey: token.sourceFileKey,
        sourceFileName: token.sourceFileName,
        isStyles,
        modes: [],
        tokens: [],
      }
      map.set(key, group)
    }
    group.tokens.push(token)
    for (const mode of token.modes ?? []) {
      if (!group.modes.some((m) => m.modeId === mode.modeId)) {
        group.modes.push(mode)
      }
    }
  }
  return [...map.values()].map((g) => ({
    ...g,
    tokens: [...g.tokens].sort((a, b) => a.name.localeCompare(b.name)),
    modes: [...g.modes].sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

/**
 * Sidebar sections: one block per Figma file, with named collections first
 * and a `styles` group at the bottom of that file (when present).
 */
export function groupSidebarSections(tokens: FoundationToken[]): {
  sourceSections: SourceSection[]
} {
  const collections = groupByCollection(tokens)
  const bySource = new Map<string, SourceSection>()

  function ensureSection(col: CollectionGroup): SourceSection {
    let section = bySource.get(col.sourceFileKey)
    if (!section) {
      section = {
        sourceFileKey: col.sourceFileKey,
        sourceFileName: col.sourceFileName,
        collections: [],
        styles: null,
        tokenCount: 0,
      }
      bySource.set(col.sourceFileKey, section)
    }
    return section
  }

  for (const col of collections) {
    const section = ensureSection(col)
    if (col.isStyles) {
      section.styles = col
    } else {
      section.collections.push(col)
    }
    section.tokenCount += col.tokens.length
  }

  const sourceSections = [...bySource.values()]
    .map((s) => ({
      ...s,
      collections: [...s.collections].sort((a, b) =>
        a.collectionName.localeCompare(b.collectionName),
      ),
    }))
    .sort((a, b) => a.sourceFileName.localeCompare(b.sourceFileName))

  return { sourceSections }
}

export function filterTokens(
  tokens: FoundationToken[],
  query: string,
  category: FoundationCategory | "all",
): FoundationToken[] {
  const q = query.trim().toLowerCase()
  return tokens.filter((t) => {
    if (category !== "all" && t.category !== category) return false
    if (!q) return true
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false) ||
      (t.collectionName?.toLowerCase().includes(q) ?? false) ||
      t.sourceFileName.toLowerCase().includes(q)
    )
  })
}

export function formatSemantic(
  value: FoundationSemanticValue | undefined,
): string {
  if (!value) return "—"
  switch (value.kind) {
    case "color":
      return value.css || value.hex
    case "number":
      return String(value.value)
    case "boolean":
      return String(value.value)
    case "string":
      return value.value
    case "alias":
      return `↪ ${value.aliasName}`
    case "shadow":
      return `${value.inset ? "inset " : ""}${value.x} ${value.y} ${value.blur} ${value.spread} ${value.color}`
    case "blur":
      return `${value.type} ${value.radius}px`
    case "shadows":
      return `${value.shadows.length} shadows`
    case "blurs":
      return `${value.blurs.length} blurs`
    case "text":
      return `${value.family} ${value.weight} / ${value.size}px`
    case "paint":
      return value.css || value.hex || "paint"
    case "grid":
      return `${value.grids.length} grid(s)`
    case "unknown":
      return JSON.stringify(value.raw)
    default:
      return "—"
  }
}

export function colorFromValue(
  value: FoundationSemanticValue | undefined,
): string | null {
  if (!value) return null
  if (value.kind === "color") return value.css || value.hex
  if (value.kind === "paint") return value.css || value.hex || null
  return null
}

export function tokenDisplayColor(
  token: FoundationToken,
  modeId: string | null,
): string | null {
  const { leaf } = displayValueForToken(token, modeId)
  return colorFromValue(leaf)
}

export function tokenAliasSummary(
  token: FoundationToken,
  modeId: string | null,
): string | null {
  const { resolved, leaf } = displayValueForToken(token, modeId)
  if (!resolved?.aliasChain.length) return null
  const chain = resolved.aliasChain.map((s) => s.name).join(" → ")
  return resolved.unresolved
    ? `${chain} (unresolved)`
    : `${chain} → ${formatSemantic(leaf)}`
}

export function findReferrers(
  catalog: Record<string, FoundationToken>,
  target: FoundationToken,
): FoundationToken[] {
  const out: FoundationToken[] = []
  for (const token of Object.values(catalog)) {
    if (token.id === target.id) continue
    const values = [
      token.value,
      ...Object.values(token.valuesByMode ?? {}),
    ].filter(Boolean) as FoundationSemanticValue[]
    const hits = values.some((v) => {
      if (v.kind !== "alias") return false
      if (
        v.aliasId &&
        (v.aliasId === target.id || v.aliasId === target.sourceId)
      ) {
        return true
      }
      if (target.key && v.aliasName === target.key) return true
      if (v.aliasName && normalize(v.aliasName) === normalize(target.name)) {
        return true
      }
      return false
    })
    if (hits) out.push(token)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/[/\s_-]+/g, "/")
}

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "Unknown"
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function historyNewestFirst(
  history: FoundationHistoryEntry[] | undefined,
): FoundationHistoryEntry[] {
  if (!history?.length) return []
  return [...history].reverse()
}

export function historyBadge(entry: FoundationHistoryEntry): {
  label: string
  tone: "neutral" | "danger" | "change"
} {
  const { summary } = entry
  if (summary.kind === "initial") {
    return {
      label: `Initial · ${summary.counts?.tokens ?? 0}`,
      tone: "neutral",
    }
  }
  if (summary.kind === "source_removed") {
    return {
      label: `Removed · ${summary.counts?.tokens ?? summary.removed.length}`,
      tone: "danger",
    }
  }
  return {
    label: `+${summary.added.length} −${summary.removed.length} ~${summary.changed.length}`,
    tone: "change",
  }
}
