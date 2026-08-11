# LYT Amendment 5 (scroll language) — delivery report

Work item `lyt-amendment5-scroll-language`. Implements the language machinery
ratified in [lyt-tab-region-consult.md](lyt-tab-region-consult.md) (ledger row
1937) §3 Option B, §6, §8, §9: the `scroll <axis>` sizing-bag key, the
`content: bounded|designed|unbounded` leaf axis, laws L5/L5a/L5b/L5c, and the
per-T-group shortfall advisory. This report is committed alongside the code
and test changes it describes.

**Scope boundary honored.** `research/lyt/encodings/lengyue_landscape.lyt` and
`lengyue_portrait.lyt` were NOT edited — another concurrent work item owns
them. Every new law is gated on an explicit `scroll`/`content` declaration
(see "Dormancy" below), so it lands dormant against those two encodings and
every other pre-existing encoding: the full pre-change test suite (120 tests)
passes unmodified after this change, and a dedicated regression
(`test_dormancy_no_amendment_5_declarations_means_zero_l5_violations_everywhere`)
asserts `wellformed.find_l5_violations` returns `[]` for all five reference
encodings. No STOP-and-report event was needed — the existing corpus passes
the new laws by construction, not by exemption.

## Post-review corrective (2026-08-11) — Finding 1 fixed, quantification universe swept and extended

Independent review
([lyt-amendment5-review.md](lyt-amendment5-review.md), verdict
ACCEPT-WITH-NOTES) found one real, WITNESSED, currently-dormant defect:
`presence.py::prune_absent` rebuilds a `Split`/`Exclusive` node's own `Slot`
after removing a presence-pruned leaf child, forwarding `presence`/`sizing`/
`violates` from the original — but not the new `scroll_axes` field this
amendment added. Reproduced independently before fixing (see below); the
review's own WITNESSED repro was byte-for-byte confirmed.

**Reproduction (before fix).**

```
before prune: root.scroll_axes = frozenset({'v'})
after prune (B removed): pruned.scroll_axes = frozenset()
BUG CONFIRMED
```

**Fix.** Both `ast.Slot(...)` reconstruction call sites in `prune_absent`
(the `Split` branch and the `Exclusive` branch) now forward
`scroll_axes=slot.scroll_axes`. Verified by re-running the exact repro above
post-fix (`pruned.scroll_axes == frozenset({'v'})`, and the `Exclusive`
branch separately confirmed with its own repro) and by five new regression
tests (see "Test inventory", below).

