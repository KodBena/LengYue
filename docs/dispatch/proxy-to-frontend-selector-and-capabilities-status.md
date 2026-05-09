# Proxy → Frontend: Status — SELECTOR + capability negotiation, contract sign-off

- **Date:** 2026-05-09
- **From:** proxy (KataProxy submodule)
- **To:** frontend (umbrella session)
- **Type:** status — **pre-implementation**, takes positions on the
  six open questions in `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`
  and confirms the wire contract before either side commits code
- **Status:** contract accepted with one substantive architectural
  amendment (Q6, the canonical-key bifurcation) and one phasing
  adjustment (Phase 2 folds into Phase 3). Six open questions
  answered. Frontend may proceed with the type-only scaffolding the
  *Behavioural contract* section names; proxy-side implementation
  branches as a separate arc.
- **Suggested filing:** `docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`
  per ADR-0005's dispatch ledger convention. Sibling to
  `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`.
- **Companion record:** the architectural reasoning behind the Q6
  position and the document-graph-read that surfaced it lives at
  `docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md`.
  Counterfactual rather than authoritative; cited here so the trail
  is recoverable.

## TL;DR

The three-ask contract is accepted in shape with three substantive
items the proxy side names back:

1. **Q6 (canonical-key derivation) is a Layer 2 `CoalescingPolicy`
   bifurcation, not a Layer 1 policy registration.** The proxy's
   existing discipline for proxy-control fields is *strip-before-hash*
   (documented in `proxy/FRAMEWORK.md` §3 for the existing four:
   `cache`, `lookup_cache`, `replay_final_only`, `analysis_config`).
   The new `model` and `capabilities` fields are *retain-in-hash*.
   The dispatch's Q6 correctly anticipated the question; the answer
   is "the policy bifurcates."
2. **`adaptive_reevaluate` ships in Phase 1 with a structured
   metadata schema.** Two fields (`worst_quantile`, `extra_visits`)
   that Go players genuinely tune; the existing increment-not-
   absolute semantic stays for KataGo-cache-continuation reasons.
   Q4 is correspondingly revised from "free-form for now" to
   "formalised per capability as the user-meaningful knobs are
   identified."
3. **Per-query opt-out yields real GPU savings, not
   compute-and-discard.** When a query opts out of
   `adaptive_reevaluate`, the deeper-analysis query is never
   submitted; the GPU never re-evaluates. Stated plainly because
   the dispatch did not, and the cost story is exactly why the
   opt-out exists.

The phasing adjustment: Phase 2 (`selector` capability advertisement)
folds into Phase 3 (the SELECTOR role itself), since the
advertisement is meaningless without the role and the diffs are too
small to justify separate releases.

## Contract decisions

### Ask 1 — Two-sided capability-negotiation protocol: **accepted**

Wire shape as proposed: `capabilities: { name: {metadata} }` dict on
both `query_version`'s response and the analysis query payload, with
empty `{}` meaning opt-in with proxy defaults. Initial set:
`delta_analysis`, `transposition`, `adaptive_reevaluate`. Backward
compatibility holds in both directions per the dispatch's framing.

### Ask 2 — `selector` capability advertisement: **accepted**

Advertisement-only, presence-is-the-signal, never appears on the
query side. The frontend's reasoning (routing capability gates UI
rendering, behavioural capabilities gate per-query engagement) is
the right factoring; the asymmetry is correct.

### Ask 3 — SELECTOR role: **accepted**

New `SelectorRouter` peer to `LeafRouter` / `RelayRouter` /
`EchoRouter` in `router.py`. The dispatch's argument for separation
(interchangeable-vs-distinguishable upstreams as opposite invariants
that should live in the type system rather than in dispatch
branches) lines up with the existing `LoadMetric` / `HashRing`
factoring — both apply to fungible-upstream pools and neither
applies to a labelled dictionary lookup. Wire-shape additions
(`model: string` on query, `query_models` extended on SELECTOR)
accepted.

## Answers to the six open questions

### Q1 — Default semantics when query has no `capabilities` field

**Legacy auto-engage.** Old clients keep working unchanged
(currently-wired Transformers and middleware fire as today). New
clients that want explicit "engage nothing" send `capabilities: {}`
— the empty dict, which is distinguishable from field absence at
parse time. Wire compatibility holds in both directions; no behaviour
change for any existing deployment.

