# C1 — Restore the Dirty-Board Guard Modal

- **Status:** Approved plan; execution 2026-04-27.
- **Genre:** Worklog entry — an approved plan-mode deliberation,
  filed at execute time so the deliberation outlives the session.
  See `docs/dispatch/frontend-to-audit-formalize-planned-work-logging.md`
  for the proposed pattern this entry inaugurates.
- **Date:** 2026-04-27.
- **Origin:** Continuation of
  `docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`
  (C1 milestone).

## Context

The prior frontend session left a handoff
(`docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`)
that closed Auth UX B1–B5 and diagnosed but did not execute a UX bug:
clicking a tree node in the database tab silently fails when the
current board has content. The dispatch's diagnosis was that
`ConfirmLoadModal` had been removed from `App.vue` but the guard
checking `confirmLoadModalRef.value` remained, causing
`handleLoadCardFromDatabase` to early-return whenever the user has
anything but an empty board.

A trust-but-verify cross-check (the user's instruction) confirms the
diagnosis exactly:

- `App.vue:95` — `const confirmLoadModalRef = vueRef<any>(null);`
- `App.vue:107` — `if (!confirmLoadModalRef.value) return;` (silent
  early-return; ADR-0002 violation, but pre-existing and tracked
  separately in `docs/notes/deferred-items.md`).
- `App.vue` imports (lines 34–46): no `ConfirmLoadModal` entry.
- `App.vue` template (lines 268–482): no `<ConfirmLoadModal>` tag.
- Click chain verified: `LineageTreeChart.vue:149` emits
  `node-click` → `ForestDirectory.vue:133` re-emits as `load-card` →
  `App.vue:433` binds `@load-card="handleLoadCardFromDatabase"`. The
  guard is reached; it just can't fire.

Also verified shipped (so out of scope for this work):

- All five auth-UX artifacts present (`useAuth.ts`, `api-client.ts`,
  `UserBadge.vue`, `LoginModal.vue`, `types.ts:316` has
  `userId?: number`).
- `npm run build` is green (`vue-tsc -b && vite build` succeeds).
- ADR-0007 is filed at `docs/adr/0007-file-size-and-information-density.md`
  with Status: Proposed.

The intended outcome of this change: tree-click → dirty board → modal
appears with three options (Cancel / Overwrite Current / Open in New
Tab) and a "Remember my decision" checkbox; load proceeds per the
user's choice.

## Approach — minimal, ADR-0004-shaped

Per the dispatch's explicit recommendation ("Recommendation against
bundling C1 and C2 stands. Ship the bug fix; the refactor benefits
from C1's clearer seams and shouldn't block on the bug fix's
review."), C1 is strictly the modal restoration. The App.vue refactor
(C2) and the deferred-items entries (LoadAction type widening; silent
guard cleanup) stay parked — both are explicitly scheduled for "next
time the file is touched substantively," and ADR-0004 says don't
sweep on the side of a targeted bug fix.

`ConfirmLoadModal.vue` itself does not need changes. It is correct
as-is (the type-vs-emission smell at line 9 is a deferred-items
entry, not a C1 concern). The component already exposes
`open(): Promise<LoadAction>` via `defineExpose`, which is what the
guard at `App.vue:109` calls.

### Edits to `frontend/src/App.vue`

Two minimal additions plus one ref-type tightening:

1. **Import** the component. Add an entry to the import block at
   lines 34–46:

   ```typescript
   import ConfirmLoadModal from './components/ConfirmLoadModal.vue';
   ```

   Alphabetical placement is the local convention; insert near the
   other modal imports (currently `MintCardModal` at line 44).

2. **Tighten the ref type** at `App.vue:95`. With `ConfirmLoadModal`
   imported, `vueRef<any>` is no longer necessary:

   ```typescript
   const confirmLoadModalRef = vueRef<InstanceType<typeof ConfirmLoadModal> | null>(null);
   ```

   This is in scope because the import that motivates it is C1 work,
   not a sweep — and removing the `any` tightens an ADR-0002 rule-2
   site (justified type, no `as any` needed).

3. **Mount** the component. Add `<ConfirmLoadModal ref="confirmLoadModalRef" />`
   inside the template root, before the closing fragment at
   line 482. Place it alongside other singleton-modal mountings if
   any exist; otherwise mount at top level so it overlays via its
   own `position: fixed` modal-backdrop. (Re-read the template tail
   during execution to pick the right insertion point — App.vue is
   591 lines and ADR-0004's minimal-touch discipline says place
   precisely.)

That is the entire C1 patch. No backend coordination, no contract
change, no migration.

## Critical files

- **Edited:** `frontend/src/App.vue` (three small additions; lines
  ~34–46, line 95, and one line near line 482).
- **Read but not edited:** `frontend/src/components/ConfirmLoadModal.vue`
  (already exposes `open()` correctly).
- **Read for click-chain verification only:**
  `frontend/src/components/charts/LineageTreeChart.vue` and
  `frontend/src/components/ForestDirectory.vue`.

## Reused existing surface

- `ConfirmLoadModal.open()` — already returns
  `Promise<'new' | 'overwrite' | 'cancel'>` (with the `-saved`
  suffix smell per `defineExpose` at `ConfirmLoadModal.vue:15–23`).
  `handleLoadCardFromDatabase` at `App.vue:97–141` already handles
  all six emitted variants correctly (`endsWith('-saved')` check on
  line 112).
- `updateRegistry(...)` — `App.vue:114` persists the
  remember-the-choice path; already wired.
- `actionOnDirtyBoard` setting in
  `store.profile.settings.navigation` — already read at line 104.

No new composable, no new service, no new types.

## Verification

1. **Static check.** `cd /home/bork/omega/frontend && npm run build`.
   Expect green. The ref-type tightening is the only place that
   could surface a TypeScript error; if it does, fall back to
   `vueRef<{ open: () => Promise<'new' | 'overwrite' | 'cancel'> } | null>`
   or revert to `vueRef<any>` and note the deferred-items follow-up.

2. **Manual end-to-end** in dev (`npm run dev`):

   - **Empty-board path (regression check).** Open the app, switch
     to the Database tab, click any card. Expect: card loads
     immediately, no modal. (`nodeCount > 1` is false on a fresh
     board, so the guard is bypassed by design — this confirms the
     no-regression case.)
   - **Dirty-board, Cancel.** Load any SGF or play a move so the
     active board has more than one node. Switch to Database, click
     a different card. Expect: modal opens; Cancel closes it; no
     load occurs.
   - **Dirty-board, Overwrite Current.** Same setup; click
     Overwrite. Expect: the current board is replaced with the
     clicked card's position; one tab.
   - **Dirty-board, Open in New Tab.** Same setup; click Open in
     New Tab. Expect: a new board is created, the clicked card
     loads into it, the original board is preserved.
   - **Remember-my-decision flow.** Same setup; check the box;
     click Overwrite. Expect: subsequent dirty-board clicks load
     directly without the modal (because
     `navigation.actionOnDirtyBoard` is now `'overwrite'`). Reset
     to `'ask'` via the settings tab to repeat tests.

3. **Console hygiene.** No unhandled promise rejection, no
   `Failed to load card into board` errors except on intentionally
   malformed SGFs.

## Out of scope (explicitly)

The following surfaced during cross-check but should NOT be folded
into C1:

- **C2 (`App.vue` refactor)** — the dispatch and ADR-0007's
  refactor queue both name App.vue (591 lines) as the next
  structural target; the dispatch explicitly says not to bundle.
- **`LoadAction` type widening** in `ConfirmLoadModal.vue:9` — the
  `as LoadAction` cast at line 30 emits `'new-saved'`/`'overwrite-saved'`
  values that are not in the type union. Tracked in
  `docs/notes/deferred-items.md`; resolved when the file is next
  touched substantively (we are not).
- **Silent-guard cleanup** at `App.vue:107` — the
  `if (!confirmLoadModalRef.value) return;` is itself an ADR-0002
  violation (silent fallback). Tracked in
  `docs/notes/deferred-items.md`; resolved during C2 at the
  latest. After C1 lands, the guard becomes unreachable in
  practice (the ref is always bound), so the urgency drops.
- **ADR-0007 flip from Proposed → Accepted** — authorial decision,
  user's call.
- **Manual stale-token-drift smoke test** (auth UX final
  validation per the dispatch's apply queue step 4) — separate
  workstream; can be done before, during, or after C1 without
  interaction.

## Documentation follow-up

Per ADR-0005 / the umbrella `CLAUDE.md`'s "documentation is part of
the work" rule, after C1 lands:

- **`docs/notes/deferred-items.md`** — "Silent guard fail in
  handleLoadCardFromDatabase" entry has a "Suggested next action"
  noting it would resolve during C2 at the latest. After C1 the
  guard becomes unreachable in practice; the entry can stay as-is
  (still valid, still pointing at C2 as the eventual cleanup site)
  but consider a one-line annotation that C1 reduced its urgency.
- **`docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`** —
  the receiving session has been the present one; per ADR-0005,
  consider whether a closing dispatch ("C1 shipped; C2 still
  open") is warranted, or whether a commit message + this note in
  deferred-items is sufficient. My weak preference: skip the
  closing dispatch unless the work continues across another
  session boundary; the dispatch ledger pattern is for cross-team
  comms, and frontend-to-frontend self-handoff is on the boundary
  of warranting it.
- **`docs/TODO.md`** — no entry to retire (C1 was tracked in the
  dispatch, not TODO).
