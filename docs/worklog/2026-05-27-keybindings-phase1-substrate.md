# Keybindings Phase 1 — substrate

- **Status:** Branch `frontend/keybindings-phase1-substrate`;
  awaiting user end-to-end test before PR open.
- **Genre:** New substrate. Foundational addition with no
  user-visible behaviour change.
- **Date:** 2026-05-27.
- **Cross-references:**
  - `docs/notes/keybindings-plan.md` (the design note merged
    via PR #281) — this commit lands Phase 1 of the five-phase
    plan there.
  - `src/composables/useUserIORegistry.ts` — current hardcoded
    dispatcher; unchanged in Phase 1. Phase 2 rewires it to
    consume the registry.

## What this lands

Substrate-only. The registry is defined and validated at app
bootstrap, but the dispatcher (`useUserIORegistry`) keeps its
hardcoded switch — Phase 2's rewrite picks up the consumption.
Users see no behavioural change.

## Shape of the change

### Branded type + AppSettings field (`types.ts`)

- `KeybindingActionId = Brand<string, 'KeybindingActionId'>` —
  joins the existing `BoardId / NodeId / ProfileId / SessionId /
  BookmarkId` branded-id cluster. Prevents string typos from
  silently mis-routing key dispatch.
- `AppSettings.keybindings: Partial<Record<KeybindingActionId, string | null>>`
  — sparse user-overrides map. Absence means "use the
  registry's default key"; explicit `null` means "user
  unbound this action even though it has a default". Stored
  on profile, round-trips via SyncService's deep-watch.

### Registry (`src/lib/keybindings.ts`, new file)

The authoritative file. Contains:

- `KeybindingActionDecl` interface (id, labelKey, descriptionKey,
  defaultKey, dispatchMode, enabledWhen, handler).
- `KeybindingEnabledWhen` enum (`'always' | 'activeBoardExists' |
  'engineConnected'`) and `KeybindingDispatchMode` enum
  (`'immediate' | 'coalesced'`).
- `ACTIONS` const — branded literal catalog of the 12 current
  action ids (matches the migration table from the plan
  doc's "Migration of existing keybindings" section).
- `KEYBINDINGS_REGISTRY` — declarative array of 12
  `KeybindingActionDecl` entries, one per current
  `useUserIORegistry::runAction` case. Each entry's `handler`
  is a closure that delegates to `useNavigation()` /
  `analysisService` / `store.session.ui.*` exactly as the
  hardcoded switch does today (Phase 2 deletes the switch;
  the registry's handlers become the only path).
- `effectiveKey(action, overrides)` — pure helper resolving the
  live binding (override-or-default).
- `isActionEnabled(action)` — pure predicate evaluating an
  action's `enabledWhen` against current reactive state.
- `validateKeybindingsRegistry()` — defensive ship-time check
  for duplicate ids and default-key conflicts. Throws per
  ADR-0002 — a shipped registry with conflicts is a developer
  bug, not a user-facing condition.

`useNavigation()` is invoked at module scope (it's a
module-safe composable — closure over `activeBoard` +
`mutateBoard`, no setup-only side effects). The returned
`nav.*` methods read reactive state at fire time, matching
the `useScopedScroll` posture established by perf Fix #1.

### Default + migration

- `store/defaults.ts` — `keybindings: {}` added as a top-level
  field on the `defaultSettings` literal. Fresh installs
  serialise to `{}` (defaults rule).
- `store/migrations.ts` — schema bump 52 → 53 with backfill
  migration that sets `keybindings: {}` on any legacy
  persisted blob that lacks the field. Per the rolling-archive
  discipline, migration `50 → 51` moves from the active body
  into `archived-migrations.ts` so the active file keeps the
  two latest (51 → 52, 52 → 53) as style anchors.
- `store/archived-migrations.ts` — `50 → 51` appended verbatim.

### Bootstrap validation (`useAppBootstrap.ts`)

`validateKeybindingsRegistry()` called once at the top of
`useAppBootstrap`. Throws on conflict — same posture the
knob-registry's `validateRegistry` call has, except keybindings
is module-static (doesn't change at runtime), so no watcher
needed. A single setup-time call suffices.

### i18n strings (`en.json`)

24 new keys: `keybindings.action.<id>.label` and
`keybindings.action.<id>.description` for each of the 12
actions. Labels are short imperative (e.g., "Next move"),
descriptions are sentence-length (e.g., "Advance the cursor
to the next move in the current variation."). Other locale
catalogs deferred to the next i18n sweep PR per the existing
per-locale-tier discipline.

### `FILES.md`

New entry for `src/lib/keybindings.ts` between `dsl-harness.ts`
and `knobs.ts` (alphabetical).

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline; no test surface touched in Phase 1).

User-side validation:

1. Pull + run dev server. The app loads cleanly with no
   console errors from `validateKeybindingsRegistry` (which
   would throw on default-key conflicts).
2. Schema-53 migration runs once on hydrate — backfills
   `profile.settings.keybindings: {}`. Verifiable by
   inspecting the Force-Persistence-saved blob; should
   include the `keybindings` field as `{}`.
3. All existing keybindings still work exactly as before
   (the dispatcher in `useUserIORegistry` is unchanged — it
   still has its hardcoded switch). `n` toggles move
   numbers, `m` toggles suggestions, arrows nav, space
   toggles ponder, etc.
4. Settings tab and the rest of the SPA unchanged.

## What follows

- **Phase 2:** rewrite `useUserIORegistry` to consume the
  registry. Behaviour equivalence with Phase 1 — same keys,
  same actions, same dispatch modes (the existing
  `HANDLED_KEYS` and `COALESCED_NAV_KEYS` sets get built
  dynamically from the registry; the case-by-case switch
  goes away).
- **Phase 3:** Settings tab restructure into sub-tabs (General
  + Keybindings), with the Keybindings sub-tab as a
  read-only table over the registry. Discoverability lands
  here even without the edit affordance.
- **Phase 4:** Edit + Reset + Unbind UI per the plan doc's
  Action rows section.
- **Phase 5:** Vitest integration tests for dispatcher behaviour.

Each phase ships as its own PR per the user's bisectability
preference.

License: Public Domain (The Unlicense)
