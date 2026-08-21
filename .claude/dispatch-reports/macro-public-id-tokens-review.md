# Fresh-context review — restoring the Cards-tab `${gameSourceId}` macro (macro-public-id-tokens)

Reviewer posture: REFUTE. Fresh context — builder's report
(`.claude/dispatch-reports/macro-public-id-tokens-build.md`) read LAST,
after independently reading the diff, the law, and re-running every gate
myself. Tenancy-core change; this review is MANDATORY and gating per the
commission.

Branch reviewed: `bork/fix/macro-public-id-tokens`, head `e672675c`
(backend `3b88c416` + frontend `e672675c`), base `b2e6de10` (pre-dates
`next`'s resizer merge, as flagged). Worktree:
`/home/bork/w/omega/.claude/worktrees/macro-public-id-tokens`.

## VERDICT: ACCEPT-WITH-NITS

The change is correct, tenancy-safe (adversarially verified live, not
just trusted from the builder's own tests), wire-clean, and its scope
matches the adjudicated spec (ledger rows 498/500) exactly: server-side
resolution, no client-side/async resolver, raw PKs never reach the SPA
for this purpose. The only real "nit" is that the branch needs the
schema-version renumber at merge time (expected — flagged in the
dispatch brief) and one disclosed test gap that's cheap to close. Full
compose recipe below is WITNESSED, not just calculated.

## Compose recipe (exact, WITNESSED)

Base `next` has since advanced past this branch's `b2e6de10` base,
picking up the resizer-rearch merge's own `65 → 66` migration
(`CURRENT_SCHEMA_VERSION = 66`). This branch's own `65 → 66`
(`cardsContextGameSourceOrdinals` backfill) collides on the same
version number. I performed the actual trial merge in a scratch
worktree (`/tmp/omega-macro-trial-merge`, branch
`review/macro-trial-merge-v2`, commit `733877ad`, not pushed) against
current `next` (`a9808651`) and resolved it as follows — this is the
recipe to apply at real-merge time:

1. `git merge --no-ff bork/fix/macro-public-id-tokens` against current
   `next`. Two files conflict: `frontend/src/store/migrations.ts` and
   `frontend/src/store/archived-migrations.ts`. Everything else
   auto-merges cleanly (backend files, `ForestDirectory.vue`,
   `useCardTreeData.ts`, `backend-service.ts`, locales, `schema.ts`,
   `defaults.ts`, `types/backend.ts`, the new test files).
2. `migrations.ts`: bump `CURRENT_SCHEMA_VERSION` to **67**. Keep
   `next`'s `65 → 66` (resizer strip) unchanged as the older of the two
   active anchors. Renumber this branch's `cardsContextGameSourceOrdinals`
   backfill from `65 → 66` to **`66 → 67`** — body unchanged, only the
   version slot and its doc-comment move (the append-only invariant is
   about a migration's *body* once it has a version, not about
   pre-merge slot contention between two branches that both claimed the
   same number off the same base).
3. Rolling-archive discipline now has **three** active migrations
   (`64 → 65` forestNav-clear, `65 → 66` resizer-strip, `66 → 67`
   macro-backfill) — one over the "exactly two" steady state. Roll the
   now-third-oldest, `64 → 65` (browse-leak-fix's `forestNav.selection`
   clear), into `archived-migrations.ts`, appended after the existing
   `63 → 64` entry. Update both files' header/scope comments
   (`archived-migrations.ts`: "1 → 2 through 64 → 65 (64 entries)";
   `migrations.ts`: "currently 1 → 2 through 64 → 65").
4. Update the two `(schema-version 66)` doc-comment references in
   `schema.ts` and `defaults.ts` to `(schema-version 67)`.
5. No test-block renumbering was needed: this branch added no dedicated
   case to `frontend/tests/unit/store/migrations.test.ts` (see gap
   below), and the existing `step(65)`/`step(N)` helpers there index by
   **version number** (`migrations[fromVersion - 1]`) against the full
   spread array, which stays correct automatically once the archive
   move and the active array are consistent — verified by re-running
   the full suite (below), including
   `'contains exactly CURRENT_SCHEMA_VERSION - 1 entries'`.

Full diffs of my resolution are in the scratch worktree
(`/tmp/omega-macro-trial-merge`, commit `733877ad`) for reference; not
pushed anywhere, throwaway.

### Composition gates — WITNESSED, both green after the real renumber

- **Backend** (`./venv/bin/python -m pytest -q`, fresh venv built in the
  scratch worktree, pinned versions matched to the build's own worktree
  venv via `pip freeze` diff — `bcrypt==5.0.0`,
  `python-multipart==0.0.32` were the only gaps against
  `requirements.txt`, an existing environment-pinning looseness
  unrelated to this change): **719 passed, 2 skipped, 1 xfailed** —
  identical numbers to the builder's own isolated-worktree run.
- **Frontend**: `npm run build` clean (only the pre-existing >500kB
  chunk-size advisory); `npx eslint .` clean, exit 0; `npm run test:run`
  → **1455 passed, 4 skipped** (higher than the builder's isolated 1364
  because `next` has grown more tests since this branch's base — no
  new failures from the compose).

## Scrutiny findings

### 1. Tenancy — adversarial, live probe (WITNESSED, not just read)

I did not trust the builder's own tests. I started my own scratch
server (`uvicorn main:app --port 19731`, scratch SQLite at
`/tmp/omega-macro-adversarial-scratch.db`, `SECRET_KEY` set explicitly
— never `:8764`, never `cards.db`) against the composed trial-merge
worktree, registered two real tenants via `/auth/register` +
`/auth/token` (multi-tenant path, not the passwordless auto-provision),
and issued live `/forests/query` requests:

| Probe | Result |
|---|---|
| Alice queries her own `game_source_ordinal=1` | `200`, own data |
| Alice queries Bob's `game_source_ordinal=2` (Bob-only, never allocated to Alice) | **`404`** — `"game_source with display_ordinal=2 not found for this user"` |
| Alice queries a **batch** `[1, 2]` — her own valid ordinal plus Bob's cross-tenant one | **`404`**, the whole request fails — no partial/silent result for the ordinal that *did* resolve |
| Alice queries a wholly unknown ordinal `999` | `404`, same message shape |
| Bob queries `game_source_ordinal=1` — a number that **collides** with Alice's own ordinal=1 (per-user ordinal namespaces) | `200`, Bob's own data — no cross-tenant bleed from the numeric collision |

This directly answers the brief's batch-shape question: an unresolvable
token in a batch fails the **whole** query loudly (`GameSourceNotFoundError`
raised on the first unresolved ordinal, checked in input order inside
`LineageRepository.resolve_game_source_root_card_ids`), not a silent
partial drop — which is exactly the failure mode the ADR-0002-governed
prior incident (the always-empty macro) was itself an instance of, so
this is the right choice and it's enforced, not just documented. The
404-not-403 collapse holds: "doesn't exist" and "belongs to someone
else" are the same response by construction (single fused
`WHERE display_ordinal IN (...) AND user_id = :user_id`), matching
`docs/notes/tenancy.md`'s headline invariant.

The builder's own test suite (`test_forests_query_cross_tenant_game_source_ordinal_is_404`,
`test_cross_tenant_game_source_ordinal_raises_game_source_not_found`,
plus the DSL/executor unit tests) covers the single-ordinal cross-tenant
case and the unknown-ordinal case, but **not** the mixed-batch case
(one valid + one cross-tenant ordinal in the same request) — my live
probe is the only evidence for that specific shape. It passed. Worth
adding as a permanent regression test (see Disclosed gap below, second
item).

