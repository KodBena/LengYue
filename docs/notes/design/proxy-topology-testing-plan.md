# Proxy topology testing — substrate generalisation + test/debug discipline

- **Status:** `design-note: planned` (per ADR-0005 Rule 8's
  doc-graph genre vocabulary)
- **Date:** 2026-05-12
- **Scope:** umbrella-side, primarily `frontend/scripts/` and
  `proxy/tests/`; ADR-0002-shaped decision concerning the proxy
  chain composition is recorded here for future reference and
  may be promoted to a proxy-side ADR if a second proxy chain
  consumer materialises.
- **Origin:** the 2026-05-12 adaptive-deeper-enrichment
  investigation (umbrella PRs #200-series, proxy PR #26).
  `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
  is the sibling postmortem capturing the investigation lessons
  this note's discipline sections distil.

---

## TL;DR

The current `frontend/scripts/run-selector-stack.py` is a single-
topology substrate (SELECTOR → N LEAFs). Two near-future testing
needs warrant generalising it: (a) RELAY coalescing and
load-balancing across LEAFs is currently not exercised by any
in-process or end-to-end test; (b) chained-proxy topologies
(e.g. SELECTOR → RELAY → LEAFs, or longer) need fixture
infrastructure before we can write meaningful tests for them.
The generalisation should be additive — the existing CLI surface
stays — and should produce a *substrate* the next-layer test
scripts compose with, not a kitchen-sink tool.

Two structural decisions emerge from the 2026-05 investigation
and need recording here while the context is fresh:

1. **In-process integration tests via Layer 1+2+3 ClientSession
   + synthetic backend** are the right primary surface for
   protocol-shape testing (the wire-level cache matrix is the
   worked example from proxy PR #26). Real-LEAF tests are
   secondary; they catch what the synthetic can't (real KataGo
   D/F content divergence, real timing) but cost a setup-and-
   teardown budget the synthetic doesn't.

2. **Chained enrichment middleware is pathological if it
   recursively engages**, and the project should fail loudly at
   configuration time rather than tolerating the silent
   compute-amplification. Articulated below in ADR-0002 shape.

The note's substrate generalisation + chained-enrichment decision
together replace the postmortem's §5.4 "diagnostic probe script"
recommendation with a more durable shape; the postmortem's other
recommendations (wire-schema reference doc, CLAUDE.md amendment
naming runtime visibility) stay as separate undertakings.

---

## 1. Motivation

### 1.1 What the current substrate covers

`frontend/scripts/run-selector-stack.py` (post the 2026-05-12
amendments) supports:

- Spawning N LEAFs + 1 SELECTOR in topological order with port
  allocation and readiness gating.
- Pointing at pre-existing upstream LEAFs via `--upstream
  LABEL=URL` (preserves KataGo NN cache across SELECTOR
  iterations during debug loops).
- Structured JSON logging per spawned proxy via `--log-dir
  DIR` (PROXY_LOG_FORMAT=json + PROXY_LOG_DEST=file:...).

It does NOT cover:

- The RELAY role at all. `proxy/router.py:RelayRouter` has its
  own coalescing + hash-ring + load-metric machinery
  (`proxy/CLAUDE.md`'s "heartbeat-fanout contract" section is
  the most-recent worked example); none of that machinery is
  exercised by any test or operational fixture the umbrella
  knows about. The proxy's own
  `tests/test_relay_router.py` is unit-level (mocks the
  per-upstream sessions); the integration-level "actual RELAY
  with N actual LEAFs, query coalescing observable on the
  wire" surface has no fixture.
- Longer chains. SELECTOR → RELAY → LEAFs, RELAY → RELAY → LEAFs,
  REDIRECT → LEAF, etc. The proxy supports these topologies in
  principle but the umbrella has no scripted way to bring one
  up.
- Multiple proxy roles in the same process (out of scope for
  this note — process boundaries are load-bearing for the
  ID-namespace discipline `proxy/ARCHITECTURE.md` §
  "ID namespaces and translation" documents).

### 1.2 Why this matters now

The 2026-05-12 investigation surfaced a class of bug
(`_are_equal` short-circuit defeating downstream consumers) that
was diagnosable only because the user's setup happened to be
SELECTOR-shaped and the symptom happened to be wire-observable.
Two adjacent classes of bug are likely lurking in the RELAY +
longer-chain space without any test coverage that would surface
them:

- **Coalescing correctness on RELAY.** If two clients issue
  identical analyze queries through the same RELAY, the
  `CoalescingPolicy` in `proxy/pubsub_hub.py` should produce one
  upstream LEAF query and fan both clients' responses out. Wire-
  level test: send two queries, count upstream LEAF dispatches,
  count client-side response counts. None of this is exercised
  today.
- **Load distribution on RELAY.** The `InFlightQueryLoad` metric
  + `HashRing` should distribute distinct queries across
  upstream LEAFs. Stuck-on-one-LEAF behaviour (the kind of bug
  v1.0.19's hash-ring broadcast fix surfaced) is currently only
  catchable by reading the operator's KataGo GPU-utilisation
  dashboard. Wire-level test: send N distinct queries through a
  RELAY-over-2-LEAFs topology, observe dispatch distribution.
- **Chain pathologies.** When `adaptive_reevaluate` (or any
  capability-gated stateful middleware) engages at multiple
  layers of a chain, what happens? See §3 for the
  ADR-0002-shaped analysis.

### 1.3 What this note is and isn't

This note is the **design** for the topology testing substrate;
it is not the implementation. The implementation lands as a
follow-up umbrella PR that adapts `run-selector-stack.py` per
§2 and adds the in-proxy fixture infrastructure per §4. The
note also records the chained-enrichment decision (§3) and
captures debugging-discipline lessons (§5) so the next
investigation against this codebase has them in view from the
start.

---

## 2. Substrate generalisation

### 2.1 Design goal

The substrate should make it trivial to declare a topology of
proxy processes connected by upstream/downstream WebSocket
links, bring them up in dependency order, optionally point at
pre-existing nodes, and capture per-node structured logs. The
substrate is a foundation for test scripts that exercise
specific topology behaviours — it doesn't bundle the tests
themselves.

The shape that fits this is: a topology spec data structure +
a runner. The spec is constructed from CLI args, a config file,
or directly from a Python test fixture.

### 2.2 Spec shape

```python
@dataclass(frozen=True)
class NodeSpec:
    """One proxy process in the topology."""
    label: str            # 'weak', 'strong', 'r1', 'sel'; unique
    role: ProxyRole       # LEAF | RELAY | SELECTOR | ECHO | REDIRECT
    upstreams: tuple[str, ...]  # labels of nodes this one connects to
    # Role-specific config:
    model_path: Optional[Path] = None     # LEAF only
    advertise_capabilities: bool = True   # all roles
    # Pre-existing nodes have model_path=None and a literal
    # upstream URL via the substrate's --upstream-url mechanism;
    # the substrate doesn't spawn them, but Routers that depend
    # on them are configured against the literal URL.
    pre_existing_url: Optional[str] = None


@dataclass(frozen=True)
class TopologySpec:
    nodes: tuple[NodeSpec, ...]
    client_port: int  # the port the *user-facing* node listens on
                      # (last in dependency order; what the SPA points at)
```

Validation at spec-construction time:

- Labels unique.
- Upstreams reference declared labels.
- Topological order computable (no cycles).
- Role-specific fields satisfy role contracts (LEAF has
  model_path xor pre_existing_url; SELECTOR has at least one
  upstream; RELAY has at least one upstream; etc.).
- Exactly one node serves the client (the "leaf of the topology
  DAG," not to be confused with the LEAF role); or
  alternatively, the spec names which node serves the client.

### 2.3 Runner shape

```python
class TopologyRunner:
    """Orchestrates spawn / readiness / teardown for a TopologySpec."""

    def __init__(self, spec: TopologySpec, *, log_dir: Optional[Path]):
        ...

    async def start(self) -> None:
        # Topological sort; spawn each node, wait for readiness;
        # subsequent nodes get URLs of already-spawned upstreams
        # threaded into their env.
        ...

    async def stop(self) -> None:
        # SIGTERM in reverse topological order; SIGKILL stragglers.
        ...

    @property
    def client_url(self) -> str:
        # ws://host:client_port — what the SPA / test client
        # should connect to.
        ...
```

The runner is the umbrella-side artefact `run-selector-stack.py`
becomes — generalised to any topology, not just SELECTOR-over-N-
LEAFs. Per-topology test scripts construct a TopologySpec and
run it; the script's per-topology assertions live alongside the
TopologySpec construction.

### 2.4 CLI surface (backward-compatible)

Existing invocations keep working unchanged:

```bash
python run-stack.py 1235 weak=~/m/weak.gz strong=~/m/strong.gz
```

Becomes equivalent to a default-SELECTOR TopologySpec. New
shapes via richer CLI:

```bash
# RELAY → 2 LEAFs (same model, two processes — exercises
# coalescing and load-distribution; the proxy README's
# "two-process LEAF + RELAY setup on a single host" pattern
# generalised to N LEAFs)
python run-stack.py --relay 1235 --leaf l1=~/m/weak.gz --leaf l2=~/m/weak.gz

# SELECTOR → RELAY → 2 LEAFs (longer chain)
python run-stack.py --selector 1235 r1=relay:l1,l2 \
                    --leaf l1=~/m/weak.gz --leaf l2=~/m/strong.gz

# Topology declared via JSON config file
python run-stack.py --topology my-topology.json
```

The CLI parser produces a TopologySpec; the runner consumes it.
Test scripts can also construct TopologySpec directly without
CLI.

### 2.5 What this is NOT

- **Not a deployment tool.** Production deployment is
  out-of-scope; the substrate is for testing and debugging. The
  proxy's existing `run_leaf.sh` / `run_relay.sh` are the
  reference for production invocation.
- **Not a load generator.** Sending traffic through the
  topology is the responsibility of per-topology test scripts.
  The substrate brings the topology up; what flows through it
  is the test's concern.
- **Not a substitute for `proxy/tests/`.** In-process Layer 1+2+3
  tests using `ClientSession` + `MockWebSocket` + synthetic
  backends (§4 below) remain the primary protocol-shape testing
  surface. The topology substrate covers a different class —
  multi-process behaviours that the in-process pattern can't
  observe.

---

## 3. Chained enrichment middleware: ADR-0002-shaped decision

### 3.1 The pathology

Every proxy role currently uses the same middleware factory
(`proxy_server._make_middleware`): `KeepAliveMiddleware(outer)`
wrapping `CapabilityGatedMiddleware('adaptive_reevaluate',
adaptive_reevaluate(...))`. So a chain like SELECTOR → LEAF has
the adaptive_reevaluate middleware engaged at BOTH layers,
gated by the same capability opt-in.

When a client opts in to `adaptive_reevaluate`:

1. SELECTOR's CapabilityGatedMiddleware sees the opt-in,
   engages the orchestration coroutine. After all parent finals
   arrive, the coroutine decides to deepen and spawns a deeper
   sub-query via `ctx.spawn`.
2. The spawned sub-query routes through SELECTOR's router to
   the downstream LEAF. The sub-query's opaque is cloned from
   the parent's, which INCLUDES the `capabilities.adaptive_reevaluate`
   opt-in.
3. LEAF receives the sub-query as a normal analyze. LEAF's
   CapabilityGatedMiddleware sees the opt-in, engages LEAF's
   adaptive_reevaluate, and could spawn ANOTHER deeper
   sub-query at `sub_maxVisits + extra_visits = orig_maxVisits +
   2*extra_visits`.
4. With N proxy layers in the chain, the deepening recurses N
   times. Each layer's deeper sub-query analyses
   `worst_quantile^N * parent_turns` turns at proportionally
   higher visits.

The total compute bound is finite (geometric in quantile) but
the design clearly intends adaptive to fire **once**, not at
every layer the query traverses.

The proxy's existing chain composition does not detect this
recursion. The SPA cannot detect it either (the client only
sees the final wire output). The KataGo subprocess sees what
look like normal analyze queries; it has no way to know it's
serving a layer's deeper-of-deeper sub-query.

### 3.2 The decision (ADR-0002 shape)

**A chain that re-engages the same enrichment middleware at
multiple layers is a configuration error and must fail loudly
at proxy startup.**

The shape mirrors ADR-0002's loud-failure tenet:

- The pathology is silent compute amplification: no observable
  protocol violation, no error response, no log warning. The
  user sees longer-than-expected query latency and unexplained
  GPU utilisation, with no signal pointing at the cause. This
  is the "silent fallback or default" category at the bottom of
  ADR-0002's loudness hierarchy.
- The right surfacing is **startup-time**, not response-time —
  per ADR-0002's preference for the strongest applicable
  channel. By the time the response is on the wire, the
  compute has already happened; the operator needs to know
  before the chain serves traffic.
- The detection mechanism is operator-declarative, not
  runtime-inferred. Each proxy role accepts a `PROXY_ENABLE_<CAPABILITY>`
  env-var family (e.g., `PROXY_ENABLE_ADAPTIVE_REEVALUATE=false`)
  defaulting to true for backward compatibility, and the
  topology runner sets the right values on intermediate nodes
  when bringing up a chain.

### 3.3 Concrete implementation surface

This decision lands as a small proxy-side change (gated on a
proxy PR + tag + umbrella bump per the usual submodule release
arc):

- `proxy/proxy_server.py:_make_middleware` reads
  `cfg.ENABLE_ADAPTIVE_REEVALUATE` (default True) and skips the
  CapabilityGatedMiddleware around adaptive when False. The
  capabilities advertiser at `_build_advertised_capabilities`
  similarly drops `adaptive_reevaluate` from the advertisement
  when disabled.
- The same env-var pattern extends to `delta_analysis` (the
  `analysis_enricher` transformer) and any future enrichment
  middleware. A proxy that doesn't advertise a capability
  doesn't engage it; a chain where only the user-facing node
  advertises adaptive runs adaptive exactly once.
- The topology runner (§2) consumes a per-node
  `enable_capabilities` set; the substrate's default for
  intermediate nodes is "enable nothing" and for the
  user-facing node is "enable everything the SPA expects."
  Test scripts that want to exercise a deliberately-pathological
  composition can override.

The decision is intentionally NOT "the proxy auto-detects chain
nesting and refuses to engage adaptive on already-deepened
queries." That would require a new marker on the wire (the
`_orch_parent_orig_id` shape that was explored in the failed
proxy v1.0.21 alias-branch experiment is the closest existing
parallel), and runtime detection of a configuration error is
the wrong loudness tier. Operator-declarative startup-time
configuration is the ADR-0002-appropriate channel.

### 3.4 What happens to existing single-tier deployments

Unchanged. `PROXY_ENABLE_ADAPTIVE_REEVALUATE` defaults to true,
so a LEAF run by the existing `run_leaf.sh` keeps advertising
adaptive and engaging it on opted-in queries. The decision is
about chain compositions, where the operator becomes
responsible for naming which node is the canonical engager.
Single-node deployments (LEAF only, or SELECTOR-only with
LEAFs that don't advertise client-facing) are unaffected.

### 3.5 Promote to ADR if a second consumer materialises

The decision is recorded here as a design note rather than a
proxy-side ADR because it has exactly one consumer today
(adaptive_reevaluate). When a second enrichment middleware
that's chain-composable lands — `transposition_enricher` is the
likely candidate; future middleware authored against the
orchestration framework also qualifies — the pattern becomes
substantive enough to promote to a proxy ADR. The promotion
also requires the proxy-side `cfg.ENABLE_<CAPABILITY>` family
to land, which is what makes the decision operationally real.

---

## 4. Unit + integration test guidance

The 2026-05 investigation produced a concrete pattern that
works; this section names it explicitly so future tests can
adopt it without re-deriving.

### 4.1 Three tiers

**Tier 1 — Pure-unit tests** at `proxy/tests/test_*.py`:
direct call-site testing of pure functions or stateless
classes. Examples: `test_protocol_parser.py`,
`test_proxy_logging.py`. No async, no fixtures beyond plain
construction.

**Tier 2 — In-process Layer 1+2+3 integration** at
`proxy/tests/test_*.py` (same directory, different shape).
Drives a `ClientSession` directly with a `MockWebSocket`, a
synthetic backend, and a custom middleware/transformer chain.
Captures wire output via `ws.sent`. The pattern
`test_adaptive_cache_matrix.py` established is the worked
example. Two infrastructure pieces it depends on:

- A `MockWebSocket` with `remote_address` / `send` / `close` —
  small enough to inline per test file when only one test file
  needs it; consider promoting to `tests/_fixtures.py` if a
  second test file needs the same shape.
- A `BackendRouter` mock. `tests/synthetic_backend.py`'s
  `SyntheticPonderingRouter` is the existing one; the
  `MaxVisitsSyntheticRouter` variant in `test_adaptive_cache_matrix.py`
  is the maxVisits-aware specialisation that makes
  parent-vs-deeper queries distinguishable on the wire.
  Generalising these into a `synthetic_backends.py` module
  (plural) is the natural next step when a third variant
  appears.

**Tier 3 — Multi-process topology tests**, runnable via the
substrate from §2. These cover behaviours the in-process
pattern cannot observe — RELAY coalescing across upstream
processes, hash-ring distribution, real-time backpressure under
real network sockets. The pattern is: bring up a topology,
issue queries through a Node WebSocket client (the umbrella
already has `/tmp/probe-*.mjs`-style throwaways from the 2026-05
investigation; promoting one to a stable `frontend/scripts/`
artefact is part of the substrate generalisation in §2),
capture wire output via the per-node log files, assert on the
captured logs.

### 4.2 Parametrisation discipline

The cache-flag matrix in `test_adaptive_cache_matrix.py`'s four
scenarios is the parametrisation-discipline reference. The
discipline: enumerate the meaningful combinations of input
axes, identify mathematically-collapsing rows, and produce one
test per surviving row. The user-facing principle the
2026-05 investigation crystallised: when the user can configure
N independent flags, the test surface needs `surviving(N)`
parametrised cases, not one default-flag test.

For RELAY coalescing/load-balancing, the axes are likely:
- Number of upstream LEAFs (1, 2, ≥3)
- Per-query identity (identical queries → coalesce; distinct
  queries → distribute)
- Load metric (default InFlightQueryLoad; possibly future
  alternatives)

For chain compositions, the axes are:
- Chain length (1, 2, ≥3 proxy layers)
- Which layer engages which capability (the §3 decision's
  operator-declarative space)

### 4.3 Synthetic vs. real-LEAF tests

Tier 2 synthetic tests are the *primary* surface for protocol-
shape testing. They:

- Don't require KataGo binary, model file, GPU.
- Finish in well under a second each (parallel execution-friendly
  in CI).
- Are deterministic — the synthetic backend emits a
  pre-programmed sequence; race conditions show up at the
  middleware composition layer, not at the response-content
  layer.
- Surface the worst-case bug condition (the
  identical-content D-then-F that triggered the `_are_equal`
  short-circuit was *more aggressively* surfaced by the
  synthetic backend than by real KataGo, which made the bug
  diagnosable from the synthetic alone — the user-side
  end-to-end verification was confirmation, not discovery).

Real-LEAF tests in `proxy/tests/diagnose_*.py` and the
umbrella's `frontend/tests/e2e/` are *secondary* — they catch:

- Real-content-divergence effects the synthetic doesn't model
  (e.g., the cache-hit C scenario's behaviour against real
  KataGo's natural D/F divergence).
- Real-timing effects (the 3 ms race that defeated the failed
  proxy v1.0.21 alias-branch experiment is the worked example
  — the synchronous in-process pattern hid it; only real
  async timing surfaced it).

Test authoring should default to Tier 2 unless the failure
mode under test is specifically a real-content or real-timing
property. Promote a Tier 2 test to Tier 3 if and only if the
synthetic pattern can't reach the failure.

### 4.4 Assertions on wire output, not internal state

The `test_adaptive_cache_matrix.py` pattern asserts on
`ws.sent` — the wire bytes the client would receive. This is
the right granularity:

- Wire output is the proxy's contract with its consumers; if
  the wire is correct, the proxy did its job.
- Internal state (analyzer pipelines, request_cache, sub-query
  registries) is implementation detail; assertions against
  internal state lock the implementation more tightly than the
  contract requires and create false-positive test failures on
  refactor.

The exception: tests that *specifically* pin an internal
invariant the framework declares (the `_PROXY_ONLY_FIELDS`
wire-strip discipline is the worked example —
`test_capability_negotiation.py::TestWireStripDiscipline`
asserts on what `translate_query_to_wire` strips, which is an
internal function but its contract is genuinely
field-by-field). These tests are flagging "this internal
contract is a structural commitment" and should be commented
as such.

---

## 5. Debugging discipline — lessons from 2026-05

The postmortem at
`docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
captures the investigation-side lessons in full. This section
distils them into actionable disciplines for future cross-
boundary bug investigations.

### 5.1 Ask for runtime visibility first

When investigating a cross-boundary bug (SPA↔proxy,
frontend↔backend, any case where the symptom surfaces in one
sub-project but the cause may live in another), ask for
runtime visibility into the non-local side *before* drawing
conclusions from wire-only observation.

For the proxy: structured JSON logs via
`PROXY_LOG_FORMAT=json` + `PROXY_LOG_DEST=file:...`, captured
per-node by the topology runner. The umbrella's
`run-selector-stack.py --log-dir DIR` makes this a one-flag
operation.

The 2026-05 investigation lost meaningful ground operating
blind to proxy logs for several rounds, including a wrong
"adaptive never fires" generalisation that the user had to
correct. The first request after orienting on a symptom should
be: "I'm operating blind to {sub-project}'s runtime; please
share its log capture, or tell me how to capture one."

This composes with ADR-0002 applied to the collaborator's
epistemic state: the absence of a log channel is itself
information that should be surfaced audibly, not papered over
with synthetic probes that may contradict the user-visible
reality.

### 5.2 Trust user signals over synthetic probes when they contradict

When a synthetic probe (a Node WebSocket script, a unit test,
an isolated repro) contradicts the user's real-world
observation, **the user signal is authoritative**. Investigate
the probe's setup before drawing conclusions about the
system's behaviour from the probe.

In 2026-05, a probe-corner-case (max_intermediates configured
too low → D and F packets at the same emit_count → `_are_equal`
short-circuit) was generalised into a "adaptive doesn't fire
in general" finding that didn't match the user's reality
(adaptive does fire in normal operation). The probe was right
about the failure mode it exposed; the generalisation was
wrong. The user-side end-to-end signal is the ground truth;
the probe is a hypothesis-generating tool.

### 5.3 Tests passing in synchronous environments can fail in async timing

The failed proxy v1.0.21 alias-branch experiment is the
cautionary tale. The regression test
(`tests/test_adaptive_enrichment.py` in that branch's first
iteration) drove parent-then-sub-query synchronously and the
alias mechanism worked. In real async operation, the parent's
analyzer was popped from `request_cache` ~3 ms before the
sub-query's `on_query` fired — the alias lookup missed
unconditionally.

Discipline: tests that involve cross-component state-passing
should exercise the actual async-driver ordering, not a
synchronous controlled environment. The
`test_adaptive_cache_matrix.py` pattern — bring up a
ClientSession with a running send_loop task, drive queries
through the production-shaped chain, capture wire output after
real-async settling — is the corrective pattern.

### 5.4 Quote source text rather than paraphrasing

When citing what a piece of code or documentation does, quote
the relevant passage rather than paraphrasing from summary.
Paraphrase drift produces stronger-than-warranted claims and
hides the precise mechanism the reader needs to evaluate the
claim.

This is the discipline that `feedback_quote_dont_paraphrase_docs.md`
in the LLM-collaborator auto-memory captures. The 2026-05
investigation iterated on this several times — the postmortem's
direct quoting of code passages at the file/line granularity
was what made the diagnostic reasoning auditable.

### 5.5 Make the wire the test surface, not the SPA

The SPA is not the right surface for testing proxy behaviour.
Adding SPA-side console.logs to debug a proxy issue is
acceptable as a last resort but should NOT be the primary
investigation mode. The wire is observable from any WebSocket
client; tests should exercise the proxy's contract through
that surface.

This composes with §1.2's motivation: the topology testing
substrate brings up the proxy chain; wire-level test clients
(Node scripts, Python WebSocket clients, the in-process
ClientSession pattern of §4) issue queries and assert on
responses. The SPA is the user-facing consumer, not the
testing surface.

---

## 6. Implementation arc

The work to land what this note designs:

1. **Substrate generalisation** in the umbrella (§2). New file
   `frontend/scripts/topology_runner.py` plus an
   `frontend/scripts/topologies/` directory for pre-canned
   topology JSON specs. `run-selector-stack.py` becomes a thin
   wrapper that constructs the SELECTOR-shaped spec from its
   existing CLI surface and delegates. Backward-compatibility
   preserved.

2. **Proxy-side `ENABLE_<CAPABILITY>` env-var family** (§3),
   landing as a proxy-side PR per the usual submodule release
   arc. The umbrella's `run-selector-stack.py` (now
   `topology_runner.py`) sets these on intermediate nodes of
   chained topologies by default.

