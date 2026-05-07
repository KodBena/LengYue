/**
 * src/services/sync-service.ts
 * Stateless Persistence Bridge.
 *
 * Identity-aware: this service holds workspace state for exactly
 * one authenticated user at a time. When `auth.state` transitions
 * to a different identity (login, logout, or post-rejection
 * re-auth), it cancels pending saves, re-hydrates the new user's
 * document, and only then resumes saves. This prevents the
 * silent-data-loss bug where a save with the prior user's
 * reactive store would land in the new user's document slot via
 * the new user's JWT.
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import {
  store,
  boardsVersion,
  updateFromRemote,
  pushSystemMessage,
  resetWorkspace,
  buildPersistencePayload,
} from '../store';
import { api } from './api-client';
import { i18n } from '../i18n';
import type { useAuth } from '../composables/useAuth';
import type { AuthState } from '../types';

type AuthApi = ReturnType<typeof useAuth>;

export class SyncService {
  private docKey: string;
  private auth: AuthApi;

  /**
   * Identity-aware hydration gate. `null` means "not hydrated for
   * any user; saves are blocked." A number means "hydrated for
   * that specific userId; saves are permitted when the current
   * auth identity matches." Replaces the prior single-shot
   * `isInitialHydrated: boolean`, which couldn't distinguish
   * hydration-for-user-A from hydration-for-user-B and led to
   * cross-identity data loss in the rejection-then-login flow.
   */
  private hydratedForUserId: number | null = null;

  /**
   * Monotonic counter for in-flight hydrations. Each `hydrate()`
   * captures the value at kick-off; if it doesn't match by the
   * time the GET resolves, the resolution is superseded (a newer
   * hydrate is already in flight, e.g., from a fast-flipping auth
   * state) and is discarded. Prevents a stale hydrate from
   * overwriting the store after a newer one has already set the
   * truth for the current identity.
   */
  private hydrationGeneration = 0;

  // Single debounce slot. All reactive changes across boards,
  // profile, and session coalesce into one pending PUT. See
  // `startWatcher()` below for why this replaced the previous
  // three-channel scheme.
  private pendingTimer: number | null = null;

  constructor(docKey: string, auth: AuthApi) {
    this.docKey = docKey;
    this.auth = auth;
  }

  /**
   * Installs the auth-state watcher and the store-changes watcher.
   * The auth watcher fires immediately with the current state, so
   * if auth has already settled (the typical case after
   * useAppBootstrap awaits `tryAutoLogin` first), hydration kicks
   * off synchronously here.
   *
   * No longer calls `api.ensureAuthenticated()`. Auth identity is
   * an input, observed via `auth.state`, not something this
   * service self-bootstraps. The cold-start auto-fill that
   * `ensureAuthenticated` provides lives in `useAuth.tryAutoLogin`,
   * which runs before this method per `useAppBootstrap`'s order.
   *
   * Backend contract for missing documents:
   *   GET /documents/{key} returns 200 {data: {}} when the
   *   document doesn't exist — never 404. The empty-workspace
   *   case is therefore the success path with an empty data blob
   *   and requires no special handling.
   */
  connect(): void {
    watch(
      () => this.auth.state.value,
      (next) => this.onAuthStateChange(next),
      { immediate: true },
    );

    this.startWatcher();
  }

  /**
   * Auth-state change handler. Cancels any pending save (its
   * payload belongs to the prior identity), resets the hydration
   * gate, and re-hydrates if the new state carries a usable
   * userId.
   *
   * The `kind: 'authenticated'` branch with `userId === undefined`
   * (the non-401 verify-error path in useAuth) is treated as
   * unsafe-for-sync: the gate stays closed. The SPA continues in
   * a read-only-persistence mode until auth resolves to a known
   * identity or transitions to unauthenticated.
   */
  private onAuthStateChange(next: AuthState): void {
    this.cancelPending();

    const wasHydrated = this.hydratedForUserId !== null;
    this.hydratedForUserId = null;

    if (next.kind === 'authenticated' && next.userId !== undefined) {
      // hydrate's updateFromRemote will replace the store; no
      // explicit reset needed on this branch.
      this.hydrate(next.userId);
    } else if (wasHydrated) {
      // We were synced to an identity; we're not anymore. Clear
      // the workspace so the next user (or no-user) doesn't see
      // the prior user's data. Privacy: shared-computer scenario.
      // Engine state is intentionally preserved; see
      // resetWorkspace's docstring for the deployment-model
      // reasoning.
      resetWorkspace();
    }
  }

  /**
   * Fetches the user's document and replaces the store with its
   * contents. Only the latest hydrate generation gets to commit;
   * older ones (superseded by an intervening auth flip) are
   * discarded silently because the rest of the system has already
   * moved on.
   */
  private async hydrate(userId: number): Promise<void> {
    const gen = ++this.hydrationGeneration;
    try {
      const doc = await api.request<any>('GET', `/documents/${this.docKey}`);
      if (gen !== this.hydrationGeneration) return;  // superseded
      if (doc && doc.data) updateFromRemote(doc.data);
      this.hydratedForUserId = userId;
      console.log('[Sync] Hydration complete for user', userId);
      pushSystemMessage('info', i18n.global.t('sync.workspaceLoaded'));
    } catch (err) {
      if (gen !== this.hydrationGeneration) return;
      console.error('[Sync] Hydration failed:', err);
      pushSystemMessage('error', i18n.global.t('sync.workspaceLoadFailed'));
    }
  }

  private cancelPending(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  /**
   * Subscribe to the full reactive surface that participates in
   * sync.
   *
   * Why one watcher instead of three:
   *   The previous implementation ran three independent watchers
   *   (boards, profile, session) — each with its own debounce
   *   slot, each calling the same sendSync() which always
   *   serializes the entire blob. Because the PUT is monolithic,
   *   per-channel timers produced only drawbacks:
   *     (a) no bandwidth saving — every PUT sent everything;
   *     (b) redundant PUTs when two channels fired in the same
   *         debounce window (e.g., boards at t=0 and profile at
   *         t=0.5s produced one PUT at t=1s AND another at
   *         t=1.5s, both containing the same merged state).
   *   A single watcher + single debounce slot produces exactly
   *   one PUT per user-perceptible change batch, which is what
   *   we want.
   *
   * Why deep watches on profile and session:
   *   boardsVersion is an explicit version counter bumped by
   *   every board mutation, so a shallow watch suffices. profile
   *   and session are deep reactive trees without version
   *   counters, so they need deep watches to catch nested edits.
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
    // Identity-aware gate. No save unless we are authenticated
    // with a known userId AND we have hydrated specifically for
    // that user. Cross-identity persistence is structurally
    // impossible past this point.
    const state = this.auth.state.value;
    if (state.kind !== 'authenticated' || state.userId === undefined) return;
    if (this.hydratedForUserId !== state.userId) return;

    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);

    const interval = store.profile.settings.persistence?.debounceInterval ?? 1000;
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      this.sendSync();
    }, interval);
  }

  /**
   * Fire a sync immediately, cancelling any pending debounce.
   * Used by the Settings tab's "Force Persistence" button.
   */
  public forceSave() {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.sendSync();
  }

  /**
   * Compiles the full application state and pushes it via PUT
   * /documents/{key}.
   *
   * ─── CONCURRENCY CONTRACT: last-write-wins, single-tab-per-tenant ──
   * Sync has no conflict detection. Two browser tabs open
   * against the same account will silently overwrite each
   * other's state — whichever debounced sendSync() fires last
   * replaces the backend's document entirely. There is no ETag,
   * vector clock, or merge logic on this path.
   *
   * If multi-tab usage becomes a real workflow, the standard fix
   * is ETag-based conditional PUTs: backend grows a 412 response
   * on conflict, frontend grows a merge-or-retry loop here
   * (re-fetch the document, reconcile with local state, PUT
   * again with the new ETag). Until that happens, the single-tab
   * invariant above holds unconditionally and callers can rely
   * on it.
   * ──────────────────────────────────────────────────────────────────
   *
   * User-visible surfacing (item 20):
   *   - Success path is intentionally silent in the system log
   *     (a toast on every debounced save would be spam). Dev-mode
   *     console.log is preserved for debugging.
   *   - Failure emits an 'error' with a user-level description.
   *     The low-level API error from api-client accompanies it.
   */
  private async sendSync() {
    // Defense in depth: `scheduleSync` should have already gated
    // us out of this function if the identity invariant doesn't
    // hold. If we reach here in a violated state, the gate has a
    // bug; surface loudly per ADR-0002 and refuse to PUT — the
    // alternative is exactly the silent-data-loss class of bug
    // this service was rewritten to prevent.
    const state = this.auth.state.value;
    if (state.kind !== 'authenticated' ||
        state.userId === undefined ||
        this.hydratedForUserId !== state.userId) {
      console.error('[Sync] Aborted save: identity-state assertion failed', {
        authKind: state.kind,
        authUserId: state.kind === 'authenticated' ? state.userId : undefined,
        hydratedForUserId: this.hydratedForUserId,
      });
      pushSystemMessage('error', i18n.global.t('sync.abortedSaveIdentityGate'));
      return;
    }

    const payload = buildPersistencePayload();

    try {
      await api.request('PUT', `/documents/${this.docKey}`, { data: payload });
      if (import.meta.env.DEV) console.log('[Sync] Document saved.');
    } catch (err) {
      console.error('[Sync] Failed to save document:', err);
      pushSystemMessage('error', i18n.global.t('sync.saveFailed'));
    }
  }
}
