# Frontend → Proxy: Stranded-query cleanup — hub-level orphan termination + keep-alive middleware

- **Date:** 2026-05-03 (initial draft); revised 2026-05-03 (scope
  expanded after a sharper question reframed the problem — see
  *Revision note* below)
- **From:** frontend (umbrella session)
- **To:** proxy (KataProxy submodule)
- **Type:** request — protocol-level fix (Phase 1) + new feature
  with minor `SessionMiddleware` contract extension (Phase 2)
- **Status:** drafted; awaiting proxy-side implementation
- **Suggested filing:** `docs/dispatch/frontend-to-proxy-keep-alive-middleware.md`
  per ADR-0005's dispatch-ledger convention. First entry in the
  frontend↔proxy direction. (Filename retained from the initial
  draft for URL stability; the title and contents reflect the
  revised broader scope.)

## Revision note

The initial draft framed this as a single-phase request: a
keep-alive `SessionMiddleware` that uses the frontend's existing
`query_version` watchdog as a heartbeat and terminates stranded
queries when the heartbeat lapses. That framing was incomplete in
a way that matters.

The blind spot: the initial draft treated WebSocket disconnect as
"already handled by the existing infrastructure," when in fact
**`hub.unsubscribe` (`pubsub_hub.py:485`) does not check whether
the subscriber list went empty and does not signal `router.terminate`
on orphaned canonicals**. This means every sole-subscriber session
that disconnects today leaves its in-flight queries running on the
LEAF until natural completion — a generic protocol-level gap, not
HMR-specific. On bounded analyze queries (`maxVisits ≈ 1000`) the
cost is small and easy to miss; on ponder queries
(`maxVisits = PONDER_MAX_VISITS = 100000`) it is substantial.

That gap also constrains where the keep-alive middleware can help.
The middleware's watchdog task gets cancelled in `on_session_end`
(called from `_cleanup` on disconnect), so the middleware
contributes nothing in the true-disconnect cases (clean tab close,
browser quit, eventual TCP RST). It only helps when the WS stays
nominally open but the client is non-responsive — which is real
(HMR singleton orphan, network freezes that don't drop TCP, frontend
bugs that stop heartbeating without disconnecting), but a narrower
case than the initial framing implied.

The revised request is therefore layered:

- **Phase 1 — Hub-level orphan termination.** The protocol-level
  fix: `hub.unsubscribe` returns a "was-last-subscriber" signal;
  `_cleanup` and any other unsubscribe call site act on it by
  invoking `router.terminate` on the orphaned canonical. Closes
  the broader gap. Necessary first.
- **Phase 2 — Keep-alive middleware.** The defense-in-depth: the
  `SessionMiddleware` contract extension and the `KeepAliveMiddleware`
  catch the residual case where the WS stays open but the client is
  silent. Builds cleanly on Phase 1's foundation.

Both are needed; the original-draft's "the existing infrastructure
handles it" claim has been removed wherever it appeared.

## Why

The frontend's `analysisService` (a module-singleton in
`frontend/src/services/analysis-service.ts`) is occasionally
re-instantiated under Vite HMR while its previously-issued ponder
query is still in-flight at KataProxy. The new instance's
bookkeeping starts empty, so it never sends a client-side
`terminate` for the orphaned query. Two concrete failure modes:

- **WS-stays-open variant.** The old singleton's WebSocket is held
  by an orphaned closure (no `import.meta.hot.dispose` cleanup
  exists in the frontend; tracked separately as a priority TODO
  entry). The proxy never sees a disconnect; the in-flight ponder
  query runs to completion at `maxVisits=100000` with nothing on
  the client side that can issue a client-initiated `terminate`.
- **Clean-disconnect variant.** When the user closes the tab or
  navigates away, the WS does close cleanly. The proxy's
  `_cleanup()` runs and `hub.unsubscribe`'s the in-flight queries
  — but as established above, that doesn't propagate to the LEAF.
  The ponder still runs to completion.

Both variants leak the same compute. The general class is broader
than HMR — any client-side bug, network glitch, browser crash, or
controlled disconnect that leaves a single-subscriber session
without a path to `router.terminate` results in stranded compute.
On GPU-accelerated deployments, real money.

