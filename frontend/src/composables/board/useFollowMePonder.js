/**
 * src/composables/board/useFollowMePonder.ts
 *
 * "Follow Me" ponder watcher, extracted from App.vue (work-status
 * item app-vue-style-and-wiring-extraction; the history-lessons
 * audit's arch-ergonomics findings sketched it as a sibling of
 * useEngineResponder). Automatically restarts pondering when the
 * user navigates or plays a move on the *currently active* board.
 *
 * Call once from App.vue's setup: the watcher binds to App's effect
 * scope and lives for the app lifetime (Vue reclaims it with the
 * instance, so no explicit teardown is owed — the app root never
 * unmounts; in tests, `withSetup` provides the disposing host).
 *
 * The call-once contract is ENFORCED, not just documented (work-status
 * item app-vue-extraction-residue, leg 3; the residue PR #412's
 * out-of-frame gate named — "a second caller of useFollowMePonder would
 * create a SECOND watcher … nothing enforces it"). A second call WHILE a
 * watcher is live throws (ADR-0002 fail-loudly: a duplicate watcher is a
 * programming error, not an idempotent transition — two watchers would
 * double-issue every follow-me ponder query). The guard is scoped to the
 * watcher's LIFETIME via `onScopeDispose`, not a set-once latch: when the
 * owning scope disposes (the app root unmounting, or a test's `withSetup`
 * host tearing down) the latch clears, so a legitimate fresh install (a
 * remount, or the next test case) is allowed. A set-once boolean would
 * wrongly reject the second test case and a real remount — the lifetime
 * binding is what makes the guard honest.
 *
 * Extraction note: this was App.vue's single direct service import —
 * the annotated wiring-file exemption on the component→services
 * boundary lint. Moving the watcher here retires that exemption:
 * composables are the sanctioned home for service orchestration
 * (frontend/CLAUDE.md "Architectural shape").
 *
 * License: Public Domain (The Unlicense)
 */
import { watch, onScopeDispose } from 'vue';
import { activeBoard } from '../../store';
import { analysisService } from '../../services/analysis-service';
/**
 * Whether a follow-me watcher is currently installed. Module-scope so a
 * SECOND caller is visible while the first watcher lives; cleared in
 * `onScopeDispose` so the latch tracks the watcher's lifetime, not the
 * app's. (Module-intent state lives in a plain `.ts` module — outside
 * Vue's per-instance `setup()` — exactly where it belongs.)
 */
let watcherInstalled = false;
export function useFollowMePonder() {
    if (watcherInstalled) {
        // Fail loudly (ADR-0002): the call-once contract is violated. Two
        // watchers would each re-issue the ponder query on every same-board
        // navigation, doubling proxy traffic and racing the canonical query.
        throw new Error('useFollowMePonder: already installed. It registers a single app-lifetime ' +
            'watcher and must be called exactly once (from App.vue\'s setup). A second ' +
            'concurrent call would create a duplicate follow-me watcher. See the ' +
            'composable header and work-status item app-vue-extraction-residue.');
    }
    watcherInstalled = true;
    // Release the latch when the owning effect scope disposes, so a later
    // legitimate install (app remount; the next test under `withSetup`) is
    // allowed. Without this the latch would be a set-once boolean that
    // wrongly rejects the second test case and a real remount.
    onScopeDispose(() => {
        watcherInstalled = false;
    });
    // The reactive expression includes the active board's id so a board
    // switch (different active tab) can be distinguished from same-board
    // navigation: switching tabs is NOT a "follow me" trigger and must
    // not re-issue the new tab's ponder query — doing so would cancel and
    // re-subscribe a perfectly good in-flight ponder, churning the
    // proxy's canonical (and, with multi-tab coalescing, masking the
    // proxy's stranded-query / coalescing-transparency behaviour during
    // testing).
    watch(() => activeBoard.value
        ? { id: activeBoard.value.id, nodeId: activeBoard.value.currentNodeId }
        : null, (curr, prev) => {
        if (!curr || !prev)
            return; // mount, unmount, or no active board
        if (curr.id !== prev.id)
            return; // board switch — not a "follow me" trigger
        if (curr.nodeId === prev.nodeId)
            return;
        if (analysisService.isPondering(curr.id)) {
            analysisService.analyzeActiveNode(curr.id, 'ponder');
        }
    });
}
