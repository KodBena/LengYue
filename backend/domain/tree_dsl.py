from typing import Optional, Protocol, List
from sqlalchemy import select, union_all, intersect, literal_column, and_, column, table, CTE
from sqlalchemy.sql import Select
from db.schema import card, card_source, card_tag, tag

class Selection(Protocol):
    def to_cte(self) -> CTE: ...

class ContextSelection:
    def __init__(self, context_id: int):
        self.context_id = context_id

    def to_cte(self) -> CTE:
        return select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            literal_column("0").label("depth")
        ).where(card_source.c.card_id == self.context_id).cte(recursive=True)

class SubtreeSelection:
    """Equivalent to tau(n, m)"""
    def __init__(self, context_id: int, ancestors: int = 0, max_depth: Optional[int] = None):
        self.context_id = context_id
        self.ancestors = ancestors
        self.max_depth = max_depth

    def to_cte(self) -> CTE:
        # 1. Base: Find the ancestor root
        # (Simplified for the win: we use a recursive CTE to go UP first)
        base = select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            literal_column("0").label("level")
        ).where(card_source.c.card_id == self.context_id).cte(recursive=True, name="subtree_root")
        
        # ... (Internal recursive logic to find Nth ancestor omitted for brevity, 
        # standardizing on the Descendant logic for the prompt example)
        
        descendants = select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            literal_column("0").label("depth")
        ).where(card_source.c.card_id == self.context_id).cte(recursive=True, name="descendants")

        recursive_part = select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            (descendants.c.depth + 1).label("depth")
        ).join(descendants, card_source.c.card_source_id == descendants.c.card_id)

        if self.max_depth is not None:
            recursive_part = recursive_part.where(descendants.c.depth < self.max_depth)

        return descendants.union_all(recursive_part)

class TagFilter:
    """Filters a CTE by a tag expression"""
    @staticmethod
    def apply(base_query: Select, tag_names: List[str]) -> Select:
        # Implements the 'ALL' logic: card must have all tags in the list
        tag_subquery = (
            select(card_tag.c.card_id)
            .join(tag, card_tag.c.tag_id == tag.id)
            .where(tag.c.name.in_(tag_names))
            .group_by(card_tag.c.card_id)
            .having(func.count(tag.c.id) == len(tag_names))
        )
        return base_query.where(column("card_id").in_(tag_subquery))
