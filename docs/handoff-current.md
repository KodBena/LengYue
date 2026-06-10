# Handoff — Current State

A living orientation document for the umbrella repository. Written to be
useful to someone arriving at this codebase cold — whether to extend it,
to maintain it, or to coordinate a release across the three sub-projects.
Updated as the system evolves.

This document carries **orientation, not work-status**. The canonical
record of what is open / shipped / deferred is the work-status store
(the `todo` Postgres DB, queried via `psql`; connection facts in
`services_local.gitignore`); `docs/TODO.md` is a human index over it. The per-feature "X shipped"
narratives and shipped-release roadmap this document used to carry inline
were cut to `docs/archive/notes/handoff-current-vestige.md` on 2026-06-02;
when an open item this document carries implementation-context for ships,
that context migrates to the vestige too.

For specific architectural decisions, see the ten ADRs in `docs/adr/`. For
backend architectural retrospective, see `docs/notes/reflection.md`. For
the v1.0.0 release retrospective, see
`docs/archive/notes/release-retrospective-2026-04.md`. For moment-in-time
snapshots and the v1 scope freeze, see `docs/archive/`.

---

## What this product is

A study application for the game of Go (Weiqi). The user loads SGF games —
their own play, professional games, problem sets — and the application
stages them as flashcards in a spaced-repetition system, evaluated by
KataGo (the strongest publicly available Go engine).

The pedagogy this product serves is multifaceted rather than
single-thesis. The project author has named these vantage points (partial
enumeration — more exist that haven't yet been articulated):

- **KataGo doesn't relent.** Because every move is going to be punished for
  not being your best, you learn over time to be fearless no matter who you
  play.
- **Reading becomes a discipline and a habit.** Working positions in this
  mode trains the user toward not wanting to play until reasonably certain
  — a posture that transfers to live play.
- **Limited moves limit demoralisation.** A single position is smaller than
  a game; if you lose a position, you just move on to the next one.
- **Heredity tracking offloads branching problems.** Storing variations as
  parent-child positions externalises the parts of a calculation tree that
  would otherwise have to be held in head.
- **High volume forces parsimonious compression.** Reviewing many positions
  resists memorisation as a strategy — the brain has to find parsimonious
  representations, which is what actual understanding looks like. KataGo
  changing its mind regularly reinforces this and also seeds the forest of
  cards in the first place.

Mechanically, Ebisu's Bayesian recall model schedules reviews and KataGo's
position evaluation grades them; the rest of this document describes the
surfaces built around those two.

What makes this distinctive:

- **The analysis palette system.** Move quality in Go isn't a single
  number. KataGo emits a packet of metrics (winrate, score lead, visit
  distribution, ownership map, policy head, principal variations) and the
  *meaningful* signal for any given study context is some palette-defined
  function over them. The palette is user-editable.
- **The qEUBO calibration loop.** Picking palette parameters by hand is a
  research problem this project doesn't claim to have solved. The roadmap
  includes Bayesian optimization over palette parameters, evaluated by user
  satisfaction with the surfaced reviews. KataProxy's analysis-level cache
  is what makes this loop economically feasible. (Feature-complete,
  validation pending — see "Where the project is going.")
- **Transparent depth.** The application exposes its abstractions — the
  registry editor lets the user inspect and modify the full settings tree;
  the palette editor exposes the function definitions; the pipeline DSL
  lets the user define custom card sets via composable selection/ordering
  operators. The target audience (serious Go researchers) gets value from
  being able to reach into the machinery.

What this is not, and is not trying to become: a casual learning app, a
multiplayer client, or a game database. The engine is the only opponent in
the building; storage is incidental to the SR workflow.

---

## The umbrella

The product is composed of **three independently-developed, peer-level
sub-projects**. Each has its own architecture, its own intended user base,
and its own development history. They integrate at well-defined
boundaries; none is subordinate to the others.

- **`frontend/`** — Vue 3 + TypeScript SPA (formerly the `gogui`
  repository). The user-facing client.
- **`backend/`** — FastAPI + SQLAlchemy 2.0 service (formerly the
  `fastapi_service` repository). Spaced-repetition core (Ebisu-based), card
  and tree storage, and the tenancy boundary.
- **`proxy/`** — KataProxy, included as a git submodule. KataGo analysis
  bridge with a three-layer architecture; intended for use by go schools,
  online go services, and individual operators sharing analysis machines.

The "soft monorepo" choice is deliberate: each sub-project keeps its own
dependencies, build tooling, lint config, and `.gitignore`. There is no
root-level `package.json`, no shared `pyproject.toml`, no top-level test
runner. The decision is recorded in
`docs/playbooks/monorepo/monorepo-plan.md`, which also captures the
structural moves that produced the current layout.

System-level documentation lives in `docs/`. Subproject-internal
documentation lives in each subproject's `docs/` (currently only
`backend/docs/`, which holds the Tree-DSL reference). For day-to-day
"what's in this repo" navigation, the root `README.md` is the entry point.

