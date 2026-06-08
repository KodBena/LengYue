# Audit — SPA board-scope consistency (per-`BoardId` vs workspace-global)

- **Status:** Audit report (READ-ONLY analysis) — opened for maintainer review. Recommendations (§6) not yet acted on.
- **Date:** 2026-06-05
- **Work-status item:** `spa-board-scope-consistency-audit`
- **Scope:** `frontend/` SPA board model. Backend per-user tenancy
  (`docs/notes/tenancy.md`) referenced only as an analog.
- **Method:** Direct read of the store, types, the keyed composables,
  and the seed bug's surfaces. No sub-agents were spawnable in this
  environment (no Task/Agent tool was exposed); the inventory was done
  inline. See the closing note.

## Reading log (ADR-0002 doc discipline)

Read end to end before citing: umbrella `CLAUDE.md`, `frontend/CLAUDE.md`,
`docs/notes/tenancy.md`, ADR-0001, ADR-0003. Read in full as primary
evidence: `src/store/index.ts`, `src/store/defaults.ts`, the
`SessionState`/`UISession`/`EngineState`/`GlobalStore`/`ReviewSessionData`
shapes in `src/types.ts` (lines 1342–2011), `board-card-trees.ts`,
`useForestBrowsePolicy.ts`, `useForestNavigation.ts`, `useCardTreeData.ts`,
`ForestDirectory.vue`, `useAnalysisProjection.ts`, `useAnalysisContext.ts`,
and the keying sections of `analysis-service.ts`, `analysis-ledger.ts`,
`stability-trajectory-store.ts`, `useReviewSession.ts`. `FILES.md` and
`IDENTIFIERS.md` consulted as lookup references (their sanctioned mode).

---

## 1. Executive summary

The SPA's board-scope model is **mostly coherent at the data layer and
incoherent at the UI-selection layer**. The principled spine is real:
per-board *data* state (review session row, card-tree forest, analysis
ledger, analysis subscriptions, per-board `analysisMode`, `analysisRange`,
play-vs-engine games, card-tree manual-expand) is consistently keyed on
`BoardId` and consistently torn down at `closeBoard` / `resetWorkspace`
through two well-documented registries (the `closeBoard` cleanup list and
`IDENTITY_SCOPED_CACHES`). Resource ownership is the strongest part of the
codebase — the O1–O14 audit pairs (the resource-ownership audit's numbered
per-board owner→cleanup pairs; defined in §4) are genuinely complete for the
data surfaces.

The incoherence is concentrated in **`store.session.ui.*`**, which is a
single flat bag mixing three different scopes with no signal of which is
which:

1. genuinely workspace-global UI (tab strip, panel widths, overlay
   toggles, deck context) — correctly global;
2. **`forestNav` (expanded + selection)** — modelled global, but it drives
   and clears a **per-board** pane (`board-card-trees`). This is the scope
   collision the seed bug ("card-metadata-during-review") is a symptom of.
   It is misscoped: a workspace-global selection mutating per-board data;
3. **`cardTreeNav`** — already correctly per-board (`Partial<Record<BoardId,
   …>>`), and it is the *model to copy* for fixing #2.

The single highest-leverage architectural fact: **`forestNav` and
`cardTreeNav` live side by side in the same `UISession`, one keyed by
`BoardId` and one not, with no naming or type convention that makes the
difference visible.** That absence of a scope convention is the root
ergonomic defect; the bug is its first cashed-out cost.

Two latent (non-firing-today) misfeatures were also found: a global read
(`activeBoard`) inside a per-board-parameterised composable
(`useAnalysisProjection`), and `requestCard` in-flight dedup that is
instance-scoped-across-boards rather than per-board. Neither bites under
the current single-active-board mount model, but both are the same
category of smell and would bite if a non-active board were ever rendered.

**Bottom line:** the per-board/global split is principled for *data* and
accidental for *UI selection*. The fix is not a sweeping refactor; it is
(a) re-scope `forestNav` to per-board to match `cardTreeNav`, and (b)
codify a scope convention so the next `UISession` field can't repeat the
error. The `inReviewSession` gate can land first as a safe stopgap, but it
patches the symptom, not the collision (see §6).

---

## 2. Inventory of reactive/state surfaces

Scope key: **PB** = per-`BoardId`, **WG** = workspace-global,
**PN** = per-node (`NodeId`), **PU** = per-user/identity, **EPH** =
ephemeral-per-component-instance.

