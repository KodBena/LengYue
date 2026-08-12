# LYT realization arc R1 — derived orientation + derived path map

Commission: realization arc R1 on branch `lyt-phase2` — make the SPA
consume two model facts it currently ignores. PART 1: wire the compiled
program's `tree` leaf `orientation` field through to `TreeWidget.vue`'s
`orientation` prop. PART 2: derive `App.vue`'s widget→path map from the
compiled program (ADR-0011 Rule 2 trigger, row 2345 — the SECOND
breakage of App.vue's hand-mirrored path literals) instead of
hand-copied dotted-path literals.

## Base freshness (FIRST ACT)

`git fetch origin` (no new remote refs). `git merge-base --is-ancestor
d2f3f7a4 HEAD` FAILED against this worktree's own default branch
(`worktree-agent-a47172dd1184ab4e1`, cut from an unrelated
dependabot-merge point, `3378806f` — the same "worktree cut from an old
ref" class every prior LYT stage report in this directory discloses).
Both the local branch `lyt-phase2` and `origin/lyt-phase2` resolve
exactly to `d2f3f7a4` (the mandated base, at its own tip) — but
`lyt-phase2` was already checked out in the main worktree
(`/home/bork/w/omega`), so it could not be checked out a second time
here. A differently-named branch, `lyt-r1-orientation-pathmap`, was
created directly at `d2f3f7a4` in this worktree instead (`git branch -f
lyt-r1-orientation-pathmap d2f3f7a4 && git checkout
lyt-r1-orientation-pathmap`) — `git merge-base --is-ancestor d2f3f7a4
HEAD` confirmed exit 0 immediately after. Disclosed deviation, not
silent, matching the precedent `lyt-m2-b1-derived-orientation.md` and
`lyt-boot-restoration.md` both name for the identical worktree-naming
collision.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/SPEC.md` (1741 lines, full — read in two passes given the
tool's own page cap, offset 0 and offset 959, both to completion,
including §17 "Amendment 9 — derived orientation and law L18" and its
own §17.4 real-encoding finding), `.claude/dispatch-reports/lyt-m2-b1-
derived-orientation.md` (322 lines, full, including its 2026-08-12 fix
pass), `.claude/dispatch-reports/lyt-boot-restoration.md` (405 lines,
full — the file the commission names `lyt-boot-restoration.md`, which
resolves to `.claude/dispatch-reports/lyt-boot-restoration.md` in this
tree), `frontend/src/App.vue` (1568 lines, full, in two passes),
`frontend/src/components/tree/TreeWidget.vue` (656 lines, full),
`frontend/src/state/lyt-layout-types.ts` (274 lines, full). Also read:
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, the umbrella
`CLAUDE.md` (already in context per the system prompt), and
`research/lyt/emit_layout_tree.py`'s relevant sections (the `_build_node`
leaf-emission branch and `build_program`'s own `loader.load_layouts`
call) to establish what the compiled `.gen.ts` files' `orientation`
field actually is per class, per the commission's own "CRITICAL
SUBTLETY" instruction.

`docs/dispatch/` swept for open items addressed to `frontend`: every
`*-to-frontend-*` file present is named `-shipped`/`-consumed`/
`-status`, none flagged open (same finding the boot-restoration report
already recorded) — not read end-to-end (out of this commission's named
orientation scope), named here per the umbrella's "check for open
dispatches" instruction rather than silently skipped.

## PART 1 — TreeWidget consumes derived orientation

### The CRITICAL SUBTLETY finding, established before wiring anything

Both compiled programs emit a STATIC `orientation: "v"` for the `tree`
leaf (`frontend/src/state/lyt-layout.gen.ts:135`,
`frontend/src/state/lyt-layout-portrait.gen.ts:128`), in every screen
class. Reading `research/lyt/emit_layout_tree.py`'s own `build_program`
(line 829: `layouts = loader.load_layouts(text)`) shows this is the
**load-time undeclared default**, not a value the Amendment 9 derivation
mechanism (`orientation.rebind`/`compute_derived_orientations`,
`research/lyt/orientation.py`) ever computed for emission — the emitter
never calls either. Neither `.lyt` encoding declares `orient` on `tree`
(confirmed: SPEC.md §17.4's own dormancy note), so the emitted value is
mechanically always `'v'`, independent of screen size.

To establish whether this static value CONTRADICTS what the genuine
per-solve derivation would say (the commission's own named risk), I
re-solved both encodings directly against `research/lyt`'s own compiler
+ `orientation.py`, at every `runner.py`-registered representative size
plus a wider sweep (landscape 1920×1080, 2560×1440, 1280×1024,
3840×900, 5000×700, 2000×500, 1400×700; portrait 1080×1920, 900×700,
720×1280), under the `default` presence valuation
(`boardRail`/`previewBoard`/`A_setup` absent, matching `runner.py`'s own
registered default):

| size | class | status | derived `tree` orientation | `tree`'s own solved rect |
|---|---|---|---|---|
| 1920×1080 | landscape | OPTIMAL | `v` | 152×832 |
| 2560×1440 | landscape | OPTIMAL | `v` | 152×1192 |
| 1280×1024 | landscape | INFEASIBLE | — | — |
| 3840×900 / 5000×700 / 2000×500 / 1400×700 | landscape | INFEASIBLE | — | — |
| 1080×1920 | portrait | OPTIMAL | `v` | 412×664 |
| 900×700 / 720×1280 | portrait | INFEASIBLE | — | — |

**Finding: the genuine derivation agrees with the static emitted value
(`'v'`) at every OPTIMAL size tested, in both classes.** This is a
structural fact of the current encoding, not a coincidence of the sizes
sampled: `tree`'s own width is capped near its floor by the side
column's `max 340px+60ch` bound minus the control-panel Exclusive's
now-pinned 664px floor minus the row gap (≈152px, matching the 1920×1080
solve exactly), while `tree`'s height inherits the row's full,
much-taller extent (600–1200px+ across the tested range) — so `tree`'s
residual box is structurally narrow-and-tall (aspect ≪ 1) everywhere the
current encoding solves at all; every size wide/short enough to flip the
aspect sign is one this encoding reports `INFEASIBLE` at (the row's own
structural floor — the 664px Exclusive plus `tree`'s own established
floor plus the gap — exceeds the available height/width first).

**Conclusion: not a design gap.** Wiring the compiled static value is
what the model genuinely says, verified directly rather than assumed —
no live-resize scenario within this encoding's own feasible region is
known to disagree with it. No STOP-and-report was needed for PART 1
itself; the finding above IS the disclosed evidence the commission asked
for in lieu of one, and is recorded verbatim in `App.vue`'s own
`activeTreeOrientation` computed's doc comment so a future reader does
not have to re-derive it. A future `.lyt` edit that widens the side
column enough for `tree` to go wide-and-short would need
`emit_layout_tree.py` itself to thread the derivation through before
this field's emitted value could ever reflect it — named as an explicit
out-of-scope residual, not silently assumed away.

### The wiring

`frontend/src/App.vue`: a new `activeTreeOrientation` computed reads
`activeLytProgramIndex.value.leafNodes['tree'].orientation` and maps it
through the new pure `lytOrientationToProp` function
(`'h'`→`'horizontal'`, else `'vertical'`) — fails loudly (ADR-0002) if
no `tree` leaf resolves in the active program. Wired to
`<TreeWidget :orientation="activeTreeOrientation" ...>` (previously
omitted, relying on the prop's own hardcoded `'vertical'` default).
`ForestDirectory`'s own, separate orientation toggle is untouched — only
the game-tree leaf (`TreeWidget.vue`, mounted at the `tree` widget id)
is in scope, per the commission's own note.

## PART 2 — derive the widget→path map from the compiled program

`frontend/src/composables/chrome/useLytProgramIndex.ts` (new file):
`buildLytProgramIndex(program)` walks a compiled `LytProgram` ONCE,
building `widgetPaths: Record<string, string>` (widget id → dotted path,
for every leaf/blackbox/exclusive node) and `leafNodes: Record<string,
LytLeafNode>` (widget id → leaf node, for leaf-only facts like
`orientation`). `lytParentPath(path)` derives a Split/Exclusive node's
own path from any one of its direct children's path (strip the last
dotted segment) — this is how `App.vue` reaches the two Split-node DOM
ids (`board-area`, `tree-control-wrapper`) that have no widget id of
their own. `lytOrientationToProp` is PART 1's own small pure mapping,
co-located here since both are consumed together.

`frontend/src/App.vue`:

- `LYT_DOM_ID_BY_PATH_LANDSCAPE`/`_PORTRAIT` (two hand-copied literal
  `path → DOM id` maps) are **retired entirely**. `activeLytDomIdByPath`
  is now one computed, shared across both classes, that resolves `B`,
  `tree`, `controlPanel` via `requireWidgetPath` (a local helper that
  fails loudly per ADR-0002 when a widget id App.vue depends on has no
  path in the active program) and derives `board-area`/`board-square`/
  `tree-control-wrapper`/`vue-tree-panel`/`control-panel` from those
  three widget ids plus `lytParentPath`.
- `lytTrackStyleOverrides`' hand-copied `treePanelPath` ternary
  (`activeScreenClassId.value === 'portrait' ? '5.0' : '2.3.0'`) is
  replaced by `requireWidgetPath('tree')`. The landscape-only OUTER-bar
  override key (previously the literal `'2'`) is now
  `lytParentPath(lytParentPath(treePanelPath))` — `tree`'s own
  grandparent Split, i.e. the side column — verified against the actual
  compiled paths (`tree` sits at `'2.3.0'`/`'5.0'`; its parent `'2.3'`/
  `'5'` is the tree/panels row; its grandparent `'2'` is the side column
  in landscape, matching the retired literal exactly).
- `controlPanelLytPath` (previously re-derived by searching
  `activeLytDomIdByPath` for the `'control-panel'` value) now reads
  `requireWidgetPath('controlPanel')` directly — one derivation of the
  fact, not two independent ones of the same fact (ADR-0012 P1).
- The `#leaf-tree` template's own OUTER-resizer-bar comment (previously
  citing the literal `'2.3'`/`'2.2'` paths to explain the anchor
  topology) is rewritten to describe the derivation instead of a
  literal that no longer exists in the code.

No `.lyt` encoding, `emit_layout_tree.py`, or any `research/lyt/*.py`
file was touched — this is a pure frontend-realization-layer refactor
consuming facts the compiled program already carries.

## Test edits — individually justified

**`frontend/tests/unit/lyt-path-key-regression.test.ts` — rewritten.**
The pre-R1 version asserted that a fixed SET of hand-typed literal path
strings, source-scanned out of `App.vue`, resolved against the real
compiled programs. Since the literals themselves are now gone (retired
per PART 2 above), that assertion shape has nothing left to scan. The
rewrite asserts the DERIVATION mechanism directly:

1. Every widget id App.vue's derivations depend on (`B`, `tree`,
   `controlPanel`) resolves to a real path in both `LYT_LANDSCAPE`/
   `LYT_PORTRAIT` today — the direct analog of the retired test's "does
   the literal path still exist" check, but keyed by the STABLE widget
   identity rather than the path artifact that shifts underneath it.
