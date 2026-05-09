# Review-session per-move deltas — diagnosis and fix

## The bug

The frontend's review session and the analysis tab both consume per-move
quality deltas from KataProxy, but the analysis tab worked and the review
session was silently recording `0.5` for many user-moves, corrupting Ebisu
recall updates.

The two read paths diverged on packet scope:

- **Analysis tab** (`useEnrichedData.ts:92-122`) iterates every node on the
  active path, calls `ledger.getRaw(activeConfigHash, nodeId)` for each,
  and harvests `packet.extra.{black,white}.deltas` from every packet.
  Whichever packet the proxy attached a given delta key to, this loop
  finds it.

- **Review session** (pre-fix `useReviewSession.ts:340-394`) read ONLY
  the `s_1` packet returned by `waitForAnalysis(hash, s_1_id, s_1_idx)`.
  When the proxy attached the delta to a different packet — most often
  `s_0`, since the engine evaluates "moves from THIS position" so the
  score belongs to the pre-move packet — the review session missed it
  and silently substituted `0.5`.

## The fix

Two changes in `useReviewSession.processUserMove`:

1. **Path-scan delta lookup**. Mirror the analysis-tab pattern: after
   `waitForAnalysis(s_1)` resolves, scan every packet on the active path
   for `extra[colorKey].deltas[n]`. The fast-path checks the in-hand
   `s_1_packet` first; the ledger scan covers `s_0` and any other
   packet on the analyzed range.

2. **Loud failure on residue**. If the path-scan still finds nothing,
   surface a system-message warning (`review.missingPerMoveDelta`,
   added to the four locale catalogs) and reset the session to IDLE.
   The prior `let delta = 0.5` silent fallback violated ADR-0002 — it
   scored every contract failure as a "neutral" review and corrupted
   the Ebisu update on every occurrence.

Integration coverage: `tests/integration/useReviewSession.test.ts`
pins three branches — happy path (s_1 carries delta), path-scan
(s_0 carries delta, s_1 empty), loud failure (no packet carries
the delta).

## The fuzzing harness

`tests/e2e/review-session-harness.test.ts` drives the real composable
against a real backend and two real KataProxies, scoring each
user-move under the flat `visit_ratio` palette so deltas are directly
interpretable against the analysis tab's `moveInfos` overlay.

Two scenarios per run: position generated to depth 20 (B-to-move) and
21 (W-to-move) via engine self-play. The harness asserts that every
recorded `userMoveScore` matches the score independently computed
from the captured pre-move packet to 6 decimals.

The shared engine-self-play primitive lives in
`src/composables/usePlayFromPosition.ts` with two consumers:

- The Vue composable `usePlayFromPosition(boardIdRef)` for product UI
  use ("play from this position" affordance).
- The pure async functions `playEngineMoves` / `queryEngineMove`,
  which the harness invokes directly without store coupling.

### Running

Both env vars must be set; without them the harness skips and a
normal `npm run test:run` is unaffected:

```
REVIEW_E2E_STRONG=ws://192.168.122.1:1234 \
REVIEW_E2E_WEAK=ws://192.168.122.1:1235 \
  npm run test:run -- tests/e2e
```

The backend URL comes from `.env.local`'s `VITE_API_BASE_URL` (the
LAN-bound dev server, not loopback).

### Environment

The harness file pragmas `// @vitest-environment node`. jsdom's
WebSocket wrapper has a defect under Vitest — it wraps undici and
re-dispatches `open` via `setTimeout(() => fireAnEvent("open"), 0)`,
but the IDL `onopen` handler set via `ws.onopen = fn` never fires
(only `addEventListener` does). `KataGoClient.connect` uses the IDL
property, so under jsdom the connection promise never resolves.
Node 24's native WebSocket dispatches IDL handlers correctly.

`tests/setup.ts` conditionally polyfills `window` (aliased to
`globalThis`) and `localStorage` when the host environment lacks
them, so production code using `window.setTimeout` and the
api-client's JWT storage work under node-env without patches.
