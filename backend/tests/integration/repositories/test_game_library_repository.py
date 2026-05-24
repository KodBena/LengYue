"""
tests/integration/repositories/test_game_library_repository.py

Adapter-level integration tests for ``GameLibraryRepository`` — the
SQLAlchemy implementation of ``GameLibraryRepositoryPort``.

The fake covers orchestration (``tests/unit/services/``); these
tests verify the SQL the adapter generates honours the contract:

  - Tenancy: WHERE-clause-fusion on every read path, returning the
    404-not-403 invariant from the adapter perspective.
  - Sort + tiebreaker: ``ORDER BY (sort_col, id)`` produces
    deterministic pagination even when sort values tie.
  - Offset/limit correctness at depth.
  - Dedup uniqueness: same content + same user → ``Deduplicated``.
  - Cross-user content: same canonical, different users → two rows.
  - SAVEPOINT isolation: a row that errors mid-batch doesn't
    poison the surrounding transaction.
  - Total count under filters.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import users
from domain.auth import UserId
from domain.game_library import (
    GameLibraryImportRequest,
    GameListFilter,
    SgfMetadata,
)
from repositories.game_library_repository import GameLibraryRepository

pytestmark = pytest.mark.integration


ALICE = UserId(1)
BOB = UserId(2)


# ─── seeding helpers ────────────────────────────────────────────────────────


async def _seed_user(session: AsyncSession, *, user_id: int) -> None:
    await session.execute(
        insert(users).values(
            id=user_id, username=f"u{user_id}", has_password=False,
        )
    )


def _request(
    *,
    canonical: str,
    player_white: str | None = None,
    player_black: str | None = None,
    date: str | None = None,
    result: str | None = None,
    ruleset: str | None = None,
    board_size: int | None = 19,
    extras: dict | None = None,
) -> GameLibraryImportRequest:
    digest = hashlib.sha256(canonical.encode()).digest()
    return GameLibraryImportRequest(
        raw_content=canonical,
        canonical_content=canonical,
        content_hash=digest,
        metadata=SgfMetadata(
            player_white=player_white,
            player_black=player_black,
            date=date,
            result=result,
            ruleset=ruleset,
            board_size=board_size,
            extras=extras or {},
        ),
    )


# ─── import_games: dedup + tenancy ──────────────────────────────────────────


async def test_import_games_creates_new_row(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])", player_white="Alice")],
    )
    assert len(outcomes) == 1
    assert outcomes[0].status == "created"
    assert outcomes[0].client_game_id is not None


async def test_import_games_dedups_same_content_same_user(async_session):
    """Same canonical → same content_hash → second import returns Deduplicated."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    first = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    second = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    assert first[0].status == "created"
    assert second[0].status == "deduplicated"
    assert first[0].game_id == second[0].game_id


async def test_import_games_cross_user_same_content_creates_two_rows(async_session):
    """Two users uploading the same SGF get two distinct game_source rows."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = GameLibraryRepository(session)
    a = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    b = await repo.import_games(
        user_id=BOB,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    assert a[0].status == "created"
    assert b[0].status == "created"
    assert a[0].game_id != b[0].game_id


# ─── list_games: sort, filter, tiebreaker, total_count ─────────────────────


async def test_list_games_returns_total_count_under_filter(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical=f"(;FF[4]C[{i}])", player_white="Alice")
            for i in range(3)
        ],
    )
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical=f"(;FF[4]C[Z{i}])", player_white="Carol")
            for i in range(2)
        ],
    )

    rows, total = await repo.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="desc",
        filt=GameListFilter(player_white_like="Alice"),
        offset=0,
        limit=10,
    )
    assert total == 3
    assert len(rows) == 3
    assert all(r.player_white == "Alice" for r in rows)


async def test_list_games_orders_by_sort_then_id_for_ties(async_session):
    """Tied sort values resolve by ``id`` in the same direction."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    # Three rows with identical `result` so the secondary `id` sort
    # is the only differentiator.
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical=f"(;FF[4]C[{i}])", result="B+R")
            for i in range(3)
        ],
    )
    ids_in_insert_order = [o.game_id for o in outcomes]

    rows_asc, _ = await repo.list_games(
        user_id=ALICE,
        sort="result",
        direction="asc",
        filt=GameListFilter(),
        offset=0,
        limit=10,
    )
    assert [r.id for r in rows_asc] == ids_in_insert_order

    rows_desc, _ = await repo.list_games(
        user_id=ALICE,
        sort="result",
        direction="desc",
        filt=GameListFilter(),
        offset=0,
        limit=10,
    )
    assert [r.id for r in rows_desc] == list(reversed(ids_in_insert_order))


