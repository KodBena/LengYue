/**
 * src/services/api-client.ts
 * Pure REST client for the spaced-repetition backend.
 * Handles JWT injection and Zero-Friction local auth.
 * License: Public Domain (The Unlicense)
 */

import { API_BASE_URL } from '../config/env';
import { pushSystemMessage } from '../store';
import type { components } from '../types/backend';

type AuthMeResponse = components['schemas']['AuthMeResponse'];

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_username';

/**
 * One-shot localStorage compat shim — migrate auth keys from the
 * pre-de-branding identifiers (`ebisu_jwt_token`, `ebisu_username`)
 * to the canonical `auth_token` / `auth_username`. Runs at module
 * init; subsequent reads/writes use the new keys exclusively.
 *
 * Per ADR-0002 documented exception #3 (bounded-and-scheduled-for-
 * removal compat shim). Filed in `docs/notes/deferred-items.md` as
 * a removal target for a future cleanup PR once monitoring confirms
 * no users still carry the legacy keys.
 *
 * The `localStorage.getItem(newKey) === null` guard preserves any
 * already-present new key (e.g., from a partial migration). The
 * legacy key is always removed once observed.
 */
function migrateLegacyAuthKeys(): void {
  const pairs: Array<[string, string]> = [
    ['ebisu_jwt_token', TOKEN_KEY],
    ['ebisu_username', USER_KEY],
  ];
  for (const [oldKey, newKey] of pairs) {
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
      localStorage.removeItem(oldKey);
    }
  }
}

migrateLegacyAuthKeys();

// Cap error-body excerpts so we don't flood the system log with
// multi-kilobyte FastAPI validation payloads. The full body is still
// visible via the thrown Error's message and in the browser's Network
// inspector; this cap is purely about the UI-surface length.
const ERROR_BODY_EXCERPT_MAX = 200;

export class ApiClient {
  private get token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  private set token(val: string | null) {
    if (val) localStorage.setItem(TOKEN_KEY, val);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // Recursion guard for the 401 silent-retry path. When `request` is
  // attempting a re-authentication after a 401, the inner login() call
  // re-enters request() against /auth/token; the flag prevents that
  // inner call from spawning its own retry attempt. The auth-endpoint
  // check (path.startsWith('/auth/')) below would also catch it; the
  // flag is belt-and-suspenders.
  private isReauthInFlight = false;

  // Callback bridge: invoked when a non-auth-endpoint 401 forces the
  // token to be cleared (i.e., the user's session is genuinely no
  // longer valid). useAuth registers a handler at module init that
  // transitions `auth.state` to `'unauthenticated'`, which in turn
  // drives the auth-lifecycle UX (modal auto-open, workspace wipe via
  // SyncService's auth-state watcher). Without this bridge,
  // mid-session 401s would clear the token at the api-client layer
  // while leaving `auth.state` falsely 'authenticated' — the gap
  // surfaced during TODO #28 testing.
  //
  // Skipped for auth endpoints (login / /auth/me): those paths' callers
  // already handle their own state transitions, so firing this callback
  // would produce duplicate setState calls and warning messages.
  private onTokenInvalidatedCallback: (() => void) | null = null;
  public onTokenInvalidated(cb: () => void): void {
    this.onTokenInvalidatedCallback = cb;
  }

  /**
   * Generic request wrapper that automatically injects the JWT.
   *
   * Error surfacing (item 20):
   *   - Network failures (fetch throws before any response) emit an
   *     'error' SystemMessage and rethrow.
   *   - Non-2xx responses emit an 'error' SystemMessage and throw the
   *     same Error shape as before ("API Error ${status}: ${body}"),
   *     preserving backward compatibility for callers that pattern-
   *     match on err.message.
   *   - console.error is kept in both paths as a secondary debug
   *     surface; the system log is primary.
   *
   * 401 silent-retry (TODO item 28):
   *   - On 401 from a non-auth endpoint, attempt one re-login as the
   *     cached identity (`cachedUsername`) and retry the original
   *     request. Identity-honest: preserves who we were authenticated
   *     as, never silently substitutes (the failure mode B5 closed).
   *     For passwordless deployments the re-login succeeds and the
   *     retry runs transparently; for password-protected accounts
   *     (no cached password) the re-login fails and the original 401
   *     falls through to the normal rejection flow.
   *   - ADR-0002 compliance: explicit, bounded, single retry on a
   *     known auth-protocol pattern — not the silent auto-retry the
   *     tenet rejects.
   */
  public async request<T>(method: string, path: string, body?: any): Promise<T> {
    const buildPayload = (): RequestInit => {
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      const payload: RequestInit = { method, headers };
      if (body && !(body instanceof URLSearchParams)) {
        headers['Content-Type'] = 'application/json';
        payload.body = JSON.stringify(body);
      } else if (body instanceof URLSearchParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        payload.body = body;
      }
      return payload;
    };

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, buildPayload());
    } catch (err) {
      // fetch() itself rejected — network unreachable, DNS, CORS, etc.
      // No HTTP status is available in this case.
      const detail = err instanceof Error ? err.message : String(err);
      const userMsg = `Network error on ${method} ${path}: ${detail}`;
      pushSystemMessage('error', userMsg);
      console.error('[API]', userMsg, err);
      throw err;
    }

