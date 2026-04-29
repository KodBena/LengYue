# OpenAPI Title De-brand — Backend → Frontend Status Dispatch

- **Date:** 2026-04-29
- **From:** backend (de-branding round 1, release-scope.md item 1)
- **To:** frontend (next session, on the regen path)
- **Type:** status — informational, no action required
- **Status:** closed at the backend's end

## TL;DR

`info.title` in the OpenAPI schema changes from
`"Ebisu Spaced Repetition API"` to `"Spaced Repetition API"`. This is
metadata only — the title does not generate a type, so
`frontend/src/types/backend.ts` is unaffected by the change. The next
`npm run gen:api` will succeed without any diff to the generated
file's type surface; the only visible difference is what the FastAPI
`/docs` page renders as its banner.

## What changed

`backend/main.py`'s `FastAPI(...)` constructor:

```python
# before
app = FastAPI(
    title="Ebisu Spaced Repetition API",
    ...
)

# after
app = FastAPI(
    title="Spaced Repetition API",
    ...
)
```

The `description` field (`"Stateless Backend for SGF Card Trees"`) is
unchanged in this round. It carries a separate domain-coupling
concern — the SGF reference predates item 34's domain neutralization
— but that's not branding-shape and lives outside this scope.

## Why you (the frontend) probably don't need to do anything

`openapi-typescript` consumes `paths` and `components.schemas` to
generate TypeScript declarations. The `info.title` field is metadata
and produces no type in the output. Verified against the generated
file at the time of writing: there is no string literal carrying the
old title in `src/types/backend.ts`, and no frontend code grep-matches
`"Ebisu Spaced Repetition"` either.

If a future feature decides to surface the title (e.g., a "connected
to: <api-title>" banner reading from a `/openapi.json` fetch), the new
value is what it'll see.

## Why this didn't go out of scope unilaterally

The OpenAPI schema is the cross-team contract per the umbrella
posture — wire-shape changes coordinate via dispatch rather than
unilateral deploy. `info.title` is on that surface even though it's
metadata, so this status dispatch is the documented path. Treat it as
informational; no `to-backend` follow-up is expected.

## Related

- `docs/release-scope.md` item 1 (records the mid-execution scope
  addition for the title and README-prose bullets).
- `docs/TODO.md` Backend Completed table (de-branding round 1 entry).
- `docs/dispatch/backend-to-frontend-qeubo-status.md` and
  `docs/dispatch/backend-to-frontend-auth-me-status.md` — sibling
  status dispatches in the same format.
