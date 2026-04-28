"""
api/routes/qeubo_encoding.py

Encode / decode helpers for the qEUBO REST routes. Maps between actual
parameter values (arbitrary numeric ranges supplied by the user via
`parameter_meta`) and qEUBO's normalised [0, 1]^d point space.

This module is public-domain and sits OUTSIDE the MIT-licensed
`backend/qeubo/` directory. It does not import from the `qeubo` package
and was authored without source visibility into `qeubo/runtime/*.py`,
preserving the licensing boundary documented in
`docs/dispatch/frontend-to-backend-qeubo-integration.md` (§2.3) and
`backend/NOTICE`. The math is plain `(actual − min) / (max − min)` and
requires no qEUBO source visibility.

The route layer guarantees, at experiment-creation time, that every
controlled parameter has a `[min, max]` entry in `parameter_ranges`.
Decoding a missing parameter therefore signals a programming error
rather than a user error; `decode` and `encode` raise loudly per
ADR-0002 instead of silently substituting the unit interval.

License: Public Domain (The Unlicense)
"""
from typing import Mapping, Sequence


ParameterRanges = Mapping[str, Sequence[float]]


def decode(
    point: Sequence[float],
    param_names_in_order: Sequence[str],
    parameter_ranges: ParameterRanges,
) -> dict[str, float]:
    """Map a normalised [0, 1]^d point to actual parameter values."""
    if len(point) != len(param_names_in_order):
        raise ValueError(
            f"point has {len(point)} components but "
            f"{len(param_names_in_order)} parameters were declared"
        )
    result: dict[str, float] = {}
    for i, name in enumerate(param_names_in_order):
        if name not in parameter_ranges:
            raise ValueError(f"missing parameter_ranges entry for {name!r}")
        rng = parameter_ranges[name]
        if len(rng) != 2:
            raise ValueError(
                f"parameter_ranges[{name!r}] must be [min, max], got {list(rng)!r}"
            )
        lo, hi = float(rng[0]), float(rng[1])
        result[name] = lo + (hi - lo) * float(point[i])
    return result


def encode(
    values: Mapping[str, float],
    param_names_in_order: Sequence[str],
    parameter_ranges: ParameterRanges,
) -> list[float]:
    """Map actual parameter values to a normalised [0, 1]^d point.

    User-edited values may briefly fall outside the declared range
    (e.g. between editing a range bound and re-saving values); clamp
    rather than raise. A degenerate range (`hi <= lo`) is a structural
    error and raises.
    """
    point: list[float] = []
    for name in param_names_in_order:
        if name not in values:
            raise ValueError(f"missing value for parameter {name!r}")
        if name not in parameter_ranges:
            raise ValueError(f"missing parameter_ranges entry for {name!r}")
        rng = parameter_ranges[name]
        if len(rng) != 2:
            raise ValueError(
                f"parameter_ranges[{name!r}] must be [min, max], got {list(rng)!r}"
            )
        lo, hi = float(rng[0]), float(rng[1])
        if hi <= lo:
            raise ValueError(
                f"parameter_ranges[{name!r}] requires min < max; got [{lo}, {hi}]"
            )
        clamped = max(lo, min(hi, float(values[name])))
        point.append((clamped - lo) / (hi - lo))
    return point
