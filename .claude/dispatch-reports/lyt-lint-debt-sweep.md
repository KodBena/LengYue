# Frontend lint-debt sweep (ledger rows 2361/2363)

License: Public Domain (The Unlicense)

## Base

Commissioned base `c5005350` (tip of `lyt-phase2`). The worktree this
commission ran in was cut from a stale ref (`3378806f`, an ancestor of
`c5005350` on the same lineage — main history before the lyt-phase2-specific
commits) — the FIRST-ACT `git merge-base --is-ancestor c5005350 HEAD` check
correctly failed. Resolved with a fast-forward merge of `origin/lyt-phase2`
into the worktree branch (no local commits existed yet, so this was a pure
catch-up, not a rebase). Re-ran the ancestor check after: passes. Final HEAD
below is `c5005350` plus this sweep's one commit.

## Live lint state at start

`npx eslint .` from `frontend/` (after `npm install`, which the worktree
needed — `eslint-plugin-vue` wasn't resolvable until then): **15 errors, 2
warnings** across 8 files (7 `src/` files + `scripts/lyt-conformance.mjs`,
which the commission's file list didn't name — confirmed via live run per
the commission's "verify yourself" instruction). Matches the commissioned
count exactly.

## Per-file fixes

All fixes are comment-only (adding an adjacent justification to an existing
cast, or a `:key`) or dead-comment removal. No runtime behavior changed in
any file — no STOP-and-report items.

### `src/components/ProxyUpstreamSettingField.vue` (1 error)

`local/justification-adjacency` at line 84: `(event.target as
HTMLSelectElement).value` inside `choosePicked` had no adjacent
justification. This is the same "handler bound on one specific element, so
`event.target` is that element" DOM-narrowing shape used throughout the
codebase (`EngineModelSelect.vue`, `KnobSlider.vue`, etc.). Added a leading
comment naming the binding site (the discovered-upstreams `<select>`'s
`change` handler).

### `src/components/charts/AnalysisDashboard.vue` (2 errors)

- `local/justification-adjacency` at line 92 (post-fix line 94):
  `setActiveTab(id as AnalysisTabId)` in `onTabModelUpdate`. `TabWidget` is a
  generic `{id,label}[]` widget operating on plain strings; every id it can
  emit here originated from `tabs: AnalysisTab[]`, so the value is already an
  `AnalysisTabId` under the hood — this is the domain boundary re-minting the
  brand. Added a comment naming that provenance.
- `vue/require-v-for-key` at line 113: `<template v-for="tab in tabs"
  #[tab.id]>` had no `:key`. Added `:key="tab.id"` alongside the existing
  dynamic slot-name binding (Vue permits `v-for` + `:key` + a dynamic slot
  name on the same `<template>`).

### `src/components/charts/chart-data.ts` (3 errors)

`local/justification-adjacency` at lines 30/31/33, all inside `pointY`: three
untyped-object/array structural reads over ECharts' two accepted per-point
shapes (`[x,y]` tuple or `{ value: [x,y], ... }`). Added one comment per
cast naming which of the two ECharts shapes is being read and why the
preceding `in`/`Array.isArray` check is what makes the cast safe.

### `src/components/library/LibraryTable.vue` (2 errors)

`local/justification-adjacency` at lines 196/199: `key as LibrarySortColumn`
in `onSortableHeaderClick` and `sortIndicatorFor`. The file already carries a
docstring above `isSortableColumn` explaining this isn't a valid type
predicate (LibrarySortColumn has members outside LibraryColumnKey's domain),
but the docstring sits two functions away from the actual cast sites, so the
rule's line-based adjacency correctly didn't credit it. Added a short
same-spot comment at each cast site pointing back at that guard.

### `src/components/wizard/steps/WizardStepPalette.vue` (2 errors)

`local/justification-adjacency` at lines 170/171, in the `aggregationValue`
computed: `KNOWN_AGGREGATIONS as readonly string[]` (widening the readonly
tuple so `.includes` accepts a plain string) and `fn as KnownAggregation`
(narrowing justified by the `.includes` check immediately before it). Split
the `.includes` call onto its own line so each cast could carry its own
adjacent comment without cluttering one line with two justifications.

### `src/composables/cards/batch-mint-core.ts` (3 errors)

- `local/justification-adjacency` at line 92 (two casts, `id as T` used
  twice): the walk-stack in `orderSelectionForBatch` is seeded and re-pushed
  at the plain-`NodeId` level (`rootNodeId: NodeId`, `node.children`), while
  the function's own signature is generic over `T extends NodeId`. Added a
  comment explaining that every popped id is a plain NodeId that MAY be a
  `T`, and that the `selected.has(id as T)` membership test is exactly what
  confirms it before `out.push` uses the same cast.
- `local/justification-adjacency` at line 180: `nodeId as UncardedNodeId` in
  `filterUncardedSelection` — this is the type's own sole construction site
  (per `UncardedNodeId`'s docstring, ~40 lines above, itself too far to
  satisfy line-based adjacency). Added an adjacent comment pointing back at
  that docstring and naming which branch condition makes the mint valid
  here (hash absent or not in `knownHashes` — literally the uncarded
  condition).

### `src/composables/review/useMinting.ts` (2 errors)

- `local/justification-adjacency` at line 120: `board.sourceCardId as
  unknown as number` in `resolveBoardLineage`. A full justification already
  precedes the enclosing `if` block, but the cast sits one line further in
  than the comment (inside the `if`'s body), which is exactly the "the
  comment is separated from the cast by the `if` line itself" adjacency gap
  the rule's design doc calls out. Added a short same-line trailing comment
  pointing back at the existing docstring rather than duplicating it.
- `local/justification-adjacency` at line 281: `cardId as unknown as
  CardId` in `commitMintBatch`. No prior comment existed. Added one naming
  the provenance (`cardIds` are wire numbers straight off
  `backendService.createCardsBatch`'s batch response) — this is the ACL
  handoff re-branding a freshly minted id.

### `scripts/lyt-conformance.mjs` (2 warnings)

Both were `Unused eslint-disable directive (no problems were reported from
'no-await-in-loop')` at lines 340 and 509. Checked `eslint.config.js`: the
`no-await-in-loop` rule is not configured anywhere in this project's flat
config (confirmed by grep — zero matches), so these two
`eslint-disable-next-line no-await-in-loop -- ...` comments were stale
cruft suppressing a rule that was never active for this file (whether it
once was and was later dropped from the config, or these were copied from
elsewhere, wasn't determined — not load-bearing to the fix). Removed both
comments outright; this is the honest fix (no rule-disabling was added or
retained — the opposite: a dead suppression was deleted). Not treated as
"genuinely spurious, kept" because there was nothing left to be spurious
about once confirmed dead — deleting was strictly more honest than leaving
inert cruft in place.

## Gates (from `frontend/`, worktree
`/home/bork/w/omega/.claude/worktrees/agent-ac4330ff87b246b49`)

- `npx eslint .` → **exit 0**, no output (0 errors, 0 warnings).
- `nice -n 19 npm run build` → **exit 0** (`vue-tsc -b && vite build`,
  1249 modules transformed, built in 2.16s; only pre-existing
  chunk-size-warning noise from the bundler, not an eslint/tsc gate).
- `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2 nice -n 19 npm run test:run` → **exit 0**, 257 test
  files passed / 3 skipped, **3201 tests passed** / 8 skipped — matches the
  commissioned baseline exactly. No test file was touched by this sweep.

## STOP-and-report items

None. Every fix was comment-only (justification prose, one `:key`
attribute) or removal of a confirmed-dead `eslint-disable` pair; nothing
here changed a runtime code path, and no lint violation appeared to be
guarding a real bug.

## Commit

One commit on this worktree's branch; see `git log -1` for the SHA (the
branch is a fast-forward of `origin/lyt-phase2` plus this one commit).
