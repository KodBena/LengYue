# Review: pass support (`bork/feat/pass-support` @ 96674258)

- **Reviewer:** fresh-context review agent, REFUTE posture, gates run independently
- **Date:** 2026-08-06
- **Branch:** `bork/feat/pass-support` @ `96674258`, isolated worktree
  `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/pass-support-wt`
- **Trial-merge tree:** scratch worktree
  `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/pass-trial-merge`,
  branch `review/pass-support-trial-merge` off current `next` @ `04e4d491`
  (already carries setup-stones-toolkit and the prev-card `,` hotkey).
  Two commits on that scratch branch: `49c5dda2` (raw conflict resolution)
  and `d226b38b` (the one required fix + a stale-assertion bump, both
  described below and verified). Neither commit is intended to be pushed —
  they exist only to prove the compose recipe below.

## VERDICT: ACCEPT-WITH-NITS

The feature is well-built: correct genre-convention affordances (WITNESSED),
a genuinely byte-identical `processUserMove`/`processUserTurn` extraction
(WITNESSED via diff), zero scoring/territory code (WITNESSED via grep), and a
clean wire round-trip (WITNESSED via a real service-level test using a mock
WebSocket). The merge against current `next` is small (4 files textually
conflict, all mechanical) and the trial-merge is green (build/lint/tsc/tests)
**after one required one-line-class fix** to `getGameEndStatus`, which was a
real, verified defect — not merely a hypothesized risk — in the exact
interaction the dispatch asked to "verify or REJECT." Given the fix is small,
precise, and already proven not to regress any existing test, this is an
ACCEPT-WITH-NITS rather than a REJECT: land the branch via the compose recipe
below, which includes the fix as a required step, not an optional follow-on.

## Compose recipe (exact)

```sh
git worktree add <path> next -b <compose-branch>
cd <path>
git merge --no-ff bork/feat/pass-support
```

Four files conflict textually; **all four resolve by keeping BOTH sides**
concatenated (next added `applyMarkup`/`pathHasMidTreeSetup` and their tests
after this branch's base commit; pass-support adds `applyPass`/
`getGameEndStatus` and their tests in the same physical spot in each file —
this is pure base-divergence, not a real design conflict):

1. **`frontend/src/logic.ts`** — keep `applySetup`, then `applyMarkup`
   (next), then `applyPass` (pass-support), then the untouched
   `applyGoMove`.
2. **`frontend/src/engine/util.ts`** — keep `pathHasMidTreeSetup` (next),
   then `getGameEndStatus` (pass-support) — **but land `getGameEndStatus`
   with the fix below, not the branch's original body.**
3. **`frontend/tests/unit/engine/util.test.ts`** — keep both `describe`
   blocks (`pathHasMidTreeSetup`, `getGameEndStatus`); merge the import
   lists (`pathHasMidTreeSetup` + `getGameEndStatus` from `util`;
   `applySetup, applyGoMove, applyPass` from `../../../src/logic`;
   `getPath` from `../../../src/engine/navigator`; `GameNode` added to the
   `types` import).
4. **`frontend/tests/unit/composables/keybindings-catalog.test.ts`** — keep
   both new `it` blocks (`review.prevCard` deck-repeat test from next,
   `board.pass` test from pass-support).

Everything else (`FILES.md`, `App.vue`, `StatusBar.vue`, `TreeWidget.vue`,
`useBoardMoveRouting.ts`, `usePassSignal.ts` (new), `keybindings-catalog.ts`,
`useReviewSession.ts`, `en.json`, the new/changed test files) merges with
**zero textual conflict** — verified by actually running the merge, not
inferred from a two-way diff against `next` (a raw `git diff next..HEAD`
is misleading here: it appears to *delete* `SetupToolPalette.vue`,
`useSetupTools.ts`, and their tests, purely because this branch's base
predates the setup-stones-toolkit merge into `next`; the real three-way
merge does not touch any of that).

