# Fresh-context review — UI defects batch 2 (Defect 2, Defect 4, Defects 5+6)

Reviewer: independent session, no prior context. Read in full before review:
`frontend/CLAUDE.md`, `law/adr/0021-witness-construction-discipline.md`,
`.claude/dispatch-reports/ui-defects-investigation.md` (§Defect 2, §Defect 4,
§Defects 5-6), and `.claude/dispatch-reports/ui-fixes-batch1-review.md`
(present — read in full for merge-order/overlap context). Refute posture:
judged only each fix commit's own diff (`git show <sha>`, not the full
branch-vs-next divergence, which for target 2 & 3 also contains unrelated
dependabot commits with different SHAs than `next`'s own — same content,
confirmed, not builder-introduced). Ran build/eslint/test:run myself in
each worktree. Deleted the `#suppressed` early-return live and watched the
suite go red for the right reason (target 1). Independently reran the
Playwright rect-probe against a freshly built+served preview (target 3).

## Fix 1 — worktree-agent-a257743f8f4743a99 (0aafc1eb), Defect 2

**Extraction faithfulness — WITNESSED.** Diffed the old inline `markers`
computed against the new `deriveVariationMarkers` (board-variations-markers.ts)
line by line: identical branching (active/variation × circles/letters/off),
identical opacity/color literals, identical `suggestionPoints` overlap
fallback. The only substantive change is the parameterized colors (passed in
instead of calling `themeColor` inline) and the new `if (opts.suppressed)
return [];` guard at the top — no behavior drift.

**Red leg — WITNESSED by me, not just cited.** Commented out the
`suppressed` early-return in the source, reran the unit suite: the two
`suppressed=true` tests fail for the right reason (`toEqual([])` gets the
full unsuppressed marker array back), the other two pass unaffected.
Restored the source. This is a genuine ADR-0021 Rule 4 red, not a
wrong-reason failure.

**Overlay stays mounted — confirmed.** `BoardWidget.vue`'s template only
adds `:suppressed="pvHoverActive"` to the existing `<BoardVariationsOverlay>`
mount; no `v-if` was added or removed at the mount site. Suppression is
consumed inside the `markers` computed, exactly as the report's chosen
"stays mounted" shape required.

