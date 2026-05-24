"""
tests/integration/routes/test_library_routes.py

Route-layer tests for /library — the SGF library's HTTP surface.

Verified:

  - POST /library/games/import happy path returns the per-file outcomes.
  - POST /library/games/import with malformed SGFs surfaces ``errored``
    outcomes alongside successful ones without failing the whole batch.
  - POST /library/games/import beyond the batch cap → 413
    ``{kind: "batch_too_large", received, maximum, ...}``.
  - GET /library/games returns list rows + total_count with column
    projection (no ``raw_content`` on the list rows).
  - GET /library/games sort + filter + offset + limit work end-to-end.
  - GET /library/games with bad sort column → 422.
  - GET /library/games/{id} happy path returns ``raw_content``.
  - GET /library/games/{id} cross-tenant → 404 (404-not-403 invariant).
  - DELETE /library/games/{id} happy → 204; cross-tenant → 404.
  - GET /library/players returns distinct names, frequency-ordered,
    cross-tenant isolated.
  - All routes 401 without bearer.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from api.dependencies import get_game_library_service
from repositories.game_library_repository import GameLibraryRepository
from services.game_library_service import GameLibraryService
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


# A small but well-formed SGF body for the route tests. The label
# parameter is encoded into the move coordinates so each call
# produces a distinct *canonical* SGF (the normalizer strips
# comments and metadata; only main-line moves and setup survive).
# Use a deterministic md5-based mapping rather than Python's built-in
# hash() which is randomised across interpreter runs.
import hashlib as _hashlib


def _sgf(label: str, *, pw: str = "Alice", pb: str = "Bob") -> str:
    digest = _hashlib.md5(label.encode()).digest()
    coords = "abcdefghijklmnopqrs"
    coord_a = coords[digest[0] % 19]
    coord_b = coords[digest[1] % 19]
    return (
        f"(;FF[4]GM[1]SZ[19]PW[{pw}]PB[{pb}]"
        f";B[{coord_a}{coord_b}];W[dp])"
    )


# ─── 401: no auth ────────────────────────────────────────────────────────────


async def test_import_without_auth_returns_401(client):
    resp = await client.post("/library/games/import", json={"games": []})
    assert resp.status_code == 401


async def test_list_without_auth_returns_401(client):
    resp = await client.get("/library/games")
    assert resp.status_code == 401


async def test_get_without_auth_returns_401(client):
    resp = await client.get("/library/games/1")
    assert resp.status_code == 401


async def test_delete_without_auth_returns_401(client):
    resp = await client.delete("/library/games/1")
    assert resp.status_code == 401


# ─── POST /library/games/import ─────────────────────────────────────────────


async def test_import_happy_path(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("A")}]},
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["outcomes"]) == 1
    assert body["outcomes"][0]["status"] == "created"
    assert body["outcomes"][0]["game_id"] > 0
    assert body["outcomes"][0]["client_game_id"] is not None


async def test_import_mixed_batch_isolates_errors(client, session):
    """One malformed SGF doesn't fail the whole batch."""
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.post(
        "/library/games/import",
        json={
            "games": [
                {"raw_content": _sgf("A")},
                {"raw_content": "not an sgf"},
                {"raw_content": _sgf("B")},
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 200
    outcomes = resp.json()["outcomes"]
    assert outcomes[0]["status"] == "created"
    assert outcomes[1]["status"] == "errored"
    assert outcomes[2]["status"] == "created"


async def test_import_duplicate_returns_deduplicated(client, session):
    await seed_user(session, user_id=ALICE_ID)
    raw = _sgf("X")
    first = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": raw}]},
        headers=auth_header(ALICE_ID),
    )
    second = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": raw}]},
        headers=auth_header(ALICE_ID),
    )
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["outcomes"][0]["status"] == "created"
    assert second.json()["outcomes"][0]["status"] == "deduplicated"


async def test_import_above_batch_cap_returns_413(client, session, test_db):
    """Batch larger than ``import_batch_max`` → 413 batch_too_large."""
    await seed_user(session, user_id=ALICE_ID)

    # Override the service factory to install a tiny cap.
    from fastapi import Depends
    from api.dependencies import get_db, get_position_normalizer

    async def _small_cap_service(
        db=Depends(get_db),
        normalizer=Depends(get_position_normalizer),
    ):
        return GameLibraryService(
            repository=GameLibraryRepository(db),
            normalizer=normalizer,
            import_batch_max=2,
            list_limit_max=10,
        )

    client._transport.app.dependency_overrides[get_game_library_service] = _small_cap_service
    try:
        resp = await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": _sgf(str(i))} for i in range(3)]},
            headers=auth_header(ALICE_ID),
        )
        assert resp.status_code == 413, resp.text
        detail = resp.json()["detail"]
        assert detail["kind"] == "batch_too_large"
        assert detail["received"] == 3
        assert detail["maximum"] == 2
    finally:
        client._transport.app.dependency_overrides.pop(get_game_library_service, None)


