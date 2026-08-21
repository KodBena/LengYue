# History record — ADR-0011's two 2026-06-24 throughput-lab amendments (the commit-stamp net and the Witness-chain belief store)

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0011-mechanization-discipline.md` at commit `cce9272` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

*Zero-context orientation: these are the two dated 2026-06-24 amendments ADR-0011
(Mechanization Discipline) carried before the 2026-07-13 portability refactor, both native to
the `throughput-lab` testbed (a C++/Python transport-throughput testbed, distinct from the
chocofarm substrate `history/0011-chocofarm-context.md` records) and both worked instances of
Rule 2 (recurrence converts to a mechanism) and Rule 4 (a net quantifies over the class). The
first mints a commit-stamp net so an empirical reading always carries the code state that
produced it; the second mints an append-only belief store (a measurement is separate from an
interpretation of it, and interpretations supersede rather than overwrite). The parent ADR's
live body now carries a two-to-five-sentence Extraction Pointer summarizing both; nothing below
binds autoharn — it is kept as the dated evidence the current ADR's rules were generalized
from.*

---

### 2026-06-24 — Empirical readings carry their code state (the commit-stamp net)

A "+31%" throughput win (the greedy vs round-sync episodic driver) banked from a
single session failed to reproduce, and could not be pinned to a commit, on a
controlled re-measurement — an attributed reading with no record of the code that
produced it is **unattributable by construction**. This is the
invisible-at-authoring/visible-only-in-aggregate defect this tenet names, in the
empirical-measurement domain: the per-reading provenance was offloaded to the
operator's memory (anti-pattern G), and it decayed across the very first session
boundary.

Per **Rule 2** (recurrence → mechanism, not more prose) and **Rule 4** (a net
quantifies over the *class*, not the instance): the measuring harness itself
emits, on **every** reading, the git commit short-hash + tree state
(`clean | DIRTY`) of the checkout that produced it. A `DIRTY` tree marks a
non-reproducible artifact — the producer binary / harness may not match `HEAD`,
so the number is provisional until committed. The net keys on the class of *all
readings* (the harness stamps unconditionally), not on an enumeration of the ones
someone remembered to label.

- **Enforcement surface (Rule 1):** run-time, at the harness — the stamp is
  emitted with the number, not left to review or recall.
- **Measure-first (Rule 3):** the trigger was itself a measurement failure (an
  unreproducible bench delta), and the mechanism is the lightest proportionate
  one (two `git` reads), not a heavier provenance system.
- **Worked instances (one home, ADR-0012 P1):** `throughput-lab/harness/code_stamp.py`
  is the single Python home, imported by `coalesce_sweep.py`, `topology_sweep.py`,
  and `cpp/stage_a/overcommit_sweep.py`; `throughput-lab/harness/episodic_dps.sh`
  mirrors the same two `git` invocations inline.
- **Pairs with ADR-0009** (perf-investigation discipline): a captured bench number
  is now code-addressable — the sibling of ADR-0009's captured-bench requirement.

Provenance: the maintainer's contribution, 2026-06-24, during the throughput-lab
driver-attribution work.

### 2026-06-24 — The interpretation/belief layer (the Witness chain, mechanized)

A measurement is an immutable fact; an **interpretation** of it (the reading that
motivates the next code change) is a different kind of thing — mutable, frequently
wrong, and spanning a *set* of readings. The throughput-lab journal recorded its
interpretations as prose **Witness/Correction** entries (Witness 1: "+31% clean
driver win" → retracted → Witness 2: "regime-dependent +15%" → Witness 3: the full
2× attribution). That prose chain is exactly the load-bearing knowledge offloaded to
a form the code cannot enforce (anti-pattern G), and the wrong belief that motivated
banking the wrong default is the cost.

Per **Rule 2** (recurrence → mechanism) and **Rule 4** (a net over the *class* of all
interpretations, not the remembered ones): the belief layer moves into a queryable,
append-only store — `tlab_finding` (`throughput-lab/harness/exp_db.py`), a SEPARATE
table from the `tlab_reading` measurements, so the conflation the project has been
burned by (a reading-*of* the data recorded as the data) is **structurally
unrepresentable** (composing with ADR-0000). A finding carries `motivation` +
`interpretation`, a `status` in the closed vocabulary `{provisional, confirmed,
retracted}` (ADR-0008), the commit the belief was formed against (the commit-stamp
amendment above), and a `supersedes` link to the finding it corrects — the
Witness→Correction step, append-only (ADR-0005: the prior belief is never rewritten;
the current belief on a scope is the one nothing supersedes).

- **Enforcement surface (Rule 1):** write-time data constraint (the `CHECK` enum, the
  NOT-NULL interpretation, the immutable supersede-chain) + the discipline that
  *measurements auto-record but findings are deliberately authored* — an
  interpretation is a conscious, attributable act, not a side effect of a run.
- **Worked instance:** the Witness 1→2→3 chain is backfilled into the store, so the
  retracted "+31%" is itself queryable (`exp_db.py --findings`).
- **Pairs with ADR-0009** (the measured-vs-interpreted bar, amended there same day).

---

*End of the frozen verbatim quote. The section below is fresh commentary, written at extraction
time (2026-07-13), not part of the quoted record above.*

## Related

- **[ADR-0011 (mechanization discipline)](../0011-mechanization-discipline.md)** — the parent
  ADR this record was extracted from; its live body keeps its two 2026-07-02 amendments
  (mechanism-ships-with-first-fix; negative-control + shipped-binding) inline as normative and
  generic, and carries an Extraction Pointer summarizing this record's two amendments.
