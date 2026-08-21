# S14/S16 dialogs — build report

Branch: `worktree-agent-a45e1d4ff88a9b05b`
Commit: `951742fc` (initial delivery), report commit `ec3461bb`,
**post-review fix commit: see "Post-review fixup" below — current
HEAD sha is reported in the final chat reply, not hardcoded twice
here to avoid drift.**

## Post-review fixup (C20 — accessible name on the prompt input)

Fresh-context review (ACCEPT-WITH-NITS) found one blocking issue:
`AppPromptDialog.vue`'s `<input>` had no programmatic label
(`aria-label`/`aria-labelledby`/`<label for>`) — the prompt's message
rendered as a plain `<p>`, and several real call sites pass no
`placeholder`, so those inputs had zero accessible name for
assistive tech. This regressed the codebase's own precedent
(`HyperparamPromptModal.vue` uses `<label :for>`) and, since this
whole arc exists to close ADR-0019 findings, shipping a new C20
violation inside it was not acceptable.

**Base note:** before starting the fix, `next` had moved to
`f727f0b3` (4 new commits: known-positions boot-hydrate work). The
worktree branch had exactly 2 commits beyond the old base and none of
them touched files `next` had also changed, so `git merge next
--no-edit` applied clean — only `frontend/FILES.md` needed the
standard auto-merge (both sides appended independent rows), resolved
automatically with no conflict markers. WITNESSED via the merge
commit's own diffstat.

