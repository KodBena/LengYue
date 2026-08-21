# D2 fix — system log manual open/close affordance (build report)

Slug: `lyt-d2-log-toggle`. Worktree:
`/home/bork/w/omega/.claude/worktrees/agent-ac74bb0424f84757b`. Branch:
`worktree-agent-ac74bb0424f84757b`.

Driven by `.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2
(read end to end before authoring this fix): the W1 skeleton
replacement lost the system log's manual open/close affordance — only
the transient auto-reveal-on-error (`useTransientLogReveal.ts`, a
SEPARATE ref) survived. Pre-rework, a toggle wrote
`session.ui.systemLogExpanded` (the field itself untouched, per the
W4 build report's own disclosure that only WHERE the panel renders
moved, not the field's read semantics). Reclassified REWORK-CAUSED, so
this is a defect fix, not new scope.

## Base freshness

- First act: fetched `origin`, verified local `lyt-phase2` at
  `d5bc4d21` (meets the required minimum — it IS the minimum named in
  the commission). HEAD (`worktree-agent-ac74bb0424f84757b`) was
  already exactly `d5bc4d21` with no prior commits; `git rebase
  lyt-phase2` was a no-op fast-forward.
- Last act (re-run immediately before filing this report, see below):
  re-fetched; confirmed `lyt-phase2` had not moved since the first
  act.

## What was read end to end before authoring

`.claude/dispatch-reports/lyt-w5-parity-build.md` (the whole file,
specifically Defect D2's full context plus the surrounding parity
table and the W4/W5 residual notes it cites), the umbrella `CLAUDE.md`
and `frontend/CLAUDE.md` and `frontend/tests/CLAUDE.md` (all three, in
full, via the session's system context), `App.vue`'s relevant sections
(`#lyt-overlay-stack`, `#lyt-corner-chrome`, and their surrounding
comments), `useTransientLogReveal.ts` (full file), `LytPresenceMenu.vue`
+ `useLytPresenceMenu.ts` (full files — the placement-decision
comparator), `DebugMenu.vue` (full file — the other placement
comparator), `SystemLogPanel.vue`, `store/defaults.ts` /
`store/schema.ts` (the `systemLogExpanded` field's shape), and
`tests/unit/lyt-w4-chrome.test.ts` / `tests/integration/
useLytPresenceMenu.test.ts` (the test-shape precedents mirrored below).

## Placement decision

**A standalone `SystemLogToggle.vue`**, mounted in `#lyt-corner-chrome`
alongside `DebugMenu`/`BoardRailPopoverTrigger`/`LytPresenceMenu` —
not folded into either neighbor:

- **Not `LytPresenceMenu`'s popover.** That popover's three checkbox
  targets (`boardRail`/`previewBoard`/`controlPanel`) are specifically
  LYT grid-presence toggles under a shared "at least one must stay
  visible" guard (`useLytPresenceMenu.ts`'s own header). The system
  log isn't a grid leaf at all — it lives in the overlay stratum
  (W4 item 1, contributes zero layout) — and has no such guard;
  folding it in would either dilute that guard's accounting or need a
  carve-out neither of which the log's own semantics call for.
- **Not `DebugMenu`.** That menu's entire root is gated on
  `import.meta.env.DEV` — it never renders in a production build. The
  system log toggle needs to be an ordinary user-facing affordance
  (the pre-existing auto-reveal already proves normal users see this
  panel), not a developer-only diagnostic.
- **Register chosen**: a quiet 28px icon-button square, matching
  `LytPresenceMenu.vue`'s own trigger (the closest sibling in the
  cluster for "one-shot corner affordance"), not `DebugMenu`'s wider
  DEBUG-style pill. Clears the 24×24 WCAG 2.5.8 pointer-target floor
  (M16 discipline) with margin.

## Wiring

