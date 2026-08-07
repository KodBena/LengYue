"""
schemas/stats.py

Wire shapes for the /stats/* routes.

Browse-leak-fix (ledger rows 417/423): `ForestStat.root_card_id` /
`game_source_id` carried the raw global-sequence PKs and were painted
as literal `#`-ids in the Browse tab (`ForestTreeNav.vue`) — the last
hole in the per-user-id non-leak guarantee. Replaced with
`root_card_public_id` (the root card's `public_id` UUID — the
addressing handle `/lineage/tree-by-root` now accepts) and
`game_source_display_ordinal` (the game-source's per-user ordinal,
unique per `(user_id, display_ordinal)` so it doubles as a valid
tenant-scoped addressing value even though nothing currently
round-trips it). Both columns were already backfilled by the
per-user-id-enumeration migration (0004); no new schema change.

License: Public Domain (The Unlicense)
"""
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel


class TagStat(BaseModel):
    name: str
    count: int


class ForestStat(BaseModel):
    # The pivot id required for the Tree DSL and for addressing
    # /lineage/tree-by-root — per-user display ids, not the raw PKs
    # (browse-leak-fix).
    root_card_public_id: UUID
    game_source_display_ordinal: int
    description: Optional[str]
    player_white: Optional[str]
    player_black: Optional[str]
    total_cards: int
    total_reviews: int
    average_recall: float
