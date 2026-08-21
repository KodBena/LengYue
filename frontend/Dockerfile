# frontend/Dockerfile
#
# Multi-stage build for the Vue 3 + TypeScript SPA.
#
# Stage 1 (build) runs the same `npm run build` a developer runs locally
# (vue-tsc type-check, then vite build) and bakes VITE_API_BASE_URL /
# VITE_KATAGO_WS_URL into the compiled bundle — see src/config/env.ts:
# these are Vite build-time env vars, inlined into the JS at build time,
# not read at container-start. That is an existing app property, not a
# Docker-specific choice: this image just needs to supply values that
# are correct for *where the built assets will be loaded from*, i.e. the
# operator's browser — see docs/docker.md for why that means "localhost
# plus the published port", not a container-internal hostname.
#
# Stage 2 (final) serves the built dist/ as static files via nginx. See
# docs/docker.md "Static serving: nginx vs backend StaticFiles" for why
# nginx was chosen over mounting the SPA in the FastAPI backend.
#
# License: Public Domain (The Unlicense)

# ---------- Stage 1: build ----------
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies layer cached separately from source so editing app code
# doesn't invalidate `npm ci`.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time-only: baked into the compiled JS bundle, not read at
# container start. Defaults match frontend/.env.example's out-of-the-box
# values; docker-compose.yml overrides them to match the ports it
# actually publishes.
ARG VITE_API_BASE_URL=http://localhost:8764
ARG VITE_KATAGO_WS_URL=ws://127.0.0.1:1242
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_KATAGO_WS_URL=${VITE_KATAGO_WS_URL}

RUN npm run build

# ---------- Stage 2: final ----------
# Unprivileged variant: nginx worker (and master) run as a non-root
# user out of the box, listening on 8080 (see nginx.conf) since non-root
# processes can't bind 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
