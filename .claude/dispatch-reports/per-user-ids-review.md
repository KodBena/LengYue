# Fresh-context review — per-user display enumeration + non-leak guarantee

Branch `worktree-agent-a25df06ab6f428865` (worktree
`/home/bork/w/omega/.claude/worktrees/agent-a25df06ab6f428865`), base `next`
(merge-base `7de45fcb`, two commits behind current `next` tip —
`348ae189`/`72e4f45c` not merged in; not itself a defect, but the
merge-before-close must rebase and rerun gates). Commits reviewed:
`ddc2dd92` (schema/migration), `cd5eb73c` (wire/ACL), `e752713e`
(enforcement tests), `669065cf` (build report).

## Verdict: ACCEPT-WITH-FINDING

The mechanism is sound and well-executed — schema, migration, counter
atomicity for the common case, and the schema-walk enforcement test are
all real, tested, and witnessed. But there is one finding serious enough
that it must be dispositioned by the commissioner before this closes as
fully discharging the ruling: **the "deferred follow-on" fields
(`/stats/forests`, `/lineage/*`) are not just an addressing exception —
they are painted as raw global PKs on-screen today, in a live, mounted
panel**, and neither the build report nor the ledger rows discloses that
fact. That is the literal shape of the commissioner's complaint
("a new user currently will see game ids like 50000+"), left open by
this build without saying so plainly.

## Top finding (WITNESSED) — the deferred class is a display leak, not just an addressing one

`frontend/src/components/tree/ForestTreeNav.vue` (untouched by this
diff — confirmed absent from `git diff next...worktree-agent-a25df06ab6f428865
--stat`) renders, for every game and every root card in the Browse
panel:

```
frontend/src/components/tree/ForestTreeNav.vue:111
>#{{ game.gameSourceId }}</span>
frontend/src/components/tree/ForestTreeNav.vue:144
>#{{ root.rootCardId }}</span>
```

`gameSourceId`/`rootCardId` here are sourced from `GET /stats/forests`
(`ForestStat.root_card_id` / `.game_source_id`) via
`useForestStats.ts` → `backendService.getForestStats()`. Both fields are
on the build's own "deferred follow-on" allowlist
(`tests/enforcement/global_sequence_allowlist.py`), i.e. they are
still the raw global-sequence PK, unconverted to `display_ordinal`/
`public_id`/`client_game_id`.