Server cleanup: killed via background-task cancellation (exit 144,
signal-terminated, not a leaked process — confirmed via `ps aux | grep
19731` returning empty afterward), scratch DB file removed. `cards.db`
mtime (`19:44:54`) predates the entire review session; unmodified. No
process on `:8764`/`:5173`/`:5174`/`:4173`.

### 2. Wire discipline

`git diff next...HEAD -- frontend/src/types/backend.ts` (OpenAPI diff,
done myself against the branch, not trusting the builder's own
regeneration claim) shows exactly one schema touched: `ForestQuery`
(`context_ids` required → optional-default-`[]`, `+game_source_ordinals`).
No response schema changed. Confirmed
`test_global_sequence_schema_walk.py` — read the actual test body, not
just its docstring — contains a live assertion
`assert "ForestQuery" not in reachable` at line 191, where `reachable`
is `_response_reachable_schema_names(schema)`: this is an enforced gate
against `ForestQuery` ever becoming response-reachable, not a
comment-only claim. It passed in the composed suite. No raw PKs
reappear anywhere in the response side; `game_source_ordinals` only
flows in.

### 3. The macro's `CardId`/`cardIds` literal passthrough

Verified against `frontend/IDENTIFIERS.md` directly (not the build
report's characterization of it): `CardId` is explicitly documented as
a **per-user-id-enumeration allowlist exception** — "the addressing
value every already-fetched, tenant-scoped card round-trips through"
— unaffected by browse-leak-fix, which scoped its raw-PK closure to
`GameSourceId` on `/stats/forests` and `/lineage/*` specifically.
`CardPublicId` (UUID) exists as a sibling brand for reference-role
uses, but cards were never moved off raw-PK addressing on this wire
path. The macro's literal (non-`${}`) tokens staying raw `CardId`
integers is therefore not a leak and not a dead token class — it's the
documented, load-bearing exception, consistent with pre-existing
design. Confirmed independently, not taken on the builder's word.

### 4. Store migration — content + composition

Migration body (`65 → 66` on the branch, renumbered to `66 → 67` at
merge): idempotent (`Array.isArray` guard, only backfills a
missing/malformed leaf), witnessed-container-gated
(`session.ui` present from v1), additive-only, matches the
`defaultSessionUI` seed for fresh installs. Correct. The trial-merge
composition (above) is the load-bearing evidence that the recipe
actually produces a working `migrate()` walk end-to-end — not just a
plausible-looking renumber — and both full suites passed against it.

### 5. Frontend threading

Traced `store.session.ui.cardsContextGameSourceOrdinals` →
`ForestDirectory.vue::updateContextIds` (writes it from
`expandContextIdMacros`'s new `gameSourceOrdinals` output) →
`tree.runPipeline` (both call sites, `runDeck` and
`startReviewFromConfig`, updated) → `useCardTreeData.ts::runPipeline`'s
new `gameSourceOrdinals` param → `backendService.queryForest`'s new
param → wire field `game_source_ordinals`. `grep`'d all call sites of
`runPipeline(`/`queryForest(` in `src/`: the only caller that does
*not* pass the new param is `BackendService::fetchEbisuSession` (an
unrelated review-session flow with no macro involvement), which
correctly defaults to `[]` — not a broken consumer, a correctly-scoped
one. `gen:api` regeneration diff matches what I generated independently
(same `ForestQuery` delta as builder's own report). The dead-state
UI hint/warning (`warnedMacroTokens`, "always resolves to no matches")
is fully replaced — the always-empty-degradation code path is gone,
not left dangling alongside a new one; the hint text and tooltip
(`en.json` diff) now correctly describe server-side resolution
("→ Sends:" instead of "→ Expands to:").

### 6. Disclosed gap — no dedicated migration round-trip test

Confirmed as disclosed: no synthetic-v66-blob (now v66→67) test exists
pinning this migration's body specifically, only the composition-corpus
`migration-store-roundtrip.test.ts`, which passed unmodified. Given the
body is a two-line idempotent backfill with a witnessed container and
the pattern is identical to three prior precedents in the same file,
severity is low, but it's cheap to close — recommend adding, in
`migrations.test.ts`, a `step(66)` block (post-renumber) mirroring the
existing `step(65)`/`step(63)` blocks: (a) backfills a missing key to
`[]`, (b) preserves a pre-existing array unchanged (including `[]`
itself), (c) is a no-op when `session.ui` is absent. ~15 lines, same
shape as the adjacent `deltaViewMode`/`forestNav` blocks already in the
file. Also recommend promoting my live mixed-batch adversarial probe
(§1) into a permanent backend integration test
(`test_forests_routes.py`): a batch with one valid + one cross-tenant
ordinal → `404`, not a partial `200`. Neither blocks accept; both are
cheap, well-scoped follow-ons.

### 7. Standing checks

- `waitForTimeout`/sleep-as-sync: grepped every new/changed test file
  (backend and frontend) — zero hits. No Playwright was used for this
  build (correctly — no live-app visual behavior changed enough to
  warrant it); backend pytest + Vitest were sufficient.
- Own-port isolation: builder's port 19764 (gen:api) and my own 19731
  (adversarial probe) — both scratch, both killed, no stray processes,
  `cards.db` mtime unmodified across the whole review session.
- Failure-paths-first (ADR-0021 / `backend/tests/CLAUDE.md`): confirmed
  in file order — `test_forests_routes.py` and `test_pipeline_e2e.py`
  both write the unknown-ordinal and cross-tenant-ordinal RED cases
  before the happy path.
- Column projection: `resolve_game_source_root_card_ids`'s two queries
  select only `game_source.id`/`display_ordinal` and `card_source.card_id`
  — minimal, no wire response involved (server-internal resolution).

## Per-claim evidentiary status (reviewer's own, independent of the builder's table)

| Claim | Status |
|---|---|
| Cross-tenant ordinal → 404, not a leak | WITNESSED — live adversarial probe, own scratch server, two real registered tenants |
| Batch with one cross-tenant ordinal fails the whole query loudly | WITNESSED — live probe; no automated regression test yet (gap noted, cheap to add) |
| Colliding per-user ordinal numbers don't cross-resolve | WITNESSED — live probe (Alice's and Bob's both ordinal=1, each resolves to own data) |
| `ForestQuery` never response-reachable | WITNESSED — read `test_global_sequence_schema_walk.py`'s actual assertion, not just its docstring; passed in composed suite |
| `CardId` literal passthrough is documented, not a fresh leak | WITNESSED — read `frontend/IDENTIFIERS.md` directly |
| Compose recipe (renumber 66→67, rolling-archive move, version bump) actually works | WITNESSED — real trial merge against current `next`, both full suites green after |
| Frontend consumer threading complete, no broken caller | WITNESSED — grepped every `runPipeline`/`queryForest` call site |
| No live-port/stray-process contamination | WITNESSED — `ps aux` checks, `cards.db` mtime check, scratch DB removed |
| Migration test-block renumbering needed | UNEXERCISED as "needed" — checked and found none required (no dedicated test existed to renumber) |
| Dedicated migration round-trip test for 66→67 | Disclosed gap, confirmed real, low severity, concrete follow-on given |

## Summary

Design matches the adjudicated spec exactly: server-side, tenancy-scoped
resolution; synchronous macro expander; no client-side/async resolver;
raw PKs never cross the wire for this purpose; the dead-macro UI
degradation is fully replaced by working expansion. Tenancy is sound
under adversarial live probing, including the batch-shape question the
brief specifically flagged. The only real work remaining is mechanical:
apply the renumber recipe above at actual merge time (now demonstrated
to work, not just planned) and optionally close the two cheap test
gaps noted in §6.

**ACCEPT-WITH-NITS.**
