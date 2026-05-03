# Disabled-state alpha — magic-literals audit Pass 2 Tier-3 #1

- **Status:** Shipped on `frontend/disabled-alpha`, 2026-05-03.
  Substrate addition + 5-site sweep across 4 files; build green.
  Opens the Tier-3 small-substrate arc.
- **Genre:** Pass-2 substrate PR — first of the audit's Tier-3
  small substrates after the Tier-1 trio and Tier-2 scale-substrate
  arc closed (PR #105).
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category C.1)
identified the disabled-state opacity cluster: 5 sites at three
close values (0.35 ×1, 0.4 ×2, 0.5 ×2) all serving the same role
(buttons in `:disabled` state get visually faded). Clean SSOT
candidate — same role across all sites, no straggler concerns.

Project-author-chosen target value: **0.5** (the most common
existing value, web-design conventional default for disabled UI
elements). Tradeoff acknowledged: the 0.35 and 0.4 sites raise
to 0.5 (less faded), making the disabled state read slightly
more subtly. If too subtle in HMR, lower to 0.4 in the substrate
without disturbing consumers.

## What changed

### `src/assets/css/theme.css`

One new anchor added under a new "Disabled-state alpha (1)"
section:

```css
/* ── Disabled-state alpha (1) ────────────────────────────────
 * Single anchor for the disabled-button alpha role. Snap-by-
 * cluster collapses 5 surveyed :disabled sites at three
 * close values (0.35 / 0.4 / 0.5) into one tier at 0.5 — the
 * most common existing value and the web-design conventional
 * default for disabled UI elements. The 0.4 sites raise 0.1
 * (disabled state reads slightly less faded); the 0.35 site
 * raises 0.15 (same direction). If "less faded" reads as not
 * obviously-disabled-enough in a future tuning pass, lower
 * to 0.4 here without disturbing consumers. */
--alpha-disabled: 0.5;
```

File header updated to acknowledge the substrate now covers
color, z-index, durations, spacing, font-size, border-radius,
letter-spacing, and "disabled-state alpha (1 anchor)."

### Five sweep sites

| Site                                           | Was         | Is                                |
|------------------------------------------------|-------------|-----------------------------------|
| `charts/AnalysisTimelinePanel.vue:146`         | `0.35`      | `var(--alpha-disabled)`           |
| `LoginModal.vue:188`                           | `0.5`       | `var(--alpha-disabled)`           |
| `MintCardModal.vue:345`                        | `0.5`       | `var(--alpha-disabled)`           |
| `QeuboToolbar.vue:183`                         | `0.4`       | `var(--alpha-disabled)`           |
| `QeuboToolbar.vue:187`                         | `0.4`       | `var(--alpha-disabled)`           |

`@keyframes pulse` at `QeuboToolbar.vue:193` (`opacity: 0.4` in
its low-amplitude trough) is **not** part of this cluster — it's
a distinct role (animation envelope, not disabled state) and
stays literal. Will receive a `magic-literal:` comment in the
Tier-4 sweep.

## What's not done

- **Pulse keyframe alpha (0.4 trough)** at QeuboToolbar:193 —
  different role, deferred to Tier-4 inline-justification.
- **BaseChart axisPointer 0.5** — different role (chart
  visualization, not disabled state); deferred to Tier-4.
- **Decoration-alpha cluster** (rgba 0.1 / 0.2 / 0.3 / 0.5 / 0.8
  in HorizontalTimelineVisualizer, ColorDebugStrip, etc.) — this
  is the inventory's Category C.3 partial-cluster candidate; if
  the user wants a `--alpha-faint` / `--alpha-low` / `--alpha-medium`
  scale, that's a separate Tier-3 substrate.
- **color-mix percentages** (5/10/15/30/40/80% as alpha-modulation
  arguments) — inventory's Category K. CSS interpolation rules
  mean `color-mix(... var(--alpha-faint) ...)` works but the
  consolidation might be over-specification. Separate Tier-3
  substrate if pursued.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes.
- `rg -n 'opacity\s*:\s*0\.(35|4|5)\s*;' src/`: returns only
  the QeuboToolbar pulse keyframe (correctly preserved as
  different-role).
- `rg -n 'var\(--alpha-disabled\)' src/`: 5 sites — every swept
  consumer reads through the substrate.
- ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007: all
  satisfied.
- theme.css now at 248 lines (was 234); well under any size
  budget.

## License

Public Domain (The Unlicense).
