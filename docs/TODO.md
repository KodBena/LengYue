# TODO

This list captures the integration and architectural items
identified during the joint review of the umbrella's `frontend/`
(the Vue SPA, formerly `gogui`) and `backend/` (the FastAPI
service, formerly `fastapi_service`), to be addressed before
public release.

This document is the consolidated successor to the two pre-umbrella
TODOs (`frontend/TODO.md` and `backend/TODO.md`, archived under
`docs/old-todos/` until this merger superseded them).

**Ordering principle:** items are sorted by *implementation
complexity*, not by priority or impact. The intent is that an
implementer can sweep top-down and accumulate small wins before
tackling structural work.

**Scope tags:**
- `[backend]` — touches only the FastAPI codebase
- `[frontend]` — touches only the Vue SPA codebase
- `[both]` — requires coordinated changes on both sides

**Cross-team status:** as of the close of the pre-release
infrastructure sweep, no outstanding action items between teams.
The backend confirmed closure of items 32 and 34 and shipped Commit
3b (response-side stale-bundle compat shim removal); the frontend's
remaining work is independent.

## Tenancy model — recorded for context

The tenancy items (9, 13, 14, 15, 16, 23, 24, 25, 26) relate to a
single architectural decision: **the system is multi-tenant capable
in its data model and access control, but single-user transparent
in its default UX.**

- Every domain object a user authors (`card`, `documents`,
  `game_source`) is tenant-scoped by a `user_id` foreign key.
- All read paths filter on the JWT-derived `user_id`.
- Intrinsically global reference data (`normalized_position`,
  `tag`) stays global; *usage statistics* over it are filtered
  through tenant-owned objects.
- The frontend's auto-login flow is preserved by item 9's flag
  `ALLOW_PASSWORDLESS_LOGIN: bool = True` (now shipped), which
  defaults to on for the local install scenario; multi-tenant
  operators set it to off and provision real accounts.

The current code stamps `user_id` on writes (correct) but ignores
it on reads (bug). The outstanding tenancy items below are the
"realize the tenancy model that already exists in the schema" work.

For the architectural rationale, see `docs/notes/tenancy.md`.

---

## Completed — do not act on these (reference only)

Items below are shipped, merged, and verified. They're kept here
as context so it's obvious which item numbers are skipped in the
tier sections below, and so nothing has to be re-derived when
reading the outstanding work.

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
| 32a | Domain layer purified: `LineageRepositoryPort`, `TagFilterRepositoryPort`. |
| 32a.2 | Stats purification: `StatsRepositoryPort`, `StatsService`. |
| 34 | Domain-agnostic core (umbrella) — closed via 34a (schema rename) + 34b (wire rename, including the response-side compat shim removal in Commit 3b) + 30b's `PositionNormalizerPort` + the `backend/README.md` "adopting for another domain" section. Ebisu backend is now genuinely domain-portable. |
| 34a | Schema rename (`pos_hash` → `content_hash`, `normalized_sgf` → `canonical_content`); `backend/README.md` "adopting for another domain" section. |
| — | *Resource endpoint reinstated on the Ebisu backend (`/resources/{name}`, `/resources`) with `StaticResourceRepositoryPort`. Not in original TODO numbering.* |

