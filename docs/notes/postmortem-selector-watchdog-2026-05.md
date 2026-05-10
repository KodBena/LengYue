# Postmortem: SELECTOR watchdog spurious termination

- **Date authored:** 2026-05-10
- **Discovered:** 2026-05-10 (user, in a SELECTOR-stack deployment with
  two LEAFs, while pressing Analyze Range on the non-first model)
- **Severity:** medium — single-LEAF deployments unaffected; multi-LEAF
  SELECTOR deployments lose any `analyze` whose chosen `model` is not
  the SELECTOR's `_first_healthy_label`, after ~25s of in-flight time
- **Root cause class:** implicit-contract drift between subsystems
  introduced at different times — the keep-alive `SessionMiddleware`
  (proxy v1.0.9, single-LEAF assumption) vs. the SELECTOR
  `BackendRouter` (proxy v1.0.15, multi-LEAF deployment topology)
- **Closed by:** proxy broadcast fix (forthcoming v1.0.18); regression
  test `tests/diagnose_watchdog_selector.py`; frontend dropdown
  grey-out for non-responding LEAFs

## Summary

In a SELECTOR-stack deployment with two LEAFs, the SPA's analyze-range
on the non-first model was being silently terminated by a downstream
LEAF's keep-alive watchdog after ~25 seconds. The proximate fix that
shipped in proxy v1.0.17 (`KEEP_ALIVE_IDLE_TIMEOUT_SECONDS` 25s →
250s) was a band-aid: it widened the window in which the failure
mode hides, without addressing the cause. The cause was that
`SelectorRouter.dispatch` routes `QUERY_VERSION` to
`_first_healthy_label()` only — so the SPA's heartbeats reach exactly
one LEAF, while `analyze` queries are routed to LEAFs by `model`.
Heartbeats and analyses thus dispatch to *different* LEAFs whenever
the user picks a model that isn't the first configured one. The LEAF
running the analyze never sees a heartbeat, its
`KeepAliveMiddleware` fires after `idle_timeout`, and the in-flight
query is terminated.

The symptom presented to the SPA as a 30-second `waitForAnalysis`
expiry on a query that should have completed in multi-minute time.

## Timeline (the failing exercise from `~/error`)

The user ran `python frontend/scripts/run-selector-stack.py --host
192.168.122.1 1235 …/really_weak.txt.gz …/2026_02.bin.gz`, opened the
SPA, and pressed Analyze Range while the active model was `2026_02`.
LEAF processes `pid=2456670` (label `really_weak`, started first by
the runner) and `pid=2456669` (label `2026_02`) were both running.

| Wall time | Event                                             | KataGo PID    |
| --------- | ------------------------------------------------- | ------------- |
| 19:35:32  | `analyze` on `model=really_weak` dispatched       | **2456670**   |
| 19:35:34/39/44/49 | heartbeats (×4)                           | **2456670**   |
| 19:35:?? | first analyze completes; SPA fires `terminate`     | (already done) |
| 19:35:51  | `analyze` on `model=2026_02` dispatched           | **2456669**   |
| 19:35:54/59/36:04 | heartbeats (×3)                           | **2456670** ← wrong LEAF |
| 19:36:08  | `keep-alive timeout: idle=25.0s` → terminate      | **2456669**   |

The 17-second elapsed time between "analyze dispatched" and "watchdog
fired" is consistent with `KeepAliveMiddleware`'s
`if not stranded: self._last_heartbeat = monotonic()` self-reset
branch (`keep_alive.py:170-173`), which fires every
`idle_timeout + check_interval` (~30s) when `_in_flight` is empty —
the most recent self-reset on LEAF 2456669 occurred at ~19:35:43,
just before the analyze arrived; from that point `_in_flight` was
non-empty so the self-reset branch could not fire, and the watchdog
fired ~25s later.

## What the band-aid did

Proxy commit `cfb976a` (2026-05-10) bumped
`KEEP_ALIVE_IDLE_TIMEOUT_SECONDS` from 25 to 250. The commit message
attributed the symptom to "heartbeats and analyses interleave in
ways that don't keep last_heartbeat fresh enough for a 25s window"
and noted the original 25s default was framed as "5x the frontend's
5000ms `query_version` cadence" — implying that the heartbeat was
indeed reaching the same `KeepAliveMiddleware` instance and merely
missing reset deadlines under load.