### Integration model

- **Frontend ↔ backend**: REST + JWT auth, with an OpenAPI-typed ACL in
  `frontend/src/services/backend-service.ts`. The frontend never talks to
  the backend's database directly; the ACL translates wire shapes
  (snake_case) into clean domain types (camelCase, branded). The codegen
  pipeline (`npm run gen:api`) keeps the two sides honestly synced.
- **Frontend ↔ proxy**: WebSocket. KataProxy's wire contract is a superset
  of KataGo's native analysis protocol — it accepts every field KataGo's
  binary accepts, plus four control flags (`cache`, `lookup_cache`,
  `replay_final_only`, `analysis_config`) that KataProxy interprets at its
  Hub layer. The frontend's `src/engine/katago/types.ts` describes the
  specific subset gogui uses.
- **Backend ↔ proxy**: none. The proxy is purely a frontend-facing service
  for live analysis queries. The analysis-persistence path adds a backend
  write path for analysis bundles — the frontend captures KataGo responses
  via the proxy and uploads them as bundles to the backend's
  `/analysis-bundles` endpoint — but the proxy itself never talks to the
  backend.

The three sub-projects are coupled at the *protocol* level (wire formats,
JSON shapes, action verbs) but decoupled at the *implementation* level.
Each could be reimplemented in a different language without affecting the
others.

---

## The frontend

A Vue 3 + TypeScript SPA. The architecture has settled into three layers:

- **Components** (`src/components/*`, `src/App.vue`) — Vue SFCs; thin
  renderers, plus the minimum wiring to composables.
- **Composables** (`src/composables/*`) — the real logic layer.
  `useReviewSession`, `useAnalysisProjection`, `useChartNavigation`, and
  others. Pure-ish functions over reactive refs.
- **Services** (`src/services/*`) — effectful singletons. API calls,
  WebSocket clients, debounced persistence. The ACL at `backend-service.ts`
  is the boundary where backend wire shapes become domain types.

State lives in a single reactive `GlobalStore` (`src/store/index.ts`).
There is no Pinia — using Vue's built-ins kept the dependency footprint
small. The strict-mode build (`vue-tsc -b`) is load-bearing and part of
the regular contributor workflow; the OpenAPI codegen pipeline
(`npm run gen:api`) keeps the wire types honest. For the narrative of how
those (and the capability-negotiation, knob-registry, and perf arcs)
landed, see `docs/archive/notes/handoff-current-vestige.md`.

The frontend is **domain-specific to Go**. ADR-0003 documents this
honestly: roughly 30-40% of the frontend is Go-bound (the SGF parsing,
board renderer, KataGo wire vocabulary), with the remainder domain-agnostic
infrastructure that a Chess or Shogi port could reuse.

### Open gap (frontend)

