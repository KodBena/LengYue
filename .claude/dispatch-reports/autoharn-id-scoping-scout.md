# Scout report: how autoharn achieves "scoped/compartmentalized" ids

Target: `/home/bork/w/vdc/1/autoharn` (read-only). Question: does autoharn's SQL demonstrate a
trivial/transparent way to hide global PKs behind per-user/per-scope ids, of the kind LengYue
had to pay a wire-breaking rename for?

## Headline finding (read this first)

**Autoharn does not do per-scope/per-user id renumbering at all.** The row ids the CLI/verbs
print as "row 450" etc. ARE the raw global `bigserial` primary key — the same integer, in the
same global counter, exposed to every reader. There is no `ROW_NUMBER()`-backed presentation
view, no per-scope counter table, no composite `(scope_id, local_no)` key, and no generated
column that remaps identity into scope-local coordinates anywhere in `kernel/lineage/*.sql`
(1224 SQL files scanned; `grep -rn "ROW_NUMBER()"` returns zero hits; `grep` for
`local_no|scope_local|per_scope` returns zero hits). What autoharn actually built (s71) is a
Postgres Row-Level-Security policy that controls *visibility* of rows — which rows a scoped
reader's query result set contains — never *identity* — what number a visible row is called.
"Compartments" in this codebase means "some rows vanish from your SELECT," not "your rows are
renumbered 1..N so you never see the global counter."

## 1. Where do user-visible row ids come from?

Global, single `bigserial` sequence, one per world's schema, declared on the base table itself:

```sql
-- kernel/lineage/s10-schema.sql:22-23
CREATE TABLE IF NOT EXISTS s10.ledger (
    id          bigserial PRIMARY KEY,
```

