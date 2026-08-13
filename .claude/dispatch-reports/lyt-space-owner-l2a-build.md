# L2a build report — blackbox/Exclusive-child overflow fields

**Status.** Built and committed in the dispatched worktree. Ledger rows
2447/2450 (commission), 2451–2455 (this build's own file-touch entries).
Commit `d76a7c228ade2b2c0f9a9276b334a690464db451` on branch
`worktree-agent-adfdc0375e7c9eb63-lyt-phase2`.

## Base verification (WITNESSED)

The worktree's checkout was stale at session start (636 commits behind
local `lyt-phase2`). Reset to `lyt-phase2`'s own tip commit
(`88da0e8cf14043ea4908c69a3a47db7f5fd8d906`, "merge: space-owner L1")
before any substantive work — `frontend/src/state/feasible-layout.ts`
confirmed present after the reset (L1 landed), and
`.claude/dispatch-reports/lyt-space-owner-spec.md` confirmed present and
read in full.

## What was read (per the dispatch's own reading list)

End to end: `lyt-space-owner-spec.md` (993 lines); `research/lyt/SPEC.md`
(1819 lines, all 17 sections + the "Status of the other LYT documents"
close); `research/lyt/lyt_ast.py` (886 lines, pre-edit); `parser.py`
(1062 lines, full read — the dispatch named "sizing-bag handling," which
in this file is effectively the whole module); `loader.py`'s
content/scrollAxes handling (`_load_content_class`, `_load_scroll_axes`,
`load_slot`'s three branches, targeted reads across the 2900-line file);
`emit_layout_tree.py` in full (1369 lines, both halves); both encodings
in full; `frontend/src/state/lyt-layout-types.ts` in full (287 lines).

**Partially read, disclosed.** `wellformed.py` (1749 lines) was NOT in
the dispatch's reading list and was not read end to end — five targeted
sections were read (the `node.content`/`slot.content` read sites at
`_subtree_has_designed_leaf`, `find_l5_violations`, `find_l13_violations`,
`find_l16_violations`, `find_l17_violations`) to verify the AMENDMENT 10
rename (`node.content` → `slot.content`) is a safe, semantics-preserving
mechanical change — each site already carries `slot` in scope and the
`isinstance(node, ast.Leaf)` gate is unchanged. `presence.py` (not in the
reading list either) was read narrowly around `prune_absent`'s two
reconstruction sites, after discovering (not assumed) that the
AMENDMENT-10 `Slot.content` field needed the same forwarding fix
AMENDMENT 5 already applied there for `scroll_axes` — see "Defect found
and fixed" below.

## Design decision: `content` relocates from `Leaf` to `Slot` (AMENDMENT 10)

The spec's scope item 1 asks that `content`/`scroll` become legal on
T(...) blackbox nodes and on Exclusive children. `scroll` already lived
on `Slot` (Amendment 5) and needed no change. `content` lived on `Leaf`
only. Two designs were considered:

1. **Migrate `content` to `Slot`**, mirroring `scroll_axes`'s own
   precedent exactly — one storage location, works everywhere `scroll`
   already does, `loader._load_content_class` widened with a single new
   `is_exclusive_child` parameter.
2. **Add a second, separate field** for the two new positions, leaving
   `Leaf.content` untouched — avoids touching `wellformed.py` at all, at
   the cost of two storage locations for one fact.

Design 1 was chosen after confirming (by direct read) that all five of
`wellformed.py`'s `Leaf.content` read sites already have `slot` in local
scope, making the rename mechanical and low-risk, and because it avoids
the representation fork design 2 would introduce. `wellformed.py`'s own
checks (L5/L5a/L5c) are unchanged in *what* they check — still gated on
`isinstance(node, ast.Leaf)` — only *where* they read the value from.

## Directive coverage (numeric)

1. **GRAMMAR/AST/LOADER.** `content` legal positions: 1 → 3 (leaf,
   Exclusive's own wrapping slot, direct Exclusive-child of any node
   kind). 1 new `load_slot` parameter (`is_exclusive_child`, threaded at
   exactly 1 recursive call site — the Exclusive branch's own children
   loop — never inherited further). 0 grammar/parser changes needed
   (`parser.py` was already permissive for `content` on any node kind;
   confirmed by reading `parse_sizing`). `scroll` needed 0 changes
   (already Slot-level, already legal everywhere).
2. **EMITTER.** 2 new fields (`content`, `scrollAxes`) added to
   `LytBlackboxNode` and `LytExclusiveChild` in `lyt-layout-types.ts`.
   4 blackbox construction sites in `_build_node`'s Exclusive branch
   updated (both `_within_opened_tab` cases, the top-level case, the
   per-tab-collapse-index case) + 1 `LytExclusiveChild`-emitting site
   (the `ex_children.append` loop) = 5 emission sites updated, all
   reading the fields off the SAME already-loaded `Slot`
   (`slot.content`/`sorted(slot.scroll_axes)` or
   `child.content`/`sorted(child.scroll_axes)`), zero new derivation
   logic. 2 TS-rendering functions updated (`_ts_node`'s "blackbox" and
   "exclusive" branches) + 1 new shared helper (`_ts_content`, mirroring
   the existing `_ts_demote` precedent).
3. **ENCODINGS.** 3 declaration sites per encoding × 2 encodings = 6
   total edits: settingsPane's own inner T (`content unbounded`),
   CP-analysis's own composite wrapper (`content designed`), CP-other's
   own composite wrapper (`content unbounded`). 0 `scroll` declarations
   added — verified directly (not assumed) that adding `scroll v` at any
   of the 3 sites trips L5b (single-scroll-owner-per-path), since the
   leaves that need scroll already own it on themselves. 0 numbers
   invented outside content-class/axis vocabulary — every declaration is
   `content <bounded|designed|unbounded>`, nothing else.
4. **TESTS.** Baseline 421 passing → 424 passing after this build (exit
   code 0, `pytest tests/ -q`). Net +3: 2 existing tests updated in
   place (mechanical `node.content` → `slot.content`/`.node.content` →
   `.content` renames, in `test_loop_laws.py` and 2 sites in
   `test_lyt.py`); 1 parametrized refusal test (`split`/`exclusive`)
   split into 5 new tests — 2 refusal-shape (ordinary Split; a Split two
   levels inside a T, confirming `is_exclusive_child` is never
   inherited past the immediate child), 2 acceptance-shape (content on
   an Exclusive's own slot; content on a Split standing as a direct
   T-child), 1 `prune_absent`-forwarding regression pinning the defect
   found and fixed (below). Both `.gen.ts` files regenerated; diff
   against the pre-change committed files contains ONLY the new
   `content`/`scrollAxes` fields (verified by `git diff`, no other
   hunk) — WITNESSED for both `lyt-layout.gen.ts` and
   `lyt-layout-portrait.gen.ts`.
5. **Shadow files.** `lyt-solved-layout*.gen.ts` (3 files) — confirmed
   untouched (`git status` shows no diff against them after the full
   build). No frontend runtime code touched — confirmed by `git status`
   showing exactly the 12 files listed below, all within
   `research/lyt/` or the three permitted generated/hand-written
   frontend type files.

## Defect found and fixed (disclosed, not silently absorbed)

While migrating `content` to `Slot`, a genuine, PRE-EXISTING-CLASS defect
was found in `presence.py`'s `prune_absent`: its two `ast.Slot(...)`
reconstruction sites (Split and Exclusive branches) do not forward every
field of the original slot — `scroll_axes` was fixed once already (the
module's own documented "AMENDMENT 5 fix"), but the newly-Slot-level
`content` field would have silently vanished the same way for any
Split/Exclusive standing as a T-child, the instant its own subtree was
reconstructed by a prune. Fixed by forwarding `content=slot.content` at
both sites, mirroring the AMENDMENT 5 fix precedent exactly, and pinned
by `test_prune_absent_preserves_content_on_reconstructed_composites`
(WITNESSED — exercises both reconstruction sites, both `content` values
survive the prune). A THIRD, still-open instance of the same defect class
was found and disclosed but NOT fixed: `wrap_policy` (AMENDMENT 7) is
also dropped by both reconstruction sites, and was out of this
dispatch's scope to touch — named in `presence.py`'s own module
docstring so it is not silently rediscovered later.

## Scope narrowings and STOP-and-report items

None required a STOP. One judgment call is disclosed above (the
`Slot.content` migration vs. a second field) and was resolved in favor of
the design that avoided a representation fork, per the dispatch's own
STOP-on-fork instruction — this was a genuine design choice, not treated
as itself requiring a STOP, since it is a storage-location decision over
the SAME closed vocabulary (`bounded`/`designed`/`unbounded`), not a new
vocabulary.

The `CP-settings` composite's own OUTER wrapper (the `V` at index 2 of
the outer control-panel T, wrapping `settingsSubstrip` + the inner T) was
deliberately NOT given its own `content` declaration — the dispatch names
"the Settings interior (six-tab blackbox)" specifically, which is the
INNER six-tab T (now declared), not the outer composite; declaring
something on the outer wrapper too would have been an invented fact
beyond what was named, so it was left alone.

## Environment note (disclosed, not a scope item)

The worktree's git-hook layer includes a ledger-write gate on `Edit`
tool calls against tracked source files, requiring a preceding
`./autoharn led -f <file> decision "..."` entry per file before its
first edit in this session. The worktree itself carries no `autoharn`
binary (untracked, main-checkout-only); the gate was satisfied by
invoking the main checkout's own script by absolute path
(`/home/bork/w/omega/autoharn led ...`) before each first-touch edit.
Ledger rows 2451–2455 record this build's file touches (test_lyt.py,
both `.lyt` encodings, `emit_layout_tree.py`'s docstring addition, and
this report).

