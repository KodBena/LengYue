# Multi-model routing — planning note (frontend ↔ proxy)

A planning artifact for an umbrella-level frontend/proxy collaboration:
the toolbar's static model-name surface becomes a dropdown over a fleet
of LEAFs served by an additively-extended RELAY. Written 2026-05-08
against frontend HEAD on branch
`kodbena/frontend/no-auto-restart-on-overlay-toggle` and proxy v1.0.13.

The note's role is to settle the design space *before* committing to a
proxy-side request. When the open questions below are resolved, the
material splits into a frontend-to-proxy dispatch
(`docs/dispatch/frontend-to-proxy-multi-model-routing.md`) which is
authoritative for the request to the proxy team, and the implementation
arcs on each side. This note then becomes historical reference under
ADR-0005's "documentation reflects content" posture and stays in
`docs/notes/` as the design rationale the dispatch points back at.

---

## Where this fits

The current surface — verbatim references rather than rewrites:

- **Toolbar (`frontend/src/components/Toolbar.vue:82-85`)** —
  a single `<div class="metric engine-identity">` with one
  `<span>` showing `engineInternalName ?? '—'` and a `:title`
  attribute carrying the raw `query_models` JSON for hover-debug.
- **`EngineState.info` (`frontend/src/types.ts:837-885`)** —
  a value object `EngineInfo { version, internalName,
  versionPayload, modelsPayload }`, populated wholesale on connect
  and never plural.
- **Wire types
  (`frontend/src/engine/katago/types.ts:105-212, 313-318`)** —
  the four proxy control flags (`cache`, `lookup_cache`,
  `replay_final_only`, `analysis_config`) sit at the top of
  `KataGoAnalysisQuery` in snake_case; KataGo's native flags
  follow in camelCase. `KataActionResponse` is the metadata-shaped
  response carrying `version?` / `models?` from `query_version` /
  `query_models`.
- **Probe sequence (`frontend/src/services/analysis-service.ts:138-180`)** —
  on every WebSocket open, `probeEngineInfo()` issues `query_version`
  + `query_models`, extracts `models[0].internalName`, and stores
  the full payloads on `EngineState.info`.
