# Opus Consult — `neverthrow` Typed-Error Overhaul of the Frontend (analytic firewall, 2026-06-01)

Analytic-firewall fourth opinion (Opus 4.8, independent agent with web
access), requested by the maintainer as a **follow-up** to two prior
consults: the Effect-TS adoption consult
(`opus-consult-2026-05-29-effect-ts-adoption.md`), which declined full
Effect-TS and named the **typed-error channel** (`neverthrow`) as the
information-bearing documentation win; and the `IO<T>` deferral consult
(`opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md`), which
recommended reverting a bare deferred-effect token built on
`backend-service.ts` (laziness never spent; contentless token; `runTask`
pure ceremony at an eager ACL). The maintainer **acted on that** — the
`IO<T>` arc is reverted; `backend-service.ts` is back to plain
`Promise`/`throw`, verified below.

The question this consult answers: **what would a `neverthrow`
(`Result<T,E>` / `ResultAsync<T,E>`) overhaul concretely BUY, and is it
worth it?** It explicitly confronts the bridge-tax parallel to the
just-reverted `IO<T>`: every ACL call is eager, so a `Result` may be
unwrapped-immediately just as much as a `Task` was. This record reasons
independently and adversarially; it has no stake in the conclusion.

Saved verbatim for auditability per the consult-record convention. License:
Public Domain (The Unlicense).

---

# Analytic Firewall — Fourth Opinion: "What does a typed-error `Result<T,E>` overhaul buy at an eager ACL, and does it earn its weight?"

**Consult date:** 2026-06-01
**Reviewer stance:** Independent. Adversarial where warranted. No stake in any of the five scope options.
**Calibration:** Maintainer has a Haskell / formal-methods background; `Result<T,E>` is `Either E A`, `ResultAsync<T,E>` is `EitherT E IO`/`ExceptT E (ContT … Promise)`, `match`/`map`/`andThen` are `either`/`fmap`/`>>=`. The argument is pitched at "what does moving the error from a runtime channel to a type-level channel buy, and where does the throw↔`Either` impedance mismatch tax it," not "what is a sum type."

---

## Bottom line up front

**Do not do the full overhaul (option a). Do not do the ACL-only sweep
(option b) either. The least-regret move is option (c) restricted hard:
adopt `Result<T,E>` at exactly the three or four call sites that already
own a *multi-variant* error space a caller branches on by `.kind` /
`.reason` — and even there, prefer the home-grown discriminated union
(option e) over the library unless `andThen`-chaining of fallible steps
actually appears. The information `neverthrow` adds over the *current*
discipline is real but narrow, and it is already 90%-captured by the
existing typed-error classes plus the discriminated-union types the
codebase hand-builds. The compiler-enforced-exhaustiveness win — the one
thing `try/catch` genuinely cannot give — is worth capturing, but it is
worth ~4 sites of capture, not 38 services and ~36 ACL methods of
ceremony.**

The sharp version, in six claims:

1. **The bridge-tax that sank `IO<T>` is structurally present, but it does
   *not* fully sink `Result`.** *(verified — call-site survey)* The ACL is
   eager: every consumer does `const x = await service.m(args)` and needs
   the value-or-error immediately. A `ResultAsync` is unwrapped at the same
   line via `await …match(…)` or `.isErr()`. So the *laziness* axis that
   made `IO<T>` pure ceremony is equally dead here. **But the error channel
   is not contentless the way the `IO` token was.** `Result<T, QeuboError>`
   says *which* failures, exhaustively, in the type — information
   `Promise<T>` cannot carry and that `IO<Promise<T>>` also could not carry.
   The crux question — "is the unwrap worth it" — turns on whether the `E`
   is *informative*, and unlike the effect-token, sometimes it is. The
   honest answer is **site-dependent**, which is why the recommendation is
   site-restricted rather than global.

2. **Over the *existing* discipline, the marginal buy is one thing, not
   four.** *(analytic, grounded in the verified surface)* Of the four
   things a `Result` could add — (i) errors-in-signature documentation,
   (ii) compiler-enforced exhaustive handling, (iii) `andThen` composition,
   (iv) no-throw control flow — the codebase **already has (i)** via typed
   error classes (`QeuboError`, `CardTreeOverflowError`, `AnalysisWaitError`)
   and a hand-built discriminated union (`AnalysisBundleStorageError`);
   **does not exercise (iii)** anywhere (no call site chains two fallible
   ACL steps inside a monad — same construct-and-immediately-consume shape
   the `IO` survey found); and treats (iv) as a *non-goal* because ADR-0002
   **prefers `throw` as a loudness mechanism** (level 3 of its hierarchy).
   The genuine marginal buy is **(ii) alone**: the compiler forcing a caller
   to handle each variant. That is real and `try/catch` cannot give it — but
   it is a single-digit-sites win, not a codebase-wide one.

3. **ADR-0002 already *names* the discriminated-union result type as a
   sanctioned shape — and the codebase already uses it.** *(verified — ADR
   text + repo)* ADR-0002 Rule 3 reads, verbatim: *"Prefer `throw`,
   `undefined` (when the distinction between 'no value' and 'empty value' is
   meaningful), or a discriminated union result type (`{ ok: true, value } |
   { ok: false, reason }`)."* That **is** `Result<T,E>`, written out as a
   plain union. `AnalysisBundleStorageError` is already exactly this shape (a
   three-arm discriminated union the consumer dispatches on by `kind`).
   `neverthrow` would not *introduce* the pattern; it would *library-ize* a
   pattern ADR-0002 blesses and the codebase already hand-rolls. That reframes
   the question from "adopt a new discipline" to "replace a hand-rolled
   instance of a blessed pattern with a library" — a much smaller, and much
   more skeptical, question.

