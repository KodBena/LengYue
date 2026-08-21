# LYT boot restoration — M2 stage B2b widget-id wiring gap

Commission: URGENT — restore boot on `lyt-phase2` (ledger row 2346). The
app crashed into `RootErrorBoundary` at render because M2 stage B2b's new
widget ids (`A_setup`, `A_engine_controls`/`_eval`/`_health`/`_queue`,
`SP_session`) existed in the compiled layout program
(`frontend/src/state/lyt-layout.gen.ts` / `lyt-layout-portrait.gen.ts`)
but had no `frontend/src/state/lyt-widget-registry.ts` entry and no
`App.vue` slot wiring.

## Base freshness (FIRST ACT)

`git fetch origin`; `git merge-base --is-ancestor bc08c39c HEAD` FAILED
against this worktree's own default branch
(`worktree-agent-a8807d74735b56db7`, cut from an unrelated dependabot-
merge point, `3378806f` — the same "worktree cut from an old ref" class
every prior LYT stage report in this directory discloses). No differently-
named branch was needed this time (nothing else has this worktree's exact
name checked out elsewhere): `git reset --hard origin/lyt-phase2` moved
this worktree's own branch tip onto `bc08c39c` directly (no tracked
changes existed to lose — confirmed via `git diff --stat` against the old
tip before resetting). `git merge-base --is-ancestor bc08c39c HEAD`
re-confirmed exit 0 immediately after.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-measurement-wave.md` (full, 600 lines, read
in the read-only worktree `.claude/worktrees/agent-a62c283953b12add2`
named in the commission) — the live-diagnosed crash, its exact thrown
message, and the session's own disclosed-and-reverted rig-local patch
(three new registry entries + two App.vue slot renames) were the starting
sketch this session built the real fix from, per the commission's own
framing ("a starting sketch, not gospel"). `.claude/dispatch-reports/lyt-
m2-b2b-ruling-census.md` (full, 461 lines) — the per-leaf real-component
grounding this session's registry entries cite (`ToolbarEngineMetrics.vue`
's `winrateDisplay`/`scoreLeadDisplay` block for `eval`, its `metric-pps`/
`metric-latency`/watchdog-dot block for `health`, `EngineQueueTooltip.vue`
for `queue`; `A_setup` as the setup-toolkit presence slot; the §8.4
settings sub-pane classification for `SP_session`). `frontend/CLAUDE.md`
and `frontend/tests/CLAUDE.md` read in full (both sub-projects touched:
source + tests).

## The fix

### 1. Widget registry (`frontend/src/state/lyt-widget-registry.ts`)

- `A_engine` (single leaf) retired a second time into four independent
  entries — `A_engine_controls` (mounted → new `ToolbarEngineControls.vue`,
  unconditional), `A_engine_eval` / `A_engine_health` (mounted →
  `ToolbarEngineMetrics.vue`, now `group`-parameterised), `A_engine_queue`
  (mounted → `EngineQueueTooltip.vue`, now mounted directly instead of as
  `ToolbarEngineMetrics`'s child).
- `A_setup` registered mounted → `SetupToolPalette.vue` (the whole
  existing component, trigger + body, moved out of `ToolbarAppCluster.vue`
  into its own leaf).
- `settingsPane` renamed → `SP_session` (same component, same
  disposition — the compiled program's own representative id changed
  because the settings tab's interior gained a nested, still-collapsed
  six-way `T(...)` this stage; only `SP_session` is ever an actual
  `node.widget` value — the other five `SP_*` sub-pane ids appear ONLY in
  the blackbox's own informational `childWidgets` array, never
  independently looked up by `lytMountingWidgetId`/`lytRegistryStatus` —
  confirmed by grepping both compiled `.gen.ts` files for
  `widget: "SP_`: exactly one hit, `SP_session`, in each file).

### 2. Real-component wiring (`frontend/src/App.vue`)

- Four new `#leaf-A_engine_*` slots replace the old `#leaf-A_engine`,
  mounting `ToolbarEngineControls`/`ToolbarEngineMetrics`(×2, `group="eval"`
  / `group="health"`)/`EngineQueueTooltip` — the three info groups keep the
  pre-existing `v-if="engineControls.isConnected.value"` gate (unchanged
  behaviour, just relocated per-leaf instead of wrapping one merged mount).
