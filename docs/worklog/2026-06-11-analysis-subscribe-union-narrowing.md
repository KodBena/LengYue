# Worklog — analysis-subscribe union narrowing (2026-06-11)

> Work-status item `analysis-subscribe-union-narrowing` (open/active,
> maintainer-signed). Spun out of `silent-coercion-protocol-boundaries-audit`
> per the consolidation §3 invisible-rider finding; evidence is the
> 2026-06-11 debt second-opinion review
> (`docs/notes/audit/audit-debt-second-opinion-2026-06-11.md`, triage row 1,
> med severity / verified). Branch `bork/fix/analysis-subscribe-union-narrowing`,
> PR #<filled on push>. Frontend sub-project.

## Context

`AnalysisService`'s two `client.subscribe` callbacks
(`src/services/analysis-service.ts`, in `analyzeRange` and
`analyzeActiveNode`) cast the broad wire union straight to the analysis
variant: `this.onAnalysisUpdate(res as KataAnalysisResponse, queryId)`.
The subscribe callback is typed `(res: KataGoResponse) => void`, and
`KataGoResponse = KataAnalysisResponse | KataActionResponse |
KataErrorResponse` (`src/engine/katago/types.ts`). The cast erases the
union: a proxy error packet (`{id, error}` — a bad palette compiled to a
Python error, an unknown SELECTOR `model`, a proxy-side abort) routed
onto an analysis query's id was read as if it carried `rootInfo` /
`moveInfos` / `isDuringSearch`.

The traced corruption path (recorded on the parent audit item), verified
here by reading the consumer code end to end:

