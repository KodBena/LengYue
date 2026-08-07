# Match per-player overrides — build report

Ledger rows 593/594. Branch: `bork/feat/match-per-player-overrides`,
built in an isolated worktree (not the main checkout), head commit
`ea3ea11d`.

## Player-leg threading design

`MatchPlayer` is not a new closed union — it's a type alias in
`src/state/match-player-overrides.ts` for the existing `Player =
'B'|'W'` (`engine/katago/types.ts`). Keying is strictly on match
player, never on model: two match sides running the same model can
still carry different overrides (the motivating asymmetric-PDA case).

The "whose overrides apply" decision travels as a **plain function
argument**, never a shared mutable slot:

- `playEngineMatch`'s loop reads `matchBoard.turn` into a local
  `const playerColor` once per iteration (unchanged from the existing
  code — it already did this to pick `opts.black`/`opts.white`).
- That `const` is passed explicitly into `buildAnalyzeQuery(...,
  playerColor)` as a new optional 6th parameter.
- `buildAnalyzeQuery`, when given a `matchPlayer`, calls
  `finalizeMatchAnalysisRouting(unrouted, model, matchPlayer)` instead
  of the bare `finalizeAnalysisRouting`. `playEngineMoves` (the
  single-engine loop) never passes this argument, so it's unaffected
  and always takes the pre-existing `finalizeAnalysisRouting` path.
- `finalizeMatchAnalysisRouting` (new, in `query-routing.ts`) calls
  `finalizeAnalysisRouting` first (routing + global overrides, as
  before), then reads `activeMatchPlayerOverrides(player)` — a plain
  keyed lookup into the state module, using the `player` **argument
  it was just given**, not any ambient/global "current turn" flag —
  and shallow-merges it on top via the already-generic
  `mergeQueryOverrides`.

