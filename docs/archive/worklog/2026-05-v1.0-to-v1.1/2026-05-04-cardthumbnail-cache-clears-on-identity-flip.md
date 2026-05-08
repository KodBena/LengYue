# useCardThumbnail cache clears on identity flip

- **Status:** Shipped on
  `frontend/cardthumbnail-cache-clears-on-identity-flip`,
  2026-05-04. Build green.
- **Genre:** Bug fix — privacy concern; resource-ownership audit
  O10. The only privacy-relevant pair in the Pass-1 inventory.
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's Pass-1 inventory (PR #118) named
O10 — `useCardThumbnail` module-scope `cache: Map<number,
string>` keyed by raw CardId, with no clear path on identity
flip:

> **Privacy-relevant**: CardIds are integer auto-increments per
> the backend; cross-user collision is *likely*, so the next
> user could see the prior user's card render via the memo. Add
> `clearCache()` to `useCardThumbnail` and invoke from
> `resetWorkspace`. Single-machine deployment makes this latent
> today; multi-tenant deployment surfaces it.

The collision risk is real and not theoretical: the backend
auto-increments CardIds per tenant starting from 1. Two users
each with a few cards each are very likely to share at least
one CardId value. Pre-fix, on a shared-computer flow (User A
logs out, User B logs in on the same browser), the cache held
User A's `getCardThumbnailSync(7, ...)` SVG; when User B's UI
called `getCardThumbnailSync(7, ...)` for User B's card 7, the
cache hit returned User A's SVG.

The other module-scope caches in the codebase (analysis-ledger
and useThumbnailCache) use UUID-style NodeIds where cross-user
collision is functionally impossible — those are O8 and O9 in
the audit, lower-severity memory leaks rather than privacy
concerns. O10 stands alone as the privacy-relevant pair.

## What changed

### `frontend/src/composables/useCardThumbnail.ts`

Two edits:

1. **New export: `clearCardThumbnailCache()`.** Calls
   `cache.clear()`. Safe to invoke unconditionally — `clear()`
   on an empty Map is a no-op. Sits alongside the existing
   `getCardThumbnailSync` export.

2. **Docstring updates.** The file header now names the
   identity-scoped cache lifetime contract and the cross-user
   CardId collision rationale. The
   "Result is permanently cached by Card ID" framing on
   `getCardThumbnailSync` is corrected to "cached by Card ID
   for the lifetime of the current identity" with a pointer to
   the new clear function.

### `frontend/src/store/index.ts:resetWorkspace`

Three edits:

1. **New import**: `clearCardThumbnailCache` from
   `'../composables/useCardThumbnail'`. The store already
   imports from `services/`; importing from `composables/` for
   a service-shaped helper is a layer-skip the file's name
   makes natural — `useCardThumbnail` is a module-scope cache
   plus sync free function, not a Vue setup-context composable
   despite the directory and `use*` prefix. The misfiling is
   noted in the forward section below; not in scope for this
   PR.

2. **resetWorkspace body**: call `clearCardThumbnailCache()`
   alongside `analysisService.stopAllBoardAnalyses()`, with an
   inline comment naming the privacy framing and the
   distinction from O8 / O9 (UUID-keyed caches with low
   collision risk).

3. **resetWorkspace docstring**: paragraph added describing the
   card-thumbnail clear as the audit's only privacy-relevant
   cleanup, and the audit-reference paragraph updated from "O7
   for analysisService's per-board maps; O8-O11 cover the
   remaining" to "O7 ... and O10 for the privacy-relevant
   useCardThumbnail cache; O8 / O9 / O11 cover the remaining."

## Why not also clear in closeBoard

closeBoard fires when a single board tab closes within an
identity, not on identity flip. Within an identity, the cache
is intentionally durable across board lifetimes — the same
card might be referenced from multiple boards (review session
on one tab, browse from cards-tab on another). Clearing on
closeBoard would invalidate cache entries that other tabs are
still using.

The privacy concern is specifically *cross-identity*; the
within-identity memory cost of the cache is a small bounded
leak that the audit treats as benign. (Within-identity bounded
because card content doesn't change post-create; entries are
write-once-read-many.)

## Why not move the file out of `composables/`

useCardThumbnail.ts is structurally a service: module-scope
state plus a sync free function plus a clear path. The `use*`
prefix and `composables/` location are misleading. A future
refactor moving it to `services/` would correct the file-tree
honesty, possibly renaming to `card-thumbnail-cache.ts`.

This PR doesn't take that on. ADR-0004 minimal-touch under full
visibility says: change what the bug requires; the misfiling is
adjacent rather than load-bearing for the privacy fix. The
observation is recorded here for whoever picks up the file's
next substantive edit.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual reproduction (pre-fix): with two users on the same
  install, log in as User A, render a card thumbnail (e.g. via
  the cards-tab), log out, log in as User B. If User B has a
  card with the same id, the prior cached SVG flashes briefly
  before being overwritten by User B's actual content.
  Post-fix: the cache is empty after logout; User B's first
  thumbnail render is a fresh parse-and-paint.
- Non-regression: within an identity, the cache behavior is
  unchanged. Same-card re-renders stay O(1).
- Logout with no cached thumbnails is a clean no-op.

## Forward notes

O10 is closed. The remaining identity-flip pairs:

- **O8** (analysisLedger.data + nodeVersions). The audit's
  disposition was either a `ledger.purgeAll()` flush on
  resetWorkspace, or document the deferral with the WS-
  disconnect "revisit when" trigger. The collision risk is
  effectively zero (UUID NodeIds), so the choice is between
  bounded memory hygiene and explicit deferral discipline.
- **O9** (useThumbnailCache module-scope cache). Same shape as
  O8 — needs a new `purgeAll` affordance. Same low-collision
  framing as ledger.
- **O11** (useReviewSession.pendingAnalysisAborts singleton).
  Bounded; controllers become GC-eligible once their
  associated `waitForAnalysis` settles or times out. Likely a
  document-the-deferral pair.

The closeBoard owner (O2 / O3 / O4 / O5 / O6) and component-
lifecycle owner (O12 / O13 / O14) sweeps are still open. After
O10, the natural next-highest-signal pair is O12
(`useResizablePanel` mid-drag onUnmounted) — trivial mirror-
the-pattern fix, ~3 lines, mirrors HorizontalTimelineVisualizer.

The misfiled-composable observation about useCardThumbnail
deserves a deferred-items entry if it isn't picked up
immediately. Naming it without filing keeps it in the worklog
record only; that's enough for now since the inventory's
forward note already mentions the broader "is this a service?"
audit framing.
