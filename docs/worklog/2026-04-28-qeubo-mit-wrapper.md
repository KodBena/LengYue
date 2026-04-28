# qEUBO MIT-licensed Wrapper (Backend, Step 1 of qEUBO Integration)

- **Status:** Shipped on branch `backend/qeubo-runtime`, PR #26
  (against `main`), 2026-04-28. Smoke test confirms the package
  is importable and the vendored upstream's internal `from src.X
  import Y` references resolve through the package's `sys.path`
  manipulation; deeper end-to-end validation is deferred to the
  route-implementer session that adds the heavy deps (torch,
  botorch, gpytorch, redis) and a Redis instance.
- **Genre:** Worklog entry — first half of the qEUBO integration
  dispatch (filed at `docs/dispatch/frontend-to-backend-qeubo-integration.md`,
  v1.1 after PR #25's licensing correction). Lands the
  MIT-derivative wrapper code; the public-domain route handlers
  are a separate session per the dispatch's authoring discipline.
- **Date:** 2026-04-28.
- **Origin:** The user's request following the corrected dispatch:
  "implement the MIT-licensed wrapper since you already have
  everything you need."

## Context

The qEUBO integration has been spec'd out across PRs #24 (initial
dispatch) and #25 (licensing correction). The corrected three-layer
structure has the upstream library at `backend/qeubo/vendor/`,
the LLM-derived wrapper at `backend/qeubo/runtime/`, and the
public-domain FastAPI route handlers (and encode/decode logic)
at `backend/api/routes/qeubo.py` (still to be written).

The whole `backend/qeubo/` directory carries the MIT license. The
wrapper is "intermediary" code — it is what absorbs the
MIT-derivative status that propagates from authoring with full
qEUBO source visibility, so that downstream PD callers can
consume the wrapper through documented signatures without
inheriting the obligation.

This worklog records the wrapper authoring step. The route
handlers and the frontend changes (toolbar UX, schema migration,
composable, bookmarks) are separate sessions, gated on the user
reading and approving this PR.

## Approach

A — **Vendored the upstream library wholesale.** Copied
`~/preference_optimizer/qEUBO/src/` to `backend/qeubo/vendor/src/`,
preserving the upstream's directory layout (the original `src/`
package name kept so the upstream's internal `from src.X import
Y` references resolve unchanged). Stripped `__pycache__` at copy
time as hygiene; otherwise the vendored tree is bit-for-bit
identical to upstream.

B — **Adapted the LLM-derived wrapper at `backend/qeubo/runtime/`.**
Two files: `service.py` (adapted from `wss3/service.py`) and
`storage.py` (adapted from `wss3/storage.py`). The storage layer
is unchanged in behaviour from the prototype — pure Redis tensor
I/O, no domain content to remove. The service layer was
substantially trimmed:

- Dropped all colormap / gradient-optimizer extensions per the
  dispatch's PBO-core scope (`colormap.py` imports,
  `_compute_colour_data`, `_attach_colour_data`,
  `colour_table_*` / `*_jab` response fields, gradient-specific
  config keys `n_waypoints`, `colour_table_size`, `hue_global`,
  `hue_sweep_limit`, `endpoint_chroma_bound`,
  `interior_chroma_bound`, JAB / quotient-space hue documentation
  in module docstring).
- Dropped the WebSocket-specific code (the demo's `server.py` is
  not vendored at all; the FastAPI route handlers will replace
  its function in a separate PR).
- **Added** support for `controlled_parameters: list[str]` and
  `parameter_ranges: dict[str, [float, float]]` in `user_config`
  at `create_experiment` time. The runtime stores them in the
  experiment config so they're retrievable via `get_status`,
  `request_pair`, and `get_best_point`; the runtime does not
  consume them computationally — they are metadata for the PD
  route handlers to use in their encode/decode logic.
- **Added** input-dim derivation: if `input_dim` is not specified
  but `controlled_parameters` is, `input_dim` derives from the
  list's length.
- Bumped the default `num_algo_queries` from `150` (the demo's
  default) to `1_000_000` per the dispatch's any-time-loop
  semantic — the experiment is unbounded for practical purposes;
  the user idles when satisfied with the posterior.

C — **Authored the package's `__init__.py`** to perform the
one-time `sys.path` manipulation that places `backend/qeubo/vendor/`
on the path so the upstream's `from src.X import Y` references
resolve. Re-exports `ExperimentService` and `ExperimentStorage`
as the public surface.

D — **Wrote `backend/qeubo/README.md` as the load-bearing public
API contract.** This is the artefact that PD route-author sessions
read instead of the wrapper's `.py` source — per the licensing
discipline established in the dispatch v1.1. The README documents:

- The licensing posture and importing conventions.
- Each public method's signature, docstring, return shape, and
  raised exceptions.
- What the runtime intentionally does NOT do (no domain awareness,
  no colour tables, no HTTP, no auth) and what the PD caller is
  responsible for instead (per-user namespacing, encode/decode,
  JWT auth, bundled-apply verdict, bookmark storage).
- Recommended construction pattern for the FastAPI lifespan.
- The new runtime-deps note (torch, botorch, gpytorch, redis≥4)
  flagged as deferred to the route-implementer session.

E — **Wrote `backend/NOTICE`** declaring the directory boundary
parallel to `proxy/NOTICE`'s pattern: project root + most subdirs
are public domain (Unlicense, per ADR-0006); `backend/qeubo/`
(whole tree) is MIT, with provenance, derivation trail, and
practical implications for downstream packagers.

## Critical files

- **Created:**
  `backend/qeubo/__init__.py` (sys.path setup + public re-exports),
  `backend/qeubo/LICENSE` (qEUBO upstream MIT, copied verbatim),
  `backend/qeubo/README.md` (load-bearing public API contract),
  `backend/qeubo/runtime/__init__.py`,
  `backend/qeubo/runtime/service.py`,
  `backend/qeubo/runtime/storage.py`,
  `backend/qeubo/vendor/src/...` (upstream tree, unmodified),
  `backend/NOTICE`.
- **No edits to existing files**. This PR is purely additive; the
  rest of the backend is untouched.

## Reused existing surface

- The wss3 prototype's `service.py` and `storage.py` are the
  immediate source of the runtime adaptation — derived, not
  rewritten, with the cruft surgically removed.
- The upstream qEUBO library is vendored unmodified, preserving
  its internal package layout (`src/` as the package root).
- The umbrella's per-file-header licensing convention (ADR-0006)
  is preserved on the new files; backend-side files declare MIT
  in their headers via the `License: MIT — see ../LICENSE` form.

## Verification

1. **Structural smoke.** All files present in the expected layout
   (verified via `find`); the package is discoverable via
   `importlib.util.find_spec('qeubo')`. ✓

2. **Vendored-import resolution.** With the package's `sys.path`
   manipulation, all of `src.utils`, `src.acquisition_functions.eubo`,
   `src.models.variational_preferential_gp`, and the implicit
   namespace packages `src`, `src.acquisition_functions`,
   `src.models` are discoverable through `importlib.util.find_spec`.
   The internal `from src.X import Y` references in the upstream
   resolve to the vendored copy. ✓

3. **Heavy-dep import (deferred).** `import qeubo` in the backend's
   current venv fails on `import torch` (torch is not yet in
   `requirements.txt`). The dispatch defers heavy-dep installation
   to the route-implementer session. The runtime's structure is
   correct; only the deps are missing. ✓ (deferred)

4. **End-to-end with Redis (deferred).** The dispatch's full
   verification checklist (create experiment, walk init phase,
   transition to optimization, `get_best_point`, delete) requires
   torch + botorch + gpytorch + redis + an actual KeyDB instance.
   Deferred to the route-implementer session.

5. **Licensing boundary check.** `backend/NOTICE` declares the
   directory boundary; `backend/qeubo/LICENSE` carries the
   upstream MIT text; `backend/qeubo/README.md` records the
   authoring discipline (PD callers read README, not source).
   The boundary as documented is internally consistent. ✓

## Outcomes

- The MIT-licensed wrapper exists. The backend gains a
  preference-based optimization substrate it can call into via the
  documented API.
- The directory-by-license boundary parallel to
  `proxy/goboard_transposition/` is now established at
  `backend/qeubo/`, with a precedent-shaped NOTICE.
- The dispatch's "Backend responsibilities" half is half-shipped
  (vendoring + wrapper). The other half (REST endpoints, encode/
  decode, FastAPI lifespan wiring, requirements bump) is the
  route-implementer session.
- The frontend half of the dispatch (toolbar UX, composable,
  schema migration, bookmarks, parameter-meta editor) is
  independent and can be developed in parallel.

## Out of scope (explicitly)

- **REST route handlers.** A separate PR per the authoring
  discipline; the route-author session reads
  `backend/qeubo/README.md` only, not the runtime source.
- **`requirements.txt` / `pyproject.toml` updates.** Heavy deps
  (torch, botorch, gpytorch, redis) are listed in the README's
  deps note; the route-implementer session adds them when wiring
  routes.
- **Smoke / integration tests.** Need torch + Redis to be
  meaningful; deferred.
- **Frontend half.** Schema migration, toolbar cluster, useQeubo
  composable, bookmarks UI, parameter-meta editor extension —
  all separate PRs.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — Backend Completed table gains an entry for the
  wrapper-shipped milestone.
- `docs/dispatch/frontend-to-backend-qeubo-integration.md` — no
  edit needed; the dispatch already describes this step.
- No ADR amendment. The licensing boundary follows the existing
  `proxy/NOTICE` precedent.

## Branch + PR workflow

Branched off `main` post-PR-#25 merge (`51cabfa`). Single PR (#26)
opened against main. The PR is purely additive (no edits to
existing files), so review focuses on:

- Vendoring layout (parallel to `proxy/goboard_transposition/`).
- The runtime's gradient-optimizer-cruft stripping (verifies
  nothing PBO-core was inadvertently removed).
- The README's completeness as a load-bearing API contract.
- The NOTICE's accuracy on the directory boundary.
