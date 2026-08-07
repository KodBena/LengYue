/**
 * tests/integration/sync-session-version.test.ts
 *
 * Tier-3 SAVE-COVERAGE net for the `sessionVersion` perf fix
 * (work-status item `perf-syncservice-deep-watch-session`). SyncService's
 * store watcher dropped its `{ deep: true }` traversal of
 * `store.session` — which was O(open-board count) per fire and O(N²)
 * over a close-all because `store.session` holds three PER-BOARD
 * dictionaries (`session.reviews`, `session.ui.cardTreeNav`,
 * `session.ui.forestNav.selection`) — and now watches a shallow
 * `sessionVersion` counter that every persistence-relevant session
 * write must bump via `touchSession()` (see `sessionVersion` in
 * `store/index.ts`).
 *
 * The risk the fix introduces: a session mutation that forgets to
 * bump the counter is a SILENTLY LOST SAVE — strictly worse than the
 * traversal cost removed. This suite is the load-bearing net against
 * that. It drives the REAL SyncService + real store against a stubbed
 * `fetch` (the network boundary, modelled on `auth-lifecycle.test.ts`)
 * and asserts that each persistence-relevant mutation CATEGORY
 * actually causes a debounced PUT to `/documents/{key}` to fire:
 *
 *   - board add / board close / board mutate  (the `boardsVersion` +
 *     `activeBoardIndex` legs — regression that the watcher rewrite
 *     didn't drop them);
 *   - a `session.ui` workspace-global flag change (keybinding-shaped
 *     toggle);
 *   - each PER-BOARD session change: review status
 *     (`mutateReviewSession`), card-tree nav
 *     (`toggleCardTreeManualExpand` / `setCardTreeManualExpand`),
 *     forest-nav selection (`useForestNavigation.select`) — the three
 *     O(N) dictionaries the counter now carries;
 *   - the `blind-mode-prefs` owned write into `session.ui`;
 *   - a `profile` change (regression: profile keeps its own deep
 *     watch, so it must still schedule a save).
 *
 * The assertion is on the WATCHER → DEBOUNCE → PUT path (not on
 * `forceSave`, which bypasses the watcher): each mutation must, on its
 * own, drive a PUT once the debounce elapses. A negative control
 * (a non-persisted `store.engine` write) confirms the harness isn't
 * trivially green. The coordinator mutation-tests this suite: a
 * dropped `touchSession()` at any covered write site must turn a case
 * red here.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store-cleanup boundaries, mocked exactly as in auth-lifecycle.test.ts /
// store-mutators.test.ts so `resetWorkspace`'s owner-registered teardown
// drain records on spies instead of touching network / DOM dependencies.
// Each factory re-registers a delegating workspace-reset handler (the
// wholesale vi.mock skips the owner's own module-init registration).
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
// LOAD-BEARING IMPORT ORDER: `src/store` must initialize BEFORE the auth
// chain (useAuth → api-client). See the detailed note in
// auth-lifecycle.test.ts — swapping these hangs the worker at collect time.
import {
  store,
  resetWorkspace,
  clearSystemMessages,
  createInitialBoard,
  addBoard,
  closeBoard,
  mutateBoard,
  mutateReviewSession,
  toggleCardTreeManualExpand,
  setCardTreeManualExpand,
  CURRENT_SCHEMA_VERSION,
} from '../../src/store';
import '../../src/store/teardown-registrations';
import { mutateProfile, writeStoreKnobValue } from '../../src/store/profile-owner';
import { useForestNavigation } from '../../src/composables/forest/useForestNavigation';
import { blindModePrefs } from '../../src/composables/review/blind-mode-prefs';
import { KEYBINDINGS_REGISTRY, ACTIONS } from '../../src/composables/keybindings-catalog';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { SyncService } from '../../src/services/sync-service';
import { i18n } from '../../src/i18n';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { withSetup } from './with-setup';
import { ref, nextTick } from 'vue';
import type { BoardId, CardId, CardTreeExpandKey, ForestStat, KnobId } from '../../src/types';

const auth = useAuth();

// Tiny debounce so the watcher → setTimeout → PUT path settles fast
// under real timers. Set on the live profile after each reset.
const DEBOUNCE_MS = 5;

// ── Fetch router ────────────────────────────────────────────────────────────
// Minimal backend double. Serves login/verify and the document GET
// (hydration) + PUT (save). Records PUT calls to `/documents/` so a
// scheduled-and-fired save is observable; GETs (hydration) are not counted.
interface RouterState {
  putCount: number;
}

function installFetchRouter(users: Record<string, number>): RouterState {
  const state: RouterState = { putCount: 0 };
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
        return json(200, { ok: true });
      }
      // GET hydration: a current-schema empty workspace.
      return json(200, { data: { schemaVersion: CURRENT_SCHEMA_VERSION } });
    }
    return json(200, { ok: true });
  }));
  return state;
}

let router: RouterState;
let sync: SyncService;

/**
 * Drive the watcher → debounce → PUT path once and report whether a
 * PUT fired. Resets the PUT counter first so the count is per-mutation.
 * `mutate` performs the store change; we then let Vue flush the watcher
 * (microtask), wait out the debounce, and flush the PUT promise.
 */
