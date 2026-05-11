# Frontend → Proxy: SELECTOR role and capability negotiation

- **Date:** 2026-05-09 (revised same day pre-commit — see *Revision
  note* below)
- **From:** frontend (umbrella session)
- **To:** proxy (KataProxy submodule)
- **Type:** request — three contract additions: (1) a two-sided
  capability-negotiation protocol — server advertisement on
  `query_version`'s response, populated by any role that handles the
  action, plus a symmetric per-query opt-in field on the analysis
  query; (2) a new Layer 3 `BackendRouter` (provisional name SELECTOR)
  that dispatches per-query by reading a client-supplied `model` field
  on the canonical query payload; (3) a `model: string` field on the
  analysis query plus extended `query_models` semantics on SELECTOR.
  Phase 1 closes a pre-existing fail-loud violation around the SPA's
  transposition toggle and gives the proxy architectural hygiene
  around the unconditional Python↔C++ boundary cost the
  `transposition_enricher` pays today.
- **Status:** drafted; awaiting proxy-side review and architectural
  sign-off before frontend implementation begins.
- **Suggested filing:** `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`
  per ADR-0005's dispatch-ledger convention. Second entry in the
  frontend↔proxy direction (the keep-alive request was the first).
- **Companion design note:** the frontend-side design rationale lives
  at `docs/archive/notes/proxy-selector-and-capability-negotiation.md` and is
  the planning-time record this dispatch is drawn from. The dispatch
  is self-contained for proxy-side review; the note carries the
  why-from-the-frontend's-perspective.

## Revision note

The initial draft framed capability negotiation as advertisement-only —
the client detects support and decides whether to engage at the
connection level. That framing missed an architectural opportunity.
Capability negotiation is naturally a two-sided protocol: the server
advertises what it *can* do, and the client opts in per-query for what
it *wants done* on each query. Two consequences worth naming:

- **Compatibility-incompatible features can be disabled per-query
  rather than refused at the connection.** `adaptive_reevaluate`'s
  mid-turn follow-up queries break the SPA's turn-locked
  review-session timing in ways that aren't fixable client-side; with
  per-query opt-out, the same WebSocket serves both review-session
  queries (with adaptive disengaged) and range-based analysis queries
  (with adaptive enabled). The user gets efficient adaptive analysis
  where it pays off and uncorrupted review-session timing where it
  matters, on one connection.
- **The proxy can skip work it wasn't asked to do.** Today's
  `transposition_enricher` runs unconditionally for every query when
  the Transformer is wired, paying the Python↔C++ boundary cost on
  every analysis packet whether the user has the registry toggle on or
  off. With per-query opt-in, the proxy short-circuits when the
  capability isn't requested. Architectural hygiene: the proxy does
  work in proportion to what's asked.

The amendments are concentrated in Ask 1 (the protocol becomes
two-sided), the Phasing section (Phase 1 now ships both halves of the
protocol), and the Behavioural contract (per-query opt-in instead of
toggle-refusal). The `selector` capability advertisement (Ask 2)
remains advertisement-only — `selector` is a routing capability that
gates UI rendering, not a behavioural capability the client engages
per-query, and the routing itself flows through the dedicated `model`
field rather than through the capability protocol.

## Why

The frontend's analysis service connects to one proxy URL and reads
`query_models` to learn which model that proxy is serving. That is
the totality of model knowledge today. Two consequences:

A user with multiple KataGo networks running on the same machine —
multiple LEAFs on multiple ports — has no in-app way to switch
between them. They edit the registry URL and reconnect, which is not
a model selector.

Real-time model-vs-model is currently impossible. Strong network
reviewing weak network's move, two networks alternating in self-play,
the multi-weights and LLM-at-seat policies the autonomous-SR-loop
note sketches — all want the same primitive and none of them have
it.

