Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish-pass wave B2 — engine-controls menu-path realization

Commission: F2 (Connect unreachable at 1280x1024/420x880 —
`.claude/dispatch-reports/lyt-finish-pass.md` §3) + W-B1's adjacent
finding (`.engine-controls` measured 116px against its 80px reservation
at 420px width — `.claude/dispatch-reports/lyt-wB1-portrait-priority.md`
§STOP-and-report item 3).

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `088fc0c4` — exactly
the commit named in the commission. This agent's worktree started on
`worktree-agent-aba9f1f9ec838c784` at `3378806f` (a stale `main`-line
branch — `git merge-base --is-ancestor 088fc0c4 HEAD` exit 1). Working
tree was clean apart from untracked `.claude/`. Hard-reset the worktree
branch onto `origin/lyt-phase2`; re-verified `git merge-base
--is-ancestor 088fc0c4 HEAD` exit 0.

**HEAD at delivery: `f6b80ef0`.**

## 2. Orientation read (full, before any code)

`lyt-finish-pass.md`'s F2 entry, `frontend/src/state/lyt-capability-registry.ts`
(full file), `frontend/src/components/chrome/ToolbarEngineControls.vue`
(pre-change), the commissioner's capability ruling (content given
verbatim in the commission text — capabilities are DATA with
per-class-point realizations button-cluster | menu-path | popover;
menu is the ratified small-class realization; grouping into a component
petrifies layout), and `lyt-wB1-portrait-priority.md` §"the engine row"
(the full file, all three reads sections 1-9, end to end). Also read:
the umbrella `CLAUDE.md`, `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`
(all end to end), the relevant `.lyt` encoding sections
(`lengyue_landscape.lyt` "ENGINE-ROW HEIGHT RE-GROUNDING", `lengyue_portrait.lyt`'s
mirror section), `usePopoverEdgeClamp.ts`, `useFixedAnchoredPopover.ts`,
`LytPresenceMenu.vue`, `LocalePicker.vue`, `ToolbarSliderPopover.vue`,
`useElementWidth.ts` — all in full.

## 3. Threshold derivation (measured, cited — no invented numbers)

Live-measured on the isolated rig (Playwright, `.engine-controls`'s own
buttons at 1920x1080, both natural and clone-measured alternate labels):

| Button | Natural width | Alt-label width (worse) |
|---|---|---|
| Mint Card(s) | 105.625px | — (no alt label) |
| Learn Path | 90.015625px | — |
| Play | 43.21875px | — |
| Match / Stop Match | 51.015625px | **90.015625px** (Stop Match) |
| Connect / Disconnect | 66.609375px | **90.015625px** (Disconnect) |

Gap: `--space-tight` = 4px (live-confirmed via `getComputedStyle`).
Row height: 24px (`.toolbar-btn { min-height: 24px }`, live-confirmed
single-line). These match the `.lyt` encoding's own already-cited "3
rows × 24 + 2 gaps × 4 = 80" derivation exactly.