**Quantification-universe sweep, completed (this was the actual gap — the
fix's SCOPE, not just its instance).** Per ADR-0000's 2026-07-02 amendment
("the class gets named at exactly the scope of the fix the executor has
already built" — checked outward, not just at the observed instance), every
`ast.Slot(...)` and `ast.Leaf(...)` construction site in `research/lyt/`
(excluding `tests/`) was enumerated and classified:

| File | Sites | Pattern | Scroll/content-forwarding risk |
|---|---|---|---|
| `loader.py` | 3 `Slot(...)`, 3 `Leaf(...)` (via `_load_leaf`) | Original construction — builds from a freshly-resolved `RawSlot`/`RawLeaf`, not from an existing `Slot`/`Leaf` | None — these ARE the sites that populate `scroll_axes`/`content` in the first place; already correctly wired (this is the code this amendment's own "What it touched" already named). |
| `presence.py::prune_absent` | 2 `Slot(...)` | **Reconstruction** — forwards `presence`/`sizing`/`violates` from an existing `Slot`, rebuilds only `node` | **YES — this was Finding 1, now fixed at both sites.** |
| `presence.py` (Leaf handling) | 0 — the `isinstance(node, ast.Leaf)` branch returns `slot` UNCHANGED | Identity, not reconstruction | None — a leaf (and its `content`) is never rebuilt by `prune_absent`; it is either kept as-is or removed entirely as an absent child. Pinned by `test_prune_absent_preserves_a_surviving_leafs_content_class`, which is evidence of absence-of-risk, not a fix. |
| `synthesize.py` | 6 `Slot(...)`, 4 `Leaf(...)` | Fresh, from-scratch construction (no existing `Slot`/`Leaf` being forwarded from) | None — nothing to forward; every field uses its default (`scroll_axes=frozenset()`, `content=None`), correctly dormant, not a drop. |
| `bench_solve.py` | 3 `Slot(...)`, 2 `Leaf(...)` | Same as `synthesize.py` — fresh construction | None, same reasoning. |

**Conclusion.** `presence.py::prune_absent`'s two call sites were the ONLY
reconstruction sites in the package that forward some-but-not-all fields
from an existing `Slot`/`Leaf` — the sweep is complete, not merely the one
instance the review named. The closure statements below are amended to name
this universe explicitly (the gap ADR-0000's own audit discipline exists to
catch: the original report's "quantification universe" bullets enumerated
node kind × depth × construction path, but never asked "which OTHER modules
construct or reconstruct a `Slot`/`Leaf` at all" — that question is now
asked and answered, not just for `scroll_axes`/`content` but as a repeatable
audit any FUTURE `Slot`/`Leaf` field addition should re-run).

**Minor note acknowledged (no code change requested by the reviewer).** The
review's minor note observes that L5a's coverage check verifies "an owner
exists on some axis," not "the owner's axis corresponds to the leaf's actual
overflow direction" — accurate, and not a deviation from the ratified spec
(`content: unbounded` carries no directional information for the check to
verify against). The L5a closure statement below is reworded to state this
precisely, rather than reading as a stronger claim than what is actually
checked.

## Per-law implementation and closure statements

### `scroll <axis>` sizing-bag key

**Implementation.** `parser.py` (`RawSizing.scroll_axes`, accumulated across
repeated `scroll <axis>` terms — disclosed departure from this parser's usual
last-write-wins bag semantics, since two `scroll` terms naming different axes
are not repetitions of "the same key"); `loader.py`
(`_load_scroll_axes`, refusing any axis outside `{h, v}`); `lyt_ast.py`
(`Slot.scroll_axes: FrozenSet[ScrollAxis]`, with a `__post_init__` guard
mirroring the `Extent`/`Sizing`/`Presence` F3-fix precedent — a caller
bypassing the concrete-syntax path cannot construct an out-of-vocabulary
value either). Legal on any node kind (leaf, split, exclusive) at any depth,
per the consult report's §9.1 ("nesting is free from the inductive type").

**Class foreclosed.** The class this forecloses is "overflow disposition
expressed nowhere in the typed AST" — before this change, a `scroll` fact
about a slot could only live in CSS (three independently-owned `overflow:
auto` layers, per the consult report's §1), invisible to the solver, the
well-formedness checker, and any program-level reader.

- **Invariant.** Every `Slot.scroll_axes` value is a subset of `{h, v}`,
  enforced at construction (not merely at the concrete-syntax boundary).
- **Quantification universe (AMENDED post-review).** Every node kind
  (`Leaf`, `Split`, `Exclusive`) × every tree depth × both
  directly-constructed and parsed-from-text `Slot` values — AND, following
  Finding 1's correction, every `Slot`-*constructing or -reconstructing*
  call site in the `research/lyt/` package, not merely `loader.py`'s own:
  the two `prune_absent` reconstruction sites (`presence.py`) now forward
  `scroll_axes` alongside `presence`/`sizing`/`violates`; the fresh-
  construction sites (`synthesize.py`, `bench_solve.py`) correctly leave it
  at its default (nothing to forward there). See "Post-review corrective"
  above for the full sweep table. Not covered: the axis is a closed
  2-member set by design (a rectangle has exactly two axes); no further
  axis exists to omit.
- **Denomination.** The bound is denominated in the same currency the
  language already uses for the partition axis (`h`/`v`, matching `Split
  .axis`'s own vocabulary), never a proxy unit.

### `content: bounded | designed | unbounded` leaf axis

**Implementation.** `parser.py` (`RawSizing.content`, last-write-wins, same as
every other single-valued sizing key); `loader.py` (`_load_content_class`,
refusing any value outside the closed vocabulary AND refusing the key
entirely on a non-leaf node — `law: "content-class-declaration"`,
`prohibition: "content-class-on-non-leaf"` / `"unknown-content-class"`);
`lyt_ast.py` (`Leaf.content: Optional[ContentClass]`, `__post_init__` guard).
Deliberately NOT spelled through `domain` or `facets` — see the consult
report's §9.2 and §6.3 (the `blackbox` domain misfit this axis is careful not
to repeat one paragraph later) and `lyt_ast.py`'s own module docstring for the
full rationale.

**Class foreclosed.** "A content-quantity fact conscripted into an axis that
already means something else" — the exact ADR-0008 category error `blackbox`
already discloses as a domain-axis misfit, foreclosed here by giving the fact
its own axis instead of reusing `domain`/`facets`.

- **Invariant.** `Leaf.content` is `None` or one of `{bounded, designed,
  unbounded}`, enforced at construction.
- **Quantification universe.** Every `Leaf` value, both parsed and
  Python-constructed. Not covered: `Split`/`Exclusive` nodes carry no
  `content` field at all (the type itself makes "content on a container"
  unconstructable, stronger than a runtime refusal) — WITNESSED via
  `test_content_class_refuses_on_non_leaf_nodes`, which exercises the
  loader-level refusal for the case where a raw-syntax `content` term
  reaches a non-leaf `load_slot` branch before the type ever gets a chance
  to reject it.
- **Denomination.** Three named classes, chosen to match the actual
  detonation shapes the consult report's §6.5 identifies (statically
  bounded chrome; a design-fact height; genuinely unbounded data) — not an
  arbitrary enum.

### L5 (overflow honesty)

**Checkable form implemented.** An `unbounded`-content leaf may not also
declare `basis == 'envelope'` — an envelope enumerates a FINITE set of
content states (L3), which is not an honest claim for content unbounded by
definition. `bounded`/`designed` leaves are unaffected (their envelope, or
plain reservation alone, is honest per the report's own text).

- **Invariant.** No `Slot` in a well-formed tree has `node.content ==
  'unbounded' AND sizing.basis == 'envelope'` simultaneously.
- **Quantification universe.** Every leaf in the tree, at every depth —
  the walk in `wellformed.find_l5_violations` visits every node
  unconditionally. Not covered (named, not silently absorbed):
  `bounded`/`designed` leaves' "envelope/reservation fits" claim is
  unverifiable statically (no runtime content measurement in this offline
  prototype) — the same disclosed residual L3 itself already carries
  (SPEC.md §4.2).
- **Denomination.** The check compares two ALREADY-TYPED facts
  (`Leaf.content`, `Sizing.basis`) directly — no unit conversion, no proxy.

**Evidentiary status.** WITNESSED — `test_l5_unbounded_leaf_with_envelope_is_refused`
(refuse) and `test_l5_bounded_leaf_with_envelope_is_accepted` (accept).

### L5a (coverage)

**Checkable form implemented.** An `unbounded`-class leaf REQUIRES exactly
one scroll owner (a `scroll` declaration on some slot along its root-to-leaf
path, inclusive of the leaf's own slot) — refused when none exists anywhere
on the path.

- **Invariant.** For every leaf `L` with `content == 'unbounded'`, the
  root-to-`L` path contains at least one slot with non-empty
  `scroll_axes` (L5b, below, additionally bounds this at "at most one per
  axis").
- **Quantification universe (reworded post-review, minor note).** Every
  unbounded leaf × every ancestor on its path (inclusive of itself) — the
  check verifies **an owner exists on *some* axis**, not that the owning
  axis corresponds to the leaf's actual overflow direction; `content:
  unbounded` carries no directional information (no "unbounded
  vertically" vs "unbounded horizontally" distinction in the type) for the
  law to verify correspondence against, so "some axis" is the checkable
  form the type actually supports, not an understated one. Covers coverage
  via an ancestor (WITNESSED,
  `test_l5a_unbounded_leaf_covered_by_an_ancestor_scroll_owner_is_accepted`,
  nesting depth 4: `H > H > V > H > leaf`) and via the leaf declaring
  `scroll` on itself (WITNESSED,
  `test_l5a_unbounded_leaf_covered_by_declaring_scroll_on_itself_is_accepted`).
  Not covered: `bounded`/`designed` leaves carry no coverage requirement at
  all (named explicitly, WITNESSED,
  `test_l5a_bounded_and_designed_leaves_carry_no_coverage_requirement`) — this
  is the checkable half of the consult report's "a bounded/designed leaf
  requires its envelope/reservation to fit" clause; the un-checkable half
  (does the reservation genuinely fit the rendered content) is the same L3
  residual named under L5 above.
- **Denomination.** Coverage is counted as "at least one declaring slot
  exists on the path," not a distance/depth metric — depth is irrelevant to
  whether the overflow has a home.

**Evidentiary status.** WITNESSED — refuse:
`test_l5a_unbounded_leaf_with_no_scroll_owner_anywhere_is_refused`. Accept
(×3): ancestor coverage at nesting depth ≥3, self-coverage, and the
no-requirement case for bounded/designed.

### L5b (single scroll owner)

**Checkable form implemented.** On any root-to-leaf path, at most one slot
declares `scroll` per axis; a second declaration on the same axis on the same
path is refused.

- **Invariant.** For every root-to-leaf path and every axis ∈ `{h, v}`, at
  most one ancestor-or-self slot on that path has that axis in its
  `scroll_axes`.
- **Quantification universe.** Every path × both axes independently — two
  DIFFERENT axes on the same path do not conflict (WITNESSED,
  `test_l5b_two_different_axes_on_the_same_path_are_accepted`), and the SAME
  axis on two DIFFERENT (sibling) paths does not conflict either
  (WITNESSED, `test_l5b_same_axis_on_two_different_paths_is_accepted`) — the
  law is quantified per path, not over the whole tree, matching the
  `owners` dict's own fresh-copy-per-branch construction in
  `find_l5_violations`. The refusal case is exercised at nesting depth ≥3
  (`H(scroll v) > H > V(scroll v) > leaf`) so the check is proven to reach
  across intermediate non-declaring nodes, not merely direct parent/child
  pairs.
- **Denomination.** A simple presence count per `(axis, path)`, not a
  magnitude — this law is about ambiguity of ownership, which is binary,
  not about how much overflow either owner could absorb.

**Evidentiary status.** WITNESSED — refuse (nesting depth ≥3):
`test_l5b_second_declaration_on_the_same_axis_on_the_same_path_is_refused`.
Accept (×2): different axes same path; same axis different (sibling) paths.

### L5c (chart exclusion, subtree-quantified fold)

**Checkable form implemented.** A slot may declare `scroll` only if its own
subtree (itself included) contains no `designed`-class leaf — computed as a
fold over the subtree (`_subtree_has_designed_leaf`), never a per-slot tag.

- **Invariant.** For every slot `S` with non-empty `scroll_axes`, no leaf in
  the subtree rooted at `S` has `content == 'designed'`.
- **Quantification universe.** Every scroll-declaring slot × its full
  subtree, at any nesting depth — WITNESSED at both a direct child
  (`test_l5c_scroll_container_with_a_designed_descendant_is_refused`) and a
  descendant three levels down
  (`test_l5c_fires_regardless_of_nesting_depth_of_the_designed_leaf`), proving
  the fold is genuinely recursive, not a direct-children-only check (which
  would have been the wrong-currency mistake — "does removing the leaf
  collapse ITS OWN axis," the 2-D reasoning L2's own docstring already
  disclosed as out of scope, is NOT what this law does; it is a pure
  boolean fold over classification, no geometry involved).
- **Denomination.** A boolean fold over `Leaf.content`, not a magnitude —
  "does a designed leaf exist anywhere beneath" is exactly the fact the
  commissioner's ruling turns on ("scrolling in chart-carrying containers is
  no-good"), and no finer-grained measure was asked for.
- **The "Other tab"-shaped composition, named in the commission as a
  required refuse case.** WITNESSED —
  `test_l5c_the_other_tab_shaped_composition_is_refused` constructs the exact
  shape the consult report's §9.3 names (a mixed stack: an unbounded
  freeform-JSON/registry editor beside a designed-class chart-ish strip,
  inside one scroll-owning band) and asserts the refusal, then constructs
  the report's own prescribed honest restructure (the designed leaf moved
  OUTSIDE the scroll-owning band, the scroll declaration moved onto the
  unbounded leaf alone) and asserts it loads clean — proving the law
  doesn't just refuse the bad shape, it accepts the fixed one.

**Evidentiary status.** WITNESSED — refuse (×3): direct designed descendant,
designed descendant at depth ≥3, the Other-tab composition. Accept (×2): no
designed descendant present; the Other-tab composition's honest restructure.

### Per-T-group shortfall advisory

**Implementation.** New module `research/lyt/advisory.py`
(`PaneShortfall`, `compute_t_group_shortfalls`, `format_shortfalls`), wired
into `runner.py`'s `run_all` after each solve. Reports every Exclusive (T)
group's children's declared `pref` (never `min` — see the module's own
docstring for why a `min`-based shortfall is an unreachable state: a `min`
exceeding available room makes the whole CP-SAT model `INFEASIBLE` before a
rectangle is ever solved) against the group's solved shared rectangle.
**Never gates** — `runner.run_all`'s `exit_code` is untouched by this
addition (WITNESSED by the pre/post exit-code comparison below).

**Evidentiary status.** WITNESSED — `test_advisory_reports_per_child_shortfall_against_the_shared_rectangle`
(hand-computed 300×300 viewport, asserting exact `demand_px`/`shortfall_w`/
`shortfall_h` numbers against a two-pane T group where one pane's `pref`
fits and the other's genuinely doesn't — the differential-scroll fact the
consult report's §1 names, reproduced as asserted numbers, not prose);
`test_advisory_is_empty_for_a_tree_with_no_exclusive_nodes` (dormancy on a
T-free tree, run against the real `q5go` encoding); `test_advisory_recurses_into_nested_t_groups_at_their_own_depth`
(nesting depth ≥3, asserting a nested T group reports at its OWN `t_path`,
not folded into the outer group's row). Also WITNESSED end-to-end against
the real `runner.py` CLI: running the full runner against every registered
encoding (including the untouched `lengyue_landscape+portrait` registration)
prints an advisory block per solved T group with no crash — the real
control-panel `T` group's five children are all `pref 1fr` (elastic), so
`demand_px` correctly reports `None`/`n/a` rather than a guessed number.

## Grammar delta

Two new sizing-bag keys, added the same way Amendment 3 added `gap` (one more
recognized key in the existing `{...}` bag, no new grammar production):

```
sizing ::= "{" ... ("," "scroll" axis)*  ("," "content" contentclass)? "}"
axis         ::= "h" | "v"
contentclass ::= "bounded" | "designed" | "unbounded"
```

- `scroll <axis>` — legal on any node kind at any depth; MAY repeat (to name
  both axes) — the one sizing key that departs from this parser's usual
  last-write-wins bag semantics.
- `content <contentclass>` — legal only on a leaf; last-write-wins, like every
  other single-valued sizing key.

Both keep the parser permissive (any identifier accepted) and the loader as
the enforcement point (`_load_scroll_axes`, `_load_content_class`), matching
this codebase's established "parser permissive, loader refuses" division of
labor.

## Documentation

- `research/lyt/SPEC.md` — new §13 ("Amendment 5 — overflow as a typed
  language concept"), grammar-extension bullet in §1.1, L5-family bullet in
  §4.3, provenance-count bump (four → five amendments) in the header and the
  "Status of the other LYT documents" section.
- `research/lyt/SPEC-AMENDMENTS.md` — new "Amendment 5 (ledger row 1937)"
  section in the established Amendments 1-4 form (Ruling, Rationale, What
  this amendment implements per numbered item, Dormancy, Diff vs. the
  original consult document, Seam choice, What it touched).
- `research/lyt/README.md` — the "Well-formedness checking scope" heading and
  body now name L5/L5a/L5b/L5c alongside L1-L4, with a pointer to SPEC.md §13.
- `research/lyt/errors.py` — `LytLoadError`'s docstring now names Amendment
  5's laws alongside Amendment 4's, matching accuracy (it previously said
  only "L1-L4" plus the Amendment 4 presence-valuation law).
- ADR-0006 headers retrofitted onto every touched-under-full-visibility file
  that lacked one: `loader.py`, `parser.py`, `wellformed.py`, `lyt_ast.py`,
  `runner.py`, `errors.py`, and the new `advisory.py` — each now carries a
  `License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
  license line and the umbrella's ADR-0006 per-file convention.` line in its
  module docstring, matching `presence.py`/`emit_mockup.py`'s existing
  convention. `compiler.py` was read but not touched by this work item, so it
  was left as-is per ADR-0004's incremental-retrofit posture (retrofit on
  touch, not a roving sweep).
- **`research/lyt/presence.py`** — post-review addition to "What it touched"
  (the original delivery did not touch this file and so, correctly at the
  time, did not list it; the review's Finding 1 made it a touched file).
  `prune_absent`'s two `Slot`-reconstruction call sites now forward
  `scroll_axes`; a new "AMENDMENT 5 fix" section was added to the module's
  own docstring, disclosing the gap and its fix inline, matching this
  codebase's dated-corrective convention (ADR-0005 Rule 8).

This work item is not umbrella-level or `FEATURES.md`-facing (LYT is
research tooling, not application code — `research/lyt/README.md`'s own
scope note), and does not itself close any work-status item beyond
`lyt-amendment5-scroll-language`'s own disposition (left to the commissioner
to close on review, per this session's own scope).

## Test inventory

29 new test functions (30 collected test items — one is parametrized ×2),
appended to `tests/test_lyt.py`'s existing `AMENDMENT 5` section, following
the file's established inline-`.lyt`-text convention (`loader.load_layouts`
over Python string literals — no edits to the two protected encoding files).
Five of the 29 (the "review finding 1 regression" row below) were added in
the post-review corrective pass.

| Law / feature | Accept cases | Refuse cases |
|---|---|---|
| `scroll` parse/round-trip | 2 (single axis; both axes via repeated terms) | 1 (unknown axis) |
| `content` parse/round-trip | 1 (all three classes, parametrized inline) | 2 (unknown value; declared on non-leaf, parametrized ×2 → split, exclusive) |
| L5 (overflow honesty) | 1 | 1 |
| L5a (coverage) | 3 | 1 |
| L5b (single scroll owner) | 2 | 1 |
| L5c (chart exclusion) | 2 (incl. the Other-tab honest restructure) | 3 (incl. the Other-tab composition, at depth ≥3 for one case) |
| Waiver-mechanism reuse (L5 family) | 1 | — |
| Dormancy regression (all 5 reference encodings) | 1 | — |
| Advisory output shape | 3 (hand-computed numbers; empty-tree dormancy; nested-T-groups-at-own-depth) | — |
| **Review finding 1 regression (`prune_absent` field-forwarding)** | **5** (Split reconstruction; Exclusive reconstruction; nested-composite ancestor at depth 4; the empty-set identity no-op; a surviving leaf's `content`) | — |

Nesting depth ≥3 is exercised in: `test_l5a_unbounded_leaf_covered_by_an_ancestor_scroll_owner_is_accepted`
(depth 4), `test_l5b_second_declaration_on_the_same_axis_on_the_same_path_is_refused`
(depth 4), `test_l5c_fires_regardless_of_nesting_depth_of_the_designed_leaf`
(depth 4), `test_l5c_the_other_tab_shaped_composition_is_refused` (depth 4,
`V > T > V > leaf`, matching the real control-panel region's own shape),
`test_advisory_recurses_into_nested_t_groups_at_their_own_depth` (depth 4),
and `test_prune_absent_preserves_scroll_axes_on_a_nested_composite_ancestor`
(depth 4, the finding-1 regression's own nesting case — proving the fix
holds for a `scroll`-declaring ancestor that is NOT the tree root, not just
the one-hop case the review's own repro used).

## Gate exit codes

- **Pre-change baseline** (this session's first act, before any edit):
  `nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q` —
  **120 passed, EXIT:0**.
- **Post-change (original delivery, pre-review), full suite**: same command
  — **145 passed, EXIT:0** (120 pre-existing + 25 new, zero regressions,
  zero skips).
- **Post-review-corrective, full suite**: same command — **150 passed,
  EXIT:0** (145 + 5 new regression tests for Finding 1's fix, zero
  regressions). Before the fixture correction described below, two of the
  five new tests failed as WRITTEN (not as a defect in the fix itself) —
  two fixtures accidentally declared a redundant self-`scroll` on a leaf
  already covered by an ancestor's `scroll`, which is a genuine L5b
  violation (a second owner on the same axis on the same path) — caught by
  the suite itself, corrected, re-run to green. See "Post-review
  corrective" above.
- **`runner.py` CLI, full end-to-end run** (all six registrations, every
  representative screen size, including the advisory print path): **EXIT:1**,
  confirmed IDENTICAL to the pre-change baseline via `git stash` (the exit
  code reflects pre-existing, documented `INFEASIBLE` results at some screen
  sizes — README.md's "AMENDMENT 1 consequence" and SPEC.md §12 — unrelated
  to and unchanged by this work item; the advisory addition itself never
  contributes to this exit code, per its own ADR-0011 Rule 5 "never gates"
  discipline).

## Witness statuses

- WITNESSED: every law (L5/L5a/L5b/L5c) has both a dedicated pytest accept
  and refuse case, per the table above, plus direct interactive smoke-testing
  during development (documented in this session's transcript) that produced
  the exact expected `detail.law`/`detail.violations` shape for all four laws
  before the pytest suite was even written.
- WITNESSED: dormancy — a dedicated regression asserts zero L5-family
  violations across all five reference encodings, and the full pre-existing
  120-test suite passes unmodified.
- WITNESSED: the advisory's numeric output — hand-computed against a
  constructed fixture, and observed end-to-end against every real
  registration via `runner.py`'s own CLI.
- WITNESSED: the waiver mechanism generalizes to the new laws without any
  change to `Waiver`'s own type or construction-time validation — its
  docstring already disclosed `law` as open-ended "in case a future law
  gains a structural checker"; this delivery is that law, confirmed by
  `test_l5_family_waiver_reuses_the_existing_l2_waiver_mechanism`.
- WITNESSED (post-review): the reviewer's Finding 1 repro was reproduced
  independently, byte-for-byte, BEFORE any fix was applied (see "Post-review
  corrective" above); the fix was then verified against that SAME repro
  (both the `Split` and `Exclusive` branches, separately) AND against five
  new pytest regressions; the completed `Slot`/`Leaf`-construction-site
  sweep (every file in the package, not just `presence.py`) is itself
  WITNESSED by direct `grep` enumeration, reproduced in the sweep table
  above.
- No REFUSED-AS-EXPECTED or UNEXERCISED claims are made in this report —
  every claim above is grounded in a passing or intentionally-failing pytest
  assertion, or a directly-observed command exit code.

## Ledger

Every write to a source/doc file in this delivery was preceded by a ledger
`decision` row per the worktree's change-gate hook, recorded at rows 1944,
1946-1950, and 1954-1961 for the original delivery, and 1962-1967 for this
post-review corrective pass (`./autoharn led -f <basename> decision "..."`,
run from `/home/bork/w/omega` since the `autoharn` dispatcher and its
`deployment.json` are not present inside this worktree-isolated checkout).

## Commit and merge-base

- Worktree started at `4e068acb` (the branch-cut point named in the
  commission). Work was committed there as `9277bd8e`.
- On the LAST act, `git fetch origin lyt-phase2` found the branch tip had
  moved to `cb15d69c` ("feat(frontend+lyt): toolbar ontology re-encode —
  board controls to board, engine/app clusters, 384->220px side-column
  reservation") — exactly the toolbar-builder-lands-first case the
  commission anticipated, touching `encodings/`/emitters.
  `git merge-base HEAD origin/lyt-phase2` (before rebase) reported
  `4e068acb`, confirming the tip had genuinely moved.
- `git rebase origin/lyt-phase2` completed with **zero conflicts** (the
  toolbar re-encode's own commit does not touch `test_lyt.py` or any of
  the seven `research/lyt/*.py` modules this delivery edits — the only
  file both works reference is `lengyue_landscape.lyt`/`lengyue_portrait.lyt`,
  which this delivery deliberately never writes).
- Final commit sha (post-rebase): **`d70ba3e2`**.
  `git merge-base HEAD origin/lyt-phase2` (post-rebase) reports
  **`cb15d69c`** — equal to the fetched tip, confirming the rebase landed
  cleanly on top of it.
- The full pytest gate was re-run AFTER the rebase, against the
  post-rebase tree (which now includes the toolbar builder's encoding
  changes): **145 passed, EXIT:0** — the dormancy regression
  (`test_dormancy_no_amendment_5_declarations_means_zero_l5_violations_everywhere`)
  re-verified zero L5-family violations against the toolbar builder's
  updated `lengyue_landscape.lyt`/`lengyue_portrait.lyt` content, not
  merely the pre-rebase snapshot this session originally read.

**Post-review corrective (this pass).** The Finding 1 fix, its five
regressions, and this report's own amendments were committed as
**`1519c7e7`**, on top of `370e9dab` (no other commit intervened).
`git fetch origin lyt-phase2` (re-run for this pass) reported the tip
**unchanged** at `cb15d69c` — the same tip this branch was already rebased
onto — so `git merge-base HEAD origin/lyt-phase2` reports `cb15d69c` with
**no rebase needed**. The full suite was re-run in the foreground
(`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q`,
no pipes, exit code read directly from the shell): **150 passed, EXIT:0**.

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s license
line and the umbrella's ADR-0006 per-file convention.
