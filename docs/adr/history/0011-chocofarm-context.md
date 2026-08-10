# History record — ADR-0011's chocofarm-era Context (the audit substrate and the FeatureLayout worked proof)

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0011-mechanization-discipline.md` at commit `cce9272` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

*Zero-context orientation: this is the entire chocofarm-era Context section of ADR-0011
(Mechanization Discipline) as it stood before the 2026-07-13 portability refactor — the
project's original substrate for the tenet, a numpy/JAX/numba AlphaZero-search codebase called
chocofarm, whose own 2026-06-15 architectural audit is what this section narrates. It names
the audit's anti-pattern G and lessons L2/L3, and the worked mechanism proof (`FeatureLayout`)
that the parent ADR's live Context now summarizes in an Extraction Pointer. Nothing below binds
autoharn; it is kept as the dated evidence the current ADR's rules were generalized from.*

---

## Context

chocofarm's characteristic failure mode is the **invisible-at-authoring,
visible-only-in-aggregate defect**, against which policy enforced by one
person's attention and memory is structurally weak — only mechanical nets
help. The 2026-06-15 architectural audit (`docs/notes/audit/`) is the
chocofarm proof of exactly this, from both directions:

- **The audit's anti-pattern G ("load-bearing knowledge offloaded to prose
  the code cannot enforce").** `ADR-0002` was cited 16 times as a binding
  convention with no registry to look it up in; a design doc was the de-facto
  spec while three of its specifics were STALE in the code implementing their
  successors; `consult-002 §4` was a dangling pointer to the simulation's
  heart. Prose disciplines decayed exactly as LengYue's RCA found.
- **The audit's L3 ("duplicated knowledge is a time-bomb whose fuse is the
  next edit").** The reference-rate anchor *already drifted* (`0.0941` vs
  `0.094`) — the fuse already lit once. A prose "keep these in sync" note
  could not have caught it; only a single owner (`BeliefRefs(env)`) can.
- **The audit's L2 ("the proof a codebase *can* do it right is the indictment
  when it doesn't").** `feature_dim(env)` (derive, zero drift) sits in the
  same package as three hardcoded reference constants (duplicate, already
  drifted). The mechanism works where it is applied; the rot is where it is
  not.

The tenet+mechanism pairing — not the describing document alone — is what
arrests recurrence. chocofarm has a worked proof: the feature-layout
triplication (the audit's sharpest landmine, a three-writer SSOT violation
that a reorder would silently mislabel) was converted from a prose hazard into
a mechanism — `FeatureLayout` (`az/features.py`), a single ordered block table
that the three former writers now read **by name**, with a fail-loud
partition check (`ADR-0002`) that the blocks contiguously cover `[0, dim)`.
The describing record (the audit) named the hazard; the mechanism removed it.

---

*End of the frozen verbatim quote. The section below is fresh commentary, written at extraction
time (2026-07-13), not part of the quoted record above.*

## Related

- **[ADR-0011 (mechanization discipline)](../0011-mechanization-discipline.md)** — the parent
  ADR this record was extracted from; its live Context now carries a two-to-five-sentence
  Extraction Pointer summarizing this record's lesson (prose disciplines decay; only a
  mechanism, keyed on the class rather than an enumerated instance, arrests recurrence).
