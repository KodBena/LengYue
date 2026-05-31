# Worklog — TreeWidget per-nav cost: ensureVisible guard + per-item memo (2026-05-30)

`<TreeWidget>` (the SVG game-tree) was the largest nav-driven Vue cost in the
combined-stress capture (autonav + popover + streaming): render+patch ~4.2 ms
× 165 navs. This cuts it ~8×, via two stacked fixes, validated clean.

## Two fixes

1. **`ensureVisible` guard** (`useTreeExpansion.ts`). The function
   unconditionally did `expandedNodes.value = new Set(...)` on every call,
   firing the expansion dep — and thus `useTreeLayout`'s `watchEffect`, which
   recomputes the entire tree layout — on EVERY nav step, even on mainline
   descent where every ancestor is already expanded. Guard: return early when
   no ancestor is missing. **This is the load-bearing fix.**

2. **Per-item memo + active-ring decouple** (`TreeWidget.vue`). The
   current-node ring read `currentNodeId` inside the node `v-for`, forcing the
   nodes to re-render per nav. Decoupled it into a single standalone `<circle>`
   positioned by an `activeRingPos` computed (the BaseChart marker pattern),
   then memoised edges (`v-memo="[edge.d]"`) and nodes
   (`v-memo="[isGameHead, move.color, branching, expanded, px, py]"`) PER ITEM.

   Per-item, NOT a whole-group memo: `layout` is a `shallowRef` reassigned to a
   fresh `markRaw` object per recompute, so a group `v-memo="[nodeList]"` busts
   on ANY layout change and re-renders the whole tree O(N) in one synchronous
   burst (a tail regression — 30 ms render spikes, 347 ms LongTask). Per-item
   re-renders only the items that actually moved/changed. NB the memos only
   skip when `layout` is reference-stable — fix #1 is what provides that;
   without the guard the memos are inert.

## Validation (clean, isolated-branch, drift-controlled)

The first stacked-capture attempt was confounded: a control component
(`BoardDisplay`, untouched) read +53% in the "after" capture, which an
adversarial review accepted as machine drift. The user doubted a 53% swing on
the same machine. We isolated each stage onto its own branch and captured base
TWICE back-to-back plus each stage — same machine, seconds apart, same nav
scenario throughout (165 TreeWidget renders in all four).

| (165 navs) | base_a | base_b | guard | guard+memo |
|---|---|---|---|---|
| TreeWidget render avg | 3.227 ms | 2.977 ms | 0.611 ms | 0.270 ms |
| TreeWidget patch avg | 1.046 ms | 1.133 ms | 0.897 ms | 0.247 ms |
| BoardDisplay (control) | 849 μs | 868 μs | 805 μs | 761 μs |
| LongTask /s | 10.0 | 10.4 | 8.7 | 7.0 |

- **Drift floor: BoardDisplay base_a vs base_b = +2.2%.** The machine variance
  is ~2%, not 53% — the earlier heavy control was a one-off anomaly, not drift,
  and not caused by these changes (the control stays flat-to-lighter as they're
  added: 858 → 761 μs). Frame load went DOWN.
- **Guard alone: render 3.1 ms → 0.611 ms (5.1×).** Per-item memo: → 0.270 ms
  (another 2.3×). **Combined render 11.5×; render+patch 4.19 ms → 0.52 ms
  (8.1×)** — ~606 ms of main-thread work removed per capture.
- LongTask rate 10 → 7/s (partly streaming-load variance across captures, but
  monotonic).

## Method lessons

- **A control that moves more than the measured back-to-back floor is a
  confound to EXPLAIN, not a normalizer to APPLY.** Accepting the 53% as drift
  turned an 11.5× win into a "modest 31%." The base-twice capture (the variance
  floor) is the cheap test that settles drift-vs-real, and isolating each stage
  on its own branch makes the before/after back-to-back.
- **`v-memo` only skips when its key is reference-stable.** Check the
  reactivity shape of the source (here: `layout` is a churning `shallowRef`)
  BEFORE adding a memo — that fact determined that the guard, not the memos,
  was the actual fix.
- Group `v-memo` over a list is an O(N)-burst tail risk when the source array
  ref churns; per-item is robust.

Credit: the adversarial firewall review caught the markRaw/reference fact and
the group-memo tail regression (both folded in); the user's drift skepticism +
the isolated-branch design produced the clean measurement.

`npm run build` green.

## What's left

The guard only no-ops on mainline RE-visits; a fresh descent still adds each
new ancestor (a layout recompute per newly-reached depth). And the layout
`watchEffect` is still sensitive to annotation-only `props.nodes` mutations
during streaming. Both are deeper levers (decoupling the layout from
annotation churn) if the per-nav cost ever needs to go lower; the per-item
memo already absorbs them gracefully (it skips when nodes don't move).

License: Public Domain (The Unlicense).
