# Handoff — Vestige (delivered surfaces)

This is the **delivered slice** of `docs/handoff-current.md`, cut out on
2026-06-02 when the handoff was refactored into an orientation-only
document as part of the work-status SSOT consolidation. It preserves the
per-feature "X shipped / closed / landed / operational" descriptions and
the shipped-release roadmap that the living handoff used to carry inline.

It is an **archive snapshot**, not a live document:

- **Work status is not authoritative here.** The canonical record of what
  is open / shipped / deferred is the work-status SSOT
  (`docs/work-status.json`, queried via `tools/work-status/sql.mjs`). This
  vestige describes the *shape* of delivered work for a reader who wants
  the narrative; it does not assert current status.
- Per the archive convention (ADR-0005), internal references point at
  paths as they existed at capture time and are not retro-edited to track
  later moves. Some may dangle; that is expected drift.
- New delivered surfaces accrue here as the living handoff sheds them:
  when an open item the handoff carries implementation-context for ships,
  that context migrates here.

For the living orientation document — pedagogy, architecture, integration
model, open rough edges, operational notes — see `docs/handoff-current.md`.

---

## Frontend — delivered surfaces

**The build sweep is closed.** `vue-tsc -b` had not been run in months
when the work began; ~124 strict-mode errors surfaced. Closed across 11
commits, with one regression caught and fixed mid-sweep — the regression
became the proximate motivation for ADR-0004. Since then, `npm run build`
is part of the regular contributor workflow and the strict typecheck is a
real safety net rather than a fictional one.

**The OpenAPI codegen pipeline is operational.** `npm run gen:api` runs
`openapi-typescript` against the backend's live `/openapi.json` and writes
a TypeScript declaration of every wire shape to `src/types/backend.ts`.
That file is committed (reasoning: reproducibility, review signal,
end-user builds — see `frontend/README.md` for the full justification).
The ACL at `backend-service.ts` consumes the generated types; backend
refactors that rename a field produce TypeScript compile errors at every
site that reads the old name.

**The proxy v1.0.14+ capability-negotiation contract is consumed.**
`analysis-service.ts::probeEngineInfo` reads the optional `capabilities`
advertisement from `query_version`'s response into
`store.engine.info.capabilities`; per-query opt-in is built by the pure
helper in `engine/katago/capability-injection.ts` at every analyze call
site. The SPA always opts in to `delta_analysis` (refusing the connection
at probe time if a capability-aware proxy lacks it), opts in to
`transposition` when the new `engine.katago.useTransposition` registry
toggle is on AND the proxy advertises it (with a probe-time system-message
warning when the toggle is on but the capability is absent), and opts in
to `adaptive_reevaluate` on live range-based queries only (omitted on
snapshot replays so review-session timing stays turn-locked). SELECTOR
routing surfaces as a Toolbar dropdown gated on `capabilities.selector`
and a `model: string` field injected at the ACL when
`store.engine.selectedModel` is non-null; the test-harness exports
(`playEngineMoves` / `queryEngineMove` in
`composables/usePlayFromPosition.ts`) gain optional `model` and
`capabilities` parameters for the multi-weights and LLM-at-seat scenarios
the autonomous-SR loop note sketches. The contract reference lives in the
dispatch chain at
`docs/dispatch/frontend-to-proxy-selector-and-capabilities.md` (frontend
ask),
`docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`
(proxy sign-off, six open questions answered including the Q6
canonical-key bifurcation), and the frontend-side design note at
`docs/archive/notes/proxy-selector-and-capability-negotiation.md`.

