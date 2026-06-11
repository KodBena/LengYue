/**
 * tests/unit/eslint-rules/board-mutation-entry-point.test.ts
 *
 * Unit test for the custom ESLint rule `board-mutation-entry-point`
 * (eslint-rules/board-mutation-entry-point.js). The rule is the
 * grading-integrity coverage net: every `updateBoardState(...)` call site
 * must be the grading gate, the store's definition, or a named non-user-move
 * mutator on the allowlist. "A guard that cannot fail is worse than none", so
 * this pins the rule's OWN behaviour — it FLAGS a call from an unclassified
 * file and PASSES the gate / definition / allowlisted callers — so the rule
 * can't be edited into a silent no-op (and the deny-by-default direction is
 * verified: an unknown file fails).
 *
 * RuleTester drives per-virtual-filename so the file-suffix matching is
 * exercised exactly as in production (the rule keys on `context.filename`).
 *
 * License: Public Domain (The Unlicense)
 */

import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import { boardMutationEntryPoint } from '../../../eslint-rules/board-mutation-entry-point.js';

// ESLint's RuleTester defaults to Mocha-style globals; wire it to vitest.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// The production config (kept in sync by inspection — the rule's value is
// in the deny-by-default direction, which a representative subset exercises).
const options = [
  {
    gateFiles: ['src/composables/board/useBoardMoveRouting.ts'],
    definitionFile: 'src/store/index.ts',
    allowlist: {
      'src/composables/review/useReviewSession.ts': 'the graded path itself',
      'src/composables/board/useEngineResponder.ts': 'engine reply move',
      'src/composables/board/usePlayFromPosition.ts': 'match cursor',
      'src/composables/sgf/loadIntoBoard.ts': 'SGF-load primitive',
    },
  },
];

const CALL = 'updateBoardState(idx, next);';

ruleTester.run('board-mutation-entry-point', boardMutationEntryPoint, {
  valid: [
    // The grading gate: the routed user-move path.
    { code: CALL, options, filename: 'src/composables/board/useBoardMoveRouting.ts' },
    // The store's own definition site (declares the primitive; not an entry point).
    {
      code: 'export function updateBoardState(i, s){ store.boards[i] = s; }',
      options,
      filename: 'src/store/index.ts',
    },
    // Allowlisted non-user-move mutators.
    { code: CALL, options, filename: 'src/composables/review/useReviewSession.ts' },
    { code: CALL, options, filename: 'src/composables/board/useEngineResponder.ts' },
    { code: CALL, options, filename: 'src/composables/board/usePlayFromPosition.ts' },
    { code: CALL, options, filename: 'src/composables/sgf/loadIntoBoard.ts' },
    // A file that never calls updateBoardState: nothing to report even though
    // it is unclassified.
    {
      code: 'function f(){ return store.boards.length; }',
      options,
      filename: 'src/composables/board/someOtherComposable.ts',
    },
    // A merely-named reference (not a call) is not an entry point.
    {
      code: 'const fn = updateBoardState; export { fn };',
      options,
      filename: 'src/composables/board/reexport.ts',
    },
  ],
  invalid: [
    // The bug the net prevents: a NEW user-move entry point in an
    // unclassified file calling updateBoardState directly, bypassing the gate.
    {
      code: CALL,
      options,
      filename: 'src/composables/board/useSomeNewMoveEntryPoint.ts',
      errors: [{ messageId: 'ungatedEntryPoint' }],
    },
    // A component reaching for it directly (also unclassified).
    {
      code: 'function onClick(){ updateBoardState(0, b); }',
      options,
      filename: 'src/components/board/RogueWidget.vue',
      errors: [{ messageId: 'ungatedEntryPoint' }],
    },
  ],
});
