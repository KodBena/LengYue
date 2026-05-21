"""
research/sgf_index.py

One-time SGF corpus scanner. Walks ~/benchmark_sgfs/ and
~/sgf_validation/, parses each SGF, extracts decade + move-count
metadata, and UPSERTs into Postgres `mcts_sgf`. Idempotent: re-running
re-scans files (so it picks up new SGFs and updates anything that
changed).

Decade extraction
═════════════════
The corpus's filename convention is date-prefixed (`2000-01-04.sgf`,
`1700JQXG201.sgf`). Year is the first 4 numeric characters of the
filename if those parse as a plausible year (1500 ≤ Y ≤ 2100).
Otherwise we fall back to the SGF root node's `DT` property and try
to parse a year from that. If both fail, the SGF is recorded with
decade=NULL — included in the index for accounting but excluded from
the stratified-by-decade sampler.

n_valid_turns
═════════════
For a position to be a valid sample, we want it in mid-game: at
least `turn_margin` moves played already, and at least `turn_margin`
moves remaining. So `n_valid_turns = max(0, n_moves − 2*turn_margin)`.
Games shorter than 2*turn_margin contribute zero positions.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

from sgfmill import sgf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import connect, ensure_schema  # noqa: E402


YEAR_PREFIX_RE = re.compile(r"^(\d{4})")
SGF_DT_YEAR_RE = re.compile(r"\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b")


def extract_year_from_filename(stem: str) -> int | None:
    m = YEAR_PREFIX_RE.match(stem)
    if not m:
        return None
    y = int(m.group(1))
    if 1500 <= y <= 2100:
        return y
    return None


def extract_year_from_sgf_dt(dt_prop: str) -> int | None:
    if not dt_prop:
        return None
    m = SGF_DT_YEAR_RE.search(dt_prop)
    return int(m.group(1)) if m else None


def scan_sgf(path: Path) -> dict | None:
    """Parse one SGF; return a dict of index fields or None on failure."""
    try:
        raw = path.read_bytes()
        game = sgf.Sgf_game.from_bytes(raw)
    except Exception as e:
        print(f"  parse failed for {path.name}: {e}", file=sys.stderr)
        return None
    seq = game.get_main_sequence()
    n_moves = sum(1 for node in seq[1:] if node.get_move() is not None)
    root = seq[0] if seq else None

    year = extract_year_from_filename(path.stem)
    if year is None and root is not None:
        try:
            dt = root.get_raw("DT").decode("utf-8", errors="ignore")
        except Exception:
            dt = ""
        year = extract_year_from_sgf_dt(dt)

    decade = (year // 10) * 10 if year is not None else None

    try:
        komi = float(game.get_komi())
    except Exception:
        komi = None
    try:
        board_size = int(game.get_size())
    except Exception:
        board_size = None
    try:
        rules = root.get_raw("RU").decode("utf-8", errors="ignore") if root else ""
    except Exception:
        rules = ""

    return {
        "path": str(path),
        "stem": path.stem,
        "year": year,
        "decade": decade,
        "n_moves": n_moves,
        "komi": komi,
        "board_size": board_size,
        "rules": rules,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dirs", nargs="+", type=Path,
        default=[
            Path("/home/bork/benchmark_sgfs"),
            Path("/home/bork/sgf_validation"),
        ],
        help="directories to scan for *.sgf"
    )
    ap.add_argument("--turn-margin", default=20, type=int,
                    help="min moves before turn / before end (excluded from valid range)")
    ap.add_argument("--min-decade", default=1500, type=int)
    ap.add_argument("--max-decade", default=2100, type=int)
    args = ap.parse_args()

    paths: list[Path] = []
    for d in args.dirs:
        if not d.exists():
            print(f"  WARN: {d} does not exist, skipping", file=sys.stderr)
            continue
        paths.extend(sorted(d.glob("*.sgf")))
    print(f"=== scanning {len(paths)} SGFs from {len(args.dirs)} dirs ===")

    conn = connect()
    ensure_schema(conn)

    t0 = time.monotonic()
    ok = fail = 0
    with conn.cursor() as cur:
        for i, p in enumerate(paths):
            if i % 500 == 0:
                print(f"  [{i}/{len(paths)}] {time.monotonic()-t0:.1f}s  "
                      f"ok={ok} fail={fail}")
            row = scan_sgf(p)
            if row is None:
                fail += 1
                continue
            decade = row["decade"]
            if decade is not None and not (args.min_decade <= decade <= args.max_decade):
                decade = None
            n_valid_turns = max(0, row["n_moves"] - 2 * args.turn_margin)
            try:
                cur.execute(
                    """
                    INSERT INTO mcts_sgf (path, stem, decade, year, n_moves,
                                          n_valid_turns, komi, board_size, rules,
                                          scanned_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (path) DO UPDATE
                        SET decade = EXCLUDED.decade,
                            year = EXCLUDED.year,
                            n_moves = EXCLUDED.n_moves,
                            n_valid_turns = EXCLUDED.n_valid_turns,
                            komi = EXCLUDED.komi,
                            board_size = EXCLUDED.board_size,
                            rules = EXCLUDED.rules,
                            scanned_at = NOW()
                    """,
                    (row["path"], row["stem"], decade, row["year"], row["n_moves"],
                     n_valid_turns, row["komi"], row["board_size"], row["rules"]),
                )
                ok += 1
            except Exception as e:
                print(f"  INSERT failed for {p.name}: {e}", file=sys.stderr)
                fail += 1

    elapsed = time.monotonic() - t0
    print(f"\nscan done: ok={ok} fail={fail} in {elapsed:.1f}s")

    # Per-decade summary
    print("\n=== decade summary (n_valid_turns > 0 only) ===")
    print(f"  {'decade':<8} {'n_sgfs':>7} {'sum_valid_turns':>16}")
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT decade, COUNT(*), SUM(n_valid_turns)
            FROM mcts_sgf
            WHERE n_valid_turns > 0
            GROUP BY decade
            ORDER BY decade NULLS LAST
            """
        )
        for decade, n_sgfs, sum_positions in cur.fetchall():
            d_str = str(decade) if decade is not None else "(null)"
            print(f"  {d_str:<8} {n_sgfs:>7} {sum_positions:>16}")

    conn.close()


if __name__ == "__main__":
    main()
