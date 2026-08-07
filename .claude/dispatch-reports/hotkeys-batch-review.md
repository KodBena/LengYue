# Hotkeys batch — review report

FRESH-CONTEXT REVIEW of branch `worktree-agent-aef22b08f64e3954b` (head `a8e12dab`),
worktree `.claude/worktrees/agent-aef22b08f64e3954b`. Read `frontend/CLAUDE.md`,
ADR-0019 appendix C15, and the build report end to end before this review.

## Verdict: ACCEPT-WITH-NITS

## Findings (WITNESSED unless marked)

1. **C15 host-chord collision — WITNESSED clean.** New defaults `[`, `]`, `.`, `u`
   are bare (unmodified) keys — not browser/AT-reserved combos (`ctrl+w/t/l` etc.)
   and not in `RESERVED_KEYS` (`Escape/Tab/Enter/Shift/Control/Alt/Meta/ContextMenu/F1-F12`,
   `keybindings-capture.ts:99`). Cross-checked against every existing `defaultKey` in
   the catalog (14 prior + 4 new = no duplicates). `Enter` avoided in favor of `.` for
   `review.nextCard` with a stated rationale (`Enter` is reserved) — correct call.

2. **`previousSelectedModel` field — WITNESSED sound.** `setSelectedModel` in
   `store/index.ts` is confirmed the sole writer of both fields (grep-verified).
   Persistence: `buildPersistencePayload()` (`store/index.ts:816-830`) serializes only
   `boards`/`activeBoardIndex`/`profile`/`session` — `store.engine` (and thus both
   `selectedModel` and `previousSelectedModel`) is **not persisted at all**, contradicting
   `selectedModel`'s own pre-existing doc comment ("Persisted through SyncService alongside
   other engine settings"). That's a **pre-existing doc/behavior inconsistency this PR
   didn't introduce**, but it means the "no migration needed, session-local" claim for the
   new field is correct by accident of the same gap, not because it was deliberately kept
   out of a persisted lane. Worth a follow-up note, not a blocker.

3. **`review.nextCard` gating — WITNESSED no bypass.** `reviewSession.nextCard` handler is
   the literal same function `ReviewSessionPanel.vue:217` binds. `useReviewSession()`'s
   state (`currentCard`, `state`, `queue`) is entirely derived via `computed()` off
   `store.session.reviews[boardId]` — two separate `useReviewSession(activeBoardId)`
   instances (panel + catalog) are equivalent live projections of the same store, not
   two writers. No lifecycle hooks (`onUnmounted`/`watch`) in the file — module-scope
   instantiation in the catalog is safe as claimed.

4. **`navigateToggleMainLine` — mostly sound, one untested gap.** Traced all documented
   cases by hand against the test fixtures: no-fork/root no-op, immediate-parent fork,
   uncle/cousin (fork 2+ ancestors up), two-value toggle back-and-forth, 3+-sibling
   first-press advance-by-one, per-board memory independence — all check out, tests are
   red/green-shaped and pass. **Gap: "cursor ON the fork" is not tested and, on trace,
   is a no-op** — the function only inspects `node.parent`'s children, never the current
   node's own children, so standing exactly at a fork node walks past it to the next
   ancestor fork (or no-ops if none exists) instead of acting at the fork you're
   standing on. This is arguably the most intuitive place to invoke the toggle and the
   dispatch brief explicitly asked this case be checked — it wasn't, in either the tests
   or the ambiguity note. Not a regression (new function, no prior behavior to preserve)
   but a real spec gap the maintainer should resolve alongside the depth-preserving
   question already flagged.
   My own read on the flagged ambiguity (non-depth-preserving, lands on the fork's
   immediate child): reasonable as a v1 — matches `navigateVariation`'s existing "act at
   one level" precedent — but should be named as a known limitation in the docstring
   rather than only in the build report, since the docstring already covers the
   depth-preserving question but not the on-the-fork case.

5. **Module-scope `mainLineToggleMemory` — resource-ownership miss.** The build report
   cites `pendingAnalysisAborts` (`useReviewSession.ts`) as precedent for this being a
   safe module-scope pattern. On inspection `pendingAnalysisAborts` is *actively deleted*
   per-`BoardId` at multiple sites (abort, close, finalize — grep shows 5 delete/clear
   call sites). `mainLineToggleMemory` has **no cleanup anywhere** — not in `closeBoard`,
   not in `resetWorkspace` — despite frontend/CLAUDE.md's explicit resource-ownership
   checklist for exactly this shape (module-scope cache keyed by entity id). It leaks one
   `string -> number` entry per fork ever visited, forever, across the session. Low
   severity (bytes, session-bounded, not user-visible) but it's the precise class that
   discipline exists to catch, and the cited precedent actually argues the opposite of
   what was done. Should get a `closeBoard` cleanup (`delete` every key prefixed
   `${boardId}::`) or an explicit "documented, deferred, bounded by X" note — neither is
   present.

6. **Mint-card PROPOSED-ONLY claim — WITNESSED true.** Confirmed by direct read:
   `App.vue`'s `triggerMint` calls `mintModalRef.value?.open(...)`, a component-ref
   method on `<MintCardModal ref="mintModalRef">` mounted only in `App.vue`; no
   composable/service-level open entry point exists. Correctly left unwired per the
   dispatch's own escape clause.

7. **KeybindingsView `KNOWN_DOMAINS` / en.json — WITNESSED consistent and complete.**
   `review` added to the closed set with the fail-loud throw still intact; all 5 new
   action ids have label+description keys; `keybindings.section.review` added.

8. **Worktree-vs-shared-checkout skew — spot-checked, no leakage.** `store/index.ts` and
   `keybindings-catalog.ts` diffs both read cleanly against this branch's own base
   (`3378806f`); no reference to a next-only symbol (e.g. `touchSession`, which post-dates
   this branch's base) leaked into the delivered diff — confirmed by the merge step below,
   where the only conflict was a same-line import collision, not a missing-symbol build
   failure.

9. **Gates — WITNESSED clean, reproduced independently** (not just re-trusting the build
   report): `npm run build` (vue-tsc -b && vite build) succeeds; `npx eslint .` silent;
   `npm run test:run` — 82 files / 1127 passed, 4 skipped, matching the report.

10. **Merge into throwaway vs current `next` (`d99bc248`) — WITNESSED clean.** One
    conflict, in `keybindings-catalog.ts`'s import block only: `next` added
    `touchSession` (session-version bump, PR #456) on the same import line this branch
    touched. Resolved trivially (union both imports). Confirmed `touchSession()` is only
    called from the `session.ui` display-toggle handlers in `next` (5 call sites, none on
    `nav.*`), so `nav.toggleMainLine` needs no `touchSession()` call for consistency —
    not a hidden semantic conflict, purely mechanical. Post-merge: build succeeds, eslint
    silent, full suite 95 files / 1226 passed, 4 skipped. No interaction found with
    today's rulesets-gate / fixture-repair / leaf-select / range-memory landings.

## Merge notes

Rebase onto current `next` before merging for real; the only conflict is the
`keybindings-catalog.ts` import-line collision with `touchSession` — trivial, shown above.

## Not blocking, but flag to maintainer

- Item 4 (on-the-fork no-op) and item 5 (unreleased toggle memory) are both real but
  low-severity; ACCEPT-WITH-NITS rather than REJECT because neither breaks anything
  shipped today, both are narrowly scoped, and both are cheap follow-ups.
