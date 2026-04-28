# `qeubo` — public API contract

This README is the **load-bearing artefact** for the licensing
boundary documented in
`docs/dispatch/frontend-to-backend-qeubo-integration.md`.

Public-domain code outside `backend/qeubo/` (notably the FastAPI
route handlers in `backend/api/routes/qeubo.py` and any sibling
encode/decode utility modules) **must consume this package via
the API documented below, not by reading the source files in
`vendor/` or `runtime/`**. Source visibility tainted with MIT-
derivative status would carry the MIT obligation outward; calling
documented function signatures (a non-copyrightable interface)
does not.

This file documents enough of the public surface that a PD
caller can be written without source visibility.

## Licensing

The whole `backend/qeubo/` directory tree is MIT-licensed
(derivative of upstream qEUBO at Meta Platforms; see `LICENSE`
in this directory for the full text and `backend/NOTICE` for the
provenance trail). The `vendor/` subdirectory is the upstream
library copied verbatim; the `runtime/` subdirectory is the
LLM-derived wrapper, also MIT.

## Runtime dependencies

The wrapper requires the following beyond the backend's existing
deps. These are not yet listed in `backend/requirements.txt` — the
route-implementer session is expected to add them when wiring the
FastAPI routes (or to add them to a separate `backend/qeubo/`-
local requirements file gated on the `QEUBO_ENABLED` config flag).

