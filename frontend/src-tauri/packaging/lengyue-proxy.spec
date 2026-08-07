# frontend/src-tauri/packaging/lengyue-proxy.spec
#
# PyInstaller spec that freezes KataProxy (the umbrella's `proxy/`
# submodule, an *independent* repository — see the umbrella
# `CLAUDE.md`'s "On the proxy submodule" section) into a single
# self-contained onefile executable: the Tauri desktop shell's SECOND
# sidecar, alongside the existing frozen backend
# (`backend/packaging/lengyue-backend.spec`, the worked precedent this
# file mirrors structurally).
#
# Unlike the backend spec, this one does NOT resolve its source tree
# relative to its own on-disk location (`SPEC`-relative). KataProxy is
# a separate repository with its own release cadence (umbrella
# `CLAUDE.md`: "branch in the proxy repo, PR there, get a tag cut,
# then bump the umbrella's pointer in a separate umbrella-side PR");
# this spec's source tree is a SCRATCH CLONE of that repository at the
# `fable-branch` branch, made fresh by
# `frontend/src-tauri/scripts/build-proxy-sidecar.sh` — never the
# umbrella's own `proxy/` submodule checkout (the umbrella must not
# write into a submodule it does not own the release arc for). The
# scratch clone's path is passed in via the `PROXY_SRC_DIR`
# environment variable rather than derived from `SPEC`, precisely
# because the two trees (this spec file, the source it freezes) do
# not share a repository.
#
# Build with (PROXY_SRC_DIR pointing at the scratch clone):
#
#   PROXY_SRC_DIR=/path/to/scratch/kataproxy-fable \
#     pyinstaller frontend/src-tauri/packaging/lengyue-proxy.spec
#
# (`build-proxy-sidecar.sh` does this for you.) Output lands at
# `dist/lengyue-proxy` (single executable, no `_internal/` directory —
# onefile mode, matching the backend sidecar's shape).
#
# Two freeze considerations, the proxy-specific analog of the backend
# spec's two pitfalls:
#
# 1. **The compiled transposition-detector native extension
#    (`go_transposition`).** `proxy/transformers/transposition_enricher.py`
#    imports it inside a `try/except ImportError` block. PyInstaller's
#    static analysis DOES follow imports inside try/except (it can't
#    know at analysis time whether the import will succeed at
#    runtime), so as long as `go_transposition` is INSTALLED and
#    IMPORTABLE in the venv PyInstaller runs from, its compiled
#    extension module (a `.so` on Linux) is discovered as a binary
#    dependency automatically, the same way any other C-extension
#    dependency (e.g. `numpy`) is. `build-proxy-sidecar.sh` builds and
#    `pip install`s `goboard_transposition/` (a PEP 517 / meson-python
#    build; see its `COMPILATION.md` and `pyproject.toml`) into the
#    freeze venv BEFORE this spec runs, so the module is present and
#    importable at analysis time. `go_transposition` is also named
#    explicitly in `hiddenimports` below as a defence-in-depth
#    measure — belt-and-braces, not strictly required given the
#    try/except analysis behaviour above, but cheap insurance against
#    a PyInstaller version that scans try/except imports more
#    conservatively.
# 2. **KataProxy's own layered-package layout.** Per
#    `proxy/pyproject.toml`'s `[tool.hatch.build.targets.wheel]`
#    comment, the sub-packages (`AbstractProxy`, `katago`,
#    `transformers`, `middleware`, `reactive_pipeline`) are ordinary
#    Python packages with static `import` statements throughout — no
#    Alembic-style runtime file-exec discovery the way the backend's
#    migrations are. PyInstaller's bytecode-scanning analysis handles
#    ordinary imports natively; `collect_submodules()` is used below
#    only as defence-in-depth for any module reached exclusively via
#    dynamic/string dispatch (mirroring the backend spec's posture for
#    SQLAlchemy dialects), not because a specific dynamic-dispatch
#    pitfall was found in this codebase (none was — the ID-namespace
#    dispatch tables in `router.py` and the `Transformer`/`Middleware`
#    composition in `proxy_server.py` are ordinary function calls
#    against already-imported names, not import-by-string).
#
# License: Public Domain (The Unlicense) — this spec file lives in the
# LengYue umbrella repository, not inside the `proxy/` submodule; it
# is not subject to the goboard_transposition/ MIT boundary (see
# proxy/NOTICE), which governs only files inside that subdirectory of
# the KataProxy repository itself.
import os

from PyInstaller.utils.hooks import collect_submodules

try:
    proxy_root = os.environ["PROXY_SRC_DIR"]
except KeyError as exc:
    raise SystemExit(
        "lengyue-proxy.spec: PROXY_SRC_DIR is not set. This spec freezes "
        "a SCRATCH CLONE of the KataProxy repository (fable-branch), not "
        "the umbrella's proxy/ submodule checkout — point PROXY_SRC_DIR "
        "at that clone's root (the directory containing proxy_server.py) "
        "before invoking pyinstaller. See build-proxy-sidecar.sh."
    ) from exc

hiddenimports = []
hiddenimports += collect_submodules("AbstractProxy")
hiddenimports += collect_submodules("katago")
hiddenimports += collect_submodules("transformers")
hiddenimports += collect_submodules("middleware")
hiddenimports += collect_submodules("reactive_pipeline")
# The compiled transposition-detector native extension — see note 1
# above. Present only if build-proxy-sidecar.sh's goboard_transposition
# install step ran before this spec; the enrichment transformer itself
# tolerates its absence at runtime (transposition_enricher.py's
# try/except), but the desktop-package commission's required default
# is "transposition detector ENABLED", which is only true when this
# module is bundled.
hiddenimports += ["go_transposition"]
# lightgbm (the optional Phase 3.5 learned-value-function extra,
# `proxy/pyproject.toml`'s `[project.optional-dependencies].learned-vf`)
# is deliberately NOT installed in the freeze venv and is excluded
# below — same "researcher opt-in, excluded from the frozen v1
# sidecar" posture the backend spec applies to qEUBO.

a = Analysis(
    [os.path.join(proxy_root, "proxy_server.py")],
    pathex=[proxy_root],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["lightgbm"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="lengyue-proxy",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
