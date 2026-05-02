# Theme substrate — A4: TS chart adapters via themeColor()

- **Status:** Shipped on `frontend/theme-sweep-ts-themecolor`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes.
  **Closes the color theming substrate arc (A1–A4).**
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A4 of the A1–A4 arc. Last step.
- **Date:** 2026-05-02.

## Context

A3 (six sub-PRs A3a–A3f) closed the SFC `<style>` block sweep.
A4 closes the remaining TS-side literals — ECharts adapter
configs, template-inline SVG presentation attributes, and the
const declarations in `card-tree-echarts.ts`. Adds the
`themeColor()` helper that the plan called for.

Files touched:

- **New:** `src/utils/theme-color.ts` — the runtime helper.
- `src/components/charts/BaseChart.vue` — ECharts options.
- `src/components/charts/HeatmapChart.vue` — ECharts options
  (incl. heatmap gradient via the `--heatmap-low/mid/high`
  chart-helper aliases that A1 introduced).
- `src/components/charts/card-tree-echarts.ts` — const
  declarations replaced with a `colors` getter object.
- `src/composables/useEChartsForestRender.ts` — tooltip
  styling, label color, edge linestyle.
- `src/composables/useAnalysisProjection.ts` — score-lead
  series color, per-point dot colors.
- `src/composables/useEnrichedData.ts` — black/white delta
  series colors.
- `src/components/TreeWidget.vue` — template-inline SVG
  attrs `<g stroke="..." />`, `<rect fill="..." />`,
  `<line stroke="..." />`. Mix of CSS-class extraction (for
  static attrs) and `themeColor()` in script (for dynamic
  per-node attrs).
- `src/App.vue` — the `intermissionSeries` computed's
  `itemStyle.color` and series-level `color`.

## The themeColor helper

```ts
export function themeColor(name: string): string {
  if (typeof document === 'undefined') {
    throw new Error(...);
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name);
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(...);
  }
  return trimmed;
}
```

ADR-0002 compliant: throws on missing variable rather than
returning empty string. The check at SSR-context-detection
is defensive (the app is purely client-rendered) but explicit.

## TreeWidget approach

TreeWidget.vue had the most complex case — its template SVG
has both static and dynamic presentation attributes that
don't evaluate `var()`. Two strategies:

1. **Static attrs → CSS classes.** `<g stroke="#444">` becomes
   `<g class="tree-edges">` with `.tree-edges { stroke:
   var(--border-3); }` in the `<style>` block. The toggle
   box's `fill="#181818" stroke="#555"` becomes
   `class="toggle-box"` with paired CSS rules. Same for
   the toggle leader and toggle marks. The active-ring's
   alpha-modulated fill `rgba(74, 174, 240, 0.15)` becomes
   `color-mix(in srgb, var(--accent-primary) 15%, transparent)`.

2. **Dynamic attrs → script helpers.** The node circles'
   `:fill` and `:stroke` depend on `item.move.color`; replaced
   with `nodeFill(item)` / `nodeStroke(item)` functions in
   the script. Chrome parts (`#444`, `#333`, `#555`) go
   through `themeColor()`; the B/W stone colors (`#111`,
   `#eee`) stay as literals because they're domain-
   meaningful per plan §D (a stone is a stone, not chrome).

## card-tree-echarts.ts pattern

The original file had nine module-level `const COLOR_X = '#xxx'`
declarations that the toEChartsNode function read from. Since
themeColor() reads from the DOM, evaluating it at module load
would fire before the document is ready in some test environments.
Replaced with a getter-object pattern:

```ts
const colors = {
  get active()       { return themeColor('--accent-primary'); },
  get activeBorder() { return themeColor('--text-0'); },
  ...
};
```

Each `colors.X` access is a fresh themeColor() call at use-time;
the API surface stays similar (`COLOR_ACTIVE` → `colors.active`)
and consumers don't need to know that the values are now
dynamically resolved.

## Domain colors deliberately preserved

Per plan §D, domain (Go-specific) colors stay in
`src/engine/constants.ts` as literals:

- `BOARD_COLOR = '#dcb35c'` (board wood).
- TreeWidget `'#111' : '#eee'` for B/W node fill (stone colors).
- BoardWidget `'#fff' : '#000'` for ownership overlay magnitude.
- `MoveSuggestions.vue` `fill="#003040"` PV stone styling.
- `engine/board-renderer.ts` `fill="#000"` SVG text labels.

These are not theme-replaceable; a "high-contrast board" or
"real-wood" feature would introduce its own user setting
orthogonal to the chrome theme.

## SSOT contract — final verification

After A4, the post-refactor SSOT contract holds:

