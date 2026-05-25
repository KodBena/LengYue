"""
research/collect_compression_corpus.py

Collect a small corpus of SPA-shape analysis bundles for the
compression characterisation arc
(`docs/notes/analysis-bundle-compression-plan.md`).

What this differs from `collect_trajectory.py`:
  - Only final packets are kept. We omit `reportDuringSearchEvery`
    on the query so KataGo emits a single `isDuringSearch=False`
    packet per turn (no during-search previews to discard).
  - The proxy's `analysis_enricher` (wire-name `delta_analysis`)
    is opted in via the `capabilities` field; the curated
    "Quality (Robust-Child Calibrated)" palette is sent as the
    `analysis_config` field so packets arrive with the SPA's
    `extra.state` / `extra.delta` / `extra.summary` envelope —
    the field the prior research corpus is missing.
  - Storage is the redis at 127.0.0.1:6380 (the user's separate
    collection instance), using the `redis_sink.StreamWriter`
    key schema (`traj:{stem}:t{turn}:r0` stream + `meta:` hash
    + the `positions` set index). One realization per (stem,
    turn) since there are no during-search packets to multiplex.

Usage:
  python research/collect_compression_corpus.py \\
      [--n-games 3] [--max-turns-per-game 250] [--sgf-dir ~/benchmark_sgfs]

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import pickle
import random
import sys
import time
from pathlib import Path
from typing import Any

import redis
import websockets
from sgfmill import sgf

# We re-use the redis_sink key-schema helpers but inject our own redis
# client (port 6380 — the compression-corpus instance, distinct from
# the 6379 the existing pipeline uses). StreamWriter takes the client
# as a dataclass field so the override is non-invasive.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from redis_sink import StreamWriter, traj_key  # noqa: E402

PROXY = "ws://127.0.0.1:1235"
MODEL = "b10c128"
MAX_VISITS = 200

# Connection timeout per query. With max_visits=200 on b10c128 we
# typically see <5s per query; the 30s ceiling is loose enough to
# absorb proxy-side queueing spikes without ever stalling the run.
QUERY_TIMEOUT_S = 30.0


# ── Robust-child palette wire shape ─────────────────────────────────────────
#
# Mirrors `frontend/src/store/defaults.ts`'s `analysis_env` block (the
# "Quality (Robust-Child Calibrated)" palette, id='quality') compiled
# by `frontend/src/services/analysis-config.ts::compileAnalysisConfig`
# into the {bindings, parameters, symbols} envelope the proxy
# consumes. Bit-equal to what the SPA would send when this palette is
# active.

ANALYSIS_CONFIG: dict[str, Any] = {
    "bindings": {
        "delta_fn": "quality_delta",
        "state_fns": {
            "Complexity": "complexity",
            "Win Probability": "winrate",
            "Score Advantage": "score_lead",
        },
        "summary_fn": "min_summary",
    },
    "parameters": {
        "alpha": 0.25,
    },
    "symbols": {
        "visit_entropy":      'safe(entropy([mi["visits"] for mi in x["moveInfos"]]))',
        "decisiveness":       '_maxvisits(x) / x["rootInfo"]["visits"]',
        "complexity":         'safe(_visit_entropy(x) / _uniform_entropy(len(x["moveInfos"])))',
        "winrate":            'x["rootInfo"]["winrate"]',
        "score_lead":         'x["rootInfo"]["scoreLead"]',
        "score_volatility":   'x["rootInfo"]["scoreStdev"]',
        "nn_uncertainty":     'x["rootInfo"]["rawStWrError"]',
        "player_sign":        '1.0 if x["rootInfo"]["currentPlayer"] == "B" else -1.0',
        "visit_ratio":        '_uservisits(x[0]) / _maxvisits(x[0])',
        "quality_delta":      'visit_ratio(x) ** (decisiveness(x[0]) ** alpha)',
        "scoreLead_delta":    'x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"]',
        "winrate_loss_topvsuser":
            '(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0',
        "scoreLead_loss_topvsuser":
            'player_sign(x[0]) * ((x[0]["rootInfo"]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0)',
        "user_order":         'x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999',
        "policy_loss":        'x[0]["moveInfos"][0]["prior"] - (x[0]["userMoveInfo"]["prior"] if x[0]["userMoveInfo"] else 0)',
        "risk_adjusted_score_loss":
            'safe((x[0]["moveInfos"][0]["scoreLead"] - (x[0]["userMoveInfo"]["scoreLead"] if x[0]["userMoveInfo"] else x[0]["moveInfos"][0]["scoreLead"])) / x[0]["rootInfo"]["scoreStdev"])',
        "rank_quality":       '1.0 / (1 + (x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999))',
        "min_summary":        'float(min(x))',
        "mean_summary":       'float(mean(x))',
    },
}

# Engine-side overrides matching the SPA's seeded `overrideSettings`
# block. Same registry-default values the SPA sends.
OVERRIDE_SETTINGS: dict[str, Any] = {
    "reportAnalysisWinratesAs": "WHITE",
    "rootNumSymmetriesToSample": 8,
    "wideRootNoise": 0.02,
}


# ── SGF parsing (matches collect_trajectory.py's conventions) ───────────────

def _sgfmill_move_to_kata_coord(move: tuple[int, int] | None, board_size: int) -> str:
    if move is None:
        return "pass"
    row, col = move
    letters = "ABCDEFGHJKLMNOPQRST"
    return f"{letters[col]}{row + 1}"


def _color_to_kata(color: str) -> str:
    return "B" if color == "b" else "W"


def _round_komi(k: float) -> float:
    """KataGo only accepts integer or half-integer komi in [-150, 150].
    Some SGFs (Korean tiebreaker convention) use quarter-integer komi
    like 2.75 or 7.25. Round to nearest half-integer; the compression
    corpus doesn't care about preserving the original komi exactly."""
    rounded = round(k * 2.0) / 2.0
    return max(-150.0, min(150.0, rounded))


