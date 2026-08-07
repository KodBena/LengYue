# Fresh-context review — ADR-0019 audit S6 + S11 + S13 (board-tab rail)

Reviewer posture: REFUTE, fresh context, no findings handed in — everything below is
independently derived and then cross-checked against the builder's own self-report
(`.claude/dispatch-reports/s6-s11-s13-tabrail.md`), read only after this review's findings
were formed.

## Artifact reviewed

Branch `worktree-agent-a1c39e65d18c3e32d`, merge commit `823268ae` + report commit `db09d517`.
The branch's merge base (`3378806f`) was 80 commits behind current `next` (tip `486d05fb`).
Per instructions, the branch was merged onto current `next` in a scratch worktree
(`/tmp/.../scratchpad/s6review`, branch `s6-s11-s13-review-merge2`) and every witness below
ran against that **merged** result, not the branch's own tree.

Merge produced one real conflict, in `frontend/FILES.md` (two hunks — a new-file description
addition and a competing edit to an existing row's prose). Both were mechanical documentation
unions (kept both sides' content); no source file conflicted. `BoardTab.vue` and
`SidebarWidget.vue` — the two files the builder's own report flags as having required a real
conflict resolution against a stale base — merged clean here because the delivery branch
already carries `db09d517`'s repair commit (a second merge of `local/next`, done by the builder
before this review started); this review is verifying that repair, not redoing it.

## Verdict: **ACCEPT**

The three commissioned findings (S6, S11, S13) are genuinely fixed on the merged result, with
working tests that fail when the fix is disabled, clean typecheck, a clean full suite, and clean
ESLint (including the a11y plugin) on every touched file. The one prior self-correction in the
branch's own history (the builder's `db09d517` commit, discovering it had merged a stale/wrong
base and redoing the merge against the real integration branch) checked out against actual git
content when I re-verified it independently — the corrected report's claims are not
self-report-only, they hold under direct inspection of the merged diff. No malicious compliance,
no silent narrowing, no unrelated scope creep found. Two low-severity nits noted below; neither
blocks acceptance.

## Witnesses run (all by me, in the scratch worktree)

1. **Merge onto current `next`.** WITNESSED. One conflict (`FILES.md`, doc-only), resolved by
   union; committed as `d53228a3` in the scratch worktree. No conflicts in any source file.

2. **`npx vue-tsc --noEmit` on the merged result.** WITNESSED. Exit 0.

3. **`npx vitest run --silent` on the merged result** (`nice -n 19`,
   `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`). WITNESSED.
   152 test files passed, 3 skipped; 1818 tests passed, 4 skipped, 0 failed. (Builder's own
   post-merge report claims 1513/119 at the time it ran — the higher count here is consistent
   with `next` having moved further since; not a discrepancy.)

4. **Tab-rail render-count guard, specifically, on the merged result.** WITNESSED.
   `tests/integration/render-count/BoardTab.render-count.test.ts` run in isolation: 2/2 passed
   — "does not re-render when rugplot analysis data changes" and the positive-control "does
   re-render when chrome state changes." This is the direct evidence the S6/S11 changes did not
   reintroduce render-coupling into the rugplot canvas.

5. **Geometry claims — read against actual merged CSS, not the builder's prose.**
   WITNESSED. `.close-board-btn { top: -10px; right: -10px; width: 24px; height: 24px; }`
   (`BoardTab.vue`), and `.thumb-container { padding-top: 10px; }`. The center-offset algebra
   the builder claims (`-6 + 16/2 = -10 + 24/2 = -2`, i.e. the *visible* 16×16 circle's center is
   unchanged even though the *hit box* grew to 24×24) checks out by direct computation. I also
   diffed the pre-merge `next` copy of the same file (`git show next:...BoardTab.vue`) and
   confirmed it really did carry the older `padding-top: 6px` / implicit 16×16-equivalent
   overshoot the builder's repair note describes fixing — so the "the merge surfaced a real,
   non-textual bug the auto-merge couldn't see" claim in the builder's report is not
   post-hoc narrative, the before-state is verifiably what's claimed. `SidebarWidget.vue`'s
   `tabHeight` default (56) matches `10 + 32 + 12 + 2` exactly, confirming the virtualizer's
   fixed-row-height assumption tracks the new CSS.