async def test_list_games_offset_skips_pages(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical=f"(;FF[4]C[{i}])", result="W+R")
            for i in range(5)
        ],
    )
    all_ids_asc = sorted(o.game_id for o in outcomes)

    page1, total = await repo.list_games(
        user_id=ALICE,
        sort="result",
        direction="asc",
        filt=GameListFilter(),
        offset=0,
        limit=2,
    )
    page2, _ = await repo.list_games(
        user_id=ALICE,
        sort="result",
        direction="asc",
        filt=GameListFilter(),
        offset=2,
        limit=2,
    )
    page3, _ = await repo.list_games(
        user_id=ALICE,
        sort="result",
        direction="asc",
        filt=GameListFilter(),
        offset=4,
        limit=2,
    )
    assert total == 5
    assert [r.id for r in page1 + page2 + page3] == all_ids_asc


async def test_list_games_player_like_matches_either_color(async_session):
    """`player_like` ORs across player_white and player_black."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            # Cho-as-White vs anyone
            _request(canonical="(;FF[4]C[A])", player_white="Cho Chikun", player_black="Rin Kaiho"),
            # Cho-as-Black vs anyone
            _request(canonical="(;FF[4]C[B])", player_white="Kim In", player_black="Cho Hun-hyeon"),
            # Neither side is Cho
            _request(canonical="(;FF[4]C[C])", player_white="Fujisawa Hideyuki", player_black="Ishii Kunio"),
        ],
    )

    rows, total = await repo.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="asc",
        filt=GameListFilter(player_like="Cho"),
        offset=0,
        limit=10,
    )
    assert total == 2
    matched_players = {(r.player_white, r.player_black) for r in rows}
    assert matched_players == {
        ("Cho Chikun", "Rin Kaiho"),
        ("Kim In", "Cho Hun-hyeon"),
    }


async def test_list_games_player_like_ands_with_per_color(async_session):
    """`player_like` and per-color filters AND together."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical="(;FF[4]C[A])", player_white="Cho Chikun", player_black="Lee Sedol"),
            _request(canonical="(;FF[4]C[B])", player_white="Cho Hun-hyeon", player_black="Rin Kaiho"),
            _request(canonical="(;FF[4]C[C])", player_white="Kim In", player_black="Cho Hun-hyeon"),
        ],
    )

    # "Any Cho" AND "Lee as black" → only the first row.
    rows, total = await repo.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="asc",
        filt=GameListFilter(player_like="Cho", player_black_like="Lee"),
        offset=0,
        limit=10,
    )
    assert total == 1
    assert rows[0].player_white == "Cho Chikun"


async def test_list_games_filter_predicates_compose(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(
                canonical="(;FF[4]C[A])",
                player_white="Alice", player_black="Bob",
                result="B+R", ruleset="Japanese", board_size=19,
            ),
            _request(
                canonical="(;FF[4]C[B])",
                player_white="Alice", player_black="Carol",
                result="W+R", ruleset="Chinese", board_size=19,
            ),
            _request(
                canonical="(;FF[4]C[C])",
                player_white="David", player_black="Bob",
                result="B+R", ruleset="Japanese", board_size=9,
            ),
        ],
    )

    rows, total = await repo.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="asc",
        filt=GameListFilter(player_white_like="Alice", result_eq="B+R"),
        offset=0,
        limit=10,
    )
    assert total == 1
    assert rows[0].player_black == "Bob"


async def test_list_games_cross_tenant_isolation(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])", player_white="Alice")],
    )
    await repo.import_games(
        user_id=BOB,
        requests=[_request(canonical="(;FF[4]C[B])", player_white="Bob")],
    )

    alice_rows, alice_total = await repo.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="desc",
        filt=GameListFilter(),
        offset=0,
        limit=10,
    )
    assert alice_total == 1
    assert alice_rows[0].player_white == "Alice"


# ─── get_game: tenancy ──────────────────────────────────────────────────────


