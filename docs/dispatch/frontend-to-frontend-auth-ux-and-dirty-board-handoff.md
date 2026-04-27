# Frontend → Frontend: Auth UX Refactor + Dirty-Board Bug — Session Handoff

- **Date:** 2026-04-26
- **From:** frontend (outgoing session)
- **To:** frontend (incoming session)
- **Type:** handoff
- **Status:** auth UX roadmap closed (B1–B5); dirty-board guard bug
  diagnosed but not yet executed
- **Suggested filing:** `docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`
  per ADR-0005's dispatch ledger convention.

## Closed milestones

### Auth UX roadmap (B1–B5) — complete

State lives in `composables/useAuth.ts` as a discriminated `AuthState`
union. Public surface: `state`, `isAuthenticated`, `username`,
`tryAutoLogin`, `login`, `register`, `logout`. Storage-key invariant
owned exclusively by `api-client.ts` (the only file that reads or
writes `localStorage` for auth keys, via `cachedUsername()` and
`clearToken()`). Backend-verified identity via `/auth/me` with three-
branch handling (200 / 401 / non-401 network failure) per ADR-0002.

### ADR-0007 drafted (Status: Proposed)

File size and information density, including the format-by-edit-cadence
rules: CSS aggressive contraction, templates moderate, TypeScript
decision logic untouched, soft column cap ~120. Awaiting sign-off to
flip to Accepted.

### `adr-synopsis.md`

1–2 paragraph LLM-orientation summary of all seven ADRs.

### Cross-team comms filed

- `frontend-to-backend-auth-me.md` (request)
- `backend-to-frontend-auth-me-status.md` (reply; backend confirmed
  `/auth/me` shipped with the wire contract verbatim)

Both filed per ADR-0005's dispatch ledger convention.

## Artifacts in `/mnt/user-data/outputs/` (current as of session end)

- `0007-file-size-and-information-density.md` (Proposed)
- `adr-synopsis.md`
- `frontend-to-backend-auth-me.md`
- `api-client.ts` (B5 — has `getMe`, `clearToken`, `cachedUsername`)
- `useAuth.ts` (B5 — has `_setAuthenticatedAfterVerify` helper, all
  three callers updated)
- `UserBadge.vue` (B4 — ADR-0006 retrofitted)
- `LoginModal.vue` (B4 — has logout button, ADR-0006 retrofitted)

## Pending — apply queue

1. Drop the seven artifacts into the codebase.
2. Apply the one-line `types.ts` diff for B5: `userId?: number` on the
   `authenticated` variant.
3. Confirm `npm run build` is green.
4. Test the stale-token-drift scenario (Firefox with mismatched
   localStorage token).
5. File `0007-file-size-and-information-density.md` and flip to
   Accepted when ready.

## Active concern — dirty-board guard bug

**Symptom.** Clicking a tree node when the board has content silently
fails. Empty board works.

**Diagnosis so far.** `App.vue` has a `handleLoadCardFromDatabase`
handler that consults `store.profile.settings.navigation.actionOnDirtyBoard`
(`'ask'` / `'new'` / `'overwrite'`, default `'ask'`). When `'ask'` and
`nodeCount > 1`, it tries to open `confirmLoadModalRef.value`.
`ConfirmLoadModal.vue` is no longer imported or rendered in `App.vue`
(grep confirms zero references outside the file's own header), so
`confirmLoadModalRef.value` is always `null`, and the guard early-
returns silently for every default-settings user. ADR-0002 violation:
silent guard fail.

**`ConfirmLoadModal.vue` reviewed.** Clean component, exposes
`open(): Promise<LoadAction>`. One type smell — `LoadAction` declared
as `'new' | 'overwrite' | 'cancel'` but actually emits `'new-saved'`
or `'overwrite-saved'` via an `as LoadAction` cast. Handler in
`App.vue` correctly checks `endsWith('-saved')`. Cleanup-when-touched,
not blocking.

## Pending — files needed to proceed on the bug

1. **Full `App.vue`.** Need to verify (a) the imports and template
   confirm `ConfirmLoadModal` is missing, (b) which handler the tree
   click actually hits — could be `handleLoadCardFromDatabase` (fix is
   mechanical: restore the modal) or a separate handler that bypasses
   the guard entirely (fix has two parts: restore modal + route tree-
   click through the same guard).
2. **The tree component that emits the click.** Probably
   `LineageTreeChart.vue`. Need to see the `@click` / `emit` site to
   trace which `App.vue` handler it reaches.

## Roadmap — agreed shape, not yet executed

- **C1 — fix the dirty-board guard bug.** Restore modal mounting in
  `App.vue`; route tree-click through the same guard (whichever shape
  that takes once the file is visible). Bug-scoped, minimal-touch.
- **C2 — App.vue refactor.** Deferred until C1 lands. Likely shape
  (subject to revision once full file is visible): extract
  `useDirtyBoardGuard` (owns modal-ref + three-branch policy + ask
  flow), possibly `useCardLoader`, possibly `useAppBootstrap`, possibly
  `useResizablePanel`. Refactor as repeated extraction of clear seams,
  not wholesale rewrite. Aligns with ADR-0007's incremental-retrofit
  posture.

**Recommendation against bundling C1 and C2 stands.** Ship the bug
fix; the refactor benefits from C1's clearer seams and shouldn't block
on the bug fix's review.

## Parked observations (no action required)

- **Serial-numbers RFC** for compiler-generated artifacts — ADR-shaped
  concern, mentally filed, no further action per outgoing user
  instruction.
- **Diffs-vs-artifacts prescription** — user committed to adding the
  one-sentence rule somewhere. Honored throughout the session: full
  files always go in artifacts, diffs go inline in diff code blocks.

## Critical meta-lessons retained from session

- **View-tool truncation markers indicate MISSING ranges, not short
  ranges.** Reconstructing from inference produced fabricated content
  earlier in this session and contaminated downstream reasoning. Don't.
- **Repomix is stale for files being edited, not just files being
  read.** Always work from the current canonical copy when modifying.
- **Full files in artifacts; diffs inline in diff code blocks.** User's
  explicit prescription.
- **Decision-laundering is the failure mode after correction.** When
  chastened, the assistant drifts toward asking permission instead of
  using judgment. Corrective: ship the artifact, let the user push
  back if wrong.
- **When new context loads, immediately re-audit prior outputs.** The
  grep that caught the stale "third tenet" claim in ADR-0007 was
  something the assistant should have run itself the moment it had
  finished reading ADR-0005 and ADR-0006.

## Resumption protocol

To resume cleanly, the incoming session should be given:

1. This handoff document.
2. `repomix-frontend.xml` and `repomix-docs.xml` for full orientation.
3. `App.vue` (current canonical copy) and the tree component that
   handles node clicks (likely `LineageTreeChart.vue`).

C1 should land in one or two turns from there.
