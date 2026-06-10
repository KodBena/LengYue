# ADR-0010: Render Locality and Canvas for Data-Dense Visuals

- **Status:** Accepted
- **Genre:** Tenet (cross-cutting authoring discipline) — the
  eighth tenet in this codebase, after ADR-0002 (fail-loudly),
  ADR-0004 (minimal-touch), ADR-0005 (documentation discipline),
  ADR-0006 (source-file headers), ADR-0007 (file size and
  information density), ADR-0008 (classification discipline), and
  ADR-0009 (performance investigation discipline). Sibling of
  ADR-0009: where ADR-0009 is the *reactive* net (a profile catches
  the cost after it ships), this tenet is the *preventive* name
  (the author reaches for the rule at the keyboard, and review has
  a name to check against). It governs two structural choices that
  no existing tenet named — where in the component tree a
  high-frequency reactive value may be read, and when a data-dense
  visual must be a `<canvas>` rather than a `v-for` of DOM/SVG nodes.
- **Date:** 2026-05-31
- **Amendments:** 2026-06-10 — deleted the two trailing
  harness-envelope artifact lines (a literal `</content>` /
  `</invoke>` pair leaked from a tool-call envelope, committed with
  the ADR's creation and surviving three later edits) and corrected
  the render-count harness path in the Consequences section
  (`tests/integration/render-locality/` →
  `tests/integration/render-count/`, the directory's actual name).
  A whole-line grep for harness-envelope strings under `docs/` now
  gates in the `doc-graph-ci` workflow so the artifact class cannot
  silently recur. No content change. One of the bounded ADR record
  repairs from the 2026-06-10 history-lessons audit
  (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.23;
  work-status item `adr-record-amendments-2026-06`).
- **Scope:** All `frontend/` Vue component and composable authoring.
  The two rules apply at authoring time (which element type, where
  the reactive read lives) and at review time (a reviewer checks a
  new composition node or a new data-bound visual against them).
  The render-locality rule has analogues wherever a reactive
  framework couples a render to a read; this ADR scopes it to the
  Vue SPA where the recurrences happened.

## Context

Two anti-patterns recurred across the perf arcs of 2026-05-27
through 2026-05-31 — each *after* the codebase had already paid to
learn the principle once, because the principle lived as a cited
precedent in worklogs rather than as a named tenet the next
keystroke had to consult.

### The render-coupling recurrence

`docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`
spent ~300 lines naming the first pattern: **a component whose job
is orchestration / layout / chrome reads a high-frequency reactive
value in its render, coupling a whole subtree's re-render to that
value's update frequency.** It found four instances (two fixed at
the time, one open, one milder) and proposed — as its
Recommendation 1 — a "reactive-read locality" tenet (candidate
ADR-0010 or a `frontend/CLAUDE.md` section), explicitly deferred
for the maintainer's sign-off.

The tenet stayed un-adopted, and within days the pattern recurred —
`TreeWidget`, in the 2026-05-31 "green" arc. The component had
*already been partially hardened*: the active-node ring was pulled
out of the node `v-for` into a standalone `<circle v-if>`, and
edges/nodes carried per-item `v-memo`. Someone had internalised
"decouple the high-frequency element." But the standalone circle
was *still bound reactively in the template* (`activeRingPos →
currentNodeId`), so every navigation re-read it and re-ran
`TreeWidget`'s entire render function — the full `v-for` over edges
and nodes, evaluating every `v-memo` key for hundreds of nodes. The
`v-memo` spared the *patch* (59.8 ms) but not the *render* (762 ms —
the single biggest JS cost in the Chrome capture). The fix made the
ring fully imperative (a `<circle ref>` with `cx/cy/display` set in
a `watch`), so the template reads nothing nav-reactive and
`TreeWidget` renders only on tree-structure change.

That is the proof the postmortem could not supply on its own: a doc
that *describes* a pattern does not stop it recurring one component
over. The name has to be a tenet the author reaches for and the
reviewer checks against.

### The DOM-per-data-point recurrence

`HeatmapChart` had been rendered on `<canvas>` precisely because
"many tiny cells in a fixed area with no per-cell layout or
hit-test is a canvas job, not a DOM job." The principle existed —
but as a one-off, never generalised. So `BoardTab`'s analysis-depth
rugplot shipped as one `<div class="meter-slice">` per path move
(each with a per-slice i18n `:title`), and
`HorizontalTimelineVisualizer`'s data track shipped as one
`<linearGradient><stop>` per turn plus one `<rect>` per segment.
For a ~340-move game that is ~340 vnodes plus ~340 i18n
interpolations rebuilt *per render* — and because both templates
*read the data array*, every analysis update re-rendered the whole
component (the read-locality rule's other face). `BoardTab` was the
single most expensive component render in combined-stress (782 ms);
the timeline was #2 (304 ms). The meter is an 86×4 px strip: each
slice is sub-pixel and non-interactive — the per-slice DOM
granularity bought nothing. The fixes are canvas draws in a `watch`
off the render path, citing the `HeatmapChart` precedent each time.

Neither recurrence was negligence. Both costs are invisible at
authoring and typecheck time and degrade smoothly with game length,
so no manual eyeball and no `vue-tsc` pass catches them — they
surface only under a profiler (the silent-failure class ADR-0002
names, in the performance register ADR-0009 makes visible). The gap
is the absence of a *preventive* name, not a failure of review
diligence: review cannot catch what nothing taught it to look for.

## Decision

We adopt two named rules as a codebase-wide tenet for frontend
authoring.

### Rule 1 — The canvas rule (data-dense fixed-size visuals)

A fixed-size visual whose element count scales with the data and
that has no per-element layout or hit-test is a `<canvas>` job, not
a `v-for` of DOM/SVG nodes. The authoring-time question:

> *"Does this `v-for` produce sub-pixel or non-interactive elements
> at realistic data sizes?"*

If yes, draw on a canvas. The worked shape: a static `<canvas>` in
the template, dimensions cached from a `ResizeObserver`, the draw
issued imperatively in a `watch` so it stays off the render path
(see ADR's Rule 2 corollary on read locality, and the
imperative-escape pattern in `frontend/CLAUDE.md`). `HeatmapChart`
is the precedent; the `BoardTab` rugplot and the timeline data
track are the generalisations.

### Rule 2 — The read-locality rule (where a reactive read lives)

A component reads a high-frequency reactive value (a per-navigation
cursor field, a per-packet analysis derivation, a per-tick engine
metric) **only if its own job is to display it.** Orchestration,
chrome, and composition nodes read structural or low-frequency
state and let leaves self-source — via an accessor (`() => T`) at
the boundary so the subscription is established only where the leaf
invokes it inside its own tracking scope, or via an imperative
escape (a `ref` plus a `watch` that writes the element directly).

The distinguishing test is **role, not mechanism**: "does this
component exist to *display* this value, or to *compose* other
components?" A leaf reading the cursor is correct; the composition
root reading the cursor is the bug.

**Corollary (the trap `TreeWidget` fell into, stated verbatim
because it is the exact lesson the prior postmortem under-stated):**

> *`v-memo` and "pull the element out of the loop" fix the patch,
> not the render; a reactive read anywhere in a template re-runs
> the whole render function; render ≫ patch is the tell.*

`v-memo` and pulling an element out of a `v-for` short-circuit the
subsequent *diff* (the patch). Neither touches the *render*: Vue
re-runs a component's entire render function whenever any reactive
value that render read changes, regardless of where in the template
the read sits. So the only fix for render-coupling is to stop the
composition node's render from reading the high-frequency value at
all — accessor-passing or imperative escape — not more memoisation.
Per ADR-0009's measurement method, `render` ≫ `patch` in a
component-cost ranking is the signature that diagnoses it.

## Consequences

### Positive

- **The hard-won lessons live where the next keystroke consults
  them.** A name the author reaches for at authoring time and a
  reviewer checks against is what the two recurrences proved a
  describing-only postmortem could not supply.
- **ADR-0009 gains a name to attribute to.** A `render` ≫ `patch`
  ranking now points at a named diagnosis ("render-coupling, Rule
  2") rather than an unnamed shape each investigator re-derives.
- **P3's `vue/no-v-html` and a future high-frequency-read lint
  heuristic have a tenet to encode.** The lint mechanises a slice
  of the convention; the convention is what gives the lint meaning.

### Negative

- **Discipline is policy, not mechanism.** Like the sibling tenets,
  this lives in authoring, review, and audit. The render-count
  regression harness (`tests/integration/render-count/`) and the
  minimal ESLint host are partial mechanisations, not a complete
  one — render-coupling is statically undecidable in general (the
  postmortem's typing analysis establishes why).
- **The accessor idiom is more typing than prop-drilling.** Passing
  `() => T` where `T` would do is friction at the keyboard, and
  feels like a DRY violation. The tenet accepts that cost as the
  price of dissolving the coupling rather than relocating it.

### Neutral

- **No retroactive sweep.** Existing components are not targeted for
  rewrite; the tenet operates at the moment of new authoring and on
  incremental retrofit when a file is touched for other reasons,
  per ADR-0004.
- **Fine-grained reactivity (Vue Vapor) would dissolve Rule 2's
  class by construction.** The accessor/imperative idioms are a
  manual emulation of per-binding updates. If the project adopts
  Vapor, Rule 2's reactivity benefit becomes a near-no-op; Rule 1
  and the documentation value persist regardless. The
  render-coupling postmortem's Recommendation 6 scopes that open
  decision.

## Revisit when…

1. **A lint rule can mechanise the read-locality check.** A
   heuristic that flags template/computed reads of a curated
   high-frequency source set inside orchestrator-tagged components
   would move part of the discipline from review responsibility to
   compile-time-equivalent enforcement. The minimal ESLint host
   stood up alongside this tenet is the prerequisite; the custom
   rule is the trigger for relaxing the policy.
2. **The project adopts fine-grained reactivity (Vue Vapor).** At
   that point Rule 2's reactivity rationale becomes a near-no-op and
   the tenet's framing updates to documentation-value-only for that
   rule; Rule 1 (canvas for data-dense visuals) survives unchanged.
3. **A new high-frequency source class appears** (a streaming
   telemetry feed, a worker-thread tick) that the curated source
   set does not cover. The rule's *conditions* are durable; the
   enumerated sources extend.
4. **The layering tenet and Rule 2 (read-locality) are reconciled,
   or found irreducibly in tension.** Rule 2 has a display leaf read
   the high-frequency reactive value it displays *wherever that value
   lives* — which sanctions a leaf reading directly from a
   reactive-state module in the services layer (`analysis-ledger`,
   `analysis-config`). `frontend/CLAUDE.md`'s layering tenet says
   components do not call services. These are two sound directives on
   independent grounds — render-locality vs. the effect-orchestration
   boundary — meeting at one concrete seam: the ESLint import-boundary
   (`frontend/eslint.config.js`) restricts *effectful service
   singletons* in components but exempts *reactive-state modules*. That
   split is a working reconciliation, not a proven bridge. Revisit when
   a case appears that the split cannot cleanly classify — a
   services-layer module that is both an effectful singleton and a
   legitimate leaf-read source — or when there is bandwidth to ask
   whether the two directives collapse into one coherent principle
   (e.g. relocating reactive-state modules out of `services/`) rather
   than being held apart by a lint heuristic. Surfaced per ADR-0002;
   not resolved here.

## Related

- **`docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`**
  — the postmortem this tenet adopts (its Recommendation 1, the
  un-adopted "reactive-read locality" tenet). The instances table,
  the typing analysis, and the DRY ↔ locality tension are the
  backing detail this ADR compresses.
- **`docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md`** — the
  audit whose Question 2 ranks this tenet as the highest-leverage
  prevention (P1), with the `TreeWidget` recurrence as the proof
  that a name-without-enforcement does not stop recurrence.
- **The green-arc worklogs** — the evidence. Canvas rule:
  `2026-05-31-perf-boardtab-rugplot-canvas.md`,
  `2026-05-31-perf-timeline-rugplot-canvas.md`. Read-locality rule:
  `2026-05-31-perf-treewidget-render-decouple.md`,
  `2026-05-29-perf-nav-arc2-app-decouple.md`,
  `2026-05-29-perf-nav-rb1-toolbar-metrics-decouple.md`.
- **ADR-0009 (performance investigation discipline).** The reactive
  sibling. ADR-0009's component-cost ranking (`render` *and*
  `patch`; `render` ≫ `patch` is read as render-coupling) is the
  measurement that diagnoses a Rule 2 violation; this tenet is the
  preventive name for what that measurement finds.
- **ADR-0002 (fail loudly).** The silent-failure family both rules
  belong to: a cost invisible at authoring and typecheck time,
  surfacing only under a profiler.
- **ADR-0003 (domain bands).** A canvas-drawing module or an
  imperative-escape composable is still band-tagged per ADR-0003;
  this tenet governs the element/read choice, not the domain
  coupling.
- **`frontend/CLAUDE.md`** — carries the practitioner-facing
  expansion: the read-locality section and the sanctioned
  imperative-escape pattern (P2), tied to the
  resource-ownership-at-mutation-sites discipline.

## License

Public Domain (The Unlicense).
