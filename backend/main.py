# Configure logging FIRST, before any other imports — module-level startup
# events (e.g., core.config's SECRET_KEY resolution) emit through the
# logging subsystem and need a configured root logger to be visible.
from core.logging_config import configure_logging  # noqa: E402

configure_logging(style="application")

import logging  # noqa: E402
import uvicorn  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from api.routes import auth, cards, documents, forests, resources, stats  # noqa: E402
from core.config import config  # noqa: E402
from core.database import Database  # noqa: E402
from db.schema import metadata  # noqa: E402

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Item 21c: the database connection pool is owned by the application
    # instance, not by a module-level global. Constructed here at startup,
    # attached to app.state, disposed cleanly at shutdown. This makes
    # `from api.dependencies import anything` a side-effect-free import,
    # which is what makes the codebase testable.
    db = Database.from_uri(config.DATABASE_URI, echo=config.SQL_ECHO)
    app.state.db = db
    logger.info("Database initialized: %s", config.DATABASE_URI)

    try:
        # Schema bootstrap: idempotent CREATE TABLE / CREATE INDEX IF NOT EXISTS.
        # Won't overwrite migrated data; will add new tables and indexes on
        # subsequent restarts (this is how item 21b's new indexes appear).
        async with db.engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        yield
    finally:
        await db.dispose()
        logger.info("Database disposed cleanly")


app = FastAPI(
    title="Ebisu Spaced Repetition API",
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

app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(forests.router)
app.include_router(documents.router)
app.include_router(resources.router)
app.include_router(stats.router)


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "engine": "SQLAlchemy 2.0 Async"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8764, reload=True)
