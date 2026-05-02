# Theme substrate — A3c: sweep editors cluster

- **Status:** Shipped on `frontend/theme-sweep-sfc-editors`,
  2026-05-02. `npm run build` (vue-tsc + vite) passes; SSOT-grep
  on swept files shows only documented `theme-exception` zones
  remaining.
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A3c of the A1–A4 arc. Third of six sub-PRs in A3.
- **Date:** 2026-05-02.

## Context

Three editor SFCs swept (~58 chrome literals total):

- `src/components/PaletteEditor.vue`
- `src/components/CardSetEditor.vue`
- `src/components/RegistryEditor.vue`

All three share a master-detail layout idiom (sidebar + detail
pane) and use a consistent vocabulary of literals: `#0a0a0a`,
`#111`, `#1a1a1a` for surfaces; `#222`, `#333` for borders and
button bgs; `#aaa`, `#ccc`, `#888`, `#666`, `#555` for text;
`#4aaef0` accent. The sweep snaps each to the corresponding
substrate anchor per the same rules established in A2 and A3a/b.

## theme-exception zones

Five inline exceptions across the three files:

1. **`.del-btn` muted-state-error surfaces** (PaletteEditor,
   CardSetEditor) — the `#3a1a1a` resting bg / `#5a1a1a` hover
   bg / border-color form a designer-intentional dark-red
   "destructive button" aesthetic. The chrome substrate's
   `--state-error` is the saturated wire-color (`#f04a4a`);
   muted surface variants would need new anchors (e.g.
   `--state-error-muted` or a `--state-error-surface` family).
   Preserved verbatim until the substrate gains tinted-surface
   vocabulary.

2. **RegistryEditor `.modified-dot` `#fbbf24`** (Tailwind
   amber-400) — "this leaf has been edited" indicator. No
   semantic anchor for "edited / pending" exists in the
   substrate; `--state-warning` (`#f0a04a`) is close in hue but
   differs in brightness and is reserved for warning-level
   system messages.

3. **RegistryEditor `.expression-input` `#fbbf24`** — text color
   for asteval expression fields, visually paired with the
   `.modified-dot` indicator above. Same substrate gap.

4. **RegistryEditor `.ref-icon` / `.ref-input` `#f472b6`**
   (Tailwind pink-400) — "symbolic reference" indicator,
   visually distinct from expressions (amber) and scalars
   (white-ish). No semantic anchor for "reference" in the
   substrate.

## Notable mappings

- **`color: #555` for arrows / chevrons / dim text** mapped to
  `--border-3` per the literal-snap-by-cluster rule; `#555` is
  exact `--border-3`. Role mismatch (border anchor used as
  text color) acknowledged in earlier worklogs.

- **`#ef4444` (Tailwind red-500) → `var(--state-error)`** — the
  delete-button hover-text color in RegistryEditor. Distance
  to `--state-error` (`#f04a4a`) is small; visually nearly
  identical.

- **`rgba(74, 174, 240, 0.05)` → `color-mix(in srgb,
  var(--accent-primary) 5%, transparent)`** — the branch-label
  background in RegistryEditor (translucent accent for visual
  grouping). Color-mix derives the alpha from the substrate
  anchor, consistent with A3a's pattern for state-color
  shadows.

- **`rgba(0, 0, 0, 0.2)` for `.add-key-row` background** — kept
  as-is per the pure-black/white rgba carve-out from A3a (these
  are universal CSS decoration vocabulary, substrate-exempt).

## Verification

- `npm run build` passes; vue-tsc and vite both clean.
- Per-file SSOT-grep shows only documented `theme-exception`
  zones remaining.

## Next

- **A3d** — modals/auth (MintCardModal, ConfirmLoadModal,
  LoginModal; ~51 literals).
- **A3e** — forest/qeubo/controls (ForestDirectory,
  AnalysisControls, QeuboToolbar, QeuboBookmarks; ~65 literals).
- **A3f** — shell + App.vue (~84 literals).
- **A4** — TS chart adapters via `themeColor()`.

## License

Public Domain (The Unlicense).
