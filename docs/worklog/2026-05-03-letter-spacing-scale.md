# Letter-spacing scale — magic-literals audit Pass 2 Tier-2 #4 (Tier-2 closer)

- **Status:** Shipped on `frontend/letter-spacing-scale`,
  2026-05-03. Substrate addition + 24-site sweep across 12 files;
  build green. **Closes the Tier-2 arc.**
- **Genre:** Pass-2 substrate PR — fourth and final of the
  Tier-2 scale-substrates after spacing, font-size, and
  border-radius.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category J)
identified the letter-spacing cluster as small and clean: 24
sites, 7 distinct values. Three dominant tiers (0.05em ×8,
0.1em ×8, 0.18em ×3) plus four stragglers (0.06, 0.08, 0.12,
0.16) that all snap cleanly to a dominant tier within JND.
Cleanest sweep of the Tier-2 arc — no straggler carve-outs
needed, no perceptible visual changes anywhere.

Project-author-chosen **3-tier scale** (lifecycle-driven by the
distinctive bunching of values rather than the prior 2/4-tier
patterns).

## What changed

### `src/assets/css/theme.css`

Three new anchors added under a new "Letter-spacing scale (3)"
section. Inline comment names the snap rule and notes that all
shifts are within JND:

```css
/* ── Letter-spacing scale (3) ────────────────────────────────
 * Three tiers for typographic tracking (letter-spacing).
 * Snap-by-cluster covers all 24 surveyed sites cleanly — the
 * 0.06 / 0.08 / 0.12 / 0.16 stragglers each fall within JND
 * of a dominant tier (0.05, 0.1, or 0.18). All shifts ≤ 0.02em,
 * well below the perceptual threshold for letter-spacing
 * changes; no carve-outs needed.
 *
 * Snap rule (nearest):
 *   0.05 / 0.06        → tight (0.05)    — 9 sites
 *   0.08 / 0.1 / 0.12  → default (0.1)   — 10 sites
 *   0.16 / 0.18        → wide (0.18)     — 5 sites */
--tracking-tight:   0.05em;  /* toolbar buttons, secondary labels */
--tracking-default: 0.1em;   /* uppercase headings, chart axis labels */
--tracking-wide:    0.18em;  /* control-tab labels, prominent uppercase headers */
```

File header updated to acknowledge the substrate now covers
color, z-index, durations, spacing, font-size, border-radius,
and "letter-spacing scale (3 tracking tiers)."

Design-notes reference: now lists the letter-spacing scale as
**Pass-2 Tier-2 #4 — the Tier-2 closer**.

### Snap rule applied during the sweep

| Source value | Snaps to                  | Sites |
|--------------|---------------------------|------:|
| 0.05em       | `var(--tracking-tight)`   |   8   |
| 0.06em       | `var(--tracking-tight)`   |   1   |
| 0.08em       | `var(--tracking-default)` |   1   |
| 0.1em        | `var(--tracking-default)` |   8   |
| 0.12em       | `var(--tracking-default)` |   1   |
| 0.16em       | `var(--tracking-wide)`    |   2   |
| 0.18em       | `var(--tracking-wide)`    |   3   |
| **Total**    |                           | **24**|

Unchanged sites: 19 (8 at tight 0.05, 8 at default 0.1, 3 at
wide 0.18). Shifted sites: 5 (the four straggler values plus
the 0.16 sites). Maximum shift: 0.02em (the 0.16 → 0.18 sites).

### Files touched (12 sweep targets)

| File                                              | Sites |
|---------------------------------------------------|------:|
| `src/assets/css/style.css`                        | 5     |
| `src/components/ForestDirectory.vue`              | 4     |
| `src/components/Toolbar.vue`                      | 3     |
| `src/App.vue`                                     | 2     |
| `src/components/QeuboBookmarks.vue`               | 2     |
| `src/components/QeuboToolbar.vue`                 | 2     |
| `src/components/MintCardModal.vue`                | 1     |
| `src/components/SystemLogPanel.vue`               | 1     |
| `src/components/charts/StabilityPanel.vue`        | 1     |
| `src/components/charts/AnalysisChartPanel.vue`    | 1     |
| `src/components/charts/ColorDebugStrip.vue`       | 1     |
| `src/components/charts/AnalysisTimelinePanel.vue` | 1     |
| **Total**                                         | **24**|

24 `var(--tracking-{tight|default|wide})` usages now in the
codebase; zero literal `letter-spacing: <num>em` declarations
remain in `src/`.

### Sweep methodology — script-driven

Following the established Tier-2 pattern, the sweep used a small
Python script (`/tmp/letter-spacing-sweep.py`, transient).
Single-pass; no straggler-detection needed because every value
is in or adjacent to the dominant cluster.

## Tier-2 arc — closed

The four scale substrates land sequentially:

| PR     | Substrate                                 | Sites swept | Tiers |
|--------|-------------------------------------------|------------:|------:|
| #102   | Spacing scale                             | ~174        | 4     |
| #103   | Font-size scale                           | 159         | 4     |
| #104   | Border-radius scale                       | 76          | 2     |
| **#105** | **Letter-spacing scale (Tier-2 closer)** | **24**     | **3** |
| **Tier-2 total**                                  | **~433** | — |

Plus the Tier-1 trio (#99 z-index, #100 durations, #101
geometry) — 36 sweep sites — for the full Pass-2 substrate
total of ~469 sites consolidated into theme.css's vocabulary.

Remaining audit work:
- **Tier 3** — small substrates: disabled-alpha, color-mix
  alpha scale, URL paths, ponder-cap visit count, modal-width
  (each ~1 small PR's worth).
- **Tier 4** — inline-justification sweep: establish the
  `magic-literal:` comment convention codebase-wide; sweep the
  remaining one-off literals (1/2/3/5 px spacing stragglers,
  radius stragglers, the 60ms PV-stone fade, the band-3 domain
  multipliers, etc.). The audit's deliverable.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed.
- `rg -n 'letter-spacing\s*:\s*[\d.]+em' src/`: zero hits.
- `rg -n 'var\(--tracking-' src/ | wc -l`: 24 — every swept
  site reads through the substrate.
- ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007: all
  satisfied (per the established Tier-2 pattern).
- theme.css now at 234 lines (was 213); well under any size
  budget.

## License

Public Domain (The Unlicense).
