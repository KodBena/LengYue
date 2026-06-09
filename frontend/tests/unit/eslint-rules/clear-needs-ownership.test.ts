/**
 * tests/unit/eslint-rules/clear-needs-ownership.test.ts
 *
 * Unit test for the custom ESLint rule `clear-needs-ownership`
 * (eslint-rules/clear-needs-ownership.js). The rule guards the
 * forest-vanishes-on-tab-away/back bug: a clearer that empties the card-tree
 * slot without consulting its `source` ownership tag. "A guard that cannot
 * fail is worse than none", so this pins the rule's OWN behaviour — it FLAGS a
 * blind clear and PASSES a gated clear or a producer that repopulates — so the
 * rule can't be edited into a silent no-op.
 *
 * License: Public Domain (The Unlicense)
 */

import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import { clearNeedsOwnership } from '../../../eslint-rules/clear-needs-ownership.js';

// ESLint's RuleTester defaults to Mocha-style globals; wire it to vitest.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const options = [
  {
    emptier: 'reset',
    emptyField: 'forest',
    ownershipField: 'source',
    repopulators: ['populateSlotFromMatched'],
  },
];

ruleTester.run('clear-needs-ownership', clearNeedsOwnership, {
  valid: [
    // Gated clear: references `source` before reset() (the shipped clearBrowse).
    {
      code: 'function clearBrowse(id){ const s = getSlot(id); if (!s || s.source !== "browse") return; reset(id); }',
      options,
    },
    // Producer: reset() then repopulate via the sanctioned helper (runPipeline).
    { code: 'function runPipeline(id, m){ reset(id); populateSlotFromMatched(id, m); }', options },
    // Producer: reset() then stamp ownership + refill (loadBrowse).
    { code: 'function loadBrowse(id, tree){ reset(id); getSlot(id).source = "browse"; getSlot(id).forest = [tree]; }', options },
    // The emptier itself: empties `.forest` AND sets `source = null`.
    { code: 'function reset(id){ const s = getSlot(id); s.forest = []; s.source = null; }', options },
    // Unrelated function: doesn't empty the slot at all.
    { code: 'function size(id){ return getSlot(id).forest.length; }', options },
  ],
  invalid: [
    // Blind clear: reset() with no ownership reference and no repopulate (the bug).
    {
      code: 'function clearBrowse(id){ if (!id) return; reset(id); }',
      options,
      errors: [{ messageId: 'blindClear' }],
    },
    // Blind direct empty: `.forest = []` with no ownership reference.
    {
      code: 'function wipe(id){ getSlot(id).forest = []; }',
      options,
      errors: [{ messageId: 'blindClear' }],
    },
  ],
});
