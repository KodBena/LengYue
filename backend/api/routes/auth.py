from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_db
from core.config import config
from core.security import create_access_token, get_password_hash, verify_password
from db.schema import users

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


class UserRegister(BaseModel):
    username: str
    password: Optional[str] = None


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
