# Finding + build: card-position tree annotation (wanted-feature 4 / wanted-feature 1)

Status: **two-part record.** Part 1 (below, unchanged) is the original
stop-finding — investigation only, no code shipped — that re-scoped this
work: the maintainer's adjudication (ledger row 524) accepted the finding
in full, reversed the subsumption ruling, and directed the zero-I/O
fallback the finding surfaced (§"Options for re-adjudication", option
(b)) be built as its own item instead. Part 2 (appended at the end of this
file) is that build: delivered, committed, gates green.

## Part 1 — the stop-finding (original delivery, record preserved)

Status: **investigation only, no worktree created, no code changes.** Per the
dispatch brief's stop condition ("If the card→start-node mapping is not
currently available in the SPA without a wire change, STOP and report that
finding instead of improvising a backend change"), this report is delivered
INSTEAD of an implementation.

Author read end-to-end: `frontend/CLAUDE.md`, `frontend/src/components/tree/TreeWidget.vue`,
`frontend/src/composables/board/usePlayVsEngine.ts`, `docs/worklog/2026-05-30-perf-treewidget-nav-cost.md`,
`frontend/src/state/known-positions.ts`, `.claude/dispatch-reports/card-hash-stageA-build.md`,
`.claude/dispatch-reports/card-position-annotations-design.md` (the ratified design doc for this
exact feature).

## Commission trail (three messages, in order)

1. **Original ask** (ledger 503/506, wanted-feature 4): a START marker in the
   game tree "showing where a card starts, similar to how match and play
   markers look." Framed as visual-annotation-only, nothing architectural.
2. **Charter extension** (ledger 510, wanted-feature 1): additionally
   highlight ALL known card positions in the tree — "reuse [Stage A's] exact
   match mechanism/reactivity source." Framed as the same data source, a
   second visually-distinct glyph alongside the start marker.
3. **Maintainer adjudication** (supersedes #2's two-glyph design): the
   known-position highlight SUBSUMES the start marker — "a card only starts
   on an already-hashed position" — so build ONE annotation (known-position
   highlight, match/play-marker visual family), no separate start-marker
   glyph. Asked me to verify the subsumption claim empirically before
   building, and to STOP if the sets actually diverge.

This report addresses all three: the subsumption claim (verified TRUE), and
the actual blocker, which is orthogonal to subsumption and blocks the
now-unified single feature regardless of which of the three framings is used.

## What "match and play markers" actually are (the precedent)

`TreeWidget.vue:372-379` — the only ring-marker precedent in the game tree
today (`frontend/src/components/tree/TreeWidget.vue:372`):

```
<circle v-if="item.isGameHead" :cx="item.px" :cy="item.py" :r="NODE_R + 5" class="game-head-ring" .../>
```

`item.isGameHead` is `!!props.gameHeadIds?.has(id)` (`TreeWidget.vue:307`),
fed by `usePlayVsEngine.ts`'s `activeBoardGameHeadIds` — a `computed()` over
`Object.values(activeBoard.value.games)`, i.e. **a plain in-store
`Record<NodeId, EnginePlayGameSession>` already resident on `BoardState`**
(`games: Record<NodeId, EnginePlayGameSession>`, schema v52). No network
call, no async fetch, no cache-with-invalidation — the marker is a `Set<NodeId>`
derived synchronously from data the board already has loaded. "Match" (engine-
vs-engine, `playEngineMatch`/`usePlayMatch`) doesn't currently populate a
distinct ring at all — it shares no visual marker with "play"; the commission's
"match and play markers" phrase most likely names the visual family loosely
(a sibling ring drawn at `NODE_R+5`, distinct color, same idiom as the
`NODE_R+3` active-cursor ring), not two separately-sourced data mechanisms.
This is the idiom I would have followed exactly, had the data source allowed it.

**The critical property of this precedent: the membership set (`gameHeadIds`)
is available with zero I/O**, because "is this node a game head" is answered
entirely from data the SPA already has in memory for the currently-open board.

## The actual data source for "does this node correspond to a known card" — and why it breaks the precedent

Confirmed via `.claude/dispatch-reports/card-position-annotations-design.md`
(the ratified design for this exact annotation, written before Stage A shipped)
and via grep across `frontend/src` for `ContentHash`/`hashPosition`/`content_hash`:

