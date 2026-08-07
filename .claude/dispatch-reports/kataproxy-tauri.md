# kataproxy-tauri — KataProxy as a second Tauri sidecar (ledger rows 820/822)

Branch: `worktree-agent-affe8f052e1697cff`
Commit: recorded at the end of this report (see §8).

Worktree provenance disclosure: this session's worktree started 189
commits behind `next` (`3378806f` vs `next`'s `8d8ed48f`), clean working
tree, zero commits ahead — fast-forwarded via `git merge --ff-only next`
before any code was read, per the standing instruction to disclose this.

This report assumes the reader has already read
`.claude/dispatch-reports/wf11-tauri-build.md` (the backend-sidecar
precedent this work mirrors structurally) — it is not re-explained here.

---

## 1. Commission recap

Package KataProxy (the `proxy/` submodule's repository, at its
`fable-branch` branch — **not** the umbrella's local `proxy/` submodule
checkout, which is reference-only and was never modified) as a second
Tauri desktop sidecar, alongside the existing frozen backend sidecar.
Required defaults: 8192-entry analysis replay cache, transposition
detector enabled. The upstream analysis engine stays external and
user-configured (same docker+CUDA rationale as the rest of the desktop
package: the engine is machine-specific, and KataProxy is designed to
chain to it, or to another proxy, arbitrarily). Scope is packaging only
— a sibling item covers the setup-instruction/onboarding surface.

## 2. Packaging decision (load-bearing, with rejected alternatives)

**Chosen: a second PyInstaller onefile freeze**, mirroring the backend
sidecar's shape exactly (`frontend/src-tauri/packaging/lengyue-proxy.spec`,
`frontend/src-tauri/scripts/build-proxy-sidecar.sh`), built from a
scratch `git clone --branch fable-branch` of
`https://github.com/KodBena/KataProxy.git` — never this repo's `proxy/`
submodule checkout, which the umbrella `CLAUDE.md` documents as having
its own independent release cadence that the umbrella does not own.

**Rejected: shipping a venv alongside the sidecar (no freeze).**
Rejected because it reintroduces exactly the dependency this whole
desktop-packaging effort exists to remove — a system Python the end
user must have, matching versions, with network access to `pip install`
at first run. The backend sidecar already established the freeze
pattern as the project's answer to this; a second, differently-shaped
answer for the proxy would be an unjustified inconsistency for a
commission that explicitly named the backend sidecar as "your worked
precedent."

