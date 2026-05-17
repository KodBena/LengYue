#!/usr/bin/env python3
"""
optimize_f.py

Adaptive algorithm to find the lowest-latency firstReportDuringSearchAfter
(F) for a given (model, reportDuringSearchEvery) configuration, taking
the bug's structural shape into account.

Algorithm: bisection on a binary classifier. dt(F) has two regimes
separated by a sharp step (the cliff):
  - Below cliff: dt ≈ cadence_tick + F + ~17 ms (always tardy)
  - Above cliff: dt ≈ F + ~17 ms (honored, fast)
The optimal F is the smallest value above the cliff. We bisect on the
binary question "is F above the cliff?" rather than try to optimise dt
smoothly.

Classification rule for one F value: take samples one at a time. The
instant ANY sample comes back tardy (dt > tardy_threshold), the F is
blacklisted as pinned and sampling aborts. F is classified as honored
only if min_samples consecutive non-tardy samples land. This handles
the strip-flip correctly — even a 10%-tardy F gets caught after ~7
samples and rejected, since a production user would be bitten by the
tail.

Validation: a CSVSimulatedEngine snaps requested F to the nearest cell
in the existing sweep data and draws dt from that cell's empirical
distribution. The algorithm is run against every (model, cadence) and
its recommendation is checked against the cliff positions known from
the full sweep.

License: Public Domain (The Unlicense).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import random
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Protocol

import numpy as np
import websockets


# ---------------------------------------------------------------------------
# Engine protocol — the algorithm only knows how to make measurements;
# subbing in a real WebSocket engine vs. a CSV-replay simulation is just
# a matter of which concrete implementation gets passed in.

class Engine(Protocol):
    async def measure(self, model: str, cadence_s: float,
                      first_report_s: Optional[float]) -> float:
        """Run one trial. Returns dt in ms. None first_report_s means
        omit firstReportDuringSearchAfter entirely from the wire."""
        ...


# ---------------------------------------------------------------------------
# Algorithm.

@dataclass
class FProbe:
    """Per-F sampling record kept for diagnostics."""
    f_s: float
    samples_ms: list[float] = field(default_factory=list)
    classification: str = 'unknown'  # 'pinned' | 'honored' | 'unknown'
    aborted_on_tardy: bool = False


@dataclass
class OptimizeResult:
    model: str
    cadence_s: float
    control_dt_ms: Optional[float]
    tardy_threshold_ms: Optional[float]
    best_f_s: Optional[float]
    expected_dt_ms: Optional[float]
    savings_ms: Optional[float]
    bracket_s: Optional[tuple[float, float]]
    queries_total: int
    history: list[FProbe]
    note: str = ''


async def find_best_f(
    engine: Engine,
    model: str,
    cadence_s: float,
    *,
    F_min_s: float = 0.001,
    F_max_s: Optional[float] = None,
    resolution_s: float = 0.001,
    tardy_factor: float = 0.5,
    pinned_reference_samples: int = 6,
    safety_margin_s: float = 0.002,
    min_savings_ms: float = 20.0,
    control_samples: int = 10,
    classify_min_samples: int = 6,
    classify_max_samples: int = 15,
    scan_max_tardy_allowed: int = 1,
    verbose: bool = False,
) -> OptimizeResult:
    """Find the smallest F that is reliably honored for (model, cadence).

    Parameters
    ----------
    engine : Engine
        Anything with async measure(model, cadence_s, first_report_s) -> ms.
    F_min_s : lower bracket. Default 1 ms.
    F_max_s : upper bracket. Default cadence_s - 5 ms.
    resolution_s : stop bisecting once bracket width is below this.
    tardy_factor : a sample at F is tardy iff (dt - F) > extra_threshold,
                   where extra_threshold = (dt_at_F_min - F_min)
                                            − tardy_factor × cadence.
                   F=F_min is used as a pinned reference (≈ always
                   pinned since cliff > F_min for all real cases). Pinned
                   shape is dt = N·cadence + F + offset, so predicted
                   pinned dt at any F is dt_at_F_min + (F - F_min).
                   Anything significantly less than that prediction is
                   honored. Robust against slow models (eval > cadence)
                   AND F-near-cadence cases.
    pinned_reference_samples : samples to take at F_min to estimate the
                               pinned-regime dt (used to compute the
                               tardy threshold).
    safety_margin_s : recommended F is F_high + this (cushion above the cliff
                      so future noise doesn't flip back into the strip).
    min_savings_ms : if the expected dt at the recommended F is less than
                     min_savings_ms below the control_dt, the
                     recommendation is rejected (None returned). Protects
                     against the algorithm picking an F that "passes the
                     tardy test" but is actually slower than no-F at all.
    control_samples : how many samples to take for the no-F baseline.
    classify_min_samples : F must produce this many non-tardy samples
                           (within the allowed-tardy budget) to be
                           classified as honored.
    classify_max_samples : hard cap on samples per F.
    scan_max_tardy_allowed : during the geometric scan phase, allow up
                             to this many tardy samples before declaring
                             pinned. Bisection always uses strict (0)
                             so the FINAL recommendation never includes
                             an F that tardied during sampling. The
                             scan is more forgiving because a strip-flip
                             on F_max shouldn't abort the whole search.

    Returns
    -------
    OptimizeResult.
    """
    history: list[FProbe] = []
    queries_total = 0
    cadence_ms = cadence_s * 1000.0

    if F_max_s is None:
        F_max_s = max(cadence_s - 0.005, F_min_s + 0.001)

    def log(msg):
        if verbose:
            print(f'  [{model} C={cadence_s:.3f}] {msg}')

    # --- 1. Calibrate: control reference (F omitted entirely).
    control_dts = []
    for _ in range(control_samples):
        dt = await engine.measure(model, cadence_s, None)
        control_dts.append(dt)
        queries_total += 1
    control_dt_ms = float(np.median(control_dts))
    log(f'control dt median = {control_dt_ms:.1f} ms')

    # --- 1b. Pinned reference at F = F_min. F_min=1ms is far below any
    # plausible cliff, so this gives us dt in the pinned regime. The
    # bug shape (pinned dt = N*cadence + F + offset) lets us predict
    # the pinned dt at any F.
    ref_dts = []
    for _ in range(pinned_reference_samples):
        dt = await engine.measure(model, cadence_s, F_min_s)
        ref_dts.append(dt)
        queries_total += 1
    dt_at_F_min_ms = float(np.median(ref_dts))
    F_min_ms = F_min_s * 1000.0
    # Tardy threshold: at any F, predicted pinned dt is
    #   pred_pinned = dt_at_F_min - F_min_ms + F_ms
    # i.e. (dt - F) = (dt_at_F_min - F_min_ms) under pinned. Honored
    # subtracts at least 1 cadence from that. Use tardy_factor × cadence
    # as the gap below predicted-pinned that still counts as "pinned".
    extra_pinned_baseline = dt_at_F_min_ms - F_min_ms
    extra_threshold_ms = extra_pinned_baseline - tardy_factor * cadence_ms
    log(f'pinned ref @F={F_min_ms:.1f}ms = {dt_at_F_min_ms:.1f}ms; '
        f'tardy iff (dt-F) > {extra_threshold_ms:.1f} ms')

    # Sanity check: if extra_threshold is negative, the pinned reference
    # at F_min is already very small (cliff is at or below F_min). That
    # means F_min itself is honored — return it directly.
    if extra_threshold_ms <= 0:
        return OptimizeResult(
            model=model, cadence_s=cadence_s,
            control_dt_ms=control_dt_ms,
            tardy_threshold_ms=extra_threshold_ms,
            best_f_s=F_min_s,
            expected_dt_ms=dt_at_F_min_ms,
            savings_ms=control_dt_ms - dt_at_F_min_ms,
            bracket_s=(F_min_s, F_min_s),
            queries_total=queries_total,
            history=[FProbe(f_s=F_min_s, samples_ms=ref_dts,
                            classification='honored')],
            note=f'F_min already honored (pinned reference dt {dt_at_F_min_ms:.1f}ms '
                 f'is too low for cadence {cadence_ms:.0f}ms — cliff is at or below F_min)',
        )

    async def classify(F_s: float, max_tardy_allowed: int = 0) -> FProbe:
        """Sample F until classification reached. max_tardy_allowed=0
        gives strict mode (any tardy → pinned), useful for the final
        recommendation. max_tardy_allowed>0 lets the scan tolerate
        occasional strip-flips so the search doesn't abort on a single
        unlucky sample at the boundary."""
        nonlocal queries_total
        probe = FProbe(f_s=F_s)
        F_ms = F_s * 1000.0
        honored_count = 0
        tardy_count = 0
        for _ in range(classify_max_samples):
            dt = await engine.measure(model, cadence_s, F_s)
            queries_total += 1
            probe.samples_ms.append(dt)
            extra = dt - F_ms
            if extra > extra_threshold_ms:
                tardy_count += 1
                if tardy_count > max_tardy_allowed:
                    probe.classification = 'pinned'
                    probe.aborted_on_tardy = True
                    log(f'  F={F_ms:.1f} ms: tardy budget exhausted '
                        f'({tardy_count}/{max_tardy_allowed} allowed) '
                        f'(last dt={dt:.1f}, extra={extra:.1f} > '
                        f'{extra_threshold_ms:.1f}) → pinned')
                    return probe
                log(f'  F={F_ms:.1f} ms: tardy (dt={dt:.1f}); '
                    f'budget {tardy_count}/{max_tardy_allowed}')
            else:
                honored_count += 1
                if honored_count >= classify_min_samples:
                    probe.classification = 'honored'
                    log(f'  F={F_ms:.1f} ms: {honored_count} honored '
                        f'({tardy_count} tardy tolerated), median '
                        f'{float(np.median(probe.samples_ms)):.1f} ms → honored')
                    return probe
        # Hit max_samples — call it honored iff most samples honored.
        probe.classification = ('honored'
                                if honored_count > tardy_count
                                else 'pinned')
        return probe

    # --- 2. Geometric scan to find the first honored F. Scanning
    # smallest-to-largest gives us robustness against strip-flip events
    # at F_max — if the cliff exists, we find it before reaching the
    # noise-vulnerable upper bound.
    search_grid: list[float] = []
    F = F_min_s
    while F < F_max_s:
        search_grid.append(F)
        F *= 2.0
    search_grid.append(F_max_s)

    honored_idx: Optional[int] = None
    for i, F in enumerate(search_grid):
        log(f'scan probe F={F*1000:.2f} ms '
            f'(max_tardy_allowed={scan_max_tardy_allowed})')
        probe = await classify(F, max_tardy_allowed=scan_max_tardy_allowed)
        history.append(probe)
        if probe.classification == 'honored':
            honored_idx = i
            break

    if honored_idx is None:
        return OptimizeResult(
            model=model, cadence_s=cadence_s,
            control_dt_ms=control_dt_ms,
            tardy_threshold_ms=extra_threshold_ms,
            best_f_s=None,
            expected_dt_ms=None,
            savings_ms=None,
            bracket_s=None,
            queries_total=queries_total,
            history=history,
            note=f'no honored F found in geometric scan over '
                 f'[{F_min_s*1000:.1f}, {F_max_s*1000:.1f}] ms — '
                 f'cliff is above F_max',
        )

    if honored_idx == 0:
        # F_min itself is honored. Done.
        first_honored = search_grid[0]
        first_probe = history[-1]
        expected = float(np.median(first_probe.samples_ms))
        return OptimizeResult(
            model=model, cadence_s=cadence_s,
            control_dt_ms=control_dt_ms,
            tardy_threshold_ms=extra_threshold_ms,
            best_f_s=first_honored,
            expected_dt_ms=expected,
            savings_ms=control_dt_ms - expected,
            bracket_s=(first_honored, first_honored),
            queries_total=queries_total,
            history=history,
            note=f'F_min={first_honored*1000:.1f}ms already honored',
        )

    # --- 3. Bisect between last-pinned (predecessor) and first-honored.
    F_low = search_grid[honored_idx - 1]   # known pinned
    F_high = search_grid[honored_idx]      # known honored
    log(f'bisect bracket from scan: [{F_low*1000:.2f}, {F_high*1000:.2f}] ms')
    while (F_high - F_low) > resolution_s:
        F_mid = (F_low + F_high) / 2
        log(f'bisect: [{F_low*1000:.2f}, {F_high*1000:.2f}] '
            f'→ probe F_mid={F_mid*1000:.2f} ms (strict)')
        mid_probe = await classify(F_mid, max_tardy_allowed=0)
        history.append(mid_probe)
        if mid_probe.classification == 'pinned':
            F_low = F_mid
        else:
            F_high = F_mid

    # F_high is the smallest known-honored F. Recommend F_high +
    # safety_margin to cushion against strip-flip on noisy days.
    best_f_s = min(F_high + safety_margin_s, F_max_s)
    # If we have samples at F_high (we do — it's been classified), use the
    # median dt there. Otherwise estimate F + tardy_factor*control_intercept.
    f_high_probes = [p for p in history if abs(p.f_s - F_high) < 1e-9
                     and p.classification == 'honored']
    if f_high_probes:
        expected = float(np.median(f_high_probes[-1].samples_ms))
    else:
        expected = best_f_s * 1000 + 30  # rough estimate
    savings = control_dt_ms - expected

    # Final sanity check: the recommendation must MATERIALLY beat the
    # no-F control. A "honored" classification from the tardy test isn't
    # enough — the tardy test only confirms that dt isn't 1+ cadence
    # ticks above the pinned reference, but in messy cases (e.g.,
    # multiple cadence-tick alignments interfering for slow models) the
    # "honored" dt can still exceed control. If so, reject.
    if savings < min_savings_ms:
        return OptimizeResult(
            model=model, cadence_s=cadence_s,
            control_dt_ms=control_dt_ms,
            tardy_threshold_ms=extra_threshold_ms,
            best_f_s=None,
            expected_dt_ms=expected,
            savings_ms=savings,
            bracket_s=(F_low, F_high),
            queries_total=queries_total,
            history=history,
            note=(f'cliff bracketed [{F_low*1000:.2f}, {F_high*1000:.2f}] ms '
                  f'but expected dt {expected:.1f}ms saves only '
                  f'{savings:+.1f}ms vs control ({control_dt_ms:.1f}ms) — '
                  f'below min_savings_ms ({min_savings_ms:.0f}ms). Recommend None.'),
        )

    return OptimizeResult(
        model=model, cadence_s=cadence_s,
        control_dt_ms=control_dt_ms,
        tardy_threshold_ms=extra_threshold_ms,
        best_f_s=best_f_s,
        expected_dt_ms=expected,
        savings_ms=savings,
        bracket_s=(F_low, F_high),
        queries_total=queries_total,
        history=history,
        note=f'cliff bracketed [{F_low*1000:.2f}, {F_high*1000:.2f}] ms; '
             f'recommended F = F_high + {safety_margin_s*1000:.1f}ms margin',
    )


# ---------------------------------------------------------------------------
# CSV-replay simulated engine for validation.

class CSVSimulatedEngine:
    """Engine implementation that replays from existing sweep CSV.
    Snaps requested (cadence, F) to the nearest cell with data and
    samples dt from that cell's empirical distribution."""

    def __init__(self, csv_path: Path, seed: int = 42):
        self.rng = random.Random(seed)
        # (model, cadence, F) → list of dt; F=0 (or None) means control
        self.full_cells: dict[tuple[str, float, float], list[float]] = defaultdict(list)
        self.controls: dict[tuple[str, float], list[float]] = defaultdict(list)
        # For nearest-cell lookup
        self.available_fs: dict[tuple[str, float], list[float]] = defaultdict(list)

        with csv_path.open() as f:
            for row in csv.DictReader(f):
                try:
                    cad = float(row['cadence_s'])
                    f_v = float(row['first_report_s'])
                    raw_mv = row.get('max_visits', '')
                    mv = (int(raw_mv) if raw_mv not in ('', 'None')
                          else 2_000_000)
                    if mv != 2_000_000:
                        continue
                    dt_raw = row.get('dt_ms', '')
                    if dt_raw in ('', 'None') or row.get('error'):
                        continue
                    dt = float(dt_raw)
                    model = row['model']
                except (KeyError, ValueError):
                    continue
                if f_v <= 0:
                    self.controls[(model, cad)].append(dt)
                else:
                    self.full_cells[(model, cad, f_v)].append(dt)

        for (model, cad, f_v) in self.full_cells:
            self.available_fs[(model, cad)].append(f_v)
        for k in self.available_fs:
            self.available_fs[k].sort()

    async def measure(self, model: str, cadence_s: float,
                      first_report_s: Optional[float]) -> float:
        await asyncio.sleep(0)  # yield to be a polite async citizen
        if first_report_s is None or first_report_s <= 0:
            samples = self.controls.get((model, cadence_s), [])
            if not samples:
                raise RuntimeError(
                    f'no control data for ({model}, C={cadence_s})')
            return self.rng.choice(samples)
        # Snap to nearest available F for this (model, cadence)
        fs = self.available_fs.get((model, cadence_s), [])
        if not fs:
            raise RuntimeError(
                f'no treatment data for ({model}, C={cadence_s})')
        nearest = min(fs, key=lambda x: abs(x - first_report_s))
        samples = self.full_cells[(model, cadence_s, nearest)]
        return self.rng.choice(samples)


async def find_best_f_with_retry(
    engine: Engine,
    model: str,
    cadence_s: float,
    *,
    max_attempts: int = 3,
    verbose: bool = False,
    **kwargs,
) -> OptimizeResult:
    """Wrap find_best_f with retry-on-None. A None result usually means
    a strip-flip at F_max blocked the scan. Retrying gives the algorithm
    a second roll of the dice — the strict per-F blacklisting still
    applies within each attempt, but we don't abandon the whole search
    because one sample at F_max happened to land in the strip."""
    last: Optional[OptimizeResult] = None
    attempts_used = 0
    cumulative_queries = 0
    for attempt in range(1, max_attempts + 1):
        attempts_used = attempt
        r = await find_best_f(engine, model, cadence_s,
                                verbose=verbose, **kwargs)
        cumulative_queries += r.queries_total
        if r.best_f_s is not None:
            r.queries_total = cumulative_queries
            if attempt > 1:
                r.note += f' (succeeded on attempt {attempt}/{max_attempts})'
            return r
        last = r
        if verbose:
            print(f'  [{model} C={cadence_s:.3f}] '
                  f'attempt {attempt}/{max_attempts} returned None — '
                  f'retrying' if attempt < max_attempts else
                  f'attempt {attempt}/{max_attempts} returned None — giving up')
    # All attempts returned None.
    if last is not None:
        last.queries_total = cumulative_queries
        last.note += f' (after {attempts_used} attempts)'
    return last


# ---------------------------------------------------------------------------
# Live engine — talks to a real KataProxy SELECTOR over WebSocket.

# Wire constants — match parameter_sweep.py exactly so dt distributions
# are comparable.
_MAX_VISITS_FULL = 2_000_000
_ANALYZE_TURNS = [39]
_MOVES = [
    ['B', 'D4'],  ['W', 'Q16'], ['B', 'D17'], ['W', 'Q4'],  ['B', 'F4'],  ['W', 'D15'],
    ['B', 'C15'], ['W', 'C14'], ['B', 'C16'], ['W', 'D14'], ['B', 'F17'], ['W', 'C10'],
    ['B', 'R10'], ['W', 'B4'],  ['B', 'D11'], ['W', 'C11'], ['B', 'C4'],  ['W', 'B5'],
    ['B', 'B3'],  ['W', 'C7'],  ['B', 'O3'],  ['W', 'R6'],  ['B', 'R13'], ['W', 'R15'],
    ['B', 'D7'],  ['W', 'C6'],  ['B', 'C8'],  ['W', 'D8'],  ['B', 'D9'],  ['W', 'E8'],
    ['B', 'C9'],  ['W', 'E7'],  ['B', 'D10'], ['W', 'B2'],  ['B', 'C3'],  ['W', 'E5'],
    ['B', 'F3'],  ['W', 'F15'], ['B', 'C12'],
]
_OVERRIDE_SETTINGS = {
    'reportAnalysisWinratesAs': 'WHITE',
    'rootNumSymmetriesToSample': 8,
    'wideRootNoise': 0.02,
}


class LiveEngine:
    """Engine implementation backed by a persistent WebSocket to a
    KataProxy SELECTOR. Performs one analyze query per measure() call,
    with cache-clear before and terminate+drain after, matching the
    per-trial protocol from parameter_sweep.py exactly."""

    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self._ws = None

    async def __aenter__(self):
        self._ws = await websockets.connect(
            self.ws_url, max_size=None,
            ping_interval=20, ping_timeout=30,
        )
        # Drain any startup chatter
        await self._drain_quiet(0.2, 1.0)
        return self

    async def __aexit__(self, *exc):
        if self._ws is not None:
            await self._ws.close()

    async def _drain_quiet(self, quiet_s: float, max_total_s: float):
        deadline = time.perf_counter() + max_total_s
        while time.perf_counter() < deadline:
            remaining = deadline - time.perf_counter()
            wait = min(quiet_s, remaining)
            try:
                await asyncio.wait_for(self._ws.recv(), timeout=wait)
            except (asyncio.TimeoutError, Exception):
                return

    async def measure(self, model: str, cadence_s: float,
                      first_report_s: Optional[float]) -> float:
        # Clear cache + settle
        cc_id = f'cc-{model}-{int(time.time() * 1e6)}'
        await self._ws.send(json.dumps(
            {'id': cc_id, 'action': 'clear_cache'}))
        await self._drain_quiet(0.15, 1.0)

        # Build query
        qid = (f'optf-{model}-{cadence_s}-{first_report_s}'
               f'-{int(time.time() * 1e6)}')
        query = {
            'id': qid,
            'moves': _MOVES,
            'analyzeTurns': _ANALYZE_TURNS,
            'rules': 'tromp-taylor',
            'boardXSize': 19,
            'boardYSize': 19,
            'komi': 7.5,
            'reportDuringSearchEvery': cadence_s,
            'maxVisits': _MAX_VISITS_FULL,
            'includeOwnership': True,
            'overrideSettings': _OVERRIDE_SETTINGS,
            'model': model,
        }
        if first_report_s is not None and first_report_s > 0:
            query['firstReportDuringSearchAfter'] = first_report_s
        payload = json.dumps(query)
        timeout_s = max(cadence_s * 2.0 + 0.5, 2.0)

        # Send + time + receive first matching response
        dt_ms = None
        t0 = time.perf_counter() * 1000.0
        await self._ws.send(payload)
        deadline = time.perf_counter() + timeout_s
        while True:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(self._ws.recv(),
                                              timeout=remaining)
            except asyncio.TimeoutError:
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get('id') != qid:
                continue
            dt_ms = time.perf_counter() * 1000.0 - t0
            break

        # Terminate + drain
        await self._ws.send(json.dumps({
            'id': f'term-{int(time.time() * 1e6)}',
            'action': 'terminate',
            'terminateId': qid,
        }))
        await self._drain_quiet(0.10, 1.5)

        if dt_ms is None:
            # Treat timeout as a huge dt — algorithm will classify as
            # pinned and abort.
            return timeout_s * 1000.0
        return dt_ms


# ---------------------------------------------------------------------------
# Cadence-sweep driver: F*(cadence) for one model.

async def sweep_cadences(ws_url: str, model: str,
                          cadences_s: list[float],
                          out_csv: Optional[Path] = None,
                          verbose: bool = False) -> list[OptimizeResult]:
    """For one model, run find_best_f at each cadence in cadences_s.

    Processes cadences from LARGEST to SMALLEST. Once a cadence returns
    'None' (no useful F exists), all smaller cadences are short-circuited
    to None via monotonicity: P(c) = "no useful F exists at cadence c"
    is monotone in c, so a known-dead c implies all c' < c are also dead.
    This saves us the per-dead-cadence engine queries (3 retries × full
    geometric scan = ~90+ queries each, which adds up).

    Returns OptimizeResult per cadence, in input order."""
    fields = ['model', 'cadence_s', 'best_f_s', 'expected_dt_ms',
              'control_dt_ms', 'savings_ms', 'bracket_lo_s', 'bracket_hi_s',
              'queries_total', 'note']

    if out_csv is not None and not out_csv.exists():
        with out_csv.open('w', newline='') as f:
            csv.writer(f).writerow(fields)

    # Process descending; track the lowest cadence that's been confirmed
    # to yield a useful F. Any cadence at or below the highest known-None
    # is short-circuited.
    cadences_desc = sorted(set(cadences_s), reverse=True)
    by_cadence: dict[float, OptimizeResult] = {}
    dead_at_or_below: Optional[float] = None  # all c ≤ this are dead

    async with LiveEngine(ws_url) as engine:
        print(f'{"cad (s)":>9} {"control":>10} {"best F":>10} '
              f'{"exp dt":>9} {"savings":>9} {"queries":>9}  note')
        print('-' * 110)
        for cadence in cadences_desc:
            if dead_at_or_below is not None and cadence <= dead_at_or_below:
                synthetic = OptimizeResult(
                    model=model, cadence_s=cadence,
                    control_dt_ms=None, tardy_threshold_ms=None,
                    best_f_s=None, expected_dt_ms=None, savings_ms=None,
                    bracket_s=None, queries_total=0, history=[],
                    note=(f'short-circuited by monotonicity: cadence '
                          f'{dead_at_or_below*1000:.0f}ms returned None, '
                          f'so smaller cadence {cadence*1000:.0f}ms is '
                          f'inferred dead without further queries'),
                )
                by_cadence[cadence] = synthetic
                print(f'{cadence:>9.3f} {"—":>10} {"None":>10} '
                      f'{"—":>9} {"—":>9} {0:>9}  (monotonicity skip)')
                continue

            t0 = time.perf_counter()
            r = await find_best_f_with_retry(engine, model, cadence,
                                              verbose=verbose)
            elapsed = time.perf_counter() - t0
            by_cadence[cadence] = r
            best = f'{r.best_f_s*1000:.1f} ms' if r.best_f_s else 'None'
            exp = f'{r.expected_dt_ms:.1f} ms' if r.expected_dt_ms else '—'
            sav = (f'{r.savings_ms:+.1f} ms'
                   if r.savings_ms is not None else '—')
            ctrl = (f'{r.control_dt_ms:.1f} ms'
                    if r.control_dt_ms is not None else '—')
            print(f'{cadence:>9.3f} {ctrl:>10} {best:>10} '
                  f'{exp:>9} {sav:>9} {r.queries_total:>9}  '
                  f'({elapsed:.1f}s)  {r.note}')
            if r.best_f_s is None:
                # Record this as the highest known-dead cadence so far.
                # Future (smaller) iterations will short-circuit.
                if dead_at_or_below is None or cadence > dead_at_or_below:
                    dead_at_or_below = cadence

    # Write CSV in ascending cadence order; same for return value.
    results_asc = [by_cadence[c] for c in sorted(by_cadence)]
    if out_csv is not None:
        with out_csv.open('a', newline='') as f:
            w = csv.writer(f)
            for r in results_asc:
                w.writerow([
                    r.model, r.cadence_s,
                    r.best_f_s if r.best_f_s is not None else '',
                    r.expected_dt_ms if r.expected_dt_ms is not None else '',
                    r.control_dt_ms if r.control_dt_ms is not None else '',
                    r.savings_ms if r.savings_ms is not None else '',
                    r.bracket_s[0] if r.bracket_s else '',
                    r.bracket_s[1] if r.bracket_s else '',
                    r.queries_total, r.note,
                ])

    # Print a final ascending-order summary for readability.
    print()
    print('=== summary (cadence ascending) ===')
    print(f'{"cad (s)":>9} {"best F":>10} {"savings":>9}  status')
    for r in results_asc:
        best = f'{r.best_f_s*1000:.1f} ms' if r.best_f_s else 'None'
        sav = (f'{r.savings_ms:+.1f} ms'
               if r.savings_ms is not None else '—')
        status = ('skipped (monotone)' if r.queries_total == 0
                  else ('found' if r.best_f_s else 'no F'))
        print(f'{r.cadence_s:>9.3f} {best:>10} {sav:>9}  {status}')

    return results_asc


# ---------------------------------------------------------------------------
# Validation driver.

KNOWN_CLIFFS = {
    # (model, cadence): approximate F50 from inspecting per-F medians in
    # the full sweep (in seconds). None means "no useful F honored
    # anywhere in [F_min, F_max]". Tolerance band is roughly ±50% (the
    # strip can be wide and noisy, especially when model floor is
    # comparable to cadence).
    ('b10c128', 0.125): 0.018,
    ('b10c128', 0.250): 0.016,
    ('b18c384nbt', 0.125): 0.072,
    ('b18c384nbt', 0.250): 0.087,
    # b28c512nbt C=0.125: strip at F≈25-30, reliable honored from F≈32.
    ('b28c512nbt', 0.125): 0.032,
    ('b28c512nbt', 0.250): 0.150,
    # fdx6d C=0.125: very wide noisy strip 22-45ms, reliable honored from F≈45-60.
    ('fdx6d', 0.125): 0.045,
    ('fdx6d', 0.250): 0.174,
}


def fmt_ms(v: Optional[float]) -> str:
    return '—' if v is None else f'{v*1000:.2f} ms' if v < 10 else f'{v:.2f} ms'


async def validate(csv_path: Path, *, runs_per_case: int = 5,
                    verbose: bool = False):
    engine = CSVSimulatedEngine(csv_path)
    cases = sorted(KNOWN_CLIFFS.keys())
    print(f'{"model":<14} {"cad":>6} {"known cliff":>13} '
          f'{"alg F*":>10} {"exp dt":>9} {"ctrl dt":>9} '
          f'{"savings":>9} {"queries":>9} {"note"}')
    print('-' * 130)

    summary_correct = 0
    summary_total = 0
    for model, cadence in cases:
        known = KNOWN_CLIFFS[(model, cadence)]
        results = []
        for _ in range(runs_per_case):
            r = await find_best_f(engine, model, cadence, verbose=verbose)
            results.append(r)
        # Aggregate
        bests = [r.best_f_s for r in results]
        n_none = sum(1 for b in bests if b is None)
        n_found = len(bests) - n_none
        avg_queries = np.mean([r.queries_total for r in results])

        if known is None:
            # Algorithm should return None
            correct = (n_none >= runs_per_case * 0.6)
            summary_total += 1
            if correct:
                summary_correct += 1
            best_str = (f'None (×{n_none}/{runs_per_case})' if n_none > 0
                        else f'found ×{n_found}')
            print(f'{model:<14} {cadence:>6.3f} {"none":>13} '
                  f'{best_str:>10} {"—":>9} {"—":>9} '
                  f'{"—":>9} {avg_queries:>9.0f} '
                  f'{"OK" if correct else "WRONG: expected None"}')
        else:
            valid_bests = [b for b in bests if b is not None]
            if not valid_bests:
                summary_total += 1
                print(f'{model:<14} {cadence:>6.3f} '
                      f'{known*1000:>9.1f} ms '
                      f'{"all None":>10} {"—":>9} {"—":>9} '
                      f'{"—":>9} {avg_queries:>9.0f} '
                      f'WRONG: expected ~{known*1000:.0f} ms')
                continue
            f_med = float(np.median(valid_bests))
            f_min = min(valid_bests)
            f_max = max(valid_bests)
            exp_dts = [r.expected_dt_ms for r in results
                       if r.expected_dt_ms is not None]
            ctrl_dts = [r.control_dt_ms for r in results
                        if r.control_dt_ms is not None]
            savings = [r.savings_ms for r in results
                       if r.savings_ms is not None]
            # Correct iff median recommendation is within 25% of known cliff
            # (cliff is the lower bound; algorithm should land just above).
            correct = (known <= f_med <= known * 2.0 + 0.030)
            summary_total += 1
            if correct:
                summary_correct += 1
            print(f'{model:<14} {cadence:>6.3f} '
                  f'{known*1000:>9.1f} ms '
                  f'{f_med*1000:>7.1f} ms '
                  f'{float(np.median(exp_dts)):>6.1f} ms '
                  f'{float(np.median(ctrl_dts)):>6.1f} ms '
                  f'{float(np.median(savings)):>+6.1f} ms '
                  f'{avg_queries:>9.0f} '
                  f'{"OK" if correct else f"WRONG: expected ~{known*1000:.0f}ms, got {f_med*1000:.1f}ms"} '
                  f'[range {f_min*1000:.1f}-{f_max*1000:.1f}]')

    print()
    print(f'Summary: {summary_correct}/{summary_total} cases correct '
          f'(runs_per_case = {runs_per_case})')


# ---------------------------------------------------------------------------
# CLI.

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Find lowest-latency F via bisection. Validation '
                    'runs against existing CSV data.')
    sub = parser.add_subparsers(dest='cmd', required=True)

    default_csv = (Path(__file__).resolve().parent
                   / 'sweep_results' / 'sweep_results.csv')

    p_val = sub.add_parser('validate', help='Validate against existing CSV')
    p_val.add_argument('--csv', type=Path, default=default_csv)
    p_val.add_argument('--runs-per-case', type=int, default=5)
    p_val.add_argument('--verbose', action='store_true')

    p_one = sub.add_parser('one', help='Run once for a single (model, cadence)')
    p_one.add_argument('--csv', type=Path, default=default_csv)
    p_one.add_argument('--model', required=True)
    p_one.add_argument('--cadence', type=float, required=True)
    p_one.add_argument('--verbose', action='store_true')

    p_live = sub.add_parser('live',
                              help='Run F* discovery against a real engine')
    p_live.add_argument('--ws', type=str,
                         default=os.environ.get('KATAGO_WS_URL',
                                                'ws://192.168.122.1:1235'))
    p_live.add_argument('--model', required=True,
                         help='Model label (must be a SELECTOR upstream)')
    p_live.add_argument('--cadences', type=str,
                         default='0.030,0.050,0.075,0.100,0.125,0.150,'
                                 '0.200,0.250,0.350,0.500,0.750,1.000',
                         help='Comma-separated list of cadences in seconds')
    p_live.add_argument('--out-csv', type=Path,
                         default=Path(__file__).resolve().parent
                                 / 'f_star_sweep.csv')
    p_live.add_argument('--verbose', action='store_true')

    args = parser.parse_args()

    if args.cmd == 'validate':
        asyncio.run(validate(args.csv, runs_per_case=args.runs_per_case,
                              verbose=args.verbose))
    elif args.cmd == 'live':
        cads = [float(x.strip()) for x in args.cadences.split(',') if x.strip()]
        print(f'F* discovery — model={args.model} cadences={cads}')
        print(f'ws_url={args.ws}  out_csv={args.out_csv}')
        print()
        asyncio.run(sweep_cadences(args.ws, args.model, cads,
                                     out_csv=args.out_csv,
                                     verbose=args.verbose))
    elif args.cmd == 'one':
        engine = CSVSimulatedEngine(args.csv)
        async def run():
            r = await find_best_f(engine, args.model, args.cadence,
                                  verbose=args.verbose)
            print(f'\n=== {args.model} C={args.cadence}s ===')
            print(f'control_dt_ms     : {r.control_dt_ms:.1f}')
            print(f'tardy_threshold_ms: {r.tardy_threshold_ms:.1f}')
            if r.best_f_s is None:
                print(f'best F            : NONE — {r.note}')
            else:
                print(f'best F            : {r.best_f_s*1000:.2f} ms')
                print(f'expected dt       : {r.expected_dt_ms:.1f} ms')
                print(f'savings vs control: {r.savings_ms:+.1f} ms')
                print(f'bracket           : '
                      f'[{r.bracket_s[0]*1000:.2f}, '
                      f'{r.bracket_s[1]*1000:.2f}] ms')
            print(f'queries used      : {r.queries_total}')
            print(f'note              : {r.note}')
        asyncio.run(run())


if __name__ == '__main__':
    main()
