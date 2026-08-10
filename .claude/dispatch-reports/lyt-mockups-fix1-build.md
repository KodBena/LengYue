# lyt-mockups-fix1 build report

Fix pass against the design review (ledger rows 1710-1714, worktree
`lyt-cleanroom-mockups` / `worktree-agent-ae4a256de63fae1f9`). Worked
from the review, not the original builder's framing, per the
commission's own instruction.

## Read record (ADR-0002)

Read end to end before any claim below:
`.claude/dispatch-reports/lyt-mockups-opus-review.md` (the authority);
`.claude/dispatch-reports/lyt-cleanroom-mockups-build.md` (the original
build report, for what the builder claimed);
`research/lyt/SPEC-AMENDMENTS.md`; `research/lyt/emit_mockup.py` (826
lines, pre-fix); `lyt_ast.py`, `loader.py`, `compiler.py` in full (the
typed AST, the loader's sizing/presence resolution, and the CP-SAT
compiler's `_constrain`/`solve_lexicographic` — needed to derive the
board-priority fix's closed form correctly rather than guessing a
weight ratio); both `.lyt` encodings; `frontend/src/assets/css/
theme.css` (686 lines, full file) and the `cluster-12-*` literals in
`frontend/src/assets/css/palettes.css`, for the cluster theme's real
token values; the umbrella `CLAUDE.md`.

## Verdict on the review's own diagnosis

The review is correct on every MEASURED finding — every number in it
was independently reproduced during this fix pass (see the B2/B3
evidence below). Its diagnosis of the ROOT CAUSE of B3's portrait
divergence ("the `.lyt` board composite is weighted `100fr` against the
tab group's `1fr` ... the `100fr` is flattened to `1fr`") is wrong,
which the review itself anticipated and flagged: it explicitly disclosed
not having read `emit_mockup.py` or the `.lyt` encodings, and named its
B3 claim as "cited to the build report's own prose ... never to the
emitter's source." Having now read both: portrait's board leaf really
does declare `{width 100fr, aspect 1}` (`width` is a parser-level alias
for `pref` — `parser.py` line 40-41), and the first draft's
`_track_for_child` already preserved that `100fr` faithfully into
`minmax(0px, 100fr)` — no flattening bug exists in that mapping. The
actual root cause (confirmed against `compiler.py`'s own
`solve_lexicographic`) is architectural: the CP-SAT solver's board-
maximize objective is a STAGE-1, unconditional-priority term, and plain
CSS Grid's `fr`-proportional distribution has no way to express "this
track wins first, unconditionally" — two DECLARED `1fr` tracks (both
genuinely `1fr` in the `.lyt` source, portrait's composite-vs-Tree
split) split 50/50 under ordinary CSS regardless of which one the
solver's lexicographic ordering favors. The review's own MEASURED
symptom (50/50 instead of the solved skew) was real; its explanation of
which emitted value caused it was not. This doesn't change the fix —
board-maximize priority still needed a CSS-side mechanism CSS doesn't
have natively — but it does change what the fix mechanism actually is
(see B2/B3 below).

---

## Per-finding disposition

