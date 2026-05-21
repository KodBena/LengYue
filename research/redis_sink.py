"""
research/redis_sink.py

Durable per-packet sink for KataGo trajectory collection. Per the
user's "I no longer trust anything that can be rm'd" directive:
no file-based collection artifacts. Each packet XADD'd to a Redis
Stream atomically on receive.

Robustness semantic: at most the last entry can be bad. XADD is
atomic on the Redis side; if a script crashes after receive but
before XADD, the packet is lost (one). If a script crashes after
XADD, the packet is durably stored. There is no "partial NPZ"
failure mode — there are only fully-written stream entries.

Key schema
══════════
  traj:{stem}:t{turn}:r{realization}    Stream — one entry per packet.
                                          Fields: t (str), msg (pickle bytes).
  meta:{stem}:t{turn}:r{realization}    Hash — completion metadata,
                                          set when realization completes
                                          (status, qid, final_visits, ...).
  positions                              Set — all collected "{stem}:t{turn}"
                                          (i.e. unique (sgf, turn) pairs).
  realizations:{stem}:t{turn}            Set — realization indices completed
                                          for this position.

Persistence note
════════════════
Redis at /home/bork/redis-qeubo/ is RDB-only (appendonly=no, save
900 1 / 300 10 / 60 10000). A Redis crash can lose up to ~15
minutes of work. For longer batches consider `CONFIG SET appendonly
yes`. The file-storage alternative was strictly worse — file writes
only happened at end-of-realization, so a script crash lost the
entire trajectory.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import pickle
import sys
import time
from dataclasses import dataclass
from typing import Any, Iterator

import redis


# ── Connection ──────────────────────────────────────────────────────────────

_pool: redis.ConnectionPool | None = None


def get_redis() -> redis.Redis:
    """Module-level singleton (decode_responses=False so binary pickle
    blobs round-trip cleanly through stream values)."""
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool(
            host="127.0.0.1", port=6379, db=0, decode_responses=False,
        )
    return redis.Redis(connection_pool=_pool)


# ── Key schema ──────────────────────────────────────────────────────────────

def traj_key(stem: str, turn: int, realization: int) -> str:
    return f"traj:{stem}:t{turn}:r{realization}"


def meta_key(stem: str, turn: int, realization: int) -> str:
    return f"meta:{stem}:t{turn}:r{realization}"


def position_id(stem: str, turn: int) -> str:
    return f"{stem}:t{turn}"


# ── Writer ──────────────────────────────────────────────────────────────────

@dataclass
class StreamWriter:
    """One-realization-of-one-position append-only writer."""

    stem: str
    turn: int
    realization: int
    r: redis.Redis

    def __post_init__(self) -> None:
        self.tkey = traj_key(self.stem, self.turn, self.realization)
        self.mkey = meta_key(self.stem, self.turn, self.realization)

    def reset(self) -> None:
        """Idempotent start: delete any existing partial / prior data
        for this (stem, turn, realization) slot so the stream is
        fresh. Called before the first XADD of a new collection run."""
        self.r.delete(self.tkey)
        self.r.delete(self.mkey)

    def append(self, t: float, packet: dict[str, Any]) -> None:
        """XADD a single packet. Pickle for the binary value."""
        blob = pickle.dumps(packet, protocol=pickle.HIGHEST_PROTOCOL)
        self.r.xadd(
            self.tkey,
            {"t": f"{t:.6f}", "msg": blob},
            id="*",
        )

    def mark_complete(
        self,
        *,
        status: str,
        qid: str,
        model: str,
        komi: float,
        board_size: int,
        rules: str,
        final_visits: int,
        max_visits: int,
        report_every: float,
        n_packets: int,
        elapsed_s: float,
        error: str = "",
    ) -> None:
        """Set the completion-metadata hash and register the
        realization in the position-level index. After this, downstream
        readers can find this realization via the indexes."""
        self.r.hset(self.mkey, mapping={
            "status": status,
            "qid": qid,
            "model": model,
            "komi": str(komi),
            "board_size": str(board_size),
            "rules": rules,
            "final_visits": str(final_visits),
            "max_visits": str(max_visits),
            "report_every": str(report_every),
            "n_packets": str(n_packets),
            "elapsed_s": f"{elapsed_s:.3f}",
            "completed_at": f"{time.time():.3f}",
            "error": error,
        })
        pid = position_id(self.stem, self.turn)
        self.r.sadd("positions", pid)
        self.r.sadd(f"realizations:{pid}", str(self.realization))


# ── Reader ──────────────────────────────────────────────────────────────────

def list_positions(r: redis.Redis | None = None) -> list[tuple[str, int]]:
    """Returns sorted list of (stem, turn) pairs that have any
    completed realization."""
    r = r or get_redis()
    raw = r.smembers("positions")
    out: list[tuple[str, int]] = []
    for b in raw:
        s = b.decode() if isinstance(b, bytes) else b
        if ":t" not in s:
            continue
        stem, t_str = s.rsplit(":t", 1)
        try:
            out.append((stem, int(t_str)))
        except ValueError:
            continue
    return sorted(out)


def list_realizations(stem: str, turn: int, r: redis.Redis | None = None) -> list[int]:
    """Returns sorted list of realization indices completed for the
    given (stem, turn)."""
    r = r or get_redis()
    raw = r.smembers(f"realizations:{position_id(stem, turn)}")
    return sorted(int(b.decode() if isinstance(b, bytes) else b) for b in raw)


def read_packets(
    stem: str,
    turn: int,
    realization: int,
    r: redis.Redis | None = None,
) -> list[tuple[float, dict[str, Any]]]:
    """Read the full ordered packet trajectory for one realization.
    Returns [(t, packet_dict), ...]. Empty list if the stream is
    missing or empty.

    Per the "at most last entry bad" semantic: a malformed pickle
    blob causes that one entry to be skipped with a stderr warning;
    the rest of the trajectory is still returned."""
    r = r or get_redis()
    raw = r.xrange(traj_key(stem, turn, realization), "-", "+")
    out: list[tuple[float, dict[str, Any]]] = []
    for entry_id, fields in raw:
        try:
            t = float(fields[b"t"])
            msg = pickle.loads(fields[b"msg"])
            out.append((t, msg))
        except Exception as e:
            print(f"  WARN: skipping malformed stream entry "
                  f"{entry_id!r}: {e}", file=sys.stderr)
    return out


def read_meta(
    stem: str,
    turn: int,
    realization: int,
    r: redis.Redis | None = None,
) -> dict[str, str]:
    """Returns the completion-metadata hash decoded to str. Empty if
    realization was never marked complete (i.e. partial / crashed
    during collection)."""
    r = r or get_redis()
    raw = r.hgetall(meta_key(stem, turn, realization))
    return {
        (k.decode() if isinstance(k, bytes) else k):
        (v.decode() if isinstance(v, bytes) else v)
        for k, v in raw.items()
    }


def iter_complete_realizations(
    r: redis.Redis | None = None,
) -> Iterator[tuple[str, int, int]]:
    """Yields (stem, turn, realization) tuples for every completed
    realization. Useful for downstream batch processors."""
    r = r or get_redis()
    for stem, turn in list_positions(r):
        for r_idx in list_realizations(stem, turn, r):
            yield stem, turn, r_idx


# ── Adapter to legacy "flat dict" packet view ────────────────────────────────

def realization_as_flat_arrays(
    stem: str, turn: int, realization: int,
    top_k: int = 12,
    r: redis.Redis | None = None,
) -> dict[str, Any] | None:
    """Compatibility shim for code that expects the old NPZ shape
    (numpy arrays keyed by `t`, `visits`, `winrate`, `scoreLead`,
    `scoreStdev`, `isDuringSearch`, `miVisits`). Returns None if no
    packets are available.

    Note: code that needs full lossless access should call
    read_packets() directly and work with the dict stream."""
    import numpy as np
    packets = read_packets(stem, turn, realization, r=r)
    if not packets:
        return None
    ts, visits, wr, sl, ss, ids = [], [], [], [], [], []
    miVisits = []
    for t, msg in packets:
        root = msg.get("rootInfo") or {}
        ts.append(t)
        visits.append(int(root.get("visits", 0)))
        wr.append(float(root.get("winrate", 0.0)))
        sl.append(float(root.get("scoreLead", 0.0)))
        ss.append(float(root.get("scoreStdev", 0.0)))
        ids.append(bool(msg.get("isDuringSearch", False)))
        mi = msg.get("moveInfos") or []
        row = [int(m.get("visits", 0)) for m in mi[:top_k]]
        row.extend([0] * (top_k - len(row)))
        miVisits.append(row)
    return {
        "t": np.array(ts, dtype=np.float32),
        "visits": np.array(visits, dtype=np.int32),
        "winrate": np.array(wr, dtype=np.float32),
        "scoreLead": np.array(sl, dtype=np.float32),
        "scoreStdev": np.array(ss, dtype=np.float32),
        "isDuringSearch": np.array(ids, dtype=np.bool_),
        "miVisits": np.array(miVisits, dtype=np.int32),
    }


if __name__ == "__main__":
    # Smoke test: ping and report.
    r = get_redis()
    r.ping()
    print(f"redis OK; dbsize={r.dbsize()}")
    positions = list_positions(r)
    print(f"positions registered: {len(positions)}")
    for stem, turn in positions[:5]:
        reals = list_realizations(stem, turn, r)
        print(f"  {stem}:t{turn} → realizations {reals}")