This dispatch proposes the layered fix described in the *Revision
note* above: Phase 1 closes the protocol-level gap, Phase 2 adds
defense-in-depth for the residual WS-stays-open case.

---

## Phase 1 — Hub-level orphan termination

### Problem

`hub.unsubscribe` at `proxy/pubsub_hub.py:485` removes the
subscriber from the canonical's subscriber list and removes the
canonical from the coalescing hash, but does not check the
post-removal list size and does not propagate to `router.terminate`.

The single call site in `_cleanup` (at `proxy_server.py:565` per
the survey of the disconnect path) iterates `_active_queries`,
calls `hub.unsubscribe`, and clears the dict. No router signal.
On a sole-subscriber disconnect — the common case — the canonical
keeps running on the LEAF with an empty subscriber list; responses
are computed and discarded; the search ends only via natural
completion through `on_complete`.

### Contract change

`hub.unsubscribe` returns a boolean indicating whether the
subscriber list is now empty:

```python
def unsubscribe(
    self, subscriber_internal_id: str, canonical_id: str
) -> bool:
    """Remove a subscriber from an in-flight slot.

    Returns True if this was the last subscriber (the canonical is
    now orphaned and the caller should terminate it at the router);
    False otherwise. Returns False also when the canonical was
    already absent (e.g., already cleaned up by on_complete).
    """
    entry = self._by_canonical.get(canonical_id)
    if entry is None:
        return False
    # ...existing subscriber-removal and hash-cleanup logic...
    return len(entry.subscribers) == 0
```

The hub stays free of router dependencies — no new wiring at hub
construction, no callback registration. The signal is just a
return value.

### Call-site updates

**`_cleanup`** (`proxy_server.py:565`) acts on the signal:

```python
async def _cleanup(self) -> None:
    logger.debug(
        f"peer={self._peer} "
        f"unsubscribing {len(self._active_queries)} active query(ies)"
    )
    for _orig_id, (iid, cid) in list(self._active_queries.items()):
        was_last = self._hub.unsubscribe(iid, cid)
        if was_last:
            # Orphaned canonical — no client is listening; terminate
            # at the LEAF. Responses to the terminate are discarded
            # because the WS is already closed.
            try:
                await self._router.terminate(
                    cid,
                    on_response=lambda *_: None,
                    on_complete=lambda *_: None,
                )
            except Exception:
                logger.exception(
                    f"orphan-terminate failed: canonical={cid!r}"
                )
    self._active_queries.clear()
    self._middleware.on_session_end()  # Phase 2 hook; no-op until then
```

**`_handle_terminate`** (`proxy_server.py:398`) ignores the return
value — it explicitly fires `router.terminate` further down anyway,
and KataGo's terminate is idempotent at the LEAF level. An
optimization to skip the explicit terminate when `was_last=True`
is possible but optional; the duplicate is wasteful only on the
network round-trip, not on engine work, and isn't worth the
flow-control complexity for Phase 1.

