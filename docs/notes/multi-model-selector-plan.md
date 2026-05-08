# Multi-Model Selector — Frontend ↔ Proxy Plan

- **Status:** Design proposed. Not yet ratified; no implementation
  branch. Coordinated arc spanning `frontend/` and `proxy/`. **Wire-
  shape changes go through the dispatch chain before any
  proxy-side code lands** — the proxy's CLAUDE.md is explicit that
  consumers do not unilaterally widen the wire.
- **Genre:** Design note for an umbrella-level feature. Mirrors the
  shape of `docs/notes/analysis-persistence-plan.md` and
  `docs/notes/dsl-hyperparameter-harness-plan.md` — describes what
  is being proposed before any wire-shape commitment, names the
  unknowns, and sets up the dispatch chain that will record the
  negotiation. The proxy half follows the proxy CLAUDE.md's
  output structure (Roadmap → Invariants → Pure → Effectful →
  Wiring) so a proxy-side session can pick it up natively.
- **Date:** 2026-05-08.
- **Scope:** `frontend/` (toolbar + analysis service + store +
  ledger keying) and `proxy/` (a new Layer 3 BackendRouter, a
  routing-field convention on the wire, MetadataResponse fanout
  for `query_models`). The umbrella pin to a proxy release
  advancing this work is a separate arc per CLAUDE.md's submodule
  discipline.

## What this document is

The user-facing pitch, the architectural placement in the proxy's
3-layer model, the Router-vs-Transformer-vs-Middleware choice and
its reasoning, the wire-shape sketch, the frontend's shape, the
named invariants the change preserves and adds, a work-split that
lets both halves proceed without blocking on each other, and the
open design questions that need ratification (almost certainly via
a frontend ↔ proxy dispatch exchange) before implementation begins.

## Motivation

The toolbar today shows the connected proxy's single model name as
a static label, sourced from the `query_models` probe issued by
the frontend's analysis service on connect/reconnect. The full
`query_models` payload is exposed as the element's tooltip —
useful for the technical audience but gated behind a hover.

The product target — serious Go researchers — wants to compare how
different KataGo models evaluate the same position. Different
weight files generate different policy distributions, different
ownership maps, different score readings. A study tool that makes
those differences tactile turns "which model do I trust here" from
a research question into an A/B comparison the user can perform on
demand.

KataGo's analysis engine binary loads exactly one model per
process; its wire protocol exposes no model-selection field. The
structural answer is to run multiple LEAF processes — each binding
one KataGo binary to one model — and place a proxy in front of
them that routes by a wire-level field carried on the analyze
query.

This is **consistent with KataProxy's existing wire posture**, not
a departure from it. The proxy already speaks a *superset* of
KataGo's analysis protocol: four control flags (`cache`,
`lookup_cache`, `replay_final_only`, `analysis_config`) interpreted
at the Hub layer, Transformer-driven enrichment, Middleware-driven
adaptive policies. Vanilla KataGo clients work unchanged because
the superset is additive. The new routing field follows the same
pattern: vanilla KataGo clients connecting to a single-LEAF proxy
deployment see no change; a SELECTOR-fronted multi-LEAF deployment
expects the field but degrades to a loud, structured error if the
client doesn't supply it.

## Today's surface

### Frontend
- The toolbar component renders the connected proxy's model name as
  a static label, computed from the engine info the analysis
  service holds in the global store. The element's tooltip carries
  the raw `query_models` payload (helpful for the technical
  audience; the (?) icon proposed below promotes it from a hover
  to a click affordance).
- The analysis service issues `query_version` and `query_models` on
  every connect and reconnect, storing the responses verbatim. The
  failure path is logged and non-fatal.
- The KataGo wire types declare the action queries and responses
  with `models: readonly unknown[]` deliberately opaque at the wire
  level; the consumer extracts `internalName` from each entry.
- Settings persist the proxy URL and the four control flags. **No
  model-selection preference exists today**, and the plan keeps it
  that way (session-only, qEUBO-style).

### Proxy

The proxy is a layered pipeline; reading
`proxy/ARCHITECTURE.md`'s "three-layer model" section is the
prerequisite for the design rationale below.

- **Layer 1 — Sessions** (`proxy_server.py`, `transformers/`,
  `middleware/`, `AbstractProxy/protocol_transformer.py`): one
  `ClientSession` per WebSocket. Owns the per-client transformer
  chain and per-session middleware. Translates client IDs to an
  internal namespace and back.
- **Layer 2 — Hub** (`pubsub_hub.py`): one `PubSubHub` per
  process. Coalesces semantically-identical canonical queries
  onto a single backend slot, fans responses to every subscriber,
  owns the optional replay cache. The four wire-control flags are
  interpreted here (specifically `cache`, `lookup_cache`,
  `replay_final_only`).
