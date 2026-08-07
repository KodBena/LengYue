# wf11-tauri-linux — Tauri v2 desktop distribution (Linux-first)

**Fallback location notice**: the task asked for this report at
`/home/bork/w/omega/.claude/dispatch-reports/wf11-tauri-build.md`, the
*shared* checkout's dispatch-reports directory. This agent runs
isolated in a git worktree
(`/home/bork/w/omega/.claude/worktrees/agent-a257595794d199e4f`) and its
write tooling refused a write outside that worktree ("Edit the worktree
copy of this file instead of the shared-checkout path"). This report
therefore lives at this worktree's own
`.claude/dispatch-reports/wf11-tauri-build.md` instead — the
orchestrator should copy/merge it to the shared path when merging this
branch.

Branch: `worktree-agent-a257595794d199e4f`
Commit: work is staged/uncommitted at time of writing this report; see
"Commit" section at the end for the actual sha once committed.
Ledger design: rows 690+699 (ratified).

This report is written for a reader who has never used Tauri. If you
already know Tauri, skip to "What was built" and the evidence tables.

---

## 1. Orientation — what is Tauri, what is a "sidecar"

**Tauri** is a framework for shipping a web frontend (here: the
existing Vue 3 SPA, unmodified in its business logic) as a native
desktop app. Unlike Electron, it does not bundle Chromium — it opens
the OS's own webview (on Linux: `webkit2gtk`, the same engine GNOME's
Epiphany browser uses) inside a small native window, and the app
logic that isn't "run the webview" is written in Rust. The Rust half
lives in `frontend/src-tauri/` — a small Cargo (Rust's package
manager) project that is *part of* the frontend sub-project, not a
new top-level sub-project.

A **sidecar** is Tauri's term for a second executable the desktop app
spawns and manages alongside itself — in our case, the FastAPI
backend, frozen into a single native executable (see §3) so end users
never need a Python install. The Rust shell:

1. picks a free local TCP port,
2. spawns the frozen backend with that port (and a per-user database
   path — §4) as environment variables,
3. polls the backend's `/health` endpoint until it answers,
4. tells the webview where the backend is (§5), and
5. kills the backend process when the app window closes.

This is what "self-contained v1" means concretely: a user downloads
one file (an AppImage or a `.deb`), runs it, and gets SPA + backend +
their own private data directory, with nothing else to install.

---

## 2. What was built — layout

```
frontend/src-tauri/
  Cargo.toml              — Rust crate manifest (tauri, tauri-plugin-shell, ureq)
  tauri.conf.json          — Tauri v2 app config (icons, bundle targets, sidecar declaration)
  build.rs                 — standard Tauri build-script hook (unmodified boilerplate)
  capabilities/default.json — permission grant: default core perms + scoped
                               shell-execute for exactly the declared sidecar binary
  icons/                   — app icon set, generated from frontend/public/textures/wood.jpg
  src/main.rs               — thin binary entrypoint
  src/lib.rs                — the actual logic: sidecar spawn/wait/kill (§5)
  scripts/build-sidecar.sh  — freezes backend/ via PyInstaller, stages the
                               binary into src-tauri/binaries/ under Tauri's
                               required target-triple-suffixed name
  binaries/                 — sidecar executable lands here (gitignored — a
                               build artifact, not source; a .gitkeep marks
                               the directory)
  .gitignore                — /target/ (Cargo build output), /gen/, /binaries/*

backend/
  packaging/lengyue-backend.spec — PyInstaller spec (see §3 for the pitfalls it closes)
  core/config.py            — + HOST/PORT settings (new)
  main.py                   — __main__ entrypoint now reads HOST/PORT, passes the
                               app object directly instead of an import string (§3)
  requirements.txt          — + bcrypt, python-multipart (see "Incidental fix" below)
  .gitignore                — + build/, dist/, .venv-pyinstaller/ (freeze artifacts)

frontend/
  package.json               — @tauri-apps/cli devDependency; sidecar:build /
                                tauri / tauri:dev / tauri:build scripts
  vite.config.ts              — Tauri-recommended dev-server tweaks (§6)
  src/config/env.ts           — API_BASE_URL reads the Tauri-injected port
                                override when present (§5)
  .env.example, README.md     — documentation
```

