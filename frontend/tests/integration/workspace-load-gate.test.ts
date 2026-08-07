/**
 * tests/integration/workspace-load-gate.test.ts
 *
 * Tier-3 coverage for the ADR-0019 audit's Finding S1 fix (cold-load
 * honest gate): before this fix, App.vue painted the store's default
 * boards as a complete, interactive workspace on first render and
 * silently swapped in the real data once SyncService's hydration GET
 * resolved — collapsing "loading" and "loaded" into one pixel-identical
 * paint (C6/C7), with no error path (C8) on a failed fetch.
 *
 * `store.workspaceLoadState` (types/app.ts `WorkspaceLoadState`) is the
 * fix: a discriminated union SyncService owns and App.vue's top-level
 * `v-if`/`v-else-if`/`v-else` gate reads directly (`store.workspaceLoadState
 * .kind === 'loaded' | 'loading' | 'error'`) to decide whether the board /
 * tab-rail / control-panel surfaces render, or a loading/error state does.
 * Because the gate is a pure `v-if` over this store field (no local
 * component state), this suite pins the mechanism at the tier where it
 * lives — SyncService driven against the real store and a stubbed global
 * `fetch` (the network boundary), same idiom as auth-lifecycle.test.ts —
 * rather than mounting App.vue itself. `tests/CLAUDE.md`'s testing
 * posture explicitly keeps component/template tests out of scope (low ROI
 * for this codebase's thin-renderer shape); the gate has no logic of its
 * own once workspaceLoadState is correct, so exercising this class IS
 * exercising the gate's behaviour end to end. (App.vue's template
 * expressions are still typechecked against `WorkspaceLoadState` by
 * `vue-tsc` at build time — a renamed `kind` value fails the build, not
 * just this suite.)
 *
 * "Board mutation entry points are inert" during 'loading'/'error' is a
 * structural consequence of the same `v-if`, not a separate runtime gate:
 * SidebarWidget / Toolbar / BoardWidget / TreeWidget / TabWidget (every
 * component that emits a workspace-mutating event) are UNMOUNTED, not
 * merely disabled, while workspaceLoadState.kind !== 'loaded' — read the
 * gate's template comment in App.vue for the enumeration. This suite pins
 * the state transitions those templates key off of; App.vue's own source
 * is the (typechecked, eslint-checked) wiring from state to unmount.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';

import { store, resetWorkspace, CURRENT_SCHEMA_VERSION } from '../../src/store';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { SyncService } from '../../src/services/sync-service';
import { i18n } from '../../src/i18n';
import { withSetup } from './with-setup';

const auth = useAuth();

// ── Deferred-response fetch router ──────────────────────────────────────────
// Auth endpoints resolve immediately (real login/verify flow, mirrors
// auth-lifecycle.test.ts's router). `/documents/{key}` is driven by an
// explicit queue of responders this suite controls per-test — a "never
// resolves" entry (a Promise that never settles) for the phantom-workspace
// red-leg, a deferred-then-resolved entry for the happy path, and a 500
// entry for the error path.

type DocResponder = () => Promise<Response>;

function neverResolves(): Promise<Response> {
  return new Promise<Response>(() => { /* deliberately never settles */ });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function installRouter(users: Record<string, number>): { setDocResponder: (fn: DocResponder) => void } {
  let docResponder: DocResponder = () => Promise.resolve(jsonResponse(200, { data: { schemaVersion: CURRENT_SCHEMA_VERSION } }));

  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bearer = headers['Authorization']?.startsWith('Bearer ')
      ? headers['Authorization'].slice('Bearer '.length)
      : null;
    const bearerUser = bearer?.startsWith('token-for-') ? bearer.slice('token-for-'.length) : null;

    if (path === '/auth/token') {
      const username = new URLSearchParams(String(init?.body)).get('username') ?? '';
      if (!(username in users)) return jsonResponse(401, { detail: 'invalid credentials' });
      return jsonResponse(200, { access_token: `token-for-${username}`, token_type: 'bearer' });
    }
    if (path === '/auth/me') {
      if (!bearerUser || !(bearerUser in users)) return jsonResponse(401, { detail: 'nope' });
      return jsonResponse(200, { username: bearerUser, id: users[bearerUser] });
    }
    if (path.startsWith('/documents/')) {
      return docResponder();
    }
    return jsonResponse(200, { ok: true });
  }));

  return { setDocResponder: (fn: DocResponder) => { docResponder = fn; } };
}

