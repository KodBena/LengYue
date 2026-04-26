/**
 * src/services/api-client.ts
 * Pure REST client for Ebisu API v2.
 * Handles JWT injection and Zero-Friction local auth.
 * License: Public Domain (The Unlicense)
 */

import { API_BASE_URL } from '../config/env';
import { pushSystemMessage } from '../store';

const TOKEN_KEY = 'ebisu_jwt_token';
const USER_KEY = 'ebisu_username';

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
   */
  public async request<T>(method: string, path: string, body?: any): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let payload: RequestInit = { method, headers };

    // Standard JSON payload
    if (body && !(body instanceof URLSearchParams)) {
      headers['Content-Type'] = 'application/json';
      payload.body = JSON.stringify(body);
    }
    // Form-urlencoded payload (used for OAuth2 /token endpoint)
    else if (body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload.body = body;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, payload);
    } catch (err) {
      // fetch() itself rejected — network unreachable, DNS, CORS, etc.
      // No HTTP status is available in this case.
      const detail = err instanceof Error ? err.message : String(err);
      const userMsg = `Network error on ${method} ${path}: ${detail}`;
      pushSystemMessage('error', userMsg);
      console.error('[API]', userMsg, err);
      throw err;
    }

    if (!response.ok) {
      if (response.status === 401) this.token = null; // Token expired/invalid
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
