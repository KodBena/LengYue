# Font-size scale — magic-literals audit Pass 2 Tier-2 #2

- **Status:** Shipped on `frontend/font-size-scale`, 2026-05-03.
  Substrate addition + 159-site sweep across 28 source files;
  build green.
- **Genre:** Pass-2 substrate PR — second of the audit's Tier-2
  scale-substrates after the spacing scale. Establishes the
  typographic-hierarchy substrate.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category E)
identified the codebase's typographic hierarchy as 10 distinct
font-size values (8/9/10/11/12/13/14/16/18/20 px) across ~150
sites. Project-author-chosen **4-tier scale** (consistent with
the spacing-scale and z-index/duration tier counts).

Distribution before sweep:

| Value | Sites |
|------:|------:|
| 10px  |  53   |
| 11px  |  42   |
| 12px  |  26   |
| 14px  |  13   |
|  9px  |  11   |
|  8px  |   5   |
| 13px  |   3   |
| 20px  |   2   |
| 18px  |   2   |
| 16px  |   2   |
| **Total** | **159** |

No stragglers — every value fits the dominant typography cluster.
The body tier (10px) is the inheritance baseline (set in
`style.css`'s `html, body` rule).

## What changed

### `src/assets/css/theme.css`

Four new anchors added under a new "Font-size scale (4)"
section:

```css
/* ── Font-size scale (4) ─────────────────────────────────────
 * Four tiers for the codebase's typographic hierarchy.
 * Snap-by-cluster applied to 159 surveyed font-size sites.
 * The body tier (10px) is the inheritance baseline — set once
 * in style.css's `html, body` rule and inherited everywhere
 * by default. Explicit body-size declarations on individual
 * elements are common but redundant; sweep collapses them
 * through this anchor and a future polish pass could remove
 * the redundancy entirely.
 *
 * Snap rule (nearest, ties → up):
 *   8/9   → tiny (9)        — 16 sites
 *   10    → body (10)       — 53 sites unchanged
 *   11    → emphasis (12)   — 42 sites raised 1px
 *   12    → emphasis (12)   — 26 sites unchanged
 *   13    → emphasis (12)   — 3 sites lowered 1px
 *   14    → heading (16)    — 13 sites raised 2px
 *   16/18 → heading (16)    — 18 lowered 2px (2 sites)
 *   20    → heading (16)    — 2 sites lowered 4px
 *
 * The 14→16 raise is the most visible change: section
 * headings get slightly bigger. The 18/20→16 lowerings touch
 * dialog titles and hero text — fewer sites, slightly
 * smaller. If the heading-size collapse reads as too
 * aggressive in a future pass, splitting --text-heading into
 * heading-sm (14) and heading-lg (18) is the obvious tuning
 * — same discipline as z-index and spacing (alias-not-add). */
--text-tiny:     9px;   /* fine metadata, axis labels */
--text-body:     10px;  /* body default — set in style.css's html/body */
--text-emphasis: 12px;  /* emphasized body, secondary headings */
--text-heading:  16px;  /* section headings, dialog titles, hero */
```

File header updated:

- Body extended to acknowledge the substrate now covers color,
  z-index, durations, spacing, and "font-size scale (4
  typographic tiers)."
- Design-notes reference: now lists the font-size scale as
  Pass-2 Tier-2 #2 in the magic-literals audit lineage.

### Sweep methodology — script-driven

Following the spacing-scale pattern, the sweep used a small
Python script (`/tmp/font-size-sweep.py`, transient) given the
volume. The script's regex matches `font-size: <num>px` with
optional whitespace around the colon, snaps the numeric value
per the table, and rewrites the declaration. Single-pass; no
straggler-detection needed because every value is in the
dominant cluster.

After the script ran, one site in `src/composables/useCardThumbnail.ts`
remained literal — the script's file-glob targeted
`src/components/` and `src/App.vue` / `src/assets/css/`, missing
composables. The single error-fallback site (`<div style="color:red;
font-size:10px;">Render Error</div>`) was swept manually to
`var(--text-body)`.

### Files touched (28 sweep targets + 1 substrate file)

