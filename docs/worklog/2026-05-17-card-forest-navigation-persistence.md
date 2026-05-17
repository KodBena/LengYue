# Card forest navigation persistence

- **Status:** In flight on `KodBena/feat/card-forest-navigation-persistence`.
  Closes item 1 of the post-v1.1.0 follow-up list (`todo_local.gitignore`).
- **Genre:** Feature — persisted UI state. One axis lifted from
  per-mount component state into the synced `GlobalStore` slice,
  with rolling-archive migration discipline applied.
- **Date:** 2026-05-17.

## Context

The `CardTreeWidget`'s manual-expand axis — the user's per-board
exploration of cold-internal stubs and cold-leaf buckets in the
card forest — lived in a per-mount `ref<Set<string>>` and was
lost on every navigation. Users reported "card forest navigation
not saved; might probably want it to, since it can be a maze."

The expansion state is genuine user choice (which branches of a
many-thousand-node forest the user has revealed); the rest of
the per-board card-tree state (`forest`, `activeSet`, `cards`,
`forestStats`) is regenerable from the backend and intentionally
stays module-scope per `board-card-trees.ts`'s "Persistence: not
persisted via SyncService" rationale. The split between
*regenerable-data* and *user-driven-choice* is the persistence
boundary this change formalises.

## What changed

### `src/types.ts`

Adds `CardTreeNavState` (`{ manuallyExpanded: string[] }`) and
threads `cardTreeNav: Partial<Record<BoardId, CardTreeNavState>>`
through `UISession`. Array (not Set) so the value JSON-round-trips
through SyncService cleanly; consumers project it into a
`ReadonlySet<string>` to satisfy the `useCardTreeProjection`
contract.

The shape mirrors the sibling `forestNav: ForestNavState` field
shipped at schema-version 21 — same per-board persistence
discipline, same named-mutator-only mutation pattern.

### `src/store/defaults.ts`

