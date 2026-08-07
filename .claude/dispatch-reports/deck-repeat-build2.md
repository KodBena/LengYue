# Deck repetition — build2 report (FIX/BUILD dispatch)

Branch `bork/feat/deck-repeat-hotkey`, HEAD `ac7b2ef6`, isolated worktree
`.claude/worktrees/deck-repeat-hotkey`, based on current `next`
(`dab7f993`). No push; main checkout and live ports (4173/5173/5174/8764)
untouched.

## 0. Read before starting (WITNESSED)

Read end to end: the ratified design
(`.claude/dispatch-reports/deck-repeat-design.md`), the prior build report
(`deck-repeat-build.md`), the prior fresh-context review
(`deck-repeat-review.md`), the current `frontend/src/composables/review/
useReviewSession.ts` in the main checkout, `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md`, and `frontend/src/composables/
keybindings-catalog.ts` end to end.

## 1. The central finding: the commission's premise is stale

The brief's framing — "the build was commissioned long ago and left
undispatched" — does not match the repository's current state. Before
touching anything I confirmed via `git reflog show next` and
`git merge-base --is-ancestor`:

- The prior BUILD/REVIEW cycle (`deck-repeat-build.md` /
  `deck-repeat-review.md`, verdict **ACCEPT-WITH-NITS**) produced commits
  `5648dff6` (feature) and `46e136f8` (review-addendum: merged `next` in,
  fixed the `touchSession()`/teardown-label findings, added the aliasing
  witness test) on branch `worktree-agent-a1653ae87514d22fa`.
- That branch **is already merged into current `next`** — reflog entry
  `next@{19}: merge worktree-agent-a1653ae87514d22fa`. `dab7f993` (`next`'s
  current tip) is a strict descendant of `46e136f8`.
- Confirmed directly in the main checkout's live source: `goBack`,
  `goForward`, `jumpTo`, `retryCard`, `canGoBack`, `canGoForward`, the
  `visitSnapshots` module-scope map, the `REVIEWED` status, the
  `captureSlot`/`restoreSlot` pair, and the two teardown registrations all
  already exist in `frontend/src/composables/review/useReviewSession.ts`
  (lines 124–1146 in current `next`). `ReviewSessionPanel.vue` already
  renders Back/Forward/Retry buttons wired to them (`nav-buttons-row`,
  `retry-btn`). `frontend/src/composables/review/blind-mode-prefs.ts` and
  `useBoardMoveRouting.ts` already carry the `REVIEWED` arms. `en.json`
  already has the `review.session.goBack`/`goForward`/`retry`/`reviewed`/
  `retryConfirm` keys. `FEATURES.md` already has the "Back / Forward (deck
  repeat)" tour entry (lines 398–406).

So: **the state model, interface extension, and UI are not undispatched —
they are built, reviewed, and live on `next`.** This is presumably a
consequence of this being a busy multi-agent environment (the worktree
list at dispatch time showed ~30 concurrent agent worktrees); the ledger
item this commission points at was evidently picked up and closed out by
another concurrent process between when it was opened and when this
dispatch was issued, without name change or handoff visible in the brief.

**Design-vs-current-code drift, as asked:** none of substance. The
merged implementation *is* option (a) from the design doc, built against
a version of `useReviewSession.ts` that already included the ruleset
wedge fix (`e2d8f3fe`) and the LERP visit-count hook (`eb45fcf8`) — both
are ancestors of the merge-base the deck-repeat branch reconciled against
(confirmed: `git merge-base --is-ancestor eb45fcf8 HEAD` → true, and the
prior review addendum's finding #9 explicitly named and resolved the
`next`-catch-up merge). No further reconciliation was needed or done to
`useReviewSession.ts` itself.

## 2. What was actually missing: the hotkey (design doc §5)

