# Option C tab-skeleton encoding — repair of the rejected delivery

Fresh-context repair, per this project's severe-delinquency discipline
(the original implementer does not repair a delinquent delivery; fresh
context does, from the review, not the self-report). Base of repair:
`worktree-agent-a5f01858d5a475ab9` commit `3359c42d` (the rejected
delivery, REJECT verdict), itself based on `a22b1613` (`lyt-phase2`
tip). Review under repair:
[lyt-optionc-review.md](lyt-optionc-review.md) — read end to end and
treated as the specification of what is wrong; the rejected delivery's
own report,
[lyt-optionc-encoding.md](lyt-optionc-encoding.md), was read only to
know what exists, its claims trusted nowhere except where independently
re-verified below. Also read end to end before any repair: the ratified
spec
[lyt-tab-region-consult.md](lyt-tab-region-consult.md) (all of it, not
only §3-C/§6/§8/§9), the umbrella `CLAUDE.md`, `docs/adr/0000`,
`docs/adr/0002`, `docs/adr/0008`, `research/lyt/SPEC.md` (1280 lines),
`research/lyt/SPEC-AMENDMENTS.md` (872 lines), and
`research/lyt/emit_layout_tree.py`.

Branch: `optionc-repair`, cut from the rejected delivery commit
`3359c42d` per the dispatch brief (not from `lyt-phase2` tip directly),
so the repair sits on top of the rejected work rather than re-deriving
it from scratch.

---

## Finding 1 (MAJOR, false witness) — the real full-suite count and the two undisclosed regressions

**Reproduced first, as instructed, before any fix.** `research/lyt/`
carries four test files, 151 tests total (`test_lyt.py` 129,
`test_bench_solve.py` 4, `test_emit_layout_tree.py` 15,
`test_synthesize.py` 3 — confirmed by `pytest --collect-only` on each
file individually). Running the full suite on the rejected delivery,
unmodified:

```
3 failed, 148 passed in 3.66s
FAILED tests/test_bench_solve.py::test_bench_real_encodings_smoke
FAILED tests/test_emit_layout_tree.py::test_control_panel_blackbox_floor_is_wrapper_min_derived
FAILED tests/test_emit_layout_tree.py::test_portrait_control_panel_blackbox_floor_is_wrapper_min_derived
```

Matches the review's own reproduction exactly. The rejected report's
"129 passed, 0 failed" (its own §1 item 7 / §11) is `test_lyt.py`'s own
count, not the suite's — the review's characterization stands, restated
as false in the claim audit below.

**Diagnosis, per ADR-0000 — judged individually, not patched
uniformly:**

1. **`test_emit_layout_tree.py`'s two failures** assert the OLD 5-item
   `childWidgets` list. This is a **legitimate test update**, not a
   behavior bug: Amendment 6's own ratified change (`_collect_leaf_widgets`,
   a structural fold total over `Leaf | Split | Exclusive`) makes the
   15-item list the CORRECT output once CP-analysis/CP-settings are
   opened — the old assertion encoded an assumption (T-children are
   always bare leaves) the ratified consult deliberately retired. Fixed
   by updating the assertion to the new 15-item list, with a comment
   naming the Option C wave as the cause (matching this codebase's own
   established "feasibility-pin update" disclosure discipline).
2. **`test_bench_solve.py::test_bench_real_encodings_smoke`** asserted
   `lengyue-landscape@1920x1080` solves `OPTIMAL`. Investigation found
   this is **not** a bug the repair should route around: `settingsPane`'s
   own ch-measured width floor genuinely exceeds the side column's
   pre-existing `max 340px+60ch` (820px) cap — the SAME real geometry
   fact Finding 3 re-derives (corrected to 838px, still over the cap).
   This is the honest INFEASIBLE conclusion the ratified Option C wave
   is supposed to surface, not something Finding 1's repair should
   suppress by loosening the assertion for every spec. Fixed by
   asserting the now-correct per-spec expectation (landscape INFEASIBLE,
   portrait and the as-is baseline still OPTIMAL) rather than a blanket
   loosened check — the test still catches a genuine regression on
   either of the two specs that should stay OPTIMAL.

