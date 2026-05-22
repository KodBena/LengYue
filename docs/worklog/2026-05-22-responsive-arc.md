# Responsive design arc — 23 iters on `feat/responsive`

- **Status:** Closed 2026-05-22; merged into `next` on close-out date.
  Branch `feat/responsive` stays alive for the deferred items
  recorded in `docs/TODO.md`'s "Responsive design — deferred items"
  section.
- **Genre:** Cross-cutting CSS / layout hygiene arc, driven by two
  audit notes filed at the start of the arc and a fresh post-iter-15
  Playwright survey midway through.
- **Date:** 2026-05-22.

## Context

Two static + Playwright audits filed at the start of the day flagged
~30 responsive findings across the SPA's chrome, analysis surface,
Cards tab, and popover layer. The first audit
(`responsive-design-audit-2026-05-22.md`) ran against the
disconnected SPA state; the second
(`responsive-design-audit-iter2-2026-05-22.md`) drove the engine and
captured the analyzing-state geometry that surfaced the
horizontal-collapse pathology in the linear chart panels (Finding A
— chart-area shrinking to 29 px sliver at 1024×768).

The arc worked through the findings interleaved with user-named
discoveries that the audits hadn't reached — palette-dropdown
occlusion in the Cards tab, status-bar text overflow, ECharts
tooltips clipping in the lineage explorer, the move-suggestion
hint resizing the board mid-hover, and a slim-down sweep on chrome
whitespace at the end.

## The arc

23 iterations merged onto `feat/responsive` between commits
`d3c0714` (iter-1's #control-panel pin) and the close-out merge.
Per-iter summary:

- **iter-1** — `#control-panel { min-width: 220px }` so the
  control-panel tab strip stays on-screen at 1024×768. The single
  pin became load-bearing for the rest of the arc.
- **iter-2** — `@container (max-width: 379px)` hides
  `.preview-box` so `.chart-area` claims the full row at narrow
  control-panel widths. (Iter-2 audit Finding A — the user-named
  chart-sliver symptom.)
- **iter-3** — `BaseChart`'s ECharts `grid.left` from `'10%'` to
  `30` (absolute px), sized for the longest y-axis label at fontSize
  9. (Iter-2 audit Finding F.)
- **iter-4** — `.registry-container` max-height `clamp(400px, 60vh,
  800px)` instead of fixed 400 px; Card Sets inline override uses
  `clamp(500px, 70vh, 900px)`. (Iter-2 audit Finding H.)
- **iter-5** — Removed `.chart-container-outer { min-height: 200px }`
  silent conflict with the dashboard's calc-derived height. (Iter-2
  audit Finding C.)
- **iter-6** — Removed 17 dead selectors from `style.css` (347 →
  209 lines). (Iter-1 audit cross-cutting #4.)
- **iter-7** — `FloatingThumbnail` viewport-edge clamp via
  `Math.max(0, Math.min(proposed, viewport - 154))` in `show()`.
  (Iter-1 audit surface-specific.)
- **iter-8/9/10** — Viewport-edge clamp on the three toolbar
  popovers (`ToolbarSliderPopover`, `PboPopover`,
  `EngineQueueTooltip`).
- **iter-11** — Extracted shared `usePopoverEdgeClamp` composable
  consuming the three near-identical implementations.
- **iter-12** — `AnalysisDashboard` parent-relative height via
  `height: 100%` + `min-height: 0` flex chain end-to-end. (Iter-2
  audit Finding B.) Horizontal-axis regression caught and corrected
  in the same iter (`flex-direction: column` on
  `.chart-container-outer`).
- **iter-13** — Toolbar `min-height: 28px` + `flex-wrap: wrap`,
  parent `.top-nav-bar { min-height: 32px }`. (Iter-2 audit
  Finding G.)
- **iter-14** — Three-edit bundle wrapping AnalysisControls
  `.header-row` cluster (palette dropdown, PURGE button, Analyse
  Selection). Multi-pass: first attempt only wrapped the outer row;
  the right-side `<div>` and `.palette-selector` also needed
  `min-width: 0` to participate in the shrink chain. Final principle:
  organic wrap+shrink chains without viewport-specific breakpoints.
- **iter-15** — StatusBar `height: 20px` → `min-height: 20px` so
  the bar grows to fit content (move-badge + bold monospace bigger
  than the 19 px interior at some font/renderer combinations).
- **iter-16/17** — Cards-tab `ForestDirectory` panels stack
  vertically below 480 px container width. Iter-16's first attempt
  had a structural bug — `container-type: inline-size` was on
  `.forest-container` and the `@container` rule tried to style
  `.forest-container { flex-direction: column }` inside its own
  query block. A container query cannot style its own container;
  iter-17 added a wrapper element so `.forest-container` becomes a
  proper descendant of the CQ container.
- **iter-18** — `tooltip.confine: true` on the lineage-explorer's
  ECharts forest render config, matching `BaseChart.vue:261`'s
  precedent. Resolves the user-named "tooltips fall under panes"
  symptom in the Cards tab. Also retrofit `magic-literal:` tags on
  iter-17's 479 px / 40% values.
- **iter-19** — Magic-literal sweep across iter-1..iter-15
  introductions (10 sites tagged). Trigger was the user surfacing
  the codebase's `magic-literal:` no-tolerance convention (per
  `docs/archive/notes/magic-literals-audit-plan.md`) — I had
  written prose comments explaining the values but hadn't used the
  grep-able tag prefix. The corrective extended to the preserved
  values touched in non-trivial ways (32, 28, 20 on the chrome
  bars) and to `DEFAULT_VIEWPORT_MARGIN_PX` in
  `usePopoverEdgeClamp.ts`.
