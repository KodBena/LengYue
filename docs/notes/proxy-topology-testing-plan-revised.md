# Proxy topology testing — revised design note

Status: `design-note: revised` (2026-05-16). Supersedes the
planning-time record at
`docs/notes/proxy-topology-testing-plan.md` per ADR-0005 Rule 8
(sibling revisions over silent edits). The original captured the
design when the substrate was scoped to the umbrella tree and the
chained-enrichment loud-failure was framed as the load-bearing
concern; this revision is the post-discussion-and-implementation
note now that the substrate has been relocated to the proxy repo,
RELAY testing has been identified as the actual driving
requirement, and the chained-enrichment framing has been corrected.

This note records what changed and what landed. The original is
retained as the planning-time record for trace; reading both end
to end gives the full design arc.

## Why this revision exists

Five corrections surfaced between the original and now. The first
two are structural (relocation + re-priority); the next three are
framing fixes the implementation surfaced; the last is a status
update on a non-load-bearing reference.

### 1. Substrate belongs in the proxy repo, not umbrella

The original plan's §2 scoped the substrate to
`frontend/scripts/topology_runner.py` because that's where the
SELECTOR-shaped ancestor `run-selector-stack.py` happened to live
(authored by a frontend collaborator when a test needed it). That
location was incidental, not deliberate. The substrate's only
consumers are proxy diagnostics; its expertise (KataGo wire
protocol, three-layer architecture, role-specific env-var
contracts, structured-log event vocabulary) is entirely proxy-side.
Relocating to `proxy/tests/topology_runner.py` puts the substrate
where its expertise lives.

The umbrella's `run-selector-stack.py` is not retired by this
revision — it stays for its existing SELECTOR-specific operator
convenience surface. The relocation is additive: the proxy now
has a generalised topology substrate; the umbrella still has its
SELECTOR-shaped launcher.

### 2. RELAY testing is the actual driving requirement; the §3 env-var family is deferred

The original plan §1.2 named three motivations (RELAY coalescing /
distribution; chain pathologies; in-process pattern guidance). On
reflection the priority ordering is unbalanced — chain pathologies
(§3) is "a reasonably competent operator would think about chain
composition before stacking enrichment middleware at multiple
layers; we shouldn't inherently distrust operators" (the user's
position, 2026-05-16). RELAY coalescing and distribution are the
genuinely-unexercised contracts and what the substrate is for.

The implementation arc reflects this: §3's `PROXY_ENABLE_<CAPABILITY>`
env-var family is deferred from the in-scope work. If it lands in
a future arc, the framing should follow the §3 correction below
(no pretense of startup-time loud failure).

### 3. §3's "fail loudly at proxy startup" framing was incorrect

The original §3.2 headline claimed *"a chain that re-engages the
same enrichment middleware at multiple layers is a configuration
error and must fail loudly at proxy startup,"* and §3.3 ruled out
chain-aware auto-detection. The actual mechanism — per-proxy
`ENABLE_<CAPABILITY>` env vars — does not fail loudly at startup
when the operator misconfigures across a chain: each proxy reads
only its own config, has no visibility into the chain, and starts
fine with adaptive enabled even if another proxy in the chain has
it enabled too. The loudness, if any, lives entirely in
operator-declarative configuration being explicit rather than
implicit — a weak reading of ADR-0002's loud-failure tenet.

Calling this "fail loudly at proxy startup" doesn't fit ADR-0002's
level-3 "runtime exception at startup" register. The honest
framing is "operator-declarative at proxy startup, with the
substrate's defaults setting intermediate-node enable flags
correctly when bringing up a chain via TopologyRunner." If the
env-var pattern lands in a future proxy arc, the framing should
follow this correction.

### 4. §3.5 transposition_enricher characterisation: transformer-class, not orchestration-class

The original §3.5 names `transposition_enricher` as the likely
second consumer of the chained-enrichment pattern. The
characterisation glossed a real distinction: `adaptive_reevaluate`
is an OrchestrationMiddleware that spawns sub-queries (geometric
chain amplification — `worst_quantile^N` of original work per
chain layer N); `transposition_enricher` is a Transformer that
runs per-response enrichment (linear chain amplification — N times
the enrichment compute per response per chain layer N). Both
chain-amplify when chained, but in different magnitudes and via
different mechanisms.

The §3 env-var pattern still applies to both — operator-declarative
disable at intermediate layers — but the §3.1 walk-through is
written entirely against the orchestration / recursive-deepening
shape. A future reader looking for guidance on the transformer
case (linear amplification of per-response work) won't find it in
the original §3.

Note also that `analysis_enricher` (also a Transformer) currently
escapes its chain-amplification pathology only because
`analysis_config` is popped at the first layer (the same pop the
2026-05 adaptive-deeper-enrichment postmortem identified as the
bug — the deeper sub-query inherits a stripped opaque). Adopting
the postmortem's Option A (read-not-pop) would put
`analysis_enricher` in the same linear-amplification-under-chaining
category as `transposition_enricher`. The §3 pattern then applies
to it too.

### 5. §7 "wire-schemas reference doc": already landed

