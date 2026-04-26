# TODO — Pre-Release Infrastructure Health (Active)

This list captures the integration and architectural items identified
during the joint review of the Vue SPA (`gogui`) and the FastAPI
service (`fastapi_service`), to be addressed before public release.

**Ordering principle:** items are sorted by *implementation complexity*,
not by priority or impact. The intent is that an implementer can sweep
top-down and accumulate small wins before tackling structural work.

**Scope tags:**
- `[backend]` — touches only the FastAPI codebase
- `[frontend]` — touches only the Vue SPA codebase
- `[both]` — requires coordinated changes on both sides

**Cross-team status (this milestone):** no outstanding action items
between teams. Backend has confirmed closure of items 32 and 34, and
shipped Commit 3b (stale-bundle compat shim removal); the frontend's
remaining work is independent.

---

## Completed — do not act on these (reference only)

Items below are shipped, merged, and verified. They're kept here as
context so it's obvious which item numbers are skipped in the tier
sections below, and so nothing has to be re-derived when reading the
outstanding work.

### Backend

| # | One-line synopsis |
|---|---|
| 1 | `SECRET_KEY` auto-gen + persist to `./.ebisu_secret_key`. |
| 2 | CORS: `allow_credentials=False` + config-driven origins. |
| 3 | `datetime.utcnow()` → `datetime.now(timezone.utc)` sweep. |
| 4 | `CardCreateResponse` typed (status + card_id), replacing `Dict[str, Any]`. |
| 9 | `ALLOW_PASSWORDLESS_LOGIN` config flag for local-install vs. multi-tenant. |
| 9a | `SQL_ECHO` config; stops fire-hosing queries to stdout in production. |
| 9b | `assert` → explicit `ValueError` in `update_recall_float` (survives `-O`). |
| 9c | Auth error normalization — no more username-enumeration via diffed responses. |
| 9d | Deleted stale `core/config.py.legacy`. |
| 9e | Resolved broken `domain/pipeline_parser.py`. |
| 10 | `EBISU_TIME_UNIT` injected into `CardRepository` (no more hardcoded `14400.0`). |
| 11 | Domain error taxonomy in `domain/errors.py`. |
| 12 | `creation_date` on `CardResponse`; first-review crash fixed. |
| 21a | `core/logging_config.py` + `configure_logging(level, style)`. |
| 21b | Indexes: `ix_card_source_parent`, `ix_card_tag_tag_id`. |
| 21c | `core/database.py` with `Database` dataclass; engine managed in lifespan. |
| 21d | `_cached_betaln` with `@lru_cache(maxsize=4096)`. |
| 21e | `_attach_tags`: 4-round-trip dialect-agnostic. |
| 21f | First Port extracted: `CardRepositoryPort`. |
| 30a | `Card` domain entity + `CardWithRecall` + pure `project_card`. |
| 30b | `CardService` Port-pure orchestrator; `PositionNormalizerPort` Port. |
| 31 | Typed pipeline DSL (Pydantic discriminated unions). |
| 32 | Tree-DSL test rewrite — absorbed by 32a + 32a.2 functionally; no separate work outstanding. |
| 32a | Domain layer purified: `LineageRepositoryPort`, `TagFilterRepositoryPort`. |
| 32a.2 | Stats purification: `StatsRepositoryPort`, `StatsService`. |
| 34 | Domain-agnostic core (umbrella) — closed via 34a (schema rename) + 34b (wire rename, including the response-side compat shim removal in Commit 3b) + 30b's `PositionNormalizerPort` + the README "adopting for another domain" section. Ebisu backend is now genuinely domain-portable. |
| 34a | Schema rename (`pos_hash` → `content_hash`, `normalized_sgf` → `canonical_content`); README "adopting for another domain" section. |
| — | *Resource endpoint reinstated on Ebisu backend (`/resources/{name}`, `/resources`) with `StaticResourceRepositoryPort`. Not in original TODO numbering.* |

### Frontend

