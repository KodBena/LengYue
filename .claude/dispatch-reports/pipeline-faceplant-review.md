# Review — Cards-tab pipeline faceplant / Lineage Explorer empty (UUID bind-format fix)

Branch `bork/fix/lineage-public-id-uuid-fix` @ `d233236d`, worktree
`/home/bork/w/omega/.claude/worktrees/lineage-public-id-uuid-fix`.
Diff `next...bork/fix/lineage-public-id-uuid-fix`: two new files —
`backend/alembic/versions/0005_normalize_uuid_bind_format.py` (119
lines) and `backend/tests/integration/test_uuid_bind_format_migration.py`
(276 lines). No other files touched. Reviewed with REFUTE posture,
all gates re-run independently (not trusted from the builder's
self-report).

## Verdict: **ACCEPT**

## 1. Mechanism reproduction — WITNESSED

Reproduced the defect and the fix myself against a scratch SQLite
DB, independent of the builder's test file:

- Typed Core `insert(...).values(id=uuid4())` followed by typed
  `WHERE id == that_uuid`: matches.
- Raw `text()` insert of `str(uuid4())` (0004's exact pattern)
  followed by the identical typed `WHERE`: does **not** match
  (`None`). Confirms the root cause precisely as described —
  hyphenated-stored vs. dashless-compared.
- Compiled-query param dump confirms `sa.Uuid()` on SQLite binds a
  `uuid.UUID` object regardless of caller intent; the string split
  is purely a function of what got written to the column, not of
  what's compared.

Then ran the builder's own new test file plus `test_alembic_bootstrap.py`
(8 selected, all passed) and the full backend suite (722 passed, 2
skipped, 1 xfailed — matches the builder's reported numbers exactly).

**My own additional construction** (point 1 of the brief): built a
fresh scratch DB via `metadata.create_all` → stamp `0005` → typed
insert of a new card with `public_id=uuid4()` (simulating a
post-`0004`-mint row) → re-ran `0005`'s own normalize SQL directly
against it. Result: value unchanged, length-36 guard correctly
skips already-dashless (32-char) values. No double-normalization
corruption on typed-inserted data. This is also covered by the
builder's own `test_migration_0005_is_idempotent_on_already_dashless_data`,
which I independently re-ran and additionally hand-verified the
underlying `UPDATE ... WHERE length(col) = 36` guard logic myself.

## 2. Direction-of-normalization — WITNESSED, correct

Empirically confirmed on this exact environment (SQLAlchemy 2.0.46,
the worktree venv): a typed `sa.Uuid()` column on SQLite stores and
compares in **dashless 32-char hex**, never canonical hyphenated —
confirmed via direct compiled-param inspection, not inferred. `0005`
normalizes *to* dashless, i.e. the correct direction.

**Wire-form side effect — WITNESSED, no regression.** Every reader
of `card.public_id` / `game_source.client_game_id` in
`backend/repositories/lineage_repository.py` and
`card_repository.py` goes through the typed ORM/Core (`select(card.c.public_id)`,
`select(game_source.c.id).where(game_source.c.client_game_id == ...)`)
— never a raw-string SELECT. I confirmed directly (scratch-DB test)
that a typed SELECT against a column storing the dashless form
returns a proper `uuid.UUID` Python object, identical to what a
typed SELECT against a hyphenated-stored value returns. Since the
route-layer response schemas (`schemas/card.py:132`,
`api/routes/lineage.py:83/122/151`) declare `UUID` fields, Pydantic
always serializes the canonical 36-char hyphenated form on the wire
— **independent of internal storage format, before and after this
fix**. I additionally dispatched an independent frontend sweep
(background agent, `frontend/src` grep across every `public_id`/
`clientGameId`/`client_game_id` touch point including the durable
`GlobalStore` blob, `SyncService`, and the 64→65 migration
referenced in the brief): no site reads/persists/compares these
values in a way that assumes SQLite's internal encoding — every
holder sources the value from the wire (ACL-branded canonical
string) or mints it locally via `crypto.randomUUID()`. The 64→65
migration is unrelated (it fixed a raw-numeric-`CardId` leak into
`NavSelection.rootCardId`, not a format issue). No frontend finding,
no migration extension needed.

## 3. Migration discipline — WITNESSED

- Revision chain `0004 → 0005` correct (`down_revision` set
  correctly; verified by running the actual chain).
- `REVISION_MARKERS`: correctly left untouched. Per `backend/CLAUDE.md`
  step 5, a marker entry is only warranted when a revision adds a
  column whose presence should make the bootstrap probe stamp at
  that revision; `0005` is a pure data rewrite, no schema shape
  change. Read `db/alembic_bootstrap.py`'s docstring and
  `REVISION_MARKERS` list directly to confirm this reading, not
  taken on the builder's say-so.
- Round-trip: I built my own scratch DB (independent of the
  builder's test), ran `metadata.create_all` → strip `0004`'s
  columns → seed a card → stamp `0003` → `alembic upgrade head` →
  `alembic downgrade -1` → `alembic upgrade head`. Clean, no errors,
  matches the builder's claim.
- Downgrade honesty: `0005.downgrade()` is a documented no-op ("not
  reversible in the meaningful sense... downgrading to re-hyphenate
  would only reintroduce the defect"). This is an honest judgment,
  not a dodge — re-hyphenating would be actively wrong, not merely
  unimplemented, and the docstring says so plainly rather than
  hiding a `pass`.
- Idempotency: real, and independently exercised (see §1).

## 4. Postgres no-op — UNEXERCISED (documented, not independently verified)

The `bind.dialect.name != "sqlite"` guard is a correct, direct
reading of the same `dialect.supports_native_uuid` property that
causes the bug on SQLite — psycopg's native UUID adaptation means
`sa.Uuid()` never reformats on Postgres regardless of how a value
was written, so the mismatch this fix addresses cannot occur there.
No Postgres environment was available to me either, so this stays a
documented-not-witnessed claim, same status the builder gave it.
The guard itself (`bind.dialect.name != "sqlite"` as an early
return) is simple enough that I'm comfortable accepting the
documented argument without an independent Postgres run.

## 5. Class sweep — WITNESSED, complete

Swept every `alembic/versions/*.py` file for `text(...)` calls: only
two write into typed `Uuid` columns via raw untyped binds —
`card.public_id` and `game_source.client_game_id`, both at
`0004:122-142`, both fixed by `0005`. All other `text()` usage in
`0004` is either a read query or writes into `Integer` columns
(`display_ordinal` counters), which are dialect-format-invariant and
not part of this defect class. I also checked `db/schema.py` for
every other `Uuid`-typed column: `analysis_bundles.board_id` is the
only other one, and it's never populated via a migration backfill
(app-level typed inserts only) — outside the defect class, correctly
left untouched.

I additionally checked `repositories/card_repository.py:370` (the
SGF-import dedup query the builder cited for `client_game_id`) and
confirmed it uses the identical typed-ORM-equality pattern that
`0005` fixes — same bug, same fix, correctly covered without a
dedicated red/green test (the builder disclosed this as UNEXERCISED
for its own regression test, honestly, since the fix SQL is
identical in shape to the already-pinned `card.public_id` case).

## 6. Standing checks — WITNESSED clean

- No live-DB writes: `backend/cards.db` mtime unchanged across the
  entire review session (confirmed via `stat` before and after); the
  worktree has no `cards.db` of its own (untracked, never copied).
- No `waitForTimeout` in the diff or the builder's report (no
  frontend/Playwright code in this diff at all).
- Trial-merge vs. `next`: the branch's merge-base with `next` **is**
  `next`'s current HEAD (`9391f8f8`), i.e. the branch is already
  current — no backend changes landed on `next` since the worktree
  was cut, so no drift to reconcile.
- Proportionality: two files, 395 lines, tightly scoped to the
  actual defect and its test coverage. No scope creep.

## Findings

No findings and no nits surfaced during this review; the fix is accepted as delivered.

## Deploy note (unchanged from builder's report)

Not yet applied to the live `cards.db`. Per `db.alembic_bootstrap.bootstrap_alembic`,
the fix auto-applies on the next backend restart (`alembic upgrade
head` runs in the lifespan). Merging this branch to `next` and
restarting the running `:8764` backend is the deploy step — no
manual SQL required.
