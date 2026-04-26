# gogui — Frontend Handoff Note

**Date:** 2026-04-25
**Author:** outgoing frontend collaborator
**Audience:** future contributors (and future self), backend team,
release planners
**Companion documents:** `TODO.md`, the four ADRs/tenets

---

## What this document is

A bird's-eye orientation to the gogui frontend at the close of the
pre-release infrastructure sweep. Written to be useful to someone
arriving at this codebase cold — whether to extend it, to maintain
it, or to coordinate the integrated release with the backend. It
focuses on architectural posture and direction, not on line-level
implementation details (those live in the source and the ADRs).

For day-to-day "what should I work on next" questions, see
`TODO.md`. For specific architectural decisions, see the four
ADRs/tenets enumerated below. This document zooms out from both.

---

## What gogui is, and what it is for

gogui is a study application for the game of Go (Weiqi). The user
loads SGF games — their own play, professional games, problem
sets — and the application stages them as flashcards in a
spaced-repetition system, evaluated by KataGo (the strongest
publicly available Go engine).

The product thesis is that **deep Go improvement comes not from
volume but from focused review of positions where the user's
intuition and the engine's evaluation diverge.** The combination
of Ebisu's Bayesian recall model (for scheduling) and KataGo's
position evaluation (for grading) is the engineered version of
"play the position, see what you think the right move is, see
what KataGo thinks, and feel the difference."

What makes gogui distinctive:

- **The analysis palette system.** Move quality in Go isn't a
  single number. KataGo emits a packet of metrics (winrate, score
  lead, visit distribution, ownership map, policy head, principal
  variations) and the *meaningful* signal for any given study
  context is some palette-defined function over them. The palette
  is user-editable; the user can configure their own definition of
  "this move was a mistake" or "this move was inspired."
- **The qEUBO calibration loop.** Picking palette parameters by
  hand is a research problem the project's authors don't claim to
  have solved. The project's roadmap includes Bayesian
  optimization (qEUBO) over palette parameters, evaluated by user
  satisfaction with the surfaced reviews. KataProxy's analysis-
  level cache (described below) is what makes this loop feasible:
  the same engine query gets replayed many times under different
  palette payloads, and the cache means each replay is free after
  the first.
- **Transparent depth.** The application exposes its abstractions.
  The registry editor lets the user inspect and modify the full
  settings tree. The palette editor exposes the function
  definitions. The pipeline DSL lets the user define
  custom card sets via composable selection/ordering operators.
  This is intentional — the target audience (serious Go
  researchers) gets value from being able to reach into the
  machinery, and the design decisions are made to support that
  rather than hide it.

What gogui is not, and is not trying to become:

- Not a casual learning app. The UI density is high; the intended
  user is comfortable with KataGo, SGF, and the game's strategic
  vocabulary.
- Not a multiplayer client. There's no opponent matching, no game
  server protocol, no time controls. The engine is the only
  opponent in the building.
- Not a game database. Storage of historical games is incidental
  to the SR workflow, not the product itself.

---

## How the system is structured

The gogui product is composed of **three independently-developed,
peer-level sub-projects**. Each has its own architecture, its own
governance, its own intended user base, and its own development
history. They integrate at well-defined boundaries but none is
subordinate to the others.

- **gogui frontend** (`frontend/`): the Vue 3 + TypeScript SPA
  that the user interacts with. Subject of this handoff.
- **fastapi_service** (`backend/`): the REST backend that
  persists cards, runs the SR scheduler, and exposes the lineage/
  forest/stats query endpoints. The backend has its own complete
  development history, governance, and roadmap (see its README and
  the joint TODO.md).
- **KataProxy** (`proxy/`): a layered protocol-translation
  framework for the KataGo analysis engine. Not just a multiplexer
  — KataProxy is independently architected, independently
  documented, and intended for use by go schools, online go
  services (FoxWQ, Tygem, etc.), and individual operators sharing
  analysis machines. gogui is one consumer of KataProxy among
  potentially many. See KataProxy's own README, FRAMEWORK.md, and
  ARCHITECTURE.md for its design.

