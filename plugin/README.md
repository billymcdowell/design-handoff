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

The login field takes a **PocketBase auth token** (sent as the `Authorization`
header). A **superuser impersonate token** bypasses owner-scoped API rules, so
the plugin can write into any dashboard-created project.

Generate one from PocketBase Admin:

1. Open `http://localhost:8090/_/`
2. Collections → `_superusers` → your superuser record
3. **Impersonate** → copy the token and paste it into the plugin

A regular `users` auth token also works if that user owns the target projects.

**Variables & Styles:** `foundations.owner` must be a `users` record id. When you
paste a superuser impersonate token, the plugin maps ownership to a dashboard
user (matching email if one exists, otherwise the owner of an existing project).
Without a matching user or project, the upload will ask you to create one first.

See <https://pocketbase.io/docs/authentication/#api-keys>.

## Architecture

| Thread | Responsibility |
| --- | --- |
| `src/main/*` | Figma extraction (CSS engine, PNG export, foundational export) **and** all PocketBase record writes via raw `fetch` (no CORS in the sandbox; frame PNGs attached via hand-built multipart since `FormData` is unavailable). |
| `src/ui/*` | React UI (login / dashboard / progress). Validates the pasted token with one authed request, then relays messages to the main thread. |

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
Local access is declared in `manifest.json → networkAccess.devAllowedDomains`
(Figma rejects `127.0.0.1` — use `localhost` only). When pointing at a
non-local host, add its origin to `networkAccess.allowedDomains`.

## Notes / parity caveats

- **Versioning:** every publish creates *new* `frames` rows (a `frames` row = one
  version snapshot; rows sharing `project` + `name` are versions of one screen).
- **Free-plan limits** (1 project / 50 frames per project) are enforced exactly as
  in the plan. With a superuser token the project count reflects *all* projects the
  token can see — relax `FREE_PLAN_MAX_PROJECTS` in `src/constants.ts` if that is
  too strict for your setup.
- Layer `type` values map 1:1 onto the `layers.type` select in the schema.
