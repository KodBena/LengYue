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


PROXY = "ws://127.0.0.1:1235"
TOP_K = 12


def pick_positions(
    sgf_dir: Path,
    glob: str,
    n: int,
    seed: int,
    turn_margin: int = 20,
    min_moves: int = 60,
) -> list[tuple[Path, int]]:
    rng = random.Random(seed)
    candidates = sorted(sgf_dir.glob(glob))
    rng.shuffle(candidates)

    picks: list[tuple[Path, int]] = []
    skipped: list[tuple[Path, str]] = []
    for path in candidates:
        if len(picks) >= n:
            break
        try:
            raw = path.read_bytes()
            game = sgf.Sgf_game.from_bytes(raw)
            seq = game.get_main_sequence()
            n_moves = sum(1 for node in seq[1:] if node.get_move() is not None)
        except Exception as e:
            skipped.append((path, f"parse error: {e}"))
            continue
        if n_moves < min_moves:
            skipped.append((path, f"only {n_moves} moves"))
            continue
        turn = rng.randint(turn_margin, n_moves - turn_margin)
        picks.append((path, turn))

    print(f"  picked {len(picks)} positions from {sgf_dir.name}/{glob}")
    print(f"  skipped {len(skipped)} candidates")
    if len(picks) < n:
        print(f"  WARNING: only {len(picks)} positions matched criteria (wanted {n})")
    return picks


async def collect_one_over_ws(
    ws: websockets.WebSocketClientProtocol,
    *,
    sgf_path: Path,
    turn: int,
    out_dir: Path,
    max_visits: int,
    report_every: float,
    model: str,
    timeout_s: float,
) -> tuple[bool, int, float]:
    """Send one analyze query over an existing WebSocket and collect
    its trajectory. Returns (ok, n_samples, elapsed_s)."""
    try:
        moves, initial_stones, board_size, komi, rules = load_sgf_moves(sgf_path, turn)
    except Exception as e:
        print(f"  SGF load error: {e}")
        return False, 0, 0.0

    if len(moves) < turn:
        print(f"  SGF only has {len(moves)} moves; cannot analyze turn {turn}")
        return False, 0, 0.0

    qid = f"batch-{sgf_path.stem}-t{turn}-{int(time.time()*1000)}"
    query = build_query(
        qid=qid,
        moves=moves,
        initial_stones=initial_stones,
        board_size=board_size,
        komi=komi,
        rules=rules,
        analyze_turn=turn,
        max_visits=max_visits,
        report_every=report_every,
        model=model,
    )
    await ws.send(json.dumps(query))

    samples_meta: list[tuple[float, int, float, float, float, bool]] = []
    samples_mi: list[list[int]] = []
    t0 = time.monotonic()
    deadline = t0 + timeout_s
    final_received = False

    while time.monotonic() < deadline and not final_received:
        remaining = deadline - time.monotonic()
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            print(f"  TIMEOUT after {timeout_s}s; got {len(samples_meta)} samples")
            break
        now = time.monotonic() - t0
        msg = json.loads(raw)
        if "isDuringSearch" not in msg:
            if "error" in msg:
                print(f"  ENGINE ERROR: {msg}")
                return False, 0, 0.0
            continue
        if msg.get("id") != qid:
            continue
        root = msg.get("rootInfo") or {}
        visits = int(root.get("visits", 0))
        winrate = float(root.get("winrate", 0.0))
        score_lead = float(root.get("scoreLead", 0.0))
        score_stdev = float(root.get("scoreStdev", 0.0))
        ids = bool(msg.get("isDuringSearch"))
        samples_meta.append((now, visits, winrate, score_lead, score_stdev, ids))
        mi = msg.get("moveInfos") or []
        mi_visits = [int(m.get("visits", 0)) for m in mi[:TOP_K]]
        mi_visits.extend([0] * (TOP_K - len(mi_visits)))
        samples_mi.append(mi_visits)
        if not ids:
            final_received = True

    elapsed = time.monotonic() - t0
    if not samples_meta:
        return False, 0, elapsed

    ts = np.array([s[0] for s in samples_meta], dtype=np.float32)
    vs = np.array([s[1] for s in samples_meta], dtype=np.int32)
    wr = np.array([s[2] for s in samples_meta], dtype=np.float32)
    sl = np.array([s[3] for s in samples_meta], dtype=np.float32)
    ss = np.array([s[4] for s in samples_meta], dtype=np.float32)
    ids_arr = np.array([s[5] for s in samples_meta], dtype=np.bool_)
    mi_arr = np.array(samples_mi, dtype=np.int32)

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{sgf_path.stem}__turn{turn}.npz"
    np.savez_compressed(
        out_path,
        t=ts, visits=vs, winrate=wr, scoreLead=sl, scoreStdev=ss,
        isDuringSearch=ids_arr, miVisits=mi_arr,
        meta=np.array([
            f"sgf={sgf_path.name}", f"turn={turn}",
            f"board={board_size}", f"komi={komi}", f"rules={rules}",
            f"maxVisits={max_visits}", f"reportEvery={report_every}",
            f"model={model}", f"topK={TOP_K}", f"qid={qid}",
        ]),
    )
    return True, len(samples_meta), elapsed


