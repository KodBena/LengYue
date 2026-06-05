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
(2026-06-05) to the Appendix C consult's "Class A only" verdict. §4 splits the
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
- **The guarantee comes from a test, not the type system.** Per Appendix C,
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

## Appendix A — Audit commission prompt (verbatim)

Per project standing practice, the prompt the auditor was commissioned with is
recorded here for auditability. It was dispatched to a background Opus
`general-purpose` agent. Note the fork permission it grants did not take effect
(the Agent tool was not exposed to the spawned agent in this harness — see the
Sub-agent accounting above).

```text
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
```

*(The "do NOT commit" instruction above was the original commission; the maintainer subsequently asked for the report to be PR'd for review, which is why it is now committed — see the Status line at the head.)*

---

## Appendix B — Scope-exhaustiveness consult: commission prompt (verbatim)

A follow-up firewalled consult (background Opus `general-purpose` agent, no peek
at the orchestrator's own answer) on whether strong typing can give an
exhaustiveness check over scoping, and whether the registry-as-capability
framing exposes a refactor. Recorded verbatim per standing auditability
practice.

```text
You are an independent architecture consultant for the LengYue SPA (Vue 3 + TypeScript) at `/home/bork/w/omega/frontend` (umbrella repo `/home/bork/w/omega`). READ-ONLY — do not modify code or run git. This is a firewalled second opinion: reason independently and from first principles; outside-the-box thinking is explicitly wanted, even if it comes to nothing.

## Required context (read end to end first)
- `/home/bork/w/omega/docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md` — a board-scope consistency audit. Key facts you'll need: the SPA has per-board (`BoardId`), per-node (`NodeId`/`configHash`), and per-identity (user) scopes; per-board *data* is keyed on `BoardId` and torn down at `closeBoard` (a hand-wired numbered "O1–O14" owner→cleanup list) / `resetWorkspace`; the **identity** scope already has a registry form of teardown, `IDENTITY_SCOPED_CACHES` (`src/store/index.ts`), which `resetWorkspace` drains and a completeness *test* asserts; the audit's recommendations include P1 (`PerBoard<T>` alias + a board-scope convention note) and P1b (generalize `IDENTITY_SCOPED_CACHES` to a board-scope teardown registry). Read the whole audit, including §8 (partitioning vs visibility/trust) and the appendix.
- Ground yourself in the actual code: `src/store/index.ts` (`closeBoard`, `resetWorkspace`, `IDENTITY_SCOPED_CACHES`), `src/types.ts` (the per-board store shapes: `reviews`, `activeMode`, `cardTreeNav`, `forestNav`), `src/composables/cards/board-card-trees.ts`, and the per-board composables. Honor the project's doc-reading discipline (umbrella + `frontend/CLAUDE.md`, ADR-0001/0003/0010); ground claims in `file:line`.

## The question
The maintainer observes that `IDENTITY_SCOPED_CACHES` "suggests a mapping — an arrow, hence a pair of types," and that it "confers a certain capability and you have to go through the registry." Questions:
1. Can strong (TypeScript) typing give an **enum-like exhaustiveness check on scoping** — i.e., the compiler (or a lint) guarantees that every scoped surface is registered/torn down, and that every scope variant is handled — for **both** the board and identity scopes, and ideally under **one generic scoping convention**?
2. Is the registry best understood as a **capability** ("the only way to hold scoped state is to go through the registry, which confers — and obligates — its teardown"), and if so, can that be made structural (make "scoped state without teardown" unrepresentable) rather than conventional?
3. Most importantly: does pursuing this **expose a serendipitous refactoring/simplification opportunity** in this codebase? The maintainer's strongest interest is refactoring that *removes* code and duplication, not adding framework. If the honest answer is "more machinery than it's worth," say so plainly.

## What to produce
An independent design memo. Cover: the spectrum of mechanisms (runtime registry+test → compile-time exhaustiveness → capability/make-illegal-states-unrepresentable), with concrete TypeScript sketches grounded in THIS codebase's actual surfaces and their real differences (module-scope caches vs the SyncService-persisted store maps with schema migrations — these may not be funnel-able the same way). Be specific about where each mechanism bites and where it can't reach. Distinguish partitioning-completeness (teardown exhaustiveness) from visibility/trust (don't conflate — see audit §8). Name any genuinely novel angle the obvious framings miss (e.g. phantom/branded types tying a value to its scope lifetime, effect/linear-type emulation, deriving store shape + teardown + reset from one closed key set, etc.). End with a blunt verdict: is there a real, code-removing refactor here, what is it concretely, and what would be over-engineering.

Note: the Agent/Task tool is not exposed to you in this harness, so you cannot fork sub-agents — do the analysis inline (full coverage of the above is feasible solo). Do NOT write any files and do NOT run git; RETURN the full memo as your final message.
```

---

## Appendix C — Scope-exhaustiveness consult: report (verbatim)

Reproduced verbatim (HTML entities un-escaped; the report's own code fences are
preserved inside the outer quad-backtick fence). **Note:** P1b above supersedes
this report's "Class A only" verdict on the *Class B* point — see the maintainer
correction in P1b (a per-board cleanup *closure* covers board-derived data; the
"can't cover" objection applied only to a typed per-board storage cell). The
report's other conclusions (TS cannot check registration exhaustiveness; the
guarantee is a test; the capability/Tier-3 storage-bundling and the
phantom/lattice machinery are over-engineering for a non-leak) stand.

````text
# Design memo — scoping as a typed capability in the LengYue SPA

**For:** maintainer · **Posture:** independent second opinion, read-only · **Grounding:** `frontend/src/store/index.ts`, `src/types.ts`, `src/composables/cards/board-card-trees.ts`, `src/services/analysis-service.ts`, `src/services/analysis-ledger.ts`, `src/composables/review/useReviewSession.ts`, and the board-scope audit (`docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md`).

## 0. The one fact the whole question turns on

The maintainer's instinct — "`IDENTITY_SCOPED_CACHES` suggests a mapping, an arrow, a pair of types; it confers a capability; you have to go through the registry" — is correct about the *identity* scope and is the right lens. But before reaching for it on the board scope, the decisive observation is that **the board-scoped teardown sites are not homogeneous**, and the heterogeneity is exactly the thing a single registry has to either absorb or refuse. Two genuinely different shapes hide under the audit's flat "O1–O14" list:

**Class A — board-*keyed* containers.** Teardown is literally `delete container[boardId]`. The key *is* `BoardId`. These are:
- `store.session.reviews` (`index.ts:397`, `Partial<Record<BoardId, …>>`)
- `store.engine.activeMode` (`index.ts:398`)
- `store.session.ui.cardTreeNav` (`index.ts:399`)
- (post-P0) `store.session.ui.forestNav`
- `boardCardTrees` module map (`board-card-trees.ts:64`, `removeBoardCardTree`)
- `analysisService.boardToQueries` and its dependent maps (`analysis-service.ts:117`)
- `useReviewSession.pendingAnalysisAborts` (`useReviewSession.ts:68`)

**Class B — board-*derived* purges.** The container is **not** keyed on `BoardId` at all — it is keyed on `(configHash, nodeId)` (the ledger, `analysis-ledger.ts:255-258`) or `(hash, extractor, nodeId)` (stability, `stability-trajectory-store.ts:168-171`) or `NodeId` (thumbnails). Teardown does **not** index by board; it *walks `board.nodes`* to compute the node set to evict, and therefore **must run while the board is still in `store.boards`** — the ordering comment at `index.ts:407-409` and the explicit "before the splice" requirement at `index.ts:355-357` exist for exactly this. The "arrow" here is not `BoardId → cell`; it is `BoardId → (look the board up, read its nodes, evict a node-keyed family)`.

This is the single most important thing the obvious framing misses. **`IDENTITY_SCOPED_CACHES` works as a flat `{label, clear: () => void}` list precisely because identity teardown is `clear()` with no argument and no ordering subtlety beyond "engine first."** The board scope has both an *argument* (`boardId`) and a *live ordering constraint against `store.boards`*. Any board registry must carry `clear: (boardId) => void` and must run before the splice. That's still expressible — but it means a board registry is not a copy of the identity registry; it's a second, differently-typed thing. Whether unifying them under "one generic scoping convention" pays depends entirely on whether you're willing to model Class B honestly or paper over it.

## 1. The spectrum of mechanisms (and where each bites)

### Tier 0 — naming + the `PerBoard<T>` alias (the audit's P1)

```ts
export type PerBoard<T> = Partial<Record<BoardId, T>>;
```

This is pure spec, zero runtime. It makes scope a *named, greppable property of the type* — `grep 'PerBoard<'` enumerates Class A's store-resident members. **Where it bites:** review-time legibility and the `forestNav`/`cardTreeNav` adjacency that produced the seed bug (`types.ts:1487` vs `1500`). **Where it can't reach:** it says nothing about teardown — a `PerBoard<T>` field with no `closeBoard` clause typechecks fine. It also can't tag Class B at all (those aren't `BoardId`-keyed), nor the module-scope `Map<BoardId, …>` members (those aren't `Partial<Record>`, they're `Map`; a `PerBoardMap<T> = Map<BoardId, T>` sibling would, but now you have two aliases). Verdict: cheap, real, do it — but it is *labelling*, not *enforcement*. The maintainer asked specifically whether typing can give exhaustiveness; this tier explicitly cannot.

