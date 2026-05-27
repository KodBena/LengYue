# Keybindings Phase 5 — Vitest coverage; arc closure

- **Status:** Branch `frontend/keybindings-phase5`; awaiting
  user sign-off before PR open.
- **Genre:** Test safety net. No runtime change; tests-only
  deliverable that closes the five-phase keybindings arc.
- **Date:** 2026-05-27.
- **Cross-references:**
  - `docs/notes/keybindings-plan.md` — the design note;
    transitions to `design-note: implemented` in this commit.
  - Phase 1–4 worklogs (`2026-05-27-keybindings-phase{1,2,2.1,3,4}-*.md`)
    — the arc this work closes.
  - `frontend/CLAUDE.md` §"Testing posture" + `tests/CLAUDE.md`
    — the three-tier shape this PR's tests slot into.

## What this lands

81 new tests across two Tier-1 unit files and one Tier-3
integration file. Three spy methods added to
`fakeAnalysisService`. `keybindings-plan.md` flips to
`design-note: implemented`. No production-code changes; the
build pipeline gains a stricter safety net but no behavioural
delta.

## Shape of the change

### Tier-1 (`tests/unit/lib/keybindings.test.ts`, 27 tests)

Pure-logic coverage for `src/lib/keybindings.ts`:

- `normalizeKey` — single-letter case folding; multi-char keys
  / space / digits / punctuation / empty string pass through
  unchanged.
- `effectiveKey` — default fallback when no override entry;
  override-with-string returns the override; override-with-null
  returns null (explicit unbind, distinct from absence);
  null-default + null-override interactions.
- `isActionEnabled` — all three `enabledWhen` cases against
  varied store states (always-true; active-board presence;
  engine-status transitions).
- `validateKeybindingsRegistry` smoke — the shipped registry
  passes without throwing.
- **`KEYBINDINGS_REGISTRY` ship-time invariants** — 12 actions
  matching the `ACTIONS` catalog size; unique ids; unique
  default keys; label/description keys conform to
  `keybindings.action.<id>.{label,description}`; every id is
  `<domain>.<verb>` with domain ∈ {nav, display, engine};
  `coalesced` dispatchMode reserved for nav actions, `immediate`
  for everything else. These pin the plan's structural
  invariants so adding an action that violates them fails the
  suite loudly.

### Tier-1 (`tests/unit/lib/keybindings-capture.test.ts`, 32 tests)

Pure-logic coverage for `src/lib/keybindings-capture.ts`:

- `RESERVED_KEYS` membership — Escape / Tab / Enter (the three
  load-bearing UX keys); four modifier-only keys; ContextMenu;
  F1–F12. Plus the negative: letters / digits / arrows / space
  are NOT reserved.
- `isReservedKey` shape — true for every `RESERVED_KEYS` member;
  false for non-members.
- `findActionByKey` — finds by default-key when no overrides;
  finds by override; default-key invisible after override;
  unbound action's default-key invisible; excludes-self
  (self-bind is not a conflict); normalizes (uppercase finds
  lowercase-bound action).
- Binding mutators — `setBinding` normalises uppercase letters
  on write, preserves multi-char keys, stores explicit null,
  overwrites prior overrides; `resetBinding` removes entry +
  no-op when absent + doesn't touch siblings; `resetAllBindings`
  clears all entries; `hasOverride` returns true for both
  key strings and explicit null, false after reset.
- `captureMode` lifecycle — starts null (post-reset); `startCapture`
  sets it; second `startCapture` replaces; `cancelCapture` clears;
  `cancelCapture` is idempotent.

### Tier-3 (`tests/integration/useUserIORegistry.test.ts`, 22 tests)

The dispatcher's behaviour, end-to-end against the real store,
real registry, real navigator, with `analysisService` replaced
by `fakeAnalysisService`.

Mount harness: a tiny `defineComponent` whose `setup` calls
`useUserIORegistry()` so the composable's `onMounted` listener
install + `onUnmounted` removal fire in their natural Vue
lifecycle. Each test mounts in `beforeEach`, unmounts in
`afterEach` — every test starts with a clean window-listener
slate.

Coverage groups:

- **Immediate dispatch** — synchronous side-effect on keydown;
  no `requestAnimationFrame` schedule; letter-case
  normalisation (uppercase `M` fires lowercase-`m` binding);
  per-action specificity (`n` flips `showStoneMoveNumbers`,
  not `showMoveSuggestions`).
