# Deck repetition — fresh-context review

Reviewer: fresh-context, independent. Read frontend/CLAUDE.md, ADR-0021, the
design doc, the build report, and the full diff (worktree
`.claude/worktrees/agent-a1653ae87514d22fa`, branch
`worktree-agent-a1653ae87514d22fa`, commit `5648dff6`).

## Verdict: ACCEPT-WITH-NITS

Blocks nothing structural, but one undisclosed regression must be fixed
before merge, and a merge-conflict risk must be handled deliberately, not
silently.

## Findings (WITNESSED unless noted)

1. **SRS integrity — WITNESSED, holds.** Traced goBack/goForward/jumpTo/
   retryCard/nextCard. Ran the shipped double-fire test (passes) plus a
   red-leg I constructed myself: stripped the REVIEWED guard from both
   `handleBoardMove`/`handlePastePv` in `useBoardMoveRouting.ts` — the
   routing-gate tripwire test fails loudly for the right reason (stones
   mutate that shouldn't), all other tests still pass; restored the file
   clean. I also built and ran my own adversarial sequence — back→forward→
   back→retry→finish→back→forward — asserting `submitReview` is called
   exactly twice (one per genuine attempt) end to end: passes. `submitReview`
   is structurally unreachable from REVIEWED except via `retryCard`, which
   deletes the snapshot before re-entering `loadCard`.

2. **Aliasing fix — code correct, WITNESS GAP.** `restoreSlot` re-clones
   `snap.board` on every install (`useReviewSession.ts` ~line in
   `restoreSlot`), which is the right fix for the hazard the build report
   describes. But no test exercises it: I grepped the new test file for
   `alias|rewindToStart|archived` — no hits. The specific scenario (restore
   a snapshot, mutate the live board via `rewindToStart`, assert the
   archived Map entry is untouched) is not present. Per ADR-0021 Rule 1,
   the six shipped tests observe *outcomes downstream of* correct cloning,
   never the aliasing property itself directly. Flag as an honest witness
   gap, not a code defect.

3. **REVIEWED refusal arm — WITNESSED, correct.** Added as its own explicit
   arm in both routing entry points (loud silent-no-op, matching the
   existing gate idiom — no toast, consistent with AWAITING_MOVE's own
   refusal). `blind-mode-prefs.ts`'s exhaustive switch gets a compiler-
   checked `REVIEWED` case; `never`-default exhaustiveness intact.

4. **Resource release — WITNESSED.** `registerBoardCloseHandler`/
   `registerWorkspaceResetHandler` correctly wired, plus a direct
   `visitSnapshots.delete(bId)` in `endSession`. All three exits covered.

5. **NodeId preservation — WITNESSED (test present).** The first shipped
   test asserts `Object.keys(nodes).sort()` equality pre/post restore and
   zero new `analyzeRange` calls (ledger cache hit) — this is the real
   claim, observed at the site (node-id set + no re-query), not a proxy.

6. **UI wiring — thin, WITNESSED.** `ReviewSessionPanel.vue` diff is
   template bindings + a confirm-wrapped call to `retryCard()`; no business
   logic added to the component.

7. **Gates — re-run independently, all clean:** `vue-tsc -b` (no output),
   `eslint .` (no output), `npm run test:run` (82 files / 1107 passed, 3/4
   skipped, matches the build report).

8. **Undisclosed regression — `blind-mode-prefs.ts` drops a load-bearing
   `touchSession()` call.** The diff removes the *only* `touchSession()`
   call and its import from `write()`, with no mention anywhere in the
   build report. `store/index.ts`'s own docstring mandates `touchSession()`
   at every write into `store.session` (SyncService no longer deep-watches
   session; the counter bump is how a write becomes visible to persistence
   — the same rule 9 other call sites across the codebase follow). This
   write path (`uiPrefs()[k] = value`, the blind-mode override/restore) is
   exactly that kind of session write, and it's now invisible to
   SyncService. Nothing in deck-repeat's spec touches blind-mode
   persistence — this reads as accidental collateral (possibly from
   resolving an unrelated overlap), not a deliberate, justified change.
   **Must be restored (or the removal explicitly justified) before merge.**

9. **Throwaway compose vs current `next` — real conflict, must be handled
   explicitly.** This branch's merge-base is `3378806f`, predating the
   hotkeys-batch `nav.toggleMainLine` work that landed on `next` afterward
   (`a8e12dab`/`3b02916f`, adding `nav:clear-toggle-memory[-all]` teardown
   registrations). This branch's edits to
   `teardown-registry-completeness.test.ts` and `auth-lifecycle.test.ts`
   *remove* the `nav:clear-toggle-memory`/`nav:clear-toggle-memory-all`
   pins (correct for this stale worktree, which never had that feature) and
   add the new `review:visit-snapshots[-*]` pins. Merged naively onto
   current `next`, this either produces a textual conflict in both files or
   — worse, if force-resolved carelessly — silently drops the nav-toggle
   pins while keeping the review-session ones. The merge must land **both**
   label sets in both files' arrays; this needs a deliberate rebase/merge
   step, not a fast-forward.

## Summary for the record

Core feature (snapshot map, NodeId-preserving clone, REVIEWED view-only gate,
Retry-only re-grade, submitReview un-double-fireable) is well-built and
well-witnessed per ADR-0021, confirmed by my own independent red-leg and a
self-constructed adversarial sequence. Two items block a clean merge, not
the design: restore/justify the `touchSession()` removal (#8), and land the
merge against current `next` with both teardown-label sets present, not one
overwriting the other (#9). #2 (aliasing witness gap) is a should-fix, not
a blocker.
