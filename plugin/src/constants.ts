// ─── Shared constants (imported by both main and UI bundles) ──────────────

// clientStorage keys.
export const STORAGE_KEY_TOKEN = "speclyToken"
export const STORAGE_KEY_THEME = "vite-ui-theme" // legacy — handlers exist, UI never uses

// Image export.
export const MAX_FILE_SIZE = 4.5 * 1024 * 1024 // 4,718,592 bytes
export const MAX_DIMENSIONS = [4096, 3072, 2048, 1536, 1024, 768, 512]

// Concurrency.
export const FRAME_PROCESSING_CONCURRENCY = 3

// Auth — minimum trimmed length before we attempt validation.
export const MIN_API_KEY_LENGTH = 6

// Placeholder thumbnail base.
export const PLACEHOLDER_THUMBNAIL = "/placeholder.svg?height=200&width=375"

// Base URL of the stock PocketBase instance. Injected at build time.
export const API_BASE: string =
  import.meta.env.VITE_API_URL || "http://localhost:8090"

// Origin of the web app (SPA is usually served from the same host as PocketBase).
// Override with VITE_APP_URL only when the frontend lives on a different origin.
export const APP_ORIGIN: string = (
  import.meta.env.VITE_APP_URL || API_BASE
).replace(/\/$/, "")