A more accurate framing: gogui is a *consumer* of two service
backends. The Ebisu service handles SR scheduling and persistence;
KataProxy handles engine analysis. Both backends are usable
standalone, both have their own roadmaps, and both could in
principle serve other clients than gogui.

The integration model is:

- **Frontend ↔ Ebisu backend**: REST + JWT auth, with an
  OpenAPI-typed ACL in `src/services/ebisu-service.ts`. The
  frontend never talks to the backend's database directly; the
  ACL translates wire shapes (snake_case, with stale-bundle
  compat shims) into clean domain types (camelCase, branded).
  Item 30's codegen pipeline keeps the two sides honestly synced.

- **Frontend ↔ KataProxy**: WebSocket. KataProxy's wire contract
  is a superset of KataGo's native analysis protocol — it accepts
  every field KataGo's binary accepts, plus four control
  flags (`cache`, `lookup_cache`, `replay_final_only`,
  `analysis_config`) that KataProxy interprets at its Hub layer.
  gogui's wire type (`src/engine/katago/types.ts`) describes the
  specific subset gogui uses; KataProxy supports more (see its
  FRAMEWORK.md for the Transformer + SessionMiddleware extension
  model).

- **Ebisu backend ↔ KataProxy**: none currently. The proxy is
  purely a frontend-facing service. If the future
  analysis-persistence feature lands (see Roadmap below), the
  Ebisu backend gains a write path for engine analyses — but the
  read path stays through KataProxy.

Architecturally, the three sub-projects are coupled at the
*protocol* level (wire formats, JSON shapes, action verbs) but
decoupled at the *implementation* level. Each could be
reimplemented in a different language without affecting the others.
This is a deliberate posture and is reflected in the architectural
records.

A note on KataProxy specifically: its three-layer architecture
(Sessions / Hub / Router) with each layer speaking a different ID
namespace is the design property that makes its extension model
work. Transformers can run at Layer 1 without knowing about
coalescing; the Hub can coalesce without knowing about ID
translation; the Router can dispatch without knowing about either.
gogui benefits from this discipline indirectly — the proxy's
caching and palette-payload features are built into Layer 2 and
flow through Layer 1's transformer chain — but if you ever extend
KataProxy yourself (custom enrichment, new routing strategies,
support for a different engine protocol), read its ARCHITECTURE.md
first. The "Where this falls short" section there is unusually
candid and worth reading before making non-trivial changes.

---

## Architectural governance — the ADR/tenet hierarchy

The project carries four foundational architectural records,
spread across two genres. **All four apply to all three
sub-projects** as project-wide governance, regardless of which
sub-project's history they originated in. They should be moved
into the monorepo's top-level `docs/` once the projects are
combined (see Monorepo recommendation below).

The frontend authored these documents during its strict-mode
build sweep, but the principles aren't frontend-specific — they
codify discipline that the backend already practices in its own
patterns and that KataProxy should adopt as it matures past its
current single-author phase.

### Decisions (`docs/adr/`)

Point-in-time architectural choices made at a specific moment for
specific reasons. May be revised when the underlying constraints
change.

**ADR-0001: State Mutation and `readonly` Policy.** The frontend's
state containers (BoardState, GameNode, EngineState, settings,
etc.) are mutated as part of normal operation; annotating them
`readonly` was an aspirational lie that strict mode refused to
accept. The decision: remove `readonly` from state containers,
preserve it on value objects (Move, Point, EbisuModel,
SystemMessage, etc.). Mutator convention enforced by code review.
The same philosophy applies to the backend's mutable Pydantic
models — they're allowed to have mutable fields, and the
discipline of "don't mutate outside designated mutator functions"
is the same. KataProxy operates at a lower level (raw dicts, no
mutable object graphs) but the underlying principle —
*type declarations should match actual behavior, no aspirational
annotations* — applies to its protocol type definitions.