### Required fix (not optional): `getGameEndStatus`, `frontend/src/engine/util.ts`

The branch's original body:

```ts
export function getGameEndStatus(nodes, path) {
  if (path.length < 2) return { kind: 'in-progress' };
  const lastMove = nodes[path[path.length - 1]]?.move;
  const prevMove = nodes[path[path.length - 2]]?.move;
  if (lastMove?.type === 'pass' && prevMove?.type === 'pass') {
    return { kind: 'ended-by-pass', lastMoveColor: lastMove.color };
  }
  return { kind: 'in-progress' };
}
```

reads `path`'s last two entries positionally, with **no filtering for
moveless nodes**. `next` already ships `pathHasMidTreeSetup` — a sibling
utility built for exactly the shape this misses: a mid-tree `AB`/`AW`/`AE`
setup node (`move: null`, the same shape `sgf-loader.ts::transform` produces
for any SGF node carrying setup properties but no `B`/`W`) sitting on the
active path. `getGameEndStatus` never consults it, and the two features
were never wired together (unsurprising — pass-support branched before
setup-stones landed).

**WITNESSED defect** (reproduced in the trial-merge tree before the fix,
`frontend/tests/unit/witness-setup-interleave.test.ts`, since removed): a
board where B passes, a mid-tree setup-only node is inserted (the exact
shape a real externally-authored teaching SGF with an annotation between two
passes would decode to), then W passes — `getGameEndStatus` returned
`{ kind: 'in-progress' }` instead of `{ kind: 'ended-by-pass' }`, because
`path[path.length - 2]` landed on the setup node (`move: null`), not the
first pass. This is reachable from the UI acceptance path (criterion 5:
loading an externally-authored SGF) and from `StatusBar.vue`'s own
`gameStatus` computed, which calls the same function — the status badge
would silently fail to appear for that shape.

The design's own trailing-moveless-node test (`getGameEndStatus`'s
"a moveless node ... trailing two passes reads in-progress at ITS OWN
position") is a **different, intentional** case (the CURRENT position
itself has no move) and must keep passing — a naive "filter path to
move-bearing nodes, take the last two" fix breaks it. The correct fix
checks the current position first, then walks backward *skipping* (not
counting) moveless nodes:

```ts
export function getGameEndStatus(
  nodes: Record<NodeId, GameNode>,
  path: readonly NodeId[],
): GameStatus {
  if (path.length === 0) return { kind: 'in-progress' };
  const lastMove = nodes[path[path.length - 1]]?.move;
  if (!lastMove || lastMove.type !== 'pass') return { kind: 'in-progress' };
  for (let i = path.length - 2; i >= 0; i--) {
    const m = nodes[path[i]]?.move;
    if (m == null) continue; // skip a mid-tree setup/moveless node
    return m.type === 'pass'
      ? { kind: 'ended-by-pass', lastMoveColor: lastMove.color }
      : { kind: 'in-progress' };
  }
  return { kind: 'in-progress' };
}
```

**WITNESSED**: this fix, applied in the trial-merge tree, (a) fixes the
setup-interleave repro above, (b) keeps every one of the branch's own 8
`getGameEndStatus` tests green with no changes, and (c) the full trial-merge
suite (1601 tests) passes.

### Minor nit (non-blocking, bundle with the compose if convenient)

- `KEYBINDINGS_REGISTRY (ship-time smoke) > 'contains the 18 actions...'`
  (`frontend/tests/unit/composables/keybindings-catalog.test.ts:175`) hardcodes
  the literal `18`; the merge legitimately grows the catalog to 19 actions
  (`board.pass` added since that test's `next`-side baseline). One-line fix:
  bump the literal (and title) to 19 — WITNESSED, applied and green in the
  trial-merge tree.
- `frontend/FILES.md`'s `logic.ts` entry (both on the branch alone and after
  merge) never mentions `applyPass` — the entry lists `applyGoMove` and (post-
  merge) `applySetup`/`applyMarkup` but not the new mutator. `util.ts`'s
  entry likewise doesn't mention `getGameEndStatus`/`GameStatus`. ADR-0005/
  ADR-0007 documentation-discipline nit — worth a follow-up line, not
  blocking.

