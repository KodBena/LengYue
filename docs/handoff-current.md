# Handoff — Current State

A living orientation document for the umbrella repository. Written
to be useful to someone arriving at this codebase cold — whether
to extend it, to maintain it, or to coordinate a release across
the three sub-projects. Updated as the system evolves.

For specific architectural decisions, see the seven ADRs in
`docs/adr/`. For active work, see `docs/TODO.md`. For backend
architectural retrospective, see `docs/notes/reflection.md`. For
the v1.0.0 release retrospective, see
`docs/notes/release-retrospective-2026-04.md`. For moment-in-time
snapshots and the v1 scope freeze, see `docs/archive/`.

---

## What this product is

A study application for the game of Go (Weiqi). The user loads
SGF games — their own play, professional games, problem sets —
and the application stages them as flashcards in a
spaced-repetition system, evaluated by KataGo (the strongest
publicly available Go engine).

The product thesis is that **deep Go improvement comes not from
volume but from focused review of positions where the user's
intuition and the engine's evaluation diverge.** The combination
of Ebisu's Bayesian recall model (for scheduling) and KataGo's
position evaluation (for grading) is the engineered version of
"play the position, see what you think the right move is, see
what KataGo thinks, and feel the difference."

What makes this distinctive:

- **The analysis palette system.** Move quality in Go isn't a
  single number. KataGo emits a packet of metrics (winrate,
  score lead, visit distribution, ownership map, policy head,
  principal variations) and the *meaningful* signal for any
  given study context is some palette-defined function over
  them. The palette is user-editable.
- **The qEUBO calibration loop (planned).** Picking palette
  parameters by hand is a research problem this project doesn't
  claim to have solved. The roadmap includes Bayesian
  optimization over palette parameters, evaluated by user
  satisfaction with the surfaced reviews. KataProxy's
  analysis-level cache is what makes this loop economically
  feasible.
- **Transparent depth.** The application exposes its
  abstractions — the registry editor lets the user inspect and
  modify the full settings tree; the palette editor exposes the
  function definitions; the pipeline DSL lets the user define
  custom card sets via composable selection/ordering operators.
  The target audience (serious Go researchers) gets value from
  being able to reach into the machinery.

What this is not, and is not trying to become: a casual learning
app, a multiplayer client, or a game database. The engine is the
only opponent in the building; storage is incidental to the SR
workflow.

---

## The umbrella

The product is composed of **three independently-developed,
peer-level sub-projects**. Each has its own architecture, its
own intended user base, and its own development history. They
integrate at well-defined boundaries; none is subordinate to the
others.

- **`frontend/`** — Vue 3 + TypeScript SPA (formerly the `gogui`
  repository). The user-facing client.
- **`backend/`** — FastAPI + SQLAlchemy 2.0 service (formerly
  the `fastapi_service` repository). Spaced-repetition core
  (Ebisu-based), card and tree storage, and the tenancy boundary.
- **`proxy/`** — KataProxy, included as a git submodule. KataGo
  analysis bridge with a three-layer architecture; intended for
  use by go schools, online go services, and individual
  operators sharing analysis machines.

The "soft monorepo" choice is deliberate: each sub-project keeps
its own dependencies, build tooling, lint config, and
`.gitignore`. There is no root-level `package.json`, no shared
`pyproject.toml`, no top-level test runner. The decision is
recorded in `docs/playbooks/monorepo/monorepo-plan.md`, which
also captures the structural moves that produced the current
layout.

System-level documentation lives in `docs/`. Subproject-internal
documentation lives in each subproject's `docs/` (currently only
`backend/docs/`, which holds the Tree-DSL reference). For
day-to-day "what's in this repo" navigation, the root
`README.md` is the entry point.

### Integration model

- **Frontend ↔ backend**: REST + JWT auth, with an OpenAPI-typed
  ACL in `frontend/src/services/backend-service.ts`. The frontend
  never talks to the backend's database directly; the ACL
  translates wire shapes (snake_case) into clean domain types
  (camelCase, branded). The codegen pipeline (`npm run gen:api`)
  keeps the two sides honestly synced.
- **Frontend ↔ proxy**: WebSocket. KataProxy's wire contract is
  a superset of KataGo's native analysis protocol — it accepts
  every field KataGo's binary accepts, plus four control flags
  (`cache`, `lookup_cache`, `replay_final_only`,
  `analysis_config`) that KataProxy interprets at its Hub layer.
  The frontend's `src/engine/katago/types.ts` describes the
  specific subset gogui uses.