**ADR-0003: Frontend Portability and Domain Boundaries.** A
descriptive map of the codebase's domain coupling, plus a
forward-looking principle: when designing a new module, ask "what
would change for a Chess port?" The principle's value is at
authoring time — it forces honest separation between the
abstraction and the instance, and keeps the codebase's
domain-agnostic core (~60-70% by line count) clean even as
Go-specific features land. The backend has its own analogous work
(item 34, the domain-agnostic-core umbrella; the
`PositionNormalizerPort`); KataProxy makes this a first-class
goal at its Layer 1 (the Prism abstraction is meant to support
multiple protocols, even though only KataGo is currently
implemented). All three sub-projects share the goal of
domain-portability but apply it independently and to different
degrees.

### Tenets (`docs/tenets/`)

Cross-cutting disciplines that apply to every authoring decision
and every runtime path. Tenets are not revisited the way decisions
are; they're established norms.

**Tenet-0002: Fail Loudly.** Six-level loudness hierarchy from
compile-error (best) to silent fallback (worst). Five concrete
rules: no auto-retry on real failures, justified casts (no blind
`as any`), no sentinel-instead-of-throw, ACL boundaries validate
rather than coerce, no empty catch. Three documented exceptions
where silence is correct: UI input fallbacks, idempotence
guarantees, and bounded backend compat shims. **This tenet is the
most consequential single document in the project.** It's the
reason gogui's analysis-recording feature is designed the way it
is, why the proxy cache controls are explicit rather than
implicit, why the SR review timeout cancels-rather-than-retries.
The backend adopts the same discipline — explicit ValueError
instead of assert (item 9b), error normalization (item 9c),
domain error taxonomy (item 11) — though the backend's adoption
predates this tenet's formal recording. KataProxy's documented
"the proxy runs normally without enrichment and logs one warning
at startup" pattern (when the optional `goboard_transposition`
module is missing) is exactly this tenet at work: visible
degradation, one warning, no silent feature loss.

**Tenet-0004: Minimal-Touch Edits to Partially-Visible Files.**
Authoring discipline: when editing under partial visibility, only
the lines the build tool flags get touched. Full-file rewrites
require full-file visibility. Protects against a specific
silent-failure mode (prop contract drift, composable replacement,
default-value changes — none caught by the type-checker, all
audible only at runtime). This tenet is newer than the others —
it was extracted from a real regression during the build sweep —
but it generalizes beyond Vue/TypeScript. It applies anywhere a
language has surface area the type system doesn't fully police,
which is most languages including Python (KataProxy and the
backend both have implicit-API-contract surfaces — keyword
arguments with defaults, duck-typed return shapes, dynamic
dispatch — where this tenet is directly applicable).

### Why this hierarchy matters for handoff

A new contributor to any sub-project should read all four
documents before making non-trivial changes. Together they
establish the codebase's architectural personality:

- **Honest types over aspirational annotations** (ADR-0001).
- **Loud failure over silent drift** (Tenet-0002).
- **Domain-aware seams without premature abstraction** (ADR-0003).
- **Surgical edits over speculative reconstruction** (Tenet-0004).

These four orientations are mutually reinforcing. An honest type
declaration that's surgically edited and that fails loudly when
violated is the kind of code this project is built to produce.
The opposite — aspirational types, full-file rewrites, silent
fallbacks — is the kind of code this project is built to reject.

---

## On the monorepo question

You asked whether placing all sub-projects in the same repo is
"the lazy path." It isn't — it's the correct path for this
project's specific situation. Here's why.

**Cross-repo coordination of architectural records is materially
worse than monorepo.** The four ADRs/tenets above are project-wide.
Cross-repo, you have two options: duplicate them (with drift risk
that becomes a problem the moment one side updates) or designate
one repo as canonical and have the other link out (which means
contributors to the non-canonical sides don't see the records in
their normal browsing flow). Monorepo eliminates the dilemma: one
copy, one location, visible to everyone.

