# Onboarding — Proxy

You are working in `proxy/`, a git submodule containing KataProxy
— a WebSocket proxy and middleware framework for the KataGo
analysis engine. KataProxy is independently developed: its own
repository, its own release cadence, its own licensing boundary.
The umbrella `CLAUDE.md`'s principles apply, but they apply
through the lens documented in `proxy/CLAUDE.md`. This note
assumes you have already read the generic orientation
(`docs/onboarding/orientation.md`) and the umbrella `CLAUDE.md`.

## Read in this turn (mandatory)

1. `proxy/CLAUDE.md` — the proxy authoring posture (three-layer
   model — Sessions / Hub / Router; ID-namespace translation as
   the load-bearing invariant; the Transformer-vs-Middleware
   extension-surface choice; the licensing boundary; the
   submodule release arc).
2. `proxy/README.md` — the operator entry point. Names the five
   operational roles (LEAF / RELAY / SELECTOR / ECHO / REDIRECT),
   the environment-variable configuration, and the LEAF startup
   behaviour (`LeafStartupError` if KataGo cannot start —
   ADR-0002's canonical worked example for this codebase).
3. `proxy/ARCHITECTURE.md` — the extender's mental model.
   Required before any substantive change. Documents the
   ID-translation chain, orphan-canonical cleanup, the
   coalescing-transparent terminate path, and the
   Transformer-vs-Middleware decision criteria. The "Where this
   falls short" section is unusually candid about the
   abstractions that work but do not yet bear formal scrutiny
   (the `Prism` shape is approximate, the `Dispatcher` is
   unused in the live path, `reactive_pipeline/` is
   experimental).
4. `docs/dispatch/proxy-to-proxy-id-translation-near-miss.md` —
   a letter from a recent proxy-side session about a near-miss
   when reasoning about ID-rewriting at a call site
   (`_handle_terminate`'s relabel callback) rather than tracing
   through the `ReferentialField` policy that owns the
   translation (`katago/katago_proxy.py`'s
   `RESPONSE_TERMINATE_ID_FIELD`). The lesson is small but
   generalisable: in this codebase the abstractions in
   `AbstractProxy/proxy_core.py` and
   `katago/katago_proxy.py` are the load-bearing units;
   call sites in `proxy_server.py`, `pubsub_hub.py`, and
   `router.py` are recipes that compose them. Adopt the posture
   from the start — when reasoning about what a call site must
   do to preserve a boundary invariant, first check whether the
   layer that owns the invariant already does the work
   declaratively.
5. `docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md`
   — a second proxy-to-proxy letter, sibling to (4). Mandatory
   alongside `proxy/ARCHITECTURE.md` and `proxy/FRAMEWORK.md`
   whenever substantive work requires those — i.e., for any
   wire-shape extension or layer-boundary change. The two letters
   compose: (4) prescribes "read the abstractions first"; (5)
   prescribes "read them in full before claiming what falls out
   of them." The body records the original failure mode (claiming
   a wire-shape addition would "fall out of the existing machinery
   via a one-line `ReferentialField` registration" without
   consulting the policy text); the addendum records refinements
   only the code-read surfaced — the two-hashes distinction in
   `pubsub_hub.py` (`content_hash` opt-in via `capturing_fields`
   versus `cache_key` opt-out via full-opaque-minus-the-three-
   control-flags), the proxy-control field family's non-uniform
   strip mechanism (the three control flags pop in `subscribe()`,
   `analysis_config` pops in `analysis_enricher.on_query`), and
   the conditional-strip hazard that per-query capability-style
   gating surfaces around fields like `analysis_config`. Adopt
   the posture from the start — reading the abstractions in full
   before claiming what falls out of them is the *act*, not the
   posture.
6. `docs/dispatch/proxy-to-proxy-post-v1.0.13-followups.md` — a
   punch list of three loose ends from the v1.0.13 release window
   (sibling-parser sweep for the silent-coercion pattern;
   wheel-build entry-point breakage; duplicated
   `JSONEncoder.default` monkey-patch). None blocks a release;
   each is appropriate to land in any future patch arc. Worth
   surfacing at session start so a contributor with capacity can
   pick one up.
7. `docs/handoff-current.md`, "The proxy" section — the
   umbrella's condensed perspective on the submodule, including
   the typed-schema-publication trigger that becomes
   load-bearing once a second consumer appears.
8. Scan `docs/dispatch/` for open requests in the proxy's
   direction (filenames containing `to-proxy` or `proxy-to-`).
   Surface unaddressed ones at the start of the session before
   implementing.

That is the onboarding turn.

## Architectural shape (one-line reminder)

Three layers — Sessions, Hub, Router — communicating through
narrow typed interfaces; each layer speaks a different ID
namespace (`client_id → internal_id → canonical_id → wire_id`).
The load-bearing invariant: an external `id` never reaches the
engine, an engine `id` never reaches a client. The contracts
that hold the property together (`IdMapping`,
`CompletionTracker`, `ProxyLink`, `ProxyChain`,
`ReferentialField`) live in `AbstractProxy/proxy_core.py` and
`katago/katago_proxy.py`. Edits there are edits to the
spine.

## ADR map (proxy-relevant)

The umbrella's ten ADRs apply selectively. ADR-0001's mutation
policy is a frontend concern; ADR-0003's bands do not apply inside
the proxy (it sits entirely in the KataGo-coupled tier — single-band
by construction); ADR-0009 (perf investigation) and ADR-0010 (render
locality) are frontend tenets. The remaining tenets bind every edit:

- **ADR-0002** — Fail loudly. The LEAF role's `LeafStartupError`
  is the canonical worked example: missing model, missing
  config, or GPU refusal raises before the server binds, with
  KataGo's own stderr preserved in the message. Mid-stream
  invariant violations halt; transient external failures
  recover with a visible budget; budget exhaustion fails loudly
  in the response stream rather than silently in the log.
- **ADR-0004** — Minimal-touch under partial visibility. The
  abstractions are dense; full-file rewrites without full
  visibility are how silent regressions enter.
- **ADR-0005** — Documentation discipline. The dispatch ledger
  is the inter-subproject communication channel; status
  dispatches close out coordination loops.
- **ADR-0006** — Per-file headers. Python module docstrings at
  the top of each `.py` file are the header form.
- **ADR-0008** — Classification discipline. Directly proxy-relevant:
  the silent-coercion-at-protocol-boundaries family (the v1.0.13
  `action_map.get(…, ANALYZE)` query bug and the metadata-response
  field fabrication) is its fail-loudly sibling — refuse an open-set
  default over a closed wire vocabulary. ADR-0007's file-size /
  density budgets apply to the proxy's `.py` too.

## Reference material (consult on demand)

- `proxy/FRAMEWORK.md` — high-level reference for the
  Transformer-vs-Middleware vocabulary and the replay-cache
  strategy that enables online tuning of transformer
  parameters. Older than `ARCHITECTURE.md`; the two overlap
  and `ARCHITECTURE.md` supersedes when they disagree.
- `proxy/NOTICE` — the licensing boundary. Project root is
  Unlicense; `goboard_transposition/` is MIT (derived from
  KataGo, with a vendored MIT-licensed `nlohmann/json`).
  Required reading before any edit that touches the boundary.
- `proxy/AbstractProxy/proxy_core.py` — the spine: `IdMapping`,
  `CompletionTracker`, `ProxyLink`, `ProxyChain`, `Prism`,
  `Dispatcher`. Prisms are *modelled* on the optics paradigm;
  they do not enforce the laws.
- `proxy/AbstractProxy/protocol_transformer.py` — the Generic
  `Transformer` ABC + `TransformedChain`. Stays protocol-agnostic
  alongside `proxy_core.py`.
- `proxy/katago/katago_proxy.py` — KataGo-specific protocol
  types, prisms, parsers, the response variant union
  (`AnalyzeResponse | MetadataResponse`), and the
  `RESPONSE_TERMINATE_ID_FIELD` registration that the
  near-miss letter centres on. Lives outside `AbstractProxy/`
  because it is KataGo-specific (post-v1.0.13 reorg).
- `proxy/transformers/` — Layer 1 transformer extensions:
  `katago.py` (response post-processing factories),
  `analysis_enricher.py`, `transposition_enricher.py`.
- `proxy/middleware/` — Layer 1 middleware: `session_middleware.py`
  (the `SessionMiddleware` ABC, `MiddlewareChain`,
  `SessionCapabilities`), `keep_alive.py`,
  `adaptive_reevaluate.py`. The directory is the layer signal.
- `proxy/middleware/keep_alive.py` — worked example for
  `SessionMiddleware` lifecycle hooks (`on_session_start` /
  `on_session_end`) and the `SessionCapabilities` bundle
  (including `terminate_query`). The keep-alive watchdog
  catches the WS-stays-open-but-silent case that
  disconnect-side cleanup cannot.
- `proxy/docs/roadmap-response-variants.md` — the v1.0.13
  response-variants design rationale; durable record of the
  impedance-mismatch diagnosis and the consumer migration
  table for the `KataGoResponse` union split.
- `proxy/tests/diagnose_phase{1,2,3}.py` — KataGo-free
  diagnostic suite (one file per phase of the keep-alive
  dispatch). Run with `python -m tests.diagnose_phase1` from
  the proxy directory; exit 0 on PASS. Reuses the
  `SyntheticPonderingRouter` (v1.0.9) so no GPU or KataGo
  binary is required.
- `docs/archive/dispatch/frontend-to-proxy-keep-alive-middleware.md`
  and
  `docs/archive/dispatch/proxy-to-frontend-keep-alive-middleware-status.md`
  — the recent multi-phase coordination loop (Phases 1-3 plus
  diagnostics, shipping in proxy v1.0.7-v1.0.11).

## Skip during onboarding

- Anything umbrella-internal beyond what
  `docs/handoff-current.md`'s "The proxy" section covers.
- The frontend's and backend's internals beyond the KataGo
  wire vocabulary (`frontend/src/engine/katago/types.ts` is
  the only consumer-side file the proxy ever needs to
  consider).
- `proxy/reactive_pipeline/` — an experimental reactive-pipeline
  subpackage, used only by `delta_analysis.py`; not integrated
  with the main message flow.
- `proxy/AbstractProxy/proxy_core.py`'s `Dispatcher` —
  scaffolding for a future world of multiple protocol
  versions; unused in the live code path.
- `docs/archive/`, `docs/playbooks/monorepo/`, `docs/rfcs/`,
  `docs/notes/auditor-notes.md`, `audit-reflections.md`,
  `decisions-deferred.md`,
  `docs/notes/design/doc-graph-discipline-plan.md`,
  `docs/notes/vestige/deferred-items/` (the dissolved ledger).

## Output discipline

For substantive proxy changes, structure the response as:
roadmap (naming the architectural location: Layer 1 / 2 / 3 or
the `AbstractProxy/` core) → invariants (the ID-namespace
contracts, the optic-shaped laws, the licensing boundary, or
the fail-loud guarantees the change preserves or modifies) →
pure units (Transformers, Prisms, dataclasses, pure helpers in
`AbstractProxy/`) → effectful units (Middleware, router state
machines, the subprocess/WebSocket adapters in `router.py` and
`proxy_server.py`) → wiring (`transformer_factory` /
`middleware_factory` composition at the `ProxyServer(...)`
construction site). For trivial fixes, skip the structure and
make the change.

`pytest` from the proxy directory runs the test suite. The
KataGo-free diagnostic suite
(`tests/diagnose_phase{1,2,3}.py`) is the load-bearing
verification for the proxy-side keep-alive contracts;
SPA-driven testing is secondary because the SPA's
HMR-orphaned WebSocket path can mask disconnect-side bugs (see
the verification-instructions section of the proxy → frontend
status dispatch).

## Cross-team

The proxy's release cadence is independent of the umbrella's.
Proxy-side changes follow their own arc: branch in the proxy
repo, PR there, tag cut, then a separate umbrella-side PR
bumps the submodule pointer. Do not conflate the two — an
umbrella PR that mixes a proxy bump with umbrella-side changes
obscures the proxy diff and complicates review.

When a frontend or backend dispatch requests a wire-shape
change (a new control flag, a new response field), that is a
coordination decision through the umbrella's dispatch protocol
— and it is also a request to extend the KataGo protocol or
add a proxy-side transformation, which has its own design
constraints (compatibility with vanilla KataGo clients, the
Unlicense boundary, the second-consumer trigger for
typed-schema publication). Do not unilaterally widen the wire
to satisfy a consumer.
