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
 * audit S1 — cold-load phantom-workspace fix); `WorkspaceLoadState`'s
 * `future-version` leg and `WorkspaceSaveState`'s `suppressed` leg
 * added 2026-08-11 (work item `next-futureblob-recovery`, ratified
 * program row 1937, incident row 1942 — a future-schemaVersion blob
 * left the SPA dead with no recovery affordance; see
 * `.claude/dispatch-reports/next-futureblob-recovery.md` for the
 * closure statement).
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
//   loading        → default value (module init), and re-entered
//                     whenever an authenticated identity's document
//                     fetch is in flight (including a user-triggered
//                     retry after 'error').
//   loaded         → either the fetch succeeded and the store now
//                     holds that identity's real data, or there was
//                     never a document to fetch (auth resolved to
//                     unauthenticated / authenticating / error — no
//                     identity to hydrate for, so the store's
//                     built-in default is the honest current state,
//                     not a stale one), or the user resolved a
//                     'future-version' recovery prompt (either leg —
//                     continue-on-defaults or reset-server-workspace
//                     both end in 'loaded').
//   error          → the fetch failed for an ordinary reason (network,
//                     4xx/5xx, malformed response); the store's
//                     contents are not necessarily current for the
//                     authenticated identity, so workspace surfaces
//                     stay gated and an explicit retry affordance is
//                     offered (C8).
//   future-version → the fetch succeeded but `migrate()` refused the
//                     blob: `blobVersion` is ahead of `appVersion`
//                     (`FutureSchemaVersionError`,
//                     `store/migrations.ts`) — the two-branches-one-
//                     backend case (work item
//                     `next-futureblob-recovery`, ratified program
//                     row 1937, incident row 1942), where a newer
//                     branch's app already forward-migrated the
//                     shared workspace document. Deliberately a
//                     DISTINCT leg from `error`, not a message-string
//                     variant of it: `error` is an ordinary transient
//                     failure whose only sane action is "retry the
//                     same fetch"; `future-version` is an EXPECTED,
//                     recoverable disagreement between two live app
//                     versions whose correct action is a deliberate
//                     choice (continue on suppressed-persistence
//                     defaults, or explicitly reset the server
//                     workspace) — never a bare retry, which would
//                     just throw the same typed error again. Rendered
//                     by `WorkspaceRecoveryGate.vue`, which blocks the
//                     workspace surfaces the same way `error` does,
//                     but offers the two-choice recovery affordance
//                     instead of a Retry button.
export type WorkspaceLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'future-version'; readonly blobVersion: number; readonly appVersion: number };

// ── Value Object (readonly preserved) — Workspace save state ──────────────────
//
// Discriminated union over the debounced-PUT save lifecycle
// (SyncService's `PUT /documents/{key}`, `sendSync()`). Mirrors
// `WorkspaceLoadState`'s shape: a `kind` tag, no impossible states
// representable (no `error` without a message, no `suppressed`
// without the versions that triggered it). Owned at runtime by
// `SyncService`; rendered by `App.vue` as a persistent (non-blocking)
// banner — unlike the load gate, a save failure must NOT withhold the
// workspace surfaces, since the user's in-memory edits are still there
// and still usable; only the fact "the last write did not reach the
// server" needs a single, durable home (menus-ui audit finding M14: the
// write path had zero UI change on failure, only a console log).
//
// Lifecycle:
//   synced      → default value (module init, and after
//                 `resetWorkspace`), and re-entered whenever a PUT
//                 resolves successfully. Nothing pending, nothing
//                 failed, nothing suppressed.
//   error       → the most recent PUT failed; the payload it carried
//                 has not reached the server. Stays 'error' — even
//                 across further local edits that queue a new
//                 debounced PUT — until a PUT actually succeeds or the
//                 identity resets; a subsequent local edit alone must
//                 not quietly clear the banner while the underlying
//                 failure is still unresolved.
//   suppressed  → the user chose "continue on defaults" from a
//                 `future-version` recovery prompt (work item
//                 `next-futureblob-recovery`). Every subsequent
//                 persist attempt for this session is REFUSED by
//                 `SyncService` (see its `persistSuppression` field) —
//                 the newer blob on the server is never silently
//                 overwritten. Distinct from `error`: an `error` PUT
//                 was attempted and failed; a `suppressed` PUT is
//                 never attempted at all, by design, until the user
//                 either reloads or explicitly resets the server
//                 workspace (which transitions back to `synced`).
export type WorkspaceSaveState =
  | { readonly kind: 'synced' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'suppressed'; readonly blobVersion: number; readonly appVersion: number };

// ── Value Object (readonly preserved) — SystemMessage ─────────────────────────

export interface SystemMessage {
  readonly id: string;
  readonly type: 'error' | 'warning' | 'info';
  readonly text: string;
  readonly timestamp: number;
  /** Optional structured fields (dispatch L3 repair,
   *  `.claude/dispatch-reports/lyt-space-owner-l3-review.md` §3 condition
   *  3 / ADR-0019 C8): "what would make this valid" and "a reachable next
   *  action," carried as their OWN fields rather than flattened into
   *  `text` — a producer (e.g. `SovereignOverrideDiagnostic`) that has
   *  these facts supplies them; every other producer omits them and
   *  renders exactly as before (additive, not a shape change for the
   *  ~18 existing plain `pushSystemMessage(type, text)` call sites).
   *  `nextAction` is presentational-only here: `SystemLogPanel.vue`
   *  displays it as a label, not a clickable control — no affordance
   *  named `'open-default-layout-control'` exists on this branch to
   *  wire a click handler to (disclosed, not silently implied). */
  readonly remediation?: string;
  readonly nextAction?: string;
  /** Show-once dedup (system-message-sink's `push`): when a push arrives
   *  whose `type`/`text`/`remediation`/`nextAction` are byte-identical to
   *  the CURRENT newest entry (`store.engine.messages[0]`), the sink does
   *  not unshift a second row — it bumps this count on the existing entry
   *  instead, so an identical-consecutive flood (e.g. a diagnostic
   *  recomputed on every reactive tick with no new information) collapses
   *  to one visible row instead of spamming the log. `undefined`/`1` for
   *  every message that has never been collapsed into (the common case);
   *  `SystemLogPanel.vue` renders "×N" only when `count > 1`. A push whose
   *  key differs from the current head — including one identical to an
   *  EARLIER (non-head) entry, or arriving after a different message
   *  intervened — always starts a fresh row, per the "genuinely new
   *  occurrence" half of the contract. */
  readonly count?: number;
}
