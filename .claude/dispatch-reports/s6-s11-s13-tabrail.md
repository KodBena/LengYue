# Dispatch report — ADR-0019 audit S6 + S11 + S13

Branch: `worktree-agent-a1c39e65d18c3e32d`
Commit: `5aa860f5287bd4b81924c4f8aa4f35dfcce78fd2`

## Gate verdicts

- `npx vue-tsc --noEmit` — exit 0.
- `npx vitest run --silent=true` (under `nice -n 19` + `NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`) — exit 0. 1117 passed, 4 skipped, 0 failed, 84 test
  files.
- Existing render-count guard (`tests/integration/render-count/BoardTab.render-count.test.ts`)
  stayed green unmodified — the render-locality invariant (rugplot data never touches the render
  path) is unaffected by this change.

## Important context correction, surfaced up front

This worktree's branch point (`3378806f`, "Merge PR #444 … vite-8.0.16") **predates** two things
the commissioning dispatch's text assumes are already in place:

1. **The board-tab rail is not virtualized here.** `SidebarWidget.vue` renders every board's
   `<BoardTab>` via a plain `v-for="(board, index) in store.boards"` — there is no
   `useVirtualList`, no windowed render, no `padding-top: 6px` clip fix. The dispatch's "mind the
   existing virtualized rail + CSS-counter renumbering perf work" caution refers to work that
   exists on a later commit than this worktree's ancestry. I read the newer files once by
   accident (an unprefixed path resolved against the *main* checkout, not this worktree — caught
   and corrected before any edit landed) and confirmed via `git log` that this worktree's actual
   history stops before that perf arc. The CSS-counter-based "Board N" ordinal *is* present and
   preserved untouched, as instructed.
2. **`useModalKeyboard.ts` does not exist in this worktree.** `grep -rl useModalKeyboard src/`
   returns nothing; every existing modal here (`ConfirmLoadModal.vue` included) has zero keyboard
   handling — no `role="dialog"`, no `tabindex`, no Escape binding. This is the literal S5 defect
   the audit describes, still unfixed on this branch. The commission's "use useModalKeyboard — see
   `frontend/src/components/modals/` for the pattern" assumes a newer tree.

Given both, I did not attempt to backport the virtualization or S5 fixes (out of scope for this
dispatch and each is its own arc). For (2) specifically, `ConfirmCloseBoardModal.vue` wires a
small **self-contained** Escape/initial-focus/focus-restore mechanism instead — see the decision
recorded in that file's header comment (full rationale: not blocking on the mismatch, not
building the shared composable pre-emptively when this dispatch's own S6 text says not to build a
shared primitive, and not leaving the new modal keyboard-inert like the rest of the family). No
full manual Tab-cycle focus trap — flagged as the one piece to reconcile once `useModalKeyboard`
(or equivalent) lands in this branch's ancestry; swapping this modal onto it then should be
mechanical, since it's exactly the "thin dedicated component" the dispatch asked for.

## Per-claim status

### S6 — board tab close

1. **Tab itself gets button semantics, keyboard-activatable.** WITNESSED. `.tab-thumb` is now a
   real `<button type="button">` (`BoardTab.vue`); `tests/integration/BoardTab-close-guard.test.ts`
   asserts the element is `BUTTON`, not disabled, and that a click emits `activate` with the
   board's id. Native Enter/Space activation on a real `<button>` is standard browser behaviour
   (not reimplemented, so nothing to regress) — **UNEXERCISED under jsdom** specifically for the
   keydown→click synthesis (jsdom does not simulate that default action), so the keyboard-key path
   itself is asserted structurally (real `<button>`, standard traversal) rather than by firing a
   jsdom `Enter` keydown and checking for a synthesized click.