| Surface | Lives at | Keyed by | Scope | Verdict |
|---|---|---|---|---|
| `boards[]`, `activeBoardIndex` | `store` (`index.ts:68`) | array index + `BoardState.id` | WG container of PB | (a) correct |
| `BoardState` (nodes, cursor, stones, captures, turn) | `store.boards[i]` | `BoardId` | PB | (a) correct |
| `BoardState.analysisRange` | `store.boards[i]` (`types.ts:212`) | `BoardId` | PB | (a) correct — persists across tab/board switch by design |
| `BoardState.games` (play-vs-engine) | `store.boards[i]` (`types.ts:288`) | `BoardId` → `NodeId` | PB | (a) correct |
| `BoardState.sourceCardId` / `clientGameId` | `store.boards[i]` | `BoardId` | PB | (a) correct |
| `store.session.reviews[boardId]` | `index.ts:81`, `types.ts:1815` | `BoardId` (`Partial<Record>`) | PB | (a) correct; cleaned `closeBoard`#3, `resetWorkspace` |
| `board-card-trees` slot (forest/activeSet/cards/forestStats/loading/error) | module-scope `reactive(Map)` (`board-card-trees.ts:64`) | `BoardId` | PB | (a) correct shape; **but driven by a WG selection — see #2 below** |
| `store.session.ui.cardTreeNav[boardId]` | `types.ts:1500` | `BoardId` (`Partial<Record>`) | PB | (a) correct — **the exemplar** |
| `store.engine.activeMode[boardId]` | `types.ts:1886` | `BoardId` (`Partial<Record>`) | PB | (a) correct; cleaned `closeBoard`#4 |
| analysis-service `boardToQueries` / `activeQueries{boardId}` / subs / restartCallbacks | `analysis-service.ts:70,103,109,117` | `BoardId` (+ queryId) | PB | (a) correct; cleaned `stopBoardAnalysis`, `resetWorkspace` |
| analysis-ledger `data` / `nodeVersions` | `analysis-ledger.ts:23,24` | `${hash}:${nodeId}` | PN (board-scoped via `purgeBoard` walking `board.nodes`) | (a) correct (ADR-0003 Band 1 names it `(configHash, nodeId)`) |
| stability-trajectory-store | `stability-trajectory-store.ts:48,49` | `${hash}\|${extractorId}\|${nodeId}` | PN (board-scoped via `purgeBoard`) | (a) correct |
| `useReviewSession.pendingAnalysisAborts` | module-scope `Map` (`useReviewSession.ts:68`) | `BoardId` | PB | (a) correct; cleaned `abortBoardReview`/`abortAllReviews` |
| thumbnail caches (board + card) | module-scope (`useThumbnailCache`, `useCardThumbnail`) | NodeId / CardId | PN / PU | (a) correct; in `IDENTITY_SCOPED_CACHES` + `closeBoard`#6 |
| `store.engine` (status/metrics/info/messages) | `index.ts:82`, `types.ts:1872` | none | WG | (a) correct — single shared WS, deliberately preserved across `resetWorkspace` |
| `store.engine.selectedModel` (SELECTOR) | `types.ts:1923` | none | WG | (a) correct — proxy-routing concern, one upstream pool per connection |
| `store.session.ui` tab/panel/overlay/deck UI (`activeTab`, `controlPanelWidth`, `overlayLayers`, `cardsContextIds`, `boardVariations`, `pvAnimation`, `moveFilter*`, …) | `types.ts:1342` | none | WG | (a) correct (see §2.1 caveat on `cardsContextIds`) |
| **`store.session.ui.forestNav` (expanded + selection)** | `types.ts:1487,1532` | none | WG | **(b)/(c) misscoped — drives a PB pane; see #2** |
| `store.session.ui.qeuboToolbarView` | `types.ts:1427` | none | WG | (a) correct — qEUBO is one-experiment-per-user |
| qEUBO experiment state (`useQeubo`) | module-scope + server | per-user | PU/WG | (a) correct — explicitly one experiment per JWT (`useQeubo.ts` header) |
| `store.profile.*` (settings, cardSets, knobs, bookmarks) | `types.ts:1793` | none | PU (persisted) | (a) correct |
| `store.knownTags` | `index.ts:74`, `types.ts:1831` | none | PU (non-persisted cache) | (a) correct |
| `usePvAnimation` cfg | composable-instance `reactive` (`use-pv-animation.ts:123`) | none | EPH | (a) correct — local preview state |
| `useCardTreeData.inflight` | composable-instance `Set` (`useCardTreeData.ts:133`) | rawCardId | EPH-across-boards | **(c) borderline — see #4** |
| `useAnalysisProjection.activeMainIndex` | reads `activeBoard.value` (`useAnalysisProjection.ts:44`) | — | reads WG inside PB-param fn | **(b) latent — see #3** |

### 2.1 `cardsContextIds` — a deliberate, documented WG choice

`cardsContextIds` (`types.ts:1419`) is WG and the comment is explicit:
"Per-board scoping was considered and parked: today's workflow has the
user adjusting context-ids occasionally, not tab-by-tab." This is the
right *kind* of decision — a named, justified scope choice. Verdict (a),
but it is the proof that the project *can* make scope a conscious choice;
`forestNav` never got that treatment.

