# Proxy SELECTOR role and capability negotiation — design note

Status: design — frontend perspective on a proxy-side feature.
Captured because the autonomous-SR loop note's multi-weights
policies depend on it, and because the wire-shape changes need
proxy-side review before either side starts implementing.

## The thought

A KataGo analysis binary loads one neural network at startup, and
the proxy's LEAF role wraps one analysis binary. Operators who
serve multiple models therefore run multiple LEAFs on multiple
ports. The frontend connects to one URL, sees `query_models`
return one entry, and that's the totality of its model knowledge.

This is fine for a single-model deployment and obstructive for
everything else. A user with a strong reviewer and a weaker
teaching network on the same machine has no in-app way to switch;
they edit the registry URL and reconnect, which is not a model
selector. Real-time model-vs-model — strong network reviewing
weak network's move, two networks alternating in a self-play
exploration — is straightforwardly impossible without the
application managing multiple WebSockets it doesn't currently
know how to manage.

The proposal: a new Layer 3 `BackendRouter` (provisional name
SELECTOR), a small wire extension that lets clients name which
upstream a query targets, and a capability-negotiation channel
on `query_version` that closes a pre-existing fail-loud
violation (the registry's transposition toggle has nothing
checking that the proxy actually has transposition wired) and
gives SELECTOR detection on the same channel.

## Where SELECTOR slots in

SELECTOR is a fourth `BackendRouter`, joining `LeafRouter`,
`RelayRouter`, `EchoRouter` in `router.py`. Like `RelayRouter` it
maintains persistent WebSocket connections to upstream LEAFs and
forwards queries through them; unlike `RelayRouter` it doesn't
load-balance. Its routing function reads a client-supplied
`model` field on the canonical query and dispatches to the
upstream associated with that label. There is no consistent-hash
ring, no `LoadMetric`, no least-loaded fallback — those exist to
balance fungible work across interchangeable upstreams, and
SELECTOR's whole premise is that its upstreams are
distinguishable.

The placement is worth being explicit about, because it's the
part most easily got wrong. REDIRECT is not in the comparison
above, despite being the fourth `PROXY_ROLE` value alongside
LEAF/RELAY/ECHO. Per the module map, `RedirectSession` is a
Layer 1 `ClientSession` subclass living in `proxy_server.py`; a
REDIRECT-role server's queries never reach Layer 2 or 3, because
the session writes the upstream URL into a redirect message,
closes the WebSocket, and is done. The four `PROXY_ROLE` values
therefore map to two architectural strata — three Layer 3 routers
and one Layer 1 session — and SELECTOR slots in among the
routers. The shallow symmetry of "all four are env var values"
doesn't extend deeper, and a design discussion that lumps
SELECTOR alongside REDIRECT as architectural peers has misplaced
REDIRECT, even when every other detail is right.

## Why this is a separate role rather than a `RelayRouter` parameter

Both `RelayRouter` and SELECTOR maintain persistent WebSockets to
upstream LEAFs and proxy queries through them, which makes the
naive temptation "add a routing-policy knob to `RelayRouter`: if
the query carries `model`, route by label; otherwise hash." This
is a category error.

`RelayRouter`'s invariant is that upstreams are interchangeable.
`LoadMetric` exists to keep work distributed; the hash ring
exists to keep cache locality; both assume the same query has the
same answer regardless of which upstream serves it. Plug a
SELECTOR-style label-routed dispatch into that, and the invariant
evaporates: the upstreams are not interchangeable, the hash means
nothing, and `LoadMetric` is measuring across categorically
different services.

A separate router puts the invariant in the type. `SelectorRouter`
has no `LoadMetric` to mismeasure and no hash ring to disregard.
Its dispatch is a labelled dictionary lookup. Its failure modes
differ from `RelayRouter`'s (the right disposition for "unknown
label" is a structured error to the client; the right disposition
for "load metric saturated" is a fallback peer). Its config
semantics differ (SELECTOR requires upstreams to be mandatorily
distinct, where `RelayRouter` requires them to be mandatorily
fungible). Folding both into one router would mean a runtime
branch on payload shape carrying a structural distinction the
type system should be carrying instead.

## The capability surface on `query_version`

The frontend already has features whose availability it can't
verify. The advanced registry's "use transposition" toggle is
the standing example: the proxy's `goboard_transposition` native
module is optional — built and importable where the operator
compiled it, absent where they didn't — and the toggle exists
on the assumption that it's present. When the module isn't
there the toggle controls nothing; analysis packets arrive
without enrichment fields, the user sees no transposition
highlights, and there is no signal that they asked for something
the proxy can't deliver. Transpositions are rare enough in real
positions that the silent breakage often goes unnoticed. That's
a fail-loud violation that predates this design note; SELECTOR
is the trigger to finally address it.

