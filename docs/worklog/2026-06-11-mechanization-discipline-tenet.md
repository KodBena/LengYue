# Worklog — mint ADR-0011 + ADR-0005 Rules 10–11 (mechanization-discipline-tenet)

**Date:** 2026-06-11
**Branch:** `bork/docs/mechanization-discipline-tenet`
**Work-status item:** `mechanization-discipline-tenet`
(child of `adr-effectiveness-audits`)

The execution arc the 2026-06-10 ADR-corpus audit staged as its §9 item (4)
and decision point §8.3. The maintainer signed off (2026-06-11): ADR-0011
ships **standalone as drafted** (not the ADR-0002 Rule-8 fallback), and
ADR-0005 Rules 10–11 ship **with the consolidation review's §6 repairs folded
into the rule texts**. This is a docs-only change.

## What shipped

1. **`docs/adr/0011-mechanization-discipline.md`** — minted verbatim from the
   audit's Appendix A13 full draft, `<date>` filled with 2026-06-11. Status
   Proposed; five rules; Genre line states "the ninth tenet" without
   enumerating predecessors (the synopsis owns the roster, per audit §6.6).
   The number **0011 stands** — `git ls-remote origin | grep -i adr` showed
   only amendment/audit/synopsis branches in flight, no sibling new-ADR branch
   claiming a number, so no renumber/regenerate contention. RCA cited as
   "§5 open question 4" (the precise form the Ship-mechanics block mandates;
   a bare "§5.4" would collide with the adaptive postmortem's probe-script
   handle). One in-draft change beyond `<date>`: repair **(1f)** — Rule 2's
   "Filed alongside means a work-status store item" gains "(per ADR-0005
   Rule 10)", safe because both ship in this PR.

2. **`docs/adr/0005-documentation-discipline.md`** — Rules 10 and 11 appended
   after Rule 9 and the 2026-06-11 A5a amendment record, with the §6 repairs
   integrated into the rule texts themselves (not as footnotes). Two
   Amendments-header lines added.

