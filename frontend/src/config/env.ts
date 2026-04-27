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
 * Base URL for the spaced-repetition backend (cards, reviews, forests,
 * documents, and — since the resource-endpoint consolidation — static
 * resources served at /resources/{name}).
 * Override via VITE_API_BASE_URL in `.env` or the build environment.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8764';

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
 * Override via VITE_KATAGO_WS_URL in `.env` or the build environment.
 */
export const KATAGO_WS_URL: string =
  import.meta.env.VITE_KATAGO_WS_URL ?? 'ws://127.0.0.1:8765/katago';
