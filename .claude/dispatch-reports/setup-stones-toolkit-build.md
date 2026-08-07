# Setup toolkit build report

Branch: `bork/feat/setup-stones-toolkit`, isolated worktree at
`/tmp/omega-setup-stones-toolkit` (never touched the main checkout or
any live port). Head commit at initial delivery: `a90ecee9`. **Updated
after review** — see "Review nit fixes" at the end; final head:
`fc5e1b44`.

Commission: ledger rows 603/604 — a click-toggled setup-mode toolbar
palette (BLACK/WHITE setup stone, TRIANGLE mark), genre per ADR-0019
(q5go/cgoban/Sabaki lineage). Maintainer's explicit scope ruling: full
enough to show intent, not a complete editor — no eraser/square/
circle/label, no drag-painting, no full edit mode.

## Survey findings (read before any code was written)

**`applySetup` already existed, caller-less at HEAD.** `src/logic.ts`
carried a fully-built `applySetup(state, x, y, color)` — toggle AB/AW/
AE on the current node, update the `NodeDelta.setupOverwritten`
projection for navigate-away/back — with a doc comment explicitly
naming the caller obligation ("a future setup-edit mode... must
invalidate the edited node and its descendants") and zero call sites
anywhere in the codebase (confirmed by grep; also independently noted
in `src/composables/cards/thumbnail-render-resources.ts`'s own header
as "THE `applySetup` HOOK — caller-less at HEAD by design"). This
commission is that caller.

**AB/AW/AE support in the loader/navigator was already complete and
correct**, including MID-TREE setup (not just root/handicap):
- `sgf-loader.ts`'s `hydrate()` walk applies `AB`/`AW`/`AE` at every
  node, root or not, before the node's own move (if any) is validated
  — a setup stone never runs through `validateMove`, matching "no
  capture logic runs on placement."
- `navigator.ts::navigateTo` replays `node.delta.setupOverwritten`
  forward and backward on every navigation step, so setup stones
  project correctly regardless of where in the tree they were placed.
- A setup stone is a real entry in `state.stones`, so `applyGoMove`'s
  capture logic (which operates uniformly over `state.stones`) can and
  does capture it via a later MOVE — verified by a new test
  (`tests/unit/logic-setup.test.ts`, "places a setup stone that a
  SUBSEQUENT MOVE can capture").
- `sgf-writer.ts::serializeSubtree` dumps `node.properties` verbatim,
  so AB/AW/TR round-trip with **zero writer changes needed** — the
  writer was already correct for any property the loader (or
  `applySetup`/`applyMarkup`) puts in `node.properties`.

**TR (triangle) had zero prior support anywhere** — no loader-side
interpretation (it flows through as an opaque property already, since
the loader keeps the whole raw property bag), no navigator projection
needed (SGF markup has no carry-forward to child nodes, unlike AB/AW),
and no renderer. This commission adds `applyMarkup` (the write side)
and `BoardDisplay.vue` triangle rendering (the read side); no loader
change was needed since unrecognized properties already pass through.

**Load-bearing finding — the analysis-query representation for
mid-tree setup positions is WRONG, but pre-existing and out of this
commission's scope, not introduced or worsened by this work.**
`getInitialStones` (`src/engine/util.ts`) explicitly documents: *"Mid-
tree setup (AB/AW/AE on non-root nodes) is out of scope — KataGo's
analysis engine doesn't model setup operations after the first
move."* Tracing the query path confirms this is real: `analyzeRange`'s
`buildMovesAndTurnIndex` only collects `node.move` along the analyzed
path — a setup-only node (AB/AW with no move) contributes nothing to
the wire `moves` array, silently dropping it from what KataGo
analyzes, exactly like any other moveless node (a comment-only node
has the identical gap). Root-level setup (handicap) is unaffected —
`getInitialStones` reads root AB/AW correctly and sends them as
`initialStones`, the wire-protocol-correct channel. **This is a
pre-existing, already-self-documented KataGo protocol limitation, not
a regression this build introduces**: SGF files with mid-tree AB/AW
already existed in the wild before this commission and already hit
this same gap when analyzed; wiring UI access to `applySetup` at any
node doesn't make the analysis "more wrong" than a hand-authored SGF
with the same shape already was. A real fix would require either (a)
KataGo protocol support for mid-sequence setup (not available — the
protocol has no such primitive) or (b) client-side query
re-basing (treating the setup node as a fresh `initialStones` root and
re-deriving `moves` from there, which changes turn/move-count
semantics review-scoring and other move-numbered analysis consumers
depend on) — both snowball well past a skeleton UI commission.
**STOPPED here, per the commission's own escape clause**; reported
honestly rather than silently shipped-wrong or silently "fixed" with a
scope-inflating change. Named as a future seam.

## What was built

**Data layer** (`src/logic.ts`):
- `applySetup` — **fixed a real toggle-semantics bug found while
  writing the first test for it**: the pre-existing body read the
  requested `color` independently at the property-update step and the
  board-projection step, with no toggle test at either — a same-color
  re-click cleared the property then immediately re-added the
  identical value, so two clicks looked like one and there was no way
  to remove a placed stone. Fixed by deriving a single
  `effectiveColor` (null when the point already projects the
  requested color) that both steps now read, closing the class rather
  than patching the symptom (ADR-0000 Rule 2). WITNESSED by
  `tests/unit/logic-setup.test.ts`'s toggle tests, red before the fix
  (`git stash` reproduction), green after.
- `applyMarkup(state, x, y, 'TR')` — new. Toggles a `TR` coordinate on
  the current node only; touches nothing else (`state.stones`, ko,
  captures) since SGF markup has no board-state carry-forward. Typed
  over `SetupMarkupKey = 'TR'` — the seam a future `SQ`/`CR`/`LB` tool
  widens.
- `src/engine/util.ts::collectSubtreeIds` — new. BFS subtree walk,
  used only for the setup-stone thumbnail-invalidation obligation
  (setup stones project forward to every descendant's cached replay;
  triangle marks don't, so `applyMarkup`'s call site invalidates only
  the one node it touched).

**Placement semantics chosen** (genre-surveyed, documented at the
call sites):
- Same-color re-click on an occupied point → **removes it** (toggle).
  Fixed as above; matches q5go/cgoban/Sabaki.
- Opposite-color click on an occupied point → **replaces** it (no
  stacking, no error). Pre-existing behavior, verified correct.
- Triangle toggles **independently** of whatever stone (if any)
  occupies the point.
- Setup edits apply to **whichever node is current**, including a
  node that has children or already carries a played move — this is
  `applySetup`'s pre-existing behavior (it mutates
  `state.currentNodeId` unconditionally), which I kept rather than
  adding a new restriction: it is itself the least-surprising choice
  among genre editors (Sabaki edits whatever node is current; it does
  not gate setup edits on child-count), and inventing a new refusal
  rule would have been unwitnessed, un-surveyed novelty (ADR-0019
  Rule 2 — the burden of proof sits on a deviation from what the
  reference editors do, and no reference editor was found that
  refuses this). Documented in `applySetup`'s doc comment.

**UI** (`src/components/chrome/SetupToolPalette.vue`,
`src/composables/board/useSetupTools.ts`):
- Toolbar button, click-toggled (verified NOT hover — mirrors
  `LocalePicker.vue`'s exact click/ESC/outside-click shape, the
  codebase's own existing genre exemplar for this exact interaction,
  rather than the toolbar's *other* popovers which are all
  hover-driven `useHoverPopover` instances and were explicitly the
  wrong pattern per the commission).
- Closing the palette (re-click, ESC, or outside pointerdown) **always**
  deselects the active tool — one shared code path
  (`useSetupTools.closePalette`), so the three dismiss routes cannot
  drift apart.
- `activeTool` / `paletteOpen` are **module-scope, ephemeral, NOT in
  `GlobalStore`** — no schema migration (`CURRENT_SCHEMA_VERSION`
  untouched). Released on `resetWorkspace` via a registered
  `registerWorkspaceResetHandler` (the store's own dependency-
  inversion seam for exactly this kind of module-scope cleanup
  obligation) so a stale armed tool can't survive an identity flip —
  a defect class named by `frontend/CLAUDE.md`'s "resource ownership
  at mutation sites" discipline, closed at authoring time rather than
  left as debt.
- Board clicks route through `useSetupTools.applyToolAt` first
  (`BoardWidget.vue::onBoardClick`); it returns `false` when no tool
  is armed and the click falls through unchanged to the pre-existing
  `emit('move', x, y)` path. Setup edits therefore **never** reach
  `useBoardMoveRouting` — they are not user moves, are not subject to
  the review session's AWAITING_MOVE grading gate, and don't consume
  a turn (matches the commission's explicit requirement).
- `useSetupTools.applyToolAt` writes through `updateBoardState` — the
  same channel `applyGoMove`'s callers already use — and is added to
  the `local/board-mutation-entry-point` ESLint gate's allowlist with
  a one-line reason (`eslint.config.js`), since it's a real,
  mechanized ADR-0011-style net over exactly this class of call site
  and correctly flagged the new caller until classified.
- No `waitForTimeout`, no chromium — the palette state machine and
  `applyToolAt` are tested at the composable/store integration tier
  (Tier 3, real store, no DOM) per `frontend/tests/CLAUDE.md`.

**Persistence discipline** — no `touchSession()` call was added, and
`sync-session-version.test.ts` was **not** extended. Rationale
recorded here per the commission's instruction to justify this
explicitly: setup-tool board content (AB/AW/TR on `node.properties`)
flows through `updateBoardState`, the **same board-content-persistence
channel** `applyGoMove`'s callers already use — which bumps
`boardsVersion`, a channel `sync-session-version.test.ts` already
covers under its "board MUTATE schedules a save" case (same
`boardsVersion` bump `mutateBoard`/`updateBoardState` share). This is
not a new persistence channel; it's the existing board-mutation
channel with a new writer, exactly the case that suite's own coverage
already generalizes over. The palette's tool-selection state, by
contrast, is genuinely never persisted (ephemeral UI state, as the
commission specified) and so has no `sessionVersion` write to cover.

**Rendering** (`src/components/board/BoardDisplay.vue`,
`src/engine/constants.ts`): triangle marks render as small SVG
outline polygons (stroke-only, so legible over both an empty point and
a stone), sized via a new `TRIANGLE_MARK_RATIO` constant next to the
existing `MARKER_INNER_RATIO`. SVG, not canvas — ADR-0010's canvas
rule triggers on element count scaling with *data density*; a per-node
handful of triangle marks doesn't, matching the existing move-number
annotation precedent in the same file.

## Named future seams (skeleton posture, deliberate)

- **Eraser, square, circle, label tools** — not built. `SetupTool`'s
  union type and `applyToolAt`'s dispatch switch, plus
  `SetupMarkupKey`'s union and the palette's `.tool-grid` wrapping
  layout, are the seams a future tool widens without restructuring.
- **Drag-painting** (click-and-drag to place a run of stones) — not
  built; each click is independent.
- **Board cursor/preview (ghost stone on hover)** — not built. The
  commission marked this explicitly optional ("skeleton posture") and
  it snowballs into a second render path on `BoardDisplay`; skipped in
  favor of the palette's own open-state serving as the mode indicator
  (ADR-0019 appendix C29 — the palette staying open with the active
  tool highlighted is the persistent visible mode indicator; C29 is
  satisfied by that, not by a board-side cursor change).
- **Mid-tree setup analysis-query representation** — see the Load-
  bearing finding above. Pre-existing, self-documented, not touched.
- **`MoveSuggestions`/`BoardVariationsOverlay`'s own `move` emits**
  (suggestion-disc click, PV paste) are **not** intercepted by the
  setup tool — only `BoardDisplay`'s own grid click is. Placing a
  setup stone via a suggestion overlay was judged out of scope
  (advanced interaction orthogonal to a skeleton editor); named here
  rather than silently left unconsidered.

## Tests (all new, red-then-green witnessed per ADR-0021)

- `tests/unit/logic-setup.test.ts` — `applySetup`/`applyMarkup`: no
  turn consumption, no capture on setup placement, same-color toggle
  removes, opposite-color replaces, current-node-only mutation, a
  setup stone captured by a subsequent real move, triangle
  independence from stones. WITNESSED: the toggle test failed against
  the pre-fix `applySetup` body (confirmed before applying the fix),
  passes after.
- `tests/unit/engine/sgf-writer-setup-roundtrip.test.ts` — first-ever
  test of `serializeBoard`'s tree-serialization path (previously only
  the narrower `setSgfRootKomi` string-surgery helper had coverage).
  Load → `applySetup`/`applyMarkup` → `serializeBoard` → reload,
  covering AB, AW, TR individually, together, a toggled-off stone
  staying off, and a setup edit on a non-root (mid-tree, already-
  played-move) node. WITNESSED.
- `tests/integration/useSetupTools.test.ts` — Tier-3, real store: the
  palette state machine (open → select → close deselects; ESC/
  outside-click path via `closePalette`; re-selecting the same tool
  deselects without closing; module-scope sharing across independent
  `useSetupTools()` call sites; `resetWorkspace` releases a still-armed
  tool via the registered handler), and `applyToolAt` (no-op when
  unarmed, writes through to the active board, toggle-off on a second
  click). WITNESSED.
- `tests/unit/composables/chrome` and existing suites — unaffected;
  full suite re-run below.

## Gates

- `npm run build` (`vue-tsc -b && vite build`): **WITNESSED green.**
- `npx eslint .`: **WITNESSED green** (including the
  `local/board-mutation-entry-point` custom gate, which correctly
  flagged the new `updateBoardState` call site until allowlisted).
- `npm run test:run`: **WITNESSED green** — 120 files / 1535 tests
  passed, 3 files / 4 tests skipped (pre-existing skips, unrelated to
  this change), 0 failures, both before this change (1511 passing
  baseline) and after (1535 passing, +24 new).

## Summary

Branch `bork/feat/setup-stones-toolkit`, head `a90ecee9`. The
strategic finding is that the DATA layer was already almost entirely
correct and complete (`applySetup`, the loader, the writer, the
navigator) — built ahead of any caller, per its own doc comments. This
commission's real work was: wiring it up as a UI feature end-to-end,
finding and fixing a genuine toggle-semantics bug in that pre-existing
function via the first test ever written against it, adding the
markup (TR) sibling from scratch (data + render), and honestly
surfacing the one place (mid-tree setup in analysis queries) where the
existing architecture is documented-but-wrong rather than either
faking a fix or silently shipping it.

## Review nit fixes (ACCEPT-WITH-NITS, `setup-stones-toolkit-review.md`)

Both blocking nits addressed in the same worktree. Commit `921e3aee`
(merge of `next`'s intervening advance — the maintainer's config
reset-button `surface-0` background ruling, row 609; no conflicts,
disjoint files) precedes the fix commit `fc5e1b44` so the fix lands on
a current base.

**Nit 1 — teardown census wiring (production load-guarantee).**
`useSetupTools.ts`'s `registerWorkspaceResetHandler` call was real, but
nothing forced its module to load in production: `src/store/
teardown-registrations.ts` (the single side-effect-import bootstrap
every owner module must appear in, per that file's own header
discipline) never imported it, so `setup-tools:close-palette` was
registered only in tests that imported the composable directly — the
production app would never have released it on identity flip, and
`tests/integration/teardown-registry-completeness.test.ts` passed
falsely, for the reason the reviewer named: it never loaded the
handler to begin with. Fixed:
- Added `import '../composables/board/useSetupTools';` to
  `teardown-registrations.ts`'s order-independent (DEFAULT band)
  group.
- **WITNESSED red-then-green**: running the completeness test
  immediately after adding the import (before touching the expected
  list) failed with `expected [...12] to deeply equal [...11]`, the
  diff naming exactly the missing `'setup-tools:close-palette'` row —
  proof the mechanism now actually detects registration, not a
  vacuous pass. Added the row to the expected `registeredWorkspace
  ResetLabels()` list (it lands last, matching real module-evaluation
  order); re-ran green.
- **Follow-on discovery**: `tests/integration/auth-lifecycle.test.ts`
  runs a SEPARATE registry census (the identity-scoped drain pin,
  which derives its asserted label set from the SAME live registry)
  and failed the same way once the import landed — a second genuine
  gap the first fix's test run didn't surface until the full suite ran.
  `setup-tools:close-palette` is the same shape as that suite's
  existing `review:abort-all` / `nav:clear-toggle-memory-all` entries
  (a plain module-private ref reset via closure, not an exported cache
  with a spy-able clear function), so it was added to that file's own
  `NON_CACHE_RESET_LABELS` set with a comment following the existing
  precedent's exact reasoning, pointing at `useSetupTools.test.ts`'s
  dedicated reset test as its real coverage.

**Nit 2 — loud notice for the mid-tree setup drop (ADR-0002, ledger
row 622).** Confirmed per the reviewer's finding: root-level setup
(handicap) was already correct and required no change — only the
MID-TREE case (any AB/AW on a non-root node, now user-reachable via
the setup toolkit) silently vanishes from outgoing analysis queries.
Added, following the existing `analysis.ponderExhausted` notice's
idiom (same file, same `pushSystemMessage('warning', i18n.t(...))`
shape) but with **per-board**, not per-query, dedup — this is a
standing fact about the tree, true identically on every subsequent
query, so per-query re-firing would be noise:
- `pathHasMidTreeSetup(nodes, path)` — new pure predicate,
  `src/engine/util.ts`, scans `path[1..]` (root excluded — root AB/AW
  is the already-correct, already-handled case) for a non-empty
  AB/AW/AE. Unit-tested (`tests/unit/engine/util.test.ts`, 4 new
  cases: no setup, root-only setup, mid-tree setup, and that the
  predicate respects the queried path's own boundary rather than
  scanning the whole tree).
- `AnalysisService.warnIfMidTreeSetupDropped(boardId, nodes, path)` —
  new private method, called from both `analyzeRange` and
  `analyzeActiveNode` (the two query-construction sites that build a
  `moves` array from a path) right after each computes its path.
  Fires `analysis.midTreeSetupDropped` (new i18n key, no literal
  braces so no `{'{'}` escaping needed) at most once per board per
  session via a new `midTreeSetupWarnedBoards: Set<BoardId>` instance
  field, released on board-close (that board's own entry) and
  workspace-reset (the whole set) through two new teardown
  registrations — the same resource-ownership discipline this
  codebase enforces everywhere else for module/instance-scope state.
- **Tests** (`tests/integration/analysis-service-mid-tree-setup-
  notice.test.ts`, new, Tier-3, mirrors the `analysis-service-error-
  packet-narrowing.test.ts` harness shape but lighter — no packet
  injection needed since the notice fires at query-construction time,
  before any response round-trips): fires on `analyzeRange` over a
  path containing a mid-tree setup node; fires on `analyzeActiveNode`
  when parked directly on that node; does NOT fire for root-only
  setup (positive control for the "already correct" case); does NOT
  fire with no setup at all (negative control); fires **at most once**
  across two queries on the same board; and `resetWorkspace` releases
  the dedup so a fresh identity sees the notice again. All 6
  WITNESSED green; the completeness/auth-lifecycle censuses
  (extended per Nit 1's pattern) additionally pin that both new
  teardown labels (`analysis-service:mid-tree-setup-warning` /
  `-warnings-all`) are genuinely registered in production.

**Gates re-run after both nits, on the final tree — all WITNESSED
green**: `npm run build`, `npx eslint .`, `npm run test:run` (121
files / 1545 tests passed, 3 files / 4 tests skipped — same
pre-existing skips as before, +10 net new tests over the initial
delivery, 0 failures).

Final branch head: `fc5e1b44` (`921e3aee` merge + `fc5e1b44` nit-fix
commit, on top of the initial `a90ecee9` delivery commit).
