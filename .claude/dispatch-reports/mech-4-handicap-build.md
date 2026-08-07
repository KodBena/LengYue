# mech-4-handicap-affordance — build report

(Written in the worktree's own `.claude/dispatch-reports/` — the Write
tool refused the main-checkout path
`/home/bork/w/omega/.claude/dispatch-reports/...` because this agent
is worktree-isolated. Orchestrator: please copy/merge this into the
main checkout's `.claude/dispatch-reports/` if that's the expected
durable landing path.)

Ledger slug: `mech-4-handicap-affordance`. Branch:
`bork/feat/mech-4-handicap-affordance`. Salvage base commit:
`6b8f74eb` (WIP snapshot, force-stopped mid-build). Built in worktree
`/home/bork/w/omega/.claude/worktrees/agent-aac2b7ea9c64e189c`.

## What was salvaged vs redone, and why

**Salvaged as-is** (read critically, judged sound, kept unchanged):

- `src/engine/handicap.ts` — placement tables (19×19 N=2..9, 13×13
  N=2..5, 9×9 N=2..4), `applyHandicap` (root AB stones via the
  existing `applySetup` substrate, `turn`/`PL[W]`/`HA[n]`/default-KM
  writes, re-selection-replaces-not-appends behaviour,
  `HandicapOnStartedGameError` refusal). One bug found and fixed here
  (below).
- `src/composables/board/useHandicap.ts` — panel state + the
  apply/refusal orchestration, module-scope singleton mirroring
  `useSetupTools.ts`'s own precedent, `resetWorkspace` teardown
  registration.
- `src/components/chrome/HandicapPanel.vue` and the
  `SetupToolPalette.vue` extension (trigger row + panel mount, closed
  on palette dismiss).
- `src/engine/sgf-loader.ts` (root turn seeded via new
  `getInitialPlayer`) and `src/engine/util.ts` (`getInitialPlayer`
  itself — reads root `PL`, defaults `'B'`).
- `src/services/analysis-service.ts` — `initialPlayer` added to both
  `analyzeRange`'s and `analyzeActiveNode`'s outgoing wire queries,
  omitted unless `'W'` (KataGo's own default is Black).
- `en.json` handicap strings, `FILES.md`'s `handicap.ts` /
  `sgf-loader.ts` / `util.ts` row updates.

**Redone / added this session:**

- **Type bug fix** (`src/engine/handicap.ts`): `HandicapTable.center`
  was declared `readonly [number, number]` (a genuinely-readonly
  tuple). Mixing it into the same array literal as the mutable
  `[number, number]` tuples destructured from `corners`/`edges`
  (`readonly [number, number][]` — the `readonly` there qualifies the
  *array*, not the tuple) failed `vue-tsc -b` at cases N=5/7/9 (TS4104,
  "readonly ... cannot be assigned to the mutable type"). Fixed by
  changing the field to `readonly center: [number, number]` — property
  binding readonly, tuple itself mutable, consistent with how
  `corners`/`edges` are shaped. `npm run build` was RED before this fix
  (WITNESSED); GREEN after (see Exit codes below).
- **`as`-cast justification** (`src/engine/handicap.ts`,
  `isHandicapBoardSize`): the pre-existing `HANDICAP_BOARD_SIZES as
  readonly number[]` cast had no adjacent comment; the project's
  `local/justification-adjacency` ESLint rule (frontend/CLAUDE.md: "an
  `as` needs a justification in a comment or it doesn't ship") flagged
  it. Added a one-line justification above the cast.
- **ESLint allowlist entry** (`eslint.config.js`): `useHandicap.ts`'s
  `updateBoardState(...)` call tripped
  `local/board-mutation-entry-point` (an unclassified board-mutation
  entry point). Added it to the rule's allowlist next to
  `useSetupTools.ts`, same reasoning — a pre-game setup edit, not a
  user MOVE, no grading applies.
- **`FILES.md` rows for the two new files** — `HandicapPanel.vue` and
  `useHandicap.ts` had NO entries at all in the salvaged commit
  (frontend/CLAUDE.md requires a same-PR row for every new
  TypeScript/Vue file). Added both, next to their `SetupToolPalette.vue`
  / `useSetupTools.ts` siblings.
- **All test coverage** — the salvaged WIP commit shipped ZERO tests
  (confirmed via `git diff --stat` against `next`: 9 files touched,
  none under `tests/`). Wrote three test files' worth of coverage from
  scratch (below; two new test files).

## Design choices already made by the salvaged code (kept, not redone)

- **Placement source**: GNU Go's `handicap.c` table shape (corners →
  edges → center), reproduced by Sabaki/q5go/most SGF handicap
  generators. Corner ORDER is this module's own fixed pick (board has
  4-fold symmetry, no rules fact pins a "first" corner) — documented
  explicitly in the module header as NOT claimed to match any one
  external tool byte-for-byte, only the canonical N→point-count
  structure, which is universal. One quirk worth flagging: the table
  is **not monotonic** in N — tengen (center) is present at N=5,
  absent at N=6, present again at N=7, absent at N=8, present at N=9
  (this is the real historical GNU Go table, not a table bug). My
  first draft of a "monotonic superset" test was WRONG against this
  real table and had to be corrected; the corrected test pins the
  non-monotonic seam explicitly instead of assuming it away.