def load_sgf(sgf_path: Path) -> tuple[list[list[str]], list[list[str]], int, float, str]:
    raw = sgf_path.read_bytes()
    game = sgf.Sgf_game.from_bytes(raw)
    board_size = game.get_size()
    try:
        komi = _round_komi(float(game.get_komi()))
    except Exception:
        komi = 7.5
    rules = "chinese"

    seq = game.get_main_sequence()
    root = seq[0]
    initial_stones: list[list[str]] = []
    setup = root.get_setup_stones()
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

    return moves, initial_stones, board_size, komi, rules


# ── Query construction ──────────────────────────────────────────────────────

def build_query(
    *,
    qid: str,
    moves: list[list[str]],
    initial_stones: list[list[str]],
    board_size: int,
    komi: float,
    rules: str,
    analyze_turn: int,
) -> dict[str, Any]:
    """Single-turn analyze query. NOTE: `reportDuringSearchEvery` is
    deliberately omitted — KataGo's default behaviour without it is to
    emit only the final packet, which is what we want for the
    compression corpus. `firstReportDuringSearchAfter` is also
    omitted (it would have no effect; nothing to first-report)."""
    q: dict[str, Any] = {
        "id": qid,
        "action": "analyze",
        "model": MODEL,
        "moves": moves,
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "analyzeTurns": [analyze_turn],
        "maxVisits": MAX_VISITS,
        "includePolicy": True,
        "includeOwnership": True,
        "includePVVisits": True,
        "overrideSettings": OVERRIDE_SETTINGS,
        "analysis_config": ANALYSIS_CONFIG,
        "capabilities": {"delta_analysis": {}},
    }
    if initial_stones:
        q["initialStones"] = initial_stones
    return q


# ── Per-turn collection ─────────────────────────────────────────────────────

