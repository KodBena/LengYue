# Audit — ADR corpus 2026-06-10 — verbatim appendix, part 1 of 2

Split for GitHub renderability (>450 KB as one file). Part 1: process
record + the complete workflow script (§0) and readers r1, r2, n1, n2 with
their refuter verdicts. Part 2 (`audit-adr-corpus-2026-06-10-appendix-p2.md`):
readers n3, n4 with refuter verdicts, the evidence digest agent (§3), and
the completeness critic (§4).


Companion to `audit-adr-corpus-2026-06-10.md` (same directory), per the
verbatim-record discipline: every commissioned agent's commission and full
report, reproduced verbatim. Shared prompt segments are factored once (§0);
nothing in §1–§4 is paraphrased — the JSON string fields are printed as-is.

Point-in-time record; not retro-edited.

## §0 Process record and factored commissions

**Run:** workflow `wf_472af69a-8b2` (task `w1qy5svgz` interrupted; resumed as
task `w1ih3pw7s`). **Interruption (maintainer, mid-run):** the original
9-reader / 3-lens design had each agent reading the ~810 KB history-audit
appendix corpus to satisfy the read-fully-before-citing discipline (~300k
tokens/agent). The maintainer interrupted after two readers completed and
directed: one extraction agent reads the appendix corpus once and writes a
pointer-bearing digest; downstream agents read the digest + the main audit +
their assigned ADRs, citing the appendix only via digest pointers; fan-out
narrowed (refuters only for retire/slim/merge; budget checks between phases);
resume from cache. The two completed readers (r1, r2) replayed from cache
byte-identically. Two readers launched under the original design (old r3:
ADR-0007+0009; old r4: ADR-0005+0006+synopsis) were interrupted mid-flight;
their partial transcripts produced **no used output**. The superseded original
design additionally defined readers r5 (0003+0004), r6/r7 (appendix evidence
specialists), r8 (new-tenet case-builder), r9 (corpus-structure) and a
3-lens-per-proposal verifier tier; those commissions were never launched and
are superseded by the n1–n4 definitions below. Total spend this pass: ~681k
tokens, 12 agents.

**The complete workflow script (the byte-faithful source of every commission
below — prompt builders, schemas, control flow):**

````````js
export const meta = {
  name: 'adr-corpus-audit',
  description: 'Generic ADR-corpus audit: cached readers replayed, one appendix-digest extraction, digest-regime readers, refuters for retire/slim/merge, completeness critic',
  phases: [
    { title: 'Read', detail: 'replay the two completed readers (0001+0010, 0002+0008) from cache' },
    { title: 'Digest', detail: 'one extraction agent reads the ~810KB appendix corpus once, writes a compact pointer-bearing digest' },
    { title: 'Read (digest regime)', detail: '3 readers covering 0003..0009 + synopsis + corpus structure, plus 1 new-tenet case-builder; appendix cited only via digest pointers' },
    { title: 'Refute', detail: 'one combined-lens refuter per retire/slim/merge proposal; restructure/new-tenet refuters only if budget allows' },
    { title: 'Critique', detail: 'completeness critic over the assembled verdicts' },
  ],
}

const ROOT = '/home/bork/w/omega'

const DISCIPLINE = [
  'BINDING DISCIPLINE (non-negotiable):',
  '- ADR-0002 documentation consumption: read every document you cite END TO END before citing any part of it. A grep hit, search preview, or partial read is a pointer to read the file, not a substitute. If you deliberately skip a document or a part, say so in your coverage statement and do not cite the unread part. frontend/FILES.md and frontend/IDENTIFIERS.md are sanctioned row-level lookup references; docs/doc-graph-report.md is a generated validator report and may be consulted row-level.',
  '- READ-ONLY everywhere: do not create, edit, or delete ANY file; do not write to the todo database. You may run read-only SQL: psql -h 192.168.122.1 -d todo -c "SELECT ..." (SELECT only, nothing else).',
  '- NEVER read anything under backend/qeubo/ (licensing firewall).',
  '- ADR-0008 verdict vocabulary: never pick a closest-match verdict. If none of the offered verdict values fits a document, use "other" and state precisely what the document needs instead.',
  '- ADR-0009: make no performance claims of your own. Captured claims from documents may be relayed, attributed.',
  "- Today's date is 2026-06-10. The repo is at /home/bork/w/omega, branch main.",
  '- Your report_markdown will be reproduced VERBATIM in the audit appendix (public, committed to the repo). Write it as a standalone professional report: commission understood, coverage, findings, verdicts, rationale. Complete but economical — no filler, no padding; do not truncate substance to save space.',
].join('\n')

const CONTEXT = [
  'You are a commissioned agent in the 2026-06-10 generic ADR-corpus audit of the LengYue project (work-status item adr-effectiveness-audits), repo at /home/bork/w/omega.',
  'The corpus under audit: the ten ADRs under docs/adr/ plus docs/adr-synopsis.md.',
  'THE QUESTION: given everything the project now knows, judge the ADR corpus itself. Per ADR: retire, slim, merge, restructure, amend, change status (ADR-0007 is still "Proposed"), or keep as-is. Also the inverse: do the paid-for lessons of the last six weeks justify any NEW tenet, or fold into existing ones?',
  'BARS: a retirement/slimming/merge proposal must show the content is either dead, delegated to a better home, or actively misleading — "shorter" is not a reason. The ADRs serve a general agenda, not stone. The maintainer plans a generic knowledge flash-card fork (recorded in ADR-0003\'s 2026-06-10 amendment) — judge fitness against that future too.',
  'The audit is read-only: it PROPOSES; the maintainer signs off before anything is applied.',
  '',
  'Read FIRST, end to end, in this order:',
  '1. /home/bork/w/omega/CLAUDE.md (umbrella authoring posture; if already in your context, do not re-read)',
  '2. /home/bork/w/omega/docs/adr-synopsis.md',
  '3. /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (the 25-recommendation history audit; its §2 cross-cutting lessons and §6 deflations are the evidence spine)',
  'Then your assigned documents and evidence below.',
].join('\n')

const OUTPUT_CONTRACT = [
  'OUTPUT CONTRACT (StructuredOutput):',
  '- coverage: string — every document you read, end-to-end vs partial (name skipped sections), and anything assigned that you deliberately did not read, with why.',
  '- per_adr: array — one entry per assigned corpus document, each {adr, verdict, rationale, load_bearing, dead_or_misleading, trigger_status, fork_fitness}. verdict is one of keep | amend | slim | merge | restructure | retire | status-change | other (use "other" only with an explanation of what the document actually needs). trigger_status: walk EVERY trigger in the document\'s "Revisit when..." section against HEAD and the work-status store; per trigger state fired / not-fired / unassessable, whether any firing is recorded in the ADR, and give the trigger count you re-derived. (Evidence-specialist readers without assigned corpus documents return [].)',
  '- proposals: array of every concrete change you recommend: {id (kebab-case slug, unique, prefixed with your reader key), adr (target document), kind: retire | slim | merge | restructure | amend | status-change | new-tenet | note, summary (2-4 sentences), details (the concrete change: for amend draft the exact ready-to-apply text; for slim/retire name exactly what content goes and where each load-bearing piece is already carried or must move; for merge name the surviving home and the migration of every section; for new-tenet draft the tenet\'s decision core)}. kind "note" is for observations needing no verification.',
  '- report_markdown: the full standalone report (verbatim-appendix-ready).',
].join('\n')

const READER_SCHEMA = {
  type: 'object',
  required: ['coverage', 'per_adr', 'proposals', 'report_markdown'],
  properties: {
    coverage: { type: 'string' },
    per_adr: {
      type: 'array',
      items: {
        type: 'object',
        required: ['adr', 'verdict', 'rationale', 'trigger_status', 'fork_fitness'],
        properties: {
          adr: { type: 'string' },
          verdict: { type: 'string' },
          rationale: { type: 'string' },
          load_bearing: { type: 'string' },
          dead_or_misleading: { type: 'string' },
          trigger_status: { type: 'string' },
          fork_fitness: { type: 'string' },
        },
      },
    },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'adr', 'kind', 'summary', 'details'],
        properties: {
          id: { type: 'string' },
          adr: { type: 'string' },
          kind: { type: 'string', enum: ['retire', 'slim', 'merge', 'restructure', 'amend', 'status-change', 'new-tenet', 'note'] },
          summary: { type: 'string' },
          details: { type: 'string' },
        },
      },
    },
    report_markdown: { type: 'string' },
  },
}

const VERIFIER_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'required_repairs', 'report_markdown'],
  properties: {
    verdict: { type: 'string', enum: ['refuted', 'weakened', 'survives'] },
    findings: { type: 'string' },
    required_repairs: { type: 'string', description: 'If the proposal survives or is weakened: the exact repair set it must ship with (orphaned references to re-point, content custody to secure, calibration to add). "none" if none.' },
    report_markdown: { type: 'string' },
  },
}

const CRITIC_SCHEMA = {
  type: 'object',
  required: ['gaps', 'contradictions', 'additional_work', 'report_markdown'],
  properties: {
    gaps: { type: 'string' },
    contradictions: { type: 'string' },
    additional_work: { type: 'string' },
    report_markdown: { type: 'string' },
  },
}

const READERS = [
  {
    key: 'r1',
    label: 'read:0001+0010',
    focus: 'The two frontend-reactivity records: ADR-0001 (state mutation / readonly policy — a Decision, amended twice 2026-06-10) and ADR-0010 (render locality + canvas — a Tenet, amended 2026-06-10).',
    body: [
      'Assigned corpus documents (read end to end): docs/adr/0001-state-mutation-and-readonly.md, docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md.',
      'Specific evidence (read end to end anything you cite):',
      '- docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (the ADR-0001 Revisit-#3 response, the store-write-needs-owner lint, the out-of-frame audit postscript)',
      '- docs/worklog/2026-06-10-adr-record-amendments.md',
      '- docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md (ADR-0010\'s named backing)',
      '- docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md (ADR-0010\'s substrate)',
      '- docs/notes/audit/perf-audit-game-scroll-2026-05-28.md (ADR-0001 trigger-#2 substrate)',
      'Questions to weigh (not presume):',
      '- ADR-0001 carries a long TypeScript-semantics / Vue-reactivity / Haskell-immutability exposition and three Alternatives. Load-bearing decision rationale, or educational prose whose loss costs nothing? Apply the retirement bar honestly.',
      '- ADR-0001\'s Related section cites "TODO item 27-min/27-full/17/21" style handles — the project has since adopted a stable-handles convention (work-status ids + slugs; the TODO numbering is retired). Misleading at HEAD? Check whether these handles resolve anywhere.',
      '- The writer-enumeration lint now partially mechanizes the mutator convention: is the 2026-06-10 amendment record sufficient, or does the body need more?',
      '- ADR-0010: its Revisit #4 (layering tension) now has a work-status record (services-boundary-deny-by-default arc) — does the trigger text need a dated note? Is its Vue-specific scoping right for a corpus that "applies project-wide"? Is the verbatim corollary still the canonical statement (frontend/CLAUDE.md cross-links it)?',
      '- Fork fitness: ADR-0001 names specific store containers and types.ts — still accurate after the types.ts split (src/types/ modules + store/schema.ts)? Does a fork author misread anything?',
    ].join('\n'),
  },
  {
    key: 'r2',
    label: 'read:0002+0008',
    focus: 'The claim-discipline core: ADR-0002 (fail loudly) and ADR-0008 (classification discipline).',
    body: [
      'Assigned corpus documents (read end to end): docs/adr/0002-fail-loudly.md, docs/adr/0008-classification-discipline.md.',
      'Specific evidence (read end to end anything you cite):',
      '- docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md',
      '- docs/notes/postmortem/postmortem-knob-registry-qeubo-domain-2026-05.md and docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md and docs/worklog/2026-05-14-popover-hover-finickiness.md (the ADR-0008 substrate, if you cite them)',
      '- docs/worklog/2026-06-10-refs-kind-audit.md (Rule 7 / ADR-0008 working at the store vocabulary)',
      '- docs/pre-merge-checklist.md',
      '- docs/notes/decisions-deferred.md (ADR-0008\'s Related section leans on it)',
      'Questions to weigh (not presume):',
      '- Rule 7 in ADR-0002 spans roughly 70 lines including the provisional-home paragraph AND its retirement note, while ADR-0008 carries the broader principle. Is that residence load-bearing (the fail-loudly-register instance + the reasoning trace ADR-0002 Rule 6 demands) or duplicated content a slim could delegate? Be precise about what a slim would orphan.',
      '- ADR-0002\'s Context examples and Related section cite pre-store TODO item numbers (items 20/21/29/30) and ../notes/analysis-persistence-plan.md — verify each resolves or is misleading at HEAD (check docs/notes/ listing; the analysis-persistence feature has since shipped in some form — see docs/handoff-current.md integration section).',
      '- ADR-0002\'s "Engagement protocol" Related bullet describes human-AI collaboration rules — still accurate as stated? Does CLAUDE.md now carry that register?',
      '- Five-plus lint rules + DB constraints + CI gates now mechanize ADR-0002-flavored rules (G1 message-reparse, clear-needs-ownership, store-write-needs-owner, cast-hygiene any-ban, gate-prop/module-intent, work_status_violations, doc-graph freshness). The ADR says "the tenet is a policy, not an enforced mechanism" (Negative consequences). Does the body need a mechanization-register amendment, or is per-instance recording elsewhere enough?',
      '- ADR-0008 cites "the umbrella\'s memory record at feedback_classification_chestertons_fence.md" — a maintainer-local memory file that resolves in NO clone of the repo. Per the project\'s own stable-handles convention, is that reference honest? What should it cite instead?',
      '- ADR-0008\'s exceptions still name "the design-note: planned marker from the doc-graph vocabulary" — ADR-0005 Rule 9 retired that marker vocabulary on 2026-06-02. Misleading at HEAD?',
      '- Fork fitness for both.',
    ].join('\n'),
  },
]

