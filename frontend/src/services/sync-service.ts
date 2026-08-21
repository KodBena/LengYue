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
  sessionVersion,
  updateFromRemote,
  pushSystemMessage,
  resetWorkspace,
  buildPersistencePayload,
} from '../store';
import { FutureSchemaVersionError } from '../store/migrations';
import { api } from './api-client';
import { i18n } from '../i18n';
import type { useAuth } from '../composables/auth-app/useAuth';
import type { AuthState } from '../types';

/**
 * Typed persist-suppression gate (work item `next-futureblob-recovery`,
 * ratified program row 1937, incident row 1942). `'unsuppressed'` is
 * the ordinary operating state; `'suppressed-future-version'` is
 * entered the MOMENT `hydrate()`'s catch leg detects a
 * `FutureSchemaVersionError` (not deferred until the user clicks
 * "continue on defaults" — the commission's "fail-loud and
 * non-destructive BY DEFAULT" means suppression starts at detection,
 * before any background write a boot-time composable might otherwise
 * attempt while the blocking recovery gate is up) and checked FIRST,
 * at the top of `sendSync()` — the sole PUT call site for the workspace
 * document in the whole frontend tree (verified: `grep -rn
 * "documents/\${" src` finds exactly one `api.request('PUT', ...)`
 * call, in this file). A future write path would have to route
 * through `sendSync()` to reach the network at all, so gating there
 * closes the class for every caller this codebase can currently
 * construct — see the closure statement in
 * `.claude/dispatch-reports/next-futureblob-recovery.md` for the full
 * quantification-universe accounting (debounced watcher vs
 * `forceSave()`/`retrySave()`, both of which already funnel through
 * this one function).
 *
 * Deliberately a NAMED typed field, not a boolean: a boolean the next
 * writer forgets to check is exactly the silent-failure shape ADR-0002
 * forbids. This type is checked at the one chokepoint that matters,
 * and carries the two facts (`blobVersion` / `appVersion`) the loud
 * refusal message names — no second source of truth to drift from
 * `store.workspaceLoadState`'s `future-version` leg (this field is
 * SyncService's own copy, set at the same moment as the store write,
 * because `sendSync()` must not depend on `store.workspaceLoadState`
 * still reading `future-version` by the time it fires — the user may
 * have already dismissed the recovery gate into 'loaded' via
 * `continueOnDefaults()`, and suppression must survive that
 * transition).
 */
