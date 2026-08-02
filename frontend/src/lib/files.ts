import { pb } from "./pocketbase"
import type { Frame, Project } from "./types"

/** Build an absolute PocketBase file URL. `filename` must be the stored file
 *  name (e.g. `frame.image`), not the field key. */
export function fileUrl(
  record: { id: string; collectionId: string },
  filename: string,
): string {
  return pb.files.getURL(record, filename)
}

/** Resolve a frame's display image — external URL first, then PocketBase file. */
export function frameImageSrc(frame: Frame): string {
  if (frame.image_url) return frame.image_url
  if (frame.image) return fileUrl(frame, frame.image)
  if (frame.thumbnail_url) return frame.thumbnail_url
  if (frame.thumbnail) return fileUrl(frame, frame.thumbnail)
  return "/placeholder.svg"
}

/** Same resolution order for project thumbnails. */
export function projectThumbnailSrc(project: Project): string | undefined {
  if (project.thumbnail_url) return project.thumbnail_url
  if (project.thumbnail) return fileUrl(project, project.thumbnail)
  return undefined
}
