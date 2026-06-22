/**
 * src/store/teardown-registry.ts
 *
 * Dependency-inversion seam for board-close / workspace-reset teardown
 * (ADR-0012 P2/P3). The two load-bearing workspace mutators in
 * `store/index.ts` — `closeBoard` and `resetWorkspace` — must release the
 * external resources a board (or an identity's whole workspace) owns: the
 * proxy analysis subscription, the analysis ledger, the stability
 * trajectories, the persisted bundle, the review-wait aborts, the thumbnail
 * caches, the card-tree slots. Each of those resources is owned by a module
 * that *reads up into the store* (analysis-service holds the engine subtree,
 * useReviewSession reads the reviews map, …). Having the store import those
 * owners to drive their cleanup put the store on the down-edge of an import
 * cycle (`store → owner → store`); that cycle was the structural precondition
 * of the vite-8.x vitest-teardown deadlock (cycle-check ratchet; PR #444).
 *
 * This registry inverts the direction. Each owner *registers* its own
 * teardown handler at module init; `closeBoard` / `resetWorkspace` call the
 * run-APIs here instead of importing the owners. The store now imports only
 * this leaf (which imports nothing from the owners or the store), so the
 * store → owner out-edges are gone and the SCC dissolves.
 *
 * **This module is a LEAF — it imports nothing but types.** Keep it that way:
 * any value import of an owner or the store re-forms the cycle this registry
 * exists to break.
 *
 * ── Ordering (load-bearing) ──────────────────────────────────────────────────
 * Handlers run in ascending `order`, ties broken by registration order. The
 * one constraint that is a *correctness* requirement (not mere hygiene) is
 * engine-stop-before-ledger-purge: `closeBoard` must sever the board's
 * in-flight analysis subscription BEFORE purging the ledger, or an in-flight
 * packet can land between the two and re-populate the ledger after it was
 * cleared (see `closeBoard`'s docstring). An explicit numeric `order` carries
 * that constraint rather than leaving it to module-load timing — the engine
 * owner (analysis-service) is transitively imported BY the ledger's sibling
 * loader, so pure registration order is reshaped by the import graph and
 * cannot be relied on to keep the engine-stop first. `TeardownOrder` names the
 * two bands; everything order-independent sits in `DEFAULT`. The
 * board-completeness test pins the resulting label order, so a mis-banded
 * handler fails loudly there (ADR-0002).
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardId, NodeId } from '../types';

/**
 * Teardown ordering bands. Lower runs first. The only load-bearing gap is
 * `ENGINE_STOP` < `LEDGER_PURGE` (engine-stop-before-ledger-purge — a
 * correctness constraint; see this file's header and `closeBoard`'s
 * docstring). Everything else is order-independent and sits at `DEFAULT`.
 * Numeric gaps are intentional so a future ordered handler can slot between
 * without renumbering.
 */
export const TeardownOrder = {
  /** analysis-service's stop — must run before the ledger purge. */
  ENGINE_STOP: 0,
  /** ledger / stability-trajectory purge — after the engine stop. */
  LEDGER_PURGE: 10,
  /** Everything order-independent (persistence, review-abort, thumbnails, card-trees). */
  DEFAULT: 100,
} as const;

/**
 * A board-close teardown handler. `run` releases the closing board's
 * resources; it is handed both the `BoardId` and the `nodeIds` snapshot the
 * caller took before the splice (the ledger / stability-store consume the node
 * list directly — they no longer reach up into the store to derive it; see
 * Tranche B). `label` is a stable, repo-resident handle (`<owner>:<verb>`) the
 * board-completeness test pins.
 */
export interface BoardCloseHandler {
  readonly label: string;
  /** Lower runs first; defaults to `TeardownOrder.DEFAULT` when omitted. */
  readonly order?: number;
  run(boardId: BoardId, nodeIds: readonly NodeId[]): void;
}

/**
 * A workspace-reset (identity-flip) teardown handler. `run` releases the
 * prior identity's workspace-wide resources. Same `label` / `order` contract
 * as `BoardCloseHandler`.
 */
export interface WorkspaceResetHandler {
  readonly label: string;
  /** Lower runs first; defaults to `TeardownOrder.DEFAULT` when omitted. */
  readonly order?: number;
  run(): void;
}

const boardCloseHandlers: BoardCloseHandler[] = [];
const workspaceResetHandlers: WorkspaceResetHandler[] = [];

/** Effective order for sorting — explicit `order`, else `DEFAULT`. */
function orderOf(h: { readonly order?: number }): number {
  return h.order ?? TeardownOrder.DEFAULT;
}

/**
 * Register a board-close handler. Owners call this at module init; the
 * bootstrap (`teardown-registrations.ts`) side-effect-imports every owner so
 * the full set is present before any `closeBoard` fires. Re-registration is
 * the caller's concern — the run-set is exactly what was registered.
 */
export function registerBoardCloseHandler(h: BoardCloseHandler): void {
  boardCloseHandlers.push(h);
}

/** Register a workspace-reset handler. See `registerBoardCloseHandler`. */
export function registerWorkspaceResetHandler(h: WorkspaceResetHandler): void {
  workspaceResetHandlers.push(h);
}

/**
 * Run every registered board-close handler for the closing board, in
 * ascending `order` (ties: registration order). Called by `closeBoard` after
 * it has snapshotted `nodeIds` and before it splices the board out of
 * `store.boards`.
 */
export function runBoardCloseHandlers(boardId: BoardId, nodeIds: readonly NodeId[]): void {
  // Stable sort by effective order; Array.prototype.sort is stable (ES2019+),
  // so equal-order handlers keep registration order.
  const ordered = [...boardCloseHandlers].sort((a, b) => orderOf(a) - orderOf(b));
  for (const h of ordered) h.run(boardId, nodeIds);
}

/**
 * Run every registered workspace-reset handler, in ascending `order` (ties:
 * registration order). Called by `resetWorkspace` on identity flip.
 */
export function runWorkspaceResetHandlers(): void {
  const ordered = [...workspaceResetHandlers].sort((a, b) => orderOf(a) - orderOf(b));
  for (const h of ordered) h.run();
}

/**
 * Labels of every registered board-close handler, in the order they will run.
 * The board-completeness test asserts this equals the COMPLETE expected set —
 * a forgotten/missing registration (an owner module not loaded, or a handler
 * not registered) fails the test loudly, which is the guarantee that the
 * dependency-inversion didn't silently drop a per-board cleanup (the test is
 * the guarantee, not the type system).
 */
export function registeredBoardCloseLabels(): readonly string[] {
  return [...boardCloseHandlers].sort((a, b) => orderOf(a) - orderOf(b)).map(h => h.label);
}

/** Labels of every registered workspace-reset handler, in run order. The
 *  identity-flip analog of `registeredBoardCloseLabels`. */
export function registeredWorkspaceResetLabels(): readonly string[] {
  return [...workspaceResetHandlers].sort((a, b) => orderOf(a) - orderOf(b)).map(h => h.label);
}