- **Proxy roles** — LEAF / RELAY / ECHO / REDIRECT
  (`proxy/README.md`'s "Roles" table). RELAY already speaks
  WebSocket to a fleet of upstreams enumerated by `UPSTREAM_URLS`,
  consistent-hashes queries onto the ring, and falls back to the
  least-loaded peer when the preferred upstream is saturated.
- **Response variants** — post-v1.0.13 the proxy emits
  `AnalyzeResponse | MetadataResponse` discriminated by structure.
  `MetadataResponse` is the natural wire shape for the new
  enumeration action introduced below.

---

## Problem

KataGo's analysis-engine wire protocol does not include a "use this
model" selector. The binary supports loading and running multiple
models within one process, but the analysis protocol exposes one
model per process — the model that was loaded at startup. To offer
the user a choice between models without reloading the engine, the
architectural answer is to run **multiple LEAF processes** (one per
binary/model combination) and have the proxy multiplex between them
under client direction.

The frontend's toolbar, today a passive "what am I talking to" label,
becomes the choice surface. Each entry in the dropdown describes one
upstream's identity — the model's `internalName` from KataGo's
`query_models` and the engine's `version` from `query_version`,
because different LEAFs may run different KataGo binaries on different
hardware. The existing per-connection tooltip (the raw `query_models`
payload at `Toolbar.vue:52-57`) moves to a `(?)` icon adjacent to the
dropdown, scoped to the currently-selected entry.

Selection is **session-scoped**: the proxy is an ephemeral resource;
its endpoint set can change between connections; storing "the user's
preferred endpoint" on the backend would invite mismatches between
saved selection and live availability. The selection lives in
`EngineState`, not in the persisted `GlobalStore` slice.

---

## Decided architecture

### Routing locus — additive on RELAY

The routing logic for "this query targets that LEAF" lives on the
existing RELAY role as an **additive optional field**, not a new
role.

When a query arrives carrying `target_endpoint: <id>`, RELAY
dispatches to the named upstream. When the field is absent, RELAY
falls through to the existing consistent-hash dispatch — vanilla
KataGo clients (the proxy's "any KataGo client will work" promise)
remain unaffected. The change is a one-branch in `RelayRouter`'s
dispatch function plus a routing-key channel through the
coalescing hash.

The decision was a call between three shapes (a new role, the mode
flag, and additive-on-RELAY); the rejected alternatives sit in
*Considered alternatives* below for the dispatch's record.

### Switch behaviour — disable-during-ponder

When the user picks a different endpoint, the dropdown is
**disabled while a ponder is in flight**. No mid-stream reroute,
no terminate-and-reissue choreography. The user finishes the
current analysis (waits or actively cancels via the existing
toolbar control), then switches.

The simplification flows through to the wire: `target_endpoint` is
stamped per query at issue time and never updated mid-flight; the
proxy treats the field as immutable for that query's lifetime; the
frontend doesn't need plumbing to abort and re-issue on selection
change. The keep-alive watchdog (proxy v1.0.10+) and the existing
terminate machinery handle the "user actively cancels" path
without modification.

---

## Wire shape

### New optional field on every action

```jsonc
{
  "id": "...",
  "action": "analyze",
  "target_endpoint": "leaf-a",   // NEW: optional. snake_case to
                                 // match the proxy's existing
                                 // control flags. Names an upstream
                                 // from the enumeration returned by
                                 // query_endpoints (below).
  "cache": false,
  "lookup_cache": false,
  // ... existing KataGo + proxy fields ...
}
```

The field applies uniformly to **every action**, not just `analyze`:

- `analyze` — routes the analysis to the named endpoint.
- `query_version` / `query_models` — routes the metadata query to
  the named endpoint, so the response is unambiguous about *which*
  LEAF answered. (Today these go to "the LEAF" — singular —
  because each LEAF runs its own proxy; in a RELAY-over-multi-LEAF
  topology the response is ambiguous without the routing key.)
- `terminate` — routes the terminate to the endpoint that's
  running the original query (the proxy can derive this from its
  own bookkeeping; the field is informational/redundant on
  terminate but kept for symmetry).

Vanilla KataGo clients omit the field; RELAY's existing dispatch
remains the path for them.

### New metadata action `query_endpoints`

```jsonc
// Query
{ "id": "...", "action": "query_endpoints" }

// Response (MetadataResponse per v1.0.13's discriminated union)
{
  "id": "...",
  "endpoints": [
    {
      "id": "leaf-a",
      "default": true,
      "version_payload": { /* full query_version response */ },
      "models_payload": { /* full query_models response */ }
    },
    {
      "id": "leaf-b",
      "default": false,
      "version_payload": { ... },
      "models_payload": { ... }
    }
  ]
}
```

The proxy aggregates per-upstream `query_version` + `query_models`
results (eagerly at RELAY startup, recommended) and returns the
enumeration in one shot. Each entry carries the full payload of
both metadata queries so the frontend can populate both the
dropdown labels (`models_payload[0].internalName` +
`version_payload.version`) and the `(?)` tooltip (the full
payloads, mirroring today's tooltip content) without follow-up
round-trips.

### Coalescing hash incorporates the routing key

The PubSubHub's coalescing hash is derived from query content
(`pubsub_hub.py`). Today, two semantically-identical queries from
two clients fold onto one canonical → one engine call → response
fans out to both clients. Multi-LEAF breaks this if the routing
key differs:

- Client A asks for query Q on endpoint E1
- Client B asks for the identical query Q on endpoint E2

These cannot coalesce — they hit different engines. The hash needs
to incorporate `target_endpoint`. Same partition logic applies to
the optional replay cache (`pubsub_hub.py:359`-area). Small,
mechanical, load-bearing.

---

## Frontend changes

### Toolbar

`Toolbar.vue:82-85` — replace the static `<span>` with a `<select>`
or a project-styled dropdown wrapper. The `(?)` icon sits adjacent
and surfaces a popover with the per-selection metadata
(`version_payload` + `models_payload` for the chosen endpoint).
The popover's content is the same JSON dump the current
`:title="modelTooltip"` produces — the rendering site moves, the
content does not.

```vue
<div class="metric engine-identity">
  <span class="m-lbl">{{ $t('toolbar.metric.model') }}</span>
  <select
    class="m-val engine-id-val"
    v-model="selectedEndpointId"
    :disabled="selectionLocked"
    :title="selectionLocked ? t('toolbar.engineSwitchLockedDuringPonder') : undefined"
  >
    <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">
      {{ ep.label }}
    </option>
  </select>
  <button class="engine-info-help" @click="toggleInfoPopover">(?)</button>
</div>
```

`label` is composed from the entry's `internalName` and `version`;
the exact form is a UX call (e.g., `"katago-1.13.0 / b18c384"` vs.
`"katago-1.13.0  ·  b18c384"`).

### `EngineState` and `EngineInfo`

`EngineInfo` (`frontend/src/types.ts:837-885`) is currently a
value object with one set of payloads. Two shape options:

- **Replace `EngineInfo` with a plural `EngineCatalog`**.
  `EngineState.info` becomes `EngineState.endpoints:
  ReadonlyArray<EngineEndpoint>` plus a sibling
  `selectedEndpointId: EndpointId | null`. Cleanest. Each
  `EngineEndpoint` carries `{ id, isDefault, version,
  internalName, versionPayload, modelsPayload }`.
- **Keep `EngineInfo` for the selected entry, add a sibling
  catalog**. `EngineState.info` reflects the *currently selected*
  endpoint; `EngineState.catalog: ReadonlyArray<EngineEndpoint>`
  is the full list. Backwards-compatible with the existing
  `engineInternalName` binding at `Toolbar.vue:44`. Slightly
  redundant.

Recommendation: the second shape (keep `info` as a derived view of
the selected endpoint, add a sibling catalog). The change to
`Toolbar.vue` is then minimal — `engineInternalName` continues to
work, and the dropdown is wired against `catalog` and
`selectedEndpointId`. Per ADR-0001, `EngineState` is the mutable
container; `EngineEndpoint` is a `readonly` value object.

`EndpointId` is a branded type (per ADR-0001's "branded types for
identifiers that should not be confused" posture, frontend
`CLAUDE.md`).

### Wire types (`frontend/src/engine/katago/types.ts`)

Add `target_endpoint?: EndpointId` to `KataGoAnalysisQuery`
(snake_case wire field; the property name on the TypeScript type
follows the proxy-flag convention of preserving snake_case for
proxy-controlled fields). Slot after `replay_final_only` and
before the `overrideSettings` group — keeps the three-group
structure (proxy flags / engine settings / per-query enrichment).

Add a `KataGoEndpointsResponse` shape (a `MetadataResponse`
specialisation) carrying the `endpoints` array, plus the
per-entry `EndpointMeta` shape. These are wire types
(snake_case); the ACL maps them to domain types
(`EngineEndpoint` etc.) at the boundary, same pattern as the
existing `KataActionResponse` → `EngineInfo` mapping in
`analysis-service.ts:138-180`.

### Analysis service

`probeEngineInfo()` (`analysis-service.ts:138-180`) extends to
issue `query_endpoints` after the existing `query_version` +
`query_models`. The probe sequence becomes:

1. `query_version` — gets the proxy's *aggregate* version (or the
   first upstream's, depending on the proxy's choice; see open
   questions).
2. `query_models` — same caveat.
3. `query_endpoints` — gets the enumeration, populates
   `EngineState.catalog`, sets `selectedEndpointId` to the
   `default: true` entry's id (or the first entry if no default
   is published).

A degenerate case: a LEAF-mode proxy (no fleet) returns one
endpoint. The dropdown renders with one option; visually
indistinguishable from a label except for the `<select>`'s
disclosure caret. Acceptable; UX review on whether to special-case.

Per-query stamping: every issued `analyze` (and `query_version` /
`query_models` if applicable post-`query_endpoints`) carries
`target_endpoint = selectedEndpointId`. The existing
`analysisService` query construction is the single site that needs
the stamp.

### Selection state placement

`selectedEndpointId` lives on `EngineState` — same container as
`activeMode`, `metrics`, `info`. It is **not persisted** by
`SyncService`: the catalog is derived from the live proxy's
enumeration, and a stale id pointing at a now-absent endpoint
would be a silent failure mode. The `useEngine` (or analogous)
composable exposes the read/write surface; the Toolbar `v-model`s
against the store via that surface.

If the proxy disconnects and reconnects with a different endpoint
set, the existing connect-time probe re-runs `query_endpoints`,
the catalog refreshes, and `selectedEndpointId` is reconciled (if
the prior selection's id is still in the catalog, keep it;
otherwise fall back to the new default). The reconciliation is
explicit — no silent reset.

### Disable-during-ponder

The dropdown's `:disabled` binds to a "ponder is running"
predicate. The frontend already tracks ponder state in
`analysisService` (the keep-alive `query_version` watchdog
reasoning depends on it; see `analysis-service.ts:88` per the
keep-alive dispatch). Surface as a computed on the engine
composable and consume from the toolbar.

The disabled-state tooltip names the reason (`"Switching engines
is locked while an analysis is running. Wait for the current
analysis to complete or cancel it."`) — the user is technical and
the system is loud about why a control isn't responding (ADR-0002
applied to UI affordances).