| # | One-line synopsis |
|---|---|
| 5 | Dead 404 branch in `sync-service.ts::connect()` removed; backend contract stated in the docstring. |
| 6 | Ghost `AppSettings` fields (`autoConnect`, `extensionCapabilities`) removed. |
| 17 | `SyncService` three-channel watcher collapsed to single-slot (Option A). |
| 18 | `current_recall`, `halflife_units`, `gradingParameter` surfaced on `ReviewCard` (closed jointly with Commit 4 of the build-error sweep). |
| 19 | `resource-service.ts` migrated to the consolidated `/resources/{name}` endpoint + envelope unwrap. |
| 20 | API and sync errors surfaced via `pushSystemMessage`. |
| 21 | KataGo analysis wait: timeout + abort-signal support; extracted to `wait-for-analysis.ts` primitive. |
| 22 | `VITE_API_BASE_URL` via `src/config/env.ts`; `.env.example` + `.gitignore`. Extended to `VITE_KATAGO_WS_URL` (scope extension of 22). |
| 27-min | Last-write-wins invariant documented on `sendSync()`; backend counterpart and README are backend / N-A concerns respectively. |
| 29 | ACL fully typed: `mapToReviewCard(raw: CardFromWire)` (closed jointly with item 30 step 2). Wire shape `raw.sgf` confirmed dead and removed; `normalized_sgf` and `default_visits` retained as 34b-Commit-3 stale-bundle compat shims pending Commit 3b. |
| 30 | OpenAPI codegen pipeline: `openapi-typescript` dev dependency, `gen:api` script, generated `src/types/backend.ts` (committed), README documenting workflow. First consumer (`ebisu-service.ts`) wired. |
| — | Build-error sweep (multi-commit project, see "Completed multi-commit projects" below). |
| — | *Visits-override feature: per-card sticky `visitsOverride` in `ReviewSessionData`; `effectiveVisits` / `setVisitsOverride` on composable; number input in SR tab. Not in original TODO numbering.* |
| — | *Persistent system-log bar: `systemLogExpanded` in `UISession`, always-render `SystemLogPanel`, registry checkbox. Not in original TODO numbering.* |

### Joint

| # | One-line synopsis |
|---|---|
| 34b | Domain-neutral wire rename (`sgf`→`raw_content`, `normalized_sgf`→`canonical_content`, `default_visits` nested into `grading_parameter.data`). Backend dual-emitted for stale-bundle compat through Commit 3, then dropped the response-side shims in Commit 3b. Frontend's reciprocal cleanup (`34b-cleanup`) is now unblocked and listed in the Small tier below. |

### Documentation (architectural records)

The codebase carries four ADRs covering both decisions and tenets.
Tenets are cross-cutting authoring/runtime disciplines that apply to
both frontend and backend; decisions are point-in-time architectural
choices specific to where they're recorded.

| Doc | Genre | Synopsis |
|---|---|---|
| `docs/adr/0001-state-mutation-and-readonly.md` | Decision | State mutation model and `readonly` policy. Decision: remove `readonly` from state containers (mutated by design); retain on value objects. Mutator convention enforced by code review, not type system. |
| `docs/tenets/0002-fail-loudly.md` | Tenet | When in doubt, fail audibly. Six-level loudness hierarchy from compile-error to silent fallback. Five concrete rules (no auto-retry on real failures, justified casts, no sentinel-instead-of-throw, ACL validates not coerces, no empty catch). Three documented exceptions (UI input fallbacks, idempotence, bounded backend compat shims). |
| `docs/adr/0003-frontend-portability-and-domain-boundaries.md` | Bounded Context Map | Frontend portability and domain boundaries. The "what would change for a Chess port?" principle. Three-band domain coupling inventory (truly agnostic / game-class agnostic / Go-bound). Cross-references backend item 34 / `PositionNormalizerPort`. |
| `docs/tenets/0004-minimal-touch-edits-to-partially-visible-files.md` | Tenet | Authoring discipline: when editing a file under partial visibility, only the lines the build tool flags get touched. Full-file rewrites require full-file visibility. Protects against silent runtime breakage from changes the type-checker cannot catch (prop contract drift, composable replacement, default-value changes, template handler reorganization). |

