"""baseline: pre-Alembic state

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-24 13:53:41.530148

The marker revision that establishes the "schema as of the
moment Alembic was introduced" baseline. ``upgrade`` and
``downgrade`` are intentionally no-ops — the schema state this
revision represents is whatever ``db/schema.py`` declared at the
time Alembic landed, materialised via either ``metadata.create_all``
(fresh installs) or the manual ``scripts/migrate_*.py`` runs
(existing installs).

The startup bootstrap in ``main.py``'s lifespan stamps the
``alembic_version`` table at this revision for any pre-Alembic
install that probes consistent with the pre-library schema state
(``game_source.client_game_id`` present, no library columns yet).
From this point forward, every schema change ships as an Alembic
revision and the auto-upgrade in the lifespan handles end-user
deployment without a manual ``scripts/migrate_*.py`` step.

Operator note: existing installs without ``client_game_id``
(running pre-v1.0 code) cannot bootstrap into Alembic via the
probe; the bootstrap fails loudly and points operators at the
prior manual scripts to reach v1.0 baseline first. See
``main.py``'s ``_bootstrap_alembic_version`` for the exact
detection.

License: Public Domain (The Unlicense)
"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op — the baseline state is materialised out of band."""
    pass


def downgrade() -> None:
    """No-op — the baseline has no predecessor to roll back to."""
    pass