- **`reportAnalysisWinratesAs` non-WHITE: raw-packet normalisation
  shipped; proxy-side palette enrichment still in wire framing.** The
  KataGo `overrideSettings.reportAnalysisWinratesAs` setting (surfaced in
  the registry editor as a typed dropdown per the `WinrateFraming` union in
  `frontend/src/engine/katago/types.ts`) controls the sign convention of
  `winrate`, `scoreLead`, and `ownership` in response packets.

  The receipt-time normalisation layer landed in
  `frontend/src/engine/katago/winrate-framing.ts` and is wired into
  `analysis-service.ts::onAnalysisUpdate`: every packet is normalised to
  canonical 'WHITE' framing before `ledger.record`, so the raw-packet
  consumers (liveness overlay, score series, ownership renderer, move
  suggestions, the bundle-export path, `waitForAnalysis`) see consistent
  signs regardless of what the user asked KataGo for. The typed signed
  scalars (winrate, scoreLead, ownership) are flipped at the contract
  level; the commonly-emitted untyped siblings (scoreMean, scoreSelfplay,
  utility, utilityLcb, lcb) are flipped defensively when present.

  The residual gap is **proxy-side palette enrichment**. The proxy applies
  user-authored `state_fn` / `delta_fn` / `summary_fn` expressions on
  KataGo's response BEFORE the packet reaches the frontend. Those functions
  see the wire framing (whatever the user asked for); the resulting
  `extra.state[turn]['Win Probability']` values are in the wire framing,
  not in canonical 'WHITE'. So a user with `reportAnalysisWinratesAs:
  'BLACK'` who renders the default `'Win Probability'` state_fn (which reads
  `x["rootInfo"]["winrate"]`) sees a chart in BLACK framing even though the
  raw packet's `rootInfo.winrate` is normalised to WHITE.

  Two paths to close this:
    1. **Compensating state_fns** — author palette expressions that read
       `player_sign(x)` (already in the seeded symbol library) and multiply
       through. User-side fix; works for custom palettes today.
    2. **Proxy-side normalisation** — have the proxy normalise packets to
       'WHITE' before applying the palette, so enrichment is always in
       canonical framing. Cross-team arc; would land via dispatch.

  Until either path closes, leaving the registry value at the seeded 'WHITE'
  is the configuration that's consistent end-to-end without bespoke
  state_fn authoring. The dropdown lists all three accepted values;
  `engine/katago/winrate-framing.ts`'s file header is the scope-of-the-fix
  reference.

---

## The backend

A FastAPI + SQLAlchemy 2.0 service. Clean / Hexagonal Architecture; the
Dependency Rule is enforceable by import-graph inspection.

**Seven Ports** declare what the inner layers need from the outer:
`CardRepositoryPort`, `CardWriteRepositoryPort`, `LineageRepositoryPort`,
`TagFilterRepositoryPort`, `StatsRepositoryPort`,
`StaticResourceRepositoryPort`, and `GameLibraryRepositoryPort`. Each Port
returns domain entities or DTOs (`Card`, `CardNode`, `ForestMemberRow`,
etc.), never SQLAlchemy Rows or CTEs. This is the seam any future domain
adoption flows through.

**The backend is genuinely domain-agnostic.** The de-branding arc (items
34 / 34a / 34b) took the service from Go-specific (`sgf`,
`normalized_sgf`, `pos_hash`) to neutral (`raw_content`,
`canonical_content`, `content_hash`). A Chess adoption now requires writing
one Python file implementing `PositionNormalizerPort` plus light DI wiring;
see `backend/README.md`'s "Adopting for another domain" section for the
full checklist.

**The backend is multi-tenant.** Every domain object the user authors is
tenant-scoped by `user_id`; the single config flag
`ALLOW_PASSWORDLESS_LOGIN: bool = True` flips the system between
"transparent local install" and "multi-tenant deployment." The complete
model is documented in `docs/notes/tenancy.md`. (The spine shipped
end-to-end — see the vestige.)

**Migration tooling is Alembic, auto-applied at startup.** The lifespan in
`backend/main.py` runs `metadata.create_all` followed by
`db.alembic_bootstrap.bootstrap_alembic`, which probes the live DB's schema
state, stamps `alembic_version` at the appropriate revision for installs
not yet Alembic-managed, and runs `alembic upgrade head`. End-users on the
post-Alembic-arc releases don't run migration scripts by hand. Pre-v1.0
installs are brought forward automatically: the bootstrap runs the
pre-Alembic `backend/scripts/migrate_*.py` ``migrate()`` functions in
dependency order (each idempotent) before stamping, so a restart is enough
to upgrade from any prior shape. The legacy scripts remain in-tree as the
mechanism the bootstrap calls into; new schema changes ship as Alembic
revisions under `backend/alembic/versions/`.

### Open gaps (backend)

- **`PipelineExecutor.run()` couples lineage and tag-filter into one
  method.** Two Port calls, one method. Conceptually independent,
  temporally coupled. Worth a refactor if the executor grows further; not
  worth it at the current size.
- **No row-level audit log.** The system records `user_id` on every row but
  doesn't track which user made which change to which row over time. Fine
  for single-user or trust-each-other-Alice-and-Bob deployments; would need
  an audit table for any compliance-flavored deployment.
- **No tenant deletion path.** Removing a user means cascade-deleting their
  cards, documents, and game_sources. The schema has the right `ON DELETE
  CASCADE` clauses but no user-level cascade script exists. Deferrable until
  needed.

---

## The proxy