---

## 3. Coherence assessment — the misscoped / straddling rows

### #2 — `forestNav` (WG) drives `board-card-trees` (PB). **Misscoped (b)/(c). The seed bug's root.**

- `forestNav.selection` is WG: one `NavSelection | null` on
  `store.session.ui` (`types.ts:1487,1534`), read via
  `useForestNavigation.selection` (`useForestNavigation.ts:133`).
- `useForestBrowsePolicy` (`useForestBrowsePolicy.ts:52-87`) `watch`es that
  one global selection and dispatches `tree.loadBrowse` /
  `loadBrowseForest` / `clearBrowse` against **whichever board is active**
  (`tree = useCardTreeData(boardIdRef)`,
  `boardIdRef = activeBoard.id`, `ForestDirectory.vue:66-67,160`).
- `clearBrowse() → reset(boardId)` (`useCardTreeData.ts:313-317,213-232`)
  empties the **per-board** slot.
- **Confirmed collision:** with `sel === null` the `immediate: true` watch
  (`useForestBrowsePolicy.ts:86`) fires `clearBrowse` on every mount of
  `ForestDirectory`. The top-level tab strip is `keepMounted: false`
  (`TabWidget.vue:39`; `App.vue:477-496` mounts `ForestDirectory` in the
  `cards` slot with no `keepMounted` override), so tabbing away and back
  **unmounts then remounts** `ForestDirectory`, re-firing the policy. On
  that remount the `seedFromQueue` watcher (`ForestDirectory.vue:143-154`)
  re-hydrates the per-board review forest, but the browse-policy
  `clearBrowse` wipes it — a WG-null clearing PB-restored data. This is a
  textbook scope collision: a workspace-global value mutating per-board
  state, with the two re-entry watchers racing on the same slot.

This row is both (b) — `forestNav.selection` arguably *should* be per-board
(the forest pane it drives is per-board) — and (c) — it straddles because
the *expansion* axis (`forestNav.expanded`) is over the WG roots list
(`ForestDirectory.vue:58,68` — `roots` is fetched once, "workspace-global"
per the comment at line 119), while the *selection* axis cashes out into
PB data. The navigator tree (games→roots) is genuinely global; the
right-pane forest it selects into is per-board. The selection is the seam,
and it was put on the global side.

### #3 — `useAnalysisProjection(boardId)` reads `activeBoard`. **Latent misscope (b).**

`useAnalysisProjection` takes a `boardId: BoardId` parameter
(`useAnalysisProjection.ts:30`) and threads it correctly into
`useVariationPath`, `useAnalysisTimeline`, and `store.boards.find(b =>
b.id === boardId)` (line 51) — but `activeMainIndex` reads
`activeBoard.value?.currentNodeId` (line 44), i.e. the **global** active
board's cursor, not `boardId`'s. Today these coincide because the app
mounts exactly one `AnalysisContext`, for the active board
(`App.vue:502-504` renders `AnalysisControls` only for `activeBoard.id`;
the board column is single-active, not a `v-for`). So this is **not a live
bug** — but it is the identical smell: a per-board-parameterised unit
silently substituting a global read. If a second (non-active) board's
projection is ever instantiated, `activeMainIndex` desyncs from its own
`variationPath`. Verdict (b) latent. Fix is a one-liner:
`boardsById.value[boardId]?.currentNodeId`.

### #4 — `useCardTreeData.inflight` dedup is instance-wide, not per-board. **Borderline (c).**

`inflight` (`useCardTreeData.ts:133`) is a composable-instance `Set<number>`
of in-flight `requestCard` ids, shared across every board the instance
sees as `boardIdRef` changes. The header comment defends this ("cross-board
contention isn't a real shape"), and under single-active-board that holds.
It is documented, so it is honest, but it is a place where per-board
identity was elided for convenience — worth noting as the third instance of
the same pattern.

Everything else classifies as (a) correctly-scoped.

---

## 4. Resource ownership

This is the codebase's strongest area and is **not** the problem.

**What "O-pairs" / "O1–O14" mean.** They are the numbered owner→cleanup pairs
catalogued by the resource-ownership audit
(`docs/archive/notes/resource-ownership-audit-plan.md`): each pair couples a
per-board resource that some entity *owns* with the `closeBoard` step that
*releases* it. `closeBoard`'s inline comments cite them directly ("Audit O12",
"Audit pairs O2 / O3 / O14", "Audit O13", …). They are the per-board analog of
the identity scope's `IDENTITY_SCOPED_CACHES` registry — except the board pairs
are **hand-wired** in `closeBoard` rather than auto-registered, which is the
ergonomic gap the new **P1b** recommendation (§6) closes.

