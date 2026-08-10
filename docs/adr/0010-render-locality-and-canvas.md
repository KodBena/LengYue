# ADR-0010: Render Locality and Canvas for Data-Dense Visuals

- **Status:** Accepted (generalized 2026-07-13, maintainer-ratified — his C6
  ruling, the sixth of ten adjudicated contradictions in the
  [ADR-portability refactoring spec's "§7 Contradictions register"](../../design/MAINT-ADR-PORTABILITY-SPEC.md#7-contradictions-register--adjudicated-maintainer-2026-07-13),
  executed under that same spec's tracker `adr-portability-refactor`, work
  package WP-1).
- **Genre:** Tenet, **UI-scoped**. This ADR binds only where a project
  concerns itself with a UI — a component tree, a render loop, and a
  browser/GUI surface. A project with no UI has no surface for this ADR to
  apply to (see Scope below), exactly as this slot's prior lineage record
  found for its own source project; that finding is preserved, not erased —
  see Related.
- **Date:** 2026-06-15 (source tenet); generalized 2026-07-13.
- **Provenance:** Descends from the LengYue ADR corpus's ADR-0010 ("Render
  Locality and Canvas for Data-Dense Visuals"), a Vue-SPA tenet. On the fork
  that first inherited this numbering, the tenet did not transfer (no UI
  existed there) and the slot was kept empty as a lineage entry — that
  record is preserved verbatim (see Related). This generalization asks a
  narrower question than "does it transfer to project X specifically": does
  the tenet's *content*, stripped of any one framework's vocabulary, state a
  rule any reactive-UI project can apply? Judged yes: render locality (read
  a high-frequency value as close as possible to where it changes) and
  canvas-over-per-datum-DOM (for data-dense visuals) are general UI
  performance disciplines, not Vue-specific — Vue's `readonly`/reactivity
  primitives and `v-for` are one framework's *vocabulary* for them, not the
  rule itself. This edition states the rule in framework-neutral terms and
  scopes it explicitly to UI-concerned projects.
- **Scope:** Binds **only** where a UI is concerned — a project with a
  component tree, a render loop, and a rendering surface (a browser DOM/
  canvas, a native GUI toolkit's widget tree, a terminal UI's redraw cycle).
  A project with no UI at all (a library, a CLI-only tool, a backend
  service, a numerical/simulation package) has no surface this ADR
  addresses; the rule is simply inapplicable there, not violated. Where a UI
  exists, this ADR binds regardless of the specific framework (React, Vue,
  Svelte, Angular, a native toolkit, or a hand-rolled render loop) — the two
  rules below are stated in framework-neutral terms precisely so a
  contributor need not translate them through any one framework's
  vocabulary.

## Context

Two related costs recur across reactive-UI frameworks, independent of which
framework is in use:

1. **Render locality.** A high-frequency reactive value — one that changes
   many times per second, or on every input/animation tick — incurs a cost
   proportional to how *far* it is read from where it changes: if a
   high-frequency value is read at a component high in the tree (or in a
   context/global store many components subscribe to), every update
   re-renders (or re-evaluates) the whole subtree beneath that read, even
   though only a small, local piece of UI actually needs the new value.
2. **Canvas over per-datum DOM for data-dense visuals.** A visual holding a
   large or high-frequency-updating collection of data points (a chart with
   thousands of points, a dense grid, a live-updating scatter/heatmap) costs
   one reconciliation/layout pass **per rendered node** when built as one
   DOM/SVG element per datum (`v-for`/`.map()` over the data). That per-node
   cost is invisible at authoring time — a chart with 50 points looks
   identical in code to one with 50,000 — and surfaces only under
   measurement, as the framework's reconciler chokes on node count or
   update frequency it was never asked to handle.

Both costs share the shape [ADR-0009 (performance investigation
discipline)](0009-performance-investigation-discipline.md) already names
for the non-UI register: invisible at authoring time,
catastrophic only under real data density or update frequency, and
preventable by a rule the author reaches for at design time rather than a
profiler finding after the fact.

## Decision

**Render locality.** Read a high-frequency reactive value as close as
possible to the component/subtree that actually consumes it — never at an
ancestor whose re-render/re-evaluation would needlessly propagate to
siblings or descendants that do not depend on that value. Concretely: push
the subscription to a high-frequency value down to the leaf component that
displays or reacts to it; do not read it in a shared ancestor, a top-level
container, or a broadly-subscribed store/context if only one small piece of
the tree needs it. The check: *does this component re-render on every tick
of a value most of its subtree ignores? If so, the read is too high in the
tree.*

**Canvas (or an equivalent single-surface draw) over per-datum DOM/SVG
nodes for data-dense visuals.** When a visual's data density or update
frequency is large enough that reconciling one element per datum becomes the
bottleneck (the threshold is measured, per
[ADR-0009](0009-performance-investigation-discipline.md)'s discipline — not
guessed), render it as a single draw surface (a `<canvas>` in a browser UI,
or the equivalent single-surface primitive in a native/terminal toolkit)
issuing one imperative draw call per frame, rather than one reactive
DOM/SVG/widget node per data point. The reconciler then costs one node, not
N; the visual owns its own redraw discipline instead of delegating N
per-datum diffs to the framework.

Both rules are checkable at review, not merely aspirational: *(a) does any
component read a high-frequency value further from its consumption point
than necessary? (b) does any data-dense visual reconcile one node per
datum instead of drawing to a single surface?*

## Consequences

### Positive

- **Both costs are named before they are measured.** A contributor designing
  a data-dense visual or a high-frequency reactive read has a rule to reach
  for at design time, rather than discovering the cost only after a
  profiler (or a user) finds it slow.
- **The rule is framework-neutral.** Because it is stated over "a reactive
  value" and "a data-dense visual" rather than any one framework's
  primitives, it transfers across React/Vue/Svelte/Angular/native-GUI/
  terminal-UI without translation.

### Negative

- **A UI-less project gains nothing from this ADR** — it is dead weight to
  read for such a project, which is exactly why the Scope field above says
  so plainly rather than forcing an inapplicable rule to look applicable.
- **Convention, not mechanism.** Like the copy-on-write seams
  [ADR-0001](0001-immutability-and-copy-on-write.md)'s retired record
  described, neither rule here is compiler- or framework-enforced; a
  violation is caught by review or by a profiler after the fact
  ([ADR-0009](0009-performance-investigation-discipline.md)'s discipline is
  the backstop), not by construction.

## Not goals (explicit)

- **Not a claim that every reactive value must be read at the leaf.** A
  value that changes rarely (a user's name, a static config) has no locality
  cost; the rule binds high-*frequency* values specifically.
- **Not a claim that every list must be canvas-rendered.** A list of tens or
  low hundreds of items rendered per-datum is normally fine; the rule binds
  where density or frequency is large enough to matter, measured per
  [ADR-0009](0009-performance-investigation-discipline.md), not assumed.
- **Not applicable outside a UI at all** — see Scope.

## Related

- **[`history/0010-lineage-not-applicable-record.md`](history/0010-lineage-not-applicable-record.md)** —
  **Extracted record — the prior lineage entry.** *(moved verbatim; superseded
  in this live slot by the generalization above, per the maintainer's C6
  ruling — see the Status field above for what "C6" names, and the
  [refactoring spec's §7/§8](../../design/MAINT-ADR-PORTABILITY-SPEC.md#7-contradictions-register--adjudicated-maintainer-2026-07-13)
  for the ruling itself and the work package that executed it.)* The slot
  was previously kept empty on the honest finding that this tenet had no
  surface in the fork that inherited it (no UI existed there — a numpy/JAX/
  numba operations-research package): rather than invent a strained analog
  to fit a project with no UI, the record simply said so, preserving the
  corpus's numbering continuity. That finding was correct for its own
  project and is not overturned; this generalized edition instead answers a
  different question — whether the underlying tenet is real and portable
  *for any project that does have a UI* — and rewrites the slot from that
  finding.
- **[ADR-0009](0009-performance-investigation-discipline.md) (performance
  investigation discipline).** Both rules above are named because their
  costs are invisible-until-measured, exactly ADR-0009's register; a claim
  that either rule was needed (or that a violation is costly) is
  substantiated the same way ADR-0009 requires.
- **[ADR-0008](0008-classification-discipline.md) (classification
  discipline).** The refusal to force a fuzzy match when a tenet has no
  surface (the prior lineage record's reasoning) and the refusal to
  under-generalize a tenet that genuinely does transfer (this record's
  reasoning) are the same discipline's two directions.

## License

Public Domain (The Unlicense).