## Claims summary

- WITNESSED: 424/424 tests pass, exit code 0, both `.gen.ts` diffs
  additive-only, the L5b-refusal claim (verified by direct reload with a
  synthetic `scroll v` insertion), the `prune_absent` forwarding defect
  and its fix (regression test passes, and failed before the fix was
  applied — confirmed by running the suite before/after the
  `presence.py` edit).
- UNEXERCISED: no claim in this report rests on unverified assumption;
  every numeric and behavioral claim above was checked against running
  code in this session, not inferred from documentation alone.

## Files touched (original build)

```
frontend/src/state/lyt-layout-portrait.gen.ts
frontend/src/state/lyt-layout-types.ts
frontend/src/state/lyt-layout.gen.ts
research/lyt/emit_layout_tree.py
research/lyt/encodings/lengyue_landscape.lyt
research/lyt/encodings/lengyue_portrait.lyt
research/lyt/loader.py
research/lyt/lyt_ast.py
research/lyt/presence.py
research/lyt/tests/test_loop_laws.py
research/lyt/tests/test_lyt.py
research/lyt/wellformed.py
```

## Conditions-discharge (2026-08-14)

The review (`.claude/dispatch-reports/lyt-space-owner-l2a-review.md`,
copied into this worktree from the coordinator's own artifact) verdict
was **ACCEPT-WITH-CONDITIONS**. Both conditions are discharged in this
same worktree, on top of the original build's own commit.

### Condition 1 — Amendment 10 record

`research/lyt/SPEC-AMENDMENTS.md` gains a proper Amendment 10 entry
(ledger rows 2447/2450), matching Amendments 1–9's own established
form: Ruling, What this amendment implements (five items — the `Slot`
relocation, the three legal positions, the L5/L5a/L5c dormancy
preservation, emitter preservation, the `presence.py` forwarding fix),
Encodings (including the CP-analysis DOM-truth correction, see
Condition 2), Dormancy and verification, Diff vs. the consult document,
Seam choice, and What it touched.

`research/lyt/SPEC.md` gets three corrections plus one new section,
following the file's own established "correct with a bracketed note,
never silently rewrite" convention:

- The opening paragraph's amendment count: nine → ten (line ~24), with
  a dated correction note in the same style as the pre-existing
  2026-08-12 correction immediately below it (both preserved).
- The grammar summary's `content <class>` bullet (was line ~172–176,
  "a LEAF-only content-class declaration"): corrected inline, pointing
  at the new §18.
