# Backend Refactor — Reflection

- **Status:** Closes the pre-release backend infrastructure work.
- **Genre:** Architectural reflection. Distinct from the four ADRs
  (which describe decisions) and from the tenancy system note
  (which describes the implemented system).
- **Audience:** Future contributors. Future-self if returning to
  this codebase after a long pause.

## What this document is

A working contributor's assessment of the architecture at the
close of the pre-release sweep — what the code does well, where
it's weakest, and what an experienced contributor on the next
significant change should know. Honest, not promotional.

The aim is to capture the architectural lessons that surfaced
during the build and to flag the rough edges before they're
forgotten. The four ADRs and the tenancy note describe the
*system*; this describes the *terrain* — where it slopes, where
the load bears unevenly, where someone could misstep.

## Rough edges to know about

The strongest section. If you read nothing else here, read this.

### `domain/tag_dsl.py` is structurally an adapter

`TagDSLCompiler` lives in `domain/tag_dsl.py` and produces a
SQLAlchemy `Select` object. It imports from `db.schema` and from
`sqlalchemy`. By the Dependency Rule, it should not be in
`domain/`.

Why it's there: tests use it directly, and moving it would
inconvenience the tests. The Port abstraction
(`TagFilterRepositoryPort`) exists at the right level; it's the
implementation that's misfiled. This file was not yet in `domain/`
when ADR-0003 landed, and the Dependency Rule retrofit caught
most violations but missed this one.

Future cleanup: move `TagDSLCompiler` to `repositories/`. Tests
that currently import it directly switch to using
`TagFilterRepository` (or a `FakeTagFilterRepository`). Small
move; the resistance is purely test-ergonomics, not architectural.

### The executor couples lineage and tag-filter into one method

`PipelineExecutor.run()` calls `lineage_repo.fetch_selection()`
and then optionally `tag_filter_repo.card_ids_matching()`. Two
Port calls, one method. The two are conceptually independent —
one materializes a tree shape, the other materializes a tag
filter set — but they're temporally coupled in the executor.

A more decomposed design would separate them: `pool_from_lineage`
returns the lineage-derived pool; `apply_tag_filter` is a separate
operation; the executor composes them. The current shape works,
but `run()` is the largest method in `domain/pipeline.py` and the
hardest to reason about.

Worth a refactor if the executor grows further (a third Port for,
say, analysis-record fetches). Not worth it at the current size
— premature decomposition.

### `_recursive_descent_cte`'s parameter list approaches the breaking point

After items 30d (extraction), 16 (tenancy filter), and 30c
(multi-context), the helper takes `base_predicate`, `base_depth`,
`user_id`, `max_depth`, `name`. Five parameters, one keyword-only
required, two optional. Still readable, but the parameter list
has grown to where adding one more would tip it into "this should
be its own class."

If a future feature wants a sixth parameter, the right move is
introducing a `RecursiveDescentSpec` dataclass that bundles them.
For now, five parameters is fine.

### `game_source.user_id` is defense-in-depth, not load-bearing

Existing read paths reach `game_source` via the `card_source ⋈
card` chain, which already filters on `card.user_id`. The new
column matters for writes (stamping the creator) and for any
future direct-on-`game_source` query, but no production query
path strictly requires it today.

Worth knowing because it might be tempting, in a hypothetical
future "let's slim the schema" pass, to drop the column. Don't —
it's the consistency anchor that lets you trust `game_source`
ownership without re-deriving it through the join chain. Cheap to
keep, expensive to recreate.

### Migration scripts assume single-deployment topology

Each migration is a one-shot script that runs against a single
DATABASE_URI. For a multi-region deployment, or read replicas, or
any non-monolithic shape, this is too simple — Alembic or
equivalent would handle those topologies natively.

The current shape works for single-machine deployment, which is
the only deployment shape this codebase has had. When deployment
shape changes, migration tooling becomes a real concern. Plan for
the conversion, don't paper over it.

### No row-level audit log

