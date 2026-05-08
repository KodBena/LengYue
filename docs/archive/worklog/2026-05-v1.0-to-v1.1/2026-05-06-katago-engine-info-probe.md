# KataGo engine-info probe + toolbar surface + backlog sweep

- **Status:** Shipped on `frontend/katago-engine-info-probe`,
  2026-05-06 (iteration 2). Eight files touched (no new files);
  build green. Closes the last open scoped item in
  `docs/notes/frontend-backlog.md` ("query_version + query_models
  on KataGo connect"). Plus a documentation sweep retiring four
  other backlog entries the user named as already done or
  no-longer-applicable.

  **Iteration 2 — three changes per user feedback on PR #145**:

  1. *Visible label uses `models[0].internalName`*, not `name`.
     The `name` field on most installs is the model file's full
     pathname, which leaks operator info in screenshare /
     streaming contexts. `internalName` is KataGo's short
     self-identifier — short and path-free.
  2. *Display moves from StatusBar to Toolbar* (left of PPS).
     The status bar's role is board-state vocabulary (move
     number, players, captures, turn); engine info belonged
     with the rest of the engine telemetry already in the
     toolbar (PPS / LATENCY / WATCHDOG).
  3. *Hover tooltip shows the full responses* (JSON-stringified
     `query_version` and `query_models` payloads, including the
     privacy-concerning `name` field). The user explicitly asked
     for the full data to be inspectable on demand — visible
     short, hover deep.

  `EngineInfo` gains `internalName` plus `versionPayload` /
  `modelsPayload` for the tooltip; iteration 1's `modelNames`
  array retired.
- **Genre:** Feature + doc maintenance — small lifecycle
  improvement (probe engine identity on each connect / reconnect)
  + a long-overdue sweep of `frontend-backlog.md` to retire
  entries that closed in earlier PRs but the doc never recorded.
- **Date:** 2026-05-06.

## Context

Two threads, addressed together because the user surfaced both
in the same handoff:

**Thread 1 — engine identity on connect.** The frontend connects
to KataGo (or a KataProxy LEAF) over WebSocket. The `query_version`
and `query_models` engine actions exist in the wire protocol but
hadn't been wired: the watchdog used `query_version` for latency
measurement only, discarding the response body; `query_models`
was never sent. The status bar therefore said nothing about
*which* engine was on the other end of the WS. A user reconfiguring
the engine service (different KataGo build, different model
loadout) had to consult the engine logs directly to confirm the
change took effect.

**Thread 2 — backlog drift.** The user pointed out (twice now,
politely) that `docs/notes/frontend-backlog.md` carries entries
for items that have shipped or become irrelevant. Examples:
"PV hover text annotation" (closed earlier), "analysis range
preservation across boards" (closed earlier), "disconnect button
styling" (closed earlier), "SR tab analysis independent of
analysis tab" (made irrelevant by the cards-tab-merge arc). The
doc had rotted because nothing was sweeping it; the recent
TODO-discrepancy audit didn't surface this drift because the
audit was scoped to `docs/TODO.md` proper, not the auxiliary
backlog file.

Both threads address one PR cleanly: this PR ships the
engine-info probe, then sweeps the backlog as the established
"strike-through with closure paragraph" pattern the file
already carries.

## What changed (engine-info)

Six files. Five for the probe + status-bar surface, one for the
doc sweep.

### `src/engine/katago/katago-client.ts`

`ClientCallbacks` gains an optional `onConnect: () => void`
field. The `ws.onopen` handler calls it on every successful
WebSocket open — initial connection and every reconnect.
Optional so existing callers that don't care about the
connect-time hook stay one-line.

### `src/services/analysis-service.ts`

Three additions:

1. **`onConnect` wiring** in the `ClientCallbacks` literal at
   `connect()`. Calls a new private method `probeEngineInfo()`.
2. **`probeEngineInfo()`** — sends `query_version` and
   `query_models` sequentially via `sendCommand` (which is
   already a Promise<KataGoResponse>); writes a new `EngineInfo`
   value object onto `store.engine.info`. Defensive parse on
   the models response: `KataActionResponse.models` is typed
   `readonly unknown[]` because the per-entry shape varies
   across KataGo versions (some return strings, some return
   objects with `name` / `internalName` fields). The parse here
   handles both. Errors logged and swallowed — a probe failure
   leaves the status bar blank until the next probe round-trips,
   which is the correct fail-loud-for-the-developer-but-don't-
   crash posture for non-essential UX info.
3. **Watchdog tick captures version**. The existing
   `query_version` watchdog already runs every 5s for latency
   measurement; the response body was previously discarded.
   Now it updates `store.engine.info.version` whenever the
   reported version differs from the cached value — so a
   mid-session engine restart with a version bump surfaces in
   the status bar within ~5s, without waiting for a full
   WebSocket reconnect. Models are refreshed only on connect
   (probe path) since model changes typically require a service
   restart anyway.

