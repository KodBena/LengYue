/**
 * src/composables/analysis/useAnalysisPersistence.ts
 *
 * The effectful boundary for the analysis-persistence + stop-analysis
 * controls. Wraps `analysisPersistenceService` (the per-board save / discard
 * + reactive summary / auto-save-error accessors) and
 * `analysisService.stopBoardAnalysis` so `AnalysisControls` reads and acts
 * through a composable rather than importing the effectful service
 * singletons directly (frontend CLAUDE.md layering). The component keeps its
 * own local UI state (saving flag, error text, confirm dialogs); only the
 * service touch-points live here.
 *
 * `boardId` is a getter so `summary` / `autoSaveError` recompute when the
 * active board changes (the component passes `() => props.boardId`).
 *
 * NB the reactive ledger reads (`analysis-ledger`) stay in the component —
 * that module is the ADR-0010 read-locality exemption (a reactive-state
 * module a display leaf may read directly); this composable is only for the
 * effectful service singletons the import-boundary restricts.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type ComputedRef } from 'vue';
import { analysisService } from '../../services/analysis-service';
import { analysisPersistenceService } from '../../services/analysis-persistence-service';
import type { BoardId } from '../../types';

export function useAnalysisPersistence(boardId: () => BoardId): {
  summary: ComputedRef<ReturnType<typeof analysisPersistenceService.summaryFor>>;
  autoSaveError: ComputedRef<ReturnType<typeof analysisPersistenceService.autoSaveErrorFor>>;
  save: () => ReturnType<typeof analysisPersistenceService.save>;
  discard: () => ReturnType<typeof analysisPersistenceService.discard>;
  stopAnalysis: () => void;
} {
  const summary = computed(() => analysisPersistenceService.summaryFor(boardId()));
  const autoSaveError = computed(() => analysisPersistenceService.autoSaveErrorFor(boardId()));
  return {
    summary,
    autoSaveError,
    save: () => analysisPersistenceService.save(boardId()),
    discard: () => analysisPersistenceService.discard(boardId()),
    stopAnalysis: () => analysisService.stopBoardAnalysis(boardId()),
  };
}
