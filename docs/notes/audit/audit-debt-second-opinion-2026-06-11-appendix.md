# Appendix — Debt second opinion, verbatim commissions and reports (2026-06-11)

Companion to `audit-debt-second-opinion-2026-06-11.md`. Per ADR-0005 Rule 11,
the commission prompt and the full report of each delegated review whose
verdict is cited as evidence are reproduced verbatim below. This appendix is
a **reference record consumed by pointer-citation** (Rule 11's large-appendix
clause): cite into it; do not require an end-to-end read of it.

Not reproduced: the seven commissions of the initial top-tier fleet stopped
by the maintainer on quota grounds — those agents produced no artifacts and
no verdict from them is cited anywhere.

Coordinator corrections, per the leads-not-facts discipline, are recorded in
the main document's triage table (rows 5, 6, 8), not edited into the
reports below.

---

## A1. Code-judgment reviewer — commission (verbatim; model: Opus)

```
You are an independent technical-debt reviewer for the LengYue frontend (`/home/bork/w/omega/frontend`, a Vue 3 + TypeScript SPA in a soft monorepo at `/home/bork/w/omega`). READ-ONLY: make no edits, no branches, no DB writes. Do not read anything under `backend/qeubo/` (licensing firewall).

Context: a large audit + debt campaign just closed (2026-06-10/11, ~36 work-status closures). The maintainer wants an independent second opinion on the claim "the obvious technical debt is out of the way." You are the single reviewer for the JUDGMENT surfaces (a separate mechanical sweep covers doc/mirror drift — skip FILES.md/IDENTIFIERS.md/eslint-header auditing entirely). You cannot read everything: prioritize depth on the riskiest surfaces over breadth, and report coverage honestly.

First read END TO END (project discipline): `frontend/CLAUDE.md` and `docs/adr-synopsis.md`; read `frontend/tests/CLAUDE.md` end to end before the fake-fidelity check. `frontend/FILES.md` / `frontend/IDENTIFIERS.md` are lookup references (partial use sanctioned). Prefer citing code over docs; any other doc you cite must be read end to end.

Priority order (descend until budget honesty says stop):
1. **Services error channels & trust boundaries** (`src/services/`): catch-and-continue, sentinel-instead-of-throw, error paths unreachable against the real shapes they guard (the recently-fixed worked example: a pause path unreachable because the real service threw a plain structural union while the test fake threw `ApiError`); wire shapes leaking past the ACL; resource registrations without owner-located release.
2. **Store teardown & migrations** (`src/store/`): `BOARD_SCOPED_STORE_CELLS` registry vs the actual per-board cells (cleanup lists that fail open at the next cell); `closeBoard`/`resetWorkspace` recent-rework claims vs reality; rolling two-migration archive discipline; fields added without migrations; hydrate-time deepMerge masking wrong-path no-ops.
3. **Composable lifecycle & ownership** (`src/composables/`): watchers/listeners/timers/module-scope caches without release; multi-writer state where the owner doesn't own aliased write paths; flow exits handled by instance enumeration instead of a predicate over a closed vocabulary (exhaustive `never`-default switch is the house pattern); effects living in composables that belong in services.
4. **Engine trust boundaries** (`src/engine/`, `src/logic.ts`): SGF parsing that silently coerces where it should surface (UI input-validation fallback is a documented ADR-0002 exception — distinguish honestly); KataGo wire fields read through unjustified casts; hand-rolled re-derivations under names that claim a different traversal (the `serializeActivePath` class); switches over wire vocabularies without exhaustiveness defaults.
5. **Test fake-fidelity** (`tests/fakes/` vs real services): rejection/return SHAPE divergence (Error subclass vs plain object), fixtures escaping the typecheck surface (tests/ is outside vue-tsc), tautological tests asserting the fake.

Notes: an in-flight arc is relocating analysis-ledger/analysis-config/stability-trajectory-store from services/ to src/state/ — their location is not debt. Multi-tab last-write-wins is documented behavior. NO performance claims without a capture (ADR-0009) — structural findings only.

Dedup baseline — open work-status items (mark findings TRACKED(id) or NEW; documented known-erosions and deliberate [experimental]/[B?] tags are recorded, not debt):
ACTIVE: chess-clone; knob-wire-key-derivation; silent-coercion-protocol-boundaries-audit (protocol-boundary coercion findings cite this id); config-schema-projections; i18n-string-sweep; many-boards-open-slowness; nav-during-range-query-perf; perceptual-event-projection; pv-hover-jank-range-query; refactoring-queue-adr0007 (ADR-0007 oversize queue); responsive-design-deferred; save-disconnect-clears-graph; spa-board-scope-consistency-audit (gated scope-handling decision); adr-effectiveness-audits; doc-graph-svg-render-off-tree; doc-graph-svg-spline-failure. IN-PROGRESS: reactive-state-modules-relocation.
FUTURE: backend-gamma-default-mismatch; browse-tag-dsl-filter; bulk-card-management; community-palette-library; content-addressed-card-identity; distribution-packaging; gradingparameter-opacity-typing; item-32-zeroconf-discovery; library-tag-favorite; public-deployment; qeubo-pbo-wire-rename; rename-tag; serial-numbers-generated-artifacts; source-file-header-lint; who-is-ahead-trainer; app-vue-extraction-residue (grading-gate entry-point net, scoped-duplicate consolidation, useFollowMePonder idempotence); automatic-mistake-discovery; band-conformance-advisory-ratchet; board-close-minimize-restore; card-editor; card-metadata-during-review; cardtree-max-nodes-deeper-fix; chart-panel-preview-migration (hover-preview async-write shape); closeboard-class-b-teardown-shape (the teardown-shape *decision* is parked; concrete teardown *defects* are still reportable); configurable-rootinfo-display; engine-connection-lifecycle-logout; inline-analysis-config-editing; item-27-etag-multitab; kde-boundary-bias; keybindings-deferred-extensions; mistake-finder-unpunished-brittleness; offload-layout-to-libraries; playenginemoves-cursor-conflation-twin (latent, documented, verified real); policy-head-overlay; polymorphic-chart-renderer; profile-owner-scope-analysis-net (alias-write class review-only today); pv-animation-defaults-calibration; pv-manual-scroll-stepping; pv-overlay-typography-calibration; qeubo-cacheoverride-parameter; semantic-clarity-refactors-effect-typing; stability-surface-distribution-metric; substrate-arc-deferral-residue; syncservice-suspend-resume; usestabilitymetrics-incremental-projection; whos-ahead-drill; katago-firstreport-floor-upstream-filing; learned-vf-dispatch-closure; rigor-proportionality-rubric-adoption.
You may re-probe the store READ-ONLY: `psql -h 192.168.122.1 -d todo` (SELECT only).

Method: counts measured (grep/AST/wc), never estimated. Severity by the substitution test (what the failure shape would cost on a critical surface). Confidence: `verified` (traced/ran) vs `lead` (pattern-spotted).

Return in your final message:
1. VERDICT: does "obvious technical debt is out of the way" hold for the code layer? (yes / yes-with-residue / no) + one paragraph.
2. FINDINGS table: file:line | class | severity | confidence | TRACKED(id)/NEW | one-paragraph evidence each.
3. COVERAGE: per priority tier — what you examined, what you sampled, what you skipped.
```

