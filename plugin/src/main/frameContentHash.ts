// ─── Frame content fingerprint ─────────────────────────────────────────────
// Used to skip creating a new version when a republish has no design changes.
// Hash covers frame size, layer tree, inspector details (not generated code),
// and the exported PNG bytes.

import type { Frame, FrameDetail, Layer, LayerDetail } from "../types"

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

/** FNV-1a 32-bit → 8 hex chars (fast, fine for change detection with length). */
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

function layerTreeFingerprint(layers: Layer[]): unknown {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    clickable: layer.clickable,
    children: layer.children ? layerTreeFingerprint(layer.children) : [],
  }))
}

function collectLayerIds(layers: Layer[]): string[] {
  const ids: string[] = []
  for (const layer of layers) {
    ids.push(layer.id)
    if (layer.children) ids.push(...collectLayerIds(layer.children))
  }
  return ids
}

function detailsFingerprint(
  layerIds: string[],
  layers: Record<string, LayerDetail>,
): unknown {
  return layerIds.map((id) => {
    const detail = layers[id]
    if (!detail) return { id }
    return {
      id,
      layout: detail.layout ?? null,
      styles: detail.styles ?? null,
      typography: detail.typography ?? null,
      component: detail.component ?? null,
      // Intentionally omit `code` — it's derived and format changes shouldn't
      // force a new version.
    }
  })
}

export function computeFrameContentHash(args: {
  frame: Pick<Frame, "width" | "height" | "pageName">
  detail: Pick<FrameDetail, "layers">
  layers: Record<string, LayerDetail>
  imageBytes?: Uint8Array
}): string {
  const layerIds = collectLayerIds(args.detail.layers)
  const structural = stableStringify({
    width: args.frame.width,
    height: args.frame.height,
    pageName: args.frame.pageName ?? null,
    layers: layerTreeFingerprint(args.detail.layers),
    details: detailsFingerprint(layerIds, args.layers),
  })
  const structHash = fnv1aHex(structural)
  const image = args.imageBytes
  const imagePart = image
    ? `${image.length}:${fnv1aHex(image)}`
    : "0:none"
  return `v1:${imagePart}:${structHash}`
}
