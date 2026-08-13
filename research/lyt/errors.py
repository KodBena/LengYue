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
    remains parseable and loadable this wave — the two clean-room
    encodings still carry them until dispatch C's own encoding rewrite —
    but every such literal now emits ONE of these, non-fatally, so the
    encoding-rewrite dispatch can measure exactly how many remain and, in
    its own change, flip this from a warning to a `LytLoadError` refusal
    (RELATIONS-FIRST, row 2396/2397: "px literals... banned from
    encodings"). Never raised on its own; `warnings.warn(...,
    category=RelationsFirstDeprecationWarning)` is how `loader.py` emits
    it — a caller that wants it to fail loudly today may already do so
    with `warnings.simplefilter("error", RelationsFirstDeprecationWarning)`
    or `pytest -W error::errors.RelationsFirstDeprecationWarning`, without
    any code change here."""
