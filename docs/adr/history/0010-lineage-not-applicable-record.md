<!-- doc-attest-exempt: point-in-time record per ADR-0005 Rule 8, extracted verbatim and never retro-edited (law/adr/history/README.md's frozen-record banner); same exclusion class as BACKLOG.md's dated entries per design/ORCH-ABC-AUDIT-LOOP-RECIPE.md "What the loop does not do" -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0010-render-locality-not-applicable.md` at commit
> `ff691bb9bc430ad497d74ff82d580f758a969f99` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`,
> WP-1, C6 ruling — ledger row 370). Not retro-edited; this is chocofarm's own
> "the LengYue tenet does not transfer here" judgment, superseded in the live
> slot by a generalized, UI-scoped ADR-0010 written from the same source
> tenet's summary, per the maintainer's ruling that the summary supports a
> generic statement. The live slot is
> `law/adr/0010-render-locality-not-applicable.md`.*

---

# ADR-0010: Render Locality and Canvas — Not Applicable (Lineage Entry)

- **Status:** Accepted (as a lineage record; no chocofarm decision is taken
  here)
- **Genre:** Lineage entry — preserves corpus-numbering continuity with the
  LengYue ADR corpus this project forked.
- **Date:** 2026-06-15
- **Provenance:** LengYue's ADR-0010 ("Render Locality and Canvas for
  Data-Dense Visuals") is a Vue-SPA frontend tenet: it governs where a
  high-frequency reactive value may be read in a component tree, and when a
  data-dense visual must be a `<canvas>` rather than a `v-for` of DOM/SVG
  nodes. Both rules are specific to a reactive UI framework rendering to a
  browser.

## Why this slot is kept but empty

**chocofarm has no UI.** It is a single numpy/JAX/numba operations-research
Python package — a simulation environment, a set of solvers, an AlphaZero
stack, a provable bound, an eval suite, and a docs corpus. There is no Vue, no
component tree, no reactive render loop, no `<canvas>`, no DOM. LengYue's
ADR-0010 has no surface to apply to here.

Per the fork-adaptation discipline (ADR-0008: refuse a fuzzy match against an
inadequate vocabulary), the honest move is **not** to invent a strained
chocofarm "render locality" analog that fits nothing — that would be exactly
the synthetic-fabrication failure ADR-0008's negative register forbids. The
honest move is to record that this LengYue-lineage tenet does not transfer,
and to keep the number stable so the corpus numbering stays aligned with its
source (the code cites other ADRs by number; numbering continuity is a real
property to preserve).

## The nearest chocofarm concern

The *spirit* of LengYue's ADR-0010 — a cost that is invisible at authoring
time and surfaces only under measurement, prevented by a name the author
reaches for and a reviewer checks against — does have a chocofarm home, but
it is **ADR-0009 (performance investigation discipline)**, not a render rule.
chocofarm's invisible-until-measured costs live in the search/forward hot path
(the per-component `bench_hotpath` regression guard, the float32/numba
behavioral-equivalence bar, the forward `ABS_TOL = 1e-4` contract). A
contributor looking here for "the rule that prevents a silent hot-path cost"
should read ADR-0009.

## Consequences

- **Numbering is stable.** ADR-0002 and ADR-0004 are cited by number in
  chocofarm's code; keeping the full 0001–0011 numbering aligned with the
  LengYue lineage avoids any renumbering that would invalidate those
  citations or future ones.
- **No discipline is imposed.** This entry adds no chocofarm rule. It is a
  signpost.

## Related

- **ADR-0009 (performance investigation discipline).** The chocofarm tenet
  that carries the nearest concern — invisible-until-measured cost,
  captured-and-reproducible substantiation.
- **The LengYue ADR-0010** — the source tenet, recorded here as not
  transferring, per the fork-consumption discipline in `docs/adr-synopsis.md`
  ("How a fork consumes this corpus").

## License

Public Domain (The Unlicense).
