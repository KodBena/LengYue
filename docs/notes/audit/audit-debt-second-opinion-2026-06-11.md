# Audit — Debt second opinion after the 2026-06 campaign (2026-06-11)

An independent second opinion on the claim **"the obvious technical debt is
out of the way"**, made by the session that closed the 2026-06-10/11 debt
campaign (PRs #396–#414) and inherited by the maintainer with the caveat that
the claiming session's context had deteriorated. Commissioned by the
maintainer on 2026-06-11; coordinated by the interactive session;
point-in-time report per this directory's convention, not retro-edited.

## Method

Two read-only reviewers, commissioned per the session's model-tiering policy
(fleet shape maintainer-approved before launch):

- **Code-judgment reviewer (Opus)** — services error channels, store
  teardown/migrations, composable lifecycle/ownership, engine trust
  boundaries, test fake-fidelity; priority-tiered, depth over breadth,
  honest coverage accounting required.
- **Mechanical drift sweep (Sonnet)** — seven scripted checks over the
  mirror/marker layer: FILES.md↔tree both directions, IDENTIFIERS.md cite
  spot-check, eslint header↔rules, work-status pointers in code (verified
  read-only against the todo DB), unanchored-marker sweep, CI-gate
  existence, doc-graph dangling references.

An initial seven-slice fleet on the top tier was launched and stopped by the
maintainer minutes in on weekly-quota grounds; it produced bounded partial
reads and no artifacts, and nothing from it is cited here. Both used
commissions and both full reports are reproduced verbatim in the companion
appendix (`audit-debt-second-opinion-2026-06-11-appendix.md`), per ADR-0005
Rule 11; the stopped fleet's commissions are not reproduced (no verdict from
them is cited).

The coordinator re-probed every load-bearing reviewer claim before acting
(reviewer numerics are leads, not facts): the `legacy_number` formats in the
todo DB (only `27`/`30c`/`30d`/`32` survive — confirming the dead numeric
handles); the closeboard item's actual "zero teardown leaks found" standing
fact (present, verbatim); the claimed `container-query-recompute` store item
(does **not** exist — reviewer detail did not reproduce); the archived
`knob-registry-plan.md` location; and fresh line measurements for every
IDENTIFIERS.md cite rewritten (two rows had **path** moves the reviewer
reported as line drift: the chart composables live under
`src/composables/analysis/`).

## Verdict

**The claim holds, with a short residue list — "yes-with-residue" from both
reviewers independently.** The campaign's clearance was real: the auto-save
corrective is comprehensive (the fake derives its rejection through the same
production parse the real service uses); `BOARD_SCOPED_STORE_CELLS` is
exhaustive over the schema's per-board cells at HEAD; the migration rolling
archive is honored; 17 composables read end to end surfaced no new lifecycle
leaks; FILES.md is consistent in both directions (231/231); the eslint
header narrates exactly the rules that exist; CI gates exist as documented.

The residue: one med-severity tracked-but-undischarged code finding (the
analysis-subscribe union-erasing casts), three low file-boundary coercions
on the SGF read path, one bounded board-keyed teardown leak, and mechanical
mirror/anchor drift — all triaged below.

## Triage sweep (every finding, explicit disposition)

