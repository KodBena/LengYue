"""
ResourceService — the fetch-static-resource use case.

Thin: the service is a boundary, not a calculator. There's no
aggregation, no computation, no per-request policy beyond "wrap the
Port's output in the response envelope." The value is the seam — the
route depends on ResourceService, ResourceService depends on
StaticResourceRepositoryPort, so the filesystem lives behind two
layers of Protocol and can be swapped or faked freely.

Could this live directly in the route? Technically yes. It would
violate the pattern established by CardService, ReviewService,
StatsService — each of which is a one-to-three-method orchestrator
over Ports — for the sake of saving five lines. The price is that
the "generic resource endpoint" isn't testable in isolation from
FastAPI; any test of the fetch-content-and-return-envelope logic
has to spin up a full ASGI app.

Not worth the savings. The service stays.
"""
from typing import List

from domain.resource import ResourceResponse, StaticResourceRepositoryPort


class ResourceService:
    def __init__(self, repository: StaticResourceRepositoryPort):
        """
        One Port dependency, no scalars. The Port encapsulates the
        "where do resources live" concern (filesystem path, S3 bucket,
        HTTP endpoint, etc.).
        """
        self.repository = repository

    async def get(self, name: str) -> ResourceResponse:
        """
        Fetch the named resource and wrap it in the wire envelope.

        Raises:
            ResourceNotFoundError: name is not in the registry.
                Propagates unchanged to the route, where the existing
                NotFoundError → 404 handler picks it up.
        """
        content = await self.repository.fetch(name)
        return ResourceResponse(name=name, content=content)

    async def list_names(self) -> List[str]:
        """
        Return the full catalog of available resources, sorted.
        Pass-through to the Port — no service-side transformation.
        """
        return await self.repository.list_names()
