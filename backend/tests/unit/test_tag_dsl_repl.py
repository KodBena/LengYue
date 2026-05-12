"""
tests/unit/test_tag_dsl_repl.py
================================
Tier 1 — Pure Python Unit Tests for the tag-DSL REPL playground
(`backend/scripts/tag_dsl_repl.py`).

No database. No async (except the orchestrator helper, which runs
against a hand-rolled fake session in the few tests that need to
reach it). The REPL's SQL-execution branch is exercised by the
existing tier-2 integration suite and the `--expr` smoke; what
these tests pin is the REPL's own semantics — statement
classification, session persistence, per-line transactional
rollback, command dispatch — and the pretty-printers that render
AST nodes back to tag-DSL syntax.

Strategy
--------
The script lives under `backend/scripts/`, which isn't on
`sys.path` by default; we import via `importlib.util` against the
file path. This mirrors how a user would invoke the script and
keeps the tests independent of `sys.path` manipulation in the
script itself.

Test surface
------------
1. **Pretty-printers** — `format_atom` / `format_conj` /
   `format_disj` / `format_dnf_dict`. Pure functions, exhaustive
   per AST node kind.
2. **Statement classification** — `is_definition`,
   `definition_name`. Definition vs query, whitespace edges,
   syntactically-valid-but-semantically-invalid inputs.
3. **Command dispatch** — `is_command`, `run_command`. Each
   command, plus the unknown-command path.
4. **Parse + store** — `parse_and_store_defs`. Definitions
   accumulate; queries return a Disj; mixed inputs work.
5. **Session persistence** — calling the synchronous helper
   multiple times against the same compiler accumulates state.
6. **Transactional rollback** — `handle_input` (async) with a
   fake session, asserting that a failed line leaves
   `compiler.definitions` unchanged.
7. **Regression for the surfaced bug** — `$x :- joseki.` alone
   stores `$x` instead of failing with "Unexpected character ':'".
"""
import importlib.util
import os
import sys
from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest

from domain.errors import PipelineDSLError
from domain.tag_dsl import TagDSLCompiler
from domain.tag_dsl_grammar import Concrete, Conj, Disj, Neg, Virtual


pytestmark = pytest.mark.unit


# ─── Module loader ────────────────────────────────────────────────────────────