Both are in `test_emit_layout_tree.py`/`test_bench_solve.py` — the two
whole files the rejected report's own §9 "Test changes" list never
mentions and that its §9 preface ("every feasibility-pin-adjacent test
updated, individually disclosed") claimed to have swept. Neither file
was touched by the rejected delivery at all (`git diff a22b1613..3359c42d
-- research/lyt/tests/test_bench_solve.py research/lyt/tests/test_emit_layout_tree.py`
is empty).

**Result after repair** (see Finding 2/3 below for why the numbers in
these tests also needed correcting beyond the childWidgets/INFEASIBLE
fixes — the `minPx`/838px corrections land in the same test edits):

```
$ cd research/lyt && ~/w/vdc/venvs/generic/bin/python -m pytest -q
........................................................................ [ 47%]
........................................................................ [ 95%]
.......                                                                  [100%]
151 passed in 3.09s
```

**Closure statement (ADR-0000).** Invariant: every regenerated/derived
test assertion that encodes a specific tree shape or specific solver
outcome must be re-derived from the CURRENT ratified encoding, not
inherited from the pre-wave tree — a regression in either direction
(a stale assertion catching real drift, or a stale assertion masking
real drift) is equally a defect. Quantification universe: all four
`research/lyt/tests/*.py` files (not just the one the rejected
delivery happened to touch); the fix touched three of the four
(`test_lyt.py`, `test_bench_solve.py`, `test_emit_layout_tree.py`) —
`test_synthesize.py` was independently confirmed untouched by this
wave's own encoding changes and needed no update. Denomination: the
bound is "does this assertion match the CURRENT ratified encoding's
actual output," re-verified by direct re-solve/re-emit at every touch
point, never carried forward on faith from a prior wave's own numbers.

---

## Finding 2 (MAJOR, blocking) — "solver-side only" made honest end to end

**Root cause, confirmed by direct inspection.** `emit_layout_tree.py`'s
`_build_node` (Split branch) computed a T-child's emitted track floor
via `_exclusive_derived_min_px` — the componentwise max of the T's
DIRECT children's own declared `min`. Pre-Option-C, all five T children
were bare leaves at an identical `min WRAPPER_MIN`/`min 160px`, so this
derivation and "the marker's own declared reservation" were the same
number by coincidence. Option C opened two of those children into
composite `V(...)` subtrees whose own T-child `min` reflects the SOLVER's
interior demand (up to 880px, later corrected to 838px — Finding 3) —
the derivation kept working exactly as designed, and that design is what
leaked the interior number into the LIVE track: `App.vue` imports
`LYT_LANDSCAPE`/`LYT_PORTRAIT` directly from the `.gen.ts` files, and
`useLytTrackCss.ts` renders an `elastic` track's `minPx` as a literal
CSS `minmax()` floor. Confirmed exactly the review's own finding
(`git diff a22b1613 -- frontend/src/state/lyt-layout.gen.ts` on the
rejected delivery showed `minPx: 160` → `minPx: 880`, matching Finding
2's own witness verbatim).

**The fix, per the spec's own shape (§8.1 of the ratified consult: "Wave
1 ships solver-side with the marker sitting at the T ... today's
behavior, byte-identical").** The marker IS the T node itself — the
realization boundary this wave keeps unmoved. Its emitted reservation
must be its OWN declared envelope, not a derivation from its (now
much deeper) interior:

1. **Encoding change** (`encodings/lengyue_landscape.lyt`,
   `encodings/lengyue_portrait.lyt`): the `T(...)[BLACK BOX]` node's own
   wrapping slot now carries an EXPLICIT `min 160px` (landscape) /
   `min 200px` (portrait) — the exact pre-Option-C marker reservation
   (previously left at the loader's disclosed 0px default, with the
   compiler supplying the real floor by derivation). Both encodings'
   header comments carry a dated REPAIR note with the full derivation.
2. **Emitter change** (`emit_layout_tree.py`): `_exclusive_derived_min_px`
   and its floor-override plumbing are RETIRED from this module.
   `_build_node`'s Split branch now calls `_track_shape_for_child`
   uniformly for every child kind — for a T child, that reads the T's
   OWN wrapping slot's declared `sizing.min` (now the explicit 160px/
   200px above), exactly like every other node kind already does.
3. **The compiler's own independent derivation is UNTOUCHED.**
   `compiler.py`'s `_constrain` Exclusive branch still asserts
   `w >= max(children's own declared min)` as an ADDITIONAL constraint
   alongside the T slot's own declared min (confirmed by direct code
   read, `compiler.py` lines ~360-377: `model.Add(w >= max(child_min_w))`
   unconditionally) — so the solver still enforces the real ~838px
   interior floor and the genuine INFEASIBLE finding survives this
   repair intact. Only the EMITTER stops re-deriving that same number
   for the live-consumed track.

