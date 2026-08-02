// ─── Stock PocketBase REST client (main thread) ────────────────────────────
// Everything goes through the standard records API:
//   GET/POST/PATCH  ${API_BASE}/api/collections/{name}/records[/{id}]
// Auth is the PocketBase (superuser) token in the `Authorization` header.
// No custom endpoints, no X-API-Key — see backend/SCHEMA.md.

import { API_BASE } from "../constants"
import {
  buildMultipartBody,
  MultipartField,
  randomBoundary,
} from "./multipart"

export interface PBRecord {
  id: string
  [key: string]: unknown
}

interface PBListResponse<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

function recordsUrl(collection: string, id?: string, query?: string): string {
  const base = `${API_BASE}/api/collections/${collection}/records`
  const withId = id ? `${base}/${encodeURIComponent(id)}` : base
  return query ? `${withId}?${query}` : withId
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: token }
}

export type TokenValidation =
  | {
      ok: true
      displayName: string
      userId: string
      /** Auth collection name (`users` or `_superusers`). */
      collectionName: string
      email: string | null
    }
  | { ok: false; error: string }

function displayNameFromRecord(record: Record<string, unknown> | null): string {
  if (!record) return "User"
  const name = record.name
  if (typeof name === "string" && name.trim()) return name.trim()
  const email = record.email
  if (typeof email === "string" && email.trim()) return email.trim()
  const username = record.username
  if (typeof username === "string" && username.trim()) return username.trim()
  return "User"
}

/** Best-effort collection id/name from a PocketBase JWT payload. */
function collectionHintFromJwt(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as {
      collectionId?: string
      collectionName?: string
    }
    if (typeof payload.collectionName === "string") return payload.collectionName
    if (typeof payload.collectionId === "string") return payload.collectionId
    return null
  } catch {
    return null
  }
}

/**
 * Verify a PocketBase auth token via auth-refresh (the documented way to
 * validate tokens — list endpoints return 200 for guests/invalid tokens).
 * Runs on the main thread so Figma's sandbox fetch is used (no iframe CORS).
 * On success, returns a display name from the auth record (name/email).
 */
export async function validateAuthToken(token: string): Promise<TokenValidation> {
  const hint = collectionHintFromJwt(token)
  const collections = [
    ...(hint ? [hint] : []),
    "_superusers",
    "users",
  ].filter((c, i, arr) => arr.indexOf(c) === i)

  let sawUnauthorized = false
  let networkError: string | null = null

  for (const collection of collections) {
    try {
      const res = await fetch(
        `${API_BASE}/api/collections/${encodeURIComponent(collection)}/auth-refresh`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
          },
        },
      )
      if (res.ok) {
        const body = (await res.json()) as {
          record?: Record<string, unknown>
        }
        const record = body.record ?? null
        const userId =
          record && typeof record.id === "string" ? record.id : ""
        if (!userId) {
          return { ok: false, error: "Auth record missing id" }
        }
        const email =
          record && typeof record.email === "string" ? record.email : null
        // Prefer JWT/auth-refresh collection name; fall back to the path we hit.
        const recordCollection =
          record && typeof record.collectionName === "string"
            ? record.collectionName
            : collection
        return {
          ok: true,
          displayName: displayNameFromRecord(record),
          userId,
          collectionName: recordCollection,
          email,
        }
      }
      if (res.status === 401 || res.status === 403) {
        sawUnauthorized = true
        continue
      }
      // Collection missing / unexpected — keep trying others.
      if (res.status === 404) continue
      return { ok: false, error: await pbErrorMessage(res) }
    } catch (err) {
      networkError = err instanceof Error ? err.message : String(err)
    }
  }

  if (networkError) {
    return {
      ok: false,
      error: `Cannot reach PocketBase at ${API_BASE}. Is it running? (${networkError})`,
    }
  }
  if (sawUnauthorized) {
    return {
      ok: false,
      error:
        "Invalid or expired token. In PocketBase Admin, open Collections → _superusers → your account → Impersonate, copy the token, and paste it here.",
    }
  }
  return {
    ok: false,
    error: `Could not validate token against PocketBase at ${API_BASE}.`,
  }
}

async function pbErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string
      data?: Record<string, { message?: string }>
    }
    if (body?.data && Object.keys(body.data).length > 0) {
      const fieldErrors = Object.entries(body.data)
        .map(([field, info]) => `${field}: ${info?.message ?? "invalid"}`)
        .join("; ")
      return `${body.message || "Request failed"} (${fieldErrors})`
    }
    return body?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

async function pbJson<T>(
  url: string,
  method: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(await pbErrorMessage(res))
  }
  return (await res.json()) as T
}

