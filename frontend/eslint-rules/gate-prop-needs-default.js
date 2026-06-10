/**
 * eslint-rules/gate-prop-needs-default.js
 *
 * Custom ESLint rule (local rule #2, after clear-needs-ownership). Guards
 * the boolean gate-prop class: Vue casts an OMITTED boolean-typed prop to
 * `false`, not `undefined`, so a boolean prop whose name says "gate"
 * (active / enabled / visible — the opt-out shape where the author means
 * "omitted ⇒ on") silently engages its suppression path for every consumer
 * that omits it. The motivating failure is BaseChart's `active` work-gate
 * (`4756c30`, whose "other consumers unaffected" claim was falsified by
 * `69810e2`): the one consumer that omitted the prop got a blank
 * intermission chart plus an `ecModel` crash. vue-tsc cannot police this
 * even in principle — omitting an optional prop is type-legal; the bug is
 * in the author's intent, which only a name can carry.
 *
 * The invariant: a boolean-typed prop whose name contains a configured
 * gate word (as a camelCase / snake_case word segment) must make its
 * omission semantics EXPLICIT — a `withDefaults` entry (type-based
 * declaration), a `default:` or `required: true` (runtime declaration),
 * or a non-optional member (vue-tsc then polices omission). An explicit
 * `default: false` satisfies the rule: it polices that the omission
 * behaviour was CHOSEN, not silently inherited from Vue's boolean cast.
 *
 * Keyed on NAME PATTERNS, never a component allowlist — an allowlist is
 * the enumerated-blocklist failure shape (fail-open for the next
 * component), per the history-lessons audit §3.12.
 *
 * Best-effort + syntactic (the clear-needs-ownership posture; gaps named
 * per ADR-0002, not papered over):
 *   - resolves `defineProps<{...}>()` inline type literals and same-file
 *     `interface` / `type`-alias references; an IMPORTED props type and
 *     intersection types are NOT resolved (skipped — named gap).
 *   - boolean detection covers `boolean` and unions containing it; a
 *     `true | false` literal union or a computed type is NOT recognised
 *     (named gap).
 *   - `defineComponent({ props: ... })` options-API shapes are NOT
 *     walked — the codebase declares props via `<script setup>`
 *     `defineProps` exclusively (named gap).
 *
 * The runtime half of this guard is the omission rendering test
 * (tests/integration/gate-prop-omission.ts): the lint polices that a
 * default is DECLARED; the test polices that the declared default
 * actually performs the gated work on omission.
 *
 * License: Public Domain (The Unlicense)
 */

