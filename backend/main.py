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
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy.engine.url import make_url  # noqa: E402
from starlette.requests import Request  # noqa: E402
from starlette.types import ASGIApp, Message, Receive, Scope, Send  # noqa: E402

from api.routes import analysis_bundles, auth, cards, documents, forests, library, lineage, positions, qeubo, resources, stats  # noqa: E402
from core.config import config  # noqa: E402
from core.database import Database  # noqa: E402
from db.alembic_bootstrap import bootstrap_alembic  # noqa: E402
from db.schema import metadata  # noqa: E402

logger = logging.getLogger(__name__)


class CatchAllExceptionMiddleware:
    """
    Ledger row 1342 (error-path CORS legibility).

    Sends a legible 500 JSONResponse for any exception that escapes a
    route handler unhandled — and, because this is a plain ASGI
    middleware added BEFORE CORSMiddleware (see the ordering comment
    at the `app.add_middleware` call sites below), CORSMiddleware
    wraps it and gets a normal chance to inject
    `access-control-allow-origin` into the response this middleware
    sends.

    Why not `@app.exception_handler(Exception)` (the first-instinct
    fix, and wrong): Starlette's `Starlette.build_middleware_stack`
    special-cases a handler registered under the key `Exception` (or
    `500`) — it is pulled OUT of the handler dict passed to
    `ExceptionMiddleware` and installed as `ServerErrorMiddleware`'s
    `handler` instead. `ServerErrorMiddleware` is unconditionally the
    OUTERMOST layer (`[ServerErrorMiddleware] + user_middleware +
    [ExceptionMiddleware]`), constructed outside of every
    `app.add_middleware(...)` call including CORSMiddleware. A
    handler wired that way sends its response on the RAW ASGI `send`
    the test/server gave the whole stack, never passing through
    CORSMiddleware's response-header injection — which is exactly the
    1342 symptom (browsers report a genuine 500 as an opaque CORS
    failure). A plain middleware that catches the exception ITSELF,
    positioned inside CORSMiddleware, is the correct form; see
    `tests/integration/routes/test_error_cors_legibility.py` for the
    two-sided (positive + negative-control) pin of this exact ordering
    claim.

    The response-started guard mirrors Starlette's own
    `ServerErrorMiddleware` implementation: if the failing handler had
    already started streaming a response before raising, sending a
    second `http.response.start` would be invalid, so this middleware
    only sends its own 500 when nothing had gone out yet. Re-raises
    after sending (matching `ServerErrorMiddleware`'s own convention)
    so the exception is still visible to whatever wraps this app for
    server-level logging (uvicorn) — the response bytes are already on
    the wire by then; the re-raise doesn't touch what the client saw.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:
            request = Request(scope)
            logger.exception(
                "Unhandled exception on %s %s", request.method, request.url.path
            )
            if not response_started:
                response = JSONResponse(
                    status_code=500, content={"detail": "Internal server error"}
                )
                await response(scope, receive, send)
            raise exc


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
        # Schema bootstrap, two phases:
        #
        # 1. metadata.create_all — idempotent CREATE TABLE / CREATE INDEX
        #    IF NOT EXISTS. Materialises any table or index the live
        #    schema declares but the DB doesn't yet carry. The historical
        #    mechanism for landing new tables and indexes on operator
        #    restart (item 21b's new indexes were the worked example).
        # 2. bootstrap_alembic — probe the DB's schema state, stamp the
        #    `alembic_version` table at the appropriate revision if the
        #    DB isn't yet Alembic-managed, then run `alembic upgrade head`
        #    to apply any pending revisions. End-users on this PR onwards
        #    don't need to remember to run `scripts/migrate_*.py` for
        #    schema changes that ship as Alembic revisions; the lifespan
        #    handles it. Idempotent on already-upgraded DBs.
        #
        # The order matters: create_all first so fresh installs have a
        # full schema before the probe runs (the probe's "marker"
        # detection assumes the live schema is materialised). Alembic
        # revisions still run AFTER create_all because revisions
        # represent deltas the static schema doesn't (yet) reflect —
        # if you've just pulled, your db/schema.py declares the new
        # columns but the DB's existing table doesn't have them; only
        # the revision's `op.add_column` adds them at the actual DB.
        async with db.engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        backend_root = str(Path(__file__).parent.resolve())
        await bootstrap_alembic(db.engine, backend_root)
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

# Middleware order matters here (Starlette wraps in add-order such that
# the LAST-added `app.add_middleware` call ends up OUTERMOST among user
# middleware): CatchAllExceptionMiddleware is added FIRST so
# CORSMiddleware — added second — wraps it. That makes CORSMiddleware
# see (and add headers to) the 500 response CatchAllExceptionMiddleware
# builds for a genuinely unhandled exception. See
# CatchAllExceptionMiddleware's docstring above for why the more
# obvious `@app.exception_handler(Exception)` form does NOT achieve
# this (ledger row 1342).
app.add_middleware(CatchAllExceptionMiddleware)

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
app.include_router(positions.router)
app.include_router(qeubo.router)
app.include_router(resources.router)
app.include_router(stats.router)


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "engine": "SQLAlchemy 2.0 Async"}


if __name__ == "__main__":
    # This is the frozen-executable / Tauri-sidecar entry point (the local
    # dev workflow runs `fastapi dev main.py` instead — see
    # backend/README.md — which doesn't go through this branch).
    # `reload=False`: a PyInstaller-frozen onefile executable has no
    # source tree to watch, and uvicorn's reloader spawns a subprocess
    # that assumes a `python`-invocable script, which a frozen binary
    # isn't. HOST/PORT are read from config so the Tauri desktop shell can
    # bind the sidecar to the OS-assigned free port it picked at app start
    # (see frontend/src-tauri/src/lib.rs).
    # The app OBJECT is passed directly rather than the "main:app" import
    # string: the string form re-imports the module by name for
    # reload/multi-worker support, which assumes a `main` module is
    # importable by that name — true for `python main.py` from source, but
    # not guaranteed for a PyInstaller-frozen entry script (frozen builds
    # commonly expose the entry script as `__main__`, not `main`). Passing
    # `app` directly skips that re-import path entirely; since reload=False
    # and no `workers` argument is given (single process), nothing here
    # needs the import-string form.
    uvicorn.run(app, host=config.HOST, port=config.PORT, reload=False)
