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
this stage, not a build prerequisite. CI integration is a
follow-up item.
