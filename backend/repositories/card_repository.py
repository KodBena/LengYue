import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import (
    card,
    card_source,
    card_tag,
    game_source,
    normalized_position,
    tag,
)
from domain.auth import UserId
from domain.card import Card
from repositories.ports import CardRepositoryPort, CardWriteRepositoryPort

logger = logging.getLogger(__name__)


class CardRepository(CardRepositoryPort, CardWriteRepositoryPort):
    """
    SQLAlchemy adapter satisfying both the read Port (CardRepositoryPort,
    item 21f) and the write Port (CardWriteRepositoryPort, item 30b).

    A single concrete class implementing two Ports is deliberate:
    the two Ports express different *consumer perspectives* on the
    same physical persistence resource (the `card` table and its
    satellites). Splitting into two classes would force an artificial
    split that doesn't match how SQLAlchemy sessions actually work —
    the same session backs both reads and writes, always.

    Consumers see only their Port. ReviewService and the GET /cards/{id}
    route depend on CardRepositoryPort (two methods); CardService
    depends on CardWriteRepositoryPort (five methods). Neither sees
    the other's surface. Interface segregation, preserved.

    The constructor takes only the session. No time_unit, no config
    — item 30a stripped the time-unit scaffolding when the projection
    moved to domain.card.project_card. The repository is a pure
    persistence adapter.

    No method here commits. Transaction boundaries are owned by the
    route (via `async with db.begin():` for writes, implicit autobegin
    for reads). Consumers can batch arbitrary combinations of calls
    into a single transaction.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ---------------------------------------------------------------
    # Read surface — CardRepositoryPort (item 21f, shape from 30a)
    # ---------------------------------------------------------------

    async def get_card_by_id(
        self,
        card_id: int,
        *,
        user_id: UserId,
    ) -> Optional[Card]:
        """
        Fetches a card and its joined fields (canonical content,
        parent id). Returns the domain entity Card, or None if not
        found OR if the card belongs to a different tenant.

        Item 13 (tenancy): the WHERE clause filters on both id and
        user_id. The two predicates are fused — a card "exists for
        this caller" iff both match. The 404-not-403 boundary is
        preserved by collapsing them into a single SQL condition;
        the caller cannot distinguish "no such card" from "not your
        card" from the API surface, which is the correct privacy
        property.

        Item 34a: the schema column is now `canonical_content` (from
        the Go-specific `normalized_sgf`); we alias it back to
        `normalized_sgf` in the SELECT so the Card entity's field
        name is stable during the 34a → 34b transition. Item 34b
        will drop the alias and rename Card's field in lockstep
        with a coordinated frontend change.
        """
        query = (
            select(
                card,
                # Alias the new generic column back to the current
                # Card field name. 34b deletes this alias.
                normalized_position.c.canonical_content,
                card_source.c.card_source_id,  # Parent ID for the frontend tree
            )
            .join(normalized_position, card.c.normalized_position_id == normalized_position.c.id)
            .outerjoin(card_source, card.c.id == card_source.c.card_id)
            .where(card.c.id == card_id)
            .where(card.c.user_id == user_id)  # Item 13: tenancy filter.
        )

        result = await self.session.execute(query)
        row = result.fetchone()

        if not row:
            return None

        # Construct via dict-expansion from row._asdict(). Pydantic's
        # `from_attributes=True` mode is designed for ORM-mapped-class
        # instances, not SQLAlchemy Core Row objects — feeding a Row
        # into model_validate(from_attributes=True) misbinds fields to
        # the whole row tuple. _asdict() gives a flat column-name-keyed
        # dict that Pydantic validates cleanly with extras (user_id,
        # normalized_position_id) silently dropped.
        return Card.model_validate(row._asdict())

    async def update_card_model(
        self,
        card_id: int,
        new_model: Tuple[float, float, float],
        *,
        user_id: UserId,
    ) -> None:
        """
        Persist a new (alpha, beta, t) Bayesian prior for the card.

        Item 13 (tenancy): the UPDATE's WHERE clause filters on
        user_id. An update issued against a card the caller doesn't
        own affects zero rows and returns silently. The calling
        pattern in ReviewService.process_review (always fetch via
        get_card_by_id first, which enforces the tenant boundary) makes
        this branch unreachable in practice, but the redundant filter
        is belt-and-braces against a future caller that bypasses
        the fetch step.
        """
        alpha, beta, t = new_model
        stmt = (
            update(card)
            .where(card.c.id == card_id)
            .where(card.c.user_id == user_id)  # Item 13: tenancy filter.
            .values(
                alpha=alpha,
                beta=beta,
                t=t,
                last_reviewed_at=datetime.now(timezone.utc),
                num_reviews=card.c.num_reviews + 1,
            )
        )
        await self.session.execute(stmt)

    # ---------------------------------------------------------------
    # Write surface — CardWriteRepositoryPort (item 30b)
    #
    # Each method is a thin SQL statement; the previous home of this
    # code was services/card_service.py, which conflated orchestration
    # with persistence. Moved here in 30b.
    #
    # Item 34a: the previous adapter-boundary name mapping
    # (Port speaks canonical_content/content_hash; schema spoke
    # normalized_sgf/pos_hash) is gone. Schema and Port now share the
    # generic names; the mapping that used to live inside
    # get_or_create_position is eliminated.
    # ---------------------------------------------------------------

    async def get_or_create_position(
        self,
        *,
        canonical_content: str,
        content_hash: bytes,
    ) -> int:
        """
        Get-or-create a normalized_position row by content hash.

        Dialect-agnostic: uses SELECT-then-conditional-INSERT rather
        than ON CONFLICT (Postgres) or INSERT OR IGNORE (SQLite). The
        caller's transaction boundary keeps this atomic; between the
        SELECT and INSERT a concurrent transaction could create the
        same row, which would fail the UNIQUE constraint on
        content_hash and propagate an IntegrityError — acceptable
        given the current single-writer pattern. If concurrent
        ingestion ever becomes a workload, switch to dialect-specific
        upsert with a branch table by `self.session.bind.dialect.name`.

        Item 34a: Port parameter names (canonical_content, content_hash)
        and schema column names now match. The translation layer that
        30b introduced — and that this docstring used to document — is
        gone.
        """
        pos_query = select(normalized_position.c.id).where(
            normalized_position.c.content_hash == content_hash
        )
        pos_id = (await self.session.execute(pos_query)).scalar()
        if pos_id:
            return pos_id

        stmt = (
            insert(normalized_position)
            .values(
                content_hash=content_hash,
                canonical_content=canonical_content,
            )
            .returning(normalized_position.c.id)
        )
        result = await self.session.execute(stmt)
        return result.scalar()

    async def insert_card(
        self,
        *,
        num_moves: int,
        model: Tuple[float, float, float],
        user_id: int,
        grading_parameter: Optional[Dict[str, Any]],
        position_id: int,
    ) -> int:
        """
        Insert a new card row with the given Bayesian prior and
        return its id. RETURNING requires SQLite 3.35+ (March 2021) —
        already a soft minimum for this codebase.
        """
        alpha, beta, t = model
        stmt = (
            insert(card)
            .values(
                num_moves=num_moves,
                alpha=alpha,
                beta=beta,
                t=t,
                user_id=user_id,
                grading_parameter=grading_parameter,
                normalized_position_id=position_id,
            )
            .returning(card.c.id)
        )
        result = await self.session.execute(stmt)
        return result.scalar()

    async def insert_game_source(
        self,
        *,
        position_id: int,
        user_id: UserId,
        player_white: Optional[str],
        player_black: Optional[str],
        description: Optional[str],
        raw_content: str,
    ) -> int:
        """
        Insert a new game_source row, stamping user_id from the
        caller's tenant context (item 24). Returns the new id.

        Game-source dedup: no `client_game_id` is set on
        rows from this path. Such rows are exempt from the partial
        unique index `uniq_game_source_user_client_game_id` and
        therefore not dedup targets. The dedup-aware path is
        `get_or_create_game_source_by_client_id`.
        """
        stmt = (
            insert(game_source)
            .values(
                position_id=position_id,
                user_id=user_id,
                player_white=player_white,
                player_black=player_black,
                description=description,
                raw_content=raw_content,
            )
            .returning(game_source.c.id)
        )
        result = await self.session.execute(stmt)
        return result.scalar()

    async def get_or_create_game_source_by_client_id(
        self,
        *,
        client_game_id: UUID,
        position_id: int,
        user_id: UserId,
        player_white: Optional[str],
        player_black: Optional[str],
        description: Optional[str],
        raw_content: str,
    ) -> int:
        """
        Get-or-create a game_source row keyed on
        `(user_id, client_game_id)`. Returns the existing id on hit,
        the new id on miss.

        Game-source dedup: the dispatch's contract. See
        the Port docstring for the full semantic, including the
        first-mint-wins metadata rule and the documented race window.

        Logging: the "got" vs "created" branch is logged at INFO so
        the dispatch's Q4 (rollout observability) is satisfied. The
        log line carries user_id and client_game_id so a sweep over
        backend logs can verify dedup is firing on
        second-and-subsequent mints from one board.
        """
        existing = await self.session.execute(
            select(game_source.c.id)
            .where(game_source.c.user_id == user_id)
            .where(game_source.c.client_game_id == client_game_id)
        )
        found_id = existing.scalar()
        if found_id is not None:
            logger.info(
                "game_source dedup: got existing row "
                "id=%s user_id=%s client_game_id=%s",
                found_id, user_id, client_game_id,
            )
            return found_id

        stmt = (
            insert(game_source)
            .values(
                position_id=position_id,
                user_id=user_id,
                player_white=player_white,
                player_black=player_black,
                description=description,
                raw_content=raw_content,
                client_game_id=client_game_id,
            )
            .returning(game_source.c.id)
        )
        result = await self.session.execute(stmt)
        new_id = result.scalar()
        logger.info(
            "game_source dedup: created row "
            "id=%s user_id=%s client_game_id=%s",
            new_id, user_id, client_game_id,
        )
        return new_id

    async def link_source(
        self,
        *,
        card_id: int,
        parent_card_id: Optional[int],
        game_source_id: Optional[int],
    ) -> None:
        """
        Insert a card_source row linking a card to either its parent
        (branch) or its game_source (root).

        The CheckConstraint `check_one_source` on the card_source
        table enforces XOR at the database level; a caller that
        violates this invariant (e.g., passes both or neither) will
        get an IntegrityError. The CardCreate validator and
        CardService.create_card both already ensure the invariant
        holds — the DB-level check is belt-and-braces.
        """
        stmt = insert(card_source).values(
            card_id=card_id,
            card_source_id=parent_card_id,
            game_source_id=game_source_id,
            is_primary_source=(game_source_id is not None),
        )
        await self.session.execute(stmt)

    async def attach_tags(
        self,
        card_id: int,
        tag_names: List[str],
    ) -> None:
        """
        Dialect-agnostic, batched get-or-create for tags.

        Item 21e's 4-round-trip implementation moved from CardService
        to the repository as part of item 30b:
            1. SELECT existing tags by name.
            2. Bulk INSERT missing tags with RETURNING (skipped if none).
            3. SELECT existing card_tag links for this card.
            4. Bulk INSERT missing links (skipped if none).

        Multi-row INSERT with RETURNING is supported on Postgres
        natively and on SQLite 3.35+ via SQLAlchemy 2.0 — no
        dialect-specific ON CONFLICT or INSERT OR IGNORE required.
        Idempotent: calling twice with the same tag_names leaves the
        database in the same final state.
        """
        if not tag_names:
            return

        # Deduplicate input while preserving the set of distinct names.
        unique_names = set(tag_names)

        # 1. Find existing tags by name.
        existing_rows = (await self.session.execute(
            select(tag.c.id, tag.c.name).where(tag.c.name.in_(unique_names))
        )).fetchall()
        name_to_id = {row.name: row.id for row in existing_rows}

        # 2. Bulk-insert any missing tags. The returned rows are
        # mapped back to ids by name, so the database is free to return
        # them in any order.
        missing_names = unique_names - set(name_to_id.keys())
        if missing_names:
            new_rows = (await self.session.execute(
                insert(tag)
                .values([{"name": n} for n in missing_names])
                .returning(tag.c.id, tag.c.name)
            )).fetchall()
            for row in new_rows:
                name_to_id[row.name] = row.id

        all_tag_ids = {name_to_id[n] for n in unique_names}

        # 3. Find which links already exist (defensive — attach_tags
        # is currently only called from CardService.create_card on a
        # brand-new card, but this preserves idempotency for any
        # future caller).
        existing_link_tag_ids = {
            row.tag_id for row in (await self.session.execute(
                select(card_tag.c.tag_id).where(
                    card_tag.c.card_id == card_id,
                    card_tag.c.tag_id.in_(all_tag_ids),
                )
            )).fetchall()
        }

        # 4. Bulk-insert any missing links.
        missing_link_tag_ids = all_tag_ids - existing_link_tag_ids
        if missing_link_tag_ids:
            await self.session.execute(
                insert(card_tag).values([
                    {"card_id": card_id, "tag_id": tid}
                    for tid in missing_link_tag_ids
                ])
            )