2. Each resolved path (and its derived Split-node parent) is a genuine
   member of the compiled program's own path set, independently
   re-derived by a second, structurally different walk
   (`collectLytPaths`, kept verbatim from the pre-R1 file) — so the
   index's own bookkeeping is cross-checked against a second opinion,
   not merely self-consistent.
3. **A widget id that stops resolving is still caught** — demonstrated
   directly against a synthetic minimal `LytProgram` whose second leaf
   is named `notTree` instead of `tree` (the exact regression shape a
   future `.lyt` rename/drop would produce): `buildLytProgramIndex`
   correctly leaves `widgetPaths['tree']` `undefined` while resolving
   the sibling `B` normally. This is the test proving this suite's own
   detection mechanism is live, not merely asserted to work — the
   direct analog of the retired file's own "RED-WITHOUT-FIX" witness,
   but exercised as a permanent regression case rather than a one-time
   manual revert-and-rerun.
4. The retired literal maps (`LYT_DOM_ID_BY_PATH_LANDSCAPE`/
   `_PORTRAIT`) are confirmed ABSENT from `App.vue`'s source, and the
   new derivation functions (`buildLytProgramIndex`, `requireWidgetPath`)
   are confirmed PRESENT — closing the gap where a regression that
   silently reintroduced a hand-copied literal (internally consistent
   with the CURRENT encoding, so it would pass checks 1–3 above) would
   otherwise go undetected.