/** @type {import('eslint').Rule.RuleModule} */
export const gatePropNeedsDefault = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A boolean prop whose name marks it as a gate (active/enabled/visible) must declare explicit omission semantics — Vue casts an omitted boolean prop to false.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          gateWords: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingDefault:
        "Boolean gate-prop '{{name}}' has no explicit default: Vue casts an omitted " +
        'boolean prop to `false` (not `undefined`), so every consumer that omits it gets ' +
        "the suppressed path — the BaseChart `active` blank-chart bug. Declare the omission " +
        'semantics: `withDefaults(..., { {{name}}: true })` for an opt-out gate, an explicit ' +
        '`{{name}}: false` if omission really means off, or make the prop required. ' +
        'See eslint.config.js header + docs/worklog/2026-06-08-basechart-active-prop-default.md.',
    },
  },
  create(context) {
    const gateWords = new Set(
      (context.options[0]?.gateWords ?? ['active', 'enabled', 'visible']).map((w) =>
        w.toLowerCase(),
      ),
    );

    /** Does this prop name contain a gate word as a camelCase/snake_case segment? */
    function isGateName(name) {
      return name
        .split(/[^a-zA-Z0-9]+/)
        .flatMap((part) => part.split(/(?=[A-Z])/))
        .some((seg) => gateWords.has(seg.toLowerCase()));
    }

    /** `boolean`, or a union containing it. */
    function typeIncludesBoolean(t) {
      if (!t) return false;
      if (t.type === 'TSBooleanKeyword') return true;
      if (t.type === 'TSUnionType') return t.types.some(typeIncludesBoolean);
      return false;
    }

    function propName(key) {
      if (key.type === 'Identifier') return key.name;
      if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
      return null;
    }

    /**
     * Members of the defineProps type argument: an inline TSTypeLiteral, or
     * a same-file interface / type-alias reference. Imported / intersection
     * types return null (named gap in the header).
     */
    function resolveTypeMembers(typeNode) {
      if (typeNode.type === 'TSTypeLiteral') return typeNode.members;
      if (typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier') {
        const name = typeNode.typeName.name;
        for (const stmt of context.sourceCode.ast.body) {
          const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
          if (!decl) continue;
          if (decl.type === 'TSInterfaceDeclaration' && decl.id.name === name) {
            return decl.body.body;
          }
          if (
            decl.type === 'TSTypeAliasDeclaration' &&
            decl.id.name === name &&
            decl.typeAnnotation.type === 'TSTypeLiteral'
          ) {
            return decl.typeAnnotation.members;
          }
        }
      }
      return null;
    }

    /** Is `Boolean` (or an array containing it) the runtime type value? */
    function runtimeTypeIsBoolean(v) {
      if (v.type === 'Identifier' && v.name === 'Boolean') return true;
      if (v.type === 'ArrayExpression') {
        return v.elements.some((e) => e && e.type === 'Identifier' && e.name === 'Boolean');
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'defineProps') return;

        // withDefaults(defineProps<...>(), { ... }) — collect default keys.
        const defaultsKeys = new Set();
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'CallExpression' &&
          parent.callee.type === 'Identifier' &&
          parent.callee.name === 'withDefaults' &&
          parent.arguments[0] === node &&
          parent.arguments[1] &&
          parent.arguments[1].type === 'ObjectExpression'
        ) {
          for (const p of parent.arguments[1].properties) {
            if (p.type === 'Property') {
              const n = propName(p.key);
              if (n) defaultsKeys.add(n);
            }
          }
        }

        // Type-based declaration: defineProps<{ active?: boolean, ... }>().
        const typeArgs = node.typeArguments ?? node.typeParameters;
        if (typeArgs && typeArgs.params.length === 1) {
          const members = resolveTypeMembers(typeArgs.params[0]);
          if (!members) return; // imported/unresolvable type — named gap.
          for (const m of members) {
            if (m.type !== 'TSPropertySignature' || !m.typeAnnotation) continue;
            const name = propName(m.key);
            if (!name || !isGateName(name)) continue;
            if (!typeIncludesBoolean(m.typeAnnotation.typeAnnotation)) continue;
            if (!m.optional) continue; // required ⇒ vue-tsc polices omission.
            if (defaultsKeys.has(name)) continue; // explicit default chosen.
            context.report({ node: m, messageId: 'missingDefault', data: { name } });
          }
          return;
        }

        // Runtime declaration: defineProps({ active: Boolean | {...} }).
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression') return;
        for (const p of arg.properties) {
          if (p.type !== 'Property') continue;
          const name = propName(p.key);
          if (!name || !isGateName(name)) continue;
          const v = p.value;
          let isBool = runtimeTypeIsBoolean(v);
          let hasDefault = false;
          let isRequired = false;
          if (v.type === 'ObjectExpression') {
            for (const q of v.properties) {
              if (q.type !== 'Property') continue;
              const qn = propName(q.key);
              if (qn === 'type') isBool = runtimeTypeIsBoolean(q.value);
              if (qn === 'default') hasDefault = true;
              if (qn === 'required' && q.value.type === 'Literal' && q.value.value === true) {
                isRequired = true;
              }
            }
          }
          if (isBool && !hasDefault && !isRequired) {
            context.report({ node: p, messageId: 'missingDefault', data: { name } });
          }
        }
      },
    };
  },
};
