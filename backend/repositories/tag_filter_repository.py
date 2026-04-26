"""
Tag filter repository — the SQLAlchemy adapter for tag-DSL
materialization.

Satisfies TagFilterRepositoryPort. Before item 32a, the tag-DSL
compile-and-execute logic was inline in PipelineExecutor.run; the
executor instantiated a TagDSLCompiler, passed the expression, ran
the resulting statement on its own session, and collected the ids.
After 32a, that sequence lives behind this Port.

Item 16 (tenancy): the adapter now wraps the compiled SELECT in an
outer query that joins `card` and filters by user_id. The
TagDSLCompiler itself stays domain-agnostic about tenancy — it
produces a SELECT of card ids matching a tag expression, and the
adapter narrows that to the caller's cards. This keeps the
compiler's contract general (it remains usable in tests without
needing a tenant context) while making the production usage
tenant-safe.

PipelineDSLError (raised by TagDSLCompiler for malformed expressions)
propagates unchanged; the executor catches InvalidInputError at its
outer boundary and the route maps that to 422.
"""
from typing import Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import card
from domain.auth import UserId
from domain.tag_dsl import TagDSLCompiler


class TagFilterRepository:
    """
    SQLAlchemy implementation of TagFilterRepositoryPort.

    Holds a single AsyncSession. Does not commit — the executor path
    is read-only for this adapter.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def card_ids_matching(
        self, tag_expression: str, *, user_id: UserId
    ) -> Set[int]:
        """
        Compile the tag-DSL expression and return the set of card ids
        whose tags satisfy it AND which belong to `user_id`.

        TagDSLCompiler is stateless, so a fresh instance per call is
        fine. The compiled statement is a SELECT returning card ids;
        we wrap it in an outer SELECT that joins `card` and applies
        the user_id filter.

        Item 16 (tenancy): without this wrapping, a tenant could use
        a tag-filter pipeline to enumerate cards belonging to other
        tenants — even cards they couldn't otherwise read via
        get_card_by_id. The wrap closes that probe.

        The wrap structure:

            SELECT card.id
            FROM card
            WHERE card.id IN (<compiler subquery>)
              AND card.user_id = :user_id

        Equivalent to a join, slightly more compiler-friendly across
        dialects. Both SQLite and Postgres optimize IN-with-subquery
        to a semi-join on the planner side, so the runtime cost is
        the same as a hand-written join.

        Raises PipelineDSLError (a subclass of InvalidInputError) for
        malformed tag expressions — the route catches this at the
        error-axis level and returns 422 with the compiler's message.
        """
        compiler = TagDSLCompiler()
        inner = compiler.compile_to_subquery(tag_expression)

        wrapped = (
            select(card.c.id)
            .where(card.c.id.in_(inner))
            .where(card.c.user_id == user_id)
        )

        result = await self.session.execute(wrapped)
        return {row[0] for row in result.fetchall()}