**The OpenAPI codegen pipeline creates a literal compile-time
dependency.** The frontend's `src/types/backend.ts` is generated
from the backend's `/openapi.json`. In a monorepo, this is a build
step that can run automatically when the backend's schema changes.
Cross-repo, it's a manual coordination dance with potential for
the two sides to drift.

**KataProxy's contract is a public API even before it has external
adopters.** As soon as the project is released, the proxy's wire
contract — the four control flags, the `analysis_config` payload
shape, the response envelope — becomes a stability surface. If
KataProxy gains adopters beyond gogui (as its own README suggests
is the intent), breaking changes to that contract become a
multi-party coordination problem. Co-locating in the monorepo
makes the contract visible and reviewable; ideally KataProxy
should publish its own typed schema (analogous to OpenAPI) that
gogui consumes via codegen, eliminating the manual sync that
gogui's `src/engine/katago/types.ts` currently requires.

**The "release sub-projects independently" concern is real but
solved.** Modern monorepo tooling (pnpm workspaces, Turborepo,
nx, Python uv workspaces, or even a hand-rolled Makefile) supports
per-package versioning and per-package release. The sub-projects
can have distinct version numbers, distinct CHANGELOG files,
distinct release cadences. What they share is the architectural
records, the integration test suite (when it exists), and the
infrastructure that defines how the three legs talk to each other.

**The institutional-adoption question for KataProxy.** KataProxy's
README explicitly targets go schools, FoxWQ, Tygem, and
individuals running shared analysis machines. Some of those
adopters will want to deploy KataProxy without gogui or the Ebisu
backend at all — they have their own clients. Monorepo makes this
trivially supported: clone the repo, build only the proxy
sub-project, ignore the rest. A `proxy/` subdirectory with its own
build configuration is just as packageable as a standalone repo,
and adopters who want to follow proxy development don't need to
juggle multiple remote watches.

The structure I'd recommend:

```
gogui-monorepo/
  README.md                            # top-level orientation
                                       #   (lists the three
                                       #   sub-projects, points
                                       #   to each)
  docs/
    adr/
      0001-state-mutation-and-readonly.md
      0003-frontend-portability-and-domain-boundaries.md
    tenets/
      0002-fail-loudly.md
      0004-minimal-touch-edits-to-partially-visible-files.md
    ANALYSIS_PERSISTENCE_PLAN.md       # cross-cutting design notes
  TODO.md                              # joint roadmap
  frontend/                            # current gogui Vue SPA
    src/
    package.json
    README.md                          # frontend-specific concerns
  backend/                             # current fastapi_service
    fastapi_service/
    pyproject.toml
    README.md                          # backend-specific concerns
  proxy/                               # current KataProxy
    README.md                          # KataProxy's own README,
                                       #   FRAMEWORK.md,
                                       #   ARCHITECTURE.md
                                       #   stay co-located here
    AbstractProxy/
    pubsub_hub.py
    router.py
    proxy_server.py
    ...
```

The top-level `docs/` and `TODO.md` are shared; each sub-project
keeps its own README (and, in KataProxy's case, its existing
deeper architectural docs) for the concerns specific to it. The
top-level README's job is to point a new visitor to the right
sub-project for their interest.

This is not lazy. It's the structurally correct response to a
product where three sub-projects are inseparable in deployment
and inseparable in design, with the additional benefit that one
of those sub-projects (KataProxy) is intended to also be usable
standalone.

---

## Where the project is, and where it's going

### What's working well

**The reactive store + composable layer is solid (frontend).**
Twelve months of feature accretion produced a codebase where the
Vue SFC files are mostly thin renderers and the real logic lives
in composables (`useAnalysisProjection`, `useReviewSession`,
`useChartNavigation`, etc.). This separation is what made the
build sweep tractable — the type discipline could be applied to
the composables once and propagate through the components
mechanically. It's also what makes the codebase pleasant to
extend; new features follow established patterns.

