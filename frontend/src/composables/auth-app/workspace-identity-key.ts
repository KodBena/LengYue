/**
 * src/composables/auth-app/workspace-identity-key.ts
 *
 * Derives a stable per-identity key used to remount identity-scoped UI
 * (the control-panel Cards / Library tabs) on an auth flip, so user B
 * never inherits user A's component-instance fetched data — the tenancy
 * leak `resetWorkspace`'s module-cache registry can't reach. App.vue
 * binds it as the control-panel `:key`.
 *
 * Keyed on `username`, deliberately NOT `userId`: username is present on
 * every authenticated state and stable across the late `/auth/me`
 * userId-verify step (`authenticated{username, userId: undefined}` →
 * `authenticated{username, userId: N}`), so the key doesn't change
 * mid-login and cause a spurious second remount. Distinct usernames =
 * distinct identities = distinct key = remount. Unauthenticated states
 * collapse to one sentinel (no identity-scoped data to keep apart).
 *
 * Pure (only the AuthState type) so the remount invariant is unit-testable
 * without mounting App.vue.
 *
 * License: Public Domain (The Unlicense)
 */
import type { AuthState } from '../../types';

export function workspaceIdentityKey(state: AuthState): string {
  return state.kind === 'authenticated' ? state.username : '∅';
}
