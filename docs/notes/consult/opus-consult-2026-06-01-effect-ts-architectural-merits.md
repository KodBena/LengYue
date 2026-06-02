# Opus Consult — Effect-TS on Architectural Merit, Maturity Bracketed (analytic firewall, 2026-06-01)

Analytic-firewall fifth opinion (Opus 4.8, independent agent), requested by
the maintainer as the **final** consult in a four-record Effect-TS
exploration. It is deliberately framed to *not* re-litigate the prior
conclusions: it sets aside the documentation/purity goal that anchored the
first consult, sets aside the maturity/churn objection that did heavy lifting
there, and asks the one question the prior records named but did not deeply
evaluate — **is there a subsystem where Effect's *heavyweight* machinery
(`Fiber` / `Scope` / `Stream` / `Layer`) genuinely earns its weight against
the frontend's actual shapes?**

The candidate is the analysis / streaming / resource-lifetime cluster. This
record reasons independently and adversarially; it has no stake. The verdict
is anchored in direct reads of `analysis-service.ts`, `katago-client.ts`,
`useReviewSession.ts`, `wait-for-analysis.ts`, `store/index.ts`
(`closeBoard` / `resetWorkspace`), and the resource-ownership audit plan, with
line references throughout.

Saved verbatim for auditability per the consult-record convention. License:
Public Domain (The Unlicense).

---

# Analytic Firewall — Fifth Opinion: "On architectural merit alone, with maturity bracketed, does Effect's Fiber/Scope/Stream earn its weight at the analysis-streaming-resource subsystem?"

**Consult date:** 2026-06-01
**Reviewer stance:** Independent. Adversarial where warranted. No stake across the three scope options (project-wide / subsystem-scoped / not at all).
**Calibration:** Maintainer has a Haskell / formal-methods background. `Fiber` is a green thread with structured join/interrupt; `Scope` is a `bracket` / `ResourceT` region with guaranteed finalizer ordering; `Stream` is a pull-based `Stream f a` with built-in resource safety; `Layer` is `ReaderT`-over-`Managed` DI. The argument is pitched at "does the hand-rolled code have a failure-mode shape `Scope`/`Fiber`/`Stream` would *structurally* prevent," not "what is structured concurrency."

---

## The maturity caveat, surfaced once and set aside

Per the brief, the maturity / churn / "moving train" objection is bracketed.
Stated once, in full, so it can be weighed separately: Effect's core
programming model is semver-stable at v3, but v4 is in beta with a fiber-
runtime rewrite and a 70 kB→20 kB bundle step-change, the ecosystem releases
weekly across its peripheral packages, and **no trodden Effect-in-Vue
integration path exists** (the 2026-05-29 consult searched and found none;
nothing has changed). A frontend adopting Effect authors its own Effect↔Vue
bridge conventions. That is a real cost and a real risk — *and it is set
aside for the rest of this record.* Everything below assumes a stable version
surface and judges architectural fit only. The maintainer weighs maturity on
its own clock.

One consequence of bracketing cannot be bracketed away, because it is
architectural, not maturity-related: even granting a stable Effect, the
*bridge itself* is bespoke here. That belongs in the architectural ledger
(it raises the cost bar for any "yes") and is treated as such below, not as a
maturity caveat.

---

## Bottom line up front

**Not at all (option 3) is the least-regret path — and this is the strongest
"no" of the five-consult arc, not the weakest, because it survives the
adversarial reframing the brief demanded.** The prior consults could be
discounted as "lighter tools were over-built *for documentation goals*." This
one cannot: it grants Effect its *home-field* strengths (`Fiber`, `Scope`,
`Stream`), grants a stable version surface, points them at the one subsystem
that is genuinely concurrent-streaming-resourceful — and finds the hand-rolled
implementation is **not fragile in the ways Effect would fix.** It is
*solid, legible, and already structured around exactly the invariants
`Scope`/`Stream` would encode* — but encoded in the frontend's own
vocabulary (the per-board ownership maps, the `settle()` teardown, the
resource-ownership audit's comment convention), which composes with the rest
of the codebase, whereas Effect's encoding would not.

The sharp version, in six claims:

1. **The resource-ownership discipline is already a hand-rolled `Scope`, and
   it is a *better* fit than `Scope` here — because the finalizers are keyed
   to *domain* lifetimes (`BoardId`, identity-flip, card-transition), not to
   *lexical* acquisition regions.** *(verified — audit plan + `closeBoard` /
   `resetWorkspace`)* `Scope`/`acquireRelease` ties release to the dynamic
   extent of an acquiring computation. But the frontend's owned resources
   (`activeQueries`, `activeSubscriptions`, `restartCallbacks`,
   `boardToQueries`, ledger entries, telemetry rows, abort controllers,
   persisted bundles) are not owned by a *computation* — they are owned by a
   long-lived *entity* (a board tab) whose lifetime is user-driven and
   crosses arbitrarily many computations. `Scope`'s lexical/dynamic-extent
   model is the *wrong* ownership axis for this; the per-`BoardId` `Map` is
   the *right* one. (Claim 4 develops why this is decisive.)

2. **`analysis-service` is `Stream`-shaped on the wire but `Subject`-shaped
   in its job, and the `Subject` shape is correct.** *(verified — the public
   surface)* `analyzeRange` / `analyzeActiveNode` are *synchronous*, return a
   `string | null` query-id, and fan packets out via `client.subscribe`'s
   callback into the ledger (`analysis-service.ts:632-636`, `822-826`). A
   `Stream` is a *pull* protocol with one consumer composing transformations;
   what the service actually does is *multiplex* one WebSocket's packets to
   *many* independent stateful sinks (ledger, stability-trajectory store,
   telemetry, auto-save dirty signal, per-board `activeMode` projection) — a
   *push/fan-out* shape. `Stream` would model the wire arrival; it would not
   model the multi-sink fan-out, which is the part with the actual
   complexity. You would wrap a `Stream` around the socket and then *still*
   hand-write the fan-out — net new abstraction, same core code.

3. **The interruption story Effect is famous for is already present, typed,
   and race-correct — via `AbortController` + a single idempotent
   `settle()`.** *(verified — `wait-for-analysis.ts:104-133`)* The
   abort-and-resume choreography in `useReviewSession` is the textbook
   "`Fiber.interrupt` with guaranteed finalizer" use case, and it is solved
   here without Effect: `settle()` (`wait-for-analysis.ts:109-116`) is a
   single idempotent teardown that clears the timer, the watcher, and the
   abort listener on *whichever* of the three race channels wins — *exactly*
   the "guaranteed finalizer regardless of how the fiber ends" guarantee, in
   12 lines, with the three channels enumerated in the file header. There is
   no leak-on-interruption failure mode for `Fiber` to prevent here.

4. **The audit already *ran the experiment* Effect's `Scope` is sold as
   preventing — and the result argues against `Scope`, not for it.**
   *(verified — `resource-ownership-audit-plan.md`)* The 2026-05-04 audit was
   triggered by exactly the leak class `Scope` exists to abolish: a
   `closeBoard` that spliced a board without terminating its in-flight ponder
   (a silent compute leak with no in-app symptom). The audit enumerated **~25
   owner-resource pairs across 6 mutation sites**, closed all of them, and
   *codified a forward-authoring discipline* (the inline-comment convention +
   the docstring enumerated-cleanup shape + the fix/document/defer checklist).
   That discipline is the project's `acquireRelease` — and crucially, it
   handles cases `Scope` *cannot*: the "document the deferral with a revisit
   trigger" branch (the `analysisService.disconnect()` deferral keyed to a
   future user-keyed-endpoint deployment) is a *deliberate non-release with a
   recorded rationale*, which a type-level `Scope` would force you to either
   release (wrong) or escape-hatch out of (defeating the type). The
   hand-rolled discipline is strictly more expressive than `Scope` at the one
   site `Scope` would most want to own.