Every later lineage delta (s11 through s72) either re-issues this same table shape or reads it
through `ledger_current` (a `security_invoker` view, first at `kernel/lineage/s10-schema.sql:41`,
re-created verbatim at every schema-adding delta e.g. `s72-stamp-binding-conjunct.sql:433`).
No delta ever adds a second, scope-relative numbering column. `id` (catalog ordinal 1) is the
one and only row identifier in the whole 77+-column `ledger` row shape (column count per
`kernel/lineage/s57-obligation-revocation-event.sql:161`, "compute_row_hash re-issued to 77
columns"). "Row 450" citations you'd see in ledger prose/CLI output are this literal `id` value.

Per-world compartmentalization of the *sequence itself* is structural, not query-time: each
world gets its own schema/database at birth (`bootstrap/new-project.sh`), and
`kernel/lineage/s15-schema.sql:27-29` and `kernel/lineage/nla-schema.sql:30-31` explicitly
document that the schema/role/database triple is **opaque, not ordinal** ("the subject-facing
schema is `public` (not an ordinal `sNN`)... None correlate to an ordinal or an apparatus
token"). So two different worlds both have rows numbered "1, 2, 3, ..." with zero collision
risk between them — but that's because they are physically separate Postgres schemas/databases,
each with its own independent `bigserial`, not because of any cross-world id-hiding view.

## 2. Is RLS actually used? Yes — for row visibility, not id presentation.

`kernel/lineage/s71-row-level-scope-policies.sql` is the RLS delta (built well after s70's
scope-binding substrate; s71 header calls it "the RLS slot (future birth...) lifted from named
slot to built sibling").

```sql
-- s71-row-level-scope-policies.sql:242-247
ALTER TABLE :"schema".ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_scope_read ON :"schema".ledger;
CREATE POLICY ledger_scope_read ON :"schema".ledger
    FOR SELECT
    USING (:"schema".scope_row_visible(ledger));
```

`scope_row_visible(r ledger)` (s71:127-215) is `SECURITY DEFINER` (to avoid RLS-policy
self-recursion through the `principal_scopes` view it queries — s71:52-73) and keys the
compartment on a per-session GUC:

```sql
-- s71-row-level-scope-policies.sql:142
v_principal_raw := current_setting('app.scope_principal', true);
```

This is the same idiom the project already uses for `app.vendor_session` / `app.vendor_invocation`
(cited at s71:34-36, established in s23/s24) — `missing_ok=true` so an unset GUC reads NULL
rather than raising. **Not** Postgres `SESSION_USER`/role-per-tenant; a single connecting role
(`:"role"`, e.g. `vsr_rw`) is used by every principal, and compartment identity rides on this
one text GUC that the calling code sets per request. The GUC is explicitly disclosed as
**unauthenticated at this layer** — any session that can `SET app.scope_principal` can claim to
be any principal (s71:308-317); the "who may legitimately set this" check is a named,
not-yet-built serving-layer follow-on.

The predicate itself is an **exclusion list**, not an inclusion/remap: a principal's in-force
`principal_scopes` row (from `s70-scope-binding.sql`) carries a `scope_exclusions` jsonb array
over a closed 4-member vocabulary — `kind-class`, `thread`, `work-item-lineage`, `rows` (an
explicit id list) — and `scope_row_visible` returns `false` (row hidden) iff the candidate row
matches one of those exclusion entries; every other row, including the case of no bound scope
at all, passes (fail-safe open, s71:138-215, three named "UNARMED PATH" early-returns).
`ENABLE` not `FORCE` ROW LEVEL SECURITY — the table owner and Postgres superuser bypass it
unconditionally (s71:232-241), and the write path is exclusively owner-run `SECURITY DEFINER`
functions untouched by this policy (s71:253-255) — RLS here gates SELECT only.

## 3. Do clients ever see a global PK, or does every surface speak scope-local coordinates?

Clients/verbs see the raw global `id` directly — there is no seam that hides it. Confirmed by:
absence of any `ROW_NUMBER()`/window-function view, absence of any second "presentation id"
column, and `principal_scopes` itself (`s70-scope-binding.sql:562-568`) selecting
`lc.id AS row_id` straight through with no transform. The RLS policy changes *which rows appear
in the result set*; every row that does appear still carries its own real global `id`. So this
is the opposite of LengYue's problem-space fix: autoharn's "compartments" narrow the row *set*,
they do not launder the row *identifier*.

## 4. How do INSERTs get their numbers? Race handling?

Ordinary Postgres `bigserial` (a sequence + `nextval()` default) on the base table — no
per-scope counter table, no `MAX(id)+1` pattern, no advisory lock scheme found anywhere in
`kernel/lineage/*.sql`. Sequence-level atomicity is exactly Postgres's own `nextval()`
guarantee; nothing bespoke was built for this project. (One unrelated `CREATE SEQUENCE` exists,
`kernel/refusal_seq` in `s43-typed-verdict-write-boundary.sql:388`, for a different, non-ledger
concern — refusal correlation ids — not row numbering.)

## 5. Other load-bearing pieces

- `security_invoker = true` on every view in the `ledger_current` family (first at
  `kernel/lineage/s10-schema.sql:41`, e.g. also `s11`, `s12`, `nla-schema.sql:97`) is what makes
  RLS "propagate for free" to every derived view — s71's own COMMENT on the policy
  (s71:249-260) states this explicitly: one policy on the base table covers `ledger_current`,
  `principal_scopes`, `countersigned_in_force`, `credited_current`, `review_verdicts`, etc.,
  because each is `security_invoker` (runs with the *querying* role's privileges/RLS) rather
  than `security_barrier`/definer-style.
- `scope_row_visible` is the one place `SECURITY DEFINER` is combined with RLS, specifically to
  break a would-be recursive RLS self-reference (querying `principal_scopes`, itself
  `ledger_current`-factored, i.e. `ledger`-backed, from inside a policy gating `ledger` itself).
- Explicitly disclosed as NOT built: (a) boundary/serving-layer route filtering keyed on granted
  "surfaces" (`scope_surfaces`, the other half of a scope — s71 LIMITS, s70 §1b) — RLS here
  only enforces the row-exclusion half; (b) disclosure-mode tiers (`marked`/`hash_stub`/`full`)
  — Postgres RLS can only admit-or-exclude a row outright, it cannot substitute a redacted stub,
  so every excluded row behaves as the "full" tier regardless of its declared mode (s71:325-334).

## Transferability to LengYue (SQLite + SQLAlchemy)

Since autoharn's actual mechanism is (a) one global sequence per physically separate
schema/database ["a world"], plus (b) a row-visibility exclusion filter that never touches
identity — the *closest* transplant to LengYue is **not** "add RLS" (SQLite has none, and
autoharn's own RLS piece is orthogonal to id-hiding anyway). The transplant is really two
separate, much smaller ideas:

- If LengYue's actual pain was leaking a **global counter across tenants/scopes** (id 50000
  reveals total rows-ever), the autoharn precedent that's actually relevant is "each
  compartment is a separate keyspace" — in SQLite terms, either separate databases per tenant
  (heavyweight, matches autoharn's separate-schema-per-world posture), or a genuinely
  scope-local id: a composite key `(scope_id, local_no)` with `local_no` populated by a
  per-scope counter table or a `ROW_NUMBER() OVER (PARTITION BY scope_id ORDER BY id)` /
  trigger-maintained counter — none of which autoharn itself builds; it dodges the problem by
  never sharing a sequence across compartments, not by remapping one.
- If LengYue's pain was leaking a global PK **to other users within the same tenant/scope**
  (row visibility, not counter-inflation), the transferable piece IS query-layer scoping: a
  SQLAlchemy `default_query_class` / mandatory `WHERE scope_id = :current_scope` on every ORM
  query (the app-layer analogue of autoharn's `scope_row_visible` predicate, since SQLite RLS
  doesn't exist and a view-with-scope-parameter can't take a session GUC the way Postgres
  `current_setting` does — SQLite would need the scope value threaded explicitly per query,
  e.g. via a `contextvar` + a SQLAlchemy `with_loader_criteria` global filter). **Crucially,
  the id column itself is unchanged either way** — this pattern hides rows, not renames fields.

**Would field names/values have changed?** Under autoharn's actual mechanism: no. The `id`
column, its type, and its values are identical whether or not RLS/scope-exclusion is active —
a hidden row is simply absent from the result set, and a visible row's `id` is the same number
it always was. If LengYue's rename was to stop a *client-visible* global PK from leaking (e.g.
in a URL or API payload), autoharn's RLS precedent would not have avoided that rename at all —
RLS only stops *unauthorized rows* from being returned, it does nothing about a legitimate,
authorized row still carrying and exposing its true global id to the client that's allowed to
see it. Renaming/renumbering to a scope-local id is a materially different problem (identity
laundering) from row-visibility filtering (RLS), and autoharn has only ever built the latter.

UNCONFIRMED: whether any serving/boundary-layer code (outside `kernel/lineage/*.sql`, e.g. in
`serving/`, `engine/`, or `roles/`) performs a client-facing id transform on top of the raw
`id` before it reaches a user-facing surface — this scout only reviewed `kernel/` SQL per the
brief and did not exhaustively audit the serving layer's Python/JS/etc. for a presentation-time
remap. Given `principal_scopes` and every RLS-adjacent object pass `id` straight through
unmodified, and the RLS delta's own LIMITS section names the "granted surfaces" boundary filter
as an explicitly NOT-built follow-on, a hidden remap there would be surprising, but is not ruled
out by this SQL-only review.

## Mechanism in five sentences

Autoharn's row ids are a single global Postgres `bigserial` per world (one schema/database per
world, opaquely named so no ordinal leaks), never renumbered into scope-local coordinates
anywhere in the SQL. The "compartment" effect the maintainer perceives is Postgres Row-Level
Security (`kernel/lineage/s71-row-level-scope-policies.sql`): one `FOR SELECT` policy on the
base `ledger` table, backed by a `SECURITY DEFINER` predicate function that reads a per-session
GUC (`app.scope_principal`, unauthenticated at this layer) and hides rows matching a bound
principal's `scope_exclusions` list (kind/thread/work-item-lineage/explicit-row-id families from
`s70-scope-binding.sql`), with every derived view inheriting the same filter for free because
they are all `security_invoker`. This narrows which rows a query returns; it never changes what
a visible row's id is — every row a scoped reader IS allowed to see still carries its raw global
PK, unmodified. Race-safety on inserts is ordinary Postgres `nextval()`, with no bespoke
per-scope counter or lock. Report: `/home/bork/w/omega/.claude/dispatch-reports/autoharn-id-scoping-scout.md`.
