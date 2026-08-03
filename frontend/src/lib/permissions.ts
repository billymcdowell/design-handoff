import type { RecordModel } from "pocketbase"
import { isPocketBaseSuperuser } from "./auth"
import type { User, UserRole } from "./types"

type AuthLike =
  | (Pick<User, "role"> & { collectionName?: string; collectionId?: string })
  | RecordModel
  | null
  | undefined

/** Safe default: treat missing/unknown roles as developer (read-only). */
export function getUserRole(user: AuthLike): UserRole {
  // PocketBase Admin sessions can manage content (rules bypassed server-side).
  if (isPocketBaseSuperuser(user)) return "designer"
  if (user && "role" in user && user.role === "designer") return "designer"
  return "developer"
}

/**
 * Managers: PocketBase Admin (`_superusers`) credentials, or a `users`
 * record with role `designer`. Everyone else is read-only.
 */
export function canManageContent(user: AuthLike): boolean {
  return getUserRole(user) === "designer"
}
