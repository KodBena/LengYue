# Geometry ratio constants — magic-literals audit Pass 2 Tier-1 #3

- **Status:** Shipped on `frontend/geometry-ratios`, 2026-05-03.
  Substrate addition + 5-site sweep; build green; closes the
  Tier-1 arc.
- **Genre:** Pass-2 substrate PR — third and final of the
  audit's Tier-1 trio (after the z-index ladder #99 and
  duration tokens #100). Closes the audit's *triggering
  specimen* class (the `* 0.88` PV-stone-radius variant that
  surfaced this whole arc).
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category L) flagged
the geometry-multiplier cluster as the audit's named triggering
specimen — the `* 0.88` variant in MoveSuggestions's PV-stone
radius that landed without recorded rationale, was engineered
around in a later fix, and made the *class* of failure the audit
was named to address. The 0.88 itself was removed earlier; this
substrate addresses the underlying class.

Project-author-chosen scope: **small** (named ratio constants in
`engine/constants.ts`; defer the broader `useBoardGeometry`
composable + shared `<Stone>` component refactor as a separate
larger PR if/when prioritized).

The cluster from inventory Category L:

| Multiplier        | Sites                                                                  | Role                                  |
|-------------------|------------------------------------------------------------------------|---------------------------------------|
| `cell * 0.46`     | `BoardDisplay.vue:38`, `MoveSuggestions.vue:108`, `board-renderer.ts:21` | stone radius from cell                |
| `stoneR * 0.4`    | `BoardDisplay.vue:210`, `board-renderer.ts:48`                         | last-move / preview marker inner radius |
| `stoneR * 1.01`   | `MoveSuggestions.vue:160`                                              | suggestion cluster ring (outline)     |
| `stoneR * 0.72`   | `MoveSuggestions.vue:193`                                              | suggestion winrate-label font-size    |
| `stoneR * 0.62`   | `MoveSuggestions.vue:200`                                              | suggestion score-label vertical offset |
| `stoneR * 0.58`   | `MoveSuggestions.vue:202`                                              | suggestion score-label font-size      |
| `stoneR * 0.82`   | `MoveSuggestions.vue:229`                                              | PV-preview move-number font-size      |

The first two clusters (3 sites of `* 0.46` and 2 sites of
`* 0.4`) are clean SSOT candidates — same role across multiple
sites. The remaining five PV-overlay-specific multipliers are
likely **co-calibrated typography** (font-size hierarchy
0.58 / 0.72 / 0.82 + coupled offset 0.62 + outline 1.01); same
shape as the `use-pv-animation` co-calibration deferral, third
pattern beyond the audit's two working principles. Filed as a
separate `deferred-items.md` entry rather than swept here.

## What changed

### `src/engine/constants.ts`

Two new exports added between `TOTAL_PX` and the color
constants. Each carries a JSDoc naming the role, the sites
that read it, and the audit-context (the `* 0.88` triggering
specimen).

```ts
/**
 * Stone radius as a fraction of cell size. The geometric foundation
 * shared by every renderer that draws stones — keep as a single
 * value across consumers to prevent the drift that surfaced this
 * audit's triggering specimen (the `* 0.88` PV-stone variant in
 * MoveSuggestions.vue, removed earlier in favor of the unified
 * ratio). Three consumer sites read this: live BoardDisplay,
 * suggestion overlay (MoveSuggestions), and the SVG-string
 * renderer (board-renderer.ts).
 */
export const STONE_RADIUS_RATIO = 0.46;

/**
 * Inner-marker radius as a fraction of stone radius. Used for the
 * small inner circle drawn on the most recent move (last-move
 * marker, BoardDisplay) and for analysis preview markers
 * (board-renderer's optional showMarker overlay). Two consumer
 * sites today.
 */
export const MARKER_INNER_RATIO = 0.4;
```

### Five sweep sites

