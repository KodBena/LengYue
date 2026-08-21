# Future-version workspace recovery — build report (2026-08-11)

Work item `next-futureblob-recovery`, ratified program row 1937,
incident row 1942: when two branches run against one live backend and
a newer branch's app forward-migrates the shared `user_workspace_01`
document, `next`'s app previously threw an uncaught `Error` out of
`migrate()`, the SPA went blank with no recovery affordance, and each
of the three 2026-08-11 recurrences needed a manual DB inverse-
migration (`UPDATE documents SET data = json_set(data,
'$.schemaVersion', N-1) ...`). This closes that class: the
future-version condition is now a typed, expected boot outcome the
boot path catches and enters a recovery mode for, instead of dying.

## ADR-0000 closure statement

**Invariant, stated over the class:** any hydration whose persisted
blob's `schemaVersion` exceeds this app build's
`CURRENT_SCHEMA_VERSION` must never leave the SPA in an unrecoverable
state. The app enters a named, typed recovery mode — distinguishable
at the type level (`WorkspaceLoadState.kind === 'future-version'`,
`FutureSchemaVersionError`) from every other boot-time outcome — and
every persistence write attempted while that recovery mode is active
is refused audibly, from every code path in the codebase capable of
issuing such a write.

**Quantification universe:**
- **Version-delta axis.** Not special-cased to "one version ahead" or
  to the incident's specific schemaVersion 76 — `FutureSchemaVersionError`
  carries whatever `blobVersion`/`appVersion` pair actually occurred,
  and the fixture in `tests/unit/store/migrations.test.ts` uses
  `CURRENT_SCHEMA_VERSION + 2` specifically so the class isn't
  accidentally scoped to "exactly one version ahead."
- **Identity axis.** Not hardcoded to `local_user` (the diagnosis
  phrase in the incident) — `SyncService.hydrate(userId: number)` is
  generic over whatever identity is authenticated; the fixture tests
  drive it through the real `useAuth`/JWT path with a synthetic user.
- **Write-call-site axis (the "every writer that could bypass
  suppression" enumeration).** `grep -rn "documents/" frontend/src`
  finds exactly one `api.request('PUT', ...)` call in the whole
  frontend tree — `SyncService.sendSync()`, in
  `frontend/src/services/sync-service.ts`. Both write triggers that
  exist today — the debounced watcher (`scheduleSync` → `sendSync`)
  and the manual triggers (`forceSave()` / `retrySave()`) — already
  funnel through that one function, so gating there (the persist-
  suppression check, first line of `sendSync()`) closes the class for
  every writer this codebase can currently construct. **Named as not
  covered:** a future second persisted-document type (the app
  currently persists exactly one document, `user_workspace_01`) would
  need its own suppression-typed gate; this is a filed limitation of
  the current single-document design, not a silent gap in it.
- **Sibling-surface axis.** `retryHydrate()` re-invokes `hydrate()`,
  the same catch site — covered structurally, not by a second
  enumeration. `onAuthStateChange` (identity transitions: logout,
  login-as-different-user) resets `persistSuppression` and
  `futureVersionUserId` explicitly, so a future-version suppression
  for user A cannot silently leak into user B's session after a
  logout/login — a sibling failure mode the original defect report
  didn't name but the same class covers.
- **Denomination check.** The suppression state and the recovery UI
  are denominated in the two schema-version integers that actually
  caused the condition (`blobVersion`, `appVersion`), carried as typed
  fields on `FutureSchemaVersionError` and on
  `WorkspaceLoadState`'s/`WorkspaceSaveState`'s new legs — never
  recovered by parsing the error's message string (ADR-0002's
  error-message-reparse ban, RCA guard G1). A `console.error` and a
  user-facing banner both read the same two typed numbers, not two
  independently-formatted copies of the same fact.

## Files touched

