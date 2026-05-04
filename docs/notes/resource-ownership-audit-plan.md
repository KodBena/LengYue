# Resource-ownership audit plan

- **Status:** Proposed. First pass not yet executed; this document
  is the schedule, not a record of completed work. The first
  inventory entry (board → in-flight analysis subscription) closed
  on 2026-05-04 in `closeBoard`'s call site as the prompting case
  study; the audit's purpose is to catch the rest.
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

## Seed inventory

The pairs below are starting points. The audit's Pass 1 expands
this list; the inventory itself is part of the deliverable.

### Closed in the prompting fix (do not re-audit)

| Owner | Resource | Resolution | Commit |
|-------|----------|------------|--------|
| Board (closed via `closeBoard`) | In-flight analysis subscription at the proxy | `closeBoard` calls `analysisService.stopBoardAnalysis(boardId)` | 2026-05-04 (this PR) |

### Suspected open (audit Pass 2 verifies and fixes per-pair)

| Owner | Resource | Audit Pass-2 question | Notes |
|-------|----------|----------------------|-------|
| Board (closed via `closeBoard`) | Analysis-ledger entries keyed by `(configHash, nodeId)` for the closed board's nodes | Does anything call `ledger.purgeBoard(boardId)` from `closeBoard`? Spot-check says no — `purgeBoard` is only called from the per-board "stop" affordance in `AnalysisControls.vue:15`. | Same shape of bug as the in-flight subscription. Sibling commit. |
| Board (closed via `closeBoard`) | `store.session.reviews[boardId]` review-session entry | Is the review-session row deleted on board close, or does it leak in `store.session.reviews`? | Memory leak (small); also potential identity confusion if a recreated board ever reuses a `BoardId` (shouldn't happen since `BoardId` is freshly generated, but worth confirming). |
| Board (closed via `closeBoard`) | Thumbnail-cache entries in `useThumbnailCache` | Does the cache evict the closed board's thumbnails? | Memory leak (per-thumbnail SVG payloads). |
| Identity (cleared via logout / identity change) | All-of-the-above on logout, plus the live KataGo WebSocket connection | The deferred case explicitly named in `store/index.ts`'s comment on `resetUserOwnedState`: "When deployment shifts to user-keyed endpoints (cloud-compute, rented per-user engines), full engine reset + actual `analysisService.disconnect()` becomes the right move." | The current single-machine deployment makes the leak benign. A future hosted deployment promotes it to a real correctness concern. |
| HMR module reload | `analysisService` singleton's WebSocket + `metricsTimer` + `watchdogTimer` | Already filed as the priority TODO entry in the Trivial tier (`import.meta.hot.dispose` callback). Audit notes this as already-tracked. | The HMR cleanup item is the dev-loop hygiene companion to the proxy's keep-alive middleware (production safety net). |
| Component unmount (Vue lifecycle) | DOM-level event listeners attached via `addEventListener` from inside `<script setup>` (search for `addEventListener` outside `onMounted`/`onUnmounted` pairings) | Spot-check existing components for the pattern. | Scoped to a Pass-2 sub-sweep. |

### Out-of-scope (initially)

- **Backend-side resources** (cards, documents, game_sources). Those are owned by the backend's tenancy spine, not the SPA's workspace; their lifecycle is the backend's concern.
- **The proxy's own internal cleanup**. The proxy's coalescing-transparency, hub orphan-termination, and keep-alive middleware ship in v1.0.7-v1.0.11 and close the SPA-disconnect path. The audit's scope is SPA-side cleanup that prevents leaks from arising in the first place.
- **Browser-process resource cleanup** on tab close. The browser handles WS teardown, timer cleanup, etc. on tab close; the SPA can't and shouldn't try to.

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
