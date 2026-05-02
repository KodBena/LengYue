# HorizontalTimelineVisualizer gradient fix

- **Status:** Shipped on `frontend/timeline-gradient-fix`,
  2026-05-02. `npm run build` passes.
- **Genre:** Worklog entry — bug fix.
- **Date:** 2026-05-02.

## Context

User-flagged during review of the color theming substrate work:
the rug-plot data gradient in `HorizontalTimelineVisualizer.vue`
was a categorical Tailwind palette (sky-400 / amber-400 /
slate-400 by threshold), not the perceptually-uniform CIELAB
LUT (`getIntensityColorLinear`) that the move-suggestion overlay
and the BoardTab analysis-meter rugplot use. Long-standing
visual bug — the visualizer was visually inconsistent with the
rest of the app's analysis-depth signalling. Surfaced now
because the A3b sweep that walked the file made the
inconsistency legible.

## What changed

`HorizontalTimelineVisualizer.vue` script:

- `getColor(value)` now calls `getIntensityColorLinear.value(value, 1)`
  for non-zero values, returns `'transparent'` for zero (matching
  BoardTab's `visits === 0 → transparent` discipline so unanalyzed
  gaps show through honestly).
- Imports `getIntensityColorLinear` from
  `../engine/suggestion-colors`.

The `processedSegments` computed re-uses `getColor`, so all three
color modes (`global`, `segment-normalized`, `aggregate`)
automatically pick up the LUT.

## Theme-exception comment refresh

The whole-block `theme-exception` on the `<style>` block was
authored in A3b (PR #83) on the (now-retired) premise that the
slate/sky/amber chrome was "co-tuned" with the categorical
`getColor` data colors. The data side is fixed; the comment now
reads as: chrome stands on its own as a band-1 visualizer
aesthetic, sweeping it to the chrome substrate is a separate UX
decision (would lose the slate tint).

## What's not done

- **Sweeping the chrome.** The slate background, slate-700
  border, slate-400 grid lines, sky-400 alpha-modulated selection
  slider, and pink-200 handle bar all stay as literals. The
  theme-exception still covers them but the rationale is now
  "chrome aesthetic standing alone" rather than "co-tuned with
  data palette." Worth a follow-up if the user wants the
  visualizer to visually match BoardTab's `--surface-0`
  rugplot frame; flagged for the substrate-tuning pass.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- The data gradient now uses the same LUT as
  `MoveSuggestions.vue` (overlay) and `BoardTab.vue`
  (analysis-meter rugplot). Visual consistency across the
  three sites where analysis depth is rendered as color.
- Reactive: `getIntensityColorLinear` is a `shallowRef` driven
  by `setIntensityHueShift` (the user's hue-shift slider in
  the Other tab). `processedSegments` is a Vue computed; the
  `.value` read inside `getColor` registers as a dep, so a
  hue-shift change re-runs the computed and re-paints the
  visualizer. Matches BoardTab's behavior.

## License

Public Domain (The Unlicense).
