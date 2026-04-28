# qEUBO Integration — Frontend → Backend Dispatch

- **Date:** 2026-04-28
- **From:** frontend (authoring session, 2026-04-28)
- **To:** backend (recipient session for vendoring + endpoint
  implementation); frontend (recipient session for client-side
  composables + UX wiring).
- **Type:** spec / cross-team request.
- **Status:** open — awaiting backend confirmation of the
  vendoring shape, then implementation on both sides.
- **Suggested filing:** `docs/dispatch/frontend-to-backend-qeubo-integration.md`
  per ADR-0005's dispatch-ledger convention.

This dispatch specifies the integration of the qEUBO preference-
based optimisation library into LengYue, exposed to the user as an
any-time A/B-preference calibration loop over user-declared
parameters. Authored against the existing prototype at
`~/preference_optimizer/qEUBO/wss3` (the user's WebSocket-based
demo) and informed by the project's vendoring precedent at
`proxy/goboard_transposition/`.

The work splits across the frontend SPA (toolbar UX, calibration
state machine, schema additions, encode/decode of parameter
values), the backend service (REST endpoints, encode/decode
logic, qEUBO library vendoring, per-user namespacing), and shared
wire contracts.

## Provenance and licensing

This dispatch was authored from four sources, all read directly:

1. **The user's existing demo at
   `~/preference_optimizer/qEUBO/wss3`** — `server.py`, `service.py`,
   `storage.py`, and the HTML client `gui/ode3.html`. The demo's
   server- and service-layer code is the user's own work
   (presumably public-domain or implicitly Unlicense since it
   sits inside the LengYue contributor's home directory). The
   demo wraps the upstream qEUBO library; the **library itself
   was not read** for this dispatch — the library's API surface
   is inferred from the demo's import sites and docstrings, which
   is sufficient to specify the integration without taking on
   derivative-work obligations beyond what the wholesale vendoring
   already implies.

2. **`proxy/NOTICE` and `proxy/goboard_transposition/`** — the
   project's established vendoring precedent for MIT-licensed
   wholesale imports. The pattern (boundary by directory,
   self-contained subdirectory with own LICENSE, vendored
   sub-deps under `third_party/` with READMEs documenting
   provenance) is replicated below for qEUBO.

3. **`docs/handoff-current.md`** — confirms qEUBO's role in the
   project roadmap (item 3, post-tenancy / post-analysis-
   persistence) and KataProxy's analysis-level cache as the
   substrate that makes the calibration loop economically
   feasible.

4. **`docs/notes/auditor-notes.md`** — confirms the
   user-direct-via-prose, non-programmer audience framing that
   shapes UX choices below.

### Licensing

qEUBO is distributed under the MIT License. LengYue (frontend +
backend) is released into the public domain (Unlicense).

The vendoring approach mirrors `proxy/goboard_transposition/`:
qEUBO's source is incorporated wholesale into a self-contained
backend subdirectory, that subdirectory carries the MIT license
and attribution, and the rest of the backend remains public
domain. **The boundary is by directory** — there is no derivative
work outside `backend/qeubo_vendor/` (the wholesale-imported
library code).

The wrapper code that LengYue authors (the FastAPI routes, the
encode/decode logic, the storage adapter) lives in a sibling
directory `backend/qeubo/` and is public domain. It *uses* the
vendored library through normal Python imports; it is not a
derivative work in the copyright sense.

A new `backend/NOTICE` (parallel to `proxy/NOTICE`) declares the
boundary explicitly, including:

- Project root + most subdirectories: public domain (Unlicense).
- `backend/qeubo_vendor/`: MIT, with full attribution and a
  derivation-provenance section recording the upstream source
  URL, version/commit SHA, and update procedure.

Downstream packagers and redistributors of the backend must
include `backend/qeubo_vendor/LICENSE` alongside any binary or
source form of the qeubo_vendor module. Redistributions that omit
the qEUBO loop (the optimisation feature is gated behind a
configuration flag — see Part 6) carry no MIT obligation.

## Part 1 — Architecture overview

The integration is a three-tier system:

```
┌─────────────────────────┐    REST + JWT     ┌───────────────────────────┐
│ Frontend SPA             │ ───────────────► │ LengYue backend           │
│  - Toolbar A/B cluster   │                  │  - api/routes/qeubo.py    │
│  - useQeubo composable   │                  │  - qeubo/encoding.py      │
│  - Bookmark UX           │                  │  - qeubo/service.py       │
│  - Schema migrations     │                  │  - qeubo/storage.py       │
│  - Parameter-meta editor │                  │  - qeubo_vendor/ (MIT)    │
└─────────────────────────┘                  └────────────┬─────────────┘
                                                          │ Python import +
                                                          │ Redis (KeyDB)
                                                          ▼
                                            ┌───────────────────────────┐
                                            │ qEUBO library + Redis     │
                                            │  - GP fitting             │
                                            │  - qEUBO acquisition      │
                                            │  - Tensor persistence     │
                                            └───────────────────────────┘
```

The qEUBO server from the demo is **not deployed as a separate
process**. Its logic (the `ExperimentService` and `ExperimentStorage`
classes) is adapted into `backend/qeubo/` as ordinary Python
modules; the FastAPI routes call into them directly, replacing the
WebSocket dispatcher. Redis (KeyDB on the user's machine) remains
the experiment-data store — it is the natural substrate for the
PyTorch tensors qEUBO operates on.

### User-facing behaviour summary

- Calibration is **always-on** when any parameter has the
  `qeubo_controlled` flag set. The toolbar shows the A/B cluster
  whenever a calibration experiment exists; removing the flag from
  all parameters dissolves the experiment and hides the cluster.
- The user toggles between **applied / A / B** views via a single
  control. Toggling does *not* write to `analysis_env.parameters`
  — it temporarily overrides what the engine sees during
  evaluation. The "applied" value is persistent in the user's
  profile.
- "I prefer A" / "I prefer B" verdicts **bundle** two effects:
  submit the preference observation to the qEUBO posterior, AND
  apply that point's values to `analysis_env.parameters` (so the
  user's next analysis run reflects their stated choice without a
  second click).
- Bookmarks ("pin this") are saved snapshots of any parameter
  configuration the user wants to keep — independent of qEUBO's
  optimiser state. They survive experiment changes.
- Starting a new experiment over a different parameter scope
  preserves the existing values of any parameter not in the new
  scope. Only the qEUBO-server-side state is reset; the user's
  applied values, bookmarks, and parameter declarations are
  untouched.

## Part 2 — Backend responsibilities

### 2.1 Vendoring layout

Following `proxy/goboard_transposition/`'s precedent:

```
backend/
├── NOTICE                          # NEW. Mirrors proxy/NOTICE
│                                   #   - root + most subdirs: Unlicense
│                                   #   - qeubo_vendor/: MIT (qEUBO upstream)
│
├── qeubo_vendor/                   # NEW. Self-contained MIT-licensed import
│   ├── LICENSE                     #   qEUBO upstream MIT license, verbatim
│   ├── README.md                   #   Provenance: upstream URL, commit SHA,
│   │                               #     update procedure (see goboard_transposition/
│   │                               #     third_party/README.md for template)
│   ├── pyproject.toml              #   Independent build/install if desired,
│   │                               #     parallel to goboard_transposition/pyproject.toml
│   └── src/
│       ├── __init__.py
│       ├── acquisition_functions/
│       │   ├── __init__.py
│       │   └── eubo.py             #   The qExpectedUtilityOfBestOption class
│       ├── models/                 #   GP model variants (per qEUBO upstream)
│       └── utils.py                #   fit_model, generate_random_queries,
│                                   #     optimize_acqf_and_get_suggested_query
│
├── qeubo/                          # NEW. Public-domain wrapper (LengYue)
│   ├── __init__.py
│   ├── service.py                  #   ExperimentService, adapted from
│   │                               #     wss3/service.py (drop WebSocket-
│   │                               #     specific code; pure Python class)
│   ├── storage.py                  #   ExperimentStorage, adapted from
│   │                               #     wss3/storage.py (Redis tensor I/O)
│   └── encoding.py                 #   NEW. point ↔ actual parameter values
│                                   #     (see §2.3)
│
├── api/
│   └── routes/
│       └── qeubo.py                # NEW. FastAPI routes (see §2.4)
│
└── core/
    └── config.py                   # EDITED. Add QEUBO_REDIS_URL,
                                    #   QEUBO_ENABLED feature flag
```

The vendoring step itself: a one-time copy of qEUBO's `src/` tree
(plus its LICENSE and any required notice files) into
`backend/qeubo_vendor/src/`. SHA-256 of the upstream source tree
recorded in the README; updates are atomic commits with `deps:`
prefix per the `goboard_transposition/third_party/` precedent.

### 2.2 Persistence model

The qEUBO server's Redis is the right substrate for experiment
data — PyTorch tensors of queries / responses / model state.
Migrating to LengYue's document store would mean either binary-
blob columns in SQLAlchemy (real schema impact) or tensor-to-JSON
serialisation (wasteful and fragile). **Keep Redis.**

The document-store concern (per-user data, security) is solved at
the boundary, not by merging stores: the LengYue backend
**prepends `user_id:` to every `experiment_id`** before forwarding
to the service layer. The qEUBO server (within-process here, but
conceptually still a domain-blind component) sees only opaque
keys; users cannot collide, and one user cannot read another's
experiment by guessing an ID.

The backend's own document store (per-user JSON via
`api/routes/documents.py`) holds the user-side metadata:

