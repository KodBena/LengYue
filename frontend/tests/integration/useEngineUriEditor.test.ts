/**
 * tests/integration/useEngineUriEditor.test.ts
 *
 * Integration coverage for `useEngineUriEditor` (ledger slug
 * toolbar-engine-uri), the toolbar's address-bar-like editor for
 * `store.profile.settings.engine.katago.url`.
 *
 * Four commissioned acceptance properties:
 *
 *   1. SAME CELL — the toolbar editor and the Settings tab's
 *      Advanced Registry editor (`mutateProfile` / `updateProfileAt`
 *      via `store/profile-owner.ts`) read and write the identical
 *      store cell, not two values that happen to agree. Proven by
 *      writing through one path and reading through the other,
 *      both directions.
 *   2. INVALID URI REJECTION — a syntactically invalid draft never
 *      reaches the store cell, and a system message is pushed
 *      (ADR-0002 fail-loudly).
 *   3. ESCAPE REVERTS — cancelling a draft leaves the store cell
 *      untouched and restores the draft buffer to the stored value.
 *   4. RECONNECT ON COMMIT — a valid, changed commit while the
 *      engine is connected cycles the connection through the same
 *      `analysisService.disconnect` / `.connect` pair the toolbar's
 *      CONNECT/DISCONNECT button uses (spied via the fake). A
 *      disconnected engine is left disconnected (no forced connect).
 *
 * The store is the real reactive singleton; only `analysisService`
 * is faked (per `tests/CLAUDE.md`'s fake pattern) so the connect/
 * disconnect spies are directly assertable and no real WebSocket is
 * touched.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { store, resetWorkspace } from '../../src/store';
import { mutateProfile, updateProfileAt } from '../../src/store/profile-owner';
import { useEngineUriEditor } from '../../src/composables/useEngineUriEditor';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import { withSetup } from './with-setup';

const DEFAULT_URL = 'ws://127.0.0.1:41948';

beforeEach(() => {
  resetWorkspace();
  resetFakeAnalysisService();
  // `resetWorkspace` deliberately does NOT reset `store.engine`
  // (engine-connection.ts's documented scope note) — reset the two
  // fields these tests depend on explicitly for hermeticity.
  store.engine.status = 'disconnected';
  store.engine.messages = [];
  mutateProfile((profile) => {
    profile.settings.engine.katago.url = DEFAULT_URL;
  });
});

describe('useEngineUriEditor — same cell as the Settings path', () => {
  it('a write through the toolbar editor is visible through the Settings-tab write path (updateProfileAt)', () => {
    const editor = withSetup(() => useEngineUriEditor());
    editor.draft.value = 'ws://example.test:9999';
    editor.commit();

    // Read via the OTHER path — the exact seam SettingsTab.vue's
    // Advanced Registry editor uses for `engine.katago.url`.
    expect(store.profile.settings.engine.katago.url).toBe('ws://example.test:9999');
  });

  it('a write through the Settings-tab path (updateProfileAt) is visible via the toolbar editor\'s storedUri', () => {
    const editor = withSetup(() => useEngineUriEditor());
    updateProfileAt(['settings', 'engine', 'katago', 'url'], 'ws://other.example:1234');

    expect(editor.storedUri.value).toBe('ws://other.example:1234');
  });
});

describe('useEngineUriEditor — invalid URI rejection', () => {
  it('rejects a malformed draft, leaves the stored cell untouched, and pushes an error message', () => {
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'not a uri at all';
    editor.commit();

    expect(store.profile.settings.engine.katago.url).toBe(DEFAULT_URL);
    expect(editor.isEditing.value).toBe(true); // stays open so the user can fix it
    expect(store.engine.messages[0]?.type).toBe('error');
  });

  it('rejects a non-ws(s) scheme', () => {
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'http://127.0.0.1:41948';
    editor.commit();

    expect(store.profile.settings.engine.katago.url).toBe(DEFAULT_URL);
    expect(store.engine.messages[0]?.type).toBe('error');
  });

  it('does not call connect/disconnect on a rejected commit', () => {
    store.engine.status = 'connected';
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'garbage';
    editor.commit();

    expect(fakeAnalysisService.disconnect).not.toHaveBeenCalled();
    expect(fakeAnalysisService.connect).not.toHaveBeenCalled();
  });
});

describe('useEngineUriEditor — Escape reverts', () => {
  it('cancel() restores the draft to the stored value and leaves the store untouched', () => {
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'ws://scratch.example:1';
    editor.cancel();

    expect(editor.draft.value).toBe(DEFAULT_URL);
    expect(editor.isEditing.value).toBe(false);
    expect(store.profile.settings.engine.katago.url).toBe(DEFAULT_URL);
  });
});

describe('useEngineUriEditor — reconnect on commit', () => {
  it('cycles disconnect() then connect() when a valid, changed URI is committed while connected', () => {
    store.engine.status = 'connected';
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'ws://new-engine.example:41948';
    editor.commit();

    expect(store.profile.settings.engine.katago.url).toBe('ws://new-engine.example:41948');
    expect(fakeAnalysisService.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.connect).toHaveBeenCalledTimes(1);
    // disconnect before connect — the same ordering the toolbar's
    // CONNECT/DISCONNECT toggle relies on.
    const disconnectOrder = fakeAnalysisService.disconnect.mock.invocationCallOrder[0];
    const connectOrder = fakeAnalysisService.connect.mock.invocationCallOrder[0];
    expect(disconnectOrder).toBeLessThan(connectOrder);
  });

  it('does not reconnect when the engine was already disconnected', () => {
    store.engine.status = 'disconnected';
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = 'ws://new-engine.example:41948';
    editor.commit();

    expect(store.profile.settings.engine.katago.url).toBe('ws://new-engine.example:41948');
    expect(fakeAnalysisService.disconnect).not.toHaveBeenCalled();
    expect(fakeAnalysisService.connect).not.toHaveBeenCalled();
  });

  it('does not reconnect on a no-op commit (unchanged value)', () => {
    store.engine.status = 'connected';
    const editor = withSetup(() => useEngineUriEditor());
    editor.beginEdit();
    editor.draft.value = DEFAULT_URL; // unchanged
    editor.commit();

    expect(fakeAnalysisService.disconnect).not.toHaveBeenCalled();
    expect(fakeAnalysisService.connect).not.toHaveBeenCalled();
  });
});
