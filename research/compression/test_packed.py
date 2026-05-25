"""
research/compression/test_packed.py

Unit tests for the schema-aware packed format. Two kinds of cases:

1. Synthetic-packet roundtrip — exercises specific edge cases the
   corpus may not cover (high turn numbers, deep PV lists, the
   FK_TAGGED fallback, missing optional fields, unknown fields).

2. Corpus roundtrip — encode/decode every packet in the redis
   collection and assert dict-`==` equality. The bench harness does
   this implicitly, but having it here means the test passes / fails
   from a single `python -m research.compression.test_packed` invocation
   without needing redis to be in a specific state.

Run with:
  /home/bork/w/vdc/venvs/kataproxy/bin/python -m research.compression.test_packed

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import sys
from typing import Any

from .packed import (
    PackedLossless,
    PackedGzipLossless,
    PackedZstdLossless,
    PackedBrotliLossless,
)


def _roundtrip(packet: dict[str, Any]) -> None:
    """Round-trip a single packet through every Packed* variant
    and assert dict-`==` equality. Each variant gets a fresh
    instance to ensure no per-instance state leaks across cases."""
    for cls in (
        PackedLossless,
        PackedGzipLossless,
        PackedZstdLossless,
        PackedBrotliLossless,
    ):
        c = cls()
        blob = c.encode(packet)
        decoded = c.decode(blob)
        assert decoded == packet, (
            f"{c.name}: roundtrip mismatch\n"
            f"  original keys: {sorted(packet.keys())}\n"
            f"  decoded keys:  {sorted(decoded.keys())}\n"
            f"  first divergence: "
            f"{[k for k in packet if packet.get(k) != decoded.get(k)][:3]}"
        )


def _synthesise_packet(
    *,
    turn_number: int,
    n_move_infos: int,
    pv_len: int,
    state_max_turn: int,
) -> dict[str, Any]:
    """Build a synthetic packet exercising the magnitudes flagged
    in the move-number-safety requirement. `state_max_turn` lets
    `extra.state` keys range from "0" to f"{state_max_turn}" so we
    catch any byte-width assumption in the FK_TAGGED key-table path
    on large stringified turn indices."""
    move_infos: list[dict[str, Any]] = []
    for i in range(n_move_infos):
        move_infos.append({
            "move": f"Q{(i % 19) + 1}",
            "visits": 200 + i,
            "order": i,
            "winrate": 0.5 + 0.001 * i,
            "scoreLead": -0.5 + 0.01 * i,
            "scoreMean": -0.5,
            "scoreSelfplay": 0.0,
            "scoreStdev": 1.2,
            "utility": 0.0,
            "utilityLcb": -0.1,
            "lcb": 0.4,
            "prior": 0.05,
            "weight": 1.0,
            "edgeVisits": 150 + i,
            "edgeWeight": 1.0,
            "playSelectionValue": 0.1,
            "pv": [f"P{j + 1}" for j in range(pv_len)],
            "pvVisits": [10 + j for j in range(pv_len)],
            "pvEdgeVisits": [8 + j for j in range(pv_len)],
        })
    state = {
        str(t): {
            "Complexity": 0.1 + 0.001 * t,
            "Win Probability": 0.5,
            "Score Advantage": -1.0,
        }
        for t in range(state_max_turn + 1)
    }
    return {
        "id": f"synth-t{turn_number}",
        "isDuringSearch": False,
        "turnNumber": turn_number,
        "moveInfos": move_infos,
        "rootInfo": {
            "currentPlayer": "B",
            "visits": 200,
            "weight": 1.0,
            "winrate": 0.5,
            "scoreLead": -0.5,
            "scoreSelfplay": 0.0,
            "scoreStdev": 1.0,
            "utility": 0.0,
            "rawLead": -0.5,
            "rawNoResultProb": 0.0,
            "rawScoreSelfplay": 0.0,
            "rawScoreSelfplayStdev": 1.0,
            "rawStScoreError": 0.5,
            "rawStWrError": 0.1,
            "rawVarTimeLeft": 0.0,
            "rawWinrate": 0.5,
            "symHash": "DEADBEEF" * 4,
            "thisHash": "CAFEBABE" * 4,
        },
        "ownership": [0.5] * 361,
        "policy": [0.001] * 362,
        "extra": {
            "state": state,
            "black": {"triangular": [], "deltas": {}, "cwt": {}},
            "white": {"triangular": [], "deltas": {}, "cwt": {}},
        },
        "userMoveInfo": None,
    }


def test_synthetic_baseline() -> None:
    """A modest packet exercising every schema branch."""
    _roundtrip(_synthesise_packet(
        turn_number=50,
        n_move_infos=20,
        pv_len=10,
        state_max_turn=50,
    ))
    print("  test_synthetic_baseline: OK")


def test_high_turn_number_1024() -> None:
    """The case the user flagged. Move-number well past any single-byte
    width assumption — turnNumber=1024 forces varint expansion past
    1 byte at every length / index / count site."""
    _roundtrip(_synthesise_packet(
        turn_number=1024,
        n_move_infos=362,  # max possible for 19x19
        pv_len=150,        # deep PV
        state_max_turn=1024,
    ))
    print("  test_high_turn_number_1024: OK")


def test_pathological_magnitudes() -> None:
    """A packet whose magnitudes exceed any single-byte field width
    by a comfortable margin. Confirms the varint paths handle
    20+ bit integers without truncation."""
    _roundtrip(_synthesise_packet(
        turn_number=1_000_000,
        n_move_infos=362,
        pv_len=500,
        state_max_turn=2048,
    ))
    print("  test_pathological_magnitudes: OK")


def test_optional_fields_absent() -> None:
    """A packet missing every optional field (ownership / policy /
    extra / userMoveInfo). Confirms the presence-bitmap correctly
    omits values and the decoder produces a dict without those keys."""
    packet = {
        "id": "minimal",
        "isDuringSearch": False,
        "turnNumber": 5,
        "moveInfos": [],
        "rootInfo": {
            "currentPlayer": "W",
            "visits": 100,
            "weight": 1.0,
            "winrate": 0.5,
            "scoreLead": 0.0,
            "scoreSelfplay": 0.0,
            "scoreStdev": 1.0,
            "utility": 0.0,
            "rawLead": 0.0,
            "rawNoResultProb": 0.0,
            "rawScoreSelfplay": 0.0,
            "rawScoreSelfplayStdev": 1.0,
            "rawStScoreError": 0.5,
            "rawStWrError": 0.1,
            "rawVarTimeLeft": 0.0,
            "rawWinrate": 0.5,
            "symHash": "0",
            "thisHash": "0",
        },
    }
    _roundtrip(packet)
    print("  test_optional_fields_absent: OK")


def test_unknown_field_passthrough() -> None:
    """A future-KataGo packet with an unknown field at root and
    inside a moveInfo. The unknown-tail path should preserve both
    losslessly via the per-blob key table."""
    p = _synthesise_packet(
        turn_number=10, n_move_infos=3, pv_len=2, state_max_turn=10,
    )
    p["somethingNew"] = {"nested": [1, 2, 3], "more": "text"}
    p["moveInfos"][0]["futureField"] = 42
    _roundtrip(p)
    print("  test_unknown_field_passthrough: OK")


def test_corpus_roundtrip() -> None:
    """Walk every packet in the redis collection corpus
    (127.0.0.1:6380) through PackedLossless and assert dict-`==`
    equality. Skipped (with a message) if redis is unreachable."""
    try:
        import pickle
        import redis
        r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
        r.ping()
    except Exception as e:
        print(f"  test_corpus_roundtrip: SKIPPED (redis unreachable: {e})")
        return

    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    if not keys:
        print("  test_corpus_roundtrip: SKIPPED (corpus empty)")
        return

    c = PackedLossless()
    n = 0
    for k in keys:
        for _id, fields in r.xrange(k, "-", "+"):
            packet = pickle.loads(fields[b"msg"])
            decoded = c.decode(c.encode(packet))
            assert decoded == packet, f"corpus packet {k} round-trip mismatch"
            n += 1
    print(f"  test_corpus_roundtrip: OK ({n} packets)")


def main() -> int:
    print("running schema-aware Packed roundtrip tests:")
    test_synthetic_baseline()
    test_high_turn_number_1024()
    test_pathological_magnitudes()
    test_optional_fields_absent()
    test_unknown_field_passthrough()
    test_corpus_roundtrip()
    print("all tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
