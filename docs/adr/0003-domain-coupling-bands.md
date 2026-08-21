# ADR-0003: Domain-Coupling Bands

- **Status:** Accepted
- **Genre:** Bounded Context Map (structural-descriptive with prescriptive
  elements) — a third genre after the *decision* of ADR-0001 and the *tenet*
  of ADR-0002. Maps the domain coupling of a codebase and gives a principle
  for evaluating future changes against it.
- **Date:** 2026-06-15
- **Provenance:** Adapted from the LengYue ADR corpus. LengYue's ADR-0003
  mapped a Vue frontend's coupling to the game of Go, with a "what would a
  Chess port require?" principle. [chocofarm](../../GLOSSARY.md#omega-and-chocofarm) has no frontend and is not a Go
  client, so the instance map does not transfer — but the *structure* of the
  decision does: name the bands of coupling, give a forward-looking question
  that forces honest separation of abstraction from instance, and refuse to
  extract abstractions before a second concrete consumer exists. The bands
  were re-derived for chocofarm's actual axes: how tightly each module is
  coupled to FFXIII-the-game, to the operations-research machinery, and to
  the simulation/solver seam. That worked chocofarm band map, and the
  original FFXIII-specific Context narrative, now live in
  [`history/0003-band-map-and-instance-context.md`](history/0003-band-map-and-instance-context.md)
  (this field is left as the dated fact of where the ADR's *structure* came
  from, not as an instruction to re-derive chocofarm's answer).
- **Scope:** Any codebase where domain-specific instance facts (a particular
  game, a particular customer, a particular hardware target) are mixed with
  domain-general problem-class machinery (an algorithm family, a protocol, a
  solver). Cross-references whatever injected-seam / port-based
  inversion-of-control the adopting project protects as its own load-bearing
  boundary (chocofarm's instance of that boundary is the env/Policy seam,
  ADR-0001).

*Refactored for cross-project portability on 2026-07-13 under
[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../design/MAINT-ADR-PORTABILITY-SPEC.md)
(tracker `adr-portability-refactor`,
maintainer-ratified 2026-07-13). The pre-refactor text stands verbatim at
commit `ff691bb9bc430ad497d74ff82d580f758a969f99`; extracted records live in
[`history/`](history/0003-band-map-and-instance-context.md) and are not
retro-edited. Dated amendments below are preserved verbatim from the
original (this ADR carries none as of the pre-refactor text).*

## Context

A codebase built around one domain-specific instance of a general problem
often mixes two things that are logically distinct: **instance facts** (a
particular game's geometry, a particular customer's constraints, a
particular hardware target's registers) and **problem-class machinery** (a
solver family, a belief-update algorithm, a protocol). The two live glued
together in the same tree, and the glue is rarely uniform — some modules are
pure instance detail, some are pure problem-class logic, and some straddle
both.

Two prospective futures make this coupling worth mapping honestly, whatever
the domain:

1. **A different instance of the same problem class** (the algorithm/solver
   machinery stays; the instance data changes). What survives is the
   problem-class machinery; what is replaced is the instance data and its
   domain-specific encoding.
2. **A different domain with the same problem shape** (a new "game," a new
   customer, a new target — but the underlying problem class is unchanged).
   What survives is the same machinery, seen from the other direction; what
   is replaced is the domain-facing instance layer.

Without a map, a new feature can't be honestly designed against the boundary
between "this is instance fact" and "this is problem-class logic" — and
without a principle for drawing that boundary at authoring time, a map by
itself is just inventory, decaying the moment the code moves.

> **Extracted record — the chocofarm instance narrative**
> ([relocated verbatim to `history/0003-band-map-and-instance-context.md`](history/0003-band-map-and-instance-context.md)):
> this ADR's own worked instance is chocofarm, a project computing optimal
> resource-gathering routes in a specific game, formalized as adaptive
> stochastic orienteering under partial observation (a belief-state MDP). The
> two "prospective futures" above were originally posed as "a different OR
> problem" (a different game entirely — the belief mechanics, the Dinkelbach
> loop, the solvers, and the AlphaZero stack are all problem-class machinery
> that would survive unchanged) and "a different game with the same OR shape"
> (the game-specific coordinates and teleports would be replaced; the OR
> machinery and the env/Policy seam would survive). A deployment adopting this
> ADR re-derives its own version of this narrative from its own instance and
> problem class — the shape of the question transfers; the specific answer
> does not.

## Decision

**Document the current domain coupling of the codebase as a small set of
bands, and adopt a single forward-looking principle for evaluating new
modules against it. Do not preemptively extract abstractions; do design new
modules so the seam is clean.**

The principle, stated plainly:

> When writing a new module, ask: **"what would change if the domain
> instance were different but the problem class were the same? And what
> would change if the problem class were different but solved by the same
> machinery?"** Not because a second instance exists, but because the two
> questions force honest separation between the domain instance, the
> problem-class abstraction, and the solver-agnostic seam. If the answer to
> the first is "everything in this module," the module is instance-bound —
> isolate it so a different domain instance could replace it wholesale. If
> the answer to both is "nothing," the module is solver-agnostic — name its
> concepts for the problem class, not the instance. If the answer is "some of
> it," that is the seam; design it deliberately, even if you don't extract an
> abstraction today.

This is a design discipline at authoring time, not an extraction mandate.
Existing code stays put; new code is written with the seam in mind.

## Bands — a template for adopters