Plus one design note (not an ADR):

| Doc | Synopsis |
|---|---|
| `docs/ANALYSIS_PERSISTENCE_PLAN.md` | Future-project design note for server-side KataGo analysis storage. Not yet implemented; blocker is the `isDuringSearch` validation step. |

### Completed multi-commit projects

#### Build-error sweep (frontend)

`vue-tsc -b` had not been run in months; ~124 strict-mode errors
surfaced. Closed across 11 commits, with one regression caught and
fixed mid-sweep:

| Commit | Scope | Errors closed |
|---|---|---|
| 1a | Engine + composables (low-hanging fruit) | ~23 |
| 1b | Components + store | ~9 |
| 1b-extension | Proxy wire-type completion (`KataGoAnalysisQuery`) | 1 |
| 2a | Composables + logic branded-type discipline | ~17 |
| 2-extension | Components branded-type discipline | ~8 |
| 2-tail | Engine helpers branded-type discipline | ~4 |
| 3 | Readonly removal per ADR-0001 Path A | ~60 |
| 5b | TS7022 cycle-breaking after readonly removal | 3 |
| 5a | Chart component prop tightening | ~9 |
| 5a-extension + 4 | Tree layout, useAnalysisProjection adapter, item 18 surfacing | 10 |
| Final patch | snake_case → camelCase rename in useReviewSession | 1 |

Plus one regression fix (`HorizontalTimelineVisualizer.vue`) caught
during the sweep. The regression became the proximate motivation for
ADR-0004.

After this sweep: `vue-tsc -b` runs clean. Going forward, `npm run
build` is part of the regular contributor workflow; the strict
typecheck becomes a real safety net rather than a fictional one.

---

## Tenancy model — recorded for context

The tenancy items (13, 14, 15, 16, 23, 24, 25, 26) relate to a single
architectural decision: **the system is multi-tenant capable in its
data model and access control, but single-user transparent in its
default UX.**

- Every domain object a user authors (`card`, `documents`, `game_source`)
  is tenant-scoped by a `user_id` foreign key.
- All read paths filter on the JWT-derived `user_id`.
- Intrinsically global reference data (`normalized_position`, `tag`)
  stays global; *usage statistics* over it are filtered through
  tenant-owned objects.
- The frontend's auto-login flow is preserved by item 9's flag
  `ALLOW_PASSWORDLESS_LOGIN: bool = True` (now shipped), which defaults
  to on for the local install scenario; multi-tenant operators set it
  to off and provision real accounts.

The current code stamps `user_id` on writes (correct) but ignores it on
reads (bug). The outstanding tenancy items below are the "realize the
tenancy model that already exists in the schema" work.

---

## Small — one-file refactors, no contract changes

### 13. `[backend]` CardRepository tenant filtering *(tenancy)*

Every read method on `CardRepository` must filter by `user_id` from
the JWT. Today, `get_by_id`, `list_all`, `search_by_tags`, and
similar methods return records across tenants. The fix is additive:
inject the authenticated user's id via dependency and add a
`WHERE card.user_id = :uid` clause to each query.

### 14. `[backend]` Parent ownership check *(tenancy)*

When creating a child card (via `parent_card_id`), verify the parent
belongs to the same tenant. Currently a user could create a "child"
off any parent id in the database. Fix: the parent lookup joins on
`user_id` and returns 404 / 403 when the parent exists but belongs
to someone else.

### 15. `[backend]` `StatsEngine` tenant filtering *(tenancy)*

All of `/stats/*` endpoints compute over the full `card` table. The
aggregations must be restricted to the authenticated user's cards.
Same pattern as item 13; usage statistics over global reference data
(`tag`, `normalized_position`) are filtered through the tenant-owned
join.

### 16. `[backend]` `fetch_lineage` tenant filtering *(tenancy)*

The lineage-fetch path walks the `card_source_id` tree. Today it'll
cross tenant boundaries if a user somehow references a parent they
don't own (which item 14 prevents for new writes, but historical data
may already be in this state). The read path must filter.

### 34b-cleanup. `[frontend]` Remove ACL fallback chains

