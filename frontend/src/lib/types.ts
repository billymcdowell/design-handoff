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

export type FoundationSource = {
  fileKey: string
  fileName: string
  updatedAt: string
  variables?: FoundationsData["variables"]
  styles?: FoundationsData["styles"]
}

export type FoundationHistorySummary = {
  added: string[]
  removed: string[]
  changed: string[]
}

export type FoundationHistoryEntry = {
  id: string
  at: string
  fileKey: string
  fileName: string
  summary: FoundationHistorySummary
}

export type FoundationsData = {
  /** Per-Figma-file slices; flat variables/styles are a merged view. */
  sources?: Record<string, FoundationSource>
  history?: FoundationHistoryEntry[]
  variables?: Record<
    string,
    {
      id: string
      name: string
      modes: Array<{ modeId: string; name: string }>
      variables: Array<{
        id: string
        name: string
        type: string
        description?: string
        scopes?: string[]
        codeSyntax?: Record<string, string>
        valuesByMode?: Record<string, unknown>
      }>
    }
  >
  styles?: {
    paint?: Array<{ id: string; name: string; description?: string; type: string; paints?: unknown[] }>
    text?: Array<{
      id: string
      name: string
      description?: string
      type: string
      fontName?: { family?: string; style?: string }
      fontSize?: number
      fontWeight?: number
      lineHeight?: { value?: number; unit?: string } | number
      letterSpacing?: { value?: number; unit?: string } | number
      textDecoration?: string
      paragraphIndent?: number
      paragraphSpacing?: number
      textCase?: string
    }>
    effect?: Array<{ id: string; name: string; description?: string; type: string; effects?: unknown[] }>
    grid?: Array<{ id: string; name: string; description?: string; type: string; layoutGrids?: unknown[] }>
  }
}
