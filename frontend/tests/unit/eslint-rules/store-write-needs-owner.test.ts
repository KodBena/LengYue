/**
 * tests/unit/eslint-rules/store-write-needs-owner.test.ts
 *
 * Unit test for the custom ESLint rule `store-write-needs-owner`
 * (eslint-rules/store-write-needs-owner.js). The rule is the
 * writer-enumeration net for `GlobalStore` subtrees: a write to
 * `store.<subtree>…` outside the subtree's enumerated owner files is an
 * error.
 *
 * This suite pins the rule's OWN behaviour ("a guard that cannot fail is
 * worse than none") across two classes:
 *
 *   1. The original syntactic dotted-path detection — direct
 *      `store.profile.x = …` writes, owner-file exemption, template-toggle
 *      exemption, the computed-segment walk.
 *   2. The scope-analysis legs added by work-status item
 *      `profile-owner-scope-analysis-net` (PR #410 gate, triage row 3) —
 *      the four-shape escape probe the gate specified, each verified to go
 *      RED now and to PASS inside an owner file:
 *        (a) renamed import of the machinery callee
 *            (`import { updateRegistry as ur }; ur(store.profile, …)`);
 *        (b) intermediate-variable root, both for a direct write
 *            (`const p = store.profile; p.x = …`) and for a machinery arg
 *            (`const r = store.profile; updateRegistry(r, …)`);
 *        (c) depth-3 root (`updateRegistry(store.profile.settings.engine,
 *            …)`) — the member-chain walk collects the full prefix at any
 *            depth, so it fires (this was already closed by the
 *            descendant-combinator selector before subsumption; re-pinned
 *            here);
 *        (d) renamed knob callee
 *            (`import { writeKnobValue as wkv }; wkv(store, …)`).
 *
 * RuleTester drives per-virtual-filename so the owner-file suffix matching
 * is exercised exactly as in production (the rule keys on
 * `context.filename`).
 *
 * License: Public Domain (The Unlicense)
 */

import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import { storeWriteNeedsOwner } from '../../../eslint-rules/store-write-needs-owner.js';

// ESLint's RuleTester defaults to Mocha-style globals; wire it to vitest.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// A representative subset of the production config (kept in sync by
// inspection): the profile subtree carries the two aliased-machinery
// shapes the scope-analysis legs subsume.
const options = [
  {
    subtrees: [
      { path: 'boards', owners: ['src/store/index.ts'] },
      {
        path: 'engine',
        owners: ['src/store/index.ts', 'src/services/engine-connection.ts'],
      },
      {
        path: 'profile',
        owners: ['src/store/index.ts', 'src/store/profile-owner.ts'],
        aliasedWrites: [
          { callee: 'updateRegistry', rootArg: 0 },
          { callee: 'writeKnobValue', rootArg: 0, bareStoreRoot: true },
          { callee: 'writeKnob', rootArg: 0, bareStoreRoot: true },
        ],
      },
    ],
    templateToggleExemptPrefixes: ['session.ui'],
  },
];

const NON_OWNER = 'src/composables/useSomething.ts';
const OWNER = 'src/store/profile-owner.ts';

const IMPORT_UR = "import { updateRegistry as ur } from '../lib/utils';\n";
const IMPORT_WKV = "import { writeKnobValue as wkv } from '../lib/knobs';\n";

