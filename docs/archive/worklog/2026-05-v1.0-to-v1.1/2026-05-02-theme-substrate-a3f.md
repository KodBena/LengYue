# Theme substrate — A3f: sweep shell + App.vue

- **Status:** Shipped on `frontend/theme-sweep-sfc-shell`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes; SSOT-grep
  on swept files shows only documented `theme-exception` zones.
  **Closes A3** — the SFC `<style>` block sweep is complete.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3f of the A1–A4 arc. Sixth and final sub-PR of A3.
- **Date:** 2026-05-02.

## Context

Six SFCs swept (~84 chrome literals total — the heaviest cluster):

- `src/App.vue` (31 literals)
- `src/components/Toolbar.vue` (9)
- `src/components/StatusBar.vue` (11)
- `src/components/SystemLogPanel.vue` (16)
- `src/components/UserBadge.vue` (9)
- `src/components/RootErrorBoundary.vue` (8)

Plus three inline-template `style="..."` literals fixed in App.vue
and one Vue `:style="{...}"` object binding partially fixed in
Toolbar.

## theme-exception zones

Five inline exceptions across the cluster:

1. **App.vue `.panel-resizer` `#eba46d`** — peach accent color
   for the board / control-panel divider handle. Outside the
   substrate's accent vocabulary (`--accent-primary` cyan and
   `--accent-secondary` orange `#f0a04a`); this is a third
   accent hue.

2. **Toolbar `.highlight-btn` muted-cyan variants** — `#2a5a7a`
   border, `#1a3a4a` hover bg. Same pattern as QeuboToolbar's
   `.apply-btn` (A3e).

3. **Toolbar inline `:style="{ color: metrics.latencyMs < 500 ?
   '#00ff88' : ... }"`** — the watchdog-dot's vivid-activity-
   indicator color, matching the geiger-dot pattern from BoardTab
   (A3a). Documented in worklog rather than inline because Vue
   `:style` bindings can't carry CSS comments easily.

4. **RootErrorBoundary `.reb-title` `#ff7070` and `.reb-message`
   `#ff8888`** — lightened-attention text variants for the error
   panel's "loud but readable" presentation. The substrate's
   `--state-attention` (`#ff4a4a`) is the saturated wire-color;
   pale-red text variants would need new anchors.

5. **RootErrorBoundary `.reb-reload:hover` `#5bc0ff`** —
   lightened-accent variant, same pattern as MintCardModal's
   `.btn-submit` hover.

## Notable mappings

- **App.vue's `.collapse-btn` `rgba(20, 20, 20, 0.8)` →
  `color-mix(in srgb, var(--surface-2) 80%, transparent)`** —
  alpha-modulated surface-tone derivative. Slight shift (`#1a1a1a`
  at 80% alpha vs `#141414` at 80% — within JND).

- **`background: #1a1a1a; color: #eee;` on `#app` →
  `var(--surface-2)` and `var(--text-0)`** — the most-cascaded
  rule in the codebase, since every component renders inside
  `#app`. After this change every chrome decision below `#app`
  is indirectly themed.

- **App.vue inline `style="background: #f0a04a; color: #111;"` →
  `var(--accent-secondary)` and `var(--surface-1)`** — the
  intermission "Start review" CTA button. Vue accepts `var()`
  references in inline `style="..."` strings directly (CSS
  variables are CSS, not presentation attributes).

- **App.vue `:style` object binding** with conditional accent /
  attention colors: rewritten so the binding produces
  `'var(--accent-secondary)'` or `'var(--state-attention)'` as
  the string value — both render correctly when CSS resolves.

- **Color-mixed `rgba(255, 74, 74, 0.05)` and similar** in
  SystemLogPanel: `color-mix(in srgb, var(--state-attention) 5%,
  transparent)` and the `--state-warning` analog for warning
  messages. Maintains the loud-but-translucent style of the
  log panel's level-tinted backgrounds.

- **StatusBar `.turn-indicator.W` `#f0a04a` → `var(--accent-
  secondary)`** — the white player's turn indicator color. Same
  anchor as the orange CTA button.

## Summary of A3 (the SFC sweep arc)

A3 closed across six sub-PRs (A3a–A3f) covering 30 SFCs and
~325 chrome literals:

| Sub-PR | Cluster | Files | Literals | PR |
|--------|---------|-------|----------|-----|
| A3a | Rail/board-list | 5 | 24 | #82 |
| A3b | Charts/viz | 6 (+3 deferred) | 43 | #83 |
| A3c | Editors | 3 | 58 | #84 |
| A3d | Modals/auth | 3 | 51 | #85 |
| A3e | Forest/qeubo/controls | 4 | 65 | #86 |
| A3f | Shell + App.vue | 6 | 84 | (this PR) |

Files deferred to A4 (TS-side literals only):
- `src/components/charts/BaseChart.vue`
- `src/components/charts/HeatmapChart.vue`
- `src/components/HorizontalTimelineVisualizer.vue` (whole-block
  theme-exception)
- Template-inline SVG `stroke=""` / `fill=""` attributes on
  TreeWidget and others (presentation attributes don't evaluate
  `var()`).

## ADR compliance

- **ADR-0006:** existing headers preserved on all SFCs;
  no new files in A3f.
- **ADR-0004:** each file read in entirety before edit;
  changes localized to `<style>` block contents.
- **ADR-0002:** `theme-exception` comments and worklog
  carve-outs are explicit declarations.
- **ADR-0005 Rule 1:** every chrome decision in the swept SFCs
  now reads from `theme.css`.

## Next

- **A4** — TS chart adapters via `themeColor()` helper. Closes
  the SSOT contract:
  - Add `src/utils/theme-color.ts::themeColor(name)`.
  - Sweep BaseChart's ECharts options literals.
  - Sweep HeatmapChart's ECharts options literals.
  - Sweep template-inline SVG attributes on TreeWidget,
    CardTreeWidget, etc.
  - Verify zero chrome literals outside the three SSOT files
    (theme.css / engine/constants.ts / engine/suggestion-colors.ts)
    plus the documented `theme-exception` zones.

## License

Public Domain (The Unlicense).
