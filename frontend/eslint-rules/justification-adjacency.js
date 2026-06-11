/**
 * eslint-rules/justification-adjacency.js
 *
 * Custom ESLint rule (local rule #5). Mechanizes the cast-justification
 * PROSE discipline — frontend/CLAUDE.md's "a type assertion (`as`) needs a
 * justification in a comment or it doesn't ship" — into a build/CI gate
 * (stage 2 of work-status item cast-hygiene-lint; stage 1 is the
 * any-assertion ban in eslint.config.js). The 2026-06-10 history-lessons
 * audit (L1) measured the review-only prose rule holding at ~50% conformance
 * in a 32-of-224 `.ts` sample — exactly the memory-bound decay ADR-0011
 * Rule 2 says converts to mechanism, not more prose. Stage 1 banned the
 * `as any` corner; this rule covers the rest of the coercion-cast
 * population: every `x as T` / `<T>x` must carry an adjacent justification.
 *
 * The invariant: a coercion cast — a `TSAsExpression` (`x as T`) or a
 * `TSTypeAssertion` (`<T>x`) — must have an ADJACENT JUSTIFICATION, defined
 * precisely as ONE of:
 *   - a SAME-LINE trailing comment on the cast's line (`x as Foo; // why`);
 *   - a comment on one of the `linesBefore` lines immediately preceding the
 *     cast's first line (default 1 — the line directly above), with no
 *     blank line between the comment and the cast (a comment separated by a
 *     blank line is a section header, not a justification — the same
 *     adjacency the prose rule means by "in a comment [on the cast]");
 *   - an `eslint-disable-line` / `eslint-disable-next-line` directive
 *     adjacent to the cast carrying a `-- reason` clause (the established
 *     vue/no-v-html escape-hatch model — a disable WITHOUT a reason is a
 *     bare suppression and does NOT qualify).
 * A comment that is purely a directive with no reason text, or that sits
 * non-adjacent, does not justify.
 *
 * EXCLUSIONS (not coercion casts, so out of scope):
 *   - `as const` — a const assertion narrows literal types; it coerces
 *     nothing and erases no checking. Recognized as a `TSAsExpression`
 *     whose typeAnnotation is a `TSTypeReference` named `const`.
 *   - the INNER hop of a double cast (`x as unknown as T`) — the outer
 *     `TSAsExpression` is reported once for the whole double-hop expression
 *     (the `as unknown as` brand-strip shape the stage-2 ratchet targets),
 *     so the inner `as unknown` is skipped to avoid a duplicate report on
 *     one source construct. (The ES-module `import { x as y }` form is an
 *     ImportSpecifier, not an assertion node — it never reaches this rule.)
 *
 * Best-effort + syntactic (the clear-needs-ownership posture; gaps named
 * per ADR-0002, not papered over):
 *   - adjacency is LINE-based, not semantic: a justifying comment that
 *     genuinely explains the cast but sits two lines up (past `linesBefore`)
 *     reads as un-adjacent and trips the rule — the fix is to move the
 *     comment adjacent, which is the discipline's intent (the justification
 *     should sit AT the cast);
 *   - the rule does NOT judge the justification's QUALITY — any non-empty
 *     reason text adjacent to the cast passes. Policing that a justification
 *     is SOUND (names the scope of unsafety, the band character on a
 *     boundary) is review-shaped, the ADR-0011 Rule-5 calibration: a gate
 *     here would be miscalibrated, so quality stays review-only;
 *   - template-expression casts in `.vue` <template> ARE covered: a plain
 *     rule visitor sees script casts only (measured 2026-06-11), but the
 *     templateBody assertion nodes are reachable cheaply via
 *     defineTemplateBodyVisitor (the store-write-needs-owner precedent), so
 *     the rule walks both. The adjacency scan is parameterised on the token
 *     store: script casts scan `sourceCode`, template casts scan
 *     `getTemplateBodyTokenStore()`. The justification carrier for a
 *     template cast is an INLINE BLOCK COMMENT after the cast
 *     (`(e.target as HTMLInputElement /* DOM target *\/)`); an HTML
 *     `<!-- -->` comment is markup, not a JS token, so it does NOT justify
 *     (named gap — the template escape hatch is the inline block comment).
 *
 * License: Public Domain (The Unlicense)
 */

/** Is this `TSAsExpression` an `as const` const-assertion (not a coercion)? */
function isAsConst(node) {
  const ann = node.typeAnnotation;
  return (
    ann &&
    ann.type === 'TSTypeReference' &&
    ann.typeName &&
    ann.typeName.type === 'Identifier' &&
    ann.typeName.name === 'const'
  );
}

/** Is this assertion the INNER hop of a double cast (`x as unknown as T`)?
 *  The outer assertion wraps this one as its `expression`. */
function isInnerOfDoubleCast(node) {
  const p = node.parent;
  return (
    p &&
    (p.type === 'TSAsExpression' || p.type === 'TSTypeAssertion') &&
    p.expression === node
  );
}

/** Does a comment carry justification CONTENT (not a bare directive)? A
 *  comment is justification when it has prose text beyond an eslint
 *  directive keyword, OR is an eslint-disable directive that carries a
 *  `-- reason` clause. */
function commentJustifies(comment) {
  const text = comment.value.trim();
  if (text.length === 0) return false;
  const disableMatch = /^\s*eslint-disable(?:-next)?-line\b/.test(text);
  if (disableMatch) {
    // The escape-hatch form qualifies ONLY with a `-- reason` clause.
    return /--\s*\S/.test(text);
  }
  // A plain comment with any non-whitespace prose is a justification; the
  // QUALITY judgment is review-only (named gap above).
  return true;
}