### Tier 1 — the registry + completeness test (the identity scope's existing form, generalized = P1b)

This is `IDENTITY_SCOPED_CACHES` (`index.ts:477-485`) plus the test that drains it. Generalized to the board scope:

```ts
const BOARD_SCOPED_TEARDOWNS: ReadonlyArray<{ label: string; clear: (b: BoardId) => void }> = [
  { label: 'analysis:board-queries', clear: b => analysisService.stopBoardAnalysis(b) },
  { label: 'analysis-ledger',        clear: b => ledger.purgeBoard(b) },        // Class B
  { label: 'stability-trajectories', clear: b => stabilityTrajectoryStore.purgeBoard(b) }, // Class B
  { label: 'board-thumbnails',       clear: b => purgeBoardThumbnails(b) },     // Class B
  { label: 'reviews',                clear: b => { delete store.session.reviews[b]; } },
  { label: 'engine:active-mode',     clear: b => { delete store.engine.activeMode[b]; } },
  { label: 'ui:card-tree-nav',       clear: b => { delete store.session.ui.cardTreeNav[b]; } },
  // … forestNav post-P0, boardCardTrees, pendingAnalysisAborts …
];
```

`closeBoard` drains this list instead of hand-wiring O1–O14; `resetWorkspace` could iterate it over `store.boards.map(b => b.id)` before resetting.

