# Proposed appendix to ADR-0021 — review-conduct points (ADR-0018 consult edition, revision 5)

<!-- doc-attest-exempt: ADR-0018 consult deliverable, authored 2026-07-25 by a fresh-context
Fable instance commissioned under law/adr/0018-consults-are-not-front-loaded.md. REVISION 3,
same day: revision 2 applied the maintainer's feedback round (clarity per ADR-0017,
two-facts-into-one splits per ADR-0008, verified literature grounding); revision 3 repairs
the fresh-context B round's findings on revision 2 (split-count correction; the
citation-or-disclaimer contract enforced on every point; FMEA verified and cited as the
detectability-axis analogue; audience-frame and gloss repairs); revision 4 answers the
maintainer's rev-3 feedback ("every obligation... needs to highlight which principal is
responsible for discharging it") by adding a uniform "Discharged by" line to all 21 points,
against the closed principal vocabulary the intro defines; revision 5 repairs the B round's
findings on that layer (point 21's ownerless core act, point 9's unanchored supplying duty,
the intro taxonomy's missing third shape). Awaiting the maintainer's
re-read and cherry-pick into ADR-0021 before that ADR is ratified. Editorial note for the
ratification pass, kept out of the point bodies: point 17's rule (review debt survives
merge) is candidate ADR-0021 PREAMBLE material per the maintainer's own feedback-round
reading. Removal condition: strike this marker when the maintainer's cherry-pick
disposition is recorded — points merged into ADR-0021 live there under its own attestation;
this file then stands as the dated consult record. -->

## What this document is

This document proposes review-conduct points for an appendix to the draft ADR-0021
(`law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md`). The intended reader is a
working reviewer — a person or agent examining someone else's delivered change — and each
point names something that is easy to miss or forget during a review. The points are drawn
from two sources, named per point: the 2026-07-23 review campaign in this project (ledger
rows 1228–1260 — five delivery batches, about twenty fresh-context adversarial review laps,
eight fix rounds, with severe defects repeatedly found in work that had arrived "done,
witnessed, gates green"), and the published literature on software review and testing
discipline (full citations in the References section at the end; every cited source was
verified during this revision, and a point with no honest published analogue says so
plainly).

Per the commission, this document does not restate ADR-0021's Rule A (a verification must
observe the artifact that ships, not a sibling of it), Rule B (a comment asserting a safety
property is a claim reviewed against the code), or the subsidiary clause (carve-outs state
predicates, not names). It proposes material around them.

Who discharges what: every point below ends with a "Discharged by" line naming the
principal responsible for the obligation, from a closed vocabulary of three roles.
**THE REVIEWER** is the person or agent performing the review. **THE COMMISSIONER** is
whoever orders the review and consumes its report — in this project, the orchestrator; the
commissioner owns dispatch, triage, merge decisions, and the work tracker. **THE BUILDER**
is the author of the change under review. A "Discharged by" line takes one of three shapes:
a single owner; two principals with each clause assigned to its owner; or one identical
clause binding whichever principal it catches, quantified over all three roles (point 15 is
the one instance of the third shape).

Format, for cherry-picking: each point is numbered and self-contained — one imperative a
reviewer can execute, a one-line reason, and its grounding. No point depends on another;
order is presentational only. Revision 2 renumbered: three points from revision 1 were
split under ADR-0008 (each was two facts wearing one number: rev-1 point 9 into 9 and 10,
rev-1 point 12 into 13 and 14, rev-1 point 15 into 17 and 18), so the count is 18 + 3 = 21.
Each point notes its revision-1 ancestor so the feedback rounds can be traced.

---

