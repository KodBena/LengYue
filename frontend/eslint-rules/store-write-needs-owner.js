/**
 * eslint-rules/store-write-needs-owner.js
 *
 * Custom ESLint rule (local rule #4). Data-driven writer enumeration for
 * `GlobalStore` subtrees: a write to `store.<subtree>…` (assignment,
 * compound assignment, ++/--, or `delete`) is legal only in that
 * subtree's enumerated owner files. History-lessons audit §3.7 leg (iv)
 * (lesson L2: "multi-writer slots want owners, not per-writer gates");
 * work-status item `multi-writer-slots-get-owners`; recorded as an
 * ADR-0001 amendment (the Revisit-#3 response — the ADR's
 * review-time vigilance duty, mechanized).
 *
 * The invariant: each configured subtree's writer set is CLOSED and
 * visible in `eslint.config.js`. A new writer trips the rule and must
 * either route through the subtree's owner (named mutator / owner
 * module) or consciously join the enumeration — the conscious step is
 * the point. The motivating population: ~19 direct `store.engine.*`
 * assignments scattered through analysis-service (now collapsed into
 * `services/engine-connection.ts`), and the `showMoveSuggestions`
 * force-true that clobbered a persisted preference.
 *
 * ADR-0001's sanctioned template-toggle exception is carved out as
 * CONFIG (`templateToggleExemptPrefixes`), in the ADR's own words —
 * "Exception: UI state written directly from templates": *"Vue
 * templates write to `store.session.ui.*` fields directly
 * (`@click="store.session.ui.sidebarExpanded =
 * !store.session.ui.sidebarExpanded"`). This is a legitimate pattern
 * for small UI toggles; routing every such toggle through a mutator
 * would be pure ceremony."* — and, from the ADR's Not-goals: *"Not
 * banning direct mutation from Vue templates on `UISession`. Small UI
 * toggles may write directly; structural state goes through
 * mutators."* The exemption applies in TEMPLATE context only and only
 * under the configured prefixes; a script-side write to the same path,
 * or a template write to a non-exempt subtree (a `v-model` on
 * `store.profile.settings.*`, say), still needs an owner or an
 * annotated inline disable (the `vue/no-v-html` escape-hatch model).
 *
 * Best-effort + syntactic (the clear-needs-ownership posture; gaps
 * named per ADR-0002, not papered over):
 *   - the root is matched by NAME (`store`), not by import resolution
 *     — a local variable shadowing `store` would false-positive, an
 *     aliased import would escape (neither shape exists in src today);
 *   - aliased roots escape entirely (`const e = store.engine;
 *     e.status = …`, writes through `boardsById.value[id]`, a board
 *     object from `store.boards.find(…)`) — the named-mutator
 *     convention and review cover these, as before;
 *   - method-call mutations are NOT writes to the rule
 *     (`store.boards.push(…)`, `store.engine.messages.unshift(…)`) —
 *     enumerating mutating methods soundly is not syntactically
 *     possible;
 *   - destructuring assignment targets are not walked.
 * The rule's value is the same as its siblings': it catches the
 * literal shape the audit measured — direct dotted-path assignment —
 * which is how every one of the baseline's stray writes was authored.
 *
 * License: Public Domain (The Unlicense)
 */