Adds `cardTreeNav: {}` to `defaultSessionUI`. A fresh user (or a
fresh board within a user's session) starts with no entries;
slots are created lazily on first stub / bucket click.

### `src/store/index.ts`

Two new named mutators:

- `toggleCardTreeManualExpand(boardId, key)` — flips a single
  key's membership in the per-board `manuallyExpanded` array.
  Creates the slot on first call. Reassigns the slot object and
  the array (not in-place mutation) so SyncService's deep-watch
  picks up the change — the named-mutator discipline
  `useForestNavigation` already follows for `forestNav.expanded`.

- `setCardTreeManualExpand(boardId, keys)` — replace the
  per-board array wholesale. Empty input drops the slot
  (vacuous-slot housekeeping); non-empty input reassigns. Backs
  the "Collapse all" UX (below) by accepting the filtered array
  the data-layer composable computes.

Per-board cleanup on board close happens inline in `closeBoard`
(audit pair O14) — not through a mutator, matching the existing
`reviews` (O2) and `activeMode` (O3) inline-delete pattern.

`closeBoard` gains a `delete store.session.ui.cardTreeNav[boardId]`
line and a corresponding docstring entry (step 9; resource-
ownership audit pair O14). Without it, dead entries would
accumulate in `session.ui.cardTreeNav` and round-trip to the
backend via SyncService — same payload-bloat concern as the
existing `reviews` (O2) and `activeMode` (O3) per-board cleanups.

`resetWorkspace` requires no additional code — `cardTreeNav` is
part of `defaultSessionUI`, so the workspace-level reset clears
the dictionary alongside every other session-UI field.

### `src/composables/cards/useCardTreeData.ts`

Three new entries on the `CardTreeData` interface and matching
implementations:

- `manualExpand: ComputedRef<ReadonlySet<string>>` — reactive
  read of the active board's persisted slot. Projects the stored
  array into a Set per dependency change; the Set's identity
  changes when the array changes, which is what
  `useCardTreeProjection`'s `computed` re-fires on.

- `toggleManualExpand: (key: string) => void` — thin wrapper
  over the store mutator that resolves the active boardId. No-op
  when `boardIdRef.value` is null.

- `clearManualExpandForTree: (rootCardId: CardId) => void` —
  per-tree clear. Walks the underlying forest's
  `CardLineageNode` structure to enumerate the candidate keys
  (`String(cardId)` and `bucket:${cardId}` for every card under
  the tree's root), filters them out of the persisted array, and
  calls `setCardTreeManualExpand` with the result. Other trees'
  entries under the same board are preserved — the per-tree
  scope matches the "in that tree" framing the user surfaced
  during browser testing. Iterative walk (explicit stack) so
  deep trees can't trigger a stack overflow.

`reset()` deliberately does *not* clear the manual-expand state.
The original draft of this work cleared on reset (with the
reasoning "choices no longer meaningful against the new forest"),
which surfaced during browser testing as the actual cause of the
SPA-reload non-restoration: `useForestBrowsePolicy`'s
`{ immediate: true }` watcher fires `loadBrowse` on every mount
of `ForestDirectory` (including the post-hydrate mount that
restored the persisted entries), and the resulting `reset` call
clobbered the freshly-restored slot before the user ever saw it.
The same shape applied to in-session root switching — selecting
a different root in the navigator fires `loadBrowse` → `reset`,
which would have erased any saved expansion that wasn't on the
currently-displayed tree.

The corrected behaviour: keys are `CardId`-based and stable across
forest reloads. If the new forest contains the same cards, the
entries remain meaningful; if some cards are gone, the orphaned
entries are harmless dead weight (the projection simply doesn't
match them). The user-facing escape hatch for accumulated entries
is the per-tree Collapse All button.

### `src/components/charts/CardTreeWidget.vue`

Refactored to a pure data-in / event-out presenter for the
manual-expand axis:

- New `manualExpand: ReadonlySet<string>` prop replacing the
  component-local `ref`.
- New `(e: 'toggle-manual-expand', key: string)` emit. The
  per-component watcher no longer resets manual-expand (the
  data layer does); it still calls `resetHydration()` for the
  thumbnail-cache invariant.
- `handleClick` emits instead of mutating local state.
- New `(e: 'collapse-tree', rootCardId: CardId)` emit for the
  "Collapse all" UX. The button itself is rendered in the
  tree-header on the currently-expanded tree-section only
  (other trees' headers stay minimal); `.stop` prevents the
  click from also toggling the accordion.
- SFC header amended to record the new ownership boundary.

`expandedRootId` (per-tree accordion-expand) remains
component-local — it's per-mount UX state with no
multi-consumer or cross-session relevance.

### `src/components/tree/ForestDirectory.vue`

Single mount-site edit: wires `:manual-expand="tree.manualExpand.value"`,
`@toggle-manual-expand="tree.toggleManualExpand"`, and
`@collapse-tree="tree.clearManualExpandForTree"` through to
`CardTreeWidget`. The single-consumer pattern means no other
call sites needed touching.

### `src/locales/{en,ja,ko,zh-CN}.json`

Two new `cards.lineage.*` keys for the Collapse All button —
the visible label and the hover tooltip. Same shape as the
existing lineage labels in this file family. Non-English
entries follow the LLM-drafted convention with native-speaker
review pending per `frontend/FILES.md`'s standing note on
those catalogs.

### `src/store/migrations.ts` + `src/store/archived-migrations.ts`

`CURRENT_SCHEMA_VERSION` bumps 44 → 45. The new migration
backfills `session.ui.cardTreeNav = {}` on existing blobs
(idempotent — pre-existing plain-object values are preserved
unchanged; non-object values are replaced).

Per the rolling-archive cadence in `frontend/CLAUDE.md`:
migration 42 → 43 (KataGo first-report-after upstream-cliff
floor) moves from `migrations.ts` into `archived-migrations.ts`
at the tail of the archive array. Steady state restored — two
migrations live in the active body (43 → 44 and 44 → 45) as
style anchors; everything older is archived. The body is frozen
exactly as it shipped; only the closing annotation gains a
"Moved from active body to archive 2026-05-17" line per the
discipline.

## What's deferred

- **`closeBoard` audit pair O14 in the resource-ownership audit
  plan.** The docstring at the mutation site names the pair; the
  audit plan at `docs/archive/notes/resource-ownership-audit-plan.md`
  predates this slice and doesn't enumerate O14. Adding it there
  is a doc-graph follow-up, not a blocker for this corrective
  per ADR-0005's incremental-retrofit posture.

- **Cursor / focus-card persistence.** Item 1 named "navigation"
  broadly; the manual-expand axis is the load-bearing piece (it's
  the maze-tracking state). A "where am I focused in the
  forest" cursor is a separable concern — the rendered forest
  already carries `currentCardId` and `selectedCardId` overlay
  inputs from the review-session and click-to-edit paths. Lifting
  those into persisted state is a follow-up if usage shows the
  need; not in scope here.

- **Per-(board, root) keying.** The current shape persists one
  manual-expand set per board; switching the board's browse
  target (selecting a different root in the navigator) still
  clears the set via `useCardTreeData::reset`'s call to
  `clearCardTreeManualExpand`. Keying expansion per
  `(boardId, rootCardId)` would let users hop between browse
  targets without losing exploration on either. Larger axis;
  deferred until the simpler shape proves insufficient.

## Verification

- `npm run build` — passes (`vue-tsc -b && vite build`). The
  strict typecheck is the load-bearing safety net.
- `npm run test:run` — 521 passed, 3 skipped (no regressions on
  the existing tier-1 / tier-3 suites).
- **Browser exercise that found the original bug.** First
  iteration of this work shipped with the `reset`-clears-
  `manualExpand` call described above. User browser-tested:
  switching boards preserved expansion, switching roots in the
  navigator did not, and SPA reload did not. The author's first
  diagnosis ("1000 ms debounce + no `beforeunload` flush") was
  wrong; the user surfaced the sharper observation that
  expansion clears whenever the displayed tree isn't "exactly
  right," which pointed at the immediate-watch `loadBrowse`
  path. The corrective above retires the auto-clear and the
  bug along with it. Recording the diagnosis arc here per
  ADR-0005 Rule 6 (author as you decide).
- Browser smoke (pending user, post-corrective): expand stubs /
  buckets, switch boards back and forth, switch roots in the
  navigator and return, hard-reload the SPA — confirm
  restoration in every case. The "Collapse all" button on the
  expanded tree-section's header clears just that tree's
  entries.

## Cross-references

- `todo_local.gitignore` — item 1 of the post-v1.1.0 follow-up
  list, source of this corrective.
- `docs/handoff-current.md` — frontend section's
  state-of-persistence note should pick up the new schema
  version + slice on the next housekeeping pass.
- `frontend/CLAUDE.md`'s "Rolling-archive discipline for
  `src/store/migrations.ts`" — the per-PR cadence this migration
  follows.
- `docs/archive/notes/card-tree-frontend-spec.md` — the spec
  the manual-expand projection serves.
- `src/composables/cards/useCardTreeProjection.ts` — the
  consumer of the projected `manualExpand` Set; its keying
  contract (`String(cardId)` / `bucket:${parentCardId}`) is
  what the persisted array stores.

## License

Public Domain (The Unlicense).