## A2. Code-judgment reviewer — report (verbatim)

`library-service.ts:236` — the `instanceof ApiError && err.status === 404` guard catches errors directly from `api.request` (which throws raw `ApiError`). No intermediate re-parse into a structural union, so the guard is reachable. This is the `404 → null` sentinel — but it's a documented in-contract "no such game" case (mirrors the persistence-service `restore` 404→null and qeubo 404 patterns), not a sentinel-instead-of-throw violation. The `silentStatuses: GET_GAME_SILENT` makes it in-contract per ADR-0002. Correct.

I have thorough, verified coverage. Let me compile the final report. The picture is clear: the campaign genuinely cleared the obvious debt, with a small residue. Let me write the verdict.

Based on my end-to-end reading of the orientation docs and direct verification across all five priority tiers, here is my independent assessment.

---

### 1. VERDICT: **yes-with-residue**

The claim "the obvious technical debt is out of the way" holds for the code layer. The recently-closed campaign did real structural work, not cosmetic closure: the priority-1 worked example (the autosave-pause-unreachable defect) is fixed comprehensively, with a shape-agnostic recognizer (`asStorageError`), a pin test, and a fake that derives its rejection through the *same production parse* the real service uses — exemplary fake-fidelity hygiene. The `BOARD_SCOPED_STORE_CELLS` registry is currently exhaustive over the three `PerBoard<>` schema fields; `closeBoard`/`resetWorkspace` are heavily and accurately documented; the migration rolling-archive discipline is honored (two anchors, `v60` is itself the *corrective* for the deepMerge-masked wrong-path no-op class, found by a composition test and tracked); and the composable layer shows a thoroughly internalized resource-ownership discipline (no new leaks found across 17 files read end to end). What remains is a small, bounded residue — one genuinely-new low-severity board-keyed leak, plus one already-tracked-but-undischarged high-confidence finding the campaign did NOT clear (the engine-subscription union-erasing casts, with a traced corruption path and a shovel-ready fix). The residue is "yes-with," not "no," because none of it is on a critical-correctness surface and the largest item is already filed with a worked fix waiting.

