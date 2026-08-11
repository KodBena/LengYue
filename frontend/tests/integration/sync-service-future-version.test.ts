/**
 * tests/integration/sync-service-future-version.test.ts
 *
 * Tier-3 net for the future-version workspace-recovery path (work
 * item `next-futureblob-recovery`, ratified program row 1937, incident
 * row 1942 — see `.claude/dispatch-reports/next-futureblob-recovery.md`
 * for the closure statement). Drives the REAL `SyncService` + real
 * `store` against a stubbed `fetch`, the same harness shape
 * `sync-session-version.test.ts` established (fetch router +
 * `installFetchRouter` + `putFiredAfter`), reused here rather than
 * re-invented.
 *
 * Covers:
 *   - The typed outcome surfaces on a "version-77" fixture blob (today,
 *     `CURRENT_SCHEMA_VERSION + 2` — kept relative so the fixture stays
 *     meaningful across future schema bumps rather than pinning a
 *     literal that drifts out of sync with `CURRENT_SCHEMA_VERSION`).
 *   - Persist-suppression refuses EVERY persist attempt while active —
 *     both the debounced-watcher path and `forceSave()` — loudly
 *     (console.error), with zero PUTs reaching the network. This is
 *     the RED-WITHOUT-FIX case: it was run once against the sole
 *     line that gates `sendSync()` commented out and failed exactly as
 *     expected (recorded in the dispatch report; not re-verified on
 *     every CI run — that would require shipping a deliberately-broken
 *     build).
 *   - `continueOnDefaults()` transitions the load gate to 'loaded'
 *     while suppression remains active (persistence doesn't silently
 *     resume just because the UI unblocked).
 *   - `resetServerWorkspaceToDefaults()` performs exactly one immediate
 *     PUT, lifts suppression, and normal saves resume afterward.
 *   - Normal (non-future-version) boot is unaffected — pinned by
 *     re-asserting the 'loaded' outcome the existing
 *     `sync-session-version.test.ts` suite already exercises via its
 *     own `beforeEach`, so this file adds one direct assertion rather
 *     than duplicating that suite's full coverage.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same store-cleanup boundary mocks as sync-session-version.test.ts —
// `resetServerWorkspaceToDefaults()` / `continueOnDefaults()` both call
// `resetWorkspace()`, which drains the owner-registered teardown
// handlers; these mocks keep that drain off the network/DOM.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  const { registerWorkspaceResetHandler, registerBoardCloseHandler, TeardownOrder } =
    await import('../../src/store/teardown-registry');
  registerWorkspaceResetHandler({
    label: 'analysis:active-board-analyses',
    order: TeardownOrder.ENGINE_STOP,
    run: () => fakeAnalysisService.stopAllBoardAnalyses(),
  });
  registerBoardCloseHandler({
    label: 'analysis-service:stop',
    order: TeardownOrder.ENGINE_STOP,
    run: (boardId) => fakeAnalysisService.stopBoardAnalysis(boardId),
  });
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  const { registerWorkspaceResetHandler, registerBoardCloseHandler } =
    await import('../../src/store/teardown-registry');
  registerWorkspaceResetHandler({
    label: 'analysis-bundle-summaries',
    run: () => fakeAnalysisPersistenceService.forgetAll(),
  });
  registerBoardCloseHandler({
    label: 'analysis-persistence:discard',
    run: (boardId) => { void fakeAnalysisPersistenceService.discard(boardId); },
  });
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/composables/cards/useCardThumbnail', async () => {
  const { registerWorkspaceResetHandler } = await import('../../src/store/teardown-registry');
  const clearCardThumbnailCache = vi.fn();
  registerWorkspaceResetHandler({ label: 'card-thumbnails', run: () => clearCardThumbnailCache() });
  return { clearCardThumbnailCache, getCardThumbnailSync: vi.fn(() => '') };
});

vi.mock('../../src/composables/cards/thumbnail-render-resources', async () => {
  const { registerWorkspaceResetHandler, registerBoardCloseHandler } =
    await import('../../src/store/teardown-registry');
  const purgeBoardThumbnails = vi.fn();
  const purgeAllThumbnails = vi.fn();
  registerWorkspaceResetHandler({ label: 'board-thumbnails', run: () => purgeAllThumbnails() });
  registerBoardCloseHandler({ label: 'thumbnails:purge-board', run: () => purgeBoardThumbnails() });
  return { purgeBoardThumbnails, purgeAllThumbnails };
});
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    getVariationThumbnail: vi.fn(),
    getSync: vi.fn(),
    warmPath: vi.fn(),
  }),
}));

vi.mock('../../src/composables/cards/board-card-trees', async () => {
  const { registerWorkspaceResetHandler, registerBoardCloseHandler } =
    await import('../../src/store/teardown-registry');
  const removeBoardCardTree = vi.fn();
  const clearAllBoardCardTrees = vi.fn();
  registerWorkspaceResetHandler({ label: 'board-card-trees', run: () => clearAllBoardCardTrees() });
  registerBoardCloseHandler({ label: 'board-card-trees:remove', run: (boardId) => removeBoardCardTree(boardId) });
  return {
    removeBoardCardTree,
    clearAllBoardCardTrees,
    getOrCreateBoardCardTree: vi.fn(),
    getBoardCardTree: vi.fn(() => null),
  };
});

import { flushPromises } from '@vue/test-utils';
// LOAD-BEARING IMPORT ORDER (see auth-lifecycle.test.ts): `src/store`
// must initialize before the auth chain (useAuth → api-client).
import {
  store,
  resetWorkspace,
  clearSystemMessages,
  createInitialBoard,
  addBoard,
  CURRENT_SCHEMA_VERSION,
} from '../../src/store';
import '../../src/store/teardown-registrations';
import { mutateProfile } from '../../src/store/profile-owner';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { SyncService } from '../../src/services/sync-service';
import { i18n } from '../../src/i18n';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { withSetup } from './with-setup';
import { nextTick } from 'vue';

const auth = useAuth();
const DEBOUNCE_MS = 5;

// "Conceptually a version-77 fixture blob" against today's
// CURRENT_SCHEMA_VERSION (75) — kept relative (+2) so the fixture
// stays meaningful if CURRENT_SCHEMA_VERSION bumps later.
const FUTURE_VERSION = CURRENT_SCHEMA_VERSION + 2;

interface RouterState {
  putCount: number;
  documentSchemaVersion: number;
}

/** Same fetch-router shape as sync-session-version.test.ts, parametrised
 * on which schemaVersion the document GET returns. */
