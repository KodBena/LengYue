# Fix report — Cards-tab `${gameSourceId}` pipeline faceplant + empty Lineage Explorer

Commission (ledger row 607, extended by row 613): live diagnosis of two
witnessed defects on the running `next` bundle (SPA :4173, backend
:8764) and a fix, built in an isolated worktree
(`/home/bork/w/omega/.claude/worktrees/lineage-public-id-uuid-fix`,
branch `bork/fix/lineage-public-id-uuid-fix`), never touching the main
checkout or its ports. One commit: **`d233236d`**.

## Captured failing request/response (verbatim)

Reproduced live via Playwright (playwright-core + the main checkout's
`/usr/bin/chromium`, `nice -n 19`, one browser closed in a `finally`,
1920×1080, condition waits only) as user `quark`: Cards tab → select
deck "Standard" → context ids `${2}` → Run Pipeline → hyperparameter
modal → Run.

The macro preview read `→ Sends: game 2` — correct. `/forests/query`
itself **succeeded** (200), with exactly the request shape the macro
build intended:

```
POST http://192.168.122.68:8764/forests/query
{"context_ids":[],"game_source_ordinals":[2],"pipeline":[{"stage":"select","selection":{"type":"DescendantSelection"},"ordering":{"type":"bfs_order"}},{"stage":"take","n":50},{"stage":"order","ordering":{"type":"EbisuRecallKey"}},{"stage":"take","n":10},{"stage":"shuffle"}]}
→ 200, 10 matched cards
```

Immediately after, populating the forest from those matched cards
(`useCardTreeData.ts::populateSlotFromMatched` → `resolveRoots` →
`fetchTreeByRoot` per resolved root) failed for **every** resolved
root:

```
POST http://192.168.122.68:8764/lineage/tree-by-root
{"root_card_public_id":"5e00203a-4272-4310-8ca4-bba19b3f210d"}
→ 404 {"detail":"root card 5e00203a-4272-4310-8ca4-bba19b3f210d not found for this user"}
```

(and identically for `4ee50778-...`, `49eb880d-...`, and every other
root touched.) `target.forest` ends up empty, a warning toast fires —
this is the "faceplant": the query succeeds, the forest never
populates.

**Second witnessed symptom (row 613), same mechanism**: a plain Browse
click (no macro, no pipeline involved) on a root visible in the
maintainer's own `/stats/forests` list 404s identically —
`POST /lineage/tree-by-root {"root_card_public_id":"16453d6d-..."}` →
404 "not found for this user" — confirmed independently with a direct
`curl` using a freshly minted quark token, ruling out session-identity
skew (hypothesis (b) in the extended charter): the same token that
`/auth/me` confirms as `quark` gets the 404 from `/lineage/tree-by-root`
and a 200 with the same root listed from `/stats/forests`.

## Root cause — `file:line`

`backend/alembic/versions/0004_per_user_id_enumeration.py:122-130` (and
identically at `:132-142` for `game_source.client_game_id`):

```python
missing_public_id = bind.execute(
    text("SELECT id FROM card WHERE public_id IS NULL")
).fetchall()
for (card_id,) in missing_public_id:
    bind.execute(
        text("UPDATE card SET public_id = :pid WHERE id = :cid"),
        {"pid": str(uuid4()), "cid": card_id},
    )
```

`card.public_id` is declared `sa.Uuid()` (`backend/db/schema.py:298`).
On SQLite, `dialect.supports_native_uuid` is `False`, so `sa.Uuid()`'s
bind processor formats a Python `uuid.UUID` as its **32-character
lowercase hex digest with no dashes** — never the canonical
36-character hyphenated `str(uuid)` form — for *every* comparison
compiled through the ORM/Core, including the equality WHERE-clauses in
`LineageRepository.fetch_tree_by_root` (`backend/repositories/
lineage_repository.py:335`, the query behind `/lineage/tree-by-root`)
and `.resolve_roots`'s downstream lookups.