2. **Close button: >=24x24 hit area, `:focus-visible` overriding the opacity:0 reveal, leaves the
   primary tab order's destructive-gauntlet shape.**
   - Hit area and focus-visible override: WITNESSED via source-pinned assertions in
     `BoardTab-close-guard.test.ts` (`.close-board-btn { width: 24px; height: 24px; ... }`,
     `.close-icon { width: 16px; height: 16px; ... }`, `.close-board-btn:focus-visible { opacity:
     1; }`) — jsdom has no layout engine to compute real rendered pixels, so this is a "read the
     artifact" test (same posture as `i18n-messages-compile.test.ts`), not a rendered-geometry
     assertion. **UNEXERCISED**: no real-browser/visual confirmation that the computed hit box is
     actually 24×24 CSS px on screen.
   - Destructive-gauntlet shape: WITNESSED structurally — each tab now contributes two focusable
     elements in DOM order (select button, then close button) rather than one (close-only,
     unfocusable select), so traversal alternates select/close/select/close instead of the
     audited 72-consecutive-closes wall. **UNEXERCISED**: not measured against a real multi-board
     workspace in a live browser (the audit's own measurement method); this worktree also predates
     the virtualized rail the audit measured against, so a like-for-like re-measurement isn't
     possible here.
3. **Close gets a confirm guard (C10).** WITNESSED. `useCloseBoardGuard.ts` + `useCloseBoardGuard.
   test.ts`: a board with only its root node closes immediately with no prompt; a board with
   moves opens `ConfirmCloseBoardModal` and `closeBoard` is called only after an explicit confirm
   click, not after cancel, not after the modal ref is simply absent (that path throws per
   ADR-0002, also pinned). Guard policy and rationale (confirm only when the board has moves,
   mirroring `useDirtyBoardGuard`'s existing "has moves" signal rather than confirming
   unconditionally) is documented in the composable's header — the "confirm always" alternative
   was rejected because it would mean confirming on every close of the ambient blank boards a
   workspace accumulates, for no protective value.
   - Modal conventions (backdrop `background: transparent`, card `background: var(--surface-0)`,
     no diffuse tint): WITNESSED by direct source read of `ConfirmCloseBoardModal.vue`'s
     `<style>` block (matches the commissioner's absolute ban verbatim) — **not** covered by an
     automated test; I did not add a CSS-token test for this modal's backdrop specifically (the
     `.toolbar-btn-sm` S13 test is the only CSS-token-style test in this dispatch). Flagging this
     as a real gap rather than silently asserting "tested."
   - S14 note honored: no generic confirm/prompt primitive was built; `ConfirmCloseBoardModal.vue`
     is a thin, single-purpose component sized to be swapped onto a future generic primitive.

### S11 — tab naming

WITNESSED. `BoardTab.vue`'s `aria-label`/`title` on the selection button now carry
`resolveGameName(props.state)` — the same GN → EV → sourceFileName → date-stamped-fallback ladder
`useMetadata`/`useMinting` already use as the SSOT. `BoardTab-close-guard.test.ts` pins: an SGF
with `GN[Kobayashi vs Cho]` produces that exact `aria-label`; an SGF with no metadata falls back to
the `Free play (…)` rung (not the bare word "Board"); the counter span (`.tab-label-num`) is
`aria-hidden="true"` so it's excluded from the accessible name; the close button's `aria-label`
also names the board. The visible CSS-counter ordinal is unchanged (per the dispatch's instruction
to keep it if the render-cost tradeoff holds) — `displayName` is bound to `aria-label`/`title`
only, never rendered as DOM text, and its dependencies (root-node SGF properties, source filename)
only change at load/close time, not on the ~4 Hz analysis-packet cadence the canvas escape in the
same file exists to dodge, so it doesn't reintroduce render-coupling. The existing render-count
guard test staying green (unmodified) is the direct evidence for that claim.

### S13 — `.toolbar-btn-sm` background

WITNESSED. `shared-chrome.css`: `.toolbar-btn-sm { background: var(--surface-0); ... }` (was:
no `background` declared, inheriting Chromium's `ButtonFace`). Pinned by
`tests/unit/shared-chrome-css.test.ts` (source-text assertion, anchored to the bare-selector rule
specifically so it doesn't false-match the pre-existing `.settings-section > summary >
.toolbar-btn-sm { margin-left: … }` descendant rule earlier in the same file).
**UNEXERCISED**: no rendered-contrast re-measurement against the dark theme (jsdom can't compute
it); the fix is the one-line change the audit itself named as sufficient.

## Design choices / deviations, summarized

- **Guard policy**: confirm-on-close only when the board holds more than its root node (cheap,
  reuses `useDirtyBoardGuard`'s existing "has moves" signal) rather than confirming
  unconditionally. Rejected alternative: confirm always — cost was judged too high (every close of
  a trivially-blank board in a busy workspace) for no protective benefit, since a blank board has
  nothing to lose.
- **`request-close` event rename** (was `close`): deliberate, so the wiring can't silently regress
  back to a direct `@close="closeBoard"` binding — the new event name states the contract (a
  request the parent may gate) in the type itself.
- **`useCloseBoardGuard.ts` extracted as a composable** rather than left inline in
  `SidebarWidget.vue`: matches `frontend/CLAUDE.md`'s layering (components are thin renderers,
  composables hold logic) and mirrors `useDirtyBoardGuard`'s existing shape one-for-one, and made
  the guard's own decision logic independently unit-testable without mounting the whole sidebar
  widget (which has jank-test / thumbnail-cache / hover-preview dependencies irrelevant to the
  guard).
- **`ConfirmCloseBoardModal.vue`'s self-contained keyboard handling** instead of the commissioned
  `useModalKeyboard` composable — see "Important context correction" above; this is the one
  deliberate, disclosed departure from the letter of the commission, forced by the worktree's
  actual history rather than chosen for convenience.
- **No FILES.md-adjacent doc other than FILES.md itself** was touched — this dispatch has no
  user-facing capability change (`FEATURES.md`) beyond what the tab rail already offered (close
  was already a feature; it's now guarded and keyboard-reachable), so `FEATURES.md` was left
  alone.

## Files touched

- `frontend/src/components/board/BoardTab.vue` — S6 (button semantics, close hit-area/focus,
  request-close rename) + S11 (aria-label).
- `frontend/src/components/chrome/SidebarWidget.vue` — wires `useCloseBoardGuard` +
  `ConfirmCloseBoardModal`.
- `frontend/src/composables/board/useCloseBoardGuard.ts` — new; guard policy composable.
- `frontend/src/components/modals/ConfirmCloseBoardModal.vue` — new; confirm dialog.
- `frontend/src/assets/css/shared-chrome.css` — S13 (`.toolbar-btn-sm` background).
- `frontend/src/locales/en.json` — new keys: `confirmCloseBoard.*`, `boardTab.closeAria`.
- `frontend/FILES.md` — new-file entries for the two new modules.
- `frontend/tests/integration/useCloseBoardGuard.test.ts` — new.
- `frontend/tests/integration/BoardTab-close-guard.test.ts` — new.
- `frontend/tests/unit/shared-chrome-css.test.ts` — new.

## Housekeeping note

This worktree had no `node_modules/` (fresh worktree checkout, dependencies never installed here).
I symlinked `frontend/node_modules` to the main checkout's (`/home/bork/w/omega/frontend/node_modules`)
rather than running a full `npm install`, after diffing `package.json`/`package-lock.json` between
the two trees and confirming the only difference is main's extra (irrelevant-to-this-work) Tauri
devDependencies. `node_modules` is gitignored in both trees, so this is local-only and not part of
the commit.