**1. When the work under review includes or depends on an automated check — a test, gate,
fixture, or probe — verify that the check can fail: introduce a deliberate, temporary fault
of the kind the check claims to catch, and confirm the check reports it.**
This point does not assume the delivered code is broken. The fault is one the reviewer
plants for a moment and then removes; its only purpose is to exercise the check. A check
that stays green while the thing it guards is visibly broken is itself the defect, whatever
the delivered code's quality.
*Reason:* a check's green run proves nothing about the check until a failure has been
witnessed at least once.
*Grounding:* campaign — a reviewer deliberately broke the dispatcher's exec line and the
fixture guarding dispatch stayed green (row 1230). Literature — this is mutation analysis
applied by hand: judge a test by whether it detects seeded faults (DeMillo, Lipton & Sayward
1978), the origin of the "test the tests" practice. *(Rev. 1 point 1.)*
*Discharged by:* THE REVIEWER.

**2. When a fix arrives with a before/after test as its evidence, confirm the "before"
failure was actually produced: the test was run against the code as it stood before the fix,
and it failed there.**
Concretely: a claim of the form "this test failed before the fix and passes after" has two
halves, and the "failed before" half is the one that gets faked or skipped — a failure log
written after the fact, or a failure produced against a contrived stand-in rather than the
real defective code, is not evidence the test detects the defect.
*Reason:* a test that was never seen failing against the real defect may be incapable of
detecting it, in which case its green after the fix is meaningless.
*Grounding:* campaign — a delivered "pre-fix failure" record (a red.txt file) was found not
to be a genuine pre-fix red (row 1230). Literature — test-driven development's first rule is
to run the new test and watch it fail before writing the fix (Beck 2003); this point is that
rule enforced from the reviewer's side. *(Rev. 1 point 2.)*
*Discharged by:* THE REVIEWER.

**3. For every acceptance condition in the change — a health probe, a validation, a test
assertion — ask what else it would accept, and try one wrong-but-plausible input against
it.**
"It" here is the acceptance condition itself: the predicate that decides pass or fail.
Worked example from the campaign: a service health probe accepted any HTTP response as
"healthy," including a 404 — the predicate was "got a response," and everything wrong that
also produces a response passed it.
*Reason:* an acceptance condition is defined as much by what it fails to reject as by what
it accepts, and authors test the accepting side only.
*Grounding:* campaign — the 404-accepting probe (row 1230); a verb file carrying a different
verb's implementation passed every fixture with plausible output and exit 0 (row 1250);
sibling templates with identical usage markers made an artifact swap invisible to the suite
(row 1255). Literature — Myers' definition of testing as executing with the intent of
finding errors: an examiner who only confirms the accepting path subconsciously selects
inputs unlikely to fail (Myers 1979). *(Rev. 1 point 3.)*
*Discharged by:* THE REVIEWER.

**4. When reviewing a rewrite, rebase, or port, first enumerate the predecessor's
capabilities, then check each one is present in the replacement or deliberately retired.**
Differentiation from ADR-0021, stated so this point is not mistaken for a restatement:
Rule A governs a check that exists but watches the wrong surface, and Rule B governs a
comment that exists but has drifted from the code. This point governs the case where nothing
exists — a capability the old code had was silently dropped, so there is no check to aim and
no comment to drift; the defect is an absence, and absence never appears in a reading of
what is present.
*Reason:* review that starts from the new code can only see what the new code contains;
feature loss is invisible from that side.
*Grounding:* campaign — a rebased CLI silently lost two whole guards, discovered only
because an old fixture reported its specimen inert (row 1245). Literature — characterization
testing: before changing code, capture what it currently does, so the change can be checked
against that record (Feathers 2004); this point is the same move performed by the reviewer
when the author did not perform it. *(Rev. 1 point 4.)*
*Discharged by:* THE REVIEWER.