6. **Keyboard operability, structural.** WITNESSED. `.tab-thumb` is a real
   `<button type="button">` (template + `BoardTab-close-guard.test.ts` asserting
   `tagName === 'BUTTON'` and `disabled === false`); it carries `:focus-visible { outline: 2px
   solid ... }`. `.close-board-btn` is a sibling `<button>` (not nested — correctly avoids the
   illegal button-in-button the old single-`<button>`-wrap design would have forced), with its
   own `:focus-visible { opacity: 1 }` rule that overrides the `opacity: 0` hover-reveal —
   present and correctly positioned after the `:hover` rule in the cascade. DOM order per tab is
   select-button then close-button, so the destructive-gauntlet is broken in the sense that
   matters most (selection is keyboard-reachable at all, and reaching tab N's own selection
   button never requires passing that tab's own close button) — see the nit below for the
   residual shape.

7. **`useCloseBoardGuard` → `ConfirmCloseBoardModal` → `useModalKeyboard` wiring.** WITNESSED.
   `SidebarWidget.vue` mounts `ConfirmCloseBoardModal` once, binds it through
   `confirmCloseBoardModalRef`, and passes that ref into `useCloseBoardGuard`; `BoardTab`'s
   `request-close` (renamed from `close`, verified no remaining `@close="closeBoard"` or bare
   `closeBoard(...)` call sites outside the guard, the perf-scenario harness, and the guard's
   own store definition) routes through `requestCloseBoard`, which only calls the store's
   `closeBoard` after either (a) the board has ≤1 node (root-only, nothing to lose) or (b) an
   explicit confirm from the modal. `ConfirmCloseBoardModal.vue` calls the real
   `useModalKeyboard(modalContentRef, isOpen, () => handle(false))` — Escape routes to the same
   cancel path a Cancel click takes, full Tab-cycle focus trap, initial focus, and focus
   restoration all come from that one shared composable, not a bespoke reimplementation.
   Backdrop is `background: transparent`, card is `background: var(--surface-0)` — matches C10's
   "confirmed or undoable" (confirmed, here) and the commissioned surface-0 control-background
   convention.

8. **Mutation-falsification.** WITNESSED, performed by me. I disabled the guard's own gate
   (`if (nodeCount > 1)` → `if (false && nodeCount > 1)` in `useCloseBoardGuard.ts`) and re-ran
   `useCloseBoardGuard.test.ts`: 3 of 5 tests went red immediately (the two guard-was-invoked
   assertions and the fail-loud-on-missing-modal-ref assertion), confirming the tests actually
   exercise the load-bearing logic rather than passing vacuously. Reverted; full suite (both new
   test files) re-ran green, and `git diff` confirmed the revert left no trace.

9. **S13 — `.toolbar-btn-sm` background.** WITNESSED. `background: var(--surface-0)` present on
   the bare-selector rule in `shared-chrome.css` (verified the regex-anchored test file matches
   only that rule, not the unrelated `.settings-section > summary > .toolbar-btn-sm` descendant
   rule earlier in the file). `--surface-0` is the token the commission names as blessed; note
   this differs from the audit document's own suggested `--surface-3` — a real, disclosed
   substitution the commission's own task text ratifies, not a silent deviation.

10. **ESLint, including the a11y plugin, on every file this delivery touched.** WITNESSED
    (not in the required-witness list, run as an extra corroboration since C17/C20/C21 are
    exactly the class `eslint-plugin-vuejs-accessibility` polices per the ADR-0019 appendix).
    Clean — zero errors/warnings on `BoardTab.vue`, `ConfirmCloseBoardModal.vue`,
    `useCloseBoardGuard.ts`, `SidebarWidget.vue`.

## Findings

1. **(Nit, non-blocking) Tab order is "alternating," not "selection-first-then-closes."**
   The commission's phrase "selection reachable without passing through closes" is true in the
   strongest sense that matters (there is no longer a *block* of N closes you must survive before
   reaching any selection at all — the original defect), but reaching board N's own selection
   button still means tabbing past N−1 other tabs' close buttons along the way, since each tab
   contributes `[select, close]` in that order. This is disclosed accurately in the builder's own
   report ("alternating select/close in DOM order," explicitly not claimed as eliminated) — I flag
   it only because the commission text could be read as promising a stronger property than what
   shipped. Given the destructive action is now also confirm-guarded (C10) and each close is a
   full keyboard cycle away rather than the previous "one Tab and one Enter destroys a board with
   no warning," the residual risk is materially lower even without a select-only lane. Not a
   defect; a scope note.

2. **(Nit, non-blocking) New DOM-asserting tests sit outside the tier structure `tests/CLAUDE.md`
   declares.** `tests/CLAUDE.md` states component/template tests are "out of scope at present"
   with a named narrow exception for render-count guards only. `BoardTab-close-guard.test.ts`
   mounts `BoardTab.vue` directly via `@vue/test-utils` and asserts on rendered tag names and
   `aria-*` attributes — a component-level test that isn't a render-count guard. This is the
   right call in substance (C17/C20/C21 are DOM-semantics properties; no composable-level test
   could pin "is this element a `<button>`" or "does this element carry this `aria-label`"), and
   ESLint's a11y plugin corroborates the same facts independently, so the claims aren't resting on
   an unsanctioned test alone. But the delivery doesn't flag the tier deviation against the
   written testing posture, and a strict reading of `tests/CLAUDE.md` would want that named. Worth
   a one-line acknowledgment in a follow-up, not a blocker.

3. **(Informational) `BoardTab.vue` is 456 lines against ADR-0007's ~250-line SFC target.** This
   is pre-existing debt, not new: the file was already 340 lines on `next` before this delivery
   (confirmed via `git show next:...`), and the +116 lines this delivery added are almost entirely
   comments justifying non-obvious CSS math (the button-nesting constraint, the hit-area/overshoot
   interaction) — exactly the kind of load-bearing-detail documentation ADR-0005 asks for, not
   inflated logic. Flagging only because the file crosses further past the threshold; not this
   delivery's debt to have paid down, and the comments earn their weight (I used them directly to
   verify claim 5 above).

