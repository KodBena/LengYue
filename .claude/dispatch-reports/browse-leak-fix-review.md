# Fresh-context review — browse-leak-fix (last hole in the per-user-id non-leak guarantee)

Branch `bork/fix/browse-leak-fix` (worktree `.claude/worktrees/browse-leak-fix`), commits
`056fd1e2` (backend) + `593740ce` (frontend), merge-base `50f9ee6c`. REFUTE posture; every
gate below was run independently by this review, not taken from the builder's self-report.
Builder report read last, per brief: `.claude/dispatch-reports/browse-leak-fix-build.md`.

## VERDICT: ACCEPT-WITH-NITS

Substance is sound: the guarantee is closed, tenancy/column-projection discipline is intact,
the concurrency witness is genuinely concurrent and red-then-green, the disclosed regression
is honestly scoped and loud. The only outstanding item is mechanical, not a design defect:
**merge composition requires the migration-number collision to be resolved by hand** (see
below) — the branch and current `next` independently minted incompatible `63 → 64`
migrations. This review performed and verified that composition in a disposable scratch
worktree; it was NOT applied to the real `next`.

## Required merge-composition steps (exact)

`next` (HEAD `b5732042`, delta-view-cycle) and this branch (base `50f9ee6c`, pre-dates
delta-view-cycle) each independently bumped `CURRENT_SCHEMA_VERSION` to 64 with different
migration bodies at slot 63→64:

- `next`'s 63→64: backfill `session.ui.deltaViewMode`.
- branch's 63→64: clear `session.ui.forestNav.selection`.

At merge time:

1. Keep `next`'s 63→64 (`deltaViewMode`) as-is.
2. Renumber the branch's forestNav-clear migration to **64→65**, update its comment header
   accordingly.
3. Bump `CURRENT_SCHEMA_VERSION` to **65**.
4. Apply rolling-archive discipline (exactly two active migrations at steady state): move
   `next`'s 62→63 (`highContrastText` backfill) into `archived-migrations.ts`, leaving 63→64
   and 64→65 as the two active entries. Update `archived-migrations.ts`'s header scope
   comment (entry count / range) and `migrations.ts`'s "first N entries" comment to match.
5. `frontend/src/store/schema.ts` and `archived-migrations.ts` auto-merge cleanly (verified —
   only `migrations.ts` conflicted). No other file in the diff touches migration machinery.

This is a plain content conflict in one file with a well-defined resolution — not a design
question, not something that needs re-adjudication.

## What I verified myself (WITNESSED unless marked otherwise)

**1. The guarantee, adversarially.**
- `curl`'d the branch's own OpenAPI doc from a throwaway server (own venv, own port 19764,
  scratch SQLite file, killed after) and confirmed field-by-field: `ForestStat`,
  `ResolvedRoot`, `TreeByRootRequest`, `TreeByRootResponse` now carry only
  `root_card_public_id` (string/uuid) and `game_source_display_ordinal` (int) — the raw
  `root_card_id`/`game_source_id` integer PKs are gone, not renamed-but-kept, and no
  dual-id/alias field was added alongside them.
- Grepped the entire backend and frontend source trees for `root_card_id`/`game_source_id`
  post-diff: all remaining hits are internal (non-wire) SQL/domain code, docstrings, or
  unrelated fields (`/library/games/{id}`'s own `GameSourceId`, `card_service.py`'s internal
  `game_source_id` local). Nothing wire-facing remains.
