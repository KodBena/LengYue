# LYT M2 stage B1 — derived orientation (ledger row 2310)

Commission: implement the derived-orientation ruling (ledger row 2310)
in the LYT language substrate under `research/lyt/`, worktree
`.claude/worktrees/agent-a7e67d2aece8071b9`, branch
`lyt-m2-b1-derived-orientation`, cut from `origin/lyt-phase2` at
`e7ad0e2d`.

## Base freshness (FIRST ACT)

The dispatched worktree's own branch (`worktree-agent-a7e67d2aece8071b9`)
was cut from `3378806f`, which does **not** contain `e7ad0e2d`
(`git merge-base --is-ancestor` failed) — the known worktree-stale-base
issue. `origin/lyt-phase2` itself resolves exactly to `e7ad0e2d`. The
branch name `lyt-phase2` was already checked out in the main worktree, so
a differently-named branch (`lyt-m2-b1-derived-orientation`) was created
directly off `origin/lyt-phase2` for this work — `git merge-base
--is-ancestor e7ad0e2d HEAD` confirmed after the switch. Disclosed
deviation, not silent: the work is NOT on a branch literally named
`lyt-phase2` in this worktree, because that name was unavailable.

## Orientation reading (end to end)

`research/lyt/SPEC.md` (1537 lines, full), `research/lyt/SPEC-
AMENDMENTS.md` (1354 lines, full, including Amendment 8's own dormancy
correction), and `.claude/dispatch-reports/lyt-m2-substrate-port.md`
(776 lines, full) — all read completely before any code was written, per
the umbrella CLAUDE.md's ADR-0002-applies-to-documentation-consumption
discipline.

## Summary

Implemented the derivation seam as a genuine post-solve, single-pass
mechanism: structural residual-holding detection
(`wellformed.find_residual_child`/`find_residual_leaves`), law L18
(`wellformed.find_l18_violations`, the authored-`orient`-on-a-residual-
leaf refusal), a new `orientation.py` module (`derive_orientation` —
the tie-to-vertical rule — `compute_derived_orientations`, `rebind`),
`loader.load_slot`/`load_layouts`'s new `orientation_overrides`
parameter (the re-load seam that re-binds the L14 role frame), a new
`Leaf.orientation_declared` field, and `runner.py` wiring into the
per-size solve loop. Full details, rationale, and the real-encoding
finding are in `SPEC-AMENDMENTS.md`'s new Amendment 9 entry and
`SPEC.md`'s new §17 — not restated in full here.

