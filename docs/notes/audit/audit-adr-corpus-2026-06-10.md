# Audit — the ADR corpus at ten records (2026-06-10)

The generic ADR audit commissioned under work-status item
`adr-effectiveness-audits` (open/in-progress; this audit does not change its
disposition): given everything the project now knows, judge the corpus itself —
the ten ADRs under `docs/adr/` plus `docs/adr-synopsis.md`. Per document:
retire, slim, merge, restructure, amend, change status, or keep; and the
inverse — do the paid-for lessons of the last six weeks justify any new tenet,
or fold into existing ones? The bars, from the commission: a
retirement/slimming/merge proposal must show the content is dead, delegated to
a better home, or actively misleading — "shorter" is not a reason — and every
verdict is judged against the planned generic knowledge flash-card fork
(ADR-0003's 2026-06-10 amendment) as well as the present tree.

**This audit proposes; it applies nothing.** Every change below executes only
after maintainer sign-off (gate 1). After execution, the planned follow-up
review — consolidating the history-lessons audit against the revised corpus —
runs as its own arc (gate 2); its inputs are named in §8.

Point-in-time report per this directory's convention; not retro-edited.

## Method

Two orchestrated passes with a mid-run restructure, recorded honestly:

- **First launch** (9 readers planned: 5 verdict readers × 2 ADRs, 2 appendix
  evidence specialists, 1 new-tenet case-builder, 1 corpus-structure reader;
  3 adversarial lenses per heavy proposal). Interrupted by the maintainer after
  two readers completed: per-agent cost showed each agent reading the ~810 KB
  history-audit appendix corpus to satisfy the read-fully-before-citing
  discipline.
- **Restructure** (maintainer-directed): one extraction agent read the three
  appendix parts end to end **once** and wrote a compact pointer-bearing
  evidence digest; all subsequent agents received the digest (read fully), the
  main history audit (read fully), and their assigned ADRs (read fully), citing
  appendix material only via the digest's pointers. The two completed readers
  were replayed from cache; the fan-out narrowed to four fresh readers; one
  combined-lens refuter per retire/slim/merge proposal (none materialized — see
  §1), with restructure/new-tenet refuters budget-gated; one completeness
  critic. Two interrupted reader transcripts produced no used output.
- **Final shape**: 12 agents — readers r1 (ADR-0001+0010), r2 (0002+0008),
  n1 (0007+0009), n2 (0005+0006+synopsis+corpus-system), n3 (0003+0004),
  n4 (the inverse question); the digest agent; three refuters
  (two new-tenet proposals, one restructure — all survived or weakened, none
  refuted); the critic. ~681k tokens this pass. Every commission prompt and
  every report is reproduced verbatim in the companion appendix — split for
  renderability into `audit-adr-corpus-2026-06-10-appendix-p1.md` (process
  record, the complete workflow script as the factored commission source,
  readers r1/r2/n1/n2 + refuters) and `…-appendix-p2.md` (readers n3/n4 +
  refuters, the evidence digest agent, the completeness critic), same
  directory, per the standing verbatim-record discipline.

**Synthesizer coverage (ADR-0002 documentation consumption, stated loudly).**
Read end to end by the synthesizing session itself: all ten ADRs;
`docs/adr-synopsis.md`; `docs/handoff-current.md`; `docs/onboarding/orientation.md`;
`README.md`; `docs/pre-merge-checklist.md`;
`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` and its filings
summary; `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md`; all
twenty-two `docs/worklog/2026-06-10-*.md` worklogs (including the five that
merged mid-audit, PRs #386–#390); `tools/work-status/schema.sql`; the
`adr-effectiveness-audits` item description (read-only psql); the evidence
digest; every reader's structured output in full (coverage, per-document
verdicts, trigger walks, proposals with drafted text); every refuter verdict in
full; the critic's full report. **Not read by the synthesizer**: the three
history-audit appendix parts (~810 KB — delegated to the digest agent, whose
end-to-end coverage statement, byte-completeness method, and digest are in the
appendix; appendix material is cited here only via the digest's pointers, as
"digest → pN §…"); the readers' prose `report_markdown` bodies (reproduced
verbatim in the appendix mechanically; every load-bearing claim in this
document is drawn from the structured fields, which were read in full);
`backend/qeubo/**` (licensing firewall). Store access was SELECT-only
throughout, by every agent and the synthesizer. No performance claims are made
anywhere in this audit (ADR-0009); relayed perf figures are the cited
documents' captured claims.

---

## 1. Verdict

**The corpus holds. Nothing earns retirement, slimming, merge, or
restructure-within-the-corpus.** Six readers, three adversarial refuters, and a
completeness critic produced zero retire/slim/merge proposals against any of
the eleven documents — every slim candidate the commission named (ADR-0001's
type-system exposition, ADR-0002's Rule 7 history, ADR-0009's tool/metric
accretion) was examined against the bar and declined with reasons (§6). The
evidence runs the other way: across the 90-agent history review, ADR text
*settled* most verifier disputes directly, and verifiers had to construct
policy only where the corpus is silent (digest §2 "settled vs constructed";
adjudicated in §6).

What the corpus needs instead is **record truthfulness at the margins**: every
document gets a keep-with-amendments verdict whose substance is reference
decay (retired TODO-numbering handles, three `../notes/` relative paths the
doc-graph validator structurally cannot see, a maintainer-local memory citation
that resolves in no clone), trigger bookkeeping (four partially-fired triggers
unrecorded), tense (ADR-0003 still describes a shipped feature in future
tense), and one status field (ADR-0007, treated as binding for six weeks while
labelled Proposed). One restructure is proposed *outside* the corpus proper:
the handoff's parallel per-ADR governance summary, with verified drift in both
directions against the synopsis, slims to a delegation (A11).

**The inverse question is answered affirmatively, once**: the lessons justify
one new tenet — a mechanization discipline (prose disciplines decay; mechanisms
stick), drafted as ADR-0011 with every adversarial repair folded in (A13) —
plus two ADR-0005 rule appends (deferral ledgering; verbatim consult records).
The remaining candidate signals stay where they are, with reasons (§5).

The trigger sweep reconciles: **38 Revisit-when triggers re-derived across the
ten ADRs (5/4/4/2/3/3/4/4/5/4)**, matching the cadence record in the
`adr-effectiveness-audits` item description, with every ADR walked by exactly
one assigned reader. If the full proposal set ships, the next sweep's baseline
is **43** (ADR-0002 gains Revisit #5; ADR-0011 adds a four-trigger Revisit
section).

## 2. Per-document verdicts

Verdict vocabulary per ADR-0008: no closest-match verdicts were forced; every
document fit `keep`-with-`amend`, one `status-change`. Trigger registers are
honest: `unassessable` and `partially unassessable` appear where the evidence
does not reach.

