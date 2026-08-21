# History record — ADR-0000's four specimens and the contrast specimen

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md` at commit `8e2759d` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

*Zero-context orientation: this is the entirety of ADR-0000's (The Alpha and the Omega — Type-
Driven Design as the Foundational Law) Context specimens as they stood before the 2026-07-13
portability refactor — the tenet's first-person, dated substrate on the originating project's
`throughput-lab` testbed (a producer↔server↔consumer leaf-evaluation loop). Four dated defects
were each closed by a type that made the whole defect class unrepresentable, and one contrast
specimen (the reflex itself, caught in the act) shows what happens when the "how do I fix it"
question is asked instead of "what type forecloses this class." The parent ADR's live Context
now carries a five-sentence Extraction Pointer summarizing all five; Rules 1–3 (which cite "the
four specimens" and "the contrast specimen" by name) remain live in the parent and are not
reproduced here. Nothing below binds autoharn or any other adopting project; it is kept as the
dated evidence the tenet's rules were drawn from.*

---

### Specimen 1 — the oversize/wrong-width/wrong-dtype wire frame → `BoundedBatch`

A producer emitted a leaf-evaluation batch onto the wire that was oversize (more
rows than the server's `max_batch`), or the wrong width (a feature dimension the
server did not expect), or the wrong dtype. The frame was structurally legal as
*bytes* and detonated **three layers downstream** — past the wire, past the
coalescing intake, inside the server's forward — where the diagnosis was furthest
from the cause (the ADR-0002 hierarchy's whole point: fail at construction, not deep
in the first forward). The *"how do I fix it"* reflex produces a downstream guard:
a length check at the forward, a clamp, a defensive reshape. The **right** answer
was the question's answer: a refined wire type — **`BoundedBatch`** — whose validator
**makes the illegal shape unrepresentable at the boundary** (the Port/ACL of
ADR-0012 P2: a boundary *translates-and-validates*, it does not coerce). A
`BoundedBatch` that cannot be constructed from an over-`max_batch`, wrong-width, or
wrong-dtype buffer cannot reach the forward at all. The defect class is gone, not
guarded — ADR-0012's *illegal states unrepresentable* made concrete at the wire.

### Specimen 2 — the cross-layer counter category error → `CellLedger`

A health check compared counters drawn from three different layers — producer-batch
counts, wire-message counts, and consumed-row counts — as if they were one currency,
and **mis-flagged healthy cells** because the three are not commensurable (one
producer batch is N wire messages is M rows). This is precisely an **ADR-0008
category error**: a fuzzy match across an inadequate vocabulary, three distinct
units read as one. The *"how do I fix it"* reflex adds a fudge factor, a tolerance,
a special case for the cell that mis-flagged. The **right** answer was a type that
makes the only-meaningful comparisons the only-expressible ones: a **`CellLedger`**
reconciliation type that *owns* the three counters as distinct, typed quantities and
exposes exactly one verdict — so a cross-currency comparison is not a bug to catch
but a sentence you cannot write. The vocabulary was revised (ADR-0008's positive
register), structurally, at the type.

### Specimen 3 — the unbounded producer send queue → a byte-budgeted high-water-mark

A producer's send queue had no bound; under backpressure it grew until the process
was **OOM-killed at ~7 GB**. The *"how do I fix it"* reflex caps the queue at a
round number of *messages* (1000? 10000?) — a magic constant strewn as a bare literal
(ADR-0012 cancer F), arbitrary because the thing that actually exhausts memory is
*bytes*, not message count, and messages vary in size. The **right** answer was a
type whose bound is **derived from the one source that makes it meaningful**: a
**byte-budgeted high-water-mark** computed from the message size (ADR-0012 P1,
derive-don't-duplicate — the bound has one home and is computed, not guessed). The
queue refuses the write that would exceed the byte budget, loudly (ADR-0002), at the
boundary — and the OOM class is unrepresentable, not merely less likely.

### Specimen 4 — the unbounded coalescing intake → a bounded blocking queue

The server's coalescing intake (which gathers producer messages into a microbatch)
was likewise unbounded — the same disease at the consuming end. The **right** answer
was the same *kind* of answer: a **bounded blocking queue** whose capacity is a typed
invariant of the structure, so an intake that would overflow **blocks** (applying
backpressure) rather than growing without bound. The pattern across all four is one
pattern: every defect was a **design signal**, and the durable fix was a **type**,
not a patch.

### The contrast specimen — "fix the one blocking call"

The instructive negative is the reflex itself, caught in the act. Confronted with a
blocking call in the serve loop, the executor asked *"how do I fix this one blocking
call"* — and produced **two successive incomplete patches**, because each patch fixed
the instance in view and left the *shape* that permits the class untouched, so the
class re-surfaced one call over. Had the first move been *"what shape prevents a
blocking call from sitting on this path at all"*, one structural answer would have
closed it once. This is the same root as ADR-0013's attrition specimens — the patch
that asks "how to fix" instead of "what shape prevents this class" is the *execution*
sibling of the cut corner: it does the visible work and forfeits the durable work.

### Why this is the root, and why it is filed now

The four specimens are four instances of one missing reflex. The maintainer had to
inject the question by hand, repeatedly, because no document carried it — the trio
that *answers* it (0011/0012/0013) presumes it has already been asked. The cost of
that omission was the OOM kill, the mis-flagged cells, the three-layer detonation,
and the doubled patch — real time and real money. ADR-0013's edge is "finish what
was ratified"; ADR-0012's is "born in the right shape"; ADR-0011's is "mechanize the
recurrence." **None of them fires unless the contributor first asks the root
question.** This ADR makes the question mandatory and first.

---

*End of the frozen verbatim quote. The section below is fresh commentary, written at extraction
time (2026-07-13), not part of the quoted record above.*

## Related

- **[ADR-0000 (the alpha and the omega — type-driven design)](../0000-the-alpha-and-the-omega-type-driven-design.md)**
  — the parent ADR this record was extracted from; its live Context now carries a five-sentence
  Extraction Pointer summarizing all five specimens, and Rules 1–3 cite "the four specimens" and
  "the contrast specimen" by name as the worked forms of the two-question reflex.
- **The `throughput-lab` testbed** — the producer↔server↔consumer leaf-evaluation loop these
  five specimens occurred on; not held in this repository.
