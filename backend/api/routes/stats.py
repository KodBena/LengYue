from typing import List

from fastapi import APIRouter, Depends

from api.dependencies import get_current_user_id, get_stats_service
from domain.auth import UserId
from schemas.stats import ForestStat, TagStat
from services.stats_service import StatsService

router = APIRouter(prefix="/stats", tags=["statistics"])


@router.get("/tags", response_model=List[TagStat])
async def get_tags(
    service: StatsService = Depends(get_stats_service),
    user_id: UserId = Depends(get_current_user_id),  # Item 15 (active).
):
    """
    Returns a list of all tags and their usage counts among the
    requesting user's cards.

    Item 15 (tenancy): user_id is forwarded to the service, which
    forwards to the Port. Tags used only by other tenants appear with
    count=0 (the LEFT OUTER JOIN preserves the tag row), making them
    indistinguishable from tags with no use at all — the correct
    privacy property.
    """
    return await service.compute_tag_usage(user_id=user_id)


@router.get("/forests", response_model=List[ForestStat])
async def get_forests(
    service: StatsService = Depends(get_stats_service),
    user_id: UserId = Depends(get_current_user_id),  # Item 15 (active).
):
    """
    Returns a summary of the requesting user's root game sources,
    including the total number of descendant cards, aggregated reviews,
    and average Ebisu recall per forest.

    Item 15 (tenancy): user_id is forwarded to the service, which
    forwards to the Port. The recursive root-mapping CTE filters at
    both the base case and the recursive step, ensuring that historical
    cross-tenant lineage (if any exists) doesn't leak into a user's
    aggregated stats.
    """
    return await service.compute_forest_summaries(user_id=user_id)
