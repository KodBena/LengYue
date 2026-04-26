from pydantic import BaseModel
from typing import Optional, List

class TagStat(BaseModel):
    name: str
    count: int

class ForestStat(BaseModel):
    root_card_id: int      # The pivot ID required for the Tree DSL
    game_source_id: int
    description: Optional[str]
    player_white: Optional[str]
    player_black: Optional[str]
    total_cards: int
    total_reviews: int
    average_recall: float
