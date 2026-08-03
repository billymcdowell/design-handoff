import { copyToClipboard } from "@/lib/clipboard"
import { toast } from "@/lib/toast"

function origin(): string {
  return window.location.origin
}

/** Absolute URL for a project page (authenticated users only). */
export function projectShareUrl(projectId: string): string {
  return `${origin()}/projects/${projectId}`
}

/** Absolute URL for a section within a project (`#section-{id}`). */
export function sectionShareUrl(projectId: string, sectionId: string): string {
  return `${origin()}/projects/${projectId}#section-${sectionId}`
}

/** Absolute URL for a frame viewer. */
export function frameShareUrl(frameId: string, projectId: string): string {
  return `${origin()}/frame/${frameId}?projectId=${projectId}`
}

/** DOM id used for section deep-links / scroll targets. */
export function sectionAnchorId(sectionId: string): string {
  return `section-${sectionId}`
}

/** Parse `#section-{id}` from a location hash. */
export function sectionIdFromHash(hash: string): string | null {
  if (!hash.startsWith("#section-")) return null
  const id = hash.slice("#section-".length)
  return id || null
}

export async function copyShareLink(url: string): Promise<boolean> {
  const ok = await copyToClipboard(url)
  if (ok) toast.success("Link copied")
  else toast.error("Failed to copy link")
  return ok
}
