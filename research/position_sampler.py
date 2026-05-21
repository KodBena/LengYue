"""
research/position_sampler.py

Stratified-by-decade uniform-over-positions sampler.

Sampling rule (per the user's directive)
════════════════════════════════════════
A "position" is a (sgf, turn) pair. Within a decade stratum all
positions have equal probability. Across decade strata, each decade
gets equal probability per pick (uniform over decades, then uniform
over positions within decade).

Concretely, per pick:
  1. Sample a decade uniformly from {decades with n_valid_turns > 0}.
  2. Sample an SGF within that decade, weighted by `n_valid_turns`
     (so larger games contribute proportionally more positions —
     this is what makes the conditional distribution uniform over
     (sgf, turn) within the decade).
  3. Sample `turn ∈ [turn_margin, n_moves − turn_margin)` uniformly.

Dedup
═════
A `--skip-existing` mode optionally consults `mcts_position` and
`mcts_realization` to skip positions that already have at least
`min_realizations` complete realizations. Useful for the
continuous-daemon "top up to target N" semantic.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import connect  # noqa: E402


@dataclass(frozen=True)
class SgfRow:
    path: str
    stem: str
    decade: int
    n_moves: int
    n_valid_turns: int


@dataclass
class StratifiedSampler:
    """Holds the SGF index in memory for O(log N) per pick."""

    rng: random.Random
    by_decade: dict[int, list[SgfRow]]
    turn_margin: int = 20

    @classmethod
    def from_postgres(
        cls, conn, *, turn_margin: int = 20, rng: random.Random | None = None,
    ) -> "StratifiedSampler":
        """Load active SGFs (n_valid_turns > 0, decade not null) from
        mcts_sgf and bucket by decade."""
        by_decade: dict[int, list[SgfRow]] = {}
        with conn.cursor() as c:
            c.execute(
                """
                SELECT path, stem, decade, n_moves, n_valid_turns
                FROM mcts_sgf
                WHERE n_valid_turns > 0
                  AND decade IS NOT NULL
                  AND poison_reason IS NULL
                """
            )
            for path, stem, decade, n_moves, n_valid_turns in c.fetchall():
                by_decade.setdefault(decade, []).append(
                    SgfRow(path=path, stem=stem, decade=decade,
                           n_moves=n_moves, n_valid_turns=n_valid_turns)
                )
        if not by_decade:
            raise RuntimeError(
                "mcts_sgf is empty; run sgf_index.py first to populate it."
            )
        return cls(
            rng=rng or random.Random(),
            by_decade=by_decade,
            turn_margin=turn_margin,
        )

    def decades(self) -> list[int]:
        return sorted(self.by_decade.keys())

    def pick_one(self) -> tuple[SgfRow, int]:
        """Returns (sgf_row, turn) per the stratified-uniform rule."""
        decade = self.rng.choice(self.decades())
        sgfs = self.by_decade[decade]
        weights = [s.n_valid_turns for s in sgfs]
        sgf_row = self.rng.choices(sgfs, weights=weights, k=1)[0]
        # turn ∈ [turn_margin, n_moves − turn_margin)
        turn = self.rng.randrange(
            self.turn_margin, sgf_row.n_moves - self.turn_margin,
        )
        return sgf_row, turn

    def pick_n(
        self,
        n: int,
        *,
        skip_already_at: int = 0,
        pg_conn=None,
    ) -> list[tuple[SgfRow, int]]:
        """Pick N positions. If skip_already_at > 0, query Postgres to
        skip (stem, turn) pairs that already have ≥ skip_already_at
        complete realizations."""
        picks: list[tuple[SgfRow, int]] = []
        seen: set[tuple[str, int]] = set()
        max_tries = n * 20
        for _ in range(max_tries):
            if len(picks) >= n:
                break
            sgf_row, turn = self.pick_one()
            key = (sgf_row.stem, turn)
            if key in seen:
                continue
            if skip_already_at > 0 and pg_conn is not None:
                if self._already_at(pg_conn, sgf_row.stem, turn, skip_already_at):
                    continue
            seen.add(key)
            picks.append((sgf_row, turn))
        if len(picks) < n:
            print(f"  WARNING: only {len(picks)} unique picks after "
                  f"{max_tries} tries", file=sys.stderr)
        return picks

    @staticmethod
    def _already_at(conn, stem: str, turn: int, threshold: int) -> bool:
        with conn.cursor() as c:
            c.execute(
                """
                SELECT COUNT(*)
                FROM mcts_realization r
                JOIN mcts_position p ON p.id = r.position_id
                WHERE p.stem = %s AND p.turn = %s AND r.status = 'complete'
                """,
                (stem, turn),
            )
            return c.fetchone()[0] >= threshold


def main() -> None:
    """Smoke / probe: pick N and print, no actual collection."""
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", default=10, type=int)
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--turn-margin", default=20, type=int)
    args = ap.parse_args()

    conn = connect()
    sampler = StratifiedSampler.from_postgres(
        conn, turn_margin=args.turn_margin, rng=random.Random(args.seed),
    )
    print(f"=== {len(sampler.decades())} active decades:")
    print(f"  {sampler.decades()}")
    picks = sampler.pick_n(args.n)
    print(f"\n=== {len(picks)} picks ===")
    for sgf, turn in picks:
        print(f"  decade={sgf.decade}  {Path(sgf.path).name}  turn={turn}  "
              f"(n_moves={sgf.n_moves})")
    conn.close()


if __name__ == "__main__":
    main()
