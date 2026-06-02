# Postmortem — Render-Coupling at Composition Nodes (recurring anti-pattern, 2026-05-29)

An executive + architectural analysis, requested by the project maintainer
after the *same* performance shape was found and fixed in two places (perf
Arc 2 and regime-B RB-1). The maintainer's questions, addressed in order:
are these two instances isomorphic; are there others; *could* there be
others; could stronger typing have prevented it; what restructuring would
eliminate the class.

**This note is for review before it enters the doc graph.** It proposes
no code change by itself; it is the basis for deciding whether a tenet,
a refactor, or a lint heuristic is worth adopting. The cross-references
into the handoff / TODO / ADR set are deliberately deferred until the
maintainer signs off on the framing.

## Summary

The two fixed instances are isomorphic, and they are **not the only two**.
A read-only sweep found a third instance (the dominant regime-B cost,
already slated for the analysis-panel refactor) and a milder fourth. All
share one shape:

> **A component whose job is orchestration / layout / chrome reads a
> high-frequency reactive value in its render, coupling a whole subtree's
> re-render to that value's update frequency.**

The cost is invisible at authoring time and at typecheck time — it surfaces
only under a profiler. That invisibility, not any single oversight, is why
it recurred.

## The shape, precisely

Vue re-renders a component when a reactive value its render *read* changes.
For a **leaf** that displays the value, that is correct and desirable. The
anti-pattern is the same mechanic at a **composition node** — a component
whose responsibility is wiring children together, not displaying the
high-frequency datum. When such a node reads the datum (usually to thread it
down as a prop), its entire subtree is re-evaluated at the datum's frequency,
even though only one descendant needed it.

The distinguishing test is **role, not mechanism**: "does this component
exist to *display* this value, or to *compose* other components?" A leaf
reading the cursor is fine; the composition root reading the cursor is the
bug.

## The instances (found by sweep, 2026-05-29)

| # | Node | Role | High-freq read | Frequency | Status |
|---|---|---|---|---|---|
| 1 | `App.vue` | composition root | `activeBoard.currentNodeId/turn/captures` (+ `moveNumber`) | per navigation | **fixed** (Arc 2) |
| 2 | `App.vue` | composition root | `engineControls.status/metrics` | per metric tick (~25/s) | **fixed** (RB-1) |
| 3 | `AnalysisDashboard.vue` | "Pure orchestrator" | `enriched` / `mainSeries` / `visitVector` (packet-derived) | per analysis packet | **open** — the dominant regime-B cost (RB-2); owned by the analysis-panel refactor |
| 4 | `Toolbar.vue` | chrome | `ledger.getRaw(...rootInfo)` (and, post-RB-1, `metrics`) | per packet / metric tick | **milder** — its subtree is self-contained popovers that *should* bail; flag to verify |

Instances 1–2 are the clearest (a layout shell coupling to domain state).
Instance 3 is the same shape one level down: `AnalysisDashboard` computes the
analysis projection once and prop-drills it to every panel, so a packet to
any path node re-renders the dashboard and regenerates every panel's vnodes.
Instance 4 is contained (the chrome reads high-freq state for a small
display, but its children take no changing props and bail), yet it is the
same shape — and RB-1 *deliberately routed metrics through it*, which is
correct (Toolbar displays them) but makes Toolbar the place to watch next.

## Why it recurred — root cause

Not a single oversight; four compounding structural conditions:

1. **The cost is invisible at authoring and typecheck time.** "Read X in a
   render → re-render on X" is automatic and silent in Vue. There is no
   compile error, no lint warning, no runtime exception — the only signal is
   a profiler showing a fat whole-tree patch. This is precisely the
   *silent-failure* class ADR-0002 is built around, in the performance
   register that ADR-0009 was created (2026-05-27) to make visible. ADR-0009
   is a *reactive* net — it catches the pattern after it ships, which is
   exactly how both fixed instances were found.

2. **Prop-drilling from an orchestrator is the path of least resistance.**
   The natural way to wire a child is `<Child :x="someState" />`. When
   `someState` is high-frequency, the coupling is created for free, with no
   friction at the keyboard. Self-sourcing at the leaf is *more* typing and
   feels like a DRY violation (see the tension below), so the cheaper idiom
   wins by default.

