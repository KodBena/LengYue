# Opus Consult — Effect-TS Project-Wide Adoption (follow-up firewall, 2026-05-29)

Analytic-firewall second opinion (Opus 4.8, independent agent with web
access), requested by the maintainer as a **follow-up** to the
render-coupling typing consult
(`opus-consult-2026-05-29-render-coupling-typing.md`). That consult named
Effect-TS as the "theoretical home" of effect-typed reactive reads; this
consult evaluates adopting Effect-TS **project-wide**, under a clarified
motivation that is *not* primarily about Vue reactivity.

The clarified motivation, which calibrates everything below:
- **NOT** primarily to fix Vue reactivity coupling. The maintainer accepts
  Effect-TS may be unergonomic for Vue reactivity, and Vapor subsumes that
  benefit anyway. The agent was told **not** to spend effort on "can
  Effect-TS model Vue reactive reads."
- **PRIMARY value sought:** effect-typed signatures as **documentation** of
  reasonable effectful computation generally — errors, async,
  dependencies/DI, IO/resource — made explicit in type signatures.
- **SECONDARY goal:** using the effect-typed surface to **audit
  pure-vs-impure code smells** — surfacing functions that shouldn't do
  both pure and impure work.

Saved verbatim for auditability per the consult-record convention. License:
Public Domain (The Unlicense).

---

# Analytic Firewall — Second Opinion: "Should LengYue's frontend adopt Effect-TS project-wide, for documentation + purity-audit value?"

**Consult date:** 2026-05-29
**Reviewer stance:** Independent. Adversarial where warranted. No stake in adopting or declining.
**Calibration:** Maintainer has a Haskell / formal-methods background; IO monad, algebraic effects, and row-typed effects are assumed familiar. Depth is set accordingly — this record argues at the level of "what does the `Effect<A, E, R>` row buy you over lighter encodings," not "what is a monad."

---

## Bottom line up front

**Adopting *full* Effect-TS project-wide is disproportionate to the stated
goals (documentation + purity audit). A lighter stack gets ~80% of the
documentation value and most of the purity-audit value at a fraction of the
paradigm cost — and the purity-audit benefit the maintainer wants is
*partly an illusion* under Effect-TS as well.**

The sharp version of the verdict, in three claims:

1. **Documentation value is real and is Effect's genuine strength** — the
   `Effect<Success, Error, Requirements>` row *is* effect-as-documentation,
   and adopters independently report exactly the benefit the maintainer
   wants ("I can see at a glance what my function does and what can go
   wrong … I don't have to read the implementation"). *(verified — adopter
   report)* But you pay for the whole fiber/scheduling/runtime machinery to
   get a type-row you mostly want for documentation. That is the
   proportionality problem in one sentence.

2. **The purity-audit goal is the weakest fit.** Effect's tooling
   (`@effect/language-service`) audits impurity **only once it is already
   lifted into `Effect`** — it flags floating/unrun Effects, missing
   `yield*`, leaking requirements. It does **not** flag "this plain
   function mixes pure and impure work," because to Effect that function is
   just untyped TypeScript it cannot see. *(verified — the LSP diagnostics
   "target Effect-specific constructs … not plain TypeScript.")* So Effect
   does not *find* your impure-mixed functions; it only keeps the ones you
   *already converted* honest. The "surface the smell" job the maintainer
   names is better served by a **purity lint** (`eslint-plugin-functional`)
   plus a **naming/suffix convention**, which operate on the plain code you
   actually want audited.

3. **Sequencing argues for "not now, and probably not whole-hog."** Effect
   v4 is in **beta as of April 2026** with a rewritten runtime and a
   70 kB→20 kB bundle change; v3 is the production line but the ecosystem
   is mid-transition. Vapor is **beta, unstable, ~Q4-2026 stable target**.
   Starting a project-wide paradigm migration on top of a frontend that is
   *also* contemplating a Vapor migration, while Effect itself is between
   majors, is two moving foundations at once. If anything is adopted, adopt
   the **lighter documentation+audit stack now** and reserve full Effect for
   a *specific* future need (real concurrency/resource-scoping pressure),
   which is where it actually earns its weight.

The recommendation, stated plainly: **decline full Effect-TS for the stated
goals. Adopt instead a three-part lighter stack** — (a) `neverthrow` (or a
thin branded `IO<T>`) for typed-error/effect documentation at the service
ACL, (b) `eslint-plugin-functional` + a `.pure`/suffix convention for the
purity audit, (c) keep the existing ADR-0002 / ACL discipline as the spine.
**Hold full Effect-TS in reserve** for the day a genuine concurrency/fiber/
resource-scope problem appears — that is the day it stops being
over-powered. Detail and adversarial substantiation follow.

---

## Q1 — Maturity, API stability, churn, ecosystem, and incremental-adoption viability

### 1a. Version / stability state as of now *(verified — npm registry, release blogs)*

Pulled directly from the npm registry for `effect`:
- **`latest` dist-tag: `3.21.2`** (v3 line; 3.21.2 published 2026-04-22).
- **`beta` dist-tag: `4.0.0-beta.74`.**
- **436 total published versions** of the core package.

