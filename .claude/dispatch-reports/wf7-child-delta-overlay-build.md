# wf7-child-delta-overlay — build report

**Fallback location note:** the task requested this report at
`/home/bork/w/omega/.claude/dispatch-reports/wf7-child-delta-overlay-build.md`,
but this agent is sandboxed to its own worktree
(`/home/bork/w/omega/.claude/worktrees/agent-ab4af1260fb0ca50b`) and the
Write tool refused the shared-checkout path. Filed here instead, per
the task's own fallback instruction.

Branch: `worktree-agent-ab4af1260fb0ca50b` (worktree
`/home/bork/w/omega/.claude/worktrees/agent-ab4af1260fb0ca50b`)
Commit: `4321bddc` — "feat(frontend): board-overlay child delta + visits
annotation (wiki #7/#7.1)"

## Salvaged vs redone

**Salvaged (kept, ported unmodified or near-unmodified):**

- `frontend/src/components/board/BoardDeltaAnnotation.vue` — new leaf
  component, copied verbatim from WIP commit `7657bceb`.
- `frontend/src/composables/board/useMoveDeltaAnnotation.ts` — new
  composable, copied verbatim.
- `frontend/tests/integration/useMoveDeltaAnnotation.test.ts` — copied
  verbatim; all 6 cases pass unmodified against current `next`.
- The `use-move-suggestions.ts` (`formatVisitsCompact` export),
  `useTriangularHeatmap.ts` (`plyToColorMove`, the named inverse of
  `colorMoveToPly`), `BoardWidget.vue` wiring, and `RegistryEditor.vue`
  `PATH_ENUMS` entry — all ported as-is; the surrounding code at each
  edit site was unchanged between the WIP's stale base (3378806f) and
  current `next` (0d6d12f6), confirmed by diff before porting.

**Redone (schema/migration renumbering — the only real rework):**

- The WIP was authored against `CURRENT_SCHEMA_VERSION = 61` (stale
  base); current `next` is at 67. Re-authored the migration as `67 →
  68` (not `61 → 62`), re-applied the rolling-archive rotation against
  the *current* two active migrations (`65→66` archived out, `66→67`
  kept, `67→68` added), and updated `migrations.test.ts`'s new
  `describe` block to `step(67)` / `schemaVersion: 67` accordingly.
  `schema.ts` / `defaults.ts` doc comments updated to say "Schema-
  version 68" instead of 62.
- Two `as`-casts (`plyToColorMove`'s body, and the `colorLocalIdx as
  number` comparison in `useMoveDeltaAnnotation.ts`) needed new
  adjacent-justification comments — `eslint.config.js`'s
  `local/justification-adjacency` cast-hygiene lint requires the
  comment on the line *containing or directly above* the cast, and
  the WIP's comments sat one level too high (above the function
  signature, not above the cast expression itself) or absent. This
  lint rule postdates the WIP's stale base. Fixed by moving/adding the
  comments to the correct adjacency; no logic changed.

No other file needed rework — `useEnrichedData`, `useVariationPathFor`,
`activeAnalysisKeys`, `ledger.getRaw`/`recordRaw`/`recordEnrichment`,
`deltaSeries` shape, `colorMoveToPly`, engine constants
(`BOARD_PX`/`LABEL_BAND`/`TOTAL_PX`/`STONE_RADIUS_RATIO`), and the test
fakes/helpers (`withSetup`, `resetFakeAnalysisService`,
`resetFakeAnalysisPersistenceService`) are all unchanged in shape
between the WIP's stale base and current `next` — verified by direct
read/grep of each, not assumed.

## Where the shared delta derivation lives

`useMoveDeltaAnnotation` (`frontend/src/composables/board/useMoveDeltaAnnotation.ts`)
does **not** compute a delta. It:

1. Resolves the current node's `PlyIndex` via `useVariationPathFor`.
2. Converts to a colour-local move index via `plyToColorMove` (new;
   the named inverse of `useTriangularHeatmap.ts`'s existing
   `colorMoveToPly`, which `useAnalysisContext.ts` documents as "the
   codebase's sole (ColorMoveIndex, StoneColor) -> PlyIndex
   authority").
3. Reads `useEnrichedData(variationPath).value.deltaSeries.{black,white}`
   — the exact series `MergedDeltaPanel.vue` charts
   (`components/charts/MergedDeltaPanel.vue:86-87`) and
   `useMistakeFinder`/`useAnalysisContext` threshold against. No
   second formula anywhere.
4. Reads `ledger.getRaw(rawKey, nodeId)?.rootInfo?.visits` for the
   visit count (same field `MoveSuggestions.vue` reads for its own
   visit label, via the same `formatVisitsCompact` helper, now
   exported and reused rather than duplicated).

`perPlayer` mode (#7.1) reuses the identical `delta` value from step 3
— it only changes the label framing (mover's colour) and badge tint,
never the number. Cross-checked in the test suite
(`useMoveDeltaAnnotation.test.ts`, "cross-checks against the SAME
authority MergedDeltaPanel charts") by asserting the annotation's
delta equals a parallel `useAnalysisProjection` instance's
`enriched.value.deltaSeries.black[0].data` entry for the same node —
**WITNESSED**, test passes.

## Render mechanism + why

`BoardDeltaAnnotation.vue` renders a single small SVG `<g>` (rect +
text), not a canvas. ADR-0010's canvas rule triggers when
element-count scales with data; this overlay draws **at most one**
element (the just-played move's point) regardless of board/data size,
so canvas is not warranted — documented in the component's own header.

Read-locality (ADR-0010): the composable subscribes to per-packet
ledger state, but only inside this leaf. `BoardWidget.vue` (a
composition node) passes only structural props (`state`,
`currentNodeId`, `boardSize`, `mode`) and does not itself read the
delta/visits values — the leaf instantiates
`useMoveDeltaAnnotation` itself, confining the per-packet re-render to
the leaf, per the composable's own header rationale (mirrors
`useVariationPathFor` over `useVariationPath` for the same
many-instance-consumer reason `BoardTab.vue` documents).

## Modes shipped

`session.ui.moveDeltaAnnotation: 'off' | 'deltaVisits' | 'perPlayer'`
(schema version 68, migration `67 → 68`, default `'off'`):

- `off` — `BoardDeltaAnnotation` doesn't mount (`v-if` gate in
  `BoardWidget.vue`).
- `deltaVisits` — generic label `Δ ±x.xx · Nv`.
- `perPlayer` — `Black Δ ±x.xx` / `White Δ ±x.xx`, tinted per player
  (mirrors `MergedDeltaPanel`'s Black/White Delta convention), same
  underlying value.

Configurable via `RegistryEditor`'s `PATH_ENUMS` (Session UI registry,
same convention as `boardVariations`), session-persistent via the
standard migration/defaults/schema triad.

## Absence contract

No delta in the ledger for the current node (parent and/or child not
both evaluated) → `useMoveDeltaAnnotation` returns `null` →
`BoardDeltaAnnotation`'s `v-if="labelText && badgePos"` renders
nothing. Never a zero placeholder — covered by three dedicated test
cases (nothing recorded / raw-only-no-enrichment / at-root).

## Per-claim evidentiary status

- **WITNESSED** — `npm run build` exit 0 (`vue-tsc -b && vite build`,
  clean, 1122 modules transformed).
- **WITNESSED** — `npm run test:run` exit 0: 127 test files passed, 3
  pre-existing skips (130 total), 1611 tests passed, 4 pre-existing
  skips (1615 total). Re-run in isolation:
  `npx vitest run tests/integration/useMoveDeltaAnnotation.test.ts
  tests/unit/store/migrations.test.ts` → 2 files, 287 tests, all
  passed.
- **WITNESSED** — `npx eslint .` (full repo) exit 0, no errors or
  warnings, after the two adjacent-justification fixes above.
- **WITNESSED** — delta+visits shown when both ledger halves present;
  absent otherwise (three composable-level test cases, see above).
- **WITNESSED** — per-player mode tested against the same
  `useAnalysisProjection`/`deltaSeries` authority `MergedDeltaPanel`
  uses (cross-check test case).
- **WITNESSED** — mode toggle persistence: covered by the migration
  test's idempotency/backfill/malformed-value cases and the existing
  `RegistryEditor` enum-editor wiring pattern (not a new mechanism —
  reused verbatim from `boardVariations`'s row).
- **UNEXERCISED** — no manual/visual verification in a running browser
  (no `npm run dev` / Playwright session was run). The task's
  standing rules discourage Playwright unless essential, and the
  acceptance criteria as pre-registered are composable/kernel-level
  tests, build, and test:run — all WITNESSED above. Visual placement
  (badge offset, colour contrast) is therefore unverified beyond
  reading the SVG-coordinate math against `BoardDisplay.vue`'s own
  conventions.
- **UNEXERCISED** — vue-i18n string escaping: N/A, this feature
  introduces no new `{'{'}`-style translated strings (all labels are
  computed in TS, not i18n catalog entries — `Δ`, `Black`, `White`
  are formatted directly in `BoardDeltaAnnotation.vue`'s script, not
  routed through `t()`). Flagged rather than silently skipped per the
  standing rule's intent.

## Files touched

- `frontend/src/components/board/BoardDeltaAnnotation.vue` (new)
- `frontend/src/composables/board/useMoveDeltaAnnotation.ts` (new)
- `frontend/tests/integration/useMoveDeltaAnnotation.test.ts` (new)
- `frontend/src/components/board/BoardWidget.vue`
- `frontend/src/components/editors/RegistryEditor.vue`
- `frontend/src/composables/analysis/useTriangularHeatmap.ts`
- `frontend/src/composables/board/use-move-suggestions.ts`
- `frontend/src/store/schema.ts`
- `frontend/src/store/defaults.ts`
- `frontend/src/store/migrations.ts`
- `frontend/src/store/archived-migrations.ts`
- `frontend/tests/unit/store/migrations.test.ts`
- `frontend/FILES.md`