3. **No named convention forbids it.** The frontend's disciplines govern
   *logic placement* (Components thin / Composables logic / Services effects),
   *domain coupling* (ADR-0003 bands), *mutation* (ADR-0001), and *file size*
   (ADR-0007). None govern **where in the tree a reactive value may be read.**
   An un-named anti-pattern recurs by definition.

4. **Composition nodes are the amplifiers, and they grow unbounded.**
   `App.vue` (541 lines, over the ADR-0007 250-line SFC budget) is the single
   composition root for the entire app, so *any* high-frequency value it
   touches re-renders *everything*. `AnalysisDashboard` is the same for the
   analysis subtree. The larger and more central the orchestrator, the larger
   the blast radius of a single coupling — and these orchestrators were
   allowed to accumulate responsibility without the locality discipline.

## On the "organizational mismanagement" framing

The maintainer asked what *organizational mismanagement* could have caused
this. The honest answer is that "mismanagement" overstates it and points at
the wrong lever. This is a small project with a coherent, heavily-documented
architecture; the ADRs are unusually disciplined. The accurate frame is
**architectural-convention debt against an invisible-by-default failure
mode**: a recurring pattern that no existing tenet named, made of a cost no
tool surfaced until ADR-0009 landed (late, and reactively). The process gap
is the *absence of a preventive convention*, not a failure of management or
review diligence — review cannot catch what nothing taught it to look for,
and the type-checker is structurally blind to it (next section). Naming the
pattern is the highest-leverage corrective; that is a documentation act, not
a reorganization.

## Could stronger typing have prevented it?

An earlier draft of this section answered a flat "no." That was too strong;
it conflated two different propositions. The precise position, after an
independent review (`opus-consult-2026-05-29-render-coupling-typing.md`, in
this PR):

**The type *checker* cannot *detect* it.** The coupling is an operational
property — *when and where a reactive read fires at runtime* — not a property
of any value's *shape*. TypeScript erases to JS and has no model of "this
expression executes inside a render's reactive-tracking scope," "this
component is a composition node," or "this ref updates at 25 Hz." Branded
types, discriminated unions, and `readonly` discriminate *values* and
constrain *mutation*; none reach a runtime read-site. This is the same
category as "the type-checker can't catch a deadlock or an N+1 query." The
project's (excellent) branded-type discipline caught none of these because
they are not type errors. Vue's own docs confirm the mechanism — *"each
component instance creates a reactive effect to render and update the DOM."*

**But a typed *contract* can make the easy version *unrepresentable* and the
residual version *loud*.** The decisive move is to change *what crosses a
component boundary*: pass an **accessor** (`type Accessor<T> = () => T`, the
SolidJS shape) or a signal/observable handle rather than an eagerly-read
value. A function value is *not read at the boundary*; the reactive
subscription is established only where the consumer *invokes* it inside its
own tracking scope — i.e., at the leaf. The composition node then holds an
unevaluated thunk and never subscribes, so the coupling is **dissolved, not
relocated**. Passing `T` where `Accessor<T>` is expected is a boundary-local
*type error* — the eager read becomes loud exactly where it would otherwise
be silent. (Residual footgun: reading the accessor outside a tracking scope,
e.g. via destructuring — real, but louder and harder to hit than the original;
SolidJS ships `splitProps`/`mergeProps` to manage it.)

