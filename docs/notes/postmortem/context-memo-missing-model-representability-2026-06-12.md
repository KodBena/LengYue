# Context memorandum — for the missing-`model` representability postmortem

> Written 2026-06-12 by the coordinator session that held the full
> incident context, at the moment of filing work-status item
> `postmortem-missing-model-representability` (maintainer
> token-constrained; the postmortem itself is parked). This memo is
> INPUT to that postmortem — the context that would otherwise be lost
> with the session — not the postmortem. Hypotheses below are candidates
> to test, not conclusions.

## The question the postmortem must answer

Not "what was the bug" (that is fixed and worklogged) but **why was it
still representable**: the defect class — an optional wire field
(`KataGoAnalysisQuery.model?`) that N independent query builders must
each remember by hand — survived the entire 2026-06 audit/refactoring
program, and even **fired once mid-program without generalizing**.

## Incident chain (refs)

1. **2026-06-11 — first occurrence.** The e2e harness hit the missing
   SELECTOR `model` leg; fixed point-wise.
   `docs/worklog/2026-06-11-e2e-harness-selector-model-field.md`.
   *Postmortem should check that worklog's deferral/not-filed section:
   was the class named? Was a structural item declined, or never
   considered?*
2. **2026-06-12 — second occurrence.** Mint-time komi calibration
   (PR #436) shipped a third query builder without the leg. It
   compiled; the commission's review gates covered the FRAMING axis
   explicitly (WHITE/BLACK/SIDETOMOVE sign rules, hard-gated) but had
   no routing-leg gate; the coordinator's line-by-line diff-read of
   `buildCalibrationQuery` ALSO missed the absent leg, with the
   SELECTOR contract resident in the umbrella CLAUDE.md the reviewer
   had read. First live mint failed on the wire:
   `missing 'model' field for SELECTOR routing`.
3. **2026-06-12 — reactive structural fix.** PR #438: the
   `RoutedAnalysisQuery` brand + `finalizeAnalysisRouting` seam
   (`frontend/src/engine/katago/query-routing.ts`); subscribe accepts
   only the brand; lint fences the cast; all three builders migrated.
   `docs/worklog/2026-06-12-analysis-query-routing-brand.md` (includes
   guard-liveness probes and the known aliased-import lint evasion).

## The audit sequence that missed it (walk-list)

- SPA history audit + consolidation:
  `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`,
  `docs/notes/audit/audit-consolidation-history-lessons-2026-06-10.md`.
- The refactoring waves from that audit (PRs #415–#427 arc; per-arc
  worklogs), the debt second-opinion
  (`docs/notes/audit/audit-debt-second-opinion-2026-06-11.md`), and the
  straggler sweeps.
- ADR-effectiveness audits: work-status item `adr-effectiveness-audits`
  (still open — the postmortem should note what its scope WOULD have
  covered).
- Notably: work-status item `silent-coercion-protocol-boundaries-audit`
  (open, never executed) is the audit whose scope sits CLOSEST to this
  class — optional wire legs are silent-omission cousins of silent
  coercion. The miss may partly be "the right audit existed but stayed
  in the backlog".

## Candidate hypotheses (test, don't adopt)

H1. **Absence-shaped defects are invisible to present-code audits.**
    Every audit walked existing files; "a leg a FUTURE builder must
    remember" exists in no file. The audits' unit of inspection was the
    artifact, not the obligation.
H2. **The multi-writer detector keys on state slots, not assembly
    duplication.** The hack-rationalization / generality discipline
    fires on ">1 writer to a state cell"; three builders hand-rolling
    the same spread was duplication of an OBLIGATION, which nobody
    modeled as a writer set. (Ironically, the #436 arc's own
    out-of-frame audit caught a *different* duplication — `connectFresh`
    — in the very same file, and still not the missing leg: refutation
    prompts target what is present.)
H3. **Point-wise fix culture at the first occurrence.** The 2026-06-11
    e2e fix repaired the call site. Whether a structural follow-up was
    considered-and-declined or simply not conceived is checkable in
    that worklog; the answer differentiates a judgment error from a
    process gap.
H4. **Contract knowledge lived in prose, not in types.** The SELECTOR
    contract was documented (umbrella CLAUDE.md, types.ts comments) and
    read by both implementer and reviewer — and still didn't bind.
    Documentation-as-guard failed where type-as-guard (the eventual
    fix) cannot.
H5. **Review economics.** The arc ran generation on Opus with a single
    Fable diff-read gate whose stated hard gates (framing) consumed the
    review attention budget; ungated axes got read-through coverage
    only.

## Sibling-latent-risk sweep (the postmortem's concrete deliverable)

The same optional-leg × multi-builder shape exists for other wire
fields. At minimum: `capabilities` (per-query opt-in, v1.0.14) — the
calibration builder OMITS it entirely, which is an UNDECIDED omission
rather than a decided one (probably benign for a one-shot eval: no
delta/transposition/adaptive — but nothing forced the decision).
`overrideSettings`, `analysis_config`, the report-cadence pair, and
cache flags are likewise per-builder. The postmortem should either
extend the routing-seam pattern (a wider finalize step owning all
proxy-control legs) or explicitly record why per-builder assembly is
acceptable for each remaining leg.

## Unrelated but co-filed (do not conflate)

`ponder-ceiling-false-positive-non-selector` — the ponder-exhausted
warning false-positive on non-SELECTOR proxies (emit-site heuristic at
`analysis-service.ts` ~1180 equates any ponder final with ceiling
exhaustion). Filed the same day from the same smoke-test session;
NOT part of this postmortem's scope, listed here only because the two
filings share the discovery context.

License: Public Domain (The Unlicense).