SELECTOR adds its own pre-action requirement on top of that. The
dropdown UI itself depends on knowing whether the proxy is
selector-capable, and rendering the dropdown optimistically and
tearing it down on the first failed query is a worse UX than
not rendering it at all.

The mechanism: extend `query_version`'s response with a
`capabilities` field, populated by whichever proxy role serves
the response. Today that means LEAF, RELAY, ECHO, and (when
shipped) SELECTOR — every role whose protocol stack runs deep
enough to handle `query_version`. REDIRECT doesn't qualify
structurally; it closes the WebSocket before the client gets to
issue the probe. A vanilla LEAF that doesn't know about the
field doesn't set it; the frontend reads its absence and stays
on the legacy code path. This is feature detection, not silent
fallback in the ADR-0002 sense — both branches of the detection
are honest about what they're doing, and the choice between
them is observation-driven rather than guess-driven.

Capability metadata is a dict, not a flat list:

```json
{"id": "...", "version": "1.0.X",
 "capabilities": {"selector": {}}}
```

A flat `capabilities: string[]` is fine when every capability is
binary, but several near-future capabilities want metadata. A
"no async middleware in the response pipeline" advertisement (see
below) might enumerate which middlewares are wired so a frontend
with a known-incompatible review-session implementation can
refuse the connection rather than silently misbehave. A
transposition-enrichment advertisement might carry which
algorithms are compiled in. Locking the schema as `string[]` now
would require revisiting it almost immediately. The dict shape
costs nothing for capabilities that don't have metadata and
leaves the door open for those that do.

The addition is monotonic in both directions. Old clients ignore
the field. Old proxies don't emit it; new clients fall through to
legacy. Wire compatibility holds.

The async-middleware compatibility flag deserves naming here even
though designing it is out of scope. The proxy's session
middleware can issue follow-up queries based on response content;
`adaptive_reevaluate` is the worked example. A review session is
turn-locked: each turn's analysis must finalize before the next
turn begins. If a middleware injects more queries mid-turn, the
review-session timing assumptions break in ways that aren't
fixable client-side. The frontend's correct response is to refuse
the connection — but only if it knows. Capability negotiation is
the channel that lets it know.

## What the queries carry

Two narrow wire-shape changes.

A `model: string` field on the analysis query. The client sets it
when targeting a SELECTOR; SELECTOR's router consumes it as the
routing key and strips it from the payload before forwarding to
the upstream LEAF, which is a vanilla KataGo binary that wouldn't
understand the field. `model` joins `cache`, `lookup_cache`,
`replay_final_only`, `analysis_config` — the family of
client-set, proxy-interpreted query fields that already terminate
at the proxy boundary. The semantic is the same: client-supplied,
proxy-routed, never reaches the engine.

`query_models` extended on SELECTOR. On a LEAF it returns the
single loaded model. On SELECTOR it returns the union — one entry
per upstream LEAF, each carrying the SELECTOR's chosen label as
the identifier the frontend will use in `model`. The wire shape
stays a list (the existing `models: readonly unknown[]`
accommodates anything), so no client-side parsing changes; the
entry count and per-entry contents differ.

The Hub picks `model` up automatically because the canonical key
is the query payload. Two queries with the same content but
different `model` route to different upstreams, get different
responses, cache as different entries. Which is right: a model-A
analysis and a model-B analysis are different artifacts and
shouldn't coalesce.

## Per-query, not per-WebSocket

The other plausible shape — open one connection per model and
route by which connection a query was sent on — is heavier and
buys nothing. Per-query carries one connection's worth of state
regardless of how many models are in play. Real-time interleaving
(model-A and model-B alternating moves in the same exchange)
becomes a UI choice rather than a connection-topology choice. The
single-connection facade the dropdown presents to the user is a
UI fiction that needn't propagate down to the WebSocket layer:
from the harness's perspective, fire alternating
`queryEngineMove({...,model:"strong"})` and
`playEngineMoves({...,model:"weak"})` against one socket and the
SELECTOR's per-upstream pool fans them out.

## What the frontend does with it

The Toolbar already fires `query_version` and `query_models` on
WebSocket open and surfaces both via the engine-identity tooltip.
The natural extension:

The analysis service reads `capabilities.selector` from the
version response. If present, the Toolbar replaces the static
current-model line with a dropdown sourced from `query_models`'s
reply; if absent, the existing display stands. Selection writes
to engine state through a named mutator (per ADR-0001's mutator
convention) and persists through the sync service like any other
engine setting. The analysis service ACL injects `model` into
every outgoing query when a model is selected, in the same place
and at the same boundary as the existing proxy-control fields.
Above the ACL no module learns that model selection is happening.