Greedy sequential flex-wrap simulation (CSS Flexbox §9.3's own
line-assignment: pack in DOM order until the next item doesn't fit,
then start a new row — verified to match real Chromium flex-wrap
behaviour by cross-checking against live-measured row counts at 1920/
1280/420 below) over the worst-case (Disconnect/Stop Match) widths
gives the exact threshold: **184.03125px** column width is where 4 rows
collapses to 3 (`90.015625 + 4 + 90.015625 = 184.03125`, the last two
items' own row). Below that width the cluster needs 4+ rows (108px+),
exceeding the 80px reservation.

**This worst-case table is NOT the runtime decision mechanism.** Its
own threshold (184.03px) is ABOVE 1920x1080's live column width
(150.5px) — using it as the runtime driver would force `menu-path`
unconditionally at 1920/2560, contradicting the commission's own
"cluster form, byte-comparable rendering to today" requirement at
those two sizes. The runtime composable instead measures the REAL,
currently-rendered buttons (a permanently-mounted hidden shadow clone
carrying the same reactive labels) — this reflects 1920's ACTUAL
current-state fit (3 rows, 80px, exact) rather than a hypothetical
worst case, and, as a byproduct, would also correctly protect a
1920x1080 session that connects and starts a match (wider labels) —
disclosed as engine-gated/unjudged (§8), not screenshot-witnessed.

## 4. Fix landed

**New files:**
- `frontend/src/state/engine-controls-realization.ts` — pure
  `computeWrappedRowCount` / `computeClusterNeededHeightPx` /
  `resolveEngineControlsRealization`, the `80px` reservation constant
  (cited from `lyt-layout.gen.ts` path "2.0" / `lyt-layout-portrait.gen.ts`
  path "4.0"), and the worst-case button-width table (documentation/
  test fixture only, per §3).
- `frontend/src/composables/chrome/useEngineControlsRealization.ts` —
  Vue wiring: `useElementWidth` (reused, not re-implemented — ADR-0012
  P1) for the live column width; a hidden shadow clone measured on
  mount and on every label change (`watch(labelsKey, ..., {flush:
  'post'})`) for the live button/row-height/gap facts; a `computed
  form` combining both through the pure module.
- `frontend/src/composables/chrome/useClickTogglePopover.ts` —
  generalizes the click/outside-click/Escape + `useFixedAnchoredPopover`
  idiom `LocalePicker.vue`/`LytPresenceMenu.vue` each hand-author
  inline (a third near-identical copy crossing the ADR-0012 P1
  threshold). Deliberately **not** retrofitted into those two
  pre-existing components — out of this commission's own scope; flagged
  in §9 as a follow-up worth doing.

**Modified:** `ToolbarEngineControls.vue` — `v-if="form === 'button-cluster'"`
renders the unchanged five-button row (byte-identical markup/classes to
before); `v-else` renders a compact `.engine-controls-trigger` button
(reuses `.toolbar-btn`, `LocalePicker.vue`'s `▾` caret idiom) opening a
`role="menu"` popover (via `useClickTogglePopover`, `align: 'right'`,
`position: fixed` — the SAME clip-ancestor-escape `ToolbarSliderPopover`/
`PboPopover`/`LocalePicker` already use for `.lyt-toolbar-strip`'s
`overflow-y: auto`) listing all five capabilities as `role="menuitem"`
buttons, each wired to the SAME `emit(...)` the cluster form uses. A
test-only `forceForm` prop (disclosed in the component's own header)
lets a jsdom-tier test force the menu-path branch deterministically
(jsdom has no real flex layout to drive live measurement).

`frontend/src/locales/en.json`: added `toolbar.engineControlsMenu`
("Engine") and `toolbar.engineControlsMenuTooltip` — English only,
matching the existing precedent that `toolbar.learnPath`/`toolbar.play`
are also English-only (vue-i18n falls back to `en`, `i18n/index.ts:67`).

`frontend/FILES.md`: updated `ToolbarEngineControls.vue`'s entry, added
the three new files. Content-only edit (no doc added/removed/renamed,
no new cross-reference edge) — per the umbrella CLAUDE.md's own carve-out
this does not require a doc-graph regen (`frontend/FILES.md` is itself a
tracked node, `docs/doc-graph.json` confirmed, but only structural edits
need `node tools/doc-graph/generate.mjs`).

## 5. Per-size realized form + Connect hit-test (screenshot-witnessed)

Isolated rig: ports 19520 (backend)/19521 (frontend)/19522 (KataGo WS,
unused), each verified dead via a Python `socket.connect_ex` probe
before use and after teardown. Backend: main checkout's venv
(`/home/bork/w/omega/backend/venv/bin/python -m fastapi run`), a
**copy** of `backend/samples/cards.sample.db` (never opened the real
`cards.db`), `QEUBO_ENABLED=false`. Frontend: `vite --port 19521
--strictPort`, `VITE_API_BASE_URL=http://127.0.0.1:19520`,
`VITE_KATAGO_WS_URL=ws://127.0.0.1:19522` (never contacted — engine
dead-pinned throughout, matching every prior LYT pass's posture).
`frontend/node_modules` symlinked from the main checkout after
`diff`-confirming `package-lock.json` identical. Theme seeded
`'cluster'` via a direct SQLite `json_set` on the rig DB copy's
`documents.data` (`user_workspace_01` row, `profile.settings.appearance.theme`),
same key the finish-pass report used; verified `data-theme="cluster"`
resolved at runtime for every capture. Playwright: `systemd-run --user
--scope -p MemoryMax=4G -- nice -n 19 node --max-old-space-size=1024`,
chromium at `/usr/bin/chromium` with `--js-flags=--max-old-space-size=1024`,
`colorScheme: 'light'` forced, one browser instance closed in `finally`.
No wall-clock waits — every wait is `waitForSelector`/`waitForFunction`
on a real DOM condition (theme attribute, engine-controls mount, menu
mount). None of 4173/5173/5174/8764/1235/1242/195xx touched (verified
by process-list inspection before and after this pass; the pre-existing
processes on 5174/8764 found in that inspection belong to other,
independent sessions, untouched by this one). Rig teardown re-verified
all three of 19520/19521/19522 dead afterward.

| Viewport | Realized form | Connect hit-test | Screenshot(s) |
|---|---|---|---|
| **1280x1024** | **menu-path** (column 107.25px; live-measured natural buttons need 4 rows/108px > 80px reservation) | `reachable: true`, `hitTag: BUTTON.toolbar-btn`, text `"Connect"`, rect `757.8,173,142×24` — inside the menu, itself unclipped by `.lyt-toolbar-strip` (menu rect `748.8,52,160×154` vs strip rect `839,0,107.25×80` — the menu's `position: fixed` geometry is independent of and unconstrained by the strip's own small box) | `vp1280x1024-01-initial.png`, `vp1280x1024-02-menu-open.png` |
| **420x880** | **menu-path** (column 102px; natural buttons need 4 rows/108-116px, matching W-B1's own 116px finding) | `reachable: true`, text `"Connect"`, rect `13,821,142×24` | `vp420x880-01-initial.png`, `vp420x880-02-menu-open.png` |
| **1920x1080** | **button-cluster** (column 150.5px; natural buttons fit 3 rows/80px exactly) | `reachable: true`, `hitTag: BUTTON.toolbar-btn`, text `"Connect"`, rect `1361.0,56,66.6×24` — direct hit, no menu involved | `vp1920x1080-01-initial.png` |
| **2560x1440** | **button-cluster** (column 201.75px; natural buttons fit 2 rows/52px) | `reachable: true`, rect `1843.2,42,66.6×24` | `vp2560x1440-01-initial.png` |

Every menu-form capture shows all five items — `MINT CARD(S)`, `LEARN
PATH`, `PLAY`, `MATCH`, `CONNECT` — rendered top-to-bottom inside an
opaque, bordered popover, matching the DOM-level `menuItems` list
captured programmatically at both 1280 and 420. No console errors at
any of the four sizes. `.engine-controls`'s own measured height at
1920/2560 (`80px`/`52px`) never exceeds `.lyt-toolbar-strip`'s own
80px row (`overflowsStrip: false` both), confirming the cluster form is
genuinely unchanged, not merely visually similar. All six screenshots
under `…/scratchpad/wB2-rig/shots/` (scratch, not committed —
established LYT convention).

## 6. Every capability reachable in both forms

`ToolbarEngineControls.vue`'s five `emit(...)` calls
(`mint-card`/`open-learn-path`/`open-play`/`open-match`|`stop-match`/
`toggle-engine`) are wired identically from both templates — verified
by direct read (no logic duplicated; only the surrounding markup
differs between the two branches, which is the realization-kind
difference the capability registry's own IR exists to express) and by
the integration test (§7) driving all five menu items and asserting
each emits the same event the cluster form does.

## 7. Gates

| Gate | Result |
|---|---|
| `npx eslint .` | **0 errors, 0 warnings** |
| `npm run build` (`vue-tsc -b && vite build`) | **exit 0** |
| `npm run test:run` | **exit 0** — 3267 passed, 8 skipped (this pass's own delta: +23 — 17 unit + 6 integration; the wave's starting-point total on `088fc0c4` was not independently re-counted before this pass's own edits, so the exact baseline-vs-delta reconciliation against the commission's cited "3241" is not separately verified — the pass's own additions are individually enumerated and every one is additive, no existing test's expectation changed) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **exit 0** — 5 passed |
| `research/lyt` diff | **empty** — `git status --short` shows no `research/lyt` path; confirmed no model-side fact needed changing (the `80px` reservation itself was not in question — only its realization was) |
| Screenshot witness | 1280x1024, 420x880 (menu-path, Connect hit-tested), 1920x1080, 2560x1440 (button-cluster, byte-comparable) — §5 |

## 8. Engine-gated / unjudged

The 1920x1080-with-connected-and-matching-state overflow risk named in
§3 (the live-measurement mechanism handles it structurally, but it was
never screenshot-witnessed — the rig's engine port was dead-pinned
throughout, matching every prior LYT pass's own posture, per the
commission's own "engine dead-pin acceptable" allowance). Not a defect
this pass introduces or leaves open in the sense F2 was open — the
narrow-column case F2 named is closed and witnessed; this is a
disclosed, structurally-covered-but-unwitnessed adjacent case.

## 9. STOP-and-report

1. **`useClickTogglePopover.ts` is a genuine extraction opportunity
   left unfinished.** Three near-identical inline click/outside-click/
   Escape + fixed-anchor implementations now exist in this codebase
   (`LocalePicker.vue`, `LytPresenceMenu.vue`, and this wave's own new
   composable, which only `ToolbarEngineControls.vue` currently
   consumes). Retrofitting the first two to use the shared composable
   is real, in-scope-adjacent cleanup this pass deliberately did not
   attempt (F2 + the reservation-overflow only) — named here rather
   than silently left for the next person to rediscover.
2. **Test-count reconciliation against the commission's cited "3241
   baseline" is not independently re-verified.** This pass's own delta
   (17 unit + 6 integration = 23, all additive) is exact; the
   pre-existing total on `088fc0c4` before this pass's edits was not
   separately re-run to confirm it was exactly 3241 (the final total,
   3267, is 26 more than 3241 + 23 would predict by 3 — plausibly other
   test files landed on `lyt-phase2` between the commission's own
   citation and this pass's base commit, not investigated further).
3. **Work-status store (`todo` DB) not updated by this pass.** This
   report closes F2 and the W-B1-flagged adjacent finding from a code
   perspective; per the umbrella `CLAUDE.md`'s own discipline a
   corresponding status transition belongs in the `todo` Postgres
   store, not attempted here (no connection credentials were in view
   for this session, and the commission's own deliverable list names
   the dispatch report, not a DB write) — flagged for the commissioner
   to close out rather than silently skipped.
4. **`frontend/FILES.md`'s doc-graph node was not regenerated.** Per
   the umbrella discipline's own carve-out this is correct for a
   content-only edit (no doc added/removed/renamed, no new
   cross-reference edge) — named so the omission reads as a disclosed
   judgment call, not an oversight.

## 10. 2026-08-13 — state-invariance correction (closes review MAJOR finding)

Commission: close the MAJOR finding in
`.claude/dispatch-reports/lyt-wB2-controls-menu-review.md` (copied into
this worktree's own `.claude/dispatch-reports/` alongside this report,
per the commissioner's own note that the pair should travel together).
Delivered on `worktree-agent-aba9f1f9ec838c784`, atop fix commit
`f6b80ef0` / docs commit `93d907c7`.

### 10.1 The defect, restated precisely

`useEngineControlsRealization` measured the CURRENT, state-dependent
labels (Connect/Disconnect, Match/Stop Match) rather than a worst case.
The review traced the exact break: at 1920x1080's own 150.5px column,
idle (Match+Connect) fits 3 rows/80px exactly, but connected+match-
running (Stop Match+Disconnect) needs 4 rows/108px — so starting a
match while connected flips `button-cluster` to `menu-path` mid-
interaction, right under the user's pointer.

### 10.2 The fix

`ToolbarEngineControls.vue`'s hidden shadow clone now renders BOTH
label variants for every state-varying button
(`toolbar.match`/`toolbar.stopMatch`, `toolbar.connect`/
`toolbar.disconnect`) **unconditionally** — not gated on
`isMatchRunning`/`isConnected` — each tagged `data-slot="match"` /
`data-slot="engine"` naming which visible-cluster slot it stands in
for. `useEngineControlsRealization`'s `measureShadow` (rewritten)
groups the shadow's own buttons by `data-slot` and keeps the WIDER
measured width per slot. `labelsKey` — the sole trigger for
re-measurement — is now `locale.value` alone; no engine/match state
read reaches the measurement path at all. `form` is a pure function of
measured column width vs. the ACTIVE LOCALE's own worst-case label set
— unrepresentable-by-construction, not merely hardened, against a
state-driven flip: there is no longer a state input for the mechanism
to react to. Full rationale, the worked 1920x1080 arithmetic, and the
composability argument with the parallel 184px-controls-floor wave are
in `useEngineControlsRealization.ts`'s own header (the load-bearing
account) and mirrored in `ToolbarEngineControls.vue`'s header.

The worst-case widths are **derived live from the component's own
`t()` calls** (the shadow renders through the same i18n catalog the
visible buttons use), not a hand-maintained string table — so the
mechanism stays honest under locale changes without a second
translation surface to keep in sync. `ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX`
in `state/engine-controls-realization.ts` remains as a pinned unit-test
fixture (its header comment rewritten to match this correction) but was
never consulted by the runtime path directly, before or after this fix.

### 10.3 Consequence, stated as the commission required — per size, with witness status

| Size | Column | Worst-case arithmetic | Realized form (this fix alone) | Witness |
|---|---|---|---|---|
| 1280x1024 | 107.25px | 5 rows / 136px > 80px | **menu-path** | Computed (pinned pre-existing unit-test fixture, unchanged by this fix — `tests/unit/state/engine-controls-realization.test.ts`); Connect reachable via the menu form, unchanged code path from the original F2 delivery, re-confirmed by `ToolbarEngineControls-menu-capabilities.test.ts`'s Connect hit-test, itself re-run green this pass. **Not re-witnessed via a live browser/Playwright rig this pass** — the original delivery's own screenshot witness (`.claude/dispatch-reports/lyt-wB2-controls-menu.md` §5) already covers this exact column at the pre-fix state, and this fix does not change the pinned arithmetic at 1280 (both pre- and post-fix use the worst-case numbers at this narrow a column — the review never disputed 1280/420, only 1920).
| 420x880 | 102px | 5 rows / 136px > 80px | **menu-path** | Same as 1280 — computed/pinned, not re-screenshotted this pass. |
| 1920x1080 | 150.5px | 4 rows / 108px > 80px | **menu-path** — this is the deliberate, disclosed consequence: the fix selects `menu-path` at 1920x1080 EVEN AT IDLE now, not only once connected+matching. This is the honest tradeoff named in the commission: state-invariance is bought by giving up idle-state cluster fidelity at this column, until a wider reservation lands. | Computed (new pinned unit test + a real-component-mount regression test, `tests/integration/ToolbarEngineControls-state-invariance.test.ts`, both green). **Not witnessed via a live browser/Playwright rig** — see §10.4 for the disclosed narrowing. |
| 2560x1440 | 201.75px | 3 rows / 80px == 80px (equality — not exceeded) | **button-cluster**, unchanged | Computed (worst-case arithmetic re-derived by hand in this pass, matching the existing pinned unit-test fixtures for this table); consistent with the original delivery's own live screenshot witness at this size (§5), which this fix does not disturb (2560's worst-case need sits exactly at the reservation, same as the original delivery's own natural-width measurement — coincidence worth flagging, not double-checked against real layout this pass). |

**State-invariance witness (the review's exact case, and the general
property):** `tests/integration/ToolbarEngineControls-state-invariance.test.ts`
mounts the REAL component (not `forceForm`) with `getBoundingClientRect`/
`getComputedStyle` stubbed to the codebase's own cited live-measured
widths, at the 1920x1080 column, and asserts the realized form is
IDENTICAL across: idle, connected-only, match-running-only, and
connected+match-running (the review's exact traced case) — all four
resolve to `menu-path`, matching §10.3's arithmetic. A fifth test drives
a SINGLE mounted instance through idle → connect → start-match in
place (mirroring the literal user action sequence the review named) and
asserts `form` never changes. **Mutation-verified, not merely
green-by-construction**: this agent temporarily reverted the shadow
template and `labelsKey` to their pre-fix (state-dependent) shape and
confirmed 3 of the 5 new tests go red with exactly the traced flip
(`button-cluster` at idle/connected-only vs. `menu-path` once
match-running), then restored the fix and re-confirmed all 5 pass —
this pass's own verification step, not something the delivered code
runs itself.

### 10.4 Disclosed narrowing: no live-rig re-verification this pass

The commission asked to "rig re-verify if feasible" the four witness
sizes. This pass did **not** stand up a live Playwright/Chromium rig —
the state-invariance property and all four sizes' realized forms are
verified via (a) the pure-logic unit-test tier (exact arithmetic,
matching the codebase's own already-cited live-measured widths) and (b)
a real Vue-component-mount integration test with DOM-measurement APIs
stubbed to those same cited numbers, not via fresh screenshots. This is
a narrower verification tier than the original delivery's own §5 (which
did run a live rig with Playwright screenshots at all four sizes). The
judgment call: jsdom's stub-based tests exercise the actual production
code path (`ToolbarEngineControls.vue` → `useEngineControlsRealization`
→ `state/engine-controls-realization.ts`) end-to-end and were
mutation-verified to catch the exact regression class the review named
(§10.3's witness paragraph); a live rig would additionally confirm real
Chromium flex-wrap layout matches the hand-derived arithmetic, which
this pass leans on the ORIGINAL delivery's own live-rig confirmation
for (its own §3 cross-check: "verified to match real Chromium flex-wrap
behaviour by cross-checking against live-measured row counts at
1920/1280/420"). Flagged here as a narrowing rather than silently
skipped, per the "asking before assuming" / disclosed-narrowing
discipline; the commissioner should treat 1280/420/2560's forms as
carried over from the original delivery's own live witness (unchanged
by this fix) and 1920's new form as computed-and-mutation-tested but
not freshly screenshot-witnessed.

### 10.5 Composition with the parallel 184px-controls-floor wave

No coordination was added or required. `form` is computed purely from
measured column width vs. worst-case cluster need
(`resolveEngineControlsRealization(neededHeightPx, reservedHeightPx)`);
nothing in this fix reads or assumes the current `80px` reservation
value beyond the one already-cited constant
(`A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX`). When the parallel wave widens
`A_engine_controls`'s own reservation/column (the disclosed 184px
floor), 1920x1080's column widens past the worst-case need (184.03125px
threshold, per §3's own derivation) and `button-cluster` realizes there
again automatically, with no further code change on this side.

### 10.6 Gates (this pass, `frontend/`)

| Gate | Result |
|---|---|
| `npx eslint .` | **exit 0** — 0 errors, 0 warnings |
| `npm run build` (`vue-tsc -b && vite build`) | **exit 0** — 1252 modules |
| `npm run test:run` | **exit 0** — 3273 passed, 8 skipped (delta from the review's own re-run baseline of 3267: +6 — 5 new state-invariance integration tests, 1 new unit-test block; two existing tests' EXPECTATIONS were adjusted with individual justification inline in the test files, not silently changed — see `tests/unit/state/engine-controls-realization.test.ts` and `tests/integration/ToolbarEngineControls-menu-capabilities.test.ts`) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **exit 0** — 5 passed |

### 10.7 Files touched this pass

- `frontend/src/state/engine-controls-realization.ts` — header comment
  rewrite only (the pure algorithm, the reservation constant, and the
  worst-case table's own numbers are unchanged; only the table's
  documented relationship to the runtime mechanism changed).
- `frontend/src/composables/chrome/useEngineControlsRealization.ts` —
  `measureShadow` rewritten to group-by-`data-slot`/take-max; header
  rewritten with the state-invariance rationale, the honest consequence
  paragraph, and the composability argument.
- `frontend/src/components/chrome/ToolbarEngineControls.vue` — shadow
  template now renders 7 buttons (both label variants for the two
  state-varying slots, `data-slot`-tagged) instead of 5; `labelsKey`
  simplified to `locale.value`; header addendum.
- `frontend/tests/unit/state/engine-controls-realization.test.ts` — one
  pre-existing test's expectation corrected (1920x1080 worst-case now
  correctly selects `menu-path`, with the retirement of its old framing
  individually justified inline) plus a new state-invariance describe
  block.
- `frontend/tests/integration/ToolbarEngineControls-menu-capabilities.test.ts` —
  two button-count assertions updated (5→7 shadow buttons, 10→12 total)
  with inline justification; no other assertion touched.
- `frontend/tests/integration/ToolbarEngineControls-state-invariance.test.ts`
  (new) — the regression-test suite described in §10.3.
- This report and the copied review report
  (`lyt-wB2-controls-menu-review.md`, now present in this worktree's
  own `.claude/dispatch-reports/`).

`frontend/FILES.md` was not touched — no new `src/` file was added (the
new file this pass added is a test file, out of that map's scope per
`frontend/CLAUDE.md`'s "File map" section, which covers `src/` only).
No doc-graph-structural change (no doc added/removed/renamed, no new
cross-reference edge) — content-only, per the umbrella CLAUDE.md's own
carve-out.

### 10.8 STOP-and-report (carried forward, not re-attempted this pass)

Items 1, 2, and 4 from §9 above are unchanged by this pass (not
re-investigated). Item 3 (work-status store not updated) — this pass
DID confirm `psql -h 192.168.122.1 -d todo` connectivity is available
in this environment (unlike the original delivery's own session), but
found no existing `todo` DB item referencing this wave (`title ilike
'%wB2%'`, `'%controls-menu%'`, `'%engine-controls%'`, and `'%lyt%'` all
return zero rows) — so there is no existing open item for this pass to
close, and this commission's own deliverable list (fix + tests + gates
+ this report + the copied review report) does not name creating a new
work-status item. Flagged here rather than silently assumed out of
scope: if the commissioner tracks this wave's status elsewhere (a
title/id this search didn't match, or a row predating this DB's current
schema), the closure should be applied there.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
