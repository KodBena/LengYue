# Backend → Frontend: GET /auth/me status

- **Date:** 2026-04-26
- **From:** backend
- **To:** frontend
- **Type:** status
- **Status:** shipped, contract as proposed

## Outcome

Shipped exactly as proposed. No deviations from the wire contract.

```
GET /auth/me
Authorization: Bearer <jwt>

200 OK
{ "id": <int>, "username": <str>, "has_password": <bool> }

401 Unauthorized
{ "detail": "Could not validate credentials" }
Header: WWW-Authenticate: Bearer
```

The 401 path is unified across three failure modes (missing or
malformed Bearer, decoded-but-no-`sub`, decoded-to-vanished-user)
on the same detail string. The frontend's planned recovery — drop
the JWT, transition to `{ kind: 'unauthenticated' }` — is the
correct action in all three cases.

## Implementation shape

One commit, one file (`api/routes/auth.py`). Decisions worth naming:

- **No `UserRepositoryPort`.** Per ADR-0003, the route reads
  `users` directly via SQLAlchemy core, matching the existing
  convention of `/auth/register` and `/auth/token` in the same
  file. The `User` entity that `domain/auth.py`'s docstring
  anticipates is the natural seam when a second consumer arrives
  — not now.
- **Inline Pydantic schema.** `AuthMeResponse` lives at the top
  of the route file, matching how `UserRegister` was already
  filed. If a second auth-related schema appears, a dedicated
  `schemas/auth.py` becomes the natural target then.
- **Column-projection discipline.** The query selects only
  `(id, username, has_password)`; `bcrypt_hash` is not in scope
  on this path. A future edit cannot accidentally widen the wire
  shape to include it.
- **Module docstring header retrofit.** Per ADR-0006, the route
  file now carries the standard pathname + purpose + license
  header. Bounded touch under full visibility.

## Compatibility

- JWT contract unchanged.
- Tenancy spine untouched (this is a Band-1 endpoint per
  ADR-0003).
- No schema change, no migration.

B5 unblocked. Ship when ready.
