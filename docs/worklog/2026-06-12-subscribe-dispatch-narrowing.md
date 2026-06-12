# Worklog — typed subscribe API: structural narrowing at the katago-client dispatch layer (2026-06-12)

> Audit trail for work-status item `subscribe-dispatch-structural-narrowing`
> (branch `bork/refactor/subscribe-dispatch-narrowing`, PR #431).
> Frontend sub-project. The coordinator owns the work-status store write
> (this session does not touch the `todo` DB).
>
> Origin: the out-of-frame review gate on PR #417
> (`fix(frontend): narrow response union at analysis-service subscribe
> callbacks`, MERGED) promoted a `not-filed:` worklog marker to this item.
> PR #417 closed the union-erasing `as KataAnalysisResponse` casts at the
> two analysis subscribe callbacks per-site; the review recorded that the
> *structural root* survived — "exactly two sites, both fixed" is a
> point-in-time population, not a type-enforced invariant, because
> `KataGoClient.handleIncomingMessage` surfaces an error packet and then
> falls through to per-id subscriber dispatch, so every subscriber receives
> an un-discriminated payload and must narrow individually. A future
> `client.subscribe` site can re-introduce the un-narrowed cast.

## The commissioned shape — the typed subscribe API

The decision (coordinator-set) was to make the dispatch-layer narrowing
**type-enforced** rather than per-site discipline: change the `subscribe`
API so its callback parameter receives the discriminated union scoped to
the query type, forcing each subscriber to narrow at compile time.

### Why the callback-already-gets-the-union framing is insufficient

Before this change, the callback was already typed
`(response: KataGoResponse) => void`, and `KataGoResponse =
KataAnalysisResponse | KataActionResponse | KataErrorResponse` is already
a union. The gap the review named is not "the callback lacks the union";
it is that **an analysis subscriber could `as`-erase the union**
(`res as KataAnalysisResponse`) and the compiler permitted it. Worse, the
union is structurally over-wide for an analysis subscription: even after a
`'error' in res` probe, `KataActionResponse` survives in the `else`
branch (the analysis variant carries `turnNumber`/`isDuringSearch`; the
action variant carries `action`), so the post-probe `as KataAnalysisResponse`
cast was *needed* to drop the action member — and a needed cast is a cast a
future edit can get wrong.

### The mapping that closes it

`ResponseFor<Q extends KataGoQuery>` (added to the wire-types SSOT,
`engine/katago/types.ts`) is the type-level statement of the id-routing
invariant — an analysis query's id only ever carries analysis or error
packets; an action query's id only ever carries action or error packets:

```ts
export type ResponseFor<Q extends KataGoQuery> =
  Q extends KataGoActionQuery
    ? KataActionResponse | KataErrorResponse
    : KataAnalysisResponse | KataErrorResponse;
```

`subscribe` became generic over the query type:

```ts
public subscribe<Q extends KataGoQuery>(
  query: Q,
  onUpdate: (response: ResponseFor<Q>) => void,
): () => void
```

The forcing this buys: an analysis subscriber's callback receives
`KataAnalysisResponse | KataErrorResponse`, so the only non-analysis member
is the error variant. After `'error' in res`, the `else` branch narrows to
`KataAnalysisResponse` **with no cast** — and a callback that *accidentally*
reads an analysis field (`res.turnNumber`) without discriminating the error
variant is a hard `TS2339`. The post-probe `as KataAnalysisResponse` cast
PR #417 *needed* at each site (to drop the action member the broad union
admitted) is now eliminated, not just discouraged.

**Precise scope of the guarantee (no over-claim).** This removes the
*needed* cast and turns the *accidental* un-narrowed read into a compile
error; it does **not** make narrowing unbypassable. No TypeScript type can
forbid a deliberate `res as KataAnalysisResponse` — a subscriber that *wants*
to re-erase the union still can. The invariant is "the honest path no longer
requires a cast, and the lazy path no longer type-checks," not "the union can
never be erased." That is the strongest a structural type guarantee reaches;
a deliberate `as` is an ADR-0002-governed review concern, as it is everywhere.

## The CRITICAL constraint — `sendCommand`'s one-shot path — verified and preserved