    // 401 retry: identity-honest single retry. See class JSDoc above.
    const isAuthEndpoint = path.startsWith('/auth/');
    if (response.status === 401 && !this.isReauthInFlight && !isAuthEndpoint) {
      const cached = this.cachedUsername();
      if (cached) {
        this.token = null;
        this.isReauthInFlight = true;
        try {
          await this.login(cached);
          response = await fetch(`${API_BASE_URL}${path}`, buildPayload());
          if (response.ok) {
            pushSystemMessage('info', 'Session refreshed automatically.');
          }
          // If retry returned non-ok, fall through to standard error
          // handling below — the new token didn't help, the user's
          // session is genuinely no longer valid.
        } catch {
          // login() failed (no password cached; password account) or
          // the retry fetch itself threw. Leave `response` as the
          // original 401; the standard !response.ok branch handles it
          // and useAuth's normal rejection flow takes over.
        } finally {
          this.isReauthInFlight = false;
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.token = null; // Token expired/invalid
        // Notify useAuth so it can flip `auth.state` to unauthenticated
        // and drive the auth-lifecycle UX. Auth endpoints' callers
        // handle their own state, so we skip the callback there to
        // avoid duplicate transitions/messages.
        if (!isAuthEndpoint) {
          this.onTokenInvalidatedCallback?.();
        }
      }
      const errText = await response.text();
      const excerpt = errText.length > ERROR_BODY_EXCERPT_MAX
        ? errText.slice(0, ERROR_BODY_EXCERPT_MAX) + '…'
        : errText;
      const userMsg = `API ${method} ${path} → ${response.status}: ${excerpt}`;
      pushSystemMessage('error', userMsg);
      console.error('[API]', userMsg);
      // Thrown message format is preserved verbatim so that callers
      // doing `err.message.includes('404')` continue to work.
      throw new Error(`API Error ${response.status}: ${errText}`);
    }

    return response.json();
  }

  /**
   * Authenticates and stores the JWT.
   */
  public async login(username: string, password?: string): Promise<void> {
    const params = new URLSearchParams();
    params.append('username', username);

    // FastAPI's OAuth2 form strictly requires a non-empty string.
    // For password-less "Open Access" accounts, the backend accepts ANY string.
    params.append('password', password || 'nopassword');

    const res = await this.request<any>('POST', '/auth/token', params);
    this.token = res.access_token;
    localStorage.setItem(USER_KEY, username);
    console.log(`[API] Logged in as ${username}`);
  }

  /**
   * Registers a new user.
   */
  public async register(username: string, password?: string): Promise<void> {
    // The backend accepts omitted/null password to create an Open Access account.
    const body: any = { username };
    if (password) body.password = password;

    await this.request('POST', '/auth/register', body);
    console.log(`[API] Registered ${username}`);
  }

  /**
   * Returns the cached username from localStorage, or null if no
   * login has completed in this browser. Read-side companion to
   * `clearToken()`; together they constitute the public surface for
   * auth-state localStorage access. Outside callers (the useAuth
   * composable) go through these methods rather than touching
   * localStorage directly, so the storage-key invariant has one
   * enforcement site.
   */
  public cachedUsername(): string | null {
    return localStorage.getItem(USER_KEY);
  }

  /**
   * Writes the cached username. Used by useAuth after a successful
   * /auth/me verify to reconcile the cache with the server's
   * source-of-truth value. Preserves the storage-key invariant
   * documented on `cachedUsername()` — only this class touches
   * USER_KEY directly.
   */
  public setCachedUsername(name: string): void {
    localStorage.setItem(USER_KEY, name);
  }

  /**
   * Clears the cached JWT and username. Synchronous; purely
   * client-side. The JWT itself remains valid on the backend until
   * its expiry — we just stop presenting it. A backend revocation
   * endpoint, if added, would be called from useAuth.logout() in
   * addition to this method.
   */
  public clearToken(): void {
    this.token = null;
    localStorage.removeItem(USER_KEY);
    console.log('[API] Token cleared.');
  }

  /**
   * Fetches the JWT-bearer's identity from the backend.
   *
   * Returns the wire-shape AuthMeResponse directly; projection into
   * domain types is done one layer up (in useAuth.ts), matching the
   * codebase's ACL convention where this file does the HTTP and the
   * consumer does the domain translation.
   *
   * Throws on 401 (token rejected by server), on other non-2xx, or
   * on network failure. Callers that need to differentiate must
   * inspect the thrown Error's message — the format is "API Error
   * ${status}: ${body}" per request().
   */
  public async getMe(): Promise<AuthMeResponse> {
    return this.request<AuthMeResponse>('GET', '/auth/me');
  }

  /**
   * Zero-Friction Auth: Ensures we have a valid token.
   *
   * Note: the first login() call here may legitimately fail with a
   * 4xx on a fresh install (user doesn't exist yet). That failure
   * will be surfaced by request() as an API error in the system log —
   * which is accurate (the call did fail) but may look alarming on
   * first run. Item 28 (JWT 401 retry + smarter recovery messaging)
   * is the right place to polish this; for item 20 we accept the
   * transparency.
   */
  public async ensureAuthenticated(): Promise<void> {
    if (this.token) return; // Already have a token

    const defaultUser = 'local_user';
    try {
      await this.login(defaultUser);
    } catch (err) {
      console.log('[API] local_user login failed. Attempting registration...');
      try {
         await this.register(defaultUser);
         await this.login(defaultUser);
      } catch (regErr) {
         console.error('[API] Fatal: Could not ensure local_user authentication.', regErr);
      }
    }
  }
}

export const api = new ApiClient();
