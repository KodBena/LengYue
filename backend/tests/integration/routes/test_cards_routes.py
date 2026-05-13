"""
tests/integration/routes/test_cards_routes.py

Route-layer tests for /cards (POST), /cards/{id} (GET),
/cards/{id}/review (POST).

Verified surfaces:

  - POST /cards happy path: root mint with game_metadata; branch
    mint with parent_card_id. 201 with the canonical
    CardCreateResponse shape.
  - POST /cards 422 axis: malformed CardCreate (missing
    raw_content; both parent and game_metadata set; neither set).
  - POST /cards 404: parent_card_id refers to a card the caller
    doesn't own (item 14's 404-not-403 collapse).
  - GET /cards/{id} happy path + cross-tenant 404 + nonexistent
    404.
  - POST /cards/{id}/review 422 score-length / range, 404 missing.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import card, card_source, card_tag, normalized_position, tag
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


# ─── Direct seeding (avoids POST /cards as a precondition) ───────────────────


async def _seed_position(session: AsyncSession, *, content: str) -> int:
    digest = hashlib.sha256(content.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=content)
        .returning(normalized_position.c.id)
    )
    return int(res.scalar())


async def _attach_tags(
    session: AsyncSession, *, card_id: int, tag_names: list[str]
) -> None:
    """
    Direct-seed card_tag rows for a card. Mirrors the production
    CardRepository.attach_tags write path but bypasses it so the
    test exercises the read enrichment in isolation from the
    create-card flow.
    """
    for name in tag_names:
        res = await session.execute(
            insert(tag).values(name=name).returning(tag.c.id)
        )
        tag_id = int(res.scalar())
        await session.execute(
            insert(card_tag).values(card_id=card_id, tag_id=tag_id)
        )
    await session.commit()


async def _seed_card_with_root(
    session: AsyncSession, *, user_id: int
) -> int:
    pos = await _seed_position(session, content="(;FF[4])")
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5, alpha=3.0, beta=3.0, t=1.0,
            user_id=user_id, normalized_position_id=pos,
        )
        .returning(card.c.id)
    )
    cid = int(res.scalar())
    # Root must have a card_source row (empty parent), but the test
    # only needs the card to exist for parent-precheck purposes —
    # link to a fresh game_source for completeness.
    from db.schema import game_source
    res = await session.execute(
        insert(game_source)
        .values(position_id=pos, user_id=user_id)
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())
    await session.execute(insert(card_source).values(
        card_id=cid, game_source_id=gs_id, is_primary_source=True,
    ))
    await session.commit()
    return cid


# ─── POST /cards — happy paths ────────────────────────────────────────────────


async def test_post_cards_creates_root_with_game_metadata(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4]SZ[19]PW[A]PB[B])",
            "num_moves": 10,
            "grading_parameter": {"data": {"default_visits": 200}},
            "game_metadata": {
                "player_white": "Alice",
                "player_black": "Bob",
                "description": "test root",
            },
            "tags": ["attack"],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "created"
    assert body["card_id"] > 0


async def test_post_cards_creates_branch_with_parent_card_id(client, session):
    await seed_user(session, user_id=ALICE_ID)
    parent_id = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4]C[branch])",
            "num_moves": 8,
            "parent_card_id": parent_id,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 201


# ─── POST /cards — 401 missing auth ───────────────────────────────────────────


async def test_post_cards_without_bearer_returns_401(client):
    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4])",
            "num_moves": 3,
            "game_metadata": {},
        },
    )
    assert response.status_code == 401


# ─── POST /cards — 422 wire-shape validation ──────────────────────────────────


async def test_post_cards_missing_raw_content_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/",
        json={
            "num_moves": 5,
            "game_metadata": {},
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_post_cards_with_both_parent_and_game_metadata_returns_422(
    client, session,
):
    """Mutual exclusion enforced by ``CardCreate``'s @model_validator."""
    await seed_user(session, user_id=ALICE_ID)
    parent_id = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4])",
            "num_moves": 3,
            "parent_card_id": parent_id,
            "game_metadata": {"description": "should be rejected"},
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_post_cards_with_neither_parent_nor_game_metadata_returns_422(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4])",
            "num_moves": 3,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_post_cards_legacy_sgf_field_is_rejected(client, session):
    """
    Item 34b commit 3: only ``raw_content`` is accepted; the legacy
    ``sgf`` alias is gone. Sending ``sgf=...`` without
    ``raw_content`` fails Pydantic validation with a clear field-
    level error.
    """
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/",
        json={
            "sgf": "(;FF[4])",  # legacy field
            "num_moves": 3,
            "game_metadata": {},
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


# ─── POST /cards — 404 cross-tenant parent (item 14) ─────────────────────────


async def test_post_cards_with_cross_tenant_parent_returns_404(client, session):
    """
    The 404-not-403 collapse: a parent_card_id owned by Bob is
    indistinguishable from a non-existent parent from Alice's view.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs_card = await _seed_card_with_root(session, user_id=BOB_ID)

    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4])",
            "num_moves": 3,
            "parent_card_id": bobs_card,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_post_cards_with_nonexistent_parent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4])",
            "num_moves": 3,
            "parent_card_id": 999_999,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


# ─── GET /cards/{id} — happy + 404 ────────────────────────────────────────────


async def test_get_card_returns_card_with_recall(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.get(
        f"/cards/{cid}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == cid
    assert "current_recall" in body
    assert "halflife_units" in body
    # Card-metadata inline-edit arc 1: tags surface unconditionally
    # on the read path. A card with no card_tag rows reports `[]`,
    # never null. ADR-0002: explicit non-nullable.
    assert body["tags"] == []


async def test_get_card_returns_tags_alphabetically(client, session):
    """
    Card-metadata inline-edit arc 1: the `tags` field carries the
    card's tag names, alphabetised. Deterministic order is the
    contract — the wire shape doesn't depend on tag-insertion
    order, which lets the frontend cache the response without
    re-sorting.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)
    await _attach_tags(
        session, card_id=cid, tag_names=["shape", "endgame", "joseki"]
    )

    response = await client.get(
        f"/cards/{cid}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json()["tags"] == ["endgame", "joseki", "shape"]


async def test_get_card_cross_tenant_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs_card = await _seed_card_with_root(session, user_id=BOB_ID)

    response = await client.get(
        f"/cards/{bobs_card}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_get_card_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.get(
        "/cards/999999", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


# ─── POST /cards/{id}/review — 422 / 404 ─────────────────────────────────────


async def test_review_score_length_mismatch_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.post(
        f"/cards/{cid}/review",
        json={"scores": [0.5]},  # card has num_moves=5, this has 1
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_review_score_out_of_range_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.post(
        f"/cards/{cid}/review",
        json={"scores": [0.5, 0.5, 0.5, 0.5, 1.5]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_review_missing_card_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/999999/review",
        json={"scores": [0.5, 0.5, 0.5, 0.5, 0.5]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_review_cross_tenant_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs_card = await _seed_card_with_root(session, user_id=BOB_ID)

    response = await client.post(
        f"/cards/{bobs_card}/review",
        json={"scores": [0.5, 0.5, 0.5, 0.5, 0.5]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_review_response_carries_tags(client, session):
    """
    Card-metadata inline-edit arc 1: tags travel on the response
    to POST /cards/{id}/review the same way they travel on GET.
    The frontend's review-flow ledger.put can swap the cached
    body without a follow-up GET.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)
    await _attach_tags(session, card_id=cid, tag_names=["tesuji"])

    response = await client.post(
        f"/cards/{cid}/review",
        json={"scores": [0.5, 0.5, 0.5, 0.5, 0.5]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json()["tags"] == ["tesuji"]


# ─── PATCH /cards/{id} — card-metadata inline-edit arc 2 ─────────────────────


async def _seed_card_with_grading_parameter(
    session: AsyncSession, *, user_id: int, grading_parameter: dict | None
) -> int:
    """
    Direct seed for a PATCH-target card with a configurable
    ``grading_parameter`` blob (the standard helper has no
    parameter for this).
    """
    pos = await _seed_position(session, content="(;FF[4]C[patch])")
    res = await session.execute(
        insert(card).values(
            num_moves=5, alpha=4.2, beta=4.2, t=2.0,
            user_id=user_id, normalized_position_id=pos,
            grading_parameter=grading_parameter, num_reviews=3,
        ).returning(card.c.id)
    )
    cid = int(res.scalar())
    from db.schema import game_source
    res = await session.execute(
        insert(game_source)
        .values(position_id=pos, user_id=user_id)
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())
    await session.execute(insert(card_source).values(
        card_id=cid, game_source_id=gs_id, is_primary_source=True,
    ))
    await session.commit()
    return cid


# Failure modes first (CLAUDE.md test-authoring posture).


async def test_patch_cross_tenant_returns_404(client, session):
    """The 404-not-403 collapse on the PATCH path."""
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs_card = await _seed_card_with_root(session, user_id=BOB_ID)

    response = await client.patch(
        f"/cards/{bobs_card}",
        json={"suspended": True},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_patch_nonexistent_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.patch(
        "/cards/999999",
        json={"suspended": True},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_patch_without_bearer_returns_401(client):
    response = await client.patch("/cards/1", json={"suspended": True})
    assert response.status_code == 401


async def test_patch_num_moves_zero_returns_422(client, session):
    """``num_moves`` must be a positive integer."""
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"num_moves": 0},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_patch_gamma_at_unit_boundary_returns_422(client, session):
    """``gamma`` is constrained to the open unit interval (0, 1)."""
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"grading_parameter": {"data": {"gamma": 1.0}}},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_patch_unknown_top_level_key_returns_422(client, session):
    """``CardPatch`` has ``extra="forbid"`` — unknown keys fail loudly."""
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"creation_date": "2020-01-01T00:00:00Z"},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_patch_unknown_grading_parameter_wrapper_key_returns_422(
    client, session,
):
    """``GradingParameterPatch`` wrapper also forbids extras."""
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"grading_parameter": {"data": {}, "other": 1}},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_patch_lineage_fields_not_admitted(client, session):
    """
    Lineage edits are out of scope per the dispatch's Ask 2 — the
    PATCH wire shape doesn't admit ``parent_card_id`` and
    ``extra="forbid"`` rejects it.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"parent_card_id": 1},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


# Happy paths.


async def test_patch_tags_full_replace_persists_and_returns(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)
    await _attach_tags(session, card_id=cid, tag_names=["old"])

    response = await client.patch(
        f"/cards/{cid}",
        json={"tags": ["new1", "new2"]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    # Response is CardWithRecall with the new (alphabetised) tag set.
    assert body["tags"] == ["new1", "new2"]
    assert "current_recall" in body

    # And the change persists.
    follow_up = await client.get(
        f"/cards/{cid}", headers=auth_header(ALICE_ID),
    )
    assert follow_up.json()["tags"] == ["new1", "new2"]


async def test_patch_tags_empty_list_wipes(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)
    await _attach_tags(session, card_id=cid, tag_names=["doomed"])

    response = await client.patch(
        f"/cards/{cid}",
        json={"tags": []},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json()["tags"] == []


async def test_patch_grading_parameter_merges_at_data_level(client, session):
    """
    Dispatch's "keys present overwrite, absent preserved" rule.
    Stored ``data`` keys not named in the patch survive untouched.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_grading_parameter(
        session,
        user_id=ALICE_ID,
        grading_parameter={
            "data": {
                "analysis_config": {"palette": "A"},
                "default_visits": 200,
            },
        },
    )

    response = await client.patch(
        f"/cards/{cid}",
        json={"grading_parameter": {"data": {"gamma": 0.9}}},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["grading_parameter"] == {
        "data": {
            "analysis_config": {"palette": "A"},
            "default_visits": 200,
            "gamma": 0.9,
        },
    }


async def test_patch_reset_prior_with_num_moves_is_atomic(client, session):
    """
    The settled CA-1 case from the dispatch: change ``num_moves`` AND
    reset the Ebisu prior in one request. Both effects observed on
    the same response body.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_grading_parameter(
        session, user_id=ALICE_ID, grading_parameter=None,
    )

    response = await client.patch(
        f"/cards/{cid}",
        json={"num_moves": 8, "reset_prior": True},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["num_moves"] == 8
    # config.EBISU_DEFAULT_MODEL is (3.0, 3.0, 1.0).
    assert body["alpha"] == 3.0
    assert body["beta"] == 3.0
    assert body["t"] == 1.0
    assert body["num_reviews"] == 0
    assert body["last_reviewed_at"] is None


async def test_patch_suspended_toggle(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={"suspended": True},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json()["suspended"] is True


async def test_patch_empty_body_is_no_op(client, session):
    """
    An empty patch returns the current card unchanged — the
    response shape is still ``CardWithRecall``.
    """
    await seed_user(session, user_id=ALICE_ID)
    cid = await _seed_card_with_root(session, user_id=ALICE_ID)

    response = await client.patch(
        f"/cards/{cid}",
        json={},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == cid
    assert "current_recall" in body
    assert "tags" in body