- **Telemetry `turnsCompleted` corruption.** `onAnalysisUpdate` calls
  `telemetry.recordPacket(queryId, response.turnNumber, …,
  response.isDuringSearch)`. On an error packet `isDuringSearch` is
  `undefined`; `recordPacket`'s `if (!isDuringSearch) turnsCompleted +=
  1` treats the absent flag as a finalized turn.
- **Premature telemetry auto-cleanup.** That same increment can reach
  `turnsTotal` (1 for ponder/analyze), tripping `recordPacket`'s
  natural-completion `queries.delete` — the row vanishes with a wrong
  count.
- **False ponder-exhausted warning.** `onAnalysisUpdate`'s
  `if (queryInfo.ponderCeiling !== undefined && !response.isDuringSearch)`
  fires `pushSystemMessage('warning', analysis.ponderExhausted)` because
  `!undefined === true`.
- **Premature restart-thunk reap.** `if (!response.isDuringSearch)` adds
  `undefined` to `finalizedTurns` and reaps the restart thunk once the
  set reaches `analyzedTurnCount` (1 for ponder/analyze).
- **Leaked `activeQueries` / `activeSubscriptions` entry.** The query is
  treated as complete *without* `stopQuery` ever firing, so the
  subscription is never torn down and the per-query maps never released.

ADR-0002 Rule 4: boundaries validate, they do not coerce. The in-repo
precedent is `awaitFinalPacket`'s narrowing
(`src/composables/board/usePlayFromPosition.ts`), which probes
`'error' in res`, surfaces loudly, and returns before treating the
packet as the analysis variant.

## Population (predicate, not the two named instances)

The item defines the population by predicate: *every subscribe-callback
site in `analysis-service.ts` that casts a wire response into the
analysis variant*. Re-measured at HEAD 2026-06-11: **exactly two** —
`analyzeRange` (was `:714`) and `analyzeActiveNode` (was `:915`). The
relocation the item warned about did not move them off those lines; the
leads held. Both are fixed.

## The change

A single private trust-boundary method, `routeSubscriptionResponse(res:
KataGoResponse, queryId)`, replaces the cast at both callbacks. It is
the narrowing seam — one shape, both sites — mirroring
`awaitFinalPacket`'s `'error' in res` field-presence discriminator (the
same discriminator the wire-type contract uses to distinguish
`KataErrorResponse`, and the same one `katago-client.ts`'s global
handler already uses). On an error packet it releases the query through
`stopQuery` and returns; otherwise it narrows to `KataAnalysisResponse`
(the post-probe cast, justified inline) and calls `onAnalysisUpdate`.

### Loud surfacing — the existing channel, NOT a second toast

The error packet has **two** delivery paths in
`katago-client.ts::handleIncomingMessage`, and this is load-bearing for
where the loud surface lives:

1. A **global** path — `if ('error' in response) callbacks.onError(response.error)`
   — fires for *every* error packet, before the per-id subscriber
   dispatch and independent of it. `AnalysisService.connect` wires
   `onError` to `pushSystemMessage('error', errorMsg)`. So the
   user-facing loud surface **already fires** for these packets.
2. The same packet then falls through (the global handler has no early
   `return`) to the per-id subscriber — the corrupting cast site.

The fix therefore does **not** emit a second `pushSystemMessage`: that
would double-toast the same failure. It relies on the already-firing
global channel for the *user* surface (this is "the project's existing
error channel for analysis failures — match how the codebase already
surfaces proxy errors; do not invent a new channel"), and adds a
**developer**-surface `console.warn` at the narrowing (ADR-0002 loudness
level 5) so the cast-site event is self-evident in the console without a
reader needing to know the global path fired. Loud surfacing is
satisfied; the error is not silently dropped.

This is the one place the `awaitFinalPacket` precedent does **not**
transfer verbatim: that helper surfaces locally because its private
`KataGoClient`'s post-open `onError` is inert (guarded by `opened`), so
the global path does not fire there. The singleton's global `onError`
*is* live, so re-emitting locally would duplicate. The detector pass
below caught this; the design was adjusted before implementation.

### Cleanup — the single complete release verb

`stopQuery(queryId)` is the one verb that releases the full query
lifecycle: it detaches the subscription, sends a best-effort wire
`terminate`, and clears `activeQueries`, `activeSubscriptions`,
`restartCallbacks`, `boardToQueries`, and the telemetry entry. The
release sites enumerated independently (hack-detector Step 2):
`stopQuery` (full release), `onAnalysisUpdate`'s reap (partial —
`restartCallbacks` only, a natural-completion marker, not a cleanup),
`stopBoardAnalysis` (routes per-query release *through* `stopQuery`),
the disconnect sweep (telemetry only, closure maps survive per O15). So
`stopQuery` is correctly the single full-release verb; the narrowing
discharges through it rather than re-implementing per-map cleanup
inline. The proxy already errored this query, so the `terminate` is
redundant-but-benign (fire-and-forget, void). Deleting this query's sole
subscriber mid-`forEach` in the client is safe (Set iteration tolerates
deletion of the current element); `stopQuery` early-returns on an
already-gone id (idempotent).

## i18n

None. The fix reuses the existing global error channel
(`pushSystemMessage('error', <raw proxy error string>)`); no new key was
added, and the developer surface is a `console.warn`, not a translated
user message.

## Resource-ownership checklist walk (frontend/CLAUDE.md)

The change adds a *release* at a new trigger (an error packet on an
analysis subscription), not a new owned resource. Walking the checklist:

1. **What external state is keyed by the query's id?** The five
   per-query slots (`activeQueries`, `activeSubscriptions`,
   `restartCallbacks`, `boardToQueries`, telemetry) — all released by
   `stopQuery`.
2. **What if the boundary returned without releasing?** Exactly the
   recorded bug: a leaked subscription + bookkeeping entry, plus
   corrupted telemetry and a false warning. Bounded per error packet,
   but real and user-visible.
3. **Fix / document / defer?** **Fix** — wired at the mutation site
   (the narrowing) through the single release verb.
4. **Inline-comment convention.** The method's docstring names the
   resource (the five slots), the failure mode (the corruption path),
   the no-double-toast decision, and the work-status item slug. No bare
   counts in prose.

## Verification

- `npm run build` green (`vue-tsc -b && vite build`, 1058 modules). The
  `'error' in res` discriminator narrows `KataGoResponse` under
  `vue-tsc`; the post-probe `as KataAnalysisResponse` carries its
  justification comment (lint-enforced).
- `npx eslint .` exit 0.
- `npm run test:run` — 983 passed | 4 skipped, including the new
  `tests/integration/analysis-service-error-packet-narrowing.test.ts`
  (5 tests): loud surfacing via the system log; no telemetry
  `turnsCompleted` corruption (range query — the surviving-row-with-
  count-1 bug signature vs the clean-release fixed signature); no false
  ponder-exhausted warning; no leaked bookkeeping (`isPondering` false
  after, exactly one `terminate`, no resurrection on
  `restartActiveAnalyses`, second packet not re-routed); and a
  genuine-final control proving the narrowing is variant-correct, not a
  blanket drop.
- **Guard liveness confirmed** (tests/CLAUDE.md: a guard that cannot
  fail is worse than none): temporarily reverting the narrowing to the
  buggy cast turned 3 of the 5 tests red (telemetry, false-warning,
  leaked-bookkeeping); the 2 that stayed green are the loud-surfacing
  test (the global `onError` fires in both states — correct) and the
  genuine-final control (unaffected by the bug). The fix was restored
  and re-verified after.

The test harness drives the REAL `analysisService` against a mock
`WebSocket` (the same shape as the sibling
`analysis-service-restart-thunk.test.ts`), so an injected error packet
exercises the real `KataGoClient`'s global `onError` AND the per-query
narrowing — the production path, not a stub of it. Fake-fidelity: the
injected packet is the faithful `KataErrorResponse` wire shape
(`{id, error}`, no `rootInfo`/`isDuringSearch`) — the absence the bug
misread.

## Hack-rationalization pass (out-of-frame, scripts-led)

Run via the `hack-rationalization-detector` skill on the proposed-fix
*design* before implementation (so the design could be adjusted rather
than rationalized after the fact). Verdict **general**: the fix is one
invariant quantifying over both cast sites and every non-analysis
variant the union admits, applied at the full predicate population (both
sites), discharging cleanup through the single complete release verb.
The pass's load-bearing finding shaped the design: the global `onError`
already surfaces the user-facing error, so the narrowing must NOT add a
second toast — it owns cleanup and a developer-surface `console.warn`,
and relies on the live global channel for the user surface. Full
artifact preserved in the appendix.

## Deferrals

- **The global handler's missing early-return** in
  `katago-client.ts::handleIncomingMessage` (it surfaces an error packet
  via `onError` and then falls through to the per-id subscriber) is the
  structural reason an error packet reaches an analysis subscriber at
  all. A `return` after surfacing would stop it at the source — but
  `sendCommand` (the one-shot action path) *relies* on receiving the
  error packet through its own ephemeral subscription to resolve its
  promise (`sendCommand` resolves on any `res`, including errors), so a
  blanket early-return would break action-command error resolution. The
  subscribe-site narrowing fully closes the corruption path regardless,
  and the global-handler reshape is a separate, broader-blast-radius
  consideration with that `sendCommand` interaction to design around.
  not-filed: not a known defect (the corruption path is closed by this
  PR); a maintainer judgment whether the global handler's fall-through
  is worth its own item given the `sendCommand` coupling.

## Documentation touched

- This worklog (`docs/worklog/2026-06-11-analysis-subscribe-union-narrowing.md`).
- Doc-graph regenerated (`docs/doc-graph.json` + `docs/doc-graph.md` +
  `docs/doc-graph-report.md`) per the structural-doc discipline (a new
  worklog is a graph node).
- **No FILES.md row**: the only new file is a test under `tests/`;
  FILES.md tracks `src/` only.
- **No IDENTIFIERS.md row**: no new branded id, no moved construction
  site (`asQueryId` is unchanged; the `QueryId` row's generic
  "analysis-service bookkeeping maps" reference still holds).
- **No FEATURES.md entry**: this is a bug fix that preserves
  user-facing behaviour (an analysis failure already surfaced via the
  system log; the fix stops it corrupting telemetry/bookkeeping). A Go
  player reading the tour would not misunderstand the offering without
  it.
- No ADR amendment: a concrete application of ADR-0002 Rule 4, not a
  change to the tenet.

## Appendix — hack-rationalization artifact (verbatim)

```
## Hack-rationalization review: analysis-subscribe-union-narrowing (proposed-fix design)

