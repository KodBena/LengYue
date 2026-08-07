# Fresh-context review — modal keyboard integrity + registry collapsibles

Reviewer: reviewer principal (fresh context, independent of both builds).
Posture: refute. All checks below re-derived from the diff and re-run, not
taken from the builder self-reports.

---

## TARGET 1 — `worktree-agent-ab12ec1c50376435a` (92be2104), modal keyboard/focus, S5

**Verdict: ACCEPT.**

1. **7/7 modals wired** — WITNESSED. Enumerated `src/components/modals/*.vue`
   myself: `ConfirmLoadModal`, `EngineMatchModal`, `HyperparamPromptModal`,
   `LoginModal`, `MintCardModal`, `PlayEngineModal`, `ResetAllKeybindingsModal`
   — matches the audit's "class-wide, 7/7" enumeration exactly. All seven now
   call `useModalKeyboard(container, isOpen, onClose)`.
2. **Escape path = same close path** — WITNESSED per modal, diffed each call
   site: `() => handle('cancel')`, `cancel`, `() => handle(false)`, `close`
   (×3), `handleCancel`. Every one is the identical function the
   Cancel/×/backdrop-click already called — no second close implementation.
   Data-loss check: since Escape invokes the *same* function as the existing
   close controls, it cannot discard more than clicking Cancel already did;
   no modal is made worse. `MintCardModal`'s tag-input Escape now calls
   `e.stopPropagation()` only when `showSuggestions` is true, so a first
   Escape closes the autocomplete only and a second (falls through with no
   stop) reaches the window-level modal handler — verified this is correct:
   `stopPropagation` on the bubble phase does prevent the window listener
   from firing, and the fallthrough case has no stray `else` that would
   misfire on the second press.
3. **`useUserIORegistry` hotkey suppression** — WITNESSED, traced
   `handleKeyDown`: the `anyModalOpen.value` check sits before the
   form-control guard and before any `e.preventDefault()`, so a keystroke in
   an `<input>`/`<textarea>` inside an open modal was already exempt via the
   pre-existing form-control branch, and the new guard adds nothing that can
   intercept typing — it only blocks *registry-bound hotkey* dispatch, never
   normal key input. No composition risk found with the in-flight `.`/`[`/`]`
   hotkeys: they route through the same `keyToAction` map and are equally
   suppressed while a modal is open, which is the correct behavior (a hotkey
   should not fire under an open modal).
4. **Manual focus trap** — WITNESSED, red-legged. `getFocusableElements` is
   attribute-only (`disabled`, `tabindex="-1"` excluded; deliberately no
   `offsetParent`/layout filter, correctly justified since jsdom has no
   layout — confirmed this reasoning is sound, not a dodge). Ran the full
   suite: `npx vitest run tests/unit/composables/useModalKeyboard.test.ts
   tests/integration/useModalKeyboard.test.ts` → 8/8 pass. Red-legged the
   trap (inserted an early `return` right after the `Tab` check in
   `handleKeydown`) and reran — the wrap assertion failed exactly as
   expected (`Cancel` vs `Reset all`), proving the integration test is a
   real witness, not a tautology. Reverted; working tree clean afterward.
   Both directions (Tab wrap end→start, Shift+Tab wrap start→end) are
   covered and were part of the failing red-leg.
