# Spaced-Repetition Service

A FastAPI service implementing the Ebisu Bayesian spaced-repetition
algorithm, designed as the persistence and scoring backbone for
tree-structured study material (game trees, opening variations,
proof trees). Originally built around Go / KataGo; architected so
that swapping the domain (Chess, Shogi, music theory, math proofs)
touches a short list of well-defined seams rather than a grep.

Public-domain. No dependencies on proprietary code paths.

## Architecture at a glance

The codebase follows Clean / Hexagonal Architecture. The Dependency
Rule is enforceable by import-graph inspection: inner layers don't
import from outer ones.

```
    ┌─────────────────────────────────────────────────────────┐
    │  api/  — delivery layer (FastAPI routes, DI composition)│
    ├─────────────────────────────────────────────────────────┤
    │  services/  — pure use cases (CardService, ReviewService,│
    │               StatsService)                              │
    │  domain/    — pure entities & logic (Card, PipelineExecutor,
    │               typed DSL, Bayesian recall computation)    │
    ├─────────────────────────────────────────────────────────┤
    │  repositories/  — SQLAlchemy adapters; implement Ports  │
    │  db/            — schema (Tables, Indexes)              │
    │  core/          — cross-cutting (config, logging,        │
    │                   database lifecycle, Ebisu math)        │
    └─────────────────────────────────────────────────────────┘
```

Six Ports declare what the inner layers need from the outer — five
database-backed Ports in `repositories/ports.py`, plus the resource
Port in `domain/resource.py`:

- `CardRepositoryPort` — card reads
- `CardWriteRepositoryPort` — card writes
- `LineageRepositoryPort` — tree fetches
- `TagFilterRepositoryPort` — tag-DSL materialization
- `StatsRepositoryPort` — tag usage + forest members
- `StaticResourceRepositoryPort` — deployment-bundled JSON resources

Each Port returns domain entities or DTOs (`Card`, `CardNode`,
`ForestMemberRow`, etc.), never SQLAlchemy Rows or CTEs. This is
the seam Chess adoption flows through.

The `domain/` package has no SQLAlchemy imports on the production
path — confirmable with:

```bash
python -c "import domain.pipeline; import sys; \
           assert 'sqlalchemy' not in sys.modules"
```

## Tenancy

The service is **multi-tenant capable in its data model and access
control, but transparent single-user in its default UX.** Every
domain object the user authors (`card`, `card_source`, `card_tag`,
`game_source`, `documents`) is tenant-scoped by a `user_id` foreign
key; every read path filters on the JWT-derived `user_id` via the
WHERE-clause-fusion pattern that gives the codebase its 404-not-403
invariant. Intrinsically global reference data (`users`,
`normalized_position`, `tag`) is shared.

The single switch that flips between the two operating modes is
`ALLOW_PASSWORDLESS_LOGIN` in `core/config.py`:

- **`ALLOW_PASSWORDLESS_LOGIN=True` (default — transparent local
  install).** The `auth/token` endpoint auto-provisions a `local_user`
  row on first request to an empty users table and issues a JWT for
  that user without a password. The tenancy spine is dormant but
  correct: all data lives under `user_id=1`, behavior is
  indistinguishable from a pre-tenancy single-user system.
- **`ALLOW_PASSWORDLESS_LOGIN=False` (multi-tenant deployment).**
  Operators provision real `users` rows; users authenticate with
  username + bcrypt-hashed password. The tenancy spine is unchanged
  by the flag — every tenant-scoped read and write filters on
  `user_id` regardless of which mode is active.

The system-level architectural reference is `docs/notes/tenancy.md`,
which documents the 404-not-403 invariant, the five-layer threading
discipline (route → service → Port → adapter → schema), the
defense-in-depth pattern for recursive-CTE filtering, the limits the
spine doesn't yet handle (no row-level audit log; no tenant deletion
path; no per-tenant rate limiting), and the operator pre-flight
checklist for going multi-tenant.

## Running it

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Point at SQLite (default) or Postgres:
export DATABASE_URI="sqlite+aiosqlite:///./cards.db"
# or
export DATABASE_URI="postgresql+asyncpg://user@host/db"

# Run the server:
fastapi dev main.py --host 127.0.0.1 --port 8764
```

Schema is created on first run via SQLAlchemy's `metadata.create_all`.
For existing installs, see the migration scripts in `scripts/`.

### Loading a populated sample workspace (optional)

A fresh install starts with an empty database — the SPA's database
tab is blank until the user imports SGFs. To explore the
application with example content already in place, load the
shipped sample:

```bash
python backend/scripts/load_sample.py
```

This copies `backend/samples/cards.sample.db` to `backend/cards.db`
(refuses to clobber an existing `cards.db` unless `--force` is
passed). The sample is a single-user, anonymized snapshot — see
`backend/samples/README.md` for what's in it and
`backend/scripts/make_sample_db.py` for how to regenerate it from
a personal workspace.

## Adopting for another domain

The codebase is structured so that a Chess, Shogi, or arbitrary-other-
domain adoption requires touching a known set of files. The rest of
the machinery — Bayesian recall scoring, typed pipeline DSL, tree-
lineage queries, stats aggregation — is domain-agnostic and doesn't
move.

### What the "domain" is

In Ebisu terms, a domain provides three things:

1. **Raw content**: the string the user enters (an SGF for Go, a PGN
   for Chess, a LilyPond snippet for music, etc.).
2. **A normalizer**: a pure function that turns raw content into a
   canonical form plus a cryptographic hash. Used for deduplication
   and for detecting "the same position from different imports."
3. **A move count**: the integer `num_moves` the Ebisu engine uses
   for geometric discounting of successes across a card's review.

The canonical form and hash are stored in the `normalized_position`
table. The raw content is preserved separately on `game_source` for
audit purposes. The move count lives on `card`.

### The four seams

A Chess adoption touches these four files and only these four:

#### 1. Write a `PgnNormalizer` (new file under `domain/`)

`domain/normalizer.py::PositionNormalizerPort` is the contract. Any
class whose `normalize(raw_content: str) -> NormalizedPosition` method
satisfies the Protocol can back the Port.

```python
# domain/pgn_normalizer.py  (sketch)
import hashlib
from domain.normalizer import NormalizedPosition, PositionNormalizerPort

