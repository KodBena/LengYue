/**
 * src/composables/review/blind-mode-prefs.ts
 *
 * Snapshot/restore owner for the session-UI preference keys the review
 * session's blind mode flips. History-lessons audit §3.7 leg (ii);
 * work-status item `multi-writer-slots-get-owners`.
 *
 * The problem class: a modal flow (the review session's "Blind Mode")
 * temporarily overrides user preferences that live in
 * `store.session.ui` — *persisted* state (`session` rides
 * `buildPersistencePayload`), so an unconditional "restore" to a
 * hardcoded value clobbers the user's actual choice and the clobber
 * survives reloads. The fix shape is a snapshot taken at flow entry
 * and restored at every flow exit, with the snapshot tracking manual
 * user toggles made *during* the flow (the user's new choice wins
 * over the stale pre-flow value).
 *
 * Mechanism vs. policy: `createUiPrefSnapshotOwner` is the generic
 * mechanism — snapshot-if-absent / owned-write / subset-restore /
 * release over a *supplied* key list (the fork-reshape contract: a
 * generic-knowledge fork re-instantiates it with its own key list).
 * The policy — which keys, which values mean "blind", which keys each
 * lifecycle point restores — lives at the call sites in
 * `useReviewSession.ts` (loadCard enters; finishCard reveals
 * suggestions as deliberate pedagogy while restoring `treeExpanded`;
 * endSession and the abort paths restore everything;
 * maintainer-approved 2026-06-10).
 *
 * Manual-toggle tracking: the keys' sanctioned external writers are
 * direct toggles (the ADR-0001 template-toggle exception for
 * `session.ui` — App.vue's `treeExpanded` button — and the
 * keybindings action for `showMoveSuggestions`), so the owner cannot
 * see those writes at the call site. Instead each key gets a
 * `flush: 'sync'` watcher: while a snapshot is active, an external
 * write (one not made through the owner's guarded `write`) updates
 * the snapshot, so the eventual restore lands on the user's latest
 * deliberate choice. Owner writes set a reentrancy flag the watcher
 * checks, which is why the watchers must be `sync` (an async flush
 * would observe the flag already cleared).
 *
 * Lifetime: module-scope, like `pendingAnalysisAborts` in
 * `useReviewSession.ts` — one canonical snapshot across the app,
 * reachable from `closeBoard` / `resetWorkspace` via the abort
 * helpers. The watchers are app-lifetime by design (created in no
 * component scope, never disposed; installed lazily on first
 * capture() because this module sits on the store↔review import
 * cycle — see the inline note). Known edges, recorded rather than
 * engineered around: (a) `store.session.ui` is workspace-global while
 * review sessions are per-board, so two concurrent reviews share one
 * snapshot — the first session to enter captures it and only that
 * owner board's exit restores (`releaseAll` is unconditional); the
 * prefs themselves were already a shared conflict surface before this
 * owner existed. (b) A mid-review reload persists the blind values
 * (the snapshot is not persisted) — that is the pre-existing
 * "review-session state survives reload" question, out of this
 * owner's scope. (c) A hydration that replaces `store.session` while
 * a snapshot is active reads as an external write and updates the
 * snapshot — the persisted truth wins, which is the honest outcome.
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import type { BoardId, UISession } from '../../types';
import { store } from '../../store';

/** Keys of `UISession` whose value is a plain required boolean — the
 *  only shape the snapshot mechanism handles (copy by value). The
 *  filter tests the original `UISession[K]`, so an optional key reads
 *  as `boolean | undefined` and is excluded; the `-?` strips the
 *  optional modifier from the mapped type itself so the final index
 *  lookup doesn't re-union `undefined` into the key set. */
type BooleanUiPrefKey = {
  [K in keyof UISession]-?: UISession[K] extends boolean ? K : never;
}[keyof UISession];

/**
 * Freshly-read view of the live session-UI record, narrowed to its
 * boolean preference keys. Plain structural assignment, no cast —
 * every `BooleanUiPrefKey` is a required boolean on `UISession`, so
 * `UISession` is assignable to the narrowed record type. Read fresh
 * on every access: `store.session` is replaced wholesale by
 * `resetWorkspace` / `updateFromRemote`, so caching the inner object
 * would read/write a detached record.
 */
function uiPrefs(): Record<BooleanUiPrefKey, boolean> {
  return store.session.ui;
}

