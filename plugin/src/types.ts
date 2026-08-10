// ─── Shared type definitions ──────────────────────────────────────────────
// The plugin builds these camelCase structures internally, then maps them onto
// stock PocketBase fields at upload time (see src/main/upload.ts).

// --- Backend entities (plugin-internal shape) ---

export interface Project {
  id: string
  name: string
  thumbnail: string
  figmaFileUrl: string
  frameCount: number
  lastUpdated: string
  createdBy: string
}

export interface Frame {
  id: string // "frame_{sanitized_figma_id}"
  name: string
  width: number // Math.round
  height: number // Math.round
  thumbnail: string // placeholder SVG URL
  figmaUrl: string // deep link with node-id
  /** Figma page name the frame was published from. */
  pageName?: string
}

export interface Layer {
  id: string // raw Figma node.id (NOT sanitized)
  name: string
  type: string // Figma node.type string e.g. "FRAME", "TEXT"
  x: number
  y: number
  width: number
  height: number
  clickable: boolean // always true
  children?: Layer[]
}

export interface FrameDetail extends Frame {
  imageUrl: string // "" or "__PENDING_UPLOAD__…" — real bytes live in main's image store
  layers: Layer[] // hierarchical tree, depth 0 = direct children of frame
}

/** Structured auto-layout specs for the frame inspector (separate from generated CSS). */
export interface AutoLayoutSpec {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID"
  direction?: "row" | "column"
  gap?: string
  justifyContent?: string
  alignItems?: string
  wrap?: "wrap" | "nowrap"
  sizingHorizontal?: "FIXED" | "HUG" | "FILL"
  sizingVertical?: "FIXED" | "HUG" | "FILL"
}

export interface ConstraintsSpec {
  horizontal: string
  vertical: string
}

/** Component / instance identity for handoff context. */
export interface ComponentSpec {
  kind: "COMPONENT" | "INSTANCE" | "COMPONENT_SET"
  name: string
  mainComponentName?: string
  componentSetName?: string
  variantProperties?: Record<string, string>
  componentProperties?: Record<string, string>
}

export interface Layout {
  position: { x: number; y: number }
  dimensions: { width: number; height: number }
  padding?: { top: number; right: number; bottom: number; left: number }
  margin?: { top: number; right: number; bottom: number; left: number }
  autoLayout?: AutoLayoutSpec
  constraints?: ConstraintsSpec
}

/** Figma variable or style reference resolved at publish time. */
export interface TokenRef {
  id: string
  name: string
}

/** A single Figma effect, serialized for the frame inspector. */
export interface EffectDetail {
  /** Figma effect type, e.g. "DROP_SHADOW", "LAYER_BLUR". */
  type: string
  /** Human-readable label matching Figma's Effects UI. */
  name: string
  /** Display-ready property rows for the inspector. */
  properties: Array<{ label: string; value: string }>
}

export interface Styles {
  backgroundColor: string
  borderRadius?: string
  borderWidth?: string
  borderColor?: string
  boxShadow?: string
  opacity: number
  /** Per-effect breakdown (drop shadow, blurs, noise, glass, etc.). */
  effects?: EffectDetail[]
  /** Color variable bound to the primary fill (non-text layers). */
  backgroundColorToken?: TokenRef
  /** Color variable bound to the primary stroke. */
  borderColorToken?: TokenRef
  /** Applied local/library effect style (shadows, blurs, etc.). */
  effectStyle?: TokenRef
}

export interface Typography {
  fontFamily: string
  fontSize: string // e.g. "16px"
  fontWeight: number | string
  lineHeight: string // e.g. "24px"
  letterSpacing: string // e.g. "0px"
  color: string
  textAlign: string // "left" | "center" | "right"
  textDecoration: string // "underline" | "none"
  textTransform: string // "none" | "uppercase" | "lowercase" | "capitalize"
  /** Actual text content (truncated for very large nodes). */
  characters?: string
  /** Applied local/library text style. */
  textStyle?: TokenRef
  /** Color variable bound to the text fill. */
  colorToken?: TokenRef
}

export interface Code {
  css: string
  tailwind: string
  react: string
}

export interface LayerDetail {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  layout: Layout
  styles: Styles
  typography: Typography | null
  code: Code
  /** Present for COMPONENT / INSTANCE nodes. */
  component?: ComponentSpec
}

