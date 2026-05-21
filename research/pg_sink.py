"""
research/pg_sink.py

Postgres-backed durable per-packet sink for KataGo trajectory
collection. Pivot from `redis_sink.py`: Postgres at
192.168.122.1/research, no working-set RAM ceiling, AOF-equivalent
durability via Postgres WAL.

Robustness semantic: same as redis_sink — at most the last entry can
be bad. Each packet INSERT is autocommit=True so a process crash
mid-realization preserves every packet committed prior to the crash.
The crashed realization is left at `status='in_flight'` so downstream
readers can either skip or resume.

Schema (created idempotently on first use)
══════════════════════════════════════════
  mcts_sgf           One row per SGF file in the corpus. Populated
                       by a one-time scanner (research/sgf_index.py)
                       and used by the stratified sampler. Static
                       index, not collection state.
  mcts_position      One row per (sgf, turn) pair we have collected
                       any data for. Inserted lazily.
  mcts_realization   One row per realization. Inserted at start with
                       status='in_flight'; updated to 'complete' /
                       'timeout' / 'engine_error' / 'incomplete' on
                       termination.
  mcts_packet        One row per KataGo response packet. Append-only.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import os
import pickle
import sys
import time
from dataclasses import dataclass
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row


DEFAULT_DSN = os.environ.get(
    "RESEARCH_PG_DSN",
    "host=192.168.122.1 dbname=research",
)


# ── Connection ──────────────────────────────────────────────────────────────

def connect(autocommit: bool = True) -> psycopg.Connection:
    """Returns a fresh Postgres connection.

    Default autocommit=True so every INSERT durably commits.
    Long-running collectors should hold the connection open; per-call
    helpers below take the conn as a parameter."""
    return psycopg.connect(DEFAULT_DSN, autocommit=autocommit)


# ── Schema ──────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS mcts_sgf (
    path            TEXT PRIMARY KEY,
    stem            TEXT NOT NULL,
    decade          INTEGER NOT NULL,
    year            INTEGER,
    n_moves         INTEGER NOT NULL,
    n_valid_turns   INTEGER NOT NULL,
    komi            REAL,
    board_size      INTEGER,
    rules           TEXT,
    scanned_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE mcts_sgf
    ADD COLUMN IF NOT EXISTS poison_reason TEXT,
    ADD COLUMN IF NOT EXISTS poisoned_at   TIMESTAMP;
CREATE INDEX IF NOT EXISTS mcts_sgf_decade ON mcts_sgf(decade);
CREATE INDEX IF NOT EXISTS mcts_sgf_stem ON mcts_sgf(stem);
CREATE INDEX IF NOT EXISTS mcts_sgf_poison_reason ON mcts_sgf(poison_reason);

CREATE TABLE IF NOT EXISTS mcts_position (
    id              BIGSERIAL PRIMARY KEY,
    sgf_path        TEXT NOT NULL,
    stem            TEXT NOT NULL,
    turn            INTEGER NOT NULL,
    decade          INTEGER,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (stem, turn)
);
CREATE INDEX IF NOT EXISTS mcts_position_decade ON mcts_position(decade);

CREATE TABLE IF NOT EXISTS mcts_realization (
    id              BIGSERIAL PRIMARY KEY,
    position_id     BIGINT NOT NULL REFERENCES mcts_position(id) ON DELETE CASCADE,
    realization_idx INTEGER NOT NULL,
    qid             TEXT,
    model           TEXT NOT NULL,
    max_visits      INTEGER NOT NULL,
    report_every    REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'in_flight',
    final_visits    INTEGER,
    n_packets       INTEGER,
    elapsed_s       REAL,
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    error           TEXT,
    UNIQUE (position_id, realization_idx)
);
CREATE INDEX IF NOT EXISTS mcts_realization_status ON mcts_realization(status);
CREATE INDEX IF NOT EXISTS mcts_realization_position ON mcts_realization(position_id);

CREATE TABLE IF NOT EXISTS mcts_packet (
    realization_id   BIGINT NOT NULL REFERENCES mcts_realization(id) ON DELETE CASCADE,
    seq              INTEGER NOT NULL,
    t                REAL NOT NULL,
    visits           INTEGER NOT NULL,
    is_during_search BOOLEAN NOT NULL,
    msg              BYTEA NOT NULL,
    msg_thin         BYTEA,
    PRIMARY KEY (realization_id, seq)
);
-- msg_thin: small projected pickle carrying only the rootInfo + moveInfos
-- fields the stability extractors consume; drops ownership maps and full
-- policy arrays. Nullable for back-compat with rows written before the
-- column existed; backfill is one-time, then forward writes always set it.
"""


