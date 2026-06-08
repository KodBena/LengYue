# Design notes

Planning records for units of work — the "why and how" behind a feature or
refactor, authored before/as the work is decided. Extracted from the flat
`docs/notes/` root once design notes grew numerous enough to be a category
rather than a guess (ADR-0005 Rule 5; the classification threshold ADR-0008
governs).

**Normative standard: ADR-0005 Rule 9 (design notes are SSOT-anchored).** In
brief:

- **SSOT-anchored.** Every design note is referenced by exactly one owning
  work-status SSOT item (in the `todo` Postgres store) via a `design-note`
  ref, and is not authored without it. The note carries a one-line header
  pointer:

  ```
  > SSOT: `<item-id>`
  ```

- **Status delegated.** A design note has no per-note `design-note: <status>`
  marker. Its lifecycle *is* its owning item's state — query it:
  `psql -h 192.168.122.1 -d todo -c "SELECT state, resolution FROM items WHERE id='<item-id>'"`.
  (Status in one place; the note delegates — ADR-0005 Rule 1.)

- **Retirement.** When the owning item closes, that closure is the retirement
  signal — query the work-status store for `design-note` refs whose item is
  `closed`; such a note is an archival candidate and moves to
  `docs/archive/notes/design/`. Advisory, not a gate — archival is editorial
  and costs a cross-reference audit.

- **Revision.** Superseding a note preserves the original and authors a
  sibling (ADR-0005 Rule 8); the relation is carried by the SSOT
  (`superseded_by`) + a cross-link, not a `design-note: revised` marker.

**Transition note.** Notes relocated here from the pre-consolidation flat root
are being brought to this standard incrementally; some still carry legacy
`design-note: <status>` markers and may lack an SSOT anchor. Those are tracked
by the retirement advisory's sunsetting allowlist until anchored, implemented,
or retired (ADR-0005 Rule 7). New design notes follow Rule 9 from the start.

License: Public Domain (The Unlicense).
