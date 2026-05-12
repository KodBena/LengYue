# Postmortem — Adaptive Re-Evaluate Deeper-Packet Enrichment

- **Date filed:** 2026-05-12
- **Status:** Bug confirmed by user observation; root cause hypothesised
  from proxy code-read and SPA wire probe; fix not yet shipped.
- **Audience:** Author + LLM collaborators. The focus is operational
  efficiency in cross-boundary bug discovery, not blame.
- **Scope:** The investigation that began with the user's report
  "palette `x['rootInfo']['visits']` state-fn doesn't update after
  adaptive re-evaluation deepens a turn, but the move-suggestion
  overlay does."

---

## TL;DR

The user-visible bug is real and lives on the **proxy side**: a deeper
sub-query spawned by `adaptive_reevaluate` arrives at the SPA with
`extra` undefined entirely (the `analysis_enricher` transformer never
runs on it), so the SPA's correct `mergeKataExtra` policy preserves
the original packet's stale `extra.state` while updating
`moveInfos` / `rootInfo.visits` from the deeper packet. The
asymmetry the user observed is the merge contract behaving exactly as
designed against a half-enriched response stream.

The investigation took longer than it should have. The dominant cost
was operating with **no view into proxy runtime behaviour** —
specifically: no log access across the host boundary, no documented
wire schema for `analysis_config`, and no proxy-side diagnostic
channel surfaced on the wire. I burned cycles reverse-engineering an
`analysis_config` shape that's already authoritative in
`proxy/registry_interpreter.py`, and I drew an incorrect
generalisation (the "bug 1" / "adaptive never fires" reading) from a
probe-specific corner case that doesn't reproduce in normal SPA
operation. The user corrected the misreading; the rest of the
diagnosis stands.

Concrete recommendations are in §5. The most consequential is **a
shared cross-team wire schema reference** under the umbrella
`docs/` tree, paired with a CLAUDE.md amendment that names "ask for
log access when investigating cross-boundary bugs" as a
load-bearing posture, in the same shape ADR-0002 names fail-loudly.

---

## 1. The bug, factually

### 1.1 What the SPA observes

When `adaptive_reevaluate` deepens turn N (the deeper sub-query runs
at `original_maxVisits + extra_visits`), the SPA receives:

- The original packet for turn N, arriving as an
  `is_during_search=True` preview from the proxy's v1.0.20 streaming
  refactor. This packet has populated `extra.state[turnN]`,
  `extra.<color>.deltas`, etc.
- The deeper sub-query's response for turn N, arriving as
  `is_during_search=False`. This packet has updated `moveInfos[]`
  and `rootInfo.visits ≈ original + extra`, **but no `extra` field
  at all** — the `analysis_enricher` transformer skipped it.

### 1.2 How the SPA's merge handles this

`mergeAnalysisPacket` at `frontend/src/services/analysis-ledger.ts:114-120`:

```typescript
export function mergeAnalysisPacket(existing, incoming): KataAnalysisResponse {
  if (!existing) return incoming;
  const existingVisits = existing.rootInfo?.visits ?? 0;
  const incomingVisits = incoming.rootInfo?.visits ?? 0;
  if (incomingVisits < existingVisits) return existing;
  return { ...incoming, extra: mergeKataExtra(existing.extra, incoming.extra) };
}
```

For the deeper packet: `incomingVisits > existingVisits` → top-level
fields replaced from incoming (so `moveInfos`, `rootInfo` update
correctly). For `extra`, the call is
`mergeKataExtra(existing.extra, undefined)`. That function at line
101-112 short-circuits on `if (!incoming) return existing;` and
returns the original `extra` unchanged.

