"""Calibrate per-model visits/sec on the SELECTOR.

Per the user's OR-driven budget exercise: we have 5 hours total GPU
compute. We need to know each model's throughput on representative
positions to allocate that budget rationally.

Method: for each model, run a handful of analyze queries at a
realistic visit count (V=2000), sampled across 2 representative SGFs
and 3 turn ranges (early/mid/late). Measure wall-clock per query;
report visits/sec mean ± stdev.

Output goes to ./calibration.json for the planner to consume.

Heartbeat task included so we don't trip the 25s KeepAlive.
"""

from __future__ import annotations

import asyncio
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark import _load_moves, SELECTOR_HOST  # noqa: E402

CALIBRATION_SGFS = [
    Path("/home/bork/benchmark_sgfs/30385020.sgf"),  # 158 moves
    Path("/home/bork/benchmark_sgfs/30439290.sgf"),  # 138 moves
]
MODELS = ["b10c128", "b18c384nbt", "b28c512nbt", "fdx6d"]
V_CALIBRATION = 2000
TURNS_PER_QUERY = 8
RANGE_STARTS = [30, 60, 100]  # opening / middle / late


async def _heartbeat(ws: Any) -> None:
    counter = 0
    try:
        while True:
            counter += 1
            try:
                await ws.send(json.dumps({
                    "id": f"__hb-cal-{counter}", "action": "query_version",
                }))
            except Exception:
                return
            await asyncio.sleep(10.0)
    except asyncio.CancelledError:
        return


async def _measure_one(
    ws: Any, model: str, moves: list, board_size: int, komi: float,
    start: int, qid: str,
) -> tuple[float, int]:
    """Send V=V_CALIBRATION × TURNS_PER_QUERY turns; return (wall_s, visits_used)."""
    analyze_turns = list(range(start, start + TURNS_PER_QUERY))
    q = {
        "id": qid,
        "action": "analyze",
        "model": model,
        "rules": "japanese",
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "moves": moves,
        "analyzeTurns": analyze_turns,
        "maxVisits": V_CALIBRATION,
        "includePolicy": False,
        "capabilities": {},
    }
    target = set(analyze_turns)
    t0 = time.monotonic()
    await ws.send(json.dumps(q))
    visits_total = 0
    received: set[int] = set()
    deadline = t0 + 300.0
    while len(received) < len(target):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"calibration timeout: model={model}")
        msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        r = json.loads(msg)
        if r.get("id") != qid:
            continue
        if r.get("isDuringSearch", True):
            continue
        t = r.get("turnNumber")
        if t in target and t not in received:
            received.add(t)
            v = r.get("rootInfo", {}).get("visits", 0)
            visits_total += int(v) if isinstance(v, (int, float)) else 0
    dt = time.monotonic() - t0
    return dt, visits_total


async def calibrate_model(ws: Any, model: str) -> dict[str, Any]:
    """Run 6 measurements per model (2 SGFs × 3 ranges); return stats."""
    measurements: list[tuple[float, int]] = []
    qid_counter = 0
    for sgf_path in CALIBRATION_SGFS:
        moves, size, komi = _load_moves(sgf_path)
        for start in RANGE_STARTS:
            if start + TURNS_PER_QUERY > len(moves):
                continue
            qid_counter += 1
            qid = f"cal-{model}-{qid_counter}"
            print(
                f"  {model} | {sgf_path.stem} | turns {start}..{start+TURNS_PER_QUERY-1} ",
                end="", flush=True,
            )
            dt, vt = await _measure_one(
                ws, model, moves, size, komi, start, qid,
            )
            vps = vt / dt if dt > 0 else float("nan")
            measurements.append((dt, vt))
            print(f"-> {dt:.2f}s, {vt} visits, {vps:.0f} visits/s", flush=True)
    if not measurements:
        return {"model": model, "n": 0}
    dts = [m[0] for m in measurements]
    vts = [m[1] for m in measurements]
    vpses = [v / d for d, v in measurements]
    return {
        "model": model,
        "n": len(measurements),
        "dt_mean_s": statistics.mean(dts),
        "dt_stdev_s": statistics.stdev(dts) if len(dts) > 1 else 0.0,
        "visits_mean": statistics.mean(vts),
        "vps_mean": statistics.mean(vpses),
        "vps_stdev": statistics.stdev(vpses) if len(vpses) > 1 else 0.0,
        "raw_measurements": [
            {"dt_s": d, "visits": v, "vps": v / d}
            for d, v in measurements
        ],
    }


async def main() -> None:
    print(f"calibration: V={V_CALIBRATION} × T={TURNS_PER_QUERY} turns per query")
    print(f"sgfs: {[s.stem for s in CALIBRATION_SGFS]}")
    print(f"models: {MODELS}")
    print("")

    async with websockets.connect(
        f"ws://{SELECTOR_HOST}/", max_size=None,
    ) as ws:
        hb_task = asyncio.create_task(_heartbeat(ws), name="cal-hb")
        try:
            results = []
            for model in MODELS:
                t0 = time.monotonic()
                print(f"=== calibrating {model} ===")
                r = await calibrate_model(ws, model)
                results.append(r)
                print(
                    f"  → vps_mean={r['vps_mean']:.0f} ± "
                    f"{r['vps_stdev']:.0f} (n={r['n']}, "
                    f"elapsed={time.monotonic() - t0:.1f}s)\n"
                )
        finally:
            hb_task.cancel()
            try:
                await hb_task
            except (asyncio.CancelledError, Exception):
                pass

    output = {
        "config": {
            "V_calibration": V_CALIBRATION,
            "turns_per_query": TURNS_PER_QUERY,
            "sgfs": [s.stem for s in CALIBRATION_SGFS],
            "range_starts": RANGE_STARTS,
        },
        "per_model": results,
    }
    Path("/home/bork/benchmark_allocation/calibration.json").write_text(
        json.dumps(output, indent=2)
    )
    print("saved calibration.json")
    print("\n=== summary ===")
    for r in results:
        if r.get("n", 0) > 0:
            print(
                f"  {r['model']:14s} vps = {r['vps_mean']:8.0f} ± "
                f"{r['vps_stdev']:7.0f} (n={r['n']})"
            )


if __name__ == "__main__":
    asyncio.run(main())