`ForestDirectory.vue` (which contains `ForestTreeNav`) is mounted
directly in `App.vue:461` — this is not a dead or admin-only surface,
it is the mainline Browse tab. The maintainer's own GoGoD-scale account
(the account the commission's complaint was literally about) will,
today, after this ships, still see `#50231`-shaped numbers on-screen in
Browse — unchanged by this build.

This matters because of *how* it's dispositioned. The design doc
(`per-user-id-enumeration-design.md`, Decision 4) named exactly one
"genuine narrowing" — the `GET /cards/{card_id}` **path param** — and
was explicit that a path param is not a display or response-body leak
("it leaks nothing about cardinality either, because the path param is
never displayed or logged to the user"), and flagged that one exception
as an open question for the maintainer. The build (ledger row 329)
extends this same "named exception, addressing role" framing to the
lineage/stats fields wholesale — but those fields are *not* addressing-
only the way the path param is; `root_card_id`/`game_source_id`
specifically are already read off the response body and rendered
directly as visible digits, which is exactly the response-body-display
case the design doc's own reasoning said would be a genuine breach.
Row 329 and the build report both name the CTE-rework cost as the
reason for deferring, but neither states that the deferred fields are
currently on-screen — a materially different risk profile than "an
internal addressing value with no display consumer," and the kind of
fact CLAUDE.md point 7/12 requires be ledgered explicitly (an
unledgered load-bearing fact about the narrowing's actual blast
radius). This should go back to the commissioner as a named, explicit
question — not be treated as already covered by row 329's disposition.

To be fair to the builder: this is a **pre-existing** UI site (not
introduced by this diff), the survey in the design doc did name
lineage/stats as a "deferred follow-on" class in the allowlist with
reasons, and it isn't silent — it's enumerated, just not enumerated
*as a display leak*. The ceiling is named ("review-only" for semantic/
free-text leaks); this finding is that the ceiling as stated doesn't
cover a leak that's already structural (a real field on a real
response, not a string interpolation), which the "honest ceiling"
language in Decision 7 doesn't quite anticipate either.

## Scrutinized items

**1. Schema-walk allowlist gate quality — WITNESSED, real gate.**
Independently probed by renaming the `("ResolvedRoot",
"root_card_id")` allowlist key via a throwaway edit and rerunning
`test_global_sequence_schema_walk.py`:

```
FAILED ...test_no_unlisted_global_sequence_field_on_the_wire
AssertionError: Unlisted id-shaped integer field(s) on a
response-reachable wire schema: ['ResolvedRoot.root_card_id']
```

then reverted (file diff clean afterward, confirmed via `git status`).
This is a genuine gate over the whole OpenAPI response graph (BFS from
every path's `responses` block, following every `$ref` transitively),
not a fixed list of known shapes — a new response model with an
unlisted `*_id`/`*_ids` integer field will fail collection-time,
regardless of which route introduces it. The builder's self-reported
regex-bug fix (`[a-zA-Z0-9]+_id` → `[a-zA-Z0-9_]+_id`, needed to catch
`root_card_id`/`card_source_id`/`game_source_id`) checks out by
inspection — the current regex is `r"^(id|[a-zA-Z0-9_]+_id|[a-zA-Z0-9_]+_ids)$"`,
underscore-inclusive. Confirmed `TreeNode` carries only `id`/`children`
(no separate `parent_id` on the wire — `parent_id` only exists as a
non-serialized computed property on `domain/tree_engine.py`'s internal
graph node, never a Pydantic field), so there's no missed field of that
shape to probe further.

**2. The named narrowing — see Top Finding above.** Endpoints are
confirmed user-facing today (`ForestDirectory`/`ForestTreeNav` mounted
in `App.vue`); the guarantee is breached in practice for that panel,
not just deferred as an internal addressing gap.

**3. Counter concurrency — PARTIAL, one gap.** `display_counters.py`'s
`UPDATE ... RETURNING` is a real atomic read-modify-write once a
counter row exists (row-lock protected); the lazy-upsert first-mint
path has a disclosed, accepted race window (two concurrent first mints
for a brand-new user could both attempt the INSERT — the primary key
serializes them, one gets `IntegrityError` rather than a silent
duplicate, and the `UNIQUE(user_id, display_ordinal)` index is a
second backstop against a duplicate ordinal ever landing). This
tradeoff is stated honestly in the module docstring.

However: the design's own acceptance-handles list named a required
Tier-3 test — "concurrent-insert race test against `seeded_session`
(two coroutines minting cards for the same user_id, assert two
distinct ordinals, no duplicate-key error)" — and it was **not
built**. Confirmed by search: no `asyncio.gather`/`create_task` usage
anywhere in the touched or existing test tree. The cross-tenant
property test (`test_cross_tenant_display_ordinal_property.py`) is
explicitly **sequential** (tenant A mints all N objects, then tenant B
mints — by construction, not concurrently; the test's own docstring
frames it as a cardinality-independence property, not a concurrency
property, so this isn't a mis-billed test, just a real coverage gap
against a different, real acceptance handle). Concurrency here is
architecturally plausible (row-level UPDATE...RETURNING) but currently
unwitnessed by any test in this diff or the existing suite — flag as
UNEXERCISED, not wrong.

**4. Migration round-trip — WITNESSED, correct.** Independently
reproduced outside the test suite: fresh `metadata.create_all` +
`bootstrap_alembic` stamp, seeded two users / two game_source rows /
three card rows / a hand-set `user_display_counters` state, then
`alembic downgrade -1` (columns/index dropped, counter rows deleted,
confirmed via direct sqlite3 queries) then `alembic upgrade head` a
second time. Result: `display_ordinal` re-derived correctly per user in
creation order (user 1's two cards → `1, 2`; user 2's card → `1`),
`user_display_counters` reseeded to the exact pre-downgrade values
(`(2,1)`, `(1,0)`), `public_id`/`client_game_id` freshly re-minted
(expected and documented — the downgrade docstring is explicit that it
doesn't attempt to resurrect the pre-downgrade UUID values). Backfill
order is `(creation_date/created_at, id)` as documented, tiebreak
correctly on `id` not primary sort. `REVISION_MARKERS` gained the
required entry (`backend/CLAUDE.md` step 5) with a correct justification
for why a probe marker is reliable on a baseline (pre-v1.0) table.

**5. Frontend display sites — WITNESSED for the two in-scope sites,
NOT WITNESSED for the Browse panel (see Top Finding).**
`card-tree-echarts.ts`'s on-canvas label now reads `displayOrdinal`
(confirmed in diff, matches the design's literal fix target and the
commissioner's stated complaint about `fb704f6b`'s raw-PK label);
`LibraryTable.vue` gained a genuinely net-new `#` column showing
`displayOrdinal` (no prior numeric render existed there, confirmed by
re-reading the file). `gen:api`-regenerated `backend.ts` is internally
consistent with the backend schemas (`public_id`/`display_ordinal`
present with correct types on every model that gained them; `Optional`
correctly dropped where the exception closed). No site in the diff
still renders a *global* id as a display value — the Browse panel that
does was simply not touched.

**6. Merge-from-`next` regressions — none found.** The worktree has no
merge commit in its own history relative to `next`'s merge-base
(`7de45fcb`) — it's a linear stack of three commits on top of that
base, not an octopus merge, so there's no merge-commit diff to check
for silent regressions. The base is two `next` commits stale
(`348ae189`, `72e4f45c` — a ruleset default fix and a mint-card hotkey,
both frontend, unrelated to this change's surface) — routine rebase
needed before merge, not a regression risk by inspection of what's
missing.

## Gates run (all WITNESSED, all green)

- Backend: `./venv/bin/python -m pytest -q` → **702 passed, 2 skipped,
  1 xfailed**.
- Frontend: `npm run build` → clean (`vue-tsc -b && vite build`
  succeeded, only the pre-existing >500kB chunk-size advisory, unrelated).
- Frontend: `npx eslint .` → clean, exit 0.
- Frontend: `npm run test:run` → **1322 passed, 4 skipped**.

## Minor, non-blocking notes

- `api/routes/cards.py`'s new `assert created is not None` (post-insert
  re-fetch) is the only bare `assert` in the routes tier — every other
  route uses an explicit exception. Under `-O` it's stripped, but the
  failure mode is still loud (an `AttributeError` on `.public_id`
  immediately after), so this isn't a silent-failure risk, just a
  style inconsistency worth a follow-up nit.
- `backend/requirements.txt` missing `pytest`/`pytest-asyncio`/`httpx`/
  `aiosqlite`/`bcrypt`/`python-multipart` is pre-existing and disclosed
  by the builder, not this change's defect.
- The process-hygiene incident (killing the maintainer's live backend
  on port 8764) is fully disclosed in the build report with a stop-order
  and remediation; the maintainer still needs to manually restart that
  service — this review did not touch it and can't confirm current
  state.

## Recommendation

Do not block the schema/migration/wire units (1 and 2) — they are
correct, tested, and independently re-verified above. Before closing
`per-user-ids-enforcement` (and before telling the commissioner the
non-leak guarantee is discharged), get an explicit ruling on the
Browse-panel finding: either (a) the commissioner accepts the narrower
scope with the display-leak fact now on the record, or (b) `ForestStat`/
lineage gets a fast, display-only fix (thread `display_ordinal` through
`StatsRepository.fetch_forest_members` for the two fields actually
rendered, without the full CTE/reference-role rework) as a fourth,
small follow-on unit. The concurrent-mint race test named in the
design's acceptance handles should also get filed as an open ledger
item if it isn't already, since it's currently unwitnessed.