type PersistSuppressionState =
  | { readonly kind: 'unsuppressed' }
  | { readonly kind: 'suppressed-future-version'; readonly blobVersion: number; readonly appVersion: number };

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

  /**
   * Persist-suppression gate — see `PersistSuppressionState`'s
   * doc comment above. `'unsuppressed'` at construction and
   * whenever an identity transition resets it (`onAuthStateChange`);
   * set to `'suppressed-future-version'` by `hydrate()`'s catch leg
   * at the moment a `FutureSchemaVersionError` is detected, and
   * re-affirmed (idempotently) by `continueOnDefaults()`.
   */
  private persistSuppression: PersistSuppressionState = { kind: 'unsuppressed' };

  /**
   * The userId a `future-version` recovery prompt is pending for.
   * Captured in `hydrate()`'s catch leg (the only writer) so the two
   * recovery actions (`continueOnDefaults()` /
   * `resetServerWorkspaceToDefaults()`) know which identity to
   * operate as without threading the value back through App.vue's
   * template bindings. Cleared by both recovery actions once they've
   * consumed it.
   */
  private futureVersionUserId: number | null = null;

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
    // Every identity transition retires any suppression / pending
    // recovery-prompt state from the PRIOR identity's session — a
    // future-version blob for user A must not suppress user B's
    // saves after a logout/login, and a stale `futureVersionUserId`
    // must not let a later call resolve against the wrong identity.
    // `continueOnDefaults()` / `resetServerWorkspaceToDefaults()` are
    // both only reachable from the recovery-prompt UI, which itself
    // only renders while `workspaceLoadState.kind === 'future-version'`
    // — a state this same transition (see below) always moves away
    // from — so this reset closes the class rather than relying on
    // that UI-reachability alone.
    this.persistSuppression = { kind: 'unsuppressed' };
    this.futureVersionUserId = null;

    if (next.kind === 'authenticated' && next.userId !== undefined) {
      // hydrate's updateFromRemote will replace the store; no
      // explicit reset needed on this branch. Fire-and-forget; hydrate
      // self-handles (catch → system message). void = intentional non-await.
      // hydrate() itself owns the workspaceLoadState transition
      // ('loading' → 'loaded'/'error') for this branch.
      void this.hydrate(next.userId);
      return;
    }

    if (wasHydrated) {
      // We were synced to an identity; we're not anymore. Clear
      // the workspace so the next user (or no-user) doesn't see
      // the prior user's data. Privacy: shared-computer scenario.
      // Engine state is intentionally preserved; see
      // resetWorkspace's docstring for the deployment-model
      // reasoning. resetWorkspace() sets workspaceLoadState back to
      // 'loaded' (nothing pending) as part of its reset.
      resetWorkspace();
    } else {
      // ADR-0019 audit S1: no identity to hydrate for in this auth
      // state (unauthenticated / authenticating / error / the
      // userId-less authenticated edge case), and we were never
      // hydrated this session, so resetWorkspace() above doesn't run
      // either. Without this, workspaceLoadState would be stuck at
      // its module-init 'loading' value forever on an unauthenticated
      // cold start, and App.vue's gate would spin indefinitely. The
      // store's built-in default workspace IS the honest state here
      // (there's nothing else to show), so mark it loaded.
      store.workspaceLoadState = { kind: 'loaded' };
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
    // ADR-0019 audit S1: mark the fetch in flight BEFORE the await so
    // App.vue's gate holds the loading state (or re-enters it, on a
    // user-triggered retry after 'error') for the whole request, not
    // just after it resolves.
    store.workspaceLoadState = { kind: 'loading' };
    try {
      const doc = await api.request<any>('GET', `/documents/${this.docKey}`);
      if (gen !== this.hydrationGeneration) return;  // superseded
      if (doc && doc.data) updateFromRemote(doc.data);
      this.hydratedForUserId = userId;
      store.workspaceLoadState = { kind: 'loaded' };
      pushSystemMessage('info', i18n.global.t('sync.workspaceLoaded'));
    } catch (err) {
      if (gen !== this.hydrationGeneration) return;

      // Typed boot outcome (work item `next-futureblob-recovery`,
      // ratified program row 1937, incident row 1942): a
      // `FutureSchemaVersionError` means the DOCUMENT is fine and the
      // walker did its job (fail loud, per ADR-0002) — this is an
      // expected disagreement between two live app versions sharing
      // one backend, not an ordinary fetch/parse failure. Route it to
      // its own `WorkspaceLoadState` leg so `App.vue` renders the
      // two-choice recovery gate instead of the generic error banner
      // with a Retry button that would just re-throw the same error.
      //
      // `hydratedForUserId` is deliberately set here (not left null):
      // it lets the debounced-save pipeline (`scheduleSync`) actually
      // reach `sendSync()` on subsequent edits, so `persistSuppression`
      // — the real authority — gets to refuse LOUDLY on every attempt
      // (per the recovery-mode contract) rather than the identity gate
      // silently absorbing the attempt further upstream, which would
      // read as "the app just isn't saving" with no audible trace.
      if (err instanceof FutureSchemaVersionError) {
        console.error(
          '[Sync] Hydration blocked: workspace document is from a newer app ' +
          'version than this build. Entering recovery mode.', err,
        );
        this.hydratedForUserId = userId;
        this.futureVersionUserId = userId;
        // Suppression begins HERE, at detection — not deferred until the
        // user clicks "continue on defaults". "Fail-loud and
        // non-destructive BY DEFAULT" (the commission's own wording)
        // means the default posture starts the instant the condition
        // is detected: nothing may overwrite the newer server blob
        // before the user has made an explicit choice, including any
        // background write a boot-time composable might otherwise
        // trigger while the blocking recovery gate is up.
        // `continueOnDefaults()` re-affirms this same value (harmless
        // idempotent write) when the user later makes it explicit.
        this.persistSuppression = {
          kind: 'suppressed-future-version',
          blobVersion: err.blobVersion,
          appVersion: err.appVersion,
        };
        store.workspaceLoadState = {
          kind: 'future-version',
          blobVersion: err.blobVersion,
          appVersion: err.appVersion,
        };
        pushSystemMessage('error', i18n.global.t('sync.workspaceFutureVersion', {
          blobVersion: err.blobVersion,
          appVersion: err.appVersion,
        }));
        return;
      }

      console.error('[Sync] Hydration failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      store.workspaceLoadState = { kind: 'error', message };
      pushSystemMessage('error', i18n.global.t('sync.workspaceLoadFailed'));
    }
  }

  /**
   * DEFAULT recovery action for a `future-version` load state (work
   * item `next-futureblob-recovery`): continue this session on the
   * store's in-memory defaults with persistence SUPPRESSED. The
   * newer blob already on the server is never overwritten — this
   * branch performs no network write at all. Both branches sharing
   * the backend stay usable: the other (newer) branch's data is
   * untouched, and this session gets a working (if unsynced) app
   * instead of a dead one.
   *
   * `resetWorkspace()` gives an honestly-clean in-memory workspace
   * (the store was never mutated by the failed hydrate — `migrate()`
   * throws before `updateFromRemote` touches `store` — but calling it
   * anyway is the honest, self-documenting way to say "this session's
   * workspace is the default," not an assumption about what state the
   * store happened to be left in). It also sets `workspaceSaveState`
   * back to `'synced'`, which the `suppressed` write immediately
   * below supersedes.
   */
  public continueOnDefaults(): void {
    const loadState = store.workspaceLoadState;
    if (loadState.kind !== 'future-version') return; // only meaningful from the recovery prompt
    const { blobVersion, appVersion } = loadState;

    resetWorkspace();
    store.workspaceLoadState = { kind: 'loaded' };
    store.workspaceSaveState = { kind: 'suppressed', blobVersion, appVersion };
    // Re-affirms (idempotent) the suppression `hydrate()`'s catch leg
    // already set at detection time — see `PersistSuppressionState`'s
    // doc comment for why suppression starts there, not here.
    this.persistSuppression = { kind: 'suppressed-future-version', blobVersion, appVersion };

    pushSystemMessage('warning', i18n.global.t('sync.continuingOnDefaults', {
      blobVersion, appVersion,
    }));
  }

  /**
   * EXPLICIT destructive recovery action for a `future-version` load
   * state (work item `next-futureblob-recovery`): reset the SERVER
   * workspace to defaults, overwriting the newer blob. Callers own
   * the confirmation step (`App.vue` routes this through
   * `useAppDialogs().confirm({ danger: true, ... })` — see the
   * commission's requirement for "a clear confirmation, honest
   * wording about what is lost").
   *
   * Lifts suppression (there is nothing left to protect — the newer
   * blob this session was refusing to overwrite no longer exists
   * once this PUT lands) and marks this identity hydrated so the
   * normal debounced-save pipeline resumes for the rest of the
   * session.
   */
  public resetServerWorkspaceToDefaults(): void {
    const userId = this.futureVersionUserId;
    if (userId === null) return; // defensive: only reachable from the recovery prompt

    resetWorkspace();
    this.persistSuppression = { kind: 'unsuppressed' };
    this.hydratedForUserId = userId;
    this.futureVersionUserId = null;
    // Immediate PUT, not the debounced path — the whole point of this
    // action is that the server's newer blob is overwritten NOW, not
    // whenever the debounce interval next elapses.
    this.forceSave();
  }

  /**
   * Retries the workspace fetch after a failed hydration (ADR-0019
   * audit S1 error path, C8: explicit error state with retry, never
   * silently re-showing the stale/default paint). Only meaningful
   * when the current identity is authenticated with a known userId —
   * App.vue only renders the retry affordance while
   * `workspaceLoadState.kind === 'error'`, which only this class's
   * own `hydrate()` can produce, so the guard here is defense in
   * depth rather than a reachable no-op path.
   */
  public retryHydrate(): void {
    const state = this.auth.state.value;
    if (state.kind === 'authenticated' && state.userId !== undefined) {
      // Fire-and-forget; hydrate self-handles (catch → message + error state).
      void this.hydrate(state.userId);
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
   * Why one DEBOUNCE SLOT, not three:
   *   The original implementation ran three independent watchers
   *   (boards, profile, session) — each with its OWN debounce slot,
   *   each calling the same sendSync() which always serializes the
   *   entire blob. Because the PUT is monolithic, per-channel timers
   *   produced only drawbacks:
   *     (a) no bandwidth saving — every PUT sent everything;
   *     (b) redundant PUTs when two channels fired in the same
   *         debounce window (e.g., boards at t=0 and profile at
   *         t=0.5s produced one PUT at t=1s AND another at
   *         t=1.5s, both containing the same merged state).
   *   The fix was a SINGLE debounce slot, not necessarily a single
   *   `watch` — what matters is that every channel funnels through
   *   `scheduleSync`, which cancels+reschedules the one
   *   `pendingTimer`, so exactly one PUT lands per change batch. The
   *   current shape uses two `watch` calls (the shallow board/session
   *   counter watch + the deep profile watch, split for the perf
   *   reason below), both routed through that one slot — so the
   *   one-PUT-per-batch property is unchanged.
   *
   * Why a shallow version-counter watch for boards AND session, but
   * a deep watch for profile:
   *   `boardsVersion` and `sessionVersion` are explicit version
   *   counters (`store/index.ts`) bumped by every board / session
   *   mutation that should persist, so a SHALLOW read of their
   *   `.value` suffices — no traversal. `store.session` specifically
   *   moved off a deep watch because it holds three PER-BOARD
   *   dictionaries (`session.reviews`, `session.ui.cardTreeNav`,
   *   `session.ui.forestNav.selection`); deep-traversing them was
   *   O(open-board count) per fire and O(N²) over a close-all — the
   *   dominant close-at-scale cost (see `sessionVersion`'s docstring
   *   and `composables/perf/closeAtScale.ts`). The
   *   persistence-correctness contract — every session write bumps
   *   `sessionVersion` — is pinned by
   *   `tests/integration/sync-session-version.test.ts`.
   *   `store.profile` keeps a deep watch: it is workspace-global
   *   (settings + decks), O(1) in open-board count, so its deep
   *   traversal does not scale with the board rail; a counter would
   *   only add write-site discipline with no perf payoff.
   *
   * Why two watches still share one debounce:
   *   Both call `scheduleSync()`, which cancels and reschedules the
   *   single `pendingTimer` slot — so the one-PUT-per-change-batch
   *   property the single-watcher scheme bought (see above) is
   *   preserved: whichever watch fires last in a debounce window
   *   owns the slot, and exactly one PUT lands.
   */
  private startWatcher() {
    // Boards + session via their shallow version counters, plus the
    // directly-watched active-board index. No traversal.
    watch(
      () => [
        boardsVersion.value,
        sessionVersion.value,
        store.activeBoardIndex,
      ],
      () => this.scheduleSync(),
    );

    // Profile keeps a deep watch — workspace-global, O(1) in board
    // count (see the docstring above). Shares the one debounce slot
    // via `scheduleSync`.
    watch(
      () => store.profile,
      () => this.scheduleSync(),
      { deep: true },
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
      // Fire-and-forget (debounced); sendSync self-handles (catch → message).
      void this.sendSync();
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
    // Fire-and-forget; sendSync self-handles (catch → system message).
    void this.sendSync();
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
   * User-visible surfacing (item 20; menus-ui audit M14):
   *   - Success path is intentionally silent in the system log
   *     (a toast on every debounced save would be spam). Dev-mode
   *     console.log is preserved for debugging. It DOES clear
   *     `store.workspaceSaveState` back to 'synced', retiring any
   *     banner a prior failure raised.
   *   - Failure emits an 'error' system-log message AND sets
   *     `store.workspaceSaveState = { kind: 'error', message }` —
   *     the durable, App.vue-rendered banner (Retry via
   *     `retrySave()`). The system-log entry is transient (times out
   *     per `useTransientLogReveal`); the save-state banner is the
   *     one home for "the workspace has an unsaved/failed write"
   *     and persists until the next successful save.
   */
  private async sendSync() {
    // Persist-suppression gate (work item `next-futureblob-recovery`;
    // see `PersistSuppressionState`'s doc comment at the top of this
    // file). Checked FIRST, ahead of the identity assertion below:
    // this is the sole PUT call site for the workspace document in
    // the frontend, so every attempt to persist — whether from the
    // debounced watcher or a manual `forceSave()`/`retrySave()` — is
    // refused HERE, loudly, for as long as suppression is active. The
    // newer blob on the server is never silently overwritten.
    if (this.persistSuppression.kind !== 'unsuppressed') {
      console.error(
        '[Sync] Persist refused: suppressed (workspace document is a ' +
        'newer schema version than this app build; recovery mode is ' +
        'active).', this.persistSuppression,
      );
      // Deliberately NOT re-pushing a system-log message on every
      // refused attempt — the persistent `workspaceSaveState`
      // 'suppressed' banner (set once, at the moment suppression
      // began, by `continueOnDefaults()`) is the durable, non-toast
      // home for this fact per the commission's "not a
      // dismissed-and-forgotten toast" requirement. The console.error
      // above is the per-attempt loud signal.
      return;
    }

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
      // Clears a prior 'error' banner (menus-ui audit M14): the fact
      // "the workspace has an unsaved/failed write" is retired exactly
      // when a write actually lands, not merely when a new one is
      // queued — see WorkspaceSaveState's lifecycle doc.
      store.workspaceSaveState = { kind: 'synced' };
    } catch (err) {
      console.error('[Sync] Failed to save document:', err);
      const message = err instanceof Error ? err.message : String(err);
      store.workspaceSaveState = { kind: 'error', message };
      pushSystemMessage('error', i18n.global.t('sync.saveFailed'));
    }
  }

  /**
   * Retries the most recent (failed) save (menus-ui audit M14, the
   * write-path counterpart of `retryHydrate()` above). Manual retry,
   * matching the load-path precedent's own idiom rather than inventing
   * a second interaction model in the same app: `store.workspaceSaveState
   * .kind === 'error'` drives App.vue's banner, which offers exactly
   * this button. Rebuilds and resends the CURRENT payload — not a
   * replay of the failed one — since local edits may have continued
   * to accumulate while the banner was up; that is the correct
   * behaviour precisely because the debounced watcher never stopped
   * scheduling saves on top of the error state (only cleared it), so
   * the freshest snapshot is always what should go out next.
   */
  public retrySave(): void {
    this.forceSave();
  }
}