**The knob-registry substrate is live.** Shipped end-to-end on 2026-05-14
via PR #223. `profile.settings.knobs: KnobRegistry` is the SSOT for
user-controllable variables — KnobDecls declaring input vector, output
paths, transform, and editor widget. A claim state machine (`claimKnob` /
`releaseKnob` / `currentClaim` / `onClaimChange` in `src/lib/knobs.ts`)
governs which consumer holds a knob at runtime; `writeKnobValue`
dispatches per the 8-cell policy matrix (claim policy × writer kind). The
cross-domain `KnobRegistryEditor.vue` mounted in the Other tab is the
user-facing editor surface; `KnobSlider.vue` under `src/components/knobs/`
is the unified scalar widget. Seven knobs are currently registered out of
the box (display: ownership opacity, ownership dead-band, liveness
threshold, hue offset, move-filter threshold; engine: watchdog animation
duration, watchdog latency threshold); palette-domain knobs appear
dynamically when users configure qEUBO control via PaletteEditor's
Analysis Environment view. The substrate enforces claims end-to-end across
every write path: `KnobRegistryEditor`'s slider, `PaletteEditor`'s
parameter input, `useQeubo.applyEffective`, and `useQeubo.applyBookmark`.
Canonical reference: `docs/notes/knob-registry-plan.md` (`design-note:
implemented`). Worklog: `docs/worklog/2026-05-14-knob-registry.md`.
Postmortem for the `domain: 'qeubo'` category error that surfaced
mid-arc: `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`.
PR #225 added a toolbar quick-access popover (`ToolbarSliderPopover.vue`)
and a `KnobDecl.priority` field governing its sort order; the popover
shipped band-mismatched (mounted inside the toolbar's engine-connection
v-if, so band-1 substrate preferences silently inherited an engine gate)
with a "(ships with bugs)" merge subject and no documentation companion.
The follow-on corrective is recorded at
`docs/notes/postmortem-knob-toolbar-popover-2026-05.md` and
`docs/worklog/2026-05-14-toolbar-popover-band-mismatch.md`; the
postmortem's §7 names six discipline-recommendations calibrated to the
catastrophe-by-substitution test the incident surfaced.

**A render-performance ("green") arc landed 2026-05-31.** Six validated
wins targeting per-interaction latency under streaming analysis: the
per-nav forced reflow in TreeWidget's auto-center (observe-don't-poll via
`useViewportFollow`); a thumbnail-rendering SSOT (`board-geometry` +
`BoardSnapshot` + the reactive `MiniBoard`, excising ChartPreviewBox's
`v-html` teardown and the heatmap's ECharts tooltip → a fixed dual-board
preview window); an exact-incremental analysis projection
(`enriched-accumulator`, O(N)/frame → O(1)/packet, equivalence-tested);
canvas rug-plots for BoardTab and the timeline (off the Vue render path);
and decoupling TreeWidget's render from navigation (imperative active ring
— `<TreeWidget> render` 762 ms → 0 in nav-heavy combined-stress). The net
is a large drop in per-interaction main-thread JS (the felt "crispness"
axis); the native style/layout/paint ceiling under simultaneous maximal
load is unchanged (a separate, narrower axis). Full record:
`docs/notes/green-perf-arc-retrospective-2026-05-31.md` and the branch
inventory alongside it. Deferred follow-ups (the analysis-panel
container-query recompute; the native paint floor) are tracked in the
work-status SSOT.

