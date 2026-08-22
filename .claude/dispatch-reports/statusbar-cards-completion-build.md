# statusbar-cards-completion-build

Base: local `next` tip `90b67af3c69aca222b4a6d3da518e130dc79cc5f`, confirmed
via `git rev-parse HEAD` after `git reset --hard` to it (the worktree's
prior HEAD, `dc8e3b12`, was NOT this base — recorded here per the mandate's
base-freshness check). At final gate time, `git log --oneline -3 next` still
shows `90b67af3` at the tip — the concurrent LytNode-recursion-crash fix has
**not landed** on `next`; nothing was merged in.

Prior WIP: `f9b47639` ("WIP: statusbar/cards hotfix") exists as a loose
commit (not on any branch) authored on top of the divider-mechanics merge
`98d60b6f`, which is reverted in this base (`d62148ef`). No
`.claude/dispatch-reports/statusbar-cards-hotfix.md` report exists in that
commit despite its own trailer citing one — confirmed by `git ls-tree`. The
only surviving account of that session's state is the closeout addendum
(`.claude/dispatch-reports/COMMISSIONER-CLOSEOUT-2026-08-21.md`'s final
section), which is what this report treats as ground truth alongside the
`f9b47639` diff itself (read in full via `git show`).

## Per-defect status

**(a) StatusBar.vue `.player-name` flex fix — FIXED, LIVE-WITNESSED.**
Ported from `f9b47639` by hand (context matched the reverted tree exactly;
no conflict). Root cause: `flex: 1 1 0` pinned each name's flex-basis to
the literal `0`, which also zeroed `.player-names`' own max-content
contribution up the tree, so both names ellipsized immediately even at
1920px with the whole bar empty. Fix: `flex: 1 1 auto`. Live-witnessed at
1920×1080 with two long names ("Alexandrescu Constantinopoulos" /
"Featherstonehaugh Cholmondeley") both rendering in full — screenshot
`statusbar-cards-completion-af-01-ample-names-1920.png`.

**(c) `.right-panel-surface-overlay` strip-overlap fix — FIXED,
LIVE-WITNESSED.** Ported from `f9b47639`: `LytNode.vue`'s Exclusive
wrapper gains `display: flex; flex-direction: column`; the overlay
(App.vue) and the header-only strip (`TabWidget.vue`) become flex items
(`order: 2`/`flex: 1 1 auto` and `order: 1`/`flex-shrink: 0` respectively)
instead of the old `position: absolute` overlay riding under the strip's
own rendered rows. Most exposed to the divider revert per the mandate's
warning; checked carefully — the divider revert (`d62148ef`) touched
different lines in both `App.vue` and `LytNode.vue` (the divider's own
`#resizer-inner`/ceiling-unification code, not this Exclusive-wrapper
region), so the port applied with NO conflict, context matched verbatim.
Live-witnessed: Library→Cards toggle, Cards→Browse toggle, both at
1920×1080, no visual overlap between the Settings/Analysis/Other strip
and the Cards/Browse content below it — screenshots
`statusbar-cards-completion-bc-03-cards-no-overlap.png` /
`-bc-04-browse-no-overlap.png`.

**(f) active-turn ring clipping fix — FIXED, LIVE-WITNESSED.** Ported
from `f9b47639`: the stone-chip moves out of `.player-name`'s own
`overflow: hidden` box; a new `.player-name-text` inner span carries the
ellipsis/nowrap/overflow declarations instead, and `.player-name` becomes
`inline-flex` with no clipping ancestor at all. Live-witnessed:
navigated to move 2, black to move, `.stone-chip.active`'s ring rendered
as a complete "O" with no clipped arc on any edge —
`statusbar-cards-completion-af-02-active-ring-1920.png`; confirmed
programmatically too (`getComputedStyle` on `.player-name` reported
`overflow: visible`, `outline: rgb(255, 136, 0) solid 2px`, full ring
rect not clipped by the parent's box).

**(d) `useElementWidth.ts` settle-remeasure burst — DEFENSIVE FIX
PORTED, CLASS UNWITNESSABLE.** Ported verbatim from `f9b47639` (file
untouched by the divider revert — no conflict). Per the composable's own
header comment (preserved from the port), this closes a real-browser-only
`ResizeObserver`-stops-delivering class this codebase already diagnosed
once for `useResizablePanel.ts` and is generalizing here; jsdom never
runs real `ResizeObserver` box-size delivery, so this class is not
witnessable in the unit/integration test tier, and I did not attempt a
live-rig reproduction of the specific "toolbar collapses to More at ample
width" symptom this session (the ported fix is additive/defensive:
`observe()` schedules a short `requestAnimationFrame` burst plus one
`document.fonts.ready` remeasure, cancelled in `stop()`/re-`observe()`
per the resource-ownership discipline). Disclosed honestly as
**fixed-unwitnessable-class**, not silently claimed live-verified.