---

## Considered alternatives

### A new SELECT role

A distinct role next to LEAF / RELAY / ECHO / REDIRECT, dedicated
to client-driven dispatch. Cleanest semantic name (RELAY is
load-balance; SELECT is client-driven; the two are different
concerns). Rejected because RELAY already does the heavy lifting
(WebSocket fan-out to multiple upstreams, upstream tracking,
load-balance fallback) and the routing-key check is a one-branch
addition; duplicating RELAY's machinery in a sibling role is more
code for the same observable behaviour.

### Mode flag on RELAY

`RELAY_DISPATCH=hash|select` env var. Same role, two routing
strategies. Rejected because it forces operators to choose at
deployment time between client-driven and load-balanced
dispatch, when the additive shape lets clients opt into one or
the other per query (vanilla KataGo clients get hash; LengYue
gets explicit selection). Less expressive without buying anything.

### Session-level pinning

Pin the upstream choice at WebSocket-handshake time. The frontend
reconnects to switch models. Cleaner architecturally — the
session is the unit of model identity, and there's no per-query
routing key on the wire. Rejected because reconnect-to-switch is
heavier UX than a dropdown change, and the user's framing
("special fields in the query") points at per-query routing.

### Multiple frontend WebSockets

The frontend talks directly to N proxies (one per LEAF) and
picks. Eliminates the proxy's role in selection, but breaks the
single-connection UX, prevents proxy-side coalescing across
endpoints (acceptable — coalescing only makes sense within an
endpoint anyway), means N keep-alive watchdogs / N status
streams, and complicates the `analysis-service`'s connection
state management. Rejected on operational grounds.

