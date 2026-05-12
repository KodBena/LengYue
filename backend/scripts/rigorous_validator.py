import asyncio
import logging
import os
import sys
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logging_config import configure_logging  # noqa: E402
from domain.auth import UserId  # noqa: E402
from domain.pipeline import PipelineExecutor  # noqa: E402
from domain.pipeline_dsl import (  # noqa: E402
    DepthKey,
    DescendantSelection,
    SelectStage,
    Stage,
)
from domain.tag_dsl import TagDSLCompiler  # noqa: E402
from domain.tree_engine import compute_structural_coords  # noqa: E402
from repositories.lineage_repository import LineageRepository  # noqa: E402
from repositories.tag_filter_repository import TagFilterRepository  # noqa: E402

DB_URL = "sqlite+aiosqlite:///./ebisu_parity.db"

# Validator scripts run against a single-tenant fixture; user 1 is the
# auto-provisioned local_user from ALLOW_PASSWORDLESS_LOGIN.
VALIDATOR_USER_ID = UserId(1)

logger = logging.getLogger(__name__)


async def rigorous_tests():
    """
    Item 32a: executor composed against Ports; fetch_lineage is now a
    method on LineageRepository (moved from domain/tree_engine.py in
    the domain-purification pass).

    Tests 1 and 4 exercise TagDSLCompiler directly — that compiler
    lives in repositories/tag_dsl_sql.py (re-exported via the
    domain/tag_dsl.py facade after the macro-language plan's
    arc 1 file split; it has tests of its own) so those tests are
    unaffected beyond noting that production callers now go
    through TagFilterRepository.
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
        compiler = TagDSLCompiler()

        logger.info("Running Rigorous DSL Validations...")

        # ---------------------------------------------------------
        # TEST 1: Nested Virtual Tags
        # ---------------------------------------------------------
        nested_dsl = """
        $base :- opening;joseki.
        $complex :- $base;shape.
        $complex,~volatile
        """
        stmt = compiler.compile_to_subquery(nested_dsl)
        res = await session.execute(stmt)
        nested_ids = {r[0] for r in res.fetchall()}

        flat_dsl = "$flat :- opening;joseki;shape.\n$flat,~volatile"
        stmt_flat = compiler.compile_to_subquery(flat_dsl)
        flat_ids = {r[0] for r in (await session.execute(stmt_flat)).fetchall()}

        assert nested_ids == flat_ids, "Test 1 Failed: Nested virtual tags do not match flat expansion."
        logger.info("  [PASS] Test 1: Nested Virtual Tags resolve correctly.")

        # ---------------------------------------------------------
        # TEST 2: Descendant Selection (Root Exclusion)
        # ---------------------------------------------------------
        descendant_pipeline: List[Stage] = [
            SelectStage(
                selection=DescendantSelection(),
                ordering=DepthKey(),
            ),
        ]
        # 852 is a known wide root
        desc_cards = await executor.run([852], descendant_pipeline)

        # Root should NOT be in the descendants
        assert 852 not in [c.id for c in desc_cards], "Test 2 Failed: Root card included in DescendantSelection."
        logger.info("  [PASS] Test 2: DescendantSelection correctly excludes the context root.")

        # ---------------------------------------------------------
        # TEST 3: Structural Heavy Path Ranking
        # ---------------------------------------------------------
        # Item 32a: fetch_lineage moved from domain/tree_engine.py to
        # LineageRepository. compute_structural_coords stays in
        # domain/tree_engine.py (it's pure Python over CardNode).
        nodes = await lineage_repo.fetch_lineage(852, user_id=VALIDATOR_USER_ID)
        compute_structural_coords(nodes)

        root_node = next(n for n in nodes if n.id == 852)

        # In HeavyPath decomposition, the main line (largest subtree)
        # is visited first. Therefore, the root MUST have rank 0.
        assert root_node.heavy_path_rank == 0, "Test 3 Failed: Root node is not rank 0 in Heavy Path."

        children = [n for n in nodes if n.parent_id == 852]
        if children:
            heavy_child = max(children, key=lambda n: n.subtree_size)
            # The heavy child MUST be rank 1 (immediately follows the root)
            assert heavy_child.heavy_path_rank == 1, "Test 3 Failed: Heavy child is not rank 1."

        logger.info("  [PASS] Test 3: Heavy Path Decomposition accurately ranks nodes by subtree size.")

        # ---------------------------------------------------------
        # TEST 4: DNF Logic (AND NOT)
        # ---------------------------------------------------------
        # Production callers now go through TagFilterRepository; this
        # test exercises the compiler + SQL directly for SQL-shape
        # verification, which is the compiler's own concern.
        stmt_and_not = compiler.compile_to_subquery("technical,~volatile")
        and_not_ids = {r[0] for r in (await session.execute(stmt_and_not)).fetchall()}

        from db.schema import card_tag, tag
        tech = await session.execute(
            select(card_tag.c.card_id).join(tag).where(tag.c.name == "technical")
        )
        tech_ids = {r[0] for r in tech.fetchall()}
        vol = await session.execute(
            select(card_tag.c.card_id).join(tag).where(tag.c.name == "volatile")
        )
        vol_ids = {r[0] for r in vol.fetchall()}

        manual_ids = tech_ids - vol_ids
        assert and_not_ids == manual_ids, "Test 4 Failed: DNF 'AND NOT' logic did not match manual set subtraction."
        logger.info("  [PASS] Test 4: Disjunctive Normal Form cleanly executes set subtraction.")

        # Bonus sanity check: exercise the TagFilterRepository Port at
        # least once so the adapter's path is covered by validation.
        repo_ids = await tag_filter_repo.card_ids_matching(
            "technical,~volatile", user_id=VALIDATOR_USER_ID
        )
        assert repo_ids == and_not_ids, "TagFilterRepository.card_ids_matching disagrees with direct compile+execute."
        logger.info("  [PASS] Bonus: TagFilterRepository adapter matches direct compilation.")

    logger.info("")
    logger.info("ALL RIGOROUS TESTS PASSED. The DSL Engine is mathematically sound.")
    await engine.dispose()


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(rigorous_tests())
