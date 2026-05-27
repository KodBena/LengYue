# Keybindings Phase 2 — dispatcher rewrite

- **Status:** Branch `frontend/keybindings-phase2-dispatcher`;
  awaiting user end-to-end test before PR open.
- **Genre:** Composable rewrite. Single-file change in
  `src/composables/useUserIORegistry.ts`. Behaviour-equivalent
  to Phase 1's hardcoded dispatcher; the registry is now the
  source of truth.
- **Date:** 2026-05-27.
- **Cross-references:**
  - `docs/notes/keybindings-plan.md` Phase 2 — this commit's
    deliverable.
  - `docs/worklog/2026-05-27-keybindings-phase1-substrate.md`
    — Phase 1 landed the registry; this commit makes the
    dispatcher consume it.

## Shape of the change

The composable shrinks from a 212-line hardcoded switch +
state to a 132-line registry-driven dispatcher. Behaviorally
equivalent: same keys fire the same actions in the same
dispatch modes.

### What goes away

- The hardcoded `HANDLED_KEYS` Set (was 16-key enumeration).
- The hardcoded `COALESCED_NAV_KEYS` Set (was 6-key
  enumeration of the rAF-coalesce subset).
- The `runAction(key)` switch (was 12 case statements with
  inline handlers, including the duplicate-case pattern for
  upper/lowercase letters).
- The global `if (!activeBoard.value) return` early-return.

### What replaces them

- `keyToAction = computed(...)` over `KEYBINDINGS_REGISTRY`:
  iterates the registry, resolves `effectiveKey(action, overrides)`
  for each, normalises letter keys to lowercase, and stores in
  a `Map<string, KeybindingActionDecl>`. First-wins on conflict
  (the `validateKeybindingsRegistry` call from
  `useAppBootstrap` already rejects default-key conflicts at
  ship time).
- Per-action `dispatchMode` decides immediate-vs-coalesced
  firing (replaces `COALESCED_NAV_KEYS.has(e.key)` check).
- Per-action `isActionEnabled(action)` gates dispatch
  (replaces the global `if (!activeBoard.value) return`).

### Letter-key normalisation

Letter keys (A–Z / a–z) lowercase at both registration AND
lookup: a registry `defaultKey: 'm'` matches both
`event.key === 'm'` (no shift) AND `event.key === 'M'` (shift
held). The prior dispatcher handled this with explicit
duplicate cases (`case 'm': case 'M': ...`); the new
dispatcher centralises in a single `normalizeKey` helper.

Non-letter keys (Arrow*, Home, End, Space) pass through
unchanged.

### preventDefault timing

Fires for any registry-bound key BEFORE the `isActionEnabled`
check — so the SPA stays the authority over claimed keys even
when an action's `enabledWhen` currently returns false. Worked
example: Space when the engine is disconnected. The action
exists in the registry (engine.ponderToggle), so the key is
"claimed"; `enabledWhen: 'engineConnected'` returns false, so
the handler doesn't fire; but `preventDefault` still suppresses
the browser default (page scroll). The user sees no scroll,
matching the prior dispatcher's behaviour.

The alternative ordering (`isActionEnabled` before
`preventDefault`) would let Space scroll the page when the
engine is disconnected — a regression. Settling on
preventDefault-before-enabled-check intentionally.

### Reactivity

`keyToAction` is a `computed` over `store.profile.settings.keybindings`.
A user rebinding (Phase 4 UI) mutates the overrides map →
computed re-evaluates → dispatcher picks up the new mapping
without a remount.

The registry itself is module-static; its iteration is stable.

### Multi-tasking preservation

The dispatcher's listener is `window`-scoped, unchanged from
Phase 1. Handler functions consume `activeBoard` / `store`
references directly (registry's handler closures). No
per-board state in the dispatcher; the action's handler reads
the board context at fire time. Multi-tasking property (the
SPA's background-board packet-consume and activity-indicator
paths) untouched by this commit.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline; the dispatcher's behaviour is tested
  manually via the user's end-to-end recipe — Phase 5 lands
  dispatcher-targeted Vitest integration tests).

User-side validation (parity sweep — every default keybinding
should still work exactly as before):

1. **Arrow keys** — ArrowDown/ArrowUp advance/retreat the
   cursor; ArrowLeft/ArrowRight switch variations. Holding
   fires at vsync (rAF coalesce preserved).
2. **Home / End** — jump to first/last node of current line.
3. **Space** — toggles pondering when engine connected; no-op
   (but Space still doesn't scroll the page) when
   disconnected.
4. **m / M** — toggle move suggestions (both upper/lower work).
5. **n / N** — toggle stone move-numbers.
6. **c / C / d / D / l / L** — toggle ownership sub-modes.
7. **Form controls + CodeMirror** — typing in inputs /
   textareas / `.cm-content` doesn't trigger any registry
   action (context guards unchanged).
8. **Multi-board parity** — switch boards; keybindings still
   operate on the active board.
9. **PV-hover during range query, fast-nav with many boards**
   — perf characteristics from Fix #1 / Fix #2 preserved
   (the dispatcher's rAF coalesce is unchanged; per-action
   handlers do the same work as before).

## What follows

- **Phase 3:** Settings tab restructure into sub-tabs
  (General + Keybindings as a read-only registry view —
  discoverability lands).
- **Phase 4:** Edit / Reset / Unbind UI per the plan doc's
  Action rows section.
- **Phase 5:** Vitest integration tests for dispatcher
  behaviour (registry → keyToAction map → keydown dispatch,
  with attention to conflict resolution and enabledWhen
  gating).

License: Public Domain (The Unlicense)