---

## Open implementation questions

These resolve in the dispatch (or in dispatch-review). Candidates
and recommendations for the dispatch's "Open implementation
question" sections:

1. **Endpoint identifier shape.** Short proxy-assigned strings
   (e.g., `"leaf-a"`) vs. URLs vs. positional indices.
   Recommendation: short proxy-assigned strings, derived from the
   upstream's hostname or a per-endpoint label in the env config.
   URLs leak deployment topology to clients; positional indices
   are fragile across `UPSTREAM_URLS` reordering.

2. **Default-selection semantics.** Proxy publishes `default:
   true` on one entry (operator-controlled) vs. frontend picks
   first. Recommendation: proxy publishes; the operator can
   express intent via `UPSTREAM_URLS` ordering or a sibling env
   var. Falls back gracefully if no entry is marked default
   (frontend picks first).

3. **Lazy vs. eager `query_endpoints` population on the proxy.**
   Eager: proxy queries each upstream's `query_version` +
   `query_models` at RELAY startup, caches, returns from cache.
   Lazy: proxy fans out on first `query_endpoints` request.
   Recommendation: eager. Faster first-paint dropdown; bounded
   startup-time work; simpler error handling (a dead upstream
   surfaces at startup, not on first user click).

4. **Endpoint health.** What if an upstream is down at enumeration
   time? The entry could carry `healthy: bool`; the dropdown
   could disable unhealthy entries; `analyze` to an unhealthy
   endpoint could fail loudly. Recommendation: include a
   `healthy: bool` field; let the dropdown surface it visually
   but allow selection (a since-recovered upstream shouldn't
   require a frontend reload to become selectable).

