"""
research/compression/framework

Quantitative framework for evaluating compression methods against
the LengYue analysis-bundle corpus. Implements §3 of the
2026-05-26 linear-projection investigation
(docs/archive/notes/linear-projection-compression-investigation-2026-05-26.md):

  - Variance decomposition (SS-based 5-way nested ANOVA over the
    bundle × packet × cell tensor)
  - Method abstraction (encode/decode contract)
  - Distortion vector (L∞ corpus-worst, L∞_p95 per-bundle,
    L₂ RMS, JSD)
  - Structure-capture profile (per-component reconstruction
    fidelity)
  - Rate (post-brotli bytes per bundle)
  - Operational cost (encode/decode timing, codebook bytes)
  - Driver that runs all four output families for a list of
    methods and emits a structured report

The framework's discipline (§3.5 of the investigation note):
every probe must report all four output families. Reporting bytes
alone, or L₂ alone, is forbidden — the framework forces the
multi-error comparison that prevents framing-mistakes like the
PCA probe's initial mis-report.

License: Public Domain (The Unlicense)
"""
from .corpus import load_corpus, OWNERSHIP_CELLS  # noqa: F401
from .decomposition import variance_decomposition  # noqa: F401
from .method import Method  # noqa: F401
from .metrics import (  # noqa: F401
    compute_distortion,
    compute_capture_profile,
    measure_rate,
    measure_operational_cost,
)
from .runner import run_framework, format_report  # noqa: F401
