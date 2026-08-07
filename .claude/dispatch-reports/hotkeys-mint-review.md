# Fresh-context review — mint-card hotkey

Branch `worktree-agent-af73b30521aadf736` vs base `next`. Reviewed via
`git -C /home/bork/w/omega diff next...worktree-agent-af73b30521aadf736`
(single non-merge commit `cb46bc47`; the branch's merge-of-`next` commit
carries no reviewable content of its own — confirmed with
`git log next..worktree-agent-af73b30521aadf736 --oneline`, one line).

## Verdict: ACCEPT

## Scope discipline

- **WITNESSED**: only one non-merge commit exists on the branch
  (`cb46bc47`), and `git diff --name-only` shows exactly 9 files touched:
  the dispatch report, `FILES.md`, `App.vue`, `KeybindingsView.vue`,
  `keybindings-catalog.ts`, the new `useMintDialogSignal.ts`, `en.json`,
  and the two test files. No file under `review/` or
  `useReviewSession.ts` appears in the diff. The next-card `.` binding is
  untouched, as required — the maintainer's withdrawal of that scope was
  honored.

## Signal mechanism — genuine existing idiom (ADR-0012, one home for the fact)

- **WITNESSED**: `useMintDialogSignal.ts` is a module-scoped `ref`
  exported read-only (`Readonly<Ref<number>>`), mutated only through a
  named function (`requestMintDialog`) — the same shape as
  `src/lib/keybindings-capture.ts`'s `captureMode` and
  `useModalKeyboard.ts`'s `openModalCount` (confirmed by reading both:
  `openModalCount: Ref<number> = ref(0)`, mutated only inside
  `useModalKeyboard.ts`, exposed to the rest of the app only via the
  derived `anyModalOpen` computed). No parallel "open mint dialog"
  mechanism was introduced elsewhere — grep for `mintDialogRequestCount`/
  `requestMintDialog` shows exactly the signal module, the catalog
  handler, `App.vue`'s watcher, and the two test files. One home for the
  fact.

## Counter-signal pitfalls

- **Fires on mount/HMR?** No — `watch(mintDialogRequestCount, () => {
  triggerMint(); })` in `App.vue` uses Vue's default (`immediate: false`),
  so it does not fire on registration, only on subsequent changes.
  WITNESSED by reading the call site (no `{ immediate: true }` option
  present).
- **Queued request racing a precondition change (board closed between
  keypress and watch flush)?** Not a defect: `triggerMint()` reads
  `activeBoardId.value` live at *flush* time, not a value captured at
  keypress time, so if the board closes before the watcher runs, the
  no-op path (`if (activeBoardId.value)`) is what fires — correct
  behavior, not a stale-id bug. WITNESSED by reading `triggerMint`'s body.
