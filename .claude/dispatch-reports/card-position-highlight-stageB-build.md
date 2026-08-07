# Build: card-position known-position highlight in the game tree (Stage B)

Status: shipped on branch `bork/feat/card-position-highlight-stageb`
(worktree `.claude/worktrees/card-position-highlight-stageb`), not
merged. Commits: `d8018686` (backend), `64ea410b` (frontend),
`5b37a050` (a fix the live witness found). Implements Stage B of
`.claude/dispatch-reports/card-position-annotations-design.md` per
ledger commission row 525 (rows 510/524 upstream) — every node in the
game-tree viewer whose normalized position already exists as one of
the caller's cards is highlighted, so the user never has to open the
mint modal to discover a duplicate.

Author read end-to-end before building: the ratified design doc in
full, `card-hash-stageA-build.md`, `card-start-marker-build.md` (the
stop-finding that re-scoped this work — ledger row 524's adjudication),
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, `backend/CLAUDE.md`,
and the source of every file directly touched or mirrored
(`TreeWidget.vue`, `thumbnail-render-resources.ts`,
`known-positions.ts`, `useKnownPositions.ts`, `usePlayVsEngine.ts`,
`sgf-writer.ts`, `positions.py` route+schema, `domain/errors.py`,
`core/config.py`, `library.py`'s batch-cap precedent). Disclosed gap:
did not re-read every portable ADR in `law/adr/` in full this session
(ADR-0003, 0007, 0009, 0010, 0019 were read/consulted previously in
this same lineage of work per the dispatch reports above and applied
by extrapolation here) — flagging per the umbrella CLAUDE.md's own
disclosure discipline rather than silently claiming a fresh full
re-read that didn't happen.

## Option space vs. the design doc

The design's §4/§6 left two things underspecified, both resolved
during the antecedent audit (ledger rows 534-536) before building, and
one further revised during implementation:

1. **Batch cap and error shape.** No numeric cap was named. Modeled
   directly on `library.py`'s `POST /library/games/import` batch-cap
   precedent (`BatchTooLargeError` → 413 with a structured
   `{kind, detail, received, maximum}` body) rather than inventing a
   new shape: a new `PositionHashBatchTooLargeError` (same
   `ResourceLimitError` axis) and `config.POSITIONS_HASH_BATCH_MAX =
   200` (row 534). Malformed content inside a batch is a
   whole-batch 422 (naming the first-failing index), not a per-item
   partial result — matches the single-endpoint's 422 contract and
   avoids an ambiguous "which indices succeeded" response shape.
2. **Debounce interval.** 150ms (row 535) — no existing constant in
   the codebase covers this exact case; chosen as an ordinary
   UI-debounce order of magnitude.
3. **Marker glyph.** The antecedent-audit assumption (row 536) named
   a solid ring + a floating dot at `NODE_R+7`. **Revised during
   implementation** (row 581) to a single **dashed** ring at
   `NODE_R+7` — a fixed-offset dot doesn't reposition correctly across
   the vertical/horizontal orientation toggle and risks colliding with
   edges/siblings; a dashed ring keeps the single-element simplicity
   of the existing ring family (active-ring, game-head-ring) while
   staying shape-distinct under C18 (no-color-only).

One deliberate deviation from the design doc's suggestion: §6 flagged
"budget for extracting the marker into a small child component" given
TreeWidget's size. **Not done** — the marker follows the *exact*
`gameHeadIds`/`game-head-ring` precedent (a prop + one nodeList field +
one v-memo key + one `<circle v-if>`), which is a ~15-line addition,
not new template/script mass proportional to a child-component
extraction. TreeWidget grew from 430 to ~475 lines; still worth a
contraction pass eventually (per `card-hash-stageA-build.md`'s
existing "known gaps" note about `MintCardModal.vue`), but this
specific addition earns extraction less than the two composables that
own the actual logic already do (ADR-0004 minimal-touch).

## Backend: batch hash surface

`POST /positions/hash-batch` (`backend/api/routes/positions.py`,
`backend/schemas/positions.py`) — sibling of Stage A's
`POST /positions/hash`. Request `{raw_contents: string[]}` (min 1
item), response `{content_hashes: string[]}`, index-aligned. Calls
`PositionNormalizerPort.normalize()` per item — the identical code path
the single endpoint and `CardService.create_card` use, so batch hashes
are byte-for-byte equal to what the single endpoint or a mint would
produce (verified by
`test_hash_position_batch_happy_path_matches_single_endpoint`).
Tenancy-agnostic (ADR-0003 Band 1) — same classification Stage A gave
the single endpoint; the batch route still depends on
`get_current_user_id` for auth-surface consistency, `user_id` unused
beyond the dependency, same as the single endpoint.

**OpenAPI diff:** two new schemas (`PositionHashBatchRequest`,
`PositionHashBatchResponse`) and one new path
(`POST /positions/hash-batch`) — regenerated `frontend/src/types/
backend.ts` via `npm run gen:api` against my own scratch backend
(port 19764); no existing schema changed. No DB schema change (as
expected — `content_hash` already existed from Stage A).

**Tests** (`backend/tests/integration/routes/test_positions_routes.py`,
11 total, 6 new): failure-first — `test_hash_position_batch_over_cap_
returns_413`, `test_hash_position_batch_empty_list_returns_422`,
`test_hash_position_batch_malformed_item_returns_422`,
`test_hash_position_batch_without_bearer_returns_401` — then happy
path — `test_hash_position_batch_happy_path_matches_single_endpoint`,
`test_hash_position_batch_single_item`.

## Frontend: cache lifecycle + composition

- **`src/state/node-position-hashes.ts`** (new) — reactive
  `Ref<Map<NodeId, ContentHash>>`, mirrors
  `thumbnail-render-resources.ts`'s invalidation shape exactly:
  `purgeBoardNodeHashes(boardId)` (board-close, walks `board.nodes`)
  and `purgeAllNodeHashes()` (identity-flip). Both registered in
  `store/teardown-registrations.ts`'s bootstrap import list (labels
  `node-position-hashes:purge-board` / `node-position-hashes`) — the
  self-import spy-interception trick `known-positions.ts` uses is
  reused here too (needed for the `auth-lifecycle.test.ts` drain-on-401
  pin's `vi.spyOn` to actually intercept the module's own internal
  calls).
- **`src/composables/cards/useNodePositionHashes.ts`** (new) — the
  fill orchestration: `requestHashFill(nodeIds, boardState)`, debounced
  150ms, deduped against both the cache and the in-flight pending set.
  On failure (network error OR a `serializeActivePath` throw — a
  stale-NodeId race is caught the same way, not left as an unhandled
  rejection), nothing is cached and exactly one `pushSystemMessage`
  notice fires per failure *episode* (a later successful flush resets
  the throttle).
- **`src/composables/board/useKnownPositionNodes.ts`** (new) —
  `activeBoardKnownPositionNodeIds`, the `cache ∩ known-positions` Set,
  computed at the composition layer exactly like
  `usePlayVsEngine.activeBoardGameHeadIds` — no network I/O in the
  computed itself, just a Map-lookup intersection over
  `Object.keys(activeBoard.value.nodes)`.
- **`TreeWidget.vue`** — new `knownPositionNodeIds` prop; `nodeList`
  gains an `isKnownPosition` field (same shape as `isGameHead`); a
  `watch(nodeList, ..., { immediate: true })` triggers
  `requestHashFill` with the *already viewport-bounded* node-id set
  (collapsed variations never appear in `nodeList` — no eager
  whole-tree hashing); the marker itself is a `v-if="item.isKnownPosition"`
  circle in the existing per-item `v-memo`'d `v-for`, off the render
  path per ADR-0010 (same discipline the active-ring/game-head-ring
  comments already document).
- **`App.vue`** wires `useKnownPositionNodes()` and passes
  `:known-position-node-ids="activeBoardKnownPositionNodeIds"`.

## Live witness — a real bug found and fixed

Ran Playwright (playwright-core, `/usr/bin/chromium`, `nice -n 19`)
against my own served build (`vite preview`, port 19173) and my own
scratch backend (`uvicorn`, sqlite scratch DB, port 19764) — both
processes killed in a `finally`, no live ports touched. Viewport
1920×1080, condition-based waits only (`waitForSelector`, no
`waitForTimeout` calls — ledger row 450's prohibition).

**First run: FAILED.** The marker never appeared on a fresh board's
root node even though the batch-hash call succeeded (verified via a
`requestfinished` network listener). Root cause, found by a temporary
debug log then removed: `watch(nodeList, ...)` in `TreeWidget.vue` had
no `{ immediate: true }` — Vue's `watch()` fires only on a *subsequent*
change, not the watched source's first-ever computed value, so a fresh
board's lone root node (nodeList's very first value) never triggered
`requestHashFill`. Fixed by adding `immediate: true` (matching the
existing precedent on this same component's `currentNodeId` watch);
committed separately (`5b37a050`) so the fix the witness found is
visible as its own commit, not folded silently into the feature
commit.

**Second run: PASSED**, end to end, driving the actual production mint
flow (not an API-seeded shortcut for the card):

```
[witness] seeded username=stageb_witness_1786041421215
[net] POST http://127.0.0.1:19764/positions/hash-batch -> 200
[witness] SPA booted authenticated
[witness] TreeWidget rendered
[witness] known-position-ring count BEFORE mint: 0
[net] POST http://127.0.0.1:19764/positions/hash -> 200
[witness] mint modal opened
[net] POST http://127.0.0.1:19764/positions/hash -> 200
[witness] mint submitted, modal closed
[witness] PASS: known-position-ring rendered on the root node
[witness] known-position-ring count=1, total node-circle count=1
[witness] ring center offset from node center: dx=0.00 dy=0.00
[witness] screenshot saved: stageb-witness-01-marker.png
[witness] ALL CHECKS PASSED
```

Scenario: register a fresh user via the backend API only (no card
seeded via API — the card comes from driving the real UI); boot the
SPA pre-authenticated (localStorage token, same keys `api-client.ts`
uses — a deliberate scope choice, since the login *form* isn't what
Stage B touches, while the real app boot and TreeWidget render are);
assert zero markers before any card exists; click the real "MINT CARD"
toolbar button, fill the mint modal, submit; assert the modal closes
and the known-position ring then renders, centred exactly on the
node it marks (`dx=0.00 dy=0.00`), with no extra `/positions/
hash-batch` call needed (the fill from mount already cached the root's
hash — only `known-positions` gained the new entry). Screenshot at
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/stageb-witness-01-marker.png`
(scratchpad, not committed — ephemeral evidence; the transcript above
is the durable record).

## Tests (red-then-green)

**Backend** — see above (11 route tests, full suite 714 passed / 2
skipped / 1 xfailed).

**Frontend** (all new, `frontend/tests/integration/`):

- `node-position-hashes.test.ts` — cache/read round-trip, reactive
  `computed` fill (mirrors the thumbnail-cache reactivity pin),
  `purgeBoardNodeHashes` (audit-pair-O4 shape, drops board-owned/keeps
  foreign), `purgeAllNodeHashes` (audit-pair-O9 shape).
- `useNodePositionHashes.test.ts` — debounce/coalesce (N calls in one
  window → 1 batch call), cache-dedup (no redundant request), failure
  honesty (nothing cached, exactly one notice per failure episode,
  throttle resets after a recovery) — fake timers, `fakeBackendService`.
- `useKnownPositionNodes.test.ts` — the Set derivation: known+cached →
  included, cached-but-unknown → excluded, uncached → excluded (not
  "known-false"), reactive to a later fill / a mint / a purge, `undefined`
  with no active board.
- `mint-to-known-position-highlight.test.ts` — the commission's named
  acceptance handle at the composable layer (component-level DOM tests
  are out of scope per `frontend/tests/CLAUDE.md`; the Playwright
  witness above covers the actual rendered marker): a node hashed
  before any card exists is excluded, then included once `commitMint`
  lands, with zero additional hash-batch calls; a `known-positions`
  purge removes the highlight without reload.
- Updated `teardown-registry-completeness.test.ts` (both label-set
  pins) and `auth-lifecycle.test.ts` (the registry-derived drain-on-401
  pin) for the two new teardown labels.

No render-count regression guard was added for the new marker
specifically — the existing `TreeWidget.render-count.test.ts` guard
(if unmodified) continues to police the render-locality invariant for
the whole component; the new marker follows the identical `v-memo`/
prop-driven shape `isGameHead` already uses, which that guard already
covers structurally. (Flagging this as a Known gap rather than
silently omitting it — a dedicated positive-control assertion that
`isKnownPosition`-only changes trigger exactly the expected per-item
re-render, mirroring the file's existing `isGameHead` case if one
exists, was not separately added this session.)

## Gates

- Backend: `cd backend && ./venv/bin/python -m pytest tests/ -q` →
  `714 passed, 2 skipped, 1 xfailed` — **WITNESSED**.
- Frontend build: `npm run build` (`vue-tsc -b && vite build`) →
  clean, pre-existing >500kB chunk-size warning only — **WITNESSED**.
- Frontend eslint: `npx eslint .` → exit 0, no output — **WITNESSED**.
- Frontend test:run: `npm run test:run` → `112 files (3 skipped) /
  1376 passed, 4 skipped` — **WITNESSED**.
- Live Playwright witness: **WITNESSED** (transcript + screenshot
  above; first run REFUSED-AS-EXPECTED in the sense that it correctly
  caught a real bug rather than passing on a broken build).

## Per-claim status

- Batch endpoint hashes match the single endpoint byte-for-byte:
  **WITNESSED** (backend test + the live witness's mint-then-highlight
  round trip both exercise this transitively).
- Cache purge-on-board-close / identity-flip wiring: **WITNESSED**
  (unit tests direct; `teardown-registry-completeness.test.ts` +
  `auth-lifecycle.test.ts` pin the production registration).
- Viewport-bounded fill (no eager whole-tree hashing): **WITNESSED**
  by construction (the fill reads `nodeList`, which `useTreeLayout` +
  `useTreeExpansion` already bound to laid-out nodes) — **UNEXERCISED**
  at the "250+ node tree, verify request count stays bounded" scale
  specifically; the design's §5 cost analysis was not re-validated
  empirically against a large tree this session.
- Failure-honesty (absent highlight, one notice, no stale/partial
  cache): **WITNESSED** (dedicated composable tests).
- Mint → highlight appears, no reload: **WITNESSED** twice — the
  composable-layer integration test and the full-browser live witness.
- Marker visually distinct from active-ring/game-head-ring, C18
  no-color-only: **WITNESSED** visually (screenshot) — not
  independently checked against a contrast/shape-distinctness
  automated gate (none exists for this marker family today).
- Render-cost guard confirming zero added per-render hashing cost
  (the design's §6 acceptance handle: "nav back-and-forth over the
  same nodes triggers zero additional `/positions/hash` calls"):
  **UNEXERCISED** — not directly measured this session (the debounce +
  cache-dedup design makes this true by construction and is covered
  indirectly by `useNodePositionHashes.test.ts`'s cache-dedup test, but
  no dedicated TreeWidget-level render-count/network-count regression
  guard was authored for repeated nav specifically).

## Known gaps / deferred (disclosed, not silently dropped)

- No dedicated render-count regression guard for the new marker
  specifically (see above).
- No large-tree (250+ node) empirical request-count measurement.
- `TreeWidget.vue` grew to ~475 lines (from 430), still not extracted
  into a child component — deliberate, see "Option space" above, but
  worth folding into a future contraction pass alongside
  `MintCardModal.vue`'s existing over-budget note.
- Branch is unmerged; the four Stage B ledger work items
  (`stageb-backend-hash-batch`, `stageb-frontend-node-cache`,
  `stageb-treewidget-marker`, `stageb-tests`) could not be formally
  `led work close`d — the kernel's witness-reachability check refuses
  a commit witness not reachable from the main checkout's own HEAD.
  Recorded as ledger rows 567/598/599 (decision entries carrying the
  same evidence this report does) rather than left silently open.

## Ledger trail

Commission row 525; decomposition rows 526-529 (four work items,
`blocks-close` dependency chain 530-532); reviewer countersign rows
537-540 (disclosed self-review, solo-world posture per CLAUDE.md point
3); antecedent-audit assumption rows 534-536 (batch cap, debounce
interval, marker shape — row 536 later revised by row 581); acceptance
criteria row 545; per-file pre-edit ledger rows throughout the build;
the live-witness bug-and-fix decision row 597; deferred-close decisions
rows 567/598; stopping decision row 599.

## Files touched

**Backend:** `api/routes/positions.py`, `core/config.py`,
`domain/errors.py`, `schemas/positions.py`,
`tests/integration/routes/test_positions_routes.py`.

**Frontend:** `src/App.vue`, `src/components/tree/TreeWidget.vue`,
`src/composables/board/useKnownPositionNodes.ts` (new),
`src/composables/cards/useNodePositionHashes.ts` (new),
`src/locales/en.json`, `src/services/backend-service.ts`,
`src/state/node-position-hashes.ts` (new),
`src/store/teardown-registrations.ts`, `src/types/backend.ts`
(regenerated), `FILES.md`, `IDENTIFIERS.md`,
`tests/fakes/backend-service.ts`,
`tests/integration/auth-lifecycle.test.ts`,
`tests/integration/mint-to-known-position-highlight.test.ts` (new),
`tests/integration/node-position-hashes.test.ts` (new),
`tests/integration/teardown-registry-completeness.test.ts`,
`tests/integration/useKnownPositionNodes.test.ts` (new),
`tests/integration/useNodePositionHashes.test.ts` (new).

License: Public Domain (The Unlicense) — matches the rest of the tree.

## Summary

Stage B ships: every game-tree node whose normalized position already
exists as one of the user's cards now renders a dashed highlight ring,
filled lazily via a new batched backend endpoint and a viewport-bounded
frontend cache, reactive to new mints with no reload. A real bug —
the highlight silently never appearing on first load — was found by
the live Playwright witness (not by code review or unit tests, none of
which exercise Vue's `watch()` immediate-vs-not semantics the way a
real mount does) and fixed in its own commit. All backend and frontend
gates are green; the live witness passes against a from-scratch
backend + served build on isolated ports.

Branch head (pre-repair): `5b37a050` on
`bork/feat/card-position-highlight-stageb`.

Gates (pre-repair): backend pytest 714 passed/2 skipped/1 xfailed;
frontend build + eslint + test:run (1376 passed/4 skipped) all green;
live Playwright witness PASSED (transcript above).

---

## Repairs (post-review)

Coordinator returned a **REJECT** verdict
(`.claude/dispatch-reports/card-position-highlight-stageB-review.md`)
with two blocking findings, both independently reproduced by the
reviewer. Both are fixed below; this section is appended rather than
edited into the body above so the original build's own claims stay
legible as originally made, per-claim, alongside what changed.

### Finding 1 — cross-board debounce race (repaired, commit `a1fa5fe4`)

**The defect:** `useNodePositionHashes()` is instantiated once in
`TreeWidget.vue`'s `setup()`; `TreeWidget` stays mounted across a
board-tab switch (`App.vue`'s `v-if="activeBoard"` stays truthy). The
composable's `pending`/`latestState` were flat, not board-scoped — a
board switch inside the 150ms debounce window merged both boards'
NodeIds into the same `pending` Set, and `latestState` became
whichever board's `requestHashFill` call landed last. The flush's
`serializeActivePath(latestState, id)` then threw for the OTHER
board's NodeIds (absent from `latestState.nodes`), which failed the
**whole** batch call before `hashPositionsBatch` was even invoked —
silently dropping highlights for the board the user was **currently
viewing**, not just the stale one.

**The fix:** every piece of per-flush state
(`pending: Set<NodeId>`, `timer`, `notifiedThisEpisode`) is now keyed
by `BoardId` in a `perBoard: Map<BoardId, PerBoardFillState>`, so two
boards requested within the same debounce window get independent
timers and independent flushes — one board's request set can no
longer bleed into another's, regardless of switch timing.

**Red-then-green:** ported the reviewer's repro shape as two new tests
in `useNodePositionHashes.test.ts` (`describe('useNodePositionHashes —
cross-board isolation (review finding 1)')`):
confirmed **red** against the pre-fix flat-state code (both new tests
failed — one board's cache entry stayed `undefined`, the other test's
call-count assertion saw zero calls because the merged flush threw
before ever calling `hashPositionsBatch`), then **green** after the
fix (6/6 tests in the file pass, including the two new ones).

**Disclosed, not fixed:** the new `perBoard` Map has no board-close
eviction — it accumulates one small entry per distinct `BoardId` ever
passed to `requestHashFill`, for the composable's app-session
lifetime. Bounded by "how many boards this session ever opened," not
by tree/node size. Documented in the composable's own header (the
umbrella CLAUDE.md's resource-ownership checklist's "document"
disposition) as a separable improvement, out of scope for this
finding (a correctness race, not a leak).

### Finding 2 — ring collision at merge point (repaired, commit `beee7215`)

**The defect:** this branch was cut before `next` landed
`review-start-ring` (the card-start-marker feature, ledger row 524's
other half). Both `known-position-ring` and `review-start-ring` were
independently authored at the identical radius (`NODE_R + 7`) and
identical color (`var(--accent-secondary)`) — a node that is both a
review session's starting position and an already-owned card position
(an ordinary overlap, not an edge case) rendered the solid
`review-start-ring` directly on top of the dashed
`known-position-ring`, fully occluding it.

**The fix:** merged current `next` into this branch
(`git merge --no-ff next`, three conflicts —
`frontend/FILES.md` and `frontend/src/App.vue` were trivial
alphabetical/prop-line interleaves; `frontend/src/components/tree/
TreeWidget.vue` combined both features' additive script/template
hunks). While resolving the `TreeWidget.vue` conflict,
`known-position-ring` was moved out to `NODE_R + 9` — one radius past
`review-start-ring` — keeping its dashed stroke pattern, per the
reviewer's own validated trial-merge fix. The four-ring concentric
stack is now: active (+3), game-head (+5), review-start (+7),
known-position (+9). Both markers' template comments were updated to
record the collision and point at each other's resolution, so a
future reader of either ring's code sees the full context without
having to reconstruct it from the git log.

No other conflicts (`backend/domain/errors.py` and
`frontend/src/locales/en.json` auto-merged cleanly — the batch-hash
error-class enum entry and the one new locale key both landed as
additive, non-overlapping hunks against `next`'s own independent
additions there).

**Style rule (ledger row 609, `--surface-0` background for controls):**
checked the branch's full diff against `next`'s merge-base for any
`border-2`/`surface-2` used as a background; none found — the
`known-position-ring` marker (`fill: none`) and every other Stage B
addition don't touch backgrounds at all, so no normalization was
needed here. `TreeWidget.vue`'s own pre-existing
`.tree-widget-wrapper { background: var(--surface-2); }` and
`.toggle-box { fill: var(--surface-2); ...}` rules predate this branch
and are unrelated to anything Stage B added — left untouched as
out-of-scope for this repair (a pre-existing pattern, not something
this branch introduced or is responsible for normalizing).

### Post-merge gates (all re-run, all green)

- **Backend** (`cd backend && ./venv/bin/python -m pytest tests/ -q`):
  `725 passed, 2 skipped, 1 xfailed` — **matches the reviewer's own
  trial-merge number exactly**.
- **Frontend typecheck** (`npx vue-tsc -b`): clean.
- **Frontend build** (`npm run build`): clean, same pre-existing
  >500kB chunk-size warning only.
- **Frontend eslint** (`npx eslint .`): exit 0, no output.
- **Frontend test:run** (`npm run test:run`): `121 files (3 skipped) /
  1533 passed, 4 skipped`.
- **Live Playwright witness, re-run against the merged tree** (fresh
  scratch backend on port 19765, fresh served build on port 19174,
  same script, same conditions — no `waitForTimeout`): **PASSED**,
  identical shape to the pre-repair run (mint → `known-position-ring`
  renders, centred `dx=0.00 dy=0.00` on the root node). Confirms the
  `NODE_R + 9` radius bump didn't regress the single-marker case (the
  two-ring simultaneous-overlap scenario itself — a node that is both
  a review-start AND a known-position — was not separately
  reconstructed in this witness run; the reviewer's own trial-merge
  already exercised and validated that exact visual, and the radius
  fix applied here is textually identical to what they validated).

### Branch head (post-repair)

`beee7215` on `bork/feat/card-position-highlight-stageb`
(`a1fa5fe4` finding-1 fix → `beee7215` merge-with-finding-2-fix,
both stacked on the original `5b37a050`).

### Per-claim status, updated

- Failure-honesty (absent highlight, one notice), cross-board case:
  **now WITNESSED** (was PARTIALLY REFUTED) — the two new tests in
  `useNodePositionHashes.test.ts` directly cover the reviewer's
  repro shape.
- Marker visually distinct, C18 no-color-only: **now WITNESSED**
  (was REFUTED in the merged state) — radius bump resolves the
  collision; re-verified on the merged tree via the live witness
  (single-marker case) and via the reviewer's own trial-merge
  validation (two-marker overlap case, textually identical fix
  applied here).
- Everything else from the original per-claim table is unchanged by
  this repair.

## Repairs round 2 (eviction gap — re-review REJECT, third defect)

The re-review
(`.claude/dispatch-reports/card-position-highlight-stageB-rereview.md`)
ACCEPTed both repaired findings above but REJECTed again on a defect
it found while probing the disclosed gap in round 1's repair: round
1's docstring framed `perBoard` (the per-board debounce/timer map in
`useNodePositionHashes.ts`) as a bounded memory accumulation, deferred
rather than fixed. The re-reviewer's own witnessed probe showed it was
worse — a **stale-write race that resurrects a purged cache entry
after `closeBoard` has already run**, not merely unused bytes.

