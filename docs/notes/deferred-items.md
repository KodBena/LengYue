# Deferred Items — Active Ledger

- **Status:** Active. Items land here the moment they surface; they
  leave when they're addressed (with a brief note describing the
  outcome) or get promoted to `docs/TODO.md` when their priority
  rises.
- **Genre:** Working-memory offload for items that don't yet warrant
  a TODO entry, an ADR, or a deferred-decisions entry, but which
  would otherwise be lost.
- **Distinct from:**
  - `docs/TODO.md` — actively scheduled work.
  - `docs/notes/decisions-deferred.md` — decisions explicitly made
    *against* action, with revisit triggers. Items here haven't
    been decided either way; they're in the queue to *think about*.
  - `docs/adr/` — decisions that have fired.

## How to use this file

When something surfaces during work that doesn't fit anywhere else
yet — a code smell flagged in passing, an audit that should
happen but isn't scheduled, an RFC idea, an inconsistency that
needs resolving — append it here with a date and one paragraph.
Don't agonize over the wording; the goal is preventing loss, not
producing a polished record.

When an item is addressed, replace its body with a one-line
outcome and the date, leaving the entry visible as historical
record. When an item turns out to deserve a proper TODO entry, an
ADR, or a decisions-deferred entry, move it there and remove from
this file.

---

## Open items

### ADR-effectiveness audits

- **Surfaced:** 2026-04-26.
- **Concern:** The seven ADRs (especially the four tenets:
  ADR-0002, ADR-0004, ADR-0005, ADR-0006, with ADR-0007 newly
  proposed) are policy, not mechanism. Their adoption is assumed,
  not measured. A periodic audit pass — "where in the codebase
  does this tenet not currently hold, and why" — would surface
  drift before it ossifies. ADR-0002 is the most overdue: a
  codebase-wide sweep for silent retries, swallowed errors,
  sentinel-instead-of-throw, ACL-coercion-instead-of-validate,
  and empty catches has not been done since the tenet was
  adopted. ADR-0007 will need its own audit once accepted (file
  size, density, formatting compliance). The discipline itself is
  ADR-shaped: an ADR-0008 or similar that prescribes how and when
  ADRs get audited would close the loop.
- **Suggested next action:** Decide whether the audit cadence is
  itself an ADR (likely yes) or an ad-hoc TODO item per ADR
  (likely no — too easy to forget). Probably an ADR that
  prescribes a per-tenet audit checklist, an audit ledger
  destination, and a cadence trigger (every N months, or every
  major umbrella event).

### Serial numbers on compiler-generated artifacts

- **Surfaced:** 2026-04-26.
- **Concern:** Generated files (notably `frontend/src/types/backend.ts`)
  are correlated to a known backend state only by external
  knowledge ("I just ran `npm run gen:api`, so this is current").
  When a frontend agent receives a generated file out of band,
  there's no in-file marker that says which backend revision /
  commit / build it corresponds to. A short serial — could be a
  timestamp, a content hash, a git SHA snippet, or a
  monotonically incrementing integer — embedded in a header
  comment of generated files would let downstream readers (human
  or LLM) verify they're working against the version they think
  they are.
- **Suggested next action:** Draft an RFC that proposes the
  serial format, the generation hook (where does the serial come
  from), the embedding location (header comment vs. constant
  export), and the consumer-side validation pattern. No
  implementation work until the RFC is reviewed.

### LoadAction type is dishonest (ConfirmLoadModal.vue)

- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `ConfirmLoadModal` now
  exposes `Promise<LoadResult>` with the structured
  `{ action, remember }` pair — the more honest shape recommended
  in the original entry. The `as LoadAction` cast is gone.

### Silent guard fail in handleLoadCardFromDatabase (App.vue)

- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `useDirtyBoardGuard`
  owns the policy; the silent early-return is replaced with an
  explicit `throw new Error(...)` if the modal ref is null at
  handler-call time. The handler in App.vue no longer exists;
  the contract is documented in the composable's JSDoc.

### Engine connection lifecycle on logout (deployment-model-dependent)

- **Surfaced:** 2026-04-27 (during auth-lifecycle UX planning,
  in dialogue with the user about the breakdown of "engine"
  state across user-owned vs runtime).