class PgnNormalizer:
    def normalize(self, raw_content: str) -> NormalizedPosition:
        # 1. Parse the PGN.
        # 2. Strip annotations, collapse to the main line, normalize
        #    move representation (e.g., always SAN, always spaces).
        # 3. Hash the canonical form for dedup.
        canonical = _canonicalize_pgn(raw_content)
        return NormalizedPosition(
            canonical_content=canonical,
            content_hash=hashlib.sha256(canonical.encode()).digest(),
            metadata={
                "white": _extract_header(raw_content, "White"),
                "black": _extract_header(raw_content, "Black"),
                "date":  _extract_header(raw_content, "Date"),
            },
        )
```

#### 2. Swap it in DI (`api/dependencies.py`)

One line changes: `get_position_normalizer` returns a `PgnNormalizer`
instead of an `SgfNormalizer`. The signature of the factory (and the
Port it returns) is unchanged.

```python
# api/dependencies.py
async def get_position_normalizer() -> PositionNormalizerPort:
    return PgnNormalizer()   # was: SgfNormalizer()
```

Everything downstream — `CardService`, the routes, the services
injected via `Depends` — sees only the Port, so no other file in
`api/` changes.

#### 3. Set sensible Ebisu defaults (`core/config.py`)

The Ebisu engine is domain-neutral, but its defaults were picked for
Go positions:

- `EBISU_TIME_UNIT = 14400.0` (4 hours). Appropriate for positions
  reviewed on the scale of hours to days. Longer for weekly study,
  shorter for intense sessions.
- `EBISU_DEFAULT_MODEL = (3.0, 3.0, 1.0)`. The α, β, t of a fresh card.
  The interpretation is "an initial belief of 50% recall after 1 time
  unit, with moderate uncertainty." Tune if your domain's observed
  recall curves are visibly different.

These are scalar config values, not code. A `.env` file is sufficient.

#### 4. Domain-specific grading (`services/review_service.py` —
     optional)

`ReviewService.process_review` handles Ebisu scoring. It reads
`card.grading_parameter` (a JSON blob) for per-card configuration
like `gamma` (the geometric discount factor). If your domain has its
own grading input (e.g., Chess engine evaluation in centipawns rather
than a 0–1 score), you extend the grading logic here. Most domains
can leave this file untouched and just set grading parameters in
`grading_parameter` at card creation.

### What does NOT change

None of these touch domain adoption:

- The typed pipeline DSL (`domain/pipeline_dsl.py`) — 17 ordering
  keys, 8 selection types, 4 stage types. All domain-agnostic.
- The tree-lineage queries (`repositories/lineage_repository.py`) —
  operates on `card_source` relationships, which are parent/child
  pointers agnostic to what a card represents.
- The tag DSL (`domain/tag_dsl.py`) — tags are free-form strings
  with virtual-tag expansion; domain-specific tag vocabularies are
  a matter of user convention, not code.
- The stats aggregation (`services/stats_service.py`) — per-forest
  totals and average Bayesian recall. Same math for any domain.
- The JWT auth layer, the CORS handling, the documents sync service —
  all user-facing, not domain-facing.

### Field names

The codebase uses generic names at the schema and DTO level:

- `normalized_position.canonical_content` — the canonical form
- `normalized_position.content_hash` — the dedup hash
- `game_source.raw_content` — the user-supplied original

These were named for Go originally (`normalized_sgf`, `pos_hash`,
`raw_sgf`) and renamed in item 34a for domain-neutrality. The wire
rename followed in item 34b — the `Card` Pydantic model and
`CardCreate` request schema now use the generic names directly with
no Go-flavored aliases on the read or write surface. A Chess
adopter sees no Go-isms in the schema or wire shape.

### `default_visits`

`default_visits` (a KataGo-specific analysis parameter — number of
Monte Carlo rollouts per position) lives in `grading_parameter.data`
on each `Card`, alongside any other per-card analysis-runtime knobs
the application chooses to carry. It was previously a top-level
schema column; item 34b relocated it into the per-card JSON blob
during the domain-neutralization sweep, so adopters of other domains
carry no Go-isms in their schema. Domains that don't need a
`default_visits` analog simply leave the JSON key out.

## Development

- Tests: currently limited; the tree-DSL and tag-DSL semantics have
  coverage, the rest is pending a rewrite against the Port-based
  architecture introduced in Path B (items 30–34).
- Migrations: hand-rolled scripts in `scripts/`. No Alembic yet.
- Schema changes: edit `db/schema.py`, write a migration script
  for existing installs, document in the migration script's
  docstring.

## Status

Path B (the architectural turn) is complete. The domain-agnostic
core landed via items 34/34a/34b — schema renames (`pos_hash` →
`content_hash`, `normalized_sgf` → `canonical_content`), the wire
rename, and the `default_visits` relocation into
`grading_parameter`. The tenancy spine (items 13–25) is shipped
end-to-end; this README's `Tenancy` section and the in-code
docstrings that point back at `docs/notes/tenancy.md` close item 26
(the documentation half of the spine), which is the seventh and
final piece of the locked release scope's tenancy work.