5. **The render-perf arc raises the cost bar from "tax" to "regression
   risk."** *(verified — `onAnalysisUpdate` hot path + ADR-0010 context)*
   `onAnalysisUpdate` (`analysis-service.ts:910-1000`) is a per-packet hot
   path that the green arc instrumented down to `performance.measure`
   granularity (`rb3:handler`, `analysis-service.ts:940,973`). It runs
   normalize → ledger record → stability ingest → board-metric write →
   auto-save dirty bump on *every* packet, hundreds per range query. Routing
   this through a `Stream` pipeline and an Effect runtime scheduler at a
   boundary that was *just* hand-tuned for render-locality is not a neutral
   paradigm tax — it is a live regression risk at the exact seam the codebase
   paid to harden. Effect's per-step fiber scheduling overhead is small in
   absolute terms but non-zero per packet, and "performance is a consequence
   of infrastructural excellence" cuts *against* inserting a runtime here.

6. **A subsystem-scoped adoption creates a two-paradigm seam worse than
   either pure choice — and the seam lands on the hottest, most
   carefully-wired boundary.** *(analytic, grounded in the verified
   call-graph)* `analysis-service` is not an island: it writes the `ledger`,
   the `stabilityTrajectoryStore`, `telemetry`, `analysisPersistenceService`,
   and `store.engine.*`; it is driven by `useReviewSession`, `App.vue`'s
   Follow-Me watcher, `useUserIORegistry`, and the analysis tab; it is torn
   down by `closeBoard` / `resetWorkspace` / HMR-dispose. An Effect island
   here would `runFork` at every one of those ingress points and bridge back
   to plain refs/`Map`s at every egress — the Harbor "`runPromise` at every
   bridge" tax, concentrated at the subsystem with the *most* bridges and the
   *tightest* perf budget. The seam is maximally expensive precisely where
   you would place it.

The recommendation, stated plainly: **decline Effect at all three scopes.
The analysis-streaming-resource cluster is the best-fit candidate in the
entire frontend, and even at its best fit — granting a stable version
surface, granting Effect its home-field `Fiber`/`Scope`/`Stream` strengths —
the hand-rolled implementation is correct, legible, and structured around the
right ownership axis, while Effect would add a runtime at a freshly-perf-tuned
hot path, model the wrong half of the fan-out, own resources on the wrong
(lexical) axis, and create a two-paradigm seam at the subsystem with the most
bridges. This is the first consult that can say "even at its best-fit
subsystem, Effect is over-built" *without* relying on the documentation-goal
reframing or the maturity objection — which makes it the firmest "no" of the
arc.** Detail follows.

---

## What was verified in the repository

All claims in this section are **verified** by direct read of the working
tree at `/home/bork/w/omega/frontend/` on 2026-06-01.

### `analysis-service.ts` — the streaming client (~1160 lines)

- **The analyze methods are synchronous fire-and-fan-out, not async values.**
  `analyzeRange` (line 438) and `analyzeActiveNode` (line 660) build a
  `KataGoAnalysisQuery`, call `this.client.subscribe(query, cb)` (lines
  632, 822), stash the returned unsubscriber in `activeSubscriptions` (lines
  636, 826), register a restart thunk (lines 647-653, 834-840), index the
  query on its board (lines 656, 843), and **return the query-id string**
  (lines 657, 844). Results arrive asynchronously through
  `onAnalysisUpdate` (line 910). This is the verified `Subject`/pub-sub shape
  the `IO<T>` consult already flagged — re-confirmed here for the `Stream`
  question specifically.

- **Per-query bookkeeping is four coordinated `Map`s plus a per-board
  index.** `activeQueries` (line 66, the per-query record carrying
  `boardId`/`mode`/`path`/`hash`/`framing`/`startedAt`/`ponderCeiling`),
  `activeSubscriptions` (line 99, `queryId → () => void`), `restartCallbacks`
  (line 105, `queryId → () => void`), and `boardToQueries` (line 113,
  `BoardId → Set<queryId>`). These are the per-entity ownership maps the
  audit's "Forward note for Pass 3" named as the recurring shape, and they
  are the hand-rolled `Scope` registry. The lifecycle invariants are spelled
  out in the field comments (lines 56-116) — e.g. `boardToQueries` is "grown
  by the analyze methods … shrunk by `stopQuery`."

