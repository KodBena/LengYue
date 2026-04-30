"""
Copy the shipped sample database into place as the live cards.db.

The umbrella ships `backend/samples/cards.sample.db` as a populated
single-user workspace so first-time users can see the application
with real content rather than an empty database. This script is the
opt-in mechanism: it copies the sample into the location the backend
reads at startup (`backend/cards.db` by default).

Per ADR-0002 (fail loudly), the script:

- Fails with a clear message if the sample isn't where it expects.
- Refuses to clobber an existing live database unless `--force` is
  passed. The default behaviour is "no surprises" — if you already
  have a `cards.db`, the script tells you and exits non-zero.

The sample's `local_user` row is passwordless, matching the
ALLOW_PASSWORDLESS_LOGIN local-install default. The frontend's
`ensureAuthenticated` flow logs in as that row at first bootstrap.

Usage
-----
    # First-time use (no existing cards.db):
    python scripts/load_sample.py

    # Replace an existing cards.db (ARCHIVES the existing one to
    # `cards.db.bak.<timestamp>` first):
    python scripts/load_sample.py --force

    # Custom paths (rare):
    python scripts/load_sample.py \\
        --source backend/samples/cards.sample.db \\
        --target backend/cards.db

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


# Resolved relative to this file's location (backend/scripts/) so the
# defaults are correct whether the script is invoked from the umbrella
# root, from backend/, or from anywhere else.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SOURCE = _BACKEND_DIR / "samples" / "cards.sample.db"
_DEFAULT_TARGET = _BACKEND_DIR / "cards.db"


def _backup_path(target: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    return target.with_suffix(f"{target.suffix}.bak.{stamp}")


def load_sample(source: Path, target: Path, force: bool) -> None:
    if not source.exists():
        raise SystemExit(
            f"sample database not found: {source}\n"
            f"the umbrella ships this asset at "
            f"backend/samples/cards.sample.db; if it is missing, "
            f"the working tree is incomplete (did the submodule "
            f"init step run?)"
        )

    if target.exists():
        if not force:
            raise SystemExit(
                f"refusing to clobber existing database at {target}\n"
                f"if you genuinely want to replace it, re-run with "
                f"--force (which moves the existing file to "
                f"{target.name}.bak.<timestamp> before copying the "
                f"sample into place)"
            )
        backup = _backup_path(target)
        print(f"[load_sample] backing up existing database → {backup}")
        target.rename(backup)

    print(f"[load_sample] copying {source} → {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

    size_mb = target.stat().st_size / (1024 * 1024)
    print(
        f"[load_sample] done — {target} is {size_mb:.2f} MB on disk; "
        f"start the backend and the SPA's database tab will show the "
        f"sample workspace"
    )


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "--source",
        type=Path,
        default=_DEFAULT_SOURCE,
        help=f"path to the sample database (default: {_DEFAULT_SOURCE})",
    )
    p.add_argument(
        "--target",
        type=Path,
        default=_DEFAULT_TARGET,
        help=f"path to write the live database (default: {_DEFAULT_TARGET})",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help=(
            "overwrite an existing target database; the existing file is "
            "renamed with a timestamped .bak suffix before the copy"
        ),
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    load_sample(
        source=args.source.resolve(),
        target=args.target.resolve(),
        force=args.force,
    )
    sys.exit(0)
