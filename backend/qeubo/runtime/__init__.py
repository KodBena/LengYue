"""
qEUBO runtime — LLM-derived wrapper around the vendored upstream library.

This module is MIT-derivative: it was adapted from the user's prototype
at `~/preference_optimizer/qEUBO/wss3/{service,storage}.py`, which itself
was authored by an LLM with full visibility into qEUBO source. Anything
in this directory inherits the MIT license that covers the wider
`backend/qeubo/` package.

Public API consumers should import from `qeubo` (the package), not from
this submodule directly. The package's `__init__.py` is responsible for
the sys.path setup that makes the vendored library's internal imports
work.

License: MIT — see ../LICENSE
"""