**FILES.md — MISSED.** `board-variations-markers.ts` is a new file under
`src/composables/board/`; `frontend/CLAUDE.md`'s File map section requires
a same-PR `FILES.md` entry for every new TS/Vue file under `src/`. Grepped
the diff and the current `FILES.md`: no row was added for either the new
module or its test. This is a real, mechanical spec violation — not a
correctness bug, but the exact drift the discipline exists to prevent (a
reader consulting `FILES.md` for "which composable handles the board
overlay markers" won't find it).

**Gates, run by me:** build PASS, eslint PASS (clean), `test:run` PASS —
1105 passed / 4 skipped, 80.3s, clean exit.

**Verdict: ACCEPT-WITH-NITS** — the fix, extraction, and tests are correct
and faithfully witnessed; the missing `FILES.md` row should be added before
merge (one line, trivial to fix, not worth blocking on but should not be
silently waived either).

## Fix 2 — worktree-agent-a27277ce02e9479bf (1917b70c), Defect 4

**Deviation adjudication — sound, independently re-derived.** Read
`useVirtualList.ts` in full myself. `itemHeight: () => tabHeight.value` is
a getter re-read on every recomputation of `window`, `topPadPx`,
`bottomPadPx`, and inside `scrollToIndex`'s `index * h` math — there is no
cached/stale copy anywhere in the composable, so bumping the ref default
46→52 (matched by `.thumb-container`'s new `padding-top: 6px`, which
`offsetHeight` includes) keeps every one of those four computations
internally consistent. The virtual list is fixed-height by construction
(the file's own header disclaims variable-height support), so a uniform
per-item height change cannot introduce overlap or gaps at the window
edges — every slot, visible or spacer, uses the same constant.

The geometry argument for *why* per-tab (not per-list) padding is required
also checks out: `scrollToIndex` computes `el.scrollTop = index * h` (or
`bottom - clientHeight`), which snaps the *container's own scroll offset*
to align a tab's top edge with the container's clip boundary — a
one-time top-of-list buffer only ever protects `scrollTop === 0`, i.e.
tab index 0. Per-tab padding travels with whichever tab lands flush, which
is the actual repro condition. This matches the builder's stated reasoning
exactly; I did not just take the report's word for it.

**Visual-rhythm trade-off — disclosed, not hidden.** The uniform 6px gap
between tabs is a real, visible density change to a previously-flush rail.
It's named in the commit message, the dispatch report, and an inline code
comment at both edit sites — not slipped in silently. Whether a 6px gap is
acceptable is a maintainer visual call; I did not chase a screenshot
comparison (not free to get cheaply without a live build on this host at
review time), so I'm flagging it as disclosed-but-unquantified rather than
independently confirming the "reads fine" judgment.

**Dependency-bump commits on this branch** (`0369d0f0` etc., same content
as `next`'s own dependabot merges but different SHAs) are pre-existing
history artifacts from how this branch's rebase landed, not something the
builder introduced in the fix commit — confirmed the fix commit
(`1917b70c`) itself touches only `BoardTab.vue`, `SidebarWidget.vue`, and
the two dispatch-report files.

**Gates, run by me:** build PASS, eslint PASS (clean), `test:run` PASS —
1114 passed / 4 skipped, 41.7s, clean exit (matches the builder's own
reported tail exactly).

**Verdict: ACCEPT.**

## Fix 3 — worktree-agent-a44a04cf739f5caea (1e246e6d), Defects 5+6

**`!controlsExpanded`-only centering — justified, confirmed.** Read the
relevant `App.vue` slice: `#vue-tree-panel` is `width: 140px; flex-shrink:
0`, never a `flex-grow` participant, so toggling it off can't strand row
space on its own — `#control-panel`'s pre-existing `flex: 1 1 0` already
absorbs any width it frees. Excluding `!treeExpanded` from
`splitWorkspaceCentered` is a no-op-avoidance, not a missed case.

**Byte-identical-below-saturation claim — verified by reading the drag-math
diff, not trusting the docstring.** `computeControlPanelWidthPx` returns
`undefined` for every `targetPx <= boardColumnSaturationPx`, and `App.vue`'s
`:style` binding on `#control-panel` falls back to the original `{ flex: '1
1 0', minWidth: CONTROL_PANEL_MIN_WIDTH_PX + 'px' }` exactly when the
composable returns `undefined` — same shape as pre-fix, with `minWidth`
now sourced from the shared constant instead of a duplicated `'220px'`
literal (confirmed both call sites — `App.vue`'s two `:style` branches —
reference the same imported `CONTROL_PANEL_MIN_WIDTH_PX`, one home, no
duplication). `computeBoardTargetPx` is the pre-fix clamp math, extracted
verbatim (confirmed by diff: same `Math.max(MIN_BOARD, Math.min(...,
MAX_BOARD))` expression, unchanged).

**Windowing/overlap at the post-saturation edge — checked, no gap or
overlap.** `computeControlPanelWidthPx` derives `naturalPanelWidthPx` from
geometry measured once at drag start (`rowWidthAtDragStartPx -
otherFixedWidthAtDragStartPx - boardColumnSaturationPx`) and subtracts the
overshoot 1:1, floored at `CONTROL_PANEL_MIN_WIDTH_PX`. Since the board
column's rendered width is pinned at `boardColumnSaturationPx` for the
entire post-saturation range (that's the definition of saturation) and the
"other fixed width" (tree panel + resizer + borders) doesn't change during
a drag, `board + other + panel` stays internally consistent with the
measured `rowWidthAtDragStartPx` for every drag position — no edge case
found where the three widths could sum to more or less than the row.

**Playwright probe — independently re-run by me, not just trusted.** Built
a fresh `frontend/dist` from this branch's source, served it via `vite
preview --port 4602`, copied the probe into `frontend/` (its own header
requires that CWD for `playwright-core` resolution) and ran it against
`--executable /usr/bin/chromium`:

```
PASS  Defect 6: #board-column.left shifts rightward once controlsExpanded flips false
PASS  Defect 5: resizer bar right-edge moves after a past-saturation drag (previously frozen)
PASS  Defect 5: #control-panel width shrinks after a past-saturation drag

ALL PASS
```

This matches the builder's own reported tail exactly — reproduced
independently, not taken on faith.

**220px floor — single home, confirmed.** `CONTROL_PANEL_MIN_WIDTH_PX` is
exported once from `useResizablePanel.ts` and imported into `App.vue`;
grepped for any remaining bare `'220px'`/`220` literal touching
`#control-panel` — none found, both the static `min-width` branch and the
new shrink-floor branch reference the same constant.

**Gates, run by me:** build PASS, eslint PASS (clean), `test:run` PASS —
1111 passed / 4 skipped, 46.1s, clean exit (matches builder's own tail).

**Verdict: ACCEPT.**

## Cross-branch / cross-batch overlap check

File sets touched by each fix commit (not the full branch divergence):

- Fix 1 (Defect 2): `BoardVariationsOverlay.vue`, `BoardWidget.vue`,
  `board-variations-markers.ts` (+ test), + own dispatch-report file.
- Fix 2 (Defect 4): `BoardTab.vue`, `SidebarWidget.vue`, + own
  dispatch-report files.
- Fix 3 (Defects 5+6): `App.vue`, `useResizablePanel.ts` (+ test), + own
  dispatch-report files.

Zero overlap among the three batch-2 fixes (confirmed via `git show --stat`
per commit). Zero overlap against batch-1's files (`theme.css`,
`card-tree-echarts.ts`, `ToolbarEngineMetrics.vue`, `TreeWidget.vue`,
`timing.ts` per `ui-fixes-batch1-review.md`). `App.vue` appears only in
Fix 3; `BoardTab.vue` only in Fix 2 — matches the dispatch brief's own
prediction. `git merge-tree $(merge-base) next <branch>` for each of the
three batch-2 branches individually showed no `<<<<<<<` conflict markers
(only incidental word-matches of "conflict" inside comments). Did not
force a combined three-way merge commit (aborted a stray attempt cleanly,
verified `git status` clean and back on `next` afterward) — file-set
disjointness across all six fixes (batch 1 + batch 2) makes a conflict
structurally impossible regardless of merge order.

## Recommended merge order (both batches)

No ordering constraint exists — all six fixes across both batches touch
disjoint files and each gates cleanly standalone. Suggested order,
lowest-risk/most-isolated first, purely for review hygiene (batch 1's own
order preserved, batch 2 appended):

1. worktree-agent-a31b81a69dbdd699c (Defect 7, TreeWidget contrast) — batch 1.
2. worktree-agent-ab1b568e33f97aa59 (Defect 1, toolbar flicker) — batch 1.
3. worktree-agent-a05345d0d7d73da7e (Defects 3+8, transitions + card labels) — batch 1.
4. worktree-agent-a27277ce02e9479bf (Defect 4, tab-close clip) — batch 2, single-file-pair, no new composable.
5. worktree-agent-a44a04cf739f5caea (Defects 5+6, resizer + centering) — batch 2.
6. worktree-agent-a257743f8f4743a99 (Defect 2, PV-hover suppression) — batch 2, **add the missing `FILES.md` row before or immediately after merge**.

## Summary

| Fix | Verdict |
|---|---|
| Defect 2 (PV-hover dashed suppression) | ACCEPT-WITH-NITS (missing `FILES.md` row for the new `board-variations-markers.ts`/test) |
| Defect 4 (tab-close-button clip) | ACCEPT |
| Defects 5+6 (resizer past saturation + centering) | ACCEPT |

All three: build/eslint/test:run witnessed clean by me in each worktree,
independently of builder self-reports; red leg (Fix 1) and live probe
(Fix 3) independently reproduced, not just cited. No merge conflicts
among the three, against batch 1, or against current `next`.
