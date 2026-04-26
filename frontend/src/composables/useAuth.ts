/**
 * src/composables/useAuth.ts
 * Authentication subsystem — the single source of truth for "who is the
 * SPA logged in as." Owns reactive AuthState; wraps the lower-level
 * api-client.ts auth methods so the state stays synchronized with the
 * JWT in localStorage.
 *
 * ─── Architectural placement (per ADR-0001 and ADR-0003) ─────────────────────
 * Auth state is intentionally NOT in the GlobalStore:
 *
 *   - The GlobalStore is what SyncService PUTs to /documents/{key}. Auth
 *     identity is reconstructed from the JWT in localStorage on every
 *     page load; persisting it through the workspace blob would create
 *     a second source of truth that could disagree with the JWT.
 *   - Auth is meta-state (it determines WHICH user's GlobalStore is
 *     loaded), not user-data state. Conflating them blurs a domain
 *     boundary that's currently honest.
 *   - Per ADR-0001's "Pinia revisit" note, a Pinia store would expose
 *     exactly this pattern (composable-owned reactive state with typed
 *     actions). Keeping auth here means a future Pinia migration is a
 *     local rewrite, not a cross-system refactor.
 *
 * Precedent: `boardsVersion = ref(0)` in `store/index.ts` is also a
 * top-level reactive ref outside the GlobalStore object; the pattern is
 * recognized.
 *
 * ─── Public surface (after B5) ───────────────────────────────────────────────
 *   - `state`            — readonly Ref over the discriminated union.
 *   - `isAuthenticated`, `username` — convenience computed views.
 *   - `tryAutoLogin()`   — bootstrap entry point used by App.vue.
 *   - `login(u, p?)`     — sign in as the given user; replaces JWT.
 *   - `register(u, p?)`  — create account, then sign in. Two-step;
 *                          partial-success ("registered but auto-sign-in
 *                          failed") is reported honestly per ADR-0002.
 *   - `logout()`         — clear JWT and cached username; transition
 *                          to 'unauthenticated'. Synchronous.
 *
 * All three success-path actions (tryAutoLogin, login, register)
 * compose with an internal verify step that calls /auth/me to confirm
 * the JWT-bearer's identity. The verified userId is set on the
 * authenticated state when verify succeeds; absent when verify
 * fails for non-401 reasons (network, 5xx) — in which case we trust
 * the typed/cached identity but flag the unverified state via the
 * system log per ADR-0002. A 401 on verify drops the JWT and
 * transitions to unauthenticated.
 *
 * ─── Storage boundary ────────────────────────────────────────────────────────
 * This file does not touch localStorage directly in either direction.
 * Reads go through `api.cachedUsername()`; writes go through
 * `api.clearToken()` and the side effects of `api.login()` /
 * `api.register()`. The storage-key invariant has one enforcement
 * site, in api-client.ts.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, readonly, type ComputedRef, type Ref } from 'vue';
import { api } from '../services/api-client';
import { pushSystemMessage } from '../store';
import type { AuthState } from '../types';

// ─── Module-scoped state ─────────────────────────────────────────────────────
// Exactly one auth identity exists per SPA instance, just as exactly one
// JWT exists in localStorage. The state is private; the public functions
// below are the only writers.
const _authState = ref<AuthState>({ kind: 'unknown' });

// ─── State transition (private) ──────────────────────────────────────────────

function setState(next: AuthState): void {
  _authState.value = next;
}

// ─── Verify-and-transition helper (private, B5) ──────────────────────────────

/**
 * After a JWT has been obtained (via login, register, or
 * ensureAuthenticated), call /auth/me to confirm identity and set
 * the authenticated state with the verified userId.
 *
 * Three branches, all bounded:
 *
 *   200 → setState authenticated{username from /auth/me, userId from
 *         /auth/me}. The backend's claim overrides the typed/cached
 *         username — this is the stale-token-drift fix.
 *
 *   401 → token rejected by server. api.request has already cleared
 *         the JWT internally; we additionally clear the cached
 *         username (via api.clearToken, which is idempotent on the
 *         JWT side), transition to unauthenticated, and surface a
 *         warning. The user can recover via the LoginModal.
 *
 *   other (network, 5xx) → can't verify, but the JWT is presumed
 *         valid (it just succeeded one call ago, in the login case;
 *         or ensureAuthenticated installed it). Trust the typed
 *         identity, leave userId undefined, flag the unverified
 *         state via system log per ADR-0002.
 *
 * The 401 detection keys on the error message format thrown by
 * api.request ("API Error 401: ..."). Brittle in principle but the
 * format is part of api-client's shipped contract; a deliberate
 * refactor that changes it would also update this site.
 */
async function _setAuthenticatedAfterVerify(typedUsername: string): Promise<void> {
  try {
    const me = await api.getMe();
    setState({ kind: 'authenticated', username: me.username, userId: me.id });
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('API Error 401')) {
      // Token is invalid by the server's reckoning; the cached
      // identity is meaningless. Clear and route to unauthenticated.
      api.clearToken();
      setState({ kind: 'unauthenticated' });
      pushSystemMessage(
        'warning',
        'Session not recognised by the server. Please sign in again.'
      );
      return;
    }

    // Verify failed for a non-auth reason. The token is presumed
    // valid; trust the typed identity but flag the gap.
    pushSystemMessage(
      'warning',
      `Could not verify identity with server (${msg}). Using cached identity.`
    );
    setState({ kind: 'authenticated', username: typedUsername });
  }
}

