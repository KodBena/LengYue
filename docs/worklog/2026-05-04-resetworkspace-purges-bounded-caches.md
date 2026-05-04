# resetWorkspace purges bounded caches (O8 + O9) — Pass 2 close-out

- **Status:** Shipped on
  `frontend/resetworkspace-purges-bounded-caches`, 2026-05-04.
  Build green. Pass 2 of the resource-ownership audit closes
  with this PR.
- **Genre:** Bug fix — bounded memory hygiene; resource-
  ownership audit O8 + O9, paired in one commit per the same
  reasoning as O2+O3 (same site, same shape, shared
  infrastructure).
- **Date:** 2026-05-04.

## Context

The Pass-1 inventory's last two open pairs were both
identity-flip memory-hygiene candidates on `resetWorkspace`:

> **O8** — `analysisLedger.data` and `nodeVersions` maps. Ledger
> holds prior user's analysis packets indexed by NodeId across
> the resetWorkspace boundary. NodeIds are UUID-shape so
> cross-user collision is unlikely, but memory grows
> monotonically.

> **O9** — `useThumbnailCache` module-scope cache. Same shape
> as O8.

Both were dispositioned as "either flush on `resetWorkspace`
... or document the deferral with the same WS-disconnect
'revisit when' trigger."

Decision: ship the flushes. Both fixes are small (~10 lines
each), the `purgeAll` shape mirrors the existing
`purgeBoardThumbnails` (O4) and `clearCardThumbnailCache` (O10)
patterns, and shipping them now closes Pass 2 fully — leaving
a clean handoff state where every Pass-1 inventory pair is
either closed in code, closed by verification, or, for O15,
documented as as-designed.

## What changed

### `frontend/src/services/analysis-ledger.ts`

New `purgeAll()` method on `AnalysisLedger`:

```ts
public purgeAll(): void {
  for (const v of nodeVersions.values()) {
    v.value++;
  }
  data.clear();
  nodeVersions.clear();
}
```

