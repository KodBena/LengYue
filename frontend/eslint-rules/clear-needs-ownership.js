/**
 * eslint-rules/clear-needs-ownership.js
 *
 * Custom ESLint rule (the frontend SPA's first local rule). Guards the
 * producer-ownership invariant on an owned reactive slot: a slot written by
 * several producers and emptied by a clearer that fires WHILE the slot must
 * still be on screen must clear only what it owns. The motivating failure is
 * the card-tree slot's forest vanishing on tab-away/back (both
 * card-metadata-during-review AND pipeline-preview): `clearBrowse` called the
 * unconditional emptier `reset()` on every `ForestDirectory` remount,
 * regardless of which producer (pipeline / review / browse) owned the slot.
 * The fix tags the slot with `source` and gates the clear on it — and a
 * per-writer flag (`isReviewActive`) is exactly the band-aid that fixed one
 * producer and missed another. This rule keeps the gate from being removed and
 * catches a NEW blind clearer.
 *
 * The invariant, per function: if a function EMPTIES the slot — calls the
 * configured `emptier` (`reset`) or assigns `<x>.<emptyField> = []` — it must
 * EITHER reference the `ownershipField` (`source`) somewhere in its body
 * (gate-on-ownership) OR call one of the `repopulators` (a producer that
 * resets-then-refills). Otherwise it is a blind clear and is reported.
 *
 * Best-effort + syntactic (the same posture as the no-error-message-reparse
 * guard in eslint.config.js): it reasons per function body and by name, so it
 * does NOT catch an empty routed through a nested callback or a `source` read
 * that is coincidental rather than the gate. Those gaps are named here per
 * ADR-0002, not papered over; the rule's value is catching the literal
 * reintroduction of the shipped bug's shape (reset-without-ownership), which it
 * does — verified by reintroducing the blind clear and observing it fire.
 *
 * License: Public Domain (The Unlicense)
 */

/** @type {import('eslint').Rule.RuleModule} */
export const clearNeedsOwnership = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A function that empties an ownership-tagged slot must gate the clear on the ownership field or be a producer that repopulates.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          emptier: { type: 'string' },
          emptyField: { type: 'string' },
          ownershipField: { type: 'string' },
          repopulators: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      blindClear:
        'This function empties the slot without consulting its `{{ownershipField}}` ownership tag. ' +
        'An ownership-blind clear wipes content a different producer owns — the forest-vanishes-on-' +
        'tab-away/back bug (review AND pipeline-preview). Gate the clear on `{{ownershipField}}` ' +
        '(clear only what you own), or — if this is a producer — repopulate the slot. A per-writer ' +
        'flag is the band-aid that fixes one producer and misses the next. See ' +
        'frontend/docs/notes/board-scope.md.',
    },
  },
  create(context) {
    const opt = context.options[0] || {};
    const emptier = opt.emptier || 'reset';
    const emptyField = opt.emptyField || 'forest';
    const ownershipField = opt.ownershipField || 'source';
    const repopulators = new Set(opt.repopulators || []);

    /** @type {{node:any, emptyAt:any, gates:boolean, repops:boolean}[]} */
    const stack = [];
    const top = () => stack[stack.length - 1];
    const enter = (node) => stack.push({ node, emptyAt: null, gates: false, repops: false });
    const leave = () => {
      const f = stack.pop();
      if (f && f.emptyAt && !f.gates && !f.repops) {
        context.report({ node: f.emptyAt, messageId: 'blindClear', data: { ownershipField } });
      }
    };

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      'FunctionDeclaration:exit': leave,
      'FunctionExpression:exit': leave,
      'ArrowFunctionExpression:exit': leave,

      CallExpression(node) {
        const f = top();
        if (!f) return;
        if (node.callee.type === 'Identifier') {
          if (node.callee.name === emptier) f.emptyAt = f.emptyAt || node;
          if (repopulators.has(node.callee.name)) f.repops = true;
        }
      },

      AssignmentExpression(node) {
        const f = top();
        if (!f) return;
        const left = node.left;
        if (
          left.type === 'MemberExpression' &&
          !left.computed &&
          left.property.type === 'Identifier' &&
          left.property.name === emptyField &&
          node.right.type === 'ArrayExpression' &&
          node.right.elements.length === 0
        ) {
          f.emptyAt = f.emptyAt || node;
        }
      },

      MemberExpression(node) {
        const f = top();
        if (!f) return;
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === ownershipField) {
          f.gates = true;
        }
      },
    };
  },
};
