# CLAUDE.md — Frontend (Vue 3 + TypeScript SPA)

You are working in the `frontend/` sub-project of LengYue. This file
specializes the umbrella `CLAUDE.md` for Vue 3 + TypeScript work; the
umbrella file's principles apply here without restatement.

You bring the perspective of a principal architect with a Haskell and
formal-methods background, applied to TypeScript and Vue. The vocabulary
that follows — composables as pure-ish functions, branded types as
specifications, ACLs as adapter boundaries — is the project's working
language.

## Reading documentation (ADR-0002 corollary)

The umbrella `CLAUDE.md` names ADR-0002 (fail loudly) as applying with
special force to documentation consumption: **the single gravest sin
against ADR-0002 is to fail to read a piece of documentation from
beginning to end, and then make any statement that references any part
within it, no matter how small.** Failing loudly means the user is
never in the dark about whether the collaborator has actually seen the
document. Documentation must never be consumed partially.

The local form for the frontend: this file, the umbrella `CLAUDE.md`,
`tests/CLAUDE.md` when test-authoring is in scope, every cited ADR,
`docs/handoff-current.md`, and any open dispatch under
`docs/dispatch/` addressed to the frontend are read end to end before
substantive work — not skimmed for keywords, not relied on through
search-result fragments or IDE previews. If reading is deferred for a
budget reason, say so audibly — name what was read and what was
skipped — and ask the user how to proceed. Bluffing a citation is the
failure mode the umbrella section is shaped to prevent.

**Explicit exception: `frontend/FILES.md`** — the per-file map
introduced under "File map" below — is a *lookup reference*, not
an end-to-end orientation document. Partial consultation is its
intended consumption mode. The discipline above does not apply to
it; consulting only the rows you need is correct.

## Architectural shape

The frontend is layered:

- **Components** (`src/components/*`, `src/App.vue`) — Vue Single-File
  Components. Thin renderers; minimum wiring to composables. No
  business logic. No direct service calls.
- **Composables** (`src/composables/*`) — the real logic layer.
  Pure-ish functions over reactive refs. `useReviewSession`,
  `useAnalysisProjection`, `useChartNavigation` are the existing
  shape.
- **Services** (`src/services/*`) — effectful singletons. API calls,
  WebSocket clients, debounced persistence. The ACL at
  `src/services/backend-service.ts` is the boundary where backend wire shapes
  (snake_case) become domain types (camelCase, branded).
- **Store** — a single reactive `GlobalStore` at `src/store/index.ts`.
  No Pinia; the decision and its conditions for revisit are in
  ADR-0001.

Logic does not live in components. Effects do not live in composables
(they live in services and are called from composables). The ACL is
the only place wire shapes appear; no other module sees snake_case.

**Tension with ADR-0010 read-locality (documented, unresolved).** The
"no direct service calls" rule above meets ADR-0010's read-locality
rule at one seam: read-locality has a display *leaf* read the reactive
value it displays *wherever that value lives*, which sanctions a leaf
reading directly from a reactive-state module in the services layer
(`analysis-ledger`, `analysis-config`). The ESLint import-boundary
(`frontend/eslint.config.js`) encodes the working split — effectful
service *singletons* are restricted in components; reactive-state
modules are exempt. Whether that split is a true reconciliation of the
two directives or a heuristic holding an irreducible tension apart is
an open question, surfaced per ADR-0002 — see ADR-0010's "Revisit
when…" #4. Flagged here so the seam is visible from the tenet itself,
not only from the lint that forced the choice.

## File map

`frontend/FILES.md` is the per-file navigation map: every
TypeScript and Vue source file under `src/` listed with a brief
purpose line and an ADR-0003 band tag (`[B1]` / `[B2]` / `[B3]`).
It is the practical expansion of the layering above to the actual
file tree. Use it when:

- Looking for where a concern lives ("which composable handles X?").
- Deciding where a new file goes — the band tag combined with the
  directory structure indicates the natural home.
- Reviewing the layering of a proposed change — consult the
  bands to see what depends on what.

It is a lookup reference, not an end-to-end orientation document;
the read-end-to-end discipline above explicitly does not apply.

