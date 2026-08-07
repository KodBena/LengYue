# wf8-learn-this-path — build report

**Fallback location note:** the primary path
`/home/bork/w/omega/.claude/dispatch-reports/wf8-learn-this-path-build.md` is outside this
worktree's isolation boundary (the tool refused a write there: "Edit the worktree copy of this
file instead of the shared-checkout path"), so this report lives at the worktree-local fallback
per the dispatch instructions.

**Branch:** `worktree-agent-ab7becace83f1a5bc`
**Commit:** `48c9b1cea70de2d9841bd50dcf5ef3252ced0a9f`
**Base:** `3378806f` (the commit `next` pointed to when this worktree was cut; `next` has since
advanced concurrently via other builders' merges — same situation the salvage's own report noted
and the same pattern ledger row 697 records: the reviewer reviews this diff on its own base, the
rebase/renumber-if-needed is the orchestrator's merge act).

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

## DESIGN (restated for commissioner veto per ledger row 660)

This restates the design already committed to the salvage's own module-header documentation
(`useLearnPath.ts`'s JSDoc, read in full and judged sound) — carried forward here as the
report's own design record, not merely a pointer to it.

**Walk semantics.** BFS by ply from the anchor card's position. At each frontier node, read the
analysis ledger's `RawAnalysis.moveInfos` for that exact `NodeId` (keyed by
`activeAnalysisKeys.value.rawKey` — the live model/override/palette selection, ratified constraint
1: v1 reads existing analysis only, never issues a new engine query). Sort by KataGo's own
`order` field (ascending; `order` 0 = the engine's best move), take the first `topK`, and expand
each as a child for **both** the current-to-move side and, one ply later, the other side —
i.e. every ply alternates naturally because each seeded child inherits the flipped `turn`.
The walk stops expanding a branch once `plyDepth >= params.depth`.

**Ranking metric — the commissioner's clarification, and the finding it produced.** The
commissioner's instruction was "rank according to the current palette." Investigation (walking
`RawAnalysis` / `Enrichment`'s split in `src/state/analysis-ledger.ts` and `RawKey`/`EnrichedKey`'s
derivation in `src/state/analysis-config.ts`) found that the ledger's **only** per-sibling-candidate
ranking signal, `RawAnalysis.moveInfos[].order`, lives in the **raw** store — keyed by `RawKey`,
which is palette-**independent by construction** (the raw/enrichment split exists specifically so
a palette swap doesn't re-key raw KataGo output). The palette's `state_fns`/`delta_fn` enrichment
produces a per-**played**-move, per-turn scalar (`KataExtra.state`, `KataPlayerExtra.deltas`) —
there is no per-candidate, palette-derived score anywhere in the ledger to sort siblings by.
Re-deriving one client-side (running `delta_fn`/`summary_fn` in JS against every candidate) would
duplicate the proxy's Python execution semantics and is out of v1 scope under ratified constraint 1
(existing ledger data only, no new engine/enrichment work). **v1's reading, flagged here explicitly
for veto:** "current palette" governs *which analysis identity is live* —
`activeAnalysisKeys.value.rawKey`, derived from the same model/override/palette selection the user
is currently looking at — and *within* that bucket, ranking falls back to KataGo's own `order`.
This is the single most load-bearing open design call in this report.

**Choice-1 inclusion: YES.** Ranks 1..K (`order` 0..K-1) are expanded at every node, including the
top choice — not just runners-up. The wiki's "deviations from BOTH sides" reads as "seed the
candidate set a player actually has to recognise," which includes the main line. With the UI
default K=3 this literally covers "first, second, and third choice."

**Rejected alternative:** expand only ranks 2..K (runners-up only), on a literal reading of "second
and third choice." Rejected because it would leave the *most likely actual continuation* — the
top move — unseeded, undermining the pedagogical point (a student reviewing this tree would never
see the position that results from the opponent's most probable reply).

**Tag flow.** User-supplied string (required, non-empty after trim), applied as `tags: [tag]` on
every seeded card's `CardCreatePayload` — the same wire field `MintCardModal` uses. No changes to
the backend tag DSL (ratified constraint 2).

**Determinism.** Same ledger state + same params (`boardId`, `depth`, `topK`, `tag`) → same seeded
set. The walk is a pure function of: the ledger's `moveInfos` at each visited `NodeId` (read-only,
never mutated by the walk), `applyGoMove`'s deterministic move-application (existing-child reuse
means replaying the same sequence of coordinates from the same starting tree shape always lands on
the same `NodeId`s), and the `existingContent` dedup map fetched once up front. The one external
non-determinism is `backendService.createCard`'s returned `CardId` (server-assigned, not
predictable) — but the *shape* of the result (which moves seed vs. skip vs. front, at which
depth/rank, under which structural parent) is deterministic; only the concrete minted ids differ
run-to-run against a live backend. The dedicated determinism test (see below) asserts on the
shape (ply/rank/move/skip-reasons/frontier-depths), not on concrete ids, for exactly this reason.

