#!/usr/bin/env python3
"""
parameter_sweep.py

KataGo first-response latency sweep with a live browser dashboard and
statistical analysis backend. Connects to a KataProxy SELECTOR over
WebSocket, enumerates models via `query_models`, runs a randomly-ordered
round-robin sweep over (model × reportDuringSearchEvery ×
firstReportDuringSearchAfter) with replication, and serves an HTTP
endpoint that browser clients poll for live-updating plotly figures and
statistical findings.

Response variable
-----------------
Wall-clock milliseconds from the moment the analyze query is written to
the socket to the moment the first response packet with matching id is
read off. No `capabilities` field is sent on the analyze query — proxy-
side enrichment is off; we measure vanilla KataGo behaviour through a
transparent SELECTOR hop.

Per-trial protocol
------------------
1. `{action: "clear_cache"}` — SELECTOR fans out to every healthy
   upstream (the v1.0.18+ broadcast behaviour); rules out cross-trial
   cache pollution.
2. Drain-until-quiet (150ms quiet, 1s cap) — absorbs any cache_clear
   ack and lets propagation settle.
3. `t0 = perf_counter()`; send analyze; receive first matching response;
   `dt = perf_counter() - t0`.
4. `{action: "terminate", terminateId: qid}`; drain-until-quiet
   (100ms quiet, 1.5s cap) — keeps the socket clean for the next trial.
5. Append the row to in-memory list and to CSV.

Statistical analysis
--------------------
For each model:
 * Cliff position per cadence: logistic fit to pinned-vs-F yields F50,
   plus F10/F90 strip edges and a strip-width estimate.
 * Fast-regime floor: median latency across `F ≥ 0.05s` "clearly fast"
   trials, with a scipy.stats.bootstrap 95% CI on the median.
 * Cadence-independence: at each F in the fast regime where both
   cadences have ≥3 samples, a two-sided Mann-Whitney U test. If the
   hypothesis ("cadence has no effect in the fast regime") holds, no
   p-value should be small after Bonferroni correction.

Usage
-----
    VENV=/home/bork/w/vdc/venvs/kataproxy/bin/python

    # Combined: run the sweep AND serve the live dashboard.
    $VENV parameter_sweep.py run --bind 192.168.122.68 --port 8000
    $VENV parameter_sweep.py run --trials 50          # more replication
    $VENV parameter_sweep.py run --only-model X       # one model

    # Just serve the dashboard from an existing CSV (no sweeping).
    $VENV parameter_sweep.py serve --bind 192.168.122.68 --port 8000

    # Print statistical findings to stdout from the current CSV.
    $VENV parameter_sweep.py analyze

The WS target defaults to `ws://192.168.122.1:1235`; override with the
`KATAGO_WS_URL` environment variable.

License: Public Domain (The Unlicense).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path
from statistics import median
from typing import Optional

import numpy as np
import websockets
from aiohttp import web
from scipy import stats as sps
from scipy.optimize import curve_fit


# ---------------------------------------------------------------------------
# Connection + grid.

WS_URL = os.environ.get('KATAGO_WS_URL', 'ws://192.168.122.1:1235')

ANALYZE_TURNS = [39]

MOVES = [
    ['B', 'D4'],  ['W', 'Q16'], ['B', 'D17'], ['W', 'Q4'],  ['B', 'F4'],  ['W', 'D15'],
    ['B', 'C15'], ['W', 'C14'], ['B', 'C16'], ['W', 'D14'], ['B', 'F17'], ['W', 'C10'],
    ['B', 'R10'], ['W', 'B4'],  ['B', 'D11'], ['W', 'C11'], ['B', 'C4'],  ['W', 'B5'],
    ['B', 'B3'],  ['W', 'C7'],  ['B', 'O3'],  ['W', 'R6'],  ['B', 'R13'], ['W', 'R15'],
    ['B', 'D7'],  ['W', 'C6'],  ['B', 'C8'],  ['W', 'D8'],  ['B', 'D9'],  ['W', 'E8'],
    ['B', 'C9'],  ['W', 'E7'],  ['B', 'D10'], ['W', 'B2'],  ['B', 'C3'],  ['W', 'E5'],
    ['B', 'F3'],  ['W', 'F15'], ['B', 'C12'],
]

OVERRIDE_SETTINGS = {
    'reportAnalysisWinratesAs': 'WHITE',
    'rootNumSymmetriesToSample': 8,
    'wideRootNoise': 0.02,
}

# Treatment cadences: the realtime-UX values used with the F knob.
CADENCES = [0.125, 0.250]

# Control cadences: a broader sweep used WITHOUT firstReportDuringSearchAfter
# to characterise the intrinsic latency floor as a function of cadence
# alone. Each (model, control_cadence) cell tells us what the first-paint
# latency would be if a user simply didn't use the (undocumented) F knob.
CONTROL_CADENCES = [
    0.020, 0.030, 0.040, 0.050, 0.060, 0.075,
    0.100, 0.125, 0.150, 0.175, 0.200, 0.250,
    0.300, 0.400, 0.500, 0.750, 1.000,
]

# Treatment F values (only used when F > 0; F = 0 sentinel goes to the
# control path via CONTROL_CADENCES).
F_VALUES = [
    0.001, 0.003, 0.005, 0.008, 0.010, 0.012, 0.015, 0.018,
    0.020, 0.021, 0.022, 0.023, 0.024, 0.025, 0.026, 0.027, 0.028,
    0.030, 0.032, 0.035, 0.040, 0.045,
    0.050, 0.060, 0.075, 0.100,
    0.115, 0.125, 0.150, 0.175, 0.200,
]


def f_is_control(f: float) -> bool:
    return f <= 0.0


# Default maxVisits for the full-search treatment + control cells.
MAX_VISITS_FULL = 2_000_000

# Edge-case baseline cells: NO reportDuringSearchEvery AND NO
# firstReportDuringSearchAfter on the wire — just "run this many visits
# and send me the final response". The four chosen values, in light of
# KataGo's GPU batching (default nnMaxBatchSize=32 here):
#   visits=0  → validator rebuff (pure wire+dispatch+validation RTT)
#   visits=1  → 1 image, batch of 1 (UPPER BOUND on per-eval cost,
#               worst-case batch utilization)
#   visits=32 → 32 images = 1 full batch (per-eval cost amortized over
#               one fully-loaded forward pass)
#   visits=64 → 2 full batches (lets us derive per-batch cost cleanly
#               via (v=64 − v=32) without any startup contribution)
MAX_VISITS_BASELINES = [0, 1, 32, 64]


def is_baseline_cell(max_visits: int) -> bool:
    return max_visits in MAX_VISITS_BASELINES

TRIALS_PER_CELL = 50

# Per-trial protocol timings.
CACHE_CLEAR_DRAIN_QUIET_S = 0.15
CACHE_CLEAR_DRAIN_MAX_S = 1.00
POST_TRIAL_DRAIN_QUIET_S = 0.10
POST_TRIAL_DRAIN_MAX_S = 1.50
STARTUP_DRAIN_MAX_S = 1.00


def trial_timeout_s(cadence: float) -> float:
    return max(cadence * 2.0 + 0.5, 2.0)


# CSV schema (stable across this file's lifetime).
CSV_FIELDS = [
    'model', 'cadence_s', 'first_report_s', 'trial_idx', 'max_visits',
    'dt_ms', 'visits_at_first_packet', 'error', 'timestamp',
]


# ---------------------------------------------------------------------------
# Plotly colours.

CADENCE_LINE = {
    0.125: 'rgb(31, 119, 180)',
    0.250: 'rgb(255, 127, 14)',
}
CADENCE_FILL = {
    0.125: 'rgba(31, 119, 180, 0.18)',
    0.250: 'rgba(255, 127, 14, 0.18)',
}


def now_ms() -> float:
    return time.perf_counter() * 1000.0


# ---------------------------------------------------------------------------
# WebSocket helpers.

async def drain_until_quiet(ws, *, quiet_s: float, max_total_s: float) -> int:
    drained = 0
    deadline = time.perf_counter() + max_total_s
    while time.perf_counter() < deadline:
        remaining = deadline - time.perf_counter()
        wait = min(quiet_s, remaining)
        try:
            await asyncio.wait_for(ws.recv(), timeout=wait)
            drained += 1
        except asyncio.TimeoutError:
            return drained
        except Exception:
            return drained
    return drained


async def send_action(ws, payload: dict) -> None:
    try:
        await ws.send(json.dumps(payload))
    except Exception as e:
        print(f'[warn] send failed: {e}')


async def query_models(ws) -> list[dict]:
    qid = f'enum-models-{int(time.time() * 1e6)}'
    await ws.send(json.dumps({'id': qid, 'action': 'query_models'}))
    deadline = time.perf_counter() + 5.0
    while time.perf_counter() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(),
                                         timeout=deadline - time.perf_counter())
        except asyncio.TimeoutError:
            return []
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if msg.get('id') != qid:
            continue
        models = msg.get('models')
        if not isinstance(models, list):
            print(f'[warn] unexpected query_models response: {msg!r}')
            return []
        out = []
        for m in models:
            if isinstance(m, dict) and 'label' in m:
                out.append({'label': m['label'],
                            'healthy': bool(m.get('healthy', True))})
            elif isinstance(m, str):
                out.append({'label': m, 'healthy': True})
        return out
    return []


async def query_version(ws) -> dict:
    qid = f'qver-{int(time.time() * 1e6)}'
    await ws.send(json.dumps({'id': qid, 'action': 'query_version'}))
    deadline = time.perf_counter() + 5.0
    while time.perf_counter() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(),
                                         timeout=deadline - time.perf_counter())
        except asyncio.TimeoutError:
            return {}
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if msg.get('id') == qid:
            return msg
    return {}


# ---------------------------------------------------------------------------
# Single trial.

async def one_trial(ws, model: str, cadence: float, first_report: float,
                    trial_idx: int, max_visits: int = MAX_VISITS_FULL) -> dict:
    cc_id = f'cc-{model}-{int(time.time() * 1e6)}'
    await send_action(ws, {'id': cc_id, 'action': 'clear_cache'})
    await drain_until_quiet(ws,
                            quiet_s=CACHE_CLEAR_DRAIN_QUIET_S,
                            max_total_s=CACHE_CLEAR_DRAIN_MAX_S)

    qid = (f'sweep-{model}-{cadence}-{first_report}-{max_visits}-{trial_idx}'
           f'-{int(time.time() * 1e6)}')
    query = {
        'id': qid,
        'moves': MOVES,
        'analyzeTurns': ANALYZE_TURNS,
        'rules': 'tromp-taylor',
        'boardXSize': 19,
        'boardYSize': 19,
        'komi': 7.5,
        'maxVisits': max_visits,
        'includeOwnership': True,
        'overrideSettings': OVERRIDE_SETTINGS,
        'model': model,
    }
    if is_baseline_cell(max_visits):
        # Edge-case baseline: no cadence/F at all on the wire. The query
        # is "do this much search, then send me the (single) final
        # response". dt measures pure dispatch + 0 or 1 NN eval.
        pass
    else:
        query['reportDuringSearchEvery'] = cadence
        if not f_is_control(first_report):
            query['firstReportDuringSearchAfter'] = first_report
    payload = json.dumps(query)
    # Baseline cells: timeout depends on max_visits. v=1 is ~one eval;
    # v=64 on a heavy model could be ~2× forward-pass time + dispatch.
    # 10s is generous and won't trip in practice.
    if is_baseline_cell(max_visits):
        timeout_s = 10.0
    else:
        timeout_s = trial_timeout_s(cadence)

    dt_ms: Optional[float] = None
    visits: Optional[int] = None
    error: Optional[str] = None

    t0 = now_ms()
    await ws.send(payload)
    deadline = time.perf_counter() + timeout_s
    while True:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            break
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if msg.get('id') != qid:
            continue
        dt_ms = now_ms() - t0
        if 'error' in msg:
            error = str(msg['error'])
        else:
            visits = (msg.get('rootInfo') or {}).get('visits')
        break

    await send_action(ws, {
        'id': f'term-{int(time.time() * 1e6)}',
        'action': 'terminate',
        'terminateId': qid,
    })
    await drain_until_quiet(ws,
                            quiet_s=POST_TRIAL_DRAIN_QUIET_S,
                            max_total_s=POST_TRIAL_DRAIN_MAX_S)

    return {
        'model': model,
        'cadence_s': cadence,
        'first_report_s': first_report,
        'trial_idx': trial_idx,
        'max_visits': max_visits,
        'dt_ms': dt_ms,
        'visits_at_first_packet': visits,
        'error': error,
        'timestamp': time.time(),
    }


# ---------------------------------------------------------------------------
# CSV durability layer.

def load_csv_rows(csv_path: Path) -> list[dict]:
    rows: list[dict] = []
    if not csv_path.exists():
        return rows
    with csv_path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                row['cadence_s'] = float(row['cadence_s'])
                row['first_report_s'] = float(row['first_report_s'])
                row['trial_idx'] = int(row['trial_idx'])
                # Older CSVs predate the max_visits column. Default to
                # full-search if absent (all pre-baseline data was at
                # maxVisits=2_000_000).
                raw_mv = row.get('max_visits')
                row['max_visits'] = (int(raw_mv)
                                     if raw_mv not in (None, '', 'None')
                                     else MAX_VISITS_FULL)
                raw_dt = row.get('dt_ms')
                row['dt_ms'] = (float(raw_dt)
                                if raw_dt not in (None, '', 'None')
                                else None)
                rows.append(row)
            except (KeyError, ValueError):
                continue
    return rows


def append_csv_row(csv_path: Path, row: dict) -> None:
    is_new = not csv_path.exists()
    with csv_path.open('a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerow({k: row.get(k) for k in CSV_FIELDS})


# ---------------------------------------------------------------------------
# Sweep state (shared between the sweep coroutine and the HTTP handlers).

class SweepState:
    def __init__(self, csv_path: Path, trials_per_cell: int,
                 only_model: Optional[str]):
        self.csv_path = csv_path
        self.trials_per_cell = trials_per_cell
        self.only_model = only_model
        self.rows: list[dict] = load_csv_rows(csv_path)
        self.models: list[str] = sorted({r['model'] for r in self.rows})
        self.cadences: list[float] = list(CADENCES)
        self.control_cadences: list[float] = list(CONTROL_CADENCES)
        self.f_values: list[float] = list(F_VALUES)
        self.total_cells: int = 0
        self.done_count: int = len(self.rows)
        self.start_perf: Optional[float] = None
        self.sweep_complete: bool = False
        self.sweep_failed: Optional[str] = None
        self.current_cell: Optional[tuple] = None
        self.version_info: dict = {}

    def append(self, row: dict) -> None:
        self.rows.append(row)
        append_csv_row(self.csv_path, row)
        self.done_count += 1


def cells_for(models: list[str], treatment_cadences: list[float],
              control_cadences: list[float], f_values: list[float],
              trials: int
              ) -> list[tuple[str, float, float, int, int]]:
    """Round-robin across models. Each round = one trial per cell, where
    cells = (treatment_cadence × F) ∪ (control_cadence × {F=0})
            ∪ ({cadence=0, F=0} × {visits=0, visits=1}).
    All cell types shuffle together so any ordering bias is randomised."""
    result: list[tuple[str, float, float, int, int]] = []
    cell_list_base: list[tuple[float, float, int]] = []
    for c in treatment_cadences:
        for f in f_values:
            if f > 0 and f < c:
                cell_list_base.append((c, f, MAX_VISITS_FULL))
    for c in control_cadences:
        cell_list_base.append((c, 0.0, MAX_VISITS_FULL))
    for mv in MAX_VISITS_BASELINES:
        cell_list_base.append((0.0, 0.0, mv))
    for trial_idx in range(trials):
        if models:
            shift = trial_idx % len(models)
            rotated = models[shift:] + models[:shift]
        else:
            rotated = models
        for model in rotated:
            rng = random.Random((hash(model) ^ trial_idx) & 0xFFFFFFFF)
            order = cell_list_base[:]
            rng.shuffle(order)
            for c, f, mv in order:
                result.append((model, c, f, trial_idx, mv))
    return result


# ---------------------------------------------------------------------------
# Aggregation.

def aggregate(rows: list[dict]) -> dict:
    """Group successful FULL-SEARCH trials by (model, cadence, F) → stats.
    Skips baseline cells (max_visits ∈ {0, 1}) — those have their own
    aggregation via baseline_stats()."""
    groups: dict[tuple[str, float, float], list[float]] = defaultdict(list)
    for r in rows:
        if r.get('dt_ms') is None:
            continue
        if r.get('error'):
            continue
        if r.get('max_visits', MAX_VISITS_FULL) != MAX_VISITS_FULL:
            continue  # baseline cell — handled elsewhere
        key = (r['model'], r['cadence_s'], r['first_report_s'])
        groups[key].append(r['dt_ms'])
    summary = {}
    for key, vals in groups.items():
        vs = sorted(vals)
        n = len(vs)
        arr = np.array(vs)
        if n >= 4:
            q25, q50, q75 = np.percentile(arr, [25, 50, 75])
        elif n >= 2:
            q25, q50, q75 = vs[0], float(np.median(arr)), vs[-1]
        else:
            q25 = q50 = q75 = vs[0]
        summary[key] = {
            'n': n, 'min': vs[0], 'max': vs[-1],
            'median': float(q50), 'q25': float(q25), 'q75': float(q75),
            'all': vs,
        }
    return summary


# ---------------------------------------------------------------------------
# Statistics.

def baseline_stats(rows: list[dict], model: str, max_visits: int) -> dict:
    """Median + 95% CI for baseline cells (max_visits ∈ {0, 1, 32, 64}).
    These probe the irreducible per-query overhead (no reporting, just
    send-receive-final).

    Special case for max_visits=0: KataGo's validator rebuffs the query
    with an error response, and the dt to that error IS the measurement
    we want (pure wire+dispatch+validation RTT). So we KEEP error rows
    for v=0 — but filter them for v≥1 where errors mean real failures."""
    keep_errors = (max_visits == 0)
    vals = [r['dt_ms'] for r in rows
            if r['model'] == model
            and r.get('max_visits', MAX_VISITS_FULL) == max_visits
            and r.get('dt_ms') is not None
            and (keep_errors or not r.get('error'))]
    if len(vals) < 3:
        return {'ok': False, 'n': len(vals)}
    arr = np.array(vals)
    median_v = float(np.median(arr))
    try:
        ci = sps.bootstrap(
            (arr,), np.median,
            confidence_level=0.95,
            n_resamples=2000,
            method='percentile',
            random_state=42,
        ).confidence_interval
        ci_lo, ci_hi = float(ci.low), float(ci.high)
    except Exception:
        ci_lo, ci_hi = float(np.percentile(arr, 2.5)), float(np.percentile(arr, 97.5))
    return {
        'ok': True,
        'n': len(vals),
        'min': float(arr.min()),
        'median': median_v,
        'p10': float(np.percentile(arr, 10)),
        'p90': float(np.percentile(arr, 90)),
        'max': float(arr.max()),
        'ci_lo': ci_lo, 'ci_hi': ci_hi,
    }


def _logistic(x, x0, k):
    """Standard logistic; x0 = midpoint, k = steepness."""
    z = -k * (np.asarray(x) - x0)
    z = np.clip(z, -500, 500)   # overflow-safe
    return 1.0 / (1.0 + np.exp(z))


def fit_cliff(rows: list[dict], model: str, cadence: float) -> dict:
    """Logistic fit of pinned-fraction vs F. Returns F50, F10, F90, slope.
    Excludes control cells (F=0) — they're a separate measurement.

    Pinned-classifier: requires control regression for this model. A
    trial is 'honored' iff dt < (predicted_control_dt - PINNED_MARGIN);
    otherwise it's classified as 'pinned'. This handles the case where
    the model's per-eval floor exceeds cadence (and the historical
    0.7×cadence heuristic would silently mark everything as pinned).
    """
    PINNED_MARGIN_MS = 35.0  # half-step between "F honored" and "control"

    cell_data: dict[float, list[float]] = defaultdict(list)
    for r in rows:
        if (r['model'] != model or r['cadence_s'] != cadence
                or r.get('dt_ms') is None or r.get('error')
                or f_is_control(r['first_report_s'])):
            continue
        cell_data[r['first_report_s']].append(r['dt_ms'])

    # Use the measured control median at exactly this cadence when we
    # have ≥3 control trials — far more accurate than the linear-fit
    # extrapolation, especially where cadence is close to eval cost (the
    # control curve flattens at low cadence and the linear fit
    # overestimates dt there).
    control_dts_at_cadence = [r['dt_ms'] for r in rows
                               if r['model'] == model
                               and r['cadence_s'] == cadence
                               and f_is_control(r['first_report_s'])
                               and r.get('dt_ms') is not None
                               and not r.get('error')]
    if len(control_dts_at_cadence) >= 3:
        expected_control_ms = float(np.median(control_dts_at_cadence))
        control_source = f'measured (n={len(control_dts_at_cadence)})'
    else:
        control_fit = fit_control_line(rows, model)
        if not control_fit.get('ok'):
            return {'ok': False,
                    'reason': f'no control reference: {control_fit.get("reason")}'}
        expected_control_ms = (control_fit['intercept']
                               + control_fit['slope'] * (cadence * 1000.0))
        control_source = 'linear-fit extrapolation'
    threshold = expected_control_ms - PINNED_MARGIN_MS

    if len(cell_data) < 3:
        return {'ok': False, 'reason': 'need ≥3 F values'}
    F_arr, p_arr, n_arr = [], [], []
    for f, vals in sorted(cell_data.items()):
        n_arr.append(len(vals))
        F_arr.append(f)
        p_arr.append(sum(1 for v in vals if v > threshold) / len(vals))
    F_arr = np.array(F_arr)
    p_arr = np.array(p_arr)
    n_arr = np.array(n_arr)

    # If every cell is at 0 or 1, the fit is degenerate. Still report what
    # we can.
    if (p_arr == 0).all():
        return {'ok': False, 'reason': 'no pinned trials at any F'}
    if (p_arr == 1).all():
        return {'ok': False, 'reason': 'all trials pinned at every F'}

    try:
        x0_init = float(F_arr[np.argmin(np.abs(p_arr - 0.5))])
        # k is in 1/seconds; for the ~5ms-wide strip observed historically,
        # k ≈ 1000 puts the slope sensibly.
        popt, _ = curve_fit(
            _logistic, F_arr, p_arr,
            p0=[x0_init, 1000.0],
            sigma=1.0 / np.sqrt(n_arr + 1),
            absolute_sigma=False,
            maxfev=10000,
        )
        F50, k = float(popt[0]), float(popt[1])
        if k <= 0:
            return {'ok': False, 'reason': f'fit slope non-positive (k={k:.2f})'}
        F10 = F50 - math.log(9.0) / k
        F90 = F50 + math.log(9.0) / k
        return {
            'ok': True,
            'F50_s': F50, 'F10_s': F10, 'F90_s': F90,
            'strip_width_s': F90 - F10, 'k': k,
            'n_cells': len(F_arr),
            'n_total_trials': int(n_arr.sum()),
            'control_expected_ms': expected_control_ms,
            'pinned_threshold_ms': threshold,
            'control_source': control_source,
        }
    except Exception as e:
        return {'ok': False, 'reason': f'curve_fit failed: {e}'}


def fast_regime_floor(rows: list[dict], model: str,
                       min_f: float = 0.05) -> dict:
    """Median latency in the 'clearly fast' regime, with 95% bootstrap CI."""
    vals = []
    for r in rows:
        if (r['model'] != model or r.get('dt_ms') is None
                or r.get('error') or r['first_report_s'] < min_f):
            continue
        # Exclude any trial that landed slow (would skew the floor estimate
        # if a strip cell flipped). Heuristic: dt < cadence * 0.7.
        if r['dt_ms'] > r['cadence_s'] * 1000.0 * 0.7:
            continue
        vals.append(r['dt_ms'])
    if len(vals) < 3:
        return {'ok': False, 'reason': f'only {len(vals)} fast-regime trials'}
    arr = np.array(vals)
    median_v = float(np.median(arr))
    try:
        ci = sps.bootstrap(
            (arr,), np.median,
            confidence_level=0.95,
            n_resamples=2000,
            method='percentile',
            random_state=42,
        ).confidence_interval
        ci_lo, ci_hi = float(ci.low), float(ci.high)
    except Exception:
        ci_lo, ci_hi = float(np.percentile(arr, 2.5)), float(np.percentile(arr, 97.5))
    return {
        'ok': True,
        'n': len(vals),
        'min': float(arr.min()),
        'median': median_v,
        'p10': float(np.percentile(arr, 10)),
        'p90': float(np.percentile(arr, 90)),
        'max': float(arr.max()),
        'ci_lo': ci_lo, 'ci_hi': ci_hi,
    }


def cadence_independence(rows: list[dict], model: str, f: float,
                          cadences: list[float]) -> dict:
    """Mann-Whitney U test on dt distributions for the two cadences at F."""
    if len(cadences) != 2:
        return {'ok': False, 'reason': 'need exactly 2 cadences'}
    c1, c2 = cadences
    g1 = [r['dt_ms'] for r in rows
          if r['model'] == model and r['cadence_s'] == c1
          and r['first_report_s'] == f
          and r.get('dt_ms') is not None and not r.get('error')]
    g2 = [r['dt_ms'] for r in rows
          if r['model'] == model and r['cadence_s'] == c2
          and r['first_report_s'] == f
          and r.get('dt_ms') is not None and not r.get('error')]
    if len(g1) < 3 or len(g2) < 3:
        return {'ok': False, 'reason': f'n1={len(g1)} n2={len(g2)}'}
    try:
        u, p = sps.mannwhitneyu(g1, g2, alternative='two-sided')
        return {
            'ok': True,
            'n1': len(g1), 'n2': len(g2),
            'median_c1': float(np.median(g1)), 'median_c2': float(np.median(g2)),
            'p_value': float(p),
            'effect_ms': float(np.median(g2) - np.median(g1)),
        }
    except Exception as e:
        return {'ok': False, 'reason': str(e)}


def compute_findings(rows: list[dict], models: list[str],
                     cadences: list[float]) -> dict:
    """All statistical findings, structured for both HTML and stdout."""
    out: dict = {
        'cliffs': {},
        'floors': {},
        'cadence_indep': {},
        'control_fits': {},
        'baselines': {},
    }
    for model in models:
        out['cliffs'][model] = {
            cadence: fit_cliff(rows, model, cadence) for cadence in cadences
        }
        out['floors'][model] = fast_regime_floor(rows, model)
        out['cadence_indep'][model] = {}
        for f in [0.050, 0.060, 0.075, 0.100, 0.115]:
            if all(f < c for c in cadences):
                res = cadence_independence(rows, model, f, cadences)
                out['cadence_indep'][model][f] = res
        out['control_fits'][model] = fit_control_line(rows, model)
        out['baselines'][model] = {
            mv: baseline_stats(rows, model, mv)
            for mv in MAX_VISITS_BASELINES
        }
    return out


# ---------------------------------------------------------------------------
# Plotly figure construction.

def build_fig_latency_vs_f(rows: list[dict], models: list[str],
                            cadences: list[float]) -> dict:
    """Plot 1: median + IQR + scatter per (model, cadence)."""
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    summary = aggregate(rows)
    if not models:
        return go.Figure(layout={'title': 'no data yet'}).to_dict()
    fig = make_subplots(
        rows=len(models), cols=1,
        subplot_titles=[f'Model: {m}' for m in models],
        shared_xaxes=False, vertical_spacing=0.06,
    )
    for r_idx, model in enumerate(models, start=1):
        for cadence in cadences:
            line_color = CADENCE_LINE.get(cadence, 'rgb(100,100,100)')
            fill_color = CADENCE_FILL.get(cadence, 'rgba(100,100,100,0.18)')
            # Main scatter: only F > 0 (log axis can't show the F=0 control).
            keys = sorted(
                [k for k in summary
                 if k[0] == model and k[1] == cadence and k[2] > 0],
                key=lambda k: k[2],
            )
            if keys:
                xs = [k[2] for k in keys]
                ys_med = [summary[k]['median'] for k in keys]
                ys_q25 = [summary[k]['q25'] for k in keys]
                ys_q75 = [summary[k]['q75'] for k in keys]

                fig.add_trace(go.Scatter(
                    x=xs + xs[::-1],
                    y=ys_q75 + ys_q25[::-1],
                    fill='toself', fillcolor=fill_color,
                    line=dict(color='rgba(0,0,0,0)'),
                    showlegend=False, hoverinfo='skip',
                ), row=r_idx, col=1)

                xs_all, ys_all = [], []
                for k in keys:
                    for v in summary[k]['all']:
                        xs_all.append(k[2])
                        ys_all.append(v)
                fig.add_trace(go.Scatter(
                    x=xs_all, y=ys_all, mode='markers',
                    marker=dict(size=4, color=line_color, opacity=0.30),
                    showlegend=False,
                    hovertemplate='F=%{x}s<br>%{y:.1f}ms<extra></extra>',
                ), row=r_idx, col=1)

                fig.add_trace(go.Scatter(
                    x=xs, y=ys_med, mode='lines+markers',
                    line=dict(color=line_color, width=2),
                    marker=dict(size=7, color=line_color),
                    name=f'cadence = {cadence}s',
                    legendgroup=f'C{cadence}',
                    showlegend=(r_idx == 1),
                    hovertemplate=('F=%{x}s<br>median=%{y:.1f}ms'
                                   '<extra></extra>'),
                ), row=r_idx, col=1)

            # Dotted reference line at cadence value.
            fig.add_hline(
                y=cadence * 1000.0,
                line=dict(color=line_color, width=1, dash='dot'),
                opacity=0.35,
                row=r_idx, col=1,
            )

            # Dash-dot reference line at the control (no-F) median for
            # this (model, cadence). The hypothetical "if I just don't
            # set F" floor — values below this line show the benefit of
            # the F knob; values above show it making things worse.
            control_key = (model, cadence, 0.0)
            if control_key in summary:
                cv = summary[control_key]['median']
                fig.add_hline(
                    y=cv,
                    line=dict(color=line_color, width=1.5, dash='dashdot'),
                    opacity=0.65,
                    annotation_text=f'control@{cadence}s = {cv:.0f}ms (n={summary[control_key]["n"]})',
                    annotation_position='top right',
                    annotation_font=dict(size=10, color=line_color),
                    row=r_idx, col=1,
                )
        fig.update_xaxes(type='log',
                         title='firstReportDuringSearchAfter (s)',
                         row=r_idx, col=1)
        fig.update_yaxes(title='First-response latency (ms)',
                         row=r_idx, col=1)
    fig.update_layout(
        title=('First-response latency vs F — per model, both cadences '
               '(line=median, band=IQR, dots=individual trials, '
               'dotted=cadence)'),
        height=420 * max(1, len(models)),
        hovermode='closest',
        uirevision='static',   # preserve zoom across react() updates
    )
    return fig.to_dict()


def build_fig_pinned_fraction(rows: list[dict], models: list[str],
                                cadences: list[float]) -> dict:
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    summary = aggregate(rows)
    if not models:
        return go.Figure(layout={'title': 'no data yet'}).to_dict()
    fig = make_subplots(
        rows=len(models), cols=1,
        subplot_titles=[f'Model: {m}' for m in models],
        shared_xaxes=False, vertical_spacing=0.06,
    )
    for r_idx, model in enumerate(models, start=1):
        for cadence in cadences:
            line_color = CADENCE_LINE.get(cadence, 'rgb(100,100,100)')
            keys = sorted(
                [k for k in summary
                 if k[0] == model and k[1] == cadence and k[2] > 0],
                key=lambda k: k[2],
            )
            if not keys:
                continue
            xs = [k[2] for k in keys]
            threshold = cadence * 1000.0 * 0.7
            ys = []
            ns = []
            for k in keys:
                vals = summary[k]['all']
                pinned = sum(1 for v in vals if v > threshold)
                ys.append(pinned / len(vals) if vals else 0.0)
                ns.append(len(vals))
            fig.add_trace(go.Scatter(
                x=xs, y=ys, mode='lines+markers',
                line=dict(color=line_color, width=2),
                marker=dict(size=7, color=line_color),
                customdata=ns,
                name=f'cadence = {cadence}s',
                legendgroup=f'C{cadence}',
                showlegend=(r_idx == 1),
                hovertemplate=('F=%{x}s<br>pinned=%{y:.0%}'
                               '<br>n=%{customdata}<extra></extra>'),
            ), row=r_idx, col=1)
        fig.add_hline(y=0.5,
                      line=dict(color='gray', width=1, dash='dash'),
                      opacity=0.5, row=r_idx, col=1)
        fig.update_xaxes(type='log',
                         title='firstReportDuringSearchAfter (s)',
                         row=r_idx, col=1)
        fig.update_yaxes(title='Fraction of trials pinned',
                         range=[-0.05, 1.05], row=r_idx, col=1)
    fig.update_layout(
        title=('Fraction of trials cadence-pinned vs F '
               '(threshold: latency > 0.7 × cadence)'),
        height=300 * max(1, len(models)),
        uirevision='static',
    )
    return fig.to_dict()


def build_fig_floor(rows: list[dict], models: list[str]) -> dict:
    import plotly.graph_objects as go

    floor_stats = {m: fast_regime_floor(rows, m) for m in models}
    ok_models = [m for m, s in floor_stats.items() if s.get('ok')]
    fig = go.Figure()
    if ok_models:
        medians = [floor_stats[m]['median'] for m in ok_models]
        ci_lo = [floor_stats[m]['ci_lo'] for m in ok_models]
        ci_hi = [floor_stats[m]['ci_hi'] for m in ok_models]
        mins = [floor_stats[m]['min'] for m in ok_models]
        ns = [floor_stats[m]['n'] for m in ok_models]
        fig.add_trace(go.Bar(
            x=ok_models, y=medians,
            error_y=dict(
                type='data',
                symmetric=False,
                array=[hi - m for hi, m in zip(ci_hi, medians)],
                arrayminus=[m - lo for lo, m in zip(ci_lo, medians)],
            ),
            name='median (95% bootstrap CI)',
            marker_color='rgb(31,119,180)',
            customdata=list(zip(ns, mins)),
            hovertemplate=('%{x}<br>median %{y:.1f}ms'
                           '<br>n=%{customdata[0]}'
                           '<br>min observed=%{customdata[1]:.1f}ms'
                           '<extra></extra>'),
        ))
        fig.add_trace(go.Scatter(
            x=ok_models, y=mins,
            mode='markers',
            marker=dict(color='rgb(44,160,44)', size=12, symbol='diamond'),
            name='min observed',
            hovertemplate='%{x}<br>min %{y:.1f}ms<extra></extra>',
        ))
    fig.update_layout(
        title=('Fast-regime latency floor per model '
               '(across F ≥ 0.05s, dt < 0.7 × cadence)'),
        xaxis_title='Model',
        yaxis_title='Latency (ms)',
        height=420,
        uirevision='static',
    )
    return fig.to_dict()


def build_fig_cadence_indep(rows: list[dict], models: list[str],
                              cadences: list[float]) -> dict:
    """Plot 4: side-by-side per-cadence boxplots at fast-regime F values."""
    import plotly.graph_objects as go

    fig = go.Figure()
    sentinel_fs = [f for f in (0.050, 0.075, 0.100) if f in F_VALUES]
    has_data = False
    for cadence in cadences:
        ys, xs = [], []
        for model in models:
            for f in sentinel_fs:
                if f >= cadence:
                    continue
                vals = [r['dt_ms'] for r in rows
                        if r['model'] == model
                        and r['cadence_s'] == cadence
                        and r['first_report_s'] == f
                        and r.get('dt_ms') is not None and not r.get('error')]
                # Filter strip slow-outliers so the floor comparison isn't
                # polluted by mis-classified fast cells.
                vals = [v for v in vals if v < cadence * 1000 * 0.7]
                for v in vals:
                    ys.append(v)
                    xs.append(f'{model}<br>F={f}s')
        if ys:
            has_data = True
            fig.add_trace(go.Box(
                x=xs, y=ys,
                name=f'cadence = {cadence}s',
                marker_color=CADENCE_LINE.get(cadence, 'rgb(100,100,100)'),
                boxpoints='outliers',
            ))
    if not has_data:
        fig.update_layout(title='no fast-regime data yet')
    else:
        fig.update_layout(
            title=('Fast-regime cadence-independence check '
                   '(boxes at same F should overlap if hypothesis holds)'),
            yaxis_title='First-response latency (ms)',
            xaxis_title='model × F',
            boxmode='group',
            height=500,
            uirevision='static',
        )
    return fig.to_dict()


# Distinct colours per model for the control plot.
MODEL_COLORS = [
    'rgb(31, 119, 180)',
    'rgb(255, 127, 14)',
    'rgb(44, 160, 44)',
    'rgb(214, 39, 40)',
    'rgb(148, 103, 189)',
    'rgb(140, 86, 75)',
    'rgb(227, 119, 194)',
    'rgb(127, 127, 127)',
]


def fit_control_line(rows: list[dict], model: str) -> dict:
    """OLS fit dt = a + b * cadence_ms on (control_cadence, dt) pairs.
    Slope b ≈ 1 implies dt-rises-1:1-with-cadence (pure cadence-pinning).
    Intercept a is the per-tick / per-eval residual."""
    xs, ys = [], []
    for r in rows:
        if (r['model'] != model or r.get('dt_ms') is None
                or r.get('error') or not f_is_control(r['first_report_s'])):
            continue
        xs.append(r['cadence_s'] * 1000.0)
        ys.append(r['dt_ms'])
    if len(xs) < 3:
        return {'ok': False, 'reason': f'only {len(xs)} control trials'}
    xs_a = np.array(xs)
    ys_a = np.array(ys)
    try:
        slope, intercept, r_value, p_value, stderr = sps.linregress(xs_a, ys_a)
        return {
            'ok': True, 'n': len(xs),
            'slope': float(slope), 'intercept': float(intercept),
            'r_squared': float(r_value ** 2),
            'slope_stderr': float(stderr),
            'p_value': float(p_value),
        }
    except Exception as e:
        return {'ok': False, 'reason': str(e)}


def build_fig_control(rows: list[dict], models: list[str]) -> dict:
    """Plot 5: control latency (no F) vs cadence, per model.
    The 'if you don't use the F knob' curve — establishes the intrinsic
    floor as cadence varies."""
    import plotly.graph_objects as go

    summary = aggregate(rows)
    fig = go.Figure()
    max_cad_ms = 0.0
    any_data = False
    for i, model in enumerate(models):
        color = MODEL_COLORS[i % len(MODEL_COLORS)]
        fill_color = color.replace('rgb', 'rgba').replace(')', ', 0.15)')
        keys = sorted(
            [k for k in summary if k[0] == model and f_is_control(k[2])],
            key=lambda k: k[1],
        )
        if not keys:
            continue
        any_data = True
        xs_ms = [k[1] * 1000.0 for k in keys]
        ys_med = [summary[k]['median'] for k in keys]
        ys_q25 = [summary[k]['q25'] for k in keys]
        ys_q75 = [summary[k]['q75'] for k in keys]
        ns = [summary[k]['n'] for k in keys]
        max_cad_ms = max(max_cad_ms, max(xs_ms))

        # IQR band
        fig.add_trace(go.Scatter(
            x=xs_ms + xs_ms[::-1],
            y=ys_q75 + ys_q25[::-1],
            fill='toself', fillcolor=fill_color,
            line=dict(color='rgba(0,0,0,0)'),
            showlegend=False, hoverinfo='skip',
        ))
        # All trials
        xs_all, ys_all = [], []
        for k in keys:
            for v in summary[k]['all']:
                xs_all.append(k[1] * 1000.0)
                ys_all.append(v)
        fig.add_trace(go.Scatter(
            x=xs_all, y=ys_all, mode='markers',
            marker=dict(size=4, color=color, opacity=0.30),
            showlegend=False,
            hovertemplate='cadence=%{x}ms<br>%{y:.1f}ms<extra></extra>',
        ))
        # Median line
        fit = fit_control_line(rows, model)
        if fit.get('ok'):
            label = (f'{model} (slope={fit["slope"]:.2f}, '
                     f'intercept={fit["intercept"]:.0f}ms, '
                     f'R²={fit["r_squared"]:.3f})')
        else:
            label = model
        fig.add_trace(go.Scatter(
            x=xs_ms, y=ys_med, mode='lines+markers',
            line=dict(color=color, width=2),
            marker=dict(size=7, color=color),
            name=label,
            customdata=ns,
            hovertemplate=('cadence=%{x}ms<br>median=%{y:.1f}ms'
                           '<br>n=%{customdata}<extra></extra>'),
        ))

    # Baseline markers (visits=0, visits=1) at the left edge of the plot,
    # plotted at x = 0 (off the log-ish axis, conceptually "cadence = 0").
    # The visits=0 median is THE pure-overhead floor; visits=1 adds one
    # NN eval; everything else (control, treatment) sits above these.
    for i, model in enumerate(models):
        color = MODEL_COLORS[i % len(MODEL_COLORS)]
        for mv, symbol, dash in ((0, 'diamond', 'dot'),
                                  (1, 'circle', 'dash')):
            bs = baseline_stats(rows, model, mv)
            if not bs.get('ok'):
                continue
            # Horizontal line at the baseline's median, faint, full-width
            fig.add_hline(
                y=bs['median'],
                line=dict(color=color, width=1, dash=dash),
                opacity=0.45,
                annotation_text=f'{model} v={mv}: {bs["median"]:.0f}ms (n={bs["n"]})',
                annotation_position='right',
                annotation_font=dict(size=9, color=color),
            )

    if not any_data:
        fig.update_layout(title='no control data yet — '
                          'sweep needs to reach a control cell')
        return fig.to_dict()

    # Reference: y = x (cadence-only floor) and y = x + 80ms.
    if max_cad_ms > 0:
        ref_xs = [0, max_cad_ms * 1.05]
        fig.add_trace(go.Scatter(
            x=ref_xs, y=ref_xs, mode='lines',
            line=dict(color='gray', dash='dot', width=1),
            name='y = cadence (no overhead)',
            opacity=0.7,
        ))
        fig.add_trace(go.Scatter(
            x=ref_xs, y=[x + 80 for x in ref_xs], mode='lines',
            line=dict(color='gray', dash='dash', width=1),
            name='y = cadence + 80ms',
            opacity=0.7,
        ))

    fig.update_layout(
        title=('CONTROL: first-response latency vs cadence — F knob '
               'OMITTED entirely (no firstReportDuringSearchAfter on '
               'the wire). The "what users get without using the '
               'undocumented knob" floor.'),
        xaxis_title='reportDuringSearchEvery (ms)',
        yaxis_title='First-response latency (ms)',
        height=600,
        uirevision='static',
        hovermode='closest',
    )
    return fig.to_dict()


def build_fig_f_benefit(rows: list[dict], models: list[str],
                          cadences: list[float]) -> dict:
    """Plot 6: F benefit per (model, cadence).
    y = control_expected_at_this_cadence - dt_observed.
    Positive = F helped, negative = F hurt (cliff biting). The argmax
    over F is the best F value to use for this (model, cadence)."""
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    summary = aggregate(rows)
    if not models:
        return go.Figure(layout={'title': 'no data yet'}).to_dict()
    fig = make_subplots(
        rows=len(models), cols=1,
        subplot_titles=[f'Model: {m}' for m in models],
        shared_xaxes=False, vertical_spacing=0.06,
    )
    for r_idx, model in enumerate(models, start=1):
        for cadence in cadences:
            line_color = CADENCE_LINE.get(cadence, 'rgb(100,100,100)')
            keys = sorted(
                [k for k in summary
                 if k[0] == model and k[1] == cadence and k[2] > 0],
                key=lambda k: k[2],
            )
            if not keys:
                continue
            # Prefer measured control median at this exact cadence over
            # the linear-fit extrapolation (the fit oversmooths the
            # cadence-floor-eval curve).
            measured = [r['dt_ms'] for r in rows
                        if r['model'] == model
                        and r['cadence_s'] == cadence
                        and f_is_control(r['first_report_s'])
                        and r.get('dt_ms') is not None
                        and not r.get('error')]
            if len(measured) >= 3:
                expected_control = float(np.median(measured))
            else:
                control_fit = fit_control_line(rows, model)
                if not control_fit.get('ok'):
                    continue
                expected_control = (control_fit['intercept']
                                    + control_fit['slope'] * (cadence * 1000.0))
            xs = [k[2] for k in keys]
            ys_med = [expected_control - summary[k]['median'] for k in keys]
            ys_q25 = [expected_control - summary[k]['q75'] for k in keys]
            ys_q75 = [expected_control - summary[k]['q25'] for k in keys]

            fig.add_trace(go.Scatter(
                x=xs + xs[::-1], y=ys_q75 + ys_q25[::-1],
                fill='toself',
                fillcolor=CADENCE_FILL.get(cadence,
                                           'rgba(100,100,100,0.18)'),
                line=dict(color='rgba(0,0,0,0)'),
                showlegend=False, hoverinfo='skip',
            ), row=r_idx, col=1)

            fig.add_trace(go.Scatter(
                x=xs, y=ys_med, mode='lines+markers',
                line=dict(color=line_color, width=2),
                marker=dict(size=7, color=line_color),
                name=f'cadence = {cadence}s',
                legendgroup=f'C{cadence}',
                showlegend=(r_idx == 1),
                hovertemplate=('F=%{x}s<br>benefit=%{y:+.1f}ms vs control'
                               '<extra></extra>'),
            ), row=r_idx, col=1)

        fig.add_hline(y=0, line=dict(color='black', width=1), opacity=0.6,
                      row=r_idx, col=1)
        fig.update_xaxes(type='log',
                         title='firstReportDuringSearchAfter (s)',
                         row=r_idx, col=1)
        fig.update_yaxes(title='Latency saved vs no-F control (ms)',
                         row=r_idx, col=1)
    fig.update_layout(
        title=('F BENEFIT — does the F knob help? '
               'Positive = F saves latency vs not setting F. '
               'Negative = F makes it worse (cliff biting).'),
        height=400 * max(1, len(models)),
        uirevision='static',
        hovermode='closest',
    )
    return fig.to_dict()


# ---------------------------------------------------------------------------
# Findings HTML.

def _fmt_ms(v: Optional[float]) -> str:
    return '—' if v is None else f'{v:.1f}'


def _fmt_s_to_ms(v: Optional[float]) -> str:
    return '—' if v is None else f'{v*1000:.2f}'


def findings_html(findings: dict, models: list[str],
                   cadences: list[float]) -> str:
    parts = []

    # Cliffs.
    parts.append('<h3>Cliff position (logistic fit to pinned-fraction vs F)</h3>')
    parts.append('<table><tr>'
                 '<th>Model</th><th>Cadence</th>'
                 '<th>F<sub>50</sub> cliff midpoint (ms)</th>'
                 '<th>F<sub>10</sub> – F<sub>90</sub> strip (ms)</th>'
                 '<th>Strip width (ms)</th>'
                 '<th>Status</th></tr>')
    for model in models:
        for cadence in cadences:
            c = findings['cliffs'].get(model, {}).get(cadence, {})
            if c.get('ok'):
                parts.append(
                    f'<tr><td>{model}</td><td>{cadence:.3f} s</td>'
                    f'<td>{_fmt_s_to_ms(c["F50_s"])}</td>'
                    f'<td>{_fmt_s_to_ms(c["F10_s"])} – '
                    f'{_fmt_s_to_ms(c["F90_s"])}</td>'
                    f'<td>{_fmt_s_to_ms(c["strip_width_s"])}</td>'
                    f'<td>fit ok (n={c["n_total_trials"]})</td></tr>'
                )
            else:
                parts.append(
                    f'<tr><td>{model}</td><td>{cadence:.3f} s</td>'
                    f'<td colspan="3">—</td>'
                    f'<td>{c.get("reason", "no fit")}</td></tr>'
                )
    parts.append('</table>')

    # Floors.
    parts.append('<h3>Fast-regime latency floor (across F ≥ 0.05s, '
                 'dt &lt; 0.7×cadence)</h3>')
    parts.append('<table><tr>'
                 '<th>Model</th>'
                 '<th>median (ms)</th>'
                 '<th>95% CI</th>'
                 '<th>min observed</th>'
                 '<th>p10–p90</th>'
                 '<th>n</th>'
                 '</tr>')
    for model in models:
        f = findings['floors'].get(model, {})
        if f.get('ok'):
            parts.append(
                f'<tr><td>{model}</td>'
                f'<td>{_fmt_ms(f["median"])}</td>'
                f'<td>[{_fmt_ms(f["ci_lo"])}, {_fmt_ms(f["ci_hi"])}]</td>'
                f'<td>{_fmt_ms(f["min"])}</td>'
                f'<td>{_fmt_ms(f["p10"])} – {_fmt_ms(f["p90"])}</td>'
                f'<td>{f["n"]}</td></tr>'
            )
        else:
            parts.append(
                f'<tr><td>{model}</td><td colspan="5">{f.get("reason","")}</td></tr>'
            )
    parts.append('</table>')

    # Cadence-independence per (model, F).
    parts.append('<h3>Cadence-independence (Mann-Whitney U, '
                 'fast regime; small p ⇒ cadence DOES affect latency)</h3>')
    parts.append('<table><tr>'
                 '<th>Model</th><th>F (s)</th>'
                 f'<th>median @ {cadences[0]:.3f}s</th>'
                 f'<th>median @ {cadences[1]:.3f}s</th>'
                 '<th>Δ (ms)</th>'
                 '<th>n₁ / n₂</th>'
                 '<th>p-value</th>'
                 '<th>verdict</th></tr>')
    for model in models:
        for f, res in sorted(findings['cadence_indep'].get(model, {}).items()):
            if res.get('ok'):
                # Bonferroni-like sanity check across the ~5 F values × N models.
                tested = max(1, len(models) * len(findings['cadence_indep']
                                                  .get(model, {})))
                alpha_adj = 0.05 / tested
                verdict = ('cadence matters' if res['p_value'] < alpha_adj
                           else 'consistent with independence')
                parts.append(
                    f'<tr><td>{model}</td><td>{f}</td>'
                    f'<td>{_fmt_ms(res["median_c1"])}</td>'
                    f'<td>{_fmt_ms(res["median_c2"])}</td>'
                    f'<td>{_fmt_ms(res["effect_ms"])}</td>'
                    f'<td>{res["n1"]} / {res["n2"]}</td>'
                    f'<td>{res["p_value"]:.4g}</td>'
                    f'<td>{verdict}</td></tr>'
                )
            else:
                parts.append(
                    f'<tr><td>{model}</td><td>{f}</td>'
                    f'<td colspan="5">{res.get("reason","")}</td>'
                    f'<td>—</td></tr>'
                )
    parts.append('</table>')

    # True floor: visits ∈ {0, 1, 32, 64} baselines.
    parts.append('<h3>True floor — baseline cells (no cadence, no F on wire)</h3>'
                 '<p>'
                 '<b>visits=0</b>: validator rebuff — pure wire+dispatch+RTT.<br>'
                 '<b>visits=1</b>: one NN eval on a batch of 1 (worst-case per-eval cost).<br>'
                 '<b>visits=32</b>: one full GPU batch (KataGo nnMaxBatchSize=32).<br>'
                 '<b>visits=64</b>: two full batches.<br>'
                 'Derived: (v=64 − v=32) ≈ one batch forward-pass cost; '
                 '/ 32 ≈ amortized per-visit cost during heavy search.</p>')
    parts.append('<table><tr>'
                 '<th>Model</th><th>maxVisits</th>'
                 '<th>median (ms)</th>'
                 '<th>95% CI</th>'
                 '<th>min</th>'
                 '<th>p10 – p90</th>'
                 '<th>n</th>'
                 '</tr>')
    baselines_dict = findings.get('baselines', {})
    for model in models:
        b = baselines_dict.get(model, {})
        for mv in MAX_VISITS_BASELINES:
            s = b.get(mv, {})
            if s.get('ok'):
                parts.append(
                    f'<tr><td>{model}</td><td>{mv}</td>'
                    f'<td>{_fmt_ms(s["median"])}</td>'
                    f'<td>[{_fmt_ms(s["ci_lo"])}, {_fmt_ms(s["ci_hi"])}]</td>'
                    f'<td>{_fmt_ms(s["min"])}</td>'
                    f'<td>{_fmt_ms(s["p10"])} – {_fmt_ms(s["p90"])}</td>'
                    f'<td>{s["n"]}</td></tr>'
                )
            else:
                parts.append(
                    f'<tr><td>{model}</td><td>{mv}</td>'
                    f'<td colspan="5">n={s.get("n", 0)} (need ≥3)</td></tr>'
                )
    parts.append('</table>')
    # Derived per-batch cost: (v=64 - v=32) / 1 (one extra batch worth).
    parts.append('<h4>Derived per-batch forward-pass cost</h4>')
    parts.append('<table><tr><th>Model</th>'
                 '<th>1 batch = v=64 − v=32 (ms)</th>'
                 '<th>amortized per-visit (÷32)</th>'
                 '<th>v=1 (batch-of-1 upper bound)</th>'
                 '<th>batching speedup ratio</th></tr>')
    for model in models:
        b = baselines_dict.get(model, {})
        b1 = b.get(1, {})
        b32 = b.get(32, {})
        b64 = b.get(64, {})
        if b32.get('ok') and b64.get('ok'):
            one_batch = b64['median'] - b32['median']
            amort = one_batch / 32.0
            ratio_str = (f'{b1["median"] / amort:.1f}×' if b1.get('ok') and amort > 0
                         else '—')
            parts.append(
                f'<tr><td>{model}</td>'
                f'<td>{one_batch:.1f}</td>'
                f'<td>{amort:.2f}</td>'
                f'<td>{_fmt_ms(b1.get("median"))}</td>'
                f'<td>{ratio_str}</td></tr>'
            )
        else:
            parts.append(f'<tr><td>{model}</td><td colspan="4">need v=32 and v=64 data</td></tr>')
    parts.append('</table>')

    # Control regression.
    parts.append('<h3>Control regression: dt = a + b × cadence (F omitted)</h3>'
                 '<p>If b ≈ 1.0, latency rises 1:1 with cadence — pure '
                 'cadence-pinning. Intercept a is the per-tick + per-eval '
                 'residual.</p>')
    parts.append('<table><tr>'
                 '<th>Model</th>'
                 '<th>intercept a (ms)</th>'
                 '<th>slope b</th>'
                 '<th>slope std-err</th>'
                 '<th>R²</th>'
                 '<th>n</th>'
                 '</tr>')
    control_fits = findings.get('control_fits', {})
    for model in models:
        fit = control_fits.get(model, {})
        if fit.get('ok'):
            parts.append(
                f'<tr><td>{model}</td>'
                f'<td>{_fmt_ms(fit["intercept"])}</td>'
                f'<td>{fit["slope"]:.3f}</td>'
                f'<td>±{fit["slope_stderr"]:.3f}</td>'
                f'<td>{fit["r_squared"]:.4f}</td>'
                f'<td>{fit["n"]}</td></tr>'
            )
        else:
            parts.append(
                f'<tr><td>{model}</td>'
                f'<td colspan="5">{fit.get("reason", "—")}</td></tr>'
            )
    parts.append('</table>')

    return '\n'.join(parts)


def status_html(state: SweepState) -> str:
    if state.start_perf is None and state.total_cells == 0:
        return ('<b>idle</b> — viewing existing data only '
                f'(<code>{state.csv_path}</code>, {state.done_count} trials loaded)')
    if state.sweep_failed is not None:
        return f'<b>sweep failed</b>: {state.sweep_failed}'
    if state.sweep_complete:
        elapsed = (time.perf_counter() - state.start_perf
                   if state.start_perf else 0)
        return (f'<b>sweep complete</b> — {state.done_count} trials in '
                f'{elapsed/60:.1f} min. Server still running.')
    elapsed = (time.perf_counter() - state.start_perf
               if state.start_perf else 0)
    done = state.done_count
    total = state.total_cells
    rate = done / max(elapsed, 1e-9) if elapsed > 0 else 0
    remaining = total - done
    eta_min = remaining / max(rate, 1e-9) / 60 if rate > 0 else 0
    cell = state.current_cell or ('?', '?', '?', '?')
    return (
        f'<b>running</b> — {done}/{total} trials '
        f'({100 * done / max(total, 1):.1f}%), '
        f'elapsed {elapsed/60:.1f} min, eta {eta_min:.1f} min'
        f'<br>currently: model={cell[0]} cadence={cell[1]}s '
        f'F={cell[2]}s trial={cell[3]}'
    )


# ---------------------------------------------------------------------------
# Aiohttp handlers.

INDEX_HTML = """\
<!doctype html>
<html><head><meta charset="utf-8">
<title>KataGo latency sweep — live</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 1500px; margin: 1em auto;
       padding: 0 1em; color: #222; }
