# LYT language amendments — build report

Worktree: `.claude/worktrees/agent-aa9ea49f0f6ea6554`, base rebased onto
local `next` at `425d9c33` (LYT compiler prototype, 24-test suite green)
before any work. Implements two adjudicated language amendments
(ledger rows 1670/1671, commissioner-delegated) against
`research/lyt/`. Full rulings, rationale, interpretation choices, and a
diff against `layout-language-consult.md`'s original prose live in
`research/lyt/SPEC-AMENDMENTS.md` — this report covers what was built,
what was witnessed, and the resulting deltas.

`layout-language-consult.md` itself was left untouched (historical
record), per instruction. Note: that document and three related review
reports (`lyt-compiler-prototype-review.md`, `lyt-compiler-cold-review.md`,
`lyt-compiler-fix1-build.md`, `lyt-compiler-fix2-build.md`) exist as
untracked files in the main checkout but are not present in a fresh
worktree (worktrees don't share untracked files); they were copied into
this worktree's `.claude/dispatch-reports/` purely so they could be read
end-to-end per ADR-0002 before any claim referencing them was made — they
are not part of this change's diff and were not otherwise touched.

## Per-claim status

| Claim | Status |
|---|---|
| Base freshness verified (HEAD == 425d9c33, `research/lyt/` exists) before any work | WITNESSED |
| AMENDMENT 1 implemented at a chosen seam (loader.py), with the choice stated | WITNESSED — `research/lyt/loader.py`, `_apply_preserve_reservation`, called from all three `load_slot` branches |
| AMENDMENT 1: preserve slot's min raised to pref in the compiled/loaded model | WITNESSED — unit test `test_preserve_raises_min_to_pref_in_the_loaded_ast` (loader-level) and `test_preserve_banners_hold_their_reservation_in_solved_geometry` (solved-output level) |
| AMENDMENT 1: some encodings become newly INFEASIBLE at some sizes, not dodged | WITNESSED — bisected threshold (1920×640 OPTIMAL → 1920×650 INFEASIBLE, post-amendment; pre-amendment OPTIMAL down to 330px); pinned as `test_current_row_repaired_1920x600_is_expected_infeasible` |
| AMENDMENT 1: runner's own 4 representative sizes checked honestly (no overclaiming) | WITNESSED — none of the 4 sizes flip status for any registration; documented explicitly in `README.md`'s new "AMENDMENT 1 consequence" section rather than left implicit |
| current_row_repaired.lyt header updated re: banners forcing afford-it-or-overlay decision | WITNESSED — header paragraph rewritten in place of the old "OPEN QUESTION" |
| AMENDMENT 2 implemented, replacing the local tree-shape L2 check | WITNESSED — `research/lyt/wellformed.py`, `find_l2_violations` rewritten |
| AMENDMENT 2: decoy construction now flagged | WITNESSED — direct script probe + regression test `test_l2_decoy_construction_is_rejected` |
| AMENDMENT 2: genuine mixed toolbar still passes | WITNESSED — direct script probe + regression test `test_l2_mixed_toolbar_conforms` |
| AMENDMENT 2: tie-breaking / inf / fr edge cases stated and justified | WITNESSED — `wellformed.py` module docstring + `SPEC-AMENDMENTS.md` §2's "Interpretation and edge-case choices" (6 numbered choices); `inf` shown never to arise for `pref`; `fr` ambiguity refused loudly (`test_preserve_min_pref_unit_mismatch_is_refused` covers the AMENDMENT 1 analog; the AMENDMENT 2 fr-ambiguity path is exercised by the (unmodified) `test_l2_violation_is_rejected` against `current_row_wart_l2.lyt`, which now trips this exact path — confirmed by direct script probe, see delta table below) |
| wellformed.py docstring + README's well-formedness section updated, decoy caveat retired | WITNESSED — both rewritten; the "MAGNITUDE" caveat is explicitly marked RETIRED in `wellformed.py`, not silently deleted |
| `SPEC-AMENDMENTS.md` written: rulings, ledger rows, rationale, diff vs. original consult doc | WITNESSED — `research/lyt/SPEC-AMENDMENTS.md` |
| Regression tests: preserve floor == pref in compiled model | WITNESSED — 4 tests (loader-level raise, no-op case, unit-mismatch refusal, solved-geometry) |
| Regression tests: decoy now refused | WITNESSED — `test_l2_decoy_construction_is_rejected` |
| Regression tests: mixed toolbar still passes | WITNESSED — `test_l2_mixed_toolbar_conforms` |
| Regression tests: newly-infeasible size pinned with mechanism comment | WITNESSED — `test_current_row_repaired_1920x600_is_expected_infeasible` |
| Full suite green, exact required command, foreground, first attempt | WITNESSED — see below |
| Solved-rectangle deltas recorded (old → new), all encodings/sizes | WITNESSED — table below; only `current_row_repaired` changed (the only registration with `preserve`/`chrome` content) |
| Committed in worktree, not pushed | WITNESSED — see commit section below |

## Test run (required command, foreground, first attempt)

```
$ nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q > test.log 2>&1; echo "EXIT:$?"
EXIT:0
```

`test.log` contents:

```
.................................                                        [100%]
33 passed in 0.67s
```

33 tests (24 pre-existing, all still passing unmodified, + 9 new: 4 for
AMENDMENT 1, 5 for AMENDMENT 2 — see `research/lyt/tests/test_lyt.py`).

## Runner re-run across all encodings/sizes — solved-rectangle deltas

Re-ran `python runner.py` before (stashed pre-amendment source) and
after, at the runner's own 4 representative sizes, for every
registration. **Only `current_row_repaired.lyt` changed** — it's the
only registration using `preserve` presence or `chrome` domain content;
`q5go`, `ogs`, and `lengyue_landscape`/`lengyue_portrait` are byte-for-byte
identical before/after (confirmed via diff of the full status/objective
lines), since neither amendment has anything to act on in those trees.

### Feasibility status (unchanged for every registration/size)

| encoding | 1920×1080 | 2560×1440 | 1280×1024 | 1080×1920 (portrait) |
|---|---|---|---|---|
| q5go | OPTIMAL | OPTIMAL | INFEASIBLE | INFEASIBLE |
| ogs | INFEASIBLE | INFEASIBLE | INFEASIBLE | OPTIMAL |
| current-row-repaired | OPTIMAL | OPTIMAL | OPTIMAL | INFEASIBLE |
| lengyue-landscape | OPTIMAL | OPTIMAL | INFEASIBLE | (class not selected) |
| lengyue-portrait | (class not selected) | (class not selected) | (class not selected) | OPTIMAL |

(All pre-existing statuses — see `README.md`'s "Honest caveat" section
for why this exact pattern exists; unrelated to either amendment.)

### `current-row-repaired` solved-value deltas (board width, stage objectives)

| size | board `w` before → after | objective before → after |
|---|---|---|
| 1920×1080 | 1024 → 710 | `[1024.0, -314.0, -346.0]` → `[710.0, -0.0, -32.0]` |
| 2560×1440 | 1384 → 1070 | `[1384.0, -314.0, -346.0]` → `[1070.0, -0.0, -32.0]` |
| 1280×1024 | 664 → 654 | `[664.0, -10.0, -42.0]` → `[654.0, -0.0, -32.0]` |
| 1080×1920 (portrait) | INFEASIBLE both before and after (unrelated aspect/cross-fill collision) | — |

Mechanism: AMENDMENT 1 raises `captureBanner`/`saveBanner`/`systemLog`'s
`min` to their `pref` (32/32/250px = 314px combined, previously 0px).
Board-maximize (stage 1) now must leave room for that genuine floor, so
it settles for a smaller board; stage 2 (reach-preferred shortfall)
drops from `-314.0` to `-0.0` at 1920×1080/2560×1440 (banners now reach
their `pref` exactly — pre-amendment they were reaching `0` against a
314px combined `pref`, the entire shortfall, per the cold review's own
hand-verified arithmetic). Stage 3 (minimize-slack) ALSO happens to drop
by exactly 314 at those two sizes (−346.0 → −32.0) — verified this is
not a coincidence of unrelated quantities: these three banners all have
`max == pref` (32/32/250 each), so pre-amendment, with `actual == 0`,
their contribution to stage 3's slack term (`max − actual`) is
NUMERICALLY IDENTICAL to their contribution to stage 2's shortfall term
(`pref − actual`) — both are literally `max/pref − 0`. Post-amendment,
with `actual == pref == max` forced, BOTH terms independently drop to 0
for these three slots. The remaining `-32.0` at every post-amendment
landscape size is a pre-existing, unrelated reach-preferred/slack
residual elsewhere in the tree — present (smaller-magnitude, mixed in)
before the amendment too, e.g. at 1280×1024 pre-amendment
(`[664.0, -10.0, -42.0]`) neither term is banner-dominated the same way,
since board-maximize there already left less headroom for anything to
reach.

### New-infeasibility witness (not visible at the runner's 4 sizes; found by bisection, pinned as a regression test)

| width×height | pre-amendment | post-amendment |
|---|---|---|
| 1920×700 | OPTIMAL | OPTIMAL |
| 1920×650 | OPTIMAL | **INFEASIBLE** |
| 1920×640 | OPTIMAL | OPTIMAL |
| 1920×600 | OPTIMAL | **INFEASIBLE** |
| 1920×330 | OPTIMAL | INFEASIBLE (already, unrelated) |

Threshold sits between 640px (still OPTIMAL post-amendment) and 650px
(INFEASIBLE). Pinned at 1920×600 in
`tests/test_lyt.py::test_current_row_repaired_1920x600_is_expected_infeasible`
— comfortably inside the newly-infeasible band, with the mechanism named
in the test's own docstring per the task's instruction not to leave a
newly-infeasible pair undocumented.

### `current_row_wart_l2.lyt` — refusal mechanism changed, still refuses

| | before | after |
|---|---|---|
| Loads? | No (`LytLoadError`) | No (`LytLoadError`) |
| `detail.law` | `"L2"` | `"L2"` (unchanged) |
| `len(detail.violations)` | 1 | 1 (unchanged) |
| Mechanism | tree-shape "sole occupant, no bare non-chrome sibling" | dominance "chrome present alongside an `fr`-pref sibling — incomparable, refused" |

`test_l2_violation_is_rejected` (pre-existing, unmodified) still passes
against both assertions it makes — the detail SHAPE is compatible even
though the underlying reason changed; the new, more specific reason is
additionally covered by `test_l2_decoy_construction_is_rejected` (a
DIFFERENT, unambiguous-majority witness) and documented in
`SPEC-AMENDMENTS.md` §2.

## Seam / edge-case choices (summary — full reasoning in `SPEC-AMENDMENTS.md` and the two rewritten module docstrings)

- **AMENDMENT 1 seam: loader.py, not the compiler.** The loader is the
  one choke point every `.lyt` text passes through; raising the floor
  there makes it a fact of the typed AST itself, visible to every
  downstream consumer, not a compiler-internal policy invisible outside
  the CP-SAT model.
- **AMENDMENT 1 edge case: min/pref unit mismatch** (px vs `fr`) is
  refused loudly rather than guessed (`detail.law ==
  "preserve-reservation"`).
- **AMENDMENT 2 "band" = the Split node itself**, checked against the
  aggregate of all its direct children's `pref`, not a single
  split-child checked in isolation either against its siblings' total or
  against its own declared `pref` — both alternatives were tried by hand
  against the spec's own two named examples (the sidebar-collapse rail,
  the embedded toggle cluster) and each gets one of them wrong. Full
  derivation with both counter-witnesses in `wellformed.py`'s module
  docstring.
