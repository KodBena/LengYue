# History — ADR-0007's named oversized-file queue

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0007-file-size-and-information-density.md` at commit
> `ff691bb9bc430ad497d74ff82d580f758a969f99` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

The passage below is copied verbatim from the pre-refactor ADR-0007. It names
the specific oversized files a 2026-06-15 architectural audit found in the
source project, the refactoring queue those files entered, and the specific
column-width figure ("chocofarm's existing code runs to ~100-110") that
grounded the ADR's soft column cap.

## The named oversized-file queue and column-width grounding (pre-refactor Context and Decision)

chocofarm has real oversized files that the 2026-06-15 architectural audit
named. They are the refactoring queue this tenet's Neutral clause governs:

- `solvers/decomp.py` — **675 lines**. The audit is explicit that it is *not*
  the god-object its length implies — it is three honest layers (cluster
  decomposition, micro-solve, macro-plan). Its sins are elsewhere (frozen λ,
  re-derived env state), but its length still makes it a partial-visibility
  hazard under ADR-0004.
- `analysis/analyzer.py` — **605 lines**. Disciplined internally, but large;
  it also mixes presentation (`_print_report`) into analysis, a clean split
  seam.
- `hp/registry.py` (**715**), `az/exit_loop.py` (**510**), `az/parallel.py`
  (**451**), `hp/schema.py` (**449**), `az/features.py` (**389**),
  `az/mlp.py` (**360**).

Typical refactor moves in chocofarm: split presentation from analysis
(`analyzer.py`'s `_print_report`); lift a shared helper into the package base
(`solvers.base`'s `candidate_actions`, already done); separate the schema (the
typed contract) from the thin layer over it (`hp/schema.py` vs `hp/registry.py`,
already split this way).

Verbatim, the pre-refactor Decision section's density-heuristic parenthetical:
"Operational thresholds at review (qualitative — chocofarm has never measured
the ratio, so it is a review heuristic, not a metric)."

Verbatim, the pre-refactor Decision section's column-cap grounding: "**Soft
column cap:** ~100 characters (chocofarm's existing code runs to ~100–110;
beyond that even contracted content goes multi-line)."

Per the audit's own roadmap, several of the named files were slated for
content changes — `analyzer`'s presentation split, `exit_loop`'s `RunConfig` —
that would naturally shrink them.

## Related

- **[ADR-0007](../0007-file-size-and-information-density.md)** — the parent
  ADR; its generalized Context and Decision now carry the size/density/format
  rules stated language-generically, with the column-cap figure kept as a
  re-derivable-per-language example rather than a universal number, and a
  pointer to this file for the source project's own worked queue.
