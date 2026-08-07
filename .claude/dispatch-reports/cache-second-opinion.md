# Second opinion — KataProxy cache diagnosis (adjudication of cache-investigation.md)

- **Role:** second-opinion adjudicator under ADR-0014, commissioned by the maintainer.
- **Posture:** read-only. No proxy file modified, no restart, no reconfiguration. Passive
  observation only: the running proxy's log (`~/w/vdc/proxy.log`) and the prior report's
  own evidence assets. No new engine queries were driven; the SPA was not re-opened
  (re-witnessing was possible from the log + assets alone, so no UI state was touched).

## Reading attestation

Read end to end, before forming any judgment:

1. `proxy/ARCHITECTURE.md` (in full)
2. `proxy/README.md` (in full)
3. `docs/onboarding/proxy.md` (in full)
4. `docs/archive/notes/proxy-selector-and-capability-negotiation.md` (in full)
5. `docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md` (in full, incl. addendum)
6. Law: ADR-0000, ADR-0012 (all 1309 lines, two reads to cover the truncated first page),
   ADR-0013 — each in full, from `/home/bork/w/vdc/1/autoharn/law/adr/`.
7. The diagnosis under review: `.claude/dispatch-reports/cache-investigation.md` (in full)
   plus its assets (`run1-frames-trimmed.json`, `run2-frames-trimmed.json`; PNGs listed).
8. Because the proxy CLAUDE.md makes FRAMEWORK.md mandatory for any Layer-2/cache work,
   and the near-miss letter names `pubsub_hub.py:subscribe` / `_compute_cache_key` as the
   spine: `proxy/FRAMEWORK.md` (in full), `proxy/CLAUDE.md` (in full, supplied in context),
   `proxy/pubsub_hub.py` (in full), `proxy_server.py::_send_loop/_deliver_upstream/_send_response`
   and the ProxyServer construction site, `sproxy_config.py:141`, `proxy/.env.example`
   cache section, the Monitor/throttle implementation in `reactive_pipeline/core.py`
   (targeted read), `transformers/analysis_enricher.py` (targeted read),
   `docs/handoff-current.md` (qEUBO + proxy sections).

New evidence gathered (passive): per-message `forward` event cadence for both runs from
the proxy log; the full field set of both sent queries from the report's own trimmed
frame captures; the ERROR/disconnect tail of the replay window.

---

## Per-claim verdicts

### (a) "The replay cache is alive — a genuine cache_hit with matched cache_key" — **CONFIRMED**

WITNESSED (log): run 1 `subscribe` 15:14:41.641 → `cached 497 responses for
cache_key=fc41d694…` → `complete (16288ms)`; run 2 `cache_hit` 15:14:59.292 with the
same `cache_key` and a `replay_…` dummy canonical, followed by 213 `forward/final`
events under the replay cid. The mechanism (lookup-before-coalesce short-circuit in
`pubsub_hub.py:subscribe` step 4, `_replay_task` relabelling into the subscriber queue)
matches what was observed.

On the SELECTOR canonical-key question the maintainer posed: the repeat-query
methodology **did** exercise the key it thinks it did, though partly by luck rather
than by design:

