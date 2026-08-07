# `review.prevCard` hotkey — fresh-context review

Branch `bork/feat/deck-repeat-hotkey` @ `ac7b2ef6`, worktree
`.claude/worktrees/deck-repeat-hotkey`, base `next` @ `dab7f993`. Checked
`git rev-parse next` at review time: still `dab7f993` — base has not
moved, no trial-merge needed.

## VERDICT: ACCEPT

## Findings (all WITNESSED)

1. **Predicate mirrors the Back button's gate, genuinely.** Both
   `ReviewSessionPanel.vue:50` and `keybindings-catalog.ts:127` construct
   `reviewSession = useReviewSession(activeBoardId)` from the same
   `computed(() => activeBoard.value?.id ...)` pattern; `canGoBack` is
   `computed(() => currentIndex.value > 0)` in `useReviewSession.ts:933`,
   projected off the shared global store slice (`store.session.reviews
   [boardId]`), not a locally duplicated flag — so the two call sites read
   the identical fact, not a copy that could drift. `ReviewSessionPanel.vue
   :205`: `:disabled="!reviewSession.canGoBack.value"`. New predicate
   `reviewSessionCanGoBack` in `keybindings-catalog.ts:145-146`:
   `reviewSession.canGoBack.value` — same source, one home for the fact.
   Confirmed the global dispatcher (`useUserIORegistry.ts:153`:
   `if (!action.enabledWhen()) return;`) silently no-ops on a false gate
   for every action uniformly — same behavior as the `review.nextCard`
   sibling and every other entry in the registry, so pressing `,` while
   Back is disabled is a silent no-op, matching the catalog's existing
   convention (not a special case this change invented).

2. **`,` collision-free.** Enumerated all `defaultKey` values in the
   registry myself (independent of the builder's claim): `ArrowDown`,
   `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `u`, `' '`, `[`,
   `]`, `m`, `n`, `c`, `d`, `l`, `.`, `,` (new), `k` — 18 entries, `,`
   used exactly once. `RESERVED_KEYS` (`keybindings-capture.ts:99-110`):
   `Escape/Tab/Enter/Shift/Control/Alt/Meta/ContextMenu/F1-F12` — `,` not
   present. C15 clean.

3. **Handler wiring test is non-tautological — verified by spot-check.**
   In a scratch edit of the worktree file, replaced `handler:
   reviewSession.goBack,` with `handler: () => {},` and reran
   `keybindings-catalog.test.ts`: the new handler test failed exactly as
   claimed (`expected 1 to be +0`). Restored the file from a pre-edit
   backup; `git diff --stat` confirmed byte-identical to the committed
   state afterward.

4. **Ship-time pin (17→18) and i18n.** `KEYBINDINGS_REGISTRY.length`
   pin and the sorted persisted-id-literal array both updated correctly
   to include `review.prevCard`. Ran the i18n compile tripwire
   (`tests/unit/i18n-messages-compile.test.ts`, which `t()`s every key in
   `en.json` to force lazy compilation) — 1 passed. The two new keys
   (`keybindings.action.reviewPrevCard.label`/`.description`) are present
   in `en.json` and compile without error. (Note: this tripwire test
   catches interpolation-syntax breaks across all of `en.json`; the
   keybindings-catalog test's own `'every action references an existing
   i18n key prefix shape'` check is separately a shape-only regex, not a
   presence check — between the two, both the key's existence in `en.json`
   and its compilability are covered.) `ja`/`ko`/`zh-CN` untouched,
   matching `reviewNextCard`'s own precedent (grepped, zero hits in those
   locales for the sibling key either) — not a new inconsistency.

5. **Gates, run independently in the worktree, all clean:**
   - `npx vue-tsc -b` — clean, no output.
   - `npx eslint .` — clean, no output.
   - `npm run build` — 1113 modules, built in ~2s, only the pre-existing
     >500kB chunk-size advisory.
   - `npm run test:run` — 121 files / 1538 passed, 3/4 skipped, matches
     builder's reported baseline delta (+3 tests, 0 regressions).
   - `next` confirmed unmoved (`dab7f993`) — no trial-merge required.

6. **Standing.** No `waitForTimeout`/`chromium` anywhere in the diff.
   3 files touched (`keybindings-catalog.ts`, `en.json`, the catalog
   test file) — proportional to the ~4-file expectation, ADR-0004
   minimal-touch respected. `FEATURES.md`/`frontend/FILES.md` correctly
   left untouched (no new/moved/deleted source file, and the existing
   tour entry doesn't name `.`'s key either — consistent granularity).

## Scope note

The builder's report also documents (§1) that the deck-repeat feature's
state model itself was already merged into `next` before this dispatch
began, and that this dispatch's only real deliverable was the hotkey
(§2-§6) — confirmed independently here by inspecting `useReviewSession.ts`
directly in the worktree (`goBack`/`canGoBack` at lines 933/1137, already
present pre-change) and by this diff's own `--stat` touching only the
three keybinding-layer files. No scope creep, no silent narrowing.

No defects were found across the predicate mirror, collision check,
handler-wiring spot-check, i18n pins, or gates, so the change is
accepted as submitted.
