# ADR-effectiveness audits

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `adr-effectiveness-audits` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='adr-effectiveness-audits'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-04-26.
- **Concern:** The seven ADRs (especially the four tenets:
  ADR-0002, ADR-0004, ADR-0005, ADR-0006, with ADR-0007 newly
  proposed) are policy, not mechanism. Their adoption is assumed,
  not measured. A periodic audit pass — "where in the codebase
  does this tenet not currently hold, and why" — would surface
  drift before it ossifies. ADR-0002 is the most overdue: a
  codebase-wide sweep for silent retries, swallowed errors,
  sentinel-instead-of-throw, ACL-coercion-instead-of-validate,
  and empty catches has not been done since the tenet was
  adopted. ADR-0007 will need its own audit once accepted (file
  size, density, formatting compliance). The discipline itself is
  ADR-shaped: an ADR-0008 or similar that prescribes how and when
  ADRs get audited would close the loop.
- **Suggested next action:** Decide whether the audit cadence is
  itself an ADR (likely yes) or an ad-hoc TODO item per ADR
  (likely no — too easy to forget). Probably an ADR that
  prescribes a per-tenet audit checklist, an audit ledger
  destination, and a cadence trigger (every N months, or every
  major umbrella event).
- **Maintainer decision (2026-06-01).** Acting on the RCA
  (`rca-discipline-lapses-2026-06-01.md`), the maintainer settled this
  audit's doc-consolidation leg: consolidate the three status-bearing docs
  (this ledger, `TODO.md`, `handoff-current.md`) onto a single
  machine-readable work-status SSOT that `TODO.md` *projects* from (RCA guard
  G5; the doc-graph's manifest-first shape), with a forward-compatible
  best-effort schema since future items are unknown-unknowns. Broader
  recognition: the whole doc-graph wants consolidation on several fronts and a
  *mandated* reorganization discipline — doc retirement, taxonomy, and a
  hierarchy for `docs/notes/` (now flat past honesty). Scheduled as a future
  arc; deliberately not actioned 2026-06-01 (single-maintainer
  decision-capacity is the live constraint the RCA names). Recorded here so the
  decision does not live only in memory — the exact failure the RCA documents.

---

License: Public Domain (The Unlicense).
