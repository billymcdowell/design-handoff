/// <reference types="@figma/plugin-typings" />

// ─── Foundational export: Figma variables + local styles → v2 catalog ───────

import type {
  FoundationalExport,
  FoundationalStyles,
  FoundationCategory,
  FoundationHistoryChangedItem,
  FoundationHistoryEntry,
  FoundationHistoryFieldChange,
  FoundationHistoryItemRef,
  FoundationHistorySummary,
  FoundationNumberKind,
  FoundationSemanticValue,
  FoundationSource,
  FoundationsStoredData,
  FoundationToken,
  VariableCollectionExport,
} from "../types"
import { rgbToHex } from "./cssEngine"

const HISTORY_CAP = 50
export const FOUNDATIONS_DATA_VERSION = 2 as const

function emptyStyles(): FoundationalStyles {
  return { paint: [], text: [], effect: [], grid: [] }
}

function emptyStoredData(): FoundationsStoredData {
  return {
    version: FOUNDATIONS_DATA_VERSION,
    sources: {},
    catalog: {},
    history: [],
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function rgbaToCss(color: { r: number; g: number; b: number; a?: number }): string {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(
    color.b * 255,
  )}, ${color.a ?? 1})`
}

function colorSemantic(color: {
  r: number
  g: number
  b: number
  a?: number
}): FoundationSemanticValue {
  const hex = rgbToHex(color.r, color.g, color.b)
  const css = rgbaToCss(color)
  return { kind: "color", hex, css }
}

function processVariableValue(
  value: unknown,
  type: string,
): FoundationSemanticValue {
  if (
    type === "COLOR" &&
    value &&
    typeof value === "object" &&
    "r" in value &&
    "g" in value &&
    "b" in value
  ) {
    return colorSemantic(value as { r: number; g: number; b: number; a?: number })
  }
  if (type === "FLOAT" && typeof value === "number") {
    return { kind: "number", value }
  }
  if (type === "BOOLEAN" && typeof value === "boolean") {
    return { kind: "boolean", value }
  }
  if (type === "STRING" && typeof value === "string") {
    return { kind: "string", value }
  }
  return { kind: "unknown", raw: value ?? null }
}

function fontWeightFromStyle(style: string): number {
  const s = style.toLowerCase()
  if (/(extra|ultra)\s*light|hairline|thin/.test(s)) {
    if (/thin|hairline/.test(s)) return 100
    return 200
  }
  if (/\blight\b/.test(s)) return 300
  if (/\bmedium\b/.test(s)) return 500
  if (/semi\s*bold|demi\s*bold/.test(s)) return 600
  if (/(extra|ultra)\s*bold/.test(s)) return 800
  if (/\bbold\b/.test(s)) return 700
  if (/\b(black|heavy)\b/.test(s)) return 900
  return 400
}

function formatLineHeight(lineHeight: unknown): string {
  if (!lineHeight || typeof lineHeight !== "object") return String(lineHeight ?? "")
  const lh = lineHeight as { unit?: string; value?: number }
  if (lh.unit === "AUTO") return "auto"
  if (lh.unit === "PERCENT" && typeof lh.value === "number") return `${lh.value}%`
  if (lh.unit === "PIXELS" && typeof lh.value === "number") return `${lh.value}px`
  return String(lh.value ?? "")
}

function formatLetterSpacing(letterSpacing: unknown): string {
  if (!letterSpacing || typeof letterSpacing !== "object") {
    return String(letterSpacing ?? "0")
  }
  const ls = letterSpacing as { unit?: string; value?: number }
  if (ls.unit === "PERCENT" && typeof ls.value === "number") return `${ls.value}%`
  if (typeof ls.value === "number") return `${ls.value}px`
  return "0"
}

function numberKindFromName(name: string): FoundationNumberKind {
  if (/radius|corner|round/i.test(name)) return "radius"
  if (/spacing|gap|padding|margin|size|space/i.test(name)) return "spacing"
  return "other"
}

function isTypographyName(name: string): boolean {
  return /font|text|line|letter|typography|heading|body/i.test(name)
}

function shadowCss(shadow: {
  x: number
  y: number
  blur: number
  spread: number
  color: string
  inset: boolean
}): string {
  const inset = shadow.inset ? "inset " : ""
  return `${inset}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`
}

function shadowsCss(
  shadows: Array<{
    x: number
    y: number
    blur: number
    spread: number
    color: string
    inset: boolean
  }>,
): string {
  return shadows.map(shadowCss).join(", ")
}

function blursCss(
  blurs: Array<{ radius: number; type: "LAYER_BLUR" | "BACKGROUND_BLUR" }>,
): string {
  const layer = blurs.find((b) => b.type === "LAYER_BLUR")
  if (layer) return `blur(${layer.radius}px)`
  const bg = blurs[0]
  return bg ? `blur(${bg.radius}px)` : ""
}

function normalizeShadowEffect(effect: Effect): {
  x: number
  y: number
  blur: number
  spread: number
  color: string
  opacity: number
  inset: boolean
} | null {
  if (effect.visible === false) return null
  if (effect.type !== "DROP_SHADOW" && effect.type !== "INNER_SHADOW") return null
  const color = effect.color
  return {
    x: effect.offset.x,
    y: effect.offset.y,
    blur: effect.radius,
    spread: effect.spread ?? 0,
    color: rgbaToCss(color),
    opacity: color.a ?? 1,
    inset: effect.type === "INNER_SHADOW",
  }
}

function normalizeBlurEffect(effect: Effect): {
  radius: number
  type: "LAYER_BLUR" | "BACKGROUND_BLUR"
} | null {
  if (effect.visible === false) return null
  if (effect.type !== "LAYER_BLUR" && effect.type !== "BACKGROUND_BLUR") return null
  return { radius: effect.radius, type: effect.type }
}

function solidPaintCss(paints: readonly Paint[]): {
  css: string
  hex?: string
} | null {
  const solid = paints.find(
    (p) => p.type === "SOLID" && p.visible !== false,
  ) as SolidPaint | undefined
  if (!solid) return null
  const a = solid.opacity ?? 1
  const hex = rgbToHex(solid.color.r, solid.color.g, solid.color.b)
  const css = `rgba(${Math.round(solid.color.r * 255)}, ${Math.round(
    solid.color.g * 255,
  )}, ${Math.round(solid.color.b * 255)}, ${a})`
  return { css, hex }
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

// ── Export raw Figma locals (intermediate) ──────────────────────────────────

export async function getFoundationalElements(): Promise<FoundationalExport> {
  const exportData: FoundationalExport = {
    variables: {},
    styles: emptyStyles(),
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  for (const collection of collections) {
    const collectionExport = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
      variables: [] as FoundationalExport["variables"][string]["variables"],
    }

    const variables = await Promise.all(
      collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
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
    fontWeight: fontWeightFromStyle(s.fontName.style),
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

// ── Build token map from export ─────────────────────────────────────────────

function aliasSemantic(raw: unknown): FoundationSemanticValue | null {
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { type?: string }).type === "VARIABLE_ALIAS"
  ) {
    const a = raw as { id: string; name: string }
    return { kind: "alias", aliasId: a.id, aliasName: a.name }
  }
  return null
}

function toSemanticValue(
  raw: unknown,
  figmaType?: string,
): FoundationSemanticValue {
  const alias = aliasSemantic(raw)
  if (alias) return alias
  if (raw && typeof raw === "object" && (raw as { kind?: string }).kind) {
    return raw as FoundationSemanticValue
  }
  if (figmaType) return processVariableValue(raw, figmaType)
  return { kind: "unknown", raw: raw ?? null }
}

function categorizeVariable(
  type: string,
  name: string,
): { category: FoundationCategory; numberKind?: FoundationNumberKind } {
  if (type === "COLOR") return { category: "color" }
  if (type === "FLOAT") {
    return { category: "number", numberKind: numberKindFromName(name) }
  }
  if (type === "STRING" && isTypographyName(name)) return { category: "typography" }
  return { category: "other" }
}

/** Build id-keyed tokens for one file from a raw foundational export. */
export function buildSourceTokens(
  fileKey: string,
  fileName: string,
  data: FoundationalExport,
): Record<string, FoundationToken> {
  const tokens: Record<string, FoundationToken> = {}

  for (const collection of Object.values(data.variables)) {
    for (const variable of collection.variables) {
      const { category, numberKind } = categorizeVariable(variable.type, variable.name)
      const valuesByMode: Record<string, FoundationSemanticValue> = {}
      for (const [modeId, raw] of Object.entries(variable.valuesByMode || {})) {
        valuesByMode[modeId] = toSemanticValue(raw, variable.type)
      }

      let css: string | undefined
      const first = Object.values(valuesByMode)[0]
      if (first?.kind === "color") css = first.css
      if (first?.kind === "number") css = `${first.value}px`

      tokens[variable.id] = {
        id: variable.id,
        name: variable.name,
        sourceFileKey: fileKey,
        sourceFileName: fileName,
        category,
        ...(numberKind ? { numberKind } : {}),
        origin: "variable",
        collectionName: collection.name,
        description: variable.description || undefined,
        modes: collection.modes,
        valuesByMode,
        ...(css ? { css } : {}),
      }
    }
  }

  for (const style of data.styles.paint) {
    const paints = (style.paints || []) as Paint[]
    const solid = solidPaintCss(paints)
    const value: FoundationSemanticValue = {
      kind: "paint",
      css: solid?.css ?? "",
      ...(solid?.hex ? { hex: solid.hex } : {}),
      paints: style.paints,
    }
    tokens[style.id] = {
      id: style.id,
      name: style.name,
      sourceFileKey: fileKey,
      sourceFileName: fileName,
      category: "color",
      origin: "paint",
      description: style.description || undefined,
      value,
      ...(solid?.css ? { css: `background-color: ${solid.css}` } : {}),
    }
  }

  for (const style of data.styles.text) {
    const weight = style.fontWeight || fontWeightFromStyle(style.fontName.style)
    const value: FoundationSemanticValue = {
      kind: "text",
      family: style.fontName.family,
      style: style.fontName.style,
      size: style.fontSize,
      weight,
      lineHeight: formatLineHeight(style.lineHeight),
      letterSpacing: formatLetterSpacing(style.letterSpacing),
    }
    tokens[style.id] = {
      id: style.id,
      name: style.name,
      sourceFileKey: fileKey,
      sourceFileName: fileName,
      category: "typography",
      origin: "text",
      description: style.description || undefined,
      value,
      css: `font-family: ${value.family}; font-size: ${value.size}px; font-weight: ${value.weight}; line-height: ${value.lineHeight}; letter-spacing: ${value.letterSpacing}`,
    }
  }

  for (const style of data.styles.effect) {
    const effects = (style.effects || []) as Effect[]
    const shadows = effects
      .map(normalizeShadowEffect)
      .filter((s): s is NonNullable<typeof s> => s !== null)
    const blurs = effects
      .map(normalizeBlurEffect)
      .filter((b): b is NonNullable<typeof b> => b !== null)

    if (shadows.length > 0) {
      const id = `${style.id}:shadow`
      const value: FoundationSemanticValue =
        shadows.length === 1
          ? { kind: "shadow", ...shadows[0] }
          : { kind: "shadows", shadows }
      const css = `box-shadow: ${shadowsCss(shadows)}`
      tokens[id] = {
        id,
        name: style.name,
        sourceFileKey: fileKey,
        sourceFileName: fileName,
        category: "shadow",
        origin: "effect",
        description: style.description || undefined,
        value,
        css,
      }
    }

    if (blurs.length > 0) {
      const id = `${style.id}:blur`
      const value: FoundationSemanticValue =
        blurs.length === 1
          ? { kind: "blur", ...blurs[0] }
          : { kind: "blurs", blurs }
      const css = `filter: ${blursCss(blurs)}`
      tokens[id] = {
        id,
        name: style.name,
        sourceFileKey: fileKey,
        sourceFileName: fileName,
        category: "blur",
        origin: "effect",
        description: style.description || undefined,
        value,
        css,
      }
    }

    // Effects with neither shadow nor blur (noise, glass, etc.)
    if (shadows.length === 0 && blurs.length === 0 && effects.length > 0) {
      tokens[style.id] = {
        id: style.id,
        name: style.name,
        sourceFileKey: fileKey,
        sourceFileName: fileName,
        category: "other",
        origin: "effect",
        description: style.description || undefined,
        value: { kind: "unknown", raw: style.effects },
      }
    }
  }

  for (const style of data.styles.grid) {
    tokens[style.id] = {
      id: style.id,
      name: style.name,
      sourceFileKey: fileKey,
      sourceFileName: fileName,
      category: "grid",
      origin: "grid",
      description: style.description || undefined,
      value: { kind: "grid", grids: style.layoutGrids },
    }
  }

  return tokens
}

// ── Catalog flatten ─────────────────────────────────────────────────────────

/** Rebuild flat catalog from all sources; prefix colliding names across files. */
export function flattenCatalog(
  sources: Record<string, FoundationSource>,
): Record<string, FoundationToken> {
  const catalog: Record<string, FoundationToken> = {}
  const entries = Object.values(sources)
  const multiFile = entries.length > 1

  const nameCounts = new Map<string, number>()
  for (const source of entries) {
    for (const token of Object.values(source.tokens)) {
      nameCounts.set(token.name, (nameCounts.get(token.name) ?? 0) + 1)
    }
  }

  for (const source of entries) {
    for (const token of Object.values(source.tokens)) {
      const collided = multiFile && (nameCounts.get(token.name) ?? 0) > 1
      const displayName = collided
        ? `${source.fileName} / ${token.name}`
        : token.name
      // Catalog key: keep token id; if same Figma id appears in two files (rare),
      // namespace with fileKey.
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

// ── Diff ────────────────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

function semanticFingerprint(token: FoundationToken): string {
  return stableStringify({
    name: token.name,
    category: token.category,
    numberKind: token.numberKind ?? null,
    collectionName: token.collectionName ?? null,
    modes: token.modes ?? null,
    valuesByMode: token.valuesByMode ?? null,
    value: token.value ?? null,
    css: token.css ?? null,
  })
}

function itemRef(token: FoundationToken): FoundationHistoryItemRef {
  return { id: token.id, name: token.name, category: token.category }
}

function pushChange(
  changes: FoundationHistoryFieldChange[],
  path: string,
  before: unknown,
  after: unknown,
) {
  if (stableStringify(before) === stableStringify(after)) return
  changes.push({ path, before, after })
}

/** Diff semantic objects into leaf paths (e.g. value.blur) instead of whole JSON. */
function pushSemanticDiff(
  changes: FoundationHistoryFieldChange[],
  path: string,
  before: unknown,
  after: unknown,
) {
  const beforeObj =
    before && typeof before === "object" && !Array.isArray(before)
      ? (before as Record<string, unknown>)
      : null
  const afterObj =
    after && typeof after === "object" && !Array.isArray(after)
      ? (after as Record<string, unknown>)
      : null

  if (
    beforeObj &&
    afterObj &&
    typeof beforeObj.kind === "string" &&
    beforeObj.kind === afterObj.kind
  ) {
    const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])
    keys.delete("kind")
    let nested = false
    for (const key of keys) {
      const b = beforeObj[key] ?? null
      const a = afterObj[key] ?? null
      if (stableStringify(b) === stableStringify(a)) continue
      // Nested array/object (shadows[], paints[]) — stringify readable leaf if primitive-ish
      if (
        b &&
        a &&
        typeof b === "object" &&
        typeof a === "object" &&
        !Array.isArray(b) &&
        !Array.isArray(a) &&
        !("kind" in (b as object))
      ) {
        pushSemanticDiff(changes, `${path}.${key}`, b, a)
      } else {
        pushChange(changes, `${path}.${key}`, b, a)
      }
      nested = true
    }
    if (nested) return
  }

  pushChange(changes, path, before, after)
}

function diffTokenFields(
  prev: FoundationToken,
  next: FoundationToken,
): FoundationHistoryFieldChange[] {
  const changes: FoundationHistoryFieldChange[] = []
  pushChange(changes, "name", prev.name, next.name)
  pushChange(changes, "category", prev.category, next.category)
  pushChange(changes, "numberKind", prev.numberKind ?? null, next.numberKind ?? null)

  const valueBefore = prev.value ?? null
  const valueAfter = next.value ?? null
  const valueChanged =
    stableStringify(valueBefore) !== stableStringify(valueAfter)
  pushSemanticDiff(changes, "value", valueBefore, valueAfter)

  // css is derived from value — only log it when value itself didn't change
  // (e.g. css-only tweak) to avoid duplicate noise.
  if (!valueChanged) {
    pushChange(changes, "css", prev.css ?? null, next.css ?? null)
  }

  const modeIds = new Set([
    ...Object.keys(prev.valuesByMode ?? {}),
    ...Object.keys(next.valuesByMode ?? {}),
  ])
  const modeName = (modeId: string, token: FoundationToken) =>
    token.modes?.find((m) => m.modeId === modeId)?.name ?? modeId

  for (const modeId of modeIds) {
    const before = prev.valuesByMode?.[modeId] ?? null
    const after = next.valuesByMode?.[modeId] ?? null
    pushSemanticDiff(
      changes,
      modeName(modeId, next),
      before,
      after,
    )
  }

  return changes
}

export function diffSourceTokens(
  prev: FoundationSource | null | undefined,
  next: FoundationSource,
): FoundationHistorySummary {
  const before = prev?.tokens ?? {}
  const after = next.tokens

  const added: FoundationHistoryItemRef[] = []
  const removed: FoundationHistoryItemRef[] = []
  const changed: FoundationHistoryChangedItem[] = []

  for (const [id, token] of Object.entries(after)) {
    const old = before[id]
    if (!old) {
      added.push(itemRef(token))
      continue
    }
    if (semanticFingerprint(old) !== semanticFingerprint(token)) {
      const fieldChanges = diffTokenFields(old, token)
      if (fieldChanges.length > 0) {
        changed.push({ ...itemRef(token), changes: fieldChanges })
      }
    }
  }

  for (const [id, token] of Object.entries(before)) {
    if (!after[id]) removed.push(itemRef(token))
  }

  added.sort((a, b) => a.name.localeCompare(b.name))
  removed.sort((a, b) => a.name.localeCompare(b.name))
  changed.sort((a, b) => a.name.localeCompare(b.name))

  return {
    kind: "diff",
    added,
    removed,
    changed,
  }
}

function summaryHasChanges(summary: FoundationHistorySummary): boolean {
  if (summary.kind === "initial" || summary.kind === "source_removed") return true
  return (
    summary.added.length > 0 ||
    summary.removed.length > 0 ||
    summary.changed.length > 0
  )
}

function makeHistoryId(): string {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Normalize stored foundations. Non-v2 payloads are discarded (no BC).
 */
export function normalizeFoundationsData(raw: unknown): FoundationsStoredData {
  if (!isPlainObject(raw)) return emptyStoredData()
  if (raw.version !== FOUNDATIONS_DATA_VERSION) return emptyStoredData()
  if (!isPlainObject(raw.sources)) return emptyStoredData()

  const sources: Record<string, FoundationSource> = {}
  for (const [key, value] of Object.entries(raw.sources as Record<string, unknown>)) {
    if (!isPlainObject(value)) continue
    if (!isPlainObject(value.tokens)) continue
    sources[key] = {
      fileKey: typeof value.fileKey === "string" ? value.fileKey : key,
      fileName:
        typeof value.fileName === "string" ? value.fileName : "Unknown file",
      updatedAt:
        typeof value.updatedAt === "string"
          ? value.updatedAt
          : new Date(0).toISOString(),
      tokens: value.tokens as Record<string, FoundationToken>,
    }
  }

  const history = Array.isArray(raw.history)
    ? (raw.history as FoundationHistoryEntry[])
    : []

  return {
    version: FOUNDATIONS_DATA_VERSION,
    sources,
    catalog: flattenCatalog(sources),
    history,
  }
}

export interface SyncFoundationsResult {
  data: FoundationsStoredData
  historyEntry: FoundationHistoryEntry | null
}

/**
 * Replace (or insert) one file's token slice, rebuild catalog, append history
 * only when something semantically changed (or on initial sync).
 */
export function syncFoundationsData(
  existingRaw: unknown,
  incoming: {
    fileKey: string
    fileName: string
    variables: Record<string, VariableCollectionExport>
    styles: FoundationalStyles
  },
): SyncFoundationsResult {
  const existing = normalizeFoundationsData(existingRaw)
  const wasV2 =
    isPlainObject(existingRaw) && existingRaw.version === FOUNDATIONS_DATA_VERSION
  const prevSource = wasV2 ? (existing.sources[incoming.fileKey] ?? null) : null
  const now = new Date().toISOString()

  const tokens = buildSourceTokens(incoming.fileKey, incoming.fileName, {
    variables: incoming.variables,
    styles: incoming.styles,
  })

  const nextSource: FoundationSource = {
    fileKey: incoming.fileKey,
    fileName: incoming.fileName,
    updatedAt: now,
    tokens,
  }

  let historyEntry: FoundationHistoryEntry | null = null

  if (!prevSource) {
    historyEntry = {
      id: makeHistoryId(),
      at: now,
      fileKey: incoming.fileKey,
      fileName: incoming.fileName,
      summary: {
        kind: "initial",
        added: [],
        removed: [],
        changed: [],
        counts: { tokens: Object.keys(tokens).length },
      },
    }
  } else {
    const summary = diffSourceTokens(prevSource, nextSource)
    if (summaryHasChanges(summary)) {
      historyEntry = {
        id: makeHistoryId(),
        at: now,
        fileKey: incoming.fileKey,
        fileName: incoming.fileName,
        summary,
      }
    }
  }

  const sources = {
    ...existing.sources,
    [incoming.fileKey]: nextSource,
  }
  const catalog = flattenCatalog(sources)

  // Wipe prior history when upgrading from non-v2; otherwise append.
  const baseHistory = wasV2 ? existing.history : []
  const history = historyEntry
    ? [...baseHistory, historyEntry].slice(-HISTORY_CAP)
    : baseHistory.slice(-HISTORY_CAP)

  return {
    data: {
      version: FOUNDATIONS_DATA_VERSION,
      sources,
      catalog,
      history,
    },
    historyEntry,
  }
}

/** Remove a source slice and append a source_removed history entry. */
export function removeFoundationSource(
  existingRaw: unknown,
  fileKey: string,
): SyncFoundationsResult {
  const existing = normalizeFoundationsData(existingRaw)
  const prev = existing.sources[fileKey]
  if (!prev) {
    return { data: existing, historyEntry: null }
  }

  const { [fileKey]: _removed, ...sources } = existing.sources
  const now = new Date().toISOString()
  const historyEntry: FoundationHistoryEntry = {
    id: makeHistoryId(),
    at: now,
    fileKey,
    fileName: prev.fileName,
    summary: {
      kind: "source_removed",
      added: [],
      removed: Object.values(prev.tokens).map(itemRef),
      changed: [],
      counts: { tokens: Object.keys(prev.tokens).length },
    },
  }

  const catalog = flattenCatalog(sources)
  const history = [...existing.history, historyEntry].slice(-HISTORY_CAP)

  return {
    data: {
      version: FOUNDATIONS_DATA_VERSION,
      sources,
      catalog,
      history,
    },
    historyEntry,
  }
}

export function formatHistorySummary(summary: FoundationHistorySummary): string {
  if (summary.kind === "initial") {
    return `initial sync · ${summary.counts?.tokens ?? 0} tokens`
  }
  if (summary.kind === "source_removed") {
    return `removed source · ${summary.counts?.tokens ?? summary.removed.length} tokens`
  }
  const parts: string[] = []
  if (summary.added.length) parts.push(`+${summary.added.length}`)
  if (summary.removed.length) parts.push(`−${summary.removed.length}`)
  if (summary.changed.length) parts.push(`~${summary.changed.length}`)
  return parts.length ? parts.join(" · ") : "no changes"
}
