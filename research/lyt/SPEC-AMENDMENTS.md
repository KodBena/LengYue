# LYT spec amendments

Two language amendments to `layout-language-consult.md`, adjudicated via
the work-status store's ledger (commissioner-delegated), implemented on
top of the fix pass recorded in
`.claude/dispatch-reports/lyt-compiler-fix1-build.md` /
`lyt-compiler-fix2-build.md`. `layout-language-consult.md` itself is
**untouched** — it stays the historical record of the original consult.
This file is the living amendment record: the two rulings, their
rationale (as recorded on the ledger rows), and a diff against the
original document's prose.

Build report for the implementation:
`.claude/dispatch-reports/lyt-language-amendments-build.md`.

---

## Amendment 1 (ledger row 1670) — `preserve` implies a genuine reservation

**Ruling.** A slot whose presence is `preserve` gets its minimum raised
to its preferred extent (`min := max(min, pref)`) on the presence-bearing
axis.

**Rationale, as recorded on the ledger row.** A preserve slot squeezed
to zero recreates the defect class the language forbids. `preserve`'s
whole point (§4.1, line 304-306: "a hidden `preserve` slot keeps its
rectangle and merely stops painting") is that its rectangle survives
across presence transitions — but nothing in the original `Sizing`
semantics forced that rectangle to be non-empty in the first place. A
`min 0px` preserve slot could — and, per the cold review's own
OBSERVATION finding, DID — solve to a literal zero-height rectangle
whenever a higher-priority objective stage wanted the room, which means
"preserve" was carrying none of the geometric promise its name and the
spec's own prose ("they become preserve slots of banner height", line
369-370) attach to it. Only the `Presence` *type* was preserved; the
*sizing* was not. That is exactly defect (b) (§1: "standing cost of
show/hide affordances") wearing a different face — a slot that's
SUPPOSED to have a stable, non-collapsing reservation but doesn't,
because the reservation itself is optional.

**Expected consequence, named on the ledger row rather than left
implicit.** Raising a preserve slot's floor to its `pref` is a REAL hard
constraint the solver must now satisfy, which means some encodings may
become INFEASIBLE at some screen sizes they previously (silently, and
against the spec's own stated intent) solved by squeezing the preserve
slot to nothing. That is correct behavior surfacing a real design
choice — "can this screen size actually afford the reserved banner
height, or does the banner need to move to the overlay stratum instead"
— not a bug to route around by weakening a sizing.

**Diff vs. the original consult document's prose.** The consult document
never states a `min`/`pref` relationship for `preserve` slots at all —
§4.1's Presence section (lines 264-269, 303-306) defines `preserve` only
in terms of what happens to an ALREADY-SOLVED rectangle across a
presence transition ("keeps its rectangle and merely stops painting"),
not what constrains the rectangle's SIZE in the first place; §4.2's
Sizing section (lines 314-345) defines `min`/`pref`/`max` generically,
with no presence-conditioned interaction between the two strata at all.
The amendment introduces exactly that interaction — the two strata
(presence, sizing) are no longer independent; a slot's presence can now
constrain its sizing's floor. This is a genuine extension of the
language, not a reading already latent in the §4.1/§4.2 text: nothing in
the original prose forbids a `preserve` slot with `min < pref`, and the
document's own §5.1 worked encoding (via `current_row_repaired.lyt`'s
faithful repair of it) used exactly that shape until this amendment.

**Seam choice.** Implemented in `loader.py`
(`_apply_preserve_reservation`, called from every branch of `load_slot`),
not the compiler. See that function's own docstring in `loader.py` for
the full disclosure: the short version is that the loader is the one
choke point every `.lyt` text passes through on the way to a `Slot`
tree, so raising the floor there makes it a fact of the typed AST
itself — every downstream consumer (compiler, well-formedness checker,
render, a human inspecting a loaded `Slot`) sees the already-raised
`min`, rather than a policy invisible outside the CP-SAT model.

**Edge cases, disclosed.**
- `min`/`pref` unit mismatch (only px vs `fr` can actually arise, since
  `ch` is already normalized to px earlier in the same load pass): the
  comparison needed for `max(min, pref)` has no common unit to compare
  against — refused loudly (`LytLoadError`, `detail.law ==
  "preserve-reservation"`) rather than guessed.
- `pref.v <= min.v` (the floor already meets or exceeds the target): a
  no-op. `max` is not consulted or altered by this rule; a raised `min`
  that now exceeds a smaller `max` surfaces as the ordinary (already
  disclosed, already un-checked-at-load-time) `min > max` → `INFEASIBLE`
  outcome at solve time.

**What it touched.** `loader.py` (new function + three call sites in
`load_slot`); `current_row_repaired.lyt` (the four preserve slots —
`captureBanner`/`saveBanner`/`systemLog`/`setupChip` — whose header's
"OPEN QUESTION" paragraph this amendment resolves; `setup` was already
`min == pref`, a no-op); `tests/test_lyt.py` (four new regression
tests); `README.md` (a new "AMENDMENT 1 consequence" section with the
before/after delta table and the bisected new-infeasibility threshold).

---

## Amendment 2 (ledger row 1671) — L2 dominance semantics

**Ruling.** A band (a Split node) violates L2 when chrome-action leaves
account for the MAJORITY (> 1/2) of its reserved extent along the
parent's partition axis (`pref` as the measure). This REPLACES the local
tree-shape check.

**Rationale, as recorded on the ledger row.** The original
`wellformed.py` implementation approximated L2's prose ("no band of any
partition axis is reserved for hide/show affordances alone") as a
tree-shape test: a bare chrome/action leaf standing as a split child
conformed the moment ANY other bare non-chrome leaf sat in the same
split, regardless of size. The cold review's own witness (`{min 1px,
pref 1px, max 1px}` decoy, under 4% of the wrapped band) demonstrated
this is trivially defeatable — a construction that is, geometrically,
still exactly the kind of "band reserved for a toggle alone" L2 forbids
gets a clean pass. The known 1px-decoy construction (documented in
`wellformed.py`'s own docstring — see that module for the shape) must
now be flagged as a violation; genuine mixed toolbars (a nav bar with
several non-chrome controls, where a couple of chrome toggle buttons are
a real minority of the row) must still pass.

**Interpretation and edge-case choices, disclosed (the ruling's own
phrasing under-determines the exact formalization; these are the choices
made, with the two witnesses that pinned them).**

1. *"Band" = a Split node itself*, checked against the aggregate of ALL
   its DIRECT children's `pref` (along its own partition axis) — not a
   single split-CHILD checked against its own siblings, and not a
   split-child self-measured against only its OWN declared `pref`. Two
   alternative readings were tried and rejected because each mishandles
   one of the two required witnesses:
   - "child vs. siblings' total" gets the spec's own canonical
     sidebar-collapse-rail witness wrong (a small `27px` toggle beside a
     `168px` sidebar and a `1fr` elastic main column is nowhere near a
     sibling-total majority, yet IS the canonical violation).
   - "child vs. its own declared `pref`" flags every bare chrome/action
     leaf trivially (its own content is always 100% of its own
     reservation), which would ALSO flag the spec's own "L2-conformers
     (embedded)" toggle cluster riding the nav bar — contradicting the
     "genuine mixed toolbars... MUST still pass" requirement.
2. *`pref` is the only extent consulted* (per the ruling's own
   instruction); `min`/`max` play no role in the dominance measure.
3. *`inf`/`fr` handling*: `pref` is never `'inf'` by construction
   (`lyt_ast.Sizing.pref: Extent` has no `inf` member), so the "inf"
   half of the ruling's own "e.g. inf/fr handling" phrasing never
   actually arises in this implementation — noted rather than silently
   assumed away. `fr` DOES arise (elastic composite siblings are common
   in these encodings). When a Split contains chrome/action content
   AND a direct child (chrome or not) whose `pref` is `fr` rather than a
   resolved px value, the total is genuinely incomparable without a
   disclosed fr-pref convention this amendment does not introduce —
   refused loudly (`LytLoadError`, `detail.law == "L2"`,
   `reason: "incomparable-fr-sibling"` in the message) rather than
   guessed. This is a REAL, witnessed consequence:
   `current_row_wart_l2.lyt` (the flat, undecorated sidebar-collapse-rail
   transcription, whose main column is declared `pref 1fr`) now trips
   this ambiguity refusal instead of the old tree-shape violation — it
   still refuses to load (the fixture's purpose is preserved), just via
   a more honest mechanism: this prototype genuinely cannot certify OR
   refute L2 conformance for that specific construction without
   inventing an fr-pref convention nobody has adjudicated.
4. *Strict majority* (`chrome_px * 2 > total_px`), not `>=` — a 50/50
   split does not violate, matching the ruling's own "> 1/2" wording
   literally.
5. *Scope unchanged from the original check*: applies to Split (H/V)
   nodes only, not Exclusive (T) — a T node's children each receive the
   whole rectangle, so "a band of a partition axis" doesn't describe a T
   child's relationship to its siblings.
6. *Only BARE chrome/action leaves count toward the numerator* — same
   restriction the original check used. A composite child (however
   chrome-heavy its own interior) contributes 0 to its PARENT's
   dominance measure; its own interior dominance is checked
   independently, when it is itself visited as the "band" (`n`) in the
   same tree walk. This keeps the check local/non-recursive, avoiding
   the 2-D reasoning (does removing a leaf collapse ITS axis to zero
   across an axis-crossing nested split) the original checker already
   disclosed as out of scope and this amendment does not attempt either.

**Diff vs. the original consult document's prose.** §4.2 (lines
371-380) states L2 in prose only ("checked structurally", line 347) and
gives no formal check — the tree-shape approximation and this
amendment's dominance test are BOTH inventions filling that gap, not
readings of text the document itself specifies. The document's own §5.1
worked encoding calls the board/tree/controls toggle cluster (lines
481-482) an "L2-conformers (embedded)" example without giving a
quantitative test that would confirm or deny that classification; this
amendment's dominance test, applied to that SAME cluster as originally
transcribed (wrapped in its own dedicated `H{pref 120px}`, 96px chrome
of 120px total), finds a genuine, unambiguous MAJORITY VIOLATION — i.e.
this amendment produces a verdict on the document's own named example
that DISAGREES with the document's own casual label. `current_row_
repaired.lyt` was restructured (the wrapper unwrapped, per L2's own
prescribed remedy, "ride the already-reserved nav bar", line 380) so
that the SAME five leaves, now direct children of the substantial
nav-bar row, read as a comfortable minority and conform — see that
file's own header for the restructuring note. This is a genuine
divergence from the document's own worked-example labeling, surfaced
rather than silently absorbed by leaving the old tree-shape check (which
agreed with the document's label only because it was defeatable) in
place.

**Consequence for `current_row_wart_l2.lyt`.** Still refuses to load
(the fixture's role — demonstrating an L2-related refusal — is
unchanged), now via the `incomparable-fr-sibling` path rather than the
old tree-shape `sole-occupant` path. `tests/test_lyt.py::
test_l2_violation_is_rejected` (unmodified) still passes, since both
paths raise `LytLoadError` with `detail.law == "L2"` and exactly one
entry in `detail.violations`.

**What it touched.** `wellformed.py` (rewritten `find_l2_violations`
+ extensive docstring); `current_row_repaired.lyt` (toggle-cluster
wrapper unwrapped, header updated); `tests/test_lyt.py` (four new
regression tests: decoy rejected, mixed toolbar conforms, the
repaired-fixture's un-nesting confirmed, the wrapped shape confirmed to
still violate in isolation); `README.md` (L2 scope section rewritten,
decoy caveat retired).

---

## License

Public Domain (The Unlicense), matching `layout-language-consult.md`'s
own license and the umbrella's ADR-0006 per-file convention.