The system records `user_id` on every row but doesn't track
*which* user made *which* change to *which* row over time. For a
two-user-Alice-and-Bob install this is fine; for any
compliance-flavored deployment it would need an audit table.

Adding one is non-trivial — every mutating service method gains a
"who's calling and from which session" handle, with the audit
write happening alongside the data write in the same transaction.
Worth flagging because it's the kind of thing where retrofit
costs more than getting the architecture right at design time. If
the codebase ever moves to a deployment that needs auditing, plan
for a real refactor, not a sprinkle-on patch.

### No tenant deletion path

Removing a user means cascade-deleting their cards, documents,
and game_sources. The schema has `ON DELETE CASCADE` on
`card_source.card_id` and `card_tag.card_id`, but no script
exists to do the user-level cascade safely.

Deferrable until a user actually wants to leave; building it
ahead of time would shape against speculation. Worth knowing it
doesn't exist when the question first comes up.

## What earned its place architecturally

Three patterns proved their value across the arc and deserve
explicit recognition. Each generalizes to other projects.

### The Port boundary as a single seam

Six Ports total: `CardRepositoryPort`, `CardWriteRepositoryPort`,
`LineageRepositoryPort`, `TagFilterRepositoryPort`,
`StatsRepositoryPort`, `StaticResourceRepositoryPort`.

Every subsequent feature request — domain rename (34a/34b),
tenancy spine (13-25), CTE consolidation (30c/30d) — became a
*small* change because the Port surface was already the right
shape. Item 25's threading of `user_id` through the executor was
a 30-line change because item 16 had prepared the Port
signatures. Item 23's documents-table tenancy was three files
because the route/Port/adapter trio was the shape that wanted
threading.

The lesson: **the right time to extract a Port is the moment you
can name two different consumers** — a route and a service, two
services, a service and a test. If you can name only one, you're
speculating; wait. If you can name two, the abstraction shape is
already implied; extract, and every subsequent consumer falls
into the same shape for free.

The first Port (21f) had real extraction work; the sixth Port
cost about 5% of the first. Each addition reinforced the pattern
rather than expanding it.

### Bounded compat shims, scheduled for removal

ADR-0002 explicitly accommodates "temporary, bounded,
explicitly-scheduled-for-removal compat shims." This pattern
carried more weight than initially appreciated. Three places it
applied:

- **34b's three-commit dance.** Backend dual-accept/dual-emit
  during the wire rename, with cleanup scheduled for an explicit
  Commit 3b that ran when the operator judged the stale-bundle
  window closed.
- **PipelineExecutor's `UserId(1)` shim during items 13-16.** The
  Port signatures changed before the executor was ready to
  consume them. Item 25 was the scheduled removal.
- **Migration scripts' "nullable then NOT NULL" pattern.** Each
  new tenancy column landed nullable with a default, was
  backfilled, then tightened. (In practice, SQLite's "ADD COLUMN
  with DEFAULT NOT NULL" allows the one-step path, and we used
  it. The two-step pattern remains available for column changes
  that cross dialect capability differences.)

The discipline that makes this work is **explicit scheduling**:
every shim has a TODO marker, a commit-message mention, and a
follow-on item that will remove it. Without the schedule, shims
rot. The 34b stale-client compat shims that lingered in
`domain/card.py` post-3b would have rotted into permanent
residents if they hadn't been explicitly enumerated as "safe to
remove in commit-3b."

### Sandi Metz's "duplication is cheaper than the wrong abstraction"

Repeatedly applied. The clearest example: the
`_recursive_descent_cte` helper started as inline code in three
places (DescendantSelection, SubtreeSelection, fetch_lineage).
Item 30d extracted it — but only after all three call sites had
been written and were structurally identical. Pre-extracting
after seeing one or two would have produced a helper shaped
against speculation; the result would have been worse than the
duplication.

The corollary: **don't extract the second helper just because you
extracted the first one**. The non-recursive selection variants
(`ContextSelection`, `SiblingSelection`, AncestorSelection's
parent-walk) share only `select(...).cte()`, which is too thin to
be worth a helper. They stayed inline. The codebase has one
helper, not two; the second would have been wrong-shaped.