def _load_repl_module():
    """Import `backend/scripts/tag_dsl_repl.py` from its file path.

    The script lives outside the regular import tree, so we load it
    explicitly. Cached by Python's import system after the first call.
    """
    if "tag_dsl_repl" in sys.modules:
        return sys.modules["tag_dsl_repl"]
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    repl_path = os.path.join(repo_root, "scripts", "tag_dsl_repl.py")
    spec = importlib.util.spec_from_file_location("tag_dsl_repl", repl_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["tag_dsl_repl"] = module
    spec.loader.exec_module(module)
    return module


repl = _load_repl_module()


# ─── AST helpers ──────────────────────────────────────────────────────────────


def _concrete(name: str) -> Concrete:
    return Concrete(name=name)


def _virtual(name: str) -> Virtual:
    return Virtual(name=name)


def _neg(term) -> Neg:
    return Neg(term=term)


def _conj(*atoms) -> Conj:
    return Conj(atoms=tuple(atoms))


def _disj(*conjs) -> Disj:
    return Disj(conjs=tuple(conjs))


# ─── Pretty-printers ──────────────────────────────────────────────────────────


class TestFormatAtom:
    def test_concrete(self):
        assert repl.format_atom(_concrete("attack")) == "attack"

    def test_virtual(self):
        assert repl.format_atom(_virtual("x")) == "$x"

    def test_neg_concrete(self):
        assert repl.format_atom(_neg(_concrete("volatile"))) == "~volatile"

    def test_neg_virtual(self):
        assert repl.format_atom(_neg(_virtual("blocked"))) == "~$blocked"

    def test_nested_disj_in_parens(self):
        nested = _disj(_conj(_concrete("a")), _conj(_concrete("b")))
        assert repl.format_atom(nested) == "(a; b)"


class TestFormatConj:
    def test_single_atom(self):
        assert repl.format_conj(_conj(_concrete("a"))) == "a"

    def test_multiple_atoms_comma_joined(self):
        c = _conj(_concrete("a"), _concrete("b"), _neg(_concrete("c")))
        assert repl.format_conj(c) == "a, b, ~c"

    def test_empty_conj(self):
        assert repl.format_conj(_conj()) == "(empty)"


class TestFormatDisj:
    def test_single_conj(self):
        d = _disj(_conj(_concrete("a")))
        assert repl.format_disj(d) == "a"

    def test_multiple_conjs_semicolon_joined(self):
        d = _disj(_conj(_concrete("a")), _conj(_concrete("b"), _concrete("c")))
        assert repl.format_disj(d) == "a; b, c"

    def test_empty_disj(self):
        assert repl.format_disj(_disj()) == "(empty)"


class TestFormatDnfDict:
    def test_pos_only(self):
        entry = {"pos": {"shape", "attack"}, "neg": set()}
        # Output is sorted for determinism.
        assert repl.format_dnf_dict(entry) == "attack, shape"

    def test_neg_only(self):
        entry = {"pos": set(), "neg": {"volatile"}}
        assert repl.format_dnf_dict(entry) == "~volatile"

    def test_pos_and_neg(self):
        entry = {"pos": {"shape"}, "neg": {"volatile", "stale"}}
        assert repl.format_dnf_dict(entry) == "shape, ~stale, ~volatile"

    def test_empty_dict(self):
        entry = {"pos": set(), "neg": set()}
        assert "matches all cards" in repl.format_dnf_dict(entry)


# ─── Statement classification ─────────────────────────────────────────────────


class TestIsDefinition:
    @pytest.mark.parametrize(
        "stmt",
        [
            "$x :- joseki",
            "$opening :- joseki;moyo",
            "  $with_leading_ws :- a",
            "$x :- $y, ~$z",
            "$x:-joseki",  # no whitespace
        ],
    )
    def test_definition_shapes_classify_as_definition(self, stmt):
        assert repl.is_definition(stmt) is True

    @pytest.mark.parametrize(
        "stmt",
        [
            "joseki",
            "joseki, shape",
            "~volatile",
            "$x",  # bare reference, no `:- `
            "$x, $y",
            "(a, b); c",
            "",
        ],
    )
    def test_query_shapes_do_not_classify_as_definition(self, stmt):
        assert repl.is_definition(stmt) is False


class TestDefinitionName:
    def test_extracts_simple_name(self):
        assert repl.definition_name("$x :- joseki") == "x"

    def test_extracts_with_leading_whitespace(self):
        assert repl.definition_name("   $opening_themes :- a") == "opening_themes"

    def test_extracts_with_no_whitespace_after_dollar(self):
        assert repl.definition_name("$x:-joseki") == "x"


# ─── Command dispatch ─────────────────────────────────────────────────────────


class TestIsCommand:
    @pytest.mark.parametrize(
        "line", ["?", ":help", ":defs", ":reset", ":quit", ":exit", ":anything"]
    )
    def test_command_inputs(self, line):
        assert repl.is_command(line) is True

    @pytest.mark.parametrize(
        "line", ["joseki", "$x :- a", "$x", "~volatile", "  joseki  "]
    )
    def test_non_command_inputs(self, line):
        assert repl.is_command(line) is False

    def test_command_with_leading_whitespace(self):
        assert repl.is_command("   :help") is True


class TestRunCommand:
    def test_help_prints_grammar(self, capsys):
        compiler = TagDSLCompiler()
        exit_requested = repl.run_command(compiler, ":help")
        captured = capsys.readouterr().out
        assert "Tag-DSL grammar" in captured
        assert exit_requested is False

    def test_question_mark_is_help_alias(self, capsys):
        compiler = TagDSLCompiler()
        repl.run_command(compiler, "?")
        captured = capsys.readouterr().out
        assert "Tag-DSL grammar" in captured

    def test_defs_empty_session(self, capsys):
        compiler = TagDSLCompiler()
        exit_requested = repl.run_command(compiler, ":defs")
        captured = capsys.readouterr().out
        assert "no definitions stored" in captured
        assert exit_requested is False

    def test_defs_lists_stored_definitions(self, capsys):
        compiler = TagDSLCompiler()
        compiler._parse_definition("$x :- joseki")
        compiler._parse_definition("$y :- $x; shape")
        repl.run_command(compiler, ":defs")
        captured = capsys.readouterr().out
        assert "Stored definitions:" in captured
        assert "$x :- joseki" in captured
        # $y stores the lazy form: $y has a reference to $x.
        assert "$y :- $x; shape" in captured

    def test_reset_empty_session_is_idempotent(self, capsys):
        compiler = TagDSLCompiler()
        exit_requested = repl.run_command(compiler, ":reset")
        captured = capsys.readouterr().out
        assert "Cleared 0 definition(s)" in captured
        assert exit_requested is False
        assert compiler.definitions == {}

    def test_reset_clears_stored_definitions(self, capsys):
        compiler = TagDSLCompiler()
        compiler._parse_definition("$x :- joseki")
        compiler._parse_definition("$y :- shape")
        repl.run_command(compiler, ":reset")
        captured = capsys.readouterr().out
        assert "Cleared 2 definition(s)" in captured
        assert compiler.definitions == {}

    def test_quit_signals_exit(self):
        compiler = TagDSLCompiler()
        assert repl.run_command(compiler, ":quit") is True

    def test_exit_signals_exit(self):
        compiler = TagDSLCompiler()
        assert repl.run_command(compiler, ":exit") is True

    def test_unknown_command_reports_and_continues(self, capsys):
        compiler = TagDSLCompiler()
        exit_requested = repl.run_command(compiler, ":frobnicate")
        captured = capsys.readouterr().out
        assert "Unknown command" in captured
        assert ":frobnicate" in captured
        assert exit_requested is False


# ─── parse_and_store_defs — synchronous core ──────────────────────────────────


class TestParseAndStoreDefs:
    def test_single_definition_stores_and_returns_no_query(self):
        compiler = TagDSLCompiler()
        output, query, query_text = repl.parse_and_store_defs(compiler, "$x :- joseki.")
        assert "x" in compiler.definitions
        assert query is None
        assert query_text is None
        assert output == ["Defined $x :- joseki"]

    def test_multiple_definitions_no_query(self):
        compiler = TagDSLCompiler()
        output, query, _ = repl.parse_and_store_defs(
            compiler, "$x :- joseki. $y :- shape."
        )
        assert set(compiler.definitions.keys()) == {"x", "y"}
        assert query is None
        assert len(output) == 2

    def test_query_only_returns_disj(self):
        compiler = TagDSLCompiler()
        output, query, query_text = repl.parse_and_store_defs(compiler, "joseki, shape")
        assert compiler.definitions == {}
        assert query is not None
        assert query_text == "joseki, shape"
        assert output == []

    def test_def_plus_query_stores_and_returns_disj(self):
        compiler = TagDSLCompiler()
        output, query, query_text = repl.parse_and_store_defs(
            compiler, "$x :- joseki. $x, ~volatile"
        )
        assert "x" in compiler.definitions
        assert query is not None
        assert query_text == "$x, ~volatile"
        assert output == ["Defined $x :- joseki"]

    def test_empty_input_returns_no_op(self):
        compiler = TagDSLCompiler()
        output, query, query_text = repl.parse_and_store_defs(compiler, "")
        assert output == []
        assert query is None
        assert query_text is None
        assert compiler.definitions == {}

    def test_query_before_definition_raises(self):
        """A non-definition statement followed by more statements is a
        grammar error — queries can only appear in the final position.
        """
        compiler = TagDSLCompiler()
        with pytest.raises(PipelineDSLError, match=r"not a definition"):
            repl.parse_and_store_defs(compiler, "joseki. $x :- shape")

    def test_definition_referencing_session_state(self):
        """A definition can reference a virtual stored in the persistent
        compiler from a previous call — session persistence.
        """
        compiler = TagDSLCompiler()
        repl.parse_and_store_defs(compiler, "$x :- joseki.")
        # Second call references $x.
        output, query, _ = repl.parse_and_store_defs(
            compiler, "$y :- $x; shape."
        )
        assert "y" in compiler.definitions
        assert query is None


# ─── Regression for the user-surfaced bug ─────────────────────────────────────


class TestRegressionDefinitionOnlyInput:
    """Regression for: typing `$x :- joseki.` in the REPL previously
    raised `PipelineDSLError: Unexpected character ':' at position 3`.
    Today it stores the definition and confirms.
    """

    def test_definition_only_with_trailing_period(self, capsys):
        compiler = TagDSLCompiler()
        output, query, _ = repl.parse_and_store_defs(compiler, "$x :- joseki.")
        assert "x" in compiler.definitions
        assert query is None
        assert "Defined $x :- joseki" in output

    def test_definition_only_without_trailing_period(self):
        """The trailing `.` is optional — the underlying
        `_split_statements` accepts both forms.
        """
        compiler = TagDSLCompiler()
        output, query, _ = repl.parse_and_store_defs(compiler, "$x :- joseki")
        assert "x" in compiler.definitions
        assert query is None
        assert "Defined $x :- joseki" in output


# ─── handle_input — async orchestrator with rollback ─────────────────────────


class _FakeSession:
    """Minimal async session stub — captures executed statements and
    returns a configurable row set. Used by the rollback tests, which
    need to exercise the SQL-emission path without spinning up SQLite.
    """

    def __init__(self, rows: List[Any] = None):
        self.rows = rows if rows is not None else []
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        fetchall_value = self.rows

        class _Result:
            def fetchall(self_inner):
                return fetchall_value

        return _Result()


@pytest.fixture
def fake_session():
    return _FakeSession(rows=[(1,), (2,), (3,)])


class TestHandleInputRollback:
    """`handle_input` rolls back `compiler.definitions` to its pre-call
    state if any phase raises `PipelineDSLError`. A successful line
    commits; a failed line leaves the session untouched.
    """

    @pytest.mark.asyncio
    async def test_successful_definition_persists(self, fake_session):
        compiler = TagDSLCompiler()
        await repl.handle_input(fake_session, compiler, "$x :- joseki.", 1, False)
        assert "x" in compiler.definitions

    @pytest.mark.asyncio
    async def test_failed_line_leaves_definitions_unchanged(self, fake_session, capsys):
        """Define $x first (succeeds), then attempt a line whose second
        definition references an unknown virtual — the failure rolls
        back the line's first definition too.
        """
        compiler = TagDSLCompiler()
        await repl.handle_input(fake_session, compiler, "$x :- joseki.", 1, False)
        assert "x" in compiler.definitions
        prev = dict(compiler.definitions)

        # This line should fail on $undef: but the line also tries to
        # define $good. After failure, neither $good nor $undef should
        # be in the session — and $x must still be there.
        await repl.handle_input(
            fake_session,
            compiler,
            "$good :- shape. $bad :- $undef.",
            1,
            False,
        )
        captured = capsys.readouterr().out
        assert "PipelineDSLError" in captured
        assert compiler.definitions == prev
        assert "good" not in compiler.definitions
        assert "bad" not in compiler.definitions

    @pytest.mark.asyncio
    async def test_query_against_session_state_works(self, fake_session):
        """After a successful definition line, a query line uses the
        accumulated session state.
        """
        compiler = TagDSLCompiler()
        await repl.handle_input(fake_session, compiler, "$x :- joseki.", 1, False)
        await repl.handle_input(fake_session, compiler, "$x, ~volatile", 1, False)
        # One SELECT for the query.
        assert len(fake_session.executed) == 1

    @pytest.mark.asyncio
    async def test_empty_line_is_a_no_op(self, fake_session):
        compiler = TagDSLCompiler()
        result = await repl.handle_input(fake_session, compiler, "   ", 1, False)
        assert result is False
        assert compiler.definitions == {}
        assert fake_session.executed == []

    @pytest.mark.asyncio
    async def test_command_dispatch_through_handle_input(self, fake_session, capsys):
        compiler = TagDSLCompiler()
        compiler._parse_definition("$x :- joseki")
        result = await repl.handle_input(fake_session, compiler, ":defs", 1, False)
        captured = capsys.readouterr().out
        assert result is False
        assert "Stored definitions:" in captured

    @pytest.mark.asyncio
    async def test_quit_command_returns_exit_requested(self, fake_session):
        compiler = TagDSLCompiler()
        result = await repl.handle_input(fake_session, compiler, ":quit", 1, False)
        assert result is True


# ─── Session persistence — multi-call workflow ────────────────────────────────


class TestSessionPersistence:
    """Definitions accumulate across `handle_input` calls. This is the
    feature the bug-report exchange surfaced as missing.
    """

    @pytest.mark.asyncio
    async def test_define_then_query_uses_stored_definition(self):
        compiler = TagDSLCompiler()
        session = _FakeSession(rows=[(42,)])
        await repl.handle_input(session, compiler, "$x :- joseki.", 1, False)
        await repl.handle_input(session, compiler, "$x", 1, False)
        # The second call should have invoked execute() with the
        # expanded form of $x.
        assert len(session.executed) == 1

    @pytest.mark.asyncio
    async def test_define_chain_across_calls(self):
        compiler = TagDSLCompiler()
        session = _FakeSession()
        await repl.handle_input(session, compiler, "$x :- joseki.", 1, False)
        await repl.handle_input(session, compiler, "$y :- $x; shape.", 1, False)
        assert set(compiler.definitions.keys()) == {"x", "y"}

    @pytest.mark.asyncio
    async def test_reset_clears_session_definitions(self):
        compiler = TagDSLCompiler()
        session = _FakeSession()
        await repl.handle_input(session, compiler, "$x :- joseki.", 1, False)
        await repl.handle_input(session, compiler, ":reset", 1, False)
        assert compiler.definitions == {}

    @pytest.mark.asyncio
    async def test_query_after_reset_fails_unknown_virtual(self, capsys):
        compiler = TagDSLCompiler()
        session = _FakeSession()
        await repl.handle_input(session, compiler, "$x :- joseki.", 1, False)
        await repl.handle_input(session, compiler, ":reset", 1, False)
        await repl.handle_input(session, compiler, "$x", 1, False)
        captured = capsys.readouterr().out
        assert "Unknown virtual tag" in captured
