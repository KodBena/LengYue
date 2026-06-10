# Worklog — hydration/rebind residue audit (2026-06-10)

> Audit trail for work-status item `hydration-rebind-residue-audit`, filed by
> the 2026-06-10 SPA history-lessons audit (§3.9 / B.9,
> `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). Investigation
> arc, Round 1 of the audit's execution: disposition the honest residue the
> deflated "hydration audit" claim left behind, as a class doc rather than
> code.

## The change

- **New audit report:**
  `docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md`. It names
  the failure shape on both axes (hydration ordering vs identity flip, plus
  the adjacent reconnect axis the item calls out), indexes the seven existing
  nets (re-firing `immediate: true` watchers; the `5b57d25` disjoint-write
  move-out + `ProfileState` invariant; the SyncService
  `hydratedForUserId`/`hydrationGeneration` gates; `IDENTITY_SCOPED_CACHES`;
  `BOARD_SCOPED_STORE_CELLS` + the inline Class-B purges; keying/orphaning;
  the deliberately-declined `whenHydrated()` barrier), and records a
  per-site verdict with ADR-0003 band tags so the table doubles as the
  fork's hydration-coupled-state inventory.
- **Verdicts, in brief:** `useQueryTelemetry` [B1] — sound on all three
  axes (no persisted input; disconnect sweep + settle-bound match rows);
  thumbnail caches [B3] — not hydration-coupled (per-read derivation,
  orphaning random ids; identity axis already netted O9/O10), with one
  *latent* invariant named: node-content immutability holds only while
  `applySetup` stays caller-less; `analysis-service` per-board maps [B3] —
  not hydration-coupled (interaction-derived; engine connect is
  user-driven), reconnect contract is the deliberate O15
  reconcile-on-next-interaction decision, with two wrinkles recorded
  (completed entries never leave the maps; restart thunks are live again
  after reconnect, so a qEUBO toolbar-view toggle can resurrect
  pre-disconnect queries).
- **Declined barrier engaged on its own terms:** the 2026-06-03 re-trigger
  ("a second genuine instance appears") has not fired — no residue surface
  has a one-shot persistent-truth binding at all — so the decline stands and
  no `whenHydrated()` machinery is proposed.
- **No code changed.** Every residue is documented-as-designed,
  latent-with-named-trigger, bounded-and-cosmetic, or owned by an
  already-filed item (`multi-writer-slots-get-owners`,
  `thumbnail-render-lifecycle-consolidation`, `code-comment-stable-handles`
  — pointers in the report's §6).
- Doc-graph regenerated for the two new doc nodes (this worklog + the
  report).

## Deferred / notes

- The `restartActiveAnalyses` semantics question ("not explicitly stopped"
  vs "in flight") is a maintainer call attached to the staged
  `multi-writer-slots-get-owners` engine-connection-owner leg — recorded,
  not fixed, since changing disconnect semantics would re-litigate the
  documented O15 decision mid-arc.
- The dual use of the "O15" tag and `closeBoard`'s "Four cleanups" census
  rot were re-confirmed at HEAD; both are owned by
  `code-comment-stable-handles` and deliberately not patched here.
- Work-status close (open → shipped) left to the coordinator; this arc's
  DB access was read-only per commission.

---

License: Public Domain (The Unlicense).