Interpretation:
- **v3 is genuinely stable and production-grade.** The Effect 3.0
  announcement (2024) states *"Effect is finally stable!"* and *"after 5
  years of work and 3+ years of production usage we are ready to release
  Effect 3.0"*, with an explicit semver commitment: *"major releases will
  include breaking changes … minor … new features … patch … bug-fixes,"*
  and *"We do not expect new major releases in the near future."* *(verified
  — effect.website/blog/releases/effect/30/)* So at the **major-API** level,
  v3 has been stable for ~2 years.
- **But the cadence is high and the surface is large.** 436 versions and
  "multiple releases weekly across the monorepo" (the visible window April
  17–22 2026 alone had ~13 package releases across `@effect/sql`,
  `@effect/platform`, `@effect/rpc`, `@effect/cluster`, `@effect/cli`, …).
  *(verified — GitHub releases page)* These are mostly minor/patch and
  mostly in the *peripheral* packages, not the core programming model — but
  the ecosystem moves fast, and a project pinning Effect inherits that
  velocity in its lockfile.
- **v4 is a live beta with a runtime rewrite and a bundle-size step
  change.** Effect v4 beta shipped **2026-04-18**: *"Complete rewrite of the
  core fiber runtime,"* *"A minimal program using Effect, Stream, and Schema
  drops from roughly 70 kB in v3 to about 20 kB in v4,"* a **unified package
  system** ("all ecosystem packages share a single version number"), and an
  `effect/unstable/*` mechanism to ship features "without committing to
  strict semver guarantees." *(verified — InfoQ, 2026-04)* The v4-beta blog
  notes *"The core programming model of `Effect`, `Layer`, `Schema`, and
  `Stream` remains the same"* — so the conceptual migration is mild — but
  v4 is **not** the production recommendation yet (the InfoQ piece quotes an
  adopter: "I try to avoid using beta releases in general in production
  software"). *(verified)*

**Net for Q1 maturity:** the *core model* is mature and semver-stable; the
*ecosystem and bundle/runtime substrate are mid-transition* (v3→v4). A new
adopter today picks v3 and accepts that a v4 migration is on the horizon
(advertised as low-friction, with codemods promised, but not yet proven).
This is a "stable enough, but you're boarding a moving train" posture.

### 1b. Ecosystem health and production track record *(mixed — see flags)*

- Effect has **~300K weekly npm downloads** vs neverthrow's **~500K**.
  *(verified — pkgpulse 2026 guide; cross-checked against the dist-tag/
  download framing in the neverthrow-vs-Effect comparison.)* The guide's own
  read: Effect's 300K "reflect greenfield applications," neverthrow's 500K
  "skew toward existing codebases." *(verified — pkgpulse)* That split is
  itself a signal: **Effect adoption concentrates in greenfield**, which is
  the opposite of LengYue's situation (mid-sized existing SPA).
- **Named production adopters that surfaced:** Warp (CTO Adam Rankin,
  payments/payroll), Fiberplane (Effect traces as agentic-dev guardrails),
  Val Town, plus smaller names (Betalyra, coteach.ai, Embedded Insurance).
  *(verified individually via search surface; the canonical/exhaustive
  "who uses Effect" list could not be located — flagged.)* **Observation:
  these skew backend / AI-native / infra / startup. No major Vue SPA
  adopter surfaced in any search.** That absence is a finding, not proof of
  unsuitability, but it means the frontend-Vue integration path is
  comparatively un-trodden — you would be early, not following a herd.
- One promotional article ("production AI apps in 2026") makes maturity
  claims with **zero named adopters and no concrete metrics** — discount it
  as marketing. *(verified — the article names no companies and gives no
  numbers.)*

### 1c. Can it be adopted incrementally? — Yes, mechanically; the friction is at the *bridges* *(verified)*

This is the most important Q1 sub-question and the answer is nuanced.

**Mechanically yes.** Effect is explicitly designed for partial scope.
Multiple independent sources converge:
- Effect's own ecosystem framing: *"you don't need complete buy-in: You can
  scope Effect to parts of your app or even single functions rather than
  rewriting everything."* *(verified — search-surfaced from the
  Effect-marketing/intro material)*
- A worked GraphQL-backend example mixes Effect and Promise resolvers in one
  codebase by detecting whether a resolver returns an `Effect` and running
  it accordingly — *"enables incremental migration … without requiring a
  complete rewrite."* *(verified — dev.to martinpersson)*
- The realistic adopter posture (dnlytras) is *partial by choice*: "I
  decided to use Effect-ts for validation and error handling … I'm losing a
  lot of the library's power, but I also reduce the surface of the things I
  have to learn." *(verified)*

So your proposed "effectful boundaries first" (HTTP/API client, WebSocket,
persistence, services) is exactly the supported shape: the ACL at
`backend-service.ts`, the proxy WebSocket client, and the debounced
persistence layer are precisely the places an `Effect`-typed boundary is
idiomatic, and the rest of the app can stay plain.

**But the friction is real and it lives at the *bridges*.** The single most
credible adversarial source is Harbor's "Why We Love Functional Programming
but Don't Use Effect-TS" (2025-11), and its objection is *not* "FP is bad" —
they concede FP's value explicitly. Their objection is **ecosystem-bridge
tax**: *"The Node.js ecosystem is built on promises that `reject` and
functions that `throw`, and ecosystem libraries expect this."* They found
friction integrating Result-style types with their ORM transactions, Sentry,
and auth — *"requiring constant unwrapping and re-throwing"* — and feared
Effect would amplify it, *"forcing them to call `Effect.runSync` or
`Effect.runPromise` at every ecosystem bridge point."* *(verified — Harbor)*

