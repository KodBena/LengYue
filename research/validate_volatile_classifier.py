"""
research/validate_volatile_classifier.py

Closes the cards.db validation loop: for each of the 5 canonical
volatile positions, extract Phase 3.5 features from the collected
V_pre packet, run the cleanness classifier (LGBM + Logistic, both
trained on the research corpus), and compare the predicted P(clean)
against the actual fit-status outcomes from `validate_volatile_cards.py`.

If the classifier output correlates with actual cleanness outcomes
across these 5 positions, that's the strongest possible cross-
validation: the classifier (trained on 344 pro-game positions from
year2000) generalises to user-annotated Hatsuyoron-level volatile
positions from cards.db game_source 2649.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from feature_extraction import extract_features  # noqa: E402
from pg_sink import connect, list_realizations  # noqa: E402
from regression import load_corpus  # noqa: E402

# Hard-coded the actual fit-status outcomes from
# validate_volatile_cards.py at n_realizations=10 (matching the
# research-corpus methodology). Updated 2026-05-20 — the n=3
# preliminary run had different statuses on card 1429 (was
# all-degenerate at n=3; now 3/4 clean at n=10), confirming that
# the n=3 "all degenerate" was averaging noise, not unfittability.
VOLATILE_ACTUAL = {
    "card_1429_spar7_r1": {
        "scoreLead_drift": "clean",
        "visit_entropy_reduction": "degenerate",
        "L2_joint_drift": "clean",
        "winrate_drift": "clean",
    },
    "card_2893_spar8_r1": {
        "scoreLead_drift": "degenerate",
        "visit_entropy_reduction": "degenerate",
        "L2_joint_drift": "degenerate",
        "winrate_drift": "clean",
    },
    "card_2935_spar9_r1": {
        "scoreLead_drift": "clean",
        "visit_entropy_reduction": "clean",
        "L2_joint_drift": "clean",
        "winrate_drift": "clean",
    },
    "card_3197_spar5_r1": {
        "scoreLead_drift": "clean",
        "visit_entropy_reduction": "clean",
        "L2_joint_drift": "clean",
        "winrate_drift": "clean",
    },
    "card_3534_spar6_r1": {
        "scoreLead_drift": "clean",
        "visit_entropy_reduction": "degenerate",
        "L2_joint_drift": "clean",
        "winrate_drift": "clean",
    },
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sgf-dir", default=Path.home() / "volatile_sgfs",
                    type=Path)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "validate_volatile" /
                            "validate_volatile_classifier.txt",
                    type=Path)
    args = ap.parse_args()
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)

    # ── Load the research corpus + train both classifiers on it ─────────────
    print(f"=== loading research corpus from {args.labels_csv} ===",
          flush=True)
    corpus = load_corpus(args.labels_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    print(f"  corpus: n={len(X)}  features={len(feature_names)}  "
          f"groups={len(set(groups))}", flush=True)

    # We train per (target, family) classifiers using the same
    # imports/factory pattern as classify_cleanness.py
    from classify_cleanness import _LightGBMBinaryWrap, _LogisticWrap

    target_families = [
        ("scoreLead_drift", "hyperbolic"),
        ("visit_entropy_reduction", "hyperbolic"),
        ("L2_joint_drift", "hyperbolic"),
        ("winrate_drift", "hyperbolic"),
    ]

    classifiers: dict[tuple[str, str], dict] = {}
    print(f"\n=== training {len(target_families)} (target, family) classifiers "
          f"on full corpus ===", flush=True)
    for (t, fam) in target_families:
        key = next((k for k in per_label if k[0] == t and k[1] == fam), None)
        if key is None:
            print(f"  {t}|{fam}: no labels in corpus", flush=True)
            continue
        labels = per_label[key]
        y = (labels[:, 1] == 1.0).astype(int)
        n_pos = int(y.sum())
        n_neg = len(y) - n_pos
        if n_pos < 10 or n_neg < 10:
            print(f"  {t}|{fam}: too imbalanced ({n_pos}/{n_neg})",
                  flush=True)
            continue
        lgbm = _LightGBMBinaryWrap(n_pos, n_neg).fit(X, y)
        log = _LogisticWrap(n_pos, n_neg).fit(X, y)
        classifiers[(t, fam)] = {"lgbm": lgbm, "logistic": log,
                                  "base_rate": n_pos / len(y)}
        print(f"  {t}|{fam} trained, base rate {n_pos/len(y):.1%}",
              flush=True)

    # ── Extract V_pre features for each volatile position ───────────────────
    print(f"\n=== extracting V_pre features for volatile positions ===",
          flush=True)
    sgfs = sorted(args.sgf_dir.glob("*.sgf"))
    conn = connect()
    volatile_feats: dict[str, np.ndarray] = {}
    for sgf in sgfs:
        stem = sgf.stem
        # Determine turn = number of moves in SGF (last-move position).
        import re
        n_moves = len(re.findall(r";[BW]\[[a-z]{0,2}\]", sgf.read_text()))
        reals = list_realizations(conn, stem, n_moves)
        if not reals:
            print(f"  ✗ {stem}: no realizations at turn {n_moves}",
                  flush=True)
            continue
        # Use r0 (canonical) for feature extraction — V_pre is
        # before-search, so should be near-identical across realizations.
        try:
            feats_dict = extract_features(stem, n_moves, realization=reals[0],
                                          conn=conn)
        except Exception as e:
            print(f"  ✗ {stem}: feature extraction failed: {e}",
                  flush=True)
            continue
        feats_vec = np.array([feats_dict[k] for k in feature_names],
                             dtype=np.float64)
        volatile_feats[stem] = feats_vec
        print(f"  ✓ {stem} (turn={n_moves}, n_reals={len(reals)})",
              flush=True)
    conn.close()

    if not volatile_feats:
        sys.exit("no volatile positions had extractable features")

    # ── Score each (volatile position, target, classifier) combination ──────
    print(f"\n=== classifier predictions on volatile positions ===",
          flush=True)
    lines: list[str] = []
    lines.append("# cleanness classifier predictions on canonical volatile cards")
    lines.append(f"# {len(volatile_feats)} positions × {len(classifiers)} "
                 f"(target, family) classifiers × 2 models (lgbm + logistic)")
    lines.append("")
    header = (f"  {'card':<32} {'target':<28} {'family':<14} "
              f"{'lgbm P(clean)':>14} {'log P(clean)':>14} "
              f"{'actual':<11}  {'match?':<10}")
    print(header, flush=True)
    lines.append(header)

    # Score matching: classifier predicts P(clean); actual is "clean" or
    # "degenerate". A "good" prediction is high-P-clean when actual=clean,
    # low-P-clean when actual=degenerate. We threshold at the corpus base
    # rate (so the model is calibrated against its own training prior).
    n_correct_lgbm = 0
    n_correct_log = 0
    n_total = 0
    for stem, x in volatile_feats.items():
        actual_d = VOLATILE_ACTUAL.get(stem, {})
        for (t, fam), models in classifiers.items():
            base_rate = models["base_rate"]
            p_lgbm = float(models["lgbm"].predict_proba(x[np.newaxis, :])[0])
            p_log = float(models["logistic"].predict_proba(x[np.newaxis, :])[0])
            actual = actual_d.get(t, "?")
            actual_clean = (actual == "clean")
            lgbm_predicts_clean = p_lgbm >= base_rate
            log_predicts_clean = p_log >= base_rate
            lgbm_match = lgbm_predicts_clean == actual_clean
            log_match = log_predicts_clean == actual_clean
            n_total += 1
            if lgbm_match: n_correct_lgbm += 1
            if log_match: n_correct_log += 1
            match_str = (
                f"{'L✓' if lgbm_match else 'L✗'}/"
                f"{'R✓' if log_match else 'R✗'}"
            )
            line = (
                f"  {stem:<32} {t:<28} {fam:<14} "
                f"{p_lgbm:>+14.4f} {p_log:>+14.4f} "
                f"{actual:<11}  {match_str:<10}"
            )
            print(line, flush=True)
            lines.append(line)

    lines.append("")
    lines.append(f"# accuracy: LGBM {n_correct_lgbm}/{n_total} "
                 f"({n_correct_lgbm/n_total:.0%})  "
                 f"Logistic {n_correct_log}/{n_total} "
                 f"({n_correct_log/n_total:.0%})")
    lines.append(f"# (chance baseline: ~50% under balanced threshold)")

    print()
    print(f"  LGBM accuracy: {n_correct_lgbm}/{n_total} "
          f"({n_correct_lgbm/n_total:.0%})", flush=True)
    print(f"  Logistic accuracy: {n_correct_log}/{n_total} "
          f"({n_correct_log/n_total:.0%})", flush=True)

    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
