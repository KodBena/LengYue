"""
api/routes/lineage.py

Card-tree endpoints — the backend half of release-scope item 3.

Two thin POST endpoints, each backed by a method on
`LineageRepositoryPort`:

  - POST /lineage/resolve-roots  → group input card ids by their
                                   game-source root
  - POST /lineage/tree-by-root   → fetch a structure-only subtree
                                   from a verified root

The wire shapes (Pydantic models below) live in this file rather than
in `schemas/` per the backend's authoring posture: the auth/me
worked example showed that a dedicated schemas module becomes the
natural target only when a second consumer for the same shape
appears (see `backend/CLAUDE.md`'s "Pydantic and FastAPI boundary
discipline" section). Both shapes are wire-only here; the equivalent
domain types (`RootResolution`, `CardTree`) live in `domain/lineage.py`
and the route layer projects between the two at this boundary.

The split — wire types here, domain types in `domain/lineage.py` —
matters because:

  - Wire types are owned by the route (HTTP concerns: serialization,
    field naming).
  - Domain types are owned by the Port (domain semantics, frozen,
    reusable across consumers).

For the v1 contract the two are structurally identical; if the wire
ever needs to drift (e.g. add an `etag` field for caching) the seam
is already there.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from api.dependencies import get_current_user_id, get_lineage_repo
from domain.auth import UserId
from domain.errors import CardNotFoundError, LineageOverflowError
from repositories.ports import LineageRepositoryPort

router = APIRouter(prefix="/lineage", tags=["lineage"])


# =====================================================================
# Wire shapes — request and response.
# =====================================================================


class ResolveRootsRequest(BaseModel):
    """
    Bulk input to /lineage/resolve-roots: a list of card ids the
    caller wants grouped by their game-source root.

    Empty list is a valid input (resolve-roots returns an empty
    response). The route does not impose an upper bound on list size;
    the underlying CTE is one round trip regardless of input length.
    """
    card_ids: List[int]


class ResolvedRoot(BaseModel):
    """One game-source root and the input cards that descend from it."""
    model_config = ConfigDict(frozen=True)

    root_card_id: int
    game_source_id: int
    card_ids_in_tree: List[int]


class ResolveRootsResponse(BaseModel):
    """
    Response shape for /lineage/resolve-roots.

    `roots` and `unmatched_card_ids` partition the original input —
    every input id appears in exactly one of the two — so the caller
    knows whether a missing id was unowned or never existed (the
    bulk lift of the per-card 404-not-403 invariant).
    """
    model_config = ConfigDict(frozen=True)

    roots: List[ResolvedRoot]
    unmatched_card_ids: List[int]


class TreeByRootRequest(BaseModel):
    """
    Input to /lineage/tree-by-root.

    `max_nodes` defaults to 10000 per the spec. The route accepts an
    explicit override if the caller knows it wants a smaller cap (e.g.
    a UI that previews only the top of a tree); the lower bound is
    1, enforced at the Pydantic layer rather than discovered as a
    runtime overflow.
    """
    root_card_id: int
    max_nodes: Optional[int] = Field(default=10000, ge=1)


class TreeNode(BaseModel):
    """A recursive structure-only tree node: id and children only."""
    model_config = ConfigDict(frozen=True)

    id: int
    children: List["TreeNode"]


class TreeByRootResponse(BaseModel):
    """
    Response shape for /lineage/tree-by-root.

    On overflow the route returns 422 with a structured detail body
    (see `_overflow_detail` below) instead of this shape.
    """
    model_config = ConfigDict(frozen=True)

    root_card_id: int
    game_source_id: int
    tree: TreeNode


TreeNode.model_rebuild()


# =====================================================================
# Routes.
# =====================================================================


def _project_card_tree_to_wire(domain_tree) -> TreeNode:
    """
    Iterative projection from the domain `CardTree` (frozen Pydantic,
    in domain/lineage.py) to the wire `TreeNode` shape.

    Iterative rather than recursive: `fetch_tree_by_root` produces
    trees up to `max_nodes` deep in the worst case (a linear chain),
    which would exhaust Python's default 1000-frame recursion limit
    at the higher end of the cap.

    `id()` (Python's object identity) is the dict key because
    domain `CardTree` is frozen and per-instance — two semantically
    identical subtrees are still distinct objects, and that's what
    we want to key on (we're walking the tree we received, not
    deduplicating across it).
    """
    built: dict[int, TreeNode] = {}
    # Two-phase post-order: same pattern the adapter uses to assemble
    # the CardTree, applied here to project it to TreeNode.
    stack: list[tuple[object, bool]] = [(domain_tree, False)]
    while stack:
        node, processed = stack.pop()
        if processed:
            built[id(node)] = TreeNode(
                id=node.id,
                children=[built[id(c)] for c in node.children],
            )
        else:
            stack.append((node, True))
            for child in node.children:
                stack.append((child, False))
    return built[id(domain_tree)]


@router.post("/resolve-roots", response_model=ResolveRootsResponse)
async def resolve_roots(
    request: ResolveRootsRequest,
    repo: LineageRepositoryPort = Depends(get_lineage_repo),
    user_id: UserId = Depends(get_current_user_id),  # Item — card-tree (tenancy).
):
    """
    For each input card id owned by the caller, identify the game-
    source root the card descends from. Group the input by root; list
    the unmatched ids (not owned, or not present) explicitly.

    Tenancy: the seventh tenant-scoped read path. The Port applies
    the user_id filter at both the base case and the recursive step
    of its upward-walk CTE. Cross-tenant input ids appear in
    `unmatched_card_ids` (the bulk lift of item 13's 404-not-403
    posture).
    """
    result = await repo.resolve_roots(request.card_ids, user_id=user_id)
    return ResolveRootsResponse(
        roots=[
            ResolvedRoot(
                root_card_id=g.root_card_id,
                game_source_id=g.game_source_id,
                card_ids_in_tree=list(g.card_ids_in_tree),
            )
            for g in result.roots
        ],
        unmatched_card_ids=list(result.unmatched_card_ids),
    )


def _overflow_detail(err: LineageOverflowError) -> dict:
    """
    Build the structured 422 body specified by the backend spec for
    the tree-overflow case.

    The body carries `actual_size` and `max_nodes` so the caller can
    decide whether to retry with a higher cap, ask a different
    question, or surface the limit to the user.
    """
    return {
        "detail": "tree exceeds max_nodes",
        "actual_size": err.actual_size,
        "max_nodes": err.max_nodes,
    }


@router.post("/tree-by-root", response_model=TreeByRootResponse)
async def tree_by_root(
    request: TreeByRootRequest,
    repo: LineageRepositoryPort = Depends(get_lineage_repo),
    user_id: UserId = Depends(get_current_user_id),  # Item — card-tree (tenancy).
):
    """
    Return the structure-only subtree rooted at `root_card_id`.

    Three response shapes:
      - 200: TreeByRootResponse with the recursive `tree` payload.
      - 404: root unowned, missing, or not actually a game-source
             root. Same 404-not-403 collapse as /cards/{id}.
      - 422: tree size exceeds `max_nodes`. Body includes the exact
             `actual_size` so the caller can react deliberately.

    Tenancy: the eighth tenant-scoped read path. The Port applies
    user_id filtering at both the root verification step and at every
    level of the descent CTE.
    """
    try:
        rooted = await repo.fetch_tree_by_root(
            request.root_card_id,
            user_id=user_id,
            max_nodes=request.max_nodes or 10000,
        )
    except CardNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except LineageOverflowError as e:
        raise HTTPException(status_code=422, detail=_overflow_detail(e))

    return TreeByRootResponse(
        root_card_id=rooted.root_card_id,
        game_source_id=rooted.game_source_id,
        tree=_project_card_tree_to_wire(rooted.tree),
    )
