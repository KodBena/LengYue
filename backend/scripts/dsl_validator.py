import asyncio
import logging
import os
import sys
from typing import List

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logging_config import configure_logging  # noqa: E402
from domain.pipeline import PipelineExecutor  # noqa: E402
from domain.pipeline_dsl import (  # noqa: E402
    DepthKey,
    DescendantSelection,
    FilterSelection,
    HeavyPathRankKey,
    SelectStage,
    Stage,
    SubtreeSelection,
    TakeStage,
)
from domain.tag_dsl import TagDSLCompiler  # noqa: E402
from domain.auth import UserId
from repositories.lineage_repository import LineageRepository  # noqa: E402
from repositories.tag_filter_repository import TagFilterRepository  # noqa: E402

VALIDATOR_USER_ID = UserId(1)
DB_URL = "sqlite+aiosqlite:///./ebisu_parity.db"

logger = logging.getLogger(__name__)


async def test_dsl_pipelines():
    """
    Item 32a: PipelineExecutor is now constructed against two Ports
    (LineageRepositoryPort, TagFilterRepositoryPort) instead of a raw
    session. The script composes the adapters explicitly — same way
    the DI layer in api/dependencies.py does for the HTTP path.
    """
    engine = create_async_engine(DB_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        lineage_repo = LineageRepository(session)
        tag_filter_repo = TagFilterRepository(session)
        executor = PipelineExecutor(
            lineage_repo=lineage_repo,
            tag_filter_repo=tag_filter_repo,
        )

        logger.info("")
        logger.info("--- TEST 1: The 'Warm-Up' Pattern (Descendants + Tag Filter) ---")
        warm_up_pipeline: List[Stage] = [
            SelectStage(
                selection=FilterSelection(
                    base=DescendantSelection(),
                    tag_expression="~volatile",
                ),
                ordering=DepthKey(),
            ),
            TakeStage(n=5),
        ]

        cards = await executor.run([852], warm_up_pipeline, user_id=VALIDATOR_USER_ID)
        logger.info(f"Returned {len(cards)} cards.")
        for i, c in enumerate(cards):
            logger.info(f"  {i + 1}. Card {c.id}")

        logger.info("")
        logger.info("--- TEST 2: The 'Main Line' Pattern (Subtree + HeavyPath Order) ---")
        main_line_pipeline: List[Stage] = [
            SelectStage(
                selection=SubtreeSelection(n=0),
                ordering=HeavyPathRankKey(),
            ),
            TakeStage(n=5),
        ]
        cards = await executor.run([852], main_line_pipeline, user_id=VALIDATOR_USER_ID)
        logger.info(f"Returned {len(cards)} cards.")
        for i, c in enumerate(cards):
            logger.info(f"  {i + 1}. Card {c.id}")

        logger.info("")
        logger.info("--- TEST 3: Virtual Tag Compilation ($fight) ---")
        # This test exercises TagDSLCompiler directly (not through the
        # executor), so it doesn't need the tag_filter_repo adapter.
        compiler = TagDSLCompiler()
        dsl_string = """
        $positional :- opening;joseki;shape.
        $positional,~volatile
        """
        stmt = compiler.compile_to_subquery(dsl_string)
        compiled_sql = str(stmt.compile(engine, compile_kwargs={"literal_binds": True}))
        logger.info("Generated SQL for '$positional,~volatile':")
        logger.info(compiled_sql[:300] + "...\n[SQL Truncated for brevity]")

        res = await session.execute(stmt)
        matching_ids = [r[0] for r in res.fetchall()]
        logger.info(f"Found {len(matching_ids)} cards matching this complex logic.")

    await engine.dispose()


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(test_dsl_pipelines())