**The catch that the identity scope doesn't have:** ordering. The list above is *correct only if it preserves* (a) engine-stop before ledger-purge (`index.ts:374-377`), and (b) every Class B entry runs before `store.boards.splice` (`index.ts:429`). The identity registry encodes ordering by a one-line comment ("engine first") and a stable array order; that's adequate there because the only constraint is engine-first. For the board scope you'd be relying on array order to encode *two* constraints, one of which (the splice barrier) is a relationship to code *outside* the list. That's a real fragility: a future contributor appends a Class B purge to the *bottom* of the array, after some `delete`s, and it's still before the splice (fine) — but if anyone ever reorders the drain relative to the splice, every Class B purge silently evicts nothing (the board is already gone, `board.nodes` is unreachable). The registry **moves** the ordering knowledge from inline comments into an array's element order, which is *less* legible than the current heavily-documented inline sequence, not more.

**Where Tier 1 genuinely bites (the win):** "you forgot to register a new per-board surface." A new module-scope `Map<BoardId, …>` added next year, whose author forgets the `closeBoard` clause, leaks. The registry *plus the completeness test* is the only mechanism here that can mechanically catch that — but, crucially, **only the same way the identity test does**: the test must *enumerate the surfaces independently* and assert each is registered. The identity test can do this because it can, e.g., populate each cache, run `resetWorkspace`, and assert empty. A board test would have to create N boards, populate every per-board surface, close one, and assert that board's cells (and only that board's) are gone across all surfaces. That's a good test to have regardless of the registry — and it's worth noting **the test, not the registry, is what provides the guarantee.** The registry is just the drain site the test points at.

### Tier 2 — compile-time exhaustiveness over a closed key set

The maintainer's sharpest question: can the *compiler* (not a test) guarantee every scoped surface is handled? TypeScript's only exhaustiveness primitive is the `never`-default over a discriminated union (the codebase already uses it — `AuthState`, `frontend/CLAUDE.md:165-167`). To get exhaustiveness over *scoped surfaces*, you need the surfaces to be a **closed union you switch over**. Sketch:

```ts
type BoardSurface = 'reviews' | 'activeMode' | 'cardTreeNav' | 'forestNav'
                  | 'cardTrees' | 'ledger' | 'stability' | 'thumbnails'
                  | 'analysisQueries' | 'reviewAborts';

function tearDownSurface(s: BoardSurface, b: BoardId): void {
  switch (s) {
    case 'reviews':   delete store.session.reviews[b]; return;
    case 'ledger':    ledger.purgeBoard(b); return;
    // …
    default: { const _: never = s; void _; return; } // compiler forces every case
  }
}
const ALL_BOARD_SURFACES: readonly BoardSurface[] = [/* every literal */];
```

**Where this bites:** if a new surface is added to the `BoardSurface` union, the `switch` fails to compile until a case is added — genuine compile-time exhaustiveness on the *handling* side. **Where it can't reach — and this is fatal to the framing:** nothing forces the *new surface itself* to be added to the union. The union is a hand-maintained list of string literals; adding `store.session.ui.someNewNav` as a `PerBoard<T>` field does *not* make TS demand a `BoardSurface` entry. So the compiler checks "every listed surface is handled," never "every actual surface is listed." That second half — the one the maintainer actually wants ("every scoped surface is registered") — **is not reachable by TypeScript's type system at all**, because TS cannot enumerate "every field of every module that happens to be board-keyed." It has no reflection over the program's scoped-state population. This is the hard wall. The runtime-registry-plus-test (Tier 1) is strictly *more* capable here than the type system, because the test can do the enumeration the compiler can't.

So the honest answer to question 1 is: **partial yes on the handling side (the `never`-switch), hard no on the registration side.** The "enum-like exhaustiveness on scoping" the maintainer pictures — compiler guarantees *every scoped surface is registered* — is not achievable in TS for either scope. The closest real guarantee is the registry + completeness test, and that's a *test*, not a typecheck.

### Tier 3 — capability / make-illegal-states-unrepresentable

The maintainer's framing: "the only way to hold scoped state is to go through the registry, which confers — and obligates — its teardown." Can "scoped state without teardown" be made *unrepresentable* rather than merely *conventionally caught*?

The structural move is a **`Scoped<K, T>` handle that bundles storage with teardown and is the only constructor of per-board state**:

```ts
class Scoped<K, T> {
  private readonly cells = new Map<K, T>();
  constructor(private readonly init: () => T, registry: Scoped<K, unknown>[]) {
    registry.push(this);                       // registration is the constructor
  }
  getOrCreate(k: K): T { /* … */ }
  get(k: K): T | undefined { return this.cells.get(k); }
  teardown(k: K): void { this.cells.delete(k); } // teardown comes for free
}

const boardRegistry: Scoped<BoardId, unknown>[] = [];
const reviews = new Scoped<BoardId, ReviewSessionData>(emptyReview, boardRegistry);
// closeBoard: for (const s of boardRegistry) s.teardown(boardId);
```

Now "a per-board cell that nobody tears down" is genuinely unrepresentable for **anything constructed through `Scoped`** — registration is a constructor side-effect, teardown is a method the registry calls uniformly. This is the real "capability": holding the cell *is* holding the teardown obligation, structurally. It's the cleanest answer to question 2 in the abstract.

**But here is where it collides with this codebase's reality, and the collision is decisive:**

1. **Class B doesn't fit `Scoped<BoardId, T>` at all.** The ledger and stability store are *not* `Map<BoardId, T>` — they are `Map<`${hash}:${nodeId}`, T>`, and their teardown is "walk `board.nodes`, evict matching node entries, *before the splice*." You cannot model them as a `Scoped<BoardId, T>` cell because there is no per-board cell — the board's data is *scattered across a node-keyed family by configHash*. To fold them in you'd need `Scoped` to carry a `teardown: (boardId) => void` callback that does the walk, at which point `Scoped` is no longer "storage + teardown" — it's just the Tier-1 registry entry wearing a class. The "storage" half is a fiction for half the members.

2. **The store-resident Class A members can't move into a `Scoped` class without breaking persistence.** `reviews`, `activeMode`, `cardTreeNav`, `forestNav` live inside `GlobalStore` because **SyncService deep-watches `store.session` / `store.engine` and PUTs them**, and **`migrations.ts` migrates their shape** (schema-45 introduced `cardTreeNav`; P0's `forestNav` re-scope needs a migration, audit §6). A `Scoped<BoardId, T>` instance holding a private `Map` is *not* in the reactive persistence graph and *not* reachable by a schema migration. You'd be choosing between (a) keeping them in the store and excluding them from the capability (so the capability covers only the non-persisted module caches — i.e. only Class A's `boardCardTrees`, `pendingAnalysisAborts`, `analysisService`'s maps), or (b) moving persisted state out of the store into opaque handles and rebuilding the persistence + migration machinery around them. (b) is a large, risky refactor that fights ADR-0001's "one reactive `GlobalStore`" and the whole `migrations.ts` discipline (`frontend/CLAUDE.md:360-401`). It would *remove* the hand-wired `delete`s and *add* a serialization/migration shim — almost certainly a net code increase and a net coherence loss.