**The ACL boundary at `ebisu-service.ts` is clean.** Item 30's
OpenAPI codegen lets the wire shape be authoritatively typed; the
`mapToReviewCard` translation isolates the rest of the frontend
from backend-side schema changes. When the backend renames a
field or adds a new endpoint, the change ripples to exactly one
file on the frontend side. This is the right shape and should be
preserved as a reference pattern for any future ACL surfaces —
including the eventual one between gogui and a typed KataProxy
schema, if that gets published.

**KataProxy's three-layer decomposition is its own architectural
win, separately from gogui's use of it.** The Sessions / Hub /
Router separation with each layer speaking a different ID
namespace means transformers can be authored without knowing
about coalescing, coalescing happens without knowing about
clients, and routing happens without knowing about either. This
is what makes KataProxy's two extension surfaces (Transformers
and SessionMiddleware) honest abstractions rather than convenience
APIs. gogui benefits from the result without needing to know the
architecture; institutional adopters extending KataProxy benefit
from the architecture directly.

**The analysis palette system is gogui's intellectual core, and
it's well-modularized across the boundary.** The palette grammar
(delta_fn, state_fns, summary_fn, parameters, symbols) is
editable in the SPA, transported as opaque JSON through
`analysis_config` to KataProxy, applied at KataProxy's transformer
layer without round-tripping through gogui. The architecture
cleanly supports the qEUBO calibration loop that's on the
roadmap; the architecture would also cleanly support a future
where palettes are shared between users (community palette
library) or generated from a few seed parameters (palette
templates). KataProxy's replay cache (Layer 2) is what makes the
qEUBO loop economically viable — see its FRAMEWORK.md section 3
for the proxy-side rationale.

### What's incomplete

**Backend tenancy.** The schema supports multi-tenant operation;
the read paths don't enforce it (items 13, 14, 15, 16, 23, 24,
25). For the local-install scenario this doesn't matter — there's
one user — but for any deployment where multiple users share a
backend, this is a security gap that needs closing before public
release. The work is well-scoped (~7 sub-items, mechanical
sequencing) but isn't started yet.

**Analysis persistence.** Currently every gogui session re-runs
every analysis the user looks at, even though KataProxy's
in-memory cache could serve repeats. For SR workflows
specifically, the user looks at the same positions repeatedly
across days; storing KataGo's analysis output server-side (on the
Ebisu backend, not in KataProxy's volatile cache) would
dramatically improve session startup time. The design is
documented in `docs/ANALYSIS_PERSISTENCE_PLAN.md`. The blocker
is a 15-minute DevTools session to validate the `isDuringSearch`
gating predicate against KataGo's actual terminate-ack behavior —
once that's done, the implementation is ~2 days of work.

**Pipeline DSL typing on the frontend.** The Ebisu backend has
typed pipeline stages (item 31, shipped: `SelectStage |
TakeStage | ShuffleStage | OrderStage` as a Pydantic
discriminated union). The frontend still treats `CardSet.pipeline:
any[]`. Adopting the generated types would close the largest
remaining `any` in the frontend's domain types. ~half a day of
work.

