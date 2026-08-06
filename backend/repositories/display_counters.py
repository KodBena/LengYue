"""
repositories/display_counters.py

Shared atomic per-user display-ordinal assignment, backing
`card.display_ordinal` and `game_source.display_ordinal`. Introduced
for the per-user-id-enumeration design
(`.claude/dispatch-reports/per-user-id-enumeration-design.md`,
Decision 2).

Not a Port — this is adapter-internal plumbing shared by two
concrete adapters (`CardRepository` and `GameLibraryRepository`)
that both mint rows on the same two tenant-scoped tables. Neither
adapter owns the other, so the increment logic lives here rather
than being duplicated (matching the existing precedent:
`CardRepository.get_or_create_position` and
`GameLibraryRepository._get_or_create_position` are duplicated
rather than shared, but that duplication predates this design and
minimal-touch discipline doesn't require unwinding it here — a new
shared concern gets a shared home instead of a third duplicate).

Assignment mechanism (Decision 2, option (a) — a per-user counter
table): `UPDATE ... SET next_x_ordinal = next_x_ordinal + 1
RETURNING next_x_ordinal` is the atomic read-modify-write. The row
lock this acquires protects the increment even under concurrent
mints for an *existing* counter row. A brand-new user's first mint
has no row to lock — the lazy upsert below creates it with both
counters at 0, then re-runs the same UPDATE. The INSERT-then-UPDATE
sequence has the same SELECT-then-conditional-INSERT race window the
codebase already accepts at `get_or_create_position` and
`get_or_create_game_source_by_client_id`: two concurrent first mints
for the same brand-new user could both attempt the INSERT, and the
primary key serializes them (one succeeds, one gets an
IntegrityError). Acceptable under the same single-writer-per-tenant
posture those methods document; if concurrent multi-tab first-mint
ever becomes a real workload, switch to a dialect-specific upsert.

License: Public Domain (The Unlicense)
"""
from sqlalchemy import Column, insert, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import user_display_counters
from domain.auth import UserId


async def _increment(
    session: AsyncSession,
    *,
    user_id: UserId,
    column: Column,
) -> int:
    stmt = (
        update(user_display_counters)
        .where(user_display_counters.c.user_id == user_id)
        .values({column.name: column + 1})
        .returning(column)
    )
    result = (await session.execute(stmt)).first()
    if result is not None:
        return result[0]

    # No counter row yet for this user (first mint ever). Lazily
    # create it at (0, 0) and retry the increment. See module
    # docstring for the race-window tradeoff.
    await session.execute(
        insert(user_display_counters).values(
            user_id=user_id, next_card_ordinal=0, next_game_ordinal=0,
        )
    )
    retry = (
        await session.execute(
            update(user_display_counters)
            .where(user_display_counters.c.user_id == user_id)
            .values({column.name: column + 1})
            .returning(column)
        )
    ).one()
    return retry[0]


async def next_card_display_ordinal(session: AsyncSession, *, user_id: UserId) -> int:
    """Atomically assign and return the next per-user card display ordinal."""
    return await _increment(
        session, user_id=user_id, column=user_display_counters.c.next_card_ordinal
    )


async def next_game_display_ordinal(session: AsyncSession, *, user_id: UserId) -> int:
    """Atomically assign and return the next per-user game_source display ordinal."""
    return await _increment(
        session, user_id=user_id, column=user_display_counters.c.next_game_ordinal
    )
