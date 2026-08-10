import type { RecordModel } from "pocketbase"

export const FIGMA_NODE_TYPES = [
  "BOOLEAN_OPERATION", "CODE_BLOCK", "COMPONENT", "COMPONENT_SET", "CONNECTOR",
  "DOCUMENT", "ELLIPSE", "EMBED", "FRAME", "GROUP", "HIGHLIGHT", "INSTANCE",
  "INTERACTIVE_SLIDE_ELEMENT", "LINE", "LINK_UNFURL", "MEDIA", "PAGE",
  "POLYGON", "RECTANGLE", "SECTION", "SHAPE_WITH_TEXT", "SLICE", "SLIDE",
  "SLIDE_GRID", "SLIDE_ROW", "STAMP", "STAR", "STICKY", "TABLE", "TABLE_CELL",
  "TEXT", "TEXT_PATH", "TRANSFORM_GROUP", "VECTOR", "WASHI_TAPE", "WIDGET",
] as const

export type LayerType = (typeof FIGMA_NODE_TYPES)[number]

export type UserRole = "designer" | "developer"

export interface User extends RecordModel {
  email: string
  name?: string
  avatar?: string
  verified?: boolean
  /** `designer` can mutate; `developer` is read-only (view + copy). */
  role?: UserRole
}

export interface Project extends RecordModel {
  owner: string
  name: string
  thumbnail?: string
  thumbnail_url?: string
  figma_file_url?: string
  frame_count: number
  expand?: {
    owner?: User
  }
}

/** Optional screen group within a project. */
export interface Section extends RecordModel {
  project: string
  name: string
  sort_order?: number
  expand?: {
    project?: Project
  }
}

export interface Frame extends RecordModel {
  project: string
  /** Optional section id — groups screens in the project view. */
  section?: string
  name: string
  width?: number
  height?: number
  thumbnail?: string
  thumbnail_url?: string
  image?: string
  image_url?: string
  figma_url?: string
  /** Figma page name the screen was published from. */
  page_name?: string
  sort_order?: number
  expand?: {
    project?: Project
    section?: Section
  }
}

export interface Layer extends RecordModel {
  frame: string
  parent?: string
  name: string
  type: LayerType
  x?: number
  y?: number
  width?: number
  height?: number
  clickable?: boolean
  sort_order?: number
  /** Raw Figma node id for deep links. */
  figma_node_id?: string
}

export interface LayerDetail extends RecordModel {
  layer: string
  layout?: {
    position?: { x: number; y: number }
    dimensions?: { width: number; height: number }
    padding?: { top: number; right: number; bottom: number; left: number }
    margin?: { top: number; right: number; bottom: number; left: number }
    autoLayout?: {
      mode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID"
      direction?: "row" | "column"
      gap?: string
      justifyContent?: string
      alignItems?: string
      wrap?: "wrap" | "nowrap"
      sizingHorizontal?: "FIXED" | "HUG" | "FILL"
      sizingVertical?: "FIXED" | "HUG" | "FILL"
    }
    constraints?: {
      horizontal: string
      vertical: string
    }
  }
  styles?: {
    backgroundColor?: string
    borderRadius?: string
    borderWidth?: string
    borderColor?: string
    boxShadow?: string
    opacity?: number
    effects?: Array<{
      type: string
      name: string
      properties: Array<{ label: string; value: string }>
    }>
    backgroundColorToken?: { id: string; name: string }
    borderColorToken?: { id: string; name: string }
    effectStyle?: { id: string; name: string }
  }
  typography?: {
    fontFamily?: string
    fontSize?: string
    fontWeight?: string | number
    lineHeight?: string
    letterSpacing?: string
    color?: string
    textAlign?: string
    textDecoration?: string
    textTransform?: string
    characters?: string
    text?: string
    content?: string
    value?: string
    textStyle?: { id: string; name: string }
    colorToken?: { id: string; name: string }
  } | null
  code?: { css?: string; tailwind?: string; react?: string }
  component?: {
    kind: "COMPONENT" | "INSTANCE" | "COMPONENT_SET"
    name: string
    /** Figma `node.key` on this COMPONENT (stable for library components). */
    componentKey?: string
    /** For instances: key of the resolved main component. */
    mainComponentKey?: string
    /** For instances: node id of the resolved main component. */
    mainComponentId?: string
    mainComponentName?: string
    /** Figma `node.key` of the parent COMPONENT_SET when applicable. */
    componentSetKey?: string
    /** Node id of the parent COMPONENT_SET when applicable. */
    componentSetId?: string
    componentSetName?: string
    variantProperties?: Record<string, string>
    componentProperties?: Record<string, string>
  }
}

export interface Foundation extends RecordModel {
  slug: string
  data: FoundationsData
  variables_count: number
  styles_count: number
}

/** Token / style ref bound on a synced library component. */
export interface LibraryTokenRef {
  id: string
  name: string
}

/** Slim variant summary stored on `library_components.variants`. */
export interface LibraryComponentVariantSummary {
  key: string
  name: string
  properties: Record<string, string>
  figma_node_id: string
}

/** @deprecated Prefer LibraryComponentVariantSummary or LibraryComponentVariantRecord */
export type LibraryComponentVariant = LibraryComponentVariantSummary

/** Flattened overlay row stored on a component variant (not a PB `layers` row). */
export interface ComponentVariantLayer {
  id: string
  parent?: string
  name: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  clickable?: boolean
  sort_order?: number
  figma_node_id?: string
}