- **Layer 3 — Router** (`router.py`): one `BackendRouter` per
  process. Subclasses are `LeafRouter`, `RelayRouter`,
  `EchoRouter`. Dispatches canonical queries to the actual
  backend. **`RelayRouter` already takes one or more upstream
  LEAF URLs** and load-balances via consistent-hash + load-aware
  fallback (per the README's "Roles" table).
- **Discriminated response variants** (v1.0.13): `KataGoResponse =
  AnalyzeResponse | MetadataResponse`, structurally discriminated.
  See `proxy/docs/roadmap-response-variants.md` for the full
  rationale and the consumer migration table.
- **Two extension surfaces** (Layer 1): Transformers (synchronous,
  per-message, pure) and Session Middleware (async, stateful,
  per-session). The choice between them is load-bearing per
  ARCHITECTURE.md's "Extension points" section.

### Switching-UX precedents in the frontend
- Palette dropdown — bound to a profile-settings path; **persisted**;
  switching re-renders cached raw packets through different
  enrichment functions.
- qEUBO toolbar A/B audition — bound to a session-only ref; **not
  persisted**; both A and B are pre-computed when the audition is
  opened.

The model selector should follow the qEUBO pattern. The toggle is
the user's act of attention rather than a saved preference, and
the proxy is an ephemeral resource — persisting "currently
selected model" across sessions would mean persisting an opaque
pointer into a configuration that may have changed.

## The vision

### UX shape

The static model label becomes a dropdown. Each entry identifies
one (LEAF, KataGo binary, model) tuple — labeled something like
`katago-b18c384-v22 (KataGo 1.15.3)`. The current tooltip's
content moves into a `(?)` icon adjacent to the dropdown that
renders metadata for the *currently-selected* model only.

Switching is snappy and ephemeral. The selected model is session
state — closing the tab and reopening loses the selection. On
switch, the visible analysis surfaces (winrate curve, ownership
overlay, suggested moves, score series) re-render against the
per-model cached results; if no result is yet cached for the new
model at the current node, an analyze query is issued. The
"snappy" property comes from caching results per-(model, position)
in the analysis ledger — see "Open design questions" for the
ledger-keying decision this depends on.

### Architectural shape

A new Layer 3 `BackendRouter` subclass — working name **SELECTOR**
— that:

1. Holds N pre-configured upstream LEAFs (each a separate
   `kataproxy` LEAF process running KataGo with its own model and
   binary version).
2. Routes analyze queries to the LEAF named in a wire-level
   routing field on the canonical query.
3. Aggregates `query_models` responses by fanning out to every
   configured LEAF in parallel and merging the results into one
   `MetadataResponse`, with each model entry tagged by a stable
   LEAF identifier.
4. Fails loud per ADR-0002 if the routing field is missing,
   names an unknown LEAF, or names a LEAF whose connection is
   unhealthy. No silent fallback to a default LEAF.

## Why a new Router subclass and not a Transformer or Middleware

The proxy's two Layer 1 extension surfaces and their tradeoffs
(per ARCHITECTURE.md's "Extension points"):

- **Transformer**: pure `(on_query, on_response)` pair, synchronous,
  per-message. Reach for it for enrichment, default injection,
  predicate filtering. **Cannot redirect dispatch** — it operates
  on payloads as they pass through Layer 1, not on Layer 3's
  backend selection.
- **SessionMiddleware**: async generator over the response stream,
  stateful, per-session. Reach for it for cross-message state,
  follow-up query injection, response timing control. Operates on
  the *response* stream; the original query has already been
  dispatched by the time middleware sees results.

Neither layer can make a per-query decision about *which* upstream
to dispatch to. That's a Layer 3 (Router) concern by construction.

Within Layer 3, the question is whether to:

- **Add a fifth Router subclass (SELECTOR)** alongside `LeafRouter`,
  `RelayRouter`, `EchoRouter`. The new class shares the
  upstream-WebSocket connection mechanism with `RelayRouter` but
  implements a different dispatch policy (content-routed,
  fail-loud) instead of `RelayRouter`'s consistent-hash +
  load-aware-fallback policy.
- **Make `RelayRouter`'s routing policy pluggable.** The current
  `HashRing` + `LoadMetric` could be one of two `RoutingPolicy`
  implementations, with content-routed selection being the other.
  Cleaner long-term but more invasive; would require an interface
  refactor of `RelayRouter` itself.

The plan's working assumption is the first shape (a parallel
SELECTOR class) because the dispatch policies have **incompatible
failure semantics**: RELAY is built on the assumption that
upstreams are equivalent and one can substitute for another under
load (a fault-tolerant property); SELECTOR is built on the
assumption that upstreams are *not* equivalent and silently
substituting one for another would mask which model the user
actually got (an ADR-0002 violation). Conflating them risks
exporting one's failure semantics into the other's call sites.

The pluggable-policy refactor is named as an open design question
below; it could be the right shape if the proxy author has views
about the long-term Router taxonomy.

## The SELECTOR Router

### Position relative to the existing taxonomy

| Router | Connects to | Dispatch policy | Failure |
|---|---|---|---|
| `LeafRouter` | Local KataGo subprocess | 1:1, single backend | LEAF startup raises `LeafStartupError`; mid-stream crashes respawn up to 3× |
| `RelayRouter` | N upstream WebSocket LEAFs | Consistent-hash on query, load-aware fallback when preferred is saturated | Load-balanced; transparent to clients when a peer drops |
| `EchoRouter` | Nothing (synthetic) | Returns a canned response | Test seam |
| `SelectorRouter` *(new)* | N upstream WebSocket LEAFs | Content-routed by `leafId` on the canonical query; **no fallback** | Missing field → reject; unknown `leafId` → reject; targeted LEAF unhealthy → reject for that LEAF only |

**A note on `REDIRECT`.** The `PROXY_ROLE` env var has a fifth
value, `REDIRECT`, that doesn't appear in this table. REDIRECT
is a Layer 1 (Sessions) shortcut, not a Layer 3 Router: when a
client connects, a `RedirectSession` tells the client to
reconnect to one of the configured upstreams (round-robin) and
the connection never reaches the Hub or Router. Per
`proxy/README.md`'s "Roles" table, REDIRECT is a service-discovery
handoff point, not a compatibility shim. So the proxy has five
roles but only four Router subclasses, and SELECTOR is the
fourth Router — not the fifth role.

The SELECTOR shares the upstream-WebSocket connection management
shape with `RelayRouter`. The two diverge on:

- **Connection topology**: RELAY treats its upstreams as
  interchangeable peers; SELECTOR treats each upstream as a
  uniquely-named slot.
- **Coalescing implications**: queries to different LEAFs must not
  coalesce at the Hub. Achieved by ensuring `leafId` participates
  in the content_hash (see "Wire shape" below).
- **Failure mode under saturation**: RELAY falls back to a
  less-loaded peer; SELECTOR refuses (the user explicitly asked
  for a specific model).

### Module-level shape

A new `selector_router.py` (or, if the proxy author prefers,
adding `SelectorRouter` to the existing `router.py`) implementing
the `BackendRouter` ABC. Reuses the `RelayRouter`'s
upstream-connection scaffolding where possible — the WebSocket
client wrapper, the per-upstream queue, the response forwarder.

Per the proxy's `ADR-0006` form (Python module docstring at the
top of every source file), the new module gets the standard
header (path, purpose, license).

