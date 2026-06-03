# Worklog — remove the legacy auth-key compat shim (2026-06-03)

## Trigger

Work-status item `remove-legacy-auth-key-shim` (frontend / small). `api-client.ts`
carried a one-shot `migrateLegacyAuthKeys()` localStorage shim (run at module
init) that renamed the pre-de-branding keys `ebisu_jwt_token` / `ebisu_username`
→ the canonical `auth_token` / `auth_username`. Per ADR-0002 documented
exception #3 (bounded-and-scheduled-for-removal compat shim), it was always a
removal target "once monitoring confirms no users still carry the legacy keys."

## Precondition check

The removal orphans any not-yet-migrated legacy keys, so the precondition
matters. It holds: LengYue runs as a single-operator local install
(`ALLOW_PASSWORDLESS_LOGIN=True`), the operator's own browser migrated on the
first load after the shim shipped, and there is no public/hosted deployment yet
(distribution packaging is the named roadmap blocker before deployment). So no
browser in the wild still holds `ebisu_*` keys. (Surfaced for QA: if a stale
browser profile somewhere predates the rename, it would re-run `ensureAuthenticated`
and transparently re-auth as `local_user` — it loses only a cached token, not data.)

## What changed

`frontend/src/services/api-client.ts` — removed the `migrateLegacyAuthKeys()`
function (15 lines), its module-init call, and its JSDoc. The JSDoc's pointer to
the deferred-items ledger (dissolved in the 2026-06-02 doc consolidation) went
with it — one fewer dangling reference. The `TOKEN_KEY` /
`USER_KEY` constants and every read/write site are unchanged; the canonical keys
have been the only ones written since the shim shipped.

## Verification

`npm run build` (`vue-tsc -b && vite build`) green; `eslint` clean on the file.
No test referenced the shim (grep for `migrateLegacyAuthKeys` / `ebisu_*` finds
only the removed code), so nothing to retire on the test side. Closes
`remove-legacy-auth-key-shim`.

License: Public Domain (The Unlicense).
