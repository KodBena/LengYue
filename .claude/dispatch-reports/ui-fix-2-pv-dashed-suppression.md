# Fix 2 — suppress dashed variation rings during PV hover preview

Spec: `.claude/dispatch-reports/ui-defects-investigation.md`, "Defect 2 —
dashed 'visited move' circles bleed into PV hover-preview" (read in full
before implementing, along with `frontend/CLAUDE.md` and
`frontend/tests/CLAUDE.md`, per this world's ADR-0002 read-end-to-end
discipline).

## What changed

Wired `BoardWidget.vue`'s existing `pvHoverActive` signal (already used to
suppress move-number labels during a PV hover, per the comment at
`BoardWidget.vue:189-202`) into `BoardVariationsOverlay.vue` via the
report's recommended **prop-based shape**:

- `BoardVariationsOverlay.vue` gained a `suppressed: boolean` prop,
  consumed at the top of the marker-derivation logic (early return →
  no markers) rather than at the mount `v-if`, so the overlay stays
  mounted and re-evaluates cheaply across a hover transition instead of
  unmounting/remounting.
- `BoardWidget.vue`'s template now passes `:suppressed="pvHoverActive"`
  to the overlay mount (`BoardWidget.vue:311`).
- Both files' comments were extended (not replaced) to name the second
  consumer of `pvHoverActive`.

## Extraction for testability

`BoardVariationsOverlay.vue`'s `markers` computed body (the mode ×
active/variation branching, the letters→circles suggestion-overlap
fallback, and now the suppression gate) was extracted verbatim into a
pure function, `deriveVariationMarkers`, in a new file:
`frontend/src/composables/board/board-variations-markers.ts`. The SFC's
`markers` computed is now a one-line call into it, keeping the component
thin per `frontend/CLAUDE.md`'s SFC discipline and making the branching
logic reachable from a Tier-1 unit test (no DOM, no Vue reactivity) per
`frontend/tests/CLAUDE.md`'s tier structure.

## Test

`frontend/tests/unit/composables/board-variations-markers.test.ts` — four
Tier-1 cases: `suppressed=false` emits both the active ring and a sibling
ring; `suppressed=true` yields no markers in circles mode; `suppressed=true`
yields no markers in letters mode either (no letter leak); and a
`showActiveNextMove=false` control case to confirm the suite isn't
vacuously green.

**Red-leg WITNESSED**: temporarily removed the `if (opts.suppressed) return
[];` early-return from the source (the pre-fix shape, where the function had
no knowledge of PV-hover state) and re-ran the suite — the two
`suppressed=true` tests failed, both markers (`active-3-3`,
`variation-15-15`) reappearing in the output as expected. Restored the fix
and re-ran: green (4/4). Full transcript below.

```
$ npx vitest run tests/unit/composables/board-variations-markers.test.ts   # with suppressed gate removed
 FAIL  ... > suppressed=true: yields no markers at all ...
AssertionError: expected [ { x: 3, y: 3, … }, { x: 15, y: 15, … } ] to deeply equal []
 FAIL  ... > suppressed=true overrides letters mode too ...
AssertionError: expected [ { x: 3, y: 3, … }, { x: 15, y: 15, … } ] to deeply equal []
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)

$ npx vitest run tests/unit/composables/board-variations-markers.test.ts   # gate restored
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The live-visual acceptance probe the report names (connect an engine,
hover a suggestion disc >200ms, screenshot the board, assert no dashed
ring/circle glyph anywhere on the SVG) is **UNEXERCISED** in this session
— same blocker the investigation report already recorded for Defect 2
(no sanctioned non-persisting engine-connect path against the built
preview; connecting via the toolbar's own button would route through the
persisted proxy URL, out of scope for a fix dispatch). The unit test above
covers the same logical property (suppressed ⇒ zero markers) at the pure-
function boundary, which is what changed.

## Gates (actual tails, this worktree)

`node_modules` was not installed in this fresh worktree; ran `npm install`
first (333 packages, no fix needed beyond that — the memory note re: vite
≥8.0.12 hanging vitest teardown did not reproduce: `vitest run` exited 0
both times it was run to completion).

**`npm run build`** (`vue-tsc -b && vite build`):
```
✓ 1081 modules transformed.
dist/index.html                     0.84 kB │ gzip:     0.51 kB
dist/assets/index-BnRW3y2b.css    116.12 kB │ gzip:    16.55 kB
dist/assets/index-ZD5Ylj0v.js   2,921.09 kB │ gzip: 1,032.47 kB
✓ built in 8.71s
```
(pre-existing chunk-size warning, unrelated to this change)

**`npx eslint .`**: no output — clean.

**`npm run test:run`**:
```
 Test Files  82 passed | 3 skipped (85)
      Tests  1105 passed | 4 skipped (1109)
Duration  100.46s
EXIT:0
```

## Files touched

- `frontend/src/components/board/BoardWidget.vue` — wire `:suppressed="pvHoverActive"`, comment update.
- `frontend/src/components/board/BoardVariationsOverlay.vue` — new `suppressed` prop, `markers` computed now delegates to the extracted pure function.
- `frontend/src/composables/board/board-variations-markers.ts` (new) — extracted `deriveVariationMarkers` pure function + `VariationMarker`/`DeriveVariationMarkersOptions` types.
- `frontend/tests/unit/composables/board-variations-markers.test.ts` (new) — Tier-1 unit tests, red-leg witnessed as above.