No new files were added under `frontend/src/` beyond the edit to the
existing `src/config/env.ts` (its `FILES.md` entry stays accurate, no
update needed). `src-tauri/` and `backend/packaging/` are new
directories outside `frontend/src/`'s scope, per the charter's "get a
report note, not a FILES.md entry" instruction — this report is that
note.

---

## 3. Backend as a sidecar — the freeze

**Tool**: PyInstaller, `backend/packaging/lengyue-backend.spec`,
run via `frontend/src-tauri/scripts/build-sidecar.sh` (creates a
throwaway venv at `backend/.venv-pyinstaller`, installs
`requirements.txt` + `pyinstaller`, freezes, copies the output to
`src-tauri/binaries/lengyue-backend-<target-triple>` — the exact
filename Tauri's `externalBin` sidecar mechanism requires).

**Two freeze pitfalls the charter named, and how they're closed:**

1. **SQLAlchemy / Alembic hidden imports.** PyInstaller's static
   bytecode analysis misses modules resolved by string/plugin lookup
   rather than a top-level `import` — the `sqlite+aiosqlite://` URL
   scheme resolves `aiosqlite` this way, and Alembic's `command`
   module dispatches into `alembic.runtime.*` similarly. The spec
   file's `hiddenimports` list names these explicitly (plus
   `email_validator`, `colorlog`, and the postgres/psycopg dialect
   for completeness — not currently used by config, but declared in
   `requirements.txt`).
2. **Alembic migration-script discovery inside the frozen bundle.**
   Alembic doesn't `import` its revision files — `ScriptDirectory`
   `exec`s their `.py` source directly off disk at runtime. No
   hidden-import list can fix that; the spec's `datas` entries bundle
   `alembic.ini` and the whole `alembic/` directory (env.py +
   `versions/*.py`) as **data files** at the same relative path
   `backend_root`-resolution (`db/alembic_bootstrap.py`'s
   `_alembic_config`, fed `Path(__file__).parent.resolve()` from
   `main.py`) expects.

**WITNESSED**: both pitfalls are closed, not just addressed in
theory. The freeze ran cleanly (79 MB onefile executable, ~76s
build), and a smoke test proved the frozen bundle actually applies
migrations at runtime — see the exact log below.

