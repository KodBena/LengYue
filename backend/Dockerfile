# backend/Dockerfile
#
# Multi-stage build for the FastAPI backend (Spaced-Repetition Service).
#
# Stage 1 (builder) installs Python deps into an isolated prefix so the
# final image never carries pip's build cache or a compiler toolchain.
# Stage 2 (final) copies only the installed packages and the application
# source, runs as a non-root user, and exposes uvicorn on 8764.
#
# v1 scope (ledger row 690): this image does NOT contain KataGo or
# KataProxy. The application connects to the analysis engine running on
# the operator's host, exactly as it does outside Docker — see
# docs/docker.md for how that connection is wired.
#
# License: Public Domain (The Unlicense)

# ---------- Stage 1: builder ----------
FROM python:3.13-slim AS builder

# build-essential covers the rare case a dependency has no prebuilt wheel
# for this platform and falls back to a source build (e.g. scipy/numpy
# on an uncommon arch). Discarded entirely — this stage's filesystem
# never reaches the final image, only the installed site-packages do.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential=12.* \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .
# --prefix isolates the installed tree so stage 2 can copy it verbatim
# without dragging pip's cache or the compiler toolchain along.
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------- Stage 2: final ----------
FROM python:3.13-slim AS final

# libpq5 is the runtime shared library psycopg (plain, non-[binary]
# build per requirements.txt) needs to talk to Postgres. SQLite is the
# default DATABASE_URI and needs no driver; libpq5 only matters for
# operators who point DATABASE_URI at Postgres. ca-certificates for
# any outbound TLS the app or its deps make.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 appuser \
    && useradd --system --uid 1000 --gid appuser --create-home appuser

COPY --from=builder /install /usr/local

WORKDIR /app

# Application source. .dockerignore keeps venv/, __pycache__/, data/,
# and *.db out of the build context (backend/.gitignore already treats
# these as local-only; .dockerignore mirrors that list for the same
# reason: none of it belongs baked into an image or a build layer).
# backend/resources_data/ — shipped, read-only, tracked-in-git assets
# such as visit_distribution.json — is deliberately NOT excluded and
# travels with this COPY like any other source file; see
# backend/resources_data/README.md.
COPY . .

# /app/data is where the named volume (see docker-compose.yml) mounts:
# cards.db and the persisted JWT secret both live here so they survive
# container recreation. Created and chowned before the volume mount so
# a *fresh* named volume inherits correct ownership (Docker seeds a new
# local-driver volume from the image directory's contents/permissions
# on first mount). This directory holds ONLY that per-installation
# mutable state — never a shipped resource, which would be shadowed by
# the volume mount at container start (ledger rows 806/807).
RUN mkdir -p /app/data && chown -R appuser:appuser /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATABASE_URI=sqlite+aiosqlite:////app/data/cards.db \
    SECRET_KEY_FILE=/app/data/.jwt_secret

USER appuser

EXPOSE 8764

# Alembic migrations run automatically at startup via the existing
# lifespan hook (main.py -> db.alembic_bootstrap.bootstrap_alembic) —
# no separate migration step or entrypoint script needed here.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8764"]
