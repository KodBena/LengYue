# Advanced Registry — collapsible headings, 2026-08-06

## Commission (maintainer's wiki line, verbatim)

> Advanced registry collapsible headings; and, always collapse 'knobs' and
> 'analysis env' by default since they're almost never used.

## Survey

- `frontend/src/components/KnobRegistryEditor.vue` — a **different** knob
  view (domain-grouped scalar-knob sliders, mounted in App.vue's "Other"
  tab via `ToolbarSliderPopover`/App.vue directly). It is NOT the Advanced
  Registry surface; surveyed for orientation only, left untouched.
- The Advanced Registry sub-tab (`frontend/src/components/SettingsTab.vue`,
  `#advancedRegistry`) mounts `RegistryEditor.vue` with
  `store.profile.settings` as root. `RegistryEditor.vue` recurses over
  object branches, rendering one heading per branch key (`branch-header` /
  `branch-label`) — this is the actual "top-level headings/groups" surface
  the wiki line targets. `knobs` is a direct top-level branch of
  `store.profile.settings`; `analysis_env` is nested at
  `engine.katago.analysis_env` (it also has its own dedicated "Analysis
  Environment" sub-tab via `PaletteEditor.vue`, which this change does not
  touch — the raw registry view of that same subtree is the "almost never
  used" one).
- `frontend/src/assets/css/shared-chrome.css` already carries a disclosure
  idiom, `.settings-section` (native `<details>`/`<summary>`, custom
  chevron rotating on `[open]`) — built for the Settings tab's own
  accordion sections (retired 2026-06-12 when they were flattened into
  sub-tabs; the CSS was left in place, unused until now). Reused verbatim
  per ADR-0019 (standard disclosure triangle, no invented affordance).

## Implementation

- `frontend/src/lib/utils.ts`: added `isRegistryGroupDefaultCollapsed(key)`
  — pure predicate, `true` for `'knobs'` / `'analysis_env'`, `false`
  otherwise.
- `frontend/src/components/editors/RegistryEditor.vue`: the branch row
  (object recursion) is now a `<details class="registry-branch
  settings-section">` / `<summary class="branch-header">` pair instead of
  a plain `<div>`. `:open="isInitiallyOpen(key)"` is an **uncontrolled**
  initial value (the bound expression is a pure function of `key`, so Vue
  never re-patches it against a changed value, and the user's own
  click-to-toggle is never fought). This is deliberately *not* persisted:
  the maintainer's "always collapse … by default" reads as
  default-collapsed on every fresh render, not persisted-expanded state.
  There is no existing persisted-disclosure precedent in this codebase to
  diverge from (the Settings tab's own prior `<details>` accordion,
  referenced in `SettingsTab.vue`'s header comment, wasn't persisted
  either) — noted here per the build brief's instruction to flag any such
  divergence.
- The restore/delete buttons inside the branch header now sit inside
  `<summary>`; both got `@click.stop` since a native `<summary>` click
  target toggles the disclosure — without `.stop` a restore/delete click
  would also flip the section open/closed.
- Keyboard (C17): `<summary>` is natively focusable and toggles on
  Enter/Space in every evergreen browser — no custom ARIA/keyboard wiring
  needed; this is exactly why the native-`<details>` idiom was reused
  rather than a hand-rolled disclosure button.
- Leaf rows (scalar/expression/enum/etc.) are unchanged — only object
  branches (headings/groups) gained the disclosure.

## Tests

Per `tests/CLAUDE.md`'s tier structure, component/template tests are out
of scope in this codebase (Tier 3 is narrowly reserved for render-count
regression guards); there is no prior-art component test for
`RegistryEditor.vue` or `KnobRegistryEditor.vue` to follow. Added Tier-1
pure-logic coverage instead:

- `frontend/tests/unit/lib/utils.test.ts` — `isRegistryGroupDefaultCollapsed`:
  WITNESSED — collapses `'knobs'` and `'analysis_env'`; leaves
  `engine`/`appearance`/`persistence`/`minting`/`navigation`/`katago`/
  `overrideSettings` expanded; not fooled by a case or substring near-miss
  (`'Knobs'`, `'analysisEnv'`, `'analysis_env_extra'`).
- The actual `<details :open>` render wiring in `RegistryEditor.vue` is
  **UNEXERCISED** by this suite (no component-test harness exists here to
  drive it) — the pure predicate it reads is the only piece under test.

## Gates (all WITNESSED, run from `frontend/`)

- `npm run test:run` — 81 passed | 3 skipped test files, 1105 passed | 4
  skipped tests. Exited cleanly (0).
- `npx eslint .` — clean, no errors/warnings. Exited cleanly (0).
- `npm run build` (`vue-tsc -b && vite build`) — typechecked and built
  cleanly. Exited cleanly (0).

Note: `node_modules` was not present in this worktree at task start (fresh
`.claude/worktrees/` checkout); `npm install` was run first
(`vite@8.2.0` resolved — above the `≥8.0.12` version flagged in prior
session memory as hanging vitest teardown, but `npx vitest run` and
`npm run test:run` both exited cleanly here, so that issue did not
reproduce in this environment/run).

## Files touched

- `frontend/src/lib/utils.ts`
- `frontend/src/components/editors/RegistryEditor.vue`
- `frontend/tests/unit/lib/utils.test.ts`
- `.claude/dispatch-reports/registry-collapsibles-build.md` (this file)
