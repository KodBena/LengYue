# Review: card-position known-position highlight in the game tree (Stage B)

Fresh-context REFUTE review of branch `bork/feat/card-position-highlight-stageb`
(worktree `.claude/worktrees/card-position-highlight-stageb`, head `5b37a050`)
against base `next` (head `dcbde8de`, the i18n-tripwire hotfix — well past this
branch's cut point, which predates the LERP/overrides merge, the start-marker
merge, and the macro-token merge). Builder self-report
(`card-position-highlight-stageB-build.md`) read LAST, per instructions.
Spec: `card-position-annotations-design.md` (ratified) + ledger rows 510/524.

## VERDICT: REJECT

Two real defects found by direct probing and reproduction, not by reading the
builder's self-report. Both bear directly on the maintainer's stated
acceptance property ("no matter how they are encountered, there is no way for
the user NOT to see when they are about to add a position that already exists
as a card"). One is a genuine collision only visible at the trial merge
(exactly why the dispatch flagged TreeWidget as a likely collision zone); the
other is a pre-existing bug in the branch's own code, independent of the
merge, in a path the design brief specifically asked me to probe ("switching
boards back and forth (cache per board?)").

---

## Finding 1 (BLOCKING) — cross-board debounce-window race silently fails BOTH boards' highlights

**WITNESSED** via a targeted reproduction test (fake timers, real
`useNodePositionHashes` + `node-position-hashes.ts`, mocked
`backendService.hashPositionsBatch`).

`useNodePositionHashes()` (`frontend/src/composables/cards/useNodePositionHashes.ts`)
is instantiated **once** in `TreeWidget.vue`'s `setup()`. `TreeWidget` itself is
long-lived across board switches — `App.vue` mounts it under `v-if="activeBoard"`,
and `activeBoard` stays truthy across a tab switch, so the same composable
closure (`pending: Set<NodeId>`, `latestState: BoardState | null`, `timer`)
persists. `requestHashFill` is called from `watch(nodeList, …, {immediate:true})`,
which fires again on a board switch (new `nodes` prop → new `nodeList`).

Neither `pending` nor `latestState` is board-scoped:

```ts
function requestHashFill(nodeIds, state) {
  ...
  latestState = state; // clobbers whichever board's state was there before
  ...
}
async function flush() {
  const ids = [...pending]; // may hold NodeIds from TWO different boards
  const state = latestState; // only ONE board's state survives
  const rawContents = ids.map(id => serializeActivePath(state, id));
  // ids belonging to the OTHER board are not in `state.nodes` —
  // serializeActivePath's `getPath` throws fail-loud (ADR-0002) on a
  // NodeId absent from the tree it's walking.
  ...
}
```

If a user switches board tabs within the 150ms debounce window (a completely
ordinary interaction — click into board A, immediately click board B), board
A's still-pending NodeIds and board B's newly-requested NodeIds land in the
same `pending` Set, `latestState` becomes board B's state, and the flush's
`serializeActivePath(stateB, nodeIdFromA)` throws. The catch block (correctly,
per its own local contract) treats this as ADR-0002 failure-honesty: nothing
is cached and one `pushSystemMessage('warning', …)` fires. But the practical
effect is that **the currently-active board's own highlights also fail to
load** for that cycle — not just the stale board's — because the whole batch
call never happens (the throw is synchronous, inside the `try`, before
`hashPositionsBatch` is even invoked).

Reproduction (isolated composable-level test, mirrors the existing
`useNodePositionHashes.test.ts` style exactly):

```
A cached: undefined
B cached: undefined
messages: [{"type":"warning","text":"Could not check some tree positions
  against your cards. The already-owned-position highlight may be incomplete
  until this recovers."}]
```

Board B — the board the user is actually looking at — gets **no highlight and
a spurious "may be incomplete" warning**, even though board B's own hash
request would have succeeded on its own. This directly violates "no matter
how they are encountered": rapid board switching is exactly a "how encountered"
path, and it silently degrades the very board the user switched to look at.
It self-heals on the *next* nodeList-triggering event (board is revisited),
so it's transient, not permanently stuck — but the maintainer's phrasing
("no way for the user NOT to see") doesn't have a "usually" clause.

None of the four Stage B test files exercise two distinct `BoardState`
objects in the same debounce window — only single-board scenarios are
covered, which is why this shipped green.

**Fix shape** (not prescribing the only possible fix, but the state needs to
stop being flat): scope `pending`/`latestState`/`timer`/`notifiedThisEpisode`
per `BoardId` (e.g. `Map<BoardId, {...}>`), or flush-then-clear the prior
board's pending set synchronously when `state.id` differs from the boardId
already in flight, before merging in the new board's ids. Either way, a
regression test driving two `BoardState` objects through the same composable
instance within one debounce window is needed before this ships.

## Finding 2 (BLOCKING at merge, must fix in compose) — known-position-ring and review-start-ring collide exactly

**WITNESSED** via the trial merge (this branch's base predates `next`'s
card-start-marker merge, `6cc26f67`, which the dispatch itself flagged as a
likely collision zone).

Pre-merge, both rings render at the identical radius **and** identical color:

- `review-start-ring` (landed in `next` after this branch was cut):
  `NODE_R + 7`, `stroke: var(--accent-secondary)`.
- `known-position-ring` (this branch): `NODE_R + 7`, `stroke: var(--accent-secondary)`.

A node that is **both** a review session's starting position **and** an
already-owned card position is a realistic, not edge-case, overlap — starting
a review from a position you already have a card for is a completely ordinary
flow. Z-order in the merged template draws `known-position-ring` (dashed)
first and `review-start-ring` (solid) later in the same `<g>`, on top. Two
identical-radius, identical-color circles, one dashed and one solid, fully
overlapping: the solid ring completely occludes the dashed one. The
known-position highlight becomes **invisible** on exactly this node —
silently defeating "no way not to see it's a duplicate" for the overlap case.

This is not a defect in either commit taken alone (each was written against a
divergent base with no visibility into the other's ring), which is exactly
why the dispatch called trial-merge mandatory and named this file as a likely
collision site. It is a real, git-mergeable-but-semantically-broken merge:
`git merge` resolves the textual conflict (both sides insert non-overlapping
lines) with no complaint, and nothing short of running the merged result and
reasoning about the visual stack would catch it.

**Exact compose-step fix applied and verified in the trial merge** (scratch
worktree, not committed to any real branch): bump `known-position-ring` out
to `NODE_R + 9`, one radius further than `review-start-ring`, keeping the
existing dashed pattern (still shape-distinct under C18 even where it doesn't
overlap anything). Four-ring concentric stack: active (+3), game-head (+5),
review-start (+7), known-position (+9). Doc comment on the marker updated in
the trial merge to record the collision and the resolution for whoever lands
it for real.

## Findings that did NOT block (disclosed by builder, independently confirmed, not new)

- **Render-cost of the marker's wiring** — the design's §4 explicitly asked
  for the "imperative escape" pattern (like `active-ring`) for this marker
  specifically, citing TreeWidget's render-cost sensitivity. What shipped
  instead follows the `isGameHead`/`nodeList`-field pattern (a template-reactive
  read), which the builder's own report defends as "the exact
  `gameHeadIds`/`game-head-ring` precedent." I confirmed by reproduction that
  a fresh `Set` identity on `knownPositionNodeIds` (which is exactly what
  `activeBoardKnownPositionNodeIds`'s computed produces on every cache-fill
  landing) forces one full `TreeWidget` render-function re-run — and
  confirmed the **same is already true of `gameHeadIds`** today (not a new
  mechanism). The difference is frequency: a game head changes once per
  session; a hash-fill can land every ~150ms during active tree
  browsing/expansion on a large tree. The builder's own report already flags
  this precisely as **UNEXERCISED** ("no large-tree (250+ node) empirical
  request-count measurement," "no dedicated render-count regression guard...
  authored for repeated nav specifically") rather than claiming it's fine —
  so this is disclosed risk, not silent overreach. Given ADR-0009 (performance
  claims need empirical verification, not "true by construction" assertions),
  this should get a real 250+-node measurement before Stage B is called
  performance-safe, but it is not, on its own, a reason to reject this
  submission — it's a should-fix-before-large-tree-rollout item, properly
  disclosed.
- Deletion of a card does not remove its `content_hash` from
  `known-positions.ts` (a stale-positive highlight could persist after
  deleting your only card at a position). This traces to the **ratified
  design doc's own §3**, which lists "card deletion... (no-op)" as an
  explicit refresh-trigger decision, not something Stage B introduced or
  silently deviated from. Flagging it because I scrutinized the "deleting a
  card" encounter path per the dispatch, but it is a already-litigated
  design call, not a Stage B defect.

## What was verified clean (WITNESSED)

- **Batch endpoint correctness**, probed live against my own scratch backend
  (uvicorn, port 19801, sqlite scratch DB at
  `scratchpad/probe-db/scratch.db`, killed after; live `:8764` never touched
  — confirmed via `ss -ltnp`/`ps` that the pre-existing live server on 8764,
  up since 20:25, is unrelated to my probes, and explains ordinary
  `cards.db` mtime churn independent of this review):
  - Batch hashes are byte-for-byte equal to N single-endpoint calls
    (3-item cross-check, exact digest match both directions).
  - Malformed item honestly reports its batch position:
    `"Could not normalize position at index 2: ..."`, HTTP 422.
  - Empty list → 422 (pydantic `min_length=1`, runs before the cap check).
  - Over-cap (201 items) → 413 with the structured
    `{kind, detail, received, maximum}` body; exactly-at-cap (200) → 200.
  - No bearer → 401.
  - Band classification (ADR-0003 Band 1, tenancy-agnostic): confirmed by
    code read — `user_id` is a dependency-injected auth gate only, never
    passed into `normalizer.normalize()`; no user data enters the pure
    computation.
- **OpenAPI/type-generation honesty**: regenerated `frontend/src/types/backend.ts`
  from my own scratch server's live `/openapi.json` and diffed byte-for-byte
  against the branch's committed file — **identical**. The committed types
  are not stale or hand-edited.
- **Backend test suite on the trial-merged tree** (not just the branch's own
  base): `725 passed, 2 skipped, 1 xfailed` — up from the branch's own
  `714 passed` because `next` carries more tests; no regressions.
- **Frontend gates on the trial-merged tree**: `npm run build` clean
  (pre-existing >500kB chunk warning only); `npx eslint .` exit 0, no output;
  `npm run test:run` → `120 files (3 skipped) / 1517 passed, 4 skipped`.
- **i18n tripwire**: the one new locale string
  (`cards.knownPositionHashFillFailed`) has no literal braces, compiles
  clean under the new all-keys compilation test that landed in `next` since
  this branch was cut.
- **No migration touched**: confirmed via `git diff next...HEAD --stat --
  backend/alembic` (empty) — this branch adds no schema, consistent with
  Stage A already having landed `content_hash`.
- **Teardown/purge wiring**: `purgeBoardNodeHashes`/`purgeAllNodeHashes`
  correctly registered in `store/teardown-registrations.ts`
  (`node-position-hashes:purge-board` / `node-position-hashes`), pinned by
  `teardown-registry-completeness.test.ts` and the registry-derived
  drain-on-401 pin in `auth-lifecycle.test.ts` — both pass on the
  trial-merged tree.
- **No `waitForTimeout`** in any test file this branch touches.
- **`cards.db` mtime**: unaffected by this review's own activity (all
  probing used isolated scratch DBs/ports); ordinary churn traced to the
  pre-existing live server on `:8764`, unrelated.

## Compose steps (for the record — DO NOT MERGE until Finding 1 is fixed)

Once Finding 1 (cross-board race) has a real code fix + regression test from
the builder, the merge itself is mechanical:

```
git worktree add --detach <scratch> next
cd <scratch>
git merge --no-ff bork/feat/card-position-highlight-stageb
# conflicts: frontend/FILES.md (alphabetical entry re-interleave, trivial),
#            frontend/src/App.vue (combine two adjacent :prop lines, trivial),
#            frontend/src/components/tree/TreeWidget.vue (combine both
#              features' additive script/template hunks; APPLY Finding 2's
#              known-position-ring radius bump to NODE_R + 9 while resolving)
# resolve, then:
cd backend && ./venv/bin/python -m pytest tests/ -q         # expect ~725 passed
cd ../frontend && npm run build && npx eslint . && npm run test:run
# add a regression test for Finding 1 before considering this mergeable
```

## Per-claim status (builder's own claims, re-audited)

- Batch endpoint hashes match single endpoint byte-for-byte: **WITNESSED**
  (independently, live).
- Cache purge-on-board-close/identity-flip: **WITNESSED** (tests pass on
  trial-merged tree).
- Viewport-bounded fill: **WITNESSED by construction** (same as builder's own
  claim — `nodeList` is expansion-bounded, not literal scroll-clipped, which
  matches existing precedent for other per-node work in this file).
- Failure-honesty (absent highlight, one notice): **PARTIALLY WITNESSED,
  PARTIALLY REFUTED** — true in the single-board case the builder tested;
  **false** in the multi-board case (Finding 1) — the "one notice, nothing
  cached" mechanics hold, but the *scope* of what silently fails is wider
  than intended (an unrelated board's positions, not just the stale one).
- "Mint → highlight appears, no reload": **WITNESSED** (unchanged by this
  review — single-board flow, not implicated by either finding).
- Marker visually distinct, C18 no-color-only: **REFUTED** in the merged
  state — see Finding 2 (identical color AND radius to `review-start-ring`,
  a same-codebase-family collision the builder had no visibility into at
  authoring time).
- Render-cost guard: builder's own **UNEXERCISED** flag confirmed accurate
  by independent reproduction — not a new finding, but verified rather than
  taken on faith.
