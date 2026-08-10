/// <reference types="@figma/plugin-typings" />

// ─── Component library sync: local COMPONENT / COMPONENT_SET → PocketBase ───

import type { TokenRef } from "../types"
import { getFoundationFileIdentity } from "./foundational"

const HISTORY_CAP = 50
export const COMPONENT_LIBRARIES_DATA_VERSION = 1 as const

export interface LibraryComponentVariant {
  key: string
  name: string
  properties: Record<string, string>
  figma_node_id: string
}

export interface ExtractedLibraryComponent {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  figma_node_id: string
  description: string
  variants: LibraryComponentVariant[]
  tokens_used: TokenRef[]
  content_hash: string
  previewBytes: Uint8Array
  previewFileName: string
}

export interface ComponentLibrarySourceMeta {
  fileKey: string
  fileName: string
  updatedAt: string
  componentKeys: string[]
}

export interface ComponentLibraryHistoryItemRef {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
}

export interface ComponentLibraryHistorySummary {
  kind: "initial" | "diff" | "source_removed"
  added: ComponentLibraryHistoryItemRef[]
  removed: ComponentLibraryHistoryItemRef[]
  changed: ComponentLibraryHistoryItemRef[]
  counts?: { components: number }
}

export interface ComponentLibraryHistoryEntry {
  id: string
  at: string
  fileKey: string
  fileName: string
  summary: ComponentLibraryHistorySummary
}

export interface ComponentLibrariesStoredData {
  version: 1
  sources: Record<string, ComponentLibrarySourceMeta>
  history: ComponentLibraryHistoryEntry[]
}