## Scrutiny items — findings, each WITNESSED or UNEXERCISED

1. **`applyPass` semantics** — WITNESSED. Consumes the turn, no capture, no
   board mutation beyond the node (`frontend/src/logic.ts`); the new node's
   property is `{ [turn]: [''] }`. Confirmed against `sgf-writer.ts`'s
   `serializeProperties` (untouched by this branch, read in full): an
   empty-string value still has `values.length === 1`, so it survives
   serialization as `B[]`/`W[]` and is not swept by the "empty array"
   drop case. Confirmed against `sgfToMove` (`engine/util.ts:58-61`,
   untouched): `sgfStr.trim() === ''` decodes back to `{ type: 'pass' }`.
   Confirmed the leaf-node case (a pass as the very last node in the tree,
   no children) is still serialized — `serializeSubtree` always emits a
   node's own `serializeProperties` output regardless of child count.
   Round-trip (load→save→load) for a pass at tree end is therefore sound
   by inspection of both boundaries; not re-run end-to-end as an actual
   file read/write in this review (UNEXERCISED as a full-cycle IO test,
   though each boundary is independently covered by existing/new unit
   tests: `sgf-writer` tests are pre-existing/untouched, pass-encoding
   round-trip is covered by `tests/unit/engine/util.test.ts::sgfToMove`
   and `moveToKataCoord`, both passing).
2. **Setup-stone interaction** — see the required fix above (WITNESSED
   defect, WITNESSED fix). `pathHasMidTreeSetup` (next) and
   `getGameEndStatus` (pass-support) are siblings that were never wired
   together before this review; the fix above is the wiring the compose
   needs.