The proposal is a new proxy role (SELECTOR) that lets clients name
which upstream a query targets, plus a two-sided capability-negotiation
protocol. The capability protocol is independently motivated. The
SPA's advanced registry has a "use transposition" toggle that exists
on the assumption that the proxy has `goboard_transposition` compiled
and the `transposition_enricher` Transformer wired. There is no probe
that verifies the assumption, and when the module is missing the
toggle silently controls nothing — analysis packets arrive without
enrichment fields, the user sees no transposition highlights, and
there is no signal that they asked for something the proxy can't
deliver. Transpositions are rare enough in real positions that the
silent breakage often goes unnoticed. That is exactly the
silent-fallback failure mode ADR-0002 forbids. Phase 1 closes it,
and along the way takes the `transposition_enricher` from
"unconditionally engaged when wired" to "engaged when the client
opts in per-query," which is the architectural-hygiene improvement
the *Revision note* names.

## Asks

Three contract additions. They are layered: Phase 1 is independently
shippable and has standalone value (the transposition fix and the
per-query opt-in mechanism), Phase 2 extends the same machinery to
advertise SELECTOR support, Phase 3 is the SELECTOR role itself.

### Ask 1 — Two-sided capability-negotiation protocol

**Server advertisement on `query_version`'s response.** Extend
`query_version`'s response with a `capabilities` field, populated by
whichever proxy role serves the response. Today that means LEAF,
RELAY, ECHO, and (when shipped) SELECTOR — every role whose protocol
stack runs deep enough to handle `query_version`. REDIRECT does not
qualify structurally: `RedirectSession` (Layer 1, `proxy_server.py`)
writes the upstream URL into a redirect message and closes the
WebSocket before the client gets to issue the probe.

**Wire shape on the response — a dict, not a flat list.**

```json
{
  "id": "...",
  "version": "1.0.X",
  "capabilities": {
    "transposition": {},
    "adaptive_reevaluate": {}
  }
}
```

A flat `capabilities: string[]` works for presence/absence but
forecloses on capabilities that need parameters. Near-future ones
will: a transposition advertisement might enumerate which algorithms
are compiled in; an `adaptive_reevaluate` advertisement might carry
the metric names the middleware operates on. The dict shape costs
nothing for capabilities without metadata and leaves the door open
for those with.

**Client per-query opt-in on the analysis query.** Symmetric to the
advertisement: add a `capabilities` field on the analysis query
payload, same dict shape. Each entry the client lists is a request to
engage that capability for this query. Empty metadata `{}` means
opt-in with proxy defaults; an object with capability-specific config
means opt-in with that config.

```json
{
  "id": "...",
  "moves": [...],
  ...,
  "capabilities": {
    "transposition": {}
  }
}
```

Worked examples (the SPA always opts in to `delta_analysis`; what
varies across query kinds is which other capabilities ride along):

- *Review-session query (turn-locked).* Client sends
  `capabilities: { "delta_analysis": {} }`. Proxy engages delta
  analysis (the `analysis_enricher` Transformer applies, producing
  the per-move deltas the review-session grading reads from
  `extra.<color>.deltas`); does not engage `adaptive_reevaluate`
  (no follow-up queries fired, turn-locked timing preserved); does
  not engage `transposition` (Python↔C++ boundary skipped).
- *Range-based analysis query (transposition on).* Client sends
  `capabilities: { "delta_analysis": {}, "transposition": {}, "adaptive_reevaluate": {} }`.
  All three engaged: delta enrichment lands in `extra.<color>.deltas`,
  transposition fields appear in responses where applicable,
  `adaptive_reevaluate`'s middleware fires follow-ups as it does
  today.
- *Range-based analysis with transposition off (user toggle).* Client
  sends `capabilities: { "delta_analysis": {}, "adaptive_reevaluate": {} }`.
  Delta and adaptive engaged; transposition Transformer
  short-circuits.

The default semantics when the query carries no `capabilities` field
at all are open below — preserving today's auto-engage-when-wired
behaviour for old clients is the obvious choice; the proxy team
should confirm.

**Granularity.** Capabilities are at the extension level: one
capability per Transformer or per middleware. Opting into
`delta_analysis` engages the entire `analysis_enricher` Transformer
and the SPA gets every field it produces; opting into `transposition`
engages the entire `transposition_enricher`. The wire fields each
extension produces come or go as a unit. Finer-grained opt-in
("deltas yes, triangular no") is not offered — supporting it would
cut cross-cutting plumbing through Transformer internals, and no
current consumer needs it.

