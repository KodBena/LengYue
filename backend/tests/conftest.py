"""
Root conftest.py

Inserts the project root directory onto sys.path so that all test modules can
use bare imports like `from domain.tree_engine import ...` without any
packaging setup.  This file must live at the same level as the `tests/`
directory, adjacent to `domain/`, `db/`, etc.
"""
import sys
import os

# Project root is one directory above this conftest.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
