# Worklog — memoize BoardDisplay layers (2026-05-30)

`BoardWidget` was the biggest non-chart per-nav cost in the combined-stress
captures. The cause: `BoardDisplay` re-rendered the *entire* SVG every nav step
to reflect a ~1–2 stone delta — ~500 vnodes re-created/patched: the static
geometry (grid ~38, coordinate labels ~76, hoshi ~9), all ~200 stones
(`stoneList` is a fresh array per nav), and a second ~200-iteration `v-for` for
move numbers.

## Fix

- Geometry layers (grid / labels / hoshi) → `v-memo="[boardSize]"`. They depend
  only on `boardSize`, which is **stable during nav** — so unlike TreeWidget's
  churning `markRaw` layout, these memos actually skip. (No guard needed; the
  source genuinely doesn't churn.)
- Stones → per-item `v-memo="[stone.color, stone.x, stone.y]"` (the `:key`
  carries position, so only the changed 1–2 stones re-render; the x/y in the
  key also covers a board-size relayout).
- Move numbers → per-item `v-memo` on the `<text>` (number + position + colour).

## Validation (isolated branch, drift-floor-controlled)

`bd_base_a` and a real `bd_base_b`/`bd_base_c` pair on the base branch + `bd_memo`
on the change branch, same nav scenario, `BoardDisplay` render count 165 in all
(pure per-render cost).

| metric | base (a / c) | memo | drop | floor (a vs c) |
|---|---|---|---|---|
| BoardDisplay render | 905 / 819 μs | 444 μs | −48% | ±9% |
| BoardDisplay patch | 898 / 918 μs | 550 μs | −39% | ±2% (20× floor) |
| BoardWidget patch (recursive) | 2.65 / 2.79 ms | 2.01 ms | −26% | ±5% |

The drops are 4–20× the same-code floor — unambiguously real. (NB: `StatusBar`,
the intended control, swung ±19% between two *identical* builds this session, so
it was useless as a normalizer; the target's OWN base-twice floor settled it
instead. A control is only a normalizer when its floor is small —
[[feedback_perf_counts_not_crossrun_wallclock]].)

`npm run build` green.

## What's left

The remaining per-frame jank is still the rendering pipeline (the perf-audit
note's death-by-a-thousand-cuts): the v-show-collapsed charts still process
packets (deferred-items.md entry; the Settings → Analysis Layout affordance),
`ChartPreviewBox`'s v-html SVG (declined), and the residual native paint.

License: Public Domain (The Unlicense).