**(b) blank Cards surface — RE-WITNESSED, NOT REPRODUCIBLE at this
base; confirmed as a side effect of (c)'s fix, per the prior session's
own disposition.** Repro attempted twice: fresh boot landing on Cards
(no repro — Decks/Browse tabs render immediately), and the exact
Library→Cards→Browse toggle sequence from `witness-02.mjs`'s own
(recovered, read) intent — `.right-panel-surface-overlay`'s
`getBoundingClientRect()` and `.forest-container`'s were IDENTICAL in
both position and size at every step, `overlayChildren: 1`, and content
(Decks form / "No cards in database." Browse empty-state) rendered
correctly. No blank surface at any point. Screenshots as above (bc-03/
bc-04) double as this defect's witness.

**(e) clicking a card in Browse hides the tree / metadata panel
overflow — DIAGNOSED AND FIXED, LIVE-WITNESSED.** Untouched going in, no
prior diagnosis existed (confirmed — `f9b47639` never touched
`ForestDirectory.vue`, `layout-model.ts`, or `CardMetadataPanel.vue`).
Repro: fresh isolated backend (wiped sqlite between every attempt — the
pre-existing "Maximum recursive updates in `<LytNode>`" crash fired
reliably on ANY persisted/reused user state, confirming the mandate's
warning; a genuinely fresh db avoided it every time), loaded an SGF,
minted a card at move 2, opened Cards→Browse, expanded the game row
(auto-rendered the one-root tree), clicked the rendered node.