### The defect

`closeBoard` does not clear `board.nodes` before splicing the board
out of `store.boards` — it only removes the board from the array. A
`setTimeout` pending inside `useNodePositionHashes.ts`'s 150ms
debounce window at close time closes over the detached-but-intact
`BoardState` object. Nothing cancelled that timer, so it fired later,
`serializeActivePath` and `hashPositionsBatch` both succeeded against
the still-intact `.nodes`, and `cacheNodeHash` wrote the result back
into `node-position-hashes.ts`'s shared cache for a NodeId belonging
to an already-closed, already-purged board — undoing
`purgeBoardNodeHashes`'s own contract. `perBoard` was a second,
board-keyed store with no `registerBoardCloseHandler` registration,
invisible to the board-completeness census
(`teardown-registry-completeness.test.ts`) precisely because it never
registered anything.

### The fix

`src/composables/cards/useNodePositionHashes.ts`:

- `perBoard` moved from per-`useNodePositionHashes()`-call scope to
  module scope. Required so a single `registerBoardCloseHandler` call
  (at module init, mirroring `state/node-position-hashes.ts`'s own
  registration) suffices — a handler registered inside the composable
  body would re-register on every call (every `TreeWidget` mount, and
  every bare test-file call in the integration suite), which the
  board-completeness census would catch as duplicate labels.
