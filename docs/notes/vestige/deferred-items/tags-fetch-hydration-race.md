# Tags-fetch hydration race (useAppBootstrap.ts)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `tags-fetch-hydration-race` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='tags-fetch-hydration-race'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-04-27 (during B5 finalization / identity-aware
  SyncService rework).
- **Concern:** `useAppBootstrap.onMounted` fires
  `backendService.getTags()` concurrently with `sync.connect()`'s
  hydration. If `getTags()` wins the race, the store mutation
  `store.profile = { ...store.profile, knownTags: ... }` runs
  first; then hydration's `updateFromRemote(doc.data)` overwrites
  the entire profile, dropping `knownTags`. Pre-existing; benign
  in practice (knownTags is re-fetchable on demand and isn't
  user-authored data), but it's a real ordering bug that an audit
  should pick up. Belongs to the same general category as the
  identity bug just closed in B5 finalization (race on async
  store mutations during boot).
- **Suggested next action:** Either await `sync.connect()`'s
  initial hydration before the tags fetch (requires sync to
  expose a `whenHydrated()` promise or similar), or move
  `knownTags` to a separate composable that watches
  `store.profile` and re-applies after any identity change.
  Defer to a future B-arc-style refinement; not blocking.

---

License: Public Domain (The Unlicense).