async function putFiredAfter(mutate: () => void): Promise<boolean> {
  router.putCount = 0;
  mutate();
  await nextTick();                                  // watcher fires → schedules debounce
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 5)); // debounce elapses → sendSync
  await flushPromises();                             // PUT resolves
  return router.putCount > 0;
}

beforeEach(async () => {
  localStorage.clear();
  auth.logout();
  resetWorkspace();
  clearSystemMessages();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();

  router = installFetchRouter({ bob: 7 });

  // Establish identity + a hydrated SyncService so the identity gate in
  // `scheduleSync` is open (hydratedForUserId === userId). withSetup scopes
  // the watchers so they are reclaimed on test finish (pass or fail).
  await auth.login('bob', 'pw');
  sync = new SyncService('user_workspace_01', auth);
  withSetup(() => { sync.connect(); });
  await flushPromises();
  // Hydration landed (the precondition for saves).
  expect(store.engine.messages.some(
    (m) => m.text === i18n.global.t('sync.workspaceLoaded'),
  )).toBe(true);

  // Shrink the debounce on the live profile (post-hydration). This is itself
  // a profile write; let it settle so it doesn't bleed a PUT into the first
  // assertion.
  mutateProfile((p) => { p.settings.persistence = { debounceInterval: DEBOUNCE_MS }; });
  await nextTick();
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 5));
  await flushPromises();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SyncService save-coverage — board channels (boardsVersion / activeBoardIndex)', () => {
  it('board ADD schedules a save', async () => {
    expect(await putFiredAfter(() => addBoard(createInitialBoard()))).toBe(true);
  });

  it('board MUTATE schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    expect(await putFiredAfter(() => mutateBoard(boardId, () => { /* version bump suffices */ }))).toBe(true);
  });

  it('board CLOSE schedules a save', async () => {
    // Two boards so closeBoard splices rather than replacing-the-last.
    addBoard(createInitialBoard());
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 5));
    await flushPromises();
    const victim = store.boards[0].id;
    expect(await putFiredAfter(() => closeBoard(victim))).toBe(true);
  });
});

/**
 * Invoke a keybinding action's handler through the PRODUCTION catalog
 * (not an inline store write), so the assertion exercises the real
 * `session.ui` toggle write site. A keybinding handler is the canonical
 * workspace-global `session.ui` flag writer; driving it here means a
 * dropped `touchSession()` in `keybindings-catalog.ts` turns this case
 * red rather than passing silently.
 */
function fireKeybinding(id: string): void {
  const decl = KEYBINDINGS_REGISTRY.find((d) => d.id === id);
  if (!decl) throw new Error(`keybinding action "${id}" not found in registry`);
  decl.handler();
}

