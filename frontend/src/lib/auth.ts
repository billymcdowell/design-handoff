import { pb } from "./pocketbase"
import type { User } from "./types"

/** PocketBase Admin auth collection (same credentials as `/_/` login). */
export const SUPERUSERS_COLLECTION = "_superusers"
export const USERS_COLLECTION = "users"

/** System collection id for `_superusers` (PocketBase default). */
const SUPERUSERS_COLLECTION_ID = "pbc_3142635823"

export function isPocketBaseSuperuser(
  record: { collectionName?: string; collectionId?: string } | null | undefined,
): boolean {
  if (!record) return false
  return (
    record.collectionName === SUPERUSERS_COLLECTION ||
    record.collectionId === SUPERUSERS_COLLECTION_ID
  )
}

export function authCollectionName(
  record: { collectionName?: string } | null | undefined = pb.authStore.record,
): string {
  if (isPocketBaseSuperuser(record)) return SUPERUSERS_COLLECTION
  return USERS_COLLECTION
}

/**
 * Sign in with PocketBase Admin credentials first, then fall back to a
 * dashboard `users` account (designers / developers).
 */
export async function signInWithPassword(email: string, password: string) {
  try {
    return await pb.collection(SUPERUSERS_COLLECTION).authWithPassword(email, password)
  } catch {
    return await pb.collection(USERS_COLLECTION).authWithPassword(email, password)
  }
}

/** Refresh the current session against the correct auth collection. */
export async function refreshAuthSession() {
  if (!pb.authStore.isValid) return
  await pb.collection(authCollectionName()).authRefresh()
}

/**
 * `projects.owner` must point at a `users` record.
 * PocketBase Admin ids are not valid there — map to a matching users row.
 *
 * When `createIfMissing` is true (project create), a linked users row is
 * created from the Admin email so ownership relations work.
 */
export async function resolveOwnerUserId(options?: {
  createIfMissing?: boolean
}): Promise<string> {
  const createIfMissing = options?.createIfMissing ?? false
  const record = pb.authStore.record as User | null
  if (!record?.id) throw new Error("Not authenticated")

  if (!isPocketBaseSuperuser(record)) return record.id

  const email = typeof record.email === "string" ? record.email.trim() : ""
  if (email) {
    try {
      const existing = await pb
        .collection(USERS_COLLECTION)
        .getFirstListItem<User>(`email = "${email.replace(/"/g, '\\"')}"`)
      return existing.id
    } catch {
      if (!createIfMissing) {
        throw new Error("No linked users account for this Admin email")
      }
    }

    const password = crypto.randomUUID() + "Aa1!"
    const created = await pb.collection(USERS_COLLECTION).create<User>({
      email,
      emailVisibility: true,
      password,
      passwordConfirm: password,
      name: typeof record.name === "string" && record.name ? record.name : email,
      // Linked ownership account — login stays on Admin credentials.
      role: "developer",
    })
    return created.id
  }

  const projects = await pb.collection("projects").getList(1, 1, {
    sort: "-updated",
    fields: "owner",
  })
  const owner = projects.items[0]?.owner
  if (typeof owner === "string" && owner) return owner

  throw new Error(
    "Signed in as PocketBase Admin, but no linked users account exists. Create a users record or set an email on your Admin account.",
  )
}