**Now actionable.** Backend's Commit 3b has shipped, removing the
response-side stale-bundle compat shims (`normalized_sgf`, top-level
`default_visits`). The frontend's reciprocal cleanup is no longer
gated.

Workflow: regenerate `src/types/backend.ts` (`npm run gen:api`) to
pick up the slimmer wire shape, then simplify `mapToReviewCard` from:

```typescript
sgf: raw.canonical_content ?? raw.normalized_sgf,
defaultVisits: readGradingParam<number>(raw.grading_parameter, 'default_visits')
  ?? raw.default_visits
  ?? 1000,
```

to:

```typescript
sgf: raw.canonical_content,
defaultVisits: readGradingParam<number>(raw.grading_parameter, 'default_visits') ?? 1000,
```

The `?? 1000` floor stays — that's the application-side safety net
for cards with malformed `grading_parameter` data, independent of any
backend shim.

If the regenerated `src/types/backend.ts` no longer declares
`normalized_sgf` or top-level `default_visits` on `CardWithRecall`,
the compiler will flag the now-unreachable fallback legs and the
cleanup is enforced. If the backend kept the fields but marked them
deprecated, the cleanup is voluntary but recommended.

Purely housekeeping; no behavior change (because by the time you run
this, stale bundles are extinct).

### `[frontend]` Tighten `useVariationPath` to `Ref<NodeId[]>`

Optional cleanup. After Commit 5a-extension, `useAnalysisProjection`
exposes a `Ref<NodeId[]>` via a single boundary adapter; tightening
the underlying `useVariationPath` directly would let the adapter be
removed and the variation path be exposed natively as branded.
~5 lines of cleanup.

---

## Medium — multi-file or contract-adjacent

### 23. `[backend]` `documents` table migration *(tenancy)*

Add `user_id` column to `documents`, backfill from existing
`user_workspace_*` keys, filter reads/writes by the authenticated
user. This is the first schema-touching tenancy item; isolated
table, low blast radius.

### 24. `[backend]` `game_source` migration *(tenancy)*

Same pattern as item 23, applied to `game_source`. Second schema-
touching item; builds confidence before the larger items 25/26.

### 25. `[backend]` `PipelineExecutor` tenant filtering *(tenancy)*

The pipeline DSL runs arbitrary user-authored queries. Every
`selection` and `ordering` stage that touches a tenant-scoped entity
must transparently filter by `user_id`. The largest behavioral change
in the tenancy spine. Build on items 13–16 and 23–24.

### 26. `[both]` Tenancy documentation

Once the behavioral work above is complete, document the tenancy
model in both codebases' READMEs. Describe the invariant, the
`ALLOW_PASSWORDLESS_LOGIN` flag, and the "what changes when you set
the flag to False" story.

### 28. `[frontend]` JWT 401 retry + recovery messaging

Currently, a 401 from the API clears the local token but doesn't
recover — the caller just fails. A better flow:

1. On 401 from any authenticated request: clear the token.
2. Retry the original request after running `ensureAuthenticated`.
3. If the retry also fails: surface a `pushSystemMessage('error', ...)`
   with a clear "your session needed refresh and recovery failed"
   message.

**Depends on:** item 20 (shipped — `pushSystemMessage` plumbing is
in place). Compliant with Tenet-0002: this is "explicit, bounded,
single retry on a known auth-protocol pattern," not the silent
auto-retry that the tenet rejects.

Caveat from item 20: during a fresh install, the first `login()`
inside `ensureAuthenticated` legitimately fails before the
registration-then-login dance completes. Item 28's retry logic must
distinguish "expected first-run auth dance" from "user's session
actually expired." The simplest distinction is state-based: if the
401 happens inside `ensureAuthenticated` itself, suppress surfacing;
if it happens on any other call, surface and retry.

### `[frontend]` Type the pipeline DSL on the frontend