describe('SyncService save-coverage — session.ui workspace-global flag', () => {
  it('a session.ui flag toggle via the PRODUCTION keybinding handler schedules a save', async () => {
    // The move-suggestions keybinding handler flips
    // `store.session.ui.showMoveSuggestions` and bumps the counter — the
    // real workspace-global flag write path, not an inline test write.
    expect(await putFiredAfter(() =>
      fireKeybinding(ACTIONS.displayToggleMoveSuggestions),
    )).toBe(true);
  });

  it('a generic-record session.ui write (forest-nav expandAll) schedules a save', async () => {
    // `expandAll` reassigns `session.ui.forestNav.expanded` wholesale — the
    // aliased/whole-field write shape distinct from the per-board `select`.
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>(store.boards[store.activeBoardIndex].id);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));
    expect(await putFiredAfter(() => nav.expandAll())).toBe(true);
  });
});

describe('SyncService save-coverage — knob seam targeting session.ui', () => {
  it('a session-targeting knob write (writeStoreKnobValue) schedules a save', async () => {
    // `display.move-filter-threshold` is a seeded knob whose output path is
    // `session.ui.moveFilterThreshold` (defaults.ts). Writing it through the
    // production seam mutates `store.session`, so it must schedule a save —
    // the subtlest write site (it goes through the profile-owner knob root,
    // not a session mutator). Unclaimed + manual ⇒ the write applies.
    expect(await putFiredAfter(() => {
      // Cast: the seeded knob id is a registry key string; brand it KnobId
      // for the seam call (the registry keys ARE the KnobId vocabulary).
      const result = writeStoreKnobValue('display.move-filter-threshold' as KnobId, [0.4], { kind: 'manual' });
      expect(result.kind).toBe('written');
    })).toBe(true);
  });
});

describe('SyncService save-coverage — per-board session dictionaries (the O(N) cells)', () => {
  it('a review-status change (mutateReviewSession) schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    expect(await putFiredAfter(() =>
      mutateReviewSession(boardId, (r) => { r.status = 'LOADING'; }),
    )).toBe(true);
  });

  it('a card-tree nav toggle (toggleCardTreeManualExpand) schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    expect(await putFiredAfter(() =>
      toggleCardTreeManualExpand(boardId, '42' as CardTreeExpandKey),
    )).toBe(true);
  });

  it('a card-tree nav bulk-replace (setCardTreeManualExpand) schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    expect(await putFiredAfter(() =>
      setCardTreeManualExpand(boardId, ['7' as CardTreeExpandKey]),
    )).toBe(true);
  });

  it('a forest-nav selection (useForestNavigation.select) schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>(boardId);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));
    expect(await putFiredAfter(() =>
      nav.select({ kind: 'root', rootCardId: 5 as CardId }),
    )).toBe(true);
  });
});

describe('SyncService save-coverage — blind-mode owned session.ui write', () => {
  it('a blind-mode owned write (capture + write) schedules a save', async () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    // A review row so the owner's exit predicate has an active status to read.
    mutateReviewSession(boardId, (r) => { r.status = 'AWAITING_MOVE'; });
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 5));
    await flushPromises();
    expect(await putFiredAfter(() => {
      blindModePrefs.capture(boardId);
      blindModePrefs.write('showMoveSuggestions', false);
    })).toBe(true);
    // Clean up the snapshot so it doesn't leak into later tests' session.ui.
    blindModePrefs.releaseAll();
  });
});

describe('SyncService save-coverage — profile regression', () => {
  it('a profile change still schedules a save (deep profile watch intact)', async () => {
    expect(await putFiredAfter(() =>
      mutateProfile((p) => { p.username = 'changed'; }),
    )).toBe(true);
  });
});

describe('SyncService save-coverage — negative control', () => {
  it('a non-persisted store.engine write does NOT schedule a save', async () => {
    // `store.engine` is excluded from buildPersistencePayload and from every
    // watcher channel — a write to it must not drive a PUT. Confirms the
    // harness is not trivially green (every mutation appearing to save).
    expect(await putFiredAfter(() => {
      store.engine.metrics.packetsPerSecond += 1;
    })).toBe(false);
  });
});
