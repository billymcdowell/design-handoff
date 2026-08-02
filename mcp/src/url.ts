export type ParsedFrameUrl = {
  frameId: string
  projectId?: string
}

const FRAME_ID_ONLY = /^[a-z0-9]{15}$/i
const FRAME_PATH = /\/frame\/([a-z0-9]{15})\/?$/i

/**
 * Parse a design-handoff frame URL or path into frameId (+ optional projectId).
 * Accepts absolute URLs, path-only forms, or a bare PocketBase frame id.
 */
export function parseFrameUrl(input: string): ParsedFrameUrl {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Empty URL or frame id")
  }

  if (FRAME_ID_ONLY.test(trimmed)) {
    return { frameId: trimmed }
  }

  let url: URL
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      url = new URL(trimmed)
    } else if (trimmed.startsWith("/")) {
      url = new URL(trimmed, "http://localhost")
    } else {
      url = new URL(`/${trimmed}`, "http://localhost")
    }
  } catch {
    throw new Error(`Invalid URL: ${input}`)
  }

  const match = url.pathname.match(FRAME_PATH)
  if (!match) {
    throw new Error(
      `Not a design-handoff frame URL (expected /frame/{frameId}): ${input}`
    )
  }

  const projectId = url.searchParams.get("projectId") || undefined
  return { frameId: match[1], projectId }
}
