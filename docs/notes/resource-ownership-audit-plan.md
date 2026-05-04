# Resource-ownership audit plan

- **Status:** Pass 1 closed 2026-05-04; the inventory below is the
  deliverable. Pass 2 (per-pair fix-or-doc) and Pass 3 (forward-
  authoring discipline) remain pending. The first inventory entry
  (board → in-flight analysis subscription) closed earlier on the
  same day in `closeBoard`'s call site as the prompting case study.
- **Genre:** Audit plan, modelled on
  `docs/notes/magic-literals-audit-plan.md`'s tiered structure.
- **Tracking:** A row in `docs/TODO.md` (Medium tier) points here.

## Why this exists

A bug surfaced 2026-05-04: closing a board tab in the SPA spliced
the board out of `store.boards` without ever issuing a `terminate`
for the in-flight ponder query. The proxy's keep-alive middleware
couldn't help — the WebSocket was still healthy because it's
shared with the surviving boards — so the canonical kept running
on the LEAF for a board that no longer existed in the workspace.
A silent compute leak with no in-app symptom; only GPU monitoring
would surface it.

The fix was small (one call to `analysisService.stopBoardAnalysis`
at the top of `closeBoard`). The lesson is larger: the SPA holds
many implicit relationships between workspace entities (boards,
sessions, identities, mounted components) and resources that live
beyond Vue's reactivity graph (proxy subscriptions, ledger entries,
backend persistence rows, timers, listeners, KataGoClient
subscriptions). Vue cleans up watchers and unmounts components
automatically; nothing cleans up those external relationships
unless we wire it explicitly. The closeBoard bug is one instance of
a pattern the codebase has not been audited for.

## The pattern, named

A **workspace mutation** removes or replaces an entity that owned
external resources. The mutation is local to the SPA's reactive
state, but the resources it owned live elsewhere — at the proxy,
on the backend, in service-singleton bookkeeping, in module-scope
caches. Without explicit cleanup at the mutation site, the resources
become orphaned: still alive in the system that owns them, no
longer addressable from the SPA, and silent about their orphanhood.

The fix shape is uniform: at the workspace mutation, before or
during the state change, notify the resource-holder so the
resource is released. The audit's job is to enumerate every such
ownership relationship in the codebase and verify the cleanup is
wired.

## Primary taxonomy — owner-resource framing

Three framings of "in-flight query is a thing that needs cleanup"
were considered:

- **Owner-resource framing.** "Board owns these queries; close board
  → release queries." Audit pivot: per-owner-entity. Catches
  closeBoard, identity-switch on logout, workspace-reset on
  identity loss, component unmount when the component owns
  external state.
- **Protocol-state framing.** "Each in-flight query is a contract
  between SPA and proxy that demands a closing wire message."
  Audit pivot: per-wire-action. Would catch the same closeBoard
  bug from a different angle, plus things like WS reconnect
  without re-issuing in-flight terminates and SPA-side message
  losses on disconnect.
- **Subscription framing.** "Anything `addEventListener` /
  `setInterval` / `subscribe` / `watch(...)` produces needs a
  paired dispose." Audit pivot: per-service or per-API. Catches
  service-singleton timer leaks, listener leaks on dynamic
  components, abandoned watchers.

These overlap heavily in practice but surface different residual
bugs first. **The primary framing of this audit is owner-resource**,
because it pivots on identifiable lifecycle events (closeBoard,
logout, workspace reset, route change) and is the framing the
prompting bug naturally lives in. The audit explicitly
acknowledges that follow-up sweeps under the protocol-state and
subscription framings will catch additional residue and should be
scheduled separately when the owner-resource sweep completes —
they are not redundant.

## Inventory

Pass 1 closed 2026-05-04; the table below is the deliverable. The
walk covered `src/store/`, `src/services/`, `src/composables/`,
`src/components/`, and `src/engine/katago/katago-client.ts` under
the owner-resource framing of §"Primary taxonomy". The plan's grep
heuristics all ran. The result is **6 owner-mutation sites**
(closeBoard, resetWorkspace, identity-change-via-watcher, HMR
dispose, component unmount, engine WS disconnect) and **~25
owned-resource pairs** across them. 17 are closed (the seed plus
15 already-clean cleanups confirmed during the walk); 15 are
suspected open and break out by mutation site below. Pass 2
schedules per-pair fixes per the bisect discipline.