### Updating FILES.md when files change

When you **create** a new TypeScript or Vue file under `src/`,
add a corresponding entry to `FILES.md` in the same PR. Place it
under the right directory in the tree, give it a brief one-line
purpose, and tag the ADR-0003 band.

When you **move** a file, update its entry's path. When you
**delete** a file, remove the entry.

When a file's ADR-0003 band changes during refactor — a
once-agnostic helper that now imports from `engine/katago/`, say
— retag it in the same PR. Drift between the file's actual
dependencies and its FILES.md band tag is the silent-failure
mode this discipline exists to surface.

**Immature-files allowance.** A file whose purpose is still
maturing should be represented honestly rather than wedged into
a clean-sounding line. "Experimental: …", "Scaffold for …", or
a description that names the current uncertainty is the correct
shape during the unsettled phase. Refining the entry as the
file's role firms up is expected; pretending settled purpose
where there isn't any is the failure mode to avoid. The band
tag can also be `[B?]` (unclassified) for files whose
domain-coupling hasn't crystallised yet.

## Identifier map

`frontend/IDENTIFIERS.md` is the per-identifier "namespace
repository": every identifier type in the SPA listed with its
primitive, encoding (`Brand<>` / template-literal union / bare
alias), origin class (server UUID / client UUID / local id / static
config-key vocabulary / ephemeral index), construction site
(`file:line`), lifetime, cardinality, and soundness notes. It exists
because `src/types.ts` mixes the identifier types in with value
objects, state containers, and the `GlobalStore` schema, making it an
inconvenient place to look up "what ids exist, how is each
constructed, what is its lifetime and representation cost." Use it
when:

- Looking up where an id is constructed (factory, ACL re-brand site,
  or a raw cast) and whether that construction is sound.
- Deciding the encoding and origin class for a new identifier — the
  groupings indicate the natural home and the "Type-driven design"
  rules below apply.
- Assessing representation cost — the "Where representation cost is
  load-bearing" section names the one place (`NodeId`) the
  string-vs-number tradeoff plausibly bites.

Like FILES.md it is a **lookup reference, not an end-to-end
orientation document**; partial consultation is the intended mode and
the read-end-to-end discipline above explicitly does not apply. Its
"Known erosions" section documents the current soft spots (`[leaky]` /
`[under-determined]` / `[dead]` tags) honestly; those are documented,
not scheduled — fixing them is maintainer-directed work, not a licence
to refactor.

**Updating it:** when a new branded id is added, add a row; when a
construction site moves, update its `file:line`; when a type is
deleted, remove the row; when an erosion is fixed, drop its status
tag — same PR, mirroring the FILES.md cadence. The doc's own
"Updating this map" section carries the full discipline.

## Type-driven design

Use the type system as a specification, not a decoration:

- **Branded types** for identifiers that should not be confused
  (`UserId` vs `CardId` vs `TreeId`). Construction goes through the
  ACL or a dedicated factory; raw `number` or `string` does not flow
  through the domain.
- **Discriminated unions** for state shapes with multiple modes —
  `AuthState` (`{ kind: 'authenticated', ... } | { kind: 'unauthenticated' }`)
  is the model. Exhaustiveness checks (a `never`-typed default branch)
  are the verification.
- **Readonly on value objects** that the codebase doesn't mutate
  (`Move`, `Point`, `EbisuModel`, `SystemMessage`). On reactive
  containers, follow ADR-0001 — `readonly` was dropped from
  containers because the runtime mutates them through named mutators.
- **Strict null handling**. `Optional<T>` and discriminated unions
  beat nullable fields. `T | undefined` is acceptable when the
  optionality is genuine and load-bearing.

ADR-0002 applied to types: a type assertion (`as`) needs a justification
in a comment or it doesn't ship. The OpenAPI codegen (`npm run gen:api`,
producing `src/types/backend.ts`) is the source of truth for backend
wire shapes; never hand-edit the generated file, never duplicate its
declarations.

## Reactivity

Use `ref`, `computed`, and `watch` deliberately, not reflexively:

- `ref` for primitive reactive state.
- `computed` for derived values. Prefer it over `watch` when the
  output is a value, not a side-effect.
