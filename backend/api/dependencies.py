"""
api/dependencies.py

FastAPI dependency factories for the delivery layer.

Composes Ports with their concrete adapters and yields request-scoped
sessions. The auth gatekeeper `get_current_user_id` is the single
boundary at which a JWT becomes a `UserId`; every tenant-scoped route
threads the result of that dependency into its Port calls. The
five-layer threading discipline that makes the tenancy spine work is
documented in docs/notes/tenancy.md.

License: Public Domain (The Unlicense)
"""
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import config
from core.database import Database
from domain.auth import UserId
from domain.normalizer import PositionNormalizerPort
from domain.pipeline import PipelineExecutor
from domain.resource import StaticResourceRepositoryPort
from domain.sgf_normalizer import SgfNormalizer
from repositories.analysis_bundle_repository import AnalysisBundleRepository
from repositories.card_repository import CardRepository
from repositories.lineage_repository import LineageRepository
from repositories.ports import (
    AnalysisBundleRepositoryPort,
    CardRepositoryPort,
    CardWriteRepositoryPort,
    LineageRepositoryPort,
    StatsRepositoryPort,
    TagFilterRepositoryPort,
)
from repositories.resource_repository import FilesystemResourceRepository
from repositories.stats_repository import StatsRepository
from repositories.tag_filter_repository import TagFilterRepository
from services.analysis_bundle_service import AnalysisBundleService
from services.card_service import CardService
from services.resource_service import ResourceService
from services.review_service import ReviewService
from services.stats_service import StatsService

# This tells FastAPI where the frontend goes to get a token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


# =====================================================================
# Static resource registry.
#
# Declared at module level so the full catalog of what this deployment
# exposes via /resources/{name} is visible in one place. Adding a new
# static resource: (1) drop the JSON file in ./data/, (2) add a line
# here, (3) done — no service, adapter, or route change required.
#
# Paths are resolved relative to the current working directory at app
# startup. The app's run directory is typically the repo root, so
# "data/<filename>.json" resolves to <repo>/data/<filename>.json.
# Override via CWD if running the app from a different directory.
#
# The registry is NOT validated at startup. A registered resource
# whose file is missing surfaces as a 500 on first fetch, not as a
# boot-time crash. This is deliberate — see FilesystemResourceRepository
# docstring for the rationale.
# =====================================================================

STATIC_RESOURCE_REGISTRY = {
    "visit-distribution": Path("data/visit_distribution.json"),
}


