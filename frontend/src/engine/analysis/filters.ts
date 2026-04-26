import type { KataAnalysisResponse } from '../../engine/katago/types';

/** A Predicate determines if a turn should be included in the calculation. */
export type AnalysisPredicate = (packet: KataAnalysisResponse) => boolean;

/** Common Predicates */
export const isBlack: AnalysisPredicate = (p) => p.rootInfo.currentPlayer === 'B';
export const isWhite: AnalysisPredicate = (p) => p.rootInfo.currentPlayer === 'W';
//export const highVisits = (min: number): AnalysisPredicate = (p) => p.rootInfo.visits >= min;
// ✅ Corrected: Arrow for the return, not an equals sign
export const highVisits = (min: number): AnalysisPredicate => (p) => p.rootInfo.visits >= min;

/**
 * Composable Predicate: AND
 */
export const and = (...preds: AnalysisPredicate[]): AnalysisPredicate => 
  (p) => preds.every(pred => pred(p));
