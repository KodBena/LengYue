# Board variations overlay

- **Status:** Shipped on `frontend/board-variations-overlay`,
  2026-05-06. Seven files touched (one new SFC); build green. New
  feature; no closing of an existing tier-1 TODO entry.
- **Genre:** Feature — common GUI affordance that the codebase
  hadn't surfaced yet. Renders sibling variations from the current
  node (and, optionally, a hint marker for the next move on the
  active path) directly on the board. Two independent user
  settings drive the rendering; the overlay's design composes
  cleanly with the existing `MoveSuggestions` overlay so both can
  be enabled at once without visual confusion.
- **Date:** 2026-05-06.

## Context

Common Go GUIs (Lizzie, Sabaki, KaTrain, OGS, KGS) all surface
tree-state hints on the board itself: the next move on the
active path appears as a faint marker at its intersection;
sibling variations appear as alternate markers, often colored
circles or A/B/C letter labels per the SGF MA / TR / LB
property conventions. The codebase hadn't ported this affordance
to the SVG renderer; the only hint of game-tree state was the
last-move marker on the just-played stone. Users wanting to see
"what other moves did I explore here" had to navigate the tree
widget separately.

The user requested both modalities — colored circles, or
SGF-style A/B/C letters — and asked for both to be selectable
via a user setting. After a first iteration that used filled
discs, the user asked for two refinements:

1. **Circles, not disks.** "The disk modality is already used by
   move suggestions, which should be overlay-able with variations
   and distinguishable from ditto." So the variation markers
   render as stroke-only rings; visually distinct from
   MoveSuggestions's filled discs even at the same intersection.
2. **Separate toggle for the active marker.** "Personally I
   don't like it unless I really need it ... but it's a standard
   feature we should not miss out on." So the active-next-move
   marker has its own boolean toggle, independent of the
   variations rendering.

## Decision

Two independent user settings, both in `session.ui`:

- `boardVariations: 'off' | 'circles' | 'letters'` — variations
  rendering posture. Default `'circles'`.
- `showActiveNextMove: boolean` — active-next-move marker
  toggle. Default `true` (common GUI posture); user-disable-able.

All four (mode × toggle) combinations are valid and produce
sensible output:

| `boardVariations` | `showActiveNextMove` | Result |
|---|---|---|
| `'off'` | `false` | overlay not mounted |
| `'off'` | `true` | gray ring on active next move only |
| `'circles'` | `false` | colored rings on each non-active sibling |
| `'circles'` | `true` | gray ring on active + colored rings on siblings |
| `'letters'` | `false` | colored rings + letters on non-active siblings |
| `'letters'` | `true` | gray ring on active + colored lettered rings on siblings |

Two schema migrations: 17 → 18 backfills `boardVariations` with
`'circles'`; 18 → 19 backfills `showActiveNextMove` with `true`.
Both idempotent.

The host `BoardWidget` mounts the overlay only when at least one
of the two settings is on (`boardVariations !== 'off' ||
showActiveNextMove`), so the off/off pair has zero runtime cost.

## Why outline-only

`MoveSuggestions` uses filled discs at full stone radius (0.95 ×
stoneR) to encode KataGo's per-move analysis. Adding a second
overlay with the same disc shape — as the first iteration did —
collides at any intersection where both signals exist: the
variation disc occludes the suggestion disc (or vice versa), and
the user can't tell which is which without colour memory.

Stroke-only rings sidestep the collision. The variation marker
sits as a 0.85 × stoneR ring with stroke-width 2, which:

- Reads inside MoveSuggestions's cluster-ring (1.01 × stoneR,
  stroke 2.5) when both render — the variation ring is smaller
  and thinner, clearly subordinate.
- Doesn't occlude MoveSuggestions's filled disc — the disc
  remains visible inside the variation ring.
- Stays visible against the wood texture when MoveSuggestions
  isn't rendered — the colored stroke contrasts cleanly.

Same shape choice for the active-next-move marker (gray ring at
the same radius). Distinguishable from variations only by colour
(`--text-2` vs cycling tints); distinguishable from
MoveSuggestions by the outline-only rendering.

## What changed

Seven files. Single new SFC; the rest are surgical.

### `src/types.ts`

`UISession` gains two fields:

```ts
boardVariations: 'off' | 'circles' | 'letters';
showActiveNextMove: boolean;
```

