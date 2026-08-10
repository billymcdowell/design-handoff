// ─── Stock PocketBase REST client (main thread) ────────────────────────────
// Everything goes through the standard records API:
//   GET/POST/PATCH  ${API_BASE}/api/collections/{name}/records[/{id}]
// Auth is a PocketBase JWT in the `Authorization` header (from users
// email/password login). No custom endpoints, no X-API-Key — see SCHEMA.md.

import { API_BASE, APP_ORIGIN } from "../constants"
import {
  buildBatchMultipartBody,
  buildMultipartBody,
  MultipartField,
  MultipartFile,
  randomBoundary,
} from "./multipart"

/** Matches PocketBase Dashboard batch.maxRequests (migration 1785666600). */
export const BATCH_MAX_REQUESTS = 50

/** Concurrent individual frame PNG creates (images stay out of /api/batch). */
export const FRAME_UPLOAD_CONCURRENCY = 6

const PB_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
/** Longer alphabet for oauth_sessions capability ids (still [a-z0-9]). */
const OAUTH_SESSION_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
const USERS_COLLECTION = "users"
const SUPERUSERS_COLLECTION = "_superusers"
const OAUTH_SESSIONS_COLLECTION = "oauth_sessions"
/** PocketBase system collection id for `_superusers`. */
const SUPERUSERS_COLLECTION_ID = "pbc_3142635823"

/** Poll / timeout for the Microsoft OAuth relay (matches ~5 min server TTL). */
const OAUTH_POLL_MS = 1500
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

/** PocketBase default id: 15 lowercase alphanumeric characters. */
export function generateRecordId(): string {
  let id = ""
  for (let i = 0; i < 15; i++) {
    id += PB_ID_CHARS[Math.floor(Math.random() * PB_ID_CHARS.length)]
  }
  return id
}