**5. Review every fix as new code under a full fresh pass, never as a check that the named
defect is gone.**
*Reason:* a fix is the diff most likely to have been authored under pressure, in code just
proven hazardous, and the campaign's fix rounds repeatedly introduced new severe defects the
prior findings did not name.
*Grounding:* campaign — "the lap-2 finds are new defect instances, not round-1 residue"
(row 1250); a fix itself deleted a healthy service's pidfile (row 1250). Law — ADR-0012's
2026-07-02 amendment, "a corrective diff is new structure." Literature — Fagan's inspection
process makes this a phase: rework is followed by a follow-up in which the moderator
verifies both that defects were fixed and that no new defects were introduced by the fixes,
with full re-inspection for non-trivial rework (Fagan 1976). *(Rev. 1 point 5; substance
unchanged per the feedback round.)*
*Discharged by:* THE COMMISSIONER dispatches each fix for a full fresh review rather than a
discharge check; THE REVIEWER conducts that review treating the fix diff as new code.

**6. Weight a finding by how its defect fails, not by how big it looks: a defect that
produces a wrong answer with no signal outranks a larger-looking defect that announces
itself.**
In plain terms: some defects fail loudly (an error message, a crash, a refusal — the user
knows something went wrong) and some fail silently (a plausible wrong answer, a false
"success", an action on the wrong target). When deciding what blocks a merge and what merely
gets noted, the silent kind wins regardless of apparent size.
*Reason:* a loud defect costs a diagnosis; a silent one costs whatever gets built on the
wrong answer before anyone notices.
*Grounding:* campaign — the maintainer ratified a stricter convergence rule for the
highest-cost surfaces under which a review only concludes when a lap finds no
silent-failing defects, while equally-sized loud-failing defects do not hold it open
(row 1231); composes with ADR-0002's loudness hierarchy read from the reviewer's side.
Literature — the FMEA methodology (Failure Mode and Effects Analysis, standard in
reliability engineering for decades) makes Detection a first-class risk axis alongside
Severity and Occurrence: a failure mode's priority is the product of all three, so a
hard-to-detect failure outranks an equally severe easy-to-detect one. FMEA grades failure
modes in a designed process rather than findings in a code review, so it is cited as the
analogue for the axis (detectability as a first-class component of priority), not for this
point's specific triage rule. *(Rev. 1 point 6, internal severity vocabulary removed;
FMEA analogue added at the B round's correction.)*
*Discharged by:* THE REVIEWER classifies each finding as loud-failing or silent-failing;
THE COMMISSIONER triages (what blocks, what is noted) by that classification.

**7. Reproduce a reported defect before acting on the report.**
In plain terms: a reviewer's finding is a claim, subject to the same evidence discipline as
the author's "it works." Before a finding is allowed to block a merge or to commission a
fix, someone runs the failing scenario and watches it fail — against the real system where
permitted, or in a simulation labelled as such. A finding nobody could reproduce is
delivered as "suspected", not "confirmed", and is said so in those words.
*Reason:* a false finding spends fix-round effort the true findings need, and a fix
commissioned against a misdiagnosis is new risk for no gain.
*Grounding:* campaign — a severe finding was "CONFIRMED AGAINST THE REAL ~/ent" and another
"confirmed by simulation" before either was acted on (row 1230). Literature — reproduction
steps are what developers rate the most useful element of a defect report, and an
unreproducible problem is unlikely to be fixed (Bettenburg et al. 2008). *(Rev. 1 point 7,
elucidation rewritten.)*
*Discharged by:* THE REVIEWER reproduces each finding and labels it confirmed or suspected;
THE COMMISSIONER lets only confirmed findings block or commission fixes without further
evidence.

**8. In the review report, record what you looked for and did not find, alongside what you
found.**
That plain sentence is the whole point. List the surfaces examined that came up clean, the
refutations attempted that held, and the surfaces not examined with the concrete reason.
*Reason:* a report listing only hits cannot be told apart from a report by someone who
looked at nothing else, so the consumer cannot know what the absence of findings means.
*Grounding:* campaign — cleared axes and held refutations were recorded per lap ("Sourcing/
quoting/fixture-weakening refutations all held", row 1230; "docs axis CLEARS and drops out",
row 1250); house law — the WITNESSED / REFUSED-AS-EXPECTED / UNEXERCISED reporting rule
(CLAUDE.md). Literature — inspection practice treats the review record (what was examined,
against what checklist, with what result) as a required output, not a courtesy (Wiegers
2002). *(Rev. 1 point 8, restated in the plain form the maintainer read it as.)*
*Discharged by:* THE REVIEWER.

