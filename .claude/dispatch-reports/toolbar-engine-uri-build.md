# Dispatch report — toolbar-engine-uri (commission row 713)

(Written to the worktree-local `.claude/dispatch-reports/` because
the main-checkout path `/home/bork/w/omega/.claude/dispatch-reports/`
is refused from inside this worktree-isolated agent — the harness
blocks writes there and asks for the worktree copy instead. Fallback
per the dispatch instructions.)

## Task
Put the engine WebSocket URI directly in the toolbar — visible and editable —
without creating a second writer of the engine-URL fact.

## Where the single store cell lives

`store.profile.settings.engine.katago.url` (type flows from
`AppSettings` in `frontend/src/store/schema.ts`; default value
`ws://127.0.0.1:41948` seeded in `frontend/src/store/defaults.ts:17`).

Prior to this change, the ONLY editor of this cell was the Settings
tab's generic Advanced Registry editor
(`frontend/src/components/editors/RegistryEditor.vue`, mounted at
`frontend/src/components/SettingsTab.vue`'s `#advancedRegistry`
sub-tab over `store.profile.settings`), which treats the leaf as an
untyped scalar text input with **no validation of any kind** — any
string, including a malformed one, is written straight to the store
on every keystroke via `updateProfileAt` (`store/profile-owner.ts`).
There was also no reconnect side-effect on that edit; a user had to
separately hit the toolbar's CONNECT/DISCONNECT button afterward.

The consuming read site is `AnalysisService.connect()`
(`frontend/src/services/analysis-service.ts:189-203`):
`urlOverride || settings?.katago?.url || KATAGO_WS_URL`, passed to
`KataGoClient.connect(url, ...)`
(`frontend/src/engine/katago/katago-client.ts`), which does
`new WebSocket(this.url)` with no try/catch — a malformed URL there
throws synchronously and uncaught. This is the ADR-0002 motivation
for adding validation now, even though the settings path never had
any.

## How the toolbar affordance shares the cell (ADR-0012)

New composable `frontend/src/composables/useEngineUriEditor.ts`:
- **Read**: `computed(() => store.profile.settings.engine.katago.url)`
  — same cell, live.
- **Write**: `mutateProfile((profile) => { profile.settings.engine
  .katago.url = next; })` — the exact same named-mutator owner
  (`store/profile-owner.ts`) that `AnalysisControls.vue`'s sibling
  `engine.katago.*` v-model computeds already route through. No new
  store field, no copy, no sync watcher between two cells.

Proven, not asserted: `tests/integration/useEngineUriEditor.test.ts`'s
"same cell" describe block writes through the toolbar editor and
reads back via `store.profile.settings.engine.katago.url` directly
(the exact read AnalysisService and RegistryEditor use), and
separately writes via `updateProfileAt(['settings','engine','katago','url'], …)`
(the literal Settings-tab seam) and reads back via the toolbar
editor's `storedUri` computed — both directions pass.

## Validation (new — previously absent on either path)

`frontend/src/lib/ws-url.ts`: `validateEngineUri(raw)` — trims,
rejects empty, parses with the platform `URL` constructor (catches
malformed strings), and requires `ws:`/`wss:` scheme. Pure,
dependency-free ([B1]). This is genuinely new logic, not a "reuse" of
an existing settings-path validator, because none existed — recorded
here explicitly rather than silently claiming otherwise. It is NOT
wired into `RegistryEditor.vue`'s generic `engine.katago.url` leaf
(that field still accepts anything, unchanged); doing so would mean
extending `RegistryEditor`'s generic per-path table mechanism
(`PATH_ENUMS`/`PATH_TOOLTIPS`) for validation, which is outside this
task's acceptance criteria and was left out under ADR-0004
minimal-touch. The toolbar path is the one place invalid input is now
rejected loudly.

## Reconnect wiring (constraint 3)

`useEngineUriEditor.commit()`, on a valid and CHANGED value, checks
`isConnected` (from `useEngineControls`) BEFORE writing, then calls
`disconnect()` followed by `connect()` — the exact same two functions
(`useEngineControls`, which wraps the `analysisService` singleton)
the toolbar's own CONNECT/DISCONNECT button
(`Toolbar.vue`'s `@toggle-engine` → `App.vue`'s
`engineControls.toggle`) uses. `connect()` re-reads
`store.profile.settings.engine.katago.url` fresh, so it picks up the
just-committed value without an explicit override argument — no
parallel WS-teardown/rebuild path was written.

Design decision (recorded, not silently resolved): reconnect only
fires if the engine WAS connected at commit time. If disconnected,
editing the URI just updates the store cell for the next manual
connect — it does not force-open a connection the user hasn't asked
for. Spy-level test:
`useEngineUriEditor.test.ts`'s "reconnect on commit" describe block
covers connected→cycles, disconnected→no-op, and unchanged-value→no-op.

