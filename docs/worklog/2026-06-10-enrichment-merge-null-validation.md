# Worklog — enrichment-merge nested-null guard (postmortem §5.5) (2026-06-10)

> Audit trail for work-status item `enrichment-merge-null-validation`,
> Round 1 of executing the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.6). The
> guard closes the sharp edge the adaptive-deeper postmortem recorded as a
> §5.5 *observation* (not a numbered finding — it sits under "Smaller
> SPA-side observations worth surfacing"):
> `docs/notes/postmortem/postmortem-adaptive-deeper-enrichment-2026-05.md`.

## The change

- **The sharp edge.** `mergeRecords` in
  `frontend/src/services/analysis-ledger.ts` skips top-level `null` /
  `undefined` incoming values, but cannot see *inside* an object-typed leaf:
  a non-null inner record with null-bearing fields (e.g.
  `state[turn] = {Win: null}`, the shape a palette `delta_fn` producing NaN
  under asteval serialises to) replaced a populated leaf wholesale and
  silently. The postmortem observed one transient instance under a
  misconfigured palette; the 2026-06-08 stratification *widened* the
  exposure window by removing the visit gate from the enrichment merge path
  (`mergeEnrichment` is additive last-writer-wins, so no low-visit discard
  runs before the leaf merge).
- **Structural, instance-blind guard in the helper.** `mergeRecords` gains an
  optional caller-supplied `NestedRecordGuard` (`{label, escalate}`). It
  trips when a plain (non-array) object-typed incoming value whose own
  fields include `null`/`undefined` is about to replace a *populated* leaf
  (one carrying at least one non-nullish value). On trip it emits a
  structured `console.warn` (`label`, `key`, `nullFields`) — every
  occurrence — then invokes the caller's escalation. The merge then proceeds
  last-writer-wins unchanged: suppressing the replacement would mask the
  upstream anomaly behind stale data, the "recover by guessing" shape
  ADR-0002 forbids. The helper knows nothing about KataGo.
- **Scoped to the nested-record call site.** Only `mergeKataExtra`'s `state`
  leg supplies a guard; `deltas` / `cwt` are numeric-leaf records the
  existing top-level nullish check already covers (per the item
  description's scoping).
- **Terminal loudness: level 4, not level 3.** The item left the terminal
  between ADR-0002's level 3 (runtime exception) and level 4 (user-visible
  system message), leaning against a throw. Decided **level 4**
  (`pushSystemMessage('warning', …)`, i18n key
  `analysis.enrichmentNullLeafReplaced` in all four catalogs): the anomaly
  is wire-origin — the SPA neither caused it nor can fix it locally, and a
  throw inside `recordEnrichment` would halt the packet path mid-stream,
  degrading unrelated turns' enrichment for a condition the user can only
  act on by fixing the palette. Level 4 makes the anomaly user-visible and
  actionable while the system keeps running — "the rest of the system can
  continue" is exactly the hierarchy's framing. The user-visible terminal is
  de-duplicated **once per label per workspace session** (latch cleared in
  `purgeAll`) so a packet flood from one misconfigured palette cannot wipe
  the 50-message system log — the calibration ADR-0002's "Not 'spam the user
  with warnings'" note prescribes. Every occurrence still gets the level-5
  structured `console.warn`, so the developer-retrievable record stays
  complete.
- **KataGo calibration at the Go-typed call site.** The label
  (`'extra.state'`), the i18n message (which names palettes and the NaN→null
  wire mechanism), and the de-dup latch all live next to `mergeKataExtra`
  (typed over `KataExtra`); `mergeRecords` stays domain-blind. ADR-0002
  grounding: the general decision text (hierarchy of loudness); Rule 4 by
  analogy — the ledger sits post-ACL in the services layer, so
  "validate, don't coerce" applies in spirit at this merge boundary.
- **Tests.** Two new cases in
  `frontend/tests/integration/analysis-ledger-stratified.test.ts` (the
  existing `mergeEnrichment` home): the null-bearing packet fixture (the
  `as unknown as` cast is justified in-comment — it constructs exactly the
  type-lying wire packet the guard exists to catch) asserts merge semantics
  unchanged, the structured warn on every occurrence, one system message per
  label, and the `purgeAll` latch reset; a negative case proves silence when
  nothing populated is lost (absent leaf, empty leaf) or the incoming record
  is null-free.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) clean.
- `npm run test:run`: **845 passed** (+2 new), 4 skipped.
- `npx eslint` on the touched source files: clean (no lint-config change).
- Doc-graph regenerated (this worklog is a new node citing the audit and
  the postmortem).

## Notes and deferrals

- **Not changed:** merge behaviour (still additive last-writer-wins per
  leaf); the postmortem §5.5's *second* bullet (`mergeAnalysisPacket` /
  deeper-packet handling) stays deferred on the proxy `_diagnostic` channel
  per the postmortem's own framing; `stability-trajectory-store.ts`'s
  separately-flagged deferral is untouched.
- **Judgment call beyond the item text (named, not silent):** the
  once-per-label de-dup latch on the level-4 terminal and its `purgeAll`
  reset are implementation calibration the item didn't specify; rationale
  above. The level-5 warn remains per-occurrence, so no information is lost.
- No FEATURES.md change (defensive anomaly surfacing, not a user-facing
  capability change). No FILES.md change (no created/moved/deleted `src/`
  file; the `analysis-ledger.ts` row's purpose line is still accurate). No
  IDENTIFIERS.md change (no new brand). Work-status transition is left to
  the maintainer per the Round-1 commission (read-only on the todo DB).

License: Public Domain (The Unlicense).