**9. Compare the delivery against the commission before comparing the diff against the
delivery report.**
The gap between what was asked for and what the report answers is where undelivered scope
hides; a diff review can be flawless while the commission is half-done. The comparison
presupposes the reviewer holds the commission itself: the review dispatch carries the
commission text verbatim, never a paraphrase (a paraphrase silently narrows the scope being
checked against).
*Reason:* the report frames the review around what was built, and nothing in that frame
points at what was not built.
*Grounding:* campaign — the umbrella delivery answered a five-part commission with named
partials; reviewing against the commission is what kept the unbuilt parts visible
(rows 1228, 1257). Literature — this is the traceability half of inspection entry practice:
the work product is examined against its governing specification, not against its own
description (Fagan 1976; Wiegers 2002). *(Rev. 1 point 9, first fact; split per ADR-0008.)*
*Discharged by:* THE COMMISSIONER supplies the commission text verbatim with the review
dispatch (the presupposition the body names); THE REVIEWER performs the comparison.

**10. Convert the builder's own list of admitted partials into tracked work items at review
time; do not let an honest "not done" dissolve at merge.**
*Reason:* a self-declared partial only helps if someone files it — unfiled, it is
indistinguishable six weeks later from scope nobody ever knew about.
*Grounding:* campaign — each of the umbrella delivery's self-declared partials (a)–(e)
became a review axis or a follow-on work item rather than evaporating at merge (rows 1228,
1257). Campaign-derived; no published analogue found for this specific conversion duty.
*(Rev. 1 point 9, second fact; split per ADR-0008.)*
*Discharged by:* THE COMMISSIONER files the tracked items (the tracker is the
commissioner's surface); THE REVIEWER flags any admitted partial not yet filed.

**11. When the change contains tests or fixtures, review each one as an actor with a blast
radius: check that it cannot reach any real store — by construction, not by current
circumstance.**
Ask where the test CAN write under a wrong working directory, an inherited
environment variable, or a stale resolution path — not where it is observed to write on the
happy path.
*Reason:* a test that reaches a real store only by accident today will reach it again on
every future accidental alignment.
*Grounding:* campaign — a fixture wrote eight probe rows into the live kernel because its
deployment resolution reached the real boundary; its own docstring showed it was designed to
(rows 1237–1244, 1248, 1251); the accepted repair was structural refusal, not care
(row 1253). Literature — the hermetic-test discipline: a test contains everything needed to
set up and tear down its environment and touches no external dependency (Winters, Manshreck
& Wright 2020). *(Rev. 1 point 10, wording disambiguated.)*
*Discharged by:* THE REVIEWER.

**12. Flag every hand-maintained copy of facts owned elsewhere — a roster, a count, a list
of verbs or files — even when the copy is currently accurate.**
Ask where the authoritative set lives and whether this occurrence is derived from it or
re-typed by hand.
*Reason:* a correct hand copy is a drift seam armed for the next change to the authority.
*Grounding:* campaign — a hand-typed ten-verb roster reopened a count-drift seam the project
had already paid for once (row 1230). Law — ADR-0012 P1, read at review time. Literature —
the DRY principle: every piece of knowledge has a single, unambiguous, authoritative
representation, applied by its authors to documentation as much as code (Hunt & Thomas
1999). *(Rev. 1 point 11; substance unchanged per the feedback round.)*
*Discharged by:* THE REVIEWER.

**13. Chase every referent in the change's prose: each artifact, fixture, or mechanism a
docstring or document names must exist on disk where named.**
*Reason:* a reference to a nonexistent artifact fails the first reader who follows it, and
the author — who knew what they meant — is the one reader who never follows it.
*Grounding:* campaign — a docstring claimed fixtures that exist nowhere; another claimed a
git-absent fallback that does not exist (rows 1230, 1236). Law — composes with ADR-0017
Rule 2 (a reference is a resolvable artifact, not a gesture), applied at code review rather
than doc review. Campaign-derived beyond that; no published analogue verified — link-checker
tooling exists as practice, but no published review-discipline source naming a reviewer's
duty to dereference prose referents was found. *(Rev. 1 point 12, first fact; split per
ADR-0008.)*
*Discharged by:* THE REVIEWER.

**14. For every universally-phrased sentence in the change's prose, ask "true for which
targets, worlds, and times?" and check it against each member of that set, not just the
instance in front of the author.**
*Reason:* an unscoped sentence that is true here is a false sentence everywhere else it
claims to cover.
*Grounding:* campaign — a CLAUDE.md sentence was unscoped and false for every newborn world,
contradicted by its own sibling edit (row 1230). Law — ADR-0000's quantification-universe
discipline, brought down to prose. Campaign-derived beyond that; no published analogue
found for scope-quantifying a change's descriptive sentences as a review step. *(Rev. 1
point 12, second fact; split per ADR-0008.)*
*Discharged by:* THE REVIEWER.

