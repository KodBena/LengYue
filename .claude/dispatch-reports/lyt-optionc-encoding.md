# Option C tab-skeleton encoding — delivery report

Work item `lyt-tab-skeleton-encoding`. Commission: implement Option C of
the ratified consult [.claude/dispatch-reports/lyt-tab-region-consult.md](lyt-tab-region-consult.md)
(ledger row 1937) — blackbox re-homing, emitter retirement, opening
CP-analysis/CP-settings one structural level, classifications/scroll
declarations, a cross-check mechanism, and a full solve+advisory pass.
Solver-side only: `frontend/src` and the live DOM are untouched this
wave; the frontend gates are run as proof.

Read end to end before this work began: `CLAUDE.md` (root),
`docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`,
`docs/adr/0002-fail-loudly.md`, `docs/adr/0008-classification-discipline.md`,
`research/lyt/README.md`, `research/lyt/SPEC.md`,
`research/lyt/SPEC-AMENDMENTS.md`,
`research/lyt/encodings/lengyue_landscape.lyt` and `lengyue_portrait.lyt`
(header comments), and `.claude/dispatch-reports/lyt-tab-region-consult.md`
(999 lines, the ratified spec of record). Consulted for grounding:
`frontend/src/store/defaults.ts` (§621-638), `frontend/src/components/
SettingsTab.vue` (header + sub-tab list), `research/lyt/emit_layout_tree.py`,
`frontend/src/components/chrome/LytNode.vue` (full read, to verify the
`childWidgets` non-consumption claim below), `frontend/src/components/
charts/AnalysisDashboard.vue` (full read, grounding the "no static design
height" finding for most panels).

A genuine blocker interrupted this session before work began: the ratified
consult document was not yet committed to the branch this worktree was cut
from. The coordinator corrected this (commit `efc7c3a8`); this report
covers only the work done after the rebase onto that commit.

---

## 1. Per-item delivery status

| Item | Status |
|---|---|
| 1. Blackbox re-homing | **WITNESSED** — `Domain` shrinks to 5 members, `Leaf.boundary` added, all 4 existing `.lyt` encodings + `synthesize.py` updated mechanically. |
| 2. Emitter retirement | **WITNESSED** — `emit_layout_tree.py`'s plain-leaf-T assertion retired to a structural fold; regenerated `.gen.ts` diffed, structural shape provably inert, geometry diff disclosed (see §5). |
| 3. Open CP-analysis one level | **WITNESSED** — `V(timelineStrip, T(AT-basic, AT-distributions, AT-stability, AT-multiresolution))`, transcribing `defaults.ts`'s REAL 4-tab table (a disclosed correction of the consult's own 3-tab illustrative example — see §2 below). |
| 4. Open CP-settings | **WITNESSED**, with one disclosed conservative simplification — `V(substrip, pane)`; `pane` is ONE opaque leaf (as commissioned), classified as the worst-case superset of its six sub-tab bodies rather than per-body (named as a residual, §3). Orientation variant: NOT implemented — see §6. |
| 5. Classifications + scroll declarations | **WITNESSED**, including the CP-other restructure (§9.3's ratified target shape) beyond items 3/4's own scope, and the live-DOM lag disclosed in both encoding headers. |
| 6. Cross-check mechanism | **WITNESSED** at a disclosed P7 level (static-text-extraction regression, not a two-sided generated-JSON snapshot) — `test_analysis_tabs_cross_check_against_defaults_ts`, `tests/test_lyt.py`. |
| 7. Solve + advisory | **WITNESSED** — full suite green (129/129), advisory output real, INFEASIBLE findings surfaced honestly (§4), every feasibility-pin-adjacent test updated with disclosure, no demand weakened to force feasibility. |

---

## 2. Item 3/4/5 as implemented — the new tree shape

Both `lengyue_landscape.lyt` and `lengyue_portrait.lyt` (numbers below are
class-agnostic; grounded numbers are identical across both classes per
their own header notes — components render the same regardless of screen
orientation):

```
T(
  CP-library[common, boundary, content unbounded, scroll v]        -- unchanged shape, re-homed
  CP-cards[common, boundary, content unbounded, scroll v]          -- unchanged shape, re-homed
  V(                                                                -- CP-settings, opened
    settingsSubstrip[common, boundary, content bounded]  {28px}
    settingsPane[common, boundary, content unbounded, scroll v]  {min 200px}
  )  -- outer wrapper min 880px (both axes, T-child)
  V(                                                                -- CP-analysis, opened
    timelineStrip[go, boundary, content designed]  {min 80px}
    T(
      V( AT_basic_interval, AT_basic_scoreLead, AT_basic_mergedDelta )  -- AT-basic
      V( AT_dist_deltaDist, AT_dist_mistakeGap )                        -- AT-distributions
      V( AT_stab_stability, AT_stab_crossCorr )                         -- AT-stability
      AT_multires  {580px}                                              -- AT-multiresolution
    )  -- each AT-* wrapper min 160px (both axes, T-child); inner T derived min 160px
  )  -- outer wrapper min 664px (both axes, T-child)
  V(                                                                -- CP-other, opened
    otherColorDebug[debug, boundary, content designed]  {min 40px}
    otherBand[common, boundary, content unbounded, scroll v]  {min 160px}
  )  -- outer wrapper min 204px (both axes, T-child)
)
```

**A disclosed, deliberate correction of the consult's own illustrative
example.** §3-C's own prose names three analysis tabs
(`T(AT-basic, AT-distributions, AT-stability)`). `frontend/src/store/
defaults.ts:633-638`'s ACTUAL `analysisTabs` default table has FOUR:
`basic`, `distributions`, `stability`, `multiresolution`. Per the
commission's own instruction ("transcribing the DEFAULT analysis-tab
configuration from `frontend/src/store/defaults.ts`") and per item 6's
own cross-check mandate, this encoding follows the real authority, not
the consult's shorthand — the fourth tab (`AT_multires`) is included, and
the cross-check test (§4 below) now enforces this correspondence going
forward so it cannot silently drift again.

---

## 3. Every new number, with its grounding citation

| Leaf | Number | Grounding |
|---|---|---|
| `AT_multires` | 580px (GROUNDED) | `frontend/src/components/charts/MultiresolutionIntervalPanel.vue:153`, literal CSS `height: 580px`. The ONE genuine component design fact found in this panel family. |
| `timelineStrip` | 80px (PARTLY GROUNDED) | `frontend/src/components/tree/HorizontalTimelineVisualizer.vue:429`'s own `.timeline-container { height: 16px }` (the data track) is a real citation; the header row + controls row are ESTIMATED, not individually measured. |
| `AT_basic_interval` | 90px (ESTIMATE) | `IntervalSummaryPanel.vue` is a compact bounded table, not a chart; no height CSS fact found. Disclosed estimate. |
| `AT_basic_scoreLead`, `AT_basic_mergedDelta`, `AT_dist_deltaDist`, `AT_dist_mistakeGap`, `AT_stab_stability`, `AT_stab_crossCorr` | 200px each (ESTIMATE) | All `BaseChart`-driven with `height:100%` (elastic, container-driven — verified by reading each `<style>` block; none declares an intrinsic height). No static design fact exists for this panel sub-family; 200px is a disclosed, commonly-workable minimum legible chart height, NOT independently re-measured against the live app the way the REPAIR PASS's own numbers were. |
| `settingsSubstrip` (outer wrapper width floor) | 880px (GROUNDED, computed) | Six sub-tab labels, `frontend/src/locales/en.json:47,48,61-64` ("Session (UI)"=13ch, "Analysis Environment"=21ch, "Card Sets (Decks)"=18ch, "Advanced Registry"=18ch, "Analysis Layout"=16ch, "Keybindings"=11ch; Σ=97ch); `loader.PX_PER_CH=8.0` → 776px; `frontend/src/components/chrome/TabWidget.vue:184`'s own `padding: var(--space-default) var(--space-default)` (`theme.css:568`, 8px×2×6=96px) + `border-right:1px` (~6px) → 776+96+6=878px, rounded to 880px for margin. |
| `otherColorDebug` | 40px (ESTIMATE, weakest-grounded) | No component-level height fact found for `ColorDebugStrip.vue` in this pass. Named as the weakest number in this wave. |
| `settingsPane`, `otherBand` | 200/160px (design choice, not a measurement) | Modest interior floors for the two opaque catch-all leaves; not independently grounded beyond "reasonable minimum," consistent with these leaves' own opaque/unmodeled status. |

**A live re-sweep (Playwright, the REPAIR PASS's own methodology) is the
honest remaining gap for every ESTIMATED number above** — filed, not
silently absorbed. This session did not run Playwright measurements: the
brief's own probe-isolation protocol (dedicated ports ≥19100, pinned dead
upstream env vars, `systemd-run` resource caps) is substantial setup for
numbers that are, per the codebase's own established practice
(design-fact citation first, measurement only when "genuinely
contested"), not yet contested by anyone — no live app run occurred to
contest them.

---

## 4. Classification table as implemented

| Container | Class | Scroll disposition | Where |
|---|---|---|---|
| CP-library, CP-cards | 3 — unbounded browse | scroll v (single leaf) | both encodings |
| Settings sub-tab strip | 1 — bounded chrome | no-scroll (ch-envelope, 880px) | both |
| Settings pane (all 6 sub-tab bodies) | worst-case superset (see §6) | scroll v (conservative) | both |
| Timeline strip | 2 — designed | no-scroll | both |
| AT-basic/distributions/stability/multiresolution panel leaves | 2 — designed | no-scroll | both |
| Other tab: ColorDebugStrip | 2 — designed | no-scroll | both |
| Other tab: freeform/registry band | 3 — unbounded | scroll v | both |

L5b (single scroll owner per axis per path) and L5c (chart-exclusion
fold) are both exercised by this encoding — verified: every leaf load
passes `wellformed.check_wellformed` with zero waivers (§1 confirms both
`.lyt` files load clean).

---

## 5. Item 2 — emitter retirement, verified inert

`emit_layout_tree.py`'s Exclusive branch no longer asserts every T-child
is `ast.Leaf`; `_collect_leaf_widgets` (a structural fold, total over
Leaf|Split|Exclusive) replaces the retired one-level `c.node.widget` read.
Regenerated both `.gen.ts` files and diffed against the pre-wave
committed versions:

```diff
-track: { kind: "elastic", minPx: 160, frWeight: 1 },
-node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: ["CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other"] },
+track: { kind: "elastic", minPx: 880, frWeight: 1 },
+node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: [15 leaf ids] },
```

(landscape and portrait diffs are shape-identical, differing only in the
`minPx` before-value, 160 vs 200.)

**Structural claim (provably inert): `node.kind` stays `"blackbox"`, the
same `widget: "controlPanel"`, the same `tag`.** `LytNode.vue` was read in
full to verify this: it branches only on `node.kind` (`'split'` recurses,
everything else — leaf or blackbox — is rendered as a terminal slot via
`#leaf-<widget>`); `childWidgets` is never referenced anywhere in that
file. The `childWidgets` diff is therefore provably inert for rendering.

**Non-inert, disclosed, intentional: `minPx` changes (160→880 landscape,
200→880 portrait).** This is the REAL geometric consequence of opening
CP-settings — not an emitter artifact. It is the honest number this wave
commissions, and its live-DOM consequence (whether the browser's CSS Grid
squeezes, overflows, or otherwise absorbs an 880px minimum track in a
column whose own live width may be narrower) is outside this wave's
solver-side scope and is named here as exactly the kind of live-behavior
question the realization wave inherits.

A parallel, disclosed-but-necessary fix was applied to `emit_mockup.py`
(the static-HTML mockup generator, not named in item 2's own text but
carrying the identical plain-leaf-T assertion, which crashed the same way
once CP-analysis/CP-settings became composites) — see SPEC-AMENDMENTS.md's
Amendment 6 entry, point 4, for the full disclosure of this scope note.

---

## 6. Item 4's disclosed simplification, and the orientation variant

**`settingsPane` is one opaque leaf, per the commission's own text.** Two
of its six possible bodies (Advanced Registry, Keybindings) are genuinely
`unbounded`/scroll-needed; the other four are `bounded`/`designed`/
no-scroll. A single leaf cannot carry two classifications for two
mutually-exclusive runtime states — this wave classifies `settingsPane`
as the WORST-CASE superset (`unbounded, scroll v`), which is honest
(never claims a state that could overflow undeclared) but over-reserves
scroll-affordance for the four bounded bodies. A future wave opening
CP-settings a SECOND level (a `T` of six named panes, mirroring
CP-analysis's own nested `T`) would let each body carry its true
classification — named here as the residual this wave leaves, not
silently absorbed.

**The vertical-tabs orientation variant was NOT implemented.** The brief
authorized implementing it "ONLY if the existing valuation machinery
accommodates it without new language surface; otherwise model the default
and file the variant honestly." Amendment 4's presence-valuation machinery
(`PresenceValuation`, widget-id-keyed absence sets) does not extend to a
STRUCTURAL variant (two different tree SHAPES for the same tab, not one
tree with some widgets absent) without new language surface — a second,
independent solve of an entirely different `V(pane, substrip)` tree (the
transposed order) would need its own registration-layer machinery this
prototype does not yet have. Filed honestly, per the brief's own
either/or: only the default (horizontal) orientation is modeled.

---

## 7. Cross-check mechanism (item 6)

`tests/test_lyt.py::test_analysis_tabs_cross_check_against_defaults_ts`
(parametrized over both encodings). Mechanism: regex-extracts
`frontend/src/store/defaults.ts`'s own `analysisTabs` array literal (the
SAME source file the frontend imports, never a hand-copied
transcription) into `[(tab_id, panel_count), ...]`; walks the loaded
`.lyt` tree to find the control-panel `T` node (structurally, by
`tag=='BLACK BOX'`, not by position) and its `CP-analysis` composite
child's own nested `T(AT-*)` group; asserts tab COUNT and per-tab PANEL
COUNT match.

**P7 level, disclosed:** a static-text-extraction regression, not a true
two-sided GENERATED artifact (a JSON snapshot both `defaults.ts`'s own
build and this Python suite would independently emit and diff). The
stronger form would need either a Node/TS build step wired into this
Python suite's fixtures (a new build-tooling dependency this research
prototype does not otherwise carry) or a `frontend/src`-side generator
emitting a snapshot for this suite to read (a `frontend/src` touch this
wave's solver-side-only scope forbids). This test clears the floor the
brief itself names as the minimum ("pure-prose correspondence is NOT"
acceptable) — it is mechanical, fails loudly, and reads the real
authority's own source text, not a hand-maintained mirror.

---

## 8. Solver results, advisory output, INFEASIBLE findings

Full `research/lyt` suite: **129 passed, 0 failed** (exit code 0).

**runner.py, default valuation, all representative sizes:**

| Class | Size | Status |
|---|---|---|
| landscape | 1920×1080, 2560×1440, 1280×1024 | **INFEASIBLE** (all 8 `OVERLAY_SIZES` landscape rows, verified directly, both `default` and `all-present` valuations) |
| portrait | 1080×1920 | **OPTIMAL** |

**The root cause, one finding, disclosed clearly.** `settingsPane`'s own
honest, ch-measured, no-scroll width floor (880px — §3 above) exceeds the
side column's own PRE-EXISTING, separately-ratified hard cap
(`max 340px+60ch` = 820px, from the W1 REPAIR/W4 FLOOR SOFTENING/TOOLBAR
REENCODE arcs). Since the column's cap is a constant independent of
viewport size, **this makes EVERY landscape screen size INFEASIBLE, at
both presence valuations** — not a narrow-viewport-only finding. Portrait
solves at its two widest representative sizes under `default`
(1080×1920, 1200×1600) and its single widest under `all-present`
(1200×1600); every narrower portrait probe is now also short of the
880px floor.

**This was NOT papered over.** No declared demand was weakened to force
feasibility — the 880px number is the honest ch-measured envelope the
commission itself asked for. Options for the commissioner, named rather
than pre-decided: (a) raise the side column's own `max` cap (a
feasibility-pin change to a separately-negotiated, pre-existing ceiling —
out of this wave's own remit to make unilaterally); (b) rule that the
settings sub-tab strip MAY scroll horizontally after all (revisiting the
§8.4 "no-scroll" ruling for that one row specifically); (c) reduce the
sub-tab label set or move to icon-only tabs at the widest breakpoint. All
three are live-DOM/product decisions this wave correctly does not make.

**Advisory output** (`research/lyt/advisory.py`, per-T-group shortfall,
`pref`-measured, ADR-0011 Rule 5 advisory-only) is real and non-degenerate
— portrait 1080×1920, default valuation:

```
T-group 'root/V3/H1' (shared rect 936x880):
  [0] CP-library      demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [1] CP-cards        demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [2] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [3] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [4] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
T-group 'root/V3/H1/T3/V1' (shared rect 936x796):
  [0] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [1] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [2] (V-split)       demand=  n/a (fr)  shortfall(w,h)=(n/a,n/a)
  [3] AT_multires     demand=     580px  shortfall(w,h)=(0,0)
```

(`demand=n/a (fr)` for composite/elastic children is the advisory's own
disclosed limitation — `pref` is only reported for `min=pref=max`-fixed
leaves; `AT_multires`, the one bare-leaf T-child in this program, is the
one row it CAN report a demand for, and it reports zero shortfall — the
group's own shared rectangle, 936×796, exactly satisfies its 580px
demand at this size.)

**Every feasibility-pin-adjacent test updated, individually disclosed**
(see §9 for the exact list) — none silently left pinned against a stale
expectation.

---

## 9. Test changes (full list, all in `tests/test_lyt.py`)

- One pre-existing fixture's own inline `domain='blackbox'` literal
  (`test_fr_bound_without_enclosing_split_is_refused`) updated to
  `'common'` — unrelated to this wave's own encodings, a mechanical
  consequence of the `Domain` retirement.
- `test_lengyue_landscape_default_valuation_solves_optimal` — all 4
  parametrized sizes flipped OPTIMAL→INFEASIBLE, with a docstring naming
  the root cause.
- `test_lengyue_portrait_default_valuation_solves_optimal_at_420x880` —
  flipped OPTIMAL→INFEASIBLE, same root cause, narrower portrait width.
- `test_tiling_invariants_hold_on_every_solvable_encoding` — the
  landscape row DROPPED (no size solves any more, all-present or
  default; the test's own purpose, sanity-checking tiling math on a
  successful solve, has nothing left to exercise for landscape); the
  portrait row WIDENED from 1080×1920 to 1200×1600 (also now
  all-present-infeasible at 1080×1920 for the same root cause).
- `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
  — `known_infeasible_by_valuation` set rebuilt from a direct re-solve of
  every `OVERLAY_SIZES` row under both valuations (not hand-guessed),
  with a dated "OPTION C UPDATE" docstring append.
- `test_portrait_composite_row_carries_the_board_priority_cap`,
  `test_tree_panels_t_node_track_carries_its_derived_floor` — pinned
  track literals updated 160/200px → 880px (the T-node's own
  componentwise-max floor, now dominated by `settingsPane`).
- New: `test_analysis_tabs_cross_check_against_defaults_ts` (§7).

None of these are silent — every one carries an inline docstring/comment
naming the Option C wave and the mechanism, per this codebase's own
established disclosure discipline (Amendment 1/4's own precedent for
updating feasibility pins after a ratified change).

---

## 10. ADR-0000 closure statements

**Blackbox re-homing (item 1).** Invariant: a leaf's subject-matter
classification (`domain`) and "the encoding models no further past this
node" (a recursion base case) are orthogonal facts; the type must not
conflate them. Quantification universe: every `Leaf` construction site in
this repository — the loader's concrete-syntax path, and every direct
`ast.Leaf(...)` construction in Python (`synthesize.py`'s
`_instantiate_blackbox`, `tests/test_lyt.py`'s own fixtures) — enumerated
and updated; no sibling site left with `domain='blackbox'`. Denomination:
the bound is a closed-vocabulary membership check (`Domain`'s own 5
literals, `VALID_DOMAINS`), not a string-pattern heuristic.

**Emitter retirement (item 2).** Invariant: every consumer of the `Slot`
tree is a structural fold, total over `Leaf | Split | Exclusive`.
Quantification universe: `emit_layout_tree.py`'s Exclusive branch (closed
this wave) and `emit_mockup.py`'s analogous branch (closed this wave, a
disclosed scope extension); `LytNode.vue`'s own terminal-T case and the
generated `blackbox` node-kind vocabulary are NAMED as still
depth-assuming (the consult's own §6.2 enumeration) and explicitly left
open — a declared residual, not a silent gap.

---

## 11. Witness statuses

- Full `research/lyt` pytest suite: **WITNESSED**, 129 passed, exit 0.
- `frontend`: `npm install` (fresh worktree, no prior `node_modules`),
  `npm run build` (`vue-tsc -b && vite build`): **WITNESSED**, exit 0,
  zero `frontend/src` source changes beyond the two regenerated
  `.gen.ts` files.
- `frontend`: `npm run test:run`
  (`NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2`): **WITNESSED**, exit 0, 3050 passed / 8 skipped
  (242 test files passed, 3 skipped).
- Emitted `.gen.ts` diff structural-inertness claim (verified against
  `LytNode.vue`'s own full source): **WITNESSED**.
- Live Playwright re-measurement of the ESTIMATED panel heights (§3):
  **UNEXERCISED** — no live app run this session; blocker: none of the
  estimated numbers were flagged as contested by any prior instrument,
  so the probe-isolation protocol was not warranted this wave (see §3's
  own closing paragraph).
- CP-settings orientation-variant solve: **UNEXERCISED** — not
  implemented, per §6's own disclosure (the existing valuation machinery
  does not accommodate a structural variant without new language
  surface; filed honestly per the brief's own either/or).

---

## 12. Files touched

Python (`research/lyt/`): `lyt_ast.py`, `parser.py`, `loader.py`,
`emit_layout_tree.py`, `emit_mockup.py`, `synthesize.py`,
`tests/test_lyt.py`.

Encodings (`research/lyt/encodings/`): `lengyue_landscape.lyt`,
`lengyue_portrait.lyt`, `current_row_asis.lyt`, `current_row_repaired.lyt`
(the latter two: mechanical re-homing only, no structural change).

Docs: `research/lyt/SPEC.md` (§1 domain description, §13.2 dated gloss,
new §14 "Amendment 6"), `research/lyt/SPEC-AMENDMENTS.md` (new "Amendment
6" entry), `research/lyt/README.md` (new "AMENDMENT 6" section).

Generated (regenerated, not hand-edited): `frontend/src/state/
lyt-layout.gen.ts`, `frontend/src/state/lyt-layout-portrait.gen.ts`.

`frontend/FILES.md`: **not touched** — no `frontend/src` file created,
moved, or deleted; the two `.gen.ts` files' own FILES.md rows (if any)
describe their generation mechanism, not their contents, and are
unaffected by a data-only regeneration.

---

## 13. Commit and merge-base

Committed on this worktree's own branch. Final message reports the
commit sha and a fresh merge-base check against `lyt-phase2`'s current
tip, per the brief's own last-act instruction.
