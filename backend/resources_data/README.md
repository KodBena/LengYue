# Shipped static resources

This directory holds **immutable, read-only assets committed to git and
baked into every deployment** (local dev, test, and the Docker image) —
distinct from `backend/data/`, which is the *mutable* per-installation
directory for `cards.db` and the JWT secret, is entirely `.gitignore`d,
and in Docker is the mount point for the `cards_data` named volume.

Co-locating a shipped asset with `backend/data/` was the root cause of
a packaging defect (see `docs/docker.md` and ledger rows 806/807): the
`.dockerignore`/`.gitignore` `data/` exclusions (correct for keeping a
developer's live database out of git and out of images) swept the
static resource out along with it, and the Docker volume mount at
`/app/data` would have shadowed it even if it had been copied. A
resource that ships with the application belongs in its own
tracked, non-ignored directory — this one — never inside the mutable
data directory.

## `visit_distribution.json`

Served via `GET /resources/visit-distribution` (see
`backend/api/dependencies.py::STATIC_RESOURCE_REGISTRY` and
`backend/api/routes/resources.py`). Consumed by the frontend's
suggestion-color calibration
(`frontend/src/composables/board/suggestion-color-calibration.ts`) to
build an ECDF over KataGo visit ratios so the move-suggestion color
gradient walks its LUT uniformly across the population's natural skew,
rather than through the uncalibrated fallback ramp.

**Provenance.** The committed `visit_distribution.json` is the real
calibration dataset (1000 quantiles derived from actual KataGo visit
counts), first committed to git 2026-08-08. It previously lived only
as an untracked file at `backend/data/visit_distribution.json` on the
maintainer's machine — swept out of both git and the Docker build
context by the `data/` ignore patterns, which is the outage this
directory exists to fix. (The relocation fix was authored in a
checkout that had no copy of the file; a flagged synthetic placeholder
shipped in the branch and was replaced with the real data at merge
time by the orchestrator — see ledger row for the merge witness.)

## Adding a new shipped resource

1. Drop the file here (`backend/resources_data/`), not in
   `backend/data/`.
2. Register it in `STATIC_RESOURCE_REGISTRY`
   (`backend/api/dependencies.py`).
3. Done — no service, adapter, or route change required.
