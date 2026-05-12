"""
backend/scripts/tag_dsl_repl.py

Tag-DSL playground REPL — interactive shell for experimenting
with the tag DSL against a live database. Reads `DATABASE_URI`
from the environment (defaulting to the same local SQLite path
`backend/core/config.py` uses), connects, and offers an
expression-at-a-time evaluation loop that shows:

  - The substituted virtual-tag definitions stored by the
    compiler (pretty-printed back to tag-DSL syntax).
  - The DNF the macro expander produces (the per-conjunction
    `{pos, neg}` shape the SQL emitter consumes).
  - Optionally (with --verbose), the compiled SQL with the
    tenancy wrapper applied.
  - The matched card count and a sample of IDs.

Usage:

    # Interactive REPL against the default SQLite database.
    venv/bin/python scripts/tag_dsl_repl.py

    # One-off query.
    venv/bin/python scripts/tag_dsl_repl.py \
        --expr '$tactic :- punish;fight;sabaki. $tactic, ~volatile'

    # Against a Postgres database, with a different tenant.
    DATABASE_URI="postgresql+asyncpg://user@host/db" \
    venv/bin/python scripts/tag_dsl_repl.py --user-id 42

Cap violations and grammar errors surface as `PipelineDSLError`
messages without exiting the REPL. The full grammar reference
lives at `backend/docs/tag-dsl.md`; type `?` inside the REPL
for a compact summary.

License: Public Domain (The Unlicense)
"""
import argparse
import asyncio
import os
import sys
from typing import Any, Dict, Set

# Enable imports rooted at backend/ when run as a script.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from db.schema import card  # noqa: E402
from domain.errors import PipelineDSLError  # noqa: E402
from domain.tag_dsl import TagDSLCompiler  # noqa: E402
from domain.tag_dsl_grammar import Concrete, Conj, Disj, Neg, Virtual  # noqa: E402


DEFAULT_DATABASE_URI = "sqlite+aiosqlite:///./cards.db"


HELP_TEXT = """
Tag-DSL grammar (compact):

    tag           concrete tag
    ~tag          without tag
    a, b          AND (conjunction)
    a; b          OR (disjunction)
    (...)         grouping
    $name         virtual-tag reference
    ~$name        negated virtual-tag (De Morgan applied)
    $name :- body.   definition (statements separated by '.')

Examples:

    joseki, shape
    joseki; opening; moyo
    $opening_themes :- joseki;opening;moyo. $opening_themes, ~volatile
    $tactic :- punish;fight;sabaki. $blocked :- volatile.  \\
        $attack :- $tactic, ~$blocked. $attack

REPL commands:

    ?, help       this message
    quit, exit, Ctrl-D    exit

See backend/docs/tag-dsl.md for the full reference.
"""


# ---------------------------------------------------------------------------
# Pretty-printers — render AST nodes back to tag-DSL syntax for display.
# ---------------------------------------------------------------------------


def format_atom(atom: Any) -> str:
    if isinstance(atom, Concrete):
        return atom.name
    if isinstance(atom, Virtual):
        return f"${atom.name}"
    if isinstance(atom, Neg):
        return f"~{format_atom(atom.term)}"
    if isinstance(atom, Disj):
        return f"({format_disj(atom)})"
    return repr(atom)


def format_conj(c: Conj) -> str:
    if not c.atoms:
        return "(empty)"
    return ", ".join(format_atom(a) for a in c.atoms)


def format_disj(d: Disj) -> str:
    if not d.conjs:
        return "(empty)"
    return "; ".join(format_conj(c) for c in d.conjs)


def format_dnf_dict(entry: Dict[str, Set[str]]) -> str:
    pos = sorted(entry["pos"])
    neg = sorted(entry["neg"])
    parts = list(pos) + [f"~{n}" for n in neg]
    if not parts:
        return "(empty conjunction — matches all cards)"
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Per-expression evaluation.
# ---------------------------------------------------------------------------