def ensure_schema(conn: psycopg.Connection) -> None:
    """Idempotent schema creation. Safe to call on every script start.

    The msg_thin column on mcts_packet was added 2026-05-22; the ADD
    COLUMN IF NOT EXISTS keeps the call idempotent against older DBs
    that have the table but lack the column."""
    with conn.cursor() as c:
        c.execute(_SCHEMA_SQL)
        c.execute("ALTER TABLE mcts_packet ADD COLUMN IF NOT EXISTS msg_thin BYTEA")


# ── Position / realization lifecycle ────────────────────────────────────────

def ensure_position(
    conn: psycopg.Connection,
    *,
    sgf_path: str,
    stem: str,
    turn: int,
    decade: int | None = None,
) -> int:
    """Upsert a position row by (stem, turn). Returns position_id."""
    with conn.cursor() as c:
        c.execute(
            """
            INSERT INTO mcts_position (sgf_path, stem, turn, decade)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (stem, turn) DO UPDATE
                SET sgf_path = EXCLUDED.sgf_path,
                    decade = COALESCE(EXCLUDED.decade, mcts_position.decade)
            RETURNING id
            """,
            (sgf_path, stem, turn, decade),
        )
        return c.fetchone()[0]


def next_realization_idx(conn: psycopg.Connection, position_id: int) -> int:
    """Returns the next unused realization index for this position.
    Concurrent collectors should not call this in parallel — protect
    with row-level locking if you do."""
    with conn.cursor() as c:
        c.execute(
            "SELECT COALESCE(MAX(realization_idx), -1) + 1 "
            "FROM mcts_realization WHERE position_id = %s",
            (position_id,),
        )
        return c.fetchone()[0]


def start_realization(
    conn: psycopg.Connection,
    *,
    position_id: int,
    realization_idx: int,
    qid: str,
    model: str,
    max_visits: int,
    report_every: float,
) -> int:
    """Insert an in_flight realization row, return its id."""
    with conn.cursor() as c:
        c.execute(
            """
            INSERT INTO mcts_realization
                (position_id, realization_idx, qid, model, max_visits,
                 report_every, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'in_flight')
            ON CONFLICT (position_id, realization_idx) DO UPDATE
                SET qid = EXCLUDED.qid,
                    model = EXCLUDED.model,
                    max_visits = EXCLUDED.max_visits,
                    report_every = EXCLUDED.report_every,
                    status = 'in_flight',
                    started_at = NOW(),
                    completed_at = NULL,
                    final_visits = NULL,
                    n_packets = NULL,
                    elapsed_s = NULL,
                    error = NULL
            RETURNING id
            """,
            (position_id, realization_idx, qid, model, max_visits, report_every),
        )
        return c.fetchone()[0]


def reset_packets(conn: psycopg.Connection, realization_id: int) -> None:
    """Wipe any packets from a prior (failed) collection of this same
    realization slot. Called at start_realization-time so an in-flight
    rerun begins from a clean slate."""
    with conn.cursor() as c:
        c.execute("DELETE FROM mcts_packet WHERE realization_id = %s", (realization_id,))


# ── Per-packet writer ───────────────────────────────────────────────────────

def project_thin(packet: dict[str, Any]) -> dict[str, Any]:
    """Project a lossless KataGo response down to the small subset of
    fields consumed by stability extractors in
    `stability_trajectory.py`. Drops ownership maps (361 floats), full
    policy arrays (362 floats), and other heavy fields no extractor
    reads.

    Carried fields:
      - rootInfo.{scoreLead, winrate, visits}
      - moveInfos[*].{move, visits, prior}   (full length, NOT truncated;
        search_agrees_with_policy and top1_in_top3 scan all entries)

    Adding a new extractor that needs a field not listed here means
    extending this projection AND re-running the backfill against
    existing rows (or falling back to the lossless `msg` column)."""
    root = packet.get("rootInfo") or {}
    mi = packet.get("moveInfos") or []
    thin_mi = [
        {
            "move": m.get("move"),
            "visits": m.get("visits"),
            "prior": m.get("prior"),
        }
        for m in mi
    ]
    return {
        "rootInfo": {
            "scoreLead": root.get("scoreLead"),
            "winrate": root.get("winrate"),
            "visits": root.get("visits"),
        },
        "moveInfos": thin_mi,
    }


