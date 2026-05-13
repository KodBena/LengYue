"""
tests/unit/services/test_card_service.py

Service-level tests for ``CardService.create_card`` driven through
``tests/fakes`` Port implementations. Closes issue #135 — the
schema/service contract regression that surfaced when item-34b
commit-3 tightened ``CardCreate`` while the service still read
``data.sgf`` and ``data.default_visits``.

The service is covered along three axes:

1. Lineage — root mint (with game_metadata) and branch mint
   (with parent_card_id), plus the parent-ownership precheck
   (cross-tenant 404).

2. Wire-shape regression — the canonical ``CardCreate`` body
   (``raw_content``, ``num_moves``, ``grading_parameter`` carrying
   the per-card analysis blob) drives the service end-to-end. A
   future refactor that re-introduces ``data.sgf`` or
   ``data.default_visits`` access would fail this test.

3. Failure-mode coverage — normalizer ``ValueError`` translates to
   ``InvalidInputError`` per item 30b; cross-tenant parent raises
   ``CardNotFoundError`` per item 14; tag attachment is idempotent.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from domain.auth import UserId
from domain.errors import CardNotFoundError, InvalidInputError
from schemas.card import (
    CardCreate,
    CardPatch,
    GameSourceCreate,
    GradingParameterData,
    GradingParameterPatch,
)
from services.card_service import CardService
from tests.fakes import FakeCardRepository, FakeNormalizer

pytestmark = pytest.mark.unit


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_service() -> tuple[CardService, FakeCardRepository, FakeNormalizer]:
    repo = FakeCardRepository()
    normalizer = FakeNormalizer()
    svc = CardService(
        repository=repo,
        normalizer=normalizer,
        read_repository=repo,
    )
    return svc, repo, normalizer


ALICE = UserId(1)
BOB = UserId(2)


# ─── Wire-shape regression (issue #135) ───────────────────────────────────────


async def test_create_card_root_with_canonical_post_34b_shape():
    """
    Issue #135 regression: a CardCreate carrying the canonical
    post-34b shape (``raw_content`` + ``grading_parameter`` with the
    per-card analysis blob, no top-level ``sgf`` or
    ``default_visits``) drives ``CardService.create_card`` end-to-end
    without an AttributeError.

    A future refactor that reads ``data.sgf`` or
    ``data.default_visits`` directly on the ``CardCreate`` would fail
    here — Pydantic v2 raises on unknown attribute access by default.
    """
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {"white": "Alice", "black": "Bob"})

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=10,
            grading_parameter={"data": {"default_visits": 200, "gamma": 0.9}},
            game_metadata=GameSourceCreate(
                player_white=None, player_black=None, description="test",
            ),
            tags=["attack"],
        ),
        user_id=ALICE,
    )

    card = await repo.get_card_by_id(card_id, user_id=ALICE)
    assert card is not None
    assert card.num_moves == 10
    assert card.grading_parameter == {
        "data": {"default_visits": 200, "gamma": 0.9},
    }


# ─── Lineage: root mint ───────────────────────────────────────────────────────


async def test_create_card_root_creates_card_position_and_game_source():
    """
    A root mint creates: a normalized_position row, a game_source
    row stamped with the caller's user_id (item 24), and a
    card_source row pointing at the game_source (root linkage).
    """
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata(
        "(;FF[4])", {"white": "Alice", "black": "Bob"}
    )

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(
                player_white="Alice",
                player_black="Bob",
                description="root mint",
            ),
        ),
        user_id=ALICE,
    )

    # Normalized position created.
    assert len(repo.positions) == 1
    # Game source created and stamped with the caller's user_id.
    assert len(repo.game_sources) == 1
    gs = list(repo.game_sources.values())[0]
    assert gs["user_id"] == int(ALICE)
    assert gs["player_white"] == "Alice"
    assert gs["player_black"] == "Bob"
    # Lineage: the card links to the game_source, not a parent card.
    parent_card_id, game_source_id = repo.card_sources[card_id]
    assert parent_card_id is None
    assert game_source_id == list(repo.game_sources.keys())[0]


async def test_create_card_root_falls_back_to_normalizer_metadata_for_player_names():
    """
    When the wire body's game_metadata leaves player_white /
    player_black as None, the service falls back to the
    normalizer-extracted metadata. Item 30b's authoring choice.
    """
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata(
        "(;FF[4]PW[NormalizerWhite]PB[NormalizerBlack])",
        {"white": "NormalizerWhite", "black": "NormalizerBlack"},
    )

    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4]PW[NormalizerWhite]PB[NormalizerBlack])",
            num_moves=3,
            # No player_white / player_black on the wire body.
            game_metadata=GameSourceCreate(),
        ),
        user_id=ALICE,
    )

    gs = list(repo.game_sources.values())[0]
    assert gs["player_white"] == "NormalizerWhite"
    assert gs["player_black"] == "NormalizerBlack"


# ─── Lineage: branch mint with parent-ownership precheck (item 14) ───────────


async def test_create_card_branch_with_owned_parent_succeeds():
    """A branch under a parent the caller owns succeeds."""
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    parent_id = repo.seed_card(user_id=int(ALICE))

    branch_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            parent_card_id=parent_id,
        ),
        user_id=ALICE,
    )

    # Branch links to the parent, not a game_source.
    parent_card_id, game_source_id = repo.card_sources[branch_id]
    assert parent_card_id == parent_id
    assert game_source_id is None


async def test_create_card_branch_with_cross_tenant_parent_raises_card_not_found():
    """
    Item 14: parent-ownership precheck raises CardNotFoundError when
    the parent_card_id refers to a card owned by a different
    tenant. The route maps this to 404 — the 404-not-403 collapse.
    """
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    bobs_card = repo.seed_card(user_id=int(BOB))

    with pytest.raises(CardNotFoundError):
        await svc.create_card(
            CardCreate(
                raw_content="(;FF[4])",
                num_moves=5,
                parent_card_id=bobs_card,
            ),
            user_id=ALICE,
        )

    # No card was inserted on the failed precheck.
    assert all(
        repo.user_id_by_card[cid] != int(ALICE)
        for cid in repo.cards.keys()
    )


async def test_create_card_branch_with_nonexistent_parent_raises_card_not_found():
    """A parent_card_id that doesn't exist raises the same error."""
    svc, _repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    with pytest.raises(CardNotFoundError):
        await svc.create_card(
            CardCreate(
                raw_content="(;FF[4])",
                num_moves=5,
                parent_card_id=999_999,
            ),
            user_id=ALICE,
        )