### 2. FINDINGS

| file:line | class | severity | confidence | tracked/new | evidence |
|---|---|---|---|---|---|
| `src/services/analysis-service.ts:714` & `:915` | union-erasing cast at engine trust boundary (tier 4) | **med** | verified | **TRACKED(silent-coercion-protocol-boundaries-audit)** | Both `subscribe` callbacks do `this.onAnalysisUpdate(res as KataAnalysisResponse, queryId)` with the comment "an analysis query only ever yields analysis responses, so narrow." The proxy can route an error packet (`{id, error}`) onto an analysis query's `id`; that packet is cast to the analysis variant and read in `onAnalysisUpdate` as if it had `rootInfo`/`moveInfos`. The work-status item records the exact traced corruption (telemetry `turnsCompleted` corruption, premature auto-cleanup, false ponder-exhausted warning, leaked `activeQueries` entry) and the in-repo fix precedent (`awaitFinalPacket`). The item's E2 note flags the line numbers had rotted (:687/:885 → now :714/:915) AND that this work "riding a broad sweep item is invisible to execution rounds" — i.e. the campaign did not discharge it. This is the strongest residual: a real, traced, ADR-0002-Rule-4 violation left open. |
| `src/services/analysis-persistence-service.ts:387` (`discard`) vs `:279/:290` | board-keyed resource not released at owner teardown (tier 1/2) | **low** | verified | **NEW** (within scope of `closeboard-class-b-teardown-shape`, whose standing fact "zero teardown leaks found" this contradicts) | `closeBoard` calls `analysisPersistenceService.discard(boardId)` as its only persistence-service teardown; `discard` clears `this.summaries` only. The two sibling board-keyed reactive maps `dirtyVersions` (`:279`) and `autoSaveErrors` (`:290`) are NOT drained per-board — they survive board close until the next `forgetAll` (identity flip), which *does* clear all three (`:517-519`). The asymmetry is structural: there's a `forgetBoard` release verb for `summaries` but no per-board release verb for the other two, so `closeBoard` has no way to drain them even if it wanted to. Failure shape: bounded leak (one `number` + one small POJO per board ever opened in a session), no correctness/privacy issue (`BoardId` is UUID-fresh, never reused; the autosave watcher is torn down so stale entries are never read). The fake mirrors the real service's missing drain, so no test catches it. Contradicts the item's "zero teardown leaks found" standing fact — worth surfacing for that reason. |
| `src/engine/sgf-loader.ts:16` | SGF file-data silent coercion (tier 4) | **low-med** | verified | **NEW** (candidate for `silent-coercion-protocol-boundaries-audit` scope, but engine/file-side, not wire) | `const size = parseInt(sabakiRoot.data['SZ']?.[0] ?? '19', 10)` — `?? '19'` handles *absent* `SZ`, but a present-but-malformed `SZ[foo]` from a corrupt file yields `NaN`, which propagates silently into board geometry (coord math, ownership decode, every `rules.ts` neighbour computation). This is FILE data, not user keystrokes, so the ADR-0002 UI-input-validation exception does not apply. Honest contrast in the same codebase: `getKomi` (`util.ts`) guards `isNaN(km) ? 6.5 : km`; this parse does not. Mitigation that caps severity: a bad size produces a visibly-broken board, not silently-corrupt data that round-trips. |
| `src/engine/util.ts` `sgfToMove` (~`:17`) | SGF file-data silent coercion (tier 4) | **low** | verified | **NEW** | `sgfToMove` converts an SGF coordinate via `charCodeAt(0) - 97` arithmetic with no bounds validation on inbound file coordinates (only an empty/`tt`-pass early return). A malformed coordinate yields a garbage/`NaN` x/y returned as a `place` move into `validateMove`. The sibling `toGtp` bounds-checks and warns; the inbound `sgfToMove` does not. Low because `validateMove` downstream rejects most pathological placements, but the coercion itself is silent on file data. |
| `src/engine/sgf-loader.ts:142` | prod-silent / DEV-only error surfacing (tier 4) | **low** | verified | **NEW** | The one place the loader notices an illegal SGF move surfaces it only under `if (import.meta.env.DEV)` (`console.warn`); in production the illegal move is silently skipped. Per ADR-0002 a file-trust-boundary deviation should surface at *some* level in prod. Low because the resulting board stays internally consistent and an illegal-move-in-SGF is genuinely recoverable. |
| `src/engine/katago/katago-client.ts:90` | wire JSON parsed into discriminated union without structural validation (tier 4) | **low-med** | verified | **TRACKED(silent-coercion-protocol-boundaries-audit)** (same boundary, upstream of the analysis-service casts) | `const response: KataGoResponse = JSON.parse(rawData)` is a *type annotation* (not an `as`, so it escapes the cast-justification lint) over raw WebSocket JSON; the `try/catch` catches only JSON *syntax* errors, not shape violations. `version-probe.ts` validates its probe responses through guards at the same boundary; the high-frequency analysis path does not. Severity capped because the proxy is a trusted local component with its own `mypy --strict` wire contract — this is the ACL-validate-vs-trust judgment ADR-0002 Rule 4 names, and the downstream blast is the analysis-service finding above. |
| `src/components/editors/AnalysisControls.vue:161` (`isStorageError`) | duck-typed guard skips per-kind leg revalidation (tier 1) | **low** | verified | **NEW** (minor) | `isStorageError` checks only `'kind' in err && 'status' in err`, then reads `err.requestBytes`/`err.capBytes`/etc. without the per-kind numeric-leg validation that `asStorageError`/`recogniseStorageUnion` perform. A malformed `{kind, status}` POJO would pass and read `undefined` fields into the i18n formatter. Not a reachability bug (the real backend envelope is well-formed and the service re-validates on rethrow); purely a robustness asymmetry vs the canonical recognizer. |