- New board-close handler, label `node-position-hash-fill:cancel-pending`,
  DEFAULT `TeardownOrder` band (order-independent — it only touches
  this module's own fill-state map): cancels the closing board's
  pending timer (`clearTimeout`, a no-op if none is scheduled) and
  deletes its `perBoard` entry.
- `flush()`'s landing path (both the success and failure branches, post-
  `await`) now checks `perBoard.has(state.id)` before writing anything
  — the async-landing half of the fix the re-review specifically named:
  a `clearTimeout` alone cannot reach a fetch already past its `await`
  when the board closes mid-flight, so the continuation must itself
  notice the board is gone and discard the result rather than caching a
  stale entry or pushing a failure notice for a board the user already
  left.

`src/store/teardown-registrations.ts`: added an explicit
`import '../composables/cards/useNodePositionHashes';` — the composable
module is not transitively loaded by the existing
`import '../state/node-position-hashes';` (the composable imports the
state module, not the reverse), so without this the new handler would
never register in production.

`tests/integration/teardown-registry-completeness.test.ts`: extended
the board-close expected label set with
`'node-position-hash-fill:cancel-pending'` (appended after
`'node-position-hashes:purge-board'`, matching registration order).

`tests/integration/useNodePositionHashes.test.ts`: new describe block
`'useNodePositionHashes — eviction on board close (re-review REJECT,
eviction gap)'`, two tests ported from the re-reviewer's own probe:

1. Orphaned-timer case: `requestHashFill` inside the debounce window,
   `closeBoard` mid-window, then `vi.advanceTimersByTimeAsync(150)`.
   Asserts `hashPositionsBatch` is never called (the timer was
   cancelled) and the cache stays purged.
2. In-flight-fetch case: `requestHashFill`, advance timers to let the
   debounce fire and `flush()` start awaiting a deliberately-unresolved
   `hashPositionsBatch` mock, `closeBoard` while the fetch is still
   outstanding, then resolve the fetch and `flushPromises()`. Asserts
   the cache stays purged — the landing guard discarded the late result.

### Red-then-green (witnessed)

Reverted just the two source files
(`useNodePositionHashes.ts`, `teardown-registrations.ts`) to their
pre-repair (`beee7215`) content via `git checkout --`, keeping the new
tests, and re-ran the targeted suites:

```
useNodePositionHashes.test.ts (8 tests | 2 failed)
  × cancels the pending debounce timer on close, ...
    AssertionError: expected "vi.fn()" to not be called at all,
    but actually been called 1 times
  × discards an in-flight fetch's result for a board that closed
    while the fetch was outstanding (in-flight variant)
    AssertionError: expected 'aaaa...' to be undefined

teardown-registry-completeness.test.ts (4 tests | 1 failed)
  × every resource owner registers its board-close handler, in run order
    - 'node-position-hash-fill:cancel-pending' (missing from received)
```

