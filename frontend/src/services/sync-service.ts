/**
 * src/services/sync-service.ts
 * Stateless Persistence Bridge.
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import { store, boardsVersion, updateFromRemote, pushSystemMessage } from '../store';
import { api } from './api-client';

export class SyncService {
  private docKey: string;
  private isInitialHydrated = false;

  // Single debounce slot. All reactive changes across boards, profile,
  // and session coalesce into one pending PUT. See `startWatcher()`
  // below for why this replaced the previous three-channel scheme.
  private pendingTimer: number | null = null;

  constructor(docKey: string = 'user_workspace_01') {
    this.docKey = docKey;
  }

  /**
   * Ensures auth, fetches initial state, and starts the reactivity watcher.
   *
   * Backend contract for missing documents:
   *   GET /documents/{key} returns 200 {data: {}} when the document
   *   doesn't exist — never 404. The empty-workspace case is therefore
   *   the success path with an empty data blob and requires no special
   *   handling. (A previous implementation had a 404 fallback here;
   *   that branch could never fire given the contract above and has
   *   been removed.)
   *
   * User-visible surfacing (item 20):
   *   - Successful initial hydration emits an 'info' message (one-shot,
   *     only the first time connect() runs for the lifetime of this
   *     instance, because connect() is only called once).
   *   - A real hydration failure emits an 'error' message describing
   *     the user-level consequence ("workspace will not persist").
   *     The underlying HTTP error is ALSO surfaced by api-client; the
   *     two messages together give the user both the WHAT and the WHY.
   */
  async connect() {
    try {
      await api.ensureAuthenticated();
      
      // Fetch the unified document from the REST API.
      const doc = await api.request<any>('GET', `/documents/${this.docKey}`);
      
      // The backend wraps the document in {"data": { ... }}. A missing
      // document manifests as doc.data === {}, which falls through this
      // block harmlessly — updateFromRemote is effectively a no-op on
      // an empty blob (all its inner `if (remoteData.X)` guards fail).
      if (doc && doc.data) {
        updateFromRemote(doc.data);
      }
      
      this.isInitialHydrated = true;
      this.startWatcher();
      console.log('[Sync] Hydration complete. Watcher started.');
      pushSystemMessage('info', 'Sync: initial hydration complete.');

    } catch (err: any) {
      console.error('[Sync] Initialization failed:', err);
      pushSystemMessage('error', 'Sync: initial hydration failed. Workspace will not persist this session.');
    }
  }

  /**
   * Subscribe to the full reactive surface that participates in sync.
   *
   * Why one watcher instead of three:
   *   The previous implementation ran three independent watchers
   *   (boards, profile, session) — each with its own debounce slot,
   *   each calling the same sendSync() which always serializes the
   *   entire blob. Because the PUT is monolithic, per-channel timers
   *   produced only drawbacks:
   *     (a) no bandwidth saving — every PUT sent everything;
   *     (b) redundant PUTs when two channels fired in the same
   *         debounce window (e.g., boards at t=0 and profile at
   *         t=0.5s produced one PUT at t=1s AND another at t=1.5s,
   *         both containing the same merged state).
   *   A single watcher + single debounce slot produces exactly one
   *   PUT per user-perceptible change batch, which is what we want.
   *
   * Why deep watches on profile and session:
   *   boardsVersion is an explicit version counter bumped by every
   *   board mutation, so a shallow watch suffices. profile and
   *   session are deep reactive trees without version counters, so
   *   they need deep watches to catch nested edits.
   */
  private startWatcher() {
    watch(
      () => [
        boardsVersion.value,
        store.activeBoardIndex,
        store.profile,
        store.session,
      ],
      () => this.scheduleSync(),
      { deep: true }
    );
  }

  private scheduleSync() {
    if (!this.isInitialHydrated) return;
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);

    const interval = store.profile.settings.persistence?.debounceInterval ?? 1000;
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      this.sendSync();
    }, interval);
  }

  /**
   * Fire a sync immediately, cancelling any pending debounce. Used by
   * the Settings tab's "Force Persistence" button.
   */
  public forceSave() {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.sendSync();
  }

  /**
   * Compiles the full application state and pushes it via PUT /documents/{key}.
   *
   * ─── CONCURRENCY CONTRACT: last-write-wins, single-tab-per-tenant ──────────
   * Sync has no conflict detection. Two browser tabs open against the
   * same account will silently overwrite each other's state — whichever
   * debounced sendSync() fires last replaces the backend's document
   * entirely. There is no ETag, vector clock, or merge logic on this
   * path.
   *
   * If multi-tab usage becomes a real workflow, the standard fix is
   * ETag-based conditional PUTs: backend grows a 412 response on
   * conflict, frontend grows a merge-or-retry loop here (re-fetch
   * the document, reconcile with local state, PUT again with the
   * new ETag). Until that happens, the single-tab invariant above
   * holds unconditionally and callers can rely on it.
   * ──────────────────────────────────────────────────────────────────────────
   *
   * User-visible surfacing (item 20):
   *   - Success path is intentionally silent in the system log (a toast
   *     on every debounced save would be spam). Dev-mode console.log is
   *     preserved for debugging.
   *   - Failure emits an 'error' with a user-level description. The
   *     low-level API error from api-client accompanies it.
   */
  private async sendSync() {
    const payload = {
      boards: store.boards,
      activeBoardIndex: store.activeBoardIndex,
      profile: store.profile,
      session: store.session
    };

    try {
      await api.request('PUT', `/documents/${this.docKey}`, { data: payload });
      if (import.meta.env.DEV) console.log('[Sync] Document saved.');
    } catch (err) {
      console.error('[Sync] Failed to save document:', err);
      pushSystemMessage('error', 'Sync: failed to save workspace. Your recent changes are not on the server yet.');
    }
  }
}
