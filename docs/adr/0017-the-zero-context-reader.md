# ADR-0017: The Zero-Context Reader — Documentation Legibility Discipline

<!-- doc-attest-exempt: doc-tree relocation mechanical edit (work item doc-tree-reorg-user-guide, ledger row 1620, 2026-07-18) -- relative link path(s) repointed to a sibling file's new location after a git-mv relocation elsewhere in the tree; no prose rewrite, same disposition as the v1.1.2 release-cut's own markers (commit 543a389). Removal condition: strike this marker and run the real A:B:C loop next time this file is touched for content, not just link repair. -->


> **ACCEPTED — maintainer-ratified 2026-07-11, with one proviso amending Rule 4.** Ratified
> from the same-day Fable-authored draft (`design/ADR-DRAFT-documentation-discipline.md`,
> commit `c65cd4d`; moved here with links re-rooted at ratification). The proviso, in the
> maintainer's words: Rule 4 must not prohibit "large sweeps (which I intend to do, when the
> time is right)" — the draft's "*never* migrated" emphasis was "undue and inflexible
> discipline for, to me anyways, no discernible purpose." Rule 4 below carries the amended
> text; everything else stands as drafted.

- **Status:** Accepted (maintainer-ratified 2026-07-11; Rule 4 amended at ratification).
- **Genre:** Tenet (cross-cutting authoring discipline) — the *legibility* register of the
  documentation family. [ADR-0005](0005-documentation-discipline.md) owns where a
  document lives and how its **facts** stay true (one source of truth per handle, filing
  homes, lifecycle, amend-by-append). This tenet owns something ADR-0005 presumes and never
  states: whether a reader who was not present when the document was written **can read it at
  all**. The two compose; neither restates the other.
