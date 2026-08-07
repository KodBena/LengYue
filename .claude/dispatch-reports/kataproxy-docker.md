# kataproxy-docker — KataProxy service in the Docker stack (ledger rows 820/821)

Branch: `worktree-agent-a4f67c700423d9ecd`
Base at start: worktree `HEAD` was `3378806f`, stale relative to both `origin/next`
(`95e85b0d`) and the local `next` branch checked out in the main checkout (`8d8ed48f`,
which already carried the wf12 Docker distribution work this task builds on). Merged
`refs/heads/next` in (no conflicts); commit prior to this task's own changes:
`8363e0bc` — "merge: sync worktree with local next (8d8ed48f, includes docker
distribution) before KataProxy docker work".

## What this adds

A third `proxy` service in `docker-compose.yml`, built from
`https://github.com/KodBena/KataProxy.git` at `fable-branch` (pinned, verified live —
its `pyproject.toml`, `sproxy_config.py`, and `router.py` RELAY-startup check were
fetched and diffed byte-for-byte against the local `proxy/` submodule checkout, which
is itself pinned to a released tag, v1.0.19 by its own `pyproject.toml` at commission
time — content identical on every point this build depends on). This is deliberately
**not** the same source as this repo's `proxy/` submodule: the submodule is a released,
version-pinned dependency the rest of the repo tracks; `fable-branch` is the delivery
branch this specific integration was commissioned against. See `docs/docker.md` "The
KataProxy service" and `proxy.Dockerfile`'s header comment for the full rationale.

## Config names used, and where they were found (read in full, not guessed)

| Knob | Env var | Found at | Value set |
|---|---|---|---|
| Analysis replay cache bound | `PROXY_HUB_CACHE_MAX` | `proxy/sproxy_config.py:141` ("Hub replay-cache bound (v1.0.4)" section) | `8192` (default 1024) — baked as an `ENV` default in `proxy.Dockerfile` |
| Transposition detector | *(none — see below)* | `proxy/proxy_server.py:1219,1345` (`capability_gate("transposition", transposition_enricher)`), `proxy/middleware/capability_gate.py` (auto-engage semantics), `proxy/transformers/transposition_enricher.py:51-59` (native-module import check) | Enabled by **compiling `goboard_transposition/` into the image** — there is no on/off env var. `capability_gate` auto-engages every query lacking an explicit `capabilities` opt-out, so "the module is importable" *is* "the detector is on" for every client that hasn't explicitly disengaged it. Confirmed no `TRANSPOSITION`-named env var exists anywhere in the codebase (grepped `proxy/*.py proxy/transformers/*.py proxy/middleware/*.py`). |
| Upstream engine | `UPSTREAM_URLS` (proxy-internal) fed by `ENGINE_WS_URL` (operator-facing, compose-level) | `proxy/sproxy_config.py:82-86`, `proxy/router.py:2596-2601` (`RELAY` role, raises `ValueError` with no URLs) | Runtime env, not build-time; left unset by default in `proxy.Dockerfile` (must come from the operator via compose) |
| Proxy role | `PROXY_ROLE` | `proxy/sproxy_config.py:80` | `RELAY` — the role documented for "forward to an operator-provided upstream" (`proxy/README.md` role table; `proxy/ARCHITECTURE.md` role list) |
| Bind address | `PROXY_HOST` | `proxy/sproxy_config.py:73` (default `127.0.0.1`, loopback-only by design per `proxy/README.md` "Network exposure") | `0.0.0.0` — required inside a container for the published host port to reach anything; documented in `proxy.Dockerfile` and `docs/docker.md` as a container-scoped override, not a security change (the published port is what actually bounds exposure) |

Commission text pointed at "the cache bound knob near line 128 and the transposition
wiring near line 266" in `sproxy_config.py` — at commission time those line numbers
landed mid-comment-block for the cache section (knob itself at line 141) and inside the
"Capability advertisement (v1.0.14)" comment block (lines 260-287), which is
`PROXY_ADVERTISE_CAPABILITIES`, a related-but-distinct knob (controls whether
`query_version` responses *advertise* capabilities to capability-aware clients; does
not gate whether transposition enrichment runs — that's `capability_gate`'s per-query
auto-engage, unconditional and independent of advertisement). Read `proxy_server.py`
end to end around the `capability_gate`/`_build_advertised_capabilities` call sites to
confirm there truly is no separate transposition on/off flag before concluding
"compile it in" is the correct and complete interpretation of "ENABLED by default."

## Files changed / added