3. **Co-changes (all in this PR):**
   - `docs/adr-synopsis.md` — new ADR-0011 entry (Decision/Why-care register);
     ADR-0005 entry rules enumeration nine → eleven with one-clause
     descriptions; "How to read these together" rewritten for nine tenets
     (ADR-0011 bullet added; family paragraph extended — Rule 1 as the
     enforcement register of the ADR-0002/0008/0009 family, Rules 2–5 adjacent
     protocol); closer left as-is (it carries no numeric count — "any one of
     these" stays accurate). The fork-consumption tail (added by #393) was
     **not disturbed**.
   - `docs/pre-merge-checklist.md` — new **§H** (mechanization assessment,
     ADR-0011 Rule 1) carrying the self-application line. Placed as a §G
     sibling rather than a §A bullet (judgment recorded below).
   - `docs/adr/0002-fail-loudly.md` — Revisit-when #5 gains a one-line dated
     completion note naming ADR-0011 as the shipped tenet the trigger
     anticipated. The rule/trigger text is otherwise untouched.

4. **Doc-graph regenerated** — `node tools/doc-graph/generate.mjs` (structural:
   new ADR-0011 node + cross-references). Committed `docs/doc-graph.json`,
   `docs/doc-graph.md`, `docs/doc-graph-report.md` (SVG is gitignored). The
   ADR-0011 node wires correctly: synopsis `synopsis-of` fan-out edge;
   ADR-0002↔0011 bidirectional `adr-related`; ADR-0011 → 0004/0005/0008/0009/0010;
   pre-merge-checklist `path-mention`; and four previously-dangling inbound
   edges from the audits/worklog now **resolve**. No new danglers reference
   ADR-0011. The cochange advisory runs **clean** (synopsis moves with the ADR
   changes).

## Per-repair integration table (consolidation §6 → where it landed)

Each repair from the consolidation review's §6 (the BINDING list), and the
rule-text location it was folded into.

### Rule 10 (deferrals are ledgered at authoring time)

| Repair | Consolidation §6 | Where it landed in the rule text |
|---|---|---|
| **1a** (required) | Recast the fourth bullet from a triage prohibition into fail-loud recording; preserve checklist §D attribution (fork constraint; history audit §3.22) | Fifth bullet, retitled "**Generalization deferrals are recorded, not silently dropped**": a drop on single-domain grounds is a fail-loud event (ADR-0002) that **names the generality rationale it declines**; the §D / §3.22 fork-constraint attribution is preserved, with the strategy-contingency stated |
| **1b** (required) | Replace the genre enumeration with "any committed record within this tenet's Scope"; substrate sentence saying the enumeration failed open at dispatches | "Capture" bullet now keys on "**any committed record within this tenet's Scope**"; an added sentence names the dispatch (learned-vf closure obligations) as the paid-for instance the enumeration failed open at, and states the rule must not itself be an enumeration |
| **1d** (required) | Add the closure bullet (an item closes only after a residual sweep files/marks every named residue); cite the two L3 instances | New fourth bullet "**Close only after a residual sweep**" citing `services-boundary-deny-by-default` step (b) and `cast-hygiene-lint` stage 2; reconciles with the retitle-to-residual bullet (partial-ship vs close-it-anyway) |
| **1c** (recommended) | Name the positive citation form (bullet ending with item id in backticks) alongside the grep-able negative marker; state honestly that unmarked bullets remain checklist/review territory pending the advisory sweep | Post-bullet paragraph: negative marker grep-able + positive case = a bullet ending with the item id in backticks (worked example); honest statement that an unmarked bullet stays checklist/review territory until the advisory sweep exists |
| **1e** (recommended) | Cite the two post-§D same-day misses as calibration evidence | Same paragraph: the two deferrals that evaporated within hours of §D landing named as the calibration evidence for why review alone is not yet sufficient |

### Rule 11 (commissioned-review artifacts recorded verbatim, in-tree)

| Repair | Consolidation §6 | Where it landed in the rule text |
|---|---|---|
| **2a** (required) | Define "the artifact's substance" minimally (verdict + every verdict-carrying finding reproduced, not characterized); add "a verdict whose artifact cannot be produced on demand is treated as no verdict"; cite PR #382 235-char stub | Opening paragraph names the no-producible-artifact ⇒ no-verdict rule with the PR #382 235-character substrate; a dedicated paragraph defines substance minimally and rejects a one-line gloss |
| **2c** (required) | Consumption sentence — verbatim appendices are reference records consumed by pointer-citation; read-once digest with pointers is the sanctioned fan-out posture; cite the fan-out incident; reconcile with read-fully discipline | Dedicated "reference records, consumed by pointer-citation" paragraph: the read-once digest is the sanctioned fan-out posture (citing the ~810 KB fan-out incident) and reconciles with the umbrella `CLAUDE.md` read-fully-before-citing discipline |
| **2b** (strongly recommended) | Strike-don't-delete legibility for in-situ corrections; one sentence reconciling dated insertions with the audit directory's not-retro-edited convention | Corrections paragraph: in situ, dated, **by strike rather than deletion** (Rule 8 sibling-revision inside one record); a dated additive correction leaving the struck original readable is sanctioned, a silent rewrite never is |
| **2d** (optional) | Bound "commissioned review" to delegated reviews whose verdict the citing session treats as evidence | Opening sentence bounds the term to delegated reviews "whose verdict the citing session treats as evidence"; a parenthetical excludes informal sanity reads not leaned on |

### ADR-0011 (the 1f cross-cite)

| Repair | Source | Where it landed |
|---|---|---|
| **1f** (conditional) | Audit task + consolidation §6: if A13 ships alongside, ADR-0011 Rule 2's "filed alongside means a work-status store item" gains "(per ADR-0005 Rule 10)" — both ship here, so the cross-cite is safe | ADR-0011 Rule 2, the "Filed alongside" sentence |

## Judgment calls, recorded loudly (ADR-0002)

- **Pre-merge-checklist placement (§H vs §A bullet).** The task left this to
  judgment. I placed the mechanization-assessment line as a new **§H**, a §G
  sibling, rather than as a bullet inside §A's CLAUDE.md-enumeration
  walk-through. Reasoning: §G is itself a single-discipline section minted from
  an audit, and the mechanization assessment is its own self-contained
  discipline with distinct ADR-0011 provenance and its own named moment
  (corrective-design events, not every PR). A §A bullet would bury it among
  the documentation-graph enumeration. The line keeps the audit's mandated
  wording verbatim and adds the self-application framing (consulted at
  corrective-design moments; the sweep detects absence thereafter).

- **Synopsis closer count-check.** The Ship-mechanics block asks the closer to
  be count-checked. The closer ("A contribution against the grain of any one
  of these…") carries **no numeric count**, so it needed no edit; the only
  count in "How to read these together" is the lead "The nine tenets" (was
  "eight"), which I updated. Recorded so the no-op is not read as an oversight.

- **ADR-0005 amendment-header phrasing.** The A5b/A5c Amendments lines in the
  audit draft enumerate the rule's gist; I folded the §6 repairs' headline
  shape into those header lines too (e.g. "any committed record within this
  tenet's Scope" rather than the original genre list; "an item closes only
  after a residual sweep"; "a verdict whose artifact cannot be produced on
  demand is treated as no verdict") so the header summary matches the repaired
  rule body rather than the pre-repair draft.

## Verification

- `node tools/doc-graph/generate.mjs` — clean; artifacts committed; ADR-0011
  node + cross-references present and resolving; no new danglers reference it.
- `node tools/doc-graph/cochange-advisory.mjs` — clean (synopsis co-changes
  with the ADRs).
- No `<date>` placeholder remains in ADR-0011.
- **No frontend source touched**, so no frontend build/typecheck was run —
  this is a documentation-only change (ADRs, synopsis, checklist, worklog,
  doc-graph artifacts). Stated explicitly per the task's verification step.
- The todo DB was **read-only** throughout (the item description was read once
  via `psql … -At`; no writes). The work-status transition for
  `mechanization-discipline-tenet` is left for the maintainer per the
  instruction not to write the store.

## Scope notes (not in scope for this PR)

The consolidation review names several concrete actions executable now (file
the auto-save fake-fidelity defect; the cast-hygiene stage-2 successor;
the §D disposition sweep; the FILES.md ghost row; promote
`band-conformance-ci-check`) and the gate-2 follow-up addendum. Those are the
consolidation's own arc, not this tenet-minting item; `not-filed: out-of-scope
for the mechanization-discipline-tenet item — owned by the consolidation
review's §8 action list and its own follow-up`.