### Closed (do not re-audit)

The seed entries plus cleanups verified during the walk that
already have explicit teardown wired:

| # | Owner | Resource | Resolution | Reference |
|---|-------|----------|------------|-----------|
| C1 | Board (closeBoard) | In-flight analysis subscription at proxy (per-board entry in `activeQueryIds` / `activeSubscriptions` / `restartCallbacks`; LEAF canonical) | `closeBoard` calls `analysisService.stopBoardAnalysis(boardId)` first | 2026-05-04 — prompting case study; `store/index.ts:138` |
| C2 | HMR module reload | `analysisService` singleton's WS + `metricsTimer` + `watchdogTimer` + per-board bookkeeping | `import.meta.hot.dispose` calls `stopAllBoardAnalyses()` then `disconnect()` | 2026-05-04; `services/analysis-service.ts:324-329` |
| C3 | Identity flip (auth → not-auth) | qEUBO operational state (`_statusRef`, `_pairRef`, `_bestRef`, `_calibrationEnabledRef`, `_isBusyRef`) | `useAppBootstrap` auth-watcher calls `qeubo.reset()` | `composables/useAppBootstrap.ts:72-83`, `composables/useQeubo.ts:391-397` |
| C4 | Identity flip (auth → not-auth) | Workspace state in GlobalStore (boards, profile, session sans engine) | `SyncService.onAuthStateChange` calls `resetWorkspace()` | `services/sync-service.ts:110-129` |
| C5 | `useAuth.logout()` / 401 on non-auth path | localStorage JWT + cached username | `api.clearToken()`; api-client invokes `onTokenInvalidatedCallback` for the 401 path | `services/api-client.ts:194-202`, `composables/useAuth.ts:88-93,299-303` |
| C6 | Engine WS disconnect (LEAF/proxy drops) | `metricsTimer` + `watchdogTimer` + `activeMode` clear | `KataGoClient.onDisconnect` callback in analysis-service | `services/analysis-service.ts:50-54` |
| C7 | Component unmount: `BaseChart` | ECharts instance + ResizeObserver | `onUnmounted` dispose + disconnect | `components/charts/BaseChart.vue:327-333` |
| C8 | Component unmount: `HeatmapChart` | ECharts instance + ResizeObserver + initTimeout | `onUnmounted` clears all three | `components/charts/HeatmapChart.vue:166-170` |
| C9 | Component unmount: `HorizontalTimelineVisualizer` | document mousemove/touchmove/mouseup/touchend listeners installed during drag | `onUnmounted(() => stopDragging())` | `components/HorizontalTimelineVisualizer.vue:283` |
| C10 | Component unmount: `useScopedScroll` | wheel / mouseenter / mouseleave listeners + rafId | `onUnmounted` | `composables/useScopedScroll.ts:46-55` |
| C11 | Component unmount: `useUserIORegistry` | window keydown listener | `onUnmounted` | `composables/useUserIORegistry.ts:99` |
| C12 | Component unmount: `useTransientLogReveal` | reveal-window setTimeout | `onUnmounted` | `composables/useTransientLogReveal.ts:73-75` |
| C13 | Component unmount: `useActivityDecay` | requestAnimationFrame id | `onUnmounted` | `composables/useActivityDecay.ts:27-29` |
| C14 | Component unmount: `use-pv-animation` | per-stone fade timers (and cycle-boundary timer-array reset) | `onUnmounted(clearTimers)` | `composables/use-pv-animation.ts:257` |
| C15 | Component unmount: `useEChartsForestRender` | per-tree ECharts instances + ResizeObservers | `onUnmounted` destroys all | `composables/useEChartsForestRender.ts:183-185` |
| C16 | `loadCard` / `processUserMove` boundary in `useReviewSession` | per-board `AbortController` for in-flight analysis-wait | abort+delete on card transition; map.delete on settle when slot still owned | `composables/useReviewSession.ts:163-164,263-264,284-286` |
| C17 | `KataGoClient.subscribers` map (per-queryId) | callback registration + map-shrink-on-empty | unsub returned from `client.subscribe`, called by `stopBoardAnalysis`; `sendCommand` uses subscribe-then-unsub on first response | `engine/katago/katago-client.ts:102-122,124-131` |

