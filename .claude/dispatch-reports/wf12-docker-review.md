# wf12-docker-image — fresh-context review

Reviewer worktree: `/home/bork/w/omega/.claude/worktrees/agent-a455ca8e68170901a`
Artifact reviewed: branch `worktree-agent-a84feb33a33619d96`, commit `03f7199e`
Method: commit fetched into a local ref (`review-wf12-docker`, deleted after review) from the
builder's own worktree path; all builds/runs executed against the builder's worktree files at
`/home/bork/w/omega/.claude/worktrees/agent-a84feb33a33619d96` (docker commands only — no git
operations were run against that path). Builder's self-report
(`.claude/dispatch-reports/wf12-docker-build.md`) was read only AFTER the findings below were
already established from independent witness.

## Scope check — WITNESSED

`git diff 3378806f..03f7199e --stat` (merge-base with `next`):

```
README.md                |   9 ++
backend/.dockerignore    |  24 +++++
backend/Dockerfile       |  80 ++++++++++++++++
backend/requirements.txt |   2 +
docker-compose.yml       |  74 +++++++++++++++
docs/docker.md           | 232 +++++++++++++++++++++++++++++++++++++++++++++++
frontend/.dockerignore   |  20 ++++
frontend/Dockerfile      |  53 +++++++++++
frontend/nginx.conf      |  30 ++++++
9 files changed, 524 insertions(+)
```

No app source is touched beyond `backend/requirements.txt` (+2 lines: `bcrypt==5.0.0`,
`python-multipart==0.0.32`) and a 9-line README pointer. Non-Docker world is untouched.
**Finding: clean — no issue.**

## Dependency claims — WITNESSED

- `bcrypt` genuinely imported: `backend/core/security.py:1` (`import bcrypt`, used for
  `checkpw`/`hashpw`/`gensalt`). `bcrypt==5.0.0` is the current latest release
  (`pip index versions bcrypt` on this host: `5.0.0, 4.3.0, 4.2.1, ...` — `5.0.0` first/latest).
- `python-multipart` genuinely needed: `backend/api/routes/auth.py:25` imports
  `OAuth2PasswordRequestForm` from `fastapi.security`, which requires `python-multipart` to
  parse form bodies (FastAPI raises at request time otherwise). Proven live, not just by
  static grep — see "End-to-end HTTP witness" below, where `POST /auth/token` with a
  `application/x-www-form-urlencoded` body succeeded and returned a bearer token, which is
  impossible without a working multipart/form parser installed.
- No `StaticFiles` mount exists in `backend/main.py` (only routers + `/health` at line 187) —
  confirms the nginx-vs-StaticFiles doc claim is accurate, not aspirational.

**Verdict: no issue.**

## Build — WITNESSED

```
$ cd .../agent-a84feb33a33619d96 && nice -n 19 docker compose -p wf12review build backend
...
 Image wf12review-backend Built
$ nice -n 19 docker compose -p wf12review build frontend
...
 Image wf12review-frontend Built
```
Both stages built serially, under `nice -n 19`, one at a time (memory discipline honored — host
had only ~1.1GB free at review start). Backend final image ~761MB, frontend ~79.5MB.

## Fresh-volume startup — WITNESSED (ports 19180/19181, distinct from builder's 19080/19081)

```
$ FRONTEND_PORT=19180 BACKEND_PORT=19181 nice -n 19 docker compose -p wf12review up -d
...
 Container lengyue-backend Started
 Container lengyue-frontend Started
```
Backend log on a brand-new volume:
```
core.config: SECRET_KEY: generated new key and persisted to /app/data/.jwt_secret
main: Database initialized: sqlite+aiosqlite:////app/data/cards.db
db.alembic_bootstrap: alembic_bootstrap: probe matched marker game_source.created_at → revision 0002_sgf_library_columns
alembic.runtime.migration: Running stamp_revision  -> 0002_sgf_library_columns
alembic.runtime.migration: Running upgrade 0002_sgf_library_columns -> 0003_analysis_bundle_v2_columns, ...
```

Non-root + volume-ownership witness (`docker compose exec backend sh -c "id; ls -la /app/data"`):
```
uid=1000(appuser) gid=1000(appuser) groups=1000(appuser)
-rw-------. 1 appuser appuser     86 ... .jwt_secret
-rw-r--r--. 1 appuser appuser 131072 ... cards.db
```
Confirms the Dockerfile's `chown -R appuser:appuser /app` (before the named-volume mount point
exists) actually propagates: Docker's local volume driver seeds a fresh named volume from the
image directory's permissions on first mount, and the review host reproduced that — `cards.db`
and `.jwt_secret` are owned by `appuser`, not `root`. This is the specific failure mode the probe
asked to check for (named volume mounted over a root-owned dir breaking non-root writes), and it
does **not** occur here.

`GET /health` → `200 {"status":"healthy","engine":"SQLAlchemy 2.0 Async"}`.

**Verdict: no issue.**

## Restart on an EXISTING volume (migration idempotence) — WITNESSED

