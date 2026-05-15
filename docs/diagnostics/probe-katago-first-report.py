#!/usr/bin/env python3
"""
docs/diagnostics/probe-katago-first-report.py

Headless WebSocket probe for the KataGo analysis-engine cadence
options `firstReportDuringSearchAfter` and
`reportDuringSearchEvery`. Sends a single analyze query to a
running proxy (default ws://127.0.0.1:41948) and prints
timestamped packet arrivals — so the question "is the first
packet actually arriving at the firstReportDuringSearchAfter
time we asked for, or is some layer delaying it to the
reportDuringSearchEvery cadence instead?" gets a numeric
answer rather than a perceptual one.

The script bypasses the SPA entirely. The wire path it
exercises is:

    probe-katago-first-report.py
        ↓ WebSocket query
    proxy (transformer chain — analysis_enricher, capability
           negotiation, replay cache, coalescing)
        ↓ translated query
    KataGo subprocess
        ↑ packet stream
    proxy (response-side enrichers, forward to client)
        ↑ packets
    probe (prints timestamps)

If the probe shows the first packet arriving at
`firstReportDuringSearchAfter` time → the wire path honours the
field; any perceived SPA delay is downstream (SPA receive path,
ledger, render). If the probe shows the first packet at
`reportDuringSearchEvery` time → the wire path is the culprit
(proxy transformer, KataGo behaviour, or wire-shape drop).

## Usage

Requires Python 3.8+ and the `websockets` package:

    python -m pip install websockets

Run against the user's failing parameters:

    python docs/diagnostics/probe-katago-first-report.py

Override defaults:

    python docs/diagnostics/probe-katago-first-report.py \\
        --url ws://127.0.0.1:41948 \\
        --first-after 0.03 \\
        --cadence 2.0 \\
        --visits 100000

## Expected behaviour (if wire path honours the contract)

    Connecting to ws://127.0.0.1:41948…
    Sending query: firstReportDuringSearchAfter=0.03s,
      reportDuringSearchEvery=2.0s, maxVisits=100000
      t= 0.034s  pkt#1  visits=200    isDuringSearch=True
      t= 2.041s  pkt#2  visits=8500   isDuringSearch=True
      t= 4.051s  pkt#3  visits=17200  isDuringSearch=True
      t= 8.123s  pkt#4  visits=42100  isDuringSearch=False
    Done after 4 packet(s).
    SUMMARY: time-to-first-packet = 0.034s
             expected ≈ firstReportDuringSearchAfter = 0.03s ✓

## Symptom-matching behaviour (the user-reported bug)

    Connecting to ws://127.0.0.1:41948…
    Sending query: firstReportDuringSearchAfter=0.03s,
      reportDuringSearchEvery=2.0s, maxVisits=100000
      t= 2.041s  pkt#1  visits=8500  isDuringSearch=True
      ...
    SUMMARY: time-to-first-packet = 2.041s
             expected ≈ firstReportDuringSearchAfter = 0.03s ✗
             actual matches reportDuringSearchEvery cadence —
             wire path is not honouring firstReportDuringSearchAfter.

## Companion diagnostics

Pair this probe with proxy structured logging
(`proxy/docs/logging.md`) for the cross-boundary picture:

    PROXY_LOG_FORMAT=logfmt ./run_leaf.sh   # in proxy/

Then run the probe against the same proxy and capture both
sides. The proxy's `forward` events at INFO surface the
demand-edge timing for each authoritative response reaching the
SPA; comparing those timestamps to the probe's packet-arrival
timestamps pins down whether the delay is in the proxy
transformer chain, in KataGo itself, or in the proxy's
response-side forwarding.

License: Public Domain (The Unlicense)
"""
import argparse
import asyncio
import json
import sys
import time

try:
    import websockets
except ImportError:
    sys.stderr.write(
        "error: this script requires the `websockets` package.\n"
        "       install with:  python -m pip install websockets\n"
    )
    sys.exit(1)


