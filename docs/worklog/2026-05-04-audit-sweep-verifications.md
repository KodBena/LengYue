# Audit verification sweep (O5, O6, O11, O15)

- **Status:** Shipped on `frontend/audit-sweep-verifications`,
  2026-05-04. Build green.
- **Genre:** Mixed — two verification confirmations (O6, O15)
  with explanatory code comments only, two latent-bug fixes
  (O5, O11) where the verification surfaced real misbehavior
  rather than a benign bounded leak.
- **Date:** 2026-05-04.

## Context

The Pass-1 inventory had four pairs framed as "verification
work, possibly worklog-only with no code change":

- **O5** — `useReviewSession.pendingAnalysisAborts` entry for a
  closeBoard'd board.
- **O6** — `KataGoClient.subscribers` map verification.
- **O11** — `useReviewSession.pendingAnalysisAborts` on
  resetWorkspace.
- **O15** — `analysisService` per-board maps after WS
  disconnect/reconnect.

The pitch entering this PR was "easy verifications swept into
one PR." Two of the four held up; two surfaced real latent
bugs that the inventory's "bounded; controllers GC-eligible"
disposition had been too generous about.

## What changed

### O6 — KataGoClient.subscribers (verified clean, no code change)

Trace: `subscribers: Map<id, Set<callback>>` is added-to only by
`KataGoClient.subscribe`. The returned unsub closure deletes the
callback and shrinks the Map entry when its Set goes empty.
Three subscribe call sites:

1. `analysisService.analyzeRange` / `analyzeActiveNode` — store
   the unsub in `activeSubscriptions[boardId]`. `stopBoardAnalysis`
   calls it. Already covered by the C17 closure in the inventory.
2. `KataGoClient.sendCommand` — internal one-shot. Calls
   `cleanup()` inside its own callback after the first response.

Edge case: if the WS disconnects between a `sendCommand`'s send
and its response, the response never arrives, the cleanup never
fires, and the subscribers entry persists. Watchdog (5s
`query_version`) and stop (`terminate`) are the two production
sendCommand callers; both are bounded in count and the residue
gets overwritten on the next connect-cycle's fresh subscribes.

Verdict: **as-designed.** The protocol-state framing in §"Primary
taxonomy" doesn't surface anything actionable here. No code
change in this PR; the as-designed comment for the subscribers
side rides with the O15 comment in `analysisService.onDisconnect`
(which names both O15 and O6 as the same shape of behavior).

### O15 — analysisService per-board maps on WS disconnect (verified clean, comment added)

Trace: `onDisconnect` clears timers and `activeMode = {}` but
not `activeQueryIds` / `activeSubscriptions` / `activeQueries`
/ `restartCallbacks`. Those carry closures over the now-dead WS.

On reconnect, each new `analyzeRange` / `analyzeActiveNode` call
runs `stopBoardAnalysis(boardId)` first. That call:
- Invokes the stale unsub closure → deletes the dead-WS callback
  from `KataGoClient.subscribers` (subscribers Map carries
  through reconnect — same as-designed behavior).
- Sends a `terminate` over the new WS for the prior queryId. The
  proxy doesn't recognize the prior queryId (its canonical was
  killed by the WS disconnect), so the terminate is a no-op
  proxy-side. Cosmetically wrong; functionally fine.
- Clears the per-board maps.

Then the new subscribe runs cleanly.

Verdict: **as-designed; bounded transient junk.** Added an
explanatory comment in `onDisconnect` naming the audit pair and
the cosmetic-not-functional framing. Future maintainers
reading the disconnect path will see why the maps aren't
cleared and understand the as-designed contract.

### O5 — closeBoard mid-review (latent bug confirmed; fix shipped)

The inventory's framing: "Small leak; downstream waitForAnalysis
will time out and the controller becomes GC-eligible."

The verification trace went deeper than the inventory's
disposition: when `closeBoard` fires while a review is in
ANALYZING state, the AbortController stays in
`pendingAnalysisAborts[boardId]`. 30 seconds later
`waitForAnalysis` rejects with `AnalysisWaitError('timeout')`,
which routes through processUserMove's catch:

```ts
if (err.reason === 'timeout') {
  pushSystemMessage('warning', `KataGo did not respond...`);
  mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
}
```

Two user-visible bugs:

1. The "KataGo did not respond" toast fires 30 seconds after
   closing a board — visibly confusing.
