# qEUBO routes + runtime modernization

- **Status:** Shipped on branch (TBD), 2026-04-28. Disabled-state boot
  verified; enabled-state shim activation verified; end-to-end sanity
  test (1D and 2D against random L2 targets) passes.
- **Genre:** Worklog entry — backend half of the qEUBO integration
  dispatch (`docs/dispatch/frontend-to-backend-qeubo-integration.md`
  v1.1).
- **Date:** 2026-04-28.
- **Origin:** Backend route-implementer session per the track triage in
  `docs/notes/qEUBO.md`. Picks up where PR #26 (`5f0fcf9`, "Backend
  MIT wrapper") left off.

## Context

PR #26 shipped the qEUBO MIT-licensed wrapper at `backend/qeubo/` per
the dispatch's three-layer licensing model (vendor + runtime both MIT;
public-domain callers consume via the README's published API
contract). This PR ships the public-domain consumer half: six FastAPI
routes, encode/decode helpers, opt-in dependency listing, FastAPI
lifespan wiring, and config gating.

Two unanticipated compatibility issues surfaced during end-to-end
testing — both downstream of the vendored qEUBO predating modern
botorch / torch by ~3 years. They're addressed inside MIT scope so the
PD callers stay shape-clean.

## Approach

### Route layer (PD scope, authored before any source visibility)

