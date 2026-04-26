# Ebisu — Spaced-Repetition Service

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

Five Ports (`repositories/ports.py`) declare what the inner layers
need from the outer:

- `CardRepositoryPort` — card reads
- `CardWriteRepositoryPort` — card writes
- `LineageRepositoryPort` — tree fetches
- `TagFilterRepositoryPort` — tag-DSL materialization
- `StatsRepositoryPort` — tag usage + forest members

Each Port returns domain entities or DTOs (`Card`, `CardNode`,
`ForestMemberRow`, etc.), never SQLAlchemy Rows or CTEs. This is
the seam Chess adoption flows through.

The `domain/` package has no SQLAlchemy imports on the production
path — confirmable with:

```bash
python -c "import domain.pipeline; import sys; \
           assert 'sqlalchemy' not in sys.modules"
```

## Running it

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Point at SQLite (default) or Postgres:
export DATABASE_URI="sqlite+aiosqlite:///./ebisu.db"
# or
export DATABASE_URI="postgresql+asyncpg://user@host/db"

# Run the server:
fastapi dev main.py --host 127.0.0.1 --port 8764
```

Schema is created on first run via SQLAlchemy's `metadata.create_all`.
For existing installs, see the migration scripts in `scripts/`.

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
`raw_sgf`) and renamed in item 34a for domain-neutrality. The one
remaining Go-ism at the time of writing is `Card.normalized_sgf` (a
Pydantic field that aliases from `canonical_content` during SELECT);
item 34b will remove this alias in coordination with the frontend's
own field rename. Chess adopters tracking this codebase can ignore
the lingering alias — it's an internal compatibility shim.

### `default_visits`

`Card.default_visits` is a KataGo-specific analysis parameter (number
of Monte Carlo rollouts per position). Other domains can set it to
any sentinel value (1 is fine) and ignore it in their grading logic.
A future cleanup may move it into `grading_parameter` JSON or drop
it from the generic `Card` entity; for now it's a schema column with
a reasonable default.

## Development

- Tests: currently limited; the tree-DSL and tag-DSL semantics have
  coverage, the rest is pending a rewrite against the Port-based
  architecture introduced in Path B (items 30–34).
- Migrations: hand-rolled scripts in `scripts/`. No Alembic yet.
- Schema changes: edit `db/schema.py`, write a migration script
  for existing installs, document in the migration script's
  docstring.

## Status

Path B (the architectural turn) complete through item 34a. The
wire-breaking 34b (field renames on `Card` and `CardCreate`, plus
`default_visits` relocation) is deferred pending coordinated frontend
work. The tenancy spine (items 13–26) is the next major milestone.
