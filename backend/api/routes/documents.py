from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user_id, get_db
from db.schema import documents
from domain.auth import UserId

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentUpdate(BaseModel):
    data: Dict[str, Any]


@router.get("/{key}")
async def get_document(
    key: str,
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),  # Item 23 (active).
):
    """
    Fetch a document by (key, user_id). Returns an empty payload if
    no row exists — this preserves the frontend's "missing = empty"
    contract (sync-service.ts assumes a fresh install gets {} back,
    not 404; item 5 on the frontend documented this).

    Item 23 (tenancy): each user gets their own value for any given
    key. User A's writes under "user_workspace_settings" are
    invisible to user B; user B starts fresh. The empty-payload
    convention for missing rows applies per-user, so a brand new
    user reading any key gets {}.
    """
    query = select(documents.c.data).where(
        (documents.c.key == key) & (documents.c.user_id == user_id)
    )
    result = await db.execute(query)
    row = result.fetchone()
    if not row:
        return {"key": key, "data": {}}
    return {"key": key, "data": row.data}


@router.put("/{key}")
async def update_document(
    key: str,
    doc: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),  # Item 23 (active).
):
    """
    Stateless upsert for document data. Works natively on both
    Postgres and SQLite via the SELECT-then-conditional-INSERT
    pattern (avoids dialect-specific ON CONFLICT / INSERT OR REPLACE).

    Item 23 (tenancy): the existence check filters by (key, user_id).
    Without this, user B's first write under a key already used by
    user A would fall into the UPDATE branch — and update zero rows
    (the WHERE wouldn't match user B's pair), silently failing to
    persist. Filtering both the existence check and the UPDATE's
    WHERE makes the upsert correct per-tenant.

    The composite primary key (key, user_id) on the documents table
    enforces the invariant at the database level: a per-user UPSERT
    cannot collide with another user's row.
    """
    find_stmt = select(documents.c.key).where(
        (documents.c.key == key) & (documents.c.user_id == user_id)
    )
    exists = (await db.execute(find_stmt)).fetchone()

    if exists:
        stmt = (
            update(documents)
            .where(documents.c.key == key)
            .where(documents.c.user_id == user_id)
            .values(data=doc.data)
        )
    else:
        stmt = insert(documents).values(
            key=key, user_id=user_id, data=doc.data
        )

    await db.execute(stmt)
    await db.commit()
    return {"status": "ok"}
