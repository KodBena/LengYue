# Theme substrate — A3d: sweep modals/auth cluster

- **Status:** Shipped on `frontend/theme-sweep-sfc-modals`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes; SSOT-grep
  on swept files shows only documented `theme-exception` zones.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3d of the A1–A4 arc. Fourth of six sub-PRs in A3.
- **Date:** 2026-05-02.

## Context

Three modal SFCs swept (~51 chrome literals total):

- `src/components/MintCardModal.vue`
- `src/components/ConfirmLoadModal.vue`
- `src/components/LoginModal.vue`

All three follow a consistent modal layout (backdrop + content
card + header + body + footer) with shared button vocabulary
(`.btn-cancel`, `.btn-submit`, etc.).

## theme-exception zones

Four inline exceptions across the three files:

1. **MintCardModal `.btn-submit:hover` `#5bc0ff`** — lightened
   cyan accent variant. Substrate has only one cyan anchor
   (`--accent-primary` `#4aaef0`); the hover lightening doesn't
   match any anchor. `color-mix(in srgb, var(--accent-primary),
   white 15%)` would yield ≈`#6abbf2`, close but not exact.
   Preserved verbatim.

2. **ConfirmLoadModal `.btn-submit:hover` `#5bc0ff`** — same
   pattern as MintCardModal, same rationale.

3. **LoginModal `.btn-primary:hover` `#5dbafa`** — same pattern,
   same rationale (slightly different lightening factor).

4. **LoginModal `.btn-danger` muted-attention surfaces** —
   `#4a2020` / `#5a2828` / `#6a3030` surfaces and `#ffaaaa` /
   `#ffcccc` text. Designer-intentional muted destructive-button
   aesthetic; same substrate gap as PaletteEditor's `.del-btn`.

## Notable mappings

- **`rgba(76, 175, 80, X)` → `color-mix(in srgb,
  var(--state-success) X%, transparent)`** — translucent state-
  success backgrounds for `.lineage-box.root` (MintCardModal).
  Color-mix derives from substrate, consistent with A3a/A3c
  patterns.

- **`rgba(74, 174, 240, X)` → `color-mix(in srgb,
  var(--accent-primary) X%, transparent)`** — translucent accent
  backgrounds for `.lineage-box.branch`. Same pattern.

- **`rgba(255, 74, 74, 0.1)` → `color-mix(in srgb,
  var(--state-attention) 10%, transparent)`** — `.btn-overwrite:hover`
  background in ConfirmLoadModal.

- **`#ddd` → `var(--text-0)`** (LoginModal text input). `#ddd`
  falls between `--text-0` (`#fff`/`#eee`) and `--text-1`
  (`#ccc`/`#aaa`); equidistant from `#eee` and `#ccc`. Snapped
  to text-0 since input content is high-emphasis user-typed text;
  consistent with how PaletteEditor's `.dark-input` mapped `#eee`
  to `--text-0`.

- **`color: #111` for button text on accent-bg buttons** mapped
  to `var(--surface-1)` (the literal-matching surface anchor) —
  `.btn-submit { color: var(--surface-1); }` reads as "darkest
  text on bright cyan button," which is the original intent.

- **Pure-black/white rgba literals** (`rgba(0,0,0,0.6)`,
  `rgba(0,0,0,0.7)`, `rgba(0,0,0,0.8)`) kept as-is per the
  pure-black/white substrate-exempt class carve-out from A3a.

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- Per-file SSOT-grep shows only documented `theme-exception`
  zones remaining.

## Next

- **A3e** — forest/qeubo/controls (ForestDirectory,
  AnalysisControls, QeuboToolbar, QeuboBookmarks; ~65 literals).
- **A3f** — shell + App.vue (~84 literals).
- **A4** — TS chart adapters via `themeColor()`.

## License

Public Domain (The Unlicense).
