# Proxy → Proxy: Letter to the next session — on the selector dispatch and the strip-before-hash discipline

- **Date:** 2026-05-09
- **From:** proxy (outgoing session, Claude Opus 4.7)
- **To:** proxy (incoming session — likely the one that picks up
  `frontend-to-proxy-selector-and-capabilities.md`)
- **Type:** letter — cautionary; counterfactual conclusions reached
  during the orientation read of the selector/capabilities dispatch,
  documented so the next session does not have to reach them the same
  way
- **Status:** filed for the next proxy-side session's pre-work read.
  No action required of the user beyond merging.
- **Suggested filing:** `docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md`
  per ADR-0005's dispatch ledger convention. Second entry in the
  proxy↔proxy direction (the first is
  `proxy-to-proxy-id-translation-near-miss.md`, 2026-05-03; the
  posture this letter inherits is the one that letter prescribes).

## Why this exists

`proxy-to-proxy-id-translation-near-miss.md` named the right posture —
read the abstractions first, trust the declarative translation core,
do not reason about call sites in isolation — and warned the next
session to "adopt the posture from the start ... when you propose
something that contradicts the architecture's stated guarantees, the
right next move is to re-read the abstractions, not to defend the
proposal."

This session adopted that posture and still reached a too-easy
conclusion on first pass through the selector dispatch. The posture is
necessary but not sufficient. This letter records the counterfactual
so the next session does not have to repeat the loop. The lesson
generalises beyond the selector arc.

## What happened

After reading `proxy-to-proxy-id-translation-near-miss.md` but before
reading `proxy/ARCHITECTURE.md` and `proxy/FRAMEWORK.md` end to end,
this session summarised dispatch open question 6 (canonical-key
derivation in `pubsub_hub.py` for the new `model` and `capabilities`
fields) like this:

> The right question is: are these fields registered on
> `make_katago_query_policy` (and the response analog) such that
> `translate_referentials` and the canonical-key derivation pick them
> up automatically? ... a one-place declaration, not a per-call-site
> fix.

That is wrong in a load-bearing way. The user pushed back with the
principle: ARCHITECTURE.md and FRAMEWORK.md are mandatory before
substantive work; the near-miss letter's "trust the abstractions"
posture does not dispense with the read.

Going back and reading both end to end, FRAMEWORK.md §3 step 1 says,
unambiguously, of the existing proxy-control flag family
(`cache`/`lookup_cache`/`replay_final_only`/`analysis_config`):

> Layer 1 identifies the `cached` flag, notes it, and **strips it from
> the payload so it doesn't affect the `content_hash`**.

That is the existing discipline for proxy-control fields:
*strip-before-hash*, so that two requests differing only in their
control flags coalesce onto the same canonical. `cached: true` and
`cached: false` are the same query for coalescing purposes; the cache
hit is just a fast path through the same content.

`model` and `capabilities` cut directly against that discipline.
Both *must* affect the content hash, because:

- `model: "strong"` and `model: "weak"` are genuinely different
  queries — SELECTOR routes them to different upstreams, and the
  answers differ.
- `capabilities: { transposition: {} }` and `capabilities: {}`
  produce different response artefacts — different transformer
  chains run; the dispatch's "Replay cache implications" section
  acknowledges this is the right behaviour.

So the change is not "register a `ReferentialField` and the existing
machinery handles it." The change is in Layer 2's `CoalescingPolicy`
itself: the proxy-control field family bifurcates for the first time
into *strip-before-hash* (the existing four) and *retain-in-hash*
(the new two). That bifurcation is a real architectural decision the
dispatch's question 6 is correctly flagging, not a question whose
answer is "yes, the abstraction handles it."

## The lesson

The id-translation near-miss letter said: when you catch yourself
reasoning about a call site, ask whether the abstraction at the layer
boundary already does the work declaratively. That is correct, and it
is what saved the previous session.

This near-miss is the dual: when you catch yourself answering "the
abstraction handles it" without having read the abstraction's actual
policy text, you have substituted the *posture* of trusting the
architecture for the *act* of consulting it. The near-miss letter's
trace procedure — find the file that owns the type, list the relevant
declarations, confirm the field is in the policy — applies here too.
The check would have surfaced strip-before-hash as the existing
pattern, and "this addition departs from that pattern" as the
substantive content of the question.