The factory in `router.py` (`make_router(...)`) gains a new branch
for the SELECTOR role.

### Configuration

Initial cut: static configuration via env var, matching the rest
of the proxy's deployment posture. A LEAF map declared at startup
(e.g., `PROXY_SELECTOR_LEAFS=b18c384=ws://localhost:41949,b40c256=ws://localhost:41950`)
that doesn't change during the SELECTOR's lifetime. Hot-reload of
the LEAF map is a follow-on; SELECTOR restart is the v1 answer.

A `run_selector.sh` script mirrors `run_leaf.sh` and `run_relay.sh`,
sets `PROXY_ROLE=SELECTOR` and the LEAF-map env var, and invokes
the proxy server.

## Wire shape

### The routing field on analyze queries

A new top-level wire field on analyze queries. **Working name:
`leafId`** (camelCase to match KataGo's wire conventions; flat
top-level to match the existing four control flags). The exact
name is an open design question subject to proxy-side ratification
through the dispatch chain.

Layer-by-layer behavior:

- **Layer 1 (Sessions)**: the field is part of the canonical
  query envelope. **It is NOT stripped at Layer 1** the way
  `cache` and `lookup_cache` are. The reason: it must reach the
  Hub's content-hash computation so that queries to different
  LEAFs receive different canonical slots. (`cache` is stripped
  because it must NOT affect content_hash — two queries with the
  same content but different `cache` flags should coalesce. The
  reverse holds for `leafId`: two queries with the same content
  but different `leafId` are *semantically distinct* and must not
  coalesce.)
- **Layer 2 (Hub)**: contributes to `content_hash` naturally as
  part of the canonical query. No Hub-side code change required;
  the field is just another query field as far as the Hub is
  concerned.