2. `mutateReviewSession` lazily re-creates the
   `store.session.reviews[boardId]` row that the O2 fix
   (PR #125) had just deleted; the resurrected row syncs to
   the backend, polluting the user's persistence document.

Verdict: **not a bounded leak; a real bug.** Fix: abort the
controller in closeBoard so the catch takes the 'aborted'
branch (silent return) rather than 'timeout'.

Implementation needed an architectural shift:
`pendingAnalysisAborts` was a function-local Map inside
`useReviewSession`. closeBoard couldn't reach it. Two paths
considered:

- (a) Plumb an abort callback through useReviewSession's return
  shape, have App.vue or the SidebarWidget close handler wire
  it to closeBoard.
- (b) Move the registry to module scope so it's importable.

Path (b) is cleaner and matches the runtime reality: the
docstring on `pendingAnalysisAborts` already noted "this
composable is instantiated once per App.vue setup" — the
function-local Map was implicitly a singleton. Module-scope
honestly reflects that, and exposes the abort affordance via
named exports without composable-API growth.

Concrete edits:

- `useReviewSession.ts`: declared `pendingAnalysisAborts` at
  module scope alongside two new exports — `abortBoardReview`
  and `abortAllReviews`. The function-local declaration becomes
  a comment pointing at the module-scope version. Existing
  consumers (`processUserMove`, `loadCard`) keep working via
  closure over the module-scope name (lexical resolution
  unchanged).
- `store/index.ts`: imports `abortBoardReview`,
  `abortAllReviews` from useReviewSession. closeBoard adds a
  call to `abortBoardReview(boardId)` after the existing
  cleanups; resetWorkspace adds `abortAllReviews()` next to
  the existing identity-flip cleanups.

closeBoard's docstring grows from "Four cleanups" to "Five
cleanups" with O5 named. resetWorkspace's docstring gets a new
paragraph about the review-wait abort and updates its audit
pair list to include O11.

### O11 — resetWorkspace mid-review (latent bug confirmed; fix shipped)

Same shape as O5 but on identity flip. The trace is even more
concerning: after `resetWorkspace`, `store.session` is replaced
wholesale with a fresh empty session for the new identity. If a
prior-identity AbortController fires its 30s timeout 30 seconds
into the new identity's session, the catch's `mutateReviewSession`
writes a row keyed to the **prior identity's BoardId** into the
**new identity's** `store.session.reviews` — that row then
syncs to the new user's backend document.

Not a privacy concern in payload (just an empty IDLE row, no card
content), but it's nonzero pollution of the new user's data with
phantom BoardIds.

Fix: `abortAllReviews()` in resetWorkspace, sharing the
infrastructure introduced for O5. One additional call.

## Why one PR for all four pairs

The user's framing was "sweep the easy verifications into one
PR." Two of the four turned out to need fixes, but the fixes
share infrastructure (the `abortBoardReview` /
`abortAllReviews` exports introduced for O5 are also what O11
needs), and the verifications-only pairs (O6, O15) are
naturally bundled with the analysisService.onDisconnect comment
that handles both.

The bisect-strict alternative would be three commits in this
PR:

1. useReviewSession module-scope refactor + closeBoard wiring
   (O5).
2. resetWorkspace wiring (O11).
3. analysisService onDisconnect comment (O6 + O15).

Decided against: the infrastructure-only refactor in (1) without
(2) leaves a half-wired exports surface that ships unused for
one commit; bisect across the boundary would be confusing rather
than clarifying. One commit covering O5 + O11 + O6 + O15 (with
the worklog naming each pair's disposition) is the cleanest
shape for a sweep.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- O5 manual reproduction: open board A, start review, place
  one move (status → ANALYZING), close board A. Pre-fix:
  ~30s later, "KataGo did not respond..." toast appears AND
  `store.session.reviews` carries a fresh `[A]: {status: IDLE}`
  row. Post-fix: no toast, no resurrection — `closeBoard`'s
  abort routes the await through the 'aborted' silent-return
  branch.
- O11 manual reproduction: same setup, but trigger logout
  mid-review instead of close-tab. Pre-fix: same toast +
  `store.session.reviews[A]` row appearing in the new
  identity's session. Post-fix: clean.
- O15 / O6: no functional change to verify; the comment in
  onDisconnect documents the as-designed contract.
- Non-regression: normal review flow (start → analyze →
  finish, no mid-review interruption) is unchanged. The
  abort exports are no-ops when no waits are pending.
- Non-regression: HMR reload during a mid-review state still
  works; the existing
  `analysisService.stopAllBoardAnalyses()` HMR dispose path is
  separate from the review-wait abort and doesn't need this
  PR's changes.

## Forward notes

After this PR:

- closeBoard owner: O1 (#119, #120), O2 + O3 (#125), **O5
  (this PR)**. O4 and O6 closed-by-verification (O6 in this
  PR's onDisconnect comment).
- Identity / resetWorkspace owner: O7 (#121), O10 (#122),
  **O11 (this PR)**. O8 and O9 still open (bounded memory
  hygiene candidates).
- Component lifecycle owner: closed (#123, #124).
- Engine WS reconnect owner: **O15 closed-by-verification
  (this PR)**.

After this PR's merge, **only three pairs remain open: O4
(useThumbnailCache board-purge), O8, and O9** (the latter two
ledger / useThumbnailCache resetWorkspace flushes — the
"bounded memory hygiene" pairs).

The remaining three are all small, all bounded, and all
debatable between "ship a small fix" and "document the
deferral." A future session could close all three in one PR
using the same sweep pattern as this one, or pick them off
individually.

After Pass 2 completes (or stabilizes at three open pairs that
are explicit deferrals), Pass 3 — the forward-authoring
discipline — closes the audit. The Pass-1 closeout note
identified the recurring shape Pass 3 codifies: "per-entity
Map/Set state in a service or composable singleton reliably
gets a dispose/disconnect cleanup path, but inconsistently
gets an entity-removal cleanup path."

## Note on the inventory's framing

This PR is a small honesty marker against the Pass-1
inventory's dispositions. O5 and O11 were dispositioned as
"bounded; controllers GC-eligible after waitForAnalysis
settles" — a benign-leak framing. The verification revealed
that "after waitForAnalysis settles" includes the timeout
branch's user-visible toast and the reviews-row resurrection,
neither of which are benign.

The inventory's process worked: Pass-1 flagged the pairs as
"suspected open," Pass-2 verified, the verification rejected
the "benign" disposition, the fix shipped. But the inventory
itself could have been more honest — the disposition column
should have noted "verify whether timeout branch is harmful
post-closeBoard" rather than pre-judging it benign. Minor
lesson for future audit Pass-1 walks: if the verification
question is non-trivial, frame it as a question rather than
pre-supplying a "likely benign" answer.

Not worth retro-editing the inventory; the worklog captures
the lesson.