A deployment applying this ADR derives its **own** band map by applying the
two-question principle to its own codebase — this document does not hand one
down. This ADR's own worked instance produced one answer, kept as a worked
example rather than prescribed here: three bands (a solver-agnostic
seam-machinery band; a problem-class-general machinery band; an
instance-bound facts band) plus a named "band-mixed" category for modules
that straddle two bands at once, and two porting inventories sizing what a
different-instance port and a different-domain port would each require.

> **Extracted record — the chocofarm band map**
> ([relocated verbatim to `history/0003-band-map-and-instance-context.md`](history/0003-band-map-and-instance-context.md)):
> three bands — Band 1 (solver-agnostic: the env/Policy inversion-of-control
> seam, the single hardest architectural decision in the source project, made
> right); Band 2 (OR-general: belief mechanics, the Dinkelbach renewal-rate
> loop, the orienteering/routing machinery, the AlphaZero/Gumbel stack, the
> provable dual bound — all phrased over the problem class, never over a named
> game fact); Band 3 (instance-bound: the instance data, the detector
> geometry, the instance-loading tooling) — plus a Band-mixed category for
> modules straddling two bands (the environment object itself; the
> feature/action encoding whose layout is *derived from*, but not textually
> bound to, the instance). The two porting inventories size a
> different-problem port (replace Band 3, keep Bands 1–2 parameterized)
> against a different-domain port (replace only Band 3's instance data and
> geometry, keep Bands 1–2 entirely) — the two mirror-image partitions the
> two-question principle predicts. Applying the same discipline to a new
> codebase typically produces an analogous multi-band split, but the number
> and boundaries of the bands are discovered by asking the two questions
> against the actual code, not copied from this record.

## Consequences

### Positive

- **New modules are evaluated against the boundary at design time.** The two
  questions are fast to ask and clarify the shape of new code (an
  instance-bound fact goes in the instance band and is isolated; a
  problem-class concept goes in the problem-class band and is named for the
  class, not the instance).
- **Auditability of coupling.** A future maintainer (or a port adopter) has
  a band map as a starting point, once one is drawn for the codebase at
  hand.
- **Explicit seams without premature extraction.** New work can get the
  right shape (isolated from the instance, or named for the problem class)
  without paying for an abstraction nobody needs yet.

### Negative

- **The principle is policy, not mechanism.** A contributor who doesn't ask
  the question won't have a tool catch them. Like ADR-0002, the discipline
  lives in review. (A sibling project may run its own band-conformance CI
  check; that would be the mechanization trigger — ADR-0011 Rule 1 — for
  whichever deployment adopts one.)
- **The inventory will drift.** As modules change, their band assignments may
  shift. A band map should carry band *definitions* (which drift slowly),
  not a per-file tag list (which rots) — a per-module coupling audit is the
  point-in-time evidence, distinct from the map itself.

### Neutral

- **No code change today.** This ADR documents a discipline for future
  structure. Existing code is not refactored against it.

## Revisit when…

1. **A second concrete instance materializes** (a different problem, or a
   different domain with the same shape). At that point, extraction stops
   being premature — the second use case is the trigger that flips the
   cost-benefit, and a band map becomes the natural set of extraction points.
2. **The instance data and the machinery drift apart.** If a problem-class-
   general module accretes instance-specific facts (a hardcoded name, a
   domain-specific literal), the band boundary has leaked; that is the
   canary a band map exists to catch.
3. **A band classification turns out wrong in practice.** E.g. if a module
   thought problem-class-general turns out to be far more instance-coupled
   once examined, the band moves and the principle's application to it
   changes.
4. **The two-question thought experiment stops being useful.** If a project
   commits to a single instance forever, the principle relaxes — though even
   then, the seam-design discipline produces better code, so it is worth
   retaining as a heuristic.

## Related

- **[ADR-0001 (immutability and copy-on-write)](0001-immutability-and-copy-on-write.md).**
  The same philosophy — declarations match actual behavior, no aspirational
  structure — applied to whatever scenario/restriction seam keeps
  problem-class-general machinery sharable across instance changes.
- **[ADR-0002 (fail loudly)](0002-fail-loudly.md).** An instance-boundary
  config validation (a seam/problem-class-general surface) fails loud at the
  instance boundary; an instance change that produces a malformed value is
  caught there.
- **[ADR-0011 (mechanization discipline)](0011-mechanization-discipline.md).**
  A band-conformance check would be this ADR's mechanization; its absence is
  a declared review-only enforcement surface, not an oversight.

## Not goals (explicit)

- **Not a refactoring mandate.** Existing code stays put.
- **Not an abstraction-extraction roadmap.** No ports are being declared or
  planned by this document itself. A deployment designs its own seams; this
  ADR does not extract abstractions for it.
- **Not a portability promise.** Adopting this discipline is not a
  commitment to ever ship a different instance. The discipline produces
  better code even in a single-instance-forever future, which is the actual
  justification.

## License

Public Domain (The Unlicense).

<!-- doc-attest-exempt: mechanical, content-preserving edit (usability review, ledger row 1180, 2026-07-23, finding 16) -- the single existing word "chocofarm" at its first plain-text mention in this file was wrapped in a markdown link to GLOSSARY.md#omega-and-chocofarm (the Stand-Alone Principle's own first-use-link requirement, GLOSSARY.md#stand-alone-principle, applied here for the first time). No other character in this file changed; the rule content this ADR states is untouched. This mechanical class of edit is authorized by the maintainer's vested-judgment commission for this round (ledger row 1180), not a semantic change to law/ requiring further ceremony. Removal condition: strike this marker and run the real A:B:C loop next time this file is touched for its actual rule content, not just a link wrap. -->
