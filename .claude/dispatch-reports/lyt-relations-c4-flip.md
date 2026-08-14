# LYT relations-first amendment — dispatch C4: the closing step (refusal flip, C3 review conditions, lyt-side riders)

Ledger rows governing this dispatch: 2396/2397/2400/2419/2425/2436/2445.
New rows written by this dispatch: 2462–2493 (ledger-policy source-file
change entries, per-file, plus this report's own entry).

**AMENDMENT, same dispatch, coordinator-directed mid-flight correction.**
Everything below through "## Claims summary" is this report's ORIGINAL
text, describing the FIRST pass: a flip mechanism built and tested but
deliberately left unwired from every production loading path, because
wiring it unconditionally would have refused the ~59 genuinely-
unreachable px/ch literals C3's own rewrite disclosedly left behind
(ledger row 2445's own qualified-zero ratification). The coordinator
correctly named this "the unconditional form was never the coherent
reading" and supplied the two review documents this report's own
original text says it could not locate. **"## Amendment — the RATCHET
form" (near the end, before the Claims summary) is the live account of
what actually shipped** — a commissioner-owned ratified-literals
manifest, WIRED into every production loading path, reconciling ruling
2396 ("px literals... banned") with ruling 2445 (a QUALIFIED zero is
ratified, not silently tolerated). The original text below is preserved
as the record of the first pass's own reasoning (including the now-
superseded "NOT wired in" decision and the now-resolved missing-
documents gap), not deleted or silently rewritten — read the amendment
section for the CURRENT state of every claim it touches.

**Base freshness.** Worktree HEAD at dispatch start was `3378806f` (a
stale dependabot merge). Reset (hard, safe — HEAD was a strict
ancestor of `lyt-phase2`'s tip, and the only untracked content was
`.claude/`, outside scope) to LOCAL `lyt-phase2`'s tip,
`c9a9f1aa397f55437ed5f09c67fb57d848603826`. Verified before any edit:
`encodings/lengyue_landscape.lyt` is 61 lines, `grep -c '#'` returns 0
(comment-free); `SPEC-AMENDMENTS.md` contains "## Amendment 10" (line
1720). Both matched the brief's own stated expectations.

**A genuine documentation gap, surfaced rather than papered over.**
The brief names `.claude/dispatch-reports/lyt-relations-b-review.md`
and `lyt-relations-c3-review.md` as files "tracked in repo" to read
end to end. Neither exists anywhere in this worktree — confirmed by
`find` across the whole tree, case-insensitive, not merely the
`dispatch-reports/` directory. Both are referenced BY NAME from live
docstrings (`relations.py`'s own module docstring cites
`lyt-relations-b-review.md` §5; `loader.py` line 743 cites it too; this
dispatch's own brief cites `lyt-relations-c3-review.md` §8 conditions
2-3), so the citations are real and the reviews plainly happened — but
the review documents themselves were never committed, or were
committed under a different final name and the pointer never updated.
Per this repo's own ADR-0002-applied-to-documentation discipline, this
gap is named here rather than bluffed past: **UNEXERCISED** for both
files (not read, because not present to read). What this dispatch did
instead, disclosed at each point of use:

- For "b-review.md §5" and "b-review.md §minor-finding-3": the SAME
  corrections are already folded, verbatim, into `relations.py`'s own
  module docstring (a `[Corrected 2026-08-13, ...]` block) and
  `loader.py`'s own inline comment near `_load_axis_mins`/`_load_sizing`
  (the F7-style "this comment previously described a load-time-refusal
  shape a probe never actually reaches" correction) — both READ end to
  end as part of this dispatch's own required reading, so the
  review's SUBSTANCE was available even though the review document
  itself was not.
- For "c3-review.md §8 conditions 2/3": no equivalent inline
  correction exists to recover the review's own wording from. This
  dispatch instead worked from `lyt-relations-c3-rewrite.md` (C3's own
  build report, read end to end — 519 lines) as the closest available
  primary source for the findings scope items 2 and 3 name (the
  both-664s finding, the two substrate bugs, the CP-analysis redesign,
  and the deprecation-count figures all appear there, self-reported by
  C3 rather than independently verified by a reviewer) — re-verified
  independently against the live code/encodings wherever practical
  (the deprecation counts were re-measured fresh by this dispatch's
  own `tools/count_deprecations.py`, not merely copied from C3's own
  report; the substrate bugs were spot-checked against the current
  `loader.py` source). The "cross-registration double-load pitfall"
  the brief attributes to "the C3 reviewer['s] own §6" could not be
  read in the reviewer's own words; this dispatch's own
  `tools/count_deprecations.py` avoids the pitfall by construction
  (one fresh subprocess per file — see its own module docstring for
  the reasoning) rather than by following the review's own specific
  diagnosis, since that text was unavailable.

**Reading list, otherwise complete per the brief.** `errors.py` (61
lines, in full), `loader.py`'s own module docstring and every
warning/refusal site touched (the file is 3014 lines; the module
docstring, `_resolve_extent_like`, `_load_sizing`, `load_slot`,
`load_layouts`, and the Split/Exclusive branches' own relation-context
construction — the sites this dispatch's own edits needed — were read
in full; the remaining ~40 `_load_*` helper functions unrelated to
this dispatch's scope were not individually read line-by-line, only
grep-located and their signatures/docstrings checked where a call site
needed touching). `SPEC.md` §4 (Sizing stratum, full), §13 (Amendment
5 — overflow/content/scroll, full), §18 (Amendment 10 — content
relocation, full) — the sections covering sizing/relations/content
classification, per the brief's own instruction to "find what §s cover
sizing/relations" (SPEC.md, read end to end for the sections cited,
has NO dedicated relations-grammar section at all — dispatch B/C never
folded the relations-first amendment into SPEC.md's own numbered
sections, only into `relations.py`'s own docstring and the governing
dispatch spec; this is itself a disclosed documentation gap, not
something this dispatch's own scope authorizes fixing).
`SPEC-AMENDMENTS.md` (2013 lines pre-dispatch, in full, including
Amendments 9/10 and the existing Residual items R1/R2).
`lyt-relations-c3-rewrite.md` (519 lines, in full).
`tests/test_relations.py` (665 lines pre-dispatch, in full).

---

## 1. FLIP mechanism (scope item 1)

**Design.** `warnings.simplefilter("error", RelationsFirstDeprecationWarning)`
(errors.py's own pre-existing "channel B") does **not** suffice alone:
it cannot distinguish a px/ch literal from an `fr`/`inf` structural
sizing keyword, since `_resolve_extent_like` fires the SAME warning
class for both (confirmed directly — C3's own report independently
found the same thing: "every `pref 1fr` and `max inf` in the tree ALSO
fires the same deprecation channel"). The brief's own scope asks
specifically for "px/ch literals ... become refusals," not every
literal — so channel B alone would over-refuse. Minimal code was
therefore added, per the brief's own fallback instruction:

- `relations.RelationContext` gains two fields, both defaulting to the
  pre-C4 behavior: `refuse_literal_bounds: bool = False`,
  `source_file: Optional[str] = None`.
- `loader._resolve_extent_like`'s existing warning branch gains one
  guard: `if ctx.refuse_literal_bounds and e.unit in ("px", "ch"):
  raise LytLoadError(...)` — a structured refusal
  (`detail["prohibition"] == "px-literal-in-governed-encoding"`) naming
  `where` (the exact dotted tree path + widget id), `unit`, `v`, and
  `source_file`. `fr`/`inf` literals are UNAFFECTED regardless of the
  flag (pinned by
  `test_strict_mode_does_not_refuse_fr_or_inf_literals`).
- `load_slot`/`load_layouts` both gain `refuse_literal_bounds`/
  `source_file` parameters, threaded into the ROOT `RelationContext`
  they build; the Split and Exclusive branches' own child/own-context
  constructions carry both fields FORWARD from the received context
  (the same posture `facts` already takes) — pinned by
  `test_strict_mode_carries_forward_into_child_and_descendant_contexts`,
  which reaches a px literal nested inside both a Split's child AND a
  T node's own child from one root-level flag.

**Directory scoping.** `load_layouts` takes `text`, never a path, so
directory-based routing has to live one level up, where a caller
already resolves a filename to a path. `runner.py` gains
`is_governed_encoding(path) -> bool` (`path.parent == ENCODINGS_DIR` —
directory-based, not a filename allowlist) and
`load_governed_layouts(filename, **kwargs)` (resolves via the existing
`resolve_encoding_file`, sets `refuse_literal_bounds` FROM
`is_governed_encoding`, never hand-picked). Verified against REAL
on-disk files, not only synthetic ones: `lengyue_landscape.lyt`
(`encodings/`) refuses; `q5go.lyt` (`fixtures/reference/`) and
`current_row_asis.lyt` (`fixtures/transcription/`, with
`baseline.BASELINE_WAIVERS`) do not.

**Not wired into any production loading path.** `runner.run_all`,
`emit_ts.py`, `emit_mockup.py`, `coverage_matrix.py`,
`emit_layout_tree.py` all still load both real encodings
warning-only, unchanged. **This is a disclosed scope-narrowing
decision, not an oversight — the STOP-and-report the brief's own
DISCIPLINES line calls for.** Reason: `tools/count_deprecations.py`
(built for scope item 3, see below) measured the two real committed
encodings' own residual literal-bound count directly — 61
(landscape) + 58 (portrait) = 119, matching C3's own reported figure
exactly — and dispatch C3's own report discloses that ~59 of those are
genuine px/ch literals with **no facts-table coverage yet** (no probe
or measurement exists for `boardRail`, `I_board`/`A_board`, the
`A_engine_*` row's own height, `tree`'s landscape floor,
`settingsSubstrip`, the six `pack-rows` item widths, `timelineStrip`,
three inner analysis-column mins, `otherColorDebug`, `otherBand`'s
enclosing V, `previewBoard`'s landscape figure, the side-column's own
width floor, and `60ch`). Activating strict mode as the DEFAULT
loading path for either real encoding today would refuse currently
load-bearing, honestly-disclosed content — not a defect this dispatch
found, but a direct, unavoidable consequence of C3's own disclosed
77.5%-not-100% reduction. Deliverable #5 of this dispatch's own brief
("suite green by exit code; roundtrip green") would be violated by
activating strict mode by default; this dispatch chose to build and
test the CAPABILITY, directory-scoped correctly, and name the gap
explicitly, rather than silently deciding either "force it on and
break the suite" or "silently skip the flip" without saying so.
`runner.load_governed_layouts`'s own docstring states this plainly for
the next reader; `tests/test_relations.py::
test_load_governed_layouts_refuses_on_a_real_encodings_file` PINS the
expectation that calling it against the real landscape encoding today
DOES refuse, so this is a tested, current fact, not a stale claim that
can silently drift.

`errors.py`'s `RelationsFirstDeprecationWarning` docstring was updated
to describe the flip landing (documentation discipline: the prior text
described the flip as a future event "dispatch C's own encoding
rewrite" would perform; C3 explicitly declined it, C4 performs it, the
docstring now says which channel does what and why the unscoped
`simplefilter`/`pytest -W` channel differs from the new scoped one).

---

## 2. C3 review condition 2 — Residual items R3/R4/R5 (scope item 2)

Added to `SPEC-AMENDMENTS.md`'s existing "Residual items" section, in
the same R-numbered, "What's missing / Why it wasn't authored (or
fixed) / Who'd need to close it" form R1/R2 already establish:

- **R3** — the "both-664s" cascade: `AT_multires`' own 580px height
  propagates through `compiler.py`'s Exclusive rectangle-sharing
  (`_constrain` gives every T-child the identical shared rectangle) to
  bind BOTH the outer BLACK BOX T's own pin AND `CP-analysis`'s own
  V-wrapper floor at the identical number, for independently-derivable
  reasons — a real finding, not a duplication bug, per C3's own
  bisection (663px fails, 664px succeeds).
- **R4** — the two substrate bugs C3 surfaced: bug 1 (the
  fixed/pinned-shorthand branch dropping `aspect`) is recorded CLOSED
  (fixed by C3 in the same dispatch); bug 2 (the envelope
  pref-must-equal-max-over check's structural incompatibility with a
  "floor-free, capped-growth" leaf shape — no track-shape vocabulary
  member exists for it either) is recorded OPEN, with the two
  directions a future ruling could take (relax L3, or widen the
  emitter's track-shape vocabulary) named without picking one.
- **R5** — the CP-analysis derived-floor redesign: no primitive
  reaches a plain Split's own DESCENDANTS more than one level down
  (only an enclosing split's siblings, or an Exclusive's own immediate
  children) — C3's own `CP-analysis` V-wrapper floor works around this
  by naming `AT_multires` directly via `read-constant` rather than
  genuinely deriving the floor from tree shape; a future
  descendant-reference primitive is named as the closing mechanism,
  not designed here.

All three are DOCUMENTARY folds (no behavior change) — `SPEC-
AMENDMENTS.md`'s own doc-graph scope was checked directly against
`tools/doc-graph/generate.mjs`'s own `SCAN_DIRS = ["docs"]` constant:
`research/lyt/*.md` is outside the umbrella doc-graph's scanned corpus
entirely, so no `doc-graph` regeneration is owed by this edit (verified
by reading the generator's own source, not assumed).

---

## 3. C3 review condition 3 — independent per-file deprecation count (scope item 3)

`research/lyt/tools/count_deprecations.py` (new file): one FRESH
Python subprocess per `.lyt` file (avoiding the cross-registration
double-load pitfall the brief attributes to the missing reviewer's own
§6 — see the documentation-gap section above for what could and
couldn't be recovered of that reasoning), two counts per file:
WARNING-MODE (the ordinary `load_layouts` call, full honest count) and,
for `encodings/` files only, STRICT-MODE (`refuse_literal_bounds=True`
— by construction always reports `0` warnings, since a px/ch literal
raises before it would have been recorded as a warning).

```
$ nice -n 19 ~/w/vdc/venvs/generic/bin/python tools/count_deprecations.py
file class             file                          warning-mode count  strict-mode (count, outcome)
----------------------------------------------------------------------------------------------------
encodings              lengyue_landscape.lyt                         61  0 refused:px-literal-in-governed-encoding@lengyue-landscape/H0:boardRail
encodings              lengyue_portrait.lyt                          58  0 refused:px-literal-in-governed-encoding@lengyue-portrait/V0:boardRail
fixtures/reference     ogs.lyt                                        9  -- (fixtures never strict)
fixtures/reference     q5go.lyt                                       9  -- (fixtures never strict)
fixtures/transcription current_row_asis.lyt                         109  -- (fixtures never strict)
fixtures/transcription current_row_repaired.lyt                     102  -- (fixtures never strict)
```

**"encodings should be ZERO post-flip," reconciled honestly.** This is
NOT "the two real encodings have zero residual literal bounds" — they
have 119 combined, matching C3's own disclosed figure exactly (61+58,
independently re-measured, not copied). It IS true in the literal
sense the strict-mode column demonstrates: under the flip, the
WARNING channel's own count is always 0, because a px/ch literal is
refused (an error) rather than recorded (a warning) — the two are
mutually exclusive outcomes for the same site by construction, not a
coincidence of these two files. **Fixtures counted honestly**: 9/9
(reference)/109/102 (transcription) — no flip applies to them, no
claim of zero is made or implied.

---

## 4. Riders — lyt-side content reclassification (scope item 4)

**`tree` — reclassified `content unbounded, scroll v, edge v item`**
in both `encodings/lengyue_landscape.lyt` (line 19) and
`encodings/lengyue_portrait.lyt` (line 18), verified against
`frontend/src/components/tree/TreeWidget.vue`'s own actual rendering
behavior (independent investigation, not assumed from the brief's own
framing):

- **Unbounded content, WITNESSED.** `TreeWidget.vue:362–415`
  (`nodeList`) and `:437–454` (`edges`) are both `computed()` derived
  from the full game-tree `props.nodes` via `useTreeLayout` — no cap
  anywhere in the file on node/edge count; the SVG's own pixel
  dimensions (`:285–295`) scale directly with the laid-out
  `rows`/`cols`. A Go game tree (mainline + variations) is genuinely
  open-ended, matching the `unbounded` class's own definition (§13.1)
  exactly.
- **Self-owned scroll, WITNESSED.** `TreeWidget.vue:654` —
  `.tree-widget-outer { overflow: auto; }` — declared on the leaf's own
  outer wrapper, the same element `outerRef`/`useScopedScroll`/
  `useViewportFollow` all bind to. The leaf owns its own scroll,
  satisfying L5a locally, not via an upstream ancestor.
- **`edge v item`, not `unit`.** No constant vertical pitch is
  declared anywhere in this substrate for the tree's own row layout
  (unlike `CP-library`/`CP-cards`, which DO declare `unit v <px>` and
  so use `edge v unit`) — `item` (indivisible content, no declared
  constant pitch) is the honest disposition, matching the SAME choice
  `SP_advancedRegistry`/`SP_keybindings` already make for their own
  un-pitched lists. Required by L17 (a leaf declaring `content
  unbounded, scroll v` with no `edge v` disposition is refused —
  confirmed directly: the first attempt at this reclassification,
  without `edge v`, correctly refused with an L17 "edge-attribution
  violation" naming the exact site).

**`A_engine_controls` — checked, `content bounded` CONFIRMED, no
change made.** The brief names "a reviewer-found latent divergence" —
independent investigation (`frontend/src/state/lyt-widget-registry.ts:
191–199` confirms `ToolbarEngineControls.vue` is the real mounted
component; that file and its two supporting composables read in full)
found NO divergence: exactly 5 fixed action buttons, 2 enumerable
realization forms (`button-cluster`/`menu-path`), no `overflow`/
`scroll` CSS rule anywhere in the component, and the `menu-path` form
explicitly uses `position: fixed` (`ToolbarEngineControls.vue:250–255`,
with an inline comment naming this as the fix for a PRIOR defect where
an ancestor's own `overflow-y: auto` clipped it) specifically to ESCAPE
ancestor scroll clipping, not to need one. `bounded`'s own definition
(small enumerable state space, not chart-like, doesn't scroll) matches
exactly. **This dispatch could not locate the review that found the
divergence claimed in the brief** (see the documentation-gap section
above) and, absent it, reports its own independent finding: the
CURRENT classification is correct as-is. If the missing review names a
DIFFERENT leaf or a different specific defect this investigation
didn't reproduce, that would need to be re-surfaced once the review
document itself is recovered.

**Regeneration.** `emit_layout_tree.py --registration landscape` /
`--registration portrait`, both exit 0. `git diff --stat` on both
`.gen.ts` files: 2 lines changed total (1 per file) — confirmed by
full `git diff` inspection to be EXACTLY the `tree` leaf's own node
literal (`scrollAxes: [] -> ["v"]`, `content: null -> "unbounded"`,
`edgeAxes: [] -> [{axis: "v", disposition: "item"}]`), no other line
touched, no `A_engine_controls` diff (consistent with "no change
made" above).

**Frontend follow-up explicitly NOT done**, per the brief's own
instruction: L2b's overlay criterion (the frontend-side logic that
currently can't return to its "spec's literal form" because `tree`'s
content was `null`) is untouched — this dispatch only restores the
LYT-side fact `tree`'s content class depends on; the frontend
consumer-side change is out of scope here.

---

## 5. Tests (scope item 5)

`tests/test_relations.py` gains 10 tests (all passing): the core
refusal shape (px literal refuses, naming file/site/literal — scope
item 5's own required minimum), the default-off byte-identical
behavior, the fr/inf-unaffected claim (isolated to a snippet with no
px/ch literal, since the original synthetic snippet's own px literal
would raise before reaching an fr/inf site), the child/descendant
propagation regression guard, `load_slot`'s own direct-call support,
and the directory-scoping mechanism against BOTH synthetic and REAL
on-disk files (an encodings/ file refuses, a fixtures/ file — proven
against the real `q5go.lyt`/`current_row_asis.lyt`, not only
synthetic stand-ins — does not).

`tests/test_emit_layout_tree.py`: `test_f1_port_leaf_fields_default_
empty_for_a_plain_leaf` retargeted from `tree` (no longer plain, per
this dispatch's own reclassification) to `I_board` (path `1.1`,
genuinely still plain — an individually-justified update, matching
this suite's own established "update, don't silently revert" pattern
C3's own report cites); a new
`test_tree_leaf_carries_its_own_content_and_scroll_and_edge_fields`
pins `tree`'s own new non-default values as a dedicated regression
rather than leaving the reclassification unverified by the suite.

**Suite.**

```
$ cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest tests/ -q
435 passed, 12060 warnings in 6.16s
$ echo $?
0
```

Pre-dispatch baseline (same venv, same command, HEAD at `c9a9f1aa`):
424 passed, exit 0 — net +11 (10 new C4 tests, +1 for the
`test_tree_leaf_carries_its_own_content_and_scroll_and_edge_fields`
addition; the `test_f1_port_leaf_fields_default_empty_for_a_plain_leaf`
retarget is a same-count update, not an addition).

**Roundtrip.**
`tests/test_emit_layout_tree.py::test_render_ts_roundtrip_matches_
committed_file` / `test_portrait_render_ts_roundtrip_matches_committed_
file` — both PASS post-regeneration (part of the 435-test run above),
byte-identical to the committed `.gen.ts` files.

**Full-tree solver sanity.** `runner.run_all()` against all five
registered encodings at all four `SCREEN_SIZES`: landscape/portrait's
own OPTIMAL/OPTIMAL/INFEASIBLE/OPTIMAL pattern unchanged from C3's own
disclosed baseline (the pre-existing 1280×1024 landscape INFEASIBLE
point is unrelated to this dispatch, present before any edit here) —
`content`/`scroll`/`edge` stay solver-inert (`compiler.py` never reads
them), confirmed directly rather than merely asserted, since the
`tree` reclassification touched exactly those three fields.

---

## Amendment — the RATCHET form (coordinator-directed, same dispatch)

**The correction.** The original flip above refused EVERY px/ch literal
under strict mode, unconditionally — coherent only if the two real
encodings had reached genuine zero. They have not (119 residual
literal-bound warnings, ~59 genuine px/ch sites with no facts coverage
this wave, per C3's own disclosed 77.5%-not-100% reduction). Wiring the
unconditional flip into any production loading path would therefore
refuse content ruling 2445 already ratified as an acceptable qualified
zero. The coordinator named this precisely and supplied the two review
documents (`lyt-relations-b-review.md`, `lyt-relations-c3-review.md`)
this report's own original text above could not locate — both now read
end to end; neither surfaces any finding beyond what §2/§3/§8 of C3's
own review already told this dispatch to fold into SPEC-AMENDMENTS.md's
Residual items (done, unaffected by this amendment) and independently
re-verify (done, unaffected).

### The manifest

`research/lyt/ratified-literals.json` (new file) — a commissioner-owned,
authored artifact, the SAME posture `facts.residue.json` already takes
(disclosed via its own `_comment` header: "AUTHORED, NOT auto-generated
... ADDING A SITE HERE REQUIRES FRESH COMMISSIONER RATIFICATION"). 47
entries, one per `(file, site_id, construct, unit)` key, covering every
px/ch site `research/lyt/tools/dump_ratifiable_sites.py` (new file) —
this dispatch's own enumeration tool, reading the SAME warning-mode
load every WITNESSED count in this report already used — found across
both real encodings. Each entry's own `"basis"` field cites C3's own
report §7 (or, for a new R5-class site, the SPEC-AMENDMENTS.md Residual
item this dispatch's own earlier section already filed) — no entry was
invented; every one traces to an already-disclosed absence.

**Keying — the commissioner's own explicit instruction, implemented
without a file:line or an ordinal position anywhere:**

- **A leaf**: its own `widget` id (`boardRail`, `tree`, `timelineStrip`,
  …) — the same stable identity every other part of this substrate
  already keys on.
- **A tagged Exclusive** (`T(...)[TAG]`): `f"tag:{TAG}"` — reuses the
  author-declared annotation the encodings already carry
  (`tag:ANALYSIS TABS`), rather than inventing a parallel identity
  scheme for the one node kind that already has one.
- **Anything else** (an untagged Split or untagged Exclusive — most of
  the genuinely anonymous groups: the side column, the engine-controls
  row, the settings/analysis/other wrapper groups, the three ANALYSIS
  TABS columns, the root split itself): a CONTENT-DERIVED signature
  (`loader._raw_content_signature` — `"{H|V|T}[" + sorted child
  signatures + "]"`, recursive, a leaf's own signature being just its
  widget id) hashed to a short handle (`anon-<10 hex chars>`), with the
  full human-readable signature stored alongside in the manifest entry
  (`content_signature`) for a commissioner's own audit. SORTED is the
  load-bearing choice: reordering siblings — an ordinal, positional fact
  — never changes the signature, since the string encodes WHICH children
  exist and what they themselves contain, never WHERE. Two genuinely
  identical subtrees legitimately collide (the same ratification
  correctly applies to both, not a bug); any real difference in
  composition changes the hash, correctly demanding fresh ratification.
  Pinned by five dedicated tests (`test_site_id_for_*` in
  `tests/test_relations.py`), including one that inserts twenty blank
  lines before an identical fragment and confirms the derived id is
  byte-identical, and one that reorders two siblings and confirms the
  same.

`construct` distinguishes WHICH sizing-bag position a literal occupies
at the SAME site — `min`/`pref`/`max` (three different keys even at one
widget — ratifying `min` never silently ratifies `pref`), `fixed`
(covers BOTH the bare `{Npx}` shorthand and the `pinned <extent>`
keyword spelling, since they mean the same thing), `envelope-state:
<name>`, and — for a compound relation's own operands, which have no
per-item name in the grammar to key on — `sum-of-operand`/`max-over-
operand`/`pack-rows-item`/`pack-rows-search-ceiling`, each carrying a
VALUE SET rather than a single value (`ratified_values: [...]`), so six
`pack-rows` items (two sharing the same 153px width) collapse into one
manifest entry whose membership check is inherently order-independent —
never an item INDEX, which would be exactly the ordinal anti-pattern
being avoided.

### The mechanism

`RelationContext` gains `ratified` (a `relations.RatifiedManifest`,
lazily loaded once per process via `loader._get_ratified_manifest`,
mirroring `_get_facts_table`'s own posture), `current_site_id`, and
`current_construct`. `load_slot` computes each node's own site id ONCE
(`_site_id_for_node`) and threads it (via `dataclasses.replace`, no
signature changes needed on `_resolve_extent_like`/`resolve_operand_to_
px` themselves) into every construct-specific resolve call — `_load_
sizing`'s min/pref/max/fixed branches, `_resolve_envelope_state_
extents`, and `relations.py`'s three operand-resolving functions (each
tagging its own construct via a local `dataclasses.replace` before
calling `resolve_operand_to_px`). `_resolve_extent_like`'s own strict-
mode branch now checks `ctx.ratified.is_ratified(file=ctx.source_file,
site_id=ctx.current_site_id, construct=ctx.current_construct,
unit=e.unit, value=e.v)` before refusing — a match loads silently (no
warning either, since a ratified literal is sanctioned, not merely
deprecated); no match refuses with `detail["prohibition"] ==
"unratified-literal-in-governed-encoding"`, naming `site_id`/
`construct`/`unit`/`v`/`source_file`/the manifest's own path, and the
raised message spells out the exact JSON object a commissioner would
add to ratify it.

### Wired into every production loading path

`runner.load_governed_layouts` (built in the original flip pass,
UNUSED there) is now the entry point `run_all`, `emit_ts.py`,
`emit_mockup.py`, `coverage_matrix.py`, and `emit_layout_tree.py` (both
its per-registration loop and its direct `ENCODINGS_DIR`-reading
`build_program`) all route through — each computes `is_governed_
encoding(path)`/`runner.source_file_label(path)` from its own already-
resolved path (never hand-picked) and threads them into `loader.
load_layouts`. `orientation.rebind` (which re-loads the SAME source
text a second time, for the L14 role-frame re-binding — see its own
docstring) gained matching `refuse_literal_bounds`/`source_file`
parameters so its second load stays exactly as strict as the first;
`runner.run_all` now tracks `layout_governed`/`layout_source_label`
alongside its pre-existing `layout_text`, for exactly this purpose.

**Verified, not merely wired.** `runner.load_governed_layouts` against
both real files now returns cleanly (`WITNESSED`, direct call, both
classes). `tools/count_deprecations.py` (fixed in the same amendment —
its own strict-mode probe originally passed an ABSOLUTE path as `source_
file`, which never matches the manifest's own relative-label keys and
so refused everything; corrected to the same relative label `runner.
source_file_label` computes) now reports, for both real encodings,
`outcome == "completed"` under strict mode, with exactly 30 residual
WARNINGS each — the `fr`/`inf` structural count, unchanged from before
the ratchet, never manifest-checked, exactly as designed. `runner.
run_all()`'s own full five-registration, four-screen-size sweep: exit
code and OPTIMAL/INFEASIBLE pattern byte-for-byte unchanged from the
pre-ratchet baseline (the pre-existing 1280×1024 landscape / 420×880
portrait INFEASIBLE points are untouched, unrelated). `emit_ts.py`/
`coverage_matrix.py`/`emit_layout_tree.py` (both registrations) all
exit 0; regenerating both `.gen.ts` files under the new wiring produces
a BYTE-IDENTICAL diff to the already-committed files (`git status
--short frontend/src/state/` empty after regeneration) — the ratchet is
purely a load-time gating change, provably zero effect on emitted
geometry/output. (`emit_mockup.py`'s own HTML output was ALSO
regenerated during this verification and discarded, not committed — one
solved coordinate differed by a tie-break-sized amount from the
currently-committed mockup, present already on a completely clean
re-run with no ratchet code involved at all — i.e. pre-existing CP-SAT
tie-breaking sensitivity in that one generator, unrelated to this
dispatch, out of scope to chase down here, and not shipped as a
surprise diff.)

### Tests

`tests/test_relations.py` gains: the refusal shape against an empty
synthetic manifest (naming site/construct/unit/manifest path); the
positive ratified-load-succeeds-silently case; a same-widget-different-
construct-still-refuses / same-construct-different-value-still-refuses
pair (proving the key is genuinely 4-tuple + value-membership, not a
per-widget blanket allowance); fr/inf-still-unaffected (unchanged
claim, re-verified against an empty manifest so it cannot be
accidentally passing via manifest coverage); the child/descendant
propagation guard (now also asserting `site_id`/`construct` on the
refusal, not just that it fires); `load_slot`'s own direct-call
support; five site-id-derivation tests (leaf, tagged Exclusive, sibling-
reorder stability, genuine-membership-change reactivity, unrelated-
line-insertion stability); and the two production-facing cases
(`load_governed_layouts` succeeds on the real landscape encoding using
the REAL facts table — this module's own `autouse` fixture installs a
synthetic one that lacks the real encoding's own relation targets, load
-bearing once literal refusals stop masking that gap — and refuses a
synthetic unratified site addressed at the real encodings/ namespace).
`test_load_governed_layouts_refuses_on_a_real_encodings_file` (the
original flip's own pinned expectation that the real files refuse) was
RENAMED and its assertion INVERTED to `..._succeeds_...`, since that is
now the correct, ratchet-covered behavior — not silently deleted, the
git history carries the before/after.

**Gates, re-run after the amendment:**

```
$ cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest tests/ -q
443 passed, 8799 warnings in 6.57s
$ echo $?
0
```

443 (up from the original flip's own 435: +11 new C4-ratchet tests, +1
for the renamed real-encodings test counted as a rename not an add — 10
new `_prohibition`/`_site_id`/`_construct` tests plus the 2 real-file
tests replacing the original flip's own 2, net +11 matches the delta
directly). Warning count dropped from the original flip's own 12060 to
8799 — consistent with strict mode now eliminating every ratified
px/ch site's own warning across every production caller this amendment
wired in, leaving only the fr/inf structural residue.

**Roundtrip**: both `.gen.ts` tests still pass (part of the 443 above);
both files confirmed byte-identical to committed after a fresh
regeneration under the new wiring (`git status --short` empty).

**Scope discipline check.** Touched, this amendment only: `relations.py`
(manifest classes + `RelationContext` fields), `loader.py` (site-id/
signature helpers, construct tagging, the manifest-checked refusal
branch), `runner.py` (`source_file_label`, `load_governed_layouts`'s own
docstring + the production wiring in `run_all`), `orientation.py`
(`rebind`'s two new parameters), `emit_ts.py`/`emit_mockup.py`/
`coverage_matrix.py`/`emit_layout_tree.py`/`bench_solve.py` (the same
three-line wiring pattern at each existing load call site — no other
line touched in any of the five), `tests/test_relations.py`, and two
new files under `research/lyt/`: `ratified-literals.json` (the
manifest) and `tools/dump_ratifiable_sites.py` (the enumeration tool);
`tools/count_deprecations.py`'s own pre-existing absolute-path bug,
fixed in the same pass since this amendment's own verification pass is
what surfaced it. No `.lyt` encoding text changed in this amendment (the
tree/A_engine_controls riders from the original flip pass are
untouched); no `.gen.ts` file changed (confirmed byte-identical, above).
`research/lyt/mockups/*.html` were regenerated during verification,
found to differ by a pre-existing, unrelated CP-SAT tie-break, and
reverted rather than committed — named here rather than silently
discarded.

---

## Claims summary

- Base freshness check: WITNESSED (hard reset performed safely, both
  fixture claims confirmed).
- `lyt-relations-b-review.md` / `lyt-relations-c3-review.md`: neither
  present in this worktree — UNEXERCISED, disclosed explicitly, not
  bluffed past; substance recovered where possible from inline
  corrections (`relations.py`/`loader.py`) and C3's own build report.
- Reading list (errors.py full, loader.py's relevant sites, SPEC.md
  §4/§13/§18 full, SPEC-AMENDMENTS.md full pre-dispatch,
  lyt-relations-c3-rewrite.md full, test_relations.py full
  pre-dispatch): WITNESSED.
- Flip mechanism (px/ch-scoped, fr/inf-unaffected, directory-scoped
  via `is_governed_encoding`/`load_governed_layouts`, carried forward
  through Split/Exclusive child contexts): WITNESSED, 10 passing
  tests, including against REAL on-disk encodings/fixtures files.
- Flip NOT wired into any production default loading path: disclosed
  decision (STOP-and-report), not a silent omission — reason and
  evidence (119 residual literals, ~59 genuinely unreachable per C3's
  own disclosure) given in full above.
- C3 review condition 2 (R3/R4/R5 folded into Residual items):
  WITNESSED, documentary, no doc-graph regeneration owed (verified
  against `tools/doc-graph/generate.mjs`'s own `SCAN_DIRS` directly).
- C3 review condition 3 (contamination-free per-file count):
  WITNESSED, `tools/count_deprecations.py`, real numbers reported
  (61/58/9/9/109/102), matching C3's own encodings figure exactly on
  independent re-measurement.
- `tree` reclassification: WITNESSED against `TreeWidget.vue` source
  directly (file:line citations above), `.gen.ts` diff exactly the
  reclassification (2 lines total).
- `A_engine_controls`: independently checked, CONFIRMED bounded, no
  change — the brief's own "reviewer-found latent divergence" could
  not be corroborated (review document missing); reported as a
  disclosed gap, not silently resolved either way.
- Suite: WITNESSED, 435 passed, exit 0.
- Roundtrip: WITNESSED, both `.gen.ts` tests pass.
- Full-tree solver sanity: WITNESSED, pattern unchanged from C3's own
  baseline.
- Scope discipline: touched only `research/lyt/` plus the two
  `.gen.ts` files under `frontend/src/state/` (the standard LYT
  emitter output this dispatch's own scope item 4 explicitly calls
  for regenerating) — confirmed via `git status --short` before
  writing this report.

---

## Discharge — review `lyt-relations-c4-review.md` (verdict: ACCEPT-WITH-CONDITIONS)

The review (copied into this worktree at
`.claude/dispatch-reports/lyt-relations-c4-review.md`, read end to end)
independently re-verified every mechanism claim in this report (§§1–2,
§§4–6: fail-noisy sweep across every production path, manifest key
stability under sibling-reorder and unrelated-line-insertion, the tree/
`A_engine_controls` reclassification, R3/R4/R5, the count tool's
contamination-avoidance, the full gate suite) — no divergence found.
Two conditions required discharge before merge; both are done, in this
same worktree, on top of the reviewed commit.

### Condition 1 — the `anon-b8a05bfafa` basis-accuracy defect

The reviewer proved, empirically (not merely by grammar reading): the
settings-tabs T-wrapper's own `min 200px` (both encodings) was ratified
under the basis "R5 gap (no descendant-reference primitive)" — false
for this specific site, since the T-wrapper's six `SP_*` children are
its own IMMEDIATE children, exactly what `max-over(children.min)` is
built to reach (the same mechanism the outer `BLACK BOX` T's own pin
already uses). The reviewer's own edit-reload-regenerate-diff-revert
cycle showed the conversion is byte-identical.

**Applied, independently re-verified, not merely trusted from the
review:**

1. Both encodings' settings-tabs `T(...)` own sizing changed from
   `{min 200px, ...}` to `{min max-over(children.min), ...}` — a
   two-line edit (`encodings/lengyue_landscape.lyt`,
   `encodings/lengyue_portrait.lyt`).
2. `runner.load_governed_layouts` on both files: loads cleanly (the
   site is no longer even a literal, so the manifest is never
   consulted for it) — WITNESSED, direct call.
3. Both `.gen.ts` files regenerated (`emit_layout_tree.py --registration
   landscape`/`portrait`) and diffed against the pre-edit committed
   copies: `git status --short frontend/src/state/` — EMPTY, both
   directions — WITNESSED, byte-identical, independently reproducing
   the reviewer's own finding rather than accepting it on their word.
4. Both `anon-b8a05bfafa` manifest entries (landscape, portrait) —
   REMOVED from `ratified-literals.json`, not merely re-labeled: a
   manifest entry whose own basis is false is an unratified mint (row
   843), and the site is no longer a literal for the manifest to cover
   at all.
5. The milder, related finding (§3's second paragraph: the
   `tag:ANALYSIS TABS` entries' own basis text conflates "we chose not
   to change the value" with "no primitive reaches this") — corrected
   IN PLACE (both files' own `"basis"` field now states the real
   reason: `max-over(children.min)` is reachable but would move the
   resolved value 160/200 → 580 (`AT_multires`' own height cascading
   up, the same both-664s mechanism R3 documents), a disclosed
   model-VALUE deferral, not a primitive-availability gap. The literal
   stays; only the manifest's own PROSE was inaccurate, and only the
   prose changed.
6. Manifest count: 47 → 45 entries. `tools/dump_ratifiable_sites.py`
   re-run fresh: 45 sites live in the two real encodings today, an
   EXACT match (not merely "close") against the 45 manifest entries —
   WITNESSED, programmatic, not spot-checked.
7. `tools/count_deprecations.py` re-run: warning-mode count 61→60
   (landscape), 58→57 (portrait) — exactly one fewer literal per file,
   matching the one site retired; strict-mode still reports `30
   completed` for both (the residual `fr`/`inf` count, untouched by
   this change, exactly as designed).

**Not addressed in this discharge** (the review's own conditions 2 and
3, not named in the coordinator's own two-item discharge request):
a systematic sweep of the other ~10 "R5-class" anonymous-group entries
for the same over-conservative pattern (the reviewer explicitly did not
exhaustively re-derive convertibility for all 47 — now 45 — entries,
and neither did this discharge pass); and filing `TreeWidget.vue`'s own
`CELL = 24` constant (line 119, a genuine constant row pitch the
component's rendering math already uses) as a residual item. Both
remain open, named here rather than silently dropped, for a future
pass — the coordinator's own message asked specifically for conditions
1 and the rebase (below), not the full condition list.

### Condition 4 (coordinator's "2.") — rebase onto `lyt-phase2`'s current tip

The reviewer's own base-freshness finding: this worktree's merge-base
against LOCAL `lyt-phase2` was `c9a9f1aa`, five commits behind
`lyt-phase2`'s actual current tip (`e9dcc998`, the L3 space-owner cure)
— confirmed independently before rebasing
(`git log --oneline HEAD..lyt-phase2` listed exactly those five
commits, matching the review's own enumeration). The reviewer's own
`git diff --stat` check (the five commits touch `frontend/`'s
`layout-model.ts`/`feasible-layout.ts`/`useResizablePanel.ts`/
`useSideColumnLiveLayout.ts`/`App.vue`, none of it overlapping either
`.gen.ts` file this dispatch regenerates or anything under
`research/lyt/`) predicted a clean rebase.

**Performed:** working tree confirmed clean (only `__pycache__`/
`.claude/logs` untracked) before rebasing; `git rebase lyt-phase2` —
**zero conflicts**, matching the reviewer's own prediction exactly.
`git merge-base --is-ancestor lyt-phase2 HEAD` now returns true. New
tip: see the summary below.

**Re-verified post-rebase, not assumed clean because the rebase itself
was clean:**

```
$ cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest tests/ -q
443 passed, 8771 warnings in 6.53s
$ echo $?
0
```

Both `.gen.ts` roundtrip tests pass (part of the 443 above); both files
regenerated fresh post-rebase and diffed against the committed
copies — `git status --short frontend/src/state/` empty, both
directions. `runner.run_all()`'s own full sweep: exit code and
OPTIMAL/INFEASIBLE pattern unchanged from every prior run in this
dispatch's own history (the pre-existing INFEASIBLE points are
untouched, unrelated to anything this dispatch or its discharge
touched).

### Claims summary (discharge pass)

- Condition 1 (manifest basis-accuracy defect): WITNESSED — conversion
  applied, byte-identity independently re-verified (not trusted from
  the review), manifest entries removed, count and report updated.
- The related `tag:ANALYSIS TABS` basis-prose imprecision: corrected
  in place, disclosed as a discretionary addition beyond the literal
  two-item ask.
- Review conditions 2/3 (the broader sweep; the `CELL=24` residual
  item): NOT addressed — explicitly out of the coordinator's own
  two-item discharge request, named here as still open rather than
  silently dropped.
- Rebase onto `lyt-phase2`'s current tip: WITNESSED, zero conflicts,
  matching the reviewer's own clean-rebase prediction.
- Suite post-rebase: WITNESSED, 443 passed, exit 0.
- Roundtrip post-rebase: WITNESSED, both `.gen.ts` files byte-identical
  after fresh regeneration.
- Solver sanity post-rebase: WITNESSED, pattern unchanged.
