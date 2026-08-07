# wf6-summary-analysis-basic — independent review

Reviewer: fresh-context, REFUTE posture. Reviewed from the ratified charter, the
diff against `git merge-base next worktree-agent-ac489426e197cecb0`
(`3378806f`), and my own gate runs — the builder's self-report
(`.claude/dispatch-reports/wf6-summary-analysis-build.md`) was read only after
findings below were formed, to check for narrowing/unclaimed changes (none
found beyond what's noted in Finding 1/2).

Branch: `worktree-agent-ac489426e197cecb0`, commit `c6b8e37d`.
Gates run against a `git worktree add … c6b8e37d --detach` checkout at
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/wf6-review`
(node_modules copied from the sibling agent worktree — identical
`package-lock.json`, byte-diffed before copy).

## Gate results (WITNESSED, exit codes only)

```
npm run build     → BUILD_EXIT=0   (vue-tsc -b && vite build; 1084 modules, built in 2.05s)
npm run test:run  → TEST_EXIT=0    (Test Files 83 passed | 3 skipped (86); Tests 1108 passed | 4 skipped (1112))
npx eslint .       → ESLINT_EXIT=0  (no output)
```

## Diff reviewed in full

`frontend/FILES.md`, `IntervalSummaryPanel.vue`, `panel-ids.ts`,
`panel-registry.ts`, `useIntervalSummary.ts`, `useTriangularHeatmap.ts`
(the new `plyRangeToColorMoveRange` export), `store/defaults.ts`,
`store/migrations.ts`, `store/archived-migrations.ts`,
`tests/integration/useIntervalSummary.test.ts`,
`tests/unit/composables/plyRangeToColorMoveRange.test.ts`. Also read
`MultiresolutionIntervalPanel.vue`, `useAnalysisContext.ts`,
`AnalysisDashboard.vue` (unmodified, but load-bearing context for the shared-
kernel and panel-mount-lifecycle claims) and `frontend/CLAUDE.md` end to end.

## Findings

### Finding 1 — REQUIRED: the "shared kernel, not parallel recompute" witness is weaker than the charter demands (fix at merge: strengthen the assertion)

The charter's acceptance line is explicit: *"the test must prove both
surfaces read one authority, not a parallel recompute that happens to
agree."* The delivered test's own docstring makes the same claim: *"Exact
object equality (not just `.value` equality): proves the summary is READING
the heatmap's own cell record, not deriving an independently-shaped one that
happens to carry the same number."*

I WITNESSED this claim is false as written. `expect(...).toEqual(...)` is
**structural** equality, not reference identity. I patched
`useIntervalSummary.ts`'s `lookupRow` to return a **spread copy**
(`{ ...found.cell }`) instead of the found reference — a toy example of
exactly the "independently-shaped value that happens to carry the same
number" class the docstring says the test rules out — and reran:

```
$ npx vitest run tests/integration/useIntervalSummary.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Still green. The test as written cannot distinguish "read the shared
object" from "recomputed/reconstructed an equal-looking object," so it does
not discharge the charter's specific proof obligation. (Change reverted
before finishing the review; `git status --short` on the gate worktree is
clean.)

To be clear: the **shipped implementation is correct** — I read
`useIntervalSummary.ts` and it does return `found.cell` verbatim, a real
reference into `useTriangularHeatmap`'s own matrix, and there genuinely is
no second aggregation kernel anywhere in the diff. This finding is about the
witness's strength, not the implementation's correctness.

**Fix (small compose step, test-only):** in
`tests/integration/useIntervalSummary.test.ts`, add a reference-identity
assertion alongside (or in place of) the `toEqual` calls, e.g.
`expect(summaryBlackRow?.cell).toBe(heatmapBlackCell)`. `toBe` will
distinguish the real (reference-sharing) implementation from any
independently-shaped reconstruction, closing the gap between what the test
proves and what the charter and the test's own docstring claim it proves.

### Finding 2 — REQUIRED: migration `61 → 62` has no direct behavioural test coverage (fix at merge: add a per-step describe block)

`src/store/migrations.ts` gained a new `61 → 62` step that backfills
`'interval-summary'` onto a persisted `'basic'` tab's `panelIds`. This is
exactly the class of migration `tests/unit/store/migrations.test.ts`'s own
header names as the reason the file exists — *"a buggy migration's symptom
shows up at hydrate time, not at the moment the buggy code shipped"* — and
that file's stated policy is one `describe` block per migration, with only
the archived `44 → 55` range as a documented historical exception.

I WITNESSED (via `grep -n "60 → 61\|61 → 62\|59 → 60"`) that the new step
has **no** `describe('61 → 62: …')` block — the file jumps from `59 → 60`
to `60 → 61` and stops. I also checked the two tests that *could* have
caught it incidentally:

- `migrate() — end to end` walks `ancientMinimalBlob()`, which has no
  `profile.settings.analysisTabs` key at all — the new migration's
  `Array.isArray(settings.analysisTabs)` guard is false, so the step
  silently no-ops for that fixture. The migration's actual backfill branch
  (inserting into an *existing* `'basic'` tab's `panelIds` — precisely the
  "user who already has a persisted `analysisTabs` array from migration
  `54 → 55`" scenario the migration's own source comment names as its
  reason for existing) is never exercised.
