# Fix: spurious last-move marker on a pass move in board thumbnails

Closes the cosmetic defect named in `.claude/dispatch-reports/sgf-pass-diagnosis.md`'s
"PROPOSED MINIMAL FIX" section: `renderBoardToSvg`'s `lastMove` parameter was typed
as the bare `Point` shape, so a `'pass'` move — whose `Move` value still carries a
placeholder `x:0,y:0` (`sgfToMove`'s pass branch) — satisfied it by duck-typing and
the renderer drew a "last move" ring at board coordinate (0,0), silently misattaching
to whatever stone (if any) occupied that unrelated point.

## Docs read (frontend/CLAUDE.md discipline, end-to-end before editing)

`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, and
`.claude/dispatch-reports/sgf-pass-diagnosis.md` (all read in full). `frontend/FILES.md`
consulted as a lookup only (no new file's directory entry needed a purpose lookup —
no file was created outside `tests/unit/`, which isn't in FILES.md's scope).

## Contract chosen

Per the diagnosis's stronger option: **narrow the renderer's own contract**, not just
the two originally-named call sites. `renderBoardToSvg`'s `lastMove` parameter changed
from `Point | null` to the discriminated `Move | null` union (`src/types/game.ts`), and
the function body now guards `showMarker && lastMove && lastMove.type === 'place'`
before touching `.x/.y`. This makes "a pass (or absent) move draws no marker" the only
representable behavior at the renderer's boundary — closing the defect class for any
current or future caller, not only the sites the diagnosis enumerated.

A grep for every `renderBoardToSvg` / `lastMove:` producer found **three** callers into
`renderBoardToSvg` (one more than the diagnosis's two — `LibraryPreviewPane.vue` was
missed there), all of which already pass a `Move | null`-typed value
(`BoardNode.move: Move | null` in `src/types/game.ts`), so **no call-site edit was
needed** — the type-level narrowing alone closes the class:

- `frontend/src/composables/cards/useCardThumbnail.ts:78` — `lastMove: board.nodes[leafId].move`
- `frontend/src/components/library/LibraryPreviewPane.vue:38` — `lastMove: currentNode?.move ?? null`
- `frontend/src/composables/cards/useThumbnailCache.ts:64` — builds a `BoardSnapshot`
  (not a direct `renderBoardToSvg` call); `BoardSnapshot.lastMove` was already typed
  `Move | null` (`src/engine/board-geometry.ts`) and its two component consumers
  (`MiniBoardSvg.vue:65`, `MiniBoardCanvas.vue:123`) already guard on
  `lm.type === 'place'` — confirmed unaffected, not touched.

## Files touched

- `frontend/src/engine/board-renderer.ts` — `lastMove` param retyped `Point → Move`;
  marker-emission guard extended with `lastMove.type === 'place'`; comment documents
  the contract and why it's enforced once at the callee rather than at each call site.
- `frontend/tests/unit/engine/board-renderer.test.ts` — new Tier-1 test file (no
  existing `board-renderer` test to extend).

No call sites edited (see above — already compatible with the narrowed contract).
No FILES.md entry: the new file is under `tests/`, which is out of FILES.md's `src/`
scope.

## Test

`tests/unit/engine/board-renderer.test.ts`, `describe('renderBoardToSvg — last-move
marker vs. Move.type')`:

- `draws no marker for a pass move, even when a stone occupies the placeholder (0,0) point`
  — red leg (WITNESSED): with the pre-fix renderer (`git stash` on
  `board-renderer.ts` only), this failed specifically because the marker circle
  (`opacity="0.8"`) *was* emitted at (0,0) — the assertion's own failure diff showed
  the spurious `<circle ... stroke="white" stroke-width="2" opacity="0.8" />`.
- `draws the marker for a genuine place move` — green sibling regression guard, so the
  fix didn't just delete the feature.
- `draws no marker when lastMove is null` — pre-existing-good-path regression guard.

The marker assertion is anchored on the marker's own behavioral output
(`opacity="0.8"`, the one attribute unique to the ring circle among everything else
the renderer emits — stones and labels don't carry it), not an incidental string.

## Gates (WITNESSED — actual tails)

`npm install` was required first (worktree had no `node_modules`).

**`npm run build`**
```
> gogui@0.0.0 build
> vue-tsc -b && vite build
...
✓ 1080 modules transformed.
...
dist/assets/index-itkB9Ke6.js   2,920.80 kB │ gzip: 1,032.36 kB
✓ built in 1.96s
```
(The chunk-size warning is pre-existing and unrelated to this change.)

**`npx eslint .`** — no output (clean).

**`npm run test:run`**
```
> gogui@0.0.0 test:run
> vitest run

 Test Files  82 passed | 3 skipped (85)
      Tests  1104 passed | 4 skipped (1108)
   Start at  13:26:30
   Duration  65.07s
```
Exited cleanly.

## Minimal-touch note (ADR-0004)

Only `board-renderer.ts` was edited in `src/`; the three call sites were read and
confirmed already contract-compliant rather than touched speculatively.
