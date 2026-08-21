/**
 * src/composables/library/useWizardImportStaging.ts
 *
 * Pure-staging core for the setup wizard's "Import your games
 * (optional)" step (commission rows 1404/1407/1464/1468). The step
 * used to wire straight into `useLibraryImport`, which uploads to the
 * backend the instant a file is picked or dropped — an EFFECTFUL
 * mid-wizard write the commissioner ruled out (the commissioner
 * imported a game and it "destructively updated the DB immediately";
 * cancelling the wizard left it behind). This module is the pure
 * functional core (ADR-0012 P9): `pickFiles`/`pickDirectory`/
 * `dropItems` gather and parse files into a typed, in-memory
 * `StagedImportFile[]` plan — data only, no store write, no
 * `libraryService` call — reusing `useLibraryImport.ts`'s exported
 * pure helpers (`isSgfFile`, `filesToInputs`, `collectDroppedFiles`,
 * `openNativeFilePicker`) so the file-gathering/parse logic has one
 * home instead of a forked second copy.
 *
 * `commit()` is the ONE imperative-shell verb here — the only
 * function in this file that touches `libraryService` — and is
 * called exactly once, by `useSetupWizard.ts`'s `finish()`, never
 * from this step's own UI. Cancelling/closing the wizard never calls
 * `commit()`, so an unmounted (or explicitly `clear()`ed) plan simply
 * evaporates with zero externally-visible effect — the wizard-level
 * closure statement counts effects at this exact boundary (the
 * `libraryService.importGames` call), per the commission.
 *
 * Not a fork of `useLibraryImport`'s `LibraryImport` contract: this
 * composable is wizard-only, owned per-wizard-session by
 * `useSetupWizard.ts`. The Library tab's own import surface
 * (`LibraryImportPanel.vue` + `useLibraryImport.ts`) is untouched and
 * keeps its immediate-upload behaviour.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, shallowReadonly } from 'vue';
import type { Ref } from 'vue';
import { libraryService } from '../../services/library-service';
import type { LibraryImportOutcome, StagedImportFile } from '../../types';
import {
  collectDroppedFiles,
  filesToInputs,
  isSgfFile,
  openNativeFilePicker,
} from './useLibraryImport';

export type StagingPhase = 'idle' | 'reading' | 'staged' | 'errored';

export interface ImportStagingCommitProgress {
  readonly chunkIndex: number;
  readonly totalChunks: number;
}

export interface WizardImportStaging {
  readonly phase: Readonly<Ref<StagingPhase>>;
  /** Every file staged so far this wizard visit, across every pick/drop round. */
  readonly plan: Readonly<Ref<readonly StagedImportFile[]>>;
  readonly errorMessage: Readonly<Ref<string | null>>;

  /**
   * Direct file-feed point: parse an already-resolved File array into
   * the plan. The three pickers below converge into this verb (same
   * shape as `useLibraryImport.ts`'s `importFiles`); a custom drop
   * handler or a test harness can call it directly. Non-`.sgf`
   * entries are filtered out internally. Still pure — no upload.
   */
  stageFiles: (files: readonly File[]) => Promise<void>;

  /** OS picker for individual SGF files. Parses into the plan; no upload. */
  pickFiles: () => void;

  /** OS picker in directory mode. Parses into the plan; no upload. */
  pickDirectory: () => void;

  /** Walk a drop event's entries into the plan; no upload. */
  dropItems: (items: DataTransferItemList) => Promise<void>;

  /** Discard every staged file — the step's "start over" affordance,
   *  and what the wizard's `cancel()` relies on to leave nothing
   *  pending when the wizard is dismissed without finishing. */
  clear: () => void;

  /**
   * Imperative shell: sends the currently staged plan to
   * `libraryService.importGames` and returns its per-file outcomes.
   * A no-op (zero service calls) when the plan is empty, mirroring
   * `libraryService.importGames`'s own empty-input short-circuit.
   * ONLY `useSetupWizard.ts`'s `finish()` may call this — it is the
   * sole irreversible-effect trigger for this step.
   */
  commit: (
    onProgress?: (ev: ImportStagingCommitProgress) => void,
  ) => Promise<readonly LibraryImportOutcome[]>;
}

export function useWizardImportStaging(): WizardImportStaging {
  const phase = ref<StagingPhase>('idle');
  const plan = ref<StagedImportFile[]>([]);
  const errorMessage = ref<string | null>(null);

  async function stageFiles(rawFiles: readonly File[]): Promise<void> {
    const files = rawFiles.filter(f => isSgfFile(f.name));
    if (files.length === 0) return;
    try {
      phase.value = 'reading';
      const inputs = await filesToInputs(files, () => {});
      const staged: StagedImportFile[] = files.map((f, i) => ({
        fileName: f.name,
        input: inputs[i],
      }));
      // Rebind, not mutate (ADR-0001): a fresh array, accumulating
      // onto whatever was already staged this wizard visit.
      plan.value = [...plan.value, ...staged];
      phase.value = 'staged';
    } catch (err) {
      phase.value = 'errored';
      errorMessage.value = err instanceof Error ? err.message : String(err);
    }
  }

  function pickFiles(): void {
    openNativeFilePicker({ directory: false }, files => { void stageFiles(files); });
  }

  function pickDirectory(): void {
    openNativeFilePicker({ directory: true }, files => { void stageFiles(files); });
  }

  async function dropItems(items: DataTransferItemList): Promise<void> {
    await stageFiles(await collectDroppedFiles(items));
  }

  function clear(): void {
    plan.value = [];
    phase.value = 'idle';
    errorMessage.value = null;
  }

  async function commit(
    onProgress?: (ev: ImportStagingCommitProgress) => void,
  ): Promise<readonly LibraryImportOutcome[]> {
    if (plan.value.length === 0) return [];
    const inputs = plan.value.map(f => f.input);
    return libraryService.importGames(inputs, ev => {
      onProgress?.({ chunkIndex: ev.chunkIndex, totalChunks: ev.totalChunks });
    });
  }

  return {
    phase: shallowReadonly(phase),
    plan: shallowReadonly(plan),
    errorMessage: shallowReadonly(errorMessage),
    stageFiles,
    pickFiles,
    pickDirectory,
    dropItems,
    clear,
    commit,
  };
}