- The user's `qeubo_pinned_bookmarks` list — saved parameter
  snapshots independent of any experiment lifecycle.
- The crosswalk: which parameter names are
  `qeubo_controlled` (also stored frontend-side; the document
  store is the persistence substrate).
- The user's parameter declarations including ranges (also
  stored in `analysis_env.parameter_meta`).

The qEUBO Redis only holds optimiser internal state. Two stores,
one shared identifier, no SSOT violation because the data is
genuinely distinct.

Configuration:

- `QEUBO_REDIS_URL` (env var, default `redis://localhost:6379`).
- `QEUBO_ENABLED` (env var, default `true`). When `false`, the
  routes return 503 and the frontend hides the toolbar cluster.
  Honest fail-loud per ADR-0002.

### 2.3 Encode/decode of points ↔ actual parameter values

qEUBO operates in `[0, 1]^input_dim`, normalised. Real parameter
values may have arbitrary ranges (`alpha ∈ [0, 1]`, others might
be `[0, 100]`, `[-1, 1]`, etc.). The encode/decode boundary lives
in `backend/qeubo/encoding.py`.

#### The contract

The user's `analysis_env.parameter_meta` (frontend-stored, sent
in the request) declares per-parameter `range: [min, max]` for
qEUBO-controlled parameters. The backend reads this when:

