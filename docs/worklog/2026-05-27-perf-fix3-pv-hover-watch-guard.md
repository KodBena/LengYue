# Perf Fix #3 — PV hover packet-watch fingerprint guard (Bug C)

- **Status:** Branch `frontend/perf-fix3-pv-hover-watch-guard`;
  awaiting user end-to-end test before PR open.
- **Genre:** Single-file SFC edit. Three small edits to
  `src/components/board/MoveSuggestions.vue`; no composable or
  store changes.
- **Date:** 2026-05-27.
- **Diagnostic substrate:**
  `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug C.
  Third of four sequenced perf-arc PRs.

## Context

The audit named the cascade: `MoveSuggestions.vue:133-137`'s
`watch(packet, ...)` re-fires `startPv` on every same-node
packet, even when the PV is structurally identical to the prior
packet. `startPv` (`use-pv-animation.ts:185-229`) always
reassigns `pvMoves.value` and `visible.value` to fresh
references — even when the `retained` set has identical content
— which invalidates the `displayStones` computed and forces
Vue to re-diff the `<g v-for="stone in displayStones">` and
re-evaluate every PV stone's `:style` binding.

Under a range query, packets arrive at the hovered node
frequently (each carrying updated visit counts / winrate /
scoreLead, but typically the same continuation in the
hovered move's PV array). Each arrival triggered the full
re-render cascade. Hover-jank symptom.

## Design — fingerprint short-circuit at the watcher

Three options were on the table:

| Option | Where | Cost |
|--------|-------|------|
| A. Guard inside `startPv` | use-pv-animation composable | API-level behaviour change; risk to other callers |
| B. Fingerprint at the watcher | MoveSuggestions.vue | Localised; no composable behaviour change |
| C. Decouple PV display from packet subscriptions | larger refactor | Out of scope for the bisectable fix sequence |

Chose **B**. The watcher exists specifically to support
"real-time PV updates during pondering" (per the file header);
guarding it with a fingerprint preserves that intent while
suppressing redundant restarts. No composable surface change,
no behaviour change for other `startPv` callers.

The fingerprint covers `(x, y, color, moveNumber)` per move —
catches actual PV changes (KataGo found a deeper continuation)
AND `currentMoveNumber` shifts (which annotate moveNumbers
differently). The first hover seeds the fingerprint in
`onDiskEnter` so the first post-hover packet's identical PV
short-circuits cleanly (no redundant first restart); `onLeave`
resets it defensively so a re-hover starts from a known-empty
state and the seed is the only authority.

## Shape of the change

Three edits inside `<script setup>`:

1. **`onDiskEnter`** — build the PV once into a local, seed
   `prevPvFingerprint` with its fingerprint, then call
   `startPv(pv)`. Previously rebuilt twice (once for
   `setHint`'s side effect path; now via the local).
2. **Packet watcher** — early-return on null hover or non-
   instant mode (was nested-if; flatter as guard clauses).
   Build the new PV, compute fingerprint, return if equal to
   stored. Otherwise update the stored fingerprint and call
   `startPv(pv)`. Inline comment names the cascade the guard
   prevents and the diagnostic substrate.
3. **`onLeave`** — reset `prevPvFingerprint = ''` after the
   existing `hoveredIndex.value = null` / `stopPv()` /
   `clearHint()` sequence.

Module-level state additions (inside the script setup
closure, just before the watcher):

```ts
let prevPvFingerprint = '';
function pvFingerprint(pv: PvMove[]): string {
  return pv.map(m => `${m.x}.${m.y}.${m.color}.${m.moveNumber}`).join('|');
}
```

`PvMove` is already imported at the top of the file from
`use-pv-animation`; no new imports needed.

## Multi-tasking preservation

Verified SAFE in the audit doc's per-fix evaluation.
`MoveSuggestions` is mounted only on the active board
(`App.vue:333-336`'s `<BoardWidget v-if="activeBoard" :key="activeBoard.id">`).
Background-board PV state doesn't exist; this change has no
surface there. Range / ponder queries on background boards
continue to populate the ledger and update the activity
indicator unchanged.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 654 frontend tests pass, 3 skipped
  (unchanged from pre-fix baseline).

User-side validation remains the gate: open the SPA, start a
range query on a position with several plausible candidate
moves (so packets arrive at high cadence), hover one of the
suggestions, confirm the PV preview no longer flickers /
animation-resets on each packet arrival. Cross-check: hover a
different suggestion mid-range-query — should snap to the new
PV (different fingerprint), no stale state. Hover-leave and
re-hover the same suggestion — should re-seed cleanly. The
instant-mode contract ("real-time PV updates during
pondering") is preserved for *legitimate* PV changes (KataGo
deepens the continuation); only no-op restarts are skipped.

## What stays

The fingerprint shape (`x.y.color.moveNumber`) is the minimum
that distinguishes meaningful PV changes. If a future change
adds rendering-relevant fields to `PvMove` (e.g., per-move
intensity, cluster annotation), the fingerprint extends in
lockstep — flagged in the inline comment.

## What follows

Fix #4 (global → per-board watcher conversion) is the
remaining sequenced fix. The audit's RISKY-CONDITIONAL
verdict on #4 carries the bulk of the implementation care
(every board-introduction path needs the watcher set up,
every removal path needs it torn down, with audit pairs O15
in `closeBoard` and O16 in `resetWorkspace`). Independent of
#1–#3 in the safety analysis.

License: Public Domain (The Unlicense)
