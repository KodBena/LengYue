"""
Generate a publishable sample database from a personal cards.db.

Reduces a multi-user development database to a single anonymous
`local_user` workspace suitable for shipping as a first-impression
asset alongside the project. The output is the binary committed at
`backend/samples/cards.sample.db`; a `load_sample.py` companion
copies that asset into place when the user opts in.

Steps performed (in order, transactional):

1. PRAGMA foreign_keys = ON so the schema's ON DELETE CASCADE on
   card_source / card_tag fires when cards are pruned.
2. Anonymize `game_source.description` → NULL on every row. The
   only PII concern the project author flagged: pathnames from the
   importing user's filesystem leak into descriptions.
3. Cascade-delete every user EXCEPT the keep-user (default `bork`):
   ordered DELETE on cards / game_source / documents / users
   because the user→data foreign keys are plain (no ON DELETE
   CASCADE on users.id).
4. Delete the existing placeholder `local_user` row (which is what
   the frontend's `ensureAuthenticated` flow auto-provisions on a
   fresh install) so the rename in step 5 can claim that username.
5. Rename `bork` → `local_user`. Also clears `has_password` and
   `bcrypt_hash` on that row so the sample matches the
   passwordless local-install default — the frontend's auto-login
   needs the row to be passwordless to short-circuit registration.
6. VACUUM the database so the on-disk size reflects the pruned
   content rather than the holes left by deletes.

The script refuses to operate on a path that ends in `cards.db` to
guard against accidental in-place mutation of a live database.
Always run on a copy.

Idempotency
-----------
- Step 2 is idempotent (UPDATE → NULL is a no-op the second time).
- Step 3 is idempotent (no users to delete on the second run).
- Step 4 fails noisily if `local_user` doesn't exist on the second
  run; this is by design — the script doesn't presume to detect
  whether a partial prior run already renamed bork. If you need to
  re-run after a partial run, start from a fresh copy of the source.

Usage
-----
    python scripts/make_sample_db.py <source.db> <output.sample.db>

    # Optional flags:
    #   --keep-user <username>   default: bork
    #   --target-username <name> default: local_user

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path


LIVE_DB_FILENAME = "cards.db"


def _refuse_live_db(path: Path) -> None:
    if path.name == LIVE_DB_FILENAME:
        raise SystemExit(
            f"refusing to operate on a path named {LIVE_DB_FILENAME!r}; "
            f"copy your live database to a different name first and "
            f"point this script at the copy"
        )


def _resolve_user_id(conn: sqlite3.Connection, username: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    return row[0] if row else None


def _list_other_user_ids(conn: sqlite3.Connection, keep_id: int) -> list[int]:
    rows = conn.execute(
        "SELECT id, username FROM users WHERE id <> ? ORDER BY id", (keep_id,)
    ).fetchall()
    return [row[0] for row in rows]


def _cascade_delete_user(conn: sqlite3.Connection, user_id: int) -> None:
    """Delete a user and all tenant-scoped data they own.

    The schema's user→data foreign keys are plain (no ON DELETE
    CASCADE), so the deletes happen in explicit order:

      cards (cascades to card_source / card_tag via ON DELETE CASCADE)
      game_source (cascades SET NULL on dangling card_source.game_source_id)
      documents (composite PK includes user_id; rows are pruned directly)
      users (the row itself)

    PRAGMA foreign_keys = ON is required at the connection level for
    the in-data cascades to fire; the script enables it before
    invoking this function.
    """
    conn.execute("DELETE FROM card WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM game_source WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def make_sample(
    source: Path,
    output: Path,
    keep_user: str,
    target_username: str,
) -> None:
    _refuse_live_db(source)
    _refuse_live_db(output)

    if not source.exists():
        raise SystemExit(f"source database not found: {source}")
    if output.exists():
        raise SystemExit(
            f"output path already exists: {output}; remove it or pick a "
            f"different output name"
        )

    print(f"[make_sample_db] copying {source} → {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)

    with sqlite3.connect(str(output)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")

        keep_id = _resolve_user_id(conn, keep_user)
        if keep_id is None:
            raise SystemExit(
                f"keep-user {keep_user!r} not found in source database; "
                f"check spelling or use --keep-user"
            )
        print(f"[make_sample_db] keeping user {keep_user!r} (id={keep_id})")

        # Step 2 — anonymize game_source.description
        cursor = conn.execute(
            "UPDATE game_source SET description = NULL WHERE description IS NOT NULL"
        )
        print(f"[make_sample_db] anonymized {cursor.rowcount} game_source.description rows")

        # Step 3 — cascade-delete every user except keep_user
        other_ids = _list_other_user_ids(conn, keep_id)
        print(f"[make_sample_db] pruning {len(other_ids)} user(s): ids={other_ids}")
        for uid in other_ids:
            _cascade_delete_user(conn, uid)

        # Step 4+5 — rename keep_user to target_username, clear password
        existing_target_id = _resolve_user_id(conn, target_username)
        if existing_target_id == keep_id:
            print(
                f"[make_sample_db] keep-user already named {target_username!r}; "
                f"skipping rename"
            )
        else:
            if existing_target_id is not None:
                # Should not happen — step 3 should have removed every other
                # user. Refuse to clobber on the off-chance it does.
                raise SystemExit(
                    f"unexpected: target username {target_username!r} still "
                    f"exists at id={existing_target_id} after pruning; refusing "
                    f"to overwrite"
                )
            conn.execute(
                "UPDATE users SET username = ?, has_password = 0, bcrypt_hash = NULL "
                "WHERE id = ?",
                (target_username, keep_id),
            )
            print(
                f"[make_sample_db] renamed {keep_user!r} → {target_username!r} "
                f"(id={keep_id}); cleared password fields"
            )

        conn.commit()

        # Step 6 — VACUUM to reclaim space from the deletes
        print("[make_sample_db] vacuuming…")
        conn.execute("VACUUM")

    size_mb = output.stat().st_size / (1024 * 1024)
    print(f"[make_sample_db] done — {output} is {size_mb:.2f} MB on disk")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("source", type=Path, help="path to the source database (a copy)")
    p.add_argument("output", type=Path, help="path to write the sample database")
    p.add_argument(
        "--keep-user",
        default="bork",
        help="username to keep and rename (default: bork)",
    )
    p.add_argument(
        "--target-username",
        default="local_user",
        help="final username for the kept user (default: local_user)",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    make_sample(
        source=args.source.resolve(),
        output=args.output.resolve(),
        keep_user=args.keep_user,
        target_username=args.target_username,
    )
    sys.exit(0)
