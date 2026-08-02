import PocketBase from "pocketbase"

// In dev the Vite server (5173) is a different origin from PocketBase (8090),
// so point at the local PB instance. In the production build the SPA is served
// from PocketBase's own `pb_public`, so same-origin ("/") is correct.
const baseUrl =
  import.meta.env.VITE_POCKETBASE_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8090" : "/")

export const pb = new PocketBase(baseUrl)

// The default LocalAuthStore already persists the session in localStorage, so
// auth survives reloads with no extra wiring.
