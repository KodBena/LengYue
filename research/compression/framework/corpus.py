"""
research/compression/framework/corpus.py

Corpus loader for the analysis-bundle compression framework.

Loads the 40-game ownership corpus from redis (127.0.0.1:6380,
collected 2026-05-25 by `collect_compression_corpus.py`).
Returns one (T_b, 361) float64 array per game, plus a list of
the games' stem identifiers for downstream reporting.

This is the shared input substrate for every method probe under
this framework. Probe scripts should `from framework import
load_corpus` rather than reimplementing the redis walk.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pickle
from collections import defaultdict

import numpy as np
import redis


OWNERSHIP_CELLS = 361


def load_corpus(
    redis_host: str = "127.0.0.1",
    redis_port: int = 6380,
) -> dict[str, np.ndarray]:
    """Return {stem: (T_b, 361) float64 ownership array}, with
    packets sorted by turn within each bundle.

    Only authoritative packets (`isDuringSearch=False`) with full
    361-cell ownership are included. A bundle with no qualifying
    packets is omitted.
    """
    r = redis.Redis(host=redis_host, port=redis_port, decode_responses=False)
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    by_stem_turn: dict[tuple[str, int], list[float]] = {}
    for k in keys:
        parts = k.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        _, fields = entries[0]
        packet = pickle.loads(fields[b"msg"])
        if packet.get("isDuringSearch"):
            continue
        own = packet.get("ownership")
        if own is None or len(own) != OWNERSHIP_CELLS:
            continue
        by_stem_turn[(stem, turn)] = own

    by_stem: dict[str, list[list[float]]] = defaultdict(list)
    for (stem, _turn), own in sorted(by_stem_turn.items()):
        by_stem[stem].append(own)
    return {
        stem: np.asarray(packs, dtype=np.float64)
        for stem, packs in by_stem.items()
    }