FRAME CHECK: Out-of-frame. I did not produce the change; it is an as-yet-unimplemented design. I treated the proposed-fix justification as the object of suspicion, ran both deterministic scripts, and hand-enumerated the map mutation sites.

GENERAL FIX:   At the subscribe-callback trust boundary, discriminate the wire union before treating it as the analysis variant — an analysis subscription's callback feeds onAnalysisUpdate ONLY a KataAnalysisResponse; any non-analysis variant (error today; an action response if one were ever id-collided) is surfaced through the existing error channel and the query's lifecycle is released through the single release verb (stopQuery), never coerced.
PATCH SHIPPED: (proposed) Replace `res as KataAnalysisResponse` at :714 and :915 with a narrowing: if `'error' in res`, surface loudly and stopQuery(queryId), then return; otherwise pass to onAnalysisUpdate.
DOWNGRADE:     None taken under a discipline-word. The patch IS the general invariant — it is applied at BOTH cast sites (the full predicate population, not one instance), and it discharges the boundary via the one complete release verb rather than re-implementing per-map cleanup inline.
WRITER DELTA:  claimed "stopQuery is the single complete cleanup verb" vs enumerated — CONFIRMED, with one nuance. Release/marker sites on the query-lifecycle maps: stopQuery (deletes activeQueries+activeSubscriptions+restartCallbacks+boardToQueries+telemetry — the ONLY complete release); onAnalysisUpdate's reap (deletes restartCallbacks ONLY — a partial natural-completion marker, NOT a cleanup); stopBoardAnalysis (deletes boardToQueries, but routes per-query release THROUGH stopQuery); disconnect sweep (telemetry only, deliberately leaving closure maps per O15). So stopQuery is correctly the single full-release verb. (writers: stopQuery [full], onAnalysisUpdate-reap [partial: restartCallbacks], stopBoardAnalysis [delegates to stopQuery], disconnect-sweep [telemetry only])
RUNTIME:       Unverified — design-stage. The corruption trace was confirmed by static reading of recordPacket (isDuringSearch=undefined → turnsCompleted++ → auto-delete) and onAnalysisUpdate (ponder-ceiling + reap both gate on `!response.isDuringSearch`, true for undefined). A failing-then-passing integration test against the MockWebSocket harness is required before "fixed".