3. **Per-topology test scripts** under
   `frontend/scripts/topologies/tests/` (or in
   `proxy/tests/diagnose_*` if the test better belongs there):

   - `test_relay_coalescing.py` — two clients, identical query,
     one RELAY, two LEAFs; assert one upstream LEAF receives
     one query and both clients get all responses.
   - `test_relay_load_distribution.py` — N distinct queries
     through a RELAY → 2-LEAFs topology; assert dispatch
     distribution.
   - `test_chained_no_double_adaptive.py` — SELECTOR with
     adaptive enabled → LEAF with `PROXY_ENABLE_ADAPTIVE_REEVALUATE=false`;
     assert adaptive fires exactly once.
   - `test_chained_double_adaptive_smoke.py` — the same
     topology with adaptive enabled on both layers (an
     operator misconfiguration); assert the pathology is
     observable in log output, possibly with a startup warning
     from the runner naming the misconfiguration. This is the
     "tests-pin-the-failure-mode" half of §3's decision.

The order is sequential: §1 substrate first (it's a prerequisite
for §3 tests), §2 proxy-side change next (it's a prerequisite
for chain-pathology tests), §3 test scripts last (consumes
both). Each phase is a separate PR.

---

## 7. Open questions

- **Synthetic backend factoring.** §4.1 mentions promoting
  `MaxVisitsSyntheticRouter` and any future variants to a
  `synthetic_backends.py` module (plural). The right shape
  becomes clear when a third variant exists; deferred until
  then.