- **Concern:** `resetWorkspace` (added to `store/index.ts`)
  resets boards, activeBoardIndex, profile, and session on
  auth-identity loss but intentionally does NOT reset
  `store.engine` (status, metrics, activeMode, messages). The
  reasoning: under today's local-machine deployment, the
  WebSocket URL (`ws://127.0.0.1:8765/katago` per
  `defaults.ts:13`) is not user-keyed; User A's URL == User B's
  URL == default in practice, so the same physical socket
  serves both honestly. Half-resetting `store.engine` (e.g.,
  flipping `status` to `'disconnected'` while the socket is
  still open) would create a real ADR-0001 violation — runtime
  state lying about reality.
- **Trigger to revisit:** Any deployment-model shift that makes
  the WebSocket URL user-keyed. Concrete cases:
  - Cloud-compute KataGo where each user has a paid endpoint.
  - Rented per-user analysis (library / shared institution
    setting where users have distinct accounts on a
    shared-but-multi-tenant analysis service).
  - Auth-bearing analysis tokens (any setup where the
    WebSocket carries identity-specific credentials).
- **Suggested next action when triggered:** Extend
  `resetWorkspace` to also reset `store.engine` to its
  initial-construction shape (matching the literal at
  `store/index.ts:38–48`), AND wire
  `analysisService.disconnect()` (or the equivalent) into the
  reset path so the actual WebSocket tears down. The
  `analysisService` would need to expose a `disconnect()`
  method if it doesn't already; coupling the reset to the
  service is acceptable at that point because the engine
  becomes part of the user-identity dimension.
- **Adjacent observation:** The user's pushback during this
  planning that prompted the entry was structurally
  illuminating — the original framing ("machine-level vs
  user-level") didn't survive scrutiny because the user IS in
  control of connect/disconnect. The honest framing is
  user-keyed-or-not; this entry preserves that distinction
  for the future revisit.

### Tags-fetch hydration race (useAppBootstrap.ts)

- **Surfaced:** 2026-04-27 (during B5 finalization / identity-aware
  SyncService rework).
- **Concern:** `useAppBootstrap.onMounted` fires
  `ebisuService.getTags()` concurrently with `sync.connect()`'s
  hydration. If `getTags()` wins the race, the store mutation
  `store.profile = { ...store.profile, knownTags: ... }` runs
  first; then hydration's `updateFromRemote(doc.data)` overwrites
  the entire profile, dropping `knownTags`. Pre-existing; benign
  in practice (knownTags is re-fetchable on demand and isn't
  user-authored data), but it's a real ordering bug that an audit
  should pick up. Belongs to the same general category as the
  identity bug just closed in B5 finalization (race on async
  store mutations during boot).
- **Suggested next action:** Either await `sync.connect()`'s
  initial hydration before the tags fetch (requires sync to
  expose a `whenHydrated()` promise or similar), or move
  `knownTags` to a separate composable that watches
  `store.profile` and re-applies after any identity change.
  Defer to a future B-arc-style refinement; not blocking.

### Refactoring queue from ADR-0007

- **Surfaced:** 2026-04-26 (during ADR-0007 drafting).
- **Concern:** Files failing ADR-0007's single-view test (red
  flag, > 300 lines) need to be queued for refactoring. The
  candidates from the audit done at draft time:
  - `App.vue` (591 lines) — god component; first target after B5.
    Becomes C2 of the navigation-guard milestone sequence.
  - `HorizontalTimelineVisualizer.vue` (371 lines).
  - `useReviewSession.ts` (371 lines) — likely state-machine
    exception applies; verify before refactoring.
  - `PaletteEditor.vue` (352 lines).
  - `BaseChart.vue` (331 lines).
  - `MintCardModal.vue` (310 lines).
  - `types.ts` (387 lines) — type-catalogue exception applies; no
    action needed unless a clean domain seam appears.
  Yellow flag (200–300): `CardSetEditor.vue`, `TreeWidget.vue`,
  `MoveSuggestions.vue`, `BoardDisplay.vue`. Review on next touch
  per ADR-0007.
- **Suggested next action:** No batch refactor — handle
  incrementally per ADR-0004's posture. App.vue is the highest-
  priority target because it's the largest and because its
  contents (multiple orchestration patterns competing in one
  file) actively cause confusion during navigation-guard work.

---

## Closed items

*(none yet)*
