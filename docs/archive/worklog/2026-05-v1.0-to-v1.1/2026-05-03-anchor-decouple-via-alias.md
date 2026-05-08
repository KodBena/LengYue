# Anchor role overloading — decouple-via-alias

- **Status:** Shipped on `frontend/anchor-decouple-via-alias`,
  2026-05-03. `npm run build` passes.
- **Genre:** Worklog entry — substrate refactor (chrome SSOT
  follow-on); promotes a `deferred-items.md` entry to closure.
- **Date:** 2026-05-03.

## Context

Surfaced 2026-05-02 during A4 of the color theming substrate
arc, when the user noticed `AnalysisChartPanel`'s `.marker-w`
mapped to `var(--state-error)` and `.marker-b` to
`var(--accent-primary)` — chart-series identifiers borrowing
chrome anchors whose names lie about what they cover. Filed in
`docs/notes/deferred-items.md` as "Anchor role overloading in
the chrome substrate"; left for the next substrate-tuning pass.

The user prioritised it for this session. Strict scope chosen
(per the dispatch handoff's substrate-tuning candidates list,
which mixed role-overloading with missing-variant gaps and one
band-decision question — only role-overloading is the canonical
"anchor role overloading" problem the deferred-items entry
named).

## Audit pass (15 minutes, mechanical)

For each of the implicated chrome anchors (`--state-error`,
`--state-attention`, `--state-warning`, `--state-success`,
`--accent-primary`, `--accent-secondary`), surveyed every
consumer and checked whether the consumer's semantic role
matches the anchor's name.

**Strict-scope sites confirmed (per deferred-items entry):**

- Player B/W identifiers:
  `src/composables/useEnrichedData.ts:140,145` — Black delta
  `--accent-primary`, White delta `--state-error`.
  `src/composables/useAnalysisProjection.ts:102` — per-point
  dot color via the same overloaded pair.
  `src/components/charts/AnalysisChartPanel.vue:61-62` —
  `.marker-b` / `.marker-w` borders, same pair.
- Review-session lifecycle:
  `src/components/BoardTab.vue:138-140` — `.review-active` →
  `--state-attention`, `.review-intermission` →
  `--state-warning`, `.review-complete` → `--state-success`.

**Surfaced during the audit, not in strict scope:**

- `StatusBar.vue:115-116` — turn-indicator B = `--accent-primary`,
  W = `--accent-secondary`. NOT overloading; this is the
  codebase's accent pair used for two interactive-state
  indicators (current black turn / current white turn). The
  anchor names cover this usage. Left alone.
- `App.vue:331` — review-state ternary: `--accent-secondary`
  for `FINISHED`, `--state-attention` otherwise. Inconsistent
  with `BoardTab.vue`'s `.review-complete` (which uses
  `--state-success`). Surfaced as a separate concern; filed
  to `deferred-items.md` as "Review-state convention
  inconsistency between App.vue and BoardTab.vue" for
  explicit resolution.

## What changed

### `src/assets/css/theme.css`

Five role aliases added in a new section after the
chart-derived helpers:

```css
--player-black: var(--accent-primary);
--player-white: var(--state-error);
--review-active:       var(--state-attention);
--review-intermission: var(--state-warning);
--review-complete:     var(--state-success);
```

Section comment names the principle (decouple-via-alias) and
points to `docs/notes/frontend-theming-plan.md` "Substrate
evolution" as the canonical principle reference.

### `src/utils/theme-color.ts`

`ChromeAnchor` literal union extended with the five new role
aliases per the file's existing SSOT lockstep discipline
(theme.css is the source of truth; the union is a hand-derived
mirror). Header comment refreshed: anchor count updated from
~22 to ~25, threshold for codegen revisit (~50) unchanged.

### Consumer sweep

Four files updated, each a localised swap of `var(--<chrome>)`
for `var(--<role-alias>)` (CSS) or
`themeColor('--<chrome>')` for `themeColor('--<role-alias>')`
(TS):

- `src/composables/useEnrichedData.ts:140,145`
- `src/composables/useAnalysisProjection.ts:102`
- `src/components/charts/AnalysisChartPanel.vue:61-62`
- `src/components/BoardTab.vue:138-140`

### `docs/notes/frontend-theming-plan.md`

New top-level section "Substrate evolution
(post-implementation)" recording two settled-direction
principles for any future substrate-tuning PR:

- **Decouple-via-alias for implicit handles** — the principle
  this PR applies. Worked example documented; principle
  generalises to typography / spacing / animation / z-index
  when those SSOT refactors arrive.
- **Color-mix derivation over multi-tone anchor families** —
  prefer one base anchor plus CSS-side `color-mix()` at the
  use site over three new anchors per role variant. Settles
  several "missing-variant" candidates that surfaced during
  the 2026-05-02 substrate sweep (muted-cyan action variants,
  lightened-accent hover, muted-state-error surfaces) into
  "leave as theme-exception" or "introduce one base anchor +
  color-mix derivation," not new multi-tone families.

### `docs/notes/deferred-items.md`

- "Anchor role overloading in the chrome substrate" moved to
  the Closed items section with a closure note pointing to
  this PR, the worklog, and the TODO Completed row.
- New entry "Review-state convention inconsistency between
  App.vue and BoardTab.vue" added to Open items per the audit
  finding above.

### `docs/TODO.md`

New row added to Frontend Completed table summarising the
work, naming the two settled-direction principles, and
referencing the audit follow-on.

## Visual effect

None. Each new role alias initially holds the same value as
the chrome anchor it replaces (`--player-white` =
`var(--state-error)`, etc.), so every swept site renders
exactly as before. The change is structural — the SSOT
contract gains honest handles for implicit roles, future
tuning can break the aliasing without disturbing chrome.

## What's not done

- **App.vue review-state ternary** is not swept. Whether
  App.vue's `FINISHED` indicator is conceptually "review-
  complete" (in which case the new `--review-complete` alias
  applies and the orange `--accent-secondary` is the
  inconsistency to fix) or a different indicator entirely
  (in which case it deserves its own anchor) is a UX call,
  not an audit one. Filed to `deferred-items.md`.
- **Missing-variant candidates from the 2026-05-02 sweep**
  (muted-state-error surfaces, muted-cyan action-button
  variants, lightened-accent hover) are NOT addressed. The
  "Substrate evolution" section settles their direction —
  one base anchor + `color-mix()` rather than multi-tone
  families — but applying that direction to those specific
  sites is separate work (theme-exception zones already cover
  them today, no urgent fix).
- **The Tailwind semantic indicators in `RegistryEditor.vue`**
  (band-2 question, "edited" amber and "symbolic reference"
  pink) are NOT addressed. Different shape from
  role-overloading; deferred for a separate band-1-vs-band-2
  decision when prioritised.

## Verification

- `npm run build` passes; `vue-tsc -b` clean (the
  `ChromeAnchor` extension catches any caller of
  `themeColor` that uses an unknown name — none surfaced),
  `vite build` clean.
- No browser-side visual verification this session — hand off
  to HMR per the established cadence. Visual regression risk
  is bounded to "are the alias resolutions correct" since
  every consumer's value is unchanged at evaluation time.
- ADR-0005 Rule 1 satisfied: each implicit role now has a
  single source of truth (the alias declaration in
  `theme.css`), cross-referenced from `theme-color.ts`'s
  `ChromeAnchor` union. The `frontend-theming-plan.md`
  "Substrate evolution" section is the canonical reference
  for both the decouple-via-alias and color-mix principles;
  no other document duplicates them.

## License

Public Domain (The Unlicense).
