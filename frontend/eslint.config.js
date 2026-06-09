/**
 * eslint.config.js
 *
 * Flat-config ESLint host for the frontend SPA. Deliberately NOT the
 * eslint-plugin-vue "recommended" preset — enabling the broad recommended
 * set would surface hundreds of pre-existing style findings and bury the
 * signal. This config carries a small, targeted, high-value ruleset and
 * grows as the discipline matures (per ADR-0010's "Revisit when").
 *
 * Rule-rationale discipline: every rule here carries a rationale. The
 * impedance a rule imposes is NOT the code's to absorb — code is the fluid
 * ether that fills whatever gaps the architectural discipline (the
 * ADRs/tenets) and the project's concrete ambitions carve out; it conforms
 * freely and is never itself the thing in tension. The real impedance is
 * reasoning under possibly-contradictory DIRECTIVES: a rule can rest on one
 * sound rationale (e.g. CLAUDE.md's layering tenet) while another sound
 * directive on independent grounds (e.g. ADR-0010's read-locality) pulls
 * the other way. So a rationale must name not only why the rule exists but,
 * where directives meet, which ones are in tension and whether they are
 * reconciled or held unresolved. Surfacing that tension is the obligation
 * (ADR-0002) — owed even, and especially, when there is no bandwidth to
 * resolve it now; whether two directives can ultimately be bridged into one
 * coherent principle is a separate, later question. The annotation is an
 * invitation to ask, not a certification the rule is correct.
 *
 * The rationale lives in this header per rule, in a `// rationale:` comment
 * at the rule site, and — for the no-restricted-imports rules — ALSO in the
 * `message` field shown to the developer when the rule fires.
 *
 * Rules, by layer:
 *
 *   Template (Vue SFCs):
 *     - vue/no-v-html        — rationale: `v-html` writes an unescaped
 *                              string into innerHTML, bypassing Vue's
 *                              template escaping — an XSS / injection sink
 *                              for any non-constant content. The two
 *                              legitimate board-SVG string projections
 *                              (FloatingThumbnail.vue, LibraryPreviewPane.vue)
 *                              carry an inline `eslint-disable-next-line`
 *                              with a justification, so a NEW sink is still
 *                              caught. See ADR-0010.
 *     - vue/require-v-for-key — rationale: without a `:key`, Vue's list diff
 *                              falls back to in-place index patching and
 *                              reuses a DOM / component instance for a
 *                              different logical item — silently corrupting
 *                              per-item local state, focus, and transitions.
 *                              The key restores stable identity. A
 *                              correctness rule, not a style nit: the failure
 *                              is a wrong-state render.
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
 *       composables). Rationale, chiefly testability: the three-tier test
 *       architecture (tests/CLAUDE.md) drives a composable against service
 *       fakes WITHOUT mounting a component, so effect-orchestration living
 *       in a composable is cheaply testable — the same call embedded in a
 *       component is reachable only via the component tests the project
 *       defers as low-ROI. Secondary: the component stays a thin renderer
 *       (ADR-0007), and effect lifecycle stays co-located with the
 *       resource-ownership-at-mutation-sites discipline. This deliberately
 *       restricts only the effectful
 *       singletons, NOT the reactive-state modules (`analysis-ledger`,
 *       `analysis-config`) — a display LEAF reading the reactive value it
 *       displays is sanctioned by ADR-0010's read-locality rule. That
 *       effectful-vs-reactive split is the SEAM where two directives meet —
 *       CLAUDE.md's layering tenet (effects flow component→composable→
 *       service) and ADR-0010's read-locality (a display leaf reads the
 *       reactive value it displays, wherever that value lives). The split is
 *       a working reconciliation, not a proven bridge: whether the two
 *       directives fully resolve into one coherent principle, or carry
 *       residual tension, is an OPEN question — documented here per ADR-0002,
 *       deferred for bandwidth, not settled by this rule. Four
 *       components violate this today (ReviewSessionPanel, ForestDirectory,
 *       LibraryTab, AnalysisControls) across five import sites
 *       (AnalysisControls imports two services) — surfaced as honest
 *       layering debt, not disabled-as-accepted; they await adjudication
 *       (refactor to a composable, or a justified exception).
 *
 *   Type-checked (`src/**` `.ts`, via the TS project service):
 *     - @typescript-eslint/switch-exhaustiveness-check — rationale: a switch
 *       over a union that doesn't handle every member (and has no default)
 *       silently ignores a case. The compiler-enforced form of the
 *       discriminated-union `never`-default exhaustiveness discipline. 0
 *       violations at adoption (the discipline already held) — a clean
 *       regression gate.
 *     - @typescript-eslint/no-floating-promises — rationale: an unawaited
 *       promise that can reject with no handler is the ADR-0002 silent-async
 *       class (the effect fails, nothing surfaces it). Satisfied by await /
 *       `.catch` / an explicit `void` for an intentional fire-and-forget whose
 *       callee self-handles. 7 sites at adoption, all resolved (each a
 *       verified self-handling fire-and-forget → `void` + rationale).
 *
 *   Syntactic guards (`src/**` `.ts` + `.vue`, via no-restricted-syntax):
 *     - no error-message reverse-engineering — rationale: a throw site that
 *       bakes structure into an error MESSAGE, reparsed downstream by
 *       `.match`/`.includes`/regex `.test`, is a brittleness hazard — a format
 *       drift silently degrades a typed failure to "unknown error" with NO
 *       compile error (the ADR-0002 silent class, reached THROUGH the error
 *       path that should be the loud one). Fix: a structured Error subclass
 *       with fields (`ApiError { status, body }`) consumed by `instanceof` +
 *       field branch. The 2026-06-01 exhaustiveness audit found the six known
 *       reparse sites were the complete population (converted, PR #318); this
 *       rule keeps it at zero. Best-effort + syntactic: catches
 *       `err.message.includes(...)` and `/re/.test(err.message)`, NOT a message
 *       routed through an intermediate variable — the gap named per ADR-0002,
 *       not papered over. Measured 0 hits on `src/` at adoption (corroborating
 *       the audit's complete-population finding), so adopted at `error` — a
 *       future non-error `.message` read trips it and takes an inline
 *       `eslint-disable` + justification (the `vue/no-v-html` model). Guard
 *       rationale + RCA: docs/notes/rca-discipline-lapses-2026-06-01.md (G1).
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
 * Type-checked rules now run via the rules plugin + the TS project service
 * (switch-exhaustiveness-check + no-floating-promises — see "Type-checked"
 * above). Still deferred as a separate, later decision: `no-explicit-any`
 * (~152 sites) and `max-lines` (~69 files over 250) — backlog-surfacing
 * rather than clean gates, so warn-as-backlog candidates, not adopted here.
 *
 * License: Public Domain (The Unlicense)
 */