**Rejected: requiring a system Python for the proxy specifically (even
if the backend stays frozen).** Same rejection as above, narrower:
there is no property of KataProxy (its dependency set — asteval, numpy,
scipy, websockets, sgfmill, sortedcontainers — is no heavier than the
backend's SQLAlchemy/Alembic/FastAPI stack) that would make freezing it
harder or less appropriate than freezing the backend. The one added
wrinkle — the compiled `goboard_transposition` native extension — is
handled at freeze time (§3), not a reason to abandon freezing.

**Chosen: build+install `goboard_transposition` into the SAME freeze
venv, before running PyInstaller**, so `go_transposition` is
importable at analysis time and PyInstaller's binary-dependency
discovery picks it up automatically (verified — see §5). This directly
delivers "transposition detector ENABLED" as a *packaging* fact rather
than a runtime config flag: `transformers/transposition_enricher.py`
has no enable/disable knob of its own — it engages automatically
(legacy capability-gate auto-engage) whenever the native module is
importable. Bundling it IS enabling it; there is nothing else to wire.

**Rejected: leaving `go_transposition` unbundled, relying on the
"proxy runs normally without it" fallback.** This is KataProxy's
documented degrade-gracefully behavior (README: "the proxy runs
normally without enrichment and logs one warning at startup") — the
correct behavior for an operator who doesn't want the feature, but the
wrong default for THIS commission, which names transposition-enabled
as a *required* default, not an operator opt-in.

**Chosen: `PROXY_ROLE=RELAY`** for the bundled sidecar, forwarding to
a single user-provided upstream URL (`UPSTREAM_URLS`, a one-element
list — RELAY's hash-ring and least-loaded-fallback logic degrade
correctly to a trivial single-node case; confirmed by reading
`router.py`'s `RelayRouter`, not just inferred). **Rejected: LEAF role**
(would require the desktop machine to have a local KataGo binary/model/
config staged, which is exactly what the commission's docker+CUDA
rationale says is out of scope for a general-purpose desktop package).
**Rejected: REDIRECT role** (tells the client to reconnect elsewhere
and performs no analysis itself — would defeat the purpose of bundling
the proxy's own middleware, the cache and transposition enrichment,
which sit in Layer 2/the transformer chain and apply regardless of
router role, confirmed by reading `proxy_server.py`'s `ProxyServer.__init__`
and the `_main()` wiring — but REDIRECT never gets there since it uses
`RedirectSession`, not `ClientSession`).

## 3. Config surface — exact names, exactly where found

All from `proxy/sproxy_config.py` (read in full) in the umbrella's local
checkout (reference-only, per the commission — never modified):

| Setting | Env var | Hard default | Line |
|---|---|---|---|
| Replay-cache bound | `PROXY_HUB_CACHE_MAX` | `1024` | `sproxy_config.py:141` |
| Capability advertisement | `PROXY_ADVERTISE_CAPABILITIES` | `false` | `sproxy_config.py:283-286` |
| Role | `PROXY_ROLE` | `LEAF` | `sproxy_config.py:80` |
| Upstream pool (RELAY/REDIRECT) | `UPSTREAM_URLS` (comma-separated) | `[]` | `sproxy_config.py:82-86` |
| Bind host/port | `PROXY_HOST` / `PROXY_PORT` | `127.0.0.1` / `41949` | `sproxy_config.py:73-74` |

**There is no `PROXY_TRANSPOSITION_ENABLED`-shaped knob** (the task
brief's "transposition wiring near line 266" pointed at the capability-
advertisement section, which is adjacent but is a *different*
mechanism — advertisement tells capability-aware clients what's
available; it does not gate whether the transformer engages).
Confirmed by reading `transformers/transposition_enricher.py` in full
and `transformers/capability_gate.py` in full: the transposition
transformer is wrapped in `capability_gate("transposition", ...)`,
whose `on_query` auto-engages (WITNESSED default, not assumed) whenever
the query has no `capabilities` field — which is every query the SPA
sends today, since the SPA doesn't send a `capabilities` opt-in. The
*only* lever that exists is "is `go_transposition` importable at proxy
startup" (`transposition_enricher.py:50-61`), which is a packaging-time
fact, not a config value. This is the correct place to have looked —
recorded as a load-bearing finding since the charter pointed at a
config file for something that turned out to live in an import guard.

## 4. Config surface — how the proxy is configured at launch (mechanism decision)

**Chosen: environment variables set by the Rust `setup` hook at spawn
time**, identical mechanism to the backend sidecar
(`DATABASE_URI`/`SECRET_KEY_FILE`/`HOST`/`PORT` there;
`PROXY_ROLE`/`PROXY_HOST`/`PROXY_PORT`/`UPSTREAM_URLS`/
`PROXY_HUB_CACHE_MAX`/`PROXY_ADVERTISE_CAPABILITIES` here). Studied
`sproxy_config.py`'s `_load_dotenv()` (a `.env`-file loader) as the
alternative and rejected it: it reads relative to the process's CWD
(`Path(".env")`), which a Tauri-spawned sidecar has no clean way to
control/predict the way it controls env vars via
`tauri_plugin_shell::Command::env()`; env vars are also what the
backend sidecar already uses, so this keeps both sidecars' spawn code
in `src/lib.rs` structurally parallel (same `.sidecar(...).env(...).spawn()`
shape) rather than introducing a second config mechanism for no
functional gain.

**The upstream engine URL specifically** (`UPSTREAM_URLS`) is the one
value that is genuinely user-provided per the commission (the
docker+CUDA rationale). Studied where the SPA already resolves a
user-facing "engine URI" (`settings.engine.katago.url`,
`frontend/src/composables/useEngineUriEditor.ts`,
`frontend/src/services/analysis-service.ts`) and confirmed the
backend-sidecar port-injection mechanism cannot be reused to feed THAT
setting into the Rust spawn code, because of an ordering constraint
`src/lib.rs`'s existing structure already makes explicit: the sidecars
are spawned inside `setup()`, which runs before any `WebviewWindow`
exists — there is no IPC round-trip available yet to ask the SPA (or
its backing SQLite store) what the user configured. Reading the
backend's SQLite database directly from Rust was considered and
rejected: it would couple the desktop shell to the backend's schema
for a single string, a heavier and more fragile dependency than the
problem warrants.

**Chosen: a separate OS environment variable, `LENGYUE_PROXY_UPSTREAM`**,
read by Rust (`std::env::var`, NOT a Vite `VITE_*`/`.env` variable —
those are frontend-bundle-time only and Rust never reads them),
defaulting to `ws://127.0.0.1:41948` when unset — the same zero-config
default LengYue has always shipped (`VITE_KATAGO_WS_URL`'s existing
fallback), so a user already running a local engine sees no behavior
change from upgrading to a build that bundles the proxy. This is named
in the task brief as the honest-minimum question, and env var is that
minimum: no new IPC surface, no Rust↔SQLite coupling, a documented
override path (README §"Desktop app (Tauri v2)"), and an explicit
placeholder for the richer "reconfigure from an in-app setting and
restart the sidecar" UX that the sibling setup-instructions item, or a
follow-up, can build on top of this without touching the freeze or the
spawn mechanism.

**The SPA's own engine-URI setting is redirected, not rewritten.** Per
the commission: "The SPA's engine URI setting should end up pointing at
the LOCAL proxy by default in the Tauri build." Mirrored the EXACT
mechanism `API_BASE_URL` already uses for the backend port
(`window.__LENGYUE_BACKEND_PORT__`, injected via
`WebviewWindowBuilder::initialization_script`, read by
`config/env.ts` before any other frontend script runs): added
`window.__LENGYUE_PROXY_PORT__` the same way, and changed
`KATAGO_WS_URL`'s Tauri branch to prefer it. `settings.engine.katago.url`
itself is untouched — an unconfigured (empty) profile now falls through
to `KATAGO_WS_URL`, which now resolves to the local proxy under Tauri;
a user who explicitly sets `settings.engine.katago.url` still overrides
it, unchanged behavior.

## 5. What was built — file inventory

```
frontend/src-tauri/
  packaging/lengyue-proxy.spec       — NEW. PyInstaller spec; freezes a
                                        PROXY_SRC_DIR-pointed scratch
                                        clone (not SPEC-relative, unlike
                                        the backend spec — see its header
                                        comment for why).
  scripts/build-proxy-sidecar.sh     — NEW. Scratch-clones fable-branch,
                                        builds+installs go_transposition
                                        into a dedicated venv
                                        (.venv-pyinstaller-proxy, kept
                                        separate from the backend's venv),
                                        runs the spec, stages the output
                                        as binaries/lengyue-proxy-<triple>.
  tauri.conf.json                    — externalBin: added
                                        "binaries/lengyue-proxy".
  capabilities/default.json          — added a second shell:allow-execute
                                        entry scoped to
                                        "binaries/lengyue-proxy" (sidecar
                                        true) — same narrow-scope shape
                                        as the backend's entry, not a
                                        general shell-execute grant.
  src/lib.rs                         — added: ProxySidecarHandle managed
                                        state; wait_for_tcp_accept()
                                        (readiness poll — see §6); the
                                        proxy spawn block in setup()
                                        (env wiring, §4); the second
                                        __LENGYUE_PROXY_PORT__
                                        initialization-script global;
                                        the second kill in the
                                        RunEvent::Exit handler.
  .gitignore                         — comment updated to describe both
                                        sidecar binaries (pattern
                                        unchanged — /binaries/* already
                                        covers the new file).

frontend/
  src/config/env.ts                  — KATAGO_WS_URL now prefers
                                        window.__LENGYUE_PROXY_PORT__
                                        when present, mirroring
                                        API_BASE_URL's existing pattern.
  package.json                       — + "proxy-sidecar:build" script.
  README.md                          — "Desktop app (Tauri v2)" section
                                        extended: build step, RELAY role
                                        + LENGYUE_PROXY_UPSTREAM,
                                        required defaults, SPA-default
                                        redirection.
```

No `frontend/FILES.md` entry needed — `env.ts` is a pre-existing file
(entry unchanged in location/purpose), and `src-tauri/`,
`backend/packaging/`-style trees are outside `frontend/src/`'s FILES.md
scope, same posture the wf11 report recorded for the backend sidecar.

## 6. Witness — per-claim evidentiary status

All commands memory-capped (`nice -n 19` + `systemd-run --user --scope
-p MemoryMax=…`); no live ports (4173/5173/5174/8764/19080/19081)
touched; scratch ports 19101/19102 (≥ 19100 per the charter); no `proxy/`
submodule checkout read for the freeze — a fresh `git clone --branch
fable-branch --single-branch` each time, deleted after the freeze
(`trap cleanup EXIT`).

| Claim | Status |
|---|---|
| PyInstaller freeze of KataProxy (fable-branch) succeeds | **WITNESSED** — `build-proxy-sidecar.sh` run to completion, exit 0. Cloned `580eb9be2ac10daf2ef7eb426b3e183dc5971736` @ `fable-branch`. Output: `frontend/src-tauri/binaries/lengyue-proxy-x86_64-unknown-linux-gnu`, 55,018,008 bytes, `file(1)`: "ELF 64-bit LSB executable ... dynamically linked ... stripped". |
| `go_transposition` native extension builds and is bundled | **WITNESSED** — `pip install "$CLONE_DIR/goboard_transposition"` (PEP 517 / meson-python) succeeded in the freeze venv; `python3 -c "import go_transposition"` printed the installed `.so` path before the freeze ran. PyInstaller's own log shows no "module not found" warning for it, and the frozen binary's own startup log (next row) confirms it loaded inside the frozen process, not just the build venv. |
| Transposition detector reports ENABLED at runtime | **WITNESSED** — ran the frozen binary standalone (`PROXY_ROLE=ECHO`, scratch port 19101, `PROXY_ADVERTISE_CAPABILITIES=true`) and captured its startup log verbatim: `msg="advertising capabilities: ['adaptive_reevaluate', 'cache', 'delta_analysis', 'transposition'] (PROXY_ADVERTISE_CAPABILITIES enabled)"`. `"transposition"` is added to the advertised set (`proxy_server.py`'s `_build_advertised_capabilities()`) ONLY if `import go_transposition` succeeds inside the frozen process at startup — this is the authoritative, code-level proof (not a wire round-trip guess). No "go_transposition native module not found" warning appeared anywhere in the log. |
| Replay-cache bound is 8192 | **WITNESSED, composite (no single runtime surface echoes the resolved value — documented, not a gap in this session's work)**. Three parts: (1) confirmed the hard default with no env var set is `1024` (`sproxy_config.HUB_CACHE_MAX` read directly, `PYTHONPATH`-imported from a throwaway shallow clone of fable-branch, no env override); (2) confirmed `PROXY_HUB_CACHE_MAX=8192` resolves `sproxy_config.HUB_CACHE_MAX` to `8192` via the same mechanism; (3) confirmed `LRUCacheStore(maxsize=8192)` (the actual class the value feeds — `pubsub_hub.py`) enforces the bound functionally: inserted 8300 keys, final size was exactly 8192, the oldest key (`k0`) was evicted, the newest (`k8299`) was retained — genuine LRU behavior, not just an unenforced number. The frozen binary itself was then also run with `PROXY_HUB_CACHE_MAX=8192` set (both smoke tests below) and started/listened without error under that env var. KataProxy has no startup log line or wire surface that echoes the resolved cache bound back to an operator — flagging this honestly rather than claiming a runtime introspection that doesn't exist. |
| Frozen proxy accepts a WebSocket connection (ECHO-role smoke, scratch port 19101) | **WITNESSED** — `websockets.connect("ws://127.0.0.1:19101")` handshake succeeded; sent `{"id":"probe-1","action":"query_version"}`, received `{"id": "probe-1", "isDuringSearch": false, "turnNumber": 0, "moveInfos": [], "rootInfo": {"scoreLead": 0.0, "visits": 1}}` (ECHO's synthetic reply). Process then `systemctl --user stop`ped; `pgrep -af lengyue-proxy` confirmed empty (no orphan). |
| Frozen proxy starts under the ACTUAL production config shape (RELAY role, scratch port 19102) | **WITNESSED** — ran with `PROXY_ROLE=RELAY`, `UPSTREAM_URLS=ws://127.0.0.1:19199` (deliberately unreachable — RELAY does not require a live upstream at startup per README), `PROXY_HUB_CACHE_MAX=8192`, `PROXY_ADVERTISE_CAPABILITIES=true`. Log shows the expected fail-loud upstream-connect ERROR (`connect_failed: [Errno 111] Connect call failed`) followed by `"listening on ws://127.0.0.1:19102 role=RELAY ..."` — the process does NOT crash or refuse to bind on a dead upstream (matches README's documented RELAY/ECHO/REDIRECT-don't-need-KataGo posture). `websockets.connect("ws://127.0.0.1:19102")` handshake succeeded. Stopped cleanly, `pgrep` confirmed no orphan. **UNEXERCISED**: an end-to-end ANALYZE round-trip against a real upstream KataGo engine — no engine was available in this environment; the commission's engine-provisioning is explicitly the user's/sibling item's responsibility, not this session's. |
| `cargo check --manifest-path frontend/src-tauri/Cargo.toml` (memory-capped) | **WITNESSED, exit 0.** Required building the backend sidecar too (`npm run sidecar:build`, exit 0) — `tauri-build`'s build script validates every `externalBin` resource path exists at `cargo check` time, not only at `tauri build` time, so both declared external binaries had to exist on disk. `webkit2gtk-4.1` / `gtk+-3.0` / `libsoup-3.0` were all present in this environment (unlike wf11's session, which hit a `libsoup-3.0` blocker) — full dependency graph compiled, including `lengyue_lib` itself this time (wf11's `cargo check` never reached the crate; this session's did). |
| `npm run build` (`vue-tsc -b && vite build`), after touching `env.ts` | **WITNESSED, exit 0.** 1189 modules transformed, `dist/` produced. |
| `npm run test:run` (Vitest), after touching `env.ts` | **WITNESSED, exit 0.** 153 passed / 3 skipped test files, 1827 passed / 4 skipped tests. |
| `npx eslint .` | **WITNESSED, exit 1 — pre-existing, unrelated to this change.** Two `local/justification-adjacency` errors in `frontend/src/components/SettingsTab.vue:137` (an unjustified `as` cast), a file this session never touched (confirmed via `git status`/diff — not in the changed-file set). Recorded honestly rather than silently omitted; not fixed, as it is out of this commission's scope and predates this session's work. |
| Full `npm run tauri build` (real AppImage/deb, both sidecars) | **UNEXERCISED** — per the charter, optional; long-running. `cargo check` + both sidecars' standalone smoke tests are the acceptance floor and are met. |

## 7. Orphan-on-SIGKILL parity (explicitly checked, not silently left worse)

The wf11 report flagged the backend sidecar's kill path as handling
every normal exit but not surviving a `SIGKILL` of the parent Tauri
process itself. The proxy sidecar's kill path
(`RunEvent::Exit` → `ProxySidecarHandle` → `child.kill()`) is
structurally identical — same handler, same `RunEvent::Exit` firing
point, same absence of process-group/`PR_SET_PDEATHSIG` hardening.
Adding two sidecars to the same known limitation does not make the
limitation qualitatively worse (the failure mode and its trigger are
unchanged — an OOM-kill or `kill -9` of the parent), but it does mean
TWO orphans are possible instead of one under that scenario; documented
plainly in `src/lib.rs`'s `.run()` comment rather than left implicit.

## 8. Commit

Changed files: `frontend/README.md`, `frontend/package.json`,
`frontend/src-tauri/.gitignore`, `frontend/src-tauri/capabilities/default.json`,
`frontend/src-tauri/src/lib.rs`, `frontend/src-tauri/tauri.conf.json`,
`frontend/src/config/env.ts`. New files:
`frontend/src-tauri/packaging/lengyue-proxy.spec`,
`frontend/src-tauri/scripts/build-proxy-sidecar.sh`. This report.

Frozen binaries (`frontend/src-tauri/binaries/lengyue-proxy-*`,
`lengyue-backend-*`) and both PyInstaller venvs
(`backend/.venv-pyinstaller/`, `backend/.venv-pyinstaller-proxy/`) are
build artifacts, gitignored, not committed — same posture as the
backend sidecar's existing artifacts.

Commit sha: see `git log --oneline -1` on this branch after the commit
that carries this report (not hardcoded here per the wf11 report's own
stated reasoning — a hardcoded sha in this file would go stale on any
follow-up commit).

## 9. Coordinator scope-reduction addendum (acknowledged, not triggered)

Mid-session, the coordinator sent a standing-rule addendum: any
scope reduction is void without explicit authorization, and a
harder-than-expected path should surface as a neutral cost report,
never a quietly-narrowed delivery. Nothing in this work required
narrowing the commission — every required default (8192-entry cache,
transposition enabled) shipped as specified, the freeze pattern
requested was used, and every acceptance-floor witness in the charter
(frozen-sidecar standalone run, `cargo check`) passed. The two
UNEXERCISED items (a live-engine ANALYZE round-trip; the full `tauri
build`) were both named as optional/out-of-session-scope by the
charter itself, not narrowed by this session — recorded as such, per
the addendum's own carve-out for charter-sanctioned bounds.