The first part of that framing (heartbeats reaching the relevant
KeepAlive) was unsupported. The mechanism was misdiagnosed; the
symptom was right but the cause attribution was wrong. The bump to
250s widened the watchdog window enough that most range queries on
the non-first model complete before the watchdog fires, but the
underlying split in routing remains. Long range queries on slow
networks (the 2026_02 case in `~/error`) still hit the failure mode
at 250s.

## Root cause

`proxy/router.py:1593-1626` (`SelectorRouter.dispatch`):

```python
if action in (
    KataGoAction.QUERY_VERSION,
    KataGoAction.CLEAR_CACHE,
    KataGoAction.TERMINATE_ALL,
):
    label = self._first_healthy_label()
    …
    await self._forward(canonical_id, wire_dict, query, label, …)
    return
```

This routes every `query_version` (the SPA's keep-alive heartbeat)
to a single LEAF. `analyze` is routed by `query.opaque['model']` to
the labelled LEAF. When the user's selected model is not the
SELECTOR's first-healthy label, the analyze and the heartbeat land
on different LEAFs.

Each LEAF runs its own `ClientSession` (the SELECTOR is the LEAF's
WebSocket client) and therefore its own `KeepAliveMiddleware`. The
LEAF without heartbeats has its `_last_heartbeat` reset only by the
empty-`_in_flight` self-reset branch — which stops resetting the
moment a query lands. That LEAF then fires its watchdog after
`idle_timeout` and terminates the in-flight query.

## The two implicit contracts that broke when SELECTOR was introduced

This is the part of the postmortem that matters most for preventing
similar regressions.

**Contract A — the keep-alive heartbeat reaches every
`KeepAliveMiddleware` that has `_in_flight` queries.** This was
implicit in the original keep-alive design
(`docs/archive/dispatch/frontend-to-proxy-keep-alive-middleware.md`,
2026-05-03). The dispatch reasoned per `ClientSession`: "the SPA's
heartbeat resets `last_heartbeat`; that heartbeat is the SPA→proxy
WebSocket frame, observed via `on_query` at the SessionMiddleware
layer." Correct for LEAF, RELAY, ECHO — proxies that present a
single backend-facing surface to the SPA. Under SELECTOR, the SPA's
single WebSocket fans out across N independent backend-facing
`ClientSession`s (one per LEAF connection from the SELECTOR), each
with its own `KeepAliveMiddleware`. Contract A then holds *only* if
the SELECTOR routes heartbeats to all such sessions. The SELECTOR
implementation routed them to one.

**Contract B — multi-upstream actions have well-defined fanout
semantics.** The dispatch matrix in `SelectorRouter` documents
`QUERY_VERSION`, `CLEAR_CACHE`, and `TERMINATE_ALL` as
"forwarded to first healthy upstream", with a comment that broadcast
semantics for `CLEAR_CACHE` / `TERMINATE_ALL` are deferred per the
SELECTOR roadmap. The deferral is reasonable for those two — they
have a clear product question (cache-and-terminate-all-models or
just-this-one?) the MVP wasn't going to resolve. But the same
treatment was extended to `QUERY_VERSION` as if the same trade-off
applied. `QUERY_VERSION`'s observable purpose at the SELECTOR layer
is metadata enrichment (the `capabilities_advertiser` Transformer
needs a `MetadataResponse` with a `version` key to enrich), and
"first healthy upstream" satisfies that purpose — but its
*unobservable* purpose, by virtue of being the wire shape
`KeepAliveMiddleware._is_query_version` recognises, is to keep
every downstream LEAF's watchdog fresh. The single-LEAF routing
violates that latter purpose silently.

The two contracts are fail-loudly disposed when stated explicitly,
but neither was stated. The keep-alive design predated SELECTOR; the
SELECTOR design did not audit the keep-alive's implicit fanout
assumptions.

## Why the existing tests didn't catch it

- **`tests/diagnose_phase3.py`** exercises a *bare*
  `KeepAliveMiddleware` with one synthetic LEAF and no SELECTOR — a
  topology where the bug cannot manifest. Designed for the original
  v1.0.9 dispatch.

- **`tests/diagnose_watchdog.py`** (added in the prior session)
  exercises the full middleware chain
  (`KeepAliveMiddleware` → `CapabilityGatedMiddleware` →
  `OrchestrationMiddleware`) with a single synthetic LEAF and
  validates the heartbeat-quiets-watchdog contract end-to-end
  through the chain. It catches middleware-composition regressions —
  but its single-LEAF topology means it doesn't model the deployment
  shape where the bug lives.

- **`tests/test_selector_router.py`** has explicit tests
  (`test_query_version_forwarded_to_first_healthy`,
  `test_clear_cache_routed_to_first_healthy`,
  `test_first_healthy_skips_unhealthy`) that pin the *current
  behaviour* — they enshrined the bug rather than the contract. A
  reader auditing only those tests would conclude the dispatch is
  working as designed. **This is the most important
  meta-lesson:** a test whose body matches the implementation
  exactly, without an independent statement of the contract, can pin
  a defect as a feature. Tests that are silent on the implicit
  contract are invisible to regressions of that contract.

The middleware-side regression test from the prior session is still
useful — it catches a different class of regression (chain
composition breaking heartbeat propagation to the outer middleware).
The new fix needs its own topology-aware regression test.

## Latent-bug audit — the same shape elsewhere in `SelectorRouter`

The dispatch matrix at `router.py:1598-1626` covers three actions
with the same first-healthy routing: `QUERY_VERSION`, `CLEAR_CACHE`,
`TERMINATE_ALL`. Each has an implicit fanout contract that's silently
broken under the current implementation:

- **`QUERY_VERSION`** — the active bug above (heartbeat fanout).

- **`TERMINATE_ALL`** — the SPA's expectation is "cancel every
  in-flight query on this session". Under SELECTOR, only queries
  routed to `_first_healthy_label()` are cancelled; queries on other
  LEAFs continue to consume GPU and emit responses for an SPA that
  has cancelled its UI. The SPA may currently not exercise
  `TERMINATE_ALL` (frontend uses per-query `terminate` instead — a
  spot-check in `analysis-service.ts::stopBoardAnalysis` confirms
  per-query semantics), so the bug is latent rather than active. If
  any future SPA flow uses `TERMINATE_ALL`, the bug becomes active
  immediately.

- **`CLEAR_CACHE`** — KataGo's analysis cache is per-LEAF (each LEAF
  is a separate KataGo subprocess). `CLEAR_CACHE` to one LEAF leaves
  N-1 LEAFs with stale caches. Whether this is a bug depends on the
  SPA's `CLEAR_CACHE` semantics — if the SPA expects the post-clear
  invariant to hold across all models, this is broken; if it only
  cares about the active model, this is fine for now and broken
  later. The SPA exposes a "clear cache" action via the registry
  editor; whether it's per-model or global needs a product call.