**15. When a mechanical guard refuses your own act mid-review or mid-merge, treat the
refusal as the system working: route the act to its proper principal and record the refusal
as evidence the guard is live. Never work around it.**
*Reason:* each bypass "just this once" resets the norm, and the accumulated bypasses are how
guarded systems fail — the moment of an inconvenient refusal is exactly what the guard
exists for.
*Grounding:* campaign — the harness refused a hooks-touching merge to the orchestrator; the
refusal was "accepted as the correct mechanical enforcement of the standing hooks rule, not
worked around," and the merge became a prepared operator act (row 1236). Literature — the
normalization of deviance: repeated accepted deviations from a safety rule, each locally
reasonable, shift the baseline until the rule no longer protects anything (Vaughan 1996).
*(Rev. 1 point 13; substance unchanged per the feedback round.)*
*Discharged by:* whichever principal the guard refuses — the duty is the same single clause
for THE REVIEWER, THE COMMISSIONER, and THE BUILDER alike (in the campaign specimen it was
the commissioner).

**16. Before delivering a review report, verify its own factual claims — commit hashes,
attributions, quoted behavior — the way the report verified the code.**
This is self-verification by the report's author, not a second commissioned review, and that
distinction is where the regress the objection raises stops: nobody reviews the review. The
reviewer proofreads their own artifact against the record before handing it over — the same
duty a code author has to their own diff — and the report is then consumed, not re-reviewed.
Any deeper assurance (spot-checking a reviewer's reports over time) is sampling by the
party who consumes them, not a standing extra layer. Prior art for the bounded form:
Fagan's inspection process ends with a follow-up in which the moderator verifies the defect
log's dispositions — one verification pass over the record, by a named role, and then the
process terminates (Fagan 1976); inspection practice likewise treats the accuracy of the
review record as the recorder's responsibility, not a fresh review's subject (Wiegers 2002).
*Reason:* the report is the artifact downstream decisions consume, and a wrong attribution
in it misdirects the fix round it commissions.
*Grounding:* campaign — a batch report claimed case retirements "not found in the commit
range"; the fix round carried an attribution correction with the note "record must end
accurate" (row 1251). *(Rev. 1 point 14, recursion objection addressed.)*
*Discharged by:* THE REVIEWER verifies the report before delivery; THE COMMISSIONER may
sample a reviewer's reports over time (the optional consumer-side assurance the body
names), never as a standing extra review layer.

