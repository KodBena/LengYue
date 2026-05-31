# Worklog — TreeWidget auto-center forced-reflow excision (2026-05-31)

The tree's viewport-centering watcher read scroll/viewport geometry
synchronously on every navigation, right after its `nextTick` DOM patch had
dirtied layout — forcing a synchronous reflow per nav. Reworked to observe
rather than poll, via a new `useViewportFollow` composable.

## Diagnosis (prod profile)

`prod.json.gz` `marker stack` on the worst `Reflow (sync)` block named its
trigger above the native frames:

```
[7]  PresShell::DoFlushPendingNotifications  Layout
[13] get Element.scrollLeft          ← the trigger
[17] http://<URL>!setup/<            (TreeWidget setup-scope watcher)
```

`TreeWidget.vue`'s `watch(currentNodeId, …)` fires per nav. After its
`nextTick()` DOM patch (which dirties layout) it read
`el.scrollLeft / clientWidth / scrollTop / clientHeight` to decide whether the
active node was in view. Reading *any* layout-geometry property while layout is
dirty forces the browser to flush styles + layout synchronously. `scrollLeft`
is merely the first of the four reads (left-to-right evaluation); once it forces
the flush the rest are free — the trigger is orientation-independent, not
specific to the horizontal axis.

## The rAF dead-end (recorded — it didn't work)

The first attempt deferred the read into `requestAnimationFrame`, on the theory
that the browser would have flushed layout by the time it fired. **It did not
reduce forced reflows at all** — an isolated dev autonav capture (342-node
game, base-twice drift floor) measured:

| metric            | base_a | base_b | rAF fix |
|-------------------|--------|--------|---------|
| Reflow (sync) n   | 1027   | 1027   | 1027    |
| Reflow (sync) ms  | 77.7   | 77.0   | 76.4    |

Drift floor 0.9%; the "fix" landed at −1.7%, inside the floor. The reason:
rAF callbacks run at the *start* of the frame's `RefreshDriverTick`, *before*
the style/layout pass — so the pending mutation is still unlaid-out and the
read forces the same flush. Deferring relocated the read; it did not move it
off the dirty-layout path. The rAF version was discarded.

Two corrections the capture forced:

- Forced reflow is ~1% of isolated autonav cost (77 ms / ~6.9 s). The dominant
  cost is `RefreshDriverTick` (~78%): the tree SVG re-rendering per nav. That is
  the real autonav-latency lever and is untouched here.
- `UpdateContainerQueryStyles` = 0 in this autonav capture (charts hidden), vs
  799 in the prod capture (charts visible). The container-query recalc storm is
  **chart-driven** — the analysis chart panels' container queries recompute as
  the charts react to navigation — not the tree, and not popover (no popover
  loop was running during the prod capture). The prod `scrollLeft` reflow
  cascaded into a container-query recompute only because chart work was pending
  to be flushed alongside it.

## Fix: observe, don't poll (`useViewportFollow`)

New composable `src/composables/useViewportFollow.ts` (`[B1]`). It caches scroll
offset from a passive `scroll` listener (fires after the scroll is applied —
already laid out) and viewport dimensions from a `ResizeObserver` (fires after
the layout pass). Both update at layout-clean times, so `centerOn(x, y)` reads
only cached values and **never forces a reflow**, regardless of orientation
(both axes cached). The single live geometry read is a one-time seed at mount,
off the nav hot path. Listener + observer are released in `onUnmounted`
(resource-ownership at the mutation site — they live outside Vue's graph).

The scroll is instant (`behavior: 'smooth'` dropped): smooth animates over many
frames, so fast auto-nav restarts it before it arrives and it never catches the
active node (pronounced in Chrome, whose smooth-scroll restart latency is
higher). Instant tracks the leading edge one jump per frame and drops the
animation cost (a battery win). It was the only smooth-scroll site in the SPA.

`TreeWidget`'s watcher keeps its `ensureVisible` + `nextTick` (still needed so
the SVG has grown to the new extent before scrolling) and now just computes the
node's pixel position and calls `viewportFollow.centerOn`.

## Validation (pending re-capture)

Because the rAF version proved the *aggregate* `Reflow (sync)` total is noisy
at the 1% level and dominated by tree-render reflows, the meaningful check is
whether the **scrollLeft-rooted** forced reflow disappears. The observe-don't-
poll version removes the synchronous geometry read entirely, so it must.

- Base: `bork/perf/autonav-harness-geiger-excision` (session tip).
- Branch: `bork/perf/treewidget-autocenter-reflow`.
- DEV autonav (harness is dev-only), charts hidden, same game/window, base-twice
  floor. Expected: the per-nav synchronous reflow rooted at the centering
  watcher is gone; behaviour (follow + Chrome) unchanged from the corrected rAF
  version.

License: Public Domain (The Unlicense).
