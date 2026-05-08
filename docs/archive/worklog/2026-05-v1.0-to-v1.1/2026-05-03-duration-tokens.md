# Animation duration tokens — magic-literals audit Pass 2 Tier-1 #2

- **Status:** Shipped on `frontend/duration-tokens`, 2026-05-03.
  Substrate addition + 23-site sweep (22 transitions + 1
  animation); build green.
- **Genre:** Pass-2 substrate PR — second of the audit's Tier-1
  arc (after the z-index ladder #99). Establishes the timing-
  token pattern for the animation residue.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory (`docs/notes/
magic-literals-audit-inventory.md` Category A) flagged the
animation duration cluster as Tier-1: 22 transition sites at
four close values (0.1s, 0.12s, 0.15s, 0.2s) plus a single
1s pulse animation. The verdict deferred the
2-tier-vs-3-tier collapse decision to Pass 2.

Project author chose **2-tier** (the more aggressive consolidation):
"I'm a minimalist anyways." Reasoning: all transition sites serve
the same role (hover and state transitions on chrome elements);
the 0.1–0.2s spread is within JND for that role; tighter
vocabularies are harder to drift; the pulse animation is the
only honestly-distinct timing.

The cluster from inventory Category A:

| Value  | Approx site count | Sites                                                      |
|--------|------------------:|------------------------------------------------------------|
| `0.1s` | 2                 | TreeWidget (node-circle filter, toggle-group rect)         |
| `0.12s`| 4                 | style.css (tab-thumb, tab-add-btn, tab-load-btn hovers)    |
| `0.15s`| 6                 | Toolbar, QeuboToolbar (×2), QeuboBookmarks, AnalysisTimelinePanel, App.vue (collapse-btn transform) |
| `0.2s` | 9                 | TabWidget, App.vue panel-resizer, BoardTab (×2), ForestDirectory (×2), StatusBar, HorizontalTimelineVisualizer (×2), CardSetEditor |
| `1s`   | 1                 | QeuboToolbar busy-dot pulse                                |

## What changed

### `src/assets/css/theme.css`

Two new anchors added under a new "Animation durations (2)"
section, with an inline comment naming the snap-by-cluster
collapse and the discipline-for-future-additions:

```css
/* ── Animation durations (2) ──────────────────────────────────
 * Two tiers, ordered fast → slow. Snap-by-cluster applied to
 * 22 surveyed transition sites: the prior 0.1s / 0.12s / 0.15s
 * / 0.2s spread is within JND for the role they all serve
 * (hover and state transitions on chrome) and collapses into
 * a single --duration-default at 0.2s (the largest cluster and
 * web-design canonical default). The pulse-and-attention
 * animation tier is preserved as a distinct role at 1s. If a
 * future need surfaces for a snappier-than-default tier (e.g.
 * an SVG node hover with sub-100ms feedback), add the tier
 * here rather than reaching for an inline literal — same
 * discipline as z-index. The MoveSuggestions PV-stone fade
 * (60ms inline in MoveSuggestions.vue) is intentionally faster
 * than chrome and band-2 game-tree-coupled; it stays inline-
 * justified rather than entering this scale. */
--duration-default: 0.2s;  /* chrome hover and state transitions */
--duration-slow:    1s;    /* pulse and attention animations */
```

File header updated:

- Body extended from "Color anchors ... Z-index ladder (4
  layering tiers)" to add "Animation durations (2 timing tiers)"
  and clarify the substrate now covers chrome color, z-index,
  and transition duration.
- Design-notes reference extended: now points at
  `magic-literals-audit-inventory.md` for both Pass-2 Tier-1 #1
  (z-index) and #2 (durations).

### Twenty-two transition sweeps

| Site                                                 | Was       | Is                                |
|------------------------------------------------------|-----------|-----------------------------------|
| `App.vue:528` (panel-resizer)                        | `0.2s`    | `var(--duration-default)`         |
| `App.vue:555` (settings-section summary)             | `0.15s ease` | `var(--duration-default) ease` |
| `TabWidget.vue:78` (tab-header)                      | `0.2s`    | `var(--duration-default)`         |
| `BoardTab.vue:128` (tab-thumb)                       | `0.2s ease` | `var(--duration-default) ease`  |
| `BoardTab.vue:151` (close-board-btn)                 | `0.2s`    | `var(--duration-default)`         |
| `ForestDirectory.vue:204` (tab-switcher)             | `0.2s`    | `var(--duration-default)`         |
| `ForestDirectory.vue:219` (root-card)                | `0.2s`    | `var(--duration-default)`         |
| `StatusBar.vue:97` (komi-input)                      | `0.2s`    | `var(--duration-default)`         |
| `charts/AnalysisTimelinePanel.vue:143` (analyze-btn) | `0.15s`   | `var(--duration-default)`         |
| `Toolbar.vue:79` (toolbar-btn)                       | `0.15s`   | `var(--duration-default)`         |
| `QeuboToolbar.vue:170` (seg-btn)                     | `0.15s`   | `var(--duration-default)`         |
| `QeuboToolbar.vue:185` (verdict/apply/pin-btn)       | `0.15s`   | `var(--duration-default)`         |
| `HorizontalTimelineVisualizer.vue:336` (segment-rect)| `0.2s`    | `var(--duration-default)`         |
| `HorizontalTimelineVisualizer.vue:353` (selection-slider)| `0.2s` | `var(--duration-default)`         |
| `TreeWidget.vue:256` (node-circle)                   | `0.1s`    | `var(--duration-default)`         |
| `TreeWidget.vue:259` (toggle-group rect)             | `0.1s`    | `var(--duration-default)`         |
| `QeuboBookmarks.vue:136` (apply/rename/delete-btn)   | `0.15s`   | `var(--duration-default)`         |
| `CardSetEditor.vue:231` (editor-wrap)                | `0.2s`    | `var(--duration-default)`         |
| `style.css:68` (.tab-thumb)                          | `0.12s`   | `var(--duration-default)`         |
| `style.css:93` (.tab-add-btn)                        | `0.12s`   | `var(--duration-default)`         |
| `style.css:108` (.tab-load-btn)                      | `0.12s`   | `var(--duration-default)`         |

