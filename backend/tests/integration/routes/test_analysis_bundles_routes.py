"""
tests/integration/routes/test_analysis_bundles_routes.py

Route-layer tests for /analysis-bundles — the
``cross/analysis-persistence`` arc's HTTP surface.

Verified:

  - PUT happy path returns ``AnalysisBundleSummary``.
  - PUT with body exceeding the per-bundle cap → 413
    ``{kind: "bundle_too_large", request_bytes, cap_bytes, ...}``.
  - PUT that would push the user past the per-user quota → 413
    ``{kind: "user_quota_exceeded", current_bytes, quota_bytes, ...}``.
  - PUT with a v2 schema_version → 422 (Pydantic
    ``Literal[1]`` validator, Confirmation C2's gate).
  - GET happy + cross-tenant 404 + missing 404.
  - DELETE 204 idempotent.
  - LIST returns only the caller's bundles.
  - All routes 401 without bearer.

The per-bundle and per-user caps are large defaults (100 MB / 2 GB)
that aren't easily exercised through real bundle bodies. The tests
override the dependency factories to inject smaller caps for the
413 paths.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from api.dependencies import (
    get_analysis_bundle_repo,
    get_analysis_bundle_service,
)
from core.config import config
from repositories.analysis_bundle_repository import AnalysisBundleRepository
from services.analysis_bundle_service import AnalysisBundleService
from sqlalchemy.ext.asyncio import AsyncSession
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


def _bundle_dict(record_count: int = 2) -> dict:
    return {
        "schema_version": 1,
        "records": [
            {
                "config_hash": f"cfg-{i}",
                "node_id": f"node-{i}",
                "packet": {"score": i * 0.1},
            }
            for i in range(record_count)
        ],
    }


# ─── Happy path ───────────────────────────────────────────────────────────────


async def test_put_creates_bundle_and_returns_summary(client, session):
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()

    response = await client.put(
        f"/analysis-bundles/{board}",
        json=_bundle_dict(record_count=3),
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["board_id"] == str(board)
    assert body["record_count"] == 3
    assert body["stored_scheme"] == config.ANALYSIS_PERSISTENCE_WRITE_SCHEME
    assert body["stored_byte_size"] > 0


async def test_get_round_trips_a_persisted_bundle(client, session):
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()
    payload = _bundle_dict(record_count=2)

    await client.put(
        f"/analysis-bundles/{board}",
        json=payload,
        headers=auth_header(ALICE_ID),
    )

    response = await client.get(
        f"/analysis-bundles/{board}",
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == 1
    assert len(body["records"]) == 2
    assert body["records"][0]["config_hash"] == "cfg-0"


# ─── 422: schemaVersion gate ──────────────────────────────────────────────────


async def test_put_with_unknown_schema_version_returns_422(client, session):
    """
    AnalysisBundle.schema_version is ``Literal[1]``. A v2 bundle is
    a parse-time 422, not a runtime error — Confirmation C2 in the
    dispatch.
    """
    await seed_user(session, user_id=ALICE_ID)
    response = await client.put(
        f"/analysis-bundles/{uuid4()}",
        json={"schema_version": 2, "records": []},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


# ─── 413: per-bundle cap and per-user quota ──────────────────────────────────


async def test_put_with_oversized_bundle_returns_413_with_kind(
    client, test_db, session,
):
    """
    Per-bundle byte cap → 413 with structured detail discriminated
    by ``kind: "bundle_too_large"``. We override the service factory
    to inject a tiny cap; the route's per-bundle check raises before
    the adapter is touched.
    """
    await seed_user(session, user_id=ALICE_ID)

    # Override the service factory to use a 5-byte cap.
    async def _tiny_cap_service(repo=None) -> AnalysisBundleService:
        # Construct a real repo against the test database.
        async with test_db.session() as s:
            return AnalysisBundleService(
                repository=AnalysisBundleRepository(
                    s,
                    write_scheme="json",
                    user_quota_bytes=10 ** 9,
                ),
                bundle_max_bytes=5,
            )

    client._transport.app.dependency_overrides[
        get_analysis_bundle_service
    ] = _tiny_cap_service

    response = await client.put(
        f"/analysis-bundles/{uuid4()}",
        json=_bundle_dict(record_count=10),
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 413
    detail = response.json()["detail"]
    assert detail["kind"] == "bundle_too_large"
    assert detail["cap_bytes"] == 5
    assert detail["request_bytes"] > 5

    client._transport.app.dependency_overrides.clear()


async def test_put_exceeding_user_quota_returns_413_with_kind(
    client, test_db, session,
):
    """
    Per-user storage quota → 413 ``{kind: "user_quota_exceeded",
    current_bytes, quota_bytes, ...}``. Inject a tiny user quota so
    a normal-sized bundle exceeds it.
    """
    await seed_user(session, user_id=ALICE_ID)

    async def _tiny_quota_repo(db=None):
        async with test_db.session() as s:
            return AnalysisBundleRepository(
                s,
                write_scheme="json",
                user_quota_bytes=10,  # 10 bytes — any bundle blows past this
            )

    client._transport.app.dependency_overrides[
        get_analysis_bundle_repo
    ] = _tiny_quota_repo

    response = await client.put(
        f"/analysis-bundles/{uuid4()}",
        json=_bundle_dict(record_count=5),
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 413
    detail = response.json()["detail"]
    assert detail["kind"] == "user_quota_exceeded"
    assert detail["quota_bytes"] == 10
    assert "current_bytes" in detail

    client._transport.app.dependency_overrides.clear()


# ─── 404: cross-tenant get ────────────────────────────────────────────────────


async def test_get_cross_tenant_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    board = uuid4()
    await client.put(
        f"/analysis-bundles/{board}",
        json=_bundle_dict(),
        headers=auth_header(ALICE_ID),
    )

    response = await client.get(
        f"/analysis-bundles/{board}",
        headers=auth_header(BOB_ID),
    )
    assert response.status_code == 404


async def test_get_missing_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.get(
        f"/analysis-bundles/{uuid4()}",
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


# ─── DELETE ──────────────────────────────────────────────────────────────────


async def test_delete_existing_returns_204(client, session):
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()
    await client.put(
        f"/analysis-bundles/{board}",
        json=_bundle_dict(),
        headers=auth_header(ALICE_ID),
    )

    response = await client.delete(
        f"/analysis-bundles/{board}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 204
    # Bundle is gone.
    g = await client.get(
        f"/analysis-bundles/{board}", headers=auth_header(ALICE_ID),
    )
    assert g.status_code == 404


async def test_delete_missing_is_idempotent_204(client, session):
    """A delete against a non-existent board returns 204 silently."""
    await seed_user(session, user_id=ALICE_ID)
    response = await client.delete(
        f"/analysis-bundles/{uuid4()}",
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 204


async def test_delete_cross_tenant_does_not_remove(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    board = uuid4()
    await client.put(
        f"/analysis-bundles/{board}",
        json=_bundle_dict(),
        headers=auth_header(ALICE_ID),
    )

    # Bob deletes Alice's board: 204 silent no-op.
    bob_resp = await client.delete(
        f"/analysis-bundles/{board}", headers=auth_header(BOB_ID),
    )
    assert bob_resp.status_code == 204

    # Alice's bundle is still there.
    alice_get = await client.get(
        f"/analysis-bundles/{board}", headers=auth_header(ALICE_ID),
    )
    assert alice_get.status_code == 200


# ─── LIST ─────────────────────────────────────────────────────────────────────


async def test_list_returns_only_callers_summaries(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    a, b, c = uuid4(), uuid4(), uuid4()
    await client.put(
        f"/analysis-bundles/{a}",
        json=_bundle_dict(),
        headers=auth_header(ALICE_ID),
    )
    await client.put(
        f"/analysis-bundles/{b}",
        json=_bundle_dict(),
        headers=auth_header(ALICE_ID),
    )
    await client.put(
        f"/analysis-bundles/{c}",
        json=_bundle_dict(),
        headers=auth_header(BOB_ID),
    )

    alice = await client.get(
        "/analysis-bundles", headers=auth_header(ALICE_ID),
    )
    bob = await client.get(
        "/analysis-bundles", headers=auth_header(BOB_ID),
    )
    assert alice.status_code == 200
    assert bob.status_code == 200
    assert {s["board_id"] for s in alice.json()} == {str(a), str(b)}
    assert {s["board_id"] for s in bob.json()} == {str(c)}


async def test_list_empty_for_user_with_no_bundles(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.get(
        "/analysis-bundles", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json() == []


# ─── 401 surface ──────────────────────────────────────────────────────────────


async def test_routes_without_bearer_return_401(client):
    board = uuid4()
    payload = _bundle_dict()

    assert (await client.put(
        f"/analysis-bundles/{board}", json=payload,
    )).status_code == 401
    assert (await client.get(
        f"/analysis-bundles/{board}",
    )).status_code == 401
    assert (await client.delete(
        f"/analysis-bundles/{board}",
    )).status_code == 401
    assert (await client.get("/analysis-bundles")).status_code == 401


# ─── v2 wire shape: route-level dispatch ─────────────────────────────────────


import base64


def _v2_bundle_dict(*, record_count: int = 3,
                    uncompressed: int = 8192) -> dict:
    return {
        "wire_format": "v2",
        "schema_version": 1,
        "format_descriptor": {"scheme": "ofb-q4-q8", "version": 1},
        "record_count": record_count,
        "uncompressed_byte_size": uncompressed,
        "data_b64": base64.b64encode(b"opaque SPA-encoded bytes").decode("ascii"),
    }


async def test_put_v2_bundle_creates_row_and_returns_v2_summary(
    client, session,
):
    """A v2 PUT payload is accepted; the summary surfaces the new
    fields populated."""
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()

    response = await client.put(
        f"/analysis-bundles/{board}",
        json=_v2_bundle_dict(record_count=4, uncompressed=9999),
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["record_count"] == 4
    assert body["stored_scheme"] == "v2-brotli"
    assert body["uncompressed_byte_size"] == 9999
    assert body["format_descriptor"] == {"scheme": "ofb-q4-q8", "version": 1}


async def test_get_v2_stored_bundle_returns_v2_wire_shape(client, session):
    """A bundle written via the v2 path returns its v2 shape on
    GET: ``wire_format='v2'`` + the SPA's descriptor + the
    round-tripped data_b64."""
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()
    payload = _v2_bundle_dict()
    await client.put(
        f"/analysis-bundles/{board}",
        json=payload,
        headers=auth_header(ALICE_ID),
    )

    response = await client.get(
        f"/analysis-bundles/{board}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["wire_format"] == "v2"
    assert body["format_descriptor"] == payload["format_descriptor"]
    assert body["record_count"] == payload["record_count"]
    assert body["uncompressed_byte_size"] == payload["uncompressed_byte_size"]
    # Round-tripped bytes: base64 decode round-trips to the original
    # raw payload regardless of brotli's middle.
    assert base64.b64decode(body["data_b64"]) == \
        base64.b64decode(payload["data_b64"])


async def test_get_v1_stored_bundle_returns_v1_wire_shape(client, session):
    """A v1 bundle returns ``wire_format='v1'`` on GET — the
    backend's response is discriminated by what's stored, not by
    what's requested."""
    await seed_user(session, user_id=ALICE_ID)
    board = uuid4()
    await client.put(
        f"/analysis-bundles/{board}",
        json=_bundle_dict(record_count=2),
        headers=auth_header(ALICE_ID),
    )

    response = await client.get(
        f"/analysis-bundles/{board}", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["wire_format"] == "v1"
    assert len(body["records"]) == 2


async def test_put_v2_with_unknown_wire_format_returns_422(client, session):
    """An unknown ``wire_format`` value is a 422 — neither v1 nor
    v2 accepts it."""
    await seed_user(session, user_id=ALICE_ID)
    payload = _v2_bundle_dict()
    payload["wire_format"] = "v99"
    response = await client.put(
        f"/analysis-bundles/{uuid4()}",
        json=payload,
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_put_v2_missing_format_descriptor_returns_422(client, session):
    """Required v2 fields raise 422 when absent."""
    await seed_user(session, user_id=ALICE_ID)
    payload = _v2_bundle_dict()
    del payload["format_descriptor"]
    response = await client.put(
        f"/analysis-bundles/{uuid4()}",
        json=payload,
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_list_summaries_includes_v2_fields_for_v2_bundles(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)
    a, b = uuid4(), uuid4()
    # one v1, one v2
    await client.put(
        f"/analysis-bundles/{a}",
        json=_bundle_dict(record_count=1),
        headers=auth_header(ALICE_ID),
    )
    await client.put(
        f"/analysis-bundles/{b}",
        json=_v2_bundle_dict(record_count=2, uncompressed=5000),
        headers=auth_header(ALICE_ID),
    )

    response = await client.get(
        "/analysis-bundles", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    by_id = {s["board_id"]: s for s in response.json()}
    v1 = by_id[str(a)]
    v2 = by_id[str(b)]
    # v1 summary has the new fields as null
    assert v1["uncompressed_byte_size"] is None
    assert v1["format_descriptor"] is None
    # v2 summary has them populated
    assert v2["uncompressed_byte_size"] == 5000
    assert v2["stored_scheme"] == "v2-brotli"