`CardSet.pipeline: any[]` in `types.ts` is the mirror of the backend's
typed pipeline DSL (item 31, shipped). With the codegen now producing
`SelectStage | TakeStage | ShuffleStage | OrderStage` etc. in
`src/types/backend.ts`, the frontend can adopt these types for
`CardSet.pipeline`. Touches `types.ts`, `useMinting.ts`, possibly
`CardSetEditor.vue`. Closes the largest remaining `any` in domain
types. Not yet numbered; treat as a follow-on to the build-error
sweep.

### `[frontend]` Merge `CardCreatePayload` with generated `CardCreate`

`types.ts` defines `CardCreatePayload` by hand; `src/types/backend.ts`
generates `components['schemas']['CardCreate']` from the same backend
schema. Two declarations of the same shape is a drift hazard. Adopt
the generated type at the call site (`useMinting.ts` and
`ebisu-service.ts::createCard`) and remove the handwritten version.
Not yet numbered; treat as a follow-on to the build-error sweep.

---

## Large — architectural shifts

### 30c. `[backend]` Single CTE per pipeline run

The `PipelineExecutor` currently issues separate queries per stage.
Consolidating into one CTE per execution reduces round-trips and
enables cross-stage optimization by the database planner.

### 30d. `[backend]` Consolidate the four CTE implementations

The codebase has four places that build CTEs with overlapping
patterns. Extract a single CTE builder. Pairs naturally with 30c —
30d makes 30c a one-liner. Either order works; doing 30d first is
easier to review.

---

## Future projects (not in the sweep — parked with design notes)

### Analysis persistence

Server-side storage of KataGo analyses so repeated sessions don't
re-pay the compute cost. Design captured in
`docs/ANALYSIS_PERSISTENCE_PLAN.md`:

- Separate service (`AnalysisPersistenceService`), separate endpoint
  (`POST /analysis-records`). Not a fourth channel on `SyncService`.
- Per-node granularity keyed by `(configHash, nodeId)` matching the
  ledger.
- User opt-in, off by default; fine-grained toggles for heavy
  channels (policy, ownership).
- Fail-loud per Tenet-0002 — no silent retry.
- **Blocker:** validate the `isDuringSearch` gating rule against
  KataGo's actual behavior on terminated ponders. 15-minute DevTools
  session, not a coding task. Documented in the planning note with
  the corrected polarity (the failure mode is terminate-acks
  masquerading as final packets, not legitimate-but-truncated
  anytime-optimization estimates).

### Item 27 full (ETag-based multi-tab)

Deferred per the item-17 reasoning: multi-tab use isn't a known
workflow, and the minimal documentation of last-write-wins (item
27-min, shipped) captures the invariant. If multi-tab usage becomes
real, the design sketch is in the comment on
`SyncService::sendSync()`.

---

## Implementation order recommendation (forward-looking)

The frontend's build sweep is closed. Items 32 and 34 on the backend
are confirmed closed. Backend's Commit 3b has shipped. Current shape
of remaining work:

**Frontend (small, independent — easiest to interleave):**
- Item 34b-cleanup (~10 lines once `npm run gen:api` is run; pure
  housekeeping).
- Tighten `useVariationPath` to `Ref<NodeId[]>` (~5 lines).
- Type the pipeline DSL — small follow-on.
- Merge `CardCreatePayload` / `CardCreate` — small follow-on.

**Frontend architectural:**
- Item 28 (JWT 401 retry) — depends on already-shipped item 20.
  Compliant with Tenet-0002 (explicit, bounded, single retry).

**Backend tenancy spine (coherent sub-sequence):**
- Items 13 → 14 → 15 → 16 (read-path filtering, same pattern four
  times).
- Items 23 → 24 (schema migrations, isolated tables).
- Item 25 (`PipelineExecutor` — largest behavioral change).
- Item 26 (documentation).

Each tenancy step is independently reviewable and leaves the system
in a working state. At every intermediate point, `local_user` (the
sole tenant) sees exactly the same data they did before; behavior
only changes for installs that have provisioned multiple users.

**Backend architectural:**
- Items 30c + 30d (CTE consolidation) — do 30d first.

**Future projects (when ready):**
- Analysis persistence (start with the 15-minute `isDuringSearch`
  validation).
- Item 27 full, if multi-tab becomes a real workflow.
