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
# Item 24 (tenancy): user_id added. Game sources are tenant-scoped —
# the description, player names, and raw_content originate with a
# specific user's upload, even when two users happen to upload the
# same content (they each get their own game_source row, while
# sharing the underlying normalized_position row).
#
# The column has a default=1 so the migration can backfill existing
# rows to local_user without running an UPDATE; new rows inserted by
# CardService.insert_game_source explicitly supply user_id from the
# tenant context.
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
game_source = Table(
    "game_source", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("position_id", BigInteger, ForeignKey("normalized_position.id")),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False, default=1),
    Column("player_white", String, nullable=True),
    Column("player_black", String, nullable=True),
    Column("raw_content", String, nullable=True),
    Column("description", String, nullable=True)
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
# Tags are intentionally global, not per-tenant. Tag NAMES like "joseki"
# or "endgame" mean the same thing across users; what's tenant-specific
# is which cards a user has tagged, which lives in card_tag (with the
# tenancy enforced via the card_id FK to card.user_id).
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
# Item 23 (tenancy): composite primary key (key, user_id). Two users
# can independently store documents under the same key — each gets
# their own row. Without this, the first user to write a key would
# lock all others out of it.
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