- **Stage A** (shipped, `card-hash-stageA-build.md`) gives a reactive
  `Map<ContentHash, CardId>` (`frontend/src/state/known-positions.ts`) — the
  set of *card content hashes the user owns*, populated incidentally as cards
  are fetched. This answers "is hash H a known position" in O(1), no I/O.
- **What's missing: a `NodeId -> ContentHash` mapping for the currently-
  rendered tree.** `GameNode` (`frontend/src/types/game.ts:143`) carries no
  content-hash field. There is no cached or derived hash per tree node
  anywhere in the codebase — confirmed by grep: `ContentHash`/`hashPosition`/
  `content_hash` appear only in `known-positions.ts`, `useKnownPositions.ts`,
  `useMinting.ts`, `backend-service.ts`, and the generated `types/backend.ts`.
  Nothing in `components/tree/`, `composables/forest/`, or `composables/cards/
  useCardTreeProjection.ts` (the card-*forest* projection, a different tree —
  confirmed out of scope per the commission) computes or caches a per-`NodeId`
  hash.
- **Computing a node's hash requires a backend round trip, by design.** The
  design doc's §1 ("IDENTITY (the crux)") explicitly rejects client-side
  reimplementation of `normalize_sgf`: the backend's hash is over whatever
  the Python `sgf` library's serializer emits byte-for-byte, which is "not a
  documented spec... a hand-rolled TS reimplementation would need to match
  that byte-for-byte... any future bump... silently drifts." The only sound
  path is `serializeActivePath(state, nodeId)` → `POST /positions/hash`
  (`backendService.hashPosition`, already wired for the mint-dialog's
  single-shot duplicate check) → compare against `known-positions`. This is
  a genuine network call **per node**, not a synchronous lookup.

## Verifying the maintainer's subsumption claim

**Confirmed TRUE at the data-model level.** `recordKnownPosition` is called
exactly once per card, from `BackendService.mapToReviewCard`
(`frontend/src/services/backend-service.ts:144`), using that card's own
`content_hash` (one hash per card row, not one hash per node along its
line — `normalize_sgf` hashes the *whole* root→node main-line sequence per
design doc §2, so a card's hash identifies exactly the one node it was
minted from, not every ancestor). So the set of "nodes whose content hash is
in `known-positions`" and the set of "nodes that are some card's start" are
the same set, *given the ability to compute per-node hashes*. No divergence
found — the subsumption premise holds, and I did not find a case where a
single card contributes more than one node to the matched set.

**This does not resolve the blocker.** Subsumption only says the two features
(start marker, known-position highlight) collapse to one annotation — it
says nothing about how to determine, for the current tree, *which* nodes
belong to that set. That determination is the part requiring per-node
network calls, independent of whether one or two glyphs are drawn.

## Why this is the STOP condition, not a same-day build

The commission and its extension both frame this as visual-annotation-only,
"nothing architectural," same shape as the zero-I/O match/play-ring
precedent. The actual feature, once the data-source question is answered
honestly, requires:

1. **A new per-node cache** (`Map<NodeId, ContentHash>`) with its own
   invalidation model — new state, not a template annotation. (The design
   doc's own §4 says to reuse the `thumbnail-render-resources.ts` cache
   *shape*, but that's still a wholly new cache instance, hooks, and
   invalidation wiring, not something that exists today.)
2. **Viewport-driven fetch orchestration** — the design doc's §5 explicitly
   rejects eager whole-tree hashing (250+ concurrent requests) in favor of
   hashing only visible/about-to-be-visible nodes, wired through
   `useTreeExpansion`/`useViewportFollow`'s existing `ensureVisible`
   machinery. This is new integration surface in a component the project's
   own perf worklog (`docs/worklog/2026-05-30-perf-treewidget-nav-cost.md`)
   already treats as sensitive.
3. **Async network calls fired from tree rendering** — even wired through
   the imperative-escape pattern (ADR-0010-compliant in *mechanism*), this
   is qualitatively different from "a marker computed synchronously from
   already-loaded reactive state," which is what makes the match/play-ring
   precedent cheap and what the commission's premise assumes is true here.
