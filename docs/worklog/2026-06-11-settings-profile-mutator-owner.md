# Worklog — store.profile gets a real owner: mutator module, exemption burn-down, aliased-machinery net (2026-06-11)

> Audit trail for work-status item `settings-profile-mutator-owner`,
> the follow-on PR #382's out-of-frame audit filed when it found
> `store.profile` "fenced, not owned" — ten annotated direct-write
> lint exemptions guarding the minority shape while the majority
> writers were aliased through generic machinery the
> `local/store-write-needs-owner` lint cannot see. Branch
> `bork/refactor/settings-profile-mutator-owner`, PR #410.

## The owner (ADR-0011 Rule 4: quantify over the class)

New module `frontend/src/store/profile-owner.ts`. The profile's
writers arrive in three shapes, and each shape gets one verb that
takes the write as data rather than enumerating leaves:

- **`mutateProfile(fn)`** — the named mutator for statically-known
  writes, joining the `mutateBoard` / `mutateReviewSession` family.
  Covers every in-place form (leaf assignment, keyed-record
  insert/delete, array push/splice), fully typed against
  `ProfileState` so a typo'd path is a compile error rather than a
  silently-created stray leaf.
- **`updateProfileAt(path, value)`** — the dynamic path-based seam
  for the Settings registry editors, carrying `updateRegistry`'s
  silent-create / any-value contract verbatim (that calibration is
  deliberate and editor-load-bearing; `lib/utils.ts` carries the
  calibration note).
- **`writeStoreKnobValue(knobId, vector, ctx)`** — the single
  store-root supplier for the knob substrate. `lib/knobs.ts` stays a
  pure root-parameterised Band-1 library; only the owner hands it
  the live store. Two seeded decls target `session.ui.*` leaves, so
  this verb is honestly a GlobalStore-root knob writer — documented
  in the module header and pinned by a dedicated test.

No version counter is minted: every verb mutates the same deep
reactive object graph the direct writes did, so SyncService's deep
`store.profile` watch observes identically (the integration tests
assert this with SyncService's exact watcher shape).

## Writer reroute (re-derived at HEAD, not trusted from the item)

The commissioning item's enumeration was treated as a grep-grade
lead and re-derived against HEAD by inspecting every
`store.profile`-touching file. Rerouted:

- **The 10 annotated lint exemptions** — AnalysisControls.vue's five
  template v-models (now owner-routed `WritableComputed`s: getter
  reads the store per ADR-0010 read-locality, setter routes the
  identical leaf assignment through `mutateProfile`; `.number`
  coercion runs before the setter, unchanged), useLocale's
  `setLocale`, useQeubo's parameter-apply fallback and bookmark
  lazy-init, scenarioContext's DEV-only snapshot/restore pair.
- **The aliased writers the lint never saw** — SettingsTab.vue's two
  `updateRegistry` handlers (`handleSettingsUpdate` /
  `handleProfileUpdate`; the settings-rooted form prefixes
  `'settings'` and keeps an explicit empty-path no-op guard so the
  prior `updateRegistry(store.profile.settings, [], …)` no-op edge
  is preserved exactly), useDirtyBoardGuard's remembered-preference
  write (now a typed `mutateProfile` leaf write), useQeubo's
  knob-decl inserts (`ensureKnobDecl`), the whole
  `reconcileQeuboKnobs` body (one `mutateProfile` wrapping both
  passes — the draft is the live reactive profile, so the body is
  byte-for-byte the prior semantics), `applyBookmark`'s
  params-write + whole-record-reseat-equivalent delete sweep (one
  mutate, original interleaving order preserved), `renameBookmark` /
  `deleteBookmark` / `pinCurrent`'s method-call mutations, and
  KnobSlider's `writeKnobValue(store, …)` drag write.
- **keybindings-capture.ts's three binding mutators** (`setBinding`
  / `resetBinding` / `resetAllBindings`) — an aliased
  `store.profile.settings.keybindings` writer family the
  commissioning item's enumeration did NOT name, found by the
  at-HEAD re-derivation. Rerouted with the rest.

`store/index.ts`'s wholesale replacement writes (`resetWorkspace`'s
clone-reset, `updateFromRemote`'s hydration deepMerge) stay where
they are — it is the subtree's other enumerated owner file.

## Mechanization (ADR-0011 Rules 1–4)

- `local/store-write-needs-owner`: the profile entry's owners list
  gains the owner module; the 10 inline exemptions are removed
  (10 → 0). The config's rationale comment carries a dated census
  appendix; the 2026-06-10 baseline stands as the historical record.