- **Topology spec serialisation format.** JSON, YAML, or
  inline Python — current note assumes JSON for the canned-
  topology files but a Python dataclass would also work. Decide
  at implementation time based on which is more ergonomic for
  the per-topology test scripts.
- **Wire-schema reference doc.** The postmortem §5.1
  recommended a single `docs/wire-schemas.md` covering every
  cross-team wire shape. Adjacent to but distinct from this
  note; deferred to its own arc (likely a separate dispatch
  document under `docs/dispatch/` if the schema needs proxy/
  backend coordination).
- **Wire-attached diagnostic envelope.** The postmortem §5.3's
  speculative `extra._diagnostic` proposal (gated on a proxy
  env-var, attaches transformer-engagement metadata to
  responses) is still open. Adjacent to §3's
  `ENABLE_<CAPABILITY>` family; the two could share the
  capability-advertisement plumbing. Deferred to a future
  proxy-side design exploration.

---

## 8. Related documents

- `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
  — the investigation this note's §5 disciplines distil.
- `docs/adr/0002-fail-loudly.md` — the loud-failure tenet §3's
  decision shape mirrors.
- `docs/adr/0005-documentation-discipline.md` — Rule 8's
  doc-graph genre vocabulary this note opens with.
- `proxy/CLAUDE.md`'s "heartbeat-fanout contract" section —
  the precedent for "operator-declarative chain configuration"
  this note's §3 builds on.
- `proxy/ARCHITECTURE.md` §"ID namespaces and translation" —
  the ID-namespace discipline that makes the multi-process
  topology pattern safe (and rules out the single-process
  variant for cross-role testing).
- `proxy/FRAMEWORK.md` §6 — the OrchestrationMiddleware design
  the chained-enrichment pathology emerges from.
- `proxy/tests/test_adaptive_cache_matrix.py` — the
  matrix-test pattern §4.2 generalises.
- `frontend/scripts/run-selector-stack.py` — the substrate
  §2 generalises.

---

## 9. Sunsetting

This note is `design-note: planned`. Per ADR-0005 Rule 8,
when the implementation arc in §6 lands, this note becomes
`design-note: implemented` (a sibling file under `docs/archive/notes/`
takes the planning-time record, this file is updated in place
to reflect the implemented state). If a §3 decision needs
revision before implementation, that revision lands as a
sibling marked `design-note: revised`, preserving the
planning-time record per ADR-0005 Rule 8.
