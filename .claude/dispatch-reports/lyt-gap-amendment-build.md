# lyt-gap-amendment build report

LYT language amendment 3 (ledger row 1715): split nodes gain an optional
uniform gap declaration. Worktree
`/home/bork/w/omega/.claude/worktrees/agent-ae4a256de63fae1f9`, branch
`worktree-agent-ae4a256de63fae1f9`, base commit `e750c658`.

## Read record (ADR-0002)

Read end to end before any implementation: `research/lyt/README.md`
(191 lines); `research/lyt/SPEC-AMENDMENTS.md` (pre-amendment, 223
lines); `research/lyt/parser.py`'s grammar notes (module docstring,
lines 1-72); `.claude/dispatch-reports/lyt-mockups-fix1-build.md` (281
lines) and `lyt-mockups-fix2-build.md` (281 lines); `research/lyt/
lyt_ast.py` in full; `research/lyt/loader.py` in full; `research/lyt/
compiler.py`'s `_constrain`/`_extract_rects` (the gap-consuming
sections, read alongside their surrounding context); `research/lyt/
wellformed.py`'s L2 dominance section (the `n.gap_px` reference at line
38); `research/lyt/emit_mockup.py`'s `render_split`/`_board_priority_
tracks`/`_find_board_composite_child` in full; both clean-room `.lyt`
encodings; `frontend/src/assets/css/theme.css`'s `--space-*` scale
(lines 520-546, read with its surrounding comment block); the umbrella
`CLAUDE.md`; `frontend/CLAUDE.md` (surfaced by the harness as in-scope
context for this session even though no `frontend/` file was touched).

## Per-claim WITNESSED status

| # | Claim | Status |
|---|---|---|
| 1 | Optional gap clause syntax on H/V splits, px-only, fr/ch refused loudly | WITNESSED — `research/lyt/parser.py` (`RawSizing.gap`, `parse_sizing`'s `gap` branch), `research/lyt/loader.py` (`_load_gap_px`); pinned by `tests/test_lyt.py::test_gap_parses_and_loads_onto_the_split_node`, `test_gap_refuses_elastic_or_ch_units_loudly[8fr]`, `[8ch]`, `test_gap_refuses_symbolic_extent_loudly` |
| 2 | T nodes refuse gap | WITNESSED — `loader.py`'s Exclusive branch calls `_load_gap_px(..., node_kind="exclusive")`; pinned by `test_gap_refuses_on_t_node` |
| 3 | Leaves refuse gap (extra, not explicitly asked but the same law) | WITNESSED — `test_gap_refuses_on_leaf` |
| 4 | `Split.gap_px` field already existed, loader's 0.0 hardcode + F10 comment removed | WITNESSED — diff of `loader.py`'s Split branch; F10-era comment replaced with an AMENDMENT 3 pointer in both the module docstring and the branch itself |
| 5 | Compiler's `(k-1)*gap` partition term verified against a hand-computed case | WITNESSED — `test_gap_shifts_solved_rectangles_by_the_hand_computed_amount` (a 100px/200px V-stack with `gap 10px` at a viewport whose height is exactly 310, zero slack; both children's solved rects pinned, `mid.y == 110` not `100`) |
| 6 | Unfittable gap is a loud INFEASIBLE | WITNESSED — `test_unfittable_gap_is_a_loud_infeasible_not_silently_dropped` (same shape, `h_px=309`, one px short → `status == "INFEASIBLE"`) |
| 7 | SPEC-AMENDMENTS.md carries Amendment 3 (rationale, syntax, semantics) | WITNESSED — new section between Amendment 2 and License |
| 8 | emit_mockup.py realizes gap as CSS grid gap | WITNESSED — `render_split`'s `gap_style` (native `column-gap`/`row-gap`, axis-matched) |
| 9 | Verification overlay stays exact after the gap plumbing | WITNESSED — `shoot.mjs` re-run: landscape 1920×1080/2560×1440 overlay-vs-live `dw/dh = 2px` (unchanged from the fix1 report's own residual, a subpixel/integer-rounding artifact, not a new divergence); portrait 1080×1920 `dw/dh = 8px` (also unchanged). Board stays exactly square (`Δ=0.0`) at all 14 measured viewports. |
| 10 | Tasteful gaps added to both clean-room encodings, mapped to theme.css tiers, documented in-file | WITNESSED — see tier mapping below and each `.lyt` file's own header comment |
| 11 | Baseline/as-is encodings untouched | WITNESSED — `git status` shows no change to `current_row_asis.lyt`, `current_row_repaired.lyt`, `q5go.lyt`, `ogs.lyt`, or the three `current_row_wart_*.lyt` fixtures |
| 12 | Infeasibility findings disclosed, not silently dropped | WITNESSED — see "Infeasibility finding" section below |
| 13 | Power-set verifier: 0 violations, all states | WITNESSED — see run transcript below |
| 14 | pytest: 76+ green plus new gap tests | WITNESSED — 84 passed (76 pre-existing + 8 new), exit 0 |

## Chosen syntax, with grammar-fit rationale

```
{min 340px, pref 32fr, max 340px+60ch, gap 8px} V( ... )
```

`gap <extent>` is one more key in the existing sizing block's
comma-separated `key value` bag (`layout-language-consult.md` line
279-280's `sizing` production), the same shape `aspect <number>`,
`envelope: {states}`, `width <extent>`, `aspect-coupled`, and
`drag-persisted` already use — all of them "one more recognized key,"
never a new grammar production. `gap` follows that precedent exactly:
one more branch in `Parser.parse_sizing`, no change to `parse_node` or
the split production itself. The alternative (a dedicated clause
outside the braces, or a positional term between `H`/`V` and the
opening paren) would be the first genuinely NEW syntax shape this
parser has ever introduced for a sizing-adjacent concept, with no
precedent in either the base grammar or this parser's own disclosed
extensions — rejected for that reason.

The parser accepts any extent unit in `gap` position (permissive, per
this module's own stated "parser permissive, loader refuses"
architecture); `loader.py`'s `_load_gap_px` is where the amendment's
actual law is enforced — px-only, `fr`/`ch`/extent-sums/symbolic
sentinels all refused with `detail.law == "gap-declaration"`,
`detail.prohibition == "non-px-gap"`; T-node and leaf refusals carry
`detail.node_kind`.

## Tier mapping

Read in full: `frontend/src/assets/css/theme.css`'s "Four tiers for
gap, padding, margin" comment block (lines 520-546). Its four tiers:
`--space-tight` (4px, "button-cluster gaps, icon spacing, tight
rows"), `--space-default` (8px, "default chrome"), `--space-medium`
(12px, "section-level gap, content-block separation"), `--space-loose`
(20px, "block-level gap, large content separation").

| Encoding | Split | Tier chosen | Rationale |
|---|---|---|---|
| `lengyue_landscape.lyt` | outer `H(...)` (board area vs. side control column) | `--space-medium` (12px) | Down-tiered from an initial `--space-loose` (20px) probe — see "Infeasibility finding" below. Still the "between the page's two MAJOR REGIONS" case the tier name describes. |
| `lengyue_landscape.lyt` | side column's `V(...)` (go-actions/engine-info/common-actions/tree-panels stack) | `--space-tight` (4px) | The theme comment's own words almost verbatim: "button-cluster gaps ... tight rows" — this IS a stack of narrow control rows. |
| `lengyue_portrait.lyt` | root `V(...)` (top-actions/board-group/engine-info/tree-panels, 4 children) | `--space-medium` (12px) | A 4-way stack in a narrower viewport than landscape's 2-way split; `--space-loose` was probed too (all 6 representative sizes stayed `OPTIMAL`) but `--space-medium` was chosen as the disclosed, deliberate pick — three loose gaps cost 60px of vertical rhythm the portrait class can less afford, not an infeasibility workaround. |

**Deliberately NOT gapped:** the board composite's own inner `V(B,
I_board, A_board)` in both encodings. Adding a gap there would change
`_find_board_composite_child`'s `fixed_sum` derivation (currently
52px = 24+28, pinned literally as `--board-fixed-sum:52px;` by the
N3 regression test from `lyt-mockups-fix2-build.md`) — feasible to
patch correctly (one more term in that function), but judged
not worth reopening a just-fixed, precisely-pinned mechanism for a
gap whose absence doesn't read as a defect (the info/action strips
already sit flush under the board, which reads as "attached to it,"
not "crowded"). Disclosed here rather than silently declared
"tasteful gaps everywhere."

## Infeasibility finding

The first probe used `--space-loose` (20px) uniformly on landscape's
outer split. Re-solving at the runner's/mockup's representative sizes
(`OVERLAY_SIZES["landscape"]`, 8 viewports) found:

| viewport | pre-amendment (gap 0) | gap 20px (probe) | gap 12px (committed) |
|---|---|---|---|
| 1920×1080 | OPTIMAL | OPTIMAL | OPTIMAL |
| 2560×1440 | OPTIMAL | OPTIMAL | OPTIMAL |
| 1280×1024 | INFEASIBLE (pre-existing, X6 residual) | INFEASIBLE | INFEASIBLE |
| 3440×1440 | OPTIMAL | OPTIMAL | OPTIMAL |
| 1366×768 | OPTIMAL | OPTIMAL | OPTIMAL |
| 1024×700 | OPTIMAL | OPTIMAL | OPTIMAL |
| **900×600** | **OPTIMAL** | **INFEASIBLE (regression)** | **OPTIMAL** |
| 1080×1920-in-landscape | INFEASIBLE (pre-existing, X6 residual) | INFEASIBLE | INFEASIBLE |

`900×600` genuinely regresses from `OPTIMAL` to `INFEASIBLE` under the
`--space-loose` gap — a real finding, not silently dropped. Reduced to
the next tier down (`--space-medium`, 12px), which restores `900×600`
to `OPTIMAL` while leaving every other viewport's feasibility status
identical to the gap-0 baseline (the two `INFEASIBLE` viewports were
already infeasible before this amendment, per the fix1 report's own
X6 disclosure — unrelated to gap, unaffected by gap tier). This is
committed in `lengyue_landscape.lyt`'s own header comment.

Portrait was probed at `--space-loose` (20px) on its root `V(...)`
too, as a check: all 6 representative sizes stayed `OPTIMAL` (no
regression found there), so `--space-medium` (12px) for portrait is a
disclosed stylistic choice, not an infeasibility workaround — also
recorded in that file's own header comment.

## Power-set result

```
$ systemd-run --user --scope -p MemoryMax=4G -- \
    nice -n 19 node --max-old-space-size=1024 research/lyt/mockups/verify_power_set.mjs
