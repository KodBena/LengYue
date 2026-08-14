# LYT relations-first amendment — dispatch C4: the closing step (refusal flip, C3 review conditions, lyt-side riders)

Ledger rows governing this dispatch: 2396/2397/2400/2419/2425/2436/2445.
New rows written by this dispatch: 2462–2474 (ledger-policy source-file
change entries, per-file, plus this report's own entry).

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