**Verification — regenerated both `.gen.ts` files and diffed against
base `a22b1613` (the working tree, not `HEAD`, since the repair is
uncommitted at verification time):**

```
$ git diff a22b1613 -- frontend/src/state/lyt-layout.gen.ts frontend/src/state/lyt-layout-portrait.gen.ts
```
```diff
--- a/frontend/src/state/lyt-layout-portrait.gen.ts
+++ b/frontend/src/state/lyt-layout-portrait.gen.ts
@@ -94,7 +94,7 @@ export const LYT_PORTRAIT: LytProgram = {
               path: "4.1",
               presenceDefaultVisible: true,
               track: { kind: "elastic", minPx: 200, frWeight: 1 },
-              node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: ["CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other"] },
+              node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: [15 leaf ids] },
--- a/frontend/src/state/lyt-layout.gen.ts
+++ b/frontend/src/state/lyt-layout.gen.ts
@@ -100,8 +100,8 @@ export const LYT_LANDSCAPE: LytProgram = {
                     path: "2.2.1",
                     presenceDefaultVisible: true,
                     track: { kind: "elastic", minPx: 160, frWeight: 1 },
-                    node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: ["CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other"] },
+                    node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: [15 leaf ids] },
```

**Inertness statement, explicit.** The `minPx` line is UNCHANGED in
both files (160/200, identical to base `a22b1613`) — the live CSS Grid
minimum-track-width the shipped app enforces is byte-identical to
pre-Option-C. The only diff in either file is `childWidgets`' own
contents. `LytNode.vue` was re-confirmed (full read) to branch only on
`node.kind` and never reference `childWidgets` — this field is
documentation/report-table parity only, the same claim the review
itself independently verified for the rejected delivery's identical
field and found correct (review's "Verified claims" §, item 2). The
"solver-side only / frontend behavior identical" framing now HOLDS: the
`.gen.ts` diff is limited to provably inert content, `git diff a22b1613
--stat -- frontend/` shows exactly these two files with no other
`frontend/src` change, and the frontend gates (below) are green with
zero `frontend/src` SOURCE changes.

**Residual, named rather than silently left.** `emit_mockup.py` (the
static-HTML mockup GENERATOR — research tooling, never live-consumed;
its own `mockups/*.html` output is gitignored, not committed) carries
its OWN independent copy of `_exclusive_derived_min_px`, used to render
the debug-overlay mockup pages. This copy was NOT touched by this
repair — it is out of Finding 2's scope (which names ".gen.ts files"
specifically, the live-consumed artifact). The mockup therefore
correctly continues to show the solver's own derived interior floor
(838px, post-Finding-3) when regenerated, which is honest for a debug
tool whose whole purpose is showing the solver's reasoning — it is not
a live-DOM contradiction the way the `.gen.ts` bug was. Two tests
(`test_portrait_composite_row_carries_the_board_priority_cap`,
`test_tree_panels_t_node_track_carries_its_derived_floor`, both in
`test_lyt.py`) pin this mockup-side number and were updated from 880px
to the corrected 838px (Finding 3) — not touched for Finding 2's own
sake, since the mockup's derivation was never the bug.