ADR-0003's domain bands: the dropdown component is Go-bound (it
surfaces KataGo wire content). The capability-detection plumbing
is genuinely generic — the same shape would carry over to any
future proxy protocol — and lives in the analysis service
alongside the other engine-identity probes.

## How this fails loudly

Per ADR-0002:

**Unknown model in a query.** SELECTOR returns a
`KataErrorResponse`-shaped error (`{id, error, field: "model"}`)
naming the unknown label. The frontend surfaces a system message
and aborts the current operation. Substituting "whatever LEAF
happens to be running" for the requested model is the
silent-fallback failure mode the tenet exists to forbid: the user
asked for a specific model, and the absence of that model is
information that has to surface.

**Upstream LEAF down mid-session.** Same disposition. The query
fails loudly; the frontend aborts. Automatic failover to a
different model would silently answer a different question than
the one asked.

**Two upstreams claiming the same label at startup.** SELECTOR
refuses to start, raising at the `LeafStartupError` register: an
exception naming both upstream URLs and the conflicting label.
An ambiguous routing table is a startup-time loud failure, not
"resolve at runtime by guessing."

**`capabilities` absent on `query_version`.** Frontend takes the
legacy path. Feature detection, not silent fallback — distinct
from the cases above and called out explicitly in the section
defining the field.

## The autonomous-SR loop coupling

The exploratory note on autonomous spaced-repetition lists
"multiple weights" and "LLM-at-seat with proxy-mediated move
selection" as policies whose feasibility depends on running
queries against differently-trained networks. SELECTOR is the
missing piece. With it the policy axis expands from "visit-count
ladder on a single network" to "visit-count ladder × network
choice"; the asymmetric forest growth that note sketches lives in
the crossing. The "non-political sample DB" benefit picks up a
second axis along with it: model-perspective diversity stacked on
position diversity, in a fixture that ships without depending on
permissions or feelings about source games.

The harness's `playEngineMoves` and `queryEngineMove` already
take `katagoUrl` per call. They extend with an optional `model`
parameter that the ACL injects. Connection count stays at one per
harness scenario; what was previously a multi-LEAF orchestration
concern becomes a per-call configuration.

## Out of scope

- The proxy-side implementation of SELECTOR. Upstream-pool data
  structure, per-upstream WebSocket lifecycle,
  completion-tracker integration, the routing-table-vs-upstream-
  availability startup choreography, the question of whether
  labels come from probing each upstream's `query_models` at
  startup or from operator-declared `(URL, label)` tuples. All
  proxy-side concerns; this note states what the frontend wants
  on the wire, not how the proxy gets there.
- Specific capability metadata schemas. The negotiation channel
  makes capability advertisement possible; what each capability's
  metadata looks like, and what client-side behaviour is gated on
  each, is per-capability work. Transposition is the most
  pressing — it's what closes the registry-toggle fail-loud
  violation — and the async-middleware compatibility flag is the
  next one named in this note, but each schema belongs to its
  own design moment.
- The frontend-to-proxy dispatch. Different document, separate,
  under `docs/dispatch/` per the umbrella's convention. This note
  is the substance from which that dispatch is drawn.
- Per-card model selection (a card's `gradingParameter` carrying
  a preferred model, letting one review session interleave models
  per card). The kv-pair injection point at the ACL is the
  natural site, but choosing the policy belongs in a UX
  conversation rather than a wire-shape one.

## Open questions

- Per-upstream failure budget. The single-LEAF case has a 3-retry
  budget then an unhealthy state. The natural mirror is
  per-upstream budgets feeding into per-model unhealthy markers.
  Detail to settle with the proxy side.
- Capability metadata schema, per capability. Free-form forever,
  or formalised per cap as it lands. Stylistic call.

## Sequencing

Five steps in the order they ship:

1. Frontend type-only scaffolding. `capabilities` on the version
   response type, `model` on the analysis query type. Both
   optional. No behaviour change; pins the wire shape against
   the typecheck.
2. Proxy-side SELECTOR MVP. New role, capability advertisement,
   extended `query_models`, structured error for unknown model,
   per-upstream failure budget. Tag, umbrella pointer bump.
3. Frontend dropdown UI. Toolbar extension; capability detection
   gates the render.
4. ACL injection. `model` on outgoing queries when selected.
   Above the ACL nothing changes.
5. Harness extension. Pure-async exports take an optional
   `model`; the autonomous-loop scenarios collapse from
   multi-socket to single-socket.

## License

Public Domain (The Unlicense).
