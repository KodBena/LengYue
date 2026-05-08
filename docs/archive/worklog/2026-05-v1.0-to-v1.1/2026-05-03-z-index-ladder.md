# Z-index ladder — magic-literals audit Pass 2 Tier-1 #1

- **Status:** Shipped on `frontend/z-index-ladder`, 2026-05-03.
  Substrate addition + 8-site sweep; build green.
- **Genre:** Pass-2 substrate PR — opens the post-color arc of
  the magic-literals audit. Establishes the "Pass 2 substrate
  PR" template for subsequent substrates (animation durations,
  geometry, spacing/font-size/radius/letter-spacing scales).
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory (`docs/notes/
magic-literals-audit-inventory.md`, filed PR #98) tiered Pass
2 into nine ordered substrate-or-cleanup PRs. Tier-1 #1 was
the z-index ladder — the smallest possible opener: 4 anchors,
8 sweep sites, closes the modal-scrim drift (1000 vs 9999)
immediately. The plan's argument: smallest-first establishes
the substrate-PR template before the larger sweeps arrive,
mirroring the color arc's A1-then-A2 split.

The cluster from inventory Category D:

| Value  | Site                                           | Role                                  |
|--------|------------------------------------------------|---------------------------------------|
| `10`   | `MintCardModal.vue:323`                        | suggestion dropdown above modal body  |
| `10`   | `HorizontalTimelineVisualizer.vue:370`         | brush handle above grid               |
| `50`   | `App.vue:528`                                  | panel-resizer above panels            |
| `1000` | `LoginModal.vue:151`                           | login modal scrim                     |
| `9999` | `ConfirmLoadModal.vue:72`                      | confirm modal scrim                   |
| `9999` | `MintCardModal.vue:263`                        | mint modal scrim                      |
| `9999` | `FloatingThumbnail.vue:28`                     | drag-preview thumbnail                |
| `99999`| `RootErrorBoundary.vue:69`                     | error overlay (above all)             |

## What changed

### `src/assets/css/theme.css`

Four new anchors added under a new "Z-index ladder (4)"
section. File header reframed:

- Title: "Chrome theming substrate — the SSOT for every chrome
  color decision in the codebase" → **"Chrome substrate — the
  SSOT for chrome design decisions in the codebase."** The
  substrate's vocabulary now covers more than color; the
  reframe acknowledges that.
- Body: notes that the substrate carries color anchors plus a
  z-index ladder, and clarifies that the `themeColor()` runtime
  accessor remains color-only (z-index is CSS-only, no typed
  runtime accessor needed).
- Design-notes reference extended: was just
  `frontend-theming-plan.md`, now also points at
  `magic-literals-audit-inventory.md` for the z-index ladder's
  Pass-2 lineage.

The four anchors:

```css
/* ── Z-index ladder (4) ──────────────────────────────────────
 * Page-stacking tiers, ordered low → high. Snap-by-cluster
 * applied to the eight surveyed sites: the LoginModal's prior
 * z-index 1000 is collapsed into --z-modal (9999) to match the
 * three other modal-tier sites. If a future role wants to sit
 * between two tiers (e.g. a drag-overlay distinct from modals,
 * or a panel-affordance distinct from a popover), add a role
 * alias rather than a new numeric tier — same discipline as the
 * color decouple-via-alias pattern. */
--z-popover:    10;     /* in-stacking-context popovers, dropdowns, brush handles */
--z-affordance: 50;     /* panel-level chrome affordances (resizers, drag handles) */
--z-modal:      9999;   /* page-level modal scrim, drag-preview overlays */
--z-overlay:    99999;  /* error / system overlay above modals */
```

### Eight sweep sites — `var(--z-*)`

| Site                                           | Was      | Is                       | Verdict                          |
|------------------------------------------------|----------|--------------------------|----------------------------------|
| `MintCardModal.vue:263`                        | `9999`   | `var(--z-modal)`         | snap (no value change)           |
| `MintCardModal.vue:323`                        | `10`     | `var(--z-popover)`       | snap (no value change)           |
| `ConfirmLoadModal.vue:72`                      | `9999`   | `var(--z-modal)`         | snap (no value change)           |
| `RootErrorBoundary.vue:69`                     | `99999`  | `var(--z-overlay)`       | snap (no value change)           |
| `LoginModal.vue:151`                           | `1000`   | `var(--z-modal)`         | **drift collapsed** to 9999      |
| `FloatingThumbnail.vue:28`                     | `9999`   | `var(--z-modal)`         | snap (no value change)           |
| `HorizontalTimelineVisualizer.vue:370`         | `10`     | `var(--z-popover)`       | snap (no value change)           |
| `App.vue:528`                                  | `50`     | `var(--z-affordance)`    | snap (no value change)           |

`rg -n 'z-index\s*:' src/` post-sweep returns only the eight
sites above with `var(--z-*)`. Zero literal z-index values
remain in `src/`.

### `src/utils/theme-color.ts`

Docstring clarifications to scope `ChromeAnchor` at color
anchors specifically:

- File header reframed from "Runtime accessor for chrome-
  substrate CSS variables" to "Runtime accessor for chrome-
  substrate **color** CSS variables." New "Scope: color
  anchors only" subsection explicitly notes that theme.css's
  z-index ladder is CSS-only and intentionally outside this
  union; if a future need surfaces for TS-side numeric layering
  decisions, add a `themeNumber()` accessor with its own
  anchor union rather than muddling the color-typed contract.
- SSOT-discipline subsection updated to refer to "the color
  subset" of the substrate explicitly. Non-color anchors don't
  go into `ChromeAnchor` and don't need the lockstep edit.
- The `ChromeAnchor` declaration's docstring updated similarly.

No type changes — the union still mirrors only the color
anchors, which is the contract the file's runtime check (throws
on missing) is calibrated for.

