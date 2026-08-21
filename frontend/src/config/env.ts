/**
 * src/config/env.ts
 * Centralized reader for Vite environment variables.
 *
 * Why this module exists:
 * All frontend configuration that varies by deployment (backend URLs,
 * feature flags, build toggles) flows through this one file. Each
 * exported constant is resolved once at bundle time from its
 * corresponding VITE_* variable, with a typed fallback for
 * zero-config local dev. No other file in the codebase should read
 * `import.meta.env.VITE_*` directly — this is the single place to
 * audit "what environment inputs does this app consume?"
 *
 * Type contract:
 * Every export here is a non-nullable primitive (typically `string`).
 * The fallback absorbs the `undefined` branch of `import.meta.env.*`,
 * so consumers get precise types without needing to null-check.
 *
 * To add a new variable:
 *   1. Document it in `.env.example` at the repo root.
 *   2. Add a named export here with a sensible fallback.
 *   3. Import the named export at the call site.
 */

/**
 * Tauri desktop-shell overrides: `src-tauri/src/lib.rs` picks free local
 * ports for the backend AND proxy sidecars at app start (a build-time
 * VITE_* variable can't know either port in advance) and injects them as
 * these globals via `WebviewWindowBuilder::initialization_script`, which
 * Tauri guarantees runs before any page script — including this
 * module's own top-level evaluation. Both are `undefined` in every
 * non-Tauri context (web dev server, `vite preview`), so the branches
 * below fall through to the normal VITE_* / localhost resolution there.
 */
declare global {
  interface Window {
    __LENGYUE_BACKEND_PORT__?: number;
    /**
     * Set only under the Tauri desktop build (added alongside the
     * KataProxy sidecar — see `src-tauri/src/lib.rs`'s module docs).
     * The LOCAL bundled proxy's OS-assigned port; the proxy's own
     * upstream (the actual analysis engine) is settable in-app
     * (`useProxyUpstreamSetting.ts`) or overridden via the `ENGINE_WS_URL`
     * OS env var, both resolved Rust-side in `proxy_settings.rs`.
     */
    __LENGYUE_PROXY_PORT__?: number;
  }
}

/**
 * Base URL for the spaced-repetition backend (cards, reviews, forests,
 * documents, and — since the resource-endpoint consolidation — static
 * resources served at /resources/{name}).
 * Override via VITE_API_BASE_URL in `.env` or the build environment.
 * Under the Tauri desktop shell, the sidecar's OS-assigned port
 * (see `__LENGYUE_BACKEND_PORT__` above) takes precedence over both.
 */
export const API_BASE_URL: string =
  typeof window !== 'undefined' && window.__LENGYUE_BACKEND_PORT__ !== undefined
    ? `http://127.0.0.1:${window.__LENGYUE_BACKEND_PORT__}`
    : (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8764');

/**
 * WebSocket URL for the KataGo analysis middleware.
 *
 * NOTE: This is the FALLBACK used when the user's profile setting
 * `settings.katago.url` is empty or unset (fresh install). The primary
 * resolution path at runtime reads from the user's profile — this
 * env var controls only the out-of-the-box default for unconfigured
 * profiles. See services/analysis-service.ts::connect() for the
 * resolution order.
 *
 * Under the Tauri desktop shell (added alongside the KataProxy sidecar,
 * `src-tauri/src/lib.rs`), the bundled local proxy's OS-assigned port
 * takes precedence over both — the same override shape as
 * `API_BASE_URL` above. This is what makes a fresh Tauri profile's
 * unconfigured engine setting point at the LOCAL proxy, which in turn
 * points at the user's own analysis engine via the upstream setting
 * `useProxyUpstreamSetting.ts` reads/writes (wizard + Settings; Rust-side
 * home is `src-tauri/src/proxy_settings.rs`), or the `ENGINE_WS_URL`
 * power-user OS env-var override — NOT this Vite variable.
 *
 * The fallback below, 1242, is the KataGo WS shim's own default port
 * (`backend/scripts/katago_ws_shim.py`) — the single user-facing port
 * this app converges on across every packaging (Docker's
 * `ENGINE_WS_URL` default, the Tauri upstream default, and this
 * plain-dev fallback). Run the shim with its defaults and this
 * default just works.
 *
 * Override via VITE_KATAGO_WS_URL in `.env` or the build environment
 * (non-Tauri contexts only — the Tauri override always wins when
 * present).
 */
export const KATAGO_WS_URL: string =
  typeof window !== 'undefined' && window.__LENGYUE_PROXY_PORT__ !== undefined
    ? `ws://127.0.0.1:${window.__LENGYUE_PROXY_PORT__}`
    : (import.meta.env.VITE_KATAGO_WS_URL ?? 'ws://127.0.0.1:1242');

/**
 * True only under the Tauri desktop shell. Same detection idiom as
 * `KATAGO_WS_URL`/`API_BASE_URL` above — `window.__LENGYUE_PROXY_PORT__`
 * is set exclusively by `src-tauri/src/lib.rs`'s `initialization_script`,
 * so its presence is a reliable "am I running under Tauri" signal without
 * a separate flag to keep in sync. Gates the in-app proxy-upstream
 * setting (`useProxyUpstreamSetting.ts`): the underlying Tauri commands
 * only exist in a Tauri build, and the wizard/Settings fields that call
 * them must not render — nor the composable attempt an `invoke` — in a
 * web/docker build, where the control would do nothing.
 */
export const IS_TAURI: boolean =
  typeof window !== 'undefined' && window.__LENGYUE_PROXY_PORT__ !== undefined;