@dataclass
class StreamWriter:
    """One-realization-of-one-position append-only writer. Each
    append() is a single autocommit INSERT — durable on return."""

    conn: psycopg.Connection
    realization_id: int
    _seq: int = 0

    def append(self, t: float, packet: dict[str, Any]) -> None:
        root = packet.get("rootInfo") or {}
        visits = int(root.get("visits", 0))
        ids = bool(packet.get("isDuringSearch", False))
        blob = pickle.dumps(packet, protocol=pickle.HIGHEST_PROTOCOL)
        thin_blob = pickle.dumps(
            project_thin(packet), protocol=pickle.HIGHEST_PROTOCOL,
        )
        with self.conn.cursor() as c:
            c.execute(
                "INSERT INTO mcts_packet (realization_id, seq, t, visits, "
                "is_during_search, msg, msg_thin) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (self.realization_id, self._seq, t, visits, ids, blob, thin_blob),
            )
        self._seq += 1


def mark_sgf_poison(
    conn: psycopg.Connection,
    sgf_path: str,
    reason: str,
) -> None:
    """Mark an SGF as poisoned (engine validation rejects it). The
    sampler filters out poison SGFs so they're never picked again.
    Idempotent — first poison marker sticks; subsequent calls are
    no-ops to preserve the original reason."""
    with conn.cursor() as c:
        c.execute(
            """
            UPDATE mcts_sgf
            SET poison_reason = %s, poisoned_at = NOW()
            WHERE path = %s AND poison_reason IS NULL
            """,
            (reason, sgf_path),
        )


def mark_realization(
    conn: psycopg.Connection,
    *,
    realization_id: int,
    status: str,
    final_visits: int,
    n_packets: int,
    elapsed_s: float,
    error: str = "",
) -> None:
    """Update terminal state on the realization row."""
    with conn.cursor() as c:
        c.execute(
            """
            UPDATE mcts_realization
            SET status = %s,
                final_visits = %s,
                n_packets = %s,
                elapsed_s = %s,
                completed_at = NOW(),
                error = %s
            WHERE id = %s
            """,
            (status, final_visits, n_packets, elapsed_s, error, realization_id),
        )


# ── Readers ─────────────────────────────────────────────────────────────────

def list_positions(conn: psycopg.Connection) -> list[tuple[str, int]]:
    """Returns sorted (stem, turn) list for positions with at least
    one completed realization."""
    with conn.cursor() as c:
        c.execute(
            """
            SELECT DISTINCT p.stem, p.turn
            FROM mcts_position p
            JOIN mcts_realization r ON r.position_id = p.id
            WHERE r.status = 'complete'
            ORDER BY p.stem, p.turn
            """
        )
        return [(row[0], row[1]) for row in c.fetchall()]


def list_realizations(
    conn: psycopg.Connection,
    stem: str,
    turn: int,
    only_complete: bool = True,
) -> list[int]:
    """Returns sorted realization_idx list for (stem, turn)."""
    with conn.cursor() as c:
        if only_complete:
            c.execute(
                """
                SELECT r.realization_idx
                FROM mcts_realization r
                JOIN mcts_position p ON p.id = r.position_id
                WHERE p.stem = %s AND p.turn = %s AND r.status = 'complete'
                ORDER BY r.realization_idx
                """,
                (stem, turn),
            )
        else:
            c.execute(
                """
                SELECT r.realization_idx
                FROM mcts_realization r
                JOIN mcts_position p ON p.id = r.position_id
                WHERE p.stem = %s AND p.turn = %s
                ORDER BY r.realization_idx
                """,
                (stem, turn),
            )
        return [row[0] for row in c.fetchall()]


