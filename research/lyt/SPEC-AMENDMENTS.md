# LYT spec amendments

LYT is this project's small layout-description language: `.lyt` source
files describe a screen as a tree of slots with sizing reservations,
and a constraint solver turns each description into verified pixel
geometry (the full definition is [SPEC.md](SPEC.md); the human-readable
rationale is [README.md](README.md)).

**This file is the dated amendment RECORD — why each rule changed and
when, as adjudicated on the work-status ledger (the project's
append-only decision ledger, read via `./autoharn led`). [SPEC.md](SPEC.md) is the
consolidated, standalone, current-state specification — what the rule
is today, reconciled across the original consult document and every
amendment below.** This file stays exactly what it always was (an
append-only history) and is not restated or rewritten by [SPEC.md](SPEC.md)'s
existence; the header note above is the only line this consolidation
added here.

Four language amendments to [layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md), adjudicated via
the work-status store's ledger (commissioner-delegated), implemented on
top of the fix pass recorded in
[.claude/dispatch-reports/lyt-compiler-fix1-build.md](../../.claude/dispatch-reports/lyt-compiler-fix1-build.md) /
[.claude/dispatch-reports/lyt-compiler-fix2-build.md](../../.claude/dispatch-reports/lyt-compiler-fix2-build.md). [layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md) itself is
**untouched** — it stays the historical record of the original consult.
This file is the living amendment record: the four rulings, their
rationale (as recorded on the ledger rows), and a diff against the
original document's prose.

**[Corrected 2026-08-12, M2 stage B2b, the ruling-basket census — this
paragraph's own "four"/"the four rulings" phrasing describes this
section's state when it was FIRST written, before Amendments 5-9 were
appended below; preserved verbatim above per this file's own append-only
convention, not rewritten.]** This file now carries **nine** amendments
(Amendments 1-9, in order below) — "the living amendment record" framing
still holds; only the count in the paragraph above is stale.

Build report for the implementation of Amendments 1/2:
[.claude/dispatch-reports/lyt-language-amendments-build.md](../../.claude/dispatch-reports/lyt-language-amendments-build.md). Build
report for Amendment 3: [.claude/dispatch-reports/lyt-gap-amendment-build.md](../../.claude/dispatch-reports/lyt-gap-amendment-build.md).
Build report for Amendment 4: [.claude/dispatch-reports/lyt-presence-valuation-solve.md](../../.claude/dispatch-reports/lyt-presence-valuation-solve.md).

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

## Amendment 4 (ledger row 1737) — per-valuation presence solving

**Ruling.** This is not a new law — it is the implementation of a paragraph
the spec's own §6 already prescribes (`layout-language-consult.md` lines
636-641): "presence: solve the all-`preserve`-slots-present valuation ...
`release` toggles are user-initiated only [...] so each user-reachable
presence valuation is legitimately a *separate* solve; in practice solve
the default valuation plus any valuation the author lists as common." The
original build commission's own `compiler.py` disclosed the gap outright
in its module docstring ("presence: only the 'all slots present' valuation
is solved... no worked encoding names an alternate valuation to solve, so
only the default is implemented; disclosed narrowing"). This amendment
closes that narrowing. No spec text changes — same footing Amendments 1-3
use.

**Motivating finding (ledger row ~1735,
`.claude/dispatch-reports/lyt-tree-always-visible-build.md`).** `boardRail`
and `previewBoard` (`encodings/lengyue_landscape.lyt` /
`lengyue_portrait.lyt`) were added as user-toggleable, DEFAULT-OFF
`release` presence slots. Because the pre-Amendment-4 compiler always
solved the "all slots present" valuation regardless of any slot's declared
default-hidden state, their combined reservation (168px + 160px/96px, plus
the gaps their presence in a split adds) was counted at EVERY size —
including sizes where a real, default-hidden browser page renders
perfectly fine because the tracks genuinely collapse to 0px client-side.
Five sizes reported `INFEASIBLE` for this reason alone: landscape
1366x768, 1024x700, 900x600, 1280x1024, and portrait 420x880.

**What this amendment implements.**

1. **Language surface** (`research/lyt/presence.py`, new module):
   `PresenceValuation(name, absent_widgets: FrozenSet[str])` — a named set
   of LEAF WIDGET IDS considered absent for one solve. Widget-id-keyed (the
   same identity `runner.Registration.board_widget` /
   `reach_preferred_widgets` already use), not tree-path-keyed — a
   disclosed narrower concept than `emit_mockup.py`'s `TOGGLE_TARGETS`
   registry, which is path-keyed because some of ITS entries name a
   composite subtree (e.g. "Tree & Panels") with no single widget id; only
   a bare leaf can be named in a `PresenceValuation`. `validate_valuation`
   refuses loudly (`LytLoadError`, `detail.law == "presence-valuation"`)
   when a named widget either doesn't exist, or exists but its declared
   `Presence` isn't a genuine `{kind:'toggle', by:'user', hidden:'release'}`
   — the commission's own words, "a named slot that isn't a user-release
   toggle is an error." A `preserve` slot (keeps its rectangle by
   definition, §4.1 line 303-306) or a `@fixed`/`@dev` slot can never be
   named absent.

   The DECLARATION itself lives at the `runner.Registration` layer (a new
   `default_valuation: PresenceValuation` field, defaulting to
   `presence.ALL_PRESENT` — i.e. every registration keeps today's exact
   behavior unless it opts in), following this prototype's existing
   precedent that registration-level facts (classes, objective, board
   widget) are Python-declared, not concrete `.lyt` syntax
   (`lyt_ast.Program`'s own docstring). Only the lengyue registration
   declares one: `absent_widgets=frozenset({"boardRail", "previewBoard"})`.
   The two encodings themselves now genuinely declare
   `@toggle(user, release)` presence on `boardRail`/`previewBoard` (was
   `@fixed`, with the toggle behavior living ONLY in `emit_mockup.py`'s UI
   registry pre-amendment) — so `validate_valuation`'s "is this really a
   release toggle" check is checking a REAL fact of the typed AST, not a
   UI-layer convention the language itself never asserted.

2. **Solver: pruning, not zeroing.** `presence.prune_absent(slot,
   absent_widgets)` returns a NEW Slot tree with every leaf named absent
   REMOVED from its parent Split/Exclusive's `children` list entirely —
   not sized to zero. `compiler.py` is UNCHANGED: its existing `(k-1)*gap`
   partition term (`_constrain`'s Split branch) already sums the gap over
   `len(node.children)`, whatever tree it's handed, so pruning BEFORE
   compiling is sufficient on its own to make that term use the PRESENT
   count — verified by a hand-computed regression test
   (`test_absent_slot_gap_arithmetic_uses_the_present_count`,
   `tests/test_lyt.py`): a 3-child `gap 10px` split with one child pruned
   absent solves with exactly ONE gap contribution (`(2-1)*10=10px`), not
   two, and the reclaimed 10px + the removed leaf's own reservation flow
   to the remaining siblings.

3. **Which valuation is primary.** The registration's own
   `default_valuation` is the PRIMARY result — what `runner.py`'s CLI
   printer and `emit_mockup.py`'s debug overlay solve and report
   feasibility against. `presence.ALL_PRESENT` (the spec's own §6
   baseline) is solved too, as a reference comparison, by every consumer
   that has a reason to show both (`emit_mockup.build_overlay_data` embeds
   both, keyed by valuation name).

**Feasibility outcome — honest result, not forced to match the motivating
finding's predicted count.** Of the five sizes named above, solving the
DEFAULT valuation (boardRail + previewBoard genuinely absent) flips TWO to
`OPTIMAL`: landscape **1366x768** and portrait **420x880**. The other
three — landscape **1024x700**, **900x600**, and **1280x1024** — remain
`INFEASIBLE` even under the default valuation. This was verified both by
the solver and by hand-derivation (see
`.claude/dispatch-reports/lyt-presence-valuation-solve.md`'s own
feasibility table for the full arithmetic): the board composite's own
V-split forces `B.h == root.h − 52` and, via `aspect 1`, `B.w == B.h`
EXACTLY — a hard equality independent of any sibling's width, not
something a "maximize board width" objective term negotiates down. At
these three sizes, the board's forced width, PLUS the tree/panels row's
own `WRAPPER_MIN`-driven floor (300px T-node + 140px tree + 4px gap =
444px — present in EVERY valuation, since `tree` and the `T(...)` node are
not release-toggled and cannot be pruned by any valuation), PLUS the
root's own 12px gap, exceeds the available width regardless of
`boardRail`/`previewBoard`'s presence. This is a genuine,
presence-INDEPENDENT geometry fact about the current board-composite
shape — not a defect this amendment's scope extends to fixing (the same
"do not shrink an already-grounded reservation just to force a
presence-blind solve to agree" posture the tree-always-visible build
report itself took for the ORIGINAL all-present infeasibility). Landscape
1280x1024's own pre-Amendment-4 disclosure (`tests/test_lyt.py`'s prior
comment: "the side column's floor, 340px, alone leaves composite less
width than the board's forced natural size needs") is the SAME mechanism
family — the same forced-board-width-plus-floor collision, just triggered
by a different one of the two additive terms dominating at a different
aspect ratio.

The `all-present` valuation (nothing absent, byte-identical to
pre-Amendment-4 behavior) legitimately stays `INFEASIBLE` at all five
sizes, plus the two sizes that were already `INFEASIBLE` before
boardRail/previewBoard existed at all (`1280x1024` for an unrelated
side-column-floor reason, `1080x1920-in-landscape` — a portrait-shaped
probe run against the landscape class — for an unrelated aspect-collision
reason) — this is the spec's own "may legitimately remain INFEASIBLE at
small sizes" case, kept pinned with the mechanism named
(`tests/test_lyt.py::test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`).

**[CORRECTED 2026-08-12, M2 stage B2a, ledger rows 2108/2331 — the table
immediately below is STALE relative to today's witnessed reality, and is
preserved verbatim (not deleted) per this file's own append-only
convention; the corrected, re-derived table follows it.]**

| size | class | all-present | default | changed? |
|---|---|---|---|---|
| 1920x1080 | landscape | OPTIMAL | OPTIMAL | no |
| 2560x1440 | landscape | OPTIMAL | OPTIMAL | no |
| 3440x1440 | landscape | OPTIMAL | OPTIMAL | no |
| 1280x1024 | landscape | INFEASIBLE | INFEASIBLE | no — presence-independent (side-column floor) |
| 1366x768 | landscape | INFEASIBLE | **OPTIMAL** | **yes** |
| 1024x700 | landscape | INFEASIBLE | INFEASIBLE | no — presence-independent (board-forced-width) |
| 900x600 | landscape | INFEASIBLE | INFEASIBLE | no — presence-independent (board-forced-width) |
| 1080x1920-in-landscape | landscape | INFEASIBLE | INFEASIBLE | no — presence-independent (aspect collision, pre-existing) |
| 1080x1920 | portrait | OPTIMAL | OPTIMAL | no |
| 1200x1600 | portrait | OPTIMAL | OPTIMAL | no |
| 768x1024 | portrait | OPTIMAL | OPTIMAL | no |
| 540x960 | portrait | OPTIMAL | OPTIMAL | no |
| 420x880 | portrait | INFEASIBLE | **OPTIMAL** | **yes** |
| 1920x1080-in-portrait | portrait | OPTIMAL | OPTIMAL | no |

**Corrected table (2026-08-12, M2 stage B2a, ledger rows 2108/2331),
re-derived by direct solve rather than carried forward from memory.**
The staleness was found and partially named by the M2 substrate-port
fix pass (`.claude/dispatch-reports/lyt-m2-substrate-port.md`'s own
"Gate (c)" section, 2026-08-12 earlier the same day): that pass isolated
three portrait `default`/`all-present` rows (768x1024, 540x960, 420x880)
as genuinely `INFEASIBLE` today despite this table's own `OPTIMAL` claim,
and traced the drift to encoding edits made SOMEWHERE BETWEEN this
amendment's own original writing and commit `9fbc899b` (the settings-live
commit immediately preceding M1's own first commit) — outside M1/M2's own
scope, not something either port caused. Stage B2a's own commission (item
6) asked for the FULL table to be re-verified, not just those three rows
— re-solving every row this table names, at both valuations, against
BOTH the pre-B2a encoding (`git archive HEAD` at B2a's own starting
commit) and the post-B2a encoding (after this stage's own tree/T(...)
residual-holder swap, `elastic`/`floor`/`edge` additions, and `@demote`
addition) finds the two are **byte-identical at every one of these 14
rows** — stage B2a's own encoding edits (items 1-4 of its commission) are
feasibility-neutral at this table's full size set, not just the four
representative sizes `runner.py` checks or the 24-point subset
`coverage_matrix.py` checks. The staleness below is therefore entirely
PRE-EXISTING (predates stage B2a, predates M1/M2), re-confirmed rather
than newly introduced:

