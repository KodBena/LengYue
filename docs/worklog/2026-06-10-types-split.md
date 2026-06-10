# Worklog — types.ts split along its banner seams (2026-06-10)

> Audit trail for §3.15 of the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`),
> executed against the open work-status item
> `refactoring-queue-adr0007`. The 2,375-line `src/types.ts` hub is
> carved into per-domain modules under `src/types/` plus a
> store-schema module colocated with `store/defaults.ts`;
> `src/types.ts` becomes a barrel so import sites stay byte-stable.

## Named deviation (maintainer-approved)

The `refactoring-queue-adr0007` item's recorded policy is
**handled-on-touch; no batch, no named next-targets** — and this
change is a named, batch-shaped split of a file not otherwise being
touched. It proceeds as an explicit deviation from that policy,
approved by the maintainer on 2026-06-10: **"I approve strongly on
types.ts split."** The warrant on the merits is ADR-0007's own
exception text — *"Type catalogues split along clean domain seams,
not by line count alone"* — applied now that the seams exist (the
audit's finding: the banners *are* the seams; 2,362 lines at audit
time, +117 in one week, co-changed with `defaults.ts` in 48 of 90
commits).

## Module inventory

Before: one 2,375-line hub (`src/types.ts`). After: 11 modules + a
253-line barrel (2,750 total lines; the growth is per-file ADR-0006
headers, import blocks, and the barrel's re-export lists — bodies
moved verbatim).

| Module | Lines | FILES.md band | Contents |
|---|---|---|---|
| `src/types/ids.ts` | 126 | [B1] | `Brand<>` utility, `PerBoard<T>`, domain-agnostic identity / config-key / content-hash brands (BoardId, ProfileId, SessionId, BookmarkId, KeybindingActionId, RawKey/EnrichedKey, QueryId, ExtractorId/MetricId, CardTreeExpandKey, AnalysisPanelId/AnalysisTabId, CardId, GameSourceId) |
| `src/types/game.ts` | 219 | [B3] | Game-coupled brands (NodeId, StoneColor, ColorMoveIndex, PlyIndex), Go value objects (Point, Move, SgfProperties, GameMetadata, NodeDelta), game-tree state (GameNode, BoardState, EnginePlayGameSession/Config) |
| `src/types/engine.ts` | 176 | [B3] | EngineStatus, AnalysisMode, EngineMetrics, EngineState, EngineModelEntry, EngineInfo |
| `src/types/analysis-env.ts` | 56 | [B2] | AnalysisPalette, ParameterMeta, AnalysisEnvironment |
| `src/types/knobs.ts` | 349 | [B1] | KnobId, StorePath, KnobDomain/Widget/Input/Output/Transform/Decl, KnobRegistry, claim state machine (ClaimPolicy … UnsubscribeFn) |
| `src/types/qeubo.ts` | 134 | [B1] | QeuboPhase … QeuboCreateInput, QeuboErrorKind, `QeuboError` (runtime class), QeuboBookmark |
| `src/types/cards.ts` | 280 | [B2] | EbisuModel, ReviewCard, CardMetadataPatch, PipelineStage + Hole/Holed harness, HyperparamDecl, CardSet, ReviewStatus, ReviewSessionData, ReviewFeedback, CardCreatePayload/GameMetadataPayload wire aliases |
| `src/types/lineage.ts` | 122 | [B1] | ForestStat, TagStat, CardLineageNode, RootGroup, ResolveRootsResult, CardLineageTree, CardTreeNodeRole, `CardTreeOverflowError` (runtime class) |
| `src/types/library.ts` | 139 | [B3] | LibrarySortColumn/Direction, PlayerCount, LibraryGameListItem, LibraryGame, LibraryFilter, LibraryImportInput/Outcome |
| `src/types/app.ts` | 45 | [B1] | AuthState, SystemMessage |
| `src/store/schema.ts` | 851 | [B3] | RegistryLeaf/Registry, ThumbnailSettings, AnalysisTab, MintingSettings, NavigationSettings, `BUNDLE_COMPRESSION_SCHEMES` (runtime const) + BundleCompressionScheme, AppSettings, UISession, NavNodeId/NavSelection/ForestNavState, CardTreeNavState, ProfileState, SessionState, GlobalStore |
| `src/types.ts` (barrel) | 253 | [B3] | Re-exports only; keeps the catalog-wide ADR-0001 readonly-policy header |

## Banner → module mapping

| Pre-split banner (old `types.ts` region) | Destination |
|---|---|
| Re-exports: KataGo wire / PV animation / i18n locale (`:48-78`) | stay in the barrel (pure re-exports) |
| Re-exports: generated wire schemas (`:80-85`) | `types/cards.ts` (the `components` import moves with its consumers) |
| Type Branding Utilities (`:87-94`) | `types/ids.ts`, except `NodeId` → `types/game.ts` |
| PerBoard … AnalysisTabId (`:96-191`) | `types/ids.ts` |
| AnalysisTab (`:193-204`) | `store/schema.ts` (persisted in `AppSettings.analysisTabs`) |
| ColorMoveIndex/PlyIndex/StoneColor (`:206-227`) | `types/game.ts` |
| Value Objects — Point…NodeDelta (`:229-257`) | `types/game.ts` |
| State Containers — GameNode…EnginePlayGameConfig (`:259-402`) | `types/game.ts` |
| EngineMetrics (`:404-422`) | `types/engine.ts` |
| RegistryLeaf/Registry, ThumbnailSettings (`:424-433`) | `store/schema.ts` |
| AnalysisPalette/ParameterMeta/AnalysisEnvironment (`:435-474`) | `types/analysis-env.ts` |
| Knob registry (substrate-level) (`:476-807`) | `types/knobs.ts` |
| qEUBO calibration domain types (`:809-904`) | `types/qeubo.ts` |
| MintingSettings/NavigationSettings (`:906-921`) | `store/schema.ts` |
| BUNDLE_COMPRESSION_SCHEMES (`:923-958`) | `store/schema.ts` |
| AppSettings (`:960-1421`), UISession (`:1423-1582`) | `store/schema.ts` |
| CardId/GameSourceId (`:1584-1585`) | `types/ids.ts` |
| CardSetKey/ReviewSessionId (`:1586-1587`) | **deleted** (see below) |
| Forest / card-tree navigator persistence (`:1589-1642`) | `store/schema.ts` (the banners themselves tie them to `UISession`) |
| SR value objects + state (EbisuModel…CardSet, `:1644-1849`) | `types/cards.ts` |
| QeuboBookmark (`:1851-1871`) | `types/qeubo.ts` |
| ProfileState/SessionState/GlobalStore (`:1873-1924`) | `store/schema.ts` |
| EngineStatus/AnalysisMode (`:1926-1927`) | `types/engine.ts` |
| AuthState (`:1929-1951`), SystemMessage (`:1953-1960`) | `types/app.ts` |
| EngineState/EngineModelEntry/EngineInfo (`:1962-2092`) | `types/engine.ts` |
| ReviewStatus/ReviewSessionData/ReviewFeedback (`:2094-2122`) | `types/cards.ts` |
| Card-create wire shapes (`:2124-2143`) | `types/cards.ts` (wire aliases live with their domain, one module above the ACL) |
| Backend-sourced stats (`:2145-2177`) | `types/lineage.ts` |
| Card-tree domain (`:2179-2250`) | `types/lineage.ts` |
| SGF library domain (`:2252-2375`) | `types/library.ts` |

Judgment calls in banner regions the audit didn't enumerate, per its
"per-domain modules, not per-type files" principle (ADR-0007's
over-fragmentation warning as counter-pressure):

- **`NodeId` went with the game module, not ids.ts.** The audit's
  band-aware carve sends "game-coupled brands … and kin" to the game
  module; `NodeId` is the game-tree node identity (outside the
  game-tree class there is no node), and `PlyIndex` is defined as an
  index into `NodeId[]` — separating them would split one vocabulary.
- **`QueryId`, `ExtractorId`/`MetricId`, `RawKey`/`EnrichedKey`
  stayed in ids.ts.** IDENTIFIERS.md classes them as config-key /
  content-hash / correlation brands whose machinery is agnostic (the
  keyed-cache rule's band-call legs record the domain-bound *inputs*
  separately); their construction sites live in their own modules
  unchanged.
- **`AnalysisTab`, `ForestNavState`, `CardTreeNavState`, `NavNodeId`,
  `NavSelection` went to `store/schema.ts`,** not to chart/browse
  modules: each is a persisted slice whose default sits in
  `store/defaults.ts`, and the pre-split banners name them as
  `UISession` field shapes.
- **`AuthState` + `SystemMessage` share `types/app.ts`** rather than
  two ~20-line files (over-fragmentation pressure); both are
  application-shell value objects, [B1].
- **`store/schema.ts` lands at 851 lines** — over ADR-0007's soft
  threshold, sanctioned by the same type-catalogue exception this
  split executes: it is one domain (the persisted store schema), the
  bulk is doc-comment decision content (high density), and the spec
  for this arc named a *single* store-schema module colocated with
  `defaults.ts`. If `AppSettings` keeps growing, it is the next
  natural seam.

## Pure-code-motion discipline

Bodies were extracted **verbatim** (sed line-range extraction from
the pre-split file, no retyping); new prose is confined to per-file
ADR-0006 headers, import blocks, two one-line section-glue comments
(the game-coupled-brands banner in `game.ts`, the server-row-brands
comment in `ids.ts` — the originals had none), and the barrel's
rewritten header. Two deliberate token-level changes:

- `type Brand<K, T>` → `export type Brand<K, T>` (`types/ids.ts`) —
  the sibling modules declare brands and need the utility. The
  **barrel deliberately does not re-export `Brand`** (it was not part
  of the pre-split public surface), so the consumer-visible surface
  of `./types` is unchanged minus the two deleted dead types.
- The barrel header's readonly-policy block reads "live in this
  catalog (the modules above)" where it said "live in this file".

No type shape, name, modifier, or comment body changed. `vue-tsc -b`
green over the 132 unchanged barrel-importing files is the proof.

## Circular-import resolution

The hazard the audit names: the barrel is a **runtime module** —
three value exports flow through it (`BUNDLE_COMPRESSION_SCHEMES`
const in `store/schema.ts`; `QeuboError` and `CardTreeOverflowError`
classes in `types/qeubo.ts` / `types/lineage.ts`) — so a leaf module
importing the barrel would create a runtime cycle. Resolution, stated
as a rule in the barrel's header: **leaf modules never import from
the barrel; they import from sibling leaf modules directly.** All
cross-module imports in the new leaves are `import type` (erased at
runtime), so the three value-bearing modules have zero runtime
dependencies and the re-export graph is acyclic by construction. The
pre-existing type-only back-edges (`use-pv-animation.ts` and others
importing types from `./types` while the barrel re-exports their
declarations) are unchanged from the pre-split shape and erase the
same way.

## Dead-type verification and deletion

`CardSetKey` and `ReviewSessionId` (IDENTIFIERS.md `[dead]`-tagged,
erosion (d)) were re-verified at HEAD before deletion:

```
rg -n "CardSetKey|ReviewSessionId" frontend/src frontend/tests
→ only the two declarations at src/types.ts:1586-1587
```

Zero references → both deleted rather than moved, per the arc's
sanction. IDENTIFIERS.md's dead-types section and erosion (d) are
retired with a dated note.

## Documentation co-changes

- **IDENTIFIERS.md** — every `src/types.ts:NNN` citation re-pointed
  to its new module:line (Brand, NavNodeId, StorePath encodings; the
  BoardId / NodeId / AnalysisPanelId / ColorMoveIndex / PlyIndex /
  StorePath rows; the ProfileId/SessionId prose); the header's stale
  "2233-line src/types.ts" self-description fixed; the dead-types
  rows and erosion (d) retired. Erosions (a)–(c) are untouched — the
  split does not dissolve them.
- **FILES.md** — one row per new module with per-module band tags;
  the `types.ts` compromise tag (`[B2]` with named B3 leakage) is
  dissolved into the barrel row, which tags `[B3]` for the highest
  band it re-exports and says it is a barrel.
- **ADR-0003** — a one-line dated note appended at the inventory
  exclusion's 2026-06-10 note (whose `[B2]`-with-leakage citation the
  split makes stale), per the amendment convention. The split is the
  exclusion's retirement on Revisit-when #1's own terms.
- Doc-graph regenerated (this worklog is a new node).

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — green, first pass.
- `npx eslint .` — exit 0.
- `npm run test:run` — 878 passed | 4 skipped (882); **zero test-file
  modifications** (no test imported a moved type by deep path).
- `git status` — the only modified source file is `src/types.ts`
  itself; the import-site diff across all consumers is exactly zero.

## What's deferred

- Migrating consumers off the barrel onto the per-domain modules is
  optional follow-on churn, explicitly out of this arc
  (not-filed: the audit scopes the split to barrel + stable import
  sites; consumer migration has no driver yet).
- The `ReviewCard.sgf` rename trigger noted on the `types/cards.ts`
  band row is the already-staged `reviewcard-canonical-content-rename`
  item, not new work.

License: Public Domain (The Unlicense).