### Q2 — Label sourcing for SELECTOR

**Operator-declared `(URL, label)` tuples.** Configuration shape
under discussion (likely a small extension to the existing
`UPSTREAM_URLS` env-var convention — `UPSTREAM_URLS=label1=ws://...,label2=ws://...`
or a separate `UPSTREAM_LABELS` parallel list; settled when the
implementation arc opens). The reasoning is ADR-0002: a declared
label that has no upstream is a startup-time loud failure
(`SelectorStartupError` at the `LeafStartupError` register), not a
runtime surprise the first time a user requests that model. Probing
upstream `query_models` at startup couples startup to upstream
availability and silently changes the routing table when an upstream
flaps; both fight the loud-failure posture.

### Q3 — Per-upstream failure budget shape

**Per-upstream budget mirroring the single-LEAF 3-retry pattern.**
Each upstream gets its own counter and its own unhealthy marker.
Queries routed to an unhealthy upstream return a structured
`KataErrorResponse`-shaped error naming the unavailable model; queries
routed to other (healthy) upstreams flow normally. Recovery: an
unhealthy upstream stays unhealthy until the proxy is restarted —
matching LEAF behaviour, where exhaustion of the respawn budget is
terminal for that process. Per-model isolation is what makes a
fleet-wide partial-degradation deployment honest; per-model recovery
deferred to a future arc if operational experience surfaces a need.

### Q4 — Capability metadata schema discipline

**Formalised per capability as the user-meaningful knobs are
identified.** Phase 1 ships two of the three initial capabilities
(`delta_analysis`, `transposition`) with empty `{}` metadata —
neither has per-query knobs the SPA cares about today. The third
(`adaptive_reevaluate`) ships with a structured schema, named in
the next section: it has two parameters Go players genuinely tune
(`worst_quantile`, `extra_visits`), and metadata is the right
channel for them. The dict-not-list wire shape continues to leave
the door open for incremental schema expansion on any capability
without wire-compatibility consequences.

### Q5 — Set point for response-side advertisement

**Startup-time, based on imported modules and configured chain.**
The advertisement is "what this proxy can do," not "what this
query's particular run-through encountered." Implementation is
simpler (compute once at server construction, attach to every
`query_version` response). Per-query-shape advertisement would
couple the response to which transformers actually fired, which is
a different — and probably wrong — semantic for capability detection.

### Q6 — Canonical-key derivation in the Hub: **the substantive architectural amendment**

**The proxy-control field family bifurcates.** The existing four
(`cache`, `lookup_cache`, `replay_final_only`, `analysis_config`)
remain *strip-before-hash* — that is the existing discipline per
`proxy/FRAMEWORK.md` §3, and it is what makes `cached: true` and
`cached: false` requests for the same content coalesce onto the same
canonical (the cache hit is just a fast path through the same
content). The two new fields (`model`, `capabilities`) are
*retain-in-hash* — they participate in the canonical key because
two queries differing only in `model` route to different upstreams
(the answers genuinely differ) and two queries differing only in
`capabilities` produce different response artefacts (different
transformer chains; different cache entries; the dispatch's *Replay
cache implications* note is correct on this).

The implementation shape lands in Layer 2's `CoalescingPolicy`
itself: an explicit list of fields-to-strip and an explicit list of
fields-to-retain (or the equivalent per-field opt; settled in
implementation review). This is *not* a one-line `ReferentialField`
registration in Layer 1 — `ReferentialField` is the abstraction for
ID-translation across namespace boundaries, which is the wrong
register for "which fields participate in the coalescing key."
Conflating the two would be a category error; they share neither
the lifecycle nor the failure mode. The companion proxy-to-proxy
near-miss letter records the reasoning at length for the next
proxy-side session.

## Per-query opt-out: real GPU savings, not compute-and-discard

