Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT engine-metrics overlap fix

Commission: the engine-metrics overlap fix (ledger row 2372) — with a
live engine connected, the eval group ({winrate, lead}) rendered 534px
of natural content into a 139px allotment and the health group ({pps,
latency, watchdog}) 236px into 139px, producing visible character-level
text overlap. Base `8192af9a` on `lyt-phase2`.

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `8192af9a` — exactly
the commission's named base. The worktree's own default branch
(`worktree-agent-a40c6e99f7f543fdb`) resolved to `3378806f`, an
unrelated, older mainline point (`git merge-base --is-ancestor 8192af9a
HEAD` failed against it: not an ancestor). `git status --short` showed
only the harness's own untracked `.claude/` directory — nothing of
value to stash. Hard-reset: `git reset --hard origin/lyt-phase2`. `HEAD`
afterward is `8192af9a` exactly, re-verified via `git log --oneline -1`.

## 2. Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-engine-measurement.md` (full, 522 lines —
the live measurement pass that found this defect, its Measurement 2 and
the "Encoding-contradiction findings (a)" section are this fix's direct
mandate), `frontend/src/components/chrome/ToolbarEngineMetrics.vue` (the
group-parameterised component this fix edits, full, before any edit),
`frontend/src/components/chrome/EngineQueueTooltip.vue` (the existing
compact-with-tooltip idiom named as the pattern to follow, full),
`.claude/dispatch-reports/lyt-m2-b2b-ruling-census.md` (full, 461 lines —
the three-vocabulary engine-status decomposition ruling (row 2073) that
grounds the `eval`/`health`/`queue` split this fix's groups are named
after, and its own disclosed judgment call that identity — VERSION/MODEL —
rides inside `eval` rather than a fifth leaf). The umbrella `CLAUDE.md`
and `frontend/CLAUDE.md` (both read end to end this session — full text
confirmed via the harness's own system-reminder injections). Also read
in full as they became load-bearing: `frontend/src/components/chrome/
EngineModelSelect.vue` (the interactive SELECTOR-mode `<select>` that
turned out to be the genuinely un-compactable piece of the eval group),
`frontend/src/composables/chrome/useHoverPopover.ts` and
`useFixedAnchoredPopover.ts` (the two composables the queue idiom is
built from), `frontend/tests/CLAUDE.md` (test-authoring discipline),
`frontend/tests/integration/ToolbarEngineControls-state-invariance.test.ts`
(the precedent for stubbing `getBoundingClientRect` with real
live-measured pixel widths in a Vitest/jsdom test, which this
commission's own new test file follows).

## 3. The fix

**Diagnosis, confirmed against the measurement report's own numbers.**
The `eval` group's 534px natural need is NOT just winrate+lead (which
are already short numeric strings) — it includes the identity block
(VERSION label/value + the `EngineModelSelect` component, itself up to
~225px alone per the measurement report's live-measured `x=1641, w=175`
select). `health`'s 236px is PPS+LATENCY+WATCHDOG with their full-word
labels ("PPS"/"LATENCY"/"WATCHDOG"). Both groups genuinely rendered more
content than any 139px column could show without overlap — confirmed
this was not merely a solver-model artifact (per the measurement
report's own §"Encoding-contradiction findings (a)").

**Realization chosen.** Following `EngineQueueTooltip.vue`'s established
idiom exactly: each group now renders ONE compact, always-visible badge
(a `.metric` with a short label and a tight paired value) plus a
hover-triggered `.metrics-popover` (same `useHoverPopover` +
`useFixedAnchoredPopover` composables the queue badge uses) carrying
full fidelity:

- **`eval`**: the badge shows `EVAL` + `{winrate}/{scoreLead}` (e.g.
  `"48.0%/-1.5"`) — winrate and lead are never truncated; they're
  already short, so the "compact paired form" the commission's own
  framing suggested is literally the SAME full-precision string, just
  without individual per-field labels inline. The popover carries
  VERSION (full, plus its existing `title`-carried JSON tooltip),
  MODEL (the real, interactive `<EngineModelSelect>` — mounted only
  while the popover is open, since a functional `<select>` can't be
  represented by ellipsis or a shortened string the way a number can),
  and WINRATE/LEAD restated with their original per-field tooltips.
- **`health`**: the badge shows `HEALTH` + `{pps}pps` + the watchdog dot
  (kept inline — cheap in width, a glanceable status indicator not
  worth hiding). The popover carries full PPS, full LATENCY (with its
  `ms` unit, never shown inline at all), and the WATCHDOG dot restated.

**Width verified BEFORE wiring, not guessed.** An isolated static-HTML
Playwright probe (`Courier New`/monospace, the theme's real
`--space-tight`/`--space-medium`/`--text-tiny`/`--text-emphasis` tokens,
no dev server, no ports touched) measured the real worst-case rendered
width of each candidate compact form:

| Group | worst-case content | measured width | allotment | slack |
|---|---|---|---|---|
| eval | `EVAL` + `"100.0%/-999.9"` | 119.94px | 139px | 19px / ~14% |
| health | `HEALTH` + `"9999pps"` + dot | 107.09px | 139px | 32px / ~23% |

A `SYS` (shorter) label candidate for health was also probed (90.36px)
but `HEALTH` was chosen — it still leaves comfortable margin and reads
clearer. Both numbers are cited in the component's own header comment.

**What did NOT change.** No `.lyt` encoding file was touched — the
eval/health floor-or-compact-form question at the model level remains
the filed open design item the commission named out of scope. No value
was truncated or lost: winrate/scoreLead/pps/latency/watchdog all
render at full precision somewhere (inline for the ones that fit,
popover for VERSION/MODEL/full-LATENCY).

## 4. Files changed

- `frontend/src/components/chrome/ToolbarEngineMetrics.vue` — the fix
  itself: two hover-popover pairs wired via `useHoverPopover` +
  `useFixedAnchoredPopover`; template rewritten per-group as described
  above; `<style scoped>` rewritten (the old per-field `ch` min-width
  envelope rules for winrate/scoreLead/pps/latency removed — no longer
  applicable to the new compact-badge shape — replaced by the
  `.metrics-popover`/`.popover-row`/`.popover-lbl`/`.popover-val`
  styling, duplicated from `EngineQueueTooltip.vue`'s own
  `.queue-popover` rather than shared, per that file's own header note
  on why `<style scoped>` doesn't cross component boundaries and a
  two-call-site slot-threading composable would be more machinery than
  it saves).
- `frontend/src/locales/{en,ja,ko,zh-CN}.json` — three new keys:
  `toolbar.metric.evalSummary` ("EVAL", kept as a Latin technical
  acronym in every locale, matching the existing PPS/PBO precedent),
  `toolbar.metric.healthSummary` ("HEALTH"/"状態"/"상태"/"状态"),
  `toolbar.metric.ppsValue` (`"{n}pps"`, unit suffix kept Latin in every
  locale, matching the existing `latencyValue` `"{ms}ms"` precedent).
- `frontend/tests/integration/ToolbarEngineMetrics-overlap-fix.test.ts`
  (NEW) — the commissioned regression coverage: renders each group at
  the allotted 139px column with worst-case-shaped live values, asserts
  no overflow via stubbed `getBoundingClientRect` pinned to the same
  real-measured widths the component's own header cites (same idiom as
  `ToolbarEngineControls-state-invariance.test.ts`), and asserts
  tooltip/popover content completeness (VERSION, the real interactive
  MODEL `<select>` with its option list, full WINRATE/LEAD, full PPS,
  full LATENCY with unit, the WATCHDOG dot). 5 tests, all passing.
- `frontend/tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts`
  — updated, not weakened: `EngineModelSelect` now mounts only inside
  the eval popover (not unconditionally), so both existing tests open
  the popover (`mouseenter` on `.eval-summary`) before exercising their
  tick-coupling assertions, so the guard still exercises a real mounted
  instance rather than trivially passing because the child never
  mounted. Same 2 tests, same assertions, updated setup only.
- `frontend/tests/unit/lyt-w4-chrome.test.ts` — the W4 item 2
  "envelope-reserved metric cells" block re-pinned: the four
  per-field-`ch`-min-width assertions this fix's own CSS rewrite
  retired are replaced with assertions matching the new shape (the
  compact classes declare `white-space: nowrap`, the shared `.m-val`
  `text-align: right` growth-stability rule still holds, the old
  per-field `ch` envelope rules are confirmed genuinely gone rather
  than merely unused, and the queue-idiom markup shape — trigger plus
  `.metrics-popover` — is present). 4 tests replacing the prior 5;
  net −1 test in this file, +5 in the new overlap-fix test file.

## 5. Gates — literal exit codes, from `frontend/`

```
$ npx eslint .
$ echo $?
0

$ npm run build
✓ built in 2.00s
$ echo $?
0

$ npm run test:run
 Test Files  261 passed | 3 skipped (264)
      Tests  3277 passed | 8 skipped (3285)
$ echo $?
0
```

3277 = 3273 baseline + net delta from this commission's own test edits
(+5 new in `ToolbarEngineMetrics-overlap-fix.test.ts`, −1 net in
`lyt-w4-chrome.test.ts`'s re-pinned block; the render-count file's own
test count is unchanged, 2 before and after) — arithmetic reconciled,
not merely observed.

```
$ npx vitest run tests/integration/App-boot.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
$ echo $?
0
```

## 6. Rig witness — real engine, connected

**Isolation.** Ports `19120` (backend)/`19121` (frontend), both probed
dead before use (`Connection refused`, rc=1 each). Engine reachability
probed separately: `ws://192.168.122.68:1235` → TCP connect rc=0. Never
touched 4173/5173/5174/8764/1235-local/1242/195xx or the live backend.
Backend DB: `backend/samples/cards.sample.db` copied to this session's
own scratch directory, never the real `cards.db`; the copy's
`documents.data` row (`user_workspace_01`) edited via Python
`json.loads`/`json.dumps` (not hand-edited SQL) — `profile.settings
.appearance.theme` `'dark'` → `'cluster'`, `profile.settings.engine
.katago.url` → `'ws://192.168.122.68:1235'`. `frontend/node_modules` and
`backend/venv` symlinked from the main checkout after confirming
`package-lock.json`/`requirements.txt` byte-identical (this worktree
shipped with neither directory — same precedent the prior measurement
session recorded). Backend launched via `systemd-run --user --scope -p
MemoryMax=4G`, `DATABASE_URI=sqlite+aiosqlite:///<scratch-copy>`;
frontend via the same pattern, `VITE_API_BASE_URL`/`VITE_KATAGO_WS_URL`
pointed at the isolated backend/the real engine respectively. Every
Playwright launch went through `systemd-run --user --scope -p
MemoryMax=2G -- nice -n 19 node --max-old-space-size=1024 <script>`,
Chromium via `executablePath: '/usr/bin/chromium'`,
`--js-flags=--max-old-space-size=1024`.

**A rig-local defect caught and disclosed, not hidden.** The engine
metrics leaves' Vue slot names (`#leaf-A_engine_eval` etc., App.vue's
own `<template #leaf-A_engine_eval>`) are NOT rendered as real DOM ids —
a debug probe confirmed every ancestor of `.eval-summary` up through
`.lyt-node-slot` carries an empty `id` attribute (`LytNode.vue`'s
`domId()` only stamps a real id for specific registry-named anchors,
not every leaf slot). Since exactly one `.eval-summary`/`.health-summary`/
`.queue-metric` exists on the page at a time, this script uses the bare
class selectors instead — not a defect in the app, a rig-selector
correction, named here per the established convention (the prior
measurement pass's own `#control-panel` vs.
`#control-panel-popover-mount` trap is the same class of thing). A
second rig trap, also caught: `.engine-controls`'s own
state-invariant "measurement shadow" block (mounted unconditionally,
aria-hidden, renders BOTH Connect and Disconnect labels regardless of
actual state — `useEngineControlsRealization`'s own worst-case-fit
mechanism) means a naive `textContent.includes('Disconnect')` check
against the whole `.engine-controls` container is satisfied trivially
before any real connection happens; the fix reads the real, visible
button's own `.btn-connected` class instead (`.engine-controls >
button.toolbar-btn.btn-connected`, a `>` direct-child selector that
excludes the shadow block's own buttons). A third: at 1920×1080 with
this build, the control panel renders as a summoned popover, not
in-flow (`#control-panel-summon-btn` present, `#control-panel` itself a
1px anchor) — the exact trap the prior measurement session's own report
names; the script summons it (`page.click('#control-panel-summon-btn')`,
wait for `aria-expanded="true"`) before looking for the Analysis tab.

