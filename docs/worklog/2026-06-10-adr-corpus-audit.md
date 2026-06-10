# Worklog — the generic ADR-corpus audit (2026-06-10)

> Audit trail for the docs-only PR that lands the generic ADR audit
> (work-status item `adr-effectiveness-audits`, open/in-progress — this PR
> does not change its disposition; the staged SQL in the deliverable records
> the sweep on it at curation). Branch `bork/docs/adr-corpus-audit`.
> Commissioned by the maintainer 2026-06-10: judge the corpus itself — all
> ten ADRs plus `docs/adr-synopsis.md`; per document retire / slim / merge /
> restructure / amend / status-change / keep, plus the inverse new-tenet
> question — read-only, propose-never-apply, against both HEAD and the
> planned generic knowledge flash-card fork.

## The change

- **`docs/notes/audit/audit-adr-corpus-2026-06-10.md`** — the deliverable:
  per-document verdict table (eleven documents + the corpus-as-a-system row;
  zero retire/slim/merge verdicts — every slim candidate examined and declined
  on the commission's bar), the proposed corpus end-state, thirteen
  ready-to-apply amendment packages (Appendix A, including the full ADR-0011
  draft with both surviving refutations' repairs folded), the inverse-question
  adjudication (one new tenet recommended; two ADR-0005 rule folds; the rest
  declined with reasons), an explicit deliberately-does-not-propose section,
  the verification record, eight maintainer decision points, staged SQL, and
  coverage limits.
- **`…-appendix-p1.md` / `…-appendix-p2.md`** — every commission and report
  verbatim (12 agents), with the complete workflow script reproduced once as
  the factored commission source; split at 287 KB / 208 KB for renderability.
- **Doc-graph artifacts regenerated** in the same change (four new doc nodes —
  the audit, two appendix parts, this worklog — structural).

## Method note

One workflow, restructured mid-run by maintainer interruption (recorded in
appendix §0): the original 9-reader design had each agent re-reading the
~810 KB history-audit appendix corpus; the restructure replaced that with one
end-to-end extraction agent writing a pointer-bearing evidence digest, four
digest-regime readers (plus the two pre-interruption readers replayed free
from cache), refuters only where the commission required them, and a
completeness critic. 12 agents, ~681k tokens post-restructure. The
38-trigger Revisit-when sweep re-derived and reconciled (5/4/4/2/3/3/4/4/5/4).
The critic's gaps were discharged in synthesis — including reading the five
worklogs that merged mid-audit (PRs #386–#390), redrafting the ADR-0002
mechanization text against post-#390 HEAD, an ADR-0006 header-conformance
sample measurement (frontend 214/222, backend 83/118 path-presence), and
re-verifying every amendment claim at HEAD.

## Deviations and notes (named loudly)

- **HEAD moved during the audit** (PRs #386–#390). All shipped amendment text
  was drafted or re-verified against post-#390 HEAD; the two cached reader
  reports predate it and are preserved verbatim as point-in-time records, with
  the one found staleness (the lint-roster enumeration) corrected in the
  synthesis redraft, not in their records.
- **Two interrupted reader transcripts produced no used output** (appendix §0
  records their assignments); the superseded original commissions are part of
  the script history reproduced there.
- **ADR-0005 Rules 10–11 carry synthesis-level verification only** — they were
  classed amendments and so escaped the dedicated refuter tier; the audit
  flags them to the maintainer as the least-refuted proposals in the set
  (audit §8.4), with a cheap out-of-frame pass recommended before execution
  if wanted.
- The evidence digest was written to a sanctioned `/tmp` scratch path during
  the run; the durable copy is the appendix §3 verbatim reproduction.

## What's deferred

- Execution of every proposal — maintainer sign-off is gate 1 (audit §8);
  the staged SQL (audit §9) is applied at curation, not by this PR
  (`not-filed:` markers do not apply — the items are staged in-tree awaiting
  curation, the same posture as the history audit's filings).
- The follow-up consolidation review (gate 2) — runs after execution;
  its inputs are named at the end of audit §8.
- This PR is left **open** for the coordinating session's merge train; a
  rebase + doc-graph regeneration by that session is expected if a sibling
  structural doc PR merges first.

## Verification

Docs-only change: no build/test surface touched. `node
tools/doc-graph/generate.mjs` regenerated in the same change (new nodes are
structural; committed json+md+report). The `doc-graph-ci` envelope grep is
satisfied (no whole-line harness-envelope artifacts; verified at generation
time). Work-status store: read-only throughout (SELECT only), per commission.

**Advisory ratchet record (named per the report's own convention).** This PR
introduces five live danglers above the 38 baseline, all deliberate: three
`ADR-0011` mentions (the audit's central proposal — the target exists only if
accepted; the edges clear when the adopting PR lands or the proposal is
declined and the docs join the frozen record), and two old-path mentions
inside the appendix's verbatim agent reports (`docs/notes/`-rooted
pre-relocation paths quoted by the readers whose repairs the audit stages —
the verbatim-record discipline forbids rewriting them). The one avoidable
mention in the main document was rephrased rather than minted.

License: Public Domain (The Unlicense).
