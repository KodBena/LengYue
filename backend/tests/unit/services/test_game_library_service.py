"""
tests/unit/services/test_game_library_service.py

Service-level tests for ``GameLibraryService`` driven through
``FakeGameLibraryRepository`` and ``FakeNormalizer``.

The service has two responsibilities above pass-through:

  1. Per-file normalization with structured failure surfacing.
     The normalizer raises ``ValueError`` on malformed SGF; the
     service catches per-file and emits ``ImportOutcomeErrored``
     so the rest of the batch survives.
  2. Batch-size cap. Requests larger than ``import_batch_max``
     raise ``BatchTooLargeError``; the route maps to 413.

Coverage:

  - ``import_games``: per-file mix (created / deduplicated /
    errored-at-normalizer / errored-at-adapter) interleaves
    correctly with order preserved.
  - ``import_games``: ``BatchTooLargeError`` raised when the
    batch exceeds the configured cap.
  - ``import_games``: empty batch returns empty list.
  - ``list_games``: pass-through plus offset / limit validation.
  - ``get_game`` / ``delete_game``: pass-through with 404-not-403
    semantics from the fake.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from domain.auth import UserId
from domain.errors import BatchTooLargeError
from domain.game_library import (
    GameImportInput,
    GameListFilter,
)
from services.game_library_service import GameLibraryService
from tests.fakes import FakeGameLibraryRepository, FakeNormalizer

pytestmark = pytest.mark.unit


ALICE = UserId(1)
BOB = UserId(2)


def _make_service(
    *,
    repo: FakeGameLibraryRepository | None = None,
    normalizer: FakeNormalizer | None = None,
    import_batch_max: int = 100,
    list_limit_max: int = 500,
) -> tuple[GameLibraryService, FakeGameLibraryRepository, FakeNormalizer]:
    repo = repo or FakeGameLibraryRepository()
    normalizer = normalizer or FakeNormalizer()
    svc = GameLibraryService(
        repository=repo,
        normalizer=normalizer,
        import_batch_max=import_batch_max,
        list_limit_max=list_limit_max,
    )
    return svc, repo, normalizer


# ─── import_games: cap enforcement (failure-mode first) ────────────────────


async def test_import_games_raises_batch_too_large_above_cap():
    svc, _, _ = _make_service(import_batch_max=3)
    with pytest.raises(BatchTooLargeError) as exc_info:
        await svc.import_games(
            user_id=ALICE,
            inputs=[GameImportInput(raw_content="a"), GameImportInput(raw_content="b"), GameImportInput(raw_content="c"), GameImportInput(raw_content="d")],
        )
    assert exc_info.value.received == 4
    assert exc_info.value.maximum == 3


async def test_import_games_at_cap_succeeds():
    svc, _, normalizer = _make_service(import_batch_max=3)
    for raw in ["a", "b", "c"]:
        normalizer.set_metadata(raw, {"player_white": "X"})
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="a"), GameImportInput(raw_content="b"), GameImportInput(raw_content="c")],
    )
    assert len(outcomes) == 3
    assert all(o.status == "created" for o in outcomes)


# ─── import_games: empty and happy-path ─────────────────────────────────────


async def test_import_games_empty_returns_empty():
    svc, _, _ = _make_service()
    outcomes = await svc.import_games(user_id=ALICE, inputs=[])
    assert outcomes == []


async def test_import_games_happy_path_returns_created():
    svc, _, normalizer = _make_service()
    normalizer.set_metadata("raw-a", {"player_white": "Alice"})
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="raw-a")],
    )
    assert len(outcomes) == 1
    assert outcomes[0].status == "created"
    assert outcomes[0].game_id > 0


async def test_import_games_duplicate_returns_deduplicated():
    svc, _, _ = _make_service()
    # Same raw → same canonical → same content_hash; second import
    # dedups against the first.
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="raw-x"), GameImportInput(raw_content="raw-x")],
    )
    assert outcomes[0].status == "created"
    assert outcomes[1].status == "deduplicated"
    assert outcomes[0].game_id == outcomes[1].game_id


# ─── import_games: per-file failure isolation ───────────────────────────────


async def test_import_games_malformed_sgf_surfaces_errored_outcome():
    """A normalizer ValueError on one file becomes an Errored outcome at the right index."""
    svc, _, normalizer = _make_service()
    normalizer.raises_for("bad", message="bad sgf")
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="good-1"), GameImportInput(raw_content="bad"), GameImportInput(raw_content="good-2")],
    )
    assert outcomes[0].status == "created"
    assert outcomes[1].status == "errored"
    assert outcomes[1].error == "bad sgf"
    assert outcomes[2].status == "created"


async def test_import_games_adapter_failure_surfaces_errored_outcome():
    """A SAVEPOINT-region failure on one file becomes Errored at the right index."""
    svc, repo, normalizer = _make_service()
    # Pre-compute the content hash the normalizer would emit for "bad-row"
    # so we can wire the adapter to raise on that hash.
    norm = normalizer.normalize("bad-row")
    repo.raise_on(norm.content_hash, RuntimeError("simulated adapter failure"))

    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="good-row"), GameImportInput(raw_content="bad-row"), GameImportInput(raw_content="other-good-row")],
    )
    assert outcomes[0].status == "created"
    assert outcomes[1].status == "errored"
    assert "simulated adapter failure" in outcomes[1].error
    assert outcomes[2].status == "created"


# ─── list_games: pass-through + bounded inputs ──────────────────────────────


async def test_list_games_rejects_negative_offset():
    svc, _, _ = _make_service()
    with pytest.raises(ValueError, match="offset"):
        await svc.list_games(
            user_id=ALICE,
            sort="created_at",
            direction="desc",
            filt=GameListFilter(),
            offset=-1,
            limit=10,
        )


async def test_list_games_rejects_limit_above_cap():
    svc, _, _ = _make_service(list_limit_max=100)
    with pytest.raises(ValueError, match="limit"):
        await svc.list_games(
            user_id=ALICE,
            sort="created_at",
            direction="desc",
            filt=GameListFilter(),
            offset=0,
            limit=101,
        )


async def test_list_games_rejects_zero_limit():
    svc, _, _ = _make_service()
    with pytest.raises(ValueError, match="limit"):
        await svc.list_games(
            user_id=ALICE,
            sort="created_at",
            direction="desc",
            filt=GameListFilter(),
            offset=0,
            limit=0,
        )


async def test_list_games_returns_owner_rows_with_total():
    svc, repo, _ = _make_service()
    repo.seed_row(user_id=ALICE, player_white="Alice")
    repo.seed_row(user_id=ALICE, player_white="Bob")
    repo.seed_row(user_id=BOB, player_white="Carol")  # cross-tenant

    rows, total = await svc.list_games(
        user_id=ALICE,
        sort="created_at",
        direction="desc",
        filt=GameListFilter(),
        offset=0,
        limit=10,
    )
    assert total == 2
    assert {r.player_white for r in rows} == {"Alice", "Bob"}


# ─── get_game / delete_game: tenancy ────────────────────────────────────────


async def test_get_game_returns_none_cross_tenant():
    """404-not-403 invariant — Bob asking for Alice's game gets None."""
    svc, repo, _ = _make_service()
    alice_id = repo.seed_row(user_id=ALICE, player_white="Alice")
    assert await svc.get_game(user_id=BOB, game_id=alice_id) is None