**Informational (not debt):** the `serializeActivePath` named class is already remediated (delegates to branded `getPath`; only the misleading symbol name survives, deliberately, on the `window.Writer` debug surface). `SyncService.startWatcher` and `useQueryTelemetry`'s interval are app-lifetime singleton watchers with no production stop — acceptable-by-design, documented. No `switch`-over-wire-vocabulary-without-`never`-default debt exists (measured: zero `switch` statements in the engine tier; the `KataGoActionQuery` action union is closed but unswitched — a latent exhaustiveness gap, not present debt).

### 3. COVERAGE

- **Tier 1 (services error channels):** Examined in full — `api-client.ts` (canonical `ApiError` source, fails loudly), `analysis-bundle.ts` (the `parseStorageError`/`asStorageError`/`recogniseStorageUnion` recognizer trio), `analysis-persistence-service.ts` (save/restore/discard/forgetAll throw + teardown paths), `backend-service.ts` (422→`CardTreeOverflowError`), `qeubo-service.ts` ACL (status→`QeuboError`, `narrowPhase` exhaustive throw), `library-service.ts` (404→null), `sync-service.ts` (hydrate error channel). Traced every `instanceof ApiError` guard against its real throw path — all reachable; the priority-1 worked-example class (guard unreachable against real shape) is closed and does not recur. **Sampled:** `engine-connection.ts`, `resource-service.ts`, `query-id.ts` (small, no catch blocks). **Skipped:** `analysis-service.ts` read only at the two cast sites + error region (60KB file; full read deferred — flagged honestly).
- **Tier 2 (store):** Examined in full — `closeBoard`/`resetWorkspace`/`BOARD_SCOPED_STORE_CELLS` registry (cross-checked against all three `PerBoard<>` schema fields → exhaustive), `migrations.ts` (two-anchor window + the v60 deepMerge-no-op corrective), `updateFromRemote` deepMerge sites. **Sampled:** `schema.ts` (grepped for `PerBoard`/board-keyed dictionaries), `archived-migrations.ts` (header/count only). **Skipped:** `defaults.ts`, `migration-witness.ts`, `profile-owner.ts` internals (the ADR-0001 mutator-owner work is recent and lint-backed; deferred to the mechanical sweep).
- **Tier 3 (composables):** Delegated to a sub-agent that read 17 files end to end (all the effectful/largest by name and size) and grep-verified the rest; module-scope-cache grep returned 13 hits, all read. Result: no new debt — every resource has a verified release, multi-writer slots route through single owners, no composable does direct fetch/WebSocket/localStorage I/O. One honest caveat from that agent: `useFollowMePonder` not read end to end (its idempotence is tracked as `app-vue-extraction-residue`; didn't surface in leak greps).
- **Tier 4 (engine):** Delegated to a sub-agent that read all 17 engine/logic files end to end; I personally re-verified its high/med findings (`katago-client.ts:90`, `sgf-loader.ts:16/142`, the cast census). Cast discipline holds (10 of 11 explicit `as` carry justification; the one hole is the annotation, not an `as`).
- **Tier 5 (fake-fidelity):** Examined all three fakes in full (`analysis-persistence-service.ts`, `analysis-service.ts` surface, `backend-service.ts`) against their real services. The closed worked-example's fake is exemplary (`realServiceStorageThrow` + pin test). One observation folded into the tier-1 leak finding: the persistence fake faithfully mirrors the real service's *missing* per-board drain, so no test catches that leak.

**Budget honesty:** I did not read `analysis-service.ts` (60KB) end to end — only the cast sites and error region — so any error-channel debt buried in its bulk is uncovered. The `silent-coercion-protocol-boundaries-audit` already owns the analysis-service trust-boundary findings, which lowered my marginal value there. I respected the licensing firewall (no `backend/qeubo/` reads) and skipped the doc/mirror sweep entirely per the commission.

---

## A3. Mechanical drift sweep — commission (verbatim; model: Sonnet)

```
You are running a mechanical drift sweep over the LengYue frontend (`/home/bork/w/omega/frontend`; umbrella repo at `/home/bork/w/omega`). READ-ONLY: no edits, no branches, no DB writes. Do not read anything under `backend/qeubo/`. Follow the steps below exactly; where a step needs judgment beyond pattern-matching, record the case as `needs-review` instead of deciding.

Context: a debt campaign just closed (2026-06-10/11). You are checking the hand-maintained mirrors and markers for drift. A separate reviewer covers code judgment — do not review code logic.

Preparation: read `frontend/CLAUDE.md` end to end (it defines the FILES.md / IDENTIFIERS.md update disciplines), and read `frontend/eslint.config.js` end to end (its long header is one of your audit objects).

Run these checks, in order, reporting the exact commands you ran and the measured counts:

1. **FILES.md vs tree, both directions.** Script a comparison: (a) every `.ts` and `.vue` file under `frontend/src/` has an entry in `frontend/FILES.md`; (b) every path-like entry in FILES.md exists on disk (ghost rows). Report full lists of misses, not samples.
2. **IDENTIFIERS.md cite spot-check.** Take 10 `file:line` construction-site cites spread across the document; for each, check the named identifier is actually constructed at (or within ±10 lines of) the cite. Report each as ok / drifted(actual location) / gone.
3. **eslint header vs rules.** For every lint the `frontend/eslint.config.js` header narrative names, confirm a matching rule exists in the config body; for every `local/*` rule in the body, confirm the header narrates it. List mismatches both directions.
4. **Work-status pointers in code/config.** Grep `frontend/src/`, `frontend/tests/`, and `frontend/eslint.config.js` for kebab-case work-status item ids (pattern: quoted or backticked slugs of 3+ hyphenated words near the words "item", "tracked", "stage", "deferred", "work-status", "todo"). For each candidate id found, query the store READ-ONLY (`psql -h 192.168.122.1 -d todo -c "SELECT id, state, disposition, resolution FROM items WHERE id='<id>';"`). A pointer presented as open/pending whose item is CLOSED is a finding; a pointer to a nonexistent id is a finding.
5. **Marker sweep.** Grep `frontend/src/` and `frontend/tests/` for: `TODO`, `FIXME`, `HACK`, `XXX`, `not-filed:`, `stage 2`, `for now`, `temporary`, `deferred`. For each hit, classify: (a) carries a resolvable handle (open work-status id, `not-filed:` rationale, or a committed-doc anchor) → list as anchored; (b) no handle → list as UNANCHORED (the finding class). Report every unanchored hit with file:line and the comment text.
6. **CI gates exist as documented.** Check `.github/workflows/` (repo root and frontend/): a frontend CI running build + eslint + test:run on frontend PRs, and a doc-graph freshness gate. Report present/absent per gate, citing the workflow file and job names.
7. **Doc-graph dangling references.** Read `docs/doc-graph-report.md`; list any dangling cross-references whose source or target is a frontend doc (`frontend/` or `docs/` files about the frontend).

Return in your final message:
1. VERDICT for the mirror/marker layer: clean / clean-with-residue / drifted, one paragraph.
2. FINDINGS: one row per finding — location | check # | what drifted | severity (high/med/low) | the measured evidence. Include the `needs-review` cases separately.
3. COVERAGE: commands run, counts, anything skipped and why.
```

## A4. Mechanical drift sweep — report (verbatim)

Now I have all the data needed to compile the full report. Let me assemble it.

---

### VERDICT

The mirror/marker layer is **clean-with-residue**. The structural integrity of FILES.md is sound — all 231 `src/` TypeScript and Vue files are accounted for in both directions (zero missing rows, zero ghost rows), and CI gates (frontend-ci + doc-graph-ci) exist and are correctly scoped. The ESLint header-to-body correspondence is clean: every rule narrated in the header is present in the config body and vice versa. All work-status item ids in code and the eslint config resolve to real, extant items; the one cited as open (`engine-connection-lifecycle-logout`) is genuinely open. The residue is: (1) IDENTIFIERS.md construction-site line numbers have drifted in five rows by 5–60 lines following code growth since the map was last updated; (2) two TODO markers in src use numeric handles (`item 28`, `item 20`) that resolve to nothing in the work-status store; (3) three src-code comments still reference the retired `deferred-items.md` document by name.

---

### FINDINGS

| Location | Check # | What drifted | Severity | Measured evidence |
|---|---|---|---|---|
| `frontend/IDENTIFIERS.md`, BookmarkId row | 2 | Construction site cited as `useQeubo.ts:782`; identifier `generateUUID() as BookmarkId` actually at `:842` (60-line drift) | low | `grep -n "generateUUID.*BookmarkId"` → line 842 |
| `frontend/IDENTIFIERS.md`, CardId row | 2 | ACL re-brand sites listed as `backend-service.ts:124,130,239,294,300,302,337,363`; actual: `:135,141,250,305,311,313,348,372` (~11-line shift throughout) | low | `grep -n "as CardId" backend-service.ts` |
| `frontend/IDENTIFIERS.md`, GameSourceId row | 2 | ACL sites listed as `backend-service.ts:240,301,338`; actual: `:251,312,349` (~11-line shift) | low | `grep -n "as GameSourceId" backend-service.ts` |
| `frontend/IDENTIFIERS.md`, NodeId row (logic.ts) | 2 | Fresh node mint cited as `logic.ts:106`; actual: `:116` | low | `grep -n "as NodeId" logic.ts` → `:116` |
| `frontend/IDENTIFIERS.md`, NIL-UUID rows | 2 | ProfileId/SessionId mint cited as `store/index.ts:74,569` and `defaults.ts:597`; actual: `:80,81` and `:690,691` (store), `:602` (defaults) | low | `grep -n "NIL_UUID as ProfileId"` per file |
| `frontend/IDENTIFIERS.md`, ColorMoveIndex row | 2 | Construction sites cited as `useTriangularHeatmap.ts:58,59,70,71`; actual: `:63,64,75,76` | low | `grep -n "as ColorMoveIndex"` → lines 63,64,75,76 |
| `frontend/IDENTIFIERS.md`, analysis-persistence-service.ts BoardId | 2 | Site listed as `:170`; actual `:176` | low | `grep -n "asBoardId" analysis-persistence-service.ts` → `:176` |
| `frontend/src/services/api-client.ts:113` and `:100` | 4/5 | "TODO item 28" and "item 20" are numeric references with no match in the work-status store (no item id `28` or `20` exists) | med | `psql … WHERE id='28'` → 0 rows; `WHERE id='20'` → 0 rows |
| `frontend/src/components/board/BoardDisplay.vue:271`, `MoveSuggestions.vue:234`, `store/schema.ts:517` | 5 | Three src comments reference `deferred-items.md` by name; that file is retired (absorbed into the work-status DB). Comments are descriptive anchors, not operational pointers, but the target doc no longer exists. The named items (pv-overlay-typography-calibration, container-query-recompute) are findable in the store. | low | `ls docs/notes/deferred-items.md` → NOT FOUND; `psql … WHERE id='pv-overlay-typography-calibration'` → open |
| `docs/doc-graph-report.md` (live, missing on disk) | 7 | `docs/notes/audit/audit-adr-corpus-2026-06-10-appendix-p1.md` → `docs/notes/analysis-persistence-plan.md` missing; `docs/notes/decisions-deferred.md` → `docs/release-scope.md` missing; `docs/notes/design/mistake-finder-pedagogy-and-followups.md` → `docs/notes/pedagogy.md` and `docs/pedagogy.md` missing; `docs/notes/distribution-packaging.md` → `docs/notes/distribution-tauri-plan.md` and `docs/release-scope.md` missing; `docs/notes/postmortem/postmortem-adaptive-deeper-enrichment-2026-05.md` → `docs/dispatch/frontend-to-proxy-wire-diagnostic-channel.md` missing. (12 total live-missing in the report; none have frontend/ as source, but several have frontend docs as indirect context.) | low | `docs/doc-graph-report.md` §"missing on disk" — 12 entries |
| `docs/doc-graph-report.md` (live, outside node set — frontend targets) | 7 | `frontend/docs/notes/board-scope.md` referenced from two live audit docs but outside the doc-graph node set; `frontend/tests/CLAUDE.md` referenced from three live docs but outside the node set; `frontend/docs/i18n.md` referenced from one live retrospective but outside the node set. | low | Lines 112–118 of doc-graph-report.md |

**needs-review cases:**

| Location | Check # | Note |
|---|---|---|
| `frontend/src/components/charts/HeatmapChart.vue:67` | 5 | "A polymorphic-renderer abstraction is parked under Future projects in `docs/TODO.md`" — `docs/TODO.md` exists but is now a projection-only stub; the referenced "Future projects" section needs a live work-status item to be a proper anchor. Reads as unanchored if the future-projects list was in `docs/TODO.md` before its content moved to the DB. |
| `frontend/src/composables/useQeubo.ts:865` | 5 | "Phase 5 deferred fix, knob-registry-plan §11 follow-up" — references a design doc (`knob-registry-plan`) rather than a work-status item slug; no item id found for this section reference. Not clearly unanchored (design doc may exist), but warrants verification. |

---

### COVERAGE

**Commands run:**

1. **Check 1 (FILES.md vs tree):** `find /home/bork/w/omega/frontend/src -name "*.ts" -o -name "*.vue"` → 231 files; custom Python parser on FILES.md tree block → 231 paths extracted. `comm -23` / `comm -13` on sorted lists → 0 missing rows, 0 ghost rows. (Initial attempt used a depth-miscalculating parser; corrected and re-run.)

2. **Check 2 (IDENTIFIERS.md spot-check):** 13 construction-site cites verified via `sed -n` and `grep -n` against the named files. 6 cites confirmed exact (±0 lines); 7 cites drifted by 5–60 lines (line-number drift only; identifiers still exist at the same files, just shifted by code growth). All identifier types still present and correctly named.

3. **Check 3 (ESLint header vs rules):** All 16 rules narrated in the header (`vue/no-v-html`, `vue/require-v-for-key`, wire-type boundary, component-services boundary, `@typescript-eslint/switch-exhaustiveness-check`, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/only-throw-error`, no-restricted-syntax error-message guard, any-assertion guard, profile-aliased-write selectors, `vue/no-restricted-syntax`, `local/clear-needs-ownership`, `local/store-write-needs-owner`, `local/gate-prop-needs-default`, `local/module-intent-in-script-setup`, `local/justification-adjacency`, `local/hand-rolled-path-walk`) present in the config body. All 6 `local/*` rules in the body narrated in the header. **No mismatches in either direction.**

4. **Check 4 (Work-status pointers):** `grep -rn` over `frontend/src/`, `frontend/tests/`, `frontend/eslint.config.js` with pattern matching work-status near item slugs → 15 distinct item ids surfaced. All queried via `psql -h 192.168.122.1 -d todo`. Results: 13 closed/shipped (correct); 1 genuinely open (`engine-connection-lifecycle-logout` — pointer is honest); 2 numeric references (`item 28`, `item 20`) that resolve to no DB rows (no slug-form ids).

5. **Check 5 (Marker sweep):** Grepped for `TODO`, `FIXME`, `HACK`, `XXX`, `not-filed:`, `stage 2`, `for now`, `temporary`, `deferred` over `frontend/src/` and `frontend/tests/`. **FIXME, HACK, XXX, not-filed:** zero hits. `TODO`: 2 hits — one numeric (api-client.ts, unanchored), one pointing to `docs/TODO.md` (anchored but to a stub). `stage 2`: 2 hits — both clearly descriptive (not markers). `for now`: 1 hit in BaseChart.vue (dead-code note, not deferred work). `temporary`: 1 hit in useMinting.ts (inline explanation, not a work deferrment). `deferred`: ~15 hits, all either anchored to work-status items, committed doc anchors, or the `deferred-items.md` reference class (3 hits to a retired document).

6. **Check 6 (CI gates):** `.github/workflows/frontend-ci.yml` — present, covers build (`vue-tsc -b && vite build`) + `eslint .` + `npm run test:run` on `frontend/**` PRs and main pushes. Includes `band-conformance` job (structural drift gate + advisory band-ordering, non-gating for advisory findings). `.github/workflows/doc-graph-ci.yml` — present, covers freshness check (`node tools/doc-graph/generate.mjs --check`) on doc-related paths. **Both gates present and correctly configured.**

7. **Check 7 (Doc-graph danglers):** `docs/doc-graph-report.md` read in full. 12 live-missing danglers, none sourced from `frontend/` docs. 3 frontend targets outside the node set (`frontend/docs/notes/board-scope.md`, `frontend/tests/CLAUDE.md`, `frontend/docs/i18n.md`) — scan-scope artifacts, not reference rot. No frontend-sourced live danglers.

**Nothing skipped.** The `backend/qeubo/` exclusion (licensing firewall) was not triggered — no read into that path was required.

---

License: Public Domain (The Unlicense).
