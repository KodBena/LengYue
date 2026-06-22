/**
 * src/store/teardown-registrations.ts
 *
 * Teardown-handler BOOTSTRAP (ADR-0012 P2/P3). After the dependency inversion,
 * `store/index.ts` no longer imports the resource owners (that import was the
 * cycle edge Tranche D removed) — so nothing else forces the owners' module
 * init to run, and an owner whose module never loads would have its teardown
 * handler silently absent: the exact per-board / per-identity leak the
 * resource-ownership discipline exists to prevent (ADR-0002 — a silent missing
 * cleanup). This module is the single side-effect import that loads every owner
 * so its `registerBoardCloseHandler` / `registerWorkspaceResetHandler` call has
 * fired before any `closeBoard` / `resetWorkspace` runs. Import it ONCE, early,
 * from the app entry (`main.ts`).
 *
 * ── Manual list, test-guarded ────────────────────────────────────────────────
 * The list below is hand-maintained. That is acceptable ONLY because the
 * board-completeness test (`tests/integration/store-mutators.test.ts`) is its
 * tripwire: it imports this bootstrap and asserts
 * `registeredBoardCloseLabels()` / `registeredWorkspaceResetLabels()` equal the
 * COMPLETE expected set, so a forgotten owner (one not loaded here, or one
 * whose registration was dropped) fails the suite loudly. The test is the
 * guarantee, not the type system.
 *
 * ── Order ────────────────────────────────────────────────────────────────────
 * The imports are listed in the teardown-semantic order (engine-stop owner
 * first, then the board-derived purges, then the order-independent owners), so
 * the file reads in the order the handlers conceptually run. But the
 * load-bearing engine-stop-before-ledger-purge constraint does NOT rely on this
 * import order — it is enforced by the explicit `TeardownOrder` band on each
 * handler (analysis-service's stop at ENGINE_STOP < the ledger/stability purges
 * at LEDGER_PURGE). That belt-and-braces is deliberate: ES-module evaluation is
 * post-order over the import graph, and `analysis-service` itself imports
 * `analysis-ledger` / `stability-trajectory-store` as dependencies, so the
 * ledger's registration actually runs BEFORE analysis-service's during this
 * module's evaluation — pure registration order would put the ledger purge
 * first, violating the constraint. The numeric `order` band makes the run order
 * import-graph-independent; the import order here is documentation, not
 * mechanism.
 *
 * License: Public Domain (The Unlicense)
 */

// Engine-stop owner — registers `analysis-service:stop` (ENGINE_STOP) /
// `analysis:active-board-analyses`. Must release subscriptions before the
// ledger is purged; the ordering is carried by the handler's TeardownOrder
// band (see this file's header), not by appearing first here.
import '../services/analysis-service';

// Board-derived purges — `analysis-ledger:purge` / `stability-trajectory:purge`
// (LEDGER_PURGE) and their identity-flip purgeAll twins. (Both are also pulled
// in transitively by analysis-service above; the explicit imports keep the set
// legible and independent of that coupling.)
import '../state/analysis-ledger';
import '../state/stability-trajectory-store';

// Order-independent owners (DEFAULT band): persisted bundles, review-wait
// aborts, thumbnail caches, card-thumbnail cache, card-tree slots.
import '../services/analysis-persistence-service';
import '../composables/review/useReviewSession';
import '../composables/cards/thumbnail-render-resources';
import '../composables/cards/useCardThumbnail';
import '../composables/cards/board-card-trees';