- New `PROFILE_ALIASED_WRITE_SELECTORS` (`no-restricted-syntax`,
  script + template blocks — the single-block constraint the config
  header documents means they join the existing selector arrays):
  `updateRegistry` handed a `store.profile` / `store.profile.<x>`
  root, and `writeKnobValue` / `writeKnob` handed the live `store`
  root, are errors outside the owner. **Measured at adoption**
  (scratch config over `src/`, before the reroute): 6 call sites —
  SettingsTab ×2, useDirtyBoardGuard ×1, KnobSlider ×1, useQeubo ×2;
  the session-rooted `updateRegistry(store.session.ui, …)` correctly
  did not fire. All 6 rerouted; the owner's two sanctioned
  root-supplier sites carry annotated inline disables (the
  vue/no-v-html model) ⇒ adopted at `error` on a fully-triaged
  baseline. **Probe-verified** by reintroducing the literal
  pre-change shapes (an `updateRegistry(store.profile.settings, …)`
  call, a `writeKnobValue(store, …)` call, and a direct dotted
  profile write): all three nets fired; probes reverted. Named gaps
  per ADR-0002, recorded at the selector constant: name-matched
  callees/roots (renamed imports and intermediate variables escape),
  root-depth-bounded matching (deeper-than-`store.profile.<x>` roots
  escape), session-rooted calls deliberately admitted.

## Tests

`tests/integration/profile-owner.test.ts` (8 cases) +
`tests/integration/profile-owner-vmodel-harness.vue` (a compiled-SFC
harness mirroring AnalysisControls' owner-routed wiring shape, so
the test drives Vue's real v-model code paths including `.number`).
Each commissioned write class — a v-model write, a registry-editor
write, a knob write — is asserted on value round-trip and on
persistence observability via a watcher with **SyncService
`startWatcher()`'s exact shape** (same source tuple, `deep: true`,
default flush). Extra pins: the silent-create contract through the
owner seam (a fresh `parameter_meta` path), the session.ui-targeting
spillover knob, the reverse v-model leg (external owner write
reflects into the bound widget), and the live
`buildPersistencePayload` object identity.

Preserved-semantics evidence beyond the new file: the 73
pre-existing tests over the rerouted paths (keybindings-capture unit
suite, qEUBO apply-bookmark and knob-reconcile integration suites,
useUserIORegistry) were authored against the old code and pass
against the new code unmodified.

## Verification

`npm run build` green (vue-tsc + vite); `npx eslint .` exit 0 (new
selectors + shrunk exemption list at `error`); `npm run test:run`
925 passed / 4 skipped (917 pre-existing + 8 new). Scratch census
config deleted before commit; all probe edits reverted.

**Tooling incident, recorded honestly:** the probe-verification
cleanup (`git checkout -- <three files>`) restored the probed files
to HEAD, wiping the *uncommitted* reroutes along with the probes —
the same scratch-revert hazard class as PR #382's stash desync. The
follow-up lint run was red on the regressed shapes, the three files'
reroutes were re-applied, and the full battery re-ran green before
commit. Lesson applied in-session: the implementation was committed
before any further scratch operations.

## Deviations from the item description

1. The item's aliased-writer enumeration (">=5 sites") undercounted:
   the at-HEAD re-derivation found the keybindings-capture binding
   mutators (×3) in addition to every named site. Rerouted in the
   same change rather than deferred — they are the literal shape the
   item targets.
2. The item's "useQeubo.ts:186 and lib/knobs.ts knob-registry
   writes" line numbers had drifted at HEAD (the file gained the
   reconcile sweep since); treated as grep-grade leads per the
   commission and re-resolved.

## Deferral ledger (ADR-0005 Rule 10)

- Aliased profile writes through intermediate variables / renamed
  imports remain review-only — not-filed: pre-existing named gap of
  the store-write-needs-owner family, already recorded in the rule
  file and in ADR-0001's Revisit-#3 terms; this change narrows the
  population to zero known instances but the syntactic limit is
  unchanged, and no new evidence warrants a new item.
- The selector net's root-depth bound (depth-1/depth-2 only) —
  not-filed: extend-on-occurrence is recorded at the selector
  constant; esquery cannot express the recursive root walk, and no
  depth-3 call shape exists at HEAD.
- AnalysisControls' five real computeds are exercised by vue-tsc +
  lint, not behaviorally (the harness mirrors their shape) —
  not-filed: component-level tests are out of scope per
  tests/CLAUDE.md tier 3; the drift risk is five identical six-line
  computeds whose divergence the build catches type-wise.
- If `store.session` ever joins the lint's enumerated subtrees, the
  owner module must join that entry's owners list (the knob seam's
  documented session.ui spillover) — not-filed: contingent on a
  future enumeration decision; recorded in the owner header and the
  HRA findings so the next enumerator expects it.

## Documentation audit

- **Work-status store:** read-only this session per the commission;
  closure is the coordinator's call on merge.
