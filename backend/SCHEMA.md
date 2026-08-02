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
> stock records API. To create many records, loop `pb.collection('x').create()`
> (optionally inside `pb.autoCancellation(false)` / batched requests).

---

## Collections

Built-in `users` auth collection is used for login (email/password). Users are
created in the PocketBase Admin UI — no signup flow. Five custom collections:

```
users ─┐ owns
       ├─< projects ─┬─< frames ─< layers ─o layer_details (1:1)
       │             │              └─< layers (self: parent)
       └─o foundations (1:1)
```

### 1. `projects`

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → `users` | required, single, cascade delete |
| `name` | text | required, min 1 |
| `thumbnail` | file | optional, 1 image |
| `thumbnail_url` | url | optional external fallback |
| `figma_file_url` | url | optional |
| `frame_count` | number (int) | denormalized count, default 0 |

### 2. `frames`  — one row per version snapshot

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → `projects` | required, cascade delete |
| `name` | text | required — **version-group key** |
| `width` | number | optional |
| `height` | number | optional |
| `thumbnail` | file | optional |
| `thumbnail_url` | url | optional |
| `image` | file | optional — main frame render |
| `image_url` | url | optional external fallback |
| `figma_url` | url | optional deep link |
| `sort_order` | number | optional |

### 3. `layers`

| Field | Type | Notes |
| --- | --- | --- |
| `frame` | relation → `frames` | required, cascade delete |
| `parent` | relation → `layers` | optional self-reference, cascade delete |
| `name` | text | required |
| `type` | select | required; Figma node types (`FRAME`, `TEXT`, `RECTANGLE`, …) |
| `x`, `y`, `width`, `height` | number | frame-relative bounds |
| `clickable` | bool | overlay hit-testing (plugin sets `true`) |
| `sort_order` | number | z-order within siblings |

### 4. `layer_details` — 1:1 with `layers`

| Field | Type | Notes |
| --- | --- | --- |
| `layer` | relation → `layers` | required, **unique**, cascade delete |
| `layout` | json | `{ position, dimensions, padding?, margin? }` |
| `styles` | json | `{ backgroundColor?, borderRadius?, borderWidth?, borderColor?, boxShadow?, opacity?, backgroundColorToken?, borderColorToken?, effectStyle? }` |
| `typography` | json | `{ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, color, textAlign, textStyle?, colorToken?, characters?, … } \| null` |
| `code` | json | `{ css, tailwind, react }` |

Token/style refs (optional, resolved at publish time):

```jsonc
"backgroundColorToken": { "id": "VariableID:…", "name": "primary/burgundy" }
"borderColorToken":     { "id": "VariableID:…", "name": "border/default" }
"effectStyle":          { "id": "S:…", "name": "Elevation/MD" }
"textStyle":            { "id": "S:…", "name": "Body/Regular" }
"colorToken":           { "id": "VariableID:…", "name": "text/primary" }
```

`backgroundColorToken` / `borderColorToken` / `effectStyle` live under `styles`; `textStyle` / `colorToken` live under `typography`.

### 5. `foundations` — 1:1 with `users` (shared across all projects)

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → `users` | required, **unique**, cascade delete |
| `data` | json | full Figma variables + styles export (see below) |
| `variables_count` | number (int) | |
| `styles_count` | number (int) | |

Publishing variables & styles from the plugin upserts this single record for the
authenticated user. Every project reads the same foundations.

---

## Versioning model (no versions table)

1. Each sync of a screen creates a **new `frames` row** with the same `name`.
2. All rows sharing `project` + `name` are versions of one screen.
3. Sort by `-updated,-created` — index 0 is **Latest**.
4. The frame-list page shows every row (duplicate names = version cards).
5. The frame switcher dedupes by `name` (keeps latest per name).
6. Deleting a version deletes only that `frames` row; `layers` and
   `layer_details` cascade automatically.

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
| `frameDetail.imageUrl` (http) | `frames.image_url` | `Frame.image_url` |
| `frameDetail.imageUrl` (data:) | `frames.thumbnail` (file) | `Frame.thumbnail` |
| `frame` → parent screen | `frames.project` | `Frame.project` |
| `layer` → owning frame | `layers.frame` | `Layer.frame` |
| `layer.parentId` | `layers.parent` | `Layer.parent` |
| `layerDetail` → `layers.id` | `layer_details.layer` | `LayerDetail.layer` |
| `layerDetail.layout/styles/typography/code` | same-named json fields | same |
| `FoundationalExport` | `foundations.data` | `Foundation.data` |

**Layer upload order:** create layers breadth-first by depth so a child's
`parent` can reference the already-created parent record's PocketBase id.
Keep a `figmaNodeId → pocketbaseId` map while uploading; write `layer_details`
after all layers exist. (Optionally enable *Allow custom record id* on `layers`
in the Admin UI to preserve Figma node ids directly.)

---

## `foundations.data` shape

```jsonc
{
  "variables": {
    "<collectionId>": {
      "id": "…", "name": "Colors",
      "modes": [{ "modeId": "m1", "name": "Default" }],
      "variables": [
        { "id": "v1", "name": "primary/500", "type": "COLOR",
          "valuesByMode": { "m1": { "r": 37, "g": 99, "b": 235, "a": 1 } },
          "description": "", "scopes": [], "codeSyntax": {} }
      ]
    }
  },
  "styles": {
    "paint":  [{ "id": "s1", "name": "Primary Fill", "type": "PAINT", "paints": [ … ] }],
    "text":   [],
    "effect": [],
    "grid":   []
  }
}
```

Value types: `COLOR` → Figma rgba (0–1) or `{css}`/`{hex}`; `FLOAT` → number;
alias → `{ type: "VARIABLE_ALIAS", id, name }`.

---

## API access rules (owner-scoped)

| Collection | List / View / Create / Update / Delete |
| --- | --- |
| `projects` | `owner = @request.auth.id` (create only needs an authed user) |
| `frames` | `project.owner = @request.auth.id` |
| `layers` | `frame.project.owner = @request.auth.id` |
| `layer_details` | `layer.frame.project.owner = @request.auth.id` |
| `foundations` | `owner = @request.auth.id` |

---

## Applying the schema

```bash
# from backend/, with the pocketbase binary present:
./pocketbase migrate up
./pocketbase serve         # admin at /_/ , API at /api/
```

Then create a login user in the Admin UI (`/_/` → Collections → `users` → New).
No signup / password-reset flows exist by design.
