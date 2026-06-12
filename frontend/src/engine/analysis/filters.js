/** Common Predicates */
export const isBlack = (p) => p.rootInfo.currentPlayer === 'B';
export const isWhite = (p) => p.rootInfo.currentPlayer === 'W';
//export const highVisits = (min: number): AnalysisPredicate = (p) => p.rootInfo.visits >= min;
// ✅ Corrected: Arrow for the return, not an equals sign
export const highVisits = (min) => (p) => p.rootInfo.visits >= min;
/**
 * Composable Predicate: AND
 */
export const and = (...preds) => (p) => preds.every(pred => pred(p));