async def test_get_game_returns_game_for_owner():
    svc, repo, _ = _make_service()
    alice_id = repo.seed_row(user_id=ALICE, player_white="Alice")
    game = await svc.get_game(user_id=ALICE, game_id=alice_id)
    assert game is not None
    assert game.player_white == "Alice"


async def test_delete_game_returns_false_cross_tenant():
    """404-not-403 invariant — Bob's delete against Alice's game returns False."""
    svc, repo, _ = _make_service()
    alice_id = repo.seed_row(user_id=ALICE)
    assert await svc.delete_game(user_id=BOB, game_id=alice_id) is False
    # Row is still there.
    assert await svc.get_game(user_id=ALICE, game_id=alice_id) is not None


async def test_delete_game_returns_true_for_owner():
    svc, repo, _ = _make_service()
    alice_id = repo.seed_row(user_id=ALICE)
    assert await svc.delete_game(user_id=ALICE, game_id=alice_id) is True
    assert await svc.get_game(user_id=ALICE, game_id=alice_id) is None


# ─── list_players: pass-through with tenancy ─────────────────────────────────


async def test_list_players_returns_distinct_union_with_frequency_order():
    svc, repo, _ = _make_service()
    repo.seed_row(user_id=ALICE, player_white="Bob", player_black="Alice")
    repo.seed_row(user_id=ALICE, player_white="Bob", player_black="Carol")
    repo.seed_row(user_id=ALICE, player_white="Dan", player_black="Bob")
    players = await svc.list_players(user_id=ALICE)
    # Bob appears 3 times, others 1 each.
    assert players[0].name == "Bob"
    assert players[0].count == 3
    assert {p.name for p in players} == {"Alice", "Bob", "Carol", "Dan"}


async def test_list_players_cross_tenant_isolation():
    svc, repo, _ = _make_service()
    repo.seed_row(user_id=ALICE, player_white="Alice")
    repo.seed_row(user_id=BOB, player_white="Bob")
    alice = await svc.list_players(user_id=ALICE)
    bob = await svc.list_players(user_id=BOB)
    assert [p.name for p in alice] == ["Alice"]
    assert [p.name for p in bob] == ["Bob"]


async def test_list_players_empty_when_no_rows():
    svc, _, _ = _make_service()
    assert await svc.list_players(user_id=ALICE) == []


# ─── import_games: source_path provenance round-trip ────────────────────────


async def test_import_games_source_path_lands_in_metadata_extra():
    """A source_path on the input surfaces via get_game's metadata_extra."""
    svc, _, _ = _make_service()
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(
            raw_content="(;FF[4]C[A])",
            source_path="sgf_db/1996/cho-vs-lee.sgf",
        )],
    )
    assert outcomes[0].status == "created"
    game = await svc.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert game is not None
    assert game.metadata_extra["source_path"] == "sgf_db/1996/cho-vs-lee.sgf"


async def test_import_games_no_source_path_omits_key():
    """When source_path is None, the metadata_extra key isn't set."""
    svc, _, _ = _make_service()
    outcomes = await svc.import_games(
        user_id=ALICE,
        inputs=[GameImportInput(raw_content="(;FF[4]C[B])")],
    )
    game = await svc.get_game(user_id=ALICE, game_id=outcomes[0].game_id)
    assert game is not None
    assert "source_path" not in game.metadata_extra
