# Migration Test Coverage + Rotation Script Automation — Design Note

**Status:** `design-note: in-progress` — Phase 1 (migration test
suite) has landed; Phase 2 (rotation script) remains planned.
This document is the canonical handle for two complementary
sub-projects around the rolling-archive discipline shipped
2026-05-14 (PR #219):

- **A unit-test suite for the schema-migration corpus** — landed
  2026-05-14 as `frontend/tests/unit/store/migrations.test.ts`
  (144 tests; one `describe` block per migration plus invariant
  and end-to-end-walk blocks).
- **A rotation-script automation** that mechanises the per-PR
  cadence the new `frontend/CLAUDE.md`'s "Rolling-archive
  discipline for `src/store/migrations.ts`" section codifies.
  Still planned; the Phase-1 test suite is the safety net Phase 2
  was designed to lean on.

**Genre.** Infrastructure / authoring-ergonomics roadmap.

**Date:** 2026-05-14.

**Priority.** Low. The user has named this as a perfectionistic
inclination rather than a pressing concern; the design exists
on paper so it can be picked up when more pressing matters
subside.

---

## Motivation

Two threads converge here.

**Thread one: the migration corpus is entirely untested.** A
greenfield repo-grep across `tests/` for any `migration`-shaped
file finds nothing. The only assurance that a migration moves
a blob from version `N` to version `N+1` correctly is the
author wrote it correctly at the moment. For a contract whose
counterparty is "every persisted-blob population in the wild,"
that's thin. The risk profile is sharply asymmetric:

- A bug in a feature ships and surfaces; the author fixes it,
  a follow-up PR closes the loop.
- A bug in a migration ships and corrupts persisted state;
  the user's workspace silently drifts; recovery is
  case-by-case and may not be possible at all.

ADR-0002's fail-loudly posture applies with special force to
the migration corpus because the loudness must propagate
forward in time — a corrupting migration's symptom shows up
the next time anyone hydrates from disk, not at the moment
the buggy code shipped. Tests at the migration boundary are
the only artifact that catches the bug *before* the symptom.

**Thread two: the rolling-archive discipline is currently
human-enforced.** The per-PR cadence ("when a PR adds
migration `N+1`, the same PR moves migration `N-1` from the
active body into the archive") is a reminder, not a
mechanism. Reminder-based disciplines drift; mechanism-based
disciplines don't. The discipline is small enough that the
drift cost is low, but the rotation is also rote enough that
LLM tokens spent on it are wasted attention — neither the
human nor the LLM is exercising judgement during a cleanup
step.

The two threads compose: a robust migration-test suite lets a
rotation script run **fast and loose** (let the script do the
mechanical work; let the tests catch what the script gets
wrong), which is much cheaper than a script that has to be
provably correct in isolation. The composition is the design
move worth recording.

---

## Three sub-projects, with a strict dependency order

### Phase 1 — Migration test coverage (Tier 1, pure unit)

Lands first. Has independent value even if the rotation
script is never built.

**Test file:** `frontend/tests/unit/store/migrations.test.ts`,
following the existing three-tier taxonomy
(`tests/unit/` for pure logic). Migrations are pure functions
of plain inputs to plain outputs — no DOM, no fakes, no Vue
reactivity. Tier 1 is the exact fit.

**Suite shape:**

1. **Per-migration round-trip fixtures.** For each migration
   `N → N+1`, a minimal handcrafted pre-blob exercising the
   key branches and a post-blob asserting the result. Each
   migration gets its own `describe` block. Coverage should
   include the happy path, the idempotent re-application case
   (every migration is *supposed* to be idempotent — codify
   the contract), and the "field absent / corrupt /
   hand-edited" fallback paths the comments name.

2. **End-to-end walk.** A single ancient (schema-1) fixture
   blob, walked all the way through `migrate(blob)`; assert
   the final shape is a valid `CURRENT_SCHEMA_VERSION` blob.
   Catches "wrong migration runs for a given version step" —
   one of the specific failure-classes of a buggy rotation
   script.

3. **Array-length invariant.** `migrations.length ===
   CURRENT_SCHEMA_VERSION - 1`. One-line test. Catches
   "rotation accidentally deleted or duplicated a migration"
   without needing per-migration fixture authoring for the
   case to surface.

4. **No-body-edit guard (optional, advanced).** Hash each
   archived migration's body once and check the hash on
   every test run, with the hash table checked into the
   repo. Catches "rotation accidentally edited a body it
   should have moved verbatim." Probably overkill given
   `npm run build` already catches syntax-level edits; worth
   considering if the rotation script ships and we want
   belt-and-suspenders against bit-flipping. Authoring cost
   is low (~10 lines) so the trade is symmetric.

**Effort estimate:** ~2 hours for the test scaffolding plus
the end-to-end and array-length tests. The per-migration
fixture authoring is the bulk — one afternoon for the full 34
migrations, each a small handcrafted JS object.

**Independent value.** Even with no rotation script, this
suite catches:

- Regressions in migration bodies during routine refactors.
- The "I forgot to register the migration" failure mode the
  current code-path's defensive throw was meant to catch but
  has no test for.
- Off-by-one errors in array indexing during manual
  rotations.

### Phase 2 — Rotation script

Lands after Phase 1. Relies on Phase 1's tests as the safety
net for "the script silently corrupted something."

**Tooling choice: Bash + `sed`/`awk` first.** The discipline's
invariant (the `// N → N+1` header is a comment-only line,
exists exactly once per migration body, never embedded in
code) makes regex matching robust enough for the v1 script.
TypeScript AST tooling (`ts-morph`, the TypeScript compiler
API) would handle every pathological case the regex-based
script can't, but:

- The pathological cases are vanishingly rare given the
  disciplined comment convention.
- AST tooling adds a dev-dep, build-time, and the script's
  own internal complexity. "10× more code, 10× rarer bug
  class" isn't worth it until the simpler tool fails.
- The script's "fail loudly on unexpected shape" posture
  gives the regex version a safety valve — if the active
  body doesn't match the expected shape after the author
  added their new migration, the script bails with a
  structured error and the author handles that case by
  hand. ADR-0002 in the small.

**Script shape:**

- **Entry point:** `npm run migration:rotate` after adding
  the new migration manually. Optional `--dry-run` flag
  prints the diff that would be applied without writing.
- **Inputs:** none beyond the file shapes themselves. The
  script reads `frontend/src/store/migrations.ts` and
  `frontend/src/store/archived-migrations.ts`.
- **Algorithm:**
  1. Parse `migrations.ts`'s active-body array entries by
     locating `// N → N+1` comment headers (anchored
     comment-only line; uniquely identifies a migration
     boundary).
  2. Assert exactly three entries are present (the steady
     state's two plus the author's just-added third). Bail
     loudly if not — names what was seen.
  3. Identify the third-newest as the migration to age out.
     Cut its comment block + arrow function + trailing
     comma, inclusive.
  4. Splice the cut chunk before the closing `];` in
     `archived-migrations.ts`.
  5. Update the "Scope as of YYYY-MM-DD" line in the
     archive's header to reflect the new highest archived
     version.
  6. Leave imports untouched. The build's "unused-import"
     warning catches the case where a moved migration freed
     up an import that's now dead in `migrations.ts`; the
     author edits the import block manually. Threading
     import-usage analysis into the script would require AST
     tooling and isn't worth it for the marginal case.

- **Failure modes:**
  - Active body has != 3 entries → bail with structured
    diagnostic naming the count and the migration IDs seen.
  - The third-newest's comment-block boundary can't be
    located unambiguously → bail naming the line range that
    seemed ambiguous.
  - The archive's closing `];` can't be located uniquely →
    bail. (Should never happen given the file's shape; the
    check is defensive.)

- **Test flow downstream:** the author runs the script,
  runs `npm run build`, runs `npm run test:run`. If both
  pass, commits both files together. If either fails, the
  author either fixes the script's output by hand or reverts
  and rotates manually.

**Effort estimate:** ~3 hours for the Bash version including
the structured-error surface and the `--dry-run` flag. No new
dependencies.

### Phase 3 — Script self-tests (deliberately not built)

The script's correctness is verified by its downstream
artifacts: the migration tests (Phase 1) catch silent
corruption; `npm run build` catches syntax breakage;
`npm run test:run` catches behaviour regression. Adding
self-tests for the script would double up the safety net
without adding coverage of any new failure class.

**Exception:** the `--dry-run` mode is itself a form of
self-test — the author can eyeball the diff before letting
the script write. That's worth keeping even if no other
self-tests exist.

This phase exists in the document only to make the
non-decision explicit so a future contributor doesn't
default to "build self-tests because the script feels
script-like."

---

## When to revisit the regex-vs-AST call

Concrete signal: if the regex-based script's "bail loudly"
branch fires for more than 1 in 10 rotations, the simpler
tool isn't carrying its weight and AST tooling becomes
defensible. Until then, stay simple.

Probable causes of the bail rate going up:

- A migration body legitimately requires a multiline string
  containing what looks like a version-transition comment
  (e.g., a migration that emits a SystemMessage referring to
  an earlier migration's transition).
- A migration's comment header is split across multiple
  comment lines for length reasons.
- The author commits half-rotated state, then re-runs.

The first two are addressable by tightening the discipline
("comments inside bodies must not begin with `// N → N+1:`";
"the canonical header is one line followed by free-form
continuation"). The third is a script ergonomics issue —
idempotency on partial state.

If any of these become operationally annoying, the AST
migration arc opens. The plan there:

- Adopt `ts-morph` as the dev-dep (lighter weight than the
  raw compiler API).
- Replace the comment-header parser with `getStatements()`
  walking over the `migrations[]` array literal.
- Use the import-graph analysis to handle the "freed
  imports" case automatically.

Effort estimate for the AST upgrade: ~6 hours, plus dev-dep
churn and a CI build-time increase.

---

## Cross-references

- `frontend/CLAUDE.md`, "Rolling-archive discipline for
  `src/store/migrations.ts`" — the active authoring rule
  this note is the automation companion for.
- `frontend/src/store/migrations.ts` and
  `frontend/src/store/archived-migrations.ts` — the worked
  example of the discipline; what the rotation script
  operates on.
- `frontend/tests/CLAUDE.md` — the test-tier taxonomy that
  Phase 1 fits into (Tier 1 unit).
- ADR-0002 — fail-loudly posture applies to migration
  failure modes with special force (the symptom propagates
  forward in time).
- ADR-0007 — the size discipline the 2026-05-14 cleanup
  closed; this automation arc keeps the discipline
  self-enforcing rather than reminder-based.

---

## Open questions deferred to implementation time

1. **Fixture-authoring strategy for Phase 1.** Hand-write
   per-migration fixtures, or extract from the migration's
   own comments / type signatures? Hand-write is more
   authentic to the discipline (the fixture is the contract);
   extraction is faster but risks the fixture and the
   migration being co-tested (the bug doesn't surface if
   they share an upstream defect). Recommend hand-write.
2. **Per-PR test execution.** Whether the migration-test
   suite gates `npm run build` (currently doesn't; tests
   are a strict-add safety net per the existing posture in
   `tests/CLAUDE.md`) or stays opt-in via `npm run test:run`.
   Recommend opt-in until CI integration is on the table
   broadly — consistent with the existing posture.
3. **Whether the rotation script also writes a worklog
   entry.** Each rotation is a tiny structural change worth
   the audit trail; the worklog convention exists. Could be
   automated. Probably defer until after the first manual
   rotation under the new discipline, to see what shape the
   worklog entries want.
4. **AST tooling threshold.** Named "1-in-10 bail rate"
   above; that's a guess. Calibration happens with operational
   experience.

---

## Maintenance contract

This is `design-note: in-progress`. Phase 1 (migration tests)
landed 2026-05-14 — `frontend/tests/unit/store/migrations.test.ts`.
When Phase 2 (rotation script) lands, the status line transitions
again and the PR / worklog reference goes here. If the AST
migration arc opens at some future point, this document either
gets amended with a new section or transitions to
`design-note: revised` with a sibling note that picks up the AST
framing — judgement call at the implementation moment.

If the project decides not to ship the rotation-script
automation (perfectly defensible — the manual rotation is fine
now that Phase-1 tests catch silent corruption), this note
transitions to `design-note: closed-with-rationale` naming why
and the Phase-1 suite stands on its own.

---

## License

Public Domain (The Unlicense).
