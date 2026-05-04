# HMR dispose for `analysisService` singleton

- **Status:** Shipped on `frontend/hmr-dispose-analysis-service`,
  2026-05-04. One file touched
  (`src/services/analysis-service.ts`); build green. Closes the
  Trivial-tier priority TODO entry (filed 2026-05-03 as the
  dev-loop hygiene companion to the proxy's keep-alive
  middleware) and the HMR row in the resource-ownership audit
  plan's seed inventory.
- **Genre:** Bug fix — silent dev-loop compute leak; closes the
  second seed-inventory row of the resource-ownership audit
  (`docs/notes/resource-ownership-audit-plan.md`) per its
  one-fix-per-commit bisect discipline.
- **Date:** 2026-05-04.

## Context

Vite HMR re-instantiates this module's singleton when
`analysis-service.ts` (or one of its transitive dependencies) is
hot-replaced. Without an explicit dispose hook, the outgoing
singleton's WebSocket and per-board bookkeeping become orphaned:
the new singleton starts fresh with empty
`activeQueryIds`/`activeSubscriptions`/`restartCallbacks`, but
the old singleton's in-flight ponder queries never receive a
client-side `terminate`. The proxy's keep-alive middleware
(shipped at proxy v1.0.10) is the production safety net for the
same class of stranded compute, but the dev-loop path was leaking
on every HMR roll in development.

The original TODO entry framed this as the dev-loop hygiene
companion to the proxy work; the keep-alive watchdog at v1.0.10
catches the residue from any cause (HMR, network freeze, browser
crash, controlled disconnect with WS still nominally open), and
the SPA-side cleanup closes the cleanest path for the HMR-
specific case.

## What changed

`src/services/analysis-service.ts`. Two additions:

1. **New public method `stopAllBoardAnalyses()`.** Snapshots
   `activeQueryIds.keys()` into an array (the snapshot is
   necessary because `stopBoardAnalysis` mutates the underlying
   map during iteration), then walks each `boardId` through
   `stopBoardAnalysis`. Safe to call from any context that wants
   to release every per-board analysis resource the singleton
   holds; not just the HMR caller.

2. **Dev-only `import.meta.hot.dispose(...)` block at the bottom of the module.** Calls `analysisService.stopAllBoardAnalyses()` followed by `analysisService.disconnect()`. Order matters: emit per-board terminate packets while the WebSocket is still open, then close the WebSocket. The `import.meta.hot` conditional is undefined in production builds and statically removable by Vite's tree-shaker, so the whole hook is dev-only.

The block carries an explanatory comment naming the two ordering invariants (terminates before disconnect; the conditional is dev-only).

## Why both terminate AND disconnect

The proxy's Phase-1 disconnect-side cleanup (shipped at proxy
v1.0.7) terminates orphaned canonicals when `_cleanup` fires —
so technically a bare `disconnect()` would still produce the
correct end-state at the LEAF. The reason to emit explicit
terminates first:

- **The two paths semantically differ.** Explicit terminate per
  active query is the application-level "I no longer want this
  result" signal; disconnect orphan-cleanup is the proxy's
  best-effort defense against impolite clients. The dev-loop
  flow should look impolite-client only when the application
  has a real reason to (a process crash, not a normal HMR
  reload).
- **Coalescing-transparency (Phase 2).** When the dev session
  has multiple coalesced subscribers and HMR fires, explicit
  per-board terminates respect coalescing isolation: each
  subscriber's view ends cleanly without affecting the others.
  The disconnect path's orphan cleanup happens at the canonical
  level, terminating the LEAF regardless of subscriber count
  (correct on full disconnect; wasteful when only some
  subscribers are leaving).
- **Future-proofing.** If the SPA grows additional pre-disconnect
  cleanup steps (debounced sync flush, etc.), the
  stopAllBoardAnalyses → disconnect ordering becomes the natural
  scaffold to add them to.

## Verification

- `npm run build` (vue-tsc + vite build) clean. The
  `import.meta.hot` conditional is recognised by the toolchain
  and the dispose block is included only in dev bundles.
- Manual reproduction (post-fix): start ponder on Tab A in
  `npm run dev`; trigger an HMR reload by saving an unrelated
  file in `src/`; observe in the proxy log that a `terminate`
  for Tab A's queryId arrives before the WS close. Pre-fix:
  only the WS close arrives; the canonical lingers on the LEAF
  until the v1.0.7 disconnect-cleanup terminates it.
- The new `stopAllBoardAnalyses()` is callable from non-HMR
  contexts too (its primary caller is the dispose hook, but it's
  a public method); no callers added in this PR, but future
  workspace-reset paths can use it.

## Forward notes

- This closes the second seed-inventory row in
  `docs/notes/resource-ownership-audit-plan.md` (the first being
  the closeBoard fix shipped 2026-05-04). The plan's "Closed"
  table now has two rows; the "Suspected open" table loses one
  and retains four.
- The audit plan's bisect discipline (one fix per commit) is
  honoured: this PR closes only the HMR pair. The remaining
  suspected-open pairs (board → ledger entries, board →
  review-session row, board → thumbnail cache, identity → all
  of the above on logout, component unmount → addEventListener
  pairings) ship in their own commits as Pass-2 sweeps the
  inventory.
- The TODO entry is moved to Completed via the established
  "moved to Completed" stub pattern; the Frontend Completed
  table receives a one-line synopsis with a cross-reference to
  this worklog.
