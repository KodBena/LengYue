# Worklog — `clear_cache` dev affordance (2026-05-29)

A DEV-gated toolbar button to clear the KataGo engine cache, for
cold-cache control during perf benchmarking (the RB-3 "before" anchor and
any future capture). Came up enough times to warrant a first-class
affordance rather than ad-hoc cache juggling.

## Change

- **`analysisService.clearCache()`** — sends the `clear_cache` action
  (`{ id, action: 'clear_cache' }`), awaits the ack, and surfaces the
  result as a system message (ADR-0002 on the wire response).
- **`useEngineControls.clearCache`** — the UI's contract point (the
  Toolbar never touches `analysisService` / `store.engine` directly).
- **Toolbar button** — DEV-gated (`import.meta.env.DEV`, dead-code-
  eliminated in prod), beside connect/disconnect, disabled while
  disconnected, no confirm dialog.

## Proxy verification (cross-boundary scout, Opus, read-only)

Before trusting cold-cache captures to this, an Opus scout verified the
proxy (checked out at **v1.0.27**, commit `b871127` — note the umbrella
prose still says v1.0.21) actually honors `clear_cache`:

- **YES — forwarded correctly through SELECTOR** (broadcasts to every
  *healthy* upstream — `router.py:2162-2176`; the v1.0.18 broadcast fix is
  intact), **RELAY** (all connected upstreams), and **LEAF** (the single
  engine). ECHO is a no-op (test role). `clear_cache` is never coalesced,
  never answered from the proxy's cache, never dropped by id-translation.
- Covered by `tests/test_selector_router.py::test_clear_cache_broadcasts_to_all_healthy`
  and the RELAY analog (53 router tests pass on v1.0.27). No frontend→proxy
  dispatch warranted.

## Caveat (load-bearing for cold-cache measurement)

`clear_cache` clears the **upstream engine** NN/search cache, NOT the
proxy's own analysis **replay** cache. If a later query sends
`lookup_cache: true`, the proxy can replay a stored stream and never reach
the now-cold engine — defeating a cold measurement. So:

- the button's success message **warns when `lookup_cache` is on**;
- for a true cold-cache capture, keep `lookup_cache` off (the default) or
  restart the proxy.

This belongs in the perf-capture-normalization protocol
(`docs/notes/perf-capture-normalization-protocol.md`) too — fold it in.

## Verification

- `npm run build` clean; `npm run test:run` 746 passed / 3 skipped.
- DEV-gated → no production surface, so no `FEATURES.md` entry (the tour
  describes user-facing prod capabilities, not dev affordances).

License: Public Domain (The Unlicense).
