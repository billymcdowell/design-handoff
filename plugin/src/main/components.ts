/// <reference types="@figma/plugin-typings" />

// ─── Component library sync: local COMPONENT / COMPONENT_SET → PocketBase ───

import type { Layer, LayerDetail, TokenRef } from "../types"
import {
  isNodeVisibleInFrame,
  nodeToLayer,
  nodeToLayerDetail,
} from "./cssEngine"
import { getFoundationFileIdentity } from "./foundational"
import { resolvePageName } from "./publish"

const HISTORY_CAP = 50
export const COMPONENT_LIBRARIES_DATA_VERSION = 1 as const

export interface LibraryComponentVariant {
  key: string
  name: string
  properties: Record<string, string>
  figma_node_id: string
}

/** Flattened overlay row persisted on library_component_variants.layers */
export interface ExtractedVariantLayer {
  id: string
  parent?: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  clickable: boolean
  sort_order: number
  figma_node_id: string
}

export interface ExtractedVariantLayerDetail {
  layout: LayerDetail["layout"]
  styles: LayerDetail["styles"]
  typography: LayerDetail["typography"]
  code: LayerDetail["code"]
  component?: LayerDetail["component"]
}

export interface ExtractedLibraryComponentVariant {
  key: string
  name: string
  properties: Record<string, string>
  figma_node_id: string
  is_default: boolean
  width: number
  height: number
  layers: ExtractedVariantLayer[]
  layer_details: Record<string, ExtractedVariantLayerDetail>
  content_hash: string
  previewBytes: Uint8Array
  previewFileName: string
}

export interface ExtractedLibraryComponent {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  figma_node_id: string
  page_name: string
  hidden: boolean
  description: string
  /** Slim summary mirrored to library_components.variants */
  variants: LibraryComponentVariant[]
  /** Full per-variant preview + inspect payload */
  variantPayloads: ExtractedLibraryComponentVariant[]
  tokens_used: TokenRef[]
  content_hash: string
  previewBytes: Uint8Array
  previewFileName: string
}

export function isHiddenName(name: string | undefined | null): boolean {
  if (!name) return false
  const trimmed = name.trim()
  return trimmed.startsWith(".") || trimmed.startsWith("_")
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

async function walkPages(
  visit: (node: SceneNode, pageName: string) => void,
): Promise<void> {
  // manifest.json uses documentAccess: "dynamic-page" — pages must be loaded
  // before reading `.children`.
  await figma.loadAllPagesAsync()
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue
    const pageName = page.name
    const stack: SceneNode[] = [...page.children]
    while (stack.length > 0) {
      const node = stack.pop()!
      visit(node, pageName)
      if ("children" in node) {
        for (const child of node.children) stack.push(child)
      }
    }
  }
}

export interface LibraryRootEntry {
  node: ComponentNode | ComponentSetNode
  pageName: string
}

