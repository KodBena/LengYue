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

from pathlib import Path

import pytest

from api.dependencies import STATIC_RESOURCE_REGISTRY, get_resource_repo
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


# ─── Real filesystem registry (packaging regression, ledger rows 806/807) ─────
#
# Everything above overrides get_resource_repo with an in-memory fake — none
# of it would have caught the Docker packaging defect, where the *real*
# registry pointed at a file that got swept out of the build context by
# .dockerignore and (even if copied) would have been shadowed by the
# cards_data volume mount at /app/data. These tests deliberately do NOT
# override the dependency: they exercise the production
# STATIC_RESOURCE_REGISTRY + FilesystemResourceRepository wiring exactly as
# `api.dependencies.get_resource_service` composes it, against the real file
# on disk at its post-relocation path
# (backend/resources_data/visit_distribution.json). This only passes when
# pytest's CWD is the backend/ root (see pytest.ini's relative `testpaths`),
# matching the same CWD-relative resolution the running app uses.


async def test_visit_distribution_serves_real_content_from_resources_data(client):
    """
    GET /resources/visit-distribution, undoctored: proves the shipped
    resource is actually reachable from backend/resources_data/ — the
    property that silently broke in Docker before the relocation fix.
    """
    response = await client.get("/resources/visit-distribution")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "visit-distribution"
    content = body["content"]
    assert isinstance(content, dict)
    assert "quantiles" in content
    quantiles = content["quantiles"]
    assert isinstance(quantiles, list)
    assert len(quantiles) > 1
    assert quantiles == sorted(quantiles)


async def test_visit_distribution_is_listed_by_the_real_registry(client):
    response = await client.get("/resources")
    assert response.status_code == 200
    assert "visit-distribution" in response.json()


def test_registered_resource_paths_are_not_under_the_volume_mounted_data_dir():
    """
    Packaging-level guard (commission acceptance criterion 4): a shipped
    resource's registered path must never resolve under `data/` — the
    directory `.gitignore`/`.dockerignore` correctly treat as mutable,
    per-installation state, and that `docker-compose.yml` mounts the
    `cards_data` named volume over at `/app/data`. A resource registered
    there would be (a) excluded from the Docker build context and (b)
    shadowed by the volume mount even if it weren't. This is a plain
    assertion over the registry's declared paths, not an
    end-to-end HTTP check — it exists so a future resource added under
    the wrong directory fails fast in CI rather than 404ing silently
    only inside a container.
    """
    for name, path in STATIC_RESOURCE_REGISTRY.items():
        assert Path("data") not in path.parents and path.parts[0] != "data", (
            f"resource {name!r} is registered under a 'data/'-rooted path "
            f"({path}) — this directory is excluded from the Docker build "
            f"context (.dockerignore) and shadowed by the cards_data volume "
            f"mount at /app/data; shipped resources belong in "
            f"resources_data/ instead"
        )