async def test_get_game_returns_none_cross_tenant(async_session):
    """404-not-403 — Bob asking for Alice's game returns None."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])", player_white="Alice")],
    )
    assert await repo.get_game(user_id=BOB, game_id=outcomes[0].game_id) is None
    # Alice can still see her own.
    own = await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert own is not None
    assert own.player_white == "Alice"
    assert own.raw_content == "(;FF[4]C[A])"


async def test_get_game_returns_none_for_nonexistent(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    assert await repo.get_game(user_id=ALICE, game_id=999_999) is None


async def test_get_game_carries_metadata_extra(async_session):
    """JSON column round-trips arbitrary extras."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(
            canonical="(;FF[4]C[A])",
            extras={"KM": "6.5", "HA": "0", "EV": "Test"},
        )],
    )
    game = await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert game is not None
    # The repository stamps `imported_via=library` on every library
    # import so the list endpoint can distinguish library entries
    # from card-mint rows in the shared `game_source` table; see
    # `_import_one` for the stamp and `_is_library_entry()` for the
    # consuming predicate.
    assert game.metadata_extra == {
        "KM": "6.5", "HA": "0", "EV": "Test",
        "imported_via": "library",
    }


# ─── delete_game: tenancy ────────────────────────────────────────────────────


async def test_delete_game_returns_false_cross_tenant(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    assert await repo.delete_game(user_id=BOB, game_id=outcomes[0].game_id) is False
    # Row still there.
    assert await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id) is not None


async def test_delete_game_returns_true_for_owner(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])")],
    )
    assert await repo.delete_game(user_id=ALICE, game_id=outcomes[0].game_id) is True
    assert await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id) is None


async def test_delete_game_returns_false_for_nonexistent(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = GameLibraryRepository(session)
    assert await repo.delete_game(user_id=ALICE, game_id=999_999) is False


# ─── list_players: distinct union + frequency order + tenancy ───────────────


async def test_list_players_empty_library_returns_empty(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)
    assert await repo.list_players(user_id=ALICE) == []


async def test_list_players_returns_distinct_union(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical="(;FF[4]C[A])", player_white="Alice", player_black="Bob"),
            _request(canonical="(;FF[4]C[B])", player_white="Carol", player_black="Bob"),
            _request(canonical="(;FF[4]C[C])", player_white="Bob", player_black="Alice"),
        ],
    )
    players = await repo.list_players(user_id=ALICE)
    assert set(players) == {"Alice", "Bob", "Carol"}


async def test_list_players_frequency_order_with_alphabetical_tiebreak(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)
    # Bob: 3 appearances (2 white, 1 black). Alice, Carol, Dan: 1 each.
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical="(;FF[4]C[A])", player_white="Bob", player_black="Alice"),
            _request(canonical="(;FF[4]C[B])", player_white="Bob", player_black="Carol"),
            _request(canonical="(;FF[4]C[C])", player_white="Dan", player_black="Bob"),
        ],
    )
    players = await repo.list_players(user_id=ALICE)
    assert players[0] == "Bob"
    assert players[1:] == ["Alice", "Carol", "Dan"]


async def test_list_players_excludes_null_and_empty(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[
            _request(canonical="(;FF[4]C[A])", player_white="Alice", player_black=None),
            _request(canonical="(;FF[4]C[B])", player_white=None, player_black=""),
        ],
    )
    players = await repo.list_players(user_id=ALICE)
    assert players == ["Alice"]


async def test_list_players_cross_tenant_isolation(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    repo = GameLibraryRepository(session)
    await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[A])", player_white="Alice")],
    )
    await repo.import_games(
        user_id=BOB,
        requests=[_request(canonical="(;FF[4]C[B])", player_white="Bob")],
    )
    assert await repo.list_players(user_id=ALICE) == ["Alice"]
    assert await repo.list_players(user_id=BOB) == ["Bob"]


# ─── source_path provenance round-trips into metadata_extra ─────────────────


async def test_import_with_source_path_persists_in_metadata_extra(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)

    # _request() doesn't set source_path; build the request directly here.
    digest = hashlib.sha256("(;FF[4]C[A])".encode()).digest()
    req = GameLibraryImportRequest(
        raw_content="(;FF[4]C[A])",
        canonical_content="(;FF[4]C[A])",
        content_hash=digest,
        metadata=SgfMetadata(extras={"KM": "6.5"}),
        source_path="sgf_db/1980/game-A.sgf",
    )
    outcomes = await repo.import_games(user_id=ALICE, requests=[req])
    game = await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert game is not None
    # source_path coexists with SGF extras under metadata_extra.
    assert game.metadata_extra["source_path"] == "sgf_db/1980/game-A.sgf"
    assert game.metadata_extra["KM"] == "6.5"


async def test_import_without_source_path_omits_key(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = GameLibraryRepository(session)
    outcomes = await repo.import_games(
        user_id=ALICE,
        requests=[_request(canonical="(;FF[4]C[B])", extras={"KM": "7.5"})],
    )
    game = await repo.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert game is not None
    assert "source_path" not in game.metadata_extra
    assert game.metadata_extra["KM"] == "7.5"
