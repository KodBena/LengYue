/**
 * eslint.config.js
 *
 * Minimal flat-config ESLint host for the frontend SPA. Deliberately
 * NOT the eslint-plugin-vue "recommended" preset — enabling the broad
 * recommended set would surface hundreds of pre-existing style
 * findings and bury the signal. This config carries exactly the two
 * targeted, high-value rules the green-perf arc's prevention work (P3)
 * called for:
 *
 *   - vue/no-v-html       — flags every new `v-html` sink. The two
 *                           legitimate board-SVG string projections
 *                           (FloatingThumbnail.vue, LibraryPreviewPane.vue)
 *                           carry an inline `eslint-disable-next-line`
 *                           with a justification, so a NEW v-html is
 *                           still caught. See ADR-0010.
 *   - vue/require-v-for-key — a cheap correctness foothold.
 *
 * The point is a working static-lint *host* (there was none before)
 * plus the one rule that would have flagged a real defect this arc
 * fixed by hand — not a style sweep. New rules (e.g. a future
 * high-frequency-read heuristic, per ADR-0010's "Revisit when") are
 * added here as the ruleset matures.
 *
 * License: Public Domain (The Unlicense)
 */

import pluginVue from 'eslint-plugin-vue';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/types/backend.ts', // OpenAPI-generated; never hand-edited or linted.
    ],
  },
  // Vue SFCs: the vue parser handles <template>; the two targeted rules
  // apply here (no-v-html and require-v-for-key are template concerns).
  ...pluginVue.configs['flat/base'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // The vue parser delegates <script lang="ts"> blocks to the
        // TypeScript parser; without this it chokes on TS syntax even
        // though our two rules are template-only.
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'vue/no-v-html': 'error',
      'vue/require-v-for-key': 'error',
    },
  },
];