### Suspected open

Per the bisect discipline (§"Bisect discipline"), each row below
ships as its own Pass-2 commit even when multiple rows share an
owner-mutation site. The Disposition column is a hint for Pass 2,
not a binding decision; per-pair the choice is fix / document /
defer.

#### Owner = Board (mutation site: `store/index.ts:closeBoard`)

| # | Resource | Pass-2 question | Disposition |
|---|----------|-----------------|-------------|
| O1 | Analysis-ledger entries keyed by `(configHash, nodeId)` for the closed board's nodes — both `data` and `nodeVersions` | `closeBoard` does not call `ledger.purgeBoard(boardId)`; `purgeBoard` is only invoked from `AnalysisControls.vue:15`. | Same shape as C1. **Sub-finding:** `purgeBoard` itself is incomplete — `analysis-ledger.ts:183-197` deletes from `data` but only bumps `nodeVersions`, so `nodeVersions` leaks even after the user clicks Purge. Worth a separate sub-commit. |
| O2 | `store.session.reviews[boardId]` review-session row | Should `closeBoard` `delete store.session.reviews[boardId]`? | Small memory leak; gets round-tripped to backend via SyncService (it persists `store.session` deeply), so dead entries accumulate in the user's document. |
| O3 | `store.engine.activeMode[boardId]` — set to `'none'` by `stopBoardAnalysis` but the key persists in the Record | Delete the key, or accept the `'none'` tombstone? | Tombstone is read-side benign; persisted via SyncService same as O2. Probably fix as part of O2's commit. |
| O4 | `useThumbnailCache` module-scope cache entries (`Map<string, string>` keyed `${nodeId}:${showMarker}`) for the closed board's nodes | Does the cache evict on board close? | Memory leak per-SVG. Cache is a module singleton with no per-board purge affordance — Pass 2 needs to add one (`purgeBoard(boardId)` on the composable surface) and call from `closeBoard`. |
| O5 | `useReviewSession.pendingAnalysisAborts` entry for the closed board | If the user closes a board mid-review, the `AbortController` stays mapped. | Small leak; downstream `waitForAnalysis` will time out and the controller becomes GC-eligible. Worth confirming by Pass-2 trace. |
| O6 | `KataGoClient.subscribers` entries for the closed board's still-active queries | Verify no path leaves a queryId in `subscribers` because the unsub closure was never invoked. Likely already correct via `stopBoardAnalysis` (C17), but the protocol-state framing in §"Primary taxonomy" suggests this is the right Pass-2 trace. | Cosmetic / verification only if the trace confirms. |

#### Owner = Identity / Workspace (mutation site: `store/index.ts:resetWorkspace`)

