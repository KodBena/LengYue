# wf12-docker-image — Docker image (wiki Wanted feature #12)

Branch: `worktree-agent-a84feb33a33619d96`
Commit: `03f7199e` — "feat(docker): multi-stage backend/frontend images + compose (wf12)"
Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a84feb33a33619d96`
Report location: written to this worktree's `.claude/dispatch-reports/` — the shared-checkout
path `/home/bork/w/omega/.claude/dispatch-reports/` is outside this agent's writable worktree
(fallback per dispatch instructions).

## Zero-context Docker orientation

Docker packages an app and its dependencies into an **image** (a
read-only bundle: OS packages, language runtime, app code) that runs
as a **container** (an isolated process using that image). A
**Dockerfile** is the recipe that builds an image. **`docker
compose`** starts multiple related containers together from a single
`docker-compose.yml` — here, one for the backend and one for the
frontend — handling networking between them and port publishing to
the host.

This deployment builds two images:
- **backend**: `python:3.13-slim` → installs `backend/requirements.txt`
  → runs `uvicorn main:app` on port 8764 inside the container.
- **frontend**: `node:24-alpine` builds the Vue SPA (`npm run build`)
  → `nginxinc/nginx-unprivileged:1.27-alpine` serves the built
  `dist/` on port 8080 inside the container.

`docker-compose.yml` publishes those to host ports **19081**
(backend) and **19080** (frontend) by default — deliberately not the
app's normal dev ports (8764/5173/etc.), so `docker compose up` never
collides with a non-Docker instance already running.

The full walkthrough (build, up, backup/restore, engine pointing,
troubleshooting) is at `docs/docker.md`; README.md has a short
pointer to it under "Running".

## Image / compose layout

| File | Role |
|---|---|
| `backend/Dockerfile` | Multi-stage: `builder` installs deps to `/install`; `final` (non-root `appuser`, uid 1000) copies only the installed packages + app source. `libpq5`/`ca-certificates` added for the plain (non-`[binary]`) `psycopg` runtime dependency. |
| `backend/.dockerignore` | Excludes `venv/`, `__pycache__/`, `data/`, `*.db`, `.jwt_secret` from the build context — mirrors `backend/.gitignore`'s local-only list, so a developer's live db/secret can never end up baked into an image. |
| `frontend/Dockerfile` | Multi-stage: `build` (node) runs `npm ci && npm run build` with `VITE_API_BASE_URL`/`VITE_KATAGO_WS_URL` as build args; `final` (nginx-unprivileged, non-root) copies `dist/`. |
| `frontend/nginx.conf` | SPA history-mode fallback (`try_files $uri $uri/ /index.html`) + long-cache headers for content-hashed `/assets/`. |
| `frontend/.dockerignore` | Excludes `node_modules/`, `dist/` from the build context. |
| `docker-compose.yml` | Wires both services: named volume `cards_data` → `/app/data` on backend; `${BACKEND_PORT:-19081}:8764`, `${FRONTEND_PORT:-19080}:8080`; `restart: unless-stopped`; `extra_hosts: host.docker.internal:host-gateway` on backend. |
| `docs/docker.md` | Zero-context orientation doc. |

Alembic migrations run automatically at container startup via the
**existing, unmodified** `main.py` lifespan hook
(`db.alembic_bootstrap.bootstrap_alembic`) — no separate migration
step or entrypoint script was needed.

## Static-serving decision + rejected alternative

**Chosen: nginx serves the built SPA as a separate container/origin.**
Investigated whether the backend already serves the SPA — it does
not (`backend/main.py` registers only API routers + `/health`, no
`StaticFiles` mount). Investigated the frontend's API-base-URL
resolution (`frontend/src/config/env.ts`) — `VITE_API_BASE_URL`
defaults to an **absolute URL** (`http://localhost:8764`), baked in
at Vite build time, not a relative path — and `CORS_ALLOW_ORIGINS`
defaults to `["*"]` paired with `allow_credentials=False` in
`main.py`. Together these mean the app is **already architected as
split-origin**, independent of Docker.

**Rejected: mounting `StaticFiles` + a catch-all `index.html` route
directly on the FastAPI app** (same-origin serving). Rejected
because (1) it would require touching `backend/main.py`'s app wiring
for a task whose ratified scope (ledger row 690) is packaging, not
app-behavior change, and (2) it would go against the frontend's
already-established build-time-absolute-URL convention rather than
follow it, and (3) it would couple frontend deploys to backend
container restarts, which are independent today.

## Engine/proxy host wiring

Confirmed via grep across `backend/` that the backend **never**
calls KataGo/KataProxy server-side — the only server-side hits are
mentions in comments/domain models. The analysis WebSocket connection
is made **client-side, by the browser**, using either the
build-time-baked `VITE_KATAGO_WS_URL` fallback or the user's runtime
Settings-UI override. Because the browser runs on the operator's
host (not inside a container), it already reaches `127.0.0.1:41948`
directly — no Docker networking trick is needed or used for that
path.

`docker-compose.yml` still wires `extra_hosts:
host.docker.internal:host-gateway` on the backend service, per the
task's explicit ask — this is **container-to-host** reachability
(e.g. an operator running `docker compose exec backend sh` and
curling the engine), not on the browser's request path. Documented
plainly in `docs/docker.md` as forward-wiring, not load-bearing for
v1's actual flow, to avoid the honest mistake of implying it's what
makes analysis work.

## Real bugs found by containerizing (fixed, in scope)

Building from a clean base image (rather than a long-lived local
venv that accumulates hand-installed packages) surfaced two
dependencies imported directly by app code but **absent** from
`backend/requirements.txt`:
- `bcrypt` (`backend/core/security.py:1`) — password hashing.
- `python-multipart` — required by FastAPI for form-data handling
  (used by the token/login endpoint).

