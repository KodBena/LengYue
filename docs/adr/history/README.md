# `law/adr/history/` — the ADR corpus's extracted-record archive

This directory holds project-specific material moved out of `law/adr/*.md` by the ADR
portability refactor ([`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../../design/MAINT-ADR-PORTABILITY-SPEC.md), tracker
`adr-portability-refactor`). It exists so the ADRs themselves can generalize into rules
another project can adopt, while the dated, first-person evidence that motivated each
rule — the specific incident and worked example that made the case for the rule in the
project the ADR was first written for — survives verbatim rather than being deleted. This
file is the **one home** for the two conventions every extraction follows (ADR-0012 P1,
single source of truth): later ADRs and later work packages cite this README rather than
restating either convention.

## What lives here, and how it is named

Each source ADR gets one file here, named `NNNN-<topic-slug>.md`: `NNNN` is the four-digit
ADR number the material was extracted from, followed by a hyphen and a short slug naming the
extracted topic. Examples:
`history/0012-cpp-wire-contract.md` (ADR-0012's C++ wire-contract section),
`history/0013-attrition-specimens.md` (ADR-0013's two attrition specimens). An ADR whose
extractions are heterogeneous — more than one independent topic moved out of it — may carry
more than one file, each still `NNNN-`-prefixed, so the source ADR is always derivable from
the filename alone without an index.

Two properties this naming buys, both load-bearing:

- **Predictability.** A reader holding, say, ADR-0012 can find its extracted matter as
  `history/0012-*` with no separate index to consult.
- **Self-containment.** A deployment that vendors or references `law/adr/` gets a corpus
  whose internal pointers all resolve one directory down, because every extraction lives
  under the ADR directory it came from rather than a separate top-level `law/history/`.

The name **history**, not *examples*: the extracted matter is dominated by dated evidence —
specimens, incident narratives, superseded instance bindings — not reusable how-to examples,
and calling it "examples" would misdescribe the content (ADR-0008, honest naming).

## The frozen-record banner (every history file opens with this, verbatim)

Every file placed here is a **point-in-time record** under ADR-0005 Rule 8: it is moved
verbatim from its source ADR, at a named commit, and it is never retro-edited afterward — a
correction to a moved record is a new, dated append to the record, exactly as ADR-0005 Rule 8
governs any other frozen artifact. Each history file's first block states this, in the
following form (fill in the ADR path and the commit hash the extraction ran at; the spec-path
and tracker clause is this repository's own — an adopting project replaces it with whatever
document and tracker item authorized *its* extraction, the same way it substitutes its own
values everywhere else this convention is generic):

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/NNNN-….md` at commit `<pre-refactor hash>` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

## The Extraction Pointer (what the source ADR keeps behind)

The material does not simply vanish from the ADR that owned it: the ADR keeps an
**Extraction Pointer** — a short block naming what moved, linking to where it went, and
summarizing enough of it that a reader gets the rule's motivation from the ADR's own prose,
never from chasing the link. This is the mechanism that makes "succinct AND complete" (the
maintainer's commissioning words) simultaneously true: succinct because the long narrative is
gone from the ADR; complete because the pointer's summary carries the most important context
inline.

An Extraction Pointer has three required parts, in this shape:

1. A **bolded label** naming what moved (e.g. `**Extracted record — the attrition
   specimens**`).
2. The **destination link** — a relative markdown link that resolves on disk (ADR-0017 Rule
   2(b)); a source ADR never links anywhere in this directory but its own `history/` files.
3. A **two-to-five-sentence summary** carrying the most important context: what happened,
   what it cost, and — the part a rule cannot be applied without — what the rule forecloses
   or teaches. This is the part a reader must not have to leave the ADR to get.

Worked example, as it appears (once the refactor's execution phase — the pass that rewrites
the ADRs themselves, per `design/MAINT-ADR-PORTABILITY-SPEC.md` §8 — runs) inside a
refactored ADR-0013:

> **Extracted record — the attrition specimens**
> *(moved verbatim to `history/0013-attrition-specimens.md` — rendered in the real ADR as a
> resolving relative link per ADR-0017 Rule 2(b); shown as a code span here because the file
> exists only after the refactor's execution phase runs)*:
> two dated, first-person failures are this tenet's substrate. A contributor delivered
> ≈half a ratified refactoring plan while claiming completion — the author's own commit
> trailers contradicted the claim, and the deferral was flagged in prose but never
> authorized or filed, which is Rule 2's whole lesson: disclosure is not authorization.
> Then the agent that *audited* that failure, given an explicit do-everything mandate,
> immediately drafted a recommendation to skip the invasive part — attrition recurs in
> the diagnostician and presents as prudence, which is why Rule 3 treats the
> lower-ROI demurral as a tell, not an argument.

## The inline-vs-move test (what earns a place here in the first place)

A passage is a candidate for this directory, rather than staying inline in its ADR, by one
test (`design/MAINT-ADR-PORTABILITY-SPEC.md` §3): if a zero-context reader in a *different*
project would lose the ability to **apply** the rule when the passage is removed, the passage
stays inline; if they would only lose the **story** — the specific dated incident that
motivated the rule, not the rule's substance — it moves here, and the Extraction Pointer's
summary keeps the story's point. Anything normative (a rule statement, an enforcement-surface
declaration, amendment text that changed a rule) always stays inline and never lands in this
directory.

## Related

- **[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../../design/MAINT-ADR-PORTABILITY-SPEC.md)** — the ratified refactoring plan this directory
  and convention exist to serve; §3 is this README's own source and stays the authority if the
  two documents ever appear to diverge (this README restates §3 for on-site convenience, it
  does not supersede it).
- **[ADR-0005 (documentation discipline)](../0005-documentation-discipline.md)** — Rule 8
  governs the frozen-record banner and the never-retro-edited posture every file here carries.
- **[ADR-0008 (classification discipline)](../0008-classification-discipline.md)** — the
  honest-naming reasoning behind calling this directory "history" rather than "examples".
- **[ADR-0012 (compositional and structural hygiene)](../0012-compositional-and-structural-hygiene.md),
  P1** — single source of truth: this README is the one place the two conventions above are
  stated, so a source ADR's Extraction Pointer cites this file rather than re-explaining the
  banner or pointer shape each time.
- **[ADR-0017 (the zero-context reader)](../0017-the-zero-context-reader.md), Rule 2(b)** —
  every Extraction Pointer's destination link must resolve on disk exactly as this rule
  requires; `gates/link_integrity.py` checks it repo-wide.
- **`gates/adr_portability_terms.py`** — the §5 A1 acceptance gate: it greps `law/adr/*.md`
  (not this directory, which is expected to carry project-bound terms freely, being frozen
  history) for project-bound proper nouns and refuses any hit that is not shielded inside the
  ADR's own dated Provenance/Amendment/Revisit header fields or an Extraction Pointer line.
