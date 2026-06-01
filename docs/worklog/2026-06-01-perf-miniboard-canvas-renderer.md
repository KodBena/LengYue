# Worklog — MiniBoard canvas renderer, made user-selectable (2026-06-01)

## Question

The thumbnail board (`MiniBoard`) is an SVG: per thumbnail, a `<line v-for>`
grid, a `<circle v-for>` over stones (each with a radial-gradient fill), an
optional last-move ring, and a label `v-for` — ~150 DOM nodes, ×N visible
preview panels. Per-stone `v-memo` keeps the *patch* small, but the render
function still re-runs in full on every navigation (recomputing `stoneList`,
the `v-for`, the per-stone memo checks). `render ≫ patch` is the ADR-0010
tell. The user asked whether pre-rendering the thumbnail to something without
DOM structure (PNG / canvas) would help or be heavier — answered by
converting on a branch and measuring.

## Conversion

`MiniBoardCanvas.vue` is the canvas implementation, following the ADR-0010
canvas rule + imperative-escape pattern verbatim:

- One `<canvas>` in the template reading nothing high-frequency, so the
  component's render function does not subscribe to the snapshot.
- `draw()` is driven by `watch([() => snapshot, () => showMarker])` — off the
  render path. Snapshots are immutable value objects, so a reference change is
  the redraw signal.
- Stones are **sprite-blitted**: the radial-gradient stone is rendered once
  per `(colour, device-pixel radius)` into an offscreen canvas
  (`stoneSprite`, module-scope cache) and `drawImage`'d per stone — far
  cheaper than `createRadialGradient` per stone per redraw, and crisp because
  the sprite is rendered at the device-pixel radius.
- The wood texture is a module-shared `Image`, loaded once across every
  instance; instances that draw before it arrives repaint via a `woodWaiters`
  set.
- Backing store sized to `cssW/cssH × devicePixelRatio`; the centred-square
  fit, grid, ring, and labels reproduce the SVG geometry through
  `boardGeometry`/`gridLines` (the same pure functions the SVG path uses).
- `onUnmounted` disconnects the `ResizeObserver` and removes the `draw` wood
  waiter (resource-ownership-at-mutation-sites: both live outside Vue's
  reactivity graph).

## The forced-reflow regression — and its fix

The first cut read `canvas.clientWidth/clientHeight` synchronously inside
`draw()`. On the per-navigation redraw path that forces a synchronous reflow
each time — exactly the ADR-0010 imperative-escape **step 3** violation
("dimensions read once on resize at a layout-clean time and cached, never
read synchronously on the hot path"). The headless trace caught it
immediately:

| Metric (median of 8 cold-cache runs) | SVG (main) | Canvas, naive | Canvas, cached dims |
|---|---:|---:|---:|
| `Blink.ForcedStyleAndLayout.UpdateTime` **count** | 336 | **741** | 338 |

The naive canvas **doubled** the forced-style-and-layout count. The fix: cache
`cssW/cssH` from the `ResizeObserver`'s `entries[0].contentRect` (a
layout-clean callback) and have `draw()` consume the cached dims only. That
restored FSL parity with the SVG path (336 → 338, within run noise).

`scripts/perf-capture.mjs nav-range --visits 1000 --model b10`, cold cache per
run (`clearCache()`), headless.

## Why the trace alone didn't settle it

Headless Chrome drops the compositor/vsync and **masks PAINT** — and paint is
exactly where a canvas blit beats ~150 SVG nodes × N panels. The user checked
a render-backed **live Firefox** profile and reported the canvas path is "way
less janky," with the residual jank concentrated at the *end* of the run. So
the decision did not rest on the headless FSL parity (which only proves the
canvas doesn't *regress* the forced-reflow axis); it rested on the live paint
win the headless metric cannot show. (Per the project's perf discipline:
counts within a run, not absolute cross-run wall-clock; and the headless
harness is blind to the paint axis — noted here so the next reader doesn't
mistake "FSL parity" for "no win.")

## Made selectable, not swapped

The user wanted to keep the choice — "select from within the SPA which
rendering type is preferred without affecting either code path's
performance." So `MiniBoard.vue` became a thin **dispatcher**:

```vue
<MiniBoardCanvas v-if="useCanvas" ... />
<MiniBoardSvg v-else ... />
```

`v-if` (not `v-show`) means **only the chosen renderer mounts** — neither
path carries the other's cost, satisfying the "without affecting either code
path's performance" constraint by construction (cross-contamination cannot
occur; the unselected component never instantiates).