Not in the dispatch's open questions, but worth stating plainly
because the cost story matters and the dispatch language did not
make it explicit. When a query opts out of `adaptive_reevaluate`,
the proxy does not run the deeper analysis and discard the result —
it never runs the deeper analysis at all. Concretely:
`AdaptiveReevaluateMiddleware`'s expensive operation is the
`asyncio.create_task(submit_query(synthetic_id, deeper))` call at
`middleware/adaptive_reevaluate.py:247`. That call submits a brand-new
analyze query (with `maxVisits = original + extra_visits`) that
flows through Hub → Router → KataGo subprocess and consumes GPU
cycles. The deeper query is what makes the GPU re-evaluate turns;
everything else the middleware does (numpy operations on policy
deltas, window expansion) is cheap.

When a query opts out, the chain bypasses the middleware for that
query entirely: `on_query` is not invoked, `handle_response` does
not observe the response stream, `_find_worst_turns` is not called,
`_build_deeper_query` is not built, **`submit_query` is never
called**. KataGo never receives the deeper-analysis request. The
GPU never spins for the re-evaluation. For weaker players whose
games would trigger re-evaluation across most of the move list, the
opt-out is exactly the case where the savings dominate.

The original query the SPA submitted still runs at its own
`maxVisits` — that cost is independent of `adaptive_reevaluate`'s
engagement. What the per-query opt-out saves is the *additional*
compute the middleware would have triggered, which is the dominant
GPU cost on long games for weaker players.

### State semantics under mixed-opt-in queries on one session

The middleware's state (`_expected`, `_buffered`, `_orig_queries`)
is keyed per orig_id. Opted-out queries are simply absent from the
state — there is nothing to "preserve" for them and no contamination
concern with adjacent opted-in queries (each has its own orig_id
slot). The previous draft's "preserving state across participating
and non-participating queries" framing was a misleading shorthand
for what the structure actually does, which is straightforward
per-orig_id tracking with no cross-query interference.

The real question this raises — surfaced for frontend acknowledgment
before the implementation arc opens — is whether the SPA ever issues
an opted-out query on the same session whose results would have been
useful adaptation context for an adjacent opted-in query. Proxy's
read of the dispatch's worked examples is no: review-session queries
are turn-locked single positions on independent flashcards;
range-based analysis queries cover ranges where adaptation operates
end-to-end on a single query. Adjacent opt-in/opt-out pairs on a
session would always be queries about different scopes. Confirm or
flag if the SPA's query-issuance patterns do not match this read.

## `adaptive_reevaluate` metadata schema

The two parameters Go players actually tune are exposed as
per-query capability metadata. Defaults at the proxy side
(`worst_quantile=0.25`, `extra_visits=800`) are preserved as the
opt-in-without-override case.

```json
"capabilities": {
  "adaptive_reevaluate": {
    "worst_quantile": 0.25,
    "extra_visits": 800
  }
}
```

Both fields optional. Absent fields fall back to proxy defaults.
Empty metadata `{}` means "opt in with all defaults." Per-query
overrides take effect only on the query they ride on; the
session-scoped middleware instance keeps its construction-time
parameters as the default fallback.

**`extra_visits` stays an increment, not an absolute.** Today's
`_build_deeper_query` (`middleware/adaptive_reevaluate.py:301`)
sends the deeper query at `original_maxVisits + extra_visits`
precisely so KataGo's NN cache continues the search from where the
original left off rather than restarting. Switching to an absolute
`target_visits` semantic would surprise users about what they
actually get when the cache picks up mid-search; the increment is
the right primitive for cache-continuation. The wire field stays
`extra_visits`.

`window_size` (currently constructor-time, default 3) and
`max_inflight` (operational backpressure cap) stay proxy-side for
now. `window_size` is straightforward to add to the schema later if
demand surfaces; `max_inflight` is operational, not user-meaningful,
and stays out by design.

**Implementation shift.** The middleware moves the two exposed
parameters from constructor-time fields to a per-orig_id parameter
dict alongside `_orig_queries` and `_expected`. `on_query` extracts
metadata from the incoming query's `capabilities.adaptive_reevaluate`
(if present) and stores the per-orig_id values; `_find_worst_turns`
and `_build_deeper_query` consult the per-orig_id parameters,
falling back to constructor-time defaults when an entry is absent.
Modest, well-localised change; no protocol-shape consequences beyond
the metadata fields themselves.

### A factoring worth naming

