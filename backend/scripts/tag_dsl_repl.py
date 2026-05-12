"""
backend/scripts/tag_dsl_repl.py

Tag-DSL playground REPL — interactive shell for experimenting
with the tag DSL against a live database. Reads `DATABASE_URI`
from the environment (defaulting to the same local SQLite path
`backend/core/config.py` uses), connects, and offers an
expression-at-a-time evaluation loop with a **persistent
session**: definitions you type stay defined for subsequent
queries until you `:reset`.

Each input line is **transactional**: if anything in the line
fails (cap violation, unknown ref, syntax error), the session's
definitions roll back to their pre-line state. A failed input has
no side effects on what's stored.

Per query the REPL shows:

  - The substituted virtual-tag definitions stored on the session
    (pretty-printed back to tag-DSL syntax).
  - The DNF the macro expander produces (the per-conjunction
    `{pos, neg}` shape the SQL emitter consumes).
  - Optionally (with --verbose), the compiled SQL with the
    tenancy wrapper applied.
  - The matched card count and a sample of IDs.

Usage:

    # Interactive REPL against the default SQLite database.
    venv/bin/python scripts/tag_dsl_repl.py

    # One-off query (no persistent session).
    venv/bin/python scripts/tag_dsl_repl.py \
        --expr '$tactic :- punish;fight;sabaki. $tactic, ~volatile'

    # Against a Postgres database, with a different tenant.
    DATABASE_URI="postgresql+asyncpg://user@host/db" \
    venv/bin/python scripts/tag_dsl_repl.py --user-id 42

Cap violations and grammar errors surface as `PipelineDSLError`
messages without exiting the REPL. The full grammar reference
lives at `backend/docs/tag-dsl.md`; type `?` inside the REPL for
a compact summary.

License: Public Domain (The Unlicense)
"""
import argparse
import asyncio
import os
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

# Enable imports rooted at backend/ when run as a script.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, union  # noqa: E402
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

REPL session — definitions accumulate across lines until :reset.
A failed line is rolled back (definitions unchanged on error).

REPL commands:

    ?  or  :help        this message
    :defs               list stored definitions
    :reset              clear all stored definitions
    :quit  or  :exit    exit the REPL (Ctrl-D also works)

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
# Statement classification.
# ---------------------------------------------------------------------------

# A statement is a definition iff it starts (after optional whitespace) with
# `$ident :-`. Otherwise it's treated as a query expression. The pattern
# captures the identifier so callers don't need to re-parse it.
_DEFINITION_RE = re.compile(r"^\s*\$(\w+)\s*:-")


def is_definition(statement: str) -> bool:
    return _DEFINITION_RE.match(statement) is not None


def definition_name(statement: str) -> str:
    """Extract the `$name` identifier from a definition statement.

    Caller must already have established that `is_definition(statement)`
    is True — passing a non-definition raises AttributeError, which is
    a programmer error rather than a user-facing failure mode.
    """
    return _DEFINITION_RE.match(statement).group(1)


# ---------------------------------------------------------------------------
# Synchronous core — parse + store + classify. The async wrapper handles
# transactional rollback and SQL execution around this.
# ---------------------------------------------------------------------------


def parse_and_store_defs(
    compiler: TagDSLCompiler,
    line: str,
) -> Tuple[List[str], Optional[Disj], Optional[str]]:
    """Parse `line` against `compiler`'s persistent definitions.

    Splits on `.`; classifies each statement as definition or query;
    stores any definitions onto `compiler.definitions` (mutates); if
    the final statement is a query, parses it to a `Disj` and returns
    it for the async wrapper to execute. Caps and unknown-reference
    errors raise `PipelineDSLError` — the caller is responsible for
    rolling back `compiler.definitions` to its pre-call state.

    A non-final statement that is not a definition is itself a
    grammar error (definitions must precede the query in the chain).

    Returns
    -------
    (output_lines, query_disj, query_text)
        `output_lines` — the per-definition "Defined $name :- body"
            lines, in storage order.
        `query_disj` — the parsed query `Disj`, or None if the line
            contained only definitions.
        `query_text` — the textual form of the query statement
            (passed through for display purposes), or None if no
            query.
    """
    statements = compiler._split_statements(line)
    if not statements:
        return ([], None, None)

    new_defs: List[str] = []
    query_stmt: Optional[str] = None
    for i, stmt in enumerate(statements):
        if is_definition(stmt):
            new_defs.append(stmt)
        else:
            if i < len(statements) - 1:
                raise PipelineDSLError(
                    f"Statement {i + 1} ({stmt!r}) is not a definition "
                    f"but is followed by more statements; definitions "
                    f"must precede the final query"
                )
            query_stmt = stmt

    output_lines: List[str] = []
    for defn in new_defs:
        name = definition_name(defn)
        compiler._parse_definition(defn)
        body = compiler.definitions[name]
        output_lines.append(f"Defined ${name} :- {format_disj(body)}")

    query_disj: Optional[Disj] = None
    if query_stmt is not None:
        query_disj = compiler._parse_query(query_stmt)

    return (output_lines, query_disj, query_stmt)


# ---------------------------------------------------------------------------
# Command dispatch — colon-prefixed REPL commands.
# ---------------------------------------------------------------------------


def is_command(line: str) -> bool:
    """A REPL command is `?` or any input starting with `:`."""
    stripped = line.strip()
    return stripped == "?" or stripped.startswith(":")


