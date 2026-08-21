# Design proposal: deck repetition (back/forward navigation with retained session data)

Status: proposal, not implemented. Commissioner-facing. Author: read-only design
survey of `useReviewSession.ts` and its delegates end-to-end.

## 1. Survey — what is discarded today, and why

Reclassified from the wiki's Hotkeys section by the maintainer: "Repeating a
deck (going back and forth between cards; would require extending the
programmatic interface so that data is not discarded when moving on to the
next one)." The survey below establishes exactly what "data" means and where
it dies.

### 1a. The per-card session record

`ReviewSessionData` (`frontend/src/types/cards.ts:254-268`) is the entire
state a review session carries, and it is **not per-card** — it is a single
mutable slot the running card overwrites:

```
status, queue, currentIndex, startingNodeId,
userMovesCount, userMoveScores, visitsOverride
```

`currentIndex` is a bare array position into `queue: ReviewCard[]`
(`cards.ts:256-257`). There is no second axis distinguishing "the card I'm
on" from "cards I've already seen this session" — advancing overwrites the
one slot in place.

### 1b. `loadCard` is the teardown site (`useReviewSession.ts:297-384`)

Every transition — including the existing forward-only `nextCard()`
(`useReviewSession.ts:655-670`) — routes through `loadCard(index)`, which:

- Resets `userMovesCount = 0`, `userMoveScores = []`, `visitsOverride = null`
  unconditionally (`useReviewSession.ts:314-320`) — the outgoing card's
  attempt and its per-move grade array are gone the instant this runs, with
  no read-back anywhere else in the file.
- **Replaces the entire board object.** `updateBoardState(existingIdx,
  parsedBoard)` (`useReviewSession.ts:337`) swaps in a *freshly re-parsed*
  `BoardState` built from `card.canonicalContent` — the pristine, as-minted
  SGF, not the tree the user was just playing on. The outgoing board's node
  tree (the user's played moves, sitting as children past the SGF's original
  leaf per `applyGoMove`'s append shape) is dropped in the same statement;
  nothing captures it first.
- **Re-parsing mints fresh, non-deterministic `NodeId`s.** `loadSgf`'s id
  factory is `const uuid = () => Math.random().toString(36).substring(2, 7)`
  (`frontend/src/engine/sgf-loader.ts:33`, consumed at `sgf-loader.ts:149`).
  Two parses of the *same* `canonicalContent` produce disjoint `NodeId`
  spaces. This is the load-bearing fact for the option space below: the
  analysis ledger (`state/analysis-ledger.ts`) is keyed by `NodeId`
  (`useReviewSession.ts:591`, `ledger.getEnrichment(keys.enrichedKey,
  nodeId)`), so **a re-parse can never reattach to previously-computed
  analysis** — the identity that keys the packets is gone by construction,
  independent of whether the packets themselves are still cached.

### 1c. The ledger is not purged on card-advance — it's just orphaned

`closeBoard` (`store/index.ts:560-645`) is the only routine that purges the
analysis ledger, via `runBoardCloseHandlers` → the `analysis-ledger:purge`
/ `stability-trajectory:purge` handlers (documented in `closeBoard`'s O1
cleanup, `store/index.ts:445-456`). `loadCard`/`nextCard` never call
`closeBoard` — they mutate the same `BoardId` in place. So a card the user
has moved past leaves its analysis packets sitting in the ledger, unpurged,
but permanently unreachable (per 1b, the next visit's `NodeId`s won't match
even for the same card). Dead weight, not usable state — and not currently
identified as a leak because the board never closes to trigger an audit.

### 1d. Grading is a single, non-idempotent write

`finishCard()` (`useReviewSession.ts:631-653`) fires exactly once per card,
when `userMovesCount.value >= currentCard.value!.numMoves`
(`useReviewSession.ts:613`), and calls
`backendService.submitReview(currentCard.value!.id, userMoveScores.value)`
→ `POST /cards/{cardId}/review` (`services/backend-service.ts:177-180`).
This is the **only** write path into the Ebisu scheduling model. There is no
idempotency guard on the backend call site or in `finishCard` — nothing
stops a second `submitReview` for the same card from firing if `finishCard`
were re-entered. Any repetition design that lets the user "redo" a finished
card must treat this as a single-fire event per genuine attempt, not
something back-navigation can accidentally re-trigger.

### 1e. "Seen card in this session" has no identity today

There isn't one. `currentIndex` names *the* card; nothing records that
index 3 was already visited, what its board looked like, or whether it was
finished. Any repetition feature has to introduce this identity from
scratch — it is the actual "programmatic interface extension" the
maintainer's note points at.

## 2. Option space (justified)

The three shapes below are the ones the current architecture actually
supports without a wire-contract change; each is evaluated against what 1b
already proved: **ledger reattachment requires NOT re-deriving `NodeId`s.**

### (a) Session-scoped per-visit snapshot map, keyed by queue index

A module-scope `Map<BoardId, Map<number, CardVisitSnapshot>>` — same idiom
as the existing `pendingAnalysisAborts` registry at the top of
`useReviewSession.ts` (module-scope, board-keyed, with explicit
`registerBoardCloseHandler`/`registerWorkspaceResetHandler` teardown,
`useReviewSession.ts:151-167`). Keyed by **queue index**, not `CardId` —
the queue can in principle repeat a card, and index is already the
session's own identity for "which slot am I on" (`cards.ts:257`).

`CardVisitSnapshot` fields (enumerated from the survey, 1a/1b):

```
{
  status: 'AWAITING_MOVE' | 'FINISHED',   // never LOADING/ANALYZING — a snapshot
                                            // is only taken at a settled instant
  userMovesCount: number,
  userMoveScores: number[],
  visitsOverride: number | null,
  startingNodeId: NodeId,
  board: BoardState,   // a plain-JSON clone, NOT a live reactive board
}
```

`board` is captured via the codebase's own established deep-clone idiom for
POJO-shaped reactive state — `JSON.parse(JSON.stringify(toRaw(board)))`
(the `structuredClone`-cannot-clone-reactive-state footgun,
`frontend/CLAUDE.md` "Vue/CSS footgun checklist"). Critically, this clone
preserves the `NodeId` *string values* verbatim — they're plain strings, not
proxies — so **the ledger keying survives the snapshot round-trip**. On
restore, the snapshot's board is installed via `updateBoardState`, and
because its `NodeId`s are the ones already used when the analysis for that
visit ran, `ledger.getEnrichment(...)` resolves exactly as it did live — no
re-query to KataGo needed for a card visited earlier in the same session,
*provided the ledger entries haven't been purged* (1c already established
they aren't, on card-advance).

**Programmatic interface:**

```
goBack(): boolean       // snapshot current slot, restore currentIndex - 1
goForward(): boolean    // snapshot current slot, restore currentIndex + 1 (or loadCard if unvisited)
jumpTo(index: number): void
```

Each snapshots the *outgoing* slot's live state before switching (same
shape as `loadCard`'s pre-transition cleanup at `useReviewSession.ts:304-309`
— cancel any in-flight `pendingAnalysisAborts` entry first, since
mid-`ANALYZING` navigation isn't snapshottable and should abort like
`loadCard` already does). If the target slot has no snapshot (never
visited), fall through to today's `loadCard(index)`.

