# Worklog — remove dead recursive-CTE duplicates (2026-06-04)

## Trigger

Work-status item `remove-dead-recursive-cte-duplicates` (backend / small /
`refactor`+`test`) — residue the 30d/32a recursive-CTE consolidation left
behind (`consolidate-recursive-cte`, `single-cte-per-pipeline-run`, both
shipped). The live lineage CTE now lives in
`repositories/lineage_repository.py`, which dispatches on the **Pydantic** DSL
value objects in `domain/pipeline_dsl.py` (via `isinstance`). Two
pre-consolidation modules were left orphaned.

## What changed

Deleted, both confirmed to have zero production importers (only the two
retired tests below referenced `tree_dsl`; nothing referenced `tree_queries`):

- **`domain/tree_dsl.py`** — stub `Selection` Protocol + `ContextSelection` /
  `SubtreeSelection` with `to_cte()` methods + a half-finished `TagFilter`.
  These are *not* the live selection classes (those are
  `domain/pipeline_dsl.py`'s `_DslBase` subclasses, which carry no `to_cte`).
  `.to_cte()` was called nowhere but the D-5/D-6 tests.
- **`domain/tree_queries.py`** — `get_lineage_cte` / `select_subtree`, an
  "example DSL primitive" leftover with no importers anywhere.

Retired from `tests/integration/test_cte_lineage.py`: the `D-5` xfail
(`test_subtree_selection_ancestor_walk_n1`) and the `D-6`
(`test_context_selection_cte_executes_without_error`) tests, plus the
docstring's "Documented Defects" block (replaced with a "Retired tests"
pointer to where the live coverage lives). The file's CTE-1…CTE-8 tests —
which exercise the live `LineageRepository.fetch_lineage` — are untouched.

## Test-coverage equivalence (why retiring D-5/D-6 loses nothing)

Both retired tests exercised the **deleted** `tree_dsl` stubs, not live code.
Their still-applicable capabilities are already covered against the
consolidated implementation, so no replication was needed — only verification:

- **D-5** (an `xfail` documenting that the stub's `SubtreeSelection.to_cte()`
  never implemented the ancestor walk, so `n=1` behaved like `n=0`). The
  capability is implemented in `lineage_repository.py`'s `AncestorSelection`
  branch and **positively asserted** by
  `test_pipeline_e2e.py::test_subtree_selection_n1_walks_up_one_ancestor`
  (the D-9 fix regression): identical tree `grand→parent→ctx→child`,
  `SubtreeSelection(n=1)` ⇒ `{parent, ctx, child}` with `grand` excluded. The
  live test is strictly stronger than the retired xfail — it pins the working
  behaviour rather than documenting the broken stub.
- **D-6** (the stub's `ContextSelection.to_cte()` returned exactly the context
  card but emitted misleading `WITH RECURSIVE` SQL). The "returns only the
  context card" contract is covered against the live path by
  `test_lineage_repository.py::test_fetch_selection_context_returns_only_the_context_card`
  (`ContextSelection()` ⇒ one node = the context). The misleading-SQL half was
  purely an artifact of the dead `to_cte`'s generation; the live path is
  non-recursive for `ContextSelection`, so there is nothing to preserve.

Net: a capability that mattered moved to (or was already in) the consolidated
tests; a defect that only existed in dead code went away with it.

## Validation

`backend/venv` — full suite **706 passed, 1 xfailed** (the remaining xfail is
unrelated), 47s. Targeted run of `test_cte_lineage.py` + both live-coverage
anchors + `test_pipeline_dsl.py`: **62 passed**. `test_cte_lineage.py` drops
from 13 items (11 passed / 1 skipped / 1 xfailed) to a clean 11 passed, and
the prior cartesian-product `SAWarning` from D-5 is gone.

## Status

Item `remove-dead-recursive-cte-duplicates` ready to close (`shipped`).
Backend-only deletion + test retirement; no wire-shape, ADR, or FEATURES
implications. `frontend/FILES.md` is frontend-only, so no file-map change.
