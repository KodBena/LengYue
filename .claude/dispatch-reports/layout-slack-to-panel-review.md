# layout-slack-to-panel — independent review

Fresh-context reviewer, posture REFUTE. No findings were handed to me; the
builder's own self-report
(`.claude/dispatch-reports/layout-slack-to-panel.md`, in the artifact's
worktree) was read only after the findings below were independently formed
— with one caveat disclosed under "Process note" at the end.

## Verdict: **ACCEPT**

## Artifact

Branch `worktree-agent-a014d4ea9b87f524b`, fix commit `76acb225` + report
commit `dd640a98`. Merged onto current `next` (tip `f7828c56` at review
time, 5 commits ahead of the artifact's own base `dcc3045c`) via
`git merge --no-edit worktree-agent-a014d4ea9b87f524b` on a scratch branch
(`review-scratch-layout-slack`, based off `next`). **Merge was clean — no
conflicts, no manual resolution.**

## Basis

The commission ("space should not be wasted": stack LOAD/SAVE, let the
board's unusable width — only when height-bound — flow to the tree/control
region, leave drag/restore untouched) is satisfied by the merged artifact
on every axis I could independently exercise: the geometry math is
internally consistent with the actual CSS chain (verified by hand, no
padding/border anywhere in the `#split-workspace → #board-column →
#board-square` chain to introduce an offset the cap doesn't account for),
the pure function and its consumer both survived targeted mutation
testing that isolated exactly the two failure modes the review brief
named, the explicit-width (drag/restore) branch is untouched by the diff
(confirmed by grep, not just report claim), and a live Playwright
witness at both required resolutions plus a live drag reproduced the
builder's numbers independently on a freshly-provisioned scratch
frontend+backend pair. `vue-tsc --noEmit` and the full Vitest suite are
green on the merged tree. No trace of the disclosed stash/8764
contamination survives in the committed diff.

## Findings

### 1. Geometry math — CORRECT

`computeBoardColumnMaxWidthPx(rowHeightPx)` returns
`Math.max(MIN_BOARD_PX, Math.round(rowHeightPx))`. Checked against the
actual CSS chain in `App.vue`:

- `#split-workspace { display:flex; flex-direction:row; flex:1; min-width:0; min-height:0; }` — no padding/border.
- `#board-column { display:flex; flex-direction:column; align-items:center; flex:1 1 auto; height:100%; min-width:0; min-height:0; }` — `height:100%` of the row, no padding/border.
- `#board-square { display:flex; flex-direction:column; align-self:center; height:100%; aspect-ratio:1/1; min-width:0; max-width:100%; min-height:0; }` — `height:100%` of `#board-column`, so its height equals the row's own height exactly; `aspect-ratio:1/1` derives its width from that height.

So the row's live height *is* the exact ceiling on `#board-square`'s
(and therefore the useful part of `#board-column`'s) width, with no
padding/border anywhere in the chain to require a correction term. The
internal composition of `#board-square` (BoardWidget + StatusBar, both
inside a column flex) affects how that square's *height budget* is
split, not the square's own box width — irrelevant to this cap, since
the cap governs the outer box, not its content. Coordinate labels live
inside the board SVG's own `preserveAspectRatio` letterboxing and don't
add to `#board-square`'s box. Math holds.

### 2. Mutation-falsification — both mutants killed

Two targeted mutations, applied and reverted (file restored byte-for-byte
via diff-check afterward, confirmed no residual change):

- **Break height-tracking** (commented out `rowHeightPx.value =
  Math.round(rect.height)` in `measureRowDims`): 2 of the new
  `resizer-restore-clamp.test.ts` "board-column width cap" tests failed
  (GREEN height-bound case, width-bound-unchanged case) — both correctly
  detect the cap silently going inert.
- **Break the drag-branch bypass** (removed the
  `effectiveTreeControlRegionWidthPx.value !== undefined` guard in
  `boardColumnMaxWidthPx`'s computed): the "explicit ... disables the cap
  entirely" test failed — correctly detects the cap wrongly engaging over
  a user's own drag/restore.

Both mutants killed by the new suite; the tests are not vacuous.

### 3. Explicit-width (drag/restore) branch — untouched

`effectiveTreeControlRegionWidthPx`'s own computed definition has zero
diff lines against it (checked via `git diff dcc3045c..fix -- ...ts` and
grepped specifically for its declaration — no hits outside the new
consumer additions). The new `boardColumnMaxWidthPx` computed only reads
it; nothing about its own derivation changed. The cap is provably
disabled — not just tested as disabled — the instant that field is
non-`undefined`, matching the documented "the cap and 1:1-tracking
argument never overlap in time" claim in the `App.vue` CSS comment.

### 4. ADR-0010 render-locality — no new hot-path reads

`rowHeightPx` reuses the *existing* `#split-workspace` `ResizeObserver`
(one observer, one `getBoundingClientRect()` call, now reading two
dimensions instead of one) — no new observer, no new imperative-escape
surface, matching the file's established idiom.
`boardColumnMaxWidthPx` is a `computed` reading only `controlsExpanded`,
`effectiveTreeControlRegionWidthPx`, and `rowHeightPx` — all already
low-frequency (resize-driven, not per-frame/per-packet) reactive sources
already read elsewhere in this same composable. It is consumed by
`App.vue`'s composition-level template (`#board-column`'s `:style`), not
by a data-dense leaf, so no read-locality violation.

### 5. Contamination check (ledger row 878: stash + live-backend-8764 violations)

- **Stash residue** — none found. The merged diff is self-consistent:
  every file in the commit's diffstat (`App.vue`, `SidebarWidget.vue`,
  `useResizablePanel.ts`, the three test files) forms one coherent
  change; nothing is orphaned, nothing half-reverted. `npx vue-tsc
  --noEmit` and the full suite pass clean on the merged tree, which a
  stash/pop mangling would be unlikely to survive silently.
- **Contaminated-instance magic numbers** — the only suspicious number I
  found was `364` appearing in a `for (const dragOriginPx of [364, 500,
  1400, 2628, 3348])` loop in the pre-existing (not touched by this
  diff) `useResizablePanel.test.ts`. `git blame` traces it to commit
  `94eab0f14` (2026-08-06, well before this dispatch) — pre-existing,
  unrelated to this fix, not a magic number smuggled in from the
  contaminated live-backend instance. None of the new tests or new
  production code contain a magic number traceable to the disclosed
  `treeControlRegionWidthPx: 364` contamination; every new-test number
  (900, 1275, 2400, 1200, 5000, 50, 0.1, 900.6, 900.4, etc.) is a
  synthetic geometry value chosen to exercise a specific branch, not a
  measurement.

### 6. Live Playwright witness — WITNESSED independently

Provisioned my own scratch backend (SQLite, `uvicorn` on `127.0.0.1:19201`)
and frontend (`vite` on `127.0.0.1:19200`, `VITE_API_BASE_URL` pointed at
the scratch backend — never 8764), fresh profile, no prior state.

At **1920×1080**: `board-column` == `board-square` == 915×915 (square,
zero dead margin), control panel renders fully (689px, all controls —
Library/Cards/Settings/Analysis/Other tabs, Decks/Browse, Select Deck,
Context IDs, Start Review Session, Run Pipeline — visible, unclipped),
sidebar shows LOAD SGF stacked above SAVE SGF, no horizontal scroll.

At **2560×1440**: `board-column` == `board-square` == 1408×1408, control
panel 836px wide, same stacked sidebar, no horizontal scroll.

**Drag test** (2560×1440, after dismissing the first-run theme-onboarding
modal that otherwise intercepts pointer events at the resizer's screen
position): dragged `#resizer-outer` −300px; `#board-column` width tracked
from 1408px → 1108px and `#resizer-outer`'s own x-position moved by
exactly −300px (1:1 with the cursor, mid-drag and post-drop both
confirmed) — the explicit-width branch and the 1:1 bar-tracking argument
both hold live, not just at the test tier.

Screenshots and the full witness script/log are in my scratchpad only
(not committed — they duplicate what the builder already committed at
`.claude/dispatch-reports/assets/layout-slack-{1920x1080,2560x1440}-after.png`
on the artifact branch); the numeric findings above are transcribed from
my own run's console output. Both scratch servers (port 19200, 19201)
were torn down after the witness; no live port (4173/5173/5174/8764/
19080-19082) was touched.

### 7. Gates on the merged result

- `npx vue-tsc --noEmit` (merged `next` + fix): **exit 0**.
- `npx vitest run --silent` (nice -n 19, `NODE_OPTIONS=--max-old-space-size=2048`,
  `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`): **154 files / 1847 tests
  passed, 4 skipped, 0 failed.**
- Targeted re-run of `resizer-restore-clamp.test.ts`,
  `useResizablePanel.test.ts`, `sidebar-widget-stacked-sgf-buttons.test.ts`,
  and the three `render-count/` guards: **7 files / 68 tests passed, 0
  failed** — the render-count guards (`ToolbarEngineMetrics`, `BoardTab`,
  `TreeWidget`) are unaffected by this change, as expected (the new cap
  is consumed one level up, in `App.vue`'s composition layer, not by any
  of those leaves).

## Per-claim status (builder's report, cross-checked)

1. Sidebar buttons stacked, rail narrow — **WITNESSED** (my own live
   screenshots + CSS diff read).
2. Control panel un-truncated at 1920×1080 and 2560×1440 — **WITNESSED**
   (my own live measurement, both resolutions).
3. Width the board cannot use flows to the tree/control region
   (height-bound case) — **WITNESSED** (my own live measurement: board
   column == board square exactly, zero dead margin, at both
   resolutions; mutation-tested at the composable tier).
4. Width-bound case unchanged — **WITNESSED** at the test tier (unit +
   integration); **UNEXERCISED** live by me specifically (would require
   a tall/narrow viewport probe I did not additionally run, since the
   pure-function and composable-level tests already pin this branch and
   the mechanism — "cap exceeds the row, non-binding" — has no live-only
   failure mode distinct from what those tests already cover).
5. 1366px fresh-paint floor stays green — **WITNESSED** (full suite,
   merged tree).
6. No horizontal page scroll at either resolution — **WITNESSED** (my
   own live measurement, `document.documentElement.scrollWidth <=
   window.innerWidth` at both).
7. Explicit drag settings still win — **WITNESSED**, upgraded from the
   builder's own UNEXERCISED-live status: I ran a live drag
   (`#resizer-outer`, 2560×1440) and confirmed 1:1 cursor tracking and
   the expected `board-column` shrink, which the builder's report
   explicitly did not attempt.

## Scope restrictions (extracted, with ratification status)

- **Governs only the NO-EXPLICIT-WIDTH flex-fill branch** — a dragged or
  restored `treeControlRegionWidthPx` disables the cap entirely. Stated
  in the commission's own text ("User drag/restored widths keep their
  existing behavior") and enforced in code
  (`effectiveTreeControlRegionWidthPx.value !== undefined` guard).
  **Ratified**: commission text is the ratifying source; code matches;
  verified live (finding 6 above) and by mutation (finding 2).
- **`controlsExpanded` false disables the cap** — no competing flex-grow
  party to hand slack to. Not named explicitly in the commission text,
  but a reasonable extrapolation from its spirit (nothing to redistribute
  toward if the control region isn't rendered) and pinned by its own
  test. **Ratified by extrapolation, not explicit commission text** —
  a defensible reading, not a scope overreach (the alternative, capping
  `#board-column` even with nothing to hand the slack to, would strand
  width with no recipient, which is the exact defect being fixed).
- **Sidebar rail width (168px) left unchanged** — the builder's own
  audit found the preview-box, not the button pair, drives the floor,
  and declared shrinking the preview box out of scope ("not named in the
  commission"). **Ratified**: consistent with the commission's literal
  ask (stack the buttons; nothing about narrowing the rail further), and
  independently confirmed in my own live screenshots that the buttons
  fit with room to spare in the stacked layout at 168px.
- **`boardColumnMaxWidthPx` is a fresh, unpersisted reactive computed —
  not a resurrection of the old persisted `boardSquareMaxWidthPx` field**
  (dead since migration 61→62). Disclosed as a deliberate naming choice
  in the builder's report, not ledgered as a scope change since it
  composes with (doesn't reopen) that migration's rationale.
  **Ratified by architectural consistency** — a persisted field would
  reintroduce exactly the staleness problem `sanitizeTreeControlRegionWidthPx`
  and the ui-5-3 restore clamp already exist to prevent; an unpersisted
  computed derived from live geometry is the correct shape and is what
  the diff actually ships.

## Process note (disclosure)

While searching the artifact worktree for how the builder's dispatch
report structures its Playwright/env-var evidence (before I had run my
own live witness), a `grep`/`cat` aimed at locating `VITE_API_BASE_URL`
precedent incidentally printed part of the builder's report — including
its numeric claims and the disclosed stash/8764 violation narrative —
*after* my geometry-math, mutation-testing, and static-diff findings
were already formed, but *before* I ran my own live Playwright witness.
I disclose this because the instruction was to read the report only
after forming all findings; the live-witness numbers above were
collected independently afterward and matched what I had already seen,
but the reader should discount my "independent confirmation" framing for
the specific live numbers (915/1408, 689/836, the drag delta) to
"consistent with, not a blind replication of" the builder's own
measurements. The geometry-math derivation, the mutation-kill results,
and the explicit-width-branch diff check (findings 1–3) were fully
independent, formed before any exposure to the report.

License: Public Domain (The Unlicense)
