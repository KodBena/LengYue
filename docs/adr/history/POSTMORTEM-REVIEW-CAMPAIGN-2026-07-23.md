# Postmortem — the 2026-07-23 review campaign

<!-- doc-attest-exempt: MECHANICAL EDIT after attestation. This document passed its
five-round A:B:C loop and carries a recorded CLEAN attestation for commit cfb315c's
content; the sole change since is ONE link retarget (ADR-0021 moved to law/adr/backlog/
when the maintainer shelved that initiative, 2026-07-25) — no word of prose changed.
Removal condition: strike at the next substantive edit's own fresh-B re-attestation. -->

Commissioned by the maintainer (ledger row 1235, his words — "ledger" is this project's
append-only Postgres decision/audit log, read via the `./led` command-line tool, not a
file in this repository): *"see whether there's any durable lessons learned we haven't
already banked (and given the amount of finding, we shouldn't require there to be a
durable lesson beyond what we already have — but, on the other hand, let's not be
conceited either)."* This document holds that line from both sides: each candidate
lesson below is tested against the **banked set** — the project's already-codified
prior lessons: the ADRs, the [setup-TUI postmortem](POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md)'s own lessons, the audit-bias
clauses (false-SILENT: checking too few surfaces; false-MET: reading a requirement down
to fit what was found — banked as row 1887 of the PREDECESSOR world autoharn1's ledger,
a row number this world's own `./led` cannot resolve; the two clauses are restated here
in full precisely because that citation no longer lands anywhere), and the witness
discipline (every claim is
recorded as WITNESSED, REFUSED-AS-EXPECTED, or UNEXERCISED, per this project's
[orchestration contract](../../../CLAUDE.md#orchestration--the-standing-delegation-contract-2026-07-09))
— and is either classified as **covered** (an instance of law we already have — cited),
or named **CANDIDATE** (genuinely beyond it, proposed for ratification, not enacted
here).

## What happened, in one paragraph

*(Split below into short paragraphs for this edition; the original was one dense block —
no sentence, clause, number, or citation was dropped or reworded in splitting it. Terms
used loosely throughout this campaign are glossed at their first use here: an **axis** is
one delivery stream's own review cycle, tracked separately from the others — the docs
axis, the umbrella axis, the ensure-running axis, and so on, each named for the stream it
reviews; a **lap** is one full fresh-eyes review pass over a stream's axis; a **weak
fixed-point per axis** means each axis's laps repeat until a pass finds nothing new,
which is the empirical claim item 4 below returns to; closing a defect **red-first** means
first reproducing the failing state — "red" — before applying and re-testing the fix, so
the fix is checked against a real failure rather than assumed to matter.)*

Five delivery batches landed the same day: docs, the bootstrap trio (three bootstrap-layer
changes), the engine pair (two engine-layer changes), fixture repairs, and the umbrella
CLI (the `./autoharn <verb>` dispatch rework named in
[design/FABLE-AUTOHARN-UMBRELLA-CLI-SPEC.md](../../../design/FABLE-AUTOHARN-UMBRELLA-CLI-SPEC.md)).
That same day the maintainer tightened the review bar (ledger rows 1229/1231: every
code-touching delivery gets a fresh-context adversarial review; a weak fixed-point per
axis, as glossed above; a strengthened review tier where silent wrong answers cost most).
The campaign ran ~20 fresh-eyes review laps and 8 fix rounds across those five streams.

Findings: roughly a dozen severe defects in work that had arrived "done, witnessed, gates
green" — among them a live-ledger write leak from a fixture (ledger rows 1237–1244, later
marked garbage — voided as a bad record — by row 1248); a merged bootstrap regression that
stranded every pre-2026-07-18 deployment, including `~/ent` (one such early-scaffolded
deployment, cited by its filesystem path); a recursion-guard gate that was wired into
nothing (so it never ran) and that would also have false-passed on superclass catches even
if it had been wired in (its exception handling caught a broader exception class than the
one it needed to distinguish, so the specific failure it existed to catch would have
slipped through as a false pass); a service-lifecycle race that left a healthy service
unstoppable; and a dispatch fixture blind to wrong-target swaps through four progressively
narrower escapes (four successive fixes each closed one way the fixture could be fooled,
and each still left a narrower one open, until the fourth closed it).

Every severe was closed red-first and re-reviewed to a clean lap (a pass with no new
finding); the umbrella axis needed five laps and converged monotonically — each lap's
finding was a different, narrower failure than the last: whole-fixture absence → content
swap → shared-boilerplate collision → sibling-template marker collision. The
version-handshake check's first live catch, minutes after merge, was this host's own
pre-upgrade service — refused with teaching (a refusal that explains the fix, not a bare
error), recovered via `doctor`'s own taught path (`doctor`, one of this project's operator
verbs — see the [operator-verb roster](../../../CLAUDE.md#orchestration--the-standing-delegation-contract-2026-07-09) —
answers "is this world set up right?" in one witnessed call and points at the fix when it
is not).

## The classification

### Covered by existing law (instances, not lessons)

1. **"Zero residue" that checked the filesystem and processes but not the kernel**
   (the **kernel**: this project's append-only Postgres schema and its integrity
   machinery, paired per [world](../../../GLOSSARY.md#world) — the live ledger lives
   there) (the fixture leak's own batch report) — an instance of the
   false-SILENT audit bias (glossed in the opening paragraph): *convenient search
   surfaces*. The surface swept was the
   convenient one; the surface that mattered (the live ledger) went unswept. No new law
   needed; the mechanical guard now exists (`serve_existing_world` — the code path that
   serves a world's data — refuses non-scratch paths by construction; row 1249's item
   remains open for the general fixture-pinning shape).
2. **Report claims outrunning the artifact** (the version-handshake red.txt that showed
   ALL CASES PASS while claiming red; `world_descriptor.py`'s docstring citing fixtures
   that did not exist) — the witness discipline already governs: a claim is WITNESSED,
   REFUSED-AS-EXPECTED, or UNEXERCISED. These were violations caught by review doing its
   job, not gaps in the law.
3. **The carve-out chronology miss** (`doctor` and `asof-export` are both operator
   verbs — see the gloss under "What happened," above; `doctor` got an
   optional-for-discovery carve-out — an exemption from a stricter check, granted
   because the verb is optional for a deployment's own discovery step — while
   `asof-export`, with the identical chronological profile, did not, stranding `~/ent`)
   — at bottom an instance of the class-sweep discipline the doorway round (ledger row
   1180's usability review round; a prior instance of this same "fix the class, not the
   instance you met" discipline) already paid for. The near-miss form is worth the
   checklist line in CANDIDATE 3 below, but the governing principle is banked.
4. **The review regime itself was vindicated empirically.** Under the prior lax regime,
   the bootstrap trio's two silent-wrong-answer defects were already ON MAIN when review
   caught them, and roughly a dozen severe defects across the other streams would have
   shipped. The fixed-point's laps (see the gloss under "What happened," above) each
   found *new* defect classes, never re-finding old ones, and find-severity narrowed
   monotonically to convergence — evidence the fresh-blind-eyes design (independent,
   context-blind reviewers assigned by design, not by ad hoc habit; ledger rows
   1124/1174/1177 lineage) is load-bearing, not ceremonial. Confirmation, not lesson.

### CANDIDATE 1 — the proxy-surface class (proposed; the campaign's one genuinely new shape)

Four independent findings share a structure the banked set names only partially:

- the pre-commit gates judge the **working tree** while the commit embeds the **staged
  index** (row 1234 — the whole chain, inherited instrument choice);
- a fixture asserted identity markers that existed in template **source** without
  verifying they appear in executed **output** (the lap-5 vacuous-marker probe — caught
  before it bit, but only because a reviewer was told to check);
- the help-never-writes case observed the **worktree** while a help path could write
  **outside the repo**;
- "zero residue" observed **filesystem and process table** while the write landed in the
  **kernel**.

[ADR-0020](../0020-meaning-preservation-witness.md) names the conservation proxy: *no
content lost* standing in for *no meaning changed*. These four are its structural
cousin: **verification aimed at a sibling of the real surface** — the check is real,
runs honestly, and passes while the surface that actually ships/commits/persists
diverges. The banked law covers the meaning axis (ADR-0020) and the search-breadth axis
(the audit-bias clauses glossed in the opening paragraph); neither states the rule *the checked
surface must be the surface that ships, and a check whose object is a proxy surface must
name that fact where its verdict is read*. Proposed for the maintainer: either a short
sibling ADR or a ratified amendment note on ADR-0020's family. Until ratified, it stands
here as the campaign's principal harvest.

> **Maintainer disposition, 2026-07-25:** the maintainer read this postmortem and
> directed a new review-class ADR. It is now drafted as
> [ADR-0021 — Review reads the real object](../backlog/0021-the-checked-surface-is-the-shipped-surface.md)
> (DRAFT, awaiting ratification). CANDIDATE 1 above became ADR-0021's Rule A (the
> proxy-surface rule, essentially unchanged). CANDIDATE 2 below (fix-comments are
> claims) became ADR-0021's Rule B — and, per the maintainer's own reading at
> ratification time, Rule B was his **primary intent** in commissioning the ADR, not a
> secondary addition to Rule A. CANDIDATE 3 below (carve-outs state predicates) became
> ADR-0021's subsidiary clause. All three candidates are therefore dispositioned: none
> declined, none enacted as freestanding law of their own — each rides ADR-0021 toward
> ratification.

### CANDIDATE 2 — fix-comments are claims (proposed; recurred twice in one axis)

The ensure-running axis produced, in consecutive rounds, a fix whose comment claimed
"belt-and-suspenders — pid check AND re-probe" over code that was an OR, and an earlier
fix whose grace-sleep narrowed a race while its prose implied closure. Both passed the
fixer's own green runs; both fell to a reviewer reading the comment *against* the code.
The banked witness discipline governs reports and docs; nothing states that **a comment
asserting a concurrency/safety property is itself a claim carrying a witness burden — a
fix to a race must name its exclusivity primitive (what mechanically excludes the
interleaving), and a timing argument is not one**. Small, checklist-shaped, and paid for
twice in one day. Proposed as a review-brief standing clause rather than an ADR.

### CANDIDATE 3 — carve-outs state predicates, not names (proposed; small)

The asof-export stranding happened because a carve-out was granted by *name* (doctor) when
its justification was a *predicate* (added after already-scaffolded deployments existed).
Anyone re-deriving the predicate would have enumerated both members. Proposed one-line
rule for specs and fixes: **a special-case carve-out states its membership predicate and
mechanically enumerates current members satisfying it; the names are derived, never
authored**. Adjacent to
[ADR-0000](../0000-the-alpha-and-the-omega-type-driven-design.md)'s closure-statement
discipline (quantification universe, enumerated); this brings the same shape down to the
humble compatibility carve-out.

## The ops_improvement frame — the maintainer's standing four questions for closing an improvement cycle (named after his own notes file of that name)

- **(a) Could project-agnostic directives have been given that weren't?** Yes — the three
  candidates above, chiefly the proxy-surface rule.
- **(b) Should they enter project law?** CANDIDATE 1 plausibly yes (ADR-shaped); 2 and 3
  are checklist/brief material — law only if the maintainer prefers them binding.
- **(c) Are existing ADRs unclear or insufficiently generic?** ADR-0020 is sound and
  correctly scoped to meaning; the campaign argues not for amending its rule but for
  naming its structural sibling. No ADR was found unclear in a way that caused a finding.
- **(d) The unthought-of:** the campaign's most useful single event may have been the
  permission classifier — the harness-level mechanism that can refuse the orchestrator's
  own tool calls outright — refusing the orchestrator's hooks merge after the
  orchestrator had judged a session gap (a moment with no live session running, the only
  time CLAUDE.md's "Never modify hooks/ or a user project while a live session runs
  there" rule permits touching hooks/) defensible — the mechanism held where judgment
  bent; the refused merges became the prepared operator act the Residue section below
  records under row 1236. That is
  the project's own thesis (mechanical refusal over discretion) applied to its operator,
  and it is worth noticing that it felt correct from the inside *after* the refusal, not
  before.

## Residue, honestly

Open items feeding forward, all ledgered: the gate-chain staged-read census (row 1234);
the evidence-guard absence in the rebased CLI (1245); the bare-help garbage write (1246);
the s25 differential floor (1247); fixture-pinning generalization (1249); ~27 fixtures
red for named structural reasons, dominated by the track-work s25 cap awaiting the
maintainer's row-1169 decision; the ensure-running lap-4 residuals (permission-denied
/proc conflation; poll-vs-HTTP timeout mismatch); and two hooks-touching merges prepared
for the maintainer's own hands (row 1236). None is silent; each names its consumer.

## C-step meaning-preservation statement (for the 2436c90 polish edition)

Recorded here in the artifact itself, where its readers are (it previously lived only in
that commit's message — a dangling promise the first fresh-context B read of this
document correctly flagged as its severe finding): in the ADR-0017 polish that produced
this edition, no claim, qualifier, hedge, number, or ledger-row citation was added,
dropped, or reworded in substance; the edits were definitional glosses at first use,
markdown links to existing definitions, and the splitting of one dense narrative
paragraph. The polishing session flagged its two least-confident glosses, both now resolved: the
"superclass catches" parenthetical has been independently verified accurate against the
merged code (`gates/deep_walk_recursion_guard.py` and its seen-red family) by a
fresh-context B round, and the "four progressively narrower escapes" gloss (in the
"What happened" section above) has been confirmed against the campaign's own ledger
record (rows 1250 and 1255, which narrate exactly that four-step narrowing:
whole-fixture absence → content swap → shared-boilerplate collision → sibling-template
marker collision).

## License

Public Domain (The Unlicense).