- **Layer 3 (Router)**: `SelectorRouter` reads the field from the
  canonical query, picks the named upstream, and **strips the
  field from the wire payload before forwarding to the upstream
  LEAF** (the LEAF runs vanilla KataGo and would not know what
  to do with it).

The frontend includes the field on every analyze query when
connected to a SELECTOR. A frontend connecting to a single-LEAF
proxy deployment omits it (or sets it to a known sentinel; TBD
in the dispatch).

### MetadataResponse aggregation for `query_models`

`query_models` cannot be 1:1 dispatched to a single LEAF — the
client wants the union across all configured LEAFs. SELECTOR
fans out: when the canonical `query_models` arrives, it issues
`query_models` to every configured upstream in parallel,
collects the responses, and emits a single aggregated
`MetadataResponse` whose `opaque` payload looks like:

```json
{
  "models": [
    {
      "leafId": "b18c384",
      "internalName": "kata1-b18c384...",
      "name": "...",
      "kataGoVersion": "1.15.3"
    },
    {
      "leafId": "b40c256",
      "internalName": "kata1-b40c256...",
      "name": "...",
      "kataGoVersion": "1.15.4"
    }
  ],
  "failedLeafs": []
}
```

The `leafId` field on each entry is added by the SELECTOR;
everything else is pass-through from the upstream LEAF's response.
`failedLeafs` is empty in the happy path; if any LEAF times out
or errors, it appears here rather than being silently omitted (per
ADR-0002 — the frontend surfaces partial-availability rather than
treating it as success).

For `query_version`: SELECTOR returns its own version (it's the
proxy the client is talking to). Per-LEAF KataGo versions live
inside each `models` entry.

### Aggregation as router-level synthesis

The fanout-and-aggregate pattern is **structurally similar to the
synthesized terminate-ack** at the existing
`_handle_terminate` site (see ARCHITECTURE.md's
"Coalescing-transparent explicit terminate" section). Both
construct a synthetic response that's observationally
indistinguishable from a real backend response. The same loudness
discipline applies: if KataGo's `query_models` ack format ever
extends with new fields, the synthesis will need to mirror them
or surface the divergence as a parse anomaly. ADR-0002 framing.

The id-translation-near-miss letter
(`docs/dispatch/proxy-to-proxy-id-translation-near-miss.md`)
applies directly here: any new field that needs to cross the
internal/canonical/wire ID boundary should be declared as a
`ReferentialField` on the appropriate policy, not handled
per-call-site. The plan's working assumption is that `leafId` is
**not** an identifier in the ID-translation sense (it doesn't
identify a query or a session — it identifies a backend), so it
likely does not need a `ReferentialField`. This is a question for
proxy-side ratification, since the boundary between "ID that needs
translation" and "non-ID payload field" depends on whether
canonical-id derivation mixes it in.

### Failure modes (per ADR-0002)

