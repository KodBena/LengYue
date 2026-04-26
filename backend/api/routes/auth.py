"""
api/routes/auth.py

Authentication routes — registration, password-grant token issuance,
and JWT-bearer identity verification.

Three endpoints, one file:

  - POST /auth/register   create a (possibly passwordless) user
  - POST /auth/token      OAuth2 password-grant: username+password → JWT
  - GET  /auth/me         project the current JWT-bearer's identity

The file talks directly to the `users` table via SQLAlchemy core. There
is no `UserRepositoryPort`: per ADR-0003, abstractions are extracted
when a second concrete consumer exists, and auth currently has only
itself. The shape `domain/auth.py`'s docstring anticipates (a `User`
entity with profile fields) is the natural seam for the day a second
consumer arrives — not today.

License: Public Domain (The Unlicense)
"""
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user_id, get_db
from core.config import config
from core.security import create_access_token, get_password_hash, verify_password
from db.schema import users
from domain.auth import UserId

router = APIRouter(prefix="/auth", tags=["authentication"])


# A single, opaque error message for every authentication failure path.
# Distinguishing "user not found" from "wrong password" lets attackers
# enumerate valid usernames; collapsing them removes that information
# channel without costing legitimate users anything. Item 9c.
#
# Note: a residual timing channel remains — bcrypt verification on the
# wrong-password path is measurably slower than the user-not-found and
# passwordless-disabled paths. Closing that fully requires a dummy
# bcrypt check on the no-credentials paths; tracked separately as a
# follow-up to the trivial sweep.
_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid username or password",
    headers={"WWW-Authenticate": "Bearer"},
)


# Distinct from _INVALID_CREDENTIALS: this path is reached after a JWT
# has been successfully decoded by get_current_user_id, but the user_id
# in the `sub` claim no longer corresponds to a row in the users table
# (account deleted between token issuance and use). The detail mirrors
# get_current_user_id's own 401 message so the client cannot distinguish
# "your token is malformed" from "your token references a vanished
# account" — the recovery action is identical (drop the token, re-auth).
_INVALID_TOKEN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


class UserRegister(BaseModel):
    username: str
    password: Optional[str] = None


class AuthMeResponse(BaseModel):
    """
    Identity-projection wire shape for GET /auth/me.

    Mirrors the three non-credential columns of the `users` table.
    `bcrypt_hash` is intentionally absent — it never crosses the wire.
    """
    model_config = ConfigDict(frozen=True)

    id: int
    username: str
    has_password: bool


@router.post("/register", status_code=201)
async def register_user(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """
    Create a new user. If no password is provided, the account is
    passwordless and login is governed by config.ALLOW_PASSWORDLESS_LOGIN
    at the token endpoint.
    """
    existing_query = select(users).where(users.c.username == data.username)
    if (await db.execute(existing_query)).fetchone():
        raise HTTPException(status_code=400, detail="Username already registered")

    stmt = insert(users).values(
        username=data.username,
        bcrypt_hash=get_password_hash(data.password) if data.password else None,
        has_password=bool(data.password),
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "user created"}


@router.post("/token", response_model=Dict[str, str])
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    query = select(users).where(users.c.username == form_data.username)
    result = await db.execute(query)
    user = result.fetchone()

    # All failure paths converge on the same exception so the response does
    # not betray *why* the login failed (does the user exist? wrong password?
    # passwordless login disabled?). Item 9c.
    if not user:
        raise _INVALID_CREDENTIALS

    if user.has_password:
        if not form_data.password or not verify_password(
            form_data.password, user.bcrypt_hash
        ):
            raise _INVALID_CREDENTIALS
    else:
        # Passwordless account. The single switch that flips the system
        # between transparent local install and multi-tenant deployment.
        # Item 9.
        if not config.ALLOW_PASSWORDLESS_LOGIN:
            raise _INVALID_CREDENTIALS

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=AuthMeResponse)
async def read_current_user(
    user_id: UserId = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Project the JWT-bearer's identity to the wire.

    Resolves the drift surfaced when a stale token in localStorage
    authenticates as one user while the SPA displays another. The SPA
    calls this once at bootstrap and trusts what the backend returns
    over what its own cache claims.

    Three 401 paths converge on the standard credentials-validation
    response:
      - missing / malformed Bearer (handled by get_current_user_id)
      - JWT decodes but `sub` is missing or unparseable (same dep)
      - JWT decodes to a user_id whose row no longer exists (here)
    All three drop the token client-side; the WWW-Authenticate: Bearer
    header signals OAuth2-aware clients to re-auth.

    The query projects only (id, username, has_password). The bcrypt
    hash is never read into the route layer — a future edit cannot
    accidentally widen AuthMeResponse to include it because the column
    is not in scope here.
    """
    query = select(users.c.id, users.c.username, users.c.has_password).where(
        users.c.id == int(user_id)
    )
    row = (await db.execute(query)).fetchone()
    if row is None:
        raise _INVALID_TOKEN
    return AuthMeResponse(
        id=row.id,
        username=row.username,
        has_password=row.has_password,
    )