Result: `moveInfos[].visits` shows the deeper count (user sees this
in the move-suggestion overlay). `rootInfo.visits` shows the deeper
count too (the user doesn't see this directly). But
`extra.state[turnN]["num_visits"]` — which the proxy populated only
from the original packet at the original `rootInfo.visits` — keeps
its stale value, because the deeper packet didn't carry a fresh
`extra.state` to override it.

### 1.3 Why the deeper packet has no `extra`

`proxy/transformers/analysis_enricher.py:64-114`. The transformer
pops `analysis_config` from the parent query's `opaque` during
`on_query`, then constructs a `DeltaAnalysisState` and caches it in
`request_cache[eid]`. When `adaptive_reevaluate` later spawns a
deeper sub-query via the orchestration framework, the sub-query
inherits a *copy* of the parent's `opaque` (per
`proxy/middleware/adaptive_reevaluate.py:153-181`'s
`_build_deeper_query`) — but `analysis_config` is no longer in that
opaque (the pop already happened on the parent). The sub-query
flows through `analysis_enricher.on_query` again under its own
synthetic `eid`, the gate at line 67-71 fails (`config` is `None`),
no analyzer is created for the sub-query's `eid`, and on the
response side `request_cache.get(eid)` returns `None` → no
enrichment.

This is the contract gap. The SPA's merge is doing the right thing
under the wire; the proxy is emitting a half-enriched stream.

### 1.4 What was *not* the bug

I initially reported "adaptive never fires reliably" based on a
probe that used `maxVisits=150` and got identical visit counts on
KataGo's during-search and final packets, triggering the
analysis_enricher's `_are_equal` short-circuit in
`proxy/reactive_pipeline/core.py:108-130`. The user's testing
confirms adaptive *does* fire consistently in normal SPA operation
— my probe was a corner case. The de-duplication observation is
real (final packets in my probe have empty `extra.<color>.deltas`),
but it's not the bug the user reported. I retracted that thread
once the user corrected me.

---

## 2. Investigation timeline

Times approximate, intentionally annotated with where the
collaborator (me) lost ground.

| Step | Cost | Notes |
|---|---|---|
| Read SPA analysis pipeline (analysis-ledger, analysis-service, capability-injection, types) | reasonable | This was the right first move. |
| Hypothesise merge-vs-replace asymmetry from `mergeAnalysisPacket`'s logic | reasonable | Correct hypothesis; correct file. |
| Build a Node WebSocket probe against `ws://192.168.122.1:1235` | reasonable | Decision to test headlessly was correct; existing `tests/e2e/` precedent uses Node 24 native WebSocket. |
| **Probe sends valid `capabilities` but `extra.state = {}`. Spend time guessing why.** | **high** | I tried multiple shapes — symbol-name-as-body, label-as-body — without knowing the actual contract. |
| Search proxy submodule for `state_fns` handling | partial recovery | This is what I should have done first. The contract is `bindings.state_fns: { label: symbol_name }`, `symbols: { symbol_name: body }`. |
| Find `proxy/registry_interpreter.py:599-610` (`get_state_fns`) and confirm shape | resolved | The contract is unambiguous in code but isn't named in any user-facing doc. |
| Observe `extra.state = {}` on finals despite valid config | **high (red herring)** | Spent time on the `_are_equal` de-dup hypothesis, which is structurally real but didn't repro under normal SPA visits. |
| Try `worst_quantile=0.95` to force adaptive | **high (wasted)** | Still no deeper packets. I concluded adaptive doesn't fire generally. The user corrected this. |
| Pivot to the correct hypothesis after user pushback: deeper packets DO arrive but with no `extra` | resolved | This is the actual bug. |

Total elapsed (rough): more than half of the investigation budget
went to either (a) re-deriving wire schemas already documented
inside the proxy or (b) chasing a probe artefact as if it were the
user's bug.

---

## 3. The operational inefficiencies

The user named three explicitly; I'll expand each and add what the
investigation surfaced.

### 3.1 `analysis_config` is undocumented at the wire level

The shape — `{bindings: {delta_fn, state_fns: {label: symbol},
summary_fn}, parameters, symbols: {name: body}}` — lives
authoritatively in `proxy/registry_interpreter.py:519-610` and
incidentally in `frontend/src/services/analysis-config.ts:72-81`
(SPA producer) and `frontend/src/store/defaults.ts:111-186` (default
palette example). No single document names the contract.

