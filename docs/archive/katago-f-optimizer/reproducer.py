#!/usr/bin/env python3
"""
Reproducer for KataGo first-report-cliff bug.

Sweeps firstReportDuringSearchAfter against three cadence values (0.5s,
2.0s, 10.0s) holding wire shape constant. Demonstrates that values below
an absolute ~25ms are silently substituted by reportDuringSearchEvery,
regardless of what reportDuringSearchEvery is set to. The behaviour is
also non-deterministic in the 0.020–0.030s strip.

Tested against KataGo 1.16.4. Reproduced from three independent client
stacks (Node + native WebSocket, Node + KataProxy SELECTOR proxy,
Python + websockets) all hitting the same KataGo binary — the symptom
travels with KataGo.

Usage:
    KATAGO_WS_URL=ws://host:port \
        python3 reproducer.py

The KATAGO_WS_URL endpoint must be a WebSocket bridge that forwards
JSON queries to a KataGo analysis-engine binary's stdin and forwards
its stdout back as messages. Any transparent KataGo-protocol WS bridge
works. (We used the open-source KataProxy project's transparent mode.)

Dependencies:
    pip install websockets   # tested with 16.0

License: Public Domain (The Unlicense).
"""

import asyncio
import json
import os
import sys
import time
from typing import Optional

import websockets

WS_URL = os.environ.get('KATAGO_WS_URL')
if not WS_URL:
    sys.stderr.write('error: set KATAGO_WS_URL to a KataGo-protocol WS bridge\n')
    sys.exit(2)

MAX_VISITS = 2_000_000
ANALYZE_TURNS = [39]

# 39-move mid-game position from a real game. Position complexity does
# not appear to matter — earlier probes with empty-board queries also
# reproduced the cliff, with the same absolute ~25ms threshold.
MOVES = [
    ['B', 'D4'], ['W', 'Q16'], ['B', 'D17'], ['W', 'Q4'], ['B', 'F4'], ['W', 'D15'],
    ['B', 'C15'], ['W', 'C14'], ['B', 'C16'], ['W', 'D14'], ['B', 'F17'], ['W', 'C10'],
    ['B', 'R10'], ['W', 'B4'], ['B', 'D11'], ['W', 'C11'], ['B', 'C4'], ['W', 'B5'],
    ['B', 'B3'], ['W', 'C7'], ['B', 'O3'], ['W', 'R6'], ['B', 'R13'], ['W', 'R15'],
    ['B', 'D7'], ['W', 'C6'], ['B', 'C8'], ['W', 'D8'], ['B', 'D9'], ['W', 'E8'],
    ['B', 'C9'], ['W', 'E7'], ['B', 'D10'], ['W', 'B2'], ['B', 'C3'], ['W', 'E5'],
    ['B', 'F3'], ['W', 'F15'], ['B', 'C12'],
]

# Stripping these does not change the qualitative result. Kept here
# because this is the shape the symptom was first observed under.
OVERRIDE_SETTINGS = {
    'reportAnalysisWinratesAs': 'WHITE',
    'rootNumSymmetriesToSample': 8,
    'wideRootNoise': 0.02,
}

CADENCES = [0.5, 2.0, 10.0]

# Covers both decisive cells: F=0.05 at C=10 (absolute 25ms cliff
# predicts fast; "1% of cadence" predicts slow) and F=0.005 at C=0.5
# (absolute predicts slow; "1% of cadence" predicts near-boundary).
SWEEP = [
    0.001, 0.002, 0.005, 0.01, 0.015,
    0.02, 0.025, 0.03, 0.05, 0.1, 0.3,
]

SETTLE_S = 0.6


def now_ms() -> float:
    return time.perf_counter() * 1000.0


def fmt_row(
    first_report_after: float,
    cadence: float,
    dt_ms: Optional[float],
    visits: Optional[int],
) -> str:
    expected_ms = first_report_after * 1000.0
    cadence_ms = cadence * 1000.0
    pct = (first_report_after / cadence) * 100.0
    if dt_ms is None:
        tag = 'NO-PACKET'
        dt_str = '---'
        ratio_str = ' n/a'
    else:
        pinned = (cadence_ms * 0.8) < dt_ms < (cadence_ms * 1.2)
        tag = '≈ CADENCE' if pinned else 'fast'
        dt_str = f'{dt_ms:.0f}'
        ratio_str = f'{(dt_ms / expected_ms):.1f}'
    visits_str = str(visits) if visits is not None else '---'
    return (
        f'  firstReportAfter={first_report_after:>6}s '
        f'({pct:>5.2f}% of cadence)  →  '
        f'first @ +{dt_str:>5} ms  '
        f'(ratio {ratio_str:>5}x)  '
        f'visits={visits_str:>7}  [{tag}]'
    )


async def run_one(ws, first_report_after: float, cadence: float, timeout_s: float) -> None:
    query_id = f'reprod-{cadence}-{first_report_after}-{int(time.time() * 1000)}'
    query = {
        'id': query_id,
        'moves': MOVES,
        'analyzeTurns': ANALYZE_TURNS,
        'rules': 'tromp-taylor',
        'boardXSize': 19,
        'boardYSize': 19,
        'komi': 7.5,
        'reportDuringSearchEvery': cadence,
        'firstReportDuringSearchAfter': first_report_after,
        'maxVisits': MAX_VISITS,
        'includeOwnership': True,
        'overrideSettings': OVERRIDE_SETTINGS,
    }
    send_t0 = now_ms()
    await ws.send(json.dumps(query))

    first_dt: Optional[float] = None
    first_visits: Optional[int] = None
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
        if msg.get('id') != query_id:
            continue
        if 'error' in msg:
            print(f"  error: {msg['error']}")
            break
        first_dt = now_ms() - send_t0
        first_visits = (msg.get('rootInfo') or {}).get('visits')
        break

    try:
        await ws.send(json.dumps({
            'id': f'term-{int(time.time() * 1000)}',
            'action': 'terminate',
            'terminateId': query_id,
        }))
    except Exception:
        pass

    print(fmt_row(first_report_after, cadence, first_dt, first_visits))


async def main() -> None:
    print(f'[reproducer] connecting to {WS_URL}')
    async with websockets.connect(WS_URL, max_size=None) as ws:
        print('[reproducer] ws open')
        print('Wire shape: native KataGo,')
        print(f'            position=39 moves, maxVisits={MAX_VISITS},')
        print(f'            overrideSettings={json.dumps(OVERRIDE_SETTINGS)},')
        print('            includeOwnership=true.')
        print(f'Cadences sampled: {CADENCES}\n')

        for cadence in CADENCES:
            print(f'=== cadence = {cadence}s ===')
            timeout_s = max(cadence * 1.3 + 0.5, 1.5)
            for v in SWEEP:
                if v >= cadence:
                    continue
                await run_one(ws, v, cadence, timeout_s)
                await asyncio.sleep(SETTLE_S)
            print()

        print('[reproducer] done; closing')


if __name__ == '__main__':
    asyncio.run(main())
