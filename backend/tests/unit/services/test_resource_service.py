"""
tests/unit/services/test_resource_service.py

Service-level tests for ``ResourceService`` driven through
``FakeStaticResourceRepository``.

The service is deliberately thin (its docstring spells this out:
"the service is a boundary, not a calculator"), so the tests are
modest:

  - ``get`` wraps the Port output in the ``ResourceResponse``
    envelope, echoing the input ``name``.
  - ``get`` propagates ``ResourceNotFoundError`` from the Port —
    no swallowing, no fallback. The route maps to 404 via the
    existing NotFoundError handler.
  - ``list_names`` is a sorted pass-through.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from domain.errors import ResourceNotFoundError
from domain.resource import ResourceResponse
from services.resource_service import ResourceService
from tests.fakes import FakeStaticResourceRepository

pytestmark = pytest.mark.unit


def _make_service(resources=None) -> tuple[
    ResourceService, FakeStaticResourceRepository
]:
    repo = FakeStaticResourceRepository(resources or {})
    svc = ResourceService(repository=repo)
    return svc, repo


# ─── get ──────────────────────────────────────────────────────────────────────


async def test_get_returns_resource_response_with_name_and_content():
    svc, _repo = _make_service({
        "visit-distribution": {"buckets": [1, 2, 3]},
    })

    response = await svc.get("visit-distribution")
    assert isinstance(response, ResourceResponse)
    assert response.name == "visit-distribution"
    assert response.content == {"buckets": [1, 2, 3]}


async def test_get_propagates_resource_not_found():
    """A miss raises ResourceNotFoundError; the service does NOT swallow it."""
    svc, _repo = _make_service({"known": 1})

    with pytest.raises(ResourceNotFoundError):
        await svc.get("missing")


async def test_get_with_empty_registry_raises_for_any_name():
    svc, _repo = _make_service({})

    with pytest.raises(ResourceNotFoundError):
        await svc.get("anything")


# ─── list_names ───────────────────────────────────────────────────────────────


async def test_list_names_returns_sorted_keys():
    svc, _repo = _make_service({
        "zoo": 1,
        "alpha": 2,
        "marlin": 3,
    })

    assert await svc.list_names() == ["alpha", "marlin", "zoo"]


async def test_list_names_empty_for_empty_registry():
    svc, _repo = _make_service({})
    assert await svc.list_names() == []