- **Board-size scope + rejected alternative**: 19×19 gets the full
  N=2..9 range; 13×13 caps at N=5, 9×9 caps at N=4 — rejected:
  extending N further on smaller boards, because (per the module
  header) there is no widely-agreed convention past "corners, then
  center" for 13×13/9×9, and Sabaki/q5go both cap similarly. An
  unsupported size (anything but 19/13/9) gets `null`/`[]`, not a
  guessed table — the UI disables rather than guesses (ADR-0002).
- **Komi**: flat `HANDICAP_KOMI = 0.5` across all four ratified
  rulesets — rejected: per-ruleset komi values, because (per the
  module's own doc comment) there is no widely-divergent
  per-ruleset handicap-komi convention this codebase's ruleset set
  actually disagrees on; nearly every Go client defaults a handicap
  game to 0.5 regardless of scoring ruleset. Stays user-editable
  after seeding.
- **Placement surface — rejected alternative**: a new-board-size
  dialog with an integrated handicap picker was the other option the
  charter named; the salvaged code instead extended the EXISTING
  setup-toolkit palette (`SetupToolPalette.vue`) with a second
  click-toggle trigger row + sub-panel. Rejected the new-board-dialog
  route because this codebase's "new board" affordance
  (`SidebarWidget.vue`'s `handleAdd`) always creates a blank 19×19 via
  `createInitialBoard()` with no size parameter at all — a size-aware
  new-board flow doesn't exist yet, and inventing one was out of this
  charter's scope (the handicap AFFORDANCE, not a new-board-size
  feature). The setup-toolkit palette already reads the ACTIVE
  board's actual size (`getBoardSize`, works for any board however it
  got its size — including one loaded from an SGF with `SZ[13]`), so
  the affordance is correct for 13×13/9×9 boards without depending on
  board creation. This is also the ADR-0019 genre-conventional home
  per the charter's own citation (q5go/cgoban keep handicap at
  game-setup chrome, not buried in a modal); click-toggle throughout,
  no hover.
- **Refusal is engine-level, not UI-level**: `applyHandicap` itself
  throws `HandicapOnStartedGameError` when the root already has
  children (a move played) — the composable is a thin catch-and-notify
  wrapper (`pushSystemMessage('warning', …)`), not a duplicate guard.
  One substrate, one place the invariant is enforced.

## Placement-table convention source

GNU Go's `handicap.c` N→point progression (corners incrementally for
N=2-4, tengen at N=5, edge hoshi from N=6, tengen+edges combination for
N=7-9) — the same table Sabaki, q5go, and most SGF handicap generators
reproduce. Cited and reproduced in `src/engine/handicap.ts`'s own
module header; not independently re-verified against GNU Go's C source
this session (WITNESSED only for the STRUCTURE as documented in the
salvaged header prose, taken on trust from the prior builder's
citation — flagging this as the one unverified provenance claim in
this report, per the "claims carry witnesses" durable decision).

## Per-claim evidentiary status

1. **Placement-table unit tests for 19/13/9 at each valid N** —
   WITNESSED. `tests/unit/engine/handicap.test.ts`, 37 tests: exact
   point-set assertions for every N on all three sizes, in-bounds
   checks, the N=7→8 non-monotonic tengen seam pinned explicitly,
   unsupported-size (`21`) rejection.
2. **White moves first after placement** — WITNESSED. Same file:
   `applyHandicap`'s `board.turn === 'W'` and root `PL[W]` both
   asserted; SGF-reload round trip also re-asserts `turn === 'W'` via
   `getInitialPlayer`.
