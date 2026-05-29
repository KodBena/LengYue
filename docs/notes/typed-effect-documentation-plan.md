# Typed-Effect Documentation Stack — Design Note

- **Status:** `design-note: planning`. Pre-implementation. No code
  has been written; this note records a *settled decision* about
  what will be adopted and what was declined, ahead of the
  implementation arc. The arc is **deferred** until the current
  analysis-panel refactor / performance work completes (see §6).
- **Genre.** Architectural-decision-and-roadmap note. It records
  the maintainer's decision, after two independent firewall
  consults, on whether and how to make effectful computation
  legible in type signatures across the frontend — and the
  proportionality reasoning behind declining the heaviest option.
- **Date:** 2026-05-29.
- **Scope:** `frontend/` only. The stack is a strict-add over the
  existing ACL + ADR-0002 discipline; it changes no wire contract
  and no `src/` file as of this note.
- **Author audience.** A future implementer picking up the arc once
  the perf work clears, or a future reader reconstructing *why* the
  frontend adopted a light typed-effect-documentation stack rather
  than full Effect-TS, and why Effect-TS is held in reserve rather
  than rejected.

---

## 1. The decision, in one paragraph

Adopt a **lighter typed-effect-documentation stack** — not full
Effect-TS — to make errors / async / effects legible in service-ACL
signatures, backed by a purity-audit lint. Full Effect-TS is
**declined for the stated goals on proportionality and sequencing
grounds** (§5), and **held in reserve** for a genuine
concurrency / resource-scoping need (§5, the RB-3 trigger). The arc
is **deferred** until the analysis-panel refactor / perf arc
completes (§6). The motivation is effectful-computation
documentation and purity audit *generally*; the Vue render-coupling
reactivity concern is incidental and separately addressed (§7).

## 2. The three-part stack

The stack has three parts, all **strict-adds** over the existing
spine — none replaces the ADR-0002 fail-loudly discipline or the
ACL boundary.

**(a) Typed-effect documentation at the service ACL.** Either
`neverthrow` (`Result<T, E>` / `ResultAsync<T, E>`) *or* a thin
branded `IO<T>` / `Task<T>` wrapper, applied at the service ACL, so
errors / async / effects are documented in the signature rather than
read out of the implementation. Both candidates document the error
channel and the async-ness in the type; the thin branded wrapper is
the lighter, more in-character expression (it composes with the
existing branded-type discipline and is honest about being a
documentation device, not a runtime). Which of the two, and which
ACL boundaries get it first, is open (§8).

**(b) Purity-audit backstop.** `eslint-plugin-functional` scoped via
ESLint `overrides` to a **`.pure`-suffix convention** (or an
ADR-0003-style "pure" band). The lint operates on *plain* TypeScript
— it is what *finds* functions that mix pure and impure work.

**(c) The existing spine, kept.** ADR-0002 (fail-loudly) and the ACL
boundary at `src/services/backend-service.ts` remain the discipline
the above two sit on top of.

## 3. The audit model (the load-bearing idea)

The purity-audit value comes from a Haskell-`IO`-flavoured
inversion: **when effectful computation is *universally* marked, the
*absence* of the mark is the audit flag.** An effectful-but-unmarked
function is conspicuous against the marked norm — exactly as an
`IO`-performing function with a non-`IO` type would be conspicuous in
Haskell.

The critical caveat the maintainer himself flagged ("ostensibly"):
**TypeScript does *not* enforce the norm the way GHC does.** Nothing
in the type-checker stops an effect inside a plainly-typed function;
a function can read `Date.now()`, mutate a module cache, and do pure
arithmetic while presenting a pure-looking signature, and the
compiler is silent. So the norm is **convention-enforced**, and part
(b)'s lint — which operates on *plain* code — is the **enforcement
backstop** that turns "ostensibly marked" into "actually caught."