- §13.1's `content <class>` grammar entry and §13.2's "a leaf's
  content" framing (was lines ~1145–1148, ~1167–1173): the
  Amendment-5-era text is struck through / annotated in place (kept
  verbatim per the file's own "supersede, do not delete" convention)
  rather than deleted, with a correction note pointing at §18.
- **New §18** ("Amendment 10 — `content` relocates to `Slot`, legal
  beyond leaves"), matching the scale and form of §14 (the shortest of
  the four prior Amendment sections, 6/7/8/9): the relocation, the
  three legal positions, the L5/L5a/L5c dormancy statement, emitter
  preservation, and a dedicated §18.5 naming the CP-analysis
  law-expressiveness limit (Condition 2) as a residual, not routed
  around.
- The "Status of the other LYT documents" close's own "nine
  ledger-adjudicated rulings" phrase (line ~1917): corrected to "ten,"
  same dated-note convention.

**Doc-graph.** `tools/doc-graph/generate.mjs`'s own `SCAN_DIRS =
["docs"]` (read directly, not assumed) — `research/lyt/SPEC.md` and
`SPEC-AMENDMENTS.md` are outside the doc-graph's scanned tree entirely,
confirmed by `grep -c "research/lyt" docs/doc-graph.json` returning 0.
The gate does not apply to this edit; `git status --short` on the three
doc-graph artifact files shows no diff, confirming no regeneration was
triggered or needed. Graphviz (`dot`) was available in this environment
regardless, so this is a genuine "out of scope" finding, not a
STOP-for-missing-tooling.

### Condition 2 — CP-analysis DOM-truth re-verification

Traced the real mount site directly: `frontend/src/App.vue`'s
control-panel Analysis tab slot mounts `AnalysisControls.vue`, which at
`frontend/src/components/editors/AnalysisControls.vue:385` embeds
`<AnalysisDashboard :key="boardId" :boardId="boardId" />`.
`frontend/src/components/charts/AnalysisDashboard.vue`'s own `<style
scoped>` block declares, at lines 169–173:

```css
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-medium);
}
```

— applied to the div wrapping each tab's rendered chart panels (lines
117 and 127 of the same file). The real mounted DOM for this control-
panel tab genuinely scrolls its content vertically. The pre-condition
declaration (`content designed` on the CP-analysis composite wrapper,
`encodings/lengyue_landscape.lyt`/`lengyue_portrait.lyt`) asserted the
opposite (L5c: "chart-carrying containers may never scroll... never a
scrollbar") — WRONG, confirmed against the component source, not
merely re-asserted.

**Reconciling with the L5b/L5c refusal behavior cited in the original
build.** Two candidate honest corrections were checked directly against
the loader, not assumed:

1. `content unbounded` + `scroll v` on the wrapper — reproduces an
   `L5c` chart-exclusion refusal (verified: hand-inserting this exact
   pair at the wrapper and reloading raises `LytLoadError` naming this
   precise path, `law: "L5c"`), because the wrapper's own subtree still
   contains individually-`designed` chart leaves
   (`AT_basic_interval`/etc., pre-existing, individually accurate,
   deliberately not re-classified — re-deriving eight leaves' own
   content nature to make a wrapper-level `scroll v` legal is a
   materially larger re-modeling of the whole analysis sub-tree, out of
   this condition's own scope).
2. `content unbounded`, no scroll — loads cleanly (verified), withdraws
   the false "never scrolls" claim, and does not assert a scroll
   ownership the law cannot admit given the still-`designed` siblings.

This is the genuine law-expressiveness limit the coordinator's own
framing anticipated: the law CAN express "not a hard, never-scrolling
reservation" (option 2) but CANNOT ALSO express "and it owns a scroll"
without first re-deriving the leaf classifications underneath it. Per
the coordinator's own instruction ("if the honest fact is that this
interior scrolls vertically, the declaration must say so in whatever
shape the law admits"), option 2 was applied — not a STOP, since the
law DOES admit a strictly more honest value than the wrongly-asserted
one, even though it cannot admit the fully complete one. The residual
gap (no encoding-level fact captures "and this collapsed group's own
realization scrolls") is named as a residual in SPEC-AMENDMENTS.md's
Amendment 10 entry and SPEC.md's new §18.5, not silently absorbed.

**Encoding correction applied.** Both `encodings/lengyue_landscape.lyt`
and `encodings/lengyue_portrait.lyt`'s CP-analysis composite wrapper:
`content designed` → `content unbounded` (no scroll added). Verified:
both encodings load cleanly after the change (no waivers); both
`.gen.ts` files regenerated (`python emit_layout_tree.py --registration
{landscape,portrait}`) and diffed against the pre-correction committed
files — the diff is EXACTLY the two corrected `content` values (one
field, two occurrences — the `LytExclusiveChild`-level field and the
`LytBlackboxNode`-level field for the same node — per file), confirmed
by `git diff`, no other hunk.

### Gates re-run after both conditions

- `research/lyt` suite: `pytest tests/ -q` → **424 passed, exit 0**
  (unchanged from the original build — neither condition altered test
  count, only two encoding values and two documentation files).
- `frontend`: `NODE_OPTIONS=--max-old-space-size=4096 nice -19 npx
  vue-tsc -b` → **clean, exit 0.** (`lyt-layout-types.ts` was already
  unchanged by this discharge — only the two `.gen.ts` files'
  `content` values changed, which are data, not types — so this result
  was expected, not merely hoped for, and was still run directly per
  the coordinator's instruction rather than assumed from the original
  build's own green typecheck.)

### Files touched (conditions-discharge, additional to the original build)

```
research/lyt/SPEC-AMENDMENTS.md
research/lyt/SPEC.md
research/lyt/encodings/lengyue_landscape.lyt   (CP-analysis wrapper correction)
research/lyt/encodings/lengyue_portrait.lyt    (CP-analysis wrapper correction)
frontend/src/state/lyt-layout.gen.ts           (regenerated, corrected value)
frontend/src/state/lyt-layout-portrait.gen.ts  (regenerated, corrected value)
```

### Claims summary (conditions-discharge)

- WITNESSED: `AnalysisDashboard.vue:169-173`'s `overflow-y: auto`
  (read directly); `AnalysisControls.vue:385`'s mount site (read
  directly); the L5c refusal on the rejected `scroll v` candidate
  (reproduced directly); the L5c acceptance of the corrected `content
  unbounded`-no-scroll value (both encodings load clean, verified);
  both `.gen.ts` diffs are exactly the two corrected values (`git
  diff`); doc-graph out-of-scope finding (`SCAN_DIRS` read directly,
  `grep` count and `git status` both confirm no diff); 424/424 tests,
  exit 0; `vue-tsc -b` clean, exit 0.
- UNEXERCISED: none — every claim in this section was checked against
  running code or read source in this session.

## License

Public Domain (The Unlicense), per ADR-0006.