function installFetchRouter(users: Record<string, number>, initialSchemaVersion: number): RouterState {
  const state: RouterState = { putCount: 0, documentSchemaVersion: initialSchemaVersion };
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status });

  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(String(input)).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bearer = headers['Authorization']?.startsWith('Bearer ')
      ? headers['Authorization'].slice('Bearer '.length)
      : null;
    const bearerUser = bearer?.startsWith('token-for-') ? bearer.slice('token-for-'.length) : null;

    if (path === '/auth/token') {
      const username = new URLSearchParams(String(init?.body)).get('username') ?? '';
      if (!(username in users)) return json(401, { detail: 'invalid credentials' });
      return json(200, { access_token: `token-for-${username}`, token_type: 'bearer' });
    }
    if (path === '/auth/me') {
      if (!bearerUser || !(bearerUser in users)) return json(401, { detail: 'bad' });
      return json(200, { username: bearerUser, id: users[bearerUser] });
    }
    if (!bearerUser) return json(401, { detail: 'unauthorized' });
    if (path.startsWith('/documents/')) {
      if (method === 'PUT') {
        state.putCount += 1;
        // Once the server workspace is overwritten, subsequent GETs
        // (there are none in this suite, but honest modelling) would
        // see the new version. Not exercised — no re-hydrate happens
        // after resetServerWorkspaceToDefaults() in these tests.
        return json(200, { ok: true });
      }
      return json(200, { data: { schemaVersion: state.documentSchemaVersion } });
    }
    return json(200, { ok: true });
  }));
  return state;
}

let router: RouterState;
let sync: SyncService;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

async function loginAndConnect(schemaVersion: number): Promise<void> {
  router = installFetchRouter({ bob: 7 }, schemaVersion);
  await auth.login('bob', 'pw');
  sync = new SyncService('user_workspace_01', auth);
  withSetup(() => { sync.connect(); });
  await flushPromises();

  // Shrink the debounce (default 1000ms, per defaults.ts) so the
  // watcher → debounce → sendSync path settles fast under real
  // timers, matching sync-session-version.test.ts's own setup. This
  // write itself schedules a save — let it settle before returning so
  // it doesn't bleed a stray PUT / console.error call into the first
  // assertion each test makes. In the future-version fixture this
  // settle is itself the FIRST persist-suppression refusal (harmless —
  // every subsequent test resets its own counters/spies after this
  // returns).
  mutateProfile((p) => { p.settings.persistence = { debounceInterval: DEBOUNCE_MS }; });
  await nextTick();
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
  await flushPromises();
}

