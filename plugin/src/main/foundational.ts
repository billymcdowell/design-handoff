/// <reference types="@figma/plugin-typings" />

// ─── Foundational export: Figma variables + local styles ───────────────────

import type {
  FoundationalExport,
  FoundationalStyles,
  FoundationHistoryEntry,
  FoundationHistorySummary,
  FoundationSource,
  FoundationsStoredData,
  VariableCollectionExport,
} from "../types"
import { rgbToHex } from "./cssEngine"

const HISTORY_CAP = 50
const LEGACY_SOURCE_KEY = "legacy"

function emptyStyles(): FoundationalStyles {
  return { paint: [], text: [], effect: [], grid: [] }
}

function emptyStoredData(): FoundationsStoredData {
  return {
    sources: {},
    variables: {},
    styles: emptyStyles(),
    history: [],
  }
}

// 14.2 ── processVariableValue ───────────────────────────────────────────────
function processVariableValue(value: unknown, type: string): unknown {
  if (
    type === "COLOR" &&
    value &&
    typeof value === "object" &&
    "r" in value &&
    "g" in value &&
    "b" in value
  ) {
    const v = value as { r: number; g: number; b: number; a?: number }
    return {
      ...v,
      hex: rgbToHex(v.r, v.g, v.b),
      css: `rgba(${Math.round(v.r * 255)}, ${Math.round(v.g * 255)}, ${Math.round(
        v.b * 255,
      )}, ${v.a ?? 1})`,
    }
  }
  return value
}

/** Resolve the Figma file identity used as the foundations source key. */
export function getFoundationFileIdentity(): {
  fileKey: string
  fileName: string
} {
  const fileName = figma.root.name || "Untitled"
  const fileKey = figma.fileKey || `local:${fileName}`
  return { fileKey, fileName }
}

// 14.1 ── getFoundationalElements ────────────────────────────────────────────
export async function getFoundationalElements(): Promise<FoundationalExport> {
  const exportData: FoundationalExport = {
    variables: {},
    styles: emptyStyles(),
  }

  // --- Variables ---
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  for (const collection of collections) {
    const collectionExport = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
      variables: [] as FoundationalExport["variables"][string]["variables"],
    }

    const variables = await Promise.all(
      collection.variableIds.map((id) =>
        figma.variables.getVariableByIdAsync(id),
      ),
    )

    for (const variable of variables) {
      if (!variable) continue
      const valuesByMode: Record<string, unknown> = {}
      for (const mode of collection.modes) {
        const value = variable.valuesByMode[mode.modeId]
        if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          (value as { type: string }).type === "VARIABLE_ALIAS"
        ) {
          const alias = value as VariableAlias
          const aliasedVar = await figma.variables.getVariableByIdAsync(alias.id)
          valuesByMode[mode.modeId] = {
            type: "VARIABLE_ALIAS",
            id: alias.id,
            name: aliasedVar?.name || "Unknown Variable",
          }
        } else {
          valuesByMode[mode.modeId] = processVariableValue(
            value,
            variable.resolvedType,
          )
        }
      }

      collectionExport.variables.push({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        valuesByMode,
        description: variable.description,
        scopes: variable.scopes,
        codeSyntax: variable.codeSyntax,
      })
    }

    exportData.variables[collection.name] = collectionExport
  }

  // --- Styles ---
  const paintStyles = await figma.getLocalPaintStylesAsync()
  exportData.styles.paint = paintStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    paints: s.paints as unknown[],
  }))

  const textStyles = await figma.getLocalTextStylesAsync()
  exportData.styles.text = textStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    fontName: s.fontName,
    fontSize: s.fontSize,
    fontWeight: 400, // placeholder — matches spec
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    textDecoration: s.textDecoration,
    paragraphIndent: s.paragraphIndent,
    paragraphSpacing: s.paragraphSpacing,
    textCase: s.textCase,
  }))

  const effectStyles = await figma.getLocalEffectStylesAsync()
  exportData.styles.effect = effectStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    effects: s.effects as unknown[],
  }))

  const gridStyles = await figma.getLocalGridStylesAsync()
  exportData.styles.grid = gridStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    layoutGrids: s.layoutGrids as unknown[],
  }))

  return exportData
}

