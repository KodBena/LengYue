# Opus Consult — `IO<T>` / `Task<T>` Deferral at an Eager ACL (analytic firewall, 2026-06-01)

Analytic-firewall third opinion (Opus 4.8, independent agent with web
access), requested by the maintainer as a **follow-up** to the Effect-TS
adoption consult (`opus-consult-2026-05-29-effect-ts-adoption.md`). That
consult declined full Effect-TS for the stated goals (documentation +
purity audit) and recommended a lighter stack — `neverthrow` (or "a thin
branded `IO<T>`") for typed-error/effect documentation at the ACL, plus
`eslint-plugin-functional` for purity. The maintainer **deferred
`neverthrow`** and chose the bare `IO<T>` path. That path is now **built
and applied to exactly one service** (`backend-service.ts`, the canonical
ACL) as a worked example. The question this consult answers: **propagate,
stop, change shape, or revert?**

The maintainer and his AI collaborator both lean toward one answer and
explicitly want a disinterested check before acting, because acting means
tearing out work just completed. This record reasons independently and
adversarially; it has no stake in the conclusion.

Saved verbatim for auditability per the consult-record convention. License:
Public Domain (The Unlicense).

---

# Analytic Firewall — Third Opinion: "Is a contentless effect-token worth any cost at an eager ACL — propagate, stop, reshape, or revert?"

**Consult date:** 2026-06-01
**Reviewer stance:** Independent. Adversarial where warranted. No stake in propagating, stopping, reshaping, or reverting.
**Calibration:** Maintainer has a Haskell / formal-methods background; IO monad, algebraic effects, row-typed effects are assumed familiar. The argument is pitched at "what does a *contentless* effect token buy over `Promise<T>`," not "what is a deferred effect."

---

## Bottom line up front

**Revert the `IO<T>` / `Task<T>` arc (option d). It is over-built for an
eager ACL: the laziness it is structured around is never exploited, so
`runTask` is pure ceremony, and the only thing `Task<T>` carries over
`Promise<T>` is a type-level token that `Promise<T>` already connotes at a
service boundary. Hold effect-typing in reserve until a *concrete*
information-bearing trigger appears — most plausibly a typed-error channel
(`Result<T, E>` / `neverthrow`, the thing the prior consult actually
recommended and the maintainer deferred), or a genuine
laziness/concurrency/resource need at the proxy fan-out. Apply the prior
consult's own "hold in reserve" logic one level down: even *bare* `IO` is
over-powered for an ACL that does one fetch and hands a value to a
composable.**

The sharp version, in five claims:

1. **The deferral is structurally inert here.** *(verified — all 16 call
   sites)* Every consumer is `await runTask(backendService.m(args))`: the
   `Task` is constructed and immediately run on the same line. Nothing
   stores a `Task`, passes it unrun, retries it, races it, or sequences two
   of them inside the monad. The laziness `io.ts` is built around — and
   whose hazard its own header warns about ("a Task created but never run
   is a no-op") — is a liability with no offsetting asset. You have paid for
   deferral and spent none of it.

2. **The token is contentless.** `Task<T>` over `Promise<T>` adds the
   phantom brand `{ readonly [IO_EFFECT]: 'io' }` and nothing else. There is
   no typed-error `E` channel, no requirements `R` channel, no resource
   `Scope`. It is the thinnest possible slice of effect-as-documentation:
   the bit "this is effectful." And a `public m(args): Promise<X>` on a
   *service singleton in `src/services/`* — the layer the architecture
   defines as "effectful singletons" — already connotes exactly that bit.
   The token re-states, in a phantom brand plus a `runTask` call, a fact the
   return type and the layer already establish.

3. **Deferred-vs-eager is the wrong axis, and it is the axis the artifact is
   built on.** A `Task<T> = IO<Promise<T>>` is a *thunk returning a
   promise*. Its entire reason to exist over `Promise<T>` is that
   construction does not start the effect. In an eager ACL the effect should
   start when called — that *is* the semantics the consumers want, and it is
   what `Promise<T>` already gives. So the chosen vocabulary optimises a
   property (laziness) the call sites actively do not want, and pays
   ceremony (`runTask`) to undo it at every site.

4. **The consistency concern is real and points at revert, not propagate.**
   *(verified — service-layer inventory)* The discipline currently lands on
   **one of at least five** effectful services. Propagating to make it even
   is expensive *and*, for the perf-sensitive streaming service, **does not
   fit the shape at all** (claim 5). Reverting to make it even is one file
   plus 16 mechanical call-site edits. When a discipline can be made
   consistent by *removing* it for the cost of one file, or by *spreading*
   it at the cost of ~35 sites + 2 fakes + a shape that doesn't fit one of
   the targets, the asymmetry is the answer.

5. **`analysis-service` cannot wear `Task<T>` honestly — it is a stream, not
   a Task.** *(verified — its public surface)* Its hot methods
   (`analyzeRange`, `analyzeActiveNode`, `analyzeFullGame`) are
   **synchronous**, return a `string | null` query-id, and deliver results
   **asynchronously via callbacks into the ledger** over many packets. That
   is a subscription/stream, not a single deferred async value. `Task<T>`
   (one deferred promise of one `T`) is the wrong algebra for it. Wrapping it
   would either be a lie (a `Task` that resolves once for a multi-packet
   stream) or force a second, different abstraction — at the exact seam the
   green render-perf arc just hardened, for zero information gain.

The recommendation, stated plainly: **revert `src/lib/io.ts`, the
`backend-service.ts` conversion, the two test touchpoints
(`tests/fakes/backend-service.ts`, `tests/unit/lib/io.test.ts`), and the 16
`runTask` call sites.** If the documentation appetite is live *now*, spend
the same energy on the **information-bearing** thing the prior consult
named: a typed-error `Result<T, E>` channel (option e), which carries
something `Promise<T>` cannot. Detail and adversarial substantiation follow.

---

## What was verified in the repository

All claims in this section are **verified** by direct read of the working
tree at `/home/bork/w/omega/frontend/` on 2026-06-01.

### The vocabulary as built (`src/lib/io.ts`)

```ts
export type IO<T> = (() => T) & { readonly [IO_EFFECT]: 'io' };
export type Task<T> = IO<Promise<T>>;
export const io   = <T>(thunk: () => T):          IO<T>   => thunk as IO<T>;
export const task = <T>(thunk: () => Promise<T>): Task<T> => thunk as Task<T>;
export const runIO   = <T>(effect: IO<T>):   T          => effect();
export const runTask = <T>(effect: Task<T>): Promise<T> => effect();
```

A `Task<T>` is a phantom-branded thunk that returns a `Promise<T>`. `task`
is a single `as` cast (the sanctioned brand site); `runTask` is a single
thunk invocation. There is no error channel, no requirements channel, no
scope, no memoisation (the unit test asserts an effect re-performs each run),
no combinator surface (`map`, `flatMap`, `zip`, `race`) — the type is the
constructor and the runner, nothing else. The header is honest about this:
it names itself "the lighter-stack alternative to full Effect-TS" and warns
of the deferred-effect hazard ("a Task created but never run is a no-op …
Run every Task you build").

### The conversion (`src/services/backend-service.ts`)

Ten public methods now return `Task<X>` instead of `Promise<X>`, each via
the same shape:

```ts
public submitReview(cardId: CardId, scores: number[]): Task<ReviewCard> {
  return task(async () => {
    const rawCard = await api.request<CardFromWire>('POST', `/cards/${cardId}/review`, { scores });
    return this.mapToReviewCard(rawCard);
  });
}
```

The body is unchanged from a plain `async` method except for the `task(async
() => …)` wrapper. `fetchEbisuSession` is a pure delegator (it returns
`this.queryForest(...)` directly — no extra `task` wrap, correct).

### The consumption (all 16 `runTask` call sites — the crux)

*(verified — `grep -rn "runTask\|runIO"`):* Every production and test call
site is the identical shape:

```ts
const tags    = await runTask(backendService.getTags());
await            runTask(backendService.submitReview(currentCard.value!.id, userMoveScores.value));
const tree    = await runTask(backendService.fetchTreeByRoot(rootCardId));
roots.value   = await runTask(backendService.getForestStats());
```

Even the two `Promise.all`-style fan-outs construct-and-run inline
(`runTask(backendService.fetchTreeByRoot(rcid))` inside a `.map`). **Not one
site stores a `Task` for later, passes an unrun `Task` across a boundary,
retries one, races two, or composes two effects before running.** Construct
→ run is always adjacent. This is the empirical heart of the matter: the
deferral is created and immediately discharged everywhere. *(verified
exhaustively across the 11 production sites in
`useAppBootstrap.ts`, `useMinting.ts`, `useCardTreeData.ts` (×6),
`useReviewSession.ts`, `ForestDirectory.vue` (×3), `ReviewSessionPanel.vue`,
and the 5 test sites.)*

### The consistency landscape (service-layer inventory)

*(verified — `grep -rn "public.*Promise<\|public async" src/services/`):*
Effectful service singletons that speak plain `Promise<T>` today:

- `library-service.ts` — 5 async methods (`listGames`, `getGame`,
  `deleteGame`, `listPlayers`, `importGames`).
- `analysis-persistence-service.ts` — 4 (`save`, `restore`, `discard`,
  `refreshSummaries`).
- `qeubo-service.ts` — 7 (`createExperiment`, `deleteExperiment`,
  `getStatus`, `getPair`, `submitPreference`, `getBest`, `getHistory`).
- `api-client.ts` — auth surface (`request`, `login`, `register`, `getMe`,
  `ensureAuthenticated`).
- `analysis-service.ts` — only `clearCache()` is `Promise<void>`; the rest
  of the surface is synchronous + callback (below).

So `Task<T>` lands on **1 of ~5** effectful services. The prompt's framing
of "four effectful services" undercounts; with `qeubo` and `api-client` the
inconsistency surface is wider than concern 2 states. That widens the gap
propagation must close.

### `analysis-service` is a stream, not a Task (the decisive shape fact)

*(verified — public surface of `analysis-service.ts`):*

| method | return | nature |
|---|---|---|
| `connect()` / `disconnect()` | (sync) | lifecycle |
| `analyzeFullGame` / `analyzeRange` / `analyzeActiveNode` | `string \| null` | **sync** — returns a query-id; results stream async via callbacks into `analysis-ledger` |
| `isPondering` | `boolean` | sync query |
| `stopQuery` / `stopBoardAnalysis` / `stopAllBoardAnalyses` / `stopPonderOnBoard` / `restartActiveAnalyses` | `void` | sync command |
| `clearCache` | `Promise<void>` | the **only** request/response method |

This is a publish/subscribe boundary: fire a query (synchronously), receive
a stream of packets over the WebSocket asynchronously. `Task<T>` models a
*single* deferred async value. It is the wrong algebra for a multi-packet
stream — the honest effect type for `analyzeRange` would be a
`Stream`/`Observable`, not a `Task`. This is verified, not asserted, and it
is the strongest single argument against propagation.

---

## Q1 — Is a contentless effect-token worth any cost at an eager ACL?

**No.** *(analytic judgment, grounded in the verified facts above.)*

Decompose what `Task<T>` could buy and check each against the artifact:

- **"This is effectful" documentation.** Already carried by (i) the method
  living in `src/services/` — the layer `frontend/CLAUDE.md` *defines* as
  "effectful singletons" — and (ii) the `Promise<T>` return, which at a
  service boundary universally connotes I/O. The token re-states a fact two
  existing signals already establish. The marginal documentation is near
  zero. Contrast a *typed error channel*: `Result<ReviewCard, ReviewError>`
  says something `Promise<ReviewCard>` genuinely cannot — *which* failures,
  exhaustively, in the signature. That is information; the effect-token is
  not.

- **A greppable effect-execution boundary.** The header sells `runTask` as
  "so every place an effect is actually performed is greppable." But at an
  eager ACL the performance site is *already* greppable — it is
  `await backendService.m(`. You have not made effects greppable; you have
  renamed `await x()` to `await runTask(x())` and called the rename a
  feature. And the grep is *less* informative than it appears: it finds
  where `backend-service` effects run, but not where `library`/`analysis`/
  `qeubo`/`persistence` effects run, because those were not converted. A
  partial greppability is a misleading greppability.

- **Purity audit.** The prior consult already established *(verified there)*
  that an effect-token does not *find* impure-mixed functions; it only keeps
  the ones you already converted honest. `Task<T>` inherits that limitation
  and adds nothing — it audits nothing the `Promise` return did not.

Against zero marginal information, the costs are non-zero:

- **Ceremony at every call site** (`runTask(...)`), 16× today, ~35× if
  propagated. Each is a wrapper a reader must see through to find the actual
  call.
- **A new silent-failure class** the header itself names: a `Task` built and
  never run is a no-op effect — the deferred analogue of a floating Promise,
  but *worse*, because a floating Promise at least runs (it just isn't
  awaited), whereas an unrun `Task` **never performs the effect at all**.
  For a codebase whose primary ethos is ADR-0002 fail-loudly, introducing a
  *silent* "the network call never happened" failure mode to document a fact
  the layer already documents is a poor trade. Today every site runs its
  Task, so the hazard is latent — but it is a hazard the plain-`Promise`
  shape does not have, manufactured for a contentless token.
- **Conceptual surface**: a second async vocabulary (`Task` *and* `Promise`)
  that every contributor must hold, with a rule ("run every Task") that has
  no compiler enforcement.

A contentless token whose only content the boundary already implies, bought
with ceremony and a new silent-failure class, is a net negative. The answer
to the prompt's framed question — "is that token worth any cost, given
`Promise<T>` already connotes effectful?" — is **no**.

## Q2 — Does deferred-vs-eager even matter when laziness is unused?

**No — and that it is unused is the whole case.** *(verified — call sites.)*

Laziness earns its weight when a description is *manipulated before it
runs*: retried, raced, timed-out, sequenced with others into a larger
effect that runs once, passed to a scheduler, made referentially
transparent for testing. None of that happens here — construct-and-run is
adjacent at all 16 sites. The deferral is a property the code creates and
then immediately destroys.

There is a tell worth naming for a formal-methods reader: a `Task<T> = () =>
Promise<T>` is *only* distinguishable from `Promise<T>` by referential
transparency under repetition — running it twice does the effect twice (the
unit test asserts exactly this), whereas awaiting one `Promise` twice does
the effect once. That distinction is meaningful *iff* something runs a
`Task` more than once or chooses *whether* to run it. Nothing does. So the
one semantic difference the type encodes is dead code. When the
distinguishing semantics is unobservable, the abstraction collapses to its
eager counterpart plus ceremony — which is what option (c) below tries to
formalise, and fails.

## Q3 — The consistency concern (concern 2)

The concern is correct and, weighed honestly, argues for **revert, not
propagate.**

Uneven application of a typing discipline is a smell *(agreed)*. But "make
it even" has two directions, and their costs are wildly asymmetric:

- **Even by propagation:** convert `library` (5), `persistence` (4),
  `qeubo` (7), `api-client` (auth), and somehow `analysis` (which doesn't
  fit, Q4) → ~35+ call sites, +2 more fakes, `runTask` everywhere, and a
  bespoke stream abstraction for `analysis`. All to spread a contentless
  token.
- **Even by revert:** delete `io.ts`, unwrap 10 methods in one file, drop
  `runTask` at 16 sites (mechanical: `await runTask(x())` → `await x()`),
  revert 2 test touchpoints. One file of real change; the rest is
  search-replace.

A discipline that can be made consistent by *deletion* for a fraction of the
cost of *spreading* it — and whose spread doesn't even fit one of its
targets — is a discipline that has not earned its place. The consistency
smell is real; the cheapest cure that also removes the other problems is
revert.

## Q4 — The `analysis-service` indirection concern (concern 1)

This concern is **more serious than "runtime-cheap, conceptual overhead."**
*(verified — Q-block above.)* The issue is not indirection cost at a hot
seam (the thunk is genuinely runtime-cheap; one extra closure alloc and call
per query is noise next to a WebSocket round-trip). The issue is **shape
mismatch**: `analysis-service` is a stream/subscription boundary, and
`Task<T>` is a single-value algebra. There are only bad options:

1. Wrap `analyzeRange` (sync, returns query-id, streams packets) in a
   `Task` — a category error; the `Task` would resolve once for a stream of
   many.
2. Introduce a *second* effect type (`Stream`/`Observable`) for the
   streaming methods — now the codebase has `Promise`, `Task`, *and*
   `Stream`, three async vocabularies, the heaviest possible conceptual
   load, at the seam the green arc just hardened.
3. Leave `analysis-service` on plain sync+callback and accept that the "all
   effectful services speak `Task`" consistency story is unattainable —
   which concedes that propagation *cannot* deliver the consistency it was
   the argument for.

Every branch is worse than reverting `backend-service` to match
`analysis-service`'s honest plainness. The perf-tuned streaming seam is
precisely where you least want a contentless wrapper or a forced second
abstraction. Concern 1, examined, reinforces the revert.

## Q5 — The option space, scored

**(a) Propagate `Task<T>` to all effectful services.** *Rejected.*
Maximises ceremony (~35 sites) for the contentless token, doesn't fit
`analysis` (Q4), and still wouldn't achieve true consistency because the
stream service resists the algebra. Pays the most to gain the least.

**(b) Stop at `backend-service`.** *Rejected.* Leaves the discipline applied
to 1 of ~5 services — the inconsistency concern 2 names, plus a *misleading*
greppability (Q1). The worked-example justification ("show the pattern")
only holds if the pattern is going somewhere; if the conclusion is "don't
propagate," the example is a permanent one-off wart, not a seed.

**(c) Eager branded marker — `Task<T> = Promise<T> & brand`.** *Rejected,
and more leaky than the prompt fears — verified.* The appeal is no
`runTask` ceremony (`await backendService.m()` unchanged) while keeping the
token. But:
  - **The brand is stripped by the monad.** `.then`, `await`, and
    `Promise.all` all unwrap to the underlying `T` / `Promise<T>`; an
    intersection brand on a `Promise` does not survive composition. So every
    ACL method needs an `as` cast to re-apply the brand on return (each
    needing an ADR-0002 justification comment), and the brand evaporates the
    moment a consumer touches it. The "documentation" is erased at first
    use.
  - **Worse: TypeScript mishandles `await` on a branded Promise.**
    *(verified — microsoft/TypeScript#48927)* For an intersection
    `Promise<T> & X`, `await` produces the **wrong** awaited type (it can
    leave the result still wrapped), even though `Awaited<…>` and `.then`
    handle it correctly — the `await` keyword specifically is buggy here.
    *(verified — TS#55612, #46934: known `.then`/`Awaited` unwrap
    inconsistencies for custom/intersection Promise types.)* So option (c)
    doesn't merely fail to document — it can actively *break inference at
    every `await` site*, the opposite of type sanity. A branding scheme that
    fights `await` is disqualified for this codebase.

**(d) Revert the `IO<T>` arc; hold effect-typing in reserve.**
**Recommended.** Removes ceremony, the silent-unrun-Task hazard, the
inconsistency, and the `analysis` shape problem in one mechanical change.
Applies the prior consult's own "hold in reserve" logic one level down: that
consult held *full Effect* in reserve for a concurrency/resource trigger;
this one holds *even bare `IO`* in reserve until the eager ACL stops being
eager or the token stops being contentless. Nothing of value is lost,
because nothing of value was being delivered.

**(e) Pursue the information-bearing thing — typed errors (`Result<T,E>`).**
**Recommended as the constructive sibling to (d), iff the documentation
appetite is live now.** This is the option that actually carries
information `Promise<T>` cannot: the *typed, exhaustive error set* in the
signature. It is also what the prior consult literally recommended and the
maintainer deferred. `backend-service` already has the raw material — it
constructs `CardTreeOverflowError` and re-throws on 422, threads a generic
`Error` on 404. A `Result<CardLineageTree, CardTreeOverflowError | NotFound>`
on `fetchTreeByRoot` would document those failures in the type instead of in
a doc-comment, and compose with the branded-ID discipline. *(verified —
`neverthrow` is at v8.2.0, ~1yr stable cadence, `ResultAsync` wraps
`Promise<Result<T,E>>` and is thenable; the deliberately-slow cadence the
prior consult praised holds.)* This is strictly more valuable than the
effect-token for comparable effort, because the error channel is the part of
the effect row that is *missing*, whereas "is effectful" is the part that is
*already implied*.

**(d) is the floor; (e) is the optional constructive add.** They are not in
tension: revert the contentless token now; adopt the information-bearing
channel if and when the appetite justifies it. Do not adopt (e) *because*
you reverted (d) — adopt it only if typed-error documentation is genuinely
wanted, on its own merits.

## Q6 — What concrete future trigger would make effect-typing earn its weight?

Three, in ascending strength — name them so a future session recognises the
moment:

1. **A typed-error appetite (lowest bar, option e).** The first time a
   call site needs to *branch on which failure occurred* in a type-checked
   way (not `catch (e) { if (e instanceof X) }` stringly-typed unwrapping),
   `Result<T, E>` earns its weight. The `CardTreeOverflowError` 422 path is
   the existing seed.

2. **A genuine laziness/composition need (medium bar — where *bare* `IO`
   would finally pay).** The first time the code wants to *build an effect
   and run it elsewhere* — a retry wrapper, a "construct N requests and race
   them," a sequencing of effects that runs once, an effect passed unrun
   across a boundary for a scheduler/queue to discharge. The moment a `Task`
   is stored, passed, retried, or raced *without being immediately run*, the
   deferral stops being ceremony and becomes the point. None of the 16
   current sites is that; watch for the first one that is.

3. **Concurrency / resource scope at the proxy fan-out (highest bar — where
   *full* Effect would pay, per the prior consult).** The proxy's
   range-query fan-out + adaptive-reevaluate streaming + cancellation +
   subscription lifetime is the place structured concurrency and `Scope`/
   `acquireRelease` would formalise the hand-rolled
   resource-ownership-at-mutation-sites discipline. *(asserted — inherited
   from the prior consult's verified-by-inference framing; not
   re-benchmarked here.)* Notably this is **the same `analysis-service`**
   that resists `Task<T>` today: when it earns an effect type, that type is
   `Stream` + `Scope`, not `Task` — further confirmation that `Task<T>` is
   the wrong tool for the one place a richer effect type might eventually
   land.

Until one of these is concrete, effect-typing is reserve, not inventory.

---

## Synthesis — least-regret recommendation

**Revert (option d).** The `IO<T>` / `Task<T>` arc is a worked example of an
abstraction that documents a fact already implied (`Promise` at a service
boundary = effectful), built around a property never used (laziness at an
eager ACL), paid for with ceremony at every call site and a new
silent-unrun hazard at odds with ADR-0002, applied to 1 of ~5 services in a
way that cannot be made consistent because the most important effectful
service (`analysis-service`) is a stream the algebra does not fit. The
reversal is one file of real change plus mechanical `runTask`-stripping at
16 sites and 2 test touchpoints.

This is **not** "they under-valued a real win." The win the prior consult
identified was *documentation that carries information* — and the
information-bearing half of that recommendation (typed errors via
`neverthrow`/`Result`) is exactly the half that got deferred, while the
contentless half (the effect-token) is the half that got built. The arc
optimised the wrong axis (deferred-vs-eager) of the wrong half (effect-ness
vs. error-ness). Reverting loses nothing of value.

**If the documentation appetite is live now, redirect the same energy to
option (e):** a typed-error `Result<T, E>` channel at the ACL, starting with
the failure modes `backend-service` already constructs by hand
(`CardTreeOverflowError`, the 404/422 paths). That carries information
`Promise<T>` cannot, composes with the branded-ID discipline, and is the
recommendation the maintainer deferred rather than a new idea. Treat (e) as
optional and merit-gated, not as automatic compensation for the revert.

**Hold `IO`/effect-typing in reserve** for trigger 2 (the first `Task`
genuinely stored/raced/retried unrun) or trigger 3 (proxy
concurrency/resource scope — where the eventual effect type is `Stream` +
`Scope`, not `Task`). The prior consult held *full Effect* in reserve; this
one holds *bare `IO`* in reserve for the same reason one level down — an
eager ACL is not the place a deferred effect earns its keep.

The throughline: an effect token that says only "this is effectful," at a
boundary that already says "this is effectful," with laziness no one spends,
is ceremony wearing the costume of type sanity. The maintainer's actual
ethos — typing as *information-bearing* documentation — is served by the
error channel he deferred, not by the effect marker he built.

---

## Verification status of every load-bearing claim

**Verified by direct repository read (working tree, 2026-06-01):**
- `src/lib/io.ts` shape: `Task<T> = IO<Promise<T>> = (() => Promise<T>) &
  brand`; `task` = single `as` cast; `runTask` = single thunk call; no
  error/requirements/scope channel; no combinators; effect re-performs each
  run (asserted by `tests/unit/lib/io.test.ts`); header warns of the
  unrun-Task no-op hazard.
- All 16 `runTask` call sites are construct-and-run-adjacent
  (`await runTask(backendService.m(args))`); none stores, passes unrun,
  retries, or races a `Task`. Sites:
  `src/composables/auth-app/useAppBootstrap.ts:409`,
  `src/composables/review/useMinting.ts:166`,
  `src/composables/cards/useCardTreeData.ts:{251,278,352,428,438,485}`,
  `src/composables/review/useReviewSession.ts:568`,
  `src/components/tree/ForestDirectory.vue:{90,150,288}`,
  `src/components/ReviewSessionPanel.vue:140`, plus 5 test sites under
  `tests/e2e/` and `tests/fakes/`.
- `backend-service.ts` converts 10 public methods to `Task<X>`;
  `fetchEbisuSession` is a pure delegator (no extra wrap).
- Service-layer inventory: `library-service` (5 Promise methods),
  `analysis-persistence-service` (4), `qeubo-service` (7), `api-client`
  (auth surface) all speak plain `Promise`; `analysis-service` exposes only
  `clearCache()` as `Promise<void>`.
- `analysis-service` public surface is sync-fire + async-callback stream:
  `analyzeRange`/`analyzeActiveNode`/`analyzeFullGame` return `string |
  null` (a query-id), results stream as packets into `analysis-ledger`;
  `connect`/`disconnect`/`stop*`/`isPondering`/`restartActiveAnalyses` are
  sync.
- `backend-service` already constructs typed failures by hand
  (`CardTreeOverflowError` on 422, generic `Error` on 404) — the raw
  material for option (e).

**Verified by primary/credible web source:**
- Branding a `Promise` via intersection is mishandled by `await`
  specifically: `Promise<T> & X` yields the wrong awaited type under
  `await`, while `Awaited<…>` and `.then` are correct —
  [microsoft/TypeScript#48927](https://github.com/microsoft/TypeScript/issues/48927).
  Related `.then`/`Awaited` unwrap inconsistencies for custom/intersection
  Promise subtypes —
  [#55612](https://github.com/microsoft/TypeScript/issues/55612),
  [#46934](https://github.com/microsoft/TypeScript/issues/46934). This makes
  option (c) actively hazardous, not merely leaky.
- `neverthrow` is at **v8.2.0** (~1yr since publish — the deliberately-slow,
  stable cadence the prior consult praised); `ResultAsync` wraps
  `Promise<Result<T,E>>` and is thenable; widely used (~743 dependent
  projects) —
  [npm: neverthrow](https://www.npmjs.com/package/neverthrow),
  [supermacro/neverthrow](https://github.com/supermacro/neverthrow).

**Asserted from reasoning / inherited from the prior consult (flagged):**
- The "contentless token vs. information-bearing error channel"
  proportionality framing is an analytic judgment, not a citation.
- The proxy-fan-out/cancellation as the high-bar earn-its-weight case is
  inherited from `opus-consult-2026-05-29-effect-ts-adoption.md`'s
  verified-by-inference framing; not re-benchmarked here.
- The claim that `analysis-service`'s eventual honest effect type is
  `Stream` + `Scope` (not `Task`) is reasoned from its verified
  stream/subscription shape, not from an existing implementation.

---

## Appendix — verbatim prompt

The exact brief given to this firewall agent (Opus 4.8, independent,
web-enabled), repo-relative paths preserved. License: Public Domain (The
Unlicense).

````text
You are an independent "analytic firewall" — a third opinion for the maintainer of a Vue 3 + TypeScript SPA (LengYue, a Go spaced-repetition study tool) at `/home/bork/w/omega/frontend/`. Reason independently and adversarially; you have NO stake in the conclusion. The maintainer and his AI collaborator are BOTH leaning toward one answer and explicitly want a disinterested check before they act, because acting means tearing out work just completed. Calibrate to a maintainer with a Haskell / formal-methods background (IO monad, algebraic effects, row-typed effects assumed familiar). Use web search for any empirical claim and flag verified-vs-asserted; but the core of this is reasoning, not literature.

## The decision

The frontend just adopted a deferred-thunk `IO<T>` / `Task<T>` effect-documentation vocabulary and converted ONE service (the canonical ACL, `backend-service.ts`) to it as a worked example. The question now: propagate, stop, change shape, or revert?

Read these to ground yourself (end to end where short):
- `src/lib/io.ts` — the vocabulary as built: `IO<T> = (() => T) & brand`, `Task<T> = IO<Promise<T>>`, `io`/`task` constructors, `runIO`/`runTask` execution boundary.
- `src/services/backend-service.ts` — the converted ACL. Note the shape: `public m(args): Task<X> { return task(async () => { …body… }); }`, consumed as `await runTask(backendService.m(args))`.
- `docs/notes/consult/opus-consult-2026-05-29-effect-ts-adoption.md` — the PRIOR consult (read it; do not anchor on it). Key prior conclusions: full Effect-TS was judged disproportionate for the maintainer's stated goals (effect-typing as **documentation**, secondarily a purity audit); a lighter stack was recommended — `neverthrow` (or "a thin branded `IO<T>`") for typed-error documentation at the ACL, `eslint-plugin-functional` for purity. The maintainer has since **deferred neverthrow** and chosen the "bare `IO<T>`" path — which is what got built.
- `frontend/CLAUDE.md` — "Architectural shape" (the Components/Composables/Services layering; the ACL boundary) and "Type-driven design" (branded types, `as` needs justification). Also note ADR-0010 / the just-completed "green" render-performance arc: `analysis-service.ts` is a WebSocket/streaming client at a hot, freshly-perf-tuned boundary.

## The crux observation (verify it, don't take it on faith)

The ACL is **eager**: methods do one fetch/WS-send and hand a value to a composable. Every call site runs the effect immediately (`await runTask(...)`). So the deferred thunk's **laziness is never exploited** — `runTask` is pure ceremony, and the only thing `Task<T>` delivers over `Promise<T>` is the type-level token "this is an effect." There is NO typed-error channel, NO dependency/`R` channel, NO resource scope — it is the thinnest possible slice of "effect-as-documentation." Is that token worth any cost, given `Promise<T>` returned from a service method already connotes "effectful"?

## The maintainer's two concerns (assess each)
1. Wrapping `analysis-service` (the perf-sensitive WebSocket/streaming boundary just hardened in the green arc) in deferred-thunk indirection — runtime-cheap, but conceptual/indirection overhead at a hot seam.
2. Inconsistent typing discipline — if the conversion stops at `backend-service` (the canonical "ACL"), that service speaks `Task<T>` while `library`/`analysis`/`persistence` speak `Promise<T>`. Uneven application of a typing discipline is itself a smell.

## Evaluate this option space (add others if warranted)
- **(a) Propagate** the deferred `Task<T>` to all four effectful services (+ ~35 call sites, +2 more fakes, runTask ceremony everywhere). Consistent; pays ceremony for the thin token.
- **(b) Stop at backend-service.** Smaller, but inconsistent discipline (concern 2).
- **(c) Eager branded marker** — `Task<T> = Promise<T> & brand`: no `runTask` ceremony (`await backendService.m()` unchanged), keeps the "effect" token, but branding a Promise is leaky (the brand is stripped by `.then`/`await`/`Promise.all`, and every ACL return needs an `as` cast). Assess how leaky/honest this really is in TS.
- **(d) Revert the IO<T> arc** and reserve effect-typing until a concrete trigger makes it earn its weight — typed errors (a `Result`/`neverthrow`), or a genuine laziness/concurrency/resource need (the proxy's range-query fan-out + cancellation + subscription lifetime, which the prior consult named as Effect's real earn-its-weight case). I.e., apply the prior consult's "hold in reserve" logic one level down: even *bare* IO may be over-built for an eager ACL.
- **(e) Pursue the information-bearing thing instead** — if documentation is genuinely wanted now, adopt the typed-error channel (`Result<T,E>`) rather than a contentless effect-marker, since that carries information `Promise<T>` cannot.

## Deliverable
An independent least-regret recommendation, with reasoning, addressing: whether a contentless effect-token is worth any cost at an eager ACL; whether deferred-vs-eager even matters when laziness is unused; the consistency concern; the analysis-service indirection concern; and what concrete future trigger (if any) would make effect-typing earn its weight. Be willing to tell them they over-built and should revert — or that they're about to under-value a real win and should propagate. Don't split the difference to be diplomatic; pick the least-regret path and defend it.

Then WRITE your verbatim assessment to `/home/bork/w/omega/docs/notes/consult/opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md` — self-contained, markdown with headers, marking verified-vs-asserted throughout, and append the full text of THIS prompt (repo-relative paths) in an "Appendix — verbatim prompt" section for reproducibility, with a `License: Public Domain (The Unlicense)` line. Match the structure/tone of the prior consult record. Return a short summary of your bottom-line recommendation to me (the file is the full record).
````
