"""
research/backfill_msg_thin.py

One-time backfill: for every mcts_packet row whose msg_thin IS NULL,
decode the lossless `msg`, project the small subset of fields the
stability extractors consume (via `pg_sink.project_thin`), pickle the
projection, and UPDATE the row's msg_thin column.

Restartable: the SELECT filters on msg_thin IS NULL, so a kill mid-run
leaves the remaining rows pending. Re-launching picks up where it left
off without duplicating work.

Parallelism: uses multiprocessing.Pool with N workers, each owning its
own Postgres connection. Each worker SELECTs its batch with `FOR UPDATE
SKIP LOCKED` so concurrent workers naturally claim disjoint batches.

Progress: every batch, prints elapsed / processed / ETA per the
long-running-script feedback convention.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import pickle
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pg_sink  # noqa: E402


# Per-worker Postgres connection.
_WORKER_CONN = None  # type: ignore[var-annotated]
_BATCH_SIZE = 500
_SENTINEL_EMPTY = pickle.dumps({}, protocol=pickle.HIGHEST_PROTOCOL)


def _worker_init() -> None:
    global _WORKER_CONN
    _WORKER_CONN = pg_sink.connect(autocommit=False)


def _process_one_batch(_dummy: int) -> tuple[int, int]:
    """Claim a batch via SELECT ... FOR UPDATE SKIP LOCKED, project, and
    UPDATE. Commits the transaction. Returns (n_processed, n_malformed)."""
    conn = _WORKER_CONN
    if conn is None:
        conn = pg_sink.connect(autocommit=False)
    with conn.cursor() as c:
        c.execute(
            """
            SELECT realization_id, seq, msg
            FROM mcts_packet
            WHERE msg_thin IS NULL
            LIMIT %s
            FOR UPDATE SKIP LOCKED
            """,
            (_BATCH_SIZE,),
        )
        rows = c.fetchall()
    if not rows:
        conn.commit()
        return (0, 0)
    updates: list[tuple[bytes, int, int]] = []
    n_malformed = 0
    for rid, seq, blob in rows:
        try:
            pkt = pickle.loads(blob)
        except Exception:
            # Mark malformed rows with a sentinel so they don't get
            # re-selected next batch. Loss is acceptable — those rows
            # would be skipped by the fetch path anyway.
            updates.append((_SENTINEL_EMPTY, rid, seq))
            n_malformed += 1
            continue
        try:
            thin = pickle.dumps(
                pg_sink.project_thin(pkt), protocol=pickle.HIGHEST_PROTOCOL,
            )
        except Exception:
            updates.append((_SENTINEL_EMPTY, rid, seq))
            n_malformed += 1
            continue
        updates.append((thin, rid, seq))
    with conn.cursor() as c:
        c.executemany(
            "UPDATE mcts_packet SET msg_thin = %s "
            "WHERE realization_id = %s AND seq = %s",
            updates,
        )
    conn.commit()
    return (len(rows), n_malformed)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workers", type=int, default=4,
                    help="Parallel worker processes (each opens its own "
                         "Postgres connection). Default 4.")
    ap.add_argument("--batch-size", type=int, default=500,
                    help="Rows per worker-claimed batch. Default 500.")
    ap.add_argument("--max-batches", type=int, default=None,
                    help="Stop after this many batches (for testing). "
                         "Default: run to completion.")
    args = ap.parse_args()

    global _BATCH_SIZE
    _BATCH_SIZE = args.batch_size

    # Audit baseline.
    audit_conn = pg_sink.connect()
    n_thin0, n_total = pg_sink.count_thin_coverage(audit_conn)
    n_pending = n_total - n_thin0
    print(f"=== backfill msg_thin ===", flush=True)
    print(f"  baseline: {n_thin0}/{n_total} populated  "
          f"({n_pending} pending)", flush=True)
    print(f"  workers={args.workers}  batch_size={args.batch_size}", flush=True)
    audit_conn.close()
    if n_pending == 0:
        print("  nothing to do; coverage already 100%", flush=True)
        return

    t0 = time.monotonic()
    n_done = 0
    n_malformed_total = 0
    n_batches = 0
    audit_every = max(1, n_pending // (args.batch_size * 25))

    # Drive workers until a batch returns empty (no rows left to claim).
    # We submit batches in waves of `workers * 4` so the pool stays busy
    # while the audit cadence below is reasonably frequent.
    with mp.Pool(processes=args.workers, initializer=_worker_init) as pool:
        idle = False
        while not idle:
            wave = list(pool.imap_unordered(
                _process_one_batch, range(args.workers * 4),
            ))
            n_done_wave = sum(n for n, _ in wave)
            n_mal_wave = sum(m for _, m in wave)
            n_done += n_done_wave
            n_malformed_total += n_mal_wave
            n_batches += len(wave)
            if n_done_wave == 0:
                idle = True
            if (n_batches % audit_every == 0) or idle:
                dt = time.monotonic() - t0
                rate = n_done / max(dt, 1e-9)
                eta = (n_pending - n_done) / max(rate, 1e-9)
                print(f"  batches={n_batches} processed={n_done}/{n_pending} "
                      f"malformed={n_malformed_total} "
                      f"rate={rate:.0f} rows/s  elapsed={dt:.0f}s eta={eta:.0f}s",
                      flush=True)
            if args.max_batches is not None and n_batches >= args.max_batches:
                break

    # Final audit.
    audit_conn = pg_sink.connect()
    n_thin1, _ = pg_sink.count_thin_coverage(audit_conn)
    audit_conn.close()
    print(f"\n=== done ===", flush=True)
    print(f"  populated: {n_thin0} → {n_thin1} (+{n_thin1 - n_thin0})", flush=True)
    print(f"  malformed: {n_malformed_total}", flush=True)
    print(f"  total elapsed: {time.monotonic() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