| # | Finding | Sev / conf | Disposition |
|---|---------|------------|-------------|
| 1 | `analysis-service.ts:714`/`:915` — subscribe callbacks cast the response union (`res as KataAnalysisResponse`); an error packet routed onto an analysis query id is read as an analysis variant; corruption path traced | med / verified | **Filed** `analysis-subscribe-union-narrowing` (open/active) — spun out of `silent-coercion-protocol-boundaries-audit` per the consolidation's invisible-rider observation; dated evidence note appended to the parent item |
| 2 | `analysis-persistence-service.ts` — `dirtyVersions` (`:279`) and `autoSaveErrors` (`:290`) are board-keyed with no per-board release verb; `closeBoard`'s `discard()` clears `summaries` only; all three drain only at `forgetAll` | low / verified | **Filed** `persistence-board-keyed-drain` (open/future); dated note on `closeboard-class-b-teardown-shape` qualifies its "zero teardown leaks found" standing fact and surfaces that item's own "any Class-B teardown leak materializes" re-surface clause for the maintainer to rule on |
| 3 | SGF file-trust boundary: `sgf-loader.ts:16` (`SZ[garbage]` → NaN geometry), `engine/util.ts::sgfToMove` (unbounded coordinate arithmetic), `sgf-loader.ts:142` (illegal-move notice DEV-only) | low-med / verified | **Filed** `sgf-file-boundary-coercions` (open/future) — one arc, one surface |
| 4 | `katago-client.ts:90` — wire JSON enters `KataGoResponse` via type *annotation*, escaping the cast-justification lint (the lint quantifies over assertions, not annotations); `AnalysisControls.vue:161` `isStorageError` duck-guard skips per-kind leg validation | low-med / verified | **Evidence note** appended to `silent-coercion-protocol-boundaries-audit` (same boundary family; includes the lint-reach observation) |
| 5 | IDENTIFIERS.md construction-site drift: seven rows 5–60 lines stale; re-measurement found two rows additionally **path**-stale (chart composables moved to `composables/analysis/`) and three unlisted justified `ColorMoveIndex` re-mints (`MergedDeltaPanel.vue:259,276,288`) | low / verified | **Fixed in this PR** — every rewritten cite freshly measured |
| 6 | `api-client.ts` — "(item 20)" and "(TODO item 28)" handles resolve to nothing (DB keeps only legacy `27`/`30c`/`30d`/`32`); both annotate *shipped* behavior (the error-surfacing contract; the implemented 401 silent-retry) | med / verified | **Fixed in this PR** — dead handles dropped; the doc prose, which is accurate, stands |
| 7 | Dead doc anchors: three comments cite the retired `deferred-items.md` (BoardDisplay.vue, MoveSuggestions.vue, store/schema.ts), one cites "Future projects in docs/TODO.md" (HeatmapChart.vue) | low / verified | **Fixed in this PR** — re-anchored to `pv-overlay-typography-calibration` and `polymorphic-chart-renderer` (both verified open) |
| 8 | `AnalysisChartPanel.vue:49,:130` — historical "container-query recompute" ledger references; the concern is fixed in code (ResizeObserver), only the ledger handle is dead. The Sonnet report's claim that a `container-query-recompute` store item exists **did not reproduce** (zero rows) | low / verified | **Fixed in this PR** — marked "since-dissolved deferred-items ledger"; reviewer-detail correction recorded here |
| 9 | `useQeubo.ts:865` — "Phase 5 deferred fix, knob-registry-plan §11 follow-up" | low / verified | **No action** — the anchor resolves (`docs/archive/notes/design/knob-registry-plan.md`) and the comment describes the *implemented* follow-up. Honesty note: the archived plan was not read end to end; only handle resolution and the code's present-tense state were verified |
| 10 | Doc-graph live-missing danglers (12) and three frontend docs outside the graph node set | low | **Declined** — none frontend-sourced; `docs/doc-graph-report.md` is the designated surface for these |

Informational, no action: the `serializeActivePath` class is remediated (the
debug-surface symbol name survives deliberately); app-lifetime singleton
watchers are documented design; zero `switch` statements over wire
vocabularies exist in the engine tier (the closed action union is unswitched
— latent, not present, debt).

## Coverage and limits

Per the reviewers' own accounting (full text in the appendix): the Opus
review is strongest on services/store/composables/engine boundaries and
fake-fidelity, and did **not** read `analysis-service.ts` (60 KB) end to end
— only its cast sites and error region — which is exactly where the one
med-severity residual lives; `silent-coercion-protocol-boundaries-audit`
already owns that surface. The Sonnet sweep ran all seven checks with
nothing skipped; one of its secondary details was corrected on re-probe
(row 8). The licensing firewall (`backend/qeubo/`) was respected by both.
No performance claims are made anywhere in this audit (ADR-0009).

## Store actions applied (2026-06-11, coordinator-attributed)

Three items filed (`analysis-subscribe-union-narrowing` active;
`persistence-board-keyed-drain`, `sgf-file-boundary-coercions` future), each
labeled `bug` with `source` + `audit` refs; two dated evidence notes
appended (`silent-coercion-protocol-boundaries-audit`,
`closeboard-class-b-teardown-shape`); `work_status_violations` clean after
each write.

License: Public Domain (The Unlicense).