| Condition | SELECTOR behavior |
|---|---|
| Analyze query missing `leafId` | Reject with structured error naming the missing field |
| Analyze query with unknown `leafId` | Reject with structured error naming the unknown id and listing known ids |
| Analyze query with `leafId` whose upstream is currently unhealthy | Reject for that query specifically; other LEAFs unaffected |
| `query_models` to one LEAF times out or errors | Aggregated response includes successful LEAFs, lists the failures in `failedLeafs` (no silent omission) |
| All configured LEAFs unreachable at startup | SELECTOR refuses to start (`SelectorStartupError`, mirroring `LeafStartupError`'s posture) |
| One LEAF dies mid-session | That LEAF's slot becomes unhealthy; queries targeting it return errors; other LEAFs unaffected; recovery follows whatever pattern `RelayRouter` already uses for upstream reconnection |

These compose with the post-v1.0.13-followups dispatch's
silent-coercion concern (`docs/dispatch/proxy-to-proxy-post-v1.0.13-followups.md`,
Item 1): the parser/dispatcher for `leafId` must not use a
`.get(field, default_leaf)` fallback. Closed-set membership check
(`leafId in known_leafs`) and explicit raise on unknown is the
shape, mirroring the v1.0.12 `parse_query_from_wire` fix.

## Frontend half

### Service layer

The analysis service's `probeEngineInfo` extends to recognize the
multi-model shape: when the response's `opaque.models` has more
than one entry (or any entry carries a `leafId`), the service
treats the connection as a SELECTOR-fronted multi-model setup and
stores the full list in a new `store.engine.info.models` field
rather than only the first entry's `internalName`.

Backwards-compat: a single-LEAF proxy returns a `models` array
with one entry and no `leafId`. The frontend treats that as
"single model, no dropdown" — the toolbar renders the static label
unchanged.

### Analyze-query construction

The query path that builds outgoing analyze queries gains an
optional parameter for the LEAF id, included as the `leafId`
wire-level field on every query when set. The id is read from the
session-state ref (below), not from settings.

### Store

A new session-state ref — not in profile settings, not persisted
— for the currently-selected `leafId`. Default: the first entry
in `store.engine.info.models` (or null if single-model). Cleared
on disconnect; re-defaulted on reconnect (the new connection's
model list may differ).

This follows the qEUBO `toolbarView` precedent. Per ADR-0001, the
ref is genuinely-mutated session state and so does not get a
`readonly` annotation.

### Toolbar

The current single-model display becomes:

- **If single-model**: render today's static label unchanged.
- **If multi-model**: render a `<select>` (or styled equivalent)
  bound to the session-state ref, with options labeled by a
  function over each model entry (`internalName` + KataGo version,
  or similar — exact label is a UX call). The current tooltip
  content moves into a `(?)` icon adjacent to the dropdown,
  showing the full metadata for the *selected* entry only.

### Switching UX

On `leafId` change, the analysis service re-fires the active
board's queries against the new LEAF. The analysis ledger's keying
needs to grow a model dimension so results from different models
do not collide and so switching between them re-renders from cache
rather than re-querying.

**This is the primary frontend-side open design question** — see
"Open design questions" below.

## Proxy half

Following the proxy CLAUDE.md's output structure:

### Roadmap

A new Layer 3 `SelectorRouter` is added alongside `LeafRouter`,
`RelayRouter`, `EchoRouter`. It connects to N upstream LEAFs,
routes analyze queries by a wire-level `leafId` field, and
synthesizes an aggregated `MetadataResponse` for `query_models` by
fanning out across all upstreams. The factory `make_router` gains
a new branch; `sproxy_config.py` declares the new role; a
`run_selector.sh` mirrors the existing role-runner scripts.

The change is scoped to Layer 3 plus the wire-vocabulary surface
(the new `leafId` field is recognized by the canonical-query
shape). Layer 1 and Layer 2 require no changes: Layer 1's
transformer chain operates on payloads, Layer 2's coalescing uses
content_hash which naturally differentiates queries with different
`leafId` values.

### Invariants

#### Preserved

- **Wire compatibility with vanilla KataGo clients on single-LEAF
  deployments**: a single-LEAF proxy is byte-for-byte unchanged.
  No `leafId`, no aggregation, no new behavior on the existing
  roles.
- **ID-namespace translation across all three layers**:
  client_id → internal_id → canonical_id → wire_id (and reverse).
  `leafId` is **not** an identifier in the translation sense; it
  identifies a backend, not a query or session. No new
  `ReferentialField` required (subject to ratification). The
  `IdMapping`/`CompletionTracker`/`ProxyLink` machinery operates
  unchanged.
- **Coalescing-transparent explicit terminate** (the worked
  example in ARCHITECTURE.md's terminate-ack section): the
  multi-subscriber-on-same-canonical case is unaffected. Two
  clients that submitted analyze queries with the same content
  AND the same `leafId` will coalesce on the same canonical and
  route to the same upstream — exactly the existing semantics.
- **Layer separation**: Layer 1 unaware of Layer 3's existence;
  Layer 2 unaware of which Router is downstream. The new field
  is recognized at the wire-vocabulary level (Layer 1's parsers)
  and consumed at Layer 3 (the SelectorRouter). The Hub does not
  inspect it; it treats it as part of the canonical query payload.
- **Fail-loud LEAF startup posture**: SELECTOR adopts the
  established pattern. If any configured upstream LEAF is
  unreachable at startup, the SELECTOR raises a
  `SelectorStartupError` with the upstream error in the message
  and refuses to begin serving. Mirrors `LeafStartupError`'s
  v1.0.2 posture.

#### Modified

- **The canonical-query schema gains an optional `leafId` field.**
  Optional in the schema sense; **required** when the connecting
  client targets a SELECTOR-role proxy. Single-LEAF and RELAY
  deployments ignore it (a vanilla LEAF will reject any unknown
  top-level field; whether RELAY strips it or passes it through
  is a SELECTOR-side concern only when SELECTOR sits behind a
  RELAY — out of scope for v1).
- **`make_router(...)` gains a SELECTOR branch.** Mechanical
  factory addition.

#### Newly added

- **A new role**: `PROXY_ROLE=SELECTOR` and the `PROXY_SELECTOR_LEAFS`
  env-var schema (or equivalent — exact env-var naming TBD with
  the proxy author).
- **MetadataResponse fanout-and-aggregate** for `query_models` in
  the SELECTOR. Synthesizes a response from N upstream responses;
  follows the synthesized-terminate-ack discipline.
- **A `failedLeafs` array** in the aggregated `query_models`
  response. Surfaces partial availability per ADR-0002.
- **A `SelectorStartupError`** class mirroring `LeafStartupError`.

### Pure units

- **Routing-field extraction helper.** A small pure function over
  the canonical query that returns the `leafId` (or raises a
  structured error if missing/unknown). Pattern: closed-set
  membership check on the configured LEAF map, raise on unknown
  — explicitly avoiding the `.get(field, default)` shape that the
  silent-coercion sweep dispatch warns against.
- **`leafId`-stripper.** Returns the wire dict with `leafId`
  removed, for forwarding to the upstream LEAF. Pure transformation,
  trivially testable.
- **Aggregated-response builder.** Takes a list of
  `(leafId, MetadataResponse | Exception)` pairs and returns one
  aggregated `MetadataResponse` with the `models` array merged and
  `failedLeafs` populated. Pure; the I/O concern (issuing the
  parallel queries) lives in the effectful units below.

### Effectful units

- **`SelectorRouter(BackendRouter)`** (new module
  `selector_router.py` or addition to `router.py`). Maintains one
  outbound WebSocket per configured LEAF; owns the per-upstream
  receive loops; coordinates the fanout for `query_models`.
- **Multi-upstream connection lifecycle.** Reuses (or shares with
  `RelayRouter`) the WebSocket-client scaffolding. Per-LEAF
  reconnection on transient drops follows the pattern already in
  `RelayRouter`.
- **`query_models` fanout coordinator.** Issues the parallel
  queries to all configured LEAFs, collects responses (with a
  timeout), folds them through the pure aggregator, and emits the
  aggregated response on the canonical's response stream.

### Wiring

- **`make_router(...)`** gains a SELECTOR branch returning
  `SelectorRouter(leaf_map=..., load_metric=...)`.
- **`sproxy_config.py`** declares the new `SELECTOR` role constant.
- **`.env.example`** documents the new env-var schema.
- **`run_selector.sh`** at the proxy repo root, mirroring
  `run_leaf.sh` and `run_relay.sh`.
- **`proxy/README.md`'s "Roles" table** gains a fifth row.
- **`proxy/ARCHITECTURE.md`** gains a paragraph in the "Module
  map" and (optionally) a short discussion in "Where this falls
  short" if the pluggable-RoutingPolicy refactor remains open.

## Work split and PR sequencing

The split lets both halves proceed in parallel up to the
end-to-end smoke. Suggested order:

1. **Dispatch** (umbrella): open
   `docs/dispatch/frontend-to-proxy-multi-model-selector.md` with
   this plan as the ratification artifact. Specifically requests
   proxy-side sign-off on the field name, the failure-envelope
   shape, the env-var schema, and the open question about whether
   to add a parallel `SelectorRouter` or refactor `RelayRouter`'s
   policy to be pluggable. Proxy reply ratifies.
2. **Proxy PR** (in the proxy repo): SELECTOR role + MetadataResponse
   aggregation + new run script + tests. Lands a tagged release
   (v1.0.14 or whatever the proxy author chooses; possibly bundles
   with the v1.0.14 work mentioned in the post-v1.0.13-followups
   dispatch).
3. **Frontend PR (precursor)**: multi-model recognition. Extends
   `probeEngineInfo` and the global store to recognize and carry
   the model list. Renders today's UI unchanged. Behind a feature
   flag if desired (the SELECTOR isn't yet reachable until the
   proxy bump).
4. **Umbrella PR**: bump proxy submodule pin to the SELECTOR-aware
   tag. Single-line diff per CLAUDE.md submodule discipline; do
   NOT mix umbrella code with the proxy bump.
5. **Frontend PR (UI surface)**: dropdown + (?) icon + switching
   UX. Toolbar change, store ref, ledger keying extension,
   switching behavior. The largest single PR; needs full-file
   visibility on the affected modules per ADR-0004.
6. **Coordinated end-to-end smoke**: two LEAF processes (e.g.,
   b18c384 and b40c256) behind a SELECTOR, exercised through the
   frontend toolbar. Validates the failure modes (kill one LEAF,
   send a query with an unknown `leafId`, omit the field).
7. **Status dispatches** (umbrella): both halves' landing
   announced in status-reply dispatches that close the chain.

The proxy half **must** complete and tag before step 4. The
proxy's release cadence is independent of the umbrella's per the
proxy CLAUDE.md; mixing the two in one PR obscures the proxy
diff.

## Open design questions

These are the design questions that should be settled before
implementation, or carried into the dispatch exchange explicitly:

### Per-model result caching (frontend)

The frontend's analysis ledger today is keyed by something like
`(boardId, nodeId, configHash)`. To make snappy switching real,
the key must grow a model dimension. Three shapes:

1. **Add `leafId` to the cache key directly.** Most explicit. Each
   model's results stored independently; switching reads cached
   entry for new model or fires fresh query.
2. **Fold `leafId` into `configHash`.** The `analysis_config` for
   a model-specific query is materially different; folding
   `leafId` into the hash function might be the cleanest move
   without growing the keying tuple.
3. **Use a `(model, payload)` tuple at every read site.** Heavier
   refactor; surfaces the model dimension explicitly throughout
   the codebase.

Resolving this needs visibility into the ledger's current keying
— a brief read of the analysis-ledger module (in
`frontend/src/services/`) is the prerequisite for committing.

### `RelayRouter` refactor vs. parallel `SelectorRouter` (proxy)

The plan's working assumption is a parallel `SelectorRouter` class
because the dispatch policies have incompatible failure semantics
(RELAY's load-aware fallback vs. SELECTOR's fail-loud refusal).
The alternative — refactoring `RelayRouter`'s routing into a
pluggable `RoutingPolicy` — is cleaner long-term but requires more
invasive changes to a tested module.

This is a proxy-side architectural call; the dispatch from the
frontend should defer to the proxy author.

### Routing-field naming (proxy ratification)

`leafId` is the working name (camelCase; flat top-level). Other
candidates: `selectorLeafId`, `proxyLeafId`, `targetLeaf`,
`endpoint`. Constraints: must not collide with any KataGo native
field; should fit the existing wire convention (camelCase, flat
top-level for control flags); should be obviously
proxy-interpreted so future readers don't grep KataGo docs for it.
Subject to proxy-side ratification through the dispatch.

### Layer 1 stripping vs. Layer 2 hashing (proxy ratification)

The plan's working assumption is **`leafId` is NOT stripped at
Layer 1** — it must reach the Hub's `content_hash` so different
LEAFs receive different canonical slots. Layer 3 (SELECTOR) strips
it before forwarding to the upstream LEAF.

The alternative — strip at Layer 1 but contribute to canonical-id
derivation explicitly — is consistent with how some other control
flags work but breaks the "Layer 1 strips, Layer 2 hashes the
rest" mental model. The default is "leave it in the canonical
query"; the proxy-side response is welcome to refine.

### Backwards compatibility posture

A frontend that does NOT know about SELECTOR connecting to a
SELECTOR-role proxy will issue analyze queries without `leafId`
and the SELECTOR will reject them. **This is the right loud-failure
shape per ADR-0002**, but it means the proxy bump and the frontend
update need to roll out coherently for users running SELECTOR.
Single-LEAF and RELAY deployments are unaffected.

The plan does not add a "default LEAF" silent-fallback because
that would mask the configuration drift the SELECTOR is meant to
surface. (The post-v1.0.13-followups silent-coercion sweep is the
direct precedent: missing field + structural-default coercion was
the exact failure mode v1.0.12 fixed.)

### LEAF identity stability

`leafId` should be human-readable (it appears in dropdown labels
in the absence of a separate display label) and stable across
SELECTOR restarts. Operator-assigned via the env-var LEAF map is
the simplest answer; auto-generated from the model's hash works
but loses readability. Recommend operator-assigned.

### Pluggable RoutingPolicy as a longer-horizon refactor

Independent of this arc, the proxy may want to refactor `RelayRouter`'s
implicit consistent-hash policy into an explicit pluggable
`RoutingPolicy` interface, with the SELECTOR's content-routed
policy as another implementation. This would be a cleaner
long-term shape but is a separate refactor; the v1 SELECTOR is a
parallel class to keep the diff bounded. Worth a parenthetical in
the proxy's `ARCHITECTURE.md` "Where this falls short" if not
pursued in this arc.

## Doc-graph audit

When this plan is ratified and implementation begins, the
following doc-graph touches follow (per ADR-0005's rules and
CLAUDE.md's "documentation is part of the work"):

### Umbrella

- **`docs/TODO.md`**: a tier-appropriate item pointing at this
  plan, describing the two-half coordinated arc.
- **`docs/handoff-current.md`** "Where the project is going":
  a new bullet under the post-v1.1.0 roadmap listing the
  multi-model selector arc with its plan reference.
- **`docs/dispatch/frontend-to-proxy-multi-model-selector.md`**:
  the dispatch that opens the negotiation; the proxy reply
  ratifies the wire shape and the role choice; eventual status
  dispatches close the chain.
- **`docs/notes/multi-model-selector-plan.md`** (this document):
  status frontmatter updated as PRs land; eventual retirement
  to `docs/archive/notes/` once the feature ships and a system
  note for it lands (or this plan is itself promoted to the
  system note, post-implementation).

### Proxy

- **`proxy/README.md`** "Roles" table: gain a fifth row for
  SELECTOR.
- **`proxy/README.md`** "Configuration" section: document the
  `PROXY_SELECTOR_LEAFS` env-var schema (or equivalent).
- **`proxy/ARCHITECTURE.md`** "Module map": gain a row for the
  new `selector_router.py` module if added; otherwise update the
  `router.py` row's description.
- **`proxy/ARCHITECTURE.md`** "Where this falls short": optionally
  mention the pluggable-RoutingPolicy refactor as a known open
  item if not pursued in v1.
- **`proxy/docs/roadmap-multi-leaf-selector.md`**: the proxy-side
  roadmap document for the SELECTOR work, mirroring
  `proxy/docs/roadmap-response-variants.md`'s shape (Roadmap →
  Invariants → Pure units → Effectful units → Wiring → Tests →
  Edge cases → Sequencing → Versioning).
- **Per-file headers (ADR-0006, Python module docstring form)**
  on any new modules and updated headers on any touched module.

### Frontend

- **`frontend/src/engine/katago/types.ts`**: the new
  MetadataResponse aggregate shape (with optional `leafId` per
  entry and the `failedLeafs` array) and the routing field on
  the analyze-query type.
- **`frontend/src/components/Toolbar.vue`** and any switching-UX
  composables: per ADR-0006, retrofit the standard JSDoc/SFC
  header on touched files.
- **`frontend/README.md`**: brief note in the "OpenAPI codegen"
  or related operational section if any operator-facing
  configuration changes (probably none — the proxy URL is
  unchanged).

## Cross-references

- **`/CLAUDE.md`** (umbrella) — authoring posture, dispatch ledger
  pattern, submodule discipline.
- **`proxy/CLAUDE.md`** — the local form of ADR-0002 for proxy
  documentation consumption, the layer-vocabulary, the
  Transformer/Middleware/Router decision frame, the output
  structure for substantive proxy-side changes.
- **`proxy/README.md`** "Roles" table — the canonical operator-
  facing description of LEAF/RELAY/ECHO/REDIRECT that SELECTOR
  joins.
- **`proxy/ARCHITECTURE.md`** "The three-layer model" — the
  decomposition the plan operates within.
- **`proxy/ARCHITECTURE.md`** "Extension points" — the
  Transformer-vs-Middleware load-bearing surface choice
  (SELECTOR is neither; it's a Layer 3 BackendRouter subclass).
- **`proxy/ARCHITECTURE.md`** "Coalescing-transparent explicit
  terminate" — the worked example for response synthesis with
  loudness guarantees; the model the `query_models` aggregation
  follows.
- **`proxy/FRAMEWORK.md`** §3 "Caching Strategy" — the
  "Intercept & Strip" pattern for control flags; the plan
  argues `leafId` is the *opposite* case (kept on the canonical
  query so the Hub differentiates).
- **`proxy/docs/roadmap-response-variants.md`** — the v1.0.13
  `KataGoResponse = AnalyzeResponse | MetadataResponse` split,
  which the SELECTOR's MetadataResponse aggregation builds on.
  Also the structural template the proxy-side roadmap doc for
  the SELECTOR work should follow.
- **`docs/dispatch/proxy-to-proxy-id-translation-near-miss.md`** —
  the directly-relevant cautionary letter on declarative
  ID-translation. Read this before extending any policy with new
  ReferentialFields.
- **`docs/dispatch/proxy-to-proxy-post-v1.0.13-followups.md`** —
  Item 1 (silent-coercion sweep) is the direct precedent for the
  `leafId` parser's closed-set + raise-on-unknown shape.
- **ADR-0002** (`docs/adr/ADR-0002-fail-loudly.md`) — the
  failure-modes table is the application of this tenet to the
  new wire surfaces.
- **ADR-0004** (`docs/adr/ADR-0004-minimal-touch-edits.md`) — the
  ledger-keying and toolbar changes need full-file visibility on
  the affected modules before implementation.
- **ADR-0005** (`docs/adr/ADR-0005-documentation-discipline.md`) —
  the dispatch-ledger pattern this plan anticipates feeding.
- **ADR-0006** (`docs/adr/ADR-0006-source-file-headers.md`) —
  Python module docstring form for proxy-side files; JSDoc/SFC
  form for frontend-side files.
- **`docs/notes/analysis-persistence-plan.md`** — structural
  precedent for a cross-team plan-to-system-note arc.
- **`docs/notes/qEUBO.md`** — switching-UX precedent (session-only
  toggle, snappy A/B comparison via pre-computed results).

## License

Public Domain (The Unlicense).