[verify_power_set] landscape: walked 32/32 states, 8 N2 guard checks
[verify_power_set] portrait: walked 16/16 states, 6 N2 guard checks
=== power-set verification summary ===
  landscape: 32/32 states walked, 8 N2 guard checks, all restore-all deep-equal to baseline
  portrait: 16/16 states walked, 6 N2 guard checks, all restore-all deep-equal to baseline
  total violations: 0
[verify_power_set] PASSED
```

Zero violations, all 48 states, both classes — the addition of two new
`gap` declarations (root split + side column, landscape; root split,
portrait) did not disturb the N1/N2/B1 mechanisms the fix passes
established.

`shoot.mjs` re-run (screenshots + `measurements.json` regenerated in
place): board stays exactly square (`Δ=0.0`) at all 14 measured
viewports; overlay-vs-live deltas at the three `OVERLAY-VERIFICATION`
sizes are unchanged from the fix1 report's own residuals (landscape
`dw/dh=2px`, portrait `dw/dh=8px` — both disclosed there as
subpixel/rounding artifacts, not a new divergence introduced by this
amendment).

`research/lyt/mockups/node_modules` was a temporary symlink to
`/home/bork/w/omega/frontend/node_modules` (this worktree ships none
of its own), removed after both Playwright scripts finished — same
disclosed workaround the fix1/fix2 build reports used.

## Pytest

```
$ nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q > pytest.log 2>&1; echo "EXIT:$?"
EXIT:0
84 passed in 1.58s
```

76 pre-existing + 8 new: `test_gap_parses_and_loads_onto_the_split_node`,
`test_gap_refuses_elastic_or_ch_units_loudly[8fr]`, `[8ch]`,
`test_gap_refuses_symbolic_extent_loudly`, `test_gap_refuses_on_t_node`,
`test_gap_refuses_on_leaf`,
`test_gap_shifts_solved_rectangles_by_the_hand_computed_amount`,
`test_unfittable_gap_is_a_loud_infeasible_not_silently_dropped`. Two
pre-existing tests were updated to match the corrected/extended
behavior (not silently left stale): `_tiling_violations`' own
independent partition-sum re-derivation now includes the `(k-1)*gap`
term (it previously assumed gap was always 0, which was true of every
fixture until this amendment); `test_landscape_side_column_track_
carries_the_board_priority_clamp`'s pinned clamp string gained the new
`- 12px` term the CASE A gap-subtraction fix introduces.

## What changed, file by file

- `research/lyt/parser.py` — `RawSizing.gap` field; `parse_sizing`'s
  new `gap` branch; module docstring's AMENDMENT 3 grammar note.
- `research/lyt/loader.py` — `_load_gap_px` (new); wired into all
  three `load_slot` branches (split resolves it, leaf/T refuse it);
  module docstring gains an AMENDMENT 3 paragraph; the retired F10
  comment in the Split branch replaced with a pointer at the new
  mechanism.
- `research/lyt/lyt_ast.py` — `Split.gap_px`'s own doc comment added
  (previously undocumented at the field itself).
- `research/lyt/compiler.py` — **unchanged**. `_constrain`'s
  `(k-1)*gap` partition term and `_extract_rects`'s offset
  accumulation already consumed `gap_px` generically; confirmed by the
  new hand-computed regression test rather than re-derived.
- `research/lyt/wellformed.py` — **unchanged**. The L2 dominance
  measure's `total_px` already included `n.gap_px * max(len(children)
  -1, 0)` generically (disclosed in that module's own docstring since
  Amendment 2); re-verified both encodings still load clean with the
  new gaps.
- `research/lyt/emit_mockup.py` — `render_split` emits `node.gap_px`
  as native CSS `column-gap`/`row-gap` on the matching axis (replacing
  the hardcoded `0px;0px`); `_board_priority_tracks`'s CASE A branch
  gains a `- {gap}px` term in the sibling clamp expression so its
  closed-form CSS reproduction of the CP-SAT board-maximize stage
  stays exact when the tree's root declares a gap (hand-derived
  against `compiler.py`'s own partition equality, then verified via
  `boundingBox()` measurement, not just reasoned about).
- `research/lyt/encodings/lengyue_landscape.lyt` /
  `lengyue_portrait.lyt` — gaps added per the tier-mapping table
  above; each file's own header comment documents the mapping and
  (landscape only) the disclosed down-tier finding.
- `research/lyt/tests/test_lyt.py` — new AMENDMENT 3 test section
  (8 tests); `_tiling_violations` and one board-priority pin updated.
- `research/lyt/SPEC-AMENDMENTS.md` — new Amendment 3 section
  (ruling, rationale, syntax, semantics, diff-vs-original, what it
  touched); intro paragraph updated to "three amendments."
- `research/lyt/README.md` — intro paragraph updated to name the third
  amendment and point at this report.
- `research/lyt/mockups/landscape.html` / `portrait.html` —
  regenerated output (never hand-edited).
- `research/lyt/mockups/shots/*` — regenerated screenshots +
  `measurements.json` + `power-set-report.json`.

## Scope discipline

`frontend/` untouched (confirmed via `git status`) — `theme.css`'s
`--space-*` values were read, never imported or modified. No baseline/
as-is encoding touched. No solved rectangle's SEMANTICS changed for
any pre-existing encoding (every fixture without a `gap` declaration
gets `gap_px=0.0`, byte-identical to pre-amendment behavior — verified
by the full pre-existing test suite staying green). No narrowing of
the commission's scope occurred; the one deliberate scope choice
(no gap on the board composite's own inner V-split) is disclosed
above, not silently applied.

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
