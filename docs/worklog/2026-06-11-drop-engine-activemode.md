# Worklog — drop store.engine.activeMode (2026-06-11)

> Audit trail for work-status item `drop-engine-activemode` (rerouted
> 2026-06-10 from the deferral harvest's staged §5.D; original deferral
> `docs/worklog/2026-05-16-per-board-multi-query.md`). Branch
> `bork/refactor/drop-engine-activemode`, PR #406. Strengthened by
> the 2026-06-10 hydration-residue audit, which observed activeMode kept
> projecting a completed mode after natural completion (doc-vs-behaviour
> drift) and found no readers.

## The change

`store.engine.activeMode` was a `PerBoard<AnalysisMode>` slot on the
`GlobalStore.engine` subtree: a write-only derived projection
(`analyze > ponder > none` over each board's live query set) that **no
runtime code consumed**. The two former readers (the spacebar toggle in
`useUserIORegistry`, the "Follow Me" watcher in `App.vue`) had already
moved to the `analysisService.isPondering(boardId)` predicate, which
walks the service's private `boardToQueries` / `activeQueries` maps
directly and does not touch the store slot. The field's own docstring
recorded the situation honestly: *"No current reader actually consumes
this field … but the writes are kept honest so persisted store snapshots
stay coherent."*

### Confidence pass (the first gate)

The commission's first gate was a reader-grep at HEAD; the item records
zero readers, and the field was to be removed only if that still held.
It did. Every non-comment occurrence of `activeMode` resolved to a
**writer**, never a reader:

- `engine-connection.ts` — `applyEngineDisconnectReset` wipe + the
  `setBoardActiveMode` owner write.
- `analysis-service.ts` — `recomputeActiveMode` (the projector) and its
  call sites in `indexQueryOnBoard` / `stopQuery` / `stopBoardAnalysis`.
- `store/index.ts` — the init (`activeMode: {}`) and the
  `BOARD_SCOPED_STORE_CELLS` per-board delete.
- `store/archived-migrations.ts` — the 24→25 and 26→27 re-keys (frozen;
  see below).

The `isPondering` predicate is the live derivation; `activeMode` was a
redundant second copy of the same information with no consumer.

### What was removed

- **Schema** — the `activeMode` field on `EngineState`
  (`src/types/engine.ts`), plus its now-unused `PerBoard` import.
- **Owner write** — `setBoardActiveMode` (the terminal store-write owner
  function) and its section in `services/engine-connection.ts`; the
  `activeMode` line in `applyEngineDisconnectReset`; the
  `AnalysisMode` import in that module.
- **Projection threading** — `recomputeActiveMode` in
  `services/analysis-service.ts` and its three call sites; the
  `setBoardActiveMode` import.
- **Store** — the `activeMode: {}` init and the `engine.activeMode`
  cell in `BOARD_SCOPED_STORE_CELLS` (`src/store/index.ts`).
- **Tests** — the activeMode seeds/assertions in the closeBoard and
  registry-drain tests, and the `engine.activeMode` row in the
  board-completeness tripwire (`tests/integration/store-mutators.test.ts`);
  stale prose in `tests/integration/useReviewSession.test.ts`.

### Persistence — verified NOT persisted, no migration

The commission flagged a migration leg *if* the field were in the
persisted payload. It is not. `buildPersistencePayload()`
(`src/store/index.ts`) serialises only `boards / activeBoardIndex /
profile / session` — **never `engine`** — so `activeMode` never reached
the backend blob. The standing proof is
`tests/integration/migration-store-roundtrip.test.ts`, which feeds a
legacy v1 blob containing `engine.activeMode` through the migration
chain and asserts (line 297) that `engine.activeMode` is **dropped by
the roundtrip** — exactly because `buildPersistencePayload` excludes
engine. That test is left GREEN and UNEDITED: it is the evidence the
removal is persistence-safe, and editing it would erase that evidence.

No new store migration was added.

### Frozen archived migrations — deliberately NOT touched

`archived-migrations.ts:1119` (24→25) and `:1202` (26→27) re-key
`engine.activeMode` on legacy persisted blobs that genuinely carried the
field. Per the rolling-archive discipline (`frontend/CLAUDE.md`,
"Migration bodies are frozen as they shipped … never edit the body"),
these are left verbatim. They operate on an `any`-typed transient
migration blob guarded by `if (out.engine && typeof out.engine ===
'object')`, and the re-keyed value is dropped by
`buildPersistencePayload` before it can reach the live store — so the
left-in code is provably unreachable from the live schema and harmless.
The two unit tests that exercise them
(`tests/unit/store/migrations.test.ts:1302` directly,
`migration-store-roundtrip.test.ts` end-to-end) likewise stay unedited;
they remain valid coverage of a still-live frozen migration. The
test-vs-field asymmetry is intentional: a future reader who sees
"activeMode was removed" must not delete these tests — they cover frozen
code, not the removed field.

### An ordering constraint that went away

`activeMode` was the *only* `BOARD_SCOPED_STORE_CELLS` cell written by
`stopBoardAnalysis` (via `recomputeActiveMode`, which landed a `'none'`
tombstone when the last query was released). `closeBoard`'s drain
therefore had to run **after** `stopBoardAnalysis` so its deletes would
overwrite that tombstone rather than leave it. With `activeMode` gone,
no surviving cell is written by `stopBoardAnalysis`, so the drain is now
order-independent of it (it still runs after, incidentally). The
registry docstring, the `closeBoard` docstring, and the inline drain
comment were updated to record that the ordering constraint is retired.

### Documentation touched

- `closeBoard` docstring (`src/store/index.ts`): removed cleanup #5
  (the activeMode tombstone, audit tag O3), renumbered #6–#11 → #5–#10,
  updated the O1–O5 audit-pair census (O3's in-code cleanup is retired;
  the frozen plan's O3 row is left as written), and updated the ordering
  paragraph and inline drain comment.
- `BOARD_SCOPED_STORE_CELLS` registry docstring: ordering note updated.
- `engine-connection.ts` header docstring: the `restartActiveAnalyses`
  semantics note referenced the §3.3-wrinkle-1 `activeMode` projection
  drift; updated to record the projection's removal and to note that the
  hydration-residue audit's O15/reconcile prose is a point-in-time
  record left as written.
- `frontend/FILES.md`: engine-connection row no longer lists
  `AnalysisMode` among the engine-band types it speaks (it no longer
  imports it).
- `frontend/IDENTIFIERS.md`: no change — `AnalysisMode` is a plain
  string-literal union, not a branded identifier, and was never listed.

### Point-in-time docs left untouched (commission directive)

The hydration-residue audit's O15 / reconcile-on-next-interaction notes
reference `activeMode` projection drift. Per the commission those are
point-in-time records and were **not** edited; the supersession is noted
here and in the live-code docstrings that pointed at them. The
hydration-residue audit document itself was not modified.

## A deliberate minimal-touch decision (deviation note)

`AnalysisMode` (`'none' | 'ponder' | 'analyze'`) becomes an unused
exported type after this change — its only non-declaration uses were the
`activeMode` field and `setBoardActiveMode`, both removed. I **kept** the
type and its barrel re-export (`src/types.ts`): the item scoped the
removal to "the field + owner writes + projection threading," not the
type union, and `AnalysisMode` is a coherent engine-band vocabulary type
a future engine-connection surface could legitimately reuse. ESLint has
no dead-export rule, so it does not flag this. Recorded loudly here as a
scope judgment rather than silently extending the removal. Not filed: a
follow-up to retire `AnalysisMode` if it stays unused
(not-filed: low-value cleanup, retire-on-next-touch is sufficient).

## Verification

- `npm run build` (vue-tsc -b && vite build) — clean. The typecheck is
  the load-bearing proof that no live reader of the removed field
  survives.
- `npx eslint .` — exit 0 (all six custom rules pass).
- `npm run test:run` — 912 passed, 4 pre-existing skips. The updated
  tripwire/teardown tests confirm `closeBoard` still drains the
  surviving cells correctly and per-board; the unedited roundtrip and
  frozen-migration tests stay green.

No runtime perf claim is made (ADR-0009): the removal deletes a
write-only field with zero readers and no UI-observable behaviour, so
there is nothing to measure beyond the typecheck + suite.

## Out-of-frame hack-rationalization pass

Per the multi-writer-slot discipline (the slot had four live writers
plus two frozen-migration writers), the hack-rationalization-detector
was run with the removal plan treated as the object of suspicion.
Verdict: **narrower-but-justified** — the removal is general over every
live-reachable site; the deliberate non-removal of the two frozen
migration sites is bound by the rolling-archive discipline with a
concrete cost, not a discipline-word. The full artifact is reproduced in
the appendix.

## Appendix — hack-rationalization-detector artifact (verbatim)

```
## Hack-rationalization review: drop-engine-activemode

FRAME CHECK: Justification-as-suspect. I produced the removal plan; per the skill's
frame rule I am treating my own "no new migration / don't touch frozen migrations"
reasoning as the object of suspicion, and re-derived the writer set from the code
with the enumerate_writers script rather than from my memory of the plan.

GENERAL FIX:   Remove `store.engine.activeMode` from every live-reachable site (the
               schema declaration, the store init, the owner write `setBoardActiveMode`,
               the projector `recomputeActiveMode` + all its call sites, the
               disconnect-reset wipe, and the per-board teardown cell), since the field
               is a write-only derived projection with zero runtime readers — the one
               invariant: "no live code path produces or consumes activeMode."
PATCH SHIPPED: Exactly that removal, PLUS a deliberate non-removal of the two frozen
               archived-migration re-key sites (archived-migrations.ts:1119, 1202).
DOWNGRADE:     The two frozen migration sites are NOT removed. The concrete cost that
               justifies leaving them: the rolling-archive discipline (frontend/CLAUDE.md
               "Rolling-archive discipline for src/store/migrations.ts": "Migration bodies
               are frozen as they shipped ... never edit the body") forbids editing a
               shipped migration. These sites operate on a transient `any`-typed migration
               blob (a legacy v1 persisted shape that genuinely contained engine.activeMode),
               guarded by `if (out.engine && typeof out.engine === 'object')`, and the
               re-keyed value is dropped by buildPersistencePayload before it ever reaches
               the live store. So this is not "minimality" — it is a real architectural
               boundary (a frozen historical record) with a real cost to crossing it, and
               the left-in code is provably unreachable from the live store schema.
WRITER DELTA:  Claimed 4 live writers + 2 frozen-migration writers; enumerator confirmed
               5 candidate `*.engine.activeMode` assign/object-key sites across 4 files,
               which when read resolve to: engine-connection.ts:127 (disconnect wipe),
               engine-connection.ts:200 (setBoardActiveMode owner), index.ts:92 (init),
               index.ts:317 (closeBoard cell clear), archived-migrations.ts:1119+1202
               (frozen legacy re-keys). The enumerator's grep did not surface index.ts:317
               as a distinct "assign" (it is a `delete`, not `=`), but reading the hits
               recovered it; no writer was missed. Tests additionally write the field
               (store-mutators.test.ts:135,237) as fixtures — handled.
RUNTIME:       Verified by build + eslint + test:run after the change (the field has no
               UI-observable behaviour — zero readers — so "runtime repro" reduces to the
               typecheck proving no live reader survives + the suite proving teardown/
               roundtrip invariants still hold). Captured in the worklog.

TELLS (Step 1): No co-occurrence tells in the justification prose (0 minimality-terms
                adjacent to a named-better-fix). The single "named-fix cue" the scanner
                counted was the neutral phrase "no new migration needed," not a downgrade.

VERDICT: narrower-but-justified
WHY: A strictly more-general "remove every occurrence including the frozen migrations"
     fix exists, but it is wrong here: editing a frozen migration body violates the
     rolling-archive discipline and would change the historical migration semantics for
     legacy blobs that DID carry the field. The narrowing is bounded by a concrete,
     documented architectural rule, and the left-in sites are provably unreachable from
     the live store (buildPersistencePayload excludes engine), so the next-writer-reopens
     risk does not apply to the frozen sites.

FINDINGS BEYOND VERDICT (required):
  - The closeBoard docstring carries an audit-pair census ("O3 the activeMode tombstone",
    cleanup #5 of an enumerated 1-11 list). frontend/CLAUDE.md's resource-ownership
    discipline says counts/censuses rot in prose; removing cleanup #5 forces a renumber of
    #6-#11 and a touch of the O-pair prose. This is a documentation-coherence obligation,
    not a code risk — but skipping it would itself be the silent doc-drift the discipline
    names. The change MUST update that docstring, the BOARD_SCOPED_STORE_CELLS registry
    comment block, and the board-completeness tripwire test
    (store-mutators.test.ts:213) in the same PR.
  - migration-store-roundtrip.test.ts pins `engine.activeMode` in
    EXPECTED_DROPPED_BY_ROUNDTRIP (line 297) and feeds a legacy blob containing it. This
    test is the standing proof that the field is non-persisted; it stays GREEN and UNEDITED
    after the change (it exercises frozen migrations on a legacy blob, not the live schema).
    Leaving it untouched is correct — editing it would erase the evidence that the removal
    is persistence-safe.
  - migrations.test.ts:1302 ("re-keys engine.activeMode through the old→new map") tests the
    frozen migration directly and likewise stays unedited. If a future contributor reads
    "activeMode was removed" and deletes these tests, they would silently drop coverage of
    a still-live frozen migration. The worklog should name this so the test-vs-field
    asymmetry is on record.
  - Nothing structurally prevents a future contributor from re-introducing a write-only
    store field with zero readers — the `local/store-write-needs-owner` lint enforces
    owner-routing but not reader-existence. That is a pre-existing gap, not introduced by
    this change, and out of scope; noting it so the verdict's cleanliness isn't read as
    "this class can't recur."
```
