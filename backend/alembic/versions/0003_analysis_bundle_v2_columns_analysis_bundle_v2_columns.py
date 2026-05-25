"""analysis_bundle_v2_columns

Revision ID: 0003_analysis_bundle_v2_columns
Revises: 0002_sgf_library_columns
Create Date: 2026-05-25 22:30:00.000000

Adds two nullable columns to ``analysis_bundles`` for the
cross/analysis-bundle-compression-v2 arc:

Columns
-------
- ``format_descriptor`` (``JSON``, nullable) — opaque-to-backend
  encoding metadata the SPA needs at decode time. v1 rows
  (``scheme`` ∈ {``json``, ``json+gzip``}) leave this NULL — the
  backend itself owns the decode for those schemes and doesn't
  need SPA-side metadata. v2 rows (``scheme`` = ``v2-brotli``)
  populate this with whatever shape the SPA's encoder emits;
  the backend stores it byte-for-byte and returns it byte-for-
  byte on read.

- ``uncompressed_byte_size`` (``Integer``, nullable) — the SPA's
  measurement of the pre-compression byte count, surfaced to the
  user as the "saved X%" figure in the storage panel. v1 rows
  leave this NULL — we have ``byte_size`` for v1 (which IS the
  uncompressed-ish size, modulo gzip) and the storage panel
  computes the savings differently for v1 vs v2. v2 rows
  populate this with the SPA-asserted value.

Both columns are nullable by design — there's no honest backfill
value for existing v1 rows (the design note's "AnalysisBundle
Summary changes" amendment explicitly accepts that legacy v1
bundles surface NULL for these fields and the SPA handles the
absence). New v2 writes populate both.

Bootstrap interaction
---------------------
``db.alembic_bootstrap.REVISION_MARKERS`` declines a probe marker
for this revision — see the comment block there for the rationale
(``analysis_bundles`` is post-baseline; ``metadata.create_all``
populates its columns on pre-v1.0 DBs, making any marker on this
table unreliable). The earlier ``created_at`` marker on
``game_source`` covers the v1.1 install path; the legacy chain's
``client_game_id`` marker covers the pre-v1.0 path. Both paths
stamp at their respective revisions and then ``alembic upgrade
head`` reaches this revision — which finds the columns potentially
already present (added by ``create_all`` during the bootstrap's
own lifespan-time sequencing) and so must be **column-presence-
idempotent**: check for each column before adding.

License: Public Domain (The Unlicense)
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_analysis_bundle_v2_columns"
down_revision: Union[str, Sequence[str], None] = "0002_sgf_library_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_present(table: str, column: str) -> bool:
    """``True`` iff ``column`` already exists on ``table`` in the
    live schema. Used to make ``upgrade()`` column-presence-
    idempotent — required because ``metadata.create_all`` runs
    before this revision in the lifespan's bootstrap path on fresh
    and pre-v1.0 installs."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    """Add the two nullable v2 columns to ``analysis_bundles``,
    skipping any column ``metadata.create_all`` has already
    populated."""
    if not _column_present("analysis_bundles", "format_descriptor"):
        op.add_column(
            "analysis_bundles",
            sa.Column("format_descriptor", sa.JSON(), nullable=True),
        )
    if not _column_present("analysis_bundles", "uncompressed_byte_size"):
        op.add_column(
            "analysis_bundles",
            sa.Column("uncompressed_byte_size", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    """Drop both columns in reverse order."""
    op.drop_column("analysis_bundles", "uncompressed_byte_size")
    op.drop_column("analysis_bundles", "format_descriptor")
