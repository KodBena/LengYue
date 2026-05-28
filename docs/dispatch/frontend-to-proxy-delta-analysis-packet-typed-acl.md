# Dispatch: frontend → proxy — typed ACL boundary for `DeltaAnalysisState.push_packet`

- **From:** frontend (umbrella session, 2026-05-28)
- **To:** proxy (KataProxy)
- **Topic:** Tighten the typing on `delta_analysis.py`'s public
  ingestion surface (`push_packet(move_idx: int, packet: Any)`)
  without compromising the file's protocol-agnostic design intent.
- **Status:** Open ask — request for a proxy-side cleanup arc.
  Suggested as a candidate landing for the next proxy point
  release (v1.0.22+). Not blocking any frontend work; no umbrella
  pin change requested concurrently.
- **Date:** 2026-05-28.

## Why this dispatch exists

Per the proxy's `delta_analysis.py` docstring (verbatim):

> It is *protocol-agnostic* analysis substance — it knows about
> the reactive_pipeline DSL, numpy, and sortedcontainers, but
> nothing about KataGoQuery, KataGoResponse, the Transformer
> abstraction, or the proxy's session model. The wire-side
> plumbing that feeds it lives in analysis_enricher.py.

And per `transformers/analysis_enricher.py`'s docstring:

> This is the *proxy-protocol-aware glue* between the wire-level
> Transformer extension surface and the protocol-agnostic analysis
> substance in delta_analysis.py.

The two docstrings together describe a clean ACL boundary:
`analysis_enricher` owns the protocol vocabulary, `delta_analysis`
owns the analysis substance, and the interface between them is the
DeltaAnalysisState public surface (primarily `push_packet`).

**The boundary is documented but not typed.** `push_packet`'s
signature is:

```python
def push_packet(self, move_idx: int, packet: Any) -> Dict[str, Any]:
```

`Any` permits literally anything to cross the ACL — `None`, a raw
int, a list, an opaque object — and the failure surfaces deep
inside the reactive_pipeline combinator chain (typically as a
numpy or attribute error) rather than at the ACL boundary itself.
The project author's recollection (umbrella session, 2026-05-28):
the loose typing was an *intentional* generic-by-design decision
many moons ago, and that intent should be preserved — but
narrower-than-`Any` typing can preserve it while still catching
gross boundary violations.

The investigation that surfaced this came from an unrelated SPA
session asking whether `delta_analysis.py` ought to be typed with
`MoveView` / `TurnView` (the dataclasses in
`middleware/adaptive_reevaluate.py`). The answer was no — those
types carry `AnalyzeResponse` and would re-introduce the protocol
coupling `delta_analysis` was designed to avoid. The substantive
finding worth proxy-side action is this one: the ACL boundary
itself is loose.

## What `delta_analysis` actually needs from a packet

Tracing `push_packet`:

1. The packet is passed verbatim to `self._root.updateAt(move_idx,
   packet)` and `self._state_pipe.updateAt(move_idx, packet)`.
2. The reactive_pipeline combinator chain delivers the packet to
   user-authored expressions resolved via
   `registry_interpreter.py`.
3. User expressions read whatever fields the packet has — e.g.,
   `x["rootInfo"]["winrate"]`, `x["moveInfos"][0]["visits"]`,
   `x["extra"]["something"]`. The packet is consumed as a generic
   string-keyed map; no specific fields are required by
   `delta_analysis` itself.

**Implication:** the right typing is structure, not content. The
packet's *shape* is "JSON-like mapping with string keys and
arbitrary values"; the *content* is genuinely open (user
expressions can read any field). Constraining the shape is honest;
constraining the content would over-specify.

## Proposed change

Define a single TypeAlias capturing the design intent — e.g., at
the top of `delta_analysis.py`:

```python
from typing import Any, Mapping

# Public-surface type for packets ingested through push_packet.
# Captures the generic-by-design intent: any string-keyed mapping
# (typically a JSON-decoded KataGo response, but the module itself
# stays protocol-agnostic — see the file's header). Narrower than
# Any so the ACL boundary catches gross violations (None, raw
# scalars, lists, non-mappings) without over-specifying the
# content the user-authored expressions are free to read.
AnalysisPacket = Mapping[str, Any]
```

Then narrow `push_packet`:

```python
def push_packet(self, move_idx: int, packet: AnalysisPacket) -> Dict[str, Any]:
```

Updates needed beyond the type definition:

- `transformers/analysis_enricher.py:145` is the single caller of
  `push_packet` — passes `(r.turn_number, r.opaque)` as the packet.
  `r.opaque` is already a dict-like in practice; mypy should accept
  with no source change.
- The internal pipeline ingestion paths (`updateAt` etc. in
  `reactive_pipeline/core.py`) typed as `val: Any` can stay `Any`
  — they're the generic combinator substrate and shouldn't
  inherit caller-side narrowing.
- The output-type `Dict[str, Any]` on `push_packet`'s return,
  and the related `state_snapshot`, `black_cwt_snapshot`,
  `black_deltas`, `black_matrix`, `white_matrix` — those carry
  user-expression *outputs*, which are genuinely `Any`-shaped
  (could be int, float, str, nested dict, etc.). Leaving these
  as-is is honest; not part of this dispatch's scope.

## Why now / why not later

- Composes with the v1.0.21 identity-type-branding migration's
  project-wide `mypy --strict` posture. The proxy's typing
  discipline is the strictest it has ever been; adding one
  TypeAlias and tightening one signature fits that arc naturally.
- Zero behavioural change. Runtime semantics identical; only
  the boundary contract becomes inspectable to mypy.
- Defers indefinitely if the project author wants to keep the
  literal `Any` for any reason. The dispatch is a *suggestion*
  for proxy-side cleanup, not a binding wire-shape change. No
  frontend code path depends on it.

## Open questions for the proxy-side implementer

- **TypeAlias name.** `AnalysisPacket` matches the docstring
  language; `DeltaPacket` is shorter but less descriptive;
  `PacketLike` is more permissive-sounding. Project author's
  call.
- **Scope creep risk.** This dispatch deliberately limits to
  `push_packet`'s input. A broader typing pass (output types,
  internal helper signatures, `reactive_pipeline/core.py`'s
  `Any` usage) is its own arc — the combinator substrate is
  *appropriately* generic, and tightening its types is a
  different concern from tightening the ACL.
- **Forward-compat with non-Mapping packets.** Today every
  caller passes `dict`-shaped data; `Mapping[str, Any]` matches.
  If a future call site needs to pass a dataclass or Protocol
  carrying the same access semantics, the alias may need to
  widen — but that's a future-arc concern, not a v1.0.22 one.

## Suggested filing

This dispatch under `docs/dispatch/` per the umbrella's dispatch
ledger convention. No frontend code change ships with it; no
umbrella submodule pin change requested concurrently. A proxy-
side status reply (`proxy-to-frontend-delta-analysis-packet-
typed-acl-status.md`) when the cleanup lands closes the loop.
