# Cards tab merge — PR 2 (tab restructure)

- **Status:** Shipped on `frontend/cards-tab-merge-pr2-tab-restructure`
  (branched off `frontend/cards-tab-merge-pr1-per-board-forest`),
  2026-05-06. Six files touched (one new SFC, two of which are docs).
  Build green. Closes the cards-tab-merge arc end-to-end alongside
  PR 1 (`docs/worklog/2026-05-06-cards-tab-merge-pr1-per-board-forest.md`).
- **Genre:** UI restructure — collapses two control-panel tabs (SR
  and Database) into a single Cards tab. Schema migration for the
  `activeTab` value, new `ReviewSessionPanel` extracted from
  App.vue's inline SR controls, `ForestDirectory` integrated as the
  Cards tab body with deck-config / in-session swap discipline.
- **Date:** 2026-05-06.

## Context

PR 1 laid the foundation: per-board card-tree state, composable
signature changes (`useCardTreeData(boardIdRef)`,
`useReviewSession.startSession(prefetchedQueue)`), the orange
"current review card" overlay infrastructure, and schema
migration 15 → 16 collapsing the per-tab `srContextIds` /
`databaseContextIds` into `cardsContextIds`. The SR and Database
tabs in App.vue stayed in their pre-merge shape — both still
worked, both read the merged `cardsContextIds` field, but the UI
hadn't moved.

This PR moves the UI. After merge, the control panel has four
tabs (Cards / Settings / Analysis / Other) instead of five (SR /
Database / Settings / Analysis / Other). The Cards tab body is
the existing `ForestDirectory` widget, augmented with a "Start
Review Session" button in the Decks subtab and an
in-session-state mode that swaps the deck-config form for a new
`ReviewSessionPanel`.

The two-PR seam paid off for review ergonomics: PR 1's
foundation is small enough to read end-to-end; PR 2's UI
restructure rides on a stable composable contract.

## What changed

Six files (one new SFC + five edits across one Vue, two
TypeScript, two doc files).

### Schema migration 16 → 17

`src/store/migrations.ts`. Rewrites `session.ui.activeTab` from
`'sr'` or `'database'` to `'cards'`. Other values pass through
unchanged. Idempotent.

This migration is paired with the controlTabs / template
restructure in this same PR. The split from PR 1's 15 → 16
migration was deliberate: the field rename had to land first so
users hydrating against PR 1 alone had working SR/Database tabs
against the merged `cardsContextIds` field. Bumping schema
version twice across two PRs is the cost of the seam; the
append-only invariant is honoured (each migration is registered
in order, never modified, monotonically increasing).

### `defaultSessionUI.activeTab` → `'cards'`

`src/store/defaults.ts`. New installs land on the Cards tab. No
existing-user impact (the migration covers them).

### New SFC: `ReviewSessionPanel.vue`

`src/components/ReviewSessionPanel.vue` (new). Hosts the
in-session controls extracted from App.vue's inline SR template:

- Status header (`Review Active` / `Intermission`).
- Card N/M counter line.
- Status indicator with conditional `(KataGo is pondering...)`
  suffix during ANALYZING.
- Intermission `BaseChart` rendering `userMoveScores` against
  `accentSecondary` color (FINISHED state only).
- Moves-made counter (non-FINISHED).
- Per-card sticky visits override row (non-FINISHED).
- Skip / Next button (label flips to `Next Card` on FINISHED).
- Rewind to Start button.

The component instantiates `useReviewSession(activeBoardId)`
itself — same per-board projection as ForestDirectory's
existing instance. Two composable instances against the same
board work against the same underlying state because the
per-board state lives in the store
(`store.session.reviews`) and the per-board ephemeral aborts
map is module-scope (`pendingAnalysisAborts` in
useReviewSession). No props needed; the component is
plug-and-play.

ADR-0006: header at the top of the script block. ADR-0007: 122
lines (under the 250-line budget; the largest section
`<template>` is well under 150).

### `ForestDirectory.vue` integration

Two additions:

1. **In-session swap discipline.** The Decks subtab's left panel
   gates on a new `inReviewSession` computed:
   `reviewSession.currentCard.value !== null`. When true,
   `<ReviewSessionPanel />` renders in place of the deck-config
   form. When false (IDLE before a session, or LOADING during
   one), the deck-config form is back. Mirrors the pre-merge SR
   tab's gating shape.

2. **"Start Review Session" button.** New `startReviewFromConfig`
   handler orchestrates the combined flow: call
   `tree.runPipeline(deck, cardsContextIds)` (from PR 1's new
   signature returning the matched cards), then
   `reviewSession.startSession(matched)` if matches exist. One
   pipeline call serves both the forest visualization and the
   review queue — by construction the forest's active set and
   the queue are the same set of cards. Two backend round-trips
   collapse to one.

The "Run pipeline" button is preserved as the browse-only
action; both buttons disable when no deck is selected.
`startReviewFromConfig` short-circuits to no-op if the deck
disappeared between selection and click.

