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

**Current content is a placeholder.** The real calibration dataset
(quantiles derived from actual KataGo self-play visit counts) was
never committed to this repository's git history, and no copy of it
existed on disk in the checkout this fix was authored from. The
committed `visit_distribution.json` is a synthetic right-skewed ECDF
that satisfies the shape contract (`{"quantiles": number[]}`, sorted,
bounded to `[0, 1]`) so the resource ships and the endpoint serves
real content end-to-end — it is flagged `"_placeholder": true` in the
file itself. Replace it with the real calibration data (regenerated
however the original was produced) before relying on this for
production color accuracy.

## Adding a new shipped resource

1. Drop the file here (`backend/resources_data/`), not in
   `backend/data/`.
2. Register it in `STATIC_RESOURCE_REGISTRY`
   (`backend/api/dependencies.py`).
3. Done — no service, adapter, or route change required.
