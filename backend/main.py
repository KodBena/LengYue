"""
main.py

FastAPI application entry point. Configures logging first (so module-level
startup events from core.config's SECRET_KEY resolution and friends emit
through a configured root logger), then constructs the FastAPI app, wires
the routers, and owns the database / qEUBO lifecycle through `lifespan`.

License: Public Domain (The Unlicense)
"""
# Configure logging FIRST, before any other imports — module-level startup
# events (e.g., core.config's SECRET_KEY resolution) emit through the
# logging subsystem and need a configured root logger to be visible.
from core.logging_config import configure_logging  # noqa: E402

configure_logging(style="application")

import logging  # noqa: E402
import uvicorn  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from pathlib import Path  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from sqlalchemy.engine.url import make_url  # noqa: E402

from api.routes import analysis_bundles, auth, cards, documents, forests, library, lineage, qeubo, resources, stats  # noqa: E402
from core.config import config  # noqa: E402
from core.database import Database  # noqa: E402
from db.schema import metadata  # noqa: E402

logger = logging.getLogger(__name__)


def _apply_legacy_db_rename_compat(uri: str) -> None:
    """
    Rename a legacy `ebisu.db` onto the configured SQLite path before opening.

    Same shape as core/config._load_or_generate_secret_key's secret-file
    compat: a bounded shim (ADR-0002 exception #3) that lets a pre-debranding
    install upgrade without losing data. No-op for non-SQLite URIs and for
    `:memory:` URIs (test installs). SQLite sidecars (`-journal`, `-wal`,
    `-shm`) are renamed alongside the main file so a crash-recovery boot
    finds them in their expected co-location. Remove in a successor release
    once operators have had one upgrade cycle to migrate.
    """
    url = make_url(uri)
    if not url.drivername.startswith("sqlite"):
        return
    db = url.database
    if not db or db == ":memory:":
        return
    target = Path(db)
    if target.exists():
        return
    legacy = target.parent / "ebisu.db"
    if not legacy.exists():
        return

    legacy.rename(target)
    logger.info(
        "DATABASE: renamed legacy %s -> %s (de-branding compat)",
        legacy, target,
    )
    for suffix in ("-journal", "-wal", "-shm"):
        legacy_side = legacy.with_name(legacy.name + suffix)
        if legacy_side.exists():
            target_side = target.with_name(target.name + suffix)
            legacy_side.rename(target_side)
            logger.info(
                "DATABASE: renamed sidecar %s -> %s",
                legacy_side, target_side,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Item 21c: the database connection pool is owned by the application
    # instance, not by a module-level global. Constructed here at startup,
    # attached to app.state, disposed cleanly at shutdown. This makes
    # `from api.dependencies import anything` a side-effect-free import,
    # which is what makes the codebase testable.
    _apply_legacy_db_rename_compat(config.DATABASE_URI)
    db = Database.from_uri(config.DATABASE_URI, echo=config.SQL_ECHO)
    app.state.db = db
    logger.info("Database initialized: %s", config.DATABASE_URI)

    # qEUBO is opt-in (researcher-only feature; heavy deps in
    # requirements-qeubo.txt). The import itself is deferred to this branch
    # so that a default install without torch / botorch / gpytorch can still
    # boot the backend — the routes are always registered, but the dependency
    # `get_qeubo_service` returns 503 unless `app.state.qeubo_service` is set.
    qeubo_service = None
    qeubo_executor = None
    if config.QEUBO_ENABLED:
        from concurrent.futures import ThreadPoolExecutor

        from qeubo import ExperimentService, ExperimentStorage  # heavy import

        storage = ExperimentStorage(config.QEUBO_REDIS_URL)
        # Fail loudly per ADR-0002: a researcher who flipped QEUBO_ENABLED on
        # without a reachable Redis should see the failure at boot, not as
        # an opaque 5xx on first call.
        if not await storage.ping():
            raise RuntimeError(
                f"qEUBO storage unreachable at {config.QEUBO_REDIS_URL}; "
                "either start Redis (see backend/docs/redis-local-resource.md) "
                "or set QEUBO_ENABLED=False."
            )
        qeubo_executor = ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="qeubo_worker"
        )
        qeubo_service = ExperimentService(storage, qeubo_executor)
        logger.info("qEUBO enabled; Redis at %s", config.QEUBO_REDIS_URL)
    else:
        logger.info("qEUBO disabled; /qeubo/* will return 503 until QEUBO_ENABLED=True")
    app.state.qeubo_service = qeubo_service

    try:
        # Schema bootstrap: idempotent CREATE TABLE / CREATE INDEX IF NOT EXISTS.
        # Won't overwrite migrated data; will add new tables and indexes on
        # subsequent restarts (this is how item 21b's new indexes appear).
        async with db.engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        yield
    finally:
        if qeubo_executor is not None:
            qeubo_executor.shutdown(wait=False, cancel_futures=True)
        await db.dispose()
        logger.info("Database disposed cleanly")


app = FastAPI(
    title="Spaced Repetition API",
    description="Stateless Backend for SGF Card Trees",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS: the JWT bearer token is NOT a CORS credential (cookies are), so
# allow_credentials=False is correct, and the wildcard origin is then
# spec-compliant. Operators with stricter policies override
# CORS_ALLOW_ORIGINS via env (see core/config.Settings).
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_bundles.router)
app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(forests.router)
app.include_router(documents.router)
app.include_router(library.router)
app.include_router(lineage.router)
app.include_router(qeubo.router)
app.include_router(resources.router)
app.include_router(stats.router)


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "engine": "SQLAlchemy 2.0 Async"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8764, reload=True)