| Document | Verdict | Rationale (condensed — full walks in the appendix) |
|---|---|---|
| **ADR-0001** (state mutation / readonly) | **amend** (else keep) | Decision healthy; both 2026-06-10 amendments verified at HEAD. Slimming the TS/Vue/Haskell exposition declined: it is the premise the Alternative-rejections rest on, and live trigger #3's escalation terms reference the Alternatives directly. Misleading at HEAD: three retired TODO-numbering handles (one inside live trigger #1 — successor `item-27-etag-multitab` verified, legacy number 27); plus a missing one-line note that the single-file type catalog split. Triggers 5/5 walked: #2 fired+recorded; #3 response recorded (not fired); #1/#4/#5 not fired. Fork: travels; the two repairs are the fork hazards. → A1 |
| **ADR-0002** (fail loudly) | **amend** (else keep) | The most-cited tenet; core uncontradicted by six weeks of evidence. Rule 7's ~86 lines kept in full (§6). Misleading at HEAD: pre-umbrella Scope line; three dangling relative refs invisible to the validator; four pre-store TODO numbers without an anchor; the "policy, not an enforced mechanism" Negative now half-true (five error-level lint registers + DB constraints + CI gates at HEAD, including `only-throw-error`, adopted after the reader pass — redrafted in synthesis); Rules 6/7 name marker vocabulary retired by ADR-0005 Rule 9; Exception 3's worked example completed its scheduled removal. Triggers 4/4: none fired; #1/#2 unassessable (user-report-dependent); the change that did happen (mechanization) is uncovered by any trigger → new #5 proposed. → A2 |
| **ADR-0003** (portability / domain bands) | **amend** (else keep) | The amendment layer is honest and the band definitions + seam analysis + both sizings were used by extractions executed the same day. A Rule-8 successor declined (§6): it would re-create the parallel-registry shape this ADR just paid to dissolve. The in-place annotation job is unfinished where a fork author reads: the un-annotated "no concrete second-domain consumer exists" premise; future-tense analysis-recording prose for a feature that shipped (and substantially followed the design — two named deviations); a dangling Related pointer; the single-axis chess question beside a re-keyed two-axis legend; sizing rows that contradict FILES.md (verified at HEAD: `wait-for-analysis.ts` ADR-Band-1 vs `[B3]`; `engine/helper.ts` reversed). Triggers 4/4: #1 fired+recorded — with the digest-flagged "fired twice" overclaim carried as an optional precision rider (§8.6); #2 fired+recorded with sizing-prose residue; #3 fired, recorded, deliberately unadjudicated (narrowed since by the scoring extraction); #4 not fired. Fork: this IS the fork map. → A3 |
| **ADR-0004** (minimal-touch) | **amend** (else keep) | Alive, smallest, nothing misleading; the engagement-protocol citation verified accurate against CLAUDE.md. One defect: trigger #1 has partially fired (CI-gated `vue-tsc -b` since 2026-06-01; two adjacent footgun lints) with no record — the same silent rot shape that cost 0001/0003 their record accuracy, plus the verified ceiling correction (boolean gate-prop omission is type-legal by design, uncatchable by template type-checking even in principle). Triggers 2/2: #1 partially fired, unrecorded; #2 not fired. Fork: fully portable. → A4 |
| **ADR-0005** (documentation discipline) | **amend** (else keep) | Most-exercised documentation tenet; Rules 1/3/8/9 operated as working tools across the 90-agent review. Defect: the mechanization record stopped at 2026-06-01 — the co-change advisory (2026-06-02) and the dangling-signal arc (2026-06-10: origin buckets, tombstones, directory refs, advisory ratchet) are unrecorded, so the body's "no automated check" claims are understated; Related still enumerates the off-tree SVG. Triggers 3/3: #2 fired+recorded, then fired twice more **unrecorded**; #3 fired twice, recorded; #1 not fired. Separately, two rule appends are proposed for it (§5: Rules 10–11). Fork: travels; Rules 2/9 name umbrella infrastructure a fork re-instantiates. → A5 |
| **ADR-0006** (source-file headers) | **amend** (else keep) | Healthy; the convention's silence across ~90 agents is now backed by a measurement instead of an argument: a path-presence sample run for this audit found **214/222 frontend `.ts`/`.vue` files (~96%)** and **83/118 backend `.py` (~70%)** carrying their relative path in the head block (purpose- and license-blind check; generated files included in the denominator) — consistent with internalized-in-the-frontend, retrofit-in-progress-in-the-backend. One verified defect: the exemplar citation dangles (`useTreeLayout.ts` moved to `composables/forest/`; its own header self-updated — only the ADR's citation rotted, invisible to the `.md`-only validator). Triggers 3/3: none fired; the header-linter candidate has no work-status item (→ §9 staged SQL, optional). Fork: fully portable. → A6 |
| **ADR-0007** (file size / density) | **status-change** → Accepted | Six weeks of binding practice: the types.ts split was approved as a *named deviation* warranted by this ADR's own exception text (a deviation regime presupposes a binding norm); `refactoring-queue-adr0007` executes its Neutral clause as live policy; worklogs disclaim its claims-register by name; the lint config defers `max-lines` against its budgets; the synopsis counts it among the eight tenets. The Proposed label produced demonstrated reader cost (one recorded verifier correction, digest → p2 verify:exist:split-types-ts corr. 2). The acceptance record names the two honestly-open questions — the never-measured density thresholds (history audit §8) and the RFC-0001 Q8 bounded-vs-aspirational sharpening — so the flip launders nothing. Also: the Not-goals directory-organization pointer is verified stale-and-misleading (the reorg landed 2026-05-11, commit `39e200d`; the promised ADR was never authored). Triggers 4/4: none fired; #2 unassessable from the repo. Fork: transfers wholesale. → A7 |
| **ADR-0008** (classification discipline) | **amend** (else keep) | Validated rather than eroded by subsequent weeks (the refs-kind arc is a clean positive-register instance). Serious referential defect: the substrate-4 citation points at a maintainer-local memory file that resolves in **no clone** and no longer exists even locally; Rule 2 leans on the same unlocatable authority. Both records exist in fuller form in-repo (`docs/archive/notes/frontend-source-tree-reorganization.md` — verified present). Both Exceptions name marker vocabulary retired by ADR-0005 Rule 9. Triggers 4/4: #4 partially fired **unrecorded** (the store's enum constraints; the refs-kind arc; `band-conformance-ci-check` filed); the ADR has no Amendments header at all. Fork: high after the citation repair. → A8 |
| **ADR-0009** (perf investigation) | **amend** (else keep) | Restructure and slim considered and declined on the bar (§6): the largest corpus document is genuinely a tenet-plus-tooling fusion, but every part was exercised within ten days, the discipline shaped all ~90 agents' output, and wholesale vocabulary delegation would fight Revisit #3's own append-here text. Three bounded amendments instead: the "Two tools" lead-in now heading four bullets; a Related entry + routing rule naming the existing operational companion (`docs/notes/perf-capture-normalization-protocol.md`) so future tool arcs stop accreting operating instructions here; the counts-not-wall-clock Chromium comparable appended to the metric vocabulary (currently scattered in a script header + worklog — the per-investigation scatter the vocabulary section forbids). Triggers 5/5: #2 fired+recorded (the corpus's model bookkeeping); #3 fired in substance twice handled per its own prescription, with one open instance discharged by A9; #1/#4/#5 not fired. → A9 |
| **ADR-0010** (render locality / canvas) | **amend** (else keep) | Sound, well-evidenced, freshly repaired (artifact lines + harness path, verified at HEAD). The Vue scoping and the corollary's canonical-home status are right (frontend/CLAUDE.md presents itself as the derived projection). One record gap: Revisit #4 reads as if the layering tension has no work-status reality, while the record it anticipated now exists, shipped, and closed (`services-boundary-deny-by-default`, PR #378) — and its step (b), the trigger's named collapse-pathway, lost its open record at closure (no successor item; verified — the audit's own L3 shape, reproduced during the audit's execution round → §9 staged SQL). Triggers 4/4: none fired; #4 materially developed + unrecorded; **#3 not fired on available evidence, partially unassessable** (no dedicated source census was run — the honest register per the critic). Fork: among the most portable records. → A10 |
| **adr-synopsis.md** | **amend** (else keep) | The right single derived summary (marked `derived-from`, advisory-covered, routed through every cold session). One actively misleading line: the ADR-0009 entry predates the 2026-06-01 amendment ("two canonical tools"; five-entry vocabulary) — structurally explainable (the amendment predates the advisory, which is per-PR-diff and can never flag pre-existing drift) and found by two readers independently. Mild: "The two decisions (ADR-0001, ADR-0003)" flattens ADR-0003's self-declared third genre. Everything else verified entry-by-entry at HEAD. → A11a |
| **Corpus as a system** | **amend** | Architecture sound: genre lines, dated append-only amendments, Revisit sections, one marked derived summary. System-level repairs: the handoff's ~95-line unmarked parallel governance summary has verified two-way drift against the synopsis ("Seven rules" vs nine; Rule 7's provisional-home flag described as live beside the ADR-0008 bullet recording its retirement) — the same shape the project fixed twice by delegation; restructure survived adversarial refutation with five repairs (→ A11). README carries a moved planning-note path and a stale release headline (v1.1.0 is tagged) (→ A12). Header-shape variance (ordinal enumerations, License footers on 0008–0010 only, ADR-0001's missing Genre/Scope lines, ADR-0009's trailing amendment sections) judged noise → harmonize on touch, no sweep (§6). Amendment conventions: heterogeneous in shape, coherent in principle — every observed change dated, additive, planning-record-preserving; no silent edit found anywhere in the corpus. No document says how the fork consumes the corpus (§8.8). |

## 3. Proposed end-state of the corpus

If the full proposal set is accepted:

- **Eleven ADRs**: 0001–0010 all `Accepted` (0007 flipped with a dated
  acceptance record); **ADR-0011 — Mechanization Discipline** added at
  `Proposed`, the ninth tenet (full draft text: A13). No document retired,
  merged, or slimmed.
- **ADR-0005 at eleven rules**: Rule 10 (deferrals are ledgered at authoring
  time) and Rule 11 (commissioned-review artifacts are recorded verbatim,
  in-tree) — both fold paid-for conventions that today live only in the
  checklist and a user-local memory note (A5b, A5c).