**Initial capabilities — `delta_analysis`, `transposition`, and
`adaptive_reevaluate`.** Three existing proxy-side features whose
engagement should become client-controllable.

- `delta_analysis` is set on the response by any role with the
  `analysis_enricher` Transformer wired (the proxy-side glue around
  `DeltaAnalysisState`). The Transformer produces the full per-move
  enrichment payload as a unit — `extra.state` (state metrics by
  turn), `extra.<color>.triangular` (per-player triangular
  heatmaps), `extra.<color>.deltas` (per-move quality deltas), and
  the reserved `extra.<color>.cwt` slot. The SPA's review-session
  grading reads `extra.<color>.deltas` directly; other UI surfaces
  consume `extra.<color>.triangular` and `extra.state`; every
  analysis query the SPA issues — review-session, analysis-tab,
  range-based — depends on at least one of these. From the SPA's
  perspective the capability is universally required. It appears
  in the protocol because other proxy consumers may not need it,
  and because expressing "this query wants delta analysis"
  explicitly is cleaner than relying on auto-engage-when-wired.
  The existing `analysis_config` query field continues to carry
  the palette definition the Transformer applies; the capability
  gates engagement, the config parameterises it.
- `transposition` is set on the response by any role that has
  `goboard_transposition` importable and the `transposition_enricher`
  factory wired. Engaged on the query by clients that want
  transposition enrichment for that query. Closes the registry-toggle
  silent-fallback violation; lets the proxy skip the Python↔C++
  boundary when not requested.
- `adaptive_reevaluate` is set on the response by any role that has
  the `adaptive_reevaluate` middleware in its `MiddlewareChain`.
  Engaged on the query by clients running range-based analysis;
  *omitted* by clients running review-session queries on the same
  connection (its mid-turn follow-up queries break the SPA's
  turn-locked review-session timing in ways that aren't fixable
  client-side).

