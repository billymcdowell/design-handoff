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
  if (isPocketBaseSuperuser(user)) return "super"
  if (user && "role" in user && user.role === "super") return "super"
  return "developer"
}

/**
 * Managers: PocketBase Admin (`_superusers`) credentials, or a `users`
 * record with role `super`. Everyone else is read-only.
 */
export function canManageContent(user: AuthLike): boolean {
  return getUserRole(user) === "super"
}
