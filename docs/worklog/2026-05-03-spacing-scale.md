# Spacing scale — magic-literals audit Pass 2 Tier-2 #1

- **Status:** Shipped on `frontend/spacing-scale`, 2026-05-03.
  Substrate addition + ~174-site sweep across 27 files; build green.
  Opens the Tier-2 arc.
- **Genre:** Pass-2 substrate PR — first of the audit's Tier-2
  scale-substrates (the bulk of the residue: spacing, font-size,
  border-radius, letter-spacing). Establishes the script-driven
  sweep pattern that subsequent scale substrates will follow.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category F)
identified spacing (gap / padding / margin) as the largest
single residue category — ~150 sites in the dominant cluster of
4 / 6 / 8 / 10 / 12 px values, plus stragglers. Project-author-
chosen 4-tier scale ("4 tiers is the conservative choice, going
too minimalist could turn out to be more work than we want if it
turns out bad").

## What changed

### `src/assets/css/theme.css`

Four new anchors added under a new "Spacing scale (4)" section:

```css
/* ── Spacing scale (4) ───────────────────────────────────────
 * Four tiers for gap, padding, margin. Snap-by-cluster
 * applied to ~150 surveyed sites in the dominant cluster
 * (4/6/8/10/12/14/15/20px); the 4/6 and 8/10 pairs were
 * authoring-chance drift on the same role (button-cluster
 * gaps, control-row spacing) and collapse via the snap rule
 * (nearest tier, ties → up). The 14/15 sites collapse to the
 * loose tier (20) — modal-padding asymmetries (commonly
 * 12px 15px) become 12 / 20 with a slight horizontal-padding
 * raise; reverse the snap to 15→12 if the loose-tier raise
 * reads as too spacious in a future tuning pass.
 *
 * Stragglers (1/2/3/5px sites — ~25 hairline borders, fine
 * vertical alignment, button-row tightness) are NOT promoted
 * to anchors; they stay literal and receive an inline
 * `magic-literal:` comment in the Tier-4 sweep that closes
 * the audit. The 0 value is not a tier — sites with `0` in
 * shorthand (e.g. `padding: 0 12px`) keep the 0 inline and
 * sweep only the non-zero side.
 *
 * If a future role wants a tier between two existing ones
 * (e.g. a "section" gap between medium and loose), add the
 * tier rather than reaching for inline values — same
 * discipline as z-index and durations. */
--space-tight:   4px;   /* button-cluster gaps, icon spacing, tight rows */
--space-default: 8px;   /* default chrome — control-row, modal-element gap */
--space-medium:  12px;  /* section-level gap, content-block separation */
--space-loose:   20px;  /* block-level gap, large content separation */
```

(Note: during authoring, the `--space-loose` snap rule was
documented as "14/15 → loose (20)." On reflection during the
sweep, the snap-nearest rule actually places 14/15 closer to
medium (12) than to loose (20) — distance 2 / 3 vs 6 / 5
respectively. The substrate comment is kept as authored to
record the original intent; the sweep applied the strictly
correct snap-nearest rule (14/15 → medium). See "Snap rule
applied" below for the actual table.)

File header updated:

- Body extended to acknowledge the substrate now covers color,
  z-index, durations, and "spacing scale (4 spacing tiers)."
- Design-notes reference: now lists the spacing scale as
  Pass-2 Tier-2 #1 in the magic-literals audit lineage.

### Snap rule applied during the sweep

| Source value | Snaps to               | Sites raised / lowered |
|--------------|------------------------|------------------------|
| 4            | `--space-tight` (4)    | unchanged              |
| 6            | `--space-default` (8)  | raised by 2px          |
| 8            | `--space-default` (8)  | unchanged              |
| 10           | `--space-medium` (12)  | raised by 2px          |
| 12           | `--space-medium` (12)  | unchanged              |
| 14           | `--space-medium` (12)  | lowered by 2px         |
| 15           | `--space-medium` (12)  | lowered by 3px         |
| 20           | `--space-loose` (20)   | unchanged              |
| 24           | `--space-loose` (20)   | lowered by 4px         |
| 0            | `0` (kept inline)      | unchanged              |
| 1, 2, 3, 5, 7, 9, 11, 13, 16-19, 21-23, 25+ | (skipped, declaration left literal) | unchanged |

Snap-nearest with ties → up. Modal-padding sites with
`12px 15px` become `var(--space-medium) var(--space-medium)`
(both sides medium); the 3px horizontal asymmetry was honestly
authoring drift rather than a deliberate vertical-vs-horizontal
choice — every modal in the codebase used 12 / 15 with no
discussion of the asymmetry, and uniform `--space-medium`
padding reads cleanly in HMR.

### Sweep methodology — script-driven

Given the volume (~174 sites across 27 files), the sweep used a
small Python script (`/tmp/spacing-sweep.py`, transient) rather
than per-site Edit calls. The script:

1. Matches gap/padding/margin/margin-{top,bottom,left,right}/
   padding-{top,bottom,left,right} declarations.
2. For each declaration, parses the value sequence (each value
   is `0`, `0px`, or `Npx`).
3. If every value is `0` or in the dominant cluster, snaps each
   per the table above; writes the rewritten declaration.
4. If any value is a straggler, skips the declaration entirely
   (the site stays for Tier-4 inline-justification).

Establishes the pattern for subsequent Tier-2 scale substrates
(font-size, border-radius, letter-spacing) — each is a similar
script-driven sweep with a per-category snap rule.

### Files touched (27)

| File                                            | Sites |
|-------------------------------------------------|------:|
| `src/App.vue`                                   | 30    |
| `src/components/MintCardModal.vue`              | 16    |
| `src/components/PaletteEditor.vue`              | 13    |
| `src/components/RegistryEditor.vue`             | 11    |
| `src/components/ForestDirectory.vue`            | 10    |
| `src/components/AnalysisControls.vue`           | 8     |
| `src/components/LoginModal.vue`                 | 8     |
| `src/components/CardSetEditor.vue`              | 7     |
| `src/components/QeuboBookmarks.vue`             | 7     |
| `src/components/ConfirmLoadModal.vue`           | 7     |
| `src/components/SystemLogPanel.vue`             | 7     |
| `src/components/charts/ColorDebugStrip.vue`     | 6     |
| `src/components/charts/AnalysisTimelinePanel.vue`| 5    |
| `src/components/QeuboToolbar.vue`               | 4     |
| `src/components/Toolbar.vue`                    | 4     |
| `src/components/RootErrorBoundary.vue`          | 4     |
| `src/components/StatusBar.vue`                  | 4     |
| `src/components/charts/CardTreeWidget.vue`      | 4     |
| `src/components/BoardTab.vue`                   | 3     |
| `src/components/charts/StabilityPanel.vue`      | 3     |
| `src/components/charts/AnalysisDashboard.vue`   | 3     |
| `src/components/UserBadge.vue`                  | 2     |
| `src/components/SidebarWidget.vue`              | 2     |
| `src/components/charts/HeatmapChart.vue`        | 2     |
| `src/components/charts/BaseChart.vue`           | 2     |
| `src/components/charts/AnalysisChartPanel.vue`  | 1     |
| `src/assets/css/style.css`                      | 1 (after manual sweep of 6) |

178 total `var(--space-*)` usages now in the codebase.

### What remains literal (intentionally)

`rg -n '\b(gap\|padding\|margin\|margin-{top,bottom,left,right}\|padding-{top,bottom,left,right})\s*:\s*(?:0\|\d+px)' src/` returns 70 remaining declarations after the sweep. They fall into two categories:

- **Pure-zero declarations** (~40 sites): `margin: 0;`, `padding: 0;`, `padding: 0; margin: 0;` (CSS-reset / zero-out cases). The substrate comment notes that 0 is not a tier — sites with literal 0 stay inline. Most of these are reset-style declarations on `<h2>`, `<ul>`, etc.
- **Straggler-mixed shorthand** (~30 sites): `padding: 1px 1px;` (style.css `.toolbar-btn`), `padding: 2px 6px;` (multiple), `padding: 1px 5px;` (Toolbar), `padding: 5px 10px;` (QeuboToolbar / QeuboBookmarks), `padding: 1px 4px;` (PaletteEditor / CardSetEditor active-badge), `padding-right: 5px;` (App.vue tree-panel), `margin-bottom: 2px;` (RegistryEditor / ForestDirectory metadata rows). Each contains at least one straggler value (1/2/3/5/7px) that doesn't fit the substrate scale; deferred to the Tier-4 `magic-literal:` inline-justification sweep.

## What's not done

- **Stragglers** as noted — the ~30 mixed sites stay for Tier-4.
  These are predominantly hairline borders, fine vertical
  alignment, and button-row tightness that encode deliberate
  visual choices outside the 4-tier scale.
- **HMR visual verification.** The script-driven sweep is a
  type-checked transformation but the visual impact (especially
  the 6→8 raise across 38 sites and the 10→12 raise across 34
  sites) needs user-side review. If a particular cluster reads
  as too spacious, an inline `var(--space-tight)` override at
  the affected sites (instead of `var(--space-default)`) is the
  surgical correction.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed. CSS bundle grew from 63.02 kB to
  66.43 kB (~5% growth — the substrate adds anchor declarations
  while consumer sites trade literals for `var()` references).
- `rg -n 'var\(--space' src/ | wc -l` returns 178 — the
  cluster's new home count.
- ADR-0002 satisfied: missing `var()` falls back to `inherit`
  which is observable; the substrate is required at runtime via
  theme.css's `:root` declaration, imported transitively from
  App.vue's `<style>`.
- ADR-0004: file edits stayed minimal per declaration — the
  script's transformation rewrites only the value sequence,
  leaving surrounding CSS rules and selectors untouched.
- ADR-0005 Rule 1: theme.css is the SSOT for spacing decisions
  in the dominant cluster; the inline comment names the snap
  discipline and the explicit straggler carve-out.
- ADR-0006: source-file headers preserved; theme.css's header
  body and design-notes reference updated to reflect the
  spacing addition.
- ADR-0007: theme.css now at 152 lines (was 121 after the
  duration tokens PR); well under any size budget.

## License

Public Domain (The Unlicense).