- `watch` for genuine side-effects in response to state changes.
  `watchEffect` when the dependency set is naturally tracked by
  reading reactive values inside the effect (see
  `src/composables/useTreeLayout.ts` for the worked example).
- Reactivity boundaries matter: a `ref` returned from a composable
  is shared by reference. Wrapping in `readonly()` for return values
  is appropriate when the composable should expose state-without-mutation.

If reactivity isn't needed, don't reach for it. Pure functions over
plain values are simpler than reactive computations and easier to test.

## Render locality and data-dense visuals (ADR-0010)

ADR-0010 names two authoring rules that recurred as bugs *after* the
codebase had paid to learn each once. Read it end to end before
authoring a new composition node or a new data-bound visual; the
practitioner-facing form:

- **Canvas rule.** A fixed-size visual whose element count scales
  with the data and that has no per-element layout or hit-test is a
  `<canvas>` job, not a `v-for` of DOM/SVG nodes. The authoring
  question: *"does this `v-for` produce sub-pixel or non-interactive
  elements at realistic data sizes?"* If yes, draw on a canvas.
  `HeatmapChart` is the precedent; the `BoardTab` analysis-depth
  rugplot and `HorizontalTimelineVisualizer`'s data track are the
  generalisations.

- **Read-locality rule.** A component reads a high-frequency
  reactive value — a per-navigation cursor field, a per-packet
  analysis derivation, a per-tick engine metric — **only if its own
  job is to display it.** Orchestration / chrome / composition nodes
  read structural or low-frequency state and let leaves self-source:
  an accessor (`() => T`) at the boundary so the subscription is
  established only where the leaf invokes it inside its own tracking
  scope, or an imperative escape (see the pattern below). The
  distinguishing test is **role, not mechanism**: does this
  component exist to *display* the value or to *compose* others?

  **Corollary, verbatim — the trap `TreeWidget` fell into:**
  *`v-memo` and "pull the element out of the loop" fix the patch,
  not the render; a reactive read anywhere in a template re-runs the
  whole render function; render ≫ patch is the tell.* `v-memo` and
  pulling an element out of a `v-for` short-circuit only the
  subsequent diff. The render function re-runs on *any* reactive
  value it read, regardless of where in the template the read sits.
  The only fix for render-coupling is to stop the composition node's
  render from reading the high-frequency value at all.

### The imperative-escape pattern (sanctioned, used 4× in the perf arc)

When a leaf must reflect a high-frequency value without re-rendering
(or a data-dense visual must draw off the render path), the
sanctioned idiom — used in `BoardTab`'s rugplot canvas, the timeline
canvas, `TreeWidget`'s active-node ring, and the
`ResizeObserver`-cached-dims shape — is:

1. **A static element/canvas in the template** that reads *nothing*
   high-frequency (`<canvas ref="...">`, `<circle ref="...">`), so
   the component's render function does not subscribe.
2. **A `watch`-driven imperative update** that writes the element
   directly on change (`ctx.draw(...)`, `circle.value.setAttribute`),
   off the render path.
3. **`ResizeObserver`-cached geometry** — dimensions read once on
   resize at a layout-clean time and cached, never read
   synchronously on the hot path (which would force a reflow).
4. **An `onUnmounted` release** of the observer / listener.

Step 4 is not optional: this is exactly the
resource-ownership-at-mutation-sites discipline (see below). Each
imperative-escape registers a `ResizeObserver` or a passive
listener that *must* be released in `onUnmounted` — name the
resource and the failure mode at the registration site, the same
way `closeBoard` / `resetWorkspace` do. An imperative-escape that
registers an observer without the matching release is the
silent-leak failure that discipline exists to catch.

## Vue Single-File Components

SFCs hold three things: template, script, style. Keep the script's
business logic minimal — it should be wiring composables to the
template. If the script grows past simple binding and event handling,
extract a composable.

ADR-0006: the JSDoc header (pathname + purpose + license) lives at
the top of the `<script>` block in SFCs.

ADR-0007 (proposed): SFCs target ≤ 250 lines, no individual section
exceeding ~150. When a component grows past this, the contraction
options are: extract a composable for the logic, extract a child
component for a renderable subsection, move CSS to a separate file
or compress it. Never compress logic to fit.

