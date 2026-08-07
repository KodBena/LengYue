# Dispatch report — ADR-0019 audit S6 + S11 + S13

Branch: `worktree-agent-a1c39e65d18c3e32d`
Commit: `823268aebaacd94d57942d1cfaba9d29fc4cf0c8` (merge commit; supersedes `5aa860f5`/`b80002cd`
below, which were built on a stale base)

## Correction notice (read this first)

The original delivery (commit `5aa860f5`, report text preserved below under "Original delivery")
was built against a worktree branch point that turned out to be stale relative to the real
integration branch. Two claims in that original report are **wrong and must not be trusted**:

- "The board-tab rail is not virtualized here" — **false** against the real integration branch.
  The virtualization (`useVirtualList`, the windowed `tabWindow` render, the `padding-top` clip
  fix) was real, shipped work I simply hadn't merged in yet. "Nothing to regress here" was an
  artifact of comparing against a stale base, not a fact about the codebase.
- "`useModalKeyboard.ts` does not exist" — **false** against the real integration branch. It
  exists, is wired into all seven pre-existing modals, and `ConfirmCloseBoardModal.vue` now uses
  it too (see below).

Root cause: I fetched and merge-base'd against `origin/next` (the GitHub mirror), which really was
behind my worktree's own history in one place and behind the actual working integration branch in
another. A second, orphaned remote-tracking ref set (`refs/remotes/local/*`, no `git remote`
entry pointing at it — leftover tracking refs from a remote no longer configured, but with real,
already-fetched objects) turned out to hold the actual current integration branch
(`local/next`, tip `dcbde8de`), 96 commits ahead of my worktree's true branch point and a
strict descendant of `origin/next`. I merged that instead. Flagging this plainly rather than
letting the corrected merge quietly imply the original diagnosis was reasonable — it wasn't;
`origin/next` should have been treated as suspect the moment its merge-base with my branch (an old
commit, `52b1df9`) didn't match what my worktree's own `git log` said its ancestry was on first
principles. I did not catch that the first time.

## Repair performed

1. `git merge origin/next` was done first (against the wrong ref), conflicts resolved, then
   **`git merge --abort`** once the mismatch was discovered — no partial state committed from that
   attempt.
2. `git merge local/next --no-edit` — real merge, 96 commits, three conflicting files:
   `frontend/FILES.md`, `frontend/src/components/board/BoardTab.vue`,
   `frontend/src/components/chrome/SidebarWidget.vue`.