> Note on item 32: the backend's original item 32 specified
> zeroconf / mDNS service discovery, which is unshipped. The
> frontend's pre-merger Completed table reused the number 32 for
> "Tree-DSL test rewrite, absorbed by 32a + 32a.2," which has
> shipped. To avoid silently retiring the zeroconf work, this
> merged TODO records the test-rewrite as part of the 32a/32a.2
> closure (above) and preserves the original zeroconf work
> separately under "Future projects" below.

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
| 27-min | Last-write-wins invariant documented on `sendSync()`. The "full" multi-tab version is parked under Future projects below. |
| 29 | ACL fully typed: `mapToReviewCard(raw: CardFromWire)` (closed jointly with item 30 step 2). Wire shape `raw.sgf` confirmed dead and removed; `normalized_sgf` and `default_visits` retained as 34b-Commit-3 stale-bundle compat shims, removed by Commit 3b. |
| 30 | OpenAPI codegen pipeline: `openapi-typescript` dev dependency, `gen:api` script, generated `src/types/backend.ts` (committed), `frontend/README.md` documenting workflow. First consumer (`ebisu-service.ts`) wired. |
| — | Build-error sweep (multi-commit project; ~124 strict-mode errors closed across 11 commits + one regression caught and fixed mid-sweep). The mid-sweep regression became the proximate motivation for ADR-0004. After this sweep, `vue-tsc -b` runs clean. Detail in `docs/archive/handoff-2026-04-frontend-pre-umbrella.md`. |
| — | *Visits-override feature: per-card sticky `visitsOverride` in `ReviewSessionData`; `effectiveVisits` / `setVisitsOverride` on composable; number input in SR tab. Not in original TODO numbering.* |
| — | *Persistent system-log bar: `systemLogExpanded` in `UISession`, always-render `SystemLogPanel`, registry checkbox. Not in original TODO numbering.* |

### Joint

| # | One-line synopsis |
|---|---|
| 34b | Domain-neutral wire rename (`sgf`→`raw_content`, `normalized_sgf`→`canonical_content`, `default_visits` nested into `grading_parameter.data`). Backend dual-emitted for stale-bundle compat through Commit 3, then dropped the response-side shims in Commit 3b. Frontend's reciprocal cleanup (`34b-cleanup`) is now unblocked and listed in the Small tier below. |

### Documentation (architectural records)

The codebase carries four ADRs covering both decisions and tenets.
Tenets are cross-cutting authoring/runtime disciplines that apply
to both frontend and backend; decisions are point-in-time
architectural choices specific to where they're recorded.

| Doc | Genre | Synopsis |
|---|---|---|
| `docs/adr/0001-state-mutation-and-readonly.md` | Decision | State mutation model and `readonly` policy. Decision: remove `readonly` from state containers (mutated by design); retain on value objects. Mutator convention enforced by code review, not type system. |
| `docs/adr/0002-fail-loudly.md` | Tenet | When in doubt, fail audibly. Six-level loudness hierarchy from compile-error to silent fallback. Five concrete rules and three documented exceptions. |
| `docs/adr/0003-frontend-portability-and-domain-boundaries.md` | Bounded Context Map | Frontend portability and domain boundaries. The "what would change for a Chess port?" principle. Three-band domain coupling inventory. |
| `docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md` | Tenet | Authoring discipline: when editing a file under partial visibility, only the lines the build tool flags get touched. Full-file rewrites require full-file visibility. |

Plus design notes in `docs/notes/`:

| Doc | Synopsis |
|---|---|
| `docs/notes/analysis-persistence-plan.md` | Future-project design note for server-side KataGo analysis storage. Not yet implemented; blocker is the `isDuringSearch` validation step. |
| `docs/notes/tenancy.md` | System note describing the tenancy model in the codebase. |
| `docs/notes/reflection.md` | Architectural retrospective at the close of the pre-release sweep. |
| `docs/notes/frontend-backlog.md` | Raw frontend backlog (UI/UX items not in this TODO). |
| `docs/notes/deferred-items.md` | Active ledger of items that don't yet warrant a TODO, ADR, or decisions-deferred entry. Working-memory offload. |
| `docs/notes/auditor-notes.md` | Append-only ledger of overarching observations from auditors (Claude orientation passes). Feeds this TODO via manual promotion. |

---

## Active

### Trivial — single-line or single-block changes, no cross-file impact

#### 7. *(no longer relevant)*

Skipped for numbering continuity.

#### 8. *(no longer relevant)*

Skipped for numbering continuity.

