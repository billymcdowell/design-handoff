import type { Frame, User } from "./types"

/** Display name for a PocketBase user (name, else email). */
export function userDisplayName(user: User | null | undefined): string | null {
  if (!user) return null
  const name = typeof user.name === "string" ? user.name.trim() : ""
  if (name) return name
  if (typeof user.email === "string" && user.email.trim()) return user.email.trim()
  return null
}

/**
 * Who uploaded this frame. Frames are owner-scoped today, so the project
 * owner is the uploader (expanded via `project.owner`).
 */
export function frameUploaderLabel(frame: Frame): string | null {
  return userDisplayName(frame.expand?.project?.expand?.owner)
}

/** Sort versions newest-first (updated, falling back to created). */
export function sortFramesByDateDesc(frames: Frame[]): Frame[] {
  return [...frames].sort((a, b) => {
    const dateA = new Date(a.updated || a.created)
    const dateB = new Date(b.updated || b.created)
    return dateB.getTime() - dateA.getTime()
  })
}

/** Group by name, keeping only the latest row per name — used for the switcher. */
export function dedupeLatestFrames(frames: Frame[]): Frame[] {
  const frameMap = new Map<string, Frame>()
  for (const f of frames) {
    const existing = frameMap.get(f.name)
    if (!existing) {
      frameMap.set(f.name, f)
    } else {
      const existingDate = new Date(existing.updated || existing.created)
      const currentDate = new Date(f.updated || f.created)
      if (currentDate > existingDate) frameMap.set(f.name, f)
    }
  }
  return sortFramesByDateDesc([...frameMap.values()])
}

export function isViewingOlderVersion(frameId: string, versions: Frame[]): boolean {
  return versions.length > 1 && versions[0]?.id !== frameId
}
