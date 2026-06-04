# Scattered non-coalescing timing literals

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `scattered-timing-literals` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='scattered-timing-literals'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-29.
- **Concern:** `frontend/src/lib/timing.ts` now centralises the
  reactivity-*coalescing* windows (debounce / throttle intervals)
  into one auditable surface. The adjacent timing literals of a
  *different* category remain scattered — each named and documented
  at its use-site, but not catalogued together: timeouts
  (`KATAGO_ANALYSIS_TIMEOUT_MS` 30 s in `useReviewSession`,
  `DEFAULT_TIMEOUT_MS` 60 s in `usePlayFromPosition`), display
  durations (`REVEAL_DURATION_MS` 8 s in `useTransientLogReveal`),
  and interaction delays (`DEFAULT_CLOSE_DELAY_MS` 150 ms in
  `useHoverPopover`). They were deliberately kept out of the
  coalescing refactor to preserve its semantic clarity — folding
  "how long before we give up" together with "how often we redraw"
  dilutes the "this is the coalescing tuning surface" reading.
- **Suggested next action:** Decide whether to (a) leave them in
  place (each is already magic-literal compliant — this is an
  auditability nicety, not a compliance gap), (b) add a sibling
  `timeouts` / `durations` catalog, or (c) extend `timing.ts` with
  clearly-sectioned categories. Low priority; the coalescing
  surface was the actual smell flagged by the user.

---

License: Public Domain (The Unlicense).