This applies recursively to the Ports. Six Ports is the right
count because each names a real consumer-distinct contract.
Splitting `CardRepositoryPort` into separate `GetCardPort`,
`UpdateCardPort` would be over-fragmentation by the same logic
that says don't pre-extract.

## Things I would have done differently

Three concrete ones, in priority order.

### Documentation as you go

The four ADRs and this document were written at the close of the
work. In both cases, writing sooner — incrementally, alongside
the code changes — would have been more useful.

**Documentation is cheaper to write while you remember why, not
when you reconstruct why later.**

ADR-0001's existence prompted ADR-0002, which prompted ADR-0003,
which prompted ADR-0004. The sequence shows that authoring
discipline propagates — if the first ADR exists, the second is
easier; if the second exists, the third is easier still. Starting
from "let's write an ADR for this decision when we make it"
rather than "let's batch the ADRs at the end" would have produced
more, and better, architectural records across the arc.

### The tenancy spine in a different order

The spine ran 13 → 14 → 15 → 16 → 23 → 24 → 25. In hindsight,
**item 25 first** would have been better. The executor sits at
the architectural top of the read-path stack; threading `user_id`
through it requires the lower-layer Ports to already accept the
parameter. The pre-25 order required the explicit `UserId(1)`
shim because the Ports changed before their consumer was ready.

But: doing 25 first is harder to *implement* without all the
lower Ports being ready. The executor would need its own shims
into Ports that didn't yet take user_id. This is the cost of
top-down implementation: you build in mid-air.

The pragmatic right answer is probably **decide the route-to-
adapter signature uniformly, write a single big-bang change**.
Land it as one PR, with review focused on the shape rather than
the sequence. The intermediate-shim pattern works but it's
friction that better up-front planning could have avoided.

### Migration scripts should include a verification phase

Each migration applies a change. Most include an idempotency
check (skip if already applied). Few include a *verification*
phase — query the post-state to confirm the change took effect
and the data is in the expected shape.

Adding 5-10 lines per script — `SELECT count(*) FROM affected_table
WHERE expected_post_condition` and erroring loudly on mismatch —
would catch a class of subtle bugs (data not where you expected
it, partial migration commits, schema-drift) at apply-time
rather than at next-feature-time. The 34b drop-column script's
pre-flight check was this pattern done right; it should have
been the rule for every script.

## What to tell a future contributor

Three things, in priority order.

**Read the four ADRs first.** Especially ADR-0002 (fail loudly).
The codebase's architectural personality lives there, and any
contribution that fights the personality will be a bad fit — not
because the ADRs are sacred, but because the codebase has
internalized them and a contribution against the grain causes
friction wherever it touches.

**Trust the Port boundary.** The six Ports are the load-bearing
abstraction. New features compose at the Port level; new tests
use Port-shaped fakes; new persistence backends would implement
the Ports. Don't reach around the Port to the adapter; don't add
business logic to the adapter; don't make the service know about
SQL. The discipline is policed by code review, not the type
system, but it's a real discipline and it's what keeps the
codebase tractable.

**ADR-0004 generalizes.** "Don't edit blind, ask for the
context" is a discipline articulated for partial-file-visibility
edits, but its spirit applies broadly: when in doubt about the
state of the system, ask before guessing. The cost of asking is
small; the cost of guessing wrong is days.

## Closing

The codebase is in good shape. Six Ports cleanly composed, four
ADRs that capture the discipline, a tenancy spine that's honest
about what it guarantees, migration tooling reusable for the next
schema change. The frontend's analogous work (typed wire shapes,
fail-loud surfacing, OpenAPI codegen) means the two halves of the
system understand each other.

What remains — frontend cleanup post-34b, the monorepo
restructuring, eventual public deployment — is incremental work
on a sound foundation. None of it requires architectural
excavation.

The pre-release infrastructure sweep is closed. Hand off in good
condition.
