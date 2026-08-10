# ADR-0019 — Genre convention is the default spec (UIs are not a novelty surface)

<!-- doc-attest-exempt: constitutional text authored by Fable and maintainer-ratified
2026-07-22 (commission: "Can we document UI type shit-patterns into ADR-0019 so I never
again have to point it out?"). Removal condition: a fresh-context A:B:C attestation pass
over the law/ corpus. -->

Ratified 2026-07-22. Provenance: one day — 2026-07-22 — produced four independent UI
builds of the same configuration surface, each inventing a fresh anti-pattern no
mainstream configuration application exhibits, each caught only by the maintainer's
eyes at real cost (ledger rows 1100, 1109, and the day's session record; ~$340 of
spend measured by the maintainer). The maintainer's observation, preserved because it
is the diagnosis: LLM builders are supposed to be statistical pattern completers, yet
each attempt produced task-shaped novelty instead of the genre's convergent shape.

## Rule 1 — In an established genre, the convergent design IS the default spec

A configuration editor, a file picker, a log viewer, a form, a table browser — these
are SOLVED genres: decades of convergent evolution across thousands of applications
have produced a dominant idiom per genre (for configuration: a hierarchical tree of
the whole space, always visible; a form pane whose fields are a LIVE view of the
model; statuses derived, not declared; one real action, not per-node ceremony —
Qt settings, SAP IMG, every mature settings surface). A spec or build for a UI in
such a genre inherits the dominant idiom as its default in full. The spec's job is
to name the genre, name two or three reference exemplars, and specify only the
domain content and the DELTAS — and every delta from the genre idiom is a named,
justified decision that survives the named-consumer test (ADR-0000's tail: who
consumes this deviation?). An unjustified deviation is a defect on the same footing
as a failing gate, however locally clever it looks.

## Rule 2 — Novelty is the anti-pattern (the enumeration is open, the class is closed)

The anti-pattern catalog is infinite — a teletype emulated inside a widget toolkit;
a product type rendered as a sequential wizard; a per-section save button splitting
form state from model state; a bespoke navigation key protocol; a binding on another
tool's prefix key — and enumerating it is a losing race (each of those five was
invented fresh, in this repo, within days, four of them within hours). Therefore the
rule quantifies over the class, not the instances: **any UI structure the genre's
reference exemplars do not exhibit is presumptively wrong**, and the burden of proof
sits on the deviation, never on the convention. "I have not seen this shape in the
references" is sufficient grounds for a reviewer or the maintainer to reject without
further argument. The specimens above are preserved as evidence that the class is
real, not as the boundary of it.

## Consequences

- A UI spec that names no genre and no reference exemplars is incomplete and may not
  be frozen (composes with the read-back mechanism of ledger row 1102: the read-back
  is stated in operator terms against the named references).
- Builders receive the reference idiom in the brief; a builder that cannot match a
  structure it is building to the references must stop and say so rather than invent
  (ADR-0014 posture, applied to design instead of debugging).