/** Top-level library entries: COMPONENT_SETs and standalone COMPONENTs. */
export async function findLibraryRoots(): Promise<LibraryRootEntry[]> {
  const roots: LibraryRootEntry[] = []
  await walkPages((node, pageName) => {
    if (node.type === "COMPONENT_SET") {
      roots.push({ node, pageName })
    } else if (node.type === "COMPONENT") {
      const parent = node.parent
      if (!parent || parent.type !== "COMPONENT_SET") {
        roots.push({ node, pageName })
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

function flattenVariantLayers(tree: Layer[]): ExtractedVariantLayer[] {
  const out: ExtractedVariantLayer[] = []

  function walk(nodes: Layer[], parentId: string | undefined) {
    nodes.forEach((layer, siblingIndex) => {
      out.push({
        id: layer.id,
        ...(parentId ? { parent: parentId } : {}),
        name: layer.name,
        type: layer.type,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        clickable: layer.clickable,
        sort_order: siblingIndex,
        figma_node_id: layer.id,
      })
      if (layer.children && layer.children.length > 0) {
        walk(layer.children, layer.id)
      }
    })
  }

  walk(tree, undefined)
  return out
}

async function collectLayerDetailsRecursively(
  node: SceneNode,
  root: SceneNode,
  sink: Record<string, ExtractedVariantLayerDetail>,
): Promise<void> {
  if (!isNodeVisibleInFrame(node, root)) return

  const detail = await nodeToLayerDetail(node, root)
  if (detail) {
    sink[detail.id] = {
      layout: detail.layout,
      styles: detail.styles,
      typography: detail.typography,
      code: detail.code,
      ...(detail.component ? { component: detail.component } : {}),
    }
  }

  if ("children" in node && node.children.length > 0) {
    await Promise.all(
      node.children.map((child) =>
        collectLayerDetailsRecursively(child, root, sink),
      ),
    )
  }
}

async function extractVariantPayload(
  component: ComponentNode,
  isDefault: boolean,
): Promise<ExtractedLibraryComponentVariant> {
  let key = ""
  try {
    key = component.key
  } catch {
    key = component.id
  }

  const width = Math.round(component.width)
  const height = Math.round(component.height)

  let layersTree: Layer[] = []
  if ("children" in component && component.children.length > 0) {
    const visibleChildren = component.children.filter((child) =>
      isNodeVisibleInFrame(child, component),
    )
    layersTree = visibleChildren
      .map((child) => nodeToLayer(child, component))
      .filter((l): l is Layer => l !== null)
  }

  const layers = flattenVariantLayers(layersTree)
  const layer_details: Record<string, ExtractedVariantLayerDetail> = {}
  if ("children" in component && component.children.length > 0) {
    const visibleChildren = component.children.filter((child) =>
      isNodeVisibleInFrame(child, component),
    )
    await Promise.all(
      visibleChildren.map((child) =>
        collectLayerDetailsRecursively(child, component, layer_details),
      ),
    )
  }

  const previewBytes = await exportPreview(component)
  const properties = variantPropertiesOf(component)
  const content_hash = `${fnv1aHex(
    stableStringify({
      key,
      name: component.name,
      properties,
      width,
      height,
      layers,
      layer_details,
    }),
  )}_${fnv1aHex(previewBytes)}_${previewBytes.length}`

  return {
    key,
    name: component.name,
    properties,
    figma_node_id: component.id,
    is_default: isDefault,
    width,
    height,
    layers,
    layer_details,
    content_hash,
    previewBytes,
    previewFileName: `${key.slice(0, 24)}.png`,
  }
}

function computeContentHash(args: {
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  description: string
  page_name: string
  hidden: boolean
  variants: LibraryComponentVariant[]
  variantHashes: string[]
  tokens_used: TokenRef[]
  previewBytes: Uint8Array
}): string {
  const meta = stableStringify({
    name: args.name,
    kind: args.kind,
    description: args.description,
    page_name: args.page_name,
    hidden: args.hidden,
    variants: args.variants,
    variantHashes: args.variantHashes,
    tokens_used: args.tokens_used,
  })
  return `${fnv1aHex(meta)}_${fnv1aHex(args.previewBytes)}_${args.previewBytes.length}`
}

async function extractOne(
  node: ComponentNode | ComponentSetNode,
  pageName: string,
): Promise<ExtractedLibraryComponent> {
  const kind: "COMPONENT" | "COMPONENT_SET" =
    node.type === "COMPONENT_SET" ? "COMPONENT_SET" : "COMPONENT"
  const description =
    "description" in node && typeof node.description === "string"
      ? node.description
      : ""
  const resolvedPage =
    pageName || resolvePageName(node) || "Uncategorized"
  const hidden = isHiddenName(node.name) || isHiddenName(resolvedPage)

  let nodeKey: string
  try {
    nodeKey = node.key
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot read key for “${node.name}”: ${message}`)
  }

  const componentNodes: ComponentNode[] = []
  let defaultKey = ""

  if (node.type === "COMPONENT_SET") {
    const children = node.children.filter(
      (c): c is ComponentNode => c.type === "COMPONENT",
    )
    componentNodes.push(...children)
    try {
      const def = node.defaultVariant
      if (def) {
        try {
          defaultKey = def.key
        } catch {
          defaultKey = def.id
        }
      }
    } catch {
      /* keep empty — fall through to first child */
    }
    if (!defaultKey && children[0]) {
      try {
        defaultKey = children[0].key
      } catch {
        defaultKey = children[0].id
      }
    }
  } else {
    componentNodes.push(node)
    defaultKey = nodeKey
  }

  const variantPayloads: ExtractedLibraryComponentVariant[] = []
  for (const child of componentNodes) {
    let childKey = ""
    try {
      childKey = child.key
    } catch {
      childKey = child.id
    }
    variantPayloads.push(
      await extractVariantPayload(child, childKey === defaultKey),
    )
  }

  // Ensure exactly one default when possible
  if (variantPayloads.length > 0 && !variantPayloads.some((v) => v.is_default)) {
    variantPayloads[0].is_default = true
  }

  const variants: LibraryComponentVariant[] = variantPayloads.map((v) => ({
    key: v.key,
    name: v.name,
    properties: v.properties,
    figma_node_id: v.figma_node_id,
  }))

  const defaultVariant =
    variantPayloads.find((v) => v.is_default) ?? variantPayloads[0]
  const previewBytes = defaultVariant?.previewBytes ?? (await exportPreview(node))
  const previewFileName = `${nodeKey.slice(0, 24)}.png`

  const tokens_used = await collectTokensUsed(node)
  const content_hash = computeContentHash({
    name: node.name,
    kind,
    description,
    page_name: resolvedPage,
    hidden,
    variants,
    variantHashes: variantPayloads.map((v) => v.content_hash),
    tokens_used,
    previewBytes,
  })

  return {
    key: nodeKey,
    name: node.name,
    kind,
    figma_node_id: node.id,
    page_name: resolvedPage,
    hidden,
    description,
    variants,
    variantPayloads,
    tokens_used,
    content_hash,
    previewBytes,
    previewFileName,
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
    const { node, pageName } = roots[i]
    onProgress?.(i + 1, roots.length, node.name)
    try {
      components.push(await extractOne(node, pageName))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to export component “${node.name}”: ${message}`)
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