---

## Finding 3 (MODERATE) — the substrip ch-arithmetic, corrected

Re-derived independently from `frontend/src/locales/en.json`, read
directly (not trusting the rejected report's own quoted counts):

| Label | Rejected report's count | Actual (`len()`, verified) |
|---|---|---|
| "Session (UI)" | 13 | **12** |
| "Analysis Environment" | 21 | **20** |
| "Card Sets (Decks)" | 18 | **17** |
| "Advanced Registry" | 18 | **17** |
| "Analysis Layout" | 16 | **15** |
| "Keybindings" | 11 | 11 |
| **Sum** | **97** | **92** |

Matches the review's own independent re-derivation exactly (Finding 3)
— five of six labels inflated by +1, only the already-correct
"Keybindings" untouched, consistent with a systematic off-by-one rather
than a deliberate margin.

**Corrected arithmetic:** `92ch × 8px/ch (loader.PX_PER_CH) = 736px`,
`+ 96px` padding (`TabWidget.vue`'s `.tab-header li` carries `padding:
var(--space-default) var(--space-default)` — spot-verified at line 184;
`theme.css:568` confirms `--space-default: 8px` — `8px × 2 sides × 6
tabs = 96px`), `+ ~6px` border-right estimate (`TabWidget.vue:191`,
`border-right: 1px solid var(--border-1)`, spot-verified) = **838px**.

**Every place the wrong number propagated, corrected:**

- `encodings/lengyue_landscape.lyt` / `lengyue_portrait.lyt`: the
  settingsSubstrip `V(...)` wrapper's own declared `min` (was `880px`,
  now `838px`); the header's own derivation table (was 13/21/18/18/
  16/11=97ch/878px→880px, now 12/20/17/17/15/11=92ch/838px); a dated
  REPAIR note naming the correction and the honest margin (~18px over
  the 820px cap, not the originally-claimed ~60px).
- `tests/test_lyt.py`: every docstring/assertion citing the 880px
  number (`test_lengyue_landscape_default_valuation_solves_optimal`,
  `test_lengyue_portrait_default_valuation_solves_optimal_at_420x880`,
  `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`,
  `test_portrait_composite_row_carries_the_board_priority_cap`,
  `test_tree_panels_t_node_track_carries_its_derived_floor`) corrected
  to 838px, with the correction dated and cited.
- `tests/test_emit_layout_tree.py`: the two now-passing tests (Finding
  1) assert `minPx: 160.0`/`200.0` — the CORRECT emitted number after
  Finding 2's fix (never 880/838, since the emitter no longer derives
  from the interior at all).
- This report (above/below).

**The polarity is unaffected — landscape stays INFEASIBLE.** 838px
still exceeds the side column's own pre-existing, separately-ratified
820px cap (`max 340px+60ch`). Re-verified by direct re-solve at the
corrected 838px (not carried forward on faith): all 8 landscape
`OVERLAY_SIZES` rows remain `INFEASIBLE` under both presence valuations;
portrait's feasible/infeasible set is UNCHANGED by the 42px correction
(the two narrower portrait probes that were already short of 880px,
768×1024 and 540×960, remain short of 838px too — the margin isn't
close enough for the correction to flip either).

**The honest INFEASIBLE-vs-820-cap tension REMAINS, and this repair
does NOT pick a remedy.** Per the dispatch brief's own instruction,
every candidate remedy spends a ratified ruling and is left for the
commissioner:

- (a) raise the side column's own `max 340px+60ch` cap (a
  feasibility-pin change to a separately-negotiated ceiling);
- (b) rule that the settings sub-tab strip may scroll horizontally
  after all (revisiting the ratified §8.4 "no-scroll" row for that one
  container specifically);
- (c) reduce the sub-tab label set, or move to icon-only tabs at the
  narrowest breakpoint.

The corrected margin (~18px over the cap, not ~60px) changes which of
these reads as proportionate — a narrower ask than the rejected
delivery's own report implied — but the CHOICE among them is still not
this repair's to make.

**Closure statement (ADR-0000).** Invariant: every ch-measured envelope
in this encoding is re-derived from the actual source string (`len()`
against the live `en.json` text), never hand-counted and trusted.
Quantification universe: all six sub-tab labels this one substrip
declares (all six checked, all five miscounted ones corrected);
sibling surface — no OTHER ch-measured envelope exists yet in either
`.lyt` encoding as of this wave (grepped both files for `ch` extents:
the only other `ch`-bearing sizing is the pre-existing, unrelated side
column `max 340px+60ch` cap itself, which is not a label-derived
envelope and was not touched). Denomination: px, derived via the one
disclosed global constant (`loader.PX_PER_CH=8.0`) from a character
count taken directly off the authoritative source string, never a
round literal or an eyeballed estimate.

---

## Claim audit — the rejected report's remaining claims the review did not independently verify

Per the dispatch brief's instruction, every claim in
[lyt-optionc-encoding.md](lyt-optionc-encoding.md) the review did not
itself check was re-audited here. Corrections:

- **§1 item 7 / §11 "Full suite green (129/129)"** — **FALSE**, restated
  plainly (the review already established this; repeated here per the
  brief's explicit instruction not to leave it implicit). The real
  suite is 151 tests across 4 files; 3 were failing, undisclosed, caused
  by this wave. Fixed by this repair (Finding 1).
- **§5 "solver-side only... frontend behavior identical"** — the
  STRUCTURAL half (`childWidgets`) was true and independently verified
  by the review; the `minPx` half was **FALSE as delivered** (the
  review's Finding 2). Fixed by this repair (Finding 2).
- **§3's grounding table, spot-checked** (citations the review did not
  itself verify): `MultiresolutionIntervalPanel.vue`'s `.heatmap-content
  { height: 580px }` (near the cited line 153 — confirmed, though the
  class name itself isn't named in the report's own prose),
  `HorizontalTimelineVisualizer.vue:429`'s `.timeline-container { height:
  16px }` (confirmed exactly at that line), `TabWidget.vue:184`'s
  `padding: var(--space-default) var(--space-default)` (confirmed
  exactly at that line) and its `border-right: 1px solid` (confirmed at
  line 191, not 184 — the report doesn't claim a specific line for this
  one), `theme.css:568`'s `--space-default: 8px` (confirmed exactly at
  that line) — all accurate as CITATIONS. The only defect in this
  table was the ch-COUNT itself (Finding 3), not these component-CSS
  citations.
- **§6 "orientation variant NOT implemented"** — spot-checked
  (`grep`-swept `research/lyt/` for orientation-variant machinery beyond
  the pre-existing board-composite CASE A/B split, which is an unrelated
  concept): confirmed accurate. No settings-orientation solve path
  exists.
- **§7 cross-check mechanism** — spot-checked against
  `tests/test_lyt.py::test_analysis_tabs_cross_check_against_defaults_ts`'s
  actual source: matches the report's own description (regex-extracts
  `defaults.ts`'s `analysisTabs`, compares tab count and per-tab panel
  count against the loaded `.lyt` tree's nested `T(AT-*)` group).
  Accurate.
- **§9 "Test changes (full list)" / §12 "Files touched"** — **FALSE by
  omission**, already established by the review (Finding 1): both lists
  omit `test_bench_solve.py` and `test_emit_layout_tree.py` entirely,
  the two files this repair's Finding 1 fixes.
- **§13 "Committed as `81cc1099`... rebased... to `d0d2720d`. Final
  merge-base... `a22b1613`"** — spot-checked against this repair's own
  worktree `git log`/`git merge-base`: **accurate**. `HEAD` at repair
  start was exactly `d0d2720d` (message: "Option C tab-skeleton encoding
  — blackbox re-homing, emitter retirement, CP-analysis/CP-settings
  opened one level"), parent `3359c42d`, merge-base against
  `origin/lyt-phase2` exactly `a22b1613`.

No other claim in the rejected report was found false on this audit
pass. The three findings above, plus the two omissions this section
restates, are the complete defect set this repair addresses.

---

## Full `research/lyt` suite — file list, count, literal exit code

Four files: `tests/test_lyt.py` (129), `tests/test_bench_solve.py` (4),
`tests/test_emit_layout_tree.py` (15), `tests/test_synthesize.py` (3).
151 total.

```
$ cd research/lyt && ~/w/vdc/venvs/generic/bin/python -m pytest -q
........................................................................ [ 47%]
........................................................................ [ 95%]
.......                                                                  [100%]
151 passed in 3.09s
```
Exit code: **0**.

---

## Frontend gates

Run foreground, no pipes, from `frontend/` (fresh worktree — `npm
install` run first, no prior `node_modules`):

```
$ npm run build
...
✓ 1238 modules transformed.
✓ built in 2.22s
```
Exit code: **0**.

```
$ NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run
 Test Files  243 passed | 3 skipped (246)
      Tests  3057 passed | 8 skipped (3065)
```
Exit code: **0**.

`git diff a22b1613 --stat -- frontend/` shows exactly the two
`.gen.ts` files (2 lines changed total, both the `childWidgets`
list — see Finding 2), zero other `frontend/src` change.

---

## ADR-0000 closure statements — summary

Each finding's own closure statement is inlined above (Finding 1,
Finding 3); Finding 2's disposition is a type-driven repair in the
same register — the marker's own declared reservation (a fact of the
Slot's own sizing) and the solver's derived structural floor (a fact
computed FROM the Slot's children) are two DIFFERENT quantities that a
single derivation function conflated once the marker's children
stopped being uniform. The fix names the distinction explicitly (the
emitter reads the marker's own declared min; the compiler independently
re-derives the structural floor from children) rather than patching the
one instance (re-hardcoding 160/200 as a special case inside the
existing derivation function, which would have left the SAME conflation
representable the next time a T-child's own children diverge from its
declared min for any other reason).

---

## Claims

- Full `research/lyt` suite (151 tests, 4 files, exit 0): **WITNESSED**.
- `.gen.ts` diff-vs-`a22b1613` inertness (both files, `minPx` unchanged,
  only `childWidgets` differs): **WITNESSED**.
- `npm run build` (exit 0, zero `frontend/src` source changes): **WITNESSED**.
- `npm run test:run` under the mandated memory caps (243 files/3057
  passed/8 skipped, exit 0): **WITNESSED**.
- Compiler's own independent T-floor derivation unaffected by the
  emitter fix (code-read + full-suite INFEASIBLE pins unchanged):
  **WITNESSED**.
- Settings-orientation-variant claim, cross-check-mechanism claim,
  grounding-citation spot-checks, commit/merge-base claim: **WITNESSED**
  (claim-audit section above).
- CP-settings second-level opening (the residual named in the rejected
  report's own §6, letting `settingsPane`'s six bodies carry distinct
  classifications): **UNEXERCISED** — out of this repair's scope
  (narrowing/widening the three named findings + claim audit is
  STOP-and-report per the dispatch brief; this residual was already
  correctly named as future work by the rejected delivery and remains
  so).
- Finding 3's remedy (raise the cap / permit substrip scroll / shrink
  labels): **UNEXERCISED**, deliberately — reserved for the
  commissioner per the dispatch brief's explicit instruction.

---

## Commit and merge-base

Commit: see `git log -1` on branch `optionc-repair` at the time this
report is filed (recorded in the final message to the dispatching
session). Base: `worktree-agent-a5f01858d5a475ab9` at `3359c42d`.
Merge-base against `origin/lyt-phase2`, checked as this repair's LAST
act (fetch first): recorded in the final message; rebased if
`lyt-phase2` moved since `a22b1613`.

## License

Public Domain (The Unlicense).