- `closeBoard` (`index.ts:371-438`) releases all PB resources in a
  documented, order-load-bearing sequence (O1–O14): analysis subscriptions,
  ledger, stability trajectories, persisted bundle, `reviews` row,
  `activeMode` tombstone, `cardTreeNav` slot, review-wait abort, thumbnails,
  `board-card-trees` slot. Each cleanup names its resource and failure mode.
- `resetWorkspace` (`index.ts:573-608`) drains the `IDENTITY_SCOPED_CACHES`
  registry (`index.ts:477-485`) — the structural fix that replaced the
  hand-wired O8–O13 clears, so a new identity-scoped module cache can't be
  silently forgotten (a tenancy completeness test asserts it).

**One ownership asymmetry worth flagging, tied to #2:** `forestNav` is
*not* cleared on `closeBoard`. Because it is WG it survives any single
board close — which is correct *given* its current global scope, but it is
exactly why a stale/null selection from one board's session reaches the
next board's mount. If `forestNav` is re-scoped per-board (the §6
recommendation), it gains a `closeBoard` cleanup obligation (a new O-pair)
and an entry in the `defaultSessionUI` reset — the discipline already in
place for `cardTreeNav` (audit O14). No leak exists today; the asymmetry is
latent in the *current* scoping and becomes a real cleanup site under the
fix.

No leaks found in the PB data surfaces.

---

## 5. Ergonomics / discoverability

There is **no frontend analog of `docs/notes/tenancy.md`** and **no
convention that signals scope at authoring time.** The evidence:

- `forestNav` and `cardTreeNav` sit adjacent in `UISession`
  (`types.ts:1487` vs `1500`). One is `ForestNavState` (flat, WG); the
  other is `Partial<Record<BoardId, CardTreeNavState>>` (PB). Nothing but
  the reader's attention distinguishes them. A contributor adding the next
  navigator field has no rule telling them which shape to pick — exactly the
  gap that produced #2.
- The PB convention that *does* exist is implicit and discovered only by
  reading: "module-scope `reactive(Map<BoardId, …>)` mirroring
  `store.session.reviews`" (`board-card-trees.ts:8-16`). It is a good
  pattern, but it is folklore, not a documented rule.
- `FILES.md` tags `board-card-trees.ts` "Per-board card-tree state"
  (line 190) — the only place "per-board" is surfaced as a property, and
  it is a one-liner in a lookup file, not a model.