async def probe(
    url: str,
    first_after: float,
    cadence: float,
    visits: int,
    board_size: int,
) -> None:
    """
    Send one analyze query and print every packet's arrival
    timestamp. Returns when the first `isDuringSearch=False`
    packet (the final / authoritative response) arrives, or
    when the connection drops, whichever comes first.
    """
    query_id = f"diag-first-report-{int(time.time() * 1000)}"
    query = {
        "id": query_id,
        "action": "analyze",
        "moves": [],
        "rules": "tromp-taylor",
        "boardXSize": board_size,
        "boardYSize": board_size,
        "komi": 7.5,
        "maxVisits": visits,
        "firstReportDuringSearchAfter": first_after,
        "reportDuringSearchEvery": cadence,
        "analyzeTurns": [0],
    }

    print(f"Connecting to {url}…")
    async with websockets.connect(url) as ws:
        print(
            f"Sending query: firstReportDuringSearchAfter={first_after}s, "
            f"reportDuringSearchEvery={cadence}s, maxVisits={visits}"
        )
        t0 = time.monotonic()
        await ws.send(json.dumps(query))

        t_first = None
        packet_count = 0
        last_visits = None

        async for msg in ws:
            elapsed = time.monotonic() - t0
            try:
                pkt = json.loads(msg)
            except json.JSONDecodeError:
                print(f"  t={elapsed:6.3f}s  [non-JSON response, skipping]")
                continue

            # Filter out probe / metadata responses for other queries
            # the proxy might also be servicing.
            if pkt.get("id") != query_id:
                continue

            packet_count += 1
            if t_first is None:
                t_first = elapsed

            is_during = pkt.get("isDuringSearch")
            root = pkt.get("rootInfo") or {}
            visits_so_far = root.get("visits", "?")
            last_visits = visits_so_far
            print(
                f"  t={elapsed:6.3f}s  pkt#{packet_count}  "
                f"visits={visits_so_far}  isDuringSearch={is_during}"
            )

            # Final packet — the authoritative result. KataGo emits
            # isDuringSearch=False once when the search completes
            # (or hits maxVisits); we stop reading there.
            if is_during is False:
                break

        print(f"\nDone after {packet_count} packet(s).")
        if t_first is None:
            print("SUMMARY: no packets received for this query id.")
            return

        print(f"SUMMARY: time-to-first-packet = {t_first:.3f}s")
        print(f"         expected ≈ firstReportDuringSearchAfter = {first_after}s")
        # Tolerance: 50% of cadence is the dividing line between
        # "first-after honoured" and "first-after ignored, cadence
        # tick is what fired." Conservative; both sides of the
        # boundary should land far from it in a clean run.
        boundary = cadence * 0.5
        if t_first <= boundary:
            print("         (wire path appears to honour firstReportDuringSearchAfter ✓)")
        else:
            print(
                "         (wire path is NOT honouring firstReportDuringSearchAfter; "
                f"first packet landed at ≈ cadence — likely upstream bug or "
                f"transformer-induced delay)"
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Probe the wire-path timing of KataGo's "
            "firstReportDuringSearchAfter and reportDuringSearchEvery "
            "options. See the module docstring for the diagnostic "
            "interpretation guide."
        )
    )
    parser.add_argument(
        "--url",
        default="ws://127.0.0.1:41948",
        help="Proxy / KataGo WebSocket URL (default: %(default)s)",
    )
    parser.add_argument(
        "--first-after",
        type=float,
        default=0.03,
        help="firstReportDuringSearchAfter in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--cadence",
        type=float,
        default=2.0,
        help="reportDuringSearchEvery in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--visits",
        type=int,
        default=100000,
        help="maxVisits — high enough to span several cadence ticks (default: %(default)s)",
    )
    parser.add_argument(
        "--board-size",
        type=int,
        default=19,
        help="Board size (default: %(default)s)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(
            probe(
                args.url,
                args.first_after,
                args.cadence,
                args.visits,
                args.board_size,
            )
        )
    except KeyboardInterrupt:
        sys.stderr.write("\ninterrupted\n")
        sys.exit(130)


if __name__ == "__main__":
    main()
