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

**Cross-team status:** as of the close of v1.0.0 (2026-04-30),
no outstanding action items between teams. The locked release
scope (the seven items in
`docs/archive/release-scope-2026-04.md`) is shipped end-to-end,
including the cross-team card-tree arc (item 3) and the joint
tenancy-documentation sweep (item 26). The closure document is
`docs/notes/release-retrospective-2026-04.md`.

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

The tenancy spine is shipped end-to-end as of v1.0.0: code stamps
`user_id` on writes, read paths filter by it, schema migrations
land cleanly, and the operator-facing documentation (item 26)
points back at the system note. The items below remain in the
list as the durable record of what shipped.

For the architectural rationale, see `docs/notes/tenancy.md`. For
the in-code documentation (READMEs, schema docstrings, config-flag
docstrings), see the "Tenancy" sections in `backend/README.md` and
`frontend/README.md` plus the docstrings on
`db.schema.{documents,game_source,tag}`,
`Settings.ALLOW_PASSWORDLESS_LOGIN`,
`api.dependencies.get_current_user_id`, and
`src/services/api-client.ts::ensureAuthenticated`.

---

## Completed — do not act on these (reference only)

Items below are shipped, merged, and verified. They're kept here
as context so it's obvious which item numbers are skipped in the
tier sections below, and so nothing has to be re-derived when
reading the outstanding work.

> Note on `release-scope.md` references: the v1.0.0 locked release
> scope was archived to `docs/archive/release-scope-2026-04.md` on
> 2026-04-30 per its own retirement clause. References below to
> `release-scope.md` reflect the document's name at the moment of
> the entry's authoring; the file now lives at the archived path.
> The closure document is
> `docs/notes/release-retrospective-2026-04.md`.

### Backend

