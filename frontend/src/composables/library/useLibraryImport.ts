/**
 * src/composables/library/useLibraryImport.ts
 *
 * Drives the SGF library's import surface: file picker,
 * directory picker, drag-and-drop, recursive directory walk via
 * `webkitGetAsEntry`, `.sgf` filtering, `webkitRelativePath`
 * capture into `LibraryImportInput.sourcePath`, then chunked
 * upload via `libraryService.importGames` with progressive
 * status emission.
 *
 * Three entry points:
 *
 *   - `pickFiles()`: opens the OS file picker for individual
 *     SGFs (multi-select). Source paths are null — the file
 *     picker doesn't expose containing-folder structure for
 *     this mode.
 *
 *   - `pickDirectory()`: opens the OS picker in directory-mode
 *     (`<input webkitdirectory>`). The browser yields every file
 *     under the chosen root; we filter for `.sgf` and stamp
 *     `webkitRelativePath` as `sourcePath` so the on-disk
 *     layout survives into `metadata_extra.source_path`. The
 *     primary path for the 25k-files-organised-by-year case.
 *
 *   - `dropItems(items)`: handles `DragEvent.dataTransfer.items`.
 *     Walks dropped directories recursively via
 *     `webkitGetAsEntry()` (universally supported despite the
 *     name; standardised as `getAsEntry()` but the prefixed form
 *     is what the major browsers expose today).
 *
 * Phase state machine: `idle → reading → uploading → done`
 * (or `errored`). `reset()` returns to `idle`. The component
 * renders progress + a final summary off this state.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive, ref, shallowReadonly } from 'vue';
import type { Ref } from 'vue';
import {
  IMPORT_CHUNK_SIZE,
  libraryService,
} from '../../services/library-service';
import type {
  LibraryImportInput,
  LibraryImportOutcome,
} from '../../types';

export type ImportPhase = 'idle' | 'reading' | 'uploading' | 'done' | 'errored';

export interface ImportCounts {
  created: number;
  deduplicated: number;
  errored: number;
}

export interface ImportProgressState {
  filesRead: number;
  filesTotal: number;
  chunksUploaded: number;
  chunksTotal: number;
  counts: ImportCounts;
}

export interface LibraryImport {
  readonly phase: Readonly<Ref<ImportPhase>>;
  readonly progress: Readonly<ImportProgressState>;
  readonly lastOutcomes: Readonly<Ref<readonly LibraryImportOutcome[]>>;
  readonly errorMessage: Readonly<Ref<string | null>>;

  /** OS picker for individual SGF files. Multi-select; no source path captured. */
  pickFiles: () => void;

  /** OS picker in directory mode. Source path captured per file. */
  pickDirectory: () => void;

  /**
   * Walk `DataTransferItemList` entries (from a `drop` event),
   * recursing into dropped directories. Synthesises a
   * source path matching the dropped directory layout.
   */
  dropItems: (items: DataTransferItemList) => Promise<void>;

  /**
   * Direct file-feed point: import an already-resolved File
   * array. The three pickers above converge into this verb; a
   * custom drop handler or a test harness can call it
   * directly. Non-`.sgf` entries are filtered out internally.
   */
  importFiles: (files: readonly File[]) => Promise<void>;

  /** Reset to `idle`, clearing progress and outcomes. */
  reset: () => void;
}

// Case-insensitive `.sgf` extension check. Filters out
// `.DS_Store`, READMEs, thumbnails, and any other directory
// detritus.
function isSgfFile(name: string): boolean {
  return name.toLowerCase().endsWith('.sgf');
}

// Read every File concurrently; the browser's file system layer
// handles IOPS scheduling. For directories yielded by the
// picker, `file.webkitRelativePath` is "<root>/sub/.../name.sgf";
// for plain file-pickers, it's the empty string — we map to
// null so the wire shape stays clean.
async function filesToInputs(
  files: readonly File[],
  onProgress: (filesRead: number) => void,
): Promise<LibraryImportInput[]> {
  const inputs: LibraryImportInput[] = new Array(files.length);
  let done = 0;
  await Promise.all(files.map(async (f, i) => {
    const raw = await f.text();
    // `webkitRelativePath` is `''` for plain file-picker selections
    // (browser default) or `undefined` when the File was constructed
    // synthetically without defineProperty (jsdom, tests). Either
    // way, no captured path — emit `null` so the wire shape stays
    // clean. The truthy branch handles browser-set non-empty paths
    // and our defineProperty-synthesised drop-walk paths.
    const rel = f.webkitRelativePath;
    inputs[i] = {
      rawContent: raw,
      sourcePath: rel ? rel : null,
    };
    done++;
    onProgress(done);
  }));
  return inputs;
}