async def get_db(request: Request):
    """
    Yield an AsyncSession scoped to the lifetime of a single request.

    The Database instance is owned by the application (constructed in
    main.py::lifespan, attached to app.state.db) — this dependency just
    borrows a session from it. Item 21c moved engine ownership out of
    module-level globals into the application's lifecycle so importing
    this module no longer triggers any I/O.
    """
    db: Database = request.app.state.db
    async with db.session() as session:
        yield session


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> UserId:
    """
    Stateless auth gatekeeper.
    Verifies the JWT signature and extracts the user_id.

    The downstream invariant: every route that depends on this
    function receives a UserId that has been authenticated against
    the JWT this request carries. Downstream code is REQUIRED to
    thread that UserId into every tenant-scoped Port call (typically
    as the `*, user_id` keyword-only parameter), and the SQL adapter
    fuses it into the WHERE clause of any read or write touching a
    tenant-owned table. The 404-not-403 invariant — that "doesn't
    exist" and "not yours" return the same status — depends on this
    function being the single boundary at which a JWT becomes a
    `UserId`. The five-layer threading discipline (route captures,
    service forwards, Port declares, adapter applies, schema
    declares the FK) is documented in docs/notes/tenancy.md.

    Item 13 (tenancy): return type is now UserId (a NewType-branded
    int from domain/auth.py). The brand is applied here at the
    JWT-decode boundary; downstream callers — Port methods, services,
    routes — annotate parameters with UserId throughout, making
    transposition with other integer ids (card_id, position_id) a
    static type error.

    NewType is a runtime no-op, so the cast `UserId(int(user_id_str))`
    has zero performance cost. The benefit is purely at the type-check
    layer.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        return UserId(int(user_id_str))
    except jwt.PyJWTError:
        raise credentials_exception
    except ValueError:
        raise credentials_exception


async def get_card_repo(db: AsyncSession = Depends(get_db)) -> CardRepository:
    """
    Construct the SQLAlchemy implementation of CardRepositoryPort and
    CardWriteRepositoryPort (the same concrete adapter satisfies both;
    item 30b).
    """
    return CardRepository(db)


async def get_review_service(
    repo: CardRepositoryPort = Depends(get_card_repo),
) -> ReviewService:
    """
    Construct ReviewService against any CardRepositoryPort implementation.
    """
    return ReviewService(repo, time_unit_seconds=config.EBISU_TIME_UNIT)


async def get_position_normalizer() -> PositionNormalizerPort:
    """
    Construct the domain-specific position normalizer. Today:
    SgfNormalizer (Go). Item 34 will make this deployment-configurable.
    """
    return SgfNormalizer()


async def get_card_service(
    repo: CardWriteRepositoryPort = Depends(get_card_repo),
    normalizer: PositionNormalizerPort = Depends(get_position_normalizer),
    read_repo: CardRepositoryPort = Depends(get_card_repo),
) -> CardService:
    """
    Compose the write-side Port, the normalizer Port, and the read-side
    Port into the create-card use case.

    The same SQLAlchemy CardRepository adapter satisfies both read and
    write Ports (item 30b). FastAPI's dependency caching ensures
    `get_card_repo` returns the same instance for both `repo` and
    `read_repo` within a request, so this is one adapter and one
    session — not two.

    Item 14 (tenancy): read_repo is consumed for the parent-ownership
    precheck inside CardService.create_card.
    """
    return CardService(
        repository=repo,
        normalizer=normalizer,
        read_repository=read_repo,
    )


async def get_lineage_repo(
    db: AsyncSession = Depends(get_db),
) -> LineageRepositoryPort:
    """
    Construct the SQLAlchemy implementation of LineageRepositoryPort
    (item 32a). Return type is the Port; consumers see only the
    abstract contract.
    """
    return LineageRepository(db)


async def get_tag_filter_repo(
    db: AsyncSession = Depends(get_db),
) -> TagFilterRepositoryPort:
    """
    Construct the SQLAlchemy implementation of TagFilterRepositoryPort
    (item 32a). Stateless; shares the request-scoped session via
    FastAPI's dependency caching.
    """
    return TagFilterRepository(db)


async def get_pipeline_executor(
    lineage_repo: LineageRepositoryPort = Depends(get_lineage_repo),
    tag_filter_repo: TagFilterRepositoryPort = Depends(get_tag_filter_repo),
) -> PipelineExecutor:
    """
    Compose the two Ports into the forest-query use case (item 32a).
    """
    return PipelineExecutor(
        lineage_repo=lineage_repo,
        tag_filter_repo=tag_filter_repo,
        time_unit=config.EBISU_TIME_UNIT,
    )


# =====================================================================
# Item 32a.2 additions: StatsRepository + StatsService.
# =====================================================================


async def get_stats_repo(
    db: AsyncSession = Depends(get_db),
) -> StatsRepositoryPort:
    """
    Construct the SQLAlchemy implementation of StatsRepositoryPort.

    Return type is the Port; consumers (get_stats_service, tests)
    declare their parameter as the Port so the rest of the system
    sees only the abstract contract.
    """
    return StatsRepository(db)


async def get_stats_service(
    repo: StatsRepositoryPort = Depends(get_stats_repo),
) -> StatsService:
    """
    Compose the stats Port into the stats use case (item 32a.2).

    Stateless beyond the Port reference and the time_unit constant;
    a fresh instance per request has negligible overhead. FastAPI's
    dependency caching ensures the session backing the repository
    is the same per-request session shared with all other adapters.
    """
    return StatsService(
        repository=repo,
        time_unit=config.EBISU_TIME_UNIT,
    )


# =====================================================================
# Static resource DI.
#
# No session dependency — static resources are deployment-level data,
# not database-backed. The repository is stateless and cheap to
# construct; we build it per-request for consistency with the other
# DI factories, though a module-level singleton would be equivalent.
# =====================================================================


async def get_resource_repo() -> StaticResourceRepositoryPort:
    """
    Construct the filesystem-backed implementation of
    StaticResourceRepositoryPort. Return type is the Port — consumers
    see only the abstract contract.
    """
    return FilesystemResourceRepository(STATIC_RESOURCE_REGISTRY)


async def get_resource_service(
    repo: StaticResourceRepositoryPort = Depends(get_resource_repo),
) -> ResourceService:
    """
    Compose the resource Port into the fetch-resource use case.
    """
    return ResourceService(repository=repo)


# =====================================================================
# Analysis-bundle DI (cross/analysis-persistence arc).
#
# The adapter takes the per-deployment knobs (write scheme, user
# quota) at construction time so the codec dispatch and the atomic
# quota check have everything they need without reaching into
# config from inside SQL methods. The service takes the per-bundle
# request cap. All three knobs are env-overridable via
# core.config.Settings; defaults: "json+gzip" / 100 MB / 2 GB.
# =====================================================================


async def get_analysis_bundle_repo(
    db: AsyncSession = Depends(get_db),
) -> AnalysisBundleRepositoryPort:
    """
    Construct the SQLAlchemy implementation of
    AnalysisBundleRepositoryPort. Reads the write scheme and the
    user quota from core.config; tests can construct the adapter
    directly with arbitrary values to exercise the codec dispatch
    and quota check without mutating global config.
    """
    return AnalysisBundleRepository(
        db,
        write_scheme=config.ANALYSIS_PERSISTENCE_WRITE_SCHEME,
        user_quota_bytes=config.ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES,
    )


async def get_analysis_bundle_service(
    repo: AnalysisBundleRepositoryPort = Depends(get_analysis_bundle_repo),
) -> AnalysisBundleService:
    """
    Compose the analysis-bundle Port with the per-bundle byte cap
    into the use case. Per-user quota enforcement lives in the
    adapter (atomic with the upsert); per-bundle cap lives here
    (the service is the natural place to bound request body size
    against a config knob, since the adapter only sees the parsed
    DTO).
    """
    return AnalysisBundleService(
        repository=repo,
        bundle_max_bytes=config.ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES,
    )
