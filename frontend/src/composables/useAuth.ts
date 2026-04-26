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
 * ─── B1 surface (current commit) ─────────────────────────────────────────────
 * Public:
 *   - `state` — readonly Ref over the discriminated union.
 *   - `isAuthenticated`, `username` — convenience computed views.
 *   - `tryAutoLogin` — bootstrap entry point used by App.vue.
 *
 * Deferred to later milestones:
 *   - login(), register()  → exposed publicly in B3 (LoginModal).
 *   - logout()             → exposed in B4, alongside an `api.clearToken`
 *                            method on api-client.ts (so this file does
 *                            not reach into api-client's localStorage
 *                            keys directly).
 *   - JWT identity verification via /auth/me → B5; closes the
 *                            stale-token-drift failure mode that motivated
 *                            this whole refactor.
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

// localStorage keys mirror the constants in api-client.ts. Documented as
// duplicated here so a future grep finds both sites; consolidation is a
// follow-up cleanup (B4 will introduce `api.clearToken()` as the single
// owner of the JWT key).
const TOKEN_KEY = 'ebisu_jwt_token';
const USER_KEY = 'ebisu_username';
const DEFAULT_USERNAME = 'local_user';

// ─── State transition (private) ──────────────────────────────────────────────

function setState(next: AuthState): void {
  _authState.value = next;
}

// ─── Bootstrap action (public) ───────────────────────────────────────────────

/**
 * Bootstrap-time entry point. Replaces direct calls to
 * `api.ensureAuthenticated()` at startup; the difference is that the
 * outcome is observable on `state` rather than only as a side effect.
 *
 * Behavior:
 *   - Transitions through `authenticating` while the underlying call
 *     is in flight.
 *   - Delegates the auto-register-then-login dance to
 *     `api.ensureAuthenticated()`. That method swallows its inner
 *     errors (it predates this composable); we therefore consult
 *     localStorage directly afterwards as the source of truth for
 *     whether a token was actually obtained.
 *   - On success → `{ kind: 'authenticated', username }`, where the
 *     username is whatever `api.login()` cached (defaults to
 *     DEFAULT_USERNAME if the cache is empty for any reason).
 *   - On failure → `{ kind: 'error', message }` and a system-log
 *     surface, per ADR-0002.
 *
 * Note: the username here reflects what the SPA *typed* at login,
 * not what the JWT *claims*. They can drift on stale tokens — which
 * is the failure mode the planned /auth/me endpoint (B5) closes.
 */
async function tryAutoLogin(): Promise<void> {
  setState({ kind: 'authenticating' });

  try {
    await api.ensureAuthenticated();
  } catch (err) {
    // Defensive: api.ensureAuthenticated() currently swallows its inner
    // errors and only console.errors. This catch handles any future
    // change that starts throwing. Either way, the localStorage check
    // below is the source of truth for whether a token exists.
    void err;
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const username = localStorage.getItem(USER_KEY) ?? DEFAULT_USERNAME;
    setState({ kind: 'authenticated', username });
    return;
  }

  const message = 'Auto-login failed; no JWT obtained.';
  pushSystemMessage('error', message);
  setState({ kind: 'error', message });
}

// ─── Public composable ───────────────────────────────────────────────────────

export interface UseAuth {
  readonly state: Readonly<Ref<AuthState>>;
  readonly isAuthenticated: ComputedRef<boolean>;
  readonly username: ComputedRef<string | null>;
  tryAutoLogin(): Promise<void>;
}

export function useAuth(): UseAuth {
  return {
    state: readonly(_authState) as Readonly<Ref<AuthState>>,
    isAuthenticated: computed(() => _authState.value.kind === 'authenticated'),
    username: computed(() =>
      _authState.value.kind === 'authenticated' ? _authState.value.username : null
    ),
    tryAutoLogin,
  };
}