**17. Hold merged work to the same review obligation as unmerged work: a change that
reached the trunk unreviewed, or reviewed under a since-tightened bar, is still owed its
review.**
This is an organizational rule about when review debt expires (it does not), separate from
the conduct rule in point 18 about what to do with a post-merge finding.
*Reason:* the defect does not know it was merged; merge changes where the code sits, not
whether it was examined.
*Grounding:* campaign — when the bar tightened, post-merge blind review was dispatched for
already-merged commits, and it found a real severe (rows 1229, 1230). Literature — the
commit-then-review practice documented across large industrial and open-source projects:
trusted developers may commit before review, and the change still receives its review after
landing — commit and review-discharge are separate events (Rigby & Bird 2013). *(Rev. 1
point 15, first fact; split per ADR-0008.)*
*Discharged by:* THE COMMISSIONER (tracking the debt and dispatching the owed review is a
dispatch act, not a reviewer's).

**18. Record and disposition a post-merge finding on the same footing as a pre-merge one —
a reviewed fix-forward on the record, never a quiet patch that protects a clean history.**
*Reason:* suppressing a post-merge finding to keep the record looking clean converts one
defect into two — the code's and the record's.
*Grounding:* campaign — the post-merge severe was confirmed against a real deployment and
dispositioned as a reviewed fix-forward (rows 1230, 1233). Literature — the blameless
postmortem norm: surfacing a failure after the fact is rewarded, because punishing it
teaches concealment (Beyer et al. 2016). *(Rev. 1 point 15, second fact; split per
ADR-0008.)*
*Discharged by:* THE COMMISSIONER records and dispositions the finding on the same footing
as a pre-merge one; THE BUILDER of the fix ships it through the recorded fix-forward, never
as a quiet patch.

**19. Treat the first live run of merged work as the closing lap of its review: exercise
the artifact in its real habitat promptly, watch the first real invocation, and feed what it
shows back into the review's verdict.**
Why this is review conduct and not operations, in one sentence: the live habitat holds state
no review environment reproduces — running services, old versions, real deployments — so a
review verdict is provisional until the one environment review could not simulate has been
observed, and closing that observation is the review arc's own loose end, not a separate
discipline.
*Reason:* a refusal, a version-skew catch, or a recovery path firing on first live contact
is evidence about the reviewed change that no pre-merge lap can produce.
*Grounding:* campaign — minutes after merge, the new CLI's version handshake refused the
still-running old service and the doctor verb named the inconsistency; the taught recovery
was followed and witnessed, closing the review arc (row 1257). Literature — the
smoke-test-your-deployment practice: every deployment is verified by running checks against
the deployed system itself, as part of the delivery of the change (Humble & Farley 2010).
*(Rev. 1 point 16, inclusion justified.)*
*Discharged by:* THE COMMISSIONER performs (or arranges) the prompt live exercise and
records what it shows, since merge and the live habitat are the commissioner's surfaces;
THE REVIEWER marks the pre-merge verdict as provisional pending that run.

**20. When a fix correctly makes one site diverge from similar-looking neighbors, require
an adjacent marker naming the deliberate divergence and warning against harmonization.**
Review the fix for what a future tidier will see: N−1 files doing X and one doing Y, with
nothing saying the Y is on purpose.
*Reason:* an unmarked correct outlier is one well-meaning cleanup away from reverting to the
defect it fixed.
*Grounding:* campaign — the staged-read gate's deliberate divergence from its tree-reading
neighbors received an explicit do-not-harmonize comment, precisely to "guard against a
future editor reintroducing the silent false-success" (row 1236). Campaign-derived; no
direct published analogue found (the nearest neighborhood is general advice that comments
should record non-obvious intent, which does not name this review-time duty). *(Rev. 1
point 17.)*
*Discharged by:* THE REVIEWER requires the marker (holds the fix open until it is present);
THE BUILDER writes it.

**21. End a review series on a clean lap, never on a lap count: a lap that finds defects
proves the defect class is present in the process, not that the last instance was caught.**
After fixes, a fresh reviewer — blind to the prior lap's findings — reads again, and the
series ends when a lap finds nothing at the declared severity.
*Reason:* the campaign's finding-sets were disjoint across laps; stopping after any fixed N
would have shipped whatever lap N+1 was going to catch.
*Grounding:* campaign — one review axis needed five laps, each finding strictly narrower
(rows 1250, 1255); the same iterate-to-clean shape this project's ADR-0020 ratified for its
meaning-preservation witness (after a repair, a fresh reader re-reads the transformed
document until a pass finds no severe meaning change). Literature — Fagan's exit criterion:
rework is not accepted
on the author's word; non-trivial rework triggers re-inspection by the team, repeated until
the inspection passes (Fagan 1976). *(Rev. 1 point 18.)*
*Discharged by:* THE COMMISSIONER dispatches each fresh lap, keeps it blind to prior
findings, and decides termination on a clean lap; THE REVIEWER conducts each lap as a full
fresh read, not a re-check of the prior lap's findings (the dispatch-vs-conduct split of
point 5, applied per lap).