**Backward compatibility.** Old proxies don't emit the response field
and don't read the query field. New clients connecting to old proxies
read response-side absence and fall through to legacy behaviour
(today's auto-engage-when-wired); their per-query opt-in field is
ignored by the old proxy, which auto-engages whatever is wired
regardless. New proxies receiving old-client queries (no
`capabilities` on the query) use legacy semantics — same auto-engage
as today, preserving the wire contract for clients that haven't
migrated. Wire compatibility holds in both directions.

**Fail-loud disposition.** A frontend reading response-side
`capabilities` absence is feature detection, not silent fallback in
the ADR-0002 sense — the legacy path is honest, the capability-aware
path is honest, the choice between them is observation-driven rather
than guess-driven. A frontend that needs a capability the proxy
doesn't advertise (e.g., user has the transposition toggle on, but
the proxy doesn't list `transposition` in its advertisement) surfaces
a system message naming the unmet capability so the user can act.

### Ask 2 — `selector` capability advertisement

When SELECTOR ships (Ask 3), it sets `selector` in the
response-side capability dict:

```json
"capabilities": {"transposition": {}, "selector": {}}
```

Empty metadata; presence is the signal. Unlike the behavioural
capabilities of Ask 1, `selector` is a *routing* capability — it
gates whether the model dropdown UI is meaningful, not a per-query
behaviour the client opts into. The routing itself flows through the
dedicated `model` field on the query (see Ask 3); `selector` does not
appear in the query's `capabilities` field. The advertisement-only
shape is correct for this capability specifically; future routing
capabilities (if any emerge) would follow the same pattern.

The frontend uses `selector` advertisement to decide whether to
render the model dropdown UI; rendering optimistically and tearing
the dropdown down on the first failed query is a worse UX than not
rendering it at all.

### Ask 3 — SELECTOR role: a new Layer 3 `BackendRouter`

A new `BackendRouter` peer to `LeafRouter`, `RelayRouter`,
`EchoRouter` in `router.py`. (REDIRECT is *not* in this comparison —
`RedirectSession` is a Layer 1 `ClientSession` subclass; the four
`PROXY_ROLE` env var values map to two architectural strata, and
SELECTOR slots in among the routers, not alongside `RedirectSession`.
The shallow symmetry of "all four are env var values" doesn't extend
deeper.)

**Routing function.** Read `model: string` from the canonical query,
look up the upstream LEAF by label, dispatch via the persistent
WebSocket connection. Strip `model` from the forwarded query payload —
vanilla KataGo doesn't know the field.

**Why a separate role rather than a routing-policy parameter on
`RelayRouter`.** `RelayRouter`'s invariant is that upstreams are
interchangeable: `LoadMetric` exists to balance fungible work across
them, the hash ring exists to keep cache locality, and both assume
the same query has the same answer regardless of which upstream
serves it. SELECTOR's invariant is the opposite: upstreams are
distinguishable, each loaded with a different model, and label-routed
dispatch is honouring a client's specific selection. The two are the
same kind of architectural object (a router speaking the proxy's wire
to upstream LEAFs over WebSocket) but encode opposite assumptions
about what the upstream pool means. Folding both into one router
would mean the dispatch function branches on payload shape, carrying
a structural distinction the type system should be carrying instead.
A separate `SelectorRouter` puts the invariant in the type — no
`LoadMetric` to mismeasure, no hash ring to disregard, dispatch is a
labelled dictionary lookup.

**Configuration.** SELECTOR consumes `UPSTREAM_URLS` the same way
`RelayRouter` does, but builds a `{label → upstream}` map at startup
rather than a hash ring. Two open questions for proxy-side decision
listed below.

**Failure modes** (per ADR-0002):

- *Unknown model in a query.* SELECTOR returns a `KataErrorResponse`-shaped
  error (`{id, error, field: "model"}`) naming the unknown label.
  Frontend surfaces a system message and aborts the current operation.
  Substituting "whatever LEAF happens to be running" for the requested
  model would be exactly the silent-fallback failure mode the tenet
  forbids: the user asked for a specific model, and the absence of
  that model is information.
- *Upstream LEAF down mid-session.* Same disposition. The query
  routed to the dead upstream fails loudly; the frontend aborts.
  Automatic failover to a different model would silently answer a
  different question than the one asked.
- *Two upstreams claiming the same label at startup.* SELECTOR
  refuses to start, raising at the `LeafStartupError` register: an
  exception naming both upstream URLs and the conflicting label. An
  ambiguous routing table is a startup-time loud failure, not
  "resolve at runtime by guessing."

### Wire-shape extensions accompanying Ask 3

Two narrow additions on the wire, beyond the per-query `capabilities`
field of Ask 1.

**A `model: string` field on the analysis query.** The client sets
it when targeting a SELECTOR; SELECTOR's router consumes it as the
routing key and strips it from the payload before forwarding. `model`
joins the family of client-set, proxy-interpreted, never-reaches-engine
query fields — `cache`, `lookup_cache`, `replay_final_only`,
`analysis_config` — that already terminate at the proxy boundary. The
new per-query `capabilities` field of Ask 1 joins the same family.
The semantics are consistent across all of them: client supplies,
proxy interprets, none reaches the engine.

**`query_models` extended on SELECTOR.** On a LEAF it returns the
single loaded model. On SELECTOR it returns the union — one entry per
upstream LEAF, each entry carrying the SELECTOR's chosen label as the
identifier the frontend will pass back via `model`. The wire shape
stays a list (the frontend's existing `KataActionResponse.models:
readonly unknown[]` accommodates anything), so no consumer-side
parsing changes are needed.

**Coalescing implications.** The Hub's content hash already covers
the canonical query payload, so the inclusion of `model` and
`capabilities` falls out automatically: two queries with the same
core content but different `model` or different `capabilities` are
different canonical queries, route to different upstreams (in
SELECTOR's case) or trigger different transformer chains (in the
capabilities case), get different responses. Worth a confirming look
that the canonical-key derivation in `pubsub_hub.py` doesn't strip
proxy-control fields before hashing — if it does, both `model` and
`capabilities` would need to be retained in the hash input, or
queries with different opt-in sets would incorrectly coalesce.

**Replay cache implications.** Same shape — the cache keys on the
canonical, so a transposition-enriched analysis and a
transposition-skipped analysis for the same position cache as
separate entries. Which is right; they are different artifacts.

**Transformer pass-through.** Existing transformers operating on the
query payload don't know about `model` or `capabilities` and
shouldn't strip them. If the query parser uses an `opaque: dict[str,
Any]` pattern mirroring the v1.0.13 response-variants split, this
falls out of the existing machinery; worth a confirming look on the
proxy side.

## Phasing

Three layered changes. Phase 1 is independently shippable and has
standalone value (closes the transposition fail-loud violation, gives
the proxy architectural hygiene around the Python↔C++ boundary).
Phase 2 extends the same capability machinery to advertise SELECTOR.
Phase 3 is the SELECTOR role itself, which depends on Phase 1 for the
advertisement channel but is otherwise architecturally separate.

**Phase 1 — Two-sided capability protocol + initial capabilities.**
`query_version`'s response gains the `capabilities` dict; the
analysis query gains the symmetric `capabilities` field. LEAF (and
any role with the relevant Transformers/middleware wired) sets
`delta_analysis`, `transposition`, and/or `adaptive_reevaluate` in
the advertisement. The query-side opt-in gates whether each
Transformer/middleware engages on a given query. Default semantics
for queries without the field follows the proxy team's choice on
the open question below (legacy auto-engage is the obvious choice).
Suggested tag: a minor bump (`v1.0.X+1`). Umbrella pointer-bump PR
follows.

**Phase 2 — `selector` capability advertisement.** Empty metadata;
becomes meaningful when Phase 3 ships. Either fold into Phase 1
(cheap) or release with Phase 3 (also cheap) — proxy side calls it.

**Phase 3 — SELECTOR role MVP.** New `BackendRouter`, `UPSTREAM_URLS`
consumed with labelled-set semantics, label table populated per the
chosen sourcing decision, structured-error for unknown model,
per-upstream failure budget. `query_models` extended. Capability
advertisement extended to set `selector` when in SELECTOR role.
Suggested tag: a minor bump (`v1.0.X+2`). Umbrella pointer-bump PR
follows.

## Open questions for the proxy side

1. **Default semantics when the query has no `capabilities` field.**
   Two interpretations: legacy auto-engage (proxy auto-engages all
   wired Transformers/middleware, preserving today's behaviour and
   keeping old clients working unchanged) or explicit opt-in only
   (proxy treats absence as "engage nothing"). Frontend's lean is
   legacy auto-engage — old clients keep working and new clients
   that want explicit control send `capabilities` (possibly `{}` to
   opt out of everything). Proxy side confirms.

2. **Label sourcing for SELECTOR.** Probe each upstream's
   `query_models` at startup (lightest config burden; couples startup
   to upstream availability) or operator-declared `(URL, label)`
   tuples (more robust against late-binding upstreams; heavier
   config). The frontend's lean is the latter — it's failure-loud at
   startup if a declared label has no upstream, which fits ADR-0002's
   posture better than "wait for upstream, hope it advertises
   something" — but the proxy team is closer to the
   upstream-lifecycle concerns and should decide.

3. **Per-upstream failure budget shape.** The single-LEAF case has a
   3-retry budget then an unhealthy state. The natural mirror is
   per-upstream budgets feeding into per-model unhealthy markers
   (queries routed to an unhealthy model fail loudly; queries to
   other models route normally). Detail to settle: per-upstream vs
   aggregate counters, recovery semantics (does a model stay
   unhealthy until manual restart, or does it recover after a
   timeout?), the user-side surfacing of "this model is currently
   unavailable."

4. **Capability metadata schema, per capability.** Free-form forever,
   or formalised per capability as it lands? The dispatch lands with
   `transposition: {}`, `adaptive_reevaluate: {}`, and `selector: {}`
   (all empty); future capabilities may want richer metadata.
   Stylistic call.

5. **Set point for response-side capability advertisement.** Set at
   startup based on whether modules imported successfully and the
   relevant Transformers/middleware are in the configured chain, or
   per-query-shape based on which transformers actually run on a
   given query? Frontend's lean is startup-time — the advertisement
   is about "what this proxy can do" rather than "what this query
   would have run through" — but flag if there's a proxy reason to
   prefer a per-query shape.

6. **Canonical-key derivation in the Hub.** Confirms that the
   existing coalescing-key derivation either includes the new fields
   (`model`, `capabilities`) or can be made to include them without
   architectural disruption. If proxy-control fields are stripped
   from the hash input today, the new fields must be retained —
   different models and different opt-in sets produce different
   analyses and must not coalesce.

## Behavioural contract — what the frontend will and won't do

For visibility, not for proxy review.

**Frontend will:**

- Add `capabilities` to the typed `query_version` response (optional
  field) and `model` and `capabilities` to the typed analysis query
  (both optional) as type-only scaffolding, before the proxy ships.
- Render a Toolbar dropdown sourced from `query_models` when
  `capabilities.selector` is present on the version response.
  Selection writes to engine state via a named mutator and persists
  through the sync service.
- Inject `model` into outgoing analysis queries at the
  analysis-service ACL when a model is selected.
- Always inject `delta_analysis` in the per-query `capabilities` —
  every analysis query the SPA issues depends on it. The capability
  engages the full `analysis_enricher` Transformer, which produces
  per-move deltas (review-session grading), triangular heatmaps
  (other UI surfaces), state metrics by turn, and the reserved CWT
  slot, all as a unit. The existing `analysis_config` field
  carrying the palette continues to ride alongside.
- Inject `transposition` in the per-query `capabilities` when the
  user has the registry's transposition toggle on AND the proxy
  advertises `transposition`. When the toggle is on but the proxy
  doesn't advertise the capability, surface a system message
  naming the unmet capability so the user knows the toggle isn't
  being honoured.
- Inject `adaptive_reevaluate` in the per-query `capabilities` on
  range-based analysis queries (where its mid-turn follow-up
  pattern is appropriate); *omit* it on review-session queries so
  the turn-locked timing the review session assumes is preserved.
  Same connection serves both.
- Extend the test harness's `playEngineMoves` / `queryEngineMove`
  exports with optional `model` and `capabilities` parameters,
  enabling the multi-weights and LLM-at-seat policies the
  autonomous-SR-loop note sketches.

**Frontend will not:**

- Refuse the connection over capabilities the SPA could opt out of
  on a per-query basis. `adaptive_reevaluate`'s incompatibility with
  review-session timing is handled by per-query opt-out, not
  connection refusal — the same WebSocket serves both kinds of
  traffic. (Exception: capabilities the SPA universally requires.
  `delta_analysis` falls in this category — if the proxy advertises
  capabilities at all and `delta_analysis` is absent, the SPA
  refuses the connection with a system message naming the unmet
  requirement, since per-query opt-in to a capability the proxy
  doesn't have is empty.)
- Render the model dropdown optimistically when
  `capabilities.selector` is absent. Feature detection is the gate.
- Auto-failover to a different model when an upstream LEAF is down.
  Loud abort per ADR-0002.
- Maintain client-side fallbacks for missing transposition. The
  toggle's request goes out as `capabilities.transposition`; if the
  proxy doesn't advertise it, the frontend surfaces; no synthesis.
- Route by content-hash ever — that is `RelayRouter`'s posture, and
  SELECTOR's whole premise is the opposite. The frontend's `model`
  field is the routing key, full stop.

## Reply

Status replies on
`docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`.
Anything from "Phase 1 committed, contract as proposed" to "the
dispatch needs revision in these places: …" lets the umbrella
proceed (or pause) with the corresponding pointer-bump or revision
arc.

If any wire-shape detail needs revision — alternative shape for
`capabilities`, alternative `model` field name, alternative
routing-table sourcing, anything that doesn't fit the proxy's
architectural intuitions cleanly — say so before either side commits.
The contract here is the load-bearing thing, and the cheap moment to
revise it is now.

— end request —
