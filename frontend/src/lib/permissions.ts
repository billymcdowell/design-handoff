import type { RecordModel } from "pocketbase"
import type { User, UserRole } from "./types"

/** Safe default: treat missing/unknown roles as developer (read-only). */
export function getUserRole(user: Pick<User, "role"> | RecordModel | null | undefined): UserRole {
  if (user && "role" in user && user.role === "super") return "super"
  return "developer"
}

/** Super users can create/edit/delete projects and frames. */
export function canManageContent(user: Pick<User, "role"> | RecordModel | null | undefined): boolean {
  return getUserRole(user) === "super"
}