- **ADR-0001:** fourth dated amendment + a follow-on note under the
  Revisit-#3 response (trigger still not fired; terms unchanged).
  `docs/adr-synopsis.md`'s ADR-0001 entry co-changed.
- **FILES.md:** row added for `store/profile-owner.ts` ([B3] via the
  ProfileState/store coupling; the verbs themselves domain-agnostic).
- **IDENTIFIERS.md:** no edit — no brand minted or moved.
- **FEATURES.md:** no edit — behavior-preserving refactor; no
  user-facing capability changes.
- **handoff-current.md:** read end to end; no orientation surface it
  carries is affected.
- **Dispatch ledger:** no open dispatch addressed to the frontend
  bears on this item (directory listing checked).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change; committed
  json+md.

## Appendix — hack-rationalization-detector run (verbatim, per ADR-0005 Rule 11)

### Commission

> Review the changes on branch bork/refactor/settings-profile-mutator-owner
> in /home/bork/w/omega/.claude/worktrees/wf_d4be5d46-2e8-1 (commit
> 9b6c1ac0 vs its parent 8cdf9f8d, plus uncommitted doc edits). The
> change claims to give store.profile a real owner (work-status item
> settings-profile-mutator-owner): (1) an owner module
> src/store/profile-owner.ts with three verbs (mutateProfile /
> updateProfileAt / writeStoreKnobValue); (2) all writers rerouted —
> the 10 annotated lint exemptions plus aliased writers (SettingsTab
> updateRegistry x2, useDirtyBoardGuard, useQeubo
> knob-decl/parameters/bookmarks, KnobSlider, keybindings-capture x3);
> (3) profile exemptions 10 -> 0 and the owner joined to the lint's
> owners list; (4) new no-restricted-syntax selectors guarding the two
> generic-machinery aliased-write shapes. Pay particular attention to:
> whether mutateProfile is a real owner or a hollow pass-through that
> just renames direct writes; whether the writer enumeration is
> complete at HEAD (run the deterministic scripts); whether the
> selectors are vacuous or gameable; whether any preserved-semantics
> claim (updateRegistry silent-create contract, v-model .number
> coercion, deep-watch observability, bookmark
> whole-record-reseat-equivalent delete sweep, qEUBO claim policy)
> actually holds; and whether the test assertions could pass against
> the old code.

### Report (the full artifact; the verdict label does not travel without it)