4. **No defects found in the commit's own honesty.** The delivery's dispatch report contains a
   prominent, first-person correction notice disclosing that its original submission was built
   against a stale/wrong merge base and that two of its original claims were false as a result. I
   independently re-derived the "was the original base actually stale" fact from `git log`/`git
   show` rather than trusting the notice, and it checks out. This is the behavior ADR-0002 and the
   umbrella CLAUDE.md's fail-loudly posture ask for, actually exercised under a real mistake,
   not merely claimed.

## Per-claim status (commission's own claim list)

| # | Claim | Status |
|---|---|---|
| S6 | Tab is real button semantics, keyboard-operable | WITNESSED |
| S6 | Close ≥24×24 hit area | WITNESSED (source geometry + arithmetic verified) |
| S6 | `:focus-visible` overrides opacity:0 hover-reveal | WITNESSED |
| S6 | Tab order not a destructive gauntlet (selection reachable without passing through closes) | WITNESSED, with the residual "alternating, not select-only-lane" shape noted (Finding 1) |
| S6 | Close guarded per C10 (confirm modal, app conventions, transparent backdrop, surface-0 card) | WITNESSED |
| S11 | Tab carries accessible name (game name / stable fallback) reaching DOM/AT | WITNESSED |
| S11 | CSS-counter visible ordinal preserved (perf-deliberate) | WITNESSED |
| S13 | `.toolbar-btn-sm` gets themed background (`--surface-0`) | WITNESSED |
| — | Render-locality / render-count guard not regressed | WITNESSED (guard run in isolation on merged result, passing) |
| — | Real Enter/Space keydown→click activation on the new `<button>` | UNEXERCISED (jsdom does not simulate native default button-key activation; structurally sound — real `<button>`, no custom handler suppressing default — but not fired-and-observed) |
| — | Live-browser pixel measurement of the 24×24 hit area at real DPR | UNEXERCISED (no live ports touched, per instructions; source-geometry verification substitutes) |
| — | Live-browser re-measurement of tab-order at the audit's original 92-board scale | UNEXERCISED (same reason; the builder's own report discloses this gap identically) |

## Scope note

I did not evaluate S7–S29 (the rest of `adr19-audit.md`) — out of scope for this commission,
which named only S6/S11/S13.

## Housekeeping

`frontend/node_modules` in the scratch worktree is a symlink to the main checkout's
(`/home/bork/w/omega/frontend/node_modules`), after confirming `package-lock.json` is byte-identical
between the merged result and the main checkout — not a real install, not part of any commit.