**Multi-tab support (frontend).** Currently undefined behavior;
the `SyncService` is last-write-wins (documented). If multi-tab
use becomes a real workflow (it currently isn't), an ETag-based
coordination layer is the right design — the sketch is in a
comment on `SyncService::sendSync()`. Until then, document the
single-tab assumption and move on.

**KataProxy's typed wire-contract publication.** Currently gogui's
`src/engine/katago/types.ts` is hand-maintained based on reading
KataProxy's docstrings. KataProxy is a serious enough framework
that it deserves a published, machine-readable schema (analogous
to the Ebisu backend's OpenAPI). When KataProxy gains its second
adopter, this becomes important; until then, it's a soft
recommendation. The pattern from item 30 (codegen + ACL
translation) would apply directly.

### Where the project is going (feature-level)

The frontend-side roadmap, in rough priority order:

**1. Closing the SR loop server-side (analysis persistence).**
This is the biggest user-visible improvement available. SR
sessions that take 30 seconds to load today would take 1-2
seconds with analysis caching on the Ebisu backend. The work
also lays groundwork for the next item, and complements
KataProxy's volatile cache rather than competing with it (the
proxy cache handles intra-session replay; the Ebisu-side
persistence handles inter-session replay).

**2. qEUBO palette calibration.** KataProxy's replay cache
exists specifically to make this loop feasible (see FRAMEWORK.md
section 3 — "Why this enables Tuning"). The next milestone after
analysis persistence is a calibration UI that lets the user run
"survey" sessions where the palette parameters are perturbed and
the user's reviews drive a Bayesian optimizer. The optimizer
itself can live on the Ebisu backend (Python has the right
libraries); the UI workflow is a frontend feature; the cache
substrate is KataProxy's contribution. This is a research
direction, not a polish item — the result of doing this well is
a fundamentally better SR product.

**3. Tenancy completion + public deployment.** Once items 13-26
land on the Ebisu backend, the application can be deployed as a
hosted service. The frontend-side change for this is small (item
28's JWT 401 retry handles session expiry gracefully), but the
backend work is substantial. Worth doing because the local-install
audience is small; the hosted-service audience is potentially
much larger. KataProxy's RELAY role is what makes this scalable
on the engine side — operators can run a fleet of LEAF nodes
(GPU machines) behind a single RELAY endpoint without needing to
change anything on the frontend.

**4. Community palette library.** The palette system supports
this naturally — palettes are JSON, and a "share my palette"
feature is an upload-download flow. Could be hosted alongside
the Ebisu backend or as a separate static-site feature. Not on
the critical path; depends on whether palette calibration produces
results that the community wants to share.

**5. Domain extension.** All three sub-projects have done some
work to support adopting the codebase for a different domain. The
Ebisu backend has item 34 (domain-agnostic-core umbrella);
ADR-0003 documents the frontend's portability posture; KataProxy's
Prism abstraction is intended to support multiple protocols
(though only KataGo is currently implemented). If a chess or
shogi adopter materializes, the architectural work to support
them is substantial but not infinite — ~30-40% of the frontend
would need to be rewritten (the Go-bound modules), the Ebisu
backend would carry over almost entirely, and KataProxy would
need a second protocol implementation to surface and fix the
"protocol abstraction leaks" its ARCHITECTURE.md candidly notes.

### What I'd watch for

**Drift between KataProxy's contract and the frontend's wire
type.** KataProxy is independently developed; if it gains new
control flags or changes coalescing semantics, the frontend's
`src/engine/katago/types.ts` needs to be updated to match.
There's no automated coupling between the two. The pattern
established in Commit 1b-extension (the type extension for
`cache`, `lookup_cache`, `replay_final_only`, `analysis_config`)
should be repeated whenever KataProxy's contract evolves. The
right long-term fix is the typed-schema publication noted above.

**The `gradingParameter` opacity.** This is the most opaque
field in the domain — `Record<string, any>` because the inner
shape is application-defined and changes frequently. Item 18
surfaced it to the frontend; the SR composable reads
`gradingParameter.data.analysis_config` to override the active
palette per card. If the inner shape ever stabilizes enough to
deserve a typed schema, formalize it in `types.ts` and tighten
the access sites; don't let the `Record<string, any>` become
permanent through inertia. (See Tenet-0004's spirit: aspirational
opacity is as bad as aspirational typing.)

**The `useVariationPath` boundary (frontend).** Currently
exposed as `Ref<string[]>` from a single source-of-truth
composable; `useAnalysisProjection` adapts it to `Ref<NodeId[]>`
via a documented boundary cast. The right cleanup is to tighten
`useVariationPath` itself, eliminating the adapter. ~5 lines.
A future contributor who notices the comment about this and
fixes it deserves a beer.

**KataProxy's institutional-API stability.** As soon as KataProxy
gains its second consumer (a go school, an online service, a
research group), its wire contract becomes a multi-party API.
Today, breaking changes to the four control flags are a single-
party coordination (gogui needs to update). Tomorrow, they're a
multi-party coordination. Plan accordingly — versioning the
control-flag interface, deprecation cycles for removed fields,
and ideally that typed-schema publication from above.

---

## Operational notes

**Build, lint, typecheck (frontend).** `npm run build` is the
canonical correctness check. It runs `vue-tsc -b && vite build`.
As of this handoff, the build runs cleanly; going forward, every
PR should run `npm run build` and resolve any new errors before
merging. The strict typecheck is a real safety net now; treat
it as load-bearing.

**Testing (frontend).** There is no test suite. This is an
honest gap. The codebase has been developed by single-author
iteration with careful manual review; the absence of tests is a
debt that should be paid down once the tenancy and
analysis-persistence work are settled. Suggested starting point:
integration tests at the composable level (`useReviewSession`,
`useAnalysisProjection`) since these are the highest-value units
and have well-defined inputs/outputs. KataProxy mentions being
"tested in practice" in its ARCHITECTURE.md but doesn't appear
to have a unit test suite either; both gaps should close
eventually.

**Dependencies (frontend).** Small, conservative footprint: Vue
3 + TypeScript + Vite + ECharts + CodeMirror + a few utility
libraries. No state-management library beyond Vue's built-ins
(no Pinia yet — it's a TODO, not a current dependency). Keeping
the footprint small has paid off in the build sweep; large
dependency trees would have made strict-mode adoption much
harder.

**The browser console is the user-facing debugging surface
(frontend).** The application logs aggressively to the console
(especially SyncService, AnalysisService, EbisuService). This is
intentional — the target user is technical and benefits from the
transparency. Don't suppress the logs; if you add new
functionality, log its lifecycle events at the same level of
detail. KataProxy makes the same choice (per its README,
"namespaced under `kataproxy.*` so individual subsystems can be
filtered independently") — the project as a whole values
loud, filterable observability over silent operation.

**Settings persist across sessions automatically (frontend).**
The SyncService writes the entire `GlobalStore` to the Ebisu
backend on every change (debounced). For a developer making
schema changes to the store, this means stale values can appear
after a redeploy — either bump a schema version or (more often)
just clear the local user's saved state. There's a "Force
Persistence" button in the Settings tab that's useful for
debugging.

**KataProxy operational concerns.** KataProxy's own README
covers its operational story — the four roles (LEAF / RELAY /
ECHO / REDIRECT), the env-var-driven configuration, the
deliberate absence of built-in auth/TLS (with documented
alternatives at the network layer). For institutional deployment
(go schools, online services), the RELAY role over a fleet of
LEAFs is the production pattern. For local development, a single
LEAF on `127.0.0.1:41949` is sufficient — and is exactly what
gogui's default config expects.

---

## Closing thought

The best thing about working on this codebase is that the
architecture supports the product vision across all three
sub-projects. gogui's reactive store makes the multi-board UX
trivial; the composable layer makes the SR workflow naturally
separable from the analysis workflow; the Ebisu backend's
domain-agnostic core makes future-domain adoption tractable;
KataProxy's three-layer decomposition makes its extension model
honest. None of the three is fighting its own architecture, and
they're not fighting each other.

The four ADRs/tenets are the discipline that keeps it that way.
Read them, follow them, and the codebase will continue to support
whatever direction the project takes. Skip them, and the next
strict-mode sweep won't be tractable.

The build is clean. The architecture is documented. The roadmap
is articulated. Hand off in good condition.
