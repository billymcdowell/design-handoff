# Design Handoff — Shared PocketBase Collection Schema

This is the **single shared contract** between the three parts of the app:

| Part | Role | Talks to PocketBase via |
| --- | --- | --- |
| `plugin/` (Figma plugin) | **Writer** — syncs screens, layers, tokens | Stock REST `POST/PATCH /api/collections/{name}/records` |
| `backend/` (PocketBase) | **Store** — hosts the collections + files | — (this schema) |
| `frontend/` (React SPA) | **Reader** — browse, inspect, version history | PocketBase JS SDK (`pb.collection(...)`) |

PocketBase is served **exactly out of the box**. There are no custom endpoints
(no `/api/frames/bulk`, no `X-API-Key`). Everything goes through the stock
records API with cookie/token auth. The schema is applied by
[`pb_migrations/`](pb_migrations/).

> **Note for the plugin:** earlier plugin drafts referenced custom `*_id` fields
> and `/bulk` endpoints. Against stock PocketBase, use the **native relation
> field names below** (`project`, `frame`, `parent`, `layer`, `owner`) and the
> stock records API. Bulk writes use stock `POST /api/batch` (enabled by
> migration `1785666600_enable_batch_api.js`: maxRequests 50, timeout 30s).
> The plugin batches `layers` / `layer_details` as JSON chunks of ≤50 with
> client-pregenerated ids; frame PNG creates stay as individual multipart
> `POST /api/collections/frames/records` (PocketBase advises against large
> file uploads inside batch transactions).

---

## Collections

Built-in auth collections:

| Who | Collection | Login |
| --- | --- | --- |
| Designers | `users` (`role: designer`) | Microsoft OAuth2 (plugin) / email+password (web, until cutover) — publish from Figma plugin; manage in the web app |
| Developers | `users` (`role: developer`) | Same — read + copy only; plugin signs in but cannot publish |
| PocketBase Admin | `_superusers` | Admin UI (`/_/`) only — ops / schema; not required for day-to-day publishing |

**Plugin auth** uses Microsoft OAuth2 via a browser relay (`/oauth/start` →
Entra ID → `/oauth/callback`) and a short-lived `oauth_sessions` record. New
Microsoft users are auto-provisioned as `developer` (see `pb_hooks/main.pb.js`);
an admin must set **role** to `designer` before they can publish. OAuth cannot
self-escalate role (update rule locks `role` against self-change).

Web app `/login` still supports email/password (and Admin `_superusers`) for
ops. Disable password auth on `users` in PocketBase Admin only after Microsoft
login is verified end-to-end.

```
_superusers  →  PocketBase Admin (API rules bypassed; ops only)
users        →  designers (write) + developers (read-only)
       └─ owns projects / foundations (relation targets)
```

`projects.owner` / `foundations.owner` always reference a `users` id. When an
Admin creates a project in the web app, the app links (or creates) a `users` row
with the same email for that relation.

### 1. `projects`

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → `users` | required, single, cascade delete |
| `name` | text | required, min 1 |
| `thumbnail` | file | optional, 1 image |
| `thumbnail_url` | url | optional external fallback |
| `figma_file_url` | url | optional |
| `frame_count` | number (int) | denormalized count, default 0 |

### 2. `sections` — optional groupings of screens within a project

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → `projects` | required, cascade delete |
| `name` | text | required, min 1 |
| `sort_order` | number | optional — display order in the project |

### 3. `frames`  — one row per version snapshot

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → `projects` | required, cascade delete |
| `section` | relation → `sections` | optional — screen group; cleared if section deleted |
| `name` | text | required — **version-group key** |
| `width` | number | optional |
| `height` | number | optional |
| `thumbnail` | file | optional |
| `thumbnail_url` | url | optional |
| `image` | file | optional — main frame render |
| `image_url` | url | optional external fallback |
| `figma_url` | url | optional deep link |
| `page_name` | text | optional — Figma page the screen was published from |
| `sort_order` | number | optional |