The original §7 names a wire-schema reference doc as a deferred
adjacent arc. Per `docs/handoff-current.md` and the sibling
postmortem at
`docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md` §5.1,
this shipped as `docs/wire-schemas.md` (umbrella PR #204) before
this revision was filed. The deferred-arc framing in the original
§7 is therefore stale.

The other §7 open questions (synthetic backend factoring, topology
spec serialisation format, wire-attached diagnostic envelope) remain
open and unchanged.

## What landed

The substrate + Tier 3 diagnostics are implemented on a proxy-side
feature branch (`feat/topology-testing-substrate`), pending merge
+ tag + umbrella submodule pointer bump per the standard arc:

  - `proxy/tests/topology_runner.py` — NodeSpec / TopologySpec /
    TopologyRunner. Subprocess spawn, port allocation, readiness
    polling, structured-log capture, reverse-topological-order
    termination. Supports all five roles plus `pre_existing_url`
    upstreams.
  - `proxy/tests/test_topology_runner.py` — 22 pure-logic unit
    tests for spec validation and topological sort.
  - `proxy/tests/test_relay_coalescing.py` — Tier 2 in-process
    test: PubSubHub + RelayRouter integration; two subscribers
    with identical content → 1 canonical → 1 dispatch → fan-out
    to both with relabelled `id`. Plus the negative control
    (distinct queries don't coalesce).
  - `proxy/tests/test_relay_load_distribution.py` — Tier 2
    in-process test: N=30 distinct canonicals over 3 upstreams,
    no starvation, no skew >75%. Plus the load-aware fallback
    branch (skip saturated, pick least-loaded when all
    saturated).
  - `proxy/tests/diagnose_relay_coalescing_e2e.py` — Tier 3
    multi-process diagnostic against real upstream LEAFs.
    Verified end-to-end (1/1/1 events; canonical →
    one upstream).
  - `proxy/tests/diagnose_relay_load_distribution_e2e.py` — Tier 3
    diagnostic. Verified end-to-end (12 queries; 6/2/4 spread;
    max share 50%).

All 283 in-process pytest tests pass; both Tier 3 diagnostics
pass against `ws://192.168.122.1:1235-1237`.

## What didn't land (and why)

The §3 env-var family (`PROXY_ENABLE_<CAPABILITY>`) is deferred.
If picked up in a future proxy arc:

  - Frame it as operator-declarative configuration, not "fail
    loudly at startup" (per the §3 correction above).
  - The pattern applies to both Transformers (linear amplification)
    and OrchestrationMiddleware (geometric amplification), but
    via different mechanisms inside `_make_middleware` and the
    transformer chain. The transformer case is the under-developed
    half — see §4 above.
  - The `TopologyRunner` substrate is the natural place to default
    intermediate nodes' enable flags when bringing up a chain
    fixture; `_build_env` is the hook.

## Open items the implementation didn't resolve

### Pending KataGo bug report (was original §5.3's "3 ms race")

The original §5.3 cites a "failed proxy v1.0.21 alias-branch
experiment, 3 ms race" as the cautionary tale for tests passing
in synchronous environments but failing in async timing. Per the
user (2026-05-16), the 3 ms race appears to actually be a KataGo
bug, with documentation in `~/katago_bugreport`. Before reporting
upstream the user intends to run on stdin/stdout to eliminate the
WebSocket as a confounder. The §5.3 framing is suspended pending
that work — if the bug is in KataGo, the "tests passing in
synchronous environments" discipline still stands, but the
specific worked example (`v1.0.21 alias-branch`) is mischaracterised
and would need a sibling correction. Marking this open rather than
closing it.

### Readiness probe noise

The substrate's `_wait_for_listen` opens a raw TCP socket
(`asyncio.open_connection`) and closes it without an HTTP/WebSocket
handshake. The websockets server side logs an InvalidMessage
exception per probe — noise, not a failure (the proxy starts and
serves correctly), but worth replacing with a real
`websockets.connect` probe in a future cleanup so the spawn log
isn't peppered with spurious traces. Surfaced in the
`test(topology)` commit's message; tracked here too so a future
substrate consumer doesn't have to re-derive the explanation.

## Sunsetting

This sibling is `design-note: revised`. When the proxy feature
branch merges and the umbrella submodule pointer advances, the
"What landed" section becomes the implementation reference; the
status can move to `design-note: implemented` for that section.
The "What didn't land" section keeps its own pending status until
the env-var family lands (or is explicitly retired). The "Open
items" section sunsets per-item: the KataGo bug report's
resolution feeds back to the §5.3 framing; the readiness probe
cleanup retires its own item.

If a §3 framing needs further revision (e.g., the env-var family
gets a different shape than the operator-declarative one), file
a fresh sibling marked `revised` per the same Rule 8 pattern.

## Related documents

  - `docs/notes/proxy-topology-testing-plan.md` — the original
    planning-time record this sibling supersedes.
  - `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
    — the sibling postmortem the original §5 disciplines distil.
    The §3.5 transposition_enricher discussion above composes
    with this postmortem's Option A discussion of
    `analysis_enricher`'s `analysis_config` pop.
  - `docs/wire-schemas.md` — the wire-schema reference the original
    §7 framed as deferred; landed in umbrella PR #204.
  - `docs/adr/0002-fail-loudly.md` — the tenet the original §3
    invoked; the §3 correction above reframes which
    register-of-the-tenet the env-var pattern actually fits.
  - `docs/adr/0005-documentation-discipline.md` — Rule 8 is what
    this sibling implements.
  - `proxy/tests/topology_runner.py` and the four sibling test /
    diagnostic files — the implementation this revision
    references; commits on the proxy `feat/topology-testing-substrate`
    branch.
