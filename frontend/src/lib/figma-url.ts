/** Normalize Figma node ids for URL query params (`1:2` / `1;2` → `1-2`). */
export function figmaNodeIdForUrl(nodeId: string): string {
  return nodeId.replace(/[:;]/g, "-")
}

/**
 * Build a deep link to a specific Figma node.
 * Accepts file-level or frame-level URLs (`/file/` or `/design/`) and replaces
 * or appends `node-id`. Returns null when inputs are missing/unusable.
 */
export function buildFigmaNodeUrl(
  fileOrFrameUrl: string | undefined | null,
  nodeId: string | undefined | null,
): string | null {
  const base = fileOrFrameUrl?.trim()
  if (!base || /\/(file|design)\/unknown\b/.test(base)) return null
  const id = nodeId?.trim()
  if (!id) return null

  try {
    const url = new URL(base)
    if (!url.hostname.endsWith("figma.com")) return null
    url.searchParams.set("node-id", figmaNodeIdForUrl(id))
    return url.toString()
  } catch {
    return null
  }
}

/** Prefer a direct frame URL; otherwise derive from the file URL + frame node id. */
export function resolveFrameFigmaUrl(
  frameUrl: string | undefined | null,
  fileUrl: string | undefined | null,
  frameNodeId?: string | undefined | null,
): string | null {
  const direct = frameUrl?.trim()
  if (direct && !/\/(file|design)\/unknown\b/.test(direct)) return direct
  return buildFigmaNodeUrl(fileUrl, frameNodeId)
}
