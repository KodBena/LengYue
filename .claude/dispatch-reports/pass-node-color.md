# Pass-node color fix — dispatch report

Commission (ledger row 759, verbatim): "Pass renders wrong in the tree; a
pass is a game move, not a meta-instruction. Therefore, it is played by
the corresponding color, not 'always black' as it currently shows."

## Base-branch note (deviation, disclosed)

The worktree this dispatch started in (`worktree-agent-a4d0f99c8072247dc`)
was checked out at commit `3378806f`, the merge-base of `next` — it
predates the entire pass-support arc (`96674258`, `cbc5a26d`,
`0801aac3`), so `TreeWidget.vue` had no pass-rendering code at all: no
`nodeFill` pass branch, no "P" glyph, no dark-theme black-stone fill
exception. This did not match the commission's description of the
current (wrong) state. Diagnosed by comparing `HEAD` against `next`
(`git show next:frontend/.../TreeWidget.vue`), which does match the
commission's description exactly. Since `HEAD` was a strict ancestor of
`next` with no divergent commits of its own, fast-forwarded the worktree
branch onto `next` (`git merge --ff-only next`) before starting — a
non-destructive, own-branch-only operation, not a shared-history rewrite.
WITNESSED: `git merge-base --is-ancestor 96674258 HEAD` was false before
the fast-forward and the merge itself reported "Fast-forward" with no
conflicts.

## Changes (`frontend/src/components/tree/TreeWidget.vue`)

1. **`nodeFill()`** — deleted the `item.move.type === 'pass'` branch that
   returned the neutral `themeColor('--border-3')` fill. A pass node now
   falls through to the same `item.move.color === 'B' ? 'var(--tree-node-black-fill, #111)' : '#eee'`
   line every other move uses — same B/W stone fill, same dark-theme
   black-stone contrast exception, unchanged. WITNESSED via the new test
   (below): black pass → `'#111'` or `'var(--tree-node-black-fill, #111)'`,
   white pass → `'#eee'`.

2. **Data check (`move.color` on pass nodes)** — read `applyPass`
   (`src/logic.ts:194`): the minted pass `GameNode`'s `move` is
   `{ x: 0, y: 0, color: state.turn, type: 'pass' }` — `color` is always
   populated from the acting player's turn, same as `applyGoMove`'s
   placed-stone moves. No data-source fix was needed; `nodeFill`'s
   `item.move.color` read is sound for pass nodes as-is. WITNESSED by
   reading `src/logic.ts` lines 173-230 in full.

3. **"P" glyph contrast (new `passGlyphFill` function)** — added a
   function picking a per-stone-color glyph fill: `'#eee'` (light) on a
   black stone, `'#111'` (dark) on a white stone. Bound via
   `:fill="passGlyphFill(item)"` on the `<text class="pass-glyph">`
   element; removed the now-stale `fill: var(--text-1)` declaration from
   the `.pass-glyph` CSS rule (an SVG presentation attribute is
   overridden by any stylesheet `fill` declaration, so the class rule had
   to stop asserting one for the attribute binding to take effect). The
   "P" letterform itself is retained as the pass signal (ADR-0019
   appendix C18 — no color-only meaning); only its color is now
   contrast-tuned per stone.

   Contrast check (WCAG relative-luminance formula, same one `nodeFill`'s
   existing comment uses):
   - `'#eee'` glyph vs. light-theme black-stone fill `'#111'`: ~16.9:1.
   - `'#eee'` glyph vs. dark-theme black-stone override `'#707070'`
     (`var(--tree-node-black-fill, #111)` resolved under
     `[data-theme="dark"]`): ~4.06:1.
   - `'#111'` glyph vs. white-stone fill `'#eee'` (no theme override
     touches the white-stone fill): ~16.9:1.

   All three clear ADR-0019 appendix C19's 3:1 floor for
   information-bearing glyphs. UNEXERCISED as an automated contrast
   assertion (no contrast-ratio helper exists in this codebase to unit
   test against); recorded here as a hand-computed derivation, same
   evidentiary posture as `nodeFill`'s own pre-existing dark-theme
   comment.

## `v-memo` key (requirement 3)

No change needed. The per-item `v-memo` on the node `<g>`
(`TreeWidget.vue` ~line 436) already keys on `item.move?.color` and
`item.move?.type`, both of which govern the new pass-fill and
glyph-fill logic — a pass toggling color or type already busts the
memo and re-renders that node. WITNESSED by reading the `v-memo` array
in full before and after the edit; it was untouched.

## Tests (requirement 4)

Searched `tests/` for existing pass-glyph / pass-node component
coverage from commit `96674258` (`git show 96674258 --stat`): the
commit's own test additions were `applyPass` unit tests, routing-gate
tests, `useReviewSession` integration tests, keybindings tests, and
analysis-service wire tests — **no component-level test of
`TreeWidget`'s pass rendering existed** (component tests are generally
out of scope per `tests/CLAUDE.md`, narrow-excepted only for the
render-count regression guards). Since the commission explicitly
required pinning this behavior and no prior test existed to extend,
added a new file reusing the render-count harness's mount
infrastructure (jsdom theme-var stubs, i18n plugin) but asserting on
rendered DOM rather than render frequency:

`frontend/tests/integration/render-count/TreeWidget-pass-node.test.ts`
— two cases:
- black pass renders `circle.node-circle`'s `fill` as the black-stone
  fill (not the old `'#888888'` neutral stub) and `text.pass-glyph`'s
  `fill` as `'#eee'`.
- white pass renders the circle's `fill` as `'#eee'` and the glyph's
  `fill` as `'#111'`.

Both cases assert the glyph element exists with text `'P'` (the
color-only-meaning proscription: the glyph itself, not just the fill,
must be present). WITNESSED: both tests pass —
`npx vitest run tests/integration/render-count/TreeWidget-pass-node.test.ts`
→ 2 passed.

This placement/naming is a **deviation** worth flagging: it lives under
`render-count/` (the only directory with a working TreeWidget-mount
harness already wired for jsdom stubs) even though it does not measure
render count. Named `TreeWidget-pass-node.test.ts` rather than
`TreeWidget.render-count.test.ts` to make that distinction legible; a
future reader relocating the render-count-specific infra should keep
this file alongside `jsdom-stubs.ts`/`render-count.ts` since it depends
on them, or extract a shared non-render-count mount helper.

## Gates

- `npx vue-tsc --noEmit` — WITNESSED, exit 0, no output.
- `npx vitest run --silent=true` (full suite, `nice -n 19`,
  `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2`) — WITNESSED, exit 0: **145 test files passed, 3
  skipped (148); 1776 tests passed, 4 skipped (1780).** No regressions
  from the change (skips are pre-existing, unrelated to this work).

## Branch / commit

Branch: `worktree-agent-a4d0f99c8072247dc` (fast-forwarded onto `next`
at `0590832e` before this work's commit — see "Base-branch note" above).
Commit sha: `916e983c03cc6f68a062bef6a7900916e5f8bb95`.