export interface UiPrefSnapshotOwner<K extends BooleanUiPrefKey> {
  /**
   * Take the snapshot if none is active and record `boardId` as the
   * owning board. Idempotent while a snapshot is active (re-entering
   * the flow — e.g. the next card's loadCard — must not overwrite the
   * pre-flow truth with mid-flow values).
   */
  capture(boardId: BoardId): void;
  /** Owned write: sets the pref without updating the snapshot (this
   *  is the flow's own override, not a user choice). */
  write(key: K, value: boolean): void;
  /** Restore a subset of keys to their snapshot values, keeping the
   *  snapshot active. No-op when no snapshot is active. */
  restoreKeys(keys: readonly K[]): void;
  /** If `boardId` owns the active snapshot: restore every key and
   *  clear it. No-op otherwise (another board's flow owns it, or no
   *  snapshot is active). */
  release(boardId: BoardId): void;
  /** Unconditional release: restore every key and clear the snapshot
   *  regardless of owner. The identity-flip path (`abortAllReviews`
   *  via `resetWorkspace`). */
  releaseAll(): void;
}

/**
 * Generic snapshot/restore mechanism over a supplied list of
 * session-UI boolean preference keys. Installs one `flush: 'sync'`
 * watcher per key lazily on the first `capture()` (see the inline
 * import-cycle note) — see the header for the manual-toggle contract
 * and the lifetime rationale.
 */
export function createUiPrefSnapshotOwner<K extends BooleanUiPrefKey>(
  keys: readonly K[],
): UiPrefSnapshotOwner<K> {
  let snapshot: Map<K, boolean> | null = null;
  let ownerBoardId: BoardId | null = null;
  // Reentrancy guard distinguishing owner writes from external
  // (user-toggle) writes inside the sync watchers below.
  let ownerWriting = false;

  // Watchers are installed lazily on the first capture(), NOT at
  // module evaluation: this module sits on an import cycle
  // (store/index.ts → useReviewSession → here → store), and a sync
  // watch runs its getter immediately at creation — at module scope
  // that read can land while the store module is still
  // mid-initialization (whichever module the entry or a test reaches
  // first determines the evaluation order). By the first capture()
  // the store is long since constructed. Installed once, app-lifetime
  // (never disposed) — the snapshot-active check keeps them inert
  // outside a flow.
  let watchersInstalled = false;
  function ensureWatchers(): void {
    if (watchersInstalled) return;
    watchersInstalled = true;
    for (const key of keys) {
      watch(
        () => uiPrefs()[key],
        (value) => {
          if (snapshot === null || ownerWriting) return;
          // External write while the flow is active: a manual user
          // toggle (or a hydration). The user's new choice becomes
          // the restore target — the stale pre-flow value would
          // clobber a deliberate mid-flow decision.
          snapshot.set(key, value);
        },
        { flush: 'sync' },
      );
    }
  }

  function restoreInto(restoreSet: readonly K[]): void {
    if (snapshot === null) return;
    for (const key of restoreSet) {
      const value = snapshot.get(key);
      if (value !== undefined) write(key, value);
    }
  }

  function write(key: K, value: boolean): void {
    // Widen the generic K to the full union for the write: TS rejects
    // assignment through a generic indexed access, but a union-keyed
    // write into a homogeneous Record<…, boolean> is checked exactly.
    const k: BooleanUiPrefKey = key;
    ownerWriting = true;
    try {
      uiPrefs()[k] = value;
    } finally {
      ownerWriting = false;
    }
  }

  function releaseInternal(): void {
    restoreInto(keys);
    snapshot = null;
    ownerBoardId = null;
  }

  return {
    capture(boardId: BoardId): void {
      ensureWatchers();
      if (snapshot !== null) return;
      snapshot = new Map(keys.map((k) => [k, uiPrefs()[k]] as const));
      ownerBoardId = boardId;
    },
    write,
    restoreKeys(restoreSet: readonly K[]): void {
      restoreInto(restoreSet);
    },
    release(boardId: BoardId): void {
      if (snapshot === null || ownerBoardId !== boardId) return;
      releaseInternal();
    },
    releaseAll(): void {
      if (snapshot === null) return;
      releaseInternal();
    },
  };
}

/**
 * The review session's blind-mode pref owner — today's domain-supplied
 * key list. `showMoveSuggestions` is the blind-mode core (no engine
 * hints while the user attempts the card); `treeExpanded` is collapsed
 * alongside it so the game tree doesn't reveal the card's continuation.
 * Consumed exclusively by `useReviewSession.ts` (loadCard / finishCard /
 * endSession and the abort helpers `abortBoardReview` / `abortAllReviews`).
 */
export const blindModePrefs = createUiPrefSnapshotOwner([
  'showMoveSuggestions',
  'treeExpanded',
] as const);
