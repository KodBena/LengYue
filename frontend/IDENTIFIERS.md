# Frontend identifier map

A namespace repository for the SPA: every *identifier type* in the
frontend, with its primitive, encoding, origin class, construction
site, lifetime, cardinality, and soundness notes. Use this to answer
"what identifiers exist, how is each constructed, what is its lifetime
and representation cost" without trawling the 2233-line `src/types.ts`,
which mixes identifier types with value objects, state containers, and
the `GlobalStore` schema.

This is the identifier-subset companion to `frontend/FILES.md` (the
per-file navigation map). Where FILES.md answers "where does this
concern live," this map answers "what is this id, and where does it
come from."

**This is a lookup reference, not an end-to-end orientation
document.** Partial consultation is the intended consumption mode —
read the rows you need. The read-end-to-end discipline that governs
`frontend/CLAUDE.md`, the ADRs, and the handoff (ADR-0002 applied to
documentation) **does not apply to this file**, exactly as it does
not apply to FILES.md.

**Companion docs.**

- `frontend/FILES.md` — the per-file navigation map this mirrors.
- `frontend/CLAUDE.md` — authoring discipline; the "Type-driven
  design" section is the normative source for branded-type
  construction (construction goes through the ACL or a dedicated
  factory; raw `number`/`string` does not flow through the domain;
  an `as` cast needs a justifying comment or it doesn't ship).
- `src/types.ts` — the declaration site for every type below except
  `src/types/backend.ts` (the OpenAPI-generated wire schemas, which
  are **excluded** from this catalog — they are not domain
  identifiers, they are the wire boundary the ACL re-brands across).
- `docs/adr/0003-frontend-portability-and-domain-boundaries.md` —
  the band definitions (`[B1]`/`[B2]`/`[B3]`) referenced per-id below.

## Scope

This catalog covers identifier types declared in `src/types.ts`. It
does **not** cover:

- Wire schemas in `src/types/backend.ts` (OpenAPI-generated; the
  snake_case shapes the ACL consumes, not domain identifiers).
- Unbranded id-shaped fields on the proxy wire surface — see the
  "Unbranded id-shaped fields" note below for the two that exist
  (`terminateId`, `clusterId` in `src/engine/katago/types.ts`).

## The three encodings

"Identifier" spans three distinct mechanisms in this codebase. The
catalog records which each id uses, because the construction and
soundness story differs per mechanism:

- **`Brand<K, T>`** (`type Brand<K, T> = K & { readonly __brand: T }`,
  `src/types.ts:82`) — a Haskell-style phantom newtype: runtime-identity
  with the primitive `K`, typecheck-distinct via the phantom
  `__brand` field. The majority mechanism. Construction is an
  identity-function cast (`s as BoardId`) at a factory or the ACL.
- **Template-literal union** — `NavNodeId = `game:${number}` |
  `root:${number}`` (`src/types.ts:1502`). The discriminator is a
  *structural property of the value*, not a phantom tag, so the
  brand is self-describing and JSON-round-trips without an erase
  step. One inhabitant.
- **Bare alias** — `StorePath = string` (`src/types.ts:425`).
  Deliberately and documentedly unbranded: its header names the
  deferred v2 (`Path<GlobalStore>`) and the interim runtime guard
  (`src/lib/knobs.ts::validateRegistry`). One inhabitant; the
  non-brand is the documented decision, not an omission.

## Catalog

### Server-persisted UUIDs (`Brand<string, …>`)

These cross the wire to a backend UUID-typed column or persist to a
synced document, and are re-branded from a wire value at the ACL or
constructed client-side as an RFC4122 v4 UUID.

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `BoardId` | string | client UUID (RFC4122 v4) | factory `asBoardId` (`board-factory.ts:20`); created at `board-factory.ts:62` via `asBoardId(generateUUID())`; ACL re-brand from wire at `library-service.ts:95,109,135,141` and `analysis-persistence-service.ts:170` | persisted (crosses wire to `analysis_bundles.board_id`; survives in synced docs) | ~1–20 open boards | Sound at the factory/ACL. Redundant casts downstream: `App.vue:66`, `ReviewSessionPanel.vue:48`, `SidebarWidget.vue:32` (the source `BoardState.id` is already `BoardId`, `src/types.ts:191`). `parsedBoard.id = … as any` at `useReviewSession.ts:274` and `useDirtyBoardGuard.ts:124` strip the brand to retain a tab id. See `[leaky]` erosion (b). |
| `AnalysisTabId` | string | client UUID | `AnalysisTabsEditor.vue:46` (`crypto.randomUUID() as AnalysisTabId`); single canonical construction site, self-documented at `:44` | persisted (user tab layout in `AppSettings.analysisTabs`) | ~1–20 user tabs | Sound; single justified site. |
| `BookmarkId` | string | client UUID | `useQeubo.ts:782` (`generateUUID() as BookmarkId`); single construction site | per-session (qEUBO/PBO bookmarks; pinned ones persist to `qeuboPinnedBookmarks`) | ~0–dozens | Sound; single site. |

### Server-persisted numeric primary keys (`Brand<number, …>`)

Backend row ids. The ACL is the only place the raw `number` becomes
the brand; everything downstream should treat them as opaque.

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `CardId` | number | server PK | ACL re-brand at `backend-service.ts:124,130,239,294,300,302,337,363` (`raw.id as CardId`, etc.) | persisted (DB row id; flows in synced docs and the card forest) | large (100s–1000s in a real deck) | Sound at the ACL. **Brand-stripped downstream** past the ACL via `as unknown as number`: `useMinting.ts:50` (justified, `:42`), `useCardTreeData.ts:282,452,482`, `useCardTreeHydration.ts:44`, `card-tree-echarts.ts:249`, `ForestDirectory.vue:237`. See `[leaky]` erosion (b). |
| `GameSourceId` | number | server PK | ACL re-brand at `backend-service.ts:240,301,338` and `library-service.ts:94,108,134,140,141` (`wire.id as GameSourceId`) | persisted (DB row id) | ~10s–100s | Sound at the ACL. Same `as unknown as number` stripping at `ForestDirectory.vue:236`. See `[leaky]` erosion (b). |

### Local ids (board-scoped, not server-issued)

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `NodeId` | string | local id — `'root-'+short` / `'node-'+short` (short = `Math.random().toString(36)`, **not** a UUID) | factory `asNodeId` (`board-factory.ts:21`); roots at `board-factory.ts:50` (`asNodeId('root-'+uuid())`); SGF-loaded nodes at `sgf-loader.ts:68` (then `as any` at `:76,77,89`); a fresh node in `logic.ts:106` (`'node-'+Math.random()… as NodeId`); ACL re-brand at `analysis-persistence-service.ts:157` | per-session board-scoped; **some persist** as ledger / trajectory composite keys (see "representation cost" below) | **Highest in the system**: one per game-tree node, ~340–1000+ per board × N boards | **`[leaky]`** — the soft underbelly. **32** `as NodeId` cast sites (`rg "as NodeId" src`). Two distinct causes, only one self-inflicted: (1) `Object.keys(board.nodes)` returns `string[]` though `board.nodes` is `Record<NodeId, GameNode>` (`src/types.ts:200`) — a TypeScript limitation, the cast is unavoidable and the `useActivePath.ts:19-23` comment names it the "Category C" boundary; (2) genuine self-inflicted widening, e.g. `useActivePath.ts:14-15` declares `path: string[]` / `currId: string` instead of `NodeId`, forcing the re-brand at `:24`; similar at `useReviewSession.ts:312,323`. Two generators mean **NodeId is not UUID-shaped**, so any consumer assuming a `'\|'`-free UUID form is on thin ice (`stability-trajectory-store.ts` embeds it in a `\|`-delimited key — safe only because the short form has no `\|`). See erosion (a). |

### Static config-key vocabularies (`Brand<string, …>`)

These are not generated per-entity; they are fixed string vocabularies
(persistence keys, action ids, registry keys) where the brand prevents
typos from silently mis-routing.

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `KeybindingActionId` | string | static literal (`<domain>.<verb>`) | factory `asActionId` (`keybindings.ts:88`) feeding the `ACTIONS` const (`keybindings.ts:98-110`, `as const satisfies Record<string, KeybindingActionId>`); `Object.keys` re-brand at `keybindings-capture.ts:175` | persisted (rebind overrides in settings) | ~12 declared (grows with actions) | Sound; dedicated factory + a satisfies-checked catalog. |
| `AnalysisPanelId` | string | static literal (frozen persistence keys) | factory `pid` (`panel-ids.ts:15`); the `PANEL_ID` SSOT | persisted (an `AnalysisTab.panelIds` references these; renaming orphans saved tabs — `src/types.ts:99-107`) | ~10 panels | Sound; dedicated factory, frozen-forever contract documented. |
| `KnobId` | string | static literal (`<domain>.<name>`, registry keys) | **no single factory**: string-template `` `qeubo.${name}` as KnobId `` at `useQeubo.ts:140`, `PaletteEditor.vue:99,127`; `key as KnobId` casts at `KnobRegistryEditor.vue:55`, `defaults.ts:471` | persisted (knob registry on the profile) | ~10s–100s | Mild `[leaky]` — branded at 4+ template sites rather than one constructor. Low cardinality and semantically-string, so the leak is cosmetic, not load-bearing. |

### Derived content hashes (`Brand<string, …>`)

Not per-entity identities — DJB2 hashes over a structured analysis descriptor,
branded distinct so the analysis-ledger's two provenance-stratified stores
cannot be cross-read: a `RawKey` against the enrichment store (or an
`EnrichedKey` against the raw store) is a **compile error** (ADR-0002's
strongest channel). See `services/analysis-ledger.ts` and the stratification
consult (`docs/notes/consult/opus-consult-2026-06-08-ledger-keying-typeful-defense.md`).

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `RawKey` | string | derived DJB2 hash of `{overrideSettings, model}` (palette-independent) | sole factory `deriveAnalysisKeys` (`analysis-config.ts`); re-branded at `analysis-bundle.ts` replay via the `r:` configHash-prefix split | per-session (ledger raw-store key); persisted inside bundles under an `r:`-prefixed configHash | ~1–few per session (one per model×overrides) | Sound; single factory. Bucket key, not a collision-free identity — DJB2 birthday bound, identical to the prior single composite hash. |
| `EnrichedKey` | string | derived DJB2 hash of `{analysis_config, overrideSettings, model}` | sole factory `deriveAnalysisKeys` (`analysis-config.ts`); **byte-equal to the legacy composite `configHash`**; re-branded at `analysis-bundle.ts` replay (`e:` prefix + legacy bare-hash branch) | per-session (ledger enrichment-store key); persisted inside bundles | ~1–dozens per session (one per palette×overrides×model) | Sound; single factory. Back-compat: equal to the pre-stratification hash so legacy persisted bundles' `config_hash` resolves as the enriched key. |

### Ephemeral indices (`Brand<number, …>`)

Derived, per-render index newtypes. Never persisted as ids in their
own right (though `PlyIndex` endpoints persist inside
`BoardState.analysisRange`). The pair exists to prevent off-by-colour
bugs — the two count moves in different spaces.

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `ColorMoveIndex` | number | derived index — 0-indexed within one colour's move sequence (native to KataProxy's triangular heatmap) | `useTriangularHeatmap.ts:58,59,70,71`; `useAnalysisProjection.ts:69` | ephemeral (per-render) | bounded ~340 | Sound by design. Conversion to `PlyIndex` through the single named boundary `colorMoveToPly` (`useTriangularHeatmap.ts:98-99`). Rationale at `src/types.ts:125-144`. |
| `PlyIndex` | number | derived index — 0-indexed position into a `variationPath: NodeId[]` (PlyIndex 0 = root) | output of `colorMoveToPly` (`useTriangularHeatmap.ts:98`); endpoints in `BoardState.analysisRange: [PlyIndex, PlyIndex]` (`src/types.ts:212`) | ephemeral; range endpoints persist | bounded ~340 | Sound by design; same pair as above. |

