/// <reference types="@figma/plugin-typings" />

// ─── CSSEngine ────────────────────────────────────────────────────────────
// Pure extraction: Figma node → geometry, styles, typography, and generated
// CSS/Tailwind/React code. No network, no side effects.

import type {
  Code,
  EffectDetail,
  Layer,
  LayerDetail,
  Layout,
  Styles,
  TokenRef,
  Typography,
} from "../types"

type Bounds = { x: number; y: number; width: number; height: number }

// 11.1 ─────────────────────────────────────────────────────────────────────
export const toPx = (val: number): string => `${Math.round(val)}px`

// 11.2 ── Rotation-aware bounds via absoluteTransform ───────────────────────
function computeBoundsFromTransform(
  transform: Transform,
  w: number,
  h: number,
): Bounds {
  const isIdentity =
    Math.abs(transform[0][0] - 1) < 0.001 &&
    Math.abs(transform[0][1]) < 0.001 &&
    Math.abs(transform[1][0]) < 0.001 &&
    Math.abs(transform[1][1] - 1) < 0.001

  if (isIdentity) {
    return { x: transform[0][2] ?? 0, y: transform[1][2] ?? 0, width: w, height: h }
  }

  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const transformed = corners.map(([cx, cy]) => {
    const tx = transform[0][0] * cx + transform[0][1] * cy + transform[0][2]
    const ty = transform[1][0] * cx + transform[1][1] * cy + transform[1][2]
    return [tx, ty] as [number, number]
  })
  const xs = transformed.map((p) => p[0])
  const ys = transformed.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** When `frameNode` is supplied, returns coordinates relative to the frame. */
export function getNodeBounds(node: SceneNode, frameNode?: SceneNode): Bounds {
  const nodeAbs = computeBoundsFromTransform(
    node.absoluteTransform,
    node.width,
    node.height,
  )

  if (frameNode) {
    const frameAbs = computeBoundsFromTransform(
      frameNode.absoluteTransform,
      frameNode.width,
      frameNode.height,
    )
    return {
      x: nodeAbs.x - frameAbs.x,
      y: nodeAbs.y - frameAbs.y,
      width: nodeAbs.width,
      height: nodeAbs.height,
    }
  }

  return nodeAbs
}

// 9.5 ── Frame visibility culling ───────────────────────────────────────────
export function isNodeVisibleInFrame(
  node: SceneNode,
  frameNode: SceneNode,
): boolean {
  const bounds = getNodeBounds(node, frameNode)
  const nodeRight = bounds.x + bounds.width
  const nodeBottom = bounds.y + bounds.height
  return !(
    nodeRight < 0 ||
    bounds.x > frameNode.width ||
    nodeBottom < 0 ||
    bounds.y > frameNode.height
  )
}

// 11.3 ─────────────────────────────────────────────────────────────────────
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// 11.4 ─────────────────────────────────────────────────────────────────────
export function getFillColor(fills: unknown): string | undefined {
  if (!Array.isArray(fills)) return undefined
  const solid = fills.find(
    (f) => f.type === "SOLID" && f.visible !== false,
  ) as SolidPaint | undefined
  if (solid) return rgbToHex(solid.color.r, solid.color.g, solid.color.b)
  return undefined
}

// 11.5 ─────────────────────────────────────────────────────────────────────
export function getOpacity(node: SceneNode): number {
  if (!("fills" in node) || !Array.isArray(node.fills)) return 1
  const solid = node.fills.find(
    (f) => f.type === "SOLID" && f.visible !== false,
  ) as SolidPaint | undefined
  return solid?.opacity !== undefined ? solid.opacity : 1
}

// 11.6 ─────────────────────────────────────────────────────────────────────
function rgbaToCss(color: RGBA): string {
  const { r, g, b, a } = color
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
    b * 255,
  )}, ${a ?? 1})`
}

const EFFECT_TYPE_NAMES: Record<string, string> = {
  DROP_SHADOW: "Drop shadow",
  INNER_SHADOW: "Inner shadow",
  LAYER_BLUR: "Layer blur",
  BACKGROUND_BLUR: "Background blur",
  NOISE: "Noise",
  TEXTURE: "Texture",
  GLASS: "Glass",
  SHADER: "Shader",
}

function formatPx(n: number): string {
  return `${Math.round(n * 100) / 100}px`
}

function serializeEffect(effect: Effect): EffectDetail | null {
  if (effect.visible === false) return null

  const name = EFFECT_TYPE_NAMES[effect.type] ?? effect.type
  const properties: EffectDetail["properties"] = []

  switch (effect.type) {
    case "DROP_SHADOW":
    case "INNER_SHADOW": {
      properties.push(
        { label: "X", value: formatPx(effect.offset.x) },
        { label: "Y", value: formatPx(effect.offset.y) },
        { label: "Blur", value: formatPx(effect.radius) },
        { label: "Spread", value: formatPx(effect.spread ?? 0) },
        { label: "Color", value: rgbaToCss(effect.color) },
      )
      if (effect.blendMode && effect.blendMode !== "NORMAL") {
        properties.push({ label: "Blend", value: effect.blendMode })
      }
      break
    }
    case "LAYER_BLUR":
    case "BACKGROUND_BLUR": {
      properties.push({ label: "Blur", value: formatPx(effect.radius) })
      if ("blurType" in effect && effect.blurType === "PROGRESSIVE") {
        properties.push(
          { label: "Type", value: "Progressive" },
          { label: "Start blur", value: formatPx(effect.startRadius) },
        )
      }
      break
    }
    case "NOISE": {
      properties.push(
        { label: "Type", value: effect.noiseType },
        { label: "Size", value: String(Math.round(effect.noiseSize * 100) / 100) },
        { label: "Density", value: `${Math.round(effect.density * 100)}%` },
        { label: "Color", value: rgbaToCss(effect.color) },
      )
      if (effect.noiseType === "DUOTONE") {
        properties.push({
          label: "Secondary",
          value: rgbaToCss(effect.secondaryColor),
        })
      }
      if (effect.noiseType === "MULTITONE") {
        properties.push({
          label: "Opacity",
          value: `${Math.round(effect.opacity * 100)}%`,
        })
      }
      break
    }
    case "TEXTURE": {
      properties.push(
        { label: "Size", value: String(Math.round(effect.noiseSize * 100) / 100) },
        { label: "Radius", value: formatPx(effect.radius) },
        { label: "Clip to shape", value: effect.clipToShape ? "Yes" : "No" },
      )
      break
    }
    case "GLASS": {
      properties.push(
        { label: "Light intensity", value: `${Math.round(effect.lightIntensity * 100)}%` },
        { label: "Light angle", value: `${Math.round(effect.lightAngle)}°` },
        { label: "Refraction", value: `${Math.round(effect.refraction * 100)}%` },
        { label: "Depth", value: String(Math.round(effect.depth * 100) / 100) },
        { label: "Dispersion", value: `${Math.round(effect.dispersion * 100)}%` },
        { label: "Frost", value: formatPx(effect.radius) },
      )
      break
    }
    case "SHADER": {
      properties.push({ label: "Shader ID", value: effect.id })
      break
    }
    default:
      break
  }

  return { type: effect.type, name, properties }
}

/** Serialize all visible Figma effects for the inspector. */
export function getEffects(effects: unknown): EffectDetail[] | undefined {
  if (!Array.isArray(effects) || effects.length === 0) return undefined
  const serialized = (effects as Effect[])
    .map(serializeEffect)
    .filter((e): e is EffectDetail => e !== null)
  return serialized.length > 0 ? serialized : undefined
}

export function getBoxShadow(effects: unknown): string | undefined {
  if (!Array.isArray(effects)) return undefined
  const drop = effects.find(
    (e) => e.type === "DROP_SHADOW" && e.visible !== false,
  ) as DropShadowEffect | undefined
  if (drop) {
    const rgba = rgbaToCss(drop.color)
    return `${drop.offset.x}px ${drop.offset.y}px ${drop.radius}px ${rgba}`
  }
  return undefined
}

// 11.7 ─────────────────────────────────────────────────────────────────────
export function getBorderInfo(
  node: SceneNode,
): { width: string; color: string } | null {
  if (!("strokes" in node) || !Array.isArray(node.strokes) || node.strokes.length === 0)
    return null
  const stroke = node.strokes[0]
  if (stroke.type === "SOLID") {
    const color = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b)
    const width =
      "strokeWeight" in node && typeof node.strokeWeight === "number"
        ? `${node.strokeWeight}px`
        : "1px"
    return { width, color }
  }
  return null
}

// 11.8 ── Auto Layout → flex / grid CSS ─────────────────────────────────────
type AutoLayoutNode = FrameNode | ComponentNode | InstanceNode
type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID"
type SizingMode = "FIXED" | "HUG" | "FILL"

type CSSPropsRecord = {
  /** Explicit positioning. Absolute only for freeform or absolute Auto Layout children. */
  position?: "absolute" | "relative"
  display?: string
  flexDirection?: string
  flexWrap?: string
  justifyContent?: string
  alignItems?: string
  alignContent?: string
  alignSelf?: string
  justifySelf?: string
  flexGrow?: string
  flexShrink?: string
  flexBasis?: string
  gap?: string
  rowGap?: string
  columnGap?: string
  padding?: string
  /** Resolved CSS width (e.g. "120px", "fit-content", "100%"). Undefined = omit. */
  width?: string
  /** Resolved CSS height. Undefined = omit. */
  height?: string
  gridTemplateColumns?: string
  gridTemplateRows?: string
  gridAutoFlow?: string
  gridColumn?: string
  gridRow?: string
}

const AUTO_LAYOUT_TYPES = ["FRAME", "COMPONENT", "INSTANCE"]

function isAutoLayoutContainer(node: BaseNode | null | undefined): node is AutoLayoutNode {
  if (!node || !("layoutMode" in node)) return false
  const mode = (node as AutoLayoutNode).layoutMode
  return mode === "HORIZONTAL" || mode === "VERTICAL" || mode === "GRID"
}

function getParentLayoutMode(node: SceneNode): LayoutMode | null {
  if (!node.parent || !("layoutMode" in node.parent)) return null
  return (node.parent as AutoLayoutNode).layoutMode
}

function isAbsoluteLayoutChild(node: SceneNode): boolean {
  return (
    "layoutPositioning" in node &&
    (node as SceneNode & { layoutPositioning: string }).layoutPositioning ===
      "ABSOLUTE"
  )
}

/** True when this node participates in a parent's Auto Layout flow (not absolute). */
export function isInAutoLayoutFlow(node: SceneNode): boolean {
  const parentMode = getParentLayoutMode(node)
  if (!parentMode || parentMode === "NONE") return false
  return !isAbsoluteLayoutChild(node)
}

function mapPrimaryAlign(
  value: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN",
): string {
  switch (value) {
    case "MIN":
      return "flex-start"
    case "MAX":
      return "flex-end"
    case "CENTER":
      return "center"
    case "SPACE_BETWEEN":
      return "space-between"
  }
}

function mapCounterAlign(
  value: "MIN" | "MAX" | "CENTER" | "BASELINE" | "STRETCH",
): string {
  switch (value) {
    case "MIN":
      return "flex-start"
    case "MAX":
      return "flex-end"
    case "CENTER":
      return "center"
    case "BASELINE":
      return "baseline"
    default:
      return "stretch"
  }
}

function mapAlignContent(
  value: "AUTO" | "SPACE_BETWEEN",
): string | undefined {
  if (value === "SPACE_BETWEEN") return "space-between"
  return undefined
}

function gridTrackToCss(track: GridTrackSize): string {
  if (track.type === "FIXED") return toPx(track.value ?? 0)
  if (track.type === "HUG") return "fit-content"
  const fr = track.value ?? 1
  return fr === 1 ? "1fr" : `${fr}fr`
}

function getNodeSizingMode(
  node: SceneNode,
  axis: "horizontal" | "vertical",
): SizingMode | undefined {
  if (axis === "horizontal" && "layoutSizingHorizontal" in node) {
    return node.layoutSizingHorizontal as SizingMode
  }
  if (axis === "vertical" && "layoutSizingVertical" in node) {
    return node.layoutSizingVertical as SizingMode
  }
  return undefined
}

/**
 * Map Fixed / Hug / Fill on each axis into CSS width/height and flex/grid item props.
 * When `parentMode` is null the node is freeform — always emit fixed pixel sizes.
 */
export function getSizingProps(
  node: SceneNode,
  width: number,
  height: number,
  parentMode: LayoutMode | null,
): Partial<CSSPropsRecord> {
  const css: Partial<CSSPropsRecord> = {}

  // Freeform (no Auto Layout parent): always fixed px sizes.
  if (!parentMode || parentMode === "NONE") {
    // Auto Layout containers themselves can still Hug/Fixed when freeform-positioned.
    if (isAutoLayoutContainer(node)) {
      const h = getNodeSizingMode(node, "horizontal") ?? "FIXED"
      const v = getNodeSizingMode(node, "vertical") ?? "FIXED"
      css.width = h === "HUG" ? "fit-content" : toPx(width)
      css.height = v === "HUG" ? "fit-content" : toPx(height)
      return css
    }
    css.width = toPx(width)
    css.height = toPx(height)
    return css
  }

  let horizontal = getNodeSizingMode(node, "horizontal")
  let vertical = getNodeSizingMode(node, "vertical")

  // Legacy fallbacks when sizing modes are unavailable
  if (!horizontal || !vertical) {
    if ("layoutGrow" in node && node.layoutGrow === 1) {
      if (parentMode === "HORIZONTAL") horizontal = horizontal ?? "FILL"
      if (parentMode === "VERTICAL") vertical = vertical ?? "FILL"
    }
    if ("layoutAlign" in node && node.layoutAlign === "STRETCH") {
      if (parentMode === "HORIZONTAL") vertical = vertical ?? "FILL"
      if (parentMode === "VERTICAL") horizontal = horizontal ?? "FILL"
    }
  }

  horizontal = horizontal ?? "FIXED"
  vertical = vertical ?? "FIXED"

  const applyAxis = (
    mode: SizingMode,
    axis: "width" | "height",
    px: number,
    isPrimary: boolean,
  ) => {
    if (mode === "FIXED") {
      if (axis === "width") css.width = toPx(px)
      else css.height = toPx(px)
      return
    }
    if (mode === "HUG") {
      if (axis === "width") css.width = "fit-content"
      else css.height = "fit-content"
      return
    }
    // FILL
    if (parentMode === "GRID") {
      if (axis === "width") {
        css.width = "100%"
        css.justifySelf = css.justifySelf ?? "stretch"
      } else {
        css.height = "100%"
        css.alignSelf = css.alignSelf ?? "stretch"
      }
      return
    }
    if (isPrimary) {
      css.flexGrow = "1"
      css.flexShrink = "1"
      css.flexBasis = "0"
      // Omit fixed size so flex can grow/shrink
      return
    }
    // Counter-axis FILL → stretch
    css.alignSelf = "stretch"
  }

  if (parentMode === "HORIZONTAL") {
    applyAxis(horizontal, "width", width, true)
    applyAxis(vertical, "height", height, false)
  } else if (parentMode === "VERTICAL") {
    applyAxis(horizontal, "width", width, false)
    applyAxis(vertical, "height", height, true)
  } else {
    // GRID — neither axis is "primary" in the flex sense
    applyAxis(horizontal, "width", width, false)
    applyAxis(vertical, "height", height, false)
  }

  return css
}

/** Container Auto Layout → flex or grid CSS. */
export function getLayoutProps(node: SceneNode): Partial<CSSPropsRecord> {
  if (!("layoutMode" in node)) return {}
  const n = node as AutoLayoutNode
  if (n.layoutMode === "NONE") return {}

  // ── Grid Auto Layout ────────────────────────────────────────────────────
  if (n.layoutMode === "GRID") {
    const css: Partial<CSSPropsRecord> = {
      display: "grid",
      position: "relative",
    }

    if ("gridColumnSizes" in n && Array.isArray(n.gridColumnSizes)) {
      css.gridTemplateColumns = n.gridColumnSizes.map(gridTrackToCss).join(" ")
    } else if ("gridColumnCount" in n && n.gridColumnCount > 0) {
      css.gridTemplateColumns = `repeat(${n.gridColumnCount}, 1fr)`
    }

    if ("gridRowSizes" in n && Array.isArray(n.gridRowSizes)) {
      css.gridTemplateRows = n.gridRowSizes.map(gridTrackToCss).join(" ")
    } else if ("gridRowCount" in n && n.gridRowCount > 0) {
      css.gridTemplateRows = `repeat(${n.gridRowCount}, auto)`
    }

    if ("gridColumnGap" in n) css.columnGap = toPx(n.gridColumnGap)
    if ("gridRowGap" in n) css.rowGap = toPx(n.gridRowGap)

    if ("gridItemsPositioning" in n && n.gridItemsPositioning === "ROW_AUTO_FLOW") {
      css.gridAutoFlow = "row"
    }

    if ("primaryAxisAlignItems" in n) {
      css.justifyContent = mapPrimaryAlign(n.primaryAxisAlignItems)
    }
    if ("counterAxisAlignItems" in n) {
      css.alignItems = mapCounterAlign(n.counterAxisAlignItems)
    }

    applyPadding(n, css)
    return css
  }

  // ── Flex Auto Layout (HORIZONTAL / VERTICAL) ─────────────────────────────
  const css: Partial<CSSPropsRecord> = {
    display: "flex",
    position: "relative",
    gap: toPx(n.itemSpacing),
    flexDirection: n.layoutMode === "HORIZONTAL" ? "row" : "column",
    flexWrap: n.layoutWrap === "WRAP" ? "wrap" : "nowrap",
  }

  css.justifyContent = mapPrimaryAlign(n.primaryAxisAlignItems)
  css.alignItems = mapCounterAlign(n.counterAxisAlignItems)

  if (n.layoutWrap === "WRAP" && "counterAxisAlignContent" in n) {
    const alignContent = mapAlignContent(n.counterAxisAlignContent)
    if (alignContent) css.alignContent = alignContent
  }

  applyPadding(n, css)
  return css
}

function applyPadding(n: AutoLayoutNode, css: Partial<CSSPropsRecord>): void {
  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = n
  const allEqual =
    paddingTop === paddingRight &&
    paddingRight === paddingBottom &&
    paddingBottom === paddingLeft
  if (allEqual && paddingTop > 0) {
    css.padding = toPx(paddingLeft)
  } else if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
    css.padding = `${toPx(paddingTop)} ${toPx(paddingRight)} ${toPx(
      paddingBottom,
    )} ${toPx(paddingLeft)}`
  }
}

/**
 * Child props when the parent is an Auto Layout container.
 * Marks absolute children with position:absolute; in-flow children get flex/grid item props.
 */
export function getChildFlexProps(node: SceneNode): Partial<CSSPropsRecord> {
  const parentMode = getParentLayoutMode(node)
  if (!parentMode || parentMode === "NONE") return {}

  // Absolute-positioned child inside Auto Layout
  if (isAbsoluteLayoutChild(node)) {
    return {
      position: "absolute",
      // Parent-relative coordinates (Figma x/y are relative to the parent frame)
      width: toPx(Math.round(node.width)),
      height: toPx(Math.round(node.height)),
    }
  }

  const extra: Partial<CSSPropsRecord> = {}

  // Grid child placement
  if (parentMode === "GRID" && "gridColumnAnchorIndex" in node) {
    const col = (node as SceneNode & GridChildrenMixin).gridColumnAnchorIndex
    const row = (node as SceneNode & GridChildrenMixin).gridRowAnchorIndex
    const colSpan = (node as SceneNode & GridChildrenMixin).gridColumnSpan ?? 1
    const rowSpan = (node as SceneNode & GridChildrenMixin).gridRowSpan ?? 1
    if (typeof col === "number") {
      extra.gridColumn =
        colSpan > 1 ? `${col + 1} / span ${colSpan}` : String(col + 1)
    }
    if (typeof row === "number") {
      extra.gridRow =
        rowSpan > 1 ? `${row + 1} / span ${rowSpan}` : String(row + 1)
    }
  }

  // Flex item alignment (non-stretch legacy values + stretch)
  if (parentMode !== "GRID" && "layoutAlign" in node) {
    switch (node.layoutAlign) {
      case "MIN":
        extra.alignSelf = "flex-start"
        break
      case "MAX":
        extra.alignSelf = "flex-end"
        break
      case "CENTER":
        extra.alignSelf = "center"
        break
      case "STRETCH":
        extra.alignSelf = "stretch"
        break
      // INHERIT — leave to parent align-items
    }
  }

  // layoutGrow legacy (sizing props also cover FILL)
  if (
    parentMode !== "GRID" &&
    "layoutGrow" in node &&
    node.layoutGrow === 1 &&
    !extra.flexGrow
  ) {
    extra.flexGrow = "1"
    extra.flexShrink = "1"
    extra.flexBasis = "0"
  }

  return extra
}

/**
 * Build the full CSS props for a node: container layout + child flow + sizing + position.
 */
export function buildLayoutCss(
  node: SceneNode,
  width: number,
  height: number,
): Partial<CSSPropsRecord> {
  let css: Partial<CSSPropsRecord> = {}

  const parentMode = getParentLayoutMode(node)
  const inFlow = isInAutoLayoutFlow(node)
  const isAbsChild =
    parentMode !== null &&
    parentMode !== "NONE" &&
    isAbsoluteLayoutChild(node)

  // Container flex/grid props
  if (AUTO_LAYOUT_TYPES.includes(node.type)) {
    css = { ...css, ...getLayoutProps(node) }
  }

  // Child of Auto Layout
  if (parentMode && parentMode !== "NONE") {
    css = { ...css, ...getChildFlexProps(node) }
  }

  // Sizing (Fixed / Hug / Fill) — absolute children already got fixed px from getChildFlexProps
  if (!isAbsChild) {
    // in-flow → use parent mode; freeform → null (fixed px, or Hug for AL containers)
    const sized = getSizingProps(node, width, height, inFlow ? parentMode : null)
    css = { ...css, ...sized }
  }

  // Positioning
  if (isAbsChild) {
    css.position = "absolute"
  } else if (inFlow) {
    // In-flow: no absolute. Keep relative only for flex/grid containers.
    if (css.display === "flex" || css.display === "grid") {
      css.position = "relative"
    } else {
      delete css.position
    }
  } else {
    css.position = "absolute"
  }

  return css
}

// ── Token / style binding helpers ──────────────────────────────────────────

async function resolveVariableToken(
  alias: VariableAlias | undefined | null,
): Promise<TokenRef | undefined> {
  if (!alias || alias.type !== "VARIABLE_ALIAS" || !alias.id) return undefined
  const variable = await figma.variables.getVariableByIdAsync(alias.id)
  if (!variable) return undefined
  return { id: variable.id, name: variable.name }
}

function getFirstSolidPaint(paints: unknown): SolidPaint | undefined {
  if (!Array.isArray(paints)) return undefined
  return paints.find(
    (p) => p.type === "SOLID" && p.visible !== false,
  ) as SolidPaint | undefined
}

/** Color variable bound to the primary fill (paint-level or node-level). */
export async function getFillColorToken(
  node: SceneNode,
): Promise<TokenRef | undefined> {
  if ("fills" in node) {
    const solid = getFirstSolidPaint(node.fills)
    const fromPaint = await resolveVariableToken(solid?.boundVariables?.color)
    if (fromPaint) return fromPaint
  }
  if ("boundVariables" in node) {
    const fills = node.boundVariables?.fills
    if (fills && fills.length > 0) {
      return resolveVariableToken(fills[0])
    }
  }
  return undefined
}

/** Color variable bound to the primary stroke. */
export async function getStrokeColorToken(
  node: SceneNode,
): Promise<TokenRef | undefined> {
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0]
    if (stroke.type === "SOLID") {
      const fromPaint = await resolveVariableToken(stroke.boundVariables?.color)
      if (fromPaint) return fromPaint
    }
  }
  if ("boundVariables" in node) {
    const strokes = node.boundVariables?.strokes
    if (strokes && strokes.length > 0) {
      return resolveVariableToken(strokes[0])
    }
  }
  return undefined
}

async function getTextStyleRef(node: TextNode): Promise<TokenRef | undefined> {
  if (node.textStyleId === figma.mixed || !node.textStyleId) return undefined
  const style = await figma.getStyleByIdAsync(node.textStyleId)
  if (!style) return undefined
  return { id: style.id, name: style.name }
}

async function getEffectStyleRef(node: SceneNode): Promise<TokenRef | undefined> {
  if (!("effectStyleId" in node) || !node.effectStyleId) return undefined
  const style = await figma.getStyleByIdAsync(node.effectStyleId)
  if (!style) return undefined
  return { id: style.id, name: style.name }
}

// 11.9 ── Typography (async — loads the font) ───────────────────────────────
export async function extractTypography(node: TextNode): Promise<Typography> {
  try {
    if (node.fontName !== figma.mixed) {
      await figma.loadFontAsync(node.fontName)
    }
  } catch (e) {
    console.warn("Failed to load font for typography extraction", e)
  }

  const fontSizeNum = typeof node.fontSize === "number" ? node.fontSize : 16
  const fontSize = `${fontSizeNum}px`
  const fontFamily =
    node.fontName !== figma.mixed ? node.fontName.family : "Inter"
  const fontWeight = typeof node.fontWeight === "number" ? node.fontWeight : 400

  let lineHeight: string
  const lh = node.lineHeight
  if (lh !== figma.mixed && typeof lh === "object" && "unit" in lh) {
    if (lh.unit === "PIXELS") lineHeight = `${lh.value}px`
    else if (lh.unit === "PERCENT")
      lineHeight = `${Math.round((fontSizeNum * lh.value) / 100)}px`
    else lineHeight = `${Math.round(fontSizeNum * 1.5)}px`
  } else {
    lineHeight = `${Math.round(fontSizeNum * 1.5)}px`
  }

  let letterSpacing: string
  const ls = node.letterSpacing
  if (ls !== figma.mixed && typeof ls === "object" && "unit" in ls) {
    if (ls.unit === "PIXELS") letterSpacing = `${ls.value}px`
    else if (ls.unit === "PERCENT")
      letterSpacing = `${Math.round((fontSizeNum * ls.value) / 100)}px`
    else letterSpacing = "0px"
  } else {
    letterSpacing = "0px"
  }

  const color = getFillColor(node.fills) || "#374151"

  let textAlign = "left"
  if (node.textAlignHorizontal === "CENTER") textAlign = "center"
  else if (node.textAlignHorizontal === "RIGHT") textAlign = "right"

  const textDecoration =
    node.textDecoration === "UNDERLINE" ? "underline" : "none"

  const [colorToken, textStyle] = await Promise.all([
    getFillColorToken(node),
    getTextStyleRef(node),
  ])

  return {
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    color,
    textAlign,
    textDecoration,
    textTransform: "none",
    ...(textStyle ? { textStyle } : {}),
    ...(colorToken ? { colorToken } : {}),
  }
}

// 11.12 ── generateCSS ──────────────────────────────────────────────────────
function emitLayoutDeclarations(extraCss: Partial<CSSPropsRecord>): string[] {
  const lines: string[] = []
  if (extraCss.display) lines.push(`  display: ${extraCss.display};`)
  if (extraCss.flexDirection) lines.push(`  flex-direction: ${extraCss.flexDirection};`)
  if (extraCss.flexWrap) lines.push(`  flex-wrap: ${extraCss.flexWrap};`)
  if (extraCss.justifyContent) lines.push(`  justify-content: ${extraCss.justifyContent};`)
  if (extraCss.alignItems) lines.push(`  align-items: ${extraCss.alignItems};`)
  if (extraCss.alignContent) lines.push(`  align-content: ${extraCss.alignContent};`)
  if (extraCss.alignSelf) lines.push(`  align-self: ${extraCss.alignSelf};`)
  if (extraCss.justifySelf) lines.push(`  justify-self: ${extraCss.justifySelf};`)
  if (extraCss.flexGrow) lines.push(`  flex-grow: ${extraCss.flexGrow};`)
  if (extraCss.flexShrink) lines.push(`  flex-shrink: ${extraCss.flexShrink};`)
  if (extraCss.flexBasis) lines.push(`  flex-basis: ${extraCss.flexBasis};`)
  if (extraCss.gap) lines.push(`  gap: ${extraCss.gap};`)
  if (extraCss.rowGap) lines.push(`  row-gap: ${extraCss.rowGap};`)
  if (extraCss.columnGap) lines.push(`  column-gap: ${extraCss.columnGap};`)
  if (extraCss.gridTemplateColumns)
    lines.push(`  grid-template-columns: ${extraCss.gridTemplateColumns};`)
  if (extraCss.gridTemplateRows)
    lines.push(`  grid-template-rows: ${extraCss.gridTemplateRows};`)
  if (extraCss.gridAutoFlow) lines.push(`  grid-auto-flow: ${extraCss.gridAutoFlow};`)
  if (extraCss.gridColumn) lines.push(`  grid-column: ${extraCss.gridColumn};`)
  if (extraCss.gridRow) lines.push(`  grid-row: ${extraCss.gridRow};`)
  return lines
}

export function generateCSS(
  className: string,
  x: number,
  y: number,
  width: number,
  height: number,
  styles: Styles,
  layout: Layout,
  typography: Typography | null,
  extraCss: Partial<CSSPropsRecord>,
): string {
  const lines: string[] = []
  const useAbsolute = extraCss.position === "absolute"

  if (useAbsolute) {
    lines.push(`  position: absolute;`)
    lines.push(`  left: ${x}px;`)
    lines.push(`  top: ${y}px;`)
  } else if (extraCss.position === "relative") {
    lines.push(`  position: relative;`)
  }

  // Prefer explicit sizing from layout props; fall back to fixed px for absolute/freeform
  if (extraCss.width !== undefined) {
    lines.push(`  width: ${extraCss.width};`)
  } else if (useAbsolute) {
    lines.push(`  width: ${width}px;`)
  }

  if (extraCss.height !== undefined) {
    lines.push(`  height: ${extraCss.height};`)
  } else if (useAbsolute) {
    lines.push(`  height: ${height}px;`)
  }

  if (styles.backgroundColor && styles.backgroundColor !== "transparent")
    lines.push(`  background-color: ${styles.backgroundColor};`)
  if (styles.borderRadius) lines.push(`  border-radius: ${styles.borderRadius};`)
  if (styles.borderWidth && styles.borderWidth !== "0px") {
    lines.push(`  border-width: ${styles.borderWidth};`)
    lines.push(`  border-style: solid;`)
    if (styles.borderColor) lines.push(`  border-color: ${styles.borderColor};`)
  }
  if (styles.boxShadow) lines.push(`  box-shadow: ${styles.boxShadow};`)

  if (layout.padding) {
    const p = layout.padding
    lines.push(`  padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`)
  }

  if (typography) {
    lines.push(`  font-family: ${typography.fontFamily};`)
    lines.push(`  font-size: ${typography.fontSize};`)
    lines.push(`  font-weight: ${typography.fontWeight};`)
    lines.push(`  line-height: ${typography.lineHeight};`)
    lines.push(`  letter-spacing: ${typography.letterSpacing};`)
    lines.push(`  color: ${typography.color};`)
    lines.push(`  text-align: ${typography.textAlign};`)
  }

  lines.push(...emitLayoutDeclarations(extraCss))

  return `.${className} {\n${lines.join("\n")}\n}`
}

// 11.13 ── generateTailwind ─────────────────────────────────────────────────
function sizeToTailwind(prefix: "w" | "h", value: string | undefined): string | null {
  if (!value) return null
  if (value === "fit-content") return `${prefix}-fit`
  if (value === "100%") return `${prefix}-full`
  if (value === "auto") return `${prefix}-auto`
  // px value e.g. "120px"
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value)
  if (m) return `${prefix}-[${m[1]}px]`
  return `${prefix}-[${value}]`
}

function gapToTailwind(pxValue: string | undefined): string | null {
  if (!pxValue) return null
  const n = parseFloat(pxValue)
  if (Number.isNaN(n)) return null
  const scaled = n / 4
  if (Number.isInteger(scaled) && scaled >= 0 && scaled <= 96) return `gap-${scaled}`
  return `gap-[${pxValue}]`
}

export function generateTailwind(
  x: number,
  y: number,
  width: number,
  height: number,
  styles: Styles,
  layout: Layout,
  typography: Typography | null,
  extraCss: Partial<CSSPropsRecord> = {},
): string {
  const parts: string[] = []
  const useAbsolute = extraCss.position === "absolute"

  if (useAbsolute) {
    parts.push("absolute")
    parts.push(`left-[${x}px]`)
    parts.push(`top-[${y}px]`)
  } else if (extraCss.position === "relative") {
    parts.push("relative")
  }

  // Display / flex / grid container
  if (extraCss.display === "flex") {
    parts.push("flex")
    if (extraCss.flexDirection === "column") parts.push("flex-col")
    if (extraCss.flexWrap === "wrap") parts.push("flex-wrap")
    if (extraCss.justifyContent === "flex-start") parts.push("justify-start")
    else if (extraCss.justifyContent === "flex-end") parts.push("justify-end")
    else if (extraCss.justifyContent === "center") parts.push("justify-center")
    else if (extraCss.justifyContent === "space-between") parts.push("justify-between")
    if (extraCss.alignItems === "flex-start") parts.push("items-start")
    else if (extraCss.alignItems === "flex-end") parts.push("items-end")
    else if (extraCss.alignItems === "center") parts.push("items-center")
    else if (extraCss.alignItems === "baseline") parts.push("items-baseline")
    else if (extraCss.alignItems === "stretch") parts.push("items-stretch")
    if (extraCss.alignContent === "flex-start") parts.push("content-start")
    else if (extraCss.alignContent === "flex-end") parts.push("content-end")
    else if (extraCss.alignContent === "center") parts.push("content-center")
    else if (extraCss.alignContent === "space-between") parts.push("content-between")
    const gapClass = gapToTailwind(extraCss.gap)
    if (gapClass) parts.push(gapClass)
  } else if (extraCss.display === "grid") {
    parts.push("grid")
    if (extraCss.gridTemplateColumns)
      parts.push(`grid-cols-[${extraCss.gridTemplateColumns.replace(/\s+/g, "_")}]`)
    if (extraCss.gridTemplateRows)
      parts.push(`grid-rows-[${extraCss.gridTemplateRows.replace(/\s+/g, "_")}]`)
    if (extraCss.gridAutoFlow === "row") parts.push("grid-flow-row")
    if (extraCss.columnGap) {
      const g = gapToTailwind(extraCss.columnGap)
      if (g) parts.push(g.replace("gap-", "gap-x-"))
      else parts.push(`gap-x-[${extraCss.columnGap}]`)
    }
    if (extraCss.rowGap) {
      const g = gapToTailwind(extraCss.rowGap)
      if (g) parts.push(g.replace("gap-", "gap-y-"))
      else parts.push(`gap-y-[${extraCss.rowGap}]`)
    }
    if (extraCss.justifyContent === "flex-start") parts.push("justify-start")
    else if (extraCss.justifyContent === "flex-end") parts.push("justify-end")
    else if (extraCss.justifyContent === "center") parts.push("justify-center")
    else if (extraCss.justifyContent === "space-between") parts.push("justify-between")
    if (extraCss.alignItems === "flex-start") parts.push("items-start")
    else if (extraCss.alignItems === "flex-end") parts.push("items-end")
    else if (extraCss.alignItems === "center") parts.push("items-center")
    else if (extraCss.alignItems === "stretch") parts.push("items-stretch")
  }

  // Flex/grid item props
  if (extraCss.flexGrow === "1" && extraCss.flexBasis === "0") parts.push("flex-1")
  else if (extraCss.flexGrow === "1") parts.push("grow")
  if (extraCss.alignSelf === "flex-start") parts.push("self-start")
  else if (extraCss.alignSelf === "flex-end") parts.push("self-end")
  else if (extraCss.alignSelf === "center") parts.push("self-center")
  else if (extraCss.alignSelf === "stretch") parts.push("self-stretch")
  if (extraCss.justifySelf === "stretch") parts.push("justify-self-stretch")
  if (extraCss.gridColumn) parts.push(`col-[${extraCss.gridColumn.replace(/\s+/g, "_")}]`)
  if (extraCss.gridRow) parts.push(`row-[${extraCss.gridRow.replace(/\s+/g, "_")}]`)

  // Sizing
  const wClass = sizeToTailwind(
    "w",
    extraCss.width ?? (useAbsolute ? `${width}px` : undefined),
  )
  const hClass = sizeToTailwind(
    "h",
    extraCss.height ?? (useAbsolute ? `${height}px` : undefined),
  )
  if (wClass) parts.push(wClass)
  if (hClass) parts.push(hClass)

  const bg = styles.backgroundColor
  if (bg && bg !== "transparent") {
    const upper = bg.toUpperCase()
    if (upper === "#FFFFFF" || upper === "#FFF" || bg.toLowerCase() === "white")
      parts.push("bg-white")
    else if (upper === "#3B82F6" || upper === "#007AFF") parts.push("bg-blue-500")
    else if (upper === "#10B981") parts.push("bg-emerald-500")
    else parts.push(`bg-[${bg}]`)
  }

  if (styles.borderRadius) {
    const r = styles.borderRadius
    if (r === "8px") parts.push("rounded-lg")
    else if (r === "12px") parts.push("rounded-xl")
    else if (r === "16px") parts.push("rounded-2xl")
    else parts.push(`rounded-[${r}]`)
  }

  if (styles.boxShadow) parts.push("shadow-md")

  if (layout.padding) {
    const p = layout.padding
    if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
      parts.push(`p-${Math.round(p.top / 4)}`)
    } else {
      parts.push(`px-${Math.round(p.left / 4)}`)
      parts.push(`py-${Math.round(p.top / 4)}`)
    }
  }

  if (typography) {
    parts.push("font-sans")
    parts.push(`text-[${typography.fontSize}]`)
    const fw = Number(typography.fontWeight)
    if (fw >= 700) parts.push("font-bold")
    else if (fw >= 600) parts.push("font-semibold")
    parts.push(`leading-[${typography.lineHeight}]`)
    parts.push(`tracking-[${typography.letterSpacing}]`)
    parts.push(`text-[${typography.color}]`)
  }

  return parts.join(" ")
}

// 11.14 ── generateReact (inline style object literal) ──────────────────────
function cssSizeToReact(value: string): string {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value)
  if (m) return m[1] // numeric px for React inline styles
  return `'${value}'`
}

export function generateReact(
  x: number,
  y: number,
  width: number,
  height: number,
  styles: Styles,
  layout: Layout,
  typography: Typography | null,
  extraCss: Partial<CSSPropsRecord>,
): string {
  const props: string[] = []
  const useAbsolute = extraCss.position === "absolute"

  if (useAbsolute) {
    props.push(`position: 'absolute'`)
    props.push(`left: ${x}`)
    props.push(`top: ${y}`)
  } else if (extraCss.position === "relative") {
    props.push(`position: 'relative'`)
  }

  if (extraCss.width !== undefined) {
    props.push(`width: ${cssSizeToReact(extraCss.width)}`)
  } else if (useAbsolute) {
    props.push(`width: ${width}`)
  }

  if (extraCss.height !== undefined) {
    props.push(`height: ${cssSizeToReact(extraCss.height)}`)
  } else if (useAbsolute) {
    props.push(`height: ${height}`)
  }

  if (styles.backgroundColor && styles.backgroundColor !== "transparent")
    props.push(`backgroundColor: '${styles.backgroundColor}'`)
  if (styles.borderRadius)
    props.push(`borderRadius: ${parseFloat(styles.borderRadius)}`)
  if (styles.borderWidth && styles.borderWidth !== "0px") {
    props.push(`borderWidth: ${parseFloat(styles.borderWidth)}`)
    props.push(`borderStyle: 'solid'`)
    if (styles.borderColor) props.push(`borderColor: '${styles.borderColor}'`)
  }
  if (styles.boxShadow) props.push(`boxShadow: '${styles.boxShadow}'`)

  if (layout.padding) {
    const p = layout.padding
    props.push(`padding: '${p.top}px ${p.right}px ${p.bottom}px ${p.left}px'`)
  }

  if (typography) {
    props.push(`fontFamily: '${typography.fontFamily}'`)
    props.push(`fontSize: '${typography.fontSize}'`)
    props.push(`fontWeight: ${JSON.stringify(typography.fontWeight)}`)
    props.push(`lineHeight: '${typography.lineHeight}'`)
    props.push(`letterSpacing: '${typography.letterSpacing}'`)
    props.push(`color: '${typography.color}'`)
    props.push(`textAlign: '${typography.textAlign}'`)
  }

  if (extraCss.display) props.push(`display: '${extraCss.display}'`)
  if (extraCss.flexDirection) props.push(`flexDirection: '${extraCss.flexDirection}'`)
  if (extraCss.flexWrap) props.push(`flexWrap: '${extraCss.flexWrap}'`)
  if (extraCss.justifyContent) props.push(`justifyContent: '${extraCss.justifyContent}'`)
  if (extraCss.alignItems) props.push(`alignItems: '${extraCss.alignItems}'`)
  if (extraCss.alignContent) props.push(`alignContent: '${extraCss.alignContent}'`)
  if (extraCss.alignSelf) props.push(`alignSelf: '${extraCss.alignSelf}'`)
  if (extraCss.justifySelf) props.push(`justifySelf: '${extraCss.justifySelf}'`)
  if (extraCss.flexGrow) props.push(`flexGrow: ${extraCss.flexGrow}`)
  if (extraCss.flexShrink) props.push(`flexShrink: ${extraCss.flexShrink}`)
  if (extraCss.flexBasis) props.push(`flexBasis: '${extraCss.flexBasis}'`)
  if (extraCss.gap) props.push(`gap: '${extraCss.gap}'`)
  if (extraCss.rowGap) props.push(`rowGap: '${extraCss.rowGap}'`)
  if (extraCss.columnGap) props.push(`columnGap: '${extraCss.columnGap}'`)
  if (extraCss.gridTemplateColumns)
    props.push(`gridTemplateColumns: '${extraCss.gridTemplateColumns}'`)
  if (extraCss.gridTemplateRows)
    props.push(`gridTemplateRows: '${extraCss.gridTemplateRows}'`)
  if (extraCss.gridAutoFlow) props.push(`gridAutoFlow: '${extraCss.gridAutoFlow}'`)
  if (extraCss.gridColumn) props.push(`gridColumn: '${extraCss.gridColumn}'`)
  if (extraCss.gridRow) props.push(`gridRow: '${extraCss.gridRow}'`)

  return `{ ${props.join(", ")} }`
}

// 11.10 ── nodeToLayer (hierarchical, sync) ─────────────────────────────────
export function nodeToLayer(node: SceneNode, frameNode?: SceneNode): Layer | null {
  if (!node.visible) return null

  const bounds = getNodeBounds(node, frameNode)

  if (frameNode && !isNodeVisibleInFrame(node, frameNode)) return null

  const layer: Layer = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    clickable: true,
  }

  if ("children" in node && node.children.length > 0) {
    const children = node.children
      .map((child) => nodeToLayer(child, frameNode))
      .filter((c): c is Layer => c !== null)
    if (children.length > 0) layer.children = children
  }

  return layer
}

// 11.11 ── nodeToLayerDetail (async — resolves typography + code) ────────────
export async function nodeToLayerDetail(
  node: SceneNode,
  frameNode?: SceneNode,
): Promise<LayerDetail | null> {
  if (!node.visible) return null

  const bounds = getNodeBounds(node, frameNode)
  if (frameNode && !isNodeVisibleInFrame(node, frameNode)) return null

  const x = Math.round(bounds.x)
  const y = Math.round(bounds.y)
  const width = Math.round(bounds.width)
  const height = Math.round(bounds.height)

  const layout: Layout = {
    position: { x, y },
    dimensions: { width, height },
  }

  // Padding (auto-layout containers only)
  if (AUTO_LAYOUT_TYPES.includes(node.type) && "paddingTop" in node) {
    const n = node as AutoLayoutNode
    if (n.paddingTop || n.paddingRight || n.paddingBottom || n.paddingLeft) {
      layout.padding = {
        top: Math.round(n.paddingTop),
        right: Math.round(n.paddingRight),
        bottom: Math.round(n.paddingBottom),
        left: Math.round(n.paddingLeft),
      }
    }
  }

  const fills = "fills" in node ? node.fills : undefined
  const backgroundColor =
    getFillColor(fills) || (node.type === "TEXT" ? "transparent" : "#F3F4F6")
  const borderRadius =
    "cornerRadius" in node && typeof node.cornerRadius === "number"
      ? `${Math.round(node.cornerRadius)}px`
      : undefined
  const border = getBorderInfo(node)
  const nodeEffects = "effects" in node ? node.effects : undefined
  const boxShadow = getBoxShadow(nodeEffects)
  const effects = getEffects(nodeEffects)
  const opacity = getOpacity(node)

  const [fillColorToken, borderColorToken, effectStyle, typography] = await Promise.all([
    node.type === "TEXT" ? Promise.resolve(undefined) : getFillColorToken(node),
    getStrokeColorToken(node),
    getEffectStyleRef(node),
    node.type === "TEXT"
      ? extractTypography(node as TextNode)
      : Promise.resolve(null),
  ])

  const styles: Styles = {
    backgroundColor,
    borderRadius,
    borderWidth: border?.width || "0px",
    borderColor: border?.color || "transparent",
    boxShadow,
    opacity,
    ...(effects ? { effects } : {}),
    ...(fillColorToken ? { backgroundColorToken: fillColorToken } : {}),
    ...(borderColorToken ? { borderColorToken } : {}),
    ...(effectStyle ? { effectStyle } : {}),
  }

  const extraCss = buildLayoutCss(node, width, height)

  // Absolute children inside Auto Layout use parent-relative x/y (node.x/y).
  // Freeform layers keep frame-relative bounds for overlay/inspect consistency.
  const codeX =
    extraCss.position === "absolute" && isAbsoluteLayoutChild(node)
      ? Math.round(node.x)
      : x
  const codeY =
    extraCss.position === "absolute" && isAbsoluteLayoutChild(node)
      ? Math.round(node.y)
      : y

  const className = node.name.toLowerCase().replace(/\s+/g, "-")

  const code: Code = {
    css: generateCSS(className, codeX, codeY, width, height, styles, layout, typography, extraCss),
    tailwind: generateTailwind(codeX, codeY, width, height, styles, layout, typography, extraCss),
    react: generateReact(codeX, codeY, width, height, styles, layout, typography, extraCss),
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    x,
    y,
    width,
    height,
    layout,
    styles,
    typography,
    code,
  }
}
