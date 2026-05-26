"""
research/compression/framework/runner.py

Orchestration: given a list of compression methods, runs all
four output families (rate, distortion, capture, operational
cost) against the corpus and returns a structured result that
the caller can format / serialize / plot.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from .decomposition import variance_decomposition
from .method import Method
from .metrics import (
    compute_capture_profile,
    compute_distortion,
    measure_operational_cost,
    measure_rate,
)


def run_framework(
    corpus: dict[str, np.ndarray],
    methods: list[Method],
    brotli_quality: int = 6,
) -> dict[str, Any]:
    """Run the framework against the corpus.

    Returns a dict with:
      decomposition: corpus variance decomposition (one-time)
      methods: list of per-method results, each containing:
        name, rate, distortion, capture_profile, operational_cost,
        state_init_ms (if the method has init())
    """
    n_bundles = len(corpus)
    print(f"[1/{len(methods)+1}] computing corpus variance decomposition...")
    decomp = variance_decomposition(corpus)
    print(f"  ss_total = {decomp['ss_total']:.3f}")
    print(f"  fractions: B={decomp['fraction_B']:.4f} "
          f"T_B={decomp['fraction_T_B']:.4f} "
          f"S={decomp['fraction_S']:.4f} "
          f"BS={decomp['fraction_BS']:.4f} "
          f"R={decomp['fraction_R']:.4f} "
          f"(sum_check={decomp['sum_check']:.6f})")

    method_results = []
    for i, method in enumerate(methods, start=2):
        print(f"[{i}/{len(methods)+1}] measuring '{method.name}'...")
        # Init state once if needed
        import time
        state = None
        state_init_ms = 0.0
        if method.init is not None:
            t0 = time.perf_counter()
            state = method.init(corpus)
            state_init_ms = (time.perf_counter() - t0) * 1000.0

        rate = measure_rate(corpus, method, state=state, brotli_quality=brotli_quality)
        distortion = compute_distortion(corpus, method, state=state)
        capture = compute_capture_profile(corpus, method, decomp, state=state)
        op_cost = measure_operational_cost(corpus, method, state=state)

        method_results.append({
            "name": method.name,
            "state_init_ms": state_init_ms,
            "rate": rate,
            "distortion": distortion,
            "capture_profile": capture,
            "operational_cost": op_cost,
        })

    return {
        "decomposition": decomp,
        "methods": method_results,
        "n_bundles": n_bundles,
    }


# ── Report formatting ───────────────────────────────────────────────────────


def format_report(results: dict[str, Any]) -> str:
    """Format the runner's output as a human-readable text report."""
    lines = []
    lines.append("=" * 78)
    lines.append("Compression evaluation framework — report")
    lines.append("=" * 78)
    lines.append("")

    d = results["decomposition"]
    lines.append("Corpus variance decomposition (SS-based 5-way nested ANOVA)")
    lines.append("-" * 78)
    lines.append(f"  Total SS:    {d['ss_total']:.3f}")
    lines.append(f"  fraction_B   (bundle main effect):           {d['fraction_B']:.4f}")
    lines.append(f"  fraction_T_B (packet within bundle):         {d['fraction_T_B']:.4f}")
    lines.append(f"  fraction_S   (cell main effect):             {d['fraction_S']:.4f}")
    lines.append(f"  fraction_BS  (bundle × cell interaction):    {d['fraction_BS']:.4f}")
    lines.append(f"  fraction_R   (joint residual):               {d['fraction_R']:.4f}")
    lines.append(f"  sum check (should ≈ 1.0):                    {d['sum_check']:.6f}")
    lines.append("")
    lines.append("Reading: V_R / V_total is the 'irreducible joint structure' — what")
    lines.append("compression actually has to capture beyond the marginals.")
    lines.append("")

    lines.append("Per-method results")
    lines.append("-" * 78)
    for m in results["methods"]:
        lines.append("")
        lines.append(f"## {m['name']}")
        if m["state_init_ms"] > 0:
            lines.append(f"   state-init: {m['state_init_ms']:.1f} ms (one-time)")
        r = m["rate"]
        lines.append(f"   Rate (bytes per bundle):")
        lines.append(f"     raw:        {r['mean_bytes']:>10,.0f}  (total {r['total_bytes']:>11,})")
        lines.append(f"     +brotli:    {r['mean_brotli_bytes']:>10,.0f}  (total {r['total_brotli_bytes']:>11,})")
        if r["codebook_bytes"] > 0:
            n_b = results.get("n_bundles", len(results["methods"]))
            per_bundle_codebook = r["codebook_bytes"] / n_b
            lines.append(f"     codebook:   {r['codebook_bytes']:>10,} (amortised across {n_b} bundles → {per_bundle_codebook:,.0f} per bundle)")
        d2 = m["distortion"]
        lines.append(f"   Distortion vector:")
        lines.append(f"     L∞ (corpus worst):       {d2['l_inf']:.6f}")
        lines.append(f"     L∞ p95 (per-bundle):     {d2['l_inf_p95']:.6f}")
        lines.append(f"     L∞ p99 (per-bundle):     {d2['l_inf_p99']:.6f}")
        lines.append(f"     L2 RMS (corpus):         {d2['l2_rms']:.6f}")
        lines.append(f"     L2 mean per-bundle RMS:  {d2['l2_per_bundle_mean']:.6f}")
        lines.append(f"     JSD mean:                {d2['jsd_mean']:.6f}")
        lines.append(f"     JSD p95:                 {d2['jsd_p95']:.6f}")
        c = m["capture_profile"]
        lines.append(f"   Structure-capture profile:")
        for key, label in [("B", "Bundle"), ("T_B", "Packet/bundle"),
                           ("S", "Cell"), ("BS", "Bundle×Cell"),
                           ("R", "Joint residual")]:
            v = c[f"capture_{key}"]
            if v != v:  # NaN
                lines.append(f"     C_{key:<3s} ({label:<14s}):  n/a (zero variance in original)")
            else:
                lines.append(f"     C_{key:<3s} ({label:<14s}):  {v:>7.4f}")
        lines.append(f"     error fraction of total: {c['error_fraction_total']:.6f}")
        op = m["operational_cost"]
        lines.append(f"   Operational cost:")
        lines.append(f"     encode/bundle: {op['encode_ms_per_bundle']:>6.1f} ms  ({op['encode_ms_per_packet']:.3f} ms/packet)")
        lines.append(f"     decode/bundle: {op['decode_ms_per_bundle']:>6.1f} ms  ({op['decode_ms_per_packet']:.3f} ms/packet)")
    return "\n".join(lines)