### Template-literal id

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `NavNodeId` | string | composed literal `game:${id}` / `root:${id}` | `useForestNavigation.ts:113,117` (`` `game:${gameSourceId}` as NavNodeId ``) | persisted (`UISession.forestNav.expanded`) | ~10s–100s | Sound; the `game:`/`root:` discriminator is structural (self-describing), so this is **not** `Brand<>`-based. Serializable to JSON without an erase step. |

### Bare alias (documented non-brand)

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `StorePath` | string | dot-separated `GlobalStore` path string | n/a (`= string`, no brand) | persisted (inside `KnobDecl`) | low | Deliberately unbranded (`src/types.ts:416-425`): the header defers the v2 `Path<GlobalStore>` discriminated union and names the interim runtime guard `validateRegistry`. A documented decision, not a missing brand. |

### Under-determined identity ids (`Brand<string, …>`)

| Name | Prim. | Origin | Construction | Lifetime | Cardinality | Status / notes |
|------|-------|--------|-------------|----------|-------------|----------------|
| `ProfileId` | string | server UUID (intended) / **NIL-UUID sentinel (actual)** | **only** the NIL-UUID sentinel: `store/index.ts:74,569`, `defaults.ts:597` (`NIL_UUID as ProfileId`). **No re-brand from a real server value exists anywhere in `src/`.** | persisted (the identity field on `ProfileState`/`SessionState`) | 1 | **`[under-determined]`** — see prose below. |
| `SessionId` | string | server UUID (intended) / **NIL-UUID sentinel (actual)** | **only** the sentinel: `store/index.ts:73,568` | persisted | 1 | Same as `ProfileId`. |