# ─── Failure modes ────────────────────────────────────────────────────────────


async def test_create_card_normalizer_value_error_translates_to_invalid_input():
    """
    Item 30b: the normalizer's ``ValueError`` is translated to
    ``InvalidInputError`` so the route's 422 axis handles it.
    The translation is the service's responsibility — a future
    refactor that lets ``ValueError`` escape past the service
    boundary would fail here.
    """
    svc, _repo, normalizer = _make_service()
    normalizer.raises_for("malformed input", "not a real SGF")

    with pytest.raises(InvalidInputError, match=r"not a real SGF"):
        await svc.create_card(
            CardCreate(
                raw_content="malformed input",
                num_moves=5,
                game_metadata=GameSourceCreate(),
            ),
            user_id=ALICE,
        )


# ─── Tag attachment ───────────────────────────────────────────────────────────


async def test_create_card_attaches_tags_when_supplied():
    """Tags listed on the wire body are attached after the card is inserted."""
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(),
            tags=["attack", "opening", "joseki"],
        ),
        user_id=ALICE,
    )

    assert repo.tags[card_id] == ["attack", "joseki", "opening"]


async def test_create_card_with_empty_tag_list_does_not_call_attach_tags():
    """An empty tag list is a no-op (matches the adapter's early return)."""
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(),
            tags=[],
        ),
        user_id=ALICE,
    )

    assert card_id not in repo.tags or repo.tags[card_id] == []


# ─── Game-source dedup (client_game_id) ───────────────────────────────────────


async def test_create_card_with_client_game_id_creates_game_source_on_first_mint():
    """
    Game-source dedup: first mint with a client_game_id creates a
    fresh game_source row keyed on (user_id, client_game_id).
    """
    from uuid import uuid4

    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    cgid = uuid4()
    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(
                client_game_id=cgid,
                player_white="Alice",
                description="first mint",
            ),
        ),
        user_id=ALICE,
    )

    assert (int(ALICE), cgid) in repo.client_id_to_gs
    gs_id = repo.client_id_to_gs[(int(ALICE), cgid)]
    assert repo.game_sources[gs_id]["description"] == "first mint"


async def test_create_card_with_client_game_id_returns_existing_game_source_on_second_mint():
    """
    First-mint-wins: a second mint with the same (user_id,
    client_game_id) returns the existing game_source id and
    leaves its metadata intact (incoming description ignored).
    """
    from uuid import uuid4

    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    cgid = uuid4()

    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(
                client_game_id=cgid,
                description="first mint",
            ),
        ),
        user_id=ALICE,
    )
    first_gs_id = repo.client_id_to_gs[(int(ALICE), cgid)]

    # Second mint, different metadata, same client_game_id:
    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(
                client_game_id=cgid,
                description="DIFFERENT — should be ignored",
            ),
        ),
        user_id=ALICE,
    )

    # Same game_source id — no second row created.
    assert repo.client_id_to_gs[(int(ALICE), cgid)] == first_gs_id
    # Original metadata preserved.
    assert repo.game_sources[first_gs_id]["description"] == "first mint"


