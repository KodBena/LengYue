# Silent guard fail in handleLoadCardFromDatabase (App.vue)

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `silent-guard-handleloadcard` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `useDirtyBoardGuard`
  owns the policy; the silent early-return is replaced with an
  explicit `throw new Error(...)` if the modal ref is null at
  handler-call time. The handler in App.vue no longer exists;
  the contract is documented in the composable's JSDoc.

---

License: Public Domain (The Unlicense).
