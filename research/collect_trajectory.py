"""
research/collect_trajectory.py

Stage-1 (§4.4 overfit-first sanity) trajectory collector for the
continuous parametric visit-scaling research arc.

Loads an SGF, walks to a chosen turn, sends an analyze query to
the running proxy at ws://127.0.0.1:1235 with
`reportDuringSearchEvery=0.05` and `maxVisits=N`. Captures every
`isDuringSearch=true` partial plus the final, extracts
`(V_t, winrate_t, scoreLead_t, scoreStdev_t)` per packet, dumps
the trajectory to `<out_dir>/<sgf_basename>__turn<N>.npz`.

Per `roadmap-learned-continuous-scaling.md` §4.2-4.4: this is
the harvest step. Fitting + residuals analysis lives in
`fit_hyperbolic.py`.

Usage:
  python collect_trajectory.py \
    --sgf ~/benchmark_sgfs/2000-01-04.sgf \
    --turn 50 \
    --max-visits 10000 \
    --report-every 0.05 \
    --out-dir /home/bork/w/omega/research/trajectories/

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import websockets
from sgfmill import sgf


PROXY = "ws://127.0.0.1:1235"


# ── SGF → KataGo coordinate translation ──────────────────────────────────────

def _sgfmill_move_to_kata_coord(move: tuple[int, int] | None, board_size: int) -> str:
    """sgfmill returns (row, col) with row 0 = bottom for KataGo's convention.
    Convert to KataGo's letter+number string ('A1'-'T19', skipping 'I').
    None = pass.
    """
    if move is None:
        return "pass"
    row, col = move
    # KataGo column letters: A..H, J..T (skip I).
    letters = "ABCDEFGHJKLMNOPQRST"
    col_letter = letters[col]
    return f"{col_letter}{row + 1}"


def _color_to_kata(color: str) -> str:
    return "B" if color == "b" else "W"


def load_sgf_moves(
    sgf_path: Path,
    turn: int,
) -> tuple[list[list[str]], list[list[str]], int, float, str]:
    """Returns (moves_up_to_turn, initial_stones, board_size, komi, rules).

    Uses sgfmill's `get_main_sequence()`: a flat list of Tree_node where
    seq[0] is the root (no move; may carry setup stones), seq[i>=1]
    carries one move each via `node.get_move()` returning
    `(color, (row, col))` with row 0 = board bottom (KataGo's
    convention).
    """
    raw = sgf_path.read_bytes()
    game = sgf.Sgf_game.from_bytes(raw)
    board_size = game.get_size()

    try:
        komi = float(game.get_komi())
    except Exception:
        komi = 7.5
    rules = "chinese"

    seq = game.get_main_sequence()
    root = seq[0]

    initial_stones: list[list[str]] = []
    setup = root.get_setup_stones()
    # sgfmill 1.x: (black_set, white_set, empty_set); the empty third
    # element exists but is rarely populated. Accept either arity.
    if setup is not None:
        black_pts = setup[0] if len(setup) >= 1 else ()
        white_pts = setup[1] if len(setup) >= 2 else ()
        for rc in black_pts:
            initial_stones.append(["B", _sgfmill_move_to_kata_coord(rc, board_size)])
        for rc in white_pts:
            initial_stones.append(["W", _sgfmill_move_to_kata_coord(rc, board_size)])

    moves: list[list[str]] = []
    for node in seq[1:]:
        cm = node.get_move()
        if cm is None:
            continue
        color, mv = cm
        moves.append([_color_to_kata(color), _sgfmill_move_to_kata_coord(mv, board_size)])
        if len(moves) >= turn:
            break

    return moves, initial_stones, board_size, komi, rules


# ── KataGo query construction ────────────────────────────────────────────────

def build_query(
    *,
    qid: str,
    moves: list[list[str]],
    initial_stones: list[list[str]],
    board_size: int,
    komi: float,
    rules: str,
    analyze_turn: int,
    max_visits: int,
    report_every: float,
    model: str,
) -> dict[str, Any]:
    """Construct the analyze query payload. analyzeTurns is the turn
    index in `moves`; KataGo analyzes the position AFTER that many
    moves have been played (turn 0 = empty board, turn N = after N
    moves).
    """
    q: dict[str, Any] = {
        "id": qid,
        "action": "analyze",
        "model": model,
        "moves": moves,
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "analyzeTurns": [analyze_turn],
        "maxVisits": max_visits,
        "reportDuringSearchEvery": report_every,
        "firstReportDuringSearchAfter": min(report_every, 0.02),
        "includePolicy": False,
        "includeOwnership": False,
    }
    if initial_stones:
        q["initialStones"] = initial_stones
    return q


# ── Trajectory capture loop ──────────────────────────────────────────────────

async def collect(
    sgf_path: Path,
    turn: int,
    max_visits: int,
    report_every: float,
    out_dir: Path,
    timeout_s: float,
    model: str,
    realization: int = 0,
    n_realizations: int = 1,
) -> Path:
    moves, initial_stones, board_size, komi, rules = load_sgf_moves(sgf_path, turn)
    if len(moves) < turn:
        raise RuntimeError(
            f"SGF {sgf_path.name} has only {len(moves)} moves; cannot analyze turn {turn}"
        )

    # MoveInfos top-K: capture enough mass to compute visit-entropy
    # robustly. K=12 covers >99% of root-visit mass in typical
    # MCTS-Go searches (the long tail is sub-1% per move).
    TOP_K = 12

    qid = f"trajectory-{sgf_path.stem}-t{turn}-r{realization}-{int(time.time())}"
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

    print(f"  SGF: {sgf_path}")
    print(f"  turn: {turn} (of {len(moves)} moves loaded), realization={realization}")
    print(f"  board: {board_size}x{board_size}, komi={komi}, rules={rules}")
    print(f"  initialStones: {len(initial_stones)}")
    print(f"  maxVisits={max_visits}, reportDuringSearchEvery={report_every}s")
    print(f"  query id: {qid}")
    print()

    # Sample shape: (t, V, winrate, scoreLead, scoreStdev, ids, mi_visits[TOP_K])
    samples_meta: list[tuple[float, int, float, float, float, bool]] = []
    samples_mi: list[list[int]] = []   # per-sample top-K visits, padded with 0
    t0 = time.monotonic()
    final_received = False

    async with websockets.connect(PROXY, max_size=2**24) as ws:
        await ws.send(json.dumps(query))
        deadline = t0 + timeout_s
        while time.monotonic() < deadline and not final_received:
            remaining = deadline - time.monotonic()
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                print(f"  TIMEOUT after {timeout_s}s; only got {len(samples_meta)} samples")
                break
            now = time.monotonic() - t0
            msg = json.loads(raw)
            if "isDuringSearch" not in msg:
                if "error" in msg or "warning" in msg:
                    print(f"  ENGINE MESSAGE: {msg}")
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

            # moveInfos[].visits — per-move visit allocation. Sorted by
            # visits desc by KataGo convention. Pad/truncate to TOP_K.
            mi = msg.get("moveInfos") or []
            mi_visits = [int(m.get("visits", 0)) for m in mi[:TOP_K]]
            mi_visits.extend([0] * (TOP_K - len(mi_visits)))
            samples_mi.append(mi_visits)

            if not ids:
                final_received = True
                print(f"  final received @ {now:.2f}s, visits={visits}, "
                      f"top-K mass={sum(mi_visits)}/{visits} "
                      f"= {sum(mi_visits)/max(visits,1):.3f}")

    elapsed = time.monotonic() - t0
    print(f"\n  collected {len(samples_meta)} samples in {elapsed:.2f}s")
    if not samples_meta:
        raise RuntimeError("no samples collected — engine error?")
    if not final_received:
        print(f"  WARNING: no is_during_search=False final observed; trajectory may be incomplete")

    ts = np.array([s[0] for s in samples_meta], dtype=np.float32)
    vs = np.array([s[1] for s in samples_meta], dtype=np.int32)
    wr = np.array([s[2] for s in samples_meta], dtype=np.float32)
    sl = np.array([s[3] for s in samples_meta], dtype=np.float32)
    ss = np.array([s[4] for s in samples_meta], dtype=np.float32)
    ids_arr = np.array([s[5] for s in samples_meta], dtype=np.bool_)
    mi_arr = np.array(samples_mi, dtype=np.int32)   # (n_samples, TOP_K)

    out_dir.mkdir(parents=True, exist_ok=True)
    if realization == 0 and n_realizations == 1:
        out_name = f"{sgf_path.stem}__turn{turn}.npz"
    else:
        out_name = f"{sgf_path.stem}__turn{turn}__r{realization}.npz"
    out_path = out_dir / out_name
    np.savez_compressed(
        out_path,
        t=ts,
        visits=vs,
        winrate=wr,
        scoreLead=sl,
        scoreStdev=ss,
        isDuringSearch=ids_arr,
        miVisits=mi_arr,   # (n_samples, TOP_K)
        meta=np.array(
            [
                f"sgf={sgf_path.name}",
                f"turn={turn}",
                f"board={board_size}",
                f"komi={komi}",
                f"rules={rules}",
                f"maxVisits={max_visits}",
                f"reportEvery={report_every}",
                f"model={model}",
                f"realization={realization}",
                f"topK={TOP_K}",
                f"qid={qid}",
            ]
        ),
    )
    print(f"  saved: {out_path}")
    return out_path


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sgf", required=True, type=Path)
    ap.add_argument("--turn", required=True, type=int)
    ap.add_argument("--max-visits", default=10000, type=int)
    ap.add_argument("--report-every", default=0.05, type=float)
    ap.add_argument(
        "--out-dir",
        default=Path("/home/bork/w/omega/research/trajectories"),
        type=Path,
    )
    ap.add_argument("--timeout", default=180.0, type=float)
    ap.add_argument(
        "--model",
        default="b10c128",
        help=(
            "SELECTOR model label; query the proxy with action=query_models "
            "to list. Default is b10c128 (smallest, fastest) — per the "
            "user's standing instruction to stay on this tier until "
            "experiments justify scaling up."
        ),
    )
    ap.add_argument(
        "--n-realizations",
        default=1,
        type=int,
        help=(
            "Number of independent search realizations to collect for this "
            "(SGF, turn). Each is a separate analyze query; the proxy's "
            "replay cache should be bypassed (the qid changes per run)."
        ),
    )
    args = ap.parse_args()

    async def run_all() -> None:
        for r in range(args.n_realizations):
            await collect(
                sgf_path=args.sgf.expanduser(),
                turn=args.turn,
                max_visits=args.max_visits,
                report_every=args.report_every,
                out_dir=args.out_dir,
                timeout_s=args.timeout,
                model=args.model,
                realization=r,
                n_realizations=args.n_realizations,
            )

    asyncio.run(run_all())


if __name__ == "__main__":
    main()