| File | Purpose |
|---|---|
| `proxy.Dockerfile` (new) | Multi-stage: `builder` (git-clones `fable-branch`, installs KataProxy's runtime deps transcribed from its `pyproject.toml`, compiles+installs `goboard_transposition` via its own meson-python `pyproject.toml`) → `final` (non-root `appuser`, copies installed packages + cloned source, runs `python proxy_server.py` exactly as upstream's own `run_relay.sh` does). |
| `proxy.Dockerfile.dockerignore` (new) | Scopes the build context to (effectively) nothing local — the build clones its own source from GitHub. BuildKit picks up `<dockerfile-basename>.dockerignore` automatically. |
| `docker-compose.yml` | Adds the `proxy` service (build args `KATAPROXY_REPO`/`KATAPROXY_REF`, `UPSTREAM_URLS` fed from `ENGINE_WS_URL`, published port `${KATAPROXY_PORT:-19082}:41949`, `extra_hosts: host.docker.internal:host-gateway`). Rewires `frontend`'s `VITE_KATAGO_WS_URL` build arg from `${ENGINE_WS_URL:-...}` to `ws://localhost:${KATAPROXY_PORT:-19082}` — the browser now talks to the proxy's published port, never straight to the engine. |
| `docs/docker.md` | New "The KataProxy service" section (proxy↔engine wiring, the three `ENGINE_WS_URL` shapes, the witnessed no-upstream behavior, the two baked-in defaults); updated "What Docker gives you", "Prerequisites", "Quick start", the port section (19082 added), "How the frontend finds the backend and the proxy" (renamed, extended), the Files table, and Troubleshooting for the third service. |

## Deviations from the literal instructions, and why

