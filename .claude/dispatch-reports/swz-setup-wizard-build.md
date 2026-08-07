# swz-setup-wizard build report

**FALLBACK LOCATION NOTICE:** the harness refused a Write to the
shared-checkout path `/home/bork/w/omega/.claude/dispatch-reports/`
("Edit the worktree copy of this file instead of the shared-checkout
path" — worktree isolation is enforced on Write, not just Bash/git).
This report therefore lives at this worktree's own
`.claude/dispatch-reports/swz-setup-wizard-build.md`, per the fallback
instruction. The orchestrator will need to copy/merge it into the
shared location.

**Branch:** `worktree-agent-ad285a38fca6e3d97` (worktree at
`/home/bork/w/omega/.claude/worktrees/agent-ad285a38fca6e3d97`)
**Commits:**
- `6f3e4b1f` — `feat(frontend): engine WebSocket URI in the toolbar (toolbar-engine-uri)`,
  cherry-picked from `5a397133` on branch `worktree-agent-a9de02930700c7f98`
  (NOT yet merged to `next` — see "Base note" below).
- `b5c2c4a6` — `feat(frontend): first-run setup wizard (swz-setup-wizard)`,
  the wizard itself.

Base: merged `next` (tip `c4be39d9`, which already carries the demo
asset `frontend/src/assets/setup-wizard-demo.json`) before cherry-picking.

## Base note (read before merging)

This branch required `5a397133` (`toolbar-engine-uri`) as a
prerequisite for step (b) — the wizard reuses `useEngineUriEditor`
and `lib/ws-url.ts` verbatim. That branch is not yet merged to `next`.
I cherry-picked commit `5a397133` into this worktree (commit `6f3e4b1f`
here), resolving two textual conflicts in `frontend/FILES.md` (both
were pure interleaving of unrelated concurrent entries, not logical
conflicts — resolved by keeping both sets of entries). The orchestrator
will need to reconcile the eventual double-merge when both branches
land on `next`; the cherry-picked code is designed to be identical to
what will arrive from the other branch, so a merge (not cherry-pick)
of this branch onto a `next` that already has `5a397133` should produce
no additional conflict beyond the normal "already applied" no-op.

## Step-by-step design

1. **Trigger.** Investigated hydrate/first-run signals (`src/store/index.ts`,
   `sync-service.ts`). No existing "has run" flag existed. Added
   `profile.settings.onboarding: { completed: boolean }` (schema.ts),
   seeded `false` in `defaults.ts` (the actual trigger for a genuinely
   fresh profile — a never-persisted account's `GET /documents/...`
   returns `{data: {}}`, which `migrate({})` walks through as a no-op
   and `updateFromRemote` never overwrites `store.profile`, so the
   default stands). Migration 69 → 70 backfills `completed: true` for
   every blob that predates the wizard (moved 67→68 into
   `archived-migrations.ts` per the rolling-archive discipline;
   `CURRENT_SCHEMA_VERSION` is now 70). `App.vue` watches
   `store.workspaceLoadState.kind === 'loaded'` (`{immediate:true}`)
   and opens the wizard iff `!onboarding.completed`. Re-run entry
   point: `useSetupWizardSignal.ts` (module-scoped boolean, simpler
   than `useMintDialogSignal`'s counter since the wizard needs no
   async component-ref setup step) — wired from a new "Re-run setup
   wizard" button in `SettingsTab.vue`'s Session (UI) sub-tab. Re-run
   never resets `completed`.

2. **Steps (a–g), one leaf each under `src/components/wizard/steps/`:**
   - **(a) Theme** — `WizardStepTheme.vue`. Two cards, dark/cluster,
     identical visual weight, selection state derived purely from the
     live cell (never a component-local "recommended" default) —
     satisfies the commissioner's no-preselected-favorite ruling.
     Writes `profile.settings.appearance.theme`.
   - **(b) Engine URI** — `WizardStepEngineUri.vue`. Reuses
     `useEngineUriEditor` verbatim, forces `beginEdit()` on mount so
     the input is always-open (vs. the toolbar's click-to-edit).
   - **(c) Palette** — `WizardStepPalette.vue`. Same `<select>` shape
     as `AnalysisControls.vue`'s palette selector, same cell.
   - **(d) Demo board (centerpiece)** — `WizardStepDemoBoard.vue` +
     `useSetupWizardDemoBoard.ts` + `lib/setup-wizard-demo-loader.ts`.
     See "Demo hydration" below.
   - **(e) Move-suggestion filter** — folded into (d): it's
     `display.move-filter-threshold`, priority 0 (first) in the knob
     registry, so it's already the first of the five sliders. Said so
     in the step's own file header, per the commission's instruction.
   - **(f) PV-display animation** — `WizardStepPvAnimation.vue`. See
     "PV animation" below.
   - **(g) Optional SGF import** — `WizardStepSgfImport.vue`. Mounts
     the existing `LibraryImportPanel` + `useLibraryImport` verbatim
     (same `/library/games/import` wire) — no second import pipeline,
     no directory-picker reimplementation.
   - **Finish** — `WizardStepFinish.vue`, a read-only summary read
     straight from the live store cells.

3. **Orchestrator** — `SetupWizardModal.vue` (step indicator +
   Back/Skip/Next/Finish footer, `useModalKeyboard`-wired like every
   other modal) driven by `useSetupWizard.ts`'s step machine. Skip and
   Next are behaviourally identical by design — every step already
   writes a real, always-valid cell, so nothing gates progression;
   both are exposed for the ADR-0019 genre convention. Escape /
   backdrop-click / × all call `finish()` (not a bare close) —
   dismissing at any point still marks the profile onboarded, since
   this is a first-RUN wizard.

## Demo hydration (ADR-0002 / ADR-0010)

`lib/setup-wizard-demo-loader.ts` imports
`assets/setup-wizard-demo.json` directly (vite/`@vue/tsconfig` both
have `resolveJsonModule` on), runtime-validates its shape field by
field (`assertShape`, named-field failure messages), replays the
recorded 117-move KataGo-coordinate list through the **pure rules
engine** (`logic.ts::applyGoMove`/`applyPass`) via a new inverse-GTP
parser `engine/util.ts::fromGtp` (added alongside the existing
`toGtp`; throws loudly on an unrecognized/out-of-range coordinate),
producing a real `BoardState`. The captured analysis packet
(moveInfos/ownership/policy/rootInfo) is handed unmodified to
`state/analysis-ledger.ts::ledger.recordRaw`, keyed under
`deriveAnalysisKeys(compileAnalysisConfig(), compileEngineOverrides(),
store.engine.selectedModel ?? undefined)` — the EXACT computation
`state/analysis-config.ts::activeAnalysisKeys` uses live, so the demo
board seeds the SAME key the real `BoardWidget` reads (no second
analysis pipeline; a palette swap mid-wizard doesn't invalidate the
seed since the raw key doesn't depend on palette). The board is
rendered via the real `BoardWidget.vue` — never a forked mini-board.
Malformed-asset failure is loud: `assertShape` throws with a
named-field message; `useSetupWizardDemoBoard.ts` catches once at the
boundary, surfaces `loadError` (rendered as a visible error in the
step, not a blank board) and a `pushSystemMessage('error', ...)`.

## The five sliders (verified against the registry, not the commission's list)

Dispatched a research agent to read `store/defaults.ts`'s `knobs`
object directly. Ascending `priority` (the same order
`ToolbarSliderPopover.vue` renders):

| priority | KnobId | store cell |
|---|---|---|
| 0 | `display.move-filter-threshold` | `session.ui.moveFilterThreshold` |
| 10 | `display.ownership-opacity-ceiling` | `appearance.ownershipOpacityCeiling` |
| 20 | `display.ownership-deadband-threshold` | `appearance.ownershipDeadbandThreshold` |
| 30 | `display.liveness-threshold` | `appearance.livenessThreshold` |
| 40 | `display.hue-offset` | `appearance.intensityHueShift` |

This order differs from the commission text's listed order (which put
hue-offset third) — the registry is the source of truth and is what
ships. Rendered via the real `KnobSlider.vue` component (5×, one per
id), same widget `ToolbarSliderPopover.vue` uses.

## PV animation modes covered

`WizardStepPvAnimation.vue` cycles `session.ui.pvAnimation.mode`
through `instant` / `sequential` / `window` (prev/next buttons + a
4s `setInterval` auto-advance, production-only — never awaited in
tests) and separately exposes the `annotation` (numbering: off/from-1/
from-current) setting via a select. Each mode names its relevant
timing knob(s) in the description (`stepDelayMs` for sequential;
`windowDurationMs` + `fadeDurationMs` for window). All writes target
`session.ui.pvAnimation` directly — the same cell every real board
reads via `usePvAnimation`'s `getConfig`.

**Recorded scope decision** (in the file's own header, not just here):
the live preview drives its **own** `usePvAnimation()` instance against
the demo board's captured top-move PV, rendered as a simple fading
coordinate list — **not** a synthetic mouse-hover injected into
`MoveSuggestions.vue`'s real hover-driven trigger. Rejected: reusing
`MoveSuggestions` directly, because its PV reveal has no imperative
"start" entry point (hover-event-driven only), and faking
`mouseenter`/`mouseleave` on its internal elements would mean reaching
into a sibling component's private event wiring rather than composing
its public surface. The one real fact (the config cell) IS reused;
only the "watch it animate" render is step-local. A genuine hover on
the demo board's own suggestion markers (step d, `showMoveSuggestions`
on) exercises the SAME config through the real component too.

## What was cut

Nothing from the ratified step list (a)–(g) was cut. The one
documented, non-silent scope decision is the PV-preview rendering
choice above (a step-local preview widget instead of driving the real
`MoveSuggestions` hover machinery) — the underlying fact (the
`pvAnimation` config cell) is still fully shared, only the "watch it
animate" render surface is step-local.

## Per-claim evidentiary status

Every claim below is WITNESSED unless its own line says otherwise.

- **Cherry-pick applies cleanly (2 conflicts, both resolved,
  non-logical).** WITNESSED — `git cherry-pick 5a397133`, conflicts in
  `FILES.md` only, resolved, `git cherry-pick --continue` succeeded.
- **`onboarding.completed` defaults false on a fresh profile / true
  after migration 69→70.** WITNESSED — `tests/unit/store/migrations.test.ts`
  ("69 → 70" describe block, 5 assertions) + `tests/integration/useSetupWizard.test.ts`
  ("is false by default on a fresh profile").
- **Skip/rerun.** WITNESSED — `useSetupWizard.test.ts` ("skip() has the
  identical effect as next()", the rerun-does-not-reset-completion
  describe block) + `SetupWizardModal.test.ts` (mounted skip button).
- **One-fact-one-home per control.** WITNESSED for theme, palette, and
  the demo board's 3 checkboxes + slider-id-order, via mounted-component
  tests in `tests/integration/wizard-one-fact-one-home.test.ts` (writes
  observed on the real `store` singleton, not a mock). Engine-URI step
  reuses `useEngineUriEditor`, already covered by the pre-existing
  `tests/integration/useEngineUriEditor.test.ts` (not re-tested here to
  avoid duplicating that suite). PV-animation and SGF-import steps'
  same-cell/same-composable claims are WITNESSED only at the
  code-reuse level (they call the identical composable/component the
  real surfaces use) — no dedicated mount test was added for those two
  beyond the full-wizard navigation test in `SetupWizardModal.test.ts`.
- **Demo-board hydration from the asset, loud failure on malformed
  asset.** WITNESSED — `tests/unit/lib/setup-wizard-demo-loader.test.ts`
  (happy path against the real bundled asset + 5 malformed-shape cases,
  each asserting a thrown error naming the defect) and
  `tests/integration/useSetupWizardDemoBoard.test.ts` (ledger seeded
  under the live `activeAnalysisKeys`, and a mocked-loader failure path
  proving `loadError` + a system message surface instead of a silent
  blank board).
- **fromGtp/toGtp round-trip correctness.** WITNESSED — full 19×19
  round-trip + pass + out-of-range + skip-letter-I cases in
  `setup-wizard-demo-loader.test.ts`.
- **Wizard-done persistence / re-open doesn't reset it.** WITNESSED —
  `useSetupWizard.test.ts`'s "useSetupWizardSignal — rerun does not
  reset completion" describe block.
- **Escape/backdrop/× dismissal marks onboarded.** WITNESSED —
  `SetupWizardModal.test.ts`.
- **First-run App.vue wiring (`workspaceLoadState` watcher actually
  opens the modal in the real running app).** UNEXERCISED beyond code
  review — no test mounts the full `App.vue` (it's a very large
  component with broad transitive dependencies; the existing test
  suite doesn't mount it either, per `tests/CLAUDE.md`'s "component
  tests out of scope" default for anything beyond the render-count
  narrow exception). The trigger logic itself (the schema default +
  migration backfill) is fully witnessed; only the watcher's wiring
  into `App.vue`'s live DOM is unexercised by an automated test.
  Confirmed by code review: `store.workspaceLoadState.kind === 'loaded'`
  watcher with `{immediate:true}`, gated on `!onboarding.completed`,
  calling `openSetupWizard()`.
- **i18n.** WITNESSED structurally — every user-facing string in the
  new components routes through `$t(...)`/`i18n.global.t(...)`;
  `en.json` validated as well-formed JSON
  (`python3 -c "import json; json.load(...)"`). No literal braces
  needed escaping in the new strings (none of the added strings
  contain `{`/`}` outside interpolation placeholders).

## Gates (memory-capped, exit codes only)

- `npx vue-tsc -b` — exit 0, no output (clean).
- `npm run build` (`vue-tsc -b && vite build`) — exit 0, `✓ built in 6.31s`.
- `npx eslint .` — exit 0 (fixed 7 cast-hygiene errors during the pass:
  5 unjustified `as KnobId` casts in `WizardStepDemoBoard.vue`, 2 in
  `setup-wizard-demo-loader.ts` — each now carries an adjacent
  justification comment).
- `npm run test:run` (`NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`) — exit 0. **1748 passed | 4
  skipped (1752 total)**, 140 test files passed | 3 skipped, run twice
  for stability (same counts both times).

## Files touched

**New:**
- `frontend/src/lib/setup-wizard-demo-loader.ts`
- `frontend/src/composables/useSetupWizard.ts`
- `frontend/src/composables/useSetupWizardDemoBoard.ts`
- `frontend/src/composables/useSetupWizardSignal.ts`
- `frontend/src/components/wizard/SetupWizardModal.vue`
- `frontend/src/components/wizard/WizardStepIndicator.vue`
- `frontend/src/components/wizard/steps/WizardStepTheme.vue`
- `frontend/src/components/wizard/steps/WizardStepEngineUri.vue`
- `frontend/src/components/wizard/steps/WizardStepPalette.vue`
- `frontend/src/components/wizard/steps/WizardStepDemoBoard.vue`
- `frontend/src/components/wizard/steps/WizardStepPvAnimation.vue`
- `frontend/src/components/wizard/steps/WizardStepSgfImport.vue`
- `frontend/src/components/wizard/steps/WizardStepFinish.vue`
- `frontend/tests/unit/lib/setup-wizard-demo-loader.test.ts`
- `frontend/tests/integration/useSetupWizard.test.ts`
- `frontend/tests/integration/useSetupWizardDemoBoard.test.ts`
- `frontend/tests/integration/wizard-one-fact-one-home.test.ts`
- `frontend/tests/integration/SetupWizardModal.test.ts`

**Modified:**
- `frontend/src/store/schema.ts` — `AppSettings.onboarding: {completed: boolean}`.
- `frontend/src/store/defaults.ts` — seeds `onboarding.completed: false`.
- `frontend/src/store/migrations.ts` — `CURRENT_SCHEMA_VERSION` 69→70;
  new 69→70 migration; 67→68 rolled into the archive (rolling-archive
  discipline: exactly 2 active migrations).
- `frontend/src/store/archived-migrations.ts` — receives 67→68.
- `frontend/src/engine/util.ts` — new `fromGtp` (inverse of `toGtp`).
- `frontend/src/App.vue` — mounts `SetupWizardModal`; first-run watcher.
- `frontend/src/components/SettingsTab.vue` — "Re-run setup wizard" button.
- `frontend/src/locales/en.json` — `settings.button.rerunWizard` + the
  full `wizard.*` key set.
- `frontend/FILES.md` — all new files entered; `engine/util.ts`'s entry
  updated to name `fromGtp`.
- `frontend/tests/unit/store/migrations.test.ts` — 69→70 describe block.