(If the proxy implementer prefers the optimization, the path is:
`_handle_terminate` checks `was_last`; if true, skips its own
`await self._router.terminate(...)` since the cleanup is already
in flight. The response-relabelling callbacks must still be
preserved for the originating client's terminate-ack.)

### Compatibility and architectural fit

- **Coalescing.** Multi-subscriber canonicals are unaffected:
  `unsubscribe` returns `False` when other subscribers remain,
  and no terminate fires. Only the last subscriber's departure
  triggers cleanup. Matches the existing terminate semantics
  (which also leave coalesced queries running for other
  subscribers).
- **Existing `_handle_terminate` flow.** Unchanged in correctness;
  the explicit `router.terminate` at the bottom of
  `_handle_terminate` continues to fire and produces the
  terminate-ack the client expects. The duplicate engine signal
  is benign.
- **Race conditions.** `unsubscribe` and `on_complete` can race —
  if a query finishes naturally just as the last subscriber leaves,
  one of two outcomes:
  - `on_complete` runs first: pops the entry from `_by_canonical`;
    `unsubscribe` finds `entry is None` and returns `False`. No
    spurious terminate. Good.
  - `unsubscribe` runs first: returns `True`; caller fires
    `router.terminate`; `on_complete` may already be in flight.
    The terminate is benign (idempotent), and `on_complete`
    cleans up its own entry as usual. Good.
- **Fail-loud (ADR-0002).** Orphan-termination failures (router
  rejected, etc.) log at `EXCEPTION` and don't propagate;
  `_cleanup` continues to terminate other orphans. Not silent —
  the EXCEPTION is the loud channel. Per the proxy's existing
  practice (e.g., `_handle_terminate`'s `TranslationError`
  warning), partial cleanup with logged failures is the right
  posture.
- **Licensing boundary.** No code touches `goboard_transposition/`.

---

## Phase 2 — Keep-alive `SessionMiddleware` (defense-in-depth)

### Problem

Phase 1 closes the disconnect path. The residual case is the
WS-stays-nominally-open silence: HMR singleton orphan with the old
WS held by a dead closure; network freezes that wedge a connection
without a TCP RST; a frontend bug that stops sending `query_version`
without disconnecting. In all of these, the proxy never observes a
disconnect, `_cleanup` never runs, and the canonical query keeps
computing for a client that no longer exists.

### Why a middleware (not a built-in)

The `Transformer` vs `SessionMiddleware` choice is load-bearing per
`proxy/CLAUDE.md`. This feature needs (a) cross-message state
(last-heartbeat timestamp, set of in-flight query IDs), (b) async
timing (an asyncio task that wakes on a schedule, not on a
response), and (c) an effect beyond response-rewriting (terminating
queries already in-flight at the LEAF). That's `SessionMiddleware`,
not Transformer.

A built-in `ClientSession` feature was considered and rejected
because the trigger for "the client is alive" is application-defined
(this proposal uses the frontend's existing 5s `query_version`
watchdog), and a policy-light `ClientSession` keeps the proxy useful
beyond its current consumer.

### Contract change — `SessionMiddleware` lifecycle hooks + `terminate_query` capability

The current contract (`proxy/session_middleware.py`):

```python
class SessionMiddleware(ABC):
    def on_query(self, orig_id: str, query: KataGoQuery) -> None: ...
    @abstractmethod
    def handle_response(
        self,
        orig_id: str,
        response: KataGoResponse,
        submit_query: SubmitQuery,  # Callable[[str, KataGoQuery], Awaitable[None]]
    ) -> ResponseStream: ...
```

The gap: `submit_query` is wired to `_handle_query`
(`proxy_server.py:354`), which only handles `ANALYZE` — it doesn't
route `TERMINATE`, which has its own dedicated `_handle_terminate`
path. And `submit_query` is only in scope inside `handle_response`,
not from a free-running asyncio task.

The proposed additive extension:

```python
@dataclass(frozen=True)
class SessionCapabilities:
    """Callbacks the session exposes to middleware for the session's lifetime."""
    submit_query: SubmitQuery       # existing; injects an analyze query
    terminate_query: TerminateQuery # new; terminates a query by orig_id

TerminateQuery = Callable[[str], Awaitable[None]]
# orig_id of the query to terminate, in the post-Transformer client namespace.
# Wraps _handle_terminate internally; failure modes (already-completed
# query, untranslatable orig_id) are logged and return cleanly per the
# existing _handle_terminate behaviour.

class SessionMiddleware(ABC):
    def on_session_start(self, caps: SessionCapabilities) -> None:
        """Called once after instantiation, before any on_query/handle_response.

        Default: no-op. Override to stash capabilities for later use
        (e.g., from a session-scoped asyncio task) or to spawn such a task.
        """

    def on_session_end(self) -> None:
        """Called once during _cleanup, after the hub.unsubscribe loop
        and after any Phase 1 orphan-termination calls.

        Default: no-op. Override to cancel session-scoped tasks and
        release resources.
        """

    def on_query(self, orig_id: str, query: KataGoQuery) -> None: ...
    @abstractmethod
    def handle_response(self, orig_id, response, submit_query) -> ResponseStream: ...
```

`MiddlewareChain` extends to forward both lifecycle hooks. Suggested
order: `on_session_start` runs inner-first, outer-second (matching
`on_query`'s convention); `on_session_end` runs outer-first,
inner-second (reverse-of-construction is the safer teardown
convention). The proxy-side implementer is welcome to revisit if
either direction creates a concrete problem.

`IdentityMiddleware` and `AdaptiveReevaluateMiddleware` get default
no-op implementations of the new hooks.

The `terminate_query` callback wraps a synthetic-id-prefixed call
into `_handle_terminate`:

```python
async def _terminate_query(target_orig_id: str) -> None:
    synthetic_id = f"__keepalive_term_{uuid.uuid4().hex[:12]}"
    term_query = KataGoQuery(action=KataGoAction.TERMINATE,
                             terminate_id=target_orig_id)
    await self._handle_terminate(synthetic_id, term_query)
```

The synthetic-id discipline matches the prior art at
`AbstractProxy/katago_effectful.py:_make_synthetic_id` (the audit-L-4
fix preserved `__` as the separator; `__keepalive_term_` follows the
same convention).

### Implementation sketch — `KeepAliveMiddleware`

A single new module (suggested location: `proxy/keep_alive.py`,
parallel to `session_middleware.py` and `katago_effectful.py`).

```python
class KeepAliveMiddleware(SessionMiddleware):
    """
    Per-session inactivity watchdog.

    Tracks the most recent timestamp at which a configurable
    "heartbeat" query (default: action == QUERY_VERSION) was observed
    on this session. If the gap between now and the last heartbeat
    exceeds idle_timeout_seconds, terminates every in-flight query
    on the session via the terminate_query capability and logs at
    WARNING per ADR-0002's loudness hierarchy.

    Composes cleanly with other middleware (e.g., adaptive_reevaluate);
    operates on the same orig_id namespace.

    Scope: this middleware addresses the WS-stays-nominally-open case
    only. The disconnect case is handled by Phase 1's hub-level
    orphan termination, which fires before on_session_end cancels the
    watchdog. Both layers together cover all known stranded-query
    scenarios.
    """

    def __init__(
        self,
        *,
        idle_timeout_seconds: float,
        check_interval_seconds: float | None = None,
        is_heartbeat: Callable[[KataGoQuery], bool] | None = None,
    ) -> None:
        self._idle_timeout = idle_timeout_seconds
        self._check_interval = check_interval_seconds or max(0.5, idle_timeout_seconds / 5)
        self._is_heartbeat = is_heartbeat or (lambda q: q.action == KataGoAction.QUERY_VERSION)
        self._last_heartbeat = monotonic()
        self._in_flight: set[str] = set()
        self._caps: SessionCapabilities | None = None
        self._task: asyncio.Task | None = None

    def on_session_start(self, caps: SessionCapabilities) -> None:
        self._caps = caps
        self._last_heartbeat = monotonic()
        self._task = asyncio.create_task(self._watchdog())

    def on_session_end(self) -> None:
        if self._task is not None:
            self._task.cancel()

    def on_query(self, orig_id: str, query: KataGoQuery) -> None:
        if self._is_heartbeat(query):
            self._last_heartbeat = monotonic()
        elif query.action == KataGoAction.ANALYZE:
            self._in_flight.add(orig_id)

    async def handle_response(self, orig_id, response, submit_query):
        # When the analyze query reaches its final response (the response that
        # carries isDuringSearch=False), drop it from in_flight. The exact
        # field-access shape depends on how the proxy's response model exposes
        # this; the AdaptiveReevaluateMiddleware uses the same signal at
        # katago_effectful.py:183-187 and is the implementation reference.
        if _is_final(response):
            self._in_flight.discard(orig_id)
        yield orig_id, response

    async def _watchdog(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._check_interval)
                idle = monotonic() - self._last_heartbeat
                if idle <= self._idle_timeout:
                    continue
                stranded = list(self._in_flight)
                if not stranded:
                    self._last_heartbeat = monotonic()  # reset to suppress log spam
                    continue
                logger.warning(
                    f"keep-alive timeout: idle={idle:.1f}s "
                    f"terminating {len(stranded)} stranded query(ies)"
                )
                for orig_id in stranded:
                    try:
                        await self._caps.terminate_query(orig_id)
                    except Exception:
                        logger.exception(f"keep-alive terminate failed: orig_id={orig_id!r}")
                self._in_flight.clear()
                self._last_heartbeat = monotonic()
        except asyncio.CancelledError:
            raise
```

### Configuration

`idle_timeout_seconds` is the single dial. Production wiring at
`proxy_server.py`'s `middleware_factory` reads from `cfg`:

```python
KEEP_ALIVE_IDLE_TIMEOUT_SECONDS: float = float(
    os.environ.get("KEEP_ALIVE_IDLE_TIMEOUT_SECONDS", "25.0")
)
```

A production default of **25 seconds** corresponds to 5× the frontend's
existing 5000ms watchdog cadence (`analysis-service.ts:88`) — generous
enough to absorb network jitter and one missed beat without false
positives, tight enough to bound cost on a stranded ponder. Operators
on cost-sensitive hardware can lower it via env var.

For testing, the user expects to set it as low as **3 seconds** with a
correspondingly-lowered frontend watchdog interval (e.g., 600ms via a
local edit) so the middleware fires within seconds of WS-stays-open
silence. No proxy-side test harness is required.

The `is_heartbeat` predicate is configurable to keep the middleware
generic, but defaults to `query_version` — that's what gogui does.
Other consumers of the proxy (per `proxy/README.md`'s "go schools,
online go services" framing) can supply their own predicate.

### Compatibility and architectural fit

- **Existing middleware.** `IdentityMiddleware` and
  `AdaptiveReevaluateMiddleware` get default no-op implementations of
  `on_session_start`/`on_session_end`. `MiddlewareChain` forwards
  the hooks. No behavior change for existing consumers.
- **Coalescing.** A query coalesced at the hub belongs to multiple
  sessions; the middleware's `_in_flight` is per-session. When a
  middleware fires `terminate_query` for one of its session's queries,
  `_handle_terminate` runs through the existing flow (translate ID,
  unsubscribe from hub, fire `router.terminate`). With Phase 1 in
  place, `hub.unsubscribe` returns the was-last signal — but
  `_handle_terminate` is the explicit-terminate path and ignores it
  per Phase 1's call-site rules. Net: one terminate to the LEAF per
  middleware-initiated termination, regardless of subscriber count.
- **Synthetic-query tracking.** Queries injected by other middleware
  via `submit_query` bypass `_handle_incoming` and therefore are not
  seen by `KeepAliveMiddleware.on_query`. This means
  `AdaptiveReevaluateMiddleware`'s deeper-analysis follow-ups would
  not be caught by the keep-alive watchdog. This is a pre-existing
  asymmetry in the middleware contract (also affects any other
  cross-middleware bookkeeping); not in scope for this dispatch but
  worth a separate proxy-side ticket. The straightforward fix is to
  call `self._middleware.on_query(orig_id, query)` at the top of
  `_handle_query` so injected queries fan out to all middleware. The
  blast radius is small but it's a behavior change and warrants its
  own review.
- **Fail-loud (ADR-0002).** Termination events log at WARNING with
  the idle duration and the count of stranded queries — operators
  get visibility into how often the safety net fires. Failures
  inside `terminate_query` log at EXCEPTION; the watchdog continues
  rather than dying silently.
- **Licensing boundary.** No code touches `goboard_transposition/`.
  The new module sits in the Unlicense root.

---

## Testing plan

### Phase 1 — Hub-level orphan termination

Disconnect-induced stranded query (the common case):

1. Open the SPA, fire a ponder on a non-trivial position
   (`PONDER_MAX_VISITS = 100000`; the LEAF should be visibly
   GPU/CPU-bound).
2. Close the browser tab cleanly.
3. **Expected (post-Phase-1):** GPU/CPU utilisation drops within
   ~1-2 seconds (the time it takes for the WS close to propagate to
   `_cleanup` plus the LEAF's terminate acknowledgement). Proxy log
   should show the existing `unsubscribing N active query(ies)`
   debug line plus a new terminate dispatch.
4. **Pre-Phase-1 baseline:** GPU/CPU utilisation continues at the
   same level until the ponder reaches `maxVisits=100000` naturally
   (potentially many seconds on high-end hardware).

Multi-subscriber non-regression:

5. Open two SPA tabs pointing at the same position with the same
   palette (so the queries coalesce). Verify both ponder concurrently.
6. Close one tab. Verify the other tab's analysis continues
   uninterrupted; the canonical query is still alive at the LEAF
   because the surviving subscriber keeps it alive.
7. Close the second tab. Verify GPU/CPU drops as in step 3.

Explicit-terminate non-regression:

8. Open the SPA, fire a ponder, then change the active board node
   (which triggers `stopBoardAnalysis` → client-initiated
   `terminate`). Verify the terminate-ack reaches the client and the
   LEAF stops the search. (This was the existing path; Phase 1 must
   not break it.)

### Phase 2 — Keep-alive middleware

WS-stays-open variant (the residual case):

9. Set `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=3` in the proxy environment.
10. Lower the frontend watchdog to ~600ms locally (single line in
    `analysis-service.ts:88`); revert before commit.
11. Open the SPA, fire a ponder.
12. Suspend the browser tab in a way that keeps the WS nominally open
    but stops the heartbeat (e.g., DevTools → Sources → pause
    JavaScript execution; or simulate by commenting out the watchdog
    interval temporarily).
13. **Expected:** GPU/CPU utilisation drops within ~3-5 seconds (3s
    timeout + up to 1s check interval + the LEAF's terminate
    acknowledgement). Proxy log shows
    `keep-alive timeout: idle=3.X s terminating 1 stranded query(ies)`.

Non-regression:

14. With `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=25` (production default),
    leave the SPA open with a ponder running. Verify the
    `query_version` watchdog keeps the heartbeat fresh and no
    stranded-termination logs appear over a sustained session.

---

## Documentation

On the proxy side: a section in `proxy/FRAMEWORK.md` (or
`proxy/ARCHITECTURE.md`, whichever is the natural fit) documenting
(a) the `hub.unsubscribe` return-value contract and the orphan-
termination responsibility on call sites, and (b) the
`SessionMiddleware` lifecycle hooks and `SessionCapabilities` shape.
The `KeepAliveMiddleware` itself is self-documenting via its module
docstring; no separate doc required.

On the umbrella side: `docs/handoff-current.md`'s "Rough edges to
know about" section currently flags "Drift between the proxy's
contract and the frontend's wire type" — this work doesn't change
the wire, so no edit there. After the proxy ships, the umbrella's
proxy pointer bump (a separate umbrella PR) should update
`docs/handoff-current.md`'s proxy-version reference and the
frontend's TODO entry for HMR cleanup
(`docs/TODO.md`'s "Trivial" tier — added in this same session) can
note that the proxy's safety net now exists, without removing the
frontend cleanup item (the two are complementary).

## Coordination — submodule release arc

Per `proxy/CLAUDE.md` and the umbrella `CLAUDE.md`, the proxy is its
own repo with its own release cadence. The arc:

1. **Phase 1 PR** in the proxy repo: `pubsub_hub.py` (return-value
   contract on `unsubscribe`) + `proxy_server.py` (`_cleanup`
   acts on the signal). Tag cut on completion (suggested: v1.0.7,
   protocol-level fix, no contract widening). The umbrella's
   pointer bump for v1.0.7 is its own umbrella PR.

2. **Phase 2 PR** in the proxy repo, layered on Phase 1: contract
   extension (`session_middleware.py` lifecycle hooks +
   `SessionCapabilities`), wiring in `proxy_server.py`
   (`on_session_start` / `on_session_end` calls + `terminate_query`
   capability constructed from `_handle_terminate`), and the new
   `keep_alive.py` module. Existing middleware
   (`IdentityMiddleware`, `MiddlewareChain`,
   `AdaptiveReevaluateMiddleware`) get default no-op lifecycle
   implementations. Tag cut on completion (suggested: v1.0.8,
   additive feature + additive contract change, no breaking
   changes). The umbrella's pointer bump for v1.0.8 is its own
   umbrella PR.

The shared context across the two phases is strong (both touch the
same files, the same testing scenarios overlap, the second's
correctness reasoning depends on the first), so a single proxy-side
session implementing both in sequence is appropriate. The two PRs
remain separate so reviewers can sign off on the protocol-level
fix independently of the contract widening.

## Reply

When each phase ships, a status dispatch back to
`docs/dispatch/proxy-to-frontend-keep-alive-middleware-status.md`
is sufficient — anything from "Phase 1 shipped, contract as
proposed" to "Phase 2 shipped with the following deviations: …"
lets the umbrella proceed with the corresponding pointer bump.

— end request —