- **Creating an experiment**: derive `input_dim` from the count
  of qeubo_controlled parameters; record their declaration order
  for stable index-to-name mapping.
- **Returning a pair**: receive `point_a` / `point_b` from qEUBO
  in `[0,1]^d`; decode each component using the corresponding
  parameter's range; return both raw points (for debug) and
  decoded value-vectors (the actual numbers the user will see).
- **Submitting a preference**: the user picks A or B by index;
  no encoding needed. Records the verdict to qEUBO.
- **Returning best-so-far**: same decode pattern as pair.

#### Decoding

```python
def decode(point, param_names_in_order, parameter_meta):
    """Map [0, 1]^d → {name: actual_value}"""
    result = {}
    for i, name in enumerate(param_names_in_order):
        meta = parameter_meta.get(name, {})
        rng = meta.get("range", [0.0, 1.0])  # default unit interval
        lo, hi = rng
        result[name] = lo + (hi - lo) * point[i]
    return result
```

Encoding (the inverse, used when the frontend re-applies a
bookmark or initialises an experiment from current values):

```python
def encode(values, param_names_in_order, parameter_meta):
    """Map {name: actual_value} → [0, 1]^d"""
    point = []
    for name in param_names_in_order:
        meta = parameter_meta.get(name, {})
        rng = meta.get("range", [0.0, 1.0])
        lo, hi = rng
        # Clamp; user-edited values may briefly fall outside the range.
        clamped = max(lo, min(hi, values[name]))
        point.append((clamped - lo) / (hi - lo) if hi > lo else 0.0)
    return point
```

#### Order stability

The mapping `index → parameter_name` must be stable across
requests within a single experiment, otherwise the GP's posterior
would silently realign. **Convention**: when the experiment is
created, the backend records the ordered list of parameter names
in the experiment's config (alongside qEUBO's existing config
fields). Subsequent requests use that recorded order regardless
of how `parameter_meta` is iterated frontend-side.

### 2.4 REST endpoint specification

