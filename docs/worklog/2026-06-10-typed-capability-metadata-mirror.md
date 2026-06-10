# Worklog — Typed capability-metadata mirror (2026-06-10)

> Audit trail for work-status item `typed-capability-metadata-mirror`,
> commissioned from the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`, §3.2). The
> finding: `capabilities` was `Record<string, Record<string, unknown>>` on
> both wire sides, so `available_value_bindings` was read through casts
> (`capability-injection.ts` unjustified `as readonly string[]`;
> `AnalysisControls.vue` guarded), and a proxy-side field reshape would
> silently hide the learned-VF dropdown. The learned-vf dispatch (line 150)
> had instructed an `AdaptiveReevaluateCapability` type that was never
> created.

## The change

- **Mirror interfaces** (`frontend/src/engine/katago/types.ts`): a new
  "Capability metadata mirror" section declares both wire sides —
  `AdaptiveReevaluateAdvertisedMetadata` / `CapabilityAdvertisement` for the
  `query_version` advertisement (the `:485` twin) and
  `AdaptiveReevaluateQueryMetadata` / `PerQueryCapabilities` for the
  per-query opt-in (the `:276` query side) — plus the shared
  `CapabilityMetadata` alias. Every interface keeps an
  `[key: string]: unknown` index signature: unknown capability *names* and
  unknown metadata *fields* are forward-compatible pass-throughs, never
  errors. `KataGoAnalysisQuery.capabilities` and
  `KataActionResponse.capabilities` now reference the mirror types.
- **Validation layered onto the existing seam**
  (`engine/katago/version-probe.ts::parseVersionResponse`): the declared
  fields of the one known typed capability (`adaptive_reevaluate`:
  `available_value_bindings` string[], `extra_visits` / `worst_quantile`
  number) are checked once at the trust boundary. A mismatched KNOWN
  capability **degrades that one capability** — dropped from the parsed
  dict and recorded on the new `VersionProbeResult.degraded` field
  (`CapabilityDegradation { capability, field, expected }`); the parser
  stays pure and cast-free (the typed value is reconstructed from
  control-flow-narrowed locals, no `as`). Unknown capability names keep
  passing through; non-dict metadata under unknown names keeps the
  original pinned silent-drop.
- **Loudness calibration** (`services/analysis-service.ts::probeEngineInfo`):
  each degradation surfaces at ADR-0002 levels 4/5 — a user-visible
  `pushSystemMessage('warning', …)` (new `analysis.capabilityDegraded` key,
  all four locale catalogs) plus `console.warn` with the structured entry
  and the raw payload. Deliberately **not** the connection-refusal path:
  refusal stays reserved for a missing `delta_analysis` per the
  capability-negotiation dispatch, and the refusal predicate is untouched
  by construction (it keys on `delta_analysis` presence only; a unit test
  pins that a degraded `adaptive_reevaluate` does not refuse).
- **Consumption-site casts deleted**: `capability-injection.ts`'s
  unjustified `as readonly string[]` (old line 203) and
  `AnalysisControls.vue`'s guarded
  `as { available_value_bindings?: unknown }` (old line 48) are both
  replaced by typed `?.` reads off the mirror.
  `buildPerQueryCapabilities` now takes/returns the mirror types and
  constructs the adaptive metadata as `AdaptiveReevaluateQueryMetadata`
  in one expression; `EngineInfo.capabilities` (`src/types.ts`) and
  `usePlayFromPosition.ts`'s harness pass-throughs are retyped to the
  mirror so the brand threads end to end.
- **Tests** (`frontend/tests/unit/engine/katago/`): a new
  "typed-mirror validation" describe block on `version-probe.test.ts`
  (well-formed pass-through, each declared-field mismatch degrading
  exactly one capability, the non-dict known-capability case, the
  refusal-surface-never-grows pin, unknown-name pass-through, undeclared
  metadata fields preserved) and learned-VF engagement tests on
  `capability-injection.test.ts` (advertised binding → `value_binding` +
  `allocation_algorithm: "learned_piecewise"` pair; un-advertised binding
  withholds the Phase 3 fields; default/hand-crafted bindings send none).
  The `AdaptiveReevaluateInput` fixtures gain the `valueBinding` field
  they had been silently omitting (the interface requires it; vitest
  doesn't typecheck, so the omission had never surfaced).

## Dispatch ride-along

`docs/dispatch/proxy-to-frontend-learned-vf.md` still read `Status: Open`
though both sides shipped. A dated status note (2026-06-10) is appended in
place per the ledger convention: SPA-side implementation shipped, the
typed-mirror instruction closed by this arc, and the named residue (the
FEATURES.md one-liner; the non-`en` `analysis.adaptive.valueBinding.*`
locale keys) recorded rather than silently absorbed.

## Notes and deferrals

- The validated metadata reconstruction re-assigns absent declared fields
  as explicit `undefined` own-properties — a TS-narrowing artefact, noted
  at the site; invisible to property reads, `?.`/`??` chains, and
  `toEqual`.
- Per-capability validators currently number exactly one
  (`adaptive_reevaluate` — the only capability with declared metadata
  fields). A future capability that grows a schema gets its own validator
  and a named branch in `parseVersionResponse`'s loop; the structure is
  noted there.
- The audit's below-the-line learned-vf residue (FEATURES.md line, non-en
  locale keys) is out of this arc's scope — recorded in the dispatch
  status note, not fixed here.
- Verification: `npm run build` (vue-tsc -b clean), `npm run test:run`
  (855 passed / 4 skipped), `npx eslint .` clean.

License: Public Domain (The Unlicense).
