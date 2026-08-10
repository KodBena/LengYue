/**
 * tests/integration/library/useWizardImportStaging.test.ts
 *
 * Integration tests for `useWizardImportStaging` — the setup wizard's
 * pure-staging core (commission rows 1404/1407/1464/1468). Drives it
 * via the public `stageFiles` verb (the file-feed point the pickers
 * and `dropItems` all converge into, same shape as
 * `useLibraryImport.test.ts`'s own convention for the sibling
 * EFFECTFUL composable).
 *
 * The property under test throughout: `stageFiles`/`pickFiles`/
 * `pickDirectory`/`dropItems`/`clear` NEVER call
 * `libraryService.importGames` — only `commit()` does. That is what
 * makes this module a pure core in the ADR-0012 P9 sense: parsing and
 * validating a plan touches no backend, no matter how many times it's
 * invoked or reset.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/library-service', async () => {
  const actual = await vi.importActual<typeof import('../../../src/services/library-service')>(
    '../../../src/services/library-service',
  );
  return {
    ...actual,
    libraryService: {
      importGames: vi.fn(),
    },
  };
});

import { libraryService } from '../../../src/services/library-service';
import { useWizardImportStaging } from '../../../src/composables/library/useWizardImportStaging';

const mockImport = vi.mocked(libraryService.importGames);

function makeFile(name: string, content: string, relPath: string = ''): File {
  const f = new File([content], name, { type: 'text/plain' });
  if (relPath !== '') {
    Object.defineProperty(f, 'webkitRelativePath', {
      value: relPath,
      configurable: true,
    });
  }
  return f;
}

beforeEach(() => {
  mockImport.mockReset();
});

describe('useWizardImportStaging — phase state machine', () => {
  it('starts in idle phase with an empty plan', () => {
    const s = useWizardImportStaging();
    expect(s.phase.value).toBe('idle');
    expect(s.plan.value).toEqual([]);
  });

  it('stageFiles() transitions idle → reading → staged, with zero service calls', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(s.phase.value).toBe('staged');
    expect(s.plan.value.length).toBe(1);
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('filters out non-.sgf files, same as the Library import path', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([
      makeFile('README.md', 'hi'),
      makeFile('game.sgf', '(;FF[4])'),
      makeFile('GAME2.SGF', '(;FF[4])'), // case-insensitive
    ]);
    expect(s.plan.value.length).toBe(2);
  });

  it('no-ops on empty/all-filtered input — stays idle, nothing staged', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('readme.txt', 'hi')]);
    expect(s.phase.value).toBe('idle');
    expect(s.plan.value).toEqual([]);
  });

  it('accumulates across multiple stageFiles() rounds', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    await s.stageFiles([makeFile('b.sgf', '(;FF[4])')]);
    expect(s.plan.value.map(f => f.fileName)).toEqual(['a.sgf', 'b.sgf']);
  });

  it('clear() drops the plan and returns to idle', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    s.clear();
    expect(s.phase.value).toBe('idle');
    expect(s.plan.value).toEqual([]);
  });
});

describe('useWizardImportStaging — sourcePath capture', () => {
  it('forwards webkitRelativePath as sourcePath into the staged input, same wire shape as useLibraryImport', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([
      makeFile('x.sgf', '(;FF[4])', 'sgf_db/1996/x.sgf'),
      makeFile('y.sgf', '(;FF[4])'),
    ]);
    expect(s.plan.value[0].input.sourcePath).toBe('sgf_db/1996/x.sgf');
    expect(s.plan.value[1].input.sourcePath).toBeNull();
  });
});

describe('useWizardImportStaging — commit() is the sole imperative-shell verb', () => {
  it('is a no-op — zero service calls — when the plan is empty', async () => {
    const s = useWizardImportStaging();
    const outcomes = await s.commit();
    expect(outcomes).toEqual([]);
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('sends every staged input, in order, exactly once', async () => {
    mockImport.mockResolvedValueOnce([
      { status: 'created', gameId: 1 as never, clientGameId: 'a' as never, displayOrdinal: 1 as never },
      { status: 'created', gameId: 2 as never, clientGameId: 'b' as never, displayOrdinal: 2 as never },
    ]);
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])'), makeFile('b.sgf', '(;FF[4])')]);

    const outcomes = await s.commit();

    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport.mock.calls[0][0]).toEqual([
      { rawContent: '(;FF[4])', sourcePath: null },
      { rawContent: '(;FF[4])', sourcePath: null },
    ]);
    expect(outcomes.length).toBe(2);
  });

  it('propagates a chunk-level throw to the caller (useSetupWizard.ts decides how loudly to report it)', async () => {
    mockImport.mockRejectedValueOnce(new Error('network down'));
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    await expect(s.commit()).rejects.toThrow('network down');
  });

  it('a cleared plan commits nothing, even after commit() was never called', async () => {
    const s = useWizardImportStaging();
    await s.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    s.clear();
    const outcomes = await s.commit();
    expect(outcomes).toEqual([]);
    expect(mockImport).not.toHaveBeenCalled();
  });
});