- **Backend ↔ proxy**: none. The proxy is purely a
  frontend-facing service for live analysis queries. The
  cross/analysis-persistence arc adds a backend write path for
  analysis bundles — the frontend captures KataGo responses via
  the proxy and uploads them as bundles to the backend's
  `/analysis-bundles` endpoint — but the proxy itself never
  talks to the backend.

The three sub-projects are coupled at the *protocol* level (wire
formats, JSON shapes, action verbs) but decoupled at the
*implementation* level. Each could be reimplemented in a
different language without affecting the others.

---

## The frontend

A Vue 3 + TypeScript SPA. The architecture has settled into
three layers:

- **Components** (`src/components/*`, `src/App.vue`) — Vue SFCs;
  thin renderers, plus the minimum wiring to composables.
- **Composables** (`src/composables/*`) — the real logic layer.
  `useReviewSession`, `useAnalysisProjection`, `useChartNavigation`,
  and others. Pure-ish functions over reactive refs.
- **Services** (`src/services/*`) — effectful singletons. API
  calls, WebSocket clients, debounced persistence. The ACL at
  `backend-service.ts` is the boundary where backend wire shapes
  become domain types.

State lives in a single reactive `GlobalStore` (`src/store/index.ts`).
There is no Pinia yet — using Vue's built-ins kept the
dependency footprint small, which paid off during the strict-mode
build sweep.

**The build sweep is closed.** `vue-tsc -b` had not been run in
months when the work began; ~124 strict-mode errors surfaced.
Closed across 11 commits, with one regression caught and fixed
mid-sweep — the regression became the proximate motivation for
ADR-0004. Since then, `npm run build` is part of the regular
contributor workflow and the strict typecheck is a real safety
net rather than a fictional one.

**The OpenAPI codegen pipeline is operational.** `npm run gen:api`
runs `openapi-typescript` against the backend's live
`/openapi.json` and writes a TypeScript declaration of every
wire shape to `src/types/backend.ts`. That file is committed
(reasoning: reproducibility, review signal, end-user builds —
see `frontend/README.md` for the full justification). The ACL at
`backend-service.ts` consumes the generated types; backend
refactors that rename a field produce TypeScript compile errors
at every site that reads the old name.

**The proxy v1.0.14+ capability-negotiation contract is consumed.**
`analysis-service.ts::probeEngineInfo` reads the optional
`capabilities` advertisement from `query_version`'s response into
`store.engine.info.capabilities`; per-query opt-in is built by the
pure helper in `engine/katago/capability-injection.ts` at every
analyze call site. The SPA always opts in to `delta_analysis`
(refusing the connection at probe time if a capability-aware proxy
lacks it), opts in to `transposition` when the new
`engine.katago.useTransposition` registry toggle is on AND the proxy
advertises it (with a probe-time system-message warning when the
toggle is on but the capability is absent), and opts in to
`adaptive_reevaluate` on live range-based queries only (omitted on
snapshot replays so review-session timing stays turn-locked).
SELECTOR routing surfaces as a Toolbar dropdown gated on
`capabilities.selector` and a `model: string` field injected at the
ACL when `store.engine.selectedModel` is non-null; the test-harness
exports (`playEngineMoves` / `queryEngineMove` in
`composables/usePlayFromPosition.ts`) gain optional `model` and
`capabilities` parameters for the multi-weights and LLM-at-seat
scenarios the autonomous-SR loop note sketches. The
contract reference lives in the dispatch chain at
`docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`
(frontend ask), `docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`
(proxy sign-off, six open questions answered including the Q6
canonical-key bifurcation), and the frontend-side design note at
`docs/notes/proxy-selector-and-capability-negotiation.md`.

The frontend is **domain-specific to Go**. ADR-0003 documents
this honestly: roughly 30-40% of the frontend is Go-bound (the
SGF parsing, board renderer, KataGo wire vocabulary), with the
remainder domain-agnostic infrastructure that a Chess or Shogi
port could reuse.

### Known gaps (frontend)