All three share the common cause: the SELECTOR's MVP took "first
healthy" as the universal default and named the deferral in a way
that obscured the differing implicit contracts behind it.

## Latent-bug audit — `RelayRouter` shares the same root cause

Surfaced during the v1.0.18 fix walk-through; recorded here because
it has the same root cause and is the next-most-likely topology to
hit it.

`RelayRouter.dispatch` (`router.py:1055-1073`) routes every action
through `_select_upstream(canonical_id)` — a hash-ring lookup keyed
by the canonical_id. `QUERY_VERSION` queries with the same content
hash to the same upstream consistently; `ANALYZE` queries with
different positions hash to (potentially) different upstreams.

The same architectural property as SELECTOR holds: each upstream
LEAF behind the RELAY runs its own `ClientSession` and its own
`KeepAliveMiddleware`. A LEAF that the SPA's heartbeat doesn't hash
to never sees a `query_version` to reset `_last_heartbeat`. Any
ANALYZE the SPA's hash-ring routing happens to land on that LEAF
fires the watchdog after `idle_timeout`. The manifestation is
probabilistic (depends on whether the user's content hashes to the
heartbeat's upstream) where SELECTOR's was deterministic ("first
healthy" was a stable target), so the bug is harder to reproduce
on RELAY but real.

The fix shape is identical: broadcast `QUERY_VERSION` (and likely
`TERMINATE_ALL` and `CLEAR_CACHE`) to every connected upstream;
first response wins. RELAY's `LoadMetric` doesn't apply to broadcast
(it counts in-flight queries per upstream — heartbeats aren't
in-flight in the load sense), so the broadcast path skips the
metric entirely.

This wasn't fixed in the v1.0.18 commit because the user-visible
incident was on a SELECTOR stack and the fix was scoped to that
topology. RELAY needs the same `_broadcast` pattern in a follow-up
arc with corresponding regression tests
(`tests/test_relay_router.py` analog of the SELECTOR contract
tests).

## Why the band-aid was reached for

This is meta but worth recording. The chain of reasoning that
produced the band-aid:

1. Symptom observed: long range queries terminated by watchdog.
2. Hypothesis: the `query_version` cadence is too tight relative to
   the watchdog timeout under realistic interleaving.
3. Cheap fix consistent with hypothesis: bump the timeout.
4. Test that proves the hypothesis was not run (would have required
   a synthetic topology test).

Step 4 is where the failure happened. ADR-0002's loudness hierarchy
governs runtime; it doesn't govern *diagnosis*. A diagnosis taken on
the basis of the cheapest-consistent-explanation, without a
falsifiable test, is itself a silent failure mode at the
methodology layer. The fix would have been small and structural;
the band-aid postponed the structural work and increased the
chance that future SELECTOR work introduces compounding bugs by
"working around" the same opaque heartbeat behaviour.

The general principle: when an issue is fixed by widening a
threshold without changing behaviour, that's a signal the cause
hasn't been identified. The fix should be paired with a test that
falsifies the alternative explanations.

## Corrective actions

1. **Broadcast `QUERY_VERSION`, `TERMINATE_ALL`, `CLEAR_CACHE` to
   every healthy upstream.** First response wins; subsequent
   responses for the same canonical are silently dropped at the
   SELECTOR's `_read_loop` "no callback" branch. Per-upstream send
   failures log and continue rather than aborting the broadcast.
   Lands in `SelectorRouter.dispatch` (`router.py:1593-1626`) +
   a new `_broadcast` helper next to `_forward`. Ships in proxy
   v1.0.18.

2. **Restore `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS` default to 25s.** With
   the broadcast fix in place, the original 25s sizing is
   appropriate again. The 250s band-aid no longer needed; reverting
   it restores the original cost-bound on stranded ponders. The
   sizing comment in `sproxy_config.py` should be updated to
   reference this postmortem.

3. **Add `tests/diagnose_watchdog_selector.py`** modelling the
   deployment topology — one client session connected to a SELECTOR
   with N synthetic LEAFs (each with its own
   `KeepAliveMiddleware`); send heartbeats on the client side;
   assert no LEAF's watchdog fires while heartbeats flow. Must FAIL
   on pre-fix `SelectorRouter` and PASS post-fix.

4. **Replace `test_selector_router.py`'s
   `test_*_forwarded_to_first_healthy` tests** with broadcast-
   semantics tests that pin the contract: heartbeats reach every
   healthy upstream; first response wins; per-upstream send failures
   don't abort. The replaced tests' names and existence are recorded
   here so a future audit doesn't re-derive the lesson.

5. **Document the heartbeat-fanout contract** explicitly in
   `proxy/CLAUDE.md` (or `proxy/FRAMEWORK.md`'s extension-point
   section). The contract: any router that fans out a client
   session's traffic across multiple downstream `ClientSession`s
   (RELAY, SELECTOR, future) is responsible for fanning out
   heartbeats too, so each downstream `KeepAliveMiddleware` keeps
   its `_last_heartbeat` fresh. A new router that misses this fanout
   responsibility silently breaks the keep-alive contract; the
   contract should not stay implicit a second time.

6. **Frontend dropdown: gray out non-responding LEAFs.** Surface
   per-LEAF availability via an extended `query_models` response
   shape (`{models: [{label, healthy}, ...]}` — the existing
   `KataActionResponse.models: readonly unknown[]` accommodates the
   addition without an SPA-side wire-shape change). The Toolbar's
   model dropdown reads `entry.healthy` and grays out unhealthy
   entries with a tooltip naming the failure mode ("advertised but
   currently disconnected" / "advertised but exhausted reconnect
   budget"). This is a quality-of-life improvement layered on top of
   the broadcast fix; it doesn't replace any of the corrective
   actions above.

7. **Process change: a band-aid commit must reference the diagnosis
   it papers over.** When a numerical threshold is widened to fix a
   user-visible regression, the commit message should either name
   the structural cause (and say "the band-aid is sized for the
   structural cause; the structural fix is tracked at <link>") or
   acknowledge "the structural cause has not been identified". This
   makes the un-investigated band-aid loud at audit time. The
   `cfb976a` commit message did neither — it offered a plausible-
   but-wrong mechanism, which closes the audit loop prematurely.

## Closure references

- Postmortem: this document.
- Fix (proxy): forthcoming `SelectorRouter` broadcast change, proxy
  v1.0.18.
- Test (proxy): forthcoming `tests/diagnose_watchdog_selector.py`
  and `test_selector_router.py` revisions, same proxy bump.
- Frontend: dropdown grey-out, separate frontend PR, post-proxy bump.
- Documentation: `proxy/CLAUDE.md` heartbeat-fanout contract update,
  same proxy bump.
- Sibling tests retained: `tests/diagnose_phase3.py` (bare-
  middleware) and `tests/diagnose_watchdog.py` (full chain,
  single-LEAF) remain in place — they cover regressions in different
  layers from the SELECTOR-topology one.

## Addenda (2026-05-10) — factual corrections from the user

Recorded for honesty and historical accuracy.

### Addendum 1 — the implementer warned against the band-aid

The v1.0.17 `cfb976a` commit shipped over an explicit warning from
the implementer (a prior session) that the structural cause had not
been identified and that bumping the timeout was not a fix. The
implementer specifically named broadcast as the alternative
hypothesis to investigate. The user — by their own account, drunk
at the time — directed the implementer to proceed with the bump
anyway. The "broadcast" alternative did not register through the
user's recollection; the band-aid shipped.

The directive was wrong; the diagnosis offered was correct. The
implementer did not push back beyond stating its objection (no
attempt to refuse). Attribution: PEBKAC at the user, "comply with
the user's call after stating concerns" at the implementer.
Recorded so the band-aid pattern in the codebase isn't read as "the
implementer missed the diagnosis" — the implementer flagged it; the
user overrode it; the override is the load-bearing fact. Mea culpa,
let it not be forgotten.

The methodology takeaway in the body's *Why the band-aid was
reached for* section stands, with one refinement: the failure
wasn't the absence of a falsifiable test; it was the user
overriding a stated objection without engaging with the offered
alternative diagnosis. The corrective-action process change (a
band-aid commit must reference the diagnosis it papers over)
applies symmetrically: when an implementer states an objection,
the commit message should record the objection, the user's
override, and the rationale, so the audit trail isn't dependent
on either party's later recollection.

### Addendum 2 — the log was captured with the timeout reverted to 25s

The `~/error` log used in this postmortem's *Timeline* section was
produced on the user's local machine with
`KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=25` restored, *not* with the 250s
production default. The user reverted the timeout specifically to
produce data dense enough for the SELECTOR-stack diagnosis (the
250s window is too wide to reliably trigger the failure on a
fast local network within a single test session).

Implication for the timeline: the 25s figure in the log is the
test-restored value, not the production-shipped one. The bug is
not "watchdog fires under 250s" (that's the v1.0.17 surface
symptom that motivated the band-aid in the first place) but
"watchdog fires under 25s on a SELECTOR stack" — exactly the
structural failure mode the band-aid was sized to hide. Both
framings describe the same bug; the 25s reproduction is just
faster.

Reproduction recipe (post-fix this should not fire; pre-fix
it fires within ~17–25s of pressing Analyze Range on the
non-first model):

```sh
KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=25 \
  python frontend/scripts/run-selector-stack.py \
    --host 192.168.122.1 1235 \
    /path/to/weak.txt.gz \
    /path/to/strong.bin.gz
```

Then in the SPA: select the non-first model in the toolbar
dropdown; load any 100+ move SGF; click Analyze Range across
the full game. Pre-fix the watchdog terminates the analyze
mid-stream and the SPA's `waitForAnalysis` expires at 30s;
post-fix the analyze runs to completion.

## Related

- The original keep-alive contract:
  `docs/archive/dispatch/frontend-to-proxy-keep-alive-middleware.md`
  and its proxy-side status.
- The SELECTOR design:
  `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`,
  `docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`.
- ADR-0002 (fail loudly) — the methodology principle this
  postmortem's "Why the band-aid was reached for" section
  generalises to the diagnosis layer.
- ADR-0005 (documentation discipline) — Rule 6 (author as you
  decide) is why this postmortem is filed now rather than at the
  close of the next release cycle.
