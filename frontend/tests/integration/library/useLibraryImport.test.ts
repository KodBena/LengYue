/**
 * tests/integration/library/useLibraryImport.test.ts
 *
 * Integration tests for `useLibraryImport`. Drives the composable
 * via the public `importFiles` verb (the file-feed point the
 * three OS-mediated pickers all converge into).
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

import { libraryService, IMPORT_CHUNK_SIZE } from '../../../src/services/library-service';
import { useLibraryImport } from '../../../src/composables/library/useLibraryImport';
import { nextTick } from 'vue';

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

describe('useLibraryImport — phase state machine', () => {
  it('starts in idle phase with zeroed progress', () => {
    const imp = useLibraryImport();
    expect(imp.phase.value).toBe('idle');
    expect(imp.progress.filesTotal).toBe(0);
    expect(imp.progress.counts.created).toBe(0);
  });

  it('transitions idle → reading → uploading → done', async () => {
    mockImport.mockImplementationOnce(async (_inputs, onProgress) => {
      onProgress?.({
        chunkIndex: 0,
        totalChunks: 1,
        chunkOutcomes: [{ status: 'created', gameId: 1 as never, clientGameId: 'x' as never }],
      });
      return [{ status: 'created', gameId: 1 as never, clientGameId: 'x' as never }];
    });
    const imp = useLibraryImport();
    await imp.importFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(imp.phase.value).toBe('done');
  });

  it('phase=errored when libraryService.importGames throws', async () => {
    mockImport.mockRejectedValueOnce(new Error('network down'));
    const imp = useLibraryImport();
    await imp.importFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(imp.phase.value).toBe('errored');
    expect(imp.errorMessage.value).toContain('network down');
  });

  it('reset() clears state back to idle', async () => {
    mockImport.mockResolvedValueOnce([
      { status: 'created', gameId: 1 as never, clientGameId: 'x' as never },
    ]);
    const imp = useLibraryImport();
    await imp.importFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(imp.phase.value).toBe('done');
    imp.reset();
    expect(imp.phase.value).toBe('idle');
    expect(imp.progress.filesTotal).toBe(0);
    expect(imp.lastOutcomes.value).toEqual([]);
  });
});

describe('useLibraryImport — file filtering', () => {
  it('filters out non-.sgf files', async () => {
    mockImport.mockResolvedValueOnce([]);
    const imp = useLibraryImport();
    await imp.importFiles([
      makeFile('README.md', 'hi'),
      makeFile('game.sgf', '(;FF[4])'),
      makeFile('.DS_Store', 'junk'),
      makeFile('GAME2.SGF', '(;FF[4])'),  // case-insensitive
    ]);
    expect(imp.progress.filesTotal).toBe(2);
  });

  it('no-ops on empty/all-filtered input — no service call', async () => {
    const imp = useLibraryImport();
    await imp.importFiles([makeFile('readme.txt', 'hi')]);
    expect(mockImport).not.toHaveBeenCalled();
    expect(imp.phase.value).toBe('idle');
  });
});

describe('useLibraryImport — sourcePath capture', () => {
  it('forwards webkitRelativePath as sourcePath', async () => {
    mockImport.mockResolvedValueOnce([]);
    const imp = useLibraryImport();
    await imp.importFiles([
      makeFile('x.sgf', '(;FF[4])', 'sgf_db/1996/x.sgf'),
      makeFile('y.sgf', '(;FF[4])'),  // no relPath
    ]);
    const inputs = mockImport.mock.calls[0][0];
    expect(inputs[0].sourcePath).toBe('sgf_db/1996/x.sgf');
    expect(inputs[1].sourcePath).toBeNull();
  });
});

describe('useLibraryImport — progress + counts aggregation', () => {
  it('counts created / deduplicated / errored outcomes from chunk events', async () => {
    mockImport.mockImplementationOnce(async (_inputs, onProgress) => {
      onProgress?.({
        chunkIndex: 0,
        totalChunks: 1,
        chunkOutcomes: [
          { status: 'created', gameId: 1 as never, clientGameId: 'a' as never },
          { status: 'created', gameId: 2 as never, clientGameId: 'b' as never },
          { status: 'deduplicated', gameId: 3 as never, clientGameId: null },
          { status: 'errored', error: 'bad' },
        ],
      });
      return [
        { status: 'created', gameId: 1 as never, clientGameId: 'a' as never },
        { status: 'created', gameId: 2 as never, clientGameId: 'b' as never },
        { status: 'deduplicated', gameId: 3 as never, clientGameId: null },
        { status: 'errored', error: 'bad' },
      ];
    });
    const imp = useLibraryImport();
    await imp.importFiles([
      makeFile('1.sgf', '(;FF[4])'),
      makeFile('2.sgf', '(;FF[4])'),
      makeFile('3.sgf', '(;FF[4])'),
      makeFile('4.sgf', '(;FF[4])'),
    ]);
    expect(imp.progress.counts.created).toBe(2);
    expect(imp.progress.counts.deduplicated).toBe(1);
    expect(imp.progress.counts.errored).toBe(1);
  });

  it('reports chunksTotal based on file count + IMPORT_CHUNK_SIZE', async () => {
    mockImport.mockResolvedValueOnce([]);
    const imp = useLibraryImport();
    // IMPORT_CHUNK_SIZE + 1 files → 2 chunks expected.
    const files = Array.from({ length: IMPORT_CHUNK_SIZE + 1 }, (_, i) =>
      makeFile(`f-${i}.sgf`, '(;FF[4])'),
    );
    await imp.importFiles(files);
    expect(imp.progress.chunksTotal).toBe(2);
  });
});

describe('useLibraryImport — onImportComplete callback', () => {
  it('fires after a successful import', async () => {
    mockImport.mockResolvedValueOnce([]);
    const cb = vi.fn();
    const imp = useLibraryImport(cb);
    await imp.importFiles([makeFile('a.sgf', '(;FF[4])')]);
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on failure', async () => {
    mockImport.mockRejectedValueOnce(new Error('oops'));
    const cb = vi.fn();
    const imp = useLibraryImport(cb);
    await imp.importFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(cb).not.toHaveBeenCalled();
  });
});