5. **`query_version` / `query_models` semantics in multi-LEAF.**
   With `target_endpoint` carried, these route to a specific
   upstream. Without it (vanilla client), they need a deterministic
   target — first upstream? Random? The current single-LEAF
   wire shape doesn't have an answer. Recommendation: when the
   field is absent on metadata queries, RELAY routes to the
   `default: true` upstream. Predictable; documents-as-it-goes.

6. **Hot-reload of `UPSTREAM_URLS`.** If the operator changes the
   set at runtime (adds an endpoint), is the change reflected in
   subsequent `query_endpoints`? RELAY today reads
   `UPSTREAM_URLS` at startup. Recommendation: out of scope —
   restart-to-reconfigure is the expected operator pattern;
   revisit if a deployment surfaces the need.

7. **Wire-field naming.** `target_endpoint` is the placeholder.
   Alternatives: `endpoint`, `route_to`, `target_leaf`. The
   dispatch picks. Recommendation: `target_endpoint` —
   descriptive, namespace-clear, no abbreviation.

8. **`query_endpoints` action name.** `query_endpoints`,
   `query_topology`, `query_fleet`, `list_endpoints`. The
   dispatch picks. Recommendation: `query_endpoints` — mirrors
   the existing `query_version` / `query_models` naming
   convention.

9. **Coalescing hash partitioning.** Include the routing key in
   the hash directly, vs. partition the cache namespace by
   endpoint. Either works; the proxy-side decision. Mention
   here so the dispatch flags it.

---

## Sequencing

The arc:

1. **Plan refinement** *(this turn → subsequent reviews)*. This
   note resolves to the point of being splittable into a
   dispatch. Open questions above are the refinement target.
2. **Frontend → proxy dispatch**
   *(`docs/dispatch/frontend-to-proxy-multi-model-routing.md`)*.
   Authoritative for the request to the proxy team. Wire shape
   locked; endpoint enumeration shape locked; routing-field
   semantics locked. References this note for the design
   rationale and considered-alternatives record.
3. **Proxy-side PR**. Branch in the proxy repo. Additive RELAY
   dispatch field, new `query_endpoints` metadata action,
   coalescing-hash extension, tests (synthetic-backend
   diagnostic following the v1.0.9 `SyntheticPonderingRouter`
   pattern). Tag cut on completion (e.g., proxy v1.0.14 or
   v1.1.0 — the proxy team's call on whether this is a minor
   bump given the additive wire-shape extension).
4. **Umbrella pointer bump**. Separate umbrella PR per the
   `docs/CLAUDE.md` "submodule release arc" posture.
5. **Frontend PR**. Toolbar dropdown + `(?)` popover +
   `EngineState` extension + analysis-service `query_endpoints`
   issuance + per-query `target_endpoint` stamping +
   disable-during-ponder wiring. Depends on the proxy bump
   landing first; the wire types (`src/engine/katago/types.ts`)
   are hand-authored on the frontend (the proxy doesn't ship a
   typed schema yet — see `docs/handoff-current.md`'s "Drift
   between the proxy's contract and the frontend's wire type"
   rough-edge note).