// ── Counts for the foundations record ───────────────────────────────────────
export function countVariables(data: {
  variables: Record<string, { variables: unknown[] }>
}): number {
  return Object.values(data.variables).reduce(
    (sum, c) => sum + c.variables.length,
    0,
  )
}

export function countStyles(data: { styles: FoundationalStyles }): number {
  const s = data.styles
  return s.paint.length + s.text.length + s.effect.length + s.grid.length
}

// ── Multi-file merge / flatten / diff ───────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeStyles(raw: unknown): FoundationalStyles {
  if (!isPlainObject(raw)) return emptyStyles()
  return {
    paint: Array.isArray(raw.paint) ? (raw.paint as FoundationalStyles["paint"]) : [],
    text: Array.isArray(raw.text) ? (raw.text as FoundationalStyles["text"]) : [],
    effect: Array.isArray(raw.effect)
      ? (raw.effect as FoundationalStyles["effect"])
      : [],
    grid: Array.isArray(raw.grid) ? (raw.grid as FoundationalStyles["grid"]) : [],
  }
}

function normalizeVariables(
  raw: unknown,
): Record<string, VariableCollectionExport> {
  if (!isPlainObject(raw)) return {}
  const out: Record<string, VariableCollectionExport> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) continue
    const vars = Array.isArray(value.variables) ? value.variables : []
    out[key] = {
      id: typeof value.id === "string" ? value.id : key,
      name: typeof value.name === "string" ? value.name : key,
      modes: Array.isArray(value.modes)
        ? (value.modes as VariableCollectionExport["modes"])
        : [],
      variables: vars as VariableCollectionExport["variables"],
    }
  }
  return out
}

/**
 * Normalize legacy `{ variables, styles }` blobs into the multi-source shape.
 * Existing flat data becomes `sources.legacy`.
 */
export function normalizeFoundationsData(raw: unknown): FoundationsStoredData {
  if (!isPlainObject(raw)) return emptyStoredData()

  const hasSources = isPlainObject(raw.sources)
  if (hasSources) {
    const sources: Record<string, FoundationSource> = {}
    for (const [key, value] of Object.entries(raw.sources as Record<string, unknown>)) {
      if (!isPlainObject(value)) continue
      sources[key] = {
        fileKey: typeof value.fileKey === "string" ? value.fileKey : key,
        fileName:
          typeof value.fileName === "string" ? value.fileName : "Unknown file",
        updatedAt:
          typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date(0).toISOString(),
        variables: normalizeVariables(value.variables),
        styles: normalizeStyles(value.styles),
      }
    }
    const history = Array.isArray(raw.history)
      ? (raw.history as FoundationHistoryEntry[])
      : []
    const flat = flattenSources(sources)
    return {
      sources,
      variables: flat.variables,
      styles: flat.styles,
      history,
    }
  }

  // Legacy: wrap flat variables/styles as a single synthetic source.
  const variables = normalizeVariables(raw.variables)
  const styles = normalizeStyles(raw.styles)
  const hasContent =
    Object.keys(variables).length > 0 ||
    styles.paint.length +
      styles.text.length +
      styles.effect.length +
      styles.grid.length >
      0

  if (!hasContent) return emptyStoredData()

  const sources: Record<string, FoundationSource> = {
    [LEGACY_SOURCE_KEY]: {
      fileKey: LEGACY_SOURCE_KEY,
      fileName: "Previous upload",
      updatedAt: new Date(0).toISOString(),
      variables,
      styles,
    },
  }
  return {
    sources,
    variables,
    styles,
    history: [],
  }
}

type StyleKind = keyof FoundationalStyles

function styleKinds(): StyleKind[] {
  return ["paint", "text", "effect", "grid"]
}