- **iter-20** — `.tree-header` `flex-wrap: wrap` + `row-gap` so
  the lineage-explorer's "Collapse all" button doesn't truncate
  on the right at narrow tree-panel widths.
- **iter-21** — Chrome slim-down sweep: sidebar `108 → 90 px`,
  tree-panel `220 → 140 px`, `#content` padding `space-medium →
  space-tight`, hoisted the `88 px` literal into a scoped
  `--tab-width: 86px` on `.thumb-container` inherited by `.tab-thumb`
  via cascade, removed `.thumb-container`'s `margin-bottom`,
  stripped `.analysis-meter`'s `margin-right` and `border`. ~98 px
  of horizontal real estate reclaimed for the centre column.
- **iter-22** — Shortened the paste-PV hint from "{key}+click or
  middle-click to paste PV" to "{key}+click to paste PV"
  (en.json). Middle-click handler unchanged in code, just absent
  from the visible hint.
- **iter-23** — Replaced the status bar's "Black to play" / "White
  to play" `.turn-indicator` text with an orange (--accent-secondary)
  `box-shadow` ring on the active stone-chip. `box-shadow` takes no
  layout space, so the bar's width pressure drops by ~80–100 px and
  the move-suggestion hint no longer resizes the board mid-hover.
  Active stone-chip carries `:aria-label` so screen readers still
  announce the active player. No transition on the ring per user
  preference.

## Outcomes

**User-visible at the project author's default 3840×2160 viewport:**

- iter-12 fixed a longstanding analysis-dashboard sizing issue (the
  prior `calc(100vh - 165px)` was brittle to any chrome-height
  change). User: "this fixes one of the longstanding issues in the
  SPA."
- iter-18's `confine: true` resolved the lineage-explorer tooltip
  clipping at all viewports.
- iter-21 reclaimed ~98 px of horizontal chrome whitespace for the
  centre column, making the board visibly larger.
- iter-23 stopped the board from resizing on every move-suggestion
  hover.

**User-visible at 1024×768 specifically:**

- Header-row (palette dropdown + PURGE button + Analyse Selection)
  now wraps cleanly instead of clipping off the right edge of the
  220 px control panel (iter-14).
- Cards-tab lineage explorer is now actually visible (was 0 px wide
  pre-iter-17 because the 280 px `.left-panel` ate the entire
  219 px container).
- Three popovers no longer clip against viewport edges (iter-8/9/10).
- Toolbar wraps to multiple rows rather than crushing the metric
  cluster (iter-13).

**Hygiene:**

- 17 dead selectors removed from `style.css` (iter-6).
- 10 magic literals retrofitted with `magic-literal:` tags
  (iter-19) plus iter-18's earlier 479/40%; the responsive arc
  ends with zero untagged literals it introduced. Pre-existing
  untagged literals in files I touched are deferred (recorded in
  TODO.md).
- New composable `usePopoverEdgeClamp` at
  `composables/chrome/usePopoverEdgeClamp.ts` (band 1, with
  `FILES.md` entry).

## Discipline-violations and corrections

Two corrections during the arc that are worth recording for future
sessions:

**Magic-literal discipline.** I introduced ~10 numeric literals
across iter-1..iter-15 with prose comments explaining the values
but without the codebase's `magic-literal:` comment prefix. The
user surfaced this as "no-tolerance policy" mid-arc and required
the iter-19 sweep. The corrective is recorded in memory at
`feedback_magic_literals_no_tolerance.md`.

**Container-query self-reference.** iter-16 set `container-type:
inline-size` on `.forest-container` and tried to style
`.forest-container { flex-direction: column }` inside its own
`@container` query block. A container query can only style
descendants of the queried container — never the container itself
— so the rule never matched, and the user's observed symptom
("the panel didn't stack") was the silent failure. iter-17 fixed
it by adding a wrapper element so `.forest-container` becomes a
proper descendant. Worth carrying forward: container queries
require a strict ancestor-descendant relationship between the
queried container and the styled element.

## Deferred items

Recorded in `docs/TODO.md`'s "Responsive design — deferred items"
section. Briefly: body font 10 px (accessibility), details-open
default UX, board scroll hijacking, several Sev-2 1024×768
findings from the iter-15 mid-arc survey, pre-existing untagged
literals, mobile findings. The `feat/responsive` branch stays
alive for resumption.

## Related files

- `docs/notes/responsive-design-audit-2026-05-22.md` — iter-1
  audit with per-finding resolution section (closure-amended
  2026-05-22).
- `docs/notes/responsive-design-audit-iter2-2026-05-22.md` —
  iter-2 audit with per-finding resolution section
  (closure-amended 2026-05-22).
- `docs/TODO.md` — "Responsive design — deferred items" section
  added under Active.
- `docs/archive/notes/magic-literals-audit-plan.md` — the
  closed audit whose `magic-literal:` convention iter-19
  retrofitted.
- `feat/responsive` branch — kept alive post-merge for deferred
  work.

## License

Public Domain (The Unlicense).