async def collect_turn(
    ws,
    *,
    sgf_path: Path,
    turn: int,
    moves_all: list[list[str]],
    initial_stones: list[list[str]],
    board_size: int,
    komi: float,
    rules: str,
    r: redis.Redis,
) -> tuple[bool, float, int, str]:
    """Analyze one (sgf, turn). Returns (ok, elapsed_s, final_visits, msg_or_status).

    Sends the query, waits for the single `isDuringSearch=False`
    packet (timing out at QUERY_TIMEOUT_S), and XADDs it via
    StreamWriter under traj:{stem}:t{turn}:r0."""
    qid = f"corpus-{sgf_path.stem}-t{turn}-{int(time.time()*1000)}"
    moves_prefix = moves_all[:turn]
    query = build_query(
        qid=qid,
        moves=moves_prefix,
        initial_stones=initial_stones,
        board_size=board_size,
        komi=komi,
        rules=rules,
        analyze_turn=turn,
    )

    writer = StreamWriter(stem=sgf_path.stem, turn=turn, realization=0, r=r)
    writer.reset()

    t0 = time.monotonic()
    await ws.send(json.dumps(query))
    deadline = t0 + QUERY_TIMEOUT_S
    final_visits = 0
    n_packets = 0
    final_received = False
    error = ""

    while time.monotonic() < deadline and not final_received:
        remaining = deadline - time.monotonic()
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            error = f"timeout after {QUERY_TIMEOUT_S}s"
            break
        msg = json.loads(raw)
        # Engine-error responses can land with or without our `id`
        # (the proxy keeps the orig id on error forwards). Either
        # way, surface and break — the query won't succeed.
        if "error" in msg:
            if msg.get("id") in (qid, None):
                error = str(msg["error"])
                break
            continue
        if msg.get("id") != qid:
            # Stale packet from a prior query or a multiplexed
            # session — skip without warning.
            continue
        if "isDuringSearch" not in msg:
            # Metadata-shaped responses (query_version, query_models,
            # warning-only) — skip.
            continue
        if msg.get("isDuringSearch"):
            # Defensive: with reportDuringSearchEvery omitted we
            # shouldn't see any during-search packets, but if we
            # do, drop them. The compression-corpus contract is
            # finals only.
            continue
        # Final packet — capture, store, done.
        now = time.monotonic() - t0
        writer.append(now, msg)
        n_packets += 1
        final_visits = int((msg.get("rootInfo") or {}).get("visits", 0))
        final_received = True

    elapsed = time.monotonic() - t0
    if final_received:
        writer.mark_complete(
            status="complete",
            qid=qid,
            model=MODEL,
            komi=komi,
            board_size=board_size,
            rules=rules,
            final_visits=final_visits,
            max_visits=MAX_VISITS,
            report_every=0.0,
            n_packets=n_packets,
            elapsed_s=elapsed,
        )
        return True, elapsed, final_visits, ""
    else:
        status = "timeout" if "timeout" in error else "engine_error"
        writer.mark_complete(
            status=status,
            qid=qid,
            model=MODEL,
            komi=komi,
            board_size=board_size,
            rules=rules,
            final_visits=final_visits,
            max_visits=MAX_VISITS,
            report_every=0.0,
            n_packets=n_packets,
            elapsed_s=elapsed,
            error=error,
        )
        return False, elapsed, final_visits, error or status


# ── Game-level driver ───────────────────────────────────────────────────────

async def collect_game(
    sgf_path: Path,
    *,
    max_turns: int,
    r: redis.Redis,
) -> dict[str, Any]:
    moves, init_stones, board, komi, rules = load_sgf(sgf_path)
    n_moves = min(len(moves), max_turns)
    print(f"  game: {sgf_path.name} — {len(moves)} moves; analyzing turns 1..{n_moves}",
          flush=True)

    ok_count = 0
    fail_count = 0
    elapsed_total = 0.0
    game_t0 = time.monotonic()
    last_log = game_t0

    async with websockets.connect(PROXY, max_size=2**24) as ws:
        for turn in range(1, n_moves + 1):
            # Skip if already collected (resumable). meta hash is set
            # on mark_complete — its presence means we finished this
            # (stem, turn) on a prior run.
            tkey = traj_key(sgf_path.stem, turn, 0)
            if r.exists(tkey):
                ok_count += 1
                continue
            try:
                ok, dt, visits, info = await collect_turn(
                    ws,
                    sgf_path=sgf_path,
                    turn=turn,
                    moves_all=moves,
                    initial_stones=init_stones,
                    board_size=board,
                    komi=komi,
                    rules=rules,
                    r=r,
                )
            except Exception as e:
                print(f"    turn {turn}: WS-level error {e!r}", flush=True)
                fail_count += 1
                continue
            elapsed_total += dt
            if ok:
                ok_count += 1
            else:
                fail_count += 1
                print(f"    turn {turn}: FAIL ({info}) after {dt:.1f}s", flush=True)

            # Progress log: every 20 turns OR every 60s of wall time,
            # whichever comes first.
            now = time.monotonic()
            if turn % 20 == 0 or (now - last_log) > 60:
                game_elapsed = now - game_t0
                rate = (ok_count + fail_count) / max(game_elapsed, 1e-9)
                eta = (n_moves - turn) / max(rate, 1e-9)
                print(
                    f"    progress: turn {turn}/{n_moves} "
                    f"({ok_count} ok, {fail_count} fail), "
                    f"elapsed {game_elapsed:.0f}s, "
                    f"~{rate:.2f} q/s, ETA-game {eta:.0f}s",
                    flush=True,
                )
                last_log = now

    game_elapsed = time.monotonic() - game_t0
    print(
        f"  game done: {ok_count} ok / {fail_count} fail in {game_elapsed:.0f}s "
        f"({sgf_path.name})",
        flush=True,
    )
    return {
        "sgf": sgf_path.name,
        "n_turns": n_moves,
        "ok": ok_count,
        "fail": fail_count,
        "elapsed_s": game_elapsed,
    }