- *(retired 2026-05-08)* ~~No test suite.~~ Closed by the
  five-phase frontend testing arc (PRs #178, #179, #180, #181,
  #182, plus the Phase 5 docs PR). The frontend ships 100 tests
  across three tiers (`tests/unit/` pure logic, `tests/fakes/`
  service substitutes, `tests/integration/` composable + store
  integration). Closing reflection:
  `docs/notes/frontend-test-coverage-2026-05.md`. Component-level
  tests, E2E, visual regression, and CI integration (gating
  `npm run build` on the suite) remain explicit follow-ups, but
  the foundational gap — "no automated tests at all" — is closed.

- **`reportAnalysisWinratesAs` non-WHITE: raw-packet normalisation
  shipped; proxy-side palette enrichment still in wire framing.**
  The KataGo `overrideSettings.reportAnalysisWinratesAs` setting
  (surfaced in the registry editor as a typed dropdown per the
  `WinrateFraming` union in `frontend/src/engine/katago/types.ts`)
  controls the sign convention of `winrate`, `scoreLead`, and
  `ownership` in response packets.

  The receipt-time normalisation layer landed in
  `frontend/src/engine/katago/winrate-framing.ts` and is wired
  into `analysis-service.ts::onAnalysisUpdate`: every packet is
  normalised to canonical 'WHITE' framing before
  `ledger.record`, so the raw-packet consumers (liveness overlay,
  score series, ownership renderer, move suggestions, the
  bundle-export path, `waitForAnalysis`) see consistent signs
  regardless of what the user asked KataGo for. The typed signed
  scalars (winrate, scoreLead, ownership) are flipped at the
  contract level; the commonly-emitted untyped siblings
  (scoreMean, scoreSelfplay, utility, utilityLcb, lcb) are flipped
  defensively when present.

  The residual gap is **proxy-side palette enrichment**. The
  proxy applies user-authored `state_fn` / `delta_fn` / `summary_fn`
  expressions on KataGo's response BEFORE the packet reaches the
  frontend. Those functions see the wire framing (whatever the
  user asked for); the resulting `extra.state[turn]['Win Probability']`
  values are in the wire framing, not in canonical 'WHITE'. So a
  user with `reportAnalysisWinratesAs: 'BLACK'` who renders the
  default `'Win Probability'` state_fn (which reads
  `x["rootInfo"]["winrate"]`) sees a chart in BLACK framing even
  though the raw packet's `rootInfo.winrate` is normalised to
  WHITE.

  Two paths to close this:
    1. **Compensating state_fns** — author palette expressions
       that read `player_sign(x)` (already in the seeded symbol
       library) and multiply through. User-side fix; works for
       custom palettes today.
    2. **Proxy-side normalisation** — have the proxy normalise
       packets to 'WHITE' before applying the palette, so
       enrichment is always in canonical framing. Cross-team
       arc; would land via dispatch.

  Until either path closes, leaving the registry value at the
  seeded 'WHITE' is the configuration that's consistent
  end-to-end without bespoke state_fn authoring. The dropdown
  lists all three accepted values; `engine/katago/winrate-framing.ts`'s
  file header is the scope-of-the-fix reference.

---

## The backend

A FastAPI + SQLAlchemy 2.0 service. Clean / Hexagonal
Architecture; the Dependency Rule is enforceable by import-graph
inspection.

**Six Ports** declare what the inner layers need from the outer:
`CardRepositoryPort`, `CardWriteRepositoryPort`,
`LineageRepositoryPort`, `TagFilterRepositoryPort`,
`StatsRepositoryPort`, `StaticResourceRepositoryPort`. Each Port
returns domain entities or DTOs (`Card`, `CardNode`,
`ForestMemberRow`, etc.), never SQLAlchemy Rows or CTEs. This is
the seam any future domain adoption flows through.

**The backend is genuinely domain-agnostic.** Items 34, 34a, and
34b closed the wire-rename and schema-rename work that took the
service from Go-specific (`sgf`, `normalized_sgf`, `pos_hash`)
to neutral (`raw_content`, `canonical_content`, `content_hash`).
A Chess adoption now requires writing one Python file
implementing `PositionNormalizerPort` plus light DI wiring; see
`backend/README.md`'s "Adopting for another domain" section for
the full checklist.

**The tenancy spine is in progress.** The schema supports
multi-tenant operation (every domain object the user authors is
tenant-scoped by `user_id`), but read paths don't all enforce it
yet. The complete model is documented in `docs/notes/tenancy.md`;
the outstanding implementation work is items 13–16 (read-path
filtering), 23–24 (schema migrations for `documents` and
`game_source`), 25 (threading `user_id` through `PipelineExecutor`),
and 26 (in-code documentation). The single config flag
`ALLOW_PASSWORDLESS_LOGIN: bool = True` (item 9, shipped) is the
switch that flips the system between "transparent local install"
and "multi-tenant deployment."

**Migration tooling is hand-rolled, not Alembic.** Each
migration is a one-shot script in `backend/scripts/`,
idempotent, dialect-aware (SQLite + Postgres). For
single-machine deployment this works well; for multi-region or
read-replica topologies, Alembic-equivalent tooling becomes
worthwhile.

### Known gaps (backend)

- **`domain/tag_dsl.py` is structurally an adapter.**
  `TagDSLCompiler` produces a SQLAlchemy `Select` and imports
  from `db.schema`; by the Dependency Rule it shouldn't be in
  `domain/`. Future cleanup: move to `repositories/`. Resistance
  is purely test-ergonomics, not architectural.
  See `docs/notes/reflection.md` for the rationale.
- **`PipelineExecutor.run()` couples lineage and tag-filter into
  one method.** Two Port calls, one method. Conceptually
  independent, temporally coupled. Worth a refactor if the
  executor grows further; not worth it at the current size.
- **No row-level audit log.** The system records `user_id` on
  every row but doesn't track which user made which change to
  which row over time. Fine for single-user or
  trust-each-other-Alice-and-Bob deployments; would need an
  audit table for any compliance-flavored deployment.
- **No tenant deletion path.** Removing a user means
  cascade-deleting their cards, documents, and game_sources.
  The schema has the right `ON DELETE CASCADE` clauses but no
  user-level cascade script exists. Deferrable until needed.
- *(retired 2026-05-07)* ~~Test coverage is uneven.~~ Closed
  by the five-phase testing arc (PRs #167, #170, #172, plus two
  PRs that closed inside the stack). The backend ships 442
  tests across four tiers (unit, unit-with-Port-fakes,
  adapter integration, route via httpx + ASGITransport); four
  production bugs surfaced and were fixed in-place. Closing
  reflection: `docs/notes/test-coverage-2026-05.md`.

---

## The proxy

KataProxy is included as a git submodule pinned to a specific
commit. The architecture is independently designed and worth
reading separately if extending the proxy itself; gogui consumes
it through a stable wire protocol and rarely needs to know
internals.

**Three-layer design** (Sessions / Hub / Router) with each layer
speaking a different ID namespace. Transformers can be authored
without knowing about coalescing; the Hub coalesces without
knowing about clients; the Router dispatches without knowing
about either. This separation is what makes KataProxy's two
extension surfaces (Transformers and SessionMiddleware) honest
abstractions rather than convenience APIs.

**Four operational roles**: LEAF (engine-bound process), RELAY
(public-facing aggregator over many LEAFs), ECHO (test/replay),
REDIRECT (compat shim). For local development, a single LEAF on
`127.0.0.1:41948` is sufficient — and is exactly what the
frontend's default config expects (matching `proxy/run_leaf.sh`'s
default). For institutional deployment, the RELAY-over-LEAF
pattern is the production shape.

