/**
 * src/services/api-client.ts
 * Pure REST client for the spaced-repetition backend.
 * Handles JWT injection and Zero-Friction local auth. Auth-state
 * transitions are owned by useAuth; this module reports unrecovered
 * session rejections (`authSessionRejections`) and never mutates
 * auth-visible state on its own initiative.
 * License: Public Domain (The Unlicense)
 */

import { ref, readonly } from 'vue';
import { API_BASE_URL } from '../config/env';
import { pushSystemMessage } from './system-message-sink';
import { i18n } from '../i18n';
import type { components } from '../types/backend';

type AuthMeResponse = components['schemas']['AuthMeResponse'];

/**
 * Structured error thrown by `ApiClient.request` on a non-2xx response.
 * Carries the HTTP `status` and the raw response `body` as fields, so a
 * consumer branches on `err instanceof ApiError && err.status === N` and
 * reads `err.body` directly — no parsing of the message string. The
 * `.message` is preserved as `API Error <status>: <body>` for any site
 * still matching on it during the migration off that stringly-typed idiom
 * (see the deferred-items audit, 2026-06-01).
 */
export class ApiError extends Error {
  // Explicit instance fields assigned in the body, not constructor
  // parameter properties — the latter emit runtime code and are
  // forbidden under `erasableSyntaxOnly` (cf. AnalysisWaitError).
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_username';

// ── Transport fact: unrecovered session rejections ───────────────────────────
// Monotonic counter, bumped when a NON-auth-endpoint request comes back 401
// and the identity-honest single retry (item 28) did not recover it — i.e.
// the server no longer recognises the session this client is presenting.
//
// This is a REPORT, not a transition (single-owner shape, RFC-0001 open
// question 9 / work-status item single-owner-auth-state): api-client never
// mutates auth-visible state on its own initiative. The auth OWNER (the
// useAuth composable) watches this counter and performs the COMPLETE
// session-rejected transition — storage clear via the owner-invoked
// `clearToken()`, `auth.state` flip, user-visible warning. The prior shape
// (api-client clearing the JWT itself and notifying useAuth through an
// `onTokenInvalidated` callback) left two writers of one nominal auth state,
// coordinated by convention — the drift class RFC-0001 Q9 records.
//
// Auth endpoints (`/auth/*`) never bump: their callers (useAuth's own
// login / verify flows) own those failure transitions directly, and a bump
// would double-transition. A 401 observed while a re-auth is already in
// flight doesn't bump either — the in-flight retry may be about to repair
// the session, and if it fails, the retrying request's own fall-through 401
// bumps once the flag is reset.
const _authSessionRejections = ref(0);

/**
 * Read-only view of the unrecovered-401 counter. Consumed by exactly one
 * watcher — useAuth's session-rejected reaction. Exposed as a reactive
 * value (not a callback registration) so this module's export surface
 * carries no auth-state mutation or notification hook: the owner observes,
 * the transport reports.
 */
export const authSessionRejections = readonly(_authSessionRejections);

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

  /**
   * Generic request wrapper that automatically injects the JWT.
   *
   * Error surfacing:
   *   - Network failures (fetch throws before any response) emit an
   *     'error' SystemMessage and rethrow.
   *   - Non-2xx responses emit an 'error' SystemMessage and throw a
   *     typed `ApiError` carrying `status` + `body`. Its `.message` is
   *     preserved as "API Error ${status}: ${body}" for backward
   *     compatibility, but consumers should branch on
   *     `err instanceof ApiError && err.status === N`, not the string.
   *   - console.error is kept in both paths as a secondary debug
   *     surface; the system log is primary.
   *
   * 401 silent-retry:
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
   *   - Auth-state ownership (single-owner-auth-state): the retry is
   *     identity-PRESERVING — on success `login()` replaces the JWT
   *     under the same cached identity; on failure the stored JWT is
   *     left untouched. This method never clears auth-visible storage
   *     and never transitions `auth.state`; an unrecovered non-auth
   *     401 is reported through `authSessionRejections` (see its
   *     docstring) and the useAuth owner performs the transition.
   *     (The backend's /auth/token reads only the OAuth2 form body —
   *     the stale Bearer header the un-cleared token injects into the
   *     re-login POST is ignored server-side.)
   *
   * `options.silentStatuses` (added 2026-04-28):
   *   - Per-call list of HTTP status codes the caller considers
   *     in-contract for the specific route. When the server returns
   *     one of these, the system-log error and console.error are
   *     suppressed; the request still throws the same typed `ApiError`
   *     so callers can branch on `err.status` (e.g. the qeubo-service
   *     ACL re-throws as a typed `QeuboError`).
   *   - Used for route-specific status codes that are part of the
   *     route's documented contract rather than a deviation
   *     (qEUBO's 404 = "no experiment exists" / 409 = "init phase" /
   *     503 = "calibration disabled"). Routes that don't pass this
   *     option get the default loud behaviour.
   *   - Per ADR-0002: this is not "silent failure" — the deviation
   *     simply isn't there. The route's spec says "404 means no
   *     experiment"; treating that as an error is the bug.
   */
  public async request<T>(
    method: string,
    path: string,
    body?: any,
    options?: { silentStatuses?: readonly number[] },
  ): Promise<T> {
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
      const userMsg = i18n.global.t('api.networkError', { method, path, detail });
      pushSystemMessage('error', userMsg);
      console.error('[API]', userMsg, err);
      throw err;
    }

