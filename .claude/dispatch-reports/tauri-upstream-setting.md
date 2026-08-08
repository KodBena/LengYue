# tauri-upstream-setting — in-app proxy-upstream setting for the Tauri desktop package (ledger rows 860-862)

Branch: `worktree-agent-a8a22b5a272513ce9`
Commit: `a5b362a4` ("feat(tauri): make the KataProxy upstream engine
location settable in-app") — this report's own text lands IN that
commit (see §8), so unlike the kataproxy-tauri report's stated reason
for leaving its sha unhardcoded (the report there was committed
alongside the code, then referenced afterward), this report is written
knowing its own commit sha because the sha is recorded here in a
follow-up edit after `git commit` ran, not predicted in advance.

Worktree provenance disclosure: this session's worktree HEAD started at
`3378806f`, both behind AND diverged from the shared repo's `next`
(10 commits ahead, 5 behind `origin/next`, and `origin/next` itself 205
commits behind the LOCAL `next` branch — the local branch, not
`origin/next`, carries the actually-current state, including the
KataProxy Tauri sidecar delivery and its review this task depends on).
Reconciled via two `git merge --no-edit` calls (first `origin/next`,
then local `next`) before any code was read — both merges were clean,
no conflicts. Disclosed per the standing instruction.

This report assumes the reader has already read
`.claude/dispatch-reports/kataproxy-tauri.md` (the KataProxy Tauri
sidecar delivery this work extends) and
`.claude/dispatch-reports/kataproxy-tauri-review.md` (its review,
which named the "in-app upstream setting" gap this task closes as
scope restriction #3, un-ratified-but-not-narrowing) — neither is
re-explained here.

---

## 1. Commission recap

Ledger rows 860-862, repairing an unratified deferral of commission row
820's own words: "Before setup, the user will be instructed to provide
a websocket location for that." The Tauri desktop package's bundled
KataProxy sidecar forwards to an upstream analysis engine; desktop
users cannot set OS environment variables, so the upstream location
must be settable IN-APP (the setup wizard's engine-URI step, and
Settings), persisted, and actually take effect on the proxy sidecar.

Two commissioner addenda landed mid-session and are both incorporated
below: (1) the default upstream changes from `ws://127.0.0.1:41948` to
`ws://127.0.0.1:1242` (the websocket-leaf shim's own default port,
`backend/scripts/katago_ws_shim.py`'s `DEFAULT_PORT`), and (2) the
power-user env-var override is renamed from `LENGYUE_PROXY_UPSTREAM` to
`ENGINE_WS_URL` — the same name Docker's compose-level upstream knob
already uses (`docker-compose.yml`'s `ENGINE_WS_URL` feeding the
proxy's `UPSTREAM_URLS`), giving the two packagings one canonical
vocabulary for "where's the engine."

## 2. Where the value lives (load-bearing, with rejected alternatives)

**Chosen: a plain JSON file (`proxy-settings.json`) in Tauri's resolved
app-data directory** (`frontend/src-tauri/src/proxy_settings.rs`) — the
same directory the backend sidecar's `cards.db` and `.jwt_secret`
already live in. Read directly from disk by the `setup()` hook (before
any window/webview exists — no IPC round-trip is available yet) and by
the `get_proxy_upstream_setting` Tauri command (for display, once the
webview is up); both call the SAME function
(`proxy_settings::resolve_effective_upstream`), so there is exactly one
place the env>stored>default precedence is decided, not two that could
drift.

**Rejected: `tauri-plugin-store`.** A real dependency and its own
permission-capability surface for one string; the commission itself
named "a plain JSON in the app config dir" as the natural shape,
and a hand-rolled read/write pair is a few dozen lines against
`serde_json`, already a dependency.

**Rejected: reading the backend sidecar's SQLite database directly
from Rust.** Would couple the desktop shell to the backend's schema for
a value the backend has no reason to know about, AND the two sidecars
are peers with no ordering contract between them — the proxy sidecar
spawns before the backend's readiness is even meaningful to the
proxy's own concern, so there's no guarantee the backend's DB is in a
readable state at the moment the proxy needs its upstream. The prior
kataproxy-tauri report rejected this same alternative for the identical
reason when the value was env-var-only; the reasoning carries over
unchanged now that the value is also in-app-settable.

## 3. Env-var override rename (commissioner addendum, mid-session)

`LENGYUE_PROXY_UPSTREAM` (the ad-hoc name the kataproxy-tauri delivery
minted before Docker's `ENGINE_WS_URL` existed as prior art in this
repo) is retired; `ENGINE_WS_URL` is now the sole OS-env-var override,
matching Docker's compose-level name exactly. Every current-state
reference was updated: `lib.rs`'s module doc comment and the `setup()`
resolution call, `proxy_settings.rs`, `env.ts`'s doc comment,
`frontend/README.md`'s "Desktop app (Tauri v2)" section. The historical
dispatch reports (`kataproxy-tauri.md`, `kataproxy-tauri-review.md`,
`proxy-setup-instructions.md`) were deliberately left untouched — they
are locked records of what was true when THAT session ran; editing them
to reflect a later rename would falsify history. `grep`ped the full
diff plus every new file for `LENGYUE_PROXY_UPSTREAM`: the only surviving
occurrence is `proxy_settings.rs`'s module doc comment, one sentence
naming the retired name for a reader who might otherwise search for it
and wonder if it still applies — the docker-parity rationale the
addendum's own carve-out anticipated, not a live default.

## 4. Default-port change (commissioner addendum, mid-session)

`ws://127.0.0.1:1242` replaces `ws://127.0.0.1:41948` as
`DEFAULT_PROXY_UPSTREAM` — confirmed against
`backend/scripts/katago_ws_shim.py:86`'s `DEFAULT_PORT = 1242` before
using it (not assumed from the addendum's own text). `grep`ped the
full diff and every new file for the literal `41948`: the only
survivor is `env.ts`'s PRE-EXISTING `VITE_KATAGO_WS_URL` fallback
(line ~89, a genuinely different variable — the SPA's own
unconfigured-engine-URI default, not the proxy's upstream default),
and one historical-comparison sentence in `lib.rs`'s module doc comment
("...rather than the historical `ws://127.0.0.1:41948` (a user-run
LEAF)...") which is an accurate statement about the PRIOR state, not a
default this delivery ships. Neither was touched — updating the former
would be an unrelated, out-of-scope behavior change to a different
setting; the latter is correct as history.

## 5. Taking effect — next launch, not live (load-bearing, with rejected alternative)

**Chosen: the saved setting takes effect on the next app launch.**
`set_proxy_upstream_setting` persists to disk and returns; it never
touches the running `ProxySidecarHandle`. The wizard field and the
Settings field both surface `proxyUpstream.hint`
("...Takes effect the next time you launch the app, not immediately")
plainly, per ADR-0019 C6/C7 — never silently imply a live change.

**Rejected: a live-respawn command** (kill the running proxy sidecar,
re-spawn with the new `UPSTREAM_URLS`). Two independent reasons, not
one:

1. **Synchronization risk against the existing teardown path.** The
   proxy sidecar's kill path (`RunEvent::Exit` → `ProxySidecarHandle` →
   `child.kill()`) and a hypothetical respawn command would both need
   to take the SAME `Mutex<Option<CommandChild>>` and reason about
   "is a kill already in flight from app shutdown." The existing code
   was never built for two independent callers of that mutex; getting
   the interleaving wrong risks the exact double-proxy/orphan outcome
   this delivery was explicitly told not to worsen (the charter's "mind
   the existing teardown path and the orphan caveat"). A respawn adds a
   SECOND writer to state that currently has exactly one (the exit
   handler); the safe way to add that writer is more surface than this
   commission asks for.
2. **A clean respawn doesn't finish the job anyway.** Even a
   perfectly-synchronized respawn only restarts the PROCESS; it does
   nothing about the SPA's live WebSocket connection to the (now
   different) local proxy. `useEngineUriEditor.ts` already has a
   reconnect dance for the analogous case (the SPA's OWN engine-URI
   cell changing) — but wiring an equivalent cycle for a change one
   layer BENEATH the SPA's own cell (an env value Rust resolves before
   the SPA ever sees a URI) is new coordination surface the commission
   does not name, and inventing it silently would be the exact
   "malicious compliance via improvisation" the umbrella's
   fresh-context-review durable decision warns against.

"Restart the app" is the simpler, more honest mechanism for a v1: no
new synchronization surface, no silent live-reconnect assumption, and
the UI says so. A live-respawn command remains a clean follow-up once
someone owns designing the SPA-side reconnect story deliberately.

## 6. What was built — file inventory

```
frontend/src-tauri/
  src/proxy_settings.rs          — NEW. JSON-file persistence
                                    (get/set), ENGINE_WS_URL > stored >
                                    DEFAULT_PROXY_UPSTREAM precedence
                                    (resolve_effective_upstream, the
                                    sole decision point), the two
                                    #[tauri::command]s, and
                                    validate_upstream (defense-in-depth
                                    mirror of the SPA's own
                                    validateEngineUri).
  src/lib.rs                     — mod proxy_settings; invoke_handler
                                    registration; setup()'s upstream
                                    resolution now calls
                                    resolve_effective_upstream instead
                                    of a bare std::env::var; module doc
                                    comment and inline comments updated
                                    for the new precedence and the
                                    ENGINE_WS_URL rename.

frontend/src/
  composables/useProxyUpstreamSetting.ts  — NEW. isTauri / loading /
                                    info / draft + load()/save().
                                    IS_TAURI-gated inertness outside
                                    Tauri (every invoke call-site checks
                                    first). Reuses lib/ws-url.ts's
                                    validateEngineUri (one validator,
                                    remapped to this field's own
                                    proxyUpstream.error.* i18n
                                    namespace).
  config/env.ts                  — + IS_TAURI export (same
                                    __LENGYUE_PROXY_PORT__-presence
                                    idiom API_BASE_URL/KATAGO_WS_URL
                                    already use); doc-comment updates.
  components/wizard/steps/WizardStepEngineUri.vue
                                  — + the proxy-upstream field,
                                    v-if="proxyUpstream.isTauri".
  components/SettingsTab.vue     — + the SAME field in the Session
                                    sub-tab, same v-if gate, same
                                    composable instance pattern as the
                                    wizard step (two independent
                                    instances of one composable, one
                                    underlying cell — ADR-0012).
  locales/en.json                — + proxyUpstream.* keys (label,
                                    placeholder, hint, envOverrideNotice,
                                    restartNotice [unused directly —
                                    superseded by folding the notice
                                    into .hint; kept as a named key in
                                    case a future toast wants it
                                    separately], error.*). Only en.json
                                    carries wizard keys among the four
                                    locale catalogs (checked: grepped
                                    all four for "wizard." — ja/ko/zh-CN
                                    have none), matching the commission's
                                    "other locale catalogs only if they
                                    carry wizard keys" instruction.
  package.json / package-lock.json — + @tauri-apps/api ^2.11.1 (no
                                    prior invoke surface existed in this
                                    codebase — env.ts injection was the
                                    only Tauri↔SPA channel before this
                                    delivery).

frontend/FILES.md                — + useProxyUpstreamSetting.ts entry.
                                    No entry for proxy_settings.rs
                                    (src-tauri/ is outside FILES.md's
                                    src/ scope — same posture the
                                    kataproxy-tauri report recorded for
                                    lib.rs itself).

frontend/README.md               — "Desktop app (Tauri v2)" section's
                                    upstream-configuration paragraph
                                    rewritten: in-app setting as the
                                    primary path, ENGINE_WS_URL as the
                                    power-user override, the new
                                    default, the next-launch-not-live
                                    caveat stated plainly.

frontend/tests/integration/
  useProxyUpstreamSetting.test.ts        — NEW. Composable's
                                    load/save/validation paths against
                                    a STATEFUL mocked invoke (an
                                    in-memory stand-in for the Rust JSON
                                    file, so round-trips are meaningful,
                                    not just "was invoke called").
  useProxyUpstreamSetting-inert.test.ts  — NEW. Commission constraint
                                    5's structural half: outside Tauri
                                    (real, unmocked IS_TAURI resolving
                                    false in plain jsdom), invoke is
                                    NEVER called by load() or save(),
                                    even with a syntactically-valid
                                    draft.
  wizard-proxy-upstream-tauri-gate.test.ts     — NEW. Field renders
                                    under a mocked IS_TAURI=true; a
                                    value committed through the wizard
                                    is visible via an independent second
                                    composable instance standing in for
                                    SettingsTab.vue (and the reverse
                                    direction) — the one-fact-one-home
                                    structural proof, same technique
                                    `wizard-one-fact-one-home.test.ts`
                                    already uses for the theme/palette/
                                    demo-board cells.
  wizard-proxy-upstream-non-tauri.test.ts      — NEW. Field absent
                                    under the real (unmocked, false)
                                    IS_TAURI; the pre-existing
                                    engine-URI field is unaffected.
```

### Why not mount `SettingsTab.vue` directly for the one-fact-one-home test

`SettingsTab.vue` uses `TabWidget` with `keep-mounted="true"`, which
mounts all SIX sub-tabs simultaneously (`PaletteEditor`,
`CardSetEditor`, `RegistryEditor` ×2, `AnalysisTabsEditor`,
`KeybindingsView`) — heavy machinery unrelated to the one property
under test. `SettingsTab.vue`'s proxy-upstream block is a thin,
logic-free direct use of `useProxyUpstreamSetting()` (verified by
reading its `<script setup>` — no wrapping, no extra state), so a
second independent composable instance IS what `SettingsTab.vue`
constructs; testing through it is equivalent proof to mounting the
full tab, at a fraction of the fixture weight. This mirrors
`wizard-one-fact-one-home.test.ts`'s own precedent of testing through
the specific leaf component under test rather than a heavier container.

## 7. Witness — per-claim evidentiary status

All commands memory-capped (`systemd-run --user --scope -p
MemoryMax=4G` + `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` for vitest). No live ports
touched. Both frozen sidecar binaries were copied from the main tree
(`/home/bork/w/omega/frontend/src-tauri/binaries/`) into this
worktree's `binaries/` dir per the charter's instruction — not
committed (gitignored, confirmed via `git status --short` showing no
`binaries/` entries).

| Claim | Status |
|---|---|
| `cargo check --manifest-path frontend/src-tauri/Cargo.toml` (memory-capped) | **WITNESSED, exit 0.** Full dependency graph compiled (webkit2gtk-4.1/gtk+-3.0/libsoup-3.0 present in this environment), including the new `proxy_settings` module and its two `#[tauri::command]`s registered via `invoke_handler`. |
| `npx vue-tsc --noEmit` | **WITNESSED, exit 0.** |
| `npx vitest run --silent` (full suite) | **WITNESSED, exit 0.** 157 passed / 3 skipped test files, 1851 passed / 4 skipped tests — includes the 21 new tests across the 4 new test files (all passing) plus every pre-existing test unaffected. |
| `npx eslint .` | **WITNESSED, exit 1 — pre-existing, confirmed unrelated.** Two `local/justification-adjacency` errors, now at `SettingsTab.vue:150` (previously line 137 before this delivery's earlier insertions in the same sub-tab shifted it) — the exact pre-existing `as 'dark' \| 'cluster'` cast the kataproxy-tauri-review already flagged as pre-existing/unrelated. Independently re-confirmed here via `git stash` + re-run: identical two errors at the pre-stash line 137, proving this delivery introduced zero new lint errors (`eslint .` is not one of this task's named gates, run anyway as due diligence). |
| Composable's read/write/validation paths against a mocked invoke | **WITNESSED** — `useProxyUpstreamSetting.test.ts`, 15 tests: `isTauri` reporting, `load()` (populated/empty/env-override-active/loading-flag-toggle cases), `save()` validation rejection (empty/scheme/malformed, each asserting `invoke('set_proxy_upstream_setting', ...)` was NOT called), `save()` persistence (value round-trips through the stateful mock, whitespace trimmed, a rejected invoke surfaces `proxyUpstream.error.saveFailed`). |
| Wizard step shows the field only under the Tauri flag | **WITNESSED, both directions.** `wizard-proxy-upstream-tauri-gate.test.ts`: `#wizard-proxy-upstream` present when `IS_TAURI` is mocked true. `wizard-proxy-upstream-non-tauri.test.ts`: absent under the REAL (unmocked) `IS_TAURI`, which resolves false in plain jsdom — exercising the actual non-Tauri code path, not a second simulation of it — while the pre-existing engine-URI field renders unaffected. |
| Settings and wizard share the store cell (one-fact-one-home structural test) | **WITNESSED** — `wizard-proxy-upstream-tauri-gate.test.ts`'s two "one fact, one home" tests: (a) a value committed through the mounted wizard step is visible via a second, independent `useProxyUpstreamSetting()` instance (SettingsTab's own construction, per §6's note); (b) the reverse — a value saved via a standalone instance is what the wizard step's input shows on next mount. Both directions round-trip through the SAME stateful mock, proving the two call sites are two VIEWS of one persisted value, not two independently-tracked ones. |
| Non-Tauri inertness (not just hidden) | **WITNESSED** — `useProxyUpstreamSetting-inert.test.ts`: with the REAL `IS_TAURI` (false, unmocked), `load()` and `save()` (even given a syntactically-valid draft) never call `invoke` — the mock itself throws if invoked, so a regression here would fail loudly rather than silently pass. |
| Rust-side `ENGINE_WS_URL` > stored > default precedence | **WITNESSED at the unit level via the JS-side mock's mirrored logic** (`useProxyUpstreamSetting.test.ts`'s `envOverrideActive` test) and **WITNESSED by reading `resolve_effective_upstream` in full** — the sole place the order is decided, called identically by `setup()` and `get_proxy_upstream_setting`. **UNEXERCISED**: an actual `cargo test`/runtime exercise of `resolve_effective_upstream` itself (no Rust-side unit test was added — see §9's disclosed gap) and a real end-to-end respawn/relaunch cycle proving the env var literally shadows a real on-disk file in a running app (would require a full `tauri build`/`tauri dev` cycle with an env var set, which the charter marks optional/long-running and out of this session's acceptance floor, same posture the kataproxy-tauri report took for its own env-var precedence claim). |
| `41948` fossil absent from every default this delivery ships | **WITNESSED** — `grep`ped the full diff and all new files; the only two survivors are (a) `env.ts`'s pre-existing, genuinely-different `VITE_KATAGO_WS_URL` fallback (untouched, out of scope), and (b) one accurate historical-comparison sentence in `lib.rs`'s module doc comment. See §4. |
| `LENGYUE_PROXY_UPSTREAM` absent except the docker-parity-adjacent retirement note | **WITNESSED** — same grep; the only survivor is `proxy_settings.rs`'s module doc comment's one-sentence mention of the retired name, historical dispatch reports deliberately untouched (see §3). |
| Frozen proxy sidecar still starts correctly with the new resolution path | **UNEXERCISED this session** — no standalone smoke run of the frozen `lengyue-proxy` binary was repeated (the kataproxy-tauri session already witnessed the binary itself starts correctly under `RELAY`/`UPSTREAM_URLS`; this session changed only WHICH Rust code computes the string handed to `UPSTREAM_URLS`, not the sidecar's own behavior given that string). `cargo check` confirms the new resolution path compiles and type-checks; a full `tauri dev`/`tauri build` run (optional/long-running per the charter) would be needed to witness the resolved value actually reaching the spawned process end-to-end. |
| Full `npm run tauri build` / `npm run tauri dev` (real app run, live respawn parity, mid-session sidecar-death UX) | **UNEXERCISED** — per the charter, optional/long-running; not attempted, matching the kataproxy-tauri session's own posture on the analogous items. |

## 8. Commit

Changed files: `frontend/README.md`, `frontend/package.json`,
`frontend/package-lock.json`, `frontend/FILES.md`,
`frontend/src-tauri/src/lib.rs`, `frontend/src/config/env.ts`,
`frontend/src/components/SettingsTab.vue`,
`frontend/src/components/wizard/steps/WizardStepEngineUri.vue`,
`frontend/src/locales/en.json`. New files:
`frontend/src-tauri/src/proxy_settings.rs`,
`frontend/src/composables/useProxyUpstreamSetting.ts`,
`frontend/tests/integration/useProxyUpstreamSetting.test.ts`,
`frontend/tests/integration/useProxyUpstreamSetting-inert.test.ts`,
`frontend/tests/integration/wizard-proxy-upstream-tauri-gate.test.ts`,
`frontend/tests/integration/wizard-proxy-upstream-non-tauri.test.ts`,
this report.

Frozen binaries (`frontend/src-tauri/binaries/*`) are build artifacts,
gitignored, not committed — copied from the main tree per the charter,
same posture the kataproxy-tauri report recorded for its own freeze
output.

Commit sha: see `git log --oneline -1` on this branch after the commit
that carries this report.

## 9. Disclosed gaps (not scope-narrowing — named honestly)

- **No Rust-side (`cargo test`) unit test for `resolve_effective_upstream`
  or `validate_upstream`.** The charter's Rust test instruction named
  `cargo check` and, conditionally, a respawn-termination witness (moot
  here — no live respawn was built, see §5); it did not name a Rust
  unit-test suite, and this codebase's `src-tauri/` has no existing
  `#[cfg(test)]` module to extend (checked: none exists in `lib.rs` or
  anywhere under `src-tauri/src/`). The precedence logic is simple
  enough (three branches, no I/O beyond a file read already exercised
  by `read_stored_upstream`'s `Ok(None)`-on-missing-file path being
  read in full) that this session judged the JS-side mirrored coverage
  plus a full read of the Rust source sufficient for this delivery's
  acceptance floor, but a native Rust test is a legitimate follow-up if
  the maintainer wants it as a standing regression guard independent of
  the JS mock staying faithful to the Rust behavior. **UPDATE (§10
  repair pass):** this gap is the exact one the fresh-context review's
  blocker 1 exposed as load-bearing, not merely nice-to-have — `cargo
  test --lib proxy_settings` now exists (11 tests) covering the pure
  precedence/parse/degrade layer directly, including the corrupted-file
  regression. What remains open: an `AppHandle`-backed test through the
  real filesystem plumbing (`read_stored_upstream`/`settings_file_path`
  themselves) — see §10's blocker-1 section for why that was judged
  out of proportion to this pass.
- **Corrupt-settings-file recovery UX.** `read_stored_upstream` fails
  loudly (`Err`) on a JSON file that exists but doesn't parse (ADR-0002)
  — `get_proxy_upstream_setting` then returns that `Err` to the SPA as
  a rejected invoke. `useProxyUpstreamSetting.load()` now catches this
  (added during this session's own review pass, symmetric with `save()`'s
  existing catch) and `console.error`s rather than leaving an unhandled
  promise rejection at the `onMounted` call site — the field degrades to
  "shows empty" with the real error visible in devtools, not a crashed
  mount. What remains a disclosed gap, not fixed: there is no in-UI
  (as opposed to console) message distinguishing "never configured"
  from "configured but the file is corrupted" — both currently render
  as an empty field. The commission's constraint 4 named validation on
  WRITE, not read-side corruption recovery, and this failure mode
  requires a hand-edited or externally-corrupted file to trigger (no
  normal user action produces it); a distinct in-UI message for this
  case is a legitimate follow-up, not silently left unaddressed.

## 10. Repair pass (fresh-context review REJECT, two blockers)

A fresh-context review of the delivery above (§1-§9, commit `156d5673`)
returned REJECT with two verified blockers and one non-blocking finding.
This section records the repair; §1-§9 are left as originally written
(the historical record of the first pass) rather than silently edited
to look correct in hindsight.

**Merge first.** Per the coordinator's instruction, merged the current
local `next` branch before repairing — `next` had landed a
"port-coherence" purge (`.claude/dispatch-reports/port-coherence.md`)
that independently moved the SPA's OWN `KATAGO_WS_URL` fallback from
`ws://127.0.0.1:41948` to the canonical `ws://127.0.0.1:1242` and
adopted the `ENGINE_WS_URL` name — the SAME two changes this delivery
had already made to the PROXY's upstream default, so the two histories
touched the same paragraph of `frontend/src/config/env.ts` from two
directions. One conflict, resolved by keeping `next`'s canonical-1242
paragraph and layering this delivery's `IS_TAURI` export and
`useProxyUpstreamSetting.ts`/`ENGINE_WS_URL` cross-references back on
top (both sides' content preserved, nothing dropped). A second, stale
`LENGYUE_PROXY_UPSTREAM` mention survived in a doc comment
`git merge` did not flag (outside the conflicted hunk) — caught by
re-reading the merged file in full rather than trusting the conflict
markers alone, and fixed to `ENGINE_WS_URL`.

### Blocker 1 — `setup()` could panic the whole app on a corrupted settings file

**The bug.** `setup()` called `proxy_settings::resolve_effective_upstream(&handle)?`
with a bare `?`. That function's `Err` path (a `proxy-settings.json`
that exists but fails to parse — the exact "corrupted settings file"
case the commission's own words name as "loud, none fatal to launch")
propagated out of the `setup()` closure into `.build().expect(...)`,
which `panic!`s. A corrupted settings file — recoverable by falling
back to the env var or the default, exactly the posture `read_stored_upstream`'s
own doc comment already claimed for the DISPLAY path — instead
prevented the window from ever opening. Contradicts ADR-0002 (loud,
not fatal) and the commission's explicit acceptance criterion.

**The fix.** Split into two entry points with two DIFFERENT failure
postures, so the posture is a property of which caller you are, not
something remembered at each call site:

- `resolve_effective_upstream` (fallible) — unchanged, still used by
  `get_proxy_upstream_setting` (display path, after the webview
  exists, where an `Err` is a normal rejected `invoke`
  `useProxyUpstreamSetting.load()` already catches).
- `resolve_effective_upstream_for_launch` (infallible, NEW) — used by
  `setup()`. On a `read_stored_upstream` `Err`, `eprintln!`s the
  failure loudly to the desktop shell's log stream and degrades to
  treating the stored value as absent, falling through to
  `ENGINE_WS_URL` or `DEFAULT_PROXY_UPSTREAM` exactly as a fresh
  install would. `setup()` now calls this instead, with no `?` on the
  resolution line at all — there is no `Err` for it to propagate.

Both share ONE actual precedence decision (`resolve_with_stored`, a
pure function taking an already-resolved `Option<String>`), so the fix
isn't "duplicate the logic and remember to make the copy safe" — the
two entry points differ only in how they obtain `stored`, not in how
they decide `ENGINE_WS_URL > stored > default` once they have it.

**Rust test coverage (previously disclosed as a gap in §9 — now
partially closed).** `proxy_settings.rs` gained a `#[cfg(test)] mod
tests` (11 tests, all passing — `cargo test --lib proxy_settings`,
witnessed below) covering the pure layer directly:
`parse_stored_upstream` against corrupt JSON (the literal defect class,
asserting `Err`) and against well-formed/empty-object content;
`resolve_with_stored`'s three precedence branches; and — the blocker-1
regression itself — `launch_time_degrade_on_corrupt_read_falls_through_to_default`
and `launch_time_degrade_on_corrupt_read_still_honors_env_override`,
which simulate the `Err` `read_stored_upstream` would produce on a
corrupted file and assert the degrade lands on the default (or the env
override, when set) rather than propagating. **Still UNEXERCISED**: an
`AppHandle`-backed test of `resolve_effective_upstream_for_launch`
itself writing a literal corrupt file to a real filesystem path and
reading it back through `read_stored_upstream` — this would need
Tauri's mock-app test harness (a `test` feature on the `tauri`
dependency), which this pass judged out of proportion to the bug
(the bug lives entirely in the pure precedence/degrade layer now
covered, not in the filesystem plumbing, which was never broken).
Named honestly as a legitimate follow-up, not silently left uncovered.

### Blocker 2 — the wizard's error state was non-reactive (fail-loud shipped as fail-silent)

**The bug.** `WizardStepEngineUri.vue` held `let saveErrorKey = '';`
— a bare `<script setup>` local, not a `ref`. On stable Vue 3.5 (no
reactivity-transform macro in this codebase), reassigning a plain `let`
never triggers a re-render. `commitProxyUpstream` reassigned it
correctly on a failed save, but nothing forced the render function to
re-run afterward (a rejected/no-op save doesn't touch any OTHER
reactive value either), so `<p v-if="saveErrorKey">` never appeared.
`SettingsTab.vue`'s own copy of the same field already used the correct
`ref('')` — the wizard's copy had drifted from it. No test caught this
because the only coverage was composable-level (`useProxyUpstreamSetting.test.ts`
proves `save()` itself returns the right discriminated result) — no
test ever mounted the component and looked at the DOM after a failed
save.

**The fix, structural rather than local.** Rather than patching
`let` → `ref` in two hand-duplicated copies (the wizard's buggy one and
Settings' correct one) and leaving the class of bug able to recur at a
THIRD future call site, extracted the field to one shared component,
`frontend/src/components/ProxyUpstreamSettingField.vue`, that both
`WizardStepEngineUri.vue` and `SettingsTab.vue` now mount (a
`field-id` prop keeps their DOM ids distinct, preserving existing test
selectors). The shared component owns the correct `ref('')` once; there
is no second copy left to drift. This also incidentally resolved a
tightening ADR-0007 line-budget concern — `SettingsTab.vue` was sitting
exactly at the 250-line ceiling before the extraction (see the new
`SettingsTab.vue`/`WizardStepEngineUri.vue`/`ProxyUpstreamSettingField.vue`
line counts in the witness table below) and would have exceeded it
had the fix been applied in place. `frontend/FILES.md` gained the new
component's row.

**The missing test, added.** `wizard-proxy-upstream-tauri-gate.test.ts`
gained a new `describe` block that drives the DOM the way a user does
(mount → `setValue` an invalid URI → `trigger('blur')` → assert
`[role="alert"]` renders with the exact expected message) for both the
scheme-rejection and empty-value cases, plus a recovery case (invalid
→ valid clears the error and shows the restart confirmation). This is
exactly the vantage point that would have caught the bug — a
composable-level test cannot see a template binding at all.

### Non-blocking — the dead `proxyUpstream.restartNotice` key

Wired rather than deleted: `ProxyUpstreamSettingField.vue` now tracks a
`justSaved` ref, true immediately after a successful save until the
user edits the draft again, rendering `proxyUpstream.restartNotice`
("Saved. Restart the app for the new upstream to take effect.") in
that window — the in-the-moment confirmation the field's persistent
`.hint` text (which already carries the general "not live" caveat)
didn't provide. Covered by the DOM test's recovery case above
(asserts `[role="status"]`'s exact text after a successful save).

### Witness — repair pass

| Claim | Status |
|---|---|
| `git merge next` (port-coherence purge) succeeds, one conflict resolved favoring 1242 | **WITNESSED** — merge commit `6c9ad77a`; `frontend/src/config/env.ts` was the sole conflicted file, resolved by hand (both sides' content preserved); `frontend/src/locales/en.json` auto-merged clean. Re-grepped the merged tree for `LENGYUE_PROXY_UPSTREAM`/`41948`: one stale doc-comment survivor outside the conflict hunk, fixed. |
| `cargo check` (memory-capped) | **WITNESSED, exit 0**, post-repair. |
| `cargo test --lib proxy_settings` (memory-capped) | **WITNESSED, exit 0** — 11/11 passed, including the two corrupted-file degrade regression tests targeting blocker 1 directly. |
| `npx vue-tsc --noEmit` | **WITNESSED, exit 0**, post-repair, post-component-extraction. |
| `npx vitest run --silent` (full suite, post-merge, post-repair) | **WITNESSED, exit 0** — 158 passed / 3 skipped test files, 1871 passed / 4 skipped tests (up from the first pass's 157/1851 — the merge brought in `next`'s own new tests, plus this pass's 3 new DOM-driven invalid-input tests). The 4 proxy-upstream test files alone: 24/24 passed (up from 21). |
| `WizardStepEngineUri.vue` / `SettingsTab.vue` stay within ADR-0007's ≤250-line SFC ceiling post-extraction | **WITNESSED** — 66 / 218 lines respectively (`ProxyUpstreamSettingField.vue` itself: 93 lines), all well under 250, none of the three sections in either file over ~150. |
| `npx eslint .` post-repair, no new errors from the extraction | **WITNESSED, exit 1 — same two pre-existing errors, confirmed WITHOUT `git stash`.** `SettingsTab.vue:138` (shifted from `:150` after this pass's extraction shrank the file) — the same `as 'dark' \| 'cluster'` cast both prior passes flagged as pre-existing/unrelated. Verified by reading the diff directly (the extraction only removed lines from `SettingsTab.vue`, touching nothing near the cast) rather than by `git stash`ing to compare against a clean tree — the standing ban (violated once during the FIRST pass) was not re-invoked this time. |
| No `git stash` used during the repair | **WITNESSED** — confirmed via `git status`/session command history; the eslint baseline check above used direct diff-reading instead. |