```
$ docker compose -p wf12review down          # containers only, volume kept
$ FRONTEND_PORT=19180 BACKEND_PORT=19181 docker compose -p wf12review up -d --build
```
Backend log on the pre-existing volume:
```
core.config: SECRET_KEY: loaded persisted key from /app/data/.jwt_secret
db.alembic_bootstrap: alembic_bootstrap: alembic_version present — running upgrade head
```
No error, no re-stamp, no duplicate migration attempt; JWT secret persisted across the restart
(same key loaded, not regenerated). **Migration behavior is idempotent as claimed. No issue.**

## End-to-end HTTP witness (real request/response, not just `/health`)

```
$ curl -X POST http://localhost:19181/auth/register -d '{"username":"revtest","password":"revtestpass123"}' \
       -H "Content-Type: application/json"
{"status":"user created"}                                    HTTP 201

$ curl -X POST http://localhost:19181/auth/token \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "username=revtest&password=revtestpass123"
{"access_token":"eyJhbGci...","token_type":"bearer"}         HTTP 200
```
This exercises `bcrypt.hashpw`/`checkpw` (registration + login) and FastAPI's
`OAuth2PasswordRequestForm` (needs `python-multipart`) live, end to end — the two
"genuinely missing" dependency claims are proven, not merely plausible.

Frontend:
```
$ curl -o /dev/null -w "%{http_code}" http://localhost:19180/                          -> 200
$ curl -o /dev/null -w "%{http_code}" http://localhost:19180/decks/x/nonexistent-route -> 200 (SPA fallback works)
$ docker compose exec frontend sh -c "id"  -> uid=101(nginx) gid=101(nginx) (non-root, effective)
```

Build-arg → bundle wiring, rebuild-required-on-port-change, verified two ways:
1. First `up -d` (no `--build`) reused the frontend image built earlier with default
   `BACKEND_PORT` (8764-derived `19081` default) baked in — bundle contained
   `http://localhost:19081`, **not** `19181`. This is a review artifact of my own test sequence
   (I built once without the port args, then brought the stack up with different ones, without
   `--build`), not a defect — it is exactly the behavior `docs/docker.md`'s "How the frontend
   finds the backend" section warns about ("Changing `BACKEND_PORT` ... requires a **rebuild**").
2. Re-running `up -d --build` with the same env produced a bundle containing
   `http://localhost:19181` — matching the actually-published backend port. Doc is accurate;
   the mechanism works as documented.

`extra_hosts` (Linux host-gateway) — WITNESSED:
```
$ docker compose exec backend sh -c "getent hosts host.docker.internal"
172.17.0.1      host.docker.internal
```
Resolves correctly on this Docker 29.4 / Compose 5.3.1 host, consistent with the doc's stated
minimum (20.10+).

Backup/restore doc commands — WITNESSED:
```
$ docker compose cp backend:/app/data/cards.db ./cards-backup-test.db
 lengyue-backend Copied lengyue-backend:/app/data/cards.db to ./cards-backup-test.db
```
131072-byte file landed on host as documented.

CORS claim — WITNESSED by reading `backend/main.py:164-170`: `allow_origins=CORS_ALLOW_ORIGINS`
(default `["*"]`), `allow_credentials=False` — matches the doc's "wildcard + no-credentials is
spec-compliant" claim exactly (not an unverified assertion).

## Cleanup — WITNESSED

```
$ docker compose -p wf12review down -v
 Volume wf12review_cards_data Removing
 Volume wf12review_cards_data Removed
$ docker rmi wf12review-backend:latest wf12review-frontend:latest
 Deleted: sha256:2edbc210...
 Deleted: sha256:0ce27eea...
```
Post-cleanup checks: `docker ps -a | grep lengyue` → empty; `docker volume ls | grep wf12review`
→ empty; `docker network ls | grep wf12review` → empty. Temp backup file and the local git ref
(`review-wf12-docker`) created for this review were both removed. Nothing left running.

## Findings

1. **ADVISORY** — Base images are pinned to floating minor tags (`python:3.13-slim`,
   `node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`), not digest-pinned
   (`@sha256:...`). This is "pinned" in the conventional sense the task asked for (no `:latest`
   anywhere) and is standard practice; a stricter shop might want digest pins for full
   reproducibility, but that's a policy call beyond this task's scope, not a defect.
2. **ADVISORY** — `container_name: lengyue-backend` / `lengyue-frontend` are hardcoded in
   `docker-compose.yml` rather than left to Compose's project-name-derived default. This means
   two Compose projects (e.g. two operators, or a review run overlapping a real deployment) can't
   run this stack concurrently on the same Docker host — the second `up` would fail on a name
   collision. Worth a mention in `docs/docker.md`'s troubleshooting section, but not a blocker
   for a single-operator v1 deployment target.
3. **ADVISORY** — Backend final image is ~761MB (`libpq5`/`ca-certificates` + full Python
   dependency set on `python-slim`). Not excessive for this app's dependency footprint, and
   correctness (not image size) was the delivery's stated bar; noting for future optimization
   awareness only.
4. No BLOCKER or REQUIRED findings. Every claim in the delivery description (multi-stage,
   alembic auto-apply, named volume, pinned bases, non-root effective through the volume write
   path, nginx decision + rationale, compose port/env/restart wiring, host-gateway syntax,
   zero-Docker-context docs) was independently witnessed and held up under adversarial retest,
   including the one sequence (build-arg staleness) that looked like a bug until traced to my own
   test ordering rather than the artifact.

## Verdict: **MERGE**
