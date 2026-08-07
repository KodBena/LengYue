# Dispatch report — swz-pv-mode-dropdown

Commission (ledger row 795, verbatim): "In the PV display, it cycles
between the possible modes, which is jarring, the user should select
them from a dropdown, not with two buttons."

Branch: `worktree-agent-ae4cda3853500e8ac`
Base sha before work: `3378806f` (dependabot-only ancestor, far behind
`next`; the wizard files this commission targets did not exist there)
Fast-forwarded to `next` at `fc206e0b` before starting — see "Deviation"
below.
Final sha: see `git log -1` at time of report; commit message
`fix(frontend): wizard PV-mode select, drop cycling buttons + auto-advance`.

## Deviation from the dispatch (surfaced, not silently resolved)

The dispatch named `frontend/src/components/wizard/steps/PvAnimationPreview.vue`
and `WizardStepPvAnimation.vue` as the surface. Neither existed on this
worktree's starting branch (`worktree-agent-ae4cda3853500e8ac`, an
ancestor of `next` predating the wizard feature — commits `ea3465be`
"feat(frontend): first-run setup wizard" etc. postdate it). `git
merge-base --is-ancestor <old-HEAD> next` confirmed old-HEAD is a
strict ancestor of `next` (164 commits behind), so `git merge --ff-only
next` was a clean fast-forward — no rebase, no conflict, no work lost.
This is recorded here as the deviation; the alternative (building the
wizard step from scratch on the stale base) would have duplicated
substantial already-shipped work and diverged from `next`'s actual
shape.

## Where the mode `<select>` lives, and why

WITNESSED: the mode `<select>` (`#wizard-pv-mode`) lives in the PARENT,
`WizardStepPvAnimation.vue`, alongside the existing annotation
`<select>` — not in `PvAnimationPreview.vue` (the animated leaf).

Reasoning, pinned by test (`tests/integration/WizardStepPvAnimation.test.ts`,
"render-isolation guard" describe block): `PvAnimationPreview.vue`'s
template reads `displayStones`, which changes on every staged
animation-reveal tick (`usePvAnimation`'s internal `setVisible` timers).
`WizardStepPvAnimation.vue`'s template reads only `mode` and
`annotation`, both written exclusively by a user picking a `<select>`
option — never by a timer. Had the mode `<select>` stayed in the leaf,
an animation tick would re-run the leaf's whole render function and
Vue's `<select>` value-sync would reset an open dropdown mid-interaction
(the model-select flicker class `EngineModelSelect.vue` was extracted
to fix). Placing it in the parent means an animation frame can never
reach the select's render at all — the parent doesn't even read
`displayStones`.

Acceptance question: "can an animation frame ever re-render the
select?" — WITNESSED no, via `mountWithRenderCount(WizardStepPvAnimation)`
driven through 6 staged `sequential`-mode reveal ticks (each firing a
production `setVisible` write inside the leaf's own `usePvAnimation`
instance): parent render count stays at 0 after the post-mount reset,
while a positive control (picking a new mode) raises it to ≥1,
confirming the counter is live and not simply dead.

The per-mode `.settings` description line (`wizard.pvAnimation.mode.*.settings`)
moved out with the select into the parent, for the same reason — it's
a plain `computed` read of `mode`, itself parent-local and user-driven.

## Changes

- `frontend/src/components/wizard/steps/PvAnimationPreview.vue` —
  removed the ‹/› `nav-btn` pair, `mode-switcher`/`mode-label` markup,
  `PV_MODES`/`goToMode`/`nextMode`/`prevMode`, the `AUTO_ADVANCE_MS`
  `setInterval` and its `onMounted`/timer-clear-on-unmount. `mode` is
  now a read-only `computed` (no setter) used solely to trigger
  `replay()` on change via the existing `watch([mode, pvMoves], ...)`.
  Template now renders only the animated stone-preview.
- `frontend/src/components/wizard/steps/WizardStepPvAnimation.vue` —
  added `PV_MODES`, a `mode` computed-setter (`get`/`set` +
  `touchSession()`, the same one-fact-one-home pattern `annotation`
  already used), a `<select id="wizard-pv-mode">` styled with the
  existing `.dark-select` class, and a `.mode-settings` description
  line for the selected mode. Header comment extended to record the
  placement decision.
- `frontend/src/locales/en.json` — added `wizard.pvAnimation.modeLabel`;
  reworded `wizard.step.pvAnimation.description` to stop referencing
  "cycle through the modes" (now "pick a mode below to preview it").
  No other locale (`zh-CN`/`ja`/`ko`) carries `pvAnimation.*` keys —
  they already fall back to `en`, so no other-locale edit was needed.
- `frontend/tests/integration/WizardStepPvAnimation.test.ts` (new) —
  7 tests across 3 describe blocks: no-auto-advance (2), dropdown
  writes the cell + restarts the animation (3), render-isolation guard
  (2, including the live-counter positive control).

No existing test referenced this step before this change (`grep -rl
PvAnimation tests/` was empty pre-edit) — the dispatch's "extend/adjust
the existing wizard PV tests" is UNEXERCISED as literally stated; the
new file is the pinning coverage in its place.

## Gate verdicts

- `npx vue-tsc --noEmit` — WITNESSED, exit 0.
- `npx vitest run --silent=true` (full suite, `NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, under `nice -n 19`) —
  WITNESSED, exit 0. 147 passed | 3 skipped test files; 1785 passed |
  4 skipped tests (including the new 7). No regressions in the
  pre-existing suite.
- `npx eslint` on the three touched source files — WITNESSED, 0
  errors (the new test file is excluded from lint by the project's
  own ignore pattern, matching the treatment of every other
  `tests/integration/*.test.ts` file).

## Not exercised / out of scope

- Live browser QA (`npm run dev` + manual click-through) — UNEXERCISED,
  not requested and no live-port access permitted by the standing
  hard constraints (never touch 4173/5173/5174/8764).
- `frontend/FILES.md` — no entries needed; no `src/` file was created,
  moved, or deleted, only edited in place.

License note: both touched `.vue` files already carried the Unlicense
header per ADR-0006; no header changes were needed.