# ─── GET /library/games ─────────────────────────────────────────────────────


async def test_list_returns_rows_and_total_no_raw_content(client, session):
    await seed_user(session, user_id=ALICE_ID)
    for i in range(3):
        await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": _sgf(str(i))}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get("/library/games", headers=auth_header(ALICE_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_count"] == 3
    assert len(body["rows"]) == 3
    # Column projection: list rows do not carry raw_content.
    for row in body["rows"]:
        assert "raw_content" not in row


async def test_list_with_filter_player_white(client, session):
    await seed_user(session, user_id=ALICE_ID)
    for raw in [_sgf("a", pw="Cho Chikun"), _sgf("b", pw="Cho U"),
                _sgf("c", pw="Lee Sedol")]:
        await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": raw}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get(
        "/library/games?player_white_like=Cho",
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_count"] == 2


async def test_list_cross_tenant_isolation(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("alice")}]},
        headers=auth_header(ALICE_ID),
    )
    await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("bob")}]},
        headers=auth_header(BOB_ID),
    )
    alice = (await client.get("/library/games", headers=auth_header(ALICE_ID))).json()
    bob = (await client.get("/library/games", headers=auth_header(BOB_ID))).json()
    assert alice["total_count"] == 1
    assert bob["total_count"] == 1


async def test_list_invalid_sort_returns_422(client, session):
    """Bad sort column → 422 via FastAPI's Literal validation."""
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.get(
        "/library/games?sort=not_a_column",
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 422


async def test_list_offset_pagination(client, session):
    await seed_user(session, user_id=ALICE_ID)
    for i in range(5):
        await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": _sgf(str(i))}]},
            headers=auth_header(ALICE_ID),
        )

    page1 = (await client.get(
        "/library/games?sort=created_at&direction=asc&offset=0&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    page2 = (await client.get(
        "/library/games?sort=created_at&direction=asc&offset=2&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    page3 = (await client.get(
        "/library/games?sort=created_at&direction=asc&offset=4&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    assert page1["total_count"] == 5
    assert len(page1["rows"]) == 2
    assert len(page2["rows"]) == 2
    assert len(page3["rows"]) == 1
    ids = [r["id"] for r in page1["rows"] + page2["rows"] + page3["rows"]]
    assert ids == sorted(ids)  # asc order


# ─── GET /library/games/{id} ────────────────────────────────────────────────


async def test_get_game_returns_raw_content(client, session):
    await seed_user(session, user_id=ALICE_ID)
    raw = _sgf("detail")
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": raw}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.get(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["raw_content"] == raw
    assert body["id"] == gid


async def test_get_game_cross_tenant_returns_404(client, session):
    """404-not-403 invariant: Bob asking for Alice's game gets 404."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("alice-only")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]
    resp = await client.get(f"/library/games/{gid}", headers=auth_header(BOB_ID))
    assert resp.status_code == 404


async def test_get_game_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.get("/library/games/999999", headers=auth_header(ALICE_ID))
    assert resp.status_code == 404


# ─── DELETE /library/games/{id} ─────────────────────────────────────────────


async def test_delete_game_returns_204(client, session):
    await seed_user(session, user_id=ALICE_ID)
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("del-me")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.delete(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert resp.status_code == 204

    # Follow-up GET: gone.
    follow = await client.get(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert follow.status_code == 404


async def test_delete_game_cross_tenant_returns_404(client, session):
    """404-not-403 invariant on delete too."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("alice-protected")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.delete(f"/library/games/{gid}", headers=auth_header(BOB_ID))
    assert resp.status_code == 404
    # Alice's row survives.
    follow = await client.get(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert follow.status_code == 200


async def test_delete_game_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.delete("/library/games/999999", headers=auth_header(ALICE_ID))
    assert resp.status_code == 404


# ─── GET /library/players ───────────────────────────────────────────────────


async def test_players_without_auth_returns_401(client):
    resp = await client.get("/library/players")
    assert resp.status_code == 401


async def test_players_empty_library_returns_empty_list(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.get("/library/players", headers=auth_header(ALICE_ID))
    assert resp.status_code == 200
    assert resp.json() == {"players": []}


async def test_players_returns_distinct_union_of_white_and_black(client, session):
    await seed_user(session, user_id=ALICE_ID)
    # Three games: (Alice, Bob), (Carol, Bob), (Bob, Alice).
    # Distinct union: {Alice, Bob, Carol}.
    for raw in [
        _sgf("a", pw="Alice", pb="Bob"),
        _sgf("b", pw="Carol", pb="Bob"),
        _sgf("c", pw="Bob", pb="Alice"),
    ]:
        await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": raw}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get("/library/players", headers=auth_header(ALICE_ID))
    assert resp.status_code == 200
    players = resp.json()["players"]
    assert {p["name"] for p in players} == {"Alice", "Bob", "Carol"}
    # Counts: Bob in 3 games (2W + 1B), Alice in 2, Carol in 1.
    by_name = {p["name"]: p["count"] for p in players}
    assert by_name == {"Bob": 3, "Alice": 2, "Carol": 1}


async def test_players_orders_by_descending_frequency(client, session):
    """Bob appears 3 times (2 white, 1 black); should sort before Alice (1) and Carol (1)."""
    await seed_user(session, user_id=ALICE_ID)
    for raw in [
        _sgf("a", pw="Bob", pb="Alice"),
        _sgf("b", pw="Bob", pb="Carol"),
        _sgf("c", pw="Dan", pb="Bob"),
    ]:
        await client.post(
            "/library/games/import",
            json={"games": [{"raw_content": raw}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get("/library/players", headers=auth_header(ALICE_ID))
    players = resp.json()["players"]
    # Bob appears 3 times, everyone else 1 — Bob first.
    assert players[0] == {"name": "Bob", "count": 3}
    # Ties broken alphabetically; each appears once.
    assert [p["name"] for p in players[1:]] == ["Alice", "Carol", "Dan"]
    assert all(p["count"] == 1 for p in players[1:])


async def test_import_with_source_path_round_trips_in_detail(client, session):
    """source_path on the import body surfaces via GET /library/games/{id}."""
    await seed_user(session, user_id=ALICE_ID)
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{
            "raw_content": _sgf("with-path"),
            "source_path": "sgf_db/1996/cho-vs-lee.sgf",
        }]},
        headers=auth_header(ALICE_ID),
    )
    assert import_resp.status_code == 200
    gid = import_resp.json()["outcomes"][0]["game_id"]

    detail = await client.get(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert detail.status_code == 200
    body = detail.json()
    assert body["metadata_extra"]["source_path"] == "sgf_db/1996/cho-vs-lee.sgf"


async def test_import_without_source_path_omits_key(client, session):
    """When the import body omits source_path, the key isn't added."""
    await seed_user(session, user_id=ALICE_ID)
    import_resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("no-path")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]
    detail = await client.get(f"/library/games/{gid}", headers=auth_header(ALICE_ID))
    assert detail.status_code == 200
    assert "source_path" not in detail.json()["metadata_extra"]


async def test_players_cross_tenant_isolation(client, session):
    """Bob asking for /library/players sees only Bob's names, not Alice's."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("alice-game", pw="Alice", pb="Anne")}]},
        headers=auth_header(ALICE_ID),
    )
    await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf("bob-game", pw="Bob", pb="Bert")}]},
        headers=auth_header(BOB_ID),
    )
    alice = (await client.get("/library/players", headers=auth_header(ALICE_ID))).json()
    bob = (await client.get("/library/players", headers=auth_header(BOB_ID))).json()
    assert {p["name"] for p in alice["players"]} == {"Alice", "Anne"}
    assert {p["name"] for p in bob["players"]} == {"Bob", "Bert"}