`ProfileId` and `SessionId` are branded fields (`ProfileState.id`,
`SessionState.id`/`SessionState.profileId`, `src/types.ts:1760,1770,1771`)
whose only *constructed* value across the whole SPA is the NIL-UUID
sentinel `'00000000-0000-0000-0000-000000000000'` (`defaults.ts:12`).
There is no `as ProfileId` / `as SessionId` re-brand from a wire value.
After login, the store's `profile`/`session` are hydrated by
`deepMerge` from a synced document (`store/index.ts:600-601`), and the
*authenticated identity* is tracked separately on `AuthState` as
`userId?: number` (`useAuth.ts:129`, set from `/auth/me`'s `me.id`) —
a **bare, unbranded `number`**, not a `ProfileId`. The branded ids
thus name an intended server-UUID namespace that the current data flow
never populates with a real value. This is recorded honestly rather
than smoothed over; firming it up (does the synced document ever carry
a real profile/session UUID? should `AuthState.userId` be branded?) is
maintainer-directed work.

### Dead types (`Brand<string, …>`)

| Name | Prim. | Construction | Status / notes |
|------|-------|--------------|----------------|
| `CardSetKey` | string | none | **`[dead]`** — declared at `src/types.ts:1493`, **zero references** elsewhere in `src/`. No comment indicating reserved intent. |
| `ReviewSessionId` | string | none | **`[dead]`** — declared at `src/types.ts:1494`, **zero references** elsewhere in `src/`. No comment indicating reserved intent. |

## Where representation cost is load-bearing

This section is *descriptive*, a bridge to a future memory-profiling
discipline — not a prescription to migrate anything. The project's
perf discipline is counts and retained size, not absolute heap
(ADR-0009); the rule below follows from it.

Of the string-branded ids, **`NodeId` is the only one where the
string-vs-number representation tradeoff plausibly bites.** It has the
highest cardinality (one per game-tree node, ~340–1000+ per board ×
N boards), and — unlike the others — it is allocated into composite
`Map`-key substrings on the **hot proxy-stream path**, per packet:

- `analysis-ledger.ts:23` keys an inner `Map<NodeId, …>` by the
  `NodeId` directly, and emits a changed-key signal `` `${hash}:${nodeId}` ``
  (`:52,182`) per record.
- `stability-trajectory-store.ts:46,52` keys trajectories by
  `` `${configHash}|${extractorId}|${nodeId}` ``, built per extractor
  per packet in `record` (`:108-114`).

Every other id is either already a `number` (`CardId`,
`GameSourceId`, `ColorMoveIndex`, `PlyIndex`), low-cardinality
(`BoardId`, `AnalysisTabId`, `AnalysisPanelId`, `KnobId`,
`KeybindingActionId`, identity ids), or semantically-string
(`NavNodeId`, whose `game:`/`root:` discriminator *is* the value).
For those the representation choice is not load-bearing.

**Caveat, and the reason this is descriptive only:** the retained
delta from migrating `NodeId` to a numeric handle is not known.
Map-key strings may already be interned, the per-packet allocations
may be short-lived (collected before they accumulate), and the
short-id form is human-readable in DevTools (a deliberate choice —
`board-factory.ts:25-28`). **Measure the retained-size delta on a
realistic workspace before treating this as actionable.** It is named
here so a future memory-profiling pass has a starting hypothesis, not
because a migration is warranted today.

## Unbranded id-shaped fields (out of scope, recorded for completeness)

Two id-shaped fields on the proxy wire surface are deliberately
unbranded — they are proxy wire vocabulary (`[B3]`), bounded by what
`src/engine/katago/types.ts` documents, not domain identifiers:

- `terminateId: string` (`src/engine/katago/types.ts:318`).
- `clusterId?: string | number` (`src/engine/katago/types.ts:333`).

These are not in the catalog because they never enter the domain as
branded handles; they are consumed and discarded at the proxy
boundary.

## Known erosions (documented, not yet fixed)

In the spirit of FILES.md's immature-files allowance, the soft spots
are surfaced here rather than hidden. Each carries a status tag.
**These are documented, not scheduled — fixing any of them is
separate, maintainer-directed work. Do not refactor code off the back
of this map.**

- **(a) `[leaky]` — `NodeId` cast proliferation.** 32 `as NodeId`
  sites. Two causes (see the `NodeId` row): the unavoidable
  `Object.keys(Record<NodeId, …>) → string[]` limitation, and genuine
  self-inflicted widening where a local is typed `string` instead of
  `NodeId` and re-branded later (`useActivePath.ts:14-15`,
  `useReviewSession.ts:312,323`). The self-inflicted subset is the
  fixable part; the `Object.keys` subset wants a small typed-keys
  helper if it is ever addressed. Compounding risk: the two-generator
  origin means `NodeId` is **not UUID-shaped**, so any code assuming a
  delimiter-free UUID form (e.g. the `|`-delimited trajectory key) is
  correct only by the short form's accident, not by contract.

- **(b) `[leaky]` — brand-stripping past the ACL.** The invariant is
  that brands erase *only* at the ACL (`backend-service.ts`,
  `library-service.ts`). It is violated downstream by 9
  `as unknown as number` sites in UI / echarts code (`useMinting.ts:50`,
  `useCardTreeData.ts:282,452,482`, `useCardTreeHydration.ts:44`,
  `card-tree-echarts.ts:249`, `ForestDirectory.vue:236,237`) that
  strip `CardId`/`GameSourceId` back to raw `number` for a wire-shaped
  payload or a thumbnail-cache key. Only `useMinting.ts:42` carries a
  justifying comment; the rest are bare. These belong behind a
  re-brand helper at the call boundary, not scattered double-casts.

- **(c) `[under-determined]` — `ProfileId` / `SessionId`.** Branded
  identity fields whose only constructed value is the NIL-UUID
  sentinel; the real identity is an unbranded `AuthState.userId: number`.
  See the "Under-determined identity ids" prose above.

- **(d) `[dead]` — `CardSetKey` / `ReviewSessionId`.** Declared,
  zero references, no reserved-intent comment. Candidates for removal
  unless a maintainer confirms a planned use.

## Cross-references

- `frontend/FILES.md` — the per-file map this mirrors.
- `frontend/CLAUDE.md`, "Type-driven design" — the normative
  construction discipline (factory or ACL; `as` needs justification).
- `docs/adr/0003-frontend-portability-and-domain-boundaries.md` —
  the band vocabulary; most ids here are `[B2]` (game-tree-coupled,
  e.g. `NodeId`, the index newtypes) or `[B3]` (Go/KataGo-bound),
  with the identity and config-key ids `[B1]`.
- **Cross-boundary sibling.** The proxy (`proxy/`, KataProxy)
  performs the analogous discipline on its own side: the four
  namespaces a proxy chain crosses — `ClientId → InternalId →
  CanonicalId → WireId` — are distinct branded types via
  `typing.NewType` (runtime-identity with `str`, typecheck-distinct),
  with the framework parameterised on the upstream/downstream
  namespace pair. See the umbrella `CLAUDE.md`'s proxy section and
  `proxy/docs/roadmap-identity-type-branding.md`. The SPA's
  `Brand<K, T>` is the TypeScript analogue of the proxy's `NewType`
  brands; this map is the frontend sibling of that namespace
  contract.

## Updating this map

Mirrors FILES.md's "Updating FILES.md when files change":

- **Add a branded id** → add a row to the right group (origin /
  lifetime class), with primitive, encoding, construction site,
  lifetime, cardinality, and a soundness note. Same PR.
- **A construction site moves** → update its `file:line` in the row.
- **Delete a type** → remove its row (and any `[dead]` entry).
- **Fix an erosion** → drop its status tag (`[leaky]` /
  `[under-determined]`) and update the "Known erosions" section.
- **Promote an under-determined id** (e.g. a real `ProfileId`
  re-brand lands) → move it out of the under-determined group and
  retire erosion (c).

Drift between a row's construction-site citation and the actual code
is the silent-failure mode this map exists to surface (ADR-0002
applied to documentation). The immature-files allowance applies: an
id whose role is still settling should be represented honestly with a
status tag rather than wedged into a clean-sounding line.
