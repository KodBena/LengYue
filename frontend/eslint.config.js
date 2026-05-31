/**
 * eslint.config.js
 *
 * Flat-config ESLint host for the frontend SPA. Deliberately NOT the
 * eslint-plugin-vue "recommended" preset — enabling the broad recommended
 * set would surface hundreds of pre-existing style findings and bury the
 * signal. This config carries a small, targeted, high-value ruleset and
 * grows as the discipline matures (per ADR-0010's "Revisit when").
 *
 * Rules, by layer:
 *
 *   Template (Vue SFCs):
 *     - vue/no-v-html        — flags every new `v-html` sink. The two
 *                              legitimate board-SVG string projections
 *                              (FloatingThumbnail.vue, LibraryPreviewPane.vue)
 *                              carry an inline `eslint-disable-next-line`
 *                              with a justification, so a NEW v-html is
 *                              still caught. See ADR-0010.
 *     - vue/require-v-for-key — a cheap correctness foothold.
 *
 *   Import boundaries (`.ts` + `.vue`, via no-restricted-imports):
 *     - The OpenAPI-generated wire types (`src/types/backend.ts`,
 *       snake_case) may be imported ONLY within the services layer (the
 *       ACL) and `src/types.ts` (the type-level alias boundary where wire
 *       shapes become branded domain types). Importing them anywhere in
 *       domain code is the snake_case-leaks-past-the-ACL failure ADR-0002
 *       and the layering tenet forbid. Currently zero violations — this
 *       codifies an invariant that already holds.
 *     - Components may not import the effectful service *singletons*
 *       directly (the layering tenet: components are thin renderers; logic
 *       lives in composables; effects live in services and are called FROM
 *       composables). This deliberately restricts only the effectful
 *       singletons, NOT the reactive-state modules (`analysis-ledger`,
 *       `analysis-config`) — a display LEAF reading the reactive value it
 *       displays is sanctioned by ADR-0010's read-locality rule. Four
 *       components violate this today (ReviewSessionPanel, ForestDirectory,
 *       LibraryTab, AnalysisControls) across five import sites
 *       (AnalysisControls imports two services) — surfaced as honest
 *       layering debt, not disabled-as-accepted; they await adjudication
 *       (refactor to a composable, or a justified exception).
 *
 * This `.ts` linting is new: the prior config parsed `.vue` only, so
 * TypeScript modules went unlinted. The `@typescript-eslint/parser` was
 * already a dependency; this wires it for `.ts` files so the import
 * boundaries have teeth in the composable / store / engine / lib layers.
 * `tests/` is ignored for now (see the ignores block): linting it surfaces
 * anticipatory `no-console` disable directives in the e2e harness that
 * await a console-policy call — extending lint to tests is a later step.
 *
 * Composition note: the forthcoming Effect-TS "lighter stack" interim
 * (see docs/notes/opus-consult-2026-05-29-effect-ts-adoption.md) lands its
 * purity-audit leg HERE — `eslint-plugin-functional` scoped via overrides
 * to a `.pure.ts`/band convention. These import-boundary rules are an
 * orthogonal foundation it sits beside; nothing here pre-commits that work.
 * Type-checked rules (`@typescript-eslint` switch-exhaustiveness,
 * no-floating-promises, no-explicit-any) are a separate, later decision —
 * they require the rules plugin + a tsconfig project.
 *
 * License: Public Domain (The Unlicense)
 */

import pluginVue from 'eslint-plugin-vue';
import tsParser from '@typescript-eslint/parser';

// The wire-type boundary: backend.ts is importable only at the ACL.
// Applied everywhere EXCEPT src/services/** and src/types.ts (see block
// scoping below). Patterns are gitignore-style globs over the import
// source string, so they match the relative forms domain code uses
// (`../types/backend`, `../../types/backend`, …).
const WIRE_TYPE_PATTERN = {
  group: ['**/types/backend', '**/types/backend.ts'],
  message:
    'The OpenAPI-generated wire types (src/types/backend.ts) are the ACL ' +
    'boundary. Import them only within src/services/** or src/types.ts; ' +
    'domain code consumes the branded/camelCase domain types, never the ' +
    'snake_case wire shapes. See frontend/CLAUDE.md "Architectural shape" ' +
    '+ ADR-0002.',
};

// The effectful service singletons components must not import directly.
// NOT the reactive-state modules (analysis-ledger, analysis-config): a
// display leaf reading what it displays is ADR-0010-sanctioned.
const EFFECTFUL_SERVICE_PATTERN = {
  group: [
    '**/services/backend-service',
    '**/services/library-service',
    '**/services/analysis-service',
    '**/services/analysis-persistence-service',
  ],
  message:
    'Components are thin renderers; effectful service calls belong in a ' +
    'composable, not a component. (Reactive-state modules like ' +
    'analysis-ledger / analysis-config are exempt — a display leaf may ' +
    'read what it displays, per ADR-0010.) See frontend/CLAUDE.md ' +
    '"Architectural shape".',
};

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'tests/**', // test-tree linting is a later step (see header).
      'src/types/backend.ts', // OpenAPI-generated; never hand-edited or linted.
    ],
  },

  // Base Vue SFC setup (registers the vue parser for <template>).
  ...pluginVue.configs['flat/base'],

  // TypeScript modules: wire the TS parser so every `.ts` file ESLint
  // touches is TS-parsed (root config files included), not just src/.
  // Without this, a non-src `.ts` falls back to the default parser and
  // chokes on TS syntax. tests/ is excluded via the ignores block above.
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },

  // Vue SFCs: the vue parser delegates <script lang="ts"> to the TS parser;
  // the two template rules apply here.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
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

  // Wire-type boundary: enforced across all src code EXCEPT the ACL layer
  // (services/**) and the type-level alias boundary (types.ts).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: ['src/services/**', 'src/types.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [WIRE_TYPE_PATTERN] }],
    },
  },

  // Components additionally may not import the effectful service singletons.
  // This block matches component files too, so it must RE-STATE the wire-type
  // pattern (a later no-restricted-imports config replaces, not merges with,
  // the earlier one for files it matches).
  {
    files: ['src/components/**/*.ts', 'src/components/**/*.vue'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [WIRE_TYPE_PATTERN, EFFECTFUL_SERVICE_PATTERN] },
      ],
    },
  },
];
