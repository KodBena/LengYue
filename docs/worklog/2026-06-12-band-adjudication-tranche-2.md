# Worklog — band adjudication, tranche 2 (2026-06-12)

> Audit trail for the maintainer's 2026-06-12 ground-truth band calls,
> discharged into `frontend/FILES.md` retags, `BAND_EXCEPTIONS` entries,
> and a ratchet-down of `NO_NEW_FINDINGS_RATCHET` (47 → 31). Work-status
> item: `band-conformance-advisory-ratchet` (this discharges 16 of the
> 47-finding review surface; the item stays open for the remaining 31).
> Coordinator-authored; branch `bork/docs/band-adjudication-tranche-2`.
> Tranche 1 (same day) was the `useTags.ts` call: confirmed [B1], zero
> findings, no code change — recorded on the store item only.

## The maintainer's adjudications

Recorded verbatim-adjacent on the store item; the operative calls:

1. **SidebarWidget.vue** — not B1; B2 or B3 ("it renders a board, but
   that board rendering could arguably be a chess board as well; on the
   other hand, I'm not sure it makes sense for a general-purpose
   knowledge application to even have a sidebar widget"). Pick
   delegated to coordinator inspection.
2. **LibraryTab.vue** — not B1; B2 or B3, same reasoning.
3. **SettingsTab.vue** — B1, "modulo any B2/B3 contamination that might
   simply be a structural necessity … it may be dependent on the
   resolution of config-schema-projections".
4. **ForestDirectory.vue** — B1 "modulo the B2/B3 specifics — thumbnail
   rendering of position, target moves label for card in this domain,
   analysis config … the delineation is fairly obvious".
5. **engine/navigator.ts** — "ought to be B2".
6. **composables/keybindings-catalog.ts** — B3 "as long as it lives up
   to its name (only a go-specific registry and not a generic
   registry, in which case it should be B1)".
7. **services/analysis-service.ts** — B3 confirmed ("obviously *not*
   B2, and hence not B1"). No change required; tag was already [B3].

## Coordinator inspections (full reads, ADR-0002)

- **SidebarWidget.vue → [B3].** The conditional resolves high: SGF
  load/save emits and labels live in the file's own script/template
  (SGF is Go vocabulary; chess is PGN), the docked hover preview
  renders `BoardSnapshot` via MiniBoard, and the rail's children
  (BoardTab, MiniBoard, useThumbnailCache) are all [B3]. Dominant
  concern: hosting Go-board surfaces.
- **LibraryTab.vue → [B3].** W/B per-color player filters are in-file
  (hardcoded "White"/"Black" labels); the surface exists to browse and
  import the Go game library (SGF import panel, board preview pane,
  `LibraryGame` flow to the board). Dominant concern: the Go game
  library.
- **SettingsTab.vue → [B1].** Own machinery is fully generic (sub-tab
  strip, disclosures, generic registry editors, profile-owner routing,
  capture-mode release on tab-away). The contamination is exactly what
  the maintainer hedged on: PaletteEditor / AnalysisTabsEditor /
  CardSetEditor / profile-owner imports plus the in-template
  `engine.katago.analysis_env` path string. All four edges are
  annotated named-and-owned exceptions, owner config-schema-projections
  (the RegistryEditor WINRATE_FRAMINGS entry is the established
  register). Row description also corrected: the tab has had three
  sub-tabs (General / Analysis / Keybindings) since the analysis-layout
  editor landed; the row said two.
- **ForestDirectory.vue → [B1].** Own script/template vocabulary is
  deck/card/lineage/review — domain-free SRS surface; no Go vocabulary
  in-file. The eleven domain edges (three [B3]: ReviewSessionPanel,
  CardMetadataPanel, useReviewSession; eight [B2]: CardTreeWidget,
  ForestTreeNav, useCardMetadata, useCardTreeData, useForestNavigation,
  useForestStats, useForestBrowsePolicy, context-id-macros) are the
  named delineation, annotated as exceptions in the
  main.ts|App.vue wiring register.
- **keybindings-catalog.ts — [B3] confirmed.** It lives up to its
  name: the generic machinery was already split to `lib/keybindings.ts`
  [B1] (2026-06-10, audit §3.16); the catalog is the domain half —
  ponder toggle and ownership-overlay actions dispatch into
  analysis-service, and its own header records "a fork replaces this
  file wholesale and keeps the substrate". Its three importers
  (KeybindingRow [B1], KeybindingsView [B1], useUserIORegistry [B2])
  consume it as an opaque decl registry — excepted, dominant concern
  holds.
- **navigator.ts — stays [B3]; B2 recorded as adjudicated TARGET.**
  The one push-back. The implementation is saturated with Go fact:
  `navigateTo` replays stones, captures, ko points, and decodes SGF
  setup coords (AB/AW/AE) inline. Tags record structural fact, not
  aspiration (the lib/keybindings.ts row is the in-tree precedent), so
  the row now carries the maintainer-adjudicated B2 target and names
  what blocks it: splitting the Go replay out of the LCA walk. The
  three navigator findings (jankSubstrate, loadIntoBoard,
  useNavigation) stay live — they reflect real coupling until that
  split.

## Mechanical discharge

- `frontend/FILES.md`: 4 retags (SidebarWidget B1→B3, LibraryTab
  B1→B3, SettingsTab B2→B1, ForestDirectory B2→B1), 2 annotations
  (navigator target-note; keybindings-catalog maintainer-confirmed).
- `tools/band-conformance/check.mjs`: +18 `BAND_EXCEPTIONS` entries
  (3 keybindings-catalog importers, 4 SettingsTab edges, 11
  ForestDirectory edges), each with the adjudication register in its
  reason string.
- `NO_NEW_FINDINGS_RATCHET`: 47 → **31**, baselineDate 2026-06-12.
  Arithmetic: 47 − 7 (dissolved by the B1→B3 retags: SidebarWidget 4,
  LibraryTab 3) + 9 (surfaced by the →B1 retags: SettingsTab 1,
  ForestDirectory 8 — real edges previously masked by the importers'
  optimistic tags) − 18 (excepted) = 31. This is a ratchet-DOWN with a
  transient in-branch peak at 49; main never sees a count above its
  baseline.

## Triage table (per-finding disposition)

| Cluster (of the 47-baseline population) | n | Disposition |
|---|---|---|
| SidebarWidget → BoardTab / MiniBoard / useThumbnailCache / useJankTest | 4 | **Dissolved** — importer retagged [B3] (wrong tag was the importer's) |
| LibraryTab → LibraryPreviewPane / useLibraryImport / useLibraryPreview | 3 | **Dissolved** — importer retagged [B3] |
| KeybindingRow / KeybindingsView / useUserIORegistry → keybindings-catalog | 3 | **Excepted** — catalog [B3] confirmed; consumers generic, dominant concern holds |
| SettingsTab → PaletteEditor / AnalysisTabsEditor / profile-owner (+ CardSetEditor, surfaced) | 3+1 | **Excepted, named-and-owned** — owner config-schema-projections |
| ForestDirectory → ReviewSessionPanel / CardMetadataPanel / useReviewSession (+ 8 surfaced B2 edges) | 3+8 | **Excepted** — the maintainer's "modulo" delineation, wiring register |
| Everything else | 31 | **Remain** — un-adjudicated review surface (below) |

## The remaining 31 (snapshot at this branch; live view: `node tools/band-conformance/check.mjs`)

Cluster summary: `engine/util.ts` importers (5), `store/profile-owner.ts`
importers (5), `engine/navigator.ts` importers (3, target-noted),
`analysis-service.ts` B2-importers (3), `suggestion-colors.ts` (2),
`analysis-config-curation.ts` (2), TreeWidget (2), useAnalysisPersistence
(2), loadIntoBoard's sgf-loader edge (1), and 6 singletons.

```
[B2] card-tree-echarts.ts            → [B3] useCardThumbnail.ts
[B1] ColorDebugStrip.vue             → [B3] engine/suggestion-colors.ts
[B1] HeatmapChart.vue                → [B3] useTriangularHeatmap.ts
[B1] KnobSlider.vue                  → [B3] store/profile-owner.ts
[B2] HorizontalTimelineVisualizer.vue → [B3] engine/suggestion-colors.ts
[B2] TreeWidget.vue                  → [B3] FloatingThumbnail.vue
[B2] TreeWidget.vue                  → [B3] useThumbnailCache.ts
[B2] useAnalysisPersistence.ts       → [B3] analysis-persistence-service.ts
[B2] useAnalysisPersistence.ts       → [B3] analysis-service.ts
[B2] useVariationPath.ts             → [B3] engine/util.ts
[B1] useLocale.ts                    → [B3] store/profile-owner.ts
[B2] useForestBrowsePolicy.ts        → [B3] engine/constants.ts
[B2] perf/autonav.ts                 → [B3] useAnalysisTabs.ts
[B2] perf/jankSubstrate.ts           → [B3] engine/navigator.ts
[B2] perf/jankSubstrate.ts           → [B3] engine/util.ts
[B2] perf/scenarioContext.ts         → [B3] engine/util.ts
[B2] perf/scenarioContext.ts         → [B3] analysis-service.ts
[B2] perf/scenarioContext.ts         → [B3] store/profile-owner.ts
[B2] perf/scenarios.ts               → [B3] analysis-service.ts
[B2] sgf/loadIntoBoard.ts            → [B3] engine/navigator.ts
[B2] sgf/loadIntoBoard.ts            → [B3] engine/sgf-loader.ts
[B2] sgf/loadIntoBoard.ts            → [B3] engine/util.ts
[B1] useAutoPopoverPerf.ts           → [B2] useAutoNavigatePerf.ts
[B2] useNavigation.ts                → [B3] engine/navigator.ts
[B2] useNavigation.ts                → [B3] engine/util.ts
[B1] useQeubo.ts                     → [B3] store/profile-owner.ts
[B1] lib/keybindings-capture.ts      → [B3] store/profile-owner.ts
[B2] backend-service.ts              → [B3] analysis-config-curation.ts
[B1] library-service.ts              → [B3] store/board-factory.ts
[B1] store/archived-migrations.ts    → [B3] analysis-config-curation.ts
[B1] store/migration-witness.ts      → [B3] store/defaults.ts
```

Two single-target adjudications would collapse much of this surface:
`engine/util.ts` (5 importers — if its coord-helpers/traversal split
the way lib/utils.ts already did, several importers stop leaking) and
`store/profile-owner.ts` (5 importers — its [B3] tag itself may merit
maintainer review; the importers consume the generic mutation owner,
not Go fact).

## Open questions surfaced, not decided

- **Navigator split.** The adjudicated B2 target implies extracting the
  Go replay (stones/ko/captures/SGF setup decode) from the LCA walk.
  Not filed as a work-status item — surfaced for the maintainer to
  decide whether it's wanted as an arc.
- **B2 card/forest composables.** ForestDirectory's B1 call raises
  whether useCardTreeData / useForestNavigation / ForestTreeNav /
  CardTreeWidget (all [B2], card-lineage shapes rather than game-tree
  shapes) deserve B1 themselves under the any-knowledge-domain
  criterion. Unadjudicated; the exceptions are written to survive
  either answer.

## Gates run

- `node tools/band-conformance/check.mjs --self-test` → 2/2 pass.
- `node tools/band-conformance/check.mjs --check` → exit 0: no
  structural drift; 31 advisory findings at the 31 baseline
  (2026-06-12). Explained violations 46 → 63 (+18 exceptions, −1
  SidebarWidget→store edge that stopped being a would-be violation
  once the importer became [B3]).
- `node tools/doc-graph/generate.mjs` → regenerated in the same change
  (this worklog is a new doc-graph node).

License: Public Domain (The Unlicense).
