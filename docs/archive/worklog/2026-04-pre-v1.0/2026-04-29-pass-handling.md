# KataGo wire pass-handling fix (release-scope item 4, pass half)

- **Status:** Shipped on `frontend/release-item-4-pass-handling`,
  2026-04-29. `npm run build` (vue-tsc + vite) passes.
- **Genre:** Worklog entry — frontend fix for the pass-handling
  bullet of release-scope item 4. The companion save-to-disk
  bullet shipped separately (`docs/worklog/2026-04-29-save-sgf.md`).
- **Date:** 2026-04-29.

## Bug

`services/analysis-service.ts` builds the `moves` array for KataGo's
analysis query at two sites (`analyzeRange` and `analyzeActiveNode`).
Both sites filter `m.type === 'place'` before mapping to
`[Player, KataCoord]`. Pass moves (`Move{type: 'pass'}`) are silently
dropped — KataGo receives a move list shorter than the actual
sequence, and analyses positions that diverge from the user's board
state from the first pass onward. No warning, no crash, just silently
wrong analysis. Matches the release-scope item 4 description verbatim.

## Why it surfaced

The `Move` type's `type: 'place' | 'pass'` discriminated union dates
back to before the strict-mode build sweep; the loader (`engine/util.ts::sgfToMove`)
correctly produces `{type: 'pass', x:0, y:0}` for empty SGF coords
(`B[]` / `W[]` and the legacy `tt`-on-≤19 convention). The wire
builders, however, were authored assuming all moves were placed
stones — the filter looks defensive, but its effect is to truncate
the move history every time a pass appears.

The receive direction handles passes correctly:
`composables/use-move-suggestions.ts::gtpToBoard` short-circuits on
`'pass'` (a pass-move suggestion is just not drawn). So KataGo's
protocol literal *is* the lowercase string `"pass"` — the codebase
just never emitted it on the way out.

## Fix

One new helper in `engine/util.ts`:

```ts
export function moveToKataCoord(m: Move): string {
  return m.type === 'pass' ? 'pass' : toGtp(m.x, m.y);
}
```

The two call sites in `analysis-service.ts` swap their filter+map
(`filter type==='place'` → `map toGtp`) for a `Move`-aware mapper:

```ts
const moves = pathUpToEnd
  .map(id => board.nodes[id]?.move ?? null)
  .filter((m): m is NonNullable<typeof m> => !!m)
  .map(m => [m.color, moveToKataCoord(m)] as [Player, KataCoord]);
```

Six lines net change (one helper added, two filter/map edits, one
import swap). `toGtp` itself is unchanged — it still has its
out-of-range fallback that returns `"pass"`, but that path no
longer carries the pass-handling load.

## Verification

`npm run build` passes (vue-tsc strict). End-to-end smoke deferred
to user — visiting an SGF with a pass and confirming the engine's
analysis at moves past the pass matches what KataGo would compute
on the actual board state.

## Files touched

```
frontend/src/engine/util.ts                    (one new helper, 11 lines)
frontend/src/services/analysis-service.ts      (one import swap + two map updates)
docs/worklog/2026-04-29-pass-handling.md       (this file)
docs/TODO.md                                   (Completed entry)
```

## Closing

Closes the pass-handling half of release-scope item 4. With the
save-to-disk half (PR #45) and this fix together, item 4's two
bundled concerns are both addressed.