| File                                              | Sites |
|---------------------------------------------------|------:|
| `src/components/PaletteEditor.vue`                | 14    |
| `src/components/ForestDirectory.vue`              | 14    |
| `src/components/MintCardModal.vue`                | 13    |
| `src/App.vue`                                     | 10    |
| `src/assets/css/style.css`                        | 10    |
| `src/components/CardSetEditor.vue`                | 10    |
| `src/components/QeuboBookmarks.vue`               | 9     |
| `src/components/SystemLogPanel.vue`               | 8     |
| `src/components/RegistryEditor.vue`               | 7     |
| `src/components/LoginModal.vue`                   | 7     |
| `src/components/QeuboToolbar.vue`                 | 6     |
| `src/components/AnalysisControls.vue`             | 6     |
| `src/components/charts/AnalysisTimelinePanel.vue` | 5     |
| `src/components/charts/CardTreeWidget.vue`        | 5     |
| `src/components/charts/card-tree-echarts.ts`      | 5     |
| `src/components/Toolbar.vue`                      | 4     |
| `src/components/RootErrorBoundary.vue`            | 4     |
| `src/components/StatusBar.vue`                    | 5     |
| `src/components/ConfirmLoadModal.vue`             | 2     |
| `src/components/UserBadge.vue`                    | 2     |
| `src/components/BoardTab.vue`                     | 2     |
| `src/components/charts/StabilityPanel.vue`        | 2     |
| `src/components/charts/AnalysisChartPanel.vue`    | 2     |
| `src/components/charts/ColorDebugStrip.vue`       | 2     |
| `src/components/TabWidget.vue`                    | 1     |
| `src/components/SidebarWidget.vue`                | 1     |
| `src/components/charts/HeatmapChart.vue`          | 1     |
| `src/components/charts/BaseChart.vue`             | 1     |
| `src/composables/useCardThumbnail.ts`             | 1 (manual) |
| **Total**                                         | **159** |

`rg -n 'var\(--text-(tiny|body|emphasis|heading)\)' src/ | wc -l`
returns 159 — every swept site is now a `var()` reference.
Zero literal `font-size: Npx` declarations remain in `src/`.

## Carve-outs and caveats

- **Tooltip strings in TS files (`card-tree-echarts.ts`,
  `useCardThumbnail.ts`).** These render to DOM (ECharts'
  `formatter` returns HTML, the thumbnail error-fallback is a
  div), where CSS variables resolve correctly via the document's
  `:root`. Verified by the build passing and by code review of
  the tooltip-rendering pipeline.
- **The body tier as inheritance default.** `style.css`'s
  `html, body { font-size: 10px }` is now `font-size: var(--text-body)`.
  Most explicit `font-size: 10px` declarations on individual
  elements are redundant (they re-declare the inherited body
  value). They're swept here for SSOT discipline, but a future
  polish pass could remove the redundancy entirely.
- **No non-px font-size values.** No em/rem font-sizes in the
  codebase — the substrate is px-only by design.
- **`engine/constants.ts::LABEL_FONT_SIZE = 11`** is unrelated
  — it's a viewBox-unit number for SVG rendering of board
  coordinate labels, not a CSS font-size. Stays as-is.

## What's not done

- **Heading-size collapse may be too aggressive.** The 14/18/20
  → 16 collapse touches 17 sites total (13 raise from 14, 2
  lower from 18, 2 lower from 20). HMR review needed; if it
  reads as too uniform, the tuning move is to split
  `--text-heading` into `--text-heading-sm: 14px` and
  `--text-heading-lg: 18px` (alias-not-add discipline from the
  z-index PR), with consumer sites picking the appropriate
  anchor.
- **Redundant body-size declarations.** ~50 sites explicitly
  declare `font-size: 10px` (now `var(--text-body)`) on
  individual elements when they'd inherit it from `body`
  anyway. This is pre-existing redundancy preserved by the
  sweep (the values are correct, the declarations are
  defensive). Removing them is a separate cleanup pass.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed.
- `rg -n 'font-size\s*:\s*\d+px' src/`: zero hits.
- `rg -n 'var\(--text-(tiny|body|emphasis|heading)\)' src/ | wc -l`:
  159 — every swept site reads through the substrate.
- ADR-0002: missing `var()` falls back to `inherit` (which
  cascades to body's 10px); not silent, but visually similar
  to the literal value. Substrate is required at runtime via
  theme.css.
- ADR-0004: file edits stayed minimal per declaration.
- ADR-0005 Rule 1: theme.css is the SSOT for font-size
  decisions; the inline comment names the snap discipline.
- ADR-0006: source-file headers preserved.
- ADR-0007: theme.css now at 184 lines (was 152); well under
  any size budget.

## License

Public Domain (The Unlicense).