/** @type {import('eslint').Rule.RuleModule} */
export const justificationAdjacency = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A type assertion (`x as T` / `<T>x`, excluding `as const`) must carry an adjacent justification comment — the cast-justification prose discipline, mechanized.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // How many lines immediately above the cast may hold the
          // justifying comment (default 1 — the line directly above).
          linesBefore: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingJustification:
        'This type assertion (`as`) has no adjacent justification. Per ' +
        'frontend/CLAUDE.md ("an `as` needs a justification or it doesn\'t ' +
        'ship") a coercion cast erases checking at a seam and must say WHY: ' +
        'a same-line trailing comment, or a comment on the line directly ' +
        'above, naming the scope of unsafety — and, on an ADR-0003 band ' +
        'boundary, the band character ("Band 3 loader minting a Band 2 ' +
        'branded id"; sgf-loader.ts is the worked form). If the cast is ' +
        'deletable via sound typing, delete it instead. See ' +
        'eslint.config.js header (cast-hygiene stage 2).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const opt = context.options[0] || {};
    const linesBefore = typeof opt.linesBefore === 'number' ? opt.linesBefore : 1;

    // A cast in a `.vue` <template> directive expression lives in the
    // vue-eslint-parser templateBody, whose tokens (including the inline
    // block comments that justify a template cast) sit in a SEPARATE store —
    // `getTemplateBodyTokenStore()` — not the script `sourceCode`. So the
    // adjacency scan is parameterised on a token-store accessor: the script
    // visitor uses `sourceCode`, the template visitor uses the template
    // store. Both expose getTokenBefore/getTokenAfter with includeComments.
    function makeCheck(store) {
      return function check(node) {
        if (node.type === 'TSAsExpression' && isAsConst(node)) return;
        if (isInnerOfDoubleCast(node)) return;

        const castStartLine = node.loc.start.line;
        // The `as`/assertion sits after the operand, so the operative line
        // is the one the WHOLE assertion expression occupies: its end line
        // anchors the same-line check (`x as Foo // why`), its start line
        // the preceding-line window (a comment above the operand justifies).
        const castEndLine = node.loc.end.line;

        // Same-line trailing comment / inline block comment after the cast.
        const sameLineToken = (() => {
          let tok = store.getTokenAfter(node, { includeComments: true });
          while (tok && tok.loc.start.line === castEndLine) {
            if (
              (tok.type === 'Line' || tok.type === 'Block') &&
              commentJustifies(tok)
            ) {
              return true;
            }
            tok = store.getTokenAfter(tok, { includeComments: true });
          }
          return false;
        })();
        if (sameLineToken) return;

        // Preceding-line window: a comment whose end line is within
        // `linesBefore` of the cast's start line, no blank line between, AND
        // a TRUE leading comment — not a SAME-LINE trailing comment of a
        // preceding token. The same-line-trailing exclusion is the
        // gate-prop-needs-default precedent: `const a = x as Foo; // why`
        // followed by `const b = y as Bar;` must NOT let line 1's trailing
        // comment justify line 2's cast. A candidate is a true leading
        // comment when the token immediately before it ends on an EARLIER
        // line than the comment starts (the comment is alone on its line).
        function isLeadingComment(c) {
          const prevToken = store.getTokenBefore(c, { includeComments: false });
          return !prevToken || prevToken.loc.end.line !== c.loc.start.line;
        }
        const precedingToken = (() => {
          let tok = store.getTokenBefore(node, { includeComments: true });
          // Skip back over tokens on the cast's own first line.
          while (tok && tok.loc.end.line >= castStartLine) {
            tok = store.getTokenBefore(tok, { includeComments: true });
          }
          // `tok` is now the first token strictly above the cast's start.
          while (tok && (tok.type === 'Line' || tok.type === 'Block')) {
            const gap = castStartLine - tok.loc.end.line;
            if (gap > linesBefore) break;
            if (gap >= 1 && commentJustifies(tok) && isLeadingComment(tok)) return true;
            tok = store.getTokenBefore(tok, { includeComments: true });
          }
          return false;
        })();
        if (precedingToken) return;

        context.report({ node, messageId: 'missingJustification' });
      };
    }

    const scriptCheck = makeCheck(sourceCode);
    const scriptVisitor = {
      TSAsExpression: scriptCheck,
      TSTypeAssertion: scriptCheck,
    };

    // Template-expression casts (`{{ (foo as Bar).x }}`, `(e.target as T)` in
    // a directive) live in the vue-eslint-parser templateBody AST, NOT the
    // script AST a plain visitor walks (measured 2026-06-11: a plain visitor
    // sees script casts only). They are reachable cheaply via
    // defineTemplateBodyVisitor (the store-write-needs-owner precedent); the
    // adjacency scan uses the template body token store so an inline
    // `/* reason */` block comment after the cast justifies it (the
    // template-cast escape hatch — an HTML `<!-- -->` comment is markup, not
    // a JS token, so it does NOT justify; use the inline block comment). For
    // a plain `.ts` file (tsParser) the services are absent and the script
    // visitor alone applies.
    const services = sourceCode.parserServices;
    if (
      !services ||
      typeof services.defineTemplateBodyVisitor !== 'function' ||
      typeof services.getTemplateBodyTokenStore !== 'function'
    ) {
      return scriptVisitor;
    }
    const templateStore = services.getTemplateBodyTokenStore();
    const templateCheck = makeCheck(templateStore);
    return services.defineTemplateBodyVisitor(
      {
        TSAsExpression: templateCheck,
        TSTypeAssertion: templateCheck,
      },
      scriptVisitor,
    );
  },
};