function readerPrompt(r) {
  return [
    CONTEXT,
    '',
    'YOUR ASSIGNMENT (' + r.key + '): ' + r.focus,
    '',
    r.body,
    '',
    DISCIPLINE,
    '',
    OUTPUT_CONTRACT,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Restructured evidence regime (2026-06-10 interruption): one extraction agent
// reads the ~810KB appendix corpus ONCE and writes a compact pointer-bearing
// digest; all subsequent agents cite the appendix only via the digest.
// ---------------------------------------------------------------------------

const DIGEST_PATH = '/tmp/adr-corpus-audit/evidence-digest.md'

const DIGEST_SCHEMA = {
  type: 'object',
  required: ['coverage', 'digest_markdown'],
  properties: {
    coverage: { type: 'string' },
    digest_markdown: { type: 'string', description: 'The exact content written to the digest file.' },
    notes: { type: 'string' },
  },
}

const DIGEST_PROMPT = [
  'You are the EVIDENCE-EXTRACTION agent in the 2026-06-10 generic ADR-corpus audit of the LengYue project (repo /home/bork/w/omega; work-status item adr-effectiveness-audits). The audit judges the ten ADRs under docs/adr/ plus docs/adr-synopsis.md. Downstream reader agents must NOT re-read the ~810KB history-audit appendix corpus; you read it ONCE and produce the compact evidence digest they will rely on.',
  '',
  'Read END TO END, all three (this is your whole job — do not skim):',
  '- docs/notes/audit/audit-spa-history-lessons-2026-06-10-appendix-p1.md (~252KB: factoring conventions §0, shared commission prompts, the 13 harvest miners — including the adr-triggers miner, a complete one-sweep instance of the per-ADR Revisit-when trigger walk at 2026-06-10)',
  '- docs/notes/audit/audit-spa-history-lessons-2026-06-10-appendix-p2.md (~308KB: lens distillers, merge judge, the adversarial verifier verdicts)',
  '- docs/notes/audit/audit-spa-history-lessons-2026-06-10-appendix-p3.md (~248KB: the generalization / fork-lens run)',
  'Also read end to end: docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (the main report the appendix backs).',
  '',
  'Then mkdir -p /tmp/adr-corpus-audit and WRITE the digest to ' + DIGEST_PATH + ' (this single file write is sanctioned; everything else is read-only — no repo file edits, no DB writes, never read backend/qeubo/).',
  '',
  'Digest structure (target 15-25KB; compact, pointer-dense, no filler):',
  '§1 Per corpus document (ADR-0001 .. ADR-0010, then the synopsis): (a) the adr-triggers miner\'s per-trigger dispositions for that ADR — complete, every trigger, as the prior sweep instance; (b) other miner findings bearing on that ADR (conformance numbers, where the ADR was load-bearing in practice, where its text hindered); (c) verifier-verdict patterns from p2 that invoked the ADR as their standard (where ADR text settled a dispute vs where the verifier had to construct the standard); (d) generalization-run findings from p3 bearing on the ADR (especially 0003 band axes, 0007 budgets, 0010 scope); (e) deflations/corrections relevant to claims about the ADR.',
  '§2 Corpus-level observations that fit no single ADR (cross-cutting lesson evidence L1/L2/L3 as the miners grounded them; anything about how the corpus as a system performed).',
  '§3 Citation key: the appendix\'s own factoring/structure conventions, so a downstream citation of the form "digest -> p1 §<section/agent>" is traceable to the verbatim record.',
  'EVERY claim in the digest carries its pointer (part + section heading or agent name). Where the appendix contradicts the main report, say so and pointer both.',
  '',
  'OUTPUT (StructuredOutput): coverage (what you read end to end; anything skipped and why — skipping is a defect, name it loudly), digest_markdown (the EXACT content you wrote to the file), notes (anything the corpus audit must not miss that did not fit the digest structure).',
  "Today's date is 2026-06-10.",
].join('\n')

const CONTEXT2 = [
  'You are a commissioned reader in the 2026-06-10 generic ADR-corpus audit of the LengYue project (work-status item adr-effectiveness-audits), repo at /home/bork/w/omega.',
  'The corpus under audit: the ten ADRs under docs/adr/ plus docs/adr-synopsis.md.',
  'THE QUESTION: given everything the project now knows, judge the ADR corpus itself. Per ADR: retire, slim, merge, restructure, amend, change status (ADR-0007 is still "Proposed"), or keep as-is. Also the inverse: do the paid-for lessons of the last six weeks justify any NEW tenet, or fold into existing ones?',
  'BARS: a retirement/slimming/merge proposal must show the content is either dead, delegated to a better home, or actively misleading — "shorter" is not a reason. The ADRs serve a general agenda, not stone. The maintainer plans a generic knowledge flash-card fork (recorded in ADR-0003\'s 2026-06-10 amendment) — judge fitness against that future too.',
  'The audit is read-only: it PROPOSES; the maintainer signs off before anything is applied.',
  '',
  'EVIDENCE REGIME (read FIRST, end to end, in this order):',
  '1. /home/bork/w/omega/CLAUDE.md (umbrella authoring posture; if already in your context, do not re-read)',
  '2. /home/bork/w/omega/docs/adr-synopsis.md',
  '3. /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (the 25-recommendation history audit; its §2 cross-cutting lessons and §6 deflations are the evidence spine)',
  '4. ' + DIGEST_PATH + ' — the evidence digest: a commissioned end-to-end extraction of the history audit\'s three verbatim appendix parts (~810KB), with per-claim pointers back into them.',
  'Then your assigned documents and evidence below.',
  '',
  'APPENDIX ACCESS RULE: your end-to-end read duty attaches to the digest and to your assigned documents — NOT to the appendix corpus. Do NOT open docs/notes/audit/audit-spa-history-lessons-2026-06-10-appendix-p{1,2,3}.md; cite appendix material only via the digest\'s pointers, in the form "digest -> pN §<section>". If a claim you need is not in the digest, write "not in digest" and flag it for the synthesizer rather than reading the appendix yourself.',
].join('\n')

const NEW_READERS = [
  {
    key: 'n1',
    label: 'read:0007+0009',
    focus: 'ADR-0007 (file size and information density — status still "Proposed") and ADR-0009 (performance investigation discipline — the largest ADR).',
    body: [
      'Assigned corpus documents (read end to end): docs/adr/0007-file-size-and-information-density.md, docs/adr/0009-performance-investigation-discipline.md.',
      'Specific evidence (short documents; read end to end anything you cite):',
      '- docs/worklog/2026-06-10-types-split.md (ADR-0007\'s type-catalogue exception steering a real 2,375-line split, as an approved named deviation)',
      '- docs/worklog/2026-06-10-review-scoring-named-seam.md (its "Line counts (record only — no ADR-0007 claim)" section)',
      '- docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (its perf-null-check section — ADR-0009 under fire: counts-not-wall-clock deviation, engine-availability complication, "insurance, not claims" framing)',
      '- docs/notes/decisions-deferred.md and docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md (ADR-0007\'s ecosystem)',
      '- The work-status store, read-only: SELECT description FROM items WHERE id = \'refactoring-queue-adr0007\';',
      '- docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md is OPTIONAL grounding (ADR-0009 names it not-required reading; only read it fully if you cite it).',
      'Questions to weigh (not presume):',
      '- ADR-0007 status: still "Proposed" after ~6 weeks in which the synopsis counts it among "the eight tenets", a work-status item (refactoring-queue-adr0007, in-progress) executes against it, the types.ts split invoked its exception text as warrant, and worklogs disclaim ADR-0007 claims by name. Does practice show de-facto acceptance (→ status-change with a dated note), or is "Proposed" still honest? What would the corpus\'s own conventions require for the transition?',
      '- ADR-0007\'s Not-goals says the directory-organization decision "is in flight per decisions-deferred.md and will produce its own ADR if it lands" — verify against HEAD: the source-tree reorganisation happened (2026-05-11 era); did an ADR land? Is the pointer misleading?',
      '- The density metric (effective/total lines, 60 percent thresholds) has never been measured (history audit §8). Over-claim, or honest soft guidance?',
      '- ADR-0009 is the largest corpus document (~33KB) and has absorbed: a Resolved-by-user section, a 2026-06-01 amendment, a four-tool canonical surface, and a six-entry metric vocabulary with calibration prose. Is it still a readable tenet, or has it become a tenet + an operator manual fused? If you propose restructure/slim (e.g., metric vocabulary delegated to a reference doc), be precise: the ADR\'s own Revisit #3 says vocabulary extensions "go in this ADR via the append-a-rule pattern" — a restructure proposal must engage that text, and the bar is dead/delegated/misleading, not "long".',
      '- Walk every Revisit-when trigger of both against HEAD and the store; re-derive the trigger counts.',
      '- Fork fitness: ADR-0009\'s tool surface is frontend/Chromium-specific; what does the fork inherit?',
    ].join('\n'),
  },
  {
    key: 'n2',
    label: 'read:0005+0006+synopsis+corpus',
    focus: 'The documentation family — ADR-0005 (documentation discipline, nine rules), ADR-0006 (source-file headers), docs/adr-synopsis.md judged as a corpus document — PLUS the corpus-as-a-system review (derived-summary web, header/genre/status consistency, amendment-convention scalability).',
    body: [
      'Assigned corpus documents (read end to end): docs/adr/0005-documentation-discipline.md, docs/adr/0006-source-file-headers.md, docs/adr-synopsis.md (already in your first-reads; judge it as an audited document). For the corpus-as-a-system duties below you must also read the HEADERS and Related sections of all ten ADRs — read each ADR file end to end (they are short; ~170KB total) but your verdict duty covers only 0005/0006/synopsis; file corpus-level findings under adr "corpus".',
      'Specific evidence (read end to end anything you cite):',
      '- docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md (G4/G5 lineage)',
      '- docs/worklog/2026-06-10-deferral-harvest.md and docs/worklog/2026-06-10-doc-graph-dangling-signal-cleanup.md and docs/worklog/2026-06-10-keyed-cache-brand-and-stable-handles.md',
      '- docs/handoff-current.md (whole doc; its "Architectural governance" section is a primary subject)',
      '- docs/onboarding/orientation.md and README.md and docs/pre-merge-checklist.md',
      '- tools/doc-graph/cochange-advisory.mjs (what it actually enforces)',
      'Questions to weigh (not presume):',
      '- KNOWN STALENESS SIGNALS to verify at HEAD: docs/handoff-current.md\'s governance section describes ADR-0005 as "Seven rules" (the ADR has nine) and describes ADR-0002 Rule 7\'s provisional-home flag as live ("may relocate when a classification-discipline tenet is articulated") though it was retired 2026-05-17 and ADR-0008 exists — listed in the very same section. The synopsis is advisory-coupled to ADR changes (cochange-advisory.mjs); the handoff governance section is not. Is the handoff section an ADR-0005 Rule 1 violation (a parallel drift-prone summary), and what is the honest fix (delegate to the synopsis? slim the handoff section to a pointer + genre note)? File that as kind "amend" or "restructure" with adr "docs/handoff-current.md".',
      '- Check docs/onboarding/orientation.md\'s and README.md\'s ADR summaries for the same drift class.',
      '- ADR-0005 Rule 8\'s text was updated in place on 2026-06-02 (the "(Updated 2026-06-02.)" paragraph) to record Rule 9\'s supersession of the marker vocabulary — is the in-place note consistent with the sibling-revision principle, and is the remaining Rule 8 text (which still names the design-note: markers) clean for a cold reader?',
      '- ADR-0005\'s Alternative C and Revisit #2 record partial mechanization; the doc-graph artifact has since grown (origin buckets, tombstones, directory refs, advisory ratchet — the 2026-06-10 dangling-signal arc). Does the ADR need a dated note, or is the worklog record enough?',
      '- ADR-0006: any fired triggers? A header linter remains unbuilt (Revisit #1) — check whether any work-status item exists (psql read-only: SELECT id, title FROM items WHERE id LIKE \'%header%\' OR title ILIKE \'%header%\';). Is the tenet healthy as-is?',
      '- The synopsis itself: verify EVERY entry against its ADR at HEAD (the 2026-06-10 amendments to 0001/0003 are reflected — check whether 0010\'s entry covers its 2026-06-10 amendment; check the "How to read these together" section\'s "eight tenets" arithmetic and family claims). Judge: is the synopsis the right single derived summary, and is its per-entry depth right?',
      'Corpus-as-a-system duties (file findings under adr "corpus"):',
      '- (a) The derived-summary web: synopsis, handoff governance section, orientation.md reference list, README docs section. Which are Rule-1-clean delegations, which are drift-prone parallel summaries? Verify each at HEAD.',
      '- (b) Header consistency: every tenet header asserts an ordinal ("the seventh tenet, after ..."), enumerating all predecessors — a maintenance liability that grows with each tenet? Genre lines (Decision / Tenet / Bounded Context Map) consistent? Status fields? Date / Amendments / Scope lines consistent?',
      '- (c) License footers: present on 0008/0009/0010 only; ADR-0006 exempts markdown docs from headers — meaningful inconsistency or noise?',
      '- (d) Amendment-convention scalability: compare the shapes across 0001 (header entries + inline notes), 0002 (header entries + appended rules + retirement paragraphs), 0003 (header narrative + inline notes + added section), 0005 (header + in-place updated rule text), 0009 (Resolved section + Amended section), 0010 (header entry). Coherent convention? Does any ADR\'s amendment layering now exceed what a cold reader can integrate?',
      '- (e) Cross-ADR Related-section accuracy: any claim about a sibling ADR now wrong at HEAD?',
      '- (f) Corpus-and-fork: which ADRs travel to the generic knowledge flash-card fork as-is, which are umbrella-bound, and does the corpus say anywhere how a fork consumes it?',
    ].join('\n'),
  },
  {
    key: 'n3',
    label: 'read:0003+0004',
    focus: 'ADR-0003 (frontend portability and domain boundaries — the Bounded Context Map, amended 2026-06-10 with the fork sizing) and ADR-0004 (minimal-touch edits — the smallest, never-amended tenet).',
    body: [
      'Assigned corpus documents (read end to end): docs/adr/0003-frontend-portability-and-domain-boundaries.md, docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md.',
      'Specific evidence (read end to end anything you cite):',
      '- docs/worklog/2026-06-10-types-split.md (ADR-0004 discipline during a 2,375-line pure code motion; ADR-0003 exclusion retirement)',
      '- docs/worklog/2026-06-10-review-scoring-named-seam.md (the seam ADR-0003 designed in prose, executed; the Revisit-#3 canary)',
      '- docs/worklog/2026-06-10-resource-service-calibration-seam.md',
      '- docs/worklog/2026-06-10-adr-record-amendments.md (how the 2026-06-10 amendment was shaped)',
      '- frontend/FILES.md (the legend and same-PR cadence; row-level lookup sanctioned)',
      'Questions to weigh (not presume):',
      '- ADR-0003 coherence after amendment: the Decision section still argues "no concrete second-domain consumer exists" and "extract when the second use case exists", while Revisit #1 records the trigger fired twice and extraction "no longer premature by this ADR\'s own criterion". The amendments are honest, but is the document now a planning-time record + a correction layer that a cold reader must integrate themselves? Options to weigh: keep (amendment convention working as designed), restructure (an ADR-0005 Rule-8 sibling/successor consolidating the post-2026-06-10 truth while preserving this as the planning record), or amend further. Engage the cost honestly: ADR-0003 is the fork\'s primary map.',
      '- ADR-0003\'s "What this means for the analysis-recording feature" section is premised on "when we eventually build it" — check HEAD: the analysis-persistence/bundles path shipped (see docs/handoff-current.md\'s integration model; the /analysis-bundles endpoint; frontend/src/composables/useAutoSaveAnalyses.ts existence). Did the built feature follow the section\'s design (storage generic, gating isolated, opaque envelope)? Is the section now a fulfilled prediction that should be recorded as such, or misleading?',
      '- ADR-0004: zero amendments, zero fired triggers, smallest tenet. Its Context/Not-goals cite "the engagement protocol\'s full-file requirement" — does that protocol still exist as stated (check CLAUDE.md\'s authoring posture)? Walk its two Revisit triggers (Vue template type-checking maturation — assessable at HEAD?).',
      '- Fork fitness: ADR-0003 IS the fork map — what does the fork author need that the corpus does not yet give?',
    ].join('\n'),
  },
  {
    key: 'n4',
    label: 'case:new-tenets',
    focus: 'The inverse question: do the paid-for lessons justify any NEW tenet, or fold into existing ones, or stay as mechanism + checklist without tenet articulation?',
    body: [
      'Candidate signals to weigh, NOT presume (from the commission):',
      '- L1 "prose disciplines decay; mechanisms stick" — now mechanized at least five ways (G1 message-reparse lint, clear-needs-ownership, store-write-needs-owner, cast-hygiene any-ban, gate-prop-needs-default + module-intent-in-script-setup, the doc-graph freshness gate + envelope grep, the render-count harness, the work_status_violations DB gate) but stated nowhere as a tenet. Note its corollary in the history audit: "correctness budget is best spent converting remaining prose disciplines into compile-time, lint, harness, or DB-constraint enforcement — not writing more guidance prose."',
      '- L3 deferral-capture (prose deferrals evaporate; ledgered ones survive) — now a pre-merge-checklist §D convention.',
      '- L2 multi-writer-slots-want-owners — now a lint + worked examples + an ADR-0001 amendment.',
      '- The RCA\'s open question §5.4: does the recurrence of "invisible-at-authoring, visible-only-in-aggregate, policy-not-mechanism" across three surfaces warrant a cross-cutting articulation, or is per-surface mechanization enough?',
      '- Anything else the corpus shows recurring without articulation: the measure-first lint-adoption pattern (the a75814c posture, now cited by name in three worklogs); the verbatim consult-record discipline; out-of-frame adversarial review (load-bearing twice in one cycle — see the multi-writer worklog\'s postscript); the trusted-rotation corrective pattern (pre-merge-checklist framing).',
      'Evidence (read end to end): docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; docs/pre-merge-checklist.md; docs/adr/0002-fail-loudly.md, docs/adr/0005-documentation-discipline.md, docs/adr/0008-classification-discipline.md (the likely fold targets — read all three fully); frontend/eslint.config.js (the rationale header is the de-facto mechanization registry); docs/worklog/2026-06-10-multi-writer-slots-get-owners.md, docs/worklog/2026-06-10-cast-hygiene-lint.md, docs/worklog/2026-06-10-deferral-harvest.md, docs/worklog/2026-06-10-vue-lifecycle-footgun-guards.md.',
      'For EACH candidate deliver three cases and a recommendation: (i) the case for a new standalone tenet (draft its decision core if you recommend it); (ii) the case for folding into an existing ADR (name the exact ADR, the exact append point, and the append shape per the absorb-by-append precedent — ADR-0005 Revisit #3, ADR-0002 Rules 6/7); (iii) the case for leaving it as mechanism + checklist + memory without tenet articulation. Mind the trap: a tenet whose content is "prose decays" must answer why IT will not decay — what decision does tenet-level articulation change at authoring time (e.g., steering correctness-budget allocation), and what is its enforcement surface?',
      'File each recommendation that is a new tenet as kind "new-tenet"; each fold as kind "amend" on the target ADR; each leave-as-is as kind "note". per_adr: [].',
    ].join('\n'),
  },
]

function newReaderPrompt(d) {
  return [
    CONTEXT2,
    '',
    'YOUR ASSIGNMENT (' + d.key + '): ' + d.focus,
    '',
    d.body,
    '',
    DISCIPLINE,
    '',
    OUTPUT_CONTRACT,
  ].join('\n')
}

function refuterPrompt(p, readerKey, perAdrRationale) {
  return [
    'You are the ADVERSARIAL REFUTER for one proposal in the 2026-06-10 ADR-corpus audit of the LengYue project, repo /home/bork/w/omega. A reader agent (' + readerKey + ') filed the proposal below against the corpus. Your job is to try to REFUTE it. Default to skepticism: a plausible-but-wrong retire/slim/merge that survives is the failure mode you exist to prevent. But do not manufacture refutations — "survives" with a precise required-repair set is a fully legitimate verdict.',
    '',
    'PROPOSAL ' + p.id + ' (kind: ' + p.kind + ', target: ' + p.adr + ')',
    'Summary: ' + p.summary,
    'Details: ' + p.details,
    '',
    'Reader\'s per-document rationale (context): ' + (perAdrRationale || '(none supplied)'),
    '',
    'Run ALL THREE refutation lenses and report each:',
    '1. REFERENCE WEB: enumerate inbound references to the content this proposal removes/moves/rewords — search docs/ (including docs/archive/, docs/worklog/, docs/notes/), frontend/ (source comments, CLAUDE.md, FILES.md, IDENTIFIERS.md), tools/, and the todo DB read-only (psql -h 192.168.122.1 -d todo: SELECT item_id, kind, target FROM refs WHERE kind = \'adr\'; plus items.description ILIKE \'%adr-00NN%\' checks). Which references orphan? Which documents\' meaning silently degrades?',
    '2. CONTENT CUSTODY: for each piece of content removed/relocated/superseded, verify the claimed better home ACTUALLY carries it (read the claimed home end to end). What worked example, exception text, calibration, or reasoning trace loses its home? Does the corpus\'s own convention (ADR-0005 Rule 8 sibling-revisions-over-silent-edits; the Amendments header-line + append-a-rule pattern; point-in-time records never retro-edited) forbid or reshape the proposed edit shape?',
    '3. SUBSTITUTION TEST + FORK: name the failure shape this content guards against in its most general form; list the surfaces the same shape could hit; what does losing/weakening the articulation cost on the WORST surface (not the observed instance)? And: what does an author of the planned generic knowledge flash-card fork lose or gain under this proposal?',
    '',
    'Ground yourself first: read the target document(s) END TO END, and docs/adr-synopsis.md. The evidence digest at ' + DIGEST_PATH + ' is available (read it fully if you use it; cite appendix material only via its pointers). Do NOT read the appendix parts docs/notes/audit/audit-spa-history-lessons-2026-06-10-appendix-p{1,2,3}.md.',
    '',
    DISCIPLINE,
    '',
    'OUTPUT (StructuredOutput): verdict (refuted = must not ship; weakened = ships only in a reduced/reshaped form you specify; survives = ships as proposed), findings (per lens), required_repairs (exact repair set if survives/weakened; "none" if none), report_markdown (standalone, verbatim-appendix-ready).',
  ].join('\n')
}

function trunc(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + ' [...]' : s
}

function rationaleFor(res, adr) {
  const e = (res.per_adr || []).find((x) => x && x.adr && adr && (x.adr === adr || adr.includes(x.adr) || x.adr.includes(adr)))
  return e ? trunc(e.rationale, 2500) : ''
}

function refuteStage(rr) {
  if (!rr) return null
  const all = (rr.res.proposals || []).filter((p) => p && p.kind)
  const core = all.filter((p) => ['retire', 'slim', 'merge'].includes(p.kind))
  const optional = all.filter((p) => ['restructure', 'new-tenet'].includes(p.kind))
  const jobs = []
  for (const p of core) {
    if (budget.remaining() > 120000) jobs.push(p)
    else log('Budget guard: SKIPPING essential refuter for ' + p.id + ' (remaining ' + Math.round(budget.remaining() / 1000) + 'k) — synthesizer must not ship this proposal unverified')
  }
  for (const p of optional) {
    if (budget.remaining() > 450000) jobs.push(p)
    else log('Budget guard: skipping optional refuter for ' + p.id + ' (' + p.kind + '); synthesizer verifies by hand')
  }
  if (jobs.length === 0) return { reader: rr.key, res: rr.res, verifications: [] }
  return parallel(
    jobs.map((p) => () =>
      agent(refuterPrompt(p, rr.key, rationaleFor(rr.res, p.adr)), {
        label: 'refute:' + p.id,
        phase: 'Refute',
        schema: VERIFIER_SCHEMA,
      }).then((v) => (v ? { proposal_id: p.id, proposal_kind: p.kind, proposal_adr: p.adr, lens: 'combined', verdict: v } : null))
    )
  ).then((vs) => ({ reader: rr.key, res: rr.res, verifications: vs.filter(Boolean) }))
}

// --------------------------- control flow ---------------------------

phase('Read')
log('Replaying the two completed readers from cache (r1: 0001+0010, r2: 0002+0008)')
const r1res = await agent(readerPrompt(READERS[0]), { label: READERS[0].label, phase: 'Read', schema: READER_SCHEMA })
const r2res = await agent(readerPrompt(READERS[1]), { label: READERS[1].label, phase: 'Read', schema: READER_SCHEMA })
log('Cached replay done; spent ' + Math.round(budget.spent() / 1000) + 'k, remaining ' + (budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unbounded'))

phase('Digest')
const digest = await agent(DIGEST_PROMPT, { label: 'digest:appendix-corpus', phase: 'Digest', schema: DIGEST_SCHEMA })
if (!digest) throw new Error('Appendix digest agent failed — downstream readers cannot run under the digest regime without it')
log('Digest written to ' + DIGEST_PATH + ' (' + Math.round((digest.digest_markdown || '').length / 1024) + 'KB); spent ' + Math.round(budget.spent() / 1000) + 'k, remaining ' + (budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unbounded'))

phase('Read (digest regime)')
const cachedRefutesPromise = Promise.all([
  refuteStage({ key: 'r1', res: r1res }),
  refuteStage({ key: 'r2', res: r2res }),
])
const freshPromise = pipeline(
  NEW_READERS,
  (d) => agent(newReaderPrompt(d), { label: d.label, phase: 'Read (digest regime)', schema: READER_SCHEMA }).then((res) => (res ? { key: d.key, res } : null)),
  (rr) => refuteStage(rr)
)
const settled = await Promise.all([cachedRefutesPromise, freshPromise])
const results = settled[0].concat(settled[1]).filter(Boolean)
log('Readers + refuters complete: ' + results.length + ' reader blocks; spent ' + Math.round(budget.spent() / 1000) + 'k, remaining ' + (budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unbounded'))

phase('Critique')
const digestText = results
  .map((r) => {
    const verdicts = (r.res.per_adr || [])
      .map((e) => '- ' + e.adr + ': ' + e.verdict + ' — ' + trunc(e.rationale, 700) + '\n  triggers: ' + trunc(e.trigger_status, 500))
      .join('\n')
    const props = (r.res.proposals || [])
      .map((p) => {
        const vs = (r.verifications || []).filter((v) => v.proposal_id === p.id)
        const vsum = vs.map((v) => v.lens + '=' + v.verdict.verdict + ' (' + trunc(v.verdict.findings, 350) + ')').join('; ')
        return '- [' + p.kind + '] ' + p.id + ' on ' + p.adr + ': ' + trunc(p.summary, 500) + (vsum ? '\n  verification: ' + vsum : '')
      })
      .join('\n')
    return '## Reader ' + (r.reader || r.key) + '\nCoverage: ' + trunc(r.res.coverage, 700) + '\nVerdicts:\n' + (verdicts || '(none)') + '\nProposals:\n' + (props || '(none)')
  })
  .join('\n\n')

const criticPrompt = [
  'You are the COMPLETENESS CRITIC for the 2026-06-10 ADR-corpus audit of the LengYue project, repo /home/bork/w/omega. Six readers assessed the ten ADRs + docs/adr-synopsis.md (two from a cached earlier pass under a fuller evidence regime; four under a digest regime where the ~810KB history-audit appendix corpus is cited via a commissioned digest at ' + DIGEST_PATH + '). Retire/slim/merge proposals got one combined-lens adversarial refuter each; restructure/new-tenet refuters ran only if budget allowed; amend/status-change proposals are fact-checked by the synthesizer (who has read the full corpus and the 2026-06-10 worklogs end to end). Below is the digest of all verdicts, proposals, and verification outcomes.',
  '',
  'Your commission: what is MISSING? Specifically:',
  '- A corpus document or dimension not adequately assessed (walk the list: ADR-0001..0010, the synopsis, the derived-summary web, the Revisit-when trigger sweep — the item description says the trigger count is re-derived per sweep, 38 at the last sweep: do the readers\' counts cover all ten and reconcile?).',
  '- The inverse question (new tenets): was it answered with evidence or hand-waved?',
  '- Evidence named in the audit commission left unconsulted: the history audit + its appendix digest, the RCA, the 2026-06-10 worklogs, the adr-effectiveness-audits item description.',
  '- Contradictions between readers that the synthesis must adjudicate (name each pair precisely).',
  '- Proposals that needed verification but did not get it, or verification verdicts that look under-grounded.',
  '- Deliverable-shape gaps: the audit must ship a per-ADR verdict table, the proposed corpus end-state, ready-to-apply amendment text, an explicit "deliberately does not propose" section, a staged-SQL section for the store, and note two gates (maintainer sign-off; the follow-up consolidation review). Anything in the digest that makes one of these impossible or dishonest?',
  '',
  'You may read any repo document to check (read end to end what you cite; READ-ONLY; never backend/qeubo/; psql SELECT only; do NOT read the appendix parts — use ' + DIGEST_PATH + '). Today is 2026-06-10.',
  '',
  '=== DIGEST ===',
  digestText,
  '=== END DIGEST ===',
  '',
  'OUTPUT (StructuredOutput): gaps, contradictions, additional_work (each item: what + why + how to discharge it), report_markdown (standalone, verbatim-appendix-ready).',
].join('\n')

const critic = await agent(criticPrompt, { label: 'completeness-critic', phase: 'Critique', schema: CRITIC_SCHEMA })

log('Critic complete; total tokens spent: ' + Math.round(budget.spent() / 1000) + 'k')

return { results, digest_coverage: digest.coverage, digest_markdown: digest.digest_markdown, digest_notes: digest.notes || '', critic, tokens_spent: budget.spent() }
````````

**Prompt reconstruction rule:** each reader's commission =
`readerPrompt(def)` (r1/r2, original regime) or `newReaderPrompt(def)`
(n1–n4, digest regime) over the definitions in the script above — the literal
concatenation of the regime context, `'YOUR ASSIGNMENT (<key>): <focus>'`,
the assignment body, DISCIPLINE, and OUTPUT_CONTRACT. Each refuter's
commission = `refuterPrompt(p, readerKey, rationaleExcerpt)` where
`rationaleExcerpt` = the first 2,500 characters of the proposing reader's
per-document rationale (reproduced in full in §1; the excerpt boundary is
mechanical). The digest agent's commission is `DIGEST_PROMPT` verbatim. The
critic's commission is the template in the script with the `=== DIGEST ===`
block reproduced verbatim in §4.


---

## §1 · reader:r1

### Coverage (verbatim)

Read END TO END: /home/bork/w/omega/CLAUDE.md (in context); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; docs/adr/0001-state-mutation-and-readonly.md; docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md; docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (incl. verbatim HRA appendix and postscript); docs/worklog/2026-06-10-adr-record-amendments.md; docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md; docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md; docs/notes/audit/perf-audit-game-scroll-2026-05-28.md; docs/worklog/2026-06-10-services-boundary-deny-by-default.md; docs/worklog/2026-06-10-deferral-harvest.md; frontend/CLAUDE.md; docs/archive/TODO-completed-2026-05-06.md (in two passes, lines 1-165 then 166-273, full file covered); the coordinator memory file spa-audit-execution-state.md. PARTIAL, declared: frontend/src/types.ts — header block only (first ~40 lines), cited solely for the barrel's module map and its restated ADR-0001 policy note; frontend/src/store/index.ts and frontend/eslint.config.js — targeted grep/sed verification of specific amendment claims (code files, not documentation; cited only for the verified anchors); frontend/package.json — one-line version check. Work-status DB consulted via read-only SELECTs (items/refs schema, the items behind both ADRs' triggers, legacy_number mapping). NOT read, deliberately: backend/qeubo/** (licensing firewall); docs/worklog/2026-06-10-types-split.md and the audit appendices p1-p3 (not cited; the audit main report and the types.ts barrel header carried what I needed); tools/doc-graph/cochange-advisory.mjs (so I make no claim about what the advisory covers beyond what the synopsis itself states). No file was created, edited, or deleted; no DB write; no performance measurements run (ADR-0009 — all perf numbers relayed below are the cited documents' own captured claims).

### per-document verdict: docs/adr/0001-state-mutation-and-readonly.md — **amend** (verbatim fields)

**rationale:** The decision is healthy and recently, correctly maintained: both 2026-06-10 amendments (trigger-#2 fired-and-recorded; Revisit-#3 response with the writer-enumeration lint) follow the append-never-rewrite convention, and their factual claims verify at HEAD (mutateBoard's re-wrap removed with inline rationale citing the game-scroll audit; mutateReviewSession's re-wrap present at store/index.ts:209; local/store-write-needs-owner at error with templateToggleExemptPrefixes ['session.ui']). The synopsis entry co-changed. The retirement/slimming bar is NOT met for the TS/Vue/Haskell exposition or the three Alternatives: the exposition is the rationale the alternative-rejections rest on, and live trigger #3's escalation terms ('Alternative A / Pinia reconsideration is back on the table') reference the Alternatives directly — cutting them would orphan the trigger logic, and no better home carries that rationale. What does meet the misleading-at-HEAD bar is small and bounded: three retired TODO-numbering handles (one inside live trigger #1), and a missing one-line orientation note for the 2026-06-10 types-catalog split. Amend; everything else keep as-is.

**load_bearing:** The decision core (containers drop readonly, value objects keep it; 'if the architecture writes to it, the type admits it'); the mutator-convention benefits list as amended; the Revisit section with its two 2026-06-10 in-place records (now the corpus's worked example of trigger bookkeeping done right, alongside ADR-0005/0009); the Alternatives A-C (referenced by trigger #3's still-live escalation terms); the Context exposition (the three concerns are what make both the decision and the rejections intelligible — TS readonly being compile-time-only is the load-bearing premise of 'we lose nothing real by dropping the annotation'); the Exception section (now also config in the lint: templateToggleExemptPrefixes, probe-verified load-bearing per the multi-writer worklog).

**dead_or_misleading:** Misleading at HEAD: 'TODO item 27-full' (Revisit #1), 'TODO item 27-min (shipped)' and 'TODO item 17 (shipped)' (Related). The TODO numbering is retired; the handles resolve only via docs/archive/TODO-completed-2026-05-06.md, and the live one (27-full) has a stable successor the trigger does not name: work-status item item-27-etag-multitab (open/future, legacy_number 27). In a fork clone without the maintainer's todo DB the handles resolve to nothing — exactly the failure shape frontend/CLAUDE.md's stable-handles rule and audit §3.25 name. Nothing else is dead or misleading; the Context's 'src/types.ts marked essentially every field readonly' is a historical claim that remains true as history, though a fork author could misread the single-file catalog as current (hence the proposed one-line dated note).

**trigger_status:** 5 triggers re-derived (matches the 2026-06-10 sweep's per-ADR count of 5). #1 multi-tab concurrency: NOT FIRED — multi-tab is still not a workflow; the parked design is work-status item item-27-etag-multitab (open/future); trigger cites the retired '27-full' handle (amend proposed). #2 profiling reveals reactivity hot spots: FIRED — recorded in place 2026-06-10 (Amendments header + dated note; response was the mutateBoard re-wrap removal, not a readonly revisit; trigger correctly kept live). #3 mutator convention breaking down: NOT FIRED — response recorded in place 2026-06-10 with the measured writer baseline (engine 20→0 via the owner module; profile 10 annotated; boards 0) and the still-live re-fire terms (aliased-root writes producing state bugs). #4 Pinia migration for other reasons: NOT FIRED — no Pinia work exists; frontend/CLAUDE.md still records 'No Pinia'; no work-status item matches. #5 TS gains a real immutability primitive: NOT FIRED — no such language feature in use or in sight at HEAD. No unrecorded firings found.

**fork_fitness:** Good, with one cheap repair. The policy itself is domain-free (Vue-3 reactivity grain + named mutators + writer-enumeration lint), and the fork is a fork of this same SPA, so the ADR travels as-is; the container/value-object lists are exemplars whose Go-bound members (BoardState, GameNode, Move, Point) get swapped while the rule of thumb holds unchanged. Verified at HEAD that every named type still exists post-split (types/game.ts, types/engine.ts, types/cards.ts, store/schema.ts) and that the types.ts barrel header restates the ADR-0001 two-category readonly policy and maps the new module homes — so a fork author following the ADR into the code lands correctly. The two fork hazards are the unresolvable TODO handles (no todo DB in a clone) and the implicit single-file-catalog picture; both are covered by the proposed amendments.

### per-document verdict: docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md — **amend** (verbatim fields)

**rationale:** The tenet is sound, well-evidenced, and freshly repaired (the 2026-06-10 amendment removed the harness-envelope artifact lines and corrected the render-count path — both verified at HEAD, including the tests/integration/render-count/ directory). Its Vue scoping is right: the Scope section already states the honest generalization ('analogues wherever a reactive framework couples a render to a read') while scoping normative force to where the recurrences happened, and both rules are domain-agnostic. The verbatim corollary remains the canonical statement: frontend/CLAUDE.md's render-locality section explicitly presents itself as 'the practitioner-facing form' of ADR-0010 and instructs reading the ADR end to end, so the duplication is an acknowledged derived projection, not an ADR-0005 Rule-1 violation. The one record gap meeting the amend bar: Revisit #4 still reads as if the layering tension has no work-status reality ('not resolved here', no record named), while at HEAD the record it lacked exists and has partly shipped — item services-boundary-deny-by-default (closed shipped 2026-06-10, PR #378) inverted the boundary to deny-by-default and deliberately re-checked the trigger ('no case the split cannot classify appeared'). A dated in-place note is the project's own convention for exactly this. Companion finding: the item's step (b) — relocating reactive-state modules out of services/, which is this trigger's named collapse-into-one-principle pathway — lost its open record when the item closed; no successor item exists (proposal r1-adr0010-step-b-deferral-record).

**load_bearing:** Both rules and the authoring-time questions; the corollary verbatim (render vs patch — also projected into frontend/CLAUDE.md and woven into its v-memo footgun entry); the role-not-mechanism test; the Context recurrence narrative (the tenet's existence-proof — a describing-only postmortem did not stop TreeWidget reproducing the bug days later, per the green-arc audit's Question 2/P1); the ADR-0009 sibling relationship (render≫patch as the diagnosing measurement); Revisit #4's tension description, cross-referenced from frontend/CLAUDE.md's layering section ('see ADR-0010's Revisit when… #4'); the Negative-consequences honesty that the render-count harness and lint host are partial mechanisations only.

**dead_or_misleading:** Nothing dead. Two soft spots, neither rising past note/amend level: (1) Revisit #4's silence about the now-existing (and now-closed) work-status record — a reader at HEAD re-derives or re-files what is already paid for; (2) the header's hand-maintained ordinal census ('the eighth tenet … after ADR-0002 …'), mirrored by the synopsis's 'The eight tenets' — accurate today, but the L5 mirror shape: any new tenet (or an ADR-0007 status outcome from this audit) forces co-changes in both places.

**trigger_status:** 4 triggers re-derived (matches the 2026-06-10 sweep's per-ADR count of 4). #1 lint mechanises the read-locality check: NOT FIRED — the ESLint host now carries four local rules (clear-needs-ownership, gate-prop-needs-default, module-intent-in-script-setup, store-write-needs-owner) but none is the high-frequency-read heuristic this trigger names. #2 Vue Vapor adoption: NOT FIRED — frontend is on vue ^3.5.31, no Vapor anywhere in the build config. #3 new high-frequency source class: NOT FIRED on available evidence; partially UNASSESSABLE — no dedicated source sweep was run for this audit, but no new streaming/tick source appears in the 2026-06 worklogs. #4 layering tension reconciled or irreducible: NOT FIRED — the shipping arc deliberately re-checked it and found no unclassifiable case — but materially developed and unrecorded in the ADR: the deny-by-default inversion shipped (strengthening the described split; REACTIVE_STATE_EXEMPTIONS is now the class's canonical enumeration), the work-status record exists and is closed, and the step-(b) relocation pathway is currently recorded nowhere open. Dated note proposed; no firing went unrecorded in the strict sense.

**fork_fitness:** Among the most fork-portable records in the corpus. Both rules target exactly the surfaces the generic flash-card fork keeps (audit L7: the SR-orchestration flow and the generic charting machinery survive — data-dense visuals and high-frequency reactive reads are precisely that territory). The Go-named components (HeatmapChart, BoardTab, TreeWidget) function as evidence and worked examples, not normative content; a fork author replacing them loses nothing of the rule. The Vue scoping matches the fork (a Vue SPA). No fork-motivated change needed; the only fork-relevant repair is making Revisit #4's pointers resolve in a clone (item id + slug in the proposed note, per the stable-handles convention).

### proposal `r1-adr0001-retire-todo-numbering-handles` [amend] → docs/adr/0001-state-mutation-and-readonly.md (verbatim)

**summary:** Re-point the three retired TODO-numbering handles (Revisit #1's live '27-full' pointer; the Related section's '27-min' and '17' shipped pointers) to stable handles per the stable-handles convention (audit §3.25; frontend/CLAUDE.md's id-travels-with-slug rule), so they resolve at HEAD and in a fork clone without the maintainer's todo DB. One dated Amendments-header line covers all three.

**details:** Revisit-when #1: replace '(ETag-style, see TODO item 27-full)' with '(ETag-style — parked as work-status item `item-27-etag-multitab`, the ETag multi-tab coordination layer; successor of the retired TODO numbering''s item 27-full, design sketch in the `SyncService::sendSync()` comment)'. Related bullet 2: replace 'TODO item 27-min (shipped): the last-write-wins single-tab invariant documented on `SyncService::sendSync()` is a consequence…' with 'The last-write-wins single-tab invariant documented on `SyncService::sendSync()` (retired TODO numbering, item 27-min; archived record in `docs/archive/TODO-completed-2026-05-06.md`) is a consequence of the same "mutation-first, discipline via convention" model.'. Related bullet 3: replace 'TODO item 17 (shipped): the collapse of…' with 'The collapse of `SyncService`''s three-channel watcher into one (retired TODO numbering, item 17; same archive) is enabled by the fact that mutations all land in the same reactive tree, making a single watcher sufficient.'. Amendments header: 'Third amendment, 2026-06-10 — the three retired TODO-numbering handles (Revisit #1, Related ×2) re-pointed to stable handles: the work-status item id for the live multi-tab trigger, the archive snapshot for the two shipped items. No content change; per the stable-handles convention (history-lessons audit §3.25).'. Verified mapping: item-27-etag-multitab is open/future with legacy_number 27; items 27-min and 17 resolve in the archive's Frontend table. Sibling observation for the reader who owns ADR-0002: docs/adr/0002-fail-loudly.md:404 carries the same shape ('TODO item 21 (shipped)').

### proposal `r1-adr0001-types-catalog-split-note` [amend] → docs/adr/0001-state-mutation-and-readonly.md (verbatim)

**summary:** One dated parenthetical in the Context section recording that the single-file type catalog the ADR describes split on 2026-06-10, so a fork author does not go looking for the policy in a 2,300-line types.ts. Can ride in the same PR as the handles amendment.

**details:** In Context, after 'Before this decision, `src/types.ts` marked essentially every field of every interface as `readonly`.', append: '*(Catalog note, 2026-06-10: the single-file catalog has since split along its banner seams into `src/types/` domain modules plus `src/store/schema.ts`, with `types.ts` remaining as the barrel — history-lessons audit §3.15. The two-category `readonly` policy this ADR sets is restated in the barrel''s header; the historical claim above describes the pre-split file.)*'. Verified at HEAD: the barrel header carries the module map and the ADR-0001 policy restatement; every container/value-object type the Decision names still exists under the new homes (BoardState in types/game.ts, EngineState in types/engine.ts, ReviewSessionData/EbisuModel in types/cards.ts, AppSettings/UISession/GlobalStore in store/schema.ts, Move in types/game.ts).

### proposal `r1-adr0010-revisit4-dated-note` [amend] → docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md (verbatim)

**summary:** A dated in-place note under Revisit-when #4 recording that the work-status record the trigger lacked now exists and its step (a) shipped, that the trigger was deliberately re-checked and has not fired, and where the collapse-into-one-principle pathway (the state/ relocation) now stands. Follows the convention ADR-0001's #2/#3 notes set; one Amendments-header line.

**details:** Append to Revisit-when #4: '**(Record note, 2026-06-10 — trigger not fired.)** The work-status record this trigger had lacked now exists: item `services-boundary-deny-by-default` (closed shipped 2026-06-10, PR #378) inverted the component→services import boundary to deny-by-default, with the reactive-state class exempted via one named constant (`REACTIVE_STATE_EXEMPTIONS`, now the class''s canonical enumeration) — strengthening exactly the split described above. That arc deliberately re-checked this trigger: no case the split cannot classify appeared, so the trigger stays live on its own terms. The collapse-into-one-principle pathway named above — relocating the reactive-state modules out of `services/` (the item''s step (b)) — remained outstanding at that item''s closure; its record is <handle per r1-adr0010-step-b-deferral-record, or: the closed item''s description and `docs/worklog/2026-06-10-services-boundary-deny-by-default.md`>.' Amendments header line: 'Second amendment, 2026-06-10 — Revisit #4 record note: the trigger''s anticipated work-status record now exists (`services-boundary-deny-by-default`, shipped); trigger re-checked, not fired. No content change.' The final sentence's handle depends on the maintainer's call on the companion proposal; if step (b) is deliberately dropped, the note should say that instead.

### proposal `r1-adr0010-step-b-deferral-record` [note] → docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md (verbatim)

**summary:** The state/ relocation (step (b) of the services-boundary item — ADR-0010 Revisit #4's named resolution pathway) lost its open work-status record when the item closed as shipped on PR #378 merge. No successor item exists; the deferral now lives only in a closed item's description and a worklog — the audit's own L3 deferral-evaporation shape, reproduced inside the audit's execution round.

**details:** The shipping worklog wrote 'the item stays open (step (b) outstanding)' but the store-close-on-merge convention closed it (state=closed, resolution=shipped, closed_on=2026-06-10). Searched the store for any successor (state/ relocation, REACTIVE_STATE_EXEMPTIONS, reactive-state) — none. Recommend the maintainer either file a step-(b) item (e.g. `reactive-state-modules-relocation`, open/future, scope frontend, refs: design-note→audit §3.11, worklog→docs/worklog/2026-06-10-services-boundary-deny-by-default.md) or record a deliberate drop; the r1-adr0010-revisit4-dated-note text then cites whichever handle results. Read-only audit: proposed, not executed.

### proposal `r1-frontend-claudemd-identifier-map-staleness` [note] → frontend/CLAUDE.md (verbatim)

**summary:** Outside the assigned corpus but found while verifying it end to end: the 'Identifier map' section still motivates IDENTIFIERS.md with 'src/types.ts mixes the identifier types in with value objects, state containers, and the GlobalStore schema' — stale since the 2026-06-10 split (identity brands live in types/ids.ts; the store schema in store/schema.ts; types.ts is the barrel).

**details:** One-sentence fix for the owning arc (the types-split follow-up or the doc-hygiene arc), e.g.: 'It exists because the type catalog — now the `src/types/` modules behind the `types.ts` barrel — spreads identifier types across domain modules, making it an inconvenient place to look up…'. Not bundled with the ADR amendments; named here so it does not silently evaporate (L3).

### proposal `r1-tenet-ordinal-census-fragility` [note] → docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md (verbatim)

**summary:** ADR-0010's Genre header hand-enumerates the tenet roster ('the eighth tenet in this codebase, after ADR-0002 … ADR-0009'), and the synopsis closes with 'The eight tenets form a coherent posture'. Both are accurate today but are the L5 hand-maintained-mirror shape: any new tenet this audit mints, or a status outcome on ADR-0007 (still Proposed yet counted in both censuses), forces co-changes in both places.

**details:** No change proposed now. For the coordinator merging the per-reader proposals: if any reader's new-tenet proposal is accepted, or ADR-0007's status changes in a way that affects its tenet standing, the ADR-0010 header ordinal and the synopsis's closing census must co-change in the same PR (the cochange advisory flags the synopsis on ADR edits per the synopsis's own header; whether it covers the header ordinal inside a different ADR is not something this reader verified).

### Report (verbatim)

`````markdown
# r1 — The frontend-reactivity records: ADR-0001 and ADR-0010 (generic ADR-corpus audit, 2026-06-10)

Reader r1 of the commissioned ADR-corpus audit (work-status item `adr-effectiveness-audits`). Assignment: ADR-0001 (state mutation / `readonly` policy — a Decision, amended twice 2026-06-10) and ADR-0010 (render locality + canvas — a Tenet, amended 2026-06-10). Question: retire, slim, merge, restructure, amend, change status, or keep — judged against the project as it stands at HEAD and against the maintainer's planned generic knowledge flash-card fork. Read-only; proposals only.

## Coverage

Read end to end: the umbrella `CLAUDE.md`; `docs/adr-synopsis.md`; the 2026-06-10 history-lessons audit (main report); both assigned ADRs; the five commissioned evidence documents (`2026-06-10-multi-writer-slots-get-owners.md` including its verbatim appendix and postscript, `2026-06-10-adr-record-amendments.md`, `opus-audit-green-perf-arc-2026-05-31.md`, `postmortem-render-coupling-at-composition-nodes-2026-05-29.md`, `perf-audit-game-scroll-2026-05-28.md`); and four further documents pulled in by the questions: `2026-06-10-services-boundary-deny-by-default.md`, `2026-06-10-deferral-harvest.md`, `frontend/CLAUDE.md`, and `docs/archive/TODO-completed-2026-05-06.md` (read in two passes covering the whole file). Partial, declared: `frontend/src/types.ts` header block only (the barrel's module map and policy note); targeted grep/sed verification in `frontend/src/store/index.ts`, `frontend/eslint.config.js`, and `frontend/package.json` (code, cited only for the verified anchors). The work-status store was consulted by read-only SQL. Not read: `backend/qeubo/**` (firewall); the audit appendices p1–p3 and the types-split worklog (not cited). No perf measurement was run; every number below is a cited document's own captured claim.

## Verdicts

| Document | Verdict | One line |
|---|---|---|
| ADR-0001 | **amend** (small, bounded) | Decision healthy, both 2026-06-10 amendments verify at HEAD; the only defects are three retired TODO-numbering handles (one inside a live trigger) and a missing one-line note on the types-catalog split. |
| ADR-0010 | **amend** (small, bounded) | Tenet sound and freshly repaired; Revisit #4 needs a dated note now that its anticipated work-status record exists, shipped its step (a), and lost its step-(b) record at closure. |

Neither document comes near the retirement/slimming/merge bar, and merging the two into each other or into anything else would be a category error — one is a mutation-policy Decision, the other a render-discipline Tenet; their only shared trait is the substrate (Vue reactivity).

## ADR-0001 — findings

**The amendments hold up under verification.** The Revisit-#2 record (fired; response was removing `mutateBoard`'s identity re-wrap, not revisiting `readonly`) matches the game-scroll audit's Arc-1 finding and the inline comment now in `mutateBoard`. The corrected benefits bullet is accurate at HEAD: `mutateReviewSession` still re-wraps (`store/index.ts:209`); `mutateBoard` does not. The Revisit-#3 response (the `local/store-write-needs-owner` lint) exists at `error` with the template-toggle exception carved out as config (`templateToggleExemptPrefixes: ['session.ui']`) — the multi-writer worklog's probe evidence shows the carve-out is load-bearing, not a dead branch. The synopsis entry co-changed. This ADR is now, alongside ADR-0005/0009, the corpus's worked example of trigger bookkeeping done right — worth saying because the same audit found two other ADRs that rotted silently (L6).

**The exposition and Alternatives are load-bearing, not educational filler.** Applying the retirement bar honestly: the TS-`readonly`-is-compile-time-only analysis is the premise of the decision's central claim ("we lose nothing real by dropping the annotation; we gain compile honesty") and of Alternative A's rejection; the Vue-Proxy-grain analysis is the premise of Alternative B's rejection and of the perf reasoning trigger #2's record now confirms; the Haskell contrast backs the "Not goals" section. Live trigger #3's escalation terms ("Alternative A / Pinia reconsideration is back on the table") reference the Alternatives directly — cut them and the trigger logic dangles. The content is neither dead, nor delegated to a better home (none exists), nor misleading. Audit lesson L1 ("prose disciplines decay; mechanisms stick") cuts against guidance prose without enforcement, not against rationale prose in a decision record; the enforcement half of this ADR was mechanized this same day. Keep the body.

**The misleading bit: the retired TODO numbering.** Three handles — "TODO item 27-full" (Revisit #1, the live one), "TODO item 27-min (shipped)" and "TODO item 17 (shipped)" (Related). The numbering is retired; at HEAD these resolve only through `docs/archive/TODO-completed-2026-05-06.md`, and the live trigger's pointer has a stable successor it does not name: work-status item `item-27-etag-multitab` (open/future, `legacy_number` 27). In a fork clone — no todo DB — they resolve to nothing, which is precisely the failure shape `frontend/CLAUDE.md`'s stable-handles rule and audit §3.25 name. Proposal `r1-adr0001-retire-todo-numbering-handles` carries ready-to-apply text. (Sibling observation for the ADR-0002 reader: `0002-fail-loudly.md:404` carries the same "TODO item 21" shape.)

**Trigger walk (5 re-derived, matching the 2026-06-10 sweep's count).** #1 multi-tab: not fired; parked as `item-27-etag-multitab`; stale handle in the trigger text. #2 reactivity hot spots: fired, recorded in place 2026-06-10. #3 mutator breakdown: not fired; response recorded in place 2026-06-10 with the measured writer baseline (engine 20→0, profile 10 annotated, boards 0) and still-live re-fire terms. #4 Pinia for other reasons: not fired (no Pinia anywhere; `frontend/CLAUDE.md` still records "No Pinia"). #5 TS immutability primitive: not fired. No unrecorded firings.

**Is the amendment record sufficient, or does the body need more?** Sufficient. The convention used — header entry, inline *(Mechanized 2026-06-10)* annotation on the exact vigilance bullet, dated note at the trigger carrying the numbers and the still-live terms — keeps the body readable and the history auditable. Restating the lint in the Decision body would create a second census of the writer sets, which is the L5 mirror shape; the lint config is the canonical enumeration and the ADR correctly points at it.

**Fork fitness.** The policy is domain-free; the container/value-object lists are exemplars whose Go-bound members get swapped while the rule of thumb holds. I verified every type the Decision names still exists post-split (`types/game.ts`, `types/engine.ts`, `types/cards.ts`, `store/schema.ts`), and the `types.ts` barrel header both maps the new homes and restates this ADR's two-category policy — so the code-side trail is intact. The two fork hazards (unresolvable handles; the implicit single-file-catalog picture in Context) are covered by the two proposed amendments (`r1-adr0001-types-catalog-split-note` adds the one-line dated catalog note).

## ADR-0010 — findings

**The record is sound and its 2026-06-10 repair verified.** The harness path now reads `tests/integration/render-count/` and the directory exists; the artifact lines are gone; the CI grep is recorded. The Context's evidence chain checks out against its three backing documents: the render-coupling postmortem (whose Recommendation 1 this tenet adopts, with the adoption note added back into the postmortem), the green-arc audit (Question 2/P1, including the corollary's wording, which the ADR carries verbatim as P1 instructed), and the green-arc worklogs (all five Related filenames exist). The relayed numbers (TreeWidget 762 ms render vs 59.8 ms patch; BoardTab 782 ms; timeline 304 ms) match their sources.

**Vue scoping: right as written.** The Scope section already states the honest generalization ("analogues wherever a reactive framework couples a render to a read") while scoping normative force to the Vue SPA where the recurrences happened. Both rules are framework-disciplines, not domain rules; nothing Go-specific is normative. For a corpus that applies project-wide, a tenet whose subject matter is frontend rendering is correctly scoped to the frontend — the same way ADR-0001 is.

**The corollary's canonical home: still ADR-0010.** `frontend/CLAUDE.md`'s render-locality section reproduces the corollary verbatim but explicitly as "the practitioner-facing form," instructs reading the ADR end to end, and labels the corollary's origin. That is the acknowledged-derived-projection pattern the synopsis itself uses, not an ADR-0005 Rule-1 violation. Residual risk is the usual mirror drift if the corollary is ever reworded — bounded by its brevity, and the audit's §3.12 already settled that the canonical home is the ADR.

**Revisit #4 is the one record gap.** The trigger's text ends "Surfaced per ADR-0002; not resolved here," with no work-status pointer — accurate when written, stale at HEAD. The history-lessons audit's §3.11 item (`services-boundary-deny-by-default`) was explicitly "the work-status record ADR-0010 Revisit #4 has lacked"; it shipped step (a) on PR #378 (deny-by-default inversion, `REACTIVE_STATE_EXEMPTIONS` as the class's canonical enumeration) and its worklog deliberately re-checked this trigger: not fired, the split classified every case, the prose in both the ADR and `frontend/CLAUDE.md` "stays accurate without edits." I agree on the prose — but the trigger's missing pointer is now a real gap: a reader at HEAD cannot find the paid-for record without grepping. Proposal `r1-adr0010-revisit4-dated-note` adds the dated note in the project's own convention.

A companion finding the dated note depends on: **step (b) — the `state/` relocation, this trigger's named "collapse into one coherent principle" pathway — currently has no open record.** The worklog wrote "the item stays open (step (b) outstanding)," but the close-on-merge store convention closed the item as shipped; no successor item exists (searched the store), and the deferral harvest did not cover it. That is the audit's own L3 deferral-evaporation shape reproduced inside the audit's execution round. Proposal `r1-adr0010-step-b-deferral-record` asks the maintainer to file a successor or record a deliberate drop, so the ADR note can cite a handle that resolves.

**Trigger walk (4 re-derived, matching the sweep's count).** #1 read-locality lint: not fired — the ESLint host now carries four local rules, none of them the high-frequency-read heuristic. #2 Vapor: not fired — `vue ^3.5.31`, no Vapor. #3 new high-frequency source class: not fired on available evidence; partially unassessable (no dedicated source sweep run; none appears in the 2026-06 worklogs). #4 layering tension: not fired, per the shipping arc's deliberate re-check — but materially developed and unrecorded in the ADR, as above.

**Fork fitness.** Among the most fork-portable records in the corpus: both rules target exactly the surfaces the generic flash-card fork keeps (audit L7 — the SR flow and the generic charting machinery), the Go-named components are evidence rather than normative content, and the fork is a Vue SPA so the scoping carries over unchanged. The only fork-relevant repair is making Revisit #4's pointers resolve in a clone (id + slug in the proposed note).

## Corpus-level answers from this corner

**Slim/merge/retire:** no. Both records earn their length; what is wrong with them is three dead handles, one missing dated note, and two one-line catalog notes.

**New tenet:** none warranted from the frontend-reactivity evidence. The two paid-for lesson clusters in my assigned evidence are already absorbed in the corpus's preferred shapes: render-coupling *is* ADR-0010 (minted exactly when the describing-only postmortem proved insufficient), and the multi-writer/ownership lesson (L2) was folded into ADR-0001 by amendment plus mechanization rather than minted as a tenet — which I judge correct: a "state slots have owners" tenet would substantially duplicate ADR-0001's mutator convention and `frontend/CLAUDE.md`'s resource-ownership discipline, and ADR-0008's negative register counsels against fabricating a new category when existing homes carry the content. The Revisit-#3-response pattern (record the response in place, keep the trigger live, point at the mechanism) looks like the right template for the rest of the corpus.

**Incidental finds, named so they don't evaporate:** (1) `frontend/CLAUDE.md`'s Identifier-map section still says `src/types.ts` "mixes the identifier types in with value objects, state containers, and the `GlobalStore` schema" — stale since the split (proposal `r1-frontend-claudemd-identifier-map-staleness`, for the owning arc). (2) ADR-0010's header ordinal ("the eighth tenet, after …") and the synopsis's "The eight tenets" are hand-maintained censuses that must co-change if this audit mints a tenet or changes ADR-0007's standing (proposal `r1-tenet-ordinal-census-fragility`, for the coordinator).

## Proposals (summary; full text in the proposals record)

1. `r1-adr0001-retire-todo-numbering-handles` — amend: re-point the three retired TODO handles to stable handles (`item-27-etag-multitab`; the archive snapshot), ready-to-apply text supplied.
2. `r1-adr0001-types-catalog-split-note` — amend: one dated parenthetical in Context on the 2026-06-10 catalog split; can ride in the same PR.
3. `r1-adr0010-revisit4-dated-note` — amend: dated record note under Revisit #4 (record exists, step (a) shipped, trigger re-checked and not fired, step-(b) pathway's standing), text supplied; final pointer depends on item 4.
4. `r1-adr0010-step-b-deferral-record` — note: file a successor item for the `state/` relocation or record a deliberate drop; the deferral currently lives only in a closed item's description.
5. `r1-frontend-claudemd-identifier-map-staleness` — note: stale motivation sentence in `frontend/CLAUDE.md`, for the owning arc.
6. `r1-tenet-ordinal-census-fragility` — note: the two tenet-roster censuses co-change with any new-tenet or ADR-0007 outcome.

All proposals are bounded record repairs in the corpus's own amendment conventions; none changes a decision. The maintainer signs off before anything is applied.

License: Public Domain (The Unlicense).
`````


---

## §1 · reader:r2

### Coverage (verbatim)

Read END TO END: umbrella CLAUDE.md and frontend/CLAUDE.md (both supplied in context); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; docs/adr/0002-fail-loudly.md; docs/adr/0008-classification-discipline.md; docs/adr/0005-documentation-discipline.md (read in full to verify the Rule 9 marker retirement before citing it); docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; docs/notes/postmortem/postmortem-knob-registry-qeubo-domain-2026-05.md; docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md; docs/worklog/2026-05-14-popover-hover-finickiness.md; docs/worklog/2026-06-10-refs-kind-audit.md; docs/pre-merge-checklist.md; docs/notes/decisions-deferred.md; docs/handoff-current.md; docs/TODO.md; docs/rfcs/0001-adr-meta-review.md; docs/archive/notes/frontend-source-tree-reorganization.md (read in full before citing it as the re-target for ADR-0008's memory citation). Consulted ROW-LEVEL only (disclosed, per the sanctioned modes or as targeted verification, with no claims made about unread portions): docs/doc-graph-report.md (generated validator report — row-level sanctioned); docs/archive/TODO-completed-2026-05-06.md (rows for items 20/21/29/30 only, to verify the pre-store item numbers resolve there); frontend/eslint.config.js (header block lines ~130–300 plus grep of the rule blocks — a source file consulted for the mechanization census, not a doc consumed for orientation); frontend/src/services/backend-service.ts (grep only, to verify the 34b fallback chain is gone). Mechanical checks: directory listings under docs/notes/, docs/archive/notes/, docs/notes/design/, the maintainer-local memory directory; a session-history grep establishing feedback_classification_chestertons_fence.md once existed (created 2026-05-11) and is now absent; a dependency grep establishing no Sentry/error-reporting adoption; read-only SQL against the todo store (items adr-effectiveness-audits, adr-record-amendments-2026-06, cast-hygiene-lint, band-conformance-ci-check, vue-lifecycle-footgun-guards, code-comment-stable-handles). Deliberately NOT read: anything under backend/qeubo/ (licensing firewall); the history audit's verbatim appendices p1–p3 (the main report sufficed for my questions); docs/rfcs/README.md; ADR-0009 and ADR-0010 themselves (outside my assignment — where my report characterizes them, the characterization is attributed to the synopsis or the history audit, not to a direct read).

### per-document verdict: docs/adr/0002-fail-loudly.md — **amend** (verbatim fields)

**rationale:** The decision core (loudness hierarchy, seven rules, three exceptions, the what-it-does-NOT-mean fence) is sound, heavily load-bearing, and none of it is contradicted by six weeks of evidence — the RCA and the history audit both treat it as the reference frame, not the defect. The commissioned slim question is answered KEEP: Rule 7's ~86 lines (rule + provisional-home paragraph + retirement note) are the corpus's worked example of its own append discipline (Rule 6 applied to Rule 7's own placement), and the retirement note carries one fact recorded nowhere else — that the relocation resolved via the standalone-ADR option rather than the tenet-space-refactoring alternative. The operational channel list and the author's verbatim articulation are duplicated into ADR-0008 deliberately (two registers, two homes, mutual non-subsumption stated in both documents), so the duplication is architecture, not rot. What does need fixing is reference decay around the unchanged core: a pre-umbrella Scope line that is misleading at HEAD, three dangling relative cross-references invisible to the doc-graph validator (it extracts docs/-rooted mentions, not ../ relatives), unanchored pre-store TODO item numbers, a Negative consequence ('policy, not an enforced mechanism') that is now only half-true after the 2026-06 mechanization wave, retired design-note marker vocabulary in Rules 6/7, and Exception 3's worked example having since been removed on schedule (a completion worth recording, not a defect).

**load_bearing:** The most-cited tenet in the corpus. CLAUDE.md names it first among the authoritative ADRs and extends it to documentation consumption and debugging; the loudness hierarchy and Rules 1–5 are the project's error-handling vocabulary (the eslint config header justifies four error-level rules in ADR-0002 terms); Rule 6 is the append-not-supersede convention every ADR amendment in the corpus follows; Rule 7 is the resolution target of the pre-merge checklist §F, ADR-0008 Rules 1/3 and Related, both knob postmortems' References, the hover worklog, the refs-kind worklog, and the history audit §3.14/§5. The exceptions list is the calibration reference for live questions (audit §3.6's loudness-terminal-level decision).

**dead_or_misleading:** Misleading at HEAD: (1) Scope line — 'Applies to the frontend (gogui) and, as a design aspiration, to ... the spaced-repetition backend' predates the umbrella; handoff-current and CLAUDE.md apply the tenet project-wide including the proxy. (2) Three dangling relative refs: ../notes/analysis-persistence-plan.md (now docs/archive/notes/design/analysis-persistence-plan.md; the feature shipped per handoff's integration section) and Rule 7's two postmortem citations (../notes/postmortem-knob-*.md — files moved to docs/notes/postmortem/). None appear in doc-graph-report.md, so the validator will not catch them. (3) 'TODO item 21/20', 'items 29 + 30' resolve only against docs/archive/TODO-completed-2026-05-06.md (verified rows exist); the ADR gives no anchor and the live store has no such numbers. (4) Negative bullet 'the tenet is a policy, not an enforced mechanism' — at HEAD no-floating-promises, switch-exhaustiveness-check, the G1 message-reparse ban, the any-assertion ban, two writer/ownership local rules, the work-status table constraints, and the doc-graph freshness gate all enforce ADR-0002 registers mechanically. (5) Rule 6/Rule 7 name the design-note: revised marker vocabulary retired by ADR-0005 Rule 9 (2026-06-02), and Rule 7's 'TODO entry' channel now means a work-status store item. (6) Exception 3's fallback chain no longer exists in backend-service.ts (removed on schedule). Dead: nothing — no rule or exception is dead.

**trigger_status:** Re-derived trigger count: 4. (1) 'User-visible warnings become spammy in practice' — UNASSESSABLE: user-report-dependent; no warning-fatigue report exists in any document read, and the history audit §8 records the same non-assessability. (2) 'Multiple unrelated anomalies collapse into one useless message' — NOT FIRED: no postmortem/worklog records the pattern; the ApiError arc preserved per-status specificity. (3) 'A specific domain emerges where silent fallback genuinely is the right answer' — NOT FIRED: no new exception adopted since authoring; the one live calibration question (audit §3.6, loud-warn vs throw at the enrichment merge boundary) is loudness-level selection within the hierarchy, not a silent-fallback domain; Exception 3's worked example completed its scheduled removal rather than a new domain emerging. (4) 'The codebase adopts a structured error-reporting service (e.g., Sentry)' — NOT FIRED: verified no such dependency; console + pushSystemMessage remain the channels. No firing is recorded in the ADR and none needed to be — consistent. Gap worth noting: the change that actually happened (partial mechanization) is not covered by any of the four triggers; proposal r2-adr0002-mechanization-register adds it as trigger #5.

**fork_fitness:** High after the Scope amendment. The tenet is fully domain-agnostic — the hierarchy, rules, and exception rules-of-thumb carry no Go or game vocabulary; the Context examples are project-historical but exemplary, not normative. Two fork-relevant defects: the Scope line would tell a fork author the tenet is frontend-only-plus-aspiration (wrong), and the pre-store item numbers / maintainer-local store references need the in-repo anchors the stable-handles convention (audit §3.25) prescribes, since a fork definitionally lacks the maintainer's todo DB. Rule 7 + ADR-0008 are if anything more salient for the fork: re-tagging the band vocabulary against the any-knowledge-domain test (audit L7) is exactly the closest-match-refusal work these rules govern.

### per-document verdict: docs/adr/0008-classification-discipline.md — **amend** (verbatim fields)

**rationale:** A young tenet (2026-05-17) that the subsequent weeks validate rather than erode: the refs-kind arc (2026-06-10) is a clean worked instance of the positive register operating against a mechanically closed vocabulary — gap surfaced per Rule 1, vocabulary revised by maintainer sign-off, precedent-following closest-match retired — and the history audit's own §5 vocabulary wrinkle and this audit commission's verdict-vocabulary rule both operationalize it. The two-register structure, the substitution test, and the exceptions all stand. The defects are referential, and one is serious: the substrate-4 citation points at a maintainer-local memory file (feedback_classification_chestertons_fence.md) that resolves in NO clone of the repo and — verified — no longer exists even in the maintainer's memory directory; the same unlocatable 'umbrella's memory' is leaned on again in Rule 2 for the earn-your-place companion rule. Both records exist in fuller form in-repo at docs/archive/notes/frontend-source-tree-reorganization.md (Option E; Implementation outcome decision point 2, which records the useNavigation override plus five further flat-lifts on the same principle). A tenet about honest reference to vocabularies citing an unresolvable authority for its own substrate is the kind of defect it would itself flag. Second: both Exceptions name the design-note: planned / design-note: revised markers that ADR-0005 Rule 9 retired on 2026-06-02. Third: Revisit #4 has partially fired, unrecorded (the ADR has no Amendments header at all).

**load_bearing:** Home of the broader classification principle ADR-0002 Rule 7 instantiates; the substitution test is pre-merge checklist §E and the severity rule postmortems calibrate against; ADR-0005 Rule 9 cites 'the classification threshold ADR-0008 governs' for the design/consult taxa extraction; the refs-kind worklog files its change 'per ADR-0002 Rule 7 / ADR-0008'; the history audit's L7/band re-cut work and the staged band-conformance-ci-check item (§3.14) treat the band vocabulary as ADR-0008-governed; this audit's own commission binds its verdict vocabulary to ADR-0008. The negative register (default-to-flat) is the recorded rationale for six top-level composable placements at HEAD.

**dead_or_misleading:** Misleading at HEAD: (1) substrate item 4's citation 'the umbrella's memory record at feedback_classification_chestertons_fence.md' — resolves nowhere: not in any clone, and verified absent from the maintainer's local memory directory (it existed 2026-05-11, since pruned; only session-history backups retain it). (2) Rule 2's 'companion rule recorded in the umbrella's memory: earn-your-place' — same unlocatable authority; the rule is recorded in-repo in the reorganization audit (Option E and decision point 2's per-file counterpart). (3) The Single-domain-prototype exception names 'the design-note: planned marker from the doc-graph vocabulary' and the Deliberately-imprecise-tag exception lists 'design-note: revised' — both markers retired by ADR-0005 Rule 9 (2026-06-02); the refusal-to-classify-yet role is now carried by the owning work-status item's open state. (4) Rules 1/3's 'TODO entry' channel now means a work-status store item. (5) Negative 'There is no automated check that catches a violation' is aging: the store's enum constraints already refuse out-of-vocabulary writes mechanically, and the band checker is staged (open item band-conformance-ci-check). Dead: nothing.

**trigger_status:** Re-derived trigger count: 4. (1) 'A specific rule turns out to introduce its own failure mode' — NOT FIRED: no recorded instance; the named risk (refused-fits stalling arcs) has its mitigation and no recorded stall. (2) 'A genuinely new register surfaces that the positive/negative split doesn't cover' — NOT FIRED: ADR-0009 and ADR-0010 arrived as sibling tenets in the unsubstantiated-claim family (per the synopsis's three-intervention-points framing), not as classification registers; every classification incident since (refs.kind gap; audit verdict vocabularies) has been positive-register. (3) 'The substitution test produces calibration that fights another tenet' — NOT FIRED: no recorded reconciliation need. (4) 'Tooling makes part of the discipline mechanical' — PARTIALLY FIRED, UNRECORDED: the work-status store's closed-but-amendable enum constraints (e.g. refs_kind_check) mechanically refuse out-of-vocabulary writes, and the 2026-06-10 refs-kind arc is Rule 1's prescribed response operating against that mechanical surface; the fuller firing the trigger itself names (a band-coherence checker) is filed as open/future work-status item band-conformance-ci-check, which the history audit §3.14 explicitly calls the mechanization of the Rule-7-governed band vocabulary. The ADR carries no Amendments header and records none of this; proposal r2-adr0008-trigger4-record fixes that.

**fork_fitness:** High after the citation repair. The tenet is domain-agnostic by construction (its Scope already spans frontend/backend/proxy/doc-graph); the substrate examples are project-historical but the rules port unchanged. The fork raises its salience: FILES.md band re-tagging against the any-knowledge-domain criterion (audit L7) and every fork-side vocabulary cut are classification choices this tenet governs. The unresolvable memory citation matters doubly for a fork — the fork author has neither the maintainer's memory directory nor the todo DB, which is exactly why the stable-handles convention (audit §3.25) demands in-repo anchors; the proposed re-target (an archived, frozen, in-repo design note) satisfies it.

### proposal `r2-adr0002-rule7-keep-residence` [note] → docs/adr/0002-fail-loudly.md (verbatim)

**summary:** Answer to the commissioned slim question: keep Rule 7 in ADR-0002 in full, including the provisional-home paragraph and its retirement note. The duplication with ADR-0008 is deliberate two-register architecture, not rot; the history paragraphs are the reasoning trace Rule 6 itself demands and the corpus's worked example of the append discipline.

**details:** What a slim would orphan, precisely: (a) the retirement note's record that the relocation resolved via the standalone-ADR option rather than the tenet-space-refactoring alternative — stated nowhere else in the corpus; (b) the self-application paragraph ('naming this seam now is itself the rule's own discipline applied to its own placement') — the corpus's only worked example of Rule 7 applied to an ADR's own placement, which the 2026-06-10 cast-hygiene staging record in frontend/eslint.config.js already imitates as precedent ('recorded relationship per ADR-0002 Rule 6'); (c) the stability of the 'ADR-0002 Rule 7' handle, which at least seven documents resolve against (pre-merge checklist §F, ADR-0008 Rules 1/3 + Related, both knob postmortems' References, the hover worklog's Cross-references, the refs-kind worklog, the history audit §3.14/§5, the synopsis). The author quote and the three-instance substrate ARE duplicated in ADR-0008's Context — but both documents assert mutual non-subsumption explicitly, so each home needs its register's statement. Under the audit's bars the content is neither dead, nor better-homed (it IS the fail-loudly-register instance), nor misleading (the retirement note immediately corrects the provisional flag). 'Shorter' is the only argument for slimming, and the bars exclude it. No action needed beyond the citation repairs in r2-adr0002-reference-repair.

### proposal `r2-adr0002-scope-amendment` [amend] → docs/adr/0002-fail-loudly.md (verbatim)

**summary:** The Scope line is pre-umbrella and misleading at HEAD: it names the frontend by its former repo name (gogui) and casts the backend as 'a design aspiration', while CLAUDE.md and handoff-current apply the tenet project-wide including the proxy (structured logging is explicitly 'ADR-0002 applied to logging'). A fork author reading the ADR cold gets the wrong scope.

**details:** Replace the Scope line with: '- **Scope:** Codebase-wide — `frontend/`, `backend/`, `proxy/`, and the documentation graph. *(Updated 2026-06-10; the original line predated the umbrella, naming the frontend by its former repository name `gogui` and the backend as a design aspiration. The tenet has applied project-wide since the umbrella formed: the proxy's call-site-validated structured logging and configuration hard-refusals, the backend ACL posture, and the documentation-consumption corollary in the umbrella `CLAUDE.md` are the register instances.)*' Record in the Amendments header as part of the consolidated 2026-06-10 entry (see r2-adr0002-mechanization-register for the shared header line).

### proposal `r2-adr0002-reference-repair` [amend] → docs/adr/0002-fail-loudly.md (verbatim)

**summary:** Repair the document's decayed references: three dangling relative cross-references invisible to the doc-graph validator, four pre-store TODO item numbers with no resolution anchor, the unlocatable 'Engagement protocol' citation, the retired design-note marker vocabulary in Rules 6/7, and a dated closure note on Exception 3's since-removed worked example.

**details:** Exact edits: (1) Rule 7, third paragraph citations: '../notes/postmortem-knob-registry-qeubo-domain-2026-05.md' → '../notes/postmortem/postmortem-knob-registry-qeubo-domain-2026-05.md'; '../notes/postmortem-knob-toolbar-popover-2026-05.md' → '../notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md'. (2) Related bullet: '**`../notes/analysis-persistence-plan.md`**' → '**`../archive/notes/design/analysis-persistence-plan.md`** — the planning note the no-silent-retry-queue Context example is drawn from; the design has since shipped (the SPA uploads analysis bundles to the backend''s `/analysis-bundles` endpoint) and the note is archived.' (3) Append one Related line: '**Pre-store item numbers.** Items 20/21/29/30 cited above predate the work-status store and resolve against `docs/archive/TODO-completed-2026-05-06.md`; current work status lives in the `todo` Postgres store.' (4) Engagement-protocol bullet: append '— since codified in the umbrella `CLAUDE.md` ("Asking before assuming"; "ADR-0002 applies to documentation consumption") and the frontend `CLAUDE.md` reading-discipline corollary, which are now the owning documents for this register.' (5) Dated note appended after Rule 7's channel list and referenced from Rule 6: '*(Updated 2026-06-10.)* ADR-0005 Rule 9 (2026-06-02) retired the per-note `design-note: <status>` marker vocabulary named here; the sibling-revision channel is unchanged, but a note''s status is now delegated to its owning work-status item, and the "TODO entry" channel means a work-status store item.' (6) Exception 3, appended: '*(2026-06-10.)* The 34b fallback chain has since been removed on schedule — `backend-service.ts` no longer carries it. The worked example is historical; the rule of thumb stands, and the completed removal is the "explicitly-scheduled-for-removal" contract honoured.' All recorded under the consolidated 2026-06-10 Amendments-header entry; doc-graph regeneration rides the PR (structural cross-reference changes).

### proposal `r2-adr0002-mechanization-register` [amend] → docs/adr/0002-fail-loudly.md (verbatim)

**summary:** The Negative consequence 'the tenet is a policy, not an enforced mechanism' is half-true at HEAD: four error-level lint rules, two ownership local rules, the work-status table constraints, and the doc-graph freshness gate now enforce ADR-0002 registers mechanically. Amend the bullet ADR-0005-style (dated in-place update recorded in the Amendments header) and add a Revisit-when trigger so future mechanizations get recorded; keep the ADR pointer-shaped so it does not become a hand-maintained mirror of the lint config.

**details:** (1) Append to the Negative 'Developer discipline required' bullet: '*(Updated 2026-06-10.)* Partially mechanized since authoring: `frontend/eslint.config.js` enforces several registers of this tenet at `error` — the silent-async class (`no-floating-promises`), union exhaustiveness (`switch-exhaustiveness-check`), the error-message-reparse ban (RCA 2026-06-01 guard G1), and the any-assertion ban (cast-hygiene stage 1) — with per-rule rationale and measured-at-adoption records kept in that config''s header, which is the census''s single home (this ADR deliberately does not mirror the rule list; hand-maintained mirrors drift — history audit L5). The work-status store''s table constraints and the doc-graph freshness gate are the documentation-register analogs. The unmechanized residue — an empty `catch`, justification *quality* on casts, the judgment calls in Rules 3–4 — remains review''s.' (2) Append Revisit-when #5: '**A rule of this tenet gains a mechanical guard** (lint rule, type-level ban, DB constraint, CI gate). Record the mechanization here by dated append — the enforcement level is part of a rule''s meaning. (Substrate: the 2026-06-01 RCA''s common-root finding and history-audit lesson L1 — prose disciplines decay, mechanisms stick.)' (3) One consolidated Amendments-header entry dated 2026-06-10 covering r2-adr0002-scope-amendment, r2-adr0002-reference-repair, and this change, in the established header-line style. The synopsis co-changes (the cochange advisory will flag it).

### proposal `r2-adr0008-memory-citation-repair` [amend] → docs/adr/0008-classification-discipline.md (verbatim)

**summary:** The ADR cites 'the umbrella's memory record at feedback_classification_chestertons_fence.md' for substrate item 4 and 'the umbrella's memory' for Rule 2's earn-your-place companion — a maintainer-local file that resolves in no clone and, verified, no longer exists even in the maintainer's memory directory. Both records exist in fuller form in-repo; re-point them per the stable-handles convention.

**details:** Exact edits: (1) Substrate item 4's parenthetical '(Recorded in the umbrella''s memory record at `feedback_classification_chestertons_fence.md`; surfaced 2026-05-11.)' → '(Recorded in the reorganization audit''s implementation outcome — `docs/archive/notes/frontend-source-tree-reorganization.md`, decision point 2, which applied the same flat-lift to five further ambiguous composables on the same principle; surfaced 2026-05-11.)' (2) Rule 2: 'The companion rule recorded in the umbrella''s memory: *"earn-your-place"*' → 'The companion rule recorded in the same reorganization audit (its Option E): *"earn-your-place"*'. (3) Add an Amendments header line (the ADR has none yet): '- **Amendments:** 2026-06-10 — substrate citation repaired: the maintainer-local memory record originally cited resolves in no clone of the repository (and has since been pruned locally); the in-repo record at `docs/archive/notes/frontend-source-tree-reorganization.md` is the durable, richer carrier (per the stable-handles convention, history audit §3.25). Plus the marker-vocabulary and Revisit-#4 notes of the same date.' Note the irony is the argument: a tenet about honest vocabulary fit citing an unresolvable authority for its own substrate is the defect class it polices. Doc-graph regeneration rides the PR.

### proposal `r2-adr0008-retired-marker-vocabulary` [amend] → docs/adr/0008-classification-discipline.md (verbatim)

**summary:** Both Exceptions name the design-note: planned / design-note: revised markers that ADR-0005 Rule 9 retired on 2026-06-02, and Rules 1/3's 'TODO entry' channel predates the work-status store. Dated forward-pointer notes in the ADR-0005 Rule 8 style fix all three without disturbing the exceptions' substance.

**details:** Exact edits: (1) Append to the Single-domain-prototype exception: '*(Updated 2026-06-10.)* ADR-0005 Rule 9 (2026-06-02) retired the per-note `design-note: <status>` marker vocabulary; the explicit refusal-to-classify-yet that marker carried is now expressed by the design note''s owning work-status item remaining open. `[experimental]` and `[B?]` stand unchanged.' (2) In the Deliberately-imprecise-tag exception, annotate the `design-note: revised` list entry: '(marker vocabulary since retired per ADR-0005 Rule 9 — the deliberate-admission role survives as SSOT delegation)'. (3) Append to Rule 3's channel list: '(a "TODO entry" means a work-status store item since the 2026-06-02 consolidation)'. Recorded under the same 2026-06-10 Amendments header line as r2-adr0008-memory-citation-repair.

### proposal `r2-adr0008-trigger4-record` [amend] → docs/adr/0008-classification-discipline.md (verbatim)

**summary:** Revisit-when #4 (tooling makes part of the discipline mechanical) has partially fired without a record: the work-status store's enum constraints mechanically refuse out-of-vocabulary writes, the 2026-06-10 refs-kind arc is the worked instance of Rule 1 operating against that mechanical surface, and the band-register firing the trigger names is staged as the open band-conformance-ci-check item. Record it so the L6 trigger-rot pattern the history audit found in ADR-0001/0003 does not repeat here.

**details:** Append to Revisit-when #4: '**(Partially fired, recorded 2026-06-10.)** The work-status store''s closed-but-amendable enum constraints (e.g. `refs_kind_check`, `tools/work-status/schema.sql`) mechanically refuse out-of-vocabulary writes — the gap-surfacing this tenet prescribes now happens against a constraint, not a convention; the `refs.kind` `audit`-value arc (`docs/worklog/2026-06-10-refs-kind-audit.md`) is the worked instance: a precedent-based closest-match (`design-note` for audit docs) surfaced per Rule 1 rather than silently reused, and the vocabulary was revised on maintainer sign-off. The band-register mechanization this trigger names directly is filed as work-status item `band-conformance-ci-check` (open/future; history audit §3.14); when it ships, tighten Rule 1''s band-tag application from review responsibility toward CI per this trigger''s own prescription, and record the firing here.' Update the Negative 'There is no automated check' bullet with a one-line dated pointer to this trigger note. Recorded under the 2026-06-10 Amendments header line shared with the other r2-adr0008 amendments; synopsis co-change applies.

### proposal `r2-new-tenet-mechanize-on-recurrence` [new-tenet] → docs/adr/ (new, next free number) (verbatim)

**summary:** The paid-for lesson of the last six weeks that no existing tenet owns: prose disciplines decay, mechanisms stick (history audit L1; RCA common root; ADR-0010's origin proof that a describing-only postmortem does not stop recurrence). RCA open question 4 explicitly asks whether this deserves a cross-cutting articulation. Recommend filing it as a tenet, with the honest counterargument recorded; maintainer's call.

**details:** Drafted decision core: 'When a documented discipline is violated a SECOND time despite being in force — a recurrence, not a first instance — the corrective is incomplete until it includes a mechanization assessment: can the failure shape be caught by a compile-time ban, a lint rule, a DB constraint, a CI gate, or a harness test? If yes at proportionate cost, the mechanism ships with (or is filed alongside) the fix, measured-first per the established adoption pattern (count violations in warn mode before error). If no, the decision to remain prose-only is itself recorded with the reason. More guidance prose is never the default corrective for a recurrence.' Substrate (all already paid for): RCA 2026-06-01 §3 — the project''s characteristic failure mode is the invisible-at-authoring, visible-only-in-aggregate defect, against which policy enforced by one person''s memory is structurally weak — and its open question 4 naming this exact tenet-vs-per-surface choice; history audit L1, evidenced from both directions (failures: cast-justification ~50%, render-coupling recurring post-postmortem; successes: every RCA-minted lint, the registries, the doc-graph gate); ADR-0010''s creation story (recurrence ended only when tenet + harness mechanized it). Honest counterargument to record in Alternatives: ADR-0005 Revisit #2 and ADR-0008 Revisit #4 already carry per-tenet tighten-on-tooling triggers, and the practice exists without a tenet (RCA G-ratings, measure-first lint adoptions) — the tenet''s marginal value is converting the mechanization assessment from an audit-time observation into a named obligation at corrective-authoring time, which is exactly the moment the RCA shows the discipline leaks. The alternative shape — append it as an ADR-0002 Rule 8 with a provisional-home flag — is viable per the Rule 7 precedent, but the subject (enforcement economics) is orthogonal to fail-loudly the same way classification was, so the standalone path is cleaner. If filed, ADR-0002''s new Revisit-when #5 (r2-adr0002-mechanization-register) becomes its fail-loudly-register hook, mirroring the Rule 7 / ADR-0008 pairing.

### proposal `r2-handoff-adr0002-bullet-stale` [amend] → docs/handoff-current.md (verbatim)

**summary:** Outside the assigned corpus but found while verifying it: handoff-current's ADR-0002 tenet bullet still describes Rule 7's provisional-home flag as live ('may relocate when a classification-discipline tenet is articulated') while the ADR-0008 bullet on the same page records the 2026-05-17 retirement — an internal contradiction between two bullets twenty lines apart.

**details:** In the 'Tenets' section's ADR-0002 bullet, replace 'with an explicit provisional-home flag since Rule 7''s deeper subject, refusing fuzzy matching when sharper classification is available, is broader than fail-loudly proper and may relocate when a classification-discipline tenet is articulated' with 'whose provisional-home flag retired 2026-05-17 when ADR-0008 took the broader principle; Rule 7 remains as the fail-loudly-register instance'. One-sentence fix; content-only doc edit, no doc-graph regeneration required.

### Report (verbatim)

`````markdown
# r2 — Claim-discipline core: ADR-0002 (fail loudly) and ADR-0008 (classification discipline)

Reader r2 of the 2026-06-10 ADR-corpus audit (work-status item `adr-effectiveness-audits`). Assignment: judge ADR-0002 and ADR-0008 against everything the project now knows — retire / slim / merge / restructure / amend / status-change / keep — including the Rule 7 residence question, reference resolution at HEAD, the mechanization wave, and fitness for the maintainer's generic knowledge flash-card fork. Read-only; everything below is proposal.

## Coverage

Read end to end: umbrella `CLAUDE.md` and `frontend/CLAUDE.md` (in context); `docs/adr-synopsis.md`; `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`; `docs/adr/0002-fail-loudly.md`; `docs/adr/0008-classification-discipline.md`; `docs/adr/0005-documentation-discipline.md` (to verify the Rule 9 marker retirement before citing it); `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`; both knob postmortems (`postmortem-knob-registry-qeubo-domain-2026-05.md`, `postmortem-knob-toolbar-popover-2026-05.md`); `docs/worklog/2026-05-14-popover-hover-finickiness.md`; `docs/worklog/2026-06-10-refs-kind-audit.md`; `docs/pre-merge-checklist.md`; `docs/notes/decisions-deferred.md`; `docs/handoff-current.md`; `docs/TODO.md`; `docs/rfcs/0001-adr-meta-review.md`; `docs/archive/notes/frontend-source-tree-reorganization.md` (read in full before proposing it as a citation re-target).

Row-level / partial, disclosed: `docs/doc-graph-report.md` (generated report, sanctioned row-level); `docs/archive/TODO-completed-2026-05-06.md` (rows 20/21/29/30 only); `frontend/eslint.config.js` (header block + rule-block grep, consulted as the mechanization census); `backend-service.ts` (grep for the 34b fallback chain only). Mechanical checks: directory listings, file-existence checks, a session-history search establishing the chestertons-fence memory file's creation (2026-05-11) and current absence, a dependency grep for error-reporting services, and read-only SQL against the `todo` store. Not read: `backend/qeubo/` (firewall); the history audit's verbatim appendices; ADR-0009/ADR-0010 themselves (outside assignment — where characterized, the characterization is attributed to the synopsis or the history audit).

## ADR-0002 — Fail Loudly

**Verdict: amend.** The decision core — the loudness hierarchy, seven rules, three exceptions, the NOT-mean fence — is sound and is the most load-bearing prose in the corpus: the eslint config justifies four `error`-level rules in its terms, the RCA uses it as the reference frame, and at least seven documents resolve the handle "ADR-0002 Rule 7". Nothing in six weeks of postmortems, the RCA, or the history audit contradicts a rule or an exception. What has decayed is the periphery: references, scope wording, and one consequence claim overtaken by events.

### The Rule 7 residence question — keep, in full

Rule 7 spans ~86 lines including the provisional-home paragraph and its retirement note; ADR-0008 carries the broader principle. I judge the residence load-bearing and recommend against a slim. Three reasons:

1. **The history paragraphs are the trace Rule 6 demands.** The provisional-home paragraph and retirement note are the corpus's worked example of its own append discipline — Rule 7 applied to Rule 7's placement ("naming this seam now is itself the rule's own discipline applied to its own placement"). The eslint config's 2026-06-10 cast-hygiene staging record already imitates this as precedent. Cutting it is the silent absorption Rule 6 forbids.
2. **One fact lives only there.** The retirement note records that the relocation resolved via the *standalone-ADR* option rather than the *tenet-space-refactoring* alternative. ADR-0008's Context and ADR-0002's Amendments header summarize the arc, but the decision-against-the-alternative is stated nowhere else.
3. **The duplication is architecture.** The author's verbatim 2026-05-15 articulation and the three-instance substrate appear in both documents because both documents assert mutual non-subsumption: fail-loudly is the reactive register, classification discipline the proactive one. Each home needs its register's statement; the pre-merge checklist (§F) resolves against the ADR-0002 form specifically.

Under the audit's bars, the content is neither dead, nor better-homed, nor misleading. "Shorter" is the only remaining argument, and the bars exclude it.

### What is misleading at HEAD

- **The Scope line** — "Applies to the frontend (`gogui`) and, as a design aspiration, to coordinated choices on the spaced-repetition backend" — predates the umbrella. `CLAUDE.md` applies the tenet to proxy logging ("ADR-0002 applied to logging"), to documentation consumption, and to debugging; handoff-current says all ten ADRs apply project-wide. A fork author reading the ADR cold gets the wrong scope. (Proposal r2-adr0002-scope-amendment.)
- **Three dangling relative references, invisible to the validator.** Rule 7 cites `../notes/postmortem-knob-registry-qeubo-domain-2026-05.md` and `../notes/postmortem-knob-toolbar-popover-2026-05.md` — both files now live under `docs/notes/postmortem/`. Related cites `../notes/analysis-persistence-plan.md` — the plan now lives at `docs/archive/notes/design/analysis-persistence-plan.md`, and the designed feature has shipped (handoff's integration section describes the live `/analysis-bundles` path). None of the three appears in `docs/doc-graph-report.md`: the extractor catches `docs/`-rooted path mentions, not `../` relatives, so these will not surface mechanically. (r2-adr0002-reference-repair.)
- **Pre-store item numbers.** Context and Related cite items 20/21/29/30. All four resolve — but only against `docs/archive/TODO-completed-2026-05-06.md` (verified rows), which the ADR does not name; the live store has no such numbers. The stable-handles convention (audit §3.25) prescribes an in-repo anchor. (Same proposal.)
- **The Engagement-protocol bullet** cites an unlocatable nominal handle. The quoted rules are now codified in the umbrella `CLAUDE.md` ("Asking before assuming"; the documentation-consumption section) and the frontend `CLAUDE.md` corollary — the bullet should point there. (Same proposal.)
- **Retired marker vocabulary.** Rule 6's "sibling marked `design-note: revised` per the doc-graph genre vocabulary" and Rule 7's channel list reference markers ADR-0005 Rule 9 retired on 2026-06-02; "TODO entry" now means a work-status item. A dated forward-pointer in ADR-0005's own Rule 8 style fixes it. (Same proposal.)
- **Exception 3's worked example completed.** The 34b fallback chain is gone from `backend-service.ts` — removed on schedule. Not a defect: it is the "explicitly-scheduled-for-removal" contract honoured, worth a dated closure note as the exception's proof-of-discipline. (Same proposal.)

### The mechanization question

The Negative consequence "the tenet is a policy, not an enforced mechanism" is now half-true. Verified at HEAD: `no-floating-promises` and `switch-exhaustiveness-check` (type-checked), the G1 message-reparse ban (RCA guard, 0 hits at adoption), the any-assertion ban (cast-hygiene stage 1, fully triaged baseline), `local/clear-needs-ownership`, `local/store-write-needs-owner`, `local/gate-prop-needs-default`, `local/module-intent-in-script-setup` — each with rationale and measured-at-adoption records in the config header — plus the work-status table constraints and the doc-graph freshness gate on the documentation register.

The body should record this, but pointer-shaped: amend the Negative bullet with a dated update that *delegates the census* to the eslint config header (its established single home per RCA Finding 1d), rather than mirroring the rule list — hand-maintained mirrors drift (audit L5). Add a Revisit-when #5 so future mechanizations get recorded, mirroring ADR-0005's fired trigger #2. The unmechanized residue (empty `catch`, cast-justification *quality*, Rules 3–4 judgment) keeps the bullet honest. (r2-adr0002-mechanization-register.)

### Trigger walk (re-derived count: 4)

1. *User-visible warnings spammy* — **unassessable** (user-report-dependent; no fatigue report in evidence; history audit §8 records the same).
2. *Anomalies collapse into one useless message* — **not fired** (no recorded instance; the ApiError arc preserved per-status specificity).
3. *A domain where silent fallback is genuinely right* — **not fired** (no new exception adopted; the live loudness question at the enrichment merge boundary, audit §3.6, is level-selection within the hierarchy, not a fallback domain).
4. *Structured error-reporting service adopted* — **not fired** (verified: no such dependency).

No firing recorded in the ADR; none needed — consistent. The real change (mechanization) sits outside all four triggers, which is itself the argument for adding #5.

### Fork fitness

High after the Scope fix. The tenet carries no domain vocabulary; the hierarchy and rules port unchanged. The fork-relevant defects are exactly the reference ones: the gogui Scope line and the maintainer-local resolution targets (store item numbers), since a fork author has neither the history nor the todo DB.

## ADR-0008 — Classification Discipline

**Verdict: amend.** A young tenet the subsequent weeks validate: the refs-kind arc (2026-06-10) is a clean worked instance — a precedent-based closest-match (`design-note` for audit docs) surfaced per Rule 1 instead of silently reused, the vocabulary revised on maintainer sign-off, and the ADR-0005 Rule 9 tension dissolved in the same move. The history audit's §5 wrinkle and this audit's own verdict-vocabulary rule both operationalize the tenet. The two registers, the substitution test (pre-merge checklist §E), and the exceptions stand. The defects are referential, one of them serious.

### The memory citation — the sharpest defect in either document

Substrate item 4 cites "the umbrella's memory record at `feedback_classification_chestertons_fence.md`"; Rule 2 leans on "the umbrella's memory" again for the earn-your-place companion rule. Verified: that file resolves in **no clone of the repository**, and it no longer exists even in the maintainer's local memory directory (created 2026-05-11, since pruned; only session-history backups retain its text). A tenet about honest reference to vocabularies citing an unresolvable authority for its own substrate is the defect class it polices.

The fix is cheap and strictly better: `docs/archive/notes/frontend-source-tree-reorganization.md` (read in full) carries both records in richer form — the `useNavigation` author override with rationale (Implementation outcome, decision point 2), the same flat-lift applied to five further ambiguous composables, and the earn-your-place rule as Option E with its per-file counterpart stated. Re-point both citations there; an in-repo, frozen, archived design note satisfies the stable-handles convention the fork makes mandatory. (r2-adr0008-memory-citation-repair.)

### Retired marker vocabulary

The Single-domain-prototype exception names "the `design-note: planned` marker from the doc-graph vocabulary" and the Deliberately-imprecise-tag exception lists `design-note: revised`. ADR-0005 Rule 9 (2026-06-02) retired the per-note marker vocabulary; the refusal-to-classify-yet role those markers played is now carried by the owning work-status item's open state. Dated forward-pointer notes fix both exceptions without disturbing their substance; Rule 3's "TODO entry" channel gets the same one-line modernization. (r2-adr0008-retired-marker-vocabulary.)

### Trigger walk (re-derived count: 4)

1. *A rule introduces its own failure mode* — **not fired** (no recorded instance; the named stall risk has its mitigation and no recorded stall).
2. *A genuinely new register the positive/negative split doesn't cover* — **not fired.** ADR-0009 and ADR-0010 arrived as sibling tenets in the unsubstantiated-claim family (per the synopsis's three-intervention-points framing), not as classification registers; every classification incident since has been positive-register.
3. *Substitution test fights another tenet* — **not fired** (no recorded reconciliation need).
4. *Tooling makes part of the discipline mechanical* — **partially fired, unrecorded.** The work-status store's closed-but-amendable enum constraints (`refs_kind_check`) mechanically refuse out-of-vocabulary writes, and the refs-kind worklog shows Rule 1 operating against that constraint. The band-register firing the trigger names directly is staged as open item `band-conformance-ci-check` (audit §3.14 calls it the Rule-7 vocabulary's mechanization). The ADR has no Amendments header and records none of this — the L6 trigger-rot shape the history audit caught in ADR-0001/0003. (r2-adr0008-trigger4-record.)

### Fork fitness

High after the citation repair. The Scope already spans all three sub-projects plus the doc graph; the rules port unchanged. The fork raises the tenet's salience — re-keying the FILES.md band legend to the any-knowledge-domain test (audit L7) and every fork-side vocabulary cut are exactly the choices it governs — and makes the in-repo-anchors fix non-optional, since the fork author has neither the maintainer's memory directory nor the todo DB.

## Merge / restructure considered and rejected

Merging Rule 7 into ADR-0008 (or ADR-0008 back into ADR-0002) was weighed and rejected: both documents explicitly assert mutual non-subsumption, the handle "ADR-0002 Rule 7" is resolution infrastructure for at least seven documents, and the corpus's family design (synopsis: three unsubstantiated-claim disciplines at three intervention points) depends on the registers having separate homes. No status changes apply (both Accepted, correctly).

## The new-tenet question

The one paid-for lesson of the last six weeks that no existing tenet owns: **prose disciplines decay; mechanisms stick** (history audit L1, evidenced from both directions). The RCA's common-root finding names the project's characteristic failure mode — invisible-at-authoring, visible-only-in-aggregate, against which policy enforced by one person's memory is structurally weak — and its open question 4 explicitly asks whether this deserves a cross-cutting articulation. ADR-0010's creation story is the proof case: a describing-only postmortem did not stop recurrence; tenet + harness did.

I recommend filing it (r2-new-tenet-mechanize-on-recurrence), decision core: *a recurrence's corrective is incomplete without a mechanization assessment (compile ban / lint / DB constraint / CI gate / harness test), measured-first; remaining prose-only is a recorded decision, never the default.* The honest counterargument, recorded in the proposal: ADR-0005 #2 and ADR-0008 #4 already carry per-tenet tighten-on-tooling triggers, and the practice exists without a tenet (RCA G-ratings, measure-first lint adoptions) — the tenet's marginal value is converting the assessment from an audit-time observation into a named obligation at corrective-authoring time, which is precisely where the RCA shows the leak. The alternative — an ADR-0002 Rule 8 with a provisional-home flag, per the Rule 7 precedent — is viable but repeats the arc that ended in a standalone tenet. Maintainer's call.

## Proposals (summary)

| id | target | kind | one-line |
|---|---|---|---|
| r2-adr0002-rule7-keep-residence | ADR-0002 | note | Keep Rule 7 in full; slim would orphan the relocation-decision record, the self-application precedent, and the handle's stability |
| r2-adr0002-scope-amendment | ADR-0002 | amend | Replace the pre-umbrella gogui/backend-aspiration Scope line with the project-wide truth |
| r2-adr0002-reference-repair | ADR-0002 | amend | Fix 3 validator-invisible dangling refs; anchor items 20/21/29/30; re-point the Engagement-protocol bullet; marker-vocabulary note; Exception-3 closure note |
| r2-adr0002-mechanization-register | ADR-0002 | amend | Dated update to the policy-not-mechanism Negative (census delegated to the eslint header) + Revisit-when #5 |
| r2-adr0008-memory-citation-repair | ADR-0008 | amend | Re-point both maintainer-local memory citations to the archived reorganization audit (verified richer carrier) |
| r2-adr0008-retired-marker-vocabulary | ADR-0008 | amend | Dated notes for the ADR-0005-Rule-9-retired markers in both Exceptions + the TODO-entry channel |
| r2-adr0008-trigger4-record | ADR-0008 | amend | Record Revisit #4's partial firing (store constraints; refs-kind arc; staged band check) under a new Amendments header |
| r2-new-tenet-mechanize-on-recurrence | new ADR | new-tenet | Mechanize-on-recurrence tenet; decision core drafted; counterargument recorded; maintainer's call |
| r2-handoff-adr0002-bullet-stale | handoff-current.md | amend | The ADR-0002 bullet still describes Rule 7's provisional-home flag as live; the ADR-0008 bullet on the same page contradicts it |

All ADR amendments are append/dated-update shaped per the corpus's own convention (ADR-0005's 2026-06-01 precedent), can ship as one PR per ADR with a single consolidated Amendments-header entry, and trigger synopsis co-change (the advisory will flag it) and doc-graph regeneration (the citation changes are structural). They are the ADR-0002/0008 analog of the already-shipped `adr-record-amendments-2026-06` item (0001/0003/0010).

No performance claims are made in this report; perf-adjacent statements are the cited documents' own captured claims, attributed.
`````


## §2 · refuter:r2-new-tenet-mechanize-on-recurrence (lens: combined) — verdict **survives**

Commission: `refuterPrompt` over proposal `r2-new-tenet-mechanize-on-recurrence` (fields above), reader r2, rationale excerpt per §0's reconstruction rule.

**findings (verbatim):** LENS 1 (reference web): The proposal is purely additive — no content is removed, relocated, or superseded, so no inbound reference can orphan and no document's meaning degrades. Verified: no ADR-0011 exists in tree or in git history (`git log --all -- docs/adr/0011*` empty); the todo DB carries only two `refs.kind='adr'` rows (targets 0007, 0008), neither touching a new ADR; no todo item owns the recurrence-tenet question (`adr-effectiveness-audits` is open/in-progress and is the RCA-named adjacent vehicle). Co-change duties at ship: docs/adr-synopsis.md entry plus its "The eight tenets" count and posture list (cochange-advisory.mjs flags this in CI); doc-graph regeneration (new node under docs/adr/ is structural); an owning work-status item per the `classification-discipline-tenet-rule7-relocation` precedent; ordering with the sibling proposal r2-adr0002-mechanization-register (the ADR-0002 Revisit #5 hook must name the assigned number; if that proposal falls, the tenet carries the ADR-0002 linkage one-sided in Related).

LENS 2 (content custody): No content loses a home. The inverse risk — duplicating content whose canonical home is elsewhere — is real but repairable: the measure-first adoption pattern's operational record lives in frontend/eslint.config.js's rationale header (per RCA OQ2 and the 2026-06-10 cast-hygiene worklog), and the drafted core's parenthesis "(count violations in warn mode before error)" over-specifies one variant of what the config records as a zero-or-fully-triaged posture (stage 1 went straight to error on a fully-triaged 12-site baseline). Convention check: ADR-0005 Revisit #3's append-not-new-tenet pre-authorization is scoped to documentation failure patterns and does not capture enforcement economics for code/CI/DB mechanisms; ADR-0008 Revisit #2's is scoped to classification registers; the Rule 7 → ADR-0008 precedent (orthogonal subject gets a standalone home with a register hook left in ADR-0002) supports the proposed shape. No recorded decision is fought: RCA open question 4 is genuinely open (the 2026-06-02 SSOT consult references but does not settle it), and the postmortem-directory point-in-time convention means the RCA is cited, never edited. The proposal's Alternatives must additionally name and decline the ADR-0005-Rule-10 reading (correctives are documents, so ADR-0005 is a colorable home), which the proposal currently omits.

LENS 3 (substitution + fork): Failure shape in general form: a corrective for a recurrence of an in-force discipline ships as more description, leaving enforcement memory-bound, and the third-plus instance lands on a worse surface. Surfaces: error-typing (observed, 6 sites), render-coupling (observed, ~9 excisions), doc status (observed), cast justification (~50% decay in sample), band tags, capability metadata, and — worst case — migrations, which the audit corpus names the one place ADR-0002 fail-loud is structurally absent; a prose-only recurrence corrective there risks silent corruption of persisted user workspaces. Strongest deflation attempted: the render-coupling postmortem already contained mechanization recommendations and recurrence happened anyway, so the tenet's assessment obligation looks redundant — but the postmortem's recommendations were prose-channel deferrals, exactly the L3 leak (postmortem recommendations reliably evaporated; ledgered items did not), so the tenet's "ships with or is filed alongside" clause is load-bearing only if "filed" is pinned to the work-status store. Second deflation: the tenet is itself guidance prose proposing to ban prose-only correctives — answered by the corpus's own evidence that the tenet half of tenet+mechanism pairs is load-bearing (ADR-0010 Context), but only if the tenet self-applies: it must ship with its own cheap hook (a pre-merge-checklist line — the corrective-authoring template currently has no mechanization-assessment item) or record why prose-only. Third deflation: gate-overreach — the corpus retracted a mandatory-checklist gate (§7.3, capability-not-laziness rationale) and G6 is marked "never a gate"; the tenet must carry this advisory-first calibration or it will be read as mandate-a-CI-gate-per-recurrence. Fork: the tenet is domain-agnostic umbrella process; a single-maintainer fork with no audit cadence yet inherits the obligation at the moment it is most exposed. The fork author loses nothing and gains the enforcement-economics articulation.

**required_repairs (verbatim):** The authored ADR must ship with all of the following:
1. Calibration section (Exceptions or equivalent): mechanism ≠ merge gate. Record the §7.3 template-not-gate retraction (docs/pre-merge-checklist.md "What this is — and what it is not"; capability-not-laziness rationale), RCA G6's "low precision / never a gate" verdict, and the doc-graph advisory/gate split as the worked precedents for choosing advisory-first; the mechanization assessment chooses a rung (gate, advisory report, harness test, template line), it does not default to the top.
2. Self-application note: the tenet applies its own rule to itself — its proportionate mechanization is a mechanization-assessment line added to docs/pre-merge-checklist.md (the corrective-authoring template, which currently has none) in the same change, with the remainder recorded as judgment-shaped prose-only per the tenet's own escape clause.
3. Pin the filing channel: "filed alongside" means a work-status store item (the L3 lesson: prose-channel postmortem recommendations evaporate; ledgered deferrals do not — the render-coupling arc is the worked counterexample). A prose recommendation does not discharge the obligation.
4. Correct the measure-first wording: defer to frontend/eslint.config.js's recorded zero-or-fully-triaged adoption posture rather than freezing "warn mode before error" (the cast-hygiene stage 1 went straight to error on a fully-triaged baseline); cite the config header as the operational record, do not restate it normatively.
5. Alternatives section names three declined shapes with reasons: ADR-0002 Rule 8 with provisional-home flag (the proposal already names it), an ADR-0005 Rule 10 (declined: the subject is enforcement economics for code/CI/DB mechanisms, outside documentation-authoring scope and outside Revisit #3's pre-authorization), and remain-practice-only (the proposal's recorded honest counterargument).
6. Co-changes in the same change: docs/adr-synopsis.md entry plus the "eight tenets" count and closing posture list; doc-graph regeneration (structural addition under docs/adr/); Genre header line per convention ("the ninth tenet, after …" — adjust if sibling audit proposals also mint ADRs); an owning work-status item, naturally a child of `adr-effectiveness-audits` (the RCA-named adjacent vehicle), with a refs row to the RCA and the history-lessons audit.
7. Number assignment at execution, not in the proposal: assign the next free number serially against any other surviving new-ADR proposals from this audit cycle; if r2-adr0002-mechanization-register also ships, its Revisit-when #5 names the assigned number (assignment precedes that amendment); if it does not ship, this tenet's Related section carries the ADR-0002 pairing one-sided.
8. Cite, never edit, the RCA: open question 4 is answered by this ADR's existence; the RCA is a point-in-time record per the postmortem-directory convention and receives no retro-edit.

**report (verbatim):**

`````markdown
# Adversarial refutation report — r2-new-tenet-mechanize-on-recurrence

**Commission.** Adversarial refuter for one proposal in the 2026-06-10 ADR-corpus audit: a new tenet (next free ADR number) making a mechanization assessment obligatory in any corrective for a *recurrence* of an in-force documented discipline, with prose-only outcomes recorded with reasons. Default stance: skepticism; mandate: run the reference-web, content-custody, and substitution/fork lenses and either refute or specify the exact repair set.

**Coverage.** Read end to end this session: the evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`); `docs/adr-synopsis.md`; ADR-0002, ADR-0005, ADR-0008, ADR-0010; `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`; `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` (main only — appendix parts p1–p3 deliberately not read, per commission); `docs/pre-merge-checklist.md`; `docs/notes/postmortem/README.md`; `docs/notes/consult/opus-consult-2026-06-02-work-status-ssot-plan.md`; `docs/worklog/2026-06-10-cast-hygiene-lint.md`; `docs/notes/audit/audit-spa-history-lessons-2026-06-10-filings.md`; the umbrella `CLAUDE.md`. Not read, and cited only via the synopsis/digest's own attributed statements: ADR-0001, -0003, -0004, -0006, -0007, -0009; `frontend/eslint.config.js` (its adoption posture is relayed from the RCA's and the cast-hygiene worklog's captured claims). The grep hit in `opus-consult-2026-05-30-config-schema-refactor.md` proved to concern that note's own internal numbering; its content is not relied on. Todo DB consulted read-only (refs by kind, item searches, the `adr-effectiveness-audits` description). No performance claims of my own are made.

## Lens 1 — reference web

The proposal removes, relocates, and rewords nothing; it is purely additive. Accordingly **no inbound reference orphans and no document's meaning silently degrades**. Verified specifics:

- No ADR-0011 exists in the tree, in git history (`git log --all -- docs/adr/0011*` is empty), or in any doc (`grep` for `ADR-0011`/`0011` across `docs/` finds only unrelated numeric data).
- The todo DB carries exactly two `refs.kind='adr'` rows (`classification-discipline-tenet-rule7-relocation` → ADR-0008, closed; `refactoring-queue-adr0007` → ADR-0007). Neither is touched. No item owns the recurrence-tenet question; `adr-effectiveness-audits` (open, in-progress) is the adjacent vehicle the RCA's open question 4 itself names.
- Co-change duties the addition triggers: a synopsis entry plus the synopsis's "The eight tenets form a coherent posture" count and closing list (`tools/doc-graph/cochange-advisory.mjs` exists and flags ADR-without-synopsis changes in CI, per synopsis lines 12–14); doc-graph regeneration (a new node under `docs/adr/` is a structural change; the freshness gate fails otherwise); the Genre header convention (each tenet enumerates its predecessors — this would be the ninth).
- Cross-proposal coupling: the same reader's `r2-adr0002-mechanization-register` (a new ADR-0002 Revisit-when #5) is this tenet's intended fail-loudly-register hook, mirroring the Rule 7 / ADR-0008 pairing. That is an ordering dependency (number assignment precedes the ADR-0002 amendment), not a defect; if the register proposal falls, the pairing is carried one-sided in this tenet's Related section.

## Lens 2 — content custody

Nothing loses a home; the custody risk runs the other way — restating content whose canonical home is elsewhere (the corpus's cross-link-never-restate convention):

- **Measure-first adoption pattern.** The drafted core's "(count violations in warn mode before error)" freezes one variant of a subtler recorded practice. The RCA (open question 2) describes the warn-and-count measurement; the 2026-06-10 cast-hygiene worklog records the operative posture as *zero-or-fully-triaged* — stage 1 went straight to `error` on a fully-triaged 12-site baseline, with the staging record living in the `eslint.config.js` rationale header. The tenet should cite that header as the operational record, not re-specify a single mode normatively.
- **Convention fit.** ADR-0005 Revisit #3's "append the rule rather than starting a new tenet" pre-authorization is scoped to documentation failure patterns; ADR-0008 Revisit #2's to classification registers. Mechanize-on-recurrence is enforcement economics over code, CI, DB-constraint, and harness surfaces — outside both. The Rule 7 → ADR-0008 precedent (a subject orthogonal to fail-loudly proper gets a standalone home, with a register instance remaining in ADR-0002) supports the standalone shape the proposal argues for. The proposal names the ADR-0002-Rule-8 alternative honestly; it omits the colorable ADR-0005-Rule-10 reading (correctives are documents), which the authored Alternatives section should name and decline on the scope grounds above.
- **No recorded decision is fought.** RCA open question 4 is genuinely open: the 2026-06-02 work-status SSOT consult (read end to end) references the RCA's open questions but settles only the G5 design space, not the tenet question. The postmortem directory's README fixes the RCA as a point-in-time record — cited, never retro-edited — which the proposal respects.
- **Calibration custody.** The §7.3 template-not-gate retraction (`docs/pre-merge-checklist.md`, "What this is — and what it is not": a mandatory checklist under an under-capable rotation produces *bungled* rather than missing documentation) and RCA G6's "never a gate" verdict are the corpus's paid-for calibration on mechanism overreach. The proposal's recorded counterargument covers marginal value, not gate-overreach; the authored tenet must carry this calibration or it will be misread as mandate-a-CI-gate-per-recurrence — a shape the corpus has already tried and retracted on one surface.

## Lens 3 — substitution test + fork

**Failure shape, most general form:** a corrective for a recurrence of an in-force discipline ships as more description; enforcement stays memory-bound; the third-plus instance lands on a worse surface. Surfaces the shape has hit or could hit: error-typing (six accreted sites), render-coupling (~9 excisions before ADR-0010 + harness), doc status (Lapse 2), cast justification (~50% sample conformance under review-only enforcement), band tags, capability metadata — and, worst case, **migrations**, which the history audit names the one place ADR-0002 fail-loud is structurally absent: a prose-only recurrence corrective there risks silent corruption of persisted user workspaces. Calibrated to that surface (ADR-0008's substitution test), a named obligation at corrective-authoring time is proportionate; losing the articulation leaves the assessment an audit-time observation, and audits run weeks apart.

**Deflations attempted, and outcomes:**

1. *"The render-coupling postmortem already contained mechanization recommendations and recurrence happened anyway — so the assessment obligation is redundant."* Partially lands, and sharpens the proposal rather than refuting it: that postmortem's recommendations were prose-channel deferrals — exactly the L3 leak (postmortem recommendations reliably evaporated; ledgered items did not). The tenet's "ships with (or is filed alongside)" clause carries its weight only if "filed" is pinned to the work-status store. Repair 3.
2. *"The tenet is itself guidance prose proposing to ban prose-only correctives."* The corpus's own natural experiment answers half of this: the tenet half of a tenet+mechanism pair is load-bearing (ADR-0010's Context — the name the author reaches for and review checks against). The other half stands as an obligation on the tenet itself: it must self-apply, shipping with its own proportionate hook (a mechanization-assessment line in the pre-merge checklist, which currently has none) and recording the judgment-shaped remainder as prose-only per its own escape clause. Repair 2.
3. *"Existing Revisit-when triggers already own this."* No: ADR-0005 #2, ADR-0008 #4, and ADR-0010 #1 fire on *tooling availability*, not on *recurrence*; their direction is opportunistic, the tenet's is obligatory at the moment the RCA shows the discipline leaks. The proposal records this counterargument accurately.
4. *"Obligation inflation — every trivial second instance demands ceremony."* The assessment is a paragraph-scale judgment; the corpus's tenets routinely accept small-per-event costs (ADR-0008's per-classification question, ADR-0009's capture triggers), and the proportionate-cost clause bounds the ship decision. Not a refutation.

**Fork.** The tenet is umbrella-level, domain-agnostic process. The generic flash-card fork author loses nothing; a young single-maintainer fork with no audit cadence inherits the obligation precisely when it is most exposed to the memory-as-only-guard failure the RCA §3 names. Net gain.

## Verdict

**Survives**, with a required repair set. The substrate is real and verified at first hand (RCA §3 and open question 4; audit L1 evidenced from both directions; ADR-0010's creation story); no recorded decision is fought; the corpus's amendment conventions permit — and the Rule 7 → ADR-0008 precedent supports — the standalone shape; the proposal already routes the file/don't-file decision to the maintainer with the marginal-value counterargument recorded. The repairs (gate-overreach calibration, self-application, work-status-pinned filing channel, measure-first wording deferring to the config's recorded posture, the declined-alternatives enumeration, synopsis/doc-graph/genre/work-status co-changes, serial number assignment, ordering with the ADR-0002 register proposal, RCA cited-never-edited) refine the draft without reducing its scope.

## Required repairs (binding if shipped)

1. **Calibration section:** mechanism ≠ merge gate. Record §7.3's template-not-gate retraction (capability-not-laziness rationale), G6's "never a gate," and the doc-graph advisory/gate split as the precedents; the assessment selects a rung (gate / advisory / harness / template line), it does not default to the top.
2. **Self-application note:** the tenet's own proportionate mechanization — a mechanization-assessment line added to `docs/pre-merge-checklist.md` in the same change — plus the recorded prose-only remainder per its own escape clause.
3. **Pin "filed alongside" to the work-status store** (the L3 lesson; the render-coupling arc as the worked counterexample). A prose recommendation does not discharge the obligation.
4. **Measure-first wording:** defer to `frontend/eslint.config.js`'s recorded zero-or-fully-triaged posture; cite the header, do not restate one mode.
5. **Alternatives:** name and decline three shapes — ADR-0002 Rule 8 with provisional-home flag; an ADR-0005 Rule 10 (out of documentation-authoring scope); remain practice-only.
6. **Co-changes in the same change:** synopsis entry + tenet count + posture list (cochange advisory will flag); doc-graph regeneration; Genre header per convention; an owning work-status item (natural parent: `adr-effectiveness-audits`) with refs to the RCA and the history-lessons audit.
7. **Number assignment at execution**, serialized against any other surviving new-ADR proposals from this cycle; if the ADR-0002 register proposal ships, its Revisit-when #5 names the assigned number; if not, the pairing is carried one-sided in Related.
8. **Cite, never edit, the RCA** (point-in-time record; open question 4 is answered by the ADR's existence, not by a retro-edit).

License of all quoted material: Public Domain (The Unlicense), per the source documents.
`````


---

## §1 · reader:n1

### Coverage (verbatim)

Read END TO END this session: (1) umbrella CLAUDE.md (in context via system prompt); (2) docs/adr-synopsis.md (329 lines); (3) docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (598 lines); (4) /tmp/adr-corpus-audit/evidence-digest.md (359 lines); (5) docs/adr/0007-file-size-and-information-density.md (139 lines); (6) docs/adr/0009-performance-investigation-discipline.md (661 lines); (7) docs/worklog/2026-06-10-types-split.md (211 lines); (8) docs/worklog/2026-06-10-review-scoring-named-seam.md (157 lines); (9) docs/worklog/2026-06-10-multi-writer-slots-get-owners.md (555 lines, incl. postscript and verbatim HRA appendix); (10) docs/notes/decisions-deferred.md (461 lines); (11) docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md (140 lines); (12) docs/notes/perf-capture-normalization-protocol.md (131 lines — read because the ADR-0009 restructure judgment required the companion doc's actual division of labor); (13) docs/rfcs/0001-adr-meta-review.md (343 lines — read because its Q8 bears directly on ADR-0007's status question); (14) frontend/eslint.config.js (792 lines — read in full so the trigger-#1 max-lines citation is clean); (15) frontend/CLAUDE.md (injected in full into context by the harness after the eslint read; read as displayed — its "ADR-0007 (proposed)" parenthetical is cited). Work-status store: read-only SELECTs only (the commissioned description query on refactoring-queue-adr0007; one id/state/disposition scan for ADR-/perf-related items). Git/tree verification: git show 39e200d (reorg commit date), wc -c over docs/adr/ (size ranking), grep over docs/adr/ for reorganization ADRs, grep of eslint.config.js. DELIBERATELY NOT READ: the three appendix parts (per the appendix access rule — all appendix material cited via digest pointers); docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md (optional grounding; ADR-0009 names it not-required; nothing cited from it beyond what ADR-0009 and the synopsis themselves state about it); backend/qeubo/ (licensing firewall); frontend/FILES.md and IDENTIFIERS.md (not consulted at all this session). Claims about perf-trace-parse.mjs's header and the work-status item texts quoted in worklogs are relayed as those documents' captured claims, attributed. No performance claims of my own are made anywhere in this report (ADR-0009); relayed perf numbers are the cited worklogs' captured claims.

### per-document verdict: ADR-0007 — File Size and Information Density (docs/adr/0007-file-size-and-information-density.md) — **status-change** (verbatim fields)

**rationale:** Six weeks of practice show de-facto acceptance; the 'Proposed' label is the only thing out of joint, and it is now generating real cost. Evidence: the C2 arc executed the ADR's refactor queue one day after authoring (2026-04-27, App.vue 593→500; investigation doc, verified); the migrations.ts rolling archive (2026-05-14) is a second worked intervention citing it (frontend/CLAUDE.md); the open in-progress work-status item refactoring-queue-adr0007 runs the Neutral clause as live policy (store description, read this session); the 2026-06-10 types.ts split (PR #384) was approved as a maintainer-signed *named deviation* warranted by the ADR's own exception text — a deviation regime presupposes a binding norm; worklogs disclaim its claims-register by name ('Line counts (record only — no ADR-0007 claim)', review-scoring worklog); eslint.config.js cites it as rule rationale twice and defers max-lines against its budgets; the synopsis counts it among 'the eight tenets'; and ADR-0009's own header sequences itself after it as a tenet. The cost of the label: a p2 verifier had to correct a candidate that assumed Accepted (digest -> p2 verify:exist:split-types-ts, corr. 2) — the ADR-0002 Rule 6 design-time-drift shape, paid in correction overhead. The corpus's own transition convention exists: ADR-0009's 'Resolved (user review, 2026-05-31)' acceptance record + ADR-0005 Rule 8's dated-amendment shape; maintainer sign-off is the gate, this audit only proposes. Two amendments ride along: the Not-goals directory-organization pointer is verified stale-and-misleading at HEAD (the frontend reorg landed 2026-05-11 as commit 39e200d without the ADR the bullet promises; decisions-deferred.md still says 'in flight'), and the acceptance note should record datedly that the density numeric thresholds have never been measured, plus the RFC-0001 Q8 bounded-vs-aspirational sharpening. Nothing in the ADR is dead or delegated: at 6,083 bytes it is the smallest corpus document, and every section except the numeric density thresholds has steered real work.

**load_bearing:** The type-catalogue exception text steered the 2,375-line types.ts split as its explicit warrant (worklog + store record); its over-fragmentation warning shaped the split's judgment calls (per-domain modules, not per-type files; AuthState+SystemMessage co-homed). §Format's contract-the-static discipline was validated by the C2 arc and restated in frontend/CLAUDE.md. The Neutral handled-on-touch clause is the operative policy of refactoring-queue-adr0007. The budgets ground the eslint max-lines deferral record (~69 files over 250, measured) and the 'thin renderer' rationale of the component→services boundary rule. The verifiers found its exception text *settled* the ADR-consistency of the split (digest -> p2 verify:fit:split-types-ts) — corpus text resolving a dispute directly.

**dead_or_misleading:** Misleading #1: Status 'Proposed' — contradicted by six weeks of binding practice; demonstrated reader cost (the p2 verifier correction). Misleading #2: the Not-goals bullet 'that decision is in flight per decisions-deferred.md and will produce its own ADR if it lands' — verified false on both halves at HEAD: the decision landed 2026-05-11 (feature-surface reorg, commit 39e200d) and no ADR exists (grep over docs/adr/ confirms); a reader is told a pending decision lives elsewhere when it shipped a month ago with the promised record never authored. Not misleading but unexercised: the §Density numeric thresholds (60/40 percent) — never measured (history audit §8; digest §1 ADR-0007(a)); the ADR honestly frames them as review-time soft guidance and its Consequences admit policy-not-mechanism, but Revisit #3 cannot be evaluated until the unmeasured state is recorded datedly. Nothing dead; nothing delegated elsewhere.

**trigger_status:** Re-derived count: 4 (matches the adr-triggers miner, digest §1 ADR-0007(a)). #1 (a linter or pre-commit hook automates the size or contraction rules): NOT FIRED — the lint host exists with four custom local rules, and max-lines is explicitly recorded as deferred warn-as-backlog (~69 files over 250 measured; eslint.config.js header, read e2e at HEAD); no firing, so nothing to record. #2 (tooling context windows or truncation semantics change): UNASSESSABLE from the repository — the calibration depends on view-tool behavior outside the tree; no evidence of firing in any evidence document. #3 (density metric proves too judgmental in practice): NOT FIRED, and currently not evaluable either way — the numeric metric has never been measured (history audit §8); live use is qualitative only (the types-split worklog's 'high density' sanction for the 851-line store/schema.ts). The proposed acceptance note records this so #3 stays assessable. #4 (a specific exception's classification turns out wrong): NOT FIRED — the type-catalogue exception was exercised on its own terms 2026-06-10 and held; per the store record the exception migrated from types.ts to store/schema.ts with AppSettings named the next seam. No fired triggers, hence no unrecorded firings; the ADR's bookkeeping is clean.

**fork_fitness:** Transfers wholesale — arguably the most domain-agnostic tenet in the corpus. Budgets, density, format-contraction, and the exception vocabulary (generated artifacts, state machines, type catalogues) contain nothing Go-, Vue-instance-, or even SPA-specific; Revisit #2 already names the recalibration condition (view-tool behavior) a fork would re-check. The 2026-06-10 split it warranted was executed band-aware partly *for* the fork (digest -> p3 gen-verify:split-types-ts: the carve 'advances'). One fork hazard is exactly the amendment proposed: the stale Not-goals pointer would carry a dangling, false promise into any fork that copies docs/adr/ without docs/notes/. After the two amendments, fit as-is.

### per-document verdict: ADR-0009 — Performance Investigation Discipline (docs/adr/0009-performance-investigation-discipline.md) — **amend** (verbatim fields)

**rationale:** Restructure and slim were considered and declined on the commissioned bar (dead / delegated / misleading — not 'long'). The ADR is the corpus's largest document (33,438 bytes, verified) and is genuinely a tenet-plus-tooling fusion, but the evidence shows every part earning its place: the discipline shaped all ~90 agents' output in the history review (digest §1 ADR-0009(b): every coverage note carries a no-perf-claims clause), it killed a wrong work item before work started (rb3-packet-receive-chunking, ~99ms re-measured vs ~2.35s claimed — 'applied to planning, not just claiming'), it suffered zero deflations under adversarial verification (digest §1 ADR-0009(e)), and its trigger bookkeeping is the corpus model (history audit L6). The 2026-06-10 multi-writer worklog is the tenet under fire, working: a counts-vs-wall-clock deviation from the commission's wording named loudly and grounded in the harness's documented comparable; an engine-availability complication surfaced and the tainted capture discarded; the verdict framed as 'insurance, not claims' with the unexercised review-session paths named as residual gap. A wholesale delegation of the metric vocabulary would fight Revisit #3's explicit text ('Extensions go in this ADR via the append-a-rule pattern') — engaged directly: the vocabulary stays. What the amendments fix instead: (a) one genuinely misleading sentence ('Two tools earn canonical-tool status' now heading four bullets); (b) the tenet/operator-manual seam gets named rather than left implicit — the operational companion already exists (docs/notes/perf-capture-normalization-protocol.md self-describes as exactly that, and the 2026-06-10 null check operated from the protocol note plus script headers, not from this ADR's tool mechanics), so adding it to Related with a routing rule stops the next tool arc from growing the ADR by another hundred lines of operating instructions while changing nothing normative; (c) one real Revisit-#3 gap practice surfaced: the Chromium path's counts-not-wall-clock comparable lives only in a script header and a worklog, exactly the per-investigation scatter the vocabulary section forbids — append it.

**load_bearing:** The closed-vocabulary discipline plus explicit-unsubstantiated qualifier is cited in every audit commission (digest -> p1 §0.1/§0.5/§0.6) and operated as a correction lens in verifier verdicts ('structural-by-inspection or explicit qualifier', 'substantiated by construction — brands erase'; digest §1 ADR-0009(c)). The calibration-on-perception section's case-2/case-3 orthogonality is the recorded resolution of the arc that birthed the tenet. The amendment's harness + Chrome/CDP surface is what the 2026-06-10 null check actually ran. The acceptance-criteria non-blocking posture (loud-marking, not merge gate) matches the §7.3 advisory-first calibration precedent the verifiers reused corpus-wide. Trigger #2's in-place dated firing record is cited as the corpus's model bookkeeping (history audit L6).

**dead_or_misleading:** Nothing dead — every section was exercised within the last ten days. Misleading, minor and mechanical: the Tools lead-in sentence 'Two tools earn canonical-tool status as of this tenet's codification' now sits above four bullets (two added by the 2026-06-01 amendment); the synopsis reproduces the error outright ('two canonical tools', a five-entry vocabulary — its ADR-0009 entry predates the amendment; synopsis-side fix filed cross-territory). Gap rather than misleading: the count-based Chromium comparison vocabulary lives outside the ADR (script header + worklog), against the vocabulary section's own 'Additions go here' rule. The dense operator detail (warmup-vs-leak calibration, UpdateCounters lane aside, parser-incompatibility specifics) is not misleading and mostly defines metric semantics; the routing-rule amendment prevents future accretion without removing anything.

**trigger_status:** Re-derived count: 5 (matches the adr-triggers miner, digest §1 ADR-0009(a)). #1 (a specific rule introduces its own failure mode): NOT FIRED — the closest stressor, the 2026-06-10 counts-vs-wall-clock deviation, was a commission-wording mismatch resolved inside the discipline, not a rule failing. #2 (canonical-tool surface needs replacement): FIRED 2026-06-01, RECORDED IN-PLACE — the dated amendment names the trigger by number and form; the corpus's model trigger bookkeeping (history audit L6). #3 (metric vocabulary stops covering perf-relevant axes): FIRED IN SUBSTANCE twice, both handled per the trigger's own append-pattern prescription — the render+patch per-component ranking (2026-05-31 green-arc correction; digest -> p1 harvest:audits, P5 landed at 0009:211-219) and the retained-heap tail-slope entry (2026-06-01, memory-leak class) — recorded in substance as dated in-place additions, though attributed under the #2 amendment header rather than to #3 by number (a bookkeeping nuance, not rot). A third instance is OPEN at HEAD: the Chromium counts-not-wall-clock comparable is recorded only in perf-trace-parse.mjs's header per the multi-writer worklog — proposal n1-adr0009-counts-vocabulary-append discharges it. #4 (a linter or CI gate can mechanise the substantiation check): NOT FIRED — no such gate at HEAD; no work-status item builds one (store scanned read-only this session). #5 (profile-share convention proves insufficient): NOT FIRED — a per-machine path variation is pre-emptively recorded in the Profile-share section flagged '(Revisit #5)' with the discipline unchanged, and the convention was exercised as-is on 2026-06-10 (traces under ~/w/vdc/chromium_profiles/ per the worklog).

**fork_fitness:** The discipline transfers intact: its Scope clause already extends to 'any sub-project added to the umbrella', and the closed-vocabulary/substantiation/perception-calibration core contains nothing domain-bound. Because the fork is a fork of this SPA, the tool surface largely transfers too: the Playwright/CDP capture + dedicated parser + heap harness and the metric vocabulary (handler distributions, LongTask, GC, inter-arrival, render/patch ranking, retained-heap tail-slope) are browser-generic. What is Go/KataGo-bound and must be re-derived by the fork: the scenario definitions, the example capture protocol in the amendment (b10 / visits-per-move / KataGo cold cache — though the cold-cache confound generalizes to any upstream result cache, as the companion protocol note's confound #1 makes explicit), and the worked-example prose (keydown dispatcher, packet paths). Revisit #2 already anticipates exactly this substitution: 'the tenet's discipline survives the substitution; only the tool names change'. No fork-driven change needed beyond the filed amendments.

### proposal `n1-adr0007-status-accepted` [status-change] → docs/adr/0007-file-size-and-information-density.md (verbatim)

**summary:** Flip Status from Proposed to Accepted with a dated acceptance record, on maintainer sign-off. Six weeks of practice treat the tenet as binding (deviations require maintainer approval against its exception text; a work-status item executes its Neutral clause; the synopsis counts it among the eight tenets), and the Proposed label has produced measured correction overhead (digest -> p2 verify:exist:split-types-ts, corr. 2). The acceptance note also records the two honestly-open questions so the label flip does not silently bless them.

**details:** Header: '- **Status:** Proposed' -> '- **Status:** Accepted (proposed 2026-04-26; accepted <date>, see the acceptance record below)'. Append after 'What this tenet does NOT mean' a dated section, convention per ADR-0009's 'Resolved (user review, 2026-05-31)' precedent + ADR-0005 Rule 8:

## Accepted (maintainer review, <date>)

Proposed 2026-04-26; accepted on review of six weeks of practice in which the tenet operated as binding in all but label: the C2 arc (2026-04-27, App.vue 593 -> 500 via three composable extractions) executed the refactor queue one day after authoring and validated §Format's contract-the-static discipline; the `migrations.ts` rolling archive (2026-05-14) is the second worked intervention; the work-status item `refactoring-queue-adr0007` executes the Neutral handled-on-touch clause as live policy; the 2026-06-10 `types.ts` split (PR #384) was approved as a *named deviation* warranted by this ADR's type-catalogue exception text — a deviation regime presupposes a binding norm; the lint config defers `max-lines` against these budgets and cites the tenet as rule rationale; `frontend/CLAUDE.md` restates the SFC discipline; `docs/adr-synopsis.md` counts this among the eight tenets.

Two questions stay open under acceptance, named so the label does not silently bless them: (1) the §Density numeric thresholds (60 / 40 percent) have never been measured in practice (2026-06-10 history-lessons audit §8); density operates as qualitative review judgment, and Revisit #3 remains the live trigger. (2) Per RFC-0001 open question 8, the budget language is sharpened to the practiced posture: when a refactor is undertaken, the budget is satisfied by stopping at the cleanest seam that meaningfully reduces working-memory cost (bounded), not by driving below the numeric threshold (aspirational); the C2 bounded-stopping evaluation is the worked precedent.

Co-changes in the same PR: docs/adr-synopsis.md's ADR-0007 entry drops 'Status as of authoring: Proposed.' (cochange-advisory will flag it); frontend/CLAUDE.md's 'ADR-0007 (proposed):' parenthetical in §Vue Single-File Components drops '(proposed)'. Content-only doc edits; no doc-graph structural regeneration required.

### proposal `n1-adr0007-notgoals-reorg-pointer` [amend] → docs/adr/0007-file-size-and-information-density.md (verbatim)

**summary:** The Not-goals bullet pointing at decisions-deferred.md is verified stale-and-misleading at HEAD: the frontend directory-organization decision it calls 'in flight' landed 2026-05-11 (feature-surface reorg, commit 39e200d) and the ADR it promises was never authored (no ADR in docs/adr/ records the reorganization principle). Re-point the bullet to the historical fact and surface the unfulfilled promise rather than papering over it.

**details:** Replace the bullet '- Not a directory-organization decision; that decision is in flight per `decisions-deferred.md` and will produce its own ADR if it lands.' with: '- Not a directory-organization decision. *(Updated <date>: the frontend decision this bullet tracked landed 2026-05-11 as the feature-surface reorganization of `components/` and `composables/` — commit `39e200d` — without the ADR the original text promised; the organizing principle is recorded only in that change's own record. The backend's decision *against* reorganizing remains in the deferred-decisions ledger.)*'

Co-change: docs/notes/decisions-deferred.md's 'Distinction from the frontend' paragraph (inside the backend source-tree entry) gets a dated outcome note per that ledger's own edit-on-fire convention — it still reads 'is in flight … the answer there is probably yes … will likely be recorded as a new ADR'.

Surfaced maintainer question (not part of the amendment): whether the feature-surface organizing principle deserves a retroactive decision record (the ADR-0005 Rule 6 omission already happened; a dated retro record is the standing corrective shape), or whether the commit/worklog record suffices. Genre would be 'decision', not tenet.

### proposal `n1-adr0009-tools-leadin-count` [amend] → docs/adr/0009-performance-investigation-discipline.md (verbatim)

**summary:** The Tools section's lead-in still says 'Two tools earn canonical-tool status as of this tenet's codification' while four bullets follow (two added by the 2026-06-01 amendment). One-sentence fix removes a count a skimming reader will get wrong — the synopsis already reproduced the error.

**details:** Replace 'Two tools earn canonical-tool status as of this tenet's codification.' with 'The canonical tool surface: two tools at this tenet's codification (2026-05-27), extended to four by the 2026-06-01 amendment recorded below.' The following sentence (the empirical-uplift warrant) stands unchanged. Dated inline per the ADR's own amendment conventions; no other text moves.

### proposal `n1-adr0009-companion-protocol-seam` [amend] → docs/adr/0009-performance-investigation-discipline.md (verbatim)

**summary:** Name the existing tenet/operator-manual seam instead of restructuring. The operational companion already exists and self-describes as exactly that (docs/notes/perf-capture-normalization-protocol.md: 'ADR-0009 governs *that* … this note records the *informal protocol*'), and the 2026-06-10 null check operated from the protocol note plus script headers, not from this ADR's tool mechanics. The ADR references it only obliquely (one inline mention, no path, absent from Related). Adding the Related entry plus a one-sentence routing rule stops the next tool arc from appending operating instructions to the ADR, without moving anything out.

**details:** Add to §Related: '- **`docs/notes/perf-capture-normalization-protocol.md`** — the operational companion: this tenet governs *that* a claim carries a capture and *how* perception reconciles against measurement; the protocol note carries the capture-comparability mechanics (confound control, normalization, harness operation). Canonical-tool *status* decisions — what is canonical, why, and known limits — live in this ADR and extend by dated amendment; capture *operating protocol* extends in the companion and the script headers it points at.'

Engagement with Revisit #3, explicit: this routing rule deliberately does NOT move the metric vocabulary — Revisit #3's append-a-rule pattern stays authoritative and untouched; only how-to mechanics are routed to the companion, prospectively. Nothing currently in the ADR is deleted: the existing operator detail (warmup-vs-leak calibration, parser-incompatibility facts) doubles as metric semantics and decision warrant, and removal would fail the dead/delegated/misleading bar. The relation description follows ADR-0005 Rule 3 (relation, not content snapshot).

### proposal `n1-adr0009-counts-vocabulary-append` [amend] → docs/adr/0009-performance-investigation-discipline.md (verbatim)

**summary:** Practice surfaced a metric-vocabulary gap the ADR's own rule forbids leaving where it is: the automated Chromium path compares operation counts, not wall-clock, and that comparable is currently recorded only in perf-trace-parse.mjs's header and the 2026-06-10 multi-writer worklog — per-investigation scatter, exactly what 'Additions go here, not in per-investigation worklogs' names. Append the entry via the ADR's own pattern; this is Revisit #3 firing and being discharged as designed.

**details:** Append to §Metric vocabulary, dated: '- **Count-based comparison for automated Chromium captures** (added <date>; Revisit #3 instance): the Chrome/CDP path's parser produces per-component `render` / `patch` *operation counts* and the render/patch ratio, normalized on the scenario-proxy marks (`autonav:step` for navigation volume; packet-handler marks such as `rb3:handler` for analysis volume). Counts are that path's comparable; duration percentiles (p50/p99) remain the Firefox-path comparable. Comparability is asserted on the scenario proxies *before* costs are compared, per the capture-normalization protocol. First worked use: the 2026-06-10 multi-writer-slots null check, whose deviation from a per-frame-medians commission wording was named loudly under this split.'

Optionally, the same edit adds '(also a Revisit #3 instance)' to the retained-heap entry's date note, fixing the attribution nuance recorded in my trigger walk — cosmetic, maintainer's call.

### proposal `n1-synopsis-adr0009-entry-stale` [amend] → docs/adr-synopsis.md (ADR-0009 entry) — cross-territory, defer to the synopsis-assigned reader for merge (verbatim)

**summary:** The synopsis's ADR-0009 entry predates the 2026-06-01 amendment: it says 'two canonical tools' and enumerates the five-entry starting vocabulary, omitting the Chrome/CDP and HeapProfiler surfaces, the render+patch ranking, and the retained-heap tail-slope metric. The synopsis self-declares that when it disagrees with an ADR, the ADR wins and the synopsis needs updating. Filed from the n1 seat because the staleness was found against my assigned ADR; the synopsis reader owns the merge.

**details:** In the ADR-0009 entry, replace 'two canonical tools (Firefox DevTools Performance with Vue's `app.config.performance = true` enabled in dev; `@firefox-devtools/profiler-cli` as the canonical parser)' with 'a canonical tool surface (manual Firefox investigation via Firefox DevTools Performance + `profiler-cli`, with Vue's `app.config.performance = true` in dev; automated/concurrent-load capture via Chrome DevTools/CDP-over-Playwright with a dedicated parser, plus CDP HeapProfiler for leak detection — the latter two added by the 2026-06-01 amendment)', and mark the metric-vocabulary clause as extended since codification (render+patch per-component ranking; retained-heap tail-slope). Coordinate with whatever the synopsis-assigned reader proposes for the entry; the cochange-advisory mechanics are theirs to confirm.

### proposal `n1-adr0007-overbudget-report-lead` [note] → docs/adr/0007-file-size-and-information-density.md (ecosystem, no ADR edit) (verbatim)

**summary:** The history audit's below-the-line section carries an unverified one-miner lead: a mechanically generated ADR-0007 over-budget report replacing the stale hand-maintained queue list. It composes with trigger #1's recorded warn-as-backlog max-lines candidate (~69 files over 250, measured at HEAD per the eslint header) and with lesson L5 (replace a mirror's decaying half with a generated report). No filing proposed from this seat — recording the adjacency so the maintainer's trigger-#1 decision, whenever taken, sees both halves at once.

**details:** If the maintainer ever adopts max-lines at warn, its output IS the over-budget report and the queue item's illustrative file list (already once corrected for staleness, per the 2026-06-02 investigation) can stop carrying counts entirely, per the stable-handles convention (audit §3.25). No ADR text change; no work-status write from this read-only audit.

### proposal `n1-no-new-tenet-from-n1-territory` [note] → corpus-level (n1 scope: ADR-0007 / ADR-0009) (verbatim)

**summary:** Answering the commission's inverse question for this assignment's territory: no new tenet is warranted. The paid-for lessons that touch these two ADRs fold into machinery that already exists — L1 (prose decays; mechanisms stick) is already encoded as both ADRs' own mechanization triggers (0007 #1, 0009 #4), deliberately unfired pending the measure-first adoption pattern; the 2026-06-10 cycle's perf lessons are a vocabulary append and a routing rule (proposals filed), not new principles.

**details:** The one genuinely undocumented decision found in this territory — the feature-surface reorganization principle whose ADR was promised and never authored — is genre 'decision', not tenet, and its disposition is surfaced as a maintainer question inside n1-adr0007-notgoals-reorg-pointer rather than as a new-ADR proposal from a read-only audit. Whether corpus-wide lessons (e.g., the trigger-sweep cadence, already folded into adr-effectiveness-audits per audit §3.23) justify tenet-level treatment is the synthesizer's question across all readers, not decidable from two ADRs.

### Report (verbatim)

`````markdown
# Reader n1 — ADR-0007 and ADR-0009 (generic ADR-corpus audit, 2026-06-10)

Commissioned reader report for the 2026-06-10 ADR-corpus audit (work-status item
`adr-effectiveness-audits`). Assignment: judge **ADR-0007** (file size and information
density; status still "Proposed") and **ADR-0009** (performance investigation
discipline; the corpus's largest document) against everything the project now knows —
retire / slim / merge / restructure / amend / status-change / keep — including fitness
for the maintainer's planned generic knowledge flash-card fork. Read-only; this report
proposes, the maintainer disposes. Per ADR-0009, no performance claims of my own appear
anywhere below; every number relayed is a cited document's captured claim, attributed.

## 1. Coverage

Read end to end this session: umbrella `CLAUDE.md` (in context); `docs/adr-synopsis.md`;
`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`; the evidence digest
(`/tmp/adr-corpus-audit/evidence-digest.md`); both assigned ADRs;
`docs/worklog/2026-06-10-types-split.md`;
`docs/worklog/2026-06-10-review-scoring-named-seam.md`;
`docs/worklog/2026-06-10-multi-writer-slots-get-owners.md` (including the verbatim HRA
appendix and postscript); `docs/notes/decisions-deferred.md`;
`docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md`;
`docs/notes/perf-capture-normalization-protocol.md` (read because the ADR-0009
restructure judgment required the companion document's actual division of labor);
`docs/rfcs/0001-adr-meta-review.md` (read because its Q8 bears on ADR-0007's status);
`frontend/eslint.config.js` (read in full so the trigger-#1 citation is clean); and
`frontend/CLAUDE.md` (provided in full in context). Work-status store accessed by
read-only `SELECT` only (the commissioned `refactoring-queue-adr0007` description; one
id/state/disposition scan). Tree verification: `git show 39e200d`, ADR byte-size
ranking, greps over `docs/adr/` and the eslint config.

Deliberately not read: the three appendix parts (per the appendix access rule; all
appendix material is cited via digest pointers in the form "digest -> pN §…");
`docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md` (optional per
ADR-0009's own Related note; nothing is cited from it beyond what ADR-0009 and the
synopsis themselves say about it); anything under `backend/qeubo/`. Claims about
`perf-trace-parse.mjs`'s header are relayed from the multi-writer worklog, attributed.

## 2. ADR-0007 — File Size and Information Density

**Verdict: status-change (Proposed → Accepted, maintainer-signed, dated record), plus
two amendments.** At 6,083 bytes it is the smallest document in the corpus; nothing in
it is dead, delegated, or — with two exceptions fixed below — misleading.

### 2.1 The status question

Practice shows de-facto acceptance on every axis the corpus offers:

- **Execution.** The C2 arc executed the ADR's refactor queue one day after authoring
  (2026-04-27, App.vue 593→500 via three composable extractions; the 2026-06-02
  investigation verified commits and worklogs). The `migrations.ts` rolling archive
  (2026-05-14) is a second worked intervention citing the ADR (`frontend/CLAUDE.md`).
- **Live policy.** The open, in-progress work-status item `refactoring-queue-adr0007`
  runs the ADR's Neutral clause (handled-on-touch) as its recorded posture, updated
  as recently as 2026-06-10 (store description, read this session).
- **The deviation regime.** The 2026-06-10 `types.ts` split (PR #384) proceeded as a
  maintainer-approved *named deviation* warranted by the ADR's own exception text
  ("type catalogues split along clean domain seams"). One does not seek approval to
  deviate from a proposal; a deviation regime presupposes a binding norm.
- **The claims register.** The review-scoring worklog titles a section "Line counts
  (record only — no ADR-0007 claim)" — contributors treat the ADR's claim vocabulary
  as live enough to disclaim by name.
- **Citation as authority.** `frontend/eslint.config.js` cites ADR-0007 twice as rule
  rationale and records the `max-lines` deferral against its budgets;
  `frontend/CLAUDE.md` restates the SFC discipline; the synopsis counts it among "the
  eight tenets"; ADR-0009's own header sequences itself after it as a tenet.

The label's cost is measured, not hypothetical: a verification agent in the history
review had to correct a candidate that assumed the ADR was Accepted (digest -> p2
verify:exist:split-types-ts, corr. 2) — ADR-0002 Rule 6's design-time-drift shape, paid
as correction overhead. Meanwhile `frontend/CLAUDE.md` enforces the discipline while
labeling it "(proposed)": the label does no work; the rule binds anyway.

Is "Proposed" still honest? The two genuinely open matters — the never-measured density
thresholds, and RFC-0001 open question 8's bounded-vs-aspirational language ambiguity
(RFC-0001 confirmed `Status: Draft` at HEAD) — are Revisit-#3-class refinements, not
acceptance blockers. The corpus's own convention for the transition exists: ADR-0009's
"Resolved (user review, 2026-05-31)" acceptance record, plus ADR-0005 Rule 8's
dated-amendment shape. Proposal `n1-adr0007-status-accepted` drafts the header flip and
a dated acceptance record that names the practice evidence **and** the two open
questions, so acceptance does not silently bless them; it also folds in the RFC-0001 Q8
sharpening (budgets are bounded clean-seam stopping points, not ceilings to drive to —
the C2 bounded-stopping evaluation is the precedent). Co-changes: the synopsis entry's
"Status as of authoring: Proposed." line and `frontend/CLAUDE.md`'s "(proposed)"
parenthetical.

### 2.2 The Not-goals pointer — verified stale and misleading

The bullet "Not a directory-organization decision; that decision is in flight per
`decisions-deferred.md` and will produce its own ADR if it lands" is false on both
halves at HEAD:

- The frontend decision landed 2026-05-11: commit `39e200d`, "reorganize components/
  and composables/ into feature-surface subdirs" (verified by `git show`).
- No ADR followed: a grep over `docs/adr/` for reorganization/directory-organization
  finds only ADR-0007 itself and ADR-0008's unrelated negative-register substrate.
- `decisions-deferred.md`'s "Distinction from the frontend" paragraph still reads "in
  flight … the answer there is probably yes … will likely be recorded as a new ADR" —
  unedited despite that ledger's own edit-on-fire convention.

A reader is told a pending decision lives elsewhere when it shipped a month ago without
the promised record. Proposal `n1-adr0007-notgoals-reorg-pointer` re-points the bullet
to the historical fact, co-changes the deferred-decisions paragraph, and surfaces (not
decides) the maintainer question of a retroactive decision record for the
feature-surface principle — the one genuinely undocumented decision found in this
assignment's territory.

### 2.3 Density: unexercised, not over-claimed

The 60/40-percent thresholds have never been measured (history audit §8; digest §1
ADR-0007(a)). They are not misleading as written — the ADR frames them as "operational
thresholds at review" and its Consequences admit "policy, not mechanism" — but Revisit
#3 ("the density metric proves too judgmental") cannot be evaluated while the
unmeasured state goes unrecorded. The live use of density is qualitative: the
types-split worklog sanctions the 851-line `store/schema.ts` partly on "the bulk is
doc-comment decision content (high density)". The acceptance record carries the dated
unmeasured note; no slimming proposed — the bar is dead/delegated/misleading and the
density section is none of these.

### 2.4 Trigger walk (re-derived count: 4 — matches the adr-triggers miner)

1. **Lint automates size/contraction rules — NOT FIRED.** Lint host exists (four
   custom local rules); `max-lines` explicitly deferred as a warn-as-backlog candidate,
   "~69 files over 250" measured (eslint header at HEAD). Nothing to record.
2. **View-tool truncation semantics change — UNASSESSABLE** from the repository; no
   evidence of firing in any evidence document.
3. **Density too judgmental — NOT FIRED**, and not evaluable either way until the
   never-measured state is recorded (see §2.3).
4. **An exception's classification turns out wrong — NOT FIRED.** The type-catalogue
   exception was exercised on its own terms 2026-06-10 and held; per the store record
   it migrated from `types.ts` to `store/schema.ts`, with `AppSettings` named the next
   seam. The opposite of "turned out wrong".

No fired triggers, hence no unrecorded firings; bookkeeping clean.

### 2.5 Fork fitness

Transfers wholesale — likely the most domain-agnostic tenet in the corpus. Budgets,
density, format-contraction, and the exception vocabulary carry nothing Go-bound;
Revisit #2 names the only recalibration a fork would re-check (view-tool behavior). The
split it warranted was executed band-aware partly *for* the fork (digest -> p3
gen-verify:split-types-ts: advances). The stale Not-goals pointer is the one thing that
would carry a false promise into a fork; fixed by the amendment.

## 3. ADR-0009 — Performance Investigation Discipline

**Verdict: amend (three targeted amendments). Restructure and slim considered and
declined on the commissioned bar.** Confirmed the corpus's largest document
(33,438 bytes, verified by byte count).

### 3.1 How the tenet performed

The evidence is unusually one-sided. In the 90-agent history review the discipline was
embedded in every commission and visibly shaped output — every coverage note carries a
no-perf-claims clause (digest §1 ADR-0009(b)). It killed a wrong work item before work
started: `rb3-packet-receive-chunking` was dropped when a pre-refactor attribution
re-measured at ~99 ms against a claimed ~2.35 s — "ADR-0009 applied to planning, not
just claiming" (digest -> p1 harvest:work-status, finding 3). Verifiers used it as a
correction lens, not a dispute surface (claims reframed to "structural-by-inspection or
explicit-unsubstantiated"; brand-arc neutrality accepted as "substantiated by
construction — brands erase"). It suffered zero deflations (digest §1 ADR-0009(e)). And
the history audit's L6 names it (with ADR-0005) as one of only two ADRs whose fired
triggers were recorded properly.

The 2026-06-10 multi-writer worklog shows the tenet under fire, working end to end: a
deviation from the commission's literal wording ("per-frame medians" is the
Firefox-profiler vocabulary; the Chromium harness's documented comparable is counts,
not wall-clock) named loudly and grounded; an engine-availability complication
surfaced and the tainted capture discarded rather than used; the verdict framed as
"insurance, not claims"; the unexercised review-session paths named as residual gap;
traces filed per the share convention. This is the discipline's intended shape
executing under real friction.

### 3.2 The size question: tenet + operator manual, and what to do about it

The fusion is real: alongside the normative core (closed claim vocabulary, three
triggers, acceptance criteria, perception calibration, exceptions) sit four tool
bullets with parser-incompatibility detail, script paths, a DevTools display-lane
aside, warmup-vs-leak calibration prose, and a capture-protocol record in the
amendment. Three findings govern the disposition:

1. **Nothing is dead or deflated.** Every section was exercised within the last ten
   days (vocabulary and share convention in the null check; tools in the capture;
   exceptions and calibration in verifier verdicts).
2. **Revisit #3's letter protects the metric vocabulary**: "Extensions go in this ADR
   via the append-a-rule pattern." A restructure that delegates the vocabulary to a
   reference doc fights the ADR's own text; I decline it and leave the vocabulary in
   place. Much of the remaining "manual" prose is actually metric *semantics* (the
   tail-slope discriminant, render≫patch as the coupling tell) or decision *warrant*
   (why the tools earned canonical status) — removal would fail the
   dead/delegated/misleading bar and the residue is "long", which the bar excludes.
3. **The tenet/operator-manual seam already exists in the ecosystem and is
   half-recorded.** `docs/notes/perf-capture-normalization-protocol.md` self-describes
   as exactly the split: "ADR-0009 governs *that* … this note records the *informal
   protocol*" — and the 2026-06-10 null check operated from the protocol note plus
   script headers, not from the ADR's tool mechanics. Yet the ADR references it only
   once, inline, pathless, and it is absent from Related.

So: no surgery; name the seam. Proposal `n1-adr0009-companion-protocol-seam` adds the
companion to Related with an ADR-0005-Rule-3 relation description plus a one-sentence
routing rule — tool-*status* decisions extend the ADR by dated amendment; capture
*operating protocol* extends in the companion — which is what prevents the next tool
arc from growing the ADR by another hundred lines of operating instructions.
`n1-adr0009-tools-leadin-count` fixes the one genuinely misleading sentence: "Two
tools earn canonical-tool status" now heads four bullets (the synopsis has already
reproduced the wrong count).

### 3.3 A vocabulary gap practice surfaced (Revisit #3, live at HEAD)

The Chromium automated path's comparable — per-component render/patch operation counts
plus the R/P ratio, normalized on scenario-proxy marks — is recorded only in
`perf-trace-parse.mjs`'s header and the multi-writer worklog. That is per-investigation
scatter, the exact thing the vocabulary section forbids ("Additions go here, not in
per-investigation worklogs"). Proposal `n1-adr0009-counts-vocabulary-append` discharges
it via the ADR's own append pattern, recording the counts-vs-percentiles split between
the two capture paths and citing the 2026-06-10 null check as first worked use.

### 3.4 Trigger walk (re-derived count: 5 — matches the adr-triggers miner)

1. **A rule introduces its own failure mode — NOT FIRED.** The counts-vs-wall-clock
   deviation was a commission-wording mismatch resolved inside the discipline.
2. **Canonical-tool surface needs replacement — FIRED 2026-06-01, recorded
   in-place**; the dated amendment names the trigger by number — the corpus's model
   bookkeeping (history audit L6).
3. **Vocabulary stops covering an axis — FIRED IN SUBSTANCE, twice handled per the
   trigger's own prescription** (render+patch ranking from the green-arc correction;
   retained-heap tail-slope 2026-06-01), recorded as dated in-place additions though
   attributed under the #2 amendment header rather than to #3 by number — a
   bookkeeping nuance, not rot. **A third instance is open at HEAD** (§3.3), with a
   discharge proposal filed.
4. **CI gate can mechanise the substantiation check — NOT FIRED.** No such gate at
   HEAD; no work-status item builds one (store scanned read-only).
5. **Profile-share convention proves insufficient — NOT FIRED.** A per-machine path
   variation is pre-emptively recorded in the Profile-share section, flagged
   "(Revisit #5)", discipline unchanged; the convention was exercised as-is on
   2026-06-10.

### 3.5 Fork fitness

The discipline transfers intact — its Scope clause already covers any sub-project, and
the normative core is domain-free. Because the fork is a fork of this SPA, most of the
tool surface transfers too: the CDP capture/parse/heap harness and the whole metric
vocabulary are browser-generic. Go-bound residue the fork re-derives: scenario
definitions, the amendment's example capture protocol (b10 / visits / KataGo
cold-cache — though the cold-cache confound generalizes to any upstream result cache,
as the companion note's confound #1 makes explicit), and worked-example prose. Revisit
#2 anticipates exactly this substitution: "the tenet's discipline survives the
substitution; only the tool names change."

## 4. The new-tenet question (n1 territory)

No new tenet warranted from these two ADRs' territory. The six-week lessons that touch
them fold into machinery that already exists: L1 (prose decays; mechanisms stick) is
encoded as both ADRs' own mechanization triggers (0007 #1, 0009 #4), deliberately
unfired pending the measure-first adoption pattern; the 2026-06-10 cycle's perf lessons
are a vocabulary append and a routing rule, both filed as amendments. The one
undocumented decision found (the feature-surface reorganization principle, whose ADR
was promised and never authored) is genre "decision", not tenet; its disposition is
surfaced as a maintainer question, not a proposal from a read-only audit.

## 5. Proposals filed (summary)

| id | target | kind |
|---|---|---|
| n1-adr0007-status-accepted | ADR-0007 | status-change (Proposed → Accepted, dated record; synopsis + frontend/CLAUDE.md co-changes) |
| n1-adr0007-notgoals-reorg-pointer | ADR-0007 | amend (stale Not-goals pointer; decisions-deferred co-change; maintainer question on a retro reorg record) |
| n1-adr0009-tools-leadin-count | ADR-0009 | amend ("Two tools" lead-in vs four bullets) |
| n1-adr0009-companion-protocol-seam | ADR-0009 | amend (Related entry + routing rule; Revisit #3 engaged and preserved) |
| n1-adr0009-counts-vocabulary-append | ADR-0009 | amend (Chromium counts comparable, per the append-a-rule pattern) |
| n1-synopsis-adr0009-entry-stale | adr-synopsis.md | amend (cross-territory; synopsis reader owns merge) |
| n1-adr0007-overbudget-report-lead | ADR-0007 ecosystem | note (unverified one-miner lead, trigger-#1 adjacency) |
| n1-no-new-tenet-from-n1-territory | corpus | note |

## 6. Flags for the synthesizer

- **Synopsis staleness against ADR-0009** (proposal filed): "two canonical tools" and
  the five-entry vocabulary predate the 2026-06-01 amendment. The digest separately
  records that almost no agent in the 90-agent corpus read the synopsis at all — this
  is a second concrete instance of the synopsis lagging an amended ADR.
- **decisions-deferred.md** carries the stale "in flight" frontend-reorg paragraph
  (folded into my Not-goals proposal). Low-confidence adjacency, ADR-0003 readers'
  territory: the backend-reorg entry's trigger #1 ("a second domain implementation
  actually being planned") may deserve a look against the fork, though that entry's
  own rationale (backend already domain-agnostic post-34b) suggests no firing.
- **RFC-0001** is `Status: Draft` at HEAD, self-describes a seven-ADR corpus, and its
  Layer-2 validity audit is effectively materialized by `adr-effectiveness-audits`
  without the RFC ever ratifying — a corpus-governance observation outside any single
  reader's assignment.
- **Trigger-count caveat discharged for n1**: the digest warns the 38-trigger total
  was not independently reproduced; my end-to-end re-derivations match the miner for
  both assigned documents (ADR-0007: 4; ADR-0009: 5).

License of all quoted material: Public Domain (The Unlicense), per the source
documents.
`````


---

## §1 · reader:n2

### Coverage (verbatim)

Read END TO END: umbrella CLAUDE.md (in context per commission; not re-read); docs/adr-synopsis.md; docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; /tmp/adr-corpus-audit/evidence-digest.md; all ten ADRs (docs/adr/0001 through 0010); docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md; tools/doc-graph/cochange-advisory.mjs (full source); docs/handoff-current.md; docs/onboarding/orientation.md; README.md; docs/pre-merge-checklist.md; docs/worklog/2026-06-10-deferral-harvest.md; docs/worklog/2026-06-10-doc-graph-dangling-signal-cleanup.md; docs/worklog/2026-06-10-keyed-cache-brand-and-stable-handles.md. Row-level only (sanctioned): docs/doc-graph-report.md (grep for ADR/postmortem-knob/analysis-persistence rows). Mechanical verification only, NOT read end to end, no content claims made beyond the verified pattern: frontend/src/services/backend-service.ts (grep: the `raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` fallback chain is absent at HEAD; mapToReviewCard exists at :92; :125 reads `canonicalContent: raw.canonical_content`); frontend/src/composables/forest/useTreeLayout.ts (head -16: header block only, confirming the self-updated pathname); file-existence checks (ls/find) for paths cited by ADR Related sections; git log/show/tag for dates and v1.1.0. Work-status store: two read-only SELECTs (header-linter items: 0 rows; ADR-related items: 5 rows incl. adr-record-amendments-2026-06 closed, adr-effectiveness-audits open/in-progress). NOT opened, per the appendix access rule: audit-spa-history-lessons-2026-06-10-appendix-p{1,2,3}.md (cited only via digest pointers). NOT read: anything under backend/qeubo/ (licensing firewall); docs/archive/notes/design/analysis-persistence-plan.md (existence-checked only); docs/notes/consolidation-xref-fallout.md (relayed via digest + the dangling-signal worklog, both read e2e). One claim not in the digest and verified first-hand instead: the synopsis ADR-0009 entry's staleness against ADR-0009's 2026-06-01 amendment (both documents read e2e at HEAD; commit dates verified via git).

### per-document verdict: docs/adr/0005-documentation-discipline.md — **amend** (verbatim fields)

**rationale:** The nine rules are heavily exercised and settled real disputes during the 90-agent review (Rules 1/3/8/9 used as working tools — digest -> p2 verify:fit verdicts passim), and ADR-0005 is one of only two ADRs whose trigger bookkeeping was the corpus's model (the in-place 2026-06-01 firing record). The bounded defect is that its mechanization record has fallen behind reality: the co-change advisory (tools/doc-graph/cochange-advisory.mjs, 2026-06-02 — a partial net for exactly the Rule 1/Rule 3 derived-summary hazard, per its own header) and the 2026-06-10 dangling-signal arc (origin buckets live/executed/frozen, tombstones, directory-reference resolution, advisory no-new-danglers ratchet) are partial mechanizations the ADR does not record; its Negative bullet and Alternative C still describe the 2026-06-01 state, and the Related section's artifact enumeration includes the no-longer-committed SVG (docs/doc-graph.svg is gitignored at HEAD). A worklog record alone is not enough because the ADR body makes claims the new tooling partially falsifies. Rule 8's in-place '(Updated 2026-06-02.)' paragraph is consistent with the sibling-revision principle — dated, additive, original preserved, immediate forward-pointer to Rule 9 — and the residual Rule 8 text is clean enough for a cold reader (the superseded marker vocabulary is corrected one paragraph later in reading order). Nothing warrants slimming or restructuring.

**load_bearing:** The most-exercised documentation tenet in the corpus: Rule 1 grounded multiple audit findings (O12-O15 collision; parallel-convention warnings); Rule 3 classified census decay; Rule 8 + the Amendments-header precedent prescribed the ADR-0001/0003 repair shape; Rule 9 governs the design-note lifecycle; Revisit #3's pre-authorized append is the corpus's amendment engine (used by ADR-0002 Rules 6/7 and this ADR's own Rules 8/9). Digest -> p2 §2.4 + verdicts passim.

**dead_or_misleading:** Nothing dead. Mildly misleading at HEAD: the 'no automated check' phrasing in Negative/Alternative C understates the post-2026-06-02 state; Related's `docs/doc-graph.{json,svg,md}` includes the off-tree SVG; the `backend/routers/REFERENCE.md` mention dangles mechanically (historically voiced — 'lived' — so not misleading to a careful reader, but it sits in the validator's live missing-on-disk class).

**trigger_status:** 3 triggers re-derived (matches digest 0005:3). #1 (a rule introduces its own failure mode): not-fired — no evidence in the audit or digest. #2 (documentation tooling matures): FIRED 2026-06-01 and recorded in place (the corpus's model record); fired again in substance on 2026-06-02 (co-change advisory) and 2026-06-10 (report origin buckets, tombstones, directory refs, advisory ratchet — worklog 2026-06-10-doc-graph-dangling-signal-cleanup.md) — these further firings are NOT recorded in the ADR; the trigger is correctly held live for the Rule 4 linter and the parallel-TODO checker, both still unbuilt. #3 (new failure pattern → append a rule): fired twice (Rule 8, 2026-05-07; Rule 9, 2026-06-02), both recorded via the Amendments header line; stays live by design.

**fork_fitness:** The discipline travels whole. Rules 2 (dispatch ledger path) and 9 (anchoring to the maintainer's todo Postgres DB) presume umbrella infrastructure a fork must re-instantiate — the project already authors for this (the 2026-06-10 stable-handles convention requires handles that 'resolve in any clone/fork without the maintainer's DB'). The doc-graph + co-change tooling is zero-dependency and repo-local; it travels with the tree.

### per-document verdict: docs/adr/0006-source-file-headers.md — **amend** (verbatim fields)

**rationale:** Healthy tenet; the amendment is one line. Across ~90 agents the header convention generated zero disputes and zero enforcement activity (digest §1 ADR-0006: 'that silence is a datum') — I read the silence as the convention being internalized and uncontroversial rather than dead, while noting honestly that header conformance was never measured. The one verified defect at HEAD: the exemplar citation `frontend/src/composables/useTreeLayout.ts` (Context and Related) dangles — the file moved to `composables/forest/` and its own header was correctly updated on the move (the convention working exactly as designed), so only the ADR's citation rotted. A `.ts` target is invisible to the doc-graph validator (BACKTICK_PATH_RE is .md-only per the 2026-06-10 dangling-signal worklog), so no mechanism will ever catch this; fix via dated amendment per the ADR-0010 path-fix precedent (digest -> p2 verify:fit:adr-trigger-sweep, corr. 5: 'not a silent body edit'). Retirement/slim/merge all fail the bar: nothing is dead, delegated, or misleading beyond the one path.

**load_bearing:** Composes with ADR-0004 (self-locating files reduce partial-visibility cost) and with the umbrella's licensing posture (per-file Unlicense declaration is load-bearing at vendoring/extraction boundaries, e.g. the proxy NOTICE-boundary care named in CLAUDE.md). CLAUDE.md lists it among the four governing ADRs.

**dead_or_misleading:** Only the stale exemplar path (two occurrences: the quoted header block's first line and the Related bullet). The Context's description of backend mixed practice is an authoring-time record and reads as such.

**trigger_status:** 3 triggers re-derived (matches digest 0006:3). #1 (tooling to auto-generate/verify headers): not-fired — nothing under tools/ checks headers (digest -> p1 harvest:adr-triggers: 'cheap candidate') and no work-status item exists (psql: SELECT over items for '%header%' returned 0 rows). #2 (license posture changes): not-fired. #3 (a new sub-project lands): not-fired. Nothing fired, nothing unrecorded; the tenet's bookkeeping is clean.

**fork_fitness:** Fully portable: pathname + purpose + license is domain-free; the form sections cover the same stacks the fork inherits. Revisit #2 already anticipates a license-posture change. Travels as-is.

### per-document verdict: docs/adr-synopsis.md — **amend** (verbatim fields)

**rationale:** It is the right single derived summary: it carries the `derived-from` marker, the co-change advisory covers it in CI, the header states 'the ADR wins' and the update duty, and orientation.md routes every cold session through it as a mandatory full read. Per-entry depth (1-2 paragraphs) is right. Two verified defects: (a) the ADR-0009 entry is stale since 2026-06-01 — 'two canonical tools' names only Firefox DevTools + profiler-cli, while ADR-0009 at HEAD carries four canonical capture surfaces (the 2026-06-01 amendment added Chrome DevTools via CDP-over-Playwright for automated/concurrent-load capture and CDP HeapProfiler for leak detection) plus metric-vocabulary extensions (per-component render+patch ranking with the render ≫ patch tell; retained-heap tail-slope) and the scenario harness. Structurally explainable and mechanically uncatchable: the amendment (commit 2edb199/db8aefb, 2026-06-01) predates the advisory (9a915de, 2026-06-02), and the advisory is deliberately per-PR-diff, never state-based — pre-advisory drift persists until a human finds it; the 2026-06-02 synopsis edit (1071d21) updated only the 0005/0002 entries. Not in digest; verified first-hand against both documents at HEAD. (b) 'The two decisions (ADR-0001, ADR-0003)' flattens ADR-0003's self-declared genre (Bounded Context Map, 'a third genre') — a mild ADR-0008 closest-match the handoff and orientation repeat. Everything else verifies: the 'eight tenets' arithmetic is correct (0002, 0004-0010); the 0001/0003 entries reflect their 2026-06-10 amendments; the 0010 entry correctly needs no update (its 2026-06-10 amendment is recorded as no-content-change); the 0002/0005 entries' rule counts and supersession history are accurate; the family claims match the ADRs' own Related sections.

**load_bearing:** The corpus's single navigational summary and the cold session's mandatory read (orientation.md step 4; CLAUDE.md: 'read the synopsis before substantive work'). The digest notes only one of 90 audit agents read it end to end — thinness worth knowing, though it reflects those agents' commissions, not the document's design.

**dead_or_misleading:** The 0009 entry's 'two canonical tools' is the one actively misleading line at HEAD — a reader planning a perf investigation from the synopsis would miss the canonical automated capture path and the memory-leak metric. The 'two decisions' genre flattening is mild.

**trigger_status:** No Revisit-when section — it is a derived navigational document, not an ADR; 0 triggers. Its freshness duty is carried by the cochange advisory, whose per-PR-diff design (verified in source: 'transience is structural'; 'Deliberately not that' regarding state-based checks) is blind to drift predating 2026-06-02 — exactly one such instance verified (the 0009 entry).

**fork_fitness:** Travels as the fork's onboarding spine; every entry is umbrella-instanced and co-evolves with the ADRs the fork inherits and amends. The derived-from marker + zero-dep advisory script travel with the tree, so the same drift protection applies in the fork from day one.

### per-document verdict: corpus — **amend** (verbatim fields)

**rationale:** The corpus architecture is sound — genre lines, append-only dated amendments, Revisit sections, one marked derived summary with CI advisory — and nothing in scope warrants retire/merge. The system-level repairs: (a) The derived-summary web has exactly one Rule-1-clean member. Synopsis: marked, advisory-covered, accurate except the 0009 entry. handoff-current.md 'Architectural governance': an unmarked ~95-line parallel per-ADR summary with verified drift — it calls ADR-0005 'Seven rules' (nine at HEAD; Rules 8/9 missing, i.e. stale since 2026-05-07) and describes ADR-0002 Rule 7's provisional-home flag as live ('may relocate when a classification-discipline tenet is articulated') while listing ADR-0008 in the same section — self-contradictory; ironically its 0009 bullet is fresher than the synopsis's. This is the same Rule 1/Rule 3 drift shape ADR-0003's inline inventory had (fixed by delegation) and the RCA's Lapse 2 found for status; the honest fix is delegation (proposal n2-handoff-governance-delegate-to-synopsis). orientation.md's reference list is delegation-style and clean (one genre-flattening phrase; 0007's Proposed status unmentioned — minor). README's ADR paragraph is clean delegation, but its Documentation/Project-status sections carry verified rot: `docs/notes/analysis-persistence-plan.md` cited as a 'planned feature' (file moved to docs/archive/notes/design/; feature shipped) and 'v1.0.0 has shipped' as current status while v1.1.0 is tagged. (b) Header consistency: ordinal-with-full-predecessor-enumeration in genre lines is an append-only historical fact — no drift risk, only linearly growing write-time verbosity; ADR-0001 alone lacks Genre and Scope lines (predates the template); Status fields consistent everywhere (0007 Proposed faithfully carried by all summaries); ADR-0009 alone records amendments as trailing body sections with no Amendments header line. (c) License footers on 0008/0009/0010 only: noise — ADR-0006 exempts markdown; the newer house style adds footers; harmonize on touch, no sweep. (d) Amendment conventions: heterogeneous in shape (header entries 0001/0002/0003/0005/0010; in-place dated updates 0005 Rule 8; trailing sections 0009) but coherent in principle — every change is dated, additive, and preserves the planning-time record; no silent edit found. The worst cold-reader load is ADR-0002 Rule 7 (~70 lines of rule + now-obsolete provisional-home rationale + retirement paragraph) — still integrable because sequentially dated; a second supersession of that size would warrant a compressed-restatement-plus-history shape. (e) Cross-ADR accuracy at HEAD (overlaps n1's documents; verified here, flagged for the synthesizer): ADR-0002 Rule 7's two postmortem cites and ADR-0002/0003's `../notes/analysis-persistence-plan.md` cites are stale relative paths (targets moved to postmortem/ and archive/notes/design/) that the doc-graph validator cannot see (`../`-relative, so outside its match — other docs' references to the same old paths ARE listed in the report; the ADRs' are not); ADR-0002's third exception cites the `raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` compat shim in present tense, but the chain is absent from backend-service.ts at HEAD (digest -> p3 new-exist:reviewcard-canonical-content, corr. c flagged it unread; grep-verified absent here). Also flagged: ADR-0003's amendment says trigger #1 'fired twice', where the digest's main-vs-appendix tension 1 records the more careful appendix position (one adopter materialized; chess-clone's own gate unmet). (f) Fork: see fork_fitness.

**load_bearing:** ADR text settled most of the 36+16 verifier disputes directly; verifiers had to construct only where the corpus is silent (digest §2 'settled vs constructed'). The corpus is doing its job.

**dead_or_misleading:** System-level: the handoff governance section is the one actively drift-misleading surface; the stale relative refs in 0002/0003 and the present-tense shim example are the misleading-at-the-margin items; license-footer and header-shape variance is noise.

**trigger_status:** Corpus-wide: 38 Revisit-when triggers independently re-derived from the ten ADRs at HEAD (0001:5, 0002:4, 0003:4, 0004:2, 0005:3, 0006:3, 0007:4, 0008:4, 0009:5, 0010:4) — confirming the miner's figure the digest flagged as not independently reproduced. Bookkeeping is now current for 0001/0003/0005/0009/0010 (the adr-record-amendments-2026-06 item is closed in the store; amendments verified at HEAD). The remaining weakness is cadence, already filed under adr-effectiveness-audits (open/in-progress), plus the unrecorded second-wave 0005 #2 firing named above.

**fork_fitness:** ADR-0002/0004/0005/0006/0007/0008 travel as-is (0005 Rules 2/9 need infrastructure re-instantiation). ADR-0009/0010 travel because the fork forks this Vue SPA — the tool surface and render rules remain apt; they would not survive a re-platform, which is not what is planned. ADR-0001 travels as policy with its instance lists re-derived (the container/value-object split is structural; Move/Point etc. are Go-bound). ADR-0003 travels as the extraction map (its own 2026-06-10 amendment is the fork's instruction manual) and is then superseded by the fork's own band map. Nowhere does the corpus say how a fork consumes it — no statement on whether ADRs travel as inherited history, how numbering continues, or which references get re-pointed; the closest is ADR-0003's non-game sizing. Gap filed as n2-fork-consumption-protocol.

### proposal `n2-synopsis-0009-entry-refresh` [amend] → docs/adr-synopsis.md (verbatim)

**summary:** The ADR-0009 entry is stale since the ADR's 2026-06-01 amendment: it names two canonical tools where the ADR now has four canonical capture surfaces, an extended metric vocabulary, and a scenario harness. The per-PR-diff advisory can never flag this pre-advisory drift; fix by hand. Optionally fix the 'two decisions' genre flattening in the same touch.

**details:** In the ADR-0009 entry, replace: 'two canonical tools (Firefox DevTools Performance with Vue's `app.config.performance = true` enabled in dev; `@firefox-devtools/profiler-cli` as the canonical parser);' with: 'a canonical tool surface (Firefox DevTools Performance with Vue's `app.config.performance = true` in dev, parsed by `@firefox-devtools/profiler-cli`, for manual investigation; since the 2026-06-01 amendment, Chrome DevTools Performance captured via CDP-over-Playwright — `frontend/scripts/perf-capture.mjs` with a dedicated parser, since `profiler-cli` cannot ingest Chrome traces — for automated and concurrent-load captures, plus CDP `HeapProfiler` (`frontend/scripts/perf-heap.mjs`) for leak detection, and a pluggable scenario harness for reproducible before/after pairs — recommended, not mandated);'. And replace: 'a starting metric vocabulary (per-handler / per-frame `RefreshObserver` / `LongTask` / GC / inter-arrival distributions);' with: 'a starting metric vocabulary (per-handler / per-frame `RefreshObserver` / `LongTask` / GC / inter-arrival distributions; per-component render+patch ranking with render ≫ patch read as render-coupling; retained-heap tail-slope per cycle for leaks);'. Optionally, in 'How to read these together', replace 'The two decisions (ADR-0001, ADR-0003) describe specific structural choices' with 'The two structural records — ADR-0001 (a decision) and ADR-0003 (a bounded-context map) — describe specific structural choices'. The cochange advisory will not flag this PR (no ADR source changes); no doc-graph regeneration needed (content-only).

### proposal `n2-adr0005-mechanization-note-2026-06-10` [amend] → docs/adr/0005-documentation-discipline.md (verbatim)

**summary:** Record the second wave of partial mechanization (the 2026-06-02 co-change advisory; the 2026-06-10 dangling-signal report classes and ratchet) where the ADR records the first (Amendments line + Alternative C), and fix the off-tree-SVG enumeration in Related. The worklog alone is insufficient because the ADR body's 'no automated check' claims are now understated.

**details:** Append to the Amendments header line: '2026-06-10 — noted that the Revisit-when #2 mechanization has widened since the 2026-06-01 firing: a co-change advisory (`tools/doc-graph/cochange-advisory.mjs`, 2026-06-02) flags derived docs (declared via `derived-from` markers) whose sources change in a PR without them — a partial, advisory-only net for the Rule 1 / Rule 3 derived-summary hazard; and the dangling-reference report gained origin buckets (live / executed / frozen), tombstones for retired hubs, directory-reference resolution, and an advisory no-new-danglers ratchet (work-status item `doc-graph-dangling-signal-cleanup`). Advisory-not-gate per Alternative C's reasoning; the judgment core of Rules 3 and 6 remains policy. No rule change.' In Alternative C's 'Partly adopted 2026-06-01' paragraph, append one sentence: 'A co-change advisory (2026-06-02) extends this to declared derived docs whose sources change without them; the dangling-ref report gained origin classification and an advisory ratchet (2026-06-10).' In the Related doc-graph bullet, change `docs/doc-graph.{json,svg,md}` to `docs/doc-graph.{json,md}` with '(the SVG renders locally and is gitignored — see docs/notes/vestige/deferred-items/doc-graph-svg-render-off-tree.md)'. Optionally annotate the `backend/routers/REFERENCE.md` mention in Rule 5 as historical ('since relocated') to clear it from the live missing-on-disk dangler class. Content-only edits except the Related path change, which is a re-cross-reference — regenerate the doc-graph in the same change.

### proposal `n2-adr0006-exemplar-path-amendment` [amend] → docs/adr/0006-source-file-headers.md (verbatim)

**summary:** The exemplar citation dangles: useTreeLayout.ts moved to composables/forest/ and its own header self-updated correctly; only the ADR's two citations rotted. The .ts target is invisible to the doc-graph validator, so only a hand fix catches it. Follow the ADR-0010 dated-amendment precedent for path fixes.

**details:** Add an Amendments header line (the ADR currently has none): '- **Amendments:** 2026-06-10 — corrected the exemplar path (`frontend/src/composables/useTreeLayout.ts` → `frontend/src/composables/forest/useTreeLayout.ts`; the file moved in a source-tree reorganisation and its own header self-updated per this tenet — only this ADR's citation had rotted). No content change.' Then update both occurrences: the Context paragraph's path and the quoted header block's first line (`src/composables/useTreeLayout.ts` → `src/composables/forest/useTreeLayout.ts`, matching the file at HEAD), and the Related bullet. Structural (re-cross-reference) only in the .md sense if the generator tracked .ts targets — it does not, so this is content-only; no regeneration strictly required.

### proposal `n2-handoff-governance-delegate-to-synopsis` [restructure] → docs/handoff-current.md (verbatim)

**summary:** The 'Architectural governance' section is an unmarked ~95-line parallel per-ADR summary with verified drift (ADR-0005 'Seven rules' vs nine; ADR-0002 Rule 7's provisional-home flag described as live while ADR-0008 is listed in the same section). This is the ADR-0005 Rule 1/Rule 3 drift shape the project already fixed twice by delegation (ADR-0003 → FILES.md; status → the todo DB). Slim it to a delegation + genre note, keeping the drift-slow personality paragraph.

**details:** Replace the per-ADR paragraphs under '## Architectural governance — ADRs and tenets' with: (1) the existing lead ('The ten foundational architectural records live in docs/adr/ … All ten apply project-wide …'), amended to name the genres honestly: 'two structural records (ADR-0001, a decision; ADR-0003, a bounded-context map) and eight tenets (ADR-0002, 0004–0010; ADR-0007 still Proposed)'; (2) an explicit delegation sentence: 'The condensed per-ADR reference is docs/adr-synopsis.md — the single derived summary, co-change-checked in CI against the ADRs; this section deliberately does not duplicate it (ADR-0005 Rule 1).'; (3) keep the closing 'Together they establish the codebase's architectural personality: …' paragraph verbatim (one-phrase-per-ADR, drift-slow, genuinely orientational) and the 'Read all ten' sentence. This deletes both verified errors structurally rather than patching them. Weaker alternative if the maintainer wants the depth retained: fix the two errors in place and add a `<!-- derived-from: docs/adr/*.md -->` marker so the advisory covers the handoff — but note the advisory only checks same-PR touch (a handoff edit for unrelated reasons silently satisfies it), and double maintenance of two long summaries remains; delegation is the cleaner shape and matches project precedent. Content-only; no doc-graph regeneration unless cross-references are removed (they are — the section cites no paths after the slim, so regenerate in the same change).

### proposal `n2-readme-docs-section-refresh` [amend] → README.md (verbatim)

**summary:** README's ADR paragraph is clean delegation, but its Documentation list cites docs/notes/analysis-persistence-plan.md as a 'planned feature' (the file moved to docs/archive/notes/design/ and the feature shipped) and its Project-status section reads 'v1.0.0 has shipped' as the current state while v1.1.0 is tagged.

**details:** In '## Documentation', drop or re-point the `analysis-persistence-plan.md` line (the doc is archived at docs/archive/notes/design/analysis-persistence-plan.md; the capability shipped — handoff-current.md describes the live analysis-persistence path) and re-verify the rest of that enumeration on the same touch (`frontend-backlog.md` exists; the archive/playbooks lines are stable). In '## Project status', update the headline to v1.1.0 (tag verified at HEAD) or rephrase to avoid carrying a release headline at all — pointing at the work-status store and handoff for currency, which is the G5-consistent shape. 'The next undertaking is distribution packaging' matches handoff and the store and can stand. Path changes are re-cross-references — regenerate the doc-graph in the same change.

### proposal `n2-adr0002-0003-stale-relative-refs` [amend] → corpus (verbatim)

**summary:** Three stale `../notes/` relative references in ADR-0002/0003 evade the doc-graph validator (it does not match `../`-relative paths — other docs' references to the same old targets ARE in the report; the ADRs' are not), and ADR-0002's third exception cites a compat shim in present tense that is gone at HEAD. Overlaps the n1 reader's documents; verified here and flagged for the synthesizer.

**details:** (1) ADR-0002 Rule 7: `../notes/postmortem-knob-registry-qeubo-domain-2026-05.md` and `../notes/postmortem-knob-toolbar-popover-2026-05.md` → `../notes/postmortem/…` (the 2026-06 notes-hierarchy reorg; ADR-0008 already cites the correct paths). (2) ADR-0002 Related and ADR-0003 Related: `../notes/analysis-persistence-plan.md` → `../archive/notes/design/analysis-persistence-plan.md`, with ADR-0003's 'future-project planning note' wording adjusted to past tense (the feature shipped). (3) ADR-0002 'Backend stale-bundle compat shims' exception: the `raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` chain is absent from frontend/src/services/backend-service.ts at HEAD (grep-verified; :125 reads the canonical field directly) — recast the example in past tense ('had fallback chains …; the 34b-cleanup removed them when the skew window closed'), keeping the exception class itself, which remains sound. Each per the dated-amendment convention, plausibly folded into one 'Related-section repairs' amendment per ADR. (4) Tooling note for the maintainer: BACKTICK_PATH_RE could resolve `../`-relative refs against the citing file's directory — small generator change that would have caught (1)/(2); advisory section only, per the dangling-signal arc's posture. Digest anchors: digest -> p3 new-exist:reviewcard-canonical-content corr. c (the :346 chain flagged for a docs sweep); the postmortem-path staleness is not in digest (found by direct verification).

### proposal `n2-genre-vocabulary-three-way` [note] → corpus (verbatim)

**summary:** All three derived summaries flatten ADR-0003's self-declared genre (Bounded Context Map, 'a third genre') into 'decision' (synopsis: 'the two decisions'; handoff: filed under '### Decisions'; orientation: '0001 and 0003 are decisions') — a mild ADR-0008 closest-match against a two-genre vocabulary the corpus itself declares as three.

**details:** Two honest resolutions, maintainer's pick: (a) the summaries adopt the three-genre phrasing ('two structural records — a decision and a bounded-context map'; folded into proposals n2-synopsis-0009-entry-refresh and n2-handoff-governance-delegate-to-synopsis; orientation gets the same one-phrase fix on next touch), or (b) ADR-0003's genre line gains a parenthetical '(operationally grouped with the decisions in derived summaries)' accepting the two-way operational split. Option (a) is cheaper and changes no ADR. Low priority; no consumer has misbehaved on it.

### proposal `n2-header-consistency-on-touch` [note] → corpus (verbatim)

**summary:** Header-shape variance across the ten ADRs is real but mostly harmless; record the on-touch fixes rather than sweep. The ordinal-with-full-predecessor-enumeration pattern is an append-only historical fact with no drift risk — only growing write-time verbosity for future tenets.

**details:** Observed at HEAD: ADR-0001 alone lacks Genre and Scope lines (predates the template; retrofit on next substantive touch). ADR-0009 alone records amendments as trailing body sections ('Resolved', 'Amended (2026-06-01)') with no Amendments header line — a one-line header entry pointing at the trailing sections would restore scanability; the in-body integration itself is good (dated 'added 2026-06-01' markers in the Tools section). License footers exist on 0008/0009/0010 only — noise (ADR-0006 exempts markdown; the newer house style adds footers); harmonize on touch if at all. Ordinal enumeration: suggest future tenets state 'the Nth tenet' without enumerating all predecessors — the synopsis owns the roster; no retro-edit of existing headers (the enumerations are stable historical facts). Amendment-convention verdict for the record: heterogeneous in shape, coherent in principle — every observed change is dated, additive, and preserves the planning-time record; the heaviest cold-reader load is ADR-0002 Rule 7 (~70 lines of rule + obsolete provisional-home rationale + retirement paragraph), still integrable because sequentially dated; a second supersession of that size in any ADR would warrant a compressed-restatement-with-history-below shape.

### proposal `n2-adr0006-header-linter-item` [note] → docs/adr/0006-source-file-headers.md (verbatim)

**summary:** ADR-0006 Revisit #1's subject (a header linter) is unbuilt and untracked: no tooling exists and no work-status item exists (psql verified). Under L1 (prose disciplines decay; mechanisms stick) and the ADR's own Negative ('a linter could automate the pathname check and might be a good first step'), filing a cheap lint item is worth the maintainer's consideration.

**details:** Suggested item: a pathname-header check (frontend: leading JSDoc/`<script>` JSDoc first line equals the file's subproject-relative path; backend: module docstring first line likewise), advisory-first per the project's adoption practice (measure in warn mode, then error — the no-floating-promises precedent recorded in eslint.config.js). Scope per the ADR's exemptions (generated files, config, __init__.py). Note honestly: no incident has been traced to a missing header, and header conformance was never measured (the audit's coverage limits) — this is L1-preventive, not corrective, so 'future' disposition is reasonable. The tenet itself needs no change; Revisit #1 fires when the tool exists.

### proposal `n2-fork-consumption-protocol` [note] → corpus (verbatim)

**summary:** No document states how the generic flash-card fork consumes the ADR corpus — whether ADRs travel as inherited history, how numbering continues, which references are umbrella-bound. ADR-0003's non-game sizing is the closest statement and covers only the code bands.

**details:** A short paragraph, natural home either the synopsis's 'How to read these together' tail or ADR-0003's fork section, along these lines: 'A fork inherits docs/adr/ wholesale as its decision history: the eight tenets and ADR-0001 apply unchanged (re-deriving instance lists where they name Go types); ADR-0003 is the extraction map a fork reads once and then supersedes with its own band map; umbrella-bound infrastructure named by ADR-0005 Rules 2/9 (the dispatch ledger convention, the work-status store) is re-instantiated, not inherited — repo-resident handles resolve in any clone (the stable-handles convention); new fork decisions continue the numbering with their own records.' Needs maintainer direction on where it lives (the fork's own onboarding doc may be the better home once it exists); filed as a note rather than a drafted amendment for that reason.

### proposal `n2-new-tenet-mechanization-discipline` [new-tenet] → corpus (verbatim)

**summary:** The inverse question answered: the six weeks' paid-for lesson that justifies new tenet-level content is L1 / the RCA's common root cause — disciplines held only by prose and one person's memory decay measurably, and only mechanical nets arrest the aggregate-only defect class. Recommended shape: an appended ADR-0005 Rule 10 ('disciplines declare their enforcement surface') rather than a standalone ADR-0011, per ADR-0005's own Revisit #3 pre-authorization. Maintainer call — the RCA explicitly queued this as its open question 4.

**details:** Decision core (drafted ready-to-apply as ADR-0005 Rule 10, '*(Appended 2026-06-DD.)*'): 'Rule 10: Disciplines declare their enforcement surface. A discipline whose violations are invisible at authoring time and accumulate only in aggregate is incomplete as prose. When a discipline is authored or amended — an ADR rule, a CLAUDE.md convention, a checklist line — its record names the mechanism that polices it (lint, test, CI advisory, DB constraint, generated report), or carries an explicit policy-only admission naming why mechanization is declined now and the trigger that would change that (the existing per-tenet `discipline is policy, not mechanism` Negative bullets and mechanization Revisit triggers are this rule's pre-existing instances, made mandatory for new disciplines). When an incident reveals a discipline held only by memory, the corrective pairs the named rule with a mechanism — tenet+mechanism is what arrests recurrence; a describing-only document does not (the render-coupling natural experiment; RCA §3).' Substrate to cite: history audit L1 (cast-justification ~50% in a 32-site sample under review-only enforcement; render-coupling recurred ~9 times until ADR-0010 + the harness, none since; every RCA-minted lint held; censuses rotted within weeks — digest -> p1 mech-conformance §3, p1 git-narrative finding 5, p2 verify:fit:scoped-state-registry corr. 1) and RCA §3's cross-surface diagnosis with its open question 4 deferring exactly this call. Honest counter-arguments to record in the Alternatives: (a) every existing tenet already carries the policy-not-mechanism admission and a mechanization trigger — the rule systematizes existing per-ADR boilerplate, marginal value is moving the duty from post-incident to authoring time; (b) the project demonstrably already behaves this way after incidents without the rule; (c) L1's own corollary warns the budget belongs in mechanisms, 'not writing more guidance prose' — a one-paragraph rule-append minimizes that irony where a full ADR-0011 would maximize it; (d) scope fit: ADR-0005's Scope ('all authoring of documentation … includes ADRs') covers the act being governed (authoring discipline records), so Rule 10 is within the tenet's own absorb-by-append mandate; if the maintainer reads the subject as bigger than documentation authoring, a standalone ADR-0011 with this same core is the alternative.

### Report (verbatim)

`````markdown
# ADR-corpus audit — reader n2: the documentation family + corpus-as-a-system (2026-06-10)

Commissioned reader report for the generic ADR-corpus audit (work-status item `adr-effectiveness-audits`). Assignment: verdicts on ADR-0005 (documentation discipline), ADR-0006 (source-file headers), and `docs/adr-synopsis.md` judged as a corpus document; plus the corpus-as-a-system review (derived-summary web, header/genre/status consistency, amendment-convention scalability, cross-ADR accuracy, fork fitness). Read-only; proposals only — the maintainer signs off before anything is applied. No performance claims of my own are made (ADR-0009); relayed claims are attributed.

## 1. Coverage

Read end to end: the umbrella CLAUDE.md (in context); `docs/adr-synopsis.md`; the history audit (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`); the evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`); **all ten ADRs**; `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`; `tools/doc-graph/cochange-advisory.mjs` (full source); `docs/handoff-current.md`; `docs/onboarding/orientation.md`; `README.md`; `docs/pre-merge-checklist.md`; and the three 2026-06-10 worklogs (deferral-harvest, doc-graph-dangling-signal-cleanup, keyed-cache-brand-and-stable-handles).

Row-level only (sanctioned): `docs/doc-graph-report.md`. Mechanical verification only, not read end to end: `frontend/src/services/backend-service.ts` (grep for one pattern's absence), `frontend/src/composables/forest/useTreeLayout.ts` (header block only), file-existence checks, git log/show/tag. Work-status store: two read-only SELECTs. **Not opened:** the audit appendix parts p1–p3 (cited only via digest pointers, per the access rule) and anything under `backend/qeubo/`. One load-bearing claim below (the synopsis ADR-0009 entry's staleness) is **not in the digest**; it is verified first-hand against the two documents at HEAD, both read end to end.

## 2. Verdicts on assigned documents

### ADR-0005 — Documentation Discipline: **amend** (bounded; otherwise keep)

The most-exercised documentation tenet in the corpus. During the 90-agent review its rules functioned as working tools: Rule 1 grounded the O12–O15 collision finding and the parallel-convention warnings; Rule 3 classified census decay; Rule 8 plus the Amendments-header precedent prescribed the ADR-0001/0003 repair shape; Rule 9 produced the `refs.kind` wrinkle (digest → p2 verdicts passim). Its trigger bookkeeping was the corpus's model — the Revisit #2 firing (doc-graph CI, 2026-06-01) is recorded in place.

The bounded defect: **the mechanization record has fallen behind reality.** Since 2026-06-01 two further partial mechanizations landed for exactly the hazards Rules 1/3 name — the co-change advisory (`tools/doc-graph/cochange-advisory.mjs`, 2026-06-02; its own header names "the ADR-0005 Rule 3 hazard") and the 2026-06-10 dangling-signal arc (origin buckets live/executed/frozen, tombstones, directory-reference resolution, advisory no-new-danglers ratchet). The ADR's Negative bullet and Alternative C still describe the 2026-06-01 state; the Related section enumerates `docs/doc-graph.{json,svg,md}` though the SVG is gitignored/off-tree at HEAD. The worklog records exist, but the ADR body makes claims the new tooling partially falsifies, so a dated note is warranted (proposal n2-adr0005-mechanization-note-2026-06-10).

On the commissioned Rule 8 question: the in-place "(Updated 2026-06-02.)" paragraph is **consistent** with the sibling-revision principle — dated, additive, the original preserved, an immediate forward-pointer to Rule 9. A cold reader meets the superseded `design-note:` marker vocabulary first and its correction one paragraph later; bounded and acceptable.

**Triggers (3 re-derived; matches digest 0005:3).** #1 not-fired. #2 fired 2026-06-01, recorded in place; fired again in substance 2026-06-02 and 2026-06-10, **unrecorded**; correctly held live for the Rule 4 linter and parallel-TODO checker (both unbuilt). #3 fired twice (Rules 8, 9), both recorded; live by design.

**Fork fitness.** The discipline travels whole. Rules 2 (dispatch ledger) and 9 (todo-DB anchoring) presume umbrella infrastructure a fork re-instantiates — the project already authors for this (the stable-handles convention requires handles resolving "in any clone/fork without the maintainer's DB"). The doc-graph/advisory tooling is zero-dep and repo-local.

### ADR-0006 — Source-File Headers: **amend** (one line; otherwise healthy)

Across ~90 agents the header convention generated zero disputes and zero enforcement activity (digest §1: "that silence is a datum"). I read the silence as internalized-and-uncontroversial rather than dead — while noting honestly that header conformance was never measured (audit §8 coverage limits). The tenet is cheap, composes with ADR-0004 and the licensing posture, and no trigger has fired.

The one verified defect: the exemplar citation `frontend/src/composables/useTreeLayout.ts` **dangles** — the file moved to `composables/forest/`, and its own header self-updated correctly on the move (the convention working exactly as designed; only the ADR's citation rotted). A `.ts` target is invisible to the doc-graph validator (`BACKTICK_PATH_RE` is `.md`-only per the dangling-signal worklog), so no mechanism will ever catch it. Fix via dated amendment per the ADR-0010 path-fix precedent (proposal n2-adr0006-exemplar-path-amendment).

**Triggers (3 re-derived; matches digest 0006:3).** #1 (header tooling) not-fired — nothing under `tools/` checks headers and **no work-status item exists** (psql: 0 rows for `%header%`). #2 (license posture) not-fired. #3 (new sub-project) not-fired. Bookkeeping clean. Under L1 (prose decays; mechanisms stick) a cheap pathname-lint item is worth filing (proposal n2-adr0006-header-linter-item), but the tenet itself needs no change.

**Fork fitness.** Fully portable; Revisit #2 already covers a license-posture change. Travels as-is.

### docs/adr-synopsis.md: **amend**

It is the right single derived summary: `derived-from` marker, CI advisory coverage, an explicit "the ADR wins" disclaimer, and orientation.md routes every cold session through it as a mandatory full read. Per-entry depth (1–2 paragraphs) is right. Verified against all ten ADRs at HEAD:

- The 0001 and 0003 entries **reflect their 2026-06-10 amendments** (writer-enumeration lint; FILES.md delegation, fired-twice trigger, B2-splits sizing).
- The 0010 entry correctly needs no update — its 2026-06-10 amendment is recorded as "No content change."
- "How to read these together": the **"eight tenets" arithmetic is correct** (0002, 0004–0010); the ADR-0002/0008/0009 family claims match those ADRs' Related sections.
- **Defect (a), actively misleading, not in digest:** the ADR-0009 entry says "two canonical tools" — stale since the ADR's 2026-06-01 amendment added Chrome DevTools via CDP-over-Playwright and CDP `HeapProfiler` (four canonical capture surfaces), the render+patch ranking and retained-heap tail-slope metrics, and the scenario harness. Mechanically uncatchable: the amendment (2026-06-01) predates the advisory (2026-06-02), and the advisory is deliberately per-PR-diff, never state-based — verified in its source ("transience is structural"). The 2026-06-02 synopsis edit updated only the 0005/0002 entries. This audit is the catch the mechanism cannot supply. Proposal n2-synopsis-0009-entry-refresh carries ready-to-apply text.
- **Defect (b), mild:** "The two decisions (ADR-0001, ADR-0003)" flattens ADR-0003's self-declared genre (Bounded Context Map — "a third genre"); handoff and orientation repeat the flattening (proposal n2-genre-vocabulary-three-way).

The digest's observation that only one of 90 audit agents read the synopsis is a thinness datum about those commissions, not about the document's design.

**Triggers:** none — a derived navigational document; freshness duty is the advisory's, whose structural blind spot (pre-2026-06-02 drift) produced exactly one verified instance.

**Fork fitness.** Travels as the fork's onboarding spine; the marker + zero-dep advisory script travel with the tree, so the same drift protection applies in the fork from day one.

## 3. Corpus-as-a-system findings

**(a) Derived-summary web.** Four members, one clean. *Synopsis:* marked, advisory-covered, accurate except the 0009 entry — the Rule-1-clean delegation target. *handoff-current.md "Architectural governance":* an unmarked ~95-line parallel per-ADR summary with verified drift — it calls ADR-0005 "**Seven rules**" (nine at HEAD; stale since 2026-05-07's Rule 8) and describes ADR-0002 Rule 7's provisional-home flag as **live** ("may relocate when a classification-discipline tenet is articulated") while listing ADR-0008 in the same section — self-contradictory within one screen; ironically its 0009 bullet is *fresher* than the synopsis's. This is the Rule 1/Rule 3 drift shape the project has already fixed twice by delegation (ADR-0003 → FILES.md; status → the todo DB, RCA guard G5). Honest fix: slim to a delegation + genre note, keeping the drift-slow one-phrase-per-ADR personality paragraph (proposal n2-handoff-governance-delegate-to-synopsis; the weaker keep-depth alternative — a `derived-from` marker on handoff — is named there with its limits). *orientation.md:* delegation-style, clean (one genre-flattening phrase; 0007's Proposed status unmentioned — minor, on-touch). *README:* the ADR paragraph is clean delegation, but the Documentation list cites `docs/notes/analysis-persistence-plan.md` as a "planned feature" (file moved to `docs/archive/notes/design/`; capability shipped) and Project status reads "v1.0.0 has shipped" as current while **v1.1.0 is tagged** (proposal n2-readme-docs-section-refresh).

**(b) Header consistency.** Status fields consistent (0007 Proposed everywhere, faithfully carried by all summaries — no drift on the one Proposed status). Date lines present everywhere. ADR-0001 alone lacks Genre and Scope lines (predates the template; retrofit on touch). The ordinal-with-full-predecessor-enumeration pattern ("the seventh tenet, after …") is an **append-only historical fact** — no drift risk, since predecessors never change; the liability is only linearly growing write-time verbosity, so the suggestion is forward-looking (future tenets state the ordinal without the roster; the synopsis owns the roster) with no retro-edit (proposal n2-header-consistency-on-touch).

**(c) License footers.** Present on 0008/0009/0010 only. ADR-0006 exempts markdown from headers; the newer house style (worklogs, postmortems, audits) adds footers, and 0008+ follow it. **Noise** — harmonize on touch if at all; no sweep (ADR-0004 posture).

**(d) Amendment-convention scalability.** Shapes observed: header entries + inline corrected bullets (0001); header entries + appended rules + in-body retirement paragraphs (0002); header narrative + inline notes + an added section (0003); header + in-place dated rule update (0005); trailing `Resolved`/`Amended` body sections with **no Amendments header line** (0009); header entry only (0010). Heterogeneous in shape, **coherent in principle**: every observed change is dated, additive, and preserves the planning-time record — no silent edit found anywhere in the corpus. The heaviest cold-reader load is ADR-0002 Rule 7: ~70 lines spanning the rule, its now-obsolete provisional-home rationale, and the retirement paragraph — still integrable because sequentially dated and each paragraph names its successor; a second supersession of that size anywhere would warrant a compressed-restatement-with-history-below shape. ADR-0009's missing header line is a one-line consistency fix (folded into n2-header-consistency-on-touch).

**(e) Cross-ADR accuracy at HEAD** (overlaps the n1 reader's documents; verified here, flagged for the synthesizer — proposal n2-adr0002-0003-stale-relative-refs): ADR-0002 Rule 7's two postmortem cites (`../notes/postmortem-knob-*.md`) and ADR-0002/0003's `../notes/analysis-persistence-plan.md` cites are stale (targets moved to `postmortem/` and `archive/notes/design/`) — and the validator **cannot see them**: it does not match `../`-relative paths (other documents' references to the same old paths *are* in the report; the ADRs' are not). ADR-0002's third exception cites the `raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` compat chain in present tense; the chain is absent from `backend-service.ts` at HEAD (grep-verified; digest → p3 new-exist:reviewcard-canonical-content, corr. c had flagged the line for a docs sweep). Also relayed for n1: ADR-0003's amendment says trigger #1 "fired twice", where the digest's main-vs-appendix tension 1 records the more careful appendix position (one adopter materialized; `chess-clone`'s own gate unmet). ADR-0005's Related/ADR-0006's Related defects are covered in §2.

**(f) Corpus and fork.** ADR-0002/0004/0005/0006/0007/0008 travel as-is (0005 Rules 2/9 need infrastructure re-instantiation). ADR-0009/0010 travel **because the fork forks this Vue SPA** — tool surface and render rules remain apt; they would not survive a re-platform, which is not what is planned. ADR-0001 travels as policy with instance lists re-derived. ADR-0003 travels as the extraction map (its 2026-06-10 amendment is the fork's instruction manual) and is then superseded by the fork's own band map. **Nowhere does the corpus say how a fork consumes it** — numbering continuation, inherited-history status, which references are umbrella-bound; closest is ADR-0003's non-game sizing. Filed as n2-fork-consumption-protocol (note; needs maintainer direction on the home).

**Trigger arithmetic, corpus-wide.** Independently re-derived from the ten ADRs at HEAD: 0001:5, 0002:4, 0003:4, 0004:2, 0005:3, 0006:3, 0007:4, 0008:4, 0009:5, 0010:4 — **total 38**, confirming the miner's figure the digest flagged as not independently reproduced (digest header caveat). Bookkeeping is current at HEAD for 0001/0003/0005/0009/0010 (`adr-record-amendments-2026-06` closed in the store; amendments verified in the files); the residual gaps are the unrecorded second-wave 0005 #2 firing (§2) and cadence, already filed under `adr-effectiveness-audits`.

## 4. The new-tenet question

The six weeks' paid-for lesson that rises to tenet level is L1 / the RCA's common root cause: disciplines held only by prose and one person's memory decay measurably (cast-justification ~50% in a 32-site sample; censuses rotting within weeks), and only mechanical nets arrest the aggregate-only defect class (render-coupling recurred ~9 times until tenet+harness, none since; every RCA-minted lint held — digest §2 L1). The RCA explicitly queued this as its open question 4 ("does the recurrence across three surfaces warrant a tenet?").

My recommendation: **yes, but as an appended ADR-0005 Rule 10** ("disciplines declare their enforcement surface"), not a standalone ADR-0011 — ADR-0005's Scope covers the act being governed (authoring discipline records are documentation authoring), and its Revisit #3 pre-authorizes absorbing new disciplines by append. The drafted decision core, the substrate citations, and the honest counter-arguments (every tenet already carries the policy-not-mechanism admission; the project already behaves this way post-incident; L1's own corollary warns against more guidance prose — which a one-paragraph rule-append minimizes and a full ADR maximizes) are in proposal n2-new-tenet-mechanization-discipline. Maintainer call either way.

## 5. Proposal index

| id | target | kind |
|---|---|---|
| n2-synopsis-0009-entry-refresh | docs/adr-synopsis.md | amend |
| n2-adr0005-mechanization-note-2026-06-10 | ADR-0005 | amend |
| n2-adr0006-exemplar-path-amendment | ADR-0006 | amend |
| n2-handoff-governance-delegate-to-synopsis | docs/handoff-current.md | restructure |
| n2-readme-docs-section-refresh | README.md | amend |
| n2-adr0002-0003-stale-relative-refs | corpus (→ ADR-0002/0003; n1 overlap) | amend |
| n2-genre-vocabulary-three-way | corpus | note |
| n2-header-consistency-on-touch | corpus | note |
| n2-adr0006-header-linter-item | ADR-0006 | note |
| n2-fork-consumption-protocol | corpus | note |
| n2-new-tenet-mechanization-discipline | corpus (→ ADR-0005 Rule 10) | new-tenet |

No retirement, slimming, or merge is proposed for any assigned document: nothing in ADR-0005, ADR-0006, or the synopsis is dead, better-homed elsewhere, or misleading beyond the bounded items above — the misleading surface in this family is the *unmarked parallel summary* in handoff, and the fix is delegation, which the corpus's own precedents prescribe.

License: Public Domain (The Unlicense).
`````


## §2 · refuter:n2-handoff-governance-delegate-to-synopsis (lens: combined) — verdict **survives**

Commission: `refuterPrompt` over proposal `n2-handoff-governance-delegate-to-synopsis` (fields above), reader n2, rationale excerpt per §0's reconstruction rule.

**findings (verbatim):** LENS 1 — REFERENCE WEB: No inbound reference depends on the content being deleted. Repo-wide search for handoff-current/“Architectural governance”/adr-synopsis (plus a mechanical ±3-line proximity scan for ADR/governance/tenet vocabulary across all ~60 files containing “handoff-current”) finds exactly two section-level references: (1) docs/worklog/2026-06-10-adr-record-amendments.md:90–93, which records the “Seven rules” staleness and explicitly leaves it “for the owning arc” — the proposal discharges this handle rather than orphaning it; (2) docs/rfcs/0001-adr-meta-review.md:341–343 (Status: Draft), whose acceptance criteria plan a future cross-reference into the section — the slim keeps the heading, lead, and ADR-enumerating personality paragraph, so the planned anchor survives. docs/onboarding/orientation.md routes the condensed per-ADR read through the synopsis (step 4, “Read the whole synopsis”) and sends readers to the handoff only for architecture/integration/pedagogy with “skim the rest.” Doc-graph (docs/doc-graph.json, generated data): all ten adr-related edges from handoff-current persist via the kept personality paragraph (it names all ten ADR-NNNN tokens); the slim’s structural delta is +1 path-mention edge to adr-synopsis → regeneration required, which the proposal already mandates, though its stated rationale (“the section cites no paths after the slim”) is wrong in both directions. Todo DB (read-only): refs WHERE kind='adr' returns two rows targeting ADR files only; zero refs target handoff or synopsis; no item description depends on the governance section’s wording.

LENS 2 — CONTENT CUSTODY: Both claimed errors verified by end-to-end ADR reads. ADR-0005 has nine rules (Rule 8 appended 2026-05-07; Rule 9 appended 2026-06-02) vs the handoff’s “Seven rules.” ADR-0002’s Rule 7 provisional-home flag was retired 2026-05-17 (Amendments line + in-body retirement paragraph at :257–270) vs the handoff describing it as live ~25 lines above its own ADR-0008 entry — an internal contradiction within the section. Custody of eight of ten entries is fully carried (and fresher) in the synopsis. Two gaps: (a) BLOCKING — the handoff’s ADR-0009 entry mentions “the Chrome/CDP surface amended in 2026-06-01”; the synopsis’s ADR-0009 entry still says “two canonical tools” and never absorbed that amendment (ADR-0009 §Tools now carries four surfaces plus the retained-heap tail-slope metric). The claimed home is in verified drift on exactly the point the deleted text gets right — opposite-direction drift that strengthens the delegation thesis but makes the synopsis fix mandatory in the same change. (b) MINOR — two one-clause glosses exist only in the deleted text: “proxy cache controls are explicit rather than implicit” (in neither ADR-0002 nor the synopsis) and “the same philosophy applies to the backend’s mutable Pydantic models” (ADR-0001, read end to end, never says this). Convention check: the handoff is a living orientation doc updated in place by design; ADR-0005 Rule 8’s sibling-revision discipline governs ADRs/design notes/planning records, not this surface, and Rule 1’s slimmed-view language (“the slimmed views explicitly delegate … to it”) prescribes exactly the proposed shape. Precedents match: the 2026-06-02 vestige cut and the 2026-06-10 ADR-0003→FILES.md delegation. Genre vocabulary check: “bounded-context map” is ADR-0003’s own Genre line (“Bounded Context Map … a third genre”), so the proposal’s genre note is corpus-grounded — more accurate than the current handoff bucket (“### Decisions”), the synopsis (:320 “The two decisions”), and orientation.md:61. One calibration defect in the proposal’s own text: the delegation sentence’s “co-change-checked in CI” overstates the cochange advisory, which is per-PR-diff and “advisory, never a gate” (exit 0 always; ack valve) per tools/doc-graph/cochange-advisory.mjs and its workflow — and the advisory demonstrably did not keep the synopsis current on ADR-0009.

LENS 3 — SUBSTITUTION TEST + FORK: The general failure shape is parallel hand-maintained condensed registers of one canonical corpus drifting independently (ADR-0005 Rule 1 slimmed-view + Rule 3 content-snapshot hazards). Surfaces: the synopsis (worst — every cold session is routed through it per orientation.md and CLAUDE.md), the handoff governance section (this proposal), orientation.md’s one-line tenet list, FILES.md-vs-ADR-0003 (already fixed by delegation), TODO.md-vs-todo-DB (already fixed by projection). Worst-surface cost today, verified: a session planning perf work from the synopsis alone would not know the automated Chrome/CDP capture path is canonical, while ADR-0009 discipline is embedded in every audit commission (evidence digest §ADR-0009). The two summaries currently disagree in opposite directions (handoff stale on 0002/0005; synopsis stale on 0009), so the redundancy yields contradiction, not error-correction — keeping both is strictly worse than one repaired summary. The slim preserves everything genuinely orientational (lead, project-wide claim, personality paragraph, “Read all ten”). Fork author: gains a single condensed register and an honest genre note (ADR-0003 as a map to re-cut, not a decision to obey); the fork itself is carried by the kept Domain-extension bullet; loses nothing provided the synopsis ADR-0009 repair ships.

**required_repairs (verbatim):** R1 (custody, blocking): In the same change, update docs/adr-synopsis.md’s ADR-0009 entry to record the 2026-06-01 amendment — at minimum the Chrome/CDP-over-Playwright automated capture surface with its dedicated parser (frontend/scripts/perf-trace-parse.mjs), the CDP HeapProfiler leak path, and the retained-heap tail-slope metric (per ADR-0009 §Tools and §Amended 2026-06-01). Owed independently by the synopsis’s own header contract; blocking here because the slim deletes the corpus’s only other condensed mention.
R2 (calibration, blocking): Reword the delegation sentence. The cochange tool is per-PR-diff and “advisory, never a gate” (exit 0 always, ack valve, cannot fire on later PRs). Do not ship “co-change-checked in CI” unqualified. Suggested shape: “The condensed per-ADR reference is docs/adr-synopsis.md — the single derived summary (declared via its derived-from marker), watched by the per-PR co-change advisory in CI (advisory, not a gate); where it disagrees with an ADR, the ADR wins. This section deliberately does not duplicate it (ADR-0005 Rule 1).”
R3 (doc-graph, trivial): Regenerate in the same change as the proposal instructs, but for the correct reason: the kept personality paragraph retains all ten ADR-NNNN tokens (all ten adr-related edges persist) and the new synopsis pointer adds one edge; the proposal’s “the section cites no paths after the slim” is wrong in both directions. node tools/doc-graph/generate.mjs, same PR.
R4 (named losses, decide-and-record): Two one-clause glosses exist only in the deleted text — (a) ADR-0002 applied to proxy cache controls (“explicit rather than implicit”); (b) ADR-0001’s philosophy extended to “the backend’s mutable Pydantic models” (ADR-0001 itself never says this). Either re-home them in the synopsis’s why-care lists or discard them with a one-line note in the PR description; do not drop them silently (ADR-0002 Rule 6 posture).
R5 (wording guard, plus optional follow-up): The final genre note must keep ADR-0003 as “bounded-context map” (its own Genre line), not re-flatten it to “decision.” Optional, separate touch: docs/adr-synopsis.md:320 (“The two decisions (ADR-0001, ADR-0003)”) and docs/onboarding/orientation.md:61 (“0001 and 0003 are decisions”) carry the same pre-existing genre flattening; align when next touched — not blocking for this PR.

**report (verbatim):**

`````markdown
# Adversarial refutation report — n2-handoff-governance-delegate-to-synopsis

**Commission.** Attempt to refute the proposal to slim `docs/handoff-current.md`'s "Architectural governance — ADRs and tenets" section (~95 lines of per-ADR summary) to a delegation-plus-genre-note, keeping the closing personality paragraph, on the grounds that the section is an unmarked parallel summary with verified drift. Three mandated lenses: reference web, content custody, substitution test + fork. 2026-06-10 ADR-corpus audit; repo at `/home/bork/w/omega`, branch main.

**Verdict: survives**, with a required repair set (R1–R5 below). The proposal's two drift claims verify exactly; the delegation shape matches two project precedents and ADR-0005 Rule 1's own slimmed-view language; no inbound reference orphans. The refutation attempt instead surfaced a defect in the proposal's *premise about the surviving home*: the synopsis is itself in verified drift against ADR-0009, in the opposite direction — which strengthens the single-summary argument but makes one synopsis repair mandatory in the same change.

## Coverage

Read end to end this session: `docs/handoff-current.md` (625 lines), `docs/adr-synopsis.md` (328), ADR-0001, ADR-0002, ADR-0003, ADR-0005, ADR-0007, ADR-0009, `tools/doc-graph/cochange-advisory.mjs`, `.github/workflows/cochange-advisory-ci.yml`, `docs/worklog/2026-06-10-adr-record-amendments.md`, `docs/rfcs/0001-adr-meta-review.md`, `docs/onboarding/orientation.md`, the evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`), and the umbrella `CLAUDE.md` (in context). Deliberately not read: ADR-0004, ADR-0006, ADR-0008, ADR-0010 — custody claims for those four entries rest solely on verbatim comparison between the handoff paragraphs and the synopsis entries, both of which were read in full; no claim below is made about those four ADRs' own content. The audit appendix parts p1–p3 were not read (commission constraint); appendix material is cited only via the digest's pointers. `docs/doc-graph.json` was consulted as generated data (programmatic edge queries); the ~60 other files containing the string "handoff-current" were checked only by a mechanical ±3-line proximity grep for ADR/governance/tenet vocabulary — no content claim is made about them. Todo DB access was read-only SELECTs. Nothing under `backend/qeubo/` was read; no file or DB writes. No performance claims of my own.

## Lens 1 — Reference web

**No inbound reference depends on the per-ADR paragraphs being deleted.** Exactly two documents reference the section by name:

1. `docs/worklog/2026-06-10-adr-record-amendments.md:90–93` — observes the section "still describes ADR-0005 as 'Seven rules' (nine at HEAD)" and records it as "left for the owning arc rather than silently absorbed here." The proposal **discharges** this open handle; the worklog is a moment-in-time record and stays accurate.
2. `docs/rfcs/0001-adr-meta-review.md:341–343` (Status: Draft, 2026-04-27, substantially overtaken by events) — plans, if accepted, "a cross-reference from `docs/handoff-current.md`'s 'Architectural governance' section … alongside the ADR list." The slim keeps the heading, the lead, and the personality paragraph that enumerates all ten ADRs, so the planned anchor survives.

`docs/onboarding/orientation.md` already routes the condensed per-ADR read through the **synopsis** (step 4: "Read the whole synopsis"), sending readers to the handoff only for architecture/integration/pedagogy with "skim the rest" — the handoff's parallel summary is not the routed condensed reference.

**Doc-graph:** `docs/doc-graph.json` records ten `adr-related` edges from handoff-current (extracted from `ADR-NNNN` tokens). The kept personality paragraph names all ten tokens, so **all ten edges persist** after the slim; the only structural delta is +1 path-mention edge to the synopsis. Regeneration is therefore required — the proposal already mandates it, though its rationale ("the section cites no paths after the slim") is wrong in both directions (see R3).

**Todo DB (read-only):** `SELECT item_id, kind, target FROM refs WHERE kind='adr'` returns two rows, both targeting ADR files (`classification-discipline-tenet-rule7-relocation`, `refactoring-queue-adr0007`); zero refs target handoff or synopsis; no item description (probed via ILIKE on handoff/governance/synopsis) depends on the section's wording. Nothing degrades.

## Lens 2 — Content custody

**Both claimed errors verify.** ADR-0005 carries nine rules (Rule 8 appended 2026-05-07; Rule 9 appended 2026-06-02, both on the Amendments header line) against the handoff's "Seven rules." ADR-0002's Rule 7 provisional-home flag was retired 2026-05-17 (Amendments line; in-body "Provisional-home flag retired 2026-05-17" paragraph) against the handoff describing the flag as live — roughly twenty-five lines above the same section's own ADR-0008 entry, an internal contradiction.

**Custody holds for eight of ten entries** — the synopsis carries everything the handoff paragraphs say for ADR-0001, 0003, 0004, 0005, 0006, 0007, 0008, 0010, usually with more current detail (the 2026-06-10 lint on 0001; the FILES.md delegation and fork sizing on 0003; the ADR-0010 corollary text is word-identical in both). Verified exceptions:

- **Blocking:** the handoff's ADR-0009 entry says "with the Chrome/CDP surface amended in 2026-06-01"; the synopsis's ADR-0009 entry still reads "two canonical tools" and never absorbed ADR-0009's 2026-06-01 amendment (which adds Chrome/CDP-over-Playwright capture with a dedicated parser, the CDP `HeapProfiler` leak path, and the retained-heap tail-slope metric). The claimed home is in verified drift on exactly the point the deleted text gets right. This does not rescue the parallel summary — it shows both summaries drifting independently, the precise ADR-0005 Rule 1/Rule 3 shape the proposal names — but it makes the synopsis repair mandatory in the same change (R1).
- **Minor:** two one-clause glosses exist only in the deleted text: "why proxy cache controls are explicit rather than implicit" (in neither ADR-0002 nor the synopsis) and "the same philosophy applies to the backend's mutable Pydantic models" (ADR-0001, read end to end, never says this). Decide-and-record, not silent loss (R4).

**Convention fit.** The handoff is a living orientation document, updated in place by design; ADR-0005 Rule 8's sibling-revision discipline governs ADRs, design notes, and planning records, not this surface. Rule 1's own slimmed-view language ("the slimmed views explicitly delegate … to it") prescribes exactly the proposed shape, and two precedents match: the 2026-06-02 vestige cut and the 2026-06-10 ADR-0003-inventory→FILES.md delegation. **Genre vocabulary:** "bounded-context map" is ADR-0003's own Genre line ("Bounded Context Map … a third genre after the *decision* of ADR-0001 and the *tenet* of ADR-0002") — the proposal's genre note is corpus-grounded and more accurate than the current handoff bucket ("### Decisions"), the synopsis (:320 "The two decisions"), and orientation.md:61, which all flatten it. "ADR-0007 still Proposed" verified against ADR-0007's status line.

**One calibration defect in the proposal's own text:** the delegation sentence's "co-change-checked in CI" overstates the mechanism. `tools/doc-graph/cochange-advisory.mjs` and its workflow are explicit: per-PR-diff only, "advisory, never a gate," always exit 0, with an ack valve — and it demonstrably did not keep the synopsis current on ADR-0009. The corpus is careful about the advisory-vs-gate distinction (ADR-0005 Alternative C "too soft to gate"; the checklist §7.3 retraction precedent); the sentence must match (R2).

## Lens 3 — Substitution test + fork

**General failure shape:** parallel hand-maintained condensed registers of one canonical corpus, drifting independently — the slimmed-view hazard of ADR-0005 Rule 1 compounded by Rule 3's content-snapshot hazard. Surfaces it could hit: the synopsis (worst — every cold session is routed through it by orientation.md and CLAUDE.md), this handoff section, orientation.md's one-line tenet list, FILES.md-vs-ADR-0003 (already resolved by delegation), TODO.md-vs-todo-DB (already resolved by projection). **Worst-surface cost, observed today rather than hypothesized:** the synopsis misinforms a cold session about ADR-0009's canonical tool surface while ADR-0009 discipline is embedded in every audit commission (evidence digest §ADR-0009). The two summaries currently disagree in *opposite directions* (handoff stale on 0002/0005; synopsis stale on 0009), so the redundancy yields contradiction, not error-correction — a cross-checking reader gets two differently-wrong accounts with no tiebreak short of the ADRs, which is precisely the corpus's stated resolution ("the ADR wins"). One repaired summary is strictly better than two drifting ones.

The slim preserves everything genuinely orientational: the lead (ten records, project-wide), the genre note, the delegation pointer, the personality paragraph, and "Read all ten." The guard the section provides a cold reader — "the ADRs are load-bearing here, and this is their collective personality" — survives intact.

**Fork:** the generic knowledge flash-card fork author gains a single condensed register to read and re-cut, and an honest genre note telling them ADR-0003 is a map to re-partition rather than a decision to obey; the fork itself is carried by the handoff's kept "Domain extension" bullet (updated 2026-06-10). Nothing is lost — provided R1 ships, since a fork author doing perf work from an unrepaired synopsis would not learn the automated capture path exists.

## Required repairs

- **R1 (custody, blocking).** Same change: update the synopsis's ADR-0009 entry to record the 2026-06-01 amendment — at minimum the Chrome/CDP-over-Playwright automated capture surface with its dedicated parser (`frontend/scripts/perf-trace-parse.mjs`), the CDP `HeapProfiler` leak path, and the retained-heap tail-slope metric (ADR-0009 §Tools, §Amended 2026-06-01). Owed independently by the synopsis's own header contract; blocking here because the slim deletes the corpus's only other condensed mention.
- **R2 (calibration, blocking).** Reword the delegation sentence to match the tool: per-PR co-change **advisory** in CI, not a gate; ADRs win on disagreement. Suggested: "The condensed per-ADR reference is `docs/adr-synopsis.md` — the single derived summary (declared via its derived-from marker), watched by the per-PR co-change advisory in CI (advisory, not a gate); where it disagrees with an ADR, the ADR wins. This section deliberately does not duplicate it (ADR-0005 Rule 1)."
- **R3 (doc-graph, trivial).** Regenerate in the same PR as the proposal instructs, but for the correct reason: all ten `adr-related` edges persist via the kept personality paragraph, and the new synopsis pointer adds one edge; "the section cites no paths after the slim" is wrong in both directions.
- **R4 (named losses, decide-and-record).** The proxy-cache-controls gloss and the backend-Pydantic gloss exist only in the deleted text. Re-home them in the synopsis's why-care lists or discard them with a one-line note in the PR description; not silently (ADR-0002 Rule 6 posture).
- **R5 (wording guard; optional follow-up).** Keep ADR-0003 as "bounded-context map" in the final wording. Optionally, in a later touch, align synopsis :320 and orientation.md:61, which carry the same pre-existing genre flattening — not blocking here.

## Why not "refuted" or "weakened"

The refutation attempt failed on all three lenses: no reference orphans; the custody gaps are repairable in-change and one of them (R1) actually deepens the proposal's own evidence base; the substitution test shows the worst surface is the *surviving* document, which the repair set addresses. The core move — slim to delegation + genre note, keep the personality paragraph — ships as proposed; the repairs secure custody and calibrate two sentences, they do not reshape the proposal's structure.
`````


## §2 · refuter:n2-new-tenet-mechanization-discipline (lens: combined) — verdict **weakened**

Commission: `refuterPrompt` over proposal `n2-new-tenet-mechanization-discipline` (fields above), reader n2, rationale excerpt per §0's reconstruction rule.

**findings (verbatim):** LENS 1 (reference web): Additive proposal — nothing orphans. Co-change duties found: (a) docs/adr-synopsis.md:117 enumerates "Nine rules ... (1)–(9)"; must be substantively updated to ten in the same PR. The cochange advisory (tools/doc-graph/cochange-advisory.mjs, read e2e) is per-PR-diff and TOUCH-keyed — any touch silences it without verifying the enumeration; its own header records the synopsis missing Rule 9 after PR #339, the exact lag this append risks repeating. (b) docs/handoff-current.md:360 still says "Seven rules" (verified; two rules stale already) — a Rule 10 append makes it three-stale unless the companion delegation proposal lands with/before, or the line is fixed in the same change. The 2026-06-10 worklog (read e2e) explicitly left this for "the owning arc". (c) docs/archive/TODO-completed-2026-05-06.md grep-hits "Seven rules" — archive point-in-time snapshot, never retro-edited by convention; no repair (file not read e2e; existence-of-match only). (d) todo DB (read-only): no refs target ADR-0005; no item mentions ADR-0011/Rule 10; `adr-effectiveness-audits` (open) is the RCA's named vehicle — no collision; filing needs refs rows per checklist D. (e) If the rule text cites the RCA/audit by path (it should, per corpus practice), that is a re-cross-reference → structural → doc-graph regeneration in the same PR.

LENS 2 (content custody): The load-bearing claims verify. ADR-0005 Revisit #3 genuinely pre-authorizes absorb-by-append; Scope ("All authoring of documentation ... Includes ADRs...") covers the rule's record register; RCA §5 open question 4 verbatim defers exactly this call to the maintainer; the L1 corollary quote ("not writing more guidance prose") verified at audit :71-72; ~50%/32-site, census rot, and RCA-minted-lint claims verified against the digest's pointers and the RCA directly. Three custody defects in the drafted decision core: (1) sentence 2's unconditional "the corrective pairs the named rule with a mechanism" contradicts its own substrate — the RCA adopted G4 as honest policy ("a mitigation, not a fix"), rated G6 "never a gate", and ruled Lapse 2's guard "lands mostly as process / SSOT structure, not as a mechanical checker"; the sentence lacks the escape valve sentence 1 has, and as a build-mechanisms mandate it exceeds ADR-0005's documentation-authoring scope. (2) Rule 10 as drafted fails its own test: it declares no enforcement surface for itself — a mechanization-discipline rule shipped policy-only-and-silent is the incoherence it forbids; pre-merge-checklist item G (which ships its line WITH the quoted RCA-G4 admission) is the in-corpus worked example of the corrected shape. (3) The "none since" recurrence claim must carry the digest's calibration (~9-day window, "explicitly a hypothesis" — digest → p1 git-narrative finding 5); the flat form commits the unsubstantiated-claim shape the corpus's own discipline family forbids. Edit-shape conventions: append-only with Amendments header-line entry + *(Appended …)* marker per the Rule 8/9 precedent — the proposal names the marker but not the header entry. Revisit #3's "Rule 8 is the first instance" wording stays true (Rule 9 precedent left it intact); no update needed.

LENS 3 (substitution + fork): General failure shape: a discipline record that does not declare how it is policed leaves every later reader unable to distinguish mechanism-policed from memory-policed, and memory-policed disciplines decay invisibly in aggregate. Surfaces: every tenet rule, CLAUDE.md conventions, checklist lines, band tags (review-only), source headers (ADR-0006: zero observed enforcement activity across ~90 agents, per digest), and trigger bookkeeping — "the corpus's weakest mechanism: recorded in 0005/0009, silently rotted in 0001/0003" (digest §2), which directly rebuts counter-argument (b): the project behaves this way only post-incident and within attention. Worst surface: the work-status SSOT delegation web (silent decay re-grows independent status assertions — the full-width Lapse-2 class) and cold-session LLM collaborators re-deriving which disciplines are load-bearing. Fork: the fork author inherits the tree's mechanisms but not the maintainer's memory; declared enforcement surfaces are self-describing about what transfers, so Rule 10 raises fork legibility at near-zero cost. Minor discoverability loss vs a standalone ADR-0011 (mechanization duty homed in a documentation tenet), adequately covered by synopsis routing; the one-paragraph append minimizes the L1-corollary irony where ADR-0011 would maximize it. The proposal's own honest counter-arguments do not rise to refutation.

**required_repairs (verbatim):** R1 (reshape, blocking): recast the drafted core's second sentence into the record register with the same escape valve as sentence 1 — "the corrective's record names the mechanism it pairs with the rule, or carries the same explicit policy-only admission and trigger"; keep "tenet+mechanism arrests recurrence; a describing-only document does not" as cited rationale, not as an unconditional mandate (it would otherwise indict its own substrate: RCA G4 adopted-as-policy, G6 "never a gate"). R2 (reshape, blocking): Rule 10 declares its own enforcement surface — an explicit policy-only admission naming the trigger/mechanization candidate (e.g., a CI/template check that new ADR rule sections carry an enforcement line); cite pre-merge-checklist item G as the worked example. R3 (calibration): replace flat "none since" with the windowed hypothesis framing (no observed recurrence in the ~9-day window; explicitly a hypothesis — digest → p1 git-narrative finding 5). R4: substantively update docs/adr-synopsis.md:117 to ten rules with a (10) clause in the same PR — the cochange advisory is touch-keyed and cannot verify the enumeration (its header records the synopsis missing Rule 9 after PR #339). R5: add the dated Amendments header-line entry per the Rule 8/9 precedent, alongside the *(Appended 2026-06-DD.)* marker. R6: do not leave docs/handoff-current.md:360 ("Seven rules") three-rules-stale — land with/after n2-handoff-governance-delegate-to-synopsis, or update/delegate that line in the same change. R7: cite the RCA (and the audit, if quoted) by path in the rule's substrate note and regenerate the doc-graph in the same PR (re-cross-reference = structural). R8: file the work-status item (natural parent: adr-effectiveness-audits, the RCA's named vehicle) with refs rows to the RCA and the 2026-06-10 audit at filing time (checklist section D).

**report (verbatim):**

`````markdown
# Adversarial refutation report — n2-new-tenet-mechanization-discipline

**Commission.** Adversarial refuter for the 2026-06-10 ADR-corpus audit, assigned proposal `n2-new-tenet-mechanization-discipline` (kind: new-tenet): append an ADR-0005 Rule 10 ("disciplines declare their enforcement surface") rather than mint a standalone ADR-0011, grounded in the history audit's L1 and the 2026-06-01 RCA's common root cause, with the RCA's open question 4 deferring the call to the maintainer. Three lenses were run: reference web, content custody, substitution test + fork.

**Verdict: WEAKENED** — the recommendation (yes, the six weeks justify tenet-level content; shape = ADR-0005 Rule 10 append per Revisit #3's pre-authorization; maintainer call per RCA OQ4) survives all three lenses, but the drafted decision core must ship in a reshaped form: its second sentence as drafted contradicts its own substrate and exceeds ADR-0005's scope, and the rule fails its own test by declaring no enforcement surface for itself.

## Coverage

Read end to end for this report: `docs/adr/0005-documentation-discipline.md`, `docs/adr-synopsis.md`, `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`, `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`, `docs/handoff-current.md`, `docs/pre-merge-checklist.md`, `docs/worklog/2026-06-10-adr-record-amendments.md`, `tools/doc-graph/cochange-advisory.mjs`, the evidence digest (`/tmp/adr-corpus-audit/evidence-digest.md`), and the umbrella `CLAUDE.md` (in commission context). The appendix parts p1–p3 were not read (commission prohibition); appendix material is cited only via the digest's pointers, attributed. Claims about ADR-0001/0002/0003/0004/0006/0007/0008/0009/0010 internals are relayed from the digest or the synopsis, attributed — those ADRs were not read here. A grep hit on `docs/archive/TODO-completed-2026-05-06.md` ("Seven rules") is reported as a pointer only; that file was not read and no repair is proposed on its basis (archives are point-in-time records). Todo-DB access was read-only `SELECT` (refs `kind='adr'`; item sweeps for `adr-0005` / `adr-0011` / `rule 10` / `mechaniz%` / `enforcement surface`). No perf claims of my own are made.

## Lens 1 — Reference web

The proposal is purely additive; nothing orphans. The exposure is co-change, and it is concrete:

- **`docs/adr-synopsis.md:117`** enumerates ADR-0005 as "Nine rules ... (1)–(9)". A Rule 10 append without a substantive synopsis update reproduces a recorded failure: the cochange advisory's own header notes "adr-synopsis missing ADR-0005 Rule 9 after PR #339 was exactly this." The advisory (read e2e) is per-PR-diff and **touch-keyed** (`changedSet.has(derived) → skip`), so a cosmetic touch silences it without fixing the enumeration; it also never gates (exit 0).
- **`docs/handoff-current.md:360`** still says "Seven rules" — verified, two rules stale at HEAD; the 2026-06-10 amendments worklog observed this and explicitly left it "for the owning arc." A Rule 10 append makes the line three-rules-stale unless the companion proposal (`n2-handoff-governance-delegate-to-synopsis`) lands with or before it, or the same PR fixes the line.
- **Todo DB**: no `refs` row targets ADR-0005; no item mentions ADR-0011 / Rule 10; `adr-effectiveness-audits` is open and is the RCA's own named "adjacent vehicle" — no collision, and the natural filing parent.
- **Doc-graph**: the rule's substrate note should cite the RCA by path (corpus practice; ADR-0005 itself cites paths throughout). That is a re-cross-reference → structural → regenerate in the same PR, exactly as the 2026-06-10 amendments PR did.
- Frozen mentions (the 2026-06-10 worklog's "nine at HEAD"; the archived TODO snapshot) are point-in-time records and correctly need nothing.

## Lens 2 — Content custody

The proposal's load-bearing claims **verify**:

- ADR-0005 Revisit #3 genuinely pre-authorizes absorb-by-append ("append the rule rather than starting a new tenet — this tenet is shaped to absorb additional disciplines"), with Rules 8 and 9 as exercised precedent. Its "Rule 8 is the first instance" wording survived the Rule 9 append unmodified and stays true under Rule 10 — no update needed there.
- ADR-0005's Scope ("All authoring of documentation ... Includes ADRs, notes, READMEs, TODO entries, HANDOFFs, playbooks...") covers the rule's **record register**: what a discipline's record must declare when authored.
- RCA §3's diagnosis and §5 open question 4 are verbatim as the proposal represents them — the meta-tenet question is genuinely deferred to the maintainer, and the RCA names the ADR-effectiveness-audit item (this audit) as the vehicle. The proposal arriving through this audit is procedurally exactly what the RCA anticipated.
- The substrate figures check out: the L1 corollary quote ("not writing more guidance prose") is verbatim at the main audit :71-72; ~50% cast conformance in a 32-site sample, census rot (closeBoard "Four cleanups" over eleven operations; eslint header ~8 days stale), and the RCA-minted-lint successes are all carried by the digest's pointers (p1 mech-conformance §3; p2 verify:fit:scoped-state-registry corr. 1; p1 postmortems finding 1).

Three custody **defects** in the drafted decision core:

1. **Sentence 2 contradicts its own substrate and exceeds the tenet's scope.** "When an incident reveals a discipline held only by memory, the corrective pairs the named rule with a mechanism" is unconditional — no escape valve. But the RCA it cites adopted G4 (a checklist line) as honest policy with the admission "a mitigation, not a fix," rated G6 "never a gate," and ruled that Lapse 2's guard "lands mostly as process / SSOT structure, not as a mechanical checker." Had Rule 10 as drafted been in force, it would have indicted the RCA's own most careful handling. And as a build-mechanisms mandate it governs engineering response, not documentation authoring — outside ADR-0005's Scope. The fix is cheap: recast to the record register ("the corrective's **record** names the paired mechanism, or carries the same explicit policy-only admission and trigger"), keeping the tenet+mechanism-arrests claim as cited rationale rather than mandate.
2. **Rule 10 fails its own test as drafted.** It declares no enforcement surface for itself. A mechanization-discipline rule shipped policy-only-and-silent is the incoherence it forbids — and prose-only is exactly the L1 decay class. The corpus already contains the corrected shape: pre-merge-checklist item G ships its discipline line *with* the quoted RCA-G4 weakness admission. Rule 10 must carry its own policy-only admission plus a named trigger or mechanization candidate (e.g., a template/CI check that new ADR rule sections carry an enforcement line).
3. **Calibration on "none since."** The main audit's verdict says render-coupling "has not been observed since," but the digest — the proposal's own cited substrate — marks this "explicitly a hypothesis" over a ~9-day window (p1 git-narrative finding 5). A tenet whose family forbids unsubstantiated claims cannot cite its arrest-proof flat; the windowed, hypothesis-framed form is required.

Edit-shape conventions are otherwise respected: append-only, dated, original records preserved. The proposal names the `*(Appended 2026-06-DD.)*` marker but not the **Amendments header-line entry**, which the Rule 8/9 precedent (and Rule 8's own text) makes part of the shape.

## Lens 3 — Substitution test + fork

**General failure shape:** a discipline record that does not declare how it is policed leaves every later reader unable to distinguish mechanism-policed from memory-policed; memory-policed disciplines decay invisibly in aggregate. **Surfaces:** every tenet rule; CLAUDE.md conventions; checklist lines; band tags (review-only); source headers (ADR-0006 generated zero observed enforcement activity across ~90 agents — digest); and trigger bookkeeping, which the digest names "the corpus's weakest mechanism: recorded in 0005/0009, silently rotted in 0001/0003." That last datum directly rebuts the strongest refutation candidate (counter-argument (b), "the project already behaves this way"): it behaves this way **post-incident and within attention only**; outside attention, admissions and triggers rot. The declaration duty at authoring time has real marginal content. **Worst surface:** the work-status SSOT delegation web — silent decay there re-grows independent status assertions, the full-width Lapse-2 class — and cold-session LLM collaborators, who without declared enforcement surfaces must re-derive per session which disciplines are load-bearing versus aspirational, the precise reconstruction cost ADR-0005's Context exists to bound.

**Fork:** a fork author inherits the tree's mechanisms (lints, CI gates, harnesses, DB constraints) but not the maintainer's memory; memory-policed disciplines silently become unpoliced in the fork. Declared enforcement surfaces make each discipline record self-describing about what transfers — the proposal is worth slightly more to the fork than to the origin. The only loss against a standalone ADR-0011 is discoverability (a mechanization duty homed in a documentation tenet), adequately covered by synopsis routing; the one-paragraph append minimizes the L1-corollary irony that a full ADR-0011 would maximize. The proposal's recorded counter-arguments are honest but none rises to refutation.

## Required repairs (the form in which this ships)

1. **R1 (reshape, blocking).** Recast the drafted core's second sentence into the record register with sentence 1's escape valve: "the corrective's record names the mechanism it pairs with the rule, or carries the same explicit policy-only admission and trigger." Retain "tenet+mechanism arrests recurrence; a describing-only document does not" as cited rationale only.
2. **R2 (reshape, blocking).** Rule 10 declares its own enforcement surface: an explicit policy-only admission naming the trigger / mechanization candidate; cite pre-merge-checklist item G as the worked example of the shape.
3. **R3 (calibration).** The render-coupling recurrence claim carries the windowed hypothesis framing (~9-day window; explicitly a hypothesis — digest → p1 git-narrative finding 5), not flat "none since."
4. **R4.** `docs/adr-synopsis.md:117` substantively updated to ten rules with a (10) clause in the same PR — the cochange advisory is touch-keyed and cannot verify the enumeration.
5. **R5.** Dated Amendments header-line entry per the Rule 8/9 precedent, alongside the `*(Appended …)*` marker.
6. **R6.** `docs/handoff-current.md:360` not left three-rules-stale: sequence with/after `n2-handoff-governance-delegate-to-synopsis`, or fix/delegate that line in the same change.
7. **R7.** Cite the RCA (and the audit, if quoted) by path in the rule's substrate note; regenerate the doc-graph in the same PR (re-cross-reference = structural).
8. **R8.** Work-status filing with refs rows to the RCA and the 2026-06-10 audit at filing time (checklist §D); natural parent `adr-effectiveness-audits`, the RCA's own named vehicle.

With R1–R3 folded into the drafted text and R4–R8 in the shipping PR, the proposal is sound: the pre-authorization is real, the substrate verifies, the reference web is co-change-only, and both the substitution and fork lenses come out in its favor. The verdict is weakened rather than survives solely because the drafted decision core itself requires the specified recasting before it is fit to append.
`````


---

Continued in part 2.

License of this record: Public Domain (The Unlicense).