4. **The ecosystem-bridge tax is concrete and asymmetric.** *(verified — 36
   `api.request` sites)* `api-client.request` throws (`Error("API Error
   {status}: …")`); `fetch` rejects; the qeubo/bundle ACLs already
   `catch`-and-reparse that thrown shape into typed errors via string-regex
   on `err.message`. To put `Result` at the ACL you wrap each boundary in
   `ResultAsync.fromPromise(api.request(...), mapErr)` — **36 wrap sites** —
   *and* every consumer that today does `try/catch` either converts to
   `.match` or calls `._unsafeUnwrap()`/re-throws to stay on the throw path.
   That is the Harbor "`runPromise` at every bridge" critique transposed:
   the throw↔`Either` boundary is *every* service method, because the ACL is
   all boundary. Unlike `IO`, the wrap at least carries the `mapErr` that
   *produces* the typed `E` — so the wrap is doing real work, not pure
   ceremony — but it is 36 sites of real work to formalize an `E` that, at
   34 of those sites, is a single opaque `Error` no caller branches on.

5. **The exhaustiveness win lands at exactly four places, and three of them
   already have most of it.** *(verified — typed-error inventory)* The entire
   multi-variant error surface of the frontend is: `QeuboError` (3 kinds, the
   richest — consumers branch `err.kind === 'disabled' | 'no-experiment' |
   'init-not-ready'` at 3+ sites); `AnalysisBundleStorageError` (3 kinds,
   already a discriminated union, dispatched by `kind`); `AnalysisWaitError`
   (2 reasons: `'timeout' | 'aborted'`); `CardTreeOverflowError` (1 kind +
   payload). **Everything else is a single opaque failure** — a generic
   `Error` a caller either surfaces via `pushSystemMessage` or rethrows.
   `Result`'s compiler-enforced exhaustiveness buys something *only* where
   there are ≥ 2 meaningful variants a caller should branch on — i.e. these
   four, and really the top three. At the ~34 single-failure sites,
   `Result<T, Error>` is `Promise<T>`-that-throws with extra syntax: the `E`
   is `Error`, exhaustiveness over one arm is vacuous, and you have paid the
   bridge tax for a channel that documents "this can fail," which — as the
   `IO` consult established — the `Promise` return at a `src/services/`
   boundary already implies.

