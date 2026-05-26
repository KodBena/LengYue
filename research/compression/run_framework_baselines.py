"""
research/compression/run_framework_baselines.py

Driver: runs the compression-evaluation framework against the
shipped baseline methods on the 40-game ownership corpus.

Output: structured report (rate, distortion vector, structure-
capture profile, operational cost) per method, plus the corpus's
variance decomposition.

Usage:
  PYTHONPATH=. python -m research.compression.run_framework_baselines

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from research.compression.framework import load_corpus, run_framework, format_report
from research.compression.framework.methods_baselines import BASELINES
from research.compression.framework.methods_ica import ICA_METHODS


def main() -> int:
    print("loading corpus from redis (127.0.0.1:6380)...")
    corpus = load_corpus()
    n_packets = sum(b.shape[0] for b in corpus.values())
    print(f"  {len(corpus)} games, {n_packets} ownership maps")
    print()
    results = run_framework(corpus, BASELINES + ICA_METHODS)
    print()
    print(format_report(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
