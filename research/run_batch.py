"""
research/run_batch.py

Stage-1 expanded sanity sample. Picks N positions uniformly at random
from year-2000 SGFs in ~/benchmark_sgfs/, collects one trajectory
each, dumps NPZs into a per-batch directory.

Per `roadmap-learned-continuous-scaling.md` §4.4 (overfit-first
sanity) and §4.2 (corpus-shape commitment to visit-distribution
entropy reduction): this batch lets us characterize the distribution
of trajectory shapes across diverse positions — what fraction fit
hyperbolic cleanly vs. show peak-then-decline (obvious-move
positions where policy resolves quickly and PUCT then explores) or
other patterns.

Pipelined over ONE WebSocket so per-session connect/teardown
overhead doesn't dominate the wall-clock between queries.

Sampling:
  - Uniformly from `~/benchmark_sgfs/2000-*.sgf` (n=946 candidates).
  - Per SGF: pick a random turn in [20, n_moves − 20] so we land
    in middle-game, never opening, never near-endgame.
  - Skip games with < 60 main-line moves.

Usage:
  python run_batch.py --n 100 --seed 42

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import websockets
from sgfmill import sgf

sys.path.insert(0, str(Path(__file__).parent))
from collect_trajectory import build_query, load_sgf_moves  # noqa: E402
from pg_sink import (  # noqa: E402
    connect as pg_connect, ensure_schema, ensure_position,
    start_realization, reset_packets, StreamWriter, mark_realization,
    mark_sgf_poison,
)
from position_sampler import StratifiedSampler  # noqa: E402


PROXY = "ws://127.0.0.1:1235"


def pick_positions(
    n: int,
    *,
    seed: int,
    turn_margin: int = 20,
    skip_already_at: int = 0,
    pg_conn=None,
) -> list[tuple[Path, int]]:
    """Stratified-by-decade uniform-over-positions picker. Reads
    mcts_sgf from Postgres (must have been populated by sgf_index.py).
    Returns N (sgf_path, turn) tuples.

    skip_already_at: if > 0, skip positions that already have
    ≥ skip_already_at complete realizations in mcts_realization.
    """
    conn = pg_conn if pg_conn is not None else pg_connect()
    own_conn = pg_conn is None
    try:
        sampler = StratifiedSampler.from_postgres(
            conn, turn_margin=turn_margin, rng=random.Random(seed),
        )
        sampler_picks = sampler.pick_n(
            n, skip_already_at=skip_already_at, pg_conn=conn,
        )
        out = [(Path(sgf.path), turn) for sgf, turn in sampler_picks]
        decade_counts: dict[int, int] = {}
        for sgf, _ in sampler_picks:
            decade_counts[sgf.decade] = decade_counts.get(sgf.decade, 0) + 1
        print(f"  picked {len(out)} positions across "
              f"{len(decade_counts)} decades: {sorted(decade_counts.items())}")
    finally:
        if own_conn:
            conn.close()
    return out


async def collect_one_over_ws(
    ws: websockets.WebSocketClientProtocol,
    pg_conn: Any,
    *,
    sgf_path: Path,
    turn: int,
    max_visits: int,
    report_every: float,
    model: str,
    timeout_s: float,
    realization: int = 0,
) -> tuple[bool, int, float]:
    """Send one analyze query over an existing WebSocket; each
    received packet is INSERT'd into Postgres on receive
    (autocommit=True ⇒ durable per packet; see pg_sink.py). Returns
    (ok, n_packets, elapsed_s).

    "ok" = realization marked `complete` (final received). Timeout
    and engine_error still update mcts_realization with the right
    status; the partial packet rows are in Postgres either way."""
    try:
        moves, initial_stones, board_size, komi, rules = load_sgf_moves(sgf_path, turn)
    except Exception as e:
        print(f"  SGF load error: {e}")
        return False, 0, 0.0

    if len(moves) < turn:
        print(f"  SGF only has {len(moves)} moves; cannot analyze turn {turn}")
        return False, 0, 0.0

    qid = f"batch-{sgf_path.stem}-t{turn}-r{realization}-{int(time.time()*1000)}"
    query = build_query(
        qid=qid, moves=moves, initial_stones=initial_stones,
        board_size=board_size, komi=komi, rules=rules,
        analyze_turn=turn, max_visits=max_visits,
        report_every=report_every, model=model,
    )

    position_id = ensure_position(
        pg_conn, sgf_path=str(sgf_path), stem=sgf_path.stem, turn=turn,
    )
    realization_id = start_realization(
        pg_conn, position_id=position_id, realization_idx=realization,
        qid=qid, model=model, max_visits=max_visits, report_every=report_every,
    )
    reset_packets(pg_conn, realization_id)
    writer = StreamWriter(conn=pg_conn, realization_id=realization_id)

    await ws.send(json.dumps(query))

    n_packets = 0
    final_visits = 0
    final_received = False
    error = ""
    t0 = time.monotonic()
    deadline = t0 + timeout_s

    while time.monotonic() < deadline and not final_received:
        remaining = deadline - time.monotonic()
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            error = f"timeout after {timeout_s}s, n_packets={n_packets}"
            print(f"  TIMEOUT after {timeout_s}s; got {n_packets} packets")
            break
        now = time.monotonic() - t0
        msg = json.loads(raw)
        if "isDuringSearch" not in msg:
            if "error" in msg:
                error = str(msg["error"])
                print(f"  ENGINE ERROR: {msg}")
                break
            continue
        if msg.get("id") != qid:
            continue
        writer.append(now, msg)
        n_packets += 1
        if not msg.get("isDuringSearch"):
            final_visits = int((msg.get("rootInfo") or {}).get("visits", 0))
            final_received = True

    elapsed = time.monotonic() - t0
    if final_received:
        status = "complete"
    elif error and "timeout" in error:
        status = "timeout"
    elif error:
        status = "engine_error"
    else:
        status = "incomplete"
    mark_realization(
        pg_conn,
        realization_id=realization_id,
        status=status,
        final_visits=final_visits,
        n_packets=n_packets,
        elapsed_s=elapsed,
        error=error,
    )
    # If the underlying SGF triggers a KataGo input-validation error
    # (rules/komi out of range etc.), mark it poison so the sampler
    # filters it out of subsequent picks. See
    # proxy/docs/notes/bug-session-stall-after-rules-validation-error.md
    # for the proxy-side bug this works around.
    if status == "engine_error" and "integer or half-integer" in error:
        mark_sgf_poison(pg_conn, str(sgf_path), reason=error[:200])
        print(f"  ⚠ marked SGF poison: {sgf_path.name} (reason: rules/komi)")
    return final_received, n_packets, elapsed


async def run_batch(
    picks: list[tuple[Path, int]],
    *,
    max_visits: int,
    report_every: float,
    model: str,
    per_position_timeout: float,
    n_realizations: int = 1,
) -> None:
    t0 = time.monotonic()
    ok = fail = 0
    sample_counts: list[int] = []
    per_position_secs: list[float] = []

    total_jobs = len(picks) * n_realizations
    job_i = 0

    pg_conn = pg_connect()
    ensure_schema(pg_conn)
    try:
        async with websockets.connect(PROXY, max_size=2**24) as ws:
            for i, (sgf_path, turn) in enumerate(picks):
                skip_rest_of_position = False
                for r in range(n_realizations):
                    if skip_rest_of_position:
                        job_i += 1
                        continue
                    job_i += 1
                    t_pos_start = time.monotonic() - t0
                    print(f"[{job_i:4d}/{total_jobs}] {sgf_path.name} t{turn:3d} r{r}  "
                          f"(elapsed {t_pos_start:6.1f}s)", end=" ", flush=True)
                    try:
                        success, n_packets, elapsed = await collect_one_over_ws(
                            ws, pg_conn,
                            sgf_path=sgf_path,
                            turn=turn,
                            max_visits=max_visits,
                            report_every=report_every,
                            model=model,
                            timeout_s=per_position_timeout,
                            realization=r,
                        )
                    except Exception as e:
                        print(f"  FAIL: {e}")
                        fail += 1
                        # Per-position-stall guard: if the first
                        # realization fails for any reason, skipping
                        # the rest avoids the proxy-session-stall bug
                        # (bug-session-stall-after-rules-validation-error.md)
                        # and wasted timeouts on retries.
                        if r == 0:
                            skip_rest_of_position = True
                            print(f"  → skipping remaining realizations of "
                                  f"{sgf_path.name} t{turn}")
                        continue
                    if success:
                        ok += 1
                        sample_counts.append(n_packets)
                        per_position_secs.append(elapsed)
                        print(f"→ {n_packets:3d} packets in {elapsed:.2f}s")
                    else:
                        fail += 1
                        print(f"→ {n_packets:3d} packets in {elapsed:.2f}s (incomplete)")
                        # Same per-position-stall guard for first-
                        # realization non-success (engine_error / timeout
                        # / incomplete).
                        if r == 0:
                            skip_rest_of_position = True
                            print(f"  → skipping remaining realizations of "
                                  f"{sgf_path.name} t{turn}")
    finally:
        pg_conn.close()

    elapsed_total = time.monotonic() - t0
    print(f"\nbatch done: {ok}/{total_jobs} successful in {elapsed_total:.0f}s")
    if sample_counts:
        print(f"  per-job: median {int(np.median(per_position_secs)):.2f}s "
              f"({np.median(sample_counts):.0f} packets)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", default=4, type=int,
                    help="number of (sgf, turn) positions to collect")
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--turn-margin", default=20, type=int)
    ap.add_argument("--max-visits", default=15000, type=int)
    ap.add_argument("--report-every", default=0.02, type=float)
    ap.add_argument("--model", default="b10c128")
    ap.add_argument("--per-position-timeout", default=120.0, type=float)
    ap.add_argument("--n-realizations", default=10, type=int,
                    help="realizations per position; each row in "
                         "mcts_realization with realization_idx 0..N-1")
    ap.add_argument("--skip-already-at", default=0, type=int,
                    help="if > 0, skip positions that already have "
                         "≥ this many complete realizations")
    args = ap.parse_args()

    print(f"=== picking {args.n} positions (stratified by decade, "
          f"uniform over positions within decade) ===")
    picks = pick_positions(
        args.n, seed=args.seed, turn_margin=args.turn_margin,
        skip_already_at=args.skip_already_at,
    )
    print(f"\n=== pipelined collection, Postgres sink ===")
    print(f"  model={args.model} maxVisits={args.max_visits} "
          f"reportEvery={args.report_every}s n_realizations={args.n_realizations}")
    print()

    asyncio.run(
        run_batch(
            picks,
            max_visits=args.max_visits,
            report_every=args.report_every,
            model=args.model,
            per_position_timeout=args.per_position_timeout,
            n_realizations=args.n_realizations,
        )
    )


if __name__ == "__main__":
    main()
