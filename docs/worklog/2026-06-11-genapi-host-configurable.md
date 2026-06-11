# Worklog — genapi-host-configurable (2026-06-11)

> Audit trail for the PR making `npm run gen:api`'s backend host
> configurable via the `GENAPI_BASE_URL` environment variable.
> Executed against work-status item `genapi-host-configurable`.

## The change

Three files changed; no `src/` changes:

- **`frontend/package.json` line 14** — the hardcoded
  `http://127.0.0.1:8764` replaced with shell fallback syntax:
  `${GENAPI_BASE_URL:-http://127.0.0.1:8764}`.  The default is
  preserved; setting `GENAPI_BASE_URL` in the shell overrides it.
- **`frontend/.env.example`** — a new `GENAPI_BASE_URL` entry added
  alongside `VITE_API_BASE_URL`, with a comment explaining when and how
  to set it and why the `VITE_` prefix is absent.
- **`frontend/README.md`** (the `gen:api` section) — updated to
  document the configurable host, the shell-fallback mechanism, the
  naming rationale, and a one-line usage example.

## Mechanism choice: shell fallback vs node wrapper

npm scripts are executed by the system shell (`/bin/sh`), which
expands `${VAR:-default}` at invocation time.  This is the lightest
possible mechanism: no additional file, no `node` process, no new
dependency, no platform abstraction layer.  A tiny node wrapper would
be warranted only if Windows portability were a requirement (Windows
`cmd.exe` does not understand POSIX parameter expansion).  This project
runs on Linux and uses `zsh`; the shell fallback is the right tool.

## Naming convention

The `.env.example` file already establishes two URL vars:

- `VITE_API_BASE_URL` — the SPA's runtime API base, bundled by Vite.
- `VITE_KATAGO_WS_URL` — the SPA's runtime WebSocket URL, also bundled.

The `VITE_` prefix has a specific meaning: Vite inlines the variable
into the browser bundle at build time.  A variable consumed only at
contributor-tooling time (codegen) must not carry that prefix — it
would mislead readers into thinking it affects the bundle.  The new
variable is `GENAPI_BASE_URL`: it mirrors the `_BASE_URL` suffix of
`VITE_API_BASE_URL` (same server, same URL shape), and the `GENAPI_`
prefix scopes it unambiguously to the codegen script.

## Verification

- `npm run build` — green (`vue-tsc -b && vite build`).
- `npx eslint .` — exit 0.
- `npm run test:run` — 888 passed | 4 skipped (892); no test changes.
- `npm run gen:api` against the running backend — succeeded, regenerated
  `src/types/backend.ts` to identical content (no diff, committed file
  unchanged).
- `GENAPI_BASE_URL=http://example.com:9999 npm run gen:api` — reached the
  override host and failed with `ResolveError: fetch failed`, confirming
  the env var override is live.

## What's deferred

- Wiring `.env` file loading for npm scripts (e.g. via `dotenv-cli`) if
  contributors want to persist the override without exporting it in the
  shell — not-filed: not requested; the `.env.example` comment makes the
  workaround (export in shell or add to local profile) explicit.

License: Public Domain (The Unlicense).
