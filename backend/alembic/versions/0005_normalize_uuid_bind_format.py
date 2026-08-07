"""normalize_uuid_bind_format

Revision ID: 0005_normalize_uuid_bind_format
Revises: 0004_per_user_id_enumeration
Create Date: 2026-08-06 21:30:00.000000

Fixes a stored-vs-compared format mismatch that ``0004``'s backfill
introduced for every pre-existing ``card.public_id`` and
``game_source.client_game_id`` row on SQLite installs (live-diagnosed
against the running dev deployment: ledger row 607, the ``${gameSourceId}``
Cards-tab macro's "faceplant", and the sibling Lineage-Explorer-empty
report, ledger row 613, from the same session).

Root cause
----------
``sa.Uuid()`` (declared on both columns in ``db/schema.py``) binds
equality comparisons differently depending on whether the dialect
supports a native UUID type. SQLite doesn't
(``dialect.supports_native_uuid is False``), so SQLAlchemy's bind
processor for this column type formats a Python ``uuid.UUID`` as its
**32-character lowercase hex digest with no dashes**
(``uuid.UUID.hex``) — never the canonical 36-character hyphenated
``str(uuid)`` form. Every ``WHERE card.c.public_id == some_uuid`` or
``WHERE game_source.c.client_game_id == some_uuid`` compiled through
the ORM/Core therefore compares against the dashless form, regardless
of what the caller passed in.

``0004``'s backfill loop (`alembic/versions/0004_per_user_id_
enumeration.py`, the ``card.public_id`` loop at "Step 2" and the
sibling ``game_source.client_game_id`` loop directly below it) writes
each freshly-minted id via raw ``text()`` SQL with a plain
``str(uuid4())`` parameter — canonical, **hyphenated** — bypassing the
column's type-driven bind processor entirely (`text()` binds are
untyped). Every row that revision backfilled therefore persisted the
hyphenated form, while every subsequent typed ORM comparison against
that same column binds the dashless form. The two can never match:
confirmed by direct reproduction against a scratch SQLite DB (a typed
Core ``insert(...).values(pid=uuid4())`` followed by a typed
``WHERE pid == that_same_uuid`` matches; a raw-``text()`` insert of
``str(uuid4())`` followed by the identical typed ``WHERE`` does not).

On the live dev deployment this manifests as `/lineage/tree-by-root`
404ing ("root card ... not found for this user") and
`/lineage/resolve-roots`-derived root lookups silently dropping every
pre-migration card — which is every card belonging to an imported
game older than today's ``0004`` migration, i.e. effectively all of
them. `/forests/query` itself is unaffected (it never filters by
``public_id``), which is why the Cards-tab macro's *preview* and the
pipeline's *card-matching* step both work, but every downstream
tree-fetch (Browse and the deck-pipeline's forest population alike)
fails — the "preview works, execution faceplants" split the maintainer
observed.

Postgres is not affected: ``dialect.supports_native_uuid`` is true
there (via psycopg's native UUID adaptation), so the bind processor
never reformats the value regardless of how it was written — the bug
is a SQLite-only artifact of ``0004``'s raw-``text()`` backfill, so
this revision's data rewrite is skipped entirely on any other dialect.

Fix
---
Re-normalize every already-hyphenated ``card.public_id`` /
``game_source.client_game_id`` value on SQLite to the dashless-hex
form the ORM actually compares against — the same direction ``0004``
should have written in, had it gone through the typed column instead
of a raw ``text()`` bind. Guarded by string length (36 with dashes vs.
32 without) so this is idempotent: a fresh install, or a database
already fully in the dashless form (nothing was ever routed through
``0004``'s raw-text bypass), sees zero rows touched.

No schema shape changes — this is a pure data migration. No
``REVISION_MARKERS`` entry needed (``db/alembic_bootstrap.py``'s
probe keys off column *presence*, not data format).

License: Public Domain (The Unlicense)
"""
from typing import Sequence, Union

from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_normalize_uuid_bind_format"
down_revision: Union[str, Sequence[str], None] = "0004_per_user_id_enumeration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# `sa.Uuid()`'s non-native (SQLite) bind form: 32 lowercase hex chars,
# no dashes. Canonical `str(uuid.uuid4())` is 36 chars (32 hex + 4
# dashes) — `REPLACE(col, '-', '')` converts the latter to the former
# and is a no-op on a value that's already dashless.
_NORMALIZE_SQL = """
    UPDATE {table}
    SET {column} = REPLACE({column}, '-', '')
    WHERE length({column}) = 36
"""


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        # Native-UUID dialects (Postgres) never hit the format
        # mismatch described above; nothing to normalize.
        return
    bind.execute(text(_NORMALIZE_SQL.format(table="card", column="public_id")))
    bind.execute(text(_NORMALIZE_SQL.format(table="game_source", column="client_game_id")))


def downgrade() -> None:
    """
    Not reversible in the meaningful sense: the dashless form is the
    ORM-comparable one on SQLite, so downgrading to re-hyphenate would
    only reintroduce the defect this revision fixes. Per the
    additive-only precedent this revision's own "no schema shape
    change" nature sets, downgrade is a no-op — there is no prior
    *correct* state to restore to.
    """
    pass
