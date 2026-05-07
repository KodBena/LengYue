"""
Resources route — generic static-resource endpoint.

Two endpoints:
    GET /resources            — list all registered resource names
    GET /resources/{name}     — fetch a named resource's content

No auth dependency. Static resources are deployment-level data (visit
distributions, palettes, fixed metadata) served equally to all users,
authenticated or not. If a future resource becomes user-sensitive,
add `user_id: int = Depends(get_current_user_id)` to the specific
endpoint — the surrounding architecture doesn't need to change.

Service is injected via DI — the route handler doesn't know whether
the backing store is the filesystem, S3, a CDN, or an in-memory fake.
ResourceNotFoundError → 404 is mapped at the route boundary (matches
the cards.py / lineage.py pattern; the codebase does not register
application-level exception handlers).

Prefix note: `/resources` (no `/api/` prefix) matches the convention
of the other Ebisu routes (`/cards`, `/stats`, `/forests`, `/auth`).
The pre-refactor endpoint lived at `/api/resources/visit-distribution`
on a separate service; frontend clients must update their base path
when migrating to this endpoint.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_resource_service
from domain.errors import ResourceNotFoundError
from domain.resource import ResourceResponse
from services.resource_service import ResourceService

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=List[str])
async def list_resources(
    service: ResourceService = Depends(get_resource_service),
) -> List[str]:
    """
    List the names of all registered static resources.

    Returns a sorted list of slugs that can be fetched via GET
    /resources/{name}. Useful for frontend discovery — lets the UI
    know what's available without hardcoding the catalog.
    """
    return await service.list_names()


@router.get("/{name}", response_model=ResourceResponse)
async def get_resource(
    name: str,
    service: ResourceService = Depends(get_resource_service),
) -> ResourceResponse:
    """
    Fetch the content of a named static resource.

    Returns a generic envelope: `{"name": <slug>, "content": <any>}`.
    The `content` field's shape is resource-specific; consumers are
    expected to know what to expect for the resource they asked for.

    Raises:
        404 (via ResourceNotFoundError): `name` is not registered.
    """
    try:
        return await service.get(name)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
