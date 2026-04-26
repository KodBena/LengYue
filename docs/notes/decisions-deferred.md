# Deferred Decisions

Considered actions that were decided against, with rationale and
explicit triggers for revisitation. Distinct from `docs/TODO.md`
(active and queued work) and from `docs/adr/` (decisions that
fired and now shape forward authoring).

Per ADR-0005 Rule 6 (author as you decide): decisions against
action are decisions, and recording them at the moment of
deciding has the same payoff as recording the decisions that
fired. Without this record, a future contributor or future-self
reconstructs from absence — and absence is ambiguous, indistinct
between "considered and rejected" and "never thought of." The
distinction matters: the second invites speculative reopening;
the first gives the speculation an answer to argue against.

Each entry names the decision, the date, the rationale, and the
concrete conditions that would justify revisiting it. Entries
are not removed once their triggers fire — they're edited to
record the outcome of the revisit, preserving the original
rationale as context.

---

## Backend source-tree reorganization

- **Date:** 2026-04-26.
- **Considered:** Whether the backend's source tree should be
  reorganized to surface the domain-coupling axis introduced by
  ADR-0003 — for example, by partitioning files into bands
  (`core/`, `domain-agnostic/`, `domain-adapter/`, etc.) on top
  of the existing Clean-Architecture layering (`domain/`,
  `repositories/`, `services/`, `routers/`, `db/`, `core/`).
- **Decision:** No. The backend's source tree stays as-is.

### Rationale

The backend is already band-organized — by Clean Architecture
layer, with the Dependency Rule as the enforcement discipline.
Adding a domain-coupling axis on top would compete with the
existing layer-axis rather than complement it: the two
organizing principles want different things from the same
files, and layering them produces a directory tree where every
filing decision is a tradeoff between two real signals.

Beyond the conflict, the domain-coupling axis isn't currently
carrying useful information at the backend level. After items
34/34a/34b closed the wire-rename and schema-rename work, the
backend is genuinely domain-agnostic — `PositionNormalizerPort`
is the seam at which Go-specific behavior plugs in, and
"everything else" is the domain-agnostic core. Spatially
expressing this would mean a directory tree dominated by one
band (the agnostic core) and a single near-empty band (the
domain-coupled adapter). The information is real but doesn't
warrant the directory shape.

A companion concern worth recording: the failure mode opposite
to flat-subdirectory bloat is deeply-nested single-file
structures, where directories exist primarily as classification
brackets rather than as practical groupings. That failure mode
is at least as bad as flat-subdirectory bloat, and arguably
worse — flat directories slow navigation but stay legible;
deeply-nested classification brackets actively obscure what's
where. Reorganizing the backend in pursuit of an organizing
principle that doesn't have measurable per-directory pain to
justify it risks tipping toward this opposite failure for no
gain.

The discipline that's already in place — Hexagonal Architecture
imposing per-layer bounds — keeps the backend's directories
naturally limited in size. No directory currently has the
twenty-plus-files volume that ADR-0005 Rule 5's "file location
reflects content" discipline would flag for tactical
sub-organization. The architecture is doing the bounding work
that a filesystem reorganization would otherwise be required to
do.

### Triggers for revisitation

Three concrete conditions would justify reopening this
decision:

1. **A second domain implementation actually being planned.**
   Chess, Shogi, or any other concrete adopter — at that point
   the domain-coupling axis becomes a forcing function rather
   than an aesthetic choice, and spatially expressing it pays
   back across both implementations.
2. **A backend directory growing past the size threshold ADR-
   0005 Rule 5 implies worth flagging.** If `services/` or
   `repositories/` accumulates twenty files and starts feeling
   heterogeneous to navigate, tactical sub-organization becomes
   the trigger — at which point ADR-0003 banding is one of
   several organizing axes worth considering as the basis for
   the split.
3. **Measurable pain.** Bugs clustering at coupling boundaries,
   contributors confused about where to add new code, repeated
   "is this in the right directory?" review feedback. Concrete
   pain trumps speculative principle.

Absent one of these, the work consumes time without producing
visible improvement.

### Distinction from the frontend

A separate decision — whether to reorganize the frontend's
`composables/` and `components/` directories — is in flight at
the time this entry is recorded, and the answer there is
probably yes. That decision has different motivating factors:
single-author iteration without an enforcing architectural
discipline analogous to Hexagonal banding, and flat directories
that have grown to a size where measurable navigation friction
exists. If the frontend reorganization lands, the principle it
applies will likely be recorded as a new ADR.

The two decisions are independent because the two sub-projects
have different organizing pressures. The backend's Hexagonal
Architecture bounds directory size as a side-effect of the
discipline; the frontend's composable/component layering does
not.
