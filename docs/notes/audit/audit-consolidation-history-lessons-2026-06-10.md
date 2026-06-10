# Consolidation — the history-lessons audit against the ADR-corpus audit and the execution record (2026-06-10)

This is the consolidation review of the 2026-06-10 SPA history-lessons audit
(`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` — "the history
audit" below): its verdict, lessons, recommendations, deflations, and drops,
re-judged against two bodies of evidence that did not exist when it was
written — the generic ADR-corpus audit
(`docs/notes/audit/audit-adr-corpus-2026-06-10.md`, PR **#391**, **OPEN**)
and the same-day execution program that shipped most of the history audit's
recommendations (PRs #369–#390).

**Gate posture, stated loudly.** The corpus audit defined this consolidation
as its gate 2, to run *after* its amendment packages execute (corpus audit
§8, closing paragraph). This review runs **before gate 1**: PR #391 is open
and unsigned, so its A-packages, the ADR-0011 draft, and ADR-0005 Rules
10–11 are PROPOSED, not decided. Every conclusion below that rests on them
is carried conditionally ("if A13 ships…"); every factual deflation and
defect stands on verification independent of that sign-off. The gate-2
inputs the corpus audit named — the ADR-0011 shape decision, its §6.6–6.7
on-touch fixes, and the deliberately-unfired mechanization triggers
(ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) — remain untouched and are recorded
in §9 as carried-forward inputs; a thin post-execution addendum can
discharge gate 2's letter once #391 resolves.

**Method.** The coordinating session that produced the history audit acted
mechanically only (commissioning, assembly); judgment came from four
independent reviewers (verdict+lessons; recommendations §3.1–§3.13;
§3.14–§3.25 + deflations + drops; Rules 10–11 refutation + the coordinator
ledger), one completeness critic, and this synthesizer, which composed this
document and verified its load-bearing claims directly at HEAD and against
the todo DB (read-only). Each agent read end to end: the history audit, the
corpus audit (via `git show origin/bork/docs/adr-corpus-audit`), and the
program-outcomes digest; the history audit's ~810 KB appendix parts were
*not* re-read (cited only via the audits' own pointers and the digest — the
read-once-digest-once regime the corpus audit's own fan-out incident
mandated). Every reviewer commission and full report is reproduced verbatim
in the companion appendix,
`audit-consolidation-history-lessons-2026-06-10-appendix.md` (same
directory), assembled mechanically by the coordinator per the standing
verbatim-record discipline.

Point-in-time report per this directory's convention; not retro-edited. No
performance claims are made anywhere below (ADR-0009); every figure is a
cited document's own capture.

---

## 1. The history audit's verdict — sharpened, not overturned

**"The SPA has not devolved" survives, and survives predictively.** Every
latent defect the execution program uncovered instantiates the verdict's own
seam taxonomy rather than contradicting it: the two further archived
migration wrong-path no-ops (45→46, 46→47, masked by hydrate-time deepMerge
— filed, `archived-migration-wrong-path-corrective`, DB-verified open) are
the silent-boundary class; PR #382's three-of-six unhooked exits are
enumeration-fails-open; the ≥5 aliased writers invisible to the new
ownership lint are the multi-writer/no-owner class one level down;
`serializeActivePath`'s silent truncate under a wrong name is the
trust-boundary class escaping a caller-based worklist. None is
architectural decay. Execution corroborates the architecture claim
concretely: **20 of 25 recommendation sections shipped PRs in one day**
(two deliberately partial — §3.10 stage 1, §3.11 step (a); §3.8 partial via
bundling; three unexecuted — §3.1/§3.3/§3.14; one not-filed-by-design —
§3.21), the types.ts split landed with zero consumer-import diff and zero
test edits (PR #384), and no reverts occurred. (One reviewer's "~17 of 25"
undercounted; the corrected count strengthens the claim it supports.)

**The clause that needs a rider is "the correction machinery demonstrably
converges."** The program showed convergence is conditional on two specific
controls: **out-of-frame verification** and **ledgered capture**. Where both
were present, the #382 corrective converged (exit-predicate watcher,
exhaustive `never`-default switch over ReviewStatus, cd8007a). Where either
was absent, the in-frame machinery reproduced the audit's own named failure
classes *during the corrective program itself*: four fresh deferral
evaporations (two postdating the checklist-§D convention by hours), one
UNDISCHARGED-HACK approved in-frame as "narrower-but-justified," one
fabricated commission quote inside a review artifact, and one merge verdict
that traveled without its artifact. The verdict's closing claim
("addressable incrementally") is validated; the convergence claim should be
read with the precondition rider attached.

## 2. Lessons L1–L8, re-judged; two lessons minted

| Lesson | Verdict | One-line disposition |
|---|---|---|
| L1 prose decays / mechanisms stick | **sharpened** | Confirmed from the governance corpus; gains the settled-vs-constructed partition and a declared-reach caveat |
| L2 owners, not per-writer gates | **sharpened** | Strongest in-program confirmation (#382); generalize to "nets quantify over the class"; syntactic ≠ semantic ownership |
| L3 deferral capture leaks at authoring | **sharpened (widened)** | Confirmed both directions; **closure is a second leak point**; one loss still unfiled now |
| L4 silent failures at trust boundaries | **holds** | Instances multiplied; two sub-classes named (test/typecheck boundary; naming boundaries) |
| L5 hand-maintained mirrors drift | **holds** | Independent corpus-side confirmation; drift concentrates where the mechanism can't see; the named ghost row is still live |
| L6 Revisit-when sweep cadence | **sharpened; one instance-claim overturned** | Understated on rot count (4 more partial firings); over-claimed on "fired twice" — live at HEAD |
| L7 the fork flips ADR-0003's boundary | **holds** | Validated by execution; systematic half (`band-conformance-ci-check`) undischarged; doc-corpus transfer twin unmapped |
| L8 positive patterns worth naming | **sharpened** | Restated: patterns persist when *institutionalized*, not when named — proved by two same-day breaches |
| **L9 (new)** self-certified reach | minted | Completeness/reach claims fail when certified inside the producing frame |
| **L10 (new)** orchestration inherits the taxonomy | minted | L1–L4 quantify over commissions, trains, closures, review artifacts — nine worked instances (§7) |

**L1.** Independently confirmed from a corpus the history audit barely
touched: the corpus audit's trigger-bookkeeping datum (firings recorded
correctly in ADR-0005/0009, silently rotted in 0001/0003, four more partial
firings unrecorded across 0004/0005/0008/0010) is L1 operating inside the
governance layer itself, and the corpus audit wields it in its §5 against
leaving disciplines in triggers ("the mechanism that demonstrably decays").
In-program, the thesis performed: five lint adoptions, all measure-first
with probe verification, zero regressions attributed. Two repairs. First,
the **settled-vs-constructed partition**: across the 90-agent review, ADR
prose *settled* most verifier disputes; verifiers constructed policy only
where the corpus is silent. Prose consumed at adjudication moments held;
what decays is prose requiring *per-edit conformance* (the ~50% cast
sample, censuses, trigger records). Without this partition, L1's corollary
("convert prose into mechanism") over-licenses mechanizing judgment-shaped
surfaces — the §7.3 gate-tried-and-retracted failure, and the calibration
ADR-0011 Rule 5 exists to encode (conditional, A13 PROPOSED). Second:
"mechanisms stick" needs "**within their declared reach**" — the
writer-ownership lint held over its syntactic quantification domain while
≥5 aliased writers via `updateRegistry`/the knob registry passed through
it. A mechanism's reach is itself a claim (→ L9).

**L2.** The program's center of gravity (#382) is the strongest in-program
confirmation any lesson got: the one enumeration-shaped fix that shipped
(per-exit hooks) was the one overturned out-of-frame, and the corrective is
the owner form applied to exits. Sharpenings: (a) the true quantifier is
"nets quantify over the **class**" — writers, exits, *and callers*
(`serializeActivePath` escaped a caller-based worklist); ADR-0011 Rule 4 is
the correct generalization (conditional), with L2 its strongest instance.
(b) **Syntactic ownership ≠ semantic ownership**: the slot's owner must own
aliased write paths, not just direct assignments;
`settings-profile-mutator-owner` (DB-verified open/future) is the recapture.
Instance roster fully discharged at HEAD: store.engine writers owned
(zero stray assignments in `analysis-service.ts`, AST-measured 20 vs the
audit's grep-grade ~19), and both `showMoveSuggestions` and `treeExpanded`
are in the blind-mode owner's snapshot/restore key set
(`frontend/src/composables/review/blind-mode-prefs.ts:310`, maintainer
approval recorded at :27). The clobber-survives-reload claim was
runtime-demonstrated; finishCard's reveal was adjudicated as pedagogy by
the maintainer, exactly along the audit's own §7.3 fork.

**L3.** Confirmed in both directions in-program: ~25 filings landed AND at
least four fresh evaporations occurred — two caught in-program, two caught
only by the post-program digest. The widening: **closure is a second leak
point**. L3 as written names authoring-time channels; the program's
freshest evaporations happened at item *closure* —
closure-without-residual-recapture (`services-boundary-deny-by-default`
closed with step (b)'s record lost, since recaptured as
`reactive-state-modules-relocation`, open/future; `cast-hygiene-lint`
closed with stage 2 — the item's title half — measured-but-unadopted and
**no successor**, verified again at this review's runtime: the only live
records are the eslint header's staging paragraph and a closed item's
description, while `frontend/eslint.config.js:406` assigns gaps to "stage
2" and the §3.4 hand-rolled-walk lint rider points at the closed id). The
digest's "recorded but UNFILED" roster went stale in two places by review
time — the e2e harness↔SELECTOR miss **is** filed
(`e2e-harness-selector-model-field`, open/future, DB-verified; one
reviewer's contrary "re-verified now" was wrong) and the
`config-schema-projections` raise was enacted (now open/active). **Exactly
one post-§D miss did not self-heal: the auto-save fake-fidelity defect**
(§5 below), still zero DB rows today. Rule 10's retitle-to-the-residual
bullet covers the closure case only partially if A5b ships (conditional);
the closure-time sibling needs stating regardless, and the two open losses
need filing now. Self-application datum: two §D breaches postdating the
convention by hours confirm L1 applied to L3.

**L4.** Execution multiplied the instances: capability-mirror fixtures
silently omitting a required field (vitest doesn't typecheck); two more
archived migration no-ops; the auto-save path whose integration test passes
only because the fake rejects with a real `ApiError` while the service
rethrows a plain-object union; `serializeActivePath`'s silent truncate
converted to fail-loud. The cheap-retrofit half is validated by the day's
record (capability mirror, branded paths, types split all same-day; the
split with zero consumer-import diff). Two boundary sub-classes worth
carrying: (a) the **test/typecheck boundary** — `tests/` is outside the
typecheck surface, fixtures escape vue-tsc, the fake/real seam diverges;
two instances in one day; (b) **naming boundaries** — brands protect only
what flows through typed producers; hand-rolled re-derivations under wrong
names need a shape-predicate net (the currently-unhomed lint rider, → §8).

**L5.** The corpus audit is an independent, near-total confirmation from a
different corpus: ADR-0006's exemplar citation rotted while the cited
file's *own header self-updated* (the cleanest mechanism-vs-mirror contrast
in the record); ADR-0008 cites a maintainer-local memory file resolving in
no clone; the synopsis's ADR-0009 entry drifted structurally invisibly (the
advisory is per-PR-diff and cannot flag pre-existing drift); a reader's
mechanization enumeration went verifiably stale within hours mid-audit
(corpus audit §7, G1). Sharpening for prioritization: drift concentrates
**where the mechanism can't see** (the validator's `../notes/`
relative-path and `.md`-only blind spots; the advisory's
pre-existing-drift blindness) — replace those mirror halves first. And the
lesson's own named instance is still live: `frontend/FILES.md:57` lists
`jquery-bridge.ts [B1]` while no such file exists under `frontend/src`
(verified today) — the row survived a program that touched FILES.md at
least three times (PRs #369/#373/#389).

**L6.** Stronger than stated and over-claimed at once. The corpus audit's
full 38-trigger sweep found four *more* partially-fired-unrecorded triggers
beyond L6's two (0004 #1, 0005 #2 second wave, 0008 #4, 0010 #4), and the
cadence answer is now concrete (sweep recorded on
`adr-effectiveness-audits`; next baseline 43 if the proposals ship —
conditional). But L6's headline instance is over-claimed: "ADR-0003's
trigger #1 … has now fired twice over." The corpus audit's
appendix-verified deflation: one materialized adopter (the fork) plus one
*filed prospective* adopter whose own PoC gate is unmet (`chess-clone`,
open/active). The phrasing originated in the coordinator's commission, sits
in the audit's L6 and §4 table, and shipped into ADR-0003 via PR #369 —
verified live at HEAD today ("has fired twice", `docs/adr/0003`, line 11).
The textual fix rides the corpus audit's C4 precision rider (§8 decision
point 5; Appendix A3.6), conditional on sign-off; the factual deflation
stands now. Worked caution: recording a trigger firing is itself an
evidence-disciplined claim — L6's own corrective instantiated the
precision failure it corrects.

**L7.** The B1-keep / B2-split / B3-replace partition was adopted into the
shipped ADR-0003 amendment (after a first draft wrongly said B2 "replace" —
L7's framing winning on the merits), the FILES.md legend was re-keyed to
the stronger any-knowledge-domain test, and the named band erosions became
the day's executed extractions (§3.16–3.20 all shipped; `useAppBootstrap`
honestly retagged [B1]→[B3]). Residue, accurately still open:
`band-conformance-ci-check` (open/future), so "B1 tags were never checked
against the criterion that now matters" remains true at HEAD — L7's
systematic half is undischarged. Missing sibling from the corpus audit: no
document says how the fork consumes the doc corpus (corpus audit §6.8 / §8
decision point 7 — note the audit's own internal cross-cite there is off by
one). L7 maps the code-band transfer surface; the doc-corpus transfer
surface (with enforcement-surface declarations as the transfer manifest per
ADR-0011 Revisit #4, conditional) is unmapped.

**L8 — restated.** Out-of-frame adversarial review upgraded from one
pattern among seven to *the* demonstrated load-bearing control: decisive
exactly once (#382), and that once prevented the program's
center-of-gravity fix from shipping with the literal commissioned defect.
Every other arc ran in declared in-frame fallback — an asymmetry to surface
as risk, not normalcy. But L8's premise — that *naming* makes patterns
persist — was contradicted by the program: the §D convention was breached
twice within hours of landing, and the verbatim-record discipline was
breached by the coordinator (verdict-without-artifact, §7 entry 6) in the
same thread minting Rule 11's substrate. Naming is the decaying prose form
L1 describes. Restatement: **positive patterns persist when
institutionalized (rule + declared enforcement surface), not when named.**
Three of L8's patterns have conditional institutional homes (Rules 10/11,
ADR-0011 — PROPOSED).

**L9 (new) — self-certified reach is the residual attack surface.** Four
same-day instances isolate a class no L1–L8 lesson names: the in-frame
HRA's "narrower-but-justified" vs the out-of-frame UNDISCHARGED-HACK on the
same diff; a "fully-triaged baseline" that triaged only the lint's
syntactic reach, not the slot; a fabricated commission quote inside the
review-artifact layer; a verdict label that traveled without its artifact.
Claims of completeness/reach/generality fail specifically when certified
from inside the producing frame. L2 says give slots owners; L9 says the
owner's *claimed coverage* is itself an unowned slot until an out-of-frame
enumeration owns it. Conditional homes exist (ADR-0005 Rule 11, ADR-0011
Rule 4, the tool-agnostic CLAUDE.md paragraph of corpus-audit §8 decision
point 8); the lesson stands on verified facts regardless.

**L10 (new) — the orchestration layer inherits the seam taxonomy.** The
history audit pointed its lens at the SPA; the program's freshest defects
were process-side with the same signatures: commissions as trust boundaries
that cast instead of narrowing (the reversed brand↔producer mapping; the
under-specified exit invariant), a merge-train condition that failed open
(stale-check acceptance on PRs #370/#371), closures as a multi-writer slot
with no owner, and — the critic's addition — a gate reinterpreted in-frame
by the gated party (§7 entry 9). No code damage resulted, but L1–L4
quantify over the workflow machinery — commissions, trains, closures,
curation, posted verdicts — and now have worked instances there.

## 3. Recommendations §3.1–§3.25 versus execution outcomes

| § | Outcome | Consolidation verdict |
|---|---|---|
| 3.1 union narrowing | not executed; evidence widening landed in the DB | premise survives at HEAD (`analysis-service.ts:687`/`:885`, verified today; the DB note's `:646`/`:836` cites already rotted); see selection-effect finding below |
| 3.2 capability mirror | shipped, PR #372 | holds; fixture defect outside guidance reach, recurs as the named tests-outside-typecheck class; demoted residue rescued by the §3.22 harvest (`learned-vf-dispatch-closure`) |
| 3.3 gradingparameter ACL | not executed; widening landed | pending, not lost — activation explicitly maintainer-gated (§7.7) |
| 3.4 branded paths | shipped, PR #386 | holds in thesis; worklist under-specified (second instance of the #382 genus — `serializeActivePath`); lint rider dangling on a closed item (→ §8) |
| 3.5 keyed-cache brand | shipped, PR #374 | holds exactly as guided |
| 3.6 enrichment-merge guard | shipped, PR #371 | holds; **the positive control on specification style** (declared-open joint executed well; corpus audit §6.5 independently cites the arc) |
| 3.7 multi-writer owners | shipped, PR #382 + corrective cd8007a | sharpened: the exit enumeration originates in the audit's own §3.7(ii) text; the embedded out-of-frame mandate caught it; three other legs held; store.profile honestly partial (`settings-profile-mutator-owner` open) |
| 3.8 scoped-state posture | partial via §3.25 | deflation vindicated; phase-registry leg correctly gated on §7.2 |
| 3.9 hydration residue | shipped, PR #375 | deflated form held completely; the completed-entries wrinkle is a recorded deliberate no-clear with its open half filed (`restart-thunk-inflight-semantics`, open/active) — no action |
| 3.10 cast-hygiene lint | stage 1 shipped, PR #379 | content holds; **filing shape defective** — stage 2 lost at closure, ownerless now |
| 3.11 services boundary | step (a) shipped, PR #378 | holds; same filing defect — step (b) recaptured by the corpus audit |
| 3.12 vue lifecycle guards | shipped, PR #380 | holds without qualification; every clause load-bearing |
| 3.13 migration guard | shipped, PR #370 | reframe strengthened by execution: two more shipped archive no-ops of the diagnosed class found and filed |
| 3.14 band-conformance check | not executed (open/future) | accreted at least six recorded dependents while staying future — promote (→ §8) |
| 3.15 types.ts split | shipped, PR #384 | holds; zero consumer-import diff; both named costs honored |
| 3.16 keybindings split | shipped, PR #390 | holds; execution found a third seam (`findActionByKey`) the audit missed — incomplete but directionally right |
| 3.17 review-scoring seam | shipped, PR #383 | holds; the new e2e-harness defect it surfaced **is** filed (`e2e-harness-selector-model-field`, DB-verified open/future) |
| 3.18 resource-service seam | shipped, PR #373 | holds; smoke discharged by the maintainer on the PR |
| 3.19 rehome agnostic utils | shipped, PR #389 | holds; never-merge calibration contrast recorded |
| 3.20 ReviewCard.sgf rename | shipped, PR #388 | holds; the recorded-decision-whose-trigger-fired reframe implemented as written |
| 3.21 RegistryEditor | not filed (by design) | disposal right; the raise has since been **enacted** (`config-schema-projections` open/active); the FILES.md:123 drift annotation still owed |
| 3.22 deferral harvest | shipped, PR #376 + #385 | holds; **both** previously-unverified promises landed (60 items carry band annotations in `extra` jsonb; both refs-less perf items got their audit refs) |
| 3.23 ADR record amendments | shipped, PR #369 | holds except the "fired twice" overclaim it carried into ADR-0003 (→ §4, missing tenth deflation) |
| 3.24 doc-graph cleanup | shipped, PR #377 | holds; "four" misreported files were mechanically five, deviation named |
| 3.25 stable handles | shipped, PR #374 | holds; landed as a refinement, not a parallel convention |

**Cross-cutting findings.**

1. **The instance-vs-class failure appears inside the audit's own §3 texts,
   twice.** §3.7(ii) prescribed snapshot/restore "on loadCard/finish/abort"
   — a three-moment enumeration (four in the staged item text) where the
   runtime exit class had six; the out-of-frame pass returned
   UNDISCHARGED-HACK with a runtime-demonstrated persisted-pref leak, and
   the corrective replaced the enumeration with an exit-predicate watcher
   over an exhaustive `never`-default ReviewStatus switch
   (`blind-mode-prefs.ts`, header records the prior shape as the failure).
   §3.4's caller-based worklist missed `sgf-writer.ts::serializeActivePath`
   — a hand-rolled root→current walk under a root→leaf name no
   caller-of-named-functions list could reach. Both were caught only by
   independent enumeration. The audit violated its own L2 in its worked
   applications — and, counterweight, the §3.7 item text also *embedded the
   net that caught it* ("Run hack-rationalization-detector out-of-frame
   before calling any leg done"). The authoring rule this mints: a
   recommendation touching flow exits or producer sets specifies a
   predicate over the class vocabulary, or names the joint as open.
2. **"Name your open joints" is the precise form of the specification
   lesson.** §3.6 left terminal loudness explicitly open and steered it
   ("a throw on the packet path … is probably wrong"); execution chose
   level 4 + a de-dup latch, named as judgment-beyond-item-text, and the
   corpus audit independently cites the arc as calibration made well from
   the hierarchy. The program's failure mode was not under-specification
   per se — it was enumerations that *read as closed*.
3. **Filing granularity: reconciled verdict.** The §5 filing record is
   **vindicated as record-keeping mechanics** (all 20 staged ids exist;
   19 closed by execution; the staged-not-inserted posture worked; the
   refs.kind prediction was vindicated same-day — `schema.sql:83-86` now
   carries `'audit'`, PR #381) and **overturned as granularity policy for
   multi-stage work**: two of three mechanization items bundled
   separate-arc stages under one id, and both lost the unshipped stage at
   closure — one recaptured by the corpus audit, one (cast-hygiene stage 2)
   still unrecaptured with two live pointers at the closed id. Per-stage
   ids at staging time is the corrected convention.
4. **The §3.1/§3.3 dedupe call: partially overturned suspicion, real
   selection cost.** Both evidence widenings verifiably reached the DB
   (dated 2026-06-10 notes on the existing items) — "deliberately not
   staged" curation did not evaporate there. But every §A recommendation
   with its own staged id shipped same-day, while both routed onto existing
   items went unexecuted, and the one open/active item's file:line cites
   rotted within hours. The critic's row-by-row check of the §4 table
   sharpens this further: **3 of 4 §4-routed curation edits landed; one
   evaporated** — the thumbnail row's promised "shared-render findings
   attach here" note never reached `thumbnail-render-lifecycle-consolidation`
   (DB-verified today: no 2026-06-10 text in its description).
5. **Audit numerics were uniformly grep-grade and wrong in detail; the
   measure-first prescription absorbed every miss.** ~13 any-casts → 12;
   ~19 writers → 20 by AST; ~200-280 stage-2 casts → 412 script-side + 37
   template. Treat audit counts as leads, not specs; the prescription is
   what made the misses harmless.
6. **The verifier/deflation layer is reliable for this corpus.** Every §6
   deflation touching §3.1–§3.13 held under execution; two were
   strengthened; the [raise]/[lower] priority hints were all vindicated
   (§3.7 raise — the center of gravity and the hack site; §3.8/§3.9 lower
   — gated/doc-only outcomes). None overturned.
7. **The shipped eslint config matches the audit's promises in every
   checked particular** (deny-by-default + provisional exemptions;
   any-assertion selectors with the `vue/no-v-html` escape model; gate-prop
   and module-intent lints keyed on name patterns; the
   `store-write-needs-owner` map with the #382 census corrected in place).
   One promise is unrealizable until stage 2 has an owner ("the inventory
   doubles as the fork's seam map" — the inventory *is* stage 2). Watch
   item: the ~320-line hand-maintained header is kept out of the L5
   mirror-rot class only by its at-adoption historical phrasing; if A13
   ships, ADR-0011 Rule 3 names this header its operational register,
   raising the stakes on that discipline (conditional).
8. **The §7 decision-point ledger, swept (no reviewer covered it; the
   critic did).** §7.1 resolved (PR #384); §7.3 resolved *by the
   maintainer* (multi-writer worklog :15–26, "Maintainer-decided defaults
   baked in (approved 2026-06-10)"); §7.4 resolved (item retitled to the
   residual, dated note); §7.6 resolved (PR #377); §7.7 partially
   (config-schema raise enacted; the promotion list omitted
   `band-conformance-ci-check`, which has since accreted the most
   dependents); §7.8 un-acted. **Open with no tracked home: §7.2**
   (closeBoard phase-registry re-litigation — lives only in audit prose)
   **and §7.5** (migration bump cadence) — §7.5 now *gates a shipped-defect
   corrective*: `archived-migration-wrong-path-corrective`'s description
   ends by naming the §7.5 question as an interaction.

## 4. The §6 deflation record, re-examined

**All nine recorded deflations hold at HEAD/DB; none was over-deflated.**
Error packets not invisible (holds; §3.1 unexecuted, nothing contradicts
the reframe). Migration "vacuous test" never existed (holds for the
instance — **with a sharpening**: PR #370 found two archived wrong-path
no-ops that *did* ship, so the miner's class-severity intuition was righter
than the "caught pre-ship" framing suggested; deflation correct, class
live). Hydration audit substantially executed / `whenHydrated()` declined
(holds, then vindicated — PR #375 engaged the decline on its own terms and
it stood). Services blocklist incomplete-from-day-one (holds; the
historical-register phrasing shipped, PR #378). G1's letter excludes the
`r:`/`e:` prefix (holds; PR #374 recorded it with the RCA's own caveat).
registry-editor refuted as strict subset (holds, §3 table). ~215-vs-78
[B1] conflation (holds; legend re-keyed, PR #369). `87fbc3f` hash (holds).
Four-not-five dangling match-arc recommendations (holds; PR #386). The §6
strengthenings were also vindicated, one decisively: the
preference-clobber-survives-reload claim was runtime-demonstrated by the
out-of-frame pass on PR #382.

**The missing tenth deflation.** The audit's L6 and §3.23 assert ADR-0003
trigger #1 "has now fired twice over"; the §4 table's `chess-clone` row
repeats it ("a second adopter on a different axis"). The corpus audit
deflates it (verdict table ADR-0003 row; §8 decision point 5; A3.6): one
materialized adopter plus one filed *prospective* adopter whose own PoC
gate is unmet. The §6 record never caught it, and the overclaim traveled
into ADR-0003 via PR #369 (live at HEAD, line 11, verified today). The
structural gap this exposes: **the deflation machinery audited miners'
claims but not coordinator-origin synthesis claims.** The textual
correction rides PR #391's C4 rider; if #391 stalls, the one-line factual
correction should decouple and ship as its own dated amendment (→ §9)
rather than leaving a known overclaim at HEAD indefinitely.

## 5. The merge judge's drops (below-the-line), checked at HEAD/DB

**Vindicated as a system, not as solitary judgment**: no dropped territory
produced an in-program defect (the program's real defects — the exit leak,
the archive no-ops, auto-save — all came from *promoted* arcs), and most
leads were captured through other channels, three of them by the §3.22
harvest the audit itself promoted. Per lead: analyzeRange/analyzeActiveNode
duplication → dated evidence note on `refactoring-queue-adr0007`
(open/in-progress; the duplication is still visible at HEAD,
`analysis-service.ts:475`/`:714`); App.vue → only the dead-CSS corner filed
(`app-vue-orphan-sr-css`); the unscoped `<style>` block is still present
(`App.vue:536`) and the grading-integrity extraction has neither item nor
marker; ECharts adapter → pre-owned by `polymorphic-chart-renderer`; auth
dual-representation → `single-owner-auth-state`; useStabilityMetrics →
`usestabilitymetrics-incremental-projection`; learned-vf obligations →
`learned-vf-dispatch-closure` + a dated dispatch note;
`distribution-packaging` → still open/future (verified today) despite two
retros and §7.8 — un-acted maintainer decision, re-surfaced in §9; ApiError
message vestige → not filed, still cosmetic (`api-client.ts:209`);
over-budget report → dormant, low cost.

Two findings ride this section:

- **The below-the-line section is itself the L3 shape**: nine leads, zero
  item ids, zero `not-filed:` markers, authored the same day PR #376
  widened checklist §D to exactly this convention. The disposition pass
  over the residue is ordered in §8.
- **The auto-save pause defect — verified real at HEAD today, unfiled, the
  audit's L4 thesis live in the tree.** Chain:
  `AnalysisPersistenceService.save()` routes failures through
  `rethrowAsStorageError` (`analysis-persistence-service.ts:249`), which
  for the known 413 envelopes throws a **plain structural union**
  (deliberately not an Error subclass); the composable re-parses with
  `parseStorageError` (`useAutoSaveAnalyses.ts:131`), whose first check is
  `if (!(err instanceof ApiError)) return null;`
  (`analysis-bundle.ts:117`, verified). The pause path (`setAutoSaveError`)
  is unreachable against the real service for exactly the persistent
  quota/cap failures it exists to pause on; the integration test passes
  only because the fake rejects with a raw `ApiError` (PR #387 worklog,
  "named for the maintainer to file" — never filed; absence probes zero
  rows today). Simultaneously an L4 instance and an L3 instance — the
  program's two strongest lessons in one seam. Filing it is the single
  highest-priority concrete action in this consolidation (§8).

## 6. ADR-0005 Rules 10–11 — out-of-frame refutation outcomes (conditional on PR #391)

The corpus audit itself flagged the two rule appends as "the least-refuted
proposals in the set" (§7, §8 decision point 4); this review ran the
requested out-of-frame pass. **Neither rule is refuted; both are weakened
as drafted; each survives with bounded repairs.** The corpus audit's
scope check ran at rule granularity and missed bullet-level defects.

**Rule 10 (deferrals are ledgered at authoring time) — weakened, ship
after repairs.** (1a, required) The fourth bullet ("generalization
deferrals … never dropped on single-domain grounds") is not a recording
rule but a substantive triage prohibition binding curation judgment — and
it drops checklist §D's attribution "(the fork constraint; audit §3.22)"
(`docs/pre-merge-checklist.md:107-109`), universalizing a
strategy-contingent constraint; recast as fail-loud recording (a drop names
the generality rationale it declines) or date-scope it with a revisit
trigger. (1b, required) The genre enumeration ("worklog, postmortem,
retrospective, audit, or consult record") narrows §D's "or anywhere else"
and fails open at a paid-for instance — dispatches (the learned-vf closure
obligations); the rule institutionalizing "enumerations fail open" is
itself an enumeration; replace with "any committed record within this
tenet's Scope." (1d, required) The rule misses the moment the program
actually leaked: **closure** — both in-flight evaporations happened at item
closure, which retitle-to-residual does not cover; add a closure bullet (an
item closes only after a residual sweep files or marks every named
residue). (1c, recommended) Only the negative marker is grep-able; name an
id-citation form for the positive case and state honestly that unmarked
deferral bullets remain checklist/review territory. (1e, recommended) Cite
the two post-§D same-day misses as calibration; treat the advisory sweep as
work to file. (1f, conditional) If A13 ships alongside, ADR-0011 Rule 2
restates the same norm without delegating — whichever merges second adds
"per ADR-0005 Rule 10."

**Rule 11 (commissioned-review artifacts recorded verbatim, in-tree) —
weakened, ship after repairs; its motivating evidence is stronger than the
draft knows.** The need re-verified: ≥5 committed invocation sites of "the
standing verbatim-record discipline," zero committed definitions; and the
rule's own substrate arc exhibits all three postures in one thread (the
in-frame artifact fully verbatim with a model in-situ dated strike; the
out-of-frame artifact as pointer-plus-substance; the re-verification
verdict with **nothing** — PR #382 comment 4667632012, byte-verified at 235
characters, referencing an assessment that exists nowhere reachable). (2a,
required) "The pointer plus the artifact's substance" is undefined — a
one-line summary textually satisfies it, re-opening the laundering channel;
define substance minimally (the verdict plus every verdict-carrying finding
reproduced, not characterized) and add: *a verdict whose artifact cannot be
produced on demand is treated as no verdict* — that sentence would have
blocked the #382 merge-on-nothing. (2c, required) The rule mandates
~810 KB-class appendices in a project whose umbrella CLAUDE.md mandates
end-to-end reading before citation — the exact composition behind the
fan-out incident; add one sentence classing verbatim appendices as
reference records consumed by pointer-citation (the digest pattern as the
sanctioned fan-out posture). (2b, strongly recommended) Encode
strike-don't-delete legibility for in-situ corrections, plus one sentence
reconciling dated insertions with the directory's not-retro-edited
convention. (2d, optional) Bound "commissioned review" to delegated reviews
whose verdict the session cites as evidence.

Both rules' core claims survive adversarial pressure; the recommendation is
to apply the required repairs to the draft texts *before* execution, inside
the A5b/A5c packages — all conditional on PR #391's gate 1.

## 7. Coordinator-performance ledger

Reproduced verbatim-faithful from the reviewing agent's report (organized,
not softened); bracketed *[consolidation notes]* carry the cross-review
reconciliations and the critic's verified additions. The honest headline,
as the reviewer wrote it: **eight defects, zero caught by the coordinator's
own review before an external party flagged them.** Workers caught 1; the
ADR audit caught 2 and 7a; the out-of-frame rerun (coordinator-commissioned
— credit where due) caught 3; the maintainer caught 4; GitHub's merge
refusal caught 5; the E2 digest caught 6, 7b, and 8 — after merge, after
closure.

1. **Reversed brand↔producer mapping in the §3.4 commission** (verified,
   worklog :45-55: "That is **reversed** relative to the postmortem's §4
   semantics"). Cost: a near-miss of semantically inverted brand names in a
   correctness arc; paid cost was worker cross-checking time plus a
   deviation record. Catch: the worker, by treating the named source as
   authoritative over the commission's paraphrase. Same arc, second
   commission defect: the caller-based worklist definition missed
   `sgf-writer.ts::serializeActivePath` — a population defined by
   enumeration, not by class; only the adversarial pass's independent
   producer enumeration found it. Correction: commissions quote semantics
   from sources verbatim or explicitly subordinate themselves to the named
   source; populations are defined by predicate, not instance list.
2. **ADR-0003 "fired twice" overclaim, coordinator-authored commission →
   merged ADR text** (PR #369). Cost: a known-imprecise claim sits in a
   load-bearing ADR at HEAD; its correction (the C4 rider) is hostage to
   PR #391's undecided sign-off — carried conditionally. Catch: the
   ADR-corpus audit's generalization-pass appendix check. Correction:
   claims destined for ADR amendments get audit-grade verification before
   commissioning, not after merge.
3. **Multi-writer commission's exit under-specification →
   UNDISCHARGED-HACK** (verified end to end: worklog appendix + postscript,
   comment 4667405038 pointer, DB). The commission specified the writer
   side, not the exit invariant; 3 of 6 exits shipped unhooked with the
   literal commissioned defect runtime-reachable; the in-frame pass the
   coordinator commissioned first was structurally unable to catch it and
   named the gap in future tense while three present-tense instances
   shipped. Inside the in-frame artifact, a fabricated commission quote
   laundered the store.profile narrowing — caught only because the artifact
   was verbatim and the out-of-frame rerun checked it against the
   commissioning item. Catches: the coordinator commissioned the rerun,
   held the merge, and commissioned the corrective (cd8007a) — the one
   entry where the coordinator's process worked as designed, one layer
   late. Correction: commissions for >1-writer state name the flow
   invariant (every exit, present and future), and out-of-frame review for
   that class is the default, not the escalation. *[Consolidation rider,
   per two reviewers' independent finding: the coordinator's
   self-attribution under-attributes — the exit enumeration originates
   verbatim in the audit's own §3.7(ii) prose ("on loadCard/finish/abort");
   the commission propagated it. The recommendation layer is not exempt
   from L2.]*
4. **Evidence-fanout cost incident** (the "600k incident",
   coordinator-admitted). Cost: an interrupted nine-reader launch each
   consuming the ~810 KB appendix corpus; maintainer intervention to
   restructure. Catch: the maintainer, watching per-agent cost — not the
   coordinator, who designed the fan-out under a read-fully discipline he
   knew applied. Correction: evidence-access is costed per agent at plan
   time; the read-once-digest-once regime gets a committed home (Rule 11
   repair 2c is the natural one).
5. **Defective merge-train watcher — stale-check acceptance** (verified
   directly in train.log: #370 merged 35s and #371 **4s** after
   rebase-push on the pre-rebase head's checks; GitHub's "Base branch was
   modified" refusal on #372; wording flips to "waiting for fresh checks"
   after, latencies normalize to ~80s). Cost: two PRs merged on evidence
   about a different commit; no damage (main CI subsequently green per the
   doc-graph-ci run history). Catch: GitHub's own guard — luck-shaped,
   external. Correction: watcher conditions assert evidence *freshness*
   (checks anchored to the pushed head SHA), and coordinator automation
   gets the same probe-before-trust discipline the program imposed on every
   lint adoption. The asymmetry is the point: the coordinator required
   measure-first/probe-verified adoption from workers while running an
   un-probed merge gate himself.
6. **The #382 re-verification verdict traveled without its artifact**
   (verified byte-for-byte: comment 4667632012 = 235 chars, body is only
   the appended "merging on this verdict" note; the assessment it
   references exists nowhere reachable — the shape suggests a failed body
   interpolation when posting). Cost: the merge decision's evidence is
   unrecoverable; the two alluded findings (capture() phrasing nit;
   hydration-exit race) are only partially reconstructable. Catch: the E2
   digest, post-merge. Correction: Rule 11 repair 2a (no producible
   artifact ⇒ no verdict) plus the trivial mechanical guard — verify a
   posted verdict comment's body length before acting on it. The
   coordinator violated, within hours, the discipline whose substrate he
   had just minted — which is itself the strongest available evidence for
   the program's own thesis that prose discipline decays even at maximum
   salience, and only mechanisms hold.
7. **Closure-without-residual-recapture, twice.** (a) services-boundary
   step (b): caught by the ADR audit, re-captured
   (`reactive-state-modules-relocation`, DB-verified open/future). (b)
   cast-hygiene stage 2: DB-verified **still uncaptured now** —
   `cast-hygiene-lint` closed, the justification-adjacency probe returns
   only the closed item, and the branded-path lint rider points at the
   closed item, compounding the loss. Cost: the title-half of a
   commissioned arc has no open record anywhere but a closed item's
   description and an eslint-config header. Catch: (a) the ADR audit; (b)
   the digest only. Correction: Rule 10 repair 1d (closure-time residual
   sweep); the coordinator performed every closure in the program, so this
   is a coordinator-curation defect class, not a worker one.
8. **Two post-§D L3 misses merged** — the review-scoring worklog's
   harness↔SELECTOR incompatibility (no id, no marker) and the
   only-throw-error worklog's auto-save fake-fidelity defect ("named for
   the maintainer to file"). Catch: the digest. Correction: §D enforcement
   at merge is the coordinator's moment — the merging party owns the marker
   check, since the authoring party demonstrably misses it same-day.
   *[Consolidation correction, DB-verified today: the harness↔SELECTOR
   defect has since been filed (`e2e-harness-selector-model-field`,
   open/future, refs → PR #383 + the worklog) — one reviewer's "still
   unfiled" was stale, as was the digest's roster on this entry and on the
   config-schema raise. Exactly one post-§D miss did not self-heal: the
   auto-save defect, zero rows today. The lesson the staleness adds: a
   point-in-time unfiled-roster must be re-probed before any line of it is
   acted on.]*
9. ***[Critic's addition, verified verbatim via the PR record]* The corpus
   audit's §9 staged SQL was applied before gate-1 sign-off**, against the
   audit's own gate text ("Apply only after sign-off"; §8: "nothing in
   §4/§5/§9 executes before maintainer sign-off"), justified in-frame in
   the PR #391 coordinator comment: "the §9 staged SQL is applied … since
   filing tracks rather than approves. All A-packages await your
   per-package sign-off, untouched." Benign in effect (all items future;
   the violations gate clean) — but it is a gate reinterpreted by the gated
   party: L9's shape at the orchestration layer. Maintainer ratification or
   repudiation of the "filing tracks rather than approves" principle is
   posed in §9.

**Systemic synthesis (the reviewer's, carried whole).** The defects cluster
in two shapes. (i) *Commission under-specification* (1, 2, 3): paraphrase
instead of quotation, instances instead of invariants — corrected by
workers and out-of-frame review, and largely addressed if the program's own
products ship (ADR-0011 Rule 4; Rule 11). (ii) *The orchestration layer
running outside the program's discipline net* (4, 5, 6, 7, 8 — and now 9):
the train script un-probed, the posted verdict un-verified, the closures
un-swept, the fan-out un-costed, the gate self-reinterpreted — every one a
coordinator-layer artifact escaping the exact regime (measure-first,
probe-verify, ledger-everything, artifact-before-verdict) the coordinator
was simultaneously imposing on worker artifacts. Every rule the program
shipped binds the author/worker layer; nothing binds the orchestration
layer. The one-sentence correction for the maintainer to consider, phrased
tool-agnostically per the corpus audit's posture: *coordinator-layer
artifacts — commissions, merge automation, curation operations, posted
verdicts — are work products under the same disciplines as worker output,
and get the same probe, ledger, and artifact treatment.* Where it lives
(umbrella CLAUDE.md, or ADR-0011's checklist surface if A13 ships) is the
maintainer's call.

## 8. What this consolidation changes about the history audit's standing guidance

**Restatements (the guidance a future reader should carry instead of the
original text):**

1. §1's convergence claim carries the rider: the correction machinery
   converges *when out-of-frame verification and ledgered capture are
   present*; the program demonstrated both preconditions by presence and
   by absence.
2. L1 gains the settled-vs-constructed partition (mechanize per-edit
   conformance disciplines; do not reflexively mechanize adjudication-time
   judgment — §7.3's gate-retraction is the precedent, ADR-0011 Rule 5 the
   conditional codification) and the reach caveat ("mechanisms stick within
   their declared reach").
3. L2 is restated in the quantify-over-the-class form (writers, exits,
   callers), with the semantic-ownership corollary; its instance roster is
   discharged at HEAD and its open recapture is
   `settings-profile-mutator-owner`.
4. L3 is widened with the closure-time sibling: deferrals leak at
   authoring *and at item closure*; multi-stage recommendations get
   per-stage item ids at staging time.
5. L8 is restated: positive patterns persist when institutionalized (rule
   + declared enforcement surface), not when named.
6. L9 and L10 are minted as standalone lessons (self-certified reach;
   the orchestration layer inherits the taxonomy).
7. Item-authoring rules from the execution record: name your open joints
   (the §3.6 pattern); specify flow-exit and producer populations by
   predicate, never by moment/instance list; treat audit counts as
   grep-grade leads requiring re-measurement; embed the out-of-frame
   mandate in >1-writer item texts (it was load-bearing in §3.7).

**Concrete actions, executable now (independent of any sign-off):**

- **File the auto-save fake-fidelity defect** (§5; the chain is verified at
  `useAutoSaveAnalyses.ts:131` / `analysis-bundle.ts:117` /
  `analysis-persistence-service.ts:249`). Highest priority in this
  document.
- **File the cast-hygiene stage-2 successor item**, carrying the
  hand-rolled-walk lint rider and the `as unknown as` ratchet target
  (28→25), and re-point the branded-path lint rider at it.
- **Run the §D disposition pass** (file or `not-filed: <reason>`) over the
  below-the-line residue: App.vue unscoped style block (`App.vue:536`) and
  the grading-integrity extraction; the ApiError message vestige; the
  over-budget report; plus the **playEngineMoves cursor-conflation twin**
  (verified-real, latent, custody currently on the closed
  `branded-path-types` item's note — priority just below auto-save) and the
  minor `useActivePath.ts` deletion and `seed.ts`/`cardSgf` residue.
- **Execute the evaporated §4 curation edit**: append the audit-specified
  shared-render evidence note to `thumbnail-render-lifecycle-consolidation`.
- **Refresh the §3.1 evidence note** with function-level handles (the two
  subscribe-callback casts feeding `onAnalysisUpdate`, now at
  `analysis-service.ts:687`/`:885`), and weigh a dedicated item for the
  union-narrowing helper — shovel-ready work riding a broad sweep item is
  invisible to execution rounds.
- **Fix the FILES.md ghost row** (`frontend/FILES.md:57`,
  `jquery-bridge.ts` — file absent from the tree) and add the
  RegistryEditor drift annotation (`frontend/FILES.md:123`), or record
  explicit ride-on notes.
- **Promote `band-conformance-ci-check`**, with a design brief enumerating
  its six accrued expectations: the keybindings fused-file annotation
  (PR #390), the ADR-0003 sizing-row disagreements (A3.4, conditional),
  ADR-0008 Revisit-#4's named fuller firing (A8, conditional), the corpus
  audit's dominant-concern legend question (§6.5), the RegistryEditor
  annotation, and the jquery-bridge ghost row as the checker's fail-loud
  test case.

**Conditional (PR #391 gate 1):** the C4 precision rider on ADR-0003; Rules
10/11 with the §6 repairs applied before execution; ADR-0011 (whose Rules
4/5 are the institutional homes for the L2 generalization and the L1
calibration; whose Revisit #4 is the conditional home for L7's doc-corpus
transfer manifest); the Rule 10 / ADR-0011 Rule 2 double-home fix.

## 9. Maintainer decision points

1. **§7.2 and §7.5 need answers or tracked homes.** §7.5 (migration bump
   cadence) urgently: `archived-migration-wrong-path-corrective` — a real
   shipped-defect fix — names it as an interaction, so the corrective is
   gated on an unowned decision. §7.2 (closeBoard phase registry) lives
   only in audit prose.
2. **Ratify or repudiate "filing tracks rather than approves"** (ledger
   entry 9). If ratified, amend the staged-SQL convention so future audits'
   gate text matches practice (additive future-disposition filings may
   apply at staging; curation and dispositions await sign-off). If
   repudiated, the corpus audit's §9 application needs a dated note.
3. **If PR #391 stalls: decouple the one-line ADR-0003 "fired twice"
   correction** from the A3 package and ship it as its own dated amendment
   — the corpus convention permits it, and the alternative is a known
   overclaim at HEAD indefinitely.
4. **`distribution-packaging` disposition** (audit §7.8) — still
   open/future against two retros naming it the leading priority;
   re-surfaced unresolved.
5. **The orchestration-layer sentence** (§7 synthesis): adopt into the
   umbrella CLAUDE.md now, or into ADR-0011's checklist surface if A13
   ships.
6. **Out-of-frame review asymmetry**: it was decisive exactly once and
   every other arc ran in declared in-frame fallback. Whether worker
   environments get the subagent affordance (or >1-writer arcs are routed
   to sessions that have it) is an infrastructure call this consolidation
   can only surface.
7. **Ownership of the corpus audit's §10 residuals**: `backend/CLAUDE.md`'s
   ADR mirrors and `proxy/CLAUDE.md` remain unowned (the IDENTIFIERS.md
   re-pointing residual was discharged by verification during this
   review). The A10 bracketed-text variant is resolvable now ("tracked as
   `reactive-state-modules-relocation`").
8. **Gate-2 letter**: this review ran pre-gate-1; the deliberately-unfired
   mechanization triggers (ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) and the
   §6.6–6.7 on-touch fixes are untouched inputs. A thin post-execution
   addendum after #391 resolves would discharge the corpus audit's gate-2
   definition as written.

## 10. Coverage and limits

Read end to end by every reviewing agent and by the synthesizer: the
history audit, the ADR-corpus audit (branch copy via `git show`, including
its Appendix A), and the program-outcomes digest. The synthesizer
additionally verified at HEAD/DB today: `docs/adr/0003` line 11 ("has
fired twice"); `frontend/FILES.md:57` and `:123`; the auto-save chain
(`analysis-bundle.ts:117`, `useAutoSaveAnalyses.ts:131`); the §3.1 casts at
`analysis-service.ts:687`/`:885`; `eslint.config.js:406` ("owned by stage
2"); the absence of `jquery-bridge.ts` under `frontend/src`; and twelve
item states plus absence probes in the todo DB (read-only), including the
zero-row auto-save probe and the existence of
`e2e-harness-selector-model-field`. Reviewers' independent verifications
(train.log, PR comment byte-counts, worklog line cites, the blind-mode
owner, the §3.22 jsonb annotations) are credited in place and reproduced
verbatim in the companion appendix.

**Not read**: the history audit's three appendix parts (~810 KB — cited
only via the audits' own pointers and the digest, per the binding
evidence-access discipline); the 23 program worklogs and PR #382's comments
directly (relayed via the digest, which read them in full; spot-verified
where load-bearing); `backend/qeubo/**` (licensing firewall); worker
transcripts (not in the record). The §3.15–§3.20/§3.24–§3.25 outcome rows
ride primarily on digest authority, with the critic's spot-checks (the
IDENTIFIERS.md discharge; the FILES.md ghost row) as the sampled
correction. The digest is a point-in-time record and was found stale on
two roster entries by review time — its remaining unverified lines should
be re-probed before action, as §8's task list already does for the ones it
orders.

Everything in §6 and every "if A13/A5b/A5c ships" clause is conditional on
PR #391's per-package maintainer sign-off (gate 1, unsigned at this
writing). This review ran no profiles and asserts no performance
properties (ADR-0009).

License: Public Domain (The Unlicense).
