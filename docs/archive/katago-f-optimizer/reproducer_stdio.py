#!/usr/bin/env python3
"""
Stdio reproducer for KataGo first-report-cliff bug.

Direct stdin/stdout variant of `reproducer.py`. Same three-cadence sweep,
same wire shape, same expected output format. Removes the WebSocket
bridge as a possible confounder by spawning the KataGo analysis binary
as a subprocess and talking to it over its native stdio protocol.

Demonstrates that `firstReportDuringSearchAfter` values below an
absolute ~25 ms are silently substituted by `reportDuringSearchEvery`,
regardless of what `reportDuringSearchEvery` is set to. The behaviour
is also non-deterministic in the 0.020–0.030 s strip.

Tested against KataGo 1.16.4.

Usage:

    python3 reproducer_stdio.py \\
        -katago-path /path/to/katago \\
        -config-path /path/to/cpp/configs/analysis_example.cfg \\
        -model-path  /path/to/model.bin.gz

No third-party Python dependencies (stdlib only).

License: MIT.

The subprocess-management scaffolding (the `KataGo` class shape, the
stderr-pump thread pattern) is adapted from KataGo's upstream example
`python/query_analysis_engine_example.py`, which is MIT-licensed. The
sweep logic and row formatting are mirrored from this directory's
sibling `reproducer.py` (public domain). This derivative is offered
under the MIT license to match the upstream provenance:

    Copyright (c) 2024 lightvector (KataGo)
    Copyright (c) 2026 the LengYue contributors

    Permission is hereby granted, free of charge, to any person
    obtaining a copy of this software and associated documentation
    files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use,
    copy, modify, merge, publish, distribute, sublicense, and/or
    sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    OTHER DEALINGS IN THE SOFTWARE.
"""

import argparse
import json
import queue
import subprocess
import sys
import threading
import time
from typing import Any, Dict, Optional

MAX_VISITS = 2_000_000
ANALYZE_TURNS = [39]

# 39-move mid-game position from a real game. Position complexity does
# not appear to matter — earlier probes with empty-board queries also
# reproduced the cliff, with the same absolute ~25 ms threshold.
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

# Covers both decisive cells: F=0.05 at C=10 (absolute 25 ms cliff
# predicts fast; "1% of cadence" predicts slow) and F=0.005 at C=0.5
# (absolute predicts slow; "1% of cadence" predicts near-boundary).
SWEEP = [
    0.001, 0.002, 0.005, 0.01, 0.015,
    0.02, 0.025, 0.03, 0.05, 0.1, 0.3,
]

SETTLE_S = 0.6