- `#leaf-A_setup` mounts `SetupToolPalette` directly.
- `#leaf-settingsPane` renamed `#leaf-SP_session`.
- `lytPresenceOverrides` (the `LytNode` presence-override computed) gained
  an unconditional `A_setup: true` — see "Disclosed scope call" below.
- `.lyt-toolbar-strip .engine-cluster` CSS selector (targeting the retired
  component's root class) replaced by
  `.engine-controls`/`.engine-metrics-bar`/`.queue-metric` (the three new
  mounted components' own root classes).

### 3. Component split (`frontend/src/components/chrome/`)

- **`ToolbarEngineCluster.vue` retired** (deleted). Its button-cluster
  markup moved verbatim into the new **`ToolbarEngineControls.vue`**
  (mounted at `A_engine_controls`).
- **`ToolbarEngineMetrics.vue`** gained a `group: 'eval' | 'health'` prop
  (default `'eval'`, preserving the pre-split behaviour for the one
  existing test that mounts it with no prop —
  `tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts`,
  left untouched, still green). The `queue` group's markup
  (`<EngineQueueTooltip>`) was removed from this component entirely —
  that component now mounts directly at its own leaf.
- **`ToolbarAppCluster.vue`**: `<SetupToolPalette>` removed (moved to its
  own `A_setup` leaf in App.vue).
- Comment-only accuracy passes: `EngineQueueTooltip.vue`,
  `StatusBar.vue`, `TabWidget.vue`, `SettingsSubstrip.vue`,
  `SettingsPane.vue`, `lyt-capability-registry.ts` — every stale
  `ToolbarEngineCluster.vue` / `settingsPane` reference corrected to name
  the new component/id, per ADR-0002 (a doc that names a retired artifact
  as if still live is itself a silent failure).

### Disclosed scope calls (not silently narrowed — named here per the
commission's own STOP-and-report discipline)

**A_setup / SetupToolPalette**: ruling row 2108 ("PALETTE ADOPTION")
names the palette as an `@toggle(user, release)` presence slot with its
trigger "relocated out of the slot" — the compiled program declares
`presenceDefaultVisible: false` (a default-OFF release toggle, matching
`boardRail`/`previewBoard`'s own W2 convention) and
`lyt-capability-registry.ts`'s own census already anticipates a
`SetupPaletteTrigger.vue` split (named, not built). Building that real
trigger/body split PLUS a fourth presence-menu entry
(`useLytPresenceMenu.ts`'s `LYT_PRESENCE_TARGETS` is currently a
hardcoded three-item tuple with its own last-remaining-panel guard logic)
is a genuine feature addition, not a boot-restoration fix. This pass
instead mounts the WHOLE existing `SetupToolPalette.vue` (trigger + body,
unchanged) at `A_setup` and forces `lytPresenceOverrides.A_setup = true`
unconditionally in App.vue — a real, working mount that preserves the
palette's pre-existing always-reachable behaviour exactly, not a stub.
The presence-menu integration is a named follow-up.

**A_engine_eval's identity slot**: the ruling's own three vocabularies are
{winrate, lead} | {pps, latency, watchdog} | {queue} — the pre-existing
identity slot (engine version + model-select) isn't named in any of the
three. Judgment call: identity stays folded into the `eval` group (it
read immediately left of winrate/scoreLead before this split), disclosed
in `ToolbarEngineMetrics.vue`'s own header rather than silently assumed.

**Four sub-panes never got their own SP_* leaf**: per the compiled
program itself (confirmed by direct read of both `.gen.ts` files), the
settings tab's interior is still ONE collapsed blackbox
(`kind: "blackbox", widget: "SP_session"`) whose `childWidgets` array
merely documents the six real sub-tab ids — it is NOT an opened
`Exclusive` node. `SettingsPane.vue` (mounted at `SP_session`) already
internally drives all six via `TabWidget`, exactly matching what the
compiled program declares. No fake decomposition was needed or
attempted here — the "give each SP_* its own region" question is a
future encoding-opening stage's work, not this one's.

## THE MECHANISM — mounted-App boot test

`frontend/tests/integration/App-boot.test.ts` — mounts the FULL `App.vue`
(same `createApp(App).use(i18n)` shape as `main.ts`), once per compiled
program:

- **Landscape**: `#split-workspace`'s `getBoundingClientRect()` stubbed
  to `0×0` (`layout-model.ts`'s own documented "not yet measured" default
  → landscape).
- **Portrait**: stubbed to `400×900` (a tall/narrow rect `deriveAxis`
  resolves to the portrait class).

Both mounts assert `wrapper.find('.reb-overlay').exists()` is `false`
(`RootErrorBoundary`'s own fallback-UI marker — the actual DOM signal the
crash produced live). Completeness is then checked directly: every
leaf/blackbox `widget` id walked out of `LYT_LANDSCAPE`/`LYT_PORTRAIT`
(mirroring `LytNode.vue`'s own recursion shape) is passed through
`lytMountingWidgetId`/`lytRegistryStatus` and asserted `not.toThrow()` —
the exact call `LytNode.vue`'s own `groups` computed makes unconditionally
for every leaf/blackbox child, including ids that only live inside a
not-currently-active tab (a single mount snapshot alone wouldn't reach
those).

Full App mount required the widest service-mocking surface any test in
this tree uses yet — the same fakes precedent (`analysis-service`,
`analysis-persistence-service`, `backend-service`, four thumbnail/card-tree
composable mocks) plus a new `getTags` spy added to
`tests/fakes/backend-service.ts` (App.vue's cold-start tag-dictionary
fetch, previously unexercised by any test), plus `installRenderEnvStubs`
(the existing render-count harness's jsdom theme-CSS-var stub — App.vue's
own descendants read `themeColor()`), plus a global `fetch` stub
(network-refused; `api-client.ts`'s own auth/resource calls degrade
gracefully on rejection, matching real offline-boot behaviour). Full App
mount proved achievable, not "genuinely impossible" — the fallback to a
narrower subtree was not needed.

### RED-at-base witness

With `lyt-widget-registry.ts`/`App.vue`/`ToolbarEngineCluster.vue`
reverted to their exact `bc08c39c` content (the new test file and the
`getTags` fake addition left in place, since the test harness itself
needs them to run at all) and the suite re-run:

```
FAIL tests/integration/App-boot.test.ts > ... > landscape: ...
AssertionError: expected true to be false
 ❯ expect(wrapper.find('.reb-overlay').exists()).toBe(false);
FAIL tests/integration/App-boot.test.ts > ... > portrait: ...
AssertionError: expected true to be false
```

with the console capturing the literal crash:

```
[RootErrorBoundary] Caught error: Error: lytMountingWidgetId: no
LYT_WIDGET_REGISTRY entry for widget id "A_setup" (classId="landscape")
— every leaf a compiled LYT program can carry must be registered
(mounted/absorbed/absent), per the roadmap's own "every unmapped
encoding leaf" disclosure requirement.
    at lytMountingWidgetId (.../lyt-widget-registry.ts:350:11)
    at ComputedRefImpl.fn (.../LytNode.vue:282:11)
```

— an exact match to the measurement wave's own live-diagnosed symptom.
The three reverted files were restored to this session's own fixed
content immediately after (from a pre-revert backup copy), and the suite
re-run green before proceeding. WITNESSED both ways.

## Screenshot witness

Isolated rig: backend `127.0.0.1:19300`, frontend dev server
`127.0.0.1:19301`, KataGo WS placeholder `19302` (pinned, never
contacted — no live engine this session). All three probed dead
(`/dev/tcp` connect refused) before use. None of the forbidden ports
(4173/5173/5174/8764/1235/1242/195xx) were touched.

- **Backend**: `backend/venv/bin/python` from the main checkout's shared
  venv (this worktree has none of its own) `-m fastapi run backend/main.py
  --host 127.0.0.1 --port 19300`, `DATABASE_URI` pointed at a `cp` of
  `backend/samples/cards.sample.db` (never the real `cards.db`).
  `QEUBO_ENABLED=false`.
- **Theme**: the DB copy's `documents` row (`key='user_workspace_01'`)
  had `profile.settings.appearance.theme` rewritten `'dark'` → `'cluster'`
  (the light-background theme — `'light'` is not a value this codebase's
  theme union accepts, per the measurement wave's own terminology
  correction, already disclosed in its report) via a direct sqlite3
  write, verified by re-reading the row after the write. Playwright's own
  `colorScheme: 'light'` context option forced the second half of the
  mandate. Both screenshots confirm `data-theme="cluster"` and
  `background-color: rgb(255, 245, 255)` live.
- **Frontend**: `vite --port 19301 --host 127.0.0.1 --strictPort` (run
  from inside `frontend/`, not via `--prefix` — a `--prefix`-relative
  `--config` path 404'd every request; running from the package root is
  what actually serves the app), `VITE_API_BASE_URL=http://127.0.0.1:19300`,
  `VITE_KATAGO_WS_URL=ws://127.0.0.1:19302` (verified-dead, unused).
  `frontend/node_modules` symlinked from the main checkout after a
  byte-identical `package-lock.json` diff (this worktree ships no
  `node_modules` of its own) — the same precedent the measurement wave
  session used.
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- nice -n
  19 node --max-old-space-size=1024 shoot.mjs`, chromium launched with
  `executablePath: '/usr/bin/chromium'` and
  `args: ['--js-flags=--max-old-space-size=1024']`, one browser instance
  per shot, closed in a `finally`. No wall-clock waits — every wait is
  `waitForSelector('#split-workspace')` / `waitForFunction(() =>
  el.children.length > 0)`, real-condition waits on the actual boot
  signal.

**Captures** (both `1920×1080` landscape and `768×1024` portrait,
filenames below, saved under this worktree's own scratch directory, not
committed — established convention for LYT sessions):

- `landscape-1920x1080.png` — `errorBoundaryPresent: false`,
  `dataTheme: "cluster"`, `bodyBackgroundColor: "rgb(255, 245, 255)"`.
  Board renders with real stones, the engine-controls button row (MINT
  CARD(S)/LEARN PATH/PLAY) visible at `A_engine_controls`, the SETUP
  trigger visible at `A_setup`, the control panel's Settings tab showing
  real "Session (UI)" content (the `SP_session` mount) including the
  presence-menu checkboxes (boardRail/previewBoard/controlPanel).
- `portrait-768x1024.png` — same `errorBoundaryPresent: false` /
  theme facts, board renders, no error boundary, portrait-class layout
  (single-column stack) confirmed visually.

Four console messages appear in both captures — a 500 on
`GET /resources/visit-distribution` and the resulting
`suggestion-color-calibration` warning, plus a 503 on the qEUBO
experiment-status probe (`QEUBO_ENABLED=false`'s own known, harmless
consequence, already named in the measurement wave's report). None of
these four are the crash this commission fixes, and none of them
involve `RootErrorBoundary` or any `LYT_WIDGET_REGISTRY` lookup — they
are pre-existing, orthogonal sample-DB-rig artifacts (the seeded DB has
no visit-distribution resource row), not touched by this change.

**Cleanup**: both server PIDs killed individually (never `pkill` by
name) — `kill <backend-pid>` / `kill <frontend-pid>`, `ps -p <pid>`
confirmed empty after each, both ports re-verified dead via `/dev/tcp`
connect-refused. The DB copy, screenshots, and `shoot.mjs` are left in
this worktree's own scratch directory (`/tmp/claude-1000/
-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/
lyt-boot-shots/`), not committed — generated/scratch, matching the
measurement wave's own established disclosure convention.

## Gates

```
$ cd frontend && npm run build
✓ 1248 modules transformed, built in 2.04s
$ echo $?
0

$ NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 \
  VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
 Test Files  256 passed | 3 skipped (259)
      Tests  3167 passed | 8 skipped (3175)
$ echo $?
0

$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest \
  research/lyt/tests -q
366 passed in 4.99s
$ echo $?
0
```

`research/lyt/` itself was not touched this session (no `.py`/`.lyt`
file edited) — the 366-pass count is untouched-green, not a
re-verification of new work.

## Test edits, individually justified

1. **`tests/unit/lyt-activity-invariance.test.ts`, 1 test rewritten**:
   `LYT_WIDGET_REGISTRY.A_engine.activityStates` no longer resolves (the
   entry it read was replaced by four new ones, all still `null` per the
   same "not swept yet" convention) — rewritten to check
   `activityStates === null` on all four successor entries
   (`A_engine_controls`/`_eval`/`_health`/`_queue`) instead of the one
   retired id. Same fact asserted (no widget nobody has swept gets a
   spurious violation invented for it), under the new ids.
2. **`tests/unit/lyt-w4-chrome.test.ts`, 1 test re-pinned**: the guard
   against dev-only affordances leaking onto `ToolbarEngineCluster.vue`
   re-pinned against `ToolbarEngineControls.vue` (its direct successor
   for the button-cluster markup this guard polices) — same two
   `not.toMatch` assertions, unchanged.
3. **`tests/unit/pointer-target-minimum-size.test.ts`, 1 file-list
   entry swapped**: the `.toolbar-btn` 24px-floor sweep's file census
   swaps `ToolbarEngineCluster.vue` → `ToolbarEngineControls.vue` (the
   rule moved verbatim with the markup) — same assertions per file,
   unchanged.
4. **`tests/integration/settings-live-opening.test.ts` /
   `tests/integration/SettingsTab-vertical-orientation.test.ts`,
   comment-only**: `settingsPane` → `` `SP_session` (formerly
   `settingsPane`) `` in header prose naming the mount target — no
   assertion changed.

No test was deleted or had an assertion removed without a replacement
covering the same fact under its new name. No test was weakened.

## Documentation audit (per CLAUDE.md's own checklist)

- `frontend/FILES.md`: updated — `ToolbarEngineCluster.vue`'s row
  replaced by `ToolbarEngineControls.vue`'s; `ToolbarEngineMetrics.vue`,
  `ToolbarAppCluster.vue`, `EngineQueueTooltip.vue`,
  `lyt-capability-registry.ts`, and `lyt-widget-registry.ts`'s own rows
  updated to describe the new disposition.
- Doc-graph (`docs/doc-graph.json`): `frontend/FILES.md` IS a tracked
  node, but this edit is content-only (no doc added/removed/renamed, no
  cross-reference changed) — per the umbrella CLAUDE.md's own rule, a
  content-only edit does not require `node tools/doc-graph/generate.mjs`
  regeneration (only leaves that one node a bucket stale until the next
  structural regen). Not regenerated this session; disclosed rather than
  silently skipped. `.claude/dispatch-reports/*` (including this file)
  are confirmed NOT tracked doc-graph nodes (checked directly against
  `docs/doc-graph.json`'s own node list).
- Work-status store (`todo` DB): not queried/updated this session — the
  commission was framed as an urgent same-session fix with its own named
  report deliverable, not a ledger-tracked work item with its own row;
  no status transition to record. (If ledger row 2346 has a corresponding
  `todo` row, updating it is the commissioner's own follow-up, not
  something this session had a row id to act against.)
- `docs/dispatch/`: swept for open items addressed to `frontend` —
  every `*-to-frontend-*` file present is named `-shipped`/`-consumed`/
  `-status`, none flagged open; not read end-to-end (out of this
  commission's own named orientation scope), named here per the
  "check for open dispatches" instruction rather than silently skipped.
- `docs/handoff-current.md` / `FEATURES.md`: not touched — this is a
  wiring-bug fix restoring previously-working user-facing capability
  (the toolbar/settings/setup surfaces already existed; this change
  makes their NEW encoding-driven positions boot instead of crashing),
  not a new or removed user-facing capability. No entry needed per
  FEATURES.md's own "materially alters a capability" bar.

## Discipline notes

- Scope held to `frontend/` plus this dispatch report — `research/lyt/`
  untouched (build+test witnessed above).
- No px used as bare reasoning currency — every dimension referenced in
  this report (0×0, 400×900, 1920×1080, 768×1024) is either a viewport
  simulation input (screen-class derivation, not a layout claim) or a
  screenshot's own pixel dimensions, not a `.lyt` encoding number.
- No wall-clock sleeps in the boot test or the screenshot script — every
  wait is a real-condition `waitForSelector`/`waitForFunction`/
  `flushPromises`.
- Ports 4173/5173/5174/8764/1235/1242/195xx never touched — this
  session's own ports (19300/19301/19302) probed dead before use and
  dead again after cleanup.
- box-shadow/transitions/blur: none introduced (this change adds no new
  CSS beyond moving existing scoped rules verbatim between files and one
  selector-list extension in App.vue's own `<style>`, all reusing
  existing design tokens).
- `frontend/node_modules` (symlinked from the main checkout, gitignored,
  confirmed via `git status` showing no entry for it) is left in place
  in this worktree for any follow-up session's convenience — operational,
  not part of the diff.

## Commit

Committed on this worktree's own branch,
`worktree-agent-a8807d74735b56db7`.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
