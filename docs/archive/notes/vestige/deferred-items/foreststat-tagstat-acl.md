# ForestStat / TagStat — wire-shape passthrough at the ACL boundary

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `foreststat-tagstat-acl` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Surfaced:** 2026-05-03. **Closed:** 2026-05-06 in PR
  `frontend/foreststat-tagstat-acl`. Worklog:
  `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-foreststat-tagstat-acl-translator.md`.
  Pre-PR-0 of the Forest Directory hierarchical redesign arc.
- **Outcome (ForestStat — real fix):** `mapForestStat` translator
  added at `services/backend-service.ts`; `ForestStat` in
  `types.ts` rewritten to camelCase with branded ids
  (`rootCardId: CardId`, `gameSourceId: GameSourceId`); nullable
  metadata strings (`description`, `playerWhite`, `playerBlack`)
  preserved as `string | null` per ADR-0002 ("validate, not
  coerce" — consumers handle the no-metadata case at the
  presentation boundary). Five consumer sites swept:
  `useCardTreeData.ts` (one cast), `ForestDirectory.vue` (template
  + script, two casts), `card-tree-echarts.ts` (tooltip composer).
  Counts (`totalCards`, `totalReviews`, `averageRecall`) stay bare
  per the entry's own "brand the meaningful, not the trivial"
  recommendation.
- **Outcome (TagStat — structural-redundancy translator):**
  `mapTagStat` translator added even though wire and domain
  shapes are field-for-field identical (no snake_case to
  rename, no ids to brand). Documented at the type declaration
  and the translator site as a forward-looking indirection point —
  if backend ever renames `name` or adds a field, the boundary
  exists. The honesty trade-off is recorded in the worklog: a
  no-op translator is a small ADR-0002 lie of its own (looks like
  ACL work, does none). The deferred-items entry's framing of
  TagStat as a discipline gap won the call; the convention
  argument was the deciding factor.
- **Settled direction recorded:** future ACL passthroughs that
  share field shapes with the wire by accident still get a
  translator stub at the boundary, with a doc comment naming the
  redundancy explicitly so future readers don't conclude the ACL
  has nothing to do.

---

License: Public Domain (The Unlicense).