The proxy is independently developed and intended for use beyond
gogui — go schools, online go services (FoxWQ, Tygem, etc.), and
research groups sharing analysis machines. As soon as it gains a
second consumer, its wire contract becomes a multi-party API; a
typed schema publication (analogous to the backend's OpenAPI)
will become important at that point.

For the proxy's own architecture, framework, and operational
documentation, see `proxy/README.md`, `proxy/FRAMEWORK.md`, and
`proxy/ARCHITECTURE.md` inside the submodule.

---

## Architectural governance — ADRs and tenets

The seven foundational architectural records live in `docs/adr/`,
spread across two genres. **All seven apply project-wide**,
regardless of which sub-project's history they originated in.

### Decisions

- **ADR-0001: State Mutation and `readonly` Policy.** Frontend
  state containers are mutated as part of normal operation;
  annotating them `readonly` was an aspirational lie that strict
  mode refused to accept. Decision: remove `readonly` from state
  containers, preserve it on value objects. The same philosophy
  applies to the backend's mutable Pydantic models.
- **ADR-0003: Frontend Portability and Domain Boundaries.** A
  descriptive map of the codebase's domain coupling, plus a
  forward-looking authoring principle: when designing a new
  module, ask "what would change for a Chess port?" The
  principle's value is at authoring time — it forces honest
  separation between the abstraction and the instance.

### Tenets

- **ADR-0002: Fail Loudly.** Six-level loudness hierarchy from
  compile-error (best) to silent fallback (worst). Five concrete
  rules; three documented exceptions. The most consequential
  single document in the project. The reason analysis-recording
  is designed without a silent retry queue, why proxy cache
  controls are explicit rather than implicit, why the SR review
  timeout cancels-rather-than-retries.
- **ADR-0004: Minimal-Touch Edits to Partially-Visible Files.**
  Authoring discipline: when editing under partial visibility,
  only the lines the build tool flags get touched. Full-file
  rewrites require full-file visibility. Protects against silent
  runtime breakage from changes the type-checker cannot catch.
- **ADR-0005: Documentation Discipline.** Seven rules for
  authoring documentation: single source of truth per nominal
  handle; a shared dispatch ledger for cross-team communications;
  reference descriptions describe relations rather than content
  snapshots; sibling references use generic descriptors; file
  location reflects content; author as you decide; transitional
  sections carry explicit retirement plans. The discipline that
  prevents documentation drift from becoming its own silent
  failure mode.
- **ADR-0006: Source-File Headers.** Every source file in
  `frontend/` and `backend/` carries a header with pathname,
  purpose statement, and license declaration. Composes with
  ADR-0004's partial-visibility discipline — a file pasted into
  a chat or PR diff identifies itself.
- **ADR-0007: File Size and Information Density.** *(Status:
  Proposed.)* Soft size budgets for source files, with the hard
  prohibition that logic must never be compressed to fit a
  budget. Prevents the condition under which ADR-0004's
  partial-visibility discipline has to apply.

Together they establish the codebase's architectural personality:
honest types over aspirational annotations (ADR-0001); loud
failure over silent drift (ADR-0002); domain-aware seams without
premature abstraction (ADR-0003); surgical edits over speculative
reconstruction (ADR-0004); documentation that doesn't drift into
silence (ADR-0005); files that identify themselves (ADR-0006);
working memory budgets that keep partial visibility rare
(ADR-0007). Read all seven before making non-trivial changes; a
contribution against the grain causes friction wherever it
touches.

---

## Where the project is going

**v1.1.0 has shipped (2026-05-08).** The cycle's closure document
is `docs/notes/release-retrospective-2026-05.md` — whole-project
retrospective covering the eight-day arc from v1.0.0 through
v1.1.0 (289 commits, two testing arcs, one cross-team feature,
one large UX restructure, six audit / discipline arcs, six proxy
bumps including the v1.0.13 structural release, two ADR
amendments). Read it for the contributor-perspective close-out.

**v1.0.0 shipped 2026-04-30.** The locked release scope (the
seven items named in the now-archived
`docs/archive/release-scope-2026-04.md`) closed on that date:
backend de-branding finalisation, analysis-range preservation,
the card-tree widget, pass handling plus save-to-disk, the
default-palette curated metric set, the tenancy READMEs, and
the initial-load layout fix. The closure document is
`docs/notes/release-retrospective-2026-04.md`. v1.0.0 was the
first user-facing release; v1.1.0 is the first that shipped on
top of established discipline-arc machinery.

The roadmap below is the post-v1.1.0 view — what to pick up
next. The distribution-packaging memo
(`docs/notes/distribution-packaging.md`) is the leading edge:
making the software installable by users who don't know `npm`
or `fastapi` is the next undertaking. The tree-DSL hyperparameter
harness (`docs/notes/dsl-hyperparameter-harness-plan.md`) is the
named user-facing follow-on for the next cycle. The other items
below remain valid as longer-horizon targets.

**1. Tenancy spine — shipped end-to-end.** Items 13–16 (read-path
filtering), 23–25 (schema migrations + `PipelineExecutor`
threading), and item 26 (READMEs + docstrings that document the
tenancy model for operators) are all shipped in code with explicit
"Item N (tenancy)" annotations. The system can be deployed as a
hosted service with multiple users; the frontend's reciprocal
(item 28 — JWT 401 retry) shipped separately as part of the
auth-lifecycle UX work. Distribution packaging is the structural
blocker between "tenancy spine works" and "hosted deployment
ships."

**2. Analysis persistence — shipped end-to-end.** The
`cross/analysis-persistence` arc closed the SR loop server-side.
KataGo analyses are now persisted as per-`(user_id, board_id)`
bundles on the backend, with upload triggered by an explicit
"Save analyses" user action via the AnalysisControls Save /
Discard buttons. Backend half: schema, migration, four routes
under `/analysis-bundles`, codec dispatch (`json` + `json+gzip`),
atomic quota enforcement, structured 413/500 bodies. Frontend
half: BoardId-to-UUID migration (precursor), the
`AnalysisPersistenceService` HTTP boundary, the analysis-bundle
parser + summary type + storage-error union, the bootstrap
restore on auth+hydrate, the `closeBoard` / `resetWorkspace`
audit pair O13 augmentations, and the AnalysisControls UI
surface. System-level reference:
`docs/notes/analysis-persistence-plan.md`. The wire-shape design
record lives in the dispatch chain at
`docs/archive/dispatch/frontend-to-backend-analysis-persistence.md` and
its status replies. The original `isDuringSearch` design
blocker was retired — the manual + batched shape ships instead,
where the gate is a user click rather than a streaming-protocol
question.

**3. qEUBO palette calibration — feature-complete, validation
pending.** The Bayesian preference-based optimization integration
shipped during the v1 arc (backend MIT-boundary wrapper, REST
routes, frontend `useQeubo` composable, toolbar A/B cluster,
parameter-meta editor in `PaletteEditor`, bookmarks UI panel
shipped 2026-04-28). End-to-end UI smoke with Redis is still
the remaining validation gate. Status table at
`docs/notes/qEUBO.md`. The runtime is opt-in
(`QEUBO_ENABLED=False` by default) because the dependency
footprint is heavy and the validation incomplete. The proxy's
replay cache (Layer 2) exists specifically to make this loop
economically feasible at scale — useful once the integration is
validated.

**4. Public deployment.** Once tenancy is real, the application
can move from local-install to hosted service. The proxy's
RELAY-over-LEAF pattern is what makes the engine side scalable.

**5. Domain extension.** All three sub-projects support domain
adoption to varying degrees. The backend is genuinely portable
(item 34). The frontend's ADR-0003 maps the work that would be
required (~30-40% of the frontend would need rewriting). The
proxy's Prism abstraction is intended to support multiple
protocols, though only KataGo is currently implemented. If a
chess or shogi adopter materializes, the work is substantial
but bounded.

**Community palette library** is on the longer-term horizon —
palettes are JSON, and a "share my palette" feature is an
upload-download flow. Could be hosted alongside the backend or
as a separate static-site feature. Depends on whether palette
calibration produces results the community wants to share.

---

## Rough edges to know about

Beyond the per-subproject gaps named above, three cross-cutting
concerns worth surfacing:

**Drift between the proxy's contract and the frontend's wire
type.** The proxy is independently developed; if it gains new
control flags or changes coalescing semantics, the frontend's
`src/engine/katago/types.ts` needs to be updated to match. There
is no automated coupling between the two. The right long-term
fix is the typed-schema publication noted in the Proxy section.

**The `gradingParameter` opacity.** The most opaque field in the
domain model — `Record<string, any>` because the inner shape is
application-defined and changes frequently. The SR composable
reads `gradingParameter.data.analysis_config` to override the
active palette per card. If the inner shape ever stabilizes
enough to deserve a typed schema, formalize it in `types.ts` and
tighten the access sites; don't let the `Record<string, any>`
become permanent through inertia.

**Multi-tab support.** Currently undefined behavior; the
`SyncService` is last-write-wins (documented). If multi-tab use
becomes a real workflow (it currently isn't), an ETag-based
coordination layer is the right design — the sketch is in a
comment on `SyncService::sendSync()`. Until then, document the
single-tab assumption and move on.

For backend-specific rough edges (the misfiled `tag_dsl.py`, the
executor's coupling, the migration scripts' single-deployment
assumption), see `docs/notes/reflection.md`. That document is
the most candid available accounting of where the backend's
load bears unevenly.

---

## Operational notes

**Frontend.** `npm run build` is the canonical correctness
check. It runs `vue-tsc -b && vite build`. Every PR should run
it and resolve any new errors before merging. The strict
typecheck is load-bearing.

**Frontend logging.** The application logs aggressively to the
browser console (especially `SyncService`, `AnalysisService`,
`BackendService`). This is intentional — the target user is
technical and benefits from transparency. Don't suppress the
logs; if you add new functionality, log its lifecycle events at
the same level of detail. The proxy makes the same choice
(namespaced under `kataproxy.*` so individual subsystems can be
filtered independently). The project as a whole values loud,
filterable observability over silent operation.

**Frontend persistence.** The `SyncService` writes the entire
`GlobalStore` to the backend on every change (debounced). For a
developer making schema changes to the store, stale values can
appear after a redeploy — either bump a schema version or clear
the local user's saved state. There's a "Force Persistence"
button in the Settings tab useful for debugging.

**Backend.** `cd backend && pytest` runs the test suite — 442
tests across the four tiers documented in `tests/CLAUDE.md`
(pure-domain unit, service unit with Port fakes, adapter
integration, route via httpx + ASGITransport). For local
development:

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py --host 127.0.0.1 --port 8764
```

Schema is created on first run via SQLAlchemy's
`metadata.create_all`. For existing installs, see the migration
scripts in `backend/scripts/`.

**Proxy.** See `proxy/README.md`. The four roles (LEAF / RELAY /
ECHO / REDIRECT) are env-var-driven; built-in auth/TLS is
deliberately absent (with documented alternatives at the network
layer).

**Cross-team coordination.** Inter-subproject communications
during the pre-release sweep (item 34b in particular) revealed
that no shared filing convention existed for documents
addressed across teams; three backend-authored briefings to the
frontend ended up in three different places. A future
cross-cutting authoring discipline ADR may codify a dispatch
ledger pattern. For now: when authoring a document for another
sub-project, store under the recipient's tree, name explicitly
("brief," "status," "request"), and reference it in commit
messages so the receiving team finds it without archaeology.

---

## Where to read further

In rough order of priority for a new contributor:

- **`docs/adr/`** — The seven ADRs. Read these first.
- **`docs/notes/tenancy.md`** — How multi-tenancy flows through
  the backend.
- **`docs/notes/reflection.md`** — Backend architectural
  retrospective. The "Rough edges to know about" section is
  unusually candid.
- **`docs/notes/release-retrospective-2026-04.md`** —
  Whole-project retrospective at the close of v1.0.0. Honest
  assessment from a contributor perspective.
- **`docs/TODO.md`** — Active work, organized by tier and by
  recommended sequence.
- **`backend/README.md`** — Backend-specific concerns; includes
  the "Adopting for another domain" checklist.
- **`frontend/README.md`** — Frontend-specific concerns;
  includes the OpenAPI codegen workflow rationale.
- **`backend/docs/tree-dsl.md`** — Tree-DSL reference for the
  pipeline executor.
- **`docs/notes/analysis-persistence-plan.md`** — Design note
  for the planned analysis-persistence feature.
- **`docs/notes/frontend-backlog.md`** — Raw frontend backlog
  (UI/UX items not in the canonical TODO).
- **`docs/archive/`** — Historical artifacts kept for reference.
  The pre-umbrella HANDOFFs (the frontend's bird's-eye
  orientation, the three 34b-project communications) capture
  moment-in-time states. See `docs/archive/README.md` for the
  archive's own orientation.
- **`docs/playbooks/monorepo/`** — The restructuring playbooks
  (Part A: structural; Part B: editorial) that produced the
  current layout. Useful for understanding why things are
  arranged the way they are.
- **`proxy/README.md`**, **`proxy/FRAMEWORK.md`**,
  **`proxy/ARCHITECTURE.md`** — Inside the submodule. Required
  reading before making non-trivial changes to the proxy.

---

## Closing

The codebase is in good shape. Six Ports cleanly composed on the
backend, seven ADRs that capture the discipline, a tenancy spine
that's honest about what it guarantees, migration tooling
reusable for the next schema change. The frontend's analogous
work (typed wire shapes, fail-loud surfacing, OpenAPI codegen)
means the two halves of the system understand each other. The
proxy's three-layer decomposition is its own architectural win.

What remains — distribution packaging, eventual public
deployment, the frontend test debt — is incremental work on a
sound foundation. None of it requires architectural excavation.
The backend test debt closed in the 2026-05-07 testing sweep
(`docs/notes/test-coverage-2026-05.md`); analysis persistence
shipped via PR #166 (cross-team).

Hand off in good condition.
