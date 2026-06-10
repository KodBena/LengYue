# Worklog — deferral harvest into the work-status store (2026-06-10)

> Audit trail for work-status item `work-status-authoring-hygiene`
> (history-lessons audit §3.22, branch `bork/docs/deferral-harvest`), one
> of the Round 1 arcs executing the 2026-06-10 SPA history-lessons audit.
> This arc carried an explicit additive-write exception on the `todo` DB
> (INSERT items/refs/labels only); every existing-row mutation is staged,
> not executed.

## The change

- **`docs/notes/audit/audit-deferral-harvest-2026-06-10.md`** — the
  deliverable: a 42-row triage table over the miners' compiled
  dangling-deferral lists (file / confirm-done / confirm-covered /
  drop-with-record / not-filed / stage), the executed additive SQL, the
  staged second-sign-off SQL (description appends, the 47 band
  annotations, the spa-board-scope options), and five maintainer
  questions.
- **Seventeen new `open`/`future` items filed** in one transaction
  (items + refs + labels; `work_status_violations` gate empty after
  commit). Highlights: `usestabilitymetrics-incremental-projection`,
  `single-owner-auth-state`, `keepalive-contract-revision`,
  `learned-vf-diverse-corpus-retraining`, `learned-vf-dispatch-closure`,
  `rigor-proportionality-rubric-adoption`, plus eleven smaller harvested
  deferrals. New frontend items carry their ADR-0003 band call in
  `extra.band` at filing.
- **`docs/pre-merge-checklist.md` §D** widened from defect recording to
  defect *and deferral* recording: the item-id-or-`not-filed: <reason>`
  bullet convention, refs-at-filing, retitle-to-the-residual, and the
  generalization-deferrals-survive guard.
- **Doc-graph artifacts regenerated** (two new doc nodes: the harvest
  note and this worklog).

## Deviations (named loudly)

- **Bounded pass, not a corpus re-read.** The orchestrator's commission
  text asked for a re-derivation by reading every worklog end to end; the
  work-status item's description — the authoritative spec, with verifier
  corrections folded in — bounds the pass to the miners' already-compiled
  lists (appendix §1: worklog-current 1–5, worklog-2026-05 5,
  worklog-2026-04 1, retros 1–2, postmortems 3). I followed the item
  description. Consequence: triage verdicts rest on the appendix's
  compiled findings plus my own targeted HEAD verification, not on a
  fresh read of ~185 worklogs; claims relayed from unread documents are
  marked "(relayed)" in the deliverable, per ADR-0002.
- **The two commissioned refs rows already exist at HEAD.**
  `pv-hover-jank-range-query` and `many-boards-open-slowness` already
  carry refs to the 2026-05-27 perf audit (they predate the audit
  filing), so no INSERT was made; the "cause #1 shipped as perf-fix3,
  residual C.2/C.3, re-profile first" note is staged as description
  appends instead (deliverable §5.A/B).
- **Appendix p1 was read partially** (~98 KB): §0, the first two miners,
  and the five commissioned list-bearing miner sections end to end; the
  six remaining miner sections and appendices p2/p3 were not read. Named
  as a coverage gap in the deliverable §1.
- **Four deflations** found by HEAD verification and recorded as
  confirm-done rather than filed: sendSync loudness (resolved via
  `pushSystemMessage` + documented posture), backend de-branding (no
  `X-Ebisu` remains; residue is deliberate compat machinery), the
  lookup_cache caveat (present in the normalization protocol), and the
  doc-graph deterministic sort (present in `generate.mjs`).

## What's deferred

- Execution of the staged SQL (description appends, band annotations,
  the spa-board-scope decision) — second sign-off, maintainer applies
  (deliverable §5; this is the staged-in-tree state, so per the §D
  convention: tracked by `work-status-authoring-hygiene` until applied).
- The five maintainer questions (deliverable §4), including the
  `spa-board-scope-consistency-audit` residual the commission asked to
  surface (audit §7.4) — `not-filed: maintainer decisions, recorded in
  the deliverable's dated record`.
- The seventeen filed arcs themselves — each is its own item.

License: Public Domain (The Unlicense).