/** Specs keyed by Figma node id on a component variant. */
export interface ComponentVariantLayerDetail {
  layout?: LayerDetail["layout"]
  styles?: LayerDetail["styles"]
  typography?: LayerDetail["typography"]
  code?: LayerDetail["code"]
  component?: LayerDetail["component"]
}

export interface LibraryComponentVariantRecord extends RecordModel {
  library_component: string
  key: string
  name: string
  properties?: Record<string, string>
  figma_node_id?: string
  is_default?: boolean
  preview?: string
  width?: number
  height?: number
  layers?: ComponentVariantLayer[]
  layer_details?: Record<string, ComponentVariantLayerDetail>
  content_hash?: string
}

export interface LibraryComponent extends RecordModel {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  file_key: string
  file_name: string
  figma_node_id?: string
  page_name?: string
  hidden?: boolean
  preview?: string
  variants?: LibraryComponentVariantSummary[]
  tokens_used?: LibraryTokenRef[]
  description?: string
  content_hash?: string
}

export interface ComponentLibrarySource {
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

export interface ComponentLibrariesData {
  version: 1
  sources: Record<string, ComponentLibrarySource>
  history: ComponentLibraryHistoryEntry[]
}

export interface ComponentLibrary extends RecordModel {
  slug: string
  data: ComponentLibrariesData
  components_count: number
}

export type FoundationCategory =
  | "color"
  | "typography"
  | "number"
  | "shadow"
  | "blur"
  | "grid"
  | "other"

export type FoundationNumberKind = "spacing" | "radius" | "other"

export type FoundationOrigin =
  | "variable"
  | "paint"
  | "text"
  | "effect"
  | "grid"

export type FoundationSemanticValue =
  | { kind: "color"; hex: string; css: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "alias"; aliasId: string; aliasName: string; aliasKey?: string }
  | {
      kind: "shadow"
      x: number
      y: number
      blur: number
      spread: number
      color: string
      opacity: number
      inset: boolean
    }
  | { kind: "blur"; radius: number; type: "LAYER_BLUR" | "BACKGROUND_BLUR" }
  | {
      kind: "shadows"
      shadows: Array<{
        x: number
        y: number
        blur: number
        spread: number
        color: string
        opacity: number
        inset: boolean
      }>
    }
  | {
      kind: "blurs"
      blurs: Array<{ radius: number; type: "LAYER_BLUR" | "BACKGROUND_BLUR" }>
    }
  | {
      kind: "text"
      family: string
      style: string
      size: number
      weight: number
      lineHeight: string
      letterSpacing: string
    }
  | { kind: "paint"; css: string; hex?: string; paints: unknown[] }
  | { kind: "grid"; grids: unknown[] }
  | { kind: "unknown"; raw: unknown }

export type FoundationAliasStep = {
  id: string
  name: string
}

export type FoundationResolvedModeValue = {
  value: FoundationSemanticValue
  aliasChain: FoundationAliasStep[]
  unresolved?: boolean
}

export type FoundationToken = {
  id: string
  name: string
  /** Original Figma variable/style id when catalog key was namespaced. */
  sourceId?: string
  /**
   * Stable Figma variable key (same across library publish / consumer files).
   * Used to resolve aliases that point at library variables from another source.
   */
  key?: string
  sourceFileKey: string
  sourceFileName: string
  category: FoundationCategory
  numberKind?: FoundationNumberKind
  origin: FoundationOrigin
  collectionName?: string
  description?: string
  codeSyntax?: Record<string, string>
  modes?: { modeId: string; name: string }[]
  valuesByMode?: Record<string, FoundationSemanticValue>
  value?: FoundationSemanticValue
  /** Resolved concrete values per mode (cross-source alias walk). */
  resolvedByMode?: Record<string, FoundationResolvedModeValue>
  /** Resolved value for single-value (style) tokens. */
  resolved?: FoundationResolvedModeValue
  css?: string
}

export type FoundationSource = {
  fileKey: string
  fileName: string
  updatedAt: string
  tokens: Record<string, FoundationToken>
}

export type FoundationHistoryItemRef = {
  id: string
  name: string
  category: FoundationCategory
}

export type FoundationHistoryFieldChange = {
  path: string
  before: unknown
  after: unknown
}

export type FoundationHistoryChangedItem = FoundationHistoryItemRef & {
  changes: FoundationHistoryFieldChange[]
}

export type FoundationHistorySummary = {
  kind: "initial" | "diff" | "source_removed"
  added: FoundationHistoryItemRef[]
  removed: FoundationHistoryItemRef[]
  changed: FoundationHistoryChangedItem[]
  counts?: { tokens: number }
}

export type FoundationHistoryEntry = {
  id: string
  at: string
  fileKey: string
  fileName: string
  summary: FoundationHistorySummary
}

export type FoundationsData = {
  version?: number
  sources?: Record<string, FoundationSource>
  catalog?: Record<string, FoundationToken>
  history?: FoundationHistoryEntry[]
}

export const FEEDBACK_TYPES = ["bug", "idea", "ux"] as const
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

/** Product feedback about Design Handoff (Admin reviews in PocketBase). */
export interface Feedback extends RecordModel {
  author: string
  type: FeedbackType
  message: string
  page?: string
  expand?: {
    author?: User
  }
}