**Precondition (documented v1 scope restriction).** The walk needs a `CardId` to parent depth-1
seeds under. The only client-side `NodeId → CardId` linkage that exists is `BoardState.sourceCardId`
(set only on a board's root by the card-load paths). There's no mapping from an arbitrary mid-tree
`NodeId` to a `CardId`, so v1 requires the board's cursor to be at its own root
(`board.currentNodeId === board.rootNodeId`) and fails loudly (`LearnPathPreconditionError`)
otherwise. Extending this to work from any mid-tree node with a known card is named as future work,
not built here.

**Existing-card dedup — soundness argument and its one documented gap.** The backend's
`insert_card` doesn't dedup at the card level (only `get_or_create_position` dedups the
`normalized_position` row), so "skip if it already exists" isn't automatic — v1 implements it by
fetching the anchor's already-minted descendant subtree (`resolveRoots` + `fetchTreeByRoot`) and
comparing each candidate's `serializeActivePath` output against existing descendants'
`canonicalContent` by exact string equality. Sound within one lineage tree (identical move
sequences from the same root produce byte-identical SGF) **unless** a compared sibling was minted
with a different mint-time komi calibration (which rewrites the SGF's `KM` property) — documented
limitation, not engineered around in v1.

**Rejected alternative (dedup):** rely on the backend's own dedup. Rejected because
`insert_card` doesn't provide one — verified by reading `backend/services/card_service.py`
(unchanged in this build; read as part of confirming the salvage's own claim, not modified).

## Acceptance criteria — evidentiary status

All items pre-registered in the dispatch. Per-claim status:

1. **Synthetic-ledger integration test produces the deterministic expected card set to depth d
   with the tag.** WITNESSED. `tests/integration/useLearnPath.test.ts`, test
   `"seeds the deterministic set to depth 2/K 2, skips the existing card, and reports the
   unanalyzed frontier"`. Constructs a synthetic anchor board (root with two pre-materialized
   children so `applyGoMove`'s existing-child-reuse gives deterministic `NodeId`s — see the test
   file's own header comment for the mechanism), seeds the ledger at exactly those `NodeId`s,
   fakes the dedup-read path, and asserts the full `{seeded, skipped, frontiers}` shape by depth,
   rank, parent, and reason. Passed: `npx vitest run useLearnPath` → 5 passed, 0 failed.
2. **Unanalyzed frontier fails loudly with partial-result report (test).** WITNESSED. Same test:
   the Q16-at-root branch has no recorded analysis at its child position; asserted
   `result.frontiers` contains exactly that `{parentCardId, plyDepth: 1, nodeId}` entry, while the
   sibling D4 branch's seeded/skipped results are still present in the same result (proving the
   frontier is a reported stop, not a thrown abort that would have discarded the D4 branch's
   results too).
3. **Existing-card positions skipped-with-notice (test).** WITNESSED. Same test: the D4-at-root
   candidate is fake-registered as an existing descendant card; asserted `result.skipped` contains
   `{reason: 'existing-card', existingCardId, parentCardId, plyDepth: 1, rank: 1}`, and that the
   walk continues past it (a depth-2 card is subsequently seeded with `parentCardId` equal to the
   *existing* card's id, proving the skip doesn't truncate the walk).
4. **`npm run build` exit 0.** WITNESSED. `vue-tsc -b && vite build` — clean typecheck, 1084
   modules transformed, `dist/` produced. (`npm ci` was required first — this worktree had no
   `node_modules`; ran clean, 333 packages, no errors relevant to this change.)
5. **`npm run test:run` exit 0.** WITNESSED. Full suite: **82 test files passed, 3 skipped (85
   total); 1106 tests passed, 4 skipped (1110 total)**. The 3 skipped files / 4 skipped tests are
   pre-existing (not touched by this change — not investigated further, out of this task's scope).
6. **Backend suite exit 0 if backend touched.** UNEXERCISED — not applicable. No backend file was
   touched (constraint 2/3 keep this a frontend-only change: existing tag substrate, existing mint
   path, no wire-shape change). `git status` on the final commit shows only `frontend/` paths.

**Additional non-required checks run:** `eslint` against every touched/added source file — 0
errors (2 warnings, both "file ignored because of ignore pattern" on the two test-tree files,
which is the repo's standard exclusion of `tests/` from the app-source lint config, not a defect).

## Other tests added (beyond the pre-registered acceptance bar)

- **Determinism regression test** — runs the walk twice against two freshly-built,
  ledger-purged-between-runs copies of the same synthetic fixture and asserts the seeded/skipped
  shape (ply, rank, move, skip reasons, frontier depths — deliberately excluding concrete minted
  `CardId`s, which are backend-assigned and not part of the determinism claim) is identical.
- **Param-validation test** — `depth < 1`, `topK < 1`, and a whitespace-only tag each reject with
  `LearnPathError` before any network call.
- **Precondition tests** (×2) — a board with no `sourceCardId` and a board whose cursor isn't at
  its own root each reject with `LearnPathPreconditionError`.

## Notes for the reviewer / orchestrator

- This worktree's branch base (`3378806f`) is behind current `next` (`0d6d12f6` as of this
  writing) — `next` advanced via other concurrent builders' merges after this worktree was cut,
  not because this branch is stale relative to its own starting point. No rebase attempted here;
  per the established pattern (ledger row 697), the reviewer reviews this diff on its own base and
  any renumbering is the orchestrator's merge act. The four files this build edited
  (`App.vue`, `Toolbar.vue`, `useMinting.ts`, `en.json`) were verified identical between
  `3378806f` and `next`'s tip at the time this session started, so no merge conflict is expected
  on those; `frontend/FILES.md` may need a routine three-way merge if another concurrent builder
  also touched it — not checked here (out of this task's scope; the orchestrator's merge step is
  the place to check).
- This session ran `./autoharn led -f useMinting.ts decision "..."` (ledger row 700) to satisfy the
  worktree's pre-tool-use change-gate hook before editing `useMinting.ts` — the worktree had no
  `autoharn`/`deployment.json` (both untracked in the parent checkout, so not present in a fresh
  worktree by default); both were copied in from `/home/bork/w/omega` so the shared ledger was
  reachable. This is infrastructure the session needed to make any source edit at all, not a
  design decision about the feature — noted here for completeness, not as a design row.
