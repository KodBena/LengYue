# Theme substrate — A3a: sweep rail/board-list SFCs to var()

- **Status:** Shipped on `frontend/theme-sweep-sfc-rail`, 2026-05-02.
  `npm run build` (vue-tsc + vite) passes; SSOT-grep shows zero
  surviving chrome literals in swept `<style>` blocks except one
  explicit `theme-exception` (geiger-dot indicator).
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3a of the A1–A4 arc. First of six sub-PRs that
  collectively constitute A3 (SFC `<style>` block sweep).
- **Date:** 2026-05-02.

## Context

A1 (PR #80) landed `theme.css`. A2 (PR #81) swept `style.css`.
A3 is the SFC `<style>` block sweep — 30 files, ~325 chrome
literals — split into six sub-PRs by component cluster. This
worklog covers **A3a — sidebar rail / board-list** (5 files,
~24 literals):

- `src/components/SidebarWidget.vue`
- `src/components/TabWidget.vue`
- `src/components/BoardTab.vue`
- `src/components/FloatingThumbnail.vue`
- `src/components/TreeWidget.vue`

## What landed

Five files touched. Each `<style>` block's chrome literals
swept to `var(--name)` references against `theme.css`. SVG
`stroke:` and `fill:` properties inside CSS rules are CSS
properties (not template attributes), so they accept
`var()` — swept normally.

### Notable mappings beyond plan-survey-driven snap

1. **`#111` borders → `var(--surface-1)` (intentional bg-match).**
   SidebarWidget's `border-right: 1px solid #111;` and TabWidget's
   `border-bottom/right: 1px solid #111;` — `#111` exactly
   matches `--surface-1` (the bg of the adjacent panel). The
   border was intentionally invisible / blends into the surface.
   Mapping to `--border-1` (`#2a2a2a`) would have made the
   borders visibly faint, a UX change. Mapping to `--surface-1`
   preserves the bg-match semantic.

2. **State-color shadow alphas → `color-mix`.** BoardTab's
   review-active and review-intermission box-shadows used
   `rgba(255, 74, 74, 0.4)` and `rgba(240, 160, 74, 0.4)` —
   alpha-modulated derivatives of `--state-attention` and
   `--state-warning` respectively. Replaced with
   `color-mix(in srgb, var(--state-...) 40%, transparent)` to
   keep the SSOT honest at the alpha-derivative layer. Visually
   bit-identical (color-mix with `transparent` at 40% =
   alpha-modulation at 40%).

3. **`#444` button bg snapped to `--border-3` per plan survey.**
   Plan §A.A's `--border-3` cluster is `#444, #555`; SidebarWidget's
   `.tab-add-btn` uses `#444` resting / `#555` hover. Both snap
   to `--border-3` per the cluster, collapsing the 17-step hover
   delta. Affordance loss recorded as a future substrate-tuning
   candidate; the button is 20×20px so the practical impact is
   small.

4. **Hover-state direction preserved on `.tab-thumb` / `.tab-label`.**
   Resting `#888` text (`--text-2` cluster) → hover `#fff`
   (`--text-0`). Mapping different anchors preserves the
   brightening on hover that the original code intended.

### Theme exceptions

One inline exception, one carve-out documented at the worklog
level:

- **Geiger-dot `#00ff88`** (BoardTab.vue:51). Vivid cyan-green
  for the activity indicator dot. Outside the muted state-color
  spectrum and not part of the chrome substrate's vocabulary.
  Inline `theme-exception` comment placed on the rule.

- **Pure-black/white rgba literals are substrate-exempt.** A
  repo-wide audit found 14 instances of `rgba(0,0,0,X)` and
  `rgba(255,255,255,X)` — shadows, modal backdrops, stone-
  outline rings on `BoardDisplay.vue`. These function as
  universal CSS decoration vocabulary; they don't carry
  theme-specific meaning, and forcing them through
  `color-mix(in srgb, var(--surface-0) X%, transparent)` would
  add verbosity for no substrate-relevant gain. Documented
  here as a class-level carve-out rather than per-instance
  `theme-exception` noise. Future contributors authoring
  shadows: pure-black/white rgba is fine; state-color or
  surface-tone rgba goes through `color-mix` from the substrate.

### Out of scope (deferred to A4)

Inline template SVG attributes (`<g stroke="#444" />`,
`<circle :fill="..." />`) in TreeWidget.vue's template are
presentation attributes that don't evaluate `var()`. These
need either CSS-class extraction or `themeColor()`-helper
support, which lands with A4's TS-side sweep. A3a only
swept the CSS `<style>` blocks of these files; the
template-inline attributes carry literal hexes deliberately,
covered by A4's scope.

The same deferral applies to any other A3 file with
template-inline SVG `stroke=""` / `fill=""` attributes;
A3 only sweeps CSS `<style>` blocks.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- Repo-wide SSOT grep on swept files shows zero chrome
  literals in CSS `<style>` blocks except the one explicit
  `theme-exception` (geiger-dot).
- Diff: 40 insertions, 37 deletions across 5 files.

## ADR compliance

- **ADR-0006:** existing headers preserved on the SFCs;
  no new files.
- **ADR-0004:** each file read in entirety before edit;
  changes are localized to the `<style>` block contents.
- **ADR-0002:** `theme-exception` comments and the worklog
  carve-out are explicit declarations, not silent
  exceptions.
- **ADR-0005 Rule 1:** every chrome decision in the swept
  files now reads from `theme.css`.

## Next

- **A3b** — charts/visualizations (9 files, ~43 literals).
- **A3c** — editors (3 files, ~58).
- **A3d** — modals/auth (3 files, ~51).
- **A3e** — forest/qeubo/controls (4 files, ~65).
- **A3f** — shell + App.vue (6 files, ~84).
- **A4** — TS chart adapters + template-inline SVG
  attributes via `themeColor()` helper.

## License

Public Domain (The Unlicense).