### 4. `layers`

| Field | Type | Notes |
| --- | --- | --- |
| `frame` | relation → `frames` | required, cascade delete |
| `parent` | relation → `layers` | optional self-reference, cascade delete |
| `name` | text | required |
| `type` | select | required; Figma node types (`FRAME`, `TEXT`, `RECTANGLE`, …) |
| `x`, `y`, `width`, `height` | number | frame-relative bounds |
| `clickable` | bool | overlay hit-testing (plugin sets `true`) |
| `sort_order` | number | z-order within siblings |
| `figma_node_id` | text | optional — raw Figma node id for deep links |

### 5. `layer_details` — 1:1 with `layers`

| Field | Type | Notes |
| --- | --- | --- |
| `layer` | relation → `layers` | required, **unique**, cascade delete |
| `layout` | json | `{ position, dimensions, padding?, margin?, autoLayout?, constraints? }` |
| `styles` | json | `{ backgroundColor?, borderRadius?, borderWidth?, borderColor?, boxShadow?, opacity?, effects?, backgroundColorToken?, borderColorToken?, effectStyle? }` |
| `typography` | json | `{ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, color, textAlign, textDecoration?, textTransform?, characters?, textStyle?, colorToken?, … } \| null` |
| `code` | json | `{ css, tailwind, react }` |
| `component` | json | optional `{ kind, name, mainComponentName?, componentSetName?, variantProperties?, componentProperties? }` |

Token/style refs (optional, resolved at publish time):

```jsonc
"backgroundColorToken": { "id": "VariableID:…", "name": "primary/burgundy" }
"borderColorToken":     { "id": "VariableID:…", "name": "border/default" }
"effectStyle":          { "id": "S:…", "name": "Elevation/MD" }
"textStyle":            { "id": "S:…", "name": "Body/Regular" }
"colorToken":           { "id": "VariableID:…", "name": "text/primary" }
```

`backgroundColorToken` / `borderColorToken` / `effectStyle` live under `styles`; `textStyle` / `colorToken` live under `typography`.

### 6. `foundations` — 1:1 with `users` (shared across all projects)

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → `users` | required, **unique**, cascade delete |
| `data` | json | v2 multi-file token catalog + history (see below) |
| `variables_count` | number (int) | catalog tokens with `origin === "variable"` |
| `styles_count` | number (int) | catalog tokens with style origins (paint/text/effect/grid) |

Publishing variables & styles from the plugin **mirrors by Figma file key** into
this single record for the authenticated user. Re-syncing from the same file
replaces that file’s token slice only; other files’ tokens are kept. Every
project reads the same foundations.

### 7. `feedback` — product feedback about Design Handoff

| Field | Type | Notes |
| --- | --- | --- |
| `author` | relation → `users` | required — submitting user |
| `type` | select | required; `bug` \| `idea` \| `ux` |
| `message` | text | required, 1–5000 chars |
| `page` | text | optional — URL/path where it was submitted |

Any authenticated user can **create** (with `author = @request.auth.id`, or
Admin via a linked `users` row). List / view / update / delete are Admin-only
(null rules — review in Admin UI → Collections → `feedback`).

### 8. `oauth_sessions` — one-time Microsoft OAuth relay for the Figma plugin

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text (15–64) | Client-generated capability token (plugin creates the record) |
| `token` | text | Optional — PocketBase JWT written by `/oauth/callback` |
| `created` | autodate | Used by cron TTL (~5 min) |

API rules: create/view/delete are public (knowledge of `id` is auth); list is
Admin-only; update requires an authenticated user (callback after Microsoft
login). Hooks force empty `token` on create, reject a second update once set,
and delete rows older than 5 minutes.

---

## Versioning model (no versions table)

1. Each sync of a screen creates a **new `frames` row** with the same `name`,
   unless `content_hash` matches the latest version (unchanged → skipped).