def read_realization_meta(
    conn: psycopg.Connection, stem: str, turn: int, realization_idx: int
) -> dict[str, Any] | None:
    """Returns the full realization row as a dict, or None."""
    with conn.cursor(row_factory=dict_row) as c:
        c.execute(
            """
            SELECT r.*
            FROM mcts_realization r
            JOIN mcts_position p ON p.id = r.position_id
            WHERE p.stem = %s AND p.turn = %s AND r.realization_idx = %s
            """,
            (stem, turn, realization_idx),
        )
        return c.fetchone()


def read_packets(
    conn: psycopg.Connection, stem: str, turn: int, realization_idx: int
) -> list[tuple[float, dict[str, Any]]]:
    """Returns ordered [(t, packet_dict), ...] for the realization.
    Skips entries that fail pickle.loads (the "at most last entry bad"
    semantic). Returns empty if the realization is absent or has zero
    packets."""
    with conn.cursor() as c:
        c.execute(
            """
            SELECT pk.t, pk.msg
            FROM mcts_packet pk
            JOIN mcts_realization r ON r.id = pk.realization_id
            JOIN mcts_position p ON p.id = r.position_id
            WHERE p.stem = %s AND p.turn = %s AND r.realization_idx = %s
            ORDER BY pk.seq
            """,
            (stem, turn, realization_idx),
        )
        out: list[tuple[float, dict[str, Any]]] = []
        for t, blob in c.fetchall():
            try:
                out.append((float(t), pickle.loads(blob)))
            except Exception as e:
                print(f"  WARN: skipping malformed packet: {e}", file=sys.stderr)
        return out


def iter_complete_realizations(
    conn: psycopg.Connection,
) -> Iterator[tuple[str, int, int]]:
    """Yields (stem, turn, realization_idx) for every completed
    realization. Useful for downstream batch processors."""
    with conn.cursor() as c:
        c.execute(
            """
            SELECT p.stem, p.turn, r.realization_idx
            FROM mcts_realization r
            JOIN mcts_position p ON p.id = r.position_id
            WHERE r.status = 'complete'
            ORDER BY p.stem, p.turn, r.realization_idx
            """
        )
        for row in c.fetchall():
            yield row[0], row[1], row[2]


def fetch_position_bundle(
    conn: psycopg.Connection,
    stem: str,
    turn: int,
    top_k: int = 12,
) -> dict[int, dict[str, Any]] | None:
    """Single-round-trip bundled fetch: returns all realizations' flat
    arrays for one (stem, turn) in ONE Postgres query, keyed by
    realization_idx.

    Equivalent to calling `realization_as_flat_arrays()` once per
    realization, but ~10× faster across the 192.168.122.1 network
    latency. Each per-position load takes 1 round-trip instead of
    (1 + n_realizations) round-trips. See
    `feedback_pg_fetch_per_position_bundle` memory for context.

    Returns None if the position has no completed realizations."""
    import numpy as np
    with conn.cursor() as c:
        c.execute(
            """
            SELECT r.realization_idx, pk.t, pk.msg
            FROM mcts_realization r
            JOIN mcts_position p ON p.id = r.position_id
            JOIN mcts_packet pk ON pk.realization_id = r.id
            WHERE p.stem = %s AND p.turn = %s AND r.status = 'complete'
            ORDER BY r.realization_idx, pk.seq
            """,
            (stem, turn),
        )
        rows = c.fetchall()
    if not rows:
        return None
    # Group by realization_idx, decoding pickle in-stream.
    per_real: dict[int, list[tuple[float, dict]]] = {}
    for ri, t, blob in rows:
        try:
            pkt = pickle.loads(blob)
        except Exception as e:
            print(f"  WARN: skipping malformed packet for "
                  f"{stem}:t{turn}:r{ri}: {e}", file=sys.stderr)
            continue
        per_real.setdefault(int(ri), []).append((float(t), pkt))
    out: dict[int, dict[str, Any]] = {}
    for ri, packets in per_real.items():
        if not packets:
            continue
        ts, visits, wr, sl, ss, ids = [], [], [], [], [], []
        miVisits: list[list[int]] = []
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
        out[ri] = {
            "t": np.array(ts, dtype=np.float32),
            "visits": np.array(visits, dtype=np.int32),
            "winrate": np.array(wr, dtype=np.float32),
            "scoreLead": np.array(sl, dtype=np.float32),
            "scoreStdev": np.array(ss, dtype=np.float32),
            "isDuringSearch": np.array(ids, dtype=np.bool_),
            "miVisits": np.array(miVisits, dtype=np.int32),
        }
    return out


