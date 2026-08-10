# Design Handoff — Figma Plugin

Extracts design specs (frames, layers, styles, generated CSS/Tailwind/React) and
foundational tokens (Figma variables + local styles) from the selected frames and
publishes them to the Design Handoff **stock PocketBase** backend.

This plugin is the **writer** in the shared schema described in
[`../backend/SCHEMA.md`](../backend/SCHEMA.md). It talks to PocketBase's standard
records API only — no custom endpoints, no `X-API-Key`. Relations use the native
field names (`project`, `frame`, `parent`, `layer`, `owner`).

> Built from [`plan.md`](plan.md). Where the plan assumed a custom REST API
> (`/api/frames/bulk`, `/api/image-upload`, `/api/api-key/verify`), the transport
> layer was rewritten to stock PocketBase per `SCHEMA.md` — the plan's behaviour,
> CSS engine, extraction, UI copy, and plan-limit rules are otherwise preserved.

## Auth

Sign in with **Microsoft** (Entra ID). The plugin opens
`${VITE_APP_URL}/oauth/start?session=…` in the system browser; after Microsoft
login the web app writes a PocketBase JWT into a one-time `oauth_sessions`
record and the plugin polls until it appears, then stores it in
`figma.clientStorage`.

Setup:

1. Register a single-tenant Azure AD app with redirect URI
   `https://<app-origin>/oauth/callback` and scopes `openid email profile`
2. PocketBase Admin → Collections → `users` → OAuth2 → enable **Microsoft**
   (client ID/secret + tenant authority URLs)
3. First Microsoft sign-in auto-provisions the user as **developer**; promote
   publishers to **designer** in Admin
4. Rebuild the plugin with `VITE_API_URL` / `VITE_APP_URL` pointing at your hosts

Designer accounts can publish. Developer accounts can sign in read-only (publish
buttons disabled; PocketBase API rules still reject writes).

**Foundations:** `foundations.owner` must be a `users` record id. A designer
login already uses that id, so ownership maps directly.

**Sync foundations** mirrors this Figma file’s local variables & styles into a
per-file slice (other files’ slices are kept). Diffs are semantic (by Figma id);
the first sync for a file logs an “Initial sync” summary, later syncs only log
real added/removed/changed tokens, and empty diffs skip history. Non-v2 data is
replaced on the next sync (no backwards compatibility).

## Architecture

| Thread | Responsibility |
| --- | --- |
| `src/main/*` | Figma extraction (CSS engine, PNG export, foundational export) **and** all PocketBase record writes via raw `fetch` (no CORS in the sandbox; frame PNGs attached via hand-built multipart since `FormData` is unavailable). Opens the system browser for Microsoft OAuth and polls `oauth_sessions`. |
| `src/ui/*` | React UI (Microsoft login / dashboard / progress). Relays `LOGIN_MICROSOFT` to the main thread. |

Data flow on publish: `PUBLISH → createBackendPayload → DATA_READY_FOR_UPLOAD →
UPLOAD_DATA → project (PATCH) → frames → layers (by depth) → layer_details →
UPLOAD_COMPLETE`. Frame PNG bytes stay in the main thread (`imageStore`) and are
attached straight to the `frames.image` file field.

## Setup

```bash
npm install
cp .env.example .env      # set VITE_API_URL to your PocketBase origin
npm run build             # → dist/code.js + dist/index.html
```

Then in Figma Desktop: **Plugins → Development → Import plugin from manifest…** and
pick `manifest.json`.

- `npm run watch` — rebuild both bundles on change (dev).
- `npm run typecheck` — type-check without emitting.

`VITE_API_URL` defaults to `http://localhost:8090` (matches local PocketBase).
`VITE_APP_URL` is the web origin for Microsoft OAuth and share links (defaults
to `VITE_API_URL`). When the Vite frontend runs on `:5173` in dev, set
`VITE_APP_URL=http://localhost:5173`. Local access is declared in
`manifest.json → networkAccess.devAllowedDomains`. When pointing at a
non-local host, add its origin to `networkAccess.allowedDomains`.

After a successful publish, the plugin lists a copyable viewer URL for each
new frame version (`/frame/{id}?projectId=…`) so you can paste them to teammates.

## Notes / parity caveats

- **Versioning:** every publish creates *new* `frames` rows (a `frames` row = one
  version snapshot; rows sharing `project` + `name` are versions of one screen).
- **Free-plan limits** (1 project / 50 frames per project) are enforced exactly as
  in the plan. The project count reflects *all* projects the session can see —
  relax `FREE_PLAN_MAX_PROJECTS` in `src/constants.ts` if that is too strict.
- Layer `type` values map 1:1 onto the `layers.type` select in the schema.
