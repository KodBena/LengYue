-- research/cards_query.sql
--
-- Find cards tagged with a given tag whose card→card_source→…→game_source
-- chain bottoms out at a specified game_source_id. The chain is recursive
-- because card_source.card_source_id can chain to another card (which
-- itself has a card_source row), and the game_source link is only set on
-- the root of that tree.
--
-- Parameters (sqlite3 :name binding):
--   :tag_id         e.g. 2210 (volatile)
--   :game_source_id e.g. 2649
--   :min_reviews    e.g. 1 (use 0 for "all")
--
-- Example:
--   sqlite3 -bail -header -column backend/cards.db <<EOF
--   .parameter set :tag_id 2210
--   .parameter set :game_source_id 2649
--   .parameter set :min_reviews 1
--   .read research/cards_query.sql
--   EOF
--
-- Returns one row per matching card with id, num_moves, num_reviews,
-- canonical SGF text, and last review timestamp.
--
-- License: Public Domain (The Unlicense)

WITH RECURSIVE card_to_gs(card_id, game_source_id) AS (
  -- Base: cards directly linked to a game_source
  SELECT card_id, game_source_id
    FROM card_source
   WHERE game_source_id IS NOT NULL

  UNION ALL

  -- Recurse: cards linked to a parent card whose chain we already know
  SELECT cs.card_id, ctg.game_source_id
    FROM card_source cs
    JOIN card_to_gs ctg ON ctg.card_id = cs.card_source_id
)
SELECT
  c.id              AS card_id,
  c.num_moves,
  c.num_reviews,
  c.last_reviewed_at,
  c.suspended,
  np.canonical_content AS sgf
FROM card c
JOIN card_tag ct       ON ct.card_id = c.id  AND ct.tag_id = :tag_id
JOIN card_to_gs ctg    ON ctg.card_id = c.id
JOIN normalized_position np ON np.id = c.normalized_position_id
WHERE ctg.game_source_id = :game_source_id
  AND c.num_reviews >= :min_reviews
ORDER BY c.num_reviews DESC, c.num_moves, c.id;
