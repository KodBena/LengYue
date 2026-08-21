# ADR-0001: Immutability, Copy-on-Write, and Rebind-not-Mutate (Tombstone)

- **Status:** Retired-to-history (maintainer-ratified 2026-07-13, tracker
  `adr-portability-refactor`, work package WP-1 of that tracker's
  [refactoring spec](../../design/MAINT-ADR-PORTABILITY-SPEC.md) — closing
  the retirement question that spec's "§9 What this spec does NOT do"
  section had left open).
- **Genre:** Tombstone — a record whose job is only to mark that the ADR-0001
  slot is retired, kept empty of live rule content so number-stability holds
  (the ["§6 Topology, renaming, renumbering" section, rule
  R2](../../design/MAINT-ADR-PORTABILITY-SPEC.md#6-topology-renaming-renumbering-per-amendment-item-1)
  of the same refactoring spec): external citations of "ADR-0001" still
  resolve to a real file at this path.

*Refactored for cross-project portability on 2026-07-13 under
[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../design/MAINT-ADR-PORTABILITY-SPEC.md)
(tracker `adr-portability-refactor`, maintainer-ratified 2026-07-13). The
pre-refactor text stood verbatim at commit
`ff691bb9bc430ad497d74ff82d580f758a969f99`; it is relocated, not deleted, to
[`history/0001-immutability-and-copy-on-write.md`](history/0001-immutability-and-copy-on-write.md)
and is not retro-edited there.*

## Why this ADR is retired rather than generalized

The retired ADR-0001 recorded a specific technical **Decision** (its own
Genre field said so, not a cross-cutting tenet): three named seams in one
project's numpy/JAX/numba package —
(1) an immutable "belief world-set" (a set of possible-world hypotheses a
filter narrows down, returning a fresh copy rather than mutating the
caller's set), (2) a "scenario/restriction copy-on-write env" (an
environment object that clones itself cheaply when a scenario parameter
changes, instead of rebuilding expensive shared state), and (3) a float32
inference cache invalidated by rebinding its source weight object rather
than by any writer explicitly telling it to invalidate. The full detail of
all three lives verbatim in the relocated record linked under Related below.
No rule among them transfers that
[ADR-0012](0012-compositional-and-structural-hygiene.md) (its P1
single-source-of-truth principle, P2 seam discipline, P4 live-not-frozen
principle) and [ADR-0002](0002-fail-loudly.md) (fail loudly) do not already
state generically. Retiring it — rather than forcing a generic
"immutability" tenet out of seams too instance-bound to survive their own
fork — is the honest disposition, the same refusal-of-a-strained-fit
[ADR-0008](0008-classification-discipline.md) names, and the same move the
former ADR-0010 modeled for a different lineage tenet before its own
2026-07-13 disposition (see
[the current ADR-0010](0010-render-locality-and-canvas.md) and its own
[relocated lineage record](history/0010-lineage-not-applicable-record.md)).

## Related

- **[`history/0001-immutability-and-copy-on-write.md`](history/0001-immutability-and-copy-on-write.md)** —
  the full retired record, verbatim.
- **[ADR-0002](0002-fail-loudly.md) (fail loudly), [ADR-0012](0012-compositional-and-structural-hygiene.md)
  P1/P2/P4** — the generic rules a future contributor facing a similar
  immutability/copy-on-write question should reach for; nothing in the
  retired record adds to them.

## License

Public Domain (The Unlicense).