- `useSystemLogToggle.ts` (new, `src/composables/chrome/`): thin
  `expanded` computed + `toggle()` that flips
  `store.session.ui.systemLogExpanded` and calls `touchSession()` —
  the same write shape every other chrome toggle in this codebase
  uses (mirrors `useLytPresenceMenu.ts`'s `toggle()`/`setRailStyle()`
  pattern, minus the guard logic, which doesn't apply here).
- `SystemLogToggle.vue` (new, `src/components/chrome/`): the button,
  `aria-pressed` bound to `expanded`, click calls `toggle()`.
- `App.vue`: imports and mounts `<SystemLogToggle />` in
  `#lyt-corner-chrome`. **No change to the overlay's own `v-if` gate**
  — `SystemLogPanel v-if="store.session.ui.systemLogExpanded ||
  transientLogReveal"` was already exactly the right composition (W4's
  own disclosure that the field's read semantics never moved); this
  fix only restores the missing WRITE side. Pinned by a regression
  test (below) so a future edit can't silently narrow it back to a
  single condition.
- `SystemLogPanel.vue`: its own header comment corrected — it claimed
  "Always-visible system log bar", which was already stale after the
  W4 overlay-stratum move and became actively misleading once this fix
  restores collapse-by-default-again behavior. Fixed alongside since
  it's the direct documentation of the exact bug this dispatch closes
  (not scope creep — the same file, the same fact).

## Documentation

- **`FEATURES.md`** — the "System log" bullet (W5 wrote it describing
  the gap honestly: "No manual open/close control ships today...") is
  rewritten to describe the restored capability: a toggle next to the
  corner presence menu, persists across sessions, auto-reveal still
  works independently.
- **`frontend/FILES.md`** — new entries for `SystemLogToggle.vue` and
  `useSystemLogToggle.ts`; `SystemLogPanel.vue`'s entry corrected to
  match its own header fix (was "Always-visible... with idle row",
  now describes the actual v-if composition).
- **i18n** — `systemLog.toggleButton` added to all four catalogs
  (en/ja/ko/zh-CN — the existing `systemLog.*` namespace is fully
  translated in all four, so this key follows that precedent rather
  than the dev-only `toolbar.popoverStress.*` exemption).
- **Work-status store** — not touched this pass; D2 is tracked via the
  W5 build report's own defect record and this dispatch's own build
  report, not a `todo` DB row this session has the connection facts
  to open independently. Flagged for the commissioner's own
  status-transition pass.
- **Doc-graph** — content-only (no doc added/removed/renamed/
  re-cross-referenced; `FEATURES.md`/`FILES.md` entries edited in
  place). Per the umbrella `CLAUDE.md`'s own rule, regeneration is not
  required this pass; not run.
- **ADR-0006 headers** — all new files (`SystemLogToggle.vue`,
  `useSystemLogToggle.ts`, both test files, the probe script) carry
  the standard pathname + purpose + license header. Existing files
  touched (`App.vue`, `SystemLogPanel.vue`) already had headers;
  edits were surgical.

## Tests

- **`tests/integration/useSystemLogToggle.test.ts`** (new, Tier 3,
  mirrors `useLytPresenceMenu.test.ts`'s shape): default state,
  toggle round-trip both directions, `sessionVersion` bump per toggle
  (the `touchSession()` coverage the commission named explicitly), and
  that `expanded` tracks an external store write (not just this
  handle's own `toggle()`).
- **`tests/unit/lyt-d2-system-log-toggle.test.ts`** (new, Tier 1,
  source-text, mirrors `lyt-w4-chrome.test.ts`'s shape): `App.vue`
  imports and mounts `<SystemLogToggle />` inside `#lyt-corner-chrome`
  alongside its siblings; the overlay's `v-if` gate string is pinned
  byte-for-byte (`store.session.ui.systemLogExpanded ||
  transientLogReveal`) so a future edit can't silently narrow it;
  the button clears the 24×24 pointer-target floor; `aria-pressed`
  and the click handler are wired; the composable's write shape
  (`= !store.session.ui.systemLogExpanded` + `touchSession();`) is
  pinned.
- **`.claude/dispatch-reports/lyt-d2-fix-probe.mjs`** (new, live
  Playwright probe — see below).

## Probe isolation (executed personally, this pass)

Dev server: `VITE_API_BASE_URL=http://127.0.0.1:19401
VITE_KATAGO_WS_URL=ws://127.0.0.1:19402 npx vite --port 19400
--strictPort` — three fresh dead scratch ports (confirmed nothing
listening beforehand via `ss -ltn`; the world's own standing port
19100 deliberately avoided).

The probe verifies the RESTORED affordance itself by clicking the
real `#system-log-toggle-btn` (not by poking the store directly, which
the W5 audit already confirmed was sufficient to prove the field
survives — this fix's own job is the missing write path). One
methodology note discovered while building it: under dead-port
isolation, the app's own bootstrap sequence (auto-login, positions/
stats fetches) hits the unreachable backend and pushes several
error-level `SystemMessage`s within ~1s of load, which the
PRE-EXISTING (unmodified by this fix) `useTransientLogReveal`
composable correctly auto-reveals for 8s (`TRANSIENT_LOG_REVEAL_MS`).
The probe waits that startup transient out before asserting the
"collapsed at rest" precondition, so it measures the manual toggle's
own resting state rather than a startup artifact — not a defect, and
not something this fix's own auto-reveal-unaffected requirement
argues against (that requirement is separately, explicitly re-checked
in section F by injecting a fresh synthetic error mid-run).

```
PASS  fresh profile: systemLogExpanded defaults to false
PASS  system log panel absent when collapsed and no transient reveal
PASS  manual toggle button (#system-log-toggle-btn) is present in corner chrome
PASS  clicking the toggle opens the system log panel
PASS  systemLogExpanded is written true by the click (not just a local ref)
PASS  button reflects aria-pressed="true" once expanded
PASS  system log overlay never occludes the board while manually expanded
PASS  clicking the toggle again closes the system log panel
PASS  systemLogExpanded is written back to false by the second click
PASS  button reflects aria-pressed="false" once collapsed again
INFO  window.sessionVersion not exposed for direct read — skipping direct-counter check (covered by tests/integration/useSystemLogToggle.test.ts instead)
PASS  precondition: manual toggle is off before the auto-reveal check
PASS  an error arrival auto-reveals the panel even though the manual toggle is off
PASS  auto-reveal does NOT write systemLogExpanded (stays a separate transient ref)
PASS  toggle button stays aria-pressed="false" during a transient (non-manual) reveal
PASS  PROBE ISOLATION: no request ever targeted a live backend/engine/dev port

ALL CHECKS PASSED
```

`window.sessionVersion` isn't exposed to the console debug surface
(only `window.store`, per `main.ts`'s DEV-only gate) — the direct
counter-bump assertion the commission asked for ("toggle round-trip
incl. touchSession coverage") is covered by the integration test
instead, which reads `sessionVersion` directly as an imported module
value; the probe's own section E degrades to an INFO line rather than
silently skipping without saying so.

Note on running the probe: `playwright-core` resolves from
`frontend/node_modules` (ESM resolution walks up from the script's own
directory, not `cwd`); a temporary `node_modules` symlink was created
in `.claude/dispatch-reports/` for the run and removed immediately
after (not committed — confirmed via `git status` showing no such
entry).

## Gates (foreground, literal exit codes)

| Gate | Command | Exit code |
|---|---|---|
| Full vitest | `npx vitest run` | `0` (242 files / 3044 tests passed, 8 skipped) |
| vue-tsc | `npx vue-tsc -b --noEmit` | `0` |
| build | `npm run build` (`vue-tsc -b && vite build`) | `0` |

All three run to completion in the foreground, no pipes, first
attempt.

## Files touched

- `frontend/src/composables/chrome/useSystemLogToggle.ts` (new)
- `frontend/src/components/chrome/SystemLogToggle.vue` (new)
- `frontend/src/App.vue` (import + mount + corner-chrome comment)
- `frontend/src/components/chrome/SystemLogPanel.vue` (header
  comment correction)
- `frontend/src/locales/{en,ja,ko,zh-CN}.json` (`systemLog.toggleButton`)
- `frontend/FILES.md` (`SystemLogToggle.vue`, `useSystemLogToggle.ts`
  entries; `SystemLogPanel.vue` entry corrected)
- `FEATURES.md` ("System log" bullet rewritten)
- `frontend/tests/integration/useSystemLogToggle.test.ts` (new)
- `frontend/tests/unit/lyt-d2-system-log-toggle.test.ts` (new)
- `.claude/dispatch-reports/lyt-d2-fix-probe.mjs` (new)

## Scope discipline

Exactly the D2 defect: the manual affordance, its wiring, its tests,
and the doc corrections it directly implies (`FEATURES.md`,
`FILES.md`, the `SystemLogPanel.vue` header). Nothing else in the
tree touched. D1 (`LearnPathModal.vue` Escape/`role="dialog"` gap,
also named in the W5 audit) is explicitly out of this dispatch's
scope and untouched.