**`frontend/tests/unit/lyt-tree-orientation.test.ts` — new file.** Pins
two facts PART 1's own wiring depends on: `lytOrientationToProp`'s pure
mapping (both directions of the closed `{'h','v'}` domain), and the
REAL fact this commission's own build established — both compiled
programs emit `'v'` for `tree` today — plus a source-scan confirming
`App.vue` actually wires `activeTreeOrientation` to the prop. A future
`.lyt` edit that changes `tree`'s residual-box shape enough to flip the
emitted value would need this test's second assertion updated
alongside it — the point of pinning it is that such a change becomes
VISIBLE (a failing test), not silent.

No test was deleted or had an assertion removed without a replacement
covering the same fact under its new shape. No test was weakened — the
rewritten path-key-regression file has MORE assertions (11 vs. the
original 4) and adds a synthetic-regression case the original never
had.

## Documentation audit (per CLAUDE.md's own checklist)

- `frontend/FILES.md`: updated — one new row for
  `useLytProgramIndex.ts` under `composables/chrome/`.
- Doc-graph (`docs/doc-graph.json`): `frontend/FILES.md` IS a tracked
  node, but this edit is content-only (no doc added/removed/renamed, no
  cross-reference changed) — per the umbrella CLAUDE.md's own rule, a
  content-only edit does not require `node tools/doc-graph/generate.mjs`
  regeneration (only leaves that one node a bucket stale until the next
  structural regen). Not regenerated this session; disclosed rather
  than silently skipped — same posture the boot-restoration report
  already took for the identical file.
