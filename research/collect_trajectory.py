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

import websockets
from sgfmill import sgf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import (  # noqa: E402
    connect as pg_connect, ensure_schema, ensure_position,
    next_realization_idx, start_realization, reset_packets,
    StreamWriter, mark_realization,
)


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
        "includePolicy": True,
        "includeOwnership": True,
        "includePVVisits": True,
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
    timeout_s: float,
    model: str,
    realization: int = 0,
    pg_conn: Any = None,
) -> dict[str, Any]:
    """Collect one trajectory; every received packet is INSERT'd into
    Postgres (`mcts_packet`, autocommit per packet) as it arrives.
    Returns a summary dict on completion; the actual data lives in
    Postgres under `mcts_realization` / `mcts_packet`.

    Robustness: per-packet autocommit. Process crash mid-realization
    leaves the row at `status='in_flight'` with all packets received
    before the crash durably present.
    """
    moves, initial_stones, board_size, komi, rules = load_sgf_moves(sgf_path, turn)
    if len(moves) < turn:
        raise RuntimeError(
            f"SGF {sgf_path.name} has only {len(moves)} moves; cannot analyze turn {turn}"
        )

    qid = f"trajectory-{sgf_path.stem}-t{turn}-r{realization}-{int(time.time()*1000)}"
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

    conn = pg_conn if pg_conn is not None else pg_connect()
    own_conn = pg_conn is None
    try:
        ensure_schema(conn)
        position_id = ensure_position(
            conn, sgf_path=str(sgf_path), stem=sgf_path.stem, turn=turn,
        )
        realization_id = start_realization(
            conn, position_id=position_id, realization_idx=realization,
            qid=qid, model=model, max_visits=max_visits, report_every=report_every,
        )
        reset_packets(conn, realization_id)
        writer = StreamWriter(conn=conn, realization_id=realization_id)

        print(f"  SGF: {sgf_path}")
        print(f"  turn: {turn} (of {len(moves)} moves loaded), realization={realization}")
        print(f"  board: {board_size}x{board_size}, komi={komi}, rules={rules}")
        print(f"  initialStones: {len(initial_stones)}")
        print(f"  maxVisits={max_visits}, reportDuringSearchEvery={report_every}s")
        print(f"  query id: {qid}  position_id={position_id} realization_id={realization_id}")

        n_packets = 0
        final_visits = 0
        final_received = False
        t0 = time.monotonic()
        error = ""

        async with websockets.connect(PROXY, max_size=2**24) as ws:
            await ws.send(json.dumps(query))
            deadline = t0 + timeout_s
            while time.monotonic() < deadline and not final_received:
                remaining = deadline - time.monotonic()
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    error = f"timeout after {timeout_s}s, n_packets={n_packets}"
                    print(f"  TIMEOUT after {timeout_s}s; only got {n_packets} packets")
                    break
                now = time.monotonic() - t0
                msg = json.loads(raw)
                if "isDuringSearch" not in msg:
                    if "error" in msg or "warning" in msg:
                        print(f"  ENGINE MESSAGE: {msg}")
                        if "error" in msg:
                            error = str(msg["error"])
                            break
                    continue
                if msg.get("id") != qid:
                    continue
                writer.append(now, msg)
                n_packets += 1
                if not msg.get("isDuringSearch"):
                    final_visits = int((msg.get("rootInfo") or {}).get("visits", 0))
                    final_received = True
                    print(f"  final @ {now:.2f}s, visits={final_visits}, n_packets={n_packets}")

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
            conn,
            realization_id=realization_id,
            status=status,
            final_visits=final_visits,
            n_packets=n_packets,
            elapsed_s=elapsed,
            error=error,
        )
        if not final_received:
            print(f"  WARNING: realization marked '{status}' ({error or 'no final'})")
        return {
            "status": status, "n_packets": n_packets, "elapsed_s": elapsed,
            "final_visits": final_visits, "qid": qid, "error": error,
            "position_id": position_id, "realization_id": realization_id,
        }
    finally:
        if own_conn:
            conn.close()


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sgf", required=True, type=Path)
    ap.add_argument("--turn", required=True, type=int)
    ap.add_argument("--max-visits", default=10000, type=int)
    ap.add_argument("--report-every", default=0.05, type=float)
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
            "(SGF, turn). Each is a separate analyze query; per-realization "
            "data lives in Redis under traj:{stem}:t{turn}:r{i}."
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
                timeout_s=args.timeout,
                model=args.model,
                realization=r,
            )

    asyncio.run(run_all())


if __name__ == "__main__":
    main()
