"""
research/sweep_f_max.py

Sweep allocator_sim_per_packet at multiple f_max values and aggregate
the per-extractor AUC + Pareto-frontier endpoints for cross-budget
comparison.

For each f_max value, runs the per-packet pipeline end-to-end (Phase
A re-fetches if its per-f_max cache is empty), then parses the
resulting summary file and emits a wide comparison table.

This tests the budget-fraction reframe's core claim: a classifier
trained with labels relative to a smaller V_max_query should still
extract meaningful operating points, just with the Pareto curve
compressed to a smaller absolute V range.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np


_RE_CELL = re.compile(r"^# extractor=(\S+)\s+threshold=([0-9.]+)")
_RE_AUC = re.compile(r"^\s*AUC: within=([+-][0-9.]+)\s+OOD=([+-][0-9.]+)")
_RE_POS = re.compile(r"^\s*pos_rate_y2k=([0-9.]+)\s+pos_rate_cards=([0-9.]+)")
_RE_ROW = re.compile(
    r"^\s+([0-9.-]+)\s+([0-9]+)\s+([+-][0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)"
)
_RE_PARETO_HEADER = re.compile(r"^\s*-- Pareto frontier")


@dataclass
class Cell:
    f_max: float
    extractor: str
    threshold: float
    pos_rate_y2k: float
    pos_rate_cards: float
    auc_within: float
    auc_ood: float
    raw_curve: list[tuple[float, float, float, float, float]]      # (tau, V, agree, term%, stop_k)
    pareto_curve: list[tuple[float, float, float, float, float]]   # subset
    v_at_min_tau: float
    v_at_max_tau: float
    agree_at_min_tau: float
    agree_at_max_tau: float


def parse_summary(path: Path, f_max: float) -> list[Cell]:
    """Parse a summary_per_packet.txt produced by allocator_sim_per_packet.py."""
    cells: list[Cell] = []
    cur_header: dict | None = None
    in_pareto = False
    raw_rows: list[tuple[float, float, float, float, float]] = []
    pareto_rows: list[tuple[float, float, float, float, float]] = []

    def flush():
        if cur_header is None:
            return
        rows_curve = raw_rows if raw_rows else []
        rows_pareto = pareto_rows if pareto_rows else []
        if not rows_curve:
            return
        cells.append(Cell(
            f_max=f_max,
            extractor=cur_header["extractor"],
            threshold=cur_header["threshold"],
            pos_rate_y2k=cur_header.get("pos_rate_y2k", float("nan")),
            pos_rate_cards=cur_header.get("pos_rate_cards", float("nan")),
            auc_within=cur_header.get("auc_within", float("nan")),
            auc_ood=cur_header.get("auc_ood", float("nan")),
            raw_curve=rows_curve,
            pareto_curve=rows_pareto,
            v_at_min_tau=rows_curve[0][1],
            v_at_max_tau=rows_curve[-1][1],
            agree_at_min_tau=rows_curve[0][2],
            agree_at_max_tau=rows_curve[-1][2],
        ))

    with path.open() as f:
        for line in f:
            m_cell = _RE_CELL.match(line)
            if m_cell:
                flush()
                cur_header = {
                    "extractor": m_cell.group(1),
                    "threshold": float(m_cell.group(2)),
                }
                raw_rows = []
                pareto_rows = []
                in_pareto = False
                continue
            if cur_header is None:
                continue
            if _RE_PARETO_HEADER.match(line):
                in_pareto = True
                continue
            m_pos = _RE_POS.match(line)
            if m_pos:
                cur_header["pos_rate_y2k"] = float(m_pos.group(1))
                cur_header["pos_rate_cards"] = float(m_pos.group(2))
                continue
            m_auc = _RE_AUC.match(line)
            if m_auc:
                cur_header["auc_within"] = float(m_auc.group(1))
                cur_header["auc_ood"] = float(m_auc.group(2))
                continue
            m_row = _RE_ROW.match(line)
            if m_row:
                row = (float(m_row.group(1)), float(m_row.group(2)),
                       float(m_row.group(3)), float(m_row.group(4)),
                       float(m_row.group(5)))
                if in_pareto:
                    pareto_rows.append(row)
                else:
                    raw_rows.append(row)
    flush()
    return cells


def run_one(f_max: float, args, out_root: Path) -> Path:
    """Run allocator_sim_per_packet.py for one f_max value. Returns the
    summary file path."""
    out_dir = out_root / f"per_packet_f_max_{f_max:.3f}"
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        str(Path(__file__).resolve().parent / "allocator_sim_per_packet.py"),
        "--f-max", f"{f_max:.4f}",
        "--out-dir", str(out_dir),
        "--workers", str(args.workers),
        "--batch-size", str(args.batch_size),
    ]
    if args.thresholds:
        cmd.extend(["--thresholds"] + [str(t) for t in args.thresholds])
    if args.extractors:
        cmd.extend(["--extractors"] + args.extractors)
    log_path = out_dir / "run.log"
    print(f"\n>>> running f_max={f_max:.3f} → {out_dir}", flush=True)
    t0 = time.monotonic()
    with log_path.open("w") as logf:
        result = subprocess.run(cmd, stdout=logf, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        print(f"  FAILED with code {result.returncode}; see {log_path}",
              flush=True)
        # Print last 30 lines of log for diagnostics
        with log_path.open() as f:
            tail = f.readlines()[-30:]
        for line in tail:
            print(f"    {line.rstrip()}", flush=True)
        raise RuntimeError(f"per-packet run failed at f_max={f_max:.3f}")
    print(f"  done in {time.monotonic()-t0:.1f}s", flush=True)
    return out_dir / "summary_per_packet.txt"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--f-max-values", nargs="+", type=float,
        default=[0.5, 0.7, 0.85, 1.0],
        help="f_max values to sweep (default: 0.5 0.7 0.85 1.0)",
    )
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument(
        "--out-root",
        default=Path.home() / "plots" / "allocator_pareto_f_max_sweep",
        type=Path,
    )
    ap.add_argument("--extractors", nargs="+", default=None)
    ap.add_argument(
        "--thresholds", nargs="+", type=float,
        default=[0.90, 0.95, 0.97, 0.99],
        help="Label thresholds (default: 0.90 0.95 0.97 0.99 — narrower "
             "than the per-packet default to keep the sweep tractable)",
    )
    args = ap.parse_args()
    args.out_root.mkdir(parents=True, exist_ok=True)

    print("=== f_max sweep ===", flush=True)
    print(f"  f_max_values: {args.f_max_values}", flush=True)
    print(f"  extractors: {args.extractors or 'all'}", flush=True)
    print(f"  thresholds: {args.thresholds}", flush=True)
    print(f"  out_root: {args.out_root}", flush=True)

    summary_paths: dict[float, Path] = {}
    for f_max in args.f_max_values:
        path = run_one(f_max, args, args.out_root)
        summary_paths[f_max] = path

    # Parse all summaries
    all_cells: list[Cell] = []
    for f_max, path in summary_paths.items():
        all_cells.extend(parse_summary(path, f_max))

    # Build a per-(extractor, threshold) × f_max table for AUC OOD
    extractors = sorted({c.extractor for c in all_cells})
    thresholds = sorted({c.threshold for c in all_cells})
    f_maxes = sorted({c.f_max for c in all_cells})
    by_key: dict[tuple[str, float, float], Cell] = {
        (c.extractor, c.threshold, c.f_max): c for c in all_cells
    }

    report_path = args.out_root / "f_max_sweep_summary.txt"
    with report_path.open("w") as f:
        f.write("# f_max sweep — per-packet allocator\n")
        f.write(f"# f_max values: {f_maxes}\n")
        f.write(f"# extractors:   {extractors}\n")
        f.write(f"# thresholds:   {thresholds}\n\n")

        f.write("## AUC OOD per (extractor, threshold, f_max)\n\n")
        for ext in extractors:
            f.write(f"### {ext}\n")
            header = f"{'threshold':>10s}  " + "  ".join(
                f"f_max={fm:.2f}" for fm in f_maxes
            )
            f.write(header + "\n")
            for thr in thresholds:
                row = f"{thr:>10.2f}  "
                for fm in f_maxes:
                    c = by_key.get((ext, thr, fm))
                    row += f"  {c.auc_ood:>+10.4f}" if c else f"  {'n/a':>10s}"
                f.write(row + "\n")
            f.write("\n")

        f.write("## pos_rate_y2k per (extractor, threshold, f_max)\n\n")
        for ext in extractors:
            f.write(f"### {ext}\n")
            header = f"{'threshold':>10s}  " + "  ".join(
                f"f_max={fm:.2f}" for fm in f_maxes
            )
            f.write(header + "\n")
            for thr in thresholds:
                row = f"{thr:>10.2f}  "
                for fm in f_maxes:
                    c = by_key.get((ext, thr, fm))
                    row += f"  {c.pos_rate_y2k:>10.3f}" if c else f"  {'n/a':>10s}"
                f.write(row + "\n")
            f.write("\n")

        f.write("## Pareto curve endpoints per (extractor, threshold, f_max)\n\n")
        f.write("# Format: (v_at_min_tau, agree_at_min_tau) → (v_at_max_tau, agree_at_max_tau)\n\n")
        for ext in extractors:
            for thr in thresholds:
                f.write(f"### {ext}  threshold={thr:.2f}\n")
                for fm in f_maxes:
                    c = by_key.get((ext, thr, fm))
                    if c is None:
                        continue
                    f.write(f"  f_max={fm:.2f}: "
                            f"({c.v_at_min_tau:>5.0f}, {c.agree_at_min_tau:.4f}) "
                            f"→ ({c.v_at_max_tau:>5.0f}, {c.agree_at_max_tau:.4f})  "
                            f"n_pareto={len(c.pareto_curve):2d}\n")
                f.write("\n")

    print(f"\nf_max sweep summary: {report_path}", flush=True)

    # Quick stdout table for at-a-glance
    print("\n## AUC OOD at threshold=0.95 (most operationally relevant)", flush=True)
    print(f"{'extractor':<30s}  " + "  ".join(
        f"f_max={fm:.2f}" for fm in f_maxes
    ), flush=True)
    for ext in extractors:
        row = f"{ext:<30s}  "
        for fm in f_maxes:
            c = by_key.get((ext, 0.95, fm))
            row += f"  {c.auc_ood:>+10.4f}" if c else f"  {'n/a':>10s}"
        print(row, flush=True)


if __name__ == "__main__":
    main()
