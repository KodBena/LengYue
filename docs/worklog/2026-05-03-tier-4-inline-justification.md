# Tier-4 inline-justification sweep — magic-literals audit closer

- **Status:** Shipped on `frontend/tier-4-inline-justification`,
  2026-05-03. Convention codification + 25-site curated sweep
  across 13 files; build green. **Closes the magic-literals
  audit.**
- **Genre:** Audit-closer PR — the second half of the audit's
  contract (substrate-or-comment), applied to the curated
  residue surfaced during the substrate work and codifying the
  `magic-literal:` comment convention for forward authoring.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's contract is two-sided: every literal
in the codebase either lives in a named constant in a documented
location (substrate side — closed across nine PRs in Tiers 1-3:
#99 z-index, #100 durations, #101 geometry, #102 spacing, #103
font-size, #104 border-radius, #105 letter-spacing, #106
disabled-alpha, #107 ponder-cap) OR carries an inline comment at
the use site explaining its presence (this PR — Tier-4).

Comprehensive codebase-wide retroactive application of the
inline-justification convention is impractical (would require
commenting hundreds of literals across the codebase, many of
which are trivial). The honest Tier-4 close-out is **convention
codification + curated residue sweep + a forward-discipline
expectation**.

## What changed

### `docs/notes/magic-literals-audit-plan.md`

New top-level section: **"Comment convention — the inline-
justification escape hatch"**. Four subsections:

1. **Syntax** — CSS-side `/* magic-literal: <reason> */` placed
   immediately before the rule containing the literal; TS-side
   `// magic-literal: <reason>` placed on the line immediately
   above the literal's use.
2. **Threshold** — "could a future reader reasonably ask where
   this came from?" Carve-outs for trivial literals (loop bounds,
   boolean-equivalents, mathematical identities), universal CSS
   vocabulary (`0`, `0px`, `0%`, `0rem` resets; `100%` /
   `100vh` / `100vw` fill-parent; `1px` hairline borders),
   block-level theme exceptions (already carry a `theme-exception`
   comment), generated files (OpenAPI projections), and typed
   discriminated-union members (the literal IS the named handle).
3. **Distinction from theme-exception** — both conventions
   satisfy the audit's contract; `theme-exception:` is the
   color-substrate-specific version, `magic-literal:` is the
   broader convention applied to all non-color literals.
4. **Authoring discipline going forward** — future PRs are
   responsible for `magic-literal:` comments on any new literals
   they introduce; the audit's Tier-4 sweep applied the
   convention to the curated residue, but comprehensive
   codebase-wide application is a steady-state authoring habit,
   not a one-shot retroactive sweep.

Plan's status header updated from "Pass 1 inventory filed,
Pass 2 in flight" to **"Closed 2026-05-03"** with the full
nine-PR substrate breakdown and the Tier-4 close-out summary.

### `docs/notes/magic-literals-audit-inventory.md`

Status header extended: "Pass 2 closed 2026-05-03 across nine
substrate PRs and a Tier-4 inline-justification sweep. The
audit's contract is satisfied."

### Curated residue sweep — 25 inline `magic-literal:` comments

Applied to specific deferred items surfaced during the audit's
substrate work. By category:

**Spacing / border-radius stragglers (5 sites):**
- `BoardTab.vue:165` — `.analysis-meter { border-radius: 1px }` (hairline rounding on a 4px-tall element, below substrate's smallest tier).
- `BoardTab.vue:149` — `.close-board-btn { top: -6px; right: -6px }` (close-button absolute offset hand-tuned to the tab-thumb corner).
- `BoardTab.vue:118` — geiger-dot `transform: scale(${0.6 + energy * 0.4})` (hand-tuned scale-range derivation).
- `HorizontalTimelineVisualizer.vue:380` — `.handle-bar { border-radius: 9999px }` (pill-shape "max-out radius" idiom; substrate `--radius-circle: 50%` would require knowing aspect).
- `Toolbar.vue:79` — `.toolbar-btn { padding: 1px 5px }` (toolbar-button compactness; tighter than substrate `--space-tight`).

**Modal widths (3 sites):**
- `ConfirmLoadModal.vue:74` — 420px (paired with MintCardModal).
- `MintCardModal.vue:266` — 420px (same design).
- `LoginModal.vue:156` — 360px (narrower auth form).

**Animation-envelope alphas (2 sites):**
- `QeuboToolbar.vue:193` — `@keyframes pulse { ... opacity: 0.4 ... }` trough (animation envelope, distinct role from `--alpha-disabled: 0.5`).
- `charts/BaseChart.vue:150` — `axisPointer { opacity: 0.5 }` (chart visualization, distinct role).

**Band-3 domain decisions (3 sites):**
- `BoardWidget.vue:34` — `Math.min(0.85, mag * 0.85)` ownership ceiling-and-multiplier (Go-bound visualization).
- `BoardWidget.vue:49` — `opacity: 0.95` liveness display (Go-bound).
- `charts/BaseChart.vue:71` — `range * 0.1` Y-axis margin (chart-visualization padding).

**PV-stone fade (1 site, covering 2 inline values):**
- `MoveSuggestions.vue:155` — `60ms` suggestion-ring/disk fade with reference to `deferred-items.md`'s PV-overlay typography proportions co-tuning entry.

**TS-side timers (6 sites):**
- `services/analysis-service.ts:67` — `1000ms` watchdog interval (engine-status display cadence).
- `services/analysis-service.ts:220` — `0.15` / `0.5` reportDuringSearchEvery (KataGo wire-protocol mode-specific cadence).
- `charts/BaseChart.vue:275` — `100ms` ECharts init delay (container-layout race-window).
- `charts/HeatmapChart.vue:133` — `100ms` ECharts init delay (same pattern).
- `MintCardModal.vue:121` — `150ms` suggestions-hide delay (mousedown timing).
- `useEChartsForestRender.ts:117` — `50ms` render-retry (next-tick equivalent).
- `use-pv-animation.ts:208` — `1ms` next-tick scheduler (defers visibility flip out of synchronous batch).

**Domain thresholds (1 site, paired with related fallback):**
- `store/defaults.ts:53` and `:57` — `999` user_order fallback (palette stdlib's "treat-missing-userMove-as-worst-rank" convention).

Plus one previously-deferred MoveSuggestions edit needed correction during the sweep: `<style="...">`-bound block comments containing double quotes confused Vue's template parser ("Unterminated comment" SyntaxError). Resolved by moving the `magic-literal:` comment from inside the `:style` value to an HTML comment above the element. Methodology lesson: prefer HTML comments above the element for inline-styled template attributes; CSS block comments work in `<style>` blocks; TS line comments work in script blocks.

### Files touched

13 source files (the 25 sites' homes) + 3 doc files
(`magic-literals-audit-plan.md`, `magic-literals-audit-inventory.md`,
`docs/TODO.md`).

## What's not done

- **Comprehensive codebase-wide retroactive sweep.** Out of
  scope per the codified "Authoring discipline going forward"
  subsection — covering every literal in the codebase would
  require ~hundreds of comments and offers diminishing returns
  beyond the curated residue. Future PRs are responsible for
  maintaining the convention on new literals.
- **Two third-pattern deferred items remain open** in
  `deferred-items.md`: PV-animation defaults pairwise
  calibration (use-pv-animation.ts ↔ defaults.ts) and
  PV-overlay typography proportions co-tuning. These are not
  audit-class instances; they're "co-tuned constants" — a third
  pattern beyond snap-by-cluster and decouple-via-alias that
  the audit's framework caught and surfaced for future
  investigation.
- **Backend literals.** The plan deferred backend scope; this
  audit is frontend-only.
- **URL paths and color-mix alpha percentages.** Inventory
  Categories P (URL paths) and K (color-mix alpha) were
  re-evaluated during Tier-3 and judged thin substrate
  candidates (each path has one consumer, color-mix
  percentages are mostly genuine design decisions not drift).
  Skipped per the audit's "does not introduce constants for
  values used once" carve-out.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes.
- `rg -no 'magic-literal:' src/ | wc -l`: 25 — every curated
  site carries the convention.
- ADR-0002 (fail loudly): substrate values throw on missing
  CSS variable; inline-justified sites preserve the original
  literal value, so no behavioral change.
- ADR-0004 (minimal-touch): each comment edit is a single
  comment-line addition above the existing line; no surrounding
  rules touched.
- ADR-0005 Rule 1 (single SSOT per nominal handle): satisfied
  via the substrate side of the contract; the inline-justified
  sites are explicitly N=1 local decisions per the plan's
  "does not introduce constants for values used once" carve-out.
- ADR-0005 Rule 6 (author as you decide): codified via the
  "Authoring discipline going forward" subsection.
- ADR-0006 (source-file headers): no source files newly created.
- ADR-0007 (file-size budgets): no source file grew past any
  budget.

## Audit close-out summary

The magic-literals audit closes with:

- **Pass 1 (inventory)** filed PR #98 — repo-wide scan, ~14
  categories, 9-PR Tier-2 sequencing recommended.
- **Pass 2 substrates (Tiers 1-3)** closed across nine PRs:
  - Tier 1: z-index ladder #99 (8 sites), animation durations
    #100 (23 sites), geometry ratios #101 (5 sites).
  - Tier 2: spacing #102 (~174 sites), font-size #103 (159
    sites), border-radius #104 (76 sites), letter-spacing #105
    (24 sites).
  - Tier 3: disabled-alpha #106 (5 sites), ponder-cap #107
    (3 sites).
  - **Substrate total: ~477 sites consolidated into 17 anchors
    across `theme.css` + 3 named constants in
    `engine/constants.ts`.**
- **Pass 2 Tier-4 (inline justification)** closed in this PR:
  convention codified in audit plan, curated residue swept
  with 25 `magic-literal:` comments.
- **Two deferred-items entries** carry forward the third-pattern
  observations (PV-animation defaults pairwise calibration;
  PV-overlay typography proportions co-tuning).
- **Forward discipline:** future PRs maintain the convention
  on new literals they introduce. Comprehensive retroactive
  application is explicitly out of scope.

The audit's contract — every literal substrate-or-justified — is
satisfied within the curated scope.

## License

Public Domain (The Unlicense).
