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

export type UserRole = "super" | "developer"

export interface User extends RecordModel {
  email: string
  name?: string
  avatar?: string
  verified?: boolean
  /** `super` can mutate; `developer` is read-only (view + copy). */
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

export interface Frame extends RecordModel {
  project: string
  name: string
  width?: number
  height?: number
  thumbnail?: string
  thumbnail_url?: string
  image?: string
  image_url?: string
  figma_url?: string
  sort_order?: number
  expand?: {
    project?: Project
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
}

export interface LayerDetail extends RecordModel {
  layer: string
  layout?: {
    position?: { x: number; y: number }
    dimensions?: { width: number; height: number }
    padding?: { top: number; right: number; bottom: number; left: number }
    margin?: { top: number; right: number; bottom: number; left: number }
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
}

export interface Foundation extends RecordModel {
  owner: string
  data: FoundationsData
  variables_count: number
  styles_count: number
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
  | { kind: "alias"; aliasId: string; aliasName: string }
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

export type FoundationToken = {
  id: string
  name: string
  sourceFileKey: string
  sourceFileName: string
  category: FoundationCategory
  numberKind?: FoundationNumberKind
  origin: FoundationOrigin
  collectionName?: string
  description?: string
  modes?: { modeId: string; name: string }[]
  valuesByMode?: Record<string, FoundationSemanticValue>
  value?: FoundationSemanticValue
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