- Review of a UI change checks the diff against the named exemplars before it checks
  the code: structure first, correctness second — a correct implementation of a
  deviant structure is still a defect (2026-07-22's four builds were all "correct").
- This ADR deliberately mints no anti-pattern list to maintain. The genre references
  are the living catalog; the world maintains them for us.

*Enforcement surface: spec-time (the genre/reference clause is a required part of any
UI build basis) and review-only for the structural check — no mechanical gate reads
screenshots today. If a recurrence survives spec-time and review, that recurrence is
ADR-0011 Rule 2 grounds for minting the strongest feasible mechanism then available.*

## 2026-07-22 — Rule 3 appended: one home per fact extends to the screen (unique placement)

*(Dated append per ADR-0005 Rule 8, same day as ratification. Provenance: the shared-field
rounds of the setup-TUI rebuild — a configuration value rendered editable under two
sub-headings, then proposed as a read-only mirror; the maintainer adjudicated both away,
verbatim: "ADR-0002 -- a duplicated mirror/projection of a value is a type error and
refused on TUI start" — ledger rows 1112 and this append's own commit.)*

**Rule 3 — The navigation hierarchy is a claim of unique placement, and the claim is
typed.** A section tree asserts a partition of the configuration space: every fact has
exactly one address. Rendering one value under two headings — editable or as a
"convenience" mirror — falsifies that claim and mints a hidden dependency the operator
can only discover empirically (touch one widget, watch another twitch). This is not a
taste question; it is ADR-0012 P1 (one home per fact) applied to the presentation
layer, because the screen is storage for the operator's mental model, and a duplicated
widget is a denormalized projection owing a synchronization story no one was ever told.
The named external pedigree, recorded so no future reader mistakes this for one
maintainer's idiosyncrasy: unique placement / polyhierarchy-as-hazard (information
architecture), hidden dependencies (Green & Petre's cognitive dimensions), 1:1
control-to-variable mapping and the gulf of evaluation (Norman). Enforcement is NOT
review-only: a duplicated projection of one fact is a TYPE ERROR, refused loudly at UI
start, naming the fact and every section claiming it. The same defect appeared at the
model layer (flat-keyspace aliasing) and the presentation layer (mirrored fields) in
one build, one day: they are one class — two views bound to what should be one slot,
or one slot masquerading as two facts — and the class is closed at construction, at
both layers, not policed by eyes.

## 2026-07-22 — Provisional appendix attached (twenty proscriptions, blind-consult edition)

*(Dated append per ADR-0005 Rule 8.)* A codebase-blind consult's twenty UI proscriptions
are installed as a PROVISIONAL appendix (`0019-appendix-provisional-ui-proscriptions.md`,
retired the same day by the later append below — see git history for its text)
— binding defaults for new UI work, not ratified law; the appendix's own header carries
the maintainer's verbatim terms, the surface-conflicts-never-silent rule, and the
never-enforced-entries-get-culled condition. Ratification, amendment, or striking is a
future maintainer act informed by the phase-2 consolidation consult.

## 2026-07-22 — Companion adopted: the consolidated proscription set (C1–C29)

*(Dated append per ADR-0005 Rule 8; supersedes this file's earlier provisional-appendix
append of the same day.)* The two-phase consult's consolidated set of twenty-nine UI
proscriptions is adopted as this ADR's standing companion:
[0019-appendix-ui-proscriptions.md](0019-appendix-ui-proscriptions.md). The maintainer's
terms, restated as this ADR's own reading rule: **the companion's Synopsis section is
REQUIRED READING for anyone implementing UI work; the full rules and the critique are
consulted per good judgement.** The earlier provisional appendix (the blind consult's
twenty points) is retired in the companion's favor — every one of its rules survives
inside the consolidated set with provenance tags, so this retirement removes a
duplicate home, not content. The never-enforced-entries-get-culled condition carries
forward to the companion.

## 2026-07-22 — Rule 4 appended: the data topology is the UI's default information architecture

*(Dated append per ADR-0005 Rule 8, maintainer-commissioned the same day. Provenance: a
UI rendered the kernel's principal/competence/relation/charter hierarchy — dependent
entities, foreign-keyed to their parent — as four parallel flat lists; an ADR-0019 audit
holding companion rule C25 passed the structure because it applied C25 only at the
width of C25's minting specimen (a wizard). The class is one: navigation topology not
isomorphic to data topology.)*

**Rule 4 — For any UI over relationally-structured data, the data's conceptual
topology is a mandatory design input and the presentation's default shape.** Scope:
configuration, administration, and data-maintenance surfaces (this ADR's home genre) —
a task-oriented flow may deviate, and its deviation is a named decision under Rule 1,
not an exemption from asking. The correspondence, stated as questions the spec and the
review must both answer per surface: *what are this surface's entities, dependents,
associations, and derived projections — and does the navigation render that shape?*
The default bindings are the genre's own convergents (Naked Objects and its
scaffolding descendants — Rails admin, Django admin — are the worked prior art):
an entity gets one home surface; a dependent (foreign-keyed) entity is created and
edited within its parent's context, master-detail, never as a sibling flat list; an
association renders as a selection over the entities it joins, never as free text; a
derived projection gets a read surface and no editor; storage artifacts (junction
mechanics, hash chains, lineage columns) are owed no surface at all. The
entity/dependent/association/artifact roles are DECLARED per relation — a topology
charter, the write-side twin of the audit question — because the declaration is what
turns "is the UI isomorphic to the data?" from permanent judgment into a mechanical
check. Audits of such surfaces receive the data model (or the topology charter) as
mandatory input and answer the correspondence question per surface in writing —
applying the CLASS, not the specimen that minted it: a wizard over a product type and
a flat list over a dependency hierarchy are the same defect.

*Enforcement surface: spec-time (the topology-charter/correspondence answers are a
required part of a UI build basis in scope) and review with the charter in hand;
mechanizable per-binding where the section definitions and schema are both data —
each such gate a deliberate act, not presumed.*
