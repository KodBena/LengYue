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
    GameImportInput,
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
        inputs: List[GameImportInput],
    ) -> List[ImportOutcome]:
        """
        Normalize each SGF and import the batch.

        Returns a per-file outcome list in the same order as
        ``inputs``. The frontend correlates by index — index N of
        the response corresponds to index N of the request.

        Each ``GameImportInput`` carries the raw SGF plus optional
        out-of-band fields (e.g., ``source_path`` captured from a
        directory-upload's ``webkitRelativePath``) that the
        normalizer doesn't see; the service folds them through to
        the adapter so they land in ``metadata_extra`` at INSERT.

        Failure paths surfaced:

        - ``BatchTooLargeError`` when ``len(inputs) >
          import_batch_max``. Raised before any work; the route maps
          to 413 with a structured detail naming the cap.
        - Per-file: ``ImportOutcomeErrored`` when the normalizer
          raises ``ValueError`` (malformed SGF) or the adapter's
          SAVEPOINT-per-file path produces a structured failure.
          Successful files in the same batch are unaffected.

        Empty ``inputs`` returns an empty list (the natural no-op).
        """
        if len(inputs) > self.import_batch_max:
            raise BatchTooLargeError(
                received=len(inputs),
                maximum=self.import_batch_max,
            )

        # Normalize each file; collect successes as adapter requests
        # and failures as outcomes at the matching index. The
        # `slot` list preserves order: each entry is either a fully
        # built ``GameLibraryImportRequest`` (success) or an
        # ``ImportOutcomeErrored`` (normalizer failure).
        slots: List[GameLibraryImportRequest | ImportOutcomeErrored] = []
        for inp in inputs:
            try:
                normalized = self.normalizer.normalize(inp.raw_content)
            except ValueError as exc:
                slots.append(ImportOutcomeErrored(error=str(exc)))
                continue
            metadata = SgfMetadata.from_normalizer_meta(normalized.metadata)
            slots.append(
                GameLibraryImportRequest(
                    raw_content=inp.raw_content,
                    canonical_content=normalized.canonical_content,
                    content_hash=normalized.content_hash,
                    metadata=metadata,
                    source_path=inp.source_path,
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

    async def list_players(
        self,
        *,
        user_id: UserId,
    ) -> List[str]:
        """Distinct player-name set for autocomplete. Pure
        pass-through to the Port — no service-level work beyond
        threading ``user_id`` through.
        """
        return await self.repository.list_players(user_id=user_id)
