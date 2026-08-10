# History record — ADR-0016's fact-mining-daemon worked instances (Rules 1 and 3, the Context workflow narrative, and the first-instance dating)

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0016-the-service-contract-is-an-enforcement-surface.md` at commit `0f7b3e4`
> under `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

This file gathers the fact-mining-daemon worked-instance detail the portability refactor
moved out of ADR-0016 (`law/adr/history/README.md` is this convention's one home). Four
extractions, in the order they sat in the source ADR.

## Context — the standing-service-invariant workflow's findings

*(the two prose paragraphs preceding the "three feeders" numbered list, which itself
stayed inline in the refactored ADR as the rule's compressed motivation)*

The corpus mechanizes how *components* are built to a high bar: `mypy --strict`
(ADR-0012 P8), the env↔Policy seams (P2), the **fidelity gates** (the suite of
`*_fidelity` / `*_equivalence` / `*_bit_identity` tests that prove the fast path
matches the reference — ADR-0009/P6), the trace SSOT. Every one of those gates
polices *internal structure* and *happy-path correctness*. **None of them asks:
can a client break this standing service?** So the failure class the workflow
found lived in a dimension with **no enforcement surface at all** — and per
ADR-0011, a class that recurs in a dimension no mechanism covers is a guard the
executive never built, not an implementer who erred.

The unifying miss is a **glamour bias** — the discipline was decided by how
interesting the code felt, not by where a client can reach. The novel core (the
jax decode, the shape buckets) got the mother's-life bar; the boring
service-plumbing (input validation, readiness coverage, error and protocol
handling, resource bounds) got "it works on my input." The workflow's findings
are almost entirely in the plumbing: an unbounded `recv()` frame that OOM-kills
the daemon *above* the try/except; a client-chosen `model` string driving an
unbounded `spacy.load` into a never-evicted cache (first-request-pays
statefulness); a client-supplied `decode_addr` turning the daemon into an SSRF
pivot that wedges the single-in-flight loop for ten minutes; a multipart frame
desyncing the REP socket into a crash; wire-injected trace context flipping the
service into blocking DB I/O; readiness advertised over an *empty* compile cache
so request #1 per shape cold-JITs inside the handle. Every one is legal as bytes
and fatal deep inside — accept-then-detonate — or silently stateful. The seed
distilled **three feeders**, and each gets a rule below:

## Rule 1 — the fact-mining boundary types

*(the "Enforcement surface" paragraph's worked-instance inventory)*

This rule is **already substantially discharged in the fact-mining daemons**, and the
tenet records those as its worked instances so it codifies practice rather than
aspiring: frozen, slotted, only-constructor-decode `attrs` boundary types
(`wire_types.py` — the `ParseRequest` / `CorefRequest` / `DecodeRequest` /
`DecodeDoc` request models with their `MAX_BATCH` count cap, which are Specimen
1's `BoundedBatch` made concrete here; `AdvertisedLimits`, `ServableText`,
`MemoryEnvelope`, `PerDocumentRefusal`); the transport-level `ZMQ_MAXMSGSIZE` /
`ZMQ_RCVHWM` cap set on the `BoundSocket` before bind (an over-cap frame is
dropped in libzmq, never allocated or delivered — the OOM-frame class
unrepresentable above the handler);
single-frame `recv_multipart` refusal (the REP-desync class); the trace-context
gate that requires a locally-armed opt-in before wire content can enable DB I/O;
the `spacy.load` allowlist and the removal of `decode_addr` from the wire schema.
Each carries a `hypothesis`/`deal` property test (`test_recv_bounded.py`,
`test_wire_boundary_class567.py`, `test_servable_text_boundary.py`,
`test_wire_trace_gate.py`, `test_server_config_allowlist.py`).

## Rule 3 — the fact-mining readiness token

*(the "Enforcement surface" paragraph's worked-instance inventory)*

Worked instances in the fact-mining daemons: the `Warmed` token minted
only by `SweepLedger.seal()` after every required grid cell is recorded, and
`ReadinessGate.reach_ready(warmed)` as the sole transition into READY
(`readiness.py` — a partial sweep raises `SweepIncomplete`, never a `Warmed`, at
zero warm-path cost since readiness is which dispatcher the loop calls, swapped
once); the realistic-batch warmup ladder derived from the advertised envelope
(commit `309de82`; `test_nlp_realistic_warmup.py`, `test_warmup_grid.py`,
`test_readiness.py`); `AdvertisedLimits` on the `info` reply with the client
planner (`plan_chunks`) that partitions against it; the `MemoryEnvelope` +
degraded-readiness disposition (commit `83700dc`) that fails loud before failing
slow on the never-evicting `StringStore` (the ADR-0015 intersection).

## Consequences — first worked instance, dated

*(the "Neutral" Consequences bullet's original text)*

The fact-mining daemons' hardening (commits `ce1b1a3`, `dbf70fa`, `5e9be34`,
`309de82`, `83700dc`) is this tenet's first worked instance, landed before the
tenet was written.

## Related — the workflow's own identifiers

*(the Related section's citation of the workflow that found the class)*

The `standing-service-invariant` workflow (`wf_ee73fb10-f41`;
`experiments/fact-mining/docs/audit-evidence/iteration-1_wf_ee73fb10-f41/`) — the
audit this tenet generalizes into a standing gate; `BACKLOG.md`'s seed section is
its provenance.
