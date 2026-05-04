# closeBoard severs the board's in-flight analysis subscription

- **Status:** Shipped on `frontend/close-board-stops-analysis`,
  2026-05-04. Single-call-site fix in `src/store/index.ts`'s
  `closeBoard`; build green. Files the resource-ownership audit
  plan as the lesson-learned home and a Medium-tier TODO entry
  pointing at it.
- **Genre:** Bug fix — silent compute leak; plus the audit-
  scheduling artifact that captures the generalised lesson.
- **Date:** 2026-05-04.

## Context

Symptom: start ponder on Tab A, switch to Tab B, close Tab A.
The ponder keeps running. The proxy's `query_version` watchdog
keeps the WebSocket alive (it's shared across all the SPA's
boards in the same browser tab), so the keep-alive middleware
shipped in proxy v1.0.10 doesn't fire either; the canonical
keeps pondering for a board that no longer exists in the
workspace.

The mechanic: `closeBoard` in `src/store/index.ts` spliced the
board out of `store.boards` and adjusted `activeBoardIndex`, but
**never called `analysisService.stopBoardAnalysis`**. The
analysis-service kept the closed board's `boardId` in its
`activeQueryIds` / `activeSubscriptions` / `restartCallbacks`
maps; the proxy kept the subscription; the LEAF kept pondering.

Surfaced during post-deployment verification of the keep-alive
dispatch's Phase 1 / Phase 2 work — initially confused with a
proxy issue, then traced back to the SPA-side close path having
no terminate at all.

## What changed

`frontend/src/store/index.ts`. Two adjustments:

1. **The fix.** `closeBoard(boardId)` calls
   `analysisService.stopBoardAnalysis(boardId)` as the first line,
   before any state mutation. `stopBoardAnalysis` short-circuits
   when the board has no active analysis (its bookkeeping has no
   entry for the boardId), so the call is safe in all states. The
   import of `analysisService` from `../services/analysis-service`
   creates a static circular dependency with the service (which
   already imports `store` and `pushSystemMessage` from `store`);
   ES module live-binding handles the circularity correctly because
   neither module accesses the other's exports at top-level
   evaluation time.

2. **ADR-0006 header retrofit.** The file's existing header had
   the path and a brief purpose but no license declaration; while
   touching the file under full visibility, retrofitted to the
   standard form. The purpose statement is also expanded to name
   the orchestrator-vs-pure-mutator distinction and explain why
   the module imports a service (closeBoard's downstream cleanup).

The closeBoard function's docstring is expanded to name the
relationship being severed and to cross-reference the audit plan
that schedules the rest of this kind of cleanup.

## Why the closeBoard call site (and not the SidebarWidget call site)

`closeBoard` is the single call site for board removal in the
codebase today (`@close="closeBoard(board.id)"` in
`SidebarWidget.vue:54`). The fix could have lived at either site:

- **At the SidebarWidget call site** (the "cleaner" layering — a
  component orchestrating service + store): future closers must
  remember to call `stopBoardAnalysis` first.
- **Inside `closeBoard`** (the "right way" relative to robustness):
  any future caller gets the cleanup automatically.

`closeBoard` was already an orchestrator function (special-case
for last board, active-index-shift logic) rather than a pure
setter, so giving it the analysis-cleanup orchestration is
consistent with what it already does. The robustness argument
won: a silent leak is the worst kind of regression to catch, and
the layering "violation" (store → service) is acceptable given
that services already mutate store state in the other direction.

## The lesson — and the audit it schedules

The closeBoard bug is one instance of a pattern: workspace
entities (boards, sessions, identities, mounted components)
implicitly own external resources (proxy subscriptions, ledger
entries, persistence rows, timers, listeners) that live beyond
Vue's reactivity graph. Vue cleans up watchers and component
state automatically; nothing cleans up those external
relationships unless we wire it explicitly.

The full lesson — including the taxonomy question (owner-resource
vs protocol-state vs subscription framing), the seed inventory of
suspected open pairs, the pass structure (Pass 1 inventory, Pass 2
per-pair fix-or-doc, Pass 3 forward-authoring discipline), and the
bisect discipline (one fix per commit, more granular than the
magic-literals audit's per-tier batching) — is captured in
`docs/notes/resource-ownership-audit-plan.md`. A Medium-tier
priority entry in `docs/TODO.md` points at the plan.

The audit's Pass 1 will expand the seed inventory; Pass 2 will
ship per-pair fixes (each in its own commit); Pass 3 will codify
the inline-comment convention and the authoring checklist. The
prompting case study (this PR) closes the first inventory entry
and is named in the plan as such.

## Verification

- `npm run build` (vue-tsc + vite build) clean. The static
  circular import between `store/index.ts` and
  `services/analysis-service.ts` compiles and bundles without
  warnings.
- Manual reproduction (pre-fix): start ponder on Tab A, switch
  to Tab B, close Tab A. Pre-fix: GPU utilisation stays high;
  proxy log shows the canonical still active. Post-fix: GPU
  drops within ~1 second; proxy log shows the terminate dispatch
  for the closed board's queryId.
- Non-regression: closing a board that has no active analysis
  works identically to the pre-fix path (`stopBoardAnalysis`
  short-circuits cleanly).

## Forward notes

- The audit plan's bisect discipline (one fix per commit) is the
  reason this PR closes only the analysis-subscription pair and
  not the sibling `purgeBoard` call that should also fire from
  `closeBoard`. The ledger-purge fix is its own entry in the
  audit's Pass 2 and ships in its own commit when that pair is
  swept.
- The HMR cleanup TODO entry (Trivial tier, priority) is a
  sibling of this audit — the singleton `analysisService`'s
  WebSocket / timers are the "resources" owned by the
  module-singleton "owner", and HMR module reload is the "owner
  mutation". The audit plan flags this as already-tracked rather
  than re-enumerating it.
