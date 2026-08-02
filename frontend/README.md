# Design Handoff — Frontend

Vite + React + shadcn (base-ui) SPA for the Design Handoff design-handoff viewer. It
reads projects, frames, layers, inspect details, versions, and design tokens
from a stock PocketBase instance. Data is fetched with the PocketBase JS SDK
directly (no react-query).

The shared collection schema lives in [`../backend/SCHEMA.md`](../backend/SCHEMA.md)
and is applied by [`../backend/pb_migrations`](../backend/pb_migrations).

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
```

In dev the app talks to PocketBase at `http://127.0.0.1:8090` (override with
`VITE_POCKETBASE_URL`). Run PocketBase separately:

```bash
cd ../backend && ./pocketbase serve
```

Create a login user in the PocketBase Admin UI (`/_/` → `users` → New record).
There is no signup / password-reset flow by design — login and logout only.

## Build & host from PocketBase

```bash
npm run build          # outputs to ../backend/pb_public
cd ../backend && ./pocketbase serve   # app served same-origin at :8090
```

`../backend/pb_hooks/main.pb.js` adds the SPA fallback so client routes
(e.g. `/projects/:id`) resolve on refresh.

## Structure

| Path | Purpose |
| --- | --- |
| `src/lib/pocketbase.ts` | PocketBase client singleton |
| `src/lib/api/` | Collection CRUD wrappers (stock REST) |
| `src/lib/types.ts` | Record types matching the shared schema |
| `src/hooks/data.ts` | `useAsync`-based data hooks over the SDK |
| `src/providers/auth-provider.tsx` | Auth context (login/logout only) |
| `src/pages/` | Route-level pages |
| `src/features/frames/` | Frame viewer canvas + inspector |
| `src/features/projects/` | Projects grid + CRUD |
| `src/features/foundations/` | Design-token browser |

## Key behaviors

- **Versioning** is implicit: frames sharing a project + name are versions,
  newest (`-updated`) is "Latest". No versions table.
- **Frame viewer**: click a layer to inspect Layout/Style/Type/Code; hover for
  padding overlays; select + hover a second layer for a distance measurement;
  right-click overlapping layers for a picker; zoom 5–500% with right-drag /
  wheel panning; double-click a TEXT layer to copy its text.