Consequence: any collaborator who needs to construct an
`analysis_config` from outside the SPA — for a test harness, a
diagnostic probe, a backend pipeline replay, a future Chess port —
must either read three files spanning two sub-projects or reverse-
engineer from log output (which I didn't have access to, see §3.2).

This was the single biggest time-sink in the investigation.

### 3.2 Proxy logs were not accessible

The proxy at `ws://192.168.122.1:1235` runs on a different host
(libvirt VM at 192.168.122.x). I had no path to its stderr or
logfile. With v1.0.20's structured-logging arc (the institutional
release), the proxy now emits closed-vocabulary `Event` records
through one of three formatters (console / logfmt / JSON) under
`PROXY_LOG_FORMAT` — *operationally* this is the moment when log
capture-and-tail across a host boundary stops being an art project
and starts being a primitive operations channel. But neither the
operator-runtime view in `proxy/docs/logging.md` nor the umbrella
`CLAUDE.md`'s proxy section is currently set up for a collaborator
to ask "please tail the structured log to a file I can read" as a
standard step.

What I would have seen in proxy logs, had I had them:

- `analysis_config setup for eid=...` at `analysis_enricher.py:74`
  per parent query.
- For the deeper sub-query's `eid`: absence of a setup log line,
  because the gate fell through.
- `adaptive: orig_id=... deepening turns=...` from
  `adaptive_reevaluate.py:275-283` confirming the spawn fired.

Those three signals together would have told me, in under a
minute, that the deeper sub-query was being spawned but
analysis_enricher wasn't engaging on it. Instead I had to read the
orchestration plumbing end-to-end to infer the same conclusion.

### 3.3 I didn't ask for log access mid-investigation

This is the meta-failure. By the time I was reading
`adaptive_reevaluate.py`'s `_find_worst_turns` and trying to guess
why my probe didn't trigger deepening, I should have stopped and
said: "this is a cross-boundary investigation; I'm operating blind
to proxy runtime; please attach the proxy's stderr to a file I can
read, or set `PROXY_LOG_FORMAT=logfmt PROXY_LOG_LEVEL=DEBUG` and
share." I didn't, partly out of momentum and partly because the
umbrella `CLAUDE.md`'s "asking before assuming" section is framed
around *code* visibility (file contents, related-module
interfaces, dispatch status) rather than *runtime* visibility (log
streams, in-flight queries, process state).

### 3.4 No proxy-side diagnostic channel on the wire

Adjacent to §3.2 but worth surfacing separately. A proxy that
attaches its enrichment decision to each response —
`extra._diagnostic: {enricher_applied: bool, reason: "no
analysis_config", chain_eid: "..."}` — would have made the bug
*visible to wire-only consumers* without any log access. ADR-0002
applied to cross-boundary debugging: surface the decision in-band
when the consumer can't reach the log channel. This isn't a
standard pattern in the codebase today; it would be one.

### 3.5 My probe corner-case was epistemically louder than the user's real-world signal

I let "my probe shows X" override "the user reports Y where X
contradicts Y." The user reports adaptive deepening DOES fire in
their setup. My probe didn't repro that. The right move was to
trust the user's signal over my probe's, name the divergence
audibly, and ask the user to walk me through their exact repro
setup before drawing conclusions about whether adaptive fires "in
general." Instead I generalised the corner-case ("bug 1: adaptive
never fires") into a finding I had to retract. This is the
documentation-discipline analog of ADR-0002 applied to evidence:
when a user-visible signal disagrees with a synthetic probe,
trust the user-visible one and investigate the probe's
under-specification, not the other way round.

---

## 4. Root cause of the actual bug (proxy-side)

Stated tightly:

> A deeper sub-query spawned by `adaptive_reevaluate` does not
> receive the `analysis_enricher` transformer treatment, because
> `analysis_enricher.on_query` pops `analysis_config` from the
> parent's opaque at `analysis_enricher.py:64`, and
> `_build_deeper_query` at `adaptive_reevaluate.py:153-181` clones
> the (already-stripped) opaque for the sub-query. The sub-query
> reaches `analysis_enricher.on_query` with no `analysis_config`,
> the gate at line 67-71 fails, no analyzer is cached for the
> sub-query's eid, and on the response side the deeper packet
> bypasses enrichment. The SPA receives the deeper response with
> `extra` undefined.

The fix surface is in the proxy. Three viable shapes:

- **A. Read-not-pop in `analysis_enricher.on_query`.** The pop was
  introduced as a defence against `analysis_config` reaching
  KataGo. The central wire-strip in
  `proxy/katago/katago_proxy.py:341-356` (`_PROXY_ONLY_FIELDS`)
  already enforces that protection. Switching the pop to a read
  would leave `analysis_config` in opaque for sub-queries to
  inherit, and each sub-query would get its own analyzer in
  `request_cache`. Smallest change. Question: do sub-query
  analyzers correctly handle the narrow `analyze_turns` they
  receive (only the deepened turns, not the full original range)?
  Answer requires reading `DeltaAnalysisState`'s `n_moves`
  handling more carefully — likely fine for state_fns
  (unwindowed) but may produce sparse deltas (windowed needs
  adjacent turns).

- **B. Share the parent's analyzer with sub-queries.** Key
  `request_cache` by the orig-id or by a `parent_eid` link from
  the orchestration framework, so a sub-query reuses the parent's
  analyzer state. Larger semantic change; the analyzer's
  per-slot in_mem would receive updates from both parent and
  sub-query at the same turn slot. Has the merit that delta_fn's
  window dependency on adjacent slots is preserved across the
  parent/sub-query boundary.

- **C. Adaptive_reevaluate middleware patches the deeper response's
  `extra` directly.** The middleware already orchestrates the
  parent/sub-query relationship; it could read the parent's
  analyzer (via a hook on analysis_enricher) and call
  `push_packet` on each deeper response before yielding. Most
  localised but introduces a coupling between adaptive and
  analysis_enricher that doesn't exist today.

I lean **A** because it's the smallest change and aligns with the
"the central wire-strip is the authoritative line" framing in the
proxy-to-proxy near-miss letter at
`docs/dispatch/proxy-to-proxy-selector-canonical-key-near-miss.md`'s
addendum. But picking between A/B/C is a proxy-architecture
decision; the umbrella `CLAUDE.md`'s proxy section says:

> If a bug or improvement appears to require changes inside
> `proxy/`, surface the cross-boundary nature first and confirm
> the bump is in scope before opening proxy-repo work.

Proposing the actual fix requires reading `proxy/ARCHITECTURE.md`
and `proxy/FRAMEWORK.md` end to end first per `proxy/CLAUDE.md`'s
"Reading documentation" section. I have not done that read in this
turn. The fix is gated on that read; this postmortem doesn't pre-
commit to A/B/C.

---

## 5. Recommendations

Numbered for ease of reference. Each names the artefact, the
spirit of the change, and the ADR / CLAUDE.md anchor it would
compose with.

### 5.1 Wire-schema reference doc