So the capability is real and beautiful *for the subset that is non-persisted, board-*keyed* module state* — and that subset is small (three or four members), already correctly torn down today, and not where the bugs are. The seed bug was a *misscoping* (`forestNav` global), not a *forgotten teardown*. The capability solves the teardown-forgetting problem, which **is not the problem the audit found.** The audit's §4 is explicit: "No leaks found in the PB data surfaces… this is the codebase's strongest area and is not the problem."

## 2. Partitioning-completeness vs visibility/trust (don't conflate — audit §8)

The audit §8 (and its closing) already lands the load-bearing distinction, and it's worth holding it firmly against the capability temptation:

- **Partitioning-completeness** = "is every board's cell torn down." This is the teardown-exhaustiveness question. It is the *only* thing a board registry/capability would address.
- **Visibility/trust** = "may board A observe board B's cell." For boards this is **a non-question** — boards are all one user's own data; there is no adversary, no `WHERE user_id =` analog. The one visibility-grade obligation in the SPA (clear-on-identity-flip, the `tenancy-instance-cache-leak` class) is the *identity* scope, and it is *already* handled by `IDENTITY_SCOPED_CACHES` + its test.

The trap a `Scoped<S, T>` lattice/functor invites (the external consult's framing the audit already declined) is importing visibility machinery — phantom types tying a value to a scope cell so a value from board A can't be read in board B's context — into a place with no trust boundary. That is pure cost: it would constrain perfectly legitimate cross-board reads (the tab strip iterating all boards, `boardsById`) with a guarantee that protects against nothing. **Branding board cells with a phantom `BoardId` lifetime (e.g. `Cell<B extends BoardId, T>`) is the novel angle the obvious framing reaches for — and for the board scope it's a solution to a problem the scope doesn't have.** Worth naming so it can be explicitly declined: it belongs to the *identity/tenant* trust boundary (which lives in the backend, in SQL, per audit §8's "board and tenant cannot share one functor here"), not here.

## 3. Novel angles worth recording (most for completeness, one with teeth)