| # | Resource | Pass-2 question | Disposition |
|---|----------|-----------------|-------------|
| O7 | `analysisService` per-board maps (`activeSubscriptions`, `activeQueryIds`, `activeQueries`, `restartCallbacks`) keyed to the prior user's BoardIds | `resetWorkspace` replaces `boards` wholesale; it does NOT release the analysis-service's per-board bookkeeping or fire terminate frames. | `stopAllBoardAnalyses()` already exists (added for HMR). Wiring it into `resetWorkspace` closes this without touching the WS. The deferred `analysisService.disconnect()` discussed in `resetWorkspace`'s docstring is a strict superset and remains deferred per the same "user-keyed endpoints" trigger. |
| O8 | `analysisLedger.data` and `nodeVersions` maps | Ledger holds prior user's analysis packets indexed by NodeId across the resetWorkspace boundary. NodeIds are UUID-shape so cross-user collision is unlikely, but memory grows monotonically. | Same family as O7. Either flush on `resetWorkspace` (add `ledger.purgeAll()`), or document the deferral with the same "revisit when" trigger as the WS-disconnect deferral. |
| O9 | `useThumbnailCache` module-scope cache | Same shape as O8. | Same disposition. |
| O10 | `useCardThumbnail` module-scope `cache: Map<number, string>` keyed by raw CardId | **Privacy-relevant**: CardIds are integer auto-increments per the backend; cross-user collision is *likely*, so the next user could see the prior user's card render via the memo. | Add `clearCache()` to `useCardThumbnail` and invoke from `resetWorkspace`. Single-machine deployment makes this latent today; multi-tenant deployment surfaces it. |
| O11 | `useReviewSession.pendingAnalysisAborts` (App.vue-scoped, so effectively a singleton across resetWorkspace) | If `resetWorkspace` fires mid-review, the controller stays mapped to a now-defunct BoardId. | Bounded; same shape as O5. |

#### Owner = Component lifecycle (mutation site: `onUnmounted` or its absence)

| # | Resource | Pass-2 question | Disposition |
|---|----------|-----------------|-------------|
| O12 | `useResizablePanel`'s document `mousemove`+`mouseup` listeners and `body.classList.add('resizing')` | `useResizablePanel.ts` has no `onUnmounted`. If the host SFC unmounts mid-drag (HMR, route change), the global listeners persist and the body keeps the resizing class. | Mirror the `HorizontalTimelineVisualizer` shape: `onUnmounted(stopResize)`. ~3 lines. |
| O13 | `BaseChart` `markerTimer` (debounced marker update setTimeout) | `onUnmounted` disposes chart + ResizeObserver but doesn't `clearTimeout(markerTimer)`. The callback fires post-unmount and reads a now-null `chartInstance` — a no-op, not a crash. | Trivial — add `if (markerTimer) clearTimeout(markerTimer)` to onUnmounted for completeness. |
| O14 | `MintCardModal` `window.setTimeout` for `hideSuggestionsDelayed` | If the modal closes within 150ms of input blur, the callback writes to `showSuggestions.value` on a torn-down component. Vue ref closure stable, write is a no-op. | Benign. Either ignore or store the handle and clear in `onUnmounted`. |

#### Owner = Engine WS reconnect

| # | Resource | Pass-2 question | Disposition |
|---|----------|-----------------|-------------|
| O15 | `analysisService` per-board bookkeeping (`activeSubscriptions` closures over a now-dead WS, `activeQueryIds`, `activeQueries`, `restartCallbacks`) | `onDisconnect` clears timers and `activeMode = {}` but does NOT clear the per-board maps. On reconnect, each new `analyzeRange` calls `stopBoardAnalysis(boardId)` first, which overwrites — so the stale maps hold no-op closures rather than causing misbehavior. | Cosmetically wrong; investigate Pass-2 whether any user-visible misbehavior exists on reconnect. If not, document the as-designed state. |

### Out-of-scope (initially)

- **Backend-side resources** (cards, documents, game_sources). Those are owned by the backend's tenancy spine, not the SPA's workspace; their lifecycle is the backend's concern.
- **The proxy's own internal cleanup**. The proxy's coalescing-transparency, hub orphan-termination, and keep-alive middleware ship in v1.0.7-v1.0.11 and close the SPA-disconnect path. The audit's scope is SPA-side cleanup that prevents leaks from arising in the first place.
- **Browser-process resource cleanup** on tab close. The browser handles WS teardown, timer cleanup, etc. on tab close; the SPA can't and shouldn't try to.

### Pass-1 closeout notes

**Doc-graph drift surfaced during the walk.** This plan's prior
seed-inventory row for "Identity (cleared via logout / identity
change)" referenced `store/index.ts`'s comment on
`resetUserOwnedState`; the actual function is named `resetWorkspace`
(`store/index.ts:187`), and the file's own header still carries the
legacy name. The seed row was rewritten to use the correct name in
the inventory above; the file-header drift is a Pass-2 candidate
that will land alongside the O7/O8/O9/O10 commits which touch this
site anyway. Per ADR-0005 (single source of truth) and ADR-0004
(minimal-touch), the retrofit is deferred rather than swept.

