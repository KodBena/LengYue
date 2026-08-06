# Hotkeys batch — build report

## Post-review fixes (2026-08-06, addressing ACCEPT-WITH-NITS)

Review verdict: `.claude/dispatch-reports/hotkeys-batch-review.md`, findings 4
and 5. Both fixed on this same branch; new head after this update.

**Nit 1 — cursor-ON-fork was a silent no-op.** `navigateToggleMainLine`
(`src/engine/navigator.ts`) only ever inspected `node.parent`'s children,
never the current node's own — so standing exactly at a fork walked past it
to the next ancestor fork (or no-op'd if none existed) instead of acting
where the user is standing. Fixed by unifying the two cases into one
at-or-above walk: the current node is checked first, then each ancestor in
turn, both via the same `children.length > 1` test. Reviewer's own read
("toggling the fork's own active child seems the natural reading") is what's
implemented; the docstring now names this explicitly as the resolved
cursor-on-fork case (previously only the depth-preserving ambiguity was
named). New test: `tests/unit/engine/navigator.test.ts` — "toggles the fork
itself when the cursor sits exactly ON the fork node (review nit — was a
silent no-op)"; the comment in the test spells out the red/green shape
(reverting to the old "check `node.parent` only" logic makes it fail).

**Nit 2 — `mainLineToggleMemory` had no `closeBoard` cleanup.** The original
report cited `pendingAnalysisAborts` as precedent for the module-scope-Map
pattern but didn't actually wire the matching cleanup (the precedent is
*actively deleted* per-`BoardId` at several call sites; the new Map wasn't).
Fixed per the resource-ownership-at-mutation-sites checklist
(`frontend/CLAUDE.md`), which names both `closeBoard` and `resetWorkspace` as
mutation sites an owner must release resources at:

- `useNavigation.ts` now exports `clearMainLineToggleMemoryForBoard(boardId)`
  (deletes every `${boardId}::…`-prefixed key) and registers it as a
  `closeBoard` teardown handler (`registerBoardCloseHandler`, label
  `nav:clear-toggle-memory`, DEFAULT band) — same mechanism as
  `useReviewSession.ts`'s `review:abort`.
- Also registers a `resetWorkspace` handler (`registerWorkspaceResetHandler`,
  label `nav:clear-toggle-memory-all`, wholesale `.clear()`) — extending
  beyond the literal ask (which named only `closeBoard`) to the sibling
  mutation site the same checklist names, mirroring `review:abort-all`. Flag
  this beyond-scope addition for maintainer awareness even though it's
  low-risk and directly justified by the cited discipline.
- `src/store/teardown-registrations.ts` — added
  `import '../composables/useNavigation';` so the registration actually
  fires at bootstrap (without it, nothing forces the module to load before
  the first `closeBoard`/`resetWorkspace` call — the exact silent-registration
  gap `teardown-registry.ts`'s header describes).
- Updated the two places that pin the complete registry label sets:
  `tests/integration/teardown-registry-completeness.test.ts` (both
  `registeredBoardCloseLabels()` and `registeredWorkspaceResetLabels()` now
  include the new labels, in bootstrap-import-order position) and
  `tests/integration/auth-lifecycle.test.ts`'s `NON_CACHE_RESET_LABELS`
  (this test's registry-derived drain pin failed loudly, exactly as
  designed, until `nav:clear-toggle-memory-all` was added there — it's a
  bookkeeping-Map clear on a real/un-mocked module, not a spyable module
  cache, the same shape as the existing `review:abort-all` exclusion).
- A test-only inspector, `_mainLineToggleMemoryKeyCountForBoard(boardId)`,
  lets tests assert the count directly (the Map itself stays unexported —
  `frontend/CLAUDE.md`'s discipline against handing out mutable module state
  to arbitrary importers).
- New test file `tests/integration/useNavigation-toggle-memory-cleanup.test.ts`
  (Tier 3, real store + real navigator, no fakes needed): 4 cases —
  `closeBoard` drops the closing board's entries, closing one board doesn't
  disturb another board's entries, `resetWorkspace` clears every board's
  entries, and the cleanup function is a safe no-op with nothing to clear.

Gates re-run after both fixes: build clean, `eslint .` clean,
`npm run test:run` → 1132 passed / 4 skipped, 83 files passed / 3 skipped
(0 failures) — confirms both the new tests and every previously-passing
suite (including the two registry-completeness pins and the auth-lifecycle
drain pin) are green together.

BUILD agent delivery for the maintainer commission: add hotkey actions for
engine model swap/cycle, mint card, next card, and toggle main-line
variation to `frontend/src/composables/keybindings-catalog.ts`.

Read end to end before starting: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`frontend/src/composables/keybindings-catalog.ts` (pre-change), and
`law/adr/0019-appendix-ui-proscriptions.md` entry C15 (host-chord collision —
enforced here as "no browser/AT-reserved chord, and no collision with an
existing catalog default").

**Worktree note (surfaced mid-task):** the assigned worktree
(`.claude/worktrees/agent-aef22b08f64e3954b`) was branched from an older
commit than the shared checkout at `/home/bork/w/omega` — several files
(`keybindings-catalog.ts` itself, `ToolbarEngineMetrics.vue`,
`ForestDirectory.vue`, etc.) differ between the two. All research and edits
below are against the worktree's own state (verified by re-reading every
touched file through its worktree-prefixed path before editing), not the
newer shared checkout an early unprefixed `Read` call had accidentally
surfaced.

## 1. Engine: swap last-active / cycle

- **New store field** `EngineState.previousSelectedModel: string | null`
  (`src/types/engine.ts`), maintained by the existing sole mutator
  `setSelectedModel` (`src/store/index.ts`) — every write path (Toolbar
  dropdown, the new keybindings) shifts the outgoing value into it. Same-value
  re-selection is now a no-op for both fields (previously a redundant
  same-value write). NOT synced through SyncService — session-local memory,
  not a durable preference.
- **New composable** `src/composables/useEngineModelSelection.ts`:
  `computeNextModelLabel(models, current)` — pure, skips unhealthy entries
  (mirrors the dropdown's `:disabled`), wraps, defaults to the first healthy
  entry when `current` doesn't match. `useEngineModelSelection()` wraps it
  (`cycleModel`) and the swap (`swapLastActiveModel`, no-op when
  `previousSelectedModel` is null).
- **Catalog wiring**: `engine.swapLastActiveModel` (default `[`),
  `engine.cycleModel` (default `]`). New predicate `engineSelectorMode`
  (connected + `selector` capability advertised) — narrower than
  `engineConnected` since LEAF mode has nothing to cycle.
- **Chord rationale**: `[`/`]` — unused, not browser/AT-reserved (C15), read
  visually as a "previous/next" pair; no mnemonic collision with `m`/`n`/`c`/`d`/`l`.
- **Tests**: `tests/unit/composables/useEngineModelSelection.test.ts` — 6
  cases for `computeNextModelLabel` (empty, all-unhealthy, unset-current,
  no-match-current, advance-skip-unhealthy, wrap), 6 for the composable
  against the real store (cycle/wrap, no-healthy no-op, swap no-op when no
  previous, swap after second selection, toggle back-and-forth, same-value
  re-select doesn't disturb memory).

## 2. Mint card — PROPOSED-ONLY, not wired

`useMinting()`'s `prepareDraft`/`commitMint` are not the UI's entry point.
The Toolbar button (`App.vue`'s `triggerMint`) calls
`mintModalRef.value?.open(activeBoardId.value)` — a component-ref method on
`<MintCardModal ref="mintModalRef">`, mounted only inside `App.vue`. There is
no composable/service-level "open the mint dialog" entry point in this
worktree (no store-level modal-open flag exists for any of the app's modals —
checked `App.vue`'s four `*ModalRef`s, all component-ref-based).

Per the dispatch brief's own escape clause ("implement what is clean...
rather than forcing it"), this is exactly the case: wiring it would require
new cross-layer machinery (e.g. a `store.session.ui.mintDialogRequested`
signal plus an `App.vue` watcher to open the ref off it) beyond a
composable/service call. **Not implemented.** Left for the maintainer to
either bless that machinery or propose a different UI entry point (e.g.
promoting `MintCardModal`'s mount point so a global keydown handler can hold
a ref to it directly).

## 3. Next card (review session)

- **Wiring**: `review.nextCard` calls `reviewSession.nextCard` — the literal
  same function `ReviewSessionPanel.vue`'s advance button dispatches (not a
  reimplementation). `nextCard` itself has no internal state-machine guard
  beyond `currentIndex`/`queue.length` bounds (confirmed by reading
  `useReviewSession.ts` in full) — it doubles as "skip" mid-review and "next"
  once `FINISHED`, exactly as the UI button's label already communicates.
  Nothing is bypassed; this reproduces the UI path exactly.
- **Gating**: new predicate `reviewSessionHasCurrentCard`
  (`reviewSession.currentCard.value !== null`) mirrors `ForestDirectory.vue`'s
  own `inReviewSession` panel-mount gate, so the keybinding is live exactly
  when the button is visible in the UI.
- **New module-scope instance**: `keybindings-catalog.ts` now instantiates
  `useReviewSession(activeBoardId)` at module scope (verified `onUnmounted`/
  `watch`-free — module-safe, same posture as the existing `nav`).
- **Chord**: `.` (period) — unused, C15-clean. `Enter` was the more obvious
  "advance" mnemonic but is in `RESERVED_KEYS`
  (`lib/keybindings-capture.ts`), the same vocabulary the rebind editor
  refuses to let a user capture; avoided a default the editor itself treats
  as off-limits.
- **Tests**: extended `tests/unit/composables/keybindings-catalog.test.ts`
  with 6 cases (4 for `engineSelectorMode`, 2 for
  `reviewSessionHasCurrentCard` covering the has-card and past-queue-end
  shapes).

## 4. Toggle main line variation — ambiguity flagged

**Maintainer-facing ambiguity note (unresolved, needs a veto/confirm):**
"toggle main line variation / last known uncle-cousin" has no prior art in
this codebase — grepped for `lastActiveChildIndex`, `previousVariation`,
`uncle`, `cousin` as tracked concepts; none exist. Implemented reading, named
in the code's own docstring for visibility: walk from the current node
upward past every single-child ancestor to the **nearest ancestor fork**
(a node with `children.length > 1`); at that fork, toggle `activeChildIndex`
between the two most recently visited branches (a true two-value toggle, not
a full cycle), landing on the **fork's alternate immediate child** — not a
depth-preserving replay down the new branch's own stored `activeChildIndex`
chain to the same move number. A depth-preserving variant is a documented,
straightforward follow-up if that's the intended reading instead.

- **New pure function** `navigateToggleMainLine(state, memory)`
  (`src/engine/navigator.ts`) — `memory: Map<string, number>` keyed
  `${boardId}::${forkNodeId}` (NodeIds are board-local per `IDENTIFIERS.md`,
  so the key must carry the board id to avoid cross-board collision).
- **Composable**: `useNavigation()` gained `toggleMainLine()`; the memory Map
  is module-scope in `useNavigation.ts` (shared across every call site —
  TreeWidget, BoardWidget, the catalog, autonav — deliberately, mirroring
  `useReviewSession.ts`'s `pendingAnalysisAborts` precedent).
- **Chord**: `u` (uncle/cousin mnemonic) — unused, C15-clean.
- **Tests**: extended `tests/unit/engine/navigator.test.ts` with 8 cases:
  no-op at root, no-op with no fork on the path, immediate-parent-fork
  switch, the uncle/cousin case (fork two ancestors up, past a single-child
  chain), two-value toggle back-and-forth, 3+-sibling first-press
  advance-by-one, and a per-board memory-independence case.

## Gate tails (worktree required `npm install` first — no `node_modules`)

**Build** (`npm run build` = `vue-tsc -b && vite build`):
```
✓ 1081 modules transformed.
dist/assets/index-DE7Ig1P_.js   2,923.78 kB │ gzip: 1,033.01 kB
✓ built in 1.97s
```
(pre-existing >500kB chunk-size advisory only, unrelated to this change)

**ESLint** (`npx eslint .`): no output — clean.

**Tests** (`npm run test:run`):
```
 Test Files  82 passed | 3 skipped (85)
      Tests  1127 passed | 4 skipped (1131)
   Duration  45.37s
```
Focused re-run of the three touched/new test files:
```
 Test Files  3 passed (3)
      Tests  59 passed (59)
```

## Other files touched (beyond the catalog)

- `src/types/engine.ts`, `src/store/index.ts` — `previousSelectedModel` field
  + mutator update (item 1).
- `src/composables/useEngineModelSelection.ts` — new file.
- `src/engine/navigator.ts`, `src/composables/useNavigation.ts` —
  `navigateToggleMainLine` + `toggleMainLine()` (item 4).
- `src/components/KeybindingsView.vue` — `KNOWN_DOMAINS` closed set extended
  `{nav, display, engine} → {nav, display, engine, review}`; this component
  throws loudly (ADR-0002) on an unrecognized domain prefix, so it would have
  failed at runtime on `review.nextCard` without this change.
- `src/locales/en.json` — labels/descriptions for the 5 new action ids plus
  `keybindings.section.review`. Other locale files (`ja`/`ko`/`zh-CN`) not
  touched — `fallbackLocale: 'en'` covers the gap, consistent with how those
  catalogs already lag some existing keys.
- `frontend/FILES.md` — entry for the new composable file.
