import logging
import os
import sys

from sqlalchemy import create_engine, select

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logging_config import configure_logging  # noqa: E402
from db.schema import (  # noqa: E402
    card,
    card_source,
    card_tag,
    game_source,
    metadata as target_metadata,
    normalized_position,
    tag,
    users,
)

PG_URL = "postgresql+psycopg://bork@/sgf_spaced_repetition?host=/home/bork/postgres/socket"
SQLITE_URL = "sqlite:///./ebisu.db"  # Writing directly to ebisu.db now

logger = logging.getLogger(__name__)


def sync_migrate():
    src_engine = create_engine(PG_URL)
    dst_engine = create_engine(SQLITE_URL)

    logger.info("Creating SQLite schema...")
    target_metadata.create_all(dst_engine)

    with src_engine.connect() as src_conn:
        with dst_engine.connect() as dst_conn:
            logger.info("Migrating Users...")
            users_data = src_conn.execute(select(users)).fetchall()
            if users_data:
                dst_conn.execute(users.insert(), [dict(r._asdict()) for r in users_data])

            logger.info("Migrating Positions...")
            pos_data = src_conn.execute(select(normalized_position)).fetchall()
            if pos_data:
                dst_conn.execute(normalized_position.insert(), [dict(r._asdict()) for r in pos_data])

            # FIX: Missing Game Source migration!
            logger.info("Migrating Game Sources (Roots)...")
            gs_data = src_conn.execute(select(game_source)).fetchall()
            if gs_data:
                dst_conn.execute(game_source.insert(), [dict(r._asdict()) for r in gs_data])

            logger.info("Migrating Cards...")
            card_data = src_conn.execute(select(card)).fetchall()
            if card_data:
                dst_conn.execute(card.insert(), [dict(r._asdict()) for r in card_data])

            logger.info("Migrating Lineage...")
            source_data = src_conn.execute(select(card_source)).fetchall()
            if source_data:
                dst_conn.execute(card_source.insert(), [dict(r._asdict()) for r in source_data])

            logger.info("Migrating Tags...")
            tag_data = src_conn.execute(select(tag)).fetchall()
            if tag_data:
                dst_conn.execute(tag.insert(), [dict(r._asdict()) for r in tag_data])

            logger.info("Migrating Card-Tag Relations...")
            card_tag_data = src_conn.execute(select(card_tag)).fetchall()
            if card_tag_data:
                dst_conn.execute(card_tag.insert(), [dict(r._asdict()) for r in card_tag_data])

            dst_conn.commit()
    logger.info("Migration Complete.")


if __name__ == "__main__":
    configure_logging(style="cli")
    sync_migrate()
