# Frontend → Proxy: Keep-alive `SessionMiddleware` for stranded-query termination

- **Date:** 2026-05-03
- **From:** frontend (umbrella session)
- **To:** proxy (KataProxy submodule)
- **Type:** request — new feature + minor extension to the
  `SessionMiddleware` contract
- **Status:** drafted; awaiting proxy-side implementation
- **Suggested filing:** `docs/dispatch/frontend-to-proxy-keep-alive-middleware.md`
  per ADR-0005's dispatch-ledger convention. First entry in the
  frontend↔proxy direction.

## Why

The frontend's `analysisService` (a module-singleton in
`frontend/src/services/analysis-service.ts`) is occasionally
re-instantiated under Vite HMR while its previously-issued ponder
query is still in-flight at KataProxy. The new instance's bookkeeping
(`activeQueryIds`, `activeSubscriptions`) starts empty, so it never
sends a client-side `terminate` for the orphaned query. The proxy
keeps the search running on the LEAF until completion. With ponder
queries capped at `PONDER_MAX_VISITS = 100000` (`engine/constants.ts`),
on high-end hardware this is real wasted compute — and on
GPU-accelerated deployments, real money.

The HMR symptom is a single concrete instance of a more general
class: any client-side bug, network glitch, browser crash, or tab
close-without-cleanup that leaves a session's queries unterminated
results in the proxy quietly running them to completion. The
existing `_cleanup()` path in `ClientSession` (`proxy_server.py`)
unsubscribes from the hub on disconnect but does not propagate
termination to the LEAF — by design, since other sessions may share
the canonical query — but this means a *single-subscriber* stranded
query keeps running indefinitely.

This dispatch proposes a per-session keep-alive watchdog implemented
as a new `SessionMiddleware`, with a small additive extension to the
`SessionMiddleware` contract to make it expressible as a
fluently-composed middleware (the proxy's standard extension shape
per `proxy/CLAUDE.md`).

## Why a middleware (not a built-in)

The `Transformer` vs `SessionMiddleware` choice is load-bearing per
`proxy/CLAUDE.md`. This feature needs (a) cross-message state
(last-heartbeat timestamp, set of in-flight query IDs), (b) async
timing (an asyncio task that wakes on a schedule, not on a response),
and (c) an effect beyond response-rewriting (terminating queries
already in-flight at the LEAF). That's `SessionMiddleware`, not
Transformer.

A built-in `ClientSession` feature was considered and rejected
because: the trigger for "the client is alive" is application-defined
(this proposal uses the frontend's existing 5s `query_version`
watchdog), and policy-light `ClientSession` keeps the proxy useful
beyond its current consumer.

## Contract change — `SessionMiddleware` lifecycle hooks + `terminate_query` capability

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

The gap: `submit_query` is wired to `_handle_query` (`proxy_server.py:354`),
which only handles `ANALYZE` — it doesn't route `TERMINATE`, which has
its own dedicated `_handle_terminate` path. And `submit_query` is only
in scope inside `handle_response`, not from a free-running asyncio
task.

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
        """Called once during _cleanup, after the hub.unsubscribe loop.
        
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
no-op implementations of the new hooks (they don't need them).

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

## Implementation sketch — `KeepAliveMiddleware`

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

## Configuration

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
local edit) so the middleware fires within seconds of closing a tab
mid-ponder. No proxy-side test harness is required for this — the
test scenario is "fire a ponder from the browser, close the tab,
watch GPU/CPU utilisation drop within seconds."

The `is_heartbeat` predicate is configurable to keep the middleware
generic, but defaults to "query_version" — that's what gogui does.
Other consumers of the proxy (per `proxy/README.md`'s "go schools,
online go services" framing) can supply their own predicate.

## Compatibility and architectural fit

- **Existing middleware.** `IdentityMiddleware` and
  `AdaptiveReevaluateMiddleware` get default no-op implementations of
  `on_session_start`/`on_session_end`. `MiddlewareChain` forwards
  the hooks. No behavior change for existing consumers.
- **Coalescing.** A query coalesced at the hub belongs to multiple
  sessions; the middleware's `_in_flight` is per-session. Terminating
  one session's view of a canonical query unsubscribes that session
  from the hub but leaves other subscribers' views untouched —
  exactly the existing `_handle_terminate` semantic. If all
  subscribers go away (each session's keep-alive fires
  independently), the canonical query becomes orphaned at the hub
  and the existing infrastructure handles it. No new orphan path.
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

## Testing plan

Functional test (the user's scenario):

1. Set `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=3` in the proxy environment.
2. Lower the frontend watchdog to ~600ms locally (single line in
   `analysis-service.ts:88`); revert before commit.
3. Open the SPA, fire a ponder on a non-trivial position
   (`PONDER_MAX_VISITS = 100000`; the LEAF should be visibly
   GPU/CPU-bound).
4. Close the browser tab.
5. Observe: GPU/CPU utilisation should drop within ~3-5 seconds
   (3s timeout + up to 1s check interval + the LEAF's terminate
   acknowledgement).
6. Observe: proxy log should show
   `keep-alive timeout: idle=3.X s terminating 1 stranded query(ies)`.

Non-regression test:

7. With `KEEP_ALIVE_IDLE_TIMEOUT_SECONDS=25` (production default),
   leave the SPA open with a ponder running. Verify the
   `query_version` watchdog keeps the heartbeat fresh and no
   stranded-termination logs appear over a sustained session.

## Documentation

On the proxy side: a section in `proxy/FRAMEWORK.md` (or
`proxy/ARCHITECTURE.md`, whichever is the natural fit) documenting
the lifecycle hooks and the `SessionCapabilities` shape. The
`KeepAliveMiddleware` itself is self-documenting via its module
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

1. Proxy-side PR in the proxy repo implements the contract change
   (`session_middleware.py`, `proxy_server.py` capabilities +
   lifecycle wiring) and the `KeepAliveMiddleware` (new module),
   wired via `middleware_factory` at the LEAF/RELAY entry points.
   Per the v1.0.6 precedent (audit-L-4 etc.), this is its own PR
   with its own review cycle.
2. Tag cut on the proxy repo (suggested: v1.0.7 — additive
   feature + additive contract change, no breaking changes for
   existing middleware).
3. Separate umbrella-side PR bumps `proxy/` to the new tag and
   updates `docs/handoff-current.md` accordingly. The frontend
   needs **zero** changes.

## Reply

When the proxy-side implementation lands, a status dispatch back to
`docs/dispatch/proxy-to-frontend-keep-alive-middleware-status.md` is
sufficient — anything from "shipped, contract as proposed" to
"shipped with the following deviations: …" lets the umbrella
proceed with the pointer bump.

— end request —