**Incidental fix, discovered while getting the freeze/test loop
green**: `backend/requirements.txt` was missing `bcrypt` (imported
directly by `core/security.py`) and `python-multipart` (required by
FastAPI's `OAuth2PasswordRequestForm`, used by the `/token` route).
Neither was ever exercised by a bare `pip install -r requirements.txt
&& pytest` before — both are third-party deps that happened to already
be present in whatever environment had last run the suite. This isn't
a Tauri-specific defect, but it's exactly the class of gap PyInstaller
freezing surfaces (a frozen binary would 500 on `/token` and crash on
any password check) and it blocked verifying the freeze pitfalls
above, so it's fixed in the same change: `bcrypt==5.0.0`,
`python-multipart==0.0.32` added to `requirements.txt`. **WITNESSED**:
the backend test suite failed to collect (`ModuleNotFoundError:
bcrypt`, then `RuntimeError: python-multipart`) before this fix, and
passed after — see §8.

### Smoke test (WITNESSED)

Ran the frozen executable standalone, isolated data dir, test port
19764 (`>= 19000` per standing rules):

```
$ DATABASE_URI="sqlite+aiosqlite:////<scratch>/cards.db" \
  SECRET_KEY_FILE=<scratch>/.jwt_secret HOST=127.0.0.1 PORT=19764 \
  ./dist/lengyue-backend

2026-08-07 21:11:06 INFO core.config: SECRET_KEY: generated new key and persisted to <scratch>/.jwt_secret
INFO:     Started server process [968800]
INFO:     Waiting for application startup.
2026-08-07 21:11:08 INFO __main__: Database initialized: sqlite+aiosqlite:////<scratch>/cards.db
2026-08-07 21:11:08 INFO db.alembic_bootstrap: probe matched marker game_source.created_at → revision 0002_sgf_library_columns
2026-08-07 21:11:08 INFO db.alembic_bootstrap: stamping alembic_version at revision 0002_sgf_library_columns
INFO  [alembic.runtime.migration] Running stamp_revision  -> 0002_sgf_library_columns
INFO  [alembic.runtime.migration] Running upgrade 0002_sgf_library_columns -> 0003_analysis_bundle_v2_columns, analysis_bundle_v2_columns
```

- `curl http://127.0.0.1:19764/health` → `200`, `{"status":"healthy",...}`
- `curl http://127.0.0.1:19764/openapi.json` → full OpenAPI document
- `<scratch>/cards.db` and `<scratch>/.jwt_secret` both created at the
  injected paths — confirms the DATABASE_URI/SECRET_KEY_FILE env-var
  override (§4) works end to end in the frozen binary, not just in
  source.
- Process killed via `systemctl --user stop` on its scope; confirmed
  no orphan (`pgrep -af lengyue-backend` → empty) — same shape the
  Rust sidecar's exit-time kill implements (§5).

This is the charter's "acceptable" bar (frozen-backend smoke test +
alembic witnessed) met in full, in addition to the full scaffold.

---

## 4. Per-user data — XDG, no bundled DB

**Before this work**: `core/config.py`'s `DATABASE_URI` defaulted to
`sqlite+aiosqlite:///./cards.db` — relative to the process's current
working directory. Fine for `fastapi dev` run from `backend/`; wrong
for a desktop app, which shouldn't write into wherever it happened to
be launched from (and on Linux, `AppImage`s are typically launched
from arbitrary directories or a file manager, so "cwd" is not even a
meaningful concept to a user).

**What was added**: nothing in `core/config.py` itself needed to
change here — `DATABASE_URI` and `SECRET_KEY_FILE` are already
`pydantic-settings` fields, which means they're already
environment-variable-overridable with zero backend code changes. The
Tauri shell (`src-tauri/src/lib.rs`, `setup` hook) does the actual
work:

1. Resolves Tauri's platform-appropriate app-data directory via
   `app.path().app_data_dir()` — on Linux this follows XDG
   (`$XDG_DATA_HOME/lengyue`, falling back to
   `~/.local/share/lengyue`; the directory name comes from
   `tauri.conf.json`'s `"identifier": "lengyue"`).
2. `mkdir -p`s it.
3. Sets `DATABASE_URI=sqlite+aiosqlite:///<data_dir>/cards.db` and
   `SECRET_KEY_FILE=<data_dir>/.jwt_secret` as env vars on the spawned
   sidecar process.

**Never the repo's DB, never bundled.** The PyInstaller spec's `datas`
list bundles `alembic.ini` and `alembic/` — nothing under
`backend/samples/` or any `.db` file. `backend/samples/cards.sample.db`
stays exactly where it is, in the repository, untouched by this work.

### Sample database — how a Tauri user imports it (user-facing doc text)

There is no in-app "load sample" button yet (out of scope for this
work item — it would be a new backend endpoint or a Tauri file-picker
flow). For v1, a user who wants the sample workspace and has a clone
of the repository can seed it manually **before first launching the
app**:

```sh
python backend/scripts/load_sample.py \
    --target ~/.local/share/lengyue/cards.db
```

(Adjust the target path if `$XDG_DATA_HOME` is set to something other
than `~/.local/share`.) This is `backend/scripts/load_sample.py`'s
existing `--target` override, unmodified — it copies
`backend/samples/cards.sample.db` to the given path, refusing to
overwrite an existing file unless `--force` is passed. This text (or
a variant of it) belongs in end-user-facing onboarding docs once those
exist; flagging here since none exist yet to add it to.

---

## 5. Sidecar lifecycle — spawn / ready / kill (the mechanism)

All in `frontend/src-tauri/src/lib.rs`, inside the `tauri::Builder`'s
`setup` hook (runs once, before any window is shown):

**Spawn.** `pick_free_port()` binds `TcpListener` on `127.0.0.1:0` (OS
assigns a free port), reads it back, drops the listener. This has a
documented, accepted TOCTOU race — another process could grab the
port before the sidecar binds it — standard for this idiom; the spec
calls it out as a bounded-retry follow-up if ever observed, not a
different mechanism. The sidecar is then spawned via
`tauri-plugin-shell`'s `sidecar("lengyue-backend")`, with
`DATABASE_URI` / `SECRET_KEY_FILE` / `HOST` / `PORT` set as env vars
(§4).

**Ready.** `wait_for_health(port)` polls `GET
http://127.0.0.1:{port}/health` with **bounded exponential backoff**
(50ms → doubling, capped at 800ms, 20s overall deadline) — no fixed
sleep. The `setup` hook blocks on this (via `spawn_blocking` +
`block_on`, since `ureq` is a synchronous HTTP client) before doing
anything else, so the window is never built until the backend is
actually answering.

**Wired to the SPA.** Once healthy, the main window is built
*programmatically* (not declared statically in `tauri.conf.json`'s
`app.windows`, which is intentionally empty) via
`WebviewWindowBuilder`, with
`.initialization_script("window.__LENGYUE_BACKEND_PORT__ = {port};")`.
Tauri guarantees initialization scripts run before *any* page script
on every navigation — including the very first evaluation of
`frontend/src/config/env.ts`'s module body. `env.ts`'s
`API_BASE_URL` now reads that global first, falling through to the
existing `VITE_API_BASE_URL` / localhost default when it's absent
(every non-Tauri context: `npm run dev`, `vite preview`, plain web
deploys). No Tauri IPC (`invoke`) round-trip needed for this, and no
`@tauri-apps/api` runtime dependency was added — this is why the
window is built in Rust after the port is known, rather than the
frontend asking for it after the page loads.

**Kill.** `.run(|app_handle, event| { if let RunEvent::Exit = event {
... child.kill() ... } })` — `RunEvent::Exit` fires once, after every
window has closed, which is the deliberate choice over a per-window
`CloseRequested` handler (that would fire once per window and race a
hypothetical future multi-window build). stdout/stderr from the
sidecar are also forwarded into the shell's own console output (`[backend]
...` prefixed) so a boot failure is visible without attaching a
debugger to the child — ADR-0002 fail-loudly applied to the sidecar
boundary.

**Orphan-process caveat (documented, not fixed — a known Tauri/OS
limitation, not unique to this app):** the kill path above handles
every normal exit (window closed, app quit). It does **not** protect
against the parent process itself being `SIGKILL`ed (e.g. `kill -9`,
an OOM-kill of the desktop shell) — in that case the child sidecar
would survive as an orphan, same as any parent/child process pair on
any platform. No process-group / `prctl(PR_SET_PDEATHSIG)`-style
hardening was added for v1; flagging it here as a known gap rather
than silently leaving it undocumented.

---

## 6. Frontend scaffold details

- **`vite.config.ts`**: added `clearScreen: false` (so Vite doesn't
  hide Tauri/Rust build output sharing the terminal),
  `server.strictPort` (true only under Tauri — fixed dev URL, not a
  scan-for-a-free-port target), and `server.watch.ignored` for
  `src-tauri/**` (its `target/` directory churns constantly and isn't
  frontend source). None of this changes non-Tauri dev/build/preview
  behavior — confirmed by the full `npm run build` / `npm run
  test:run` passes below.
- **`tauri.conf.json`**: `bundle.targets: ["appimage", "deb"]`
  (Linux-first, per charter). `app.windows: []` — no static window
  declaration, because the window is built programmatically once the
  sidecar port is known (§5). `security.csp: null` — CSP enforcement
  is disabled for v1 rather than hand-authoring a policy that allows
  `http://127.0.0.1:*` (the sidecar's dynamic origin) safely; flagged
  as a hardening item for a follow-up, not attempted here given the
  self-contained-v1 scope.
- **Icons**: no existing frontend asset was an obvious app-icon fit
  (`frontend/public/textures/` has only a wood-grain board texture and
  a small file-open glyph). Used the wood texture — thematically a Go
  board — resized via ImageMagick into the icon set Tauri's Linux
  bundle targets need (`32x32.png`, `128x128.png`, `128x128@2x.png`,
  plus a 1024×1024 `icon.png` master). **Not a design decision** —
  this is a placeholder; a real icon is a product-design task outside
  this charter's scope, flagged explicitly rather than silently
  shipped as "done."
- **`capabilities/default.json`**: grants Tauri's `core:default`
  permission set plus a narrowly-scoped `shell:allow-execute` that
  names exactly `binaries/lengyue-backend` with `"sidecar": true` —
  the app cannot execute arbitrary shell commands, only spawn the one
  declared sidecar binary.

---

## 7. Engine (proxy) URL — confirmed unchanged, no fix needed

Per the charter's item 4: the KataGo analysis engine's WebSocket URL
was already a **runtime user setting**
(`settings.katago.url`, read in `services/analysis-service.ts`'s
`connect()`), with `VITE_KATAGO_WS_URL` only as the out-of-the-box
default for a fresh, unconfigured profile (`frontend/src/config/env.ts`,
pre-existing, unmodified in this work). This already matches the
charter's "stays a runtime setting exactly as the SPA has it today"
requirement — no code change was needed here.

**CORS**: `core/config.py`'s `CORS_ALLOW_ORIGINS` already defaults to
`["*"]`, paired with `allow_credentials=False` in `main.py` (the JWT
bearer token isn't a CORS credential, so the wildcard is
spec-compliant — this was true before this work and is unrelated to
it). Whatever origin the webview reports for the bundled SPA (Tauri
v2's asset protocol; exact origin string wasn't verified since the
real webview couldn't be launched — see §9) is therefore already
permitted; no backend config change was needed for the sidecar's own
CORS story either. **UNEXERCISED**: the actual origin string a
running Linux Tauri webview sends was not observed (would require the
real `tauri dev`/`tauri build` loop, blocked per §9) — the wildcard
means this is very likely a non-issue regardless of the exact string,
but "very likely" is not "witnessed."

---

## 8. Verification — exit codes (WITNESSED)

All run from the worktree, no live ports (4173/5173/5174/8764) or
running processes touched; test port 19764 used for the sidecar smoke
test, killed before finishing.

| Check | Result |
|---|---|
| `npm install` (frontend/) | exit 0, 335 packages added incl. `@tauri-apps/cli` |
| `npm run build` | **exit 0** (`vue-tsc -b && vite build`) |
| `npm run test:run` | **exit 0** — 81 passed / 3 skipped test files, 1101 passed / 4 skipped tests |
| `backend` test suite (`pytest -q`, fresh venv, `requirements.txt` + `tests/requirements-test.txt`) | **exit 0** — 691 passed, 2 skipped, 1 xfailed (after the bcrypt/python-multipart fix — see §3) |
| PyInstaller freeze (`pyinstaller packaging/lengyue-backend.spec`) | **exit 0**, `dist/lengyue-backend` (79 MB onefile) |
| Frozen-sidecar smoke test | **WITNESSED** — see §3 log; `/health` 200, `/openapi.json` served, alembic bootstrap ran and stamped/upgraded, DB + secret-key files created at injected XDG-style paths, process killed cleanly with no orphan |
| `cargo check --manifest-path frontend/src-tauri/Cargo.toml` | **UNEXERCISED (partial)** — see §9 |
| `npm run tauri build` (real AppImage/deb) | **UNEXERCISED** — see §9 |

---

## 9. Rust build — probe results and exact blocker (UNEXERCISED, evidenced)

Per the charter, `pkg-config --exists webkit2gtk-4.1` /
`libsoup-3.0` / `gtk+-3.0` were re-probed between work phases rather
than busy-waited:

```
$ pkg-config --exists webkit2gtk-4.1   # MISSING (both probes, start and end of session)
$ pkg-config --exists gtk+-3.0         # MISSING at session start, FOUND by the second probe
$ pkg-config --exists libsoup-3.0      # MISSING (both probes)
```

`cargo check` was attempted once webkit deps were re-probed and gtk3
appeared (memory-capped per the mid-session commissioner directive:
`nice -n 19 systemd-run --user --scope -p MemoryMax=4G ... cargo
check -j 2`). It compiled **the overwhelming majority of the
dependency graph** — tauri-utils, gtk bindings (gdk, gdk-pixbuf,
pango, cairo-rs), javascriptcore-rs-sys, soup3-sys's dependents — and
failed at exactly the still-missing system library:

```
error: failed to run custom build command for `soup3-sys v0.5.0`
  pkg-config exited with status code 1
  Package libsoup-3.0 was not found in the pkg-config search path.
  The system library `libsoup-3.0` required by crate `soup3-sys` was not found.
```

This is a clean, specific, actionable blocker — not a scaffold
defect. **Once `webkit2gtk-4.1` and `libsoup-3.0` are installed**
(the commissioner's in-progress `zypper` work; this session never ran
`zypper`/`sudo` per the standing rule), the remediation is: re-run
`cargo check --manifest-path frontend/src-tauri/Cargo.toml`, and if
clean, `npm run sidecar:build && npm run tauri:build` for the gold
outcome (a real AppImage/deb). No Rust source changes are expected to
be needed for that step — the compile got this far cleanly. This
session did **not** further re-probe in a loop after this single
attempt (would have required either idling or repeated heavy `cargo
check` runs against an unchanged environment) — a fresh session should
re-probe once at pickup before deciding whether to re-attempt.

`npm run tauri dev` was not attempted at all: it would bind Vite's
dev server, and `tauri.conf.json`'s `devUrl` targets port 5173, which
the standing rules mark as a live port not to be touched by this
session.

---

## 10. What Windows needs later (none of it attempted — scope is Linux-first)

The scaffold was deliberately kept target-agnostic so this is
**config, not rework**:

1. **Sidecar binary naming.** `frontend/src-tauri/scripts/build-sidecar.sh`
   currently produces `lengyue-backend-x86_64-unknown-linux-gnu`.
   Windows needs `lengyue-backend-x86_64-pc-windows-msvc.exe` (PyInstaller
   run on a Windows machine or via cross-compilation tooling this
   session didn't have access to — there's no dev VM per the charter).
2. **`tauri.conf.json`**: add `"nsis"` or `"msi"` to `bundle.targets`
   (currently `["appimage", "deb"]`).
3. **`Cargo.toml`**: no changes expected — `tauri`, `tauri-plugin-shell`,
   and `ureq` are all cross-platform. The commented-out note in
   `Cargo.toml` about a `[target."cfg(target_os = \"windows\")"]`
   table names where a Windows-only dependency would go if one turns
   out to be needed (none identified so far).
4. **`src/lib.rs`**: `app.path().app_data_dir()` already resolves
   platform-appropriately (Windows: `%APPDATA%\lengyue`) — no code
   change expected there. Worth a real smoke test on Windows once one
   is available, since this is inference from Tauri's documented
   behavior, not something this session could witness.
5. **Icons**: Windows bundle targets want a `.ico` (multi-resolution)
   in addition to the PNG set already generated; `.icns` similarly for
   a future macOS target. Neither was generated this session (out of
   scope for Linux-first bundle targets).

---

## 11. File-by-file evidentiary summary

| Claim | Status |
|---|---|
| Tauri v2 scaffold present and structurally complete (Cargo.toml, tauri.conf.json, capabilities, icons, gitignore, package.json scripts) | WITNESSED (files exist, reviewed above) |
| Vite config compatible with Tauri, non-Tauri build/test unaffected | WITNESSED (`npm run build` / `npm run test:run` both exit 0) |
| PyInstaller freeze produces a working single executable | WITNESSED (§3, §8) |
| Alembic migrations discoverable and apply correctly inside the frozen bundle | WITNESSED (§3 log) |
| Sidecar lifecycle code (spawn/ready/kill) compiles | **UNEXERCISED** — `cargo check` did not reach `lengyue_lib` (the crate itself) before failing on `soup3-sys`; only the dependency graph up to that point is confirmed to compile. The Rust source in `src/lib.rs` / `src/main.rs` has been reviewed carefully against the Tauri v2 / tauri-plugin-shell API shape from documentation knowledge, but has not been compiler-checked. |
| DATABASE_URI / SECRET_KEY_FILE env-var override reaches the frozen backend and takes effect | WITNESSED (§3 log — files created at the injected scratch path, not `./cards.db`) |
| No bundled cards.db | WITNESSED (PyInstaller spec's `datas` list reviewed — only `alembic.ini` + `alembic/`; `dist/lengyue-backend`'s presence doesn't include `samples/`) |
| Sample-DB import path for a Tauri user | WITNESSED that `load_sample.py --target` works as described (pre-existing script, read, not modified) — the *end-to-end "user does this and it works"* flow (running the actual .deb, then the script, then relaunching) was **not** exercised, since the .deb was never built (§9) |
| Engine/proxy URL unaffected, remains runtime-configurable | WITNESSED (code read; `services/analysis-service.ts` / `env.ts` unchanged in this respect) |
| CORS permits the Tauri webview's origin | UNEXERCISED for the specific origin string (§7) — wildcard makes it very likely moot |
| Real AppImage/deb build (`npm run tauri:build`) | UNEXERCISED — blocked on `libsoup-3.0` / `webkit2gtk-4.1` (§9), exact command to re-run once unblocked given |
| Backend test suite green after HOST/PORT + bcrypt/python-multipart changes | WITNESSED (§8) |
| Frontend test suite green after env.ts / vite.config.ts changes | WITNESSED (§8) |

---

## 12. Commit

Branch: `worktree-agent-a257595794d199e4f` (this worktree's branch;
the orchestrator merges into `next`).

Changed/added files (see `git diff --stat` for the tracked-file
summary; `src-tauri/`, `backend/packaging/` are new untracked trees
added whole):

```
 backend/.gitignore         |  11 +++
 backend/core/config.py     |  11 +++
 backend/main.py            |  20 +++-
 backend/requirements.txt   |   2 +
 frontend/.env.example      |   7 ++
 frontend/README.md         |  36 +++++++
 frontend/package-lock.json | 233 +++++
 frontend/package.json      |   7 +-
 frontend/src/config/env.ts |  22 ++++-
 frontend/vite.config.ts    |  25 ++++-
 + frontend/src-tauri/ (new tree: Cargo.toml, tauri.conf.json, build.rs,
   capabilities/default.json, icons/*.png, src/{main,lib}.rs,
   scripts/build-sidecar.sh, .gitignore, binaries/.gitkeep)
 + backend/packaging/lengyue-backend.spec (new)
```

The commit was made after this report was drafted; if a reader needs
the exact sha, `git log --oneline -1` on this branch names it — this
report intentionally doesn't hardcode a sha that would go stale if a
follow-up commit lands.