- **Derive shape + reset + teardown from one closed key set.** The genuinely attractive "remove duplication" idea: if `BoardSurface` (Tier 2's union) were the *single source* from which the store shape, the `defaultSessionUI` reset, and the `closeBoard` drain were all generated, the three-places-to-edit problem (audit §6 P0 lists `types.ts` + `defaults.ts` + `closeBoard` + migration as the four edit sites for `forestNav`) would collapse to one. **But it can't be, for the same reason as Tier 2:** the persisted members need named struct fields (for migrations and the OpenAPI-adjacent typed store), not a generic `Record<Surface, …>`; and Class B isn't board-keyed. The closed-key-set generation works only for non-persisted, board-keyed module caches — again the small, already-clean subset.
- **Phantom/branded scope-lifetime types** — declined above; identity-scope concept, not board.
- **Effect/linear-type emulation of "obligation"** (a teardown you're forced to discharge) — TS has no linear types; the closest emulation is the `Scoped` constructor-registers pattern (Tier 3), whose limits are above. Not worth more machinery.
- **The one with teeth — a lint, not a type.** The registration half that TS can't check (Tier 2's wall) *is* checkable by a custom ESLint rule, the same way the codebase already gates the import-boundary (`eslint.config.js`, `frontend/CLAUDE.md:67-74`) and render-count. A rule "any property typed `PerBoard<T>` / `Map<BoardId, …>` must have a corresponding `closeBoard` teardown" is mechanically writable against the AST and would catch the forgotten-teardown case at lint time — the exhaustiveness the maintainer wants, delivered by the tool the project already uses for exactly this class of structural guard. This is the only mechanism that reaches the registration half *without* the persistence-refactor cost of Tier 3. It's still more machinery than `PerBoard<T>` + a test, and it's only worth it if forgotten-teardown is judged a live risk (it isn't today). Recording it because it's the honest answer to "can a *lint* guarantee it" — yes, where the type system can't.

## 4. Blunt verdict

**Is there a real, code-removing refactor here?** A small one, yes — and it is exactly the audit's P1b, *bounded to Class A and read honestly*: a `BOARD_SCOPED_TEARDOWNS` registry that collapses the `delete store.session.reviews[b]` / `delete store.engine.activeMode[b]` / `delete store.session.ui.cardTreeNav[b]` / `removeBoardCardTree` / `pendingAnalysisAborts` / `analysisService` clears into one drained list, mirroring `IDENTITY_SCOPED_CACHES`. That removes the hand-wired enumeration and unifies the two teardown disciplines under one shape. It's worth doing **only if** you accept two compromises stated plainly:

1. **Class B (ledger, stability, thumbnails) stays out of the registry, or enters it only as opaque `clear: (b) => void` callbacks with the splice-ordering constraint preserved by a comment** — because they're node-keyed, board-*derived*, and ordering-bound to `store.boards`. Folding them in does not simplify them; it relocates their ordering knowledge from well-documented inline code into array position, which is a legibility *regression*. My recommendation: keep Class B as explicitly-ordered inline calls in `closeBoard` (as today), and let the registry cover only Class A. That's a smaller, honest win.
2. **The guarantee comes from the completeness *test*, not the registry or the types.** Add the board analog of the identity tenancy test (create boards, populate every Class A surface, close one, assert its cells gone). That test is worth writing *whether or not* you build the registry — and it, not any type, is what makes "forgot a teardown" catchable.

**What would be over-engineering** (say it plainly): the `Scoped<S, T>` capability class that makes scoped-state-without-teardown unrepresentable; any phantom/branded `BoardId`-lifetime type; deriving the store shape from a closed key set; and most of all *any* attempt to unify board and identity under one generic `Scoped`/`PerScope` functor. All of them founder on the same two rocks — **persisted store members can't leave the reactive/migration graph, and Class B isn't board-keyed** — and all of them add abstraction to solve a forgotten-teardown problem the audit found *does not exist* in this codebase (§4: "the codebase's strongest area"). The capability is elegant in the abstract and a poor fit for these specific surfaces.

**The honest bottom line, in the maintainer's own terms:** the registry-as-capability instinct is right *as a reading* of `IDENTITY_SCOPED_CACHES` — it is an arrow `label → clear`, and going through it *does* confer-and-obligate teardown. But generalizing it to the board scope buys legibility, not safety, and only for a minority of the surfaces; the safety the maintainer pictures (compile-time "every scoped surface registered") is unreachable in TS and is, in any case, guarding a door no leak walks through here. Do `PerBoard<T>` (Tier 0, free), add the board completeness test (the real guarantee), and adopt the Class-A-only registry (P1b) if and only if you find the hand-wired `delete`s actively annoying — not because it prevents a bug, but because it reads better. Stop there. Everything past that is more machinery than this codebase repays.

---

**Memo complete.** Key grounding files (all absolute): `/home/bork/w/omega/frontend/src/store/index.ts` (closeBoard `:371-438`, `IDENTITY_SCOPED_CACHES` `:477-485`, resetWorkspace `:573-608`), `/home/bork/w/omega/frontend/src/types.ts` (`UISession` `:1342-1501`, `PerBoard`-shaped members `reviews` `:1815` / `activeMode` `:1886` / `cardTreeNav` `:1500`), `/home/bork/w/omega/frontend/src/composables/cards/board-card-trees.ts`, `/home/bork/w/omega/frontend/src/services/analysis-ledger.ts` (`purgeBoard` `:255-258`, the Class B board-derived shape), `/home/bork/w/omega/frontend/src/services/analysis-service.ts` (`boardToQueries` `:117`), `/home/bork/w/omega/frontend/src/composables/review/useReviewSession.ts` (`pendingAnalysisAborts` `:68`).

The single load-bearing finding: the board scope's teardown sites split into **board-keyed containers** (registry-able) and **board-derived node-keyed purges** (not — they walk `board.nodes` and are ordering-bound to the splice), so no uniform `Scoped<BoardId, T>` covers them; combined with the fact that the persisted members can't leave the reactive/migration graph, the capability/unrepresentable-states framing is more machinery than it repays. The real, modest win is `PerBoard<T>` + a board completeness test + an optional Class-A-only teardown registry — and the guarantee the maintainer wants comes from the test, not the type system (which cannot enumerate "every scoped surface" to check registration).
````