| The color is… | …it lives in |
|---|---|
| Chrome (UI surface, border, text, accent, state) | `src/assets/css/theme.css` |
| Domain (Go: board, stones, ownership) | `src/engine/constants.ts`, plus inline literals in `BoardDisplay.vue`/`MoveSuggestions.vue`/`board-renderer.ts` for the few dynamic-binding sites |
| Visualization-system anchors (intensity LUT, CLUSTER_PALETTES) | `src/engine/suggestion-colors.ts` |

Documented carve-outs (theme-exception zones, recorded across
A2–A4 worklogs):

- Native form-control styling (`input[type="range"]`).
- Pure-black/white rgba literals (universal CSS decoration).
- Geiger-dot / watchdog vivid-activity indicators (`#00ff88`).
- Muted-state-error button surfaces (`#3a1a1a` family).
- Muted-cyan action-button variants (`#1a3a4a`, `#2a5a7a`).
- Lightened-accent hover variants (`#5bc0ff`, `#5dbafa`).
- Tailwind amber/pink role-indicators in RegistryEditor.
- HorizontalTimelineVisualizer's whole-block Tailwind palette.
- ColorDebugStrip's LUT visualization backdrops.
- App.vue's `.panel-resizer` peach handle (`#eba46d`).

Each carve-out documented inline (`/* theme-exception: ... */`)
or in the relevant worklog.

## A1–A4 arc summary

| Step | PR(s) | Files | Literals |
|------|-------|-------|----------|
| A1 — substrate file | #80 | 2 (theme.css + App.vue) | 0 (no consumer change) |
| A2 — sweep style.css | #81 | 1 | ~25 |
| A3a — rail/board-list | #82 | 5 | ~24 |
| A3b — charts/viz | #83 | 7 (incl. HorizontalTimelineVisualizer block-exception) | ~43 |
| A3c — editors | #84 | 3 | ~58 |
| A3d — modals/auth | #85 | 3 | ~51 |
| A3e — forest/qeubo/controls | #86 | 4 | ~65 |
| A3f — shell + App.vue | #87 | 6 | ~84 |
| A4 — TS chart adapters | (this PR) | 9 (incl. new theme-color.ts) | ~30 |

Total: nine PRs, 40+ files touched, ~380 chrome literals
collapsed to one substrate file. The substrate's promise — one
file owns every chrome color decision — is now real.

## What's deferred

- **B (theme replacement).** The user explicitly parked theme
  replacement to focus on the structural close. The substrate
  is now in place; changing the dark default to something less
  depressing is a one-file edit to `theme.css`, or a class-
  toggled variant on `:root`.

- **qEUBO over chrome.** The user noted in the planning
  conversation that chrome theming is exactly the kind of PBO
  use case `qEUBO` was designed for. With 16 anchors × 3 RGB
  channels = 48 dimensions, downsampling (per-cluster
  optimization, fixed-luminance subspaces, anchored hue
  offsets) is required, but the qEUBO integration's
  `parameter_meta` editor is the right scaffolding to feed it.
  Future work.

- **Substrate tuning candidates surfaced during the sweep.**
  Several patterns recurred that would benefit from new
  anchors:
  - **Muted-state-error surfaces** (`#3a1a1a` / `#5a1a1a`) —
    `--state-error-surface` and `--state-error-surface-hover`?
  - **Muted-cyan action-button variants** (`#1a3a4a` /
    `#2a5a7a` / `#2a4a5a`) — `--accent-primary-muted` and
    `--accent-primary-muted-border`?
  - **Lightened-accent hover** (`#5bc0ff` / `#5dbafa`) —
    `--accent-primary-bright`? Or rely on `color-mix(in srgb,
    var(--accent-primary), white 15%)` as a CSS-side
    derivation?
  - **Tailwind amber / pink semantic indicators** (`#fbbf24`
    "edited", `#f472b6` "reference") — extend the substrate
    or formalize the registry's color vocabulary in
    `engine/constants.ts`?

  Each would absorb one or more theme-exception zones into the
  substrate. None blocking; each is a small follow-up PR.

- **Optional CI lint.** A grep-based check that fails the build
  if a chrome literal appears outside the three SSOT files
  (theme.css / engine/constants.ts / engine/suggestion-colors.ts)
  without a `theme-exception` comment. The substrate leaves
  the codebase in a state where this rule could be turned on.

## ADR compliance

- **ADR-0006:** new file `theme-color.ts` carries the standard
  header.
- **ADR-0004:** each TS file read in entirety before edit;
  changes localized to chrome-touching lines.
- **ADR-0002:** `themeColor()` throws on missing — the plan's
  loud-failure requirement.
- **ADR-0005 Rule 1:** every chrome decision in the codebase
  now has a single source of truth (or an explicit
  `theme-exception` carve-out).

## License

Public Domain (The Unlicense).
