/**
 * tests/integration/workspace-save-gate.test.ts
 *
 * Coverage for the menus-ui audit's Finding M14 fix (write-path error
 * surfacing): before this fix, a failed `PUT /documents/{key}` produced
 * only `console.error('[Sync] Failed to save document:', err)` — zero UI
 * change. The load path already had a precedent (`workspaceLoadState`,
 * pinned by `workspace-load-gate.test.ts`): a discriminated union +
 * App.vue banner + explicit Retry. This suite pins the write-path
 * counterpart, `store.workspaceSaveState` (types/app.ts
 * `WorkspaceSaveState`), owned by `SyncService.sendSync()` /
 * `SyncService.retrySave()`.
 *
 * Same idiom and same tier as workspace-load-gate.test.ts: SyncService
 * driven against the real store and a stubbed global `fetch`, not a
 * mounted App.vue — `tests/CLAUDE.md`'s posture keeps component/template
 * tests out of scope, and App.vue's banner is a pure `v-if` over
 * `workspaceSaveState.kind === 'error'` with no logic of its own once
 * this state is correct (vue-tsc typechecks the template expression
 * against `WorkspaceSaveState` at build time).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

import { store, resetWorkspace, CURRENT_SCHEMA_VERSION } from '../../src/store';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { SyncService } from '../../src/services/sync-service';
import { i18n } from '../../src/i18n';
import { withSetup } from './with-setup';

const auth = useAuth();

type Responder = () => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function okDoc(): Promise<Response> {
  return Promise.resolve(jsonResponse(200, { data: { schemaVersion: CURRENT_SCHEMA_VERSION } }));
}

// Method-aware router: GET and PUT against /documents/{key} are driven by
// independent, per-test-settable responders, so a save failure can be
// exercised without disturbing the (already-succeeded) hydration GET.
function installRouter(users: Record<string, number>): {
  setGetResponder: (fn: Responder) => void;
  setPutResponder: (fn: Responder) => void;
} {
  let getResponder: Responder = okDoc;
  let putResponder: Responder = okDoc;

  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
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
      return method === 'PUT' ? putResponder() : getResponder();
    }
    return jsonResponse(200, { ok: true });
  }));

  return {
    setGetResponder: (fn: Responder) => { getResponder = fn; },
    setPutResponder: (fn: Responder) => { putResponder = fn; },
  };
}

// Bring up a SyncService already hydrated (workspaceLoadState 'loaded') for
// 'alice', so `forceSave()` / `retrySave()` pass the identity gate in
// `scheduleSync`/`sendSync`.
async function hydratedSync(router: ReturnType<typeof installRouter>): Promise<SyncService> {
  const sync = new SyncService('user_workspace_01', auth);
  withSetup(() => { sync.connect(); });
  await auth.login('alice', 'pw');
  await flushPromises();
  expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
  return sync;
}

beforeEach(() => {
  localStorage.clear();
  auth.logout();
  resetWorkspace();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspaceSaveState — write-path error surfacing (menus-ui audit M14)', () => {
  it('starts \'synced\' (module default, and after resetWorkspace) — nothing outstanding before any write is attempted', () => {
    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });
  });

  it('a failed save flips the gate to \'error\' with a message, surfaced in the system log too — never just console', async () => {
    const router = installRouter({ alice: 1 });
    const sync = await hydratedSync(router);

    router.setPutResponder(() => Promise.resolve(jsonResponse(500, { detail: 'document store unavailable' })));
    sync.forceSave();
    await flushPromises();

    expect(store.workspaceSaveState.kind).toBe('error');
    expect((store.workspaceSaveState as { kind: 'error'; message: string }).message).toContain('500');
    expect(store.engine.messages.some(
      (m) => m.type === 'error' && m.text === i18n.global.t('sync.saveFailed'),
    )).toBe(true);
  });

  it('retrySave() recovers a failed save to \'synced\' once the PUT succeeds — the App.vue banner\'s Retry handler', async () => {
    const router = installRouter({ alice: 1 });
    const sync = await hydratedSync(router);

    router.setPutResponder(() => Promise.resolve(jsonResponse(500, { detail: 'unavailable' })));
    sync.forceSave();
    await flushPromises();
    expect(store.workspaceSaveState.kind).toBe('error');

    router.setPutResponder(okDoc);
    sync.retrySave();
    await flushPromises();

    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });
  });

  it('a later successful save clears a prior failure — the banner is retired by an actual write landing, not by a timer or a new edit merely being queued', async () => {
    const router = installRouter({ alice: 1 });
    const sync = await hydratedSync(router);

    router.setPutResponder(() => Promise.resolve(jsonResponse(500, { detail: 'unavailable' })));
    sync.forceSave();
    await flushPromises();
    expect(store.workspaceSaveState.kind).toBe('error');

    // A subsequent debounced save (not a manual retry) succeeding is
    // equally sufficient to clear the banner — the fact being tracked is
    // "did the last write land", not "did the user press Retry".
    router.setPutResponder(okDoc);
    sync.forceSave();
    await flushPromises();

    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });
  });

  it('load-path error surface is unregressed: a failed hydration GET still flips workspaceLoadState to \'error\' with retryHydrate() recovery, independent of save state', async () => {
    const router = installRouter({ alice: 1 });
    router.setGetResponder(() => Promise.resolve(jsonResponse(500, { detail: 'document store unavailable' })));

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); });
    await auth.login('alice', 'pw');
    await flushPromises();

    expect(store.workspaceLoadState.kind).toBe('error');
    expect(store.engine.messages.some(
      (m) => m.type === 'error' && m.text === i18n.global.t('sync.workspaceLoadFailed'),
    )).toBe(true);
    // The save-state gate is unaffected by a load failure — no write was
    // ever attempted, so there is nothing outstanding to report there.
    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });

    router.setGetResponder(okDoc);
    sync.retryHydrate();
    await flushPromises();
    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
  });

  it('resetWorkspace() clears an outstanding save-failure banner along with the identity it belonged to', async () => {
    const router = installRouter({ alice: 1 });
    const sync = await hydratedSync(router);

    router.setPutResponder(() => Promise.resolve(jsonResponse(500, { detail: 'unavailable' })));
    sync.forceSave();
    await flushPromises();
    expect(store.workspaceSaveState.kind).toBe('error');

    resetWorkspace();
    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });
  });
});