TELLS (Step 1): No co-occurrence tells. 0 minimality-terms, 2 named-fix cues ("We could instead", "the general case"-shaped), never adjacent to a downgrade. The justification openly poses the two design questions rather than resolving them with a discipline-word.

VERDICT: general

WHY: The fix is statable as one invariant that quantifies over both cast sites and over every non-analysis variant the union admits, and it is applied at the full predicate population (both sites), not the two named instances. The cleanup discharges through the single complete release verb, so it does not become a per-map enumeration that a future map addition would reopen.

FINDINGS BEYOND VERDICT (required):
  - ON QUESTION (a) — DOUBLE-SURFACE IS REAL, AND IT IS THE RIGHT CALL TO NOT ADD A SECOND TOAST. The global onError path in katago-client.ts::handleIncomingMessage fires `callbacks.onError(response.error)` → `pushSystemMessage('error', errorMsg)` for EVERY error packet, BEFORE and INDEPENDENT of subscriber dispatch. If the narrowing ALSO calls pushSystemMessage('error', ...) with the same string, the user sees the error twice. The precedent (awaitFinalPacket) surfaces locally ONLY because its private KataGoClient's post-open onError is inert (guarded by `opened`), so the global path does NOT fire there — that precedent does NOT transfer to the singleton, whose global onError IS live. Recommendation: at the narrowing, do the BOOKKEEPING CLEANUP (stopQuery) and rely on the already-firing global onError for the loud user surface; do NOT emit a second pushSystemMessage. Loud surfacing is satisfied — it is not "silently dropped", the global channel carries it. If you want the cast site to be self-evidently loud without depending on the non-local global path, the honest move is a DEV-level console.warn at the narrowing naming the misrouted-error event (developer surface, level 5), NOT a second user toast (level 4) — that adds developer visibility without duplicating the user-facing error. This keeps a single user-surface writer for the error string (the global onError), which is itself the fail-loud-without-duplication posture.
  - ON QUESTION (b) — YES, rely on the global path for the USER surface; the narrowing owns CLEANUP. This is the non-duplicating split and it matches where each concern already lives.
  - ON QUESTION (c) — stopQuery IS the correct single verb, BUT VERIFY ITS IDEMPOTENCE/ORDER ASSUMPTIONS HOLD WHEN CALLED FROM THE CALLBACK. stopQuery early-returns if queryId not in activeQueries (idempotent), calls the unsub (which removes THIS subscription from KataGoClient.subscribers), and sends a wire `terminate`. Calling it from INSIDE the subscriber callback means the unsub runs while handleIncomingMessage is mid-iteration over `callbacks.forEach(cb => cb(response))` — deleting from the Set being forEach'd. Confirm this does not skip/throw: JS Set.forEach tolerates deletion of the current element mid-iteration, and there is one callback per analysis query id, so this is safe — but it MUST be confirmed in the test, not assumed. Also: sending a wire `terminate` for a query the proxy ALREADY errored on is benign (best-effort, void) but worth a one-line comment so a reader doesn't read it as a bug.
  - DISCRIMINATOR ROBUSTNESS. The union is discriminated by FIELD PRESENCE (`'error' in res`), matching both the type contract (KataErrorResponse is the only variant with `error`) and the existing katago-client global check and the awaitFinalPacket precedent. Use the SAME `'error' in res` probe for consistency across the three sites. Do NOT invent a new discriminator (e.g. checking for absence of rootInfo) — that would be a fourth, divergent narrowing shape. One probe shape, three sites.
  - LATENT SIBLING, NOT IN SCOPE, NAME IT: the katago-client global handler's MISSING early-return after onError (it falls through to subscriber dispatch) is the structural reason the error packet reaches the subscriber AT ALL. The clean general fix at THAT layer would be to `return` after surfacing an error packet so it never reaches a per-id subscriber. That is a katago-client.ts change with broad blast radius (every subscriber, sendCommand's one-shot path which RELIES on receiving the error to resolve — see sendCommand at :135-142 which resolves on ANY res including errors). So the global early-return is NOT a safe drop-in (it would break sendCommand's error resolution). The subscribe-site narrowing is therefore the correctly-scoped fix, and the global-handler shape is a SEPARATE consideration — if filed, file it as its own item with the sendCommand interaction noted; do not fold it in here. not-filed unless the maintainer wants it tracked: the subscribe-site narrowing fully closes the corruption path regardless of the global handler's fall-through.
```
