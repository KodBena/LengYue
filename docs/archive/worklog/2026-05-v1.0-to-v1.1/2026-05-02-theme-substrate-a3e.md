# Theme substrate — A3e: sweep forest/qeubo/controls cluster

- **Status:** Shipped on `frontend/theme-sweep-sfc-forest-qeubo`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes; SSOT-grep
  on swept files shows only documented `theme-exception` zones.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3e of the A1–A4 arc. Fifth of six sub-PRs in A3.
- **Date:** 2026-05-02.

## Context

Four SFCs swept (~65 chrome literals total):

- `src/components/ForestDirectory.vue`
- `src/components/AnalysisControls.vue`
- `src/components/QeuboToolbar.vue`
- `src/components/QeuboBookmarks.vue`

Plus one inline-template `style="color:#888"` literal fixed in
ForestDirectory.

## theme-exception zones

Five inline exceptions across the four files:

1. **AnalysisControls `.warning-btn` muted-state-error
   surfaces** — `#5a1a1a` border / `#3a1a1a` hover-bg, same
   pattern as PaletteEditor's `.del-btn`.

2. **QeuboToolbar `.seg-btn:hover` `#3a3a3a`** — a between-
   border-2-and-border-3 grayscale value paired with the
   `.seg-btn.active`'s `#1a3a4a` (a muted-cyan variant).
   Snapping to the nearest substrate anchor would either
   collapse the hover/active distinction or shift the visual
   noticeably. Preserved verbatim as part of the qEUBO toolbar's
   coherent muted-action-button design.

3. **QeuboToolbar `.seg-btn.active` / `.apply-btn` muted-cyan
   variants** — `#1a3a4a` resting bg, `#2a5a7a` border,
   `.apply-btn:hover` swap. Designer-intentional darkened
   accent surfaces; the substrate has only `--accent-primary`
   and muted variants would need new anchors.

4. **QeuboBookmarks `.new-btn` muted-cyan variants** —
   `#1a3a4a` / `#2a5a7a` / `#2a4a5a` matching the QeuboToolbar
   pattern.

5. **QeuboBookmarks `.delete-btn:hover` muted-state-error
   surface** — `#3a1a1a` / `#5a1a1a`, same pattern as
   PaletteEditor's `.del-btn`.

## Notable mappings

- **`color: #4caf50` → `var(--state-success)`** for the
  connected-engine status indicator in AnalysisControls.

- **`color: #ff6b6b` → `var(--state-error)`** for the warning-
  button text and the empty-state error variant.

- **`accent-color: #4aaef0` → `var(--accent-primary)`** for the
  `.range-slider` accent. CSS `accent-color` is themable.

- **`background: #2a2a2a` (.seg-btn rest) → `var(--border-1)`**.
  The plan's `--border-1` cluster (`#1f1f1f, #222, #242424,
  #2a2a2a`) covers this. Used as a button surface with a
  hover-darkening pattern; works visually because the substrate
  values are within JND of each other.

- **`color: #777` → `var(--text-2)`**. Plan's text-2 cluster
  picks up this near-`#666` low-emphasis text variant.

- **`rgba(74, 174, 240, 0.05)` → `color-mix(in srgb,
  var(--accent-primary) 5%, transparent)`** — the
  `.root-card.active` translucent accent background, consistent
  with prior color-mix derivations.

- **Inline-template `style="color:#888"` → `style="color:
  var(--text-2)"`** — the "All Game Sources" label in
  ForestDirectory's roots-tab tools-row. CSS variables work in
  HTML `style="..."` attributes (they are CSS, not presentation
  attributes), so this is a direct sweep — no `themeColor()`
  helper needed.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- Per-file SSOT-grep shows only documented `theme-exception`
  zones remaining.

## Next

- **A3f** — shell + App.vue (App.vue, Toolbar, StatusBar,
  SystemLogPanel, UserBadge, RootErrorBoundary; ~84 literals).
  Last A3 sub-PR.
- **A4** — TS chart adapters + template-inline SVG attributes
  via `themeColor()` helper. Closes the SSOT contract.

## License

Public Domain (The Unlicense).
