# Proxy → Frontend: Status — keep-alive dispatch shipped (Phases 1–3 + diagnostics)

- **Date:** 2026-05-03
- **From:** proxy (KataProxy submodule)
- **To:** frontend (umbrella session)
- **Type:** status — closes the three-phase request from
  `docs/dispatch/frontend-to-proxy-keep-alive-middleware.md`
- **Status:** all three phases shipped on the proxy side. Umbrella's
  submodule pin bumped from v1.0.6 → v1.0.11 in this PR.
- **Suggested filing:** `docs/dispatch/proxy-to-frontend-keep-alive-middleware-status.md`
  per ADR-0005's dispatch ledger convention.

## TL;DR

The keep-alive dispatch's three-phase fix is shipped on the proxy
side, plus a fast-running diagnostic suite per phase that doesn't
require a KataGo subprocess. The umbrella's submodule pointer is
bumped to v1.0.11 in this PR. The frontend's HMR cleanup item
(`docs/TODO.md` Trivial-tier, marked priority) remains open and
complementary — the proxy now provides the production safety net
for stranded compute, but the frontend cleanup is the dev-loop
hygiene improvement that closes the cleanest path.

## What shipped

Five proxy releases land in this bump (v1.0.6 → v1.0.11). Each tag
on the proxy side carries the full annotated changelog; this is
the umbrella-side summary.

| Tag    | Source PR | Phase / scope |
|--------|-----------|----------------|
| v1.0.7 | KataProxy#10 | **Phase 1** — Hub-level orphan-canonical cleanup. `PubSubHub.unsubscribe` returns `bool` to signal whether the call emptied the subscriber list; `ClientSession._cleanup` consumes the signal and dispatches `router.terminate` on orphaned canonicals. The disconnect-side gap is closed. |
| v1.0.8 | KataProxy#11 | **Phase 2** — Coalescing-transparent explicit terminate. `_handle_terminate` becomes the second consumer of the `was_last` contract; multi-subscriber terminate synthesizes the ack instead of terminating the LEAF, restoring the coalescing-isolation guarantee. |
| v1.0.9 | KataProxy#12 | Synthetic backend test infrastructure. `SyntheticPonderingRouter` (mock LeafRouter) + `tests/diagnose_phase1.py` scenario reproduction, enabling KataGo-free integration testing. |
| v1.0.10 | KataProxy#13 | **Phase 3** — `SessionMiddleware` lifecycle hooks (`on_session_start` / `on_session_end`) + `SessionCapabilities` (adds `terminate_query`) + the `KeepAliveMiddleware` itself. Catches the WS-stays-open-but-silent case `_cleanup` cannot. |
| v1.0.11 | KataProxy#14 | `tests/diagnose_phase2.py` — completes the per-phase diagnostic suite. |

## Configuration the frontend may want to know about

The keep-alive watchdog has one operator dial:

```
KEEP_ALIVE_IDLE_TIMEOUT_SECONDS  (default 25.0)
```

Set in the proxy's environment. 25s is 5× the frontend's existing
5000ms `query_version` watchdog cadence (per `analysis-service.ts:88`
as cited in the original dispatch). Generous enough to absorb network
jitter and one missed beat without false positives, tight enough to
bound cost on a stranded ponder. Setting `<=0` disables keep-alive
entirely; the middleware factory then degrades gracefully to bare
`adaptive_reevaluate`.

For development with very low timeouts (e.g. 3s) the frontend's
heartbeat cadence may need to be lowered correspondingly to avoid
false-positive terminations. Per the original dispatch's testing
plan, this is a single-line edit in `analysis-service.ts:88` —
revert before commit.

## Verification approach

Each phase has a fast-running, KataGo-free regression scenario in
the proxy's `tests/` directory:

| Diagnostic | Verifies | Phase |
|---|---|---|
| `tests/diagnose_phase1.py` | Hub orphan-cleanup via `was_last` (two coalesced subscribers, both disconnect, exactly one terminate fires) | Phase 1 (v1.0.7) |
| `tests/diagnose_phase2.py` | Coalescing-transparent terminate (A's terminate stays local with synthesized ack, B's stream continues, B's later terminate fires LEAF terminate) | Phase 2 (v1.0.8) |
| `tests/diagnose_phase3.py` | Keep-alive watchdog terminates a stranded ANALYZE query when no heartbeat arrives within the idle timeout | Phase 3 (v1.0.10) |

All three reuse the v1.0.9 `SyntheticPonderingRouter`. All three run
in under one second. From the proxy directory, with the proxy's venv
active:

```bash
python -m tests.diagnose_phase1
python -m tests.diagnose_phase2
python -m tests.diagnose_phase3
```

Exit code 0 on PASS, 1 on FAIL.

## Lesson learned — verification instructions

A worthwhile correction landed during the SPA-driven verification
of Phase 1 that's worth surfacing back: in this SPA, **closing a
browser tab is not equivalent to a process-level disconnect**. The
frontend has known HMR-orphaned WebSocket and `import.meta.hot.dispose`
gaps (named in the original dispatch's "Why" section) that can keep
WebSockets alive on the proxy side after the user closes a tab.

Phase 1's PR test plan said "close the browser tab cleanly" — that
was an underspecified instruction. The actual process-level
verification needs "close the entire browser" or otherwise kill the
process holding the WS. The synthetic-backend diagnostics bypass the
SPA entirely and so are the load-bearing verification for the
proxy-side contracts; SPA-driven testing remains useful as an
end-to-end check but is now secondary.

A near-miss came of this confusion (the SPA appeared to indicate the
proxy hadn't fixed the bug; further investigation showed the proxy
was correct and the SPA's HMR-orphan path was masking the disconnect).
The proxy-side narrative of that near-miss is filed at
`docs/dispatch/proxy-to-proxy-id-translation-near-miss.md`.

## Residual frontend work

The frontend's TODO Trivial-tier "HMR cleanup for `analysisService`
singleton — **priority**" entry remains open and complementary to
the proxy-side work. The original dispatch's framing was that the
two are complementary, not substitutes:

- **Proxy keep-alive middleware** is the production-side safety net
  for stranded queries from any cause (HMR, network freeze, browser
  crash, controlled disconnect with WS still nominally open). Now
  shipped.
- **Frontend HMR cleanup** is the dev-loop hygiene improvement that
  closes the cleanest path (no need to wait for the watchdog). Still
  open; should ship.

The TODO entry's framing has been updated in this PR to acknowledge
that the proxy safety net now exists.

## Cross-cutting: the wider asymmetry the dispatch flagged

The original dispatch noted a pre-existing asymmetry in the
SessionMiddleware contract: queries injected by other middleware
(via `submit_query`) bypass `_handle_incoming` and so are invisible
to other middleware's `on_query`. The dispatch flagged this as
out-of-scope for the keep-alive work. It remains out-of-scope, and
remains a candidate for a separate proxy-side ticket. The
straightforward fix — call `self._middleware.on_query(orig_id, query)`
at the top of `_handle_query` so injected queries fan out to all
middleware — has a small blast radius, but it's a behaviour change
and warrants its own review.

`KeepAliveMiddleware`'s module docstring documents this asymmetry as
a known limitation.

## Coordination

This PR bumps the umbrella's submodule pointer from v1.0.6 → v1.0.11
and files this status dispatch. No other umbrella-side code change
is required to receive the proxy's keep-alive feature; the operator
opt-in is via `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS` in the proxy's
environment.

The `docs/CLAUDE.md` "current pin is v1.0.6" reference and the
TODO HMR-cleanup entry's framing have been refreshed in the same
commit. `docs/handoff-current.md` has no proxy-version reference
that needed updating.

— end status —
