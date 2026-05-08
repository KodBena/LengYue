# qEUBO Integration — Backend → Frontend Status Dispatch

- **Date:** 2026-04-28
- **From:** backend (route-implementer + runtime-modernizer session,
  2026-04-28)
- **To:** frontend (next session for schema migration / `useQeubo`
  composable / toolbar / bookmarks UI / parameter-meta editor)
- **Type:** status — closes the backend half of
  `frontend-to-backend-qeubo-integration.md` v1.1
- **Status:** open at the frontend's end; backend half is shipped

## TL;DR

Backend half of `frontend-to-backend-qeubo-integration.md` (v1.1) is
shipped and verified. The wire contract is exactly as documented in
the dispatch §2.4. The runtime is now compatible with modern botorch
(≥0.17) / torch (≥2.x) / gpytorch (≥1.15) via internal compatibility
shims that activate transparently at qEUBO package import time. PD
callers — including the frontend — are unaffected by the shims.

When you start the next frontend qEUBO session, you have a working
backend to talk to.

## What ships

Six REST endpoints under `/qeubo/experiment`:

| Method | Path                          | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| POST   | `/qeubo/experiment`           | create-or-replace experiment         |
| DELETE | `/qeubo/experiment`           | abort and dissolve                   |
| GET    | `/qeubo/experiment/status`    | phase + counts                       |
| GET    | `/qeubo/experiment/pair`      | next A/B pair (raw + decoded values) |
| POST   | `/qeubo/experiment/preference`| submit verdict (preference-only)     |
| GET    | `/qeubo/experiment/best`      | qEUBO posterior best estimate        |
| GET    | `/qeubo/experiment/history`   | diagnostic                           |

Wire shapes match dispatch §2.4 verbatim. Pydantic models live at the
top of `backend/api/routes/qeubo.py` and surface to your codegen
pipeline (`npm run gen:api`) via the OpenAPI schema.

Plus encode/decode helpers in `backend/api/routes/qeubo_encoding.py`,
opt-in deps in `backend/requirements-qeubo.txt`, lifespan wiring in
`main.py`, and runtime compat shims at
`backend/qeubo/runtime/_compat.py`.

## What you should know going in

### `QEUBO_ENABLED` defaults to `False`

Default-off because the deps (`torch` / `botorch` / `gpytorch`) are
heavy and researcher-only. Frontend should hide the toolbar A/B
cluster when receiving 503 from any `/qeubo/*` endpoint (the
dispatch's documented disabled-state contract). Probe via
`GET /qeubo/experiment/status` at session start and surface
503 → "calibration not enabled on this server" UX path.

This is the one wire-contract deviation from dispatch v1.1 (which
specified `default: true`). The dispatch left configuration defaults
as an implementation choice; the rationale is in the worklog
(`docs/worklog/2026-04-28-qeubo-routes-and-runtime-modernization.md`).

### Per-user namespacing

Backend prepends `user_id:` to every experiment_id internally. The
frontend never sees the namespaced form — response shapes return the
bare suffix (currently always `"default"` since one-experiment-per-
user is the dispatch's scope).

### Bundled-apply verdict

Per dispatch §2.4, this is FRONTEND-SIDE. The
`/qeubo/experiment/preference` endpoint records the preference
observation only. After receiving the response, the frontend writes
the chosen point's decoded values into
`store.profile.settings.engine.katago.analysis_env.parameters`.

The bundled-vs-separable UX call (dispatch v1.1 listed it as still
open) is yours to make.

### Missing-experiment semantics

The runtime's README documents `delete_experiment` raising
`ValueError` on missing experiments but is silent on the
missing-experiment behavior of `get_status`, `request_pair`,
`submit_response`, `get_best_point`, `get_history`. The route layer
probes via `get_status` before each missing-sensitive call and maps
to 404 at the wire boundary. From the frontend's perspective: any
`/qeubo/experiment/*` returning 404 means "no experiment exists for
this user — call `POST /qeubo/experiment` to start one."

The pre-empted `phase=='init'` 409 in `/best` is unambiguous: it
specifically means "model not yet fitted; collect more init responses
before asking for a posterior best."

### Init-phase behavior

`num_init_queries` defaults to `4 * input_dim`. During init, qEUBO
returns random pairs and uses responses to seed the GP — the frontend
should still surface them like any other A/B comparison, no special
init-phase UI is required. The `phase` field in pair responses
indicates `init` vs `optimization` so you can show progress
indicators ("init 5/8" → "optimization iter 12").

### Compatibility envelope

The runtime carries two import-time compat shims for botorch ≥0.9
and modern torch (full rationale in `backend/qeubo/README.md`'s
"Compatibility envelope" section). Frontend doesn't need to know —
it just calls REST endpoints. Mentioned here only so the deps install
on researcher boxes works:

```bash
cd backend && source venv/bin/activate
export TMPDIR=/home/bork/w/tmp_dir  # if disk-constrained
pip install -r requirements-qeubo.txt
```

Plus a running Redis on `127.0.0.1:6379` (see
`backend/docs/redis-local-resource.md`).

## Verification done

| Test | Result |
|---|---|
| Disabled-state boot | qeubo + torch not loaded; routes return 503 |
| Enabled-state boot | shims activate; `MCSampler(sample_shape=int)` works; default torch dtype = float64 |
| Encode/decode (dispatch §5 case 3) | round-trips correctly |
| 1D sanity (`argmin|x|`) | converged to `\|x_best\|≈0.0` in 12 opt iters |
| 2D sanity (10 random L2 targets, user-driven sweep) | zero shape errors; 5/10 hit threshold 0.1; misses budget-limited |

End-to-end with the actual frontend wire layer is your next step.

## Open items unchanged from dispatch

- **Bundled-apply UX:** still frontend's call.
- **KeyDB substitution:** backend tested with Redis 8.6.2 (KeyDB is
  discontinued upstream). The wire substrate is interchangeable — if
  you're running KeyDB on `127.0.0.1:6379` instead, that's fine.

## Outgoing references

- This dispatch closes the backend's open response per the umbrella
  `CLAUDE.md`'s dispatch-ledger protocol.
- Expect a frontend status dispatch
  (`frontend-to-backend-qeubo-integration-status.md` or similar) when
  the frontend half ships.

— end dispatch —
