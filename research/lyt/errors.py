"""Structured errors for the LYT prototype, per the umbrella's ADR-0002
("fail loudly... refuse malformed input with a structured error, never
coerce" — build commission item 3). Every refusal below carries a
machine-checkable `.detail` dict (never just a free-text message) so a
caller — human or test — can assert on *why* something was refused, not
just *that* it was.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class LytError(Exception):
    message: str
    detail: Dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return f"{self.message} | detail={self.detail!r}"


class LytParseError(LytError):
    """The concrete-syntax text is not well-formed per the EBNF (§4.1)."""


class LytLoadError(LytError):
    """The parsed tree fails a semantic/type check: an unrepresentable
    construct (content-driven sizing, system+release presence) or a
    violated well-formedness law (L1-L4), including AMENDMENT 4's new
    "presence-valuation" law (SPEC-AMENDMENTS.md, ledger row 1737) and
    AMENDMENT 5's new L5/L5a/L5b/L5c overflow-honesty laws
    (SPEC-AMENDMENTS.md, ledger row 1937)."""


class LytFlowError(LytError):
    """`flow.py`'s own refusal: an item cannot be packed into any row at
    the given width (the item's own natural width exceeds the available
    width — no amount of wrapping can honor it). Raised, never silently
    clamped or truncated (ADR-0002) — see `flow.py`'s module docstring."""


class RelationsFirstDeprecationWarning(DeprecationWarning):
    """LYT relations-first amendment, dispatch B (ledger rows
    2396/2397/2400/2401), task 4 (backward compat during transition): a
    px/ch LITERAL bound (min/pref/max/the bare `{extent}` shorthand)
    remains parseable and loadable — `warnings.warn(...,
    category=RelationsFirstDeprecationWarning)` is how `loader.py` emits
    it, once per resolution, for every caller that does not opt into
    strict mode. A caller that wants it to fail loudly may do so with
    `warnings.simplefilter("error", RelationsFirstDeprecationWarning)` or
    `pytest -W error::errors.RelationsFirstDeprecationWarning` (channel B,
    zero code changes here) — but note that filter is UNSCOPED: it also
    turns the SAME warning fired for an `fr`/`inf` structural sizing
    keyword into an error, which has no relations-first analog to convert
    to (see `relations.RelationContext.refuse_literal_bounds`'s own
    docstring).

    FLIPPED, PER-UNIT, dispatch C4 (ledger rows
    2396/2397/2400/2419/2425/2436/2445, the closing step of the relations-
    first amendment): `loader.load_layouts(..., refuse_literal_bounds=
    True)` is the scoped alternative to channel B above — it makes
    `loader._resolve_extent_like` RAISE a structured `errors.LytLoadError`
    (`detail["prohibition"] == "px-literal-in-governed-encoding"`) instead
    of warning, for a px/ch literal ONLY (an `fr`/`inf` structural literal
    is unaffected, unlike the unscoped `simplefilter`/`pytest -W` channel
    above). `False`/unset is the default everywhere — byte-identical to
    every pre-C4 call. Dispatch C3's own encoding rewrite
    (`.claude/dispatch-reports/lyt-relations-c3-rewrite.md`) reduced the
    two real clean-room encodings' own residual literal count by 77.5%
    (528 -> 119) but did not reach zero — ~59 of the 119 are genuine px/ch
    literals still unreachable against the committed facts files (no
    probe/measurement exists yet), so C4 does NOT wire
    `refuse_literal_bounds=True` into either encoding's own default
    loading path (`runner.py`/`emit_*.py`/`coverage_matrix.py` all still
    load both encodings warning-only) — doing so would refuse currently
    load-bearing, honestly-disclosed content, not a defect. The flip is a
    tested, directory-scopable CAPABILITY (see `tests/test_relations.py`'s
    own C4 coverage) that a future wave activates once the residual
    literals are grounded, not something this dispatch forces on."""
