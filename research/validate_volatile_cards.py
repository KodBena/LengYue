"""
research/validate_volatile_cards.py

Cards.db ground-truth validation for the visit-scaling research pipeline.

The user has annotated a set of "extremely volatile" positions in
backend/cards.db (tag id 2210). 5 of them have been confirmed as
canonical Hatsuyoron-level positions (the user has even beaten KataGo
on a derivative of one). If the research pipeline's discrimination
signal is real, these positions should sit at the "informative" end
of the (H, κ) distribution and should be predicted clean by the
cleanness classifier.

This script orchestrates the end-to-end validation:

  1. For each of N canonical-volatile SGFs in `~/volatile_sgfs/`,
     determine the position-to-analyze turn (LAST move of the SGF
     — `num_moves` in cards.db is the sparring length, not the
     position-move address; see project memory
     `project_cards_db_semantics`).
  2. Run `collect_trajectory.py` for each at that turn with
     `--n-realizations <N>` (default 3 to match a reasonable
     research-corpus sample size while staying within GPU budget).
  3. After collection, run `fit_averaged.py` for each (target,
     family) and capture (H, κ) per position.
  4. Compare against the research-corpus (H, κ) distribution
     (loaded from `summary_averaged.csv`), and against the
     cleanness-classifier output (loaded from the previous
     classifier run).
  5. Plot validation summary: scatter of research-corpus (H, κ)
     with the 5 volatile positions overlaid in red, per target.

Outputs to `~/plots/validate_volatile/`.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import FAMILIES  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_realizations, realization_as_flat_arrays,
)


def _count_sgf_moves(sgf_path: Path) -> int:
    """Count `;[BW][...]` move markers in the SGF text."""
    text = sgf_path.read_text()
    # sgf moves are `;B[xx]` or `;W[xx]` — passes too (`;B[]` or `;W[]`).
    return len(re.findall(r";[BW]\[[a-z]{0,2}\]", text))


def collect_for_sgf(
    sgf_path: Path,
    turn: int,
    n_realizations: int,
    max_visits: int,
    model: str,
    report_every: float,
    log_dir: Path,
) -> bool:
    """Invoke collect_trajectory.py as a subprocess so its WebSocket
    machinery stays isolated. Returns True on success."""
    log_path = log_dir / f"collect_{sgf_path.stem}.log"
    cmd = [
        "/home/bork/w/vdc/venvs/kataproxy/bin/python", "-u",
        str(Path(__file__).resolve().parent / "collect_trajectory.py"),
        "--sgf", str(sgf_path),
        "--turn", str(turn),
        "--max-visits", str(max_visits),
        "--report-every", str(report_every),
        "--n-realizations", str(n_realizations),
        "--model", model,
    ]
    print(f"  >>> {' '.join(cmd)}", flush=True)
    print(f"  log: {log_path}", flush=True)
    with log_path.open("w") as f:
        r = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        tail = log_path.read_text().splitlines()[-20:]
        print(f"  ✗ collect_trajectory exited {r.returncode}:", flush=True)
        for line in tail:
            print(f"      {line}", flush=True)
        return False
    print(f"  ✓ {sgf_path.stem} t={turn} n_realizations={n_realizations}",
          flush=True)
    return True


def fit_position(
    conn,
    stem: str,
    turn: int,
    families: list,
    n_realizations: int,
) -> dict:
    """For one (stem, turn), pull all collected realizations from
    Postgres, average trajectories per target, fit each family."""
    real_idxs = list_realizations(conn, stem, turn)
    realizations = []
    for ri in real_idxs:
        arrs = realization_as_flat_arrays(conn, stem, turn, ri)
        if arrs is not None:
            realizations.append(arrs)
    if not realizations:
        return {"error": "no realizations in Postgres"}

    fits = {}
    for tname, value_fn in VALUE_CANDIDATES.items():
        avg = averaged_trajectory_for_target(realizations, value_fn)
        for family in families:
            key = (tname, family.name)
            if avg is None:
                fits[key] = {"status": "no_trajectory", "params": {}}
                continue
            V_g, y_g = avg
            fit = family.fit(V_g.astype(np.float64), y_g.astype(np.float64))
            fits[key] = {
                "status": fit.status,
                "params": dict(fit.params),
                "rel_resid_std": fit.rel_resid_std,
            }
    return {
        "n_realizations": len(realizations),
        "fits": fits,
    }


def load_corpus_hk(labels_csv: Path, family_name: str = "hyperbolic"):
    """Quick reader for (H, κ) from the research-corpus averaged CSV.
    Returns dict {target: list_of_(H, kappa)}."""
    import csv
    by_target = {}
    with labels_csv.open() as f:
        for row in csv.DictReader(f):
            if row.get("family") != family_name:
                continue
            if row.get("status") != "clean":
                continue
            t = row["target"]
            try:
                params = json.loads(row.get("params_json") or "{}")
            except Exception:
                continue
            H = params.get("H")
            kappa = params.get("kappa")
            if H is None or kappa is None:
                continue
            if not (np.isfinite(H) and np.isfinite(kappa) and kappa > 0):
                continue
            by_target.setdefault(t, []).append((float(H), float(kappa)))
    return by_target


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sgf-dir", default=Path.home() / "volatile_sgfs",
                    type=Path)
    ap.add_argument("--n-realizations", default=3, type=int,
                    help="Realizations per position (default 3 — "
                         "lower than research-corpus's 10 for GPU budget)")
    ap.add_argument("--max-visits", default=15000, type=int,
                    help="Match research-corpus default (run_batch.py default)")
    ap.add_argument("--report-every", default=0.02, type=float,
                    help="Match research-corpus default (run_batch.py default)")
    ap.add_argument("--model", default="b10c128",
                    help="SELECTOR model label (default matches research "
                         "corpus). Use query_models on the proxy to list.")
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path,
                    help="Research-corpus averaged CSV (for distribution "
                         "overlay)")
    ap.add_argument("--plot-dir",
                    default=Path.home() / "plots" / "validate_volatile",
                    type=Path)
    ap.add_argument("--collect-log-dir",
                    default=Path.home() / "plots" / "validate_volatile" / "logs",
                    type=Path)
    ap.add_argument("--skip-collect", action="store_true",
                    help="Skip collection (use existing Postgres rows)")
    ap.add_argument("--families", nargs="+",
                    default=["hyperbolic"])
    args = ap.parse_args()

    args.plot_dir.mkdir(parents=True, exist_ok=True)
    args.collect_log_dir.mkdir(parents=True, exist_ok=True)

    sgfs = sorted(args.sgf_dir.glob("*.sgf"))
    if not sgfs:
        sys.exit(f"no SGFs found in {args.sgf_dir}")
    families = [FAMILIES[fn] for fn in args.families]

    # Map each SGF to (stem, last-move-turn).
    sgf_meta: list[tuple[Path, str, int]] = []
    for f in sgfs:
        n_moves = _count_sgf_moves(f)
        sgf_meta.append((f, f.stem, n_moves))
        print(f"  {f.stem}: {n_moves} moves (turn={n_moves} → last-move pos)",
              flush=True)

    if not args.skip_collect:
        t0 = time.monotonic()
        print(f"\n=== collecting {len(sgf_meta)} positions × "
              f"{args.n_realizations} realizations × "
              f"{args.max_visits} visits ===", flush=True)
        for i, (sgf, stem, turn) in enumerate(sgf_meta):
            print(f"\n[{i+1}/{len(sgf_meta)}] {stem} (turn={turn})",
                  flush=True)
            ok = collect_for_sgf(
                sgf_path=sgf, turn=turn,
                n_realizations=args.n_realizations,
                max_visits=args.max_visits,
                model=args.model,
                report_every=args.report_every,
                log_dir=args.collect_log_dir,
            )
            if not ok:
                print(f"  ⚠ collection failed for {stem}; continuing",
                      flush=True)
            elapsed = time.monotonic() - t0
            done = i + 1
            eta = elapsed / done * (len(sgf_meta) - done)
            print(f"  elapsed {elapsed:.0f}s  eta {eta:.0f}s", flush=True)
        print(f"\n=== collection done in {time.monotonic()-t0:.0f}s ===",
              flush=True)
    else:
        print(f"=== --skip-collect: using existing Postgres rows ===",
              flush=True)

    # ── Fit each volatile position ──────────────────────────────────────────
    print(f"\n=== fitting collected positions ===", flush=True)
    conn = connect()
    fits: dict[str, dict] = {}
    for sgf, stem, turn in sgf_meta:
        print(f"\n  fitting {stem} (turn={turn})", flush=True)
        r = fit_position(
            conn, stem=stem, turn=turn, families=families,
            n_realizations=args.n_realizations,
        )
        if "error" in r:
            print(f"    SKIPPED: {r['error']}", flush=True)
            fits[stem] = None
            continue
        print(f"    n_realizations_found={r['n_realizations']}", flush=True)
        for (tname, fname), info in r["fits"].items():
            if info["status"] == "clean":
                p = info["params"]
                kv = " ".join(f"{k}={v:+.4g}" for k, v in p.items())
                rrs = info.get("rel_resid_std", float("nan"))
                print(f"    {tname:<28} {fname:<28} {info['status']:<10} "
                      f"rrs={rrs:.3f}  {kv}", flush=True)
            else:
                print(f"    {tname:<28} {fname:<28} {info['status']:<10}",
                      flush=True)
        fits[stem] = r
    conn.close()

    # ── Plot: (H, κ) scatter with volatile positions overlaid ──────────────
    if args.labels_csv.exists():
        corpus = load_corpus_hk(args.labels_csv, "hyperbolic")
        targets = sorted(corpus.keys())
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle(
            f"(H, κ) — research corpus vs {len(fits)} canonical-volatile cards\n"
            f"hyperbolic family;  "
            f"{args.n_realizations} realizations per volatile position; "
            f"max_visits={args.max_visits}, model={args.model}",
        )
        volatile_color = "red"
        for ax, t in zip(axes.flat, targets):
            pts = corpus[t]
            Hc = np.array([p[0] for p in pts])
            Kc = np.array([p[1] for p in pts])
            lKc = np.log10(Kc)
            ax.scatter(Hc, lKc, s=12, alpha=0.30, color="steelblue",
                       label=f"corpus n={len(Hc)}")
            for stem, r in fits.items():
                if r is None:
                    continue
                info = r["fits"].get((t, "hyperbolic"))
                if info is None or info["status"] != "clean":
                    continue
                p = info["params"]
                H_v = p.get("H")
                K_v = p.get("kappa")
                if (H_v is None or K_v is None or
                        not (np.isfinite(H_v) and np.isfinite(K_v) and K_v > 0)):
                    continue
                ax.scatter(H_v, np.log10(K_v), s=110, color=volatile_color,
                           edgecolor="black", linewidth=0.8, zorder=5,
                           label=None)
                short = stem.replace("card_", "").split("_")[0]
                ax.annotate(short, (H_v, np.log10(K_v)),
                            xytext=(5, 5), textcoords="offset points",
                            fontsize=8, color=volatile_color)
            ax.set_xlabel("H")
            ax.set_ylabel("log10 κ")
            ax.set_title(f"{t}  (red = canonical volatile)")
            ax.grid(alpha=0.3)
            ax.legend(loc="best", fontsize=8)
        fig.tight_layout()
        out_plot = args.plot_dir / "validate_volatile_hk_scatter.png"
        fig.savefig(out_plot, dpi=110)
        plt.close(fig)
        print(f"\nscatter: {out_plot}", flush=True)

    # Summary text
    summary_lines = [
        f"# validate_volatile_cards.py — {len(fits)} positions",
        f"# n_realizations={args.n_realizations} max_visits={args.max_visits} model={args.model}",
        "",
    ]
    for stem, r in fits.items():
        summary_lines.append(f"## {stem}")
        if r is None:
            summary_lines.append("  (no data)")
            continue
        for (tname, fname), info in r["fits"].items():
            if info["status"] != "clean":
                summary_lines.append(
                    f"  {tname:<28} {fname:<28} {info['status']}"
                )
                continue
            p = info["params"]
            kv = " ".join(f"{k}={v:+.4g}" for k, v in p.items())
            rrs = info.get("rel_resid_std", float("nan"))
            summary_lines.append(
                f"  {tname:<28} {fname:<28} clean  rrs={rrs:.3f}  {kv}"
            )
        summary_lines.append("")
    summary_txt = "\n".join(summary_lines)
    (args.plot_dir / "validate_volatile_summary.txt").write_text(summary_txt + "\n")
    print()
    print(summary_txt)
    print(f"\nsummary: {args.plot_dir / 'validate_volatile_summary.txt'}",
          flush=True)


if __name__ == "__main__":
    main()