All routes are JWT-authenticated via `get_current_user_id`. The
backend prepends `user_id:` to the experiment_id internally; the
frontend never sees the namespaced form.

#### `POST /qeubo/experiment` — create or replace

Request:

```json
{
  "controlled_parameters": ["alpha", "wide_root_noise"],
  "parameter_ranges": {
    "alpha": [0.0, 1.0],
    "wide_root_noise": [0.0, 0.5]
  },
  "config_overrides": {
    "num_init_queries": null,
    "num_algo_queries": 1000000
  }
}
```

`controlled_parameters` is the ordered list (this is the
declaration order; the backend records it for stability per
§2.3). `parameter_ranges` is required for every parameter in the
list. `config_overrides` is optional; if absent, defaults from
`backend/qeubo/service.py::_DEFAULT_CONFIG` apply, with one
adjustment from the demo's defaults: `num_algo_queries` defaults
to `1000000` (effectively unbounded — see §3.2 for the rationale).

If an experiment already exists for this user, **delete it first
and create the new one**. This realises the "starting a new
experiment" semantic: the user's parameter values in
`analysis_env.parameters` are *not* affected; only qEUBO's Redis
state for this user is reset. The frontend MUST NOT treat the
delete-then-create as a transient absence — the route returns
the new experiment in a single response.

Response:

```json
{
  "experiment_id": "user42:default",
  "config": { ...full config... },
  "controlled_parameters": ["alpha", "wide_root_noise"],
  "phase": "init",
  "init_index": 0,
  "num_init_queries": 8,
  "iteration": 0,
  "num_algo_queries": 1000000
}
```

#### `DELETE /qeubo/experiment` — abort and dissolve

Removes the user's experiment from Redis. Returns 200 + empty
body, or 404 if no experiment exists. Does not affect the user's
`analysis_env.parameters` or bookmarks.

#### `GET /qeubo/experiment/status` — phase + counts

Response:

```json
{
  "experiment_id": "user42:default",
  "phase": "init" | "optimization",
  "init_index": 5,
  "num_init_queries": 8,
  "iteration": 0,
  "num_algo_queries": 1000000,
  "total_responses": 5,
  "has_pending": true,
  "pending_query_uuid": "..."
}
```

Returns 404 if no experiment exists. (Note: `phase: "completed"`
is *not* expected in normal operation given the unbounded
`num_algo_queries`; if it appears, treat as a backend bug.)

#### `GET /qeubo/experiment/pair` — fetch (or re-issue) the next pair

Response:

```json
{
  "query_uuid": "...",
  "point_a": [0.25, 0.5],
  "point_b": [0.75, 0.5],
  "values_a": {"alpha": 0.25, "wide_root_noise": 0.25},
  "values_b": {"alpha": 0.75, "wide_root_noise": 0.25},
  "phase": "optimization",
  "iteration": 4,
  "reissued": false
}
```

`point_*` are raw normalised vectors (for debug). `values_*` are
decoded actual parameter values (the frontend uses these). The
re-issue semantic is unchanged from the demo: if a pair is
pending, the same one comes back with `reissued: true`.

#### `POST /qeubo/experiment/preference` — submit verdict

Request:

```json
{
  "query_uuid": "...",
  "preferred": 0
}
```

`preferred` is `0` for A or `1` for B. The route:

1. Validates `query_uuid` matches the pending pair.
2. Records the preference observation to qEUBO (updates the
   queries/responses tensors in Redis).
3. Returns the updated counts.

Response:

```json
{
  "phase": "optimization",
  "iteration": 5,
  "init_index": 8,
  "total_responses": 5,
  "completed": false
}
```

