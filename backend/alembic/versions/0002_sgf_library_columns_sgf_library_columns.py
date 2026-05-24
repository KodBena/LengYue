"""sgf_library_columns

Revision ID: 0002_sgf_library_columns
Revises: 0001_baseline
Create Date: 2026-05-24 14:43:34.915163

Extends ``game_source`` from a card-mint side-effect table into a
first-class games-library store. Adds six columns + eight compound
indexes:

Columns
-------
- ``created_at`` (``DateTime(timezone=True)``) — row creation
  timestamp. ``server_default=func.now()`` so the upgrade's
  ``op.add_column`` emits a DEFAULT clause that backfills existing
  rows at ADD COLUMN time. (SQLite accepts ``CURRENT_TIMESTAMP``
  as a constant default on ADD COLUMN — the ``func.now()`` →
  ``CURRENT_TIMESTAMP`` compilation that SQLAlchemy emits for
  SQLite lands on the permitted form. Postgres ADD COLUMN with
  ``DEFAULT NOW()`` is a fast catalog-only operation on Postgres
  11+.)
- ``date`` (``String``, nullable) — SGF ``DT`` property.
- ``result`` (``String``, nullable) — SGF ``RE`` property.
- ``ruleset`` (``String``, nullable) — SGF ``RU`` property.
- ``board_size`` (``Integer``, nullable) — SGF ``SZ`` property.
- ``metadata_extra`` (``JSON``, nullable) — forward-compat lever
  absorbing every SGF property not lifted into a typed column
  (KM, HA, EV, RO, etc.) plus the SPA's ``imported_via``
  provenance stamp.

Indexes (all compound, all on ``game_source``)
----------------------------------------------
Every library-list query filters on ``user_id`` (tenancy) and
sorts on one of the typed metadata columns. ``(user_id, sort_col,
id)`` covering indexes let the planner walk the order without
sorting; the ``id`` tail breaks ties in the same direction as the
primary sort so the result is deterministic.

Bootstrap interaction
---------------------
``db.alembic_bootstrap.REVISION_MARKERS`` gains a
``("game_source", "created_at", "0002_sgf_library_columns")``
entry. Fresh installs have all library columns via
``metadata.create_all``; the probe matches ``created_at`` and
stamps at this revision, no upgrade needed. Existing v1.0-baseline
installs miss ``created_at``, the probe matches the earlier
``client_game_id`` marker, stamps at ``0001_baseline``, then
``alembic upgrade head`` runs this revision and lands at head.

This revision supersedes the legacy
``scripts/migrate_add_sgf_library_columns.py``, which is removed
in the same commit. The two share intent; the Alembic form is
the post-Alembic-arc canonical mechanism.

License: Public Domain (The Unlicense)
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_sgf_library_columns"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the six SGF-library columns + eight compound indexes."""
    # `created_at` is dialect-split:
    #
    # - SQLite versions older than 3.31.0 reject CURRENT_TIMESTAMP as
    #   an ADD COLUMN default ("Cannot add a column with non-constant
    #   default"). The portable form adds the column nullable + no
    #   default, then explicitly backfills existing rows via UPDATE.
    #   Future INSERTs land via the schema's Python-side `default=`
    #   binding (`db/schema.py` declares it).
    # - Postgres has no such restriction; `DEFAULT NOW()` on ADD
    #   COLUMN is fast (catalog-only on 11+) and populates existing
    #   rows at the ALTER itself.
    bind = op.get_bind()
    dialect_name = bind.dialect.name
    if dialect_name == "sqlite":
        op.add_column(
            "game_source",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )
        op.execute(
            "UPDATE game_source SET created_at = CURRENT_TIMESTAMP "
            "WHERE created_at IS NULL"
        )
    else:
        op.add_column(
            "game_source",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
    op.add_column(
        "game_source",
        sa.Column("date", sa.String(), nullable=True),
    )
    op.add_column(
        "game_source",
        sa.Column("result", sa.String(), nullable=True),
    )
    op.add_column(
        "game_source",
        sa.Column("ruleset", sa.String(), nullable=True),
    )
    op.add_column(
        "game_source",
        sa.Column("board_size", sa.Integer(), nullable=True),
    )
    op.add_column(
        "game_source",
        sa.Column("metadata_extra", sa.JSON(), nullable=True),
    )

    # Compound covering indexes: (user_id, sort_col, id) for every
    # column the library list view sorts by. The first one supports
    # the per-user dedup probe in `_import_one`.
    op.create_index(
        "ix_game_source_user_position",
        "game_source",
        ["user_id", "position_id"],
    )
    op.create_index(
        "ix_game_source_user_created_at_id",
        "game_source",
        ["user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_game_source_user_date_id",
        "game_source",
        ["user_id", "date", "id"],
    )
    op.create_index(
        "ix_game_source_user_player_white_id",
        "game_source",
        ["user_id", "player_white", "id"],
    )
    op.create_index(
        "ix_game_source_user_player_black_id",
        "game_source",
        ["user_id", "player_black", "id"],
    )
    op.create_index(
        "ix_game_source_user_result_id",
        "game_source",
        ["user_id", "result", "id"],
    )
    op.create_index(
        "ix_game_source_user_ruleset_id",
        "game_source",
        ["user_id", "ruleset", "id"],
    )
    op.create_index(
        "ix_game_source_user_board_size_id",
        "game_source",
        ["user_id", "board_size", "id"],
    )


def downgrade() -> None:
    """Drop the eight indexes + six columns, in reverse order."""
    op.drop_index("ix_game_source_user_board_size_id", table_name="game_source")
    op.drop_index("ix_game_source_user_ruleset_id", table_name="game_source")
    op.drop_index("ix_game_source_user_result_id", table_name="game_source")
    op.drop_index("ix_game_source_user_player_black_id", table_name="game_source")
    op.drop_index("ix_game_source_user_player_white_id", table_name="game_source")
    op.drop_index("ix_game_source_user_date_id", table_name="game_source")
    op.drop_index("ix_game_source_user_created_at_id", table_name="game_source")
    op.drop_index("ix_game_source_user_position", table_name="game_source")

    op.drop_column("game_source", "metadata_extra")
    op.drop_column("game_source", "board_size")
    op.drop_column("game_source", "ruleset")
    op.drop_column("game_source", "result")
    op.drop_column("game_source", "date")
    op.drop_column("game_source", "created_at")
