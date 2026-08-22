# LYT genfile two-writers reconciliation — build report (lyt-genfile-two-writers, row 2592)

## Base

Started on local `next` `008c136d99bf5f917bcd424d8ad5a0ac889616d0` (confirmed via
`git rev-parse HEAD` immediately after `git reset --hard` to it, per the base-freshness
protocol). Local `next` moved to `b3e3718e6c5c96f3cd9e69abc138bae8bc9913a5` mid-session
(unrelated StatusBar-narrow work); merged clean fast-forward before final gates, no
conflicts with anything this item touched. Final commit is `b87603ba685ccd07c52a29febca817c51a578e52`
on top of `b3e3718e`.

## Divergence inventory

Ran the generator (`research/lyt/emit_layout_tree.py`, both `--registration landscape`
and `--registration portrait`) against a fresh venv (`~/w/vdc/venvs/generic/bin/python`,
per `research/lyt/README.md`'s own "Solver environment" section — `ortools` confirmed
already present there) into scratch output, then diffed against the committed
`frontend/src/state/lyt-layout.gen.ts` / `lyt-layout-portrait.gen.ts`. One hunk per file,
both hand-edits of the SAME underlying fact:

- **`library-cards-promotion`** (ledger row 2511's ratified "GUI shape gets fixed fast
  without iterating the DSL" bypass): the committed `.gen.ts` files had `CP-library`/
  `CP-cards` REMOVED from the control-panel Exclusive's `children` array entirely (App.vue's
  `#exclusive-controlPanel` slot mounts them itself, as a toolbar-launched overlay sharing
  the Exclusive's own grid track — a concept the LYT DSL has no vocabulary for), and
  `defaultTabId` moved from `library` to `settings`. A fresh regen reverted both — the
  generator still emitted `CP-library`/`CP-cards` as genuine `LytExclusiveChild` entries
  with `defaultTabId: "library"`, exactly reproducing the pre-hand-edit shape.

No second, independent divergence was found — this is the one hand-edit ledger row
2592 named, confirmed by direct diff rather than assumed.

## Fold-back (mandate item 2)

Classified as **structural, generator-side fold-back** (not a `.lyt` source edit): the
`.lyt` encodings still need to declare `CP-library`/`CP-cards` as ordinary Exclusive
children for every OTHER consumer of the encoding (the CP-SAT solver, the mockup
generator, well-formedness checking) — only this ONE consumer, the runtime-program
emitter, needs to narrow further. This mirrors the existing
`control_panel_collapse_indices` mechanism (settings/analysis narrowing) one step
further.

`research/lyt/emit_layout_tree.py` changes:

- New `Registration.control_panel_promoted_indices: frozenset` field — child indices
  (0-based, encoding order) DROPPED from the emitted Exclusive's `children` entirely
  (not collapsed to a blackbox — genuinely absent). Set to `frozenset({0, 1})`
  (library, cards) for both `landscape` and `portrait` registrations.
- `_build_node`'s Exclusive branch (`open_control_panel=True` path) skips a promoted
  index before recursing/collapsing; `cpath`/`i` stay the child's ORIGINAL
  encoding-order index, so every surviving sibling's own `path` is unaffected (settings/
  analysis/other still emit as `2.3.1.2`/`.3`/`.4`, byte-identical to the pre-fold-back
  hand-edit).
- `defaultTabId` is derived as the first NON-promoted tab id (read off `ex_children[0]`
  after pruning) rather than unconditionally `control_panel_tab_ids[0]`.
- `build_program`/`build_program_for` thread the new field through; a module-docstring
  section ("LIBRARY-CARDS-PROMOTION, FOLDED BACK INTO THE GENERATOR") documents the
  rationale and cites ledger rows 2511/2592.

`research/lyt/tests/test_emit_layout_tree.py` changes (4 stale tests, all pinning the
pre-fold-back shape):

- `test_control_panel_exclusive_opens_library_cards_settings_other_collapses_analysis`
  → renamed `..._opens_settings_other_promotes_library_cards_collapses_analysis`;
  drops the library/cards assertions, updates `defaultTabId`/`tab_ids`/`kinds`.
- `test_portrait_control_panel_blackbox_floor_is_wrapper_min_derived` → same
  retargeting for portrait.
- `test_f1_port_cp_library_elastic_floor_edge` / `test_p2d_non_residual_leaves_unaffected`
  → `CP-library` is no longer reachable through the emitted program's Exclusive
  children at all, so both now reach its own raw `ast.Slot` directly (new
  `_find_leaf_slot_by_widget` walk, mirroring the existing `_find_tagged_exclusive_slot`
  "no tautology" pattern) and run it through `_build_node` in isolation — the field
  values under test are properties of the leaf's own declaration, not of where in the
  tree it happens to be reachable, so this is a retargeting, not a weakening.

## Byte-stability (mandate item 3)

- Regenerated both classes twice in a row into separate scratch paths: identical output
  (`diff -q` empty) both times.
- Regenerated both classes directly to `frontend/src/state/lyt-layout.gen.ts` /
  `lyt-layout-portrait.gen.ts` and diffed against a fresh scratch regen after the merge
  with `next`: byte-identical (`diff -q` empty for both files).