| # | One-line synopsis |
|---|---|
| 1 | `SECRET_KEY` auto-gen + persist to `./.jwt_secret`. |
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
| 13 | `CardRepository.{get_card_by_id, update_card_model}` filter by `user_id` *(tenancy)*. Both methods take `user_id: UserId` keyword-only and add `WHERE card.user_id == user_id`; 404-not-403 collapse preserves the privacy boundary. Code-comment-tagged "Item 13 (tenancy)". |
| 14 | `CardService.create_card` parent-ownership precheck via `read_repository.get_card_by_id(parent_card_id, user_id=user_id)` before insert; raises `CardNotFoundError` on cross-tenant parent. Code-comment-tagged "Item 14 (tenancy)". |
| 15 | `StatsRepository.{get_tag_usage, get_forest_summaries}` filter by `user_id`; routes in `stats.py` forward the JWT identity. Tags remain a global vocabulary; counts reflect only the caller's cards. Code-comment-tagged "Item 15 (tenancy)". |
| 16 | `LineageRepository.{fetch_selection, fetch_lineage}` filter by `user_id`; user_id flows through `_build_selection_cte`. Code-comment-tagged "Item 16 (tenancy)". |
| 23 | `documents` schema gets composite primary key `(key, user_id)` with `user_id INTEGER REFERENCES users(id) NOT NULL`. Routes in `api/routes/documents.py` filter on the JWT identity. Existing-install migration via `scripts/migrate_23_add_user_id_to_documents.py`. Code-comment-tagged "Item 23 (tenancy)". |
| 24 | `game_source` schema gets `user_id INTEGER REFERENCES users(id) NOT NULL`. Backfilled per the migration recipe in the original entry; `CardService.create_card` stamps it on inserts. |
| 25 | `PipelineExecutor` and `_build_selection_cte` thread `user_id: UserId` keyword-only; the materialization query joins `card` with `WHERE card.user_id = :user_id`. Tag-DSL subquery semantics documented in `tag_dsl.py` per the original entry's note. Code-comment-tagged "Item 25 (tenancy)". |
| — | *Resource endpoint reinstated on the Ebisu backend (`/resources/{name}`, `/resources`) with `StaticResourceRepositoryPort`. Not in original TODO numbering.* |
| — | *qEUBO MIT-licensed wrapper, step 1 of the qEUBO integration dispatch (`docs/dispatch/frontend-to-backend-qeubo-integration.md` v1.1). Lands the directory-by-license boundary at `backend/qeubo/` parallel to `proxy/goboard_transposition/`'s pattern: `backend/qeubo/vendor/src/` carries the upstream qEUBO library copied verbatim from `~/preference_optimizer/qEUBO/src/`; `backend/qeubo/runtime/` carries the LLM-derived wrapper adapted from the user's prototype at `~/preference_optimizer/qEUBO/wss3/{service,storage}.py` with the gradient-optimizer / colormap cruft surgically removed (no `colormap.py`, no `_compute_colour_data`, no `colour_table_*` / `*_jab` response fields, no JAB / quotient-space hue config — PBO core only). The whole `backend/qeubo/` tree is MIT; `backend/NOTICE` (new) declares the boundary parallel to `proxy/NOTICE`. The runtime supports `controlled_parameters` and `parameter_ranges` in the experiment config (stored, not consumed) so the still-to-be-written PD route handlers can do encode/decode against them. `backend/qeubo/README.md` is the load-bearing public API contract: the route-author session reads it instead of the runtime's `.py` source per the authoring discipline established in dispatch v1.1. Deferred to the route-implementer session: the FastAPI route handlers, encode/decode logic, requirements.txt bump (torch, botorch, gpytorch, redis≥4), and the FastAPI lifespan wiring. Frontend half of the dispatch (toolbar UX, schema migration, useQeubo composable, bookmarks UI, parameter-meta editor extension) is independent and can ship in parallel sessions. Not in original TODO numbering.* |
| — | *qEUBO REST routes + encode/decode + opt-in deps + lifespan wiring (PD scope at `backend/api/routes/qeubo.py`, `backend/api/routes/qeubo_encoding.py`, `backend/requirements-qeubo.txt`, `backend/core/config.py` edits, `backend/main.py` edits) plus MIT-scope runtime compatibility shims at `backend/qeubo/runtime/_compat.py` bridging vendored qEUBO to modern botorch ≥0.9 / torch ≥2.x / gpytorch ≥1.15 (sample_shape int→torch.Size coercion; float64 default-dtype restoration). Six endpoints under `/qeubo/experiment` per dispatch §2.4; QEUBO_ENABLED defaults to False (researcher opt-in for the heavy deps); routes return 503 when disabled to honor the dispatch's disabled-state contract. Per-user namespacing strips before the wire (dispatch §2.2). End-to-end sanity verified against random L2-target trials in 1D and 2D — zero shape errors, convergence in expected direction. Closes the backend half of the qEUBO integration dispatch; backend status dispatched to frontend at `docs/dispatch/backend-to-frontend-qeubo-status.md`. Worklog at `docs/worklog/2026-04-28-qeubo-routes-and-runtime-modernization.md`. Not in original TODO numbering.* |
| — | *Card-tree backend endpoints (release-scope.md item 3, backend half). Two thin POST endpoints under `/lineage` per `docs/notes/card-tree-backend-spec.md`: (a) `/lineage/resolve-roots` groups input card ids by their game-source root and surfaces unmatched ids explicitly per ADR-0002 (the bulk lift of item 13's 404-not-403 collapse); (b) `/lineage/tree-by-root` returns the structure-only subtree from a verified root with `LIMIT max_nodes + 1` overflow detection that yields a 422 with exact `actual_size` (no post-hoc truncation per ADR-0002). Both methods extend `LineageRepositoryPort` with keyword-only `user_id: UserId`; both CTEs apply the user-id filter at base AND step (defense in depth, matching the existing recursive-CTE pattern). New domain value objects in `backend/domain/lineage.py` (`RootGroup`, `RootResolution`, `CardTree`, `RootedTree`); new error class `LineageOverflowError` in `domain/errors.py`; new route file `api/routes/lineage.py` (wire shapes inline per the auth-route precedent — no schemas module yet because no second consumer); router wired in `main.py`. Pre-implementation, the deferred multi-parent question (`docs/notes/decisions-deferred.md`) was resolved: `card_source.card_id UNIQUE` plus the `check_one_source` CheckConstraint mean each card has exactly one parent, so the lineage is a forest of trees, not a DAG; both card-tree spec files' "open questions" were updated to reference the resolution. One spec deviation: `fetch_tree_by_root` returns `RootedTree` (a small wrapper over `CardTree` carrying `root_card_id` and `game_source_id`) so the route can project the wire shape without an extra round trip — the spec text declared `CardTree` as the Port return but the wire shape requires `game_source_id`, and the wrapper resolves the inconsistency cleanly. Nine integration tests in `backend/tests/integration/test_lineage_endpoints.py` cover: resolve-roots round-trip across two trees, self-root resolution, cross-tenant inputs land in `unmatched`, empty input short-circuit; tree-by-root full subtree, cross-tenant 404, mid-chain 404, overflow with exact `actual_size`, exact-`max_nodes` boundary success. Tests inline-seed because the legacy `tests/helpers.TreeBuilder` predates the item-34a column rename and remains broken at INSERT time — fixing it is part of the deferred test-rewrite arc, out of scope here. ADR-0006 headers retrofitted on `domain/errors.py`, `repositories/ports.py`, and `repositories/lineage_repository.py` (touched under full visibility). Backend-to-frontend status dispatch at `docs/dispatch/backend-to-frontend-card-tree-status.md`. Frontend half (the actual widget per `docs/notes/card-tree-frontend-spec.md`) remains open. Worklog at `docs/worklog/2026-04-29-card-tree-backend.md`. Not in original TODO numbering.* |
| — | *KataGo-wire pass handling (release-scope.md item 4, pass half). `services/analysis-service.ts` was filtering `m.type === 'place'` at both move-list construction sites (`analyzeRange` and `analyzeActiveNode`), silently dropping pass moves from the wire. KataGo received a move list shorter than the actual sequence and analysed positions that diverged from the user's board state from the first pass onward (no warning, no crash, just wrong analysis). New helper `engine/util.ts::moveToKataCoord(m: Move): string` returns the GTP coord for placed stones and the literal `"pass"` for passes (KataGo's analysis-engine protocol literal — case-insensitive — confirmed by the codebase's own receive-side `gtpToBoard` short-circuit on `'pass'`). Both call sites swap filter+toGtp for a `Move`-aware mapper. Six lines net. Closes the pass-handling half of release-scope item 4 (the save-to-disk half landed separately as PR #45). Worklog at `docs/worklog/2026-04-29-pass-handling.md`. Not in original TODO numbering.* |
| — | *Save-to-disk SGF (release-scope.md item 4, save half). Adds a "Save SGF" button to the application toolbar that serialises the active board's tree via the existing `engine/sgf-writer.ts::serializeBoard` and triggers a browser download. New composable `src/composables/useSgfDownload.ts` (105 lines) mirroring `useSgfLoader`'s transient-DOM-element pattern — no template ref required. Filename derived from the root node's SGF properties (`PB`-vs-`PW`-`DT`, sanitised to `[a-zA-Z0-9_-]`); fallback `board.sgf` when metadata is absent. Failures push SystemMessage per ADR-0002. The writer was verified round-trip-clean before wiring (4 real game records spanning 147–459 nodes, plus synthetic SGFs with passes / variations / marks / escape sequences — all property dicts identical post-round-trip), so the implementation is just plumbing; no writer changes. Companion item-4 bullet (pass handling in the KataGo wire) is engine-side and remains open. Worklog at `docs/worklog/2026-04-29-save-sgf.md`. Not in original TODO numbering.* |
| — | *Card-tree frontend widget (release-scope.md item 3, frontend half). Implements `docs/notes/card-tree-frontend-spec.md` against the wire shipped by the backend half (entry above). New SFC `frontend/src/components/charts/CardTreeWidget.vue` (228 lines) with the active / context / stub / bucket projection isolated to a pure composable `useCardTreeProjection.ts` (band 1 — truly domain-agnostic per ADR-0003) and three supporting modules: `card-tree-echarts.ts` (RenderNode → ECharts adapter + tooltip + per-tree header composer), `useEChartsForestRender.ts` (one ECharts instance per tree key, ResizeObserver-driven, dispose-on-unmount), `useCardTreeData.ts` (consumer-side state machine — `loadBrowse` for browse mode, `runPipeline` for active-set mode, `requestCard` for lazy hydration of context-card thumbnails). ACL extended at `services/backend-service.ts` with three new methods (`resolveRoots`, `fetchTreeByRoot`, `fetchCard`); the 422 path becomes a typed `CardTreeOverflowError` via `silentStatuses: [422]` so the system-log surface is the typed throw rather than a duplicated raw API-error message. Domain types in `src/types.ts` (`GameSourceId` brand, `CardLineageNode`, `RootGroup`, `ResolveRootsResult`, `CardLineageTree`, `CardTreeNodeRole`). `src/types/backend.ts` regenerated against the live LAN backend (the npm script's hardcoded 127.0.0.1 doesn't reach the user's install); diff is +208 lines, all additive. Consumer is `ForestDirectory.vue` — Decks tab drives active-set mode (`fetchCardSet` → `resolveRoots` → `Promise.all(fetchTreeByRoot)`), Roots tab drives browse mode (single `fetchTreeByRoot`, empty active set). Old `LineageTreeChart.vue` deleted as superseded; ForestDirectory was its only consumer. Two spec corner cases resolved at the frontend and recorded in the dispatch reply: hot-but-not-warm rendering (`RenderStubNode.isHeadActive` flag preserves the active-accent border without breaking the 4-role partition); expanded-bucket leaves take 'context' role pragmatically (the formal "has at least one active descendant" definition is loosened to "non-active terminal node" with a code comment). `npm run build` (vue-tsc + vite) passes; dev server boots clean. ADR-0007 budget compliance: every new file under the 250-line cap; CardTreeWidget.vue at 228 with script section three lines over the ~150 soft cap (the "~" tolerance covers it). Frontend-to-backend close-out dispatch at `docs/dispatch/frontend-to-backend-card-tree-status.md` surfacing two future-ask candidates (game date in `ForestStat`; multi-root composite endpoint) — neither is current pressure. Worklog at `docs/worklog/2026-04-29-card-tree-frontend.md`. Closes release-scope item 3 at both ends. Not in original TODO numbering.* |
| — | *Analysis-range persistence (release-scope.md item 2). The analysis-chart selection range (`useAnalysisTimeline::selectionRange`) was a local `ref` that was destroyed and reset to the default fit-to-path on every Analysis-tab unmount and on every board switch (the `<AnalysisDashboard :key="boardId">` re-mounts on board change). Author's frontend-backlog called the UX "highly annoying" because every excursion to a different tab discarded the selection. Scope decision (deferred at freeze time): **per-board** — the range belongs to a particular game's analysis context, not a global axis. Implementation: new optional `analysisRange?: [number, number]` field on `BoardState` (mirrors the existing `maxVisitsTarget?: number` pattern); `useAnalysisTimeline` rewritten so `selectionRange` is a `ComputedRef` reading from the active board's stored range and `setSelectionRange` writes via `mutateBoard`. The watch on `variationPath.value.length` initialises on first observation of a non-empty path and clamps to fit on subsequent changes, skipping the write when the clamp is a no-op so navigation doesn't churn `boardsVersion`. `BoardState` outlives the component lifecycle on both axes: tab switch destroys `AnalysisControls` but the store survives; board switch's `:key` re-mount picks up the *new* board's stored range automatically — no reactive boardId plumbing. SyncService persists the field as a side effect of `BoardState` already being on the wire, so the range round-trips across reloads. Interface change is read-only: `selectionRange` shifts from `Ref<[number, number]>` to `ComputedRef<[number, number]>`; no consumer mutates `.value` directly (all four — `AnalysisDashboard`, `AnalysisChartPanel`, `StabilityPanel`, `AnalysisTimelinePanel` — route through `update:selectionRange` events that hit `setSelectionRange`). Strict typecheck confirms. Worklog at `docs/worklog/2026-04-30-analysis-range-persistence.md`. Not in original TODO numbering.* |
| — | *Default-palette repair + curated metric set (release-scope.md item 5). Closes the dispatch at `docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`. The historical seed's `visit_ratio` referenced `uservisits` (the proxy stdlib provides `_uservisits`), and the seed's only palette had three state_fns and an unnormalised entropy proxy. Two-file change: `defaults.ts` rewrites `analysis_env.symbols` to the full curated library (state-context: `complexity`, `decisiveness`, `winrate`, `score_lead`, `score_volatility`, `nn_uncertainty`; window-context: `visit_ratio` (heuristic-oblivious — `_maxvisits` denominator), `quality_delta`, `scoreLead_delta`, `winrate_loss_topvsuser`, `scoreLead_loss_topvsuser`, `user_order`, `policy_loss`, `risk_adjusted_score_loss`, `rank_quality`; summary: `min_summary` + `mean_summary`), adds three palettes (`quality` — visit-share-aligned default; `score` — points-loss alternative; `rank` — most permissive), keeps a repaired `'default'` palette for compat, defaults `activePaletteId` to `'quality'`. Two semantic axes coexist: robust-child alignment (`visit_ratio`/`quality_delta`/`decisiveness` — `_maxvisits`-denominated, ignores `playSelectionValue` ranking) and engine-recommendation alignment (`*_loss_topvsuser`/`user_order`/`policy_loss`/`rank_quality` — uses `moveInfos[0]` ranked by `playSelectionValue`). A 6→7 migration in `migrations.ts` (CURRENT_SCHEMA_VERSION bumped to 7) follows the spec's detection rules: repair `visit_ratio` only when the broken-seed literal matches; `spread` → `decisiveness` rename only when `spread` matches the broken-seed literal (custom `spread` left in place, `decisiveness` added alongside); on rename, rewrite `\bspread\(` references in every other symbol body so user-customised formulas don't break; add new symbols/palettes only when absent; promote `activePaletteId` from `'default'` to `'quality'` only when the broken-seed `'default'` palette body was actually repaired. Verification deferred to user: asteval-side smoke test, live engine test, migration round-trip — all backend-Python-touching or live-engine-touching, not runnable from a frontend session. Worklog at `docs/worklog/2026-04-30-default-palette.md`. Not in original TODO numbering.* |
| — | *Backend de-branding round 1 (release-scope.md item 1) — five brand-tagged identifiers retired. State-bearing renames (a)-(c) carry compat shims; metadata renames (d)-(e) do not. (a) `API_TOKEN_NAME = "X-Ebisu-Token"` deleted from `backend/core/config.py`: audit confirmed zero references in `backend/` and `frontend/src/`; the auth flow uses Bearer JWT via `Authorization`, so the constant was vestigial. No frontend lockstep needed. (b) `SECRET_KEY_FILE` default `./.ebisu_secret_key` → `./.jwt_secret`, with a startup compat shim in `_load_or_generate_secret_key`: if the configured target is missing and a sibling `.ebisu_secret_key` exists, rename in place before reading. Bounded per ADR-0002 exception #3, removable in a successor release once operators have had one upgrade cycle. Avoids invalidating in-flight JWTs (which would log every user out on the first boot after the rename). (c) `DATABASE_URI` SQLite default `./ebisu.db` → `./cards.db`, same shape: `_apply_legacy_db_rename_compat(uri)` in `main.py::lifespan` parses the SQLAlchemy URL, no-ops for non-SQLite or `:memory:` URIs, and renames `ebisu.db` (plus `-journal`/`-wal`/`-shm` sidecars so SQLite's crash-recovery finds them in their expected co-location) onto the configured target before `Database.from_uri`. (d) FastAPI metadata title `"Ebisu Spaced Repetition API"` → `"Spaced Repetition API"` in `backend/main.py`. Title is OpenAPI metadata, not a generated type, so `frontend/src/types/backend.ts` is unaffected; backend-to-frontend status dispatch records the change at `docs/dispatch/backend-to-frontend-openapi-title-debrand.md` for awareness. (e) `backend/README.md` heading `# Ebisu — Spaced-Repetition Service` → `# Spaced-Repetition Service`. Algorithm-attribution prose preserved per the de-branding preservation note (the `Ebisu Bayesian spaced-repetition algorithm` reference at line 3, the `In Ebisu terms` passage at line 83, the `Set sensible Ebisu defaults` section heading at line 146, the `Ebisu math` reference in the architecture diagram, the `# ----- Ebisu Math -----` comment in `core/config.py`). ADR-0006 headers retrofitted on `core/config.py` and `main.py` since both were touched under full visibility. Doc updates land alongside: `backend/README.md:62` (DATABASE_URI example), `docs/notes/tenancy.md:254` (operator pre-flight reference), `backend/.gitignore` (add `.jwt_secret`), `docs/playbooks/monorepo/monorepo-plan.md:232,240` (forward-reference parentheticals so the historical playbook record stays intact), `docs/release-scope.md` item 1 (records the mid-execution scope addition for bullets (d) and (e) per the document's own "scope addition requires explicit project-author sign-off" rule). Closes the five retired Trivial-tier entries — header-rename, secret-file rename, db-file rename, FastAPI title, README prose. Not in original TODO numbering.* |

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
| 28 | JWT 401 silent retry: identity-honest re-login as the cached user on non-`/auth/*` 401s (passwordless: silent recovery via `pushSystemMessage('info', ...)`; password accounts: fall through to the existing visible rejection flow). Identity-preserving variant of the original spec — uses `login(cached)` not `ensureAuthenticated()` to avoid silent identity substitution post-B5 finalization. Bundled with the api-client → useAuth callback bridge that flips `auth.state` to `'unauthenticated'` on 401-cleared-token, closing a pre-existing convention-only drift between the two; the underlying pattern is filed as RFC-0001 open question 9. |
| — | Frontend de-branding round 1 — store migration `1 → 2`. Theme identifier rename (`'ebisu-dark'`/`'ebisu-light'` → `'dark'`/`'light'` in `profile.settings.appearance.theme` plus the type union in `types.ts:176`); default card-set id rename (`'default_ebisu'` → `'default'` in `cardSets[id]` keys plus `session.ui.activeCardSetId`, with display name `'Standard Ebisu'` → `'Standard'` and description de-branded); default palette formula name rename (`'ebisu_delta'` → `'quality_delta'` in `analysis_env.symbols` keys plus `palettes[*].delta_fn`). Three retiring TODO entries land as one principled migration in `migrations[0]`. Mid-execution lesson on defensive collision-guards captured in the worklog. |
| — | Frontend de-branding round 2 — file rename `ebisu-service.ts` → `backend-service.ts` (class `EbisuService` → `BackendService`, const `ebisuService` → `backendService`, ~14 imports/usages updated across composables and `ForestDirectory.vue`); localStorage auth keys rename (`'ebisu_jwt_token'` → `'auth_token'`, `'ebisu_username'` → `'auth_username'`) with one-shot compat shim in `api-client.ts` per ADR-0002 documented exception #3; source-comment de-brands in `api-client.ts:3` and `env.ts:26`; doc prose sweeps across `handoff-current.md`, `dispatch/frontend-to-backend-auth-me.md`, `frontend/README.md`, `frontend/CLAUDE.md`, `docs/adr/0002-fail-loudly.md` (algorithm-attribution prose preserved per the TODO's preservation note). `docs/archive/` policy decided as option (a): leave content untouched (preface already in place at `archive/README.md`). EbisuModel and EbisuRecallKey preserved as algorithm-correct domain references. |
| — | Build-error sweep (multi-commit project; ~124 strict-mode errors closed across 11 commits + one regression caught and fixed mid-sweep). The mid-sweep regression became the proximate motivation for ADR-0004. After this sweep, `vue-tsc -b` runs clean. Detail in `docs/archive/handoff-2026-04-frontend-pre-umbrella.md`. |
| — | *Visits-override feature: per-card sticky `visitsOverride` in `ReviewSessionData`; `effectiveVisits` / `setVisitsOverride` on composable; number input in SR tab. Not in original TODO numbering.* |
| — | *Persistent system-log bar: `systemLogExpanded` in `UISession`, always-render `SystemLogPanel`, registry checkbox. Not in original TODO numbering.* |
| — | *Ownership map overlay (release wrap-up). KataGo's `includeOwnership` wire flag is plumbed reactively in `analysis-service.ts`, gated on `UISession.overlayLayers.ownership` — three orthogonal sub-toggles: `continuous` (adjacent gap-less squares filling empty intersections, territory-style), `dots` (discrete confidence markers on empty intersections), `liveness` (small opposing-colour dot inside stones whose colour disagrees with the engine's predicted owner above a 0.3 threshold). New `BoardHeatmapOverlay.vue` is parameterised on `cells × colorMap × shape × scale` so future per-metric overlays compose by reusing it. `analysisService.restartActiveAnalyses()` walks per-board thunk callbacks captured at query-issue time, so toggle changes propagate into in-flight queries via `useAppBootstrap`'s deep watcher. New `decodeBoardArray` helper in `engine/util.ts` handles KataGo's row-major-with-row-0-at-top layout vs. our internal y=0-at-bottom convention. Sign convention follows KataGo's default: positive = white-owned. Schema migrations 2→3 (introduce `overlayLayers`) and 3→4 (split ownership into the three sub-modes; legacy `true` maps to `continuous: true`). Keybindings via `useUserIORegistry`: `c` continuous, `d` dots, `l` liveness. Not in original TODO numbering.* |
| — | *useUserIORegistry context-guard for editable surfaces (release wrap-up). Keys bound in `useUserIORegistry` (arrows, space, m/c/d/l) were leaking through to the global handler when typed inside the CodeMirror 6 editor used by `PaletteEditor.vue` and `CardSetEditor.vue` — `.cm-content` is a `<div contenteditable="true">`, missed by the existing `instanceof HTMLTextAreaElement` check. The auditor's frontend-backlog entry described this as the "Monaco editor" but the actual dependency is `vue-codemirror` / CodeMirror 6; the symptom and fix are the same. Guard adds `HTMLSelectElement` (form-control completeness, free) and `HTMLElement.isContentEditable` — the property already accounts for inheritance, so a single check on `e.target` covers any nested element inside a contenteditable region (CodeMirror today, Monaco if ever added, generic contenteditable mounts). Closes the corresponding bullet in `docs/notes/frontend-backlog.md`. Not in original TODO numbering.* |
| — | *Intensity gradient hue-shift slider (release wrap-up; accessibility). Persisted setting `profile.settings.appearance.intensityHueShift` (default `-43°` — the prior hardcoded value) bound to a range slider in the Other tab's Gradient Calibration view, alongside `ColorDebugStrip`. Engine refactor in `engine/suggestion-colors.ts`: split `initializeIntensityFactory` into `setVisitDistribution` (one-shot from `resource-service`) and `setIntensityHueShift` (called by an `appearance.intensityHueShift` watcher in `useAppBootstrap`); `rebuildIntensityColorFn` produces fresh `IntensityColorFn` closures atomically swapped into the reactive `getIntensityColor` shallowRef so consumers re-render when either input changes. `rotateHueLab` hoisted to module scope. Cleaned up the dead `pchipN(u, ALPHA_KNOTS)` line and the `t = 1-t` double-flip — replaced with named `lookup = 1 - intensity` and `a = intensity`, with a comment recording that the LUT was generated direction-quotient-optimised and the orientation is hand-applied by name. Schema migration 4→5 fills the new field with `-43` for legacy blobs (visually a no-op for users who haven't moved the slider). Not in original TODO numbering.* |
| — | *Analysis-meter rugplot fix in `BoardThumbnail.vue` (release wrap-up). The per-move depth strip under each tab thumb had three coupled defects. (1) `min-width: 1px` on each `.meter-slice` made the first ~60 moves consume the meter's visible width with the rest clipped invisibly via `overflow: hidden` — long games were silently truncated past the opening. (2) The default target of `state.maxVisitsTarget || 1000` was instantly saturated by pondering at `maxVisits: 100000`. (3) Inputs ran through `ecdf(visits/target)` even though the ECDF was calibrated for visit-ratio inputs (a move's share of total visits at a node), not absolute target fractions — collapsing the practical range onto a narrow band of the LUT regardless of visit count. Fix: drop the `min-width` so all path nodes share the meter proportionally; raise the target floor to `100000` (matching the ponder ceiling, with a deeper user-specified `analyzeRange` target still winning via `Math.max`); log-compress visits → t (`log1p(visits) / log1p(target)`) so each ~10× of visits adds a near-constant slice of t; add a sibling export `getIntensityColorLinear` in `engine/suggestion-colors.ts` that walks the LUT without the ECDF and takes alpha as a parameter. The ECDF variant `getIntensityColor` is unchanged — move suggestions and `ColorDebugStrip` continue to use it under its original calibrated semantics. Internally, the LUT-walk + hue-rotation is extracted to a shared `colorAtU` helper. Two visual-honesty refinements: unanalysed nodes (`visits === 0`) render as transparent (the meter background shows through, encoding "no data" honestly); each slice carries `title="Move N: X visits"` for hover discoverability at this small size. Closes the indicator-row rough edge surfaced during release wrap-up. Not in original TODO numbering.* |
| — | *`BoardThumbnail.vue` → `BoardTab.vue` rename (release wrap-up). The component is the tab item in the board-list rail (label, close button, analysis-meter rugplot, geiger dot); the hover-thumbnail is `FloatingThumbnail.vue`'s job. The "Thumbnail" name was a misnomer at this point. Rename via `git mv` (preserves history); two reference sites updated (`SidebarWidget.vue` import + template, comment in `engine/suggestion-colors.ts`); internal header comment in the file expanded to ADR-0006 form (full path + purpose + license) since the SFC was previously carrying a one-line header that predated the ADR. No behaviour change. Not in original TODO numbering.* |
| — | *Initial-load layout settle (release-scope.md item 7). On first load, the application's layout was visibly broken — the control-panel and board areas didn't size correctly until the user nudged the vertical panel resizer, despite the persisted `session.ui.controlPanelWidth` having a sane default. Resolved across an arc of commits that re-architected the layout pass: the resizer drives the board-square cap, the control panel absorbs leftover space, and the AnalysisDashboard's vertical sizing was tightened (`100vh-100`→`165` plus a `systemLogExpanded` default flip). Two follow-on UI fits landed alongside (board-fits-its-square, analysis-dashboard-double-scrollbar). Closes the seventh and final release-scope item. Not in original TODO numbering.* |
| — | *Sidebar toggle tooltip + Settings-tab CSS tightening (paired polish). The board-inventory `.collapse-btn` on the top nav bar (`App.vue:190`) was the only toggle in the cluster lacking a `title` attribute — its three siblings (`Toggle Main Board`, `Toggle Game Tree`, `Toggle Control Panel`) had hover tooltips, this one was silent. Added `title="Toggle Board Inventory"` matching the existing pattern. Bundled with the queued Settings-tab CSS tightening: `.section-divider` (`margin-top: 20px; padding-top: 10px;` → both `0`, border-top preserved) and `.registry-container` (`margin-top: 15px` → `0`) in `App.vue`, and `.registry-leaf` (`padding: 6px 8px;` → `0`) in `RegistryEditor.vue`. After the post-PR-#64 accordion landed, the wrapping `<details>` owns each subsection's top rhythm; the per-section air read as wasted space rather than visual structure. The inline `style="margin-top: 24px;"` override on the qEUBO Bookmarks header (`App.vue:432`) was preserved by deliberation — that header lives in the Other tab outside the accordion shape, so the wrapping-details rationale doesn't apply, and after zeroing `.section-divider`'s top margin the inline override is the only thing separating it from the ColorDebugStrip above. Not in original TODO numbering.* |
| — | *Brand-discipline pair: `PlayerPanel.activeIndex` → `ColorMoveIndex` and `BoardState.analysisRange` → `[PlyIndex, PlyIndex]` (paired follow-up to the heatmap-thumbnail-hint fix). Both items finish the brand pair's reach. **Item 1**: PlayerPanel's three inline `idx * 2 + turnOffset + 1` sites — duplicating `useTriangularHeatmap::colorMoveToPly`, the single authority — collapse into the named helper; `activeIndex` and `onIndexClick` brand to `ColorMoveIndex`. The `useChartNavigation` player handlers (`handlePlayerClick`, `handlePlayerHover`) brand their `moveIdx` parameter the same way, with an explicit comment recording the asymmetry that was implicit in the prior formulae: click navigates to the position BEFORE the move, hover previews AFTER. `useAnalysisProjection.getPlayerIndex` returns `ColorMoveIndex \| null`. A `forwardClick` wrapper inside PlayerPanel resolves the function-parameter contravariance against AnalysisChartPanel's `(idx: number) => void` slot — boundary brand-cast at the chart-event edge, same shape as `useTriangularHeatmap`'s `s/t` casts. **Item 2**: `BoardState.analysisRange` brands to `[PlyIndex, PlyIndex]`; `useAnalysisTimeline`'s `selectionRange`/`setSelectionRange` propagate the brand; the four `selectionRange` prop consumers (`ScoreLeadPanel`, `PlayerPanel`, `StabilityPanel`, `AnalysisTimelinePanel`) tighten their prop types; the two emit sites (`StabilityPanel`, `AnalysisTimelinePanel`) tighten their emit signatures. `StabilityPanel`'s emit closes a small pre-existing brand-lie — `colorMoveToPly` already returned `PlyIndex`, but the loose emit signature laundered the brand back to bare number. `AnalysisTimelinePanel` introduces an `onRangeUpdate` script-section wrapper that casts the band-1 `HorizontalTimelineVisualizer`'s emit to `[PlyIndex, PlyIndex]` — safe by construction, the visualizer's range is bounded to the visit-vector's length which equals the variation path length. Wire shape unaffected; brands erase at JSON serialisation. **`AnalysisChartPanel.activeIndex` and `zoomRange` stay bare `number`** — design call recorded below. **Past-planning-failure note (preserved as a reminder to remain vigilant).** Both original Active entries carried small inaccuracies that surfaced during implementation: (a) the PlayerPanel entry claimed branding `activeIndex` "propagates the brand up to its caller via `AnalysisChartPanel`'s prop signature", but AnalysisChartPanel is consumed polymorphically — ScoreLeadPanel passes `PlyIndex` (indexes `variationPath` directly), PlayerPanel passes `ColorMoveIndex` (requires conversion). Branding the shared prop as either type would type-launder the other; the chart-coordinate layer is honestly polymorphic, the brand belongs one level up where the per-caller meaning is fixed. (b) the BoardState.analysisRange entry listed "the four consumers that route through `update:selectionRange` (`AnalysisDashboard`, `AnalysisChartPanel`, `StabilityPanel`, `AnalysisTimelinePanel`)" — but AnalysisChartPanel doesn't have a `selectionRange` prop or emit at all (its analogous prop is `zoomRange`, fed indirectly via ScoreLeadPanel/PlayerPanel forwarding); the actual prop consumers are ScoreLeadPanel + PlayerPanel + StabilityPanel + AnalysisTimelinePanel, and only the latter two emit. The lesson: an Active-tier entry is a working hypothesis about the shape of the work, not a completed audit; verifying the actual consumer graph against the stated one is part of the implementation, and the discrepancies surface design calls (here, the polymorphic-prop boundary) that the planning pass missed. **Deferred observation surfaced during the audit, resolved post-merge**: the audit observed that `useAnalysisProjection.getPlayerIndex` returns `count` (the total of color's moves up to `activeMainIndex` inclusive) and inferred the "correct" value should be `count - 1` if the contract were "highlight the most-recent color move". Project author confirmed during the post-merge polishing arc that the current semantics are intentional: the player panel's chart shows the moves the player made (one slot per move played), and clicking a slot navigates to the position BEFORE the move so the user can study the situation the player faced — `count` is the right value. The audit's inferred contract was archaeology, not a documented requirement. Adds a third lesson alongside (a) and (b): a code-archaeology inference about intent is also a hypothesis, not a confirmed semantic; verify against the project author or the user-facing UX before promoting a guess into a "possible bug" note. Not in original TODO numbering.* |
| — | *`useVariationPath` tightening + branded-ref propagation (Small-tier entry retired; closes the adapter the brand-pair commit was rebased through). `useVariationPath`'s return type tightened from `ComputedRef<string[]>` to `ComputedRef<NodeId[]>` — the underlying `getActiveVariationPath` had returned `NodeId[]` since Commit 2-tail, but the composable's loose return type laundered the brand back to bare string. Same for the `getBoardId: () => string` parameter, which is now `() => BoardId`. The `useAnalysisProjection` boundary adapter (a single `as NodeId[]` cast paired with renamed `variationPathRaw`) is gone — the upstream return type is the truth, downstream consumers receive the branded shape directly. While at it: scope expanded to retire the four brand-laundering sites in the consumer graph that the now-honest source signature flagged: `BoardTab.vue:71` (`id as NodeId`), `useEnrichedData.ts:92` (`pathIds[idx] as NodeId`) plus its parameter signature `Ref<string[]>` → `Ref<NodeId[]>`, `useKernelSeries.ts:11` (`variationPath.value as any`, which was brand-laundering against an already-branded `ledger.compute(nodeIds: NodeId[], ...)` API — a pure-overhead cast) plus its parameter signature, `useAnalysisTimeline.ts` two cast sites (`id as NodeId`, `variationPath.value as NodeId[]`) plus parameter signatures `Ref<string[]>` → `Ref<NodeId[]>` and `boardId: string` → `BoardId` (the `branded = boardId as BoardId` local with its now-stale "for compatibility with pre-branded callers" comment also retires — the only caller was already branded). `engine/util.ts`'s "follow-up cleanup worth revisiting" comment block rewritten to reflect that the propagation is complete; the file's ADR-0006 header retrofitted with a purpose line. Scope-expansion lesson, matching the brand-pair commit's "Active-tier entry is a working hypothesis": the original entry framed this as "~5 lines of cleanup" but tightening the source signature without retiring the downstream casts would have left the source telling the truth while the consumer signatures still laundered it — a half-finished propagation that re-establishes the same lie at one layer down. The honest scope of the cleanup is the full propagation. Not in original TODO numbering.* |
| — | *Merge `CardCreatePayload` / `GameMetadataPayload` with their generated counterparts (Medium-tier entry retired). The handwritten interfaces in `types.ts` were the same shape as the OpenAPI-generated `components['schemas']['CardCreate']` and `components['schemas']['GameSourceCreate']`, declared twice — a drift hazard whose two halves could diverge silently if the backend renamed a field. Closure: re-export from `types.ts` as `type` aliases of the generated schemas. Consumer imports unchanged; `useMinting.ts`, `MintCardModal.vue`, and `services/backend-service.ts::createCard` continue to import `CardCreatePayload`/`GameMetadataPayload` from `../types` — the source-of-truth shift is invisible at the call site, the generated declaration carries the truth. **One subtle migration surfaced**: the generated `CardCreate.grading_parameter` is honestly opaque (`{[key: string]: unknown} \| null`) where the handwritten was `Record<string, any>`. Two access sites in `MintCardModal.vue` (a read at the palette-override branch, a v-model on the visits input) had been quietly relying on the `any`-widening to navigate `gp.data.default_visits`. Closed surgically with localized casts at the access boundaries: a `defaultVisits` computed `{ get, set }` wrapper for the v-model so the template stays clean, and a one-line `as { data?: { default_visits?: number } }` cast at the read site. Both casts carry the same justification: `useMinting.prepareDraft` populates `data.default_visits` before the modal renders, and the modal's contract is to surface that one specific field. The blob's other contents stay opaque. Not in original TODO numbering.* |
| — | *Transient log-panel auto-reveal on errors and warnings. The persistent system-log bar (filed earlier as "`systemLogExpanded` in `UISession`, always-render `SystemLogPanel`, registry checkbox") shipped only the always-on half of the user's UX intent: `systemLogExpanded === true` exposes the panel persistently, but `=== false` was rendering the panel never — closing the channel for diagnostics that arrive while the panel is collapsed. The user's framing was `=== false` should mean "see it momentarily so you can act on it when something bad happens." Surfaced when a `/cards/{id}/review` 422 (scores outside [0.0, 1.0] under the score-loss palette — Ebisu rejecting unbounded deltas, correctly fail-loud at the backend) reached `pushSystemMessage` but never became visible because the panel was hidden. New composable `src/composables/useTransientLogReveal.ts` (App.vue-scoped, called once at root) watches the head of `store.engine.messages` and flips a local `Ref<boolean>` for 8 seconds when an error- or warning-level message arrives. A second event during the reveal window resets the timer (latest-wins) so a burst keeps the panel visible until things settle. The `v-if` gate on `<SystemLogPanel>` becomes `systemLogExpanded || transientLogReveal`. Info-level messages don't trigger; the user-visible channel for them stays the explicitly-expanded panel. Distinguishing "new arrival" from "rotation/dismissal" uses the message's monotonically-rising `timestamp`, which `pushSystemMessage` stamps on construction; dismissal (`messages.filter(...)`) can change the head reference but never produces a head with a newer timestamp than the last one seen, so the timestamp comparison short-circuits the dismissal case correctly. `immediate: true` on the watcher captures startup-time messages (e.g., a migration's audit-trail SystemMessage written by `updateFromRemote` during hydrate) — startup is exactly when the user needs to see diagnostics. Not in original TODO numbering.* |
| — | *Color theming substrate — chrome SSOT contract (A1–A4 arc, nine PRs on 2026-05-02). Closes the discipline failure named in `docs/notes/frontend-theming-plan.md`: ~380 chrome color literals scattered across `style.css`, SFC `<style>` blocks, inline template styles, and TS adapters collapse to one substrate file (`src/assets/css/theme.css`) with 16 named anchors (4 surface + 3 border + 3 text + 2 accent + 4 semantic state) plus six chart-derived helpers. The post-refactor SSOT contract: chrome lives in `theme.css`; domain (Go board / stones / ownership) lives in `engine/constants.ts` and inline binding sites; visualization-system anchors (visit-intensity LUT, `CLUSTER_PALETTES`) live in `engine/suggestion-colors.ts`. ~14 documented `theme-exception` zones cover designer-intentional palettes the substrate deliberately doesn't model (native form-control styling, pure-black/white rgba shadows, geiger-dot indicators, muted-state-error button surfaces, muted-cyan action-button variants, lightened-accent hover variants, Tailwind amber/pink role-indicators, HorizontalTimelineVisualizer's whole-block Tailwind palette, ColorDebugStrip's LUT visualization backdrops, and App.vue's panel-resizer peach handle). New helper `src/utils/theme-color.ts::themeColor(name)` (ADR-0002 compliant — throws on missing) for runtime-string consumers (ECharts adapter configs, dynamic SVG presentation attributes that don't evaluate `var()`). PRs: #80 substrate file; #81 style.css sweep; #82–#87 SFC `<style>` blocks across six clusters (rail/board-list, charts/viz, editors, modals/auth, forest/qeubo/controls, shell+App.vue); #88 TS chart adapters via `themeColor()`. Theme replacement (B — flipping the dark default to something less depressing) parked per the user's "structural close only" scoping. Worklogs at `docs/worklog/2026-05-02-theme-substrate-{a1..a4,a3a..a3f}.md`. Substrate-tuning candidates surfaced during the sweep (muted-state-error surfaces, muted-cyan action-button variants, lightened-accent hover) recorded in the A4 worklog as future-PR seeds. Not in original TODO numbering.* |
| — | *Anchor role overloading retired (decouple-via-alias). Chrome anchors that consumers borrowed for semantically distinct roles — chart-series Black/White identifiers piggybacking on `--accent-primary` / `--state-error`; `BoardTab.vue` review-state borders piggybacking on the state anchors — get five new role aliases in `theme.css` (`--player-black`, `--player-white`, `--review-active`, `--review-intermission`, `--review-complete`), each initially aliasing the chrome anchor whose value matches. Four consumer files swept (`useEnrichedData.ts`, `useAnalysisProjection.ts`, `AnalysisChartPanel.vue`, `BoardTab.vue`). `ChromeAnchor` literal union in `src/utils/theme-color.ts` extended with the five new names per the file's SSOT lockstep discipline. Visual unchanged at the time of the change; future tuning can break the aliasing without disturbing chrome (e.g., `--state-error` can shift toward orange while `--player-white` stays solidly red). Two settled-direction principles recorded as a new "Substrate evolution" section in `docs/notes/frontend-theming-plan.md` for any future substrate-tuning PR — decouple-via-alias for implicit handles (worked example: this PR), and color-mix derivation over multi-tone anchor families (one base anchor + CSS-side `color-mix()` at the use site, not 3-anchor families per role). The principle generalises to typography / spacing / animation / z-index when those SSOT refactors arrive. Audit pass also surfaced one follow-on, filed in `deferred-items.md`: review-state convention inconsistency between `App.vue` (FINISHED → `--accent-secondary`) and `BoardTab.vue` (`.review-complete` → `--state-success`) — recorded for explicit resolution rather than silent drift. Closes the deferred-items entry "Anchor role overloading in the chrome substrate" surfaced 2026-05-02. Not in original TODO numbering.* |

### Joint

| # | One-line synopsis |
|---|---|
| 34b | Domain-neutral wire rename (`sgf`→`raw_content`, `normalized_sgf`→`canonical_content`, `default_visits` nested into `grading_parameter.data`). Backend dual-emitted for stale-bundle compat through Commit 3, then dropped the response-side shims in Commit 3b. Frontend's reciprocal cleanup (`34b-cleanup`) closed in commit `41a9c5d` (2026-04-26): `mapToReviewCard`'s `?? raw.normalized_sgf` and `?? raw.default_visits` fallback legs retired; the `?? 1000` floor stays as the application-side safety net for malformed `grading_parameter.data`, per ADR-0002's structurally-impossible-input exception. |
| 26 | *Tenancy READMEs (release-scope.md item 6). The in-code documentation half of the already-shipped tenancy spine. New `## Tenancy` sections in `backend/README.md` and `frontend/README.md` describing what's isolated, what's global, the role of `ALLOW_PASSWORDLESS_LOGIN`, and the default single-user UX. Brief docstrings on `db.schema.{documents,game_source,tag}` (what is and isn't tenant-scoped, and why), `Settings.ALLOW_PASSWORDLESS_LOGIN` (what flipping it does), `api.dependencies.get_current_user_id` (the invariant downstream code relies on), and `src/services/api-client.ts::ensureAuthenticated` (the backend-side assumption). System-level note already exists at `docs/notes/tenancy.md`; this work is the in-code documentation that points back at it. Backend close at commit `0a61197`; frontend close at commit `7eb972e` (also de-branded the README opener as part of the same edit).* |

### Documentation (architectural records)

The codebase carries seven ADRs covering both decisions and tenets.
Tenets are cross-cutting authoring/runtime disciplines that apply
to both frontend and backend; decisions are point-in-time
architectural choices specific to where they're recorded.

| Doc | Genre | Synopsis |
|---|---|---|
| `docs/adr/0001-state-mutation-and-readonly.md` | Decision | State mutation model and `readonly` policy. Decision: remove `readonly` from state containers (mutated by design); retain on value objects. Mutator convention enforced by code review, not type system. |
| `docs/adr/0002-fail-loudly.md` | Tenet | When in doubt, fail audibly. Six-level loudness hierarchy from compile-error to silent fallback. Five concrete rules and three documented exceptions. |
| `docs/adr/0003-frontend-portability-and-domain-boundaries.md` | Bounded Context Map | Frontend portability and domain boundaries. The "what would change for a Chess port?" principle. Three-band domain coupling inventory. |
| `docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md` | Tenet | Authoring discipline: when editing a file under partial visibility, only the lines the build tool flags get touched. Full-file rewrites require full-file visibility. |
| `docs/adr/0005-documentation-discipline.md` | Tenet | Seven rules for authoring documentation: single source of truth per nominal handle, dispatch ledger for cross-team comms, references describe relations not snapshots, generic descriptors for sibling refs, location reflects content, author as you decide, retirement plans for transitional sections. |
| `docs/adr/0006-source-file-headers.md` | Tenet | Per-file headers (path + purpose + license) on every source file in `frontend/` and `backend/`. Composes with ADR-0004's partial-visibility discipline — a file pasted into a chat or PR diff identifies itself. |
| `docs/adr/0007-file-size-and-information-density.md` | Tenet | *(Status: Proposed.)* Soft size budgets for source files, with the hard prohibition that logic must never be compressed to fit a budget. Prevents the condition under which ADR-0004's partial-visibility discipline has to apply. |

Plus design notes in `docs/notes/`:

| Doc | Synopsis |
|---|---|
| `docs/notes/analysis-persistence-plan.md` | Future-project design note for server-side KataGo analysis storage. Not yet implemented; blocker is the `isDuringSearch` validation step. |
| `docs/notes/tenancy.md` | System note describing the tenancy model in the codebase. |
| `docs/notes/reflection.md` | Architectural retrospective at the close of the pre-release sweep. |
| `docs/notes/frontend-backlog.md` | Raw frontend backlog (UI/UX items not in this TODO). |
| `docs/notes/deferred-items.md` | Active ledger of items that don't yet warrant a TODO, ADR, or decisions-deferred entry. Working-memory offload. |
| `docs/notes/auditor-notes.md` | Append-only ledger of overarching observations from auditors (Claude orientation passes). Each entry ends with an "Advice for the next auditor" section so wisdom accumulates across sessions. Feeds this TODO via manual promotion. |

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

### Small — one-file refactors, no contract changes

#### Items 13–16 *(tenancy read-path)* — moved to Completed

Items 13 (`CardRepository`), 14 (parent-ownership precheck), 15
(`StatsEngine`), and 16 (`tree_engine`/`LineageRepository`
`fetch_lineage`) are all shipped in code with explicit
"Item N (tenancy)" annotations. The original Active entries
were stale at the time of `release-scope.md`'s authoring
(2026-04-28). See the Backend Completed table above for the
one-line synopses.

### Medium — touches contracts or requires coordinated changes

#### Items 23–25 *(tenancy schema + executor)* — moved to Completed

Items 23 (`documents.user_id`), 24 (`game_source.user_id`), and
25 (`PipelineExecutor` + `_build_selection_cte` user_id
threading) are all shipped in code with explicit
"Item N (tenancy)" annotations. The original Active entries
were stale at the time of `release-scope.md`'s authoring.
See the Backend Completed table above.

#### Item 26 *(tenancy READMEs)* — moved to Completed

Item 26 (the in-code documentation half of the tenancy spine,
shipped as release-scope.md item 6) closed on 2026-04-30 across
commits `0a61197` (backend) and `7eb972e` (frontend). See the
Joint Completed table above for the synopsis.

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

#### `[frontend]` Cards tab merge — per-board forest + current-card overlay

Merge the SR and Database control-panel tabs into a single
**Cards** tab (visual shape matches today's `ForestDirectory`),
introduce a "Start review session from this configuration" button
in the Decks subtab, render the active-board's current SR card in
orange against the forest's blue active-set rendering. Forest
state, active set, hydrated cards, and per-tree stats become
**per-board** to match the existing per-board convention for
review session state; UI affordance state (active sub-tab, panel
widths) stays workspace-global.

Design captured in `docs/notes/cards-tab-merge-plan.md`. The note
lays out: schema migration 11 → 12 (collapse `srContextIds` and
`databaseContextIds` to `cardsContextIds`, rewrite stored
`activeTab` values), per-board ephemeral state at module scope
(mirrors `pendingAnalysisAborts`), composable signature changes
(`useCardTreeData` becomes a projection composable;
`useReviewSession.startSession` accepts a prefetched queue), the
orange overlay as a render-time decoration on top of the existing
role partition (active / context / stub / bucket), the two-PR
phasing, and the verification checklist.

Two-PR seam suggested in the plan:
- PR 1: schema migration + composable signatures + orange
  overlay (no UI move yet; old SR / Database tabs unchanged).
- PR 2: `ReviewSessionPanel` extraction + `ForestDirectory`
  integration + `App.vue` tab restructure.

Note: the design note's schema migration was authored as
`11 → 12`. That slot is now claimed by the `analysis_config`
curation alignment migration; the Cards tab merge step needs
to be re-numbered (likely `12 → 13` or whatever the head is at
the time of implementation).

#### `[frontend]` Item 18 — `gradingParameter` ACL surfacing (actual closure)

Discovered 2026-05-02 during the proxy v1.0.3 curation
migration work: Item 18's TYPE side landed (`ReviewCard.grading-
Parameter`, `ReviewCard.currentRecall`, `ReviewCard.halflife-
Units` declared on the domain type per `types.ts:438`); the
IMPLEMENTATION side did not. `services/backend-service.ts::
mapToReviewCard` extracts `default_visits` and `gamma` via
`readGradingParam<T>` but never propagates the whole blob (or
the recall projections) onto the returned `ReviewCard`.
`useReviewSession.ts:235`'s read of `currentCard.value
?.gradingParameter?.data?.analysis_config` therefore returns
`undefined` in production today; the per-card config-override
path is dormant; reviews use the live env config regardless of
what each card was minted with.

Closure scope:
- `mapToReviewCard` must populate `gradingParameter`,
  `currentRecall`, `halflifeUnits` on the returned `ReviewCard`.
- The `gradingParameter` population MUST route through
  `engine/analysis-config-curation.ts::rewriteGrading-
  ParameterAnalysisConfig` to align pre-v1.0.3 cards' baked
  configs with the curated proxy stdlib. Without this rewrite,
  every card minted before v1.0.3 (~7 000+ in the deployed
  population) becomes unreviewable post-v1.0.3.
- The closure should also verify residue handling end-to-end:
  the proxy's call-time `NameError` for bodies referencing fns
  outside the curated stdlib must propagate as a SystemMessage
  per ADR-0002.

**Precondition:** the proxy v1.0.3 release ships with the
curated stdlib in place. While the proxy still accepts `np.*`,
this closure can ship safely; once v1.0.3 ships, it MUST ship
with the curation rewrite or pre-v1.0.3 cards break.

This entry is the immediate-action item from auditor-notes
2026-05-02; the broader class-of-inconsistency observation
(type-vs-implementation divergence at boundary translators)
is recorded there for systematic audit.

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

#### `[frontend]` Color theming substrate — moved to Completed

Closed across nine PRs (A1–A4 arc) on 2026-05-02. The Frontend
Completed table below carries the closure synopsis. Worklogs at
`docs/worklog/2026-05-02-theme-substrate-{a1..a4,a3a..a3f}.md`.
Theme replacement (B) — flipping the dark default to something
less depressing — is a separate decision deferred per the user's
"structural close only" scoping.

#### `[frontend]` Magic-literals audit — extend SSOT discipline beyond color

After the color theming substrate lands, sweep the rest of the
codebase for unjustified literal constants — magic numbers, magic
strings, magic offsets — and bring them under the same discipline.
**Treat scattered literals with the same suspicion as `as any`:**
each is a local override of the design vocabulary, visible only on
review, with no compiler signal pointing at it later. The
codebase already requires comments justifying `as any` casts; the
audit extends the same expectation to literals.

Triggering specimen: the `* 0.88` PV-stone-radius multiplier in
`MoveSuggestions.vue` (no recorded rationale; engineered around in
a later fix instead of being questioned). The 0.88 itself is being
removed in a one-shot fix; this audit addresses the *class* of
failure that allowed it to land.

Design captured in `docs/notes/magic-literals-audit-plan.md`. The
note specifies: the literals-as-`as any` framing, a two-pass sweep
methodology (inventory → cluster → substrate-or-justify), the
contract ("every literal either lives in a named constant in a
documented location, OR carries an inline comment at the use site
explaining its presence"), the categories likely to surface
(layout/geometry, animation timings, opacity scales, z-index,
domain thresholds, wire-format magic strings), and what the audit
deliberately does not do (no retroactive comments on trivial
literals; no one-off promotion to constants; backend scope
deferred).

**Predicated on the color theming substrate being done first.**
Color is the largest single literal category (~60 distinct values)
and is already its own design plan; auditing color and the residue
together would make either review impossible. A small layout/
geometry substrate (`useBoardGeometry` + a shared `<Stone>`
component, surfaced by the PV-stone investigation) may also land
as its own substrate before this broad audit, by the same
scope-cleanliness logic.

Large because the audit's surface is the entire frontend codebase,
even though each emerging substrate or inline-justification edit
is small.

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

v1.0.0 has shipped. The locked release scope (the seven items
in `docs/archive/release-scope-2026-04.md`) is closed end-to-end;
see `docs/notes/release-retrospective-2026-04.md` for the
whole-project close-out. The frontend's build sweep is closed.
Items 32a/32a.2 and 34 on the backend are closed. Backend's
Commit 3b has shipped. The tenancy spine (items 9, 13–16,
23–25) is shipped end-to-end with item 26's documentation half
closing alongside the release scope. Current shape of remaining
work:

**Frontend (small, independent — easiest to interleave):**

- Type the pipeline DSL — small follow-on.

**Frontend architectural:**

- Cards tab merge (`docs/notes/cards-tab-merge-plan.md`) — Medium
  tier; closes the SR/Database DRY violation, introduces the
  per-board forest + orange current-card overlay. Two-PR seam
  documented in the plan.
- Color theming substrate (`docs/notes/frontend-theming-plan.md`)
  — Large tier; closes the scattered-color-literal discipline
  failure as an instance of ADR-0005 Rule 1 applied to color.
  Codebase-wide sweep; substrate addition itself is small.
- Magic-literals audit (`docs/notes/magic-literals-audit-plan.md`)
  — Large tier; predicated on the color theming substrate landing
  first. Treats unjustified literals as `as any` for the design
  vocabulary; sweeps the residue (geometry, timings, opacity,
  z-index, thresholds) under the same SSOT-or-justified-inline
  contract.

**Backend architectural:**

- Items 30c + 30d (CTE consolidation) — do 30d first.

**Distribution and post-v1 product work:**

- Distribution-packaging decision per
  `docs/notes/distribution-packaging.md` — the leading edge of
  the post-v1 arc.
- Test coverage at the composable layer (frontend) and against
  Port shapes (backend) — the largest debt the project carries
  per the v1 retrospective.

**Future projects (when ready):**

- Analysis persistence (start with the 15-minute
  `isDuringSearch` validation).
- qEUBO end-to-end validation + transition of
  `docs/notes/qEUBO.md` to `design-note: implemented`.
- Item 27 full, if multi-tab becomes a real workflow.
- Item 32, if deployment flexibility motivates zeroconf.
