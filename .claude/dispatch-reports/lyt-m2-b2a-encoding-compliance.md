# LYT M2 stage B2a — encoding compliance + law wiring

Commission: M2 stage B2a (ledger rows 2108/2331; the ratified program row
1937 continues), branch `lyt-phase2-b2a` (cut from `lyt-phase2` at
`c0f36881`, M2 stage B1's own tip), worktree
`.claude/worktrees/agent-a2e122a409a9d21e9`. This report is the
deliverable named in the brief.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `c0f36881`.
`git merge-base --is-ancestor c0f36881 HEAD` — this worktree's own branch
was cut directly from that commit (`c0f36881` is `HEAD` itself at the
start of this session), so the check is trivially satisfied. Disclosed
mechanics deviation, not a scope one: the target worktree
(`.claude/worktrees/agent-a2e122a409a9d21e9`) is a sandbox-pinned agent
worktree that cannot `cd`/`EnterWorktree` into the shared main checkout
(which already had `lyt-phase2` checked out) or into a freshly created
sibling worktree (the sandbox pin held even after `EnterWorktree`
reported success, confirmed by a subsequent command still refusing to
run there) — a new branch, `lyt-phase2-b2a`, was cut directly off
`origin/lyt-phase2` at `c0f36881` inside this session's own pinned
worktree instead of literally checking out the name `lyt-phase2`
(unavailable, already checked out elsewhere). All work below is on that
branch.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/SPEC.md` (1662 lines, full), `research/lyt/SPEC-
AMENDMENTS.md` (1559 lines, full, including Amendments 8 and 9 in full),
`.claude/dispatch-reports/lyt-m2-substrate-port.md` (776 lines, full,
including its own fix-pass section), `.claude/dispatch-reports/
lyt-m2-b1-derived-orientation.md` (321 lines, full) — all read completely
before any code was written.

## Summary

1. **Tree becomes the residual-holding sibling** (fork-1 ruling, row
   2108). Both `lengyue_landscape.lyt`/`lengyue_portrait.lyt`'s own
   `H(tree, T(...), previewBoard)` row is swapped: `tree` moves from
   `{min==pref==max}` (fixed) to `{min <its own established floor>, pref
   1fr, max inf}` (elastic — the row's now-unique `fr`-typed child);
   `T(...)` is PINNED at its own already-existing componentwise-max
   floor, `{min 664px, pref 664px, max 664px}` — not a new number: 664px
   is the max of the T's five children's own declared `min`
   (160/160/443/664/204px landscape, 200/200/443/664/204px portrait,
   dominated by `CP-analysis`'s `min 664px` in both classes), the SAME
   floor `compiler.py`'s componentwise-max derivation already enforced
   as a hard constraint before this edit. Activates B1's derived
   orientation for `tree`: `wellformed.find_residual_leaves` now names
   `tree` directly (verified — see Witnesses below).
2. **L13 compliance.** `CP-library`/`CP-cards` (T-children, the
   both-axes position) gain `elastic h` — a browse table's width reflows
   into whatever it is granted, never scrolls sideways, per the
   commissioner's own tuneability ruling (scrolling is fine in
   registry-like containers). This satisfies L13 but newly trips L16's
   own clause (a) (already wired since Amendment 8) — closed in the same
   edit with `floor v 160px`/`200px`, citing each leaf's own
   already-declared `min` (the W4-FLOOR-SOFTENING/pre-existing per-child
   floor) rather than inventing a number.
3. **L17 compliance.** Direct load against the real, unedited encodings
   (not prose) found L17 firing at exactly FOUR sites per class —
   `CP-library`, `CP-cards`, `settingsPane`, `otherBand` — not the six
   named in Amendment 8's own dormancy prose (`boardRail`/`tree` never
   declared `content`/`scroll` in either file, so neither ever tripped
   L17's trigger; that prose was inherited from the experiment branch's
   own differently-shaped encoding and never independently re-verified
   against mainline). `edge v <disposition>` declared per leaf's own
   content nature: `item` for the two browse tables and the settings
   placeholder (indivisible rows, no grounded constant pitch to justify
   `unit`); `continuous` for `otherBand` (freeform JSON/text, nothing
   indivisible at the boundary).
4. **`@demote` for `A_app`** (L15). Ports the model-loop experiment's own
   measured one-row-vocabulary threshold (`A_app`'s max-content width
   probes at 615.3px, width-invariant, rounded up to 616px — the
   experiment branch's own `lengyue_landscape.lyt` header, read via `git
   show lyt-model-loop-experiment:...`) onto both mainline encodings:
   `@demote(h 616px) {160px, content bounded, activity occasional}
   A_app[...]`. L15's own band-wide clause (b) forces a cascade:
   landscape's side column gives `A_engine` `activity sustained`
   (grounded in `loader.py`'s own `_load_activity` docstring — the
   engine metrics strip is read continuously); portrait's root split has
   THREE direct leaf children sharing `A_app`'s own band (`boardRail`,
   `A_app`, `A_engine`), so `boardRail` ALSO gains `activity occasional`
   (grounded in its own product nature — a navigation aid, already a
   default-off toggle) — an asymmetry between the two files driven
   purely by tree shape, disclosed rather than silently matched.
5. **L13/L17 wired into `check_wellformed`'s `all_violations`.** Both
   encodings load CLEAN under strict enforcement (verified). The
   "implemented-unwired" caveats in `wellformed.py`'s module-level
   docstrings (`check_wellformed`, `find_l13_violations`,
   `find_l17_violations`) are corrected in place, dated. `SPEC.md` §16.2
   and `SPEC-AMENDMENTS.md`'s Amendment 8 entry get matching dated
   corrections — the 2026-08-12-earlier-the-same-day dormancy-correction
   text is preserved verbatim (not deleted) and superseded by a new,
   dated paragraph, per this file's own established convention.
6. **Coverage matrix re-run.** The "demoted" valuation's 8 rows (of 24)
   go from `N/A -- no @demote declared for A_app` to genuine solves —
   see the before/after tables below. `SPEC-AMENDMENTS.md`'s Amendment 4
   feasibility table is corrected with a dated, re-derived 14-row table
   (both valuations, all size points that table names) — the drift is
   PRE-EXISTING (confirmed by re-solving the identical 14×2 points
   against a `git archive` of the pre-B2a tree: byte-identical to
   post-B2a), broader than the M2 fix pass's own three-row finding, and
   REPORTED rather than retuned, per this stage's own instruction.

## Per-item witness status

- **Base freshness**: WITNESSED (`git merge-base --is-ancestor c0f36881
  HEAD`, exit 0).
- **Both encodings load clean under strict `check_wellformed` (L2, L5,
  L10-L18 all wired)**: WITNESSED — direct `loader.load_layouts` call
  against both committed `.lyt` files, no exception, this session.
- **`tree` is the unique residual-holding leaf of its Split in both
  classes**: WITNESSED — `wellformed.find_residual_leaves` returns
  `{'B': ..., 'tree': 'root/H2/V2/H0', 'settingsPane': ..., 'otherBand':
  ...}` (landscape) / `{'B': ..., 'tree': 'root/V4/H0', 'settingsPane':
  ..., 'otherBand': ...}` (portrait) — four residual leaves per class,
  was three before this stage.
- **`find_l13_violations`/`find_l17_violations` both return `[]` against
  both committed encodings**: WITNESSED, direct call, this session.
- **`find_l16_violations`/`find_l15_violations` both return `[]` against
  both committed encodings after the L16/L15 cascades this stage's own
  edits trigger**: WITNESSED, direct call, this session.
- **The swap (item 1) is feasibility-neutral**: WITNESSED three ways —
  `runner.py`'s own four representative sizes (byte-identical
  OPTIMAL/INFEASIBLE status lines, `diff` exit 0); `coverage_matrix.py`'s
  24-point matrix (all-present/default columns byte-identical before and
  after, demoted column now genuinely solves instead of N/A); a direct
  re-solve of every point in Amendment 4's own 14-size × 2-valuation
  table against a `git archive` of the pre-B2a tree vs. the committed
  post-B2a tree (byte-identical at all 28 points).
- **`emit_mockup.py` renders, both classes, before/after**: WITNESSED —
  landscape's own diff is 8 lines (the `--track-2-2-0`/`--track-2-2-1`
  grid-template-columns entries flip from `110px`/`minmax(664px, 1fr)` to
  `minmax(110px, 1fr)`/`664px`, exactly the intended track-kind swap);
  portrait's own diff is the same shape at its own track indices
  (`--track-4-0`/`--track-4-1`). No other visual change in either page
  (SHA-256 of every other line unchanged; `content`/`elastic`/`floor`/
  `edge`/`activity` fields are not read by `emit_mockup.py`'s own
  renderer, so they produce no visual diff). Full HTML captured at
  `/tmp/lyt-b2a-before/mockups/{landscape,portrait}.html` and
  `/tmp/lyt-b2a-after/mockups/{landscape,portrait}.html` (this worktree's
  own scratch area, ephemeral, not committed).
- **Full suite, literal exit code**: WITNESSED — `nice -n 19
  /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests
  -q`, foreground, **359 passed, 2 failed, exit 1**. The 2 failures are
  `test_render_ts_roundtrip_matches_committed_file` /
  `test_portrait_render_ts_roundtrip_matches_committed_file` — see
  "STOP-and-report: frontend `.gen.ts` roundtrip" below. Every OTHER
  test file's failures observed mid-session (17 at first full run) were
  fixed by individually-justified edits (see "Test edits, individually
  justified" below), not weakened.
- **Neither `.lyt` encoding left uncommitted/undisclosed**:
  WITNESSED — both are edited, disclosed, and committed on this
  worktree's own branch (see Commit below).
- **`frontend/` untouched by any CODE change**: WITNESSED — the only
  frontend-adjacent fact is the 2 STOP-and-report test failures below,
  which name a regeneration this stage does NOT perform.

## Test edits, individually justified

Full first run (after the encoding edits + wiring, before any test
change) found 17 failures. Each is one of four classes, none weakened:

1. **`test_derived_orientation.py`, 2 tests** — asserted the OLD fact
   (`tree` not residual-holding, three residual leaves not four).
   Renamed and rewritten to assert the NEW, correct fact (item 1's own
   swap), with the old test's own docstring preserved as context for why
   the fact changed.
2. **`test_emit_layout_tree.py`, 2 of 4 initially-failing tests**
   (`test_control_panel_blackbox_floor_is_wrapper_min_derived` and its
   portrait counterpart) — asserted the T-node's OLD emitted track shape
   (`elastic`, minPx 160/200). Updated to the new, correct shape (`fixed`,
   664px) — a pure test-file edit, no `frontend/` file touched (these
   tests exercise `emit_layout_tree.py`'s in-memory JSON directly, not
   the committed `.gen.ts`).
3. **`test_loop_laws.py`, 4 tests** — the M2 substrate port had adapted
   these to call `find_l13_violations`/`find_l17_violations` DIRECTLY on
   an already-loaded slot, specifically because L13/L17 were not wired
   (a fixture that leaves either law unsatisfied could not otherwise
   load). Now that both ARE wired, that adaptation is not merely
   unnecessary but IMPOSSIBLE (the fixture fails inside `load_layouts`
   itself before any direct-call assertion runs) — restored to the
   ORIGINAL experiment-branch shape (`pytest.raises(LytLoadError)` around
   the full load), verified byte-for-byte against `git show
   lyt-model-loop-experiment:research/lyt/tests/test_loop_laws.py`.
4. **`test_lyt.py`, 7 tests** — two classes:
   - `test_content_class_parses_and_round_trips_on_a_leaf`,
     `test_l5a_unbounded_leaf_covered_by_declaring_scroll_on_itself_is_accepted`,
     `test_l5b_two_different_axes_on_the_same_path_are_accepted`,
     `test_l5b_same_axis_on_two_different_paths_is_accepted`,
     `test_l5c_the_other_tab_shaped_composition_is_refused` — pre-
     existing L5-family fixtures declaring `content unbounded, scroll v`
     on a synthetic leaf with no `edge` now also owe an `edge v`, since
     L17 is globally wired (not scoped to the two real encodings) —
     `edge v continuous` added to each (a generic, honest disposition
     for a fixture with no real content nature), individually justified
     per-test in the diff itself.
   - `test_portrait_composite_row_carries_the_board_priority_cap`,
     `test_tree_panels_t_node_track_carries_its_derived_floor` — asserted
     the OLD `minmax(664px, 1fr)` track shape for `T(...)`; updated to the
     new `664px` fixed shape (item 1's own swap), using the exact
     `var(--track-N, 664px)` substrings the emitted HTML carries so the
     assertion stays precise rather than a weak substring match.

None of the 17 fixes weakens a check's own subject — each restores or
corrects an assertion about a fact this stage's own commissioned edits
changed, or (for the L5-family fixtures) adds the minimal declaration a
now-globally-wired law obliges, matching the law's own honest content
reasoning rather than a placeholder.

## STOP-and-report: frontend `.gen.ts` roundtrip

`test_render_ts_roundtrip_matches_committed_file` /
`test_portrait_render_ts_roundtrip_matches_committed_file` remain
FAILING, deliberately not fixed. `emit_layout_tree.py`'s `render_ts` is a
pure, deterministic function of the loaded `.lyt` tree; this stage's own
mandated encoding edits (item 1's track-shape swap; item 4's `content
bounded` addition to `A_engine`/`A_app`) change its output for both
classes (34-line diff for landscape, confirmed via direct `render_ts`
call: `content: null` → `content: "bounded"` on two leaves, `track:
{elastic, minPx: 160}` → `{fixed, px: 664}` on the control-panel T-node —
`elastic`/`floor`/`edge`/`activity` are NOT read by this emitter, per
Amendment 8's own disclosed scope narrowing, so they contribute no
diff). The committed `frontend/src/state/lyt-layout-{landscape,
portrait}.gen.ts` files are now stale relative to the `.lyt` sources
this stage edited.

Both the M2 substrate port and its own fix pass explicitly declined this
exact regeneration for the same reason ("a `frontend/`-touching change
this stage's own commission brief explicitly forbids" /
"`emit_layout_tree.py`'s realization-layer emission... NOT ported" —
`.claude/dispatch-reports/lyt-m2-substrate-port.md`). This stage's own
commission opens with "under `research/lyt/` only." Regenerating the two
`.gen.ts` files is mechanical and deterministic (`nice -n 19
<lytvenv>/bin/python emit_layout_tree.py --registration landscape` /
`--registration portrait`, matching the roundtrip tests' own docstring
instruction) but is a genuine `frontend/`-tree write, which this stage
does not perform without ratification, matching the established
precedent rather than either silently touching `frontend/` or weakening
the roundtrip guard itself (the guard remains a correct, honest check;
it fails because reality has moved past a downstream artifact this stage
does not regenerate). **STOP-and-report for the commissioner**: run the
two `emit_layout_tree.py` invocations above (as a `frontend/`-touching
follow-up, separately ratified) to close this, or explicitly waive it if
the `.gen.ts` files are not yet meant to track `research/lyt/`'s own
current state.

## Coverage matrix — before/after (item 6)

**Before** (`N/A` rows for `demoted`, all-present/default columns as
they stood entering this stage):

```
class      valuation    size             tree orient status
-----------------------------------------------------------------
landscape  all-present  1920x1080        v           INFEASIBLE
landscape  all-present  2560x1440        v           INFEASIBLE
landscape  all-present  1280x1024        v           INFEASIBLE
portrait   all-present  1080x1920        v           OPTIMAL
portrait   all-present  1200x1600        v           OPTIMAL
portrait   all-present  768x1024         v           INFEASIBLE
portrait   all-present  540x960          v           INFEASIBLE
portrait   all-present  420x880          v           INFEASIBLE
landscape  default      1920x1080        v           OPTIMAL
landscape  default      2560x1440        v           OPTIMAL
landscape  default      1280x1024        v           INFEASIBLE
portrait   default      1080x1920        v           OPTIMAL
portrait   default      1200x1600        v           OPTIMAL
portrait   default      768x1024         v           INFEASIBLE
portrait   default      540x960          v           INFEASIBLE
portrait   default      420x880          v           INFEASIBLE
landscape  demoted      *                v           N/A -- no @demote declared for A_app  (x3)
portrait   demoted      *                v           N/A -- no @demote declared for A_app  (x5)
portrait floor (every portrait row OPTIMAL or FEASIBLE): VIOLATED
exit 1
```

**After** (this stage's own edits):

```
class      valuation    size             tree orient status
-----------------------------------------------------------------
landscape  all-present  1920x1080        v           INFEASIBLE
landscape  all-present  2560x1440        v           INFEASIBLE
landscape  all-present  1280x1024        v           INFEASIBLE
portrait   all-present  1080x1920        v           OPTIMAL
portrait   all-present  1200x1600        v           OPTIMAL
portrait   all-present  768x1024         v           INFEASIBLE
portrait   all-present  540x960          v           INFEASIBLE
portrait   all-present  420x880          v           INFEASIBLE
landscape  default      1920x1080        v           OPTIMAL
landscape  default      2560x1440        v           OPTIMAL
landscape  default      1280x1024        v           INFEASIBLE
portrait   default      1080x1920        v           OPTIMAL
portrait   default      1200x1600        v           OPTIMAL
portrait   default      768x1024         v           INFEASIBLE
portrait   default      540x960          v           INFEASIBLE
portrait   default      420x880          v           INFEASIBLE
landscape  demoted      1920x1080        v           OPTIMAL
landscape  demoted      2560x1440        v           OPTIMAL
landscape  demoted      1280x1024        v           INFEASIBLE
portrait   demoted      1080x1920        v           OPTIMAL
portrait   demoted      1200x1600        v           OPTIMAL
portrait   demoted      768x1024         v           INFEASIBLE
portrait   demoted      540x960          v           INFEASIBLE
portrait   demoted      420x880          v           INFEASIBLE
portrait floor (every portrait row OPTIMAL or FEASIBLE): VIOLATED
exit 1
```

**Delta, status names only**: `all-present`/`default` columns
byte-identical before/after (0 flips — item 1's own swap and items 2-4's
own encoding edits are feasibility-neutral at every one of these 16
points). `demoted` column: 8/8 rows go from `N/A` to a genuine solve,
matching `default`'s own status at every point exactly (landscape:
OPTIMAL/OPTIMAL/INFEASIBLE; portrait: OPTIMAL/OPTIMAL/INFEASIBLE/
INFEASIBLE/INFEASIBLE) — the `@demote` presence pruning removes `A_app`
in addition to `boardRail`/`previewBoard`, and at every one of these
particular sizes that removal changes nothing about the binding
constraint (the tree/panels-row floor and the board's own aspect-forced
width already dominate, the same mechanism Amendment 4's own feasibility
account names). `portrait floor: VIOLATED` is unchanged, PRE-EXISTING
(three portrait rows remain genuinely `INFEASIBLE` — see the Amendment 4
table correction below; not this stage's own regression, confirmed by
`git archive` cross-check against the pre-B2a tree).

## Amendment 4 feasibility table — re-verification (row 2074)

`SPEC-AMENDMENTS.md`'s own Amendment 4 table (14 size points × 2
valuations) is corrected in place with a dated 2026-08-12 note, the
original preserved verbatim. Re-derived by direct solve against BOTH the
pre-B2a tree (`git archive` of this worktree's own starting commit) and
the post-B2a tree (this stage's own committed encodings) — **byte-
identical at all 28 points**, confirming the table's own staleness is
entirely PRE-EXISTING (predates this stage, predates M1/M2, already
partially named by the M2 fix pass's own narrower three-row finding) and
this stage's own edits (items 1-4) introduce zero new feasibility drift
at this table's own size set, beyond the 16-point subset `runner.py`/
`coverage_matrix.py` already covered above.

**Feasibility flips relative to Amendment 4's own original table**
(REPORTED, not retuned, per this stage's own instruction):

- Every landscape `all-present` row (1920x1080, 2560x1440, 3440x1440)
  and the `1920x1080-in-portrait` cross-class probe's own `all-present`
  row: `OPTIMAL` → `INFEASIBLE`.
- `1366x768` landscape `default`: `OPTIMAL` → `INFEASIBLE` (matches the
  M2 fix pass's own single-row finding).
- `768x1024` and `540x960` portrait, BOTH valuations: `OPTIMAL` →
  `INFEASIBLE` (matches the M2 fix pass's own two-row finding).
- `420x880` portrait `default`: `OPTIMAL` → `INFEASIBLE`.

No point moved the OTHER direction (`INFEASIBLE` → `OPTIMAL`) anywhere
in this table. The `all-present` valuation in particular is now
`INFEASIBLE` at every representative size this table tracks except the
two originally-`OPTIMAL` portrait mid-sizes (1080x1920, 1200x1600) — a
fact worth the commissioner's own attention (whether `all-present`, given
`boardRail`/`previewBoard` are both default-off release toggles, still
needs to stay feasible anywhere) but outside this stage's own scope to
decide.

## Discipline notes

- Scope held to `research/lyt/` (language substrate, two `.lyt`
  encodings, tests) and this dispatch report, per the commission's own
  "under `research/lyt/` only" framing — the one exception is the
  STOP-and-report above, which explicitly does NOT touch `frontend/`.
- No px used as bare reasoning currency: every extent this stage
  introduced or changed cites a named fact — the 664px T-floor is the
  compiler's own pre-existing componentwise-max derivation; the
  160px/200px `floor v` values are each leaf's own already-declared
  `min`; the 616px `@demote` threshold is the model-loop experiment's
  own measured, width-invariant one-row vocabulary probe (cited from
  that branch's own header via `git show`).
- No wall-clock sleeps; the full suite and every solve ran niced
  (`nice -n 19`).
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx.

## Commit

Committed on this worktree's own branch, `lyt-phase2-b2a`. Not pushed.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
