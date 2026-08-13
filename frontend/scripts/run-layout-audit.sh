#!/usr/bin/env bash
#
# frontend/scripts/run-layout-audit.sh
#
# ADR-0019 CI-gate build (commission per
# .claude/dispatch-reports/lyt-final-opus-review.md §3 Rule 2(b)).
# Wraps `node scripts/layout-audit.mjs --build --check` under the
# project's standard Playwright memory discipline: systemd-run --user
# --scope -p MemoryMax=4G, falling back to a plain `nice -n 19` when
# systemd-run is unavailable (containers / CI runners without a user
# systemd instance). NODE_OPTIONS carries the heap ceiling for the
# `node` process itself; the launched Chromium's own ceiling is set
# inside layout-audit.mjs via --js-flags=--max-old-space-size=1024.
#
# Invoked via `npm run layout-audit` (frontend/package.json).
#
# License: Public Domain (The Unlicense)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$FRONTEND_ROOT"

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048"

NODE_CMD=(node scripts/layout-audit.mjs --build --check "$@")

if command -v systemd-run >/dev/null 2>&1 && systemd-run --user --scope -p MemoryMax=4G -- true >/dev/null 2>&1; then
  echo "[run-layout-audit] running under systemd-run --user --scope -p MemoryMax=4G" >&2
  exec systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 "${NODE_CMD[@]}"
else
  echo "[run-layout-audit] systemd-run unavailable -- falling back to nice -n 19 only" >&2
  exec nice -n 19 "${NODE_CMD[@]}"
fi