This caveat is also why the light stack *suffices* over full
Effect-TS for the purity-audit goal specifically: Effect-TS makes
impurity visible in the type *once a computation has already been
lifted into `Effect`*, but its tooling audits only *within* the
Effect paradigm — it does not *find* impure-mixed plain functions,
because to Effect those are just untyped TypeScript it never looks
at. Even full Effect-TS would not provide the catch part (b) does.
The detailed substantiation is the follow-up consult, §2b
("does Effect help *audit* pure-vs-impure boundaries? — PARTIAL").

## 4. Why a typed contract, not just convention

The render-coupling typing consult established the general distinction
this stack rests on: the TypeScript *checker* cannot *detect* an
operational property, but a typed *contract* can make the wrong shape
*loud at the boundary* and the right shape the default. The same
distinction applies here — a marked-effect signature does not let the
checker *enforce* purity, but it makes the convention legible and
gives the lint (part b) a stable surface to police. That consult's
relationship to this note: it is the prior firewall second-opinion on
whether typing can prevent the render-coupling class, and it is the
note from which the present arc's "effect-typed signatures as
documentation" framing was clarified and separated from reactivity
(see the follow-up consult's continuity header).

## 5. Why full Effect-TS was declined — and held in reserve

The decline is on **proportionality** and **sequencing**, *not* on a
"don't fight the framework / idiomatic Vue passes values" framing
(that framing was explicitly rejected by the maintainer and is not
his reasoning).

**Proportionality.** The lighter stack achieves the documentation +
purity-audit goals without buying Effect's fiber / scheduler / runtime
machinery. Effect's `Effect<Success, Error, Requirements>` row *is*
effect-as-documentation and over-delivers on documentation — but
adopting it *for documentation* means paying for the whole runtime to
obtain a type-row, when a thin wrapper plus a maintained lint largely
deliver the same documentation + audit value. The detailed
adversarial substantiation is the follow-up consult's §2c
("proportionality verdict").

**Sequencing.** Effect v4 is mid-beta (a rewritten runtime; the
production line is still v3), and Vue's Vapor Mode is itself beta with
a stable target around Q4-2026. Adopting Effect now would put two
moving foundations under a mid-sized SPA at once. The light stack
carries no foundation risk, is reversible, and delivers immediately.

**Held in reserve, not rejected forever.** The one place full
Effect-TS would *earn its weight* is a genuine concurrency /
resource-scoping need — most plausibly the proxy WebSocket fan-out,
range-query cancellation, and subscription-lifetime surface (the
queued **RB-3** packet-receive-path arc named in the regime-B perf
audit). That surface already carries the hand-rolled
resource-ownership-at-mutation-sites discipline (the worked examples
are `closeBoard` / `resetWorkspace` in `src/store/index.ts`) that
Effect's `Scope` / `acquireRelease` / fiber-interruption would
formalize. **This is the revisit trigger:** when the RB-3 concurrency /
cancellation / subscription-lifetime pressure is concrete, re-evaluate
full Effect-TS — at which point the fiber/Scope machinery is the
point and the documentation value rides along for free, and v4 will
likely have stabilized. The detailed candidate-use-case reasoning is
the follow-up consult's "where does FULL Effect-TS earn its weight"
subsection of §2c, offered there as the most defensible candidate
rather than a benchmarked claim.

## 5b. Forward-compatibility — the light stack is a precursor to Effect-TS, not a dead-end

*(Added 2026-05-29 at the maintainer's request, elaborating §5's "held
in reserve." This records the case for why adopting the light stack now
keeps full Effect-TS cheap to reach later; it does not revise the §5
decision.)*

"Stacking Effect-TS on top of the light stack" is the wrong mental model:
Effect does not layer over `neverthrow` / branded `IO<T>` — it **replaces**
the wrapper. The right model is a **migration**, and the light stack is a
**forward-compatible precursor** to it, for four reasons:

1. **The hard part of an Effect migration is lifting effects into a marked
   wrapper at the boundaries — which is exactly what the light stack
   does.** Going light-stack → Effect is "swap the wrapper type and adapt
   the combinators"; going plain-TS → Effect is "discover and lift every
   effect from scratch." The first hop pays down the bulk of the second.
   Adopting the light stack now makes a later Effect migration *easier*,
   not harder.
2. **The type-level mapping is mechanical.** `Result<T, E>` /
   `ResultAsync<T, E>` correspond to `Effect<T, E, never>`; a branded
   `IO<T>` / `Task<T>` thunk lifts via `Effect.sync` / `Effect.promise`.
   The error channel and async-ness the light stack already documents are
   the same channels Effect carries.
3. **The purity-audit backstop (§2b) is orthogonal and survives the
   migration untouched.** It operates on *plain* TypeScript to *find*
   impure-mixed functions; §3 already establishes Effect would not replace
   it. So part (b) is forward-compatible by independence.
4. **The discipline is paradigm-portable.** "Mark every effect at the
   boundary; the absence of a mark is the audit flag" (§3) holds whether
   the mark is `Result`, `IO`, or `Effect`. The codebase's training —
   authors lift effects at the ACL — carries over wholesale; only the
   mark's underlying type changes.

**Refinement to §8 Q2 (neverthrow vs. branded wrapper).** If
forward-compatibility to Effect is weighted, the **branded `IO<T>` /
`Task<T>` wrapper is marginally the more forward-compatible** choice: it
is the project's own thin type, so the migration surface is a handful of
adapters under the maintainer's control, versus unwinding `neverthrow`'s
`.map` / `.andThen` / `.match` chains into Effect's `pipe` /
`Effect.flatMap`. A tie-breaker, not a decisive factor — both are
forward-compatible.

**Net (the low-regret framing).** The light stack delivers the
documentation + purity-audit value immediately and carries no foundation
risk (§5 sequencing). The *only* cost of adopting it before Effect — a
swap-and-adapt migration — is paid **only if RB-3 proves the Effect
runtime (fiber / `Scope` / interruption) is actually needed**, which is
precisely the §5 reserve trigger RB-3 is sequenced to reveal (§6). If
RB-3's concurrency turns out to be served by a lighter `AbortController` +
chunking scheduler, the light stack simply stays and the migration is
never paid. Neither branch is foreclosed by adopting the light stack now.

## 6. The deferral and its sequencing rationale

The arc is **deferred until the current analysis-panel refactor /
performance arc completes.** The reasoning:

- The light stack is a strict-add with no foundation risk, so there
  is no cost to waiting — nothing about the perf arc gets harder by
  deferring it, and nothing about the typed-effect stack unblocks the
  perf arc.
- The active perf arc (regime-B RB-2 chart-update coalescing, owned
  by the analysis-panel refactor; RB-3 packet-receive-path chunking)
  is where the maintainer's frontend attention is committed; opening a
  cross-cutting authoring-discipline arc in parallel would compete for
  the same review bandwidth without a forcing reason.
- The RB-3 arc is *also* the natural place to discover whether the
  reserve trigger (§5) has fired. Sequencing the typed-effect arc
  after the perf arc means the concurrency / resource-scoping question
  is answered with real RB-3 context in hand, rather than guessed at
  in advance.

## 7. Relationship to the reactivity concern (don't conflate)

This arc is about **effectful-computation documentation + purity audit
generally** — errors, async, IO/resource made explicit in signatures,
and a lint that finds pure/impure mixing. It is **not** a fix for the
Vue render-coupling-at-composition-nodes class. That concern is
incidental here and is separately addressed: operationally by the
postmortem's named-convention / accessor-contract / profiling levers,
and structurally by Vue's Vapor Mode (fine-grained reactivity), which
makes the class obsolete by construction. The render-coupling
postmortem is the note that scopes that problem and its option space;
the effect-typing thread was explicitly *separated* from reactivity
when the maintainer clarified the motivation (see the follow-up
consult's "clarified motivation" header). The two should not be
collapsed into one arc.

## 8. Open questions (deferred to implementation time)

1. **Which ACL boundaries get the typed-effect treatment first.**
   The service ACL at `src/services/backend-service.ts`, the proxy
   WebSocket client, and the debounced persistence layer are the
   candidate boundaries; which is the first beachhead is unsettled.
2. **`neverthrow` vs. a thin branded `IO<T>` / `Task<T>`.** The
   trade is ecosystem-maturity-and-ergonomics (neverthrow) against
   minimalism-and-in-character-fit (the branded wrapper). Pick at
   implementation time; the choice is reversible.
3. **Purity-marking mechanism: `.pure` suffix vs. ADR-0003-style
   "pure" band vs. ESLint `overrides` scoping.** These are not
   mutually exclusive (a suffix *is* how `overrides` would scope the
   lint); the open question is which convention is the canonical
   handle and how it relates to the existing ADR-0003 band tags.
4. **The exact `eslint-plugin-functional` ruleset.** `Recommended`
   vs. `Strict`, and which rules are scoped to `.pure` regions vs.
   applied codebase-wide, is unsettled.
5. **Migration order.** Whether the documentation layer (part a) or
   the audit lint (part b) lands first, and whether the first ACL
   boundary and the first `.pure` region ship in the same PR.
6. **The precise revisit trigger for full Effect-TS.** §5 names the
   RB-3 concurrency / cancellation / subscription-lifetime surface as
   the candidate; the precise condition that flips the decision (and
   how it relates to RB-3's own scoping) firms up when RB-3 is picked
   up.

## 9. Cross-references

- `docs/notes/opus-consult-2026-05-29-effect-ts-adoption.md` — the
  follow-up firewall consult that this note's decision adopts. It is
  the independent second opinion on adopting Effect-TS project-wide
  for documentation + purity-audit value; this note is the record of
  the maintainer's resulting decision and its rationale.
- `docs/notes/opus-consult-2026-05-29-render-coupling-typing.md` — the
  predecessor firewall consult, on whether typing could prevent the
  render-coupling class. It is the note from which the effect-typing
  thread was clarified and separated from the reactivity concern; this
  note inherits the typed-checker-vs-typed-contract distinction it
  drew (§4).
- `docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`
  — the postmortem that scopes the render-coupling problem and its
  option space. It is the surface that §7 distinguishes this arc
  *from*; its larger-structural-directions section is where the
  effect-system-and-Vapor option space was first sketched before being
  split into the two firewall consults.
- `docs/TODO.md` — the regime-B perf entry whose RB-3 lever names the
  concurrency / resource-scoping surface that §5 holds Effect-TS in
  reserve for, and where this note's queued status is pointed at.
- ADR-0002 — fail-loudly; the spine the stack sits on (§2c), and the
  tenet the purity-audit-by-absence model (§3) is the documentation /
  audit-register analog of.
- ADR-0003 — the band vocabulary an "ADR-0003-style pure band" (§2b,
  §8) would extend or sit beside.
- ADR-0005 — the documentation discipline this note is authored under;
  its Rule 8 (sibling revisions over silent edits) governs the
  maintenance contract in §10.
- ADR-0006 — every new `src/` file the implementation arc adds carries
  the standard header.

## 10. Maintenance contract

This is `design-note: planning`. When the implementation arc opens,
the status line transitions (to `in-progress` or directly to
`implemented` per the arc's shape), and the arc's PR and worklog get
named here. If implementation reveals the decision is wrong in a
load-bearing way — for instance, if the purity lint proves too noisy
to be load-bearing, or if the reserve trigger fires sooner than §5
anticipates — file a sibling `design-note: revised` per ADR-0005
Rule 8 rather than silently editing this note; the planning-time
reasoning recorded here stays legible as the trace of *why* the light
stack was chosen.

## 11. License

Public Domain (The Unlicense).
