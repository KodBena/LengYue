"""
research/compare_sweeps.py

Diff two `summary_stability_sweep.txt` files (produced by
`allocator_sim_stability.py`) on a per-(extractor, threshold) basis.
Reports AUC OOD / AUC within deltas + sim Pareto envelope shifts, so
the v1 (linear-V weighting) vs v2 (log-V weighting) reframe can be
read at a glance.

Usage:
    python compare_sweeps.py --v1 PATH --v2 PATH

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Cell:
    extractor: str
    threshold: float
    pos_rate_y2k: float
    pos_rate_cards: float
    auc_within: float
    auc_ood: float
    log_loss_within: float
    log_loss_ood: float
    visits_min: float
    visits_max: float
    agree_min: float
    agree_max: float
    term_min: float
    term_max: float


_RE_CELL = re.compile(r"^# extractor=(\S+)\s+threshold=([0-9.]+)")
_RE_POS = re.compile(r"^\s*pos_rate_y2k=([0-9.]+)\s+pos_rate_cards=([0-9.]+)")
_RE_AUC = re.compile(r"^\s*AUC: within=([+-][0-9.]+)\s+OOD=([+-][0-9.]+)")
_RE_LL = re.compile(r"^\s*log_loss: within=([0-9.]+)\s+OOD=([0-9.]+)")
_RE_ROW = re.compile(r"^\s+([0-9.-]+)\s+([0-9]+)\s+([+-][0-9.]+)\s+([0-9.]+)%")


def parse_summary(path: Path) -> dict[tuple[str, float], Cell]:
    """Parse a summary_stability_sweep.txt into {(extractor, threshold): Cell}."""
    out: dict[tuple[str, float], Cell] = {}
    cur: dict | None = None
    rows: list[tuple[float, float, float, float]] = []

    def flush():
        if cur is None or not rows:
            return
        visits = [r[1] for r in rows]
        agrees = [r[2] for r in rows]
        terms = [r[3] for r in rows]
        out[(cur["extractor"], cur["threshold"])] = Cell(
            extractor=cur["extractor"],
            threshold=cur["threshold"],
            pos_rate_y2k=cur.get("pos_rate_y2k", float("nan")),
            pos_rate_cards=cur.get("pos_rate_cards", float("nan")),
            auc_within=cur.get("auc_within", float("nan")),
            auc_ood=cur.get("auc_ood", float("nan")),
            log_loss_within=cur.get("log_loss_within", float("nan")),
            log_loss_ood=cur.get("log_loss_ood", float("nan")),
            visits_min=min(visits), visits_max=max(visits),
            agree_min=min(agrees), agree_max=max(agrees),
            term_min=min(terms), term_max=max(terms),
        )

    with path.open() as f:
        for line in f:
            m = _RE_CELL.match(line)
            if m:
                flush()
                cur = {"extractor": m.group(1), "threshold": float(m.group(2))}
                rows = []
                continue
            if cur is None:
                continue
            m = _RE_POS.match(line)
            if m:
                cur["pos_rate_y2k"] = float(m.group(1))
                cur["pos_rate_cards"] = float(m.group(2))
                continue
            m = _RE_AUC.match(line)
            if m:
                cur["auc_within"] = float(m.group(1))
                cur["auc_ood"] = float(m.group(2))
                continue
            m = _RE_LL.match(line)
            if m:
                cur["log_loss_within"] = float(m.group(1))
                cur["log_loss_ood"] = float(m.group(2))
                continue
            m = _RE_ROW.match(line)
            if m:
                rows.append((float(m.group(1)), float(m.group(2)),
                             float(m.group(3)), float(m.group(4))))
    flush()
    return out


def fmt_delta(a: float, b: float, fmt: str = "{:+.4f}") -> str:
    if a != a or b != b:
        return "  n/a   "
    d = b - a
    sign = "+" if d > 0 else ("-" if d < 0 else " ")
    return f"{sign}{abs(d):.4f}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--v1", required=True, type=Path,
                    help="Baseline summary path (e.g. linear-V weighting)")
    ap.add_argument("--v2", required=True, type=Path,
                    help="Candidate summary path (e.g. log-V weighting)")
    args = ap.parse_args()
    a = parse_summary(args.v1)
    b = parse_summary(args.v2)
    keys = sorted(set(a.keys()) | set(b.keys()))
    print(f"v1 = {args.v1}")
    print(f"v2 = {args.v2}")
    print()
    header = (
        f"{'extractor':28s} {'τ':>5s}   "
        f"{'v1_pos':>7s} {'v2_pos':>7s}   "
        f"{'v1_auc_OOD':>10s} {'v2_auc_OOD':>10s} {'Δ_OOD':>9s}   "
        f"{'v1_auc_in':>10s} {'v2_auc_in':>10s} {'Δ_in':>9s}   "
        f"{'v1_visR':>14s} {'v2_visR':>14s}   "
        f"{'v1_agrR':>15s} {'v2_agrR':>15s}"
    )
    print(header)
    print("-" * len(header))

    auc_ood_deltas: list[float] = []
    pos_rate_deltas: list[float] = []
    for k in keys:
        ca = a.get(k)
        cb = b.get(k)
        ext, thr = k
        if ca is None or cb is None:
            print(f"{ext:28s} {thr:>5.2f}   MISSING in {'v1' if ca is None else 'v2'}")
            continue
        d_ood = cb.auc_ood - ca.auc_ood
        d_in = cb.auc_within - ca.auc_within
        d_pos = cb.pos_rate_y2k - ca.pos_rate_y2k
        auc_ood_deltas.append(d_ood)
        pos_rate_deltas.append(d_pos)
        print(
            f"{ext:28s} {thr:>5.2f}   "
            f"{ca.pos_rate_y2k:>7.3f} {cb.pos_rate_y2k:>7.3f}   "
            f"{ca.auc_ood:>+10.4f} {cb.auc_ood:>+10.4f} {fmt_delta(ca.auc_ood, cb.auc_ood):>9s}   "
            f"{ca.auc_within:>+10.4f} {cb.auc_within:>+10.4f} {fmt_delta(ca.auc_within, cb.auc_within):>9s}   "
            f"{ca.visits_min:5.0f}-{ca.visits_max:<5.0f}  {cb.visits_min:5.0f}-{cb.visits_max:<5.0f}   "
            f"{ca.agree_min:.3f}-{ca.agree_max:.3f}  {cb.agree_min:.3f}-{cb.agree_max:.3f}"
        )

    if auc_ood_deltas:
        n_up = sum(1 for d in auc_ood_deltas if d > 0)
        n_dn = sum(1 for d in auc_ood_deltas if d < 0)
        mean_d = sum(auc_ood_deltas) / len(auc_ood_deltas)
        worst_up = max(auc_ood_deltas)
        worst_dn = min(auc_ood_deltas)
        print()
        print(f"AUC OOD: mean Δ = {mean_d:+.4f}  best gain = {worst_up:+.4f}  "
              f"worst loss = {worst_dn:+.4f}  "
              f"cells improved = {n_up}/{len(auc_ood_deltas)}")
    if pos_rate_deltas:
        mean_d = sum(pos_rate_deltas) / len(pos_rate_deltas)
        worst_up = max(pos_rate_deltas)
        worst_dn = min(pos_rate_deltas)
        print(f"pos_rate_y2k: mean Δ = {mean_d:+.4f}  max = {worst_up:+.4f}  "
              f"min = {worst_dn:+.4f}")
        print(f"  (pos_rate near 0.5 = labels balanced → richer Pareto knob; "
              f"near 1.0 = label distribution collapsed)")


if __name__ == "__main__":
    main()