**Forward note for Pass 3.** A recurring shape emerged from the
walk: per-entity `Map`/`Set` state in a service or composable
singleton reliably gets a `dispose`/`disconnect` cleanup path, but
inconsistently gets an entity-removal cleanup path. The Pass-3
inline-comment convention should specifically name "what does this
owner own?" at the mutation function's docstring; closeBoard's
expanded 2026-05-04 docstring is the worked example to mirror.

## Pass structure

### Pass 1 — Inventory

Walk the codebase systematically and complete the inventory above.
The output is a fully-enumerated table; no fixes ship in Pass 1.

Search heuristics:
- `grep -rn "splice\|filter\|delete " src/store/`: find workspace
  mutations that remove or replace entities.
- `grep -rn "Map\(\)\|new Map\b" src/services/`: find service-side
  per-entity bookkeeping (the analysisService pattern).
- `grep -rn "store\\..*\\[boardId\\]" src/`: find per-board state
  accesses that suggest per-board ownership.
- `grep -rn "addEventListener\|setInterval\|setTimeout" src/`:
  find subscription-shape resources.

### Pass 2 — Per-pair fix or doc

For each owner-resource pair in the inventory, either:

1. **Fix.** Wire the cleanup at the owner-mutation site, with an
   explanatory comment that names the relationship being severed.
   One commit per pair, per the bisect discipline.
2. **Document why no cleanup is needed.** If the pair is truly
   benign (e.g., the resource is reachable only via the owner and
   gets garbage-collected when the owner is dropped), name the
   reason in code or in this audit plan.
3. **Defer with a recorded reason.** If the cleanup is structurally
   correct but operationally deferred (e.g., the
   `analysisService.disconnect()` deferral on identity change for
   the current single-machine deployment), the deferral and its
   "revisit when" trigger go into the comment.

### Pass 3 — Forward-authoring discipline

After Pass 2, codify the discipline so new owner-resource pairs
introduced by future PRs are wired correctly at authoring time
rather than caught by a future audit. Two complementary outputs:

1. **Inline comment convention.** When a workspace-mutation
   function releases a resource, the cleanup line carries a
   short comment that names the resource and the reason
   (e.g., the closeBoard fix's `// Sever the analysis-subscription
   resource the closing board owns.`).
2. **Authoring checklist.** The PR template (or a `frontend/CLAUDE.md`
   addendum, depending on what ships in adjacent work) names
   "what does this owner own?" as a question to ask when adding
   a new entity type or a new mutation that removes one.

The codified convention ships as the audit's close-out, analogous
to the magic-literals audit's "Comment convention" section.

## Bisect discipline — one fix per commit

The audit must keep `git bisect` exact for resource-management
regressions. **Each owner-resource pair gets its own commit**,
even when multiple pairs share an owner (e.g., closeBoard might
end up calling three different cleanup paths for three different
resources; each addition lands in its own PR-or-commit).

This is more granular than the magic-literals audit's per-tier
batching. The reason is that resource-management bugs typically
manifest as silent runtime behaviour that's invisible until
operational monitoring catches them — bisect is often the only
way to localise the regression to a specific change. Coarser
batching erodes that signal.

## Cross-references

- Prompting case study: `docs/worklog/2026-05-04-close-board-stops-analysis.md`.
- Frontend HMR cleanup TODO (Trivial tier, priority): the
  `import.meta.hot.dispose` callback for `analysisService`. Same
  family of bug (resource owned by the singleton; HMR reload is
  the "owner mutation"); already tracked separately.
- Proxy-side compute-leak safety net: the keep-alive dispatch's
  Phases 1-3 (proxy v1.0.7-v1.0.11), closing the wire-protocol
  side of the same problem. The SPA-side audit complements rather
  than duplicates that work — it prevents leaks at the source
  while the proxy catches the residue from causes the SPA can't
  control (genuine network failures, kernel-level WS losses).
