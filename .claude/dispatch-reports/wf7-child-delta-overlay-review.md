# wf7-child-delta-overlay — independent review

**Fallback location note:** requested at
`/home/bork/w/omega/.claude/dispatch-reports/wf7-child-delta-overlay-review.md`,
but this agent is sandboxed to its own worktree and the Write tool
refused the shared-checkout path. Filed here instead, per the task's
own fallback instruction.

Fresh-context review, posture REFUTE. Reviewed branch
`worktree-agent-ab4af1260fb0ca50b`, commit `4321bddc` ("feat(frontend):
board-overlay child delta + visits annotation (wiki #7/#7.1)"), against
merge-base `0d6d12f6` (`next`). All 13 changed files read in full before
forming findings; the builder's own report
(`.claude/dispatch-reports/wf7-child-delta-overlay-build.md`) was read
only after the findings below were drafted, to check for silent
narrowing — none found; its claims match what I independently verified.

## Gates (run from a detached checkout of `4321bddc`, memory-capped per
commissioner directive: `NODE_OPTIONS=--max-old-space-size=2048`,
`nice -n 19`, `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`)

- **WITNESSED** `npm ci` — clean install, 333 packages.
- **WITNESSED** `npm run build` (`vue-tsc -b && vite build`) — exit 0.
- **WITNESSED** `npm run test:run` — exit 0. 127 files passed, 3 skipped
  (130); 1611 tests passed, 4 skipped (1615).
- **WITNESSED** `npx eslint .` (full repo) — exit 0, no errors/warnings.
- **WITNESSED** focused run,
  `npx vitest run tests/integration/useMoveDeltaAnnotation.test.ts
  tests/unit/store/migrations.test.ts` — 2 files, 287 tests, all pass.

## Red-then-green witness

Target: `useMoveDeltaAnnotation.ts`'s absence guard
(`if (delta === null || delta === undefined) return null;`), which is
the load-bearing line for the charter's "No delta in ledger → render
NOTHING (absence, not zero)" clause.

- **RED**: commented out the guard line, re-ran
  `useMoveDeltaAnnotation.test.ts` → 1 failed: "is null when the child
  has raw (visits) but no enrichment delta yet" — received
  `{ delta: null, point: {x:15,y:15}, ... }` instead of `null`. Exit 1.
- **GREEN**: restored the line verbatim, re-ran the same file → 6/6
  pass, exit 0. `git diff --stat` confirmed zero residual diff after
  restore.

## Structural correctness — the ply/colour-index math

This was the primary suspicion going in, given the brief's flag on
setup/pass nodes. Traced the full chain:

- `variationPath` (`getActiveVariationPath`) walks the tree root→leaf
  by `parent` links and includes **every** node type at its tree
  position — this part looked like a genuine risk for setup nodes
  skewing the index.
- However: the setup toolkit (`applySetup`, `src/logic.ts`) mutates
  the **current node's own** stone projection in place — it does not
  create a new tree node (confirmed: no `children.push`/`createNode`
  call site anywhere in the setup path; `engine/util.ts`'s own comment
  on the subtree-walk helper says the same). So a setup stone never
  consumes a `variationPath` slot — the "setup/moveless nodes" the
  brief named don't actually exist as distinct path entries in this
  codebase's current model. This resolves the concern structurally,
  not defensively.
- Pass moves (`type: 'pass'`) **do** create a real tree node and do
  consume a path slot/ply, matching `Move`'s `'place' | 'pass'`
  union. `useMoveDeltaAnnotation` filters `node.move.type !== 'place'`
  **before** computing `plyIdx`, so a pass child returns `null`
  unconditionally — verified live (see Manual probe below) rather than
  only by reading the guard.
- The `colorMoveToPly`/`plyToColorMove` pair's alternation assumption
  ("Black's k-th move → PlyIndex 2k-1") is pre-existing (used already
  by `useTriangularHeatmap`), not introduced by this diff, and is
  internally consistent with the pass-node exclusion above.
- The delta-series `mIdx` key is backend-authoritative
  (`packet.extra.{color}.deltas` parsed keys in
  `enriched-accumulator.ts`), a different indexing space from
  `variationPath` position; `plyToColorMove` is the sole bridge, and
  is the same helper `useTriangularHeatmap` already trusts.

**Manual probe (ADVISORY, not blocking — see Finding 1):** wrote a
throwaway integration test (not committed, removed after the run) that
(a) recorded a delta+visits for a pass-move child and asserted the
annotation, and (b) recorded a delta for a Black move two plies deep
(after an intervening White move) and asserted the colour-local index
still resolved correctly. Witnessed output:
```
pass node move: {"type":"pass","color":"W","x":0,"y":0}
pass annotation: null
deep black move annotation: {"point":{"x":15,"y":3},"color":"B","delta":0.33,"visits":77}
```
Both match the intended contract.

## Render locality (ADR-0010)

- `BoardDeltaAnnotation.vue` is its own leaf; `useMoveDeltaAnnotation`
  is instantiated inside the leaf's own `<script setup>`, subscribing
  to `useEnrichedData`/`ledger` only there.
- `BoardWidget.vue` (composition node) passes only `state`,
  `currentNodeId`, `boardSize`, `mode` — **and both `state` and
  `state.currentNodeId` were already read in BoardWidget's template
  before this diff** (feeding `MoveSuggestions`/`BoardVariationsOverlay`
  at lines 323/343 on `next`@`0d6d12f6`), so this change adds no new
  high-frequency dependency to BoardWidget's own render function. The
  only new read at the composition-node level is
  `store.session.ui.moveDeltaAnnotation` (a UI toggle, not
  per-packet/per-nav state) for the `v-if`/`:mode` binding. render ≫
  patch check: clean.
- The composable's per-instance `useEnrichedData`/`useVariationPathFor`
  usage mirrors the many-instance-safe pattern (`useVariationPathFor`
  over the id-resolving `useVariationPath` wrapper) the codebase
  already documents for exactly this reason (`BoardTab.vue`
  precedent); `onLedgerFlush`'s per-instance filtered patching bounds
  the per-packet cost to O(changed-keys) per mounted leaf, not O(N²)
  across open boards.

## Absence / delta-authority reuse

Confirmed by direct read (not just the test): `useMoveDeltaAnnotation`
computes no delta itself — it indexes
`useEnrichedData(...).value.deltaSeries.{black,white}[0].data`, the
identical accumulator `MergedDeltaPanel.vue` charts against, and the
delivered test's "cross-checks against the SAME authority" case proves
this by parallel-instantiating `useAnalysisProjection` and asserting
equality. `perPlayer` mode reads the identical `delta` value, only
changing label/tint — no second formula, per charter #7.1.

## Migration / rolling-archive

- `CURRENT_SCHEMA_VERSION` 67 → 68; `65 → 66` (resizer-rearch) rotated
  out of `migrations.ts` into `archived-migrations.ts` verbatim
  (byte-identical body/comment moved, confirmed by diff), keeping
  exactly two active migrations (`66→67`, `67→68`) per the rolling-
  archive discipline. Archive scope comment updated to "1 → 2 through
  65 → 66 (65 entries)" — correct count.
- `67 → 68` body: witnessed-container access, idempotent (valid value
  preserved), backfills invalid/absent to `'off'`. `migrations.test.ts`
  has a full `describe('67 → 68: ...')` block (5 cases: backfill /
  idempotent-preserve / invalid-replace / absent-container-no-op /
  end-to-end walk) — **present**, unlike the sibling merge the brief
  warned got dinged for a missing block.
- `migration-store-roundtrip.test.ts` (the composition-level key-set
  pin) was correctly left untouched: `moveDeltaAnnotation` is
  backfilled by the new migration, not merely defaulted, so it does
  not appear as a new `payloadOnly` divergence — this is the same
  reasoning the migration's own comment gives for choosing a backfill
  over relying on `deepMerge`.

## Findings

**Finding 1 — REQUIRED (test coverage gap, not a behavior bug).**
No delivered test exercises a pass-move child or the "setup on an
ancestor doesn't skew the index" case, despite the codebase having had
pass support since the prior merge (`cbc5a26d`) and setup nodes being
called out by name in this review's brief. I verified both behave
correctly (see Manual probe above), so this is not a correctness
blocker, but the acceptance-relevant contract ("no delta → render
nothing") has a real edge (pass moves) that ships with zero committed
regression coverage. Compose step: add two cases to
`useMoveDeltaAnnotation.test.ts`'s absence `describe` block — a pass
child with a recorded delta+visits (asserts `null`), and (optionally)
a Black move at colour-local index ≥1 with an intervening White move,
asserting the correct series entry is read (the existing "White's
move indexes...at colour-local index 0" case only proves index 0;
nothing proves the general colour-local-index math past the first
move of either colour).

**Finding 2 — ADVISORY.** `defaults.ts`/`schema.ts` doc comments say
"Schema-version 68 introduces the field" and `migrations.ts`'s `67 →
68` header names the version literally. Per the known seam
(orchestrator-handled), this migration renumbers to `68 → 69` at
merge; these three prose comments will need updating in the same pass
as the renumber (mechanical, same treatment every other migration's
own version-numbered comments get — not unique to this PR, just
flagging so it isn't missed since the numbers appear in three files
this PR touches, not only `migrations.ts`).

**Finding 3 — ADVISORY.** "mode toggles + persists" has no dedicated
test; it rides on `RegistryEditor`'s generic `PATH_ENUMS` mechanism
(same as sibling enum `boardVariations`, which also has no dedicated
toggle-persistence test beyond migration coverage) plus the migration
round-trip tests. Consistent with established convention for this
class of field — not a new gap this PR introduces, noting only because
the charter's acceptance line calls it out explicitly.

**Finding 4 — ADVISORY.** No visual/browser verification was performed
(by either the builder or this review, per the task's no-Playwright/
no-live-port constraint) of the badge's on-board pixel placement
against `BoardDisplay`'s last-move ring / move-number text. The
SVG-coordinate math (`toSvg`, the `stoneR * 1.15/1.4` offset) reads
consistent with sibling overlays (`BoardHeatmapOverlay`,
`MoveSuggestions`) geometry-mirroring convention, but pixel-level
collision is UNEXERCISED, same as the builder's own report discloses.

**Finding 5 — not a finding, confirmed clean.** `i18n` — `BoardDeltaAnnotation.vue`
hardcodes `'Black'`/`'White'` (no `t()`, no `vue-i18n` import). Checked
against the established convention: `MergedDeltaPanel.vue`,
`useDeltaViewMode.ts`, `useAnalysisContext.ts`, and
`MultiresolutionIntervalPanel.vue` all hardcode the same literals
today — this codebase does not route player-colour labels through
i18n anywhere. Not a deviation introduced by this PR.

## Verdict

**MERGE-WITH-FIXES.** No blocker; no correctness defect found (the
one genuine structural risk — setup/pass nodes skewing the ply index —
resolves cleanly on inspection and was confirmed live). Finding 1 is
the only REQUIRED item: add pass-move and colour-local-index-≥1 test
cases to `useMoveDeltaAnnotation.test.ts` before or immediately after
merge; it guards a real acceptance-relevant edge with a codebase
feature (pass moves) that already exists, and its absence is exactly
the kind of gap that stays invisible until a future refactor changes
the ply/colour-index relationship silently. Findings 2–5 are advisory
and can ride with the renumber pass or be left as documented.