class KataGo:
    """Manage a KataGo analysis-engine subprocess via stdin/stdout.

    Two background threads pump the engine's output streams: one for
    stderr (printed verbatim with a ``KataGo:`` prefix, matching the
    upstream example) and one for stdout (JSON-decoded into a queue
    the main thread consumes). The main thread writes queries to
    stdin and reads matching responses from the queue.
    """

    def __init__(self, katago_path: str, config_path: str, model_path: str):
        self.proc = subprocess.Popen(
            [katago_path, 'analysis', '-config', config_path, '-model', model_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.stdout_q: 'queue.Queue[Optional[Dict[str, Any]]]' = queue.Queue()

        def pump_stderr() -> None:
            assert self.proc.stderr is not None
            while self.proc.poll() is None:
                data = self.proc.stderr.readline()
                if not data:
                    break
                sys.stderr.write('KataGo: ' + data.decode(errors='replace'))
                sys.stderr.flush()
            tail = self.proc.stderr.read()
            if tail:
                sys.stderr.write('KataGo: ' + tail.decode(errors='replace'))
                sys.stderr.flush()

        def pump_stdout() -> None:
            assert self.proc.stdout is not None
            while self.proc.poll() is None:
                line = self.proc.stdout.readline()
                if not line:
                    break
                stripped = line.decode(errors='replace').strip()
                if not stripped:
                    continue
                try:
                    msg = json.loads(stripped)
                except json.JSONDecodeError:
                    sys.stderr.write(f'[reproducer-stdio] non-JSON stdout line: {stripped!r}\n')
                    continue
                self.stdout_q.put(msg)
            self.stdout_q.put(None)  # EOF sentinel

        self._stderr_thread = threading.Thread(target=pump_stderr, daemon=True)
        self._stdout_thread = threading.Thread(target=pump_stdout, daemon=True)
        self._stderr_thread.start()
        self._stdout_thread.start()

    def send(self, query: Dict[str, Any]) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write((json.dumps(query) + '\n').encode())
        self.proc.stdin.flush()

    def drain(self) -> None:
        try:
            while True:
                self.stdout_q.get_nowait()
        except queue.Empty:
            pass

    def recv(self, timeout_s: float) -> Optional[Dict[str, Any]]:
        try:
            msg = self.stdout_q.get(timeout=max(timeout_s, 0.0))
        except queue.Empty:
            return None
        return msg  # may be None (EOF sentinel)

    def close(self) -> None:
        if self.proc.stdin is not None:
            try:
                self.proc.stdin.close()
            except Exception:
                pass
        try:
            self.proc.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                self.proc.kill()


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


def run_one(
    katago: KataGo,
    first_report_after: float,
    cadence: float,
    timeout_s: float,
) -> None:
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
    katago.drain()
    send_t0 = now_ms()
    katago.send(query)

    first_dt: Optional[float] = None
    first_visits: Optional[int] = None
    deadline = time.perf_counter() + timeout_s
    while True:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            break
        msg = katago.recv(remaining)
        if msg is None:
            break  # timeout or EOF
        if msg.get('id') != query_id:
            continue
        if 'error' in msg:
            print(f"  error: {msg['error']}")
            break
        first_dt = now_ms() - send_t0
        first_visits = (msg.get('rootInfo') or {}).get('visits')
        break

    try:
        katago.send({
            'id': f'term-{int(time.time() * 1000)}',
            'action': 'terminate',
            'terminateId': query_id,
        })
    except Exception:
        pass

    print(fmt_row(first_report_after, cadence, first_dt, first_visits))


def warmup(katago: KataGo) -> None:
    """One small query to absorb model-load latency before the timing-sensitive sweep.

    Stdio reproducers pay model-load cost on the *first* query the engine
    handles after spawn; the WebSocket-bridge variant has typically already
    paid that cost at bridge-startup time. Running a tiny query first
    keeps the first measured row from carrying an extra ~1–10 s of
    warm-up time that would mask the cliff at small `firstReportAfter`.
    """
    query_id = 'warmup'
    katago.drain()
    katago.send({
        'id': query_id,
        'moves': MOVES,
        'analyzeTurns': ANALYZE_TURNS,
        'rules': 'tromp-taylor',
        'boardXSize': 19,
        'boardYSize': 19,
        'komi': 7.5,
        'maxVisits': 100,
    })
    deadline = time.perf_counter() + 120.0
    while True:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            sys.stderr.write('[reproducer-stdio] warmup timed out; continuing anyway\n')
            return
        msg = katago.recv(remaining)
        if msg is None:
            return
        if msg.get('id') == query_id:
            return


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            'Stdio reproducer for KataGo first-report-cliff bug. '
            'Spawns the KataGo analysis binary as a subprocess and talks '
            'to it over stdin/stdout; no WebSocket bridge involved.'
        )
    )
    parser.add_argument(
        '-katago-path',
        required=True,
        help='Path to katago executable',
    )
    parser.add_argument(
        '-config-path',
        required=True,
        help='Path to analysis config (e.g. cpp/configs/analysis_example.cfg)',
    )
    parser.add_argument(
        '-model-path',
        required=True,
        help='Path to neural network .bin.gz file',
    )
    args = vars(parser.parse_args())

    print(f'[reproducer-stdio] spawning {args["katago_path"]} analysis ...')
    katago = KataGo(args['katago_path'], args['config_path'], args['model_path'])

    try:
        print('[reproducer-stdio] warming up (one small query to absorb model load)')
        warmup(katago)
        print('[reproducer-stdio] engine ready')
        print('Wire shape: native KataGo (direct stdio),')
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
                run_one(katago, v, cadence, timeout_s)
                time.sleep(SETTLE_S)
            print()

        print('[reproducer-stdio] done; closing')
    finally:
        katago.close()


if __name__ == '__main__':
    main()
