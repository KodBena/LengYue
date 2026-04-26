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
"""
from core.config import config
from domain.auth import UserId
from domain.errors import CardNotFoundError, InvalidInputError
from domain.normalizer import PositionNormalizerPort
from repositories.ports import CardRepositoryPort, CardWriteRepositoryPort
from schemas.card import CardCreate


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
        Orchestrates card creation as a sequence of Port calls.

        The sequence is:
            0. (Item 14, branches only) Verify parent_card_id belongs
               to this tenant. Raise CardNotFoundError if not.
            1. Normalize raw content → canonical_content + content_hash + metadata.
            2. Get-or-create a normalized_position from the hash.
            3. Insert a card row with the default Bayesian prior.
            4. If this is a root: insert a game_source row.
            5. Link the card to either its parent (branch) or its game_source (root).
            6. Attach any tags.

        Every step is a single Port method call. No SQL, no session,
        no transaction management — the caller is expected to wrap
        the invocation in `async with db.begin():` so that all six
        steps commit atomically. The step-0 check happens inside the
        same transaction; if it fails, the transaction aborts before
        any rows are inserted.

        Item 14 (tenancy): user_id is keyword-only (matching the rest
        of the tenancy spine's discipline). The parent-ownership
        precheck consults the tenant-aware read Port — a parent that
        belongs to a different user produces the same
        CardNotFoundError as a parent that doesn't exist. The
        404-not-403 boundary held by collapse, consistent with item 13.

        Raises:
            CardNotFoundError: parent_card_id is set but the parent
                doesn't exist or doesn't belong to this tenant. Route
                maps to 404 via the existing NotFoundError handler.
            InvalidInputError: the normalizer rejects the raw content
                or CardCreate's invariants fail. Route maps to 422
                (item 11).
        """
        # 0. Parent-ownership precheck (item 14). Only relevant for
        # branch creates — root creates use game_metadata instead.
        # CardCreate's @model_validator already enforced "exactly one
        # of parent_card_id / game_metadata", so the two cases are
        # mutually exclusive.
        if data.parent_card_id is not None:
            parent = await self.read_repository.get_card_by_id(
                data.parent_card_id, user_id=user_id
            )
            if parent is None:
                raise CardNotFoundError(
                    f"Parent card {data.parent_card_id} not found"
                )

        # 1. Normalize (via the Port — could be SGF today, PGN tomorrow,
        # anything a future normalizer supports). The Port's `normalize`
        # method raises ValueError on malformed content; we translate
        # to InvalidInputError so the route's error axis (item 11)
        # handles it cleanly.
        try:
            normalized = self.normalizer.normalize(data.sgf)
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
            num_moves=data.num_moves,
            model=config.EBISU_DEFAULT_MODEL,
            user_id=user_id,
            grading_parameter=data.grading_parameter,
            default_visits=data.default_visits,
            position_id=position_id,
        )

        # 4. If this card is a new root: insert the game_source.
        # Falls back to normalizer-extracted player names when the
        # frontend didn't supply them — `metadata.get("white")` /
        # `metadata.get("black")` is the convention all normalizers
        # use today. A future domain-specific normalizer for a
        # single-player game wouldn't populate those keys; the
        # fallback would be None, which is fine.
        #
        # Item 24 (tenancy): user_id is forwarded to insert_game_source
        # so the new row is stamped with the creating tenant.
        game_source_id = None
        if data.game_metadata:
            pw = data.game_metadata.player_white or normalized.metadata.get("white")
            pb = data.game_metadata.player_black or normalized.metadata.get("black")
            game_source_id = await self.repository.insert_game_source(
                position_id=position_id,
                user_id=user_id,
                player_white=pw,
                player_black=pb,
                description=data.game_metadata.description,
                raw_content=data.sgf,
            )

        # 5. Link the card into its lineage. The CardCreate validator
        # has already ensured exactly one of parent_card_id /
        # game_source_id is set; the schema's CheckConstraint is the
        # database-level belt-and-braces. Step 0 ensured the parent
        # belongs to the tenant.
        await self.repository.link_source(
            card_id=new_card_id,
            parent_card_id=data.parent_card_id,
            game_source_id=game_source_id,
        )

        # 6. Attach tags (no-op if empty). The batched 4-round-trip
        # implementation lives in the adapter (item 21e, now on the
        # repository per 30b).
        if data.tags:
            await self.repository.attach_tags(new_card_id, data.tags)

        # No commit here — the route's `async with db.begin():` handles
        # the transaction boundary. The service is Port-pure: it speaks
        # persistence operations, not transactions.
        return new_card_id