| Site                            | Was              | Is                                |
|---------------------------------|------------------|-----------------------------------|
| `BoardDisplay.vue:39`           | `cell.value * 0.46`     | `cell.value * STONE_RADIUS_RATIO`     |
| `BoardDisplay.vue:211`          | `stoneR * 0.4`          | `stoneR * MARKER_INNER_RATIO`         |
| `MoveSuggestions.vue:108`       | `cell.value * 0.46`     | `cell.value * STONE_RADIUS_RATIO`     |
| `engine/board-renderer.ts:21`   | `cell * 0.46`           | `cell * STONE_RADIUS_RATIO`           |
| `engine/board-renderer.ts:48`   | `stoneR * 0.4`          | `stoneR * MARKER_INNER_RATIO`         |

Imports extended at three call sites:

- `BoardDisplay.vue` — adds `STONE_RADIUS_RATIO, MARKER_INNER_RATIO` to the existing constants import.
- `MoveSuggestions.vue` — adds `STONE_RADIUS_RATIO` to the existing constants import (MARKER_INNER_RATIO not used here).
- `board-renderer.ts` — adds both to the existing constants import.

### `docs/notes/deferred-items.md`

New entry **"PV-overlay typography proportions — calibration
question"** placed in Open items. Records the five PV-specific
multipliers (1.01 / 0.72 / 0.62 / 0.58 / 0.82), the calibration
hypothesis (font-size hierarchy + coupled offset), the third-
pattern framing (same shape as use-pv-animation deferral), and
suggested investigation procedure for a future revisit
(name-the-calibration vs consolidate-to-font-scale vs inline-
justify).

## What's not done

- **`useBoardGeometry` composable + shared `<Stone>` component**
  — the plan's larger architectural framing for this substrate.
  Scope-limited here per the user's "small-scope" call. The
  cell-value derivation logic stays per-SFC (BoardDisplay,
  MoveSuggestions each compute their own `cell` reactively from
  `BOARD_PX` and `boardSize`); a future PR could centralize.
- **Five PV-overlay-typography multipliers** in MoveSuggestions
  — deferred to `deferred-items.md` per the calibration concern
  noted above.
- **Other domain multipliers** in inventory Category M
  (BoardWidget ownership, BaseChart Y-axis margin, BoardTab
  geiger-dot scale derivation) — these are band-3 Go-bound or
  one-off cluster-of-one cases. Left for the Tier-4
  inline-justification sweep that closes the audit.
- **No theme-variant accommodation needed** — geometry ratios
  are not theme-dependent (a Chess port would replace BOARD_PX
  but keep the stone-radius-as-fraction-of-cell logic with a
  different ratio).

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed, no errors. Pre-existing chunk-size
  warning is unrelated.
- `rg -n '\* 0\.46\b|\* 0\.4\b' src/components/BoardDisplay.vue
  src/components/MoveSuggestions.vue src/engine/board-renderer.ts`
  returns nothing — no literal multipliers remain at the swept
  sites.
- `grep -n "MARKER_INNER_RATIO\|STONE_RADIUS_RATIO"
  src/components/BoardDisplay.vue src/components/MoveSuggestions.vue
  src/engine/board-renderer.ts` confirms imports + 5 use sites.
- Visually unchanged: stone radius, last-move marker, preview
  marker all render at identical sizes (the constants' values
  are identical to the prior literals).
- ADR-0002: no silent fallbacks introduced; the constants are
  module-level exports, missing import surfaces as a compile
  error.
- ADR-0004: file edits stayed minimal — each consumer site was
  a 1-line replacement plus a one-import-list extension.
- ADR-0005 Rule 1: `engine/constants.ts` is the single source of
  truth for these geometric ratios; the JSDoc names the
  rationale and the consumer sites.
- ADR-0006: source-file headers preserved; no new files.
- ADR-0007: `engine/constants.ts` now at 79 lines (was 56);
  well under any size budget.

## License

Public Domain (The Unlicense).