import pluginVue from 'eslint-plugin-vue';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { clearNeedsOwnership } from './eslint-rules/clear-needs-ownership.js';

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
      // rationale: v-html bypasses Vue's HTML-escaping → XSS sink (header).
      'vue/no-v-html': 'error',
      // rationale: a missing :key makes Vue reuse an instance for the wrong
      // list item, corrupting local state / transitions — a correctness bug,
      // not a style nit (header).
      'vue/require-v-for-key': 'error',
    },
  },

  // Wire-type boundary. rationale: backend.ts is snake_case wire shapes;
  // the ACL is the single boundary where they become branded domain types,
  // so an import anywhere else is snake_case leaking into the domain — the
  // ADR-0002 silent-divergence class. (Full message shown on fire below.)
  // Enforced across all src code EXCEPT the ACL layer (services/**) and the
  // type-level alias boundary (types.ts).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: ['src/services/**', 'src/types.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [WIRE_TYPE_PATTERN] }],
    },
  },

  // Components additionally may not import the effectful service singletons.
  // rationale: an effectful service call is orchestration logic; it belongs
  // in a composable (testable against fakes per tests/CLAUDE.md; keeps the
  // component a thin renderer per ADR-0007). Reactive-state reads are exempt
  // (ADR-0010). Full rationale in the header; dev-facing form in the message.
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

  // ── Type-checked discipline rules (src/**/*.ts; TS project service) ───
  // Two type-aware rules mechanising existing prose disciplines, adopted as
  // `error` after measuring on src — switch-exhaustiveness: 0 violations
  // (already clean); no-floating-promises: 7, all resolved (each an
  // intentional fire-and-forget whose callee self-handles, now `void`+comment).
  //   - switch-exhaustiveness-check → rationale: a switch over a union that
  //     doesn't handle every member (and lacks a default) silently ignores a
  //     case — this is the compiler-enforced form of the discriminated-union
  //     `never`-default exhaustiveness discipline (type-driven design).
  //   - no-floating-promises → rationale: an unawaited promise that can reject
  //     with no handler is the ADR-0002 silent-async class (the effect fails,
  //     nothing surfaces it). Satisfied by await / `.catch` / an explicit
  //     `void` (the last documents an intentional fire-and-forget whose callee
  //     self-handles its own errors).
  // Type info comes from the TS project service — slower than syntactic
  // linting, so it runs in `npm run lint` / CI (which don't gate the build).
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // ── Brittleness guard: no reverse-engineering error-message strings ──
  // rationale: structure baked into an error MESSAGE and reparsed by string-
  // matching is the ADR-0002 silent-failure class reached through the error
  // path — a format drift degrades a typed failure to "unknown error" with no
  // compile error. Fix: a structured Error subclass with fields, consumed by
  // `instanceof` + field branch (api-client.ts's ApiError is the worked form).
  // Syntactic best-effort (catches the direct `.message.{includes,match,…}`
  // and `/re/.test(err.message)` shapes; NOT a message via an intermediate
  // variable — gap named per ADR-0002). Measured 0 hits on src at adoption →
  // adopted at `error`; a future non-error `.message` read takes an inline
  // eslint-disable + justification (the vue/no-v-html model). Full rationale
  // in the header; G1 in docs/notes/rca-discipline-lapses-2026-06-01.md.
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(includes|match|startsWith|endsWith|indexOf|search)$/][callee.object.property.name='message']",
          message:
            "Don't reverse-engineer structure out of an error MESSAGE string " +
            '(ADR-0002 brittleness hazard). Throw/consume a structured Error ' +
            'subclass with fields (e.g. ApiError { status, body }) and branch ' +
            'on `instanceof` + the field. See ' +
            'docs/notes/rca-discipline-lapses-2026-06-01.md (G1).',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(test|exec)$/][arguments.0.type='MemberExpression'][arguments.0.property.name='message']",
          message:
            "Don't match a regex against an error MESSAGE to recover structure " +
            '(ADR-0002 brittleness hazard). Use a structured Error subclass ' +
            'with fields. See docs/notes/rca-discipline-lapses-2026-06-01.md (G1).',
        },
      ],
    },
  },

  // ── Producer-ownership guard for the card-tree slot (custom local rule) ──
  // rationale: the per-board card-tree slot has three producers (runPipeline,
  // seedFromQueue/review, loadBrowse*/navigator) and one mid-session clearer
  // (the browse policy's null-selection clearBrowse). The clearer reset() the
  // slot blind, wiping a forest a different producer owned — the
  // forest-vanishes-on-tab-away/back bug (review AND pipeline-preview). The fix
  // tags the slot with `source` and clears only what it owns; the prior fix
  // gated on a per-writer flag (isReviewActive), which covered one producer and
  // missed the next — the exact failure a per-writer guard invites. This rule
  // keeps a clearer from going blind again: a function in useCardTreeData.ts
  // that empties the slot (reset() or `.forest = []`) must reference `source`
  // or call a repopulator (populateSlotFromMatched). Best-effort + syntactic,
  // same posture as the error-message guard above (the per-function-body /
  // by-name gaps are named in the rule file, not papered over). It would have
  // caught the shipped bug's literal shape — verified by reintroducing the
  // blind clear and observing it fire. Scoped to the one slot that has this
  // shape today; the rule is configurable, so a second owned multi-writer slot
  // adds another block. See frontend/docs/notes/board-scope.md.
  {
    files: ['src/composables/cards/useCardTreeData.ts'],
    plugins: { local: { rules: { 'clear-needs-ownership': clearNeedsOwnership } } },
    rules: {
      'local/clear-needs-ownership': [
        'error',
        {
          emptier: 'reset',
          emptyField: 'forest',
          ownershipField: 'source',
          repopulators: ['populateSlotFromMatched'],
        },
      ],
    },
  },
];