- `torch` — PyTorch tensor backend. Heavy (multi-GB on first
  install; CPU build is sufficient for the demo's use case).
- `botorch` — Bayesian optimisation primitives (acquisition
  functions, samplers, model utilities).
- `gpytorch` — GP model implementations (used by the upstream's
  variational preferential GP).
- `redis>=4` — async Redis client (`redis.asyncio`).
- `scipy`, `numpy` — already in the backend's deps; the upstream
  uses them for optimisation routines and array math.

The exact pinning is deferred to the route-implementer session
(or the user's local install procedure). Recommend installing
qEUBO's upstream pin baseline and verifying the import chain
boots before wiring routes.

## Compatibility envelope

Upstream qEUBO is unmaintained (last commit `21cd661e`,
2023-03-24) and was written against the botorch / torch
ecosystem of that period. Two breaking changes have landed in
the third-party deps since:

- **botorch ≥0.9** tightened `MCSampler.sample_shape` from
  accepting `int` to requiring `torch.Size`. Vendored qEUBO
  calls `SobolQMCNormalSampler(sample_shape=512)` in the
  preferential-softmax likelihood; botorch >=0.9 raises
  `InputDataError`.
- **modern torch** defaults to float32 (older torch defaulted
  to float64). Vendored qEUBO assumes float64 throughout, and
  the dtype mismatch surfaces as `RuntimeError: expected m1
  and m2 to have the same dtype, but got: double != float`
  inside gpytorch's variational strategy.

The runtime carries two compatibility shims at module-import
time, in `runtime/_compat.py`, that bridge both regressions:

1. `MCSampler.__init__` is patched at the base class to
   coerce `int` inputs to `torch.Size`. One-way coercion;
   never narrows behavior.
2. `torch.set_default_dtype(torch.float64)` is called at
   import time so vendor-created tensors land in the expected
   precision.

These shims activate when the qEUBO package is imported (i.e.
when `QEUBO_ENABLED=True` flips the route layer on); a backend
with `QEUBO_ENABLED=False` does not import the package and is
unaffected. PD callers do not need to know the shims exist —
the runtime is shim-aware on their behalf.

Verified working with this envelope:

| Component  | Tested at | Notes                                    |
|------------|-----------|------------------------------------------|
| `torch`    | 2.11.0    | Newer torch may need a re-test            |
| `botorch`  | 0.17.2    | Patches the int→torch.Size coercion above |
| `gpytorch` | 1.15.2    | Used transitively via botorch / vendor    |
| `redis`    | 7.4.0     | Async client `redis.asyncio`              |

If a future torch / botorch / gpytorch update introduces a
new shape or API drift, surface it as a third entry in
`runtime/_compat.py` rather than monkey-patching from PD code.
The licensing boundary is preserved by keeping every
botorch/torch-internals patch inside the MIT scope.

## Importing

```python
from qeubo import ExperimentService, ExperimentStorage
```

The package's `__init__.py` performs a one-time `sys.path`
manipulation to make the upstream library's internal `from src.X
import Y` style imports resolve. **Always import the top-level
`qeubo` package first**; importing `qeubo.runtime.service` or
`qeubo.runtime.storage` directly without going through `qeubo`'s
`__init__.py` will fail because the path setup hasn't run.

## Public classes

### `class ExperimentStorage`

Async wrapper around Redis (or KeyDB) for experiment persistence.
PyTorch tensors are stored as raw bytes via `torch.save`; the JSON
config and state are stored as bytes-encoded JSON.

```python
ExperimentStorage(redis_url: str = "redis://localhost:6379")
```

Construct with a Redis URL. The default points at a local Redis
on the conventional port; override via env-var-driven config.

```python
async ping() -> bool
```

Returns `True` if the Redis connection is healthy, `False`
otherwise. Use this as a startup readiness check before
constructing an `ExperimentService`.

The remaining `ExperimentStorage` methods (`save_config`,
`load_config`, `save_state`, `load_state`, `save_tensor`,
`load_tensor`, `delete_experiment`, `experiment_exists`,
`list_experiments`) are **internal** — used by `ExperimentService`,
not by PD callers. Don't call them directly.

### `class ExperimentService`

The primary surface PD callers use. Manages the full lifecycle of
preference-based optimisation experiments. All methods are async.

```python
ExperimentService(storage: ExperimentStorage,
                  executor: concurrent.futures.ThreadPoolExecutor)
```

Construct with a storage instance and a thread-pool executor. The
service offloads heavy GP fitting and acquisition-function
optimisation to the executor so the asyncio event loop stays
responsive. Recommend at least two workers — a request to fit a
new model and a request to compute the posterior best point on a
different experiment can otherwise contend.

#### `async create_experiment(experiment_id: str, user_config: dict) -> dict`

Create a new experiment. Raises `ValueError` if `experiment_id`
already exists.

`user_config` accepts:

- **One of**:
  - `input_dim: int` (positive integer) — explicit dimensionality.
  - `controlled_parameters: list[str]` — names whose count
    determines `input_dim`. The names are stored in the
    experiment's config for retrieval via the status / pair / best
    responses; the runtime does not consume them computationally
    but persists them so PD callers can derive the
    `index → name` mapping needed for encode/decode.
- **Optionally**:
  - `parameter_ranges: dict[str, [float, float]]` — `[min, max]`
    pairs per controlled parameter name. Stored verbatim,
    retrieved verbatim, never used in computation by this package.
    PD code is responsible for the actual encode (real value →
    `[0, 1]` point) and decode (point → real value) using these
    ranges.
  - `num_init_queries: int | None` — number of pre-generated random
    queries to seed the GP before qEUBO acquisition takes over.
    Defaults to `4 * input_dim` if not specified.
  - `num_algo_queries: int` — number of qEUBO-driven queries before
    the experiment terminates. Defaults to `1_000_000` (effectively
    unbounded; see the dispatch on the any-time loop semantic).
  - `noise_type: str` — `"logit"` (default) or another upstream-
    supported likelihood family.
  - `noise_level: float` — observation noise. Default `0.1416`.
  - `num_alternatives: int` — pair size. Default `2` (binary
    preferences).
  - `model_type: str` — `"variational_preferential_gp"` (default).

Returns:

```python
{
    "experiment_id": str,
    "config": dict,           # the resolved config (defaults +
                              #   user_config), including any
                              #   controlled_parameters /
                              #   parameter_ranges that were
                              #   supplied, plus the resolved
                              #   input_dim.
}
```

#### `async request_pair(experiment_id: str) -> dict`

Return the next pair to compare. **Idempotent under pending
state**: if a pair is pending (was returned but not yet answered),
the same pair re-issues with `reissued: true`. This is the
substrate that lets the frontend pre-fetch and cache the next
pair without losing position on reload.

Raises `ValueError` if the experiment is `phase == "completed"`.
(Note: with the unbounded `num_algo_queries` default, completion
is not expected in normal operation.)

Returns:

```python
{
    "query_uuid": str,        # ULID-style; ties this pair to the
                              #   eventual `submit_response` call.
    "point_a":    list[float], # in [0, 1]^input_dim
    "point_b":    list[float], # in [0, 1]^input_dim
    "phase":      "init" | "optimization",
    "iteration":  int,         # 0 during init; counts up during
                               #   optimization.
    "reissued":   bool,        # true if this is the same pending
                               #   pair as a previous call.
}
```

The points are in normalised `[0, 1]^input_dim`; PD callers decode
them against `parameter_ranges` (retrieved from `get_status`'s
config) into actual parameter values.

#### `async submit_response(experiment_id: str, query_uuid: str, preferred: int) -> dict`

Record the user's preference. `preferred` is `0` for `point_a` or
`1` for `point_b`. The runtime appends the observation to the
queries / responses tensors in Redis and invalidates the in-memory
model cache for this experiment so the next `request_pair` (or
`get_best_point`) refits.

Raises `ValueError` if there is no pending pair, or if the
`query_uuid` doesn't match the pending one, or if `preferred` is
not `0` or `1`.

Returns:

```python
{
    "experiment_id":   str,
    "phase":           "init" | "optimization" | "completed",
    "iteration":       int,
    "total_responses": int,
    "completed":       bool,
}
```

#### `async get_status(experiment_id: str) -> dict`

Snapshot of the experiment's current state. Always returns
immediately (no GP work).

Returns:

```python
{
    "experiment_id":      str,
    "config":             dict,    # the full config; PD callers
                                   #   read controlled_parameters
                                   #   and parameter_ranges from
                                   #   here for encode/decode.
    "phase":              "init" | "optimization" | "completed",
    "init_index":         int,     # 0 ≤ this < num_init_queries
                                   #   during init; equals
                                   #   num_init_queries thereafter.
    "num_init_queries":   int,
    "iteration":          int,     # ≥ 0 during optimization.
    "num_algo_queries":   int,
    "total_responses":    int,     # cumulative responses across
                                   #   both phases.
    "has_pending":        bool,
    "pending_query_uuid": str | None,
}
```

#### `async get_best_point(experiment_id: str) -> dict`

Return the qEUBO posterior-mean argmax — qEUBO's current "best
estimate." This is *qEUBO's* best, distinct from any user-pinned
bookmarks, which the PD caller manages separately.

**Heavy compute** — runs posterior optimisation through the
executor. May take several seconds.

Raises `ValueError` if `phase == "init"` (the model isn't yet
fitted).

Returns:

```python
{
    "experiment_id": str,
    "best_point":    list[float],  # in [0, 1]^input_dim
    "phase":         str,
    "iteration":     int,
}
```

#### `async delete_experiment(experiment_id: str) -> None`

Remove all Redis state for the experiment. Raises `ValueError` if
the experiment doesn't exist. The PD caller is responsible for
deciding when to delete (e.g. when the user changes the
`controlled_parameters` set, the route handler should
`delete_experiment` then `create_experiment` to reset the GP over
the new parameter scope).

#### `async list_experiments() -> list[dict]`

Returns a list of experiment summaries — `experiment_id`,
`input_dim`, `phase`, `iteration`, `num_algo_queries`. Useful for
debugging; not part of the normal user flow.

#### `async get_history(experiment_id: str) -> dict`

Returns the full ordered history of `(point_a, point_b, preferred)`
triples plus current phase / iteration / total_responses. For
diagnostic use.

## Things the PD caller is responsible for

The runtime is intentionally narrow. The PD caller (route handler)
owns:

- **Per-user namespacing.** Prepend `user_id:` to every
  `experiment_id` before forwarding to this service. The runtime
  is domain-blind; one user's `experiment_id` collides with
  another's if not prefixed.
- **Encode/decode** of points ↔ actual parameter values, using
  the `parameter_ranges` retrieved from `get_status`'s config.
  The math is `(actual − min) / (max − min)` for encode,
  `min + (max − min) * point` for decode. No qEUBO source
  visibility needed.
- **JWT authentication** via the existing `get_current_user_id`
  dependency.
- **The "bundled apply" verdict semantic** — when the user picks
  a preference, the route handler calls `submit_response` AND
  writes the chosen point's decoded values into the user's
  `analysis_env.parameters` document. The runtime is preference-
  recording-only.
- **Bookmark storage** — saved parameter snapshots are per-user
  state in the document store, independent of the qEUBO
  experiment lifecycle.

## Things the runtime intentionally does NOT do

- **No domain awareness.** The runtime knows nothing about
  LengYue, palettes, analysis environments, or board games. Names
  are opaque keys; ranges are opaque numbers.
- **No colour-table / gamut / JAB / quotient-space hue.** The
  user's prototype at `~/preference_optimizer/qEUBO/wss3/` was
  layered with a gradient-optimizer use case (colormap tuning)
  that is out of scope for LengYue's PBO integration. None of
  that code is vendored or referenced here.
- **No HTTP / WebSocket dispatch.** The demo's `server.py` is not
  vendored; the PD route handlers replace it.
- **No user authentication.** All keys are opaque; auth happens
  outside.

## Recommended construction

```python
# In backend/main.py or its lifespan setup, gated on QEUBO_ENABLED:
import os
from concurrent.futures import ThreadPoolExecutor
from qeubo import ExperimentService, ExperimentStorage

QEUBO_REDIS_URL = os.getenv("QEUBO_REDIS_URL", "redis://localhost:6379")

storage  = ExperimentStorage(QEUBO_REDIS_URL)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="qeubo_worker")
service  = ExperimentService(storage, executor)

# Wait for Redis to be reachable before declaring readiness.
if not await storage.ping():
    raise RuntimeError(f"qEUBO storage unreachable at {QEUBO_REDIS_URL}")
```

The route handlers receive the `service` via FastAPI's dependency
injection and call its methods.