| size | class | all-present | default | vs. original table |
|---|---|---|---|---|
| 1920x1080 | landscape | INFEASIBLE | OPTIMAL | **all-present now INFEASIBLE** (was OPTIMAL) |
| 2560x1440 | landscape | INFEASIBLE | OPTIMAL | **all-present now INFEASIBLE** (was OPTIMAL) |
| 3440x1440 | landscape | INFEASIBLE | OPTIMAL | **all-present now INFEASIBLE** (was OPTIMAL) |
| 1280x1024 | landscape | INFEASIBLE | INFEASIBLE | unchanged |
| 1366x768 | landscape | INFEASIBLE | INFEASIBLE | **default now INFEASIBLE** (was OPTIMAL) |
| 1024x700 | landscape | INFEASIBLE | INFEASIBLE | unchanged |
| 900x600 | landscape | INFEASIBLE | INFEASIBLE | unchanged |
| 1080x1920-in-landscape | landscape | INFEASIBLE | INFEASIBLE | unchanged |
| 1080x1920 | portrait | OPTIMAL | OPTIMAL | unchanged |
| 1200x1600 | portrait | OPTIMAL | OPTIMAL | unchanged |
| 768x1024 | portrait | INFEASIBLE | INFEASIBLE | **both now INFEASIBLE** (were OPTIMAL) — the fix pass's own finding |
| 540x960 | portrait | INFEASIBLE | INFEASIBLE | **both now INFEASIBLE** (were OPTIMAL) — the fix pass's own finding |
| 420x880 | portrait | INFEASIBLE | INFEASIBLE | **default now INFEASIBLE** (was OPTIMAL) |
| 1920x1080-in-portrait | portrait | INFEASIBLE | OPTIMAL | **all-present now INFEASIBLE** (was OPTIMAL) |

The drift is broader than the fix pass's own three-row finding — every
landscape `all-present` row and the `1920x1080-in-portrait` cross-class
probe's own `all-present` row have ALSO gone from `OPTIMAL` to
`INFEASIBLE` since this amendment's original writing, alongside
`1366x768`'s own `default` row. This is a genuine, presence-and-B2a-
independent geometry drift in the committed encodings' own intervening
history (the same class of "later, unrelated encoding edits" the fix
pass already named for its narrower three-row finding) — **REPORTED, not
retuned**, per this stage's own commission ("Portrait points that remain
INFEASIBLE even after these edits are REPORTED as named facts... do not
retune demands to force feasibility"). The `all-present` valuation in
particular is now INFEASIBLE at every representative size this table
tracks except the two originally-OPTIMAL portrait mid-sizes — a fact
worth a commissioner's own attention (whether `all-present`, as a
valuation, still needs to stay feasible ANYWHERE, given `boardRail`/
`previewBoard` are both DEFAULT-OFF release toggles that a real page
essentially never renders in the all-present state) is outside this
stage's own scope to decide, named here rather than silently absorbed.