async def run_expression(
    session, expression: str, user_id: int, verbose: bool
) -> None:
    """Compile, display, and execute a tag-DSL expression."""
    # Parse the definitions and the query separately so we can show the
    # intermediate state. Each step can raise PipelineDSLError (cap
    # violations, unknown virtuals, malformed grammar) — we surface those
    # without disrupting the REPL loop.
    inspector = TagDSLCompiler()
    try:
        statements = inspector._split_statements(expression)
        if not statements:
            print("(empty expression)")
            return
        for defn in statements[:-1]:
            inspector._parse_definition(defn)
        query_text = statements[-1]
        query_disj = inspector._parse_query(query_text)
        dnf = inspector._expand_to_dnf(query_disj)
    except PipelineDSLError as exc:
        print(f"PipelineDSLError: {exc}")
        return

    if inspector.definitions:
        print("Definitions:")
        for name, body in inspector.definitions.items():
            print(f"  ${name} :- {format_disj(body)}")

    print(f"Query: {query_text}")
    print(f"DNF: {len(dnf)} conjunction(s)")
    for entry in dnf:
        print(f"  {format_dnf_dict(entry)}")

    # Recompile via the public surface to get the SQLAlchemy statement.
    # The M cap fires again here if applicable (the inspector call would
    # already have raised, so reaching here means it's safe).
    try:
        stmt = TagDSLCompiler().compile_to_subquery(expression)
    except PipelineDSLError as exc:
        print(f"PipelineDSLError during SQL compilation: {exc}")
        return

    wrapped = (
        select(card.c.id)
        .where(card.c.id.in_(stmt))
        .where(card.c.user_id == user_id)
    )

    if verbose:
        try:
            sql = str(wrapped.compile(compile_kwargs={"literal_binds": True}))
        except Exception as exc:
            print(f"  (could not render SQL: {exc})")
        else:
            print("SQL:")
            for line in sql.splitlines():
                print(f"  {line}")

    try:
        result = await session.execute(wrapped)
        ids = [row[0] for row in result.fetchall()]
    except Exception as exc:
        print(f"Execution error: {type(exc).__name__}: {exc}")
        return

    print(f"Matched: {len(ids)} card(s) (user_id={user_id})")
    if ids:
        sample = ids[:10]
        more = "" if len(ids) <= 10 else f"  ... ({len(ids) - 10} more)"
        print(f"  IDs: {sample}{more}")


# ---------------------------------------------------------------------------
# REPL loop.
# ---------------------------------------------------------------------------


async def repl(session_maker, user_id: int, verbose: bool) -> None:
    print("Tag-DSL REPL. Type a tag expression and press Enter.")
    print(f"  user_id = {user_id}, verbose = {verbose}")
    print("  '?' for grammar reference, 'quit' or Ctrl-D to exit.")

    while True:
        try:
            line = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line:
            continue
        if line.lower() in {"quit", "exit"}:
            return
        if line in {"?", "help"}:
            print(HELP_TEXT)
            continue

        async with session_maker() as session:
            await run_expression(session, line, user_id, verbose)


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


async def amain() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Interactive REPL for the tag DSL. Compiles and executes "
            "tag-DSL expressions against a live database."
        ),
    )
    parser.add_argument(
        "--expr",
        help="Execute a single expression and exit, instead of starting the REPL.",
    )
    parser.add_argument(
        "--user-id",
        type=int,
        default=int(os.environ.get("TAG_DSL_REPL_USER_ID", "1")),
        help=(
            "Tenancy user_id used to scope the query "
            "(default: env TAG_DSL_REPL_USER_ID or 1)."
        ),
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print the compiled SQL alongside each query result.",
    )
    parser.add_argument(
        "--database-uri",
        default=os.environ.get("DATABASE_URI", DEFAULT_DATABASE_URI),
        help=(
            f"SQLAlchemy async URL for the database "
            f"(default: env DATABASE_URI or {DEFAULT_DATABASE_URI!r})."
        ),
    )
    args = parser.parse_args()

    engine = create_async_engine(args.database_uri)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    try:
        if args.expr is not None:
            async with session_maker() as session:
                await run_expression(session, args.expr, args.user_id, args.verbose)
        else:
            print(f"Database: {args.database_uri}")
            await repl(session_maker, args.user_id, args.verbose)
    finally:
        await engine.dispose()


def main() -> None:
    try:
        asyncio.run(amain())
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
