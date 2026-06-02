# Refactoring queue from ADR-0007

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `refactoring-queue-adr0007` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='refactoring-queue-adr0007'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-04-26 (during ADR-0007 drafting).
  **Refreshed:** 2026-05-06 with current line counts; the
  pre-refresh entry's claims about App.vue (`591 lines`,
  "first target after B5") were stale relative to ongoing
  incremental refactoring work.
- **Concern:** Files failing ADR-0007's single-view test (red
  flag, > 300 lines) need to be queued for refactoring. Current
  counts (sampled 2026-05-06):
  - `App.vue` (513 lines) — already a focus of incremental
    refactor work (down from 591 at original audit time);
    Vue SFC's "template + style" sections make trimming below
    250 hard, even after composable extractions and child-
    component splits. The "god component" framing is no longer
    accurate; it's now an orchestrator that hosts multiple
    tabs and dispatches to extracted children.
  - `PaletteEditor.vue` (531 lines).
  - `useReviewSession.ts` (483 lines) — state-machine
    exception likely applies; verify before refactoring.
  - `HorizontalTimelineVisualizer.vue` (392 lines).
  - `MintCardModal.vue` (393 lines).
  - `BaseChart.vue` (345 lines).
  - `types.ts` (953 lines) — type-catalogue exception applies;
    no action needed unless a clean domain seam appears.
  - `ForestDirectory.vue` (~335 lines post-2026-05-06 redesign;
    `useForestBrowsePolicy` extraction kept it from growing
    further past budget; further refactor is feasible but not
    high-priority).
  Yellow flag (200–300): `CardSetEditor.vue`, `TreeWidget.vue`,
  `MoveSuggestions.vue`, `BoardDisplay.vue`. Review on next touch
  per ADR-0007.
- **Suggested next action:** No batch refactor — handle
  incrementally per ADR-0004's posture. With App.vue already
  trending down from incremental work, `PaletteEditor.vue`
  (currently the largest non-App SFC) and `useReviewSession.ts`
  (the largest TS file outside type-catalogue exceptions) are
  the natural next targets when bandwidth opens up.

---

License: Public Domain (The Unlicense).
