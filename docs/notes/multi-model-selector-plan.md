# Multi-Model Selector — Frontend ↔ Proxy Plan

- **Status:** Design proposed. Not yet ratified; no implementation
  branch. Coordinated arc spanning `frontend/` and `proxy/`.
- **Genre:** Design note for an umbrella-level feature. Mirrors the
  shape of `docs/notes/analysis-persistence-plan.md` and
  `docs/notes/dsl-hyperparameter-harness-plan.md` — describes what
  is being proposed before any wire-shape commitment, names the
  unknowns, and sets up the dispatch chain that will record the
  negotiation once both sides commit.
- **Date:** 2026-05-08.
- **Scope:** `frontend/` (toolbar + analysis service + store) and
  `proxy/` (a new role + MetadataResponse extension). The umbrella
  pin to a proxy release advancing this work would be a separate
  arc per CLAUDE.md's submodule discipline.

## What this document is

The user-facing pitch, the architectural shift it implies, the new
proxy role's mechanics, the wire-shape sketch, the frontend's
shape, and a work-split that lets both halves proceed without
blocking on each other. It is a roadmap-plus-design-sketch, not a
finished spec — the named "open design questions" need ratification
(and possibly a frontend↔proxy dispatch exchange) before
implementation begins.

## Motivation

The toolbar today (`frontend/src/components/Toolbar.vue:82-85`)
shows the connected proxy's single model name as a static label,
sourced from a `query_models` probe issued by `AnalysisService`
(`frontend/src/services/analysis-service.ts:138-180`,
`probeEngineInfo`). The full `query_models` payload is exposed as
the element's tooltip — useful for the technical audience but
gated behind a hover.

The product target — serious Go researchers — wants to compare how
different KataGo models evaluate the same position. Different
weight files generate different policy distributions, different
ownership maps, and different score readings. A study tool that
makes those differences visible turns "which model do I trust
here" from a research question into a tactile A/B comparison.

KataGo's analysis engine binary is fully capable of loading
multiple models, but its wire protocol does not expose model
selection per query. The structural answer is to run multiple
**LEAF** processes — each binding one KataGo binary to one model —
and put a proxy role in front of them that routes by a wire-level
field.

This is a deliberate departure from KataProxy's "fully transparent
pass-through" aspiration. The four existing control flags
(`cache`, `lookup_cache`, `replay_final_only`, `analysis_config`)
already make the proxy semantic at the Hub layer; the new role
adds another semantic interpretation at the Router layer. The
transparency property is preserved for analyze responses end to
end — only the routing decision is proxy-interpreted.

## Today's surface

### Frontend
- `Toolbar.vue:82-85` — single-model display, bound to
  `engineInternalName` (`computed` at line 44, deriving from
  `store.engine.info.internalName`). Tooltip shows the raw
  `query_models` payload.
- `analysis-service.ts:138-180` — `probeEngineInfo()` issues
  `query_version` and `query_models` on every connect/reconnect,
  stores results verbatim in `store.engine.info`. Failure is
  logged, non-fatal.
- `frontend/src/engine/katago/types.ts:218-227, 313-318` — the
  wire types declare `query_version` and `query_models` as
  discriminated action types. `KataActionResponse.models` is
  typed `readonly unknown[]` deliberately; each element carries
  `internalName` (and `name`, the privacy-sensitive full path).
- `frontend/src/store/defaults.ts:12-75` — settings persist
  `engine.katago.url`, the four control flags, and override
  settings; **no model-selection preference exists today.**

### Proxy
- `proxy/sproxy_config.py:76-80` — the four roles declared as
  string constants, dispatched via the `cfg.ROLE` env var.
- `proxy/router.py:1183-1213` — `make_router(role, ...)` factory.
  `LeafRouter`, `RelayRouter(upstream_urls)`, `EchoRouter` are the
  three router classes; `REDIRECT` skips routing entirely.
- `proxy/katago/katago_proxy.py:92-126` — v1.0.13's discriminated
  `KataGoResponse = AnalyzeResponse | MetadataResponse`.
  `MetadataResponse` is a frozen dataclass with a single `opaque:
  dict[str, Any]` field — a deliberate pass-through with no
  proxy-side synthesis. See `proxy/docs/roadmap-response-variants.md`
  for the v1.0.13 split's rationale.
