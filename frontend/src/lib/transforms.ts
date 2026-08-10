import type {
  ComponentVariantLayer,
  ComponentVariantLayerDetail,
  Layer,
  LayerDetail,
  LayerType,
} from "./types"

export type TransformedLayerDetail = {
  name: string
  type: string
  figmaNodeId?: string
  layout: {
    position: { x: number; y: number }
    dimensions: { width: number; height: number }
    padding?: { top: number; right: number; bottom: number; left: number }
    margin?: { top: number; right: number; bottom: number; left: number }
    autoLayout?: NonNullable<NonNullable<LayerDetail["layout"]>["autoLayout"]>
    constraints?: NonNullable<NonNullable<LayerDetail["layout"]>["constraints"]>
  }
  styles: {
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
    fontFamily: string
    fontSize: string
    fontWeight: string | number
    lineHeight: string
    letterSpacing: string
    color: string
    textAlign: string
    textDecoration?: string
    textTransform?: string
    characters?: string
    textStyle?: { id: string; name: string }
    colorToken?: { id: string; name: string }
  }
  code: { css: string; tailwind: string; react: string }
  component?: NonNullable<LayerDetail["component"]>
}

export function transformLayerDetail(
  layer: Layer | null,
  layerDetail: LayerDetail | null
): TransformedLayerDetail | null {
  if (!layer) return null

  const layoutData = layerDetail?.layout || {}
  const stylesData = layerDetail?.styles || {}
  const typographyData = layerDetail?.typography || {}
  const codeData = layerDetail?.code || {}

  return {
    name: layer.name,
    type: layer.type,
    figmaNodeId: layer.figma_node_id,
    layout: {
      position: { x: layer.x || 0, y: layer.y || 0 },
      dimensions: { width: layer.width || 0, height: layer.height || 0 },
      padding: layoutData.padding
        ? {
            top: layoutData.padding.top || 0,
            right: layoutData.padding.right || 0,
            bottom: layoutData.padding.bottom || 0,
            left: layoutData.padding.left || 0,
          }
        : undefined,
      margin: layoutData.margin
        ? {
            top: layoutData.margin.top || 0,
            right: layoutData.margin.right || 0,
            bottom: layoutData.margin.bottom || 0,
            left: layoutData.margin.left || 0,
          }
        : undefined,
      autoLayout: layoutData.autoLayout,
      constraints: layoutData.constraints,
    },
    styles: {
      backgroundColor: stylesData.backgroundColor,
      borderRadius: stylesData.borderRadius,
      borderWidth: stylesData.borderWidth,
      borderColor: stylesData.borderColor,
      boxShadow: stylesData.boxShadow,
      opacity: stylesData.opacity,
      effects: stylesData.effects,
      backgroundColorToken: stylesData.backgroundColorToken,
      borderColorToken: stylesData.borderColorToken,
      effectStyle: stylesData.effectStyle,
    },
    typography: typographyData?.fontFamily
      ? {
          fontFamily: typographyData.fontFamily || "",
          fontSize: typographyData.fontSize || "",
          fontWeight: typographyData.fontWeight || "",
          lineHeight: typographyData.lineHeight || "",
          letterSpacing: typographyData.letterSpacing || "",
          color: typographyData.color || "",
          textAlign: typographyData.textAlign || "",
          textDecoration: typographyData.textDecoration,
          textTransform: typographyData.textTransform,
          characters:
            typographyData.characters ||
            typographyData.text ||
            typographyData.content ||
            typographyData.value,
          textStyle: typographyData.textStyle,
          colorToken: typographyData.colorToken,
        }
      : undefined,
    code: {
      css: codeData.css || "",
      tailwind: codeData.tailwind || "",
      react: codeData.react || "",
    },
    component: layerDetail?.component,
  }
}

/** Transform inlined component-variant inspect data into inspector shape. */
export function transformVariantLayerInspect(
  layer: ComponentVariantLayer,
  detail?: ComponentVariantLayerDetail | null,
): TransformedLayerDetail {
  const syntheticLayer = {
    id: layer.id,
    collectionId: "",
    collectionName: "",
    created: "",
    updated: "",
    frame: "",
    name: layer.name,
    type: layer.type as LayerType,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    clickable: layer.clickable,
    sort_order: layer.sort_order,
    figma_node_id: layer.figma_node_id ?? layer.id,
    parent: layer.parent,
  } satisfies Layer

  const syntheticDetail = detail
    ? ({
        id: layer.id,
        collectionId: "",
        collectionName: "",
        created: "",
        updated: "",
        layer: layer.id,
        layout: detail.layout,
        styles: detail.styles,
        typography: detail.typography,
        code: detail.code,
        component: detail.component,
      } satisfies LayerDetail)
    : null

  return transformLayerDetail(syntheticLayer, syntheticDetail)!
}
