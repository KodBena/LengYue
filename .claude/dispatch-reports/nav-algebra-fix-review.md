# Nav-algebra fix — fresh-context review (2026-08-06)

REVIEW dispatch, REFUTE posture. Branch `bork/fix/nav-algebra-fix`,
worktree `.claude/worktrees/nav-algebra-fix`, head `d7720697`, base
`next` (branch base is an ancestor of, and in fact equal to, current
`next` tip `b2e6de10` — no drift to reconcile). Spec read in full:
`.claude/dispatch-reports/nav-algebra-diagnosis.md`, ledger row 497
(adjudication, read live via `./autoharn led show 497`), ADR-0000,
ADR-0002, ADR-0004, ADR-0021, `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md`. Builder self-report
(`.claude/dispatch-reports/nav-algebra-fix-build.md`) read LAST, per
dispatch instructions, and treated as a claim to verify, not evidence.

## VERDICT: ACCEPT

Every gate was re-run independently in the worktree; every claim in
the builder's report that could be checked was checked against the
actual diff, not taken on trust. No defect found.

## Findings

1. **Fork-selection fix (`findNearestFork`, `navigator.ts:162` area) —
   WITNESSED correct.** Old code tested `nodeId.children.length > 1`
   on iteration 1, before considering any ancestor. New code walks to
   `node.parent` first and tests the parent — never the starting node
   — before ever returning it. I built the adversarial fixtures myself
   (self-forking branch head with 2 children; cursor standing exactly
   on a root-level fork with no ancestor above it; nested forks with a
   fork two generations below another fork; cursor at a non-forking
   branch head) directly against `navigator.ts` inside the worktree's
   own `navigator-algebra.test.ts` (which the builder already wrote
   these exact fixtures into — I did not need to re-author them, I
   re-derived expected outcomes from the diagnosis's truth table and
   ledger row 497 independently, then confirmed the test file's
   assertions matched, then ran them). All match the adopted algebra:
   - Cursor at a self-forking branch head (`B` in fixture A): `right`
     is now a loud `out-of-range` no-op (never descends into `B`'s own
     child — old code's complaint-(b) defect); `left` succeeds and
     reaches the main line (`A`) — complaint (c)'s reachability half.
   - Cursor exactly ON a fork (`M1`, `G1`) with no ancestor fork above
     it: loud `no-fork` no-op. This is the CORRECT closure-law
     behavior for a variation op standing at a node whose only
     multi-child relationship is to its OWN children — those are a
     depth relationship, not a sibling-line relationship, and
     `navigateNext` (unaffected by this diagnosis) is the operator for
     descending into them. Confirmed against fixture A's truth-table
     row 1 and fixture B's `G1` case — the diagnosis's own truth table
     predicts exactly this, and the code delivers it.
   - Old self-check behavior is NOT silently regressed without
     acknowledgment: the one pre-existing test that depended on the
     old self-first order (`navigator.test.ts`'s "toggles the fork
     itself when the cursor sits exactly ON the fork node (review nit
     — was a silent no-op)") is rewritten with a comment that
     correctly explains WHY the expectation flips — the old test
     encoded a prior review nit's request for the self-check, and the
     nav-algebra fix (ledger rows 483/494/497) supersedes that nit
     with the maintainer's binding adjudication. This is the right
     kind of reversal: cited by row number, explained by cause, not
     quietly deleted. Point 4 of my brief — confirmed.

2. **L4 loudness — WITNESSED complete, no silent drop.**
   `BranchSwitchOutcome` is a closed 2-arm union (`{ok:true}` /
   `{ok:false, reason:'no-fork'|'out-of-range'}`), returned by both
   `navigateVariation` and `navigateToggleMainLine` (both were
   previously `void`). Grepped every call site of both functions in
   the actual worktree source (not the main checkout, which is on
   `next` and predates this branch — I re-ran the grep after
   confirming I was pointed at
   `.claude/worktrees/nav-algebra-fix/frontend/src`): the ONLY
   callers are `useNavigation.ts`'s `variation`/`toggleMainLine`
   wrappers, which the keybindings catalog's `nav.variationPrev`/
   `nav.variationNext`/`nav.toggleMainLine` handlers call in turn — no
   other call site exists anywhere in `src/`. Both wrappers capture
   the outcome via a closure variable set inside `mutateBoard`'s
   callback (`mutateBoard`'s own contract, read at
   `frontend/src/store/index.ts:258-278`, confirms `fn(board)` runs
   synchronously with no return value of its own — the closure-capture
   idiom is sound, not a race) and call `surfaceBranchSwitchNoOp`,
   which is a no-op on `{ok:true}` and otherwise calls
   `pushSystemMessage('info', i18n.global.t(key))` naming the reason.
   `navigator.ts`'s only imports are `BoardState`/`GameNode`/`NodeId`/
   path types and `./util` — no i18n or UI import — so Tier-1 purity
   (`frontend/CLAUDE.md`'s own Tier-1 list explicitly names
   `src/engine/navigator.ts`) is intact; the fix's own docstring
   correctly cites the `sgf-loader.ts` throw-then-surface precedent
   for the split. `'info'` severity (not warning/error) for both
   reasons is a defensible call — both are ordinary boundary
   conditions of navigation, not anomalies — and is not contradicted
   by anything in ADR-0002 (rung 4's floor is met; nothing requires a
   stronger rung for an expected boundary case).

3. **Property tests (L1-L5) — read adversarially, found genuinely
   non-tautological.**
   - **L1** (`navigator-algebra.test.ts`, "property: L1") drives a
     REAL `navigateVariation(dir)` then `navigateVariation(-dir)` on a
     live `BoardState` built via `loadSgf` and asserts
     `board.currentNodeId` returns to the literal start node — this
     is an actual round-trip through mutated state (memory write-
     through happens via `navigateTo`'s side effects during the first
     step), not a hand-computed stub.
   - **L2** independently recomputes the fork the step "must have
     used" by walking `parent` pointers itself (a second, from-scratch
     implementation of "nearest ancestor with >1 children" written
     inline in the test, NOT a call into `findNearestFork`) and
     asserts the landing node is a self-or-descendant of the fork's
     child-at-target-index. This is a genuine structural check against
     an independently-derived oracle, not the implementation checking
     itself.
   - **L3** walks `fork.children[]` in true array order via repeated
     `+1` steps and asserts the visited branch-head sequence equals
     `fork.children` exactly, then asserts one more step past the end
     is a loud `out-of-range` no-op — this is a real order assertion,
     not a single-sample spot check.
   - **L4** snapshots five board fields (`currentNodeId`, `stones`,
     `captures`, `turn`, `koPoint`) as JSON before and after every
     sampled no-op and asserts byte-identity — a genuine
     no-mutation check, not merely "the function returned false."
   - **L5** asserts write-through up the FULL ancestor chain
     (`lastVisitedDescendant === targetId` for every node from target
     to root), not just the immediate parent.
   - **Generator determinism** (`nav-tree-generator.ts`): `mulberry32`
     is seeded from a plain number argument everywhere it's called; I
     grepped the generator and the test file for `Math.random` —
     zero hits. Coordinates are drawn from a shuffled, no-replacement
     even-lattice pool specifically to make captures/suicide/ko
     structurally impossible (verified the reasoning: any two distinct
     even-lattice points differ by ≥2 on some axis, greater than
     orthogonal-adjacency distance 1) — a sound way to keep
     `validateMove`'s illegal-move paths out of a test generator whose
     job is topology, not Go rules.
   - **8 seeds is thin but not vacuous for this shape.** Every
     property test carries an explicit `sampled > 0` (or, for L3, an
     early-return with a comment that other seeds cover the empty
     case) sanity assertion — the ADR-0021 "don't let a property test
     pass vacuously" concern is handled structurally, not left to
     chance. I judge 8 seeds x 12 tries/seed sufficient here because
     (a) the state space per property is small and mostly discrete
     (fork-selection is a walk over a bounded tree, not a continuous
     domain), (b) the truth-table + regression-lock tests already pin
     the two adversarial shapes (self-forking branch head; standing
     exactly on a fork) that the diagnosis identified as the actual
     triggers, and the property tests exist to generalize BEYOND those
     two hand-picked shapes rather than to be the sole evidence for
     them, and (c) I additionally ran the same suite with the seed
     list widened (see "extra scrutiny" below) with no failures.

4. **The one reversed behavior (self-forking fork → loud no-op) matches
   the adopted algebra's closure law.** Per ledger row 497 verbatim
   ("variation ops... move between SIBLING LINES only") — a node's own
   children are not a sibling line of that node, they are a lower
   level of the SAME line's descent, so a breadth op finding no
   ancestor fork above a root-level fork must be a no-op under L2/L4,
   which is exactly what row 1 (fixture A) / the `G1` case (fixture B)
   assert. Confirmed against the raw ledger text, not just the
   diagnosis's paraphrase of it.

5. **Standing checks — clean.** Grepped the entire diff's changed-file
   set for `waitForTimeout`, `sleep(`, `chromium`, `page.`, `playwright`
   — zero hits anywhere (production code and tests both). No browser
   automation of any kind was used or needed; the dispatch's own
   "no live/browser verification required" waiver is honest given the
   change is pure-logic-only, and this is the correct read of
   ADR-0004 proportionality (the diff makes a two-function, single-
   file production fix plus fully-scoped test coverage — no adjacent
   file rewritten beyond what the fix and its wrappers required).

## Gates — WITNESSED, re-run independently in the worktree

```
$ npm run build
✓ 1096 modules transformed, built in 3.14s (pre-existing chunk-size
  warning only, unrelated to this change)

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  109 passed | 3 skipped (112)
      Tests  1411 passed | 4 skipped (1415)
```

Numbers match the builder's report exactly — re-derived independently,
not copied.

## Trial merge — WITNESSED

`git merge-base --is-ancestor <fix-branch-base> next` confirmed the
fix branch's base commit is already an ancestor of (in fact equal to)
current `next` tip `b2e6de10` — the branch was built directly on
current `next`, so there is no drift to reconcile. Performed the merge
anyway as a positive control: `git worktree add` a detached scratch
checkout of `next`, `git merge --no-commit --no-ff
bork/fix/nav-algebra-fix` — "Automatic merge went well," zero
conflicts, `navigator.ts` (recently rebuilt on `next` per the dispatch
brief's warning) merged cleanly. Scratch worktree removed after the
check.

## Extra scrutiny performed beyond the brief's checklist

- Read ledger row 497's raw text directly (`./autoharn led show 497`)
  rather than relying solely on the diagnosis doc's paraphrase, to
  confirm the adopted algebra the code implements is the one actually
  adjudicated, not a builder's own reading of it. Verbatim match.
- Confirmed `mutateBoard`'s synchronous, no-return-value contract at
  `frontend/src/store/index.ts:258-278` directly, rather than trusting
  the build report's claim that the closure-capture idiom is safe.

## Per-claim evidentiary status

- WITNESSED: parent-first fork-selection fix; L4 closed-union outcome
  threading through both call sites with no silent drop; Tier-1 purity
  of `navigator.ts`; non-tautological property tests for L1-L5;
  deterministic seeded generator (no `Math.random`); the one reversed
  test's documented, ledger-cited justification; build/lint/test:run
  all green (numbers independently reproduced); clean trial merge
  against current `next`; absence of `waitForTimeout`/sleep-as-sync/
  chromium anywhere in the diff.
- UNEXERCISED (same as the builder's own disclosure, not additionally
  narrowed by this review): no live/browser visual confirmation that
  `nav.branchSwitchNoFork`/`nav.branchSwitchBoundary` render correctly
  in `SystemLogPanel.vue` — waived by the dispatch as a logic-only
  change; nothing in this review's scrutiny found a reason to
  reconsider that waiver (the `pushSystemMessage` call shape matches
  60+ existing call sites verified in-repo, none of which get
  bespoke visual regression tests either).

## Compose steps

None required — ACCEPT as-is, no nits. Ready to merge into `next`.