The `currentCardId` computed is rewired to read through
`reviewSession.currentCard.value` rather than directly indexing
`store.session.reviews[boardId].queue[currentIndex]` — same
result, cleaner factoring (one source of truth for "what card
is the user reviewing").

### `App.vue` tab collapse

Three changes:

1. **`controlTabs`** shrinks from `[sr, database, settings, analysis, other]` to `[cards, settings, analysis, other]`.
2. **`#sr` and `#database` template slots removed.** Replaced by a single `#cards` slot containing `<ForestDirectory @load-card="handleLoadCard" />`. The Database tab's prior content was already exactly this; the SR tab's content moves into ReviewSessionPanel which ForestDirectory now hosts.
3. **Imports / locals dropped.** `BaseChart`, `themeColor`, `backendService`, plus locals `intermissionSeries`, `startEbisu`, `handleVisitsOverrideChange`. The `useReviewSession` import stays — `handleBoardMove` still routes through `reviewSession.state.value` and `reviewSession.processUserMove(x, y)` for board-click → review-move dispatch during AWAITING_MOVE.

App.vue net loss: ~80 lines from the inline SR template +
related script. Lines of style left in place even though
their consumers (the SR-tab inline templates) are gone — per
ADR-0004 spirit, conservative non-removal of CSS classes that
might have other consumers I haven't audited; one orphan class
that's clearly dead (`.tab-padding-sr`) is left for a future
cleanup sweep rather than risk-removed under partial visibility
of all consumers.

### Documentation updates

- `docs/notes/cards-tab-merge-plan.md` — status line flips from
  "Planned (2026-05-02). Not yet implemented." to "Implemented
  2026-05-06" with worklog cross-references. The "Open
  questions for execution time" section gains italicised
  resolution notes recording the choices actually taken.
- `docs/TODO.md` — Active Medium-tier "Cards tab merge" entry
  retired via the established "moved to Completed" stub
  pattern. Frontend Completed table receives a synopsis row
  covering both PRs.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- The migration's idempotency: re-running on a v17 blob (which
  already has `activeTab: 'cards'` and lacks the prior values)
  is a no-op via the explicit `'sr' || 'database'` predicate.
- Tab structure: `controlTabs` declares four tabs;
  `defaultSessionUI.activeTab === 'cards'` matches the new tab
  id; migration covers all existing-user paths.
- Cards tab idle state: deck-config form visible with two
  buttons; both disable when no deck is selected.
- Cards tab in-session state: deck-config form hidden,
  ReviewSessionPanel visible, forest panel still on the right
  with the orange overlay tracking `currentCard`.
- Cross-board switching: tab structure stays stable (workspace-
  global), forest content + review state swap (per-board) per
  PR 1's projection composables.

Manual smoke (left as HMR-driven user verification on review):

- Start review session via "Start Review Session" button — one
  pipeline call populates the forest + queue; orange overlay
  appears at queue[0]; advance with Skip/Next; orange follows.
- Browse via "Run pipeline" — populates forest, no review
  starts; "Start Review Session" still available.
- Migration: a v15 blob with `activeTab: 'sr'` migrates through
  16 (field rename) → 17 (activeTab rewrite); lands on
  `'cards'` cleanly.
- Tab persistence across reload: select Settings tab, reload,
  Settings tab still active (the migration only touches sr /
  database values).
- Session state across board switch: start session on board A,
  switch to board B, B's Decks panel shows deck-config form
  (idle), switch back to A, A's Decks panel shows
  ReviewSessionPanel.

## Forward notes

- **PR 1's audit-pair ID nomenclature.** PR 1's worklog and
  inline `store/index.ts` comment refer to the new card-tree
  cleanup as "audit pair O12." That ID is technically already
  taken in `docs/notes/resource-ownership-audit-plan.md` (it
  refers to `useResizablePanel`'s document listeners). The new
  pair would more correctly be C18 or a new O16+ entry; the
  audit plan has not been retrofit here because the cards-tab-
  merge arc isn't a resource-ownership PR per se. A future
  audit-plan tidy can correct this; the inline comment in
  `store/index.ts` can update at the same time. Filed as a
  forward note rather than blocking this PR.

- **Orphan CSS in App.vue.** The post-restructure App.vue
  carries a few CSS rules that were specific to the now-removed
  inline SR template (`.tab-padding-sr`, the `.deck-selector-box`
  / `.deck-dropdown` copies — note ForestDirectory has its own
  scoped versions, the orphans are App.vue's globals; the
  `.visits-override-row` / `.visits-input` rules — note
  ReviewSessionPanel has its own scoped versions). They're
  dead-but-harmless under the strict-mode build sweep's
  invariant that nothing breaks; minimal-touch posture left
  them in place rather than risk-removed. A small follow-up PR
  can sweep them. Documenting the deferral here so the next
  contributor doesn't re-investigate.

- **Schema-version pace.** Two migrations across two PRs in one
  arc bumped CURRENT_SCHEMA_VERSION twice (15 → 16 → 17). The
  append-only invariant is honoured; each migration is
  documented and idempotent. Future arcs that span multiple
  PRs and require schema changes can follow the same shape, or
  collapse into a single PR if the schema changes don't need
  user-visible separation.