**Fix** (`src/components/modals/AppPromptDialog.vue`): replaced the
plain `<p v-if="request.message">` with `<label :for="INPUT_ID"
class="prompt-label">{{ inputLabel }}</label>`, and gave the `<input>`
a matching `:id="INPUT_ID"`. `inputLabel` is a computed fallback
chain — `request.message || request.title ||
t('dialogs.prompt.defaultLabel')` — so every call site gets a real
programmatic label for free, with no call site needing to remember to
pass one (the review's own ask). New locale key
`dialogs.prompt.defaultLabel` added to all 4 catalogs for the
no-message/no-title edge case (not hit by any of the 6 real S14 call
sites, all of which pass `message`, but closes the gap honestly for
future callers). The outer dialog's own `role="dialog"`
`aria-label`/`aria-labelledby` (naming the DIALOG, a separate concern
from naming the INPUT) was already correct and untouched.

**Test added** (`tests/integration/useAppDialogs.test.ts`, 2 new
cases, both WITNESSED green):
- "gives the input a real programmatic label wired to the prompt
  message (C20 — review finding)" — pins the actual DOM association:
  asserts the rendered `<label>`'s text equals the prompt message,
  and that `label.attributes('for') === input.attributes('id')`, so
  the test fails if the label is ever removed or its `for` drifts
  from the input's `id`.
- "falls back to the dialog title, then a generic catalog string,
  when no message is given" — exercises both fallback rungs of
  `inputLabel`'s chain.

Total tests in that file: 9 → 11.

## Worktree-base deviation (disclosed up front)

The worktree was cut from a stale base (`3378806f`, the tip of `main`
before any of the ADR-0019 remediation work landed), 164 commits
behind `next` — `useModalKeyboard.ts`, `useSetupWizardSignal.ts`,
`SetupWizardModal.vue`, and the wizard tree the commission names as
precedent to study did not exist in the checkout, and the audit's
cited `file:line` references (e.g. `closeBoard` at `store/index.ts:560`)
did not match. Verified there were zero commits on the worktree branch
beyond that base (`git log --oneline next..HEAD` → 0), so I
fast-forward-merged the worktree branch onto `next`
(`git merge --ff-only next`) before starting any edits. This is
disclosed as a deviation from "just build in the worktree as given" —
the alternative (hand-rolling the modal-keyboard/focus-trap machinery
the commission explicitly says already exists) would have duplicated
S5's shipped mechanism and ignored a direct instruction to reuse it.

## S14 — 17 native prompt()/confirm()/alert() sites converted

WITNESSED via `grep -rnE "(^|[^.\w])(window\.)?(prompt|confirm|alert)\("
src` both before (17 matches, matching the audit's count) and after
(0 bare calls remain — only comments/doc-strings and the new
`dialogs.confirm/alert/prompt` method names match).

Built:
- `src/composables/useAppDialogs.ts` — `useAppDialogs()` exposing
  `confirm()` / `alert()` / `prompt()`, each returning a Promise.
  Module-scoped `currentDialogRequest` signal (same shape as
  `useSetupWizardSignal.ts` / `useMintDialogSignal.ts`), carrying its
  own `resolve` callback so the two dialog components can settle the
  caller's promise directly.
- `src/components/modals/AppConfirmDialog.vue` — confirm/alert
  (alert = confirm with `cancelLabel: null`, single OK button).
- `src/components/modals/AppPromptDialog.vue` — text prompt, seeded
  from `defaultValue`, text auto-selected on open.

Both mounted once, unconditionally, at `App.vue` level (alongside the
existing `SetupWizardModal` / `MintCardModal` / etc.), gated
internally by `v-if="request"` off the shared signal. Both wired
through `useModalKeyboard` (Escape → cancel, Tab focus trap, initial
focus, focus restoration) exactly like the app's other 7 modals.
Styling: `.modal-backdrop { background: transparent; }` per the
commissioner's absolute NO-tint ruling (copied verbatim from
`SetupWizardModal.vue`'s ruling comment), card on `var(--surface-0)`,
buttons using the same `.btn` / `.btn-secondary` / `.btn-primary`
token shape as `SetupWizardModal.vue` (added `.btn-danger` for
destructive confirms, `--state-error`-bordered, same family).

Converted sites (all 17, WITNESSED via the before/after grep):
- `PaletteEditor.vue` — 4 `prompt()` (symbol/parameter/palette/chart
  naming) + 1 `confirm()` (delete item, now `danger: true`).
- `CardSetEditor.vue` — 1 `prompt()` (deck name) + 1 `alert()`
  (id-exists) + 1 `confirm()` (delete deck).
- `AnalysisControls.vue` — 2 `confirm()` (discard persisted analysis,
  purge ledger — both `danger: true`).
- `ReviewSessionPanel.vue` — 1 `confirm()` (retry card, `danger:
  true`).
- `CardMetadataPanel.vue` — 1 `confirm()` (reset-prior, `danger:
  true`).
- `MintCardModal.vue` — 1 `alert()` (mint failure). C8 pass: title
  carries the located error (`mint.alert.failed`), message carries a
  new remediation string (`mint.alert.failedRemediation`, en-only
  content mirrored as the stub-locale placeholder per
  `docs/i18n.md`'s lockstep convention) naming the reachable next
  action (retry Mint Card — the modal does not close on failure, so
  that action is genuinely reachable, not just claimed).
- `PboPopover.vue` — 1 `window.prompt()` (bookmark name).
- `QeuboBookmarks.vue` — 2 `window.prompt()` (new bookmark, rename —
  rename passes `defaultValue: b.name`) + 1 `window.confirm()`
  (delete, `danger: true`).

Cancellation resolves rather than rejects (`false` / `null`), and
every call site's existing `if (!name) return;` / `if (!ok) return;`
guard is unchanged, so a cancelled dialog remains a no-op — no
external draft is ever touched by cancel (C16; there is no external
draft to lose at any of these 17 sites — the prompt's own typed text
IS the draft, and native `prompt()` already discarded it on cancel,
so behavior is unchanged, not regressed).

**Lint/guard for zero-native-calls**: no lint rule or existing
grep-the-tree test pattern was found in the repo for this shape
(`frontend/eslint.config.js` has no such rule, and no existing test
greps `src/` for a banned pattern) — UNEXERCISED as a mechanized gate.
Per the commission ("say so if neither fits"): a unit test asserting
zero `window.prompt`/`confirm`/`alert` occurrences under `src/` was
NOT added, because the repo's testing posture
(`frontend/tests/CLAUDE.md`) scopes Tier 1/2/3 to composable/service
logic, not source-tree greps, and no precedent test of that shape
exists to extend. Flagging this as a live gap rather than silently
declining it — a follow-up ledger item would be the right vehicle if
the commissioner wants it mechanized.

## S16 — tombstone removed

`AnalysisControls.vue`'s "Moved to Other tab → Knob Registry..."
signpost paragraph (`analysis.moveFilter.movedNotice`) is deleted from
the template and from all 4 locale catalogs (en/ja/ko/zh-CN).
WITNESSED: `grep -rn "movedNotice" src` → 0 matches post-edit. The
dynamic `%` badge (`analysis.moveFilter` label +
`store.session.ui.moveFilterThreshold`) is UNCHANGED, per the
commission's explicit "keep the % badge (S3)" instruction.

## Concurrent-builder boundary (S6)

Did not touch `BoardTab.vue` or `SidebarWidget.vue` — WITNESSED via
`git diff --stat` on the final commit; neither file appears.

## Gates

Re-run after the post-review fixup, on the merged (post-`next`-ff)
tree:

- `npx vue-tsc --noEmit` → **exit 0**, WITNESSED, clean (initial
  delivery, and again after the C20 fixup).
- `npx vitest run --silent=true` (full suite, `NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `nice -n 19`) → **exit 0**,
  WITNESSED post-fixup: `148 passed | 3 skipped (151)` files, `1795
  passed | 4 skipped (1799)` tests, 96.75s. (Pre-fixup, before merging
  `next`: 147/150 files, 1787/1791 tests — the delta is the 4 new
  known-positions-boot-hydrate tests `next` brought in via the merge,
  plus the 2 new C20 tests below.)
- `npx eslint` over every touched `src/` file (including the fixup) →
  **exit 0**, WITNESSED, zero problems.

## Tests added

`tests/integration/useAppDialogs.test.ts` — 9 tests at initial
delivery, **11 after the C20 fixup**, all WITNESSED green — drives the
real `AppConfirmDialog.vue` / `AppPromptDialog.vue` pair (not mocks),
covering:
- confirm-accept (danger button), confirm-cancel (button), confirm
  Escape.
- alert: single footer button, resolves on OK.
- prompt-value (seeded from `defaultValue`, typed value resolves),
  prompt-cancel (button) resolving `null` (distinguishable from an
  empty-string submit), prompt Escape resolving `null`.
- **New (C20 fixup):** the input's `<label for>` association pinned
  against the prompt message, and the message→title→catalog-string
  fallback chain exercised end to end.
- One converted call site end-to-end: `CardSetEditor`'s "add deck"
  prompt — click `+`, type a name in the real rendered dialog, submit,
  assert the emitted `update` payload contains the new card set keyed
  off the typed name; a companion test asserts cancelling emits
  nothing.

Updated `tests/integration/MintCardModal-komi-calibration.test.ts`:
removed the now-dead `vi.spyOn(window, 'alert')` mute (the failure
path no longer calls `window.alert`); no assertions in that file
referenced the alert call, so no other change was needed — the three
existing behaviors it pins (calibrate+commit, abort-on-calibration-
failure, opt-out-unchanged) are unaffected and still WITNESSED green
in the full-suite run above.

## Files touched (frontend/)

New: `src/composables/useAppDialogs.ts`,
`src/components/modals/AppConfirmDialog.vue`,
`src/components/modals/AppPromptDialog.vue`,
`tests/integration/useAppDialogs.test.ts`.

Modified: `src/App.vue` (mount points), `FILES.md` (new-file entries +
corrected modal-count note), `src/components/CardMetadataPanel.vue`,
`src/components/ReviewSessionPanel.vue`,
`src/components/editors/AnalysisControls.vue`,
`src/components/editors/CardSetEditor.vue`,
`src/components/editors/PaletteEditor.vue`,
`src/components/modals/MintCardModal.vue`,
`src/components/qeubo/PboPopover.vue`,
`src/components/qeubo/QeuboBookmarks.vue`,
`src/locales/{en,ja,ko,zh-CN}.json` (new `dialogs.*` default-label
keys, new `mint.alert.failedRemediation` key, removed
`analysis.moveFilter.movedNotice`),
`tests/integration/MintCardModal-komi-calibration.test.ts`.

## Deviations from the commission, disclosed

1. Worktree fast-forwarded onto `next` before starting (see top) —
   not requested verbatim, but the commission's own references only
   resolve against that state.
2. `MintCardModal`'s alert message was elaborated (title = the
   original error string, message = a new remediation sentence)
   rather than passed through unchanged, to satisfy the commission's
   own C8 callout ("give it location+remediation"). This is new
   English-only locale content mirrored as a placeholder into the
   3 stub locales per `docs/i18n.md`'s documented convention (not a
   real translation — same posture as every other stub entry in those
   catalogs).
3. No mechanized zero-native-calls guard was added (see S14 section
   above) — flagged as a live gap rather than force-fit into a pattern
   the repo doesn't already have.
