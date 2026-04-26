from datetime import datetime, timezone

from core.ebisu import update_recall_float
from domain.auth import UserId
from domain.card import CardWithRecall, project_card
from domain.errors import CardNotFoundError, InvalidReviewError
from repositories.ports import CardRepositoryPort
from schemas.card import ReviewRequest


class ReviewService:
    def __init__(
        self,
        repository: CardRepositoryPort,
        default_gamma: float = 0.925,
        time_unit_seconds: float = 14400.0,
    ):
        """
        Item 21f: depends on CardRepositoryPort (the abstract contract),
        not CardRepository (the concrete SQLAlchemy adapter).

        Item 30a: the repository now returns a domain Card; this service
        projects it to a CardWithRecall (the wire shape) before returning.
        The projection is a pure function (domain.card.project_card)
        parameterized by `now` and `time_unit_seconds` — no global state
        access inside the math.

        time_unit_seconds: Defaulting to 4 hours (Config.EBISU_TIME_UNIT).
        """
        self.repository = repository
        self.default_gamma = default_gamma
        self.time_unit = time_unit_seconds

    async def process_review(
        self,
        card_id: int,
        request: ReviewRequest,
        *,
        user_id: UserId,
    ) -> CardWithRecall:
        """
        Executes the stateless Ebisu update using Geometric Discounting.

        Item 13 (tenancy): all three Port calls (initial fetch, update,
        re-fetch) thread `user_id` through. The repository enforces the
        tenant boundary on every call; this service never sees a card
        that doesn't belong to the caller.

        Raises:
            CardNotFoundError: if the card does not exist OR is not
                owned by the caller. The two cases are deliberately
                indistinguishable from the API surface — see
                CardRepositoryPort.get_card_by_id docstring for the
                404-not-403 rationale.
            InvalidReviewError: if the request's scores length does not
                match the card's num_moves.
        """
        # 1. Fetch current card state.
        card_data = await self.repository.get_card_by_id(card_id, user_id=user_id)
        if not card_data:
            raise CardNotFoundError(f"Card {card_id} not found")

        # 2. Validate request shape against the card's invariants.
        # The previous behavior silently padded with zeros or truncated to
        # match num_moves. Per the project axiom — "learners should never
        # encounter unexpected behavior without being informed" — mismatched
        # scores are a hard error: the review is rejected, not silently
        # repaired. Item 11.
        n = card_data.num_moves
        if len(request.scores) != n:
            raise InvalidReviewError(
                f"Card {card_id} expects exactly {n} score(s); "
                f"request supplied {len(request.scores)}. "
                f"Submit {n} score(s) in [0.0, 1.0]."
            )
        if any(not (0.0 <= s <= 1.0) for s in request.scores):
            raise InvalidReviewError(
                f"All scores must be in [0.0, 1.0]; got {request.scores!r}."
            )

        # 3. Extract Grading Parameters.
        # Gamma is typically stored in grading_parameter['data']['gamma'] based on legacy.
        gp = card_data.grading_parameter or {}
        gamma = gp.get("data", {}).get("gamma", self.default_gamma)

        # 4. Calculate n_eff (Geometric Series Sum).
        # n_eff = (1 - gamma^n) / (1 - gamma)
        n_eff = (1.0 - (gamma ** n)) / (1.0 - gamma)

        # 5. Calculate Discounted Successes.
        # request.scores is guaranteed to be exactly length n by step 2.
        discounted_successes = sum(
            s * (gamma ** i) for i, s in enumerate(request.scores)
        )

        # Safety cap: successes cannot exceed the effective total.
        discounted_successes = min(discounted_successes, n_eff)

        # 6. Compute Elapsed Time in Units.
        now = datetime.now(timezone.utc)
        last = card_data.last_reviewed_at or card_data.creation_date
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)

        elapsed_seconds = (now - last).total_seconds()
        t_now = max(0.001, elapsed_seconds / self.time_unit)

        # 7. Pure Ebisu Update.
        prior = (card_data.alpha, card_data.beta, card_data.t)
        new_model = update_recall_float(
            prior=prior,
            successes=discounted_successes,
            total=n_eff,
            t_now=t_now,
            rebalance=True,
        )

        # 8. Persist Update.
        await self.repository.update_card_model(card_id, new_model, user_id=user_id)

        # 9. Re-fetch and project.
        # Re-fetching (rather than constructing a CardWithRecall from
        # the new_model tuple directly) guarantees we return what's
        # actually persisted — including the num_reviews increment and
        # the last_reviewed_at timestamp set by the adapter.
        updated = await self.repository.get_card_by_id(card_id, user_id=user_id)
        if not updated:
            # Unreachable in practice — the card was just updated, not
            # deleted, and the same user_id is in scope. Guarded anyway
            # because the taxonomy (item 11) says we speak
            # CardNotFoundError, not "silently return something weird".
            raise CardNotFoundError(
                f"Card {card_id} disappeared during review processing"
            )

        return project_card(
            updated,
            now=datetime.now(timezone.utc),
            time_unit_seconds=self.time_unit,
        )
