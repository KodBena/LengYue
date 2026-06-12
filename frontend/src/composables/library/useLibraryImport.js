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
import { IMPORT_CHUNK_SIZE, libraryService, } from '../../services/library-service';
// Case-insensitive `.sgf` extension check. Filters out
// `.DS_Store`, READMEs, thumbnails, and any other directory
// detritus.
function isSgfFile(name) {
    return name.toLowerCase().endsWith('.sgf');
}
// Read every File concurrently; the browser's file system layer
// handles IOPS scheduling. For directories yielded by the
// picker, `file.webkitRelativePath` is "<root>/sub/.../name.sgf";
// for plain file-pickers, it's the empty string — we map to
// null so the wire shape stays clean.
async function filesToInputs(files, onProgress) {
    const inputs = new Array(files.length);
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
function readEntries(reader) {
    return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
    });
}
function readFile(entry) {
    return new Promise((resolve, reject) => {
        entry.file(resolve, reject);
    });
}
// Synthesise a webkitRelativePath-equivalent for a dropped file.
// `entry.fullPath` is "/dropped-root/sub/name.sgf"; strip the
// leading slash so it matches the file-picker's format.
function pathFromEntry(entry) {
    return entry.fullPath.startsWith('/') ? entry.fullPath.slice(1) : entry.fullPath;
}
async function walkEntry(entry, out) {
    if (entry.isFile && isSgfFile(entry.fullPath)) { // checked entry.isFile; FsEntry.isFile is boolean (no literal discriminator) so TS can't auto-narrow
        const f = await readFile(entry); // same isFile-checked narrowing
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
    }
    else if (entry.isDirectory) {
        const reader = entry.createReader(); // checked entry.isDirectory; FsEntry.isDirectory is boolean so TS can't auto-narrow
        // readEntries returns at most ~100 entries per call; loop
        // until empty to drain the full directory.
        for (;;) {
            const batch = await readEntries(reader);
            if (batch.length === 0)
                break;
            for (const child of batch)
                await walkEntry(child, out);
        }
    }
}
const INITIAL_PROGRESS = {
    filesRead: 0,
    filesTotal: 0,
    chunksUploaded: 0,
    chunksTotal: 0,
    counts: { created: 0, deduplicated: 0, errored: 0 },
};
export function useLibraryImport(onImportComplete) {
    const phase = ref('idle');
    const progress = reactive({ ...INITIAL_PROGRESS, counts: { ...INITIAL_PROGRESS.counts } });
    const lastOutcomes = ref([]);
    const errorMessage = ref(null);
    function reset() {
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
    async function importFiles(rawFiles) {
        reset();
        const files = rawFiles.filter(f => isSgfFile(f.name));
        if (files.length === 0)
            return;
        try {
            phase.value = 'reading';
            progress.filesTotal = files.length;
            const inputs = await filesToInputs(files, n => { progress.filesRead = n; });
            phase.value = 'uploading';
            progress.chunksTotal = Math.ceil(inputs.length / IMPORT_CHUNK_SIZE);
            const outcomes = await libraryService.importGames(inputs, ev => {
                progress.chunksUploaded = ev.chunkIndex + 1;
                for (const o of ev.chunkOutcomes) {
                    if (o.status === 'created')
                        progress.counts.created++;
                    else if (o.status === 'deduplicated')
                        progress.counts.deduplicated++;
                    else
                        progress.counts.errored++;
                }
            });
            lastOutcomes.value = outcomes;
            phase.value = 'done';
            onImportComplete?.();
        }
        catch (err) {
            phase.value = 'errored';
            errorMessage.value = err instanceof Error ? err.message : String(err);
        }
    }
    function pickFiles() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.sgf';
        input.onchange = (e) => {
            const files = Array.from(e.target.files ?? []); // DOM: onchange set on the file <input> just created, so target is it
            void importFiles(files);
        };
        input.click();
    }
    function pickDirectory() {
        const input = document.createElement('input');
        input.type = 'file';
        // `webkitdirectory` is the standardised attribute today
        // despite the prefix; supported in Chrome / Firefox / Safari.
        input.webkitdirectory = true;
        input.onchange = (e) => {
            const files = Array.from(e.target.files ?? []); // DOM: onchange set on the file <input> just created, so target is it
            void importFiles(files);
        };
        input.click();
    }
    async function dropItems(items) {
        const collected = [];
        // DataTransferItemList isn't iterable in older lib.dom; index manually.
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // `webkitGetAsEntry` is the cross-browser shape; the
            // standardised `getAsEntry` is not yet ubiquitous.
            const entry = item.webkitGetAsEntry?.();
            if (entry)
                await walkEntry(entry, collected);
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