### Why no decouple-via-alias

Surveyed FloatingThumbnail at 9999 against the modal scrims at
9999. The drag-preview's lifecycle differs from a modal's
(transient during drag vs persistent until dismissed), but the
z-index *role* — page-level overlay above content, below errors
— is the same. Snap-by-cluster (consolidate to `--z-modal`)
applied; decouple-via-alias not triggered. If a future
requirement surfaces for drag-previews to layer differently
from modal scrims (e.g., "drag previews must appear above modals
during cross-modal drags"), the alias `--z-drag: var(--z-modal)`
becomes the right move. Until then, one anchor.

The discipline is named in the substrate's inline comment
(quoted above) so future authors know to alias-not-add when a
role distinction surfaces — same posture as the color
substrate's `--player-white` / `--review-active` aliases.

## What's not done

- **No TS-side accessor for z-index.** No consumer in the
  codebase reads z-index values in TypeScript. If one
  surfaces, `themeNumber()` (or similar typed accessor) is
  the right shape; don't extend `ChromeAnchor`.
- **The five role aliases (`--player-black`, etc.) are
  unchanged.** This PR only adds the z-index ladder; the
  existing color substrate is untouched.
- **No theme-variant accommodation.** theme.css doesn't
  currently support `html.theme-X { ... }` variants; if it
  ever does, the z-index ladder is variant-stable (layering
  semantics don't change with theme), so the variant would
  override only color anchors. Not in scope here.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes. 867
  modules transformed, no errors. The pre-existing chunk-size
  warning is unrelated to this change.
- `rg -n 'z-index\s*:' src/`: zero literal z-index values
  remain; all eight surveyed sites read `var(--z-*)`.
- ADR-0002 satisfied: no silent fallbacks introduced; the
  CSS variables are loaded at startup from theme.css and
  rendering throws (missing `var()` falls back to browser
  default which is `auto`, observable via DevTools).
- ADR-0004: file edits stayed minimal — each consumer site
  was a one-line replacement on the existing line.
- ADR-0005 Rule 1 satisfied: the substrate is the single
  source of truth for z-index decisions in the codebase, and
  the inline comment names the discipline (snap-by-cluster
  applied; decouple-via-alias is the move for future role
  distinctions).
- ADR-0006: source-file headers preserved; theme.css's header
  retitled and rebodied to reflect the broader scope.
- ADR-0007: theme.css now at 102 lines (was 83) — well under
  any size budget.

## License

Public Domain (The Unlicense).