3. **Handicap-appropriate default komi** — WITNESSED (design choice:
   uniform 0.5, see above). Tests assert `KM[0.5]` seeded, and that an
   already-explicit `KM` is NOT overridden.
4. **SGF round-trip AB[]+HA[n]; loading HA+AB works** — WITNESSED.
   `applyHandicap — SGF round trip` describe block: serializes,
   asserts `HA[4]`/`AB(...)×4`/`PL[W]` substrings, reloads, re-asserts
   stones + `turn`. A second test loads a **hand-authored** SGF
   (`HA[2]AB[cg][gc]`, no `PL`) to exercise the loader's generic
   property carry-through independent of this feature's own writer.
5. **Engine initialStones on analysis (query-builder level)** —
   WITNESSED. New file
   `tests/integration/analysis-service-handicap-query.test.ts`, 4
   tests against the REAL `analysisService` singleton + a mock
   `WebSocket`: `analyzeRange` and `analyzeActiveNode` both send
   `initialStones` (4 `['B', coord]` entries) and `initialPlayer:
   'W'`; a non-handicap board omits both fields (negative control); a
   handicap board with one played move still carries the root
   `initialStones`/`initialPlayer` alongside the real `moves` list.
   One harness bug found and fixed while writing this: the mock
   `WebSocket.close()` must fire `onclose` (mirroring
   `analysis-service-error-packet-narrowing.test.ts`'s own mock) or
   `KataGoClient`'s `isConnecting` latch never resets between tests
   and every `beforeEach`'s `connect()` after the first silently
   no-ops.
6. **Loud refusal on non-empty game** — WITNESSED.
   `applyHandicap` test: `applyGoMove` then `applyHandicap` throws
   `HandicapOnStartedGameError`. UI-layer catch
   (`useHandicap.selectHandicap` → `pushSystemMessage('warning', …)`)
   is READ, not independently tested this session — UNEXERCISED at
   the composable/integration tier (no `tests/integration` file for
   `useHandicap.ts` itself); the engine-level throw is the
   acceptance-registered claim and is WITNESSED.
7. **Click-reachable, no hover-only; genre-conventional placement** —
   WITNESSED via source read: trigger button + panel buttons, no
   `mouseenter`/`:hover`-gated reveal logic anywhere in
   `HandicapPanel.vue`/`SetupToolPalette.vue`'s script (CSS `:hover`
   present only for cosmetic border/color, not visibility).
8. **Keybinding domain registration** — N/A, correctly. No new
   keybinding action id was introduced (grep confirms no keybindings
   diff in this feature); KeybindingsView's `KNOWN_DOMAINS` was left
   untouched, as it should be.
9. **`npm run build` exit 0** — WITNESSED (see Exit codes).
10. **`npm run test:run` exit 0** — WITNESSED (see Exit codes).

## Exit codes

- `npm run build` (first attempt, salvaged code as-is): **exit 2**
  (TS4104 × 3 in `src/engine/handicap.ts`, cases N=5/7/9's `center`
  mixing). Fixed (see above).
- `npm run build` (after fix): **exit 0**.
  (`vue-tsc -b && vite build`; 1123 modules transformed, dist chunk
  size warning only — pre-existing, unrelated to this feature.)
- `npm run test:run`: **exit 0** — 1642 passed, 4 skipped, 128 test
  files passed / 3 skipped, 0 failed. Run twice (before and after the
  ESLint/type fixes) with identical pass counts both times.
- `npx eslint <touched files>`: **exit 0**, no output — clean after
  the two fixes (justification-adjacency cast comment,
  board-mutation-entry-point allowlist entry).

## Files touched this session (on top of the salvaged commit)

- `frontend/src/engine/handicap.ts` — type fix (`center` field) + cast
  justification comment.
- `frontend/eslint.config.js` — `useHandicap.ts` allowlist entry.
- `frontend/FILES.md` — added `HandicapPanel.vue` and `useHandicap.ts`
  rows (were missing from the salvaged commit).
- `frontend/tests/unit/engine/handicap.test.ts` — new, 37 tests.
- `frontend/tests/integration/analysis-service-handicap-query.test.ts`
  — new, 4 tests.

## Branch / commit

Work committed on `bork/feat/mech-4-handicap-affordance` (built from
worktree `/home/bork/w/omega/.claude/worktrees/agent-aac2b7ea9c64e189c`,
fast-forwarded onto the salvage commit `6b8f74eb`). See the worktree's
`git log` for the exact commit SHA of this session's fix-up commit,
added after this report is written.
