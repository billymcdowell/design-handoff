/** Types mirrored from the design-handoff frontend PocketBase models. */

export interface Project {
  id: string
  name: string
  thumbnail_url?: string
  figma_file_url?: string
  frame_count?: number
  updated?: string
  created?: string
}

export interface Frame {
  id: string
  project: string
  /** Optional project section id for grouping screens. */
  section?: string
  name: string
  width?: number
  height?: number
  thumbnail_url?: string
  image_url?: string
  figma_url?: string
  sort_order?: number
  updated?: string
  created?: string
  expand?: {
    project?: Project
  }
}

export interface Layer {
  id: string
  frame: string
  parent?: string
  name: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  clickable?: boolean
  sort_order?: number
}

export interface LayerDetail {
  id: string
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

export type CodeFormat = "css" | "tailwind" | "react"

export interface LayerSpecs {
  layout?: LayerDetail["layout"]
  styles?: LayerDetail["styles"]
  typography?: LayerDetail["typography"]
  code?: Partial<NonNullable<LayerDetail["code"]>>
}

export interface SpecLayer {
  id: string
  name: string
  type: string
  parent?: string
  x?: number
  y?: number
  width?: number
  height?: number
  sort_order?: number
  specs: LayerSpecs | null
}
