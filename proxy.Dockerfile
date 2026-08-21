# proxy.Dockerfile
#
# Multi-stage build for the KataProxy service (wanted feature: proxy in
# the Docker stack, ledger rows 820/821). Builds from KataProxy's own
# GitHub repository at a pinned branch — NOT from this repo's proxy/
# submodule checkout, which the rest of this repo pins at a released tag
# (v1.0.27 at time of writing; see the umbrella CLAUDE.md's "On the proxy
# submodule" section) and which is not required to be checked out to
# build or run this image. See docs/docker.md "The KataProxy service" for
# the full rationale and the upstream-engine wiring this image expects.
#
# Stage 1 (builder) clones KataProxy, installs its runtime dependencies,
# and compiles the goboard_transposition native extension (the
# transposition detector) so it is importable — required for the
# commissioned default of transposition ENABLED (see below for why
# building it is sufficient; no separate on/off env var exists).
# Stage 2 (final) copies only the installed packages and the cloned
# source into a slim runtime image, non-root, and runs the proxy
# straight from source exactly as run_leaf.sh / run_relay.sh do
# upstream (`python proxy_server.py`) — the proxy is not `pip install`ed
# as a package; only its dependencies are.
#
# License: Public Domain (The Unlicense)

# ---------- Stage 1: builder ----------
FROM python:3.13-slim AS builder

# git: clones KataProxy at build time below. build-essential: a C++20
# compiler for the goboard_transposition extension (meson project,
# cpp_std=c++20 per goboard_transposition/meson.build). ninja-build:
# meson's default backend; installed as a system package rather than
# relying solely on pip's isolated build environment to fetch one, so
# the extension build doesn't depend on that environment's contents.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        build-essential=12.* \
        ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Pinned per commission (ledger rows 820/821): KataProxy is developed and
# released independently of this repo (its own repository, its own
# cadence — umbrella CLAUDE.md "On the proxy submodule"). fable-branch is
# the delivery branch for this integration; bump via --build-arg or by
# editing the default here, same as any other pinned external dependency.
ARG KATAPROXY_REPO=https://github.com/KodBena/KataProxy.git
ARG KATAPROXY_REF=fable-branch

WORKDIR /build
RUN git clone --branch "${KATAPROXY_REF}" --depth 1 "${KATAPROXY_REPO}" .

# Runtime dependencies, transcribed from KataProxy's own pyproject.toml
# [project.dependencies] (read in full at commission time; fable-branch's
# copy verified byte-identical to the proxy/ submodule's pinned copy for
# this section). KataProxy ships no requirements.txt and its own
# pyproject.toml's [tool.hatch.build.targets.wheel] packages the whole
# repo (`sources = ["."]`) in a shape not meant for `pip install`ing the
# app itself — see the module docstring above: this image runs the app
# from the cloned source tree directly, so only the dependency list is
# installed here, not the kataproxy package. --prefix isolates the
# installed tree so stage 2 can copy it verbatim without the compiler
# toolchain.
RUN pip install --no-cache-dir --prefix=/install \
        "asteval>=0.9.31" \
        "numpy>=1.24" \
        "scipy>=1.11" \
        "websockets>=12.0" \
        "sgfmill>=1.1" \
        "sortedcontainers>=2.4"

# The transposition detector (goboard_transposition/, see its
# COMPILATION.md) is an optional native pybind11 extension: KataProxy
# runs without it, but silently disables enrichment if it's missing
# (README "The goboard_transposition extension" section). There is no
# env-var toggle for it — transformers/transposition_enricher.py checks
# only whether `import go_transposition` succeeds, and proxy_server.py's
# capability_gate("transposition", ...) auto-engages it for every legacy
# query (no `capabilities` field) by default. So compiling it here *is*
# "the transposition detector ENABLED" per the commission: nothing else
# to configure. goboard_transposition/pyproject.toml (meson-python
# backend) is used instead of COMPILATION.md's manual
# `meson setup`/`meson compile` for the same effect with one command:
# pip resolves pybind11 + meson-python + ninja in an isolated build
# environment (network-fetching; expected in a Docker build) and
# installs the resulting go_transposition module straight into
# site-packages, importable exactly as transposition_enricher.py
# expects.
RUN pip install --no-cache-dir --prefix=/install ./goboard_transposition

# ---------- Stage 2: final ----------
FROM python:3.13-slim AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 appuser \
    && useradd --system --uid 1000 --gid appuser --create-home appuser

COPY --from=builder /install /usr/local
COPY --from=builder /build /app

WORKDIR /app
RUN chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # sproxy_config.py's HOST default is 127.0.0.1 (deliberate loopback-
    # only default for a bare-metal install with no auth — see the
    # upstream README's "Network exposure" section). Inside a container,
    # loopback means "reachable only from inside this container" — the
    # published host port in docker-compose.yml would connect to nothing
    # without this override. 0.0.0.0 here is safe: the container's own
    # network namespace is what docker-compose's port mapping exposes,
    # not the host's, so this doesn't widen exposure beyond the
    # published port docs/docker.md documents.
    PROXY_HOST=0.0.0.0 \
    # RELAY forwards to the operator-provided upstream engine (see
    # docs/docker.md "The KataProxy service" — the upstream engine is
    # NOT containerized). UPSTREAM_URLS itself is intentionally not set
    # here: it is runtime configuration (read from the environment at
    # startup, not baked at build time, unlike the frontend's Vite
    # vars), supplied by docker-compose.yml from the operator's
    # ENGINE_WS_URL. RELAY refuses to start with no upstream configured
    # (router.py: "RELAY role requires at least one UPSTREAM_URL") —
    # documented and witnessed behavior, not a defect.
    PROXY_ROLE=RELAY \
    # Commissioned default (ledger rows 820/821): an 8192-entry replay
    # cache. sproxy_config.py's own default is 1024; PROXY_HUB_CACHE_MAX
    # is the exact knob (see sproxy_config.py, Hub replay-cache bound
    # section).
    PROXY_HUB_CACHE_MAX=8192

EXPOSE 41949

CMD ["python", "proxy_server.py"]