function emptyStoredData(): ComponentLibrariesStoredData {
  return {
    version: COMPONENT_LIBRARIES_DATA_VERSION,
    sources: {},
    history: [],
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

function fnv1aHex(input: string | Uint8Array): string {
  let hash = 0x811c9dc5
  if (typeof input === "string") {
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      hash ^= input[i]
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function historyId(): string {
  return `clh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeComponentLibrariesData(
  raw: unknown,
): ComponentLibrariesStoredData {
  if (!isPlainObject(raw) || raw.version !== COMPONENT_LIBRARIES_DATA_VERSION) {
    return emptyStoredData()
  }
  const sources: Record<string, ComponentLibrarySourceMeta> = {}
  if (isPlainObject(raw.sources)) {
    for (const [key, value] of Object.entries(raw.sources)) {
      if (!isPlainObject(value)) continue
      const componentKeys = Array.isArray(value.componentKeys)
        ? value.componentKeys.filter((k): k is string => typeof k === "string")
        : []
      sources[key] = {
        fileKey: typeof value.fileKey === "string" ? value.fileKey : key,
        fileName: typeof value.fileName === "string" ? value.fileName : key,
        updatedAt:
          typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date().toISOString(),
        componentKeys,
      }
    }
  }
  const history: ComponentLibraryHistoryEntry[] = Array.isArray(raw.history)
    ? (raw.history as ComponentLibraryHistoryEntry[]).filter(
        (entry) => entry && typeof entry === "object" && typeof entry.id === "string",
      )
    : []
  return { version: 1, sources, history }
}

async function resolveStyleRef(styleId: string | typeof figma.mixed): Promise<TokenRef | undefined> {
  if (!styleId || styleId === figma.mixed || typeof styleId !== "string") return undefined
  try {
    const style = await figma.getStyleByIdAsync(styleId)
    if (!style) return undefined
    return { id: style.id, name: style.name }
  } catch {
    return undefined
  }
}

async function resolveVariableAlias(
  alias: VariableAlias | undefined | null,
): Promise<TokenRef | undefined> {
  if (!alias || alias.type !== "VARIABLE_ALIAS" || !alias.id) return undefined
  try {
    const variable = await figma.variables.getVariableByIdAsync(alias.id)
    if (!variable) return undefined
    return { id: variable.id, name: variable.name }
  } catch {
    return undefined
  }
}

async function collectTokensUsed(root: SceneNode): Promise<TokenRef[]> {
  const byId = new Map<string, TokenRef>()

  const add = (ref: TokenRef | undefined) => {
    if (ref) byId.set(ref.id, ref)
  }

  async function visit(node: SceneNode): Promise<void> {
    if ("fillStyleId" in node) add(await resolveStyleRef(node.fillStyleId))
    if ("strokeStyleId" in node) add(await resolveStyleRef(node.strokeStyleId))
    if ("effectStyleId" in node) add(await resolveStyleRef(node.effectStyleId))
    if ("gridStyleId" in node) add(await resolveStyleRef(node.gridStyleId))
    if (node.type === "TEXT") {
      add(await resolveStyleRef(node.textStyleId))
    }

    if ("boundVariables" in node && node.boundVariables) {
      for (const value of Object.values(node.boundVariables)) {
        if (!value) continue
        if (Array.isArray(value)) {
          for (const item of value) {
            add(await resolveVariableAlias(item as VariableAlias))
          }
        } else {
          add(await resolveVariableAlias(value as VariableAlias))
        }
      }
    }

    if ("fills" in node && Array.isArray(node.fills)) {
      for (const paint of node.fills) {
        if (paint && typeof paint === "object" && "boundVariables" in paint) {
          const color = (paint as SolidPaint).boundVariables?.color
          add(await resolveVariableAlias(color))
        }
      }
    }
    if ("strokes" in node && Array.isArray(node.strokes)) {
      for (const paint of node.strokes) {
        if (paint && typeof paint === "object" && "boundVariables" in paint) {
          const color = (paint as SolidPaint).boundVariables?.color
          add(await resolveVariableAlias(color))
        }
      }
    }

    if ("children" in node) {
      for (const child of node.children) {
        await visit(child)
      }
    }
  }

  await visit(root)
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

async function walkPages(visit: (node: SceneNode) => void): Promise<void> {
  // manifest.json uses documentAccess: "dynamic-page" — pages must be loaded
  // before reading `.children`.
  await figma.loadAllPagesAsync()
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue
    const stack: SceneNode[] = [...page.children]
    while (stack.length > 0) {
      const node = stack.pop()!
      visit(node)
      if ("children" in node) {
        for (const child of node.children) stack.push(child)
      }
    }
  }
}

/** Top-level library entries: COMPONENT_SETs and standalone COMPONENTs. */
export async function findLibraryRoots(): Promise<
  Array<ComponentNode | ComponentSetNode>
> {
  const roots: Array<ComponentNode | ComponentSetNode> = []
  await walkPages((node) => {
    if (node.type === "COMPONENT_SET") {
      roots.push(node)
    } else if (node.type === "COMPONENT") {
      const parent = node.parent
      if (!parent || parent.type !== "COMPONENT_SET") {
        roots.push(node)
      }
    }
  })
  return roots
}

async function exportPreview(node: SceneNode): Promise<Uint8Array> {
  return node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
  })
}

function variantPropertiesOf(component: ComponentNode): Record<string, string> {
  // Figma throws when the parent COMPONENT_SET has existing errors.
  try {
    if (!component.variantProperties) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(component.variantProperties)) {
      out[k] = String(v)
    }
    return out
  } catch {
    return {}
  }
}

function computeContentHash(args: {
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  description: string
  variants: LibraryComponentVariant[]
  tokens_used: TokenRef[]
  previewBytes: Uint8Array
}): string {
  const meta = stableStringify({
    name: args.name,
    kind: args.kind,
    description: args.description,
    variants: args.variants,
    tokens_used: args.tokens_used,
  })
  return `${fnv1aHex(meta)}_${fnv1aHex(args.previewBytes)}_${args.previewBytes.length}`
}

async function extractOne(
  node: ComponentNode | ComponentSetNode,
): Promise<ExtractedLibraryComponent> {
  const kind: "COMPONENT" | "COMPONENT_SET" =
    node.type === "COMPONENT_SET" ? "COMPONENT_SET" : "COMPONENT"
  const description =
    "description" in node && typeof node.description === "string"
      ? node.description
      : ""

  let variants: LibraryComponentVariant[] = []
  let previewNode: SceneNode = node

  let nodeKey: string
  try {
    nodeKey = node.key
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot read key for “${node.name}”: ${message}`)
  }

  if (node.type === "COMPONENT_SET") {
    const children = node.children.filter(
      (c): c is ComponentNode => c.type === "COMPONENT",
    )
    variants = children.map((c) => {
      let childKey = ""
      try {
        childKey = c.key
      } catch {
        childKey = c.id
      }
      return {
        key: childKey,
        name: c.name,
        properties: variantPropertiesOf(c),
        figma_node_id: c.id,
      }
    })
    try {
      const def = node.defaultVariant
      if (def) previewNode = def
      else if (children[0]) previewNode = children[0]
    } catch {
      if (children[0]) previewNode = children[0]
    }
  } else {
    variants = [
      {
        key: nodeKey,
        name: node.name,
        properties: variantPropertiesOf(node),
        figma_node_id: node.id,
      },
    ]
  }

  const tokens_used = await collectTokensUsed(node)
  const previewBytes = await exportPreview(previewNode)
  const content_hash = computeContentHash({
    name: node.name,
    kind,
    description,
    variants,
    tokens_used,
    previewBytes,
  })

  return {
    key: nodeKey,
    name: node.name,
    kind,
    figma_node_id: node.id,
    description,
    variants,
    tokens_used,
    content_hash,
    previewBytes,
    previewFileName: `${nodeKey.slice(0, 24)}.png`,
  }
}

/** Extract all local library components from the current file (with PNG previews). */
export async function extractLibraryComponents(
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<{
  fileKey: string
  fileName: string
  components: ExtractedLibraryComponent[]
}> {
  const { fileKey, fileName } = getFoundationFileIdentity()
  const roots = await findLibraryRoots()
  const components: ExtractedLibraryComponent[] = []
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]
    onProgress?.(i + 1, roots.length, root.name)
    try {
      components.push(await extractOne(root))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to export component “${root.name}”: ${message}`)
    }
  }
  components.sort((a, b) => a.name.localeCompare(b.name))
  return { fileKey, fileName, components }
}

export interface ExistingLibraryComponentRow {
  id: string
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  content_hash?: string
}

export interface ComponentSyncPlan {
  fileKey: string
  fileName: string
  toCreate: ExtractedLibraryComponent[]
  toUpdate: Array<{ existingId: string; component: ExtractedLibraryComponent }>
  toDeleteIds: string[]
  historyEntry: ComponentLibraryHistoryEntry | null
  nextMeta: ComponentLibrariesStoredData
  componentsCount: number
}

function itemRef(c: {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
}): ComponentLibraryHistoryItemRef {
  return { key: c.key, name: c.name, kind: c.kind }
}

/**
 * Build upsert/delete plan + updated singleton meta.
 * Returns historyEntry=null when nothing changed (caller should skip PB writes).
 */
export function planComponentSync(args: {
  existingMetaRaw: unknown
  existingRows: ExistingLibraryComponentRow[]
  fileKey: string
  fileName: string
  extracted: ExtractedLibraryComponent[]
}): ComponentSyncPlan {
  const base = normalizeComponentLibrariesData(args.existingMetaRaw)
  const existingByKey = new Map(args.existingRows.map((r) => [r.key, r]))
  const extractedByKey = new Map(args.extracted.map((c) => [c.key, c]))

  const toCreate: ExtractedLibraryComponent[] = []
  const toUpdate: Array<{
    existingId: string
    component: ExtractedLibraryComponent
  }> = []
  const toDeleteIds: string[] = []
  const added: ComponentLibraryHistoryItemRef[] = []
  const removed: ComponentLibraryHistoryItemRef[] = []
  const changed: ComponentLibraryHistoryItemRef[] = []

  for (const component of args.extracted) {
    const prev = existingByKey.get(component.key)
    if (!prev) {
      toCreate.push(component)
      added.push(itemRef(component))
    } else if (prev.content_hash !== component.content_hash) {
      toUpdate.push({ existingId: prev.id, component })
      changed.push(itemRef(component))
    }
  }

  for (const row of args.existingRows) {
    if (!extractedByKey.has(row.key)) {
      toDeleteIds.push(row.id)
      removed.push(itemRef(row))
    }
  }

  const prevSource = base.sources[args.fileKey]
  const isInitial = !prevSource
  const hasChanges =
    added.length > 0 || removed.length > 0 || changed.length > 0 || isInitial

  const nextKeys = args.extracted.map((c) => c.key)
  const sources = { ...base.sources }
  sources[args.fileKey] = {
    fileKey: args.fileKey,
    fileName: args.fileName,
    updatedAt: new Date().toISOString(),
    componentKeys: nextKeys,
  }

  // Count unique keys across all sources after this sync
  const allKeys = new Set<string>()
  for (const src of Object.values(sources)) {
    for (const k of src.componentKeys) allKeys.add(k)
  }

  if (!hasChanges) {
    return {
      fileKey: args.fileKey,
      fileName: args.fileName,
      toCreate: [],
      toUpdate: [],
      toDeleteIds: [],
      historyEntry: null,
      nextMeta: base,
      componentsCount: allKeys.size,
    }
  }

  // Empty initial sync (no components in file, first time) still records history
  const summary: ComponentLibraryHistorySummary = {
    kind: isInitial ? "initial" : "diff",
    added,
    removed,
    changed,
    counts: { components: nextKeys.length },
  }

  // If initial and truly empty and no prior sources at all, still write so the
  // source appears in the dashboard.
  const historyEntry: ComponentLibraryHistoryEntry = {
    id: historyId(),
    at: new Date().toISOString(),
    fileKey: args.fileKey,
    fileName: args.fileName,
    summary,
  }

  const history = [...base.history, historyEntry].slice(-HISTORY_CAP)

  return {
    fileKey: args.fileKey,
    fileName: args.fileName,
    toCreate,
    toUpdate,
    toDeleteIds,
    historyEntry,
    nextMeta: {
      version: 1,
      sources,
      history,
    },
    componentsCount: allKeys.size,
  }
}

export function removeComponentLibrarySource(
  existingMetaRaw: unknown,
  fileKey: string,
  /** Keys that belonged to this source (from meta or caller). */
  keysToRemove: string[],
): {
  data: ComponentLibrariesStoredData
  historyEntry: ComponentLibraryHistoryEntry | null
  deleteKeys: string[]
  componentsCount: number
} {
  const base = normalizeComponentLibrariesData(existingMetaRaw)
  const prev = base.sources[fileKey]
  if (!prev) {
    const allKeys = new Set<string>()
    for (const src of Object.values(base.sources)) {
      for (const k of src.componentKeys) allKeys.add(k)
    }
    return {
      data: base,
      historyEntry: null,
      deleteKeys: [],
      componentsCount: allKeys.size,
    }
  }

  const sources = { ...base.sources }
  delete sources[fileKey]

  const deleteKeys = keysToRemove.length > 0 ? keysToRemove : prev.componentKeys
  const historyEntry: ComponentLibraryHistoryEntry = {
    id: historyId(),
    at: new Date().toISOString(),
    fileKey,
    fileName: prev.fileName,
    summary: {
      kind: "source_removed",
      added: [],
      removed: deleteKeys.map((key) => ({
        key,
        name: key,
        kind: "COMPONENT" as const,
      })),
      changed: [],
      counts: { components: 0 },
    },
  }
  const history = [...base.history, historyEntry].slice(-HISTORY_CAP)

  const allKeys = new Set<string>()
  for (const src of Object.values(sources)) {
    for (const k of src.componentKeys) allKeys.add(k)
  }

  return {
    data: { version: 1, sources, history },
    historyEntry,
    deleteKeys,
    componentsCount: allKeys.size,
  }
}

export function formatComponentHistorySummary(
  summary: ComponentLibraryHistorySummary,
): string {
  if (summary.kind === "initial") {
    const n = summary.counts?.components ?? summary.added.length
    return `initial sync (${n} component${n === 1 ? "" : "s"})`
  }
  if (summary.kind === "source_removed") {
    return "source removed"
  }
  const parts: string[] = []
  if (summary.added.length) parts.push(`+${summary.added.length}`)
  if (summary.removed.length) parts.push(`-${summary.removed.length}`)
  if (summary.changed.length) parts.push(`~${summary.changed.length}`)
  return parts.length > 0 ? parts.join(" ") : "updated"
}
