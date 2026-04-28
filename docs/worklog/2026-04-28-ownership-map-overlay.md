# Ownership Map Overlay (Release Wrap-up)

- **Status:** Shipped on branch `frontend/ownership-overlay`, merged
  via PR #17, 2026-04-28. `npm run build` green; manual smoke
  confirmed live by user across all three sub-modes; sign convention
  empirically verified against the running KataGo backend.
- **Genre:** Worklog entry — closes the `ownership maps` bullet in
  `docs/notes/frontend-backlog.md`; identified by the user as one of
  the irreducible-minimum features required before release.
- **Date:** 2026-04-28.
- **Origin:** Frontend-backlog bullet reading "ownership maps and
  policy head outputs (generic overlay that can be used with both
  ownership and policy)"; user surfaced ownership specifically as the
  first wrap-up item.

## Context

KataGo's analysis protocol carries an `ownership: number[]` field
when the wire query sets `includeOwnership: true`. Until this PR no
code path requested it, no UI consumed it, and the value was
nominally typed on `KataAnalysisResponse` but otherwise dormant.
Three distinct visual semantics for the same data are useful at
different times: a continuous territory-style fill on empty
intersections (global perception), discrete confidence dots (subtle
overlay that composes with `MoveSuggestions`), and a dot-in-stone
liveness highlight on stones whose colour disagrees with the engine's
predicted owner (dead-stone identification). The user wanted all
three available simultaneously and orthogonally toggleable —
extension-driven future overlays envisioned but out of scope for
shipment.

## Approach

A — `BoardHeatmapOverlay.vue` (new component). Stateless SVG sibling
of `BoardDisplay` and `MoveSuggestions`, parameterised on
`{ cells, size, colorMap, shape, scale }`. Renders one shape (disc or
square) per cell at the cell's position, tinted by the cell's value
through the supplied colorMap. Domain-agnostic; the component knows
nothing about ownership, policy, or any specific metric — the call
site composes the source packet, the decoder, and the colour map.
This is the per-metric overlay primitive that future extensions
compose against.

B — Multi-mode state on `UISession.overlayLayers.ownership`.
Replaced what would have been a single boolean with a sub-object of
three orthogonal booleans (`continuous` / `dots` / `liveness`). The
named-keys-record costs nothing in flexibility (the migration to
open-keyed is one line if extensions want a registry) and gives
exhaustiveness checks on the wire-flag plumbing today.

C — Wire-flag plumbing in `analysis-service.ts`. Both `analyzeRange`
and `analyzeActiveNode` now read
`overlayLayers.ownership.{continuous,dots,liveness}`; if any of the
three is on, the query carries `includeOwnership: true`. Per-board
restart thunks are captured at issue-time in a new
`restartCallbacks` map; a new `restartActiveAnalyses()` walks the
thunks so that toggling any sub-mode propagates into in-flight
queries via a clean stop-then-reissue.

D — Reactivity. `useAppBootstrap` deep-watches
`store.session.ui.overlayLayers` and triggers
`analysisService.restartActiveAnalyses()` on change. Future overlay
layers (policy, extension-provided metrics) inherit the same restart
behaviour via the same deep watch.

E — Decoding helper. `decodeBoardArray(values, size)` in
`engine/util.ts` translates KataGo's row-major-with-row-0-at-top
layout into `{ x, y, value }[]` records in our internal y=0-at-bottom
coordinate convention. Length-mismatch warns and returns `[]` per
ADR-0002. Generic enough to apply to policy in the future
(after stripping the trailing pass slot).

F — Colour maps. A single `ownershipColor(v)` (divergent black/white
at full magnitude, transparent below |v| < 0.05) drives the
continuous and dots modes; a separate `livenessColor(v)` (solid
opaque opposite-tint dot) drives the liveness mode after a 0.3
threshold filter on stone-colour-vs-ownership disagreement.

G — Schema migrations. `2 → 3` introduces `overlayLayers` as a
single boolean `ownership` (intermediate v3 shape). `3 → 4` splits
`ownership: boolean` into `{ continuous, dots, liveness }`; a legacy
`true` maps to `continuous: true` (preserves "I want ownership view"
intent under the new canonical mode). Both migrations are
append-only and idempotent.

H — Keybindings. `useUserIORegistry` gains three cases bound to `c`
(continuous), `d` (dots), `l` (liveness). The three are intentionally
independent — same binding-shape as the existing `m` / space /
arrows.

## Critical files

- **Created:** `frontend/src/components/BoardHeatmapOverlay.vue`.
- **Edited:** `frontend/src/components/BoardWidget.vue` (mount three
  overlay instances; `decodedOwnership`, `emptyCells`,
  `continuousCells`, `dotsCells`, `livenessCells` computeds;
  `ownershipColor` / `livenessColor` colour maps).