**Overlay/mockup behavior.** `emit_mockup.py`'s debug-overlay JSON now
carries a solve per valuation (`{"valuations": {name: [...]}, ...}`); the
page's own JS reads the CURRENT `boardRail`/`previewBoard` checkbox state
and matches it to the `default` valuation (both unchecked — the page's own
initial state), the `all-present` valuation (both checked), or — for any
OTHER combination, which this amendment does not solve a dedicated
valuation for — falls back to `default` with an honest on-page note
("no solved valuation matches the current toggle state ... showing
nearest solved valuation: default"). Disclosed choice, per the
commission's own instruction to state it.

**What it touched.** `research/lyt/presence.py` (new module —
`PresenceValuation`, `prune_absent`, `validate_valuation`,
`resolve_and_validate`); `encodings/lengyue_landscape.lyt` /
`lengyue_portrait.lyt` (`boardRail`/`previewBoard` now genuinely
`@toggle(user, release)`, was `@fixed`); `runner.py`
(`Registration.default_valuation`/`common_valuations` fields, the
lengyue registration's own declaration, `run_all` solves the declared
default valuation as primary); `emit_mockup.py` (`build_overlay_data`
solves per valuation, `build_html_for_class` embeds the new JSON shape
plus `defaultAbsentSlugs`, `_widget_at_path` helper, `_SCRIPT`'s
`drawOverlay` picks the matching valuation); `tests/test_lyt.py` (new
AMENDMENT 4 section: prune-removes-and-drops-arity, prune-is-identity,
gap-arithmetic-uses-present-count, two malformed-valuation refusal tests,
default-valuation feasibility at the flipped sizes, the registration's
own declared valuation, and a `TOGGLE_TARGETS`-vs-`Registration`
cross-check regression; `known_infeasible` bookkeeping in
`test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
split by valuation); `README.md` (this section's own cross-reference, see
that file's "AMENDMENT 4" section for the runner-output-facing framing).

---

### Reader's glosses — 2026-08-11 (appended per ADR-0005 Rule 8; the amendment bodies above stand verbatim)

The amendment bodies above are an append-only historical record and are
not edited for legibility; a fresh-context reader hits several
unglossed terms and references while reading them. This section
clarifies those terms without altering a single word above it — one
gloss per finding, each naming the line/term it clarifies.

- **"the cold review"** (Amendment 1, line 41; Amendment 2, line 122)
  names the fresh-context review recorded at
  `.claude/dispatch-reports/lyt-compiler-cold-review.md` — distinct
  from the earlier adversarial `lyt-compiler-prototype-review.md`
  cited elsewhere in this record and in [SPEC.md](SPEC.md) §5.
- **"F10 disclosure" / "F10-era"** (Amendment 3, lines 245, 309, 346)
  is finding 10 of the first adversarial review
  (`.claude/dispatch-reports/lyt-compiler-prototype-review.md`): the
  disclosure that `compiler.py` carried a fully general `(k-1)*gap`
  partition term with no concrete syntax able to ever set a nonzero
  `gap_px`, so `loader.py` hardcoded `gap_px=0.0` unconditionally.
  Amendment 3 (the `gap <extent>` syntax) is what closes this gap.
- **"CP-SAT"** (Amendment 1, line 86; Amendment 3, line 318) is Google
  OR-Tools' constraint-programming solver — the engine `compiler.py`
  drives to compile a loaded `Slot` tree into decision variables and
  constraints and solve it in stages (see [SPEC.md](SPEC.md) §8 for the
  full compilation contract).
- **The `1920x1080-in-portrait` / `1080x1920-in-landscape` table rows**
  (Amendment 4's feasibility table, near the end of that section) use a
  `SIZE-in-CLASS` naming convention: the row names a pixel size probed
  against a screen class's tree that isn't the size's own natural
  class — e.g. `1080x1920-in-landscape` is the portrait-shaped
  `1080x1920` probe solved against the *landscape* class's tree, used
  as a cross-class feasibility check. Both mirror rows in that table
  follow this same convention.
- **"presence-bearing axis"** (Amendment 1, line 32) is the axis a
  slot's sizing block constrains under its parent's split — both axes
  for a `T` child, per [SPEC.md](SPEC.md) §8's `along=None`
  bound-application branch (the same gloss given at that term's first
  use in [SPEC.md](SPEC.md) §9.3, kept consistent here).
- **Amendment 4's feasibility table** (the `size / class / all-present
  / default / changed?` table): shows a per-size feasibility
  comparison between the `all-present` presence valuation (every slot
  counted, pre-Amendment-4 behavior) and the `default` valuation
  (`boardRail`/`previewBoard` genuinely absent), across every screen
  size the runner's fixtures exercise.
- **The symbolic sentinels `WRAPPER_MIN`, `CONTENT`, `MAXIMIZE`, `inf`**
  (Amendment 3's refusal list) are the named non-numeric extent tokens
  the concrete syntax admits in *some* sizing positions: `inf` means
  "uncapped" (legal only as a `max`), `MAXIMIZE` marks the leaf the
  solver's stage-1 objective maximizes, `CONTENT` is the forbidden
  content-driven-sizing token (always refused — the language's first
  typed impossibility), and `WRAPPER_MIN` resolves to the loader's
  minimum-wrapper constant. Their full legality table is
  [SPEC.md](SPEC.md) §1.1; Amendment 3's point is that none of them is
  legal in `gap` position.
- **`runner.Registration.board_widget` / `reach_preferred_widgets`**
  (Amendment 4's identity note) are two fields of the `Registration`
  dataclass in `runner.py` — each names encoding leaves by their
  widget id (the same id scheme `default_valuation` reuses): the
  first names the aspect-locked leaf stage 1 maximizes, the second
  the widgets stage 2 scores shortfall for.

## Amendment 5 (ledger row 1937) — overflow as a typed language concept: `scroll`, the content-class axis, and laws L5/L5a/L5b/L5c

**Ruling.** Adopted per the design consult
[.claude/dispatch-reports/lyt-tab-region-consult.md](../../.claude/dispatch-reports/lyt-tab-region-consult.md),
ratified in full (ledger row 1937). The report's §3 Option B (language-first
overflow), §6 (nesting is free from the inductive `Slot` type), §8
(resolving two mis-delivered decisions upward), and §9 (nesting +
conditional no-scroll predicates) are its normative content; the
commissioner's own ruling on Q1 (§6.6, verbatim: *"The pre-LYT version had
no-scroll as a goal. Scrolling is fine, but should be tuneable, for
example scrolling in chart-carrying containers is no-good, scrolling in
the advanced registry is expected."*) is the policy this amendment's
machinery serves.

**Rationale, as recorded in the report.** Before this amendment, scrolling
was simultaneously *unrepresentable in the model* and *rampant in the
realization* — three independently-owned, nested `overflow: auto` CSS
layers around the control-panel region, none of them visible to the
program, the solver, or the well-formedness checker. The row-1849 purpose
ruling (quoted in the report's §1) says LYT exists so an aesthetic defect
can be isolated at the program level without navigating a DOM in a
browser; a scrolling symptom that only the DOM can see is exactly the
class that ruling forbids staying invisible. §6.5/§6.6 of the report
derive that "scrolling is fine, but tuneable" cannot be achieved by
keeping scroll out of the language (the status quo already tried that,
and it does not work — scroll simply becomes unrepresentable, not
prevented) — it requires the SAME machinery as the permissive case
(modeled interior demand, a law, and the realization deriving its
overflow behavior FROM the program), with the law's dial set per
container. This amendment lands that machinery; the modeling depth
(Option C, opening the control-panel `T` group's interior) is a separate,
concurrently-landing work item and is NOT part of this amendment.

**What this amendment implements.**

1. **`Slot.scroll_axes`** (`scroll <axis>`, `axis` ∈ `{h, v}`): a new
   sizing-bag key, the same "one more recognized key" extension precedent
   Amendment 3's `gap` used. Legal on ANY node kind (leaf, split,
   exclusive) at ANY depth — the report's §9.1: nesting is free because
   `Slot` is an inductive type. UNLIKE every other sizing key's
   last-write-wins bag semantics, `scroll` may be declared more than once
   in the same block to name BOTH axes (`scroll h, scroll v`) — disclosed
   departure, since two `scroll` terms naming different axes are not
   repetitions of "the same key" in any useful sense.
2. **`Leaf.content`** (`content <class>`, class ∈
   `{bounded, designed, unbounded}`): a NEW, orthogonal content-class axis
   on leaves, deliberately NOT folded into `domain` or `facets` — the
   report's §9.2 names why: `domain` already carries a disclosed misfit
   (`blackbox`, a boundary marker wearing a subject-matter-domain
   spelling, per the report's own §6.3) that re-conscripting `content`
   into would repeat one paragraph after it was named as a misfit, and
   `facets` describes what a widget IS FOR (`action`/`info`), not how
   much of it there is. Placed in the sizing bag (the same "attach one
   more per-slot fact" extension point `gap`/`scroll` use), rather than
   the leaf's `[domain, facets]` bracket, keeping that bracket's grammar
   untouched.
3. **L5 (overflow honesty)** — checkable form: an `unbounded`-content leaf
   may not ALSO claim `basis == 'envelope'` (L3). An envelope enumerates a
   FINITE set of content states; that is not an honest claim for content
   that is unbounded by definition. `bounded`/`designed` leaves are
   untouched by this rule — their envelope (or plain reservation) IS an
   honest claim, per the report's own "a bounded/designed leaf requires
   its envelope/reservation to fit."
4. **L5a (coverage)** — an `unbounded`-class leaf REQUIRES exactly one
   scroll owner (a `scroll` declaration on some slot along its
   root-to-leaf path, inclusive of the leaf's own slot, subject to L5b
   below) — a leaf with none is refused. `bounded`/`designed` leaves carry
   no such requirement.
5. **L5b (single scroll owner)** — on any root-to-leaf path, at most one
   slot declares `scroll` per AXIS; a second declaration on the SAME axis
   on the SAME path is refused ("which container absorbs the overflow"
   must be unambiguous — report §9.1, naming the witnessed three-layer
   scroll DOM as the shape this forecloses). Two DIFFERENT axes on the
   same path do not conflict.
6. **L5c (chart exclusion, subtree-quantified fold)** — a slot may declare
   `scroll` only if its OWN subtree (itself included) contains NO
   `designed`-class leaf, computed as a fold over the subtree, not a
   per-slot tag ("a container is chart-bearing because a descendant is a
   chart, not because someone remembered to tag the container" — report
   §9.2). This is the mechanized form of the commissioner's own ruling:
   chart-carrying containers may never scroll; their declared demand is a
   hard reservation the solver must fit, `INFEASIBLE` where it cannot,
   never a scrollbar.
7. **Per-T-group shortfall advisory** (`research/lyt/advisory.py`, new
   module) — for every Exclusive (T) group, a report of each child's
   declared `pref` demand against the group's own solved shared rectangle.
   ADVISORY ONLY (ADR-0011 Rule 5: "a judgment-shaped output never
   gates") — printed by `runner.py`'s own stdout after each solve, never
   raised, never a load-time check. Deliberately measured against `pref`
   (a soft target the solver may leave unmet), not `min` (a hard floor
   whose shortfall state is unreachable — a `min` that genuinely exceeds
   the available room makes the WHOLE MODEL `INFEASIBLE` before a
   rectangle is ever solved, so there is no "solved but short" state for
   `min` to report against). This is the mechanized form of the report's
   §1 witnessed symptom ("the Basic and Stability panes ... need
   scrolling ... different amounts") made a program-level fact.

**Dormancy — the hard constraint this implementation wave is bound by.**
Every one of L5/L5a/L5b/L5c is gated on an explicit `content`/`scroll`
declaration existing somewhere in the tree; a tree with NO Amendment 5
declarations anywhere (every encoding as of this amendment, including
BOTH clean-room encodings — `lengyue_landscape.lyt`/`lengyue_portrait.lyt`
are deliberately NOT touched by this amendment, a concurrent work item
owns them) triggers none of the four checks. `wellformed.find_l5_violations`
returns `[]` unconditionally for such a tree — verified by a dedicated
regression test (`tests/test_lyt.py::
test_dormancy_no_amendment_5_declarations_means_zero_l5_violations_everywhere`)
against every reference encoding this repository carries. The laws bind
declarations; they do not retroactively indict silence.

**Diff vs. the original consult document's prose.** `layout-language-
consult.md` names none of `scroll`, a content-class axis, or L5/L5a/L5b/
L5c at all — its own §6 explicitly DECLINES to model scrolling ("a leaf
that scrolls is just a leaf whose content exceeds its reservation — the
reservation still holds," treated by the tab-region consult report's §1
as the pre-amendment status quo this amendment reverses). This is a
genuine language extension, same footing as Amendments 1-4 — not a
reading recovered from existing text.

**Seam choice.** `scroll_axes` lives on `Slot` (not `Leaf`/`Split`,
mirroring `Presence`/`Sizing`'s own placement), since it applies uniformly
regardless of node kind — unlike `gap_px`, which lives on `Split` itself
because it is Split-only. `content` lives on `Leaf` specifically, since
it is leaf-only by the report's own §9.2 instruction; a Split or Exclusive
node declaring it is a refused loudly (`law: "content-class-declaration"`,
`prohibition: "content-class-on-non-leaf"`), never silently dropped —
`loader.py`'s `_load_scroll_axes`/`_load_content_class` are the load-time
resolutions, in the SAME "parser permissive, loader refuses" division of
labor `gap`/bare-`envelope` already use. L5/L5a/L5b/L5c are implemented in
`wellformed.py`'s `find_l5_violations`, in the SAME structural-tree-walk
enforcement family as L2's dominance test, and arbitrated through the SAME
`(law, path)`-keyed `Waiver` mechanism `check_wellformed` already
generalizes for — `Waiver.law`'s own docstring always disclosed the field
as open-ended, "in case a future law gains a structural checker"; this is
that law.

**What it touched.** `lyt_ast.py` (`Leaf.content`, `Slot.scroll_axes`,
both with their own `__post_init__` closed-vocabulary guards, the F3-fix
precedent); `parser.py` (`RawSizing.scroll_axes`/`.content`, two more
`parse_sizing` branches); `loader.py` (`_load_scroll_axes`,
`_load_content_class`, wired into every `load_slot` branch);
`wellformed.py` (`find_l5_violations`, `_subtree_has_designed_leaf`,
`check_wellformed` generalized to arbitrate violations from more than one
law against the same waiver mechanism); `advisory.py` (new module —
`PaneShortfall`, `compute_t_group_shortfalls`, `format_shortfalls`);
`runner.py` (prints the advisory block after each solve); `errors.py`
(docstring now names L5/L5a/L5b/L5c); `tests/test_lyt.py` (new AMENDMENT 5
section: parse/round-trip for both new keys, accept+refuse coverage for
every one of L5/L5a/L5b/L5c including nesting depth >= 3 and the "Other
tab"-shaped composition L5c must refuse, a waiver-mechanism-reuse
regression, the dormancy regression against every reference encoding, and
the advisory output shape including a nested-T-groups regression).

## Amendment 6 (ledger row 1937, same consult) — the boundary marker re-homing; constructor-total emitter

**Ruling.** Adopted per [.claude/dispatch-reports/lyt-tab-region-consult.md](../../.claude/dispatch-reports/lyt-tab-region-consult.md)
§6.3/§6.4/§8.1 — the SAME ratification as Amendment 5 (ledger row 1937);
work item lyt-tab-skeleton-encoding, the "Option C" wave implementing the
report's own recommendation (§4: "Adopt C, with B as its companion
amendment"). Where Amendment 5 landed B (overflow as a typed concept),
this amendment lands the piece of the SAME wave the report's §6 follow-up
resolved: `Domain`'s implementation-added sixth literal, `blackbox`, is
RETIRED; the fact it carried ("an unmodeled subtree stands here") moves to
a new `Leaf.boundary: bool` flag, orthogonal to the leaf's own true
domain. `emit_layout_tree.py`'s plain-leaf-T assertion — every T-node
child had to literally BE `ast.Leaf` — is retired to a genuine structural
fold, total over Leaf|Split|Exclusive, so a T-child may now be an
arbitrarily deep composite (the shape Option C's own CP-analysis/
CP-settings opening requires).

**Rationale, as recorded in the report.** §6.3: `domain: 'blackbox'`
conflates two orthogonal axes — subject-matter classification (what
`domain` is FOR) and "the encoding models no further past this node" (a
recursion base case) — forcing opacity to be LEAF-shaped, which is why
"open the box one level" read as a special language event rather than a
routine encoding edit. §6.2's closure statement names the class: three
consumers of the `Slot` tree pattern-match an assumed depth/constructor
shape instead of folding generically over the type's own three
constructors. This amendment retires the FIRST of those three
(`emit_layout_tree.py`'s own Exclusive branch); `LytNode.vue`'s terminal-T
case and the generated `blackbox` node-kind vocabulary are named as still
depth-assuming (§6.2's own list) but are OUT of this amendment's scope —
§8.1's own resolution: the realization boundary stays exactly where it
sits today ("Wave 1 ships solver-side... byte-identical"), a declared,
open residual for a later wave, not silently closed here.

**What this amendment implements.**

1. **`lyt_ast.Domain`** shrinks to the consult document's own five-member
   union (`go | common | debug | board | chrome`); `Leaf.boundary: bool =
   False` is a new field, same closed-vocabulary `__post_init__` posture
   every other Amendment-5/6 field uses (F3-fix precedent).
2. **Concrete syntax**: a bare `boundary` sizing-bag key (`RawSizing.
   boundary`, parsed the same way `aspect-coupled`/`drag-persisted` are —
   one more recognized key, no grammar production change), leaf-only
   (`loader._load_boundary_marker`, refused on Split/Exclusive the same
   way `content` is).
3. **`emit_layout_tree.py`'s Exclusive branch**: the `isinstance(c.node,
   ast.Leaf)` assertion (raising `NotImplementedError` on any composite
   T-child) is removed. `childWidgets` — documentation/report-table
   parity only, confirmed by direct read of `LytNode.vue`'s own source to
   never be consumed by rendering — is now populated by
   `_collect_leaf_widgets`, a genuine recursive fold over Leaf|Split|
   Exclusive, replacing the retired one-level `c.node.widget` read. The
   Exclusive node's own OUTPUT SHAPE (one collapsed `blackbox` leaf,
   widget id `controlPanel`) is UNCHANGED — the retirement is what the
   emitter accepts as INPUT, not what it emits.
4. **`emit_mockup.py`'s own analogous plain-leaf-T assertion** (its
   `render_exclusive`, an independent static-HTML-mockup consumer sharing
   the identical depth-assuming shape, NOT itself named in the consult
   report's §6.2 enumeration but exhibiting the SAME class) is retired the
   same way, disclosed here as a mechanical necessity to keep this
   repository's own `pytest` suite green against the newly-composite
   CP-analysis/CP-settings tabs — `_first_leaf_widget` (a structural fold
   mirroring `_collect_leaf_widgets`) derives a representative widget id
   for a composite T-child's tab label/body; the static mockup's body
   content for a composite tab is an honest placeholder naming the
   composite explicitly, not stale single-leaf content under a misleading
   label.
5. **Every existing `.lyt` encoding carrying `domain='blackbox'`** —
   `current_row_asis.lyt`, `current_row_repaired.lyt`,
   `lengyue_landscape.lyt`, `lengyue_portrait.lyt` — updates mechanically
   (domain re-homed to the leaf's true domain, `boundary` added).
   Geometry-inert on its own (verified: `current_row_*.lyt`'s own pinned
   feasibility results are unchanged by this amendment in isolation).
   `synthesize.py`'s own `_instantiate_blackbox` (a separate, standalone
   structure-synthesis research spike, out of this wave's own scope but
   directly constructing `ast.Leaf(domain='blackbox', ...)`) is updated
   the same mechanical way for constructor-coverage consistency.

**Diff vs. the original consult document's prose.** `layout-language-
consult.md` never names `blackbox` at all — it is entirely this
prototype's own implementation-added literal (disclosed as such since its
introduction, `lyt_ast.py`'s own module docstring). This amendment does
not touch the consult document's own five-member `Domain` union; it
retires an ADDITION this prototype made ON TOP of that union, restoring
exact conformance to the document's own text while giving the retired
fact an honest, orthogonal home.

**What it touched.** `lyt_ast.py` (`Domain` shrinks; `Leaf.boundary`
field); `parser.py` (`RawSizing.boundary`, one more `parse_sizing`
branch); `loader.py` (`VALID_DOMAINS` shrinks; `_load_boundary_marker`,
wired into every `load_slot` leaf/split/exclusive branch);
`emit_layout_tree.py` (`_collect_leaf_widgets`, Exclusive branch
retirement); `emit_mockup.py` (`_first_leaf_widget`, `render_exclusive`
retirement, `TAB_LABELS` gains three composite-child entries);
`encodings/current_row_asis.lyt` / `current_row_repaired.lyt` /
`lengyue_landscape.lyt` / `lengyue_portrait.lyt` (mechanical re-homing);
`synthesize.py` (same, for constructor-coverage consistency);
`tests/test_lyt.py` (one pre-existing fixture's own inline `domain=
'blackbox'` literal updated; regression coverage for the retirement
itself is the Option C wave's own encoding-level test suite, since the
boundary marker's own load/refuse behavior mirrors `content`'s existing
coverage closely enough that a dedicated unit-level duplicate was judged
not to earn its own place — see this amendment's companion work item's
own delivery report for the full account,
`.claude/dispatch-reports/lyt-optionc-encoding.md`).

## Amendment 7 (ledger rows 2107/2108, M1 of the model-implementation arc; ratified program row 1937 continues) — four keys and three laws ported from the model-iteration loop experiment: `ceiling`/L9, `unit <axis> <px>`/L10, `wrap <policy>`, `measure-bound`/L11

**A numbering note before the ruling.** This is mainline's SEVENTH
amendment, not sixth — the commission that authorized this port
(`lyt-substrate-consolidation`, ledger row 2107; M1 build brief, ledger
rows 2107/2108) named it "the proper mainline Amendment 6 entry" at
authoring time, but Amendment 6 above (the boundary-marker re-homing)
had already landed on mainline by the time this port was built — same
provenance (ledger row 1937), different work item, filed first. Named
here rather than silently resolved either way, per this file's own
"diff vs. the original" discipline: the port is Amendment 7; the
commission's own prose is quoted honestly above, not retroactively
edited.

**Ruling.** Port the model-iteration loop experiment's (branch
`lyt-model-loop-experiment`) three formalized language extensions —
`ceiling` (round 3), `unit <axis> <px>` (round 5), `wrap <policy>` +
`measure-bound` (round 6) — to mainline `research/lyt`, together with
the three structural laws two of them earned (`ceiling` is load-time
only; `unit`/`measure-bound` each have a structural half). The
experiment branch's own substrate-consolidation commission
(`.claude/dispatch-reports/lyt-substrate-consolidation.md`, ledger row
2107) had already verified the language-level implementation correct
and complete against 46 adversarial tests before this port began; this
amendment carries that verified implementation to mainline unchanged,
adapted only where the experiment's own encoding-specific assumptions
needed generalizing (none did — see "What needed generalizing" below).

**Law numbers, preserved from the experiment's own renumbering.** The
loop's six iteration commits originally minted these laws as "L6"/"L7"/
"L8". The experiment branch's own renumbering commit moved them to
"L9"/"L10"/"L11" to avoid a collision with a separate, not-yet-shipped
mainline proposal (`.claude/dispatch-reports/lyt-domain-model-proposal.md`,
§2.2/§2.7) that independently claims L6 (activity invariance) and L7
(elasticity honesty) for its own laws — a proposal document, not
mainline SPEC.md text, so there was never an ACTUAL collision in shipped
mainline code, only a live-document one this renumbering pre-empted.
This port keeps L9/L10/L11 exactly as the experiment branch chose them:
next-free numbering past mainline's own L1-L5 and the proposal's claimed
L6/L7, in the laws' own discovery order (`ceiling` before `unit` before
`measure-bound`, matching rounds 3/5/6). `wrap <policy>` was never a
numbered law on the experiment branch (its own round-6 commit message
called it "L8", but that number actually belongs to `measure-bound`'s
structural checker) and is not one here either — it stays untyped,
`detail.law == "wrap-policy"`.

**What this amendment implements**, all four following the "one more
recognized key in the existing sizing bag" precedent Amendments 3/5/6
already established:

1. **`ceiling`** (`Sizing.ceiling`, bare flag) — a leaf's declared
   extent is an UPPER BOUND on what its content occupies, never a
   standing floor the realization must fill. Leaf-only; requires
   `content bounded`; solver-inert (`compiler.py` never reads it) —
   purely a load-time law (L9) plus a realization-binding fact.
2. **`unit <axis> <px>`** (`Leaf.unit_axes`, accumulated like `scroll`)
   — the indivisible occupancy unit of a leaf's content, per axis.
   Leaf-only; requires `content` in `{bounded, unbounded}`; `{h,v}`
   only, px only, at most one per axis. L10's load-time half lives in
   `loader._load_unit_axes`; its structural half — "a slot must reserve
   at least one whole unit along its own partition axis" — lives in
   `wellformed.find_l10_violations`, since only a tree walk knows which
   axis a slot is partitioned on (both axes for the root or a T-child,
   the same `along=None` reading L2's dominance test and the
   preserve-reservation rule already use).
3. **`measure-bound`** (`Sizing.measure_bound`, bare flag) — a slot's
   extent along its parent's partition axis is derived from the PAGE
   MEASURE its own aspect-locked content is bound by (its own cross
   axis), never from a share of the partition; the residual belongs to
   its siblings. Refused on an Exclusive at load time (every T-child
   shares one rectangle, so there is no residual to hand a sibling); its
   structural half (L11, `wellformed.find_l11_violations`) refuses the
   root (no parent partition to measure against) and any subtree that
   does not hold EXACTLY ONE aspect-locked leaf (none leaves nothing to
   convert; more than one leaves which lock converts ambiguous, the same
   unambiguous-owner reasoning L5b applies to scroll). Also solver-inert
   — the staged solve already maximizes the board's own dimension first
   (stage 1), so there is no solver-side preference left for the flag to
   express; it binds only the realization's track-sizing order.
4. **`wrap <policy>`** (`Slot.wrap_policy`, closed vocabulary
   `{balanced}` today) — how a slot's own vocabulary of units
   distributes when it needs more than one row. Refused on a Split (its
   children are already placed by its own partition); on a Leaf it
   requires the leaf to have already declared a horizontal `unit`
   (`wrap` is a statement ABOUT units); an Exclusive needs no such
   declaration, since its units ARE its declared children.

**Dormancy — this port's own acceptance bar.** No `.lyt` file in this
repository declares any of the four keys — neither `lengyue_landscape
.lyt` nor `lengyue_portrait.lyt` is touched by this amendment, and no
other reference encoding declares them either. `wellformed.
find_l10_violations`/`find_l11_violations` return `[]` unconditionally
for such a tree, the same "laws bind declarations, they do not
retroactively indict silence" posture Amendment 5's own dormancy
paragraph states. Verified two ways: (a) `tests/test_loop_laws.py`'s own
dormancy section (ported near-clean from the experiment branch, 46 tests
total) asserts both reference encodings load with every new field at its
default; (b) both encodings were re-solved via `runner.py` before and
after this amendment's code changes — **byte-identical solver output**
(stdout diff empty), the acceptance bar the M1 commission set. See
`.claude/dispatch-reports/lyt-m1-substrate-port.md` for the full
before/after transcript.

**What needed generalizing vs. what ported clean.** The commission's
own brief anticipated that "where the experiment implementation assumed
experiment-encoding shapes, generalize" — in practice, none of the four
keys' `loader.py`/`wellformed.py`/`lyt_ast.py`/`parser.py`
implementations referenced any encoding-specific fact (a widget id, a
tree path, a specific pixel value): every accept/refuse rule is stated
purely in terms of node kind, declared `content` class, declared axis,
and tree structure. The port is therefore a clean carry of the
experiment's own four functions
(`_load_ceiling_flag`/`_load_unit_axes`/`_load_measure_bound`/
`_load_wrap_policy` in `loader.py`; `find_l10_violations`/
`find_l11_violations` in `wellformed.py`; the four new dataclass fields
in `lyt_ast.py`; the four new `RawSizing` fields and parse branches in
`parser.py`), with law numbers, docstring citations (LOOP ITERATION N →
AMENDMENT 7), and error-message provenance strings (ledger rows
2037/2038/2066/2079 → 2107/2108) updated to mainline's own citation
conventions. What did NOT come along, per the commission's explicit
instruction: the experiment branch's own `emit_mockup.py`/
`emit_layout_tree.py` realization-table changes, its `.lyt` encoding
edits (the settings-live restructuring these four keys were originally
authored against), and its `screenshot.mjs` harness-view additions —
none of those are language machinery, and mainline's own `research/lyt`
has diverged from the experiment's encodings since the branch point
(mainline's `flow.py`/settings-live work, landed independently). `git
diff` against `research/lyt/encodings/` for this amendment is empty,
confirming no encoding content crossed the port.

**Diff vs. the original consult document's prose.** `layout-language-
consult.md` names none of `ceiling`, `unit`, `wrap`, or `measure-bound`
at all — same footing as Amendments 1-6: a genuine language extension,
not a reading recovered from existing text. Nor were any of the four
authored against mainline SPEC.md directly — they were proven out on the
experiment branch first (six iteration rounds, gallery-recorded,
`research/lyt/tools/loop/gallery/manifest.json`), verified by that
branch's own adversarial test suite, and only then ported here. This is
a new provenance shape relative to Amendments 1-6 (each of which was
authored directly against a commissioner ruling or consult report), and
is named as such rather than folded silently into the established
"ruling → implementation" pattern.

**What it touched.** `lyt_ast.py` (`Sizing.ceiling`, `Sizing.
measure_bound`, `Leaf.unit_axes`, `Slot.wrap_policy`, `_VALID_WRAP_
POLICIES`, each field's own `__post_init__` closed-vocabulary guard —
the F3-fix precedent every prior amendment's typed field already uses);
`parser.py` (`RawSizing.ceiling`/`.measure_bound`/`.wrap`/`.unit_axes`,
four more `parse_sizing` branches); `loader.py`
(`_load_ceiling_flag`/`_load_measure_bound`/`_load_wrap_policy`/
`_load_unit_axes`, `VALID_WRAP_POLICIES`, wired into every `load_slot`
branch — leaf/split/exclusive); `wellformed.py`
(`find_l10_violations`/`find_l11_violations`, `check_wellformed`
generalized to arbitrate L10/L11 through the same waiver mechanism L2/L5
already use); `tests/test_loop_laws.py` (new file, 46 tests ported
near-clean from the experiment branch's own file of the same name — see
that file's own header for the porting disclosure); SPEC.md gains a
matching grammar/semantics section (this file's own §1.1/§4.3-adjacent
material); this amendment's own dispatch report,
`.claude/dispatch-reports/lyt-m1-substrate-port.md`.

## Amendment 8 (ledger rows 2107/2108/2157/2209/2228/2241/2269/2286, M2 of the model-implementation arc; ratified program row 1937 continues) — six keys and six laws ported from arc 4 of the model-iteration loop experiment: `min <axis>`/L12, `elastic <axis>`/L13, `ceiling <axis>` + the along/across role frame/L14, `activity`/`@demote`/L15, `floor <axis>`/L16, `edge <axis>`/L17

**Ruling.** Port arc 4 of the model-iteration loop experiment (branch
`lyt-model-loop-experiment`, loop iterations 8-13, its own six rounds)
to mainline `research/lyt`, continuing Amendment 7's own M1 port of arc
1-2. Arc 4 minted six more language extensions against the same two
clean-room encodings, each shipped by its own round already in amendment
form with its own accept/refuse test coverage: `min <axis> <extent>`
(round 1, L12), `elastic <axis>` (round 2, L13), `ceiling <axis>` plus
the `along`/`across` role frame every axis-taking key in this language
now accepts (round 3, L14), `activity <level>` plus the fourth presence
kind `@demote(<axis> <px>)` (round 4, L15), `floor <axis> <px>` (round
5, L16), and `edge <axis> unit|item|continuous` (round 6, L17). A
follow-on `lyt-arc4-consolidation` commission (ledger row 2157's own
successor) verified all six against their actual implementation
adversarially and found no implementation bug — this port carries that
verified implementation to mainline, adapted only where the experiment's
own encoding-specific assumptions needed generalizing (none did — see
"What needed generalizing" below, mirroring Amendment 7's own finding).

**Law numbers, preserved from the experiment's own discovery order.**
Arc 4 continued the same next-free numbering Amendment 7's laws
(L9-L11) already established, with no further collision found against
the not-yet-shipped mainline proposal that claims L6/L7
(`.claude/dispatch-reports/lyt-domain-model-proposal.md`): `min <axis>`
is L12 (round 1), `elastic <axis>` is L13 (round 2), `ceiling <axis>` is
L14 (round 3), `activity`/`@demote` is L15 (round 4), `floor <axis>` is
L16 (round 5), `edge <axis>` is L17 (round 6) — the laws' own discovery
order, not a re-sorted or thematically-grouped numbering.

**L15 is not a numbering gap.** It reads as a break in the
L12/L13/L14/L16 sequence only when those four are read together with L9
(Amendment 7) as an "attribution square" — four ways a rectangle and its
content can disagree in AREA — and L15 is not a fifth corner of that
square. It is a PRESENCE law (a fourth `@toggle`-family kind plus the
leaf-ranking vocabulary it depends on); L17 is likewise outside the
square, a BOUNDARY law rather than an area law. The numbering
L12→L13→L14→L15→L16→L17 is a plain, continuous, next-free sequence with
no hole — three families sharing one sequence, not four members of one
family with a hole in it.

**The attribution square, reproduced from the experiment's own
consolidated table** (`.claude/dispatch-reports/lyt-arc4-consolidation.md`):

| the disagreement | the word | law | since |
|---|---|---|---|
| the reservation exceeds a FINITE demand | `ceiling` (whole-leaf) | L9 | Amendment 7 |
| the reservation exceeds what the occupant paints, demand unbounded | `elastic <axis>` | L13 | round 2 |
| the CONTENT exceeds the reservation | `scroll <axis>` (owner of the excess) | L5a | Amendment 5 |
| the reservation is smaller than the content's own smallest whole form | `floor <axis>` | L16 | round 5 |

`ceiling <axis>` (L14, round 3) is the per-axis, two-dimensional-structure
form of the same first row, not a fifth corner. `min <axis>` (L12, round
1) is a distinct, narrower fact — a floor for the ONE position (root, or
a direct child of an Exclusive/T node) where a slot's `min` binds both
of its axes at once — and is solver-VISIBLE where the square's other
three members are realization-binding only. `edge <axis>` (L17, round
6) is deliberately outside the square: it is about the BOUNDARY a
scroll creates, not the area a rectangle disagrees with its content
over, and the square's four members can all be individually satisfied
by a leaf whose scroll boundary still cuts a row in half — which is
exactly the gap L17 closes.

**What this amendment implements**, all six following the "one more
recognized key in the existing sizing bag" precedent Amendments 3/5/6/7
already established:

1. **`min <axis> <extent>`** (`Sizing.axis_mins`, accumulated like
   `scroll`) — a PER-AXIS floor, legal only where a slot's rectangle IS
   its parent's on both axes (the root, or a direct child of an
   Exclusive/T node — the same `along=None` position `compiler.
   _constrain` already distinguishes). Overrides the axis-agnostic `min`
   for the named axis only; an axis nobody names keeps `min` unchanged.
   Unlike every other key this amendment adds, L12 is SOLVER-VISIBLE:
   `compiler._constrain` and the Exclusive branch's own componentwise-max
   floor derivation both read it. Load-time half:
   `loader._load_axis_mins`. Structural half (is this slot actually in a
   both-axes position?): `wellformed.find_l12_violations`.
2. **`elastic <axis>`** (`Leaf.elastic_axes`, accumulated) — along that
   axis, whatever extent this leaf's reservation is granted, its
   OCCUPANT claims it; the dual of L9's `ceiling` for `content
   unbounded` leaves (which have no finite demand to shrink a
   reservation back to). Leaf-only; requires `content unbounded`;
   solver-inert. L13's structural half (`wellformed.find_l13_violations`)
   fires only at the same both-axes position L12 distinguishes, and
   requires an unbounded leaf there to dispose of every axis its
   reservation can exceed its floor on — by `scroll`, by `elastic`, or by
   a pinned floor==cap.
3. **`ceiling <axis>` + the `along`/`across` role frame** (`Leaf.
   ceiling_axes`; `VALID_AXIS_ROLES`, `loader._resolve_axis_token`) — the
   per-axis form of L9's whole-leaf `ceiling` flag, for a leaf whose two
   axes tell different content stories (a two-dimensionally scrollable
   structure, `scroll h` + `scroll v`, whose extent on either axis is a
   property of the structure and never a constant). The role frame
   itself is threaded through every axis-taking key that predates it
   (`scroll`/`unit`/`elastic`/`min <axis>`) as well as `ceiling <axis>`/
   `floor <axis>`/`edge <axis>` below — a leaf may spell an axis
   physically (`h`/`v`) or by role (`along` its own declared `orient`,
   `across` the other), resolved at load time and never surviving into
   the AST. Leaf-only; `{h,v}` after role resolution; requires an owner
   for what goes past the bound (`content bounded`, L9's own precondition,
   or a `scroll` on that SAME axis, L5a's owner already named). L14's
   structural half (`wellformed.find_l14_violations`) fires only at a
   Split child (the complement of L12/L13's both-axes position) whose
   leaf scrolls both axes and pins its partition axis with no ceiling to
   say the pin is a bound.
4. **`activity <level>` + `@demote(<axis> <px>)`** (`Leaf.activity`,
   closed vocabulary `{sustained, occasional}`; `Presence.kind='demote'`
   + `demote_axis`/`demote_below_px`, the fourth presence kind beside
   `@fixed`/`@dev`/`@toggle`) — how often the task a screen exists for
   touches a leaf's content, and, for `occasional` content, the axis and
   threshold at which the whole slot vacates its band for the overlay
   stratum. `@demote` is a presence fact, not a sizing key, because what
   it DOES is exactly what `@toggle(user, release)` does — the presence
   stratum already owns that verb, already prunes such a slot before the
   solve (`presence.prune_absent`), and already solves each reachable
   valuation separately (Amendment 4); `presence.validate_valuation`
   gained exactly one `or` clause admitting a demote slot as
   nameable-absent, on the same footing a user-release toggle already
   had. Demotion is deliberately NOT `toggle(by='system', hidden=
   'release')`, which L1 (line 268/353-356) still makes untypable — a
   demotion's trigger is the PAGE MEASURE, a third actor distinct from
   both the user's click and the system's own state, and giving it its
   own kind is what keeps L1's prohibition intact rather than quietly
   widened (`demote_axis`/`demote_below_px` are `None` for every other
   kind, enforced at construction). L15's structural half
   (`wellformed.find_l15_violations`) has three clauses: a leaf declaring
   `wrap` must declare `activity` (silence is not an answer to "may this
   content leave instead"); a ranking is a band-wide fact (if any direct
   leaf child of a Split is ranked, all must be); and a Split every one
   of whose children can demote is a presence slot in disguise
   (`@toggle(user, release)` is already this language's word for one).
5. **`floor <axis> <px>`** (`Leaf.floor_axes`, accumulated) — the
   leaf's own SMALLEST USABLE extent per axis, the DEFICIT corner of the
   attribution square: below this extent the leaf is not a truncated
   rendering of its content but a CUT through one of its members.
   Leaf-only; `{h,v}` after role resolution (unlike `@demote`'s
   threshold axis, `along`/`across` ARE admitted here — a floor is a
   fact about the leaf's own content in the leaf's own frame); a
   CONSTANT px extent only, judged on the RAW term before `ch` is folded
   into px (so the fact that a number came from a text measure is not
   lost before the refusal that cares about it can fire). L16's
   structural half (`wellformed.find_l16_violations`) has three clauses:
   the TRIGGER (a leaf that disposed of surplus via `elastic` and excess
   via `scroll` but never declared how little room makes it unusable);
   the JOIN TO L15 (a declared floor must be RESERVED, via `min`/`min
   <axis>`, or the leaf must be able to LEAVE via `@demote`); and
   reachability (a floor above the leaf's own constant cap is two facts
   in one bag that cannot both hold).
6. **`edge <axis> unit|item|continuous`** (`Leaf.edge_axes`, accumulated,
   closed vocabulary `_VALID_EDGE_DISPOSITIONS`) — what a leaf's own
   scroll BOUNDARY on an axis falls on, the first key about the boundary
   a scroll creates rather than the area it bounds. `unit`: the
   boundary falls on a constant-pitch sequence (the leaf's own declared
   L10 `unit`) and is QUANTIZED — the sub-unit remainder is given back,
   never painted through. `item`: the content is made of indivisible
   things of no constant pitch, and the boundary is ANNOUNCED rather
   than placed — a standing lane says the content continues, so a
   partial item reads as "more below" rather than as a slice. `continuous`:
   nothing indivisible stands at the boundary, and it owes neither.
   `unit` is biconditional with L10's own `unit <axis>` — both directions
   refused at load — which is what keeps a three-member vocabulary from
   collapsing to a derivable two. L17's structural half
   (`wellformed.find_l17_violations`) has three clauses: the TRIGGER (a
   leaf declaring `content unbounded` and `scroll <a>` owes an `edge
   <a>` — deliberately WIDER than L16's own trigger, since an edge is
   created by the scroll itself and not by having reasoned about a
   residual); an edge is only where a scroll is; and the JOIN TO L13
   (`edge <a> unit` and `elastic <a>` dispose of the same pixels in
   opposite directions, which cannot both hold).

**Dormancy — this port's own acceptance bar, unchanged from Amendment
7's [paragraph CORRECTED 2026-08-12, fix pass on the M2 substrate-port
review's finding 2, ledger row 2312 — the original text below claimed
"every one of L12-L17 returns `[]` unconditionally for both trees",
which is false for two of the six; the correction is inline, not a
rewrite of the surrounding claims that were and remain true].** No
`.lyt` file in this repository declares any of the six keys — neither
`lengyue_landscape.lyt` nor `lengyue_portrait.lyt` is touched by this
amendment. `wellformed.find_l12_violations`, `find_l14_violations`,
`find_l15_violations`, and `find_l16_violations` are gated on a genuine
declaration or condition existing somewhere in the tree (L12 on an
axis-keyed `min`; L14/L15/L16's structural halves fire on the
underlying CONDITION — a two-axis scroller with a pinned partition
axis, a wrapping leaf, a surplus-and-excess leaf — rather than on a
declaration of their own key, which is the point: each law exists to
find the leaf that never declared what it should have). Neither
reference encoding declares any Amendment-8 key, and neither triggers
any of these three condition-based checks either, so all four of these
laws return `[]` unconditionally for both trees, and all four are wired
into `check_wellformed`'s `all_violations` (see "What it touched"
below) — genuinely dormant end-to-end.

**L13 and L17 are NOT in the same position, and the original text above
overstated the port's own acceptance bar by lumping them in.** Both
functions' own structural conditions DO trip against both real,
unedited reference encodings as they stand today: L13's trigger (an
unbounded-both-axes leaf with no `scroll`/`elastic`/pinned-floor==cap
disposition) fires on `CP-library`/`CP-cards` (2 violations); L17's
trigger (an unbounded, scrolling leaf with no declared `edge`) fires
across six sites (`boardRail`/`tree`×2/`CP-library`/`CP-cards`/
`settingsPane`/`otherBand`, 4 violations per class). Neither firing is
a defect in the check itself — both are correctly identifying leaves
this stage's own encoding content genuinely hasn't been edited to
satisfy yet, which is stage B's own job, not this port's. What keeps
`load_layouts` from refusing on either TODAY is that `check_wellformed`'s
`all_violations` list deliberately does NOT include L13/L17 (see "What
it touched" below) — wiring either in without first landing stage B's
encoding-content edits would make `load_layouts` refuse BOTH reference
encodings outright, verified directly rather than guessed (this is the
same fact `wellformed.check_wellformed`'s own "M2 PORT DISCLOSURE"
docstring paragraph states in the code itself). Verified two ways: (a)
`tests/test_loop_laws.py`'s own arc-4 test classes (ported from the
experiment branch, appended to the file Amendment 7's own port already
carries) assert both reference encodings load with every new field at
its default — still true, since `load_layouts` never calls
`find_l13_violations`/`find_l17_violations`; (b) both encodings were
re-solved via `runner.py` before and after this amendment's code
changes — **byte-identical solver output** (stdout diff empty), the
same acceptance bar Amendment 7's own M1 commission set — also still
true, since neither claim depended on L13/L17's own violation counts.
See `.claude/dispatch-reports/lyt-m2-substrate-port.md` for the full
before/after transcript.

**[CORRECTED 2026-08-12, M2 stage B2a, ledger rows 2108/2331 — the
paragraph above is preserved verbatim as the historical record of this
amendment's own original port; it is superseded by stage B2a's own
encoding-compliance edits, not deleted.]** Stage B2a's own commission
closed exactly the gap this paragraph names: `lengyue_landscape.lyt`/
`lengyue_portrait.lyt` were edited (`elastic h` + `floor v` on
`CP-library`/`CP-cards` for L13; `edge v <disposition>`, reasoned per
leaf from its own content nature, on `CP-library`/`CP-cards`/
`settingsPane`/`otherBand` for L17) so that both laws' own structural
conditions are now SATISFIED rather than merely un-enforced, and both
are now wired into `check_wellformed`'s `all_violations` — both
reference encodings load CLEAN under strict enforcement (verified
directly). See `.claude/dispatch-reports/lyt-m2-b2a-encoding-
compliance.md` for the full before/after transcript and coverage-matrix
re-verification.

A further correction, made at the same time: this paragraph's own
firing-record claim — "`boardRail`/`tree`×2/`CP-library`/`CP-cards`/
`settingsPane`/`otherBand`, 4 violations per class" — is FALSE relative
to mainline's own committed encodings as they stood at stage B2a's own
start. Direct load found `find_l17_violations` returning exactly FOUR
violations (`CP-library`, `CP-cards`, `settingsPane`, `otherBand`), not
across the six named sites — neither `boardRail` nor `tree` declares
`content`/`scroll` in either `.lyt` file, so neither ever tripped L17's
own trigger. That claim was inherited from the experiment branch's own
differently-shaped encoding (arc 4's own edited copy, which DID carry
`content`/`scroll` on `boardRail`/`tree`) and was never independently
re-verified against mainline's own committed tree before being written
into this port's own dispatch report and, from there, into this file.
Corrected here rather than silently matched.

**What needed generalizing vs. what ported clean.** As with Amendment
7, none of the six keys' `loader.py`/`wellformed.py`/`lyt_ast.py`/
`parser.py`/`compiler.py` implementations reference any
encoding-specific fact (a widget id, a tree path, a specific pixel
value) — every accept/refuse rule is stated purely in terms of node
kind, declared `content` class, declared axis, tree structure, and (for
L12) the componentwise-max floor derivation `compiler._constrain`
already carries for the pre-existing T-node case. The port is therefore
a clean carry of the experiment's own arc-4 functions, with law-number
citations and comment provenance (`LOOP ITERATION N / ARC 4 ROUND M`,
ledger rows) preserved VERBATIM from the experiment branch's own
authorship, per this port's own disclosed posture: unlike Amendment 7
(whose L9-L11 citations were rewritten from "LOOP ITERATION N" to
"AMENDMENT 7" phrasing at port time), this port's arc-4 comments —
including branch-name qualifiers such as "NOT merged without
ratification" — are left exactly as the experiment wrote them, a
historical-record posture matching the same "a commit message is
immutable" discipline Amendment 7's own "renumbering" section already
states for the loop's commit messages. A future amendment may choose to
reconcile that phrasing; this port does not, to avoid re-authoring text
this file's own discipline treats as a dated record.

**Scope narrower than the experiment's own reach, disclosed rather than
silently absorbed.** Two surfaces the experiment branch's own arc-4
rounds touched are explicitly OUT of this port's scope, and neither is
touched here:

- **`emit_layout_tree.py`'s realization-layer emission** (the JSON leaf
  fields `elasticAxes`/`ceilingAxes`/`floorAxes`/`edgeAxes`/
  `orientation`/`activity`/`demote`/`envelopeStates`, and the
  corresponding `demand`/`ceiling` track-shape TS rendering) is NOT
  ported — mainline's copy of this file is untouched by this amendment,
  matching Amendment 7's own precedent of excluding
  `emit_mockup.py`/`emit_layout_tree.py` realization-table changes.
  Porting it would require regenerating the two committed
  `frontend/src/state/lyt-layout*.gen.ts` files (guarded by `tests/
  test_emit_layout_tree.py::test_render_ts_roundtrip_matches_committed_
  file` and its portrait counterpart), which is a `frontend/`-touching
  change this stage's own commission brief explicitly puts out of scope.
- **The `along h|v` orientation key and its own realization consumer**
  (frontend's `useLytActivityInvariance.ts` / `lyt-widget-registry.ts` /
  `lyt-capability-registry.ts`) live entirely in `frontend/`, not
  `research/lyt/` — disclosed as a STOP-and-report scope item in this
  amendment's own dispatch report rather than ported.

Both are Python/loader-side dormant either way (the language-level
`_load_orientation`/`VALID_AXIS_ROLES`/`_resolve_axis_token` machinery
IS ported, per the role frame item 3 above — only the frontend-facing
realization/consumption layer is excluded).

**Diff vs. the original consult document's prose.** `layout-language-
consult.md` names none of `min <axis>`, `elastic`, `ceiling <axis>`,
`activity`, `@demote`, `floor <axis>`, or `edge <axis>` — same footing
as Amendments 1-7: a genuine language extension, not a reading
recovered from existing text. As with Amendment 7, none of the six were
authored against mainline SPEC.md directly — they were proven out on
the experiment branch first (six iteration rounds, gallery-recorded),
verified by that branch's own adversarial test suite and by the
`lyt-arc4-consolidation` follow-on commission, and only then ported
here.

**What it touched.** `lyt_ast.py` (`Sizing.axis_mins` + `axis_min()`
accessor, `Leaf.elastic_axes`/`ceiling_axes`/`activity`/`floor_axes`/
`edge_axes`/`orientation`, `Presence.kind='demote'` +
`demote_axis`/`demote_below_px` + the `demote()` constructor,
`_VALID_ACTIVITY_LEVELS`/`_VALID_EDGE_DISPOSITIONS`/`_VALID_
ORIENTATIONS`/`VALID_AXIS_ROLES`, each field's own `__post_init__`
closed-vocabulary guard); `parser.py` (`RawSizing.axis_mins`/
`elastic_axes`/`ceiling_axes`/`activity`/`floor_axes`/`edge_axes`/
`orient`, `RawPresence.demote_axis`/`demote_below`, the `@demote(<axis>
<extent>)` production, six more `parse_sizing` branches); `loader.py`
(`_load_axis_mins`/`_load_elastic_axes`/`_load_ceiling_axes`/
`_load_activity`/`_load_demote_presence`/`_load_floor_axes`/
`_load_edge_axes`/`_load_orientation`, `_resolve_axis_token`, wired into
every `load_slot` branch with `orientation` now resolved ahead of every
axis-taking key it feeds); `wellformed.py` (`find_l12_violations`
through `find_l17_violations` all six ported and correct, but
`check_wellformed` generalized to arbitrate only L12/L14/L15/L16
through the same waiver mechanism L2/L5/L10/L11 already use — L13/L17
are deliberately NOT wired into `all_violations`, corrected 2026-08-12,
fix pass on the M2 substrate-port review's finding 2; see the Dormancy
paragraph above for why); `compiler.py` (`_constrain`'s `axis_min` read, the
Exclusive branch's per-axis componentwise-max, both gated dormant on no
axis-keyed `min` declared); `presence.py` (`validate_valuation`'s
one-clause widening to admit a demote slot as nameable-absent);
`coverage_matrix.py` (new file, the 24-point matrix — 2 classes × 3
valuations × sizes — ported from the experiment branch's own
METAMODEL-WAVE item-3 script, adapted only to drop the branch-name/
"NOT merged without ratification" framing from its own header, per this
file's own established posture for framing prose vs. per-law
provenance); `tests/test_loop_laws.py` (arc-4 test classes appended to
the file Amendment 7's own port already carries, ported from the
experiment branch's own file of the same name); SPEC.md's §15 gains a
matching grammar/semantics addendum for the six keys (this amendment's
own §15.4-adjacent material); this amendment's own dispatch report,
`.claude/dispatch-reports/lyt-m2-substrate-port.md`.

## Amendment 9 (ledger row 2310, M2 stage B1) — derived orientation: `orient` becomes DERIVED for a residual-holding leaf, law L18

**Ruling, verbatim substance (commissioner-ratified 2026-08-12).** Tree
orientation is DERIVED, not authored. A leaf's `orient` (Amendment 8's
`Leaf.orientation`) derives from the aspect ratio of its RESIDUAL SLOT —
the box left over after its Split siblings are placed — whenever that
leaf genuinely IS its Split's unique residual-holding child. Because the
residual-holding sibling's own along-extent is exactly what the
partition equality leaves over once every OTHER sibling's extent is
pinned, the residual box's aspect is well-defined BEFORE the leaf's own
orientation-dependent demands (the L14 `along`/`across` role frame)
enter at all: siblings solve first, the residual box's aspect picks
h|v, THEN the role frame binds through the chosen orientation. Single
pass, no fixed point. Sub-rulings: (a) derivation is the DEFAULT; the
authored `orient` key survives only as an override for non-residual
placements, and an authored `orient` on a residual-holding leaf is a
wellformedness REFUSAL (declaring what the model derives); (b) an
aspect tie at exactly 1 falls to VERTICAL, stated as a spec rule (1 is
a legitimate bare quantity). The state-universe enumeration covers both
orientations automatically per point — no conditional-disjunction
construct exists or is added.

**What this amendment implements.**

1. **Structural residual-holding detection**
   (`wellformed.find_residual_child`/`find_residual_leaves`) — a Split's
   own UNIQUE `pref: fr`-typed direct child is its residual-holding
   child (SPEC.md §2's partition equality: every other child's extent is
   fixed or bounded, so the `fr` child is the one that genuinely absorbs
   whatever is left). Ambiguous (two or more `fr`-typed children) or
   absent (none) is silently non-applicable — DISCLOSED, not a refusal:
   the ruling names a single, unambiguous residual holder and this port
   does not invent a tie-break rule to resolve a case the ruling never
   adjudicated. Applies to Split nodes only (an Exclusive's children all
   share the whole rectangle, §2 — no residual between them). Only a
   LEAF residual-holder is a derivation subject (`orient` is leaf-only,
   SPEC.md §16.1) — a Split/Exclusive residual-holder contributes no
   entry.
2. **L18 (derived-orientation authorship)** — `wellformed.
   find_l18_violations`, in the SAME structural walk-and-arbitrate
   family L2/L5/L10-L17 already use, wired into `check_wellformed`'s
   `all_violations`. Fires exactly where a leaf is BOTH the unique
   residual-holding child of its Split parent AND authors `orient`
   (`Leaf.orientation_declared`, a new field this amendment adds — see
   below). This is sub-ruling (a)'s refusal, verbatim; `orient` remains
   fully legal everywhere else, including a leaf sitting beside the
   residual holder in the SAME Split.
3. **`Leaf.orientation_declared: bool`** (`lyt_ast.py`, new field,
   default `False`) — whether `orient` was AUTHORED in the concrete
   syntax, as distinct from `Leaf.orientation` itself (which stores an
   identical value for "declared v" and "defaulted to v"). L18 needs
   this provenance; no other consumer reads it.
4. **The derivation, post-solve** (`orientation.py`, new module) —
   `derive_orientation(w, h)` (sub-ruling (b)'s tie-to-vertical rule:
   `aspect = w/h`; `> 1` derives `'h'`, `<= 1` derives `'v'`, which is
   what makes the `aspect == 1` tie fall to `'v'` with no separate
   branch); `compute_derived_orientations(root, result)` (combines
   `find_residual_leaves` with a `compiler.SolveResult`'s own solved
   rectangles, keyed by the same dotted path both `loader.py` and
   `compiler.py` already use); `rebind(text, layout_name, root, result,
   *, waivers=None)` (re-loads `text` a SECOND time, through a new
   `orientation_overrides` parameter on `loader.load_slot`/
   `load_layouts` — see "the re-load seam" below — returning `root`
   UNCHANGED, the same object, when nothing was derived).
5. **`loader.load_slot`/`load_layouts` gain `orientation_overrides`**
   — `load_slot`'s own parameter is `Dict[str, str]` (widget id →
   physical axis), scoped to the ONE layout it is loading; `load_layouts`'s
   is `Dict[str, Dict[str, str]]` (layout name → widget id → physical
   axis, mirroring `waivers`' own per-layout shape), defaulting to
   `None`/`{}` — byte-identical to every pre-Amendment-9 call. When a
   leaf's widget id appears in the map addressed to its own layout, its
   resolved value wins over whatever `_load_orientation` would otherwise
   have produced (the load-time default `'v'`, since L18 already forbids
   an authored `orient` from ever reaching this branch for a residual
   leaf).

   **2026-08-12 CORRECTION** (review of ledger row 2310, Duty 6 finding):
   `load_layouts`'s parameter was originally specified and shipped as the
   SAME bare `Dict[str, str]` as `load_slot`'s, threaded verbatim into
   every `layout NAME = ...` fragment parsed from one `text` blob — no
   `(layout_name, widget_id)` scoping. Since a `.lyt` text blob can carry
   more than one layout fragment, a widget id repeated across two
   fragments could silently inherit an override computed from a
   DIFFERENT layout's own solve (confirmed live by a synthetic probe
   during review; dormant against every `.lyt` file committed to
   `research/lyt/encodings/` today only because each contains exactly one
   fragment). `load_layouts` now takes the `Dict[str, Dict[str, str]]`
   shape described above and narrows it to the per-layout sub-map before
   ever calling `load_slot`, making the cross-layout collision
   unrepresentable rather than merely absent-by-corpus-luck.
   `orientation.rebind` — the only caller that ever passes a non-`None`
   value here — was updated in the same change to address its derived
   map to the specific layout it derived from.
6. **`runner.py` wires `orientation.rebind` into `run_all`'s own
   per-size solve loop** — after each solve, before printing/rendering,
   re-deriving and re-binding for that specific screen size (orientation
   is a property of a SOLVED size, not merely a declared class — two
   different sizes nearest-neighbor-matched to the same class can have
   differently-shaped residual boxes). Presence pruning is re-applied to
   the rebound tree so `slot`/`result.rects` (path-keyed on the PRUNED
   tree) stay aligned.

**Why this is solver-inert (the reason "single pass, no fixed point" is
true and not merely asserted).** Every axis-taking key the L14 role
frame threads through (`ceiling`/`elastic`/`floor`/`edge`/`unit`/
`scroll`) is realization-binding only — `compiler.py` never reads any
of them (SPEC.md §15.2/§16.1). The one exception, `min <axis>` (L12),
IS solver-visible, but is refused everywhere except the "both-axes"
position (root, or a direct Exclusive/T-node child) — a Split child,
which is what a residual-holding leaf always is, can never legally
declare it. So a residual-holding leaf's own orientation-dependent
facts never feed the CP-SAT model at all: the solved geometry is
identical whether the leaf's true orientation is known, guessed, or
left at the load-time placeholder. This is what makes ONE solve
sufficient — solve once (placeholder orientation for the residual
leaf), read its own solved `(w, h)` off that one solve, derive its true
orientation, re-bind the role frame through the derived choice. No
second solve, no convergence loop.

**The re-load seam, and why NOT a raw-token-preserving AST change.**
Re-binding the L14 role frame means re-resolving `along`/`across`
tokens to physical axes (`loader._resolve_axis_token`) — but by load
time those tokens are already gone (SPEC.md §16.1: "resolved to a
physical axis at load time... and never survives into the AST"), so an
already-loaded `Leaf` has nothing left to re-resolve in place. Rather
than retrofit the typed AST to retain raw, pre-resolution tokens (a
footprint change to every axis-taking field, for a fact only a
residual-holding leaf ever needs), this amendment re-loads the SAME
source text a second time through `orientation_overrides` — the
ordinary "parser permissive, loader resolves" pipeline runs twice, once
to solve, once more to bind. Disclosed engineering tradeoff, not a
reading recovered from the ruling's own text (the ruling states the
WHAT — single pass, no fixed point — not the HOW).

**Real-encoding finding, disclosed rather than assumed.** This
mechanism is NOT structurally dormant against
`lengyue_landscape.lyt`/`lengyue_portrait.lyt`. Both encodings carry
THREE genuine residual-holding leaves per class: `B` (the board, via
the `pref maximize` sugar SPEC.md §1.1 resolves to elastic `pref 1fr`)
and `settingsPane`/`otherBand` (both explicit `pref 1fr` leaves beside
a fixed sibling inside their own inner V-splits). L18 itself IS
dormant — none of the three, nor any other leaf in either encoding,
authors `orient`, so the refusal never fires — but
`orientation.compute_derived_orientations` genuinely derives real
values for all three, at every solved screen size, and `orientation.
rebind` genuinely re-loads and re-binds. What keeps `runner.py`'s own
before/after stdout byte-identical (verified: `diff` reports zero
differences, both `runner.py` and `emit_mockup.py`, matching hashes) is
a DIFFERENT, narrower fact: no consumer in this Python-only substrate
reads `Leaf.orientation`/the L14 role-frame fields for rendering today
— the realization-layer consumer is `frontend/`-side and was already
disclosed out of scope for the language-substrate ports this amendment
continues (Amendment 8's own "Scope narrower than the experiment's own
reach" section). The derivation genuinely runs; it has nothing
downstream to show a difference in yet.

**STOP-and-report: `tree` itself is not residual-holding today.** The
ruling's own illustrative language centers on the `tree` widget
("because the tree is the residual-holding sibling"). In the row both
encodings actually ship — `H(tree, T(...), previewBoard)` — `tree` is
FIXED (`min==pref==max`, 110px landscape / 140px portrait), and
`T(...)` (that row's own sole `pref: fr` child) is an Exclusive, not a
Leaf, so it could never be a derivation subject regardless (`orient` is
leaf-only). The ruling's own premise — "the tree is the residual-
holding sibling" — does not yet hold against the committed `.lyt`
content: making it hold would mean editing `lengyue_landscape.lyt`/
`lengyue_portrait.lyt`'s control-panel row so `tree` becomes the row's
sole elastic sibling and `T(...)` becomes fixed/capped instead — a
genuine product-layout content decision (which real screen sizes flip
INFEASIBLE/OPTIMAL, matching Amendment 4's own precedent for exactly
this class of consequence) this stage does not make unilaterally. This
is named here, per the umbrella's disclosed-narrowing/asking-before-
assuming discipline, rather than either silently improvising a specific
px edit or silently declaring the ruling's own headline example
witnessed when it structurally is not. See this amendment's own
dispatch report for the full account and the open question for the
commissioner.

**[RESOLVED 2026-08-12, M2 stage B2a, ledger rows 2108/2331 — the
STOP-and-report above is preserved verbatim as the historical record of
the open question it named; it is now closed, not deleted.]** The
fork-1 ruling (row 2108) answered the open question this STOP-and-report
raised: `tree` becomes the row's residual-holding sibling. Stage B2a
edited both encodings' own `H(tree, T(...), previewBoard)` row exactly
the way this paragraph's own "making it hold would mean" sentence
anticipated — `tree` moved from `{min==pref==max}` (fixed) to `{min <its
own established floor>, pref 1fr, max inf}` (elastic), and `T(...)` moved
the other way, PINNED at its own already-existing componentwise-max
floor (664px, unchanged — driven by `CP-analysis`'s own `min 664px`,
identical across both classes) instead of staying elastic. The
feasibility consequence this paragraph flagged as needing witnessing
("which real screen sizes flip INFEASIBLE/OPTIMAL") was checked directly
rather than assumed: `runner.py`'s own four representative sizes, the
24-point `coverage_matrix.py` product, and a direct re-solve of every
size this file's own Amendment 4 feasibility table names (14 points × 2
valuations) are ALL byte-identical in OPTIMAL/INFEASIBLE verdict before
and after the swap — the swap is feasibility-neutral, because `T(...)`'s
real structural floor was always 664px regardless of what its own `pref`
declared (the componentwise-max derivation is unconditional, §8's
`along=None` branch), so pinning `pref`/`max` to that already-binding
floor only changes which sibling absorbs slack when there is any, never
the hard feasibility boundary. See `.claude/dispatch-reports/
lyt-m2-b2a-encoding-compliance.md` for the full witness.

**Diff vs. the original consult document's prose.** `layout-language-
consult.md` names neither `orient`/orientation (an Amendment 8/
METAMODEL WAVE invention) nor residual-holding derivation at all — same
footing as every prior amendment: a genuine language extension, not a
reading recovered from existing text.

**What it touched.** `lyt_ast.py` (`Leaf.orientation_declared`);
`loader.py` (`load_slot`/`load_layouts` gain `orientation_overrides`;
the Leaf branch records `orientation_declared` and applies an override
when present); `wellformed.py` (`find_residual_child`,
`find_residual_leaves`, `find_l18_violations`, wired into
`check_wellformed`); `orientation.py` (new module — `derive_orientation`,
`compute_derived_orientations`, `rebind`); `runner.py` (`run_all` tracks
per-layout source text and calls `orientation.rebind` after each solve,
re-pruning presence on the rebound tree); `tests/
test_derived_orientation.py` (new file — both aspect signs, the tie
case, the L18 refusal, override-still-honored on a non-residual
placement, end-to-end L14 role-frame re-binding proof, an `INFEASIBLE`-
solve no-derivation case, `rebind`'s identity-preservation on the common
case, and the real-encoding residual-site/dormancy findings above,
pinned as regression tests); `research/lyt/encodings/*.lyt`
(UNTOUCHED — `git status --short` empty; the STOP-and-report above is
exactly about what an encoding edit here would need to do, deliberately
not made in this change); `frontend/` (untouched, out of scope, same
posture Amendment 8 already took for its own realization-layer
exclusions).

## License

Public Domain (The Unlicense), matching [layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md)'s
own license and the umbrella's ADR-0006 per-file convention.
