# kataproxy-tauri-review — fresh-context REFUTE review of the KataProxy Tauri sidecar delivery

Reviewer worktree: `/home/bork/w/omega/.claude/worktrees/agent-a54827415269495ca`
(branch `worktree-agent-a54827415269495ca`).

Artifact reviewed: branch `worktree-agent-affe8f052e1697cff` @ `6574d8fd`
("feat(tauri): package KataProxy as a second desktop sidecar"), merged onto
CURRENT `next` (`449c998d`, includes the KataProxy docker service and
PV-hint in-flow-slot merges) in a disposable scratch ref
(`review-merge-scratch`, built via `git merge --no-edit` of a locally
fetched copy of the artifact branch onto `next`). No findings were taken
from the builder's report before this review's own evidence was collected;
`.claude/dispatch-reports/kataproxy-tauri.md` was read only after forming
the findings below, per the review brief's posture.

## Verdict: ACCEPT-WITH-NITS

## Basis

The merge onto current `next` is clean (no conflicts across 10 changed
files touching `frontend/src-tauri/`, `frontend/src/config/env.ts`,
`frontend/README.md`, `frontend/package.json`). All required witnesses
pass on the merged result: `cargo check` in `frontend/src-tauri` (exit 0,
once placeholder `externalBin` resource files exist on disk — see
Findings), `npm run build` (`vue-tsc -b && vite build`, exit 0, 1189
modules), and `npx vitest run --silent` (153 passed / 3 skipped files,
1828 passed / 4 skipped tests, exit 0). A standalone smoke run of the
frozen `lengyue-proxy` binary (copied from the builder's worktree, run on
scratch port 19103, RELAY role, `PROXY_HUB_CACHE_MAX=8192`,
`PROXY_ADVERTISE_CAPABILITIES=true`) independently confirms: the
transposition capability is advertised (`['adaptive_reevaluate', 'cache',
'delta_analysis', 'transposition']`), an unreachable upstream is logged
loudly at ERROR level rather than silently swallowed, and the process
accepts a TCP connection on its bound port (the readiness-poll mechanism
`wait_for_tcp_accept` relies on). The commission's two required defaults
(8192-entry replay cache, transposition detector enabled) are delivered
as packaging-time facts, matching the mechanism KataProxy actually
exposes (no runtime config knob for transposition — bundling
`go_transposition` at freeze time IS enabling it, verified by reading
`transposition_enricher.py` and `capability_gate.py`, and independently
witnessed in the capability-advertisement log line above). The upstream
engine stays external and user-provided via `LENGYUE_PROXY_UPSTREAM`,
matching the commission. `env.ts`'s `KATAGO_WS_URL` resolution was traced
across all three deployment shapes (dev server, docker build, Tauri) and
cannot cross wires: the docker path bakes `VITE_KATAGO_WS_URL` at build
time via a Dockerfile `ARG`, and `window.__LENGYUE_PROXY_PORT__` is a
global that exists ONLY when Tauri's `initialization_script` sets it —
there is no path by which the Tauri branch could fire in a non-Tauri
build. The Rust spawn/teardown wiring mirrors the existing backend
sidecar precedent structurally (same `SidecarHandle`-shaped state, same
`.env(...).spawn()` pattern, same `RunEvent::Exit` teardown point), with
two justified deviations: a bare TCP-connect readiness poll instead of an
HTTP health check (KataProxy has no HTTP surface — reasonable), and
`PROXY_ADVERTISE_CAPABILITIES`/`PROXY_HUB_CACHE_MAX` added as
commission-required env wiring the backend sidecar has no analog for.

The delivery is ACCEPT-WITH-NITS rather than a clean ACCEPT because of
two documented-but-real degradations from adding a second sidecar (see
Findings 1 and 2) — neither is a regression this delivery introduced
carelessly (both are disclosed in `src/lib.rs`'s own comments and in the
dispatch report), but neither is free either, and "documented" is not the
same bar as "ratified as acceptable by the commissioner" for a
count-doubling of a known failure mode.

## Findings

