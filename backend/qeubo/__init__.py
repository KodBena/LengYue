"""
qEUBO integration package for LengYue.

This package is MIT-licensed. See LICENSE in this directory for the full
text. The boundary is by directory: everything under `backend/qeubo/`
(both `vendor/` and `runtime/`) is MIT; everything outside this directory
that imports from it must do so against the published API contract in
`backend/qeubo/README.md`, not against the source files in this package.

The `vendor/` subdirectory is the upstream qEUBO library copied verbatim;
its internal modules use `from src.X import Y` style imports (the
upstream's package layout), so we put `vendor/` on `sys.path` here to
let those resolve. Importing this package is the only public side-effect
that registers the path; importing `qeubo.runtime` directly (without
going through this `__init__`) would fail to satisfy the upstream's
internal references.

License: MIT — see LICENSE
"""

import sys
from pathlib import Path

_VENDOR_PATH = str(Path(__file__).parent / "vendor")
if _VENDOR_PATH not in sys.path:
    sys.path.insert(0, _VENDOR_PATH)

# Public API surface — re-exported here so callers do `from qeubo import X`
# rather than reaching into runtime submodules. The route handlers
# (public-domain code in `backend/api/routes/`) read only this surface
# plus the README; they do not read `runtime/*.py`.
from .runtime.service import ExperimentService  # noqa: E402
from .runtime.storage import ExperimentStorage  # noqa: E402

__all__ = ["ExperimentService", "ExperimentStorage"]