**Vue recognizes this exact pattern, and its convention is leaky.** The
Performance guide's "Props stability" example — "whenever `activeId` changes,
*every* `<ListItem>` updates … move the computation up, pass a stable prop
down" — is isomorphic to the App.vue cases; the project independently
rediscovered official guidance. And the convention-only fix is itself
fragile: [vuejs/core#13157](https://github.com/vuejs/core/issues/13157) shows
an inline handler silently destabilizing a prop and defeating the
optimization, the type-checker none the wiser. That fragility is the
strongest argument *for* a structural (contract-level) fix over convention.

**The theoretical home is an effect system; the structural endgame is
fine-grained reactivity.** "Reads a reactive cell" *is* an effect, and a
row-typed effect system (or a TS encoding such as Effect-TS) is the
type-level construct that could carry it — as documentation, and at a
boundary as a constraint. Independently, the *whole class* is an artifact of
Vue's current component-granularity virtual-DOM model: under **Vapor Mode /
Vue 3.6** (a Solid-inspired, signals-based compilation on the `alien-signals`
reactivity refactor), updates are per-binding — a composition node reading a
reactive value updates one binding, not a subtree — and the coupling
*structurally evaporates*. So the accessor/effect-typed contract is,
operationally, a manual emulation of what fine-grained reactivity does
automatically; once Vapor is in play the reactivity-contract benefit becomes
a near-no-op, though the documentation value of effect-typing would persist
on its own merits. In the reactive-systems literature this is the
*granularity* axis of a known tradeoff (and, for FRP, the four-way tension
in Jane Street's "Breaking Down FRP" — history / efficiency / dynamism /
reasoning, *"history is made tractable by limiting dynamism"*). The
structural fix the theory endorses is "make the recomputation unit
fine-grained" — exactly Vapor, exactly what accessor-passing emulates by hand.

**So the honest answer is not "typing can't help."** It is: *the checker
can't detect it; a typed contract (accessors today, or effect-typed reads)
can make the easy version unrepresentable and the residual loud; and the
structural endgame (fine-grained reactivity / Vapor) makes the class
obsolete.* Which of these — if any — the project adopts is an open
architectural decision (see Recommendation 6), not a foregone conclusion.

The lighter operational levers remain available regardless of that decision:

- **A named convention** (cheapest, highest leverage) — see Recommendation 1.
- **A best-effort lint heuristic** — flag template/computed reads of a
  curated set of known-high-frequency sources (`store.engine.metrics`, the
  ledger accessors, per-move cursor fields) inside components tagged or
  located as orchestrators. Imperfect (frequency is not statically known) but
  a real signal at the boundary that matters.
- **Profiling discipline (ADR-0009)** — already adopted; the standing net,
  but reactive (post-ship), not preventive.

## Are there others? Could there be?

**Found:** the four above (two fixed, one open-and-owned, one milder). The
sweep covered the high-frequency sources known today (`store.engine.metrics`,
per-move cursor fields, ledger accessors) read in component renders, and
classified readers by role (leaf vs orchestrator). The leaves that legitimately
display this data (`BoardWidget`, `MergedDeltaPanel`, the chart panels) are
*not* instances — re-rendering on the data they show is correct.

**Could there be more: yes, and the conditions are predictable.** The pattern
will reappear at *any* new composition node that threads a high-frequency
value to children. The risk is highest where (a) a new orchestrator is
introduced (the analysis-panel refactor's "All"-tab container is the next
one — it must not repeat instance 3), (b) a new high-frequency source is
added (e.g., a streaming telemetry feed), or (c) `App.vue` accretes another
prop-drilled binding. The pattern is generative, not a fixed set of bugs.

## Recommendations (for the maintainer to weigh)

Ordered by leverage-per-effort; none are mandates.

1. **Codify a "reactive-read locality" tenet** (candidate ADR-0010, or a
   section in the frontend `CLAUDE.md`). One rule: *a component reads a
   high-frequency reactive value only if its own job is to display it;
   composition / orchestration / chrome components read only structural or
   low-frequency state and let leaves self-source.* This is the preventive
   corrective that addresses root cause #3 directly, and it gives review and
   ADR-0009 a name to check against. Cheapest, highest leverage.

   > **Adopted (2026-05-31).** Both candidate homes were taken: the tenet
   > shipped as **ADR-0010** (with the sibling canvas rule and the
   > render≫patch corollary the green arc proved), *and* the frontend
   > `CLAUDE.md` gained the practitioner-facing render-locality section.
   > The trigger was the recurrence this recommendation anticipated —
   > `TreeWidget` reproduced the bug days after this note was written. See
   > `docs/notes/opus-audit-green-perf-arc-2026-05-31.md` (P1) for the
   > decision, and `frontend/tests/integration/render-count/` for the
   > regression harness (P4) that mechanises a slice of the convention.

2. **Resolve the DRY ↔ locality tension structurally** (informs the RB-2
   refactor). The reason prop-drilling is tempting is real: `AnalysisDashboard`
   computes the projection *once* and shares it, vs. N panels each recomputing.
   The resolution is to share the once-computed projection **without routing it
   through an orchestrator's render** — e.g. `provide`/`inject` of the
   projection, or a `boardId`-keyed composable with module-scoped shared state
   that each panel reads directly. Then the projection is computed once *and*
   the orchestrator does not re-render *and* each leaf re-renders only on its
   own slice. Applying this in the analysis-panel refactor would fix instance
   3 and make the new "All"-tab container immune by construction.

3. **Shrink the composition root** (ADR-0007, already proposed). A thin
   `App.vue` that wires named subtree components — and reads nothing
   high-frequency — has a small blast radius even if a coupling slips in.
   Instances 1–2 were severe because `App.vue` is the whole-app root; a
   smaller root is a smaller amplifier.

4. **Add the lint heuristic** (optional, after 1). Mechanises a slice of the
   convention at the curated-source boundary.

5. **Keep ADR-0009 as the standing net.** Profiling remains the backstop that
   catches what the convention and lint miss; the before/after discipline used
   across Arc 1 / Arc 2 / RB-1 is the model.

The combination 1 + 2 is what would actually *eliminate the class* rather
than play whack-a-mole *within the current model*: a name so it stops being
authored, and a shared-state idiom so the tempting shortcut is no longer the
only DRY option.

6. **Larger structural directions — open, not decided.** Beyond the current
   model, two directions would *dissolve* the class rather than discipline it:
   - **Typed-contract boundaries.** Cross reactive values between components
     as accessors (`() => T`) or effect-typed reads rather than eagerly-read
     values, so the coupling is structurally dissolved and the eager read
     becomes a boundary-local type error. A spectrum from lightweight
     (per-boundary accessors / capability-branded sources) to heavyweight
     (an effect system such as Effect-TS adopted project-wide, where
     effect-typed reads double as documentation).
   - **Vapor Mode (fine-grained reactivity).** Vue's own roadmap; per-binding
     updates make the class obsolete by construction — the contract
     approaches above are its manual emulation.
   Open questions before any commitment: (a) effect-system maturity, and
   whether its effect-tracking can model Vue reactive reads without a large
   bespoke integration; (b) forward-compatibility with Vapor — and whether a
   reactivity-contract benefit is worth *building* if Vapor will subsume it,
   versus effect-typing's **standalone documentation value**, which would
   persist regardless; (c) migration cost / blast radius. These are live
   architectural decisions for the maintainer; this postmortem scopes the
   *problem* and the *option space*, not the commitment. Detailed backing is
   the independent typing review in
   `opus-consult-2026-05-29-render-coupling-typing.md` (this PR).

## Scope and caveats

- Read-only sweep on `main` at `f6e833f`; classification by role + a grep of
  the high-frequency sources known today. A source not in that set (a future
  telemetry feed) would not have been caught — the *conditions* section is the
  durable part, not an exhaustive enumeration.
- Instance 4 (Toolbar) is asserted to be contained on the reasoning that its
  popover children take no changing props; that bail should be confirmed with
  a profile if Toolbar is ever found hot.
- The recommendations are options for the maintainer's decision, not a
  proposed implementation. Adopting any of them (especially a new ADR) is a
  governance call.

## References

- `docs/notes/consult/opus-consult-2026-05-29-render-coupling-typing.md` — the
  independent typing review backing the revised "Could stronger typing have
  prevented it?" section (verified citations for the Vue / Vapor / FRP claims
  below).