    // 401 retry: identity-honest single retry. See class JSDoc above.
    const isAuthEndpoint = path.startsWith('/auth/');
    if (response.status === 401 && !this.isReauthInFlight && !isAuthEndpoint) {
      const cached = this.cachedUsername();
      if (cached) {
        // Deliberately NO `this.token = null` here: clearing storage is the
        // auth owner's move (useAuth), never this method's. On re-login
        // success `login()` overwrites the JWT under the same identity; on
        // failure the original token must survive so no auth-visible state
        // changed without an owner transition. The stale Bearer header this
        // leaves on the /auth/token POST is ignored by the backend (form-
        // body-only endpoint; see the method JSDoc).
        this.isReauthInFlight = true;
        try {
          await this.login(cached);
          response = await fetch(`${API_BASE_URL}${path}`, buildPayload());
          if (response.ok) {
            pushSystemMessage('info', i18n.global.t('api.sessionRefreshed'));
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
      if (response.status === 401 && !isAuthEndpoint && !this.isReauthInFlight) {
        // Report the unrecovered rejection; mutate nothing. The useAuth
        // owner watches this counter and performs the complete transition
        // (storage clear + state flip + warning) — see the counter's
        // docstring for the single-owner rationale and the two skip
        // conditions (auth endpoints' callers own their own transitions;
        // a concurrent 401 while a re-auth is in flight defers to that
        // retry's own outcome).
        _authSessionRejections.value++;
      }
      const errText = await response.text();
      const isSilent = options?.silentStatuses?.includes(response.status) ?? false;
      if (!isSilent) {
        const excerpt = errText.length > ERROR_BODY_EXCERPT_MAX
          ? errText.slice(0, ERROR_BODY_EXCERPT_MAX) + '…'
          : errText;
        const userMsg = i18n.global.t('api.errorResponse', { method, path, status: response.status, excerpt });
        pushSystemMessage('error', userMsg);
        console.error('[API]', userMsg);
      }
      // Structured throw: status + raw body as fields. `.message` keeps
      // the "API Error <status>: <body>" format (ApiError's super) for
      // back-compat, but consumers should branch on `err instanceof
      // ApiError && err.status === N` rather than parse the string.
      throw new ApiError(response.status, errText);
    }

    // Empty-body responses (204 No Content; any 2xx with empty body)
    // would crash `response.json()` because `JSON.parse('')` throws.
    // Read as text and conditionally parse. Byte-equivalent to
    // `response.json()` for non-empty bodies (Response.json
    // internally does Response.text + JSON.parse). Lets DELETE
    // routes return 204-no-content cleanly and lets callers declare
    // `request<void>` for those endpoints.
    const text = await response.text();
    if (text === '') return undefined as T; // empty 204 body: callers of these routes declare request<void>, so undefined IS T (see comment above)
    return JSON.parse(text);
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
  }

  /**
   * Registers a new user.
   */
  public async register(username: string, password?: string): Promise<void> {
    // The backend accepts omitted/null password to create an Open Access account.
    const body: any = { username };
    if (password) body.password = password;

    await this.request('POST', '/auth/register', body);
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
   * on network failure. Callers that need to differentiate branch on
   * `err instanceof ApiError && err.status === N` (per request()).
   */
  public async getMe(): Promise<AuthMeResponse> {
    return this.request<AuthMeResponse>('GET', '/auth/me');
  }

  /**
   * Zero-Friction Auth: Ensures we have a valid token.
   *
   * Backend-side assumption: this flow relies on the backend running
   * with `ALLOW_PASSWORDLESS_LOGIN=True` (the default —
   * transparent-local-install mode). Under that mode, the backend's
   * /auth/token endpoint accepts any password for a registered user,
   * and /auth/register accepts an empty password to create an
   * Open-Access account. Together those let the "login local_user,
   * fall back to register-then-login local_user" dance below succeed
   * on a fresh install without prompting the user for a password.
   *
   * When the backend is configured with
   * `ALLOW_PASSWORDLESS_LOGIN=False` (multi-tenant deployment), BOTH
   * the login and the register attempts fail; the catch-and-log
   * branch surfaces the failure and the auth-lifecycle UX (login
   * modal, register flow, identity-aware sync wipe — wired via
   * `useAuth` and `SyncService`) takes over. The two backend modes
   * share the same client entry point; only the backend's response
   * to this attempt differs. See `docs/notes/tenancy.md` for the
   * system-level model.
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
