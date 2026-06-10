/**
 * eslint-rules/module-intent-in-script-setup.js
 *
 * Custom ESLint rule (local rule #3). Guards the module-intent-state class:
 * `<script setup>` compiles into the component's `setup()` function, so
 * every top-level declaration there is PER-INSTANCE — but a declaration can
 * carry a comment that CLAIMS module intent ("loaded once", "shared across
 * instances"), and the claim is then false in a way nothing surfaces. The
 * motivating failure is MiniBoardCanvas's wood texture / stone-sprite cache
 * (`463a15e`): declared in `<script setup>` under a "loaded once, shared
 * across every instance" comment, each remount-per-hover consumer reloaded
 * the texture and first-painted textureless, while the persistently-mounted
 * consumer masked the bug. The shipped fix — a plain `<script>` block whose
 * banner says module scope is load-bearing — is the worked example this
 * rule mechanises (frontend/src/components/board/MiniBoardCanvas.vue).
 *
 * The invariant: a top-level variable declaration inside `<script setup>`
 * must not claim module intent. Triggers (both configurable):
 *   - a leading (or same-line trailing) comment matching a claim pattern —
 *     "loaded once", "shared across … instances/mounts/consumers/
 *     components", "all/every … instance(s)", "once per session/app",
 *     "module-scope(d) singleton/shared/state/cache/resource";
 *   - an identifier matching a shared-name pattern (default `^shared[A-Z_]`
 *     — a variable literally named `sharedX` declared per-instance is the
 *     same contradiction without the comment).
 *
 * Deliberately NOT a trigger: top-level `let` / `Map` / `Set` as such.
 * Per-instance non-reactive state is a sanctioned idiom (the
 * imperative-escape cached-dims pattern — `cssW`/`cssH` in MiniBoardCanvas's
 * own `<script setup>` are the worked example); the footgun is the CLAIM,
 * not the shape. The fix on report is one of two honest moves: relocate the
 * declaration to a plain `<script>` block (module scope made real), or
 * reword the comment so it stops claiming sharing.
 *
 * Best-effort + syntactic (the clear-needs-ownership posture; gaps named
 * per ADR-0002, not papered over):
 *   - intent that is never written down is undetectable — a shared-purpose
 *     declaration with no comment and no name signal passes (named gap;
 *     the authoring convention in frontend/CLAUDE.md is the policy half).
 *   - the claim patterns are curated regexes over comment prose; a claim
 *     phrased outside them passes (named gap — extend the pattern list
 *     when a new phrasing is paid for).
 *   - only TOP-LEVEL VariableDeclarations are examined; a claim attached
 *     to state nested in a callback is not (named gap).
 *
 * License: Public Domain (The Unlicense)
 */

const DEFAULT_CLAIM_PATTERNS = [
  'loaded\\s+once',
  'once\\s+(per|for\\s+the\\s+whole)\\s+(session|app|application|page)',
  'shared\\s+(across|between|by)\\b[^.]{0,60}\\b(instances?|mounts?|consumers?|components?)',
  '\\b(all|every)\\s+(\\w+\\s+)?instances?\\b',
  'module-?\\s?scoped?\\s+(singleton|shared|state|cache|resources?)',
];

const DEFAULT_SHARED_NAME_PATTERNS = ['^shared[A-Z_]'];

/** @type {import('eslint').Rule.RuleModule} */
export const moduleIntentInScriptSetup = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A top-level declaration in <script setup> must not claim module intent (shared/loaded-once) — <script setup> state is per-instance.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          claimPatterns: { type: 'array', items: { type: 'string' } },
          sharedNamePatterns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      perInstanceReality:
        '`<script setup>` compiles into setup(): this declaration is PER-INSTANCE, but ' +
        '{{evidence}} claims module intent. Each mounted instance gets its own copy — the ' +
        'MiniBoardCanvas texture-flash class (a remount-per-hover consumer re-creates the ' +
        '"shared" resource on every mount; a persistently-mounted consumer masks it). Either ' +
        'move the declaration into a plain <script> block (module scope made real — ' +
        'MiniBoardCanvas.vue is the worked example), or, if per-instance is what you mean, ' +
        'reword so the claim is gone. See eslint.config.js header + ' +
        'docs/worklog/2026-06-09-mini-board-texture-scope-fix.md.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    // vue-eslint-parser only — a non-SFC file has no <script setup> block.
    if (!parserServices || typeof parserServices.getDocumentFragment !== 'function') {
      return {};
    }
    const fragment = parserServices.getDocumentFragment();
    if (!fragment) return {};
    const scriptSetup = fragment.children.find(
      (el) =>
        el.type === 'VElement' &&
        el.name === 'script' &&
        el.startTag.attributes.some((a) => !a.directive && a.key.name === 'setup'),
    );
    if (!scriptSetup) return {};
    const [setupStart, setupEnd] = scriptSetup.range;

    const options = context.options[0] ?? {};
    const claimPatterns = (options.claimPatterns ?? DEFAULT_CLAIM_PATTERNS).map(
      (s) => new RegExp(s, 'i'),
    );
    const sharedNamePatterns = (options.sharedNamePatterns ?? DEFAULT_SHARED_NAME_PATTERNS).map(
      (s) => new RegExp(s),
    );

    return {
      VariableDeclaration(node) {
        if (node.parent.type !== 'Program') return;
        // Only declarations inside the <script setup> block — a plain
        // <script> block IS module scope and is the sanctioned home.
        if (node.range[0] < setupStart || node.range[1] > setupEnd) return;

        // Trigger 1 — claim comment: leading, or trailing on the same line.
        // A leading comment that starts on the same line a previous token
        // ends is the PREVIOUS statement's trailing comment — exclude it,
        // or a same-line claim on declaration N also flags declaration N+1.
        const leading = sourceCode.getCommentsBefore(node).filter((c) => {
          const prevToken = sourceCode.getTokenBefore(c, { includeComments: false });
          return !prevToken || prevToken.loc.end.line !== c.loc.start.line;
        });
        const comments = [
          ...leading,
          ...sourceCode
            .getCommentsAfter(node)
            .filter((c) => c.loc.start.line === node.loc.end.line),
        ];
        const claim = comments.find((c) => claimPatterns.some((re) => re.test(c.value)));

        // Trigger 2 — shared-name identifier.
        const sharedName = node.declarations
          .map((d) => (d.id.type === 'Identifier' ? d.id.name : null))
          .find((n) => n && sharedNamePatterns.some((re) => re.test(n)));

        if (!claim && !sharedName) return;
        const evidence = claim
          ? `its comment ("${claim.value.trim().slice(0, 60)}…")`
          : `its name (\`${sharedName}\`)`;
        context.report({ node, messageId: 'perInstanceReality', data: { evidence } });
      },
    };
  },
};
