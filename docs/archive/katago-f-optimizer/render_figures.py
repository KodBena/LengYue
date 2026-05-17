#!/usr/bin/env python3
"""
render_figures.py

Regenerates the six PNG figures embedded in the retrospective from
the data in this directory. Source for `../../notes/images/katago-f-optimizer/fig{1..6}.png`.

Usage from the archive directory:

    $VENV render_figures.py [--out OUTPUT_DIR]

Dependencies: numpy, scipy, matplotlib. (The plotly service at
`parameter_sweep.py` is the LIVE-dashboard side; this script is the
STATIC-figure side, written separately so the retrospective's PNGs
don't depend on a running plotly server. Both renderings consume the
same source data.)

Inputs (all in this directory):
  sweep_results/sweep_results.csv.gz   — 15800-trial sweep
  f_star_sweep.csv                     — optimizer per-(model, cadence) results
  repro_output.txt                     — stdio reproducer output

Outputs (default to ../../notes/images/katago-f-optimizer/):
  fig1-cliff-across-models.png
  fig2-true-floor-baselines.png
  fig3-slope-1-bug-signature.png
  fig4-strip-flip-bimodality.png
  fig5-f-star-vs-cadence.png
  fig6-visits-at-first-packet.png

License: Public Domain (The Unlicense).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import os
import re
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent

MODELS = ['b10c128', 'b18c384nbt', 'b28c512nbt', 'fdx6d']
COLORS = {
    'b10c128':    '#1f77b4',
    'b18c384nbt': '#ff7f0e',
    'b28c512nbt': '#2ca02c',
    'fdx6d':      '#d62728',
}


def load_sweep_rows() -> list[dict]:
    """Load and normalise the gzipped sweep CSV."""
    csv_gz = HERE / 'sweep_results' / 'sweep_results.csv.gz'
    rows: list[dict] = []
    with gzip.open(csv_gz, 'rt') as f:
        for r in csv.DictReader(f):
            try:
                mv = int(r.get('max_visits') or '2000000')
                if r['dt_ms'] in ('', 'None'):
                    if not (r.get('error') and mv == 0):
                        continue
                elif r.get('error') and mv != 0:
                    continue
                rows.append({
                    'model': r['model'],
                    'c': float(r['cadence_s']),
                    'f': float(r['first_report_s']),
                    'mv': mv,
                    'dt': (float(r['dt_ms'])
                           if r['dt_ms'] not in ('', 'None') else None),
                })
            except (KeyError, ValueError):
                pass
    return rows


def cells_full(rows, model: str, cadence: float):
    """Per-F median dt for full-search cells of (model, cadence)."""
    per_f = defaultdict(list)
    for r in rows:
        if (r['mv'] != 2_000_000 or r['model'] != model
                or r['c'] != cadence or r['f'] <= 0 or r['dt'] is None):
            continue
        per_f[r['f']].append(r['dt'])
    fs = sorted(per_f.keys())
    return fs, [np.median(per_f[f]) for f in fs], [per_f[f] for f in fs]


def render_fig1(rows, out: Path) -> None:
    """Figure 1: dt vs F across models at cadence=250ms."""
    cadence = 0.250
    fig, ax = plt.subplots(figsize=(8, 5))
    for model in MODELS:
        fs, meds, _ = cells_full(rows, model, cadence)
        if not fs:
            continue
        ax.plot(np.array(fs) * 1000, meds, 'o-', color=COLORS[model],
                label=model, markersize=4, linewidth=1.4)
    ax.axvline(cadence * 1000, color='gray', linestyle=':', linewidth=0.8,
               label=f'F = cadence ({cadence*1000:.0f} ms)')
    ax.set_xlabel('firstReportDuringSearchAfter F (ms)')
    ax.set_ylabel('First-response latency (ms, median of ~50 trials)')
    ax.set_title(f'dt vs F at cadence = {cadence*1000:.0f} ms — the '
                 f'cliff position\ndepends strongly on model', fontsize=11)
    ax.set_xscale('log')
    ax.grid(True, which='both', linestyle=':', alpha=0.4)
    ax.legend(loc='lower right', fontsize=9)
    plt.tight_layout()
    plt.savefig(out / 'fig1-cliff-across-models.png', dpi=120)
    plt.close()


def render_fig2(rows, out: Path) -> None:
    """Figure 2: per-model floor — v∈{0,1,32,64} baselines."""
    baselines = defaultdict(lambda: defaultdict(list))
    for r in rows:
        if r['mv'] in (0, 1, 32, 64) and r['dt'] is not None:
            baselines[r['model']][r['mv']].append(r['dt'])

    mv_values = [0, 1, 32, 64]
    labels = ['v=0\n(wire RTT)', 'v=1\n(single eval)',
              'v=32\n(one batch)', 'v=64\n(two batches)']
    x = np.arange(len(mv_values))
    width = 0.2

    fig, ax = plt.subplots(figsize=(9, 5))
    for i, model in enumerate(MODELS):
        medians = [np.median(baselines[model].get(mv, [np.nan]))
                   for mv in mv_values]
        ax.bar(x + (i - 1.5) * width, medians, width,
               color=COLORS[model], label=model)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel('Latency (ms, median)')
    ax.set_title('True-floor baselines per model — v=0 essentially uniform; '
                 'v=1 scales with model;\nv=64 − v=32 isolates one batched '
                 'forward-pass cost', fontsize=11)
    ax.set_yscale('log')
    ax.grid(True, axis='y', linestyle=':', alpha=0.4)
    ax.legend(loc='upper left', fontsize=9)
    plt.tight_layout()
    plt.savefig(out / 'fig2-true-floor-baselines.png', dpi=120)
    plt.close()


def render_fig3(rows, out: Path) -> None:
    """Figure 3: slope=1 regression at b18c384nbt C=0.250 F∈[1,30]."""
    model = 'b18c384nbt'
    c = 0.250
    per_f = defaultdict(list)
    for r in rows:
        if (r['mv'] != 2_000_000 or r['model'] != model or r['c'] != c
                or r['f'] <= 0 or r['f'] > 0.030 or r['dt'] is None):
            continue
        per_f[r['f']].append(r['dt'])

    xs, ys = [], []
    for f in sorted(per_f.keys()):
        for v in per_f[f]:
            xs.append(f * 1000)
            ys.append(v)
    xs_a = np.array(xs)
    ys_a = np.array(ys)
    lr = stats.linregress(xs_a, ys_a)

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.scatter(xs, ys, s=10, color=COLORS[model], alpha=0.3, label='trials')
    xfit = np.linspace(min(xs), max(xs), 50)
    ax.plot(xfit, lr.intercept + lr.slope * xfit, 'k-', linewidth=1.5,
            label=f'fit: dt = {lr.slope:.3f}·F + {lr.intercept:.1f}, '
                  f'R²={lr.rvalue**2:.4f}')
    ax.set_xlabel('F (ms)')
    ax.set_ylabel('First-response latency dt (ms)')
    ax.set_title(f'{model} at cadence={c*1000:.0f} ms, F ∈ [1, 30] ms — '
                 f'below-cliff regression\nslope ≈ 1 is the structural '
                 f'signature of the "F added to cadence" bug', fontsize=11)
    ax.grid(True, linestyle=':', alpha=0.4)
    ax.legend(loc='upper left', fontsize=9)
    plt.tight_layout()
    plt.savefig(out / 'fig3-slope-1-bug-signature.png', dpi=120)
    plt.close()


def render_fig4(rows, out: Path) -> None:
    """Figure 4: strip-flip bimodality at b10c128 C=0.125."""
    model = 'b10c128'
    c = 0.125
    strip_fs = [0.012, 0.015, 0.018, 0.020, 0.022, 0.025]

    fig, ax = plt.subplots(figsize=(8, 5))
    for f in strip_fs:
        vals = [r['dt'] for r in rows
                if r['mv'] == 2_000_000 and r['model'] == model
                and r['c'] == c and r['f'] == f and r['dt'] is not None]
        if vals:
            ax.scatter([f * 1000] * len(vals), vals, s=15,
                        color=COLORS[model], alpha=0.55)
    ax.set_xlabel('F (ms)')
    ax.set_ylabel('First-response latency dt (ms)')
    ax.set_title(f'{model} at cadence={c*1000:.0f} ms — bimodal "strip-flip" '
                 f'near the cliff\neach F has ~50 trials; the gap is one '
                 f'cadence tick (~125 ms)', fontsize=11)
    ax.grid(True, linestyle=':', alpha=0.4)
    plt.tight_layout()
    plt.savefig(out / 'fig4-strip-flip-bimodality.png', dpi=120)
    plt.close()


def render_fig5(_rows, out: Path) -> None:
    """Figure 5: F* vs cadence per model (from f_star_sweep.csv)."""
    f_star_csv = HERE / 'f_star_sweep.csv'
    by_model = defaultdict(list)
    if f_star_csv.exists():
        with f_star_csv.open() as f:
            for r in csv.DictReader(f):
                try:
                    if r['best_f_s'] == '':
                        continue
                    by_model[r['model']].append(
                        (float(r['cadence_s']), float(r['best_f_s'])))
                except (KeyError, ValueError):
                    continue

    fig, ax = plt.subplots(figsize=(8, 5))
    for model in MODELS:
        pts = sorted(by_model.get(model, []))
        if pts:
            cads, fs = zip(*pts)
            ax.plot(np.array(cads) * 1000, np.array(fs) * 1000,
                    'o-', color=COLORS[model], label=model,
                    markersize=5, linewidth=1.3)
    ax.set_xlabel('Cadence (ms)')
    ax.set_ylabel('Recommended F* (ms)')
    ax.set_title('F* vs cadence per model — cliff position is largely '
                 'cadence-invariant\nabove the eval-cost regime; drops as '
                 'cadence approaches eval cost', fontsize=11)
    ax.set_xscale('log')
    ax.set_yscale('log')
    ax.grid(True, which='both', linestyle=':', alpha=0.4)
    ax.legend(loc='upper left', fontsize=9)
    plt.tight_layout()
    plt.savefig(out / 'fig5-f-star-vs-cadence.png', dpi=120)
    plt.close()


def render_fig6(_rows, out: Path) -> None:
    """Figure 6: visits-at-first-packet from repro_output.txt."""
    cadence_blocks = defaultdict(list)
    cur_c = None
    path = HERE / 'repro_output.txt'
    with path.open() as f:
        for line in f:
            m = re.match(r'=== cadence = (\d+(?:\.\d+)?)s ===', line.strip())
            if m:
                cur_c = float(m.group(1))
                continue
            m = re.search(
                r'firstReportAfter=\s*(\d+(?:\.\d+)?)s\s+'
                r'\(.*?\)\s+→\s+'
                r'first @ \+\s*(\d+)\s+ms\s+'
                r'\(.*?\)\s+'
                r'visits=\s*(\d+)',
                line,
            )
            if m and cur_c is not None:
                cadence_blocks[cur_c].append(
                    (float(m.group(1)), int(m.group(2)), int(m.group(3))))

    fig, ax = plt.subplots(figsize=(9, 5))
    colors = {0.5: '#1f77b4', 2.0: '#ff7f0e', 10.0: '#d62728'}
    for c, rows_for_c in sorted(cadence_blocks.items()):
        fs, _, vs = zip(*rows_for_c)
        ax.plot(np.array(fs) * 1000, np.array(vs), 'o-',
                color=colors.get(c, '#444'),
                label=f'cadence = {c}s', markersize=5, linewidth=1.3)
    ax.set_xlabel('firstReportDuringSearchAfter F (ms)')
    ax.set_ylabel('Node visits completed by time of first packet')
    ax.set_title('Engine work product at first-packet arrival\n'
                 '(stdio reproducer, single model `really_weak.txt.gz`)',
                 fontsize=11)
    ax.set_xscale('log')
    ax.set_yscale('log')
    ax.grid(True, which='both', linestyle=':', alpha=0.4)
    ax.legend(loc='lower right', fontsize=10)

    for c, rows_for_c in cadence_blocks.items():
        rows_sorted = sorted(rows_for_c)
        f, _, v = rows_sorted[0]
        if v > 10000:
            ax.annotate(
                f'F=1 ms, C={c}s:\n{v:,} visits\nbefore engine fires',
                xy=(f * 1000, v),
                xytext=(20 if c < 5 else 5, -10 if c < 5 else 25),
                textcoords='offset points',
                fontsize=8,
                color=colors.get(c, '#444'),
                arrowprops=dict(arrowstyle='->', color=colors.get(c, '#444'),
                                 lw=0.7, alpha=0.6),
            )
    plt.tight_layout()
    plt.savefig(out / 'fig6-visits-at-first-packet.png', dpi=120)
    plt.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        '--out',
        type=Path,
        default=HERE.parent.parent / 'notes' / 'images' / 'katago-f-optimizer',
        help='Output directory for the PNG figures.',
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    print(f'Loading sweep CSV from {HERE / "sweep_results" / "sweep_results.csv.gz"}...')
    rows = load_sweep_rows()
    print(f'  {len(rows):,} rows')

    print(f'Rendering figures to {args.out}/...')
    for name, fn in (('fig1', render_fig1), ('fig2', render_fig2),
                      ('fig3', render_fig3), ('fig4', render_fig4),
                      ('fig5', render_fig5), ('fig6', render_fig6)):
        print(f'  {name}...')
        fn(rows, args.out)
    print('Done.')


if __name__ == '__main__':
    main()
