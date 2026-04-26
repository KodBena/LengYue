# Frontend → Backend: GET /auth/me request

- **Date:** 2026-04-26
- **From:** frontend
- **To:** backend
- **Type:** request
- **Status:** drafted; awaiting backend response
- **Suggested filing:** `docs/dispatch/frontend-to-backend-auth-me.md`
  per ADR-0005's dispatch ledger convention.

## Why

The frontend SPA needs to verify the identity of the JWT-bearer at
runtime, independent of the username the user typed when they last
logged in.

The motivating failure is real and observed. A user with a stale
`ebisu_jwt_token` in localStorage (carried over from before the
tenancy spine landed) can see a SPA that displays "logged in as
local_user" while the JWT actually authenticates as `bork` — or vice
versa. The SPA currently has no way to detect this drift; it surfaces
only as "the data I expected isn't there." We hit exactly this case
during the auth UX work and walked through the diagnosis manually.

A canonical `/auth/me` endpoint resolves it: call once at bootstrap;
display what the backend says, not what localStorage cached.

## Proposed contract

```
GET /auth/me
Authorization: Bearer <jwt>

200 OK
Content-Type: application/json
{
  "id": 1,
  "username": "bork",
  "has_password": false
}

401 Unauthorized   (no token, expired token, or token for a deleted user)
```

Response field shape mirrors the `users` table fields the frontend
has already observed via direct SQLite inspection during diagnosis.
If the backend prefers a narrower projection (omit `has_password`,
etc.), name it explicitly so the frontend ACL adapts cleanly.

## Frontend usage

`composables/useAuth.ts` will call this endpoint once during
`tryAutoLogin()` after a token is present. The response populates an
`AuthState` value of the form
`{ kind: 'authenticated', username: <from-backend>, userId: <from-backend> }`.

A 401 drops the JWT (via the existing `api.clearToken()` method) and
transitions auth to `{ kind: 'unauthenticated' }`, which surfaces the
re-login affordance on the UI side. This is B5 of the auth UX
roadmap; B1–B4 ship without this endpoint.

## Compatibility and architectural fit

- **JWT contract**: unchanged. Same Bearer token, same 30-day expiry.
- **Tenancy spine**: read-only on the JWT itself; no Port threading
  needed. `get_current_user_id` plus a single `users` table lookup is
  sufficient. Per the codebase's ADR-0003, this endpoint is Band 1
  (truly domain-agnostic) and would carry over unchanged to a Chess
  or Shogi port.
- **Fail-loud per ADR-0002**: 401 on absent / invalid / orphaned
  token. No fallback projection, no implicit re-issue, no retry on
  this path.

## Estimated cost on backend

One route file; one `users.get_by_id` (or equivalent) call; no
schema, no migrations, no new Port. Should be a small commit.

## Blocking status

Frontend has shipped B1–B4 of the auth UX roadmap (`AuthState` value
type, `useAuth` composable, `UserBadge` component, `LoginModal` with
sign-in/register/sign-out). B5 — JWT identity verification and
recovery from stale-token drift — is the milestone that requires
this endpoint. No frontend work is blocked on it in the meantime;
B5 will land when the endpoint is available.

## Reply

When the endpoint ships, a brief acknowledgement back to
`docs/dispatch/backend-to-frontend-auth-me-status.md` is sufficient
— anything from "shipped, contract as proposed" to "shipped, with
the following deviations: …" lets the frontend implement B5 against
verified ground truth rather than inference.