- **Re-trigger/wedge while the mint dialog is already open?** No —
  suppressed one layer up: `useUserIORegistry`'s dispatcher checks
  `anyModalOpen.value` and returns before any action's `enabledWhen` or
  handler runs, so `requestMintDialog()` is never called while a modal
  (including the mint modal itself) is open. WITNESSED both by reading
  the dispatcher and by the builder's playwright transcript (`mint modal
  visible before hotkey: false` → `WITNESSED: mint hotkey opened
  MintCardModal`; no wedge/re-open case exercised live, but the gate is
  the same one every other registry action relies on, unmodified by this
  diff).

## Key choice, gating, C15

- **`k` collision**: WITNESSED — grepped every `defaultKey:` in
  `keybindings-catalog.ts`; `k` is unused elsewhere in the registry. Not a
  modifier chord, so it doesn't fall in C15's browser/AT-reserved-chord
  class (`ctrl+w/t/l` etc.) at all — no host-chord collision.
- **`enabledWhen: activeBoardExists` vs. the Toolbar button**: the Toolbar
  mint button (`Toolbar.vue` line 118) has *no* `disabled` binding — it's
  always clickable — but `triggerMint()` itself no-ops without
  `activeBoardId.value`. The hotkey's `enabledWhen: activeBoardExists`
  therefore produces the *same observable behavior* (no dialog without an
  active board) via a different mechanism (dispatcher refuses to fire vs.
  button click landing on a no-op). This is a faithful behavioral match,
  not a narrowing — WITNESSED by reading both call sites.
- **Dispatcher-level gates (`anyModalOpen`, `workspaceLoadState`)**:
  WITNESSED in `useUserIORegistry.ts` — both checks are unconditional,
  ahead of any action's own `enabledWhen`, and this diff adds no bespoke
  gating code for `card.mint`; it inherits the same suppression as every
  other registry action.

## Catalog / KeybindingsView / i18n

- **WITNESSED**: `KNOWN_DOMAINS` extended `['nav', 'display', 'engine',
  'review'] → [..., 'card']`, the `grouped` computed's group map and the
  ADR-0002 unknown-domain throw both updated in the same change.
- **WITNESSED**: `en.json` gained `keybindings.action.cardMint.label`,
  `.description`, and `keybindings.section.card`. Checked whether
  `ja.json`/`ko.json`/`zh-CN.json` needed the same keys — they carry
  *zero* `keybindings.*` keys today (grep count: 0 each), so the existing
  convention is `fallbackLocale: 'en'` covering the whole keybindings
  surface, not per-key translation. This diff doesn't touch those files,
  consistent with that existing convention (not a new gap it introduces).

## Tests — property vs. proxy (ADR-0021)

- The two new unit-test files (`useMintDialogSignal.test.ts`, and the new
  case in `keybindings-catalog.test.ts`) test only the counter increment
  — a proxy for "the dialog opens," not the property itself. The builder
  discloses this explicitly rather than papering over it: "Not added: a
  mount-level Vitest test asserting `App.vue`'s `watch` actually calls
  `triggerMint()` — per `frontend/tests/CLAUDE.md`, component-level tests
  are out of scope at the current tier structure." WITNESSED: confirmed
  no `App.vue`-level component test exists anywhere in `tests/` (`find
  tests -iname '*App*'` returns nothing relevant), so this isn't a new
  hole cut for this change — it's consistent with the codebase's existing
  tier boundary.
- The property itself — pressing `k` actually opens `MintCardModal` via
  the real `triggerMint()` path — is instead witnessed live: the
  builder's playwright transcript shows `mint modal visible before
  hotkey: false` → `WITNESSED: mint hotkey opened MintCardModal`, keyed
  off `#mint-card-title` appearing in the DOM against a real served
  build, not a mocked/simulated counter. That's the property, not a
  symptom — read for the report, judged sufficient given the tier-1/live
  split this codebase already uses (the Task 2 `.`-hotkey transcript in
  the same report shows the identical dispatcher/predicate/mutation chain
  working end-to-end, corroborating the harness is a real exercise, not
  theater).
- Red-then-green: WITNESSED in the report — `git stash` of just the
  catalog wiring reproduced the expected failures (`"card.mint" missing
  from ids`, `expected undefined to be defined`), then green after
  restore.

## Gates — run independently in the worktree, not taken on the builder's word

- **Build** (`npm run build` = `vue-tsc -b && vite build`): WITNESSED,
  clean — `✓ 1094 modules transformed`, `✓ built in 1.65s`, only the
  pre-existing >500kB chunk-size advisory (unrelated).
- **ESLint** (`npx eslint .`): WITNESSED, clean — no output.
- **Tests** (`npm run test:run`): WITNESSED, clean —
  `Test Files  106 passed | 3 skipped (109)` / `Tests  1331 passed | 4
  skipped (1335)`. Matches the builder's reported tail exactly (same
  counts).

## FILES.md

- WITNESSED: `useMintDialogSignal.ts` entry added at `[B1]`, same band as
  `useModalKeyboard.ts`'s `anyModalOpen` — consistent classification
  (module-scoped cross-cutting UI signal, not board-domain logic).

## Findings requiring no action

None rise to REJECT. The one genuine gap — no component-level test
directly exercising `App.vue`'s watcher wiring — is disclosed by the
builder, consistent with the codebase's existing test-tier boundary (no
`App.vue` tests exist at all, before or after this change), and is closed
in practice by a live playwright run that witnesses the actual DOM effect
of the real keypress path, not a mocked substitute.