---

## References (verified during this revision)

- Beck, K. (2003). *Test-Driven Development: By Example.* Addison-Wesley. (The red-first
  rule: run the new test and watch it fail before making it pass.)
- Bettenburg, N., Just, S., Schröter, A., Weiss, C., Premraj, R., & Zimmermann, T. (2008).
  "What Makes a Good Bug Report?" *Proc. FSE 2008.* (Steps to reproduce rated most useful by
  developers; unreproducible problems unlikely to be fixed.)
- Beyer, B., Jones, C., Petoff, J., & Murphy, N. R. (2016). *Site Reliability Engineering.*
  O'Reilly. (Blameless postmortem culture.)
- DeMillo, R. A., Lipton, R. J., & Sayward, F. G. (1978). "Hints on Test Data Selection:
  Help for the Practicing Programmer." *IEEE Computer* 11(4), 34–41. (Mutation analysis:
  judging tests by seeded faults.)
- Fagan, M. E. (1976). "Design and Code Inspections to Reduce Errors in Program
  Development." *IBM Systems Journal* 15(3), 182–211. (Inspection phases including rework,
  follow-up — moderator verifies fixes and that fixes introduced no new defects — and
  re-inspection criteria.)
- Failure Mode and Effects Analysis (FMEA) — the Severity × Occurrence × Detection /
  Risk Priority Number framework, standard in reliability engineering for decades (military
  and automotive practice; widely documented in the methodology literature). Cited for one
  verified structural fact: Detection (detectability) is a first-class axis of a failure
  mode's priority, co-equal with Severity and Occurrence.
- Feathers, M. (2004). *Working Effectively with Legacy Code.* Prentice Hall.
  (Characterization tests: record current behavior before changing it.)
- Humble, J., & Farley, D. (2010). *Continuous Delivery.* Addison-Wesley. (Smoke-testing
  deployments; verification against the deployed system as part of the change.)
- Hunt, A., & Thomas, D. (1999). *The Pragmatic Programmer.* Addison-Wesley. (DRY: one
  authoritative representation per piece of knowledge, applied to docs and schemas, not only
  code.)
- Myers, G. J. (1979). *The Art of Software Testing.* Wiley. (Testing as executing with the
  intent of finding errors; the psychology of confirmation-biased input selection.)
- Rigby, P. C., & Bird, C. (2013). "Convergent Contemporary Software Peer Review
  Practices." *Proc. ESEC/FSE 2013.* (Review-then-commit vs commit-then-review across
  industrial and open-source projects; in commit-then-review, landing a change does not
  discharge its review.)
- Vaughan, D. (1996). *The Challenger Launch Decision.* University of Chicago Press.
  (Normalization of deviance: accepted rule-deviations shift the baseline.)
- Wiegers, K. E. (2002). *Peer Reviews in Software: A Practical Guide.* Addison-Wesley.
  (Review records and defect logs as required outputs; what to record and measure.)
- Winters, T., Manshreck, T., & Wright, H. (2020). *Software Engineering at Google.*
  O'Reilly. (Hermetic tests: self-contained, no external dependencies, isolation by
  construction.)

*End of proposed points. Twenty-one, independently mergeable; the maintainer cherry-picks.*
