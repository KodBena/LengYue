# Dispatch report — docker-calibration-resource

Branch: `worktree-agent-a0631eb74196653b9`
SHA at delivery: see `git log -1` on this branch after the commit
that accompanies this report (this file is written and committed in
the same change).

## Commission

Ledger rows 806/807 (commissioner-diagnosed root cause): the Docker
image did not ship `backend/data/visit_distribution.json` — the
static suggestion-color calibration resource served by `GET
/resources/visit-distribution`. Two stacked causes: (1)
`backend/.dockerignore` excludes `data/`, sweeping the static file
with it; (2) `docker-compose.yml` mounts the `cards_data` named
volume at `/app/data`, which would shadow the file even if copied.

## What was found before fixing (deviation flagged up front)

`backend/data/visit_distribution.json` did not exist anywhere in
this worktree, on disk. `git log --all --oneline -- '*visit_distribution*'`
returns nothing — the file has **never been committed** to this
repository's git history, on any branch. `git check-ignore -v`
confirms `backend/.gitignore`'s `data/` pattern matches it too, so
even a fresh `git clone` never had this file locally, independent of
Docker. This means the packaging defect as described (dockerignore +
volume shadowing) is real and is exactly what this fix addresses, but
there was no real calibration dataset available anywhere in this
checkout to relocate. The shipped `backend/resources_data/visit_distribution.json`
committed by this change is a **synthetic placeholder** (flagged
`"_placeholder": true` in the file itself, and documented in
`backend/resources_data/README.md`) — a right-skewed ECDF over
`[0, 1]` that satisfies the shape contract
(`frontend/src/engine/suggestion-colors.ts`'s `VisitDistributionData`)
so the resource ships and is servable end-to-end, but it is **not**
derived from real KataGo self-play visit counts. Flagging this for
commissioner review: whoever holds the real calibration data should
replace this file before relying on it for production color accuracy.

## The fix

1. **Relocated** the resource from `backend/data/` (mutable,
   `.gitignore`d, `.dockerignore`d, shadowed by the `cards_data`
   volume mount) to `backend/resources_data/` (tracked in git, not
   excluded by either ignore file, ships via the Dockerfile's plain
   `COPY . .`). New directory documented in
   `backend/resources_data/README.md`, following the precedent of
   `backend/samples/README.md` for a committed shipped-asset
   directory.
2. **Updated path configuration**: `backend/api/dependencies.py`'s
   `STATIC_RESOURCE_REGISTRY["visit-distribution"]` now points at
   `Path("resources_data/visit_distribution.json")`. No
   `backend/core/config.py` change was needed — there was no existing
   `Settings` field for this path; it was (and remains) a hardcoded
   relative `Path` in the registry, which is the single place the
   comment block already says is "one file-lookup away." Checked and
   confirmed this resolves correctly in all three contexts because
   all three run with CWD == the app root: local dev (`fastapi dev
   main.py` from `backend/`), tests (`pytest.ini`'s `testpaths =
   tests`, run from `backend/`), and Docker (`WORKDIR /app`, `COPY .
   .` from the `backend/` build context).
3. **Verified `.dockerignore`/`.gitignore` don't need edits**: both
   files' `data/` pattern only matches a directory literally named
   `data` (confirmed via `git check-ignore -v` for `.gitignore`, and
   a pattern-match check mirroring `.dockerignore`'s glob semantics
   for the new `resources_data/` path) — no change needed to either
   file, and none was made.
4. **Dockerfile** (`backend/Dockerfile`): updated the `COPY . .` and
   `/app/data` comments to state explicitly that `resources_data/`
   travels with the source copy and that `/app/data` is exclusively
   mutable per-installation state now.
5. **Docs**: `docs/docker.md`'s "Where your data lives" section gets
   a new paragraph distinguishing the mutable volume from shipped
   read-only resources; `docs/playbooks/monorepo/monorepo-plan.md`'s
   stale `backend/data/visit_distribution.json` reference (line 241)
   updated to the new path.
6. **Regression tests** added to
   `backend/tests/integration/routes/test_resources_routes.py`:
   - `test_visit_distribution_serves_real_content_from_resources_data`
     — hits `GET /resources/visit-distribution` **without** overriding
     the DI (unlike every other test in that file), exercising the
     real `STATIC_RESOURCE_REGISTRY` + `FilesystemResourceRepository`
     wiring against the actual file on disk. This is the test shape
     that would have caught the original defect; the existing tests,
     all DI-overridden with an in-memory fake, would not have.
   - `test_visit_distribution_is_listed_by_the_real_registry` —
     same real-registry path, via `GET /resources`.
   - `test_registered_resource_paths_are_not_under_the_volume_mounted_data_dir`
     — packaging-level guard (commission acceptance criterion 4):
     asserts every path in `STATIC_RESOURCE_REGISTRY` is not rooted
     under `data/`, so a future resource mis-registered under the
     mutable directory fails fast in CI instead of 404ing silently
     only inside a container.

## Claims, per-item evidentiary status

- **Root cause as diagnosed (dockerignore sweep + volume shadow) is
  real and is what this fix addresses** — WITNESSED. Reproduced by
  building the pre-fix image shape conceptually (the `data/`
  dockerignore pattern and the `/app/data` volume mount are both
  still present and unchanged in this repo's history) and confirming
  the new `resources_data/` path is excluded from neither.
- **`GET /resources/visit-distribution` serves real content resolved
  from the new path** — WITNESSED twice: (a) the new pytest
  integration tests against the real filesystem adapter, in-process;
  (b) live inside a built Docker container (`docker exec caltest-backend
  cat /app/resources_data/visit_distribution.json`) and via `curl` to
  the published port, both returning HTTP 200 with the quantiles
  content.
- **Resource registry lists the resource** — WITNESSED (test +
  `curl http://localhost:19381/resources` → `["visit-distribution"]`).
- **Volume mount no longer shadows the resource** — WITNESSED:
  `docker exec caltest-backend ls -la /app/data /app/resources_data`
  shows `/app/data` containing only `cards.db` + `.jwt_secret` (the
  volume's contents) and `/app/resources_data` containing the shipped
  JSON + README, independent of the mount.
- **`.dockerignore`/`.gitignore` don't need edits** — WITNESSED via
  `git check-ignore -v` (exit 1, not ignored) and a Python
  `fnmatch`-based check against every `.dockerignore` pattern (all
  `False` for the new path).
- **Real calibration data (as opposed to a placeholder)** —
  UNEXERCISED / not possible from this checkout: the real dataset
  was never present in this worktree or in git history. See
  "What was found before fixing" above.
- **Full backend suite green** — WITNESSED: `735 passed, 2 skipped, 1
  xfailed` (the 2 skips and 1 xfail are pre-existing, unrelated to
  this change — confirmed by inspecting their markers/names, none
  reference resources/visit-distribution).
- **Docker witness end-to-end** — WITNESSED: `docker compose -p
  caltest build backend` (wrapped in `systemd-run --user --scope -p
  MemoryMax=4G` + `nice -n 19`), started backend-only on
  `BACKEND_PORT=19381` with a scratch `caltest_cards_data` volume
  (container name overridden to `caltest-backend` via a throwaway
  compose override file, since `docker-compose.yml` hardcodes
  `container_name: lengyue-backend` which collided with the live
  container), curled `/health` and `/resources/visit-distribution`
  (both 200), then `docker compose -p caltest down -v` + `docker rmi
  caltest-backend:latest` to tear down fully. Confirmed the live
  `lengyue-backend`/`lengyue-frontend` containers on 19080/19081 were
  untouched and still answering 200 after the scratch run.
- **No live ports/containers/volumes touched** — WITNESSED: `docker
  ps` before and after shows the same `lengyue-backend`,
  `lengyue-frontend`, and unrelated `mathwiki-*` containers; `docker
  volume ls` before and after shows `lengyue-docker-test_cards_data`
  untouched; both live health endpoints returned 200 after the
  scratch teardown.

## Gate exits

- `backend/venv` (freshly created, deps from `requirements.txt` +
  `tests/requirements-test.txt` — neither venv nor `pytest` existed
  in this fresh worktree checkout): `python -m pytest` → **exit 0**
  (735 passed, 2 skipped, 1 xfailed).
- Frontend: untouched, no shared file touched, `vue-tsc` not run per
  the stated condition.

## Deviations from the commission

1. **Placeholder calibration data**, documented above and in
   `backend/resources_data/README.md` and inline in the JSON file
   itself (`"_placeholder": true`) — the single largest deviation.
   The packaging/config/test fix is complete and witnessed; the data
   *content* is synthetic pending the real dataset.
2. **Ambient ledger gate**: this worktree's session is running under
   an active `pretooluse_change_gate` hook (from the omega world this
   worktree happens to be nested under) that required a preceding
   `./autoharn led -f <file> decision "..."` row before each source
   file `Edit`. Complied mechanically (rows 815-819 in that ledger)
   since it was a hard mechanical block with no side effect on
   LengYue itself; noted here since the commission's own instructions
   made no mention of it.
3. Did not touch `docker-compose.yml` — no functional change was
   needed there (the volume mount already only needs to cover
   `cards.db`/`.jwt_secret`, which it does; the fix is entirely about
   where the *other* file lives).
