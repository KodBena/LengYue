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
 * ── Scope analysis (2026-06-11; work-status item
 *    `profile-owner-scope-analysis-net`) ──
 *
 * The original rule matched the write root by the literal identifier
 * NAME `store`, so two alias shapes escaped and were left to review:
 * (a) an intermediate-variable root (`const p = store.profile; p.x =
 * …`), and (b) the SUBTREE's majority writers, which were aliased
 * through generic machinery — `updateRegistry` handed a `store.profile`
 * root, and the knob substrate (`writeKnobValue`/`writeKnob`) handed
 * the live `store` root. Shape (b) was fenced by a pair of
 * `no-restricted-syntax` selectors in `eslint.config.js`
 * (`PROFILE_ALIASED_WRITE_SELECTORS`), but those selectors matched the
 * callee and root by NAME, so a renamed import (`import {
 * updateRegistry as ur }`) or an intermediate root variable still
 * escaped — the "fenced, not owned" residue PR #410's out-of-frame
 * gate named (work-status item `profile-owner-scope-analysis-net`,
 * filed at the Wave-3 closure, triage row 3).
 *
 * This rule now does real scope/variable resolution (ESLint's
 * `sourceCode.getScope` + `Scope.references` / `Variable.defs`) so
 * those aliases are SEEN rather than name-matched:
 *
 *   - **Intermediate-variable roots** (`resolveStoreRoot`): when a
 *     write target's — or a machinery argument's — root is a plain
 *     identifier bound to a `store.<...>` member chain by a `const`/
 *     `let` initializer in scope, the binding is followed one hop and
 *     the write is attributed to the resolved subtree. `const p =
 *     store.profile; p.x = 1` is a `store.profile` write. (One hop, the
 *     measured alias shape; a chain of re-aliases or a reassigned
 *     binding is the named gap below.)
 *   - **Renamed imports** (`resolveImportedName`): a callee identifier
 *     is resolved to its binding; if that binding is an
 *     `ImportSpecifier`, the ORIGINAL exported name (`imported.name`)
 *     is what the `aliasedWrites` callee list matches, so `import {
 *     updateRegistry as ur }; ur(store.profile, …)` and `import {
 *     writeKnobValue as wkv }; wkv(store, …)` both fire.
 *
 * The two `PROFILE_ALIASED_WRITE_SELECTORS` are replaced by the
 * `aliasedWrites` config below and deleted from `eslint.config.js`.
 * The scope-resolving leg covers their write-target cases AND closes
 * the renamed-import / intermediate-variable gaps they admitted
 * (probe-verified against the literal pre-change shapes). The
 * descendant-combinator depth handling the selectors carried (a
 * `store.profile.settings.engine` depth-3 root at the write-target
 * position) is covered: the member-chain walk in `storePathOf`
 * collects the full literal prefix at any depth, so a deeper root
 * `startsWith`-matches its subtree regardless of depth.
 *
 * NOT a strict superset — one deliberate, disclosed NARROWING. The
 * deleted `updateRegistry` selector was a descendant-combinator that
 * fired on `store.profile` at ANY argument position (including a
 * non-arg-0 READ argument); the `aliasedWrites` check anchors at the
 * write-target arg (arg 0). The dropped case is a profile value READ
 * passed to `updateRegistry` — not a write, so out of this rule's
 * scope, and an over-approximation the old selector's own rationale
 * named as a cost. The narrowing is loud (named here and in the
 * deferral ledger of the worklog), not silent — see the
 * `aliasedWrites` gap bullet below.
 *
 * Best-effort + syntactic-with-one-hop-scope (gaps named per ADR-0002,
 * not papered over):
 *   - the root is matched by the in-scope binding of `store` (an
 *     unimported local `store` that is NOT the GlobalStore would
 *     false-positive — no such shadow exists in src today); an aliased
 *     IMPORT of the store under a different name is followed only
 *     through the one-hop variable resolution, not through a renamed
 *     `import { store as s }` (the store is imported under its own
 *     name everywhere in src — named gap, not closed);
 *   - intermediate-variable resolution is ONE hop: `const a =
 *     store.profile; const b = a; b.x = …` (re-alias) escapes, as does
 *     a binding that is reassigned after init (`Variable.defs` with a
 *     single `VariableDeclarator` init is the resolved shape);
 *   - method-call mutations are NOT writes to the rule
 *     (`store.boards.push(…)`, `store.engine.messages.unshift(…)`) —
 *     enumerating mutating methods soundly is not syntactically
 *     possible (the `aliasedWrites` leg covers the SPECIFIC machinery
 *     callees the subtree's majority writers used, by config; it is
 *     not a general method-mutation net);
 *   - destructuring assignment targets are not walked;
 *   - an `aliasedWrites` callee whose root argument is a fresh
 *     expression (`updateRegistry({...}, …)`) or an unresolvable
 *     identifier does not fire — the root must resolve to a
 *     `store.<subtree>` chain (or, for `bareStoreRoot` callees, to the
 *     store root itself);
 *   - the `aliasedWrites` check anchors at the configured `rootArg`
 *     (the WRITE-TARGET position — arg 0 for both machinery shapes).
 *     **This is deliberately NARROWER than the descendant-combinator
 *     `no-restricted-syntax` selector it subsumed**, which fired on
 *     `store.profile` appearing as ANY argument at ANY depth of an
 *     `updateRegistry` call — including a non-arg-0 READ argument
 *     (`updateRegistry(store.session.ui, store.profile.x, v)`, where
 *     `store.profile.x` is read, not written). That READ-argument
 *     firing was an over-approximation the prior selector's own
 *     rationale named as a COST (a legitimate profile read passed to
 *     `updateRegistry` had to take an inline disable). Anchoring at the
 *     write-target arg drops it on purpose: a read is not a write, so
 *     it is not this rule's business — but the narrowing is named here
 *     loudly rather than presented as behaviour-preserving. The cost of
 *     the narrowing: a future `updateRegistry` overload that WROTE
 *     through a non-arg-0 root would escape; no such shape exists (the
 *     write target is always arg 0), and adding such an overload would
 *     be the trigger to add a second `aliasedWrites` entry for it.
 *
 * The rule's value is the same as its siblings': it catches the
 * literal shapes the audit measured — direct dotted-path assignment,
 * and the aliased-machinery dispatch shapes — which is how every one
 * of the baseline's stray writes was authored, now with the
 * one-hop-alias and renamed-import escapes closed.
 *
 * License: Public Domain (The Unlicense)
 */