4. **Test tier mismatch.** The design doc's own Stage B acceptance handle
   (§6) calls for a Playwright witness (load a fixture game with a
   pre-seeded card at a known `NodeId`, assert the marker renders there and
   nowhere else) — this dispatch's TESTS section explicitly prohibits
   chromium and `waitForTimeout`. A logic-level unit test can cover the pure
   classification function (`none | known`, given a pre-populated
   `Map<NodeId, ContentHash>` and the `known-positions` set) but cannot
   witness the actual node↔hash correspondence end-to-end without the
   fetch/cache machinery item 1-2 stand up first — which is precisely the
   part this dispatch's "visual annotation only" scope excludes.
5. **The design doc's own size estimate for this exact work is "medium...
   roughly 2-4 sessions,"** explicitly distinguished from Stage A's "small...
   1-2 sessions" already shipped. Stage B was deliberately deferred out of
   Stage A's scope for this reason (`card-hash-stageA-build.md`: "Stage B
   (tree markers) is explicitly out of scope, per that design's §6.").

None of this is a backend/wire-*contract* change (the `POST /positions/hash`
endpoint already exists and is already ACL-wired via
`backendService.hashPosition`), so it does not trip the letter of "no schema
change, no migration, no new persistence." But it is squarely a wire-*usage*
change — new network traffic pattern, new client-side cache/invalidation
surface, new orchestration in a perf-sensitive component — which falsifies
the commission's premise that this is "nothing architectural," nothing more
than a marker analogous to the zero-I/O match/play rings. That is exactly
the divergence the dispatch brief told me to stop and report rather than
improvise past.

## Options for re-adjudication

- **(a) Charter Stage B as its own scoped item**, sized per the design doc
  (~2-4 sessions): per-node hash cache + viewport-driven fetch + Playwright
  witness, explicitly separate from "visual annotation only" dispatches.
  This is the design doc's own recommended shape and nothing here contradicts
  it — it just isn't a same-day marker addition.