5. **Gates**, re-run independently in the worktree (fresh `npm ci`):
   `npm run build` (vue-tsc -b && vite build) → exit 0. `npx eslint .` →
   clean. `npm run test:run` → **1109 passed, 4 skipped, 83 files** (matches
   builder's report exactly). Diff scoped to merge-base with `next`
   (`3378806f`) is clean: only the 7 modal files, the new composable, its
   two test files, `useUserIORegistry.ts`, `FILES.md`, and the build report —
   no unrelated package-lock/version drift once diffed against the correct
   base (the raw `main...HEAD` diff earlier showed unrelated dependabot
   noise; that's base drift, not this branch's content).

No defects found. `LoginModal`'s `computed(() => true)` shape for the
mount-only-while-open pattern is correct and its `onUnmounted` deactivation
path is exercised implicitly by every other integration test's `unmount()`
in `afterEach`.

---

## TARGET 2 — `worktree-agent-a5f4272c2e07232e7` (ddf014b1), registry collapsibles

**Verdict: ACCEPT.**

- **Default-collapsed exactly `knobs` + `analysis_env`, every render** —
  WITNESSED. `isRegistryGroupDefaultCollapsed` is a pure `key === 'knobs' ||
  key === 'analysis_env'` predicate; `:open="isInitiallyOpen(key)"` is an
  uncontrolled initial-value binding (Vue never re-patches `open` against a
  changed reactive value here since the bound expression is a pure function
  of the static `key`), which is the correct mechanism for "collapsed on
  every fresh render, never persisted, never fights the user's own
  toggle" — confirmed by reading `RegistryEditor.vue`'s template and
  `isInitiallyOpen`. Grepped the settings schema for both key names
  (`src/store/schema.ts`, `src/store/defaults.ts`) — `knobs` and
  `analysis_env` each occur exactly once, so there is no other branch at a
  different path that would be accidentally swept into collapse by a
  same-name collision. `npx vitest run tests/unit/lib/utils.test.ts` → 6/6
  pass, including the case/substring near-miss guards
  (`'Knobs'`/`'analysisEnv'`/`'analysis_env_extra'` all correctly `false`).
- **Other groups expanded by default** — WITNESSED via the same predicate
  test (`engine`, `appearance`, `persistence`, `minting`, `navigation`,
  `katago`, `overrideSettings` all assert `false`).
- **`@click.stop` on summary buttons** — WITNESSED in the diff: both
  `restore-btn` and `delete-btn` moved from `@click` to `@click.stop` in the
  same hunk that moved them inside `<summary>`. Correct and necessary —
  without `.stop`, a native `<summary>` click bubbles to the disclosure's
  own toggle behavior and a restore/delete click would also flip
  open/closed. No regression: the click handlers (`restoreDefault`,
  `deleteKey`) are otherwise unchanged.
- **C17 free-focusability** — native `<summary>` is keyboard-focusable and
  toggles on Enter/Space in evergreen browsers with no custom ARIA; correct
  and the cheapest-honest choice, matches the pre-existing `.settings-section`
  CSS class (`shared-chrome.css`) which is already written against
  `<details>`/`<summary>` selectors (`.settings-section > summary`,
  `[open] > summary::before` chevron rotation) — confirmed this CSS was
  already shaped for exactly this markup, not being bent to fit.
- **No persisted state minted** — confirmed by reading the full diff: no
  new store field, no localStorage/backend write, `:open` is the only new
  reactive surface and it is uncontrolled as above.
- **Gates**, re-run independently (fresh `npm ci`): `npm run build` → exit
  0. `npx eslint .` → clean. `npm run test:run` → **1105 passed, 4 skipped,
  81 files** (matches builder's report). Diff scoped to merge-base with
  `next` is clean and minimal: `RegistryEditor.vue`, `lib/utils.ts`,
  `tests/unit/lib/utils.test.ts`, and the build report — 4 files.

No defects found. The one honestly-disclosed gap (component-level `<details
:open>` render wiring is UNEXERCISED — no component-test harness exists in
this codebase per `tests/CLAUDE.md`'s tier structure) is correctly labeled
as such in the build report and is a pre-existing test-infrastructure gap,
not something this change introduced or should have had to fix.

---

## Merge order / overlap with other in-flight UI branches

Checked file-level overlap against every worktree branch touching `App.vue`
or a review-panel file (`git diff --stat` per worktree vs `next`):

- **`worktree-agent-a687e848205ea1fe5`** (`6d83b297`, "honest cold-load gate
  for the workspace fetch, ADR-0019 S1") touches `frontend/src/App.vue`
  (325-line diff). **No overlap** — neither Target 1 nor Target 2 touches
  `App.vue`.
- **"deck-repeat"** — searched for an active branch; found only
  `.claude/dispatch-reports/deck-repeat-design.md`, marked "Status:
  proposal, not implemented" (no code). There is currently no in-flight
  deck-repeat branch to conflict with; the review-panel file set it would
  touch (`useReviewSession.ts` et al.) is untouched by both targets in any
  case.
- **Targets 1 and 2 vs each other**: fully disjoint file sets (modals +
  `useModalKeyboard.ts` + `useUserIORegistry.ts` vs `RegistryEditor.vue` +
  `lib/utils.ts`). No conflict; mergeable in either order.

**Recommended merge order:** either order is safe; no shared files. Suggest
Target 1 first (larger surface, more consumers of `useModalKeyboard.ts`
downstream) then Target 2, but this is a preference, not a constraint.
