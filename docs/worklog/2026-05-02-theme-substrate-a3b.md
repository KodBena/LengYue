# Theme substrate — A3b: sweep charts/visualizations

- **Status:** Shipped on `frontend/theme-sweep-sfc-charts`, 2026-05-02.
  `npm run build` (vue-tsc + vite) passes; SSOT-grep on swept files
  shows only documented `theme-exception` blocks remaining.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3b of the A1–A4 arc. Second of six sub-PRs in A3.
- **Date:** 2026-05-02.

## Context

A3a (PR #82) swept the rail/board-list cluster. A3b covers
charts/visualizations (9 files originally surveyed for ~43
chrome literals). Two of the nine — `BaseChart.vue` and
`HeatmapChart.vue` — have no `<style>` block; their literals
live entirely in TS-side ECharts options and defer to A4.
`HorizontalTimelineVisualizer.vue` carries a self-contained
Tailwind-style palette and is marked `theme-exception` whole-
block.

Files swept (6):
- `src/components/charts/AnalysisChartPanel.vue`
- `src/components/charts/AnalysisDashboard.vue`
- `src/components/charts/AnalysisTimelinePanel.vue`
- `src/components/charts/StabilityPanel.vue`
- `src/components/charts/CardTreeWidget.vue`
- `src/components/charts/ColorDebugStrip.vue` (chrome only;
  visualization backdrops kept as theme-exception)

Files deferred to A4 (TS-side literals only):
- `src/components/charts/BaseChart.vue`
- `src/components/charts/HeatmapChart.vue`

Files marked theme-exception whole-block:
- `src/components/HorizontalTimelineVisualizer.vue`

## Notable decisions

1. **`HorizontalTimelineVisualizer` whole-block exception.**
   This component carries its own carefully-tuned Tailwind-style
   palette: slate (`#020617`, `#1e293b`), sky (`#38bdf8`,
   `rgba(56, 189, 248, X)`), amber (`#fbbf24`), and a handle-bar
   pink (`#f8bdf8`). The chrome decisions here are co-tuned with
   the rug-plot data colors set in the script's `getColor`. Snapping
   the chrome to the substrate's anchors would break the slate/sky
   aesthetic; mapping the data colors would defeat the rug-plot
   signaling. Treated as a self-contained visualization-system
   per plan §E's posture toward such systems.

2. **`AnalysisTimelinePanel`'s `.analyze-btn` muted-accent
   exception.** The button's `border: 1px solid #2a5a7a` and
   `:hover { background: #254a60 }` are desaturated darkened
   cyans — designer-intentional "muted action button" variants
   that don't fit the chrome anchor vocabulary. Snapping to
   `--accent-primary` (`#4aaef0`) would brighten the button
   noticeably. Inline `theme-exception` preserves the literal
   pair; future substrate work could add accent-tone variants
   if the muted-action pattern recurs.

3. **`ColorDebugStrip` partial sweep.** Per plan §E, this
   component is a window onto the visit-intensity LUT (out of
   substrate scope). The container chrome (panel bg, borders,
   labels, ticks, scale-footer) IS chrome and was swept. The
   `.clean-bg` neutral-dark backdrop and the `.wood-texture`
   image background are visualization-substrate decisions —
   tuned to make the LUT colors readable and not theme-
   replaceable. Inline `theme-exception` on the two backdrop
   rules.

4. **`color: var(--border-3)` for chevrons.** Several files
   used `color: #444` for collapsible-section chevrons (a
   text-style use of a border-cluster value). Per A2's snap
   rule (literal-value snap, plan-survey ties), `#444` lives in
   `--border-3`'s cluster (`#444, #555`). The role mismatch —
   border anchor used as text — is honest about the plan's
   value-keyed substrate design. Visual: chevrons rendered at
   `#555` (border-3) instead of `#444`; +17 grayscale, within
   JND.

## Mapping summary

Standard mappings used (consistent with A2 / A3a):

| Literal | Anchor | Notes |
|---------|--------|-------|
| `#000`, `#050505`, `#0a0a0a` | `--surface-0` | Plan cluster |
| `#0f0f0f`, `#111` | `--surface-1` | Plan cluster |
| `#181818`, `#1a1a1a` | `--surface-2` | Plan cluster |
| `#222`, `#252525`, `#282828` | `--surface-3` | Plan cluster |
| `#1e1e1e`, `#1f1f1f`, `#242424`, `#2a2a2a` | `--border-1` | Plan cluster |
| `#333` | `--border-2` | Plan cluster |
| `#444`, `#555` | `--border-3` | Plan cluster |
| `#fff`, `#eee` | `--text-0` | Plan cluster |
| `#aaa`, `#ccc` | `--text-1` | Plan cluster |
| `#888`, `#666` | `--text-2` | Plan cluster |
| `#4aaef0` | `--accent-primary` | Exact |
| `#f0a04a` | `--accent-secondary` / `--state-warning` | Exact (role-dep.) |
| `#f04a4a` | `--state-error` | Exact |
| `#ff4a4a` | `--state-attention` | Exact |
| `#4caf50` | `--state-success` | Exact |

Borders using surface-tone values (e.g. `border: 1px solid #222`)
are mapped to the corresponding `--surface-N` anchor — preserving
the bg-matching / blending semantic the codebase relies on for
panel-edge subtlety.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- Per-file SSOT-grep on swept files: zero literals remain in
  `<style>` blocks except the documented `theme-exception`
  zones (AnalysisTimelinePanel `.analyze-btn`,
  ColorDebugStrip `.clean-bg`).
- HorizontalTimelineVisualizer's literals all live within the
  whole-block `theme-exception` zone.

## Next

- **A3c** — editors (PaletteEditor, CardSetEditor, RegistryEditor;
  ~58 literals).
- **A3d** — modals/auth (MintCardModal, ConfirmLoadModal,
  LoginModal; ~51 literals).
- **A3e** — forest/qeubo/controls (ForestDirectory,
  AnalysisControls, QeuboToolbar, QeuboBookmarks; ~65 literals).
- **A3f** — shell + App.vue (App.vue, Toolbar, StatusBar,
  SystemLogPanel, UserBadge, RootErrorBoundary; ~84 literals).
- **A4** — TS chart adapters + template-inline SVG attributes
  via `themeColor()` helper. Pulls in the deferred literals from
  BaseChart, HeatmapChart, TreeWidget template-SVG, etc.

## License

Public Domain (The Unlicense).