- **(b) Descope to something genuinely zero-I/O**, if a same-day marker is
  still wanted: the literal "start marker" reading (`ReviewSessionData
  .startingNodeId`, `frontend/src/types/cards.ts:284`, set at
  `useReviewSession.ts:541`/`1080`) — a `NodeId | null` already resident on
  the active review session, updated locally with no network call, exact
  same idiom as `gameHeadIds` (a `Set`/singleton derived synchronously from
  already-loaded store state). This does **not** implement "highlight all
  known card positions" (item 2/3 above) and does not satisfy the
  maintainer's subsumption-based unification — it only marks where the
  *currently-reviewing* card began, a materially smaller claim than "every
  node in this tree that is some card's position." Flagging it only because
  it is the one reading of the original ask that is actually buildable
  within this dispatch's constraints; the maintainer's later adjudication
  explicitly foreclosed treating it as sufficient ("NO separate start-marker
  glyph" once the highlight subsumed it), so I did not build it unilaterally
  — surfacing it here for the re-adjudication to accept or reject.
- **(c) Batch endpoint first.** If (a) is chosen, the design doc's §5 flags
  a `POST /positions/hash-batch` as worth folding in alongside the
  viewport-driven fetch, to avoid single-node request bursts on fast
  scroll/expand — a backend dispatch that would need its own charter item.

## Gates run

None — no code was written. `git status` in the main checkout and no
worktree was created for this investigation (a worktree materializes when
there's a diff to isolate; this session produced none).

## Ledger disposition

- `card-start-marker` (wanted-feature 4): per the maintainer's own
  adjudication, this item is subsumed by `card-position-annotations` and
  should close as superseded, not delivered — the maintainer's message names
  this disposition explicitly ("card-start-marker will close superseded").
- `card-position-annotations` (wanted-feature 1, the live item): blocked on
  the re-adjudication above; not delivered this session. The blocking
  finding is this report in full — no further investigation should be
  needed to make the (a)/(b)/(c) call.

## Summary

Investigated the game-tree marker precedent (`TreeWidget.vue`'s
`game-head-ring`, sourced from zero-I/O in-store state) and the Stage A
card-position infrastructure (`known-positions.ts`, a `Map<ContentHash,
CardId>` with no `NodeId` correlation). Confirmed the maintainer's
subsumption claim is empirically true (one hash per card, matching exactly
its start node, no divergence found) but that this doesn't resolve the real
blocker: no `NodeId -> ContentHash` mapping exists in the SPA, and building
one requires a genuine per-node network round trip to the existing
`/positions/hash` endpoint, a new cache with its own invalidation model,
viewport-driven fetch orchestration in a perf-sensitive component, and (per
the feature's own ratified design doc) a Playwright witness this dispatch's
test constraints prohibit. This is the wire-change stop condition named in
the dispatch brief: the commission's "visual annotation only, similar to
match/play markers" premise does not hold once the actual data source is
established. No code shipped; no worktree created. Branch: none (report-only).

## Part 2 — the build (ledger row 524's re-adjudication)

Coordinator message (verbatim substance): the stop-finding above is
accepted in full; the subsumption ruling is reversed in the
implementation direction — the known-position highlight is Stage B,
commissioned separately per the ratified design doc — and this dispatch
now builds the zero-I/O start marker named as fallback option (b) above:
membership from `ReviewSessionData.startingNodeId`, rendered in the
match/play-marker family, reactive to a card loading/unloading in-session.
All original constraints stand (isolated worktree, no wire change, no
persistence, ADR-0010, tests at the marker-derivation logic tier, no
chromium, gates).

### Data source (confirmed, no new investigation needed)

`ReviewSessionData.startingNodeId: NodeId | null`
(`frontend/src/types/cards.ts:284`) — already resident on
`store.session.reviews[boardId]`, no schema change:

- Set by `useReviewSession.ts`'s `loadCard`, to the SGF's fast-forwarded
  mainline leaf (`targetLeafId`, `useReviewSession.ts:534-541`) — the
  position the loaded card's content ends at, i.e. where the card
  "starts" for review purposes.
- Cleared to `null` by `endSession` (`useReviewSession.ts:1080`).
- Already consumed once, for exactly this position: `rewindToStart`
  (`useReviewSession.ts:1087-1095`) navigates the board back to it — the
  UI already calls this position "start."
- Zero I/O, zero new cache, zero new invalidation model — the same shape
  as `TreeWidget`'s existing `gameHeadIds` (`board.games`, a synchronous
  in-store projection), just a single nullable `NodeId` instead of a
  `Set` (a board has at most one active review session).

### Marker idiom (matched to the game-head-ring precedent)

Precedent: `TreeWidget.vue`'s `game-head-ring`
(`frontend/src/components/tree/TreeWidget.vue:393` pre-change — the green
"play vs engine" head ring, `NODE_R + 5`, sourced from the `gameHeadIds`
prop). The new marker is a sibling ring in the same SVG layer, same
per-item `v-memo` shape, same theme-var-driven CSS, deliberately NOT a
fill-color change (ADR-0019 / C18 no-color-only) and NOT a new glyph
family:

- New prop `reviewStartNodeId?: NodeId | null` on `TreeWidget`
  (doc comment names the source and the zero-I/O contract).
- New `nodeList` item field `isReviewStart`, derived via
  `isReviewStartNode(id, props.reviewStartNodeId)` — extracted to
  `frontend/src/composables/forest/tree-review-marker.ts` rather than
  left inline (unlike `isGameHead`'s one-liner) specifically so it's a
  test-importable binding — `<script setup>` compiles into `setup()`
  and cannot export a named symbol a test file can import (the same
  "module-intent state in `<script setup>`" constraint
  `frontend/CLAUDE.md`'s footgun checklist names for a different case).
- Template: a second concentric ring, `NODE_R + 7` (one radius further
  out than the game-head ring's `NODE_R + 5`), class `review-start-ring`,
  `v-if="item.isReviewStart"`. The extra radius (rather than reusing
  `NODE_R + 5`) is deliberate: a node can in principle be both a game
  head and a review-start node at once (independent features, same
  board), and concentric rings degrade gracefully where a shared radius
  would have the two `<circle>` elements draw exactly on top of each
  other.
- Color: `var(--accent-secondary)` (`theme.css` — already documented in
  that file as "orange — SR / CTA / current-card", i.e. already the
  project's spaced-repetition accent color), distinct from
  `--state-success` (game-head ring) and `--accent-primary` (active-node
  cursor ring) — no collision with an existing marker's color band.
- `item.isReviewStart` added to the per-item `v-memo` key array, same
  discipline as `item.isGameHead` — a `Set`/nullable-id-only recompute
  patches just the affected node(s), not a whole-tree re-render
  (ADR-0010).

### Wiring

- `useReviewSession.ts`: new `startingNodeId` computed
  (`reviewData.value?.startingNodeId ?? null`), added to the composable's
  return object alongside `state`/`currentIndex` — same synchronous-
  projection shape, no new reactivity mechanism.
- `App.vue`: `:review-start-node-id="reviewSession.startingNodeId.value"`
  on the `<TreeWidget>` binding, mirroring the existing
  `matchControls.isRunning.value` nested-ref-unwrap pattern already in
  the same file (`App.vue:346`) — `reviewSession` is a plain object
  returned by the composable, not itself a ref, so its nested
  `ComputedRef` properties need an explicit `.value` in the template
  (Vue only auto-unwraps top-level setup bindings).

### Reactivity to card load/unload (the dispatch's explicit requirement)

Satisfied for free by the projection above, no extra wiring: `loadCard`
writes a fresh `startingNodeId` on every card load (queue advance) and
`endSession` clears it — both are ordinary `mutateReviewSession` writes
the `computed` already tracks, so the marker appears/disappears on
exactly those events with no separate watcher or invalidation hook,
mirroring how `gameHeadIds` already tracks `board.games` writes.

### Tests

- **Unit** (`tests/unit/composables/tree-review-marker.test.ts`, Tier 1,
  no test precedent existed for the game-head-ring's own derivation so
  this is new ground): 5 cases on `isReviewStartNode` — match, mismatch,
  `null` source, `undefined` source, and a "marks exactly one node across
  a set" case (a card has exactly one start).
- **Integration** (`tests/integration/useReviewSession.test.ts`, Tier 3,
  new `describe` block `useReviewSession.startingNodeId (tree-marker data
  source, ledger row 524)`, same fixtures/pattern as the file's existing
  `endSession`/`processUserMove` suites): null before any card loads;
  reflects a `mutateReviewSession`-written `startingNodeId`; clears back
  to `null` on `endSession` (the explicit "must disappear reactively"
  case); null when the board has no review row at all.
- No DOM/screenshot test, no chromium, no `waitForTimeout` — the pure
  derivation and its store-reactivity are both covered at the composable/
  logic tier, per the dispatch's test-tier instruction.

### Files touched (worktree `.claude/worktrees/card-start-marker`,
branch `bork/feat/card-start-marker`)

- `frontend/src/composables/forest/tree-review-marker.ts` (new) — pure
  `isReviewStartNode`.
- `frontend/src/composables/review/useReviewSession.ts` — `startingNodeId`
  computed + return-object entry.
- `frontend/src/components/tree/TreeWidget.vue` — `reviewStartNodeId`
  prop, `isReviewStart` derivation, marker ring + CSS, `v-memo` key.
- `frontend/src/App.vue` — prop wiring.
- `frontend/tests/unit/composables/tree-review-marker.test.ts` (new).
- `frontend/tests/integration/useReviewSession.test.ts` — new describe
  block.
- `frontend/FILES.md` — new-file entry for `tree-review-marker.ts`.
- `FEATURES.md` — one new bullet under "Review sessions" naming the
  marker as a user-facing capability.

### Gates (worktree, all WITNESSED)

- `npm run build` (`vue-tsc -b && vite build`): green,
  `✓ 1097 modules transformed`, `✓ built in 3.92s`. (Pre-existing >500kB
  chunk-size warning, unrelated to this change.)
- `npx eslint .`: exit 0, no output.
- `npm run test:run`: green — `Test Files 109 passed | 3 skipped (112)`,
  `Tests 1365 passed | 4 skipped (1369)`. The 3 skipped files / 4 skipped
  tests are pre-existing (unrelated to this change — the suite's baseline
  before this dispatch already carried them).

### Summary

Built the zero-I/O review-start marker per the re-adjudication: sourced
from `ReviewSessionData.startingNodeId` (already-resident store state, no
wire change, no schema change, no new cache), rendered as a sibling
concentric ring to `TreeWidget`'s existing game-head ring in the same
visual family and CSS-variable idiom, reactive to card load/session-end
via the same store-driven `computed` mechanism `gameHeadIds` already
uses. Extracted the one-line derivation into a small pure module purely
so it's independently unit-testable (a `<script setup>` constraint, not a
design change). Committed on `bork/feat/card-start-marker`
(`6726b75c`) in the isolated worktree at
`.claude/worktrees/card-start-marker`; no push. All three gates green.
