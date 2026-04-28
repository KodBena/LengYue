"""
Business logic for qEUBO preference-based optimisation experiments.

Adapted from ~/preference_optimizer/qEUBO/wss3/service.py with the
gradient-optimizer / colormap extensions stripped. The PBO core is what
remains: experiment lifecycle (init → optimization), pending-pair
re-issue semantics, async-with-thread-pool offloading of GP fits,
qEUBO-driven pair selection, and posterior-mean argmax for the best
estimate.

What was removed (per the dispatch's PBO-core scope):

  - colormap.py imports (the JAX-based gamut renderer and CAM colour
    decoding).
  - _compute_colour_data() / _attach_colour_data() helpers — they
    enriched pair / best responses with colour-table fields specific
    to the colormap-tuning use case.
  - colour_table_a / colour_table_b / waypoints_jab_* / floor_jab_* /
    ceiling_jab_* fields in returned dicts.
  - Gradient-specific config fields from _DEFAULT_CONFIG: n_waypoints,
    colour_table_size, hue_global, hue_sweep_limit,
    endpoint_chroma_bound, interior_chroma_bound. The remaining fields
    are the PBO core.
  - JAB / quotient-space hue documentation.
  - The get_gamut_slice handler (was in server.py, not vendored).

What was added:

  - controlled_parameters: list[str] and parameter_ranges:
    dict[str, [float, float]] are accepted in user_config at
    create_experiment time and stored alongside qEUBO's own config.
    The runtime does not use them in computation — they are persisted
    so the route handlers can retrieve them via get_status / pair /
    best responses, where they become the input to the
    encode/decode logic that lives in PD code outside this package.
    `input_dim` is derived from `len(controlled_parameters)` if
    not specified explicitly.

Experiment lifecycle:
  init         Collecting responses to num_init_queries randomly
               generated pairs.
  optimization GP model fitted; qEUBO selects each new pair.
  completed    num_algo_queries iterations finished; read-only.

License: MIT — see ../LICENSE
"""

import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

import torch
from botorch.acquisition import PosteriorMean
from botorch.sampling import SobolQMCNormalSampler
from torch import Tensor

# Vendored upstream qEUBO. Resolves via the sys.path manipulation in
# `qeubo/__init__.py` which adds `qeubo/vendor/` to sys.path so `from
# src.X import Y` works against the vendored copy.
from src.acquisition_functions.eubo import qExpectedUtilityOfBestOption
from src.utils import (
    fit_model,
    generate_random_queries,
    optimize_acqf_and_get_suggested_query,
)

from .storage import ExperimentStorage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Defaults — PBO core only.
# ---------------------------------------------------------------------------

_DEFAULT_CONFIG: dict = {
    "noise_type":       "logit",
    "noise_level":      0.1416,
    "num_alternatives": 2,
    "num_init_queries": None,     # resolved to 4 × input_dim at creation
    "num_algo_queries": 1_000_000,  # effectively unbounded — see dispatch §3.2
    "model_type":       "variational_preferential_gp",
}

# ---------------------------------------------------------------------------
# Blocking helpers (offloaded to ThreadPoolExecutor)
# ---------------------------------------------------------------------------

def _blocking_fit_model(queries, responses, model_type, noise_type):
    return fit_model(queries, responses, model_type=model_type, likelihood=noise_type)


def _blocking_run_qeubo(model, input_dim, num_alternatives):
    bounds  = torch.tensor([[0.0]*input_dim, [1.0]*input_dim])
    sampler = SobolQMCNormalSampler(sample_shape=torch.Size([64]))
    acqf    = qExpectedUtilityOfBestOption(model=model, sampler=sampler)
    return optimize_acqf_and_get_suggested_query(
        acq_func=acqf, bounds=bounds, batch_size=num_alternatives,
        num_restarts=input_dim*num_alternatives,
        raw_samples=30*input_dim*num_alternatives,
    )


