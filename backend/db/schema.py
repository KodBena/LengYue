"""
db/schema.py

SQLAlchemy table definitions for the spaced-repetition core.

Tenancy: tables split between tenant-scoped (`card`, `card_source`,
`card_tag`, `game_source`, `documents`) and intentionally global
(`users`, `normalized_position`, `tag`). Tenant-scoped tables carry a
non-null `user_id` foreign key; reads are filtered on it via the
WHERE-clause-fusion pattern that gives the codebase its 404-not-403
invariant. Per-table comments below name which side each table sits
on and why; the system-level model is documented in
`docs/notes/tenancy.md`.

License: Public Domain (The Unlicense)
"""
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    MetaData,
    String,
    Table,
    Uuid,
    func,
)

metadata = MetaData()

# Dialect-agnostic BigInt for Auto-Incrementing Primary Keys
BigIntAuto = BigInteger().with_variant(Integer, "sqlite")

# 1. Users
users = Table(
    "users", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String(64), nullable=False, unique=True),
    Column("bcrypt_hash", String, nullable=True),
    Column("has_password", Boolean, default=False)
)

# 2. Normalized Positions
#
# Item 34a (generic-naming pass): columns renamed to be domain-agnostic.
#   pos_hash       -> content_hash
#   normalized_sgf -> canonical_content
# The column names now match the NormalizedPosition DTO field names
# (domain/normalizer.py), eliminating the adapter-boundary translation
# that item 30b introduced. Existing installs must run
# scripts/migrate_34a_rename_columns.py before pulling this schema.
#
# This table is intentionally global, not per-tenant. Two users uploading
# the same SGF resolve to the same normalized_position row (content-
# addressed via content_hash). Tenant data is at the card layer above;
# this layer is dedup-shared.
normalized_position = Table(
    "normalized_position", metadata,
    Column("id", BigIntAuto, primary_key=True, autoincrement=True),
    Column("content_hash", LargeBinary, nullable=False, unique=True, index=True),
    Column("canonical_content", String, nullable=False)
)

# 3. Game Sources
#
# Tenant-scoped. The description, player names, and raw_content
# originate with a specific user's upload, even when two users happen
# to upload the same content (they each get their own game_source
# row, while sharing the underlying normalized_position row). See
# docs/notes/tenancy.md for the system-level tenancy model.
#
# Item 24 (tenancy): user_id added. The column has a default=1 so the
# migration can backfill existing rows to local_user without running
# an UPDATE; new rows inserted by CardService.insert_game_source
# explicitly supply user_id from the tenant context.
#
# Existing installs must run scripts/migrate_24_add_user_id_to_game_source.py
# before pulling this schema.
#
# Note on filter coverage: existing read paths reach game_source via
# card_source ⋈ card joins (stats, lineage), which already filter on
# card.user_id post-items-15/16. game_source.user_id is therefore
# defense-in-depth — used today by writes (insert_game_source stamps
# the column from the caller's user_id), available tomorrow for any
# direct game_source query that doesn't go through the card chain.
#
# Game-source dedup: client_game_id added — an opaque,
# client-managed UUID stamped at board-creation time on the frontend
# and sent on every mint from that board's lifetime. The partial
# unique index `uniq_game_source_user_client_game_id` (declared just
# below the table) collapses repeated mints from one board into a
# single game_source row via the get-or-create path in
# repositories.card_repository.get_or_create_game_source_by_client_id.
# The column is nullable so legacy callers (and any pre-rollout
# frontend traffic) keep the always-create behavior; the partial
# predicate keeps the unique constraint inert for those rows. See
# docs/dispatch/backend-to-frontend-game-source-dedup-status.md for
# the dedup contract.
#
# Existing installs must run
# scripts/migrate_add_client_game_id_to_game_source.py before
# pulling this schema.
game_source = Table(
    "game_source", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("position_id", BigInteger, ForeignKey("normalized_position.id")),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False, default=1),
    Column("player_white", String, nullable=True),
    Column("player_black", String, nullable=True),
    Column("raw_content", String, nullable=True),
    Column("description", String, nullable=True),
    Column("client_game_id", Uuid, nullable=True)
)

# Game-source dedup: partial unique index on (user_id, client_game_id) where
# client_game_id is set. Both SQLite (3.8.0+) and Postgres support
# the WHERE-bounded unique index. The partial predicate is the
# load-bearing detail: legacy rows with NULL client_game_id remain
# isolated, and the index provides database-level honesty (concurrent
# inserts sharing a (user_id, client_game_id) key serialize correctly
# rather than racing through the SELECT-then-INSERT window).
Index(
    "uniq_game_source_user_client_game_id",
    game_source.c.user_id,
    game_source.c.client_game_id,
    unique=True,
    sqlite_where=game_source.c.client_game_id.isnot(None),
    postgresql_where=game_source.c.client_game_id.isnot(None),
)

# 4. Cards
card = Table(
    "card", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("num_moves", Integer, nullable=False),
    Column("alpha", Float, nullable=False),
    Column("beta", Float, nullable=False),
    Column("t", Float, nullable=False),
    Column("last_reviewed_at", DateTime(timezone=True), nullable=True),
    Column("num_reviews", Integer, default=0),
    Column("suspended", Boolean, default=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False, default=1),
    Column("creation_date", DateTime(timezone=True), server_default=func.now()),
    Column("grading_parameter", JSON, nullable=True),
    Column("normalized_position_id", BigInteger, ForeignKey("normalized_position.id"))
)