The migration's backfill loop above writes each freshly minted id via
raw `text()` SQL with a **plain Python string** parameter — `text()`
binds are untyped, so this entirely bypasses the column's bind
processor. Every row that revision backfilled (i.e. every card
belonging to a game imported before today's `0004` migration ran —
effectively all of quark's cards) therefore persisted the canonical
**hyphenated** form, while every subsequent typed ORM `WHERE
card.c.public_id == some_uuid` comparison binds the **dashless** form.
The two representations denote the same UUID but never string-compare
equal, so the lookup finds nothing — a 404, indistinguishable from "not
owned" — for cards that unambiguously belong to the querying user.

`/forests/query` never filters by `public_id` (it reads and returns
card ids/game-source ordinals, all of which are unaffected columns),
which is exactly why the Cards-tab macro's *preview* and the
pipeline's *card-matching* step both work — the bug is entirely in the
downstream tree-fetch, shared by Browse and the deck pipeline alike.

### Confirmed, not anchored

Per the extended charter's own hypothesis list:

- **(a) wrong-edge ownership join** — ruled out. `fetch_tree_by_root`'s
  `root_check` query correctly joins `card_source → card → game_source`
  and filters `card.user_id == user_id`; direct raw-SQLite inspection
  of `cards.db` confirmed the row (`card.id=8126`, `user_id=131`,
  `card_source.game_source_id=54932` not null) satisfies every
  predicate in that query on its own terms.
- **(b) session identity skew** — ruled out (see the row-613 curl
  check above; same token, same user, both endpoints).
- **(c) UUID string vs stored format comparison** — **confirmed**, and
  is the actual root cause, precisely characterized above (not a
  vague "format mismatch" but the specific dashed-vs-dashless split
  between `0004`'s raw-`text()` writes and every typed ORM read).

### Direct reproduction (isolating the mechanism from any app code)

Against a scratch SQLite table with an `sa.Uuid()` column:

```
self-consistent typed insert -> typed where match: (1,)
raw-text-bypass insert -> typed where match (expect None = bug repro): None
raw stored value for row 2: ('d1374342-1138-4d10-ad27-9191f23ec61e',)
```

A typed `insert(...).values(pid=uuid4())` followed by a typed
`WHERE pid == that_same_uuid` matches. A raw-`text()` insert of
`str(uuid4())` (`0004`'s exact pattern) followed by the identical typed
`WHERE` does not — proving the bug is the bind-format mismatch, not
anything specific to `LineageRepository`'s query shape.

## The fix

`backend/alembic/versions/0005_normalize_uuid_bind_format.py` (new
migration): on SQLite only (Postgres's native UUID support means
`sa.Uuid()` never reformats there, so the migration is a no-op on
that dialect), re-normalizes every already-hyphenated
`card.public_id` / `game_source.client_game_id` value to the dashless
form the ORM actually compares against:

```sql
UPDATE card        SET public_id       = REPLACE(public_id, '-', '')       WHERE length(public_id) = 36;
UPDATE game_source  SET client_game_id = REPLACE(client_game_id, '-', '')  WHERE length(client_game_id) = 36;
```

Idempotent (string-length guard: a fresh install or a DB where nothing
was ever written through `0004`'s raw-text bypass sees zero rows
touched). `client_game_id` is included because it shares the exact
same bug in the exact same migration (`0004:132-142`) and is used in
an ORM equality lookup (`repositories/card_repository.py:370`,
SGF-import dedup) — leaving it unfixed would be the same defect,
silently reintroduced the next time someone imports a game whose
`client_game_id` collides with a pre-`0004` row.

Per `backend/CLAUDE.md`'s migration discipline: `0004` is not edited
(already applied to the live `cards.db` and to every other checkout
that ran it — editing shipped history wouldn't retroactively fix any
already-corrupted database, only a forward migration does).

No `db/alembic_bootstrap.py` `REVISION_MARKERS` entry needed — this is
a pure data migration, no column added.

## Tests — red then green (ADR-0021)

`backend/tests/integration/test_uuid_bind_format_migration.py` (new),
replaying the actual historical mechanism rather than asserting a
symptom: builds a real SQLite DB up through `0003` (via
`metadata.create_all` + surgical column/index strip, the same
technique `test_alembic_bootstrap.py::test_bootstrap_v1_baseline_db_upgrades_to_head`
already establishes), seeds one card with no `public_id` column yet,
then lets `0004`'s real backfill code run against it.

- `test_migration_0004_backfill_makes_tree_by_root_404_for_owned_card`
  — **RED**: asserts `LineageRepository.fetch_tree_by_root` raises
  `CardNotFoundError` for the just-backfilled card — the exact defect.
- `test_migration_0005_fixes_tree_by_root_for_pre_existing_card` —
  **GREEN**: same seed, `0005` applied on top, `fetch_tree_by_root`
  now finds the card; also asserts the UUID *value* is unchanged
  (only the stored string format changed).
- `test_migration_0005_is_idempotent_on_already_dashless_data` — a
  card created after `0005` (typed insert, already dashless) is left
  untouched by the normalization guard.

## Gates

| Gate | Result | Status |
|---|---|---|
| New migration test file | 3 passed | WITNESSED (`./venv/bin/python -m pytest -q tests/integration/test_uuid_bind_format_migration.py`) |
| `test_alembic_bootstrap.py` (unaffected by the new revision) | 5 passed | WITNESSED |
| `alembic upgrade head && downgrade -1 && upgrade head` round-trip (per `backend/CLAUDE.md` step 4), from a `metadata.create_all`-then-stamp-head baseline | clean, no errors | WITNESSED |
| Full backend suite (worktree venv, never main checkout's) | 722 passed, 2 skipped, 1 xfailed | WITNESSED |
| Frontend gates (build/eslint/test:run) | not run | UNEXERCISED — no frontend file was touched; the root cause and fix are entirely backend (a migration bug), so per the dispatch's own conditional ("frontend build + eslint + test:run" applies "if frontend touched") these gates are out of scope for this change |
| Live-system fix applied to the running `cards.db` | not done | UNEXERCISED, by design — the dispatch charter is diagnose-live-read-only, fix-in-isolated-worktree; deploying `0005` to the running backend (which will auto-run it via `bootstrap_alembic`'s `alembic upgrade head` on next restart) is a separate, deliberate deploy step outside this session's remit |

## Per-claim evidentiary status

| Claim | Status |
|---|---|
| Preview (`→ Sends: game 2`) and `/forests/query` (matched-card step) both work | WITNESSED — live Playwright capture, 200 response with 10 matched cards |
| `/lineage/tree-by-root` 404s for every resolved root after a successful pipeline match | WITNESSED — live Playwright capture, verbatim request/response above |
| Same 404 reproduces for a plain Browse-equivalent root fetch (no macro/pipeline involved) | WITNESSED — direct `curl` against the live backend with a freshly minted quark token |
| Session-identity-skew hypothesis (b) ruled out | WITNESSED — same token verified via `/auth/me` as quark, used for both the passing `/stats/forests` call and the failing `/lineage/tree-by-root` call |
| Root cause: `sa.Uuid()` SQLite bind-format mismatch between `0004`'s raw-`text()` backfill and every typed ORM comparison | WITNESSED — direct scratch-DB reproduction isolating the mechanism (typed round-trip matches; raw-text-bypass round-trip doesn't), plus raw sqlite3 inspection of the live `cards.db` row confirming the stored hyphenated format |
| Fix (`0005`) resolves the defect for pre-existing (migration-backfilled) data | WITNESSED — red-then-green integration test replaying the real `0003→0004→0005` migration sequence |
| Fix is a no-op for already-correct (post-`0004`, typed-insert) data | WITNESSED — dedicated idempotency test |
| Fix is a no-op on Postgres | UNEXERCISED — no Postgres integration environment available in this session; the `bind.dialect.name != "sqlite"` early-return is a direct reading of the same `dialect.supports_native_uuid` property that causes the bug, not an independently-verified behavior |
| `game_source.client_game_id` carries the identical bug and is fixed by the same migration | WITNESSED — same raw-`text()` pattern at `0004:132-142`, confirmed by reading; not independently reproduced with its own red/green test (the fix's SQL is identical in shape to the `card.public_id` case already pinned) |

## Final

**Root cause**: `backend/alembic/versions/0004_per_user_id_enumeration.py:122-142` backfills
`card.public_id` / `game_source.client_game_id` via raw `text()` SQL
with plain `str(uuid4())` parameters, bypassing `sa.Uuid()`'s SQLite
bind processor (which formats every typed ORM equality comparison as
32-char dashless hex). Every migration-backfilled row is stored
hyphenated; every ORM `WHERE ... == some_uuid` compares dashless —
permanent mismatch, 404 for every pre-`0004` card via
`/lineage/tree-by-root` (`backend/repositories/lineage_repository.py:335`),
regardless of entry path (Browse or the Cards-tab deck pipeline).

**Branch head**: `bork/fix/lineage-public-id-uuid-fix` @ `d233236d`
(worktree: `/home/bork/w/omega/.claude/worktrees/lineage-public-id-uuid-fix`)

**Gates**: backend suite 722 passed / 2 skipped / 1 xfailed (worktree
venv); new migration test 3/3 passed (red-then-green); `test_alembic_bootstrap.py`
5/5 passed; alembic upgrade/downgrade/upgrade round-trip clean.
Frontend gates not run (no frontend file touched). Not deployed to the
live system (out of this dispatch's remit).
