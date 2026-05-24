"""
services/game_library_service.py

GameLibraryService — the SGF library use case.

Thin orchestrator over ``PositionNormalizerPort`` and
``GameLibraryRepositoryPort``. Two responsibilities the service
adds above pass-through:

1. **Per-file normalization with structured failure surfacing.**
   The normalizer raises ``ValueError`` on malformed SGF (existing
   contract); the service catches per-file and translates each
   failure into an ``ImportOutcomeErrored`` so a single bad file
   doesn't fail the whole batch.

2. **Batch-size bounding.** Requests larger than
   ``import_batch_max`` raise ``BatchTooLargeError``; the route
   maps this to 422 so the client knows to chunk client-side.
   Bounds server-side memory and transaction duration.

Everything else is pass-through: list_games, get_game, delete_game
each call the corresponding Port method directly, with the
keyword-only ``user_id`` threading through unchanged for the
tenancy spine.

License: Public Domain (The Unlicense)
"""
from typing import List, Optional, Tuple

from domain.auth import UserId
from domain.errors import BatchTooLargeError
from domain.game_library import (
    GameLibraryImportRequest,
    GameListFilter,
    GameListSort,
    GameListSortDirection,
    ImportOutcome,
    ImportOutcomeErrored,
    LibraryGame,
    LibraryGameListItem,
    SgfMetadata,
)
from domain.normalizer import PositionNormalizerPort
from repositories.ports import GameLibraryRepositoryPort


class GameLibraryService:
    """
    Port-pure orchestrator. Constructor takes the normalizer Port,
    the library repository Port, and two bounded-input caps read
    from config at the DI factory.
    """

    def __init__(
        self,
        repository: GameLibraryRepositoryPort,
        normalizer: PositionNormalizerPort,
        *,
        import_batch_max: int,
        list_limit_max: int,
    ):
        self.repository = repository
        self.normalizer = normalizer
        self.import_batch_max = import_batch_max
        self.list_limit_max = list_limit_max

    async def import_games(
        self,
        *,
        user_id: UserId,
        raw_contents: List[str],
    ) -> List[ImportOutcome]:
        """
        Normalize each SGF and import the batch.

        Returns a per-file outcome list in the same order as
        ``raw_contents``. The frontend correlates by index — index
        N of the response corresponds to index N of the request.

        Failure paths surfaced:

        - ``BatchTooLargeError`` when ``len(raw_contents) >
          import_batch_max``. Raised before any work; the route maps
          to 422 with a structured detail naming the cap.
        - Per-file: ``ImportOutcomeErrored`` when the normalizer
          raises ``ValueError`` (malformed SGF) or the adapter's
          SAVEPOINT-per-file path produces a structured failure.
          Successful files in the same batch are unaffected.

        Empty ``raw_contents`` returns an empty list (the natural
        no-op).
        """
        if len(raw_contents) > self.import_batch_max:
            raise BatchTooLargeError(
                received=len(raw_contents),
                maximum=self.import_batch_max,
            )

        # Normalize each file; collect successes as adapter requests
        # and failures as outcomes at the matching index. The
        # `slot` list preserves order: each entry is either a fully
        # built ``GameLibraryImportRequest`` (success) or an
        # ``ImportOutcomeErrored`` (normalizer failure).
        slots: List[GameLibraryImportRequest | ImportOutcomeErrored] = []
        for raw in raw_contents:
            try:
                normalized = self.normalizer.normalize(raw)
            except ValueError as exc:
                slots.append(ImportOutcomeErrored(error=str(exc)))
                continue
            metadata = SgfMetadata.from_normalizer_meta(normalized.metadata)
            slots.append(
                GameLibraryImportRequest(
                    raw_content=raw,
                    canonical_content=normalized.canonical_content,
                    content_hash=normalized.content_hash,
                    metadata=metadata,
                )
            )

        # Project the slots into the adapter input: only the
        # successful requests reach the Port.
        adapter_inputs = [
            s for s in slots if isinstance(s, GameLibraryImportRequest)
        ]
        adapter_outcomes = (
            await self.repository.import_games(
                user_id=user_id,
                requests=adapter_inputs,
            )
            if adapter_inputs
            else []
        )

        # Interleave: for each slot, emit the corresponding outcome
        # — pre-built Errored slots pass through; request slots
        # consume the next adapter outcome.
        adapter_iter = iter(adapter_outcomes)
        merged: List[ImportOutcome] = []
        for slot in slots:
            if isinstance(slot, ImportOutcomeErrored):
                merged.append(slot)
            else:
                merged.append(next(adapter_iter))
        return merged

    async def list_games(
        self,
        *,
        user_id: UserId,
        sort: GameListSort,
        direction: GameListSortDirection,
        filt: GameListFilter,
        offset: int,
        limit: int,
    ) -> Tuple[List[LibraryGameListItem], int]:
        """
        Paginated list of the caller's games plus the total match
        count.

        Bounded-input checks:

        - ``offset < 0`` raises ``ValueError``; the route's pydantic
          model already constrains this to ``>= 0``, but the service
          asserts defensively for non-route callers.
        - ``limit`` outside ``[1, list_limit_max]`` raises
          ``ValueError`` for the same defensive reason.
        """
        if offset < 0:
            raise ValueError(f"offset must be >= 0, got {offset}")
        if limit < 1 or limit > self.list_limit_max:
            raise ValueError(
                f"limit must be in [1, {self.list_limit_max}], got {limit}"
            )
        return await self.repository.list_games(
            user_id=user_id,
            sort=sort,
            direction=direction,
            filt=filt,
            offset=offset,
            limit=limit,
        )

    async def get_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> Optional[LibraryGame]:
        """Fetch one library game by id, with ``raw_content``.

        Returns ``None`` on miss or cross-tenant access; the route
        maps ``None`` to 404 per the 404-not-403 invariant.
        """
        return await self.repository.get_game(
            user_id=user_id,
            game_id=game_id,
        )

    async def delete_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> bool:
        """Delete one library game by id, returning whether a row
        actually went away.

        Returns ``False`` on miss or cross-tenant attempt; the route
        maps ``False`` to 404 (same invariant as ``get_game``).
        """
        return await self.repository.delete_game(
            user_id=user_id,
            game_id=game_id,
        )
