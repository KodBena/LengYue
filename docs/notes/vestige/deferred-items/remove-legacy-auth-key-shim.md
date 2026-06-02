# Remove legacy auth-key compat shim (api-client.ts)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `remove-legacy-auth-key-shim` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='remove-legacy-auth-key-shim'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-04-27 (during de-branding round 2).
- **Concern:** `api-client.ts` carries a one-shot compat shim
  (`migrateLegacyAuthKeys()`) that migrates from the
  pre-de-branding identifiers `'ebisu_jwt_token'` /
  `'ebisu_username'` to the canonical `'auth_token'` /
  `'auth_username'` on module init. Per ADR-0002 documented
  exception #3, it's a bounded-and-scheduled-for-removal compat
  shim. Once monitoring confirms no users still carry the
  legacy keys (or after a release cycle), the shim can be
  removed.
- **Suggested next action:** Open a small cleanup PR removing
  the function definition and its single call. ~30 lines
  deletion (function + comments). The relevant TODO Medium-tier
  entry already retired in the de-branding round 2 PR; this
  entry is the follow-on shim-removal target.

---

License: Public Domain (The Unlicense).