- **`RelayRouter` is already 1:many upstream** (`HashRing` over
  `upstream_urls`, load-aware selection). It load-balances
  *equivalent* upstreams; it does not route by query content.

### Switching-UX precedents
- `frontend/src/components/AnalysisControls.vue:121` — palette
  dropdown bound to `store.profile.settings.engine.katago.analysis_env.activePaletteId`.
  **Persisted.** Switches re-render from cached raw packets;
  no re-query.
- `frontend/src/components/QeuboToolbar.vue:68-139` — A/B audition
  segmented control bound to a session-only `q.toolbarView` ref.
  **Not persisted.** Both A and B are pre-computed when the
  audition is opened.

The model selector should follow the qEUBO pattern: session-only
state, the toggle is the user's act of attention rather than a
saved preference.

## The vision

### UX shape

The toolbar's static model label becomes a dropdown. Each entry
identifies one (LEAF, KataGo binary, model) tuple — labeled
something like `katago-b18c384-v22 (KataGo 1.15.3)`. The current
tooltip's content (the raw `query_models` payload, plus the
KataGo version, plus any LEAF-side metadata the proxy surfaces)
moves into a `(?)` icon adjacent to the dropdown that renders
metadata for the *currently-selected* model only.

Switching is snappy and ephemeral. The selected model is session
state — closing the tab and reopening loses the selection (the
proxy is an ephemeral resource; persisting "currently used model"
across sessions would mean persisting an opaque pointer into a
configuration that may have changed). On switch, the visible
analysis surfaces (winrate curve, ownership overlay, suggested
moves, score series) re-render against the per-model cached
results; if no result is yet cached for the new model at the
current node, an analyze query is issued.

### Architectural shape

A new proxy role — working name **SELECTOR** — that:

1. Holds N pre-configured upstream LEAFs (each a separate KataGo
   process with its own model and binary version).
2. Aggregates `query_models` responses across all LEAFs and emits
   a unified MetadataResponse, with each model entry tagged by a
   stable LEAF identifier.
3. Routes analyze queries to the LEAF named in a wire-level
   routing field on the query.
4. Fails loud per ADR-0002 if the routing field names an unknown
   LEAF (no silent fallback to a default).

## The SELECTOR role

### Position in the role taxonomy

LEAF binds the proxy to an engine. RELAY load-balances equivalent
upstreams. ECHO is a test seam. REDIRECT is a compat shim.
SELECTOR is the first role whose dispatch decision is a function
of query content rather than load or topology.

The distinction from RELAY matters: RELAY assumes upstreams are
interchangeable (any LEAF can serve any analyze query, picked
by load); SELECTOR assumes upstreams are *not* interchangeable
(each LEAF serves a distinct subset, picked by query field). The
two roles do not compose by accident — a SELECTOR-of-RELAYs is
coherent (each model behind its own load-balanced pool) but a
RELAY-of-SELECTORs is not (a single model has many copies; the
selection becomes meaningless).

### Role mechanics

Per the proxy's existing role-instantiation pattern
(`proxy_server.py:752-760` reads `cfg.ROLE`, `router.py:1183-1213`
dispatches to a `BackendRouter` subclass), SELECTOR follows the
same shape:

- A new `SelectorRouter(BackendRouter)` class in `router.py`,
  configured with a list of `(leaf_id, upstream_url)` tuples.
- A new branch in `make_router()` instantiating it.
- A new constant in `sproxy_config.py` and an env-var schema for
  the LEAF map (e.g., `PROXY_SELECTOR_LEAFS=b18c384=ws://localhost:41949,b40c256=ws://localhost:41950`).
- A `run_selector.sh` script analogous to `run_leaf.sh` /
  `run_relay.sh`.

Each upstream LEAF gets its own canonical-namespace slot at the
Hub layer — analyze queries to model A and model B do **not**
coalesce at the Hub even when their wire content is identical
(modulo the routing field). This is correct: they are
semantically different queries because the answers differ.

### Configuration