Both have docstrings naming their independence and the
intersection with `showMoveSuggestions` (which gates KataGo's
analysis overlay — distinct from these, which surface the
user's own game-tree state).

### `src/store/defaults.ts`

`defaultSessionUI` gains `boardVariations: 'circles'` and
`showActiveNextMove: true`. New installs land on the common GUI
posture.

### `src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumps from 17 to 19 across two
migrations:

- 17 → 18: `boardVariations` backfilled with `'circles'`
  (preserved if pre-existing valid value).
- 18 → 19: `showActiveNextMove` backfilled with `true`
  (preserved if pre-existing boolean).

Two migrations rather than one because the active-marker toggle
arrived in the second iteration; the migration ledger reflects
the actual order of decisions per the append-only invariant.

### `src/components/RegistryEditor.vue`

`PATH_ENUMS` gains `'boardVariations': ['off', 'circles', 'letters']`
so the registry's auto-renderer surfaces a dropdown.
`showActiveNextMove` is a boolean and surfaces as a checkbox via
the existing scalar path; no PATH_ENUMS entry needed.

### `src/components/BoardVariationsOverlay.vue` (new)

Stateless SVG overlay. Reads `state.nodes[currentNodeId]`'s
`children` and `activeChildIndex`; emits no events. The render
walk:

1. Iterate over the current node's children.
2. Skip children with no `move` (root-only edge case) or with
   `move.type === 'pass'` (passes have no board position).
3. The child at `activeChildIndex` becomes the **active marker**
   when `showActiveNextMove` is `true`: gray stroke-only ring
   (`--text-2` at 0.7 opacity, 0.85 × stoneR radius, 2-unit
   stroke width). No label, even in 'letters' mode (A is
   reserved for the first non-active sibling per the spec).
4. Each non-active child becomes a **variation marker** when
   `variationsMode !== 'off'`: same ring, with stroke colour
   cycling through `[--accent-secondary, --state-error,
   --state-success, --accent-primary]`, 0.85 opacity. In
   `'letters'` mode, a centered letter label A, B, C, ... in
   matching tint, font-size 1.0 × stoneR.

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
license declaration. ADR-0007: ~190 lines, well under the
250-line SFC budget; largest section (script) is ~135 lines.

### `src/components/BoardWidget.vue`

Imports `BoardVariationsOverlay`; layers it after
`MoveSuggestions` in the template, gated on
`boardVariations !== 'off' || showActiveNextMove`. Z-order:
the overlay sits above MoveSuggestions, so a variation ring at
the same position as a KataGo suggestion shows on top of the
suggestion's filled disc — but as a stroke-only ring inside
the disc, both remain visible and distinguishable.

The new overlay is independent of `showMoveSuggestions`
(deliberately not coupled): variations are the user's own
exploration history, not engine analysis. A user reviewing in
blind mode (`showMoveSuggestions = false`) who wants the
variations hidden too sets `boardVariations = 'off'`
separately. In typical review flows the current node has no
children (the SGF mainline's leaf with no user-explored
branches), so the overlay naturally renders nothing during
AWAITING_MOVE without explicit gating.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- The migrations' idempotency: a v19 blob (or any blob with
  pre-existing valid values) is preserved as-is. Invalid or
  absent fields get the defaults.
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
- Shape-collision-free composition with MoveSuggestions: the
  variation ring at 0.85 × stoneR (stroke 2) sits clearly
  inside the cluster ring at 1.01 × stoneR (stroke 2.5), and
  doesn't occlude the suggestion's filled disc.

Manual smoke (left as HMR-driven user verification):

- Default install: open a board with several variations at the
  current node. Each non-active sibling = colored ring cycling
  through orange / red / green / cyan; active child = gray
  ring. Both stroke-only.
- Switch the variations mode to `'letters'`: the colored rings
  gain centered A, B, C labels in matching tints.
- Switch to `'off'`: variation rings disappear; gray active
  ring still visible.
- Disable `showActiveNextMove`: gray ring disappears;
  variation rings still visible.
- Both off: overlay is not mounted.
- With `showMoveSuggestions = true` simultaneously: KataGo
  filled discs and cluster rings render alongside the
  variation rings — all three visible at the same
  intersection without occlusion.
- Click on a variation ring: the move plays at that
  intersection (current branch extends via `applyGoMove`).
- Pass moves: a pass child does not surface as a marker.
- Theme switch (`'dark'` → `'cluster'`): tints update without
  a board remount.

## Forward notes

- **Click-to-navigate without playing.** Current click-through
  behaviour plays the move at the variation's intersection.
  Working as the natural affordance for "I want to be at that
  position", but doesn't surface "switch the active variation
  pointer to this sibling without playing." A future
  enhancement could add a modifier-key path (shift-click or
  alt-click) that calls the navigator's switch-active-child
  routine instead. Held until requested.
- **Per-variation distinct colors at scale.** The 4-tint cycle
  collapses for >4 variations. If a user surfaces a busy
  position, the natural extension is the existing
  `--cluster-12-*` substrate (12 distinct tints). Held until
  the user notices the repeats.
- **Visual-affordance overlap with last-move marker.**
  BoardDisplay's last-move marker (a hollow circle) sits
  inside the just-played stone at radius `stoneR × MARKER_INNER_RATIO`.
  The variation ring sits outside the stone footprint at 0.85 ×
  stoneR. They don't overlap geometrically — but they do share
  the "ring drawn over a stone" visual vocabulary, so a user
  glance might briefly conflate the two. Held; no user
  complaint yet.
- **`docs/notes/frontend-backlog.md` doesn't carry an entry
  for this** — the feature was requested directly. The
  bug-list there is for known surfacing-of-functional-gaps;
  this is a new feature, not a closure of one. No retrofit
  needed.