/** @type {import('eslint').Rule.RuleModule} */
export const storeWriteNeedsOwner = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Writes to configured GlobalStore subtrees (store.<subtree>…) are restricted to the subtree\'s enumerated owner files — including intermediate-variable roots and aliased generic-machinery dispatch (real scope resolution).',
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
                // Aliased generic-machinery write shapes for this
                // subtree (subsuming the former
                // PROFILE_ALIASED_WRITE_SELECTORS). Each entry names a
                // callee (the ORIGINAL exported name — a renamed import
                // resolves to it) and the index of the argument whose
                // resolved root is checked against this subtree. When
                // `bareStoreRoot` is set, the root argument is matched
                // to the live store ROOT (the bare `store`) rather than
                // a `store.<subtree>` chain — the knob substrate's
                // shape, whose KnobDecl output paths land on this
                // subtree's leaves.
                aliasedWrites: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      callee: { type: 'string' },
                      rootArg: { type: 'number' },
                      bareStoreRoot: { type: 'boolean' },
                    },
                    required: ['callee', 'rootArg'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['path', 'owners'],
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
      aliasedWrite:
        'Aliased write to `store.{{path}}` via `{{callee}}` outside its owner file(s) ({{owners}}): ' +
        'the {{callee}} call is handed a `store.{{path}}` root (resolved through scope/renamed-import), ' +
        'so the writer-enumeration lint cannot see the leaf it lands on. Route it through the ' +
        'subtree\'s owner module (the named mutator for static writes, the dynamic-path / knob-substrate ' +
        'seam for these machinery shapes), or keep it behind an annotated inline eslint-disable (the ' +
        'vue/no-v-html model). See eslint.config.js header.',
    },
  },
  create(context) {
    const opt = context.options[0] || {};
    const subtrees = (opt.subtrees || []).map((s) => ({
      segments: s.path.split('.'),
      path: s.path,
      owners: s.owners || [],
      aliasedWrites: s.aliasedWrites || [],
    }));
    const templateExempt = (opt.templateToggleExemptPrefixes || []).map((p) => p.split('.'));

    const sourceCode = context.sourceCode;

    /**
     * `sourceCode.getScope` resolves cleanly for nodes in the main
     * (script) AST. Template-AST nodes (vue-eslint-parser) are not in
     * the script scope manager, so getScope on them is unreliable;
     * fall back to the module/global scope, which still carries the
     * `<script setup>` top-level bindings (imports, top-level consts)
     * that the template references. Defensive per ADR-0002 — a thrown
     * scope lookup must not crash the lint.
     */
    function scopeFor(scopeNode) {
      try {
        return sourceCode.getScope(scopeNode);
      } catch {
        return null;
      }
    }

    /** Find the variable named `name` visible from `scope`, walking up. */
    function lookupVariable(name, scope) {
      for (let s = scope; s; s = s.upper) {
        const v = s.set.get(name);
        if (v) return v;
      }
      return null;
    }

    /**
     * The module/global scope, where `<script setup>` top-level
     * bindings (imports, top-level consts) live. Used as the fallback
     * for template-AST nodes, whose own getScope is unreliable.
     */
    function moduleScope() {
      const prog = sourceCode.ast;
      let scope = scopeFor(prog);
      // Descend to the module scope if getScope handed back global.
      if (scope && scope.type === 'global' && scope.childScopes.length) {
        const mod = scope.childScopes.find((c) => c.type === 'module');
        if (mod) return mod;
      }
      return scope;
    }

    /**
     * Resolve the scope to look a binding up in. For a script node
     * getScope works; for a template node (or any node getScope can't
     * place) fall back to the module scope so script-setup imports and
     * top-level consts still resolve.
     */
    function resolveScope(scopeNode) {
      const direct = scopeFor(scopeNode);
      if (direct) return direct;
      return moduleScope();
    }

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

    /**
     * Resolve the variable a plain identifier `node` is bound to, and
     * return the single `VariableDeclarator` whose `init` is its only
     * definition (the one-hop alias shape `const p = store.profile`).
     * Returns null for params, imports, multiply-defined, reassigned,
     * or init-less bindings — anything but a clean single-init local.
     */
    function singleInitDeclarator(node, scopeNode) {
      if (!node || node.type !== 'Identifier') return null;
      const variable = lookupVariable(node.name, resolveScope(scopeNode));
      if (!variable) return null;
      if (variable.defs.length !== 1) return null;
      const def = variable.defs[0];
      if (def.type !== 'Variable') return null;
      const declr = def.node;
      if (!declr || declr.type !== 'VariableDeclarator' || !declr.init) return null;
      // Reassigned after init? Any write reference beyond the init makes
      // the resolved root unsound — bail (named gap: re-aliased / mutated
      // bindings escape).
      const writeRefs = variable.references.filter((r) => r.isWrite());
      if (writeRefs.length > 1) return null;
      return declr;
    }

    /**
     * Resolve the leading `store.<...>` literal segments a node denotes,
     * following at most one variable-binding hop. Returns:
     *   - the segment array (possibly empty for the bare `store` root),
     *     when the node is (or one-hop-resolves to) a chain rooted at
     *     the in-scope `store`;
     *   - null otherwise.
     * Handles the bare `store` identifier (segments `[]`) so the
     * `bareStoreRoot` machinery shape resolves.
     */
    function resolveStoreRoot(node, scopeNode) {
      if (!node) return null;
      if (node.type === 'Identifier') {
        if (node.name === 'store') return [];
        // One-hop alias: `const p = store.profile; … p …`.
        const declr = singleInitDeclarator(node, scopeNode);
        if (declr) {
          // Resolve the initializer (a chain, or the bare store, or
          // itself a one-hop alias — but we cap at one hop, so the
          // init must resolve WITHOUT another variable hop).
          return storeRootDirect(declr.init);
        }
        return null;
      }
      return storeRootDirect(node);
    }

    /**
     * Direct (no variable hop) resolution: the bare `store` identifier
     * → []; a `store.<...>` member chain → its literal segments; else
     * null. (Used both for top-level direct writes and for the
     * one-hop alias's initializer.)
     */
    function storeRootDirect(node) {
      if (!node) return null;
      if (node.type === 'Identifier') return node.name === 'store' ? [] : null;
      if (node.type === 'MemberExpression') return storePathOf(node);
      return null;
    }

    function startsWith(segments, prefix) {
      return prefix.length <= segments.length && prefix.every((p, i) => p === segments[i]);
    }

    /** Report a write whose target chain is `target`, if it hits a
     *  configured subtree, isn't owner-filed, and isn't an exempt
     *  template toggle. Resolves an intermediate-variable root one hop. */
    function checkWrite(reportNode, target, inTemplate, scopeNode) {
      if (!target) return;
      // Direct member-chain write, OR a one-hop alias root (`p.x` where
      // `const p = store.profile`). For a plain-identifier target
      // (`p = …` reassigning the alias itself) there is no leaf write to
      // the subtree, so only MemberExpression targets are writes.
      if (target.type !== 'MemberExpression') return;
      let segments = storePathOf(target);
      if (!segments) {
        // Try one-hop alias resolution on the target's root object.
        segments = resolveAliasedMemberWrite(target, scopeNode);
      }
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

    /**
     * For a member-expression write target whose root is NOT the literal
     * `store` chain, resolve its base object one variable hop. `p.x = …`
     * with `const p = store.profile` → ['profile', 'x']. Returns the
     * full segment list (resolved root prefix + the literal member
     * segments between the alias and the assignment) or null.
     */
    function resolveAliasedMemberWrite(target, scopeNode) {
      // Collect the literal member segments from the assignment target
      // down to its base object, mirroring storePathOf but rooted at an
      // arbitrary identifier.
      const trailing = [];
      let cur = target;
      while (cur && cur.type === 'MemberExpression') {
        if (cur.computed) {
          trailing.length = 0;
        } else if (cur.property.type === 'Identifier') {
          trailing.unshift(cur.property.name);
        } else {
          return null;
        }
        cur = cur.object;
      }
      if (!cur || cur.type !== 'Identifier' || cur.name === 'store') return null;
      const rootSegs = resolveStoreRoot(cur, scopeNode);
      if (!rootSegs) return null;
      return [...rootSegs, ...trailing];
    }

    /**
     * Resolve a callee identifier to the ORIGINAL exported name it
     * binds to (so a renamed import `import { updateRegistry as ur }`
     * matches the configured `updateRegistry`). For a non-import
     * binding (or no binding), the identifier's own name is returned.
     */
    function resolveImportedName(calleeNode, scopeNode) {
      if (!calleeNode || calleeNode.type !== 'Identifier') return null;
      const variable = lookupVariable(calleeNode.name, resolveScope(scopeNode));
      if (!variable) return calleeNode.name;
      const def = variable.defs.find((d) => d.type === 'ImportBinding');
      if (def && def.node && def.node.type === 'ImportSpecifier' && def.node.imported) {
        // `imported` is an Identifier (named import) — its `.name` is
        // the original export, regardless of the local alias.
        return def.node.imported.name;
      }
      return calleeNode.name;
    }

    /**
     * A call to one of the configured `aliasedWrites` callees whose
     * designated root argument resolves to a `store.<subtree>` chain
     * (or the bare store root, for `bareStoreRoot` shapes) is an
     * aliased subtree write — report it on the call.
     */
    function checkCall(node, scopeNode) {
      if (node.callee.type !== 'Identifier') return;
      const originalName = resolveImportedName(node.callee, scopeNode);
      for (const sub of subtrees) {
        for (const aw of sub.aliasedWrites) {
          if (aw.callee !== originalName) continue;
          const arg = node.arguments[aw.rootArg];
          if (!arg) continue;
          const rootSegs = resolveStoreRoot(arg, scopeNode);
          if (!rootSegs) continue;
          if (aw.bareStoreRoot) {
            // The knob substrate is handed the live store ROOT; its
            // KnobDecl output paths land MOSTLY on this subtree's leaves
            // (some land on session.ui — the substrate dispatches over a
            // mixed registry, so any non-owner store-rooted knob call is
            // flagged wholesale; a session.ui knob reported under the
            // profile subtree is harmless over-attribution, matching the
            // deleted selector's behavior). Fire when the resolved root
            // IS the store root (segments []).
            if (rootSegs.length !== 0) continue;
          } else {
            // updateRegistry-shape: the root argument is itself a
            // store.<subtree> chain; fire when it lands in this subtree.
            if (!startsWith(rootSegs, sub.segments)) continue;
          }
          if (isOwnerFile(sub.owners)) return;
          context.report({
            node,
            messageId: 'aliasedWrite',
            data: {
              path: sub.path,
              callee: aw.callee,
              owners: sub.owners.join(', ') || '(none configured)',
            },
          });
          return;
        }
      }
    }

    function visitorFor(inTemplate) {
      return {
        AssignmentExpression(node) {
          checkWrite(node, node.left, inTemplate, node);
        },
        UpdateExpression(node) {
          checkWrite(node, node.argument, inTemplate, node);
        },
        UnaryExpression(node) {
          if (node.operator === 'delete') checkWrite(node, node.argument, inTemplate, node);
        },
        CallExpression(node) {
          checkCall(node, node);
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
          if (expr) checkWrite(node.parent, expr, true, node);
        },
      },
      scriptVisitor,
    );
  },
};