/** @type {import('eslint').Rule.RuleModule} */
export const storeWriteNeedsOwner = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Writes to configured GlobalStore subtrees (store.<subtree>…) are restricted to the subtree\'s enumerated owner files.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          subtrees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                // Dotted path prefix under `store`, e.g. 'engine' or
                // 'session.ui'.
                path: { type: 'string' },
                // Owner files, as /-separated paths relative to the
                // frontend root, e.g. 'src/store/index.ts'.
                owners: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: false,
            },
          },
          // ADR-0001 template-toggle exception: dotted path prefixes
          // under `store` whose direct writes are sanctioned in
          // <template> expression context only (see file header).
          templateToggleExemptPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unownedWrite:
        'Direct write to `store.{{path}}` outside its owner file(s) ({{owners}}): multi-writer ' +
        'slots want owners, not scattered writes (history-lessons audit L2 / ADR-0001\'s mutator ' +
        'convention). Route the write through the subtree\'s named mutator / owner module, or — ' +
        'for a deliberate exception — keep it behind an inline eslint-disable-next-line with a ' +
        'justification naming the slice it owns (the vue/no-v-html model). Template toggles on ' +
        'the ADR-0001-sanctioned prefixes are exempt by config. See eslint.config.js header.',
    },
  },
  create(context) {
    const opt = context.options[0] || {};
    const subtrees = (opt.subtrees || []).map((s) => ({
      segments: s.path.split('.'),
      path: s.path,
      owners: s.owners || [],
    }));
    const templateExempt = (opt.templateToggleExemptPrefixes || []).map((p) => p.split('.'));

    const filename = context.filename.replace(/\\/g, '/');
    /** Is the current file one of `owners` (frontend-root-relative paths)? */
    function isOwnerFile(owners) {
      return owners.some((o) => filename === o || filename.endsWith(`/${o}`));
    }

    /**
     * If `node` is a MemberExpression chain rooted at the identifier
     * `store`, return its leading literal path segments (stopping at
     * the first computed segment); else null.
     * `store.engine.activeMode[boardId]` → ['engine', 'activeMode'].
     */
    function storePathOf(node) {
      const segments = [];
      let cur = node;
      while (cur && cur.type === 'MemberExpression') {
        if (cur.computed) {
          // Walking leaf→root: segments already collected sit BEYOND
          // this computed step (relative to an unknown key) — discard
          // them and keep collecting the literal chain between the
          // root and the computed access. `store.engine.activeMode[id]`
          // → ['engine', 'activeMode'].
          segments.length = 0;
        } else if (cur.property.type === 'Identifier') {
          segments.unshift(cur.property.name);
        } else {
          return null;
        }
        cur = cur.object;
      }
      if (!cur || cur.type !== 'Identifier' || cur.name !== 'store') return null;
      return segments;
    }

    function startsWith(segments, prefix) {
      return prefix.length <= segments.length && prefix.every((p, i) => p === segments[i]);
    }

    /** Report a write whose target chain is `target`, if it hits a
     *  configured subtree, isn't owner-filed, and isn't an exempt
     *  template toggle. */
    function checkWrite(reportNode, target, inTemplate) {
      if (!target || target.type !== 'MemberExpression') return;
      const segments = storePathOf(target);
      if (!segments) return;
      if (inTemplate && templateExempt.some((p) => startsWith(segments, p))) return;
      for (const sub of subtrees) {
        if (!startsWith(segments, sub.segments)) continue;
        if (isOwnerFile(sub.owners)) return;
        context.report({
          node: reportNode,
          messageId: 'unownedWrite',
          data: { path: sub.path, owners: sub.owners.join(', ') || '(none configured)' },
        });
        return;
      }
    }

    function visitorFor(inTemplate) {
      return {
        AssignmentExpression(node) {
          checkWrite(node, node.left, inTemplate);
        },
        UpdateExpression(node) {
          checkWrite(node, node.argument, inTemplate);
        },
        UnaryExpression(node) {
          if (node.operator === 'delete') checkWrite(node, node.argument, inTemplate);
        },
      };
    }

    const scriptVisitor = visitorFor(false);

    // Template expressions are writes too — an @click toggle or a
    // v-model both compile to assignments. vue-eslint-parser exposes
    // the template AST through defineTemplateBodyVisitor; for plain
    // .ts files (tsParser) it is absent and the script visitor alone
    // applies.
    const defineTemplateBodyVisitor =
      context.sourceCode.parserServices?.defineTemplateBodyVisitor;
    if (typeof defineTemplateBodyVisitor !== 'function') {
      return scriptVisitor;
    }
    return defineTemplateBodyVisitor(
      {
        ...visitorFor(true),
        // v-model is a write to its expression even though no
        // AssignmentExpression appears in the template AST. Reported
        // on the element's start tag (node.parent), not the attribute:
        // an HTML eslint-disable-next-line comment cannot sit inside
        // an attribute list, so the escape hatch must target the
        // element's first line.
        "VAttribute[directive=true][key.name.name='model']"(node) {
          const expr = node.value && node.value.expression;
          if (expr) checkWrite(node.parent, expr, true);
        },
      },
      scriptVisitor,
    );
  },
};