The two letters compose: read the abstractions first, **and** read
them in full before claiming what falls out of them. Skipping either
half produces the same failure mode in different registers — the first
is over-eager call-site debugging, the second is over-eager
abstraction-trust.

## Before claiming a wire-shape addition "falls out of the existing machinery"

Concrete trace, mirroring the procedure in
`proxy-to-proxy-id-translation-near-miss.md`:

1. Read `proxy/ARCHITECTURE.md` and `proxy/FRAMEWORK.md` end to end.
   FRAMEWORK.md is older and the proxy CLAUDE.md says ARCHITECTURE.md
   supersedes when they disagree, but FRAMEWORK.md still carries
   information ARCHITECTURE.md does not — §3 (Caching Strategy for
   Online Parameter Tuning) is the only place the strip-before-hash
   discipline for the proxy-control field family is named explicitly.
2. Find the `CoalescingPolicy` implementation in `pubsub_hub.py` and
   read what fields it includes in the hash input. Confirm whether
   the new field would be included by default, stripped by default,
   or requires an explicit decision.
3. Find the query parser in `katago/katago_proxy.py` and confirm what
   it does with unknown top-level fields — does it preserve them in
   `opaque`, drop them, or raise? The dispatch's "Transformer
   pass-through" sub-note assumes preservation; verify rather than
   assume.
4. Only then state what falls out of the existing machinery and what
   does not.

If you skip steps 1-3 and reach step 4 by induction from "the
abstractions usually handle it," you have made the same substitution
this session made on first pass.

## A document-graph hazard worth flagging

`FRAMEWORK.md` §1 (Layer 1) says Transformers "operate on data that
has already been 'relabeled' into the client's namespace."
`ARCHITECTURE.md`'s coalescing-transparent-terminate section
(post-v1.0.13) describes the live flow as: synthesised ack carries
internal-namespace ids → standard `_deliver_upstream` pipeline runs
the response policy's `translate_referentials` to client namespace
→ WS write. The two sketches do not obviously agree on where
transformers sit relative to translation. `proxy/CLAUDE.md` says
ARCHITECTURE.md supersedes when they disagree; the practical effect
is that for selector work specifically, trust the post-v1.0.13
ARCHITECTURE.md flow and treat FRAMEWORK.md §1 as the older sketch.
A future arc that aligns the two documents would be a small but
useful contribution; not in scope for the selector dispatch.

## An adjacent observation worth surfacing

Not a counterfactual revision — an observation the architecture-doc
read prompted that the dispatch does not name explicitly.

Per-query `capabilities` opt-in fits Transformers cleanly: they are
stateless per message, so "is this capability requested on this
query?" is a per-message check that gates the transformer's body.
`transposition_enricher` and the gating envisioned by the dispatch
work this way naturally.

It fits Middleware less cleanly. `adaptive_reevaluate` is per-session,
stateful, async. The dispatch envisions the SPA omitting it on
review-session queries and including it on range-based analysis
queries on the *same* connection. The middleware therefore needs to
inspect each incoming query's `capabilities` and decide whether to
participate in *that* query's response stream while preserving its
session-scoped state. Doable, but it introduces a new dimension of
per-query routing inside what was previously a uniformly-engaged
middleware chain. Whether the right shape is a per-query bypass at
the `MiddlewareChain` level, or capability-awareness inside each
middleware that needs it, is a Layer 1 design call worth surfacing
in the status reply.

## A note on the corrective

The user asked, before this session committed substantive proxy work,
whether the architecture documents had been read in full. They had
not. That single check is what made the architecture-doc read happen
and what surfaced the strip-before-hash discipline. The next session
should not need that check. ARCHITECTURE.md and FRAMEWORK.md are
mandatory for any work involving the layer boundaries — which any
wire-shape extension is, by construction. The proxy onboarding note
flags ARCHITECTURE.md as mandatory; FRAMEWORK.md is filed under
reference there but should be promoted to mandatory whenever the
work touches Layer 2's `CoalescingPolicy` or the proxy-control field
family. Both of those are in scope for the selector dispatch.

— a recent proxy-side session, 2026-05-09
