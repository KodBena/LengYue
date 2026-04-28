"""
api/routes/qeubo.py

REST routes for the qEUBO preference-based optimisation feature. Six
endpoints under `/qeubo/experiment` wrapping the `qeubo` package's
`ExperimentService`. Each route is JWT-authenticated; the route layer
namespaces the runtime's `experiment_id` with the JWT-derived `user_id`
so users cannot collide. Encode / decode of points ↔ actual parameter
values is delegated to `qeubo_encoding` (also public-domain).

The runtime (`qeubo.ExperimentService`) is MIT-derivative; this file is
public domain and consumes the runtime through the published API
contract in `backend/qeubo/README.md`. No source visibility into
`backend/qeubo/runtime/*.py` was used to author this file. Reference
for the licensing boundary: `backend/NOTICE` and the dispatch at
`docs/dispatch/frontend-to-backend-qeubo-integration.md`.

The README documents `delete_experiment` as raising `ValueError` when
the experiment does not exist but is silent on the missing-experiment
behavior of `get_status`, `request_pair`, `submit_response`,
`get_best_point`, and `get_history`. Per the dispatch's resolution
(option 2), routes that need to distinguish "missing → 404" from other
domain errors probe via `get_status` first inside a try/except; the
documented error-mapping for each method's other documented `ValueError`
cases is then applied to the actual call.

When `config.QEUBO_ENABLED` is False the dependency `get_qeubo_service`
raises 503 on every request. The router itself is always registered so
the OpenAPI surface remains stable across configurations.

License: Public Domain (The Unlicense)
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.dependencies import get_current_user_id
from api.routes.qeubo_encoding import decode
from domain.auth import UserId


router = APIRouter(prefix="/qeubo", tags=["qeubo"])


# =====================================================================
# Wire shapes (request / response schemas).
#
# Per backend/CLAUDE.md, route-local Pydantic schemas live with the
# route, not in `backend/schemas/`. A dedicated `schemas/qeubo.py`
# becomes the natural target only when a second consumer appears.
# =====================================================================


class ConfigOverrides(BaseModel):
    """Optional overrides forwarded into the runtime's `user_config`.

    `extra="allow"` keeps the wire shape forward-compatible with any
    upstream config keys the runtime may grow without forcing a wire-
    schema bump every time.
    """

    model_config = ConfigDict(extra="allow")

    num_init_queries: Optional[int] = None
    num_algo_queries: Optional[int] = None
    noise_type: Optional[str] = None
    noise_level: Optional[float] = None
    num_alternatives: Optional[int] = None
    model_type: Optional[str] = None


class CreateExperimentRequest(BaseModel):
    controlled_parameters: list[str] = Field(min_length=1)
    parameter_ranges: dict[str, list[float]]
    config_overrides: Optional[ConfigOverrides] = None

    @field_validator("parameter_ranges")
    @classmethod
    def _validate_ranges(cls, v: dict[str, list[float]]) -> dict[str, list[float]]:
        for name, rng in v.items():
            if len(rng) != 2:
                raise ValueError(
                    f"parameter_ranges[{name!r}] must be [min, max], got {rng!r}"
                )
            lo, hi = rng
            if not lo < hi:
                raise ValueError(
                    f"parameter_ranges[{name!r}] requires min < max; got [{lo}, {hi}]"
                )
        return v


class CreateExperimentResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    experiment_id: str
    config: dict[str, Any]
    controlled_parameters: list[str]
    phase: str
    init_index: int
    num_init_queries: int
    iteration: int
    num_algo_queries: int


class StatusResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    experiment_id: str
    phase: str
    init_index: int
    num_init_queries: int
    iteration: int
    num_algo_queries: int
    total_responses: int
    has_pending: bool
    pending_query_uuid: Optional[str]


class PairResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    query_uuid: str
    point_a: list[float]
    point_b: list[float]
    values_a: dict[str, float]
    values_b: dict[str, float]
    phase: str
    iteration: int
    reissued: bool


class PreferenceRequest(BaseModel):
    query_uuid: str
    preferred: int = Field(ge=0, le=1)


class PreferenceResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    phase: str
    iteration: int
    init_index: int
    total_responses: int
    completed: bool


class BestResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    point: list[float]
    values: dict[str, float]
    phase: str
    iteration: int


class HistoryResponse(BaseModel):
    """The runtime's history-triple shape is undocumented in
    `backend/qeubo/README.md`; pass it through verbatim under
    `history` typed as `list[Any]` rather than guessing."""

    model_config = ConfigDict(frozen=True)
    history: list[Any]
    phase: str
    iteration: int
    total_responses: int


# =====================================================================
# Service dependency and shared helpers.
# =====================================================================


_DISABLED = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="qEUBO is not enabled on this server",
)
_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="No qEUBO experiment exists for this user",
)


def get_qeubo_service(request: Request):
    """Resolve the lifespan-constructed `ExperimentService`, or 503.

    The annotation is intentionally absent: typing this with
    `qeubo.ExperimentService` would force an import of the heavy
    runtime (and its `torch` / `botorch` / `gpytorch` transitive deps)
    at module load even when QEUBO_ENABLED is False. The runtime
    contract is documented in `backend/qeubo/README.md`; FastAPI does
    not require the annotation for dependency resolution.
    """
    svc = getattr(request.app.state, "qeubo_service", None)
    if svc is None:
        raise _DISABLED
    return svc


def _eid(user_id: UserId) -> str:
    """Per-user namespacing per dispatch §2.2.

    One experiment per user; suffix is constant. Multi-experiment-per-
    user is explicitly out of scope (dispatch Part 6).
    """
    return f"{int(user_id)}:default"


def _strip_namespace(eid_namespaced: str, user_id: UserId) -> str:
    """Strip the `user_id:` prefix before returning over the wire.

    Dispatch §2.2 mandates "the frontend never sees the namespaced
    form"; §2.4's example response showing `user42:default` appears
    to be illustrative of the runtime's view rather than the wire
    contract. Stripping honors §2.2.
    """
    prefix = f"{int(user_id)}:"
    if eid_namespaced.startswith(prefix):
        return eid_namespaced[len(prefix):]
    return eid_namespaced


async def _require_status(svc, eid: str) -> dict[str, Any]:
    """Probe existence via `get_status`; map missing → 404.

    The README does not document `get_status`'s behavior on a missing
    experiment. By the consistency of `delete_experiment`'s contract
    and the runtime's overall fail-loud posture, we assume `ValueError`
    on missing and catch it. Any other exception propagates and is
    surfaced loudly per ADR-0002.
    """
    try:
        return await svc.get_status(eid)
    except ValueError as e:
        # The message may discriminate "not found" from other ValueErrors
        # in the future; today every documented ValueError on get_status
        # could only come from a missing experiment, so 404 is correct.
        raise _NOT_FOUND from e


def _controlled_and_ranges(
    status_dict: dict[str, Any],
) -> tuple[list[str], dict[str, list[float]]]:
    """Extract the per-experiment encode/decode anchors from status.

    The runtime persists `controlled_parameters` and `parameter_ranges`
    inside `config` verbatim (per `backend/qeubo/README.md`).
    """
    cfg = status_dict.get("config", {}) or {}
    controlled = list(cfg.get("controlled_parameters", []))
    ranges_raw = cfg.get("parameter_ranges", {}) or {}
    ranges: dict[str, list[float]] = {
        k: [float(v[0]), float(v[1])] for k, v in ranges_raw.items()
    }
    return controlled, ranges


# =====================================================================
# Endpoints.
# =====================================================================


@router.post("/experiment", response_model=CreateExperimentResponse)
async def create_experiment(
    payload: CreateExperimentRequest,
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> CreateExperimentResponse:
    """Create-or-replace the user's experiment.

    Per dispatch §2.4, if an experiment already exists for this user,
    delete it first. The user's `analysis_env.parameters` document
    (frontend-side) is unaffected — only Redis state resets.
    """
    missing = [
        n for n in payload.controlled_parameters if n not in payload.parameter_ranges
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"missing parameter_ranges entries for: {missing}",
        )

    eid = _eid(user_id)
    try:
        await svc.delete_experiment(eid)
    except ValueError:
        # No prior experiment; that's fine, this is the create path.
        pass

    user_config: dict[str, Any] = {
        "controlled_parameters": list(payload.controlled_parameters),
        "parameter_ranges": {
            k: [float(v[0]), float(v[1])] for k, v in payload.parameter_ranges.items()
        },
    }
    if payload.config_overrides is not None:
        for k, v in payload.config_overrides.model_dump(exclude_none=True).items():
            user_config[k] = v
    # Effective-unbounded any-time loop per dispatch §2.4 / §3.2.
    user_config.setdefault("num_algo_queries", 1_000_000)

    await svc.create_experiment(eid, user_config)
    s = await svc.get_status(eid)
    return CreateExperimentResponse(
        experiment_id=_strip_namespace(s["experiment_id"], user_id),
        config=s["config"],
        controlled_parameters=list(payload.controlled_parameters),
        phase=s["phase"],
        init_index=s["init_index"],
        num_init_queries=s["num_init_queries"],
        iteration=s["iteration"],
        num_algo_queries=s["num_algo_queries"],
    )


@router.delete("/experiment", status_code=200)
async def delete_experiment(
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> dict[str, Any]:
    """Abort and dissolve the user's experiment. 404 if none exists."""
    try:
        await svc.delete_experiment(_eid(user_id))
    except ValueError as e:
        raise _NOT_FOUND from e
    return {}