// ─── Projects ───────────────────────────────────────────────────────────────
export async function listProjectRecords(token: string): Promise<PBRecord[]> {
  const res = await fetch(
    recordsUrl("projects", undefined, "perPage=200&sort=-updated"),
    { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
  )
  if (res.status === 401 || res.status === 403) {
    const err = new Error("API key is invalid. Please log in again.") as Error & {
      unauthorized?: boolean
    }
    err.unauthorized = true
    throw err
  }
  if (!res.ok) throw new Error(await pbErrorMessage(res))
  const data = (await res.json()) as PBListResponse<PBRecord> | PBRecord[]
  return Array.isArray(data) ? data : data.items
}

/** Existence check — returns true if the project record still exists. */
export async function projectExists(token: string, id: string): Promise<boolean> {
  const res = await fetch(recordsUrl("projects", id), {
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
  })
  return res.ok
}

export async function updateProjectRecord(
  token: string,
  id: string,
  data: { figma_file_url?: string; frame_count?: number },
): Promise<PBRecord> {
  return pbJson<PBRecord>(recordsUrl("projects", id), "PATCH", token, data)
}

// ─── Frames ─────────────────────────────────────────────────────────────────
export interface FrameFields {
  project: string
  name: string
  width?: number
  height?: number
  figma_url?: string
  image_url?: string
  sort_order?: number
}

/** Create a frames row. If `image` bytes are supplied, attach them to the
 *  `image` file field via a hand-built multipart request. */
export async function createFrameRecord(
  token: string,
  fields: FrameFields,
  image?: { bytes: Uint8Array; fileName: string },
): Promise<PBRecord> {
  if (!image) {
    return pbJson<PBRecord>(recordsUrl("frames"), "POST", token, fields)
  }

  const boundary = randomBoundary()
  const textFields: MultipartField[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    textFields.push({ name: key, value: String(value) })
  }
  const contentType =
    image.fileName.toLowerCase().endsWith(".jpg") ||
    image.fileName.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png"

  const body = buildMultipartBody(boundary, textFields, [
    { name: "image", fileName: image.fileName, contentType, bytes: image.bytes },
  ])

  const res = await fetch(recordsUrl("frames"), {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw new Error(await pbErrorMessage(res))
  return (await res.json()) as PBRecord
}

// ─── Layers ─────────────────────────────────────────────────────────────────
export interface LayerFields {
  frame: string
  parent?: string
  name: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  clickable?: boolean
  sort_order?: number
}

export async function createLayerRecord(
  token: string,
  fields: LayerFields,
): Promise<PBRecord> {
  return pbJson<PBRecord>(recordsUrl("layers"), "POST", token, fields)
}

// ─── Layer details ───────────────────────────────────────────────────────────
export interface LayerDetailFields {
  layer: string
  layout: unknown
  styles: unknown
  typography: unknown
  code: unknown
}

export async function createLayerDetailRecord(
  token: string,
  fields: LayerDetailFields,
): Promise<PBRecord> {
  return pbJson<PBRecord>(recordsUrl("layer_details"), "POST", token, fields)
}

// ─── Foundations (upsert 1:1 with users) ─────────────────────────────────────
export interface FoundationFields {
  owner: string
  data: unknown
  variables_count: number
  styles_count: number
}

/**
 * `foundations.owner` is a relation to the `users` collection.
 * Superuser impersonate tokens authenticate against `_superusers`, whose ids are
 * not valid relation targets — map them to a real `users` id before upserting.
 */
export async function resolveFoundationOwnerId(
  token: string,
  auth: Extract<TokenValidation, { ok: true }>,
): Promise<string> {
  const isSuperuser =
    auth.collectionName === "_superusers" ||
    auth.collectionName === "pbc_3142635823" // PocketBase system collection id

  if (!isSuperuser) return auth.userId

  // 1. Prefer a `users` row with the same email as the superuser.
  if (auth.email) {
    const filter = encodeURIComponent(`email = "${auth.email.replace(/"/g, '\\"')}"`)
    const res = await fetch(
      recordsUrl("users", undefined, `perPage=1&filter=${filter}`),
      { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
    )
    if (res.ok) {
      const data = (await res.json()) as PBListResponse<PBRecord>
      const id = data.items[0]?.id
      if (typeof id === "string" && id) return id
    }
  }

  // 2. Fall back to the owner of the most recently updated project (superusers
  //    can list all projects; dashboard users own those rows).
  const projects = await listProjectRecords(token)
  for (const project of projects) {
    const owner = project.owner
    if (typeof owner === "string" && owner) return owner
  }

  throw new Error(
    "Superuser tokens cannot own foundations. Create a dashboard user " +
      "(Collections → users), or create a project while logged into the " +
      "dashboard, then retry. Or paste a users auth token instead of a " +
      "superuser impersonate token.",
  )
}

export async function findFoundationRecord(
  token: string,
  ownerId: string,
): Promise<PBRecord | null> {
  const filter = encodeURIComponent(`owner = "${ownerId}"`)
  const res = await fetch(
    recordsUrl("foundations", undefined, `perPage=1&filter=${filter}`),
    { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as PBListResponse<PBRecord>
  return data.items[0] ?? null
}

export async function upsertFoundationRecord(
  token: string,
  fields: FoundationFields,
): Promise<PBRecord> {
  const existing = await findFoundationRecord(token, fields.owner)
  if (existing) {
    // Owner is already set on the existing row; avoid re-validating the relation.
    const { owner: _owner, ...patch } = fields
    return pbJson<PBRecord>(
      recordsUrl("foundations", existing.id),
      "PATCH",
      token,
      patch,
    )
  }
  return pbJson<PBRecord>(recordsUrl("foundations"), "POST", token, fields)
}