// ─── Bootstrap action (public) ───────────────────────────────────────────────

/**
 * Bootstrap-time entry point. Replaces direct calls to
 * `api.ensureAuthenticated()` at startup; the difference is that the
 * outcome is observable on `state` rather than only as a side effect.
 *
 * Behavior:
 *   - Transitions through `authenticating` while the underlying
 *     calls are in flight.
 *   - Delegates the auto-register-then-login dance to
 *     `api.ensureAuthenticated()`. That method swallows its inner
 *     errors (it predates this composable); we therefore consult
 *     `api.cachedUsername()` afterwards as the source of truth for
 *     whether a token was actually obtained.
 *   - On token present → invokes the verify step, which sets the
 *     final state (authenticated with userId, or unauthenticated on
 *     401, or authenticated without userId on other verify failure).
 *   - On no token → emits an error system message and transitions
 *     to error state.
 *
 * The verified username from /auth/me overrides the cached one,
 * which closes the stale-token-drift failure mode that motivated
 * this whole refactor.
 */
async function tryAutoLogin(): Promise<void> {
  setState({ kind: 'authenticating' });

  try {
    await api.ensureAuthenticated();
  } catch (err) {
    // Defensive: api.ensureAuthenticated() currently swallows its inner
    // errors and only console.errors. This catch handles any future
    // change that starts throwing. Either way, the cachedUsername
    // check below is the source of truth for whether a login completed.
    void err;
  }

  const username = api.cachedUsername();
  if (!username) {
    // No cached username means ensureAuthenticated didn't complete a
    // successful login.
    const message = 'Auto-login failed; no JWT obtained.';
    pushSystemMessage('error', message);
    setState({ kind: 'error', message });
    return;
  }

  await _setAuthenticatedAfterVerify(username);
}

// ─── Explicit sign-in / register actions (public) ───────────────────────────

/**
 * Sign in as the given user. Transitions:
 *   any → authenticating → authenticated  (success, with verified userId)
 *   any → authenticating → unauthenticated (login succeeded, verify 401)
 *   any → authenticating → error           (login failed)
 *
 * If the SPA was previously authenticated as a different user, this
 * effectively switches identity — `api.login` overwrites the cached
 * JWT and username in localStorage as part of its success path; the
 * subsequent verify confirms the new identity with the backend.
 *
 * Errors from api.login itself are surfaced via `pushSystemMessage`
 * and reflected on `state.kind === 'error'`. The throw is re-raised
 * so callers (the LoginModal) can suppress the modal's "close on
 * success" branch.
 */
async function login(username: string, password?: string): Promise<void> {
  setState({ kind: 'authenticating' });
  try {
    await api.login(username, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `Sign-in failed: ${message}`);
    setState({ kind: 'error', message });
    throw err;
  }

  // Login succeeded; verify identity to set userId and to confirm
  // the backend's claim over the typed username.
  await _setAuthenticatedAfterVerify(username);
}

/**
 * Register a new account, then sign in. Composed of three distinct
 * API steps so partial success is reported honestly per ADR-0002:
 *
 *   - api.register fails        → error: "Registration failed: …"
 *   - api.register succeeds but
 *     api.login fails           → error: "Registered, but
 *                                  auto-sign-in failed: …"
 *   - login succeeds, verify    → handled by the verify helper
 *     401 / non-401              (see _setAuthenticatedAfterVerify)
 *
 * The user account exists on the backend in the "registered but
 * sign-in failed" case; reporting "Registration failed" would be a
 * lie. The user can recover by clicking Sign In on the next attempt.
 */
async function register(username: string, password?: string): Promise<void> {
  setState({ kind: 'authenticating' });

  try {
    await api.register(username, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `Registration failed: ${message}`);
    setState({ kind: 'error', message });
    throw err;
  }

  // Registration succeeded; account now exists on the backend.
  try {
    await api.login(username, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `Registered, but auto-sign-in failed: ${message}`);
    setState({ kind: 'error', message });
    throw err;
  }

  // Login succeeded; verify identity to set userId.
  await _setAuthenticatedAfterVerify(username);
}

// ─── Logout action (public, B4) ──────────────────────────────────────────────

/**
 * Clear the JWT and cached identity. Returns the SPA to the
 * 'unauthenticated' state. Synchronous — no network round-trip; the
 * JWT itself remains valid on the backend until its expiry, but we
 * stop presenting it.
 *
 * Delegates the localStorage side effect to `api.clearToken()`, which
 * owns those keys.
 */
function logout(): void {
  api.clearToken();
  setState({ kind: 'unauthenticated' });
  pushSystemMessage('info', 'Signed out.');
}

// ─── Public composable ───────────────────────────────────────────────────────

export interface UseAuth {
  readonly state: Readonly<Ref<AuthState>>;
  readonly isAuthenticated: ComputedRef<boolean>;
  readonly username: ComputedRef<string | null>;
  tryAutoLogin(): Promise<void>;
  login(username: string, password?: string): Promise<void>;
  register(username: string, password?: string): Promise<void>;
  logout(): void;
}

export function useAuth(): UseAuth {
  return {
    state: readonly(_authState) as Readonly<Ref<AuthState>>,
    isAuthenticated: computed(() => _authState.value.kind === 'authenticated'),
    username: computed(() =>
      _authState.value.kind === 'authenticated' ? _authState.value.username : null
    ),
    tryAutoLogin,
    login,
    register,
    logout,
  };
}
