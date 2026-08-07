# Running via Docker

This page is written for a reader with **zero Docker context** — it
explains not just the commands but what they do and why, so you can
operate this deployment even if you've never used Docker before.

## What Docker gives you here (and what it doesn't)

Docker packages the **backend** (FastAPI service) and **frontend**
(Vue 3 SPA, served by nginx) as two isolated, reproducible
"containers" — think of a container as a lightweight, disposable
virtual machine that only contains what its image says it contains.
`docker compose` is a small orchestrator that builds both images from
this repo and starts/stops them together as a unit.

**What is NOT containerized, deliberately (v1 scope):** KataGo (the
Go-analysis engine) and KataProxy (`proxy/`, the bridge in front of
it). GPU drivers and engine setup are specific to your machine, so
v1 does not attempt to containerize them — the containerized app
connects to the engine running on your host, exactly the same way
the app does when you run it without Docker at all. See "Pointing at
the engine" below for what that means in practice.

Everything else about running the app day-to-day — where cards.db
lives, how to back it up, how ports are chosen — is explained below.

## Prerequisites

- Docker Engine with the `docker compose` plugin (`docker compose
  version` should print something; this was built and verified
  against Docker 29.4 / Compose 5.3).
- The `proxy/` git submodule does **not** need to be checked out to
  build or run these images — neither Dockerfile reads from `proxy/`,
  so an empty submodule directory is harmless here (though you still
  want it checked out to run the engine itself; see `proxy/README.md`).
- Your KataGo + KataProxy stack already running on this machine (or
  reachable over the network), the same as a non-Docker install.

## Quick start

```bash
docker compose up --build
```

First run builds both images (a couple of minutes — Python deps for
the backend, `npm ci` + `vite build` for the frontend) and starts
them. Subsequent runs skip the build unless source changed.

Open **http://localhost:19080** in a browser. That's the SPA. It
talks to the backend at **http://localhost:19081**.

Stop everything with Ctrl-C, or from another shell:

```bash
docker compose down
```

`down` (no flag) stops and removes the containers but **keeps your
data** — see "Where your data lives" below. Nothing is lost between
`up` / `down` cycles.

## Why ports 19080 / 19081, not the usual dev ports

If you've run this project without Docker, you may know the backend
as `:8764` and the frontend dev server as `:5173`. The Docker
compose file deliberately publishes **different** host ports
(19080 for the frontend, 19081 for the backend) so `docker compose
up` never collides with an already-running non-Docker instance of
this same app on your machine. Override them if you like:

```bash
FRONTEND_PORT=8080 BACKEND_PORT=8081 docker compose up --build
```