/** Random capability token used as `oauth_sessions` record id (32 chars). */
export function generateOauthSessionId(): string {
  let id = ""
  for (let i = 0; i < 32; i++) {
    id += OAUTH_SESSION_CHARS[Math.floor(Math.random() * OAUTH_SESSION_CHARS.length)]
  }
  return id
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

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
      /** JWT to store (from login or auth-refresh). */
      token: string
      /** `users.role` when present (`designer` | `developer`). */
      role: string | null
      /** False for developer accounts — API still rejects writes. */
      canPublish: boolean
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

function isSuperuserCollection(name: string): boolean {
  return name === SUPERUSERS_COLLECTION || name === SUPERUSERS_COLLECTION_ID
}

function roleFromRecord(record: Record<string, unknown> | null): string | null {
  if (!record || typeof record.role !== "string") return null
  return record.role
}

/**
 * Plugin publish requires a designer `users` account (or Admin `_superusers`
 * for rare ops). Developers may sign in but cannot publish — PocketBase API
 * rules enforce the same boundary server-side.
 */
export function assertCanPublish(
  collectionName: string,
  record: Record<string, unknown> | null,
): string | null {
  if (isSuperuserCollection(collectionName)) return null
  const role = roleFromRecord(record)
  if (role === "designer") return null
  if (role === "developer") {
    return "This account is a developer (read-only). Ask an admin to set your role to designer to publish."
  }
  return "Only designer accounts can publish from the plugin. Set role to designer in PocketBase Admin."
}

function canPublishFromAuth(
  collectionName: string,
  record: Record<string, unknown> | null,
): boolean {
  return assertCanPublish(collectionName, record) === null
}

function authResultFromBody(
  body: { token?: string; record?: Record<string, unknown> },
  fallbackCollection: string,
  fallbackToken?: string,
): TokenValidation {
  const record = body.record ?? null
  const userId = record && typeof record.id === "string" ? record.id : ""
  if (!userId) {
    return { ok: false, error: "Auth record missing id" }
  }
  const email =
    record && typeof record.email === "string" ? record.email : null
  const recordCollection =
    record && typeof record.collectionName === "string"
      ? record.collectionName
      : fallbackCollection

  const nextToken =
    typeof body.token === "string" && body.token
      ? body.token
      : fallbackToken
  if (!nextToken) {
    return { ok: false, error: "Auth response missing token" }
  }

  return {
    ok: true,
    displayName: displayNameFromRecord(record),
    userId,
    collectionName: recordCollection,
    email,
    token: nextToken,
    role: roleFromRecord(record),
    canPublish: canPublishFromAuth(recordCollection, record),
  }
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
 * Sign in with Microsoft via the web OAuth relay.
 * Opens `${APP_ORIGIN}/oauth/start?session=…` in the system browser; the
 * plugin polls `oauth_sessions` until the callback writes a PocketBase JWT.
 */
export async function startMicrosoftLogin(
  signal?: { cancelled: boolean },
): Promise<TokenValidation> {
  const sessionId = generateOauthSessionId()
  try {
    const createRes = await fetch(
      recordsUrl(OAUTH_SESSIONS_COLLECTION),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      },
    )
    if (!createRes.ok) {
      return {
        ok: false,
        error: `Could not start Microsoft sign-in: ${await pbErrorMessage(createRes)}`,
      }
    }

    const startUrl = `${APP_ORIGIN}/oauth/start?session=${encodeURIComponent(sessionId)}`
    figma.openExternal(startUrl)

    const token = await pollOauthSession(sessionId, signal)
    if (signal?.cancelled) {
      return { ok: false, error: "Sign-in cancelled." }
    }
    if (!token) {
      return {
        ok: false,
        error:
          "Microsoft sign-in timed out. Complete sign-in in the browser, then try again.",
      }
    }

    // Single-use: delete the relay record (best-effort).
    try {
      await fetch(recordsUrl(OAUTH_SESSIONS_COLLECTION, sessionId), {
        method: "DELETE",
      })
    } catch {
      /* cron TTL will clean up */
    }

    return validateAuthToken(token)
  } catch (err) {
    const networkError = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Cannot reach PocketBase at ${API_BASE}. Is it running? (${networkError})`,
    }
  }
}

/**
 * Poll `oauth_sessions/{id}` until `token` is set, the timeout elapses, or
 * `signal.cancelled` becomes true.
 */
export async function pollOauthSession(
  sessionId: string,
  signal?: { cancelled: boolean },
): Promise<string | null> {
  const deadline = Date.now() + OAUTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal?.cancelled) return null
    try {
      const res = await fetch(recordsUrl(OAUTH_SESSIONS_COLLECTION, sessionId), {
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        const body = (await res.json()) as { token?: string }
        if (typeof body.token === "string" && body.token.trim()) {
          return body.token.trim()
        }
      } else if (res.status === 404) {
        return null
      }
    } catch {
      /* keep polling through transient network blips */
    }
    await sleep(OAUTH_POLL_MS)
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sign in with a dashboard `users` email/password.
 * Kept for local/dev cutover; the plugin UI uses Microsoft OAuth.
 */
export async function authWithPassword(
  email: string,
  password: string,
): Promise<TokenValidation> {
  try {
    const res = await fetch(
      `${API_BASE}/api/collections/${encodeURIComponent(USERS_COLLECTION)}/auth-with-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email, password }),
      },
    )
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid email or password." }
      }
      return { ok: false, error: await pbErrorMessage(res) }
    }
    const body = (await res.json()) as {
      token?: string
      record?: Record<string, unknown>
    }
    return authResultFromBody(body, USERS_COLLECTION)
  } catch (err) {
    const networkError = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Cannot reach PocketBase at ${API_BASE}. Is it running? (${networkError})`,
    }
  }
}

/**
 * Verify a PocketBase auth token via auth-refresh (the documented way to
 * validate tokens — list endpoints return 200 for guests/invalid tokens).
 * Runs on the main thread so Figma's sandbox fetch is used (no iframe CORS).
 * On success, returns a display name and (possibly refreshed) token.
 */
export async function validateAuthToken(token: string): Promise<TokenValidation> {
  const hint = collectionHintFromJwt(token)
  const collections = [
    ...(hint ? [hint] : []),
    USERS_COLLECTION,
    SUPERUSERS_COLLECTION,
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
          token?: string
          record?: Record<string, unknown>
        }
        return authResultFromBody(body, collection, token)
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
        "Session expired. Sign in again with Microsoft from the plugin.",
    }
  }
  return {
    ok: false,
    error: `Could not validate session against PocketBase at ${API_BASE}.`,
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
    const err = new Error("Session expired. Please log in again.") as Error & {
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
  /** Optional project section id — copied from the previous version on republish. */
  section?: string
  /** Fingerprint used to skip unchanged republishes. */
  content_hash?: string
  /** Figma page name the frame was published from. */
  page_name?: string
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/** Latest version of a screen (same project + name), or null if never published. */
export async function getLatestFrameByName(
  token: string,
  projectId: string,
  name: string,
): Promise<PBRecord | null> {
  const filter = encodeURIComponent(
    `project = "${escapeFilterValue(projectId)}" && name = "${escapeFilterValue(name)}"`,
  )
  const res = await fetch(
    recordsUrl("frames", undefined, `perPage=1&sort=-updated,-created&filter=${filter}`),
    { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as PBListResponse<PBRecord>
  return data.items[0] ?? null
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

// ─── Batch API ──────────────────────────────────────────────────────────────
export interface BatchRequest {
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  url: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

/** File attached to batch request index N as `requests.N.fieldName`. */
export interface BatchFileAttachment {
  requestIndex: number
  fieldName: string
  fileName: string
  contentType: string
  bytes: Uint8Array
}

export interface BatchResultItem {
  status: number
  body: unknown
}

/**
 * `POST /api/batch` — JSON by default; multipart when `files` are supplied
 * (`@jsonPayload` + `requests.N.fieldName`). Batch must be enabled server-side.
 */
export async function sendBatch(
  token: string,
  requests: BatchRequest[],
  files?: BatchFileAttachment[],
): Promise<BatchResultItem[]> {
  if (requests.length === 0) return []
  if (requests.length > BATCH_MAX_REQUESTS) {
    throw new Error(
      `Batch size ${requests.length} exceeds max ${BATCH_MAX_REQUESTS}`,
    )
  }

  const payload = { requests }
  const url = `${API_BASE}/api/batch`

  let res: Response
  if (files && files.length > 0) {
    const boundary = randomBoundary()
    const multipartFiles: MultipartFile[] = files.map((f) => ({
      name: `requests.${f.requestIndex}.${f.fieldName}`,
      fileName: f.fileName,
      contentType: f.contentType,
      bytes: f.bytes,
    }))
    const body = buildBatchMultipartBody(
      boundary,
      JSON.stringify(payload),
      multipartFiles,
    )
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body as unknown as BodyInit,
    })
  } else {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  }

  if (!res.ok) {
    throw new Error(await pbErrorMessage(res))
  }
  return (await res.json()) as BatchResultItem[]
}

/** Create many records via `/api/batch`, chunked to BATCH_MAX_REQUESTS. */
export async function createRecordsInBatches(
  token: string,
  collection: string,
  records: Array<Record<string, unknown>>,
): Promise<PBRecord[]> {
  const created: PBRecord[] = []
  for (const chunk of chunkArray(records, BATCH_MAX_REQUESTS)) {
    const requests: BatchRequest[] = chunk.map((body) => ({
      method: "POST",
      url: `/api/collections/${collection}/records`,
      body,
    }))
    const results = await sendBatch(token, requests)
    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      if (item.status < 200 || item.status >= 300) {
        const msg =
          item.body &&
          typeof item.body === "object" &&
          "message" in item.body &&
          typeof (item.body as { message: unknown }).message === "string"
            ? (item.body as { message: string }).message
            : `HTTP ${item.status}`
        throw new Error(`Batch create ${collection}[${i}] failed: ${msg}`)
      }
      created.push(item.body as PBRecord)
    }
  }
  return created
}

// ─── Layers ─────────────────────────────────────────────────────────────────
export interface LayerFields {
  /** Optional client-pregenerated PocketBase id (for batch parent refs). */
  id?: string
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
  /** Raw Figma node id for deep links. */
  figma_node_id?: string
}

export async function createLayerRecord(
  token: string,
  fields: LayerFields,
): Promise<PBRecord> {
  return pbJson<PBRecord>(recordsUrl("layers"), "POST", token, fields)
}

// ─── Layer details ───────────────────────────────────────────────────────────
export interface LayerDetailFields {
  id?: string
  layer: string
  layout: unknown
  styles: unknown
  typography: unknown
  code: unknown
  component?: unknown
}

export async function createLayerDetailRecord(
  token: string,
  fields: LayerDetailFields,
): Promise<PBRecord> {
  return pbJson<PBRecord>(recordsUrl("layer_details"), "POST", token, fields)
}

// ─── Foundations (single-tenant singleton, slug=default) ─────────────────────

/** Fixed singleton key for this deploy. */
export const SHARED_FOUNDATIONS_SLUG = "default"

export interface FoundationFields {
  slug: string
  data: unknown
  variables_count: number
  styles_count: number
}

export async function findSharedFoundationRecord(
  token: string,
): Promise<PBRecord | null> {
  const filter = encodeURIComponent(`slug = "${SHARED_FOUNDATIONS_SLUG}"`)
  const res = await fetch(
    recordsUrl("foundations", undefined, `perPage=1&filter=${filter}`),
    { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as PBListResponse<PBRecord>
  return data.items[0] ?? null
}

/**
 * Upsert the shared foundations catalog. Creates slug=default on first sync.
 * Callers should skip this when syncFoundationsData returns no historyEntry.
 */
export async function upsertSharedFoundationRecord(
  token: string,
  fields: Omit<FoundationFields, "slug">,
): Promise<PBRecord> {
  const existing = await findSharedFoundationRecord(token)
  if (existing) {
    return pbJson<PBRecord>(
      recordsUrl("foundations", existing.id),
      "PATCH",
      token,
      fields,
    )
  }
  return pbJson<PBRecord>(recordsUrl("foundations"), "POST", token, {
    slug: SHARED_FOUNDATIONS_SLUG,
    ...fields,
  })
}

// ─── Component libraries (singleton meta + library_components rows) ──────────

export const SHARED_COMPONENT_LIBRARIES_SLUG = "default"

export interface ComponentLibraryMetaFields {
  slug: string
  data: unknown
  components_count: number
}

export async function findSharedComponentLibraryRecord(
  token: string,
): Promise<PBRecord | null> {
  const filter = encodeURIComponent(
    `slug = "${SHARED_COMPONENT_LIBRARIES_SLUG}"`,
  )
  const res = await fetch(
    recordsUrl("component_libraries", undefined, `perPage=1&filter=${filter}`),
    { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as PBListResponse<PBRecord>
  return data.items[0] ?? null
}

export async function upsertSharedComponentLibraryRecord(
  token: string,
  fields: Omit<ComponentLibraryMetaFields, "slug">,
): Promise<PBRecord> {
  const existing = await findSharedComponentLibraryRecord(token)
  if (existing) {
    return pbJson<PBRecord>(
      recordsUrl("component_libraries", existing.id),
      "PATCH",
      token,
      fields,
    )
  }
  return pbJson<PBRecord>(recordsUrl("component_libraries"), "POST", token, {
    slug: SHARED_COMPONENT_LIBRARIES_SLUG,
    ...fields,
  })
}

export interface LibraryComponentFields {
  key: string
  name: string
  kind: "COMPONENT" | "COMPONENT_SET"
  file_key: string
  file_name: string
  figma_node_id?: string
  variants?: unknown
  tokens_used?: unknown
  description?: string
  content_hash?: string
}

export async function listLibraryComponentsByFileKey(
  token: string,
  fileKey: string,
): Promise<PBRecord[]> {
  const filter = encodeURIComponent(
    `file_key = "${escapeFilterValue(fileKey)}"`,
  )
  const items: PBRecord[] = []
  let page = 1
  for (;;) {
    const res = await fetch(
      recordsUrl(
        "library_components",
        undefined,
        `page=${page}&perPage=200&filter=${filter}`,
      ),
      { headers: { ...authHeaders(token), "Content-Type": "application/json" } },
    )
    if (!res.ok) throw new Error(await pbErrorMessage(res))
    const data = (await res.json()) as PBListResponse<PBRecord>
    items.push(...data.items)
    if (items.length >= data.totalItems || data.items.length === 0) break
    page += 1
  }
  return items
}

async function upsertLibraryComponentMultipart(
  token: string,
  method: "POST" | "PATCH",
  url: string,
  fields: LibraryComponentFields,
  preview?: { bytes: Uint8Array; fileName: string },
): Promise<PBRecord> {
  if (!preview) {
    return pbJson<PBRecord>(url, method, token, fields as unknown as Record<string, unknown>)
  }

  const boundary = randomBoundary()
  const textFields: MultipartField[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    const serialized =
      typeof value === "object" ? JSON.stringify(value) : String(value)
    textFields.push({ name: key, value: serialized })
  }
  const body = buildMultipartBody(boundary, textFields, [
    {
      name: "preview",
      fileName: preview.fileName,
      contentType: "image/png",
      bytes: preview.bytes,
    },
  ])

  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(token),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw new Error(await pbErrorMessage(res))
  return (await res.json()) as PBRecord
}

export async function createLibraryComponentRecord(
  token: string,
  fields: LibraryComponentFields,
  preview?: { bytes: Uint8Array; fileName: string },
): Promise<PBRecord> {
  return upsertLibraryComponentMultipart(
    token,
    "POST",
    recordsUrl("library_components"),
    fields,
    preview,
  )
}

export async function updateLibraryComponentRecord(
  token: string,
  id: string,
  fields: LibraryComponentFields,
  preview?: { bytes: Uint8Array; fileName: string },
): Promise<PBRecord> {
  return upsertLibraryComponentMultipart(
    token,
    "PATCH",
    recordsUrl("library_components", id),
    fields,
    preview,
  )
}

export async function deleteLibraryComponentRecord(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(recordsUrl("library_components", id), {
    method: "DELETE",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(await pbErrorMessage(res))
  }
}