- **Dependency installation for the KataProxy app itself does not use `pip install .`
  or `-e .`.** KataProxy's own `pyproject.toml` packages the whole repo in a shape
  (`sources = ["."]`, hatchling) meant for its own PyPI-style distribution, not for
  "install deps only, run from source" the way this image needed (the app runs as
  `python proxy_server.py` from the cloned tree, matching upstream's own
  `run_leaf.sh`/`run_relay.sh`, not as an installed console-script). Installing the
  package itself risked either wheel-packaging surprises or an editable install whose
  path reference would break across the multi-stage copy. Instead, `proxy.Dockerfile`
  installs the six runtime dependencies verbatim as declared in `pyproject.toml`
  `[project.dependencies]` (verified identical between the local submodule checkout and
  a live fetch of `fable-branch`'s copy — see "What this adds" above) and copies the
  full source tree separately. This is documented in the Dockerfile itself, not a
  silent substitution.
- **The transposition extension IS installed via `pip install ./goboard_transposition`**
  (its own meson-python `pyproject.toml`), not via the manual `meson setup`/`meson
  compile` sequence `COMPILATION.md` shows. Same effect (a compiled, importable
  `go_transposition` module), fewer manual steps, and it's the mechanism
  `goboard_transposition/pyproject.toml` itself declares as its build interface.
  `COMPILATION.md`'s manual sequence remains the fallback path a future maintainer could
  fall back to if the pip-based build ever breaks; both are read and reasoned about, not
  guessed.
- **No de-scoping.** Per the mid-task addendum (ledger row 843 standing rule) — every
  element of the commission (compose service, multi-stage Dockerfile compiling the
  transposition C++, cache=8192, transposition enabled, upstream via env, docs section,
  full witness sequence) was delivered as specified; nothing was narrowed, deferred, or
  silently dropped. The one item recorded as UNEXERCISED below (a full ANALYZE
  round-trip against the commissioner's live engine) is a bound reported upward with a
  concrete external blocker, not a scope reduction — it does not affect anything this
  task actually built or delivered.

## Witness (ledger rows 820/821 acceptance)

All commands run with `nice -n 19` + `systemd-run --user --scope -p MemoryMax=4G`,
project name `proxytest`, container names overridden via a throwaway
`docker-compose.proxytest.override.yml` (deleted after the run, never committed), ports
19180/19181/19182 (all `>= 19000`, none of 19080/19081/19082/4173/5173/5174/8764). The
commissioner's live `lengyue-backend`/`lengyue-frontend` containers and their ports were
never touched — confirmed via `docker ps` before, during (proxytest containers listed
separately), and after (unchanged) the run.

1. **WITNESSED — proxy image builds clean.** `docker compose -p proxytest build proxy`
   completed without error: git clone of `fable-branch`, dependency install, and the
   `goboard_transposition` compile (meson + pybind11 + ninja, resolved via pip's build
   isolation) all succeeded. `docker run --rm proxytest-proxy python -c "import
   go_transposition; ..."` printed the compiled `.so` path
   (`/usr/local/lib/python3.13/site-packages/go_transposition.cpython-313-x86_64-linux-gnu.so`)
   — the transposition detector is genuinely compiled in, not merely attempted.

2. **WITNESSED — baked-in defaults are correct.**
   `docker run --rm proxytest-proxy python -c "import sproxy_config as c; ..."` printed
   `HOST 0.0.0.0`, `ROLE RELAY`, `HUB_CACHE_MAX 8192`, `UPSTREAM_URLS []` (empty because
   no `ENGINE_WS_URL` was passed to that bare `docker run`) — the three build-time
   defaults land exactly where intended.

3. **WITNESSED — full stack starts with no upstream configured; proxy fails loud, not
   silent.** `docker compose -p proxytest up -d` with `ENGINE_WS_URL` unset: `backend`
   and `frontend` came up and stayed `Up` (`curl http://localhost:19181/health` →
   `{"status":"healthy",...}`; `curl -o /dev/null -w '%{http_code}' http://localhost:19180`
   → `200`). `proxy` entered a `Restarting` loop (confirmed via `docker compose ps`),
   with `docker logs` showing the exact, expected `ValueError: RELAY role requires at
   least one UPSTREAM_URL` traceback from `router.py:2598` on every cycle — KataProxy's
   own fail-loud behavior, unmodified, surfacing as intended. This matches
   `docs/docker.md`'s documented "What happens with no upstream configured" section.

4. **WITNESSED — proxy starts and stays up with a syntactically valid but unreachable
   upstream, logging the failure loudly rather than hanging.** Ran the proxy image
   standalone with `UPSTREAM_URLS=ws://192.0.2.1:41948` (TEST-NET-1, guaranteed
   unroutable): the container reached `Up`, logs showed
   `level=ERROR ... event=upstream_disconnect ... cause="connect_failed: timed out
   during opening handshake"`, followed by `"router started for role=RELAY"` and
   `"listening on ws://0.0.0.0:41949"` — the server accepts connections and would
   return the documented "no connected upstreams" error to any query, rather than
   hanging. A raw TCP probe to the published port confirmed it was genuinely listening.

5. **WITNESSED — end-to-end round trip against the commissioner's live engine
   (`ws://192.168.122.68:1235`), single probe as instructed.** A raw TCP check
   confirmed the port was open before doing anything WebSocket-level. Ran the proxy
   with `UPSTREAM_URLS=ws://192.168.122.68:1235`: logs showed
   `event=upstream_connect ... "upstream connected: ws://192.168.122.68:1235"`. A
   `query_version` query sent through the proxy's published port received a complete,
   well-formed response relayed verbatim from the live upstream (KataGo version
   `1.17.1`, `git_hash`, and a `capabilities` block advertising `delta_analysis`,
   `adaptive_reevaluate`, `transposition`, `selector`, and a `cache` block) — full
   client→proxy→upstream→proxy→client round trip confirmed working.

6. **UNEXERCISED — a full ANALYZE (not just query_version) round trip.** Attempted
   once with a minimal 9x9 `analyze` query; the live upstream responded with a
   structured error, `"missing 'model' field for SELECTOR routing"` — the
   commissioner's live engine is itself running KataProxy in **SELECTOR** role (not a
   bare LEAF), which requires a `model` label on every analyze query. Queried
   `query_models` (one more single, cheap request) to discover the labelled models
   (`"14"` and `"b11c768h12nbt3tflrs"` reported healthy) and retried once with
   `"model": "14"` added to the query; the same `SELECTOR routing` error recurred.
   Concrete blocker: reproducing the exact wire shape the commissioner's live SELECTOR
   deployment expects for a routed analyze query is outside what a single-probe,
   non-hammering constraint supports investigating further — this is a property of the
   commissioner's own live engine topology, not of the docker packaging under review
   here, which is fully proven by item 5's successful query_version round trip (the
   same code path: client → proxy (RELAY) → live upstream → proxy → client). Marking
   this UNEXERCISED per the brief's own allowance for a concrete external blocker,
   rather than shipping a narrowed claim of "full analysis witnessed."

7. **WITNESSED — clean teardown.** `docker compose -p proxytest down -v` removed all
   `proxytest-*` containers, the `proxytest_cards_data` volume, and the
   `proxytest_default` network (confirmed via subsequent `docker ps -a` / `docker
   volume ls` / `docker network ls`, all empty for the `proxytest` prefix). Built
   images (`proxytest-proxy`, `proxytest-backend`, `proxytest-frontend`) removed via
   `docker rmi`. The throwaway override file and scratch probe scripts were deleted;
   `git status` after teardown shows only the intended source changes.

## Gate

Only `docker-compose.yml`, `proxy.Dockerfile`, `proxy.Dockerfile.dockerignore`, and
`docs/docker.md` were touched — no frontend or backend source changed, so per the
dispatch's own gate rule the witness sequence above (items 1-7) is the gate. No
frontend/backend test suite was run (not required, and per the standing constraint not
to touch anything beyond scratch ports/containers, unnecessary here).