The commission flagged (and the PR #417 review verified) that a blanket
early-return in `handleIncomingMessage` after surfacing the error packet is
**not** a safe drop-in: `sendCommand`'s one-shot path subscribes to its
action query's id and resolves its promise on the FIRST response routed
there — **including a `KataErrorResponse`**. A blanket early-return would
starve that ephemeral subscription and hang the promise.

Re-verified at HEAD: `sendCommand` (now `katago-client.ts:158-165` after the
generic signature widened `subscribe`) resolves on any `res`; the error
packet reaches it only because `handleIncomingMessage` surfaces the error
globally **and then falls through** to the per-id subscriber. This change
**does not touch** `handleIncomingMessage`'s fall-through. The typed
`subscribe<Q>` infers `Q = KataGoActionQuery` for `sendCommand`, so its
callback receives `KataActionResponse | KataErrorResponse` and resolves on
either — the one-shot behaviour is byte-for-byte preserved at runtime, and
now type-honest (it no longer needs a broad-union escape).

The constraint is pinned by a new runtime regression test (see Tests): a
probe that injects the unsafe blanket early-return turns the
error-resolution test red (the promise hangs to timeout), so a future
contributor adding that early-return fails CI rather than silently breaking
action-command error resolution.

## Sites migrated (the four `subscribe` callers, re-measured at HEAD)

An independent grep confirms exactly four `.subscribe(` call sites; the
generic API types each:

1. **`services/analysis-service.ts:712` (`analyzeRange`)** and
   **`:911` (`analyzeActiveNode`)** — both route through the private
   `routeSubscriptionResponse`, whose parameter was the broad
   `KataGoResponse`. Narrowed to `KataAnalysisResponse | KataErrorResponse`
   (what `ResponseFor<KataGoAnalysisQuery>` produces), so the post-probe
   `this.onAnalysisUpdate(res as KataAnalysisResponse, …)` **drops the
   cast** — `res` is `KataAnalysisResponse` by the compiler in the `else`
   branch. The `KataGoResponse` import (used only here as a type) was
   removed; `KataErrorResponse` added. Docstring updated (the "broad
   `KataGoResponse` union" framing was now inaccurate).
2. **`composables/board/usePlayFromPosition.ts:182` (`awaitFinalPacket`)** —
   passes a `KataGoAnalysisQuery`, so `res` is now
   `KataAnalysisResponse | KataErrorResponse`. The two casts there
   (`res as unknown as Record<string, unknown>` for the `in` probe and
   `res as KataAnalysisResponse` after) are both **removed** — `'error' in
   res` narrows directly, and the `else` is `KataAnalysisResponse`.
3. **`engine/katago/katago-client.ts:158` (`sendCommand`)** — passes a
   `KataGoActionQuery`; callback gets `KataActionResponse | KataErrorResponse`,
   resolves on either (the one-shot constraint above). No source change
   needed beyond the generic signature.

`engine/katago/contract.ts`'s orphan `IKataGoClient` interface (declared,
referenced nowhere, but documents the transport's intended shape) was
updated to mirror the generic `subscribe<Q>` signature so the contract stays
honest, and retrofitted with the ADR-0006 header it lacked (touched under
full visibility). Its pre-existing `connect()` / `disconnect()` signature
drift from the concrete class is left untouched per ADR-0004 (out of scope —
not the `subscribe` shape this change touches).

## The one internal cast (justified, confined)

The subscriber registry (`subscribers: Map<string, Set<ResponseCallback>>`)
is keyed by wire `id` only; it does not track which query type minted each
id, so its callbacks are stored at the broad `ResponseCallback`
(`(res: KataGoResponse) => void`). A narrower `(res: ResponseFor<Q>) => void`
is not contravariantly assignable to that, so `subscribe` widens it back at
the storage step: `const stored = onUpdate as ResponseCallback`. This is the
one place the id-routing invariant `ResponseFor<Q>` encodes is *asserted*
rather than *proven* — sound because `handleIncomingMessage` only ever
dispatches this id's own responses, which are exactly the `ResponseFor<Q>`
members. The cast is confined to the storage line (the public signature
stays narrow), and carries its justification inline per ADR-0002-applied-to-types.

## Compile-time regression artifact

`src/engine/katago/subscribe-narrowing.type-test.ts` — a type-level-only
module (no runtime exports; the never-called assertion function is referenced
through a `false && …` const so `noUnusedLocals` is satisfied without any
runtime invocation, and `vite build` tree-shakes the unimported module). It
lives under `src/**` deliberately: `tsconfig.app.json` includes only `src/**`,
and `tests/**` is excluded from both `vue-tsc -b` and `eslint`, so a
`@ts-expect-error` placed under `tests/` would be **inert as a gate**. Under
`src/`, the file is type-checked by `npm run build` (the CI `check` job), so
the assertions are load-bearing.

The assertions:

- NEGATIVE (the load-bearing one): in an analysis subscriber, reading
  `res.turnNumber` *before* discriminating the error variant is
  `@ts-expect-error`'d. If `subscribe` ever re-widens (broad union restored,
  or an `as`-erasing cast returns), the read type-checks, the directive goes
  unused, and the build fails with "Unused '@ts-expect-error' directive".
- POSITIVE: after `'error' in res`, the `else` branch reads
  `res.turnNumber` / `res.isDuringSearch` with no cast.
- NEGATIVE: `res.action` is not a field of the analysis union (`@ts-expect-error`).
- ACTION path: an action subscriber's callback reads `res.action` after the
  error probe with no cast, and `res.turnNumber` is `@ts-expect-error`'d.

**Guard liveness confirmed** (tests/CLAUDE.md: a guard that cannot fail is
worse than none). Two probes, both restored after:
- Reverting `subscribe` to the broad un-narrowed signature breaks the build
  in 13 places (the consumer simplifications + the type-test assertions).
- Removing just the load-bearing negative `@ts-expect-error` surfaces
  `TS2339: Property 'turnNumber' does not exist on type 'KataAnalysisResponse
  | KataErrorResponse'` — exactly the un-narrowed-read regression the
  commission names.

## Tests

`tests/integration/katago-client-sendcommand-oneshot.test.ts` — Tier-3,
drives the REAL `KataGoClient` against a mock `WebSocket` (sibling harness
shape to `analysis-service-error-packet-narrowing.test.ts`). Three cases:

1. `sendCommand` resolves on a matching `KataActionResponse`.
2. `sendCommand` resolves on a `KataErrorResponse` routed onto the action
   id — **the fall-through constraint** — and the error also reaches the
   connection-global `onError` surface.
3. The one-shot subscription tears down after resolving (a second packet on
   the id does not re-resolve / re-surface).

**Guard liveness confirmed**: injecting the unsafe blanket early-return into
`handleIncomingMessage` (the drop-in the commission warns against) turns case
2 red (the promise hangs to timeout); restored after.

The existing `analysis-service-error-packet-narrowing.test.ts` (PR #417, 5
tests) already pins the *runtime* dispatch behaviour at the analysis-service
boundary (error packet → `stopQuery`, no telemetry corruption, no false
ponder-exhausted, bookkeeping release, variant-correct genuine-final). This
change is structural (type-level) and preserves that behaviour — those 5
tests stay green unchanged.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — green (1058 modules).
- `npx eslint .` — exit 0, no warnings (the internal cast carries its
  justification; no `@ts-expect-error` ban-rule is enabled, and the type-test
  needs no `eslint-disable`).
- `npm run test:run` — 1044 passed | 4 skipped (1041 prior + 3 new). The
  ADR-0010 render-count guards stay green.
- `node tools/band-conformance/check.mjs --self-test` — 2 passed.
- `node tools/band-conformance/check.mjs --check` — no structural drift; 47
  advisory findings at the 47 baseline (the new B3 file imports only B3
  types → no new band leak).
- Doc-graph regenerated (`node tools/doc-graph/generate.mjs`) — new worklog
  node; `.svg` stays gitignored.

## Documentation touched

- This worklog.
- `frontend/FILES.md` — new row for `subscribe-narrowing.type-test.ts` [B3]
  (the only new file under `src/`; the new test file is under `tests/`,
  which FILES.md does not track).
- Doc-graph regenerated (`docs/doc-graph.json` + `docs/doc-graph.md` +
  `docs/doc-graph-report.md`) per the structural-doc discipline.
- **No IDENTIFIERS.md row**: `ResponseFor<Q>` is a type-level mapping, not a
  branded identifier; no new id, no moved construction site.
- **No FEATURES.md entry**: a behaviour-preserving structural refactor of the
  type surface. A Go player reading the tour would not misunderstand the
  offering without it.
- **No ADR amendment**: a concrete application of ADR-0002 (Rule 4,
  boundaries validate not coerce; and "type assertions must be justified")
  and type-driven design (frontend CLAUDE.md), not a change to a tenet.

## Deferrals / residue

- **`handleIncomingMessage`'s global-handler fall-through is unchanged — by
  design, not deferred.** The PR #417 review's residual (the global handler
  surfaces the error and falls through rather than early-returning) is the
  thing this item was opened to address *structurally*. The commissioned
  resolution is the **typed subscribe API**, not a reshape of the global
  handler: the fall-through is load-bearing (it is how `sendCommand` receives
  the error packet to resolve its one-shot promise), so removing it remains
  unsafe. The structural protection now lives at the *type* layer
  (`ResponseFor<Q>` makes the honest path cast-free and the un-narrowed read
  a compile error) rather than the *dispatch* layer, which is the
  type-enforced invariant the review asked for. No residue here — the item is
  fully discharged by the typed API. No `not-filed:` marker is required.
