"""
research/compression/framework/method.py

Method abstraction for the compression-evaluation framework.

A `Method` is a (name, encode, decode) triple. The framework
applies it to corpus bundles, measures all four output families
(rate, distortion, capture, operational cost), and reports.

The encode/decode contract:
  - encode(bundle: (T, 361) float64) → bytes
  - decode(payload: bytes) → (T, 361) float64

The bytes returned by encode are what the SPA would PUT on the
wire (pre-brotli). The framework brotli-wraps separately and
reports both raw + post-brotli sizes.

Methods can be stateless or carry per-corpus configuration
(e.g., a global PCA basis fit on the full corpus). For stateless
methods, the `init` field is None; for stateful, `init` is called
once with the full corpus and returns an opaque state object that
encode/decode receive as their first argument.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

import numpy as np


@dataclass
class Method:
    """A compression method under test by the framework.

    Fields:
      name: human-readable identifier (used in reports)
      encode: bundle → bytes
      decode: bytes → bundle
      init: optional one-shot fitter; returns a state object that
            encode/decode receive as a hidden first argument. If
            None, the method is stateless.
      codebook_bytes: bytes the method ships globally (amortised
            across all bundles). 0 for stateless methods.
    """
    name: str
    encode: Callable[[np.ndarray], bytes]
    decode: Callable[[bytes], np.ndarray]
    init: Optional[Callable[[dict[str, np.ndarray]], Any]] = None
    codebook_bytes: int = 0