**Foreclosed alternative, named explicitly in code comments and here
per the commission's instruction:** a module-scope `let currentPlayer:
MatchPlayer` set before firing a query and read at merge/send time.
That shape is exactly the bug class the commission warned against —
`playEngineMatch` awaits `awaitFinalPacket` between building and
resolving each query, so if two match queries' build/send windows ever
overlapped (today's loop is sequential, but nothing about the routing
seam should depend on that), a shared "current player" pointer could
move between one query's build and its merge, letting a B query's
merge read W's overrides or vice versa. Threading the key as an
explicit, per-call argument captured in a local `const` makes that
timing-dependent leak unrepresentable: the merge always uses the key
its own caller handed it in that call, full stop. This is documented
in `match-player-overrides.ts`'s module docstring, `query-routing.ts`'s
header, and inline at both the `buildAnalyzeQuery` call site in
`playEngineMatch` and the `finalizeMatchAnalysisRouting` definition.

## Precedence vs. the global session-overrides surface

**Decision:** per-player overrides shallow-merge **over** the global
blanket override (`state/per-query-overrides.ts`), not the reverse,
and not exclusively. `finalizeMatchAnalysisRouting` applies
`finalizeAnalysisRouting` (global) first, then re-merges the player's
own set on top via `mergeQueryOverrides`, so per-player keys win on
collision and un-named keys fall through from the global set.

**Rejected alternatives** (stated in `match-player-overrides.ts` and
`query-routing.ts` headers, and exercised by the precedence test):

1. *Global wins over per-player.* Rejected — defeats the entire
   feature; a user configuring an explicit asymmetric override for one
   side should never have it silently clobbered by the blanket
   setting they left in place from unrelated single-engine work.
2. *Per-player replaces the global set entirely (no shallow merge).*
   Rejected — forces the user to duplicate every global key they still
   want into both per-player boxes, error-prone, and breaks the
   "global expresses every query, per-player refines" mental model
   the commission's own phrasing implies.
3. *Mutually exclusive surfaces (global XOR per-player active).*
   Rejected — arbitrary; composes worse than a simple override-wins
   merge and gives the user no way to express "PDA globally throttled,
   plus an extra per-side tweak."

Chosen shape mirrors `per-query-overrides.ts`'s own root-vs-
`overrideSettings` merge precedent: the more specific layer wins.

## UI idiom notes

- New `src/components/MatchPlayerOverridesConfig.vue`: same
  textarea/error/reset shape as `PerQueryOverridesConfig.vue`
  (itself following `RegistryEditor.vue`'s `expression-input` idiom,
  ADR-0019), parameterized by a `player: MatchPlayer` prop so one
  component serves both slots. Two instances mounted side-by-side in
  `EngineMatchModal.vue`'s new "Per-Player Overrides" section, below
  the existing per-color visits/model fields, visible regardless of
  SELECTOR mode (overrides apply independent of routing).
- i18n: `matchPlayerOverrides.*` keys added to `en.json`, following
  the existing `perQueryOverrides.*` keys' exact JSON-brace escaping
  (`{'{'}...{'}'}` literal syntax) so
  `tests/unit/i18n-messages-compile.test.ts` (which `t()`s every key)
  passes — confirmed green in the full run below, no crash.
- State is session-ephemeral (plain `reactive()` module state, no
  `GlobalStore` field, no migration — `migrations.ts` was not
  touched), same posture as the global surface and `visits-lerp.ts`.
  Not reset when the modal opens (matches the global surface's
  "for-the-time-being" persistence across the session).

## Ephemerality / ADR-0012 compliance

No schema change, no migration file touched. The per-player merge has
exactly one application home: `finalizeMatchAnalysisRouting`, which
itself routes every call through the pre-existing sole choke point
(`finalizeAnalysisRouting`) rather than duplicating the model-routing
or global-override logic. `mergeQueryOverrides` (generic over `Q`) is
reused unchanged from `per-query-overrides.ts`; called with a
`RoutedAnalysisQuery` input it returns a `RoutedAnalysisQuery` by
generic inference, so no second `RoutedAnalysisQuery` brand mint or
lint-fenced cast was needed outside the original sole-mint site.

## Tests (red-then-green, ADR-0021)

New: `frontend/tests/unit/match-player-overrides.test.ts`
- Both players start at the identity (empty) override, no error.
- Setting B does not affect W and vice versa (isolation).
- Both players hold independently-valid, different sets simultaneously.
- Invalid JSON on one player is refused (ADR-0002 never-half-apply)
  without disturbing the other player's state.
- `resetMatchPlayerOverrides(player)` clears only that player.
- Simulated-reload (`vi.resetModules`) starts both players empty.

Extended: `frontend/tests/unit/engine/katago/query-routing.test.ts`,
new `describe('finalizeMatchAnalysisRouting — ...')` block:
- Identity case: no global, no per-player configured → unchanged query.
- **Acceptance case** (verbatim from the commission): B gets
  `{"playoutDoublingAdvantage": 1.5}`, W gets `{}` → routed queries'
  `overrideSettings` differ accordingly (B carries the key, W has none).
- Cross-contamination check: B and W configured with *different*
  non-empty sets → each routed query carries only its own set,
  asserted with explicit `not.toHaveProperty` checks for the other
  side's key.
- Model (routing) leg still applies independently of the overrides merge.
- Precedence: global + per-player both set → per-player wins on
  collision, global's un-named keys still present, and a player with
  no per-player config still gets the global set alone.
- Invalid per-player override (ADR-0002) never applied for that
  player, independent of the other player's valid state.
- **Interleave test**: B → W → B built back-to-back with no reset
  between, each call carries only its own configured set — the
  runtime pin for the "no shared current-player state" design claim.
- No-mutation check on the input query.

No chromium, no `waitForTimeout` anywhere in the new/edited test files
— pure Tier-1 unit tests over the state module and the routing
factory.

## Gates (WITNESSED — all run in the isolated worktree after `npm install`)

- `npm run build` (`vue-tsc -b && vite build`): **WITNESSED**, green.
  `✓ 1110 modules transformed`, `✓ built in 1.88s` (pre-existing
  >500kB single-chunk warning only, unrelated to this change).
- `npx eslint .`: **WITNESSED**, clean — no output, no errors.
- `npm run test:run`: **WITNESSED**, green —
  `Test Files 117 passed | 3 skipped (120)`,
  `Tests 1511 passed | 4 skipped (1515)`. All new tests included in
  this count; no pre-existing test was modified in a way that changed
  its assertions (only the `beforeEach` in `query-routing.test.ts`
  gained a second reset call for the new state module).

## Files touched

- `frontend/src/state/match-player-overrides.ts` (new)
- `frontend/src/components/MatchPlayerOverridesConfig.vue` (new)
- `frontend/tests/unit/match-player-overrides.test.ts` (new)
- `frontend/src/engine/katago/query-routing.ts` (added
  `finalizeMatchAnalysisRouting`)
- `frontend/src/composables/board/usePlayFromPosition.ts`
  (`buildAnalyzeQuery` gained the optional `matchPlayer` argument;
  `playEngineMatch`'s call site threads `playerColor` through)
- `frontend/src/components/modals/EngineMatchModal.vue` (mounts two
  `MatchPlayerOverridesConfig` instances)
- `frontend/src/locales/en.json` (`matchPlayerOverrides.*`,
  `match.section.overrides` keys)
- `frontend/tests/unit/engine/katago/query-routing.test.ts` (new
  `finalizeMatchAnalysisRouting` describe block)

`migrations.ts` was not touched — no reason entered it (ephemeral,
session-only state per constraint 4).

## Summary

Implemented a per-match-player (Black/White) session-ephemeral
overrideSettings surface for the engine-vs-engine match, keyed on the
existing `Player` union rather than model, threaded through the
existing `finalizeAnalysisRouting` choke point via a new thin wrapper
`finalizeMatchAnalysisRouting`. The player leg rides each query as an
explicit function argument (`matchBoard.turn` → local `const
playerColor` → `buildAnalyzeQuery(..., playerColor)` →
`finalizeMatchAnalysisRouting(..., player)`) rather than any shared
"current player" module state, foreclosing the async-interleave
cross-player-leak bug class the commission named. Precedence: per-
player overrides shallow-merge over the global session overrides
(refine, not replace or exclude); rejected alternatives recorded in
both source headers. UI: two `MatchPlayerOverridesConfig.vue`
instances in `EngineMatchModal.vue`, following
`PerQueryOverridesConfig.vue`'s exact textarea/validate/reset idiom,
with i18n keys using the required `{'{'}...{'}'}` literal-brace escape.

Branch head: `ea3ea11d` on `bork/feat/match-per-player-overrides`
(isolated worktree, not pushed, main checkout untouched).

Gates: `npm run build` WITNESSED green; `npx eslint .` WITNESSED
clean; `npm run test:run` WITNESSED green (1511 passed / 4 skipped,
0 failed).
