"""
domain/tag_dsl.py

Tag-DSL facade — preserves the historical
`from domain.tag_dsl import TagDSLCompiler` import path after the
arc 1 file split. The class itself now lives in
`repositories/tag_dsl_sql.py` (the SQL-emission half); the parser,
dereferencer, and DNF normaliser live in
`domain/tag_dsl_grammar.py` (the pure half).

Before arc 1 of the tag-DSL macro-language work, this file held
the full `TagDSLCompiler` class — parser, dereferencer, DNF
expansion, and SQL emission — with direct `sqlalchemy` and
`db.schema` imports inside `domain/`. The colocation violated the
Dependency Rule and had been carried as a rough-edge entry in
`docs/notes/reflection.md` since the pre-release sweep. Arc 1
splits the file along the import boundary: the pure half stays in
`domain/`, the SQLAlchemy half moves to `repositories/`. This
facade preserves the public import surface so the refactor is
bit-equal at every existing call site.

No SQLAlchemy import statements remain in this file. The transitive
load of SQLAlchemy still happens — `TagDSLCompiler` is defined in
`repositories.tag_dsl_sql` which imports SQLAlchemy — but the
import edge is now an explicit cross-layer reach for surface
preservation rather than direct domain-layer SQL machinery.

License: Public Domain (The Unlicense)
"""
from repositories.tag_dsl_sql import TagDSLCompiler

__all__ = ["TagDSLCompiler"]