The bump-then-clear sequence mirrors `purgeBoard`'s
discipline (PR #119): bump every existing version ref so
subscribed consumers' computeds re-run and observe the
cleared data, then drop both maps wholesale. Consumers
re-attach via `getOrCreateVersion` on their next compute
run — the pattern `getRaw` and `getProjectedSequence`
already use.

### `frontend/src/composables/useThumbnailCache.ts`

New `purgeAllThumbnails()` export:

```ts
export function purgeAllThumbnails(): void {
  cache.value.clear();
  lastWarmedPath.value = [];
}
```

Clears both the cache and `lastWarmedPath` — without the
latter, the next identity's first `warmPath` call would
short-circuit on a stale fingerprint match.

File header rewritten to describe the now-complete cleanup
contract: per-board purge (O4) on closeBoard, per-identity
purge (O9) on resetWorkspace.

### `frontend/src/store/index.ts:resetWorkspace`

Two small edits:

1. **New imports**: `purgeAllThumbnails` from
   `'../composables/useThumbnailCache'` and `ledger` already
   imported for closeBoard's `purgeBoard` call (no change).

2. **resetWorkspace body**: the cleanup block reorganized to
   group the three cache clears together:

   ```ts
   analysisService.stopAllBoardAnalyses();   // O7
   ledger.purgeAll();                        // O8 (this PR)
   purgeAllThumbnails();                     // O9 (this PR)
   clearCardThumbnailCache();                // O10
   abortAllReviews();                        // O11
   store.boards = [createInitialBoard()];
   // ...
   ```

   The order is loose — these are independent state — but
   reads "stop external work, clear local caches, cancel
   in-flight controllers, then mutate workspace state."

3. **Docstring** rewritten to describe the three cache clears
   as a coherent block, named the privacy-relevant one
   (clearCardThumbnailCache / O10) explicitly, and updated
   the audit-pair list to name all five identity-flip pairs
   (O7 / O8 / O9 / O10 / O11) as closed.

## Why one commit for O8 + O9

Same-site (resetWorkspace), same-shape (per-cache `purgeAll`),
shared docstring updates. The infrastructure is parallel but
not literally shared — `ledger.purgeAll` and
`purgeAllThumbnails` are distinct methods on distinct modules.

The bisect-strict alternative would be two commits:
1. `ledger.purgeAll` + resetWorkspace wiring (O8).
2. `purgeAllThumbnails` + resetWorkspace wiring (O9).

Decided against on the same grounds as O2+O3 (PR #125): both
pairs are at the same call site in resetWorkspace, the
docstring update names both, and a regression in either is
implausible (each new method is a one-line clear of a Map).
One commit grouping is the cleaner shape.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- O8 manual: log in, run analyses on a few boards, log out
  while live consumers (charts, kernel-series) are reading
  ledger data. Pre-fix: `analysisLedger`'s internal Maps
  retain entries indefinitely. Post-fix: both maps clear on
  logout; consumers' computeds re-run and observe null.
- O9 manual: log in, navigate boards so thumbnails populate,
  log out. Pre-fix: `useThumbnailCache`'s cache retains the
  prior identity's SVG renders. Post-fix: cache empty after
  logout.
- Non-regression: re-login after logout — fresh records and
  thumbnails populate normally; consumers re-attach via
  `getOrCreateVersion` cleanly.
- Non-regression: HMR reload during an active session
  unaffected — the HMR dispose path uses
  `analysisService.stopAllBoardAnalyses()` + `disconnect()`
  rather than `resetWorkspace`.

## Pass 2 close-out

After this PR, **all 15 Pass-1 inventory pairs are closed:**

| Pair | Owner | Status | PR |
|------|-------|--------|-----|
| O1 | closeBoard | ledger purgeBoard sub-finding | #119 |
| O1 | closeBoard | main fix | #120 |
| O2 + O3 | closeBoard | reviews row + activeMode tombstone | #125 |
| O4 | closeBoard | thumbnail cache board-purge | #127 |
| O5 | closeBoard | review-wait abort | #126 |
| O6 | closeBoard | KataGoClient.subscribers (verify-only) | #126 |
| O7 | resetWorkspace | analysisService per-board maps | #121 |
| **O8** | resetWorkspace | analysisLedger purgeAll | **this PR** |
| **O9** | resetWorkspace | useThumbnailCache purgeAll | **this PR** |
| O10 | resetWorkspace | useCardThumbnail clear (privacy) | #122 |
| O11 | resetWorkspace | review-wait aborts | #126 |
| O12 | unmount | useResizablePanel onUnmounted | #123 |
| O13 | unmount | BaseChart markerTimer clear | #124 |
| O14 | unmount | MintCardModal hideSuggestions clear | #124 |
| O15 | WS reconnect | per-board maps verify-only | #126 |

Pass 2 is closed.

## Forward — Pass 3

The Pass-1 inventory's closeout note named the recurring shape
Pass 3 should codify:

> per-entity Map/Set state in a service or composable
> singleton reliably gets a dispose/disconnect cleanup path,
> but inconsistently gets an entity-removal cleanup path.

Pass 3 produces two artifacts (per the audit plan §"Pass 3 —
Forward-authoring discipline"):

1. **Inline-comment convention.** When a workspace-mutation
   function releases a resource, the cleanup line carries a
   short comment naming the resource and the reason. The
   closeBoard / resetWorkspace docstrings as they stand at
   the close of Pass 2 are the worked examples to mirror;
   each cleanup line is preceded by an inline comment naming
   the pair identifier (O1 / O2 / etc.) and the disposition.

2. **Authoring checklist.** PR-template addition or
   `frontend/CLAUDE.md` addendum naming "what does this owner
   own?" as a question to ask when introducing a new entity
   type or a new mutation that removes one.

Both artifacts are doc-only; Pass 3 is a small follow-up
session, not an implementation arc.

## Pass 2 retrospective

Eight PRs over the session (#118 inventory through #128 close-
out):

- Closed 13 audit pairs in code (#119, #120, #121, #122,
  #123, #124, #125, #126, #127, #128).
- Closed 2 audit pairs by verification with explanatory
  comments (O6, O15 in #126).
- Surfaced two minor sub-findings during the work:
  `purgeBoard`'s incomplete `nodeVersions` cleanup (sub-PR
  #119) and the closeBoard / resetWorkspace timeout-resurrect
  bug (#126's O5/O11 fixes that the inventory had pitched
  as benign).
- Retrofitted an ADR-0006 file-header drift
  (`resetUserOwnedState` → `resetWorkspace`) per the
  inventory's deferred-fix scheduling (#120).
- Retrofitted ADR-0001/0002 type honesty on two `Record<>`
  types via `Partial<Record<>>` narrowing (#125).

Lessons retained for the worklog ledger:

- **Inventory pre-judgment is a hazard.** The Pass-1
  disposition column for O5/O11 said "bounded;
  controllers GC-eligible" — too generous. The verification
  trace surfaced a real user-visible bug. Better Pass-1
  framing would have been "verify whether timeout branch
  is harmful post-closeBoard" rather than pre-supplying
  "likely benign."
- **Sub-findings are bisect-natural in their own commits.**
  PR #119's split (purgeBoard's nodeVersions leak) was the
  cleanest shape: ship the prerequisite fix, then ship the
  call-site wire-up that depends on it. Future audit work
  should preserve this shape when sub-findings come up.
- **One-PR-per-pair is the default; pair when same-site +
  same-concern.** O2+O3 (#125) and O8+O9 (this PR) honor
  pairing; O13+O14 (#124) deviated by accepting two commits
  in one PR for "finish lifecycle" framing, which was the
  user's call rather than the audit's. The audit's own
  guidance held: bisect discipline is one fix per commit;
  pairing into one commit is fine when fixes share
  infrastructure or are inseparable.
- **ADR-0004 minimal-touch composes well with ADR-0006
  retrofit when files are touched under full visibility.**
  The audit's PRs retrofitted file headers, type narrowings,
  and inline comments without scope creep — each retrofit
  was named in the inventory's deferred section and rode
  with the natural-touch PR.

The audit shipped a coherent closeBoard/resetWorkspace
cleanup contract: six cleanups on closeBoard, five on
resetWorkspace, each named with its audit-pair identifier in
the docstrings. New contributors extending either function
have a worked example to mirror.