Six endpoints under `/qeubo/experiment` — `POST` (create-or-replace),
`DELETE`, `GET status`, `GET pair`, `POST preference`, `GET best`, and
`GET history`. JWT-authenticated; per-user namespacing via `user_id:`
prefix on the runtime's `experiment_id`; the frontend never sees the
namespaced form (per dispatch §2.2; the namespaced `"user42:default"`
in §2.4's example appears illustrative).

The README documents `delete_experiment` raising `ValueError` on
missing experiments but is silent on the missing-experiment behavior
of `get_status`, `request_pair`, `submit_response`, `get_best_point`,
`get_history`. Resolution per the dispatch-discussion's option 2:
every route that needs the missing→404 distinction probes via
`_require_status` first, catches `ValueError → 404`, then proceeds.
The pre-empted `phase=='init'` 409 in `/best` lets the
dispatch-specified status code survive unambiguously against the
runtime's other documented `ValueError` cases.

Encode/decode are plain `(actual − min)/(max − min)` math; helpers
raise on missing parameter / range entries per ADR-0002. The route
validates ranges at create-time so the strict path is the only one
reachable in production.

### Optional dependency posture

`QEUBO_ENABLED: bool = False` defaults off. Dispatch v1.1 specified
`default: true`, but the heavy deps (`torch` / `botorch` / `gpytorch`
— multi-GB on first install) make researcher-opt-in the right default
for a project where most users won't be doing palette calibration.
The router is registered unconditionally so the OpenAPI surface stays
stable across configurations; the dependency `get_qeubo_service`
returns 503 when disabled. Heavy deps are listed in
`requirements-qeubo.txt` (separate from the main `requirements.txt`).

### Lifespan wiring

`main.py`'s lifespan branches on `QEUBO_ENABLED`. When True:
lazy-imports `qeubo`, pings storage as a startup readiness check
(fail loudly per ADR-0002 if Redis is unreachable), constructs a
2-worker `ThreadPoolExecutor`, attaches the `ExperimentService` to
`app.state.qeubo_service`, disposes the executor on shutdown. When
False: `app.state.qeubo_service = None`. No qeubo import — heavy deps
stay un-imported, the global torch dtype default stays unchanged.

### Compatibility shims (MIT scope)

Two third-party-API regressions surfaced during sanity testing:

1. **`SobolQMCNormalSampler(sample_shape=int)`** — accepted by old
   botorch, rejected by botorch ≥0.9 which requires `torch.Size`.
2. **`double != float` mismatch** in
   `gpytorch.variational.variational_strategy` — vendored qEUBO
   assumes torch's older float64 default; modern torch defaults to
   float32.

`backend/qeubo/runtime/_compat.py` (new MIT module) carries two
import-time shims:

- `MCSampler.__init__` patched at the base class to coerce
  `int → torch.Size`. One-way coercion; never narrows behavior.
- `torch.set_default_dtype(torch.float64)` set at import time so
  vendor-created tensors land in the expected precision.

The shims target botorch and torch (third-party deps), not the
vendored qEUBO source. They live inside MIT scope where the licensing
boundary absorbs them. PD callers do not see the shims —
`backend/main.py` carries no shim code.

`qeubo/__init__.py` imports `_compat` between the sys.path setup and
the runtime service/storage imports, so the shims fire before any
vendor module's first instantiation.

`backend/qeubo/README.md` gains a "Compatibility envelope"
subsection documenting both shims, the breaking-change history, and
the version matrix tested against. PD callers reading the README see
a clean contract; the shims are an internal implementation detail.

### Sanity test (MIT scope)

`backend/qeubo/sanity_test.py` is a CLI-driven sweep over random
L2-target trials, configurable on dimension / trials / budget / seed.
Used during this session to validate the runtime modernization
end-to-end. Designed for user-driven invocation, not LLM-driven (see
"Lessons learned" below).

## Source-visibility audit

The dispatch's licensing discipline targets *author-time source
visibility*: PD code authors must not have read MIT-runtime source at
the moment of authoring. Allowed inputs: `README.md`, `NOTICE`,
`LICENSE`, `qeubo/__init__.py` (re-exports). Disallowed:
`backend/qeubo/{vendor,runtime}/*.py`.

Timeline this session:

| Stage | What was authored | qEUBO source visibility at authoring time |
|---|---|---|
| 1. Initial PD work | `routes/qeubo.py`, `routes/qeubo_encoding.py`, `requirements-qeubo.txt`, `core/config.py` edits, `main.py` edits | None — README + NOTICE + `__init__.py` (re-exports only) |
| 2. First sanity-test run | (no authoring) | Traceback exposed `vendor/src/models/likelihoods/preferential_softmax_likelihood.py:29` containing `SobolQMCNormalSampler(sample_shape=512)` |
| 3. Test-script shim 1 | `/tmp/qeubo_sanity.py` MCSampler patch | Authored after exposure |
| 4. Second test run | (no authoring) | Traceback into gpytorch internals only (third-party MIT, separate project) — no qEUBO source |
| 5. Test-script shim 2 | `/tmp/qeubo_sanity.py` `set_default_dtype` | Provenance is gpytorch, not qEUBO |
| 6. Re-vendor work begins | (re-authorized for MIT scope by user) | License-cleared to read runtime source freely |
| 7. MIT-scope work | `runtime/_compat.py`, `qeubo/__init__.py` edit, `README.md` envelope, `sanity_test.py` | MIT scope absorbs the source-visibility provenance |

The four committed PD files in stage 1 were authored under clean
discipline. The two test-script shims (stages 3 and 5) lived in
`/tmp/` only and never crossed into committed PD code. The MIT-scope
work in stage 7 is appropriately licensed.

## Verification

1. **Disabled-state boot.** `python -c "import main"` succeeds; all
   six `/qeubo/*` routes registered; neither `qeubo` nor `torch` is in
   `sys.modules` after import. Confirms the global `set_default_dtype`
   side effect doesn't fire for non-researcher installs.

2. **Enabled-state import.** `from qeubo import ExperimentService`
   transitions `torch.get_default_dtype()` from `float32` to
   `float64`. `SobolQMCNormalSampler(sample_shape=512)` succeeds
   (returns `torch.Size([512])`).

3. **Encode/decode (dispatch §5 case 3).**
   `decode([0.5, 0.5], ['alpha','score'], {alpha:[0,1], score:[-2,2]})
   == {'alpha':0.5, 'score':0.0}`; round-trip back to `[0.5, 0.5]`;
   `encode({alpha:0.25, score:-1.0}, ...) == [0.25, 0.25]`. Matches
   the verification case verbatim.

4. **End-to-end sanity (1D, single trial).** Truth = `argmin |x|` on
   `[-1, 1]`, init random, optimization truth-based. `|x_best|` walked
   from 0.6831 (post-init) → 0.0001 by iter 12. Held flat thereafter.

5. **End-to-end sanity (2D, 10 random targets, user-driven sweep).**
   Truth = `argmin ‖x − target‖₂` for random targets in `[0, 1]^2`,
   budget 25 optimization iterations per trial. **Zero shape errors
   across all trials.** 5/10 hit threshold 0.1; misses cluster near
   boundaries (budget-limited, not algorithm-limited; max d=0.2158,
   mean d=0.1075). The shape-correctness for vector inputs is the
   load-bearing observation for the re-vendor scope decision.

## Lessons learned

A licensing edge surfaced mid-session via tracebacks that exposed one
line of MIT-derivative source. The discipline absorbed it cleanly
because the conservative reading was applied: traceback-tainted code
went into MIT scope (`runtime/_compat.py`), not into the load-bearing
PD `main.py`. The PD route work shipped before any visibility, so
those files stay clean.

The decision not to have the LLM session run the bulk of optimization
trials saved the situation: the user ran the sweep in the background
while the LLM was free to do other work. **Robustness Principle (RFC
793 / RFC 1122):** *"be conservative in what you do, be liberal in
what you accept from others"*; or in RFC 1122's sharper framing,
*"it is best to assume that the network is filled with malevolent
entities that will send in packets designed to have the worst
possible effect."* Applied to LLM-tool integration: don't expect any
LLM session to wait responsibly through a 30-minute compute job;
design tooling so the LLM hands off to the user for execution and
resumes when the user reports back. The qEUBO sanity test followed
this pattern and should continue to. Future research-tool sessions
where a long-running compute step is in scope should default to the
same hand-off pattern unless the runtime is genuinely interactive.

## Critical files

- **Created (PD):** `backend/api/routes/qeubo.py`,
  `backend/api/routes/qeubo_encoding.py`,
  `backend/requirements-qeubo.txt`.
- **Edited (PD):** `backend/core/config.py` (`QEUBO_ENABLED`,
  `QEUBO_REDIS_URL`), `backend/main.py` (lifespan branch + router
  include + executor disposal).
- **Created (MIT):** `backend/qeubo/runtime/_compat.py`,
  `backend/qeubo/sanity_test.py`.
- **Edited (MIT):** `backend/qeubo/__init__.py` (compat import wired
  ahead of runtime imports), `backend/qeubo/README.md`
  (Compatibility envelope subsection).

## Out of scope (explicitly)

- **Fork-vendor of qEUBO upstream.** `vendor/src/` stays bit-for-bit
  identical to upstream; the compat shims absorb the API drift. If
  upstream qEUBO ever becomes maintained again, the cleanup path is
  fork-vendor with the patches inlined and `runtime/_compat.py`
  deleted.
- **Bundled-apply UX decision.** Frontend's call (dispatch v1.1 §2.4
  default is bundled; separable verdict-and-apply is the
  alternative). Backend stays preference-recording-only on the
  `/preference` endpoint.
- **End-to-end verification with KeyDB.** KeyDB is discontinued; this
  session used Redis 8.6.2 throughout. Backend doesn't care which
  substrate serves the wire — `redis.asyncio` works against either.
- **Pinning approach as production fallback.** Considered and rejected
  because Python 3.13 (the only available Python on the dev machine)
  predates the qEUBO ecosystem by ~2 years, making pre-0.9 botorch
  wheels unlikely to install. Compat shims are the production path.

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md` status-table bumped (two rows: routes shipped,
  runtime modernized).
- `docs/TODO.md` new completed-row entry under Backend.
- `docs/dispatch/backend-to-frontend-qeubo-status.md` (new) — closes
  the open dispatch loop.
- No ADR amendment; no `deferred-items.md` entry.

## Branch + PR workflow

Branched off main post-PR-#26 merge (`5f0fcf9`). Single PR to main
combining the PD route layer with the MIT runtime modernization;
splitting into two PRs would impose review coordination cost without
benefit, since the modernization is a prerequisite for the routes to
actually function end-to-end.