```
## Hack-rationalization review: settings-profile-mutator-owner (in-frame run)

FRAME CHECK: DEFICIENT — run by the implementing session (this worker is the
diff's author), in the fallback mode: the implementer's justification treated
as the object of suspicion, anchored on the two deterministic scripts
(grep_tells, enumerate_writers), which cannot be reasoned around. The
commission already names the binding gate: the coordinator runs an
out-of-frame pass before merge; this in-frame run does not discharge it.
Surfaced in the worklog and the PR body, not absorbed.

GENERAL FIX:   every write to `store.profile` — direct, path-walked, or
knob-substrate-dispatched — routes through one owner module, with mechanical
nets over both the dotted-write shape (the existing writer-enumeration lint)
and the generic-machinery aliased shapes (selectors on
updateRegistry-over-profile-root and writeKnobValue/writeKnob-with-store-root).
PATCH SHIPPED: exactly that, plus the burn-down: owner module
src/store/profile-owner.ts (mutateProfile / updateProfileAt /
writeStoreKnobValue); 10 annotated lint exemptions -> 0; owner joined to the
lint's profile owners list; PROFILE_ALIASED_WRITE_SELECTORS adopted at error
on a measured 6-site baseline, all 6 rerouted; keybindings-capture's three
binding mutators — an aliased writer family the commissioning item's
enumeration did NOT name — found by the at-HEAD re-derivation and rerouted;
8 new integration tests pinning round-trip + SyncService-shape deep-watch
observability for all three commissioned write classes.
DOWNGRADE:     none claimed as minimality. Two named non-mechanized residues,
each with its concrete reason: (a) aliased writes through intermediate
variables (`const s = store.profile; s.x = …`) and renamed imports stay
review-only — esquery cannot resolve aliases or imports (a tool limit, not a
scope mood; same named gap as the sibling rules); (b) the selector's root
matching is depth-bounded at store.profile.<x> — esquery cannot quantify over
arbitrary member-chain depth; deeper roots escape (named in the constant's
rationale).
WRITER DELTA:  claimed = enumerated, on the final tree —
  direct dotted writes to store.profile outside owner files: 0 (lint at
    error over the whole tree; probe-verified to fire on reintroduction);
  updateRegistry callers: 2 — SettingsTab's session.ui handler (deliberately
    admitted; store.session is not an enumerated subtree) + the owner's
    sanctioned site;
  writeKnobValue/writeKnob callers with the store root: 1 — the owner's
    sanctioned site (probe-verified to fire on reintroduction elsewhere);
  owner-verb call sites: 25 across 9 files (AnalysisControls x5 computeds,
    SettingsTab x2, KnobSlider x1, useDirtyBoardGuard x1, useLocale x1,
    scenarioContext x2, keybindings-capture x3, useQeubo x10) + store/index's
    reset/hydrate (the other enumerated owner file);
  enumerate_writers script residue checked by hand: useAppBootstrap:409 is a
    comment describing a previously-removed write (the live write targets
    store.knownTags, a non-profile field); MintCardModal:87 is a local-ref
    write reading profile. No missed producer found.
RUNTIME:       refactor with behavior-preservation claims; verified at the
test level, not in a browser. Two distinct pins: (1) the 73 pre-existing
tests over the rerouted paths (keybindings-capture unit suite, qEUBO
apply-bookmark + knob-reconcile integration suites, useUserIORegistry) were
authored against the OLD code and pass against the NEW code unmodified —
genuine preserved-semantics evidence, not new-tests-test-new-code circularity;
(2) the 8 new tests pin the observability contract (SyncService's exact watch
shape fires for every owner verb) and the updateRegistry silent-create
contract through the owner seam. No browser-level drive of the Settings tab /
sliders was performed (the new tests cannot run against the old code at all —
the module doesn't exist there — so their red-evidence value is trivial; the
old suites carry that burden instead).

TELLS (Step 1): 2 co-occurrences, both adjudicated benign on inspection —
  [1] eslint.config.js header: 'deferral' near 'owner' — the pre-existing
      no-explicit-any deferral sentence sits adjacent to the NEW selector
      bullet; the deferral is the cast-hygiene arc's, not this change's.
  [2] profile-owner.test.ts: 'optional' near 'owner' — "parameter_meta is
      optional and starts absent" is a type-shape fact motivating the
      silent-create test, not a narrowing.
  No named-better-fix-then-downgraded sentence found in the commit message,
  module headers, or config rationale.

VERDICT: general
WHY: the shipped invariant quantifies over the writer class on three axes
(typed in-place writes, dynamic path writes, knob-substrate dispatch) and is
backed by mechanical nets on both shapes the lint family can express; the
six aliased machinery call sites measured at baseline all route through the
owner, and the writer set the change claims matches the independently
enumerated one, including a writer family the commissioning item had not
named. What the verdict cannot certify is the residue in the findings below.

FINDINGS BEYOND VERDICT (required):
  - mutateProfile enforces no invariant in its body — it is a routing point
    (`fn(store.profile)`), not a validator. The enforcement value lives
    entirely in the lint + selectors + greppability; if a future writer
    bypasses the module through an intermediate-variable alias, nothing
    mechanical fires. This is the same posture as the boards/engine owners
    (ADR-0001's named residue), now explicit for profile.
  - The selector net is gameable by construction (named in its rationale):
    a renamed import (`import { updateRegistry as ur }`), an intermediate
    root variable, or a root deeper than store.profile.<x> all escape.
    The depth bound is an enumeration (depth-1 + depth-2) that fails open
    at depth-3 — esquery cannot express the recursive root walk. If a
    depth-3 call shape ever appears legitimately, extend the selector list
    or the store-write-needs-owner rule itself (which could subsume the
    machinery check with real AST walking).
  - The v-model leg's behavioral test drives a compiled-SFC harness that
    MIRRORS AnalysisControls' wiring shape, not AnalysisControls itself
    (mounting it drags in useAnalysisPersistence + the ECharts dashboard).
    The component's five real computeds are exercised by vue-tsc + the
    template lint only; a divergence between harness and component wiring
    (e.g. a future edit to one of the five setters) is not behaviorally
    pinned. Bounded: the wiring is five identical six-line computeds.
  - updateProfileAt's settings-rooted form walks from store.profile rather
    than store.profile.settings; if settings were ever null/non-object the
    old code threw at member access while the owner silently creates `{}`.
    Unreachable today (settings is seeded by defaults and survives
    deepMerge hydration) — recorded so the calibration difference is
    visible rather than latent.
  - mutateProfile permits arbitrary fn bodies, including effects unrelated
    to profile writes (two qEUBO callbacks call pushSystemMessage inside
    the mutate, preserving original control flow). The owner does not — and
    cannot syntactically — constrain callbacks to write-only behavior; a
    reviewer reading owner call sites must still read the closures.
  - The knob seam writes beyond the profile subtree by design (two seeded
    decls target session.ui leaves). The owner header and a dedicated test
    pin this spillover; if store.session ever joins the lint's enumerated
    subtrees, writeStoreKnobValue's owner file must join that entry's
    owners list too, or the lint will (correctly) fire on the substrate's
    session writes — a foreseeable follow-up the next enumerator should
    expect.
```

License: Public Domain (The Unlicense).
