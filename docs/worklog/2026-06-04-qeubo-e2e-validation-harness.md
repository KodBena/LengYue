# Worklog — qEUBO end-to-end validation harness (2026-06-04)

## Trigger

Work-status item `qeubo-e2e-validation` (both / medium / `test`) — the last
gate before qEUBO transitions from feature-complete to validated. The feature
works from the user's seat (qEUBO's own Redis at 6379 holds live
`pbo:exp:1:default:*` state from real use), but the proof was manual: a
`curl`-verified wire layer (2026-04-28, recorded in
`docs/archive/notes/qEUBO.md`) plus a user-driven `backend/qeubo/sanity_test.py`
convergence sweep that runs for tens of minutes and is explicitly *not* for
automated invocation. This arc mechanizes the validation at three layers.

Redis target for tests is **`127.0.0.1:6380`** (the research memcache:
`save ""`, `allkeys-lru`). qEUBO keys live under `pbo:*`, disjoint from
`lengyue:research:*`; tests namespace experiment ids per-run and delete them in
teardown so the shared instance isn't littered.

## Licensing firewall

`backend/qeubo/` is MIT (vendor + runtime); the test code is Public Domain. To
keep the PD code from being authored against MIT runtime source (a derivative-
work risk), the **backend test code was authored clean-room** — against the
published contract in `backend/qeubo/README.md` (which PD callers are permitted
to read), the PD route file `backend/api/routes/qeubo.py`, and `backend/main.py`'s
lifespan wiring only. No `backend/qeubo/runtime/*.py`, `sanity_test.py`, or
`vendor/` was read while authoring. The frontend smoke and these docs touch no
MIT source.

## What landed

### Layer A — backend route-contract tests

`backend/tests/integration/routes/test_qeubo_routes.py` (13 tests). Drives the
FastAPI surface over httpx + ASGITransport with per-test JWT, against a live
`ExperimentService` backed by Redis 6380 (mirrors `main.py`). It builds its own
test app rather than editing the shared routes `conftest.py` (ADR-0004 minimal-
touch — the shared builder deliberately omits qEUBO to avoid importing torch).
Failure-mode-first: 503 (disabled app, no `qeubo_service`), 401 (no auth), 404
on status/pair/preference/best/delete with no experiment, 409 on mismatched
`query_uuid`, two-user isolation (B gets 404 for A's experiment); then the happy
paths — create returns the namespace-stripped `experiment_id`, init-pair wire
shape, the init→optimization flip at `total_responses == num_init_queries == 8`
(4 × input_dim, dim 2), and (slow) best 409-during-init → 200-after-fit.

### Layer B — backend service contract + convergence

`backend/tests/integration/qeubo/test_qeubo_service_contract.py` (2 tests).
Drives `ExperimentService` directly against 6380. A fast contract test (create →
init loop → phase flip → optimization iteration advance → idempotent reissue
with same `query_uuid` → in-range best point → delete → post-delete `ValueError`)
in the normal `integration` tier; a `@pytest.mark.slow` single-trial convergence
test (random target, L2-preference truth during optimization, uniform-random
during init, asserts `L2(best, target) < 0.15` after 25 iterations). The full
multi-trial sweep stays in user-driven `sanity_test.py` — tight convergence
can't be a fast, non-flaky gate, so the mechanized layer asserts the contract
and a single generous convergence trial.

`backend/pytest.ini` — added `slow` and `qeubo` markers (required under
`--strict-markers`).

### Layer C — cross-layer UI smoke

`frontend/tests/e2e/qeubo-smoke.test.ts`, modeled on
`review-session-harness.test.ts` (`// @vitest-environment node`,
`describe.skipIf(!QEUBO_E2E)`). Drives the real `useQeubo` singleton end to end
against a live `QEUBO_ENABLED=True` backend: `seedTestUser` → `bootstrap`
(calibration on, no experiment) → seed `parameter_meta` ranges + current
`parameters` values for `alpha`/`beta` → `startNewExperiment` (init, first pair)
→ `submitPreference` ×8 to the optimization flip → `refreshBest` → `applyEffective`
(view A audition lands in `analysis_env.parameters`) → `abortExperiment`. Default
`npm run test:run` skips it, like the existing e2e harness; no new `src/` files,
so no `frontend/FILES.md` change.

The smoke surfaced one realistic precondition during bring-up: `applyEffective`
routes through the knob substrate's `writeKnob`, which fails loudly (ADR-0002)
rather than creating a missing `analysis_env.parameters.<name>` leaf. A
controlled parameter therefore needs both a `parameter_meta` range *and* a
current value in `parameters`; the fixture seeds both, mirroring real usage.

## Validation (this machine: `backend/venv` torch 2.11 / botorch 0.17.2, Redis 6380)

- Backend fast subset (`-m "not slow"`): **13 passed, 2 deselected** (~8.5s).
- Backend slow subset (`-m slow`): **2 passed, 13 deselected** (~122s — the GP
  fit + convergence trial).
- Frontend smoke (`QEUBO_E2E=1 VITE_API_BASE_URL=http://127.0.0.1:8764`, backend
  launched with `QEUBO_ENABLED=True QEUBO_REDIS_URL=redis://127.0.0.1:6380`):
  **1 passed**, full lifecycle walked.

## Run recipe

```bash
# Backend (from backend/, venv with requirements-qeubo.txt installed):
venv/bin/python -m pytest tests/integration/routes/test_qeubo_routes.py \
  tests/integration/qeubo/ -m "not slow"     # fast
venv/bin/python -m pytest tests/integration/qeubo/ \
  tests/integration/routes/test_qeubo_routes.py -m slow   # GP-fit + convergence

# UI smoke (backend up on :8764 with QEUBO_ENABLED + Redis 6380):
QEUBO_ENABLED=True QEUBO_REDIS_URL=redis://127.0.0.1:6380 \
  fastapi dev backend/main.py --host 127.0.0.1 --port 8764
QEUBO_E2E=1 VITE_API_BASE_URL=http://127.0.0.1:8764 \
  npm run test:run -- tests/e2e/qeubo-smoke.test.ts    # from frontend/
```

## Status / follow-ups

The validation gate is mechanized and green locally. Not yet committed/merged,
and the test files currently sit on an unrelated feature branch
(`bork/feat/work-status-todo-pg-acl`) — they want their own branch + PR. The
work-status item is set to `in-progress` to reflect "mechanized and green,
pending merge"; on merge it closes (`shipped`) and `docs/archive/notes/qEUBO.md`
flips `living-doc → design-note: implemented` per its maintenance contract.
