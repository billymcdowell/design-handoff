# Design Handoff

Self-hostable design handoff tool: sync Figma frames into PocketBase, then inspect layout, styles, and generated CSS/Tailwind/React in the web app.

| Part | Role |
| --- | --- |
| `backend/` | PocketBase (API, auth, file storage, schema) |
| `frontend/` | React SPA (viewer) — built into PocketBase `pb_public` |
| `plugin/` | Figma plugin (publisher) |

---

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/). No `.env` file required.

```bash
git clone https://github.com/YOUR_USER/design-handoff.git
cd design-handoff
docker compose up -d --build
```

On **first boot** (only if no admin exists yet), PocketBase prints a one-time installer URL:

```bash
docker compose logs | grep 'Launch the URL' -A1
# → http://0.0.0.0:8090/_/#/pbinstall/<token>
# open http://localhost:8090/_/#/pbinstall/<token>
```

If you already have a `.env` with `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`, the admin is created automatically and **no installer URL appears** — just open http://localhost:8090/_/ and sign in with those credentials.

| URL | What |
| --- | --- |
| http://localhost:8090 | App |
| http://localhost:8090/_/ | PocketBase Admin |

Then:

1. Admin → **Collections → `users` → New record** — create a login user (email/password). Set **role** to `designer` for people who publish, or `developer` for read-only. There is no public signup.
2. Sign in to the app with that user (designers can manage; developers view).
3. Point the Figma plugin at your server — designers sign in with the same email/password (see below).

On first start the container runs `pocketbase migrate up`, which creates all collections (`projects`, `sections`, `frames`, `layers`, `layer_details`, `foundations`, `feedback`, plus the `users.role` field). Rebuild after schema/migration changes so Docker picks them up:

```bash
docker compose up -d --build
```

Existing volumes keep their data; new migrations (including foundations v2 field help + clearing pre-v2 foundations JSON) apply on boot. Re-sync foundations from the Figma plugin after upgrading.

### Persisting data (DB + images)

Everything durable lives under `/pb/pb_data` inside the container:

| Path | Contents |
| --- | --- |
| `pb_data/data.db` | Collections, users, projects, frames, layers… |
| `pb_data/auxiliary.db` | PocketBase internal/aux data |
| `pb_data/storage/` | Uploaded files (frame PNGs, thumbnails) |

**Default — named Docker volume** (already in `docker-compose.yml`):

```bash
docker compose up -d --build
docker compose down          # stop (keeps data)
docker compose down -v       # stop + wipe volume (resets admin + all uploads)
```

**Host folder bind mount** (easy to back up / inspect images on disk):

```bash
mkdir -p ./data/pb_data
docker compose -f docker-compose.yml -f docker-compose.bind.yml up -d --build
```

That writes to `./data/pb_data` on your machine. After a Figma publish you should see files under `./data/pb_data/storage/`.

```bash
# backup
tar -czf design-handoff-backup.tgz -C ./data pb_data

# restore (with stack stopped)
tar -xzf design-handoff-backup.tgz -C ./data
```

### Optional environment

Copy `.env.example` only if you need these:

| Variable | Purpose |
| --- | --- |
| `PORT` | Host port (default `8090`) |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | Skip the installer and create the admin non-interactively (CI) |

---

## Figma plugin

```bash
cd plugin
cp .env.example .env
# set VITE_API_URL to your PocketBase origin, e.g. http://localhost:8090
# for a remote host, also add that origin to manifest.json → networkAccess.allowedDomains
npm install
npm run build
```

In Figma Desktop: **Plugins → Development → Import plugin from manifest…** → select `plugin/manifest.json`.

Auth: sign in with a `users` account that has **role `designer`** (same email/password as the web app). Details in [`plugin/README.md`](plugin/README.md).

---

## Local development (without Docker)

```bash
# Terminal 1 — PocketBase
cd backend
# download PocketBase for your OS from https://pocketbase.io/docs/ , then:
./pocketbase serve   # http://127.0.0.1:8090

# Terminal 2 — Vite frontend
cd frontend
npm install
npm run dev          # http://localhost:5173  (API → :8090)
```

Production-style local build (SPA served by PocketBase):

```bash
cd frontend && npm run build   # → backend/pb_public
cd ../backend && ./pocketbase serve
```

Schema is applied by `backend/pb_migrations` on first start. See [`backend/SCHEMA.md`](backend/SCHEMA.md).

---

## MCP server (AI specs)

A local stdio [MCP](https://modelcontextprotocol.io/) server in [`mcp/`](mcp/) lets an AI pull full frame specs (layout, styles, typography, CSS/Tailwind/React) from a design-handoff `/frame/{frameId}` URL.

```bash
cd mcp && npm install
```

Configure Cursor with `DESIGN_HANDOFF_URL` + `DESIGN_HANDOFF_TOKEN` — see [`mcp/README.md`](mcp/README.md).

---

## License

Add a license before publishing if you want to clarify reuse terms (e.g. MIT).