2. All rows sharing `project` + `name` are versions of one screen.
3. Sort by `-updated,-created` — index 0 is **Latest**.
4. The frame-list page shows every row (duplicate names = version cards).
5. The frame switcher dedupes by `name` (keeps latest per name).
6. Deleting a version deletes only that `frames` row; `layers` and
   `layer_details` cascade automatically.
7. `frames.content_hash` stores a fingerprint of the PNG + layer tree so the
   plugin can skip duplicate versions on republish.
8. `frames.section` is optional. Assigning a screen to a section in the
   dashboard updates **all versions** with that `project` + `name`. On
   republish, the plugin copies `section` from the previous latest version.
9. Deleting a section clears `frames.section` (frames are not deleted).

---

## Field mapping (plugin payload ⇄ PocketBase ⇄ frontend type)

The plugin's internal camelCase payload maps to stock PocketBase fields. The
frontend reads the PocketBase fields directly.

| Plugin payload key | PocketBase field | Frontend type field |
| --- | --- | --- |
| `project.createdBy` | `projects.owner` | `Project.owner` |
| `project.figmaFileUrl` | `projects.figma_file_url` | `Project.figma_file_url` |
| `project.frameCount` | `projects.frame_count` | `Project.frame_count` |
| `frame.figmaUrl` | `frames.figma_url` | `Frame.figma_url` |
| `frame.pageName` | `frames.page_name` | `Frame.page_name` |
| `layer.id` (Figma) | `layers.figma_node_id` | `Layer.figma_node_id` |
| `layerDetail.component` | `layer_details.component` | `LayerDetail.component` |
| `frameDetail.imageUrl` (http) | `frames.image_url` | `Frame.image_url` |
| `frameDetail.imageUrl` (data:) | `frames.thumbnail` (file) | `Frame.thumbnail` |
| `frame` → parent screen | `frames.project` | `Frame.project` |
| `frame` → optional group | `frames.section` | `Frame.section` |
| `layer` → owning frame | `layers.frame` | `Layer.frame` |
| `layer.parentId` | `layers.parent` | `Layer.parent` |
| `layerDetail` → `layers.id` | `layer_details.layer` | `LayerDetail.layer` |
| `layerDetail.layout/styles/typography/code` | same-named json fields | same |
| `FoundationalExport` (merged) | `foundations.data` | `Foundation.data` |

**Layer upload order:** create layers breadth-first by depth so a child's
`parent` can reference the already-created parent record's PocketBase id.
Keep a `figmaNodeId → pocketbaseId` map while uploading; write `layer_details`
after all layers exist. (Optionally enable *Allow custom record id* on `layers`
in the Admin UI to preserve Figma node ids directly.)

---

## `foundations.data` shape

Multi-file **mirror**. Each Figma file that syncs local variables & styles is
stored under `sources[<fileKey>]` as an id-keyed token map. `catalog` is the
flattened union for the Foundations viewer (colliding names across files get a
`` `${fileName} / ${name}` `` prefix). `history` is a capped changelog (last 50
entries). Non-v2 payloads are discarded on the next sync (no backwards compat).