- `MiniBoardSvg.vue` — the SVG renderer, the **default** (the user chose to
  keep current behaviour as default; canvas is opt-in).
- `MiniBoardCanvas.vue` — the canvas renderer, opt-in.
- The choice is `profile.settings.appearance.miniBoardRenderer: 'svg' |
  'canvas'`, surfaced as a dropdown via the RegistryEditor `PATH_ENUMS`
  (`'appearance.miniBoardRenderer': ['svg', 'canvas']`).

Plumbing: the new setting in `types.ts` (`AppSettings.appearance`), its
default in `defaults.ts` (`'svg'`), and schema migration **55 → 56**
backfilling `'svg'` (idempotent) — `CURRENT_SCHEMA_VERSION = 56`. Per the
rolling-archive discipline, the same change aged the 53 → 54 migration out of
`migrations.ts` into `archived-migrations.ts` (two style anchors retained).

## Carry-over regression test (the user's explicit request)

> "I'd like a regression test that validates the new path-dependent SVG render
> against the previous branch implementation so that I know everything got
> carried over exactly."

`MiniBoardSvg.vue` is the byte-for-byte carry-over of the pre-split
`MiniBoard` SVG body, proven two ways:

1. **Byte-identical git diff** against `main:frontend/src/components/board/MiniBoard.vue`
   at split time (point-in-time check).
2. **`tests/integration/MiniBoardSvg.parity.test.ts`** (the durable guard):
   mounts `MiniBoardSvg` and a *frozen* reference copy
   (`tests/integration/__refs__/MiniBoardSvgReference.vue` — the only edit
   from the original is two relocated import paths, annotated "do not improve
   it") across **7 path-dependent snapshots × `showMarker` on/off = 14 cases**
   (empty 9×9, opening 19×19, last-move place→ring, last-move on a black
   stone, pass → no ring, variation labels, dense 19×19) and asserts identical
   normalised HTML. Normalisation strips only the two render-incidental
   attributes: the per-instance random gradient/pattern uid (`(wd|gb|gw)-XXXX`)
   and Vue's per-file scoped-CSS `data-v-*` hash. 14/14 green.

The header comment edits to `MiniBoardSvg.vue` are outside the `<template>`,
so they do not affect rendered output or the parity assertion.

## User concerns addressed

- **"Is it robust to window rescaling? (you're caching scalings)"** — yes. The
  cached dims are written *from* the `ResizeObserver`, which fires on every
  size change (and once on `observe` for the first paint) and redraws. The
  cache is the mechanism that keeps the *redraw* off the reflow path; it does
  not freeze the geometry — a resize re-caches and repaints. `devicePixelRatio`
  is read per draw, so it also tracks a window dragged between displays of
  different density.
- **"The circle marker on the delta-chart stones seems less noticeable"** —
  noted as a subjective rendering difference. The canvas ring uses the same
  `MARKER_INNER_RATIO`, `lineWidth 2`, `globalAlpha 0.8` and colour rule as the
  SVG ring; the perceived difference is likely sub-pixel anti-aliasing of a
  thin stroke at small thumbnail sizes. Since canvas is opt-in and the SVG
  default is unchanged, this is left as a tuning item rather than a blocker —
  flagged here so it isn't lost.

## Verification

`vue-tsc -b` clean; `eslint .` clean; full suite **784 passed | 3 skipped**
(incl. the 14 new parity cases). No `as` without justification; no wire shapes
outside the ACL; the setting is consumed only by the dispatcher (structural,
low-frequency read), and each leaf self-sources the snapshot it displays —
consistent with ADR-0010 read-locality.

License: Public Domain (The Unlicense).