For LengYue this maps directly: **every place Effect meets Vue, the browser
fetch/WebSocket API, IndexedDB/persistence, and the OpenAPI-generated client
is a `runPromise`/`runFork` boundary.** Incremental adoption that stops at
"effectful boundaries only" means *the entire app is boundary* — you bridge
in and out of Effect at every service call, which is the worst ratio of
bridge-tax to in-paradigm benefit. Effect pays off best when a *long*
computation stays inside the monad (compose ten effectful steps, run once);
a thin ACL that does one fetch and hands a domain value to a Vue composable
spends almost all its time at the bridge.

**Second friction: the `yield*` footgun, which is ironic given your ethos.**
Effect's generator syntax (`Effect.gen`) requires `yield*` (delegation), and
writing `yield` instead is a **silent** mistake the *compiler does not warn
about* in the general case — it manifests as broken type-narrowing or
unexecuted effects. *(verified — Effect-TS/website issue #972, and the
existence of dedicated LSP diagnostics `missingStarInYieldEffectGen` /
`missingReturnYieldStar` to catch it.)* For a project whose primary ethos is
"fail loudly / type sanity," adopting a tool whose *headline ergonomic*
introduces a new class of *silent* error — patched only by an optional LSP
plugin, not the type-checker — is a genuine tension worth naming. It is
fixable (install the language-service plugin, set the diagnostics to error)
but it is exactly the kind of "the convention is leaky" footgun the
render-coupling postmortem was wary of, reappearing in a new place.