Both are present in the repo's own `backend/venv` (installed by hand
at some point) but were never pinned. Confirmed exact installed
versions via `backend/venv/bin/pip freeze` (`bcrypt==5.0.0`,
`python-multipart==0.0.32`) and added both, pinned, to
`backend/requirements.txt`. This is a genuine pre-existing bug (a
fresh non-Docker `pip install -r requirements.txt` would hit it too)
that the Docker build path is what exposed.

## Witnessed evidence

All WITNESSED with real command output, captured during a live
`docker compose up` session on this machine (Docker 29.4.0,
Compose 5.3.1), host ports 19080/19081 only.

- **`docker build ./backend`**: exit 0. `docker build ./frontend`:
  exit 0 (after fixing an `.dockerignore` typo that had also
  excluded `nginx.conf` — caught immediately by the build itself
  failing with "not found").
- **`docker compose config`**: exit 0; confirmed resolved ports
  19080/19081 and build args before ever starting a container.
- **`docker compose up -d --build`**: exit 0. `docker compose ps`
  showed both containers `Up`, ports `0.0.0.0:19081->8764/tcp` and
  `0.0.0.0:19080->8080/tcp`.
- **`GET http://localhost:19081/health`** → `HTTP_STATUS=200`,
  body `{"status":"healthy","engine":"SQLAlchemy 2.0 Async"}`.
- **`POST http://localhost:19081/auth/token`** (no body) →
  `HTTP_STATUS=422`, body is FastAPI's standard validation-error
  shape: `{"detail":[{"type":"missing","loc":["body","username"],...}]}`.
  Counts as a real, correctly-shaped API response per the task's
  either/or criterion.
- **`GET http://localhost:19081/cards/1`** (no auth) →
  `HTTP_STATUS=401`, body `{"detail":"Not authenticated"}`.
- **`GET http://localhost:19080/`** → `HTTP_STATUS=200`, serves the
  SPA `index.html`.
- **`GET http://localhost:19080/some/deep/route`** →
  `HTTP_STATUS=200`, byte-identical to `index.html` (`diff -q`
  confirmed match) — SPA history-mode fallback works.
- Confirmed the served JS bundle contains the correct baked-in
  `localhost:19081` API URL (`grep -o localhost:19081
  assets/*.js` inside the running frontend container matched).
- **`docker compose down -v`**: exit 0. Removed both containers, the
  network, and the `cards_data` volume (log showed each
  Stopping/Removed/Removed line).
- Post-teardown: `docker ps -a` shows zero `lengyue-*` containers
  (only pre-existing, unrelated `mathwiki-*` containers, untouched
  throughout). `docker images -f dangling=true -q` empty.
  `docker volume ls` shows no leftover project volume. Manually
  removed the ad-hoc `:test`-tagged images built during development
  and the compose-tagged images (`docker rmi`, exit 0) so nothing
  image-level was left behind either.

## Volume / backup story

`cards.db` and the auto-generated `.jwt_secret` live in the named
volume `cards_data`, mounted at `/app/data` in the backend container
— wired via the backend's own already-supported `DATABASE_URI` /
`SECRET_KEY_FILE` env vars (no backend code change required for
this part). `docker compose down` preserves the volume; only `down
-v` deletes it. Backup/restore recipe (`docker compose cp`) is in
`docs/docker.md`.

## Constraints honored

- No host ports outside 19000+ used during witnessing; the checked-in
  compose defaults (19080/19081) are themselves in that range, so no
  override was needed to comply.
- No live process/port touched. Checked `docker ps -a` before
  starting — zero pre-existing `lengyue-*` containers found (task's
  predecessor-cleanup step was a no-op; only unrelated `mathwiki-*`
  containers exist on this host and were left alone).
- Live `cards.db` / backend `.env` never read or copied — fresh named
  volume only, and both are excluded via `.dockerignore` as well as
  the pre-existing `.gitignore`.
- Frontend suite not run — no frontend *source* was touched (only
  `Dockerfile`/`nginx.conf`/`.dockerignore`, which are build
  infrastructure, not app source under `frontend/src`); the frontend
  build itself (`vue-tsc -b && vite build`) DID run, twice, as part
  of `docker build`, and both succeeded (exit 0), which is a
  stronger signal than the unit suite for this change's actual
  surface (packaging, not logic).
- Exit codes checked for every gate throughout (never grepped output
  for pass/fail).
- `proxy/` submodule untouched; irrelevant to both build contexts
  (neither Dockerfile's build context includes `proxy/`, confirmed
  by `docker-compose.yml`'s `context: ./backend` / `./frontend`), and
  its emptiness in this worktree didn't block anything.
- No background processes left running at finish; final `docker ps
  -a` shows only the pre-existing unrelated containers.

## Evidentiary status summary

All claims above are WITNESSED with captured command output except:
- The `bcrypt`/`python-multipart` gap: WITNESSED as a real repo bug
  (confirmed via the running dev venv's `pip freeze` vs.
  `requirements.txt` diff), not merely inferred.
- Nothing in this delivery is UNEXERCISED or REFUSED-AS-EXPECTED —
  every gate in the task's "witness the whole path" list was run to
  completion.

## Note on ledger process

This worktree's `.claude/` directory (governance/ledger tooling) is
present but this session did not run `./autoharn led` ceremony
commands — the dispatch prompt did not include ledger credentials/
actor setup for this worktree, and the task was scoped as a builder
dispatch reporting back to an orchestrator rather than a standalone
governed session. Flagging this explicitly rather than silently
omitting it, per the "no umbrella claims" convention — the
CLAUDE.md ledger discipline (commission row, work-item decomposition,
etc.) was not exercised in this session.