- **`stopQuery` (line 1070) is the per-query finalizer.** It reads and calls
  the unsubscriber (lines 1076-1078), drops the restart thunk (1080), shrinks
  the board set and prunes the empty set (1082-1088), sends the wire
  `terminate` (1090), deletes the query record (1091), unregisters telemetry
  (1096), and re-projects `activeMode` (1098). It is **idempotent** on an
  already-released id (early-return at 1071-1074) — verified, and load-bearing
  for the abort/timeout/close races. `stopBoardAnalysis` (1101) iterates a
  *snapshot* of the board's set (1107, comment names the mutation-during-
  iteration hazard) and delegates to `stopQuery`; `stopAllBoardAnalyses`
  (1128) iterates a snapshot of board keys and delegates to
  `stopBoardAnalysis`. The finalizer tree is hand-built but complete and
  snapshot-safe.

- **Cancellation/interruption is correct across the disconnect race.** The
  `onDisconnect` handler (lines 131-185) deliberately does *not* clear the
  closure maps and documents *why* (lines 132-143: the closures are
  "no-op-functional" against the dead WS and get overwritten on next
  subscribe; audit pairs O15/O6). It *does* clear telemetry (156-158) with a
  documented rationale (the user-visible queue tooltip). This is exactly the
  fine-grained "release this, deliberately-keep that, with a recorded reason"
  control that a uniform `Scope`-drop would flatten.

- **The hot path is instrumented and dense.** `onAnalysisUpdate` (910)
  increments `packetCount`, records telemetry (928), normalizes framing
  (948), records into the ledger (949) and the stability-trajectory store
  (957), writes a board metric (960), and bumps the auto-save dirty signal on
  finals only (970-972) — all bracketed by DEV-only `performance.measure`
  anchors (`rb3:handler`, lines 940, 973). Multi-sink fan-out per packet, on
  the measured-hot path.

### `katago-client.ts` — the WebSocket transport (155 lines)

- **`subscribe` (line 110) is the multiplexing primitive.** It registers the
  callback in a per-id `Set` (`subscribers`, line 31), sends the query, and
  **returns an unsubscriber** (lines 120-128) that deletes the callback and
  prunes the empty set. `sendCommand` (131) is `subscribe`-then-unsub-on-
  first-response wrapped in a `Promise` — the request/response adapter over
  the pub-sub core. `handleIncomingMessage` (89) routes by `response.id` to
  the subscriber set and fans out (`callbacks.forEach`, 103). This is a small,
  legible, correct multiplexer; it is the layer a `Stream` would wrap, and
  wrapping it buys nothing the returned-unsubscriber closure does not already
  give.

### `wait-for-analysis.ts` — the interruption primitive (134 lines)

- **Three-channel race with a single idempotent settle.** The header (lines
  7-12) enumerates the three resolution channels (watcher / timeout / abort),
  exactly one winning. `settle()` (109-116) is the single teardown: guarded
  by a `settled` flag (110-111), it `clearTimeout`s, `unwatch`es, and
  `removeEventListener`s the abort handler on *every* path. `AnalysisWaitError`
  (47) carries `reason: 'timeout' | 'aborted'` — a two-arm discriminated
  union the consumer narrows exhaustively (`useReviewSession.ts:447-458`).
  This *is* "structured interruption with a guaranteed finalizer," typed, in
  one small pure-ish primitive. There is no race-leak for `Fiber` to fix.

### `useReviewSession.ts` — the abort choreography

