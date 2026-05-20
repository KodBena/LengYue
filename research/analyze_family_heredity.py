"""
research/analyze_family_heredity.py

Hereditary signal analysis for the cards.db family validation set:
5 canonical-volatile SEEDS (1429, 2893, 2935, 3197, 3534) + 13
family relatives (4 parents, 5 siblings, 4 descendants).

For each (target, family) the hyperbolic-fit (H, κ) is read from
Postgres and plotted on the same scatter, colored by:
  - Family group (= the seed's parent_id, so same-parent cards
    share a color — siblings of one seed share a color)
  - Tier (parent / seed / sibling / descendant — different
    markers)
  - Volatile-tag status (filled vs hollow)

Then computes hereditary statistics:
  - Within-family (same parent_id) σ in (H, log κ)
  - Across-family σ
  - If within < across, heredity holds.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import json
import sys
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


# Card metadata: id → (tier, parent_id, vol_tag)
# 'seed', 'parent', 'sibling', 'descendant'
CARD_META = {
    # Seeds (5)
    1429: {"tier": "seed", "parent": 1343, "vol": True, "stem": "card_1429_spar7_r1"},
    2893: {"tier": "seed", "parent": 1429, "vol": True, "stem": "card_2893_spar8_r1"},
    2935: {"tier": "seed", "parent": 2777, "vol": True, "stem": "card_2935_spar9_r1"},
    3197: {"tier": "seed", "parent": 1408, "vol": True, "stem": "card_3197_spar5_r1"},
    3534: {"tier": "seed", "parent":  702, "vol": True, "stem": "card_3534_spar6_r1"},
    # Parents (4)
    1343: {"tier": "parent", "parent": None, "vol": False, "stem": "card_1343_spar7_r1"},
    1408: {"tier": "parent", "parent": None, "vol": False, "stem": "card_1408_spar5_r1"},
    2777: {"tier": "parent", "parent": None, "vol": False, "stem": "card_2777_spar7_r2"},
     702: {"tier": "parent", "parent": None, "vol": False, "stem":  "card_702_spar6_r1"},
    # Siblings (5)
    1424: {"tier": "sibling", "parent": 1343, "vol": True,  "stem": "card_1424_spar7_r0"},
    2886: {"tier": "sibling", "parent": 1429, "vol": True,  "stem": "card_2886_spar8_r0"},
    2930: {"tier": "sibling", "parent": 2777, "vol": False, "stem": "card_2930_spar9_r0"},
    3198: {"tier": "sibling", "parent": 1408, "vol": True,  "stem": "card_3198_spar5_r0"},
    3532: {"tier": "sibling", "parent":  702, "vol": True,  "stem": "card_3532_spar6_r0"},
    # Descendants (4)
    2887: {"tier": "descendant", "parent": 1429, "vol": True,  "stem": "card_2887_spar8_r0"},
    4873: {"tier": "descendant", "parent": 3197, "vol": True,  "stem": "card_4873_spar7_r0"},
    3839: {"tier": "descendant", "parent": 3534, "vol": True,  "stem": "card_3839_spar6_r0"},
    4889: {"tier": "descendant", "parent": 2935, "vol": False, "stem": "card_4889_spar7_r0"},
}

TIER_MARKERS = {
    "seed":       ("*", 220),
    "parent":     ("s", 110),
    "sibling":    ("o", 100),
    "descendant": ("^", 110),
}

# Family group color = the parent_id (so same parent → same color)
# Parents themselves use their own card_id (so they're their own group)
def _family_group_id(card_id: int) -> int:
    meta = CARD_META[card_id]
    if meta["tier"] == "parent":
        return card_id
    return meta["parent"] or card_id


def fit_position(conn, stem: str, n_moves: int, families: list) -> dict:
    real_idxs = list_realizations(conn, stem, n_moves)
    realizations = []
    for ri in real_idxs:
        arrs = realization_as_flat_arrays(conn, stem, n_moves, ri)
        if arrs is not None:
            realizations.append(arrs)
    if not realizations:
        return {"error": "no realizations in Postgres", "n_real": 0}
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
            fits[key] = {"status": fit.status,
                          "params": dict(fit.params),
                          "rel_resid_std": fit.rel_resid_std}
    return {"n_real": len(realizations), "fits": fits}


def _count_moves(sgf_path: Path) -> int:
    import re
    return len(re.findall(r";[BW]\[[a-z]{0,2}\]", sgf_path.read_text()))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed-sgf-dir", default=Path.home() / "volatile_sgfs",
                    type=Path)
    ap.add_argument("--family-sgf-dir",
                    default=Path.home() / "volatile_sgfs_family", type=Path)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "validate_volatile_family",
                    type=Path)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    families = [FAMILIES["hyperbolic"]]
    conn = connect()

    # Build (stem, n_moves) for each card
    stem_to_card: dict[str, int] = {}
    for cid, meta in CARD_META.items():
        stem_to_card[meta["stem"]] = cid

    fits_by_card: dict[int, dict] = {}
    for cid, meta in CARD_META.items():
        stem = meta["stem"]
        # SGF lives in one of two dirs
        sgf_path = args.seed_sgf_dir / f"{stem}.sgf"
        if not sgf_path.exists():
            sgf_path = args.family_sgf_dir / f"{stem}.sgf"
        if not sgf_path.exists():
            print(f"  ✗ no SGF for card {cid} (stem={stem})", flush=True)
            continue
        n_moves = _count_moves(sgf_path)
        r = fit_position(conn, stem=stem, n_moves=n_moves, families=families)
        fits_by_card[cid] = r
        if "error" in r:
            print(f"  ✗ card {cid:>5} ({meta['tier']:<10}): {r['error']}",
                  flush=True)
            continue
        clean_count = sum(1 for v in r["fits"].values() if v["status"] == "clean")
        print(f"  ✓ card {cid:>5} ({meta['tier']:<10}, "
              f"vol={meta['vol']!s:<5}, parent={meta['parent']}): "
              f"{clean_count}/4 clean across targets, "
              f"n_real={r['n_real']}", flush=True)
    conn.close()

    # Load research-corpus (H, κ) for backdrop
    import csv
    corpus_by_target: dict[str, list] = {}
    if args.labels_csv.exists():
        with args.labels_csv.open() as f:
            for row in csv.DictReader(f):
                if row["family"] != "hyperbolic" or row["status"] != "clean":
                    continue
                try:
                    p = json.loads(row["params_json"])
                except Exception:
                    continue
                H, k = p.get("H"), p.get("kappa")
                if H is None or k is None or not np.isfinite(H) or k <= 0:
                    continue
                corpus_by_target.setdefault(row["target"], []).append(
                    (float(H), float(k))
                )

    # Assign a color per family group
    group_ids = sorted({_family_group_id(c) for c in CARD_META})
    cmap = matplotlib.colormaps.get_cmap("tab10")
    group_color = {g: cmap(i % 10) for i, g in enumerate(group_ids)}

    targets = ["L2_joint_drift", "scoreLead_drift",
               "visit_entropy_reduction", "winrate_drift"]
    fig, axes = plt.subplots(2, 2, figsize=(15, 11))
    fig.suptitle(
        f"(H, κ) family scatter — seeds + parents/siblings/descendants\n"
        f"hyperbolic family;  n_realizations=10;  "
        f"shape = tier  |  color = family group (= parent_id)  "
        f"|  filled = volatile-tagged  |  hollow = non-volatile",
        fontsize=10,
    )
    for ax, tname in zip(axes.flat, targets):
        # Corpus backdrop
        pts = corpus_by_target.get(tname, [])
        if pts:
            Hc = np.array([p[0] for p in pts])
            Kc = np.array([p[1] for p in pts])
            ax.scatter(Hc, np.log10(Kc), s=10, alpha=0.25, color="lightgray",
                       label=f"corpus n={len(Hc)}")
        # Family cards
        for cid, meta in CARD_META.items():
            r = fits_by_card.get(cid)
            if r is None or "error" in r:
                continue
            info = r["fits"].get((tname, "hyperbolic"))
            if info is None or info["status"] != "clean":
                continue
            p = info["params"]
            H, k = p.get("H"), p.get("kappa")
            if H is None or k is None or not (np.isfinite(H) and np.isfinite(k) and k > 0):
                continue
            marker, size = TIER_MARKERS[meta["tier"]]
            color = group_color[_family_group_id(cid)]
            face = color if meta["vol"] else "white"
            ax.scatter(H, np.log10(k), s=size, marker=marker,
                       facecolor=face, edgecolor=color, linewidth=1.4,
                       zorder=5)
            ax.annotate(str(cid), (H, np.log10(k)),
                        xytext=(4, 4), textcoords="offset points",
                        fontsize=7, color="black", alpha=0.7)
        ax.set_xlabel("H")
        ax.set_ylabel("log10 κ")
        ax.set_title(tname)
        ax.grid(alpha=0.3)
    fig.tight_layout()
    out_plot = args.out_dir / "family_hk_scatter.png"
    fig.savefig(out_plot, dpi=110)
    plt.close(fig)
    print(f"\nscatter: {out_plot}", flush=True)

    # ── Heredity stats ───────────────────────────────────────────────────────
    print(f"\n=== heredity stats (within-family vs across-family σ) ===",
          flush=True)
    summary_lines: list[str] = [
        f"# family hereditary signal stats",
        f"# 5 seeds + 13 family relatives = 18 cards total",
        "",
    ]
    for tname in targets:
        within_devs: list[float] = []
        across_pts: list[tuple[float, float]] = []
        # Group by family_group
        by_group: dict[int, list[tuple[float, float]]] = {}
        for cid, meta in CARD_META.items():
            r = fits_by_card.get(cid)
            if r is None or "error" in r:
                continue
            info = r["fits"].get((tname, "hyperbolic"))
            if info is None or info["status"] != "clean":
                continue
            p = info["params"]
            H, k = p.get("H"), p.get("kappa")
            if H is None or k is None or not (np.isfinite(H) and np.isfinite(k) and k > 0):
                continue
            pt = (float(H), float(np.log10(k)))
            by_group.setdefault(_family_group_id(cid), []).append(pt)
            across_pts.append(pt)
        # Within-group σ: mean σ across groups with ≥2 members
        for g, pts in by_group.items():
            if len(pts) < 2:
                continue
            arr = np.array(pts)
            within_devs.append(float(arr.std(axis=0).mean()))
        # Across σ: σ of all points, regardless of group
        if len(across_pts) < 2:
            line = f"  {tname:<28} insufficient data"
            print(line, flush=True)
            summary_lines.append(line)
            continue
        all_arr = np.array(across_pts)
        across_std = float(all_arr.std(axis=0).mean())
        within_mean = float(np.mean(within_devs)) if within_devs else float("nan")
        ratio = within_mean / across_std if across_std > 0 else float("nan")
        line = (
            f"  {tname:<28} n_clean={len(across_pts):>2}  "
            f"n_groups_2plus={sum(1 for g in by_group.values() if len(g) >= 2):>2}  "
            f"within-σ={within_mean:>6.3f}  across-σ={across_std:>6.3f}  "
            f"ratio={ratio:.3f}  "
            f"{'(heredity: within < across)' if ratio < 1 else '(no heredity)'}"
        )
        print(line, flush=True)
        summary_lines.append(line)

    out_txt = args.out_dir / "family_heredity_summary.txt"
    out_txt.write_text("\n".join(summary_lines) + "\n")
    print(f"\nsummary: {out_txt}", flush=True)


if __name__ == "__main__":
    main()