- **Date:** 2026-07-11.
- **Provenance:** Native to autoharn — a response to a named, dated maintainer indictment,
  filed the same morning in [BACKLOG.md](../../BACKLOG.md) ("Documentation legibility indictment
  (maintainer, 2026-07-11 morning)"). The maintainer, reading the morning batch cold, hit
  three navigation-breaking defects in ten minutes and named the class: *"you shouldn't have
  to navigate the doc graph like a squirrel just to figure out what the insane staccato — a
  consistent malady of our documentation — is supposed to mean."* Commissioning this tenet,
  he put the disease and its half-life plainly, and his framing is preserved rather than
  laundered: *"I'm wondering how I can 'migrate' it to read like actual documentation, not
  merely the thought-stream of a meth-head. The documentation has a life-time of about 2
  hours (exactly the context window, or whatever, you catch my drift) and I'm fucking sick of
  it."* And he named the positive model: *"One of the things I learned in academia is the
  requirement that figures be 'self-explanatory'… something similar should appear here."* The
  worked specimens are all in this repository: the three morning defects (fixed in commit
  `48dce0c`, so both polarities survive in git) and the
  [safety-critical-logging BRIEF](../../law/briefs/safety-critical-logging/BRIEF.md), a
  document produced by a Fable-class model — the same class authoring this draft — and named
  by the maintainer as the specimen of the failure. The disease is not one contributor's
  habit; it is the default output register of the tool this project is built around.
- **Scope:** Every **maintainer-facing document** authored or edited from ratification
  onward — READMEs, design notes, rulings, briefs, capability and operating documents,
  BACKLOG entries, ADRs themselves. It binds at the moment a document is written or touched
  (Rule 4 gives the exact binding point and the migration posture for the ~200-document
  back-catalog). It does **not** bind code comments, commit messages, table cells, or other
  legitimately telegraphic registers (Exceptions), and it never licenses retro-editing
  point-in-time records. The tenet is written to be **portable**: Rules 1–4 name no
  autoharn-specific mechanism, so another LLM-collaborator project can adopt them unchanged;
  autoharn's own bindings (which gate, which hook, which switchboard) live in the
  "Instance bindings" section, and this project intends to *serve* the discipline to other
  projects as an optional product, with autoharn as instance #1 and test bed.

A word on register, in the corpus's established key. This tenet is written against a failure
of the model class writing it, and the specimen it dissects at length was produced by that
same class. As with ADR-0013's Specimen 2, the first-person substrate is the point, not an
embarrassment: a discipline that assumed the author would notice their own illegibility would
be worthless, because — for reasons the Context explains — the author is *structurally* the
one reader on whom the text always works. The disdain here is for the conduct, never the
contributor, and the remedy is mechanical where measurement permits and honestly declared
review-only where it does not.

## Context

### The root cause: text written against a context window that dies with the session

An LLM writes documentation inside a live context window that silently supplies every missing
subject, referent, and connective. While that context survives, the text is complete — the
author (and anyone sharing the session) reads fragments as sentences, coinages as old
friends, and a bare table as obviously-what-comes-next. The moment the context is gone, the
same text is skeletal: the referents dangle, the fragments do not parse, and the reader must
reconstruct from the repository what the author's context window once supplied for free. That
is the maintainer's "life-time of about 2 hours" made precise: **the document is not a
record; it is a cache of pointers into a context that gets garbage-collected when the session
ends.** Every later reader — the maintainer next morning, a fresh agent hydrating from the
ledger, an outside auditor — arrives after the collection.

Two refinements to that diagnosis, verified against the specimens below and owned here rather
than repeated on authority. First, the context window is not the only supplier of false
completeness: some of the specimen text fails not because a referent lived in the session but
because the model reached for a *register* — lecture-note telegraphese, slide-deck
headword-chains — that its training associates with "technical documentation." No context
window ever made `abstract machine → refinement → implementation; proof obligations (POs)`
a sentence; it was never complete for anyone. Second, and consequently, the sound mandate
cannot be cause-side (a rule about how the author works) or shape-side (a list of banned
patterns — this project has paid three times to learn that enumerated shape-matching fails
open at the next instance, per [ADR-0011's class-not-instance
rule](../../GLOSSARY.md#class-not-instance-net)). It must be **reader-side, tested on the
artifact**: does the text work for a reader who has none of the author's context? That single
test catches both mechanisms, and every mechanism not yet named, because it does not care why
the text is skeletal — only whether it is.

This is the academic *self-explanatory figure* rule generalized to prose. A journal reviewer
does not ask how the figure was made; they ask whether the figure plus its caption can be
understood by a reader who skipped the body text. The maintainer named that rule as the
model, and the project already uses its operational form: the **fresh-context probe** — a
second model instance given the artifact and nothing else — is how this repository already
audits its own documents (an Opus fresh-context probe on 2026-07-11 caught
[GLOSSARY.md](../../GLOSSARY.md) violating its own Stand-Alone Principle; the operating-era
terms section records it). This tenet makes that probe's standard the authoring bar, not
just the audit instrument.

### The specimens

**The named specimen — the safety-critical-logging BRIEF.** The
[BRIEF](../../law/briefs/safety-critical-logging/BRIEF.md) is a genuinely substantive research
document, which is exactly why it serves as the specimen: the failure is not thin content but
content rendered illegible. Three passages, diagnosed:

- *Fragmentation and contextual starvation.* §3 opens: **"The core deliverable. Each row is
  an entry the AI collaborator MUST write."** The section's first "paragraph" is a
  three-word noun phrase with no verb — the core deliverable *of what, for whom*? The reader
  who opens at §3 (where the operative content lives) gets a fragment where the grounding
  sentence should be. The author's context knew this was the commission's centerpiece; the
  text does not say so.
- *Slash-soup standing in for connective prose.* §1.1's first entry reads: **"B-method /
  Event-B (Abrial) with Atelier B / Rodin — RATP Line 14 'Meteor' — abstract machine →
  refinement → implementation; proof obligations (POs); Rodin proving-perspective status."**
  Six proper nouns, three slashes, two em-dashes, an arrow chain, and not one clause. Which
  of these is a method, which a tool, which a project? What claim is being made? The `/` and
  `—` are doing the work sentences owed the reader; the reader must already know the domain
  to parse the line, which defeats the line's purpose.
- *Referents that resolve only in the authoring session.* §4 states: **"Our ledger's existing
  shape is roughly `{kind, status, evidence, supersedes}` (per the harness DB claim-ledger
  and the WHY-ledger / R-WHY / R-QTY work)"** — and, section-wide, discusses "the pilot"
  ("Our pilot kept a decision/verification ledger while coding"). *WHY-ledger*, *R-WHY*,
  *R-QTY*, and *the pilot* are defined nowhere in the document and linked to nothing; they
  were live referents in the session that wrote the BRIEF and are opaque tokens two hours
  later. This is the purest form of the root cause: text complete for its author at write
  time, skeletal for every later reader.

**The morning defects (fixed in `48dce0c`; both states in git).** (a) A ruling cited
<!-- doc-shapes-allow: quoted defect specimen, per this tenet's own Exceptions -->
"HANDOFF open-work item 2" — a *positional* reference into a wholesale-rewritten document,
already dangling when the maintainer followed it (the slot had come to hold a different work
item). (b) The same ruling, prepared for a non-expert decision, opened with a SQL quotation
and the coined kernel terms it presumed — the fix added a "question in plain words" lead.
(c) A conformance map cited the BRIEF by the *source project's* path
<!-- adr-portability-terms-allow: quoted defect specimen, per this tenet's own Exceptions -->
(`experiments/fact-mining/...`), prose-styled and unresolvable here, and used "J-boundary"
without any reachable definition. Four shapes, one class: references that gesture instead of
resolving, and openings that assume the author's context.

**The in-house fragments.** The class is not confined to imports: `FINDINGS.md:107` carries
the standalone paragraph *"Block-and-ask + witness-integrity mandate."*, and even the law
corpus has *"Four rules."* as a complete paragraph
([ADR-0015](0015-verification-substrate-discipline.md), line 50). Both were found
by a five-line scan during this draft's own measurement pass — the malady is ambient,
exactly as the maintainer said.

### The cautionary tale: a legibility mechanism that cried wolf

This tenet is not the repository's first swing at doc legibility, and the first swing is the
standing lesson in how mechanization fails. `gates/doc-legibility/` (the acronym gate) was
built after the maintainer twice hit an undefined acronym; it checks that every
≥2-uppercase-letter token is defined or allow-listed. Run today it reports — witnessed during
this draft — **"1619 undefined acronym(s) across 206 docs"**, of which 1410 are the token
`ADR`, and it is wired into no CI or hook, so it blocks nothing and teaches nothing. A gate
whose violation list is dominated by the repository's own ordinary vocabulary is not
enforcing a discipline; it is training everyone to ignore the discipline's name. The design
consequence for this tenet is stated in Rule 3 and honored in the instance bindings: **a
deterministic check ships only with its false-positive load measured on the real corpus
first**, and a heuristic that fails that measurement is recorded as UNBUILT with the numbers,
not shipped as noise. (The acronym gate's own disposition concluded mid-draft: the concurrent
assessment ruled KEEP-ADVISORY-WITH-SEEDED-ALLOWLIST — allowlist seeding plus a history
exclusion cut its flagged occurrences by 54% — and its BACKLOG entry names arming conditions
(that entry, like the ratification packet Rule 4's dated correction describes, was retired
with [BACKLOG.md](../../BACKLOG.md)'s 2026-07-12 reduction to a pointer stub; its words are
recoverable from git history, `git show f101b193^:BACKLOG.md`, as evidence rather than a live
reference); this tenet cites the episode as precedent and defers to that disposition.)

## Decision

We adopt the **Zero-Context Reader** standard for maintainer-facing documentation, in four
rules. The spine is one sentence: **a document is finished only when a reader with zero
conversational context — none of the author's session, memory, or unstated referents — can
parse every sentence, resolve every reference from the text or its links alone, and learn
from the document itself what each part is and why it is there; everything else in this tenet
is that test's enforcement, its honestly-measured mechanization, and its migration posture.**
Robustness over completeness, per the commissioning ruling: the mechanisms below aim to
reliably catch the worst offenses and to say plainly what they do not catch; edge cases are
patched as discovered, not pre-enumerated. Each rule names its
[enforcement surface](../../GLOSSARY.md#enforcement-surface) honestly.

### Rule 1 — Write for the zero-context reader (the mandate)

Before a document ships, it passes the test a fresh-context probe would apply:

- **(a) Every sentence is a sentence.** Subjects and verbs present; a noun phrase is not a
  paragraph; separators (`/`, `—`, `→`, `·`) join items *within* a stated frame, they do not
  replace the sentence that states the frame.
- **(b) Every referent resolves.** A term of art, a named artifact, a "the pilot" or a
  "the increment" either is plain English, is defined in the document, or carries a link to
  its definition. If the author cannot say where a reader lands when they chase the
  referent, the referent is dangling.
- **(c) Every structure is grounded.** A table, list, code block, or section is preceded by
  at least enough prose to tell the reader what it is, what its rows/items are, and why they
  are looking at it — the figure-caption rule. A structure dropped on the reader cold fails
  even when its content is correct.
- **(d) The opening orients.** The document's first paragraphs state in plain words what the
  document is, who it is for, and what question it answers or decision it records — before
  any apparatus jargon, quoted SQL, or inherited vocabulary. A reader who stops after the
  opening should know whether the document concerns them.

The author cannot self-certify this test, and the reason is structural, not moral: the test
asks what the text does *without* the author's context, and the author is the one reader who
cannot unknow that context. This is the same faculty-that-corrupts admission ADR-0013 Rule 3
and [ADR-0014](0014-executor-second-opinion.md) already make — and the same
remedy: the honest checker is out-of-frame (a fresh-context probe, an independent critic, a
cold human read), never the author's own re-read.

*Enforcement surface: review-only at authoring — declared presumptively decaying, exactly as
the [meta-sweep](../../GLOSSARY.md#meta-sweep) vocabulary requires — backed by two out-of-frame
transports of the same judgment: the fresh-context audit loop (the maintainer-proposed
A:B:C workflow, the section after Rule 4) as the primary instrument, and a headless LLM
critic at observer grade (costed, default OFF; instance bindings) as the lightweight one.
The deterministic gates of Rules 2–3 catch the narrow shapes they can soundly catch. No
mechanism reads prose comprehension; pretending otherwise would be the unsubstantiated claim
ADR-0011 forbids.*

### Rule 2 — A reference is a resolvable artifact, not a gesture

Four checkable obligations, all instances of one principle — *the reader must be able to
chase every pointer and land somewhere*:

- **(a) Coined terms link to their definition on first use, and the definition lands in the
  same change as the coinage.** This subsumes, and elevates from convention to law, the
  Stand-Alone Principle already stated at the top of the project glossary
  ([GLOSSARY.md](../../GLOSSARY.md), "Wiki posture") — that statement remains the operational
  home of the practice; this rule is why it binds. A portable adopter substitutes its own
  glossary; the obligation is the same.
- **(b) A path is a link that resolves.** A repository artifact is cited as a relative
  markdown link that resolves on disk (or sits in a code fence when it is literally a
  command or an external tree). A prose-styled path the reader must mentally resolve — the
  morning defect (c) — is a gesture, not a reference.
- **(c) Cross-references into mutable documents cite stable handles.** A document that is
  rewritten wholesale (a handoff, a status card) may be cited by *named* item, anchor, or
  dated entry — never by position ("item 2", "the third bullet"), which dangles on the next
  rewrite. Frozen point-in-time records may be cited positionally; they do not move.
- **(d) A reference describes its relation, not the target's content** — ADR-0005 Rule 3,
  composing unchanged; restated here only because chasing a reference is this rule's test.

*Enforcement surface: (b) is a live test/CI gate — `gates/link_integrity.py`, commissioned
the same morning as this tenet and merged mid-draft (`b5f9180`), runs as a blocking
pre-commit step over every tracked markdown file, with its exclusions printed, never
silent; this discharges the mechanization ADR-0005's Revisit-when #2 named in 2026 as "the
easiest candidate". (c) is partially mechanized by the doc-shapes gate (instance bindings)
for the measured-sound narrow form; (a) and (d) are review + critic — deterministic coinage
detection was assessed and declined, because this project's coinages are common words
("world", "run", "stamp") and no sound textual predicate separates coined use from plain
use.*

### Rule 3 — The banned shapes are specimens; the test is the law

Noun-phrase fragmentation, slash-soup, contextual starvation, unresolved coinages,
positional cross-references, jargon-first openings — the shapes quoted in Context — are
**what failures of Rule 1's test look like**, cited so authors and reviewers recognize the
disease on sight. They are not the definition of the offense. A document that passes every
named shape and still defeats the zero-context reader fails this tenet; a mechanism that
enumerates the shapes fails open at the next instance (ADR-0011 Rule 4), which is why the
critic is briefed on the *test* and given the shapes only as worked examples.

The same honesty governs mechanization downward: a deterministic check earns its place by
**measured** soundness on the real corpus, not by plausibility. The measurements taken for
this draft, recorded so the next pass does not re-litigate them: the
grounding-sentence-before-table heuristic is UNBUILT because it fired 602 times across 208
documents — house style legitimately sets tables directly under headings — so as a gate it
would be the acronym gate again; the standalone-fragment check measured clean (18 hits
repo-wide, 16 of them one boilerplate license line now exempted by name, the remaining 2
genuine specimens); and the positional-reference check ships only in the narrow form that
survived scrutiny — a bare position into the wholesale-rewritten handoff document, the
quoted-named-anchor form (`HANDOFF "Open work" item 1`, the shape the maintainer-accepted
fix itself uses) explicitly exempt — yielding 1 live flag and 0 false positives, the per-hit
split recorded in the gate's own header. A shape whose sound mechanization is not yet known stays with
the critic and review, and saying so is the ADR-0011 Rule 1 obligation, not a gap to paper
over.

*Enforcement surface: the two built checks are a test/CI-grade gate over touched documents
(instance bindings); everything else in this rule is the critic (observer) + review, declared
as such. ADR-0011 Rule 2 governs growth: a shape that recurs after this record converts to a
measured check, not to more prose here.*

### Rule 4 — Binds on touch; the back-catalog migrates on touch, opportunistically, or by maintainer-initiated sweep

The discipline binds a document **at the moment it is authored or edited**: a new document
meets Rules 1–3 before it ships; an edit to an existing document brings *at minimum the
edited sections and the document's opening* to standard in the same change — the plank-nail
reflex applied to prose, sized to the touch. The ~200-document back-catalog migrates by
three legitimate routes: **on touch** (the mechanized default above), **opportunistically**
(an agent brings a document it relied on up to standard in passing), and **by
maintainer-initiated sweep** — a deliberate large migration pass when the maintainer judges
the time right. *(Amended at ratification, 2026-07-11: the draft flatly prohibited big-bang
migration; the maintainer struck that as "undue and inflexible discipline for … no
discernible purpose" and reserves the sweep decision for himself. What survives of the
draft's rationale is advice to a sweep's initiator, not prohibition: churning many documents
at once dilutes the git-blame trail that lets defects be dated, so a sweep is worth batching
into reviewable units — and
[ADR-0004](0004-minimal-touch-edits-to-partially-visible-files.md)'s minimal-touch posture
governs unbidden agent edits; it was never a bar on a deliberate, maintainer-ordered pass.)*
Two hard limits on migration zeal stand unchanged by the amendment: **point-in-time records
are never retro-edited to comply** (ADR-0005 Rule 8 outranks this tenet; a frozen
commission, audit, or dated BACKLOG entry stays verbatim), and **quoting a defective passage
as evidence is not a violation** (this document quotes several; so will the critic's
findings and the corpus).

*Enforcement surface: the binding point is where the mechanisms attach — the gate and critic
run against touched documents at write/commit time, which makes "binds on touch" the
mechanized default rather than a resolution; the migration limits are review-only, composing
with ADR-0005 Rule 8's existing convention.*

### The fresh-context audit loop — the maintainer-proposed wiring (2026-07-11)

Mid-commission, the maintainer proposed the enforcement wiring this section adopts as the
discipline's primary transport, near-verbatim: *"simply making sure doc agents are forked
off in a 1(A):1(B):1(C) workflow by law (writing .md files rejected by non-workflow agents),
B audits for compliance, C fixes in case there is anything to fix."* Unpacked: **A**
authors the document; **B** — a separately forked reviewer that receives *only* the
document, this tenet, and the deterministic gates' output as anchors, never A's
conversation — runs the zero-context test; **C** repairs what B found. The proposal's
decisive property is that **B is the zero-context reader by construction**: where every
other instrument approximates the test, a fresh fork *is* the test — the only mechanism
that attacks the root cause directly. And because B and C ride the session's own billing,
this transport escapes the costed-headless-call barrier that keeps the hook critic
default-OFF: it can be the standing way documentation work is done, not a switch someone
must remember. The measurement in the instance bindings supports the same conclusion from
the other side — the headless passage-scoped critic measured mediocre (precision 0.692),
and a whole-document, larger-model, fresh-forked reviewer is the identical judgment given
strictly more evidence (B's own precision is unmeasured until armed; the corpus and briefing
prompt transfer to it unchanged).

Three design commitments keep the loop honest, each learned from a named failure:

- **The enforced surface is the attestation, not the agent's identity.** "Writing .md files
  rejected by non-workflow agents" is *not* implemented as an identity check at the write
  hook — identity enumeration fails open, and this project has already witnessed its write
  interceptors evaded (writes that dodged the command-shape matcher entirely — the banked
  specimens in [seen-red/mutation-observer/red.txt](../../seen-red/mutation-observer/red.txt),
  the record of why the after-the-fact mutation observer exists). The sound surface is
  commit-time and artifact-shaped: every changed
  maintainer-facing document must carry a **fresh-context attestation record** — produced by
  a B that is provably distinct from A, naming the document version it read and either
  per-finding specimens or an explicit clean verdict over the test's four clauses. The A:B:C
  workflow is the standard way to *produce* that record; the gate checks the record,
  indifferent to how the file was written. Note what this keeps out of the blocking path:
  the gate checks that a fresh-context read *happened* and has the required shape — a
  deterministic presence-and-shape check — never what the read *concluded*; B's content
  judgment stays advisory, so no LLM verdict blocks anything.
- **B's verdict has a required shape, or it is no verdict.** A bare "looks compliant" from B
  is the rubber-stamp failure, and it is foreclosed the way ADR-0013's 2026-07-02 amendment
  forecloses umbrella completion claims: B's attestation carries per-finding file:line
  specimens with quoted text and a suggested repair, or an explicit clean verdict
  enumerated against the four clauses of Rule 1 — and B is fed the deterministic gates'
  output as anchors it must dispose of, so a lazy B has visible unanswered findings.
- **B↔C non-convergence is a typed event, not a loop.** Two B→C rounds; if B still finds,
  the document routes upward as a non-converging-review-loop — the escalation event the
  orchestration contract already types — rather than grinding a third round.

*Enforcement surface: the attestation-presence gate is deterministic and commit-time-
blockable once built (it is designed here and UNBUILT this pass — instance bindings); the
A:B:C forking itself is workflow/review-policed; B's judgment is advisory by constitutional
constraint (whether any LLM verdict may ever block was a separate sub-question at this
tenet's 2026-07-11 ratification, answered "no" — deterministic surfaces stay the only
blocking path). Arming the loop for autoharn's own doc work was the ratifying commission's
main wiring question, resolved YES the same evening; its honest cost — roughly two to
three times the tokens per documentation change — was named up front, not discovered
later. **[Dated correction, 2026-07-14, ADR-0017 Rule 2(b) self-repair:** earlier text
here (and at three other sites in this file — the Instance bindings' "fresh-context audit
loop" entry, the critic hook entry, and Revisit-when #2) pointed to "the ratification
packet" as a document a reader could chase. It was real — filed the evening of
2026-07-11 as a BACKLOG.md section headed "RATIFICATION PACKET" (commit `b298079`) — but
BACKLOG.md was retired to a pointer stub the next day (maintainer ruling, this project's
ledger row 137, commit `f101b193`, 2026-07-12) and the packet's prose was not carried
forward into the stub; no path in this repository resolves it today. The two answers it
carried are restated in plain words above and at each other site, so the citation is no
longer needed to complete the sentence; a reader who wants the packet's own words can
still recover them from git history (`git show b298079:BACKLOG.md`), which is evidence,
not a live reference this rule depends on. The defect this correction repairs — a
thrice-cited, never-linked referent shipped in the very law file that names the citation
discipline — is tracked as `adr-0017-ratification-packet-referent` in this project's work
tracker.]**

## Instance bindings (autoharn, 2026-07-11) — the non-portable section

Everything above is project-neutral. This section is autoharn's binding of the tenet to its
own machinery, and an adopting project replaces it wholesale with its own.

- **The deterministic gate:** `gates/doc_shapes.py` — the two measured-sound checks
  (standalone fragment paragraphs; positional references into `HANDOFF.md`, the operator
  handoff file of the 2026-07-11 era, since renamed [ORCH-HANDOFF.md](../../user-guide/ORCH-HANDOFF.md)),
  scoped to the
  documents named on its command line (the touched set), repo-wide scan as report-only. Its
  header carries the 2026-07-11 measurements and the UNBUILT list with reasons. Registered
  with the fixture census ([gates/fixture_census.py](../../gates/fixture_census.py), the
  registry requiring every gate to keep a runnable red-evidence fixture); an inline
  `<!-- doc-shapes-allow: reason -->` waiver handles the
  measured false-positive classes (quoted historical references, deliberate fragments).
- **The link-resolution gate:** `gates/link_integrity.py` — landed mid-draft (the
  concurrent Sonnet commission, merged `b5f9180` 2026-07-11) and already wired as a
  blocking pre-commit step; its sweep also repaired 96 broken links and the live
  bare-positional reference this draft's own measurement pass had flagged. Rule 2(b) binds
  to it as built; its two printed exclusions (`judgment/**` history; the STALE-bannered
  architecture doc) are its own declared scope, not this tenet's to relitigate.
- **The fresh-context audit loop (A:B:C):** the primary transport, maintainer-proposed
  2026-07-11 (the Decision section above), armed at ratification the same evening (the
  dated correction under Rule 4's "fresh-context audit loop" enforcement surface has the
  history) rather than by this draft itself. Its commit-time **attestation-presence gate is designed and
  UNBUILT this pass** (the record format and the pre-commit wiring are one decision, filed
  in the BACKLOG entry beside this draft — an entry now recoverable only from git history,
  `git show f101b193^:BACKLOG.md`, after [BACKLOG.md](../../BACKLOG.md)'s 2026-07-12
  retirement to a pointer stub; Rule 4's dated correction explains that retirement once for
  this whole file). In a wired world the kernel (the append-only Postgres schema holding
  this project's decision ledger and its integrity machinery) already models the relation:
  [`countersign_obligation`](../../GLOSSARY.md#obligation)/[`review_gap`](../../GLOSSARY.md#review_gap)
  (the kernel's review-debt machinery: an obliged writer's rows are visible debt until
  countersigned) make a principal's writes visible debt
  until a [stamp](../../GLOSSARY.md#stamp)-distinct invocation (one whose session HMAC stamp
  proves it is not the writer) attests — verified against the then-pending review_gap
  scope-semantics ruling (since answered:
  [design/MAINT-REVIEW-GAP-SCOPE-SEMANTICS-RULING.md](../../design/MAINT-REVIEW-GAP-SCOPE-SEMANTICS-RULING.md)):
  the obligation binds the *whole principal* (the scope word is a
  label, not a filter), so a doc attestation can ride the existing attest machinery with
  zero kernel change, at the known coarseness that it catches all the principal's rows, not
  only documentation; that ruling governs whether that coarseness stands.
- **The critic hook:** `hooks/doc_legibility_critic.py`, the lightweight/portable transport,
  following the demurral-detector precedent (`hooks/demurral_detect.py`) exactly: observer
  mode, never blocks, fail-open on timeout/error, journal under the world's
  `.claude/logs/`, switched by `mechanisms.doc_legibility_critic` in
  `.claude/apparatus.json`, **default OFF because it spends a real `claude -p` call per
  invocation** (the 2026-07-10 maintainer mandate: no world silently bills its operator).
  Attachment point: PostToolUse on Write/Edit of `.md` files, delivered unwired per the
  no-live-hooks-edits rule. Findings are structured (file, quoted offending text, shape,
  suggested repair) so a human or agent can act on each. Its prompt is also the SSOT of B's
  briefing in the A:B:C loop — one judgment, one home, measured once. Promotion beyond
  observer is a maintainer act, decided separately from this draft at ratification (the
  dated correction under Rule 4 has the history) — never a default.
- **The measured corpus:** `instruments/doc_legibility_corpus.jsonl` — 24 real passages from
  this repository, both polarities (BRIEF staccato, the `48dce0c` before-states, the
  in-house fragments; against clean ADR prose, glossary entries, the `48dce0c` after-states,
  and hard negatives that are dense but resolvable). `instruments/doc_critic_eval.py` runs
  the critic's own classifier over it; the 2026-07-11 witnessed numbers
  (`seen-red/doc-legibility-critic/eval-witness.txt`): prompt v1 measured RAW precision
  0.524 / recall 1.000 — it punished excerpts for document-scope cross-references — and the
  shipped v2 measures RAW precision 0.692 / recall 0.750 (F1 0.720), calibrated in-sample
  against this same small corpus, said plainly. The numbers travel with the corpus and the
  prompt version, and a stale number is treated as no number (the caveat
  [hooks/demurral_detect.py](../../hooks/demurral_detect.py)'s own header states — a measured
  precision figure is valid only for the exact classifier-prompt version it was measured
  against, so every prompt edit bumps a version and re-measures — applies verbatim); the
  mediocrity of the headless transport is itself
  recorded evidence for the A:B:C transport above.
- **The glossary:** [GLOSSARY.md](../../GLOSSARY.md) is Rule 2(a)'s definition home; its "Wiki
  posture" preamble remains the practice's operational statement and now cites this tenet as
  its law once ratified.
- **The meta-sweep:** this tenet's own rules declare their surfaces above, so the
  [meta-sweep](../../GLOSSARY.md#meta-sweep) can hold it to the same standard it holds the rest
  of the law.

## Consequences

### Positive

- **Documents outlive their sessions.** The whole point: the artifact stops being a cache of
  pointers into a dead context and becomes the record the ledger-hydration workflow assumes
  it is. The maintainer stops paying the squirrel tax; a fresh agent stops paying the
  reconstruction tax that ADR-0005's Context already priced ("reconstruction degrades into
  guessing").
- **The worst offenses get caught by machines that don't cry wolf.** The built checks are
  small but measured; the critic is briefed on the test rather than a phrase list; and the
  acronym-gate failure mode — a thousand-item violation list nobody reads — is foreclosed by
  the measure-first rule this tenet imposes on its own mechanization.
- **The discipline is a product.** Because the core is project-neutral and the bindings are
  quarantined in one section, the tenet can be served to other LLM-collaborator projects as
  designed — the metaproject doing what the [metaproject](../../GLOSSARY.md#metaproject) is for.

### Negative

- **Prose costs more than telegraphese.** Grounding sentences, resolvable links, and plain
  openings take longer to write than headword chains, and an LLM author pays that cost on
  every document. This is the standing policy-vs-mechanism cost the corpus accepts everywhere
  else, paid here in words. The mirror risk — **inflation**, padding text to *look* grounded,
  hedging every noun with a definition it doesn't need — is named in "What this tenet does
  NOT mean" and is a violation of the project's lagom register, not compliance with this
  tenet.
- **The mandate's core is judgment, and its strongest transport is unarmed at birth.** Rule
  1 is review plus two out-of-frame transports, and both ship inert this pass: the A:B:C
  loop's own attestation-presence gate awaits being built (the loop itself was armed in
  principle at the 2026-07-11 ratification — Rule 4's dated correction has the history),
  and the headless critic is
  default-OFF because it bills per call — so until one is armed, a documentation change is
  protected only by review and the two narrow gates. Stated plainly per ADR-0011 Rule 1:
  this tenet leans on attention exactly where the acronym gate proved attention decays,
  until the maintainer arms a transport.
- **The fresh-context loop costs real money, named up front.** Roughly two to three times
  the tokens per documentation change, on session billing. That is the price of the only
  reviewer who genuinely lacks the author's context; the ratifying commission named that
  cost explicitly on 2026-07-11 rather than letting it arrive as a surprise on the bill.

### Neutral

- **No new infrastructure genus.** The critic reuses the demurral chassis (classifier
  subprocess, apparatus switchboard, journal, eval harness); the gate follows the standing
  gates/ conventions; the corpus follows the demurral corpus's shape. This tenet mints a
  discipline, not a platform.
- **ADR-0005 is untouched.** Its nine rules govern exactly what they governed; this tenet
  adds the reader-side test ADR-0005's Context gestured at ("orientation takes longer than
  it should") but never legislated.

## Exceptions

- **Point-in-time records.** Frozen commissions, dated BACKLOG entries, audit appendices,
  and any record ADR-0005 Rule 8 protects are cited as evidence, never retro-edited into
  compliance — including when they are illegible. Their illegibility is a fact about the
  past; the correction, where one is owed, is a new document.
- **Legitimately telegraphic registers.** Table cells, commit trailers, code blocks, shell
  transcripts, glossary one-liners under their own heading, checklists whose frame the
  surrounding prose already states. The defect this tenet names is *unresolvability*, not
  density; a dense line inside a grounded frame is fine, and flattening every register into
  essay prose would be the inflation failure, not the discipline.
- **Quoted defects.** A document that reproduces an offending passage in order to diagnose,
  label, or test against it (this file; the corpus; a critic finding) is doing the tenet's
  work, not violating it.
- **Private scratch.** Ephemera and session-local notes that are, by standing rule, never
  committed are outside scope — the zero-context reader never sees them.

## Revisit when…

1. **The link-resolution gate lands.** Record it in the instance bindings and tighten Rule
   2(b)'s declared surface from "commissioned" to the gate's actual reach; if the concurrent
   build dies, the commission re-files rather than silently lapsing.
   **[Struck 2026-07-13, ADR-0005 Rule 8 dated in-situ strike, per
   [design/MAINT-ADR-PORTABILITY-SPEC.md](../../design/MAINT-ADR-PORTABILITY-SPEC.md) §7 C7
   (maintainer-adjudicated 2026-07-13, ledger row 403 — this project's append-only
   decision/audit log, a Postgres-backed record of maintainer rulings and work items kept
   outside this repository and read via the `./led` command-line tool, not a file here —
   spec default stands): this trigger already fired and is already discharged elsewhere
   in this same document — Rule 2's enforcement text above states the gate "landed mid-draft…
   merged `b5f9180`… already wired as a blocking pre-commit step" (see Rule 2 and the
   "link-resolution gate" entry under Instance bindings). A reader following the numbering
   convention this ADR's own Amendment sections use (a later "Revisit #N" heading discharges
   list item N, [ADR-0000](0000-the-alpha-and-the-omega-type-driven-design.md)'s precedent)
   could mistake this still-open-looking numbered item for a live trigger; it is not — it is
   preserved verbatim above per Rule 8 as the historical condition that was met, not a
   discharge marker to act on again.]**
2. **A transport has live numbers.** After a real period of operation — the A:B:C loop's
   attestations adjudicated by the maintainer, or the critic hook's journal findings
   labeled true/false — the corpus grows from live misses and the promotion question (may
   any LLM verdict ever block, or gate a commit with "ask"?) returns to the maintainer with
   measured live precision attached. Until then it is not asked again; an unmeasured
   promotion request would be the acronym gate's mistake at higher stakes. The
   attestation-presence gate (deterministic, checks that a fresh read happened, not what it
   concluded) is exempt from this bar and may be built and armed on the 2026-07-11
   ratification's word (Rule 4's fresh-context-audit-loop section carries the dated
   correction naming where that ratification's own record now lives).
3. **The acronym gate moves from KEEP-ADVISORY.** Its assessment concluded 2026-07-11
   (keep advisory, allowlist seeded, arming gated on a real terms-authoring pass or a
   narrower blocking scope — the disposition entry in BACKLOG carries the numbers; like
   every BACKLOG entry this file cites, it survives only in git history,
   `git show f101b193^:BACKLOG.md`, after the 2026-07-12 stub retirement Rule 4's dated
   correction describes). If it
   is later armed or retired, update the Context's cautionary tale so it carries its
   ending.
4. **A new failure shape recurs.** Per ADR-0011 Rule 2, the second instance of a shape not
   named here converts to a specimen in Rule 3 and, where a sound predicate exists, a check
   in the gate — measured first, always.
5. **A second project adopts the core.** The portability claim becomes testable exactly
   once: confirm Rules 1–4 transferred without edits, re-anchor the specimens to the
   adopter's own corpus (a fork inherits the *rules*, not this repository's wounds), and
   fold what the transfer taught back into this section.

## Related

- **[ADR-0005 (documentation discipline)](0005-documentation-discipline.md).**
  The sibling. It governs the *facts and lifecycle* of documentation (SSOT per handle,
  filing homes, amend-by-append, verbatim commissioned artifacts); this tenet governs the
  *reader*. Rule 2(d) imports its Rule 3; Rule 4's migration limits defer to its Rule 8; its
  Revisit-when #2 (a cross-reference-resolution checker, named in 2026 as "the easiest
  candidate… not soft") is discharged by Rule 2(b)'s gate.
- **[ADR-0011 (mechanization discipline)](0011-mechanization-discipline.md).**
  The enforcement-surface vocabulary, the class-not-instance rule that keeps Rule 3 from
  becoming a shape list, and the recurrence→mechanism trigger that grows the gate.
- **[ADR-0012 (compositional and structural hygiene)](0012-compositional-and-structural-hygiene.md),
  cancer G.** "Load-bearing knowledge offloaded to unenforceable prose" is this tenet's
  structural cousin: G forbids prose as a *substitute for mechanism*; this tenet governs the
  prose that legitimately remains.
- **[ADR-0013 (execution integrity)](0013-execution-integrity.md)
  and [ADR-0014 (second opinion)](0014-executor-second-opinion.md).** The
  faculty-that-corrupts admission and the out-of-frame remedy, which Rule 1 inherits: the
  author cannot run the zero-context test on their own text, so the honest checker is
  independent — the critic is to legibility what the hack-rationalization detector (the
  adversarial review pass ADR-0014's out-of-frame remedy instantiates for scope: a fresh
  context asked to refute a fix's own justification, catching a hack dressed as discipline)
  is to scope discipline.
- **[The safety-critical-logging BRIEF](../../law/briefs/safety-critical-logging/BRIEF.md) and
  [its conformance map](../../law/briefs/BRIEF-CONFORMANCE-MAP.md).** The named specimen and —
  in the map's J-boundary paragraph — the model this tenet follows for scoping a guarantee
  honestly: say which absences the machine can detect and which it cannot.
- **[GLOSSARY.md](../../GLOSSARY.md).** The Stand-Alone Principle this tenet subsumes into Rule
  2(a), and the definition home the rule binds to.
- **The BACKLOG indictment entry** ("Documentation legibility indictment (maintainer,
  2026-07-11 morning)", [BACKLOG.md](../../BACKLOG.md)) — the dated substrate, with the four
  defect shapes as first filed.

## What this tenet does NOT mean

- **Not "write more words."** The test is resolvability, not volume. A grounded table beats
  a paragraph that restates it; a linked coinage beats an inline lecture; padding is the
  mirror defect and the lagom register already forbids it.
- **Not "no density anywhere."** Telegraphic registers that carry their frame (tables,
  glossary entries, commit trailers) are exempt by design. The offense is making the reader
  supply a frame the author had and did not write down.
- **Not a rewrite mandate.** The back-catalog migrates on touch, opportunistically, or not
  at all; point-in-time records never. A roving legibility sweep is an ADR-0004 violation
  wearing this tenet's clothes.
- **Not self-certifying.** Per ADR-0011 Rule 1, this tenet expects its own prose to be
  exactly as weak as Rule 1 declares: the mandate is judgment, checked honestly only from
  outside the author's context. Its protection is the out-of-frame critic, the two measured
  gates, the fresh-context probes the project already runs — not the author's confidence,
  which the root cause makes structurally worthless on this one question.
- **Not settled law.** This is a draft awaiting the maintainer's word, filed in `design/`
  precisely because nothing here binds until ratified.
  **[Struck 2026-07-13, ADR-0005 Rule 8 dated in-situ strike, per
  [design/MAINT-ADR-PORTABILITY-SPEC.md](../../design/MAINT-ADR-PORTABILITY-SPEC.md) §7 C1
  (maintainer-adjudicated 2026-07-13, ledger row 403 — this project's append-only
  decision/audit log, a Postgres-backed record of maintainer rulings and work items kept
  outside this repository and read via the `./led` command-line tool, not a file here —
  spec default stands): this bullet is stale. The status block at the top of this
  document already reads "Accepted (maintainer-ratified 2026-07-11…)" and this file lives in
  `law/adr/`, not `design/` — this document is ratified law, not an unratified draft. The
  bullet was never updated at ratification. It is preserved verbatim above per Rule 8; read
  it as true of the pre-ratification draft this bullet described, not of the document you are
  reading now.]**

## License

Public Domain (The Unlicense).
