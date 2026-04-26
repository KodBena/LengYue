import asyncio
import logging
import os
import sys

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logging_config import configure_logging  # noqa: E402
from domain.auth import UserId  # noqa: E402
from domain.tree_engine import compute_structural_coords  # noqa: E402
from repositories.card_repository import CardRepository  # noqa: E402
from repositories.lineage_repository import LineageRepository  # noqa: E402
from schemas.card import ReviewRequest  # noqa: E402
from services.review_service import ReviewService  # noqa: E402

# Config for parity check
DB_URL = "sqlite+aiosqlite:///./ebisu_parity.db"

# Validator scripts run against a single-tenant fixture; user 1 is the
# auto-provisioned local_user from ALLOW_PASSWORDLESS_LOGIN. Threaded
# through the new tenant-aware Ports.
VALIDATOR_USER_ID = UserId(1)

logger = logging.getLogger(__name__)


async def validate_parity():
    """
    Item 32a: fetch_lineage moved from domain/tree_engine.py to
    LineageRepository. No other changes needed here — Test 1
    already uses ReviewService against a CardRepository (the same
    pattern from 21f), which is untouched by 32a.
    """
    engine = create_async_engine(DB_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        repo = CardRepository(session)
        service = ReviewService(repo)
        lineage_repo = LineageRepository(session)

        logger.info("--- TEST 1: MATHEMATICAL PARITY (Card 3661) ---")
        # Existing stats from your SQL dump for 3661:
        # alpha: 5.659442061917084, beta: 5.659442061917105, t: 104.36718235119079
        card_id = 3661

        # Simulate a review: 5 moves, all perfect (1.0)
        request = ReviewRequest(scores=[1.0, 1.0, 1.0, 1.0, 1.0])

        logger.info(f"Processing review for Card {card_id}...")
        updated_card = await service.process_review(
            card_id, request, user_id=VALIDATOR_USER_ID
        )

        logger.info("OLD Model: (5.659, 5.659, 104.367)")
        logger.info(
            f"NEW Model: ({updated_card.alpha:.4f}, "
            f"{updated_card.beta:.4f}, {updated_card.t:.4f})"
        )
        logger.info(f"Reviews incremented: {updated_card.num_reviews} (Expected 30)")

        logger.info("")
        logger.info("--- TEST 2: STRUCTURAL PARITY (Parent 852) ---")
        # Parent 852 has 53 children. Let's see if we find them and compute height.
        nodes = await lineage_repo.fetch_lineage(
            852, max_depth=1, user_id=VALIDATOR_USER_ID
        )
        compute_structural_coords(nodes)

        logger.info(f"Found {len(nodes)} total nodes in lineage for 852.")
        logger.info("Verification: SQL count was 53 children + 1 root = 54 nodes.")

        if len(nodes) >= 54:
            logger.info("SUCCESS: Lineage count matches Postgres stats.")
        else:
            logger.warning(
                f"Lineage count ({len(nodes)}) is lower than expected (54)."
            )

    await engine.dispose()


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(validate_parity())