Initial cut: static configuration via env var (matching the rest
of the proxy's deployment posture). A LEAF map declared at startup
that doesn't change during the proxy's lifetime. Hot-reload of
the LEAF map is a follow-on concern; a SELECTOR restart is the
v1 answer.

## Wire design

### MetadataResponse aggregation

When the SELECTOR receives a `query_models` action from a client,
it issues `query_models` to each of its configured LEAFs in
parallel, collects the results, and emits a single
MetadataResponse whose `opaque` payload looks like:

```json
{
  "models": [
    {
      "leafId": "b18c384",
      "internalName": "kata1-b18c384...",
      "name": "...",
      "kataGoVersion": "1.15.3",
      "...": "...other fields the LEAF surfaced..."
    },
    {
      "leafId": "b40c256",
      "internalName": "kata1-b40c256...",
      ...
    }
  ]
}
```

The `leafId` field is added by the SELECTOR; everything else is
pass-through from the LEAF's `query_models` response. The
existing frontend extraction (`models[i].internalName`) continues
to work; the new field is additive.

For `query_version`, the SELECTOR's own version is meaningful
(the SELECTOR is the proxy the client is talking to). Per-LEAF
KataGo versions live inside each `models` entry.

### Analyze-query routing field

A new top-level control field on analyze queries, paralleling the
existing four (`cache`, `lookup_cache`, `replay_final_only`,
`analysis_config`). Working name: `selector.leafId` or `leaf_id`
(see Open design questions). The SELECTOR strips the field before
forwarding; the LEAF never sees it.

If the field is absent, the SELECTOR fails loud — there is no
default LEAF. The frontend's contract is "if you connect to a
SELECTOR, you must specify which LEAF you want." This composes
with the post-v1.0.13-followups dispatch's silent-coercion concern
(`docs/dispatch/proxy-to-proxy-post-v1.0.13-followups.md`, item 1):
the routing field is exactly the kind of newly-added wire surface
where `.get(field, default)` would silently coerce unknown values
into a default that masks a real bug.

### Failure modes (per ADR-0002)

| Condition | SELECTOR behavior |
|---|---|
| `query_models` to one LEAF times out | The aggregated response includes successful LEAFs and explicitly omits the failing one (with a `failedLeafs` array in `opaque` naming the failures, so the frontend surfaces it) |
| Analyze query missing the routing field | Reject with structured error response naming the missing field |
| Analyze query names an unknown `leafId` | Reject with structured error naming the unknown id and listing known ids |
| All configured LEAFs unreachable | Connection-time failure; SELECTOR refuses to start |
| One LEAF dies mid-session | That LEAF's slot becomes a 503-like surface for queries targeting it; other LEAFs unaffected |

These are deliberately loud: silent fallback to a "default" LEAF
when the user asked for a specific one would mask the kind of
configuration drift the SELECTOR is meant to surface.

## Frontend half

### Service layer

`AnalysisService.probeEngineInfo` (`analysis-service.ts:138-180`)
extends to recognize the multi-model shape: when the response's
`opaque.models` array has more than one entry (or any entry
carries a `leafId`), the service treats the connection as a
SELECTOR-fronted multi-model setup and stores the full list in
`store.engine.info.models` (new field) rather than only the first
entry's `internalName`.

Backwards-compat: a single-LEAF proxy returns a `models` array
with one entry and no `leafId`. The frontend treats that as
"single model, no dropdown" — the toolbar renders the static
label as today.

### Analyze-query construction

The query path that builds outgoing analyze queries (in
`analysis-service.ts` and the engine layer) gains an optional
parameter for the LEAF id, which is included as the wire-level
routing field on every query when set. The id is read from the
session-state ref (below), not from settings.

### Store

A new session-state ref — not in profile settings, not persisted
— for the currently-selected `leafId`. Default: the first entry
in `store.engine.info.models` (or null if single-model). Cleared
on disconnect / reconnect (the new connection's model list may
differ).

This follows the qEUBO `toolbarView` precedent
(`QeuboToolbar.vue:68-139`). Per ADR-0001, the ref is
genuinely-mutated session state and so does not get a `readonly`
annotation.

### Toolbar

`Toolbar.vue:82-85` becomes:

- If single-model: render today's static label unchanged.
- If multi-model: render a `<select>` (or styled equivalent) bound
  to the session-state ref, with options labeled by a function
  over each model entry (`internalName` + KataGo version, or
  similar — the exact label is a UX call). The current tooltip
  content moves into a `(?)` icon adjacent to the dropdown,
  showing the full metadata for the selected entry only.

### Switching UX

On `leafId` change, `AnalysisService.restartActiveAnalyses`
(existing hook at `analysis-service.ts:56` per the frontend
inventory) re-fires the active board's queries against the new
LEAF. The analysis ledger's keying needs to grow a model
dimension so results from different models do not collide and so
switching between them re-renders from cache rather than
re-querying. **This is the primary open design question**; see
below.

## Proxy half

### New role module

A `SelectorRouter(BackendRouter)` in `router.py` implementing the
shared interface (`dispatch()`, `start()`, `stop()`). The
implementation maintains one outbound WebSocket per configured
LEAF, dispatches analyze queries by stripping and reading the
routing field, and aggregates `query_models` by fanning the
metadata query out and merging results.

### Multi-LEAF lifecycle

The configured LEAF set is fixed at startup. Each LEAF connection
is established at SELECTOR start; failures during start abort the
SELECTOR (loud). Per-LEAF reconnection logic on transient drops
follows whatever pattern `RelayRouter` already uses for its
upstreams.

### Run script

`proxy/run_selector.sh` mirrors `run_leaf.sh` and `run_relay.sh`,
sets `PROXY_ROLE=SELECTOR` and the LEAF-map env var, and invokes
`proxy_server.py`.

### Failure surface

Per the table above. The structured-error responses for the
"missing routing field" and "unknown leafId" cases need to fit
into the existing analyze-error envelope; the proxy's existing
error shape is the reference.

## Work split and PR sequencing

The split lets both halves proceed in parallel up to the
end-to-end smoke. Suggested order:

1. **Proxy: SELECTOR role + MetadataResponse aggregation.** A
   single PR in the proxy repo. Adds the role, the aggregation
   logic, and the failure surface. Lands a proxy tag (e.g.,
   v1.0.14). Includes proxy-side tests for the new role.
2. **Frontend: multi-model recognition.** Extends
   `probeEngineInfo` and `store.engine.info` to recognize and
   carry the model list. Renders today's UI unchanged. Behind a
   feature flag if desired, since the SELECTOR isn't yet
   reachable.
3. **Umbrella: bump proxy pin.** Separate umbrella-side PR per
   CLAUDE.md submodule discipline.
4. **Frontend: dropdown + (?) icon + switching UX.** Toolbar
   change, store ref, ledger keying extension, switching
   behavior. The largest single PR; needs visibility into the
   ledger's current keying to land cleanly (ADR-0004 applies).
5. **Coordinated end-to-end smoke.** Two LEAF processes (e.g.,
   b18c384 and b40c256) behind a SELECTOR, exercised through the
   frontend toolbar. Validates the failure modes (kill one LEAF,
   send a query with an unknown `leafId`, etc.).

The dispatch chain that records this work would open as
`docs/dispatch/frontend-to-proxy-multi-model-selector.md`
(roughly: "frontend wants this, here's the proposed wire shape,
please confirm the field name and the failure-envelope shape").
The proxy reply ratifies the shape; subsequent status dispatches
mark each PR's landing.

## Known unknowns

These are the design questions that should be settled before
implementation, or carried into the dispatch exchange explicitly:

### Per-model result caching

The frontend's analysis ledger today is keyed by something like
`(boardId, nodeId, configHash)`. To make snappy switching real,
the key must grow a model dimension. Three shapes:

1. **Add `leafId` to the cache key.** Most direct. Each model's
   results are stored independently; switching reads the cached
   entry for the new model or fires a fresh query.
2. **Treat `leafId` as part of `configHash`.** The `analysis_config`
   for a model-specific query is materially different; folding
   `leafId` into the hash function might be the cleanest move.
3. **Use a `(model, payload)` tuple at every read site.** Heavier
   refactor; surfaces the model dimension explicitly.

Option 2 has the appeal of fitting the existing seam without a
new dimension, but it depends on what `configHash` covers today.
Resolving this needs visibility into the ledger's current keying
(in `frontend/src/services/analysis-ledger.ts` per the project's
naming convention) — a brief read of that module is the
prerequisite for committing.

### Selector field naming

`selector.leafId`, `leaf_id`, `proxy.endpoint`, `model`,
`target_endpoint` — all candidates. Constraints: must not collide
with KataGo's native fields; should fit the existing
control-flag naming ergonomic; should be obviously
proxy-interpreted (so future readers don't grep KataGo docs for
it). Recommend `selector.leafId` — namespaced under the role
that interprets it, parallel to `analysis_config`'s structure
as a proxy-control namespace.

### Backwards compatibility

A frontend that knows about SELECTOR connecting to a single-LEAF
proxy works (sees one model, renders today's label). A frontend
that does not know about SELECTOR connecting to a SELECTOR
proxy does **not** work — it would issue analyze queries without
the routing field, and the SELECTOR would reject them. This is
the right loud-failure shape, but it means the proxy bump and
the frontend update need to roll out coherently for users running
SELECTOR. Single-LEAF deployments are unaffected.

### Routing-field placement

Top-level field vs. nested under an existing namespace. Top-level
parallels `cache` / `lookup_cache` / `replay_final_only`. Nested
under `analysis_config` would frame it as a query-time analysis
parameter — but that namespace is already user-authored
configuration and mixing in proxy-routing semantics would muddy
the separation. Recommend top-level.

### What "models" means at the dropdown level

The user's framing: "the dropdown list… really should include the
model… since different LEAF endpoints can use different katago
binaries (and hence, different versions)". The dropdown entry is
therefore (LEAF, KataGo binary, model) as a unit, not just the
model name — which is what the `leafId` keying naturally
delivers. The label-formatting function for the dropdown is a
small UX call but the data model supports it cleanly.

### LEAF identity stability

`leafId` should be human-readable (it appears in dropdown labels
in the absence of a separate display label) and stable across
SELECTOR restarts. Operator-assigned via the env-var LEAF map is
the simplest answer; auto-generated from the model's hash would
work but loses readability. Recommend operator-assigned.

## Doc-graph audit

When this plan is ratified and implementation begins, the
following doc-graph touches follow (per ADR-0005's rules and
CLAUDE.md's "documentation is part of the work"):

- **`docs/TODO.md`**: a new tier-appropriate item pointing at
  this plan, describing the two-half coordinated arc.
- **`docs/handoff-current.md`** "Where the project is going":
  a new bullet under the post-v1.1.0 roadmap listing the
  multi-model selector arc with its plan reference.
- **`docs/dispatch/frontend-to-proxy-multi-model-selector.md`**:
  the dispatch that opens the negotiation; the proxy's reply
  closes it.
- **`proxy/docs/`**: documentation for the SELECTOR role inside
  the proxy submodule, alongside the existing role docs. The
  SELECTOR's existence and configuration surface should be
  documented in `proxy/README.md` (or wherever the existing
  roles are operator-documented).
- **`frontend/src/engine/katago/types.ts`**: the new MetadataResponse
  shape (with the optional `leafId` and `models` aggregate) and
  the routing field in the query types. Per ADR-0006 the
  affected files retrofit headers under full visibility.
- **`docs/notes/multi-model-selector-plan.md`** (this document):
  status frontmatter updated as PRs land; eventual retirement
  to `docs/archive/notes/` once the feature ships and the system
  note for it lands (or this plan is itself promoted to the
  system note, post-implementation).

## Cross-references

- **CLAUDE.md** — umbrella authoring posture, dispatch ledger
  pattern, submodule discipline.
- **ADR-0002** (`docs/adr/ADR-0002-fail-loudly.md`) — the failure
  modes section above is the application of this tenet to the
  new wire surfaces.
- **ADR-0004** (`docs/adr/ADR-0004-minimal-touch-edits.md`) — the
  ledger-keying and toolbar changes need full-file visibility on
  the affected modules before implementation.
- **ADR-0005** (`docs/adr/ADR-0005-documentation-discipline.md`) —
  the dispatch ledger pattern this plan anticipates feeding.
- **`proxy/docs/roadmap-response-variants.md`** — v1.0.13's
  `KataGoResponse = AnalyzeResponse | MetadataResponse` split,
  which the SELECTOR's MetadataResponse aggregation builds on.
- **`docs/notes/analysis-persistence-plan.md`** — structural
  precedent for a cross-team plan-to-system-note arc.
- **`docs/notes/qEUBO.md`** — switching-UX precedent (session-only
  toggle, snappy A/B comparison via pre-computed results).
- **`docs/dispatch/proxy-to-proxy-post-v1.0.13-followups.md`** —
  item 1 (silent-coercion sweep) is the relevant care-context
  for the SELECTOR's new wire-field handling.
- **`frontend/src/components/QeuboToolbar.vue`** — the closest
  existing pattern for a session-only toolbar selector.
- **`frontend/src/components/Toolbar.vue:82-85`** — the surface
  this plan modifies.
- **`proxy/router.py:1183-1213`** — the role factory the new
  SELECTOR slots into.

## License

Public Domain (The Unlicense).