**SRS integrity.** A restored `FINISHED` snapshot enters a **view-only**
mode: the board, the played line, and its analysis are inspectable, but
`processUserMove` refuses new moves on it — extend the existing
`isReviewTransientState` gate pattern (`useReviewSession.ts:11-27`, already
the single quantified predicate `App.vue`'s `handleBoardMove`/
`handlePastePv` check) with a `REVIEWED` guard rather than adding a second
copy at each call site. `finishCard`/`submitReview` never re-fires for a
restored `FINISHED` snapshot — there is no code path back into it without
an explicit **"Retry this card"** action that discards the snapshot and
re-enters via `loadCard` (a fresh attempt, graded once, same as today). An
`AWAITING_MOVE` snapshot (a card left mid-attempt) resumes normally — it
hasn't graded yet, so continuing and eventually finishing it is exactly
today's semantics, just resumed later.

**Memory growth / ownership call.** Unbounded snapshot accumulation over a
long deck is the real cost — a `BoardState` clone plus a per-move score
array, times every visited card. Per the resource-ownership checklist
(`frontend/CLAUDE.md` "Resource ownership at mutation sites"): this is
*new external state keyed by `BoardId`* (checklist item 1), so it must
register the same way `pendingAnalysisAborts` does — `registerBoardCloseHandler`
(drop the board's whole snapshot map on close) and
`registerWorkspaceResetHandler` (drop everything on identity flip). Within
a session it is bounded by deck length (not unbounded across sessions —
`endSession()`'s existing reset, `useReviewSession.ts:713-721`, is the
natural point to also clear the snapshot map for that board). No
`GlobalStore`/`SyncService` persistence — this is ephemeral session
scaffolding, not state that should round-trip to the backend (consistent
with why `pendingAnalysisAborts` itself is module-scope and not a store
cell).

**Size estimate: medium.** One new module-scope registry + teardown
registration (closely mirrors the existing `pendingAnalysisAborts` block,
`useReviewSession.ts:60-167`) + `goBack`/`goForward`/`jumpTo` in
`useReviewSession.ts` + the `REVIEWED`/view-only extension to the
`isReviewTransientState`-style gate + a small UI affordance (prev/next
indicator, "Retry" action) in `ReviewSessionPanel.vue`. No backend or wire
change — everything is frontend-session-scoped, so it stays inside "the
frontend's concerns end at the ACL" (`frontend/CLAUDE.md` "Scope
boundaries"); no dispatch to the backend is implied.

### (b) One `BoardTab` per visited card, navigation = tab switch

Reuse the existing multi-board machinery: each visited card gets its own
live `BoardId`, and "back" is `setActiveBoard`. Tempting because the
per-board scope (1c, `BOARD_SCOPED_STORE_CELLS` + the owner-handler bundle
in `closeBoard`, `store/index.ts:418-623`) *looks* like it gives retention
for free — a live board's node tree and ledger entries stay valid until
something closes it.

That's real, but it isn't free: every visited card becomes a **permanent,
fully-owned entity** carrying the *entire* `closeBoard` cleanup bundle
(review row, `cardTreeNav` slot, `forestNav.selection` slot, the
`analysis-service` subscription, ledger + stability-trajectory bookkeeping,
thumbnail cache, card-tree slot, persisted-analysis-bundle row —
enumerated at `store/index.ts:445-512`) for as long as it's live, times
however many cards the deck run visits — plausibly dozens. The recent tab-
rail virtualization (`b3bfe8c1`, "virtualize the board-tab rail") bounds
the **DOM** cost of a long tab strip; it does nothing for the **store and
service** memory each live board holds — those N boards are still N full
`BoardState`s plus N sets of the owned-resource bundle above, virtualized
strip or not. It also conflates "review-session-owned board" with "board
the user opened by hand" in the same tab namespace and closeBoard/
cardTreeNav semantics, which would need a new "review-owned" flag threaded
through call sites that have no reason to know about review at all
(minting, paste-PV, manual board management) — a wider blast radius than
the feature needs.

**Size estimate: large**, and most of the size is *containment* work (keeping
review-owned boards out of surfaces they shouldn't participate in), not the
navigation logic itself.

### (c) Replay-based reconstruction — persist nothing extra

Re-derive the prior state from `card.canonicalContent` on every back-nav —
exactly what `loadCard` already does today. This is ruled out by the
maintainer's own framing ("data is not discarded" — re-parsing *is* the
discard) and by 1b/1d directly: re-parsing recovers only the pristine SGF,
never the user's played moves (they exist solely as extra nodes on the live
`BoardState`, which re-parsing doesn't reconstruct), never `userMoveScores`
(ephemeral, session-only, never sent anywhere except as the aggregate to
`submitReview`), and it cannot even tell you whether a card was already
`FINISHED` — the backend's `POST .../review` mutates the card's Ebisu model
server-side but the frontend never re-reads a "was this graded this
session" flag from anywhere. (c) is "restart the card," relabeled — not
repetition.

## 3. Recommendation

**(a).** It's the only option that satisfies the maintainer's own framing —
retained per-card attempt, analysis, and grade context — without either a
backend change or a large containment project. Its key insight, direct from
the survey: retention must **preserve the snapshot's `NodeId`s verbatim**
(plain-value clone, not re-parse) because `loadSgf`'s id minting is
non-deterministic (1b) — get that wrong and the feature silently degrades
into (c) with extra bookkeeping. Its second load-bearing property: a
restored `FINISHED` snapshot is view-only by default, because `submitReview`
(1d) has no idempotency guard and must not be reachable twice for the same
attempt without the user explicitly asking via "Retry."

## 4. Acceptance handles

A Playwright witness would show, end to end:

1. Start a session, complete card 1 (grade recorded, board reaches
   `FINISHED`), advance to card 2.
2. Click "back" — card 1's board reappears showing the exact line the user
   played, with its per-move analysis/grade panel populated, **and no new
   KataGo analysis request fires** (assert no new WS analysis message for
   card 1's restored `NodeId`s — the ledger read is a cache hit).
3. Attempt to play a move on the restored (FINISHED) card 1 — refused
   (view-only), no `processUserMove`/`submitReview` call.
4. Invoke "Retry" on card 1 — the snapshot is discarded, the card re-enters
   fresh via `loadCard`, playable and gradable exactly as a first attempt.
5. Click "forward" from card 1 back to card 2 — card 2's own state (finished
   or still-in-progress) is exactly as left, not reset.
6. `endSession()` — the per-board snapshot map for that `BoardId` is empty
   (teardown ran), and `store.session.reviews[boardId]` is the normal
   fresh-IDLE shape (existing `endSession` assertions still hold
   unmodified).

## 5. Secondary note — hotkey

Binding a prev-card hotkey to `goBack()` is one line once this interface
exists; it belongs to the batch hotkeys work item, not this one.
