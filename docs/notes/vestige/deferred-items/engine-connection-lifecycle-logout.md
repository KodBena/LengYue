# Engine connection lifecycle on logout (deployment-model-dependent)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `engine-connection-lifecycle-logout` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='engine-connection-lifecycle-logout'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-04-27 (during auth-lifecycle UX planning,
  in dialogue with the user about the breakdown of "engine"
  state across user-owned vs runtime).
- **Concern:** `resetWorkspace` (added to `store/index.ts`)
  resets boards, activeBoardIndex, profile, and session on
  auth-identity loss but intentionally does NOT reset
  `store.engine` (status, metrics, activeMode, messages). The
  reasoning: under today's local-machine deployment, the
  WebSocket URL (`ws://127.0.0.1:8765/katago` per
  `defaults.ts:13`) is not user-keyed; User A's URL == User B's
  URL == default in practice, so the same physical socket
  serves both honestly. Half-resetting `store.engine` (e.g.,
  flipping `status` to `'disconnected'` while the socket is
  still open) would create a real ADR-0001 violation — runtime
  state lying about reality.
- **Trigger to revisit:** Any deployment-model shift that makes
  the WebSocket URL user-keyed. Concrete cases:
  - Cloud-compute KataGo where each user has a paid endpoint.
  - Rented per-user analysis (library / shared institution
    setting where users have distinct accounts on a
    shared-but-multi-tenant analysis service).
  - Auth-bearing analysis tokens (any setup where the
    WebSocket carries identity-specific credentials).
- **Suggested next action when triggered:** Extend
  `resetWorkspace` to also reset `store.engine` to its
  initial-construction shape (matching the literal at
  `store/index.ts:38–48`), AND wire
  `analysisService.disconnect()` (or the equivalent) into the
  reset path so the actual WebSocket tears down. The
  `analysisService` would need to expose a `disconnect()`
  method if it doesn't already; coupling the reset to the
  service is acceptable at that point because the engine
  becomes part of the user-identity dimension.
- **Adjacent observation:** The user's pushback during this
  planning that prompted the entry was structurally
  illuminating — the original framing ("machine-level vs
  user-level") didn't survive scrutiny because the user IS in
  control of connect/disconnect. The honest framing is
  user-keyed-or-not; this entry preserves that distinction
  for the future revisit.

---

License: Public Domain (The Unlicense).
