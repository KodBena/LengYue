/**
 * eslint-rules/board-mutation-entry-point.js
 *
 * Custom ESLint rule (local rule #7). The grading-integrity coverage net
 * for board-mutation entry points (work-status item
 * `app-vue-extraction-residue`, leg 1; the residue named by PR #412's
 * out-of-frame hack-rationalization gate — FINDINGS BEYOND VERDICT 1).
 *
 * The grading gate (`useBoardMoveRouting`) routes a user's click / paste-PV
 * through the review session's N-move discipline and per-move grading so
 * free play cannot bypass the SR loop. But that gate is reached only because
 * the two user-move entry points call it: nothing structural stops a NEW
 * board-mutation entry point from calling `updateBoardState` directly and
 * silently bypassing the gate. `isReviewTransientState` quantifies over the
 * review STATE class; entry-point coverage was an ENUMERATION of call sites
 * (the pre-extraction `useReviewSession` docstring admitted exactly this:
 * "a new entry point ... needs to add a call"). An enumeration fails open at
 * the next instance — the failure shape ADR-0011 Rule 4 names.
 *
 * This rule converts that enumeration into a deny-by-default net: every
 * `updateBoardState(...)` call site must live either in the gate composable
 * or in a file on the named allowlist of non-user-move mutators (each row
 * carrying a one-line reason it is not a user-move entry point). A new
 * caller file is reported until the author CONSCIOUSLY classifies it — route
 * the user move through the gate, or add the file to the allowlist with a
 * reason and accept review of that classification. The conscious step is the
 * point: silent growth of the bypass surface is what the net prevents.
 *
 * The allowlist is {fileSuffix -> reason}; the gate file is `gateFiles`. Both
 * are matched by `filename.endsWith(suffix)` (frontend-root-relative
 * `/`-paths), the `hand-rolled-path-walk` producer-allowlist idiom. The
 * store's own definition of `updateBoardState` is the `definitionFile`
 * (it declares the primitive; it does not "call" it as an entry point).
 *
 * Best-effort + syntactic (the local-rule posture; gaps named per ADR-0002,
 * not papered over):
 *   - the callee is matched by NAME (`updateBoardState`) — an aliased import
 *     (`import { updateBoardState as u }` then `u(...)`) or a call through an
 *     intermediate variable escapes; no such shape exists in src today, and
 *     the import is the same module everywhere, so the name is the call
 *     shape every entry point actually uses;
 *   - a NEW board mutator that bypasses `updateBoardState` entirely (a direct
 *     `store.boards[i] = ...`) is NOT this rule's concern — that shape is the
 *     `store-write-needs-owner` lint's (store.boards subtree -> owner files),
 *     which already denies direct `store.boards` writes outside the store
 *     module. The two nets compose: store-write-needs-owner guards the raw
 *     slot write; this rule guards the `updateBoardState` indirection. Both
 *     deny-by-default, so a new mutator must surface through one or the other;
 *   - the allowlist is by FILE, not by function: a second `updateBoardState`
 *     call added to an already-allowlisted file is admitted. That is the
 *     intended grain — a file classified as "the engine responder" or "the
 *     match cursor" is a non-user-move mutator wholesale; per-call-site
 *     classification would be ceremony. A genuinely new user-move entry point
 *     lands in a NEW file (a new composable), which the net catches.
 *
 * License: Public Domain (The Unlicense)
 */

/** @type {import('eslint').Rule.RuleModule} */
export const boardMutationEntryPoint = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every updateBoardState(...) call site must be the grading gate or a named non-user-move mutator (deny-by-default coverage net for the grading-integrity gate).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // The grading gate composable(s): the routed user-move path.
          gateFiles: { type: 'array', items: { type: 'string' } },
          // The store module that DEFINES updateBoardState (declaration, not
          // an entry-point call). Exempt so the export site doesn't self-report.
          definitionFile: { type: 'string' },
          // { fileSuffix: reason } — non-user-move mutators sanctioned to
          // call updateBoardState directly, each with a one-line reason it
          // is not a user-move entry point.
          allowlist: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      ungatedEntryPoint:
        'Unclassified board-mutation entry point: `updateBoardState(...)` is ' +
        'called from a file that is neither the grading gate ' +
        '(useBoardMoveRouting) nor a named non-user-move mutator. A user-move ' +
        'entry point that writes the board directly bypasses the review ' +
        "session's N-move discipline and per-move grading (the bypass PR " +
        '#412 extracted the gate to prevent). Either route the user move ' +
        'through the gate composable, OR — if this is a non-user-move mutator ' +
        '(engine reply, match cursor, SGF load, the graded path itself) — add ' +
        "this file to the rule's `allowlist` in eslint.config.js with a " +
        'one-line reason. The conscious classification is the point: see the ' +
        'eslint.config.js header and work-status item app-vue-extraction-residue.',
    },
  },
  create(context) {
    const opt = context.options[0] || {};
    const gateFiles = opt.gateFiles || [];
    const definitionFile = opt.definitionFile || '';
    const allowlist = opt.allowlist || {};
    const filename = context.filename.replace(/\\/g, '/');

    function endsWithAny(suffixes) {
      return suffixes.some(
        (s) => filename === s || filename.endsWith(`/${s}`) || filename.endsWith(s),
      );
    }

    // This file is sanctioned (no report) if it is the gate, the definition
    // module, or an allowlisted non-user-move mutator. Resolved once per file.
    const sanctioned =
      endsWithAny(gateFiles) ||
      (definitionFile && endsWithAny([definitionFile])) ||
      endsWithAny(Object.keys(allowlist));

    if (sanctioned) return {};

    return {
      "CallExpression[callee.type='Identifier'][callee.name='updateBoardState']"(node) {
        context.report({ node, messageId: 'ungatedEntryPoint' });
      },
    };
  },
};
