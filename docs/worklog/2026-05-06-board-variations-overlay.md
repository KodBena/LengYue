# Board variations overlay

- **Status:** Shipped on `frontend/board-variations-overlay`,
  2026-05-06. Six files touched (one new SFC); build green. New
  feature; no closing of an existing tier-1 TODO entry.
- **Genre:** Feature — common GUI affordance that the codebase
  hadn't surfaced yet. Renders the next move on the active path
  and sibling variations from the current node directly on the
  board, controllable by a new tri-state user setting.
- **Date:** 2026-05-06.

## Context

Common Go GUIs (Lizzie, Sabaki, KaTrain, OGS, KGS) all surface
tree-state hints on the board itself: the next move on the
active path appears as a faint marker at its intersection;
sibling variations appear as alternate markers (often colored
circles or letter labels per the SGF MA / TR / LB property
conventions). The codebase hadn't ported this affordance to
the SVG renderer; the only hint of game-tree state was the
last-move marker on the just-played stone. Users wanting to see
"what comes next" or "what other moves did I explore here"
had to navigate the tree widget separately.

The user requested both modalities — the common posture (gray
ghost for active, colored circles for variations) and the
SGF-style A/B/C letter labelling — and asked for both to be
selectable via a user setting.

## Decision

Single tri-state field `session.ui.boardVariations: 'off' |
'circles' | 'letters'`. Default `'circles'` (the common GUI
default per the user's framing), so existing users land on a
sensible visual on first hydrate without a discovery step. The
field surfaces in the existing Session (UI) registry editor as
a dropdown via `RegistryEditor.vue`'s PATH_ENUMS table.

Schema migration 17 → 18 backfills the field for existing
blobs with `'circles'` (or preserves a pre-existing valid
value).

A new SFC `BoardVariationsOverlay.vue` renders the markers as
SVG over the board, layered after `MoveSuggestions` in
`BoardWidget.vue`'s template. The overlay is mounted only when
the mode is non-`'off'` (`v-if`), so the off state has zero
runtime cost.

## What changed

Six files. Single new SFC; the rest are surgical.

### `src/types.ts`

`UISession` gains:

```ts
boardVariations: 'off' | 'circles' | 'letters';
```

The field's docstring distinguishes it from `showMoveSuggestions`
(which gates KataGo's analysis overlay): the variations overlay
shows the user's own game-tree state, not engine analysis. The
two settings are independent.

### `src/store/defaults.ts`

`defaultSessionUI` gains `boardVariations: 'circles'`. New
installs land on the common GUI posture.

### `src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumps from 17 to 18. New migration
17 → 18 backfills `boardVariations` with `'circles'` when
absent or invalid. Idempotent — a pre-existing valid value is
preserved.

### `src/components/RegistryEditor.vue`

`PATH_ENUMS` gains `'boardVariations': ['off', 'circles', 'letters']`
so the registry's auto-renderer surfaces a dropdown rather than
a free-text input. Same pattern as `analysisLayout`,
`pvAnimation.mode`, etc.

### `src/components/BoardVariationsOverlay.vue` (new)

Stateless SVG overlay. Reads `state.nodes[currentNodeId]`'s
`children` and `activeChildIndex`; emits no events. The render
walk:

1. Iterate over the current node's children.
2. Skip children with no `move` (root-only edge case) or with
   `move.type === 'pass'` (passes have no board position).
3. The child at `activeChildIndex` becomes the **active
   marker**: gray ghost (`--text-2` at 0.45 opacity, full
   stone radius). Same in both modes.
4. Each non-active child becomes a **variation marker**:
   - `'circles'` mode: filled disc cycling through
     `[--accent-secondary, --state-error, --state-success,
     --accent-primary]`, near-full stone radius (0.95 × r),
     0.65 opacity. No label.
   - `'letters'` mode: same tint cycle, smaller backdrop disc
     (0.55 × r, 0.65 opacity), with a white letter label
     A, B, C, ... in declaration order (A is the first
     non-active sibling per the user's spec).

The 4-tint cycle is fine for the common case (1–3 variations
per position); positions with >4 variations repeat tints, but
in `'letters'` mode the labels disambiguate, and in `'circles'`
mode the visual goal is "this is a variation point" rather
than per-variation identity.

`pointer-events: none` on the outer SVG: clicks pass through
to BoardDisplay, so clicking a variation marker plays the
move at that intersection (the position would extend the
existing branch via `applyGoMove`, which is the intended
affordance — clicking the marker = "I want to navigate
there").

ADR-0003 band: Go-bound (Band 3). Uses `Move`'s B/W color
field, the SVG geometry shared with BoardDisplay, and stone-
radius styling. A chess port would replace this overlay
entirely with its own variant-display surface.

ADR-0006: file header at the top of the script block,
license declaration. ADR-0007: 167 lines, well under the
250-line SFC budget; largest section (script) is ~110 lines.

### `src/components/BoardWidget.vue`

Imports `BoardVariationsOverlay`; layers it after
`MoveSuggestions` in the template, gated on
`store.session.ui.boardVariations !== 'off'`. Z-order: the
overlay sits above MoveSuggestions, so a variation marker at
the same position as a KataGo suggestion would show on top.
In practice the two overlap rarely — KataGo's suggestions
come from `moveInfos`, the variations come from the user's
tree state — and the user can disable either independently
if conflicts arise.

The new overlay is independent of `showMoveSuggestions`
(deliberately not coupled), per the spec: variations are
the user's own exploration history, not engine analysis. A
user reviewing in blind mode (`showMoveSuggestions = false`)
who wants the variations hidden too would set
`boardVariations = 'off'` separately. In typical review
flows the current node has no children (the SGF mainline's
leaf with no user-explored branches), so the overlay
naturally renders nothing during AWAITING_MOVE without
explicit gating.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- The migration's idempotency: a v18 blob (or any blob with a
  valid `boardVariations` value) is preserved as-is. An
  invalid or absent value gets `'circles'`.
- The overlay's defensive guards: a child reference without a
  node, or a child whose move is `null` or `'pass'`, is
  skipped. The render output is empty when the current node
  has no children (typical for SGF-leaf positions during a
  review session).
- Variation indexing: `variationIdx` increments only on
  non-active children, so the lettering starts at `'A'` for
  the first non-active sibling regardless of where in
  `children[]` the active child sits. Per the user's spec.
- Theme reactivity: `themeColor()` is called inside the
  computed marker list, so theme switches propagate without a
  remount (same pattern as `BoardWidget`'s `ownershipColor` /
  `livenessColor` helpers).

Manual smoke (left as HMR-driven user verification):

- Default install: open a board with several variations at
  the current node. Active next move = gray ghost; each
  variation = colored disc cycling through orange / red /
  green / cyan.
- Switch the mode to `'letters'`: variations now show A, B, C
  with smaller backdrop discs.
- Switch to `'off'`: overlay disappears entirely.
- Click on a variation marker: the move plays at that
  intersection (current branch extends via `applyGoMove`).
- Pass moves: a pass child does not surface as a marker
  (no board position).
- Theme switch (`'dark'` → `'cluster'`): tints update without
  a board remount.

## Forward notes

- **Click-to-navigate.** The current behaviour on clicking a
  variation marker is "play the move," via the click-through
  to BoardDisplay. This works for extending or following
  existing branches but doesn't surface "switch active
  variation to this sibling without playing." A future
  enhancement could add a modifier-key path (e.g.,
  shift-click or alt-click on a variation marker calls the
  navigator's switch-active-child routine instead of
  `applyGoMove`). Not in scope here.
- **Per-variation distinct colors.** The current 4-tint cycle
  collapses for >4 variations. If a user surfaces a position
  with many siblings and the visual gets confused, the
  natural extension is a larger named palette (the
  `--cluster-12-*` substrate already provides 12 distinct
  tints). Held until requested.
- **Overlap with MoveSuggestions.** When a KataGo suggestion
  and a variation marker land on the same intersection, the
  variation overlay sits on top. If this becomes visually
  noisy, the natural fix is hiding the variation overlay's
  marker at suggestion-occupied intersections, or vice versa.
  Held; no user complaint yet.
- **`docs/notes/frontend-backlog.md` doesn't carry an entry
  for this** — the feature was requested directly. The
  bug-list there is for known surfacing-of-functional-gaps;
  this is a new feature, not a closure of one. No retrofit
  needed.