The "**bundled apply**" semantic is **frontend-side**, not
backend-side: the frontend, on receiving this response, writes
`values_a` (or `values_b` based on the user's choice) into
`store.profile.settings.engine.katago.analysis_env.parameters`
and lets the existing watcher chain propagate. The backend does
not write to the user's profile through this route — it stays
single-purpose (preference recording).

#### `GET /qeubo/experiment/best` — qEUBO's posterior best estimate

Response:

```json
{
  "point": [0.5, 0.3],
  "values": {"alpha": 0.5, "wide_root_noise": 0.15},
  "phase": "optimization",
  "iteration": 12
}
```

Returns 409 if `phase == "init"` (model not yet fitted).

This is *qEUBO's* best estimate — distinct from user-pinned
bookmarks. Both are exposed to the frontend; the user picks which
to apply.

#### `GET /qeubo/experiment/history` — debug

The full ordered list of `(point_a, point_b, preferred)` triples.
Useful for diagnostics; not part of the normal user flow.

### 2.5 Schema (server-side experiment config)

Beyond the demo's existing config fields, the backend's
experiment config records:

- `controlled_parameters: list[str]` — the ordered list of
  parameter names. **Mandatory** for index-stability per §2.3.
- `parameter_ranges: dict[str, [float, float]]` — copied from
  the request at creation time. The frontend's `parameter_meta`
  may evolve; the experiment uses the snapshot taken at create.

These are stored alongside qEUBO's own config in the same Redis
JSON dict. No additional Redis keys.

## Part 3 — Frontend responsibilities

### 3.1 Schema additions

In `src/types.ts`, the `AnalysisEnvironment` interface gains:

```ts
export interface AnalysisEnvironment {
  symbols: Record<string, string>;
  parameters: Record<string, number>;          // unchanged
  parameter_meta?: Record<string, ParameterMeta>;  // NEW
  palettes: AnalysisPalette[];
  activePaletteId: string;
}

export interface ParameterMeta {
  range?: [number, number];
  qeubo_controlled?: boolean;
}
```

The wire format `parameters: Record<string, number>` is **unchanged**
— the proxy's `RegistryInterpreter` continues to receive it
verbatim. `parameter_meta` is a frontend/backend concern only;
the proxy never sees it.

In `src/types.ts`, `ProfileState` gains:

```ts
export interface ProfileState {
  // ... existing fields ...
  qeuboPinnedBookmarks?: QeuboBookmark[];   // NEW
}

export interface QeuboBookmark {
  id: string;          // UUID generated frontend-side
  name: string;        // user-supplied label
  createdAt: number;   // unix ms
  parameters: Record<string, number>;  // snapshot of values
}
```

In `src/types.ts`, `UISession` gains:

```ts
export interface UISession {
  // ... existing fields ...
  qeuboToolbarView?: 'applied' | 'A' | 'B';  // NEW. Toggle state.
}
```

### 3.2 Schema migration 5 → 6

`src/store/migrations.ts` gains a `5 → 6` migration that:

- Adds an empty `parameter_meta: {}` to `analysis_env` if missing.
- Adds an empty `qeuboPinnedBookmarks: []` to `profile` if missing.
- Adds `qeuboToolbarView: 'applied'` to `session.ui` if missing.

Idempotent, preserves all existing data, no value transformations.

### 3.3 New API client module

`src/services/qeubo-service.ts` (new) — the typed REST client. One
method per endpoint in §2.4. Imports are added to
`src/services/api-client.ts`'s consumer list naturally; the JWT
threading and 401-retry are inherited from the existing api-client
infrastructure.

### 3.4 New composable

`src/composables/useQeubo.ts` (new) — the calibration state
machine, similar in shape to `useReviewSession`. Public API
(approximate):

```ts
export function useQeubo(): {
  experimentExists: ComputedRef<boolean>;
  phase: ComputedRef<'init' | 'optimization' | 'idle'>;
  initProgress: ComputedRef<{ done: number; total: number } | null>;
  optimizationProgress: ComputedRef<{ iteration: number; total: number } | null>;
  currentPair: ComputedRef<QeuboPair | null>;
  currentBestEstimate: ComputedRef<QeuboPoint | null>;
  toolbarView: Ref<'applied' | 'A' | 'B'>;
  effectiveParameterValues: ComputedRef<Record<string, number>>;
  startNewExperiment: (params: string[]) => Promise<void>;
  abortExperiment: () => Promise<void>;
  submitPreference: (preferred: 0 | 1) => Promise<void>;
  pinCurrent: (name: string) => void;
  applyBookmark: (id: BookmarkId) => void;
  refreshBest: () => Promise<void>;
};
```

`effectiveParameterValues` is the load-bearing computed: if
`toolbarView === 'A'`, returns the qEUBO point A's decoded values
*overlaid* on the applied parameter values; same for B; if
`'applied'`, returns just the applied values. The engine
(analysis-service) reads from this computed, not directly from
`store.profile.settings.engine.katago.analysis_env.parameters`,
when a calibration session is active.

### 3.5 Toolbar cluster

`src/components/Toolbar.vue` gains a conditional cluster that
renders when `experimentExists` is true. Approximate layout
(when active):

```
[ Quality ▼ ][ ⏵ A | ● B | Applied ][ I prefer A ][ I prefer B ][ ⏎ Pin ][ ↺ ?  init 5/8  iter 12 ]
```

- Three-state radio (or segmented control) for the toggle: A / B
  / Applied. Toggling writes to `session.ui.qeuboToolbarView`.
- "I prefer A" / "I prefer B" verdict buttons. On click:
  1. Call `submitPreference(0|1)`.
  2. Bundled-apply: write the chosen point's decoded values to
     `analysis_env.parameters` (so subsequent analyses use the
     preferred values).
  3. Reset toolbar view to `'applied'`.
- Pin button — opens a small dialog to name the bookmark; saves
  the *currently effective* parameter values (whatever the
  toggle is showing) to `profile.qeuboPinnedBookmarks`.
- Phase indicator with the init/optimization counts. The `?`
  tooltip explains GP cubic-in-N cost so the user learns when
  to stop on their own.

### 3.6 Bookmark management UI

A dedicated panel — likely in the Other tab alongside the
gradient-calibration view, or as a popover from the toolbar's
Pin button — exposes:

- The list of saved bookmarks: name, creation date, parameter
  summary.
- Per-bookmark actions: "Apply" (writes values to
  `analysis_env.parameters`), "Rename", "Delete".
- A "New bookmark from current applied" affordance (in case
  the user wants to checkpoint outside the toolbar's Pin flow).

This panel is independent of qEUBO experiment state — bookmarks
survive experiment changes, deletions, etc.

### 3.7 Parameter-meta editor

The existing `RegistryEditor.vue` (or `PaletteEditor.vue`,
whichever currently surfaces `parameters`) is extended to also
edit `parameter_meta`:

- For each parameter, two new optional fields: a `[min, max]`
  range (number-pair input) and a `qeubo_controlled` checkbox.
- Validation: if `qeubo_controlled` is checked, `range` becomes
  required; the editor surfaces the error per ADR-0002.
- Saving triggers the existing sync to the backend's document
  store; no new persistence path needed.

When the user toggles `qeubo_controlled` on a parameter, the
frontend MUST call `POST /qeubo/experiment` to sync the new
controlled-set with the backend. Per the user's "starting a new
experiment" semantic: the backend deletes the old experiment and
creates a fresh one over the new scope; the user's parameter
values in `analysis_env.parameters` are unaffected; only qEUBO
internal state resets.

## Part 4 — Wire contract

The shared wire shapes between frontend and backend are entirely
documented in §2.4. A few cross-cutting notes:

- **JWT authentication.** All `/qeubo/*` routes consume
  `get_current_user_id` per the existing tenancy spine. No special
  auth concerns beyond what every other authenticated route
  already has.
- **Error envelope.** Standard FastAPI error shape; no qEUBO-
  specific error structure. The frontend's existing api-client
  error-surfacing (system log + system message) handles them.
- **Latency.** `request_pair` during the optimisation phase runs
  qEUBO acquisition, which can take seconds. The frontend should
  show a busy state while awaiting; the existing
  `pushSystemMessage('info', ...)` infrastructure plus a spinner
  in the toolbar cluster is sufficient. No streaming / WebSocket
  needed — REST + UI busy-state covers it.
- **Idempotency.** The pending-pair re-issue semantic from the
  demo is preserved: calling `GET /qeubo/experiment/pair` while
  a pair is pending returns the same pair. The frontend can
  safely retry on flaky connections.

## Part 5 — Verification checklist

1. **Backend smoke test.** With qEUBO vendored and Redis running:
   - `POST /qeubo/experiment` with two parameters succeeds, returns
     a config with `phase: "init"`, `num_init_queries: 8`.
   - 8 successive `GET pair` + `POST preference` cycles transition
     `phase` from `init` to `optimization`.
   - `GET /qeubo/experiment/best` returns a valid posterior point
     after the transition.
   - `DELETE /qeubo/experiment` removes the Redis state.

2. **Per-user isolation.** Two test users. User A creates an
   experiment. User B's `GET /qeubo/experiment/status` returns 404
   (B has no experiment). User B creates their own experiment;
   neither user sees the other's pair, history, or best point.
   Confirm the `user_id:` prefix is being applied in the backend.

3. **Encode/decode round-trip.** Create an experiment with
   `alpha: [0.0, 1.0]` and `score_factor: [-2.0, 2.0]`. Verify
   that a returned `point_a = [0.5, 0.5]` decodes to
   `values_a = {"alpha": 0.5, "score_factor": 0.0}`. Verify the
   inverse: encoding `values = {"alpha": 0.25, "score_factor": -1.0}`
   yields `point = [0.25, 0.25]`.

4. **Frontend toolbar smoke.** With a calibration set up:
   toggle between Applied / A / B updates the displayed engine
   parameters live; clicking "I prefer A" submits the verdict,
   applies A's values, and resets the toolbar view.

5. **Bookmarks.** Pin a parameter set; switch palette; apply
   the bookmark; confirm the values restore.

6. **Experiment replacement.** With one experiment active over
   `[alpha]`, change the `qeubo_controlled` set to `[wide_root_noise]`.
   Confirm: the previous experiment's qEUBO state is gone (the
   new pair has different `controlled_parameters`); `alpha`'s
   value in `analysis_env.parameters` is unchanged.

## Part 6 — Out of scope (explicitly)

### Excluded by design

- **Per-palette experiments.** User-acknowledged "ugly but
  workable" path is to author parameters with palette-specific
  names. Multi-experiment-per-user is a future architectural
  question; the spec stays at one-experiment-per-user.
- **WebSocket transport.** REST is the chosen transport; the
  demo's WebSocket dispatcher does not migrate over.
- **Hard completion cap.** Any-time semantic; the user idles
  when satisfied. `num_algo_queries: 1000000` is an effective-
  unbounded sentinel.

### Deferred

- **Multi-experiment views** (user has several named experiments,
  switches between them). When the per-palette case becomes
  concrete, this is the natural shape.
- **Posterior visualisation** (a chart of GP confidence over
  parameter space). Useful but not first-cut; backend already
  exposes `get_history` for diagnostic purposes.
- **Implicit preference signals** (inferred from review behaviour
  rather than explicit verdict). Out of scope; the explicit
  verdict is honest and qEUBO is calibrated against explicit
  inputs.
- **Sharing bookmarks across users.** Bookmarks are per-user; a
  community-bookmark library is a future feature.

## Documentation follow-up

When this dispatch is implemented:

- **Backend worklog** entries for the vendoring step and the
  endpoint implementation (separable, recommended in two PRs).
- **Frontend worklog** entries for the schema migration and the
  toolbar/composable/bookmarks UI (recommended as one PR per
  major piece — schema+composable, then toolbar, then bookmarks).
- **Backend NOTICE update** committed alongside the vendoring
  step.
- **TODO row** under both Backend Completed and Frontend
  Completed when each side ships.
- **No ADR amendment** required. The pattern follows the
  established `proxy/goboard_transposition/` precedent.

## Summary for both reviewers

The dispatch proposes:

- **Backend**: vendor qEUBO at `backend/qeubo_vendor/` (MIT,
  parallel to `proxy/goboard_transposition/`); add wrapper code
  at `backend/qeubo/`; expose six REST endpoints; persist
  experiment data in Redis (KeyDB), namespaced by `user_id`;
  enforce range-driven encode/decode of qEUBO points ↔ actual
  parameter values; add `backend/NOTICE` declaring the boundary.
- **Frontend**: schema additions (`parameter_meta`,
  `qeuboPinnedBookmarks`, `qeuboToolbarView`); migration 5→6;
  new `qeubo-service.ts` API client; new `useQeubo` composable
  with bundled-apply preference verdict; toolbar A/B cluster;
  bookmark management UI; parameter-meta editor extension.
- **Coordination**: shared wire shapes documented in §2.4; the
  schema migration is frontend-only (the backend keeps Redis
  shape).

The user's review focuses on:

1. The vendoring boundary and NOTICE shape (parallel to proxy's
   pattern).
2. Whether the bundled-apply preference verdict (verdict + apply
   in one click) is the right UX, or whether they should be
   separate actions (default in this spec is bundled).
3. Whether the parameter-meta editor extension belongs in
   `RegistryEditor.vue` or `PaletteEditor.vue` (where parameters
   currently live).

— end dispatch —