**The one STOP-and-report item**, surfaced rather than improvised:
`tree` — the leaf the ruling's own illustrative language names — is
NOT today's residual-holding sibling in either committed reference
encoding. In `H(tree, T(...), previewBoard)`, `tree` is FIXED
(`min==pref==max`, 110px landscape / 140px portrait) and `T(...)` (that
row's own sole `pref: fr` child) is an Exclusive, not a Leaf, so it
could never be a derivation subject regardless (`orient` is leaf-only).
Making the ruling's own premise hold for `tree` specifically would mean
editing `lengyue_landscape.lyt`/`lengyue_portrait.lyt`'s control-panel
row so `tree` becomes the row's sole elastic sibling and `T(...)`
becomes fixed/capped instead — a real product-layout content decision
(with real INFEASIBLE/OPTIMAL consequences at some screen sizes,
matching Amendment 4's own precedent) this stage does not make
unilaterally. `research/lyt/encodings/*.lyt` is untouched (`git status
--short` empty).

**A second, unplanned finding, corrected before it reached the spec**:
the generic "unique `fr`-pref Split child" structural definition — the
only sound, principled reading of "residual-holding" this session found
— catches THREE real leaves per class in the actual committed
encodings today (`B` via the `pref maximize` sugar, `settingsPane`,
`otherBand`), not zero. The mechanism is therefore NOT structurally
dormant the way every prior amendment's own port was — the derivation
genuinely runs and genuinely produces real 'h'/'v' values for these
three at every solved screen size. What keeps `runner.py`'s own
before/after stdout byte-identical is a narrower, different fact: no
consumer in this Python-only substrate reads `Leaf.orientation`/the L14
role-frame fields for rendering yet (the realization-layer consumer is
`frontend/`-side, already disclosed out of scope by Amendment 8). This
was caught by the test suite itself (a dormancy test's own first draft
asserted `{}` and failed against the real encodings) before it was
written into the spec as fact — see "Discipline notes" below.

## Per-claim witness status

- **Base freshness deviation (differently-named branch)**: WITNESSED
  (`git merge-base --is-ancestor e7ad0e2d HEAD`, exit 0, on the new
  branch).
- **Structural residual-holding detection is encoding-shape-independent**
  (no widget id, tree path, or pixel value baked into any accept/reject
  branch of `find_residual_child`/`find_residual_leaves`/
  `find_l18_violations`): WITNESSED (direct read of the implementation).
- **Tie-to-vertical rule, both aspect signs**: WITNESSED —
  `tests/test_derived_orientation.py::test_derive_orientation_landscape_
  residual_derives_horizontal`,
  `::test_derive_orientation_portrait_residual_derives_vertical`,
  `::test_derive_orientation_exact_tie_falls_to_vertical`,
  `::test_derive_orientation_degenerate_zero_height_falls_to_vertical`.
- **L18 refusal (authored `orient` on the residual-holding leaf)**:
  WITNESSED —
  `::test_l18_refuses_authored_orient_on_the_residual_holding_leaf`.
- **Override still honored on a non-residual placement**: WITNESSED —
  `::test_l18_override_still_honored_on_a_non_residual_placement`.
- **L14 role facts re-bind through the derived orientation** (the
  `ceiling across` fixture: `{'h'}` at first load's placeholder
  orientation, `{'v'}` after rebind to the derived `'h'` — proof the
  re-load seam actually re-resolves, not merely relabels
  `Leaf.orientation`): WITNESSED —
  `::test_derivation_end_to_end_landscape_residual_rebinds_to_horizontal`.
- **`rebind` is a true no-op (identity-preserving) when nothing is
  residual-holding**: WITNESSED —
  `::test_rebind_is_a_no_op_identity_when_nothing_is_residual_holding`.
- **An `INFEASIBLE` solve contributes no derived orientation**: WITNESSED
  — `::test_compute_derived_orientations_skips_a_widget_absent_from_the_solve`.
- **Real encodings carry three genuine residual-holding leaves per
  class (`B`/`settingsPane`/`otherBand`), L18 itself dormant on both**:
  WITNESSED —
  `::test_real_encodings_have_three_residual_holding_leaves_per_class`
  (exact `find_residual_leaves` output pinned for both classes).
- **`tree` specifically is not residual-holding in either encoding**:
  WITNESSED —
  `::test_tree_leaf_specifically_is_not_residual_holding_in_either_encoding`.
- **`runner.py` before/after stdout byte-identical** (987 lines both,
  exit 1 both — genuine pre-existing INFEASIBLE sizes per SPEC.md §11/
  §12, not a crash): WITNESSED (`diff` exit 0, this session; full
  transcript captured at `/tmp/runner-before.txt`/
  `/tmp/runner-after2.txt` inside this worktree's own scratch area
  during the session — not committed, ephemeral).
- **`emit_mockup.py` before/after byte-identical** (SHA-256 of both
  generated HTML pages, landscape and portrait, matched exactly):
  WITNESSED.
- **Full suite, 358 passed (was 340), 0 regressions, 0 pre-existing
  failures encountered**: WITNESSED, literal output below.
- **Neither `.lyt` encoding touched**: WITNESSED (`git status --short
  research/lyt/encodings/`, empty).
- **`frontend/` untouched**: WITNESSED (`git status --short frontend/`,
  empty; no file under `frontend/` opened for editing).

## Gate — full suite (nice -n 19, `/home/bork/w/vdc/venvs/generic/bin/python`, foreground, literal exit code)

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
........................................................................ [ 20%]
........................................................................ [ 40%]
........................................................................ [ 60%]
........................................................................ [ 80%]
......................................................................   [100%]
358 passed in 3.69s
$ echo $?
0
```

All 340 pre-existing tests pass unchanged (0 edits to any existing test
file); 18 new tests added in `tests/test_derived_orientation.py`.

## Before/after behavioral-difference list, by name (no px as reasoning currency)

| site | before | after | justification |
|---|---|---|---|
| `runner.py` stdout, both encodings, all 4 screen sizes | baseline | **unchanged** | WITNESSED no-diff; the derivation runs (see finding above) but nothing `runner.py` prints reads the fields it changes |
| `emit_mockup.py` generated HTML, both classes | baseline | **unchanged** | WITNESSED matching hashes; `emit_mockup.py` was not touched and does not consume `orientation.py` |
| `Leaf.orientation` for `B`/`settingsPane`/`otherBand`, if inspected directly (not printed by any existing consumer) | placeholder `'v'` at first load | **derived per solved screen size** (real, computed values — not asserted here since no committed encoding/runner output surfaces them; see the pinned unit tests for the mechanism's own correctness) | new AMENDMENT 9 mechanism; solver-inert, so no OTHER observable output changes |
| `Leaf.orientation` for `tree` | `'v'` (default, undeclared) | **unchanged** — `tree` is not residual-holding | STOP-and-report above: the ruling's own premise for `tree` specifically does not hold against the committed encodings |

No output change is unjustified: the one place this mechanism has a
real, computable effect (`B`/`settingsPane`/`otherBand`'s own derived
`Leaf.orientation`/role-frame fields) has no rendering consumer wired up
anywhere in this Python-only substrate yet, so it is invisible to every
existing CLI/test surface except the new, dedicated unit tests that
exercise `orientation.py` directly.

## Discipline notes

- The dormancy claim in this delivery's own first-draft docstrings
  (orientation.py/wellformed.py/runner.py) was WRONG on first write —
  it asserted neither reference encoding has any residual-holding leaf,
  copying the "tree is fixed" finding without separately checking the
  generic structural definition against the WHOLE tree. Running the new
  test suite immediately surfaced the actual `B`/`settingsPane`/
  `otherBand` matches (`find_residual_leaves` returning non-empty
  against real encodings) before any of this was committed or reported
  as fact — the three docstrings and the SPEC/SPEC-AMENDMENTS prose
  were corrected in place before this report was written, per the same
  "verify then report" discipline the umbrella's own postmortems name.
- Ledger governance hook: this worktree has no `./autoharn` binary of
  its own (absent from the git tree, matching the prior M2 stage-A
  session's own finding), and unlike that session's own workaround
  (Bash-script writes for a second touch), THIS session found even
  fresh Write/shell writes blocked pre-authorization. The sanctioned
  unblock (`./autoharn led -f <file> decision "..."`) works once the
  wrapper script + `deployment.json` are copied in from the main
  checkout root (`/home/bork/w/omega/autoharn`,
  `/home/bork/w/omega/deployment.json` — both untracked there too, same
  footing); every source-file touch in this delivery went through a
  preceding `led -f` entry (rows 2315-2324) rather than any hook
  bypass. Both copied files are left untracked in this worktree
  (`git status --short` shows them as `??`), not staged/committed —
  operational tooling, not part of the language-substrate deliverable.
- Scope held to `research/lyt/` (language substrate) and this dispatch
  report. `frontend/` and `research/lyt/encodings/*.lyt` are untouched,
  per the same posture Amendment 8 already disclosed for its own
  realization-layer/frontend exclusions.

## Commit

Committed on this worktree's own branch,
`lyt-m2-b1-derived-orientation`. Not pushed.