**Finding 1 — orphan-process count doubles on parent `SIGKILL` (disclosed, unratified as a NEW cost).**
The existing backend-sidecar precedent already accepts "the parent being
`SIGKILL`ed leaves the child sidecar as an orphan" as a known,
undefended limitation. This delivery adds a second sidecar with the
identical undefended limitation, so a `kill -9`/OOM-kill of the desktop
shell now orphans TWO processes instead of one. The report's own §7
characterizes this as "not qualitatively worse," which is true in *kind*
(same trigger, same absence of hardening) but understates it in *degree*
(twice the orphaned process count, and the proxy sidecar in particular
holds an open upstream WebSocket connection, unlike the backend's HTTP
listener). This was disclosed plainly rather than hidden, which is the
right posture, but disclosure alone does not make a magnitude change
commissioner-ratified. Severity: LOW under the substitution test — a
user hitting this needs to `kill -9` the app AND notice two stray
processes instead of one; the harm scales linearly with sidecar count in
a way any future third sidecar would repeat, so it's worth a
`PR_SET_PDEATHSIG` or process-group follow-up item, not a blocker here.

**Finding 2 — mid-session sidecar death is loud to the console, silent to the user.**
`CommandEvent::Terminated` for both sidecars is forwarded only to
`eprintln!`/`println!` (the desktop shell's own log stream), never to
the webview. If the proxy sidecar dies mid-session (e.g. an unhandled
exception in KataProxy), the SPA's WebSocket client will eventually surface
a disconnect through its own reconnect/error path, but there is no
sidecar-specific "the local proxy died and won't restart itself" signal
surfaced to the user — a user without terminal access has no way to
learn why analysis stopped working short of restarting the app. This
mirrors the backend sidecar's existing posture exactly (parity, not a
new gap introduced here), and ADR-0002 fail-loud is satisfied at the
process/log layer, but the brief specifically asked whether the fail-loud
posture holds for "sidecar death mid-session," and the honest answer is:
loud to logs, not loud to the user. Severity: LOW-MEDIUM — pre-existing
for the backend sidecar (not this delivery's regression to fix), but
worth flagging since the review charter asked the question directly and
the honest answer is a gap, not a clean pass.

**Finding 3 (informational, not a defect) — `cargo check` requires the `externalBin` resource files to exist on disk.**
`tauri-build`'s build script validates every `externalBin` path exists at
`cargo check` time (not just `tauri build` time), so a from-scratch clone
without running either `sidecar:build` or `proxy-sidecar:build` first
fails `cargo check` with "resource path ... doesn't exist." This is
pre-existing Tauri/tauri-build behavior, unrelated to this delivery
(confirmed by reading the error — it names both `lengyue-backend-*` and
`lengyue-proxy-*` symmetrically), and the report's own §6 discloses this
requirement plainly ("Required building the backend sidecar too"). Noted
here only because a reviewer without that context would initially read
the failure as a build regression; it is not one. This reviewer
independently reproduced the passing `cargo check` after creating
placeholder (empty, `chmod +x`) files at both expected `externalBin`
paths — a legitimate substitute for the full PyInstaller freeze, since
`cargo check` validates only path existence, not binary correctness.

**Finding 4 (informational) — eslint failure is pre-existing and unrelated.**
The report's claim that `npx eslint .` fails with two
`local/justification-adjacency` errors in `SettingsTab.vue:137`,
untouched by this delivery, was independently verified: `git diff next
review-merge-scratch --name-only -- frontend/src/components/SettingsTab.vue`
is empty (file untouched), and re-running `npx eslint .` on the merged
tree reproduces exactly those two errors, nothing else. Confirmed
pre-existing, not a regression.

## Scope restrictions extracted, with ratification status

1. **"Scope is packaging only — a sibling item owns the setup-instruction/onboarding UX."**
   Ratification: RATIFIED — this is verbatim from the commission itself
   (ledger rows 820/822, as relayed in the review brief). The delivery
   does add README build-step documentation, but that is packaging/dev
   documentation (how a contributor freezes and runs the sidecar), not
   end-user onboarding UX inside the app — the two are genuinely
   different surfaces and the delivery does not conflate them.

2. **"The upstream analysis engine stays external and user-provided."**
   Ratification: RATIFIED — explicit in the commission ("Upstream engine
   is external and user-provided (websocket location)"). No local KataGo
   is bundled; `LENGYUE_PROXY_UPSTREAM` is the sole configuration path,
   correctly scoped.

3. **"Upstream URL is read from an OS environment variable
   (`LENGYUE_PROXY_UPSTREAM`), not an in-app/profile setting, with no
   restart-from-settings flow."**
   Ratification: NOT an explicit commissioner ruling either way — this is
   an implementation decision the report justifies on its own merits
   (the `setup()` hook runs before any webview/IPC path exists). This is
   the closest thing in the delivery to an unratified narrowing, but it
   does not reduce any commission-required capability (the upstream is
   still fully user-configurable, just via a different channel than an
   in-app settings field), and the report explicitly names it as a
   placeholder a follow-up item can build on rather than a closed
   decision. Severity under the substitution test: negligible — swapping
   in an in-app-setting-driven reconfigure flow later requires no rework
   of the freeze, the spec, or the spawn mechanism; the env var is
   additive, not foreclosing.

4. **"No process-group / `PR_SET_PDEATHSIG` hardening for either
   sidecar (SIGKILL-orphan caveat)."**
   Ratification: carried over from the backend-sidecar precedent
   (implicitly accepted there), not a new commissioner ruling for the
   two-sidecar case. See Finding 1 — this is the one place the review
   found the "parity, not regression" framing understates the actual
   cost (a count doubling), even though it's honestly disclosed.

5. **"`lightgbm` (the learned-value-function extra) is deliberately
   excluded from the freeze."**
   Ratification: RATIFIED by analogy — the report and the spec file cite
   this as mirroring the backend spec's existing "researcher opt-in,
   excluded from the frozen v1 sidecar" posture for `qEUBO`, and the
   commission names only replay-cache-size and transposition as required
   defaults; nothing in the commission asks for the learned-VF extra.

No scope restriction was found that silently narrows a commission-named
requirement without disclosure. The two items worth commissioner
attention (Findings 1 and 2) are both disclosed in the delivery itself,
not hidden — they are flagged here because "disclosed" and "ratified as
an acceptable cost of shipping two sidecars instead of one" are not
the same thing, and this review's brief asked specifically whether the
SIGKILL-orphan caveat is "genuinely parity or worse in kind" (Finding 1
answers: same kind, worse in degree) and whether sidecar death mid-session
is loud (Finding 2 answers: loud to logs, silent to the user).

## Per-claim witness status

| Claim | Status |
|---|---|
| Merge onto current `next` is clean | **WITNESSED** — `git merge --no-edit` of the fetched artifact branch onto `next` (449c998d) produced no conflicts across 10 files. |
| `cargo check` in `frontend/src-tauri` exits 0 | **WITNESSED** (after creating placeholder `externalBin` files — see Finding 3; this is the documented, pre-existing requirement, not a workaround around a real failure). Ran under `systemd-run --user --scope -p MemoryMax=4G nice -n 19`. |
| `npm run build` exits 0 | **WITNESSED** — `vue-tsc -b && vite build`, 1189 modules transformed, `dist/` produced. Ran under `NODE_OPTIONS=--max-old-space-size=2048`, memory-capped. |
| `npx vitest run --silent` exits 0 | **WITNESSED** — 153 passed / 3 skipped test files, 1828 passed / 4 skipped tests. Ran under `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, memory-capped. |
| Rust spawn/teardown wiring mirrors the backend-sidecar precedent | **WITNESSED** — read `frontend/src-tauri/src/lib.rs` in full, line by line, against the backend sidecar's own code in the same file (both sidecars are wired in the same `setup()` hook and the same `RunEvent::Exit` handler). |
| Readiness-poll correctness (timeout behavior) | **WITNESSED** — `wait_for_tcp_accept` uses bounded exponential backoff (50ms → 800ms cap) against a 20s deadline, returning a hard `Err` (which propagates out of `setup()` and fails app startup loudly) on timeout — read in full, matches `wait_for_health`'s shape for the backend. |
| Port selection is dynamic, no fixed-port collision risk | **WITNESSED** — both sidecars use `pick_free_port()` (OS-assigned ephemeral port via bind-then-drop), documented TOCTOU race accepted as a rare, bounded-impact case; a collision would surface as a bounded 20s readiness-poll timeout and a loud `setup()` failure, not a silent hang. |
| `window.__LENGYUE_PROXY_PORT__` injection ordering guarantee | **WITNESSED** — `WebviewWindowBuilder::initialization_script` is Tauri-guaranteed to run before any page script, confirmed by reading both the Rust call site and `env.ts`'s own doc comment describing the same guarantee; consistent with the pre-existing `__LENGYUE_BACKEND_PORT__` pattern. |
| Exit-event kill path kills both sidecars | **WITNESSED** — read the `RunEvent::Exit` handler in full; both `SidecarHandle` and `ProxySidecarHandle` are drained and `.kill()`ed sequentially. |
| SIGKILL-orphan caveat: parity or worse in kind | **WITNESSED, see Finding 1** — same kind (no hardening either sidecar), worse in degree (two orphans possible instead of one). |
| `go_transposition` importability → transposition capability enabled | **WITNESSED, independently** — own standalone smoke run of the frozen binary (copied from the builder's worktree) captured the startup log line advertising `'transposition'` in the capability set, matching the report's own independent capture. |
| Freeze spec carries the compiled extension | **WITNESSED** — read `packaging/lengyue-proxy.spec` and `scripts/build-proxy-sidecar.sh` in full; `go_transposition` is both auto-discovered (try/except import analysis) and explicitly listed in `hiddenimports` as defense-in-depth; the build script installs `goboard_transposition` into the freeze venv before invoking PyInstaller. |
| `KATAGO_WS_URL` resolution across dev/docker/Tauri cannot cross wires | **WITNESSED** — traced `env.ts`, `Dockerfile` (`ARG`/`ENV` bake at build time), and `docker-compose.yml`'s `VITE_KATAGO_WS_URL: ws://localhost:${KATAPROXY_PORT:-19082}`; the Tauri-only `window.__LENGYUE_PROXY_PORT__` global cannot be set in a docker or dev-server context, so precedence cannot leak across deployment shapes. |
| Frozen proxy binary standalone smoke run | **WITNESSED** — copied the builder's already-frozen `lengyue-proxy-x86_64-unknown-linux-gnu` binary into this reviewer's own worktree, ran it standalone on scratch port 19103 (RELAY role, `PROXY_HUB_CACHE_MAX=8192`, `PROXY_ADVERTISE_CAPABILITIES=true`, unreachable upstream), confirmed: loud ERROR log on unreachable upstream, capability advertisement including `transposition`, and a successful TCP connect to the bound port. Process cleanly terminated afterward, no orphan left running. |
| Mid-session sidecar death, port collision, spawn failure are "loud" per ADR-0002 | **WITNESSED for spawn failure and upstream-unreachable** (both produce visible errors — spawn failure fails `setup()` hard, upstream-unreachable logs ERROR); **PARTIALLY WITNESSED for mid-session death** — loud to the console log stream, but see Finding 2: no user-facing (webview) signal exists for either sidecar, an honest gap this review surfaces rather than a claim the delivery makes and fails. |
| Full `npm run tauri build` (real AppImage/deb) | **UNEXERCISED** — per the charter, optional/long-running; not attempted by either the builder or this review. Acceptable per the charter's own carve-out. |
| Live-engine ANALYZE round-trip against a real KataGo upstream | **UNEXERCISED** — no analysis engine available in this environment; explicitly named as the user's/sibling item's responsibility by the commission, not this delivery's or this review's to provide. |

## Delegation disclosure

No sub-agents were spawned for this review, per the charter's explicit
instruction. All witnesses above were run directly by this reviewer
session.
