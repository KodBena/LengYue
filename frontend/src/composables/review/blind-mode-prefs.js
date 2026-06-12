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
 * watcher-driven release over a *supplied* key list and a *supplied*
 * reactive flow-exit predicate (the fork-reshape contract: a
 * generic-knowledge fork re-instantiates it with its own key list and
 * exit predicate). The entry/intermission policy — which keys, which
 * values mean "blind", which keys the intermission restores — lives at
 * the call sites in `useReviewSession.ts` (loadCard enters; finishCard
 * reveals suggestions as deliberate pedagogy while restoring
 * `treeExpanded`; maintainer-approved 2026-06-10). The *exit* is not a
 * call-site policy: release quantifies over ALL flow exits, present
 * and future, via a `flush: 'sync'` watcher installed at `capture()`
 * on the exit predicate (for the review flow: the owner board's
 * session status leaving the active states, or its row disappearing).
 * The prior shape — three hand-enumerated `release()` call sites —
 * left the failure-path exits (loadCard parse failure, analysis
 * timeout, missing-delta cancel) leaking the snapshot; the
 * out-of-frame hack-rationalization audit on PR #382 runtime-
 * demonstrated the leak, and the watcher is its corrective.
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
 * `useReviewSession.ts` — one canonical snapshot across the app. The
 * per-key watchers are app-lifetime by design (created in no
 * component scope, never disposed; installed lazily on first
 * capture() because this module sits on the store↔review import
 * cycle — see the inline note); the exit watcher is per-snapshot
 * (installed at capture(), disposed at release). Known edges,
 * recorded rather than engineered around: (a) `store.session.ui` is
 * workspace-global while review sessions are per-board, so two
 * concurrent reviews share one snapshot — the first session to enter
 * captures it and only that owner board's exit releases (`releaseAll`
 * is unconditional); the prefs themselves were already a shared
 * conflict surface before this owner existed. (b) A mid-review reload
 * persists the blind values (the snapshot is not persisted) — that is
 * the pre-existing "review-session state survives reload" question,
 * out of this owner's scope. (c) A hydration that replaces
 * `store.session` while a snapshot is active reads as an external
 * write and updates the snapshot — the persisted truth wins, which is
 * the honest outcome. If the same hydration ALSO exits the owner's
 * flow (the hydrated session lacks an active row for the owner
 * board), the per-key fold-in and the exit-driven restore race on
 * Vue's sync-trigger ordering: fold-in-first lands the hydrated
 * values (a wash), release-first lands the snapshot values. Bounded
 * to the one hydration tick and the two boolean prefs; recorded, not
 * engineered around.
 *
 * License: Public Domain (The Unlicense)
 */
import { watch } from 'vue';
import { store } from '../../store';
/**
 * Freshly-read view of the live session-UI record, narrowed to its
 * boolean preference keys. Plain structural assignment, no cast —
 * every `BooleanUiPrefKey` is a required boolean on `UISession`, so
 * `UISession` is assignable to the narrowed record type. Read fresh
 * on every access: `store.session` is replaced wholesale by
 * `resetWorkspace` / `updateFromRemote`, so caching the inner object
 * would read/write a detached record.
 */
function uiPrefs() {
    return store.session.ui;
}
/**
 * Generic snapshot/restore mechanism over a supplied list of
 * session-UI boolean preference keys and a supplied reactive
 * flow-exit predicate. Installs one `flush: 'sync'` watcher per key
 * lazily on the first `capture()` (see the inline import-cycle note)
 * plus one per-snapshot `flush: 'sync'` exit watcher at each
 * `capture()` — see the header for the manual-toggle contract, the
 * release contract, and the lifetime rationale.
 *
 * `isFlowExited` is read inside the exit watcher's getter, so it must
 * be a pure function of reactive store state for the supplied owner
 * board (it is re-evaluated whenever its reactive reads change).
 */
