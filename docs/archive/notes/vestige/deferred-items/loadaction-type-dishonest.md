# LoadAction type is dishonest (ConfirmLoadModal.vue)

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `loadaction-type-dishonest` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `ConfirmLoadModal` now
  exposes `Promise<LoadResult>` with the structured
  `{ action, remember }` pair — the more honest shape recommended
  in the original entry. The `as LoadAction` cast is gone.

---

License: Public Domain (The Unlicense).
