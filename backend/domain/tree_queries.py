from sqlalchemy import select, and_, literal_column, union_all
from sqlalchemy.sql import Select
from db.schema import card_source

def get_lineage_cte(context_id: int):
    """
    Returns a recursive CTE that finds all descendants of a given card_id.
    Standardized for both SQLite and Postgres.
    """
    # 1. Base Case: The card we are starting from
    base = select(
        card_source.c.card_id,
        card_source.c.card_source_id,
        literal_column("0").label("depth")
    ).where(card_source.c.card_id == context_id).cte(name="lineage", recursive=True)

    # 2. Recursive Step: Find children
    recursive_part = select(
        card_source.c.card_id,
        card_source.c.card_source_id,
        (base.c.depth + 1).label("depth")
    ).join(base, card_source.c.card_source_id == base.c.card_id)

    # 3. Final Union
    return base.union_all(recursive_part)

def select_subtree(context_id: int, max_depth: int = None) -> Select:
    """
    Example of a DSL primitive: Select all cards in a subtree.
    Returns an unexecuted SQLAlchemy statement.
    """
    lineage = get_lineage_cte(context_id)
    stmt = select(lineage)
    if max_depth is not None:
        stmt = stmt.where(lineage.c.depth <= max_depth)
    return stmt