async def run_batch(
    picks: list[tuple[Path, int]],
    *,
    out_dir: Path,
    max_visits: int,
    report_every: float,
    model: str,
    per_position_timeout: float,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.monotonic()
    ok = fail = 0
    sample_counts: list[int] = []
    per_position_secs: list[float] = []

    async with websockets.connect(PROXY, max_size=2**24) as ws:
        for i, (sgf_path, turn) in enumerate(picks):
            t_pos_start = time.monotonic() - t0
            print(f"[{i+1:3d}/{len(picks)}] {sgf_path.name} t{turn:3d}  "
                  f"(elapsed {t_pos_start:6.1f}s)", end=" ", flush=True)
            try:
                success, n_samples, elapsed = await collect_one_over_ws(
                    ws,
                    sgf_path=sgf_path,
                    turn=turn,
                    out_dir=out_dir,
                    max_visits=max_visits,
                    report_every=report_every,
                    model=model,
                    timeout_s=per_position_timeout,
                )
            except Exception as e:
                print(f"  FAIL: {e}")
                fail += 1
                continue
            if success:
                ok += 1
                sample_counts.append(n_samples)
                per_position_secs.append(elapsed)
                print(f"→ {n_samples:3d} samples in {elapsed:.2f}s")
            else:
                fail += 1
                print(f"→ FAILED")

    elapsed_total = time.monotonic() - t0
    print(f"\nbatch done: {ok}/{len(picks)} successful in {elapsed_total:.0f}s")
    if sample_counts:
        print(f"  per-position: median {int(np.median(per_position_secs)):.2f}s "
              f"({np.median(sample_counts):.0f} samples)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", default=100, type=int)
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--sgf-dir", default=Path("/home/bork/benchmark_sgfs"), type=Path)
    ap.add_argument("--glob", default="2000-*.sgf")
    ap.add_argument(
        "--out-dir",
        default=Path("/home/bork/w/omega/research/trajectories/batch_year2000"),
        type=Path,
    )
    ap.add_argument("--max-visits", default=15000, type=int)
    ap.add_argument("--report-every", default=0.02, type=float)
    ap.add_argument("--model", default="b10c128")
    ap.add_argument("--per-position-timeout", default=60.0, type=float)
    args = ap.parse_args()

    print(f"=== picking {args.n} positions ===")
    picks = pick_positions(args.sgf_dir, args.glob, args.n, args.seed)
    print(f"\n=== pipelined collection over single WebSocket ===")
    print(f"  model={args.model} maxVisits={args.max_visits} "
          f"reportEvery={args.report_every}s")
    print(f"  out_dir={args.out_dir}")
    print()

    asyncio.run(
        run_batch(
            picks,
            out_dir=args.out_dir,
            max_visits=args.max_visits,
            report_every=args.report_every,
            model=args.model,
            per_position_timeout=args.per_position_timeout,
        )
    )


if __name__ == "__main__":
    main()
