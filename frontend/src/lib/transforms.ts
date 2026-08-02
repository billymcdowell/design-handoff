import type { Layer, LayerDetail } from "./types"

export type TransformedLayerDetail = {
  layout: {
    position: { x: number; y: number }
    dimensions: { width: number; height: number }
    padding?: { top: number; right: number; bottom: number; left: number }
    margin?: { top: number; right: number; bottom: number; left: number }
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
    textStyle?: { id: string; name: string }
    colorToken?: { id: string; name: string }
  }
  code: { css: string; tailwind: string; react: string }
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
          textStyle: typographyData.textStyle,
          colorToken: typographyData.colorToken,
        }
      : undefined,
    code: {
      css: codeData.css || "",
      tailwind: codeData.tailwind || "",
      react: codeData.react || "",
    },
  }
}
