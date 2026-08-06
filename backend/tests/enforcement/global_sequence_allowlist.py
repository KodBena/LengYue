"""
tests/enforcement/global_sequence_allowlist.py

The exception list for the OpenAPI schema-walk enforcement test
(`test_global_sequence_schema_walk.py`). Per the per-user-id-
enumeration design's amendment
(`.claude/dispatch-reports/per-user-id-enumeration-design.md`,
Decision 7.1): "exceptions enumerated, never silent."

Every entry is `(schema_name, field_name): reason`. The schema-walk
test flags any `integer`-typed field on any OpenAPI component schema
whose name matches an id-shaped pattern (`*_id` or exactly `id`)
UNLESS it appears here. Two reason classes appear below:

- **"named exception"** — the field intentionally carries the raw
  global-sequence PK because it plays a reference/addressing role
  (the frontend round-trips it to identify which row a request
  means) rather than a display role, and the codebase's own 404-
  not-403 tenancy invariant already prevents it from being used to
  probe cross-tenant existence. The design's Decision 4 is explicit
  that closing every such site is a larger, separately-scoped
  rewrite (the `GET /cards/{card_id}` path param is the design's own
  worked example).

- **"deferred follow-on"** — a field this build pass identified as
  the same leak class but did NOT rewire to an opaque/display value,
  because doing so requires threading `public_id`/`client_game_id`
  through `LineageRepository`'s recursive CTEs (a materially larger,
  independently-resumable unit) or an equivalent adapter change for
  `StatsRepository`. Named here rather than silently left uncovered
  — see the per-user-ids build report for the full rationale. A
  future build closing this class removes the corresponding row(s)
  here; the schema-walk test's job is to ensure nothing *new* joins
  this list by accident, not that this list is empty.

License: Public Domain (The Unlicense)
"""
from typing import Dict, Tuple

GLOBAL_SEQUENCE_ALLOWLIST: Dict[Tuple[str, str], str] = {
    # ── Named exceptions (Decision 4's path-param precedent) ────────────────
    ("CardWithRecall", "id"): (
        "named exception: raw card PK, addressing value for "
        "GET /cards/{card_id} (already a named exception at the path-"
        "param level) and every same-shape response (PATCH, review, "
        "POST /forests/query). Never used for display — display_ordinal "
        "covers that role."
    ),
    ("CardWithRecall", "card_source_id"): (
        "named exception: raw parent-card PK, the frontend's card-tree "
        "parent-linking reference — same addressing role as `id` above, "
        "not display."
    ),
    ("CardCreateResponse", "card_id"): (
        "named exception: raw card PK, kept alongside the new public_id/"
        "display_ordinal fields so the frontend can still address "
        "GET /cards/{card_id} immediately after creation without a "
        "second round trip to learn the PK. Build-time decision — see "
        "the per-user-ids build report."
    ),
    ("LibraryGameListItem", "id"): (
        "named exception: raw game_source PK, addressing value for "
        "GET/DELETE /library/games/{id}. display_ordinal covers the "
        "display role."
    ),
    ("LibraryGame", "id"): (
        "named exception: same as LibraryGameListItem.id above."
    ),
    ("ImportOutcomeCreated", "game_id"): (
        "named exception: raw game_source PK returned from a batch "
        "import so the caller can address GET/DELETE /library/"
        "games/{id} for the just-created row. Same class as "
        "LibraryGameListItem.id."
    ),
    ("ImportOutcomeDeduplicated", "game_id"): (
        "named exception: same as ImportOutcomeCreated.game_id above "
        "— the existing row's addressing PK."
    ),
    ("AuthMeResponse", "id"): (
        "not a leak: the caller's OWN user id, returned only to that "
        "same user. No cross-tenant cardinality signal is possible — "
        "every user always sees exactly their own single id, never "
        "another tenant's count or position in a sequence."
    ),
    # ── Deferred follow-on (lineage + forest-stats CTEs) ─────────────────────
    ("ResolvedRoot", "root_card_id"): (
        "deferred follow-on: /lineage/resolve-roots' root_card_id is "
        "still the raw PK. Rewiring to public_id needs "
        "LineageRepository.resolve_roots' CTE to select+join card."
        "public_id; not done in this build pass."
    ),
    ("ResolvedRoot", "game_source_id"): (
        "deferred follow-on: same CTE-threading gap as root_card_id "
        "above, for game_source.client_game_id."
    ),
    ("TreeByRootResponse", "root_card_id"): (
        "deferred follow-on: /lineage/tree-by-root's root context id, "
        "same gap as ResolvedRoot.root_card_id."
    ),
    ("TreeByRootResponse", "game_source_id"): (
        "deferred follow-on: same gap as ResolvedRoot.game_source_id."
    ),
    ("TreeNode", "id"): (
        "deferred follow-on: every node in the recursive card-tree "
        "structure carries the raw card PK. Rewiring needs "
        "LineageRepository.fetch_tree_by_root's recursive CTE to carry "
        "card.public_id at every level, not just the root."
    ),
    ("ForestStat", "root_card_id"): (
        "deferred follow-on: GET /stats/forests' per-forest pivot id. "
        "Same leak class as the lineage endpoints, not in scope for "
        "this build pass — StatsRepository.fetch_forest_members would "
        "need the same CTE-threading treatment."
    ),
    ("ForestStat", "game_source_id"): (
        "deferred follow-on: same gap as ForestStat.root_card_id."
    ),
    # ── Array-of-id fields (same deferred class, plural wire names) ─────────
    ("ResolvedRoot", "card_ids_in_tree"): (
        "deferred follow-on: array of raw card PKs grouped under a "
        "root — same CTE-threading gap as ResolvedRoot.root_card_id."
    ),
    ("ResolveRootsResponse", "unmatched_card_ids"): (
        "deferred follow-on: array of raw card PKs the caller submitted "
        "that didn't resolve to an owned root — same gap."
    ),
}