## Compact-display choice (constraint 2/4)

`frontend/src/components/chrome/ToolbarEngineUri.vue`: click-to-edit
— a monospace text span (max-width 220px, `text-overflow: ellipsis`)
that swaps to a `--surface-0`-backed `<input>` on click, autofocusing
and selecting existing text. Commit on Enter or blur; Escape calls
`cancel()` (revert draft, exit edit mode, no store write) then blurs.
Renders **unconditionally** in the toolbar (unlike
`ToolbarEngineMetrics`, which is `v-if="isConnected"`) — the URI is
exactly what's needed to fix a bad connection while disconnected.
It reads no per-tick value (only the low-frequency stored URI and
local edit-buffer state), so none of `ToolbarEngineMetrics`'
imperative-escape machinery is needed per ADR-0010 — read-locality is
satisfied trivially because the leaf's only reactive read is the
value it displays, and that value doesn't change on the 1 Hz metrics
tick.

## Acceptance — per-claim evidentiary status

1. **Same-cell test (not just equal values)** — WITNESSED.
   `tests/integration/useEngineUriEditor.test.ts`, both directions,
   passing (`npx vitest run` output captured below).
2. **Invalid-URI rejection preserves stored value** — WITNESSED.
   Same file, "invalid URI rejection" describe block (malformed
   string, non-ws(s) scheme, and a check that connect/disconnect are
   NOT called on a rejected commit) — 3 tests passing. Unit-level
   validator coverage in `tests/unit/lib/ws-url.test.ts` (8 tests).
3. **Escape reverts** — WITNESSED.
   `tests/integration/useEngineUriEditor.test.ts`'s "Escape reverts"
   block: draft restored to stored value, store untouched.
4. **Commit triggers the reconnect path (spy-level)** — WITNESSED.
   `tests/integration/useEngineUriEditor.test.ts`'s "reconnect on
   commit" block spies on `fakeAnalysisService.connect` /
   `.disconnect` (added to the existing fake at
   `tests/fakes/analysis-service.ts`), asserting call counts AND
   ordering (`disconnect` before `connect`) via
   `mock.invocationCallOrder`.
5. **`npm run build` exit 0** — WITNESSED. `vue-tsc -b && vite build`
   completed, 1085 modules transformed, no type errors.
6. **`npm run test:run` exit 0** — WITNESSED. Full suite: 83 files /
   1118 tests passed, 3 files / 4 tests skipped (pre-existing skips,
   unrelated to this change) — 0 failures.
7. **`eslint .`** (CI-gated per `frontend/CLAUDE.md`'s testing
   posture) — WITNESSED, exit 0, no findings.

## Files touched

- New: `frontend/src/lib/ws-url.ts`
- New: `frontend/src/composables/useEngineUriEditor.ts`
- New: `frontend/src/components/chrome/ToolbarEngineUri.vue`
- New: `frontend/tests/unit/lib/ws-url.test.ts`
- New: `frontend/tests/integration/useEngineUriEditor.test.ts`
- Modified: `frontend/src/components/chrome/Toolbar.vue` (mount
  `<ToolbarEngineUri />` unconditionally, ahead of
  `<ToolbarEngineMetrics />`)
- Modified: `frontend/src/locales/en.json` (`engineUri.label`,
  `engineUri.placeholder`, three `engineUri.error.*` keys — en-only;
  other locale catalogs are partial and fall back to `en` per
  `frontend/src/i18n/index.ts`'s `fallbackLocale: 'en'`)
- Modified: `frontend/tests/fakes/analysis-service.ts` (added
  `connect` / `disconnect` spies + reset wiring — didn't exist on the
  fake before this task)
- Modified: `frontend/FILES.md` (three new entries: `lib/ws-url.ts`,
  `composables/useEngineUriEditor.ts`,
  `components/chrome/ToolbarEngineUri.vue`)

No new keybinding action id was introduced — UNEXERCISED/not
applicable (the standing rule about registering a new keybinding
domain + i18n section only applies when a keybinding action id is
added, which this change does not do).

## Branch / commit

Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a9de02930700c7f98`
Branch: `worktree-agent-a9de02930700c7f98` (off `next`)
Commit: `5a397133` — "feat(frontend): engine WebSocket URI in the
toolbar (toolbar-engine-uri)". The orchestrator merges from here.

## Exit codes (verbatim)

```
$ nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run build
EXIT:0

$ nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run
EXIT:0
Test Files  83 passed | 3 skipped (86)
     Tests  1118 passed | 4 skipped (1122)

$ nice -n 19 npx eslint .
EXIT:0
```