- **Edited:** `frontend/src/services/analysis-service.ts` (thread
  `includeOwnership` based on overlay state; `restartCallbacks` map;
  `restartActiveAnalyses()` method).
- **Edited:** `frontend/src/composables/useAppBootstrap.ts` (deep
  watch on `overlayLayers`).
- **Edited:** `frontend/src/composables/useUserIORegistry.ts`
  (`c`/`d`/`l` cases).
- **Edited:** `frontend/src/types.ts` (`UISession.overlayLayers`).
- **Edited:** `frontend/src/store/defaults.ts` (defaults all `false`).
- **Edited:** `frontend/src/store/migrations.ts` (`CURRENT_SCHEMA_-`
  `VERSION = 4`; migrations 2→3 and 3→4).
- **Edited:** `frontend/src/engine/util.ts` (`decodeBoardArray`).

## Reused existing surface

- `KataAnalysisResponse.ownership` was already typed; nothing on the
  wire-type side needed change.
- `analysis-ledger`'s `mergeAnalysisPacket` already overwrites
  `ownership` on incoming packets via the `{ ...incoming, extra: ... }`
  spread; storage was free.
- `MoveSuggestions`'s sibling-SFC layering pattern under
  `BoardWidget` was the natural mount point for the new overlay
  instances.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`).

2. **Manual smoke — all three modes.** With KataGo connected: `c`
   toggles continuous fill (adjacent gap-less squares on empty
   intersections); `d` toggles dots (sparse subtle markers); `l`
   toggles liveness (small opposite-coloured dot inside dying stones).
   Combinations stack as expected; layering order is BoardDisplay →
   continuous → dots → liveness → MoveSuggestions. ✓

3. **Sign convention.** User confirmed via live engine that positive
   ownership values mean white-owned (KataGo's default convention);
   `ownershipColor` and `livenessColor` orient against this. ✓

4. **Reactivity.** Toggling any sub-mode via the keyboard restarts
   active queries cleanly; the new wire-flag value takes effect on
   the next packet. ✓

5. **Migration.** Legacy v2 blob on the user's backend migrated
   correctly through 2→3 and 3→4 on hydrate; user's ownership
   preference (off by default) survived. ✓

## Outcomes

- The ownership-map feature gains its full data path: wire request →
  analysis ledger → reactive computed in `BoardWidget` → SVG overlay.
- `BoardHeatmapOverlay.vue` becomes the parameterised primitive for
  future per-metric overlays. Policy will compose the same primitive
  by reusing `decodeBoardArray` (after stripping the trailing pass
  slot) plus its own colour map.
- The reactive-restart pattern in `useAppBootstrap` plus
  `analysisService.restartActiveAnalyses()` is the template for any
  setting that gates a wire-level field.
- One of the irreducible-minimum release-wrap-up features retires.

## Out of scope (explicitly)

- **Policy head overlay.** Will reuse `BoardHeatmapOverlay.vue` and
  `decodeBoardArray`; pending its own PR. The trailing "pass" slot
  in KataGo's policy array must be stripped before decode.
- **Extension-driven overlay registry.** The user envisions
  user-loadable metric overlays similar to the palette system;
  current shape (`overlayLayers.ownership: { ... }`) is a stepping
  stone. Path to open-keyed `Record<OverlayId, OverlayState>` is a
  one-line type change once a second consumer materialises.
- **Per-board overlay state.** Currently global on `UISession`;
  ergonomic toggle via keyboard makes per-board granularity moot for
  now.
- **End-user styling of overlay colour maps.** Hardcoded in
  `BoardWidget` for now; future settings-tab affordance once the
  registry pattern lands.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — Frontend Completed table gained the entry at PR
  merge time.
- `docs/notes/frontend-backlog.md` — `ownership maps` bullet
  strikethrough'd with closure annotation.
- No ADR amendment. The overlay layering is a concrete application
  of ADR-0003's "what would change for a Chess port?" — the heatmap
  primitive is band-A (truly domain-agnostic), the `decodeBoardArray`
  helper is band-B (game-tree-coupled in convention), `ownership-`
  `Color` and `livenessColor` are band-C (Go-bound).

## Branch + PR workflow

Branched off `main` post-PR-#16 merge (`9bb35c2`). Single PR (#17)
opened against main with detailed test plan; merged at `8885872`.
The session was running on `docs/doc-graph-discipline-plan` when the
implementation began; mid-stream relocated to a fresh
`frontend/ownership-overlay` branch off main to keep one concern per
branch (the doc-graph plan was unrelated and merged separately as
PR #15).
