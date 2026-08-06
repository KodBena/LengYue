/**
 * src/types/app.ts
 *
 * Application-shell value objects: the `AuthState` discriminated
 * union (owned at runtime by `composables/useAuth.ts`), the
 * `WorkspaceLoadState` discriminated union (owned at runtime by
 * `services/sync-service.ts`), and the `SystemMessage` system-log
 * entry. Domain-agnostic (ADR-0003 Band 1). Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); `AuthState` / `SystemMessage` bodies are verbatim from the
 * pre-split file; `WorkspaceLoadState` added 2026-08-06 (ADR-0019
 * audit S1 — cold-load phantom-workspace fix).
 *
 * License: Public Domain (The Unlicense)
 */

// ── Value Object (readonly preserved) — Authentication state ──────────────────
//
// Discriminated union over the five legitimate states of the SPA's auth
// identity. Constructors carry exactly the data each state needs; no
// impossible combinations are representable (no `authenticated` without
// a username; no `error` without a message). Owned at runtime by the
// `useAuth` composable in `composables/useAuth.ts`; declared here for
// accessibility by future consumers (UserBadge, LoginModal, etc.).
//
// Lifecycle:
//   unknown         → pre-bootstrap, no attempt yet made.
//   authenticating  → login/register call in flight.
//   authenticated   → JWT in localStorage; identity known.
//   unauthenticated → no token, idle. Reachable via logout (B4) or via
//                     a deliberate identity-clear (B5).
//   error           → last attempt failed; surfaced via system log;
//                     transient until the next attempt.
export type AuthState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'authenticating' }
  | { readonly kind: 'authenticated'; readonly username: string; readonly userId?: number }
  | { readonly kind: 'error'; readonly message: string };

// ── Value Object (readonly preserved) — Workspace load state ──────────────────
//
// Discriminated union over the cold-start workspace-fetch lifecycle
// (SyncService's `GET /documents/{key}`). Mirrors AuthState's shape
// above: a `kind` tag, no impossible states representable (no
// `error` without a message). Owned at runtime by `SyncService`
// (`services/sync-service.ts`); rendered by `App.vue`'s top-level
// gate, which must not show the board/tab-rail/control-panel
// surfaces — or offer workspace mutation — until this reaches
// `'loaded'`. Before this union existed, the store's *default*
// boards painted immediately and indistinguishably from the real
// fetched workspace (ADR-0019 audit, Finding S1: a cold load
// rendered a complete, interactive, wrong 37-board workspace with
// no loading indication before silently swapping in the real 92).
//
// Lifecycle:
//   loading → default value (module init), and re-entered whenever
//             an authenticated identity's document fetch is in
//             flight (including a user-triggered retry after
//             'error').
//   loaded  → either the fetch succeeded and the store now holds
//             that identity's real data, or there was never a
//             document to fetch (auth resolved to unauthenticated /
//             authenticating / error — no identity to hydrate for,
//             so the store's built-in default is the honest current
//             state, not a stale one).
//   error   → the fetch failed; the store's contents are not
//             necessarily current for the authenticated identity,
//             so workspace surfaces stay gated and an explicit
//             retry affordance is offered (C8).
export type WorkspaceLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'error'; readonly message: string };

// ── Value Object (readonly preserved) — SystemMessage ─────────────────────────

export interface SystemMessage {
  readonly id: string;
  readonly type: 'error' | 'warning' | 'info';
  readonly text: string;
  readonly timestamp: number;
}
