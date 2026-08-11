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
