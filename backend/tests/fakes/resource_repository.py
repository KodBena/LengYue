"""
tests/fakes/resource_repository.py

In-memory fake for ``StaticResourceRepositoryPort``. Backed by a
plain ``{name: content}`` dict. Raises ``ResourceNotFoundError`` for
unknown names; matches the production filesystem adapter's
behaviour without touching disk.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import Any, Dict, List

from domain.errors import ResourceNotFoundError


class FakeStaticResourceRepository:
    """
    Structural match for ``StaticResourceRepositoryPort``.

    Test usage::

        repo = FakeStaticResourceRepository({
            "visit-distribution": {"buckets": [...]},
        })

        await repo.fetch("visit-distribution") == {"buckets": [...]}
        await repo.list_names() == ["visit-distribution"]
    """

    def __init__(self, resources: Dict[str, Any]):
        self._resources = dict(resources)

    async def fetch(self, name: str) -> Any:
        if name not in self._resources:
            raise ResourceNotFoundError(f"resource not found: {name!r}")
        return self._resources[name]

    async def list_names(self) -> List[str]:
        return sorted(self._resources.keys())