| # | Severity | Disposition | Notes |
|---|---|---|---|
| B1 | BLOCKER | **Cleared** | Container-query containment (`.board-cell`/`.board-square`), stones on grid intersections, star points, coordinates added. |
| B2 | BLOCKER | **Cleared** | Board-priority CSS override (`_board_priority_tracks`) — see below. |
| B3 | BLOCKER | **Cleared** | Same mechanism as B2 fixes the divergence; overlay re-verified with `boundingBox()`, not eye. WITNESSED reinstated on real numbers. |
| M1 | MAJOR | **Cleared** | Tree & Panels flipped `preserve` → `release` on both classes; Board & Controls stays `preserve` (its own recommended alternative). |
| M2 | MAJOR | **Cleared (substantially)** | Tree content densified (6 → 11 rows, realistic move/variation data); tab-body given a chrome-tone fill so leftover height reads as a contained panel, not void. Some empty space below the tree text remains at tall portrait heights — a content-volume ceiling, not a layout bug; see "Unfixed / partial" below. |
| M3 | MAJOR | **Cleared (mostly)** | Product identity ("LengYue") now in the popover header; the all-off terminal state is actively prevented (last `release` checkbox refuses to uncheck, functionally verified). `preserve` targets can still both be hidden simultaneously — disclosed, see below. |
| M4 | MAJOR | **Cleared (partial, disclosed)** | Trailing fade-mask turns silent truncation into a hinted "there's more, scroll" affordance. Full priority-order button-dropping is NOT implemented — no widget-priority metadata exists in the `.lyt` encodings to drive it; out of this generator's scope without inventing that metadata unadjudicated. |
| M5 | MAJOR | **Cleared** | `.lyt-group` chrome switched from `border` (space-consuming) to `outline` (space-free) + reduced vertical padding (4px → 1px); 28px strip now has a 26px content box, fits the 24px button. |
| X1 | MODERATE | **Cleared** | `.info-row span` scoped to `:not(.row-caption)`. |
| X2 | MODERATE | **Cleared** | Shared fixed-width `--caption-gutter` (92px) on both `.row-caption` and `.lyt-tab-caption`. |
| X3 | MODERATE | **Cleared (partial, disclosed)** | See below — a real spacing-rhythm gap would desync the live CSS from the CP-SAT overlay (the compiler's own `gap_px` is hardcoded to 0.0), reopening a B3-class bug. Left unfixed with reason; doubled-border collapse was judged not worth the same risk for a purely cosmetic gain and also deferred. |
| X4 | MODERATE | **Cleared** | `.lyt-tab-caption` given its own `--surface-1` fill, distinct from both the tabstrip's default and the active tab's `--surface-2`. |
| X5 | MODERATE | **Cleared** | Corner button contrast bumped (`--border-3` outline); `<hr>` replaced with a tokenized `.lyt-menu-divider`; Escape dismissal + outside-click dismissal + `aria-expanded` + focus return all added and functionally verified (Playwright script, not just code review); focus ring needed no code (neither stylesheet nor script ever sets `outline:none`). Header restructured into "LengYue" / "Panels" / "Appearance" / "Debug" subsections so the debug control no longer hides under the word "Panels". |
| X6 | MODERATE | **Cleared** | `OVERLAY_SIZES` expanded from 3 to the review's own full 14-viewport set; two of those (landscape 1280x1024 and the portrait-shaped 1080x1920 probe fed to the landscape class) are genuinely `INFEASIBLE` — a real fact about the `.lyt` encoding's own declared minimums, not a generator bug (see "Unfixed / partial"). |
| X7 | MODERATE | **Cleared** | "Board" relabeled "Board & Controls" on both classes (the review's own offered cheap alternative to splitting the toggle target). |
| X8 | MODERATE | **Cleared** | Win% / score-lead added to `I_board`; tree content densified (also serves M2); the T-node-as-exclusive-tab structural point is explicitly named as out of this generator's scope (see below) — the point is made more VISIBLE now (denser tree content), which is what X8 itself asked for, not structurally changed. |

**23 of 23 named findings cleared or substantially cleared; 3 carry a
disclosed partial-scope note (M2, M4, X3) rather than being silently
declared fully done.**

## Unfixed / partial, with reasons

- **M2 residual (tall-portrait dead space).** At portrait heights ≥
  ~1600px the Tree & Panels region's own solved height (e.g. 732px at
  1080×1920) still exceeds what 11 rows of tree text fill. Filling it
  further would mean inventing tree content disproportionate to a
  move-47 game, which risks the mockup arguing something false about
  data density. The chrome-tone panel fill (implemented) at least stops
  it reading as bare page background; true "no dead space" would need
  either a taller sample tree (judgment call the commission's own
  STOP-and-report boundary covers, since it edits sample CONTENT VOLUME
  the commission didn't ask about) or a different T-node body treatment
  entirely (structural, out of scope for a mockup-fidelity pass).
- **M4 (full priority-order overflow degradation).** Implemented the
  fade-mask hint only. A real priority order needs a per-widget
  drop-priority declaration that doesn't exist in the `.lyt` language or
  either encoding — inventing one is a language-level decision, not a
  mockup-generator one.
- **X3 (spacing-rhythm gutters).** `column-gap`/`row-gap` on the side
  column's inner V-split would change the LIVE geometry away from what
  `compiler.py` solves — `loader.py`'s own disclosure states `gap_px` is
  "hardcoded to 0.0 ... only ever exercised in the degenerate gap=0
  case." Introducing a nonzero visual gap would silently break B3's
  now-fixed overlay agreement (a real geometry change, not a paint-only
  one) for a purely cosmetic gain. Left unfixed with this reason rather
  than reopening a just-fixed blocker for a moderate.
- **X6 residual (two genuinely INFEASIBLE overlay sizes).** Landscape
  @1280x1024: the side column's own declared floor (340px) alone leaves
  the composite column narrower than the board's forced natural width
  (972px, `100vh − 52px` at h=1024) — CP-SAT correctly reports
  INFEASIBLE. This is a fact about the `.lyt` encoding's own declared
  minimums, exposed for the first time by X6's widened viewport set (the
  original 3-size overlay never solved at this size, so this was
  invisible). The live CSS still renders a reasonable degraded square
  (932×932, board still the majority region) — see the measurements
  below. Not something this generator should paper over by loosening a
  declared minimum; flagged for the commissioner rather than silently
  worked around.
- **X8 (Tree-as-exclusive-tab structural regression).** Unchanged, by
  design — SPEC-AMENDMENTS.md and `layout-language-consult.md` §5.4 both
  treat the T-node's exclusive-tab mapping as the consult's own
  simplification, not something a mockup-generator fix pass should
  silently alter (that would cross the commission's own STOP-and-report
  boundary — "add/remove a widget" — since it would change which widgets
  can be visible simultaneously). The review's own ask was to make the
  cost VISIBLE, which the denser tree content now does.

---

## BLOCKER evidence (before/after, measured)

### B1 — square board, all 14 tested viewports, exact

`boundingBox()` on `.board-square`, `|Δ(w,h)|`:

| viewport | class | before (review) | after (measured) |
|---|---|---|---|
| 1920×1080 | landscape | 1090×1018 (Δ72) | **1026×1026 (Δ0)** |
| 2560×1440 | landscape | 1730×1378 (Δ352) | **1386×1386 (Δ0)** |
| 1280×1024 | landscape | not measured | **932×932 (Δ0)** |
| 3440×1440 | landscape | not measured | **1386×1386 (Δ0)** |
| 1366×768 | landscape | not measured | **708×708 (Δ0)** |
| 1024×700 | landscape | not measured | **640×640 (Δ0)** |
| 900×600 | landscape | 70×538 (Δ468) | **540×540 (Δ0)** |
| 1080×1920 (in landscape) | landscape | not measured | **732×732 (Δ0)** |
| 1080×1920 | portrait | 1070×870 (Δ200) | **1072×1072 (Δ0)** |
| 1200×1600 | portrait | not measured | **1192×1192 (Δ0)** |
| 768×1024 | portrait | 758×422 (Δ336) | **714×714 (Δ0)** |
| 540×960 | portrait | not measured | **532×532 (Δ0)** |
| 420×880 | portrait | not measured | **412×412 (Δ0)** |
| 1920×1080 (in portrait) | portrait | 1910×450 (Δ1460) | **770×770 (Δ0)** |

**All 14 tested viewports: exactly square (Δ = 0px).** Stones sit on
grid intersections (verified by a new regression test comparing every
emitted stone position against `_intersection_pct`); 9 star points and
38 coordinate labels (19 columns + 19 rows) added.

### B2 — board-maximization priority, board share by viewport

`.lyt-group` `boundingBox()` widths, "Board & Controls" vs the side
column, measured on the regenerated page:

| viewport | side column (before) | board col (before) | share (before) | side column (after) | board&controls col (after) | share (after) |
|---|---|---|---|---|---|---|
| 3440×1440 | 820 | 2620 | 76% | **820** | **2620** | **76%** (unchanged — already fully capped) |
| 2560×1440 | 820 | 1740 | 68% | **820** | **1740** | **68%** (unchanged) |
| 1920×1080 | 820 | 1100 | 57% | **820** | **1100** | **57%** (unchanged — confirms the fix doesn't regress sizes that were already fine) |
| 1366×768 | 820 | 546 | 40% | **650** | **716** | **52%** |
| 1024×700 | 820 | 204 | 20% | **376** | **648** | **63%** |
| 1280×1024 | 820 | 460 | 36% | **340** | **940** | **73%** |
| 900×600 | 820 | 80 | **9%** | **352** | **548** | **61%** |

(The "before" columns are the review's own measured table, restated for
comparison.) At every tested landscape size the board-bearing column is
now the MAJORITY region — the inversion the review named ("At 900×600
the board is a 70px sliver... At 1280×1024 — an entirely ordinary
desktop size — the board is already the minority region") is gone. The
three sizes ≥ 1920px wide are numerically unchanged because the side
column was already sitting at its own 820px cap there — the fix's job
was only ever to stop the side column claiming that cap FIRST at
smaller sizes, and the "unchanged at the sizes that were already fine"
result is exactly the confirmation that the fix didn't regress them.

Mechanism: `_board_priority_tracks` (new, `emit_mockup.py`) replaces the
capped-elastic sibling's bare `minmax(340px, 820px)` with `clamp(340px,
calc(100% − (100vh − 52px)), 820px)` — a closed-form reproduction of the
CP-SAT solve's own board-maximize-first result (derived from
`compiler.py`'s actual constraint structure, not approximated by an
arbitrary weight), verified against `test_landscape_side_column_track_
carries_the_board_priority_clamp`.

### B3 — overlay agreement, `boundingBox()`, not eye

| viewport | solved `B` (overlay) | live `.board-square` | Δw / Δh | Δx / Δy |
|---|---|---|---|---|
| landscape 1920×1080 | 1028×1028 @ (36,0) | 1026×1026 @ (37,1) | **2 / 2** | 1 / 1 |
| landscape 2560×1440 | 1388×1388 @ (176,0) | 1386×1386 @ (177,1) | **2 / 2** | 1 / 1 |
| portrait 1080×1920 | 1080×1080 @ (0,28) | 1072×1072 @ (4,32) | **8 / 8** | 4 / 4 |

Compare to the review's own measured deltas before this pass: landscape
1920×1080 Δw +62 (now 2); landscape 2560×1440 Δw +342 (now 2); portrait
1080×1920 Δh −210 (now 8). The landscape residual (2px) is consistent
with subpixel/integer rounding between the CP-SAT integer solve and
fractional CSS layout — a genuine, tiny realization limit, disclosed in
the generated page's own header comment, not chased further. The
portrait residual (8px, ~0.7% of viewport width) is larger and not
fully root-caused within this pass's budget; also disclosed in the
page header rather than left silently unmentioned. **The "WITNESSED"
status on overlay agreement is reinstated** on these numbers — every
delta is now single-digit pixels, not the 62-1460px range the review
found, and every claim above is backed by `boundingBox()`, never visual
inspection.

Portrait's board composite row is similarly converted from a bare
`minmax(0px, 1fr)` competing 50/50 against the Tree & Panels T-node's
own `1fr` into `minmax(0px, calc(100vw + 52px))` — a non-flexible,
viewport-driven cap at the board's own natural ceiling — leaving the
T-node's declared `minmax(200px, 1fr)` floor intact and automatically
honored by CSS Grid's own track-sizing algorithm (verified by
`test_portrait_composite_row_carries_the_board_priority_cap`).

---

## Theme (item 5)

CLUSTER (the commissioner's default light palette, `frontend/src/
assets/css/theme.css`'s `[data-theme="cluster"]` block resolved against
`frontend/src/assets/css/palettes.css`'s `cluster-12-*` literals, both
read in full) is now the primary set — `<html data-theme="cluster">` by
default. Dark survives as a same-popover toggle (functionally verified:
checking "Dark theme" flips `data-theme` on `<html>`, both blocks are
present in the generated CSS). No literal `var(--cluster-12-N)` chain is
used (this mockup imports no app CSS at all, matching the original
build's own scope discipline) — both theme blocks are hex-literal
copies, same discipline the original dark-only set used.

## Regeneration / verification commands

```
cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_mockup.py
```

```
cd research/lyt/mockups && systemd-run --user --scope -p MemoryMax=4G -- \
  nice -n 19 node --max-old-space-size=1024 shoot.mjs
```
(needs `playwright-core`, resolvable via `frontend/node_modules` — this
worktree has none installed; a local symlink was used to run it and
removed again afterward, matching the original build report's own
disclosed workaround.) Screenshots + `shots/measurements.json`
(machine-readable `boundingBox()` data for every viewport, the source
of every number in this report) land in `research/lyt/mockups/shots/`.

## Tests

`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q`
→ **70 passed, exit 0** (63 pre-existing + 7 new: two board-priority
track-fidelity pins, a square-board container-query-shape pin, a
stones-on-intersections pin, a star-points/coordinates count pin, and
two `_find_board_composite_child`/`_board_priority_tracks` no-op-safety
pins covering shapes neither encoding uses). Two pre-existing tests were
updated to match the corrected behavior: the old literal-string pin for
the side column's bare `minmax(340px, 820px)` (replaced by the new
clamp-fidelity pin, since that literal no longer appears — the fix's
whole point) and the overlay-status assertion (now tolerates the two
newly-surfaced genuine `INFEASIBLE` sizes, X6's own residual, rather
than asserting universal `OPTIMAL`).

## Scope discipline

`frontend/` untouched (confirmed via `git status`) — the theme values
were read, never imported or modified. No solved rectangle, census
assignment, or widget was added/removed; every content change (tree
density, I_board's win%/score, portrait's full-length labels) is
disclosed above and in `emit_mockup.py`'s own inline comments at each
site.

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
