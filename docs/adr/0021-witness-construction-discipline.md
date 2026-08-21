# ADR-0021: Witness-Construction Discipline — the witness observes the property, not a symptom

- **Status:** Accepted (Fable-authored 2026-07-29; maintainer-ratified the
  same day — "0021 approved but needs a +A:B:C for completeness," discharged
  by the A/B/C/B2/C2 loop of autoharn3 ledger rows 882-930, closed at
  row 930 (the author's approval of the final repairs); the loop's
  attestation record, written before this file's commit, lives in
  attestations/doc-legibility-attestations.jsonl;
  admitted by the maintainer with a recorded
  weak-yes wariness (autoharn3 ledger row 876) about minting new ADR numbers
  too freely — the wariness reasons by analogy to ADR-0008's negative
  register (fabricating a category under ambiguity), since minting a new ADR
  number is itself a new-category act, not a claim that ADR-0008 itself
  addresses ADR numbering — alongside an explicit ruling that the corpus
  itself is not fixed ("like in physics... all insights preserved to
  fidelity," but the set of laws is not; row 876) — this tenet earns its
  number by being a primitive, not a technique note).
- **Genre:** Tenet (cross-cutting evidence discipline) — the witness-construction member of
  the verification family. The family's division of labor, stated so the seams
  are visible: ADR-0009 says a performance claim carries its investigation;
  ADR-0011 says a reading carries its code state and a recurring discipline
  converts to a mechanism; ADR-0013 governs the ACTOR — the integrity with
  which a mandate is carried to its end and reported (its Rule 5, "verify the
  artifact, not the claim," binds the *executor* verifying their own artifact
  before reporting it done — a conduct rule; 0013 governs that conduct, this
  tenet governs the artifact itself, independent of who checks it); ADR-0015 governs
  the MACHINE — the substrate envelope under which a run is evidence at all;
  ADR-0020 governs meaning-preservation across rewrites. (ADR-0015's own
  family enumeration names only ADR-0009/0011/0013 and predates both ADR-0020
  and this tenet; ADR-0020's and this ADR's membership in the family is
  asserted here, not yet cross-referenced back from 0015.) This tenet governs
  the EVIDENCE ARTIFACT itself: what a witness must observe for its green and
  red to mean what they claim. It is deliberately not about anyone's conduct
  (0013) and not about the environment (0015) — a diligent actor on a healthy
  substrate can still construct a witness that proves nothing, in perfect good
  faith, and that failure mode had no law until this one.
- **Date:** 2026-07-29
- **Provenance:** Native, three same-day specimens from one working session
  (the access-control batch — the same day's kernel-lineage delta series
  hardening access-control checks — autoharn3 ledger rows 805/832/849 family),
  two of them found by fresh-context reviewers in work that had already passed
  its builder's own witnessing:
  1. A fix's red leg could not distinguish "refused at construction" from
     "died downstream in the probe for unrelated reasons" — a garbage input
     fails *somewhere* regardless, so the red observed a symptom that would
     stay red with the defect absent. Cured by a tripwire stub at the exact
     call site whose firing IS the observation (rows 832/849, the worked
     example in Rule 2).
  2. A lineage detect artifact anchored on an inline code COMMENT rather than
     the behavior it marks: an innocent future reissue rewording the comment
     flips the detect false while the behavior stands, and the reverse
     refactor keeps the string while breaking the logic (row 805, kernel
     lineage delta s66 — "sNN" is this corpus's shorthand for its Nth
     numbered kernel-lineage delta).
  3. A detect reading true at a wrong baseline for reasons a downstream walk
     happened to mask — a proxy anchor surviving by the accident of its
     caller's evaluation order. The s63 detect artifact itself is correctly
     built (a behavioral anchor, both polarities); the mis-constructed
     witness is the REVIEWER'S reproduction procedure — one of the witness
     kinds Scope already enumerates ("review reproductions") — whose
     fixed-baseline observation point violated Rule 1's observe-at-the-site
     requirement. The s63 detect marker text is non-monotonic across the
     lineage (present at s58, absent at s61/s62, restored at s63), so a fixed
     non-adjacent baseline genuinely mis-reads applied-status; the reviewer's
     own first attempt used exactly that fixed baseline and self-caught the
     mis-read mid-review (the s63 baseline incident, disclosed in the same
     review).
- **Scope:** Every artifact offered as a witness — seen-red fixture legs,
  detect/verify queries, gate assertions, review reproductions, differential
  floors — in any project this corpus governs. It binds the artifact's
  construction; the reading of results stays with ADR-0013 Rule 5, and the
  environment stays with ADR-0015.

## Context

The corpus's evidentiary practice is strong and largely un-codified: claims
carry witnesses, witnesses run both polarities, red comes first. What the
practice never named is the difference between observing a property and
observing something that usually co-occurs with it. A proxy witness passes
every procedural bar — it exists, it runs, it goes red then green in the
right order — while certifying nothing, because its red can be red for the
wrong reason and its green can be green while the property fails. The three
provenance specimens are one class wearing three coats: evidence anchored
beside the claim instead of on it. Reviews caught two of the three; the class
recurred past both spec and review in a single day — the recurrence that
justifies converting this observation into law now, per ADR-0011. Rule 2's
own mechanization step is a separate, still-owed act: it is not discharged by
this filing, and the Enforcement section below names its candidate mechanism.

## Rules

1. **The witness observes the claimed property directly, at the site of the
   claim.** If the claim is about where a value dies, the witness watches the
   boundary, not the eventual stack trace. If the claim is about what a
   function derives, the witness reads the derivation's output, not a
   neighboring artifact that tends to agree with it. A witness whose
   observation point is downstream of the claim inherits every confounder
   between the two, and each confounder is a way for red and green to lie.
   *Enforcement surface: review-only — a fresh-context reviewer asks, per
   witness, "what does this actually observe?"; the candidate mechanization
   is the fixture-census anchor-audit extension named in Enforcement below.*

2. **Negative claims are converted into positive observations.** "X is never
   reached," "Y never crosses this boundary," "Z is never written" — absence
   cannot be watched, so the witness plants a tripwire at the site whose
   FIRING is the observation: a stub that raises when reached, a canary row
   whose appearance is the failure, a probe whose silence is the pass only
   because its trigger was proven live in the red leg. The red polarity of a
   negative claim is the tripwire firing under the defect; a red leg that
   merely shows *some* failure under the defect has not witnessed the claim.
   *Enforcement surface: review-only for whether a negative claim was
   converted to a tripwire at all — a built tripwire then runs at test/CI
   gate strength like any other witness, but the requirement to build one is
   not itself mechanized.*

3. **The anchor is behavior, never adjacent prose.** A witness that matches a
   comment, a docstring fragment, or a message string chosen for grep-ability
   is anchored on text with no behavioral contract: it drifts under innocent
   refactors in both directions (false red on a reworded comment; false green
   on a preserved string over broken logic). Where the observed surface must
   be text (a refusal message, a rendered artifact), the text must itself be
   the contract — operator-facing, load-bearing — and the witness says so.
   Exception-message anchors qualify; comment anchors never do.
   *Enforcement surface: review-only — distinguishing a behavioral anchor
   from an adjacent-prose one is a judgment call today; the same candidate
   fixture-census extension named in Enforcement below is the mechanization
   trigger.*

4. **Both polarities, red first, each polarity for the right reason.** The
   red leg demonstrates the witness CAN fail — under the named defect,
   observed at the named site — before the green leg is credited. A red
   produced by an unrelated failure mode (a garbage input dying downstream, a
   missing import, a dead fixture) is not a red; it is the witness failing to
   run. Where a polarity is impractical, the leg is marked UNEXERCISED with
   the concrete blocker, per the standing claims-carry-witnesses rule — an
   honest gap outranks a wrong-reason red.
   *Enforcement surface: review-only — the red-first ordering and the
   right-reason judgment are read at review; once a witness is correctly
   authored, both its legs execute at test/CI gate strength like any other
   test.*

## Enforcement surface (ADR-0011)

Review checklists: a fresh-context reviewer judging any witness asks, per
leg, "what does this actually observe, and can its red be red for another
reason?" — the two questions that catch all three provenance specimens. The
code-review findings corpus carries the classes (`fingerprint-anchored-on-
comment`, and the tripwire cure under `bare-types-missed-birth-site`'s fix
record) for the eventual mined checklist. Recurrence past spec and review
converts, per ADR-0011, into a mechanism — the candidate shape is an
extension of the existing fixture-census gate (`gates/fixture_census.py`,
the registry that maps every seen-red witness directory to its runnable
fixture and refuses orphans; [GLOSSARY](../../GLOSSARY.md#fixture-census))
auditing detect/witness anchors, not more prose here. The inline
enforcement-surface lines under the Rules above name this same candidate.

## What this tenet does not do

It does not mandate any technique (the raise-if-reached stub is the recipes
corpus's worked example, not law); it does not grade witnesses by effort or
count; it does not touch the reading of results (0013), the substrate (0015),
or documentation meaning (0020). And per the maintainer's same-day ruling on
the corpus itself: the ADR set is not fixed — if the verification family later
consolidates, this tenet's insight moves at full fidelity; the number is a
seat, not a shrine.

## Consequences

### Positive

- **A proxy witness stops passing as evidence.** The two Enforcement-surface
  questions — what does this observe, can its red be red for another reason
  — are cheap to ask and catch all three provenance specimens; a reviewer no
  longer needs to rediscover the failure shape from scratch each time.
- **Confounders are named before they ship.** Rule 1's "observe at the site"
  and Rule 3's "anchor is behavior" each foreclose a specific way a witness's
  red or green can lie, rather than leaving the gap to be found by accident,
  post hoc, the way all three specimens were.

### Negative

- **Witness construction gets slower and more deliberate.** Siting an
  observation exactly at the claim, and building a tripwire for a negative
  claim rather than reusing whatever fails nearby, costs more authoring time
  per witness than reaching for the nearest artifact that happens to agree.
- **Review burden per leg.** The two questions are asked per leg, per
  witness — a real, ongoing review cost, not a one-time check — and, per the
  Enforcement-surface lines above, every rule's AUTHORING obligation is
  review-only today: the tenet's protection is exactly as strong as the
  reviewer asking the questions, no stronger, at construction time. A
  correctly-authored witness's legs then run at test/CI gate strength
  thereafter, as Rules 2 and 4's own inline lines note — it is the
  requirement to build one correctly, not its subsequent execution, that
  stays unmechanized.

### Neutral

- **No technique or effort grading.** Per "What this tenet does not do,"
  this ADR mandates no specific construction (the raise-if-reached stub is
  recipes-corpus material, not law) and does not score witnesses by how much
  work went into them — only whether the property, not a symptom, was
  observed.
- **No retroactive sweep.** The tenet binds witnesses authored or amended
  from this point forward; it does not commission a sweep of the existing
  corpus's witnesses to re-certify them against Rules 1–4.

## Revisit when…

1. **The fixture-census anchor-audit mechanism** (named in Enforcement
   above) lands — record it here, and tighten the affected Rules' inline
   enforcement-surface lines from review-only toward the gate.
2. **The verification family (0009/0011/0013/0015/0020) consolidates** — per
   the maintainer's same-day ruling in Status, this tenet's insight moves at
   full fidelity into whatever shape the family takes; this section is where
   that move is recorded.
3. **A specimen class emerges that the four rules fail to cover** — recorded
   as a dated amendment naming the gap, not folded silently into an existing
   rule's text.

## Related

- **[ADR-0009 (performance investigation discipline)](0009-performance-investigation-discipline.md).**
  The sibling per-domain member of the same "a claim carries its
  substantiation" family — a perf claim carries its investigation the way
  this tenet's witness carries its site-of-observation.
- **[ADR-0011 (mechanization discipline)](0011-mechanization-discipline.md).**
  The parent bar: this tenet exists because the class recurred past spec and
  review in a single day (Context), and its Rule 1 enforcement-surface
  vocabulary is what the inline lines under each Rule above declare against;
  Rule 2's mechanization step is the still-owed act the Enforcement section
  names a candidate for.
- **[ADR-0013 (execution integrity)](0013-execution-integrity.md).** Governs
  the ACTOR — the conduct of carrying a mandate to its end and verifying the
  artifact before reporting it done (its Rule 5); this tenet governs the
  artifact itself, independent of who is checking it.
- **[ADR-0015 (verification-substrate discipline)](0015-verification-substrate-discipline.md).**
  Governs the MACHINE — the substrate envelope under which a run is evidence
  at all; a witness can satisfy this tenet's four rules and still prove
  nothing if 0015's envelope did not hold, and vice versa — the two are
  independent floors, not a hierarchy.
- **[ADR-0020 (the meaning-preservation witness)](0020-meaning-preservation-witness.md).**
  The sibling "witness" member of the family, guarding a different failure
  mode — semantic drift across a rewrite, rather than a proxy anchor at
  construction — with the same evidentiary spirit: a witness must observe
  the thing actually claimed.

## License

Public Domain (The Unlicense).
