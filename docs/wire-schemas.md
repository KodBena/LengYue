# Wire schemas — cross-boundary message shapes

This document is a *navigation aid* for every wire shape that
crosses a sub-project boundary in the LengYue umbrella. Each
section names a shape, identifies its producer and consumer(s),
points at the authoritative source in code (per ADR-0005 Rule 3
— relations, not content snapshots), and flags any cross-cutting
discipline that governs the shape's lifecycle.

The doc itself does not redefine schemas. The truth lives in the
producer (or, where the parser is more authoritative than the
emitter, in the consumer) as code. The doc exists to make that
truth *findable* without grep across three sub-projects.

A consumer encountering an unknown wire field should be able to
arrive here, scan the section index, and reach the canonical
definition site in one click. A wire-shape change is the
authoring concern of the section's authoritative source; the
doc's role on the change side is to surface the change to the
*other* sub-projects via the cross-references each section
maintains.

---

## Index

- [§1 — `analysis_config`](#1--analysis_config) — SPA → proxy palette payload
- [§2 — Capability advertisement](#2--capability-advertisement) — proxy → SPA, on `query_version` responses
- [§3 — Per-query capability opt-in](#3--per-query-capability-opt-in) — SPA → proxy, on analyze queries
- [§4 — `extra` enrichment envelope](#4--extra-enrichment-envelope) — proxy → SPA, on analyze responses
- [§5 — SELECTOR `model` field](#5--selector-model-field) — SPA → proxy, on analyze queries
- [§6 — `/analysis-bundles` REST API](#6--analysis-bundles-rest-api) — backend ↔ SPA
- [§7 — `_PROXY_ONLY_FIELDS` central wire-strip](#7--_proxy_only_fields-central-wire-strip) — invariant governing §1, §3, §5
- [§8 — Future evolution: AsyncAPI](#8--future-evolution-asyncapi) — when this doc's discipline is no longer enough
- [§9 — `/games` REST API](#9--games-rest-api) — backend ↔ SPA, SGF library

---

## §1 — `analysis_config`

**Direction.** SPA → proxy, opaque field on analyze queries.

**Authoritative source.** Consumer-side. The proxy's
`RegistryInterpreter` defines what shape is parseable; the SPA
constructs payloads conforming to that shape.

- Consumer (canonical parser): `proxy/registry_interpreter.py`,
  `RegistryInterpreter.__init__` (constructor receives the
  config dict and compiles symbols/bindings against the curated
  stdlib). The shape's grammar — `parameters`, `symbols`,
  `bindings.{delta_fn, state_fns, summary_fn}` — is enforced
  here.
- Consumer (gating + analyzer construction):
  `proxy/transformers/analysis_enricher.py`, `on_query`
  function. Reads `config` (non-destructively, post-v1.0.21),
  builds `DeltaAnalysisState` from the compiled bindings.
- Producer: `frontend/src/services/analysis-config.ts`,
  `compileAnalysisConfig()`. Returns the dict the proxy will
  parse. The SPA's registry editor surfaces user-authored
  expressions; the compile step produces the wire payload.
- Producer (defaults): `frontend/src/store/defaults.ts`,
  `engine.katago.analysis_env` — the seeded palette is the
  reference example of a well-formed `analysis_config`.

**Lifecycle.** Proxy-only field. Stripped at the wire boundary
before forwarding to KataGo via `_PROXY_ONLY_FIELDS` (§7).
Stays in `q.opaque` after `analysis_enricher.on_query` reads it
(read-not-pop, post-v1.0.21) so sub-queries spawned by
`OrchestrationMiddleware` can inherit it and build their own
analyzer.

**Worked example.** A minimal valid `analysis_config`:

```python
# (Python dict shape; SPA sends as JSON.)
{
    "bindings": {
        "delta_fn": "winrate_delta",
        "state_fns": {"Win Probability": "winrate"},
        "summary_fn": "min_summary",
    },
    "parameters": {},
    "symbols": {
        "winrate": 'x["rootInfo"]["winrate"]',
        "winrate_delta": 'x[1]["rootInfo"]["winrate"] - x[0]["rootInfo"]["winrate"]',
        "min_summary": "float(min(x))",
    },
}
```

The `state_fns` values are symbol names (not expression bodies)
— the body lives in `symbols`. State_fns receive a single
packet `x`; delta_fns receive a windowed pair `[x_prev, x_cur]`.
The proxy's `_CURATED_SYMTABLE` defines the available stdlib
functions; symbol names that shadow curated names raise at
compile.

**Cross-boundary discipline.** Field shape changes require
SPA-side compilation update and proxy-side parser update. The
SPA's seed palette in `store/defaults.ts` is the convention-
test: if the seeded palette doesn't survive a round-trip, the
change is breaking.

---

## §2 — Capability advertisement

**Direction.** Proxy → SPA, on `query_version` responses.

**Authoritative source.** Producer-side.

- Producer (transformer that attaches the field):
  `proxy/transformers/capabilities_advertiser.py`. Runs as a
  Layer 1 Transformer, intercepts `MetadataResponse` instances
  carrying a `version` key and adds a `capabilities` entry to
  the opaque.
- Producer (advertised set):
  `proxy/proxy_server.py`,
  `_build_advertised_capabilities()`. Constructs the dict at
  server startup based on which middleware/transformer factories
  are wired and which native modules are importable.
- Wire shape on the response — a dict, not a flat list:
  ```json
  {
    "id": "...",
    "version": "1.16.4",
    "capabilities": {
      "delta_analysis": {},
      "adaptive_reevaluate": {},
      "selector": {}
    }
  }
  ```
- Consumer (parser):
  `frontend/src/engine/katago/version-probe.ts`,
  `parseVersionResponse()`. Reads the capabilities dict into
  `store.engine.info.capabilities`.
- Consumer (probe trigger):
  `frontend/src/services/analysis-service.ts`,
  `probeEngineInfo()`. Fires on each WS open; surfaces a
  connection-refusal system message if the proxy advertises
  capabilities at all but `delta_analysis` is missing (the SPA's
  universal-requirement gate).

**Gating.** Advertisement is itself gated by the proxy env-var
`PROXY_ADVERTISE_CAPABILITIES` (default false). Operators with
unknown clients can update without fear of breaking parsers that
don't tolerate unknown JSON fields. The frontend reads
field-absence as "legacy auto-engage path" and stays compatible
with pre-v1.0.14 proxies.

**Initial capabilities at v1.0.20+.** `delta_analysis`,
`transposition`, `adaptive_reevaluate`, `selector`. The first
three are behavioural (the client opts in per query, §3); the
fourth is a routing capability (presence-as-signal for the
SELECTOR dropdown UI). See `proxy/proxy_server.py`'s
`_build_advertised_capabilities` for the conditional logic that
decides which of these the running proxy advertises.

---

## §3 — Per-query capability opt-in

**Direction.** SPA → proxy, on analyze queries.

**Authoritative source.** Consumer-side gates define what's
recognised; producer constructs.

- Consumer (transformer gate):
  `proxy/transformers/capability_gate.py`,
  `capability_gate(name, wrapped_factory)`. Wraps a transformer
  factory to engage the wrapped transformer iff the query's
  `capabilities` dict contains `name`.
- Consumer (middleware gate):
  `proxy/middleware/capability_gate.py`,
  `CapabilityGatedMiddleware`. Same engagement contract, applied
  to middleware. The two gates share an engagement contract;
  the choice of which to use depends on whether the wrapped
  extension is a Transformer or a SessionMiddleware (per
  `proxy/ARCHITECTURE.md` § "Extension points").
- Producer:
  `frontend/src/engine/katago/capability-injection.ts`,
  `buildPerQueryCapabilities()`. Reads
  `store.engine.info.capabilities` (the advertised set from §2),
  the per-query caller flags (`isRangeBased`, `forReview`,
  registry toggles), and constructs the wire dict.
- Producer wiring:
  `frontend/src/services/analysis-service.ts`, `analyzeRange()`
  and `analyzeActiveNode()`. Both call
  `buildPerQueryCapabilities()` and inject the result into the
  outgoing query.

**Wire shape — symmetric to §2's advertisement.** Same
dict-of-dicts: `{capability_name: {metadata}}`. Empty `{}`
metadata means "opt in with proxy defaults." Adaptive's metadata
schema (the only capability today with non-empty metadata)
carries `worst_quantile` and `extra_visits`. The wire keys are
snake_case to match the proxy's metadata schema; the SPA's
registry stores camelCase and the capability-injection helper
translates at the wire boundary.

**Lifecycle.** Proxy-only field. Read by the gates above; popped
from opaque in `proxy/pubsub_hub.py:subscribe()` post-content-
hash; never reaches KataGo. Critically — distinct from `model`
(§5) — `capabilities` IS *retain-in-hash* in the coalescing
policy (per the v1.0.14 dispatch's Q6 sign-off in
`docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`),
because two queries differing only in `capabilities` produce
different transformer chains and therefore different response
artifacts.

**Default semantics when absent.** Legacy auto-engage: the proxy
auto-engages every wired transformer/middleware (preserving
v1.0.13-and-earlier behaviour for clients that haven't migrated).
Clients that want "engage nothing" send `capabilities: {}` — the
empty dict, which is distinguishable from field absence at parse
time.

---

## §4 — `extra` enrichment envelope

**Direction.** Proxy → SPA, attached to analyze responses.

**Authoritative source.** Producer-side. The proxy's enrichment
transformers attach this; the SPA's merge logic preserves
populated entries against incoming-empty per the merge contract
in `frontend/src/services/analysis-ledger.ts`.

- Producer (state, deltas, triangular, CWT):
  `proxy/transformers/analysis_enricher.py` + supporting analysis
  substance in `proxy/delta_analysis.py`,
  `DeltaAnalysisState.push_packet()`. The enricher constructs
  the `extra` envelope from the analyzer's pipeline outputs.
- Producer (transposition `clusterId`):
  `proxy/transformers/transposition_enricher.py`. Adds
  per-move `clusterId` to `moveInfos[]` entries when the
  capability is engaged; produces no top-level `extra` fields.
- Type contract (SPA-side):
  `frontend/src/engine/katago/types.ts`, `KataExtra` interface.
  The SPA-side TS shape mirrors what the proxy emits.
- Consumer (merge):
  `frontend/src/services/analysis-ledger.ts`,
  `mergeAnalysisPacket()` + `mergeKataExtra()` + `mergeRecords()`.
  The merge preserves populated existing entries against
  incoming-empty (the contract that made the v1.0.21 fix
  load-bearing on the SPA side).
- Consumer (read):
  `frontend/src/composables/analysis/useEnrichedData.ts`.
  Projects ledger entries into chart-ready series.
- Consumer (triangular heatmap):
  `frontend/src/composables/analysis/useTriangularHeatmap.ts`.

**Wire shape.**

```json
{
  "extra": {
    "state": {
      "5": {"Win Probability": 0.51, "Score Advantage": 1.2}
    },
    "black": {
      "deltas": {"0": 0.012, "1": -0.005},
      "triangular": [[[0, 2], 0.012]],
      "cwt": {}
    },
    "white": {"deltas": {}, "triangular": [], "cwt": {}}
  }
}
```

- `state` keyed by turn-string; inner dict keyed by state_fn
  *label* (from `bindings.state_fns` in §1).
- `<color>.deltas` keyed by per-color local-half-move index.
- `<color>.triangular` is a list of `[[s, t], value]` pairs.
- `<color>.cwt` is reserved for future use.

**Lifecycle invariant (post-v1.0.21).** Every analyze response
that flows through analysis_enricher carries an `extra` envelope
reflecting the analyzer's current snapshot at the queried slot —
even when the reactive_pipeline's `_are_equal` short-circuit
prevented the incremental update from firing. See
`docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md` for
the bug-and-fix arc that established this invariant.

---

## §5 — SELECTOR `model` field

**Direction.** SPA → proxy, on analyze queries (only meaningful
when the proxy advertises §2's `selector` capability).

**Authoritative source.** Consumer-side (the proxy router that
reads it).

- Consumer:
  `proxy/router.py`, `SelectorRouter.dispatch()`. Reads
  `query.opaque['model']` to choose which upstream LEAF the
  query routes to.
- Configuration:
  Proxy-side env var `SELECTOR_MODELS=label1=ws://host1:port1,label2=ws://host2:port2`
  declares the labelled upstream pool. Set at proxy startup.
- Producer (typed accessor):
  `frontend/src/services/analysis-service.ts`,
  `analyzeRange()` / `analyzeActiveNode()`. Reads
  `store.engine.selectedModel` and injects.
- Producer (UI):
  `frontend/src/components/chrome/Toolbar.vue`. Surfaces the
  available-models dropdown, gated on
  `store.engine.info.capabilities.selector` advertised.
- Producer (auto-select):
  `frontend/src/services/analysis-service.ts`, `probeEngineInfo()`.
  When SELECTOR is in play and the user hasn't explicitly
  chosen, auto-selects the first available model — keeping the
  wire contract honest without forcing a click before the first
  query can fire.

**Lifecycle.** Proxy-only field. Read by `SelectorRouter` to
dispatch; stripped at the wire boundary via §7. Critically —
distinct from `capabilities` (§3) — `model` is intentionally
NOT popped in `pubsub_hub.subscribe`, so `SelectorRouter` can
read it from `query.opaque` to choose the upstream; the central
wire-strip handles the wire side. Per §7's discipline, every
proxy-only field's lifecycle differs in pop/retain semantics
but all converge on the central strip.

**Coalescing.** `model` is *retain-in-hash* in the coalescing
policy (same Q6 sign-off as §3's `capabilities`). Two queries
identical except for `model` route to different upstreams and
produce genuinely different responses, so they must not coalesce.

---

## §6 — `/analysis-bundles` REST API

**Direction.** SPA ↔ backend, HTTP REST.

**Authoritative source.** Producer-side (backend route
definitions).

- Producer (FastAPI routes):
  `backend/api/routes/analysis_bundles.py`. Four endpoints:
  ```
  PUT    /analysis-bundles/{board_id}    — upsert
  GET    /analysis-bundles/{board_id}    — fetch
  DELETE /analysis-bundles/{board_id}    — idempotent delete
  GET    /analysis-bundles/             — list summaries for user
  ```
- Producer (Pydantic schemas):
  Defined in the same route file (`schemas/` pattern from
  `backend/CLAUDE.md`'s "Pydantic and FastAPI boundary discipline"
  — `AnalysisBundleResponse` and friends live with the route
  unless a second consumer emerges).
- Consumer (SPA):
  `frontend/src/services/analysis-persistence-service.ts`. The
  ACL boundary; translates wire shapes (snake_case) to domain
  types (camelCase, branded ids).
- Generated TS type:
  `frontend/src/types/backend.ts`. Auto-generated from the
  backend's OpenAPI schema via `npm run gen:api`; committed to
  the repo for reproducibility / review signal / end-user-build
  reasons (see `frontend/README.md` for the rationale).

**Cross-boundary discipline.** This boundary is uniquely
*already* generated-types-disciplined: the backend's OpenAPI
schema (auto-emitted by FastAPI from the route + Pydantic
definitions) is the SSOT, and the SPA-side ACL consumes
generated TS bindings. A backend wire-shape change produces
TypeScript compile errors on the consumer side via the codegen
pipeline.

This is the discipline §8 explores generalising to the
SPA↔proxy boundary; see there for the asymmetry between §1–§5
(hand-maintained) and §6 (generated).

---

## §7 — `_PROXY_ONLY_FIELDS` central wire-strip

Not a wire shape per se, but the invariant that governs §1, §3,
and §5: a frozenset listing every field that the SPA emits to
the proxy but that must never reach KataGo's stdin. The
authoritative line is the proxy's wire builder.

- Authority:
  `proxy/katago/katago_proxy.py`, `_PROXY_ONLY_FIELDS`
  frozenset. The wire builder
  (`translate_query_to_wire`) excludes any key listed here. New
  proxy-only fields become a one-line tuple extension to this
  one location.
- Documented in: `proxy/CLAUDE.md` ("centralise the
  never-reaches-KataGo discipline in one authoritative place"),
  with the corresponding cautionary trace in
  `docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md`'s
  addendum.

**Current membership.** `cache`, `lookup_cache`,
`replay_final_only`, `analysis_config`, `capabilities`, `model`.
Each has its own pop-or-retain semantics elsewhere (§3's
`capabilities` pops in `subscribe`; §5's `model` is retained in
opaque for the router; §1's `analysis_config` is now
read-not-pop post-v1.0.21). The central strip is what makes the
per-consumer pop semantics non-load-bearing for the
never-reaches-KataGo property.

---

## §8 — Future evolution: AsyncAPI

**Status.** Considered, deferred. Recorded here so the
consideration is visible and the conditions under which the
deferral lifts are explicit.

The wire shapes in §1–§5 are *hand-maintained* across two
sub-projects — the proxy defines the contract, the SPA mirrors
it (`frontend/src/engine/katago/types.ts` and adjacent files).
Drift between the two is currently a documentation-discipline
concern (this doc is part of that discipline), but a sufficiently
adversarial change could produce silent breakage where the SPA
parses a wire shape the proxy no longer emits, or vice-versa.

**The principled answer is AsyncAPI** (the OpenAPI-equivalent
for WebSocket protocols). A canonical spec under
`proxy/wire/asyncapi.yaml` (or similar) would describe message
types, channels, and schemas; a codegen pipeline would generate
the SPA's TS types and the proxy's Python dataclasses from the
single source. The boundary becomes typed end-to-end, parallel
to the SPA↔backend boundary's existing OpenAPI discipline
(§6).

**Why deferred.** AsyncAPI is significant infrastructure —
codegen pipelines on two sub-projects, tooling decisions
(asyncapi-generator, custom templates, …), CI gates,
discipline to keep the spec authoritative against the
implementations. The hand-maintained mirrors currently work
because the proxy wire is small and changes are coordinated
through dispatch documents (see `docs/dispatch/` for the
historical pattern). The cost of adoption exceeds the cost of
current drift.

**When the deferral lifts.** Three conditions warrant
revisiting:

1. **A second proxy-protocol consumer materialises.** Today
   only the SPA consumes the proxy's wire. A second client
   would benefit substantially from generated types — the cost
   of mirror-maintenance is per-consumer.
2. **A drift-induced silent bug surfaces.** A wire-shape change
   that the SPA's hand-maintained types failed to track, where
   the drift caused user-visible misbehaviour without compile-
   time signal. This would be ADR-0002-shaped evidence that
   the documentation-discipline isn't sufficient.
3. **The proxy wire grows substantially.** New message types,
   new transformer-emitted fields, new opt-in capabilities at
   a cadence that makes the hand-maintained mirror burdensome.
   The current cadence is ~one new field per minor proxy
   release; sustained acceleration would tip the balance.

If pursued, the natural placement is `proxy/wire/asyncapi.yaml`
(spec lives with the producer); the SPA-side codegen step
slots into `frontend/package.json` alongside `npm run gen:api`
(which does the same for the backend↔SPA boundary).

**Dependency for postmortem §5.3.** The
`docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
§5.3 proposal for a wire-attached diagnostic envelope is
deferred against this same principled answer. Until generated
types exist, attaching diagnostic metadata to responses
introduces an SSOT risk parallel to the one §8 addresses for
the production wire (the diagnostic shape describes
proxy-internal state; without codegen the proxy and consumers
maintain separate parsers and can drift). When §8 lifts, §5.3
becomes implementable without the SSOT risk — the diagnostic
fields would be schema-defined and code-generated parallel to
the production wire.

---

## §9 — `/games` REST API

**Direction.** SPA ↔ backend, HTTP REST.

**Authoritative source.** Producer-side (backend route
definitions).

- Producer (FastAPI routes):
  `backend/api/routes/games.py`. Four endpoints:
  ```
  POST   /games/import   — batch import of raw SGFs
  GET    /games          — paginated list with sort + filter + total count
  GET    /games/{id}     — fetch one game including raw_content
  DELETE /games/{id}     — delete one game
  ```
- Producer (Pydantic schemas):
  Inline at the top of the route file per backend CLAUDE.md
  ("inline at the route until a second consumer appears"). The
  list-row / detail shapes reuse the domain value objects
  `LibraryGameListItem` / `LibraryGame` directly as
  `response_model` — those are the OpenAPI-published wire
  shapes.
- Producer (domain value objects):
  `backend/domain/game_library.py`. Closed-vocabulary `GameListSort`
  enum (per ADR-0008's classification discipline); discriminated
  `ImportOutcome` union (`created` / `deduplicated` / `errored`)
  with `status` as the dispatch field.
- Consumer (SPA):
  Not yet implemented at this section's authoring date. Will land
  as a separate frontend arc; once shipped, the ACL boundary will
  be `frontend/src/services/game-library-service.ts` (consistent
  with the existing `analysis-persistence-service.ts` shape).
- Generated TS type:
  `frontend/src/types/backend.ts`. Will be regenerated via
  `npm run gen:api` after backend ship.

**Cross-boundary discipline.** Same generated-types pattern as
§6 — FastAPI's OpenAPI emit is the SSOT, the SPA's ACL consumes
the generated bindings. A backend wire-shape change produces
TypeScript compile errors on the SPA side.

**Pagination contract.** Random-walk-friendly `offset` + `limit`,
not cursor. The choice was deliberate (cursors are forward-only
and fight scrollbar-drag-to-arbitrary-row UX); design rationale
in `docs/notes/sgf-library-plan.md`. Sort + filter changes reset
`offset` to 0; the wire response carries `total_count` so the
SPA's virtual scroll can size the scrollbar without seeing every
row.

**Column projection.** `GET /games` list rows exclude
`raw_content` (the ~2 KB SGF body). The SPA fetches
`raw_content` on demand via `GET /games/{id}` when a thumbnail
needs to render. Prefetching N rows ahead of the scroll position
is the SPA's concern, not the wire contract's.

**Per-file outcomes.** `POST /games/import` returns a
discriminated outcome list rather than 4xx-on-any-failure: a
batch with one malformed SGF among ten produces nine `created`
outcomes and one `errored` outcome at the right index, with the
HTTP status remaining 200. The adapter's SAVEPOINT-per-row
isolation makes this honest at the SQL level.

**Failure paths.**
- 413 `{kind: "batch_too_large", received, maximum, ...}` when
  the batch size exceeds `SGF_LIBRARY_IMPORT_BATCH_MAX`.
- 422 on invalid sort column (Pydantic Literal validation), out-of-range
  offset/limit, or malformed request body.
- 404 on missing or cross-tenant detail/delete (404-not-403
  invariant per `docs/notes/tenancy.md`).
- 401 on missing/invalid bearer token (auth-spine).

---

## Related documents

- `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
  — investigation lessons that motivated this doc's §5.1
  recommendation. §5.3 there is deferred against §8 here.
- `docs/notes/proxy-topology-testing-plan.md` — the topology
  testing substrate; references §3 (capability opt-in) and §5
  (SELECTOR model) for the operator-declarative
  `PROXY_ENABLE_<CAPABILITY>` pattern its §3 designs.
- `docs/adr/0005-documentation-discipline.md` — Rule 3
  (descriptions describe relations, not content) is the
  discipline this doc operates under; Rule 1 (single source of
  truth per nominal handle) is what each wire shape's
  "Authoritative source" subsection enforces.
- `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`
  + status sibling — the cross-team contract that established
  §2 / §3 / §5. The dispatch is the planning-time record; this
  doc is the post-implementation navigation aid (the two
  compose: dispatch carries the *why* of the contract, this
  doc carries the *where* of the current implementation).
- `proxy/ARCHITECTURE.md` §"ID namespaces and translation" —
  the underlying invariant that makes the wire-strip discipline
  in §7 load-bearing.
- `frontend/CLAUDE.md` §"Type-driven design" — the SPA-side
  discipline for branded types and discriminated unions that
  the hand-maintained mirrors in `frontend/src/engine/katago/types.ts`
  operate under.

---

## On updating this doc

When you add, remove, or reshape a wire field:

1. Update the producer source (or consumer parser, per the
   section's "Authoritative source" line).
2. Update the consumer site(s) to match.
3. If the change is breaking or cross-cutting, file a
   dispatch document in `docs/dispatch/` per ADR-0005 Rule 2.
4. Update *this doc's* affected section's references — file
   paths, function/symbol names, lifecycle properties.

The doc's invariant per ADR-0005 Rule 3: each section's body
describes the *relation* between producer and consumer (and
the lifecycle that links them). Where a concrete shape is
useful, the section includes a "Worked example" block; that
block is the only content-snapshot per section and is kept
explicitly minimal so it doesn't become a parallel source of
truth competing with the producer code.
