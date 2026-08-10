# LYT spec consolidation — build report

Commission (commissioner, 2026-08-10): LYT had no consolidated
specification — its definition was split between a historical design
consult (`.claude/dispatch-reports/layout-language-consult.md`) and an
amendment record (`research/lyt/SPEC-AMENDMENTS.md`). This report
records the build of `research/lyt/SPEC.md` — the standalone,
current-state specification — and the resulting pointer edits to
`research/lyt/README.md` and `research/lyt/SPEC-AMENDMENTS.md`.

Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a485ebac5a946066d`,
base rebased onto local branch `lyt-phase2` (`5da3f059`, verified —
`research/lyt/presence.py` present before any work began).

## What was read, end to end, before writing (ADR-0002)

- `.claude/dispatch-reports/layout-language-consult.md` (700 lines, read
  in the MAIN checkout `/home/bork/w/omega`, absolute path as above) —
  the historical design consult.
- `research/lyt/SPEC-AMENDMENTS.md` (533 lines, pre-edit) — the four
  ledger-adjudicated amendments (rows 1670, 1671, 1715, 1737).
- `research/lyt/README.md` (226 lines, pre-edit) — the operational
  guide.
- `docs/adr/0017-the-zero-context-reader.md` (634 lines) — the
  legibility standard `SPEC.md` is written to.
- Implementation authority, each read in full: `research/lyt/parser.py`
  (482 lines), `research/lyt/lyt_ast.py` (245 lines),
  `research/lyt/loader.py` (541 lines), `research/lyt/wellformed.py`
  (396 lines), `research/lyt/presence.py` (222 lines),
  `research/lyt/compiler.py` (769 lines), `research/lyt/errors.py`
  (31 lines), and the CSS-Grid mapping docstring section (lines 1-135)
  of `research/lyt/emit_mockup.py`, plus `research/lyt/runner.py`'s
  `Registration` dataclass (lines 1-100) and
  `research/lyt/encodings/lengyue_landscape.lyt` /
  `current_row_repaired.lyt`'s own header comments, for worked-example
  grounding.

## What was built

`research/lyt/SPEC.md` (960 lines) — 12 numbered sections plus a
closing "Status of the other LYT documents" note: what LYT is and is
for (zero-context opening, ADR-0017 Rule 1(d)); concrete syntax (base
EBNF plus every disclosed parser extension) with a current, gap-amended
worked example; structure-node denotational semantics including the
disclosed aspect/exact-cross-fill relaxation; presence and its typed
impossibility; sizing (units, the `basis` typed impossibility, the
`fr`-in-min/max convention); L1-L4 status per law, each stated as
implemented/not, with L2's Amendment 2 dominance test given in full
(prose law, checkable form, disclosed interpretation choices, the
divergence from the consult document's own worked-example labeling);
screen classes/nearest-neighbor; the lexicographic objective; the
CP-SAT compilation contract (decision variables, hard constraints,
staged objective, INFEASIBLE-as-answer); the loader's two check passes
plus Amendments 1 and 3 in full; the CSS Grid realization mapping
(table + the one disclosed live-grid-vs-solver divergence); Amendment 4
(per-valuation presence, in full, including the honest three-sizes-
still-infeasible outcome); and a "Known limitations and open
questions" section naming the aspect collision, the compact-landscape
infeasibility, the narrow scope of Amendment 1's preserve-geometry fix,
L1/L4's absent checkers, the census's judgment-only domain axis, the
envelope-states-as-documentation-not-computation gap, and the CSS
realization's one unresolved track-shape divergence.

`research/lyt/README.md` — two changes: (1) a new "Why LYT exists"
rationale section (two paragraphs, per the commissioner's mid-flight
brief addition) placed before the operational content, covering the
concrete defect classes LYT makes unrepresentable, the
already-reinvented-three-times reservation primitive, the board-first
objective, why the language is shaped as three strata compiled once
into two independent consumers (CP-SAT verification and live CSS Grid
realization), and a one-clause-each pointer to `SPEC.md` §12's
limitations rather than a restatement; (2) the "Well-formedness
checking scope (L1-L4)" section, which previously restated the
per-law status `SPEC.md` §4.3/§5 now owns, trimmed to a short pointer
plus the one-line-per-law summary a reader orienting inside this file
still needs. The evidentiary sections (AMENDMENT 1's before/after
table, the F5 honest caveat, AMENDMENT 4's feasibility table, the
`--baseline` mode) were left untouched — they are measurement/build
evidence, not language-definition prose `SPEC.md` owns.

`research/lyt/SPEC-AMENDMENTS.md` — one header note added at the top
(6 lines), pointing at `SPEC.md` as the consolidated current-state
specification and stating explicitly that this file remains the
append-only amendment record, unrewritten. No other line in this file
was touched — ADR-0005 Rule 8 (point-in-time records are not
retro-edited) and the commission's own "no rewrites of amendment
history" instruction both apply.

## Per-claim WITNESSED status

Every normative claim in `SPEC.md` about implemented behavior was
checked directly against the source file and line range cited in this
report's "what was read" list above, not inferred from
`SPEC-AMENDMENTS.md`'s or the consult document's own prose about that
behavior. Specifically witnessed against code (not merely against the
amendment record's account of the code):

- The typed impossibilities (§3, §4.2): `lyt_ast.py` lines 64-74
  (`Extent.__post_init__`), 101-114 (`Sizing.__post_init__`), 133-144
  (`Presence.__post_init__`) — read directly, not paraphrased from
  SPEC-AMENDMENTS.md.
- L2's dominance test checkable form (§5): `wellformed.py` lines
  264-334 (`find_l2_violations`) read in full; the strict-majority
  formula and the `fr`-ambiguity refusal path both traced to their
  exact `if`/`elif` branches.
- Amendment 1's `min := max(min, pref)` rule (§9.3):
  `loader.py` lines 297-373 (`_apply_preserve_reservation`) read in
  full, including both disclosed edge cases.
- Amendment 3's gap law (§9.4, §1.1): `loader.py` lines 376-433
  (`_load_gap_px`) and `parser.py`'s `gap` branch (lines 416-422) both
  read; the "legal only on H/V, refused on T and leaf" claim traced to
  the `node_kind != "split"` check.
- Amendment 4 (§11): `presence.py` read in full (222 lines) —
  `PresenceValuation`, `prune_absent`, `validate_valuation`,
  `resolve_and_validate` all traced to their own function bodies, not
  only their docstrings.
- The CP-SAT compilation contract (§8): `compiler.py` read in full
  (769 lines) — the staged solve (`solve_lexicographic`), the
  aspect-slack stage (disclosed as implementation-only, not in the
  consult document's own three-term list), the `fr`-in-min/max
  convention (`_apply_bound`), and the cross-axis `<=` relaxation for
  aspect leaves (`_constrain`'s Split branch) all traced to their exact
  code.
- The CSS Grid mapping table (§10): `emit_mockup.py` lines 75-135 (the
  module docstring's own mapping table) read directly; this section of
  SPEC.md restates that table's content in SPEC.md's own numbered-
  section prose rather than copying it verbatim, but every claim in it
  (grid-template-columns/rows shapes, the T-node tab-strip
  simplification, the minmax two-argument limit, the board-adjacent
  clamp() exception) was checked against the docstring's own words.
- L1/L4's unimplemented status (§4.3): `wellformed.py`'s own "L4
  ACCOUNTING" paragraph (lines 174-190) and `loader.py`'s F7 correction
  paragraph (lines 25-42) both read in full — the claim that
  `drag-persisted` is dropped after parsing was traced to `parser.py`'s
  own docstring disclosure and confirmed absent from `lyt_ast.Sizing`'s
  field list.
- pytest: `nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest
  research/lyt -q`, run twice (once before writing SPEC.md as the
  base-freshness/pre-work check, once after all doc edits as final
  verification) — both runs: **97 passed, exit 0**. No code file was
  touched in this commission.

## Consult-vs-code divergences found, and how each is stated in SPEC.md

1. **L2's dominance test disagrees with the consult document's own
   worked-example label.** The consult document's §5.1 calls its
   chrome-toggle-cluster wrapper an "L2-conformers (embedded)" example;
   Amendment 2's dominance test, applied to that exact construction as
   originally transcribed, finds a genuine strict-majority violation
   (96px of 120px). Stated in `SPEC.md` §5, "Consequence for the
   reference encodings," in its own paragraph, explicitly framed as "a
   genuine divergence between the consult document's own worked-example
   labeling and the current implementation's checkable form of the law
   it is labeling against."
2. **The exact-cross-fill / `aspect` collision is a real, unresolved
   spec-level tension, not merely a compiler workaround.** The consult
   document's §4.1 states cross-axis fill as a literal equality; the
   implementation found this jointly unsatisfiable with `aspect` in
   general and picked one disclosed relaxation direction among at least
   two defensible ones. Stated in `SPEC.md` §2 ("Implementation
   deviation, disclosed") and named again, explicitly as an open
   question the specification does not resolve, in §12's first bullet.
3. **`envelope`'s declared states are documentation, not a computed
   sizing input, contradicting the consult document's own "reserved
   extent is the max over declared states" framing.** `Sizing` is
   1-dimensional per slot in this implementation, so there is no second
   axis for different states to drive different reserved extents.
   Stated in `SPEC.md` §4.2 ("Implementation narrowing, disclosed") and
   named again in §12.
4. **The CP-SAT solve is not literally the consult document's own
   3-term objective** — the implementation inserts an aspect-slack
   resolution stage between stages 1 and 2, undisclosed in the consult
   document's own §6 sketch, needed because the aspect relaxation
   (divergence 2 above) leaves a parent split's cross-axis room
   under-determined otherwise. Stated in `SPEC.md` §8, item 2 of the
   staged objective, explicitly marked "implementation-only stage, not
   in the consult document's own three-term list, disclosed as a
   deviation."
5. **`fr` in min/max position has no meaning in the consult document's
   own text at all** — §5.3's own worked OGS encoding uses `max 25fr`
   without the base grammar or prose ever saying what it means outside
   `pref` position. The implementation invents a disclosed convention
   (`N fr` = `N`% of the enclosing split's own extent). Stated in
   `SPEC.md` §4.1 as an implementation-supplied convention, not a
   reading of consult-document text.
6. **L1 and L4 are named as enforced laws (`errors.py`'s own
   `LytLoadError` docstring says "L1-L4") but are, in fact, almost
   entirely and entirely unimplemented respectively.** This is not a
   consult-document-vs-code divergence in the strict sense (the consult
   document does not claim an implementation exists) but a
   documentation-vs-code divergence the earlier README already named
   and this SPEC.md restates precisely, per-law, in §4.3, rather than
   letting the vaguer "L1-L4" reference imply parity across all four.

Divergence count: **6**, enumerated above.

## Final status

- Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a485ebac5a946066d`
- HEAD: rebased onto `lyt-phase2` at `5da3f059` before work; see commit
  log for the consolidation commit sha.
- pytest: `97 passed`, exit code `0` (both pre- and post-work runs).
- `research/lyt/SPEC.md`: 960 lines.
- Divergence count: 6.
- Not pushed, per instruction — committed in the worktree only.
