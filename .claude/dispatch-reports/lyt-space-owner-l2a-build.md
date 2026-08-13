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

## Files touched

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

## License

Public Domain (The Unlicense), per ADR-0006.
