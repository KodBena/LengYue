from typing import List

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id, get_pipeline_executor
from domain.auth import UserId
from domain.card import CardWithRecall
from domain.errors import InvalidInputError, NotFoundError
from domain.pipeline import PipelineExecutor
from domain.pipeline_dsl import ForestQuery

router = APIRouter(prefix="/forests", tags=["forests"])


@router.post("/query", response_model=List[CardWithRecall])
async def query_forest(
    query: ForestQuery,
    executor: PipelineExecutor = Depends(get_pipeline_executor),
    user_id: UserId = Depends(get_current_user_id),  # Item 25 (active).
):
    """
    Executes a typed pipeline against the given context ids,
    restricted to cards owned by the requesting user.

    Item 32a: the route no longer constructs the executor inline or
    takes a session dependency. The executor is injected fully wired —
    both the LineageRepositoryPort and the TagFilterRepositoryPort are
    already composed into it by get_pipeline_executor. FastAPI's
    dependency caching ensures the session backing both Ports is the
    same per-request session.

    Item 25 (tenancy): user_id is forwarded to executor.run(), which
    threads it through both the lineage Port and the tag-filter Port.
    The transitional UserId(1) shim that lived inside PipelineExecutor
    until items 13–16 had prepared the Port signatures is gone; the
    tenancy spine is fully threaded for /forests/query.

    Pydantic has already validated the entire typed DSL (parse-time).
    The try/except remains defensive against runtime-only DSL errors —
    tag-DSL parse failures inside FilterSelection.tag_expression are
    the only remaining runtime PipelineDSLError path (the nested-
    filter case from pre-32a is now a parse-time error thanks to the
    BaseSelection vs Selection split in domain/pipeline_dsl.py).

    macro-public-id-tokens: `query.game_source_ordinals` threads to
    executor.run(), which resolves each ordinal server-side, within
    this user's tenancy, to root card ids before building the
    selection pool. An ordinal that doesn't resolve (unknown, or
    belongs to a different tenant) raises GameSourceNotFoundError —
    caught below via the NotFoundError axis and mapped to 404, the
    same 404-not-403 collapse every other tenant-scoped lookup uses.
    """
    try:
        return await executor.run(
            query.context_ids,
            query.pipeline,
            user_id=user_id,
            game_source_ordinals=query.game_source_ordinals,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=422, detail=str(e))