3. **`usePassSignal` mirrors `useMintDialogSignal`** — WITNESSED. Read
   both files in full: same module-scoped counter-`ref` idiom (not a
   boolean, so two rapid requests inside one reactive-flush window don't
   coalesce), same doc-comment rationale, same "no immediate-fire, live
   precondition read at flush" shape (`App.vue`'s `watch(passRequestCount,
   () => handlePass())` reads current `reviewSession.state`/`activeBoard`
   at flush time inside `handlePass`, not captured at signal time).
4. **Review flow / wedge recovery** — WITNESSED. `processUserPass` and
   `processUserMove` both delegate to a new shared `processUserTurn`;
   diffed `processUserTurn`'s body against the pre-extraction
   `processUserMove` tail (from `updateBoardState` onward, ~270 lines)
   line-by-line — byte-identical. The review-wedge recovery
   (`analyzeRange`'s synchronous-refusal handling, the null-`queryId`
   path), the LERP visits hook (`lerpVisits(effectiveVisits.value,
   visitsLerpParams.value)`), and `touchSession` calls all live unchanged
   inside the shared function, so a pass mid-review goes through the
   identical grading/wedge machinery a placed move does — no regression
   risk from the extraction itself.
5. **Self-play-harness engine-pass throw** — WITNESSED reachable, WITNESSED
   undocumented in this branch. `usePlayFromPosition.ts` has zero diff
   against `next` in this branch (confirmed via `git diff`) — the three
   `throw new Error(...engine recommended pass...)` sites the design
   flagged are untouched and still throw. Checked whether this is honestly
   documented anywhere in the branch (FILES.md diff, dispatch-reports,
   inline comments near the throws): **not found** — no mention of the
   limitation shipped with this change. Severity: **user-reachable**, not
   hypothetical — `playEngineMatch` (the self-play/match harness this throw
   guards) already has per-player `overrideSettings` merged into `next`
   (`bc565beb`, confirmed an ancestor of `next` via
   `git merge-base --is-ancestor`), reachable from `EngineMatchModal.vue`
   in the shipped UI. A per-player override that steers KataGo toward
   passing (plausible with a weak/policy-only override) will crash the
   match with an uncaught `Error`, not a graceful game-end. This is called
   out as a known, named limitation in the original design doc's
   touched-file inventory ("only if self-play through game-end is in
   scope; otherwise leave as a named, documented limitation") — the
   branch takes the "otherwise" path but does not do the "named,
   documented" half. Recommend a one-line code comment at each throw site
   (or a FILES.md/dispatch-report line) stating the limitation explicitly,
   and a ledger follow-on item; **not** a blocker for this merge (scope
   was legitimately deferred per the design's own option space), but
   should not go unrecorded.
6. **Standing checks** — WITNESSED. No `waitForTimeout`/`chromium` anywhere
   in the diff. Migrations directory untouched (frontend-only feature, no
   backend/DB change). `touchSession` discipline: `handlePass` uses
   `updateBoardState`, the identical persistence path `handleBoardMove`
   already uses for a placed move — no divergence introduced.
   ADR-0004 proportionality: the diff is scoped to exactly the design's
   touched-file inventory plus tests; no incidental unrelated churn found.
   The full i18n test suite (part of the 1601-test run) passed, including
   the tripwire coverage.
7. **Gates run by this review, both trees:**
   - Branch alone (`pass-support-wt`): `npm run lint` clean; `vitest run`
     — 1560 passed, 4 skipped, 0 failed.
   - Trial-merge (`pass-trial-merge`, before fix): `vue-tsc --noEmit`
     clean; `npm run build` clean; `npm run lint` clean; `vitest run` —
     1596 passed, 1 failed (the stale magic-number assertion, see nit
     above), 4 skipped.
   - Trial-merge (after the required fix + the nit fix): `vue-tsc
     --noEmit` clean; `npm run lint` clean; `vitest run` — 1597 passed, 0
     failed, 4 skipped.

## Other findings

- **Keybinding collision** — WITNESSED clear. `p` (new `board.pass`
  default) does not collide with any other `KEYBINDINGS_REGISTRY`
  `defaultKey` (enumerated all 19: `ArrowDown/Up/Left/Right/Home/End`,
  `u`, `' '`, `[`, `]`, `m`, `n`, `c`, `d`, `l`, `.`, `,`, `k`, `p`), is not
  in `RESERVED_KEYS` (`lib/keybindings-capture.ts`: `Escape, Tab, Enter,
  Shift, Control, Alt, Meta, ContextMenu, F1-F12`), and the setup-stones
  toolkit adds no keybindings at all (it's mouse/toolbar-driven) — so
  there is no three-way collision risk either.
- **C18 (no color-only meaning)** — WITNESSED satisfied twice over: the
  tree glyph is a literal "P" `<text>` element (not merely a distinct
  fill color) on `TreeWidget.vue`'s pass nodes, and the StatusBar pass
  affordance is a text-labeled button ("Pass"), not an icon/color cue.
  No collision with any "three rings" setup rendering — `next`'s
  `TreeWidget.vue` has no setup-specific node rendering at all (grepped;
  none found), so that named risk in the dispatch did not materialize.
- **Scoring/territory** — WITNESSED absent. `git diff next -- frontend/src`
  grepped case-insensitively for `score|territory|dead.?stone|counting`
  outside test files: the only two hits are prose in doc comments (one
  describing the *existing* per-move-delta review-scoring machinery a
  pass reuses, one explicitly disclaiming scoring in `getGameEndStatus`'s
  own doc comment). No scoring/territory code anywhere in the diff.

## Summary for the commissioner

Land via the compose recipe above. The one required change
(`getGameEndStatus`'s backward-walk fix) is small, precisely specified,
and already proven correct and non-regressing in the trial-merge tree — it
is not a design rethink, just closing a gap the two independently-built
features (pass-support, setup-stones) left between them. The self-play
engine-pass throw is a legitimate, previously-scoped-out limitation that
should get one added line of documentation and a ledger follow-on, not a
code fix in this merge.
