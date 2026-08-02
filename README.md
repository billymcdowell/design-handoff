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

On **first boot**, PocketBase prints a one-time installer URL in the logs. Copy it and open it in your browser (replace `0.0.0.0` with `localhost`):

```bash
docker compose logs | grep pbinstall
# → http://0.0.0.0:8090/_/#/pbinstall/<token>
# open http://localhost:8090/_/#/pbinstall/<token>
```

That page lets you create your own admin email/password. After that:

| URL | What |
| --- | --- |
| http://localhost:8090 | App |
| http://localhost:8090/_/ | PocketBase Admin |

Then:

1. Admin → **Collections → `users` → New record** — create a login user (email/password). Set **role** to `super` for designers who publish, or `developer` for read-only. There is no public signup.
2. Sign in to the app with that user.
3. Point the Figma plugin at your server (see below).

On first start the container runs `pocketbase migrate up`, which creates all collections (`projects`, `frames`, `layers`, `layer_details`, `foundations`, plus the `users.role` field).

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

Auth: paste a PocketBase auth token (Admin → `_superusers` → Impersonate, or a `users` token for owner-scoped access). Details in [`plugin/README.md`](plugin/README.md).

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

## License

Add a license before publishing if you want to clarify reuse terms (e.g. MIT).
