# Running via Docker

This page is written for a reader with **zero Docker context** — it
explains not just the commands but what they do and why, so you can
operate this deployment even if you've never used Docker before.

## Every port, in one table

Across every way this app runs, there is exactly **one** port a user
should ever need to think about: the KataGo WS shim's, if they move it
off its default. Everything else is fixed packaging plumbing.

| Deployment shape | Port(s) | Who needs to care |
|---|---|---|
| Plain dev — Vite dev server (`npm run dev`) | 5173 (or 5174 if 5173 is taken) | Nobody |
| Plain dev — Vite preview (`npm run preview`) | 4173 | Nobody |
| Plain dev — backend (`fastapi dev`) | 8764 | Nobody |
| Docker — frontend / backend / proxy (published) | 19080 / 19081 / 19082 | Nobody — fixed, collision-avoiding defaults; see "Why ports 19080/19081/19082" below |
| Tauri desktop — backend/proxy sidecars | OS-assigned, injected into the webview at start | Nobody — no port is ever typed |
| **KataGo WS shim / leaf** (`backend/scripts/katago_ws_shim.py`) | **1242** | **The user — only if they move it off the default** |

Run the shim with its defaults and every packaging above finds it with
no configuration. See "The KataProxy service" below for how Docker and
Tauri each reach it, and `backend/scripts/katago_ws_shim.py --help` for
the shim's own options.

## What Docker gives you here (and what it doesn't)

Docker packages the **backend** (FastAPI service), **frontend**
(Vue 3 SPA, served by nginx), and **proxy** (KataProxy, the analysis
middleware in front of the engine) as three isolated, reproducible
"containers" — think of a container as a lightweight, disposable
virtual machine that only contains what its image says it contains.
`docker compose` is a small orchestrator that builds all three images
and starts/stops them together as a unit.

**What is NOT containerized, deliberately:** KataGo itself — the
actual Go-analysis engine. GPU drivers, CUDA, and engine setup are
specific to your machine (and Docker+CUDA is enough of its own can of
worms that the KataProxy project doesn't attempt to paper over it
either — it "chains arbitrarily" onto whatever upstream you give it).
The containerized proxy connects out to an engine you provide, running
on your host or reachable over your network, exactly the way a
non-Docker install of KataProxy does. See "The KataProxy service"
below for what that means in practice, including what you'll observe
if you start the stack before you have an engine to point it at.

Everything else about running the app day-to-day — where cards.db
lives, how to back it up, how ports are chosen — is explained below.

## Prerequisites

- Docker Engine with the `docker compose` plugin (`docker compose
  version` should print something; this was built and verified
  against Docker 29.4 / Compose 5.3).
- The `proxy/` git submodule does **not** need to be checked out to
  build or run these images. Neither the backend nor frontend
  Dockerfile reads from `proxy/`, so an empty submodule directory is
  harmless here — and `proxy.Dockerfile` doesn't read from it either:
  it builds the proxy service from KataProxy's own GitHub repository
  at a pinned branch, independently of whatever this repo's `proxy/`
  submodule happens to be pinned to (see "The KataProxy service"
  below for why they can differ).
- A KataGo-speaking analysis engine reachable from wherever Docker
  runs — on your host, on another machine on your LAN, or behind a
  host-side WebSocket shim. You don't need this to bring the stack
  up (see "The KataProxy service"), but board analysis won't work
  without it.

## Quick start

```bash
docker compose up --build
```

First run builds all three images (several minutes — Python deps for
the backend, `npm ci` + `vite build` for the frontend, a `git clone`
of KataProxy plus a native-extension compile for the proxy) and
starts them. Subsequent runs skip the build unless source changed.