The `disconnect()` and `onDisconnect` paths both clear
`store.engine.info` back to the empty shape so a stale identity
from a prior session can't survive into the next session — same
hygiene as the per-board `activeMode = {}` clear.

### `src/types.ts`

`EngineState` gains an `info: EngineInfo` field, with
`EngineInfo = { readonly version: string | null; readonly modelNames: readonly string[] }`.
The value object is reassigned wholesale by `analysisService`
(`store.engine.info = { ...info, version: x }`) — same
"mutable container, immutable value" pattern as `metrics`.

### `src/store/index.ts`

The default reactive store's `engine` slot gains the empty
`info: { version: null, modelNames: [] }` initializer. Not
persisted (engine state is rebuilt on each session from the
live connection); no schema migration needed.

### `src/components/StatusBar.vue`

Reads `store.engine.info` directly via a local `engineLabel`
computed that collapses the version + first model name into
a one-line string:

- `"v1.13.0 · b18c384nbt-uec"` — version + single model.
- `"v1.13.0 · b18c384nbt-uec (+1)"` — version + first model + count of additional models.
- `"v1.13.0"` — version only when models list is empty.
- `null` — neither known; the label hides via `v-if`.

Tooltipped with "KataGo backend identity (refreshed on each
connect / reconnect)" so the meaning is discoverable. Styled
in `--text-2` monospace — matches the existing `.caps` style
on the right-hand cluster.

## What changed (backlog sweep)

Five entries in `docs/notes/frontend-backlog.md` retired with
strike-through closures (matching the existing pattern the
file already uses for the contenteditable / intermission-click
items):

| Entry | Disposition |
|---|---|
| "PV hover text annotation shouldn't show" | Closed in a prior PR (per user). |
| "Need an override for visits in SR" | Closed as part of the visits-override feature; the second half of the bullet (card-metadata display) split out as a separate open entry. |
| "Disconnect button styling" | Closed in a prior PR (per user). |
| "Analysis done in SR tab independent of analysis tab" | Made irrelevant by the cards-tab-merge arc (PRs #140 / #141 / #142). The SR tab no longer exists; the question is moot. |
| "Analysis range not preserved across tab/board switch" | Closed in a prior PR (per user; `BoardState.analysisRange` is per-board and SyncService-persisted). |

Plus the engine-info entry struck-through with a closure
paragraph cross-referencing this worklog.

The user explicitly raised the doc-graph drift twice; the
audit-pass that reviewed `docs/TODO.md` didn't catch
`frontend-backlog.md` because it's an auxiliary document, not
the canonical TODO. The "card-metadata display during active
review sessions" entry remains open as a small follow-up — it
was the second clause of the visits-override bullet that didn't
ship with the override.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- `EngineInfo` is a value object; `store.engine.info` is
  reassigned wholesale on probe / disconnect / version-bump,
  matching the `metrics` pattern. ADR-0001 type-honesty: the
  outer container mutates, the value object inside is
  `readonly`.
- `onConnect` is optional on `ClientCallbacks` so existing test
  fixtures or alternative clients that don't care about the
  connect hook stay valid without modification.
- `probeEngineInfo` errors are logged, not thrown — a probe
  failure doesn't crash the analysis service or block subsequent
  watchdog ticks.

Manual smoke (left as HMR-driven user verification):

- Initial connect: status bar shows `vX.Y.Z · <model>` once
  the probe round-trips.
- Disconnect: status bar's engine label disappears.
- Reconnect: probe re-fires; label reappears with current
  values.
- Service restart with a version bump (mid-session): label's
  version updates within ~5s via the watchdog tick.
- Model loadout change (mid-session): visible only after a
  full reconnect (by design — model changes typically require
  service restart anyway).

## Forward notes

- **Card metadata display during active review sessions.**
  The remaining half of the prior visits-override bullet.
  ReviewSessionPanel could surface the current card's tags,
  parent lineage, and notes alongside the existing status /
  counter / scores. Held; the user has not flagged it as
  blocking.
- **Backlog sweep cadence.** This PR's sweep was reactive (the
  user surfaced specific drift). Going forward, either each
  PR that touches `frontend-backlog.md` does a once-over of
  adjacent entries, or a periodic audit pass (annually?)
  reviews the file for staleness. ADR-0005's "documentation
  is part of the deliverable" principle would prefer the
  former, but that requires every contributor to look up
  whether the bug they're closing has a backlog entry — which
  is exactly the discipline that broke down here. A PR-time
  reminder is hard to enforce without tooling.
- **`docs/TODO.md` audit was scoped narrower than expected.**
  The user noted that the prior TODO-discrepancy audit
  surfaced no problems. This is because the audit looked at
  `docs/TODO.md`'s active / completed tables for internal
  consistency, not at auxiliary docs like
  `frontend-backlog.md`. A future audit should explicitly
  include the auxiliary docs (`frontend-backlog.md`,
  `deferred-items.md`, `auditor-notes.md`) in scope.
