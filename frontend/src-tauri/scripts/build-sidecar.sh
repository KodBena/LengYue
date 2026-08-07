#!/usr/bin/env bash
# frontend/src-tauri/scripts/build-sidecar.sh
#
# Freezes the FastAPI backend (backend/) into a single-file executable
# via PyInstaller, then copies it into src-tauri/binaries/ under the
# Rust-target-triple-suffixed name Tauri's `externalBin` sidecar
# mechanism requires (`lengyue-backend-<target-triple>`, e.g.
# `lengyue-backend-x86_64-unknown-linux-gnu`).
#
# Run this BEFORE `npm run tauri build` (or `tauri dev`, if the sidecar
# is exercised in dev mode) — the CLI does not invoke it automatically;
# wiring it into the npm script pipeline is a straightforward follow-up
# once this is confirmed in place. See the dispatch report's "Backend
# sidecar" section for the full pipeline and its current
# hand-invoked status.
#
# Usage: bash frontend/src-tauri/scripts/build-sidecar.sh [path-to-venv]
#   path-to-venv defaults to backend/.venv-pyinstaller (created if absent).
#
# License: Public Domain (The Unlicense)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SRC_TAURI_DIR="$FRONTEND_DIR/src-tauri"
VENV_DIR="${1:-$BACKEND_DIR/.venv-pyinstaller}"

if [ ! -d "$VENV_DIR" ]; then
    echo "build-sidecar: creating venv at $VENV_DIR"
    python3.13 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --quiet --upgrade pip
pip install --quiet -r "$BACKEND_DIR/requirements.txt"
pip install --quiet pyinstaller

cd "$BACKEND_DIR"
pyinstaller --noconfirm --clean packaging/lengyue-backend.spec

TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
if [ -z "$TARGET_TRIPLE" ]; then
    echo "build-sidecar: could not determine rustc host target triple (rustc not on PATH?)" >&2
    exit 1
fi

mkdir -p "$SRC_TAURI_DIR/binaries"
DEST="$SRC_TAURI_DIR/binaries/lengyue-backend-$TARGET_TRIPLE"
cp "$BACKEND_DIR/dist/lengyue-backend" "$DEST"
chmod +x "$DEST"

echo "build-sidecar: sidecar built at $DEST"