Root cause (diagnosed via `getBoundingClientRect()` before/after the
click, not guessed): `ForestDirectory.vue`'s `.panel-content-two-col`
class — which reflows the card-tree chart and `CardMetadataPanel` SIDE
BY SIDE via a CSS grid (`1fr auto`, the chart getting the flexible `1fr`
track) — is gated on `props.twoColumnReflow`, itself derived from the
WHOLE-WORKSPACE viewport width class (`App.vue`'s `panelContentPolicy`),
not from `.tree-panel`'s own rendered width. At 1920×1080 this is
unconditionally `true`, but the Cards surface shares the split layout's
right column with the goban, so `.tree-panel` measured only **383px**
wide in the repro. Selecting a card mounted `CardMetadataPanel` at its
own `60ch` reading-measure width (**333.7px** measured), squeezing the
chart's `1fr` grid track down to **23.3px** — the tree effectively
vanished (measured, not eyeballed: `chartWrapperRect.width` before click
357px, after click 23.3px, metadata panel present at 333.7px).

Fix (three files, all live-witnessed post-fix):
- `state/layout-model.ts`: new `FOREST_TREE_TWO_COL_THRESHOLD_PX`
  (`= computeForestNarrowThresholdPx(FOREST_TREE_USABLE_FLOOR_PX,
  FOREST_TREE_USABLE_FLOOR_PX)` = 399px), reusing the SAME
  "sum-of-two-region-floors, minus one" helper `FOREST_NARROW_THRESHOLD_PX`
  already uses, rather than hand-deriving a second formula.
- `ForestDirectory.vue`: a second `useDeferredContainerBreakpoint` call
  (the SAME mid-drag-flip-avoidance mechanism `forestNarrow` already
  uses, so this doesn't reintroduce the discrete-reorg-during-drag defect
  the resizer-rearch amendment closed once) observing `.tree-panel`
  itself; `effectiveTwoColumnReflow = props.twoColumnReflow &&
  !treePanelTooNarrowForTwoCol`, bound in the template instead of the
  bare prop. Below the threshold, two-col simply doesn't apply — the
  metadata panel stacks BELOW the chart (CSS's pre-existing single-column
  default) instead of squeezing beside it. The tree is never removed
  from layout; only the metadata panel's placement relative to it
  changes.
- `CardMetadataPanel.vue`: per the mandate's own precedent
  (`SettingsPane.vue`'s `.registry-container`), the panel's root gets a
  self-budgeted `max-height: clamp(200px, 40vh, 480px)` +
  `overflow-y: auto` — so content taller than that (more tags, an
  expanded editor) scrolls WITHIN ITSELF rather than being silently
  clipped by `.tree-panel`'s base `overflow: hidden` (single-column mode)
  or growing past its own grid track (two-col mode).

Post-fix live measurement: `.chart-wrapper` retained its full 357/383px
width and height after the click; `CardMetadataPanel` stacked below at
y=864, height 216px (well under its 480px cap), bottom exactly at the
viewport edge (1080px) — no overflow. Screenshot
`statusbar-cards-completion-e-07-after-fix-tree-visible.png`;
`statusbar-cards-completion-e-06-after-node-click-dialog.png` shows the
same post-fix state with the (unrelated, pre-existing) "Board in use"
dialog from `handleLoadCard`'s dirty-board guard still open — noted, not
addressed (out of this mandate's scope; the dialog itself is correct
behavior, just incidental to this repro's board-already-has-moves
setup). The true "before" squeeze state was captured only numerically
(`getBoundingClientRect()` logged in-session), not as a screenshot — the
witness script overwrote the same output path on the post-fix rerun; the
numeric evidence (23.3px / 333.7px / 383px) is reproduced above verbatim
from that run's actual tool output, not reconstructed after the fact.

## Port conflicts against the divider revert

None of the four ported fixes ((a)/(c)/(d)/(f)) actually conflicted with
the divider-mechanics revert at the line level — in every case the
context `f9b47639`'s diff expected matched the reverted tree verbatim,
confirmed by reading the pre-image before applying each edit. This is
because the divider-mechanics merge (`98d60b6f`) and its revert
(`d62148ef`) touched `#resizer-inner`/ceiling-unification code in
`App.vue` and `LytNode.vue` — a different region from the
`#exclusive-controlPanel` / `.right-panel-surface-overlay` /
`.vue-tabs--header-only .tab-header` code the WIP's fixes touch. The
mandate's warning that (c) was "most exposed" was worth the careful
read — it shares two of the same two files as the divider revert — but
the actual line ranges didn't overlap.

## Tests added/adjusted

- `tests/unit/state/layout-model.test.ts` — new `describe` block pinning
  `FOREST_TREE_TWO_COL_THRESHOLD_PX`'s derivation and value (399), plus
  the exact live-witnessed collapse width (383px) sitting below it.
- `tests/integration/forest-directory-two-col-narrow-guard.test.ts`
  (new) — mounts `ForestDirectory.vue` with a `ResizeObserver` fake that
  actually delivers a callback (unlike the sibling suite's `Noop` stub),
  asserting `.panel-content-two-col` is omitted when the ancestor says
  wide but the panel measures narrow (the exact repro), applied when
  both agree, and never applied when the ancestor says narrow regardless
  of measured width (the guard only narrows, never widens, the
  ancestor's intent).
- `tests/integration/StatusBar-player-names-ample-width.test.ts` (new)
  — pins the DOM structure (`.player-name-text` nested span, chip as a
  sibling) and CSS (`flex-basis: auto`, no `overflow: hidden` on
  `.player-name`, ellipsis declarations on `.player-name-text`) for
  defects (a) and (f) at ample width.
- `tests/integration/status-bar-player-names-ellipsis.test.ts` and
  `tests/integration/StatusBar-narrow-no-overflow.test.ts` — both
  pre-existing suites pinned the SUPERSEDED structure (ellipsis
  declarations on `.player-name` itself, a 3px left-padding ring
  band-aid); updated in place (not left red, not deleted) to assert the
  current, correct shape, with an addendum note in each file's header
  explaining what changed and why.

## Gate outputs (read, not exit-code-trusted)

- `npx vue-tsc -b --noEmit` — clean, no output, twice (once after the
  port, once after the defect-(e) fix).
- `npx vitest run` — **293 test files passed, 3 skipped; 3579 tests
  passed, 8 skipped, 0 failed.** (First run surfaced 3 pre-existing
  failures from the superseded-structure tests above; fixed in place,
  second run fully green.)
- `npm run build` (`vue-tsc -b && vite build`) — clean build, 1274
  modules transformed, `dist/` emitted. Pre-existing chunk-size warning
  (single 3.2MB JS bundle) is unrelated to this change and not
  addressed.

## Not done / honestly disclosed

- **(d)'s live-browser class is fixed but not live-witnessed** — see
  above. This is a genuine external bound (jsdom cannot run real
  `ResizeObserver` delivery), not a corner cut; the fix itself is
  ported verbatim from the prior session's diagnosis, which DID
  reportedly live-witness the symptom this closes.
- **The LytNode recursion-crash fix has not landed on `next`** — checked
  per the mandate at final-gate time (`git log --oneline -3 next`, still
  `90b67af3` at tip). Nothing merged in; this build's fixes are
  independent of that crash (worked around it here only by using a
  fresh sqlite db per repro attempt, never by touching LytNode's
  reactivity/watch machinery, per the fence).
- **Fences respected**: no touch to `proxy/`, no touch to
  divider-mechanics (reverted arc, held — confirmed no file under that
  arc's scope was touched beyond the disclosed-and-verified-non-
  conflicting ports above), no touch to LytNode.vue's reactivity/watch
  internals beyond the single `display: flex; flex-direction: column`
  style-object line the (c) port requires.
- **The "Board in use" dialog** surfaced incidentally during (e)'s
  repro (clicking a card node in Browse loads it onto the active board,
  which already had moves from the SGF load) is correct, pre-existing
  behavior — not a defect, not touched.
