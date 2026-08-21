# Port-coherence check (work item `port-coherence`, commissioner "unsure")

Read-only verification. Method: `grep -rn` sweep across the repo (excluding
`node_modules/`, `venv/`, `.git/`, `dist/`, `target/`, `Cargo.lock`,
`package-lock.json`) for the literal ports `1242, 41948, 41949, 19080-19082,
8764, 5173-5174, 4173` and for env-var names matching
`ENGINE|UPSTREAM|WS_URL|PROXY.*PORT`, scoped to: `docker-compose.yml`,
`proxy.Dockerfile`, `*.Dockerfile`, `frontend/src-tauri/**` (excl.
`target/`, `Cargo.lock`), `frontend/src/**` (config/services),
`backend/scripts/katago_ws_shim.py`, `docs/**`, plus `README.md` /
`frontend/README.md` / `.env.example` files as directly load-bearing setup
docs.

## Verdict: COHERENT, with one pre-existing, previously-flagged doc staleness

The one-port/one-env-name scheme holds across every live default and every
packaging path checked. One doc line contradicts the story — it is not new;
it was already surfaced and deliberately left open by a prior audit
(`.claude/dispatch-reports/port-coherence.md:112-120`), and this sweep
reconfirms it is still unresolved.

## Violations found

1. **`docs/handoff-current.md:294`** — VIOLATES. States: "a single LEAF on
   `127.0.0.1:41948` is sufficient — and is exactly what the frontend's
   default config expects (matching `proxy/run_leaf.sh`'s default)." This
   is stale: the frontend's default is now `ws://127.0.0.1:1242`
   (`frontend/src/config/env.ts:97`, `frontend/.env.example`,
   `frontend/README.md:107`, `docs/docker.md:20/85`), not `41948`. This
   document is explicitly a "living orientation document... Updated as the
   system evolves" (`docs/handoff-current.md:1-6`), not an archived
   snapshot, so the contradiction is live, not historical framing. A prior
   audit (`.claude/dispatch-reports/port-coherence.md:110-120`) already
   found and flagged this exact line, declining to fix it because doing so
   correctly requires reading `proxy/run_leaf.sh`'s actual default, which
   lives in the `proxy/` submodule (not checked out in that worktree,
   and — per this repo's own `CLAUDE.md` — a separately-scoped project).
   That constraint still applies here (read-only task, no submodule
   contact attempted). Net: a known, disclosed gap, not a silent one — but
   still an open contradiction in a currently-served doc.

No other violations found. Specifically checked and cleared:

- No second user-facing env name for the engine upstream. `ENGINE_WS_URL`
  is the only name used to mean "where the analysis engine/proxy-upstream
  is," identically in `docker-compose.yml:111`, `proxy.Dockerfile`'s
  comments, `frontend/src-tauri/src/proxy_settings.rs` (`ENGINE_WS_URL_ENV_VAR`,
  line 103), `frontend/src-tauri/src/lib.rs`'s module docs, `docs/docker.md`,
  and `frontend/README.md`.
- `LENGYUE_PROXY_UPSTREAM` (the retired earlier ad-hoc Tauri-side name) is
  absent from every live default/config path. It survives only in (a)
  archival `.claude/dispatch-reports/*.md` history (out of scope — a
  record of the migration, not live config) and (b) one explicit
  historical-retirement note in `frontend/src-tauri/src/proxy_settings.rs:17`
  ("NOT `LENGYUE_PROXY_UPSTREAM`, an earlier ad-hoc name this delivery
  retires").
- `41948` (the purged legacy leaf port) is absent from every live
  default/config path in the scoped files. It survives only in: archival
  dispatch reports (out of scope); `frontend/src-tauri/src/lib.rs:34` and
  `frontend/README.md:127`, both explicit historical-comparison sentences
  ("...rather than the historical `ws://127.0.0.1:41948`...") describing
  what changed, not a live default; and test fixtures using `41948` as an
  arbitrary well-formed example URL for pure-function validators/roundtrip
  tests (`frontend/tests/unit/lib/ws-url.test.ts`,
  `frontend/tests/integration/useEngineUriEditor.test.ts`,
  `frontend/tests/integration/migration-store-roundtrip.test.ts`) — none
  of these are defaults a fresh install/build resolves to.
- `41949` appears exactly once outside archival/proxy-submodule text:
  `proxy.Dockerfile:133`'s `EXPOSE 41949`, which is the proxy's own
  internal container bind port (KataProxy's own default `PROXY_PORT`),
  legitimately distinct from the published host port
  `${KATAPROXY_PORT:-19082}` that maps to it
  (`docker-compose.yml:113` — `"${KATAPROXY_PORT:-19082}:41949"`). This
  matches the ratified carve-out exactly ("41949 may legitimately appear
  as the proxy's INTERNAL container port").
- Docker publishes exactly `19080`/`19081`/`19082` for
  frontend/backend/proxy (`docker-compose.yml:45,75,113`;
  `docs/docker.md`'s port table, lines 14-20), overridable via
  `FRONTEND_PORT`/`BACKEND_PORT`/`KATAPROXY_PORT` — none of which are
  user-facing "endpoint" names in the ENGINE_WS_URL sense; they are
  packaging-plumbing port *numbers*, and `docs/docker.md:9-11` says so
  explicitly ("there is exactly one port a user should ever need to think
  about: the KataGo WS shim's").
- `1242` is the single converged default everywhere it appears as a
  fallback: `docker-compose.yml:111` (`ENGINE_WS_URL` default),
  `backend/scripts/katago_ws_shim.py:133` (`DEFAULT_PORT = 1242`),
  `frontend/src-tauri/src/proxy_settings.rs:95`
  (`DEFAULT_PROXY_UPSTREAM = "ws://127.0.0.1:1242"`),
  `frontend/src/config/env.ts:97` (`KATAGO_WS_URL` fallback), and
  `frontend/.env.example` / `frontend/README.md` / `docs/docker.md`
  documentation of the same number. No stray alternate default value
  found anywhere in the scoped files.
- `VITE_KATAGO_WS_URL` (a second, differently-named env var) is present
  (`docker-compose.yml:71`, `frontend/.env.example`,
  `frontend/src/config/env.ts:90-97`) but is **not a violation**: it is a
  logically distinct fact from `ENGINE_WS_URL` — it tells the *frontend*
  where to find the *local proxy* (build-time-baked, since a browser
  cannot read arbitrary OS env vars, only Vite's build-time-inlined
  `VITE_*` vars), whereas `ENGINE_WS_URL` tells the *proxy* where to find
  the *upstream engine*. `docs/docker.md:327-346` ("How the frontend
  finds the backend and the proxy") documents this distinction explicitly
  and consistently, including why a frontend rebuild (not just a
  restart) is required when `BACKEND_PORT`/`KATAPROXY_PORT` change but
  not when `ENGINE_WS_URL` changes. Under Tauri, the analogous frontend
  knob is superseded entirely by `window.__LENGYUE_PROXY_PORT__`
  (injected pre-script), and `ENGINE_WS_URL` remains the sole
  upstream-engine knob (`frontend/src-tauri/src/lib.rs`,
  `proxy_settings.rs`). Both docker and Tauri paths are internally
  consistent on this split; no contradiction found.
- `PROXY_PORT`, `PROXY_HOST`, `PROXY_HUB_CACHE_MAX`, `PROXY_ROLE`
  (`proxy.Dockerfile`) and `PROXY_PORT` set by
  `frontend/src-tauri/src/lib.rs:295` are internal proxy-process
  bootstrap knobs (bind address/port, cache size, role), not a second
  user-facing "which engine" endpoint name — distinct concern from
  `ENGINE_WS_URL`/`UPSTREAM_URLS`, and not flagged by the
  `PROXY.*PORT` sweep as a story violation since none of them purport to
  be the user-facing upstream-engine selector.
- `UPSTREAM_URLS` (KataProxy's own env var, set *from* `ENGINE_WS_URL` by
  `docker-compose.yml:111` and by `frontend/src-tauri/src/lib.rs:296`) is
  the proxy's internal wire format, always derived from the single
  `ENGINE_WS_URL` source — never set directly by a user through a second
  name in any scoped file.
- `docs/docker.md` tells the one-port story consistently end to end: the
  port table (lines 7-20) states it plainly, "Why ports 19080/19081/19082"
  (line 102) and "The KataProxy service" / troubleshooting sections all
  reference `ENGINE_WS_URL` and `1242` consistently, and the
  frontend-build-time-vs-proxy-runtime distinction (`VITE_KATAGO_WS_URL`
  vs `ENGINE_WS_URL`) is documented rather than left implicit.
- `frontend/.env.example` and `frontend/README.md` are consistent with
  `docs/docker.md` and `frontend/src/config/env.ts` on all of the above —
  same `1242` default, same `ENGINE_WS_URL` name, same `VITE_KATAGO_WS_URL`
  distinction.

## Conforming-summary counts

- Files/locations checked for port literals and env-var names: 
  `docker-compose.yml`, `proxy.Dockerfile`, `frontend/Dockerfile`,
  `backend/Dockerfile`, `frontend/src-tauri/src/proxy_settings.rs`,
  `frontend/src-tauri/src/lib.rs`, `frontend/src-tauri/src/mdns_discovery.rs`,
  `frontend/src-tauri/tauri.conf.json`, `frontend/src/config/env.ts`,
  `frontend/src/App.vue`, `frontend/src/composables/board/useEngineResponder.ts`,
  `frontend/src/composables/review/useKomiCalibration.ts`,
  `frontend/src/services/analysis-service.ts`,
  `backend/scripts/katago_ws_shim.py`, `docs/docker.md`,
  `docs/handoff-current.md`, `frontend/README.md`, `frontend/.env.example`,
  `README.md`.
- Total literal-port / env-var-name hits reviewed: ~130 (across the two
  greps run: a full-tree port-literal sweep, then scoped
  file/directory-targeted greps for both ports and env-var names).
- Conforming: all live defaults, all packaging paths (Docker, Tauri, plain
  SPA-dev), all doc sections except one.
- Violating: **1** (`docs/handoff-current.md:294`, doc contradiction,
  previously flagged, still open).
- Legitimate carve-outs matched exactly as specified in the ratified
  scheme: `41949` as the proxy's internal `EXPOSE`'d container port
  (`proxy.Dockerfile:133`) — 1 occurrence, correctly scoped.
- Historical-reference sentences (not defaults, correctly framed as past
  tense / "no longer"): 2 (`frontend/src-tauri/src/lib.rs:34`,
  `frontend/README.md:127`).
- Test-fixture uses of `41948` as an arbitrary well-formed example value
  (not defaults): 3 files, ~9 occurrences total.

## Scope note

This check did not contact the `proxy/` git submodule (not checked out;
out of scope per this repo's own `CLAUDE.md`, and the task specified
read-only verification with no live-service contact). The one violation
found references a fact (`proxy/run_leaf.sh`'s actual default) that a full
fix would need to read from that submodule — noted, not resolved, per the
prior audit's same disposition.
