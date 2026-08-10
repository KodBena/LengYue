# LYT spec amendments

Three language amendments to `layout-language-consult.md`, adjudicated via
the work-status store's ledger (commissioner-delegated), implemented on
top of the fix pass recorded in
`.claude/dispatch-reports/lyt-compiler-fix1-build.md` /
`lyt-compiler-fix2-build.md`. `layout-language-consult.md` itself is
**untouched** — it stays the historical record of the original consult.
This file is the living amendment record: the three rulings, their
rationale (as recorded on the ledger rows), and a diff against the
original document's prose.

Build report for the implementation of Amendments 1/2:
`.claude/dispatch-reports/lyt-language-amendments-build.md`. Build
report for Amendment 3: `.claude/dispatch-reports/lyt-gap-amendment-build.md`.

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

## Amendment 3 (ledger row 1715) — split nodes may declare a uniform,
## constant gap

**Ruling, verbatim adjudication.** Split nodes gain an optional uniform
gap declaration — constant px reservation, never solvable/elastic
(rhythm is not negotiable under board-maximization; an unfittable gap =
loud INFEASIBLE); maps 1:1 onto the compiler's existing `(k-1)·gap`
partition term and CSS grid's native `gap`. Nonuniform spacing remains
an explicit spacer leaf.

**Rationale, as recorded on the ledger row.** The compiler has carried a
`gap_px` field on every `Split` node (`lyt_ast.py`) and a fully general
`(k-1)*gap` partition term (`compiler.py`'s `_constrain`, Split branch)
since the original build — but no concrete syntax in this parser (and
none in the base EBNF, `layout-language-consult.md` line 279) ever set
it, so `loader.py` hardcoded `gap_px=0.0` unconditionally (the "F10
disclosure", review row 1609). The mockup fix-pass work
(`.claude/dispatch-reports/lyt-mockups-fix1-build.md`, finding X3) named
the concrete cost of that gap directly: "a real spacing-rhythm gap would
change the LIVE geometry away from what `compiler.py` solves ... left
unfixed" — the language had no way to say "put 8px between these rows"
that the solver, the loader, and the CSS realization would all agree on
simultaneously. This amendment closes that gap (the pun is unavoidable):
the machinery to CONSUME a gap already existed and was already correct
end to end; only the machinery to DECLARE one was missing.

**Syntax.** An H/V split's own sizing block (the same `{...}` that
already carries `min`/`pref`/`max`/`aspect`/`envelope`/`width`) may
carry one additional optional term, `gap <extent>`, following the exact
"bare `key <extent>`" shape every other extent-valued sizing key already
uses:

```
{min 340px, pref 32fr, max 340px+60ch, gap 8px} V( ... )
```

**Why this spelling, not a new production.** The base EBNF's `sizing`
production (`layout-language-consult.md` line 279-280) is already a
comma-separated bag of `key value` terms inside one `{...}` block, and
this parser has repeatedly extended that same bag rather than inventing
new syntax shapes for new sizing-adjacent concepts — `aspect <number>`,
`envelope: {states}`, `width <extent>` (a `pref` alias), `aspect-coupled`,
`drag-persisted` are all the same "one more recognized key" move,
already disclosed in `parser.py`'s own module docstring as this
parser's house style for extension. `gap` follows that precedent
exactly: no grammar production changes, one more branch in
`Parser.parse_sizing`. The alternative — a dedicated `gap(...)` clause
outside the sizing braces, or a positional term between `H`/`V` and
`(` — would be a genuinely new shape with no precedent in either the
base grammar or this parser's own disclosed extensions, for a concept
(a split-local numeric setting) that the sizing block already exists to
carry.

**Semantics.**

1. **Legal only on H/V split nodes.** A T (Exclusive) node's children
   all receive the SAME rectangle (§4.1 line 297-298) — there is no
   "between children" for a gap to reserve, so `gap` on a T node is
   refused loudly (`LytLoadError`, `detail.law == "gap-declaration"`,
   `detail.node_kind == "exclusive"`), not silently ignored. Refused on
   a bare leaf for the same reason (no children at all).
2. **Constant px only — never solvable/elastic.** The resolved extent
   must be a bare `px` literal. `fr` is refused outright (the ruling's
   own words: rhythm is not a negotiable, competing-for-space quantity
   the way an `fr`-weighted track is). `ch` is refused too, even though
   `ch` IS otherwise resolvable to px elsewhere in this loader (via the
   `PX_PER_CH` constant, for `min`/`pref`/`max`) — gap position
   deliberately does NOT inherit that resolution, so a `ch`-declared
   gap is never silently reinterpreted through a constant the author
   didn't name in gap position. Extent sums (`8px+4ch`) and symbolic
   sentinels (`WRAPPER_MIN`, `CONTENT`, `MAXIMIZE`, `inf`) are refused
   the same way. All four refusals share `detail.law ==
   "gap-declaration"`, `detail.prohibition == "non-px-gap"`.
3. **Maps 1:1 onto the existing `(k-1)*gap` partition term and CSS
   grid's native `gap`.** No new compiler mechanism was needed —
   `compiler.py`'s `_constrain` (Split branch) already summed
   `gap * max(n-1, 0)` into its own partition equality, and
   `_extract_rects` already accumulated `gap` into each child's offset;
   both were "modeled but only ever exercised in the degenerate gap=0
   case" (the retired F10 disclosure this amendment obsoletes).
   `emit_mockup.py`'s `render_split` realizes the SAME `gap_px` as CSS
   Grid's native `column-gap`/`row-gap` on the matching axis — a
   pre-existing browser primitive that already means exactly "constant,
   non-elastic space between grid tracks," so no CSS-side invention was
   needed either.
4. **An unfittable gap is a loud INFEASIBLE, never silently absorbed.**
   Because the partition equality is a hard `==` constraint (not a
   soft objective term), a `gap` too large for its split's own resolved
   extent makes the whole model infeasible — CP-SAT reports
   `INFEASIBLE`, the same honest failure mode every other over-
   constrained sizing already produces in this prototype (see
   `README.md`'s "AMENDMENT 1 consequence" section for the precedent:
   a genuine new-infeasibility surface is a real design tradeoff to
   report, not a bug to route around).
5. **Nonuniform spacing remains an explicit spacer leaf,** per the
   ruling's own closing clause — this amendment does not introduce a
   per-child gap list, alternating rhythm, or any other non-uniform
   variant. A layout wanting different spacing between different child
   pairs still expresses that the way the pre-amendment language always
   could: an explicit zero-content leaf between the two slots that need
   the wider gap, sized to the desired extent. `gap` is strictly the
   uniform, whole-split case.

**Diff vs. the original consult document's prose.** The base EBNF (line
279-286) has no `gap` term in its `sizing` production at all, and no
prose anywhere in `layout-language-consult.md` discusses inter-child
spacing as a first-class concept — every one of the document's own §5
worked encodings is transcribed with implicit zero gap (the compiler's
own pre-amendment `gap_px=0.0` default is a faithful reading of that
silence, not a workaround). This amendment is a genuine language
extension, not a reading recovered from existing text — same footing
as Amendments 1 and 2 above.