ruleTester.run('store-write-needs-owner', storeWriteNeedsOwner, {
  valid: [
    // ── Original syntactic detection still holds ──
    // A direct profile write INSIDE an owner file.
    {
      code: 'store.profile.settings.locale = "sv";',
      options,
      filename: OWNER,
    },
    // The store index is an owner of every configured subtree.
    {
      code: 'store.boards = []; store.engine.status = "x"; store.profile.x = 1;',
      options,
      filename: 'src/store/index.ts',
    },
    // A non-configured subtree is untouched (session is not enumerated here).
    {
      code: 'store.session.activeBoardIndex = 2;',
      options,
      filename: NON_OWNER,
    },
    // A read (not a write) of a configured subtree never fires.
    {
      code: 'const v = store.profile.settings.locale; export const x = v;',
      options,
      filename: NON_OWNER,
    },
    // ── Aliased-machinery shapes are valid INSIDE the owner ──
    {
      code: IMPORT_UR + 'ur(store.profile, ["x"], 1);',
      options,
      filename: OWNER,
    },
    {
      code: IMPORT_WKV + 'wkv(store, reg, id, [1], ctx);',
      options,
      filename: OWNER,
    },
    // A machinery call whose root is NOT a store.<subtree> chain does
    // not fire — the updateRegistry-shape requires a profile root.
    {
      code: "import { updateRegistry } from '../lib/utils';\nupdateRegistry(store.session.ui, e.path, e.value);",
      options,
      filename: NON_OWNER,
    },
    // updateRegistry handed a fresh object (not a store root) does not fire.
    {
      code: "import { updateRegistry } from '../lib/utils';\nupdateRegistry({}, ['a'], 1);",
      options,
      filename: NON_OWNER,
    },
    // A bareStoreRoot callee handed a non-store root does not fire.
    {
      code: IMPORT_WKV + 'wkv(someOtherRoot, reg, id, [1], ctx);',
      options,
      filename: NON_OWNER,
    },
    // A same-named LOCAL function (not the imported machinery) does not
    // fire — resolveImportedName returns the local name, no aliasedWrites
    // entry matches a local `updateRegistry` that isn't an import… but to
    // be safe we confirm a wholly-unrelated callee name is inert.
    {
      code: 'unrelatedCallee(store.profile, ["x"], 1);',
      options,
      filename: NON_OWNER,
    },
    // An intermediate alias to a NON-configured subtree, direct write —
    // does not fire (session is not enumerated).
    {
      code: 'const u = store.session.ui; u.sidebarExpanded = true;',
      options,
      filename: NON_OWNER,
    },
    // NEGATIVE CONTROL (the disclosed narrowing, surfaced by the
    // out-of-frame HRA): the deleted descendant-combinator selector
    // fired on store.profile appearing as ANY argument of an
    // updateRegistry call, including a non-arg-0 READ argument. The
    // aliasedWrites check anchors at the write-target arg (0), so a
    // profile value READ passed as a non-target arg is INTENTIONALLY
    // NOT flagged — a read is not a write. This case is valid by design;
    // its presence makes the narrowing legible in the test tree (a
    // future edit that re-broadens to all args would fail here).
    {
      code: "import { updateRegistry } from '../lib/utils';\nupdateRegistry(store.session.ui, store.profile.bookmarks, 1);",
      options,
      filename: NON_OWNER,
    },
  ],
  invalid: [
    // ── Baseline: direct dotted-path write outside the owner ──
    {
      code: 'store.profile.settings.locale = "sv";',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'unownedWrite' }],
    },
    {
      code: 'store.engine.status = "connected";',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'unownedWrite' }],
    },
    // Compound assignment and delete on a configured subtree.
    {
      code: 'store.profile.counter++; delete store.profile.bookmarks["k"];',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'unownedWrite' }, { messageId: 'unownedWrite' }],
    },
    // Computed-segment write still resolves the literal prefix.
    {
      code: 'store.profile.bookmarks[id] = b;',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'unownedWrite' }],
    },

    // ── Shape (a): renamed import of the machinery callee ──
    {
      code: IMPORT_UR + 'ur(store.profile, ["settings", "locale"], "sv");',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },

    // ── Shape (b): intermediate-variable root ──
    // (b.1) direct write through an alias.
    {
      code: 'const p = store.profile; p.settings.locale = "sv";',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'unownedWrite' }],
    },
    // (b.2) alias passed to the machinery.
    {
      code: "import { updateRegistry } from '../lib/utils';\nconst r = store.profile; updateRegistry(r, ['x'], 1);",
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },

    // ── Shape (c): depth-3 root (the descendant-combinator case) ──
    {
      code: "import { updateRegistry } from '../lib/utils';\nupdateRegistry(store.profile.settings.engine, ['katago'], v);",
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },

    // ── Shape (d): renamed knob callee with the live store root ──
    {
      code: IMPORT_WKV + 'wkv(store, reg, id, [1], ctx);',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },
    // The un-renamed knob callee also fires (writeKnob variant).
    {
      code: "import { writeKnob } from '../lib/knobs';\nwriteKnob(store, 'profile.settings.x', 3);",
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },

    // ── Combined: renamed import AND intermediate root (two hops the
    //    old name-matched selectors could not see together) ──
    {
      code: IMPORT_UR + 'const r = store.profile; ur(r, ["x"], 1);',
      options,
      filename: NON_OWNER,
      errors: [{ messageId: 'aliasedWrite' }],
    },
  ],
});
