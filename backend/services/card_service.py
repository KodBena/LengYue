"""
CardService — the create-card use case.

Item 30b: rewritten as a Port-pure orchestrator. The previous
implementation held a raw AsyncSession, imported tables from
db.schema, ran insert/select statements inline, and called
session.commit() at the end. In other words: a service that had
become an adapter.

After 30b:
  - Two Ports are the only dependencies:
      - CardWriteRepositoryPort (persistence)
      - PositionNormalizerPort (domain-specific content canonicalization)
  - Zero SQL in this file.
  - Zero transaction concerns in this file (the route wraps the call
    in `async with db.begin():` — commit on success, rollback on
    exception, handled once at the edge).
  - Zero db.schema imports.
  - Testable with fakes: pass a FakeCardWriteRepository and a
    FakePgnNormalizer (or any Protocol-satisfying objects) and the
    use case runs without a database, a SGF parser, or a server.

Item 14 (tenancy): adds CardRepositoryPort as a third dependency for
the parent-ownership check on branch creation. The check piggybacks
on item 13's already-tenant-filtered get_card_by_id rather than
introducing a new Port method — preserves the existing seam, costs
one extra round-trip on branch creates (negligible vs the surrounding
INSERT cascade).

Transactional batch mint (ledger rows 884/885/886): `create_card`'s
six-step cascade is factored out into `_create_one_card`, a private
helper taking the same fields as loose keyword arguments rather than
a `CardCreate`. `create_card` and `create_cards_batch` are both thin
callers of this one shared implementation — `create_cards_batch`
loops over its ordered items, resolving each member's `parent_ref`
(an existing card id, or an earlier batch member's just-minted id)
to a `parent_card_id` before delegating to the same helper.
Deliberately NOT a loop of independent `create_card` calls each
committing on its own — this is one Port-pure orchestration that the
route wraps in exactly one `async with db.begin():`, so the entire
batch (including every `next_card_display_ordinal` /
`next_game_display_ordinal` counter increment along the way) commits
or rolls back as a unit. A rolled-back batch leaves the per-user
display counters untouched, because the counter UPDATE happens
inside the same transaction as the row it numbers (see
`repositories/display_counters.py`) — nothing about the batch
orchestration needs to know that; it falls out of "one session, one
transaction, no early commit."
"""
from typing import List, Optional

from core.config import config
from domain.auth import UserId
from domain.card import Card
from domain.errors import (
    BatchIndexReferenceError,
    CardBatchTooLargeError,
    CardNotFoundError,
    InvalidInputError,
)
from domain.normalizer import PositionNormalizerPort
from repositories.ports import CardRepositoryPort, CardWriteRepositoryPort
from schemas.card import (
    BatchCardItem,
    CardCreate,
    CardPatch,
    GameSourceCreate,
    ParentRefBatchIndex,
    ParentRefCardId,
)


