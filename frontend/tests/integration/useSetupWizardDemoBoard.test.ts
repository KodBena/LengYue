/**
 * tests/integration/useSetupWizardDemoBoard.test.ts
 *
 * Integration coverage for `useSetupWizardDemoBoard.ts` — the
 * wizard's demo-board ledger seeding (ledger slug swz-setup-wizard,
 * step d). Two properties:
 *
 *   1. Happy path — the real bundled asset hydrates a real
 *      `BoardState` and seeds `state/analysis-ledger.ts::ledger`
 *      under the SAME key `state/analysis-config.ts::
 *      activeAnalysisKeys` resolves live — the exact key
 *      `BoardWidget.vue` reads (proving the "no second analysis
 *      pipeline" claim, not just asserting the loader ran).
 *   2. Loud failure — a malformed asset (mocked at the loader
 *      boundary) surfaces `loadError` and a system message instead
 *      of silently leaving `board` null with no signal (ADR-0002).
 *
 * `useSetupWizardDemoBoard` module-memoises its result (one demo
 * board per session — see its header), so the two properties are
 * exercised against two ISOLATED module instances via
 * `vi.resetModules()` + dynamic import, rather than two `it()`s
 * sharing the one cached singleton.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useSetupWizardDemoBoard — happy path (real bundled asset)', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetWorkspace } = await import('../../src/store');
    resetWorkspace();
  });

  it('hydrates a real BoardState and seeds the ledger under the live activeAnalysisKeys', async () => {
    const { useSetupWizardDemoBoard } = await import('../../src/composables/useSetupWizardDemoBoard');
    const { ledger } = await import('../../src/state/analysis-ledger');
    const { activeAnalysisKeys } = await import('../../src/state/analysis-config');

    const demo = useSetupWizardDemoBoard();

    expect(demo.loadError.value).toBeNull();
    expect(demo.board.value).not.toBeNull();
    expect(demo.provenance.value?.origin).toContain('synthetic-self-play');
    expect(demo.topPv.value.length).toBeGreaterThan(0);

    const nodeId = demo.board.value!.currentNodeId;
    const raw = ledger.getRaw(activeAnalysisKeys.value.rawKey, nodeId);
    expect(raw).not.toBeNull();
    expect(raw?.moveInfos.length).toBeGreaterThan(0);
    expect(raw?.ownership?.length).toBe(361);
  });

  it('is module-memoised: a second call returns the identical board instance', async () => {
    const { useSetupWizardDemoBoard } = await import('../../src/composables/useSetupWizardDemoBoard');
    const first = useSetupWizardDemoBoard();
    const second = useSetupWizardDemoBoard();
    expect(second.board).toBe(first.board);
  });
});

describe('useSetupWizardDemoBoard — malformed asset fails loudly', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetWorkspace } = await import('../../src/store');
    resetWorkspace();
  });

  it('sets loadError and pushes a system message instead of a silent blank board', async () => {
    vi.doMock('../../src/lib/setup-wizard-demo-loader', () => ({
      loadSetupWizardDemo: () => {
        throw new Error('injected malformed-asset failure');
      },
    }));

    const { useSetupWizardDemoBoard } = await import('../../src/composables/useSetupWizardDemoBoard');
    const { store } = await import('../../src/store');

    const demo = useSetupWizardDemoBoard();

    expect(demo.board.value).toBeNull();
    expect(demo.loadError.value).toMatch(/injected malformed-asset failure/);

    const messages = store.engine.messages;
    const hasErrorMessage = messages.some(m => m.type === 'error');
    expect(hasErrorMessage).toBe(true);

    vi.doUnmock('../../src/lib/setup-wizard-demo-loader');
  });
});