The design's own §5 deliberately deferred the prev-card keybinding to
"the batch hotkeys work item." The prior build report's §7 confirms it
was **not** wired even after the merge (the branch it found, from a
stale worktree, had its own inconsistencies and was left as follow-up).
I checked the current `next`'s `frontend/src/composables/
keybindings-catalog.ts` directly: `review.nextCard` (`.`) exists;
**no `review.prevCard`/goBack binding existed anywhere in the catalog.**
This is the one genuine gap between "commissioned" and "shipped," and is
exactly what the brief's own wording points at ("the next-card '.'
keybinding's sibling for previous-card per the catalog conventions,
collision-checked").

### Collision check (WITNESSED)

Enumerated every `defaultKey` in the registry (17 entries pre-change:
`ArrowDown/Up/Left/Right`, `Home`, `End`, `u`, `' '`, `[`, `]`, `m`, `n`,
`c`, `d`, `l`, `.`, `k`) — `,` was unused. Checked
`RESERVED_KEYS` (`frontend/src/lib/keybindings-capture.ts`:
`Escape/Tab/Enter/Shift/Control/Alt/Meta/ContextMenu/F1-F12`) — `,` is
not reserved. Clean per the catalog's own C15 convention.

## 3. State-model implementation

None needed — `goBack`/`canGoBack` already exist and are exactly the
programmatic surface the hotkey wires to. No store schema, no migration
(the design's own call: ephemeral, session-scoped, module-scope
`visitSnapshots` map — never touches `ReviewSessionData`'s persisted
shape or the schema-version-67 store).

## 4. Keybinding addition

`frontend/src/composables/keybindings-catalog.ts`:

- `ACTIONS.reviewPrevCard = 'review.prevCard'` (new persisted-id literal;
  domain `review`, already in the closed domain set the ship-time test
  enforces).
- `reviewSessionCanGoBack` predicate — `reviewSession.canGoBack.value`,
  mirroring `ReviewSessionPanel.vue`'s Back button `:disabled="!canGoBack"`
  binding exactly (not the coarser `reviewSessionHasCurrentCard`, since
  `canGoBack` is `currentIndex > 0` — strictly narrower and already false
  whenever no session is mounted).
- Registry entry: `defaultKey: ','`, `dispatchMode: 'immediate'` (matches
  `review.nextCard`'s own dispatch mode; the ship-time test asserts
  non-`nav` actions are `immediate`), `handler: reviewSession.goBack` —
  the same direct-method-reference idiom `review.nextCard` uses for
  `reviewSession.nextCard`.

`frontend/src/locales/en.json`: `keybindings.action.reviewPrevCard.label`/
`.description` added, immediately after the `reviewNextCard` pair. `ja`/
`ko`/`zh-CN` locale files were **not** touched — `reviewNextCard` itself
has no translated entry in any of them (grepped, zero hits), so the
existing precedent is fallback-to-en for this key family; matched it
rather than introducing an inconsistent partial-translation policy
unilaterally.

`FEATURES.md`, `frontend/FILES.md`: not touched. The "Back / Forward
(deck repeat)" tour entry already describes the capability at the level
of granularity the file uses throughout (it doesn't name `.`'s specific
key either, for `nextCard`); no new/moved/deleted source file exists to
give FILES.md a reason to change.

## 5. Tests (`frontend/tests/unit/composables/keybindings-catalog.test.ts`)

Extended the existing ship-time-smoke and predicate suites (no new file
— this is the established home for catalog-level tests):

1. `'reviewSessionCanGoBack' is false at the first queue slot` — seeds a
   2-card queue at `currentIndex: 0`, asserts `false`.
2. `'reviewSessionCanGoBack' is true once past the first queue slot` —
   same queue at `currentIndex: 1`, asserts `true`.
3. `'review.prevCard' handler steps currentIndex back via
   reviewSession.goBack` — finds the registry entry by `ACTIONS.
   reviewPrevCard`, calls `.handler()`, asserts
   `store.session.reviews[boardId].currentIndex` moved from 1 to 0 (i.e.
   the catalog entry really does dispatch into `goBack`, not a decoy).

Updated pins: action count 17→18, the sorted persisted-id-literal array
gains `'review.prevCard'`.

**Red-leg (WITNESSED):** temporarily replaced `handler: reviewSession.
goBack` with `handler: () => {}` and reran the new handler test — failed
loudly (`expected 1 to be +0`, i.e. `currentIndex` never moved). Restored
the real handler before the final gate run below. (Note: an earlier `git
checkout --` during this red-leg step transiently reverted the whole file
to its pre-change state since the diff wasn't committed yet — caught
immediately via the harness's file-change reminder, and all edits were
faithfully reapplied byte-for-byte before re-verifying; flagging this
honestly rather than silently proceeding past it.)

## 6. Gates (WITNESSED, worktree `.claude/worktrees/deck-repeat-hotkey`)

```
npx vue-tsc -b        clean, no output
npx eslint .           clean, no output
npm run build          ✓ 1113 modules transformed, built in 2.81s
                        (pre-existing >500kB chunk-size advisory only)
