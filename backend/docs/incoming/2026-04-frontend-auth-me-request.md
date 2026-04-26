# Frontend → Backend: GET /auth/me request

- **Date:** 2026-04-26
- **Author:** frontend
- **Type:** request
- **Status:** drafted

## Why

The frontend SPA needs to verify the identity of the JWT-bearer at
runtime, independent of the username the user typed when they last
logged in.

The motivating failure is real. A user with a stale `ebisu_jwt_token`
in localStorage (carried over from before the tenancy spine landed)
can see a SPA that displays "logged in as local_user" while the JWT
authenticates as bork — or vice versa. The SPA currently has no way
to detect this drift; it surfaces only as "the data I expected
isn't there."

A canonical /auth/me endpoint resolves it: call once at bootstrap;
display what the backend says, not what localStorage cached.

## Proposed contract
GET /auth/me
Authorization: Bearer <jwt>

200 OK
Content-Type: application/json
{
"id": 1,
"username": "bork",
"has_password": false
}

401 Unauthorized (no token, expired token, or token for a deleted user)
The shape mirrors the `users` table fields the frontend has already
observed via direct SQLite inspection. If the backend prefers a
narrower projection (omit `has_password`, etc.), name it explicitly
so the ACL adapts cleanly.

## Frontend usage

`composables/useAuth.ts` will call this endpoint once during
`tryAutoLogin()` after a token is present. The response populates an
`AuthState` value of the form
`{ kind: 'authenticated', username: <from-backend>, userId: <from-backend> }`.

A 401 drops the JWT and transitions auth to `{ kind: 'unauthenticated' }`,
which on the UI surfaces a re-login affordance (B5 milestone).

## Compatibility

- **JWT contract**: unchanged. Same Bearer token, same 30-day expiry.
- **Tenancy spine**: read-only on the JWT itself; no Port threading
  needed. `get_current_user_id` + a single `users` lookup is sufficient.
- **Fail-loud (ADR-0002)**: 401 on absent/invalid/orphaned token. No
  fallback projection, no implicit re-issue.

## Estimated cost on backend

One route file; one `users.get_by_id` call; no schema, no migrations,
no new Port. Should be a small commit.

## Blocking

Frontend can land B1–B4 of the auth UX roadmap without this endpoint.
B5 (identity verification + stale-token recovery) is the milestone
that requires it.

