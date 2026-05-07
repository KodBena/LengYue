"""
tests/integration/routes/test_resources_routes.py

Route-layer tests for /resources and /resources/{name}.

The resources router is auth-free (static-deployment-data
endpoint). The default registry in
``api.dependencies.STATIC_RESOURCE_REGISTRY`` references files on
disk; these tests override the dependency factory so the route
serves a known in-memory dictionary.

Verified:

  - GET /resources returns the registered names sorted.
  - GET /resources/{name} returns ``{name, content}`` envelope.
  - GET /resources/{missing} returns 404.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from api.dependencies import get_resource_repo
from tests.fakes import FakeStaticResourceRepository

pytestmark = pytest.mark.integration


def _override_resources(client, registry: dict) -> None:
    fake = FakeStaticResourceRepository(registry)

    async def _factory():
        return fake

    client._transport.app.dependency_overrides[get_resource_repo] = _factory


# ─── List ─────────────────────────────────────────────────────────────────────


async def test_list_resources_returns_sorted_names(client):
    _override_resources(client, {
        "zoo": [1, 2],
        "alpha": {"k": "v"},
        "marlin": "data",
    })

    response = await client.get("/resources")
    assert response.status_code == 200
    assert response.json() == ["alpha", "marlin", "zoo"]


async def test_list_resources_empty_for_empty_registry(client):
    _override_resources(client, {})
    response = await client.get("/resources")
    assert response.status_code == 200
    assert response.json() == []


# ─── Fetch ────────────────────────────────────────────────────────────────────


async def test_get_resource_returns_envelope(client):
    _override_resources(client, {"visit-distribution": {"buckets": [1, 2]}})

    response = await client.get("/resources/visit-distribution")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "visit-distribution"
    assert body["content"] == {"buckets": [1, 2]}


async def test_get_resource_unknown_name_returns_404(client):
    _override_resources(client, {"known": 1})
    response = await client.get("/resources/unknown")
    assert response.status_code == 404