**Flow driven.** Loaded `/home/bork/sgf_validation/1986-11-06c.sgf`
(the same 245-move real game the measurement pass used) via a real
`filechooser` event (the transient `<input type=file>`
`useSgfLoader.ts` creates is never appended to the DOM, so
`page.waitForEvent('filechooser')` is the correct hook, not
`page.locator('input[type=file]')`). Connected to the live engine
(model defaulted to `"14"`, confirmed: `SELECTOR`-mode `<select>`'s own
`inputValue()` read `"14"` inside the popover, 5 options total).
Navigated Analysis → Basic, set Visits to 40, drag-selected the full
range on the timeline rugplot, clicked "Analyse Selection", waited for
a real condition (an Interval Summary `.value-cell` losing its "no
data" placeholder) rather than a sleep.

**Witnessed, live, connected + analyzed, 1920×1080:**

```
eval rect:   { x: 1495, width: 101.2, right: 1596.2 }
health rect: { x: 1638, width: 89.0,  right: 1727.0 }
queue rect:  { x: 1781, width: 139,   right: 1920 }
overlap eval/health: false
overlap health/queue: false
eval-summary-val text: "48.0%/-1.5"
health-summary-val text: "43pps"
```

Eval's right edge (1596.2) sits ~42px clear of health's left edge
(1638); health's right edge (1727.0) sits ~54px clear of queue's left
edge (1781) — genuine margin, not a knife-edge fit, at REAL rendered
widths (101–139px, well under the 139px column each gets — narrower in
practice than the isolated probe's worst-case numbers because live
telemetry values are shorter than the probe's synthetic worst case).

Popover content, both groups, live text captured directly:

```
eval popover:   "VERSION\nv1.17.1\nMODEL\n14\n18 (unavailable)\n
                 nbttrf (unavailable)\n08_01 (unavailable)\n
                 b11c768h12nbt3tflrs\nWINRATE (W)\n48.0%\nLEAD\n-1.5"
health popover: "PPS\n0\nLATENCY\n2386ms\nWATCHDOG\n●"
```

(The health popover's "PPS 0" reading is a live instantaneous artifact —
the packet-rate sampled zero at the exact moment of that particular
hover, not a bug; the inline badge captured earlier in the same run
read "43pps" during active analysis.)

Screenshots (full app, 1920×1080, light `cluster` theme confirmed):
`shots/06-eval-popover.png` and `shots/07-health-popover.png` — both
show the complete toolbar row (EVAL/HEALTH/QUEUE all legible, clearly
separated) alongside the open popover, plus a cropped close-up
(`shots/10-metrics-row-crop.png`, `shots/11-eval-popover-crop.png`,
`shots/12-health-popover-crop.png`) isolating just the toolbar strip
and each popover. All under this session's own scratch directory,
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/
scratchpad/lyt-metrics-rig/shots/` — not committed, per the established
LYT-session convention.

One unrelated console error was captured during the run (`Failed to
load resource: the server responded with a status of 503`) — a single
occurrence, not traced further; it did not correlate with any toolbar
rendering symptom and this fix's own scope is the metrics-bar overlap,
not a general error sweep. Named for whoever next touches this rig.

**Cleanup.** Disconnected via the app's own Disconnect button (the
same real-vs-shadow-button distinction as Connect), confirmed the
visible button's `.btn-connected` class went `detached` before browser
close. `systemctl --user stop lyt-metrics-backend.scope
lyt-metrics-frontend.scope`; both ports reprobed dead afterward
(`Connection refused`, rc=1 each). `pgrep -af "19120|19121|lyt-metrics"`
afterward shows no residual process from this session.

## 7. Documentation audit (per the umbrella CLAUDE.md checklist)

- **Work-status store**: ledger row 2372 is this commission's own
  tracking item — its status transition (open → closed) is the
  commissioner/orchestrator's action per this repo's established
  coordinator-layer convention (`autoharn led` / the `todo` Postgres
  DB); this worktree does not carry `services_local.gitignore`'s DB
  connection facts, so the write is left to whichever session holds
  them, with this report as the evidence to close against.
- **`docs/handoff-current.md`**: not touched — this fix doesn't change
  the architecture/integration model or add a new open-work item; it's
  a scoped realization bugfix.
- **`FEATURES.md`**: consulted (`## Engine controls` /
  "Multi-model engine selection" entries, lines ~170-190). Judged NOT
  to need an edit — the described capability ("a Toolbar dropdown lets
  the user pick which model serves the active board") remains
  accurate; the model picker still exists and still works identically,
  it's just reached via a hover popover now rather than always inline.
  Not a capability change by the tour's own bar ("would a Go player
  misunderstand what the application offers").
- **`frontend/FILES.md`**: no file created, moved, or deleted — only
  existing files edited (component, test files, locale catalogs). No
  entry change needed.
- **ADR "Revisit when…" triggers**: none of the touched ADRs (checked
  ADR-0010 render-locality, since `EngineModelSelect` now mounts
  conditionally rather than unconditionally) name a trigger this
  satisfies — the render-locality property this component's own header
  already documents (self-sourced reads, no metrics-tick coupling) is
  preserved; conditional mounting doesn't reintroduce the coupling the
  prior fix closed.
- **Doc-graph**: not touched — no `docs/` file added, removed, renamed,
  or re-cross-referenced.

## 8. STOP-and-report items

None. Both compact forms were verified to fit their 139px allotment
with genuine margin (14%/23% at worst-case content, wider in practice
at real live values) before being wired in, and confirmed live against
the real engine with no overlap. No content was rendered unreadable to
fit — full fidelity for every value lives either inline (winrate, lead,
pps, watchdog) or in the hover popover (version, the interactive model
select, full latency).

## 9. Disclosed judgment calls

- **Identity (VERSION/MODEL) moved into the eval popover, not left
  inline.** The commission's own framing named eval as `{winrate,
  lead}`, matching the ruling's three-vocabulary naming — but the
  ACTUAL rendered `eval` leaf (per `ToolbarEngineMetrics.vue`'s own
  prior disclosed judgment call, folding identity into `eval`) includes
  VERSION+MODEL, and the measurement report's own 534px figure is the
  whole leaf's natural need, identity included. Fixing only winrate/lead
  while leaving identity inline would NOT have closed the witnessed
  overlap (identity alone, dominated by the SELECTOR `<select>`, was
  measured wider than the entire 139px column by itself). Treated the
  full rendered leaf as the unit that must not overlap, per the
  commission's own "each metrics group must render HONESTLY within
  whatever width it is allotted — no overlap, ever" instruction.
- **`EngineModelSelect` now mounts only while the eval popover is
  open**, rather than unconditionally. Functionally unchanged (same
  component, same store-sourced state, no local state lost on
  unmount/remount) but a real behavioural relocation: picking a model
  now requires a hover first. Judged acceptable given the width
  constraint and the queue idiom's own precedent (the queue's Cancel
  buttons are likewise only reachable via hover). Named here per the
  "no model/encoding edits... STOP-and-report" discipline's spirit,
  even though this is a component (not model) change — it's the one
  place this fix changes reachability rather than merely presentation.
- **`HEALTH` label chosen over the also-probed, narrower `SYS`
  candidate** (90.36px vs. 107.09px) — both fit comfortably; `HEALTH`
  reads clearer and still leaves 23% slack, so the extra ~17px cost
  against a still-ample margin was judged worth the clarity.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
