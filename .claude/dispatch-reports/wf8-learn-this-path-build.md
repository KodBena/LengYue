# wf8-learn-this-path — build report

**Fallback location note:** the primary path
`/home/bork/w/omega/.claude/dispatch-reports/wf8-learn-this-path-build.md` is outside this
worktree's isolation boundary (the tool refused a write there: "Edit the worktree copy of this
file instead of the shared-checkout path"), so this report lives at the worktree-local fallback
per the dispatch instructions.

**Branch:** `worktree-agent-ab7becace83f1a5bc`
**Commit (current, rework):** `018135ff` — "rework(frontend): 'Learn this path' — spine-first walk,
deferred batch mint, pre-mint markers" (ledger row 733)
**Commit (original v1 build):** `48c9b1cea70de2d9841bd50dcf5ef3252ced0a9f`
**Base:** `3378806f` (the commit `next` pointed to when this worktree was cut; `next` has since
advanced concurrently via other builders' merges — same situation the salvage's own report noted
and the same pattern ledger row 697 records: the reviewer reviews this diff on its own base, the
rebase/renumber-if-needed is the orchestrator's merge act).

## REWORK (ledger rows 706-708, 718 — supersedes the v1 build below)

After the v1 build (commit `48c9b1cc`) shipped with its own flagged-for-veto ranking-metric
reading, the commissioner reviewed the flag and issued two rounds of ratified amendments that
**restructure** the walk (the ranking-metric reading itself — rank by `moveInfos[].order`
ascending — was *confirmed*, row 706). The "Salvaged vs. redone," "Choice-1 inclusion," and
"Determinism" subsections of the original DESIGN section below are **superseded** by this
section; the ranking-metric and dedup-soundness subsections still apply as background but are
restated inside this section's own walk-through rather than re-read separately. See the DESIGN
section further down for the complete, current restatement — this box is the changelog:

- **Row 706** confirms the v1 ranking reading (ascending `moveInfos[].order`) and additionally
  requires a **stable-on-ties** guarantee, now pinned by construction (own tiebreak on original
  array position, not relied-upon engine sort stability) and unit-tested
  (`tests/unit/composables/learn-path-policy.test.ts`).
- **Row 707 (SPINE)**: rank 1 (`order` 0, the engine's best move) is now a **spine** — descended
  first, to the walk's full depth, and **never carded**. This replaces v1's flat "expand ranks
  {1..K} as carded siblings" shape.
- **Row 708 (DEVIATIONS DESCEND)**: ranks 2..K are **deviations** — each is the root of its own
  recursively-expanded subtree (same spine-first rule inside it), not a leaf stub as in v1.
- **Row 708 (LIVE EXPLORATION)**: the walk now mutates the board's actual game tree incrementally
  (via `updateBoardState`), yielding a paint checkpoint between steps, so the tree viewer shows
  the exploration growing in real time. v1 never touched the live board at all.
- **Row 708 → amended by row 718 (DEFERRED BATCH MINT → BUTTON, NOT AUTOMATIC)**: row 708 first
  asked for one deferred batch mint at walk end; row 718 amended this to an **explicit, caller-
  driven** step — no card mints during the walk, and none mints automatically once it finishes
  either. `useLearnPath` is now split into `explore()` (grows the tree, collects deviations,
  mints nothing) and `confirmMint()` (the one batch call, wired to an explicit "Mint All" button).
  v1 minted every seeded card inline, during the walk.
- **Row 718 (PRE-MINT MARKERS)**: every pending deviation that ISN'T already an existing card
  (checked against the same pre-fetched dedup snapshot `confirmMint` uses) gets a live marker in
  the tree viewer the moment the walk finds it — a new `learn-path-pending-markers.ts` per-board
  registry, rendered by `TreeWidget.vue` as a dashed blue ring. Cleared after `confirmMint`
  resolves or on an explicit discard. v1 had no visual preview at all.
- **Row 718 (policy surface ratified)**: the typed `{K, depth}` config, expressed through a new
  `learn-path-policy.ts` `LearnPathPolicy` interface (`spineFirstPolicy` the sole concrete
  implementation), is accepted as v1's policy surface — no DSL. The walk engine calls only the
  interface (`rankCandidates` / `shouldRecurse` / `isCardEligible`); a future DSL-backed policy
  plugs in at this seam without touching `useLearnPath.ts`.

**UI**: `LearnPathModal.vue` is now a two-phase Explore → inspect → Mint All/Discard flow instead
of v1's single "Seed Cards" button.

**Rejected in this rework:**
- **Auto-mint at walk end** (row 708's own first draft) — rejected by row 718 in favor of an
  explicit button, specifically so the commissioner can inspect the grown tree and its markers
  before anything touches cards.db.
- **A policy DSL** — rejected (deferred) by row 718; the typed config is "the accepted v1 policy
  surface," with the seam left for a DSL "under design consideration" to plug into later without
  a rewrite.
- **Rolling back the grown tree nodes on discard** — considered and explicitly NOT built (see the
  DESIGN section's "Live tree growth & pre-mint markers" discussion below): only the deferred
  minting and its markers are cancelable; the explored node structure persists even if the user
  never mints. Removing it safely would require tracking cross-references to nodes another
  concurrent action might depend on — named as a documented limitation, not solved here.

## Salvaged vs. redone

The prior builder's WIP (commit `0aed73bb` on `worktree-agent-a3f03e3aa02ace908`, force-stopped
mid-build per ledger row 698) was diffed against its own merge-base (`3378806f`, which — checked —
is byte-identical to the four touched files' content on current `next`, so the port was a clean
copy with no conflict resolution needed). All six salvaged files were read in full and judged
sound; **all were kept, none redone**:

- `frontend/src/composables/cards/useLearnPath.ts` (new, 378 lines) — the walk/mint composable.
  Kept verbatim. Read closely for correctness (existing-child reuse, COW discipline, dedup
  soundness argument, precondition handling) — no defect found.
- `frontend/src/components/modals/LearnPathModal.vue` (new, 187 lines) — the dialog. Kept
  verbatim; follows `MintCardModal.vue`'s established shape (420px modal width, dark-input class,
  result-box pattern).
- `frontend/src/composables/review/useMinting.ts` — kept verbatim. The diff is a pure extraction
  of the `grading_parameter` compilation into a new exported `compileMintGradingParameter()`
  (module-level), with `prepareDraft` calling it. Verified byte-for-byte behavior-preserving:
  same branches (active vs. specific palette), same field-merge order (`default_visits` then
  `gamma`), only the wrapping changed from "inline in `prepareDraft`" to "extracted so
  `useLearnPath` can call it without a live board."
- `frontend/src/App.vue`, `frontend/src/components/chrome/Toolbar.vue`,
  `frontend/src/locales/en.json` — kept verbatim (modal ref + mount, toolbar button + emit wiring,
  i18n strings). Mirror the existing `triggerMint`/`MintCardModal`/`mint-card` pattern exactly.

**What was added (not present in the salvage):** the salvage shipped with zero tests. This build
adds:
- `frontend/tests/fakes/backend-service.ts` — extended with `resolveRoots` / `fetchTreeByRoot` /
  `fetchCard` spies (the dedup-coverage read path `useLearnPath` exercises; the fake previously
  only covered `submitReview`/`createCard`/`updateCardMetadata`).
- `frontend/tests/integration/useLearnPath.test.ts` (new) — the pre-registered acceptance test
  plus four supporting tests (determinism, param validation, both precondition-refusal cases).
- `frontend/FILES.md` — two new rows for the new files (discipline in `frontend/CLAUDE.md`
  "File map").

## DESIGN (current, post-rework — restated per ledger row 660's veto-surfacing discipline)

**Walk semantics (rows 706-708).** Depth-first from the anchor card's position. At each visited
node, read the analysis ledger's `RawAnalysis.moveInfos` for that exact `NodeId` (keyed by
`activeAnalysisKeys.value.rawKey` — constraint 1, unchanged: v1 reads existing analysis only,
never issues a new engine query). `spineFirstPolicy.rankCandidates` sorts by KataGo's own `order`
field ascending — stable on ties via an explicit original-array-position tiebreak, not
engine-sort-stability reliance (unit-tested) — and slices to `topK`. **Rank 1 (`order` 0) is the
spine**: applied, committed live into the board's tree (`updateBoardState`), and — critically —
**fully recursed into and awaited before any other rank at that node is even attempted**. That
ordering, not a separate scheduler, is what makes the live-growth trace read as "the whole trunk
draws first, then the branches" (verified directly in the live-growth test below). No card is
ever minted for a spine position. **Ranks 2..K are deviations**: each is applied, committed live,
recorded as a *pending* seed (nothing minted yet), and then recursed into with the SAME
spine-first rule — its own best continuation is its own uncarded spine, its own deviations
recurse again. The walk stops expanding a branch once `plyDepth >= params.depth`; a node with no
recorded analysis (raw or ranked-empty) at any visited ply is a reported **frontier**, never a
silent truncation (ADR-0002, constraint 1 unchanged).

**Ranking metric (row 706 — confirms the v1 finding, no change).** The commissioner's "rank
according to the current palette" resolves to: `activeAnalysisKeys.value.rawKey` selects *which*
analysis identity is live (model/override/palette), and *within* that bucket, KataGo's own
`order` is the only per-candidate ranking signal the ledger's raw store carries — the palette's
`state_fns`/`delta_fn` enrichment is a per-played-move scalar, not a per-sibling-candidate score.
Full investigation trail unchanged from the original build; see `useLearnPath.ts`'s module header
("Ranking metric" section) for the complete argument.

**Parent-reference threading — how a deviation skips the (uncarded) spine.** A deviation's card
must parent off the nearest *carded* ancestor, which may be several plies back through a spine
chain. `useLearnPath.ts`'s `walk()` threads a `ParentRef` down through recursion: unchanged across
every spine step (no card minted there, so no new parent to hand down), re-minted to a fresh
*placeholder* only when descending into a deviation (which — deferred — has no real `CardId`
yet). A placeholder is guaranteed resolved before any of its descendants need it, because it's
created before the walk ever recurses into that subtree — `confirmMint` processes pending seeds
in exactly that discovery order and fails loudly (`LearnPathError`) if that invariant is ever
violated, rather than minting under a dangling reference.

**Live tree growth & pre-mint markers (row 708/718).** Both spine and deviation steps commit into
the live board (`updateBoardState`) and then `await yieldStep()` — a **paint checkpoint**, not a
pacing delay; the default is one `requestAnimationFrame` per step, and `LearnPathParams.yieldStep`
is an injectable seam tests use for a microtask-based yield instead (never a wall-clock
`setTimeout`, per the standing gate rule). A deviation step additionally registers a marker in the
new `learn-path-pending-markers.ts` per-board registry — **unless** it's already an existing card
(checked against the pre-fetched dedup snapshot), so the marker set always equals exactly what
"Mint All" would create. `TreeWidget.vue` renders a member node with a dashed blue ring (see "UI /
marker precedent" below). Once the walk finishes, the board's cursor
(stones/turn/captures/koPoint/currentNodeId) is reset to the anchor's own position — the explored
**nodes persist** (that tree IS the artifact being inspected), but the viewport doesn't strand
wherever the last step landed.

**UI / marker precedent (honesty note).** The row-718 dispatch named "the dashed known-position
ring and the review-start ring implementations in the tree rendering" as the pattern to follow.
An Explore agent did a full read of `TreeWidget.vue` (394 lines) plus a repo-wide grep for every
spelling variant of both names — **neither exists in this codebase.** `TreeWidget.vue` has exactly
two existing rings: a solid active-node ring (imperative-escape pattern, `NODE_R+3`) and a solid
green game-head ring (`ReadonlySet<NodeId>` prop, `NODE_R+5`). Per ADR-0002 this is surfaced rather
than silently substituted: the new pre-mint marker follows the **game-head-ring shape** (closest
actual precedent — a `ReadonlySet<NodeId>` prop, `pendingMintIds`, membership-tested per node) at
`NODE_R+7` (outermost, so it coexists with both existing rings), styled with `stroke-dasharray`
(matching the file's one existing dashed element, the toggle-leader connector) and
`var(--accent-primary)` (the same blue the solid active-ring already uses) — "same colour family,
visually distinct via dash + outermost radius" is the literal reading of row 718's own phrasing,
applied to the precedent that actually exists rather than the one named but absent.

**Deferred, button-gated batch mint (row 708 → amended by row 718).** `useLearnPath()` exposes
`explore()` (runs the walk above, mints nothing, returns a `LearnPathExploration` — pending/
existing/frontier/unplayable counts plus opaque internal bookkeeping) and `confirmMint()` (the
ONLY function that calls `commitMint`/`createCard` — processes every pending seed in discovery
order, applying the existing-card dedup check *at this point*, not during the walk; clears the
board's pre-mint markers in a `finally` regardless of outcome). `discardExploration()` clears the
markers without minting. `runLearnPath()` (explore + confirmMint chained) remains for
programmatic/test use; the interactive `LearnPathModal.vue` calls the two phases separately,
gated on an explicit "Mint All" click.

**Policy seam (row 718, ratified, no DSL).** `learn-path-policy.ts` defines `LearnPathPolicy`
(`rankCandidates` / `shouldRecurse` / `isCardEligible`) and the sole concrete implementation
`spineFirstPolicy`. `useLearnPath.ts`'s walk engine calls only the interface — it has no
spine/deviation-specific branching of its own beyond "role decides card-eligibility and
parent-threading," which is itself policy-agnostic. `LearnPathParams.policy` lets a caller supply
a different one; a future DSL-backed policy compiles to this interface and plugs in without
touching the walk engine.

**Tag flow, precondition, existing-card dedup soundness argument (unchanged from v1).** User-
supplied tag on every minted card's `tags` field (constraint 2); the walk requires the board's
cursor at its own root (`LearnPathPreconditionError` otherwise, constraint/limitation unchanged);
dedup by exact `canonicalContent` string match against the anchor's pre-fetched descendant subtree
(same mint-time-komi-calibration caveat as before). See the original v1 DESIGN prose above (now
superseded for ranking/carding/mint-timing specifics, but unchanged on these three points) for the
full argument — not re-derived here to avoid drift between two copies of the same unchanged
reasoning.

**Determinism (restated for the new shape).** Same ledger state + same params → the same *shape*
(which positions spine vs. deviation, which deviations seed/skip/frontier, at what depth/rank,
under which structural parent) — not necessarily the same concrete `CardId`s, which are
server-assigned. The walk is a pure function of the ledger's `moveInfos` at each visited `NodeId`,
`applyGoMove`'s deterministic existing-child-reuse, `spineFirstPolicy`'s own pinned-stable
ordering, and the `existingContent` dedup snapshot fetched once at `explore()` start. The
dedicated determinism test asserts on shape (ply/rank/move/skip-reasons/frontier-plyDepths), never
concrete ids, for exactly this reason.

## Acceptance criteria — evidentiary status (current, post-rework)

The original dispatch's acceptance bar was written against v1's shape (single-phase, mint-during-
walk). Each item is re-verified against the reworked semantics; where the reworked shape changed
*what* satisfies the claim, that's named explicitly.

1. **Synthetic-ledger integration test produces the deterministic expected card set to depth d
   with the tag.** WITNESSED, reworked test. `tests/integration/useLearnPath.test.ts`:
   `useLearnPath.confirmMint` → `"mints exactly the pending-minus-existing set in one pass, clears
   markers, matches the acceptance shape"`. A 5-node synthetic fixture (root spine D4 → C17 → Q3,
   D4's deviation P9, root's deviation Q16) is built via real `applyGoMove` calls (existing-child
   reuse gives deterministic `NodeId`s — see the test file's own header for the mechanism), ledger-
   seeded, dedup-faked, `explore()`d then `confirmMint()`ed; asserts the full `{seeded, skipped,
   frontiers}` shape by ply/rank/parent/reason AND that exactly one `createCard` call happened
   (the sole non-spine, non-existing deviation). Companion determinism test
   (`useLearnPath.runLearnPath`) reruns the same fixture twice and asserts shape-equality
   (ply/rank/move/skip-reasons/frontier-plyDepths — never concrete `CardId`s). Passed:
   `vitest run useLearnPath learn-path-policy` → 15 passed, 0 failed.
2. **Unanalyzed frontier fails loudly with partial-result report (test).** WITNESSED, same test:
   the fixture deliberately has NO recorded analysis at either deviation's own subtree root (P9,
   Q16); asserted `result.frontiers` contains both, each resolved to its correct real parent
   `CardId` (the newly-minted P9 card for one, the pre-existing Q16 card for the other) — proving
   frontier resolution works correctly even when threaded through the deferred-mint placeholder
   machinery, not just the simple case.
3. **Existing-card positions skipped-with-notice (test).** WITNESSED, reworked test: Q16's
   candidate SGF is fake-registered as an existing descendant card; asserted `result.skipped`
   contains the `existing-card` entry, AND that the walk still recursed into Q16's own subtree
   during `explore()` (its frontier is present in the result, resolved to the *existing* card's
   id as parent) — the skip doesn't truncate exploration, matching v1's behavior, now proven
   across the explore/confirm split.
4. **`npm run build` exit 0.** WITNESSED. `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048
   VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run build` → clean `vue-tsc -b` typecheck, 1086
   modules transformed, `dist/` produced.
5. **`npm run test:run` exit 0.** WITNESSED. Same memory-capped invocation: **83 test files
   passed, 3 skipped (86 total); 1116 tests passed, 4 skipped (1120 total)**. The 3 skipped
   files / 4 skipped tests are pre-existing (not touched by this change).
6. **Backend suite exit 0 if backend touched.** UNEXERCISED — not applicable. No backend file
   touched by either the v1 build or this rework.

**New tests this rework requires (per the coordinator's explicit list), all WITNESSED:**
- **Live-growth step order, spine-first.** `useLearnPath.explore` → `"grows the tree live (spine
  fully before deviations) and mints NOTHING"`. A custom `yieldStep` records the just-inserted
  node's move coordinates on every call; asserts the exact sequence `[D4, C17, Q3, P9, Q16]` — the
  full 3-ply spine grows and is awaited to completion BEFORE either deviation appears, and `pass`
  (unplayable) produces no growth step at all. Also asserts `createCard` was never called during
  `explore()`.
- **Pending-marker set = deviation set minus existing-card positions.** Same test: after
  `explore()`, `getPendingMintNodeIds(boardId)` has size 1, containing exactly P9's `NodeId` (the
  one non-existing deviation) — Q16 (dedup-existing) is confirmed absent from the marker set.
- **Mint-all triggers exactly one batch call, nothing before it.** `useLearnPath.confirmMint` →
  the acceptance test above asserts `createCard` is uncalled after `explore()` and called exactly
  once after `confirmMint()` (matching the fixture's single genuinely-new deviation).
- **Markers clear post-mint / post-discard.** Same test asserts `getPendingMintNodeIds(boardId)
  .size === 0` after `confirmMint` resolves; a second test
  (`"discardExploration clears the markers without minting anything"`) asserts the same after an
  explicit discard, with `createCard` never called.
- **Ranking ascending + stable-on-ties.** `tests/unit/composables/learn-path-policy.test.ts` (new,
  Tier-1 pure-logic, 8 tests): ascending-by-`order` regardless of input array order; ties at equal
  `order` break by original array position (both a direct assertion and a repeated-call stability
  check); `topK` slicing; empty-input handling; rank-1-is-always-spine / isCardEligible /
  shouldRecurse-at-depth-budget.

**Additional non-required checks run:** `eslint` against every touched/added file — 0 errors after
two fixes surfaced by the linter itself and corrected in this rework: an unclassified
`updateBoardState` call site (added to `eslint.config.js`'s `board-mutation-entry-point` allowlist
with a one-line reason — `useLearnPath.ts`'s walk plays its own candidate moves to grow the tree
for inspection, not a user move, the same class as the engine-responder / match-cursor / SGF-load
entries already there) and two unjustified `as` casts (one given an adjacent-comment justification,
the other eliminated entirely in favor of discriminated-union narrowing on `ParentRef.resolved`,
which is sound typing rather than a cast).

## Other tests carried over from the v1 build (still passing, semantics adapted)

- **Param-validation test** — `depth < 1`, `topK < 1`, and a whitespace-only tag each reject with
  `LearnPathError` from `explore()` before any network call (moved from `runLearnPath` to
  `explore`, since `explore` now owns all up-front validation).
- **Precondition tests** (×2) — a board with no `sourceCardId` and a board whose cursor isn't at
  its own root each reject with `LearnPathPreconditionError` from `explore()`.

## Notes for the reviewer / orchestrator

- This worktree's branch base (`3378806f`) is behind current `next` (`0d6d12f6` as of the v1
  build; further ahead by now) — `next` advanced via other concurrent builders' merges after this
  worktree was cut, not because this branch is stale relative to its own starting point. No
  rebase attempted here; per the established pattern (ledger row 697), the reviewer reviews this
  diff on its own base and any renumbering is the orchestrator's merge act.
- This session ran `./autoharn led -f useMinting.ts decision "..."` (ledger row 700, v1 build) and
  a rework-summary `./autoharn led decision "..."` (ledger row 733, this rework) to satisfy the
  worktree's pre-tool-use change-gate hook and to keep the ledger current — the worktree had no
  `autoharn`/`deployment.json` (both untracked in the parent checkout, so not present in a fresh
  worktree by default); both were copied in from `/home/bork/w/omega` so the shared ledger was
  reachable. This is infrastructure the session needed to make any source edit at all, not a
  design decision about the feature — noted here for completeness, not as a design row.
- The row-718 dispatch's naming of "the dashed known-position ring and the review-start ring" as
  the precedent to follow does not match anything findable in this codebase (full-file read of
  `TreeWidget.vue` plus a repo-wide grep for every spelling variant, done via a dedicated research
  pass) — surfaced per ADR-0002 rather than silently building against an assumed precedent; see
  the DESIGN section's "UI / marker precedent" paragraph for what was actually built instead and
  why it's the closest faithful analog.