All three failures reproduce exactly the defect described: the
orphaned timer fires and resurrects the cache entry, the in-flight
fetch lands and caches a stale value, and the new handler is absent
from the census. Restored the fix (copied the two files back from a
scratch copy taken before the revert); re-ran the same two suites —
`12 passed (12)`, `2 files passed`. `git status --short` clean
afterward (only the two intended source files touched, no stray diff).

### Gates (this session, worktree HEAD)

- **Frontend build** (`npm run build`): clean, same pre-existing
  >500kB chunk-size warning only.
- **Frontend eslint** (`npx eslint .`): exit 0, no output.
- **Frontend test:run** (`npm run test:run`): `121 files (3 skipped) /
  1535 passed, 4 skipped` — up from `1533 passed` (the two new
  regression tests), no other change.
- Backend not touched by this repair (no backend files in the diff);
  not re-run.

### Branch head (post-repair round 2)

`ae646328` on `bork/feat/card-position-highlight-stageb`, stacked on
`beee7215` (the round-1 repair + finding-2 merge, itself on `a1fa5fe4`
→ `5b37a050`).

### Per-claim status, updated

- Eviction gap (re-review §3, stale-write race resurrecting a purged
  cache entry): **now WITNESSED fixed** (was REJECT-worthy,
  undisclosed-as-a-race) — the board-close handler cancels the pending
  timer and drops the `perBoard` entry; the `flush()` landing guard
  additionally discards an in-flight fetch's result for a closed
  board. Both paths covered by ported regression tests, red-then-green
  verified against the pre-fix code in this session.
- Everything else from the original and round-1 per-claim tables is
  unchanged by this repair.
