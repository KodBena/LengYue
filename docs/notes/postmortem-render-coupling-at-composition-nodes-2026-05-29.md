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

**Through TypeScript's type system: no.** The coupling is a property of
*when and where a reactive read happens at runtime*, not of any value's
*shape*. TS types describe shapes; they cannot encode "this ref updates at
25 Hz" or "this read occurs in a render at tree depth 1." Branded types,
discriminated unions, `readonly` — none can express "do not read me in a
composition node's render." The project's type discipline is excellent and
caught none of these, because they are not type errors.

Partial preventive levers that *could* help, in increasing cost:

- **A named convention** (cheapest, highest leverage) — see Recommendation 1.
- **A best-effort lint heuristic** — flag template/computed reads of a
  curated set of known-high-frequency sources (`store.engine.metrics`, the
  ledger accessors, per-move cursor fields) inside components tagged or
  located as orchestrators. Imperfect (frequency is not statically known) but
  a real signal at the boundary that matters.
- **Profiling discipline (ADR-0009)** — already adopted; the standing net,
  but reactive (post-ship), not preventive.

So: typing no; convention + heuristic + profiling, partially and in layers.

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
than play whack-a-mole: a name so it stops being authored, and a shared-state
idiom so the tempting shortcut is no longer the only DRY option.

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

- `docs/notes/perf-audit-game-scroll-2026-05-28.md` — instances 1–2 (Arc 1/2).
- `docs/notes/perf-audit-range-query-nav-2026-05-29.md` — instance 2/3/4
  context (regime B; RB-1 fixed, RB-2/RB-3 open).
- `docs/adr/0009-performance-investigation-discipline.md` — the reactive net
  that surfaced both fixed instances.
- ADR-0002 (fail loudly) — the silent-failure family this belongs to;
  ADR-0007 (file size) — the amplifier condition; ADR-0003 (domain bands) /
  ADR-0001 (mutation) — the existing disciplines that do *not* cover read
  locality.

License: Public Domain (The Unlicense).