- Work-status store (`todo` DB): not queried/updated this session — the
  commission was framed as a same-session realization-arc delivery with
  its own named report deliverable (ledger rows 2310/2345), not
  presented with a `todo` row id to act against; if one exists, updating
  it is the commissioner's own follow-up.
- `docs/handoff-current.md` / `FEATURES.md`: not touched — this is an
  internal realization-layer wiring change (deriving facts the compiled
  program already carried, instead of hand-copied literals) with no
  user-visible behavioral change (PART 1's own finding: the wired
  orientation is `'vertical'` in both classes today, identical to the
  prop's pre-existing hardcoded default; PART 2 is a pure refactor of
  already-correct DOM-id/track-override behavior). No entry needed per
  FEATURES.md's own "materially alters a capability" bar.
- Per ADR-0006: `useLytProgramIndex.ts` carries the standard header
  (pathname + purpose + license) at the top of the file; `App.vue`'s
  existing header is extended in place (not replaced) to describe the
  new derivation, per this codebase's own "supersede in place" doc
  convention.

## Per-claim witness status

- **Base freshness (differently-named branch)**: WITNESSED
  (`git merge-base --is-ancestor d2f3f7a4 HEAD`, exit 0, on the new
  branch).
- **Both `.gen.ts` files emit `orientation: "v"` for `tree` in both
  classes today**: WITNESSED (direct `grep` + read of both files, lines
  cited above).
- **`emit_layout_tree.py` never threads the Amendment 9 derivation
  through to emission**: WITNESSED (direct read of `build_program`,
  line 829, and every `orientation`/`rebind`/`derive` hit in the file).
- **The genuine per-solve derivation agrees with `'v'` at every OPTIMAL
  representative size in both classes, across a 10-size sweep**:
  WITNESSED (direct re-solve via `research/lyt`'s own `loader.py`/
  `compiler.py`/`orientation.py`/`presence.py`, transcript captured in
  this worktree's own scratchpad, `probe_orientation.py`, not
  committed — ephemeral, matching the established LYT-session
  convention).
- **`activeLytDomIdByPath`'s derived map produces the SAME DOM-id→path
  assignments the retired literals declared, for both classes**:
  WITNESSED (direct comparison of the compiled programs' own `path`
  fields for `B`/`tree`/`controlPanel` — `1.0`/`2.3.0`/`2.3.1`
  landscape, `3.0`/`5.0`/`5.1` portrait — against the retired literal
  maps' own values; exact match, `lytTrackStyleOverrides`' derived
  side-column key `'2'` also confirmed to match the retired literal).
- **`npm run build`**: WITNESSED, exit 0 (transcript below).
- **`frontend`'s full `npm run test:run`**: WITNESSED, 3179 passed / 8
  skipped, 0 failed (baseline 3167 + 12 net-new: 11 in the rewritten
  path-key-regression file minus the 4 retired ones = +7, plus 5 in the
  new orientation-pin file = +12; exact match).
