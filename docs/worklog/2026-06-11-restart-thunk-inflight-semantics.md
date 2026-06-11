# Worklog — restart-thunk "active" = in-flight semantics (2026-06-11)

> Audit trail for work-status item `restart-thunk-inflight-semantics`
> (PR `bork/fix/restart-thunk-inflight`). Resolves the §6.1 / §3.3
> wrinkle 2 maintainer question recorded in
> `docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md`:
> the maintainer decided 2026-06-10 that "active" — the set
> `restartActiveAnalyses` re-issues — means IN-FLIGHT, not "every query
> not explicitly stopped". `onAnalysisUpdate` now reaps a query's
> restart thunk on natural completion, so a qEUBO toolbar-view toggle
> (especially after a reconnect, where the bookkeeping maps deliberately
> survive) no longer resurrects completed or pre-disconnect queries at
> engine-compute cost.

## The change

- **`src/services/analysis-service.ts`** —
  - The per-query `activeQueries` entry gains two natural-completion
    fields: `analyzedTurnCount` (the wire `analyzeTurns.length` — range:
    `endTurn − startTurn + 1`; ponder/analyze: 1) and `finalizedTurns:
    Set<number>` (the turn numbers that have received their
    authoritative `isDuringSearch === false` final). The set, not a
    counter, is robust against a duplicate final for the same turn —
    the same defensive shape the ponder-ceiling clear and the telemetry
    singleton's auto-cleanup already take.
  - `onAnalysisUpdate` records each finalized turn on the live entry and,
    once `finalizedTurns.size >= analyzedTurnCount`, deletes the query's
    entry from `restartCallbacks` — the reap. Scoped to the restart
    thunk **alone**: `activeQueries`, `activeSubscriptions`, and
    `boardToQueries` are left to the O15 reconcile-on-next-interaction
    path, so the audit §3.3 wrinkle 1 bounds (per-board map growth
    cleared at board close; the `activeMode` projection drift) are
    unchanged.
  - `restartActiveAnalyses`'s docstring and the `restartCallbacks` map
    comment rewritten from "every active / not-explicitly-stopped query"
    to "every IN-FLIGHT query", with the maintainer-decision date and
    the item id.
- **`src/services/engine-connection.ts`** — the owner docstring's
  recorded §6.1 open question (the "Deliberately preserved semantics"
  block) is updated to the decided semantics, dated 2026-06-10, with the
  reap location named and the O15 non-reap of the other three maps
  recorded so the next reader sees what was and was not changed. The
  cross-reference comment in `analysis-service.ts`'s import block is
  updated in lockstep ("decision" not "question").
- **`tests/integration/analysis-service-restart-thunk.test.ts`** (new) —
  five Tier-3 service-integration tests driving the **real**
  `analysisService` singleton against a mock `WebSocket` (`vi.stubGlobal`
  replaces jsdom's native wrapper wholesale, so the documented jsdom
  IDL-onopen defect the e2e harness escapes does not apply — there is no
  real socket). The mock records sent queries and injects response
  packets by id. The bidirectional contract the item names:
  - completed query + `restartActiveAnalyses` → NOT re-issued;
  - in-flight query + `restartActiveAnalyses` → IS re-issued;
  - completed-before-disconnect + reconnect + toggle → NOT resurrected;
  - in-flight-at-disconnect + reconnect + toggle → IS restarted;
  - single-turn `analyzeActiveNode` reaped on its first final.

## Verification

- `npm run build` (vue-tsc -b && vite build) — clean.
- `npx eslint .` — exit 0 (the five custom error-level rules pass; no
  new `as` without justification).
- `npm run test:run` — 893 passed | 4 skipped (the e2e harness, gated on
  env URLs); the 5 new tests included.
- **Negative control (guard is live, not dead):** with the reap block
  temporarily removed, the three completion-reap tests go red
  (`expected length 1, got 2`) and the two in-flight tests stay green —
  exactly the discriminating signal, confirming the tests fail without
  the fix and that the in-flight assertions pin the preserved half.

## Out-of-frame review (hack-rationalization-detector)

Run on the change. The audit returned **narrower-but-justified** — the
fix is statable as one invariant ("restartActiveAnalyses re-issues
exactly the queries still in flight"), all four `restartCallbacks`
writer/deleter sites the grep finds are handled (set ×2 at the analyze
methods; delete ×2 at `stopQuery` and the new reap), and the one
narrowing (leaving the other three maps unreaped) cites the O15 contract
and the explicit out-of-scope sibling item, not a discipline-word. The
self-applied frame is flagged loudly: I produced the diff, so this is a
weaker signal than a truly independent run. Findings carried forward
below.

### Findings beyond the verdict (recorded, not all actioned)

- **The completed-but-retained inconsistency is real, pre-existing, and
  bounded.** After natural completion `restartCallbacks` no longer holds
  the query but `activeQueries` does, so `isPondering` /
  `recomputeActiveMode` still project a completed mode until the next
  interaction (the audit §3.3 wrinkle 1 `activeMode` drift). This reap
  does **not** widen that drift — it already existed — but it does make
  `restartCallbacks` and `activeQueries` answer different questions about
  "active". Closing the residual half (releasing `activeMode` on
  completion) is the separate, deliberately-not-taken item
  `drop-engine-activemode` — out of scope here per the commission.
- **`analyzedTurnCount` value-correctness is type-guarded but not
  test-guarded for future kinds.** The field is required, so a new
  analyze method that forgets it is a compile error (good). But a new
  method that passes a *wrong* count (not equal to the wire
  `analyzeTurns.length`) would silently never reach the reap threshold —
  the "survives completion" bug would return for that kind. No
  lint/test pins value-correctness; the new integration test covers only
  the two existing kinds (range, single-turn). Recorded as the named
  trigger: a third analyze method obliges a matching reap-completion
  test. (not-filed: speculative until a third analyze method exists.)
- **Ponder reap-on-first-final is a semantics choice the one-line
  decision did not explicitly cover.** A ponder is structurally
  indefinite; its first final IS treated as natural completion
  (`analyzedTurnCount = 1`). This matches "in-flight" (an exhausted
  ponder is no longer in flight) and the ponder-ceiling warning's own
  "ponder finished" framing, but it is surfaced here as a
  decision-on-record rather than a silent rider.
- **Duplicate-final robustness rests on `turnNumber` stability.** The
  Set keys on `response.turnNumber`; correctness assumes "one logical
  final per distinct turnNumber" — the same wire-contract assumption the
  telemetry singleton's auto-cleanup makes. Not a live concern today.

## Documentation

- No `frontend/FILES.md` / `IDENTIFIERS.md` rows: no new `src/` file and
  no new branded type (`analyzedTurnCount` / `finalizedTurns` are plain
  per-entry fields; the test lives under `tests/`, which FILES.md does
  not track).
- The hydration-rebind audit note is **not** retro-edited — it declares
  itself a point-in-time report ("not retro-edited", its §Method). The
  resolution lives in the code's owner docstring (dated) and this
  worklog.
- Doc-graph regenerated for this worklog's addition.

## Work-status

Item `restart-thunk-inflight-semantics` is implemented and ready; the
DB transition (open → closed) is the coordinator's to make — this arc's
todo-DB access was read-only.

License: Public Domain (The Unlicense)