def run_command(compiler: TagDSLCompiler, command: str) -> bool:
    """Execute a REPL command. Returns True iff exit was requested.

    Commands recognised:
      `?`, `:help`        — print HELP_TEXT.
      `:defs`             — list stored definitions.
      `:reset`            — clear stored definitions (idempotent).
      `:quit`, `:exit`    — request exit.

    Any other `:`-prefixed input is reported as unknown.
    """
    cmd = command.strip()
    if cmd in {"?", ":help"}:
        print(HELP_TEXT)
        return False
    if cmd == ":defs":
        if not compiler.definitions:
            print("(no definitions stored)")
        else:
            print("Stored definitions:")
            for name, body in compiler.definitions.items():
                print(f"  ${name} :- {format_disj(body)}")
        return False
    if cmd == ":reset":
        n = len(compiler.definitions)
        compiler.definitions.clear()
        print(f"Cleared {n} definition(s).")
        return False
    if cmd in {":quit", ":exit"}:
        return True
    print(f"Unknown command: {cmd!r}. Type '?' for help.")
    return False


# ---------------------------------------------------------------------------
# Asynchronous query execution + the orchestrator.
# ---------------------------------------------------------------------------


async def execute_and_print_query(
    session,
    compiler: TagDSLCompiler,
    query_disj: Disj,
    query_text: str,
    user_id: int,
    verbose: bool,
) -> None:
    """Expand the query Disj to DNF (M-cap fires here if applicable),
    emit SQL via the compiler's `_conjunction_to_sql`, wrap with the
    tenancy filter, and execute against `session`. Prints DNF,
    optionally the SQL, then the matched count and a sample of IDs.
    Raises `PipelineDSLError` on cap violation (caller handles).
    """
    dnf = compiler._expand_to_dnf(query_disj)
    print(f"Query: {query_text}")
    print(f"DNF: {len(dnf)} conjunction(s)")
    for entry in dnf:
        print(f"  {format_dnf_dict(entry)}")

    subqueries = [compiler._conjunction_to_sql(entry) for entry in dnf]
    if not subqueries:
        # Defensive: should be unreachable for non-empty DNF.
        print("(no SQL emitted — zero conjunctions)")
        return

    inner = subqueries[0] if len(subqueries) == 1 else union(*subqueries)
    wrapped = (
        select(card.c.id)
        .where(card.c.id.in_(inner))
        .where(card.c.user_id == user_id)
    )

    if verbose:
        try:
            sql_text = str(wrapped.compile(compile_kwargs={"literal_binds": True}))
        except Exception as exc:
            print(f"  (could not render SQL: {exc})")
        else:
            print("SQL:")
            for ln in sql_text.splitlines():
                print(f"  {ln}")

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


async def handle_input(
    session,
    compiler: TagDSLCompiler,
    line: str,
    user_id: int,
    verbose: bool,
) -> bool:
    """Process one REPL input line. Returns True iff exit was
    requested. Mutates `compiler.definitions` on success; rolls back
    to pre-call state if any phase raises `PipelineDSLError`.

    The transactional contract holds across both the parse / store
    phase and the query-expansion phase (where the M cap fires). It
    does NOT hold for SQL-execution errors — by that point all
    definitions and the query were valid; an execution-time database
    error is a separate concern and leaves the session state intact.
    """
    stripped = line.strip()
    if not stripped:
        return False

    if is_command(stripped):
        return run_command(compiler, stripped)

    prev_defs = dict(compiler.definitions)
    try:
        def_output, query_disj, query_text = parse_and_store_defs(compiler, stripped)
    except PipelineDSLError as exc:
        compiler.definitions = prev_defs
        print(f"PipelineDSLError: {exc}")
        return False

    for ln in def_output:
        print(ln)

    if query_disj is None:
        return False

    try:
        await execute_and_print_query(
            session, compiler, query_disj, query_text, user_id, verbose
        )
    except PipelineDSLError as exc:
        # The DNF distribution (M cap) ran during query execution; if it
        # raised, the line is invalid as a whole — roll back the defs
        # too, since they're tied to a failed line.
        compiler.definitions = prev_defs
        print(f"PipelineDSLError: {exc}")
        return False

    return False


# ---------------------------------------------------------------------------
# REPL loop.
# ---------------------------------------------------------------------------


async def repl(session_maker, user_id: int, verbose: bool) -> None:
    print("Tag-DSL REPL. Type a tag expression and press Enter.")
    print(f"  user_id = {user_id}, verbose = {verbose}")
    print(
        "  '?' for grammar reference, ':defs' to list, ':reset' to clear, "
        "':quit' or Ctrl-D to exit."
    )

    compiler = TagDSLCompiler()
    while True:
        try:
            line = input("\n> ")
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line.strip():
            continue

        async with session_maker() as session:
            exit_requested = await handle_input(
                session, compiler, line, user_id, verbose
            )
        if exit_requested:
            return


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


async def amain() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Interactive REPL for the tag DSL. Compiles and executes "
            "tag-DSL expressions against a live database, with a "
            "persistent session across lines."
        ),
    )
    parser.add_argument(
        "--expr",
        help=(
            "Execute a single expression and exit, instead of starting "
            "the REPL. No persistent session (one-shot)."
        ),
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
            compiler = TagDSLCompiler()
            async with session_maker() as session:
                await handle_input(session, compiler, args.expr, args.user_id, args.verbose)
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