- **Every fired or partially-fired trigger recorded in place** (0002 #—none,
  0003 #1 precision rider, 0004 #1, 0005 #2 second wave, 0008 #4, 0010 #4),
  per the Amendments-header + dated-note convention 0001/0003/0005/0009/0010
  already follow. Next-sweep trigger baseline: **43** (38 + ADR-0002 #5 +
  ADR-0011's four).
- **One maintained condensed summary**: the synopsis (entry-accurate after
  A11a, including the rewritten "How to read these together" — nine tenets,
  the family paragraph extended to ADR-0011's enforcement register). The
  handoff governance section becomes a delegation + the kept personality
  paragraph; orientation.md and README stay delegation-style (README repaired,
  A12). The ordinal/census co-changes (ADR-0010's header stays as a historical
  fact; the synopsis closer changes) land in the same PR as whatever mints
  ADR-0011.
- **Reference web clean at the corpus boundary**: no `../notes/` dangles, no
  maintainer-local citations, no retired handle without its archive anchor —
  all repairs are amendments, none touches the doc-graph's frozen records.
- **The store** records this sweep on the cadence item, re-captures the one
  evaporated deferral found, and (optionally) files the header-lint candidate
  (§9).

## 4. Amendment packages (ready-to-apply text in Appendix A)

Thirteen packages. Each is bounded, dated, append-shaped, and names its
co-changes; the synopsis co-changes ride with their ADR PRs (the cochange
advisory flags touch, not substance — substance is checked manually per
package). Doc-graph regeneration is required for A2, A3, A5, A11, A12, A13
(cross-reference/structural changes) and for this audit's own PR.

| # | Target | Substance | Origin |
|---|---|---|---|
| A1 | ADR-0001 | Three retired TODO handles re-pointed (live trigger #1 → `item-27-etag-multitab`; two shipped → the archive snapshot); one dated catalog-split note in Context | r1, both verified |
| A2 | ADR-0002 | Scope line updated (pre-umbrella → codebase-wide incl. proxy); Related/Rule-7 reference repairs + pre-store item-number anchor + engagement-protocol forward-pointer + retired-marker notes + Exception-3 closure note; Negative bullet's mechanization update **redrafted against post-PR-#390 HEAD** (adds `only-throw-error`/G3); new Revisit-when #5 (a rule gains a mechanical guard → record it here) | r2, redrafted in synthesis per the critic's G1/G2 |
| A3 | ADR-0003 | Dated premise annotation in the Decision section; analysis-recording section re-tensed as a substantially-fulfilled prediction with two named deviations (verified against `backend/domain/analysis_bundle.py` and the persistence stack); two-axis principle note; chess-sizing rows annotated as a 2026-04 planning snapshot with named FILES.md disagreements; Related pointer re-pointed to the archive | n3, all verified at post-#390 HEAD |
| A4 | ADR-0004 | Dated Revisit-#1 partial-firing record (CI-gated vue-tsc; the two adjacent lints; the verified in-principle ceiling; policy unrelaxed pending measurement) + Amendments header line | n3 |
| A5 | ADR-0005 | (a) Second-wave mechanization note (co-change advisory 2026-06-02; dangling-signal arc 2026-06-10) at the Amendments line, Alternative C, and the Related SVG enumeration; (b) **Rule 10 — deferrals are ledgered at authoring time** (L3 folded in; checklist §D as the walk-through; grep-able marker named as the future mechanization candidate); (c) **Rule 11 — commissioned-review artifacts are recorded verbatim, in-tree** (the discipline five committed documents invoke by name, defined nowhere committed — verified by grep; the PR-#382 fabricated-quote catch as substrate). Synopsis rules-enumeration co-changes substantively (nine → eleven) | n2 (a); n4 (b, c) — see §5 and §7 for the verification posture on (b)/(c) |
| A6 | ADR-0006 | Exemplar path corrected (two occurrences) + first Amendments header line | n2, verified |
| A7 | ADR-0007 | Status → Accepted with a dated acceptance record naming the two open questions (unmeasured density; bounded-vs-aspirational budgets); Not-goals reorg pointer corrected (landed 2026-05-11 without the promised ADR — surfaced, not papered over); co-changes: synopsis "Status as of authoring" line; frontend/CLAUDE.md "(proposed)" parenthetical; decisions-deferred.md outcome note | n1 |
| A8 | ADR-0008 | Memory-record citations re-pointed to the in-repo reorganization audit (substrate 4; Rule 2's earn-your-place); retired-marker notes on both Exceptions + Rule 3's channel list; Revisit-#4 partial-firing record (enum constraints; refs-kind arc; `band-conformance-ci-check` as the named fuller firing); first Amendments header line | r2 |
| A9 | ADR-0009 | Tools lead-in count fixed; companion-protocol Related entry + routing rule (tool *status* here, operating *protocol* in the companion — Revisit #3's append-here authority explicitly untouched); counts-based Chromium comparable appended to the metric vocabulary as a discharged Revisit-#3 instance | n1 |
| A10 | ADR-0010 | Dated Revisit-#4 record note (the anticipated work-status record exists, shipped; trigger re-checked, not fired; step (b)'s custody named — text finalizes against the §9 staged item's outcome) | r1 |
| A11 | handoff-current.md (+ A11a synopsis) | Governance section slims to: honest genre lead (a decision, a bounded-context map, eight — becoming nine — tenets), a calibrated delegation sentence (advisory, not a gate — refuter repair R2), the kept personality paragraph. Ships **with** the synopsis ADR-0009 entry refresh (refuter repair R1 — the slim deletes the corpus's only other condensed mention of the Chrome/CDP surface); the two orphaned one-clause glosses (proxy cache controls; backend Pydantic philosophy) re-homed or discarded with a named line in the PR (R4); genre note keeps "bounded-context map" (R5); doc-graph regenerated for the right reason (R3). Subsumes r2's spot-fix of the same section | n2 restructure — **survived adversarial refutation**; repairs folded |
| A12 | README.md | Documentation list: the moved/archived planning-note line re-pointed; Project status: v1.1.0 (or de-headlined to point at the store + handoff) | n2, verified (tag exists) |
| A13 | **ADR-0011 (new)** — Mechanization Discipline | Full replacement-grade draft in Appendix A: five rules (enforcement surfaces declared; recurrence converts to mechanism, not more prose; measure-first adoption; nets quantify over the class; template-not-gate calibration), Status Proposed, with **every refuter repair from both surviving refutations folded in** (scoping Neutral clause; corrected enforcement-surface vocabulary; custody-accurate measure-first description; evidence caveats; scoped family claim; stable-handles reconciliation; precise RCA citation; ship mechanics; fallback-with-named-loss) | r2 + n4 merged; §5 |

## 5. The inverse question — new tenets

Three readers proposed the same lesson in three shapes; two territory readers
argued no-tenet for their slices. Adjudicated on the merits, not by seat count
(critic C1–C3):

**Recommended: one standalone tenet, ADR-0011 "Mechanization Discipline"
(A13).** The lesson is L1 / the RCA's common root — the project's
characteristic failure mode is the invisible-at-authoring, visible-only-in-
aggregate defect, against which prose policed by one person's memory is
structurally weak; only mechanical nets arrest it. The RCA's open question 4
explicitly queued the tenet-vs-per-surface choice for the maintainer; this
audit answers it affirmatively and procedurally — five rules each with a named
operational surface, not a philosophical statement. Both standalone-shape
refuters returned **survives**; the rule-append shape (ADR-0005 Rule 10,
n2's variant) returned **weakened**, its refuter finding that a
build-mechanisms mandate exceeds ADR-0005's documentation-authoring scope —
that shape is declined and recorded in ADR-0011's Alternatives, alongside the
ADR-0002-Rule-8-with-provisional-flag fallback (precedented but lossy — Rules
3–5 would stay homeless; the draft's fallback text names the loss, per repair
R9).

**The territory counter-arguments, engaged.** n1: L1 is already encoded as
ADR-0007 #1 / ADR-0009 #4 mechanization triggers, deliberately unfired pending
measure-first. True for *recording* mechanization when it reaches an existing
tenet — but the triggers own neither the corrective-design protocol
(measure-first, quantify-over-class, template-not-gate) nor the authoring-time
obligation; and the corpus's own datum cuts the other way: trigger bookkeeping
is its weakest mechanism (recorded in 0005/0009, silently rotted in 0001/0003 —
digest §2), so leaving the discipline *in* the triggers entrusts it to the
mechanism that demonstrably decays. n3: the delegation pattern worked without
new doctrine — true, and ADR-0011 does not own delegation; it owns the
enforcement-economics decision at corrective-design moments, which no existing
record states normatively.

**The self-application trap, answered in the draft itself**: the tenet binds at
corrective-design moments (a handful of high-attention, template-routed events
per cycle), not the per-edit regime where prose was measured decaying; its
checkable artifacts (the enforcement-surface declaration; the adoption-baseline
record) are absence-detectable by the `adr-effectiveness-audits` sweep — whose
checklist the staged SQL extends accordingly (§9); and it ships with its own
proportionate mechanization (a mechanization-assessment line in
`docs/pre-merge-checklist.md`) per its own Rule 1.

**Folded into ADR-0005 instead of standalone**: deferral capture (L3) as Rule
10 — squarely documentation-authoring discipline, pre-authorized by Revisit #3,
already operational as checklist §D; the tenet-level home makes it binding
beyond the trusted-rotation template and names its grep-able marker as the
mechanization candidate. And the verbatim consult-record discipline as Rule
11 — five committed documents invoke "the standing verbatim-record discipline"
by name (grep-verified by n4 and re-verified in synthesis) while its only
definition is a user-local memory note that no clone receives: a named handle
with no owning committed document, Rule 1's failure shape applied to a
discipline. The PR-#382 arc — where a fabricated sanction quote inside a
review artifact was caught precisely *because* the artifact was verbatim — is
the paid-for substrate.

**Weighed and left as-is, with reasons** (each carried as a note in the
appendix): the L2 owner principle (already at the right altitudes: lint +
worked examples + the ADR-0001 amendment; its generalized form becomes ADR-0011
Rule 4); the measure-first protocol (a protocol, not a principle — becomes
ADR-0011 Rule 3; its de-facto registry stays the eslint config header, with
the census-rot history read as an argument for the stable-handles convention,
not against the protocol); out-of-frame adversarial review (harness-bound
process — the corpus stays collaboration-tool-agnostic; if repo-residency is
wanted, the umbrella CLAUDE.md is the home, phrased tool-agnostically — §8.9);
the template-not-gate calibration (the boundary condition on mechanization —
becomes ADR-0011 Rule 5, naming `rigor-proportionality-rubric-adoption` as
adjacent, not subsumed). One seat hole stated per the critic (G6): the r1
territory (0001/0010) filed no inverse answer; synthesis supplies it — L2 is
that territory's lesson and is adjudicated above.

## 6. What this audit deliberately does not propose

Declines, each with its reason — recorded so silence is not read as oversight:

1. **No slim of ADR-0002 Rule 7** (~86 lines incl. the provisional-home
   paragraph and retirement note). The duplication with ADR-0008 is deliberate
   two-register architecture asserted by both documents; the history paragraphs
   are the reasoning trace Rule 6 itself demands; a slim would orphan the
   resolved-via-standalone-ADR fact recorded nowhere else, the corpus's only
   self-application worked example, and the stability of a handle at least
   seven documents resolve against. "Shorter" was the only argument, and the
   bar excludes it.
2. **No slim of ADR-0001's type-system exposition or Alternatives** — the
   exposition is the premise of the decision's honesty argument; trigger #3's
   live escalation terms point into the Alternatives.
3. **No restructure of ADR-0009** (tenet/manual split). Every operator-detail
   section was exercised within ten days and doubles as metric semantics;
   wholesale delegation would fight Revisit #3's own "extensions go in this
   ADR" text. The A9 routing rule prevents *future* accretion instead — the
   bounded fix the bar permits.
4. **No Rule-8 sibling/successor for ADR-0003.** A successor would re-create a
   second band-definitions home — the exact parallel-registry shape (ADR-0005
   Rule 1) this ADR paid to dissolve via the FILES.md delegation. The
   record-plus-dated-corrections shape is kept and completed (A3).
5. **No encoding of the four corpus-silence constructions** (critic G3; digest
   §2 "settled vs constructed") — adjudicated individually:
   - *Terminal loudness level per surface* (warn vs throw vs system message):
     deliberately per-arc calibration — ADR-0002's Neutral says the tenet does
     not prescribe mechanisms, and the enrichment-merge worklog shows the
     calibration being made well *from* the hierarchy. Encoding a table of
     surfaces would turn the tenet into the manual ADR-0009 is declining to be.
   - *Rule 4's reach beyond the ACL*: the "analogical, not literal" reading the
     verifiers constructed is correct and now has a worked precedent in the
     enrichment-merge record; a scope widening would need its own evidence arc.
   - *Capability-mismatch loudness* (degrade one capability, never grow the
     refusal surface): a wire-contract calibration owned by the
     capability-negotiation dispatch lineage and now pinned by tests at the
     seam; not tenet material.
   - *The dominant-concern tag legend vs mechanical conformance*: owned by the
     filed `band-conformance-ci-check` item (open/future), whose design must
     decide it; pre-deciding it here would prejudge that arc.
6. **No retroactive header harmonization sweep** (ordinals, License footers,
   ADR-0001's missing Genre/Scope lines, ADR-0009's trailing amendment
   sections): noise under ADR-0006's own doc exemption; harmonize on touch.
   Future tenets may state their ordinal without enumerating predecessors —
   the synopsis owns the roster.
7. **No ADR-0006 header-conformance sweep**: the audit measured instead
   (96% / 70%, §2) and stages the optional lint item (§9). Retrofit-on-touch
   stands.
8. **No fork-consumption protocol drafted**: where it lives (synopsis tail,
   ADR-0003's fork section, or the fork's own onboarding doc) is maintainer
   direction (§8.8); n2's sketch is preserved in the appendix.
9. **No new work item for the feature-surface reorganization's missing
   decision record**: surfaced as a maintainer question inside A7's pointer
   correction (genre would be *decision*, not tenet; the omission already
   happened, so a dated retro record is the only honest shape if wanted).
10. **No verdict on `useActivePath.ts`, `serializeActivePath`'s rename, or the
    other code-level residues** the mid-audit worklogs recorded — they are
    owned by their arcs' own records and the store; this audit's scope is the
    corpus.

## 7. Verification record

- **Refutations run**: 3 (two new-tenet, one restructure) — `survives` ×2,
  `weakened` ×1; zero proposals refuted. No retire/slim/merge proposal
  materialized, so the commissioned per-proposal refuter tier for that class
  had no members; amend/status-change proposals were fact-checked by the
  synthesizer against post-#390 HEAD per the restructured plan.
- **Critic gaps, discharged in synthesis**: G1 — the five mid-audit worklogs
  read end to end; A2's mechanization enumeration redrafted (the reader's
  version was verifiably stale within hours — itself a small instance of L5).
  G2 — every amendment claim re-verified at post-#390 HEAD (spot results: the
  ADR-0003 `engine/util.ts` sizing line *survives* #389 accurately; the
  FILES.md disagreements in A3's note re-confirmed). G3 → §6.5. G4 — ADR-0010
  #3 carried as partially unassessable. G5 — the acceptance record names the
  unmeasured metric. G6 → §5. G7 → §10. G8 → §9. G9 — full verbatim reports
  confirmed retained and shipped in the appendix. C1–C9 adjudications are
  baked into §4/§5 (dedupes: one reference-repair amendment per ADR; the
  synopsis-0009 fix is one amendment with two finders; the handoff restructure
  subsumes the spot-fix).
- **Synthesis-level checks the critic ordered**: n4's Rule-11 "no committed
  definition" grep re-run (confirmed: five usage sites, zero definitions);
  the ADR-0006 conformance measurement (§2); n1's status-change warrant
  tempered to "one recorded verifier correction"; n4's two rule appends —
  which escaped dedicated refutation by being classed amendments — were
  checked in synthesis against the n2-refuter's binding facts (scope fit
  within ADR-0005's documentation-authoring mandate: both pass; Amendments
  lines: present; enforcement surfaces: declared; synopsis enumeration:
  substantive co-change required and noted) and are flagged for the
  maintainer as the least-refuted proposals in the set (§8.4).
- **Known residual risk**: r1/r2 ran under the fuller pre-restructure evidence
  regime but against pre-#388 HEAD; their HEAD-anchored claims that survived
  into amendment text were re-verified, but their report prose may carry
  stale line numbers. The appendix preserves them verbatim as point-in-time
  records.

## 8. Maintainer decision points

1. **The amendment packages A1–A12** — sign-off per package; A11 (handoff
   restructure) carries the option of the weaker fix-in-place + derived-from
   marker variant its refuter assessed.
2. **A7: flip ADR-0007 to Accepted** — with the acceptance-record text as
   drafted, or hold Proposed with a dated note explaining why.
3. **A13: mint ADR-0011** — standalone as drafted; or the ADR-0002 Rule-8
   fallback (named loss: Rules 3–5 homeless); or decline (the practice
   continues, unowned — the status quo the RCA's question 4 queued).
4. **A5b/A5c: ADR-0005 Rules 10–11** — note these carry synthesis-level
   verification only (§7); if either feels under-verified, an out-of-frame
   refutation pass before execution is cheap.
5. **The C4 precision rider on ADR-0003 #1** ("fired twice" → one materialized
   adopter + one filed prospective adopter whose own gate is unmet) — adopt
   the conservative phrasing (recommended; it is the appendix-verified
   reading) or record a reasoned decline.
6. **§9's optional items** — the header-lint candidate; the step-(b)
   re-capture's shape (re-file vs deliberate-drop record).
7. **Where the fork-consumption statement lives** (§6.8).
8. **Out-of-frame-review repo-residency** (§5) — leave as process, or add the
   tool-agnostic paragraph to the umbrella CLAUDE.md.

**The two gates, restated**: (1) nothing in §4/§5/§9 executes before maintainer
sign-off; (2) after execution, the follow-up consolidation review runs —
consolidating the history-lessons audit's recommendations against the revised
corpus. Its named inputs: the ADR-0011 shape decision and its synopsis/census
co-changes; the deferred on-touch fixes (§6.6–6.7); the deliberately-unfired
mechanization triggers (ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) whose
measure-first gates remain open; and the A3/A10 text variants that finalize
against §9 outcomes.

## 9. Staged SQL — not executed (read-only commission)

Apply only after sign-off, with
`psql -h 192.168.122.1 -d todo -v ON_ERROR_STOP=1`, then confirm
`SELECT * FROM work_status_violations;` returns zero rows. Items 3–5 file the
execution arcs for this audit's own proposals; adjust ids/text to taste at
curation.

```sql
BEGIN;

-- (1) Record this sweep on the cadence item (UPDATE; curation-gated).
UPDATE items
SET description = description || E'\n\nSweep record (2026-06-10, the generic corpus audit — docs/notes/audit/audit-adr-corpus-2026-06-10.md): all 38 triggers walked from end-to-end reads (5/4/4/2/3/3/4/4/5/4 re-derived, reconciling the prior count); fired-or-partial unrecorded firings found at ADR-0004 #1, ADR-0005 #2 (second wave), ADR-0008 #4, ADR-0010 #4 — amendment texts staged in the audit. If the audit''s proposal set ships, the next sweep''s baseline is 43 (ADR-0002 gains #5; ADR-0011 adds four). The sweep checklist gains two absence-checks when ADR-0011 ships: every discipline-stating rule carries an enforcement-surface declaration; every mechanism adoption carries its measured baseline record.'
WHERE id = 'adr-effectiveness-audits';

-- (2) Re-capture the evaporated step-(b) deferral (the audit's own L3 shape,
--     reproduced during execution; r1 finding, store-verified: no successor).
INSERT INTO items (id, title, description, state, disposition, scope, tier)
VALUES ('reactive-state-modules-relocation',
        'Relocate the reactive-state modules out of services/ (step (b) of the boundary inversion)',
        'Step (b) of the shipped services-boundary-deny-by-default arc: move the reactive-state class ({analysis-ledger, analysis-config, stability-trajectory-store}) to a src/state/ directory so the component-import boundary becomes purely directory-structural and REACTIVE_STATE_EXEMPTIONS is deleted. This is ADR-0010 Revisit #4''s named collapse-into-one-principle pathway; it lost its open record when the parent item closed as shipped (2026-06-10) — re-captured by the ADR-corpus audit per pre-merge-checklist §D. Separate sign-off arc per the original item text; the natural place to record the machinery-vs-payload seam.',
        'open', 'future', 'frontend', 'medium');
INSERT INTO refs (item_id, kind, target) VALUES
  ('reactive-state-modules-relocation', 'audit',   'docs/notes/audit/audit-adr-corpus-2026-06-10.md'),
  ('reactive-state-modules-relocation', 'worklog', 'docs/worklog/2026-06-10-services-boundary-deny-by-default.md'),
  ('reactive-state-modules-relocation', 'adr',     'docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md');
INSERT INTO labels (item_id, label) VALUES
  ('reactive-state-modules-relocation', 'refactor'),
  ('reactive-state-modules-relocation', 'architectural-cruft');

-- (3) The amendments execution arc (A1-A12).
INSERT INTO items (id, title, description, state, disposition, scope, tier, parent)
VALUES ('adr-corpus-amendments-2026-06',
        'Execute the ADR-corpus audit''s amendment packages A1-A12',
        'Apply the signed-off subset of the 2026-06-10 corpus audit''s amendment packages: record repairs and trigger records on ADR-0001..0010, the synopsis entry refresh, the handoff governance delegation (with its five refuter repairs), the README refresh, and ADR-0007''s acceptance record. Ready-to-apply text in the audit''s Appendix A; per-package sign-off in audit §8; synopsis substance checked manually per package (the cochange advisory verifies touch only); doc-graph regenerated where structural.',
        'open', 'future', 'umbrella', 'medium',
        'adr-effectiveness-audits');
INSERT INTO refs (item_id, kind, target) VALUES
  ('adr-corpus-amendments-2026-06', 'audit', 'docs/notes/audit/audit-adr-corpus-2026-06-10.md');
INSERT INTO labels (item_id, label) VALUES
  ('adr-corpus-amendments-2026-06', 'docs');

-- (4) The ADR-0011 authoring arc (A13 + A5b/A5c), if accepted.
INSERT INTO items (id, title, description, state, disposition, scope, tier, parent)
VALUES ('mechanization-discipline-tenet',
        'Mint ADR-0011 (mechanization discipline) + ADR-0005 Rules 10-11',
        'Author ADR-0011 from the audit''s Appendix A draft (five rules; Status Proposed; every refuter repair folded), append ADR-0005 Rules 10 (deferral ledgering) and 11 (verbatim consult records), and land the bundled co-changes in one PR: synopsis entry + nine-tenets census + family paragraph + rules enumeration; the pre-merge-checklist mechanization-assessment line (the tenet''s own Rule-1 self-application); ADR-0002 Revisit #5 naming the assigned number; doc-graph regeneration. Falls back to ADR-0002 Rule 8 (provisional-home flag; Rules 3-5 recorded as homeless) per audit §8.3 if the maintainer prefers.',
        'open', 'future', 'umbrella', 'medium',
        'adr-effectiveness-audits');
INSERT INTO refs (item_id, kind, target) VALUES
  ('mechanization-discipline-tenet', 'audit',       'docs/notes/audit/audit-adr-corpus-2026-06-10.md'),
  ('mechanization-discipline-tenet', 'design-note', 'docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md'),
  ('mechanization-discipline-tenet', 'audit',       'docs/notes/audit/audit-spa-history-lessons-2026-06-10.md');
INSERT INTO labels (item_id, label) VALUES
  ('mechanization-discipline-tenet', 'docs');

-- (5) OPTIONAL: the ADR-0006 header-lint candidate (n2's note; audit measured
--     96%/70% path-presence — L1-preventive, not corrective; future is honest).
INSERT INTO items (id, title, description, state, disposition, scope, tier)
VALUES ('source-file-header-lint',
        'Pathname-header check for ADR-0006 (advisory-first)',
        'A mechanical check that a source file''s head block carries its subproject-relative path (frontend: leading JSDoc / SFC script JSDoc; backend: module docstring), scoped per ADR-0006''s exemptions, adopted measure-first per the established posture. Fires ADR-0006 Revisit #1 when it ships; record the firing there. The corpus audit''s sample measurement (2026-06-10): frontend 214/222, backend 83/118 path-presence.',
        'open', 'future', 'both', 'small');
INSERT INTO refs (item_id, kind, target) VALUES
  ('source-file-header-lint', 'audit', 'docs/notes/audit/audit-adr-corpus-2026-06-10.md'),
  ('source-file-header-lint', 'adr',   'docs/adr/0006-source-file-headers.md');
INSERT INTO labels (item_id, label) VALUES
  ('source-file-header-lint', 'tooling');

COMMIT;
-- Gate: SELECT * FROM work_status_violations;  -- must return zero rows
```

## 10. Coverage and limits

- The synthesizer coverage statement is in §Method; the per-agent coverage
  statements (including the digest agent's byte-completeness method over the
  ~810 KB appendix corpus) are verbatim in the companion appendix.
- **Assessed by delegation, not directly**: the history-audit appendix parts
  (via the digest); the readers' prose reports (via their structured fields).
- **Named residuals, not swept** (critic G7): `backend/CLAUDE.md`'s ADR
  mirrors; `frontend/IDENTIFIERS.md`'s post-types-split row re-pointing
  (asserted done by the split worklog; spot-confirmed only via the mid-audit
  worklogs' same-PR re-points); `proxy/CLAUDE.md` (submodule — out of scope by
  the audit's own scope discipline).
- **Unassessable, carried honestly**: ADR-0002 triggers #1/#2
  (user-report-dependent); ADR-0007 trigger #2 (view-tool behavior outside the
  tree); ADR-0007's density metric (never measured — named in the acceptance
  record); ADR-0010 trigger #3 (no source census run).
- The ADR-0006 conformance numbers are a path-presence sample (purpose- and
  license-blind; generated files in the denominator); they ground a
  health-reading, not a conformance claim.
- HEAD moved during the audit (PRs #386–#390 merged mid-run); all shipped
  amendment text was drafted or re-verified against post-#390 HEAD, but the
  cached r1/r2 prose reports predate it (preserved as point-in-time records).
- This audit ran no profiles and asserts no perf properties (ADR-0009).

---

# Appendix A — ready-to-apply amendment text

Conventions: every package lands as a dated, append-shaped amendment per the
corpus's own convention (Amendments header line + dated in-place note; no
silent body edits; point-in-time records untouched). Text in quotation blocks
is the exact proposed content; `<date>` is the execution date. Where a reader's
draft was adopted verbatim it is credited; synthesis redrafts are marked.

## A1 — ADR-0001 (r1's text, verified)

1. Revisit-when #1: replace `(ETag-style, see TODO item 27-full)` with:

   > (ETag-style — parked as work-status item `item-27-etag-multitab`, the
   > ETag multi-tab coordination layer; successor of the retired TODO
   > numbering's item 27-full, design sketch in the `SyncService::sendSync()`
   > comment)

2. Related bullet 2 → "The last-write-wins single-tab invariant documented on
   `SyncService::sendSync()` (retired TODO numbering, item 27-min; archived
   record in `docs/archive/TODO-completed-2026-05-06.md`) is a consequence of
   the same \"mutation-first, discipline via convention\" model."
3. Related bullet 3 → "The collapse of `SyncService`'s three-channel watcher
   into one (retired TODO numbering, item 17; same archive) is enabled by the
   fact that mutations all land in the same reactive tree, making a single
   watcher sufficient."
4. Context, after "…marked essentially every field of every interface as
   `readonly`.", append:

   > *(Catalog note, 2026-06-10: the single-file catalog has since split along
   > its banner seams into `src/types/` domain modules plus
   > `src/store/schema.ts`, with `types.ts` remaining as the barrel —
   > history-lessons audit §3.15. The two-category `readonly` policy this ADR
   > sets is restated in the barrel's header; the historical claim above
   > describes the pre-split file.)*

5. Amendments header line: "Third amendment, `<date>` — the three retired
   TODO-numbering handles (Revisit #1, Related ×2) re-pointed to stable
   handles (the work-status item id for the live multi-tab trigger; the
   archive snapshot for the two shipped items), and a dated catalog-split
   note added in Context. No content change; per the stable-handles
   convention (history-lessons audit §3.25)."

## A2 — ADR-0002 (r2's text; items 4–5 redrafted in synthesis against post-PR-#390 HEAD)

1. **Scope line** → replace with:

   > - **Scope:** Codebase-wide — `frontend/`, `backend/`, `proxy/`, and the
   >   documentation graph. *(Updated `<date>`; the original line predated the
   >   umbrella, naming the frontend by its former repository name `gogui` and
   >   the backend as a design aspiration. The tenet has applied project-wide
   >   since the umbrella formed: the proxy's call-site-validated structured
   >   logging and configuration hard-refusals, the backend ACL posture, and
   >   the documentation-consumption corollary in the umbrella `CLAUDE.md` are
   >   the register instances.)*

2. **Reference repairs**: Rule 7's two postmortem citations gain the
   `postmortem/` path segment; the Related planning-note bullet becomes:

   > **`../archive/notes/design/analysis-persistence-plan.md`** — the planning
   > note the no-silent-retry-queue Context example is drawn from; the design
   > has since shipped (the SPA uploads analysis bundles to the backend's
   > `/analysis-bundles` endpoint) and the note is archived.

   New Related line: "**Pre-store item numbers.** Items 20/21/29/30 cited
   above predate the work-status store and resolve against
   `docs/archive/TODO-completed-2026-05-06.md`; current work status lives in
   the `todo` Postgres store." Engagement-protocol bullet, append: "— since
   codified in the umbrella `CLAUDE.md` (\"Asking before assuming\"; \"ADR-0002
   applies to documentation consumption\") and the frontend `CLAUDE.md`
   reading-discipline corollary, which are now the owning documents for this
   register."
3. **Retired-marker note**, appended after Rule 7's channel list and
   referenced from Rule 6:

   > *(Updated `<date>`.)* ADR-0005 Rule 9 (2026-06-02) retired the per-note
   > `design-note: <status>` marker vocabulary named here; the sibling-revision
   > channel is unchanged, but a note's status is now delegated to its owning
   > work-status item, and the "TODO entry" channel means a work-status store
   > item.

   **Exception 3**, append:

   > *(`<date>`.)* The 34b fallback chain has since been removed on schedule —
   > `backend-service.ts` no longer carries it. The worked example is
   > historical; the rule of thumb stands, and the completed removal is the
   > "explicitly-scheduled-for-removal" contract honoured.

4. **Negative bullet** ("Developer discipline required"), append *(synthesis
   redraft — the reader's enumeration predated PR #387)*:

   > *(Updated `<date>`.)* Partially mechanized since authoring:
   > `frontend/eslint.config.js` enforces several registers of this tenet at
   > `error` — the silent-async class (`no-floating-promises`), union
   > exhaustiveness (`switch-exhaustiveness-check`), the thrown-non-Error ban
   > (`only-throw-error`, RCA guard G3), the error-message-reparse ban (RCA
   > guard G1), and the any-assertion ban (cast-hygiene stage 1) — plus the
   > ownership local rules, with per-rule rationale and measured-at-adoption
   > records kept in that config's header, which is the census's single home
   > (this ADR deliberately does not mirror the rule list; hand-maintained
   > mirrors drift — history audit L5). The work-status store's table
   > constraints and the doc-graph freshness gate are the
   > documentation-register analogs. The unmechanized residue — an empty
   > `catch`, justification *quality* on casts, the judgment calls in Rules
   > 3–4 — remains review's.

5. **New Revisit-when #5**:

   > **A rule of this tenet gains a mechanical guard** (lint rule, type-level
   > ban, DB constraint, CI gate). Record the mechanization here by dated
   > append — the enforcement level is part of a rule's meaning. (Substrate:
   > the 2026-06-01 RCA's common-root finding and history-audit lesson L1 —
   > prose disciplines decay, mechanisms stick. If the mechanization-discipline
   > tenet ships, this trigger is its fail-loudly-register hook.)

6. One consolidated Amendments header entry dated `<date>` covering 1–5.
   Synopsis co-change checked for substance; doc-graph regenerated
   (cross-reference changes).

## A3 — ADR-0003 (n3's text, verified at post-#390 HEAD)

1. End of "Why not extract Ports preemptively now":

   > *(Note, 2026-06-10 — completing the in-place record the same-day
   > amendment started: the closing premise above, "no concrete second-domain
   > consumer exists", is no longer true. Two adopters are named in the
   > Amendments line; per Revisit-when #1, Port extraction for the seams a
   > concrete adopter touches is no longer premature by this section's own
   > cost-benefit argument. The reasoning stands as the planning-time record
   > of why extraction waited; it is not a standing instruction to keep
   > waiting.)*

2. End of "What this means for the analysis-recording feature":

   > *(Note, 2026-06-10: the feature shipped — the analysis-bundle persistence
   > arc (backend `/analysis-bundles` routes; frontend
   > `services/analysis-persistence-service.ts` +
   > `composables/useAutoSaveAnalyses.ts`). Scored against what was built: the
   > **opaque envelope shipped as designed** — the v1 wire is
   > `{config_hash, node_id, packet}` with the packet opaque to the backend
   > (`backend/domain/analysis_bundle.py` states the contract: "the backend
   > never inspects its shape"), and the v2 evolution strengthened the opacity
   > (SPA-encoded bytes the backend brotli-wraps and returns verbatim). The
   > **seam was designed, not extracted** — no Port, no strategy registry,
   > exactly as prescribed. Two deviations from this section's letter: the
   > persistence service is Go-typed (`[B3]` in FILES.md; its records carry
   > `KataAnalysisResponse`, and the v2 encoder hierarchy under
   > `services/analysis-bundle/` is KataGo-shaped) rather than generic over
   > `payload: T`; and the gating predicate is not passed as a parameter — the
   > `isDuringSearch` gate lives at the `analysis-service` call site that bumps
   > the service's domain-neutral per-board dirty counter, with user-toggle
   > gating in the auto-save composable. The seam between Go-shaped capture
   > and generic persistence mechanics exists, one notch further upstream than
   > drawn here. A fork replaces the encoder hierarchy and the dirty-bump call
   > site; the wire contract and the backend need no change — the section's
   > bottom-line claim held.)*

   Band-mixed seam list, analysis-recording bullet, append: *(Shipped —
   2026-06-10-recorded; see the dated note in "What this means for the
   analysis-recording feature".)*
3. After the principle blockquote in the Decision section:

   > *(Note, 2026-06-10: with a non-game adopter named (Amendments line), the
   > authoring-time question is two-axis. "What would change for a Chess
   > port?" forces the game-instance seam — Band 3 against the rest. "What
   > would survive a port outside the game class?" forces the stronger Band 1
   > boundary, which is the whole kept surface for the generic knowledge fork.
   > Ask both; `frontend/FILES.md`'s legend was re-keyed to the stronger
   > criterion in the same change as this amendment.)*

4. End of "What a Chess port would actually require":

   > *(Note, 2026-06-10: the file rows above are the 2026-04 planning snapshot
   > and are not maintained — `frontend/FILES.md` is the per-file authority
   > (Amendments line). Known row-level disagreements exist: this section's
   > Band-1 "no change" examples include `store/` (`store/index.ts` is `[B3]`
   > in FILES.md), `services/` (several `[B3]` rows), and
   > `composables/wait-for-analysis.ts` (`[B3]`); `engine/helper.ts` sits
   > under wholesale replacement here but is `[B1]` there. These are recorded
   > in the 2026-06-10 history-lessons audit as adjudication the filed
   > band-conformance check (work-status `band-conformance-ci-check`) will
   > force; until then read this section's bands as
   > definitions-with-seam-detail and FILES.md's rows as the instances — where
   > they disagree, neither is silently right (Revisit-when #3's posture).)*

5. Related: re-point `../notes/analysis-persistence-plan.md` →
   `../archive/notes/design/analysis-persistence-plan.md` with "The planning
   note that triggered this ADR (archived when the feature shipped; path
   re-pointed `<date>` — the old `docs/notes/` location no longer resolves)."
6. **Optional precision rider** (§8.5, recommended): in the Amendments line and
   Revisit #1, replace "has fired twice" with: "has fired (the maintainer's
   generic knowledge flash-card fork, 2026-06-09/10), with a second prospective
   adopter filed on the game-class axis (the `chess-clone` work-status item,
   open/active; its own proof-of-concept gate is unmet)".
7. One Amendments header entry covering 1–6; synopsis substance check;
   doc-graph regenerated (item 5 is structural).

## A4 — ADR-0004 (n3's text)

Append at Revisit bullet #1:

> *(2026-06-10, partial — recorded by the ADR-corpus audit: the tooling
> environment moved without yet warranting relaxation. Frontend CI has gated
> `vue-tsc -b` on every PR since 2026-06-01
> (`.github/workflows/frontend-ci.yml`), and two footgun classes adjacent to
> this tenet's Context are mechanized as lints (`local/gate-prop-needs-default`,
> `local/module-intent-in-script-setup` — see `frontend/CLAUDE.md`). The
> 2026-06-10 history-lessons audit assessed this trigger as partially
> satisfied, low confidence, unverified empirically; its verification pass also
> narrowed the ceiling — the boolean gate-prop omission class is type-legal by
> design, so template type-checking cannot catch it even in principle. The
> policy stands unrelaxed until someone measures what the current checker
> actually catches of the four Context cases; that measurement is the gate for
> exercising the "relax in proportion" clause.)*

Plus the ADR's first Amendments header line: "Amendments: `<date>` — Revisit
#1 recorded as partially fired; policy unrelaxed."

## A5 — ADR-0005

**(a) Second-wave mechanization record (n2's text).** Amendments line append:

> `<date>` — noted that the Revisit-when #2 mechanization has widened since the
> 2026-06-01 firing: a co-change advisory (`tools/doc-graph/cochange-advisory.mjs`,
> 2026-06-02) flags derived docs (declared via `derived-from` markers) whose
> sources change in a PR without them — a partial, advisory-only net for the
> Rule 1 / Rule 3 derived-summary hazard; and the dangling-reference report
> gained origin buckets (live / executed / frozen), tombstones for retired
> hubs, directory-reference resolution, and an advisory no-new-danglers
> ratchet (work-status item `doc-graph-dangling-signal-cleanup`).
> Advisory-not-gate per Alternative C's reasoning; the judgment core of Rules
> 3 and 6 remains policy. No rule change.

Alternative C's "Partly adopted 2026-06-01" paragraph gains one sentence
("A co-change advisory (2026-06-02) extends this to declared derived docs
whose sources change without them; the dangling-ref report gained origin
classification and an advisory ratchet (2026-06-10)."). Related doc-graph
bullet: `docs/doc-graph.{json,svg,md}` → `docs/doc-graph.{json,md}` with
"(the SVG renders locally and is gitignored — see
`docs/notes/vestige/deferred-items/doc-graph-svg-render-off-tree.md`)".
Optionally annotate Rule 5's routers-reference near-miss mention as historical
(the cited file was long since relocated; the bare path now dangles in the
validator's live class). Doc-graph regenerated (the Related path change is
structural).

**(b) Rule 10 — deferrals are ledgered at authoring time (n4's text).**
Amendments line: "`<date>` — appended Rule 10 (deferrals are ledgered at
authoring time): per the history-lessons audit lesson L3 (prose deferrals
reliably evaporate; ledgered ones survive) and the deferral-harvest arc, every
deferral / out-of-scope / recommendation bullet either names its work-status
SSOT item id or carries a grep-able `not-filed: <reason>` marker; refs to the
paid-for diagnosis attach at filing time. `docs/pre-merge-checklist.md` §D is
the operational walk-through." Rule body, appended after Rule 9:

> ### Rule 10: Deferrals are ledgered at authoring time
>
> *(Appended `<date>`.)*
>
> A deferral names a piece of future work; per Rule 1, future work has exactly
> one owning home — the work-status SSOT. The 2026-06-10 history-lessons audit
> verified the failure mode from both directions (lesson L3): every deferral
> that reached the work-status store was accounted for at audit time, while
> deferrals recorded only in worklog "What's deferred" sections, postmortem
> recommendations, or retrospective roadmaps reliably evaporated — including
> one (the module-scope rebinding audit, deferred in a 2026-05-17 worklog)
> parts of whose class recurred before the audit re-surfaced it.
>
> - **Capture.** Every deferral / out-of-scope / recommendation bullet in a
>   worklog, postmortem, retrospective, audit, or consult record ends with
>   either a work-status item id or an explicit, grep-able
>   `not-filed: <reason>` marker. Neither "held for the next X-touch PR" nor a
>   bare prose admission is a tracked state.
> - **Refs at filing.** An item filed near a diagnosis document gets its ref to
>   that document at filing time; an item without refs to its paid-for
>   diagnosis forces the next session to re-derive it.
> - **Retitle to the residual.** When an open item's work partially ships,
>   retitle/redescribe it to what actually remains.
> - **Generalization deferrals survive.** A deferral whose rationale is
>   generality for a second domain is never dropped on "only one domain uses
>   it" grounds.
>
> This rule is Rule 6's "where" to its "when": the evaporated deferrals *were*
> written down in the moment — in the wrong home. It is the forward-looking
> register of the consolidation Rule 9 records: Rule 9 anchors design notes to
> the SSOT; this rule anchors the moment future work is first named.
> `docs/pre-merge-checklist.md` §D is the operational walk-through. The marker
> convention is deliberately grep-able so a future advisory sweep can mechanize
> detection — Revisit-when #2's open candidates gain a third.

**(c) Rule 11 — commissioned-review artifacts are recorded verbatim, in-tree
(n4's text).** Amendments line: "`<date>` — appended Rule 11
(commissioned-review artifacts are recorded verbatim, in-tree): the commission
prompt and full report of any audit / consult / adversarial-review sub-agent
are recorded verbatim in an appendix of the relevant committed document; the
verdict label does not travel without the artifact; corrections are in-situ
and dated. Previously defined only in a user-local memory note while invoked
by name in committed documents." Rule body, appended after Rule 10:

> ### Rule 11: Commissioned-review artifacts are recorded verbatim, in-tree
>
> *(Appended `<date>`.)*
>
> When work leans on a commissioned review — an audit sub-agent, a consult, an
> adversarial pass such as a hack-rationalization run — the commission prompt
> and the full report are recorded verbatim in an appendix of the relevant
> committed document (worklog, audit note, postmortem). The verdict label does
> not travel without the artifact: a bare "passed review" or
> "narrower-but-justified" with no inspectable commission and report is the
> unsubstantiated-claim shape ADR-0002 and ADR-0009 forbid in their registers.
> Where an artifact's authoritative copy lives off-tree (a PR comment), the
> committed document carries the pointer plus the artifact's substance, so the
> record survives the forge. Corrections to a recorded artifact are made in
> situ, dated, with the surrounding artifact otherwise left verbatim — the
> Rule 8 sibling-revision principle applied inside a single record.
>
> Substrate: the 2026-06-10 multi-writer arc, where a fabricated sanction
> quote inside an in-frame review artifact was caught precisely because the
> artifact was verbatim-recorded and an out-of-frame rerun could check it
> against the commissioning item; the strike is an in-situ dated correction,
> the artifact otherwise untouched (the worklog's appendix and postscript are
> the worked example). The practice predates this rule — the history-lessons
> audit's three-part verbatim appendix is the largest instance — but its
> definition lived only in a user-local memory note while committed documents
> invoked "the standing verbatim-record discipline" by name: a named handle
> with no owning committed document, the Rule 1 failure shape applied to a
> discipline.

Co-changes for (b)+(c): the synopsis's ADR-0005 entry rules enumeration
updates **substantively** (nine → eleven, with one-clause descriptions of
each); the handoff's "Seven rules" line must not go three-stale — land with or
after A11; Revisit-when #2's open-candidates sentence gains the
deferral-marker sweep.

## A6 — ADR-0006 (n2's text)

First Amendments header line: "- **Amendments:** `<date>` — corrected the
exemplar path (`frontend/src/composables/useTreeLayout.ts` →
`frontend/src/composables/forest/useTreeLayout.ts`; the file moved in a
source-tree reorganisation and its own header self-updated per this tenet —
only this ADR's citation had rotted). No content change." Both occurrences
updated (the Context paragraph's quoted header block's first line, matching
the file at HEAD, and the Related bullet).

## A7 — ADR-0007 (n1's text)

Header: `- **Status:** Proposed` → `- **Status:** Accepted (proposed
2026-04-26; accepted <date>, see the acceptance record below)`. Appended after
"What this tenet does NOT mean":

> ## Accepted (maintainer review, `<date>`)
>
> Proposed 2026-04-26; accepted on review of six weeks of practice in which
> the tenet operated as binding in all but label: the C2 arc (2026-04-27,
> App.vue 593 → 500 via three composable extractions) executed the refactor
> queue one day after authoring and validated §Format's contract-the-static
> discipline; the `migrations.ts` rolling archive (2026-05-14) is the second
> worked intervention; the work-status item `refactoring-queue-adr0007`
> executes the Neutral handled-on-touch clause as live policy; the 2026-06-10
> `types.ts` split (PR #384) was approved as a *named deviation* warranted by
> this ADR's type-catalogue exception text — a deviation regime presupposes a
> binding norm; the lint config defers `max-lines` against these budgets and
> cites the tenet as rule rationale; `frontend/CLAUDE.md` restates the SFC
> discipline; `docs/adr-synopsis.md` counts this among the eight tenets.
>
> Two questions stay open under acceptance, named so the label does not
> silently bless them: (1) the §Density numeric thresholds (60 / 40 percent)
> have never been measured in practice (2026-06-10 history-lessons audit §8);
> density operates as qualitative review judgment, and Revisit #3 remains the
> live trigger. (2) Per RFC-0001 open question 8, the budget language is
> sharpened to the practiced posture: when a refactor is undertaken, the
> budget is satisfied by stopping at the cleanest seam that meaningfully
> reduces working-memory cost (bounded), not by driving below the numeric
> threshold (aspirational); the C2 bounded-stopping evaluation is the worked
> precedent.

Not-goals bullet → "- Not a directory-organization decision. *(Updated
`<date>`: the frontend decision this bullet tracked landed 2026-05-11 as the
feature-surface reorganization of `components/` and `composables/` — commit
`39e200d` — without the ADR the original text promised; the organizing
principle is recorded only in that change's own record. The backend's decision
*against* reorganizing remains in the deferred-decisions ledger.)*"
Co-changes: synopsis entry drops "Status as of authoring: Proposed.";
frontend/CLAUDE.md drops its "(proposed)" parenthetical;
`docs/notes/decisions-deferred.md`'s frontend paragraph gains a dated outcome
note per that ledger's edit-on-fire convention.

## A8 — ADR-0008 (r2's text)

1. Substrate item 4's parenthetical → "(Recorded in the reorganization audit's
   implementation outcome — `docs/archive/notes/frontend-source-tree-reorganization.md`,
   decision point 2, which applied the same flat-lift to five further ambiguous
   composables on the same principle; surfaced 2026-05-11.)"
2. Rule 2 → "The companion rule recorded in the same reorganization audit (its
   Option E): *\"earn-your-place\"*".
3. Single-domain-prototype exception, append: "*(Updated `<date>`.)* ADR-0005
   Rule 9 (2026-06-02) retired the per-note `design-note: <status>` marker
   vocabulary; the explicit refusal-to-classify-yet that marker carried is now
   expressed by the design note's owning work-status item remaining open.
   `[experimental]` and `[B?]` stand unchanged." Deliberately-imprecise-tag
   exception: annotate the `design-note: revised` entry "(marker vocabulary
   since retired per ADR-0005 Rule 9 — the deliberate-admission role survives
   as SSOT delegation)". Rule 3's channel list, append: "(a \"TODO entry\"
   means a work-status store item since the 2026-06-02 consolidation)".
4. Revisit-when #4, append:

   > **(Partially fired, recorded `<date>`.)** The work-status store's
   > closed-but-amendable enum constraints (e.g. `refs_kind_check`,
   > `tools/work-status/schema.sql`) mechanically refuse out-of-vocabulary
   > writes — the gap-surfacing this tenet prescribes now happens against a
   > constraint, not a convention; the `refs.kind` `audit`-value arc
   > (`docs/worklog/2026-06-10-refs-kind-audit.md`) is the worked instance: a
   > precedent-based closest-match (`design-note` for audit docs) surfaced per
   > Rule 1 rather than silently reused, and the vocabulary was revised on
   > maintainer sign-off. The band-register mechanization this trigger names
   > directly is filed as work-status item `band-conformance-ci-check`
   > (open/future; history audit §3.14); when it ships, tighten Rule 1's
   > band-tag application from review responsibility toward CI per this
   > trigger's own prescription, and record the firing here.

5. The ADR's first Amendments header line (covering 1–4); the Negative "no
   automated check" bullet gains a one-line dated pointer to the trigger note.
   Doc-graph regenerated (re-cross-references).

## A9 — ADR-0009 (n1's text)

1. Tools lead-in → "The canonical tool surface: two tools at this tenet's
   codification (2026-05-27), extended to four by the 2026-06-01 amendment
   recorded below."
2. Related, add:

   > - **`docs/notes/perf-capture-normalization-protocol.md`** — the
   >   operational companion: this tenet governs *that* a claim carries a
   >   capture and *how* perception reconciles against measurement; the
   >   protocol note carries the capture-comparability mechanics (confound
   >   control, normalization, harness operation). Canonical-tool *status*
   >   decisions — what is canonical, why, and known limits — live in this ADR
   >   and extend by dated amendment; capture *operating protocol* extends in
   >   the companion and the script headers it points at.

3. Metric vocabulary, append:

   > - **Count-based comparison for automated Chromium captures** (added
   >   `<date>`; Revisit #3 instance): the Chrome/CDP path's parser produces
   >   per-component `render` / `patch` *operation counts* and the
   >   render/patch ratio, normalized on the scenario-proxy marks
   >   (`autonav:step` for navigation volume; packet-handler marks such as
   >   `rb3:handler` for analysis volume). Counts are that path's comparable;
   >   duration percentiles (p50/p99) remain the Firefox-path comparable.
   >   Comparability is asserted on the scenario proxies *before* costs are
   >   compared, per the capture-normalization protocol. First worked use: the
   >   2026-06-10 multi-writer-slots null check, whose deviation from a
   >   per-frame-medians commission wording was named loudly under this split.

   Optionally add "(also a Revisit #3 instance)" to the retained-heap entry's
   date note.

## A10 — ADR-0010 (r1's text; final handle per §9 outcome)

Append to Revisit-when #4:

> **(Record note, `<date>` — trigger not fired.)** The work-status record this
> trigger had lacked now exists: item `services-boundary-deny-by-default`
> (closed shipped 2026-06-10, PR #378) inverted the component→services import
> boundary to deny-by-default, with the reactive-state class exempted via one
> named constant (`REACTIVE_STATE_EXEMPTIONS`, now the class's canonical
> enumeration) — strengthening exactly the split described above. That arc
> deliberately re-checked this trigger: no case the split cannot classify
> appeared, so the trigger stays live on its own terms. The
> collapse-into-one-principle pathway named above — relocating the
> reactive-state modules out of `services/` (the item's step (b)) — is
> tracked as work-status item `reactive-state-modules-relocation` *(or: was
> deliberately dropped — per the §9 staged-item outcome)*.

Amendments header line: "Second amendment, `<date>` — Revisit #4 record note:
the trigger's anticipated work-status record now exists
(`services-boundary-deny-by-default`, shipped); trigger re-checked, not fired.
No content change."

## A11 — docs/handoff-current.md (+ A11a synopsis) — n2's restructure with its refuter's five repairs

Replace the per-ADR paragraphs under "## Architectural governance — ADRs and
tenets" with: (1) the existing lead amended to name the genres honestly —
"two structural records (ADR-0001, a decision; ADR-0003, a bounded-context
map) and eight tenets (ADR-0002, 0004–0010…)" (count and 0007 status wording
tracking the A7/A13 outcomes); (2) the delegation sentence, calibrated per
repair R2:

> The condensed per-ADR reference is `docs/adr-synopsis.md` — the single
> derived summary (declared via its `derived-from` marker), watched by the
> per-PR co-change advisory in CI (advisory, not a gate); where it disagrees
> with an ADR, the ADR wins. This section deliberately does not duplicate it
> (ADR-0005 Rule 1).

(3) the closing personality paragraph and "Read all ten" sentence kept
verbatim. **Repairs bound to the same change**: R1 — A11a ships with it (the
synopsis ADR-0009 entry refresh below); R3 — doc-graph regenerated (the kept
personality paragraph retains all ten ADR tokens; the new synopsis pointer
adds an edge); R4 — the two one-clause glosses existing only in the deleted
text ("proxy cache controls are explicit rather than implicit"; ADR-0001's
philosophy extended to "the backend's mutable Pydantic models") are re-homed
in the synopsis's why-care lists or discarded with a named line in the PR
description; R5 — ADR-0003 stays "bounded-context map".

**A11a — synopsis ADR-0009 entry** (n1+n2 convergent; n2's fuller text):
replace "two canonical tools (Firefox DevTools Performance with Vue's
`app.config.performance = true` enabled in dev;
`@firefox-devtools/profiler-cli` as the canonical parser);" with:

> a canonical tool surface (Firefox DevTools Performance with Vue's
> `app.config.performance = true` in dev, parsed by
> `@firefox-devtools/profiler-cli`, for manual investigation; since the
> 2026-06-01 amendment, Chrome DevTools Performance captured via
> CDP-over-Playwright — `frontend/scripts/perf-capture.mjs` with a dedicated
> parser, since `profiler-cli` cannot ingest Chrome traces — for automated and
> concurrent-load captures, plus CDP `HeapProfiler`
> (`frontend/scripts/perf-heap.mjs`) for leak detection, and a pluggable
> scenario harness for reproducible before/after pairs — recommended, not
> mandated);

and the metric-vocabulary clause with "a starting metric vocabulary
(per-handler / per-frame `RefreshObserver` / `LongTask` / GC / inter-arrival
distributions; per-component render+patch ranking with render ≫ patch read as
render-coupling; retained-heap tail-slope per cycle for leaks);". Optionally:
"The two decisions (ADR-0001, ADR-0003)" → "The two structural records —
ADR-0001 (a decision) and ADR-0003 (a bounded-context map)".

## A12 — README.md (n2's text, verified)

In "## Documentation": drop or re-point the `analysis-persistence-plan.md`
line (archived at `docs/archive/notes/design/`; the capability shipped — the
handoff describes the live path); re-verify the rest of the enumeration on the
same touch. In "## Project status": update the headline to v1.1.0 (tag
verified) or de-headline to point at the work-status store + handoff. Doc-graph
regenerated (re-cross-references).

## A13 — ADR-0011: Mechanization Discipline (full draft; r2+n4 merged, all refuter repairs folded)

```markdown
# ADR-0011: Mechanization Discipline

- **Status:** Proposed
- **Genre:** Tenet (cross-cutting corrective-design discipline) — the ninth
  tenet. Rule 1 is the enforcement register of the ADR-0002 / ADR-0008 /
  ADR-0009 unsubstantiated-claim family (an enforcement level is a claim about
  a discipline, and it must be declared, not implied); Rules 2–5 are
  corrective-design protocol adjacent to that family, not a fourth member
  wholesale.
- **Date:** <date>
- **Scope:** Corrective design and discipline authoring across `frontend/`,
  `backend/`, `proxy/`, the documentation graph, and the work-status store —
  the moments when a discipline is authored or amended, and when a corrective
  responds to a recurrence.

## Context

The project's characteristic failure mode is the invisible-at-authoring,
visible-only-in-aggregate defect, against which policy enforced by one
person's attention and memory is structurally weak — only mechanical nets
help. That is the common root cause of the 2026-06-01 RCA
(`../notes/postmortem/rca-discipline-lapses-2026-06-01.md` §3, three
independent surfaces), whose §5 open question 4 deferred exactly this tenet's
existence to the maintainer, naming `adr-effectiveness-audits` as the vehicle.

The 2026-06-10 history-lessons audit evidenced the lesson from both directions
(its L1), with the caveats carried here per ADR-0009's posture: the
review-only cast-justification rule held at ~50% conformance in a 32-of-224
`.ts` sample (template casts unaudited at sampling); the render-coupling
anti-pattern recurred — roughly nine excisions — until ADR-0010 plus the
render-count harness mechanized it, with no recurrence observed in the ~9-day
window since (explicitly a hypothesis, not a proof); hand-maintained census
comments rotted within days of becoming stale; every RCA-minted lint has held
since its adoption date. The tenet+mechanism pairing — not the describing
document alone — is what arrested recurrence (ADR-0010's own Context is the
worked proof).

## Decision

We adopt **Mechanization Discipline** as a codebase-wide tenet, in five rules.

### Rule 1 — Disciplines declare their enforcement surface

Every discipline-stating rule — an ADR rule, a CLAUDE.md convention, a
checklist line — names how it is enforced, against this vocabulary (related
explicitly to ADR-0002's loudness hierarchy; each class is distinct and the
choice among them is part of the rule's meaning):

- **compile-time** (type system; brands);
- **build/CI gate** (lint at `error`, harness test, freshness gate — fails the
  build);
- **write-time data constraint** (DB table constraints — refuses the write);
- **query-time gate** (an invariant view a validator fails on, e.g.
  `work_status_violations`);
- **advisory surface** (a report or per-PR advisory that flags but never
  gates — e.g. the doc-graph dangling report, the cochange advisory);
- **checklist-at-a-named-moment** (a template line consulted at a defined
  event);
- **review-only**.

Review-only is legitimate but presumptively decaying — declaring it makes that
a visible, challengeable choice (the ~50% sample is the calibration). A
declaration may be an explicit policy-only admission naming why mechanization
is declined now and the trigger that would change it; the existing per-tenet
"discipline is policy, not mechanism" Negative bullets and mechanization
Revisit triggers are this rule's pre-existing instances.

*Neutral scoping (no retroactive sweep):* declarations bind when a discipline
is authored or amended and at corrective-design moments; existing rules
retrofit on touch, per the corpus's standing posture (ADR-0004/0006). The
`adr-effectiveness-audits` sweep detects absence thereafter.

### Rule 2 — Recurrence converts to mechanism, not more prose

When a failure shape recurs after its describing record exists, the
corrective's record names the mechanism it pairs with the rule — at the
strongest *feasible and proportionate* surface in Rule 1's vocabulary — or
carries the same explicit policy-only admission and trigger as Rule 1.
"Tenet+mechanism arrests recurrence; a describing-only document does not" is
the cited rationale (ADR-0010's Context; RCA §3), not an unconditional
build-a-gate mandate — the RCA itself adopted G4 as honest policy ("a
mitigation, not a fix") and rated G6 "never a gate". Corollary, adopted as
decision text from the history audit's L1: correctness budget goes to
converting existing prose disciplines before authoring new guidance prose.
"Filed alongside" means a work-status store item — prose-channel
recommendations are the measured evaporation shape (L3); a worklog
recommendation does not discharge the obligation.

### Rule 3 — Mechanisms adopt measure-first

The adoption protocol (operational register: `frontend/eslint.config.js`'s
rationale header, where the per-rule records live; also exercised in the
deferral-harvest audit's E4 sign-off and the 2026-06-10 adoption worklogs —
this rule is the normative home those records lacked, not a restatement of
them): assess stock rules before writing custom ones; measure the tree via a
scratch config before picking severity; adopt at `error` only on a
zero-or-fully-triaged baseline (warn-as-backlog is for backlog-surfacing
rules); kept violations are annotated inline escapes (the `vue/no-v-html`
model); the rule's gaps are named at the rule site per ADR-0002; where a
paid-for defect exists, probe-verify the net fires on its literal shape.
Adoption censuses are dated point-in-time baselines in the
"at adoption … resolved" historical phrasing — distinct from the living
censuses the stable-handles convention bans from prose comments
(`code-comment-stable-handles`); even historical baselines take dated in-place
corrections when found wrong (the PR #382 "6 → 6" stale-draft correction is
the worked caution).

### Rule 4 — Nets quantify over the class, not the instance

Enumerations of instances fail open at the next instance. A net keys on an
ownership slot, a name/shape predicate, or deny-by-default with named
exemptions. Four paid-for instances: the card-tree per-writer flag superseded
within hours by an owner; the services import blocklist
incomplete-from-day-one, inverted to deny-by-default; the gate-prop lint keyed
on name patterns, never a component allowlist; the blind-mode exit enumeration
returned UNDISCHARGED-HACK out-of-frame and was replaced by an exit-predicate
watcher quantifying over all exits, present and future.

### Rule 5 — Calibration: template, not tollgate, where the failure mode is capability

A mandatory gate on judgment-shaped output produces bungled compliance,
strictly worse than missing compliance (the pre-merge checklist's §7.3
provenance — gate tried, retracted). CI gates are for crisp mechanical
predicates; advisory surfaces and checklists are for judgment-shaped ones.
ADR-0005 Alternative C's reasoning is incorporated, not overridden. The filed
item `rigor-proportionality-rubric-adoption` is the adjacent calibration arc,
named here so the project does not mint two parallel calibration vocabularies
(ADR-0005 Rule 1) — this rule does not subsume it.

## Self-application

This tenet binds at corrective-design moments — postmortem recommendations,
lint adoptions, ADR amendments — a handful of high-attention, template-routed
events per cycle, not the per-edit regime where the corpus measured prose
decaying. Its own Rule-1 declaration: **checklist-at-a-named-moment plus
audit-sweep absence-detection** — a mechanization-assessment line lands in
`docs/pre-merge-checklist.md` in the same change that adopts this tenet, and
the `adr-effectiveness-audits` sweep checklist gains two absence-checks (a
discipline-stating rule without an enforcement declaration; a mechanism
adoption without a measured-baseline record). The remainder is policy-only by
this tenet's own escape clause: the rules' *quality* judgments are
review-shaped, and per Rule 5 a gate would be miscalibrated. The tenet expects
its own prose to be exactly as weak as Rule 1 says — the protection is the
mechanisms it mints; the tenet is the budget-steering and shape-selection
record.

## Alternatives considered

- **ADR-0005 Rule 10 (a documentation-tenet append).** Declined: the subject
  is enforcement economics for code/CI/DB mechanisms, outside ADR-0005's
  documentation-authoring scope and outside its Revisit #3 pre-authorization;
  its adversarial refutation returned *weakened* on exactly this ground.
- **ADR-0002 Rule 8 with a provisional-home flag** (the Rule 7 precedent).
  Viable but lossy: it carries Rules 1–2 only, leaving Rules 3–5 without a
  normative home — the status quo this tenet exists to end. If the maintainer
  takes this fallback, the Rule-8 text names that loss explicitly and the
  flag's relocation target is this draft.
- **Remain practice-only.** The project demonstrably behaves this way after
  incidents — but only post-incident and within attention: trigger bookkeeping,
  the corpus's analogous memory-bound mechanism, recorded correctly in two
  ADRs and silently rotted in two others. The marginal value of the tenet is
  moving the mechanization assessment from an audit-time observation to a
  named obligation at corrective-authoring time — the moment the RCA shows the
  discipline leaks.

## Consequences

**Positive.** Enforcement levels become legible per discipline — a reader (and
a fork author, who inherits the tree's mechanisms but not the maintainer's
memory) can distinguish mechanism-policed from memory-policed without
archaeology. Correctives stop defaulting to the measured-decaying form.
**Negative.** Per-corrective authoring overhead (the assessment + declaration);
the risk of cargo-cult gates is real and Rule 5 is the counterweight.
**Neutral.** No retroactive sweep (Rule 1's scoping clause); existing
mechanisms are not re-litigated.

## Revisit when…

1. A mechanization is retracted on false-positive economics — record the
   retraction here; Rule 3's calibration may need a rule.
2. A second gate-tried-and-retracted instance joins §7.3 — Rule 5's
   calibration graduates from precedent to pattern.
3. Doc-side semantic-check tooling matures (the RCA G6 class) — the
   advisory-surface rung gains members; reassess the vocabulary.
4. The generic knowledge flash-card fork adopts the corpus — the
   enforcement-surface declarations are the fork's transfer manifest; check
   they survived the fork's re-instantiation of umbrella infrastructure.

## Related

- **ADR-0002 (fail loudly).** Revisit #5 (if adopted per A2) is this tenet's
  fail-loudly-register hook, mirroring the Rule 7 / ADR-0008 pairing. The
  Rule-1 vocabulary maps onto ADR-0002's loudness hierarchy at the
  enforcement level.
- **ADR-0008 (classification discipline).** Rule 1's vocabulary is a closed
  vocabulary under ADR-0008's care; extending it follows the
  revise-don't-fuzzy-match discipline.
- **ADR-0009 (perf investigation discipline).** The sibling per-domain
  instance of the unsubstantiated-claim family; Rule 3's measured baselines
  are the enforcement-domain analog of its captured profiles.
- **ADR-0010 (render locality).** The worked proof of the tenet+mechanism
  pairing this tenet generalizes.
- **`../notes/postmortem/rca-discipline-lapses-2026-06-01.md`** — the RCA
  whose §5 open question 4 this ADR answers; cited, never edited
  (point-in-time record).
- **`frontend/eslint.config.js`** — the operational register of Rule 3's
  protocol; that header gains a pointer to this tenet on next touch; no
  parallel restatement (ADR-0005 Rules 1/3).
- **`docs/pre-merge-checklist.md`** — carries this tenet's
  checklist-at-a-named-moment surface.

## License

Public Domain (The Unlicense).
```

**Ship mechanics (from the refuter repairs, binding on the adopting PR):**
number assigned at execution against any sibling new-ADR proposals
(second-to-merge renumbers and regenerates); synopsis co-change is
substantive — a new entry plus the "How to read these together" rewrite (nine
tenets; the family paragraph names Rule 1 as the enforcement register, Rules
2–5 as adjacent protocol); Genre-line ordinal and the synopsis closer co-change
in the same PR (the r1 census-fragility note); the work-status item is staged
in §9 (4); doc-graph regenerated (structural addition); the
pre-merge-checklist line ships in the same change (self-application);
"RCA §5, open question 4" is the precise citation form (a bare "§5.4" collides
with the adaptive postmortem's probe-script handle).

---

License: Public Domain (The Unlicense).