#status { background: #f0f4ff; padding: 0.6em 1em; border-radius: 4px;
          margin: 0.5em 0; font-family: monospace; }
#findings { background: #f8f8f8; padding: 1em; border-radius: 4px;
            margin: 0.5em 0; font-size: 0.92em; }
#findings table { border-collapse: collapse; margin: 0.6em 0; }
#findings th, #findings td { border: 1px solid #ccc; padding: 4px 8px;
                              text-align: right; }
#findings th { background: #e8e8e8; }
#findings td:first-child, #findings th:first-child { text-align: left; }
h1 { margin-bottom: 0.2em; }
h2 { margin-top: 1.5em; border-top: 1px solid #ccc; padding-top: 0.7em; }
.error { color: #c33; }
.refresh { color: #666; font-size: 0.85em; }
</style>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
</head><body>
<h1>KataGo first-response latency sweep — live</h1>
<div id="status">loading…</div>
<div class="refresh">auto-refresh every 4s — <span id="lastFetch"></span></div>
<h2>Statistical findings</h2>
<div id="findings">loading…</div>
<h2>CONTROL: latency vs cadence with F-knob OMITTED (the no-F baseline)</h2>
<div id="plot5" style="min-height:600px"></div>
<h2>F BENEFIT: does setting F help? (control − observed, positive = saves latency)</h2>
<div id="plot6" style="min-height:400px"></div>
<h2>Latency vs F</h2>
<div id="plot1" style="min-height:400px"></div>
<h2>Pinned fraction vs F (where is the cliff?)</h2>
<div id="plot2" style="min-height:400px"></div>
<h2>Fast-regime floor</h2>
<div id="plot3" style="min-height:420px"></div>
<h2>Cadence-independence check (fast regime)</h2>
<div id="plot4" style="min-height:500px"></div>

<script>
const PLOTS = ['plot1','plot2','plot3','plot4','plot5','plot6'];

async function refresh() {
  try {
    const r = await fetch('/data.json', {cache:'no-store'});
    if (!r.ok) {
      document.getElementById('status').innerHTML =
        '<span class="error">fetch failed: ' + r.status + '</span>';
      return;
    }
    const j = await r.json();
    document.getElementById('status').innerHTML = j.status_html || '';
    document.getElementById('findings').innerHTML = j.findings_html || '';
    for (const id of PLOTS) {
      if (j[id]) {
        Plotly.react(id, j[id].data, j[id].layout, {responsive: true});
      }
    }
    document.getElementById('lastFetch').textContent =
      'last update ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('status').innerHTML =
      '<span class="error">' + e + '</span>';
  }
}

refresh();
setInterval(refresh, 4000);
</script>
</body></html>
"""


async def handler_index(request: web.Request) -> web.Response:
    return web.Response(text=INDEX_HTML, content_type='text/html')


async def handler_data(request: web.Request) -> web.Response:
    state: SweepState = request.app['state']
    models = state.models or sorted({r['model'] for r in state.rows})
    cadences = state.cadences
    findings = compute_findings(state.rows, models, cadences)
    payload = {
        'plot1': build_fig_latency_vs_f(state.rows, models, cadences),
        'plot2': build_fig_pinned_fraction(state.rows, models, cadences),
        'plot3': build_fig_floor(state.rows, models),
        'plot4': build_fig_cadence_indep(state.rows, models, cadences),
        'plot5': build_fig_control(state.rows, models),
        'plot6': build_fig_f_benefit(state.rows, models, cadences),
        'status_html': status_html(state),
        'findings_html': findings_html(findings, models, cadences),
    }
    return web.json_response(payload)


async def handler_csv(request: web.Request) -> web.FileResponse:
    state: SweepState = request.app['state']
    return web.FileResponse(state.csv_path)


# ---------------------------------------------------------------------------
# Sweep coroutine.

async def sweep_task(state: SweepState) -> None:
    try:
        print(f'[sweep] connecting to {WS_URL}')
        async with websockets.connect(
            WS_URL, max_size=None,
            ping_interval=20, ping_timeout=30,
        ) as ws:
            print('[sweep] connected')
            drained = await drain_until_quiet(ws, quiet_s=0.2,
                                              max_total_s=STARTUP_DRAIN_MAX_S)
            if drained:
                print(f'[sweep] drained {drained} startup msg(s)')

            version = await query_version(ws)
            state.version_info = version
            print(f'[sweep] version: {version!r}')

            models_resp = await query_models(ws)
            print(f'[sweep] models advertised: {models_resp}')
            healthy = [m['label'] for m in models_resp if m['healthy']]
            unhealthy = [m['label'] for m in models_resp if not m['healthy']]
            if unhealthy:
                print(f'[sweep] skipping unhealthy: {unhealthy}')

            if state.only_model is not None:
                if state.only_model not in healthy:
                    msg = (f'requested model {state.only_model!r} not in '
                           f'healthy set {healthy}')
                    state.sweep_failed = msg
                    print(f'[sweep] {msg}; aborting')
                    return
                models = [state.only_model]
            else:
                models = healthy
            if not models:
                state.sweep_failed = 'no healthy models'
                print('[sweep] no healthy models; aborting')
                return

            state.models = models

            done = {(r['model'], r['cadence_s'], r['first_report_s'],
                     r['trial_idx'], r.get('max_visits', MAX_VISITS_FULL))
                    for r in state.rows}
            all_cells = cells_for(models, state.cadences,
                                  state.control_cadences, state.f_values,
                                  state.trials_per_cell)
            state.total_cells = len(all_cells)
            remaining = [c for c in all_cells if c not in done]
            print(f'[sweep] cells total={len(all_cells)} '
                  f'already-done={len(done)} remaining={len(remaining)}')

            state.start_perf = time.perf_counter()
            for i, cell in enumerate(remaining):
                model, cadence, first_report, trial_idx, max_visits = cell
                state.current_cell = cell
                row = await one_trial(ws, model, cadence, first_report,
                                      trial_idx, max_visits)
                state.append(row)

                dt = row['dt_ms']
                dt_str = f'{dt:7.1f}ms' if dt is not None else ' NO-PACKET'
                err_str = f' ERR={row["error"]}' if row.get('error') else ''
                elapsed = time.perf_counter() - state.start_perf
                rate = (i + 1) / max(elapsed, 1e-9)
                eta_min = (len(remaining) - (i + 1)) / max(rate, 1e-9) / 60.0
                if is_baseline_cell(max_visits):
                    print(
                        f'[sweep] {i+1:>5}/{len(remaining)}  '
                        f'model={model:<14} BASELINE v={max_visits}      '
                        f'           t={trial_idx:>2}  dt={dt_str}{err_str}  '
                        f'(eta {eta_min:5.1f} min)'
                    )
                else:
                    print(
                        f'[sweep] {i+1:>5}/{len(remaining)}  '
                        f'model={model:<14} C={cadence:>5.3f} F={first_report:>6.4f} '
                        f't={trial_idx:>2}  dt={dt_str}{err_str}  '
                        f'(eta {eta_min:5.1f} min)'
                    )
            state.sweep_complete = True
            print(f'[sweep] complete')
    except (websockets.exceptions.ConnectionClosed, OSError) as e:
        state.sweep_failed = f'connection error: {e}'
        print(f'[sweep] connection error: {e}')
    except asyncio.CancelledError:
        print('[sweep] cancelled')
        raise


# ---------------------------------------------------------------------------
# Main subcommands.

async def main_run(args) -> None:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.out_dir / 'sweep_results.csv'
    state = SweepState(csv_path, args.trials, args.only_model)
    app = web.Application()
    app['state'] = state
    app.router.add_get('/', handler_index)
    app.router.add_get('/data.json', handler_data)
    app.router.add_get('/sweep_results.csv', handler_csv)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, args.bind, args.port)
    await site.start()
    print(f'[serve] http://{args.bind}:{args.port}/')

    if args.no_sweep:
        print('[serve] --no-sweep: serving existing CSV only')
        await asyncio.Event().wait()
        return

    sweep = asyncio.create_task(sweep_task(state))
    try:
        await sweep
    except asyncio.CancelledError:
        pass
    print('[run] sweep coroutine returned; server still serving '
          '(Ctrl+C to stop)')
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass


def main_analyze(args) -> None:
    csv_path = args.out_dir / 'sweep_results.csv'
    rows = load_csv_rows(csv_path)
    if not rows:
        print('no data')
        return
    models = sorted({r['model'] for r in rows})
    cadences = list(CADENCES)  # treatment cadences only
    findings = compute_findings(rows, models, cadences)

    n_total = len(rows)
    n_success = sum(1 for r in rows
                    if r.get('dt_ms') is not None and not r.get('error'))
    n_control = sum(1 for r in rows
                    if r.get('dt_ms') is not None and not r.get('error')
                    and f_is_control(r['first_report_s']))
    print(f'=== KataGo latency sweep — {n_success}/{n_total} '
          f'successful trials ({n_control} control) ===')
    print(f'CSV: {csv_path}')
    print(f'Models: {models}')
    print(f'Treatment cadences: {cadences}')
    control_cadences = sorted({r['cadence_s'] for r in rows
                               if f_is_control(r['first_report_s'])
                               and r.get('max_visits', MAX_VISITS_FULL) == MAX_VISITS_FULL})
    print(f'Control cadences seen: {control_cadences}')
    print()

    # True-floor baselines first.
    print('=== TRUE FLOOR — baseline cells (no cadence, no F on wire) ===')
    print(f'{"model":<14} {"v":>4} {"n":>4} {"med (ms)":>9} '
          f'{"95% CI":>22} {"min":>7} {"p10":>7} {"p90":>7}')
    for model in models:
        b = findings['baselines'].get(model, {})
        for mv in MAX_VISITS_BASELINES:
            s = b.get(mv, {})
            if s.get('ok'):
                print(f'{model:<14} {mv:>4} {s["n"]:>4} {s["median"]:>9.2f} '
                      f'[{s["ci_lo"]:>7.2f},{s["ci_hi"]:>7.2f}]  '
                      f'{s["min"]:>7.2f} {s["p10"]:>7.2f} {s["p90"]:>7.2f}')
            else:
                print(f'{model:<14} {mv:>4} {s.get("n", 0):>4}  (need ≥3)')
    print()
    # Derived per-batch / amortized eval cost.
    print('=== Derived: per-batch forward-pass cost ===')
    print(f'{"model":<14} {"1 batch (v64-v32)":>18} {"per-visit amort (/32)":>22} '
          f'{"v=1 upper bound":>16} {"batching speedup":>17}')
    for model in models:
        b = findings['baselines'].get(model, {})
        b1 = b.get(1, {})
        b32 = b.get(32, {})
        b64 = b.get(64, {})
        if b32.get('ok') and b64.get('ok'):
            one_batch = b64['median'] - b32['median']
            amort = one_batch / 32.0
            v1 = b1['median'] if b1.get('ok') else None
            speed = f'{v1 / amort:.1f}×' if v1 and amort > 0 else '—'
            v1_str = f'{v1:.2f}' if v1 else '—'
            print(f'{model:<14} {one_batch:>15.2f} ms '
                  f'{amort:>17.3f} ms {v1_str:>14} ms {speed:>17}')
        else:
            print(f'{model:<14} (need v=32 and v=64 data)')
    print()

    # Control regression — the no-F baseline characterization.
    print('=== CONTROL: dt vs cadence regression (F omitted on wire) ===')
    print(f'{"model":<14} {"intercept (ms)":>14} {"slope":>8} '
          f'{"slope SE":>10} {"R²":>8} {"n":>5}')
    for model in models:
        fit = findings['control_fits'].get(model, {})
        if fit.get('ok'):
            print(f'{model:<14} {fit["intercept"]:>14.2f} '
                  f'{fit["slope"]:>8.3f} ±{fit["slope_stderr"]:>8.3f} '
                  f'{fit["r_squared"]:>8.4f} {fit["n"]:>5}')
        else:
            print(f'{model:<14} {fit.get("reason", "—")}')
    print()

    # Cliffs.
    print('=== Cliff position per (model, cadence) ===')
    print(f'{"model":<14} {"cad":<7} {"F50 (ms)":>9} '
          f'{"strip F10–F90 (ms)":>20} {"width (ms)":>10} {"status":<28}')
    for model in models:
        for cadence in cadences:
            c = findings['cliffs'].get(model, {}).get(cadence, {})
            if c.get('ok'):
                print(f'{model:<14} {cadence:<7.3f} '
                      f'{c["F50_s"]*1000:>9.2f} '
                      f'{c["F10_s"]*1000:>9.2f} – {c["F90_s"]*1000:>6.2f} '
                      f'{c["strip_width_s"]*1000:>10.2f} '
                      f'fit (n={c["n_total_trials"]})')
            else:
                print(f'{model:<14} {cadence:<7.3f} '
                      f'{"—":>9} {"—":>20} {"—":>10} '
                      f'{c.get("reason", "no fit"):<28}')
    print()

    # Floors.
    print('=== Fast-regime floor per model (F ≥ 0.05s, dt < 0.7×cadence) ===')
    print(f'{"model":<14} {"med (ms)":>9} {"95% CI":>20} '
          f'{"min":>7} {"p10":>7} {"p90":>7} {"n":>5}')
    for model in models:
        f = findings['floors'].get(model, {})
        if f.get('ok'):
            print(f'{model:<14} {f["median"]:>9.2f} '
                  f'[{f["ci_lo"]:>6.2f},{f["ci_hi"]:>6.2f}]   '
                  f'{f["min"]:>7.2f} {f["p10"]:>7.2f} {f["p90"]:>7.2f} '
                  f'{f["n"]:>5}')
        else:
            print(f'{model:<14} {f.get("reason", "no data")}')
    print()

    # Cadence-independence.
    print('=== Cadence-independence (Mann-Whitney U, fast regime) ===')
    print(f'{"model":<14} {"F (s)":>7} {"med@c1":>8} {"med@c2":>8} '
          f'{"Δ ms":>7} {"n1/n2":>9} {"p-value":>10} verdict')
    for model in models:
        for f, res in sorted(findings['cadence_indep'].get(model, {}).items()):
            if res.get('ok'):
                tested = max(1, len(models) * len(findings['cadence_indep']
                                                  .get(model, {})))
                alpha_adj = 0.05 / tested
                verdict = ('cadence MATTERS' if res['p_value'] < alpha_adj
                           else 'indep ✓')
                print(f'{model:<14} {f:>7.3f} '
                      f'{res["median_c1"]:>8.2f} {res["median_c2"]:>8.2f} '
                      f'{res["effect_ms"]:>7.2f} '
                      f'{res["n1"]:>4}/{res["n2"]:<4} '
                      f'{res["p_value"]:>10.4g} {verdict}')
            else:
                print(f'{model:<14} {f:>7.3f} '
                      f'{res.get("reason", "—"):<48}')
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description='KataGo first-response parameter sweep (realtime)')
    sub = parser.add_subparsers(dest='cmd', required=True)

    default_out = Path(__file__).resolve().parent / 'sweep_results'

    p_run = sub.add_parser('run', help='Sweep AND serve live dashboard')
    p_run.add_argument('--out-dir', type=Path, default=default_out)
    p_run.add_argument('--trials', type=int, default=TRIALS_PER_CELL)
    p_run.add_argument('--only-model', type=str, default=None)
    p_run.add_argument('--bind', type=str, default='192.168.122.68')
    p_run.add_argument('--port', type=int, default=8000)
    p_run.add_argument('--no-sweep', action='store_true',
                       help='Serve only, do not run a sweep')

    p_serve = sub.add_parser('serve', help='Serve dashboard only (no sweep)')
    p_serve.add_argument('--out-dir', type=Path, default=default_out)
    p_serve.add_argument('--trials', type=int, default=TRIALS_PER_CELL)
    p_serve.add_argument('--only-model', type=str, default=None)
    p_serve.add_argument('--bind', type=str, default='192.168.122.68')
    p_serve.add_argument('--port', type=int, default=8000)

    p_analyze = sub.add_parser('analyze',
                                help='Print statistical findings to stdout')
    p_analyze.add_argument('--out-dir', type=Path, default=default_out)

    args = parser.parse_args()

    if args.cmd == 'run':
        try:
            asyncio.run(main_run(args))
        except KeyboardInterrupt:
            print('\n[run] interrupted')
    elif args.cmd == 'serve':
        args.no_sweep = True
        try:
            asyncio.run(main_run(args))
        except KeyboardInterrupt:
            print('\n[serve] interrupted')
    elif args.cmd == 'analyze':
        main_analyze(args)


if __name__ == '__main__':
    main()
