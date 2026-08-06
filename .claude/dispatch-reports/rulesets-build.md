# BUILD report — rulesets (Option A)

## Scope-vs-ruling conformance

Implements Option A exactly as ratified in
`.claude/dispatch-reports/design-engine-features.md` §RULESETS
(commissioner ruling, ledger row 110): exactly four hard-coded
presets (`AGA`, `Chinese`, `Japanese`, `Tromp-Taylor`), a total
case-insensitive `normalizeRuleset` with an explicit `'unknown'`
arm (no silent coercion), a dropdown as the sole UI surface (no
component-rules model), and the dropdown's value is exactly what
reaches the KataGo wire `rules` field. Licensing constraint
honored: nothing from
`https://lightvector.github.io/KataGo/rules.html` is quoted or
paraphrased anywhere in this change — the URL appears only as a
citation in `rulesets.ts`'s header comment (per the ruling: LengYue
Unlicense, KataGo MIT).

## Wire-spelling decision

KataGo wire spelling = lowercase of the canonical display name
(`AGA`→`aga`, `Chinese`→`chinese`, `Japanese`→`japanese`,
`Tromp-Taylor`→`tromp-taylor`), derived from the pre-existing
working `'tromp-taylor'` literal at the two query-builder call
sites, not from the KataGo docs page. Single home:
`rulesetToWireName` in `src/engine/rulesets.ts`.

## Files

- `frontend/src/engine/rulesets.ts` (new) — `RULESET_NAMES`,
  `RulesetName`, `RulesetResolution`, `normalizeRuleset` (sole
  `RulesetName` construction site), `rulesetToWireName`.
- `frontend/src/engine/util.ts` — new `getRulesetResolution(state)`
  accessor, parallel to `getKomi`/`getBoardSize`.
- `frontend/src/components/board/StatusBar.vue` — read-only rules
  text replaced with a `<select>` of the four names; explicit
  disabled "unrecognized — choose" placeholder option when
  `getRulesetResolution(board).kind === 'unknown'`; new `update-rules`
  emit parallel to `update-komi`.
- `frontend/src/App.vue` — new `handleUpdateRules` parallel to
  `handleUpdateKomi`, writing the canonical spelling to root `RU`;
  wired to `StatusBar`'s `@update-rules`.
- `frontend/src/services/analysis-service.ts` — both query builders
  (`analyzeRange`, `analyzeActiveNode`) now resolve the board's
  ruleset via `getRulesetResolution` and send
  `rulesetToWireName(resolution.name)` instead of the hardcoded
  `'tromp-taylor'`. On `kind === 'unknown'`, the method refuses
  construction (returns `null` before any side effect, including the
  visit-target write) and calls `pushSystemMessage('error', …)` with
  a new i18n key `analysis.rulesetUnrecognized`.
- `frontend/src/locales/en.json` — new keys `statusBar.editRules`,
  `statusBar.rulesUnrecognized`, `analysis.rulesetUnrecognized`.
- `frontend/FILES.md` — new row for `rulesets.ts`; `util.ts` row
  updated to mention `getRulesetResolution`.

## Flagged (not in scope, not fixed): fresh-board default RU

`createInitialBoard` (`src/store/board-factory.ts`, untouched —
outside the ratified touched-file inventory) never sets `RU`. Under
the ruling's fail-loud gate, a brand-new game (not loaded from SGF)
therefore starts in the `'unknown'` resolution state and every
analysis/ponder query on it refuses until the user picks a ruleset
from the dropdown — this is the "no ruleset chosen yet" state
Option A's own cons paragraph names, now also live on the
new-board path, not only on foreign-SGF loads. Surfacing this per
ADR-0002 rather than silently expanding scope to touch
`board-factory.ts`.

## Test-fixture collateral (pre-existing tests, RU-less SGF)

Two pre-existing integration suites used an SGF fixture with no
`RU` property (`analysis-service-restart-thunk.test.ts`,
`analysis-service-error-packet-narrowing.test.ts`); the new
fail-loud gate correctly refused their queries, breaking tests whose
actual subject is unrelated to rulesets. Fixed by adding
`RU[Chinese]` to both fixtures (each edit isolated with an inline
comment explaining why).

## Test names

- `tests/unit/engine/rulesets.test.ts` — `normalizeRuleset —
  totality`, `— case-insensitive resolution of all four names`
  (incl. `Tromp-Taylor` hyphen/space/case variants), `— explicit
  unknown arm (fail-loud, no silent coercion)`, `rulesetToWireName`.
- `tests/unit/engine/util.test.ts` — new `describe('getRulesetResolution', …)`
  block (4 cases: reads+normalizes, case-insensitive, missing→unknown,
  unrecognized→unknown).
- `tests/integration/analysis-service-ruleset.test.ts` — `AnalysisService
  ruleset wire assembly (analyzeRange)` (resolved-RU sends wire name,
  mixed-case resolves, unknown-RU refuses + system message, missing-RU
  refuses) and `(analyzeActiveNode)` (resolved sends wire name, unknown
  refuses + system message).

## Gate tails

```
$ npm run build
✓ 1081 modules transformed.
✓ built in 1.78s

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  83 passed | 3 skipped (86)
      Tests  1140 passed | 4 skipped (1144)
```

License: Public Domain (The Unlicense)
