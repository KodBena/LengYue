# Perf-Capture Normalization Protocol (informal)

Companion to **ADR-0009** (performance-investigation-discipline). ADR-0009
governs *that* a perf change carries a before/after capture and *that*
perception is reconciled against measurement; this note records the
*informal protocol* the 2026-05-29 regime-B arc converged on for making two
Firefox-profiler captures actually **comparable**, despite the confounds
that make raw whole-capture totals misleading. Written down at the
maintainer's request as a reusable technique for any future perf-debugging
session.

## The confounds (why raw totals lie)

1. **KataGo result-cache warming.** Re-running the *same* game warms the
   proxy / NN cache, so each successive capture resolves more turns per
   wall-second → more packets → a "busier" capture. Raw CPU and marker
   sums scale with this, not with the change under test. Use a **fresh
   game** for a cold-cache capture, and note the cache state per capture.
   To force cold *without* a fresh game, use the dev **clear-cache**
   toolbar button (sends `clear_cache` — clears the upstream KataGo cache;
   broadcasts to all healthy upstreams on a SELECTOR proxy, verified
   v1.0.27). **Caveat:** `clear_cache` does **not** flush the proxy's own
   analysis *replay* cache, so keep **`lookup_cache` off** (the default) —
   otherwise the proxy can replay a stored stream and never reach the
   now-cold engine, silently warming a nominally "cold" capture. (The
   button's success message warns when `lookup_cache` is on.)
2. **Variable capture framing.** The wall-clock from hitting *record* to
   focusing the app and starting to navigate (and back out to *stop*)
   varies per capture, so the active window is offset- and
   length-variable.
3. **Variable navigation amount.** How long the arrow keys are held differs
   run to run.

## The setup that makes it normalizable

- **Same scenario shape** across captures (e.g. "navigate during a range
  query, Analysis tab open, same active sub-tab").
- **Known keyboard autorepeat.** The maintainer runs `xset r rate 195 62`
  — X11 autorepeat with a **195 ms initial delay** before repeat begins,
  then **62 repeats/second**. Holding an arrow key therefore yields a
  near-deterministic keydown cadence: one keydown, a ~195 ms gap, then
  ~62 Hz. **Observed caveat:** the measured keydown rate came in ~58/s,
  *below* the 62 Hz repeat — the SPA's keydown handler is back-pressuring
  the repeat, and that gap is itself an input-latency signal worth noting,
  not noise to discard.

## The normalization actually used (2026-05-29)

- **Do not compare whole-capture totals** (CPU sum, marker sums) — they
  scale with capture length and cache-warmth.
- **Normalize by a scenario proxy.** `keydown` count ≈ navigation amount;
  `Perform microtasks` count and `Toolbar` render count ≈ packet/analysis
  volume. Confirm two captures are comparable on these proxies *before*
  comparing costs.
- **Read scenario-robust per-event medians.** `RefreshDriverTick` p50 and
  `requestAnimationFrame callbacks` p50 are *per-frame* costs — independent
  of how many frames ran or how long. These were the load-bearing
  comparison metric across the arc (e.g. the Phase-2 tab-unmount's −45 %
  frame-p50 held even though that capture was cache-warm and shorter).
- **GC nuance.** `GCMajor` duration is the *incremental span* of a major
  GC (sliced), not a single pause; the actual pause time is the sum of
  `GCSlice`. Don't read `GCMajor` as freeze time.

## The proposed refinement (sketched — NOT yet mechanized)

The maintainer proposed a more precise normalization: clip both captures to
a **fixed comparable interval** rather than comparing whole-capture
aggregates — align on **tree position**, account for the
capture-start→focus latency *plus* the 195 ms repeat-delay before key-repeat
fires, and take a **fixed keydown-index window** — so equal wall-clock
slices are compared like-for-like. In practice the 2026-05-29 arc used the
coarser per-keydown / per-frame-median approach above. Reach for the
fixed-window clip only if a future arc needs tighter comparison than a
per-event median provides; it is recorded here so it isn't re-derived from
scratch.

## Tooling

- `@firefox-devtools/profiler-cli`: `load --session <id> <file>.json.gz`;
  `thread markers --session <id> --search <term> --json` →
  `byType[].durationStats` (`{median, p95, max}`) + `byType[].rateStats`
  (`{markersPerSecond, minGap, avgGap, maxGap}`); `profile info`
  (CPU / duration). **NB** `markersPerSecond` counts render *and* patch
  markers, so a Vue component's update rate ≈ `markersPerSecond ÷ 2`.
- Vue `app.config.performance` emits per-component render/patch UserTiming
  marks. For a specific hot path, add an ad-hoc
  `performance.measure('name', { start })` mark (DEV-gate it; e.g. the
  RB-3 `rb3:handler` / `rb3:firstBump` marks) and read its durations via
  `thread markers --search`.

## Cross-references

- `docs/adr/0009-performance-investigation-discipline.md` — the parent
  discipline (before/after captures; the case-1/2/3
  perception-vs-measurement framing).
- `docs/notes/perf-audit-range-query-nav-2026-05-29.md` — the regime-B
  audit this protocol was exercised on.

License: Public Domain (The Unlicense).