- The cache_key is the *analysis-level* key (full opaque minus `id` and the three
  control flags — the opt-out hash of the near-miss letter's Refinement 1), **not** the
  coalescing content_hash. The two sent queries are field-identical except `id`
  (witnessed in the report's own `run*-frames-trimmed.json`: identical `model:"14"`,
  identical `capabilities:{delta_analysis:{},transposition:{}}`, identical
  `analysis_config` symbol table, identical `overrideSettings`). `model` and
  `capabilities` are inside the cache_key by full-opaque inclusion, so a repeat against
  a different SELECTOR label or capability set would correctly have missed. Here they
  matched. The key semantics did the right thing and were genuinely exercised.
- The luck: run 2's query was minted by the SPA at epoch …096125 ≈ proxy-clock
  15:14:57.0 — **before** run 1 completed (57.933). It reached `subscribe` at 59.292,
  ~1.4s after the record was committed. Had it arrived ~2s earlier, `_get_record`
  would have returned None (the record commits only in `on_complete`) and the query
  would have **coalesced** onto run 1's still-in-flight canonical — same content_hash —
  producing a "fast second answer" with no cache involvement at all. The prior agent's
  protocol (back-to-back repeat, no wait-for-complete gate) cannot distinguish
  coalesce-hit from cache-hit except by reading the log event, which it did. Verdict
  stands; the protocol's margin was narrow and should be named in any re-run.

### (b) "Replayed messages pay live-oriented middleware pacing (delta_analysis / adaptive_reevaluate) in `_deliver_upstream`; hence no user-perceivable benefit; this is the defect site" — **REFRAMED** (symptom real; mechanism, attribution, and site are wrong)

The observable — replay ≈ live in wall-clock for this query shape — is real and
re-witnessed. Everything the report says about *why* is refuted by its own assets plus
the log:

1. **There is no pacing.** No timing gate exists anywhere on the delivery path.
   `_replay_task` is an unthrottled drain (correctly identified); but `_deliver_upstream`
   contains no sleeps either, and `delta_analysis`'s `Monitor(cwt_throttle_ms=500)` is a
   *suppress-and-accumulate* gate (`reactive_pipeline/core.py:185-189` returns `[]` when
   throttled — it never delays a message, it skips a recomputation). A synchronous
   Transformer structurally cannot pace; it can only suppress or enrich. "The middleware
   reproduces the original wall-clock cadence" is a mechanism the codebase does not
   contain.

2. **`adaptive_reevaluate` was not engaged.** The report's own captured queries carry
   `capabilities: {delta_analysis:{}, transposition:{}}` — no `adaptive_reevaluate` key.
   It is wired behind `CapabilityGatedMiddleware` (proxy_server.py:1242) and passed
   both runs through untouched. Naming it as a pacing participant is a
   read-the-abstractions failure of exactly the kind the two near-miss letters warn
   about. (Also a vocabulary error: `delta_analysis` is a capability-gated
   **Transformer** — `analysis_enricher`, proxy_server.py:1344 — not middleware. In this
   codebase the Transformer/Middleware distinction is load-bearing.)

3. **The measured 12.5s is a truncated lower bound, not a completed replay.** The log
   shows the browser session (`127.0.0.1:57586`) disconnected at 15:15:11.698 — "no
   close frame received or sent" — i.e. the investigating agent's own script teardown
   killed the connection mid-replay. At cutoff, 213 of 249 finals had been forwarded
   (497-message record ≈ 85% delivered); the three "middleware error in
   deliver_upstream" ERRORs at 11.698–11.765 are sends on the closed socket. The
   replay never finished; extrapolated full-replay time is ~14.5s against 16.3s live.
   `run2_done.png` documents an incomplete replay presented as complete. (WITNESSED:
   log lines 11431-11437.)

4. **What actually bounds replay is Layer-1 per-message throughput, and it bounds the
   live path too.** Forward cadence from the log: run 1 (live) 249 finals over 15.9s
   ≈ 64ms/final (~31ms/message including partials); run 2 (replay) 213 finals over
   12.36s ≈ 58ms/final (~29ms/message). The two rates are nearly identical because
   both paths run every message through the same synchronous per-message work on one
   event loop: wire parse → `translate_upstream` with the engaged enrichment
   transformers (`analysis_enricher` evaluating the query's ~20 user-supplied
   `analysis_config` expressions per response via `RegistryInterpreter`; transposition
   enrichment) → re-serialization → send. Replay removes the GPU from the loop and
   immediately hits the delivery-path CPU ceiling, which for this 249-turn / 300-visit
   workload sits at ≈ the engine's own emission rate — hence "no perceivable win."
   (Rates WITNESSED from the log; the attribution to transformer + serialization cost
   is INFERRED — profiling would need an instrumented run, out of scope read-only. One
   named suspect is UNEXERCISED: see en-route finding 2.)

5. **Replay through Layer 1 is the contract, not the bug.** FRAMEWORK.md §3 is
   explicit: the cache stores raw backend responses and injects them *below* the
   Transformer layer precisely so `on_response` runs on cached data "exactly as if it
   were coming from a live GPU" — that is what makes online transformer tuning and the
   qEUBO loop work, and `_replay_task`'s docstring restates it. A replay/live branch in
   `_deliver_upstream` that skips the transformers (the report's implied fix direction)
   would break the cache's documented purpose. Note also what the cache's documented
   benefit actually is: handoff-current.md sells it as making the qEUBO loop
   *economically* feasible — zero backend compute on a hit. Run 2 delivered that in
   full: the engine was never touched for the parent query. The report's "no meaningful
   user-perceivable benefit" silently substitutes a latency contract for the documented
   compute-economics contract. FRAMEWORK.md's word "instantly" is the one textual basis
   for a latency expectation, and it is real — but it is an aspiration this measurement
   falsifies for full-fidelity 500-message streams, not a gated promise (ADR-0016: an
   ungated promise is exactly what this is).

6. **The wire already carries the latency lever.** `replay_final_only=true` drops all
   `isDuringSearch` messages at the hub (`_replay_task`, pubsub_hub.py:392) — halving
   the stream and skipping during-search enrichment work. The SPA sent
   `replay_final_only:false`, i.e. it explicitly requested full-fidelity replay, then
   the report measured full fidelity and scored it as a proxy defect. For the SPA's
   actual replay consumer (re-render finals), `final_only` replay is likely the right
   default and is available today with a one-flag client change.

**ADR-0000 classification of the residue** (the part of (b) that survives): the class
is *"replayed and live deliveries are indistinguishable below the hub, so no layer can
implement — and no witness can observe — any replay-specific delivery property."*

- **(2a) the type:** a delivery-provenance envelope on the hub→session queue — the
  queue element becomes a discriminated union `Live(wire) | Replayed(wire)` (or an
  envelope field) instead of a bare `WireDict`. This keeps the transformer contract
  byte-identical (FRAMEWORK.md §3 preserved: the payload the transformers see is
  unchanged) while making it *representable* for Layer 1 to, e.g., batch WS writes,
  skip per-message diagnostics, or short-circuit recompute-throttled enrichment on a
  replayed stream. Today that decision is unwritable anywhere; the illegal state
  ("replay silently treated as live") is the only representable state.
- **(2b) the enforcement surface:** a replay-throughput witness in the KataGo-free
  diagnostic suite (`tests/diagnose_*` pattern, SyntheticPonderingRouter lineage):
  replay of a synthetic N-message record must complete in time bounded by a function
  of N alone, independent of the original live cadence — per ADR-0021 this observes
  the *property* (throughput scales with message count, not with recording time),
  not the symptom (one wall-clock comparison against one live run, which is all the
  prior report measured). Plus ADR-0016: if "replay is fast" is to be a promise,
  it becomes a gated one; if it is not, FRAMEWORK.md §3's "instantly" is corrected
  (ADR-0005) — either disposition is honest, the current state (aspirational prose,
  no gate, falsifying measurement) is neither.

### (c) "No env/CLI flag disables caching; PROXY_HUB_CACHE_MAX=0 = unbounded, not off" — **CONFIRMED**

WITNESSED in code: `sproxy_config.py:141` (default 1024); `proxy_server.py:1085-1090`
unconditionally constructs `LRUCacheStore(maxsize=cfg.HUB_CACHE_MAX)` and passes it to
`PubSubHub` — the `cache_store=None` disabled state that `PubSubHub` supports by type
is unreachable from configuration. `LRUCacheStore` docstring + code: maxsize ≤ 0 ⇒
unbounded plain dict. `.env.example` (v1.0.4 section) documents 0 as "disable the
bound entirely — the cache then grows without limit" and itself flags the OOM surface.

Two sharpenings the report under-states:

- The maintainer's premise "the proxy can disable caching at startup" is simply
  **false today** — there is nothing for the SPA to display because the off-state is
  unreachable. The server-side knob is a *size bound*; on/off is decided per query by
  the client's `cache`/`lookup_cache` flags (both default false in the SPA), so with
  stock SPA settings the cache layer is *inert* rather than *off*.
- `0 = unbounded` inverts the convention an operator will guess (the maintainer's own
  expectation is the witnessed instance). That is an ADR-0012 P2-flavoured trap (a
  boundary value whose meaning lives in a docstring against the reader's prior) — the
  disposition belongs with the proxy: either a distinct `PROXY_HUB_CACHE_DISABLED`
  (reaching the existing `cache_store=None` state) or a refusal of 0 with a teaching
  message. Named here; proxy changes are commissioner-present work.

### (d) "Capability negotiation advertises cache in neither register" — **CONFIRMED**

WITNESSED in the report's own capture (re-read here): `query_version` response
`capabilities: {delta_analysis, adaptive_reevaluate, transposition, selector}` — no
`cache` key; and in code, `_advertised_capabilities` (proxy_server.py:1271-1304) never
mentions the cache. Consistent with the design note's own scoping: capability metadata
schemas were deliberately deferred "each … to its own design moment," and the cache's
moment never came. The dict-shaped `capabilities` schema was chosen precisely so
additions like `cache: {"max_entries": N, "replay_final_only": true}` are monotonic —
old clients ignore it, old proxies omit it, the frontend's absent-key legacy path is
already the documented feature-detection posture (not a fail-loud violation). This is
the cheapest and most architecturally sanctioned fix on the whole list.

### (e) "SPA should show fact-only readback of its own flags, proxy state 'unknown'; latency-probe inference unreliable while (b) stands" — **CONFIRMED in disposition, REFRAMED in reasoning**

The recommended display (readback of the SPA's own `cache`/`lookup_cache` request
flags as fact; proxy behavior labelled "unknown — not advertised"; no silent
implication the flags are honored) is right and matches the C6 inferred-vs-fact rule
and ADR-0002's feature-detection register. Ship that.

But the latency probe should be rejected on stronger grounds than "unreliable while
(b) stands" — it is wrong *in principle*, not merely until a pacing fix lands:

- **ADR-0021:** a latency differential witnesses a symptom, not the property. This
  very investigation is the proof: a *working* cache produced replay ≈ live latency
  because throughput is Layer-1-bound. The probe would render "cache: probably off"
  against ground truth "on, hit, GPU bypassed." Any future change in engine load,
  model size, or query shape re-breaks the inference in either direction.
- The probe has side effects: it spends real engine compute and pollutes the LRU with
  probe entries (and a `cache:true` probe is itself the DoS-shaped write the
  .env.example warns about, in miniature).
- The honest channel is (d)'s advertisement. Once `capabilities.cache` exists, the
  tooltip renders fact; until then, "unknown" is the truthful display. A probe adds a
  third, worse register (confident inference from an unsound signal) — ADR-0002
  forbids exactly that dressed-up guess.

---

## En-route findings (not part of the adjudication; flagged per the commission)

1. **The prior report's headline measurement was self-truncated.** Its own teardown
   disconnected the WS at 15:15:11.698 with ~85% of the replay delivered; the three
   ERROR lines it never mentions are its own closed-socket sends. Its "12.5s replay"
   is a lower bound, and its full-size CDP captures were deleted ("trimmed for size"),
   so the 12.165s browser-side span is now unverifiable from surviving assets — a
   claims-carry-witnesses violation (world rule; ADR-0009 register): the retained
   assets cannot re-establish the load-bearing number. The trimmed run-1 asset also
   carries obviously batch-flushed CDP timestamps (five "first" frames sharing one
   millisecond, 15.3s after send), so browser-side timing in that report should be
   treated as unreliable throughout; the proxy log is the only sound clock in
   evidence.
2. **Suspected hot-path cost: eagerly-evaluated DEBUG f-strings.** UNEXERCISED
   (would need profiling; read-only session). `_deliver_upstream` builds
   `f"...{json.dumps(filter_dict(out_wire))}"` as the `msg=` argument of a
   `_log.debug(...)` call (proxy_server.py:876-884) — Python evaluates the argument
   before the level check, so every forwarded message pays a full JSON serialization
   *twice* even at INFO. Same shape at several pubsub_hub/replay call sites. If the
   ~29ms/message ceiling matters (it is the whole of finding (b)'s residue), this is
   the first thing to measure. ADR-0009 applies: measure before claiming.
3. **`PubSubHub.subscribe` mutates its input** (`query.opaque.pop(...)` ×3 plus the
   `capabilities` pop). The proxy CLAUDE.md's own posture is "mutation is a smell;
   identity translation produces new envelopes." The flags are consumed destructively
   from a shared object at Layer 2 — the conditional-strip hazard family the near-miss
   addendum documents. Works today; drift-prone shape.
4. **FRAMEWORK.md §3's "instantly" is unwitnessed prose now measured false** for
   full-fidelity streams (this adjudication). Whichever way the maintainer rules on
   the latency contract, ADR-0005 requires the doc and the measurement to stop
   disagreeing silently — and the FRAMEWORK.md-vs-ARCHITECTURE.md transformer-placement
   discrepancy already on record (near-miss letter §document-graph hazard) sits in the
   same file, still unfixed.
5. **A second live client** (`192.168.122.1:49280`, wd heartbeats + orchestration
   events) shared the proxy and its event loop during the measurement — mostly idle,
   but the run-1/run-2 comparison was not single-tenant. Future timing runs should
   name and quiesce co-tenants (ADR-0015, verification-substrate).
6. **Completion-signal asymmetry on the replay path**: FRAMEWORK.md §5 requires the
   replay to conclude with a completion signal; in practice completion is inferred by
   the ProxyLink's response policy from the replayed finals themselves. It worked here
   (mapping cleanup confirmed by the post-disconnect "no entry for canonical" line),
   but the contract lives in prose, and a `replay_final_only=true` replay of a record
   whose finals were never fully captured would strand the mapping silently. Untested
   corner; noting, not adjudicating.

---

## Recommendation to the maintainer (commissioner-present session, in order)

**Proxy-side, ordered:**

1. **Advertise the cache in `query_version.capabilities`** (claim (d)) — e.g.
   `cache: {"bounded": true, "max_entries": 1024}`; omit the key when a future
   disabled state is active. Smallest change, sanctioned by the existing design note,
   unblocks the SPA's honest display, and converts the maintainer's original complaint
   from "infer it" to "read it."
2. **Make the off-state reachable and the 0-semantics safe** (claim (c)) — a distinct
   env var that passes `cache_store=None` (the type already supports it), and either
   keep `0 = unbounded` with a startup WARNING or refuse it loudly. One config-site
   change plus `.env.example` prose.
3. **Rule on the replay latency contract** (claim (b) residue), then act accordingly:
   - If replay speed is a promise: land the delivery-provenance type
     (`Live | Replayed` on the hub→session queue) and the replay-throughput
     diagnostic witness (shapes specified under (b) above); measure finding 2
     (eager DEBUG serialization) first — it may be most of the win for a two-line fix
     and benefits the live path equally.
   - If it is not a promise: amend FRAMEWORK.md §3's "instantly" (ADR-0005) and
     close the issue as working-as-designed economics (GPU bypass delivered).
   Either way, flip the SPA's replay default to `replay_final_only:true` for its
   re-render consumer — the full during-search stream is only owed to transformer-
   tuning workflows, which can opt back in.
4. Fold finding 3 (destructive opaque pops) into the next Layer-2-touching arc, not
   as standalone churn (ADR-0004).

**SPA display meanwhile** (no proxy change needed): exactly claim (e)'s disposition —
promote the two toggles with honest help text, render request flags as the SPA's own
facts, render proxy cache state as *unknown (not advertised)*, and do **not** build a
latency probe (wrong in principle per ADR-0021, not merely wrong until a fix — see (e)).
Drop the report's proposed help-text framing "a cache hit does not currently arrive
faster than a live query" in favor of "a cache hit avoids engine compute; delivery
time depends on stream size" — the former encodes the refuted pacing story into UI
copy.