KataProxy is included as a git submodule pinned to a specific commit. The
architecture is independently designed and worth reading separately if
extending the proxy itself; gogui consumes it through a stable wire
protocol and rarely needs to know internals.

**Three-layer design** (Sessions / Hub / Router) with each layer speaking a
different ID namespace. Transformers can be authored without knowing about
coalescing; the Hub coalesces without knowing about clients; the Router
dispatches without knowing about either. This separation is what makes
KataProxy's two extension surfaces (Transformers and SessionMiddleware)
honest abstractions rather than convenience APIs.

**Five operational roles**: LEAF (engine-bound process), RELAY
(public-facing aggregator over many LEAFs), SELECTOR (per-query dispatch
against a labelled upstream pool, added in v1.0.15), ECHO (test/replay),
REDIRECT (compat shim). For local development, a single LEAF on
`127.0.0.1:41948` is sufficient — and is exactly what the frontend's
default config expects (matching `proxy/run_leaf.sh`'s default). For
institutional deployment, the RELAY-over-LEAF pattern is the production
shape; SELECTOR-over-LEAFs is the variant when end-users should pick the
analyzing model per query (the SPA's model-selector dropdown).

The proxy is independently developed and intended for use beyond gogui — go
schools, online go services (FoxWQ, Tygem, etc.), and research groups
sharing analysis machines. As soon as it gains a second consumer, its wire
contract becomes a multi-party API; a typed schema publication (analogous
to the backend's OpenAPI) will become important at that point. The first
step toward that shipped as `docs/wire-schemas.md` (umbrella PR #204) — a
descriptive reference for every wire shape that crosses a sub-project
boundary in the LengYue system, with the producer's source named as
canonical authority.

The current pin is **v1.0.27**. The arc since v1.0.20 (the
structured-logging release) is: v1.0.20 structured logging end to end;
v1.0.21 the `adaptive_reevaluate` sub-query enrichment fix plus the
identity-type branding migration (the four namespace boundaries —
`ClientId`, `InternalId`, `CanonicalId`, `WireId` — as distinct
`typing.NewType` brands, with a `mypy --strict` pass and a CI gate at
`proxy/.github/workflows/typecheck.yml`); and v1.0.22–v1.0.27 the
`adaptive_reevaluate` evolution (move/turn axis branding, selector
pluggability + window correction, multi-round adaptation + budget
abstraction, and orchestration-substrate fixes for SPA-side adaptive
reaping). See the proxy's per-tag annotations for the full changelog.

For the proxy's own architecture, framework, and operational documentation,
see `proxy/README.md`, `proxy/FRAMEWORK.md`, and `proxy/ARCHITECTURE.md`
inside the submodule.

---

## Architectural governance — ADRs and tenets

The ten foundational architectural records live in `docs/adr/` — two
structural records (ADR-0001, a decision; ADR-0003, a bounded-context
map) and eight tenets (ADR-0002, 0004–0010). **All ten apply
project-wide**, regardless of which sub-project's history they
originated in.

The condensed per-ADR reference is `docs/adr-synopsis.md` — the single
derived summary (declared via its `derived-from` marker), watched by the
per-PR co-change advisory in CI (advisory, not a gate); where it disagrees
with an ADR, the ADR wins. This section deliberately does not duplicate it
(ADR-0005 Rule 1).

Together they establish the codebase's architectural personality: honest
types over aspirational annotations (ADR-0001); loud failure over silent
drift (ADR-0002); domain-aware seams without premature abstraction
(ADR-0003); surgical edits over speculative reconstruction (ADR-0004);
documentation that doesn't drift into silence (ADR-0005); files that
identify themselves (ADR-0006); working memory budgets that keep partial
visibility rare (ADR-0007); honest classification refusing fuzzy matches
and synthetic fabrications (ADR-0008); performance claims substantiated by
reproducible investigation (ADR-0009); render locality and canvas for
data-dense visuals (ADR-0010). Read all ten before making non-trivial
changes; a contribution against the grain causes friction wherever it
touches.

---

## Where the project is going

This is the forward-looking roadmap — what to pick up next. The actionable,
status-bearing item list lives in the work-status store (the `todo` Postgres
DB, queried via `psql`; `docs/TODO.md` is a human index over it); shipped
releases and completed arcs are recorded in
`docs/archive/notes/handoff-current-vestige.md`.

The **distribution-packaging memo**
(`docs/notes/distribution-packaging.md`) is the leading edge: making the
software installable by users who don't know `npm` or `fastapi` is the next
undertaking, and it's the structural blocker between "tenancy spine works"
and "hosted deployment ships."

- **qEUBO palette calibration — feature-complete, validation pending.** The
  Bayesian preference-based optimization integration shipped during the v1
  arc (backend MIT-boundary wrapper, REST routes, frontend `useQeubo`
  composable, toolbar A/B cluster, parameter-meta editor in `PaletteEditor`,
  bookmarks UI panel). End-to-end UI smoke with Redis is still the remaining
  validation gate. Status table at `docs/archive/notes/qEUBO.md`. The
  runtime is opt-in (`QEUBO_ENABLED=False` by default) because the
  dependency footprint is heavy and the validation incomplete. The proxy's
  replay cache (Layer 2) exists specifically to make this loop economically
  feasible at scale.
- **Public deployment.** Once tenancy is real (it is, in code) and
  distribution packaging lands, the application can move from local-install
  to hosted service. The proxy's RELAY-over-LEAF pattern is what makes the
  engine side scalable.
- **Domain extension.** All three sub-projects support domain adoption to
  varying degrees. The backend is genuinely portable. The frontend's
  ADR-0003 maps the work: a same-class port (chess, shogi) rewrites the
  Go-bound ~30-40%; a non-game knowledge domain additionally *splits* the
  game-tree-coupled band (the SR-orchestration flow and generic charting
  survive; the tree skeleton does not — the ADR's 2026-06-10 amendment
  carries both sizings). One adopter has materialized (the maintainer's
  intended generic knowledge flash-card fork), with a second prospective
  adopter filed on the game-class axis (the `chess-clone` work-status
  item; its own proof-of-concept gate is unmet). The proxy's Prism abstraction is
  intended to support multiple protocols, though only KataGo is currently
  implemented. The work is substantial but bounded.
- **Community palette library** is on the longer-term horizon — palettes are
  JSON, and a "share my palette" feature is an upload-download flow. Could
  be hosted alongside the backend or as a separate static-site feature.
  Depends on whether palette calibration produces results the community
  wants to share.

---

## Rough edges to know about

Beyond the per-subproject gaps named above, three cross-cutting concerns
worth surfacing:

**Drift between the proxy's contract and the frontend's wire type.** The
proxy is independently developed; if it gains new control flags or changes
coalescing semantics, the frontend's `src/engine/katago/types.ts` needs to
be updated to match. There is no automated coupling between the two. The
right long-term fix is the typed-schema publication noted in the Proxy
section.

**The `gradingParameter` opacity.** The most opaque field in the domain
model — `Record<string, any>` because the inner shape is
application-defined and changes frequently. The SR composable reads
`gradingParameter.data.analysis_config` to override the active palette per
card. If the inner shape ever stabilizes enough to deserve a typed schema,
formalize it in `types.ts` and tighten the access sites; don't let the
`Record<string, any>` become permanent through inertia.

**Multi-tab support.** Currently undefined behavior; the `SyncService` is
last-write-wins (documented). If multi-tab use becomes a real workflow (it
currently isn't), an ETag-based coordination layer is the right design —
the sketch is in a comment on `SyncService::sendSync()`. Until then,
document the single-tab assumption and move on.

For backend-specific rough edges (the executor's coupling, the migration
scripts' single-deployment assumption), see `docs/notes/reflection.md`.
That document is the most candid available accounting of where the
backend's load bears unevenly.

---

## Operational notes

**Frontend.** `npm run build` is the canonical correctness check. It runs
`vue-tsc -b && vite build`. Every PR should run it and resolve any new
errors before merging. The strict typecheck is load-bearing.

**Frontend logging.** The application logs aggressively to the browser
console (especially `SyncService`, `AnalysisService`, `BackendService`).
This is intentional — the target user is technical and benefits from
transparency. Don't suppress the logs; if you add new functionality, log
its lifecycle events at the same level of detail. The proxy makes the same
choice (namespaced under `kataproxy.*` so individual subsystems can be
filtered independently). The project as a whole values loud, filterable
observability over silent operation.

**Frontend persistence.** The `SyncService` writes the entire `GlobalStore`
to the backend on every change (debounced). For a developer making schema
changes to the store, stale values can appear after a redeploy — either
bump a schema version or clear the local user's saved state. There's a
"Force Persistence" button in the Settings tab useful for debugging.

**Backend.** `cd backend && pytest` runs the test suite across the four
tiers documented in `tests/CLAUDE.md` (pure-domain unit, service unit with
Port fakes, adapter integration, route via httpx + ASGITransport). For
local development:

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py --host 127.0.0.1 --port 8764
```

Schema is bootstrapped on every backend start: `metadata.create_all` plus
`db.alembic_bootstrap.bootstrap_alembic` together apply any pending Alembic
revisions automatically. End-users pulling a new release just restart the
backend; the lifespan migrates the DB forward. Operator commands (`alembic
current`, `history`, `upgrade head`, `downgrade -1`) are documented in
`backend/README.md`. Pre-v1.0 installs run the legacy
`backend/scripts/migrate_*.py` once to reach v1.0 baseline before the
bootstrap can stamp them.

**Proxy.** See `proxy/README.md`. The five roles (LEAF / RELAY / SELECTOR /
ECHO / REDIRECT) are env-var-driven; built-in auth/TLS is deliberately
absent (with documented alternatives at the network layer).

**Cross-team coordination.** When authoring a document for another
sub-project, file it under `docs/dispatch/` following the
`{from}-to-{to}-{topic}.md` convention and reference it in commit messages
so the receiving team finds it without archaeology. (The dispatch ledger
grew out of the pre-release sweep, where three backend-authored briefings
to the frontend ended up in three different places.)

---

## Where to read further

In rough order of priority for a new contributor:

- **`docs/adr/`** — The ten ADRs. Read these first.
- **The `todo` Postgres database** — The work-status store: every open /
  shipped / deferred work-actionable item, with structured references and
  typed status. Query it with `psql -h 192.168.122.1 -d todo` (relational
  schema in `tools/work-status/schema.sql`); `docs/TODO.md` is a human
  index over it.
- **`docs/notes/tenancy.md`** — How multi-tenancy flows through the backend.
- **`docs/notes/reflection.md`** — Backend architectural retrospective. The
  "Rough edges to know about" section is unusually candid.
- **`docs/archive/notes/release-retrospective-2026-04.md`** — Whole-project
  retrospective at the close of v1.0.0. Honest assessment from a
  contributor perspective.
- **`docs/archive/notes/handoff-current-vestige.md`** — The delivered-surface
  narratives this document used to carry inline (build sweep, codegen,
  capability negotiation, knob registry, perf arcs, SGF library, the shipped
  releases and roadmap arcs).
- **`backend/README.md`** — Backend-specific concerns; includes the
  "Adopting for another domain" checklist.
- **`frontend/README.md`** — Frontend-specific concerns; includes the
  OpenAPI codegen workflow rationale.
- **`frontend/FILES.md`** / **`frontend/IDENTIFIERS.md`** — The file map and
  the branded-identifier lookup map; navigate the SPA's surface and its
  identifier types without trawling source.
- **`backend/docs/tree-dsl.md`** — Tree-DSL reference for the pipeline
  executor.
- **`docs/notes/design/autonomous-srs-loop-revised.md`** — Pre-implementation
  design note for the autonomous spaced-repetition loop (post-SELECTOR +
  capability-negotiation shipping). Companion sibling
  `autonomous-srs-loop.md` is the planning-time record retained per ADR-0005
  Rule 8.
- **`docs/archive/`** — Historical artifacts kept for reference. The
  pre-umbrella HANDOFFs (the frontend's bird's-eye orientation, the three
  34b-project communications) capture moment-in-time states. See
  `docs/archive/README.md` for the archive's own orientation.
- **`docs/playbooks/monorepo/`** — The restructuring playbooks (Part A:
  structural; Part B: editorial) that produced the current layout. Useful
  for understanding why things are arranged the way they are.
- **`proxy/README.md`**, **`proxy/FRAMEWORK.md`**,
  **`proxy/ARCHITECTURE.md`** — Inside the submodule. Required reading
  before making non-trivial changes to the proxy.

---

## Closing

The codebase is in good shape. Seven Ports cleanly composed on the backend,
ten ADRs that capture the discipline, a tenancy spine that's honest about
what it guarantees, migration tooling reusable for the next schema change.
The frontend's analogous work (typed wire shapes, fail-loud surfacing,
OpenAPI codegen) means the two halves of the system understand each other.
The proxy's three-layer decomposition is its own architectural win.

What remains — distribution packaging, eventual public deployment, the
remaining frontend test breadth — is incremental work on a sound
foundation. None of it requires architectural excavation.

Hand off in good condition.
