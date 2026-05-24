"""
tests/integration/routes/test_games_routes.py

Route-layer tests for /games — the SGF library's HTTP surface.

Verified:

  - POST /games/import happy path returns the per-file outcomes list.
  - POST /games/import with malformed SGFs surfaces ``errored``
    outcomes alongside successful ones without failing the whole
    batch.
  - POST /games/import beyond the batch cap → 413
    ``{kind: "batch_too_large", received, maximum, ...}``.
  - GET /games returns list rows + total_count with column
    projection (no ``raw_content`` on the list rows).
  - GET /games sort + filter + offset + limit work end-to-end.
  - GET /games with bad sort column → 422 (FastAPI's Literal validation).
  - GET /games/{id} happy path returns ``raw_content``.
  - GET /games/{id} cross-tenant → 404 (404-not-403 invariant).
  - DELETE /games/{id} happy → 204; cross-tenant → 404.
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
    resp = await client.post("/games/import", json={"games": []})
    assert resp.status_code == 401


async def test_list_without_auth_returns_401(client):
    resp = await client.get("/games")
    assert resp.status_code == 401


async def test_get_without_auth_returns_401(client):
    resp = await client.get("/games/1")
    assert resp.status_code == 401


async def test_delete_without_auth_returns_401(client):
    resp = await client.delete("/games/1")
    assert resp.status_code == 401


# ─── POST /games/import ──────────────────────────────────────────────────────


async def test_import_happy_path(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.post(
        "/games/import",
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
        "/games/import",
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
        "/games/import",
        json={"games": [{"raw_content": raw}]},
        headers=auth_header(ALICE_ID),
    )
    second = await client.post(
        "/games/import",
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
            "/games/import",
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


# ─── GET /games ─────────────────────────────────────────────────────────────


async def test_list_returns_rows_and_total_no_raw_content(client, session):
    await seed_user(session, user_id=ALICE_ID)
    for i in range(3):
        await client.post(
            "/games/import",
            json={"games": [{"raw_content": _sgf(str(i))}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get("/games", headers=auth_header(ALICE_ID))
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
            "/games/import",
            json={"games": [{"raw_content": raw}]},
            headers=auth_header(ALICE_ID),
        )
    resp = await client.get(
        "/games?player_white_like=Cho",
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_count"] == 2


async def test_list_cross_tenant_isolation(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    await client.post(
        "/games/import",
        json={"games": [{"raw_content": _sgf("alice")}]},
        headers=auth_header(ALICE_ID),
    )
    await client.post(
        "/games/import",
        json={"games": [{"raw_content": _sgf("bob")}]},
        headers=auth_header(BOB_ID),
    )
    alice = (await client.get("/games", headers=auth_header(ALICE_ID))).json()
    bob = (await client.get("/games", headers=auth_header(BOB_ID))).json()
    assert alice["total_count"] == 1
    assert bob["total_count"] == 1


async def test_list_invalid_sort_returns_422(client, session):
    """Bad sort column → 422 via FastAPI's Literal validation."""
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.get(
        "/games?sort=not_a_column",
        headers=auth_header(ALICE_ID),
    )
    assert resp.status_code == 422


async def test_list_offset_pagination(client, session):
    await seed_user(session, user_id=ALICE_ID)
    for i in range(5):
        await client.post(
            "/games/import",
            json={"games": [{"raw_content": _sgf(str(i))}]},
            headers=auth_header(ALICE_ID),
        )

    page1 = (await client.get(
        "/games?sort=created_at&direction=asc&offset=0&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    page2 = (await client.get(
        "/games?sort=created_at&direction=asc&offset=2&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    page3 = (await client.get(
        "/games?sort=created_at&direction=asc&offset=4&limit=2",
        headers=auth_header(ALICE_ID),
    )).json()
    assert page1["total_count"] == 5
    assert len(page1["rows"]) == 2
    assert len(page2["rows"]) == 2
    assert len(page3["rows"]) == 1
    ids = [r["id"] for r in page1["rows"] + page2["rows"] + page3["rows"]]
    assert ids == sorted(ids)  # asc order


# ─── GET /games/{id} ────────────────────────────────────────────────────────


async def test_get_game_returns_raw_content(client, session):
    await seed_user(session, user_id=ALICE_ID)
    raw = _sgf("detail")
    import_resp = await client.post(
        "/games/import",
        json={"games": [{"raw_content": raw}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.get(f"/games/{gid}", headers=auth_header(ALICE_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["raw_content"] == raw
    assert body["id"] == gid


async def test_get_game_cross_tenant_returns_404(client, session):
    """404-not-403 invariant: Bob asking for Alice's game gets 404."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    import_resp = await client.post(
        "/games/import",
        json={"games": [{"raw_content": _sgf("alice-only")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]
    resp = await client.get(f"/games/{gid}", headers=auth_header(BOB_ID))
    assert resp.status_code == 404


async def test_get_game_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.get("/games/999999", headers=auth_header(ALICE_ID))
    assert resp.status_code == 404


# ─── DELETE /games/{id} ─────────────────────────────────────────────────────


async def test_delete_game_returns_204(client, session):
    await seed_user(session, user_id=ALICE_ID)
    import_resp = await client.post(
        "/games/import",
        json={"games": [{"raw_content": _sgf("del-me")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.delete(f"/games/{gid}", headers=auth_header(ALICE_ID))
    assert resp.status_code == 204

    # Follow-up GET: gone.
    follow = await client.get(f"/games/{gid}", headers=auth_header(ALICE_ID))
    assert follow.status_code == 404


async def test_delete_game_cross_tenant_returns_404(client, session):
    """404-not-403 invariant on delete too."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    import_resp = await client.post(
        "/games/import",
        json={"games": [{"raw_content": _sgf("alice-protected")}]},
        headers=auth_header(ALICE_ID),
    )
    gid = import_resp.json()["outcomes"][0]["game_id"]

    resp = await client.delete(f"/games/{gid}", headers=auth_header(BOB_ID))
    assert resp.status_code == 404
    # Alice's row survives.
    follow = await client.get(f"/games/{gid}", headers=auth_header(ALICE_ID))
    assert follow.status_code == 200


async def test_delete_game_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    resp = await client.delete("/games/999999", headers=auth_header(ALICE_ID))
    assert resp.status_code == 404