beforeEach(async () => {
  localStorage.clear();
  auth.logout();
  resetWorkspace();
  clearSystemMessages();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

describe('SyncService — future-version typed boot outcome', () => {
  it('surfaces WorkspaceLoadState.kind === "future-version" with the two versions, not a generic error', async () => {
    await loginAndConnect(FUTURE_VERSION);

    expect(store.workspaceLoadState).toEqual({
      kind: 'future-version',
      blobVersion: FUTURE_VERSION,
      appVersion: CURRENT_SCHEMA_VERSION,
    });
    // Not the generic error leg — the whole point of the typed
    // distinction (migrations.ts's FutureSchemaVersionError).
    expect(store.workspaceLoadState.kind).not.toBe('error');

    // The system log carries the specific message, not the generic
    // "workspace did not load" one.
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('sync.workspaceFutureVersion', {
        blobVersion: FUTURE_VERSION, appVersion: CURRENT_SCHEMA_VERSION,
      }),
    )).toBe(true);
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('sync.workspaceLoadFailed'),
    )).toBe(false);
  });

  it('normal (non-future) boot reaches "loaded" — the recovery path does not disturb ordinary hydration', async () => {
    await loginAndConnect(CURRENT_SCHEMA_VERSION);
    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('sync.workspaceLoaded'),
    )).toBe(true);
  });
});

describe('SyncService — persist suppression (RED WITHOUT FIX: verified by temporarily removing the sendSync() suppression check)', () => {
  it('refuses a debounced-watcher persist attempt: zero PUTs reach the network, refusal is loud', async () => {
    await loginAndConnect(FUTURE_VERSION);
    router.putCount = 0;
    consoleErrorSpy.mockClear();

    // A board mutation while the recovery gate is up (still in
    // future-version state, suppression active from the moment of
    // detection — see PersistSuppressionState's doc comment in
    // sync-service.ts for why this does NOT wait for
    // continueOnDefaults()).
    addBoard(createInitialBoard());
    await nextTick();
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    await flushPromises();

    expect(router.putCount).toBe(0);
    expect(consoleErrorSpy.mock.calls.some(
      (call) => String(call[0]).includes('Persist refused'),
    )).toBe(true);
  });

  it('refuses a forceSave() attempt the same way', async () => {
    await loginAndConnect(FUTURE_VERSION);
    router.putCount = 0;
    consoleErrorSpy.mockClear();

    sync.forceSave();
    await flushPromises();

    expect(router.putCount).toBe(0);
    expect(consoleErrorSpy.mock.calls.some(
      (call) => String(call[0]).includes('Persist refused'),
    )).toBe(true);
  });
});

describe('SyncService — continueOnDefaults()', () => {
  it('unblocks the load gate (loaded) but keeps persistence suppressed', async () => {
    await loginAndConnect(FUTURE_VERSION);

    sync.continueOnDefaults();
    await nextTick();

    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
    expect(store.workspaceSaveState).toEqual({
      kind: 'suppressed', blobVersion: FUTURE_VERSION, appVersion: CURRENT_SCHEMA_VERSION,
    });

    // Persistence remains refused after continuing.
    router.putCount = 0;
    addBoard(createInitialBoard());
    await nextTick();
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    await flushPromises();
    expect(router.putCount).toBe(0);
  });

  it('is a no-op outside the future-version state (defensive guard)', async () => {
    await loginAndConnect(CURRENT_SCHEMA_VERSION);
    const before = store.workspaceLoadState;
    sync.continueOnDefaults();
    expect(store.workspaceLoadState).toEqual(before);
  });
});

describe('SyncService — resetServerWorkspaceToDefaults() (the destructive path)', () => {
  it('performs exactly one immediate PUT, lifts suppression, and resumes normal saves afterward', async () => {
    await loginAndConnect(FUTURE_VERSION);
    router.putCount = 0;

    sync.resetServerWorkspaceToDefaults();
    await flushPromises();

    // Exactly one PUT — immediate (forceSave-driven), not debounced.
    expect(router.putCount).toBe(1);
    expect(store.workspaceLoadState).toEqual({ kind: 'loaded' });
    expect(store.workspaceSaveState).toEqual({ kind: 'synced' });

    // Suppression lifted: a subsequent ordinary edit now schedules and
    // fires a normal debounced save.
    mutateProfile((p) => { p.settings.persistence = { debounceInterval: DEBOUNCE_MS }; });
    await nextTick();
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    await flushPromises();
    router.putCount = 0;
    addBoard(createInitialBoard());
    await nextTick();
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    await flushPromises();
    expect(router.putCount).toBeGreaterThan(0);
  });

  it('is a no-op outside the future-version-detected state (defensive guard — no pending userId)', async () => {
    await loginAndConnect(CURRENT_SCHEMA_VERSION);
    router.putCount = 0;
    sync.resetServerWorkspaceToDefaults();
    await flushPromises();
    expect(router.putCount).toBe(0);
  });
});