export function createUiPrefSnapshotOwner(keys, isFlowExited) {
    let snapshot = null;
    // Reentrancy guard distinguishing owner writes from external
    // (user-toggle) writes inside the sync watchers below.
    let ownerWriting = false;
    // Stop handle for the per-snapshot exit watcher. The owning board
    // is carried by the watcher's closure (capture()'s `boardId`), so
    // no separate owner field is needed: ownership IS "whose exit the
    // armed watcher observes".
    let stopExitWatch = null;
    // Watchers are installed lazily on the first capture(), NOT at
    // module evaluation: this module sits on an import cycle
    // (store/index.ts → useReviewSession → here → store), and a sync
    // watch runs its getter immediately at creation — at module scope
    // that read can land while the store module is still
    // mid-initialization (whichever module the entry or a test reaches
    // first determines the evaluation order). By the first capture()
    // the store is long since constructed. Installed once, app-lifetime
    // (never disposed) — the snapshot-active check keeps them inert
    // outside a flow. (The exit watcher below shares the same
    // created-at-capture timing, so the cycle constraint holds for it
    // by construction.)
    let watchersInstalled = false;
    function ensureWatchers() {
        if (watchersInstalled)
            return;
        watchersInstalled = true;
        for (const key of keys) {
            watch(() => uiPrefs()[key], (value) => {
                if (snapshot === null || ownerWriting)
                    return;
                // External write while the flow is active: a manual user
                // toggle (or a hydration). The user's new choice becomes
                // the restore target — the stale pre-flow value would
                // clobber a deliberate mid-flow decision.
                snapshot.set(key, value);
            }, { flush: 'sync' });
        }
    }
    function restoreInto(restoreSet) {
        if (snapshot === null)
            return;
        for (const key of restoreSet) {
            const value = snapshot.get(key);
            if (value !== undefined)
                write(key, value);
        }
    }
    function write(key, value) {
        // Widen the generic K to the full union for the write: TS rejects
        // assignment through a generic indexed access, but a union-keyed
        // write into a homogeneous Record<…, boolean> is checked exactly.
        const k = key;
        ownerWriting = true;
        try {
            uiPrefs()[k] = value;
        }
        finally {
            ownerWriting = false;
        }
    }
    function releaseInternal() {
        // Disarm the exit watcher first so release is reentrancy-proof
        // by construction (the restore writes below touch session-UI
        // prefs, never the flow state the watcher reads, but stopping
        // first removes the question). Stopping a sync watcher from
        // inside its own callback is supported by Vue.
        if (stopExitWatch !== null) {
            stopExitWatch();
            stopExitWatch = null;
        }
        restoreInto(keys);
        snapshot = null;
    }
    return {
        capture(boardId) {
            ensureWatchers();
            if (snapshot !== null)
                return;
            snapshot = new Map(keys.map((k) => [k, uiPrefs()[k]]));
            // The release contract, mechanized: one sync watcher on the
            // supplied exit predicate for the owning board. Any path on
            // which the flow exits — whichever function drives it, whether
            // it exists yet or not — flips the predicate and releases; the
            // hand-enumerated alternative (a release() call per exit site)
            // is the shape PR #382's out-of-frame audit caught leaking on
            // the three unenumerated failure exits. `flush: 'sync'` so the
            // restore lands in the same tick as the exit write (an async
            // flush would let post-exit reads observe blind values).
            const stop = watch(() => isFlowExited(boardId), (exited) => {
                if (exited)
                    releaseInternal();
            }, { flush: 'sync' });
            stopExitWatch = stop;
        },
        write,
        restoreKeys(restoreSet) {
            restoreInto(restoreSet);
        },
        releaseAll() {
            if (snapshot === null)
                return;
            releaseInternal();
        },
    };
}
/**
 * The review flow's exit predicate over the per-board session status.
 * Exited ⇔ the row is gone (closeBoard's BOARD_SCOPED_STORE_CELLS
 * drain deletes it; resetWorkspace / hydration can replace
 * `store.session` wholesale) or the status machine has landed on its
 * one non-active state, IDLE. Every in-tree exit funnels through one
 * of those two shapes: all review status writes go through
 * `mutateReviewSession` in `useReviewSession.ts`, and every exit
 * there is a `status = 'IDLE'` write. FINISHED is deliberately
 * active: the intermission (finishCard's reveal) is part of the
 * session, not an exit.
 */
function isReviewSessionExited(status) {
    if (status === undefined)
        return true;
    switch (status) {
        case 'IDLE':
            return true;
        case 'LOADING':
        case 'AWAITING_MOVE':
        case 'ANALYZING':
        case 'FINISHED':
            return false;
        default: {
            // Exhaustiveness guard: a new ReviewStatus member fails to
            // compile here, forcing an explicit active-vs-exited call —
            // silently defaulting a new state would recreate the unhooked-
            // exit class this predicate exists to close.
            const unhandled = status;
            return unhandled;
        }
    }
}
/**
 * The review session's blind-mode pref owner — today's domain-supplied
 * key list and exit predicate. `showMoveSuggestions` is the blind-mode
 * core (no engine hints while the user attempts the card);
 * `treeExpanded` is collapsed alongside it so the game tree doesn't
 * reveal the card's continuation. Entered (capture + owned writes) by
 * `useReviewSession.ts`'s loadCard, revealed at finishCard; released
 * by the exit watcher on any session exit, plus the explicit
 * `releaseAll()` in `abortAllReviews` (the identity-flip ordering
 * hazard — see the interface doc).
 */
export const blindModePrefs = createUiPrefSnapshotOwner(['showMoveSuggestions', 'treeExpanded'], (ownerBoardId) => isReviewSessionExited(store.session.reviews[ownerBoardId]?.status));