- `docs/notes/perf-audit-game-scroll-2026-05-28.md` — instances 1–2 (Arc 1/2).
- `docs/notes/perf-audit-range-query-nav-2026-05-29.md` — instance 2/3/4
  context (regime B; RB-1 fixed, RB-2/RB-3 open).
- `docs/adr/0009-performance-investigation-discipline.md` — the reactive net
  that surfaced both fixed instances.
- Vue: [Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
  (component-level render effect; the "Connection to Signals" / Vapor note),
  [Performance — "Props stability"](https://vuejs.org/guide/best-practices/performance)
  (the isomorphic documented anti-pattern + `v-memo`),
  [vuejs/core#13157](https://github.com/vuejs/core/issues/13157) (the
  convention's leakiness),
  [v3.6.0-beta.1 / Vapor Mode](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1).
- Theory: Jane Street, ["Breaking Down FRP"](https://blog.janestreet.com/breaking-down-frp/)
  (the four-way tradeoff the maintainer intended — history / efficiency /
  dynamism / reasoning); the reactivity-algorithms granularity tension. (No
  citable "trilemma" from the "Seven Implementations of Incremental" talk was
  located — the consult treats the recollection as the tetralemma above.)
- ADR-0002 (fail loudly) — the silent-failure family this belongs to;
  ADR-0007 (file size) — the amplifier condition; ADR-0003 (domain bands) /
  ADR-0001 (mutation) — the existing disciplines that do *not* cover read
  locality.

License: Public Domain (The Unlicense).