6. **Status dispatch back to frontend**
   *(`docs/dispatch/proxy-to-frontend-multi-model-routing-status.md`)*.
   When the proxy ships, the status dispatch closes the loop and
   the frontend picks up. Same pattern as the keep-alive arc's
   v1.0.6 → v1.0.11 status reply.

---

## Documentation graph

The implementation arc updates the following:

- **This note** — stays in `docs/notes/` as the design-rationale
  reference. Pointed at by the dispatch and (eventually) by the
  handoff entry. ADR-0005 Rule 3: this note's relation to the
  dispatch is "design-rationale source"; the dispatch describes
  the relation rather than snapshotting.
- **`docs/dispatch/frontend-to-proxy-multi-model-routing.md`** —
  the cross-team request. Drafted when the open questions
  resolve.
- **`docs/dispatch/proxy-to-frontend-multi-model-routing-status.md`**
  — the proxy team's reply when the work ships.
- **`docs/handoff-current.md`** — "The frontend" section gains
  a paragraph on multi-model selection once the work lands. The
  "Drift between the proxy's contract and the frontend's wire
  type" rough-edge entry stays open (the new wire fields
  reinforce, rather than resolve, the typed-schema-publication
  pressure).
- **`docs/TODO.md`** — a new entry under the substantial-work
  tier for the cross-team arc. Annotated with the dispatch
  filename once it lands.
- **`frontend/src/components/Toolbar.vue`** — the per-file
  header (ADR-0006) gets a purpose-line refresh if the SFC's
  scope materially widens.
- **`proxy/ARCHITECTURE.md`** — the RELAY section documents the
  new optional routing-field and the `query_endpoints` action.
  The proxy team's call on whether this also warrants a section
  in `proxy/FRAMEWORK.md`.

---

## What this composes with

- **ADR-0002 (fail loudly)**. An unknown `target_endpoint` should
  surface a typed error response, not coerce to a default. A
  query against an unhealthy endpoint should surface a typed
  error, not hang. The dispatch's wire-shape section spells the
  failure modes.
- **ADR-0003 (domain bands)**. The new wire types and metadata
  action live in the Go-bound band (`src/engine/katago/types.ts`).
  The toolbar dropdown is technically game-tree-coupled
  (engine identity is a Go concept here) but the affordance —
  a dropdown over a catalog of remote-side services — is band-1
  shaped; the Chess port reuses the affordance.
- **ADR-0004 (minimal-touch)**. The frontend changes are
  scoped: one SFC, one types file, one service, one types-domain
  declaration. The contraction discipline applies if `Toolbar.vue`
  approaches the ADR-0007 250-line budget — the dropdown +
  popover combo can grow; if it does, the popover's
  content-rendering extracts as a child SFC.
- **ADR-0005 (documentation discipline)**. The note → dispatch
  → status arc follows the `frontend-to-proxy-keep-alive` and
  `frontend-to-backend-analysis-persistence` precedents.
- **ADR-0006 (per-file headers)**. New files (the popover SFC
  if extracted; the wire-type and domain-type additions) carry
  the standard JSDoc header. The new proxy module(s) carry the
  module-docstring header per the proxy's convention.

---

## Closing

The work is additive everywhere. The proxy gains an optional
routing-field consumer and a new metadata action; vanilla KataGo
clients are unaffected. The frontend's toolbar grows from a label
into a dropdown without changing the surrounding architecture —
`EngineState` still owns the engine identity surface;
`analysis-service` still issues the probe sequence on connect;
the `(?)` popover's content is the same JSON the existing tooltip
already renders. The choice of disable-during-ponder for the
switch behaviour means no terminate-and-restart machinery is
needed — the simplest semantics produce the smallest dispatch.

The open questions in this note resolve to a wire-shape and a
routing-semantics specification small enough for a single-phase
dispatch and a single proxy-side PR. The frontend follow-on is a
single PR. No architectural excavation; no cross-cutting
refactors. The work composes with the `frontend-to-proxy-keep-alive`
arc's v1.0.10+ infrastructure and with v1.0.13's response-variant
discrimination, both of which exist precisely to make additive
extensions like this one straightforward.