- `frontend/src/store/migrations.ts` — `FutureSchemaVersionError`
  (named `Error` subtype carrying `blobVersion`/`appVersion` as typed
  instance fields, same shape as the existing `AnalysisWaitError`
  precedent). `migrate()` throws this specific type instead of a
  generic `Error` on the future-version leg; the "missing migration"
  defensive throw stays a plain `Error` (deliberately NOT this type —
  it's a broken append-only-invariant assertion, not the ordinary
  cross-branch schema skew this type names). Failure-contract doc
  comment updated to describe the typed distinction.
- `frontend/src/types/app.ts` — `WorkspaceLoadState` gains a
  `future-version` leg (`{ kind: 'future-version'; blobVersion: number;
  appVersion: number }`); `WorkspaceSaveState` gains a `suppressed` leg
  (`{ kind: 'suppressed'; blobVersion: number; appVersion: number }`).
  Both are genuinely new discriminant values, not a message-string
  variant of the existing `error` leg — `error` means "an attempt was
  made and failed"; `future-version`/`suppressed` mean "no attempt is
  made, by design, until the user chooses."
- `frontend/src/services/sync-service.ts` —
  - `hydrate()`'s catch leg `instanceof`-narrows on
    `FutureSchemaVersionError` and, on match: sets
    `store.workspaceLoadState` to the `future-version` leg, sets the
    private `persistSuppression` gate to `suppressed-future-version`
    **at detection time** (not deferred until the user clicks
    "continue" — see below), and stores the pending `userId` for the
    two recovery actions to consume. Does NOT fall through to the
    generic error leg.
  - `persistSuppression: PersistSuppressionState` — a private,
    NAMED typed field (`{ kind: 'unsuppressed' } | { kind:
    'suppressed-future-version'; blobVersion; appVersion }`),
    deliberately not a boolean ("a boolean the next writer forgets is
    exactly the silent-failure shape ADR-0002 forbids" — direct
    quote from the commission, carried into the field's doc comment).
    Checked as the FIRST statement in `sendSync()`, ahead of the
    existing identity-gate defense-in-depth check; refuses with a
    `console.error` naming the suppression state on every attempt.
  - `continueOnDefaults()` (public) — the DEFAULT recovery action.
    Calls `resetWorkspace()` for an honestly-clean in-memory
    workspace, transitions `workspaceLoadState` to `loaded` and
    `workspaceSaveState` to `suppressed`, re-affirms (idempotent)
    `persistSuppression`. Performs no network write.
  - `resetServerWorkspaceToDefaults()` (public) — the EXPLICIT
    destructive action. Calls `resetWorkspace()`, lifts suppression,
    marks the pending identity hydrated, and fires one immediate
    `forceSave()` (not the debounced path) — the server's newer blob
    is overwritten now, not whenever the debounce interval next
    elapses.
  - `onAuthStateChange()` resets `persistSuppression` and
    `futureVersionUserId` to their unsuppressed/null defaults on every
    identity transition (see the sibling-surface axis above).
- `frontend/src/composables/auth-app/useWorkspaceRecovery.ts` (new) —
  thin composable wiring the destructive action's mandatory
  confirmation (`useAppDialogs().confirm({ danger: true })`, the
  codebase's sanctioned `window.confirm` replacement) so both the
  blocking gate and the ongoing banner share one confirmation flow.
  `continueOnDefaults()` is a direct pass-through (no confirmation —
  it's the non-destructive default).
- `frontend/src/components/chrome/WorkspaceRecoveryGate.vue` (new) —
  pure-renderer blocking prompt for `workspaceLoadState.kind ===
  'future-version'`. Names both versions; two buttons emit `continue`
  / `reset` (no `SyncService` reference held directly — mirrors
  `SettingsTab.vue`'s established `force-save`-emit convention rather
  than threading the whole service through a component). No
  box-shadow/transition/blur; `--text-0` text, `--surface-0`
  background, `--state-error` border/text on the destructive button
  only (never a filled destructive background).
- `frontend/src/App.vue` — imports + wires
  `WorkspaceRecoveryGate`/`useWorkspaceRecovery`; adds the
  `future-version` leg to the boot-state `v-if`/`v-else-if` chain
  (via a narrowed `futureVersionLoadState` computed, since the
  template compiler's cross-attribute narrowing guarantee on the same
  element isn't something this codebase leans on elsewhere); adds the
  persistent `workspaceSaveState.kind === 'suppressed'` banner
  (`#workspace-suppressed-banner`, own `suppressedSaveState` computed)
  with a "Reset server workspace" button reachable at any point in the
  session, not only from the initial blocking prompt.
- `frontend/src/locales/{en,ja,ko,zh-CN}.json` — new `sync.*` /
  `sync.recovery.*` keys. English populated for real; the other three
  carry `[TODO]`-prefixed English placeholders per
  `frontend/docs/i18n.md`'s sanctioned stub convention (native-speaker
  review is a standing gap for the whole catalog, not introduced
  here).
- `frontend/FILES.md` — two new-file entries
  (`useWorkspaceRecovery.ts` [B1], `WorkspaceRecoveryGate.vue` [B1]).
- `FEATURES.md` — new entry under "Authentication and persistence"
  (untagged — the surface is implemented end-to-end and covered by
  both integration suites below, so it doesn't carry an
  `[experimental]`/`[partial]` qualifier).
- `frontend/tests/unit/store/migrations.test.ts` — witnesses for
  `FutureSchemaVersionError`'s typed distinction (see Witnesses
  below).
- `frontend/tests/integration/sync-service-future-version.test.ts`
  (new) — SyncService-level witnesses against the real store + a
  stubbed `fetch`, reusing `sync-session-version.test.ts`'s harness
  shape.
- `frontend/tests/integration/workspace-recovery-gate.test.ts` (new)
  — UI-level witnesses against the real `AppConfirmDialog`.

## Why suppression starts at detection, not at the "continue" click

The commission's recovery-mode description reads "fail-loud and
non-destructive **by default**." Read literally, the default posture
must already be in force the moment the condition is detected, not
deferred until the user acts on the blocking prompt — otherwise a
boot-time composable's background write (there are several watchers
in `useAppBootstrap.ts` that write to `store.profile`/`store.session`
at setup time, e.g. the knob-registry coherence check) could schedule
and fire a PUT that silently overwrites the newer server blob
*before* the user has made any choice at all — exactly the silent
failure this whole commission exists to foreclose. `persistSuppression`
is therefore set in `hydrate()`'s catch leg itself;
`continueOnDefaults()` re-affirms the same value (a harmless
idempotent write) when the user later makes the choice explicit at
the UI.

## Design rejected: gating in `scheduleSync()` instead of `sendSync()`

Considered gating the debounce-arm step (`scheduleSync()`) rather than
the actual PUT (`sendSync()`). Rejected: `scheduleSync()` already has
a silent early-return for the ordinary "not yet hydrated for this
identity" case, and layering a second silent gate on top of it would
mean a persist ATTEMPT during recovery mode never reaches any loud
signal at all — an edit would just... not persist, with no console
trace. Gating at `sendSync()` (the sole network call site) instead
means every attempt that would have reached the network is loud,
every time, which is what "the refusal is loud" requires. This also
meant `hydrate()`'s catch leg deliberately DOES set `hydratedForUserId`
in the future-version branch (rather than leaving it `null`, which
would have been the more "obviously safe"-looking choice) — otherwise
`scheduleSync()`'s pre-existing identity gate would silently absorb
every attempt upstream of `sendSync()`, and the loud refusal would
never fire from ordinary edits.

## Witness statuses

Every item below is WITNESSED unless a status is called out explicitly.

- **The typed outcome surfaces on a future-version fixture blob.**
  `tests/unit/store/migrations.test.ts` — two new `it`s: `migrate()`
  throws specifically `FutureSchemaVersionError` (not a plain `Error`)
  on a `CURRENT_SCHEMA_VERSION + 2` blob (conceptually "a version-77
  fixture blob" against today's `CURRENT_SCHEMA_VERSION` of 75, kept
  relative so the fixture survives future schema bumps), and that the
  thrown error carries `blobVersion`/`appVersion` as typed fields
  matching the fixture's actual values. WITNESSED.
  `tests/integration/sync-service-future-version.test.ts` — "surfaces
  WorkspaceLoadState.kind === 'future-version' with the two versions,
  not a generic error" drives the real `SyncService` + real store
  against a stubbed `fetch` returning a future-schemaVersion document,
  asserting both the store state and the specific system-log message
  (and the ABSENCE of the generic `workspaceLoadFailed` message).
  WITNESSED.
- **Persist-suppression refuses every persist attempt while active,
  loudly.** `sync-service-future-version.test.ts`'s "persist
  suppression" describe block: one test drives the debounced-watcher
  path (a board mutation → wait out the debounce → assert zero PUTs
  reached the stubbed network AND `console.error` was called naming
  the refusal), one drives `forceSave()` the same way. **Proved
  red-without-fix**: the `sendSync()` suppression check was
  temporarily short-circuited (`if (false && this.persistSuppression...`)
  and both tests failed with `putCount === 1` instead of `0` — the
  network call went through, confirming the tests actually exercise
  the gate rather than trivially passing. Reverted immediately after
  confirming red; the file at that state is not committed. WITNESSED,
  RED-WITHOUT-FIX confirmed.
- **The destructive path only fires through the explicit
  confirmation.** `tests/integration/workspace-recovery-gate.test.ts`
  drives the real `AppConfirmDialog` (not a mocked `confirm`): clicking
  the danger button opens the dialog without calling
  `resetServerWorkspaceToDefaults`; cancelling never calls it;
  accepting calls it exactly once. A separate assertion pins that the
  continue (default) button calls `continueOnDefaults()` directly with
  no dialog involved at all. WITNESSED.
- **Normal boot unaffected.** `sync-service-future-version.test.ts`'s
  "normal (non-future) boot reaches 'loaded'" test, plus the full
  pre-existing suite (`sync-session-version.test.ts`'s 15 save-coverage
  cases and the rest of the 341-test integration/unit corpus) passing
  unchanged under `npm run test:run`. WITNESSED.
- **`resetServerWorkspaceToDefaults()` fires exactly one immediate PUT
  and resumes normal saves afterward.** `sync-service-future-version
  .test.ts`'s destructive-path describe block. WITNESSED.
- **Identity-transition sibling case (suppression doesn't leak across
  users).** Covered structurally by `onAuthStateChange`'s explicit
  reset (see Files touched) but not driven by a dedicated multi-user
  test in this arc — the existing `sync-session-version.test.ts` and
  `auth-lifecycle.test.ts` corpus exercises identity transitions
  broadly and passed unchanged, but no NEW test drives "future-version
  suppressed for user A, then log out, log in as user B, assert B's
  saves are NOT suppressed." UNEXERCISED, blocker: out of the
  commission's stated witness list (typed outcome / suppression /
  destructive-confirmation-gating / normal-boot); flagging as a filed
  gap rather than silently leaving it unnamed (ADR-0000's 2026-07-02
  amendment).

## Gates

- `cd frontend && nice -n 19 npm run build` → **exit 0** (vue-tsc -b
  strict typecheck + vite build, both clean).
- `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2 nice -n 19 npm run test:run` → **exit 0** — 239
  test files passed / 3 skipped (pre-existing), 2967 tests passed / 4
  skipped (pre-existing), 0 failed.
- `npx eslint .` (project-wide, not one of the two mandated gates but
  run for due diligence since CI gates on it) → 20 pre-existing errors
  / 2 pre-existing warnings, all in files this change does not touch
  (confirmed via `git diff --stat` against every flagged path — none
  intersect this diff's file list). Zero new lint errors introduced by
  this change (confirmed by running eslint against exactly the changed
  file set in isolation first).

## Scope note

No narrowing or widening from the commissioned scope. The umbrella
`docs/dispatch/` directory was checked at session start for open
requests addressed to the frontend; none pertain to this work.

## Commit / merge-base

See the final assistant message for the commit SHA and the
fetch-then-compare-to-`origin/next` result (performed as the last act,
per the brief).