def _blocking_get_best_point(model, input_dim):
    bounds    = torch.tensor([[0.0]*input_dim, [1.0]*input_dim])
    post_mean = PosteriorMean(model=model)
    return optimize_acqf_and_get_suggested_query(
        acq_func=post_mean, bounds=bounds, batch_size=1,
        num_restarts=6*input_dim, raw_samples=180*input_dim,
    )

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ExperimentService:
    """
    Manages the full lifecycle of preference-based optimisation experiments.

    All public methods are async. Heavy computation (model fitting and
    acquisition optimisation) is offloaded to a ThreadPoolExecutor so the
    asyncio event loop stays responsive. Per-experiment fitted models
    are cached in-memory and invalidated on each new response.
    """

    def __init__(self, storage: ExperimentStorage, executor: ThreadPoolExecutor) -> None:
        self.storage  = storage
        self.executor = executor
        self._models: dict[str, Any] = {}

    async def _run(self, fn, *args) -> Any:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self.executor, fn, *args)

    async def _require(self, experiment_id: str) -> tuple[dict, dict]:
        config = await self.storage.load_config(experiment_id)
        if config is None:
            raise ValueError(f"Experiment '{experiment_id}' not found.")
        state = await self.storage.load_state(experiment_id)
        return config, state

    async def _get_or_fit_model(self, experiment_id: str, config: dict) -> Any:
        if experiment_id in self._models:
            return self._models[experiment_id]
        queries   = await self.storage.load_tensor(experiment_id, "queries")
        responses = await self.storage.load_tensor(experiment_id, "responses")
        if queries is None or responses is None or queries.shape[0] == 0:
            raise ValueError("No training data — complete initial queries first.")
        logger.info("Fitting model for '%s' (%d responses).", experiment_id, queries.shape[0])
        model = await self._run(
            _blocking_fit_model, queries, responses,
            config["model_type"], config["noise_type"],
        )
        self._models[experiment_id] = model
        return model

    def _invalidate_model(self, experiment_id: str) -> None:
        self._models.pop(experiment_id, None)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_experiment(self, experiment_id: str, user_config: dict) -> dict:
        """
        Create a new experiment.

        Required in user_config (one of the two patterns):
          - input_dim (int): explicit dimensionality, OR
          - controlled_parameters (list[str]): names whose count
            determines input_dim. The names + ranges are stored in the
            experiment config for retrieval via status / pair / best;
            the runtime does not consume them computationally.

        Optional in user_config:
          - parameter_ranges: dict mapping each controlled parameter
            name to a [min, max] pair. Stored verbatim; not used in
            computation. The encode/decode against these ranges is
            handled in PD route-handler code outside this package.
          - num_init_queries / num_algo_queries / noise_type /
            noise_level / model_type / num_alternatives — see
            _DEFAULT_CONFIG above.

        Raises ValueError if the experiment already exists or if neither
        input_dim nor controlled_parameters is provided.
        """
        if await self.storage.experiment_exists(experiment_id):
            raise ValueError(f"Experiment '{experiment_id}' already exists.")

        controlled_parameters = user_config.get("controlled_parameters")
        input_dim = user_config.get("input_dim")
        if input_dim is None and isinstance(controlled_parameters, list):
            input_dim = len(controlled_parameters)
        if not isinstance(input_dim, int) or input_dim < 1:
            raise ValueError(
                "Either 'input_dim' (positive int) or 'controlled_parameters' "
                "(non-empty list of names) must be supplied."
            )
        user_config = {**user_config, "input_dim": input_dim}

        config = {**_DEFAULT_CONFIG, **user_config}
        if config["num_init_queries"] is None:
            config["num_init_queries"] = 4 * input_dim

        init_queries: Tensor = generate_random_queries(
            num_queries=config["num_init_queries"],
            num_alternatives=config["num_alternatives"],
            input_dim=config["input_dim"],
        )
        state: dict = {
            "phase": "init", "init_index": 0, "iteration": 0, "pending": None,
        }
        await self.storage.save_config(experiment_id, config)
        await self.storage.save_tensor(experiment_id, "init_queries", init_queries)
        await self.storage.save_state(experiment_id, state)
        logger.info(
            "Created experiment '%s' (dim=%d, init=%d, algo=%d).",
            experiment_id, input_dim,
            config["num_init_queries"], config["num_algo_queries"],
        )
        return {"experiment_id": experiment_id, "config": config}

    async def request_pair(self, experiment_id: str) -> dict:
        """
        Return the next pair for comparison.

        Re-issues the pending pair unchanged if a response hasn't been
        submitted yet (the GP state hasn't moved on; same query stays
        valid).
        """
        config, state = await self._require(experiment_id)

        # ── Re-issue pending pair ──────────────────────────────────────
        if state["pending"] is not None:
            p = state["pending"]
            logger.debug("Re-issuing pending pair %s for '%s'.", p["query_uuid"], experiment_id)
            return {
                "query_uuid": p["query_uuid"],
                "point_a":    p["point_a"],
                "point_b":    p["point_b"],
                "phase":      state["phase"],
                "iteration":  state["iteration"],
                "reissued":   True,
            }

        if state["phase"] == "completed":
            raise ValueError(
                f"Experiment '{experiment_id}' is completed. "
                "Use get_best_point or get_history."
            )

        # ── Init phase: next pre-generated pair ────────────────────────
        if state["phase"] == "init":
            init_queries = await self.storage.load_tensor(experiment_id, "init_queries")
            idx   = state["init_index"]
            query = init_queries[idx]
            point_a, point_b = query[0].tolist(), query[1].tolist()
            logger.debug("Init query %d/%d for '%s'.", idx+1, config["num_init_queries"], experiment_id)

        # ── Optimisation phase: qEUBO ──────────────────────────────────
        elif state["phase"] == "optimization":
            logger.info(
                "Running qEUBO for '%s' (iter %d/%d).",
                experiment_id, state["iteration"]+1, config["num_algo_queries"],
            )
            model     = await self._get_or_fit_model(experiment_id, config)
            new_query = await self._run(
                _blocking_run_qeubo, model, config["input_dim"], config["num_alternatives"],
            )
            point_a, point_b = new_query[0].tolist(), new_query[1].tolist()

        # ── Persist ───────────────────────────────────────────────────
        query_uuid = str(uuid.uuid4())
        state["pending"] = {"query_uuid": query_uuid, "point_a": point_a, "point_b": point_b}
        await self.storage.save_state(experiment_id, state)

        return {
            "query_uuid": query_uuid,
            "point_a":    point_a,
            "point_b":    point_b,
            "phase":      state["phase"],
            "iteration":  state["iteration"],
            "reissued":   False,
        }

    async def submit_response(
        self, experiment_id: str, query_uuid: str, preferred: int,
    ) -> dict:
        """Record a preference. preferred: 0 → point_a, 1 → point_b."""
        config, state = await self._require(experiment_id)

        if state["pending"] is None:
            raise ValueError("No pending pair — call request_pair first.")
        if state["pending"]["query_uuid"] != query_uuid:
            raise ValueError(f"query_uuid mismatch: expected '{state['pending']['query_uuid']}'.")
        if preferred not in (0, 1):
            raise ValueError("'preferred' must be 0 or 1.")

        pending = state["pending"]
        pa = torch.tensor(pending["point_a"], dtype=torch.float64)
        pb = torch.tensor(pending["point_b"], dtype=torch.float64)
        new_query    = torch.stack([pa, pb]).unsqueeze(0)
        new_response = torch.tensor([preferred], dtype=torch.long)

        eq = await self.storage.load_tensor(experiment_id, "queries")
        er = await self.storage.load_tensor(experiment_id, "responses")
        queries   = new_query    if eq is None else torch.cat([eq, new_query],    dim=0)
        responses = new_response if er is None else torch.cat([er, new_response], dim=0)

        await self.storage.save_tensor(experiment_id, "queries",   queries)
        await self.storage.save_tensor(experiment_id, "responses", responses)
        self._invalidate_model(experiment_id)
        state["pending"] = None

        if state["phase"] == "init":
            state["init_index"] += 1
            if state["init_index"] >= config["num_init_queries"]:
                state["phase"] = "optimization"; state["iteration"] = 0
                logger.info("Experiment '%s': init complete, entering optimisation.", experiment_id)
        elif state["phase"] == "optimization":
            state["iteration"] += 1
            if state["iteration"] >= config["num_algo_queries"]:
                state["phase"] = "completed"
                logger.info("Experiment '%s' completed.", experiment_id)

        await self.storage.save_state(experiment_id, state)
        return {
            "experiment_id":   experiment_id,
            "phase":           state["phase"],
            "iteration":       state["iteration"],
            "total_responses": int(queries.shape[0]),
            "completed":       state["phase"] == "completed",
        }

    async def get_status(self, experiment_id: str) -> dict:
        """
        Status snapshot. Returns the experiment config (including any
        controlled_parameters / parameter_ranges that were stored at
        create time), the current phase, and counts.
        """
        config, state = await self._require(experiment_id)
        queries = await self.storage.load_tensor(experiment_id, "queries")
        return {
            "experiment_id":     experiment_id,
            "config":            config,
            "phase":             state["phase"],
            "init_index":        state["init_index"],
            "num_init_queries":  config["num_init_queries"],
            "iteration":         state["iteration"],
            "num_algo_queries":  config["num_algo_queries"],
            "total_responses":   int(queries.shape[0]) if queries is not None else 0,
            "has_pending":       state["pending"] is not None,
            "pending_query_uuid": state["pending"]["query_uuid"] if state["pending"] else None,
        }

    async def get_best_point(self, experiment_id: str) -> dict:
        """
        Return the GP posterior-mean argmax. Only available after init
        is complete (the model is fitted lazily on first call after the
        init phase).

        Raises ValueError if the experiment is still in init phase.
        """
        config, state = await self._require(experiment_id)
        if state["phase"] == "init":
            raise ValueError("Model not yet fitted. Complete initial queries first.")

        model = await self._get_or_fit_model(experiment_id, config)
        best  = await self._run(_blocking_get_best_point, model, config["input_dim"])
        best_point = best.squeeze(0).tolist()

        return {
            "experiment_id": experiment_id,
            "best_point":    best_point,
            "phase":         state["phase"],
            "iteration":     state["iteration"],
        }

    async def list_experiments(self) -> list[dict]:
        ids    = await self.storage.list_experiments()
        result = []
        for eid in ids:
            config = await self.storage.load_config(eid)
            state  = await self.storage.load_state(eid)
            if config and state:
                result.append({
                    "experiment_id":    eid,
                    "input_dim":        config.get("input_dim"),
                    "phase":            state["phase"],
                    "iteration":        state["iteration"],
                    "num_algo_queries": config.get("num_algo_queries"),
                })
        return result

    async def delete_experiment(self, experiment_id: str) -> None:
        if not await self.storage.experiment_exists(experiment_id):
            raise ValueError(f"Experiment '{experiment_id}' not found.")
        self._invalidate_model(experiment_id)
        await self.storage.delete_experiment(experiment_id)
        logger.info("Deleted experiment '%s'.", experiment_id)

    async def get_history(self, experiment_id: str) -> dict:
        config, state = await self._require(experiment_id)
        queries   = await self.storage.load_tensor(experiment_id, "queries")
        responses = await self.storage.load_tensor(experiment_id, "responses")
        history   = []
        if queries is not None and queries.shape[0] > 0:
            for i in range(queries.shape[0]):
                history.append({
                    "index":     i,
                    "point_a":   queries[i, 0].tolist(),
                    "point_b":   queries[i, 1].tolist(),
                    "preferred": int(responses[i].item())
                        if responses is not None and i < responses.shape[0] else None,
                })
        return {
            "experiment_id":   experiment_id,
            "phase":           state["phase"],
            "iteration":       state["iteration"],
            "total_responses": len(history),
            "history":         history,
        }