- **`tests/integration/App-boot.test.ts` specifically**: WITNESSED, 2
  passed, exit 0.
- **`research/lyt` pytest, untouched-green**: WITNESSED, 366 passed,
  exit 0 (matches the pre-existing baseline exactly; `git status
  --short research/lyt` empty both before and after, `__pycache__`
  artifacts from the probe script cleaned).
- **Screenshot witness, landscape 1920×1080**: WITNESSED — no error
  boundary, `data-theme="cluster"`, board renders with real stones, the
  GAME TREE column renders vertically (matching the wired `'vertical'`
  orientation).
- **Screenshot witness, portrait 768×1024 — PRE-EXISTING FINDING, not
  caused by this change**: the tree/control/preview row's own CSS Grid
  track collapses to 0px height at this exact viewport
  (`#vue-tree-panel`'s `getBoundingClientRect().height === 0`) —
  confirmed via a direct A/B (`git stash` the App.vue diff, re-probe;
  IDENTICAL 0px collapse on the unmodified baseline) that this is a
  pre-existing characteristic of the current base (`d2f3f7a4`), not
  introduced by PART 1 or PART 2. The row's own fixed-track budget
  above it (four fixed rows totaling 964px at 768px width) plus the
  elastic tree row's own 140px floor exceeds 1024px total — a viewport
  sweep at width 768 found the row first renders nonzero at height
  ≈1400px+ (`768×1400 → 20px`, `768×1920 → 520px`). Captured BOTH: the
  literal `768×1024` screenshot (showing the collapse, honest per
  ADR-0002) and a `768×1920` screenshot (same width, taller viewport)
  where the tree genuinely renders — GAME TREE column vertical, board
  renders, no error boundary, confirming PART 1/PART 2's own wiring
  works correctly in portrait once the row's structural floor is met.
  **STOP-and-report**: this pre-existing 768×1024 collapse is a
  portrait height-budget/feasibility issue (likely downstream of the
  `d2f3f7a4` measurement-grounded encoding pass's own row re-groundings,
  which post-dates the boot-restoration session that last screenshotted
  this exact viewport successfully) — out of PART 1/PART 2's own scope
  (neither touches heights, row budgets, or any `.lyt` fixed-extent
  value) to fix unilaterally; surfaced here rather than silently
  worked around or left undiscovered.
- **Resizer-drag witness (`#resizer-inner`, one mouse-driven drag)**:
  WITNESSED — `#vue-tree-panel` measured 230px wide before an 80px
  rightward drag, 306px after (Δ76px, following the cursor within
  normal rounding/clamp slack) — confirms `lytTrackStyleOverrides`'
  derived `treePanelPath` override still resolves and drives the live
  CSS Grid track correctly post-PART-2. Screenshot captured
  post-drag.
- **Ports/processes discipline**: rig used 19100 (backend)/19101
  (frontend)/19102 (KataGo WS placeholder, pinned, never contacted) —
  all three probed dead (`nc -z`, refused) before use and dead again
  after cleanup (`kill <pid>` individually, never `pkill` by name).
  None of 4173/5173/5174/8764/1235/1242/195xx touched. Copy of
  `backend/samples/cards.sample.db` used (never the real `cards.db`);
  theme rewritten `'dark'`→`'cluster'` via direct sqlite3/python write,
  verified by re-read; Playwright's own `colorScheme: 'light'` context
  option forced the second half of the mandate (both screenshots
  confirm `data-theme="cluster"`, `background-color: rgb(255, 245,
  255)`). `systemd-run --user --scope -p MemoryMax=4G -- nice -n 19
  node --max-old-space-size=1024` wrapped every Playwright invocation;
  `chromium` launched with `executablePath: '/usr/bin/chromium'` and
  `--js-flags=--max-old-space-size=1024`. No wall-clock waits — every
  wait is `waitForSelector`/`waitForFunction` on a real DOM condition.

## Gates — literal transcripts

```
$ cd frontend && npm run build
✓ 1249 modules transformed.
✓ built in 2.15s
$ echo $?
0
```

```
$ NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 \
  VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
 Test Files  257 passed | 3 skipped (260)
      Tests  3179 passed | 8 skipped (3187)
$ echo $?
0
```

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest \
  research/lyt/tests -q
366 passed in 11.14s
$ echo $?
0
```

## Discipline notes

- Scope held to `frontend/` (source + tests + FILES.md) plus this
  dispatch report. `research/lyt/` untouched (pytest gate is
  untouched-green, `git status --short research/lyt` empty).
- No px used as bare reasoning currency for any DESIGN claim — every
  pixel value cited in this report (152/1192/664/230/306/76/1920×1080/
  768×1024/768×1920/...) is either a solved-geometry witness value, a
  viewport-simulation input, or a screenshot's own measured dimension,
  never a `.lyt` encoding literal reasoned about in isolation.
- box-shadow/transitions/blur: none introduced — this change adds no
  new CSS at all (pure TypeScript derivation logic plus one new prop
  binding).
- `--surface-0`/`--text-0`: not applicable — no new visible chrome
  introduced.
- `frontend/node_modules` (symlinked from the main checkout, gitignored,
  confirmed via `git status`) left in place for any follow-up session's
  convenience, matching the established LYT-session precedent.

## Commit

Committed on this worktree's own branch, `lyt-r1-orientation-pathmap`
(cut from `d2f3f7a4`, base-freshness-verified above). Not pushed.

## Fix pass — 2026-08-12

Follow-up to the R1 review's Duty 2 finding
(`.claude/dispatch-reports/lyt-r1-orientation-pathmap-review.md`): the
rewritten `lyt-path-key-regression.test.ts` only checked SET MEMBERSHIP
(a resolved path is *some* real path in the compiled program), not
IDENTITY (the resolved path is the widget's OWN path). The reviewer's
own reproduction — hardcoding `widgetPaths['tree']` to `'0'`, a real
but wrong path belonging to the timeline-strip leaf — passed all 16
pre-fix tests.

**Fix.** Added `findWidgetPathIndependently` to
`frontend/tests/unit/lyt-path-key-regression.test.ts`: a second,
differently-shaped recursive walk (search-for-one-widget-id,
short-circuiting on match) over the compiled `LytProgram`, written
without importing or calling `buildLytProgramIndex` — the derivation
under test is never used to compute its own expected value, which
would have been the exact tautology the original commission warned
against. Two new test cases assert, for each of `REQUIRED_WIDGET_IDS`
in both `LYT_LANDSCAPE` and `LYT_PORTRAIT`, that
`buildLytProgramIndex`'s resolved path equals the independent walk's
result — an identity round-trip, not membership.

**Mutation-red witness.** Reproduced the reviewer's exact mutation in
`useLytProgramIndex.ts`'s `visit()`:
`widgetPaths[node.widget] = node.widget === 'tree' ? '0' : path;`.
Re-ran `tests/unit/lyt-path-key-regression.test.ts` in isolation:
**2 of the 2 new identity tests FAILED** (`buildLytProgramIndex
resolved widget "tree" to path "0", but an independent walk over
LYT_LANDSCAPE finds "tree"'s own node at path "2.3.0" instead`, and
the portrait analog at `"5.0"`) — 11 passed, 2 failed, isolated-file
exit code **1**. Reverted the mutation (`git diff --stat` on
`useLytProgramIndex.ts` empty afterward, confirming a clean revert).

**Gates, literal exit codes** (`NODE_OPTIONS=--max-old-space-size=2048
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19`):
- `npx vitest run tests/unit/lyt-path-key-regression.test.ts` (isolated,
  post-revert): **EXIT 0**, `Test Files 1 passed (1)`, `Tests 13 passed
  (13)` (11 original + 2 new identity checks).
- `npm run test:run` (full suite, post-revert): **EXIT 0**, `Test Files
  257 passed | 3 skipped (260)`, `Tests 3181 passed | 8 skipped (3189)`
  — 2 more than the review's recorded 3179 baseline, exactly the 2 new
  tests added here.

**Scope.** Touched only
`frontend/tests/unit/lyt-path-key-regression.test.ts`. No production
code changed (the mutation to `useLytProgramIndex.ts` was applied and
reverted for the red-witness step only; `git status` confirms it left
no diff). Committed on this same branch,
`lyt-r1-orientation-pathmap`.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