3. Conflict resolution, per file:
   - **`FILES.md`**: mechanical — kept next's updated `useBoardMoveRouting.ts` description
     (REVIEWED-state handling, unrelated content update) alongside my new `useCloseBoardGuard.ts`
     row.
   - **`BoardTab.vue`**: the virtualized-rail reality (next's `.thumb-container { padding-top: 6px
     }` clip fix, `overflow: visible` rationale) is the base; my S6 rework (`.tab-thumb-wrap` as
     the outer box, `.tab-thumb` as the real `<button>`, `.close-board-btn` as its sibling) is
     re-expressed on top of it, keeping next's box properties and comments where they still apply.
     **A real bug surfaced doing this, not just a textual conflict**: my S6 change widened the
     close button's hit area from 16×16 to 24×24 (C21) while keeping the same *visible* circle
     position, which moved the button's own top-edge overshoot from 6px to 10px. Next's clip-fix
     padding (`padding-top: 6px`) was tuned to absorb exactly the *old* 6px overshoot — left as-is,
     the wider (now keyboard-focusable) hit area would clip 4px off its top edge for any tab
     scrolled flush against the virtualized rail's top edge, a narrower recurrence of the exact
     defect (`ui-defects-investigation.md` Defect 4) the padding exists to prevent, specific to the
     keyboard-focus case C21 was fixing. Fixed by widening `padding-top` to `10px` and updating
     both its own comment and `SidebarWidget.vue`'s `tabHeight` magic-literal comment/default
     (`52` → `56`) to match. This is exactly the kind of interaction the coordinator's message
     warned "preserving render-locality and CSS-counter mechanics" would require attention to — it
     wasn't a render-locality break, but it was a real, non-textual conflict between the two
     changes that `git merge` could not see.
   - **`SidebarWidget.vue`**: next's virtualized template (`useVirtualList`, `tabWindow`,
     `thumbListRef`, `topPadPx`/`bottomPadPx`, `counter-reset` on the windowed wrapper,
     `activeBoardId` id-based lookup) is the base; the only change layered on top is
     `@close="closeBoard"` → `@request-close="requestCloseBoard"` and the
     `useCloseBoardGuard`/`ConfirmCloseBoardModal` wiring from the original delivery.
4. **`ConfirmCloseBoardModal.vue`**: rewritten to import and call the real `useModalKeyboard`
   (`useModalKeyboard(modalContentRef, isOpen, () => handle(false))`), replacing the self-contained
   Escape/initial-focus/focus-restore mechanism from the original delivery. It now has the full
   Tab-cycle focus trap that mechanism never had. Backdrop stays `background: transparent`; card
   stays `background: var(--surface-0)` — unaffected by the swap, both already matched the
   commissioner's rule.
5. `FILES.md`'s `ConfirmCloseBoardModal.vue` row updated to drop the now-false "self-contained,
   doesn't use useModalKeyboard" note.

## Gate verdicts (post-merge)

- `npx vue-tsc --noEmit` — exit 0.
- `npx vitest run --silent=true` (`nice -n 19` + `NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`) — exit 0. **1513 passed, 4 skipped, 0 failed, 119 test
  files** (up from the stale-base run's 1117/84 — the merge brought in ~400 tests from the other 96
  commits).
- **Tab-rail render-count guards, confirmed passing specifically**: ran
  `tests/integration/render-count/` alone — 3 test files, 6 tests, all passed. This includes
  `BoardTab.render-count.test.ts` (the rugplot-canvas render-locality guard) unmodified by this
  merge or by the S6/S11 changes — the conflict resolution touched only box/positioning CSS and the
  close-event wiring, never the template's reactive reads.
- The five S6/S11/S13/S5-touching test files specifically (`BoardTab-close-guard.test.ts`,
  `useCloseBoardGuard.test.ts`, `shared-chrome-css.test.ts`, both `useModalKeyboard.test.ts` files)
  — 24 tests, all passed. The `useModalKeyboard` tests passing confirms `ConfirmCloseBoardModal`'s
  swap onto the real composable didn't need a new test of its own to be covered — the composable's
  own suite covers the mechanism, and `useCloseBoardGuard.test.ts`'s modal-interaction tests (open
  on a dirty board, cancel vs confirm) still pass unchanged, proving the swap didn't change the
  modal's open/close *contract*, only its keyboard internals.

## Per-claim status (re-stated against post-merge reality)

### S6 — board tab close

1. **Tab itself gets button semantics, keyboard-activatable.** WITNESSED, unchanged by the merge.
   `.tab-thumb` is a real `<button type="button">`, now inside the virtualized rail's per-item
   render (`v-for="board in tabWindow.items"`) rather than the flat `v-for` the stale-base delivery
   tested against — `BoardTab-close-guard.test.ts` mounts `BoardTab` directly (not through
   `SidebarWidget`), so this assertion was never actually coupled to virtualization one way or the
   other; it holds identically post-merge. Native Enter/Space activation remains **UNEXERCISED
   under jsdom** for the same reason as before (jsdom doesn't simulate default button keydown
   behaviour).
2. **Close button: >=24x24 hit area, `:focus-visible` overriding the opacity:0 reveal, leaves the
   primary tab order's destructive-gauntlet shape.**
   - Hit area and focus-visible override: WITNESSED, unchanged (source-pinned assertions in
     `BoardTab-close-guard.test.ts`). **Corrected**: the hit-area widening interacts with the real
     virtualized rail's clip-fix padding in a way the stale-base delivery could not have caught,
     because that padding didn't exist in the stale base — see "Repair performed" above. Fixed as
     part of this merge, not left as a latent regression for whoever merged next later.
   - Destructive-gauntlet shape: WITNESSED structurally, same as before (two focusable elements
     per tab, alternating select/close in DOM order) — **now genuinely evaluated against the real
     virtualized rail** rather than a rail that doesn't exist upstream, closing the earlier
     UNEXERCISED gap about "this worktree predates the virtualized rail the audit measured
     against." Still UNEXERCISED: no live-browser re-measurement at the audit's original scale (a
     92-board workspace) — jsdom has no layout, and the virtual-list's windowing means a live
     measurement would need a real scrollable viewport to exercise correctly.
3. **Close gets a confirm guard (C10).** WITNESSED, unchanged in substance.
   `useCloseBoardGuard.test.ts` mounts the real `ConfirmCloseBoardModal` (now running through the
   real `useModalKeyboard`) and drives the same four scenarios (blank board closes with no prompt,
   board-with-moves opens the modal and waits, cancel leaves it open/unclosed, confirm calls
   `closeBoard`) — all still pass post-swap, which is the evidence the modal's swap onto
   `useModalKeyboard` didn't change its externally-observable open/close contract.
   - Modal conventions (backdrop `background: transparent`, card `background: var(--surface-0)`):
     WITNESSED by source read, same as before — genuinely unaffected by the `useModalKeyboard` swap
     (that composable only touches keyboard/focus JS, never styles). Still no dedicated CSS-token
     test for this modal's backdrop specifically — same disclosed gap as the original report.
   - S14 note honored, unchanged: still no generic confirm/prompt primitive built.

### S11 — tab naming

WITNESSED, unchanged by the merge. `resolveGameName` and the aria-label/aria-hidden wiring in
`BoardTab.vue` were untouched by conflict resolution (the conflicts were in the CSS box model and
the close-event name, not the naming logic). `BoardTab-close-guard.test.ts`'s assertions
(GN-property name, `Free play` fallback, `aria-hidden` on the counter span) all still pass.
Render-locality claim **now genuinely evidenced against the real perf-sensitive rail** — the
render-count guard that's the direct evidence for "doesn't reintroduce render-coupling" is the
real `BoardTab.render-count.test.ts` from the virtualization arc, not a stand-in.

### S13 — `.toolbar-btn-sm` background

WITNESSED, unchanged. `shared-chrome.css` was not touched by the other 96 commits — the merge
carried the fix through with no conflict. `shared-chrome-css.test.ts` still passes.

## Design choices / deviations, summarized (updated)

- **Guard policy** (confirm only when the board has moves): unchanged, still the position taken.
- **`request-close` event rename**: unchanged.
- **`useCloseBoardGuard.ts` as a composable**: unchanged.
- **`ConfirmCloseBoardModal.vue`'s keyboard handling**: **no longer a deviation.** The original
  self-contained mechanism was a stopgap forced by a stale base, disclosed as such at the time
  ("flagged for reconciliation once useModalKeyboard lands"). It has now landed, via this merge,
  and the modal was swapped onto it in the same change per the coordinator's instruction. Nothing
  about this deviation survives in the current code.
- **No FEATURES.md change**: unchanged rationale.

## Files touched (this repair, in addition to the original delivery's list)

- `frontend/src/components/board/BoardTab.vue` — conflict-resolved; `.thumb-container`
  `padding-top` widened 6px → 10px (see "Repair performed").
- `frontend/src/components/chrome/SidebarWidget.vue` — conflict-resolved; `tabHeight` default
  52 → 56 + comment update.
- `frontend/src/components/modals/ConfirmCloseBoardModal.vue` — rewritten onto `useModalKeyboard`.
- `frontend/FILES.md` — conflict-resolved; `ConfirmCloseBoardModal.vue` row updated.
- No changes to `useCloseBoardGuard.ts`, the three new test files, or the locale keys — all carried
  through the merge unmodified and still pass.

## Housekeeping note (unchanged from original)

`frontend/node_modules` is a symlink to the main checkout's, not a real install — see the original
delivery's note below. `package.json`/`package-lock.json` were unchanged by the `local/next` merge
(confirmed via `git diff` across the merge), so the symlink remained valid for both gate runs in
this repair.

---

## Original delivery (commit `5aa860f5`/`b80002cd`, superseded — preserved for the record)

Everything below this line is the original report text, unedited except for this header. Read it
as history, not as current fact — see the correction notice at the top of this file for what's
wrong in it.

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

**[CORRECTED ABOVE — both (1) and (2) turned out to be false against the real integration branch,
`local/next`. See the correction notice at the top of this file. Preserved verbatim below only for
the audit trail.]**

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