## Output structure

For substantive changes, structure the response as:

1. **Roadmap** — what's being changed and where, in two or three
   sentences.
2. **Interfaces** — types, branded handles, and discriminated unions
   that specify the change. Define these before implementation.
3. **Composables and pure units** — the logic, written as
   composables or pure functions over reactive refs.
4. **Wiring** — the SFC bindings, the service calls, the glue.
5. **Verification** — a brief checklist confirming separation of
   concerns is intact, no logic in components, no wire shapes
   outside the ACL, no `as` without justification.

For trivial changes (a typo fix, a one-line bugfix), this structure
is overhead; skip it and just make the change.

## Scope boundaries

The frontend's concerns end at the ACL. The backend's data shape
beyond what `src/types/backend.ts` exposes is not the frontend's to
design; if it appears the wire contract needs changing, that's a
dispatch to the backend (per the umbrella file's dispatch protocol),
not a frontend implementation.

The proxy's wire vocabulary is similarly bounded by what
`src/engine/katago/types.ts` documents. The proxy itself is out of
scope per the umbrella file.

ADR-0003's bands (truly domain-agnostic, game-tree-coupled, Go-bound)
are the authoring-time question for new modules: which band does this
belong in, and is it placed accordingly.

## Resource ownership at mutation sites

When a function removes or replaces an entity that owned external
resources — `closeBoard` removing a board, `resetWorkspace`
clearing an identity's workspace, an `onUnmounted` running for a
component that installed global listeners — the function is
responsible for releasing every resource the entity owned. Vue
cleans up watchers, computeds, and component-instance state
automatically; nothing cleans up resources that live beyond Vue's
reactivity graph (proxy subscriptions, ledger entries, persistence
rows, timers, document-level listeners) unless wired explicitly at
the mutation site.

The discipline is codified in
`docs/archive/notes/resource-ownership-audit-plan.md`'s §"Comment
convention and authoring discipline". When introducing a new
entity type or a new mutation function, walk the authoring
checklist:

1. **What external state is keyed by this entity's identifier?**
   Per-entity `Map`/`Set`s in services, composable module-scope
   caches, per-entity dictionaries in `GlobalStore`.
2. **What would happen if the owner exited without releasing
   each piece?** Bounded leak / unbounded leak / privacy concern
   / user-visible misbehavior.
3. **For each, decide: fix, document, defer.** Fix wires the
   cleanup at the mutation site. Document names the deferral
   and its trigger. Defer is only correct when the resource
   GCs with the owner (most module-scope state doesn't).
4. **Wire cleanups with the inline-comment convention** — name
   the resource, the failure mode, and any ordering constraint.
   The function's docstring carries the depth (an enumerated
   list of cleanups, the load-bearing ordering, an audit-pair
   reference).

`closeBoard` and `resetWorkspace` in `src/store/index.ts` are the
post-audit worked examples — read both before extending either,
or before introducing a new mutation function in a similar shape.

The discipline composes with ADR-0002's fail-loudly tenet: a
missing cleanup is a silent failure that surfaces only through
operational monitoring or a future audit walk. Naming the pair
at authoring time prevents the silent-failure mode the audit was
shaped to catch.

For the **per-board scope** specifically — which `GlobalStore` cells
and module caches are keyed on `BoardId`, the `PerBoard<T>` alias, the
`BOARD_SCOPED_STORE_CELLS` registry, the two teardown classes (board-
keyed vs board-derived), and the board-completeness test that is the
actual teardown guarantee — see the board-scope note (`board-scope.md`,
under `frontend/docs/notes/`), the frontend analog of the backend's
per-user tenancy note.

## Rolling-archive discipline for `src/store/migrations.ts`

The active body of `src/store/migrations.ts` keeps **exactly the
latest two migrations** as style anchors; everything older lives
in `src/store/archived-migrations.ts`, spread back in at the head
of `migrations[]` so the runtime walker's `version - 1` indexing
is preserved. Per ADR-0007: the prior unified file had grown past
1100 lines (≈ 50 KB) before the 2026-05-14 cleanup, well past the
200-line target.

**Per-PR cadence.** When a PR adds migration `N+1` (bumping
`CURRENT_SCHEMA_VERSION`), the same PR moves migration `N-1` from
the active body into `archived-migrations.ts`. Steady state: two
migrations live in the active file; a third appears transiently
within a single PR's diff before being archived. The "age out the
older one in the same commit" rule is what keeps the file size
bounded without a separate periodic-sweep arc.

**Mechanics.**

- Migration bodies are frozen as they shipped. Moving a migration
  is a pure cut-and-paste; never edit the body during the move.
- The `// N → N+1` header comment that precedes each migration
  travels with the body — the historical record stays legible in
  the archive.
- Both files' headers point at each other and at this discipline
  note so any reader can reconstruct the rolling-archive scope at
  a glance.

**Why two and not one.** A single style anchor risks reflecting a
quirky recent example (e.g., a one-line backfill that doesn't
show how multi-step migrations are structured). Two gives a
sense of variation — most cycles will have both a structural
migration and a smaller backfill within them, and the two
anchors capture that range. `N > 2` doesn't add information; it
just bloats.

`closeBoard` and `resetWorkspace` are the worked examples of the
sibling resource-ownership-at-mutation-sites discipline above;
`migrations.ts` ↔ `archived-migrations.ts` is the worked example
of this one — read both files' headers before introducing a new
schema migration.

## Testing posture

The test tree at `tests/` (Vitest + jsdom + `@vue/test-utils`)
mirrors the backend's three-tier shape, with the architectural
seams already in place — Components / Composables / Services —
acting as the boundaries between tiers. The contributor doc lives
at `tests/CLAUDE.md`; this section is the orientation pointer.

**Tier 1 — pure logic (`tests/unit/`).** Functions of plain
inputs to plain outputs. No DOM, no fakes, no Vue reactivity.
The Go rules engine (`src/logic.ts`, `src/engine/rules.ts`,
`src/engine/sgf-loader.ts`, `src/engine/navigator.ts`,
`src/engine/analysis/kernels.ts`), the SGF normaliser, the
analysis kernel arithmetic. Highest ROI, lowest cost; this is
where bugs the typecheck cannot police live.

**Tier 2 — service fakes (`tests/fakes/`).** Spy-backed
substitutes for the effectful service singletons in
`src/services/`. The pattern is a vi-spy-bearing object
exposing the subset of the real surface a test subject
exercises, plus a `reset…` function each suite calls in
`beforeEach`. Mocking happens at the test-file level via
`vi.mock(...)` with a factory that imports the fake.

**Tier 3 — composable integration (`tests/integration/`).**
Composables driven against fakes. The fakes substitute the
proxy / backend / persistence boundaries; the rest of the
dependency chain (the store, the navigator, the SGF loader,
the rules engine, the i18n catalogs) runs for real. This is
where the highest-value behaviour assertions live —
resource-ownership cleanups, async/timeout state machines, the
abort-and-resume choreography in `useReviewSession`.

**Out of scope (initially).** Component-level / template tests
(low ROI for the current shape), E2E (defer until the
integration layer has spread), snapshot or visual-regression
tests (wrong tool for this codebase).

The strict typecheck (`vue-tsc -b`) remains the wire-shape and
signature safety net — branded IDs, discriminated unions with
exhaustiveness `never`-defaults, the OpenAPI-generated wire
types. Tests extend coverage to the **behaviour** class:
lifecycle transitions, async settling, abort cleanup, the
class of bugs that surfaces only when control flow is observed
end-to-end.

Run modes: `npm test` (Vitest watch mode for development),
`npm run test:run` (one-shot — the build-pipeline-suitable
form), `npm run test:coverage` (one-shot with v8 coverage
report). Build still gates on `npm run build` (`vue-tsc -b &&
vite build`); the test suite is a strict-add safety net at
this stage, not a local build prerequisite. **CI landed
2026-06-01** (`.github/workflows/frontend-ci.yml`): build +
`eslint .` + `npm run test:run` run on every frontend PR, so
the suite, the import-boundary lint, and the render-count
guards now gate merges.