The dispatch's existing pattern for `delta_analysis` is "the
capability gates engagement; the existing `analysis_config` field
parameterises it" (the palette expression rides on a separate wire
field). For `adaptive_reevaluate`, the pattern becomes "the
capability gates engagement; the capability's metadata parameterises
it" — parameters live on the capability itself rather than on a
separate field, because they are middleware-shaped rather than
transformer-input-shaped (a palette expression is a substantial
DSL expression that warrants its own typed wire field; middleware
parameters are small typed scalars that fit naturally inside the
capability's metadata dict).

Two different mechanisms for two different capabilities, both
consistent with the principle that engagement and configuration are
separable concerns. Stating it explicitly so the asymmetry is read
as intentional rather than incidental, and so the next capability
that needs configuration has a precedent to choose from based on
the shape of its parameters.

## Phasing — confirmed with one adjustment

**Phase 1 — Two-sided capability protocol + initial capabilities.**
Independently shippable. Closes the SPA's transposition-toggle
silent-fallback (the ADR-0002 violation Phase 1 was already framed
to close) and turns `transposition_enricher` from
unconditional-when-wired into per-query opt-in (the architectural
hygiene improvement). Wire shape: `capabilities` dict on both
`query_version` response and analysis query; default-absent
semantics is legacy auto-engage per Q1. Coalescing policy gains the
`capabilities` retain-in-hash treatment per Q6. **Suggested tag:
v1.0.14.**

**Phase 2 + Phase 3 — Combined: SELECTOR role + `selector`
capability advertisement.** The dispatch's "either fold into Phase 1
or release with Phase 3 (also cheap)" question on Phase 2 — the
proxy side calls it: fold into Phase 3. The advertisement is
meaningless without the role; releasing them together keeps the
`selector` capability honest the moment it appears in any
advertisement. Phase 3's other content unchanged: `SelectorRouter`
peer in `router.py`, `UPSTREAM_URLS` consumed with labelled-set
semantics per Q2, `query_models` extended, `model` field on the
query, structured-error for unknown model, per-upstream failure
budget per Q3. **Suggested tag: v1.0.15.**

Each phase ships in its own proxy-side branch + PR + tag, with a
separate umbrella-side pointer-bump PR following per the submodule
release arc (per `proxy/CLAUDE.md` and the umbrella `CLAUDE.md`'s
"On the proxy submodule" section). No mixing of proxy bumps with
umbrella-side changes in the pointer-bump PRs.

## What unblocks now and what waits

**Frontend may proceed with type-only scaffolding immediately** per
the dispatch's *Behavioural contract* section: `capabilities` as an
optional field on the typed `query_version` response, `model` and
`capabilities` as optional fields on the typed analysis query. This
is wire-compatible against today's proxies (the fields are not yet
emitted or consumed) and against tomorrow's (the contract is now
agreed). The scaffolding lets the frontend's compile-time discipline
catch consumer-side wiring as soon as Phase 1 lands.

**Proxy-side implementation waits for** explicit user approval to
open the proxy-repo branches. The contract here is the load-bearing
artefact; once it is agreed (this status reply being the proxy half
of that agreement, plus any frontend-side flag-back on the *Adjacent*
section above), Phase 1 can begin as a proxy-repo branch with its
own PR. The umbrella's pointer bump is a separate subsequent PR.

## Reply

Counter-replies on the same dispatch-ledger filename (this file).
"Contract accepted as proposed" lets the proxy-side implementation
arc open. The two places this status reply makes substantive calls
the frontend may want to confirm or push back on:

- The `adaptive_reevaluate` metadata schema (`worst_quantile`,
  `extra_visits`) — adequate for the SPA's needs, or are there
  other parameters Go players actually tune that should ride in
  Phase 1?
- The per-query opt-out's state-semantics read — that the SPA
  never issues an opted-out query whose results would have been
  useful adaptation context for an adjacent opted-in query on the
  same session. If the SPA's query-issuance patterns differ from
  this read, flag before implementation opens.

Any other contract-level revision — alternative wire shape,
alternative `model` field name, alternative routing-table sourcing,
anything that doesn't fit the SPA's intuitions cleanly — also
pauses the arc and revises. The cheap moment to revise is now; the
dispatch's request to surface anything-not-fitting before either
side commits applies symmetrically.

— end status —
