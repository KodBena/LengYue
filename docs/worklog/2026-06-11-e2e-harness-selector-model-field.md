# Worklog — e2e review-session harness threads the SELECTOR `model` field (2026-06-11)

> Audit trail for work-status item `e2e-harness-selector-model-field`;
> branch `bork/fix/e2e-harness-selector-model`, PR #398. The
> item was filed 2026-06-10 by the `review-scoring-named-seam` arc
> (PR #383), whose worklog
> (`docs/worklog/2026-06-10-review-scoring-named-seam.md`,
> "Verification") recorded both harness scenarios failing **upstream
> of that change** with `missing 'model' field for SELECTOR routing` —
> the harness predates SELECTOR and assumed a LEAF-pair topology,
> while the standing dev stack runs only the SELECTOR at
> `127.0.0.1:1235`. This fixes that incompatibility.

## The symptom, reproduced

The standing stack is SELECTOR-only. A SELECTOR refuses any analysis
query that carries no `model` field — confirmed against the live
proxy with a minimal no-model query:

```
{"id": "nomodel-test", "error": "missing 'model' field for SELECTOR routing", "field": "model"}
```

The same query with a healthy label routes and returns analysis:

```
{"id": "withmodel-test", "model": "b10c128", "isDuringSearch": ..., "moveInfos": [...]}
```

`review-session-harness.test.ts` issued its three engine-move calls
(position-gen `playEngineMoves`, human-simulator `queryEngineMove`,
and — indirectly — `analysisService`'s review-time analyze) with no
`model`, so on a SELECTOR every one was refused. The e2e tier was
silently unexercisable on the standing stack.

## The fix

The engine-move helpers already accept an optional `model`
(capability-negotiation arc, proxy v1.0.15; see
`composables/board/usePlayFromPosition.ts` —
`PlayEngineMovesOptions.model` / `QueryEngineMoveOptions.model`); the
sibling `autonomous-srs-loop.test.ts` already threads it. This change
brings `review-session-harness.test.ts` to the same shape, confined
to that one test file:

- **Topology resolution (`resolveRoles`).** A new `EngineRole` (`{ url,
  model: string | null }`) and a `resolveRoles()` that returns a
  `{ strong, weak }` pair. SELECTOR mode (`REVIEW_E2E_SELECTOR`, one
  URL + two labels) takes precedence; the original LEAF-pair mode
  (`REVIEW_E2E_STRONG` / `REVIEW_E2E_WEAK`, two URLs, `model: null`)
  is the fallback. `null` when neither is configured, which the
  suite's `skipIf(!ROLES)` reads to skip cleanly (a bare
  `npm run test:run` is still unaffected).
- **Configurable labels with healthy defaults.** `REVIEW_E2E_STRONG_MODEL`
  defaults to `b28c512nbt`, `REVIEW_E2E_WEAK_MODEL` to `b10c128` —
  two upstreams the live `query_models` advertised as `healthy: true`
  on 2026-06-11. The probe parser that discovers the label set lives
  in `src/engine/katago/version-probe.ts` (`parseModelsResponse`,
  which normalises SELECTOR `{label, healthy}` entries); the header
  points a future runner at it.
- **Threading the three call sites.** Position-gen `playEngineMoves`
  gets `model: strong.model ?? undefined`; the human-simulator
  `queryEngineMove` gets `model: weak.model ?? undefined`; and the
  review-time path gets `store.engine.selectedModel = strong.model`
  before `analysisService.connect()`, because the service injects
  `model: store.engine.selectedModel` on every outgoing query (see
  `analysis-service.ts`). Setting it to the strong label is what
  routes the review session's per-move analyze through the strong
  upstream — without it the service auto-selects its first advertised
  label, which need not be the strong one. The `?? undefined` keeps
  LEAF-pair mode wire-identical to the original (the field is omitted,
  not sent as `"null"`).
- **Ledger-bucket alignment falls out.** The harness's `sessionKeys`
  computation already passed `store.engine.selectedModel ?? undefined`
  into `deriveAnalysisKeys`, so setting `selectedModel` to the strong
  label means the review session writes to — and the harness reads
  from — the same `RawKey`/`EnrichedKey` bucket. No separate change
  was needed there.

The strong/weak-pair documentation in the file header is rewritten to
describe both topologies, the SELECTOR `model`-routing requirement,
and the two opt-in invocation shapes.

## Verification

- `npm install`, `npm run build` (vue-tsc -b + vite build): clean.
- `npx eslint .`: exit 0.
- `npm run test:run` (no e2e env vars): 888 passed, 4 skipped, 0
  failed — the e2e suites skip as designed.
- **Both e2e scenarios RUN against the live SELECTOR stack and pass.**
  `REVIEW_E2E_SELECTOR=ws://127.0.0.1:1235` against the standing
  SELECTOR (two healthy upstreams) plus the LengYue backend on
  `127.0.0.1:8764`:

  ```
  Test Files  1 passed (1)
       Tests  2 passed (2)
  ```

  Both scenarios (Black-to-move @ depth 20, White-to-move @ depth 21)
  ran all 20 turns with `status=ok` and `expected === recorded` to
  full precision on every turn — the harness's hard assertion that
  each recorded `userMoveScore` matches the independently-computed
  `visit_ratio` from the s_0 packet, with zero failing turns. The
  harness log shows the role split working: `strong=...model=b28c512nbt`
  for position-gen + review analyze, `weak=...model=b10c128` for the
  human-simulator, all through the one SELECTOR URL. No
  `missing 'model' field` errors. The original symptom is gone.

## Deferred / notes

- **Out-of-scope siblings (recorded loudly, not filed):** the
  `qeubo-smoke.test.ts` e2e is HTTP-only (no proxy `model` field) and
  needed no change; `autonomous-srs-loop.test.ts` already threads
  `model` and was untouched. `not-filed: both already correct, no
  defect to track`.
- **The `playEngineMoves` cursor-conflation latent twin** noted in
  `usePlayFromPosition.ts`'s `playEngineMoves` docstring (the
  no-deep-clone shared-cursor class, branded-path-types arc
  2026-06-10) is unaffected by this change and out of scope — it is
  already recorded against its own work-status note in that docstring.
- Todo DB untouched (read-only commission); the item's closure is the
  maintainer's curation.

---

License: Public Domain (The Unlicense).
