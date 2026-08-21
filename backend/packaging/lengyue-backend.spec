# backend/packaging/lengyue-backend.spec
#
# PyInstaller spec that freezes the FastAPI backend into a single
# self-contained onefile executable — the Tauri desktop shell's backend
# sidecar (see `frontend/src-tauri/src/lib.rs`). Build with:
#
#   cd backend && pyinstaller packaging/lengyue-backend.spec
#
# from a venv with `requirements.txt` (NOT `requirements-qeubo.txt` —
# qEUBO's torch/botorch/gpytorch stack is a researcher opt-in, gated
# behind QEUBO_ENABLED=False by default, and deliberately excluded from
# the frozen v1 sidecar per the desktop-distribution charter) and
# `pyinstaller` installed. Output lands at `dist/lengyue-backend`
# (single executable, no `_internal/` directory — onefile mode).
#
# Two freeze pitfalls this spec exists to close:
#
# 1. SQLAlchemy's dialect and Alembic's command modules are resolved by
#    string/plugin lookup rather than a static top-level `import`, so
#    PyInstaller's bytecode-scanning analysis misses them unless named
#    explicitly in `hiddenimports` below.
# 2. Alembic discovers migration scripts by reading `.py` FILES from
#    `alembic/versions/` at runtime (`ScriptDirectory` execs their
#    source from disk) — they are not imported as Python modules, so
#    `hiddenimports` can't help. They must ship as DATA files at the
#    same relative layout the live `backend/` directory has, so
#    `db.alembic_bootstrap._alembic_config`'s `backend_root`-relative
#    path resolution (`Path(__file__).parent.resolve()` in main.py,
#    which PyInstaller sets to point inside the frozen bundle) finds
#    `alembic.ini` and `alembic/` next to the frozen `main.py`.
#
# License: Public Domain (The Unlicense)
import os

from PyInstaller.utils.hooks import collect_submodules

backend_root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(SPEC)), ".."))

hiddenimports = []
# Pitfall 1: SQLAlchemy dialect plugins (aiosqlite driver resolved by
# URL scheme string, e.g. "sqlite+aiosqlite://") and psycopg's async
# dialect are not seen by static analysis.
hiddenimports += collect_submodules("sqlalchemy.dialects.sqlite")
hiddenimports += collect_submodules("sqlalchemy.dialects.postgresql")
hiddenimports += ["aiosqlite", "psycopg", "psycopg_pool"]
# Alembic's `command` module dispatches to `alembic.runtime.*` and
# template resources by attribute lookup at call time, not a static
# top-level import graph PyInstaller's analysis fully resolves.
hiddenimports += collect_submodules("alembic")
# email-validator is imported lazily by pydantic's EmailStr only when
# that type is actually constructed — invisible to static analysis.
hiddenimports += ["email_validator"]
# colorlog is selected by name in core/logging_config.py's formatter
# config, not a static import at module top level.
hiddenimports += ["colorlog"]

datas = [
    (os.path.join(backend_root, "alembic.ini"), "."),
    (os.path.join(backend_root, "alembic"), "alembic"),
]

a = Analysis(
    [os.path.join(backend_root, "main.py")],
    pathex=[backend_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # qEUBO's heavy optional deps (torch/botorch/gpytorch) are not
    # installed in the freeze venv by design (see module docstring
    # above) and are excluded explicitly so a missing-module warning
    # doesn't read as a defect in the freeze.
    excludes=["qeubo", "torch", "botorch", "gpytorch"],
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
    name="lengyue-backend",
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
