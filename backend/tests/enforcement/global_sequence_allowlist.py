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
UNLESS it appears here. One reason class appears below:

- **"named exception"** — the field intentionally carries the raw
  global-sequence PK because it plays a reference/addressing role
  (the frontend round-trips it to identify which row a request
  means) rather than a display role, and the codebase's own 404-
  not-403 tenancy invariant already prevents it from being used to
  probe cross-tenant existence. The design's Decision 4 is explicit
  that closing every such site is a larger, separately-scoped
  rewrite (the `GET /cards/{card_id}` path param is the design's own
  worked example).

Browse-leak-fix (ledger rows 417/423): the "deferred follow-on" class
that used to live here (`ForestStat.root_card_id`/`game_source_id`,
`ResolvedRoot.root_card_id`/`game_source_id`,
`TreeByRootResponse.root_card_id`/`game_source_id`) is CLOSED, not
just removed from this list — those fields no longer exist on the
wire at all. `/stats/forests` and `/lineage/*` now surface
`root_card_public_id` (UUID) / `game_source_display_ordinal` (int,
per-user) instead, neither of which is an id-shaped *integer* field,
so the schema-walk regex doesn't even consider them candidates
(`root_card_public_id` is a `string` (`format: uuid`) on the wire, and
while `game_source_display_ordinal` IS an integer, its name doesn't
match the `*_id`/`*_ids` pattern — both facts are asserted directly by
`test_global_sequence_schema_walk.py`'s plant-and-trip proof, not just
assumed). This is the reviewer's Top Finding from
`.claude/dispatch-reports/per-user-ids-review.md` fully closed: the
Browse tab (`ForestTreeNav.vue`) no longer has a raw global PK to
paint on screen.

`TreeNode.id`, `ResolvedRoot.card_ids_in_tree`, and
`ResolveRootsResponse.unmatched_card_ids` remain — reclassified from
"deferred follow-on" to "named exception" below, now that their
sibling display fields are fixed: they were never painted as digits
anywhere (`card-tree-echarts.ts` already renders `displayOrdinal`,
not `TreeNode.id`; the two array fields only ever echo back card ids
the caller supplied or already owns), so they are the same
addressing-only class as `CardWithRecall.id`'s exception above them.

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
    # ── Lineage tree-structure reference ids (browse-leak-fix reclassify) ───
    ("TreeNode", "id"): (
        "named exception: every node in the recursive card-tree "
        "structure carries the raw card PK, purely as a reference to "
        "key already-tenancy-scoped card data fetched elsewhere (the "
        "same class as CardWithRecall.id above) — never painted as a "
        "digit; card-tree-echarts.ts's on-canvas label reads "
        "displayOrdinal. Reclassified from 'deferred follow-on' by "
        "the browse-leak-fix pass, which closed the actual display "
        "leak (ForestStat/ResolvedRoot/TreeByRootResponse's "
        "root_card_id/game_source_id, now root_card_public_id/"
        "game_source_display_ordinal — no longer on this list because "
        "the fields no longer exist)."
    ),
    ("ResolvedRoot", "card_ids_in_tree"): (
        "named exception: array of raw card PKs grouped under a root "
        "— the caller's own input ids (obtained from an already-"
        "tenancy-scoped response, e.g. /forests/query's "
        "CardWithRecall.id) echoed back grouped by root, not a display "
        "value. Reclassified alongside TreeNode.id above."
    ),
    ("ResolveRootsResponse", "unmatched_card_ids"): (
        "named exception: array of raw card PKs the caller submitted "
        "that didn't resolve to an owned root — same reference-role "
        "reasoning as ResolvedRoot.card_ids_in_tree above."
    ),
}