def fetch_positions_bundle_lossless_batch(
    conn: psycopg.Connection,
    keys: list[tuple[str, int]],
) -> dict[tuple[str, int], dict[int, list[tuple[float, dict[str, Any]]]]]:
    """Bulk cross-position lossless fetch: returns the FULL packet
    streams for a BATCH of (stem, turn) pairs in a single Postgres
    round-trip. Result is keyed by (stem, turn) → realization_idx →
    list[(t, packet_dict)].

    Equivalent to calling `fetch_position_bundle_lossless` once per
    position but pays the query-planning + per-query latency once for
    the whole batch.

    Batch size guidance: 5-10 positions per call returns ~10-100 MB of
    packet data (10 realizations × ~200 packets × ~5 KB per packet ≈
    10 MB per position). Larger batches exceed reasonable Python
    memory; smaller batches don't amortize the round-trip cost. The
    caller is responsible for chunking inputs.

    See `feedback_pg_fetch_per_position_bundle` memory for the
    per-position bundling motivation; this primitive extends the
    optimization across positions.
    """
    if not keys:
        return {}
    from psycopg import sql
    # Build a VALUES clause with literal stem/turn pairs.
    # `psycopg.sql.Literal` safely quotes both strings and integers.
    values_sql = sql.SQL(", ").join(
        sql.SQL("({}, {})").format(sql.Literal(s), sql.Literal(int(t)))
        for s, t in keys
    )
    query = sql.SQL("""
        WITH wanted(stem, turn) AS (VALUES {values})
        SELECT p.stem, p.turn, r.realization_idx, pk.t, pk.msg
        FROM wanted w
        JOIN mcts_position p ON p.stem = w.stem AND p.turn = w.turn
        JOIN mcts_realization r ON r.position_id = p.id
        JOIN mcts_packet pk ON pk.realization_id = r.id
        WHERE r.status = 'complete'
        ORDER BY p.stem, p.turn, r.realization_idx, pk.seq
    """).format(values=values_sql)
    with conn.cursor() as c:
        c.execute(query)
        rows = c.fetchall()
    out: dict[tuple[str, int], dict[int, list[tuple[float, dict]]]] = {}
    for stem, turn, ri, t, blob in rows:
        try:
            pkt = pickle.loads(blob)
        except Exception as e:
            print(f"  WARN: skipping malformed packet for "
                  f"{stem}:t{turn}:r{ri}: {e}", file=sys.stderr)
            continue
        key = (str(stem), int(turn))
        out.setdefault(key, {}).setdefault(int(ri), []).append((float(t), pkt))
    return out


def fetch_positions_bundle_thin_batch(
    conn: psycopg.Connection,
    keys: list[tuple[str, int]],
) -> dict[tuple[str, int], dict[int, list[tuple[float, dict[str, Any]]]]]:
    """Bulk cross-position THIN-projection fetch. Same shape as
    `fetch_positions_bundle_lossless_batch` (returns {(stem, turn) →
    realization_idx → list[(t, packet_dict)]}), but reads the
    `msg_thin` BYTEA column populated by `project_thin` at write time.

    The thin payload is ~14× smaller than the lossless `msg` (~350 B vs
    ~5 KB) and `pickle.loads`-es ~10× faster because the heavy float
    lists (ownership map, full policy array) are absent. This is the
    hot-path fetch for the stability allocator's Phase A.

    Rows whose `msg_thin` is NULL (pre-backfill) are skipped silently;
    a startup audit in the caller should confirm coverage before
    relying on this path.

    See `project_thin` for the field-set carried by the thin pickle.
    """
    if not keys:
        return {}
    from psycopg import sql
    values_sql = sql.SQL(", ").join(
        sql.SQL("({}, {})").format(sql.Literal(s), sql.Literal(int(t)))
        for s, t in keys
    )
    query = sql.SQL("""
        WITH wanted(stem, turn) AS (VALUES {values})
        SELECT p.stem, p.turn, r.realization_idx, pk.t, pk.msg_thin
        FROM wanted w
        JOIN mcts_position p ON p.stem = w.stem AND p.turn = w.turn
        JOIN mcts_realization r ON r.position_id = p.id
        JOIN mcts_packet pk ON pk.realization_id = r.id
        WHERE r.status = 'complete' AND pk.msg_thin IS NOT NULL
        ORDER BY p.stem, p.turn, r.realization_idx, pk.seq
    """).format(values=values_sql)
    with conn.cursor() as c:
        c.execute(query)
        rows = c.fetchall()
    out: dict[tuple[str, int], dict[int, list[tuple[float, dict]]]] = {}
    for stem, turn, ri, t, blob in rows:
        try:
            pkt = pickle.loads(blob)
        except Exception as e:
            print(f"  WARN: skipping malformed thin packet for "
                  f"{stem}:t{turn}:r{ri}: {e}", file=sys.stderr)
            continue
        key = (str(stem), int(turn))
        out.setdefault(key, {}).setdefault(int(ri), []).append((float(t), pkt))
    return out


