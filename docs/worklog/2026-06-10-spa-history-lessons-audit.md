# Worklog — SPA history-lessons audit at 1,129 commits (2026-06-10)

> Audit trail for the docs-only PR that lands the whole-history review
> (branch `bork/docs/spa-history-lessons-audit`). Commissioned by the
> maintainer 2026-06-09: mine the git log and the documentation graph for
> lessons learned and distill refactoring opportunities serving correctness
> and auditability-for-humans, under the binding constraint that nothing may
> collapse domain-agnostic infrastructure the planned generic flash-card
> fork will need.

## The change

- **`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`** — the
  distilled report: verdict (seam-level debt, not design rot), eight
  cross-cutting lessons, 25 verified recommendations, the deflation record,
  eight maintainer decision points, coverage limits.
- **`…-appendix-p{1,2,3}.md`** — every sub-agent commission and report
  verbatim (90 agents across two orchestrated runs), split into three files
  to stay under GitHub's markdown render limit; factoring conventions in
  part 1 §0.
- **`…-filing.sql`** — twenty new work-status items staged as one
  reviewable, additive transaction (items + parent link + refs + labels),
  deliberately **not executed**: the review session's permission boundary
  declined direct writes to the shared `todo` store, and item curation is
  the maintainer's call anyway. Apply + `work_status_violations` gate
  instructions inline.
- **`…-filings.md`** — the human-readable rendering of that SQL: what each
  of the twenty items is, why now, and its fork-relevance.
- **Doc-graph artifacts regenerated** in the same change (structural doc
  addition; nodes 404 → 410 across the arc).

## Method note

Two background workflows: 13 evidence miners → 121 findings → 3 lens
distillers + merge → 18 candidates → 2 adversarial verifiers each; then a
generalization pass (2 fork-lens distillers → 8 new candidates, 7 surviving;
plus a two-sided fork verdict on each of the 18 — none refuted). Verifier
corrections are folded into the report and the staged item descriptions;
claims that did not survive verification are recorded in the report's §6.
Two aborted workflow launches (an args-delivery defect in the harness) are
documented in the appendix header; no output from them was used.

## What's deferred

- Execution of the staged SQL — maintainer applies (`not-filed` marker per
  the convention the audit itself proposes does not apply: the items are
  staged in-tree, awaiting curation).
- Updates to the eight existing items the review strengthens (report §4) —
  specified in prose, not staged; editing existing items is curation.
- All twenty proposed work arcs themselves — each lands as its own item on
  acceptance.

License: Public Domain (The Unlicense).
