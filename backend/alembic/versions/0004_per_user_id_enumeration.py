"""per_user_id_enumeration

Revision ID: 0004_per_user_id_enumeration
Revises: 0003_analysis_bundle_v2_columns
Create Date: 2026-08-06 00:00:00.000000

Per-user display enumeration + non-leak guarantee for card and
game_source ids. Design:
``.claude/dispatch-reports/per-user-id-enumeration-design.md``.

Columns
-------
- ``card.display_ordinal`` (``Integer``, NOT NULL after backfill) —
  the per-user, gaps-on-delete display ordinal (Decision 2).
- ``card.public_id`` (``Uuid``, NOT NULL UNIQUE after backfill) —
  the reference-role opaque handle, ``card``'s sibling of
  ``game_source.client_game_id`` (Decision 3).
- ``game_source.display_ordinal`` (``Integer``, NOT NULL after
  backfill) — same display-role field for game sources.
- ``game_source.client_game_id`` becomes NOT NULL — closing the
  "may be None for legacy rows" exception (Decision 4's disposition
  table). Every historical NULL is backfilled with a freshly minted
  UUID; the column already existed (nullable) as of revision
  ``0001_baseline``.

New table
---------
- ``user_display_counters`` — declared in ``db/schema.py``, created
  by ``metadata.create_all`` on every install (fresh or upgrading)
  before this revision runs, since it's a brand-new table (same
  bootstrap-ordering reasoning ``0003``'s docstring gives for
  ``analysis_bundles``' new columns — except here the whole TABLE is
  new, so ``create_all`` handles it unconditionally and this
  revision only needs to *seed* rows, not create the table).

Backfill order
--------------
1. Add the three new columns nullable (large-table-safe: no
   default-computed rewrite lock).
2. Backfill ``card.public_id`` and any NULL ``game_source.
   client_game_id`` — one fresh UUID per row. Done in Python (not
   portable SQL) because neither SQLite nor Postgres has a
   dependency-free portable "generate a UUID per row" SQL
   expression; acceptable at the hobby/thousands-of-rows scale this
   codebase targets (see the design's "Large-table note").
3. Backfill ``display_ordinal`` on both tables via a per-user
   ``ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY <col>, id)``
   window function — portable across SQLite ≥3.25 and Postgres.
   ``card`` orders by ``creation_date, id``; ``game_source`` orders
   by ``created_at, id`` — ``id`` as tiebreak, never primary sort
   key, so two rows created in the same instant still get a
   deterministic order.
4. Seed ``user_display_counters`` from the post-backfill MAX(
   display_ordinal) per user, for every user who owns at least one
   card or game_source row.
5. Set the three columns NOT NULL; add the ``uniq_card_user_
   display_ordinal`` / ``uniq_game_source_user_display_ordinal``
   unique indexes (declared in ``db/schema.py`` — fresh installs get
   them via ``create_all``; this revision adds them for upgrading
   installs) and the ``card.public_id`` unique index.

Idempotency: every ``add_column`` / ``create_index`` call is guarded
by a presence check, following ``0003``'s pattern — a fresh install's
``metadata.create_all`` already creates these columns/indexes with
the live schema shape (this revision's *end state*), so ``upgrade()``
must tolerate running against a DB that already has them.

License: Public Domain (The Unlicense)
"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_per_user_id_enumeration"
down_revision: Union[str, Sequence[str], None] = "0003_analysis_bundle_v2_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_present(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def _index_present(table: str, index_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return any(ix["name"] == index_name for ix in insp.get_indexes(table))


def _is_not_null(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for c in insp.get_columns(table):
        if c["name"] == column:
            return not c["nullable"]
    return False


def upgrade() -> None:
    bind = op.get_bind()

    # ─── Step 1: additive nullable columns ─────────────────────────
    if not _column_present("card", "display_ordinal"):
        op.add_column("card", sa.Column("display_ordinal", sa.Integer(), nullable=True))
    if not _column_present("card", "public_id"):
        op.add_column("card", sa.Column("public_id", sa.Uuid(), nullable=True))
    if not _column_present("game_source", "display_ordinal"):
        op.add_column("game_source", sa.Column("display_ordinal", sa.Integer(), nullable=True))

    # ─── Step 2: per-row UUID backfill ──────────────────────────────
    # card.public_id: every row that doesn't have one yet.
    missing_public_id = bind.execute(
        text("SELECT id FROM card WHERE public_id IS NULL")
    ).fetchall()
    for (card_id,) in missing_public_id:
        bind.execute(
            text("UPDATE card SET public_id = :pid WHERE id = :cid"),
            {"pid": str(uuid4()), "cid": card_id},
        )

    # game_source.client_game_id: close the legacy-None exception.
    # The column already exists (nullable) as of 0001_baseline.
    if not _is_not_null("game_source", "client_game_id"):
        missing_client_id = bind.execute(
            text("SELECT id FROM game_source WHERE client_game_id IS NULL")
        ).fetchall()
        for (gs_id,) in missing_client_id:
            bind.execute(
                text("UPDATE game_source SET client_game_id = :cgid WHERE id = :gid"),
                {"cgid": str(uuid4()), "gid": gs_id},
            )

    # ─── Step 3: per-user display_ordinal backfill (window function) ──
    # `id` is the tiebreak, never the primary sort key, so two rows
    # created in the same instant still get a deterministic order.
    # Portable across SQLite >=3.25 and Postgres (both already assumed
    # live minimums per card_repository.py's RETURNING note).
    bind.execute(text("""
        UPDATE card
        SET display_ordinal = ranked.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY user_id ORDER BY creation_date, id
            ) AS rn
            FROM card
            WHERE display_ordinal IS NULL
        ) AS ranked
        WHERE card.id = ranked.id
    """)) if bind.dialect.name != "sqlite" else bind.execute(text("""
        UPDATE card
        SET display_ordinal = (
            SELECT rn FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY user_id ORDER BY creation_date, id
                ) AS rn
                FROM card
            ) AS ranked
            WHERE ranked.id = card.id
        )
        WHERE display_ordinal IS NULL
    """))

    bind.execute(text("""
        UPDATE game_source
        SET display_ordinal = ranked.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY user_id ORDER BY created_at, id
            ) AS rn
            FROM game_source
            WHERE display_ordinal IS NULL
        ) AS ranked
        WHERE game_source.id = ranked.id
    """)) if bind.dialect.name != "sqlite" else bind.execute(text("""
        UPDATE game_source
        SET display_ordinal = (
            SELECT rn FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY user_id ORDER BY created_at, id
                ) AS rn
                FROM game_source
            ) AS ranked
            WHERE ranked.id = game_source.id
        )
        WHERE display_ordinal IS NULL
    """))

    # ─── Step 4: seed user_display_counters ─────────────────────────
    # `next_x_ordinal` holds "the highest ordinal already assigned" —
    # `next_card_display_ordinal` increments-then-returns, so the
    # first mint after seeding gets MAX+1, correctly continuing the
    # sequence rather than restarting it.
    card_max = dict(bind.execute(
        text("SELECT user_id, MAX(display_ordinal) FROM card GROUP BY user_id")
    ).fetchall())
    game_max = dict(bind.execute(
        text("SELECT user_id, MAX(display_ordinal) FROM game_source GROUP BY user_id")
    ).fetchall())
    all_user_ids = set(card_max) | set(game_max)
    existing_counter_users = {
        row[0] for row in bind.execute(
            text("SELECT user_id FROM user_display_counters")
        ).fetchall()
    }
    for uid in all_user_ids - existing_counter_users:
        bind.execute(
            text(
                "INSERT INTO user_display_counters "
                "(user_id, next_card_ordinal, next_game_ordinal) "
                "VALUES (:uid, :nc, :ng)"
            ),
            {
                "uid": uid,
                "nc": card_max.get(uid, 0) or 0,
                "ng": game_max.get(uid, 0) or 0,
            },
        )

    # ─── Step 5: NOT NULL + unique indexes ───────────────────────────
    if not _is_not_null("card", "display_ordinal"):
        op.alter_column("card", "display_ordinal", nullable=False)
    if not _is_not_null("card", "public_id"):
        op.alter_column("card", "public_id", nullable=False)
    if not _is_not_null("game_source", "display_ordinal"):
        op.alter_column("game_source", "display_ordinal", nullable=False)
    if not _is_not_null("game_source", "client_game_id"):
        op.alter_column("game_source", "client_game_id", nullable=False)

    if not _index_present("card", "uniq_card_user_display_ordinal"):
        op.create_index(
            "uniq_card_user_display_ordinal", "card",
            ["user_id", "display_ordinal"], unique=True,
        )
    if not _index_present("card", "ix_card_public_id"):
        op.create_index("ix_card_public_id", "card", ["public_id"], unique=True)
    if not _index_present("game_source", "uniq_game_source_user_display_ordinal"):
        op.create_index(
            "uniq_game_source_user_display_ordinal", "game_source",
            ["user_id", "display_ordinal"], unique=True,
        )


def downgrade() -> None:
    """
    Additive-only: dropping the two new columns per table and the
    seeded counter rows destroys no data other than the ordinals
    themselves (per the design's Decision 3 test recipe:
    ``alembic upgrade head && downgrade -1 && upgrade head``).
    ``game_source.client_game_id`` reverts to nullable but keeps its
    backfilled values — the pre-existing column's NULLs were
    destructively filled forward; downgrade does not attempt to
    resurrect which rows were originally NULL (there's no honest way
    to know, and no consumer depends on it).
    """
    op.drop_index("uniq_game_source_user_display_ordinal", table_name="game_source")
    op.drop_index("ix_card_public_id", table_name="card")
    op.drop_index("uniq_card_user_display_ordinal", table_name="card")
    op.alter_column("game_source", "client_game_id", nullable=True)
    op.execute(text("DELETE FROM user_display_counters"))
    op.drop_column("game_source", "display_ordinal")
    op.drop_column("card", "public_id")
    op.drop_column("card", "display_ordinal")
