#!/usr/bin/env bash
# frontend/src-tauri/scripts/build-proxy-sidecar.sh
#
# Freezes KataProxy (fable-branch of https://github.com/KodBena/KataProxy.git)
# into a single-file executable via PyInstaller — the desktop shell's SECOND
# sidecar, alongside `build-sidecar.sh`'s backend freeze. Mirrors that
# script's structure; see its comments for the parts that are identical
# (venv creation, target-triple-suffixed staging).
#
# Deliberately clones KataProxy FRESH into a scratch directory rather than
# freezing the umbrella's proxy/ submodule checkout — the proxy has its own
# release cadence (umbrella CLAUDE.md, "On the proxy submodule": the
# umbrella must not treat submodule-internal state as something it owns
# the release arc for), and the commission's charter is explicit that the
# freeze source is fable-branch, not whatever commit the submodule pointer
# happens to be pinned at locally.
#
# Also builds the optional `goboard_transposition` native extension
# (`go_transposition`) into the freeze venv BEFORE running PyInstaller, so
# transposition enrichment is bundled and enabled by default — see
# packaging/lengyue-proxy.spec's note 1. There is no separate "enable
# transposition" config flag: `transformers/transposition_enricher.py`
# auto-engages (legacy capability-gate auto-engage) whenever the native
# module is importable, so bundling it IS enabling it.
#
# Usage: bash frontend/src-tauri/scripts/build-proxy-sidecar.sh [path-to-venv] [path-to-clone]
#   path-to-venv   defaults to backend/.venv-pyinstaller-proxy (created if absent;
#                  a DIFFERENT venv than the backend's — the two projects have
#                  disjoint, occasionally conflicting dependency sets, and
#                  freezing each from its own venv avoids cross-contamination).
#   path-to-clone  defaults to a fresh `mktemp -d` scratch directory, removed
#                  at the end of a successful run. Pass an existing clone's
#                  path to skip the network clone on repeat local runs (the
#                  script still `git fetch && git reset --hard` it to
#                  fable-branch's current tip, so a reused path never freezes
#                  stale source silently).
#
# Memory/CPU posture: this script does not self-apply a memory cap — the
# charter's `nice -n 19` / `systemd-run --user --scope -p MemoryMax=4G`
# wrapping is expected at the CALL SITE (matching how build-sidecar.sh is
# invoked), not baked into the script, so the same script works uncapped
# in a CI environment that already sandboxes memory at the job level.
#
# License: Public Domain (The Unlicense)
set -euo pipefail

KATAPROXY_REPO_URL="https://github.com/KodBena/KataProxy.git"
KATAPROXY_BRANCH="fable-branch"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SRC_TAURI_DIR="$FRONTEND_DIR/src-tauri"
VENV_DIR="${1:-$BACKEND_DIR/.venv-pyinstaller-proxy}"

CLONE_DIR="${2:-}"
CLEANUP_CLONE=0
if [ -z "$CLONE_DIR" ]; then
    CLONE_DIR="$(mktemp -d -t lengyue-kataproxy-fable.XXXXXX)"
    CLEANUP_CLONE=1
fi

cleanup() {
    if [ "$CLEANUP_CLONE" -eq 1 ] && [ -d "$CLONE_DIR" ]; then
        rm -rf "$CLONE_DIR"
    fi
}
trap cleanup EXIT

echo "build-proxy-sidecar: scratch clone at $CLONE_DIR"
if [ -d "$CLONE_DIR/.git" ]; then
    git -C "$CLONE_DIR" fetch origin "$KATAPROXY_BRANCH"
    git -C "$CLONE_DIR" checkout "$KATAPROXY_BRANCH"
    git -C "$CLONE_DIR" reset --hard "origin/$KATAPROXY_BRANCH"
else
    git clone --branch "$KATAPROXY_BRANCH" --single-branch "$KATAPROXY_REPO_URL" "$CLONE_DIR"
fi
PROXY_SHA="$(git -C "$CLONE_DIR" rev-parse HEAD)"
echo "build-proxy-sidecar: freezing KataProxy @ $KATAPROXY_BRANCH ($PROXY_SHA)"

if [ ! -d "$VENV_DIR" ]; then
    echo "build-proxy-sidecar: creating venv at $VENV_DIR"
    python3.13 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --quiet --upgrade pip
# KataProxy's own runtime dependencies (asteval, numpy, scipy, websockets,
# sgfmill, sortedcontainers — proxy/pyproject.toml's [project].dependencies).
pip install --quiet "$CLONE_DIR"
pip install --quiet pyinstaller

# Build + install the optional compiled transposition-detector extension.
# PEP 517 build (meson-python backend, proxy/goboard_transposition/pyproject.toml)
# — this both compiles gobackend.cpp into the go_transposition native module
# AND installs it into this venv's site-packages, making it importable for
# the freeze below. Requires meson + ninja + a C++20 compiler on PATH (venv
# activation only prepends venv/bin; system meson/ninja/g++ remain reachable).
pip install --quiet "$CLONE_DIR/goboard_transposition"
python3 -c "import go_transposition; print('build-proxy-sidecar: go_transposition importable:', go_transposition.__file__)"

TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
if [ -z "$TARGET_TRIPLE" ]; then
    echo "build-proxy-sidecar: could not determine rustc host target triple (rustc not on PATH?)" >&2
    exit 1
fi

cd "$CLONE_DIR"
PROXY_SRC_DIR="$CLONE_DIR" pyinstaller --noconfirm --clean \
    "$SRC_TAURI_DIR/packaging/lengyue-proxy.spec"

mkdir -p "$SRC_TAURI_DIR/binaries"
DEST="$SRC_TAURI_DIR/binaries/lengyue-proxy-$TARGET_TRIPLE"
cp "$CLONE_DIR/dist/lengyue-proxy" "$DEST"
chmod +x "$DEST"

echo "build-proxy-sidecar: sidecar built at $DEST (KataProxy $KATAPROXY_BRANCH @ $PROXY_SHA)"
