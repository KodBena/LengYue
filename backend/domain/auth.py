"""
Auth domain module.

Currently exports one type: `UserId`, a branded `NewType` over `int`.
The brand exists to prevent accidental transposition of `user_id` and
`card_id` (and any other integer id we might introduce) at call sites
where both are present.

Pure module: stdlib only. No FastAPI, no Pydantic, no SQLAlchemy. The
brand is a compile-time discipline; at runtime UserId is just an int.

Why this lives in `domain/auth.py` rather than `core/` or
`repositories/`:

  - It's a domain concept (the identity of a tenant in our system),
    not a cross-cutting infrastructure concern (which is what `core/`
    is reserved for).
  - It will gain a sibling — a `User` entity — when the system grows
    user-profile fields beyond the current "id + username + bcrypt
    hash" minimum. That entity also belongs in `domain/`.
  - Co-locating with `domain/card.py` and the other domain modules
    means the Dependency Rule's import-graph honesty check
    (`assert 'sqlalchemy' not in sys.modules` after importing the
    domain package) keeps catching infrastructure leaks. This module
    inherits that discipline by virtue of its location.

Introduced in tenancy item 13 (the first item to thread `user_id`
through Port signatures). Items 14–25 follow this precedent.
"""
from typing import NewType

UserId = NewType("UserId", int)
"""
Branded integer for user identity.

Use at every call site where a user id passes through a Port, a
service method, or a route handler. The brand is what makes
transposition between user_id and other integer ids
(card_id, position_id, etc.) a static type error rather than a
runtime mystery.

Construction is explicit: `UserId(payload_int)` from the JWT decode
in `api/dependencies.get_current_user_id`. Callers downstream of
that point use `UserId` in their type annotations and pass values
through unchanged — `NewType` is a no-op at runtime, so there's no
performance cost and no behavioral difference compared to a plain
`int`.

Pydantic v2 understands NewType and respects it in model validation
without requiring `__get_pydantic_core_schema__` boilerplate, so any
future `User` entity or auth-related DTO can use UserId directly
in field annotations.
"""
