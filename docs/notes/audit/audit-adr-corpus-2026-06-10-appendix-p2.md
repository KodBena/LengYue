# Audit — ADR corpus 2026-06-10 — verbatim appendix, part 2 of 2

Continuation of `audit-adr-corpus-2026-06-10-appendix-p1.md` (which carries
the process record, the complete workflow script with every prompt builder
— the §0 reconstruction rule governs commissions here too — and readers
r1/r2/n1/n2). This part: readers n3 and n4 with refuter verdicts, the
evidence digest agent (§3), and the completeness critic (§4).

Point-in-time record; not retro-edited.

---

## §1 · reader:n3

### Coverage (verbatim)

Read END TO END: umbrella CLAUDE.md (in context); frontend/CLAUDE.md and backend/CLAUDE.md (injected in full by the environment); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; docs/adr/0003-frontend-portability-and-domain-boundaries.md; docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md; docs/worklog/2026-06-10-types-split.md; docs/worklog/2026-06-10-review-scoring-named-seam.md; docs/worklog/2026-06-10-resource-service-calibration-seam.md; docs/worklog/2026-06-10-adr-record-amendments.md; frontend/FILES.md (read in full although row-level lookup is sanctioned); docs/handoff-current.md; frontend/src/services/analysis-persistence-service.ts; frontend/src/composables/useAutoSaveAnalyses.ts; backend/domain/analysis_bundle.py. Row-level / generated-artifact consultation (sanctioned): docs/doc-graph-report.md (grep rows), docs/doc-graph.md and docs/doc-graph.json (programmatic edge queries). Existence-level checks only, no content cited beyond what the check shows: .github/workflows/frontend-ci.yml (confirmed the vue-tsc -b step exists; the CI claim itself is attributed to frontend/CLAUDE.md, read in full); git log of both assigned ADRs; read-only SELECT against the todo DB (9 item rows). Deliberately NOT read: the three appendix parts (per the access rule — cited only via the digest); backend/api/routes/analysis_bundles.py and frontend/src/services/analysis-bundle.ts + analysis-bundle/encoder.ts (the payload-opacity contract I needed is carried by backend/domain/analysis_bundle.py and the persistence service's own header, both read in full; the encoder files are characterized only via their FILES.md rows); ADR-0001/0002/0005–0010 (other readers' assignments — every statement about them in my report is attributed to the synopsis or the digest, not asserted first-hand); frontend/src/services/analysis-service.ts (its markDirty gating is cited via the persistence service's and useAutoSaveAnalyses' own docstrings, both read in full). No performance claims of my own; the one perf figure mentioned is relayed with attribution. Todo DB untouched beyond SELECT.

### per-document verdict: ADR-0003 (frontend portability and domain boundaries) — **amend** (verbatim fields)

**rationale:** The 2026-06-10 amendment layer is honest and the load-bearing content — band definitions, band-mixed seam analysis, both port sizings — is current and was demonstrably used by two executed extractions this week (review-scoring, resource-service: both worklogs cite the takes-the-predicate-as-a-parameter idiom). A Rule-8 sibling/successor is the wrong fix: it would re-create a second band-definitions home, the exact parallel-registry shape (ADR-0005 Rule 1) this ADR just paid for with its inline inventory. But the in-place annotation job is unfinished, and the residue is concentrated where a cold fork author reads: (1) the Decision section still asserts, un-annotated and in present tense, 'no concrete second-domain consumer exists' — the premise the digest's verifier said must be annotated (digest -> p3 §new-fit:adr0003-revisit-1, corr. 5) and which the executed amendment missed; (2) the analysis-recording section and the Band-mixed bullet are still future-tense ('when we eventually build it', '(planned) ... before it is built') though the feature shipped — and verified at HEAD it is a substantially fulfilled prediction (backend payload opacity exactly as designed per backend/domain/analysis_bundle.py; seam designed-not-extracted; two named deviations: the service is Go-typed [B3] not payload-generic, and the gating is an upstream dirty-bump call-site gate, not a predicate parameter); (3) the Related pointer ../notes/analysis-persistence-plan.md dangles (actual home docs/archive/notes/design/analysis-persistence-plan.md) and the doc-graph extractor does not see the relative-parent form, so the freshness gate cannot flag it; (4) the principle question is still single-axis chess-keyed while the FILES.md legend was re-keyed to the stronger any-knowledge-domain axis; (5) the Chess-sizing's retained per-file rows carry recorded FILES.md disagreements (store/index.ts, analysis-ledger, wait-for-analysis ADR-Band-1 vs [B3]; engine/helper.ts reversed). Four bounded dated notes plus one pointer fix restore a coherent record-plus-corrections read at the point of reading.

**load_bearing:** The fork's primary map and the corpus's only structural-descriptive genre. ADR-0002 Rule 7's closed-vocabulary list explicitly includes 'an ADR-0003 band tag' (digest); FILES.md's 215-row legend keys to its band definitions; its seam idiom settled repeated verifier disputes (digest -> p3 §new-fit:review-scoring, new-fit:cold-start, new-fit:split-keybindings) and governed two extractions executed 2026-06-10; its Not-goals ('not a refactoring mandate') was the standing counter-pressure every fork candidate had to name explicitly.

**dead_or_misleading:** Misleading at HEAD until annotated: the un-annotated 'no concrete second-domain consumer exists' premise (Decision section); the future-tense analysis-recording material ('(planned)', 'before it is built', 'when we eventually build it'); the dangling Related pointer ../notes/analysis-persistence-plan.md (invisible to the doc-graph validator in its relative form); the Chess-sizing file rows that contradict FILES.md tags. Nothing is dead; the planning-time reasoning is a legitimate record once dated.

**trigger_status:** 4 triggers re-derived (matches the amendments worklog's 0003:4). #1 second domain adopter — FIRED, recorded 2026-06-10 as 'fired twice' (the maintainer's generic knowledge fork; chess-clone, confirmed open/active in the store). Tension flagged per the digest: the generalization verifiers read this as one materialized adopter plus one filed prospective adopter whose own PoC gate is unmet, and advised naming both without claiming two fired triggers; the executed amendment adopted the stronger reading. #2 inventory drift — FIRED, recorded 2026-06-10; structurally resolved by delegating the per-file inventory to FILES.md; residue: per-file rows retained inside the sizing prose still drift (proposal n3-adr0003-chess-sizing-vs-filesmd). #3 wrong band in practice — FIRED (useReviewSession Band 2 vs [B3]), recorded 2026-06-10 and deliberately not adjudicated; the named-seam extraction (work-status review-scoring-named-seam, closed) has since narrowed it per its worklog ('narrowed, not yet adjudicated'); additional unrecorded row-level disagreement candidates exist in the Chess-sizing prose (digest), with band-conformance-ci-check (open/future) the filed adjudication mechanism. #4 the Chess question stops being useful — NOT FIRED; what actually happened (the question gained a stronger second axis) is outside the trigger's text and is addressed by proposal n3-adr0003-two-axis-principle.

**fork_fitness:** It IS the fork map, and the non-game sizing (Band 2 splits; Band 1 is the whole kept surface) is present and matches the digest's load-bearing axis re-map. After the proposed annotations, the fork author gets a coherent single document: definitions and seams here, instances in FILES.md (legend already re-keyed; unswept tags honestly flagged), the persistence stack's real band shape recorded, and the principle question asked on both axes. What the corpus still does not give the fork author is filed, not missing from this ADR: the B1-tag sweep against the stronger criterion and its mechanization (band-conformance-ci-check, open/future).

### per-document verdict: ADR-0004 (minimal-touch edits to partially-visible files) — **amend** (verbatim fields)

**rationale:** Keep the decision, structure, and scope exactly as-is — the only change proposed is one dated trigger-bookkeeping note, which is why this verdict is the nearest neighbour of keep rather than a substantive revision. The tenet is alive, not vestigial: the umbrella CLAUDE.md names it one of four governing ADRs and builds the documentation-consumption rule on its composition with ADR-0002; per the synopsis, ADR-0005/0006/0007 each anchor their no-retroactive-sweep retrofit posture in 'ADR-0004's spirit'; in the 90-agent corpus it appeared as a boundary clarifier that verifiers used correctly twice (striking a loose citation; digest); and the 2026-06-10 worklogs show its posture operating under full visibility (the types-split's verbatim sed motion preserving even pre-existing stale pointers; the resource-service worklog's explicit '(minimal-touch)' for leaving a duplicated comment untouched). Its Not-goals citation of 'the engagement protocol's full-file requirement' still matches the umbrella CLAUDE.md's standing authoring posture ('Provide complete file contents when editing'), so nothing in it is misleading. The one defect is the corpus-wide weak mechanism (digest §2: trigger bookkeeping rotted silently in 0001/0003): trigger #1 has assessedly part-fired and the ADR carries no record. Recording it now costs a paragraph and prevents this smallest tenet from repeating the 0001/0003 rot shape.

**load_bearing:** Governs all authoring per the umbrella CLAUDE.md; composes into the LLM documentation-consumption rule; the retrofit posture of ADR-0005/0006/0007 cites its spirit (per the synopsis); ADR-0007 exists explicitly to make this tenet's condition rare (synopsis); the ADR-0006 header convention exists partly to serve it. Rarely a dispute standard in the audit corpus (two appearances), but both were load-bearing clarifications of its boundary.

**dead_or_misleading:** Essentially nothing. Minor dated prose: 'this codebase's recent strict-mode build sweep' reads as April-2026-relative ('recent' has aged), but it is a historical record, not a live claim. The 'engagement protocol' citation verified accurate against umbrella CLAUDE.md at HEAD. One adjacent observation (not a defect of this document): 'ADR-0004's spirit' circulates as a broader incremental-retrofit corollary that has no stated home — see proposal n3-adr0004-retrofit-corollary-note.

