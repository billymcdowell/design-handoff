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

// 11.8 ── Auto Layout → flex CSS ────────────────────────────────────────────
type AutoLayoutNode = FrameNode | ComponentNode | InstanceNode

export function getLayoutProps(node: SceneNode): Partial<CSSPropsRecord> {
  if (!("layoutMode" in node)) return { display: "block" }
  const n = node as AutoLayoutNode
  if (n.layoutMode === "NONE") return { display: "block" }

  const css: CSSPropsRecord = {
    display: "flex",
    gap: toPx(n.itemSpacing),
    flexDirection: n.layoutMode === "HORIZONTAL" ? "row" : "column",
    flexWrap: n.layoutWrap === "WRAP" ? "wrap" : "nowrap",
  }

  switch (n.primaryAxisAlignItems) {
    case "MIN":
      css.justifyContent = "flex-start"
      break
    case "MAX":
      css.justifyContent = "flex-end"
      break
    case "CENTER":
      css.justifyContent = "center"
      break
    case "SPACE_BETWEEN":
      css.justifyContent = "space-between"
      break
  }

  switch (n.counterAxisAlignItems) {
    case "MIN":
      css.alignItems = "flex-start"
      break
    case "MAX":
      css.alignItems = "flex-end"
      break
    case "CENTER":
      css.alignItems = "center"
      break
    case "BASELINE":
      css.alignItems = "baseline"
      break
    default:
      css.alignItems = "stretch"
  }

  if (n.layoutWrap === "WRAP" && "counterAxisAlignContent" in n) {
    switch (n.counterAxisAlignContent) {
      case "AUTO":
        break
      default:
        // SPACE_BETWEEN maps directly; MIN/MAX/CENTER handled like above.
        if (n.counterAxisAlignContent === "SPACE_BETWEEN")
          css.alignContent = "space-between"
    }
  }

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

  return css
}

/** Child flex props when the parent is an Auto Layout container. */
export function getChildFlexProps(node: SceneNode): Partial<CSSPropsRecord> {
  const extra: Partial<CSSPropsRecord> = {}
  if ("layoutGrow" in node && node.layoutGrow === 1) extra.flexGrow = "1"
  if ("layoutAlign" in node) {
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
    }
  }
  return extra
}

type CSSPropsRecord = {
  display: string
  flexDirection?: string
  flexWrap?: string
  justifyContent?: string
  alignItems?: string
  alignContent?: string
  alignSelf?: string
  flexGrow?: string
  gap?: string
  padding?: string
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

  if (!extraCss.display || extraCss.display === "absolute") {
    lines.push(`  position: absolute;`)
    lines.push(`  left: ${x}px;`)
    lines.push(`  top: ${y}px;`)
  } else {
    lines.push(`  position: relative;`)
  }

  lines.push(`  width: ${width}px;`)
  lines.push(`  height: ${height}px;`)

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

  if (extraCss.display && extraCss.display !== "block" && extraCss.display !== "absolute") {
    lines.push(`  display: ${extraCss.display};`)
    if (extraCss.flexDirection) lines.push(`  flex-direction: ${extraCss.flexDirection};`)
    if (extraCss.flexWrap) lines.push(`  flex-wrap: ${extraCss.flexWrap};`)
    if (extraCss.justifyContent) lines.push(`  justify-content: ${extraCss.justifyContent};`)
    if (extraCss.alignItems) lines.push(`  align-items: ${extraCss.alignItems};`)
    if (extraCss.alignContent) lines.push(`  align-content: ${extraCss.alignContent};`)
    if (extraCss.gap) lines.push(`  gap: ${extraCss.gap};`)
  }
  if (extraCss.alignSelf) lines.push(`  align-self: ${extraCss.alignSelf};`)
  if (extraCss.flexGrow) lines.push(`  flex-grow: ${extraCss.flexGrow};`)

  return `.${className} {\n${lines.join("\n")}\n}`
}

// 11.13 ── generateTailwind ─────────────────────────────────────────────────
export function generateTailwind(
  x: number,
  y: number,
  width: number,
  height: number,
  styles: Styles,
  layout: Layout,
  typography: Typography | null,
): string {
  const parts: string[] = [
    "absolute",
    `left-[${x}px]`,
    `top-[${y}px]`,
    `w-[${width}px]`,
    `h-[${height}px]`,
  ]

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
  const relative =
    extraCss.display && extraCss.display !== "block" && extraCss.display !== "absolute"

  if (relative) {
    props.push(`position: 'relative'`)
  } else {
    props.push(`position: 'absolute'`)
    props.push(`left: ${x}`)
    props.push(`top: ${y}`)
  }
  props.push(`width: ${width}`)
  props.push(`height: ${height}`)

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

  if (relative) {
    props.push(`display: '${extraCss.display}'`)
    if (extraCss.flexDirection) props.push(`flexDirection: '${extraCss.flexDirection}'`)
    if (extraCss.flexWrap) props.push(`flexWrap: '${extraCss.flexWrap}'`)
    if (extraCss.justifyContent) props.push(`justifyContent: '${extraCss.justifyContent}'`)
    if (extraCss.alignItems) props.push(`alignItems: '${extraCss.alignItems}'`)
    if (extraCss.alignContent) props.push(`alignContent: '${extraCss.alignContent}'`)
    if (extraCss.gap) props.push(`gap: '${extraCss.gap}'`)
  }
  if (extraCss.alignSelf) props.push(`alignSelf: '${extraCss.alignSelf}'`)
  if (extraCss.flexGrow) props.push(`flexGrow: ${extraCss.flexGrow}`)

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
const AUTO_LAYOUT_TYPES = ["FRAME", "COMPONENT", "INSTANCE"]

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

  let extraCss: Partial<CSSPropsRecord> = {}
  if (AUTO_LAYOUT_TYPES.includes(node.type)) {
    extraCss = { ...extraCss, ...getLayoutProps(node) }
  }
  if (
    node.parent &&
    "layoutMode" in node.parent &&
    (node.parent as AutoLayoutNode).layoutMode !== "NONE"
  ) {
    extraCss = { ...extraCss, ...getChildFlexProps(node) }
  }

  const className = node.name.toLowerCase().replace(/\s+/g, "-")

  const code: Code = {
    css: generateCSS(className, x, y, width, height, styles, layout, typography, extraCss),
    tailwind: generateTailwind(x, y, width, height, styles, layout, typography),
    react: generateReact(x, y, width, height, styles, layout, typography, extraCss),
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