- **`IKataGoClient.connect()` / `disconnect()` signature drift** from the
  concrete `KataGoClient` (the interface declares `connect(): void`; the class
  takes `connect(url, callbacks)`). Pre-existing, out of scope, left untouched
  per ADR-0004. The `subscribe` method this change touches is now accurate;
  the other interface methods stay stale (a deliberate minimal-touch call, but
  it leaves the orphan in a mixed state a future reader should not treat as
  authoritative). `not-filed:` not a known defect — the interface is an orphan
  (referenced nowhere); a maintainer judgment whether the orphan contract is
  worth keeping in sync or deleting.
- **The internal `as ResponseCallback` cast's soundness premise** (an analysis
  query's id never receives an action packet) is a promise about the proxy's
  id-routing, which the frontend cannot locally prove. It is the proxy's wire
  contract; the cast is the one place the type-safety rests on the non-local
  side. Documented inline at the cast; no cheap local test can prove the
  proxy never cross-routes. `not-filed:` not a known defect — the routing
  contract is the proxy's, surfaced here only so the assumption is visible.

## Appendix — out-of-frame hack-rationalization artifact (verbatim)

Run via the `hack-rationalization-detector` skill in a separate subagent that
did not produce the change (the touched `subscribe` slot has four call sites,
the >1-writer trigger for the pass). Verdict **general**. Its five
findings-beyond-verdict were triaged at gate discharge:

| Finding | Triage |
|---|---|
| "forces narrowing" over-reads the guarantee — a deliberate `as` still compiles | **Applied** — worklog framing softened to "removes the needed cast / makes the accidental un-narrowed read a compile error," not "unbypassable" (the in-code `types.ts` comment was already precise). |
| The compile-time artifact's own coverage is unguarded (contingent on the `src/**` tsconfig include + the CI build step) | **Applied** — a liveness-contingency note added to the type-test file naming the two conditions and "keep it in `src/`." |
| The internal cast's invariant is asserted, not proven; rests on proxy id-routing | **Filed** (not-filed marker above) — it is the proxy's wire contract; no cheap local proof. Recorded so the assumption is visible. |
| Trivial residue: `const r = res;` redundant alias at usePlayFromPosition.ts | **Applied** — alias removed; downstream reads use `res` directly. |
| `contract.ts` orphan now mixed-state (subscribe accurate, other methods drift) | **Record** — already filed as the orphan-contract `not-filed:` deferral above; the minimal-touch call is correct. |

The full artifact, verbatim:

```
## Hack-rationalization review: subscribe-dispatch-narrowing (branch bork/refactor/subscribe-dispatch-narrowing vs main)

FRAME CHECK: Out of frame. I did not produce this change and treated the worklog (docs/worklog/2026-06-12-subscribe-dispatch-narrowing.md) as the object of suspicion. All five worklog claims were independently re-derived from code and verified by injected probes (reverted after), not taken on the worklog's word.

GENERAL FIX:   The chokepoint API types its own output so the over-wide member cannot reach any subscriber — `subscribe`'s callback receives `ResponseFor<Q>` (query-scoped union), so every one of the (single) producer's call sites is narrowed at once and an un-discriminated analysis read is a hard `TS2339`. This IS the change shipped, and it is stateable as one invariant over all writers because there is exactly one writer to the slot (the `subscribe` method itself).
PATCH SHIPPED: `subscribe<Q extends KataGoQuery>` with callback `ResponseFor<Q>`; one internal storage cast `onUpdate as ResponseCallback`; casts dropped at all 3 non-`sendCommand` consumers; a `src/`-resident compile-time `@ts-expect-error` artifact + a Tier-3 runtime test pinning the `sendCommand` error-resolution fall-through.
DOWNGRADE:     No discipline-word downgrade of a named-better-fix. The one place a "more general" fix is conceivable — eliminating the internal `as ResponseCallback` by making the `Map<id, Set<callback>>` registry type-aware — is genuinely not reachable: the registry is keyed by wire `id` only, the id namespace does not carry its minting query's type, and the discriminators are field-presence (`'error' in`/`'action' in`), not a tagged `kind`. So a typed registry would require threading `Q` through a string-keyed `Map`, which TypeScript cannot express soundly; the single confined, commented cast is the correct residue, not a dodge. The grep_tells scanner found 0 co-occurrence tells (4 minimality-terms, 4 named-fix cues, no adjacency).
WRITER DELTA:  Claimed 4 vs enumerated 4 (writers: usePlayFromPosition.ts:182, analysis-service.ts:712, analysis-service.ts:911, katago-client.ts:164/sendCommand). All four migrated; the 3 further `.subscribe(` hits are type-test fixtures, not production writers. Crucially, the "slot" is one API method, not a multi-writer state cell (unlike known-case A): the type on the single signature quantifies over all call sites, so there is no per-writer-gate fragility and no next-writer reopening — a new `subscribe` caller inherits `ResponseFor<Q>` for free.
RUNTIME:       Reproduced + verified. (a) `handleIncomingMessage` fall-through is byte-for-byte unchanged vs main (verified by diff); (b) `sendCommand` resolves on an error packet — confirmed green, and confirmed load-bearing by injecting the blanket early-return the worklog warns against, which hangs case 2 to a 5006ms timeout; (c) reverting the API to the broad union breaks the build in ~13 sites incl. the type-test; (d) removing just the negative `@ts-expect-error` surfaces exactly `TS2339: Property 'turnNumber' does not exist on type 'KataAnalysisResponse | KataErrorResponse'`. All probes reverted; tree restored (md5-confirmed), baseline `vue-tsc -b` and the 3 new tests green.

TELLS (Step 1): None. grep_tells.py over the worklog: "No tells" (0 co-occurrence). The Deferrals section names the fall-through-untouched decision but attaches a concrete cost (sendCommand's one-shot resolution depends on it), verified true at runtime — a cost, not a mood.

VERDICT: general

WHY: The fix is the most general correct one available for the slot — it lives on the single API chokepoint, so one signature change discharges all four producers and every future one, and the build/runtime probes show both the compile-time guard and the runtime fall-through guard are live (they fail when defeated). The one cast is forced by a real type-system limit (an id-keyed registry that structurally cannot carry the minting query's type), is confined to one line, and is commented per ADR-0002; it is not a narrowing chosen over a reachable better fix.

FINDINGS BEYOND VERDICT (required):
  - The "MUST discriminate / forces each subscriber to narrow" framing is true only for ACCIDENTAL un-narrowed reads. I verified that a deliberate `res as KataAnalysisResponse` inside an analysis subscriber STILL compiles (vue-tsc exit 0). No TypeScript type can forbid `as`, so this is inherent, not a defect — but the precise honest claim is "removes the cast that was previously needed and turns the accidental un-narrowed read into a hard error," NOT "makes narrowing unbypassable." The in-code type comment in types.ts states it correctly ("not a silent as-erased cast"); a reader who takes only the worklog's headline verbs could over-read the guarantee.
  - The compile-time artifact is a freshness/CI subtlety worth a maintainer's eye: it is load-bearing ONLY because `npm run build` runs `vue-tsc -b` over `src/**` in CI (frontend-ci.yml). The guard's liveness is entirely contingent on that CI step staying wired and on the file remaining under `src/` (not `tests/`, which is outside tsconfig.app.json's `include`). The worklog's reasoning for placing it in `src/` is correct and I verified the tsconfig include set — but the guard has no self-defense if a future tsconfig change narrows the include glob or excludes `*.type-test.ts`; nothing flags that the artifact has gone inert. It is a guard whose own coverage is not itself guarded.
  - The internal `as ResponseCallback` is sound under the stated invariant ("handleIncomingMessage only dispatches this id's own responses"), but that invariant is asserted, not proven, and is NOT tested in isolation — no test asserts that an analysis id never receives an action packet (which would violate the soundness premise of the cast). The runtime test covers the action-id-receives-error case (sound), but the cross-routing-impossibility that justifies the cast rests on proxy-side id-routing behaviour the frontend cannot see. This is acceptable (it is the proxy's contract), but it is the one place the type-safety is a promise about the non-local side, not a local proof.
  - Trivial residue, non-blocking: usePlayFromPosition.ts:195 keeps `const r = res;` — a now-redundant alias since `res` is already `KataAnalysisResponse` after the guard. Harmless leftover from the cast removal.
  - The contract.ts `IKataGoClient.subscribe` was updated to mirror the generic signature, but the interface is an acknowledged orphan (referenced nowhere) and its `connect()`/`disconnect()` already drift from the concrete class. The worklog correctly files this as out-of-scope per ADR-0004 and marks it not-a-known-defect. Worth noting only that updating an orphan interface's `subscribe` while leaving its other methods drifting is half-honest — the contract is now accurate on the one method this change touched and stale on the rest, which is the correct minimal-touch call but leaves the interface in a mixed state a future reader may misread as authoritative.
```