6. **`neverthrow` vs. a home-grown union: the library earns its weight only
   if `andThen`-chaining appears, and it does not.** *(verified — no chaining
   sites)* `neverthrow`'s value over a bare `type Result<T,E> = {ok:true,
   value:T} | {ok:false, error:E}` is the combinator algebra (`map`,
   `mapErr`, `andThen`, `match`, `combine`, `safeTry`) and `ResultAsync`'s
   thenable ergonomics. *(verified — `ResultAsync` wraps
   `Promise<Result<T,E>>` and is thenable; v8.2.0, ~1yr stable cadence.)*
   That algebra pays when you **sequence multiple fallible steps without
   nested `try/catch`**. The repo does not do this: every fallible ACL call
   is awaited and consumed in isolation (the `IO` survey verified the same
   construct-and-run-adjacent shape; the error survey confirms no
   `andThen`-equivalent). For four mostly-isolated multi-variant sites, the
   combinator algebra is unused weight. A 12-line home-grown
   `Result`/`match` (option e) delivers the exhaustiveness win — the *only*
   genuine marginal buy — with zero dependency, zero bridge-tax beyond the
   four sites, and full alignment with ADR-0002 Rule 3's literal example.

The recommendation, stated plainly: **decline the overhaul (a) and the
ACL-wide sweep (b). Capture the one real win — compiler-enforced
exhaustive handling — at the ≤ 4 sites that have a genuine multi-variant
error space, using a home-grown discriminated union (e) unless a real
`andThen` chain materializes, in which case reach for `neverthrow` (c)
scoped to those sites only. Keep the status quo (d) everywhere else,
because there the typed-error class + ADR-0002 already deliver the buy.**
Detail and adversarial substantiation follow.

---

## What was verified in the repository

All claims in this section are **verified** by direct read of the working
tree at `/home/bork/w/omega/frontend/` on 2026-06-01.

### The `IO<T>` arc is reverted; the ACL is plain `Promise`/`throw`

`src/services/backend-service.ts` methods return plain `Promise<X>` (e.g.
`public async submitReview(...): Promise<ReviewCard>`); no `task(...)`
wrapper, no `Task<X>` return type, no `runTask` consumers. `grep` for
`runTask`/`runIO`/`io.ts` finds nothing in `src/`. The third consult's
revert was executed.

### The HTTP boundary signals failure by `throw` (`src/services/api-client.ts`)

`ApiClient.request<T>(...)` (line 132) — on `fetch` rejection (network) it
`pushSystemMessage('error', …)` and re-`throw`s the raw error; on `!ok` it
emits the system message (unless the status is in `options.silentStatuses`)
and `throw new Error(\`API Error ${response.status}: ${errText}\`)`. The
thrown-message format is **load-bearing**: callers downstream regex-match
`/^API Error (\d+):/` against `err.message` to recover the status. The 401
identity-honest single-retry and the `silentStatuses` opt-in both live here.
There is no `Result`; the contract is throw-with-a-parseable-message.

### Existing typed errors — three classes + one discriminated union

*(verified — full inventory)*

- **`QeuboError extends Error`** (`src/types.ts:814`) — carries
  `kind: 'disabled' | 'no-experiment' | 'init-not-ready'` and `status`. The
  class comment literally documents the consumer pattern: *"Consumers do
  `if (err instanceof QeuboError && err.kind === 'disabled') ...`."* This is
  the richest multi-variant site. Constructed in `qeubo-service.ts` via
  `rethrowAs(err, { 503: 'disabled', 404: 'no-experiment', 409:
  'init-not-ready' })`, which `extractStatus`-regexes the api-client message
  and re-throws a typed `QeuboError` (or passes the original through). Branched
  on at ≥ 3 consumer sites in `useQeubo.ts` (lines 529–543 exhaustive-ish
  bootstrap handling; 633 abort 404-as-success; 712 init-not-ready).
- **`CardTreeOverflowError extends Error`** (`src/types.ts:2094`) — carries
  `rootCardId`, `actualSize`, `maxNodes`. One kind + structured payload.
  Hand-built in `backend-service.ts::fetchTreeByRoot`'s catch by regex-parsing
  the 422 body (`parse422Body`). Consumed in `useCardTreeData.ts:539`
  (`formatError`: `if (err instanceof CardTreeOverflowError) …`).
- **`AnalysisWaitError extends Error`** (`wait-for-analysis.ts:47`) — carries
  `reason: 'timeout' | 'aborted'`. Two variants. Consumed in
  `useReviewSession.ts:447` (`err.reason === 'timeout'` → warn + IDLE;
  `'aborted'` → silent return; non-`AnalysisWaitError` → rethrow). This is
  the cleanest *existing* near-exhaustive handler in the codebase.
- **`AnalysisBundleStorageError`** (`src/services/analysis-bundle.ts:78`) —
  **already a discriminated union type, not an Error subclass**:
  `{ kind:'bundle_too_large', status:413, requestBytes, capBytes, detail } |
  { kind:'user_quota_exceeded', status:413, currentBytes, quotaBytes, detail }
  | { kind:'unknown_scheme', status:500, scheme, detail }`. Parsed from the
  thrown api-client message via `parseStorageError` (null on no-match → caller
  rethrows the original, an explicit ADR-0002 no-info-loss move).
  `rethrowAsStorageError` (`analysis-persistence-service.ts:238`) is a `never`-
  returning `throw parsed | throw err`. Consumed in `useAutoSaveAnalyses.ts`
  (parses, stashes into the service's per-board `autoSaveError` slot, pauses).

  **This is the single most telling artifact for this consult: the codebase
  already invented `Result`'s `E` channel by hand, as a discriminated union,
  exactly as ADR-0002 Rule 3 prescribes — and it is *not* a `neverthrow`
  `Result`; it is a thrown union parsed at the boundary.**

### The error-channel scale, quantified

*(verified — greps)*

- **36** `api.request(...)` call sites across `src/services/` — the boundaries
  a `ResultAsync.fromPromise` wrap would have to cover for an ACL-wide sweep.
- **38** Promise-returning public service methods (`public async` / `):
  Promise<`) across `src/services/*.ts` — the method signatures an overhaul
  would re-type.
- **72** typed-error narrowing sites (`err instanceof …`, `.kind ===`,
  `.reason ===`) across `src/composables`, `src/components`, `src/services`
  (excluding tests) — but these **collapse onto four error spaces** (above);
  the count is high because each space is branched on at several consumers,
  not because there are many spaces.
- **122** `catch` blocks in `src/` (excluding `.test.`). The overwhelming
  majority catch a *single opaque* failure and either `pushSystemMessage` +
  `console.error` or rethrow — i.e. the ADR-0002 fail-loud surface, not a
  multi-variant branch.

The shape of the numbers is the whole argument: **a wide throw surface (36
boundaries, 122 catches) over a narrow multi-variant error space (4 spaces,
really 3 that matter).** A `Result` overhaul pays per-boundary; the win
accrues per-multi-variant-space. The ratio is ~9:1 against the overhaul.

### ADR-0002 (read end to end) names the result type and prefers `throw`

*(verified — `docs/adr/0002-fail-loudly.md` read in full)* Two passages are
load-bearing for this consult, quoted verbatim:

- The loudness hierarchy ranks **"Runtime exception (throws and halts the
  current operation)"** at level 3 — *above* "User-visible system message"
  (4) and far above "Silent fallback" (6). `throw` is a *sanctioned, high-
  ranked* loudness mechanism, not a smell to be engineered away. A `Result`
  that replaces a `throw` is moving *down*-stack from a level-3 mechanism to
  a value — neutral at best for loudness, and only a win if it buys
  compile-time (level 1) enforcement of *handling*.
- Rule 3, verbatim: *"Sentinel-return-instead-of-throw is a red flag and
  requires justification. Prefer `throw`, `undefined` (when the distinction
  between 'no value' and 'empty value' is meaningful), or a discriminated
  union result type (`{ ok: true, value } | { ok: false, reason }`)."* The
  result type is explicitly *one of three blessed shapes*, co-equal with
  `throw` — and the rule's framing is that the **enemy is the bare
  sentinel**, not the `throw`. `Result` is therefore not an upgrade over
  `throw` in ADR-0002's eyes; it is a *peer alternative* whose only edge is
  compile-time exhaustiveness.

This is decisive: ADR-0002 does **not** consider the current `throw`-based
discipline deficient. It considers it *correct*. The only daylight
`Result` opens is moving the *handling obligation* from convention
(ADR-0002 review discipline) to the compiler (exhaustiveness). That daylight
is genuine but narrow.

---

## Q1 — The concrete buy over the existing discipline

Decompose the four candidate buys and check each against the verified
surface.

### (i) Errors-in-signature documentation — **already had, marginally improved**

Today, `fetchTreeByRoot(...): Promise<CardLineageTree>` documents its failure
modes in a *doc-comment* (*"Throws `CardTreeOverflowError` on 422 … Throws the
generic `Error` shape … on 404"*). A `Result<CardLineageTree,
CardTreeOverflowError | NotFoundError>` moves that from prose into the type.
That is a real improvement in *one* respect — the type-checker now knows the
error set, and a doc-comment can drift while a type cannot.

But weigh it honestly: the doc-comment is *present and accurate* today, the
typed error class is *already named* in it, and the consumer already does
`instanceof CardTreeOverflowError`. The delta is "the failure set is in the
signature" vs. "the failure set is in the JSDoc three lines up." For a
formal-methods maintainer this is not nothing — types over comments is the
house religion — but it is an *incremental* documentation gain over a
discipline that already documents errors, not the *categorical* gain the
`IO` token falsely promised (the `IO` token documented a fact the layer
already implied; `Result`'s `E` documents a fact *currently in a comment*).
Incremental-over-present, not categorical-over-absent.

### (ii) Compiler-enforced exhaustive handling — **the one genuine categorical buy**

This is the thing `try/catch` *structurally cannot* give and the only buy
that is categorical rather than incremental. With `QeuboError`'s three kinds
as a `Result` error, a consumer's `match`/`switch` over `err.kind` gets a
`never`-default exhaustiveness check: add a fourth kind, and every consumer
that didn't handle it is a **compile error**. Today, adding a fourth
`QeuboErrorKind` silently leaves the `useQeubo.ts` branches falling through
to the generic-error tail — a *silent under-handling* that is exactly the
ADR-0002 failure mode, and one that `instanceof X && x.kind === …` chains
**do not catch** because there is no exhaustiveness obligation on a chain of
`if`s.

This is the real prize. But note its scope precisely: it is worth capturing
*only where new variants are plausible and a caller genuinely must branch*.
That is `QeuboError` (3 kinds, actively branched, plausibly extensible) and
`AnalysisBundleStorageError` (3 kinds, actively branched) — and weakly
`AnalysisWaitError` (2 reasons, but the set is closed by the
function's own resolution channels and unlikely to grow). It is **not**
worth capturing at the 34 single-failure sites, where exhaustiveness over
one arm is vacuous.

Adversarial check on this buy: today's discriminated-union *types*
(`AnalysisBundleStorageError`) **already get exhaustiveness** when consumed
via a `switch (err.kind)` with a `never` default — *without `neverthrow`*.
The exhaustiveness comes from the *union type*, not from the `Result`
wrapper. So even buy (ii) is partly available today for the one error space
that is already a union; the gap is that `QeuboError` and the others are
*classes* (open to `instanceof`, not closed to `switch`), and *converting
those classes to discriminated unions* captures (ii) **without any library
at all**. This is the single most important deflation in this consult:
**the exhaustiveness win is a property of using a closed discriminated union
for the error, not of adopting `neverthrow`.** `neverthrow` bundles the
union with a combinator algebra; you can buy the union without the algebra.

### (iii) `andThen` composition of fallible steps — **not exercised anywhere**

*(verified — no chaining sites)* `neverthrow`'s headline ergonomic is
chaining: `fetchA().andThen(a => fetchB(a)).andThen(b => fetchC(b))` flattens
what would be nested `try/catch` into a railway. The repo has **no such
site**. Every fallible ACL call is awaited and consumed in isolation, the
same construct-and-consume-adjacent shape the `IO` consult verified across
its 16 sites. The two `Promise.all`-style fan-outs (in `useCardTreeData`)
are *parallel*, not *sequential-fallible-chains*; `ResultAsync.combine` would
apply but buys little over `Promise.all` + a post-hoc partition. **The
combinator algebra — `neverthrow`'s main value over a plain union — is dead
weight here, exactly as `Task`'s laziness was dead weight at the eager ACL.**
This is the bridge-tax parallel landing precisely: the property the library
is *built around* (composition / laziness respectively) is the property the
eager, isolated-call ACL does not use.

### (iv) No-throw control flow — **an explicit non-goal under ADR-0002**

`Result` lets you avoid `throw` entirely. But ADR-0002 ranks `throw` at
loudness level 3 and *prefers* it to weaker mechanisms; "stop throwing" is
not a goal the project holds. Removing `throw`s in favor of `Result`-passing
would, at the single-failure sites, *lower* the loudness floor (a `Result`
that is ignored is a silent failure; a `throw` that is unhandled at least
halts the operation and bubbles to the `RootErrorBoundary`). For a
fail-loudly codebase, **the un-handled-`Result` failure mode is strictly
worse than the un-handled-`throw` failure mode** — an ignored `Err` is the
sentinel-return ADR-0002 Rule 3 calls a red flag, wearing a typed costume.
`neverthrow` mitigates this with an optional ESLint rule
(`eslint-plugin-neverthrow` / `must-use-result`) — but that is the same
"convention patched by an optional lint" shape the `IO` consult flagged as a
new silent-failure class at odds with the fail-loudly ethos. *(asserted —
the lint exists and is the standard mitigation; that it is opt-in and not
compiler-enforced is the structural point.)*

### Q1 verdict

Of four candidate buys, **one is categorical (ii, exhaustiveness), and it is
substantially capturable without `neverthrow` at all** (convert the error
classes to discriminated unions and `switch` with a `never` default). One is
incremental (i, errors-in-signature). One is unused (iii, composition). One
is anti-aligned with ADR-0002 (iv, no-throw). The net concrete buy of *the
library specifically*, over *the existing discipline plus a cheap
class→union conversion*, is small.

---

## Q2 — The eager-ACL bridge-tax: does `Result` repeat the `IO<T>` mistake?

**Partially, and the part it repeats is the part that matters.** *(analytic,
grounded in the verified call-site shape.)*

The `IO` consult's core finding was: at an eager ACL, the property the
abstraction is built around (laziness) is never spent, so the wrapper is
ceremony. Map that onto `Result`:

- **The laziness axis is identically dead.** `ResultAsync` is eager-ish
  (it wraps a `Promise`, which has already started); and even where it
  weren't, no call site defers. Same as `Task`.
- **The composition axis is dead** (Q1.iii — no `andThen` chains). The
  combinator algebra, `neverthrow`'s reason-to-exist over a plain union, is
  unused. This is the direct analog of `Task`'s unused laziness.
- **But the error-content axis is *not* dead — at 4 of ~36 sites.** This is
  where `Result` and `IO` diverge. The `IO` token carried *nothing*
  (`Promise<T>` already says "effectful"). The `Result` `E` carries *which
  failures* — and at the 4 multi-variant sites, that is information neither
  `Promise<T>` nor a single error class fully encodes in a compiler-checkable
  way. So `Result` is **not** contentless the way `IO` was; it is
  *content-bearing at a minority of sites and content-thin at the majority*.

The decisive reframing: **the `IO` token was contentless everywhere, so the
verdict was "revert everywhere." The `Result` channel is content-bearing at
~4 sites and content-thin at ~32. So the verdict is "adopt at the ~4,
decline at the ~32" — a scope restriction, not a binary.** Applying the
`IO` consult's own logic faithfully does not yield "revert/never"; it yields
"adopt exactly where the channel carries information the cheaper mechanism
cannot." That is option (c)-restricted / (e).

The bridge-tax itself — `ResultAsync.fromPromise(api.request(...), mapErr)`
at the boundary, `.match`/`isErr` at the consumer — is real and is 2 sites
per error space (one wrap, one or more consumes). At 4 spaces that is a
dozen-ish sites: tractable. At 36 boundaries (option b) it is the Harbor
"`runPromise` at every bridge" tax for a channel that is `Error` (one arm)
at 32 of them: not worth it. **The bridge-tax is fatal to the wide options
(a, b) and tolerable for the narrow ones (c-restricted, e)** — which is
exactly why the recommendation lands narrow.

---

## Q3 — Ecosystem friction: how leaky is the throw↔`Result` boundary here?

**Leaky in a bounded, one-directional way — and the leak is already being
paid in string-regex form today.** *(verified.)*

The friction surfaces are:

- **`api-client.request` throws a string-message-encoded status.** Any
  `Result` ACL must `fromPromise` it and `mapErr` by re-parsing
  `/^API Error (\d+):/` — which is *exactly what `qeubo-service` and
  `analysis-bundle` already do today*. So adopting `Result` here does not add
  a new leak; it relocates an existing regex-parse from a `catch`/`rethrowAs`
  into a `mapErr`. No net new friction at these sites; arguably cleaner
  (`mapErr` is a more honest home for it than a `throw`ing `rethrowAs`).
- **`fetch` rejects (network) — a *different* error than the HTTP-status
  errors.** A faithful `E` must be a union including a network arm. Today
  this is the generic `Error` rethrow path. Modeling it as a typed arm is
  *more* honest but is new work at every wrapped boundary.
- **Vue lifecycle and `instanceof`-based catches expect throws.** The
  `RootErrorBoundary.vue` and `onErrorCaptured` paths, and the 122 `catch`
  blocks, are throw-shaped. A `Result` at the ACL that is consumed by a
  composable which itself must throw (because *its* caller is a Vue lifecycle
  hook or a template event handler) means `Result` → `throw` re-bridging at
  the composable boundary (`._unsafeUnwrap()` or `.match(ok, err => { throw
  err })`). For the single-failure sites this is pure overhead — you
  `fromPromise` a throw into a `Result` and immediately `_unsafeUnwrap` it
  back into a throw. **That round-trip is the `runTask`-ceremony pattern
  reincarnated** and is the clearest tell that the wide sweep is wrong.

The leak is therefore **asymmetric and already-priced** at the 4 typed
sites (regex-parse exists; relocating it is lateral) and **net-new ceremony**
at the 32 single-failure sites (throw→`Result`→throw round-trip). Friction
confirms the narrow scope.

One verified ergonomic point in `neverthrow`'s favor, distinct from the
reverted `IO`: `ResultAsync` is **thenable** *(verified — it behaves like a
`Promise` under `await`/`.then` while exposing `Result` combinators)*. So a
`ResultAsync`-returning ACL method can still be `await`ed at a legacy
throw-site during a gradual migration without a hard cutover — the
incremental path is real. This is a genuine point of superiority over the
`IO`/`Task` shape (which forced `runTask` at every site immediately). It
lowers the *migration* cost but does not change the *steady-state* verdict:
thenable-ness eases the bridge, it does not make the `E` informative where
it isn't.

---

## Q4 — Does ADR-0002 already cover the win?

**Yes for buy (i); no for buy (ii); and ADR-0002 actively *disprefers* the
direction of buy (iv).** *(verified against the ADR text.)*

- **Documentation (i):** ADR-0002's Consequences section says *"The codebase
  becomes self-documenting about its invariants. Every cast-with-comment,
  every pushSystemMessage, every deliberately-failing predicate is a tiny
  documentation of what the code expects."* The fail-loud discipline *is* the
  documentation mechanism the project chose. `Result`'s in-signature `E` is a
  *stronger* form (type over comment), but the *win* — errors are documented —
  is claimed. Marginal, not categorical (Q1.i).
- **Exhaustiveness (ii):** ADR-0002's loudness hierarchy ranks compile-time
  error (level 1) as strongest and says *"reach for the strongest level that
  fits."* Compiler-enforced exhaustive error handling **is** a level-1
  mechanism for the *handling* obligation, and ADR-0002 does **not** currently
  provide it — the tenet itself admits *"The tenet is a policy, not an
  enforced mechanism. A lazy `catch (e) {}` will compile fine; only code
  review catches it."* So `Result`-with-exhaustiveness is the one place where
  it **upgrades** ADR-0002 from convention to compiler — moving the handling
  obligation from level 4/5 (review) to level 1 (compile). **This is the
  strongest single argument *for* adopting it, and it is precisely scoped to
  the multi-variant sites.** It is not a re-statement of discipline already in
  place; it is a mechanization of a discipline ADR-0002 explicitly notes it
  *cannot* mechanize.
- **No-throw (iv):** Rule 3 prefers `throw`; the hierarchy ranks it level 3.
  ADR-0002 does not want the throws removed. So a *wholesale* `Result`
  conversion that displaces `throw` runs *against* the tenet at the
  single-failure sites.

The honest synthesis: ADR-0002 **covers the documentation win and
disprefers the no-throw direction, but it explicitly leaves the
exhaustiveness win on the table** as a thing it cannot enforce. That gap is
real and is the only place `Result` (or a plain discriminated union +
`never`-default `switch`) genuinely advances the tenet — and it advances it
at the ≤ 4 multi-variant sites, not codebase-wide.

---

## Q5 — The option space, scored

**(a) Full overhaul — all services + call sites return `Result`.**
*Rejected, hard.* 38 method signatures, 36 boundary wraps, ~122 catch sites
re-shaped, and a `Result`→`throw` round-trip at every Vue-lifecycle bridge.
Pays the maximal bridge-tax (the Harbor critique at full volume) to formalize
an `E` that is a single opaque `Error` at ~32 of ~36 sites. Repeats the
`IO<T>` mistake at larger scale: the property the library is built around
(`andThen` composition) is unused, exactly as `Task`'s laziness was. The
exhaustiveness win does not accrue at single-failure sites, so the 32-site
majority is pure ceremony. This is the over-build the maintainer just
reverted, transposed to the error channel and multiplied.

**(b) ACL-only typed-error channel — every service method returns
`ResultAsync`.** *Rejected.* Smaller than (a) by dropping the consumer-side
rewrite, but still 36 boundary wraps and 38 signatures, and still forces the
`Result`→`throw` re-bridge at every composable whose caller is throw-shaped.
Buys the *documentation* win (i) ACL-wide — but that is the *marginal*
win, and ADR-0002 already claims most of it. The categorical win (ii) still
only accrues at the 4 multi-variant sites, which (b) does not specially
serve. Wide cost, narrow benefit — the same ratio that condemned (a), only
slightly less steep.

**(c) Targeted high-value sites — `Result` only where ≥ 2 meaningful
variants a caller branches on.** *Recommended, scoped to the four sites and
restricted further (see e).* The 422-overflow path (`fetchTreeByRoot`), the
qEUBO surface (`QeuboError`'s 3 kinds), the storage-error surface
(`AnalysisBundleStorageError`'s 3 kinds), and weakly the analysis-wait path
(`AnalysisWaitError`'s 2 reasons). These are the *only* places the `E`
carries compiler-checkable information a caller must branch on, and the only
places exhaustiveness is non-vacuous. Bridge-tax is bounded (≈ 2 sites per
space). This is the faithful application of the `IO` consult's logic:
adopt where the channel is content-bearing, decline where it is content-thin.

**(d) Status quo — typed error classes + ADR-0002, add nothing.**
*Recommended for the ~32 single-failure sites.* At a site with one opaque
failure, the typed-error-class-or-generic-`Error` + `pushSystemMessage` +
ADR-0002 discipline *is* the right tool; `Result` adds ceremony and a worse
unhandled-failure mode (ignored `Err` < unhandled `throw` for loudness).
Keeping the status quo here is not inertia; it is correctness per ADR-0002's
own ranking of `throw`.

**(e) Home-grown discriminated-union `Result`/`match`, no library.**
*Recommended as the default realization of (c).* A ~12-line
`type Result<T,E> = {ok:true; value:T} | {ok:false; error:E}` plus a
`match`/exhaustive-`switch` helper captures the **only** categorical buy
(ii, exhaustiveness) for the 4 sites, with zero dependency, full alignment
with ADR-0002 Rule 3's literal `{ ok: true, value } | { ok: false, reason }`
example, and no combinator algebra to leave unused. Critically: the
exhaustiveness comes from converting the error *classes* (`QeuboError` etc.)
into closed discriminated *unions* consumed by `switch (e.kind)` with a
`never` default — which is the actual mechanism, and which `neverthrow`
neither provides nor improves upon. **Prefer (e) over (c)-with-`neverthrow`
unless a real `andThen` chain of fallible steps appears** — at which point
the library's algebra earns its weight and the migration is cheap because
the union shape is already there.

### The decision rule, stated once

> Use `Result` (home-grown by default; `neverthrow` iff chaining appears)
> at a site **iff** the error has ≥ 2 variants a caller must branch on
> *and* new variants are plausible (so exhaustiveness has future value).
> Everywhere else, keep `throw` + typed-class/`Error` + ADR-0002. The
> error channel earns the bridge-tax only where it carries
> compiler-checkable multi-variant information; that is ~4 sites, not 36.

---

## Q6 — What concrete future trigger flips the verdict toward the library or the wider scope?

Named so a future session recognizes the moment:

1. **A real `andThen` chain (flips e → neverthrow).** The first time a
   composable sequences two-or-more fallible ACL steps where step N+1 needs
   step N's value and any step's failure should short-circuit with a typed
   error — `fetchRoot().andThen(root => fetchTree(root)).andThen(...)`. That
   is where `neverthrow`'s railway beats nested `try/catch` and beats the
   home-grown union (which has no chaining ergonomics). None of the current
   sites is this; the parallel `Promise.all` fan-outs are not it.

2. **A third multi-variant error space with > 3 kinds, or a space whose kinds
   churn (strengthens c/e).** If a new ACL surface arrives with, say, five
   distinct caller-actionable failure kinds that evolve over releases, the
   exhaustiveness win compounds and the case for the union (and possibly the
   library, if combinators also appear) strengthens at that site.

3. **Adoption of a structured error-reporting service (Sentry et al.).**
   ADR-0002's own "Revisit when…" item 4 names this. A typed `E` becomes more
   valuable when errors are also a *reporting* payload with a stable shape;
   that is a documentation-and-telemetry win the single error class does not
   give. Still site-scoped, not a mandate for the wide sweep.

4. **`eslint-plugin-functional` / a purity arc lands (per the 2026-05-29
   consult's other leg).** If the codebase adopts a functional-lint posture,
   a `must-use-result` lint becomes consistent with the surrounding
   discipline rather than a lone opt-in patch — softening the Q1.iv objection
   that the unhandled-`Result` mitigation is convention-not-compiler.

Until one of these is concrete, the library is reserve and the home-grown
union at ≤ 4 sites is the inventory.

---

## Synthesis — least-regret recommendation

**Decline the overhaul. The full sweep (a) and the ACL-wide sweep (b) repeat
the just-reverted `IO<T>` mistake one channel over: they pay a per-boundary
bridge-tax (36 wraps, the Harbor "`runPromise`/`_unsafeUnwrap` at every
bridge" tax) to formalize an error channel that is a single opaque `Error`
at ~32 of ~36 sites, and they leave `neverthrow`'s combinator algebra — its
reason to exist over a plain union — entirely unused, exactly as `Task`'s
laziness sat unused at the eager ACL.**

**The one genuine, categorical win — compiler-enforced exhaustive handling
of multi-variant errors, the thing `try/catch` cannot give and the thing
ADR-0002 explicitly admits it *cannot mechanize* — is real and worth
capturing. But it accrues at exactly the ≤ 4 sites with a true multi-variant
error space (`QeuboError`, `AnalysisBundleStorageError`,
`CardTreeOverflowError`, `AnalysisWaitError`), and it is substantially a
property of using a *closed discriminated union + `never`-default `switch`*,
not of the library. Capture it there, with a home-grown 12-line `Result`
(option e) by default — which aligns verbatim with ADR-0002 Rule 3's own
`{ ok: true } | { ok: false }` example — reaching for `neverthrow` (option c)
only if and when a real `andThen` chain of fallible steps appears. Keep the
status quo (option d) at the ~32 single-failure sites, where `throw` +
typed-class + ADR-0002 is, by the tenet's own loudness ranking, already the
correct tool and where a `Result` would *lower* the unhandled-failure
loudness floor.**

The throughline, and the contrast with the prior consult: the `IO<T>` token
was contentless *everywhere*, so the verdict was revert *everywhere*. The
`Result` error channel is content-bearing at a *minority* of sites and
content-thin at the *majority*, so the faithful verdict is adopt at the
minority, decline at the majority — a scope restriction, not a binary, and
not a library mandate. The maintainer's actual ethos — typing as
*information-bearing* documentation, and compile-time over review-time
enforcement — is served by converting the four error spaces to closed
unions with exhaustive handling. It is *not* served by wrapping 36 boundaries
to give a single opaque `Error` a typed costume. Buy the union where the
variants are; do not buy the library to get a union you can write in twelve
lines, and do not buy either where there is only one way to fail.

---

## Verification status of every load-bearing claim

**Verified by direct repository read (working tree, 2026-06-01):**
- `IO<T>` arc reverted: `backend-service.ts` returns plain `Promise<X>`;
  no `task`/`runTask`/`io.ts` in `src/`.
- `api-client.ts::request` throws `new Error(\`API Error ${status}: …\`)` on
  `!ok` and re-throws on `fetch` rejection; `silentStatuses` suppresses the
  system-message surface but preserves the thrown message shape; downstream
  ACLs regex-match `/^API Error (\d+):/` on `err.message`.
- Four error spaces total: `QeuboError` (3 kinds, `src/types.ts:814`,
  branched at `useQeubo.ts:529/633/712`); `CardTreeOverflowError` (1 kind +
  payload, `src/types.ts:2094`, consumed `useCardTreeData.ts:539`);
  `AnalysisWaitError` (2 reasons, `wait-for-analysis.ts:47`, consumed
  `useReviewSession.ts:447`); `AnalysisBundleStorageError` (3-arm
  discriminated union, `analysis-bundle.ts:78`, parsed via
  `parseStorageError`, rethrown via `rethrowAsStorageError`, consumed in
  `useAutoSaveAnalyses.ts`).
- Counts: 36 `api.request` call sites in `src/services/`; 38 Promise-returning
  public service methods; 72 typed-error-narrowing sites across
  composables/components/services (collapsing onto the 4 spaces); 122 `catch`
  blocks in `src/` (non-test).
- No `andThen`-style sequential-fallible-chain site exists; the two fan-outs
  in `useCardTreeData` are parallel `Promise.all`-shaped, not chains.
- `qeubo-service.ts` builds typed errors via `extractStatus` + `rethrowAs`
  (regex on the api-client message); `analysis-persistence-service.ts` builds
  them via `rethrowAsStorageError` → `parseStorageError`.

**Verified against `docs/adr/0002-fail-loudly.md` (read end to end):**
- Loudness hierarchy ranks runtime exception (`throw`) at level 3, above
  user-visible message (4) and silent fallback (6); "reach for the strongest
  level that fits."
- Rule 3 verbatim: *"Sentinel-return-instead-of-throw is a red flag and
  requires justification. Prefer `throw`, `undefined` (when the distinction
  between 'no value' and 'empty value' is meaningful), or a discriminated
  union result type (`{ ok: true, value } | { ok: false, reason }`)."*
- Consequences/Negative admits the tenet "is a policy, not an enforced
  mechanism. A lazy `catch (e) {}` will compile fine; only code review
  catches it." Revisit-when item 4 names a structured error-reporting service.

**Verified by web source:**
- `neverthrow` latest is **v8.2.0**, last published ~1 year ago (stable, slow
  cadence consistent with the 2026-05-29 consult); `ResultAsync` wraps
  `Promise<Result<T,E>>` and **is thenable** (awaitable/`.then`-able while
  exposing `Result` combinators) —
  [npm: neverthrow](https://www.npmjs.com/package/neverthrow),
  [supermacro/neverthrow README](https://github.com/supermacro/neverthrow/blob/master/README.md).

**Asserted from reasoning / inherited from prior consults (flagged):**
- The "content-bearing at a minority, content-thin at the majority" framing,
  and the "exhaustiveness is a property of the union not the library"
  deflation, are analytic judgments grounded in the verified surface, not
  citations.
- The `must-use-result` ESLint rule as the standard (opt-in, not
  compiler-enforced) mitigation for ignored `Err` values is asserted from
  general `neverthrow`-ecosystem knowledge; the structural point (it is a
  convention patched by lint, not a compiler guarantee) follows regardless.
- The unhandled-`Result` < unhandled-`throw` loudness comparison is an
  analytic application of ADR-0002's hierarchy, not a quoted ruling.
- The bridge-tax parallel to `IO<T>` is reasoned from the eager,
  isolated-call call-site shape verified in both this consult and
  `opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md`.

---

## Appendix — verbatim prompt

The exact brief given to this firewall agent (Opus 4.8, independent,
web-enabled), repo-relative paths preserved. License: Public Domain (The
Unlicense).

````text
You are an independent "analytic firewall" — a fresh, disinterested opinion for the maintainer of a Vue 3 + TypeScript SPA (LengYue, a Go spaced-repetition study tool) at `frontend/`. Reason independently and adversarially; you have NO stake. Calibrate to a maintainer with a Haskell / formal-methods background — `Result<T,E>` is `Either`, `ResultAsync` is `EitherT`/`ExceptT` over a task; argue at that level. Use web search for empirical claims (neverthrow maturity/API), flag verified-vs-asserted, but the core is reasoning about THIS codebase.

## The question

**What would a `neverthrow` (typed-error `Result<T,E>` / `ResultAsync<T,E>`) overhaul of the frontend concretely BUY — and is it worth it?** Be willing to conclude it does NOT earn its weight, or that a thinner thing does.

## Essential context (read these — they're on disk)

Two prior consults set the stage; read both end to end:
- `docs/notes/opus-consult-2026-05-29-effect-ts-adoption.md` — declined full Effect-TS for the stated goals (effect-typing as documentation + purity audit); recommended a lighter stack: `neverthrow` (typed errors) + `eslint-plugin-functional` (purity). Named the **typed-error channel** as the information-bearing documentation win.
- `docs/notes/opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md` — the maintainer instead tried the *other* leg first (a bare deferred `IO<T>`), built it on `backend-service.ts`, and **just reverted it** as over-built for an eager ACL (laziness never spent; contentless token; `runTask` pure ceremony). Note especially its "eager ACL = every call is a bridge" reasoning and the bridge-tax critique — `neverthrow` may face the SAME structural problem (every `Result` unwrapped immediately at the composable). Assess that head-on.

## Ground the assessment in the ACTUAL current error-handling surface (re-read; backend-service was just reverted to plain Promise/throw)

- `src/services/api-client.ts` — the HTTP boundary; how it signals failure (it throws `Error("API Error {status}: …")`; note `silentStatuses`).
- `src/types.ts` — existing **typed error classes** (e.g. `CardTreeOverflowError`); grep for others.
- `src/services/backend-service.ts` — `fetchTreeByRoot` catches the thrown `Error`, parses the 422 body, and re-throws a typed `CardTreeOverflowError` (the ACL already hand-builds typed errors). Other methods just let `api`'s throw propagate.
- The consumption side: `try/catch` + `console.error` + `pushSystemMessage(...)` at call sites (`ForestDirectory.vue`, `useReviewSession.ts`, `useCardTreeData.ts`, `useAppBootstrap.ts`), and `instanceof` error-class checks (e.g. `AnalysisWaitError` in `composables/analysis/wait-for-analysis`, `AnalysisBundleStorageError` in `services/analysis-bundle`).
- `docs/adr/0002-fail-loudly.md` (or the synopsis entry) — the existing fail-loud discipline neverthrow would interact with/duplicate.

## What to actually evaluate

1. **The concrete buy.** Over the EXISTING discipline (typed error classes + `try/catch` + `instanceof` + ADR-0002 `pushSystemMessage`), what does `Result<T,E>` add? Documentation (errors in the *signature* vs discoverable only by reading the body / catch)? **Exhaustive handling** (the compiler forcing callers to handle each error variant — the thing `try/catch` cannot give)? Composability (chaining fallible steps without nested try/catch)? Quantify which of these the codebase would actually feel, and where.
2. **Does it hit the same eager-ACL bridge-tax that sank `IO<T>`?** Every ACL call is one fetch handed to a composable that immediately needs the value-or-error. Is `Result` unwrapped-immediately just as much ceremony, or does the *error channel* (unlike `IO`'s contentless effect token) carry enough information to justify the unwrap? This is the crux — answer it directly.
3. **Ecosystem friction.** `api-client` throws; `fetch` rejects; Vue lifecycle and `instanceof`-based catches exist. Does `Result` mean `fromThrowable`/`fromPromise` wrappers at every boundary (the Harbor "runPromise at every bridge" critique from the 2026-05-29 consult, transposed)? How leaky is the throw↔Result boundary here?
4. **Does ADR-0002 already cover the win?** The codebase *fails loudly* and *already constructs typed error classes*. Is `Result` a meaningful upgrade (compiler-enforced exhaustiveness the classes+catch don't provide) or a re-statement of discipline already in place at ceremony cost?
5. **Scope options, scored:** (a) full overhaul (all services + call sites return `Result`); (b) ACL-only typed-error channel; (c) targeted high-value sites only (e.g. the 422-overflow path, the review-submit path — places with multiple meaningful failure modes a caller should branch on); (d) keep the status quo (typed error classes + ADR-0002) and add nothing; (e) a thinner home-grown `Result`/discriminated-union for the few sites that have a real multi-variant error space, no library.

## Deliverable

A least-regret recommendation with reasoning, answering "what does it buy and is it worth it," explicitly addressing the bridge-tax parallel to the just-reverted `IO<T>`. Don't split the difference to be diplomatic. Then WRITE your verbatim assessment to `docs/notes/opus-consult-2026-06-01-neverthrow-overhaul.md` — self-contained, markdown with headers, verified-vs-asserted marked, with an "Appendix — verbatim prompt" section (this prompt, repo-relative paths) and a `License: Public Domain (The Unlicense)` line; match the structure/tone of the two prior consult records. Return a short bottom-line summary to me (the file is the full record).
````