**trigger_status:** 2 triggers re-derived (matches the amendments worklog's 0004:2). #1 tooling makes prop-contract drift catchable at compile time — PARTIALLY FIRED, NOT recorded in the ADR: frontend CI has gated vue-tsc -b on every PR since 2026-06-01 (frontend/CLAUDE.md; the workflow and step confirmed present at HEAD), and two footgun classes are now mechanized as lints (local/gate-prop-needs-default, local/module-intent-in-script-setup, per frontend/CLAUDE.md); the 'relax in proportion' clause has never been exercised; neither the history audit nor this reader verified empirically what the current template checking catches of the Context's four cases, and the audit's verifier narrowed the achievable ceiling — the boolean gate-prop omission class is type-legal by design, un-catchable by type-checking even in principle (digest -> p2 §verify:fit:vue-lifecycle-footgun, corr. b). #2 the discipline introduces its own failure mode — NOT FIRED; no instance recorded anywhere in the evidence corpus (digest).

**fork_fitness:** Fully portable as written. Nothing Go-bound; the Vue-specific Context examples remain exactly apt because the fork forks this Vue SPA. The fork inherits the tenet verbatim, including the Revisit #1 relaxation clause, which the proposed note keeps honest.

### proposal `n3-adr0003-annotate-extraction-premise` [amend] → docs/adr/0003-frontend-portability-and-domain-boundaries.md (verbatim)

**summary:** Finish the annotation the 2026-06-10 amendment started: the Decision section's closing premise ('no concrete second-domain consumer exists') is now false and carries no dated note, so a cold reader meets a live-tense falsehood ~230 lines before the Revisit-#1 correction. The digest records the verifier correction requiring this annotation; the executed amendment missed it.

**details:** Append at the end of the 'Why not extract Ports preemptively now' subsection:

*(Note, 2026-06-10 — completing the in-place record the same-day amendment started: the closing premise above, "no concrete second-domain consumer exists", is no longer true. Two adopters are named in the Amendments line; per Revisit-when #1, Port extraction for the seams a concrete adopter touches is no longer premature by this section's own cost-benefit argument. The reasoning stands as the planning-time record of why extraction waited; it is not a standing instruction to keep waiting.)*

Co-change duty: docs/adr-synopsis.md (the cochange advisory will flag it; the synopsis's ADR-0003 entry already carries the fired-trigger framing, so likely a no-op or one clause). Doc-graph: content-only edit, no regeneration required.

### proposal `n3-adr0003-analysis-recording-fulfilled` [amend] → docs/adr/0003-frontend-portability-and-domain-boundaries.md (verbatim)

**summary:** Re-tense the analysis-recording material as a fulfilled prediction and score it honestly. Verified at HEAD: the feature shipped (the /analysis-bundles arc); the opaque envelope and designed-not-extracted seam held exactly as predicted; two named deviations from the letter (Go-typed service rather than payload-generic; gating at the upstream call site rather than as a predicate parameter). Also fixes the dangling Related pointer.

**details:** (a) Append at the end of 'What this means for the analysis-recording feature':

*(Note, 2026-06-10: the feature shipped — the analysis-bundle persistence arc (backend `/analysis-bundles` routes; frontend `services/analysis-persistence-service.ts` + `composables/useAutoSaveAnalyses.ts`). Scored against what was built: the **opaque envelope shipped as designed** — the v1 wire is `{config_hash, node_id, packet}` with the packet opaque to the backend (`backend/domain/analysis_bundle.py` states the contract: "the backend never inspects its shape"), and the v2 evolution strengthened the opacity (SPA-encoded bytes the backend brotli-wraps and returns verbatim). The **seam was designed, not extracted** — no Port, no strategy registry, exactly as prescribed. Two deviations from this section's letter: the persistence service is Go-typed (`[B3]` in FILES.md; its records carry `KataAnalysisResponse`, and the v2 encoder hierarchy under `services/analysis-bundle/` is KataGo-shaped) rather than generic over `payload: T`; and the gating predicate is not passed as a parameter — the `isDuringSearch` gate lives at the `analysis-service` call site that bumps the service's domain-neutral per-board dirty counter, with user-toggle gating in the auto-save composable. The seam between Go-shaped capture and generic persistence mechanics exists, one notch further upstream than drawn here. A fork replaces the encoder hierarchy and the dirty-bump call site; the wire contract and the backend need no change — the section's bottom-line claim held.)*

(b) In the Band-mixed seam list, append to the analysis-recording bullet: *(Shipped 2026-06-10-recorded — see the dated note in "What this means for the analysis-recording feature".)*

(c) Related section: re-point `../notes/analysis-persistence-plan.md` to `../archive/notes/design/analysis-persistence-plan.md` with: "The planning note that triggered this ADR (archived when the feature shipped; path re-pointed 2026-06-10 — the old `docs/notes/` location no longer resolves)." Note for the synthesizer: this dangle is invisible to the doc-graph validator — the extractor does not pick up the relative `../` path-mention form (verified against doc-graph.json's edge set for this ADR), the doc→doc analog of the code→doc rot the digest records at ADR-0010:169.

Co-change: synopsis (advisory-flagged); doc-graph regeneration IS required for (c) — re-pointing a cross-reference is structural.

### proposal `n3-adr0003-two-axis-principle` [amend] → docs/adr/0003-frontend-portability-and-domain-boundaries.md (verbatim)

**summary:** The forward-looking principle still asks only the chess-axis question while the FILES.md legend was re-keyed to the stronger any-knowledge-domain criterion in the same change as the amendment. For the named non-game adopter, the chess question alone forces the wrong (weaker) boundary; record the second axis at the principle itself.

**details:** Insert a dated note directly after the principle blockquote in the Decision section:

*(Note, 2026-06-10: with a non-game adopter named (Amendments line), the authoring-time question is two-axis. "What would change for a Chess port?" forces the game-instance seam — Band 3 against the rest. "What would survive a port outside the game class?" forces the stronger Band 1 boundary, which is the whole kept surface for the generic knowledge fork. Ask both; `frontend/FILES.md`'s legend was re-keyed to the stronger criterion in the same change as this amendment.)*

Co-change: synopsis ADR-0003 entry (one clause: the principle is two-axis since 2026-06-10). Content-only otherwise.

### proposal `n3-adr0003-chess-sizing-vs-filesmd` [amend] → docs/adr/0003-frontend-portability-and-domain-boundaries.md (verbatim)

**summary:** Revisit-#2's lesson was applied to the inventory section but not to the sizing prose: 'What a Chess port would actually require' retains per-file rows that already carry recorded disagreements with FILES.md (the maintained authority by this ADR's own amendment). Annotate the rows as a planning snapshot rather than silently leaving a second, divergent per-file listing.

**details:** Append a dated note at the end of 'What a Chess port would actually require':

*(Note, 2026-06-10: the file rows above are the 2026-04 planning snapshot and are not maintained — `frontend/FILES.md` is the per-file authority (Amendments line). Known row-level disagreements exist: this section's Band-1 "no change" examples include `store/` (`store/index.ts` is `[B3]` in FILES.md), `services/` (several `[B3]` rows), and `composables/wait-for-analysis.ts` (`[B3]`); `engine/helper.ts` sits under wholesale replacement here but is `[B1]` there. These are recorded in the 2026-06-10 history-lessons audit as adjudication the filed band-conformance check (work-status `band-conformance-ci-check`) will force; until then read this section's bands as definitions-with-seam-detail and FILES.md's rows as the instances — where they disagree, neither is silently right (Revisit-when #3's posture).)*

Alternative shape if the maintainer prefers slimming over annotating: cut the three file-list bullets to band-level descriptions plus the two named within-file seams (navigator delta-application; useReviewSession scoring), which clears the slimming bar — the per-file half is delegated to a better home (FILES.md) and the retained rows are actively misleading at row level. The annotation form is offered first because it preserves the historical sizing intact. Co-change: synopsis unaffected in substance; content-only edit.

### proposal `n3-adr0003-fired-twice-precision` [note] → docs/adr/0003-frontend-portability-and-domain-boundaries.md (verbatim)

**summary:** The executed amendment records Revisit-#1 as 'fired twice'; the digest flags that the generalization verifiers read the evidence more conservatively — one materialized adopter (the fork) plus one filed prospective adopter (chess-clone, open/active, its own PoC gate unmet) — and advised naming both without claiming two fired triggers. The recorded text is defensible (it accurately characterizes chess-clone as a work-status item, and the store confirms open/active), but it sits on the stronger reading.

**details:** No change required; if the maintainer wants the conservative phrasing, replace 'has fired twice' (Amendments line and Revisit #1) with: 'has fired (the maintainer's generic knowledge flash-card fork, 2026-06-09/10), with a second prospective adopter filed on the game-class axis (the `chess-clone` work-status item, open/active; its own proof-of-concept gate is unmet)'. Flagged per the digest's instruction to surface main-vs-appendix tensions rather than silently inheriting either reading.

### proposal `n3-adr0004-record-trigger1-partial` [amend] → docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md (verbatim)

**summary:** Record the assessed partial firing of Revisit trigger #1. The tooling environment moved (CI-gated vue-tsc -b since 2026-06-01; two footgun lints) without the ADR's proportional-relaxation clause being exercised or the firing being recorded — exactly the silent trigger-rot shape that cost ADR-0001/0003 their record accuracy. One dated note keeps the smallest tenet's bookkeeping honest.

**details:** Append a dated note at Revisit bullet #1:

*(2026-06-10, partial — recorded by the ADR-corpus audit: the tooling environment moved without yet warranting relaxation. Frontend CI has gated `vue-tsc -b` on every PR since 2026-06-01 (`.github/workflows/frontend-ci.yml`), and two footgun classes adjacent to this tenet's Context are mechanized as lints (`local/gate-prop-needs-default`, `local/module-intent-in-script-setup` — see `frontend/CLAUDE.md`). The 2026-06-10 history-lessons audit assessed this trigger as partially satisfied, low confidence, unverified empirically; its verification pass also narrowed the ceiling — the boolean gate-prop omission class is type-legal by design, so template type-checking cannot catch it even in principle. The policy stands unrelaxed until someone measures what the current checker actually catches of the four Context cases; that measurement is the gate for exercising the "relax in proportion" clause.)*

Add the standard Amendments header line ('Amendments: 2026-06-10 — Revisit #1 recorded as partially fired; policy unrelaxed'). Co-change: synopsis ADR-0004 entry likely unchanged in substance (advisory will flag; a no-op confirmation suffices). Content-only; no doc-graph regeneration.

### proposal `n3-adr0004-retrofit-corollary-note` [note] → docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md (verbatim)

**summary:** Per the synopsis, ADR-0005, ADR-0006, and ADR-0007 each anchor their no-retroactive-sweep / retrofit-on-touch posture in 'ADR-0004's spirit', and the audit corpus shows the letter/spirit gap occasionally misleads (a verifier had to strike a loose ADR-0004 citation: the tenet governs partial-visibility edits and permits full-visibility rewrites). The circulating corollary has no stated home, which is an ADR-0005 Rule 1 smell at the tenet level.

**details:** Maintainer decision, no urgency. If wanted, a one-paragraph addition to ADR-0004 (or to its Not-goals) naming the derived corollary explicitly — sketch: 'Corollary (the retrofit posture other tenets cite as this ADR's spirit): a discipline adopted mid-life applies on-touch, never by retroactive sweep; and an edit's scope is the task's scope — incidental tidy-up rides along only under full visibility and deliberate intent (the 2026-06-10 worklogs' verbatim-motion and leave-untouched practice are the worked examples).' The counter-argument: the corollary arguably belongs to each citing ADR's Consequences, and canonizing it here widens the smallest tenet. Verified inputs: the three synopsis entries; the struck citation (digest -> p2 §verify:fit:multi-writer, corr. g); the worklog practice (types-split motion discipline; resource-service's explicit '(minimal-touch)').

### proposal `n3-no-new-tenet-from-this-slice` [note] → (corpus-level) (verbatim)

**summary:** From the ADR-0003/0004 vantage, no new tenet is warranted by the last six weeks' lessons. The fork-axis re-map is an amendment concern inside ADR-0003; the trigger-bookkeeping weakness is cadence already folded into the adr-effectiveness-audits item; the parallel-registry lesson was fixed by delegation, not by new doctrine.

**details:** Two observations for the synthesizer weighing other readers' new-tenet candidates: (1) ADR-0003's history this cycle is positive evidence the amendment convention scales to a structural-descriptive document — definitions/seams stayed in the ADR, instances moved to a same-PR-cadence map, and two extractions executed against the seams within the day; a new 'living inventory' tenet is not needed, the delegation pattern is reusable as-is. (2) The doc-graph extractor's blindness to relative `../` path-mentions (found via ADR-0003's dangling Related pointer, absent from doc-graph.json's edge set for the node and from doc-graph-report.md) is a tooling gap worth attaching to the filed doc-graph-dangling-signal-cleanup item rather than to any ADR.

### Report (verbatim)

`````markdown
# ADR-corpus audit — reader n3: ADR-0003 and ADR-0004 (2026-06-10)

Commissioned reader in the generic ADR-corpus audit (work-status item
`adr-effectiveness-audits`). Assignment: judge ADR-0003 (frontend
portability and domain boundaries; amended 2026-06-10) and ADR-0004
(minimal-touch edits; the smallest, never-amended tenet) — retire,
slim, merge, restructure, amend, status-change, or keep — including
fitness for the maintainer's planned generic knowledge flash-card
fork. Read-only; proposals only.

## Coverage

Read end to end: the umbrella `CLAUDE.md`; `frontend/CLAUDE.md` and
`backend/CLAUDE.md` (injected in full); `docs/adr-synopsis.md`;
`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`; the
evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`); both
assigned ADRs; all four assigned worklogs
(`2026-06-10-types-split.md`, `2026-06-10-review-scoring-named-seam.md`,
`2026-06-10-resource-service-calibration-seam.md`,
`2026-06-10-adr-record-amendments.md`); `frontend/FILES.md` (in full);
`docs/handoff-current.md`;
`frontend/src/services/analysis-persistence-service.ts`;
`frontend/src/composables/useAutoSaveAnalyses.ts`;
`backend/domain/analysis_bundle.py`.

Row-level / generated artifacts (sanctioned): `docs/doc-graph-report.md`,
`docs/doc-graph.{md,json}` (programmatic edge queries). Existence
checks only: `.github/workflows/frontend-ci.yml` (the `vue-tsc -b`
step exists; the CI claim itself is attributed to `frontend/CLAUDE.md`),
git logs of both ADRs, a read-only `SELECT` of nine work-status items.

Deliberately not read: the appendix corpus (per the access rule;
cited only via digest pointers); `backend/api/routes/analysis_bundles.py`
and the frontend encoder modules (the opacity contract I needed is
carried by `backend/domain/analysis_bundle.py` and the persistence
service's header, both read in full; encoder files characterized only
via FILES.md rows); ADR-0001/0002/0005–0010 (other readers' corpus —
statements about them here are attributed to the synopsis or digest);
`frontend/src/services/analysis-service.ts` (its gating role is cited
from the persistence service's and the composable's own docstrings).
No performance claims of my own (ADR-0009).

## ADR-0003 — findings

**Verdict: amend** (not restructure, not keep).

### 1. Coherence after the 2026-06-10 amendment

The amendment convention is mostly working as designed: the
Amendments header, the dated Revisit-when records, and the inventory
delegation to FILES.md are honest, discoverable, and were used the
same day — the review-scoring and resource-service extractions both
executed against the ADR's seam prose, both worklogs citing the
takes-the-predicate-as-a-parameter idiom, and the types-split retired
the `types.ts` exclusion with a dated note. The band definitions, the
band-mixed seam analysis, and both port sizings are current and
load-bearing.

A Rule-8 sibling/successor consolidating "post-2026-06-10 truth"
would be the wrong fix: it would mint a second band-definitions home,
which is exactly the parallel-registry failure shape (ADR-0005 Rule 1)
this ADR just paid for with its inline inventory. The right fix is
cheaper: the in-place annotation job is simply unfinished. Verified
at HEAD, a cold reader — and the fork author reads this document
first — still hits, in order:

- **An un-annotated false premise.** The Decision's "Why not extract
  Ports preemptively now" still closes with "The frontend satisfies
  neither condition **today**: … no concrete second-domain consumer
  exists" — no dated note, ~230 lines before Revisit #1's correction.
  The digest records the verifier correction requiring exactly this
  annotation (digest -> p3 §new-fit:adr0003-revisit-1, corr. 5); the
  executed amendment missed it.
- **Future tense on a shipped feature** (next finding).
- **A dangling Related pointer**: `../notes/analysis-persistence-plan.md`
  does not resolve; the note lives at
  `docs/archive/notes/design/analysis-persistence-plan.md`. Notably,
  the doc-graph validator cannot see this — the extractor does not
  pick up the relative `../` path-mention form (verified against
  `doc-graph.json`'s edge set for this node and the report's rows),
  the doc→doc analog of the code→doc rot the digest records at
  ADR-0010:169.
- **A single-axis principle.** The forward-looking question is still
  "what would change for a Chess port?" while the FILES.md legend was
  re-keyed to the stronger any-knowledge-domain criterion in the same
  change as the amendment. For the named non-game adopter, the chess
  question alone forces the weaker boundary.
- **Per-file rows that contradict the per-file authority.** Revisit
  #2's structural fix (delegate per-file listings) was applied to the
  inventory section but not to the Chess-sizing prose, which retains
  file rows with recorded FILES.md disagreements: "no change (Band 1):
  everything in `store/`" (FILES.md: `store/index.ts` `[B3]`),
  `services/` (several `[B3]` rows), `composables/wait-for-analysis.ts`
  (`[B3]`); `engine/helper.ts` under wholesale replacement here,
  `[B1]` there (digest -> p3 §new-exist:mechanize-band-conformance).

So: yes, the document is currently a planning-time record plus a
correction layer the reader integrates — but the integration cost is
concentrated in five bounded spots, each fixable with a dated note at
the point of reading (proposals n3-adr0003-annotate-extraction-premise,
-analysis-recording-fulfilled, -two-axis-principle,
-chess-sizing-vs-filesmd). After those, the record-plus-corrections
shape is a feature, not a defect: the planning reasoning stays
auditable and every correction sits where the stale claim is read.

### 2. The analysis-recording section against HEAD

The section is premised "when we eventually build it"; the Band-mixed
bullet still says "(planned) … before it is built." The feature
shipped: `handoff-current.md`'s integration model names the
`/analysis-bundles` write path; the backend route, repository, domain
module, and Alembic revision exist;
`frontend/src/services/analysis-persistence-service.ts` and
`composables/useAutoSaveAnalyses.ts` are live; the planning note was
archived.

Scoring the prediction (all verified by reading the named files):

- **Opaque envelope — fulfilled, verbatim.** The v1 wire is
  `{config_hash, node_id, packet}`; `backend/domain/analysis_bundle.py`
  states "`packet` is opaque to the backend … never inspects its
  shape." The v2 evolution *strengthened* the opacity: SPA-encoded
  bytes the backend brotli-wraps and returns verbatim. The section's
  bottom-line claim — a different engine's payload flows through the
  same endpoint with no schema change — held.
- **Seam designed, not extracted — fulfilled.** No Port interface, no
  strategy registry, no `EngineResponseAnalyzerPort`. The
  non-extraction half of the prediction was honored through two wire
  generations.
- **Two deviations from the letter.** The persistence service is not
  generic over `payload: T` — it is Go-typed (`[B3]` in FILES.md; its
  records carry `KataAnalysisResponse`; the v2 encoder hierarchy under
  `services/analysis-bundle/` is KataGo-shaped quantization). And the
  gating predicate is not passed as a parameter: the `isDuringSearch`
  gate lives at the `analysis-service` call site that bumps a
  domain-neutral per-board dirty counter on the service (per both
  files' own docstrings), with user-toggle gating in the auto-save
  composable. The seam exists one notch further upstream than the
  section drew it.

Verdict on the section: a substantially fulfilled prediction that
currently reads as an unbuilt plan — misleading by tense, valuable
once recorded as fulfilled-with-named-deviations (ADR-0002 Rule 6's
design-time-drift register, applied to a prediction that mostly came
true). Proposal n3-adr0003-analysis-recording-fulfilled carries the
ready-to-apply note, the Band-mixed bullet edit, and the Related
pointer fix.

### 3. Trigger walk (4 re-derived; matches the amendments worklog's 0003:4)

1. **Second domain adopter** — FIRED; recorded 2026-06-10 as "fired
   twice." Store confirms `chess-clone` open/active. Tension flagged
   per the digest: the generalization verifiers read this as one
   materialized adopter (the fork) plus one filed prospective adopter
   whose own PoC gate is unmet, and advised not claiming two fired
   triggers; the executed amendment adopted the stronger reading
   (note n3-adr0003-fired-twice-precision).
2. **Inventory drift** — FIRED; recorded; structurally resolved by
   delegation to FILES.md. Residue: the sizing prose's retained
   per-file rows are a second, smaller inventory already diverging
   (finding above).
3. **Wrong band in practice** — FIRED (useReviewSession Band 2 vs
   `[B3]`); recorded, deliberately unadjudicated. Since narrowed by
   the executed extraction (`review-scoring-named-seam`, closed;
   FILES.md row now reads "the `[B3]` tag reflects the residue").
   Additional unrecorded row-level disagreement candidates sit in the
   sizing prose; `band-conformance-ci-check` (open/future) is the
   filed adjudication mechanism.
4. **The Chess question stops being useful** — NOT FIRED; what
   happened instead (the question gained a stronger second axis) is
   outside the trigger's text and is addressed by the two-axis
   principle note.

### 4. Fork fitness

ADR-0003 is the fork map, and its non-game sizing is present and
matches the digest's load-bearing axis re-map (Band 1 kept wholesale;
Band 2 splits). After the proposed annotations the fork author gets a
coherent single document: definitions and seams here; instances in
FILES.md, whose legend is already re-keyed and which honestly flags
that existing tags are unswept against the stronger criterion. What
the fork author still lacks is filed work, not an ADR gap: the
B1-tag sweep and its mechanization (`band-conformance-ci-check`), and
the remaining ~3 named-but-inline Go seams in `useReviewSession`
(named on its FILES.md row).

## ADR-0004 — findings

**Verdict: amend** — bookkeeping only; the decision, scope, and
structure should not change. This is the nearest honest neighbour of
"keep" (ADR-0008: no closest-match verdicts — a proposed amendment
makes plain "keep" inaccurate).

### 1. Alive, not vestigial

Zero amendments and near-zero dispute appearances could read as
dead weight. The evidence says otherwise: the umbrella `CLAUDE.md`
names it one of four governing ADRs and builds the LLM
documentation-consumption rule on its composition with ADR-0002; per
the synopsis, ADR-0005/0006/0007 each anchor their
no-retroactive-sweep retrofit posture in "ADR-0004's spirit";
ADR-0007 exists explicitly to make this tenet's condition rare. In
the 90-agent corpus it appeared twice, both times as a correctly
wielded boundary clarifier — including a verifier striking a loose
citation because the tenet "governs partial-visibility edits; permits
full-visibility rewrites" (digest). And the 2026-06-10 worklogs show
the posture operating in practice under full visibility: the
types-split's verbatim sed motion preserved even pre-existing stale
pointers per the motion discipline; the resource-service worklog
left a duplicated comment untouched with an explicit
"(minimal-touch)". Nothing in the document is dead or delegated
elsewhere; nothing is misleading — its Not-goals citation of "the
engagement protocol's full-file requirement" still matches the
umbrella `CLAUDE.md`'s standing authoring posture ("Provide complete
file contents when editing") verbatim in substance. The Context's
"recent strict-mode build sweep" has aged as prose but is a dated
historical record, not a live claim.

### 2. Trigger walk (2 re-derived; matches the amendments worklog's 0004:2)

1. **Tooling makes prop-contract drift catchable** — PARTIALLY
   FIRED, NOT recorded. Frontend CI has gated `vue-tsc -b` on every
   PR since 2026-06-01 (`frontend/CLAUDE.md`; workflow and step
   confirmed present at HEAD), and two footgun classes are mechanized
   as lints (`local/gate-prop-needs-default`,
   `local/module-intent-in-script-setup`). The "relax in proportion"
   clause has never been exercised. Neither the history audit nor
   this reader verified empirically what current template checking
   catches of the Context's four cases; the audit's verifier narrowed
   the ceiling — the boolean gate-prop omission class is type-legal
   by design, un-catchable by type-checking even in principle
   (digest -> p2 §verify:fit:vue-lifecycle-footgun, corr. b). So the
   firing is real but smaller than a plain reading suggests, and the
   relaxation gate should be an actual measurement.
2. **The discipline introduces its own failure mode** — NOT FIRED;
   no instance recorded anywhere in the evidence corpus.

Trigger bookkeeping is the corpus's weakest mechanism (digest §2;
ADR-0001/0003 rotted exactly this way). Recording the partial firing
now costs one paragraph (proposal n3-adr0004-record-trigger1-partial,
ready text included).

### 3. Fork fitness

Fully portable as written. Nothing Go-bound; the Vue-specific Context
examples remain exactly apt because the fork forks this Vue SPA. The
fork inherits the tenet verbatim, including the relaxation clause the
proposed note keeps honest.

### 4. One adjacent observation

"ADR-0004's spirit" circulates as a broader incremental-retrofit
corollary (cited by three other ADRs per the synopsis) that has no
stated home — a mild ADR-0005 Rule 1 smell at the tenet level, and
the struck loose citation shows the letter/spirit gap can mislead.
Whether to canonize the corollary inside ADR-0004 is a maintainer
call; sketch in note n3-adr0004-retrofit-corollary-note.

## Proposals (summary)

| id | target | kind |
|---|---|---|
| n3-adr0003-annotate-extraction-premise | ADR-0003 | amend |
| n3-adr0003-analysis-recording-fulfilled | ADR-0003 | amend |
| n3-adr0003-two-axis-principle | ADR-0003 | amend |
| n3-adr0003-chess-sizing-vs-filesmd | ADR-0003 | amend (slim variant offered) |
| n3-adr0003-fired-twice-precision | ADR-0003 | note |
| n3-adr0004-record-trigger1-partial | ADR-0004 | amend |
| n3-adr0004-retrofit-corollary-note | ADR-0004 | note |
| n3-no-new-tenet-from-this-slice | corpus | note |

All ADR-0003 amendments carry the synopsis co-change duty (the
cochange advisory will flag it); only the Related-pointer fix is
structural for the doc-graph and requires regeneration in the same
change.

## New-tenet question

From this slice: no new tenet. The fork-axis re-map is an amendment
concern inside ADR-0003; the trigger-bookkeeping weakness is cadence
already folded into `adr-effectiveness-audits`; the parallel-registry
lesson was fixed by delegation, and this cycle is positive evidence
the existing amendment convention scales to a structural-descriptive
document. One tooling gap surfaced incidentally — the doc-graph
extractor's blindness to relative `../` path-mentions — belongs on
the filed `doc-graph-dangling-signal-cleanup` item, not in an ADR.

## Limits

The ADR-0004 #1 assessment is documentary, not empirical — no
template-type-checking experiment was run (read-only commission;
ADR-0009 posture). Statements about ADR-0001/0002/0005–0010 are
relayed from the synopsis and digest, attributed; I did not read
those ADRs. The chess-sizing disagreement rows are taken from the
digest's verifier corrections plus my own FILES.md read; the
underlying import graphs were not re-derived. Perf figures, where
mentioned in source documents, are theirs, not mine.

License: Public Domain (The Unlicense).
`````


---

## §1 · reader:n4

### Coverage (verbatim)

Read end to end: /home/bork/w/omega/CLAUDE.md (in context, per commission); /home/bork/w/omega/frontend/CLAUDE.md (provided in full in-session); /home/bork/w/omega/docs/adr-synopsis.md; /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; /home/bork/w/omega/docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; /home/bork/w/omega/docs/pre-merge-checklist.md; /home/bork/w/omega/docs/adr/0002-fail-loudly.md; /home/bork/w/omega/docs/adr/0005-documentation-discipline.md; /home/bork/w/omega/docs/adr/0008-classification-discipline.md; /home/bork/w/omega/frontend/eslint.config.js; /home/bork/w/omega/docs/worklog/2026-06-10-multi-writer-slots-get-owners.md; /home/bork/w/omega/docs/worklog/2026-06-10-cast-hygiene-lint.md; /home/bork/w/omega/docs/worklog/2026-06-10-deferral-harvest.md; /home/bork/w/omega/docs/worklog/2026-06-10-vue-lifecycle-footgun-guards.md. Deliberately NOT read: the history-audit appendix parts p1/p2/p3 (per the appendix access rule — cited only via digest pointers); the bodies of ADR-0001, 0003, 0004, 0006, 0007, 0009, 0010 (not assigned; every claim about them is relayed from the synopsis, the history audit, or the digest, attributed); docs/worklog/2026-06-10-only-throw-error-g3.md, docs/worklog/2026-06-10-services-boundary-deny-by-default.md, docs/worklog/2026-06-10-branded-path-types.md, docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md, docs/notes/audit/audit-deferral-harvest-2026-06-10.md (used only as grep-census hits — file-name counts for phrase presence; no content cited); the user-local memory file feedback-consult-verbatim-appendix.md (only its MEMORY.md index line, present verbatim in this session's context, is cited). Work-status DB rows (items adr-effectiveness-audits, rigor-proportionality-rubric-adoption, settings-profile-mutator-owner, work-status-authoring-hygiene, adr-record-amendments-2026-06, plus a tenet-keyword sweep) were retrieved by read-only SELECT and are relayed as DB content. Two mechanical claims rest on grep-grade phrase sweeps explicitly framed as counts, not content: (a) a75814c is cited in three committed 2026-06-10 worklogs plus eslint.config.js and the audit corpus; (b) the phrase "standing verbatim-record discipline" appears in committed docs only at usage sites — no committed definition document was found.

### proposal `n4-new-tenet-mechanization-discipline` [new-tenet] → docs/adr/0011 (new; next free number at HEAD) (verbatim)

**summary:** Mint the cross-cutting tenet the RCA's §5.4 left open: a Mechanization Discipline ADR covering L1 (prose disciplines decay; mechanisms stick), the aggregate-only defect class, the measure-first adoption protocol, the quantify-over-the-class net-design rule, and the template-not-gate calibration. It completes the ADR-0002/0008/0009 unsubstantiated-claim family with the enforcement register, and answers RCA §5.4 affirmatively but procedurally: five rules, each with a named operational surface, rather than a philosophical statement.

**details:** Decision core (draft). Status: Proposed. Genre: Tenet — the enforcement register of the ADR-0002/0008/0009 family. Context: the project's characteristic failure mode is the invisible-at-authoring, visible-only-in-aggregate defect against which policy enforced by one person's memory is structurally weak (RCA 2026-06-01 §3, three independent surfaces); the corpus evidences L1 from both directions (review-only cast rule at ~50% conformance in a 32-of-224 sample; ~9 render-coupling excisions until tenet+harness, none observed since; zero observed recurrence after each RCA-minted lint — all relayed, history audit §2/L1 and digest §2). Rules: (1) DISCIPLINES DECLARE THEIR ENFORCEMENT SURFACE — every discipline-stating rule (ADR rule, CLAUDE.md convention, checklist line) names how it is enforced: compile-time / build-or-CI-time (lint, harness, DB constraint, generated report) / runtime / checklist-at-a-named-moment / review-only. Review-only is legitimate but presumptively decaying, and declaring it makes that a visible, challengeable choice (the ~50% datum is the calibration). (2) RECURRENCE CONVERTS TO MECHANISM, NOT MORE PROSE — when a failure shape recurs after its describing record exists, the corrective's default shape is a mechanical net at the strongest feasible surface, paired with (never replaced by) the naming prose; declining mechanization is recorded with a reason. Corollary: correctness budget goes to converting existing prose disciplines before authoring new guidance prose (history audit L1 corollary, adopted as decision text). (3) MECHANISMS ADOPT MEASURE-FIRST (the a75814c protocol, today recorded only in the eslint.config.js header and worklogs): assess stock rules before writing custom ones; measure the tree via scratch config; adopt at error only on a zero-or-fully-triaged baseline; warn-as-backlog for backlog-surfacing rules; kept violations are annotated inline escapes (the vue/no-v-html model); the rule's gaps are named at the rule site per ADR-0002; where a paid-for defect exists, probe-verify the net fires on its literal shape; adoption censuses use the historical 'at adoption … resolved' phrasing (present-tense counts in comments are the recorded rot shape — audit §3.25). (4) NETS QUANTIFY OVER THE CLASS, NOT THE INSTANCE — enumerations of instances fail open at the next instance; key on an ownership slot, a name/shape predicate, or deny-by-default with named exemptions. Four paid-for instances: the card-tree per-writer flag superseded in ~3.5h (digest §2/L2); the services blocklist incomplete-from-day-one, inverted to deny-by-default (eslint header); gate-prop keyed on name patterns, never a component allowlist (footgun worklog); the blind-mode exit enumeration returned UNDISCHARGED-HACK out-of-frame and was replaced by an exit-predicate watcher quantifying over all exits, present and future (multi-writer worklog postscript). (5) CALIBRATION — TEMPLATE, NOT TOLLGATE, WHERE THE FAILURE MODE IS CAPABILITY: a mandatory gate on judgment-shaped output produces bungled compliance, strictly worse than missing compliance (pre-merge checklist provenance / the §7.3 retraction); CI gates are for crisp mechanical predicates; advisory reports and checklists for judgment-shaped surfaces. ADR-0005 Alternative C's reasoning is incorporated, not overridden; the filed item rigor-proportionality-rubric-adoption is named as the adjacent calibration arc, not subsumed. SELF-APPLICATION (the trap, answered in the ADR's own text): this tenet binds at corrective-design moments — postmortem recommendations, lint adoptions, ADR amendments — a handful of high-attention, template-routed events per cycle, not the per-edit regime where the corpus measured prose decaying; its checkable artifacts (the enforcement-surface declaration; the adoption-baseline record) are absence-detectable by the adr-effectiveness-audits sweep cadence; and it expects its own prose to be exactly as weak as Rule 1 says — the protection is the mechanisms it mints; the tenet is the budget-steering and shape-selection record (the ADR-0010 tenet+harness pairing is the model, per the synopsis's own 'proof that a describing-only postmortem doesn't stop recurrence'). Related section doubles as the mechanization-registry index by relation, not census (ADR-0005 Rule 3): eslint.config.js rationale header, the doc-graph freshness gate, the render-count harness, work_status_violations, the proxy typecheck CI. Revisit when: a mechanization is retracted on false-positive economics; a second gate-tried-and-retracted instance; doc-side semantic-check tooling matures (the RCA G6 class); the fork adopts the corpus. FALLBACK if the maintainer declines a standalone tenet: append to ADR-0002 as Rule 8 ('discipline enforcement surfaces too') carrying Rules 1-2 only, with an explicit provisional-home flag per the Rule 7 precedent — the corpus has already paid once to learn that broader-than-fail-loudly principles parked in ADR-0002 relocate later; the flag makes that honest. Synopsis co-change required either way (cochange-advisory flags it).

### proposal `n4-adr0005-rule10-deferral-ledgering` [amend] → docs/adr/0005-documentation-discipline.md (verbatim)

**summary:** Fold L3 (deferral capture) into ADR-0005 as Rule 10, per Revisit-when #3's pre-authorized absorb-by-append. The convention exists operationally (pre-merge checklist §D, the deferral-harvest arc) but the checklist is template-not-gate and trusted-rotation-scoped; the tenet-level home makes the discipline binding for any session authoring a deferral-bearing document, and gives it the Amendments/Revisit machinery.

**details:** Ready-to-apply text. Amendments-header line: '2026-06-10 — appended Rule 10 (deferrals are ledgered at authoring time): per the history-lessons audit lesson L3 (prose deferrals reliably evaporate; ledgered ones survive) and the deferral-harvest arc, every deferral / out-of-scope / recommendation bullet either names its work-status SSOT item id or carries a grep-able `not-filed: <reason>` marker; refs to the paid-for diagnosis attach at filing time. `docs/pre-merge-checklist.md` §D is the operational walk-through.' Rule body, appended after Rule 9: '### Rule 10: Deferrals are ledgered at authoring time\n\n*(Appended 2026-06-10.)*\n\nA deferral names a piece of future work; per Rule 1, future work has exactly one owning home — the work-status SSOT. The 2026-06-10 history-lessons audit verified the failure mode from both directions (lesson L3): every deferral that reached the work-status store was accounted for at audit time, while deferrals recorded only in worklog "What’s deferred" sections, postmortem recommendations, or retrospective roadmaps reliably evaporated — including one (the module-scope rebinding audit, deferred in a 2026-05-17 worklog) parts of whose class recurred before the audit re-surfaced it.\n\n- **Capture.** Every deferral / out-of-scope / recommendation bullet in a worklog, postmortem, retrospective, audit, or consult record ends with either a work-status item id or an explicit, grep-able `not-filed: <reason>` marker. Neither "held for the next X-touch PR" nor a bare prose admission is a tracked state.\n- **Refs at filing.** An item filed near a diagnosis document gets its ref to that document at filing time; an item without refs to its paid-for diagnosis forces the next session to re-derive it.\n- **Retitle to the residual.** When an open item’s work partially ships, retitle/redescribe it to what actually remains.\n- **Generalization deferrals survive.** A deferral whose rationale is generality for a second domain is never dropped on "only one domain uses it" grounds.\n\nThis rule is Rule 6’s "where" to its "when": the evaporated deferrals *were* written down in the moment — in the wrong home. It is the forward-looking register of the consolidation Rule 9 records: Rule 9 anchors design notes to the SSOT; this rule anchors the moment future work is first named. `docs/pre-merge-checklist.md` §D is the operational walk-through. The marker convention is deliberately grep-able so a future advisory sweep can mechanize detection — Revisit-when #2’s open candidates gain a third.' Notes for the applying session: the rule is phrased SSOT-generically (not todo-DB-specifically) so it survives a clone/fork without the maintainer’s database, consistent with Rule 9’s phrasing and the audit’s stable-handles item (§3.25); the synopsis ADR-0005 entry co-changes (it currently says 'Nine rules'); Revisit-when #2’s open-candidates sentence gains the deferral-marker sweep.

### proposal `n4-adr0005-rule11-verbatim-consult-records` [amend] → docs/adr/0005-documentation-discipline.md (verbatim)

**summary:** Fold the verbatim consult-record discipline into ADR-0005 as Rule 11. Committed documents invoke 'the standing verbatim-record discipline' by name (the history audit's Method section; the multi-writer worklog's appendix header), but a grep-grade sweep finds no committed definition — the only definition located is a user-local memory note, which a clone or fork does not receive. A discipline invoked by name in committed documents needs a committed definition; that is Rule 1 applied to the discipline itself.

**details:** Ready-to-apply text. Amendments-header line: '2026-06-10 — appended Rule 11 (commissioned-review artifacts are recorded verbatim, in-tree): the commission prompt and full report of any audit / consult / adversarial-review sub-agent are recorded verbatim in an appendix of the relevant committed document; the verdict label does not travel without the artifact; corrections are in-situ and dated. Previously defined only in a user-local memory note while invoked by name in committed documents.' Rule body, appended after Rule 10: '### Rule 11: Commissioned-review artifacts are recorded verbatim, in-tree\n\n*(Appended 2026-06-10.)*\n\nWhen work leans on a commissioned review — an audit sub-agent, a consult, an adversarial pass such as a hack-rationalization run — the commission prompt and the full report are recorded verbatim in an appendix of the relevant committed document (worklog, audit note, postmortem). The verdict label does not travel without the artifact: a bare "passed review" or "narrower-but-justified" with no inspectable commission and report is the unsubstantiated-claim shape ADR-0002 and ADR-0009 forbid in their registers. Where an artifact’s authoritative copy lives off-tree (a PR comment), the committed document carries the pointer plus the artifact’s substance, so the record survives the forge. Corrections to a recorded artifact are made in situ, dated, with the surrounding artifact otherwise left verbatim — the Rule 8 sibling-revision principle applied inside a single record.\n\nSubstrate: the 2026-06-10 multi-writer arc, where a fabricated sanction quote inside an in-frame review artifact was caught precisely because the artifact was verbatim-recorded and an out-of-frame rerun could check it against the commissioning item; the strike is an in-situ dated correction, the artifact otherwise untouched (the worklog’s appendix and postscript are the worked example). The practice predates this rule — the history-lessons audit’s three-part verbatim appendix is the largest instance — but its definition lived only in a user-local memory note while committed documents invoked “the standing verbatim-record discipline” by name: a named handle with no owning committed document, the Rule 1 failure shape applied to a discipline.' Notes for the applying session: synopsis co-change (rule count); the cost acknowledged in Consequences-Negative if desired (verbatim appendices are long; the audit corpus already accepts this, splitting for renderability).

### proposal `n4-l2-owner-principle-stays-mechanized` [note] → docs/adr/0001-state-mutation-and-readonly-policy.md (verbatim)

**summary:** L2 (multi-writer slots want owners) needs no further tenet articulation. It is already carried at the right altitudes: the store-write-needs-owner lint at error on a fully-triaged baseline, two owner modules as worked examples, the ADR-0001 amendment recording the Revisit-#3 response, and the filed residual (settings-profile-mutator-owner). Minting a standalone tenet would duplicate ADR-0001's amended content — the parallel-articulation drift ADR-0005 Rule 1 forbids.

**details:** The generalized form of L2 — guards quantify over the class, not the instance — does deserve articulation, but as Rule 4 of the proposed mechanization tenet (n4-new-tenet-mechanization-discipline), where its four paid-for instances span lint design, boundary rules, and exit handling, not just store state. If that tenet is declined, the L2 generalization stays where it is today (rule-rationale headers + audit L2 + the ADR-0001 amendment) with no further action; the store-specific articulation in ADR-0001 is sufficient and current as of the 2026-06-10 amendment (relayed from the multi-writer worklog's ADR-amendment section; ADR-0001's body was not read by this reader).

### proposal `n4-measure-first-rides-with-tenet` [note] → frontend/eslint.config.js (verbatim)

**summary:** The a75814c measure-first adoption protocol is a protocol, not a principle — it should not be a standalone tenet. Its recommended home is Rule 3 of the proposed mechanization tenet. If that tenet is declined, it stays where it lives today (the eslint.config.js rationale header plus per-arc worklogs), which has worked: three 2026-06-10 worklogs cite the pattern by name and followed it.

**details:** One honest wrinkle for the maintainer: the de-facto registry (the eslint header) is itself a hand-maintained prose surface with three recorded census rots (the '6 → 6' store.profile draft census corrected by PR #382's out-of-frame audit; the ~152 → 109 no-explicit-any stale census; the digest's 'eslint census stale ~8 days after resolution'). The working fix is already practiced — the 'at adoption … resolved' historical phrasing, which is rot-proof by construction because it is a dated snapshot — and the audit's §3.25 stable-handles item carries the general convention. No new action beyond the tenet proposal; this note exists so the synthesizer does not read the header's rot history as an argument against the protocol it records.

### proposal `n4-out-of-frame-review-stays-process` [note] → CLAUDE.md (umbrella) — natural home if repo-residency is wanted; no ADR change recommended (verbatim)

**summary:** Out-of-frame adversarial review was load-bearing twice in one cycle (audit L8; the multi-writer postscript, where the in-frame run self-declared its frame deficient and the out-of-frame rerun found the exit-set leak and a fabricated sanction quote). Recommend leaving it as process (skill + user-local memory + practice), not minting an ADR: the mechanism is harness-bound tooling, and the ADR corpus is otherwise collaboration-tool-agnostic.

**details:** The trigger policy ('never self-certify general/non-lazy; >1-writer state gets an out-of-frame run') currently lives in a user-local memory note and would not travel with a clone or fork. If the maintainer wants it repo-resident, the umbrella CLAUDE.md is the right home — it already carries the collaboration-layer disciplines (documentation consumption, asking-before-assuming) — phrased tool-agnostically: a generality claim on multi-writer state is adjudicated by an actor outside the authoring frame, and the verification artifact is recorded per the verbatim-record rule (n4-adr0005-rule11). The proposed mechanization tenet deliberately includes only the in-frame, mechanical half (probe-verification against the paid-for defect's literal shape) and references out-of-frame review as composing practice rather than a rule, to keep the tenet's enforcement surfaces crisp.

### proposal `n4-template-not-gate-calibration` [note] → docs/pre-merge-checklist.md (verbatim)

**summary:** The trusted-rotation / template-not-gate pattern should not become its own tenet; it is the boundary condition on mechanization, and its recommended articulation is Rule 5 of the proposed mechanization tenet. The checklist's 'What this is — and what it is not' section remains the operational record either way.

**details:** Two cautions for whoever takes this up: (a) the digest records the §7.3 history (gate tried, retracted, template-not-gate) as the recurring calibration precedent already cited in two verifier verdicts — so the pattern has corpus-wide weight beyond the checklist, which supports naming it inside the tenet rather than leaving it checklist-local; (b) the open work-status item rigor-proportionality-rubric-adoption (open/future, per read-only DB query this session) is the adjacent arc — folding a four-axis rigor rubric into the checklist. Any tenet-level calibration text must name that item as adjacent and not subsume it, or the project mints two parallel calibration vocabularies (the ADR-0005 Rule 1 shape).

### Report (verbatim)

`````markdown
# n4 — The inverse question: new tenets from the paid-for lessons?

Reader n4 of the 2026-06-10 generic ADR-corpus audit (work-status item
`adr-effectiveness-audits`). Commission: given the last six weeks' paid-for
lessons, decide per candidate whether it warrants a NEW tenet, a fold into an
existing ADR (exact target, append point, and shape per the absorb-by-append
precedent — ADR-0005 Revisit #3, ADR-0002 Rules 6/7), or no tenet
articulation (mechanism + checklist + memory). Proposals only; the maintainer
signs off. `per_adr` is empty per the commission (no corpus documents
assigned for per-ADR verdicts).

## 1. Coverage

Read end to end: the umbrella `CLAUDE.md` and `frontend/CLAUDE.md`;
`docs/adr-synopsis.md`; the history-lessons audit
(`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`); the evidence
digest (`/tmp/adr-corpus-audit/evidence-digest.md`); the RCA
(`docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`);
`docs/pre-merge-checklist.md`; ADR-0002, ADR-0005, ADR-0008 (the three named
fold targets, full); `frontend/eslint.config.js`; and the four assigned
worklogs (`2026-06-10-multi-writer-slots-get-owners.md`,
`2026-06-10-cast-hygiene-lint.md`, `2026-06-10-deferral-harvest.md`,
`2026-06-10-vue-lifecycle-footgun-guards.md`).

Not read, deliberately: the audit appendix parts p1–p3 (cited only via
digest pointers, per the appendix access rule); the bodies of ADRs 0001,
0003, 0004, 0006, 0007, 0009, 0010 — every claim about them below is relayed
from the synopsis, the audit, or the digest, attributed. Two claims rest on
grep-grade phrase sweeps framed as counts only: `a75814c` is cited by name
in three committed 2026-06-10 worklogs plus the eslint config header; the
phrase "standing verbatim-record discipline" appears in committed docs only
at usage sites, with no committed definition document found. Read-only SQL
against the `todo` DB confirmed: no item exists for a meta-tenet or
cross-cutting mechanization articulation (the only tenet-shaped item is the
closed ADR-0008 relocation item); `rigor-proportionality-rubric-adoption`
(open/future) and `settings-profile-mutator-owner` (open/future) exist and
are named below as adjacencies. No perf claims of my own are made (ADR-0009);
all numbers are the cited documents' captured claims, attributed.

## 2. The bar applied

The corpus's own precedent for minting a tenet is consistent across
ADR-0008, ADR-0009, and ADR-0010 (relayed from their synopsis entries and
ADR-0008's Context, read in full): (a) recurrence across ≥3 independent
surfaces, (b) paid-for cost, (c) a decision the articulation changes at
authoring time. To these the commission adds the trap: a tenet whose content
is "prose decays" must say why *it* will not decay — what decision it changes
and what its enforcement surface is. I also applied ADR-0005 Rule 1 in
reverse: before recommending any articulation, check that a parallel one
does not already exist (in an ADR, the checklist, or a filed item).

## 3. Candidates

### C1. L1 ("prose disciplines decay; mechanisms stick") + RCA §5.4 — recommend: NEW TENET

These two are one question. The RCA's common root cause — the
invisible-at-authoring, visible-only-in-aggregate, policy-not-mechanism
defect — is the diagnosis; L1 is the two-sided empirical confirmation; RCA
§5.4 explicitly left open whether the shape "deserves its own cross-cutting
articulation — a meta-tenet on 'mechanize the aggregate-only defect
classes'" and named the ADR-effectiveness-audit item as the vehicle. This
commission is that vehicle.

**(i) Case for a new tenet.** Recurrence is the strongest in the corpus:
three independent surfaces in the RCA (perf/render-coupling, error-typing,
doc-status), plus the measured decay instances the audit added (cast rule at
~50% in a 32-of-224 sample; the closeBoard census; the eslint census; the
ADR-0001 mutator-vigilance prose that "decayed exactly as lesson L1
predicts" — the store-write-needs-owner rationale's own words). The
prescription side is equally evidenced: every RCA-minted lint, the
scoped-state registries, the doc-graph gate, the render-count harness
(digest §2/L1). The decisive corpus-internal argument: the project has
already proven, at ADR-0010, that a describing-only record does not stop
recurrence one surface over — and L1 itself currently lives only in
describing documents (audit §2, RCA §3) plus scattered per-mechanism
records. By the corpus's own logic, an unarticulated meta-pattern will be
re-derived or violated. The pattern is also already *instantiated* in at
least four ADRs (ADR-0002 Consequences' "policy, not an enforced mechanism"
admission — which a verifier called the sharpest warrant for the cast lint;
ADR-0005 Alternative C and its fired Revisit #2; ADR-0008 Revisit #4;
ADR-0001's mechanized Revisit-#3 response — first two read directly, rest
relayed), with no home stating the general rule. That is precisely the
"re-derived independently" cost ADR-0005's Alternative A names as the reason
to mint a tenet.

What tenet-level articulation changes at authoring time — the commission's
test: (a) corrective-shape selection at postmortem/RCA/audit time
(mechanism-first; prose-only correctives become a recorded, reasoned
exception); (b) correctness-budget allocation (the audit's corollary,
promoted from observation to decision: convert remaining prose disciplines
before writing more guidance prose); (c) new-rule authoring (every
discipline names its enforcement surface, so "review-only" becomes a
visible, challengeable choice rather than the silent default); (d) net
design (quantify over the class — see C3).

**(ii) Case for folding.** The natural fold is ADR-0002 Rule 8 ("discipline
enforcement surfaces too"), per the Rules 6/7 append precedent: a
review-only discipline failing silently at the aggregate level is
structurally a loudness question, and the hierarchy of loudness generalizes
cleanly to enforcement surfaces. But the corpus has paid once already to
learn what happens when a broader-than-fail-loudly principle parks in
ADR-0002: Rule 7 needed an explicit provisional-home flag and relocated to
ADR-0008 within two days of the flag being honest. The mechanization
principle is at least as broad as classification discipline was, and
ADR-0002 is already the corpus's most-loaded tenet. A fold also cannot
comfortably carry the protocol content (measure-first, escape hatches,
named gaps) without bloating a tenet that is about anomaly surfacing, not
infrastructure investment.

**(iii) Case for leaving it.** The RCA itself flags over-abstraction as the
risk; the per-surface mechanizations are built and working; each tenet has
its own mechanize-when-tooling-matures trigger; the eslint header and the
checklist carry the operational content. The honest counter: all of that is
true *now, under the maintainer's current attention*. The corpus's history
is that unarticulated patterns regress when attention moves (the canvas
precedent left un-generalised; the render-coupling postmortem reproduced
within days — both relayed from the synopsis's ADR-0010 entry).

**Recommendation: new tenet** (proposal
`n4-new-tenet-mechanization-discipline`, decision core drafted in the
proposal: five rules — enforcement-surface declaration; recurrence converts
to mechanism; measure-first adoption; nets quantify over the class;
template-not-gate calibration — plus exceptions and self-application). It
answers RCA §5.4 affirmatively but *procedurally*: each rule has a named
operational surface, which is what keeps it from being the over-abstraction
the RCA feared. Fallback if declined: ADR-0002 Rule 8 carrying only the
declaration + conversion rules, with an explicit provisional-home flag per
the Rule 7 precedent. The trap is answered inside the draft — see §4.

### C2. L3 (deferral capture) — recommend: FOLD into ADR-0005 as Rule 10

**(i) New tenet?** No. The principle is real and paid-for (the audit
verified it from both directions; the module-scope rebinding audit deferral
evaporated and parts of its class recurred), but it is a
documentation-lifecycle discipline — exactly the genre ADR-0005 exists for —
and ADR-0005 Revisit #3 pre-authorizes absorbing a genuinely new failure
pattern by appending a rule rather than starting a tenet.

**(ii) Fold — the recommended shape.** Target: ADR-0005, appended as Rule
10 after Rule 9, with a dated Amendments-header line — the exact shape Rules
8 and 9 used. The gap is genuine: Rule 6 governs *when* (author as you
decide — and the evaporated deferrals *were* written in the moment, in
worklogs); Rules 1/9 govern SSOT for status and design notes. Nothing covers
*where the moment of first naming future work must land*. The RCA already
showed (Finding 2d) what it costs when a Rule 1 generalization is left
implicit; appending the explicit rule is the corpus's own learned move.
Drafted text is in proposal `n4-adr0005-rule10-deferral-ledgering`, phrased
SSOT-generically so it survives a clone or fork without the maintainer's
todo DB (consistent with Rule 9 and the stable-handles item §3.25).

**(iii) Leave as checklist?** The pre-merge checklist §D already carries the
operational form, and the convention proved load-bearing within days (the
multi-writer arc's in-frame review discharged three unfiled deferrals into
`not-filed:` markers, and the out-of-frame corrective converted one into a
filed item). But the checklist is explicitly template-not-gate and
trusted-rotation-scoped; a session authoring a worklog outside that context
is bound by ADRs, not by the checklist. Tenet-level articulation closes that
scope gap; the checklist remains the walk-through.

### C3. L2 (multi-writer slots want owners) — recommend: NO new articulation (note)

**(i) New tenet?** The store-specific principle is fully homed: lint at
`error` on a fully-triaged baseline, two owner modules as worked examples,
an ADR-0001 amendment recording the Revisit-#3 response, and the residual
filed (`settings-profile-mutator-owner`, confirmed open/future by DB query).
A standalone tenet would duplicate ADR-0001's amended content — the
parallel-articulation drift ADR-0005 Rule 1 forbids. **(ii) Fold?** Already
done (the ADR-0001 amendment; relayed from the multi-writer worklog's
ADR-amendment section). **(iii) Leave?** Yes — with one addition: the
*generalized* form, "guards quantify over the class, not the instance," has
now been paid for four times across three different shapes (per-writer flag
→ owner; enumerated blocklist → deny-by-default; component allowlist
rejected for name patterns; enumerated exit set → exit-predicate watcher,
the last found only by the out-of-frame rerun). That generalization spans
beyond store state and is articulated nowhere; it rides as Rule 4 of the
proposed mechanization tenet rather than as its own ADR.

### C4. The measure-first adoption pattern (`a75814c`) — recommend: fold as Rule 3 of the new tenet (note otherwise)

It is a protocol, not a principle — the operational discipline that makes
C1's prescription safe (assess stock rules first; measure; zero-or-fully-
triaged `error` adoption; warn-as-backlog; annotated escapes; named gaps;
probe-verification against the paid-for defect's literal shape). Three
committed worklogs cite it by name and followed it; it has no articulation
outside the eslint header and worklogs. No standalone tenet: it has no
independent decision content. One wrinkle surfaced for the synthesizer
(proposal `n4-measure-first-rides-with-tenet`): the de-facto registry — the
eslint header — is itself a hand-maintained prose surface with three
recorded census rots; the working fix (the "at adoption … resolved"
historical phrasing, rot-proof because it is a dated snapshot) is already
practiced and should be the tenet's stated convention.

### C5. The verbatim consult-record discipline — recommend: FOLD into ADR-0005 as Rule 11

This one has a defect the other candidates lack: committed documents invoke
"the standing verbatim-record discipline" *by name* (the history audit's
Method section; the multi-writer worklog's appendix header — both read), but
a grep-grade sweep finds no committed definition; the only definition I can
locate is a user-local memory note. A named handle with no owning committed
document is the Rule 1 failure shape applied to a discipline — and it would
not survive a clone or the fork. The discipline has also just proven its
worth concretely: the fabricated sanction quote in the multi-writer
in-frame artifact was catchable only because the artifact was verbatim and
the out-of-frame rerun could check it against the commissioning item; the
correction is in-situ and dated, the artifact otherwise untouched. That
correction convention is Rule 8's sibling-revision principle applied inside
a single record — further evidence ADR-0005 is the right home. New tenet:
no (it is one discipline, not a register). Leave as memory: no (the
repo-residency gap is the live defect). Drafted text in proposal
`n4-adr0005-rule11-verbatim-consult-records`.

### C6. Out-of-frame adversarial review — recommend: leave as process (note)

Load-bearing twice in one cycle (audit L8; the multi-writer postscript,
where the in-frame run declared its own frame deficient and the rerun
returned UNDISCHARGED-HACK, finding the exit-set leak and the fabricated
quote). But the mechanism is harness-bound tooling
(`hack-rationalization-detector`), and the ADR corpus is otherwise
collaboration-tool-agnostic; the trigger policy lives in user-local memory.
An ADR here would couple the corpus to one collaboration stack. If
repo-residency is wanted, the umbrella `CLAUDE.md` is the natural home (it
already carries the collaboration-layer disciplines), phrased
tool-agnostically. The proposed tenet includes only the in-frame mechanical
half (probe-verification) as a rule and references out-of-frame review as
composing practice. Filed as `n4-out-of-frame-review-stays-process`.

### C7. The trusted-rotation / template-not-gate pattern — recommend: carried as the new tenet's calibration clause (note)

Not a tenet of its own: it is the *boundary condition* on mechanization —
the §7.3 retraction (gate tried, retracted; bungled documentation is
strictly worse than missing documentation) is cited in the digest as the
recurring calibration precedent across two verifier verdicts. Any
mechanization tenet that omits it would mandate exactly the gate the project
already paid to retract, so it appears as Rule 5 of the draft. Adjacency
flagged so no parallel vocabulary is minted: the open item
`rigor-proportionality-rubric-adoption` (per DB query) plans to fold a
four-axis rigor rubric into the checklist; the tenet's calibration clause
must name it as adjacent, not subsume it. Filed as
`n4-template-not-gate-calibration`.

## 4. The trap, answered

A tenet saying "prose decays" is itself prose. The draft answers in its own
text, three ways. First, *operating regime*: the tenet binds at
corrective-design moments — postmortem recommendations, lint adoptions, ADR
amendments — a handful of high-attention, template-routed events per cycle.
The corpus's decay evidence is all from the other regime: per-edit
disciplines applied hundreds of times across sessions (casts, censuses,
mutator vigilance). The RCA-to-lint pipeline, operating in the first regime,
has not missed once in the observed record. Second, *checkable artifacts*:
the enforcement-surface declaration on new rules and the adoption-baseline
record on new mechanisms are absence-detectable — the
`adr-effectiveness-audits` cadence (now a filed sweep, per audit §3.23) can
audit them mechanically, which a pure exhortation cannot offer. Third,
*honest self-expectation*: the tenet states that its own prose is exactly as
weak as Rule 1 says; the protection is the mechanisms it mints, and the
tenet is the budget-steering and shape-selection record. The ADR-0010
pairing — tenet names, mechanism holds — is the model, and is the corpus's
only natural experiment where recurrence demonstrably stopped.

## 5. Fork fitness

C1's tenet is fully domain-free and advances the fork: the fork author
inherits the lint suite, the adoption protocol, and the convention that cast
justifications on band boundaries name the band character (the seam-map
reshape the cast-hygiene item recorded). C2's rule is drafted
SSOT-generically because the todo DB does not travel with a clone; the §D
handle-pairing convention already anticipates this. C5 directly fixes a
fork-portability defect (a discipline invoked in committed docs but defined
user-locally). C6's tooling does not travel and is left as process for that
reason.

## 6. Proposal summary

| id | target | kind | one line |
|---|---|---|---|
| n4-new-tenet-mechanization-discipline | new ADR-0011 | new-tenet | L1 + RCA §5.4 as the enforcement-register tenet; five rules, drafted core; ADR-0002 Rule 8 + provisional-home flag as fallback |
| n4-adr0005-rule10-deferral-ledgering | ADR-0005 | amend | L3 as Rule 10, absorb-by-append per Revisit #3; §D stays the walk-through |
| n4-adr0005-rule11-verbatim-consult-records | ADR-0005 | amend | verbatim consult records as Rule 11; closes the named-but-undefined-handle gap |
| n4-l2-owner-principle-stays-mechanized | ADR-0001 | note | L2 fully homed; generalized form rides as the tenet's Rule 4 |
| n4-measure-first-rides-with-tenet | eslint.config.js | note | protocol, not principle; tenet Rule 3; registry-rot wrinkle named |
| n4-out-of-frame-review-stays-process | CLAUDE.md (if wanted) | note | harness-bound; tool-agnostic CLAUDE.md text if repo-residency is wanted |
| n4-template-not-gate-calibration | pre-merge checklist | note | boundary condition on mechanization; tenet Rule 5; rigor-rubric item named as adjacent |

## 7. Limits

I did not read the appendix corpus (by rule) or the seven unassigned ADR
bodies; claims about ADR-0001/0003/0009/0010 are relayed and so inherit the
digest's caveats (notably the unreproduced 38-trigger total, immaterial
here). The ADR-0005 rule numbering (10, 11) assumes no concurrent amendment
lands first; the two amendments are independent and reorderable. Whether two
ADR-0005 appends plus one new tenet in a single cycle is more change than
the maintainer wants the corpus to absorb at once is a pacing judgment I
flag rather than make; if sequenced, C2 (deferral ledgering) has the
strongest evidence-to-cost ratio and C1 the largest scope.

License of all quoted material: Public Domain (The Unlicense), per the
source documents.
`````


## §2 · refuter:n4-new-tenet-mechanization-discipline (lens: combined) — verdict **survives**

Commission: `refuterPrompt` over proposal `n4-new-tenet-mechanization-discipline` (fields above), reader n4, rationale excerpt per §0's reconstruction rule.

**findings (verbatim):** LENS 1 (reference web): The proposal removes/relocates nothing, so nothing orphans. Inbound-reference checks: docs/adr/ holds 0001–0010, so 0011 is genuinely the next free number at HEAD; the todo DB has refs.kind='adr' rows only for ADR-0007 and ADR-0008 (neither touched); no item or description references a mechanization tenet or ADR-0011. The real reference-web duties are additive: the synopsis is a declared derived doc (`<!-- derived-from: docs/adr/*.md -->`) and cochange-advisory.mjs matches the glob against any changed file under docs/adr/, so a new 0011 does flag the synopsis as claimed (advisory, never gates) — but the synopsis edit is bigger than an appended entry: the "How to read these together" section hard-codes "eight tenets" and the three-member family paragraph. Adding a doc is a structural doc-graph change, so the doc-graph must regenerate in the same change (CI-gated) — the proposal omits this. RCA §5 has no literal "§5.4" heading (it is open question 4), and "§5.4" is a live colliding handle in this corpus (the adaptive postmortem's §5.4 probe script was dropped under that exact handle in the E4 sign-off the same day).

LENS 2 (content custody): Every load-bearing custody claim checks out, with two corrections. Verified true: RCA §5 question 4 is open and names a meta-tenet as a maintainer judgment with adr-effectiveness-audits as the vehicle (item exists, open/in-progress); the §7.3 gate-tried-and-retracted arc exists verbatim (knob-toolbar postmortem amendment + pre-merge-checklist provenance); ADR-0005 Alternative C is "rejected (for now) … partly adopted 2026-06-01"; ADR-0002 Rule 7's provisional-home flag and its retirement into ADR-0008 is the exact fallback precedent claimed (plus a closed work-status item recording the relocation); the four Rule-4 instances are all real (clear-needs-ownership rationale block records the failed per-writer flag; eslint header records the incomplete-from-day-one blocklist inversion; gate-prop rule keys on name patterns "never a component allowlist" in the config itself; the multi-writer worklog postscript records the out-of-frame UNDISCHARGED-HACK and the exit-predicate watcher quantifying over all exits). Corrections: (a) the a75814c measure-first protocol is NOT "recorded only in the eslint.config.js header and worklogs" — it is also normatively invoked in the deferral-harvest audit's §4.2 maintainer question and §7 E4 sign-off ("adopt, measure-first per the a75814c pattern") and throughout the history audit; the true gap is the absence of a tenet-level home, which actually strengthens Rule 3's case but the ADR must state the custody accurately. (b) Rule 1 as drafted ("every discipline-stating rule … names how it is enforced") reads as a corpus-wide retroactive mandate, fighting every sibling tenet's no-retroactive-sweep Neutral clause; the SELF-APPLICATION paragraph shows the intent is authoring/corrective-time, so the Neutral clause must be explicit. Also: the enforcement-surface vocabulary lumps DB constraints and generated reports under "build-or-CI-time", which misplaces write-time store constraints and blurs Rule 5's own gate-vs-advisory split — an ADR-0008 vocabulary-fit defect in a tenet that cites ADR-0008. The "completes the family" framing over-claims: Rule 1 is family-shaped (enforcement becomes a claim requiring declared substantiation); Rules 2–5 are corrective-design protocol, adjacent to the family. Rule 3's adoption-census clause must name its reconciliation with code-comment-stable-handles (historical point-in-time baselines vs living censuses; PR #382's "6 → 6" stale-draft correction is the worked caution). Evidence figures need their caveats carried: ~50% is a 32-of-224 .ts sample with template casts unaudited; the post-ADR-0010 no-recurrence is a ~9-day window the corpus itself marks "explicitly a hypothesis".

LENS 3 (substitution + fork): The guarded shape in most general form: a discipline enforced only by one person's memory fails silently at the aggregate level (RCA §3, three independent surfaces). Surfaces the shape can hit at HEAD include several worse than any observed instance: the backend/qeubo MIT licensing firewall (review-only; a silent violation is legally contaminating), FILES.md band-tag accuracy now that the fork makes B1 contractual (accuracy never swept), and retire-on-ship doc status (G4 is checklist-by-memory by the RCA's own caveat). Declining the tenet leaves the corrective-design protocol scattered across a commit hash, a config header, and operational records — exactly the L3 evaporation shape the corpus measured, and the next corrective defaults back to prose, the measured-decaying form. The self-application trap is answered adequately by the proposal's own terms and matches the corpus's tenet+mechanism theory (ADR-0010 + harness is the precedented model; the tenet's checkable artifacts are absence-detectable, though the adr-effectiveness-audits sweep checklist as recorded covers Revisit-when triggers only and must be extended). Fork: pure gain — the protocol travels with the corpus instead of a Go-SPA config header, and enforcement-surface declarations tell a fork author which disciplines have in-tree teeth versus decayed prose; the Revisit-when already names corpus adoption by the fork. The fallback (ADR-0002 Rule 8, Rules 1–2 only) is precedented but lossy: Rules 3–5 stay homeless (the status quo the proposal exists to end) — the fallback text must say so.

**required_repairs (verbatim):** R1 — Rule 1 scoping: add the corpus-standard Neutral clause (no retroactive sweep; declarations bind when a discipline is authored or amended and at corrective-design moments; existing rules retrofit on touch; the sweep detects absence thereafter), aligning the rule text with the SELF-APPLICATION paragraph. R2 — Fix the enforcement-surface vocabulary before adoption (ADR-0008 applied to the tenet's own enum): separate write-time store constraints (table constraints) and query-time gates (work_status_violations) from build/CI gates, and keep advisory surfaces (doc-graph dangling report, cochange-advisory) out of the gate bucket so Rule 5's gate-vs-advisory split is representable in Rule 1's vocabulary; relate the ladder explicitly to ADR-0002's loudness hierarchy. R3 — Correct the Rule-3 custody claim: the a75814c protocol is recorded in the eslint.config.js header, the 2026-06-10 worklogs, AND the deferral-harvest audit (§4.2 + §7 E4 sign-off) and the history audit; the gap being closed is the absence of a normative home. Related section names the eslint header as the operational register; the header gets a pointer to the tenet on next touch; no parallel restatement (ADR-0005 Rules 1/3). R4 — Carry evidence caveats in the Context: ~50% cast conformance is a 32-of-224 .ts sample, SFC template casts unaudited at sampling (audit §8); the post-ADR-0010 no-recurrence is a ~9-day-window observation the corpus marks a hypothesis; RCA-lint zero-recurrence claims carry adoption dates. All relayed-attributed per ADR-0009's posture. R5 — Scope the family claim: Rule 1 is the family-register face; Rules 2–5 are corrective-design protocol adjacent to the ADR-0002/0008/0009 family, not a fourth member wholesale; the synopsis "How to read these together" co-change rewrites the eight-tenets count and the family paragraph accordingly rather than appending. R6 — Rule 3 names its reconciliation with code-comment-stable-handles: historical "at adoption … resolved" baselines are point-in-time records, distinct from the living censuses that convention bans from prose comments; cite the PR #382 "6 → 6" stale-draft correction as the worked caution that even historical baselines need the dated in-place correction convention. R7 — Cite "RCA §5, open question 4" precisely; "§5.4" collides with the adaptive postmortem's §5.4 probe script handle dropped in the same-day E4 record. R8 — Ship mechanics: file a work-status item (natural parent adr-effectiveness-audits) with refs to the RCA and the history audit, and a refs.kind='adr' row per existing precedent; stage (not execute) the curation edit extending the adr-effectiveness-audits sweep checklist with the two new absence-checks (enforcement-surface declaration; adoption-baseline record); regenerate the doc-graph in the same change (structural addition, CI-gated); synopsis co-change as in R5; Genre line follows the established "ninth tenet, after ADR-0002 … ADR-0010" chain; License section per the ADR-0008+ pattern; confirm no sibling proposal in this audit cycle also mints an ADR before fixing the 0011 number (second-to-merge renumbers and regenerates). R9 — If the maintainer takes the fallback (ADR-0002 Rule 8, Rules 1–2 only, provisional-home flag), the Rule-8 text names the loss explicitly: Rules 3–5 remain without a normative home, and the flag's relocation target is this proposal's full tenet.

**report (verbatim):**

`````markdown
# Adversarial refutation report — n4-new-tenet-mechanization-discipline (ADR-0011, Mechanization Discipline)

**Commission.** Attempt to refute the proposal to mint a new cross-cutting tenet (target `docs/adr/0011`, next free number at HEAD) answering RCA 2026-06-01 §5 open question 4: five rules — (1) disciplines declare their enforcement surface, (2) recurrence converts to mechanism not more prose, (3) measure-first adoption (the a75814c protocol), (4) nets quantify over the class not the instance, (5) template-not-gate calibration — plus a self-application answer and a fallback (append to ADR-0002 as a flagged provisional Rule 8 carrying Rules 1–2 only). All three refutation lenses were run.

**Coverage.** Read end to end this session: `docs/adr-synopsis.md`; ADR-0002, ADR-0005, ADR-0008, ADR-0009, ADR-0010; `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`; `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`; the evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`); `docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md`; `docs/pre-merge-checklist.md`; `docs/notes/audit/audit-spa-history-lessons-2026-06-10-filings.md`; `docs/notes/audit/audit-deferral-harvest-2026-06-10.md`; `frontend/eslint.config.js`; `docs/worklog/2026-06-10-multi-writer-slots-get-owners.md`; `tools/doc-graph/cochange-advisory.mjs`; the umbrella and frontend `CLAUDE.md`. Not read (named gaps): the appendix parts p1–p3 (excluded by commission — appendix material cited only via the digest's pointers); ADR-0001/0003/0004/0006/0007 (claims about them are relayed from the synopsis and digest, attributed); the cast-hygiene and BaseChart footgun worklogs (the gate-prop name-pattern and measure-first claims were instead verified directly against `eslint.config.js`, which was read in full). Todo DB queried read-only (refs by kind, item lookups); no writes.

## Lens 1 — Reference web

The proposal removes, moves, and rewords nothing in the existing corpus, so no inbound reference orphans. Checks run:

- `docs/adr/` holds 0001–0010 only; **0011 is genuinely free at HEAD**.
- `SELECT item_id, kind, target FROM refs WHERE kind='adr'` returns two rows (ADR-0007, ADR-0008) — neither touched. No item title/description references a mechanization tenet, a meta-tenet, or ADR-0011.
- The synopsis is a declared derived doc (`<!-- derived-from: docs/adr/*.md -->`), and `cochange-advisory.mjs` diffs changed files against that glob — a **new** file under `docs/adr/` matches, so the claimed advisory flagging of an untouched synopsis is real (verified against the tool's `advise()` core; advisory only, exit 0, never gates).

Three additive reference-web duties the proposal under-specifies:

1. **The synopsis co-change is a rewrite, not an append.** "How to read these together" hard-codes "The eight tenets form a coherent posture" and a three-member family paragraph (ADR-0002/0008/0009). A ninth tenet claiming family membership forces both passages open.
2. **Doc-graph regeneration is mandatory and unmentioned.** Adding a doc is a structural doc-graph change; the committed artifact is CI-gated for structure. Same-change regeneration, plus the two-structural-PRs-in-flight rebase rule, applies.
3. **"§5.4" is a colliding handle.** The RCA has no literal §5.4 heading — the target is §5, open question 4. Meanwhile the adaptive postmortem's actual §5.4 (probe script) was dropped under exactly that handle in the deferral-harvest E4 sign-off the same day. The citation must be precise.

## Lens 2 — Content custody

Each custody claim was verified against the claimed home, read end to end.

**Verified true:**

- **RCA §5 question 4** is genuinely open, frames the meta-tenet as a maintainer judgment ("or whether that would be over-abstraction"), and names `adr-effectiveness-audits` as the adjacent vehicle — the item exists, open/in-progress, with the trigger-sweep cadence folded into its description. The proposal answers the question without retro-editing the RCA (correct shape; the RCA directory convention is point-in-time, not retro-edited).
- **Rule 5's substrate**: the §7.3 amendment in the knob-toolbar postmortem carries the gate-tried-and-retracted reasoning verbatim ("bungled documentation instead of missing documentation, which is strictly worse"), and `docs/pre-merge-checklist.md` self-describes as "not a merge-blocking gate" citing it. ADR-0005 Alternative C is "Rejected (for now) … Partly adopted 2026-06-01" — incorporated-not-overridden is the accurate relation. The filed `rigor-proportionality-rubric-adoption` item exists (open/future, "Template-not-gate framing applies"), so naming it adjacent-not-subsumed is honest.
- **The fallback precedent**: ADR-0002's Rule 7 provisional-home flag, its 2026-05-17 retirement into ADR-0008, and the closed `classification-discipline-tenet-rule7-relocation` item — the corpus did pay once for a broader-than-fail-loudly principle parked in ADR-0002, exactly as claimed.
- **Rule 4's four instances**: (i) the `clear-needs-ownership` rationale block in `eslint.config.js` records the failed per-writer flag (`isReviewActive`) the owner superseded; (ii) the services blocklist's incomplete-from-day-one inversion to deny-by-default is recorded in the same header; (iii) the gate-prop rule "keys on NAME patterns … never a component allowlist (the enumerated-blocklist failure shape)" — in the config itself; (iv) the multi-writer worklog's postscript records the out-of-frame **UNDISCHARGED-HACK** verdict on the three-of-six hand-enumerated exit set and the corrective exit-predicate watcher "quantif[ying] over ALL exits, present and future," with an exhaustive `never`-default switch over `ReviewStatus`. All four are real, in the claimed homes.
- **Rule 3's probe-verify clause**: both custom lints record probe verification by reintroducing the paid-for bug's literal shape (`clear-needs-ownership`, `module-intent-in-script-setup`); the store-write rule's worklog records probe + negative-control runs.

**Corrections the shipped ADR must absorb:**

- **(a) The Rule-3 custody claim is factually loose.** The measure-first protocol is *not* "today recorded only in the eslint.config.js header and worklogs": it is normatively invoked in the deferral-harvest audit (§4.2 "adopt, measure-first per the `a75814c` pattern"; §7 E4 sign-off repeats it as a maintainer decision) and throughout the history audit and its staged filings. The true gap — which strengthens rather than weakens Rule 3 — is that the protocol's only *home* is a commit hash plus a config header, with every normative invocation pointing at that hash. The ADR must state the custody accurately and relate (not restate) the eslint header per ADR-0005 Rules 1/3, or it mints the parallel-articulation drift the corpus already names as a failure.
- **(b) Rule 1 as drafted fights the corpus's Neutral-clause posture.** "Every discipline-stating rule … names how it is enforced" reads as a corpus-wide retroactive mandate over ~10 ADRs and several CLAUDE.md files; every sibling tenet (0005, 0008, 0009, 0010 — read; 0004/0006 per the synopsis) carries an explicit no-retroactive-sweep / retrofit-on-touch clause. The proposal's own SELF-APPLICATION paragraph scopes binding to corrective-design moments, so the fix is a clause, not a redesign — but without it the tenet ships fighting ADR-0004's spirit as ADR-0005's Neutral section states it.
- **(c) The enforcement-surface vocabulary has an ADR-0008 fit defect.** "Build-or-CI-time (lint, harness, DB constraint, generated report)" misplaces write-time table constraints (they fire at the write, not in CI), conflates the query-time `work_status_violations` gate with build gates, and buckets *advisory* generated reports (the doc-graph dangling report, cochange-advisory — both deliberately never-gate) with gates — blurring exactly the gate-vs-advisory split Rule 5 makes load-bearing. A tenet that cites ADR-0008 cannot ship a closed vocabulary with a known misfit.
- **(d) "Completes the family" over-claims.** The family (synopsis, ADR-0008/0009 genre lines) is unsubstantiated-claim disciplines at intervention points. Rule 1 fits that shape ("this discipline is enforced" becomes a claim requiring declared substantiation — parallel to ADR-0009's attach-the-profile). Rules 2–5 are corrective-design protocol, not claim-disciplines. The honest framing: Rule 1 is the family-register face; the tenet as a whole is the corrective-design discipline adjacent to the family.
- **(e) Rule 3's census clause needs its reconciliation stated.** `code-comment-stable-handles` (audit §3.25, now in `frontend/CLAUDE.md`'s comment convention) bans counts/censuses from prose comments; Rule 3 institutionalizes adoption censuses in the config header. They reconcile on the historical-vs-present-tense axis (a point-in-time baseline cannot rot; a living census does), and the corpus already practices this — but the PR #382 "6 → 6" stale-draft census correction shows historical baselines can still be *wrong at authoring* and need the dated in-place correction convention. The ADR must name this seam or the two conventions read as contradictory.
- **(f) Evidence caveats must travel.** The ~50% cast-conformance figure is a 32-of-224 `.ts` sample with SFC template casts unaudited at sampling time (audit §8); the post-ADR-0010 no-recurrence observation is a ~9-day window the digest marks "explicitly a hypothesis"; the RCA-lint zero-recurrence claims are days old at most. The proposal relays with attribution (correct), but the ADR's Context must carry the caveats, per the same ADR-0009 posture the audit corpus applied to itself.

No convention forbids the edit shape: a new sibling ADR is the corpus's own precedented move (ADR-0008 from Rule 7's flag; ADR-0010 from a postmortem's Recommendation 1), the RCA stays unedited, and the fallback follows the Amendments-header + append-a-rule pattern exactly.

## Lens 3 — Substitution test + fork

**The failure shape, most general form:** a discipline fully in force but enforced only by one person's attention fails silently at the aggregate level, because each act is locally correct and nothing aggregates acts into a pattern-level signal (RCA §3 — three independent surfaces; the corpus's self-diagnosed characteristic failure mode).

**Surfaces the shape can hit, worst cases at HEAD:** (i) the `backend/qeubo/` MIT licensing firewall — review-and-memory enforced; a silent violation contaminates public-domain code legally, invisibly, and retroactively; (ii) FILES.md band-tag accuracy — never swept, and the fork makes the B1 boundary contractual (the audit's own escalation); (iii) retire-on-ship work status — G4 is checklist-by-memory by the RCA's own caveat ("a checklist guarded by memory is weaker than a lint; this is a mitigation, not a fix"). Each is strictly worse than the observed instances (six reparse sites; a stale TODO entry).

**Cost of not shipping the articulation:** the corrective-design protocol remains scattered across a commit hash, a config header, and operational records — the L3 evaporation shape the corpus measured ("worklog/postmortem-only deferrals reliably evaporated"), applied to the project's most load-bearing meta-asset. The next corrective author re-derives the protocol or defaults to prose — the measured-decaying form. The per-arc re-derivation cost is the same shape ADR-0009's Context names for perf tooling.

**The self-application trap** (a prose tenet about distrusting prose) is answered adequately and on the corpus's own terms: it binds at a handful of template-routed, high-attention corrective-design moments rather than the per-edit regime where decay was measured; its two checkable artifacts (the declaration; the adoption baseline) are absence-detectable; and the corpus's worked theory is that tenet+mechanism *pairs* arrest recurrence (digest: "only tenet+mechanism pairs arrest recurrence"; ADR-0010+harness is the precedented model the synopsis itself names). One gap: the `adr-effectiveness-audits` sweep cadence, as recorded in the item, checks Revisit-when triggers only — the two new absence-checks must be added to it (a staged curation edit), or the absence-detection claim is aspirational.

**Fork:** pure gain. The fork author inherits the corrective-design protocol with the corpus rather than archaeology against a Go-SPA config header, and Rule 1's declarations tell them which disciplines have in-tree teeth (the lints travel with `frontend/`) versus which were review-only prose not to be trusted at face value. Nothing is removed. The Revisit-when already names "the fork adopts the corpus" as a trigger. Under the **fallback**, the fork (and the home repo) lose the measure-first protocol and the quantify-over-the-class rule again — the status quo, which the flagged provisional home at least makes honest; the fallback text must name that loss.

## Verdict

**Survives**, with a required repair set. Every load-bearing evidence claim checked out in its claimed home — including the three most refutable ones (the out-of-frame UNDISCHARGED-HACK → exit-predicate-watcher arc; the gate-retraction provenance; the Rule 7 provisional-home precedent). The defects found are real but are accuracy, scoping, vocabulary-fit, and ship-mechanics repairs; none touches the proposal's spine (five rules with named operational surfaces, the self-application answer, the precedented fallback). The strongest refutation candidate — that per-tenet Revisit-when mechanization triggers (0005 #2, 0008 #4, 0009 #4, 0010 #1) already cover this, making the tenet over-abstraction — fails on custody grounds: those triggers authorize per-surface mechanization but none carries the adoption protocol, the net-design rule, the aggregate-only defect class, or the calibration; that content has no normative home today, and the RCA explicitly left the cross-cutting question open for exactly this answer.

## Required repairs (the proposal ships with all of these)

1. **Rule 1 Neutral clause:** declarations bind at discipline authoring/amendment and corrective-design moments; existing rules retrofit on touch; the sweep detects absence; no retroactive sweep.
2. **Enforcement-surface vocabulary fixed before adoption:** write-time store constraints and query-time gates separated from build/CI gates; advisory surfaces (doc-graph dangling report, cochange-advisory) kept out of the gate bucket so Rule 5's split is representable; ladder related explicitly to ADR-0002's loudness hierarchy.
3. **Rule-3 custody corrected:** the a75814c protocol is recorded in the eslint header, the 2026-06-10 worklogs, *and* the deferral-harvest audit (§4.2/§7) + history audit; the gap is the missing normative home. Related section names the eslint header as the operational register; pointer added to the header on next touch; no parallel restatement (ADR-0005 Rules 1/3).
4. **Evidence caveats carried in Context:** 32-of-224 sample basis with template casts unaudited; the ~9-day no-recurrence window marked hypothesis; RCA-lint adoption dates; all attributed (ADR-0009 posture).
5. **Family claim scoped:** Rule 1 as the family-register face; Rules 2–5 as adjacent corrective-design protocol; the synopsis "How to read these together" count and family paragraph rewritten, not appended to.
6. **Rule 3 names the code-comment-stable-handles seam:** historical point-in-time baselines vs living censuses, with the PR #382 "6 → 6" correction as the worked caution.
7. **Precise RCA citation:** "RCA §5, open question 4" (the "§5.4" handle collides with the adaptive postmortem's probe script dropped in the same-day E4 record).
8. **Ship mechanics:** work-status item filed (parent `adr-effectiveness-audits`; refs to the RCA and history audit; a `refs.kind='adr'` row per precedent); staged curation edit extending the sweep checklist with the two absence-checks; doc-graph regenerated in the same change; Genre line follows the "ninth tenet, after …" chain; License section per the ADR-0008+ pattern; the 0011 number confirmed against any sibling ADR-minting proposal in this audit cycle (second-to-merge renumbers and regenerates).
9. **Fallback loss named:** if the maintainer takes the ADR-0002 Rule 8 route, the rule text states that Rules 3–5 remain homeless and that the provisional flag's relocation target is this tenet.

— Adversarial refuter, 2026-06-10. Read-only session; no files written, no DB writes.
`````


---

## §3 · digest:appendix-corpus

Commission: `DIGEST_PROMPT` (§0 script, verbatim). The digest file was
written to `/tmp/adr-corpus-audit/evidence-digest.md` (scratch, sanctioned);
the identical content returned in-band is reproduced here as the durable copy.

### Coverage (verbatim)

Read END TO END, every line: (1) docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (597 lines); (2) appendix p1 (~252KB, 1477 lines); (3) appendix p2 (~308KB, 1257 lines); (4) appendix p3 (~248KB, 1020 lines). Reading method: the appendix files contain many lines >2000 chars, which the Read tool truncates; to avoid silent truncation I made byte-complete fold-wrapped copies in /tmp (fold -s -w 350; byte counts verified against originals: p1 252110 vs 251679, p2 308950 vs 308334, p3 248490 vs 247987 — deltas are inserted newlines only) and read those copies in full, in overlapping sequential chunks covering 100% of each file (p1: lines 1-1908 in 5 reads; p2: 1-1873 in 7 reads; p3: 1-1523 in 5 reads; main: 1-597 in 1 read). Nothing in the four commissioned documents was skipped or skimmed. NOT read (outside commission, named for completeness): the companion artifacts audit-spa-history-lessons-2026-06-10-filings.md and -filing.sql (digest cites them as pointers only, never relies on their content); backend/qeubo/ untouched per the licensing firewall; no todo-DB access of any kind (not needed; all DB facts in the digest are quoted from the appendix's verbatim records). Only write performed: /tmp/adr-corpus-audit/evidence-digest.md (sanctioned); temporary wrapped copies in /tmp were deleted after use; no repo files or DB rows touched.

### Notes (verbatim)

1) SIZE: the digest is ~29.6KB, modestly above the 15-25KB target. I prioritized the commission's harder requirements (complete per-trigger dispositions for all 38 triggers, a pointer on every claim, all deflations) over the size ceiling; trimming further would have cut evidence, the worse defect. 2) STAGED ≠ FILED: the 20 work-status items the history review produced (including adr-record-amendments-2026-06, parent adr-effectiveness-audits) are STAGED in -filing.sql, NOT inserted (main §5) — the corpus audit must not assume they exist in the todo DB, and must not re-file them. 3) The most actionable single tension for the corpus audit is main-vs-appendix item 1 in digest §2: main asserts ADR-0003 trigger #1 "fired twice over" via chess-clone + fork, while two p3 verifiers independently record that chess-clone's own trigger condition (chess contributor with PoC) has NOT fired — adopt the appendix's careful version when amending ADR-0003. 4) ADR-0006 and the synopsis are nearly observation-free in this corpus (one e2e read of the synopsis, zero invocations of ADR-0006); their effectiveness cannot be judged from this evidence and needs direct assessment in the corpus audit. 5) The per-trigger walk is a point-in-time snapshot at HEAD 2dc056e / 2026-06-10; ADR-0003 #1's disposition flipped mid-review when the fork constraint arrived — any later sweep should treat the miner's "no" as superseded. 6) Two unconditional ADR text defects the audit can verify in seconds regardless of its broader verdicts: ADR-0010's trailing `</content>`/`</invoke>` lines (byte-verified, three subsequent commits blind to them) and ADR-0001's mutateBoard re-wrap bullet (lines ~100-103) contradicted by store/index.ts:157-171. 7) The 38-trigger count is miner-reported and was NOT reproduced by the verifier that checked (21 across the five ADRs it read); the corpus audit should re-derive the full trigger census from its own end-to-end ADR reads rather than citing 38. 8) Several verifier verdicts in p2/p3 read specific ADRs end to end and recorded precise line anchors (e.g. ADR-0003 :317-321/:105-111/:136-139/:261-282; ADR-0002 :185-189) — these are the cheapest cross-checks for the corpus audit's own reads, but per ADR-0002 the audit must still read the ADRs themselves before citing them.

### The evidence digest (verbatim)

`````markdown
# Evidence digest — ADR-corpus audit input (2026-06-10)

For the generic ADR-corpus audit (item `adr-effectiveness-audits`). Sources, read end to end by this
agent: `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` ("main") + appendix parts p1/p2/p3.
Pointers use the appendix's own agent names (key in §3). This digests how the ten ADRs + synopsis
performed in practice during the 90-agent history review; it does not restate that review's items.

Workflow: main run `wf_0c519f95-277` (13 miners → 3 distillers + merge → 18 candidates × 2 adversarial
verifiers); generalization run `wf_5548d33c-697` (2 fork-lens distillers → merge → 18 generalization
verdicts + 8 new candidates × 2 verifiers). All 18 survived; 7/8 new (p1 header; main §Method). The
adr-triggers miner ran one complete Revisit-when sweep: **38 triggers (0001:5, 0002:4, 0003:4, 0004:2,
0005:3, 0006:3, 0007:4, 0008:4, 0009:5, 0010:4)** (p1 harvest:adr-triggers). Caveat: a p2 verifier
could not reproduce 38 from the five ADRs it read (21 there) — re-derive at execution (p2
verify:exist:adr-trigger-sweep, corr. 6).

---

## §1 Per corpus document

### ADR-0001 — state mutation / readonly
**(a) Triggers** (p1 harvest:adr-triggers): #1 multi-tab NOT satisfied (`item-27-etag-multitab`
open/future). #2 reactivity hot spots **SATISFIED AND UNRECORDED** — boardsById (store/index.ts:127-149),
mutateBoard identity-swap removal (:157-171, per the 2026-05-28 game-scroll audit); ADR lines 97-107
still list the re-wrap as a benefit — reader actively misled; never amended. #3 mutator bypass NOT
satisfied structurally (zero direct `store.boards[...]=` writes outside src/store/). #4 Pinia NOT
satisfied. #5 TS immutability primitive not satisfied. Verdict: no Pinia case; the honest fix is the
doc correction (finding 8).
**(b) Miners**: mech-conformance §5 — discipline frays at persisted profile collections (useQeubo.ts:767/
:824-826, useLocale.ts:66, scenarioContext.ts; knownTags two writers) — "Revisit #3 names exactly this";
template `session.ui` toggles sanctioned verbatim by §"Exception: UI state written directly from
templates". arch-ergonomics finding 1: analysis-service.ts:463 board write via `as any` bypasses the
boardsVersion bump.
**(c) Verifiers**: ADR-0001 read e2e by both multi-writer verifiers; Revisit #3 *settled* fit ("the ADR
explicitly anticipates this drift"); the template-toggle Exception is the carve-out any writer-lint must
encode; amendment appended per ADR-0002 Rule 6; priorityHint raise (p2 verify:exist/fit:multi-writer-
slots-get-owners).
**(d) Generalization**: routing writes through named mutators strengthens Band-1 machinery the fork
shares; advances (p3 gen-verify:multi-writer-slots-get-owners).
**(e) Deflations**: only the re-wrap bullet (lines 100-103) is false, and only for mutateBoard —
**mutateReviewSession still identity-swaps** (store/index.ts:209); the version-counter/invariant/grep
bullets hold (p2 verify:exist:adr-trigger-sweep, corr. 1). #2 fired "on a plain reading" but not in its
anticipated form (deep-proxy cost) — actual: O(N) find-walks + array-dep over-invalidation; the
readonly decision stands (p2 verify:fit:adr-trigger-sweep, corr. 1). Related-section "docstrings
reference this ADR" stale for mutateBoard; mutateBoard's comment cites a stale pre-reorg audit path
(same verdict, corr. 2).

### ADR-0002 — fail loudly
**(a) Triggers** (p1 harvest:adr-triggers): #1/#2 (warning spam; message collapse) user-report-dependent,
**not assessable** (also main §8). #3 new silent-fallback domains — none found. #4 Sentry — NOT
satisfied.
**(b) Miners — load-bearing**: the most-invoked standard in the corpus. postmortems: only tenet+mechanism
pairs arrest recurrence; RCA §3 quoted ("invisible-at-authoring-time… only mechanical nets help").
mech-conformance §3: Rule-2 cast-justification held at **~50% in a 32-of-224 sample** — an ADR rule
decaying measurably under review-only enforcement. Migrations named "the one place ADR-0002 fail-loud
is structurally absent" (worklog-current finding 8).
**(c) Verifiers — text settled disputes**: Rule 2 quoted verbatim to ground the cast lint; ADR-0002's
own Consequences admission ("policy, not an enforced mechanism") cited as the sharpest warrant (p2
verify:fit:cast-hygiene-lint, reasoning + corr. 5). Rule 7's closed-vocabulary list **explicitly
includes "an ADR-0003 band tag"** (0002:185-189) — "the strongest tenet anchor" for the band-conformance
check, which the candidate had missed (p3 new-fit:mechanize-band-conformance, corr. 2). Rule 6 governs
every amendment shape (p2 verify:fit:adr-trigger-sweep). Rule 7 surfaced the `refs.kind` enum gap (no
'audit' value — a closest-match seam to name; p2 verify:fit:work-status-authoring-hygiene, corr. b;
main §5). **Where verifiers had to construct**: Rule 4's letter covers ACL boundaries only — for the
services-layer merge guard the citation was ruled "analogical, not literal" (p2 verify:exist/fit:
enrichment-merge-null-validation, corrs. a/b); the loudness *terminal level* (warn vs throw vs
pushSystemMessage) is not decidable from the ADR — left to implementation; "a throw on the packet path
for a wire-origin anomaly is probably wrong" (same; main §3.6). Capability-mismatch loudness also
constructed: degrade one capability, never extend the connection-refusal surface (p2 verify:fit:
typed-capability-metadata-mirror, corr. d).
**(d) Generalization**: Band-1 fail-loud is what the fork "inherits for free" (p3 gen-verify:migration-
silent-noop-guard; gen-verify:enrichment-merge — guard stays structural/instance-blind in the generic
helper).
**(e) Deflations**: "error packets invisible" overstated — transport onError → pushSystemMessage already
fires (loudness level 4); the real silent failure is the secondary type-confused flow (telemetry
corruption, premature auto-cleanup, false "ponder exhausted", leaked activeQueries entry) (p2
verify:exist/fit:engine-subscription-union-narrowing; main §6). "Stringly contracts banned via G1"
overstated — G1 bans error-MESSAGE reparse only; the r:/e: prefix is outside its letter and was a
loudly-documented design choice (p2 verify:exist/fit:keyed-cache-brand). Incidental grep pointer:
ADR-0002:346 contains `raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` — flagged unread, for a
docs sweep (p3 new-exist:reviewcard-canonical-content, corr. c).

### ADR-0003 — portability / domain bands
**(a) Triggers** (p1 harvest:adr-triggers): #1 second adopter — **"no" at miner time**; superseded
mid-review by the fork constraint; p3 verifiers confirmed first-hand no repo/DB/amendment record of the
firing (ADR-0003 has two commits ever: initial + cross-ref fix ca871d1) (p3 new-exist/new-fit:
adr0003-revisit-1-fired-fork-axis-remap). #2 inventory drift — **PARTIALLY SATISFIED**: 9/19
spot-checked paths moved; post-April surfaces absent; FILES.md (215 tags) is the de-facto inventory,
never delegated — "two parallel band registries (the ADR-0005 Rule 1 drift shape)". #3 wrong band — no
evidence *at miner depth* (FILES.md tag accuracy explicitly unaudited); but the canary has tripped:
ADR inventories useReviewSession **Band 2** (:149-152) vs FILES.md **[B3]** (:229), and Revisit #3
names that file (p3 gen-distill:second-consumer; new-exist:review-scoring-extraction). #4 Chess-question
utility — no evidence; the fork remaps the axis (main L7).
**(b) Miners**: mech-conformance §4 — band drift in 2 of 12 sampled [B1] files; tags review-enforced
only. ADR's own Negative ":299-301 policy, not mechanism" quoted as the self-named weakness (p3
gen-distill:erosion).
**(c) Verifiers — text settled shape**: the "takes the predicate as a parameter; it doesn't import it"
idiom (:230-234) and "the seam is a property of the code's shape" (:251-257) repeatedly distinguished
sanctioned seam-naming from forbidden Port extraction (p3 new-fit:review-scoring, new-fit:cold-start,
new-fit:split-keybindings). "Not a refactoring mandate / existing code stays put" (:309-311, :358-359)
was the standing counter-pressure every fork candidate had to name explicitly — verifiers refused
silent deviation each time. Premise ":94-97 'no concrete second-domain consumer exists' is now false"
— must be annotated in the amendment (p3 new-fit:adr0003-revisit-1, corr. 5).
**(d) Generalization — the axis re-map (load-bearing)**: Chess partitions B3 (replace) from B1+B2
(keep); the fork partitions B1 (keep) from B2+B3 — and **B2 *splits*** (game-tree skeleton goes;
SR-orchestration + generic charting stay); the merged candidate's "replace B2 and B3 both" was corrected
as self-contradictory (p3 new-fit:adr0003-revisit-1, corr. 3; main L7). FILES.md's legend keys all three
bands to the weaker chess axis; all three lines need the two-axis re-cut (same, corr. 4). Verified [B1]
erosions = the fork's cut-list: resource-service.ts:18 (Go-only public verb shadowing private
fetchResource<T>), useAppBootstrap (band-mixed via three further imports — retag effectively forced),
engine/util.ts strays (generateUUID/updateRegistry/setDeep), RegistryEditor's baked vocabularies,
lib/keybindings substrate/catalog fusion (p3 gen-distill:erosion + merge + per-candidate verdicts).
Band-conformance mechanization: the literal band(file)≥band(import) rule drowns — ~37 extra [B1] files
(49 sites) violate via the band-mixed hubs store/index.ts [B3] and types.ts [B2]; scope to B3-leaf/
engine or exempt hubs; the checker forces adjudication of recorded FILES.md-vs-ADR tag disagreements
(store/index.ts, analysis-ledger, wait-for-analysis: ADR Band 1 vs FILES.md [B3]; engine/helper.ts
reversed) and must fail on the **ghost row** (FILES.md:45 jquery-bridge.ts, deleted 2026-06-01) (p3
new-exist:mechanize-band-conformance, corrs. 1-3). Inventory delegation must keep the Band-mixed seam
prose (:184-204) and Chess sizing (:261-282) — "the fork's extraction map"; FILES.md one-liners cannot
carry within-file seam detail (p3 gen-verify:adr-trigger-sweep, reshape b). :180-181 describes
engine/util.ts with "captures math" absent at HEAD — another drift instance (p3 new-exist:rehome-
agnostic-utils, corr. 8). The corpus's **one refutation** is ADR-0003-relevant: registry-editor-
vocabulary-injection fell as a strict subset of filed `config-schema-projections` (903-line note; §8
already anticipates a general-education fork; four baked vocabularies vs the candidate's three) — the
fork raises that item, it does not justify a parallel weaker abstraction (p3 new-fit:registry-editor-
vocabulary-injection, refuted=true; main §3.21).
**(e) Deflations**: "~215 [B1] tags" conflated total with the **78** actual [B1] rows (78/39/97/1) (p3
new-exist:adr0003-revisit-1, corr. 1; main §6). Drift denominator is convention-dependent — 9/19 miner,
"9 of ~23" p2 verifier, "7 of 20" p3 verifier; say "roughly half" (p2 verify:exist:adr-trigger-sweep,
corr. 4). Drift is path-staleness from the reorg, **not demonstrated band misclassification** —
delegation ≠ validation (p2 verify:fit:adr-trigger-sweep, corr. 3). Spot-checked fork-criterion mis-tags:
EngineQueueTooltip.vue and useQueryTelemetry.ts are [B1] with KataGo-naming purpose lines (p3 new-fit:
adr0003-revisit-1, reasoning 3). `ReviewCard.sgf` retention was a *recorded 34b design decision*
premised on "you're still a Go app" — the "finish the rename" frame was historically wrong; mandatory
reframe to "recorded decision whose premise the fork invalidates" (p3 new-fit:reviewcard-canonical-
content, corr. 1; main §3.20).

### ADR-0004 — minimal-touch under partial visibility
**(a) Triggers** (p1 harvest:adr-triggers): #1 tooling — **PARTIALLY**: CI gates `vue-tsc -b` since
2026-06-01; the ADR says the policy "can relax in proportion"; low confidence, not verified empirically.
#2 — no observed failure mode.
**(b)/(c)**: rarely a dispute standard. Two appearances: a loose ADR-0004 citation struck (governs
partial-visibility edits; permits full-visibility rewrites — p2 verify:fit:multi-writer, corr. g);
"not fought by a full-visibility audit pass" (p2 verify:fit:hydration-rebind).
**(e) Narrowing of the #1 question**: vue-tsc strict template checking **cannot police the boolean
gate-prop class even in principle** (omission is type-legal; the defect is author intent) — the real
prior-art check is eslint-plugin-vue's prop rules (p2 verify:fit:vue-lifecycle-footgun, corr. b). Any
ADR-0004 #1 assessment should expect a narrower mechanical-guarantee gain than the miner's reading.

### ADR-0005 — documentation discipline
**(a) Triggers** (p1 harvest:adr-triggers): #2 **FIRED and recorded in-place** (doc-graph CI,
2026-06-01) — the model for trigger bookkeeping; Rule 4 linter / parallel-TODO checker still open.
#1/#3 — no new evidence.
**(c) Verifiers — rules as working tools**: Rule 1 grounded the O12-O15 collision finding and the
warning that a *parallel* comment convention would itself be the failure it decries (p2 verify:fit:
retire-hand-maintained-censuses, corrs. c/e). Rule 3 classified census decay (snapshots rot; relations
don't). Rule 8 + the Amendments-header precedent (0005's and 0009's own firings) prescribed the
ADR-0001/0003 fix shape (p2 verify:fit:adr-trigger-sweep). Rule 9's one-owning-item-per-design-note-ref
produced the refs-kind wrinkle (p2 verify:fit:work-status-authoring-hygiene, corr. b). ADR-0005's
Amendments 2026-06-01 / Alternative C record the doc-graph report as partly-adopted mechanization —
basis for advisory-not-gate (p2 verify:fit:doc-graph-dangling). Revisit #3 "pre-authorizes absorbing a
new discipline by appending a rule" (p2 verify:fit:keyed-cache-brand). Recurring meta-rule: any session
amending an ADR reads ADR-0005 e2e first (p2 §2.4 + verdicts passim).
**(d)**: doc-graph tooling is umbrella-level, fork-orthogonal (p3 gen-verify:doc-graph-dangling).
**(e)**: the consolidation-xref-fallout note **falsely asserts** the report already segregates worklog
refs — the convention's own record believes the tooling implements a boundary it doesn't (p2
verify:exist:doc-graph-dangling, corr. 2). Arithmetic corrected: 83/125 distinct noise (55 worklog +
28 deferred-items + 3 overlap ≈ 66%); a third quasi-frozen class (executed playbooks, ~25 more) is
half-decided by existing convention (p2 verify:fit corr. a; verify:exist corr. 3).

### ADR-0006 — source-file headers
**(a) Triggers** (p1 harvest:adr-triggers): #1 header linter — NOT satisfied (nothing under tools/
checks headers; "cheap candidate"). #2/#3 — no.
**(b)-(e)**: effectively absent from the rest of the corpus — no miner finding, verifier verdict, or
generalization verdict invokes ADR-0006 as a standard. For the corpus audit, that silence is a datum:
the header convention generated zero observed disputes and zero observed enforcement activity across
~90 agents (this digest's observation over p1-p3).

### ADR-0007 — file size / information density
**(a) Triggers** (p1 harvest:adr-triggers): none formally fired, but budgets vs tree: 33/69 SFCs >250;
51/138 non-generated TS >200 (30 >300); eslint.config.js:137 itself defers max-lines; queue files grew
past the item's own snapshot. #1's prerequisite (lint host) exists; the rule is deferred. **Density —
the ADR's second metric — was never measured** (miner coverage; main §8).
**(b) Miners**: mech-conformance §1 — queue stale **in membership**: heavy tail moved to services/
composables (analysis-service 1181, useQeubo 979, usePlayFromPosition 815, knobs.ts 802, store/index
789, defaults 722 — never queued); the C2-era "bulk is template+style" lesson no longer holds
(BaseChart: 590-line script, 2-line template); types.ts exception straining (2362 ln, +117/week) and
the exception's own text prescribes splitting "along clean domain seams, not by line count alone"
(finding 8). worklog-2026-04 finding 4: bounded-stopping declarations regrew (App.vue 500→718).
**(c) Verifiers**: the exception text *settled* ADR-consistency of the split; the Neutral clause
("addressed when next touched substantively") "is firing ~weekly" on types.ts, so the proposal partially
composes with handled-on-touch; the only deviation is the queue item's parked status, routed to the
maintainer; priorityHint **raise** (p2 verify:fit:split-types-ts). Correction: ADR-0007's recorded
status is **"Proposed", not Accepted** (p2 verify:exist:split-types-ts, corr. 2). "Over-fragmentation
is a real risk" named as the counter-pressure to bound (verify:fit, corr. 5).
**(d) Generalization**: carve **band-aware, not merely banner-aware** (banner seams ≠ band seams — the
branding banner mixes generic Brand<>/PerBoard with StoneColor/PlyIndex); split retires ADR-0003's
types.ts inventory exclusion (:206-215) and dissolves the "[B2]… B3 leakage" compromise tag; advances
(p3 gen-verify:split-types-ts).
**(e)**: defaults.ts co-change 46→**48**/90; ":1655" is a doc-comment sub-banner; **types.ts is not
types-only** (BUNDLE_COMPRESSION_SCHEMES value export :947 → barrel is a runtime module; circular-import
check load-bearing); IDENTIFIERS.md's "decaying half" = the file:line layer only — soundness/erosion
content survives any split and ~12+ rows must re-point in the same PR (p2 verify:exist/fit:split-types-ts).

### ADR-0008 — classification discipline
**(a) Triggers** (p1 harvest:adr-triggers): #4 — PARTIALLY: lint host + clear-needs-ownership prove
local-rule mechanization cheap; the named candidates (band-coherence at mount sites; enum-coverage)
unbuilt. #1-#3 — no evidence.
**(b) Miners**: postmortems — closest-match recurred within its arc before codification; **no observed
recurrence after ADR-0008 + checklist**, though the ADR concedes "no automated check"; Revisit #4's
band-coherence mount-site check is "the named-but-unbuilt guard with the strongest pedigree" (finding 6).
Both knob postmortems' fixes verified shipped (types.ts:521-526; Toolbar.vue:102).
**(c)/(d)**: appears in verdicts mostly via ADR-0002 Rule 7 (its codified principle); used to trim a
candidate's class definition (KnobDomain is closest-match family, not under-keyed-cache; p2 verify:fit:
keyed-cache-brand, corr. d). The checklist's §7.3 history (gate tried, retracted, template-not-gate) is
the recurring calibration precedent for advisory-first mechanisms (p2 verify:fit:doc-graph-dangling;
verify:fit:keyed-cache-brand, corr. c).

### ADR-0009 — performance investigation discipline
**(a) Triggers** (p1 harvest:adr-triggers): #2 **fired 2026-06-01, amended in-place** (Chrome/CDP) —
recorded properly. #4 (perf-claim CI scan) and the rest — not satisfied.
**(b) Miners — load-bearing**: embedded in every commission (p1 §0.1/§0.5/§0.6) and visibly shaped
output — every coverage note carries a "no perf properties asserted" clause. Worked lesson: dropped
`rb3-packet-receive-chunking` — pre-refactor attribution re-measured ~99ms vs ~2.35s; "ADR-0009 applied
to planning, not just claiming" (p1 harvest:work-status finding 3; main §3.22). audits miner: P5 landed
(0009:211-219 render+patch ranking from the green-perf correction). retros: the lessons→ADR pipeline
works for architectural lessons.
**(c) Verifiers**: a correction lens, not a dispute: claims re-framed to "structural-by-inspection or
explicit-unsubstantiated qualifier" (p2 verify:fit:enrichment-merge, corr. d); brand-arc runtime
neutrality accepted as "substantiated by construction — brands erase" (p2 verify:fit:branded-path-types,
corr. 4).
**(e)**: no deflation of the ADR; the review ran no profiles of its own (main §8).

### ADR-0010 — render locality / canvas
**(a) Triggers** (p1 harvest:adr-triggers): #1 — prerequisite built (lint host + render-count harness);
the read-locality lint itself not. #2 Vapor — no (Vue 3.5.31). #3 — **not assessed** (needs a source
census; stability-trajectory preview-ingestion named unchecked). #4 layering tension — **open,
documented in three prose sites, tracked in no work-status item**; eslint header census ("Four
components violate this today") stale — zero such imports at HEAD. Incidental: committed
`</content>`/`</invoke>` harness-envelope lines at the file tail (from 5da97f12).
**(b) Miners**: render-coupling is the corpus's clearest natural experiment — the postmortem alone did
not prevent recurrence (TreeWidget within days; ADR-0010 Context: "a doc that *describes* a pattern
does not stop it recurring one component over"); ~9 excisions until ADR-0010 + the mutation-verified
harness; no recurrence in the ~9-day window — explicitly a hypothesis (p1 harvest:git-narrative finding
5; worklog-current finding 6; postmortems finding 1). audits miner: harness covers 2 of 4 recommended
components; ADR-0010:169 cites tests/integration/render-locality/ — nonexistent (actual render-count/)
— code→doc rot the doc-graph gate cannot see (finding 4).
**(c) Verifiers**: Revisit #4's own text *settled* the services-boundary question — the relocation "is
literally Revisit #4's own named option"; the inverted lint must preserve the display-leaf sanction
(p2 verify:fit:services-boundary; p3 gen-verify same id). Artifact deletion should carry a one-line
Amendments note; the :169 path fix follows the amendment convention, not a silent body edit (p2
verify:fit:adr-trigger-sweep, corr. 5; verify:fit:doc-graph-dangling, corr. f). ADR-0010's corollary is
the *canonical home* for the v-memo trap — new footgun docs cross-link, never restate (ADR-0005 Rule 1;
p2 verify:fit:vue-lifecycle-footgun, corr. d).
**(d)**: the ADR-0010 fixes are content-only doc corrections, no structural doc-graph effect;
fork-orthogonal (p3 gen-verify:doc-graph-dangling).
**(e)**: artifact survived **three** later commits (f46d35e, 061cd81, 59aef38), not two; present since
creation (p2 verify:exist:adr-trigger-sweep, corr. 3). Census staleness provenance: 35c939c (2026-06-01)
resolved all five sites without updating the header; rewrite uses the "at adoption … resolved"
historical phrasing (p2 verify:exist:services-boundary, corr. 2; verify:fit:retire-censuses, corr. d).
New gap: the lint glob misses **App.vue**, which imports analysisService today — the tenet defines
Components as components/* AND App.vue (p2 verify:fit:services-boundary, corr. c).

### adr-synopsis.md
Read e2e (318 lines) only by the p3 adr0003-revisit-1 *existence* verifier: the ADR-0003 entry at
:68-85 ("Ports are extracted only when a second concrete consumer exists") **must co-change** with any
ADR-0003 amendment; cochange-advisory CI (named at synopsis :12-14) flags a synopsis left untouched
(p3 new-exist:adr0003-revisit-1, corr. 6). The fit verifier flagged the entry for staleness without
reading it (p3 new-fit, corr. 5). Main §3.23 carries the co-change duty. No other agent in the corpus
read or invoked the synopsis — for a document every session is routed through, that thinness is itself
audit-relevant.

---

## §2 Corpus-level observations

**L1 (prose decays; mechanisms stick)**: ~50% cast-rule conformance in sample (p1 mech-conformance §3);
render-coupling recurrence ended only at tenet+harness (p1 git-narrative finding 5; postmortems finding
1, quoting RCA §3); closeBoard census "Four cleanups" over **eleven** actual operations (ten enumerated
+ one omitted), rotted through at least two cycles (p2 verify:fit:scoped-state-registry, corr. 1);
eslint census stale ~8 days after resolution. Successes: RCA-minted lints, both scoped-state registries
with exact-set tripwire tests, branded-key arcs, doc-graph freshness gate (p1 postmortems finding 1;
audits finding 3).

**L2 (owners, not per-writer gates)**: 3e11c38 → fb0159a supersession was **~3.5 hours** (p2
verify:exist:multi-writer, corr. 5); 19 direct store.engine assignments (not "~29-45" — that conflated
reads), bypassing the one named mutator (same, corr. + fit corr. c); the preference clobber **survives
reloads** (session.ui persisted); the :463 write fires even when the query is refused; the persistence
miss is a bounded trigger-miss, not corruption (verify:fit:multi-writer, corrs. a/b/e).

**L3 (deferral capture leaks at authoring time)**: every deferral that entered the todo DB is accounted
for; worklog/postmortem/retro-only deferrals reliably evaporated (p1 worklog-2026-04 finding 1
"ledgered ones did not dangle"; worklog-2026-05 finding 5; worklog-current findings 1-5; retros findings
1-2 — KeepAlive filed in *two* retros toward a dispatch directory that does not exist). Symmetric:
refs-less items force re-derivation — pv-hover-jank says "cause unclear" while the 05-27 audit's
undischarged causes C.2/C.3 sit one refs-row away (p1 audits finding 2; p2 verify:exist:work-status-
authoring-hygiene, corr. 2).

**The corpus as a system — settled vs constructed**: across 36 + 16 verdicts, ADR text settled most
disputes directly (ADR-0001 Revisit #3 + template exception; ADR-0002 Rules 2/6/7 + loudness hierarchy;
ADR-0003's parameter-not-import idiom + Not-goals; ADR-0007's exception text; ADR-0010 Revisit #4).
Verifiers had to construct where the corpus is silent: terminal loudness per surface; Rule 4's reach
beyond the ACL; the dominant-concern tag legend vs mechanical conformance (FILES.md:37-38 makes some
"violations" legitimate — exception list "expected to be non-empty by design", p3 new-fit:mechanize-
band-conformance, corr. 3); refs.kind vocabulary; the doc-graph frozen-boundary classification.
Trigger bookkeeping is the corpus's weakest mechanism: recorded in 0005/0009, silently rotted in
0001/0003; the only sweep ever performed is this review's miner instance (p1 adr-triggers, synthesis).

**Main-vs-appendix tensions (flag both)**:
1. Main L6/§3.23: ADR-0003 trigger #1 "fired **twice over** — the active `chess-clone` item and the
fork". The appendix is more careful: chess-clone's own trigger ("a chess-playing contributor with a
PoC") **has not fired** (p3 new-fit:adr0003-revisit-1, alreadyFiled; new-fit:cold-start, alreadyFiled);
the miner scored #1 "no" pre-constraint. Defensible: one adopter materialized (the fork); chess-clone
is a filed prospective adopter on a different axis whose gate is unmet. The amendment should name both
(main §4) but not claim two fired triggers.
2. ADR-0003 staleness denominator: main "~9 of ~23"; miner 9/19; p3 verifier 7/20 — enumeration spread;
use "roughly half" (p2 verify:exist:adr-trigger-sweep, corr. 4).
3. Anyone quoting the miner's "error packets silently consumed" (p1 mech-conformance finding 4) must
carry the p2 correction that transport-layer loudness already fires.

**Coverage limits relevant to this audit** (main §8 + coverage notes): ADR-0002 #1/#2 unassessable;
ADR-0007 density unmeasured; ADR-0010 #3 unassessed; FILES.md tag *accuracy* never swept; SFC template
casts unaudited; "no DB item" claims rest on keyword sweeps; the 38-trigger total not independently
reproduced. The adr-triggers miner did NOT read handoff-current, the synopsis, or the postmortems (its
coverage note) — its walk is tree+DB-grounded, not doc-graph-complete.

**Process integrity**: two aborted generalization launches produced no used output (p1 header);
prompts factored via `[SHARED:…]`, **reports never factored** (p1 §0); commissions embedded the
ADR-0002 read-fully discipline and verifiers recorded which ADRs they read e2e — self-reported but
consistently practiced. Out-of-frame adversarial review was load-bearing twice in the cycle (p1
worklog-current finding 12; main L8). The review applied the lens to itself — main §6 records all
deflations.

---

## §3 Citation key

- **main** = `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` (§1 verdict, §2 L1-L8, §3 items
  1-25, §4 strengthened items, §5 filing record, §6 deflations, §7 maintainer decisions, §8 coverage).
- **p1** = appendix part 1. `§0` shared prompt segments (§0.1 harvest preamble … §0.7 fork constraint).
  `§1 · harvest:<miner>` — per miner: **Commission**, **Report (verbatim)**, **Findings (structured,
  verbatim)** ("finding N" = Nth element), **Coverage (verbatim)**. Miners (13): git-churn,
  git-narrative, postmortems, audits, retros, adr-triggers, worklog-2026-05, worklog-current,
  worklog-2026-04, mech-conformance, work-status, docgraph-dispatch, arch-ergonomics.
- **p2** = appendix part 2. `§2 · distill:{correctness|auditability|ergonomics}`; `§2.4 · distill:merge`
  (the 18 merged candidates, verbatim JSON). `§3 · verify:{exist|fit}:<candidate-id>` — 36 verdicts,
  JSON fields refuted/reasoning/corrections/alreadyFiled/priorityHint; "corr. N" = Nth numbered item in
  that verdict's corrections.
- **p3** = appendix part 3. `§4 · gen-distill:{second-consumer|erosion}`; `§4 · gen-distill:merge`
  (8 new candidates); `§4 · gen-verify:<id>` — generalization verdicts on the 18 (fields refuted/
  reasoning/reshape/forkRelevance ∈ {advances, needs-reshape, orthogonal}); `§4 · new-exist:<id>` /
  `new-fit:<id>` — verdicts on the 8 new. The corpus's single refutation:
  `new-fit:registry-editor-vocabulary-injection`.
- Factoring rule (p1 header): byte-identical prompt segments printed once in p1 §0, referenced via
  `[SHARED:…]`; reports never factored. Run ids: `wf_0c519f95-277` (main), `wf_5548d33c-697` (gen);
  aborted: `wf_a396ddee-42b`, `wf_ff320f52-870`.
- Companion artifacts cited but not read by this agent: `…-filing.sql`, `…-filings.md` (not relied on).

License of all quoted material: Public Domain (The Unlicense), per the source documents.
`````


---

## §4 · completeness-critic

Commission: the critic template in §0's script, with this exact `=== DIGEST ===` block embedded:

`````
## Reader r1
Coverage: Read END TO END: /home/bork/w/omega/CLAUDE.md (in context); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; docs/adr/0001-state-mutation-and-readonly.md; docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md; docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (incl. verbatim HRA appendix and postscript); docs/worklog/2026-06-10-adr-record-amendments.md; docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md; docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md; docs/notes/audit/perf-audit-game-scroll-2026-05-28.md; docs/worklog/2026-06-10-services-boundary-deny-by-default.md; docs/worklog/2026-06-10-deferral- [...]
Verdicts:
- docs/adr/0001-state-mutation-and-readonly.md: amend — The decision is healthy and recently, correctly maintained: both 2026-06-10 amendments (trigger-#2 fired-and-recorded; Revisit-#3 response with the writer-enumeration lint) follow the append-never-rewrite convention, and their factual claims verify at HEAD (mutateBoard's re-wrap removed with inline rationale citing the game-scroll audit; mutateReviewSession's re-wrap present at store/index.ts:209; local/store-write-needs-owner at error with templateToggleExemptPrefixes ['session.ui']). The synopsis entry co-changed. The retirement/slimming bar is NOT met for the TS/Vue/Haskell exposition or the three Alternatives: the exposition is the rationale the alternative-rejections rest on, and live t [...]
  triggers: 5 triggers re-derived (matches the 2026-06-10 sweep's per-ADR count of 5). #1 multi-tab concurrency: NOT FIRED — multi-tab is still not a workflow; the parked design is work-status item item-27-etag-multitab (open/future); trigger cites the retired '27-full' handle (amend proposed). #2 profiling reveals reactivity hot spots: FIRED — recorded in place 2026-06-10 (Amendments header + dated note; response was the mutateBoard re-wrap removal, not a readonly revisit; trigger correctly kept live). #3  [...]
- docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md: amend — The tenet is sound, well-evidenced, and freshly repaired (the 2026-06-10 amendment removed the harness-envelope artifact lines and corrected the render-count path — both verified at HEAD, including the tests/integration/render-count/ directory). Its Vue scoping is right: the Scope section already states the honest generalization ('analogues wherever a reactive framework couples a render to a read') while scoping normative force to where the recurrences happened, and both rules are domain-agnostic. The verbatim corollary remains the canonical statement: frontend/CLAUDE.md's render-locality section explicitly presents itself as 'the practitioner-facing form' of ADR-0010 and instructs reading t [...]
  triggers: 4 triggers re-derived (matches the 2026-06-10 sweep's per-ADR count of 4). #1 lint mechanises the read-locality check: NOT FIRED — the ESLint host now carries four local rules (clear-needs-ownership, gate-prop-needs-default, module-intent-in-script-setup, store-write-needs-owner) but none is the high-frequency-read heuristic this trigger names. #2 Vue Vapor adoption: NOT FIRED — frontend is on vue ^3.5.31, no Vapor anywhere in the build config. #3 new high-frequency source class: NOT FIRED on av [...]
Proposals:
- [amend] r1-adr0001-retire-todo-numbering-handles on docs/adr/0001-state-mutation-and-readonly.md: Re-point the three retired TODO-numbering handles (Revisit #1's live '27-full' pointer; the Related section's '27-min' and '17' shipped pointers) to stable handles per the stable-handles convention (audit §3.25; frontend/CLAUDE.md's id-travels-with-slug rule), so they resolve at HEAD and in a fork clone without the maintainer's todo DB. One dated Amendments-header line covers all three.
- [amend] r1-adr0001-types-catalog-split-note on docs/adr/0001-state-mutation-and-readonly.md: One dated parenthetical in the Context section recording that the single-file type catalog the ADR describes split on 2026-06-10, so a fork author does not go looking for the policy in a 2,300-line types.ts. Can ride in the same PR as the handles amendment.
- [amend] r1-adr0010-revisit4-dated-note on docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md: A dated in-place note under Revisit-when #4 recording that the work-status record the trigger lacked now exists and its step (a) shipped, that the trigger was deliberately re-checked and has not fired, and where the collapse-into-one-principle pathway (the state/ relocation) now stands. Follows the convention ADR-0001's #2/#3 notes set; one Amendments-header line.
- [note] r1-adr0010-step-b-deferral-record on docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md: The state/ relocation (step (b) of the services-boundary item — ADR-0010 Revisit #4's named resolution pathway) lost its open work-status record when the item closed as shipped on PR #378 merge. No successor item exists; the deferral now lives only in a closed item's description and a worklog — the audit's own L3 deferral-evaporation shape, reproduced inside the audit's execution round.
- [note] r1-frontend-claudemd-identifier-map-staleness on frontend/CLAUDE.md: Outside the assigned corpus but found while verifying it end to end: the 'Identifier map' section still motivates IDENTIFIERS.md with 'src/types.ts mixes the identifier types in with value objects, state containers, and the GlobalStore schema' — stale since the 2026-06-10 split (identity brands live in types/ids.ts; the store schema in store/schema.ts; types.ts is the barrel).
- [note] r1-tenet-ordinal-census-fragility on docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md: ADR-0010's Genre header hand-enumerates the tenet roster ('the eighth tenet in this codebase, after ADR-0002 … ADR-0009'), and the synopsis closes with 'The eight tenets form a coherent posture'. Both are accurate today but are the L5 hand-maintained-mirror shape: any new tenet this audit mints, or a status outcome on ADR-0007 (still Proposed yet counted in both censuses), forces co-changes in both places.

## Reader r2
Coverage: Read END TO END: umbrella CLAUDE.md and frontend/CLAUDE.md (both supplied in context); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; docs/adr/0002-fail-loudly.md; docs/adr/0008-classification-discipline.md; docs/adr/0005-documentation-discipline.md (read in full to verify the Rule 9 marker retirement before citing it); docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; docs/notes/postmortem/postmortem-knob-registry-qeubo-domain-2026-05.md; docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md; docs/worklog/2026-05-14-popover-hover-finickiness.md; docs/worklog/2026-06-10-refs-kind-audit.md; docs/pre-merge-checklist.md; docs/notes/decisions- [...]
Verdicts:
- docs/adr/0002-fail-loudly.md: amend — The decision core (loudness hierarchy, seven rules, three exceptions, the what-it-does-NOT-mean fence) is sound, heavily load-bearing, and none of it is contradicted by six weeks of evidence — the RCA and the history audit both treat it as the reference frame, not the defect. The commissioned slim question is answered KEEP: Rule 7's ~86 lines (rule + provisional-home paragraph + retirement note) are the corpus's worked example of its own append discipline (Rule 6 applied to Rule 7's own placement), and the retirement note carries one fact recorded nowhere else — that the relocation resolved via the standalone-ADR option rather than the tenet-space-refactoring alternative. The operational cha [...]
  triggers: Re-derived trigger count: 4. (1) 'User-visible warnings become spammy in practice' — UNASSESSABLE: user-report-dependent; no warning-fatigue report exists in any document read, and the history audit §8 records the same non-assessability. (2) 'Multiple unrelated anomalies collapse into one useless message' — NOT FIRED: no postmortem/worklog records the pattern; the ApiError arc preserved per-status specificity. (3) 'A specific domain emerges where silent fallback genuinely is the right answer' —  [...]
- docs/adr/0008-classification-discipline.md: amend — A young tenet (2026-05-17) that the subsequent weeks validate rather than erode: the refs-kind arc (2026-06-10) is a clean worked instance of the positive register operating against a mechanically closed vocabulary — gap surfaced per Rule 1, vocabulary revised by maintainer sign-off, precedent-following closest-match retired — and the history audit's own §5 vocabulary wrinkle and this audit commission's verdict-vocabulary rule both operationalize it. The two-register structure, the substitution test, and the exceptions all stand. The defects are referential, and one is serious: the substrate-4 citation points at a maintainer-local memory file (feedback_classification_chestertons_fence.md) th [...]
  triggers: Re-derived trigger count: 4. (1) 'A specific rule turns out to introduce its own failure mode' — NOT FIRED: no recorded instance; the named risk (refused-fits stalling arcs) has its mitigation and no recorded stall. (2) 'A genuinely new register surfaces that the positive/negative split doesn't cover' — NOT FIRED: ADR-0009 and ADR-0010 arrived as sibling tenets in the unsubstantiated-claim family (per the synopsis's three-intervention-points framing), not as classification registers; every class [...]
Proposals:
- [note] r2-adr0002-rule7-keep-residence on docs/adr/0002-fail-loudly.md: Answer to the commissioned slim question: keep Rule 7 in ADR-0002 in full, including the provisional-home paragraph and its retirement note. The duplication with ADR-0008 is deliberate two-register architecture, not rot; the history paragraphs are the reasoning trace Rule 6 itself demands and the corpus's worked example of the append discipline.
- [amend] r2-adr0002-scope-amendment on docs/adr/0002-fail-loudly.md: The Scope line is pre-umbrella and misleading at HEAD: it names the frontend by its former repo name (gogui) and casts the backend as 'a design aspiration', while CLAUDE.md and handoff-current apply the tenet project-wide including the proxy (structured logging is explicitly 'ADR-0002 applied to logging'). A fork author reading the ADR cold gets the wrong scope.
- [amend] r2-adr0002-reference-repair on docs/adr/0002-fail-loudly.md: Repair the document's decayed references: three dangling relative cross-references invisible to the doc-graph validator, four pre-store TODO item numbers with no resolution anchor, the unlocatable 'Engagement protocol' citation, the retired design-note marker vocabulary in Rules 6/7, and a dated closure note on Exception 3's since-removed worked example.
- [amend] r2-adr0002-mechanization-register on docs/adr/0002-fail-loudly.md: The Negative consequence 'the tenet is a policy, not an enforced mechanism' is half-true at HEAD: four error-level lint rules, two ownership local rules, the work-status table constraints, and the doc-graph freshness gate now enforce ADR-0002 registers mechanically. Amend the bullet ADR-0005-style (dated in-place update recorded in the Amendments header) and add a Revisit-when trigger so future mechanizations get recorded; keep the ADR pointer-shaped so it does not become a hand-maintained mirro [...]
- [amend] r2-adr0008-memory-citation-repair on docs/adr/0008-classification-discipline.md: The ADR cites 'the umbrella's memory record at feedback_classification_chestertons_fence.md' for substrate item 4 and 'the umbrella's memory' for Rule 2's earn-your-place companion — a maintainer-local file that resolves in no clone and, verified, no longer exists even in the maintainer's memory directory. Both records exist in fuller form in-repo; re-point them per the stable-handles convention.
- [amend] r2-adr0008-retired-marker-vocabulary on docs/adr/0008-classification-discipline.md: Both Exceptions name the design-note: planned / design-note: revised markers that ADR-0005 Rule 9 retired on 2026-06-02, and Rules 1/3's 'TODO entry' channel predates the work-status store. Dated forward-pointer notes in the ADR-0005 Rule 8 style fix all three without disturbing the exceptions' substance.
- [amend] r2-adr0008-trigger4-record on docs/adr/0008-classification-discipline.md: Revisit-when #4 (tooling makes part of the discipline mechanical) has partially fired without a record: the work-status store's enum constraints mechanically refuse out-of-vocabulary writes, the 2026-06-10 refs-kind arc is the worked instance of Rule 1 operating against that mechanical surface, and the band-register firing the trigger names is staged as the open band-conformance-ci-check item. Record it so the L6 trigger-rot pattern the history audit found in ADR-0001/0003 does not repeat here.
- [new-tenet] r2-new-tenet-mechanize-on-recurrence on docs/adr/ (new, next free number): The paid-for lesson of the last six weeks that no existing tenet owns: prose disciplines decay, mechanisms stick (history audit L1; RCA common root; ADR-0010's origin proof that a describing-only postmortem does not stop recurrence). RCA open question 4 explicitly asks whether this deserves a cross-cutting articulation. Recommend filing it as a tenet, with the honest counterargument recorded; maintainer's call.
  verification: combined=survives (LENS 1 (reference web): The proposal is purely additive — no content is removed, relocated, or superseded, so no inbound reference can orphan and no document's meaning degrades. Verified: no ADR-0011 exists in tree or in git history (`git log --all -- docs/adr/0011*` empty); the todo DB carries only two `refs.kind='adr'` rows (targets 0007, 0008),  [...])
- [amend] r2-handoff-adr0002-bullet-stale on docs/handoff-current.md: Outside the assigned corpus but found while verifying it: handoff-current's ADR-0002 tenet bullet still describes Rule 7's provisional-home flag as live ('may relocate when a classification-discipline tenet is articulated') while the ADR-0008 bullet on the same page records the 2026-05-17 retirement — an internal contradiction between two bullets twenty lines apart.

## Reader n1
Coverage: Read END TO END this session: (1) umbrella CLAUDE.md (in context via system prompt); (2) docs/adr-synopsis.md (329 lines); (3) docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (598 lines); (4) /tmp/adr-corpus-audit/evidence-digest.md (359 lines); (5) docs/adr/0007-file-size-and-information-density.md (139 lines); (6) docs/adr/0009-performance-investigation-discipline.md (661 lines); (7) docs/worklog/2026-06-10-types-split.md (211 lines); (8) docs/worklog/2026-06-10-review-scoring-named-seam.md (157 lines); (9) docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (555 lines, incl. postscript and verbatim HRA appendix); (10) docs/notes/decisions-deferred.md (461 lines); (11) docs/n [...]
Verdicts:
- ADR-0007 — File Size and Information Density (docs/adr/0007-file-size-and-information-density.md): status-change — Six weeks of practice show de-facto acceptance; the 'Proposed' label is the only thing out of joint, and it is now generating real cost. Evidence: the C2 arc executed the ADR's refactor queue one day after authoring (2026-04-27, App.vue 593→500; investigation doc, verified); the migrations.ts rolling archive (2026-05-14) is a second worked intervention citing it (frontend/CLAUDE.md); the open in-progress work-status item refactoring-queue-adr0007 runs the Neutral clause as live policy (store description, read this session); the 2026-06-10 types.ts split (PR #384) was approved as a maintainer-signed *named deviation* warranted by the ADR's own exception text — a deviation regime presupposes a [...]
  triggers: Re-derived count: 4 (matches the adr-triggers miner, digest §1 ADR-0007(a)). #1 (a linter or pre-commit hook automates the size or contraction rules): NOT FIRED — the lint host exists with four custom local rules, and max-lines is explicitly recorded as deferred warn-as-backlog (~69 files over 250 measured; eslint.config.js header, read e2e at HEAD); no firing, so nothing to record. #2 (tooling context windows or truncation semantics change): UNASSESSABLE from the repository — the calibration de [...]
- ADR-0009 — Performance Investigation Discipline (docs/adr/0009-performance-investigation-discipline.md): amend — Restructure and slim were considered and declined on the commissioned bar (dead / delegated / misleading — not 'long'). The ADR is the corpus's largest document (33,438 bytes, verified) and is genuinely a tenet-plus-tooling fusion, but the evidence shows every part earning its place: the discipline shaped all ~90 agents' output in the history review (digest §1 ADR-0009(b): every coverage note carries a no-perf-claims clause), it killed a wrong work item before work started (rb3-packet-receive-chunking, ~99ms re-measured vs ~2.35s claimed — 'applied to planning, not just claiming'), it suffered zero deflations under adversarial verification (digest §1 ADR-0009(e)), and its trigger bookkeeping [...]
  triggers: Re-derived count: 5 (matches the adr-triggers miner, digest §1 ADR-0009(a)). #1 (a specific rule introduces its own failure mode): NOT FIRED — the closest stressor, the 2026-06-10 counts-vs-wall-clock deviation, was a commission-wording mismatch resolved inside the discipline, not a rule failing. #2 (canonical-tool surface needs replacement): FIRED 2026-06-01, RECORDED IN-PLACE — the dated amendment names the trigger by number and form; the corpus's model trigger bookkeeping (history audit L6).  [...]
Proposals:
- [status-change] n1-adr0007-status-accepted on docs/adr/0007-file-size-and-information-density.md: Flip Status from Proposed to Accepted with a dated acceptance record, on maintainer sign-off. Six weeks of practice treat the tenet as binding (deviations require maintainer approval against its exception text; a work-status item executes its Neutral clause; the synopsis counts it among the eight tenets), and the Proposed label has produced measured correction overhead (digest -> p2 verify:exist:split-types-ts, corr. 2). The acceptance note also records the two honestly-open questions so the lab [...]
- [amend] n1-adr0007-notgoals-reorg-pointer on docs/adr/0007-file-size-and-information-density.md: The Not-goals bullet pointing at decisions-deferred.md is verified stale-and-misleading at HEAD: the frontend directory-organization decision it calls 'in flight' landed 2026-05-11 (feature-surface reorg, commit 39e200d) and the ADR it promises was never authored (no ADR in docs/adr/ records the reorganization principle). Re-point the bullet to the historical fact and surface the unfulfilled promise rather than papering over it.
- [amend] n1-adr0009-tools-leadin-count on docs/adr/0009-performance-investigation-discipline.md: The Tools section's lead-in still says 'Two tools earn canonical-tool status as of this tenet's codification' while four bullets follow (two added by the 2026-06-01 amendment). One-sentence fix removes a count a skimming reader will get wrong — the synopsis already reproduced the error.
- [amend] n1-adr0009-companion-protocol-seam on docs/adr/0009-performance-investigation-discipline.md: Name the existing tenet/operator-manual seam instead of restructuring. The operational companion already exists and self-describes as exactly that (docs/notes/perf-capture-normalization-protocol.md: 'ADR-0009 governs *that* … this note records the *informal protocol*'), and the 2026-06-10 null check operated from the protocol note plus script headers, not from this ADR's tool mechanics. The ADR references it only obliquely (one inline mention, no path, absent from Related). Adding the Related en [...]
- [amend] n1-adr0009-counts-vocabulary-append on docs/adr/0009-performance-investigation-discipline.md: Practice surfaced a metric-vocabulary gap the ADR's own rule forbids leaving where it is: the automated Chromium path compares operation counts, not wall-clock, and that comparable is currently recorded only in perf-trace-parse.mjs's header and the 2026-06-10 multi-writer worklog — per-investigation scatter, exactly what 'Additions go here, not in per-investigation worklogs' names. Append the entry via the ADR's own pattern; this is Revisit #3 firing and being discharged as designed.
- [amend] n1-synopsis-adr0009-entry-stale on docs/adr-synopsis.md (ADR-0009 entry) — cross-territory, defer to the synopsis-assigned reader for merge: The synopsis's ADR-0009 entry predates the 2026-06-01 amendment: it says 'two canonical tools' and enumerates the five-entry starting vocabulary, omitting the Chrome/CDP and HeapProfiler surfaces, the render+patch ranking, and the retained-heap tail-slope metric. The synopsis self-declares that when it disagrees with an ADR, the ADR wins and the synopsis needs updating. Filed from the n1 seat because the staleness was found against my assigned ADR; the synopsis reader owns the merge.
- [note] n1-adr0007-overbudget-report-lead on docs/adr/0007-file-size-and-information-density.md (ecosystem, no ADR edit): The history audit's below-the-line section carries an unverified one-miner lead: a mechanically generated ADR-0007 over-budget report replacing the stale hand-maintained queue list. It composes with trigger #1's recorded warn-as-backlog max-lines candidate (~69 files over 250, measured at HEAD per the eslint header) and with lesson L5 (replace a mirror's decaying half with a generated report). No filing proposed from this seat — recording the adjacency so the maintainer's trigger-#1 decision, wh [...]
- [note] n1-no-new-tenet-from-n1-territory on corpus-level (n1 scope: ADR-0007 / ADR-0009): Answering the commission's inverse question for this assignment's territory: no new tenet is warranted. The paid-for lessons that touch these two ADRs fold into machinery that already exists — L1 (prose decays; mechanisms stick) is already encoded as both ADRs' own mechanization triggers (0007 #1, 0009 #4), deliberately unfired pending the measure-first adoption pattern; the 2026-06-10 cycle's perf lessons are a vocabulary append and a routing rule (proposals filed), not new principles.

## Reader n2
Coverage: Read END TO END: umbrella CLAUDE.md (in context per commission; not re-read); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; all ten ADRs (docs/adr/0001 through 0010); docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; tools/doc-graph/cochange-advisory.mjs (full source); docs/handoff-current.md; docs/onboarding/orientation.md; README.md; docs/pre-merge-checklist.md; docs/worklog/2026-06-10-deferral-harvest.md; docs/worklog/2026-06-10-doc-graph-dangling-signal-cleanup.md; docs/worklog/2026-06-10-keyed-cache-brand-and-stable-handles.md. Row-level only (sanctioned): docs/doc-graph-report.md (grep for ADR/postmort [...]
Verdicts:
- docs/adr/0005-documentation-discipline.md: amend — The nine rules are heavily exercised and settled real disputes during the 90-agent review (Rules 1/3/8/9 used as working tools — digest -> p2 verify:fit verdicts passim), and ADR-0005 is one of only two ADRs whose trigger bookkeeping was the corpus's model (the in-place 2026-06-01 firing record). The bounded defect is that its mechanization record has fallen behind reality: the co-change advisory (tools/doc-graph/cochange-advisory.mjs, 2026-06-02 — a partial net for exactly the Rule 1/Rule 3 derived-summary hazard, per its own header) and the 2026-06-10 dangling-signal arc (origin buckets live/executed/frozen, tombstones, directory-reference resolution, advisory no-new-danglers ratchet) are  [...]
  triggers: 3 triggers re-derived (matches digest 0005:3). #1 (a rule introduces its own failure mode): not-fired — no evidence in the audit or digest. #2 (documentation tooling matures): FIRED 2026-06-01 and recorded in place (the corpus's model record); fired again in substance on 2026-06-02 (co-change advisory) and 2026-06-10 (report origin buckets, tombstones, directory refs, advisory ratchet — worklog 2026-06-10-doc-graph-dangling-signal-cleanup.md) — these further firings are NOT recorded in the ADR;  [...]
- docs/adr/0006-source-file-headers.md: amend — Healthy tenet; the amendment is one line. Across ~90 agents the header convention generated zero disputes and zero enforcement activity (digest §1 ADR-0006: 'that silence is a datum') — I read the silence as the convention being internalized and uncontroversial rather than dead, while noting honestly that header conformance was never measured. The one verified defect at HEAD: the exemplar citation `frontend/src/composables/useTreeLayout.ts` (Context and Related) dangles — the file moved to `composables/forest/` and its own header was correctly updated on the move (the convention working exactly as designed), so only the ADR's citation rotted. A `.ts` target is invisible to the doc-graph vali [...]
  triggers: 3 triggers re-derived (matches digest 0006:3). #1 (tooling to auto-generate/verify headers): not-fired — nothing under tools/ checks headers (digest -> p1 harvest:adr-triggers: 'cheap candidate') and no work-status item exists (psql: SELECT over items for '%header%' returned 0 rows). #2 (license posture changes): not-fired. #3 (a new sub-project lands): not-fired. Nothing fired, nothing unrecorded; the tenet's bookkeeping is clean.
- docs/adr-synopsis.md: amend — It is the right single derived summary: it carries the `derived-from` marker, the co-change advisory covers it in CI, the header states 'the ADR wins' and the update duty, and orientation.md routes every cold session through it as a mandatory full read. Per-entry depth (1-2 paragraphs) is right. Two verified defects: (a) the ADR-0009 entry is stale since 2026-06-01 — 'two canonical tools' names only Firefox DevTools + profiler-cli, while ADR-0009 at HEAD carries four canonical capture surfaces (the 2026-06-01 amendment added Chrome DevTools via CDP-over-Playwright for automated/concurrent-load capture and CDP HeapProfiler for leak detection) plus metric-vocabulary extensions (per-component r [...]
  triggers: No Revisit-when section — it is a derived navigational document, not an ADR; 0 triggers. Its freshness duty is carried by the cochange advisory, whose per-PR-diff design (verified in source: 'transience is structural'; 'Deliberately not that' regarding state-based checks) is blind to drift predating 2026-06-02 — exactly one such instance verified (the 0009 entry).
- corpus: amend — The corpus architecture is sound — genre lines, append-only dated amendments, Revisit sections, one marked derived summary with CI advisory — and nothing in scope warrants retire/merge. The system-level repairs: (a) The derived-summary web has exactly one Rule-1-clean member. Synopsis: marked, advisory-covered, accurate except the 0009 entry. handoff-current.md 'Architectural governance': an unmarked ~95-line parallel per-ADR summary with verified drift — it calls ADR-0005 'Seven rules' (nine at HEAD; Rules 8/9 missing, i.e. stale since 2026-05-07) and describes ADR-0002 Rule 7's provisional-home flag as live ('may relocate when a classification-discipline tenet is articulated') while listin [...]
  triggers: Corpus-wide: 38 Revisit-when triggers independently re-derived from the ten ADRs at HEAD (0001:5, 0002:4, 0003:4, 0004:2, 0005:3, 0006:3, 0007:4, 0008:4, 0009:5, 0010:4) — confirming the miner's figure the digest flagged as not independently reproduced. Bookkeeping is now current for 0001/0003/0005/0009/0010 (the adr-record-amendments-2026-06 item is closed in the store; amendments verified at HEAD). The remaining weakness is cadence, already filed under adr-effectiveness-audits (open/in-progres [...]
Proposals:
- [amend] n2-synopsis-0009-entry-refresh on docs/adr-synopsis.md: The ADR-0009 entry is stale since the ADR's 2026-06-01 amendment: it names two canonical tools where the ADR now has four canonical capture surfaces, an extended metric vocabulary, and a scenario harness. The per-PR-diff advisory can never flag this pre-advisory drift; fix by hand. Optionally fix the 'two decisions' genre flattening in the same touch.
- [amend] n2-adr0005-mechanization-note-2026-06-10 on docs/adr/0005-documentation-discipline.md: Record the second wave of partial mechanization (the 2026-06-02 co-change advisory; the 2026-06-10 dangling-signal report classes and ratchet) where the ADR records the first (Amendments line + Alternative C), and fix the off-tree-SVG enumeration in Related. The worklog alone is insufficient because the ADR body's 'no automated check' claims are now understated.
- [amend] n2-adr0006-exemplar-path-amendment on docs/adr/0006-source-file-headers.md: The exemplar citation dangles: useTreeLayout.ts moved to composables/forest/ and its own header self-updated correctly; only the ADR's two citations rotted. The .ts target is invisible to the doc-graph validator, so only a hand fix catches it. Follow the ADR-0010 dated-amendment precedent for path fixes.
- [restructure] n2-handoff-governance-delegate-to-synopsis on docs/handoff-current.md: The 'Architectural governance' section is an unmarked ~95-line parallel per-ADR summary with verified drift (ADR-0005 'Seven rules' vs nine; ADR-0002 Rule 7's provisional-home flag described as live while ADR-0008 is listed in the same section). This is the ADR-0005 Rule 1/Rule 3 drift shape the project already fixed twice by delegation (ADR-0003 → FILES.md; status → the todo DB). Slim it to a delegation + genre note, keeping the drift-slow personality paragraph.
  verification: combined=survives (LENS 1 — REFERENCE WEB: No inbound reference depends on the content being deleted. Repo-wide search for handoff-current/“Architectural governance”/adr-synopsis (plus a mechanical ±3-line proximity scan for ADR/governance/tenet vocabulary across all ~60 files containing “handoff-current”) finds exactly two section-level references: (1) docs/worklog/ [...])
- [amend] n2-readme-docs-section-refresh on README.md: README's ADR paragraph is clean delegation, but its Documentation list cites docs/notes/analysis-persistence-plan.md as a 'planned feature' (the file moved to docs/archive/notes/design/ and the feature shipped) and its Project-status section reads 'v1.0.0 has shipped' as the current state while v1.1.0 is tagged.
- [amend] n2-adr0002-0003-stale-relative-refs on corpus: Three stale `../notes/` relative references in ADR-0002/0003 evade the doc-graph validator (it does not match `../`-relative paths — other docs' references to the same old targets ARE in the report; the ADRs' are not), and ADR-0002's third exception cites a compat shim in present tense that is gone at HEAD. Overlaps the n1 reader's documents; verified here and flagged for the synthesizer.
- [note] n2-genre-vocabulary-three-way on corpus: All three derived summaries flatten ADR-0003's self-declared genre (Bounded Context Map, 'a third genre') into 'decision' (synopsis: 'the two decisions'; handoff: filed under '### Decisions'; orientation: '0001 and 0003 are decisions') — a mild ADR-0008 closest-match against a two-genre vocabulary the corpus itself declares as three.
- [note] n2-header-consistency-on-touch on corpus: Header-shape variance across the ten ADRs is real but mostly harmless; record the on-touch fixes rather than sweep. The ordinal-with-full-predecessor-enumeration pattern is an append-only historical fact with no drift risk — only growing write-time verbosity for future tenets.
- [note] n2-adr0006-header-linter-item on docs/adr/0006-source-file-headers.md: ADR-0006 Revisit #1's subject (a header linter) is unbuilt and untracked: no tooling exists and no work-status item exists (psql verified). Under L1 (prose disciplines decay; mechanisms stick) and the ADR's own Negative ('a linter could automate the pathname check and might be a good first step'), filing a cheap lint item is worth the maintainer's consideration.
- [note] n2-fork-consumption-protocol on corpus: No document states how the generic flash-card fork consumes the ADR corpus — whether ADRs travel as inherited history, how numbering continues, which references are umbrella-bound. ADR-0003's non-game sizing is the closest statement and covers only the code bands.
- [new-tenet] n2-new-tenet-mechanization-discipline on corpus: The inverse question answered: the six weeks' paid-for lesson that justifies new tenet-level content is L1 / the RCA's common root cause — disciplines held only by prose and one person's memory decay measurably, and only mechanical nets arrest the aggregate-only defect class. Recommended shape: an appended ADR-0005 Rule 10 ('disciplines declare their enforcement surface') rather than a standalone ADR-0011, per ADR-0005's own Revisit #3 pre-authorization. Maintainer call — the RCA explicitly queu [...]
  verification: combined=weakened (LENS 1 (reference web): Additive proposal — nothing orphans. Co-change duties found: (a) docs/adr-synopsis.md:117 enumerates "Nine rules ... (1)–(9)"; must be substantively updated to ten in the same PR. The cochange advisory (tools/doc-graph/cochange-advisory.mjs, read e2e) is per-PR-diff and TOUCH-keyed — any touch silences it without verifying t [...])

## Reader n3
Coverage: Read END TO END: umbrella CLAUDE.md (in context); frontend/CLAUDE.md and backend/CLAUDE.md (injected in full by the environment); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; docs/adr/0003-frontend-portability-and-domain-boundaries.md; docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md; docs/worklog/2026-06-10-types-split.md; docs/worklog/2026-06-10-review-scoring-named-seam.md; docs/worklog/2026-06-10-resource-service-calibration-seam.md; docs/worklog/2026-06-10-adr-record-amendments.md; frontend/FILES.md (read in full although row-level lookup is sanctioned); docs/handoff-current.md; frontend/src/serv [...]
Verdicts:
- ADR-0003 (frontend portability and domain boundaries): amend — The 2026-06-10 amendment layer is honest and the load-bearing content — band definitions, band-mixed seam analysis, both port sizings — is current and was demonstrably used by two executed extractions this week (review-scoring, resource-service: both worklogs cite the takes-the-predicate-as-a-parameter idiom). A Rule-8 sibling/successor is the wrong fix: it would re-create a second band-definitions home, the exact parallel-registry shape (ADR-0005 Rule 1) this ADR just paid for with its inline inventory. But the in-place annotation job is unfinished, and the residue is concentrated where a cold fork author reads: (1) the Decision section still asserts, un-annotated and in present tense, 'no  [...]
  triggers: 4 triggers re-derived (matches the amendments worklog's 0003:4). #1 second domain adopter — FIRED, recorded 2026-06-10 as 'fired twice' (the maintainer's generic knowledge fork; chess-clone, confirmed open/active in the store). Tension flagged per the digest: the generalization verifiers read this as one materialized adopter plus one filed prospective adopter whose own PoC gate is unmet, and advised naming both without claiming two fired triggers; the executed amendment adopted the stronger read [...]
- ADR-0004 (minimal-touch edits to partially-visible files): amend — Keep the decision, structure, and scope exactly as-is — the only change proposed is one dated trigger-bookkeeping note, which is why this verdict is the nearest neighbour of keep rather than a substantive revision. The tenet is alive, not vestigial: the umbrella CLAUDE.md names it one of four governing ADRs and builds the documentation-consumption rule on its composition with ADR-0002; per the synopsis, ADR-0005/0006/0007 each anchor their no-retroactive-sweep retrofit posture in 'ADR-0004's spirit'; in the 90-agent corpus it appeared as a boundary clarifier that verifiers used correctly twice (striking a loose citation; digest); and the 2026-06-10 worklogs show its posture operating under f [...]
  triggers: 2 triggers re-derived (matches the amendments worklog's 0004:2). #1 tooling makes prop-contract drift catchable at compile time — PARTIALLY FIRED, NOT recorded in the ADR: frontend CI has gated vue-tsc -b on every PR since 2026-06-01 (frontend/CLAUDE.md; the workflow and step confirmed present at HEAD), and two footgun classes are now mechanized as lints (local/gate-prop-needs-default, local/module-intent-in-script-setup, per frontend/CLAUDE.md); the 'relax in proportion' clause has never been e [...]
Proposals:
- [amend] n3-adr0003-annotate-extraction-premise on docs/adr/0003-frontend-portability-and-domain-boundaries.md: Finish the annotation the 2026-06-10 amendment started: the Decision section's closing premise ('no concrete second-domain consumer exists') is now false and carries no dated note, so a cold reader meets a live-tense falsehood ~230 lines before the Revisit-#1 correction. The digest records the verifier correction requiring this annotation; the executed amendment missed it.
- [amend] n3-adr0003-analysis-recording-fulfilled on docs/adr/0003-frontend-portability-and-domain-boundaries.md: Re-tense the analysis-recording material as a fulfilled prediction and score it honestly. Verified at HEAD: the feature shipped (the /analysis-bundles arc); the opaque envelope and designed-not-extracted seam held exactly as predicted; two named deviations from the letter (Go-typed service rather than payload-generic; gating at the upstream call site rather than as a predicate parameter). Also fixes the dangling Related pointer.
- [amend] n3-adr0003-two-axis-principle on docs/adr/0003-frontend-portability-and-domain-boundaries.md: The forward-looking principle still asks only the chess-axis question while the FILES.md legend was re-keyed to the stronger any-knowledge-domain criterion in the same change as the amendment. For the named non-game adopter, the chess question alone forces the wrong (weaker) boundary; record the second axis at the principle itself.
- [amend] n3-adr0003-chess-sizing-vs-filesmd on docs/adr/0003-frontend-portability-and-domain-boundaries.md: Revisit-#2's lesson was applied to the inventory section but not to the sizing prose: 'What a Chess port would actually require' retains per-file rows that already carry recorded disagreements with FILES.md (the maintained authority by this ADR's own amendment). Annotate the rows as a planning snapshot rather than silently leaving a second, divergent per-file listing.
- [note] n3-adr0003-fired-twice-precision on docs/adr/0003-frontend-portability-and-domain-boundaries.md: The executed amendment records Revisit-#1 as 'fired twice'; the digest flags that the generalization verifiers read the evidence more conservatively — one materialized adopter (the fork) plus one filed prospective adopter (chess-clone, open/active, its own PoC gate unmet) — and advised naming both without claiming two fired triggers. The recorded text is defensible (it accurately characterizes chess-clone as a work-status item, and the store confirms open/active), but it sits on the stronger rea [...]
- [amend] n3-adr0004-record-trigger1-partial on docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md: Record the assessed partial firing of Revisit trigger #1. The tooling environment moved (CI-gated vue-tsc -b since 2026-06-01; two footgun lints) without the ADR's proportional-relaxation clause being exercised or the firing being recorded — exactly the silent trigger-rot shape that cost ADR-0001/0003 their record accuracy. One dated note keeps the smallest tenet's bookkeeping honest.
- [note] n3-adr0004-retrofit-corollary-note on docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md: Per the synopsis, ADR-0005, ADR-0006, and ADR-0007 each anchor their no-retroactive-sweep / retrofit-on-touch posture in 'ADR-0004's spirit', and the audit corpus shows the letter/spirit gap occasionally misleads (a verifier had to strike a loose ADR-0004 citation: the tenet governs partial-visibility edits and permits full-visibility rewrites). The circulating corollary has no stated home, which is an ADR-0005 Rule 1 smell at the tenet level.
- [note] n3-no-new-tenet-from-this-slice on (corpus-level): From the ADR-0003/0004 vantage, no new tenet is warranted by the last six weeks' lessons. The fork-axis re-map is an amendment concern inside ADR-0003; the trigger-bookkeeping weakness is cadence already folded into the adr-effectiveness-audits item; the parallel-registry lesson was fixed by delegation, not by new doctrine.

## Reader n4
Coverage: Read end to end: /home/bork/w/omega/CLAUDE.md (in context, per commission); /home/bork/w/omega/frontend/CLAUDE.md (provided in full in-session); /home/bork/w/omega/docs/adr-synopsis.md; /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; /home/bork/w/omega/docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; /home/bork/w/omega/docs/pre-merge-checklist.md; /home/bork/w/omega/docs/adr/0002-fail-loudly.md; /home/bork/w/omega/docs/adr/0005-documentation-discipline.md; /home/bork/w/omega/docs/adr/0008-classification-discipline.md; /home/bork/w/omega/frontend/eslint.config.js; /home/bork/w/omega/docs/worklog/2026-06-10-multi- [...]
Verdicts:
(none)
Proposals:
- [new-tenet] n4-new-tenet-mechanization-discipline on docs/adr/0011 (new; next free number at HEAD): Mint the cross-cutting tenet the RCA's §5.4 left open: a Mechanization Discipline ADR covering L1 (prose disciplines decay; mechanisms stick), the aggregate-only defect class, the measure-first adoption protocol, the quantify-over-the-class net-design rule, and the template-not-gate calibration. It completes the ADR-0002/0008/0009 unsubstantiated-claim family with the enforcement register, and answers RCA §5.4 affirmatively but procedurally: five rules, each with a named operational surface, rat [...]
  verification: combined=survives (LENS 1 (reference web): The proposal removes/relocates nothing, so nothing orphans. Inbound-reference checks: docs/adr/ holds 0001–0010, so 0011 is genuinely the next free number at HEAD; the todo DB has refs.kind='adr' rows only for ADR-0007 and ADR-0008 (neither touched); no item or description references a mechanization tenet or ADR-0011. The re [...])
- [amend] n4-adr0005-rule10-deferral-ledgering on docs/adr/0005-documentation-discipline.md: Fold L3 (deferral capture) into ADR-0005 as Rule 10, per Revisit-when #3's pre-authorized absorb-by-append. The convention exists operationally (pre-merge checklist §D, the deferral-harvest arc) but the checklist is template-not-gate and trusted-rotation-scoped; the tenet-level home makes the discipline binding for any session authoring a deferral-bearing document, and gives it the Amendments/Revisit machinery.
- [amend] n4-adr0005-rule11-verbatim-consult-records on docs/adr/0005-documentation-discipline.md: Fold the verbatim consult-record discipline into ADR-0005 as Rule 11. Committed documents invoke 'the standing verbatim-record discipline' by name (the history audit's Method section; the multi-writer worklog's appendix header), but a grep-grade sweep finds no committed definition — the only definition located is a user-local memory note, which a clone or fork does not receive. A discipline invoked by name in committed documents needs a committed definition; that is Rule 1 applied to the discipl [...]
- [note] n4-l2-owner-principle-stays-mechanized on docs/adr/0001-state-mutation-and-readonly-policy.md: L2 (multi-writer slots want owners) needs no further tenet articulation. It is already carried at the right altitudes: the store-write-needs-owner lint at error on a fully-triaged baseline, two owner modules as worked examples, the ADR-0001 amendment recording the Revisit-#3 response, and the filed residual (settings-profile-mutator-owner). Minting a standalone tenet would duplicate ADR-0001's amended content — the parallel-articulation drift ADR-0005 Rule 1 forbids.
- [note] n4-measure-first-rides-with-tenet on frontend/eslint.config.js: The a75814c measure-first adoption protocol is a protocol, not a principle — it should not be a standalone tenet. Its recommended home is Rule 3 of the proposed mechanization tenet. If that tenet is declined, it stays where it lives today (the eslint.config.js rationale header plus per-arc worklogs), which has worked: three 2026-06-10 worklogs cite the pattern by name and followed it.
- [note] n4-out-of-frame-review-stays-process on CLAUDE.md (umbrella) — natural home if repo-residency is wanted; no ADR change recommended: Out-of-frame adversarial review was load-bearing twice in one cycle (audit L8; the multi-writer postscript, where the in-frame run self-declared its frame deficient and the out-of-frame rerun found the exit-set leak and a fabricated sanction quote). Recommend leaving it as process (skill + user-local memory + practice), not minting an ADR: the mechanism is harness-bound tooling, and the ADR corpus is otherwise collaboration-tool-agnostic.
- [note] n4-template-not-gate-calibration on docs/pre-merge-checklist.md: The trusted-rotation / template-not-gate pattern should not become its own tenet; it is the boundary condition on mechanization, and its recommended articulation is Rule 5 of the proposed mechanization tenet. The checklist's 'What this is — and what it is not' section remains the operational record either way.
`````

### gaps (verbatim)

G1 — Eleven 2026-06-10 worklogs appear in no reader's coverage (21 exist; digest shows ~10 consulted): branded-path-types, cast-hygiene-lint, enrichment-merge-null-validation, hydration-rebind-residue-audit, keybindings-substrate-split, migration-leaf-assertion-and-composition-test, only-throw-error-g3, rehome-agnostic-utils, reviewcard-canonical-content, typed-capability-metadata-mirror, vue-lifecycle-footgun-guards. Five are materially ADR-relevant: only-throw-error-g3 + cast-hygiene-lint render r2's ADR-0002 mechanization-register enumeration ("four error-level lint rules, two ownership local rules") verifiably stale at HEAD (eslint.config.js now also carries @typescript-eslint/only-throw-error plus no-restricted-syntax guards incl. the any-assertion ban; item cast-hygiene-lint is closed/shipped); migration-leaf-assertion likely closes the digest's "one place ADR-0002 fail-loud is structurally absent" (migrations) which r2 engages neither way; rehome-agnostic-utils (PR #389) and keybindings-substrate-split (PR #390) move files ADR-0003's sizing prose names, after n3's pass. G2 — HEAD moved during the audit: PRs #388–#390 merged today after the orchestration snapshot; every HEAD claim in the cached r1/r2 reports (and some digest-regime claims) needs re-verification. G3 — The digest's "settled vs constructed" list (terminal loudness level per surface; ADR-0002 Rule 4's reach beyond the ACL; capability-mismatch loudness; dominant-concern tag legend) names places the corpus is silent and verifiers had to construct policy; no reader proposes encoding any of them and none declines them explicitly — the "deliberately does not propose" section must adjudicate each. G4 — ADR-0010 Revisit #3 is recorded by the digest as NOT ASSESSED (needs a source census; stability-trajectory preview-ingestion unchecked); r1's truncated verdict reads "NOT FIRED on av[...]" — the verdict table must use the honest UNASSESSED register unless r1's full report did the census. G5 — ADR-0007's density metric was never measured (digest coverage limits); the acceptance note's "two honestly-open questions" (truncated) must be confirmed to include it, or the status flip launders an unmeasured claim. G6 — r1's seat filed no answer to the inverse (new-tenet) question for ADR-0001/0010 territory; all other seats did. The inverse question was otherwise answered with evidence, not hand-waved — but with a three-way shape disagreement (see contradictions). G7 — Derived-summary-web residuals unassessed: backend/CLAUDE.md ADR mirrors, docs/pre-merge-checklist.md as ADR-0008-adjacent enumerator, frontend/IDENTIFIERS.md post-types-split re-pointing (digest said ~12+ rows must re-point; nobody checked the executed split did), proxy/CLAUDE.md (arguably out of scope). G8 — Nobody staged any SQL; the cadence item adr-effectiveness-audits (open/in-progress; description verified this session, carries the 38-count convention) needs an UPDATE recording this sweep, and r1's verified deferral-evaporation finding (services-boundary-deny-by-default closed/shipped 2026-06-10, no successor item for the state/ relocation step (b)) needs an INSERT. G9 — The digest truncates every coverage list and several verdicts; if the synthesizer holds only the digest, the verbatim-appendix discipline cannot be satisfied — confirm full reports are retained. RESOLVED (commissioned question): the trigger sweep covers all ten ADRs and reconciles — r1 0001:5/0010:4, r2 0002:4/0008:4, n1 0007:4/0009:5, n2 0005:3/0006:3 + corpus 38, n3 0003:4/0004:2; sum 38, matching the item description's 5/4/4/2/3/3/4/4/5/4 (read via psql this session), discharging the digest's non-reproduction caveat.

### contradictions (verbatim)

C1 — n4-new-tenet-mechanization-discipline (standalone ADR-0011, five rules; refuter survives) vs n2-new-tenet-mechanization-discipline (ADR-0005 Rule 10 append, explicitly "rather than a standalone ADR-0011"; refuter weakened). Mutually exclusive shapes for the same lesson; the n2 refuter's weakening facts (synopsis "Nine rules (1)–(9)" co-change; TOUCH-keyed cochange advisory verifies touch, not substance) apply to any Rule-append, while the n4 shape triggers the census co-changes r1 flagged (ADR-0010's "eighth tenet" enumeration; the synopsis's "eight tenets" closer). C2 — n2's Rule 10 (mechanization) vs n4-adr0005-rule10-deferral-ledgering (Rule 10 = deferral capture): direct rule-slot collision; n4 also claims Rule 11. C3 — r2/n2/n4 affirmatives on minting the mechanization articulation vs n1's substantive territory-scoped counter-argument (L1 already encoded as ADR-0007 #1 / ADR-0009 #4 triggers, deliberately unfired pending measure-first) and n3's territory "no" — synthesis must engage the argument, not tally seats. C4 — ADR-0003 Revisit #1 "Fired twice; recorded 2026-06-10" (verified at HEAD this session) vs the digest's explicit main-vs-appendix tension #1 ("the amendment should name both but not claim two fired triggers"; chess-clone confirmed open/active, its own PoC gate unmet); n3 flags without resolving — the synthesis must amend or record a reasoned decline. C5 — n2 internal: corpus verdict "bookkeeping now current for 0001/0003/0005/0009/0010" vs n2's own finding that ADR-0005 #2's further firings (2026-06-02 advisory; 2026-06-10 dangling-signal arc) are NOT recorded in the ADR; the verdict table must carry the latter. C6 — r2-handoff-adr0002-bullet-stale (spot-fix) vs n2-handoff-governance-delegate-to-synopsis (slim the section; survives): executing both independently conflicts; the restructure subsumes the spot-fix. C7 — Three-way reference-repair overlap: r2-adr0002-reference-repair, n2-adr0002-0003-stale-relative-refs, n3-adr0003-analysis-recording-fulfilled all touch overlapping stale refs (ADR-0003's Related still cites ../notes/analysis-persistence-plan.md, verified this session; the target moved to docs/archive/notes/design/ per n2's README finding) — must dedupe into one amendment per ADR; also n2 mis-attributes the overlap to "the n1 reader" (ADR-0002 is r2's territory, ADR-0003 n3's). C8 — n2's ADR-0006 health verdict rests on argument-from-silence while conceding header conformance was never measured; the digest frames the same silence as only "a datum". C9 — Duplicate, not contradiction: n1-synopsis-adr0009-entry-stale ≡ n2-synopsis-0009-entry-refresh (one proposal, two finders).

### additional_work (verbatim)

1. Consult the unconsulted 2026-06-10 worklogs (at minimum the five ADR-relevant ones: only-throw-error-g3, cast-hygiene-lint, migration-leaf-assertion-and-composition-test, rehome-agnostic-utils, keybindings-substrate-split) end to end before drafting amendment text — they change the factual payload of r2's ADR-0002 mechanization amendment and n3's ADR-0003 drafts. 2. Re-verify every HEAD claim post-PR-#390 (cached r1/r2 especially); known-stale instance already found: r2's lint-roster enumeration. 3. Discharge C8 with a measurement: one scripted pass counting ADR-0006 standard headers across the source trees; feeds the n2 header-linter item decision. 4. ADR-0010 Revisit #3: either run the source census the digest says it needs or record the verdict as UNASSESSED, not NOT-FIRED. 5. Adjudicate C1/C2/C3 before writing the corpus end-state; whichever mechanization shape wins, port the losing shape's refuter findings to it, and settle ADR-0005 rule numbering in one PR together with the synopsis rules-enumeration and tenet-census co-changes (r1's fragility note). 6. Independently verify n4's Rule-11 grep claim (no committed definition of the verbatim-record discipline) — cheap grep over docs/; n4's two Rule appends escaped adversarial refutation by being classed [amend] though they add binding rules, so apply the n2-refuter lens to them. 7. Synthesizer fact-check of n1's status-change must specifically check: the "measured correction overhead" framing (the digest records one verifier correction, corr. 2 — an interpretive stretch), the eight-tenets census interaction, and that the acceptance note names the unmeasured density metric. 8. Draft the staged-SQL section: INSERT successor item for the state/ relocation step (b); UPDATE adr-effectiveness-audits description with this sweep's record and the post-amendment trigger count (r2 adds one trigger to ADR-0002; an ADR-0011 adds a Revisit section); optional INSERT for the header-lint item; refs rows kind='adr'/'audit' binding new/touched items (current adr-kind rows verified: only 0007/0008); finish with SELECT * FROM work_status_violations. 9. Confirm the full verbatim reader/refuter reports exist in orchestration state before promising the appendix (G9). 10. Source the follow-up consolidation-review gate from the commission text (it appears in no reader output, no worklog — grep verified) and name its inputs: the C1 shape decision, the deferred on-touch header fixes, the deliberately-unfired mechanization triggers. 11. Add the doc-graph duty to the execution plan: the audit doc + amendments are structural doc changes requiring same-change regeneration (node tools/doc-graph/generate.mjs), and the TOUCH-keyed advisory cannot verify synopsis substance — manual check required.

### Report (verbatim)

`````markdown
# Completeness-critic report — ADR-corpus audit 2026-06-10

Role: completeness critic over the six readers' digested verdicts/proposals for the audit of ADR-0001..0010 + `docs/adr-synopsis.md` (item `adr-effectiveness-audits`).

## 0. What this critic consulted (declared per the ADR-0002 documentation-consumption rule)

Read end to end this session: `/tmp/adr-corpus-audit/evidence-digest.md` (359 lines); the `adr-effectiveness-audits` item description (psql, full record); the `items` table schema (`\d items`). Targeted, *partial* inspections — declared as such, used only to verify digest-named pointers, not as substitutes for reading the documents: `docs/adr/0002-fail-loudly.md` (~lines 340–352), `docs/adr/0003-frontend-portability-and-domain-boundaries.md` (Revisit-when + Related sections, ~lines 250–258, grep for amendments/keybindings/engine-util), `frontend/eslint.config.js` (grep for local rules, only-throw-error, cast-hygiene, App.vue glob), `docs/worklog/` listing, git tags/log, and psql SELECTs over `items`/`refs`. I did not read any ADR end to end; per-document judgment stays with the assigned readers and the synthesizer. Never touched `backend/qeubo/`; store access was SELECT-only; appendix parts not opened (digest used as sanctioned substitute).

## 1. Commissioned question: does the trigger sweep cover all ten and reconcile?

**Yes — resolved affirmatively.** Per-reader re-derivations: r1 0001:5, 0010:4; r2 0002:4, 0008:4; n1 0007:4, 0009:5; n2 0005:3, 0006:3 plus an independent corpus-wide 38; n3 0003:4, 0004:2. Sum = 38, matching the breakdown recorded in the `adr-effectiveness-audits` description (`5/4/4/2/3/3/4/4/5/4` at 2026-06-10 — read via psql this session). This discharges the digest's own caveat (a p2 verifier could not reproduce 38 from five ADRs; "re-derive at execution"). Every ADR has exactly one assigned trigger-walker; no double-counting, no orphan ADR. Caveat: the digest truncates most per-trigger assessments (~15 of 38 visible); the synthesizer must confirm from the full reports that all 38 received individual walks, with particular attention to ADR-0010 #3 (§3, G4).

## 2. Coverage of the corpus walk-list

- **ADR-0001..0010 + synopsis**: every document has a verdict from exactly one reader (r1: 0001, 0010; r2: 0002, 0008; n1: 0007, 0009; n2: 0005, 0006, synopsis, corpus; n3: 0003, 0004). n4 filed proposals only, no verdicts — the verdict table draws on five readers; that is by design (new-tenet seat) but should be stated.
- **Derived-summary web**: n2 assessed synopsis, `docs/handoff-current.md` (governance section), `docs/onboarding/orientation.md`, `README.md`; r1 assessed frontend/CLAUDE.md's ADR-0010 corollary and found the identifier-map staleness. Residuals nobody assessed: `backend/CLAUDE.md` (read by n3, no mirror finding recorded), `docs/pre-merge-checklist.md` as the enumerator of ADR-0008-adjacent disciplines, `frontend/IDENTIFIERS.md` post-types-split (the digest said ~12+ rows must re-point in the split PR; nobody verified the executed split did), `proxy/CLAUDE.md` (defensibly out of scope — submodule). Low severity; the report should name them as declared residuals rather than imply the web is fully swept.
- **Inverse question (new tenets)**: answered with evidence, not hand-waved — three affirmatives (r2, n2, n4 — all adversarially verified) and two evidence-backed territory-scoped negatives (n1, n3). One hole: the r1 seat (0001/0010 territory) filed no inverse answer. The real problem is the unresolved three-way shape disagreement (§4, C1–C3).

## 3. Gaps

**G1 — Unconsulted 2026-06-10 worklogs.** 21 worklogs are dated 2026-06-10; the digest's (truncated) coverage lists show roughly ten consulted. Absent from every list: branded-path-types, cast-hygiene-lint, enrichment-merge-null-validation, hydration-rebind-residue-audit, keybindings-substrate-split, migration-leaf-assertion-and-composition-test, only-throw-error-g3, rehome-agnostic-utils, reviewcard-canonical-content, typed-capability-metadata-mirror, vue-lifecycle-footgun-guards. Five matter:
- *only-throw-error-g3* and *cast-hygiene-lint*: ADR-0002 mechanization evidence. Verified at HEAD: `frontend/eslint.config.js` now carries `@typescript-eslint/only-throw-error` plus `no-restricted-syntax` guards (error-message reverse-engineering ban; any-assertion ban, stage 1 of item `cast-hygiene-lint`, closed/shipped). r2's mechanization-register amendment enumerates "four error-level lint rules, two ownership local rules" — already stale; the ready-to-apply text must be drafted against the post-#390 roster.
- *migration-leaf-assertion-and-composition-test*: the digest names migrations "the one place ADR-0002 fail-loud is structurally absent" (worklog-current finding 8). r2's verdict engages this neither as fixed nor as open; the per-tenet audit of the ADR the cadence item calls "most overdue" should record the disposition.
- *rehome-agnostic-utils* (PR #389) and *keybindings-substrate-split* (PR #390): merged today, after at least the cached passes; both move files on the digest's fork cut-list that ADR-0003's sizing prose names (`engine/util.ts` strays; `lib/keybindings` fusion). n3's four ADR-0003 amendments must be drafted against post-merge HEAD.

**G2 — HEAD moved during the audit.** The session-start snapshot ends at PR #385; HEAD is now at #390 (verified: `reviewcard-canonical-content`, `rehome-agnostic-utils`, `keybindings-substrate-split` merged today). All file/line claims in the cached r1/r2 reports — and some in the digest-regime reports — predate up to three structural merges. One spot-check came back healthy (ADR-0003 no longer says "captures math"; the digest's corr. 8 appears already addressed) and one came back stale (r2's lint roster, above) — so the re-verification pass is not optional.

**G3 — The corpus-silence list is unaddressed.** Digest §2 ("settled vs constructed") hands the audit the exact places verifiers had to construct policy because the corpus is silent: (a) the terminal loudness level per surface (warn vs throw vs pushSystemMessage — "not decidable from the ADR"); (b) ADR-0002 Rule 4's reach beyond the ACL ("analogical, not literal"); (c) capability-mismatch loudness; (d) the dominant-concern tag legend vs mechanical band conformance. No reader proposes encoding any of these and none declines them explicitly. The "deliberately does not propose" section must adjudicate each, with reasons; silence here would reproduce the gap the evidence corpus documented.

**G4 — ADR-0010 Revisit #3.** The digest records #3 as *not assessed* ("needs a source census; stability-trajectory preview-ingestion named unchecked"); r1's digest line truncates at "NOT FIRED on av[...]". If the full report says "not fired on available evidence" without a census, the honest verdict register is UNASSESSED, not NOT-FIRED — the digest's coverage-limits section names this exact item.

**G5 — ADR-0007 density metric.** "Density — the ADR's second metric — was never measured" (digest, twice). n1's status-change rests on adoption evidence; the truncated "two honestly-open questions" must be confirmed to include the unmeasured metric, or flipping to Accepted quietly launders it.

**G6 — Inverse-question seat hole.** r1 filed no new-tenet answer for the 0001/0010 territory. Minor; state it rather than imply all territories answered.

**G7 — Derived-summary residuals.** As §2; name them.

**G8 — No staged SQL from any reader.** Verified grounding for the section the deliverable requires: `services-boundary-deny-by-default` is closed/shipped 2026-06-10 and no successor item exists for the state/ relocation step (b) — r1's deferral-evaporation note checks out, and it is the audit's own L3 shape reproduced during the audit; an INSERT is needed. The cadence item `adr-effectiveness-audits` (open/in-progress) needs a description UPDATE recording this sweep and the post-amendment trigger count. `refs` currently carries exactly two `kind='adr'` rows (0007, 0008) and the vocabulary now includes `'audit'` — new bindings for audit-created items are available and unplanned. Close nothing: the cadence item is standing. Gate every write behind maintainer sign-off; finish with `SELECT * FROM work_status_violations`.

**G9 — Verbatim-appendix feasibility.** Every coverage list and several verdicts in the digest are truncated mid-sentence. If the synthesizer holds only the digest, the standing verbatim-record discipline (commission + full report per consult) cannot be met. Confirm the full texts are retained before promising the appendix — this is the one item that could make a required deliverable shape dishonest rather than merely incomplete.

## 4. Contradictions the synthesis must adjudicate

- **C1. n4 vs n2 on the mechanization articulation's shape.** Standalone ADR-0011 (n4; refuter survives) vs ADR-0005 Rule-10 append (n2; refuter *weakened*; n2's text explicitly rejects the standalone shape). The n2 refuter's weakening facts — synopsis "Nine rules (1)–(9)" co-change; the TOUCH-keyed cochange advisory verifies touch, not substance — bind any Rule-append; the standalone shape instead triggers the tenet-census co-changes r1 flagged (ADR-0010's "eighth tenet after ADR-0002…0009"; the synopsis's "eight tenets" closer; both already strained by ADR-0007's pending status flip). Pick one shape; port the other refuter's findings.
- **C2. Rule-slot collision.** n2's Rule 10 = mechanization; n4's Rule 10 = deferral ledgering (plus n4's Rule 11 = verbatim consult records). Numbering and the synopsis enumeration must be settled in one PR.
- **C3. Mint vs fold.** r2/n2/n4 affirmatives vs n1's substantive counter (L1 is already encoded as ADR-0007 #1 / ADR-0009 #4 triggers, deliberately unfired pending measure-first) and n3's territory negative. Engage the argument on the merits, not by seat count.
- **C4. ADR-0003 "fired twice".** The executed amendment text (verified at HEAD) claims two firings; the digest's main-vs-appendix tension #1 says name both adopters but do not claim two fired triggers (chess-clone open/active, PoC gate unmet — store-confirmed). n3 flags without resolving. Amend the day-old amendment or record a reasoned decline; the verdict table cannot stay silent on a digest-flagged overclaim.
- **C5. n2 internal.** Corpus verdict: bookkeeping "current for 0001/0003/0005/0009/0010"; n2's own 0005 walk: trigger #2's further firings (2026-06-02; 2026-06-10) are NOT recorded. Carry the finding, not the summary.
- **C6. handoff-current remedies.** r2's spot-fix of the ADR-0002 bullet vs n2's section-level delegation restructure (survives). The restructure subsumes the spot-fix; do not apply both independently.
- **C7. Reference-repair three-way overlap.** r2 (ADR-0002 refs), n2 (ADR-0002/0003 `../notes/` refs), n3 (ADR-0003 Related pointer — verified still dangling at HEAD: `../notes/analysis-persistence-plan.md`, moved per n2's README finding). Dedupe to exactly one amendment per ADR. Also correct n2's seat mis-attribution ("overlaps the n1 reader's documents" — those are r2's and n3's).
- **C8. ADR-0006 silence.** n2 reads zero disputes as health while conceding conformance was never measured; the digest calls the same silence merely "a datum". A one-command header-conformance sample converts the argument into a measurement.
- **C9. Duplicate (not a conflict).** n1's and n2's synopsis-0009 proposals are one proposal with two finders; record as such.

## 5. Verification soundness

- **n1's ADR-0007 status-change** (synthesizer fact-check pending, no refuter by design): check (i) the "measured correction overhead" framing — the digest shows one verifier correction (status is "Proposed", corr. 2), and one correction is thin support for "measured overhead"; (ii) the census interaction (Proposed-yet-counted, r1's note); (iii) that acceptance records the unmeasured density metric (G5).
- **n4's two ADR-0005 rule appends** are classed [amend] and so escaped adversarial refutation, yet they add binding rules — materially restructure-grade. Apply the n2-refuter lens to them, and independently re-run n4's Rule-11 grep claim (no committed definition of the verbatim discipline) — cheap.
- **Cached r1/r2**: fuller evidence regime, but pre-#388–#390; every HEAD citation needs the G2 re-check. They also may not have seen the digest's verifier corrections (e.g., the C4 tension).
- **All refuter verdicts are truncated in the digest**; synthesis must work from the full reports.

## 6. Deliverable-shape audit

1. **Per-ADR verdict table** — feasible now; ten ADRs + synopsis all have verdicts (five readers; n4 contributes none, by design). Caveats to encode: ADR-0010 #3's register (G4); C5's bookkeeping correction; the ADR-0007 row is conditional on the sign-off gate.
2. **Proposed corpus end-state** — blocked until C1–C3 and the 0007 outcome are adjudicated; must also state the *post-audit* trigger count (r2 adds an ADR-0002 trigger; an ADR-0011 adds a Revisit section) so the next sweep has a baseline, and must reflect the tenet-census co-changes.
3. **Ready-to-apply amendment text** — not derivable from the digest alone (truncations; post-#390 drift; the C7 dedupe). Draft against HEAD after the G1 reads.
4. **"Deliberately does not propose"** — material exists (r2's Rule-7 keep; n1's declined 0009 restructure/slim; r1's declined 0001 slim; n4's three "stays-as-process" notes; n1/n3 territory negatives; n2's on-touch header policy) but it must also adjudicate G3's constructed-policy list and the C4 decline-or-amend.
5. **Staged SQL** — entirely missing from reader output; grounded candidate set in G8.
6. **Two gates** — maintainer sign-off is reflected in proposals ("maintainer's call" passim). The follow-up consolidation review appears in *no* reader output, the amendments worklog, or the main audit note (grep-verified): the synthesizer must source it from the commission and name its inputs — the C1 shape decision, the deferred on-touch fixes, the deliberately-unfired mechanization triggers (0007 #1, 0009 #4, 0006 #1).
7. **Unrequired but binding**: the audit deliverable + amendments are structural doc changes — same-change doc-graph regeneration (`node tools/doc-graph/generate.mjs`) applies, and the TOUCH-keyed advisory cannot verify synopsis substance, so the synopsis co-change needs manual verification. No reader named this for the audit's own PR.

## 7. One item that checks out and should be said plainly

The App.vue lint-glob gap the digest flagged (ADR-0010 §(e)) is closed at HEAD: the services-boundary rule's files glob includes `src/App.vue` and the config header records the gap as "closed at the inversion". No action needed; recording it prevents the synthesis from re-raising a discharged finding.
`````


---

License of this record: Public Domain (The Unlicense). Quoted agent
output is reproduced verbatim under the same license per the source documents.