# ── Top-level ───────────────────────────────────────────────────────────────

def pick_sgfs(sgf_dir: Path, n: int, seed: int) -> list[Path]:
    """Deterministic random sample of N SGFs from the directory. The
    seed makes the run reproducible — the same N games each invocation
    until the user changes seed."""
    all_paths = sorted(sgf_dir.glob("*.sgf"))
    if len(all_paths) <= n:
        return all_paths
    rng = random.Random(seed)
    return sorted(rng.sample(all_paths, n))


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-games", type=int, default=3)
    ap.add_argument("--max-turns-per-game", type=int, default=250)
    ap.add_argument("--sgf-dir", default=str(Path.home() / "benchmark_sgfs"))
    ap.add_argument("--seed", type=int, default=20260525)
    ap.add_argument("--redis-host", default="127.0.0.1")
    ap.add_argument("--redis-port", type=int, default=6380)
    args = ap.parse_args()

    sgf_dir = Path(args.sgf_dir).expanduser()
    if not sgf_dir.is_dir():
        print(f"ERROR: sgf_dir not a directory: {sgf_dir}", file=sys.stderr)
        return 2

    sgfs = pick_sgfs(sgf_dir, args.n_games, args.seed)
    if not sgfs:
        print(f"ERROR: no SGFs found under {sgf_dir}", file=sys.stderr)
        return 2

    r = redis.Redis(
        host=args.redis_host, port=args.redis_port, db=0, decode_responses=False,
    )
    r.ping()

    total_turns = sum(min(args.max_turns_per_game, 250) for _ in sgfs)
    # Best-guess ETA: ~3s per turn on b10c128 at 200 visits. Loose
    # upper-bound estimate, just to set expectations at startup; the
    # per-game progress logger reports actual rates.
    est_seconds = total_turns * 3
    est_min = est_seconds / 60

    print("=" * 72, flush=True)
    print(f"compression-corpus collection — starting {time.strftime('%Y-%m-%d %H:%M:%S')}",
          flush=True)
    print(f"  proxy:        {PROXY}", flush=True)
    print(f"  model:        {MODEL}", flush=True)
    print(f"  max_visits:   {MAX_VISITS}", flush=True)
    print(f"  redis:        {args.redis_host}:{args.redis_port}", flush=True)
    print(f"  sgfs:         {len(sgfs)} games, up to {args.max_turns_per_game} turns each",
          flush=True)
    print(f"  upper-bound:  ~{total_turns} queries, ETA-rough ≈ {est_min:.0f}min @ 3s/q",
          flush=True)
    print("  selected:", flush=True)
    for p in sgfs:
        print(f"    {p.name}", flush=True)
    print("=" * 72, flush=True)

    grand_t0 = time.monotonic()
    summaries: list[dict[str, Any]] = []
    for i, sgf_path in enumerate(sgfs, start=1):
        print(f"[{i}/{len(sgfs)}] {sgf_path.name}", flush=True)
        summary = await collect_game(
            sgf_path, max_turns=args.max_turns_per_game, r=r,
        )
        summaries.append(summary)

    grand_elapsed = time.monotonic() - grand_t0
    total_ok = sum(s["ok"] for s in summaries)
    total_fail = sum(s["fail"] for s in summaries)
    print("=" * 72, flush=True)
    print(f"DONE in {grand_elapsed:.0f}s ({grand_elapsed/60:.1f}min)", flush=True)
    print(f"  {total_ok} packets collected, {total_fail} failures", flush=True)
    for s in summaries:
        print(
            f"  - {s['sgf']}: {s['ok']}/{s['n_turns']} ok, "
            f"{s['fail']} fail, {s['elapsed_s']:.0f}s",
            flush=True,
        )
    print(f"redis: {args.redis_host}:{args.redis_port} — {r.dbsize()} keys", flush=True)
    return 0 if total_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