async def test_create_card_with_same_client_game_id_across_tenants_creates_distinct_rows():
    """
    Cross-tenant uniqueness: two users carrying the same
    client_game_id (astronomically unlikely with v4 UUIDs but
    possible) get distinct game_source rows. The partial unique
    index is per (user_id, client_game_id), not per
    client_game_id alone.
    """
    from uuid import uuid4

    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    cgid = uuid4()

    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(client_game_id=cgid),
        ),
        user_id=ALICE,
    )
    alice_gs = repo.client_id_to_gs[(int(ALICE), cgid)]

    await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(client_game_id=cgid),
        ),
        user_id=BOB,
    )
    bob_gs = repo.client_id_to_gs[(int(BOB), cgid)]

    assert alice_gs != bob_gs


# ─── Tenancy stamp ────────────────────────────────────────────────────────────


async def test_create_card_stamps_user_id_on_inserted_card():
    """The created card row carries the caller's user_id (item 14)."""
    svc, repo, normalizer = _make_service()
    normalizer.set_metadata("(;FF[4])", {})

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=5,
            game_metadata=GameSourceCreate(),
        ),
        user_id=ALICE,
    )

    assert repo.user_id_by_card[card_id] == int(ALICE)
    # And: the read Port honors the tenant boundary on this card.
    assert await repo.get_card_by_id(card_id, user_id=ALICE) is not None
    assert await repo.get_card_by_id(card_id, user_id=BOB) is None


# ─── Card-metadata inline-edit arc 2 — update_card_metadata ───────────────────


async def _seed_card_for_patch(
    repo: FakeCardRepository,
    *,
    user_id: UserId,
    num_moves: int = 5,
    grading_parameter: dict | None = None,
    alpha: float = 4.2,
    beta: float = 4.2,
    t: float = 2.0,
    num_reviews: int = 3,
    suspended: bool = False,
) -> int:
    """
    Direct seed for PATCH-target cards. Uses ``seed_card`` plus a
    couple of post-hoc adjustments the seeder doesn't expose (a
    non-default alpha so ``reset_prior`` is visibly distinct from
    the seeded state).
    """
    from datetime import datetime, timezone
    cid = repo.seed_card(
        user_id=int(user_id),
        num_moves=num_moves,
        alpha=alpha,
        beta=beta,
        t=t,
        num_reviews=num_reviews,
        suspended=suspended,
        grading_parameter=grading_parameter,
        last_reviewed_at=datetime.now(timezone.utc),
    )
    return cid


# ─── Failure modes: cross-tenant + non-existent ───────────────────────────────


async def test_update_card_metadata_cross_tenant_raises_not_found():
    """
    Cross-tenant ``card_id`` surfaces as ``CardNotFoundError`` —
    the route maps to 404 (404-not-403 collapse).
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=BOB)

    with pytest.raises(CardNotFoundError):
        await svc.update_card_metadata(
            cid, CardPatch(suspended=True), user_id=ALICE
        )


async def test_update_card_metadata_nonexistent_raises_not_found():
    svc, _, _ = _make_service()

    with pytest.raises(CardNotFoundError):
        await svc.update_card_metadata(
            999_999, CardPatch(suspended=True), user_id=ALICE
        )


# ─── Happy paths: per-field semantics ─────────────────────────────────────────


async def test_update_card_metadata_tags_full_replace():
    """
    ``patch.tags`` overwrites the tag set wholesale. Existing tags
    not in the new list are removed.
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE)
    await repo.attach_tags(cid, ["joseki", "old"])

    updated = await svc.update_card_metadata(
        cid, CardPatch(tags=["endgame", "shape"]), user_id=ALICE
    )

    assert updated.tags == ["endgame", "shape"]
    # The fake's read Port re-derives tags from self.tags; verify
    # the underlying state too so a regression that leaks the old
    # set is caught.
    assert repo.tags[cid] == ["endgame", "shape"]


async def test_update_card_metadata_tags_empty_wipes():
    """``tags=[]`` is the explicit wipe — distinct from ``None``."""
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE)
    await repo.attach_tags(cid, ["existing"])

    updated = await svc.update_card_metadata(
        cid, CardPatch(tags=[]), user_id=ALICE
    )

    assert updated.tags == []