# 5. Card Source
card_source = Table(
    "card_source", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("card_id", Integer, ForeignKey("card.id", ondelete="CASCADE"), unique=True, nullable=False),
    Column("card_source_id", Integer, ForeignKey("card.id", ondelete="SET NULL"), nullable=True),
    Column("game_source_id", Integer, ForeignKey("game_source.id", ondelete="SET NULL"), nullable=True),
    Column("is_primary_source", Boolean, default=False, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    CheckConstraint(
        "(card_source_id IS NOT NULL AND game_source_id IS NULL) OR "
        "(card_source_id IS NULL AND game_source_id IS NOT NULL)",
        name="check_one_source"
    )
)

# Item 21b: explicit index on card_source.card_source_id.
# Every recursive lineage CTE in tree_engine.{build_selection_cte,fetch_lineage}
# joins card_source to itself on `card_source.card_source_id = base.card_id`.
# Without this index the join scans the full table per recursion step. SQLite
# tolerates it on hobby-scale data; Postgres at scale won't.
Index("ix_card_source_parent", card_source.c.card_source_id)

# 6. Tags
#
# Intentionally global, not per-tenant. Tag NAMES like "joseki" or
# "endgame" mean the same thing across users; what's tenant-specific
# is which cards a user has tagged, which lives in card_tag (with the
# tenancy enforced via the card_id FK to card.user_id). Tag *usage
# statistics* surfaced by StatsRepository.get_tag_usage are filtered
# through the caller's cards, so each user sees counts that reflect
# only their own card collection. See docs/notes/tenancy.md.
tag = Table(
    "tag", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String, nullable=False, unique=True),
    Column("num_observations", Integer, default=0),
    Column("sigma_last_updated", DateTime(timezone=True), nullable=True)
)

# 7. Card-Tag Association
card_tag = Table(
    "card_tag", metadata,
    Column("card_id", Integer, ForeignKey("card.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True)
)

# Item 21b: explicit index on card_tag.tag_id.
# tag_id is the second column of the composite PK, so the implicit PK index
# does not serve reverse lookups (tag → cards) — used by the tag DSL filter
# subquery in domain/tag_dsl.TagDSLCompiler._conjunction_to_sql.
Index("ix_card_tag_tag_id", card_tag.c.tag_id)

# 8. Documents (Frontend UI State & Settings)
#
# Tenant-scoped via composite primary key. The frontend's per-user
# workspace state (board sets, palettes, registry overrides, etc.)
# lives here keyed by (key, user_id) so two users can independently
# store data under the same key without collision. See
# docs/notes/tenancy.md.
#
# Item 23 (tenancy): composite primary key (key, user_id). Without
# this, the first user to write a key would lock all others out of
# it.
#
# The frontend's existing key naming convention (e.g.,
# "user_workspace_settings") becomes redundant under tenancy but
# isn't actively harmful — those keys just become per-user, with
# the `user_workspace_` prefix as a no-op string on each row. A
# future cleanup can strip the prefix; not part of this migration.
#
# Existing installs must run scripts/migrate_23_add_user_id_to_documents.py
# before pulling this schema. The migration backfills existing rows
# to user_id=1 (local_user from ALLOW_PASSWORDLESS_LOGIN).
documents = Table(
    "documents", metadata,
    Column("key", String, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True, default=1),
    Column("data", JSON, nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
)

# 9. Analysis Bundles (cross/analysis-persistence arc)
#
# Tenant-scoped via composite primary key. One row per (user_id,
# board_id) — the user's "save analyses for this board" lifecycle
# anchor. The board is the unit; replacing a row replaces the whole
# bundle (the frontend's "Save analyses" action is full-bundle).
#
# `payload` is opaque bytes from the database's perspective. The
# adapter (repositories/analysis_bundle_repository.py) holds the
# codec dispatch table that translates between the request bundle's
# canonical-JSON wire shape and whatever `scheme` the operator
# configured for writes. Existing rows with older schemes remain
# readable indefinitely — the dispatch table only grows. See the
# wire-shape and codec-envelope rationale in
# docs/dispatch/backend-to-frontend-analysis-persistence-status.md.
#
# Tenancy: the composite PK `(user_id, board_id)` is the
# database-level isolation enforcement. Two users with the same
# RFC4122 v4 UUID (astronomically unlikely; the frontend's
# precursor migration 24 → 25 ensures BoardId is RFC4122 v4) get
# distinct rows. Read paths in the adapter fuse `user_id` into
# every WHERE clause, preserving the codebase's 404-not-403
# invariant.
#
# `record_count` and `byte_size` are denormalized for cheap
# per-user storage reporting (`GET /analysis-bundles` sums them
# without needing to decode the payloads) and for the per-user
# quota check inside the upsert transaction. `byte_size` is the
# post-transcoding size — the same number `GET /analysis-bundles`
# returns as `stored_byte_size` per bundle, so the frontend's
# storage panel and the backend's quota check operate on the
# same value (per Confirmation C3 in the dispatch).
#
# Existing installs must run
# scripts/migrate_create_analysis_bundles.py before pulling this
# schema. Fresh installs pick up the table via metadata.create_all.
analysis_bundles = Table(
    "analysis_bundles", metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True, default=1),
    Column("board_id", Uuid, primary_key=True),
    Column("scheme", String, nullable=False),
    Column("payload", LargeBinary, nullable=False),
    Column("record_count", Integer, nullable=False),
    Column("byte_size", Integer, nullable=False),
    Column(
        "updated_at",
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    ),
)