/** Rebuild flat variables/styles from all sources; prefix colliding names. */
export function flattenSources(
  sources: Record<string, FoundationSource>,
): { variables: Record<string, VariableCollectionExport>; styles: FoundationalStyles } {
  const variables: Record<string, VariableCollectionExport> = {}
  const styles = emptyStyles()
  const entries = Object.values(sources)
  const multiFile = entries.length > 1

  // Count style names across sources so we only prefix true collisions.
  const styleNameCounts: Record<StyleKind, Map<string, number>> = {
    paint: new Map(),
    text: new Map(),
    effect: new Map(),
    grid: new Map(),
  }
  for (const source of entries) {
    for (const kind of styleKinds()) {
      for (const style of source.styles[kind]) {
        styleNameCounts[kind].set(
          style.name,
          (styleNameCounts[kind].get(style.name) ?? 0) + 1,
        )
      }
    }
  }

  for (const source of entries) {
    for (const [collKey, collection] of Object.entries(source.variables)) {
      const flatKey = multiFile
        ? `${source.fileName} / ${collection.name || collKey}`
        : collKey
      variables[flatKey] = {
        ...collection,
        name: multiFile
          ? `${source.fileName} / ${collection.name}`
          : collection.name,
      }
    }

    for (const kind of styleKinds()) {
      for (const style of source.styles[kind]) {
        const collided = (styleNameCounts[kind].get(style.name) ?? 0) > 1
        const displayName = collided
          ? `${source.fileName} / ${style.name}`
          : style.name
        styles[kind].push({ ...style, name: displayName } as never)
      }
    }
  }

  return { variables, styles }
}

function tokenMapsFromSource(source: FoundationSource | null | undefined): {
  variables: Map<string, string>
  styles: Map<string, string>
} {
  const variables = new Map<string, string>()
  const styles = new Map<string, string>()
  if (!source) return { variables, styles }

  for (const [collKey, collection] of Object.entries(source.variables)) {
    const collName = collection.name || collKey
    for (const variable of collection.variables) {
      variables.set(
        `${collName}/${variable.name}`,
        JSON.stringify(variable),
      )
    }
  }

  for (const kind of styleKinds()) {
    for (const style of source.styles[kind]) {
      styles.set(`${kind}/${style.name}`, JSON.stringify(style))
    }
  }

  return { variables, styles }
}

/** Diff one source slice (previous vs next) into added/removed/changed keys. */
export function diffSource(
  prev: FoundationSource | null | undefined,
  next: FoundationSource,
): FoundationHistorySummary {
  const before = tokenMapsFromSource(prev)
  const after = tokenMapsFromSource(next)

  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []

  for (const [key, value] of after.variables) {
    const old = before.variables.get(key)
    if (old === undefined) added.push(key)
    else if (old !== value) changed.push(key)
  }
  for (const key of before.variables.keys()) {
    if (!after.variables.has(key)) removed.push(key)
  }

  for (const [key, value] of after.styles) {
    const old = before.styles.get(key)
    if (old === undefined) added.push(key)
    else if (old !== value) changed.push(key)
  }
  for (const key of before.styles.keys()) {
    if (!after.styles.has(key)) removed.push(key)
  }

  added.sort()
  removed.sort()
  changed.sort()
  return { added, removed, changed }
}

function makeHistoryId(): string {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface MergeFoundationsResult {
  data: FoundationsStoredData
  historyEntry: FoundationHistoryEntry
}

/**
 * Replace (or insert) one file's source slice, rebuild flat view, append history.
 */
export function mergeFoundationsData(
  existingRaw: unknown,
  incoming: {
    fileKey: string
    fileName: string
    variables: Record<string, VariableCollectionExport>
    styles: FoundationalStyles
  },
): MergeFoundationsResult {
  const existing = normalizeFoundationsData(existingRaw)
  const prevSource = existing.sources[incoming.fileKey] ?? null
  const now = new Date().toISOString()

  const nextSource: FoundationSource = {
    fileKey: incoming.fileKey,
    fileName: incoming.fileName,
    updatedAt: now,
    variables: incoming.variables,
    styles: incoming.styles,
  }

  const summary = diffSource(prevSource, nextSource)
  const historyEntry: FoundationHistoryEntry = {
    id: makeHistoryId(),
    at: now,
    fileKey: incoming.fileKey,
    fileName: incoming.fileName,
    summary,
  }

  const sources = {
    ...existing.sources,
    [incoming.fileKey]: nextSource,
  }
  const flat = flattenSources(sources)
  const history = [...existing.history, historyEntry].slice(-HISTORY_CAP)

  return {
    data: {
      sources,
      variables: flat.variables,
      styles: flat.styles,
      history,
    },
    historyEntry,
  }
}

export function formatHistorySummary(summary: FoundationHistorySummary): string {
  const parts: string[] = []
  if (summary.added.length) parts.push(`+${summary.added.length}`)
  if (summary.removed.length) parts.push(`−${summary.removed.length}`)
  if (summary.changed.length) parts.push(`~${summary.changed.length}`)
  return parts.length ? parts.join(" · ") : "no changes"
}