- The only diff a regen produced against the ORIGINAL (pre-fold-back) committed files
  was the now-obsolete inline comment explaining the hand-patch itself (correctly
  dropped, since the generator now embodies that logic) — the DATA was already
  byte-identical at that point.

## THE NET (mandate item 4)

`.github/workflows/research-lyt-ci.yml` (new): builds a throwaway venv
(`ortools`+`pytest`, matching the README's own one-liner) and runs
`pytest research/lyt/tests/ -q`, triggered on `research/lyt/**` and either committed
`.gen.ts` file changing. The byte-identity gate itself is the pre-existing
`test_render_ts_roundtrip_matches_committed_file` / `test_portrait_render_ts_roundtrip_
matches_committed_file` tests in `test_emit_layout_tree.py` (they already asserted
`render_ts(build_program_for(...)) == committed_file.read_text()`; the "two writers"
problem was that the .lyt encodings + generator + committed files disagreed, not that
this test was missing) — no research/lyt CI job existed to run them at all until this
change, so a future hand-patch of either `.gen.ts` would have silently reverted on the
next local regen with no automated signal. It now fails the gate.

## Behavior-preservation witness (mandate item 5)

- `vue-tsc -b`: clean, no errors.
- Targeted vitest: `feasible-layout` (3 files), `lyt-root-split-live`, `LytNode-fit-
  assertion`, `useLytFitAssertion`, every other `*lyt*`/`LytNode*` suite (11 more files),
  plus the newly-merged StatusBar suites — 22 files / 399 tests, all green.
- `npm run build` (`vue-tsc -b && vite build`): clean, exit 0.
- `research/lyt` full pytest suite: 443 passed, 0 failed (after the 4 stale-test
  updates above).
- **Live-boot witness**: isolated backend (fresh SQLite, port 29764) + frontend dev
  server (port 29173, distinct from another concurrently-running agent's backend
  discovered on port 19764 during setup — switched ports to avoid cross-session
  collision) + `frontend/scratch-shot.mjs` (recovered per the `lytnode-recursion-fix-
  build.md` recipe). Registered a fresh user, logged in via localStorage token
  injection + reload, dismissed the setup wizard, landed on the CARDS toolbar-launched
  overlay (library-cards-promotion's own runtime behavior) at 1920x1080. Took an
  "after" screenshot (fold-back applied), then `git stash`'d the two `.gen.ts` files
  back to their original (pre-fold-back, hand-edited) content, re-shot identically
  ("before"), then restored (`git stash pop`). Pixel diff: 116 pixels differ out of
  1920×1080×3 ≈ 6.2M values, entirely confined to the live-clock text in the system-
  diagnostics panel (captured ~40 seconds apart) plus a couple of single-value
  anti-aliasing jitters elsewhere — no layout/geometry difference. Screenshots and the
  pixel-diff script output are not committed (scratch artifacts); the comparison
  methodology and result are recorded here per the mandate's disclosure requirement.

No reservation/floor value was changed — every `min`/`pref`/`max` in both `.lyt`
encodings is untouched; this is a refactor restoring single-writer truth at today's
shipped values only.

## Gates (rows 2570/2590)

- tsc: green.
- Targeted vitest: green (22 files / 399 tests, see above).
- `npm run build`: green.
- Research pytest: green (443/443).
- Local `next` re-checked before final gates (see Base above); merged, re-gated on the
  merged tree — all green post-merge, byte-stability re-confirmed post-merge.

## Ledger

Commit `b87603ba685ccd07c52a29febca817c51a578e52` on top of `b3e3718e6c5c96f3cd9e69abc138bae8bc9913a5`
(local `next`). Attempted `led work close lyt-genfile-two-writers shipped --witness
commit:b87603ba... --review-deferred`; refused by the kernel because that commit is not
yet reachable from `/home/bork/w/omega`'s own HEAD (the shared checkout, which is where
branch `next` is actually checked out) — my session is worktree-isolated and the tool
harness refuses git operations that would reach outside `/home/bork/w/omega/.claude/
worktrees/agent-abda58c1bd573d352`. Merging this worktree's commit into the shared
repo's `next` is the orchestrator's step; the ledger close (`shipped`, `--review-
deferred`, witness = this commit sha once merged) should follow that merge, not
precede it.

## Summary for the closing message

- Divergence inventory: 1 hunk per file (2 total), both the same fact (library-cards-
  promotion), confirmed by direct generator-vs-committed diff.
- Fold-back: generator-side (`Registration.control_panel_promoted_indices`), not the
  `.lyt` sources — the DSL genuinely cannot express the concept, per the ratified
  ruling the original hand-edit's own comment named.
- Byte-stability: confirmed (two consecutive regens identical; committed files equal
  fresh regen exactly, before and after the mid-session `next` merge).
- THE NET: `.github/workflows/research-lyt-ci.yml`, new — wires the pre-existing
  roundtrip tests (the byte-identity gate) into CI for the first time.
- Gates: tsc / targeted vitest (399 tests) / build / research pytest (443 tests) all
  green; live-boot witness pixel-identical (clock aside).
- Outstanding: ledger close needs this commit merged into the shared repo's `next`
  first (orchestrator step) — not completed from this worktree by design.
