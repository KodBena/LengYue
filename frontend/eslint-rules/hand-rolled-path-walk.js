/**
 * eslint-rules/hand-rolled-path-walk.js
 *
 * Custom ESLint rule (local rule #6). Guards the branded-path invariant
 * from the 2026-06-XX branded-paths arc (PR #386): root-to-X game-tree path
 * derivations belong in the NAMED, branded producers in
 * `engine/navigator.ts` (`getPath`, `rootToCurrentPrefix`) and
 * `engine/util.ts` (`getActiveVariationPath`), which mint the
 * `RootToCurrentPath` / `RootToLeafPath` brands at a single site each. A
 * brand protects only what flows through its typed producer; a HAND-ROLLED
 * walk that re-implements the same `while (cur) { acc.push(cur); cur =
 * cur.parent }` shape under a different name produces a bare `NodeId[]` and
 * escapes the brand entirely — the "wrong name" leak the arc named (a
 * derivation that LOOKS like a path but carries no brand, so confusing a
 * root→current path with a root→leaf line silently typechecks).
 *
 * The invariant (shape predicate, not name): a `while` / `for` loop whose
 * body BOTH
 *   (a) accumulates the loop into an array — `<arr>.push(...)` or
 *       `<arr>.unshift(...)`, AND
 *   (b) reassigns its cursor down the parent chain — an assignment whose
 *       right-hand side is a `…​.parent` member access (the game-tree
 *       parent-pointer walk),
 * is a hand-rolled root-to-X path derivation. Outside the named producers it
 * is reported: route it through `getPath` (and slice if you need a prefix)
 * so the result carries the brand.
 *
 * EXEMPT — the named producers themselves (file + function name; the
 * walk-and-accumulate shape IS their job, and they mint the brand):
 *   - engine/navigator.ts: getPath, rootToCurrentPrefix
 *   - engine/util.ts: getActiveVariationPath
 * The exemption is BY SHAPE-AT-A-NAMED-SITE, not a blanket file ignore: a
 * NEW hand-rolled walk added to navigator.ts under a different function name
 * is still flagged (the producers are an allowlist of {file → fn names},
 * the deny-by-default-with-named-exemptions shape ADR-0011 Rule 4 prefers).
 *
 * Best-effort + syntactic (the clear-needs-ownership posture; gaps named
 * per ADR-0002, not papered over):
 *   - the two body conditions are detected ANYWHERE in the loop body, not
 *     proven to be the same cursor/accumulator — a loop that happens to
 *     push to one array and walk an unrelated `.parent` would false-positive
 *     (no such shape exists in src at adoption; the conjunction is specific
 *     enough that the measured population is exactly the path walks);
 *   - a `.parent` reached through an intermediate variable
 *     (`const p = node.parent; cur = p;`) is NOT detected (named gap);
 *   - a path built by RECURSION rather than a loop is not a loop node and is
 *     not examined (named gap);
 *   - non-accumulating parent walks (a count/find loop with no array push)
 *     are correctly NOT flagged — accumulation is half the conjunction.
 *
 * License: Public Domain (The Unlicense)
 */

/** Does this node, anywhere in its subtree, contain an `<arr>.push(...)` or
 *  `<arr>.unshift(...)` call? */
function hasArrayAccumulation(root) {
  let found = false;
  walk(root, (n) => {
    if (
      n.type === 'CallExpression' &&
      n.callee.type === 'MemberExpression' &&
      !n.callee.computed &&
      n.callee.property.type === 'Identifier' &&
      (n.callee.property.name === 'push' || n.callee.property.name === 'unshift')
    ) {
      found = true;
    }
  });
  return found;
}

/** Does this node, anywhere in its subtree, contain an assignment whose RHS
 *  is a `….parent` member access (the parent-chain cursor walk)? */
