# History record — ADR-0014's throughput-lab specimen (the wedge, diagnosed twice, wrong both times)

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0014-executor-second-opinion.md` at commit `0f7b3e4` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

*Zero-context orientation: this is the entirety of ADR-0014's (Request a Second Opinion When
a Problem Resists Resolution) Context specimen as it stood before the 2026-07-13 portability
refactor — the tenet's first-person, dated substrate, native to `throughput-lab`, a
clean-room synthetic-load testbed chocofarm used to isolate a `producer → boundary → server →
reply` path from its tree search. An LLM executor diagnosed a server "wedge" as "one blocking
call" and applied that same frame twice, each fix plausible and committed, the wedge
persisting both times — never reframing the diagnosis itself. The parent ADR's live Context
now carries a two-to-five-sentence Extraction Pointer summarizing this specimen; Rules 1–4
(which reason from it) remain live in the parent and are not reproduced here. Nothing below
binds autoharn or any other adopting project; it is kept as the dated evidence the tenet's
rules were drawn from.*

---

### Specimen — the diagnostician on `throughput-lab` (this session's record)

The substrate is first-person and fresh, native to the `throughput-lab` testbed
(`throughput-lab/` — the clean-room synthetic-load testbed that isolates the
`producer → boundary → server → reply` path from the tree search). An LLM
executor was tasked with resolving a **server "wedge"**: under a producer flood,
the Python server's IO thread blocked and throughput collapsed. The executor's
diagnosis was "find the one blocking call," and it executed that diagnosis,
faithfully and in the honest register, *twice*:

1. **First fix — the unbounded socket-drain loop.** The receiver drained the
   inbound socket without bound; the executor bounded it. Plausible, defensible,
   committed. **The wedge persisted.**
2. **Second fix — the blocking reply-send.** With the drain bounded and the
   wedge still present, the executor re-applied the *same frame* to a different
   call: the reply path's send blocked; the executor made it non-blocking.
   Plausible, defensible, committed. **The wedge persisted.**

Each attempt addressed *a* real call and was, in isolation, a reasonable change.
But the diagnosis — "the wedge is one blocking call, find it" — was itself the
frame, and the frame was wrong (or at best incomplete), and **the executor never
left it.** Attempt three would have been a third blocking call. The faculty that
should have asked "is this even the right kind of problem?" was the faculty that
had committed to the frame, and it did not ask.

A second, independent opinion **at the point of the second failed attempt** —
given the problem and the evidence but *not* led down the "one blocking call"
path — would, at minimum, have surfaced that the diagnosis kept proving partial,
and quite possibly have broken the lock outright by proposing a different frame
(a structural overlap problem, a back-pressure problem, a contention problem —
something the locked executor could not see because it was standing inside the
lock). The maintainer, commissioning this ADR, characterized the *absence* of a
guideline that would have triggered that second opinion as an **executive
dereliction** — one the recurring thrash made expensive in both compute and
money. That characterization is recorded here as the honest, dated provenance,
not softened.

*(Point-in-time, per ADR-0005 Rule 8. The throughput-lab investigation has since
advanced; this specimen is the frozen record of the *conduct* — the lock and the
recurrence — not a claim about the current state of the wedge. The conduct is the
durable fact this tenet is shaped against; the specific call sites are not
asserted as still unfixed.)*

---

*End of the frozen verbatim quote. The section below is fresh commentary, written at extraction
time (2026-07-13), not part of the quoted record above.*

## Related

- **[ADR-0014 (executor second opinion)](../0014-executor-second-opinion.md)** — the parent
  ADR this record was extracted from; its live Context now carries a two-to-five-sentence
  Extraction Pointer summarizing this specimen, and Rules 1–4 reason from it directly (the
  observable-recurrence trigger of Rule 2 is stated in exactly these terms: two mis-targeted
  attempts on the record, not a feeling).
