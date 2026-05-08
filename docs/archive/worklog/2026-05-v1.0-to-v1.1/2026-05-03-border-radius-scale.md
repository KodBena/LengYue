# Border-radius scale — magic-literals audit Pass 2 Tier-2 #3

- **Status:** Shipped on `frontend/border-radius-scale`, 2026-05-03.
  Substrate addition + 76-site sweep across 25 files; build green.
- **Genre:** Pass-2 substrate PR — third of the audit's Tier-2
  scale-substrates after spacing and font-size.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category G)
identified the border-radius cluster as small but coherent: ~30
sites in the inventory's initial estimate, surfacing as 83 sites
total on closer survey across the codebase. Distribution:

| Value     | Sites | Role                                  |
|-----------|------:|---------------------------------------|
| 3px       | 36    | dominant default — buttons, panels    |
| 4px       | 21    | container chrome — cards, modals      |
| 2px       | 8     | tight chrome — small badges, tabs     |
| 50%       | 7     | circular — dots, indicators           |
| 6px       | 4     | larger surfaces — error panel, modal frames |
| 0rem      | 4     | form-control overrides (theme-exception) |
| 9999px    | 1     | pill shape (HorizontalTimelineVisualizer) |
| 1px       | 1     | hairline (BoardTab analysis-meter)    |
| 0%        | 1     | explicit square (SidebarWidget)       |

Project-author-chosen **2-tier scale** (consistent minimalist
posture: "I'm not a fan of border radius anyways. But maybe it's
one of those things you miss only when they're gone.").

## What changed

### `src/assets/css/theme.css`

Two new anchors added under a new "Border-radius scale (2)"
section:

```css
/* ── Border-radius scale (2) ─────────────────────────────────
 * Two tiers for chrome rounding. Snap-by-cluster collapses
 * the 2/3/4/6 px small-radius cluster into a single
 * --radius-default at 3px (the dominant value, ×36 sites);
 * 4→3 (-1px, 21 sites) and 2→3 (+1px, 8 sites) shifts are
 * within JND. The 6px sites (4 — RootErrorBoundary error
 * panel, MintCardModal modal-content frame, and similar
 * larger surfaces) lower 3px to default; if the loss of
 * heavier corner-softening reads as too tight in a future
 * tuning pass, the alias-not-add discipline applies — add
 * `--radius-large: 6px` and route the affected sites to it.
 *
 * The circle tier is a distinct role (status indicators,
 * dots, round buttons) — preserved as a 50% radius.
 *
 * Stragglers preserved as literals for Tier-4 inline-
 * justification: `0rem` (4 sites — input[type="range"]
 * form-control overrides in style.css's documented
 * theme-exception block), `9999px` (1 site — pill-shape
 * trick), `1px`, `0%` (1 site each). */
--radius-default: 3px;   /* default chrome — buttons, panels, inputs, cards */
--radius-circle:  50%;   /* circular indicators, dots, round buttons */
```

File header updated to acknowledge the substrate now covers
color, z-index, durations, spacing, font-size, and "border-radius
scale (2 rounding tiers)."

### Snap rule applied

| Source value | Snaps to                | Sites |
|--------------|-------------------------|------:|
| 2px          | `var(--radius-default)` (raise 1px)  | 8 |
| 3px          | `var(--radius-default)` (unchanged)  | 36 |
| 4px          | `var(--radius-default)` (lower 1px)  | 21 |
| 6px          | `var(--radius-default)` (lower 3px)  | 4 |
| 50%          | `var(--radius-circle)` (unchanged)   | 7 |

The 6→3 lowering is the most visible change (RootErrorBoundary
error panel, MintCardModal modal-content frame, and 2 similar
sites lose 3px of corner-softening). HMR review needed.

### Sweep methodology — script-driven

Following the spacing-scale and font-size-scale pattern, the
sweep used a small Python script (`/tmp/border-radius-sweep.py`,
transient). One site (`MintCardModal.vue:322`'s
`border-radius: 0 0 3px 3px` mixed-with-zero shorthand for the
suggestions-list bottom rounding) was hand-edited to
`0 0 var(--radius-default) var(--radius-default)` — the script
skipped it because the 0 values without units don't match its
regex's `\d+(px|%|rem|em)` expectation.

### Files touched (25 sweep targets)

| File                                            | Sites |
|-------------------------------------------------|------:|
| `src/App.vue`                                   | 10    |
| `src/components/MintCardModal.vue`              | 7     |
| `src/components/PaletteEditor.vue`              | 5     |
| `src/components/ForestDirectory.vue`            | 5     |
| `src/components/QeuboBookmarks.vue`             | 5     |
| `src/assets/css/style.css`                      | 5     |
| `src/components/AnalysisControls.vue`           | 4     |
| `src/components/CardSetEditor.vue`              | 4     |
| `src/components/ConfirmLoadModal.vue`           | 4     |
| `src/components/RootErrorBoundary.vue`          | 3     |
| `src/components/QeuboToolbar.vue`               | 3     |
| `src/components/LoginModal.vue`                 | 3     |
| `src/components/charts/AnalysisTimelinePanel.vue`| 3    |
| `src/components/BoardTab.vue`                   | 3     |
| `src/components/charts/ColorDebugStrip.vue`     | 2     |
| Plus 10 SFCs with 1 site each                   | 10    |
| **Total**                                       | **76** |

76 `var(--radius-{default|circle})` usages now in the codebase;
7 stragglers stay literal as Tier-4 candidates.

### Stragglers (intentional carve-outs)

| Site                                         | Value     | Reason                                      |
|----------------------------------------------|-----------|---------------------------------------------|
| `style.css:309, :319, :333, :341`            | `0rem`    | input[type="range"] form-control overrides — already in style.css's documented theme-exception block (browser form-control aesthetic). |
| `HorizontalTimelineVisualizer.vue:384`       | `9999px`  | pill-shape trick (max-out-radius for capsule corners). One-off; inline `magic-literal:` comment in Tier-4. |
| `BoardTab.vue:163`                           | `1px`     | analysis-meter hairline rounding — sub-2px is below the substrate's smallest tier and intentional fine detail. |
| `SidebarWidget.vue:77`                       | `0%`      | explicit square corner — deliberate disable of any rounding on a visual element. |

## What's not done

- **6→3 lowering** is the most visible change. If a HMR pass
  finds the affected larger surfaces (RootErrorBoundary panel,
  MintCardModal frame) read as too tight, the tuning move is to
  add `--radius-large: 6px` and route the affected sites to it
  (alias-not-add discipline from the z-index ladder
  precedent — same shape as splitting `--text-heading` would be).
- **Stragglers** as noted — left for the Tier-4 inline-
  justification sweep that closes the audit.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes.
- `rg -n 'border-radius\s*:' src/`: returns 83 sites total — 76
  via `var(--radius-*)`, 7 stragglers (per the table above).
- ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007: all
  satisfied (per the spacing and font-size patterns).
- theme.css now at 213 lines (was 184); well under any size
  budget.

## License

Public Domain (The Unlicense).
