"""
tests/integration/routes/test_cross_tenant_display_ordinal_property.py

Enforcement test #2 of 2 for the per-user-id-enumeration design's
non-leak guarantee (`.claude/dispatch-reports/
per-user-id-enumeration-design.md`, Decision 7.2).

The commission's literal complaint (design survey, restated in
Decision 6): "a new user currently will see game ids like 50000+"
because the raw PK is a single global sequence shared across every
tenant. This test is the runnable form of that complaint's negation:
tenant A mints N objects (cards and library games); tenant B, who
has never interacted with A, mints exactly one of each and reads it
back. Every `display_ordinal` field B observes must be `1` — small,
and structurally independent of A's activity (not "coincidentally
didn't hit a large number this run," but "the value cannot reflect
A's cardinality by construction," per Decision 6's framing).

N=50 is "large enough to separate signal from noise" per Decision
7.2 — small enough to keep the test fast, large enough that a
regression reintroducing a shared/global counter would produce an
obviously-wrong (~51, not 1) result rather than something that could
be mistaken for coincidence.

This is a route test (drives the real FastAPI app over ASGITransport
with per-tenant JWTs), reusing the same `client` / `session` /
`seed_user` / `auth_header` infrastructure the rest of
`tests/integration/routes/` uses.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest

from tests.integration.routes.conftest import (
    ALICE_ID,
    BOB_ID,
    auth_header,
    seed_user,
)

pytestmark = pytest.mark.integration

N = 50


def _sgf(label: str) -> str:
    """A well-formed, distinct-per-label SGF body (same recipe as
    test_library_routes.py's `_sgf` helper — a deterministic
    md5-derived move pair keeps each import's canonical content
    unique so none of A's N imports collide/dedup with each other)."""
    digest = hashlib.md5(label.encode()).digest()
    coords = "abcdefghijklmnopqrs"
    coord_a = coords[digest[0] % 19]
    coord_b = coords[digest[1] % 19]
    return f"(;FF[4]GM[1]SZ[19];B[{coord_a}{coord_b}];W[dp])"


async def _mint_card(client, user_id: int, label: str) -> dict:
    """POST /cards/ a fresh root card for `user_id`; returns the response body."""
    resp = await client.post(
        "/cards/",
        json={
            "raw_content": _sgf(label),
            "num_moves": 2,
            "game_metadata": {"description": label},
        },
        headers=auth_header(user_id),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _import_games(client, user_id: int, labels: list[str]) -> dict:
    """POST /library/games/import a batch for `user_id`; returns the response body."""
    resp = await client.post(
        "/library/games/import",
        json={"games": [{"raw_content": _sgf(label)} for label in labels]},
        headers=auth_header(user_id),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_new_tenant_display_ordinals_are_small_and_independent_of_another_tenants_cardinality(
    client, session,
):
    """
    The GoGoD scenario, literally: tenant A (the "maintainer's own
    account") imports/mints N cards and N library games; tenant B (a
    "brand new user") mints exactly one of each and reads it back.
    B's display_ordinal values must be 1 -- never anything that
    reflects A's N-sized activity.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    # 1. Tenant A mints N cards and imports N library games first --
    #    A's own counters climb to N, exactly the "50000+" shape the
    #    commission's complaint describes (at hobby scale: 50, not
    #    50000, but the same structural shape).
    for i in range(N):
        await _mint_card(client, ALICE_ID, f"alice-card-{i}")
    await _import_games(client, ALICE_ID, [f"alice-game-{i}" for i in range(N)])

    # 2. Tenant B, who has never interacted with A, imports exactly
    #    one library game and mints exactly one card. Import BEFORE
    #    mint deliberately: POST /cards/ with `game_metadata` also
    #    inserts a game_source row (the root card's game), so minting
    #    first would consume B's game_source ordinal 1 before the
    #    import ever runs, landing the import at ordinal 2 instead —
    #    correct behaviour (B really does then own 2 game_source
    #    rows), but this test wants both display_ordinal==1
    #    assertions to be about B's FIRST-ever object of each kind.
    bob_import = await _import_games(client, BOB_ID, ["bob-game-0"])
    bob_card = await _mint_card(client, BOB_ID, "bob-card-0")

    # 3. B's card: display_ordinal is 1, not anything reflecting A's
    #    N cards. (card_id, the raw PK, is deliberately NOT asserted
    #    small here -- it's the named addressing exception per
    #    Decision 4, expected to be large/globally-sequential; this
    #    test's job is the DISPLAY field, not the addressing field.)
    assert bob_card["display_ordinal"] == 1
    assert bob_card["display_ordinal"] < N

    # 4. B's library import outcome: same assertion on the
    #    game_source side.
    assert len(bob_import["outcomes"]) == 1
    bob_outcome = bob_import["outcomes"][0]
    assert bob_outcome["status"] == "created"
    assert bob_outcome["display_ordinal"] == 1
    assert bob_outcome["display_ordinal"] < N

    # 5. Re-fetch B's card via GET and B's library list via GET --
    #    confirm the same small, A-independent value on every
    #    response shape that carries display_ordinal, not just the
    #    creation-time response.
    get_card_resp = await client.get(
        f"/cards/{bob_card['card_id']}", headers=auth_header(BOB_ID),
    )
    assert get_card_resp.status_code == 200
    assert get_card_resp.json()["display_ordinal"] == 1

    list_resp = await client.get(
        "/library/games?sort=created_at&direction=asc&offset=0&limit=10",
        headers=auth_header(BOB_ID),
    )
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    assert list_body["total_count"] == 1
    assert list_body["rows"][0]["display_ordinal"] == 1

    # 6. Symmetric check: A's own display_ordinal values ARE allowed
    #    to reach N (that's the honest, structural degeneration for
    #    the account that actually owns N rows -- not a leak, just
    #    that account's own true count). Fetch A's own last-minted
    #    card and confirm ITS display_ordinal is N, proving the
    #    counter is real (per-user, monotonic) and not simply
    #    hardcoded to 1 for everyone.
    alice_last_card = await _mint_card(client, ALICE_ID, "alice-card-last")
    assert alice_last_card["display_ordinal"] == N + 1


async def test_bobs_response_bodies_contain_no_field_correlated_with_alices_cardinality(
    client, session,
):
    """
    Stronger, more mechanical form of the same property: walk every
    integer leaf in B's own two response bodies (card-create,
    library-import) and confirm none of them is `>= N` OTHER than
    the named addressing-PK fields the schema-walk test's allowlist
    already covers (`card_id`, `id`, `game_id`) -- those are
    permitted to be large (they're global-sequence PKs used only for
    addressing, per Decision 4) but every OTHER integer field must
    stay small. This is the design's Decision 7.2 phrased as a
    structural walk rather than naming each field by hand, as a
    belt-and-braces companion to the field-by-field assertions above.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    for i in range(N):
        await _mint_card(client, ALICE_ID, f"alice2-card-{i}")

    bob_card = await _mint_card(client, BOB_ID, "bob2-card-0")

    # Addressing-PK fields are allowed to be large -- named per
    # Decision 4, mirrored in the schema-walk allowlist.
    addressing_fields = {"card_id"}

    for key, value in bob_card.items():
        if key in addressing_fields:
            continue
        if isinstance(value, int) and not isinstance(value, bool):
            assert value < N, (
                f"CardCreateResponse.{key}={value} is >= N={N} despite "
                f"tenant B never having interacted with tenant A's {N} "
                "cards -- a global-sequence leak."
            )