function hasParentChainStep(root) {
  let found = false;
  walk(root, (n) => {
    if (n.type !== 'AssignmentExpression') return;
    // Unwrap a `?? null` / `?? fallback` default, then a `ChainExpression`
    // wrapper (`nodes[cur]?.parent` parses as a ChainExpression around the
    // optional member access).
    let rhs = n.right;
    if (rhs.type === 'LogicalExpression' && rhs.operator === '??') rhs = rhs.left;
    if (rhs.type === 'ChainExpression') rhs = rhs.expression;
    if (
      rhs.type === 'MemberExpression' &&
      !rhs.computed &&
      rhs.property.type === 'Identifier' &&
      rhs.property.name === 'parent'
    ) {
      found = true;
    }
  });
  return found;
}

/** Depth-first walk invoking `visit` on every AST node in `root`'s subtree,
 *  WITHOUT descending into nested function bodies (a nested closure's own
 *  walk is a separate concern, and descending would cross-contaminate the
 *  two-condition conjunction). */
function walk(root, visit) {
  visit(root);
  for (const key of Object.keys(root)) {
    if (key === 'parent') continue;
    const value = root[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string' && !isFunctionNode(child)) {
          walk(child, visit);
        }
      }
    } else if (value && typeof value.type === 'string' && !isFunctionNode(value)) {
      walk(value, visit);
    }
  }
}

function isFunctionNode(n) {
  return (
    n.type === 'FunctionDeclaration' ||
    n.type === 'FunctionExpression' ||
    n.type === 'ArrowFunctionExpression'
  );
}

/** @type {import('eslint').Rule.RuleModule} */
export const handRolledPathWalk = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A hand-rolled root-to-X game-tree path walk (loop that accumulates an array while walking the parent chain) must route through the named branded producers in engine/navigator.ts, not be re-implemented.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // { fileSuffix: [functionName, ...] } — producers whose
          // walk-and-accumulate shape is sanctioned (they mint the brand).
          producers: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      handRolled:
        'Hand-rolled root-to-X path walk (a loop that accumulates an array ' +
        'while walking the `.parent` chain). This re-derives what ' +
        "`engine/navigator.ts`'s branded producers (`getPath` / " +
        '`rootToCurrentPrefix`) mint — but as a bare `NodeId[]`, which ' +
        'escapes the RootToCurrentPath / RootToLeafPath brand (a path that ' +
        'looks branded but is not is the wrong-name leak PR #386 closed). ' +
        'Route it through `getPath(nodes, targetId)` (slice for a prefix) so ' +
        'the result carries the brand. See engine/navigator.ts.',
    },
  },
  create(context) {
    const opt = context.options[0] || {};
    const producers = opt.producers || {};
    const filename = context.filename.replace(/\\/g, '/');

    // Resolve this file's sanctioned producer function names (if any).
    let sanctionedNames = null;
    for (const suffix of Object.keys(producers)) {
      if (filename.endsWith(suffix)) {
        sanctionedNames = new Set(producers[suffix]);
        break;
      }
    }

    /** Walk up from a loop node to find the nearest enclosing named
     *  function declaration; return its name or null. */
    function enclosingFunctionName(node) {
      let cur = node.parent;
      while (cur) {
        if (cur.type === 'FunctionDeclaration' && cur.id) return cur.id.name;
        // `export const getPath = (…) => {…}` / `const f = function…`
        if (
          (cur.type === 'ArrowFunctionExpression' ||
            cur.type === 'FunctionExpression') &&
          cur.parent &&
          cur.parent.type === 'VariableDeclarator' &&
          cur.parent.id.type === 'Identifier'
        ) {
          return cur.parent.id.name;
        }
        cur = cur.parent;
      }
      return null;
    }

    function checkLoop(node) {
      if (!node.body) return;
      if (!hasArrayAccumulation(node.body)) return;
      if (!hasParentChainStep(node.body)) return;
      // Both conditions met — a path-accumulating parent walk. Exempt only
      // if this file is a producer module AND the enclosing function is one
      // of its sanctioned producer names.
      if (sanctionedNames) {
        const fnName = enclosingFunctionName(node);
        if (fnName && sanctionedNames.has(fnName)) return;
      }
      context.report({ node, messageId: 'handRolled' });
    }

    return {
      WhileStatement: checkLoop,
      ForStatement: checkLoop,
      DoWhileStatement: checkLoop,
    };
  },
};
