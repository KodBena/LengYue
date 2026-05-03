# Proxy → Proxy: Letter to the next session — on id translation and the value of the abstractions

- **Date:** 2026-05-03
- **From:** proxy (outgoing session, Claude Opus 4.7)
- **To:** proxy (incoming session)
- **Type:** letter — cautionary; a lesson learned during Phase 1 of the
  v1.0.7 work on the frontend's keep-alive dispatch
- **Status:** filed for the next proxy-side session's pre-work read.
  No action required of the user beyond merging.
- **Suggested filing:** `docs/dispatch/proxy-to-proxy-id-translation-near-miss.md`
  per ADR-0005's dispatch ledger convention. First entry in the
  proxy↔proxy direction.

## Why this exists

A turn of dialogue caught a near-miss this session, and the next session
deserves to see the lesson without that turn. The user has signalled
they will write a `proxy.md` onboarding memo to sit alongside
`orientation.md`; this letter is content the memo can reference, not a
substitute for it. The lesson is small but the reason it took a turn to
land is generalisable, and the generalisation is what's worth filing.

## What happened

I was sketching the synthesized terminate-ack the proxy will need in
Phase 2 of `frontend-to-proxy-keep-alive-middleware.md` — the path
where a client explicitly terminates a query that's coalesced with
another subscriber, and the LEAF must NOT be terminated. Looking at the
existing relabel callback in `proxy_server.py:_handle_terminate`, I saw:

```python
relabelled["id"] = terminate_internal_id
if relabelled.get("terminateId") == canonical_id:
    relabelled["terminateId"] = target_internal_id
```

— and reasoned: both right-hand sides are *internal* ids. The upstream
pipeline (so I thought) translates only `id`. So `terminateId` would
reach the client carrying an internal-namespace value — a leak across
the boundary the architecture exists to defend.

I flagged it as a suspected bug. The user pushed back with the
principle: id translation should be done **once and for all and
correctly**, then left as an exemplar so nobody has to do it ever again.
If `terminateId` were genuinely leaking, the abstraction had failed —
and the abstraction was specifically designed not to.

I went back and traced the response policy properly. The translation
was right where it should have been, in plain sight at
`AbstractProxy/katago_proxy.py:117`:

```python
RESPONSE_TERMINATE_ID_FIELD: ReferentialField[KataGoResponse, str] = ReferentialField(
    name="terminateId",
    get=lambda r: r.opaque.get("terminateId"),
    set=_response_with_terminate_id,
)
```

— registered on `make_katago_response_policy` (line 184), consumed by
`ProxyLink.translate_upstream` via `translate_referentials`
(`proxy_core.py:449`). `translate_referentials` translates **every**
field the policy declares, not just `id`. The relabel callback's job is
to write `terminateId` in the *internal* namespace; the standard
upstream pipeline then translates it to the *client* namespace before
serialization. No leak. The architecture works exactly as advertised.

## The lesson

The relabel callback in `_handle_terminate` looks like it's doing the
id-rewriting work itself. It is not. It is preparing the input that the
abstraction translates. The abstraction lives elsewhere — declaratively,
as a `ReferentialField` registered on a policy — and that one
declaration is what makes every subsequent code path automatically
correct.

If you read a callback in isolation and ask "does this rewrite enough
fields to keep the namespace boundary intact?", you are asking the wrong
question. The callback is the **preparation** step; the policy is the
**translation** step; the policy decides what fields cross the boundary,
not the callback. Adding a translated field is a one-line declaration,
not a per-call-site rewrite. That is the whole point of the abstraction.

## Before flagging an id-leak suspicion

Before claiming an id leaks across a namespace boundary, do this trace:

1. Find the file that owns the protocol type
   (here, `AbstractProxy/katago_proxy.py`).
2. List every `ReferentialField` declared there
   (`grep 'ReferentialField(' AbstractProxy/`).
3. Note which fields are registered on which policy
   (`make_katago_query_policy` for the downstream direction,
   `make_katago_response_policy` for the upstream direction).
4. Confirm whether the field you're worried about is among the
   policy's declared referential fields.

If it is, the abstraction translates it. If you've written the relabel
callback that prepares the input, you do not need to translate it again.
If, after this trace, the field is genuinely unregistered — *that* is
when you've found something worth surfacing.

## The wider posture

The proxy is a small codebase that is unusually committed to its
abstractions: Prisms shaped (approximately) on optics, layered ID
namespaces with a once-and-for-all translation core, the
Transformer-vs.-Middleware choice as a load-bearing surface decision.
Reading it cold, the temptation is to verify each line of behavior
locally. Resist the temptation. The abstractions in
`AbstractProxy/proxy_core.py` and `AbstractProxy/katago_proxy.py` are
the load-bearing units; the call sites in `proxy_server.py`,
`pubsub_hub.py`, and `router.py` are recipes that compose them. If you
catch yourself reasoning about what a call site does, stop and ask
whether you are reasoning about the wrong layer.

`ARCHITECTURE.md` is short for a reason. The work is in the
abstractions, not in their consumers. Read the abstractions first, and
the call sites will read like assembly of known parts.

## A note on the corrective

The user invoked the principle ("done once and for all and correctly,
left as an exemplar") and that single invocation was what made me
re-read. That kind of pushback is the safety net, and it works — but
the next session should not need it. Adopt the posture from the start.
When you propose something that contradicts the architecture's stated
guarantees, the right next move is to re-read the abstractions, not to
defend the proposal. The pushback is there for when you forget; do not
plan to lean on it.

— a recent proxy-side session, 2026-05-03