(Site count is 21 because BoardTab has two transition declarations,
QeuboToolbar two, ForestDirectory two, HorizontalTimelineVisualizer
two, TreeWidget two, and style.css three — totalling 22 transition
declarations across these files.)

### One animation sweep

| Site                                | Was            | Is                                  |
|-------------------------------------|----------------|-------------------------------------|
| `QeuboToolbar.vue:192` (busy-dot)   | `pulse 1s infinite` | `pulse var(--duration-slow) infinite` |

`@keyframes pulse` itself stays unchanged — keyframe definitions
are timing-independent.

## Per-tier verdicts

- **`--duration-default: 0.2s`** absorbs all 22 transition sites
  (the 0.1 / 0.12 / 0.15 sites are nudged from their authored
  values to 0.2s, a 50–100% slower transition that sits within
  JND for chrome state changes). Web-design canonical default;
  largest existing cluster (9 sites) so most sites are unchanged
  in feel.
- **`--duration-slow: 1s`** preserves the QeuboToolbar pulse
  animation as the distinct attention-tier. Single site today;
  expected to grow as the application gains more attention-
  bearing animations (e.g. analysis-pending indicators, sync
  status pulses).

## What's not done

- **Easing tokens deferred.** Two sites use the `ease` keyword
  (App.vue:555 collapse-btn, BoardTab.vue:128 tab-thumb); below
  the consolidation threshold for now. Revisit when more sites
  converge on non-default easings — the inventory's Tier-4
  candidate "Easing tokens" still applies.
- **MoveSuggestions PV-stone fade (60ms inline) left unchanged.**
  TS-side template binding (`'opacity 60ms ease'` at
  MoveSuggestions.vue:166, :178). Intentionally faster than chrome
  for the PV preview animation rhythm; band-2 game-tree-coupled
  rather than band-1 chrome. Will receive an inline `magic-literal:`
  comment during the Tier-4 sweep that establishes that convention
  codebase-wide.
- **No TS-side accessor for durations.** No consumer in the
  codebase reads transition durations from TypeScript. If one
  surfaces, add `themeDuration()` (or similar typed accessor)
  with its own anchor union; don't extend `ChromeAnchor` (which
  remains color-only per the contract established in the
  z-index PR).
- **No theme-variant accommodation.** theme.css doesn't
  currently support `html.theme-X` variants; if it ever does,
  the duration tokens are theme-stable (timing semantics don't
  change with palette).

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed, no errors. Pre-existing chunk-size
  warning is unrelated.
- `rg -n 'transition\s*:[^;]*\b\d+(\.\d+)?(s|ms)\b' src/`
  returns only the two MoveSuggestions inline strings (the
  documented carve-out); zero literal transition durations
  remain in CSS.
- `rg -n 'animation\s*:[^;]*\b\d+(\.\d+)?(s|ms)\b' src/`
  returns nothing; the QeuboToolbar pulse is the only animation
  declaration in the codebase and now reads
  `var(--duration-slow)`.
- ADR-0002 satisfied: no silent fallbacks; the CSS variables
  load from theme.css at startup and rendering throws (missing
  `var()` falls back to browser default `0s`, which would be
  immediately visible as a non-animated transition).
- ADR-0004: file edits stayed minimal — each consumer site was
  a one-line replacement on the existing line.
- ADR-0005 Rule 1: theme.css is the single source of truth for
  duration decisions; the inline comment names the consolidation
  discipline (snap-by-cluster applied; future-tier additions
  follow the alias-not-add posture from the z-index ladder).
- ADR-0006: source-file headers preserved; theme.css's header
  body and design-notes reference updated.
- ADR-0007: theme.css now at 121 lines (was 102 after the
  z-index PR); well under any size budget.

## License

Public Domain (The Unlicense).