**What it touched.** `parser.py` (`RawSizing.gap` field + one more
`parse_sizing` branch); `loader.py` (`_load_gap_px`, called from every
`load_slot` branch — split resolves it into `Split.gap_px`, leaf/T
refuse it; replaces the retired F10-era hardcoded-0.0 comment);
`lyt_ast.py` (`Split.gap_px`'s own doc comment, pointing at this
amendment instead of being silent); `compiler.py` (unchanged —
`_constrain`/`_extract_rects` already consumed `gap_px` generically,
confirmed by a new hand-computed regression test rather than
re-derived); `emit_mockup.py` (`render_split` emits `gap_px` as native
CSS `column-gap`/`row-gap`; `_board_priority_tracks`'s CASE A branch
gains a `- {gap}px` term so its closed-form CSS reproduction of the
CP-SAT board-maximize stage stays exact when the tree's own ROOT split
declares a gap — see that function's own updated docstring for the
derivation); `encodings/lengyue_landscape.lyt` /
`lengyue_portrait.lyt` (tasteful gaps added, mapped onto
`frontend/src/assets/css/theme.css`'s `--space-*` tier scale — see
each file's own header comment for the tier-mapping rationale and the
one disclosed down-tier finding); `tests/test_lyt.py` (new regression
section: parse, refuse-`fr`/`ch`, refuse-symbolic, refuse-on-T,
refuse-on-leaf, hand-computed partition/offset pin, INFEASIBLE-on-unfit
pin; `_tiling_violations`' own independent partition-sum re-derivation
updated to include the `(k-1)*gap` term; the pre-existing
`test_landscape_side_column_track_carries_the_board_priority_clamp`
pin updated for the new gap term in the clamp expression).

## License

Public Domain (The Unlicense), matching `layout-language-consult.md`'s
own license and the umbrella's ADR-0006 per-file convention.