class CardService:
    def __init__(
        self,
        repository: CardWriteRepositoryPort,
        normalizer: PositionNormalizerPort,
        read_repository: CardRepositoryPort,
    ):
        """
        Depends on three Ports — no session, no config reach-in beyond
        the one EBISU_DEFAULT_MODEL constant (which could be injected
        too, but single-value config constants are a reasonable pragma
        until a second deployment needs different values).

        Item 14 (tenancy): read_repository is the tenant-aware read
        Port. Used solely for the parent-ownership precheck on branch
        creation. The same SQLAlchemy adapter satisfies both
        CardWriteRepositoryPort and CardRepositoryPort, so this is
        zero new infrastructure — just an additional Port view of the
        same persistence resource.
        """
        self.repository = repository
        self.normalizer = normalizer
        self.read_repository = read_repository

    async def create_card(self, data: CardCreate, *, user_id: UserId) -> int:
        """
        Orchestrates single-card creation. Thin wrapper over
        `_create_one_card` — see that method's docstring for the
        six-step cascade and the Raises contract, both unchanged by
        the batch-mint refactor.
        """
        return await self._create_one_card(
            raw_content=data.raw_content,
            num_moves=data.num_moves,
            grading_parameter=data.grading_parameter,
            tags=data.tags,
            parent_card_id=data.parent_card_id,
            game_metadata=data.game_metadata,
            user_id=user_id,
        )

    async def _create_one_card(
        self,
        *,
        raw_content: str,
        num_moves: int,
        grading_parameter: Optional[dict],
        tags: List[str],
        parent_card_id: Optional[int],
        game_metadata: Optional[GameSourceCreate],
        user_id: UserId,
    ) -> int:
        """
        Orchestrates card creation as a sequence of Port calls.

        The sequence is:
            0. (Item 14) Verify parent_card_id belongs to this
               tenant, when set. Raise CardNotFoundError if not.
            1. Normalize raw content → canonical_content + content_hash + metadata.
            2. Get-or-create a normalized_position from the hash.
            3. Insert a card row with the default Bayesian prior.
            4. If this is a root: insert or get-or-create a
               game_source row. The branch is on client_game_id —
               when supplied (game-source dedup arc), repeated mints
               from one board's lifetime collapse to a single row;
               when absent, legacy always-create behavior.
            5. Link the card to either its parent (branch) or its game_source (root).
            6. Attach any tags.

        Every step is a single Port method call. No SQL, no session,
        no transaction management — the caller (`create_card` for a
        single mint, `create_cards_batch` for a batch member) is
        expected to run inside a caller-managed `async with
        db.begin():` so all six steps commit atomically alongside
        any sibling calls in the same transaction. The step-0 check
        happens inside the same transaction; if it fails, the
        transaction aborts before any rows are inserted.

        Item 14 (tenancy): user_id is keyword-only (matching the rest
        of the tenancy spine's discipline). The parent-ownership
        precheck consults the tenant-aware read Port — a parent that
        belongs to a different user produces the same
        CardNotFoundError as a parent that doesn't exist. The
        404-not-403 boundary held by collapse, consistent with item 13.

        Transactional batch mint (ledger rows 884/885/886):
        `parent_card_id` may name a card minted earlier in the SAME
        still-open transaction (a batch member's `parent_ref.
        batch_index` resolved by the caller) — `get_card_by_id`
        reads through the open, uncommitted transaction on the same
        session (the same pattern the POST /cards/ route already
        relies on for its post-insert re-fetch), so the precheck
        sees it and confirms tenancy exactly as it would for any
        pre-existing card.

        Raises:
            CardNotFoundError: parent_card_id is set but the parent
                doesn't exist or doesn't belong to this tenant. Route
                maps to 404 via the existing NotFoundError handler.
            InvalidInputError: the normalizer rejects the raw content
                or the caller's invariants fail. Route maps to 422
                (item 11).
        """
        # 0. Parent-ownership precheck (item 14). Only relevant for
        # branch creates — root creates use game_metadata instead.
        # Callers (CardCreate's @model_validator, BatchCardItem's
        # equivalent) already enforce "exactly one of parent /
        # game_metadata", so the two cases are mutually exclusive.
        if parent_card_id is not None:
            parent = await self.read_repository.get_card_by_id(
                parent_card_id, user_id=user_id
            )
            if parent is None:
                raise CardNotFoundError(
                    f"Parent card {parent_card_id} not found"
                )

        # 1. Normalize (via the Port — could be SGF today, PGN tomorrow,
        # anything a future normalizer supports). The Port's `normalize`
        # method raises ValueError on malformed content; we translate
        # to InvalidInputError so the route's error axis (item 11)
        # handles it cleanly.
        try:
            normalized = self.normalizer.normalize(raw_content)
        except ValueError as e:
            raise InvalidInputError(f"Could not normalize position: {e}")

        # 2. Get-or-create the canonical position. Content-addressed:
        # same content → same id, always.
        position_id = await self.repository.get_or_create_position(
            canonical_content=normalized.canonical_content,
            content_hash=normalized.content_hash,
        )

        # 3. Insert the card row with the default Bayesian prior.
        # EBISU_DEFAULT_MODEL is a (alpha, beta, t) tuple — passed as
        # `model` so the Port doesn't leak the internal representation.
        new_card_id = await self.repository.insert_card(
            num_moves=num_moves,
            model=config.EBISU_DEFAULT_MODEL,
            user_id=user_id,
            grading_parameter=grading_parameter,
            position_id=position_id,
        )

        # 4. If this card is a new root: insert or get-or-create the
        # game_source. The branch is on `client_game_id`:
        #
        # - When set (game-source dedup arc): the frontend is
        #   signalling "this mint belongs to the same board's
        #   lifetime as any prior mint sharing this UUID." The repository performs a
        #   get-or-create on `(user_id, client_game_id)`; the
        #   second-and-subsequent mints from one board return the
        #   first mint's game_source_id and the input metadata is
        #   ignored (first-mint-wins, so editing SGF root properties
        #   between mints doesn't retroactively rewrite the recorded
        #   game name / players).
        #
        # - When unset: legacy always-create behavior. Preserves any
        #   caller that doesn't speak the new wire (curl, test
        #   fixtures, pre-rollout frontends).
        #
        # Falls back to normalizer-extracted player names when the
        # frontend didn't supply them — `metadata.get("white")` /
        # `metadata.get("black")` is the convention all normalizers
        # use today. A future domain-specific normalizer for a
        # single-player game wouldn't populate those keys; the
        # fallback would be None, which is fine.
        #
        # Item 24 (tenancy): user_id is forwarded to both Port paths
        # so the new (or matched) row is stamped with the creating
        # tenant.
        game_source_id = None
        if game_metadata:
            pw = game_metadata.player_white or normalized.metadata.get("white")
            pb = game_metadata.player_black or normalized.metadata.get("black")
            if game_metadata.client_game_id is not None:
                game_source_id = await self.repository.get_or_create_game_source_by_client_id(
                    client_game_id=game_metadata.client_game_id,
                    position_id=position_id,
                    user_id=user_id,
                    player_white=pw,
                    player_black=pb,
                    description=game_metadata.description,
                    raw_content=raw_content,
                )
            else:
                game_source_id = await self.repository.insert_game_source(
                    position_id=position_id,
                    user_id=user_id,
                    player_white=pw,
                    player_black=pb,
                    description=game_metadata.description,
                    raw_content=raw_content,
                )

        # 5. Link the card into its lineage. The caller has already
        # ensured exactly one of parent_card_id / game_source_id is
        # set; the schema's CheckConstraint is the database-level
        # belt-and-braces. Step 0 ensured the parent belongs to the
        # tenant.
        await self.repository.link_source(
            card_id=new_card_id,
            parent_card_id=parent_card_id,
            game_source_id=game_source_id,
        )

        # 6. Attach tags (no-op if empty). The batched 4-round-trip
        # implementation lives in the adapter (item 21e, now on the
        # repository per 30b).
        if tags:
            await self.repository.attach_tags(new_card_id, tags)

        # No commit here — the caller's `async with db.begin():`
        # handles the transaction boundary. The service is Port-pure:
        # it speaks persistence operations, not transactions.
        return new_card_id

    async def create_cards_batch(
        self, items: List[BatchCardItem], *, user_id: UserId
    ) -> List[int]:
        """
        Orchestrates the transactional batch card mint (ratified wire
        contract, ledger rows 884/885/886): ``POST /cards/batch``.

        One session, one transaction, zero commits in this method —
        exactly the same Port-pure posture as `create_card`. The
        caller (the route) wraps the whole call in a single `async
        with db.begin():`; ANY member's failure raises before this
        method returns, and the caller's transaction rolls back
        every row this call inserted for every earlier member too —
        that rollback is the entire point (ADR-0012; the commission's
        verbatim: "TRANSACTIONS are literally a 50 year old concept").

        This is deliberately NOT a loop of independent `create_card`
        calls each committing — it is one orchestration over the
        shared `_create_one_card` helper, sharing this method's own
        Port instances (and therefore this method's own session) for
        every member.

        Per-member `parent_ref` resolution:
            - `None`: root mint, must be paired with `game_metadata`
              (BatchCardItem's own validator enforces this).
            - `ParentRefCardId(card_id=...)`: branch off an existing
              card. Resolved to that card_id directly; tenancy is
              enforced inside `_create_one_card`'s existing
              parent-ownership precheck (cross-tenant → 404, same as
              `create_card`).
            - `ParentRefBatchIndex(batch_index=i)`: branch off an
              EARLIER member of this same batch (`i < own index`).
              A forward or self reference (`i >= own index`) raises
              `BatchIndexReferenceError` before any Port call for
              this member — 422, naming both indices. `i` resolves
              against `created_ids`, the list of ids minted so far
              in THIS call, in THIS transaction.

        Cap enforcement: `len(items) > config.CARDS_BATCH_MINT_MAX`
        raises `CardBatchTooLargeError` before any Port call — no
        rows inserted, nothing to roll back.

        Failure-index carriage: a member's `CardNotFoundError` or
        `InvalidInputError` (cross-tenant parent, forward/self batch
        index, malformed content) is re-raised with the failing
        member's index prepended to the message — `"batch item
        {index}: {original message}"` — mirroring the existing
        InvalidInputError/NotFoundError axis's plain-string detail
        convention (no structured-body widening; the ResourceLimitError
        axis is the one that carries structured `{kind, ...}` bodies
        in this codebase, per `domain/errors.py`'s three-axis
        taxonomy). The route's existing NotFoundError → 404 /
        InvalidInputError → 422 handlers need no change to surface
        this correctly.

        Raises:
            CardBatchTooLargeError: `len(items)` exceeds the cap.
            BatchIndexReferenceError: a forward or self `batch_index`
                reference (a kind of InvalidInputError).
            CardNotFoundError: a member's parent_ref resolves to a
                card that doesn't exist or isn't owned by `user_id`.
            InvalidInputError: a member's raw_content fails to
                normalize.
        """
        if len(items) > config.CARDS_BATCH_MINT_MAX:
            raise CardBatchTooLargeError(
                received=len(items), maximum=config.CARDS_BATCH_MINT_MAX
            )

        created_ids: List[int] = []
        for index, item in enumerate(items):
            parent_card_id: Optional[int] = None
            if isinstance(item.parent_ref, ParentRefBatchIndex):
                ref = item.parent_ref.batch_index
                if not (0 <= ref < index):
                    raise BatchIndexReferenceError(index=index, batch_index=ref)
                parent_card_id = created_ids[ref]
            elif isinstance(item.parent_ref, ParentRefCardId):
                parent_card_id = item.parent_ref.card_id

            try:
                new_card_id = await self._create_one_card(
                    raw_content=item.raw_content,
                    num_moves=item.num_moves,
                    grading_parameter=item.grading_parameter,
                    tags=item.tags,
                    parent_card_id=parent_card_id,
                    game_metadata=item.game_metadata,
                    user_id=user_id,
                )
            except CardNotFoundError as e:
                raise CardNotFoundError(f"batch item {index}: {e}") from e
            except InvalidInputError as e:
                raise InvalidInputError(f"batch item {index}: {e}") from e

            created_ids.append(new_card_id)

        return created_ids

    async def update_card_metadata(
        self,
        card_id: int,
        patch: CardPatch,
        *,
        user_id: UserId,
    ) -> Card:
        """
        Card-metadata inline-edit arc 2 (2026-05-13). Forwards the
        patch to the write Port and translates the ``None`` (cross-
        tenant / non-existent) return into ``CardNotFoundError``,
        which the route maps to 404 via the existing
        ``NotFoundError`` handler.

        The Port does the heavy lifting (existence check, column
        update, grading_parameter merge, tag replacement,
        reset_prior); this service method is a thin orchestration
        seam that preserves the 404-not-403 invariant at the
        domain-error boundary.
        """
        updated = await self.repository.update_card_metadata(
            card_id, patch, user_id=user_id
        )
        if updated is None:
            raise CardNotFoundError(f"card {card_id} not found")
        return updated