```jsonc
{
  "version": 2,
  "sources": {
    "<fileKey>": {
      "fileKey": "abc",
      "fileName": "Design System",
      "updatedAt": "2026-08-02T12:00:00.000Z",
      "tokens": {
        "VariableID:1": {
          "id": "VariableID:1",
          "name": "primary/500",
          "sourceFileKey": "abc",
          "sourceFileName": "Design System",
          "category": "color",
          "origin": "variable",
          "collectionName": "Colors",
          "modes": [{ "modeId": "m1", "name": "Light" }],
          "valuesByMode": {
            "m1": { "kind": "color", "hex": "#2563EB", "css": "rgba(37, 99, 235, 1)" }
          },
          "css": "rgba(37, 99, 235, 1)"
        },
        "S:effect1:shadow": {
          "id": "S:effect1:shadow",
          "name": "Elevation / 2",
          "category": "shadow",
          "origin": "effect",
          "value": {
            "kind": "shadow",
            "x": 0, "y": 4, "blur": 8, "spread": 0,
            "color": "rgba(0,0,0,0.2)", "opacity": 0.2, "inset": false
          },
          "css": "box-shadow: 0px 4px 8px 0px rgba(0,0,0,0.2)"
        }
      }
    }
  },
  "catalog": { /* flatten of all sources.tokens */ },
  "history": [
    {
      "id": "h_…",
      "at": "2026-08-02T12:00:00.000Z",
      "fileKey": "abc",
      "fileName": "Design System",
      "summary": {
        "kind": "diff", // or "initial" | "source_removed"
        "added": [{ "id": "…", "name": "primary/500", "category": "color" }],
        "removed": [],
        "changed": [{
          "id": "…", "name": "primary/600", "category": "color",
          "changes": [{ "path": "valuesByMode.Light", "before": {…}, "after": {…} }]
        }],
        "counts": { "tokens": 42 } // present on initial / source_removed
      }
    }
  ]
}
```

Categories (type-first): `color`, `typography`, `number` (+ `numberKind`:
spacing|radius|other), `shadow`, `blur`, `grid`, `other`. Effect styles that
contain both shadows and blurs are split into synthetic ids
`` `${styleId}:shadow` `` / `` `${styleId}:blur` ``.

`variables_count` / `styles_count` on the record count catalog tokens by
`origin === "variable"` vs everything else.

---

## API access rules (role-scoped)

All authenticated users can **list/view** every record. Mutations require
`@request.auth.role = "designer"`.

| Collection | List / View | Create / Update / Delete |
| --- | --- | --- |
| `projects` | any authed user | designer only (create also requires `owner = @request.auth.id`) |
| `sections` | any authed user | designer only |
| `frames` | any authed user | designer only |
| `layers` | any authed user | designer only |
| `layer_details` | any authed user | designer only |
| `foundations` | any authed user | designer only (and `owner = @request.auth.id` on write) |
| `feedback` | Admin only | create: any authed user (`author = self`, or Admin); update/delete: Admin only |

---

## Applying the schema

**Option A — migrations (local `pb_data` or Docker):**

```bash
# from backend/, with the pocketbase binary present:
./pocketbase migrate up
./pocketbase serve         # admin at /_/ , API at /api/
```

Docker applies the same `pb_migrations/` on boot (`docker-entrypoint.sh`). After
pulling schema/migration changes, rebuild so the image gets the new files:

```bash
docker compose up -d --build
```

`1785666300_foundations_v2_catalog.js` updates foundations field help and clears
non-v2 `data` blobs (re-sync from Figma afterward).

`1785666600_enable_batch_api.js` enables `POST /api/batch` (maxRequests 50,
timeout 30s) so the plugin can chunk layer / layer_detail creates.

**Option B — Admin UI import (fresh PocketBase):**

1. Open Admin → **Settings → Import collections**
2. Upload [`schema.json`](schema.json) (same contents as `pb_collections_import.json`)
3. Leave **Delete missing collections** unchecked (keeps the built-in `users` collection and merges fields)
4. Confirm — this adds `projects` / `sections` / `frames` / `layers` / `layer_details` / `foundations` / `feedback` **and** the `users.role` field (`designer` | `developer`)

Then create login users as needed:

- **Designers:** Admin → Collections → `users` → New (role `designer`). They
  sign into the Figma plugin and web app with email/password.
- **Developers:** Admin → Collections → `users` → New (role `developer`).

No public signup / password-reset flows exist by design.

> If you already have `users` rows from before the rename, migration
> `1785666700_rename_super_to_designer.js` maps `role=super` → `designer`.
> After a manual schema import, set **role** on each user if needed.
