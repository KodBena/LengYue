# Roadmap: breaking the frontend store↔services import-cycle cluster

- **Status:** Planned. Drafted 2026-06-22. Roadmaps the open work-status
  item `break-frontend-import-cycles` ("Break the frontend store↔services
  import cycle (18-file SCC)", state `open`, in the `todo` Postgres store).
  No code is changed by this document; it sequences the work and designs
  the seams.
- **Scope:** `frontend/src` only. Eliminate, or substantially shrink, the
  single 18-file strongly-connected component (SCC) in the runtime import
  graph that `tools/cycle-check/check.mjs` measures. The cycle is the
  structural precondition of the vite-8.0.12 vitest-teardown deadlock
  (PR #444): `vi.mock` of a module inside an import cycle deadlocks vite's
  module runner, which is why the project is pinned to vite 8.0.8 and
  cannot take the security bump to 8.0.16 (the bump sits abandoned on the
  Dependabot branch behind `aa926fba`). PR #447 (`a32a0aff`) added the
  no-new-cycles ratchet with baseline `{ clusters: 1, cyclicNodes: 18 }`;
  every tranche here ratchets that baseline down.
- **Companion artifacts:** the rendered subgraph at
  `~/plots/frontend-import-cycles.svg` (the SCC drawn from the same value-edge
  graph the ratchet walks); `tools/cycle-check/check.mjs` (the metric);
  `frontend/CLAUDE.md` (the layering and the resource-ownership discipline
  the pattern-3 edges implement); `frontend/docs/notes/board-scope.md` (the
  teardown guarantee the pattern-3 inversion must preserve).

This note follows the house authoring posture (`frontend/CLAUDE.md`):
contracts and types before implementation, the smallest inversion that
breaks the edge over a gratuitous rewrite (ADR-0004 minimal-touch), and
honest tradeoff disclosure over a confident "fully solved" framing.

---

## 1. Diagnosis (grounded in the source)

### 1.1 The shape

`tools/cycle-check/check.mjs` runs Tarjan's SCC over the **value-edge**
graph of `frontend/src` — `import type` / `export type` are
compile-time-erased and excluded, because the vite deadlock is a
runtime-module-graph phenomenon. It finds **one** cyclic cluster: a single
SCC of **18 files**. `madge` counts 15 elementary cycles *within* that one
SCC; the ratchet's two stable numbers are the cluster count (`clusters: 1`)
and the participating-file count (`cyclicNodes: 18`). `--check` fails when
**either** exceeds its baseline, and both ratchet down as cycles break — so
a tranche either drops the whole cluster (`clusters → 0`) or shrinks
`cyclicNodes` by the number of files it lifts out of the SCC.

The 18 members (all under `src/`):

```
composables/analysis/wait-for-analysis
composables/board/use-move-suggestions
composables/cards/thumbnail-render-resources
composables/review/blind-mode-prefs
composables/review/useReviewSession
composables/useQeubo
services/analysis-bundle
services/analysis-persistence-service
services/analysis-service
services/api-client
services/backend-service
services/engine-connection
services/qeubo-service
state/analysis-config
state/analysis-ledger
state/stability-trajectory-store
store/index            ← the hub
store/profile-owner
```

### 1.2 The hub and the god-object root cause

`store/index.ts` is the hub: roughly fourteen value edges point **into**
it, six point **out**. That bidirectionality is the SCC: everything depends
on the store, and the store depends on everything. The root cause is that
`store/index.ts` is a **god-object** in the precise ADR-0012 P3 sense — name
its single concern in one clause and you cannot, because it is *two*
collaborators wearing one module:

1. **The universal reactive state container** — the `GlobalStore` singleton
   plus its named mutators (`mutateBoard`, `mutateReviewSession`,
   `pushSystemMessage`, …). This is what the fourteen inbound edges want.
2. **The cleanup orchestrator** — `closeBoard` / `resetWorkspace`, which
   reach *down* into composables and services to release a closing board's
   or a departing identity's external resources. This is what the six
   outbound edges are.

Because the same module is both, every state reader imports the cleanup
orchestrator transitively, and the cleanup orchestrator imports every
resource owner. P3 ("orthogonal concerns are split into one-owner
collaborators") and P2 ("a boundary is an explicit port with its dependency
injected, not an import-coupling") are the two principles the fix applies.

### 1.3 The three edge patterns

The induced value-edges sort into three patterns, cheapest-to-fix first.

**Pattern 1 — services reach UP to the store (clean layering violation).**
The Services layer (`frontend/CLAUDE.md`: "Components → Composables →
Services → Ports") should not import the Store. Five service modules do, and
in every verified case the reason is the same one symbol:

- `services/api-client.ts:13` — `import { pushSystemMessage } from '../store'`,
  called at three sites (the network-failure branch, the session-refreshed
  info toast, and the non-2xx error branch — lines 182, 204, 238) to surface
  transport failures into `store.engine.messages`.
- `services/analysis-service.ts:36` —
  `import { store, pushSystemMessage, mutateBoard, setSelectedModel }`. The
  `pushSystemMessage` legs are the same message-sink need; `store` reads
  (`store.boards.find`, `store.profile.settings`, `store.engine.*`) and
  `mutateBoard` / `setSelectedModel` are genuine state writes (see §1.4 for
  why this one is not purely cosmetic).
- `services/engine-connection.ts:75` — `import { store, setSelectedModel }`;
  this module *is* the owner of the `store.engine` subtree (it writes
  `store.engine.status/info/metrics` directly), so its edge into the store is
  structural, not a layering accident (see Open Question Q3).
- `services/analysis-bundle.ts:25` — `import { store }`, used only by
  `projectLedgerToBundle` to resolve `store.boards.find(b => b.id ===
  boardId)` → `board.nodes`.
- `services/analysis-persistence-service.ts:200` — `import { store }`, used
  only by `readCompressionScheme()` to read
  `store.profile.settings.engine.katago.bundleCompressionScheme`.

`api-client` is the cheapest and most valuable single edge: it is the
back-edge the ratchet's own header names as "the api-client→store
`pushSystemMessage` back-edge closes it," and `backend-service` /
`qeubo-service` are in the SCC **only** because they import `api-client`
(`./api-client`, value: `api, ApiError`) and `api-client` closes back to the
store. Cut `api-client → store` and those two pure REST ACLs may fall out of
the cycle for free (verify against the recomputed graph — see Tranche A).

**Pattern 2 — State modules → store.** The reactive-state modules read the
store for the live settings they compile or the boards they purge:

- `state/analysis-config.ts:46` — `import { store }` (reads
  `store.profile.settings.engine.katago.analysis_env`,
  `store.engine.selectedModel`); plus `:45`
  `import { useQeubo } from '../composables/useQeubo'` with a *module-level*
  `const qeubo = useQeubo()` — a second runtime edge worth its own scrutiny
  (Open Question Q4).
- `state/analysis-ledger.ts:43` — `import { store, pushSystemMessage }`.
  `store` for `purgeBoard`'s `store.boards.find`; `pushSystemMessage` for the
  §5.5 nested-null escalation (the `stateNestedGuard` user-visible warning).
- `state/stability-trajectory-store.ts` — `import { store }`, used by its
  `purgeBoard` to walk `store.boards`.
- `store/profile-owner.ts:72` — `import { store } from './index'`. This is a
  *store-internal sibling*: it owns profile mutation (`mutateProfile`,
  `writeStoreKnobValue`) and legitimately depends on the store singleton.
  Its edge is not a layering violation; whether it should merge into the
  state-container module or stay a peer is a P3 sub-question (Q3).

**Pattern 3 — the store reaches DOWN into composables/services for cleanup
(LOAD-BEARING — not cruft).** These are the six outbound edges of
`store/index.ts`, and they implement the documented
resource-ownership-at-mutation-sites discipline (`frontend/CLAUDE.md`
§"Resource ownership at mutation sites"). They are the back-edges that make
the *downward* targets cyclic:

| `store/index.ts` import (value) | Used by | Released resource |
|---|---|---|
| `analysisService` (`stopBoardAnalysis`, `stopAllBoardAnalyses`) | `closeBoard`, `resetWorkspace` | in-flight analysis subscriptions at the proxy |
| `ledger` (`purgeBoard`, `purgeAll`) | both | cached packets + per-node version refs |
| `stabilityTrajectoryStore` (`purgeBoard`, `purgeAll`) | both | per-(hash, extractor, nodeId) trajectories |
| `analysisPersistenceService` (`discard`, `forgetAll`) | both | server bundle row + board-keyed Maps |
| `abortBoardReview`, `abortAllReviews` (`useReviewSession`) | both | pending review-analysis `AbortController` |
| `purgeBoardThumbnails`, `purgeAllThumbnails` (`thumbnail-render-resources`) | both | board-snapshot cache keyed on NodeId |

Two of those six targets — `analysisService`, `ledger`,
`stabilityTrajectoryStore`, `analysisPersistenceService` — are *already* SCC
members for **pattern-1/2** reasons (they reach up independently), so the
store→them edge does not add a member; it just thickens the existing tangle.
But two targets are SCC members **specifically because** the store reaches
into them and they reach back:

- `composables/review/useReviewSession.ts` is in the SCC because `closeBoard`
  imports `abortBoardReview` from it **and** it imports `store` (+ much more:
  `backendService`, `analysisService`, `ledger`, `activeAnalysisKeys`,
  `waitForAnalysis`, `blindModePrefs`, `gtpToBoard`). It is the
  orchestrator composable — the densest node after the hub.
- `composables/cards/thumbnail-render-resources.ts` is in the SCC because
  `closeBoard` imports `purgeBoardThumbnails` from it **and** it imports
  `store` (its `purgeBoardThumbnails` walks `store.boards` to find the
  closing board's nodes).

Note the contrast that disciplines the pattern-3 fix:
`store/index.ts` also imports `clearCardThumbnailCache` (from
`composables/cards/useCardThumbnail`) and `removeBoardCardTree` /
`clearAllBoardCardTrees` (from `composables/cards/board-card-trees`) — but
**those two modules do not import back into the cycle**, so they are *not*
SCC members. The store calling down into a cleanup target is only cyclic
when the target reaches back up. That is the seam the pattern-3 inversion
exploits: break the *target → store* direction, or break the *store →
target* direction, and the cycle opens — you do not have to delete the
cleanup.

### 1.4 What is and isn't cosmetic

A useful sharpening: not every up-edge is a pure layering accident.

- **Pure message-sink edges** (`pushSystemMessage` in `api-client`,
  `analysis-ledger`, and the `pushSystemMessage` legs of `analysis-service`)
  are cosmetic in the architectural sense — the importer needs a *sink for a
  user-visible message*, not the store. These invert trivially (Tranche A).
- **Pure read-for-derivation edges** (`analysis-bundle` reading
  `store.boards`, `analysis-persistence-service` reading
  `store.profile.settings`, `analysis-config` reading settings) want a
  *value*, not the container. These invert with a parameter or an injected
  accessor (Tranche B).
- **Genuine state-write edges** (`analysis-service`'s `mutateBoard` /
  `setSelectedModel`; `engine-connection`'s `store.engine.*` writes) are real
  Service→Store coupling. The honest call here is that some of these may not
  be worth inverting — a service that legitimately owns a piece of store
  state is the *intended* shape of an "owner module" (`engine-connection`'s
  own header says so), and forcing dependency inversion there can be
  P3-theatre that buys a ratchet tick at the cost of legibility (Open
  Question Q3). The roadmap flags these rather than assuming them away.

---

## 2. The seam designs (contracts before implementation)

Three small ports carry the whole break. Each is the minimal inversion that
opens its edges; none is a rewrite.

### 2.1 The message sink (`SystemMessageSink`) — inverts every `pushSystemMessage` up-edge

The store owns `store.engine.messages` and exports `pushSystemMessage`.
Every up-edge that exists only to push a message can instead depend on a
**sink interface** the store *implements and registers*, never imported by
the consumer:

```ts
// src/services/system-message-sink.ts  (new — Services-layer, B1 agnostic)
export type SystemMessageType = 'error' | 'warning' | 'info';
export interface SystemMessageSink {
  push(type: SystemMessageType, text: string): void;
}

// A module-scope registered sink with a fail-loud default (ADR-0002):
// before the store registers, a push throws rather than silently dropping
// a user-visible message — surfacing a wiring bug at first use, not in prod.
let sink: SystemMessageSink | null = null;
export function registerSystemMessageSink(s: SystemMessageSink): void { sink = s; }
export function pushSystemMessage(type: SystemMessageType, text: string): void {
  if (!sink) throw new Error('system-message sink not registered (app bootstrap order bug)');
  sink.push(type, text);
}
```

`store/index.ts` registers itself once at module-init (or in
`useAppBootstrap`): `registerSystemMessageSink({ push: pushStoreMessage })`,
where `pushStoreMessage` is today's `pushSystemMessage` body
(unshift-into-`store.engine.messages`, cap 50). Consumers
(`api-client`, `analysis-ledger`, `analysis-service`'s message legs) import
`pushSystemMessage` from `system-message-sink` instead of from `../store`.
The store still keeps the message vocabulary and the cap; only the
**import direction** flips — `SystemMessageType` mirrors `SystemMessage['type']`
(keep them in sync; Open Question Q5 names the SSOT choice).

This is P2 to the letter: a port with the dependency injected, the boundary
fails loud on a contract it cannot honor (no sink registered), and the
consumer no longer imports up.

### 2.2 The board-node reader (`boardNodes` accessor) — inverts the read-for-derivation up-edges

Three modules import `store` only to answer "what are this board's nodes?"
(`analysis-bundle`, `analysis-ledger.purgeBoard`,
`stability-trajectory-store.purgeBoard`) or "what is this live setting?"
(`analysis-config`, `analysis-persistence-service`). Two sub-shapes:

- **Purge-by-board** (`ledger.purgeBoard`, `stabilityTrajectoryStore.purgeBoard`,
  `analysis-bundle.projectLedgerToBundle`) currently take a `BoardId` and
  resolve `store.boards.find(...).nodes` internally. Change the signature to
  take the node list the caller already holds:

  ```ts
  // before:  ledger.purgeBoard(boardId: BoardId): void
  // after:   ledger.purgeNodes(nodeIds: readonly NodeId[]): void
  ```

  `closeBoard` already has the board in hand (it looks it up for the splice),
  so it passes `Object.keys(board.nodes) as NodeId[]`. The store→ledger edge
  is unchanged in *direction* (still pattern-3), but the ledger no longer
  reaches *up* — the pattern-2 ledger→store edge is gone, and so is the
  identical edge from `stability-trajectory-store` and `analysis-bundle`.
  This is the cleanest inversion in the set: it deletes three up-edges by
  moving a `store.boards.find` from three callees into one caller that
  already did the lookup (P1 derive-don't-duplicate — the board→nodes
  resolution gets one home, the caller).

- **Settings reads** (`analysis-config` reading `analysis_env` /
  `selectedModel`; `analysis-persistence-service.readCompressionScheme`
  reading the compression knob) are reactive reads of live settings. The
  inversion is an injected accessor (`() => T`) or a small read-port the
  store registers — the same registration shape as §2.1. These are *reactive*
  reads (`analysis-config`'s `activeAnalysisKeys` is a `computed`), so the
  accessor must preserve reactivity: a `() => store.profile.settings...`
  thunk read *inside* the `computed` keeps the dependency tracked. This is
  the fiddliest pattern-2 sub-case and is scheduled last among the
  state-module work (Tranche C), with reactivity-preservation called out as a
  must-pass (§3).

### 2.3 The teardown registry (`onBoardClose` / `onWorkspaceReset`) — inverts the LOAD-BEARING pattern-3 edges

This is the higher-risk seam, and it must preserve the
`closeBoard`/`resetWorkspace` resource-ownership guarantees exactly. The
inversion turns the store's *imperative reach-down* into a *registration the
store calls back*, so resource owners register their own teardown rather than
the store importing them:

```ts
// src/store/teardown-registry.ts  (new — store-internal, B1 agnostic)
import type { BoardId, NodeId } from '../types';

// A board-close handler is given the closing board's identity AND its node
// list (so node-keyed purges need no store lookup — see §2.2). Handlers run
// in REGISTRATION ORDER; the one load-bearing ordering constraint
// (engine-stop BEFORE ledger-purge, so an in-flight packet can't re-populate
// a just-cleared ledger) is preserved by registering analysis-service's stop
// handler before the ledger's purge handler.
export interface BoardCloseHandler {
  readonly label: string;                                   // stable slug (ADR: handles travel with a slug)
  run(boardId: BoardId, nodeIds: readonly NodeId[]): void;  // sync; async work is fire-and-forget inside
}
export interface WorkspaceResetHandler {
  readonly label: string;
  run(): void;
}

const boardCloseHandlers: BoardCloseHandler[] = [];
const workspaceResetHandlers: WorkspaceResetHandler[] = [];

export function registerBoardCloseHandler(h: BoardCloseHandler): void { boardCloseHandlers.push(h); }
export function registerWorkspaceResetHandler(h: WorkspaceResetHandler): void { workspaceResetHandlers.push(h); }

// closeBoard calls runBoardCloseHandlers(boardId, nodeIds) where it today
// calls each import inline; resetWorkspace calls runWorkspaceResetHandlers().
export function runBoardCloseHandlers(boardId: BoardId, nodeIds: readonly NodeId[]): void {
  for (const h of boardCloseHandlers) h.run(boardId, nodeIds);
}
export function runWorkspaceResetHandlers(): void {
  for (const h of workspaceResetHandlers) h.run();
}
```

Each resource owner registers its handler from *its own* module
(`analysis-service` registers `stopBoardAnalysis`; `useReviewSession`
registers `abortBoardReview`; `thumbnail-render-resources` registers
`purgeBoardThumbnails`; etc.). The store no longer imports any of them —
`store/index.ts` imports only `teardown-registry`, and the resource owners
import `teardown-registry` to register. The cycle's two outbound-only members
(`useReviewSession`, `thumbnail-render-resources`) and the thickening edges
to the four pattern-1/2 services all open.

**Why this preserves the guarantee.** The board-scope note's headline
invariant is "every per-board surface is keyed on `BoardId`, and torn down
when its board exits." Today the store *enumerates* the teardowns inline; the
registry moves that enumeration into a registration list. The guarantee was
**never** type-enforced — `frontend/docs/notes/board-scope.md` is explicit:
"TypeScript cannot enumerate every per-board surface … the registry's
coverage is a *convention*, not a proof," and the **board-completeness test**
(`tests/integration/store-mutators.test.ts`) is what actually holds it. So
the registry does not *weaken* the guarantee — it relocates the same
convention from inline imports to inline registrations, and the **same test**
keeps holding it, provided the test is updated to assert the registry's
handler set drains correctly and per-board (the way it today tripwires
`BOARD_SCOPED_STORE_CELLS` / `IDENTITY_SCOPED_CACHES`). The ordering
constraint (engine-stop before ledger-purge) becomes *registration order*,
which must be documented at the registration sites exactly as the inline
ordering is documented today — the board-scope note already warns that
folding ordering "into array position" is a legibility regression "for no
safety gain," so the registry's ordering MUST stay commented, not implicit.

**The Class-B subtlety the inversion must respect.** The board-scope note
splits teardowns into Class A (board-*keyed* store cells, order-independent,
already collapsed into `BOARD_SCOPED_STORE_CELLS`) and Class B
(board-*derived*, node-keyed purges that walk `board.nodes` and **must run
before the splice**). The §2.2 signature change (pass `nodeIds`, don't look
them up) is exactly what lets the Class-B purges run from a registry without
needing the board still in `store.boards` — the caller snapshots
`board.nodes` *before* invoking handlers, so the "must run before the splice"
constraint is satisfied structurally by *when `closeBoard` calls
`runBoardCloseHandlers`* (before the splice, with the snapshot), not by each
handler racing the splice. This is a genuine improvement, not just a
relocation. The parked work-status item `closeboard-class-b-teardown-shape`
(owner-located teardown, a named candidate) is the same design space; this
roadmap's registry is one concrete answer to it, and Q2 asks the maintainer
whether to fold the two efforts together.

---

## 3. Tranches

Ordered cheapest/safest → riskiest. Each names the edges it removes, the
seam, the files touched, the **post-tranche ratchet baseline**, effort/risk,
and the tests that must stay green. The ratchet's `--check` fails on either
number rising, and the convention (`tools/cycle-check/check.mjs`) is to lower
`NO_NEW_CYCLES_RATCHET` to the recomputed `{ clusters, cyclicNodes }` and
bump `baselineDate` **in the same PR** that breaks the edges. Run
`node tools/cycle-check/check.mjs --json` after each tranche to read the
exact recomputed numbers — the per-tranche targets below are the *intended*
outcome and the ratchet's measurement is authoritative if they differ
(measure-first, ADR-0011 Rule 3).

> Cross-tranche caveat on `cyclicNodes` deltas: a module leaves the SCC only
> when it has **no** remaining edge in *and* out of the cluster. Because
> several modules carry more than one up-edge (e.g. `analysis-service` has
> message-sink legs *and* genuine state writes), a tranche that removes one of
> a module's edges may shrink the tangle without dropping that module's count.
> The honest per-tranche `cyclicNodes` target is therefore a *lower bound on
> the work, not a guaranteed drop* until the recompute confirms it. The
> tranches are sequenced so the modules that fall out cleanly fall out first.

### Tranche A — the message-sink inversion (the vite-bug back-edge)

- **Edges removed:** `api-client → store`, the `pushSystemMessage` legs of
  `analysis-service → store` and `analysis-ledger → store`. This is the
  ratchet header's named back-edge ("api-client→store `pushSystemMessage`
  closes it").
- **Seam:** §2.1 `SystemMessageSink` + `registerSystemMessageSink`.
- **Files touched:** new `services/system-message-sink.ts`; `store/index.ts`
  (register the sink, keep the message store + cap); `api-client.ts`,
  `analysis-ledger.ts`, `analysis-service.ts` (re-point the
  `pushSystemMessage` import). `FILES.md` gets one new B1 row.
- **Expected ratchet outcome:** `api-client` loses its *only* up-edge → it
  falls out of the SCC. `backend-service` and `qeubo-service` are in the SCC
  **only** via `api-client`, so they should fall out too (verify on the
  recompute — this is the highest-leverage assumption in the plan). That is
  potentially **three to four** files out (`api-client`, `backend-service`,
  `qeubo-service`, and possibly `analysis-bundle`/`analysis-persistence`
  depending on Tranche B ordering). Conservative post-tranche target:
  `{ clusters: 1, cyclicNodes: 15 }` (api-client + the two pure ACLs). If
  `analysis-ledger`/`analysis-service` still hold other up-edges (they do —
  `store` reads and state writes), they stay in; the cluster persists.
- **Effort:** Low. **Risk:** Low — a pure import-direction flip behind a
  registered port; the only behavioural surface is the fail-loud default,
  which must be registered before first use (bootstrap-order; covered by an
  integration smoke that a pre-registration push throws).
- **Tests that must stay green:** the api-client error-surfacing tests
  (network-failure and non-2xx push a SystemMessage), the
  analysis-ledger §5.5 nested-null escalation test, the existing service
  integration tests. Add: a test that `pushSystemMessage` throws before
  registration and routes to the store after.

### Tranche B — the read-for-derivation inversion (board-node + bundle)

- **Edges removed:** `analysis-bundle → store`, `analysis-ledger → store`
  (the residual `store.boards` read in `purgeBoard`),
  `stability-trajectory-store → store`.
- **Seam:** §2.2 — change `purgeBoard(boardId)` /
  `projectLedgerToBundle(boardId)` to take the node list (or a `(BoardId,
  nodeIds)` pair); `closeBoard` passes the snapshot it already computes.
- **Files touched:** `analysis-ledger.ts`, `stability-trajectory-store.ts`,
  `analysis-bundle.ts` (signature + drop the `store` import);
  `store/index.ts` (pass `nodeIds` — but note this couples Tranche B to the
  registry's `nodeIds` argument, so B is most naturally landed **with or
  after** Tranche D's registry, OR landed first with a temporary inline
  `closeBoard` that snapshots nodes before calling the new signatures). The
  call-order/snapshot-before-splice contract is documented at the call site.
- **Expected ratchet outcome:** `analysis-bundle` loses its only up-edge and
  should fall out (it has no other cycle import — `asBoardId` is from
  `store/board-factory`, a different module; confirm `board-factory` isn't
  itself pulled in). `analysis-ledger` and `stability-trajectory-store` lose
  their `store` up-edge but are still reached *down* by the store's pattern-3
  purge call — so they stay in until Tranche D inverts that. Post-tranche
  target (if landed after A): `{ clusters: 1, cyclicNodes: 13–14 }`.
- **Effort:** Low–Medium. **Risk:** Low — the node-list snapshot is what
  `purgeBoard` already computes internally; moving it up one frame is
  behaviour-preserving as long as the snapshot is taken before the splice
  (which `closeBoard` already does — it looks the board up for the splice
  anyway).
- **Tests that must stay green:** the board-completeness test
  (`tests/integration/store-mutators.test.ts`) — it asserts `purgeBoard`
  drains the closing board's nodes from both ledger stores; the signature
  change must keep that assertion green. The analysis-persistence
  save/restore round-trip (`projectLedgerToBundle` → wire → replay).

### Tranche C — the settings-read inversion (analysis-config / persistence)

- **Edges removed:** `analysis-config → store`,
  `analysis-persistence-service → store`, and (pending Q4) the
  `analysis-config → useQeubo` module-level edge.
- **Seam:** §2.2 settings sub-case — an injected reactive accessor or a
  registered read-port for the live settings (`analysis_env`,
  `selectedModel`, `bundleCompressionScheme`). For `analysis-config` the
  accessor MUST be read *inside* the `activeAnalysisKeys` computed so Vue's
  dependency tracking still fires on a palette/override/model change.
- **Files touched:** `analysis-config.ts`, `analysis-persistence-service.ts`,
  the store registration site (`useAppBootstrap` or store-init); possibly
  `useQeubo` if Q4 resolves to inverting the `analysis-config → useQeubo`
  edge.
- **Expected ratchet outcome:** `analysis-config` and the persistence service
  lose their `store` up-edges. `analysis-config` may then fall out if its
  `useQeubo` edge is also handled; otherwise it stays via that edge.
  Post-tranche target: `{ clusters: 1, cyclicNodes: 11–13 }`.
- **Effort:** Medium — the reactivity-preservation requirement makes this the
  fiddliest of the read inversions; an accessor read outside a tracking scope
  silently breaks `activeAnalysisKeys` re-derivation (the exact under-keyed
  failure class `frontend/CLAUDE.md`'s keyed-cache discipline guards). **Risk:**
  Medium for that reason — the failure is silent (analyses stop re-issuing on
  a setting change), so it needs an explicit integration assertion.
- **Tests that must stay green:** an `activeAnalysisKeys` re-derivation test
  (palette swap re-mints `enrichedKey`, leaves `rawKey` stable — the
  stratification invariant); the auto-save dirty-bump path; the
  compression-scheme dispatch in `save()`.

### Tranche D — the teardown-registry inversion (LOAD-BEARING; deferrable)

- **Edges removed:** the six `store/index.ts` pattern-3 outbound edges —
  `store → analysis-service`, `store → analysis-ledger`,
  `store → stability-trajectory-store`,
  `store → analysis-persistence-service`, `store → useReviewSession`
  (`abortBoardReview`/`abortAllReviews`), `store → thumbnail-render-resources`
  (`purgeBoardThumbnails`/`purgeAllThumbnails`). Plus the store's two
  non-SCC cleanup edges (`useCardThumbnail`, `board-card-trees`) move to the
  registry too, for uniformity (they don't affect the count, but leaving
  them inline while the rest move would be a split-brain teardown).
- **Seam:** §2.3 `teardown-registry` with `registerBoardCloseHandler` /
  `registerWorkspaceResetHandler`; each owner registers its own handler.
- **Files touched:** new `store/teardown-registry.ts`; `store/index.ts`
  (`closeBoard`/`resetWorkspace` call `runBoardCloseHandlers` /
  `runWorkspaceResetHandlers` instead of the inline imports;
  `BOARD_SCOPED_STORE_CELLS` and `IDENTITY_SCOPED_CACHES` either become
  registered handlers or stay store-internal and run alongside); each resource
  owner module gains a registration call (`analysis-service`,
  `analysis-ledger`, `stability-trajectory-store`,
  `analysis-persistence-service`, `useReviewSession`,
  `thumbnail-render-resources`).
- **Expected ratchet outcome:** this is the tranche that **drops the cluster**.
  With pattern-1/2 already inverted (A–C), the only remaining cycle edges are
  these pattern-3 back-edges; inverting them should take `clusters → 0`,
  `cyclicNodes → 0`. The two outbound-only members (`useReviewSession`,
  `thumbnail-render-resources`) fall out here. Post-tranche target:
  `{ clusters: 0, cyclicNodes: 0 }` — the runtime import graph is acyclic and
  the vite-8.0.16 bump is unblocked.
- **Effort:** Medium–High — it touches the most files and the most
  load-bearing code (`closeBoard`/`resetWorkspace`). **Risk:** Highest in the
  set — a registry that drops a teardown is the silent per-board leak the
  whole discipline exists to prevent. Mitigations: (1) the board-completeness
  test is extended to assert the **registry's** handler set drains correctly
  and per-board, tripwiring its coverage exactly as it tripwires the cell
  registries today; (2) registration order is documented at each site with
  the engine-stop-before-ledger-purge constraint named; (3) the `nodeIds`
  snapshot (Tranche B) is taken before any handler runs, preserving Class-B's
  before-the-splice requirement structurally.
- **Tests that must stay green:** the board-completeness test (the actual
  teardown guarantee — `tests/integration/store-mutators.test.ts`); the
  tenancy/identity-flip drain test (`resetWorkspace` clears every
  identity-scoped cache); the `useReviewSession` abort-and-resume
  choreography (a mid-review `closeBoard` aborts the pending wait and does not
  resurrect the deleted review row); the ledger purge-on-close test.

**Deferral is legitimate but does NOT bank the vite bump (Q1, resolved).**
Tranches A–C remove the worst back-edges (including the api-client→store edge
the ratchet header names), shrink `cyclicNodes`, honestly improve the layering,
and de-risk D by shrinking the SCC before the registry inversion touches it.
But the vite-8.0.16 unblock is **not** among the cheap wins: the suite mocks
`analysis-service` (the fake pattern), which stays cyclic until D, so the
deadlocking tests keep hanging until D takes `clusters → 0`. So D is the
load-bearing tranche for the stated goal, not elective hygiene — its risk has
to be paid, not deferred away. What deferral *does* buy is sequencing: land
A–C first (real ratchet-down deliveries that cannot regress once merged), then
do D as its own carefully-tested PR.

---

## 4. Do-not-break (load-bearing invariants)

These hold across every tranche; a change that violates one is wrong even if
the ratchet drops.

1. **The board-completeness teardown guarantee.** Every per-board surface is
   keyed on `BoardId` and torn down on `closeBoard`/`resetWorkspace`
   (`frontend/docs/notes/board-scope.md` headline invariant). The
   board-completeness test (`tests/integration/store-mutators.test.ts`) is
   the guarantee, not the type system; it must stay green and its coverage
   tripwire must be extended to whatever registry replaces the inline
   enumeration.
2. **The engine-stop-before-ledger-purge ordering.** `closeBoard` stops
   analysis before purging the ledger so an in-flight packet can't
   re-populate a cleared store (named in `closeBoard`'s docstring). Under the
   registry this becomes registration order and MUST stay documented at the
   registration sites — never implicit in array position (the board-scope
   note's explicit warning).
3. **Class-B purges run before the splice.** Node-keyed purges
   (ledger/stability/thumbnails) walk the closing board's nodes and must run
   while the board's node list is available. The §2.2 `nodeIds`-snapshot
   contract satisfies this structurally; do not regress to a post-splice
   lookup.
4. **`resetWorkspace` does NOT reset `store.engine`.** The live WebSocket is
   not user-keyed under the current local deployment; half-resetting is an
   ADR-0001 violation (`resetWorkspace` + `engine-connection.ts` headers,
   work-status item `engine-connection-lifecycle-logout`). The
   `engine-connection` module's store coupling is intentional — Q3.
5. **`activeAnalysisKeys` reactivity.** The settings accessor (Tranche C) must
   be read inside the computed's tracking scope, or palette/override/model
   changes silently stop re-issuing analyses (the under-keyed failure class).
6. **The message-sink fails loud.** A push before registration throws
   (ADR-0002); it must never silently drop a user-visible message.
7. **Type-only edges stay type-only.** Several cross-module imports are
   already `import type` and excluded from the runtime graph; do not
   accidentally promote one to a value import while refactoring (it would
   re-close a cycle the ratchet then catches — which is the ratchet working,
   but avoidable churn).

---

## 5. Open questions (settle before implementation)

- **Q1 [RESOLVED by the PR #444 investigation] — does the cheap path unblock
  the vite bump? No; Tranche D is required.** The deadlock is not specific to
  one module: vite 8.0.12's module runner hangs whenever a test `vi.mock`s
  *any* module that sits inside a runtime import cycle (the mock invalidates
  the node, the runner deadlocks resolving the cycle through it). The frontend
  suite mocks the service singletons wholesale via the fake pattern
  (`tests/CLAUDE.md`) — `analysis-service`, `analysis-persistence-service`,
  `backend-service` — plus `thumbnail-render-resources` in
  `store-mutators.test.ts`. Of these, `analysis-service` and
  `thumbnail-render-resources` stay SCC members until Tranche **D** (their
  store↔owner back-edge is a pattern-3 edge only the registry removes, and
  `analysis-service`'s genuine-write up-edge — Q3 — keeps the 2-cycle closed
  until then). So every test mocking `analysis-service` keeps deadlocking until
  D takes `clusters → 0`. **Conclusion: A–C do NOT bank the vite-8.0.16 bump; D
  is required for it.** (`analysis-persistence-service` falls out at C and
  `backend-service` at A, but `analysis-service` is the binding constraint.) A
  surgical partial-D removing only `store → analysis-service` does not help —
  `store → useReviewSession → analysis-service → store` still closes the loop,
  so the full registry is the clean cut.
- **Q2 — fold the registry into `closeboard-class-b-teardown-shape`?** That
  parked work-status item is the same design space (owner-located teardown is
  its named candidate). The §2.3 registry is one concrete answer. Decide
  whether to resolve both items together or keep them separate.
- **Q3 — invert the genuine state-write edges, or accept them as owner
  coupling?** `engine-connection`'s `store.engine.*` writes and
  `analysis-service`'s `mutateBoard`/`setSelectedModel` are real Service→Store
  writes. `engine-connection`'s header explicitly frames itself as the *owner*
  of `store.engine` — an owner module legitimately couples to the state it
  owns (P3 says split orthogonal concerns, not forbid all coupling). Forcing
  inversion here may be P3-theatre. Recommendation: leave these as the
  intended owner shape **if** A–D already take `clusters → 0` without them
  (they should — these are not the cycle-closing edges once the registry
  lands, because the store stops importing the service); revisit only if a
  residual edge survives. Confirm on the post-D recompute.
- **Q4 — the `analysis-config → useQeubo` module-level edge.**
  `analysis-config.ts:45` does `const qeubo = useQeubo()` at module scope — a
  runtime value edge into a composable, and an unusual shape (a state module
  reaching into a composable). Decide whether to invert it (inject the qEUBO
  overlay as an accessor) or whether `useQeubo`'s own up-edges
  (`store`, `profile-owner`, `pushSystemMessage`) make it cleaner to handle
  `useQeubo` as part of Tranches A/C. This edge may be load-bearing for the
  qEUBO audition reactivity (`effectiveParameterValues`); preserve that.
- **Q5 — SSOT for the message-type vocabulary.** `SystemMessageType` in the
  sink mirrors `SystemMessage['type']` in `src/types`. Decide which is the
  single source (ADR-0005 Rule 1 / ADR-0012 P1): likely the sink imports the
  type from `src/types` (a type-only edge, harmless to the runtime graph), so
  there is one home for the vocabulary.
- **Q6 — landing order of B vs D.** Tranche B's `nodeIds` signature change is
  cleanest landed *with* D's registry (the registry passes `nodeIds`). Decide
  whether to land B with a temporary inline `closeBoard` snapshot (B then D)
  or to land B and D as one PR. One-PR is less churn but a larger diff over
  load-bearing code; the smaller-step path is more ADR-0004-aligned.

---

## 6. Honest assessment

**The cheap tranches are genuinely cheap and genuinely valuable — but they do
not, by themselves, reach the goal.** Tranche A is a near-mechanical
import-direction flip behind a registered port, and it removes the *specific*
back-edge the ratchet and PR #444 both name. B and C are low-to-medium
mechanical inversions that shrink `cyclicNodes` further and improve the
layering honestly (services and state modules stop reaching up). What they do
NOT do is unblock the vite-8.0.16 bump: the suite mocks `analysis-service`,
which stays cyclic until D (Q1). So the concrete reason this work exists —
taking the security bump — is banked only once D lands.

**Tranche D is the real god-object reduction, and the real risk.** Splitting
`store/index.ts`'s two concerns (state container vs cleanup orchestrator) via
the teardown registry is the P3 fix that actually takes `clusters → 0`. But
it touches the most load-bearing code in the SPA (`closeBoard` /
`resetWorkspace`), and the failure mode of getting it wrong — a dropped
teardown — is exactly the silent per-board leak the whole resource-ownership
discipline was built to prevent. It is worth doing, but it is not worth
rushing, and it should not be bundled with the cheap tranches.

**Is full zero worth it?** For the stated goal, yes — D is required (Q1), so
the live question is *sequencing and risk*, not *whether*. Two honest framings:

- **The committed path (A→D), recommended.** Land A, B, C as independent
  ratchet-down deliveries (each cannot regress once merged), then D as its own
  carefully-tested PR. By the time D lands, the SCC has shrunk to the
  load-bearing store↔owner cleanup coupling alone, so D's registry inversion
  touches the smallest possible surface — the cheap tranches double as D's risk
  mitigation.
- **The minimum-viable-unblock path.** If appetite for D's risk is low but the
  bump is wanted sooner, the smallest cut that unblocks is still essentially D
  restricted to the mocked owners (`analysis-service`,
  `thumbnail-render-resources`) — but because `store → useReviewSession →
  analysis-service → store` keeps the loop closed, that "restricted" cut drags
  in most of the registry anyway. There is no cheap shortcut to the bump; the
  honest options are "do D" or "stay on vite 8.0.8." The ratchet keeps the
  residual SCC from growing in the meantime.

Either way, the sequencing banks the cheap wins first and isolates the risk —
partial progress ratchets the count down and is a real delivery, not a
half-measure. The one thing the roadmap will not do is treat the pattern-3
cleanup edges as cruft: they are the documented
resource-ownership-at-mutation-sites discipline, and the inversion *preserves*
them — it changes who imports whom, not whether the cleanup happens.
