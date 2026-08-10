# ADR-0020 — The meaning-preservation witness (no-content-lost never discharges no-meaning-changed)

Ratified 2026-07-23. Provenance: the 2026-07-22/23 setup-TUI arc witnessed one defect
class in five distinct habitats — a schema migration that turned "aspires to NIST SP
800-63's decomposition" into a bare conformance claim by filing the standard's name
into a `standards` field (ledger row 1119; diagnosed as defect D1/D1a in the
[Fable elucidation RCA, phase 1](../../design/CONSULT-FABLE-ELUCIDATION-RCA-2026-07-22.md);
[postmortem](history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md) Lesson 22); a synopsis
that re-promoted a demoted rule into flat law (ledger row 1126, the ADR-0003
strike-to-silence disposition); a plain-language edition whose first three review
passes each found a distinct severe meaning change (a swapped referent, six dropped
consumer bindings, a reversed recommendation) (ledger rows 1124 and 1129, the
four-pass repeat-until-clean attestation of the
[elucidation-consult ratification edition](../../design/ELUCIDATION-CONSULT-RATIFICATION-EDITION-2026-07-22.md));
a checklist recording untouched defaults as "operator declined" (ledger row 1115;
[postmortem](history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md) Lesson 6); and
elucidation "fixed" for line length by deleting its content (ledger row 1115's
censure; traced as the CONSERVATION PROXY's own precedent in
[the RCA's phase 2, section A, step 4](../../design/CONSULT-FABLE-ELUCIDATION-RCA-2026-07-22.md#phase-2--mechanistic-causal-speculation);
[postmortem](history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md) Lesson 23).
Every instance passed its
mechanical checks, because every mechanical check attested token conservation or
format, and the defects lived in what the artifact ASSERTS. The causal RCA named the
mechanism the CONSERVATION PROXY: "no content lost" standing in for "no meaning
changed" — every token preserved, the claim strengthened, the edge between tokens
dead (the full record spans the
[postmortem](history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md), the
[RCA](../../design/CONSULT-FABLE-ELUCIDATION-RCA-2026-07-22.md), and ledger rows
1119–1121, cited per specimen above rather than as one lump).

## The rule

**Any operation that migrates, schematizes, summarizes, or re-renders authored
content carries a cold-read meaning-preservation witness alongside its mechanical
invariants.** A fresh-context reader — one who did not perform the transformation —
reads the output against the source and attests: the output asserts no more and no
less than the source asserted (qualifiers, hedges, aspiration markers, speculation
markers, honest ceilings, named exclusions, consumer bindings, and recommendation
polarity all intact), and it serves its declared reader. The operations in scope,
enumerated by shape rather than instance: prose-to-schema and schema-to-prose,
document merges and splits, plain-language or audience-shifted editions, synopsis and
summary derivation, re-rendering content into a new presentation vocabulary, and any
"tidying" pass over authored claims. A transformation commissioned without this
witness clause is an incomplete commission.

Two subsidiary clauses, each a lesson paid for:

1. **Mechanical invariants cannot discharge this witness.** A check that counts
   tokens, elements, lines, or formats attests the delta's contract, not the
   artifact's meaning; passing every such check is compatible with a strengthened
   claim, a dropped hedge, or a reversed recommendation. Where a residue-disposition
   mechanism exists (every span of source text dispositioned as moved, dropped,
   duplicated, or relation-severed), it is a floor under this witness, never a
   substitute for the cold read.
2. **The witness iterates to a clean pass on severe findings.** A pass that finds a
   severe meaning change (truth value, coverage, referent, binding commitment, or
   recommendation direction) proves the class is present in the transformation
   process, not that it caught the last instance: after repair, a fresh reader —
   blind to the prior pass's findings — reads again, until a pass finds none. (The
   provenance arc needed four passes; the three severe-finding sets were pairwise
   disjoint.)

## Relation to neighbors

Independent of ADR-0017 (the zero-context reader), which governs whether a document
is LEGIBLE to a cold reader; this ADR governs whether a transformation PRESERVED what
its source asserted — an illegible document can be faithful and a beautifully legible
one can lie. Composes with ADR-0008 (two distinct facts are not fuzzy-matched into
one; a claim and its qualifier are two facts whose edge must survive) and with
ADR-0002 (the witness's findings are stated loudly, never repaired silently).

*Enforcement surface: spec-time (the witness clause is a required part of any
transformation commission) and the witness act itself; review-only for recognizing
that an operation IS a transformation in scope — that recognition is judgment, and
reading it down is the documented failure mode.*

## License

Public Domain (The Unlicense).
