# Worklog — analysis-query routing brand (2026-06-12)

> Live-defect fix + structural guard for work-status item
> `analysis-query-routing-brand`; branch
> `bork/fix/analysis-query-routing-brand`. Coordinator-authored.

## The incident

The first live mint with komi calibration (PR #436, same day) failed:
`KataGo error for queryId=komi-calibrate-…: missing 'model' field for
SELECTOR routing`. The calibration path's query builder omitted the
SELECTOR `model` leg; the optional wire field (`model?: string`,
correctly optional — the field has no meaning on a non-SELECTOR proxy)
let the omission compile, and the failure surfaced on the wire instead.

Second occurrence of the class: the e2e harness hit the same missing
leg first (`docs/worklog/2026-06-11-e2e-harness-selector-model-field.md`).
Root cause both times: **per-path query assembly** — three independent
builders (analysis-service ×2 sites, the engine-play harness, komi
calibration) each had to remember the
`...(selectedModel !== null ? { model: selectedModel } : {})` spread by
hand. Optional field + N builders = a memory test, the maintainer's
verdict: this bug should have been unrepresentable.

## The seam (made unrepresentable)

`src/engine/katago/query-routing.ts` [B3]:

- `RoutedAnalysisQuery` — `Brand<KataGoAnalysisQuery, …>`; an analysis
  query whose routing decision has been made.
- `UnroutedAnalysisQuery` — `Omit<…, 'model'> & { model?: never }`; what
  builders assemble. The `never` leg forbids smuggling the field past
  the seam, so the routing slot has exactly one writer.
- `finalizeAnalysisRouting(query, selectedModel: string | null)` — the
  sole mint. `string` injects the leg; `null` is the deliberate
  LEAF-mode omission (an explicit claim, not a default).

Enforcement, two layers:

1. **Type.** `KataGoClient.subscribe<Q extends RoutedAnalysisQuery |
   KataGoActionQuery>` and `fresh-eval.awaitFinalPacket(query:
   RoutedAnalysisQuery)` — an assembled-but-unrouted analysis query
   fails to COMPILE at the send seam. Pinned by two new negative
   assertions in `subscribe-narrowing.type-test.ts`.
2. **Lint.** `as RoutedAnalysisQuery` / `<RoutedAnalysisQuery>` casts
   are `no-restricted-syntax` errors (selectors in the shared
   cast-hygiene block of `eslint.config.js`); the factory carries the
   one justified inline disable at the mint.

Migrated builders (their hand-rolled model spreads deleted):
`analysis-service.ts` (both query sites; `selectedModel` now flows only
through the seam), `usePlayFromPosition.buildAnalyzeQuery` (the `model`
parameter is now REQUIRED `string | null` — callers state the decision;
public opts shapes unchanged), `useKomiCalibration` (the fix proper:
routes by `store.engine.selectedModel`, the same source the live
analysis path uses).

## Guard-liveness probes (both restored after)

- Loosening `subscribe`'s constraint back to `KataGoQuery` → both new
  `@ts-expect-error` directives go unused → `vue-tsc -b` fails (2
  hits). The type gate is live.
- A forged `({} as unknown) as RoutedAnalysisQuery` in a scratch src
  file → 1 `no-restricted-syntax` error. The lint gate is live.

**Known residue (honest gap):** the lint selector keys on the
identifier name, so an ALIASED import
(`import { RoutedAnalysisQuery as X }` + `as X`) evades it — verified
during probing. That is a deliberate evasion, not an accidental
omission; it remains covered by the repo's no-unjustified-`as` review
discipline and the type-test. Recorded here rather than chased with a
heavier scope-aware lint (proportionality). `not-filed:` — surfaced,
accepted.

## Gates run

- `vue-tsc -b` clean; `npx eslint .` clean.
- `npm run test:run`: 1092 passed | 4 skipped (+4: the new
  `query-routing.test.ts` — model injected / omitted-on-null /
  legs-preserved / input-not-mutated).
- `node tools/band-conformance/check.mjs --check`: 30 at the 30
  baseline (the new file is [B3] importing [B3] + the [B1] Brand
  utility — no new edges).
- Doc-graph regenerated (this worklog is a structural add).

License: Public Domain (The Unlicense).