// FileSystemEntry types aren't standardised in lib.dom but
// every major browser exposes them under the `webkit` prefix.
// These types are pruned to the surface we actually use.
interface FsEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly fullPath: string;
}
interface FsFileEntry extends FsEntry {
  readonly isFile: true;
  file: (cb: (f: File) => void, errCb?: (e: unknown) => void) => void;
}
interface FsDirectoryEntry extends FsEntry {
  readonly isDirectory: true;
  createReader: () => FsDirectoryReader;
}
interface FsDirectoryReader {
  readEntries: (cb: (entries: FsEntry[]) => void, errCb?: (e: unknown) => void) => void;
}

function readEntries(reader: FsDirectoryReader): Promise<FsEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function readFile(entry: FsFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

// Synthesise a webkitRelativePath-equivalent for a dropped file.
// `entry.fullPath` is "/dropped-root/sub/name.sgf"; strip the
// leading slash so it matches the file-picker's format.
function pathFromEntry(entry: FsEntry): string {
  return entry.fullPath.startsWith('/') ? entry.fullPath.slice(1) : entry.fullPath;
}

async function walkEntry(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile && isSgfFile((entry as FsFileEntry).fullPath)) {
    const f = await readFile(entry as FsFileEntry);
    // Synthesise webkitRelativePath via Object.defineProperty —
    // the File constructor doesn't accept it directly. Drop
    // events expose entries without populating this field; we
    // fill it so the downstream `filesToInputs` path treats
    // dropped directories identically to picked directories.
    Object.defineProperty(f, 'webkitRelativePath', {
      value: pathFromEntry(entry),
      configurable: true,
    });
    out.push(f);
  } else if (entry.isDirectory) {
    const reader = (entry as FsDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call; loop
    // until empty to drain the full directory.
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

const INITIAL_PROGRESS: ImportProgressState = {
  filesRead: 0,
  filesTotal: 0,
  chunksUploaded: 0,
  chunksTotal: 0,
  counts: { created: 0, deduplicated: 0, errored: 0 },
};

export function useLibraryImport(onImportComplete?: () => void): LibraryImport {
  const phase = ref<ImportPhase>('idle');
  const progress = reactive<ImportProgressState>({ ...INITIAL_PROGRESS, counts: { ...INITIAL_PROGRESS.counts } });
  const lastOutcomes = ref<readonly LibraryImportOutcome[]>([]);
  const errorMessage = ref<string | null>(null);

  function reset(): void {
    phase.value = 'idle';
    progress.filesRead = 0;
    progress.filesTotal = 0;
    progress.chunksUploaded = 0;
    progress.chunksTotal = 0;
    progress.counts.created = 0;
    progress.counts.deduplicated = 0;
    progress.counts.errored = 0;
    lastOutcomes.value = [];
    errorMessage.value = null;
  }

  async function importFiles(rawFiles: readonly File[]): Promise<void> {
    reset();
    const files = rawFiles.filter(f => isSgfFile(f.name));
    if (files.length === 0) return;
    try {
      phase.value = 'reading';
      progress.filesTotal = files.length;
      const inputs = await filesToInputs(files, n => { progress.filesRead = n; });

      phase.value = 'uploading';
      progress.chunksTotal = Math.ceil(inputs.length / IMPORT_CHUNK_SIZE);

      const outcomes = await libraryService.importGames(inputs, ev => {
        progress.chunksUploaded = ev.chunkIndex + 1;
        for (const o of ev.chunkOutcomes) {
          if (o.status === 'created') progress.counts.created++;
          else if (o.status === 'deduplicated') progress.counts.deduplicated++;
          else progress.counts.errored++;
        }
      });
      lastOutcomes.value = outcomes;
      phase.value = 'done';
      onImportComplete?.();
    } catch (err) {
      phase.value = 'errored';
      errorMessage.value = err instanceof Error ? err.message : String(err);
    }
  }

  function pickFiles(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.sgf';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      void importFiles(files);
    };
    input.click();
  }

  function pickDirectory(): void {
    const input = document.createElement('input');
    input.type = 'file';
    // `webkitdirectory` is the standardised attribute today
    // despite the prefix; supported in Chrome / Firefox / Safari.
    (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      void importFiles(files);
    };
    input.click();
  }

  async function dropItems(items: DataTransferItemList): Promise<void> {
    const collected: File[] = [];
    // DataTransferItemList isn't iterable in older lib.dom; index manually.
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // `webkitGetAsEntry` is the cross-browser shape; the
      // standardised `getAsEntry` is not yet ubiquitous.
      const entry = (item as unknown as {
        webkitGetAsEntry?: () => FsEntry | null;
      }).webkitGetAsEntry?.();
      if (entry) await walkEntry(entry, collected);
    }
    await importFiles(collected);
  }

  return {
    phase: shallowReadonly(phase),
    progress,
    lastOutcomes: shallowReadonly(lastOutcomes),
    errorMessage: shallowReadonly(errorMessage),
    pickFiles,
    pickDirectory,
    dropItems,
    importFiles,
    reset,
  };
}
