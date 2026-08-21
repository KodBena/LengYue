# wiki2-wizard-i18n — build report (frontend half)

Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a4477cfc2e25a1e63`
Branch: `worktree-agent-a4477cfc2e25a1e63`
Base at start: `HEAD` (`3378806f`) was **stale** — it did not contain
origin/next's wizard-arc work at all (a dependabot-only lineage).
Rebased onto `origin/next` (`c8851986`, current tip) before any other
work; `git merge-base --is-ancestor` confirmed `c8851986` is now an
ancestor of the working branch.

Commissioner's wiki text (verbatim): "The setup wizard needs an i18n
option (should be the first step), and for tauri/docker, this should
additionally be initialized from the relevant LC_* env vars."

**Scope actually delivered**: the SPA half only — a language/locale
selection step as the FIRST step of `useSetupWizard.ts`'s
`WIZARD_STEPS`, wired to the app's existing i18n locale mechanism. The
LC_* env-var initialization for tauri/docker is a separate,
packaging-side dispatch, explicitly out of this session's scope by
commission — not narrowed further here.

## What shipped

- `frontend/src/components/wizard/steps/WizardStepLocale.vue` (new).
  Flag + native-name option cards over `useLocale()` — the SAME
  composable `LocalePicker.vue` already reads/writes
  (`profile.settings.appearance.locale`, via the profile-owner-routed
  `setLocale`). Unlike `WizardStepTheme.vue`'s anti-imposition design
  (nothing pre-highlighted), the currently active locale IS shown
  pre-selected here — a UI has no neutral "no language" state, the
  wizard is already rendering in some locale the instant it opens.
- `frontend/src/composables/useSetupWizard.ts` — `'locale'` prepended
  to `WIZARD_STEPS` (now first).
- `frontend/src/components/wizard/SetupWizardModal.vue` — new step
  wired into `STEP_COMPONENTS`.
- `frontend/src/locales/en.json` — two new keys, hand-edited
  preserving the file's column-43 byte-alignment convention (verified
  against the existing `wizard.step.theme.title` row before editing;
  never touched with JSON tooling): `wizard.step.locale.title`,
  `wizard.step.locale.description`. Per existing precedent in this
  same catalog (48/87 `wizard.*` keys already lack CJK counterparts,
  falling back through `fallbackLocale: 'en'`), the CJK catalogs were
  **not** touched — adding unreviewed machine translations for a new
  key isn't this session's call to make, and the existing fallback
  behaviour already covers the gap honestly (no silent English text
  posing as a native string; vue-i18n's `missingWarn`/`fallbackWarn`
  stay loud about it in dev).
- `frontend/FILES.md` — new entry for `WizardStepLocale.vue`, placed
  first in the `steps/` list.
- `FEATURES.md` — one clause added to the existing
  "Internationalisation" bullet under Workspace and chrome, naming the
  wizard's new first step.
- Test updates for the index shift (`locale` is now index 0, every
  other step +1): `tests/integration/useSetupWizard.test.ts`,
  `tests/integration/SetupWizardModal.test.ts`,
  `tests/integration/wizard-prose-measure.test.ts` (added the
  `locale: 1` row to `EXPECTED_CAPPED_COUNT_BY_STEP`, a
  `Record<WizardStepId, number>` that TypeScript requires a full key
  set for — this would have failed to typecheck if skipped).
- New test file: `frontend/tests/integration/WizardStepLocale.test.ts`.

## The packaging seam (for the LC_* dispatch)

`WizardStepLocale.vue` never reads an env var and never special-cases
a deployment target — it reads only the existing
`profile.settings.appearance.locale` cell through `useLocale()`,
exactly like every other consumer of that cell. A future
packaging-side pre-seed (writing an LC_*-derived locale into that same
cell, or into the fresh-profile default it seeds from, before the
wizard's first render) makes this step's pre-selected default reflect
it automatically. No rework needed here — the step never held a
second copy of "which locale" to begin with. Documented in the
component's own header comment and in the `FILES.md` entry so it's
discoverable from either side of the dispatch boundary.

## Per-claim status

- **The new step appears first** — WITNESSED. `WIZARD_STEPS[0] ===
  'locale'` (unit assertion); `SetupWizardModal` opens on the locale
  step at mount (title + `SUPPORTED_LOCALES.length` option cards on
  screen with no navigation). Covered in
  `WizardStepLocale.test.ts` and the updated `useSetupWizard.test.ts`.

- **Locale choice applies reactively, wizard-locally** — WITNESSED.
  Clicking an option card synchronously (i) writes
  `store.profile.settings.appearance.locale` and (ii) moves the
  `.is-selected` DOM marker to the clicked card, both inside the
  mounted wizard, with no `nextTick` needed beyond `trigger()`'s own
  microtask flush. Verified standalone (`WizardStepLocale` mounted in
  isolation) and through the full `SetupWizardModal` shell.

- **Persists the way the app's locale setting already persists** —
  WITNESSED. The step calls `useLocale().setLocale()` — the identical
  setter `LocalePicker.vue` calls, writing through the same
  `mutateProfile`-routed cell. No second store cell, no shadow state.

- **"the rest of the wizard renders in the chosen locale" (full
  i18n-catalog propagation to `i18n.global.locale` and every `$t()`
  call in the tree)** — UNEXERCISED at the tier tested here, disclosed
  honestly rather than papered over. That propagation is driven by
  `useAppBootstrap.ts`'s pre-existing `immediate: true` watch, which
  mirrors the same cell onto `i18n.global.locale` — infrastructure
  this change reuses but does not modify, and which only runs when
  `App.vue`'s full tree (including auth/backend wiring) is mounted.
  `SetupWizardModal` alone, as exercised by every wizard test in this
  tree (including the pre-existing `SetupWizardModal.test.ts` and
  `SetupWizardModal-scroll-contract.test.ts`), never mounts
  `useAppBootstrap`. Extracting that watch into a directly-testable
  named export (the pattern this same file already uses for
  `installKnownPositionsHydrateWatcher`, specifically because *that*
  watch's edge-detection logic was judged worth guarding against
  hand-copy drift) would have meant editing a file outside "the setup
  wizard sources" the commission named, for a one-line `immediate`
  watch whose correctness isn't actually in question — judged
  out-of-proportion for this session's scope rather than silently
  skipped. Flagging it here per ADR-0002's "surface the gap, don't
  bluff the citation."

- **Scroll-contract test covers the new step** — WITNESSED.
  `SetupWizardModal-scroll-contract.test.ts` iterates
  `WIZARD_STEPS` directly (no hardcoded list), so it picked up
  `"locale"` automatically — confirmed by running it directly: the
  per-step describe block now emits a `step "locale": …` case
  alongside the other six, all green. No edit to that test file was
  needed or made (exactly the point of the mechanism it documents).

## Design-law compliance (self-check on the new file)

- All readable text `var(--text-0)` — description, locale names, the
  selected check-mark (`--accent-primary`, a semantic accent on a
  selection marker, not a de-emphasised readable string).
- No `box-shadow` / `transition` / `blur` anywhere in the new file.
- No transparent overlays.
- Surface/border category correctness: `--surface-0` background (row
  681/742 precedent, matching `WizardStepTheme.vue`'s own card),
  `--border-2` default / `--accent-primary` selected border — same
  pattern as the theme step's cards.
- 24px pointer-target floor: `.locale-card { min-height: 24px; }` plus
  padding.
- No ellipsized names: `.locale-name` has no `overflow`/`white-space:
  nowrap`/`text-overflow` — the four current display names are short,
  but the rule isn't relied on staying that way by accident.

## Scope-narrowing disclosure

None beyond what the commission itself already disclosed and split
(LC_* packaging half, separately dispatched). No further narrowing was
found necessary during the build — this is a STOP-and-report item by
the brief's own rule, and there was nothing to report here.

## Stop-and-report items

None. No further scope narrowing was required; no missing context
blocked the work; the one deliberately-out-of-scope call (not
extracting `useAppBootstrap.ts`'s locale-mirror watch for direct
testing) is disclosed above as an honest coverage boundary, not a
silent gap.

## Gates

- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` — **exit
  0**. 234 test files passed, 3 skipped (pre-existing skips,
  unrelated to this change); 2909 tests passed, 4 skipped.
- `nice -n 19 npx vue-tsc --noEmit` — **exit 0**, no errors.
- (Not one of the two named gates, but run for extra confidence since
  CI also gates on it): `npx eslint` over every new/changed source
  file — 0 errors, 0 warnings (the 4 warnings seen were the linter's
  own "test files are ignore-listed" notice, not findings).

`node_modules` did not exist in this worktree at session start (a
fresh worktree checkout); `npm install` was run before either gate —
noted since a clean worktree without it would fail both gates for an
unrelated reason (no `vitest`/`vue-tsc` binary), not because of this
change.

## Commit

Not yet committed as of this report — see the final chat message for
the resulting SHA once committed (not pushed, per instructions).