**A repeatable perf-capture harness landed 2026-06-01.** The green arc's
manual rigamarole (Firefox DevTools + hold-arrow nav) is now backed by a
pluggable scenario harness: `window.__perfScenario.run(name, cfg)`
(dev-gated) drives `composables/perf/` scenarios — `nav-only` (regime-A),
`nav-range` and `full-stress` (regime-B: navigation + popover churn
*concurrent with* a streaming range analysis, the case the manual flow
could not reproduce). `scripts/perf-capture.mjs` captures a Chrome
DevTools trace via CDP-over-Playwright (the system Chromium; trace saved
under `~/w/vdc/chromium_profiles/`), and `scripts/perf-trace-parse.mjs`
ranks per-component render/patch from it. ADR-0009's canonical parser
(`@firefox-devtools/profiler-cli`) is **Firefox-only** — it cannot ingest
a Chrome trace — so the Chrome path uses the dedicated parser; **ADR-0009
was amended 2026-06-01** to record the Chrome/CDP surface (Revisit trigger
#2). Built atop two primitives extracted as SSOT shared with the
autonomous-SRS driver (`waitForCondition`, `loadSgfIntoBoard`). The first
sanity capture (b10 / 1000 visits / no-adapt / cold cache) reproduced the
regime-B signature — analysis chart components top the render/patch
ranking under streaming analysis, no surviving render-coupling. Full
record: `docs/worklog/2026-06-01-perf-scenario-harness.md`.

**Frontend identifier types have a lookup map.** `frontend/IDENTIFIERS.md`
— the namespace-repository sibling of `frontend/FILES.md` — catalogues
every branded or aliased identifier type with its primitive, encoding
(`Brand<>` / template-literal / bare alias), origin class, construction
site, lifetime, cardinality, and known soundness erosions, so the
identifier subset of the 2233-line `src/types.ts` is navigable without
trawling the file. A lookup reference (partial consultation), not an
end-to-end document. Added 2026-05-31.

### Retired known-gaps (frontend)

- *(retired 2026-05-08)* ~~No test suite.~~ Closed by the five-phase
  frontend testing arc (PRs #178, #179, #180, #181, #182, plus the Phase 5
  docs PR). The frontend ships 100 tests across three tiers (`tests/unit/`
  pure logic, `tests/fakes/` service substitutes, `tests/integration/`
  composable + store integration). Closing reflection:
  `docs/notes/frontend-test-coverage-2026-05.md`. Component-level tests,
  E2E, visual regression, and CI integration (gating `npm run build` on the
  suite) remain explicit follow-ups, but the foundational gap — "no
  automated tests at all" — is closed.

---

## Backend — delivered surfaces

**The tenancy spine shipped end-to-end.** The schema supports multi-tenant
operation (every domain object the user authors is tenant-scoped by
`user_id`). The implementation work — items 13–16 (read-path filtering),
23–24 (schema migrations for `documents` and `game_source`), 25 (threading
`user_id` through `PipelineExecutor`), and 26 (in-code documentation) —
all landed in code with explicit "Item N (tenancy)" annotations. The
complete model is documented in `docs/notes/tenancy.md`; the single config
flag `ALLOW_PASSWORDLESS_LOGIN: bool = True` (item 9) is the switch that
flips the system between "transparent local install" and "multi-tenant
deployment." The frontend's reciprocal (item 28 — JWT 401 retry) shipped
separately as part of the auth-lifecycle UX work.

**The SGF library surface ships end-to-end.** Both halves of the
SGF-library arc (design note: `docs/notes/sgf-library-plan.md`) are landed
on `feat/sgf-library`.

Backend extends `game_source` to be a first-class games repository, not
only a card-mint side-effect. Six new columns on `game_source`
(`created_at`, `date`, `result`, `ruleset`, `board_size`,
`metadata_extra`); eight new compound `(user_id, sort_col, id)` indexes
supporting paginated list with stable secondary sort. The seventh Port,
`GameLibraryRepositoryPort`, lives at
`repositories/game_library_repository.py`; the `GameLibraryService` use
case orchestrates batch import with SAVEPOINT-per-file isolation. Five
REST endpoints at `api/routes/library.py`: `POST /library/games/import`,
`GET /library/games`, `GET /library/games/{id}`,
`DELETE /library/games/{id}`, `GET /library/players` (distinct player
names for SPA filter autocomplete). Pagination is offset + limit with
`total_count` in the response — chosen over cursor because cursors are
forward-only and the surface's random-walk UX requires arbitrary-row
jumps. The `POST /library/games/import` body accepts an optional
`source_path` per file, lifted into `metadata_extra.source_path` at INSERT
so directory-upload provenance survives into the row.

Frontend lands the Library tab as the leading entry in the control-tabs
strip. Layered:

- ACL (`src/services/library-service.ts`) wraps the five endpoints; brands
  ids at the boundary; client-side chunks imports at
  `IMPORT_CHUNK_SIZE = 1000` to match the backend cap.
- Composables (`src/composables/library/`): `useLibraryQuery`
  (sparse-buffer pagination with generation-counter race protection),
  `useLibraryPlayerSuggest` (in-memory frequency-ordered autocomplete
  cache), `useLibraryPreview` (lazy SGF parse + scrub navigation),
  `useLibraryImport` (file / directory / drag-drop with progressive phase
  state), `useVirtualRowList` (no-dependency virtual-scroll primitive —
  explicitly rolled rather than pulling `@tanstack/vue-virtual` or
  `vue-virtual-scroller` per the XZ-utils-shaped supply-chain caution).
- `useDirtyBoardGuard` was refactored to share its decide-then-load core
  between `handleLoadCard` and the new `handleLoadLibraryGame`, so library
  opens go through the same confirm-load modal +
  `navigation.actionOnDirtyBoard` preference as card opens. Card-mint
  integration: the library row's `client_game_id` stamps onto the loaded
  board, hitting the existing `get_or_create_game_source_by_client_id`
  dedup path on a subsequent mint.
- Components (`src/components/library/`): five SFCs — `LibraryTab`
  master-detail orchestrator, `LibraryTable` with sortable headers,
  `LibraryPlayerFilter` autocomplete, `LibraryPreviewPane` mini-board +
  scrubber + actions, `LibraryImportPanel` drag-drop + picker + progress.

96 new tests across the four backend tiers (unit, service-with-fakes,
adapter integration, route) and the two frontend tiers (unit,
integration); full suite 648 backend / 596 frontend / clean `vue-tsc -b`.
Branch awaits user end-to-end test before merging to `next`.
*(Captured as-written; merge status not asserted — see the SSOT.)*

### Retired known-gaps (backend)

- *(retired 2026-05-12)* ~~`domain/tag_dsl.py` is structurally an
  adapter.~~ Closed by the tag-DSL macro-language plan's arc 1 — a focused
  file split. The pure parser, dereferencer, and DNF normaliser now live in
  `domain/tag_dsl_grammar.py` (no SQLAlchemy); the SQL emitter
  (`TagDSLCompiler` itself) lives in `repositories/tag_dsl_sql.py`;
  `domain/tag_dsl.py` is a thin facade re-exporting `TagDSLCompiler` so
  every existing call site keeps working without import changes. Bit-equal
  behaviour; 62 tag-DSL-targeted tests pass unchanged. Successor arc 2
  (macro language) shipped the same day; see
  `docs/archive/notes/tag-dsl-macro-language-plan.md` for the planning-time
  record and `docs/worklog/2026-05-12-tag-dsl-macro-language.md` for the
  shipped outcome.
- *(retired 2026-05-07)* ~~Test coverage is uneven.~~ Closed by the
  five-phase testing arc (PRs #167, #170, #172, plus two PRs that closed
  inside the stack). The backend ships 442 tests across four tiers (unit,
  unit-with-Port-fakes, adapter integration, route via httpx +
  ASGITransport); four production bugs surfaced and were fixed in-place.
  Closing reflection: `docs/notes/test-coverage-2026-05.md`.

---

## Releases shipped

**v1.1.0 shipped (2026-05-08).** The cycle's closure document is
`docs/notes/release-retrospective-2026-05.md` — whole-project
retrospective covering the eight-day arc from v1.0.0 through v1.1.0 (289
commits, two testing arcs, one cross-team feature, one large UX
restructure, six audit / discipline arcs, six proxy bumps including the
v1.0.13 structural release, two ADR amendments). Read it for the
contributor-perspective close-out.

**v1.0.0 shipped 2026-04-30.** The locked release scope (the seven items
named in the now-archived `docs/archive/release-scope-2026-04.md`) closed
on that date: backend de-branding finalisation, analysis-range
preservation, the card-tree widget, pass handling plus save-to-disk, the
default-palette curated metric set, the tenancy READMEs, and the
initial-load layout fix. The closure document is
`docs/archive/notes/release-retrospective-2026-04.md`. v1.0.0 was the
first user-facing release; v1.1.0 is the first that shipped on top of
established discipline-arc machinery.

### Shipped roadmap arcs (formerly "Where the project is going")

**The tree-DSL hyperparameter harness**
(`docs/archive/notes/dsl-hyperparameter-harness-plan.md`) shipped on
2026-05-12 — the design note transitioned to `design-note: implemented`;
the user-facing surface is a JSON5+holes authoring dialect in
`CardSetEditor.vue` plus a bind-time prompt modal that opens when a deck
declares hyperparameters.

**The tag-DSL macro-language arc**
(`docs/archive/notes/tag-dsl-macro-language-plan.md`) shipped 2026-05-12
across PRs #197 / #198 / #199 — the design note transitioned to
`design-note: implemented`; the user-facing surface is the now-supported
negation-in-definitions and parenthesised-grouping syntax (e.g.
`$attack :- $tactic, ~$blocked`), documented at `backend/docs/tag-dsl.md`
with an interactive REPL at `backend/scripts/tag_dsl_repl.py`.

**Analysis persistence — shipped end-to-end.** The
`cross/analysis-persistence` arc closed the SR loop server-side. KataGo
analyses are now persisted as per-`(user_id, board_id)` bundles on the
backend, with upload triggered by an explicit "Save analyses" user action
via the AnalysisControls Save / Discard buttons. Backend half: schema,
migration, four routes under `/analysis-bundles`, codec dispatch (`json` +
`json+gzip`), atomic quota enforcement, structured 413/500 bodies.
Frontend half: BoardId-to-UUID migration (precursor), the
`AnalysisPersistenceService` HTTP boundary, the analysis-bundle parser +
summary type + storage-error union, the bootstrap restore on auth+hydrate,
the `closeBoard` / `resetWorkspace` audit pair O13 augmentations, and the
AnalysisControls UI surface. System-level reference:
`docs/notes/analysis-persistence-plan.md`. The wire-shape design record
lives in the dispatch chain at
`docs/archive/dispatch/frontend-to-backend-analysis-persistence.md` and its
status replies. The original `isDuringSearch` design blocker was retired —
the manual + batched shape ships instead, where the gate is a user click
rather than a streaming-protocol question.

---

License: Public Domain (The Unlicense).