The backend's tenancy note works because it states **one headline
invariant** ("every tenant-scoped surface filters on `user_id` at the SQL
level") and a **fixed recipe** (the five-layer threading). The frontend has
the equivalent latent invariant — "every per-board surface is keyed on
`BoardId` and torn down at `closeBoard`/`resetWorkspace`" — but it is
nowhere stated, so it can't be checked at review time the way tenancy is.

**Recommended convention (low cost, high leverage):**

1. **A scope note** — `frontend/docs/notes/board-scope.md` (the tenancy
   analog), stating the headline invariant above, listing the canonical PB
   surfaces, and giving the authoring recipe: *when you add per-board state,
   key it on `BoardId`, add a `closeBoard` cleanup (an O-pair), and add the
   `resetWorkspace`/`defaultSessionUI` reset.* `cardTreeNav` is the worked
   example; `forestNav` (post-fix) is the second.
2. **A type-level signal.** Two cheap options, in increasing strength:
   - **Naming rule (zero cost):** per-board store maps are
     `Partial<Record<BoardId, T>>` and named `<thing>ByBoard` or kept in a
     `…Nav[boardId]` shape; reviewers reject a flat scope-ambiguous nav
     field. This alone would have caught #2.
   - **Branded alias (small cost):** `type PerBoard<T> = Partial<Record<BoardId,
     T>>` in `types.ts`, used for `reviews`, `activeMode`, `cardTreeNav`,
     and (post-fix) `forestNav`. It does not add runtime safety but it makes
     scope a *named property of the type* — the same move ADR-0001 endorses
     ("type declarations should match actual behavior") and ADR-0003's "name
     the abstraction for the problem class." A grep for `PerBoard<` then
     enumerates every per-board surface, which is what the tenancy recipe
     gives the backend for free.

The `PerBoard<T>` alias is the recommended form: it is the structural
counterpart to the backend's `UserId` brand — not a guarantee, but a
visible, greppable spec that turns scope from folklore into a checkable
property.

---

## 6. Prioritized recommendations

Ordered by leverage / risk.

### P0 — Re-scope `forestNav` to per-board (fix the collision, not the symptom)

Make `forestNav` `Partial<Record<BoardId, ForestNavState>>`, mirroring
`cardTreeNav` exactly. Then the WG selection no longer drives PB data —
each board owns its own navigator selection + expansion, and
`useForestBrowsePolicy` reads the active board's own selection.

- **Files:** `types.ts` (`UISession.forestNav` shape, `~1487`),
  `defaults.ts` (`defaultSessionUI.forestNav` → `{}`, `~704`),
  `useForestNavigation.ts` (key all reads/mutators on `boardIdRef`, mirror
  `useCardTreeData`'s `cardTreeNav` access at lines 167-211),
  `useForestBrowsePolicy.ts` (no change to logic — it already runs against
  the active board's `tree`), `ForestDirectory.vue` (pass `boardIdRef` into
  `useForestNavigation`), `store/index.ts` (`closeBoard` gains a
  `delete store.session.ui.forestNav[boardId]` — new O-pair; `resetWorkspace`
  already covers it via `defaultSessionUI` reset), plus a schema migration
  (the persisted shape changes flat→keyed; backfill existing blobs by
  seeding the current single `forestNav` under no board / dropping it, per
  the `cardTreeNav` migration-45 precedent).
- **Risk:** moderate (touches persisted schema → migration required), but
  the change is structurally identical to the already-shipped `cardTreeNav`
  arc, so the pattern is proven.
- **Why P0:** it removes the *category* of bug, not the instance. After
  this, a null/absent selection on board A cannot clear board B's forest,
  because there is no shared selection.

### P1 — Codify the scope convention (prevent recurrence)

Add `frontend/docs/notes/board-scope.md` and the `PerBoard<T>` alias (§5).
Retag `reviews`, `activeMode`, `cardTreeNav`, `forestNav` to `PerBoard<T>`.
Cross-reference from `frontend/CLAUDE.md`'s resource-ownership section (which
already names `closeBoard`/`resetWorkspace` as the worked examples — the
scope note is its natural sibling).

- **Risk:** none (doc + type alias, no runtime change).
- **Why P1:** this is what makes P0 durable. Without it, the next nav-style
  field repeats #2.

### P1b — A per-board cleanup-handle registry (board-derived data included)

The identity scope already has the *registry* form of teardown:
`IDENTITY_SCOPED_CACHES` (`store/index.ts:477-485`), which `resetWorkspace`
drains so a new identity-scoped cache cannot be silently forgotten (a
completeness test asserts it). The **board** scope has no equivalent — its
teardown is the hand-wired O1–O14 list in `closeBoard` (§4), the "you can forget
an O-pair" risk §5 names.

Generalize it as a per-board **cleanup-handle registry**: a board owns a set of
teardown closures `(boardId) => void`, registered by whoever creates dependent
state; `closeBoard` drains the board's handle (before the splice) instead of
maintaining the O-list by hand.

**Both teardown classes fit, as closures** — a maintainer correction
(2026-06-05) to the scope-exhaustiveness consult's "Class A only" verdict. §4 splits the
sites into board-*keyed* containers (Class A, `delete map[boardId]`) and
board-*derived* node-keyed purges (Class B: `ledger.purgeBoard` /
`stabilityTrajectoryStore.purgeBoard` / `purgeBoardThumbnails`, which walk
`board.nodes`). The consult argued Class B "can't be covered" — but that
objection applies only to a *typed per-board cell* (`Scoped<BoardId, T>`
storage), **not** to a teardown closure. The board *owns* its board-derived
data, so a registered closure that does the node-walk purges it exactly as
today; `closeBoard` already runs every Class B purge as a `(boardId) => void`
call before the splice (`index.ts:376-416`). So the registry covers Class A and
Class B uniformly.

**The real constraint is ordering, not coverage.** `closeBoard`'s docstring
(`index.ts:348-357`) makes the order load-bearing: stop-engine before
ledger-purge; the `delete`s after `stopBoardAnalysis` (so they overwrite the
`activeMode` tombstone); the node-walkers before the splice. A cleanup-handle
must preserve this deliberately — ordered entries or explicit phases, the whole
handle drained before the splice — not naïve registration order. This is the
legitimate kernel of the consult's caution: the trade is per-site "why this
order" documentation for order encoded in the registry. Worth it only if the
hand-wired list is actively annoying to maintain (legibility), **not** for
safety — §4 found no leaks.

- **Shape:** a non-persisted side structure (`Map<BoardId, OrderedCleanup>` or a
  phased registry), **not** a field on `BoardState` — that lives in the
  SyncService'd store and closures don't serialize.
- **Files:** `store/index.ts` (the handle + the `closeBoard` / `resetWorkspace`
  drain), and the dependent-state creation sites registering their closure
  (`board-card-trees.ts`, the `reviews` / `activeMode` / `cardTreeNav` /
  `forestNav` accessors, the `analysis-service` per-board maps,
  `useReviewSession.pendingAnalysisAborts`, and the Class B purges).
- **The guarantee comes from a test, not the type system.** Per the scope-exhaustiveness consult,
  TypeScript cannot enumerate "every scoped surface" to check registration; the
  actual completeness guarantee is a board analog of the identity tenancy test
  (create boards, populate every per-board surface, close one, assert its cells
  — and only its — are gone). Write that test regardless of whether the registry
  lands; it, not the registry or the types, is what catches a forgotten
  teardown.
- **Out of scope:** the storage-bundling / "make untorn-down state
  unrepresentable" capability (Tier 3) applies only to Class A *cells* and
  cannot hold the SyncService-persisted members without leaving the
  reactive/migration graph (fighting ADR-0001) — over-engineering for a
  non-leak. Skip it, and skip any phantom/lattice/faceted-value machinery (§8).

### P2 — Fix the latent global-read in `useAnalysisProjection`

Change `activeMainIndex` (`useAnalysisProjection.ts:44`) to read
`boardsById.value[boardId]?.currentNodeId` (or `store.boards.find(...)`,
consistent with line 51) instead of `activeBoard.value`.

- **Risk:** minimal — behaviour-identical under single-active-board; removes
  a latent desync.
- **Why P2:** cheap correctness, and it removes a second instance of the
  same anti-pattern so the convention note has fewer exceptions to explain.

### P3 — Note / optionally per-board `useCardTreeData.inflight`

Leave as-is (it is documented and correct under the current mount model),
but record it in the scope note as a known instance-scoped surface so it is
a conscious choice, not an oversight. Re-scope only if multi-active-board
rendering ever lands.

### Stopgap — the `inReviewSession` gate

Gating `useForestBrowsePolicy`'s `clearBrowse` branch on the active board's
`inReviewSession` **can land safely on its own**: it is local to
`useForestBrowsePolicy` + `ForestDirectory`, requires no schema change, and
demonstrably stops the seed bug (it prevents the WG-null clear from wiping a
PB review forest). **But it patches the symptom, not the collision** — the
WG selection still drives PB data, and any *non-review* path that produces a
null/absent selection on remount (e.g. a board whose forest was browse-loaded
then the tab is switched away and back with `selection` still null) can still
clear another board's slot. So: land the gate as a fast user-facing fix if
needed, but do **not** treat it as closing the architectural item — P0 is the
real close.

**Recommended sequence:** ship the `inReviewSession` gate now if the bug is
biting users; do P0+P1 as the foundational close (P0 makes the gate
redundant and can remove it); fold P2 in opportunistically.

---

## 7. The explicit answers asked for

- **Should `forestNav.selection` (and similar global UI selections) become
  per-board?** Yes for `forestNav` — it drives a per-board pane and is the
  proven source of the collision; re-scope it to match `cardTreeNav`
  (P0). It is the only WG `session.ui` selection that cashes out into
  per-board data; the other WG UI fields (tab, widths, overlays,
  `cardsContextIds`, `qeuboToolbarView`) drive WG or per-user surfaces and
  are correctly global. So: not a blanket "make all UI selections
  per-board," but a targeted re-scope of the one that is misplaced, plus a
  convention so future ones are placed deliberately.
- **Is a unifying single-per-board-state pattern worth doing?** Yes, but as
  *convention*, not a heavy framework: the `PerBoard<T>` alias + the
  board-scope note (P1). The data layer already follows one implicit
  pattern well; the value is making it explicit and greppable, not
  rebuilding it.
- **Can the card-metadata-during-review fix (`inReviewSession` gate) land
  safely on its own?** Yes, it lands safely and stops the reported bug. But
  it is a symptom patch — the global-drives-per-board collision survives it.
  Land it as a stopgap if user-facing urgency demands; close the
  work-status item only with P0 (re-scope `forestNav`), which makes the gate
  unnecessary.

---

## 8. Generification follow-up — partitioning vs visibility

A follow-up consult (external Claude instance, lacking repo context) proposed
unifying `PerBoard<T>` and the backend's `PerTenant<T>` as one `Scoped<S, T>`
functor over a poset of scopes, separating two concerns: **partitioning**
(where state lives / how it's addressed — a plain `ScopeId → T` family) and
**visibility / trust** (whether one cell may observe another, as a *guarantee*
vs a convention). That distinction is the valuable part; the unification needs
re-aiming for this codebase. Maintainer-reviewed conclusions:

- **Board and tenant cannot share one functor here.** Board is frontend,
  TypeScript, in-memory reactive state; tenant is backend, Python, enforced in
  SQL (`WHERE user_id = …`). Different sub-projects, different languages — no
  `Scoped<S, T>` is instantiable as both. Tenancy is an **analog**, not a
  consolidation target (as §1 / the scope note already frame it). So the "one
  object, two instantiations across board and tenant" framing does not apply.
- **Where partitioning generification *does* apply: frontend-internal.** The
  SPA has three scope families — **per-board** (`BoardId`), **per-node**
  (`NodeId` / `configHash`), **per-identity** (user). Per-board and per-node are
  **pure partitioning** (organizational, not adversarial — boards are all the
  user's own data, no trust boundary). Per-identity carries the one
  visibility-grade obligation (clear-on-identity-flip; the
  `tenancy-instance-cache-leak` class), and that is **already** handled by the
  `IDENTITY_SCOPED_CACHES` registry. So the consult's partitioning/visibility
  split maps cleanly: give boards the **functor + lifecycle**, not a lattice.
- **The right-sized take = P1 + P1b.** `PerBoard<T>` (P1) is the partitioning
  alias; the board-scope teardown registry (P1b) is the lifecycle half — i.e.
  exactly the consult's `Scoped<S, T>` (storage + teardown), instantiated for
  the board scope by generalizing the identity registry. The consult's
  reframing of the latent global-read (P2) as a *scope leak* (resolving ambient
  scope from the global frame instead of walking the chain) is a useful lens and
  matches #3.
- **What to skip.** The cross-sub-project unification (impossible/wrong here);
  and the heavier information-flow machinery (Denning lattice / Bell–LaPadula /
  MCS) and the maximal-generality forms (**presheaf / sheaf**, **faceted
  values**). Board isn't a trust boundary, so it needs none of the visibility
  lattice — the consult's own bottom line. Worth knowing the names; not worth
  building.

Net: the generification is leverage *iff* scoped to the frontend, partitioning
only, as the P1 + P1b pair. Pushed further it becomes more abstraction than the
problem repays — and, across the sub-project line, would risk diluting the one
real trust boundary (backend tenant isolation) through a shared abstraction.

---

## Sub-agent accounting

**Sub-agents spawned: 0.** The Task/Agent tool was not available in this
environment (only deferred tools unrelated to sub-agent forking were
exposed). The inventory was therefore performed inline by direct reads of
the store, the type shapes, the keyed composables, the analysis
service/ledger/stability stores, and the seed bug's full call chain
(`ForestDirectory` → `useForestNavigation`/`useForestBrowsePolicy` →
`useCardTreeData` → `board-card-trees`). Coverage breadth matches what a
fan-out would have produced; no subsystem in the requested scope was left
un-read.

---

## Appendix — Audit commission prompt (verbatim)

Per project standing practice, the prompt the auditor was commissioned with is
recorded here for auditability. It was dispatched to a background Opus
`general-purpose` agent. Note the fork permission it grants did not take effect
(the Agent tool was not exposed to the spawned agent in this harness — see the
Sub-agent accounting above).

You are an architecture auditor for the LengYue SPA at `/home/bork/w/omega/frontend` (a Vue 3 + TypeScript app; umbrella repo at `/home/bork/w/omega`). This is a READ-ONLY audit — do NOT modify code. Your deliverable is actionable architectural guidance the maintainer can act on directly.

You correspond to work-status item `spa-board-scope-consistency-audit`. You MAY fork your own sub-agents (you have the Agent tool) to parallelize the inventory across subsystems — auditors are permitted to do so. Use `Explore` sub-agents for breadth (they can't fork further) or `general-purpose` for deeper threads. Synthesize their findings yourself.

## The question

Is the SPA architecturally coherent in how it exposes **board-specific** (per-`BoardId`) vs **board-generic** (workspace-global) state, in a way that makes documentation, extension, and reasoning ERGONOMIC? Where is the per-board/global split principled, and where is it accidental or inconsistent? What architectural misfeatures should be fixed — and in what priority?

## The motivating example (already diagnosed — your seed, and a worked case to generalize from)

A bug ("card-metadata-during-review"): during an active review, the Cards-tab lineage-explorer forest vanishes after switching the top-level tab away and back. Runtime-confirmed root cause:
- The forest slot (`src/composables/cards/board-card-trees.ts`, a module-scope `reactive(Map<BoardId, …>)`) and the review session (`store.session.reviews[boardId]`) are **per-board** (keyed on `boardIdRef = activeBoard.id`).
- But `nav.selection` (`store.session.ui.forestNav.selection`, read via `useForestNavigation`) is **workspace-GLOBAL**.
- `useForestBrowsePolicy` (`src/composables/forest/useForestBrowsePolicy.ts`) translates that ONE global selection into a fetch/clear on whichever board is **active**. Its `if (!sel) tree.clearBrowse()` branch (clearBrowse → `reset(boardId)` → empties the slot) wiped the per-board review forest on remount, *after* the per-board re-hydrate (`seedFromQueue`) had restored it. A per-board surface being driven/cleared by a global selection = a scope collision.
- The top-level tab strip (`TabWidget.vue`, `keepMounted: false`) `v-if`-unmounts the cards tab, so this fires on every tab switch; it also fails to re-hydrate on full reload.

I considered a fix (gate the browse policy on the active board's `inReviewSession`), but the global-vs-per-board mismatch suggests this is a symptom of a broader pattern, hence this audit. The maintainer wants to fix architectural misfeatures FIRST, before patching this one surface.

## What to produce

1. **Inventory** (the backbone): a table of the SPA's exposed reactive/state surfaces, each classified **per-board** vs **workspace-global** (vs per-something-else), with where it lives (store path under `store.session.*` / `store.profile.*`, or a module-scope composable store like `board-card-trees.ts`) and how it's keyed. Cover at least: `store.session.reviews`, `store.session.ui.*` (forestNav, cardTreeNav, activeTab, qeuboToolbarView, cardsContextIds, activeCardSetId, selector model, …), `board-card-trees`, analysis ledger/per-board analysis state, engine/connection state, PV/hover state, and the `boards[]` themselves. Read `src/store/index.ts`, `src/store/defaults.ts`, `src/types.ts` (the `SessionState`/`GlobalStore` shapes), and the composables keyed on `boardIdRef` (`useReviewSession`, `useCardTreeData`, `useForestNavigation`, `useAnalysis*`, etc.).
2. **Coherence assessment**: classify each surface as (a) correctly-scoped, (b) misscoped (should be per-board but is global, or vice versa), or (c) straddling/ambiguous. The `forestNav.selection`-drives-a-per-board-pane case is one (b)/(c); find the others. Note any surface where a global value drives or mutates per-board state, or where per-board state leaks across boards.
3. **Resource ownership**: are per-board surfaces consistently created and cleaned up on `closeBoard` / `resetWorkspace` (see the ownership-audit discipline, "O12" per-board card-tree state; `board-card-trees.ts` header)? Identify leaks or asymmetric cleanup.
4. **Ergonomics/discoverability**: is the per-board-vs-global model documented and conventionally signalled (naming, types, a tenancy-style note)? The backend has `docs/notes/tenancy.md`; is there a frontend analog, and should there be? Recommend a convention (e.g., a branded `PerBoard<T>` pattern, a naming rule, or a doc) that makes scope obvious at authoring time.
5. **Prioritized, actionable recommendations**: concrete fixes for the misfeatures, ordered by leverage/risk. For each, name the files and the shape of the change. CRUCIALLY, answer: should `forestNav.selection` (and similar global UI selections) become per-board? Is there a unifying refactor (a single per-board-state pattern) worth doing? And: **can the card-metadata-during-review fix (the `inReviewSession` gate) land safely on its own, or should a foundational scope fix precede it?**

## Discipline
- Honor the project's doc-reading rule (umbrella + `frontend/CLAUDE.md`, ADR-0001/0003/0010, `frontend/FILES.md` as a lookup, `docs/notes/tenancy.md` for the backend analog): read what you cite, end to end; don't bluff citations.
- Ground every claim in `file:line` evidence. Distinguish confirmed findings from hypotheses.
- Scope: the frontend SPA's board model. The backend's per-user tenancy is a separate concern (reference only as an analog).

## Output
Write the full report to `/home/bork/w/omega/docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md` (an untracked draft — do NOT commit, do NOT run git). Then return, as your final message: an executive summary (≤ ~400 words), the inventory's misscoped/straddling rows, the top prioritized recommendations, and the explicit answer on whether the card-metadata fix can land independently. Report how many sub-agents you spawned and what each covered.

*(The "do NOT commit" instruction above was the original commission; the maintainer subsequently asked for the report to be PR'd for review, which is why it is now committed — see the Status line at the head.)*

---

## Scope-exhaustiveness consult (extracted)

The follow-up firewalled scope-exhaustiveness consult — the maintainer's
question on whether strong typing can give an exhaustiveness check over scoping
and whether the registry-as-capability framing exposes a refactor, the
consultant's commission prompt, and its full report — was originally inlined
here as Appendices B and C. It is now recorded as a standalone consult record
per the consult-record convention, so the report renders as readable markdown
rather than a non-wrapping code block: the board-scope exhaustiveness consult
(`docs/notes/consult/opus-consult-2026-06-05-board-scope-exhaustiveness.md`).

The verdict it records — TypeScript cannot reach the *registration* half (the
guarantee is a completeness test, not the type system); the board teardown sites
split into Class A (board-keyed `delete`) and Class B (board-derived node-walk
purges); the capability / lattice / phantom-type forms are over-engineering for a
non-leak — is the basis for P1, P1b, and §8 above. The audit's **P1b** supersedes
that report's "Class A only" verdict on the *Class B* point (a per-board cleanup
closure covers board-derived data; the "can't cover" objection applied only to a
typed per-board storage cell).