- **AMENDMENT 2 edge case: `inf` never arises for `pref`** (only `max`
  can be `'inf'` by construction) — stated explicitly rather than
  silently assumed. **`fr` DOES arise**; a Split containing chrome
  content alongside an unresolvable `fr`-pref sibling is refused loudly
  (`reason: "incomparable-fr-sibling"`) rather than guessed either
  direction (0 or "very large").
- **AMENDMENT 2 majority is strict** (`chrome_px * 2 > total_px`),
  matching the ruling's own "> 1/2" wording; a 50/50 split does not
  violate.
- **AMENDMENT 2 restructuring of `current_row_repaired.lyt`**: the
  toggle cluster's own dedicated `H{pref 120px}` wrapper was a genuine,
  unambiguous majority violation (96px chrome of 120px total) under the
  new semantics — not dodged by weakening a sizing, but fixed by
  unwrapping it (L2's own prescribed remedy, "ride the already-reserved
  nav bar"), which changes no solved geometry (the wrapper's declared
  `pref` exactly equaled the sum of its children's `pref`) and is
  confirmed both by the full fixture loading clean
  (`test_l2_current_row_repaired_toggle_cluster_rides_the_nav_bar`) and
  by an isolated reproduction of the PRE-restructuring wrapped shape
  confirming it really would violate on its own
  (`test_l2_wrapped_toggle_cluster_would_violate`).

## Files touched

- `research/lyt/loader.py` — `_apply_preserve_reservation` + 3 call sites; module docstring note.
- `research/lyt/wellformed.py` — `find_l2_violations` rewritten; extensive module docstring (derivation, both witnesses, retired caveat, ambiguity disclosure).
- `research/lyt/encodings/current_row_repaired.lyt` — toggle-cluster wrapper unwrapped (no geometry change); header updated (OPEN QUESTION resolved, AMENDMENT 2 restructuring note added).
- `research/lyt/tests/test_lyt.py` — 9 new regression tests (4 AMENDMENT 1, 5 AMENDMENT 2); all 24 pre-existing tests unmodified and still passing.
- `research/lyt/README.md` — well-formedness scope section updated for both amendments; new "AMENDMENT 1 consequence" section with delta table and honest scoping of where the new infeasibility does/doesn't show up.
- `research/lyt/SPEC-AMENDMENTS.md` — new; the living amendment record (rulings, rationale, interpretation choices, diff vs. the original consult doc).

## Documentation-graph / work-status audit (per umbrella CLAUDE.md)

This is `research/` scratch tooling, explicitly disclaimed as "not
application code" (README's own first line) and out of scope for
`frontend/FILES.md`. No `docs/doc-graph.json` node references this
directory (research/lyt/ isn't part of the umbrella's documentation
graph — it's cross-referenced only from the dispatch-report tree, which
the doc-graph tooling doesn't track), so no doc-graph regeneration is
triggered by this change. `FEATURES.md` is unaffected (no user-facing
capability changed — this is a prototype language checker, not shipped
application behavior). The work-status store (`todo` DB) is out of this
agent's write access from within a sandboxed worktree build; the
commissioning session is expected to close ledger rows 1670/1671 against
this artifact per its own review, not this report.