(If you change `BACKEND_PORT`, the frontend image is rebuilt with
that new backend URL baked in — see "How the frontend finds the
backend" below for why a rebuild, not a restart, is required.)

## Where your data lives, and backing it up

The backend stores everything in a **named Docker volume** called
`cards_data`, mounted at `/app/data` inside the backend container.
It holds:

- `cards.db` — the SQLite database (all your cards, review history,
  imported games).
- `.jwt_secret` — the auto-generated signing key for login tokens.
  If this file is lost, every existing session/token is invalidated
  on next restart (same behavior as the non-Docker install).

A named volume is Docker's mechanism for data that should outlive a
container: `docker compose down` removes the *containers* but the
volume (and everything in it) stays on disk, ready for the next
`docker compose up`. Only `docker compose down -v` (the `-v` deletes
volumes too) destroys it — that flag is intentionally not the
default.

This volume holds only *your* per-installation state. Read-only
assets the application ships with (e.g. the suggestion-color
calibration data served at `GET /resources/visit-distribution`) live
in `backend/resources_data/` instead — tracked in git, baked into the
image by the normal `COPY . .` build step, and never touched by the
volume mount. The two used to be co-located under `backend/data/`,
which meant `.dockerignore`'s exclusion of that mutable directory (to
keep a developer's live `cards.db` out of images) silently swept the
shipped resource out too, and the `/app/data` volume mount would have
shadowed it even if it had been copied — see
`backend/resources_data/README.md` for the fix.

**To back up**, copy the file straight out of the volume:

```bash
docker compose cp backend:/app/data/cards.db ./cards-backup-$(date +%F).db
```

**To restore** a backup into a fresh install:

```bash
docker compose cp ./cards-backup-2026-08-07.db backend:/app/data/cards.db
docker compose restart backend
```

**To inspect the volume's location on disk** (rarely needed):
`docker volume inspect <project>_cards_data`.

## Pointing at the engine

The browser — not either container — is what opens the WebSocket
connection to KataGo/KataProxy for board analysis. That connection
is configured the same way it always is for this app: either the
built-in default (`ws://127.0.0.1:41948`, i.e. "the engine on this
same machine") or an explicit URL you set in the app's own Settings
UI (`settings.katago.url`), which always wins once set. Docker
doesn't change this — the browser reaches the engine directly,
outside of Docker's networking entirely, because the browser itself
runs on your host, not inside a container.

If your engine runs somewhere other than `127.0.0.1:41948` (a
different machine on your LAN, a non-default port), set it once in
the app's Settings UI after first login — no rebuild needed, this is
a runtime setting, not a build-time one. Alternatively, override the
built-in default at build time:

```bash
ENGINE_WS_URL=ws://192.168.1.50:41948 docker compose up --build
```

**A wiring detail for the curious:** `docker-compose.yml` also maps
`host.docker.internal` to your host machine *inside* each container
(`extra_hosts: host.docker.internal:host-gateway`). This is **not**
what the browser uses (`host.docker.internal` only resolves inside
containers, never on your host's own network stack) — it's there so
anything run *inside* the backend container itself (e.g. an operator
shelling in with `docker compose exec backend sh` to curl the
engine's status endpoint) can reach the host without extra
configuration. The backend's own request-handling code never calls
the engine today — that's purely a browser-to-engine connection — so
this mapping isn't on the critical path of a normal request; it's
forward-wiring for troubleshooting.

### Sharing one engine process across multiple clients

KataProxy itself can start and own a KataGo process (its LEAF role;
see `proxy/README.md`), but if you want one host-side, CUDA-bound
KataGo process shared by more than one client at a time — the
dockerized backend/SPA *and* KataProxy, or several KataProxy
instances — `backend/scripts/katago_ws_shim.py` is a small,
dependency-minimal (stdlib + `websockets`) operator script for
exactly that. It launches `katago analysis` as a subprocess and
re-exposes it as a WebSocket server, namespacing each connected
client's query IDs so concurrent clients never collide inside the
one shared engine:

```bash
python backend/scripts/katago_ws_shim.py \
    --katago-path /path/to/katago \
    --model /path/to/model.bin.gz \
    --config /path/to/analysis.cfg
    # --host / --port default to 127.0.0.1:1242; see --help,
    # or the KATAGO_PATH / KATAGO_MODEL / KATAGO_CONFIG /
    # KATAGO_WS_HOST / KATAGO_WS_PORT env vars, for the rest.
```

KataProxy can chain to it: point KataProxy's own upstream engine URL
at `ws://<shim-host>:<shim-port>`, the same way it would point at a
bare KataGo process. Per this codebase's fail-loudly tenet
(ADR-0002), if the katago subprocess dies, the shim does not keep
serving a dead engine — it logs the failure, drops connected
clients, and exits non-zero rather than degrading silently; restart
it deliberately (or under a process supervisor) rather than relying
on it to self-heal.

## How the frontend finds the backend

The frontend is a Vue single-page app; it doesn't read environment
variables at container start the way the backend does. Vite (the
frontend's build tool) **bakes** `VITE_API_BASE_URL` and
`VITE_KATAGO_WS_URL` into the compiled JavaScript at *build* time
(`frontend/src/config/env.ts` is the one file that reads them). That
means:

- Changing `BACKEND_PORT` or `ENGINE_WS_URL` requires a **rebuild**
  of the frontend image (`docker compose up --build` — Compose is
  smart enough to only rebuild what changed).
- The compose file passes these as Docker **build args**, matching
  whatever host port it's about to publish, so the two stay in sync
  automatically as long as you go through `docker compose up
  --build` rather than building the image by hand with different
  values.

## Static serving: nginx vs. mounting the SPA in the backend

Two ways exist to serve a built SPA: have the backend's web
framework serve the static files itself (same origin as the API), or
run a dedicated static file server (a separate origin, reached by
its own published port). **This project uses the second shape** — a
small nginx container serves the built `dist/` — for two concrete,
investigated reasons, not a default habit:

1. **The backend doesn't do this today, and the frontend isn't built
   to assume it does.** `backend/main.py` registers only API routers
   and `/health` — no `StaticFiles` mount exists. Meanwhile the
   frontend already resolves its API base as an **absolute URL**
   baked in at build time (`VITE_API_BASE_URL`, defaulting to
   `http://localhost:8764`), not a relative path like `/api/...`.
   That's a split-origin design already, independent of Docker: CORS
   is configured for it (`CORS_ALLOW_ORIGINS` defaulting to `["*"]`,
   paired with `allow_credentials=False` in `main.py`, which is what
   makes a wildcard origin spec-compliant). Serving the SPA from
   inside the FastAPI process would mean swimming against an
   existing, working convention rather than following it.
2. **Minimal touch.** Standing up nginx as a second container
   requires zero backend code changes. Adding `StaticFiles` +
   SPA-fallback routing to `main.py` would touch the backend's
   application wiring for a Docker-packaging task whose ratified
   scope (ledger row 690) didn't call for changing app behavior —
   and it would couple frontend deploys to backend container
   restarts, which today are independent.

**Rejected alternative:** mounting `StaticFiles` (and a catch-all
`index.html` fallback route for client-side routing) directly on the
FastAPI app, so one container serves both API and SPA on one origin.
Rejected for the two reasons above; also loses independent
scaling/restart of the two tiers for no offsetting benefit here.

## Files, in one place

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Multi-stage build: install Python deps in a builder stage, copy only the installed packages + app source into a slim, non-root final stage. |
| `backend/.dockerignore` | Keeps `venv/`, `__pycache__/`, local `*.db`, and `.jwt_secret` out of the build context/image. |
| `frontend/Dockerfile` | Multi-stage build: `npm ci && npm run build` in a Node stage, then copy `dist/` into an nginx (non-root/`nginx-unprivileged`) stage. |
| `frontend/nginx.conf` | SPA history-mode fallback (`try_files ... /index.html`) plus long-cache headers for content-hashed asset files. |
| `frontend/.dockerignore` | Keeps `node_modules/` and `dist/` out of the build context. |
| `docker-compose.yml` | Wires both images together: named volume for backend data, port mapping, engine-host env var, restart policy. |

## Troubleshooting

- **Backend container exits immediately / `ModuleNotFoundError`**:
  check `docker compose logs backend`. (Building this feature
  surfaced two dependencies genuinely missing from
  `backend/requirements.txt` — `bcrypt` and `python-multipart`,
  both imported directly by `core/security.py` and FastAPI's form
  handling respectively, present in every working dev venv only
  because something installed them by hand at some point. Both are
  now pinned in `requirements.txt`; a Docker build from a clean
  base image is what caught it, since a long-lived local venv never
  loses a package once installed.)
- **Frontend loads but every API call fails**: check that
  `VITE_API_BASE_URL` baked into the image matches the backend's
  actually-published port — open the browser devtools Network tab
  and see what host:port the failing request targeted. Rebuild the
  frontend image if you changed `BACKEND_PORT` without rebuilding.
- **"port is already allocated"**: something else on your machine
  (possibly a non-Docker instance of this same app) is using 19080
  or 19081. Set `FRONTEND_PORT` / `BACKEND_PORT` to something else.