npm run test:run       Test Files  121 passed | 3 skipped (124)
                             Tests  1538 passed | 4 skipped (1542)
```

(Baseline before this change, same worktree: 121 files / 1538 tests minus
the 3 new assertions — i.e. 1535 — confirming the 3-test delta is exactly
this change and nothing regressed elsewhere.)

## 7. Per-claim WITNESSED / UNEXERCISED

- **Deck-repeat state model already shipped on `next`** — WITNESSED
  (reflog + direct source inspection, §1).
- **Design-vs-current-code drift is nil** — WITNESSED (merge-base
  ancestry check against `e2d8f3fe`/`eb45fcf8`, §1).
- **`,` collision-free** — WITNESSED (full registry + `RESERVED_KEYS`
  enumeration, §2).
- **Hotkey correctly dispatches `goBack`** — WITNESSED (red-leg + green
  handler test, §5).
- **Gates clean** — WITNESSED (§6, full output captured).
- **End-to-end manual/Playwright exercise of `,` in a running app** —
  UNEXERCISED. No chromium available per the brief's constraint; the
  acceptance handles in the design doc (§4) were already covered by the
  prior build's `useReviewSession-deck-repeat.test.ts` suite (not
  touched or re-run in this session beyond the full `test:run` pass
  above, which includes it) — this dispatch only added and witnessed the
  hotkey layer on top.
- **ja/ko/zh-CN translation completeness for the new key** —
  UNEXERCISED as a deliberate scope call (§4), matching `reviewNextCard`'s
  own existing precedent, not verified against any translator workflow.

## Files touched

- `frontend/src/composables/keybindings-catalog.ts` — `ACTIONS.
  reviewPrevCard`, `reviewSessionCanGoBack` predicate, registry entry.
- `frontend/src/locales/en.json` — two new keybinding label/description
  keys.
- `frontend/tests/unit/composables/keybindings-catalog.test.ts` — three
  new tests, updated ship-time pins.

## Summary

The deck-repetition feature itself (state model, `goBack`/`goForward`/
`jumpTo`/`retryCard`, `REVIEWED` view-only gating, snapshot teardown, UI)
was already built, fresh-context reviewed (ACCEPT-WITH-NITS), and merged
into current `next` before this dispatch began — confirmed via git
reflog and direct source inspection, not assumed. The one real gap
against the ratified design (§5's deliberately deferred hotkey) is now
closed: `,` bound to `reviewSession.goBack`, collision-checked against
the full registry and the reserved-key set, red-then-green tested.

**Branch head:** `bork/feat/deck-repeat-hotkey` @ `ac7b2ef6`
(worktree `.claude/worktrees/deck-repeat-hotkey`, based on `next`
@ `dab7f993`).

**Gates:** `vue-tsc -b` clean · `eslint .` clean · `npm run build` clean
(1113 modules, pre-existing chunk-size advisory only) · `npm run test:run`
121 files / 1538 passed, 3/4 skipped, 0 regressions.
