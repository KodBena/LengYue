# themeColor signature tightened to ChromeAnchor union

- **Status:** Shipped on `frontend/themecolor-typed-anchors`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes.
- **Genre:** Worklog entry — typing follow-on to the color
  theming substrate arc (post-A4).
- **Date:** 2026-05-02.

## Context

User-asked: was it reasonable to well-type
`src/utils/theme-color.ts::themeColor` rather than leaving it at
`(name: string) => string`. The prior signature relied entirely
on ADR-0002's runtime-throw for unknown anchors; typos and
substrate renames surfaced only at first call.

## What changed

`src/utils/theme-color.ts`:

- New exported type `ChromeAnchor` — a literal union over the
  22 anchors declared in `theme.css` (16 base anchors plus 6
  chart-derived helpers), grouped by role with inline comments.
- `themeColor` signature: `(name: ChromeAnchor) => string`
  instead of `(name: string) => string`.
- File header rewritten with an "SSOT discipline" section
  documenting the lockstep relationship between `theme.css`
  (the single source of truth) and `ChromeAnchor` (a
  hand-derived mirror), with explicit playbooks for add /
  rename / remove operations.

The runtime-throw stays — it now covers a smaller failure
surface (mostly: future `html.theme-X { ... }` variants that
forget to override an anchor) but the loud-failure posture is
preserved per ADR-0002.

## What this catches

- **Typos at the call site.** `themeColor('--accenr-primary')`
  is now a TS error, not a runtime throw.
- **Substrate renames.** Renaming `--accent-primary` to
  `--accent-cyan` in `theme.css` requires an analogous
  `ChromeAnchor` edit; every callsite still using the old name
  becomes a TS error in the same build, surfacing the full
  blast radius.
- **Substrate removals.** Same shape: every stale caller
  surfaces.

## What this doesn't catch

- **CSS-side additions that the union misses.** If a
  contributor adds `--player-black` to `theme.css` but doesn't
  update `ChromeAnchor`, callers can't reference the new
  anchor — the unknown-literal TS error gives the "you forgot
  to update the union" signal, but only when the first caller
  appears. Fine for the anticipated change rate.
- **Out-of-band CSS edits.** If `theme.css` is editable through
  some non-source path (a runtime style injection, a future
  user-tunable theme file), the union won't track those. The
  runtime-throw still catches the empty-value case.

## Why not codegen

The OpenAPI codegen pipeline (`npm run gen:api`) is the
codebase's reference shape for "TS type derived from external
SSOT." Could mirror it for theme.css → ChromeAnchor (a
postcss-or-AST parse step). Overkill at 22 anchors with a low
change rate; revisit if the substrate churns more or grows
past ~50 anchors. The hand-maintained union has a documented
discipline (the file header's "Add / Rename / Remove"
playbooks) that absorbs the small drift risk.

## Why not branded types

The output is a plain CSS color string consumed by ECharts /
SVG / inline styles — no downstream consumer benefits from a
brand on the input handle. Plain literal union is the right
tool. (Branded types are useful when an `as` cast at the
construction site is the only place the validity invariant
holds — not the case here.)

## Verification

- `npm run build` passes; vue-tsc clean.
- All existing call sites compile against the new signature
  (every literal I wrote during A4 happens to be in the
  ChromeAnchor union — confirmed mechanically by build).
- Tested by deliberately introducing a typo
  (`themeColor('--surfuce-1')`) locally — TS rejected it as
  expected.

## License

Public Domain (The Unlicense).