Open **http://localhost:19080** in a browser. That's the SPA. It
talks to the backend at **http://localhost:19081** and, for board
analysis, to the proxy at **ws://localhost:19082** (see "The
KataProxy service"). The proxy's upstream, `ENGINE_WS_URL`, defaults
to the KataGo WS shim's own default port (1242) on the Docker host —
run `backend/scripts/katago_ws_shim.py` with its defaults there and
board analysis works with no configuration. Until something is
listening at that address, board analysis fails loudly (see "What
happens with no upstream configured") — everything else works
regardless.

Stop everything with Ctrl-C, or from another shell:

```bash
docker compose down
```

`down` (no flag) stops and removes the containers but **keeps your
data** — see "Where your data lives" below. Nothing is lost between
`up` / `down` cycles.

## Why ports 19080 / 19081 / 19082, not the usual dev ports

If you've run this project without Docker, you may know the backend
as `:8764` and the frontend dev server as `:5173`. The Docker
compose file deliberately publishes **different** host ports
(19080 for the frontend, 19081 for the backend, 19082 for the proxy)
so `docker compose up` never collides with an already-running
non-Docker instance of this same app — or a non-Docker KataProxy
instance, which defaults to `:41949` — on your machine. Override
them if you like:

```bash
FRONTEND_PORT=8080 BACKEND_PORT=8081 KATAPROXY_PORT=8082 docker compose up --build
```

(If you change `BACKEND_PORT` or `KATAPROXY_PORT`, the frontend image
is rebuilt with those URLs baked in — see "How the frontend finds the
backend and the proxy" below for why a rebuild, not a restart, is
required.)

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

## The KataProxy service

Before this service existed, the browser opened its analysis
WebSocket straight to KataGo/KataProxy running bare-metal on your
host. Now that KataProxy is itself one of the three containers, the
wiring has one more hop, in exchange for the app being able to do
much more interesting analysis (replay caching, transposition
detection — see below) than talking to a bare LEAF ever could:

```
   browser  --ws://localhost:19082-->  proxy container  --UPSTREAM_URLS-->  your engine
  (host)                              (RELAY role)                        (host, LAN, or a shim)
```

**The browser talks to the proxy, never to the engine directly.**
The app's built-in default and Settings-UI override
(`settings.katago.url`) both still work exactly as before — they
just now point at the proxy's published port
(`ws://localhost:19082` by default) rather than the engine's. That
default is baked into the frontend image the same way
`VITE_API_BASE_URL` is — see "How the frontend finds the backend and
the proxy" below.

**The proxy talks to your engine**, configured by one environment
variable at the compose level:

```bash
ENGINE_WS_URL=ws://192.168.1.50:1242 docker compose up --build
```

This feeds `UPSTREAM_URLS` inside the proxy container (KataProxy's
own env var, `sproxy_config.py`) — `docker-compose.yml` wires the two
together so you only need to set the one name this doc uses. Unlike
the frontend's Vite vars, this is a **runtime** setting on the proxy
side — `docker compose restart proxy` picks up a changed
`ENGINE_WS_URL` without a rebuild. (You will still want to rebuild
the frontend if you also want the browser's *default* proxy target
to change, but that's about `KATAPROXY_PORT`, not `ENGINE_WS_URL` —
see below.)

**Left unset, `ENGINE_WS_URL` defaults to
`ws://host.docker.internal:1242`** — the KataGo WS shim's own default
port (`backend/scripts/katago_ws_shim.py`), reached on your host via
the same `host.docker.internal` mapping described below. Run the shim
with its defaults on the Docker host and this is a working,
zero-configuration stack. If nothing is listening there yet, see
"What happens with no upstream configured" below.

Two further shapes `ENGINE_WS_URL` can take when you're not using the
shim's default:

- **A different port on the same host as Docker**:
  `ws://host.docker.internal:<port>`. `docker-compose.yml` maps
  `host.docker.internal` to your host machine *inside* the proxy
  container (`extra_hosts: host.docker.internal:host-gateway`) for
  exactly this — plain `localhost`/`127.0.0.1` inside a container
  means "this container," not your host, so it would silently point
  the proxy at itself.
- **An engine on another machine on your LAN**: its real address,
  e.g. `ws://192.168.1.50:1242`. No `host.docker.internal` needed —
  ordinary network reachability from wherever Docker runs.

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
on it to self-heal. With the optional `zeroconf` package installed
(`pip install zeroconf`, not part of `backend/requirements.txt`) the
shim also advertises itself on the LAN as `_katago-ws._tcp.local.`
for autodiscovery — see `--help` for the details and the `--no-mdns`
opt-out.

### What happens with no upstream configured

The proxy image runs KataProxy in its **RELAY** role (forwards
queries to an upstream rather than spawning a local engine — the
right role for "the engine is provided by the operator," see
`proxy/ARCHITECTURE.md`'s role table). RELAY's own startup code
refuses to construct without at least one upstream URL
(`router.py`: `raise ValueError("RELAY role requires at least one
UPSTREAM_URL")`) — this is KataProxy's own ADR-0002-style fail-loud
behavior, not something this image adds. Because `ENGINE_WS_URL`
defaults to `ws://host.docker.internal:1242` (see above) rather than
empty, `UPSTREAM_URLS` is never actually empty in this stack's
default configuration — so this particular `ValueError` is not the
behavior you'll see leaving `ENGINE_WS_URL` unset today. It would
still fire if you explicitly set `ENGINE_WS_URL=` (empty) yourself.

**"Unset" now means "assumes the shim is at its default,"** not
"restart loop." What you'll actually observe with `ENGINE_WS_URL`
left unset and no KataGo WS shim running yet on the Docker host:
`docker compose up` brings up backend and frontend cleanly, and the
`proxy` container reaches `Up` and *stays* `Up` — it does not crash
or restart. `docker compose logs proxy` shows a connect failure
(`event=upstream_disconnect ... cause="connect_failed: ..."`) logged
loudly each time a client query needs the upstream, and the proxy
returns a "no connected upstreams" error to that query, rather than
hanging. Start `backend/scripts/katago_ws_shim.py` with its defaults
on the Docker host and the very next query succeeds with no restart
needed. This is the same code path KataProxy uses for any
syntactically-valid-but-unreachable upstream — see the kataproxy-docker
dispatch report (`.claude/dispatch-reports/kataproxy-docker.md`,
witness item 4) for the underlying evidence this section is built on.

### Replay cache and the transposition detector

Two defaults are baked into `proxy.Dockerfile`, not left to compose
overrides, because they're what makes the proxy worth having in the
stack at all:

- **`PROXY_HUB_CACHE_MAX=8192`** — an 8192-entry analysis replay
  cache (KataProxy's own default is 1024; see `sproxy_config.py`'s
  "Hub replay-cache bound" section).
- **The transposition detector, compiled in and enabled.** This is
  the `goboard_transposition` native extension
  (`proxy/goboard_transposition/`, see its `COMPILATION.md`) —
  `proxy.Dockerfile`'s builder stage compiles it unconditionally.
  There is no separate on/off env var for this: KataProxy's
  `capability_gate("transposition", ...)` auto-engages the detector
  for every query that doesn't explicitly opt out (see
  `proxy_server.py` / `middleware/capability_gate.py`), so building
  the extension *is* enabling it. Without the extension present,
  KataProxy still runs — it just silently skips the enrichment and
  logs one startup warning, per its own README.

Override the cache bound at runtime (`docker-compose.yml`'s
`environment:` block for the `proxy` service, or a
`docker-compose.override.yml`) with `PROXY_HUB_CACHE_MAX` if you
want a different bound; there's no equivalent override for the
transposition detector since enabling it is a build-time (compile
it in) rather than run-time decision.

## How the frontend finds the backend and the proxy

The frontend is a Vue single-page app; it doesn't read environment
variables at container start the way the backend and proxy do. Vite
(the frontend's build tool) **bakes** `VITE_API_BASE_URL` and
`VITE_KATAGO_WS_URL` into the compiled JavaScript at *build* time
(`frontend/src/config/env.ts` is the one file that reads them). That
means:

- Changing `BACKEND_PORT` or `KATAPROXY_PORT` requires a **rebuild**
  of the frontend image (`docker compose up --build` — Compose is
  smart enough to only rebuild what changed). `ENGINE_WS_URL`, by
  contrast, only affects the proxy container and needs no frontend
  rebuild — see "The KataProxy service" above.
- The compose file passes `BACKEND_PORT` and `KATAPROXY_PORT` as
  Docker **build args**, matching whatever host ports it's about to
  publish, so `VITE_API_BASE_URL` / `VITE_KATAGO_WS_URL` stay in sync
  with the actual published ports automatically, as long as you go
  through `docker compose up --build` rather than building the image
  by hand with different values.

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
| `proxy.Dockerfile` | Multi-stage build: clone KataProxy (`fable-branch`) and install its dependencies in a builder stage, compile the `goboard_transposition` native extension there too, copy only the installed packages + cloned source into a slim, non-root final stage. |
| `proxy.Dockerfile.dockerignore` | Keeps the build context to just this Dockerfile — the build clones its own source from GitHub and needs nothing else from this repo. |
| `docker-compose.yml` | Wires all three images together: named volume for backend data, port mapping, engine-host env vars, restart policy. |

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
- **Proxy container keeps restarting**: not the expected behavior for
  an unset `ENGINE_WS_URL` (that now defaults to
  `ws://host.docker.internal:1242` and the proxy stays up — see "What
  happens with no upstream configured" above). A genuine restart loop
  means `UPSTREAM_URLS` ended up truly empty — e.g. `ENGINE_WS_URL=`
  set explicitly to an empty string. `docker compose logs proxy` will
  show `RELAY role requires at least one UPSTREAM_URL` in that case.
  If the proxy is up but analysis fails, that's the "no upstream
  reachable yet" case instead — start the KataGo WS shim on the
  Docker host, or check `ENGINE_WS_URL`.
- **Board analysis fails even with `ENGINE_WS_URL` set**: confirm the
  URL is reachable *from inside the proxy container*, not just from
  your host — `docker compose exec proxy python -c "import
  sproxy_config as c; print(c.UPSTREAM_URLS)"` shows what the proxy
  actually parsed. A LAN engine that's reachable from your host but
  behind a firewall rule scoped to your host's own IP is a common
  gap.
- **"port is already allocated"**: something else on your machine
  (possibly a non-Docker instance of this same app, or a bare-metal
  KataProxy on `:41949`) is using 19080, 19081, or 19082. Set
  `FRONTEND_PORT` / `BACKEND_PORT` / `KATAPROXY_PORT` to something
  else.
- **"container name ... already in use"**: an older checkout of this
  repository pinned literal container names (`lengyue-backend` etc.),
  so its stopped containers block a fresh `docker compose up` from a
  second checkout. Current compose files let Compose derive
  project-scoped names, which cannot collide; remove the stale
  containers (`docker rm lengyue-backend lengyue-frontend
  lengyue-proxy`) once, and note that Compose may have left a
  half-created network/volume behind on the failed attempt
  (`docker compose down -v` in the failing checkout cleans it).