> **De-branding from "Ebisu" — preservation note for the entries
> below (across the Trivial, Small, and Medium tiers).** The project
> name is **LengYue**. "Ebisu" is the third-party Bayesian
> spaced-repetition algorithm by Fasiha that the project uses as a
> dependency, not the project's own brand. The de-branding entries
> remove *project-level* uses of "Ebisu" but MUST preserve
> *algorithm-level* references:
>
> - the dependency line in `backend/requirements.txt`
> - the wrapper module `backend/core/ebisu.py`
> - `EBISU_TARGET_RECALL` / `EBISU_TIME_UNIT` / `EBISU_DEFAULT_MODEL`
>   in `backend/core/config.py`
> - the `EbisuModel` value object in `frontend/src/types.ts`
> - the `EbisuRecallKey` pipeline-DSL discriminator in
>   `backend/domain/pipeline_dsl.py` and its codegen mirrors
> - the `predict_recall` / `update_recall_float` functions
> - prose in `backend/docs/tree-dsl.md`, `backend/README.md`,
>   `docs/adr/0001-…`, and `docs/adr-synopsis.md` that explicitly
>   describes the project's *use of* the Ebisu algorithm
>
> Naming policy: prefer functional, role-descriptive names
> (`backend-service.ts`, `auth_token`, `'dark' | 'light'`). Use
> "LengYue" only where a project handle is genuinely unavoidable
> (e.g., a public-facing API title).

#### `[backend]` De-brand FastAPI metadata title

`backend/main.py:47` declares
`title="Ebisu Spaced Repetition API"`. The OpenAPI title brands
the backend service for a misnomer. Replace with a functional
title (`"Spaced Repetition API"`) or, if a project handle at the
public OpenAPI surface is desired, `"LengYue API"`. No other
behavior change; `frontend/src/types/backend.ts` updates on the
next `npm run gen:api`.

#### `[backend]` De-brand README and config-comment prose