async def test_update_card_metadata_tags_absent_preserves():
    """A patch with no ``tags`` field leaves the stored tags alone."""
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE)
    await repo.attach_tags(cid, ["preserved"])

    updated = await svc.update_card_metadata(
        cid, CardPatch(num_moves=8), user_id=ALICE
    )

    assert updated.tags == ["preserved"]


async def test_update_card_metadata_num_moves_overwrite():
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE, num_moves=5)

    updated = await svc.update_card_metadata(
        cid, CardPatch(num_moves=12), user_id=ALICE
    )

    assert updated.num_moves == 12


async def test_update_card_metadata_suspended_toggle():
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE, suspended=False)

    updated = await svc.update_card_metadata(
        cid, CardPatch(suspended=True), user_id=ALICE
    )

    assert updated.suspended is True


async def test_update_card_metadata_grading_parameter_merges_data():
    """
    JSON-merge-patch at the ``data`` key level: stored ``data`` keys
    not named in the patch survive; named keys overwrite.
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(
        repo,
        user_id=ALICE,
        grading_parameter={
            "data": {"analysis_config": {"palette": "A"}, "default_visits": 200},
        },
    )

    updated = await svc.update_card_metadata(
        cid,
        CardPatch(
            grading_parameter=GradingParameterPatch(
                data=GradingParameterData(gamma=0.9),
            ),
        ),
        user_id=ALICE,
    )

    # gamma added; analysis_config + default_visits preserved.
    assert updated.grading_parameter == {
        "data": {
            "analysis_config": {"palette": "A"},
            "default_visits": 200,
            "gamma": 0.9,
        },
    }


async def test_update_card_metadata_grading_parameter_overwrites_collision():
    """A patched ``data`` key with the same name overwrites."""
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(
        repo,
        user_id=ALICE,
        grading_parameter={"data": {"gamma": 0.5}},
    )

    updated = await svc.update_card_metadata(
        cid,
        CardPatch(
            grading_parameter=GradingParameterPatch(
                data=GradingParameterData(gamma=0.95),
            ),
        ),
        user_id=ALICE,
    )

    assert updated.grading_parameter["data"]["gamma"] == 0.95


async def test_update_card_metadata_grading_parameter_constructs_when_stored_is_null():
    """
    The stored ``grading_parameter`` may be ``None``. The patch's
    ``data`` becomes the new wrapper's data.
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(repo, user_id=ALICE, grading_parameter=None)

    updated = await svc.update_card_metadata(
        cid,
        CardPatch(
            grading_parameter=GradingParameterPatch(
                data=GradingParameterData(gamma=0.8),
            ),
        ),
        user_id=ALICE,
    )

    assert updated.grading_parameter == {"data": {"gamma": 0.8}}


async def test_update_card_metadata_reset_prior_resets_bayesian_state():
    """
    ``reset_prior=True`` resets (α, β, t), clears ``last_reviewed_at``,
    and zeroes ``num_reviews``. Independent of any other patch field.
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(
        repo, user_id=ALICE, alpha=10.0, beta=10.0, t=5.0, num_reviews=7,
    )

    updated = await svc.update_card_metadata(
        cid, CardPatch(reset_prior=True), user_id=ALICE
    )

    # config.EBISU_DEFAULT_MODEL is (3.0, 3.0, 1.0).
    assert (updated.alpha, updated.beta, updated.t) == (3.0, 3.0, 1.0)
    assert updated.last_reviewed_at is None
    assert updated.num_reviews == 0


async def test_update_card_metadata_reset_prior_atomic_with_num_moves():
    """
    The user's authority case from the dispatch: change ``num_moves``
    AND reset the prior in a single PATCH. Both effects observed on
    the same returned Card.
    """
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(
        repo, user_id=ALICE, num_moves=5, num_reviews=4,
    )

    updated = await svc.update_card_metadata(
        cid,
        CardPatch(num_moves=8, reset_prior=True),
        user_id=ALICE,
    )

    assert updated.num_moves == 8
    assert updated.num_reviews == 0
    assert (updated.alpha, updated.beta, updated.t) == (3.0, 3.0, 1.0)


async def test_update_card_metadata_empty_patch_is_no_op():
    """A patch with no fields set returns the current card unchanged."""
    svc, repo, _ = _make_service()
    cid = await _seed_card_for_patch(
        repo, user_id=ALICE, num_moves=5, num_reviews=3, alpha=4.2,
    )

    updated = await svc.update_card_metadata(
        cid, CardPatch(), user_id=ALICE
    )

    assert updated.num_moves == 5
    assert updated.num_reviews == 3
    assert updated.alpha == 4.2
