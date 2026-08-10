# LYT spec amendments

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

## License

Public Domain (The Unlicense), matching [layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md)'s
own license and the umbrella's ADR-0006 per-file convention.