**Spirit.** A single document under `docs/` whose role is to
describe every wire shape that crosses a sub-project boundary in
the LengYue system — the SPA↔proxy `analysis_config` schema, the
`capabilities` advertisement and per-query opt-in dict, the
`extra` envelope on responses, the SELECTOR `model` field, the
backend `/analysis-bundles` payload shape. Authority by reference
(pointing at the producer's source as canonical); the doc itself
exists to make the shape *findable* without grep across three
sub-projects.

**Composes with ADR-0005.** This is Rule 1 ("single source of
truth per nominal handle") applied to wire schemas, which today
have multiple non-coordinated sources of truth across producer and
consumer.

**Composes with ADR-0003.** The wire is the abstraction; the
sub-projects are concrete consumers. Naming the wire at the
umbrella level is consistent with the bands discipline.

**Suggested location.** `docs/wire-schemas.md` at the umbrella
root. Sections per shape; each section quotes the producer's
source as authoritative and links the consumer(s).

### 5.2 CLAUDE.md amendment — "ask for runtime visibility"

**Spirit.** Add to the umbrella `CLAUDE.md`'s "Asking before
assuming" section a paragraph naming runtime visibility (logs,
in-flight queries, process state) as a first-class request the
collaborator should make when investigating a cross-boundary bug,
analogous to "if the context needed to do the work correctly is
not in view ... ask for it before proceeding." Frame it as:

> When investigating a cross-boundary bug — frontend↔backend,
> SPA↔proxy, or any case where the symptom surfaces in one
> sub-project but the cause may live in another — the
> collaborator should ask for *runtime visibility* into the
> non-local side before drawing conclusions from wire-only
> observation. The proxy's structured logging (`proxy/docs/logging.md`)
> is the canonical channel; the backend's `pytest -vv` against a
> failing repro is the analog there; the frontend's browser
> DevTools console is the analog locally. Operating blind to the
> non-local side and inferring its behaviour from wire output is
> the failure mode ADR-0002 applied to debugging forbids — the
> alternative is a fragmentary diagnosis that may misidentify
> the failure surface (as the 2026-05-12 adaptive-deeper-
> enrichment investigation did before the user surfaced the
> visibility gap).

**Composes with ADR-0002.** This is fail-loudly applied to the
collaborator's epistemic state: the absence of a log channel is
itself information, and operating without surfacing that absence
is the silent failure the tenet forbids.

### 5.3 Proxy-side: wire-attached diagnostic channel (proposal, not commitment)

**Spirit.** When `PROXY_DIAGNOSTICS=true` (or a similar
env-var-gated flag, default off), the proxy attaches a small
diagnostic payload to each response under `extra._diagnostic`
naming which transformers / middleware engaged for this orig_id,
whether the response is a parent-final, a synthetic preview, or a
deeper-sub-query-final, and the relabel chain if any. This makes
the kind of investigation captured here *wire-observable* without
log access.

**Composes with ADR-0002.** The diagnostic is opt-in, never
default-on (the dispatch's `PROXY_ADVERTISE_CAPABILITIES`
pattern). The proxy's existing structured logs remain the rich
channel; this is the wire-fallback for wire-only consumers.

**Status.** Speculative. Listing it because it's the cleanest
single-step fix for §3.4's gap. Worth a dispatch document if
pursued.

### 5.4 Diagnostic probe script under the umbrella

**Spirit.** A small `scripts/probe-wire.mjs` (or under `proxy/scripts/`)
that takes an SGF path, model label, and analysis_config JSON
file, fires the analysis query against a configurable proxy URL,
and logs every response packet's structure. Equivalent to my
`/tmp/probe-*.mjs` but committed and discoverable. Would have
shortened my investigation if it had existed.

**Composes with ADR-0005.** Reference docs are easier to write
when there's a concrete usage example to point at; the probe
script doubles as a usage example for §5.1's wire schema doc.

**Status.** Low cost, high return. Likely worth doing alongside
§5.1.

### 5.5 Smaller SPA-side observations worth surfacing (not bugs today, but sharp edges)

Listed for visibility; not part of the postmortem's main thrust.

- **`analysis-ledger.ts:66-76` (`mergeRecords`).** The `if (value
  !== null && value !== undefined)` guard prevents overriding
  with a null *value*, but doesn't guard against an *inner*
  null-bearing value (e.g., `state[turn] = {Win: null}`)
  replacing a populated entry. I observed one transient instance
  of this during early probing under a misconfigured palette;
  it's not the current bug, but it's a sharp edge if a future
  delta_fn ever produces NaN under asteval.

- **`analysis-ledger.ts:114-120` (`mergeAnalysisPacket`).** The
  `if (incomingVisits < existingVisits) return existing` is the
  right invariant for the current proxy contract. If §5.3 ships
  with `_diagnostic.is_deeper_sub_query=true`, the SPA could
  *additionally* treat that as a signal to refuse the merge
  shortcut (or to surface a warning when the deeper packet lacks
  enrichment the existing packet had). Defer until §5.3 lands;
  flagging here so the merge logic's invariants stay coherent
  with whatever the proxy contract evolves into.

---

## 6. ADR or CLAUDE.md amendment?

The user asked for an executive take on whether this warrants a
new ADR or a CLAUDE.md amendment. My read:

- **Recommendations §5.1 (wire schema doc) and §5.4 (probe
  script) are concrete artefacts**, not tenets. They land as
  documents/files under `docs/` and `scripts/`. They don't need
  an ADR. They do need a brief mention in the umbrella
  `CLAUDE.md`'s "Where to read further" section so future
  collaborators discover them.

- **Recommendation §5.2 (runtime-visibility posture)** is a
  CLAUDE.md amendment, not an ADR. It's an applied corollary of
  ADR-0002 ("fail loudly applied to the collaborator's epistemic
  state when investigating bugs"), in the same shape that the
  umbrella `CLAUDE.md`'s "ADR-0002 applies to documentation
  consumption" section is an applied corollary for documentation
  reading. Naming it at the tenet level via a new ADR would be
  over-elevation; an amendment to the existing umbrella section
  is the right shape.

- **Recommendation §5.3 (wire-attached diagnostic channel)** is
  the only candidate for a substantive proxy-side change. If
  pursued, it would land as a dispatch document
  (`docs/dispatch/frontend-to-proxy-wire-diagnostic-channel.md`)
  per ADR-0005's dispatch ledger convention, and proceed through
  the usual proxy-side branch+PR+tag arc per the umbrella
  `CLAUDE.md`'s proxy section. Not an ADR.

In short: **no new ADR is warranted.** The recommendations
compose with existing ADRs (mostly 0002 and 0005). A CLAUDE.md
amendment under "Asking before assuming" is the highest-leverage
single change; the wire-schema doc and the probe script are
next-highest in concrete value.

---

## 7. Fix-plan envelope

Per `proxy/CLAUDE.md`'s "Reading documentation" section, proposing
the actual fix requires reading `proxy/ARCHITECTURE.md` and
`proxy/FRAMEWORK.md` end to end. I have read the two proxy-to-proxy
near-miss letters end to end during umbrella orientation
(2026-05-12) but not the architecture documents.

**Next-step proposal**, gated on user approval given the proxy-
boundary discipline:

1. Read `proxy/README.md`, `proxy/ARCHITECTURE.md`,
   `proxy/FRAMEWORK.md`, and `proxy/NOTICE` end to end.
2. Audit the three fix options (A: read-not-pop in
   analysis_enricher; B: share parent's analyzer with sub-queries;
   C: middleware patches deeper response's extra) against the
   actual Layer 1 / Layer 2 / Layer 3 invariants, the orchestration
   framework's eid contract, and the `DeltaAnalysisState`
   `n_moves` semantics for narrow `analyze_turns`.
3. File a proxy-side branch with the chosen fix + regression test
   in `proxy/tests/`.
4. Bump the umbrella's submodule pointer in a separate umbrella-
   side PR.

Holding pattern until the user confirms scope.

---

## 8. Author's accountability

I should not have generalised a probe corner-case into a
"adaptive never fires" finding. The user's report was the
authoritative signal; my probe's contradiction of it should have
prompted me to investigate the probe, not the user's experience. I
also should have asked for proxy log access by the time I was
reading `_find_worst_turns` line by line — that's when the cost of
operating blind exceeded the cost of asking.

The next time an SPA↔proxy or SPA↔backend bug investigation opens:
ask for runtime visibility first; refuse to draw negative
conclusions from a synthetic probe that contradicts the user's
real-world observation; quote the producer's source when reasoning
about wire shapes rather than inferring from one consumer's
producer.