- Ran my own plant-and-trip against `schemas/stats.py`, independent of the builder's:
  added `reviewer_plant_test_id: int` to `ForestStat`, ran
  `tests/integration/routes/test_global_sequence_schema_walk.py` — it failed exactly as
  expected (`AssertionError: Unlisted id-shaped integer field(s)... ['ForestStat.reviewer_plant_test_id']`).
  Reverted; `git diff --stat schemas/stats.py` came back empty; re-ran the same test — 3
  passed. (Ledgered as rows 481/482 per this world's edit-gate.)
- Checked the dict/raw-SQL escape hatch the OpenAPI walker can't see:
  `api/routes/lineage.py::_overflow_detail` returns a raw dict (422 body), not a Pydantic
  model. Its only fields are `actual_size`/`max_nodes` (counts, not ids) — pre-existing,
  untouched by this diff, and not a leak. No other route in the backend returns a raw
  dict/JSONResponse carrying an id-shaped value (grepped `api/routes/*.py`).
- Confirmed the allowlist's own honest-ceiling note (in
  `test_global_sequence_schema_walk.py`'s docstring — pre-existing, unmodified by this diff)
  already discloses this class of gap; nothing new was introduced by this branch.

**2. Tenancy / column-projection.**
- `LineageRepository.fetch_tree_by_root`'s root-resolution query still filters
  `card.c.public_id == root_card_public_id` AND `card.c.user_id == user_id` in the same
  query — cross-tenant and non-root failures still collapse to `CardNotFoundError` → 404,
  same shape as before, no new 403/500 path opened by switching the identity parameter.
- `test_lineage_routes.py`: `test_tree_by_root_cross_tenant_returns_404` preserved verbatim
  in intent (updated only for the new wire shape); a genuinely new case,
  `test_tree_by_root_unknown_public_id_returns_404`, was added — a syntactically-valid UUID
  matching no card is correctly a 404, not a 500. This is the right new edge case given the
  request identity moved from an internal PK (never guessable/malformed the same way) to an
  externally-addressed UUID.
- `StatsRepository.fetch_forest_members`: the new `root_card` alias join is a plain
  equality join on the CTE's already-tenancy-filtered `root_card_id`, adding one join per
  query (not per recursion level) — no widening of the tenancy predicate, no new
  unfiltered read.
- Column projection: every new SELECT (`root_card.c.public_id`, `game_source.c.display_ordinal`,
  the two batched `IN`-lookups in `resolve_roots`) selects exactly the columns the wire
  schema declares, nothing extra.

**3. Wire shape (OpenAPI diff, own server).** See above — confirmed independently, matches
the builder's claimed before/after table exactly.

**4. Race witness.** Read `test_display_counters_concurrency.py` in full. Genuinely
concurrent: two independent `AsyncEngine`s against a shared **file-backed** SQLite DB (not
the `:memory:`/`StaticPool` fixture, which the test's own docstring correctly identifies as
sharing one DBAPI connection and therefore incapable of a meaningful race), driven via
`asyncio.gather`. Asserts both no-duplicate and no-gap (`sorted(combined) == list(range(1, N+1))`,
exact-set equality, not just "no dupes"). Red-then-green is real: a deliberately broken
read-then-write increment (`_broken_increment`, test-file-only) is run through the *same*
harness first and confirmed to produce a duplicate — proving the harness can catch the
defect before trusting it to certify the real `UPDATE...RETURNING` implementation clean.
Ran the full backend suite twice (once in the branch worktree, once in the trial-merge
worktree) with no flakes observed in this run.

**5. Disclosed regression (Cards-tab `${gameSourceId}` macro).** `context-id-macros.ts`
itself is untouched by this diff (confirmed — not in the changed-files list); the actual
change is in its sole caller, `ForestDirectory.vue::updateContextIds`, whose
`resolveGameSource` callback now always returns `[]` (the raw root-card-id source it used
to read, `ForestStat.rootCardId`/`gameSourceId`, no longer exists) plus a one-time
`console.warn` per distinct token. This is loud (ADR-0002): the existing "→ Expands to" hint
surfaces the now-empty result, and the console warning names the reason. Grepped every
frontend consumer of the removed wire fields (`root_card_id`/`game_source_id`,
`rootCardId`/`gameSourceId` on the old brands) — none remain; every call site was rewired to
the new `CardPublicId`/`GameDisplayOrdinal` brands (`useCardTreeData.ts`,
`backend-service.ts`, `useForestNavigation.ts`, `ForestTreeNav.vue`, `board-card-trees.ts`,
`useCardTreeProjection.ts`, `CardTreeWidget.vue`/`card-tree-echarts.ts`, `store/schema.ts`).
No second silent breakage found beyond the disclosed macro.

**6. Frontend migration composition.** Performed the actual trial merge (not just read the
diff): `git worktree add` from current `next`, `git merge --no-ff --no-commit
bork/fix/browse-leak-fix` — only `frontend/src/store/migrations.ts` conflicted, exactly as
expected. Applied the renumbering above by hand, ran both suites in that scratch tree
(never touched the real `next`):
- Backend: fresh venv, `pip freeze` mirrored from the reviewed worktree's own venv,
  `pytest -q` → **708 passed, 2 skipped, 1 xfailed** (identical to both the branch-alone run
  and the builder's claim).
- Frontend: `npm install`, `npm run build` → clean (`vue-tsc -b` type-checks the renumbered
  migrations file with no errors), `npx eslint .` → clean/exit 0, `npm run test:run` →
  **1356 passed, 4 skipped** (higher than the builder's isolated-branch 1333 because the
  trial tree also carries delta-view-cycle's own tests — consistent, not a discrepancy).
- Worktree and scratch branch removed after; nothing landed on the real `next`.

**7. Standing checks.** Grepped the diff and this branch's new/changed test files for
`waitForTimeout`/bare `sleep(` used as a synchronization crutch: the only `sleep` is
`asyncio.sleep(0.01)` inside `_broken_increment` in the concurrency test — that's the
deliberate race-window inducer for the *harness-sanity* (red) case, not a test-flakiness
workaround, and it's never in the path of the real implementation under test. No
`waitForTimeout` found. Builder's own-port claims (18764 for `gen:api`, its own scratch
SQLite, killed after) are consistent with the artifacts left behind (no stray process, no
`cards.db` touched) — I independently used a different port (19764) and DB path for my own
verification specifically to avoid any collision with a possibly-still-running builder
process, and found none running.

**8. ADR-0004 proportionality.** 30 files, +1221/−447. All in-scope: the three backend
call sites named by the commission (routes/domain/repositories/ports/schemas for
stats+lineage), the allowlist file, backend test updates for the new wire shape, the new
concurrency test (a separately-named, previously-open ledger item, not scope creep), and
the frontend consumer chain the backend change necessitates (types, ACL, composables,
components, store schema/migrations, IDENTIFIERS.md). Nothing touched outside this
footprint (no unrelated routes, no unrelated frontend features).

## Nits (do not block merge, but should be tracked)

- The migration renumbering above must be applied by a session with write access to the
  real `next` before/at merge time — it is mechanical but not optional; landing the branch
  as-is would silently overwrite `next`'s `deltaViewMode` migration slot with a different
  body at the same version number, corrupting forward-migration for any blob that passed
  through `next`'s v64 in the interim.
- The builder's own report already discloses two follow-ons (store migration 63→64 — now
  64→65 — has no dedicated round-trip unit test; the Cards-tab macro's display surface
  wasn't separately audited as its own leak site) — both correctly flagged as out-of-band,
  not silently dropped. No new gaps found beyond what's already disclosed.

## Evidentiary index

| Claim | Status |
|---|---|
| Wire fields renamed not aliased (OpenAPI diff) | WITNESSED — own server, port 19764 |
| Allowlist gate trips on a planted leak, reverts clean | WITNESSED — independent plant-and-trip, rows 481/482 |
| Dict/raw-SQL escape hatch check | WITNESSED — `_overflow_detail` inspected, no id leak, pre-existing |
| Tenancy / 404-not-403 preserved on the new identity param | WITNESSED — code read + test read (new unknown-uuid case added) |
| Concurrency witness genuinely concurrent, red-then-green, no-dup-no-gap | WITNESSED — full file read + suite run |
| Frontend consumers fully rewired, disclosed macro regression honestly scoped | WITNESSED — grep sweep, no second silent breakage found |
| Migration renumbering composes cleanly against real `next` | WITNESSED — actual trial merge, both suites green (708/2/1 backend; 1356/4 frontend) |
| waitForTimeout/sleep-as-sync absent | WITNESSED — grep, only legitimate race-inducer in harness-sanity test |
| Scope proportionate to commission | WITNESSED — diff enumerated file-by-file |
