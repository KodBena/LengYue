# Theme substrate — A1: land theme.css

- **Status:** Shipped on `frontend/theme-substrate`, 2026-05-02.
  `npm run build` (vue-tsc + vite) passes; `--surface-0` and
  `--accent-primary` confirmed in the production CSS bundle.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A1 of the A1–A4 arc.
- **Date:** 2026-05-02.

## Context

`docs/notes/frontend-theming-plan.md` (drafted 2026-05-02) surveys
~60 distinct chrome color literals scattered across `style.css`,
`palettes.css`, SFC `<style>` blocks, inline template styles, and
TS chart adapters, with the cyan accent (`#4aaef0`) appearing
~88 times alone. The plan reframes this as an ADR-0005 Rule 1
failure (single source of truth per nominal handle) applied to
color, and proposes a 16-anchor substrate plus a phased sweep.

This worklog records A1: the substrate file alone. No consumer
change yet — A2 (sweep `style.css`), A3 (sweep SFC `<style>`
blocks), and A4 (sweep TS chart adapters via a `themeColor()`
helper) are the next steps. The user explicitly scoped this arc
to the structural close only — no theme replacement, no value
edits beyond the within-JND collapse the SSOT contract requires.

## Decisions taken in session

1. **Plan's recommended values, verbatim.** The 16 anchors take
   the values from the plan's "Default values" section (lines
   256–285). One anchor (`--border-1: #2a2a2a`) doesn't match any
   actual surveyed literal — it's between `#1f1f1f` and `#333` —
   noted for tuning at sweep time if it reads wrong on screen.
2. **theme.css owns chrome only.** Domain colors (board, stones,
   ownership) stay in `src/engine/constants.ts`; visualization-
   system anchors stay in `src/engine/suggestion-colors.ts`.
   Hoisting the stone gradients out of `BoardDisplay.vue`'s
   inline template is structural cleanup but distinct from the
   chrome substrate; deferred (likely as part of A3 or its own
   small PR).
3. **Wire-in via App.vue's `<style>` block.** App.vue already
   has two `@import` statements for `style.css` and `palettes.css`;
   adding `@import "./assets/css/theme.css";` as the first line
   keeps every chrome import cohesive in one place. Cascade order:
   theme.css first (so any later rule can override an anchor),
   then style.css and palettes.css.

   Alternative considered: import via `main.ts`. The empty
   placeholder `src/style.css` (0 bytes) imported by `main.ts`
   could have been used as a host. Rejected — the empty file is
   already vestigial; adding content would be more confusing
   than a one-line addition to App.vue.

## What landed

Two files touched.

- **`src/assets/css/theme.css`** (new, 56 lines) — ADR-0006
  header naming the file's role, the SSOT contract boundaries,
  and the design-note reference. Single `:root` block with the
  16 anchors and 6 chart-derived helpers. The chart helpers are
  pure aliases (`var(--surface-2)` etc.); they introduce no new
  decisions but give chart sites a name to read against.
- **`src/App.vue`** (1 line added at line 458) — `@import
  "./assets/css/theme.css";` prepended to the existing import
  block. No other change.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- The CSS bundle (`dist/assets/index-_9o3t_0z.css`) contains
  the theme.css declarations: `--surface-0:#000` and
  `--accent-primary` both appear in the minified output.
- No consumer reads from these vars yet, so visual rendering is
  bit-identical to pre-A1. (Verified by reasoning, not by smoke
  test — there is nothing to look at until A2 starts the sweep.)

## ADR compliance

- **ADR-0006:** the new file carries the standard header
  (pathname + purpose + license).
- **ADR-0004:** App.vue touched under partial visibility, but
  the change is a single import line in a `<style>` block,
  which is the "minimal touch the type-checker / linter would
  flag" shape.
- **ADR-0002:** the `themeColor()` helper that A4 introduces
  must throw on missing variable per the plan's Verification
  checklist; recorded for the A4 worklog rather than this one.
- **ADR-0005 Rule 1:** substrate is the SSOT-per-handle
  vehicle; the named rationale is recorded here and will be
  carried into the A2–A4 PR descriptions.

## Next

- **A2** — sweep `src/assets/css/style.css` literals to
  `var(--name)`. Mechanical; one file, ~30 chrome literals to
  resolve. After A2, the dev server's first-paint chrome
  reads from theme.css.
- **A3** — sweep SFC `<style>` blocks. The bulk of the chrome
  decisions live here; expect this to be the largest of the
  four PRs and possibly to split.
- **A4** — sweep TS chart adapters via a new
  `src/utils/theme-color.ts::themeColor()` helper. Closes the
  SSOT contract.
- **B (separate decision, deferred).** Whether to replace the
  defaults in theme.css or add an `html.theme-X` variant class
  for theme switching. The user has parked this — substrate
  first, theme later.

## License

Public Domain (The Unlicense).