- **Per-board abort registry, module-scoped for cross-mutation reach.**
  `pendingAnalysisAborts: Map<BoardId, AbortController>` (line 79) with a
  block comment (50-78) that *names the exact failure mode* a single-slot
  controller would cause ("loadCard on board B abort an in-flight wait on
  board A, silently wedging A in ANALYZING") and the resource-audit pairs it
  closes (O5/O11). `abortBoardReview` (88) and `abortAllReviews` (102) are the
  reach-in affordances `closeBoard` / `resetWorkspace` call. The three
  terminal branches of `processUserMove` (success 462-477, timeout/abort
  428-460) each release the analysis-service query *and* the abort entry,
  guarded against a later replacement having overwritten the slot (431-433,
  464-466). This is the abort-and-resume state machine the brief named as
  "Fiber-interruption territory" — and it is already correct, with the
  ownership-overwrite race handled explicitly.

### `store/index.ts` — `closeBoard` / `resetWorkspace` (the hand-rolled Scope)

- **`closeBoard` (line 367) is a finalizer with a load-bearing order.** Nine
  enumerated cleanups in the docstring (lines ~290-342), each naming the
  resource and the leak-without-it: stop analysis → purge ledger → purge
  stability store → discard persisted bundle (fire-and-forget) → drop
  reviews/activeMode/cardTreeNav dict entries → abort review wait → purge
  thumbnails → remove card-tree slot. The body (368-412) carries the inline-
  comment convention; the ordering paragraph (344-353) explains why engine-
  stop precedes ledger-purge (so an in-flight packet can't re-populate after
  the clear). This is `bracket` with an *explicitly reasoned* finalizer
  ordering — the thing `Scope` automates but in a fixed acquire-reverse order
  that would *not* match this domain ordering (close-engine-before-purge is
  not an acquisition-reverse constraint; it is a domain race constraint).

- **`resetWorkspace` (line 530) is the identity-flip finalizer.** Same shape
  across every board at once: `stopAllBoardAnalyses` → ledger/stability/
  thumbnail/card-tree purges → bundle-summary forget → `abortAllReviews` →
  workspace reset. The docstring (451-529) carries the *privacy* reasoning
  (raw-CardId-keyed caches collide across users; UUID-keyed ones don't) and
  the *deliberate non-release* of `store.engine` / the live WebSocket with a
  recorded revisit trigger ("user-keyed endpoints"). The privacy-tiered and
  deferred-with-trigger finalizers are the two things a uniform `Scope` drop
  cannot express.

### The audit that already ran Effect's experiment

- `resource-ownership-audit-plan.md`: **all three passes closed 2026-05-04**;
  **~25 owner-resource pairs across 6 mutation sites** (closeBoard,
  resetWorkspace, identity-change-via-watcher, HMR dispose, component
  unmount, engine WS disconnect); 17 closed-on-walk + the rest fixed across
  ten PRs. Pass 3 *codified the forward-authoring discipline* (§"Comment
  convention and authoring discipline", lines 196-348). The threshold section
  (314-335) explicitly carves out "Vue lifecycle automatics" and "closure-
  scoped state" as *not* needing the discipline — i.e. the project already
  drew the precise line `Scope` would draw, by hand, and knows which side
  each resource is on.

---

## Q1 — Does `analysis-service` want `Stream`?

**No. It wants — and has — a multiplexing `Subject`, which is a different and
correct shape.** *(verified.)*

The seductive framing is "a WebSocket delivering packets over time is a
`Stream<Packet>`; model it as one and get resource-safe composition for
free." Three verified facts defeat it:

1. **The consumer count is many, not one.** `Stream`'s value is a *single*
   consumer composing `map`/`filter`/`scan`/`mapEffect` over a pull source
   with back-pressure and scoped resource release. `onAnalysisUpdate`
   (910-1000) fans *each* packet to five independent stateful sinks (ledger,
   stability store, telemetry, board metric, auto-save signal). That is a
   `Subject.subscribe`-style *push* fan-out, not a pull pipeline. You cannot
   express "one packet updates five disjoint mutable stores" as a `Stream`
   transformation without either (a) `broadcast`ing into five streams (five
   schedulers where there was one synchronous loop) or (b) doing the fan-out
   *inside* a `Stream.tap`, at which point the `Stream` wraps the socket and
   the real code is unchanged. Net: new abstraction, same body, more
   scheduling.

2. **The back-pressure `Stream` provides is unwanted here.** The packets are
   pushed by the proxy at a user-tuned cadence (`reportDuringSearchEvery`);
   the SPA cannot back-pressure the engine and does not want to — it wants to
   process every packet as fast as it arrives and *coalesce on the render
   side* with a time-throttle (per the project's own adaptive-fan-out note:
   "coalesce analysis-aggregate redraws with a time-throttle, not a
   dirty-check"). `Stream`'s pull/demand model is solving a problem this
   boundary does not have.

3. **The wire arrival is already a clean primitive.** `client.subscribe`
   (`katago-client.ts:110`) returns an unsubscriber; that *is* the resource-
   safe acquire/release for one subscription, and `stopQuery` already calls
   it. A `Stream.async`/`Stream.acquireRelease` wrapper would re-encode an
   unsubscriber the code already has and already disposes correctly.

**Where `Stream` *would* help, honestly:** if the analysis pipeline were ever
refactored into a *single-consumer* transformation chain — e.g. "parse →
normalize → window → aggregate → emit one derived series" with one sink and
genuine back-pressure (say, a worker-thread offload of the aggregate
computation that *can* fall behind) — `Stream`'s scoped, back-pressured,
composable model would earn its weight. That is not the current shape and is
not on any roadmap surfaced in the docs. (Named as the trigger in Q6.)

---

## Q2 — Does the resource-lifetime cluster want `Scope` / `acquireRelease`?

**No — and this is the counterintuitive core of the verdict, because `Scope`
looks like a *perfect* fit until you check the ownership axis.** *(verified
against the audit + the mutation sites.)*

`Scope`/`acquireRelease`/`bracket` tie a finalizer to the **dynamic extent of
an acquiring computation**: you acquire inside a scoped effect, and release
fires when that effect (or its enclosing `Scope`) completes or is interrupted,
in reverse acquisition order. This is the right tool when *the computation
owns the resource* — open a file, use it, close it; fork a fiber, join it,
interrupt it.

The frontend's owned resources are not owned by computations. They are owned
by **long-lived domain entities whose lifetimes are user-driven and span
unboundedly many computations**:

- An `activeSubscriptions` entry is owned by a *board* (`BoardId`), released
  when the *user closes the tab* — an event with no enclosing computation.
- A `pendingAnalysisAborts` entry is owned by a *board's review wait*,
  released by the *next card transition*, *session end*, *board close*, or
  *identity flip* — four different domain events, any of which can win.
- A ledger bucket is owned by a `(configHash, nodeId)` pair, released by
  *board close* or *identity flip*.
- The privacy-relevant card-thumbnail cache is owned by an *identity*,
  released by *logout/rejection*.

None of these release points is "the acquiring computation finished." They
are *domain lifecycle events on entities*, and the correct data structure for
"resource keyed by a long-lived entity identifier, released when that entity's
lifecycle event fires" is exactly what the code has: a **per-entity `Map`
released at the mutation site for that entity's lifecycle event.** This is not
a hand-rolled approximation of `Scope` that `Scope` would improve — it is a
*different and more appropriate* ownership model. `Scope`'s lexical/dynamic-
extent region is a mismatch for entity-keyed, multi-event, user-driven
lifetimes.

Three further verified points sharpen this:

- **The finalizer ordering is a domain constraint, not an acquisition-reverse
  constraint.** `closeBoard` must stop the engine *before* purging the ledger
  (so an in-flight packet can't re-populate the cleared ledger —
  `store/index.ts:344-353`). That ordering has nothing to do with the order
  resources were acquired; `Scope`'s reverse-acquisition finalizer order
  would not produce it and might violate it. The hand-rolled order is
  *reasoned from the race*, which is the correct basis.

- **The "deliberate non-release with a recorded trigger" branch has no
  `Scope` equivalent.** `resetWorkspace` *intentionally keeps* the live
  WebSocket and `store.engine` across an identity flip, with a documented
  revisit trigger (`store/index.ts:503-515`). A `Scope` that owned the WS
  would force release; escaping that (forking the WS onto a longer-lived
  parent `Scope`) is precisely the manual lifetime-management the `Map`
  already does, with less ceremony.

- **The audit already drew `Scope`'s line, by hand, and knows both sides.**
  The threshold section (`resource-ownership-audit-plan.md:314-335`)
  enumerates what *doesn't* need explicit cleanup (Vue automatics, closure-
  scoped GC'd state, type-checked invariants) versus what does (entity-keyed
  module-scope `Map`/`Set`s). `Scope` would *re-draw* this line at the type
  level — but the project has the line *and a 25-pair inventory that proves
  it walked the whole tree*. The marginal safety `Scope` adds over "we
  audited all 25 pairs, closed them, and codified the forward discipline" is
  the safety of a type-check over a completed-and-codified audit: real in the
  abstract, near-zero given the audit actually ran and the discipline is
  named in `frontend/CLAUDE.md`.

**The honest pro-`Scope` case, stated fairly and then weighed:** `Scope`
would make the *forward* discipline compiler-enforced rather than review-
enforced — a new contributor adding a sixth `Map` to `analysis-service`
*could* forget the `closeBoard` cleanup, and the audit's discipline catches
that only at review/audit time, not compile time. This is the same
"convention-not-compiler" gap the `neverthrow` consult found for
exhaustiveness. It is genuine. But: (a) it is a *single-author* codebase with
the discipline named in the file most contributors read first; (b) capturing
it via `Scope` requires lifting the *entire* analysis subsystem into Effect
(you cannot type-enforce a finalizer on a resource the type system does not
see as scoped), which is the whole-subsystem cost for a forward-safety margin;
and (c) the leak class it would catch is the one the audit *already swept and
closed* — the marginal future exposure is one new `Map` between audits, which
the codified checklist is shaped to catch. Paying the whole-subsystem Effect
cost to compiler-enforce a discipline that is codified, single-authored, and
freshly-audited is the proportionality error the entire consult arc has been
naming, in its strongest-fit instance.

---

## Q3 — Does the interruption story want `Fiber`?

**No. `Fiber`'s headline guarantee — interruption with guaranteed finalizer
execution, no leak regardless of how the computation ends — is already
delivered by `AbortController` + idempotent `settle()`.** *(verified —
`wait-for-analysis.ts`, `useReviewSession.ts`.)*

The `Fiber` pitch is: fork a computation, and if you interrupt it, its
finalizers *still run* in the correct order, and you cannot leak a half-
released resource on the interruption path. Map that onto the verified code:

- The "fork" is `analyzeRange` returning a query-id + the `waitForAnalysis`
  promise.
- The "interrupt" is `controller.abort()` (from `loadCard`, `endSession`,
  `closeBoard`, `resetWorkspace`).
- The "guaranteed finalizer on interruption" is `settle()`
  (`wait-for-analysis.ts:109-116`), which the abort channel triggers
  (`onAbort`, line 118) and which clears *all three* of timer/watcher/
  listener regardless of channel — plus `processUserMove`'s catch
  (`useReviewSession.ts:428-460`) which releases the analysis-service query
  on *every* terminal branch.

The three-channel race (watcher vs timeout vs abort) with single-winner
idempotent teardown is *precisely* the `Fiber.race` + interruption-finalizer
semantics, hand-written and verified leak-free (the `settled` flag makes
re-entry a no-op; the file header enumerates the channels). The
ownership-overwrite race ("a later `processUserMove` replaced our slot") is
handled by the `if (pendingAnalysisAborts.get(bId) === controller)` guards
(431, 464) — a fiber model would express this as scoped-fiber-per-card, but
the guard is correct and local.

**Where `Fiber` would help, honestly:** if the choreography grew to *many*
concurrently-forked sub-computations with complex join/race topology — e.g.
"fork N analysis sub-queries, race them, interrupt the losers, collect the
winner's finalizers" with N large and the join structure non-trivial —
hand-rolling the interruption tree would become error-prone and `Fiber`'s
structured join/interrupt would earn its weight. The current shape is
`Promise.all([waitForAnalysis(s_0), waitForAnalysis(s_1)])`
(`useReviewSession.ts:423-426`) — a *fixed two-way* join with one
`AbortController`. Two is not N; `Promise.all` + one controller is the right-
sized tool. (Named as the trigger in Q6.)

---

## Q4 — The render-perf cost bar, and the two-paradigm seam

Two adversarial counterweights the brief named, both verified to bite hard.

**The runtime at a freshly-tuned hot path is a regression risk, not a tax.**
`onAnalysisUpdate` (910-1000) is on the per-packet hot path the ADR-0010
"green" arc instrumented to `performance.measure` granularity (the `rb3:*`
anchors). The project's own memory discipline is "performance is a consequence
of infrastructural excellence" and "trace jank, don't assume the biggest
visible cost is it" — both of which counsel *against* threading an Effect
runtime scheduler through a hundred-packets-per-query loop that was just
hand-tuned for render-locality. The overhead is small per packet but the
boundary's entire recent history is "we paid to make this exact path tight."
Inserting a runtime there inverts that work. This is not a maturity concern;
a *stable* Effect runtime still schedules per-step.

**A subsystem-scoped island maximizes the bridge tax at the worst boundary.**
The verified call-graph makes `analysis-service` the *most-bridged* subsystem
in the frontend: ingress from `useReviewSession`, `App.vue` Follow-Me,
`useUserIORegistry`, the analysis tab, the qEUBO restart watcher; egress to
`ledger`, `stabilityTrajectoryStore`, `telemetry`,
`analysisPersistenceService`, `store.engine.*`; teardown from `closeBoard`,
`resetWorkspace`, HMR-dispose. An Effect island here `runFork`s at every
ingress and bridges back to plain refs/`Map`s at every egress — the Harbor
"`runPromise`/`runFork` at every bridge" tax, concentrated at the subsystem
with the *most* bridges and the *tightest* perf budget. The 2026-06-01 `IO<T>`
consult found this subsystem "cannot wear `Task<T>` honestly"; the same
boundary-density argument says it cannot wear an Effect island cheaply either.
A partial adoption does not contain the cost — it *concentrates* it at the
worst possible seam.

---

## Q5 — The option space, scored

**(1) Project-wide adoption.** *Rejected, hard.* The prior four consults
already establish the codebase is eager-ACL / single-author / well-typed /
fail-loud, with no `andThen` chains, no spent laziness, and a content-thin
error channel at ~32 of 36 boundaries. Adding `Fiber`/`Scope`/`Layer`
project-wide pays the maximal paradigm + bridge + runtime cost for a benefit
that is real only at the one subsystem this consult examined — and *even there*
is over-built (Q1-Q4). Project-wide is the strawman the whole arc dismantled.

**(2) Adoption scoped to the analysis/streaming/resource subsystem.**
*Rejected — and this is the consult's load-bearing rejection.* This is the
best-fit scope, the one the prior consults named and deferred to. Examined
concretely: the subsystem wants a multiplexing `Subject` (has it, Q1), an
entity-keyed ownership model (has it, and `Scope`'s lexical model is *worse*,
Q2), and idempotent interruption (has it via `settle()`, Q3) — while Effect
would add a runtime at the measured-hot path (Q4) and a two-paradigm seam at
the most-bridged boundary (Q4). The hand-rolled code is not fragile in the
ways Effect fixes; it is solid, legible, and structured around the *right*
axes. Scoped adoption converts a working, audited, perf-tuned subsystem into a
bespoke Effect↔Vue bridge for marginal forward-safety the codified resource-
ownership discipline already provides.

**(3) Not at all.** *Recommended.* Keep the per-entity ownership maps, the
`settle()` interruption primitive, the `closeBoard`/`resetWorkspace`
finalizers, and the resource-ownership audit's forward-authoring discipline.
They are the project's `Subject` + `Scope` + `Fiber`, expressed in the
codebase's own vocabulary, composing with the rest of the system, and proven
by a closed 25-pair audit. This is the floor and the recommendation.

### The decision rule, stated once

> Effect's heavyweight machinery earns its weight when a *computation* (not a
> long-lived entity) owns a resource across a *lexically-scoped extent* (not
> a user-driven entity lifecycle), or when the concurrency topology is *N-way
> with non-trivial join/race* (not a fixed two-way `Promise.all`), or when the
> stream is *single-consumer back-pressured* (not multi-sink push fan-out).
> The analysis subsystem is none of these. Until one becomes true, the
> hand-rolled primitives are the right-sized tools.

---

## Q6 — What concrete future trigger would flip the verdict toward scoped Effect?

Named so a future session recognizes the moment. Each is a *shape change*,
not a goal restatement — the prior consults' "documentation appetite" triggers
do not flip *this* verdict, because this verdict is about machinery fit, not
documentation.

1. **A single-consumer, back-pressured analysis pipeline (flips Q1).** The
   first time the packet path becomes "one source → compose transformations →
   one sink that can fall behind" — most plausibly a worker-thread offload of
   the aggregate/stability computation where the worker *can* lag and genuine
   demand back-pressure is wanted. At that point `Stream`'s scoped, back-
   pressured, composable model beats the hand-rolled fan-out. The current
   five-sink synchronous fan-out is not this.

2. **N-way concurrent sub-query orchestration with non-trivial join/race
   (flips Q3).** The first time a single user action forks *many* analysis
   sub-queries with a join/race/interrupt-the-losers topology — e.g. an
   adaptive policy that fans out K speculative deepenings, races them, and
   must interrupt the losers with guaranteed cleanup. `Promise.all` + one
   `AbortController` is right-sized for the fixed two-way s_0/s_1 join; it
   would *not* be right-sized for a dynamic K-way race with per-fiber
   finalizers. (The "moves vs turns are co-equal axes" and "adaptive packets
   forward a fresh delta every time" memory entries suggest the analysis
   pipeline is an area of active design — if it grows a K-way fork, revisit.)

3. **A second author / team scale-up where forward resource-ownership safety
   must be compiler-enforced (partially flips Q2).** If the codebase stops
   being single-author and the resource-ownership discipline's review-time
   enforcement becomes a felt gap (a real leak ships because a contributor
   added a `Map` without the `closeBoard` cleanup), the case for type-level
   `Scope` strengthens — but even then, weigh it against extracting a *generic
   non-Effect* `ScopedResource<K>` helper that wires "register on acquire,
   release at the keyed mutation site" with a typed obligation, capturing the
   forward-safety without the runtime. Effect is one way to get compiler-
   enforced finalizers; a 30-line branded `OwnedResourceMap<K, R>` with a
   mandatory release callback is another, and it composes with the existing
   `Map`-based shape.

4. **A genuine Effect↔Vue bridge becomes a trodden community path.** If a
   canonical, maintained Effect-in-Vue integration emerges (the absence of
   which is currently a real cost), the bespoke-bridge objection weakens and
   the scoped-adoption math improves at the margin. This is the one
   maturity-adjacent trigger, named for completeness; it lowers cost, it does
   not change the machinery-fit verdict.

Until one of these is concrete, Effect is reserve, and the hand-rolled
primitives are the inventory.

---

## Synthesis — least-regret recommendation

**Not at all (option 3).** The four prior consults declined the *lighter*
tools (Effect-as-documentation, bare `IO<T>`, full `neverthrow`) and could be
read as "those were over-built for the documentation goal." This fifth consult
removes that escape hatch: it grants Effect its *home-field* machinery
(`Fiber`/`Scope`/`Stream`), grants a *stable* version surface, and aims both
at the *one* subsystem in the frontend that is genuinely concurrent, streaming,
and resource-bearing — and still finds the hand-rolled implementation correct,
legible, and structured around the *right ownership axis*, while Effect would:

- model the **wrong half** of `analysis-service` (`Stream` captures the wire
  arrival, not the multi-sink push fan-out that holds the actual complexity —
  Q1);
- own resources on the **wrong axis** (`Scope`'s lexical/dynamic-extent region
  vs. the codebase's entity-keyed, multi-event, user-driven lifetimes — and
  the entity-keyed `Map` is *more* expressive, handling deliberate-non-release-
  with-a-trigger that `Scope` cannot — Q2);
- duplicate an interruption guarantee **already delivered** by
  `AbortController` + idempotent `settle()` over a fixed two-way race (Q3);
- insert a **runtime at a freshly-perf-tuned hot path** the green arc just
  hardened (Q4);
- and concentrate the **bridge tax at the most-bridged boundary** in the
  frontend via any partial adoption (Q4).

The throughline of the entire five-consult arc, now complete: this codebase
keeps inventing, by hand and in its own vocabulary, the *exact abstractions*
each candidate library sells — the discriminated-union result type ADR-0002
blesses, the per-entity ownership `Map` that is a domain-keyed `Scope`, the
idempotent `settle()` that is a `Fiber` finalizer, the multiplexing
`subscribe` that is a `Subject`. In every case the hand-rolled version is
*better-fit* than the library, because it is keyed to the codebase's actual
ownership axes (entities, not computations; domain events, not lexical
extents; fixed small joins, not N-way topologies) and composes with the rest
of the system instead of introducing a paradigm seam. The resource-ownership
audit is the proof that this is not luck: the project *walked the whole tree*,
found 25 pairs, closed them, and codified the forward discipline. Effect would
re-encode that discipline at the type level — but the marginal safety of a
type-check over a *completed, codified, single-authored* audit is small, and
the cost (a runtime at the hot path, a bespoke Vue bridge, a two-paradigm
seam) is large.

The first effect-typing win in this whole exploration is therefore **still
not here** — not even at the best-fit subsystem, not even with maturity
bracketed. The hand-rolled streaming/lifetime cluster is the codebase
operating at its best, not its most fragile. Decline at all three scopes;
hold `Stream`/`Scope`/`Fiber` in reserve for the three shape-change triggers
in Q6 (single-consumer back-pressured pipeline / N-way join-race / multi-
author compiler-enforced ownership), any of which would make the machinery
the point rather than the tax.

---

## Verification status of every load-bearing claim

**Verified by direct repository read (working tree, 2026-06-01):**
- `analysis-service.ts`: analyze methods sync, return `string | null`,
  fan out via `client.subscribe` callback (438, 632-636, 660, 822-826,
  657, 844); four coordinated bookkeeping `Map`s + per-board index
  (66, 99, 105, 113); `stopQuery` idempotent per-query finalizer (1070-1099);
  `stopBoardAnalysis`/`stopAllBoardAnalyses` snapshot-iterate (1101-1133);
  `onDisconnect` deliberately keeps closure maps, clears telemetry, with
  documented rationale (131-185); `onAnalysisUpdate` multi-sink hot path with
  DEV `performance.measure` anchors (910-1000, `rb3:handler` 940/973).
- `katago-client.ts`: `subscribe` returns unsubscriber over a per-id
  `Set` (110-128); `sendCommand` is subscribe-then-unsub-on-first-response
  (131-138); `handleIncomingMessage` routes by id and fans out (89-108).
- `wait-for-analysis.ts`: three-channel race (header 7-12); idempotent
  `settle()` clearing timer/watcher/listener on every path (109-116);
  `AnalysisWaitError` two-arm union (47-55).
- `useReviewSession.ts`: module-scope `pendingAnalysisAborts: Map<BoardId,
  AbortController>` (79) with failure-mode block comment (50-78);
  `abortBoardReview`/`abortAllReviews` reach-in affordances (88, 102); three
  terminal branches each release query + abort entry with overwrite guards
  (423-426, 428-460, 462-477).
- `store/index.ts`: `closeBoard` nine enumerated cleanups + load-bearing
  ordering paragraph (290-353, body 367-434); `resetWorkspace` identity-flip
  finalizer with privacy reasoning + deliberate WS non-release + trigger
  (451-575).
- `resource-ownership-audit-plan.md`: all three passes closed 2026-05-04;
  ~25 owner-resource pairs across 6 mutation sites; forward-authoring
  discipline codified (§196-348); threshold section carves out Vue automatics
  / closure-GC'd / type-checked (314-335).

**Asserted from reasoning (flagged):**
- The `Stream`-models-wire-arrival-but-not-fan-out, `Scope`-owns-the-wrong-
  axis (lexical vs entity-keyed), and `Fiber`-duplicates-`settle()` framings
  are analytic judgments grounded in the verified surface, not citations.
- The Effect runtime per-step scheduling overhead being non-zero-but-small is
  general Effect-execution-model knowledge; the *regression-risk* weighting at
  the `rb3`-instrumented hot path is an analytic application of the project's
  own perf discipline (memory: "performance is a consequence of
  infrastructural excellence").
- The "most-bridged subsystem" claim is reasoned from the verified call-graph
  (ingress/egress/teardown enumerations above), not from a dependency-graph
  tool run.
- The bespoke-Effect↔Vue-bridge cost and the absence of a trodden integration
  path are inherited from the 2026-05-29 consult's verified-by-absence
  finding; not re-searched here (maturity bracketed per the brief).
- The "30-line non-Effect `OwnedResourceMap<K,R>`" alternative for forward
  compiler-enforced ownership (Q6 trigger 3) is a design sketch, not an
  existing artifact.

---

## Appendix — verbatim prompt

The exact brief given to this firewall agent (Opus 4.8, independent),
repo-relative paths preserved. License: Public Domain (The Unlicense).

````text
You are an independent "analytic firewall" — the FINAL opinion in a four-consult exploration for the maintainer of a Vue 3 + TypeScript SPA (LengYue, a Go spaced-repetition study tool) at `frontend/`. Reason independently and adversarially; NO stake. Calibrate to a Haskell / formal-methods maintainer — `Fiber`, `Scope`, `Stream`, algebraic effects, structured concurrency are assumed familiar; argue at that level.

## The question, and its two explicit brackets

Re-evaluate adopting **Effect-TS** (the `effect` library) for this frontend — "what would it buy, is it worth it" — but under two instructions that distinguish this consult from the prior generic one:

- (a) Do NOT defer to the prior generic Effect-TS consult's conclusion. `docs/notes/consult/opus-consult-2026-05-29-effect-ts-adoption.md` declined full Effect for the maintainer's then-stated goals (effect-typing as *documentation* + a purity audit) and found it disproportionate *for those goals*. Read it for continuity, but re-frame on Effect's ACTUAL architectural strengths — structured concurrency (`Fiber`, fork/join, interruption with guaranteed finalizers), resource scope (`Scope`/`acquireRelease`), `Stream`, and `Layer`/DI — against the frontend's ACTUAL shapes, NOT against the documentation goal.
- (b) BRACKET the maturity / churn / "moving surface" objection entirely. The prior consult leaned heavily on "Effect v4 is beta, the ecosystem is mid-transition, you'd be boarding a moving train." Set that aside. Assess the ARCHITECTURAL fit as if the version surface were stable. Note the maturity caveat exactly ONCE and move on — the maintainer will weigh maturity separately and does not want it to dominate this verdict.

## Essential continuity (read; they're on disk)

The lighter options were already explored and found over-built — the throughline matters:
- `docs/notes/consult/opus-consult-2026-05-29-effect-ts-adoption.md` — full Effect declined for documentation goals; but it NAMED structured-concurrency/resource-scope (proxy fan-out, the resource-ownership discipline) as Effect's *real* earn-its-weight case — and did NOT deeply evaluate it. That is your job.
- `docs/notes/consult/opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md` — a bare deferred `IO<T>` was built and reverted as over-built for an eager ACL (laziness never spent).
- `docs/notes/consult/opus-consult-2026-06-01-neverthrow-overhaul.md` — typed-error `Result` overhaul declined; the codebase already hand-rolls the discriminated-union result shape ADR-0002 blesses; the error channel is content-bearing at only ≤4 of ~36 boundaries.
- `docs/notes/decisions-deferred.md` — the "Effect-typing as documentation" decision entry.

The lesson so far: the codebase is already well-typed and fail-loud, and its eager-ACL / single-author shape made the lighter tools over-built. The open question this consult settles: is there a SUBSYSTEM where Effect's *heavyweight* machinery (Fiber/Scope/Stream) genuinely earns its weight — or is even that over-built?

## The crux — READ THE ACTUAL CODE, don't assert (this is where prior consults stopped short)

The candidate is the analysis/streaming/resource-lifetime cluster. Examine it concretely and judge whether the hand-rolled implementation is *fragile in ways Effect's Fiber/Scope/Stream would fix*, or *solid and fine*:

- `src/services/analysis-service.ts` (~1160 lines) — the WebSocket/streaming client. `analyzeRange`/`analyzeActiveNode` are *synchronous*, return a query-id string, and stream results via callbacks into the ledger. Read how it manages: concurrent in-flight queries, range-query fan-out, the adaptive-reevaluate streaming (preview→authoritative promotion), cancellation (`stopBoardAnalysis`/`stopAllBoardAnalyses`), per-board and per-query lifetime, the watchdog/keep-alive. Is this a hand-rolled `Stream` + `Fiber` + `Scope` that Effect would model more safely (guaranteed finalizers, structured interruption) — or is it already correct and legible, with Effect adding a paradigm tax + a Vue-bridge tax for marginal safety?
- `src/store/index.ts` — `closeBoard` / `resetWorkspace` (the resource-ownership-at-mutation-sites discipline) and `src/services/analysis-persistence-service.ts` cleanup paths. Effect's `Scope`/`acquireRelease` is the type-level enforcement of exactly this discipline. Read the worked examples and `docs/archive/notes/resource-ownership-audit-plan.md`. Does the hand-rolled discipline have a real failure-mode history (audit found leaks?) that `Scope` would prevent, or is it disciplined-and-working?
- `src/composables/review/useReviewSession.ts` — the abort-and-resume / timeout state machine (`pendingAnalysisAborts`, the abort choreography). Fiber-interruption territory.
- The umbrella `CLAUDE.md` proxy section — the proxy's range-query fan-out, adaptive-reevaluate streaming, cancellation, heartbeat/keep-alive contracts the frontend consumes.
- Context that raises the cost bar: ADR-0010 / the just-completed "green" render-perf arc hardened `analysis-service`'s hot path. Effect's runtime overhead at a freshly-perf-tuned streaming boundary is a real concern — weigh it.

## Adversarial counterweights to hold against any "yes"

- The Effect↔Vue bridge: every `Effect`/`Fiber` must be `runFork`'d and interrupted in `onScopeDispose`/`onUnmounted` — no trodden Vue-SPA Effect path exists (the prior consult found none); the integration is bespoke.
- The IO/neverthrow lesson: the codebase's existing discipline (ADR-0002, branded types, the resource-ownership convention, the hand-rolled unions) already covers a lot. Effect must beat *that*, not a strawman.
- Paradigm cost in a single-author codebase; the `runFork`/`Scope` machinery only pays where computations stay long inside the monad.
- Even if analysis-service is Stream-shaped: is a *partial* adoption (Effect for that subsystem, plain TS elsewhere) coherent, or does it create a two-paradigm seam worse than either pure choice?

## Deliverable

A least-regret verdict on Effect-TS for THIS frontend, on architectural merit with maturity bracketed, scored across: (1) project-wide adoption, (2) adoption scoped to the analysis/streaming/resource subsystem only, (3) not at all. Anchor every claim about the candidate subsystem in what you actually read in `analysis-service.ts` / the resource-ownership code — quote line references. Be willing to conclude "even at its best-fit subsystem and even granting a stable version surface, Effect is over-built because the hand-rolled code is already correct and legible" OR "the analysis-service streaming/lifetime cluster genuinely wants `Stream`+`Scope`+`Fiber` and a scoped adoption there is the first effect-typing win in this whole exploration." Don't hedge to be safe; pick the least-regret path and defend it. Surface the maturity caveat once, separately, so the maintainer can weigh it on its own.

Then WRITE your verbatim assessment to `docs/notes/consult/opus-consult-2026-06-01-effect-ts-architectural-merits.md` — self-contained, markdown with headers, verified-vs-asserted marked, with an "Appendix — verbatim prompt" section (this prompt, repo-relative paths) and a `License: Public Domain (The Unlicense)` line; match the structure/tone of the prior consult records. Return a short bottom-line summary to me.
````