**Learning curve / blast radius (calibrated to the maintainer):** for
someone fluent in Haskell and effect systems, the *concepts* are familiar
and the curve is shallow on theory. The curve that bites even experienced
people is **idiom sprawl** — "always searching for how to do it the *right
way*," decision fatigue across Queues/PubSub/Scheduling/Streams/DI when you
only wanted error+async typing. *(verified — dnlytras: "I found myself in a
rabbit hole … always searching for how to do it the right way.")* Blast
radius of a *bounded* adoption (ACL + services only) is contained; blast
radius of *project-wide* adoption is large precisely because the bridge
count is large and every composable becomes a `runPromise` call site.

---

## Q2 — Documentation + purity-audit fit, and the adversarial proportionality verdict

### 2a. Effect as in-signature documentation of effectful computation — STRONG fit *(verified)*

This is where Effect genuinely shines and where the maintainer's instinct is
correct. The `Effect<Success, Error, Requirements>` type *is* a row-typed
effect signature:
- **`E` (error channel)** documents the *typed, expected* failures — the
  union of errors a computation may produce, in the signature, exhaustively.
- **`R` (requirements channel)** documents the *dependencies/capabilities* a
  computation needs — Effect's DI is "a typed service registry where
  dependencies are tracked in the type signature as the third type
  parameter." *(verified — pkgpulse / neverthrow-vs-Effect comparison)* This
  is the row-typed-effects analog the maintainer will recognize: `R` is the
  effect-row of *required capabilities*, discharged by `Layer`s.
- **Async and resource** are folded into the same type: an `Effect` is
  lazy/deferred (documents "this is effectful, not yet run"), and `Scope`
  documents resource acquisition/release in the type.

The adopter testimony is unusually on-point for *your exact goal*: *"The
type signature serves as clear documentation … I can see at a glance what my
function does and what can go wrong. I don't have to read the implementation
to identify the errors."* *(verified — dnlytras)* That is "effect-typing as
documentation" stated by a real user. So **for Motivation B (documentation),
Effect over-delivers** — it documents errors *and* dependencies *and*
async *and* resource in one type. No lighter tool documents all four in the
signature.

The honest caveat: it over-delivers on a *dimension you may not need fully*.
The `R`/`Layer` DI channel is powerful documentation but is also the
heaviest conceptual load (it restructures how you wire dependencies). If your
documentation appetite is mostly "errors + async made explicit," you are
buying the `R` channel and the `Layer` machinery to get the `E` channel and
laziness. That is the proportionality seam (2c).

### 2b. Does Effect help *audit* pure-vs-impure boundaries? — PARTIAL, and not the way the goal implies *(verified — the decisive Q2 finding)*

The maintainer's secondary goal: surface functions that "shouldn't do both
pure and impure work." Here the evidence forces a precise, somewhat
deflationary answer.

**What Effect's tooling actually audits.** There are two relevant tools, and
the load-bearing one is *not* the ESLint plugin:
- **`@effect/eslint-plugin` (v0.3.2) ships exactly two rules:** `dprint`
  (formatting) and `no-import-from-barrel-package`. *(verified — npm
  registry `@effect/eslint-plugin/latest` and the GitHub `src/rules`
  directory listing show only `dprint.ts` and
  `no-import-from-barrel-package.ts`.)* **There is no purity rule, no
  side-effect rule, no pure/impure-mixing rule in Effect's official ESLint
  plugin.** If you adopt Effect expecting its lint to flag impure-mixed
  functions, that expectation is false.
- **`@effect/language-service` (the LSP plugin) is the real audit surface,
  and it audits *within the Effect paradigm only*.** Its diagnostics:
  `floatingEffect` ("Ensures Effects are yielded or assigned to variables,
  not left floating"), `missingStarInYieldEffectGen`, `missingReturnYieldStar`,
  `leakingRequirements` ("Detects implementation services leaked in service
  methods"), `missingEffectContext`, `effectInVoidSuccess` ("Detects nested
  Effects in void success channels that may cause unexecuted effects"),
  `globalConsoleInEffect` (off by default). *(verified — language-service
  README.)* Crucially: *"This plugin works on code using Effect types and
  patterns … The diagnostics target Effect-specific constructs … not plain
  TypeScript."* *(verified)*

**The decisive implication.** Effect makes impurity *visible in the type* —
once a computation is an `Effect<A, E, R>`, everyone can see it is effectful,
and a function returning `Effect` is self-evidently in the impure column.
That is a real *documentation-of-impurity* win. **But it does not *find*
your impure-mixed functions.** A plain function that secretly reads
`Date.now()`, mutates a module cache, *and* does some pure arithmetic is, to
Effect, just untyped TypeScript — Effect's diagnostics never look at it. You
only get the audit signal *after* you have already decided to lift that
function into `Effect`, at which point you have already done the
classification by hand. **Effect rewards purity discipline; it does not
discover purity violations.** The "surface the code smell" job — the part
that scans your *existing plain code* and says "this function does both" —
is precisely the part Effect's tooling does *not* do.

So the audit goal, stated as "make the smell visible/lintable across the
codebase," is served *better* by a tool that operates on plain TypeScript
(2c).

### 2c. ADVERSARIAL — lighter alternatives, and where (if anywhere) full Effect earns its weight

Laying the alternatives against the *stated goals* (documentation + purity
audit), with verified maturity data:

**For typed-error / effect *documentation* at boundaries:**
- **`neverthrow`** — `Result<T, E>` / `ResultAsync<T, E>`. **v8.2.0, last
  published 2025-02, 63 versions over 6 years** *(verified — npm registry)*
  — i.e., deliberately slow, stable cadence; the pkgpulse guide calls its
  API "largely unchanged for several years, which is a feature rather than a
  bug." *(verified)* ~3 KB bundle vs Effect's ~50 KB+ *(verified —
  pkgpulse).* It documents the **error channel in the signature** (the `E`
  you most want) and the async-ness (`ResultAsync`), at "the level of
  individual functions," and is explicitly the recommended choice to "add
  typed errors to an existing TypeScript project incrementally." *(verified
  — pkgpulse, Effect's own neverthrow comparison)* What it does **not**
  document: the `R` (DI/requirements) channel and resource `Scope`. If those
  are not your documentation priority, neverthrow gives you the `E`-channel
  documentation for ~1/15th the bundle and none of the paradigm tax.
- **A thin branded `IO<T>` / deferred-effect wrapper** — for a
  formal-methods maintainer, a 30-line `type IO<T> = () => T` (or
  `Task<T> = () => Promise<T>`) with a branded `__impure` tag costs nothing,
  documents "this is a deferred effect" in the type, and composes with your
  existing branded-type discipline. It is the minimal expression of
  "effect-as-documentation." It does not give you typed errors *and*
  laziness *and* DI — but it is honest about being a documentation device,
  not a runtime.
- **`fp-ts`** — *(verified: v2.16.11, last published 2025-08; it is in
  maintenance and Effect is its acknowledged successor — "It is the
  successor to fp-ts.")* Adopting fp-ts today means adopting the *less
  maintained ancestor* of Effect; no reason to prefer it over either
  neverthrow (lighter) or Effect (the live successor). **Rule it out.**

**For the purity *audit* (the part Effect does *not* do on plain code):**
- **`eslint-plugin-functional`** — *(verified: v9.0.5, last published
  **2026-05-20** — actively maintained, days old.)* "Disable mutation and
  promote functional programming in JS/TS," with `Strict` and `Recommended`
  rulesets. This operates on **your plain code** and can flag mutation and
  expression-statement side effects — i.e., it *finds* the smells Effect
  cannot. This is the better fit for "surface functions that mix pure and
  impure work," because it runs everywhere, not only inside `Effect`.
- **`eslint-plugin-functional-core`** — implements the "Functional Core,
  Imperative Shell" pattern with a **`.pure` file/suffix convention** (files
  matching `*.pure.ts` are checked for impurity). This is conceptually
  *exactly* the maintainer's audit goal: declare regions pure, lint
  violations. **BUT — adversarial flag: it is effectively unmaintained.**
  *(verified — npm registry: latest v1.7.1, last published **2023-09-21**,
  ~2.5 years stale.)* Don't adopt a stale plugin as load-bearing; **borrow
  its *idea*** — a `.pure.ts` suffix (or an ADR-0003-style band tag for
  "pure") plus `eslint-plugin-functional`'s rules scoped to those files via
  ESLint `overrides`. That gives you the file-level purity audit on a
  maintained substrate.
- **`eslint-plugin-pure` (`purely-functional`)** — crude: it flags
  *discarded return values* as a side-effect proxy. *(verified — its docs:
  "when you call a function and don't use its return value, chances are high
  that it is being called for its side effect.")* High false-positive rate;
  no per-function purity declarations. Useful for a tight functional core,
  not a whole-app audit. Secondary at best.
- **A naming/suffix convention** (effect-suffix or `.pure`/`.impure`) costs
  nothing and is the cheapest documentation+audit signal. It is *convention*
  (leaky, per the render-coupling postmortem's own lesson) but it composes
  with the lint above to become enforced rather than advisory.

**Where does FULL Effect-TS earn its weight over this lighter stack?** Be
honest: **not on documentation or purity audit alone.** The lighter stack
gives you (a) `E`-channel + async documentation in the type (neverthrow /
`IO<T>`), (b) a *real* purity audit on plain code (`eslint-plugin-functional`
+ `.pure` overrides), and (c) the `R`/DI documentation you'd otherwise get
from Effect can be approximated by your existing service-singleton ACL plus
explicit interface params. Effect earns its weight when you need the things
the lighter stack *cannot* express:
- **Structured concurrency / fibers** — racing, fork/join, interruption
  with guaranteed finalizers. (LengYue's proxy WebSocket + range-query
  fan-out + adaptive-reevaluate streaming is the *one* place this could
  plausibly matter — concurrent in-flight analysis sub-queries with
  cancellation. If that orchestration is currently hand-rolled and fragile,
  Effect's `Fiber`/`Scope` is genuinely better than ad-hoc Promises. That is
  the *real* candidate use case, and it is concurrency, not documentation.)
- **Resource scoping (`Scope`) with guaranteed release** — which is *exactly*
  the frontend's "resource-ownership-at-mutation-sites" discipline
  (`closeBoard`/`resetWorkspace`). Effect's `Scope`/`acquireRelease` is the
  type-level enforcement of that discipline. **This is the most intriguing
  fit** — but note it is a *resource* benefit, not a documentation/purity
  one, and it is bounded to the subscription/ledger/timer ownership sites,
  not project-wide.
- **Retry/schedule/observability** combinators — relevant to the proxy
  client's reconnection/keep-alive, not to the SPA at large.

**Proportionality verdict (the adversarial core):** For *documentation +
purity audit*, the maintainer would be **paying a large runtime + paradigm
(and a v3→v4 migration on the horizon, and a per-call-site bridge tax, and a
new silent-`yield*` footgun) to obtain a documentation/audit benefit a
~3 KB library plus a maintained lint can largely deliver.** That is
disproportionate. Effect becomes proportionate *if and when* the proxy
concurrency/resource-scoping pressure (range fan-out, cancellation,
subscription lifetime) is reframed as the primary problem — at which point
its fiber/Scope machinery is the point, and the documentation/audit value
rides along for free. Adopting it *for* documentation, *hoping* the
concurrency value materializes later, inverts the cost/benefit: you pay the
big cost up front for the small benefit and bank on the big benefit arriving.

---

## Q3 — Coexistence with a future Vapor migration, and sequencing

### 3a. Effect ↔ Vue Composition API / `<script setup>` friction *(verified where possible; interop sparseness is itself a finding)*

Effect is render-model-orthogonal — it knows nothing about VDOM vs.
fine-grained, so in principle it coexists with both classic Vue and Vapor.
The friction is **lifecycle and the run-boundary**, not the render model:
- An `Effect` is a *description*; it does nothing until run. In a composable,
  you `Effect.runPromise` / `Effect.runFork` it (typically inside an
  `onMounted`, a `watch`, or an event handler). The result must be written
  back into a Vue `ref` to enter reactivity. So every Effect→Vue handoff is
  a `runFork`-then-`ref.value = result` seam. *(asserted from the Effect
  execution model + Vue composable model; consistent with Harbor's general
  "runPromise at every bridge" observation, but I found **no** canonical
  Effect+Vue integration guide — see below.)*
- **Cancellation/cleanup is the real interop care-point, and Vue gives you
  the seam for it.** A forked `Effect` returns a `Fiber` you must interrupt
  on teardown. Vue's **`onScopeDispose`** (and component `onUnmounted`) is
  the place to interrupt it — *"onScopeDispose() serves a similar
  functionality to onUnmounted(), but works for the current scope … to
  clean up side effects."* *(verified — Vue docs / effectScope RFC.)* This
  is *directly* in the spirit of the frontend's
  resource-ownership-at-mutation-sites discipline: a forked Effect is an
  external resource, and the composable that forks it owns interrupting it.
  So the interop pattern is clean *if* wired with the existing discipline —
  but it is **manual**; nothing automatic bridges Effect fibers to Vue scope
  teardown.
- **Finding: no established Effect+Vue bridge surfaced.** Across multiple
  targeted searches (Effect + Vue composable + runtime + onScopeDispose),
  **no canonical library, official guide, or widely-cited community pattern
  for Effect-in-Vue appeared** — the ecosystem evidence is dominated by
  Node/backend and React. *(verified-by-absence — flagged honestly per
  ADR-0002: I searched and did not find; that is information, not proof of
  impossibility.)* Practically: you would be authoring the Effect↔Vue
  interop conventions yourself, with no herd to follow. For a careful
  maintainer that is *doable* but it is bespoke-integration cost the Node/
  React adopters do not pay.

### 3b. Does Vapor change anything for Effect coexistence? — Essentially no *(verified facts, low-risk inference)*

Vapor changes *how the DOM updates* (per-binding, no VDOM, on the
`alien-signals` reactivity refactor). *(verified — Vue 3.6.0-beta.1 notes.)*
Effect lives *above* reactivity entirely — it produces values that you write
into refs/signals. Whether those refs drive a VDOM diff (classic) or a
fine-grained binding (Vapor) is invisible to Effect. **So Effect is equally
(in)compatible with both modes; Vapor neither helps nor hinders Effect
coexistence.** The one indirect interaction: Vapor's stated limitations
(`getCurrentInstance()` returns `null`; Options API unsupported; Suspense
unsupported in Vapor-only; custom-directive interface differs) *(verified)*
are Vue-internal and do not touch Effect, *except* that any Effect↔Vue
bridge you author must not rely on `getCurrentInstance()` if you want it to
work in Vapor components. Minor, and easily designed around.

### 3c. Vapor maturity/timeline, and what it implies for sequencing *(verified)*

- Vapor is **"100% opt-in,"** enabled per-component via a `vapor` attribute
  on `<script setup>`, **"still considered unstable"** despite being
  feature-complete, and **coexists with VDOM components via
  `vaporInteropPlugin`.** *(verified — Vue 3.6.0-beta.1 notes.)*
- Timeline (secondary, consistent across sources): beta through 2026, **Q4
  2026 possible stable**, 2027 "recommended default." *(verified — Vue
  School / community roundups; the *specific* quarters are secondary-source,
  the beta+unstable status is primary.)*
- Guidance: "Do not use it in production today unless … experimental."
  *(verified)*

**Sequencing conclusion.** Both Effect-v4 and Vapor are **simultaneously in
beta** right now. They are independent axes (Effect = effect-typing/runtime;
Vapor = render model) and could in principle be adopted in either order or
together — but adopting *both* large changes concurrently doubles the moving
foundation under a mid-sized SPA. The render-coupling consult already
established that **Vapor dissolves the reactivity-coupling class for free**,
which was the *only* reason reactivity ever entered the Effect conversation.
Since the maintainer has explicitly *dropped* the reactivity motivation,
**there is no sequencing dependency between Effect and Vapor at all** — they
solve disjoint problems. That decoupling is itself the answer: **don't let
the Vapor timeline drive the Effect decision in either direction.** Decide
Effect purely on the documentation/purity/concurrency merits (Q1–Q2), and
decide Vapor purely on the perf/render merits, on their own clocks.

If anything, the prudent ordering is: (1) adopt the **lighter
documentation+audit stack now** (no foundation risk, immediate value,
reversible); (2) let **Vapor stabilize** and migrate the perf-sensitive
subtrees when it ships stable (independent of Effect); (3) revisit **full
Effect** only when a concrete concurrency/resource-scope problem (proxy
fan-out/cancellation) makes its heavy machinery the point — and by then v4
will likely be stable, removing the v3→v4 migration overhang.

---

## Synthesis — recommendation framed to the maintainer's actual goals

1. **Decline full project-wide Effect-TS *for the stated goals*
   (documentation + purity audit).** It over-delivers on documentation at a
   disproportionate paradigm/runtime/bridge cost, under-delivers on the
   purity-*audit* goal specifically (it documents impurity once lifted but
   does not *find* impure-mixed plain functions), carries a v3→v4 migration
   overhang, introduces a new silent-`yield*` footgun at odds with the
   fail-loudly ethos, and has no trodden Vue-SPA interop path.

2. **Adopt a lighter three-part stack that hits both goals:**
   - *Documentation (effects in signatures):* `neverthrow` `Result/ResultAsync`
     at the service ACL (`backend-service.ts`, proxy client, persistence) —
     or, even lighter and more in-character, a thin branded `IO<T>`/`Task<T>`
     deferred-effect type. Documents the `E` (error) and async channels in
     the signature, ~3 KB, stable, incremental at the function level.
   - *Purity audit (finds smells on plain code):* `eslint-plugin-functional`
     (actively maintained, v9.0.5 2026-05) scoped via ESLint `overrides` to
     a **`.pure.ts` suffix** or an ADR-0003-style "pure" band — borrowing the
     *idea* of the unmaintained `eslint-plugin-functional-core` on a
     maintained substrate. This *finds* functions that mix pure and impure
     work, which Effect's own tooling does not.
   - *Spine:* keep the existing ADR-0002 fail-loudly + ACL discipline; the
     above are strict-adds, not replacements.

3. **Hold full Effect-TS in reserve for a *specific* future trigger:** a
   genuine structured-concurrency / resource-scoping need — most plausibly
   the proxy WebSocket fan-out, range-query cancellation, and subscription
   lifetime (which already has a hand-rolled
   resource-ownership-at-mutation-sites discipline that Effect's `Scope`/
   `acquireRelease` would formalize). That is where the fiber/Scope/Schedule
   machinery stops being over-powered and the documentation value rides along
   for free. Revisit when that pressure is concrete; by then v4 should be
   stable.

4. **Decouple the decision from Vapor entirely.** Effect and Vapor solve
   disjoint problems; with the reactivity motivation dropped there is no
   sequencing dependency. Decide each on its own merits and clock.

The throughline: the maintainer's *primary ethos* (type sanity / typing as
documentation) is fully served by the lighter stack; the *secondary goal*
(purity audit) is served *better* by a plain-code lint than by Effect; and
the heavy Effect machinery is justified by *concurrency/resource* needs the
stated goals do not (yet) include. Buying the runtime to get the type-row is
the proportionality error to avoid.

---

## Verification status of every load-bearing claim

**Verified by primary source (npm registry / official release notes / issue
tracker / project README):**
- `effect` dist-tags: `latest 3.21.2`, `beta 4.0.0-beta.74`, 436 versions —
  npm registry `registry.npmjs.org/effect`.
- Effect 3.0 stability + semver commitment ("Effect is finally stable!", "5
  years … 3+ years of production usage", major=breaking / minor=features /
  patch=fixes, "We do not expect new major releases in the near future") —
  [effect.website/blog/releases/effect/30/](https://effect.website/blog/releases/effect/30/).
- Effect v4 beta facts (2026-04-18; "Complete rewrite of the core fiber
  runtime"; "70 kB in v3 to about 20 kB in v4"; unified package system;
  `effect/unstable/*`; "core programming model … remains the same"; beta,
  not production-recommended) —
  [InfoQ, 2026-04](https://www.infoq.com/news/2026/04/effect-v4-beta/).
- `@effect/eslint-plugin` v0.3.2 ships only `dprint` +
  `no-import-from-barrel-package` (no purity/side-effect rule) — npm
  registry + GitHub `Effect-TS/eslint-plugin/src/rules` listing.
- `@effect/language-service` diagnostics (`floatingEffect`,
  `missingStarInYieldEffectGen`, `missingReturnYieldStar`,
  `leakingRequirements`, `missingEffectContext`, `effectInVoidSuccess`,
  `globalConsoleInEffect`) and "target Effect-specific constructs … not
  plain TypeScript" —
  [language-service README](https://github.com/Effect-TS/language-service/blob/main/README.md).
- `yield*` footgun is silent / compiler-unwarned —
  [Effect-TS/website#972](https://github.com/Effect-TS/website/issues/972)
  + the existence of the dedicated LSP diagnostics to catch it.
- `neverthrow` v8.2.0, last publish 2025-02, 63 versions — npm registry.
- `fp-ts` v2.16.11, last publish 2025-08 (maintenance; Effect's predecessor)
  — npm registry + pkgpulse/Medium "successor to fp-ts" framing.
- `eslint-plugin-functional` v9.0.5, last publish 2026-05-20 (actively
  maintained) — npm registry.
- `eslint-plugin-functional-core` v1.7.1, last publish 2023-09-21
  (effectively unmaintained); `.pure` suffix convention — npm registry +
  [npm page](https://www.npmjs.com/package/eslint-plugin-functional-core).
- Vue 3.6 Vapor: "100% opt-in", `vapor` attribute, "still considered
  unstable", `alien-signals` reactivity refactor, `vaporInteropPlugin`
  coexistence, Suspense/Options-API/`getCurrentInstance()` limitations —
  [vuejs/core v3.6.0-beta.1](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1).
- Vue `onScopeDispose` ~ `onUnmounted` for scope-level cleanup —
  [vuejs/rfcs 0041 effect-scope](https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md)
  + [Vue composables docs](https://vuejs.org/guide/reusability/composables).

**Verified by credible secondary source (consistent, but not a single
primary sentence):**
- npm weekly downloads (neverthrow ~500K, Effect ~300K, oxide.ts ~20K) and
  bundle sizes (neverthrow ~3 KB, Effect ~50 KB+, oxide.ts ~2 KB); "greenfield
  vs existing codebase" download skew; "neverthrow for existing project
  incrementally / Effect for greenfield from scratch" —
  [pkgpulse 2026 guide](https://www.pkgpulse.com/guides/neverthrow-vs-effect-ts-vs-oxide-ts-result-types-2026).
- Effect's DI as "typed service registry … third type parameter
  Effect<Success, Error, Dependencies>" — pkgpulse / neverthrow comparison.
- Harbor's ecosystem-bridge critique ("Node ecosystem built on
  reject/throw", "constant unwrapping and re-throwing", "runSync/runPromise
  at every ecosystem bridge point", hiring/onboarding cost) + their explicit
  concession to FP's value —
  [runharbor.com](https://runharbor.com/blog/2025-11-24-why-we-dont-use-effect-ts).
- Adopter testimony on effect-as-documentation and partial-adoption
  ("I can see at a glance what my function does and what can go wrong";
  "I decided to use Effect-ts for validation and error handling") —
  [dnlytras.com/blog/effect-ts](https://dnlytras.com/blog/effect-ts).
- Named adopters (Warp, Fiberplane, Val Town, Betalyra, coteach.ai, Embedded
  Insurance) — Effect "This Week in Effect" posts + InfoQ; individually
  surfaced, skew backend/AI-native/startup.
- Vapor timeline quarters (beta 2026, Q4-2026 possible stable, 2027 default)
  — Vue School / community roundups (the beta+unstable *status* is primary;
  the *quarters* are secondary).
- Effect official "scope Effect to parts of your app or even single
  functions" partial-adoption framing — Effect intro/marketing surface.

**Asserted from reasoning / verified-by-absence (flagged honestly):**
- The Effect↔Vue interop pattern (run via `runFork` in `onMounted`/`watch`,
  write result into a `ref`, interrupt the `Fiber` in `onScopeDispose`) is
  *reasoned from* Effect's execution model + Vue's lifecycle, not quoted from
  a canonical guide — **because no canonical Effect+Vue guide was found**
  across multiple targeted searches. The *absence* of an established bridge
  is the verified-by-absence finding; the specific pattern is my construction.
- The proxy-fan-out/cancellation as Effect's *real* earn-its-weight use case
  is an inference from the umbrella CLAUDE.md's description of the proxy's
  adaptive-reevaluate / range-query / WebSocket fan-out behavior, not a
  benchmarked claim. It is the most defensible *candidate*, offered as such.
- The "buying the runtime to get the type-row" proportionality framing is an
  analytic judgment, not a citation.

---

## Appendix — verbatim prompt used to elicit this consult

Added 2026-05-29 at the maintainer's request, for reproducibility (repo-root
paths normalized to repo-relative). The exact brief given to the follow-up
firewall agent (Opus 4.8, independent, web-enabled):

````text
You are providing a follow-up "analytic firewall" second opinion for the maintainer of a Vue 3 + TypeScript SPA. Reason independently; be adversarial where warranted; use web search/fetch for empirical claims and cite verifiable URLs, flagging clearly what you verified vs. asserted from general knowledge. Your verbatim output will be saved as a follow-up consult record, so make it self-contained and well-structured.

## Continuity (read these first, for context — do not anchor on their conclusions)
- Prior firewall consult (your predecessor's findings): `docs/notes/opus-consult-2026-05-29-render-coupling-typing.md`. Key prior conclusions you can take as established: (i) a render-coupling anti-pattern exists in this app (composition components reading high-frequency reactive state in their render couple a whole subtree's re-render); (ii) TypeScript's type-CHECKER can't detect it but a typed CONTRACT (accessors `() => T`) can dissolve it; (iii) Vue's Vapor Mode / Vue 3.6 (fine-grained, alien-signals) makes the class structurally obsolete.
- The postmortem the maintainer is iterating on: `docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`.

## The new question
The maintainer is weighing whether to adopt **Effect-TS** (the `effect` library, effect.website) **project-wide**, and has CLARIFIED the motivation — this reframes everything, so calibrate to it:

- The motivation is **NOT primarily to fix the Vue reactivity coupling.** He explicitly accepts that Effect-TS may not be ergonomic for Vue reactivity, and that's fine — under Vapor that benefit fades anyway. **Do not spend effort on "can Effect-TS model Vue reactive reads."**
- **PRIMARY value sought:** effectful typing as **documentation** for *reasonable effectful computations generally* — errors, async, dependencies/DI, IO/resource — made explicit in type signatures.
- **SECONDARY named goal:** using the effect-typed surface to **audit pure-vs-impure code smells** — surfacing functions/methods that shouldn't do both pure and impure work.

The maintainer has a Haskell / formal-methods background; effect-system concepts (IO monad, algebraic effects, row-typed effects) are familiar — calibrate the depth accordingly. The project's stated primary ethos is "type sanity / comprehensive typing as documentation," so Motivation B is in-character, not a tangent.

Research and answer THREE sharpened questions, each with verifiable citations:

### Q1 — Effect-TS maturity + incremental-adoption viability
Current maturity / API stability / churn / ecosystem health / production track record of Effect-TS **as of now** (check version, release cadence, notable adopters, whether the API is still moving). Crucially: **can it be adopted incrementally** in an existing mid-sized Vue 3 + TS SPA — effectful boundaries first (HTTP/API client, WebSocket, persistence, services) — interoperating with plain TS and the Vue Composition API, WITHOUT an all-or-nothing rewrite? What does a realistic gradual-adoption path, learning curve, and blast radius look like? Cite docs/issues/adopter reports.

### Q2 — Documentation + purity-audit fit (the maintainer's actual goal), and proportionality
Setting reactivity aside: (a) How well does Effect-TS serve as typed in-signature documentation of effectful computation (errors `E`, requirements `R`, async, resource)? (b) Does its `Effect`-typed surface actually help **audit pure-vs-impure boundaries** — i.e., does adopting it make "this function mixes pure and effectful work" visible/lintable, flagging functions that shouldn't do both? Is there established practice/tooling for that purity-audit use? (c) ADVERSARIAL: are there **lighter alternatives** that achieve the documentation + purity-audit goals at materially lower cost — e.g., `neverthrow` (typed errors), `fp-ts`, `eslint-plugin-functional` or a custom purity lint, effect-suffix naming conventions, or a thin `IO<T>`/branded-impure wrapper? Where does the full Effect-TS paradigm *earn its weight* over those, given the maintainer's specific goals (documentation + purity audit, NOT the broader concurrency/fiber/scheduling machinery Effect-TS is famous for)? Be honest about whether the maintainer would be paying for a large runtime + paradigm to get a documentation/audit benefit a lighter tool could give.

### Q3 — Coexistence with a future Vapor migration, and sequencing
Effect-TS is render-model-orthogonal, but verify: any known friction between Effect-TS patterns and Vue SFCs / Composition API / `<script setup>` (e.g., running `Effect` programs from composables, lifecycle, reactivity interop pitfalls)? Does Vapor Mode change anything relevant to Effect-TS coexistence? Plus Vapor's current maturity/timeline — does it argue for adopting Effect-TS now, or sequencing the two (and in which order)?

## Deliverable
An independent, citeable, self-contained assessment answering Q1–Q3, with an explicit bottom-line recommendation framed around the maintainer's actual goals (documentation + purity audit), including the adversarial "is Effect-TS proportionate, or is a lighter tool the better fit" verdict. Structured prose with headers; saveable verbatim. Mark verified-vs-asserted throughout.
````
