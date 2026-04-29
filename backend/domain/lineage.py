"""
domain/lineage.py

Value objects for the card-tree endpoints (release-scope item 3).

Two frozen Pydantic models satisfy the contract specified in
`docs/notes/card-tree-backend-spec.md`:

- `RootResolution` — the wire-shape DTO returned by the resolve-roots
  Port method, carrying both the matched groups (one per
  game-source root that any of the input cards descend from) and
  the explicit `unmatched_card_ids` list. The `unmatched` field is
  load-bearing per ADR-0002: silent omission of cards that don't
  resolve would let the frontend render incomplete forests without
  knowing it.

- `CardTree` — the recursive structure-only tree node returned by
  the tree-by-root Port method. Per-card metadata is fetched
  separately by the frontend's existing card store; this type
  carries `id` and `children` only.

Pure domain. Imports only stdlib and Pydantic. No SQLAlchemy, no
FastAPI, no `db.schema`. The Port methods on `LineageRepositoryPort`
return these types directly; the route layer projects them into wire
shapes (which happen to be structurally identical, but are declared
separately at the route file per the backend authoring posture).

Frozen per ADR-0001's "value objects keep readonly" rule: these are
projection results, not mutable state containers. A second pipeline
run produces a new instance.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict


class RootGroup(BaseModel):
    """
    One game-source root that some subset of the resolve-roots input
    descends from.

    `card_ids_in_tree` is the subset of the original input that
    resolved to this particular root. The list is order-preserving
    relative to the input (the adapter inserts in input order so the
    frontend can reason about its own request without re-sorting).
    """
    model_config = ConfigDict(frozen=True)

    root_card_id: int
    game_source_id: int
    card_ids_in_tree: List[int]


class RootResolution(BaseModel):
    """
    The full result of resolving a list of card ids to their game-source
    roots, restricted to cards owned by the requesting tenant.

    `roots` carries one entry per distinct root that the input
    cards descended from. `unmatched_card_ids` carries the input
    ids that either don't exist or aren't owned by the caller — per
    the tenancy spine's 404-not-403 invariant lifted to the bulk
    case (ADR-0002 + the per-card pattern from item 13).

    The two fields together form a partition of the original input.
    """
    model_config = ConfigDict(frozen=True)

    roots: List[RootGroup]
    unmatched_card_ids: List[int]


class CardTree(BaseModel):
    """
    A recursive structure-only tree node: an integer id and a list of
    child trees.

    Per the spec, this is intentionally minimal. Per-card metadata is
    fetched separately by the frontend's existing card store via
    /cards/{id}; widening this shape with denormalized card data
    would couple two independently-cached read paths and bloat the
    tree response unnecessarily.

    The schema's `card_source.card_id UNIQUE` invariant guarantees
    each card has at most one parent (deferred-decisions ledger,
    2026-04-29 outcome), so this type is genuinely a tree, not a
    canonicalized DAG.
    """
    model_config = ConfigDict(frozen=True)

    id: int
    children: List["CardTree"]


CardTree.model_rebuild()


class RootedTree(BaseModel):
    """
    A tree plus the per-root context the wire response needs:
    `root_card_id` (so the caller can correlate against its request)
    and `game_source_id` (the game-source the root descends from).

    Returned by `LineageRepositoryPort.fetch_tree_by_root`. The
    backend spec's wire-shape declaration includes both fields;
    surfacing them through the Port return rather than as a second
    round-trip lookup is the natural composition for the single-
    consumer case (the route file's `tree-by-root` handler is the
    only consumer in this implementation, per ADR-0003's "extract
    when a second consumer appears" discipline).
    """
    model_config = ConfigDict(frozen=True)

    root_card_id: int
    game_source_id: int
    tree: CardTree