def count_thin_coverage(conn: psycopg.Connection) -> tuple[int, int]:
    """Diagnostic: returns (n_thin_populated, n_total) over mcts_packet.
    Used by callers before relying on the thin-path fetch to confirm
    the backfill has completed."""
    with conn.cursor() as c:
        c.execute(
            "SELECT count(*) FILTER (WHERE msg_thin IS NOT NULL), count(*) "
            "FROM mcts_packet"
        )
        row = c.fetchone()
    return int(row[0]), int(row[1])


def fetch_position_bundle_lossless(
    conn: psycopg.Connection,
    stem: str,
    turn: int,
) -> dict[int, list[tuple[float, dict[str, Any]]]] | None:
    """Single-round-trip bundled fetch returning the FULL lossless
    per-realization packet dict streams (with ownership maps, full
    policy, etc.), keyed by realization_idx.

    Equivalent to calling `read_packets()` once per realization but
    in one query. Use this when downstream needs ownership / full
    policy / top-K moveInfo arrays."""
    with conn.cursor() as c:
        c.execute(
            """
            SELECT r.realization_idx, pk.t, pk.msg
            FROM mcts_realization r
            JOIN mcts_position p ON p.id = r.position_id
            JOIN mcts_packet pk ON pk.realization_id = r.id
            WHERE p.stem = %s AND p.turn = %s AND r.status = 'complete'
            ORDER BY r.realization_idx, pk.seq
            """,
            (stem, turn),
        )
        rows = c.fetchall()
    if not rows:
        return None
    out: dict[int, list[tuple[float, dict]]] = {}
    for ri, t, blob in rows:
        try:
            pkt = pickle.loads(blob)
        except Exception as e:
            print(f"  WARN: skipping malformed packet for "
                  f"{stem}:t{turn}:r{ri}: {e}", file=sys.stderr)
            continue
        out.setdefault(int(ri), []).append((float(t), pkt))
    return out


def realization_as_flat_arrays(
    conn: psycopg.Connection,
    stem: str,
    turn: int,
    realization_idx: int,
    top_k: int = 12,
) -> dict[str, Any] | None:
    """Compatibility shim: read a realization's packets and return
    the legacy "flat numpy arrays" shape used by fit_hyperbolic.py /
    summarize_batch.py. Code that needs the full lossless dict
    stream should call read_packets() directly.

    NOTE: for multi-realization loads, prefer `fetch_position_bundle()`
    which does the same work in one round-trip instead of N."""
    import numpy as np
    packets = read_packets(conn, stem, turn, realization_idx)
    if not packets:
        return None
    ts, visits, wr, sl, ss, ids = [], [], [], [], [], []
    miVisits: list[list[int]] = []
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


# ── Smoke test ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    conn = connect()
    ensure_schema(conn)
    with conn.cursor() as c:
        c.execute("SELECT count(*) FROM mcts_sgf")
        n_sgf = c.fetchone()[0]
        c.execute("SELECT count(*) FROM mcts_position")
        n_pos = c.fetchone()[0]
        c.execute("SELECT count(*) FROM mcts_realization")
        n_real = c.fetchone()[0]
        c.execute("SELECT count(*), pg_size_pretty(pg_total_relation_size('mcts_packet')) "
                  "FROM mcts_packet")
        n_pkt, sz = c.fetchone()
    print(f"schema OK. mcts_sgf={n_sgf} mcts_position={n_pos} "
          f"mcts_realization={n_real} mcts_packet={n_pkt} ({sz})")
    conn.close()