- **Coalesced dispatch** — `requestAnimationFrame` IS scheduled
  on keydown; 5 rapid presses produce 5 `rAF` schedules + 4
  `cancelAnimationFrame` cancellations (verifying the cancel-
  and-reschedule rhythm that produces the 1-effective-dispatch-
  per-frame property the perf Fix #1 worklog established).
- **`enabledWhen` gating** — `engineConnected` action does NOT
  fire when disconnected (asserted via the
  `fakeAnalysisService.isPondering` spy); DOES fire when
  connected; `preventDefault` STILL fires for any registry-bound
  key even when its action is disabled (the SPA stays the key
  authority — the page doesn't scroll on space-when-disconnected);
  `activeBoardExists` action does NOT fire when `store.boards
  = []`.
- **Context guards** — `HTMLInputElement`, `HTMLTextAreaElement`,
  and contenteditable elements all skip dispatch. The
  contenteditable test patches `isContentEditable` via
  `Object.defineProperty` because jsdom's getter does not
  always reflect the attribute reliably; the dispatcher's
  production check is identical and the surface that triggers
  it in real browsers is CodeMirror's `.cm-content` div.
- **`captureMode` early-return (Phase 4)** — no action fires
  while `captureMode` is set; no `preventDefault` (the capturing
  row owns the event); dispatch resumes after `cancelCapture`.
- **`preventDefault`** — fires for registry-bound keys; does
  NOT fire for unbound keys (e.g., `z` with no override).
- **User overrides** — rebound key dispatches the action;
  the default key after override no longer triggers; explicit-
  null override blocks dispatch entirely (the action is
  unreachable from the keyboard).
- **Listener lifecycle** — after the harness component unmounts,
  the window listener is gone and no dispatch happens.

### `fakeAnalysisService` extension

Three new vi-spy methods added to
`tests/fakes/analysis-service.ts`: `isPondering` /
`stopPonderOnBoard` / `analyzeActiveNode`. The first is
re-armed in `resetFakeAnalysisService` to return `false` by
default (the post-reset state the keybindings ponderToggle
handler's "is it pondering?" check expects when starting fresh).

Per `tests/CLAUDE.md`'s fake-surface discipline, only what
test subjects in this tree exercise is added — nothing more.

### `docs/notes/keybindings-plan.md` status flip

`design-note: planning` → `design-note: implemented`. Body
amended with the transition date and the per-phase ship
record (Phase 1 substrate; Phase 2 dispatcher rewrite + Phase
2.1 micro-opts arising from the near-threshold-jitter
investigation that became ADR-0009's substrate; Phase 3 sub-
tab restructure + read-only view; Phase 4 editor; Phase 5
tests). Deferred items (modifier support, chord bindings,
mouse-binding overrides, mousewheel-action audit) remain as
originally named — those are separate arcs.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — **746 pass / 3 skipped** (was 665 / 3
  pre-Phase-5; +81 new). Per-file:
  - `tests/unit/lib/keybindings.test.ts` — 27 pass.
  - `tests/unit/lib/keybindings-capture.test.ts` — 32 pass.
  - `tests/integration/useUserIORegistry.test.ts` — 22 pass.

No user-side validation needed — tests-only deliverable.

## What follows

The keybindings arc is complete. The plan note's deferred
items remain available as their own arcs when triggered:

- **Modifier support** (`Ctrl+K`-style bindings). Requires
  extending `defaultKey: string` → `KeySpec = { key: string;
  modifiers?: ReadonlyArray<'Ctrl' | 'Shift' | 'Alt' | 'Meta'> }`,
  matching capture flow + persistence shape. Plan note's
  "Modifier support — deferred" section documents the
  forward-compat substrate.
- **Chord bindings** (`Ctrl+K Ctrl+S`-style sequences).
  Dispatcher grows a state machine; storage absorbs sequences.
  Plan note's "Chord bindings — deferred" section.
- **Mouse-binding overrides** (the modifier-click /
  middle-click patterns for library new-tab and PV-paste).
  Their own substrate question; not folded into the keyboard
  registry.
- **Mousewheel-action audit** — whether the mousewheel-as-nav
  invocation of `nav.next` / `nav.prev` (via `useScopedScroll`
  on `TreeWidget`) should fold into the registry's dispatch.
  Plan note's "Considered but deferred — mousewheel /
  multi-modality" section sketches the design space.

Sibling TODO entry surfaced during the arc:
`docs/TODO.md`'s Small-tier "`ForestDirectory` Decks/Browse
strip → nested `<TabWidget>`" (PR #287's commit `d02b9cc`).
Unrelated to keybindings; rides any future `ForestDirectory`
work.

License: Public Domain (The Unlicense)