export interface BackendPayload {
  project: Project
  projectFrames: {
    projectId: string
    frames: Frame[]
  }
  frames: Record<string, FrameDetail> // keyed by Frame.id (frame_xxx)
  layers: Record<string, LayerDetail> // keyed by Figma node.id
  // A `version` object is intentionally NOT part of the payload.
}

export type UploadStatus =
  | "idle"
  | "processing"
  | "uploading"
  | "complete"
  | "error"

/** A newly published frame with a shareable viewer URL. */
export interface UploadedFrameLink {
  id: string
  name: string
  /** Absolute URL teammates can open, e.g. https://host/frame/{id}?projectId=… */
  url: string
}

export interface UploadProgress {
  current: number
  total: number
  currentItemName: string
  status: UploadStatus
  apiCallCount?: number
  /** Frames that received a new version (with copyable share links). */
  uploadedFrames?: UploadedFrameLink[]
  /** Frame names skipped because nothing changed vs the latest version. */
  skippedFrames?: string[]
  error?: string
}

// --- Foundational export ---

export interface FoundationalStyles {
  paint: PaintStyleExport[]
  text: TextStyleExport[]
  effect: EffectStyleExport[]
  grid: GridStyleExport[]
}

export interface FoundationalExport {
  variables: Record<string, VariableCollectionExport>
  styles: FoundationalStyles
}

/** Design-token category used in the foundations catalog. */
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

/** Normalized value stored on a foundation token (semantic, not raw Figma). */
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

export interface FoundationToken {
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

/** Per-Figma-file slice stored inside foundations.data.sources */
export interface FoundationSource {
  fileKey: string
  fileName: string
  updatedAt: string
  tokens: Record<string, FoundationToken>
}

export interface FoundationHistoryItemRef {
  id: string
  name: string
  category: FoundationCategory
}

export interface FoundationHistoryFieldChange {
  path: string
  before: unknown
  after: unknown
}

export interface FoundationHistoryChangedItem extends FoundationHistoryItemRef {
  changes: FoundationHistoryFieldChange[]
}

export interface FoundationHistorySummary {
  kind: "initial" | "diff" | "source_removed"
  added: FoundationHistoryItemRef[]
  removed: FoundationHistoryItemRef[]
  changed: FoundationHistoryChangedItem[]
  counts?: { tokens: number }
}

export interface FoundationHistoryEntry {
  id: string
  at: string
  fileKey: string
  fileName: string
  summary: FoundationHistorySummary
}

/** Shape persisted in foundations.data (v2 catalog + history). */
export interface FoundationsStoredData {
  version: 2
  sources: Record<string, FoundationSource>
  catalog: Record<string, FoundationToken>
  history: FoundationHistoryEntry[]
}

export interface VariableCollectionExport {
  id: string
  name: string
  modes: { modeId: string; name: string }[]
  variables: VariableExport[]
}

export interface VariableExport {
  id: string
  name: string
  type: string // "BOOLEAN" | "FLOAT" | "STRING" | "COLOR"
  valuesByMode: Record<string, unknown>
  description: string
  scopes: string[]
  codeSyntax: Record<string, string>
}

export interface BaseStyleExport {
  id: string
  name: string
  description: string
  type: string
}

export interface PaintStyleExport extends BaseStyleExport {
  paints: unknown[]
}

export interface TextStyleExport extends BaseStyleExport {
  fontName: { family: string; style: string }
  fontSize: number
  fontWeight: number
  lineHeight: unknown
  letterSpacing: unknown
  textDecoration: string
  paragraphIndent: number
  paragraphSpacing: number
  textCase: string
}

export interface EffectStyleExport extends BaseStyleExport {
  effects: unknown[]
}

export interface GridStyleExport extends BaseStyleExport {
  layoutGrids: unknown[]
}

// --- Internal CSS helper type ---

export interface CSSData {
  display: string
  flexDirection?: string
  flexWrap?: string
  justifyContent?: string
  alignItems?: string
  alignContent?: string
  alignSelf?: string
  flexGrow?: string | number
  gap?: string
  padding?: string
  width: string
  height: string
  backgroundColor?: string
  borderRadius?: string
  color?: string
  fontSize?: string
  fontFamily?: string
}

// --- Message protocol ---

export type PluginMessage = { type: string; [key: string]: unknown }