@router.get("/experiment/status", response_model=StatusResponse)
async def get_experiment_status(
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> StatusResponse:
    s = await _require_status(svc, _eid(user_id))
    return StatusResponse(
        experiment_id=_strip_namespace(s["experiment_id"], user_id),
        phase=s["phase"],
        init_index=s["init_index"],
        num_init_queries=s["num_init_queries"],
        iteration=s["iteration"],
        num_algo_queries=s["num_algo_queries"],
        total_responses=s["total_responses"],
        has_pending=s["has_pending"],
        pending_query_uuid=s["pending_query_uuid"],
    )


@router.get("/experiment/pair", response_model=PairResponse)
async def get_pair(
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> PairResponse:
    """Fetch (or re-issue) the next A/B pair.

    Probes status first to recover `controlled_parameters` and
    `parameter_ranges` for decoding; the round-trip cost is one Redis
    HMGET, dwarfed by the GP acquisition cost when the runtime fits a
    new pair.
    """
    eid = _eid(user_id)
    s = await _require_status(svc, eid)
    controlled, ranges = _controlled_and_ranges(s)
    pair = await svc.request_pair(eid)
    return PairResponse(
        query_uuid=pair["query_uuid"],
        point_a=list(pair["point_a"]),
        point_b=list(pair["point_b"]),
        values_a=decode(pair["point_a"], controlled, ranges),
        values_b=decode(pair["point_b"], controlled, ranges),
        phase=pair["phase"],
        iteration=pair["iteration"],
        reissued=pair["reissued"],
    )


@router.post("/experiment/preference", response_model=PreferenceResponse)
async def submit_preference(
    payload: PreferenceRequest,
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> PreferenceResponse:
    """Record the user's verdict.

    Per dispatch §2.4, the bundled-apply semantic ("write the chosen
    point's values to `analysis_env.parameters`") is FRONTEND-SIDE.
    This route is preference-recording-only.
    """
    eid = _eid(user_id)
    await _require_status(svc, eid)
    try:
        result = await svc.submit_response(eid, payload.query_uuid, payload.preferred)
    except ValueError as e:
        # Documented ValueErrors on submit_response: no pending pair,
        # wrong query_uuid, or bad `preferred`. All map to 409 — the
        # request was syntactically valid but conflicts with experiment
        # state. Pydantic already rejected `preferred` outside {0, 1}
        # at request validation, so the residual cases are state-conflict.
        raise HTTPException(status_code=409, detail=str(e)) from e

    # `submit_response` returns phase/iteration/total_responses/completed
    # but NOT init_index. Re-read status to surface a complete shape.
    s = await svc.get_status(eid)
    return PreferenceResponse(
        phase=result["phase"],
        iteration=result["iteration"],
        init_index=s["init_index"],
        total_responses=result["total_responses"],
        completed=result["completed"],
    )


@router.get("/experiment/best", response_model=BestResponse)
async def get_best(
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> BestResponse:
    """qEUBO's posterior-mean argmax. Heavy compute; may take seconds."""
    eid = _eid(user_id)
    s = await _require_status(svc, eid)
    if s["phase"] == "init":
        # Pre-empt the runtime's documented ValueError so we can return
        # the dispatch-specified 409 cleanly without ambiguity against
        # any other ValueError the runtime might raise.
        raise HTTPException(
            status_code=409,
            detail="qEUBO model is not yet fitted (still in init phase)",
        )
    controlled, ranges = _controlled_and_ranges(s)
    best = await svc.get_best_point(eid)
    return BestResponse(
        point=list(best["best_point"]),
        values=decode(best["best_point"], controlled, ranges),
        phase=best["phase"],
        iteration=best["iteration"],
    )


@router.get("/experiment/history", response_model=HistoryResponse)
async def get_history(
    user_id: UserId = Depends(get_current_user_id),
    svc=Depends(get_qeubo_service),
) -> HistoryResponse:
    """Diagnostic: the full ordered preference-triple history."""
    eid = _eid(user_id)
    s = await _require_status(svc, eid)
    h = await svc.get_history(eid)
    return HistoryResponse(
        history=list(h.get("history", [])),
        phase=h.get("phase", s["phase"]),
        iteration=h.get("iteration", s["iteration"]),
        total_responses=h.get("total_responses", s["total_responses"]),
    )
