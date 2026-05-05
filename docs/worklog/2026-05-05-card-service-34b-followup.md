# Card-service 34b commit-3 followup

- **Status:** PR opened on branch `backend/card-service-34b-followup`,
  2026-05-05. Related to issue #135 (backend testing investment).
- **Genre:** Worklog entry — backend bug fix closing a partial
  application of Item 34b commit 3.
- **Date:** 2026-05-05.
- **Origin:** User reported `POST /cards/` returning 500 with an
  AttributeError on `data.sgf` against the post-34b `CardCreate`
  schema (which exposes only `raw_content`).

## What was missed in 34b commit 3

The 34b arc tightened the wire schema (`schemas/card.py` removed the
`sgf` alias and the top-level `default_visits`), dropped the
`default_visits` column from `db/schema.py`, and updated the data
migration scripts and the frontend ACL. The persistence-call shape
between `services/card_service.py` and
`repositories/card_repository.py` was not updated:

- `card_service.py:118` and `:161` continued to read `data.sgf`.
- `card_service.py:137` continued to pass `data.default_visits` as
  a kwarg to `insert_card`.
- `repositories/ports.py:127` and the matching SQLAlchemy adapter
  still declared `default_visits: int` on the `insert_card` Port,
  with the adapter's `.values()` writing to a column that no longer
  exists.

Pydantic's strict `__getattr__` fired first, throwing on `data.sgf`
before the deeper SQL-side error could surface — fail-loud per
ADR-0002 working as designed.

## Fix

Three field reads in `card_service.py` corrected (`data.sgf` →
`data.raw_content`; `default_visits` kwarg dropped). Matching
parameter drops on the Port and the adapter, including the orphaned
`.values()` entry.

Total diff: 2 insertions, 6 deletions across three files.

## Testing-gap angle

No test exercised `CardService.create_card`. The Item 30b refactor
docstring promises Port-pure testability — *"Testable with fakes:
pass a `FakeCardWriteRepository` and a `FakePgnNormalizer` and the
use case runs without a database, a SGF parser, or a server"* — but
the seam was never wired to fakes. Issue #135 (backend testing
investment, Important priority) tracks the absent test as the
structural fix; this bug is its concrete witness.

## Verification

Pre-fix and post-fix `pytest` runs (with `--ignore=tests/integration/test_cte_lineage.py`
to skirt a pre-existing collection `ImportError` unrelated to this
change) produce identical numbers — 76 failed / 31 passed / 9
xfailed / 29 errors. All failures pre-existing on the originating
branch and concentrated in unrelated areas (`test_lineage_endpoints`,
`test_graph_algorithms`, `test_pipeline_e2e`, `test_tag_dsl_qsl`).
No test regressions caused by this change.

## Adjacent observations not touched

- `backend/tests/helpers.py:69` still sets `self.default_visits = 1000`
  on its `FakeRow` (which fakes a SQLAlchemy Row, not the write Port).
  Harmless extra attribute, but stale. Worth a sweep when those tests
  are next visited as part of #135's arc.
- The pre-existing test breakage on the originating frontend branch
  is broader than card-service. Out of scope here; flagging as a
  backend-side hygiene item for the testing-investment session.