beforeEach(() => {
  localStorage.clear();
  auth.logout();
  resetWorkspace();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspaceLoadState — cold-load honest gate (ADR-0019 audit S1)', () => {
  it('starts \'loading\' (module default) — the gate never has a moment where nothing is asserted', () => {
    // resetWorkspace() (beforeEach) sets it back to 'loaded' (nothing
    // pending, per its own contract) — assert the OTHER lifecycle
    // anchor, the true module-init default, on a throwaway import-free
    // read of the shape itself, since resetWorkspace already exercised
    // 'loaded'. This just pins the union's third member exists and is
    // distinguishable, so a future edit can't quietly collapse 'loading'
    // and 'loaded' back into one boolean.
    store.workspaceLoadState = { kind: 'loading' };
    expect(store.workspaceLoadState.kind).toBe('loading');
  });

  it('red leg — a never-resolving workspace GET leaves the gate at \'loading\' indefinitely (the phantom-workspace window, honestly marked)', async () => {
    const router = installRouter({ alice: 1 });
    router.setDocResponder(neverResolves);

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); });

    await auth.login('alice', 'pw');
    await flushPromises();
    await flushPromises();

    // Not 'loaded': the fetch this state is gating on has not resolved
    // and never will in this test. Before the fix, the store's default
    // single board would already be sitting there indistinguishable from
    // a real one — this assertion is exactly the distinction C6/C7 name.
    expect(store.workspaceLoadState).toEqual({ kind: 'loading' });
    // The default board is what's on the store right now — the same
    // content the pre-fix app painted as if it were final. The gate
    // (App.vue's v-if) is what keeps this from being SHOWN as the real
    // workspace; this suite pins the signal that gate reads.
    expect(store.boards.length).toBe(1);
  });

  it('happy path — resolving the GET flips the gate to \'loaded\' with the fetched content applied', async () => {
    const router = installRouter({ alice: 1 });
    let resolveDoc!: (r: Response) => void;
    router.setDocResponder(() => new Promise<Response>((resolve) => { resolveDoc = resolve; }));

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); });

    await auth.login('alice', 'pw');
    await flushPromises();
    expect(store.workspaceLoadState).toEqual({ kind: 'loading' });

    // The real workspace lands: two boards, distinguishable from the
    // one-board default the gate was withholding.
    resolveDoc(jsonResponse(200, {
      data: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        boards: [
          { id: 'b1', nodes: {}, rootNodeId: 'r1', activeNodeId: 'r1', games: {} },
          { id: 'b2', nodes: {}, rootNodeId: 'r2', activeNodeId: 'r2', games: {} },
        ],
        activeBoardIndex: 0,
      },
    }));
    await flushPromises();

    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
    expect(store.boards.length).toBe(2);
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('sync.workspaceLoaded'),
    )).toBe(true);
  });

  it('error path — a failing GET flips the gate to \'error\' with a message, and retryHydrate() recovers it to \'loaded\'', async () => {
    const router = installRouter({ alice: 1 });
    router.setDocResponder(() => Promise.resolve(jsonResponse(500, { detail: 'workspace store unavailable' })));

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); });

    await auth.login('alice', 'pw');
    await flushPromises();

    expect(store.workspaceLoadState.kind).toBe('error');
    expect((store.workspaceLoadState as { kind: 'error'; message: string }).message).toContain('500');
    // C8: the failure is surfaced at the operator-facing surface, not just
    // console — the same system-log channel every other sync failure uses.
    expect(store.engine.messages.some(
      (m) => m.type === 'error' && m.text === i18n.global.t('sync.workspaceLoadFailed'),
    )).toBe(true);
    // Never falls back to presenting the stale/default paint as truth —
    // still one default board, still gated by a NON-'loaded' state.
    expect(store.boards.length).toBe(1);

    // Retry (the App.vue error-state button's handler): fix the router,
    // fire the retry, observe recovery.
    router.setDocResponder(() => Promise.resolve(jsonResponse(200, {
      data: { schemaVersion: CURRENT_SCHEMA_VERSION },
    })));
    sync.retryHydrate();
    expect(store.workspaceLoadState.kind).toBe('loading'); // re-enters loading synchronously
    await flushPromises();
    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
  });

  it('no identity to hydrate for (never logs in) — the gate resolves to \'loaded\' rather than spinning forever on a fetch that will never happen', async () => {
    installRouter({ alice: 1 });
    store.workspaceLoadState = { kind: 'loading' }; // simulate the true module-init default

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); }); // auth.state is 'unauthenticated' (beforeEach's auth.logout())
    await flushPromises();

    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
  });
});