- `tests/integration/migration-store-roundtrip.test.ts` compares **key
  sets**, not array contents (its own docstring: *"Array values are
  compared as leaf paths (no index recursion) … the round trip cannot
  diverge inside an array"*), so it would not catch a wrong insertion
  position, a wrong id string, or a scope mistake (e.g. touching a
  non-`'basic'` tab) either.

Net effect: the step that exists specifically to reach already-persisted
users is currently unexercised by any test in the suite — the same defect
class (`silent-no-op` migration masked by an unrelated invariant staying
green) that produced this same file's own `59 → 60` corrective migration and
its lengthy postmortem comment two migrations above this one.

**Fix (small compose step, test-only):** add a
`describe('61 → 62: interval-summary panel-id backfill', …)` block covering:
inserts at the front of an existing `'basic'` tab's `panelIds`; is idempotent
when `'interval-summary'` is already present; no-ops when `analysisTabs` is
absent/non-array; leaves non-`'basic'` tabs and a renamed/deleted `'basic'`
tab untouched. All are one-line assertions given the existing `step(N)`
helper in this file.

### Finding 3 — ADVISORY: `plyRangeToColorMoveRange`'s docstring says "strictly contained," implementation is inclusive-containment

The doc comment reads *"the largest run of that colour's moves strictly
contained within the ply range,"* but the implementation includes moves
whose ply equals either range endpoint (verified against the unit tests,
e.g. `[1, 6]` → Black's ply-5 move, `t=2`, is included). This matches the
intended and tested behaviour (inclusive range, matching
`MultiresolutionIntervalPanel`'s own cell-click round trip) — the code is
correct, only the word "strictly" is a stray, mildly misleading holdover.
Not load-bearing; a future reader could misjudge boundary behaviour from the
prose alone. Fix at will, not blocking.

### Finding 4 — ADVISORY: `FILES.md` insertion order doesn't match `panel-registry.ts`'s order

`panel-registry.ts` places `intervalSummary` between `mergedDelta` and
`multiresolutionInterval`; `FILES.md` places the corresponding entry between
`MergedDeltaPanel.vue` and `ScoreLeadPanel.vue` (which itself sits before
`multiresolutionInterval`/its panel file elsewhere in the tree). Purely
cosmetic — `FILES.md` is a directory-ordered lookup map, not required to
mirror registry order — but noted for completeness.

## Acceptance-criteria checklist (from the charter)

| Criterion | Status | Evidence |
|---|---|---|
| Summary visible in Basic tab by default | WITNESSED (code) | `defaults.ts`: `intervalSummary` leads `basic`'s `panelIds`; migration `61→62` backfills existing users (see Finding 2 for the coverage gap on that path) |
| Summary values equal multiresolution cell values, same interval | WITNESSED (values) / gap on the "proof" bar | Implementation reads the same `HeatmapCell` reference (read the source); the dedicated test proves value equality but not the "not-a-parallel-recompute" proof the charter names — Finding 1 |
| Anchored on shared kernel, not parallel recompute | WITNESSED (implementation) / NOT WITNESSED (by the test as written) | Finding 1 |
| Updates on range change | WITNESSED | `useIntervalSummary.test.ts`'s second test: narrows `selectionRange`, `await nextTick()`, asserts re-derivation |
| Build exit 0 | WITNESSED | `BUILD_EXIT=0` above |
| Suite exit 0 | WITNESSED | `TEST_EXIT=0` above, 1108 passed |

## Red-then-green witness (for the review's own due diligence, per the review brief)

Reverted-and-restored experiment on the real production hunk
(`plyRangeToColorMoveRange` in `useTriangularHeatmap.ts`): introduced an
off-by-one (`rawT + 1` instead of `rawT`) and reran the two directly-relevant
test files.

RED:
```
 FAIL  tests/unit/composables/plyRangeToColorMoveRange.test.ts > … > round-trips exactly …
 FAIL  tests/unit/composables/plyRangeToColorMoveRange.test.ts > … > projects a ply range spanning both colours …
 FAIL  tests/unit/composables/plyRangeToColorMoveRange.test.ts > … > excludes a colour move only partially inside …
 Test Files  2 failed (2)
      Tests  5 failed | 2 passed (7)
```

Restored the exact original line (`git diff --stat` on the file: no
changes after restore); reran:

GREEN:
```
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

This confirms `plyRangeToColorMoveRange` and its consumer are real,
value-sensitive witnesses for the projection arithmetic itself — the gap in
Finding 1 is specifically about the *shared-kernel/no-parallel-recompute*
property, not about value correctness, which is well covered.

## Verdict: MERGE-WITH-FIXES

Both REQUIRED findings are test-only, small, mechanical compose steps that
do not touch production logic (which I verified is correct): swap the
cell-identity assertions in `useIntervalSummary.test.ts` from `toEqual` to
`toBe` (Finding 1), and add one `describe` block for migration `61 → 62`
following the file's own established per-step pattern (Finding 2). Neither
finding indicates the shipped behaviour is wrong; both indicate the delivery
under-proves two of its own most load-bearing claims relative to what the
charter and the codebase's own testing discipline ask for. Advisory findings
3–4 are cosmetic and do not block.