Sweep `backend/README.md` for project-branding uses of "Ebisu":
the heading at line 1 (`# Ebisu — Spaced-Repetition Service`),
the opening sentence at line 3 (`A FastAPI service implementing
the Ebisu Bayesian…`), and any prose framing the backend as
"the Ebisu service." Replace with functional language ("the
spaced-repetition service"). Preserve algorithm-attribution
prose — the `#### 3. Set sensible Ebisu defaults` section
heading, the `EBISU_TIME_UNIT` / `EBISU_DEFAULT_MODEL`
descriptions, the "in Ebisu terms" passage at line 83. The
`# ----- Ebisu Math -----` comment in `backend/core/config.py`
is algorithm-correct and stays.

#### `[frontend]` De-brand source-file comments

Frontend source comments where "Ebisu" labels the backend service
rather than the algorithm:

- `src/services/api-client.ts:3` — `* Pure REST client for Ebisu API v2.`
- `src/config/env.ts:26` — `Base URL for the Ebisu REST backend …`
- `src/services/ebisu-service.ts:2-3` — file header (retired by
  the file rename below)

Replace with functional descriptors ("the spaced-repetition
backend"). Pairs naturally with the file rename in the Small
tier; can also be done independently as typo-class fixes.

#### `[both]` De-brand documentation prose

Single documentation-discipline sweep (per ADR-0005) over:

- `docs/handoff-current.md` — lines 74, 97, 133, 155 are
  project-branding ("(Ebisu-based)", "ebisu-service.ts",
  service references). Line 27 ("Ebisu's Bayesian recall model")
  is correct algorithm attribution and stays.
- `docs/dispatch/frontend-to-backend-auth-me.md:18` — references
  the localStorage key; updates with the localStorage rename
  below.
- `frontend/README.md` lines 4, 25, 53, 65, 71, 130, 175 — mix
  of service-branding and filename references.
- `frontend/CLAUDE.md:26` — references the file being renamed.
- `docs/adr/0002-fail-loudly.md:10,221` — line 10 is
  service-branding prose; line 221 is a filename reference.

Replace project-branding instances ("the Ebisu backend", "the
Ebisu service") with functional descriptors ("the
spaced-repetition backend"). Preserve algorithm-attribution
phrases ("Ebisu's Bayesian recall model", "Ebisu-based" where
the prose is explicitly about the algorithm). One commit,
ADR-0005-shaped.

#### `[docs]` Decide policy for `docs/archive/` Ebisu references

The archive contains ~25 uses of "Ebisu backend" / "Ebisu API"
in pre-umbrella handoff and 34b-project documents
(`docs/archive/handoff-2026-04-frontend-pre-umbrella.md`,
`docs/archive/34b-*.md`). Two policies are reasonable:

(a) Leave archive content untouched (it is historical record),
    and add a one-line preface to `docs/archive/README.md`
    explaining that "Ebisu" appearing in archive material
    refers to the project under its previous misnomer.
    *Recommended* — preserves the artifacts as moment-in-time
    records.
(b) Sweep archive content for consistency with the rest of the
    de-branded codebase.

Pick one and execute when the rest of the de-branding is done.

### Small — one-file refactors, no contract changes

#### 13. `[backend]` Filter `CardRepository` by `user_id` *(tenancy)*

Both `get_card_by_id` and `update_card_model` must take a
`user_id` parameter and add `WHERE card.user_id = :user_id` to
their queries. Routes in `api/routes/cards.py` already have
`user_id` from the JWT dependency; they need to pass it through.
A 404 (rather than 403) is the right response when the card
exists but isn't yours, so the tenancy boundary is not
information-leaking.

#### 14. `[backend]` Verify `parent_card_id` ownership in `CardService.create_card` *(tenancy)*

When `data.parent_card_id` is provided, check that the parent
card's `user_id` matches the caller before inserting
`card_source`. Otherwise a user can insert a "child" card under
any other user's parent, polluting their lineage tree. A 403
with an explicit message is appropriate here since the user is
asserting a relationship to something they don't own.

#### 15. `[backend]` Filter `StatsEngine` queries by `user_id` *(tenancy)*

`get_tag_usage` joins `tag` ⋈ `card_tag`; needs an additional
join into `card` with a `card.user_id = :user_id` filter so tag
counts reflect only the caller's cards. `get_forest_summaries`
selects from `card_source` and `game_source`; needs filtering
through `card.user_id` (and, after item 24, through
`game_source.user_id` directly). `api/routes/stats.py` passes
`user_id` from the JWT dependency through. Tags themselves
remain a global vocabulary (this is intentional — see the
Tenancy section above).

#### 16. `[backend]` Filter `tree_engine.fetch_lineage` by `user_id` *(tenancy)*

Same pattern as item 13: take `user_id` as a parameter, add the
filter to the join into `card`. This function is currently
unused by the main request path (the production path goes
through `PipelineExecutor`), but it is exported and could be
picked up by future code, so fixing it now is cheap insurance.

#### 34b-cleanup. `[frontend]` Remove ACL fallback chains

Backend's Commit 3b has shipped, removing the response-side
stale-bundle compat shims (`normalized_sgf`, top-level
`default_visits`). The frontend's reciprocal cleanup is no
longer gated.

Workflow: regenerate `src/types/backend.ts` (`npm run gen:api`)
to pick up the slimmer wire shape, then simplify
`mapToReviewCard` from:

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

The `?? 1000` floor stays — that's the application-side safety
net for cards with malformed `grading_parameter` data,
independent of any backend shim. Purely housekeeping; no
behavior change.

#### `[frontend]` Tighten `useVariationPath` to `Ref<NodeId[]>`

Optional cleanup. After Commit 5a-extension,
`useAnalysisProjection` exposes a `Ref<NodeId[]>` via a single
boundary adapter; tightening the underlying `useVariationPath`
directly would let the adapter be removed and the variation path
be exposed natively as branded. ~5 lines of cleanup.

#### `[frontend]` Rename `ebisu-service.ts` → `backend-service.ts`

The frontend ACL file currently labels itself for the project
misnomer; `frontend/CLAUDE.md:26` already flags it as "subject
to renaming." Functional rename:

- `src/services/ebisu-service.ts` → `src/services/backend-service.ts`
- `class EbisuService` → `class BackendService`
- `export const ebisuService` → `export const backendService`

Update all imports (`useMinting.ts:8`, `useReviewSession.ts`,
plus about a dozen other call sites; grep for `ebisu-service`
and `ebisuService` to enumerate). Update doc references:

- `frontend/CLAUDE.md:26` (drop the "subject to renaming" caveat)
- `frontend/README.md` lines 65, 71, 130, 175
- `docs/handoff-current.md` lines 97, 133, 155
- `docs/adr/0002-fail-loudly.md:221`
- `docs/TODO.md:117,376` (this file's own references)

Per ADR-0006, the moved file's pathname comment in the JSDoc
header updates to match. No behavior change.

### Medium — touches contracts or requires coordinated changes

#### 23. `[backend]` Add `user_id` to `documents` table *(tenancy)*

Schema migration:
- Add `user_id INTEGER REFERENCES users(id) NOT NULL` column to
  `documents`.
- Change primary key from `(key)` to `(user_id, key)`.
- Migration step for existing data: assign all existing rows to
  `user_id=1` (the `local_user`'s expected id under the default
  install). Document this assumption in the migration script.

Then update `api/routes/documents.py`: both `GET` and `PUT`
filter by `(user_id, key)`; both pass `user_id` from
`get_current_user_id` through to the queries.

The frontend's `SyncService` does not change — the URL still
uses `key` alone, and the backend looks up by the JWT-derived
`user_id` plus `key`. This makes the tenancy boundary entirely
server-side, which is correct.

#### 24. `[backend]` Add `user_id` to `game_source` table *(tenancy)*

Schema migration:
- Add `user_id INTEGER REFERENCES users(id) NOT NULL` column to
  `game_source`.
- Backfill existing rows by joining through
  `card_source.game_source_id` to find an associated
  `card.user_id`. Multiple cards may reference the same
  `game_source` under the current schema, but in practice they
  should all belong to the same user (since `create_card` only
  mints a new `game_source` on a root). Verify this invariant
  before migration; if it holds, take any matching `user_id`. If
  it doesn't, log the violations and require manual resolution.

Then update `CardService.create_card` to stamp `user_id` on
inserts, and update item 15's `get_forest_summaries` filter to
also constrain on `game_source.user_id` directly (cleaner than
going through `card_source` → `card.user_id`).

#### 25. `[backend]` Thread `user_id` through `PipelineExecutor` and `build_selection_cte` *(tenancy)*

This is the largest of the tenancy items because the DSL
evaluator was designed with no awareness of ownership. Two
coordinated changes:

- `PipelineExecutor.__init__` (or `.run()`) takes `user_id`. The
  final query that materializes the pool joins `card` and
  applies `WHERE card.user_id = :user_id`.
- `build_selection_cte` in `tree_engine.py` either takes
  `user_id` and filters at the CTE level, OR the CTE stays
  unfiltered and the outer query that joins `card` does the
  filter. The second is simpler (one filter point, easier to
  audit) and is recommended; the first is more defensive.

Also: `TagDSLCompiler.compile_to_subquery` produces a subquery
selecting `card_id` from `card_tag → tag`. If a user has the
tag `$private` on their card and another user also has
`$private`, the subquery returns both card ids. The outer pool
filter from `PipelineExecutor` will drop the wrong ones, so this
is technically safe — but only because the outer filter exists.
Document this dependency in a comment in `tag_dsl.py` so no one
later "optimizes" by using the tag subquery in isolation.

`api/routes/forests.py::query_forest` already has `user_id` from
the JWT dependency; it just needs to pass it through.

#### 26. `[both]` Document the tenancy model in code and READMEs

Now that items 9, 13–16, 23–25 implement multi-tenancy properly,
prominent README sections ("Tenancy") in both subproject READMEs
should describe the model: what's isolated, what's global, the
role of `ALLOW_PASSWORDLESS_LOGIN`, the default single-user UX.
Brief docstrings in:

- `db/schema.documents`, `db/schema.game_source`, `db/schema.tag`
  — what is and isn't tenant-scoped, and why.
- `core/config.Settings.ALLOW_PASSWORDLESS_LOGIN` — what flipping
  it does.
- `api/dependencies.get_current_user_id` — the invariant that
  downstream code can rely on.
- `src/services/api-client.ts::ensureAuthenticated` — the
  assumption about the backend that this flow relies on.

The system-level tenancy note already exists at
`docs/notes/tenancy.md`. This item is the in-code documentation
that points back at it.

#### 28. `[frontend]` Improve JWT 401 handling

`api-client.ts::request` clears the token on 401 and throws.
With 30-day tokens
(`core/security.py::ACCESS_TOKEN_EXPIRE_MINUTES`), most users
will hit this exactly once per month, and the failure presents
as one user-visible error followed by silent recovery on the
next call. Replace with: on 401, attempt `ensureAuthenticated()`
once and retry the original request; only throw if the retry
also fails. Surface the recovery via
`pushSystemMessage('info', ...)`.

**Depends on:** item 20 (shipped). Compliant with ADR-0002:
this is "explicit, bounded, single retry on a known auth-protocol
pattern," not the silent auto-retry that the tenet rejects.

Caveat: during a fresh install, the first `login()` inside
`ensureAuthenticated` legitimately fails before the
registration-then-login dance completes. Item 28's retry logic
must distinguish "expected first-run auth dance" from "user's
session actually expired." The simplest distinction is
state-based: if the 401 happens inside `ensureAuthenticated`
itself, suppress surfacing; if it happens on any other call,
surface and retry.

#### `[frontend]` Type the pipeline DSL on the frontend

`CardSet.pipeline: any[]` in `types.ts` is the mirror of the
backend's typed pipeline DSL (item 31, shipped). With the
codegen now producing
`SelectStage | TakeStage | ShuffleStage | OrderStage` etc. in
`src/types/backend.ts`, the frontend can adopt these types for
`CardSet.pipeline`. Touches `types.ts`, `useMinting.ts`, possibly
`CardSetEditor.vue`. Closes the largest remaining `any` in
domain types. Not yet numbered; treat as a follow-on to the
build-error sweep.

#### `[frontend]` Merge `CardCreatePayload` with generated `CardCreate`

`types.ts` defines `CardCreatePayload` by hand;
`src/types/backend.ts` generates
`components['schemas']['CardCreate']` from the same backend
schema. Two declarations of the same shape is a drift hazard.
Adopt the generated type at the call site (`useMinting.ts` and
`ebisu-service.ts::createCard`) and remove the handwritten
version. Not yet numbered; treat as a follow-on to the
build-error sweep.

#### `[frontend]` Rename auth localStorage keys

`src/services/api-client.ts:14-15` declares:

```typescript
const TOKEN_KEY = 'ebisu_jwt_token';
const USER_KEY = 'ebisu_username';
```

Both are project-handle-branded. Rename to functional names
(`auth_token`, `auth_username`).

Migration concern: existing users have tokens stored at the old
keys; a hard-cut logs them out on next session. Recommended: a
one-shot compat shim in `api-client.ts` that, on construction,
reads the old key, writes to the new key, and removes the old.
Per ADR-0002 documented exception #3
(bounded-and-scheduled-for-removal compat shim) — file a
follow-on TODO to drop the shim after one release-cycle.

Updates `docs/dispatch/frontend-to-backend-auth-me.md:18` to
match. Not a contract change for the backend.

#### `[backend]` Rename or remove HTTP header `X-Ebisu-Token`

`backend/core/config.py:86` declares
`API_TOKEN_NAME: str = "X-Ebisu-Token"`. Project-handle-branded.

Audit usage first — grep for `API_TOKEN_NAME`. The auth flow uses
Bearer JWT (`get_current_user_id` reads `Authorization`), so this
constant may be vestigial. If unused, remove the constant
entirely; if used, rename to `X-Auth-Token` or fold the call site
into Authorization-header handling. If any frontend code sends
this header, that call site updates in lockstep.

#### `[backend]` Rename secret-key file `.ebisu_secret_key`

`backend/core/config.py:85` declares
`SECRET_KEY_FILE: str = "./.ebisu_secret_key"`.
Project-handle-branded. Rename to a functional path (e.g.,
`./.jwt_secret`).

Migration concern: existing installs hold the JWT signing secret
in the old file. A hard-cut regenerates the secret on first run
after the rename, invalidating every JWT in the wild and logging
out all users. The cleanest solution is a startup compat: if the
old file exists and the new one does not, rename it on disk and
proceed. One small block in `core/security.py` (or wherever the
file is read).

Updates `docs/notes/tenancy.md:254` and `docs/TODO.md:66` (the
Completed-table reference to the filename in this file).

#### `[backend]` Rename SQLite database file `ebisu.db`

`backend/core/config.py:72` defaults `DATABASE_URI` to
`sqlite+aiosqlite:///./ebisu.db`. Project-handle-branded.
Rename to a functional or LengYue-branded filename (e.g.,
`./cards.db`, `./lengyue.db`).

Migration concern: existing local installs hold their data in
the old filename. Recommended startup compat: if `DATABASE_URI`
resolves to a missing file but the legacy `ebisu.db` exists in
the same directory, rename it on disk before opening the
connection. Same shape as the secret-key compat above.

Updates `backend/README.md:62` (the example
`export DATABASE_URI=…ebisu.db`) and
`docs/playbooks/monorepo/monorepo-plan.md:232,240` (which list
the filename in the inventory).

#### `[frontend]` De-brand theme identifiers

`'ebisu-dark' | 'ebisu-light'` in `src/types.ts:176` and
`src/store/defaults.ts:45` are project-handle-branded.
Functional rename: `'dark' | 'light'`.

Migration concern: existing users' `AppSettings.appearance.theme`
holds `'ebisu-dark'`; without migration the value becomes
invalid on next load and the theme falls back to the default.
Two acceptable approaches:

(a) Hard-cut: update the type union; accept that existing users
    see the default theme on next load.
(b) Settings-migration on hydrate: rewrite `'ebisu-dark' →
    'dark'` once during store hydration.

Recommended: (b) — small, bounded, removable later. Group with
the card-set and palette migrations below into one
settings-hydrate shim.

#### `[frontend]` De-brand default card-set id

`src/store/defaults.ts:62-65,119` defines:

```typescript
'default_ebisu': {
  id: 'default_ebisu',
  name: 'Standard Ebisu',
  description: 'Breadth-first pool, sorted by Ebisu recall probability.',
  ...
}
…
activeCardSetId: 'default_ebisu',
```

Functional rename: `'default'` for the id, `'Standard'` for the
display name; rephrase the description to drop the project brand
(e.g., "Breadth-first pool, sorted by spaced-repetition recall
probability").

Migration concern: a stored `activeCardSetId: 'default_ebisu'`
in user state references the old id. Rewrite-on-hydrate,
alongside the theme migration above.

#### `[frontend]` De-brand default palette formula name

`src/store/defaults.ts:21,31` declares:

```typescript
ebisu_delta:   'visit_ratio(x)**(spread(x)**alpha)',
…
delta_fn: 'ebisu_delta',
```

The formula `visit_ratio(x)**(spread(x)**alpha)` has no
algorithmic relationship to Ebisu — the name is purely
project-brand. Functional rename: `quality_delta` or similar.

Migration concern: user palettes reference this name as a
string key. Rewrite-on-hydrate, alongside the theme and
card-set migrations above.

### Large — structural changes that introduce new abstractions

#### 30c. `[backend]` Single CTE per pipeline run

`domain/pipeline.py::PipelineExecutor.run` loops over
`context_ids` and issues one CTE round trip per id, then unions
the results in Python with first-seen-wins on collision. For `M`
context ids this is `M` round trips and `M` separate query
plans. Replace with a single CTE keyed off
`WHERE card_source.card_id IN (:context_ids)` (or the recursive
equivalent). The first-seen-wins collision semantics move into
`MIN(depth) GROUP BY card_id` in SQL or stay in Python on a
single `fetchall()`.

Observable behavior is identical for users; latency drops
linearly with the number of contexts. This is a contract-shaped
change to the internal CTE-builder API but no externally-visible
change.

Pairs naturally with item 30d — once the lineage CTE is
consolidated, 30c becomes a one-liner. Either order works;
doing 30d first is easier to review.

#### 30d. `[backend]` Consolidate the four recursive-CTE implementations

The same recursive lineage CTE pattern is implemented in at
least four places:

- `domain/tree_engine.py::fetch_lineage`
- `domain/tree_engine.py::build_selection_cte` (the
  `DescendantSelection` and `SubtreeSelection` branches)
- `domain/tree_queries.py::get_lineage_cte`
- `domain/tree_dsl.py::SubtreeSelection.to_cte`

Each one has its own subtle variation (column naming for the
depth literal, base-case predicate, max-depth handling). Extract
a single
`_build_lineage_cte(root_predicate, max_depth: Optional[int]) -> CTE`
helper and have all four call sites delegate to it. Keep the
four public surfaces intact — they're each used by something —
but the recursive machinery lives in exactly one place.
Bug-fixes to one variant currently never propagate to the
others; this item closes that hole.

---

## Future projects (parked with design notes)

### Analysis persistence

Server-side storage of KataGo analyses so repeated sessions don't
re-pay the compute cost. Design captured in
`docs/notes/analysis-persistence-plan.md`:

- Separate service (`AnalysisPersistenceService`), separate
  endpoint (`POST /analysis-records`). Not a fourth channel on
  `SyncService`.
- Per-node granularity keyed by `(configHash, nodeId)` matching
  the ledger.
- User opt-in, off by default; fine-grained toggles for heavy
  channels (policy, ownership).
- Fail-loud per ADR-0002 — no silent retry.
- **Blocker:** validate the `isDuringSearch` gating rule against
  KataGo's actual behavior on terminated ponders. 15-minute
  DevTools session, not a coding task. Documented in the
  planning note with the corrected polarity (the failure mode is
  terminate-acks masquerading as final packets, not
  legitimate-but-truncated anytime-optimization estimates).

### Item 27 full (ETag-based multi-tab)

Deferred per the item-17 reasoning: multi-tab use isn't a known
workflow, and the minimal documentation of last-write-wins (item
27-min, shipped) captures the invariant. If multi-tab usage
becomes real, the design sketch is in the comment on
`SyncService::sendSync()`.

### Item 32 (zeroconf / mDNS service discovery)

Deferred. Originally specified zeroconf service advertisement on
the backend (`_ebisu._tcp.local.` or similar) and discovery on
the frontend, replacing the fixed-URL config of item 22.
Constraints recorded in earlier discussion: no mandatory
dependencies for Linux users (no Avahi requirement), Windows out
of the box, Firefox without extensions. Large not because the
implementation is hard but because the testing matrix is wide
(three OSes × multiple browsers × with-and-without network
configurations), and the failure modes need graceful fallback to
the configured URL from item 22.

Status note: the frontend's pre-merger Completed table reused
item number 32 for the "Tree-DSL test rewrite" work, which has
shipped under 32a/32a.2 in the Backend Completed table above.
The zeroconf work — substantively unrelated — is preserved here
under its original number rather than silently retired.

---

## Implementation order recommendation

The frontend's build sweep is closed. Items 32a/32a.2 and 34 on
the backend are confirmed closed. Backend's Commit 3b has
shipped. Current shape of remaining work:

**Frontend (small, independent — easiest to interleave):**

- Item 34b-cleanup (~10 lines once `npm run gen:api` is run;
  pure housekeeping).
- Tighten `useVariationPath` to `Ref<NodeId[]>` (~5 lines).
- Type the pipeline DSL — small follow-on.
- Merge `CardCreatePayload` / `CardCreate` — small follow-on.

**Frontend architectural:**

- Item 28 (JWT 401 retry) — depends on already-shipped item 20.
  Compliant with ADR-0002 (explicit, bounded, single retry).

**Backend tenancy spine (coherent sub-sequence):**

- Items 13 → 14 → 15 → 16 (read-path filtering, same pattern
  four times).
- Items 23 → 24 (schema migrations, isolated tables).
- Item 25 (`PipelineExecutor` — largest behavioral change).
- Item 26 (documentation).

Each tenancy step is independently reviewable and leaves the
system in a working state. At every intermediate point,
`local_user` (the sole tenant) sees exactly the same data they
did before; behavior only changes for installs that have
provisioned multiple users.

**Backend architectural:**

- Items 30c + 30d (CTE consolidation) — do 30d first.

**Future projects (when ready):**

- Analysis persistence (start with the 15-minute
  `isDuringSearch` validation).
- Item 27 full, if multi-tab becomes a real workflow.
- Item 32, if deployment flexibility motivates zeroconf.
