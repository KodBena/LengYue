# ADR-0016: The Service Contract Is an Enforcement Surface — a standing service's promise to a client is gated, not aspired to

*In plain words first: this ADR is for anyone who builds, reviews, or operates a **standing
service** — a long-running network service that a client depends on across requests, as
opposed to a one-shot script or batch job. It answers one question: what must be true of
such a service before it may claim to be ready for a client? Its rule is that no client
input can be allowed to crash, wedge, or corrupt a service that has advertised itself as
standing, and that promise is enforced by gates checked at build/test time, not left as an
aspiration reviewers hope held.*

- **Status:** **Accepted** — ratified by the maintainer 2026-07-03. Ratified
  *without* a Fable-session compliance pass (economics): the acceptance is of
  the principle and the Rule-2 gate, not a claim that a full compliance sweep
  ran. Drafted from the `standing-service-invariant` workflow's findings; filed
  at the strength the evidence warrants. On ratification the Rule-2 umbrella gate
  (`tools/standing_service_gate.py`) was wired into the pre-commit chain
  (path-gated to the standing-service surface) — see the 2026-07-03 amendment,
  which tightens Rule 2 from partly-built to built-and-wired and names the
  honest residuals.
- **Genre:** Executive tenet (cross-cutting corrective-design discipline) — the
  **service-contract register** of the ADR-0000/0011/0012/0013/0015 family. It
  is **ADR-0000 Rule 2(b) answered at service scope**: ADR-0000 asks, on every
  defect, "what did the *executive* fail to put in place?", and this tenet is
  that question turned on the executive itself for the class of long-running
  services — the discipline was mechanized for how *components* are built and
  never for the *service contract* a client depends on. It binds each adjacent
  ADR as follows:
  - **ADR-0000** supplies the reflex and the type (its Specimen 1, `BoundedBatch`
    — a boundary that makes the illegal request unrepresentable — is this
    tenet's Rule 1 seed); this tenet binds the executive to have built that
    boundary at *every* client entry point, not one.
  - **ADR-0011** supplies the register: a discipline declares its enforcement
    surface, and *a recurrence never mechanized is a guard the executive did not
    build*. Its 2026-07-02 amendment (at the life-critical bar the net ships with
    the first fix) is why Rule 2 is a standing gate, not a one-time audit.
  - **ADR-0012 P2** (a boundary *translates-and-validates* and refuses what it
    cannot honor) is the shape Rule 1 mandates; ADR-0012's own meta-failure —
    *"the right idea applied once and not propagated"* — is this tenet's exact
    disease, recurring one level up at the executive.
  - **ADR-0013** supplies the integrity register: a service's boring plumbing
    coasting on "it works on my input" while the novel core gets the rigor is
    **execution attrition at executive scale** — the corner cut on the
    unglamorous surface (Rule 4). Its Rule 5 amendment (the artifact terminates
    at the deployed effect) is why readiness (Rule 3) is proven over the input
    space, not signed off on a convenient one.
  - **ADR-0015** is the sibling substrate tenet: 0015 binds the *machine state*
    a verification runs under; this binds the *input space* a service is
    verified over. They meet at the memory envelope — an unbounded leak is both
    a substrate hazard (0015) and a standing-service violation (this tenet).
  - **ADR-0014** is the method that found the class: five blind, deliberately
    un-led adversaries are the corpus's out-of-frame check (0014) run as a
    fan-out; this tenet is its *standing* form.
- **Date:** 2026-07-02 (original); refactored for portability 2026-07-13 (below).
- **Provenance:** Native. The `standing-service-invariant` workflow (run
  `wf_ee73fb10-f41`, 2026-07-01): five blind adversaries/auditors were turned on
  the fact-mining ZMQ daemon stack (`nlp_server.py` :5599, `coref_decode_server.py`
  :5600) under **one principle and nothing else** — *once a service advertises it
  is standing, no client input of any content, size, shape, value, encoding,
  ordering, timing, or concurrency can make it crash, wedge, desync, corrupt,
  hang, leak, or behave statefully; it refuses cleanly at the boundary as a typed
  refusal, or refuses to come up at all.* Given only the principle plus the LAW —
  never a symptom, never a bug list — they surfaced a class of faceplants in a
  service core wrapped in otherwise-careful infrastructure (the jax coref daemon,
  the trace SSOT, host/device honesty, shape buckets). The evidence is preserved
  under `experiments/fact-mining/docs/audit-evidence/iteration-1_wf_ee73fb10-f41/`
  (all five auditor findings, the synthesis, the verdicts); the seed is
  `BACKLOG.md`'s "Proposed LAW — the service contract is an enforcement surface"
  section. Filed at the strength it is because the substrate is not hypothetical:
  the daemon advertised "ready" and detonated deep inside on a real corpus
  document — input legal at the boundary, fatal three layers down (ADR-0000
  Specimen 1), and **not the first time** the server advertised something it
  could not serve.
- **Scope:** Every **standing service** in this corpus and its projects — a
  long-running network service that has bound its socket and reported ready, and
  that a client depends on across requests. It binds the *service contract*: how
  the service accepts, validates, and dispatches a request; how it reaches and
  advertises readiness; how it handles failure, protocol, and resources. It does
  **not** bind the inner correctness of the compute (ADR-0012 owns component
  shape; ADR-0009/P6 own the fidelity of the fast path) nor the machine the run
  sits on (ADR-0015). Per ADR-0004 it mandates no retroactive sweep; a service
  gains these gates on touch, and the fact-mining daemons — where the tenet's
  mechanisms already largely landed (see Decision) — are its first worked
  instance.

*This ADR was refactored for cross-project portability on 2026-07-13 under
[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../design/MAINT-ADR-PORTABILITY-SPEC.md)
(tracker `adr-portability-refactor`, maintainer-ratified 2026-07-13). The
pre-refactor text stands verbatim at commit `0f7b3e4`; extracted records live in
[`history/0016-fact-mining-worked-instances.md`](history/0016-fact-mining-worked-instances.md)
and are not retro-edited. This tenet cites ADR-0011's Rule 1 enforcement-surface
vocabulary and its 2026-07-02 amendments throughout Rules 1–3 (ADR-0011 was
refactored ahead of this package — work package WP-7 of the same portability
refactor's schedule, tracked in `design/MAINT-ADR-PORTABILITY-SPEC.md` §8);
those citations are prose references to ADR-0011's Rules and dated Amendments,
all of which stayed inline in the refactored ADR-0011 — so no citation
repointing was needed here. Verified directly: every `ADR-0011` citation below
names a Rule number or a dated 2026-07-02 Amendment, and none of them names any
of the project-specific worked-example material (an internal audit's own
named data types and a separate throughput-measurement testbed's amendments)
that ADR-0011's own refactor moved out to its `history/` directory — that
material is simply absent from this ADR, not cited and left dangling. Dated
amendments below are preserved verbatim from the original.*

A word on register, in ADR-0000's and ADR-0013's key. This tenet is written from
the executive chair, about an executive lapse, and the accountability it assigns
is **self-directed** — a named failure mode is organizational, not personal
(ADR-0000 Rule 2(b)). The disdain the record carries is for the *conduct* — the
**mother's-life bar** (this corpus's standard for code no one would trust a
life to: treat every hazard within reach as one you would not leave for the
next person to step on) applied by **glamour** rather than uniformly, the novel core
lavished with rigor while the input validation, the readiness coverage, and the
protocol handling coasted on "it works on what I fed it" — never for a
contributor. A client lives at the boundary, not in the elegant core, which is
exactly where a life-critical system dies.

## Context

> **Extracted record — the standing-service-invariant workflow's findings**
> *(moved verbatim to [`history/0016-fact-mining-worked-instances.md`](history/0016-fact-mining-worked-instances.md))*:
> a blind adversarial fan-out turned on a standing service, given only the
> standing-service invariant and nothing else, found its failure class
> concentrated entirely in the boring plumbing, never the novel core — every
> one of the mechanized fidelity/equivalence gates polices internal structure
> and happy-path correctness, and none of them asks whether a client can break
> the service. Every finding was legal as bytes at the boundary and fatal, or
> silently stateful, deep inside: an unbounded receive frame that OOM-kills the
> process outside its own try/except, a client-chosen cache key with no
> eviction, a client-supplied address string turned into a pivot, a multi-frame
> message that desyncs the transport, wire content silently enabling
> privileged I/O, and a readiness check proven only on a toy input. The lesson
> is the **glamour bias** the tenet's spine names: rigor tracked how
> interesting the code felt, not where a client can reach.

The seed distilled **three feeders**, and each gets a rule below:

1. **Test philosophy was fidelity, not adversarial totality.** The suite proved
   the core *right* and never proved the service *robust*. There was no "∀ inputs
   the service does not detonate" gate co-equal with the equivalence gate. Two
   different nets; one built. (→ Rule 2.)
2. **A known boundary answer was not propagated to every ingress.** `BoundedBatch`
   — validate-and-refuse at the boundary — was already in the LAW (ADR-0012 P2 /
   ADR-0000 Specimen 1) and applied to some internal wires, never mandated at
   *every* client entry point. (→ Rule 1.)
3. **Readiness was signed off on convenient inputs.** Warmup exercised a toy
   paragraph; "ready" meant "worked on what I fed it," not "proven over the input
   space" — the real corpus's worst case never ran before the service advertised
   itself. (→ Rule 3.)

## Decision

Four rules. The spine is one sentence: **once a service advertises it is
standing, the standing-service invariant — no client input of any content, size,
shape, value, encoding, ordering, timing, or concurrency can make it crash,
wedge, desync, corrupt, hang, leak, or behave statefully; it refuses cleanly at
the boundary as a typed refusal, or refuses to come up at all — is an executive
enforcement surface with its own gates, co-equal with the fidelity gates, held
uniformly across the glamorous core and the boring plumbing alike, never left to
the care of whoever last touched the service.** A **typed refusal** here is a
refusal encoded as a value in the reply's own type, produced at the boundary
(ADR-0002 fail-loud), never a bare exception raised deep in the compute and
swallowed by a catch-all. Each rule names its enforcement surface in ADR-0011
Rule 1's closed vocabulary (construction/import-time · test/CI gate · write-time
data constraint · run-time invariant · review-only), honestly.

### Rule 1 — Every client entry point is a validating boundary, and every one of them

Each ingress — each way a request enters a standing service — is a typed
boundary that **decodes-validates-or-refuses** (ADR-0012 P2): it translates the
untrusted wire form into a native type and refuses what it cannot honor as a
typed refusal at the edge, before any dispatch, loop, or compute. The
foreclosure is preferably a type that makes the illegal request
**unconstructable** — so no runtime check exists on the hot path at all (the
zero-inference-cost requirement) — and the validation, where a check is
genuinely required, is O(1) at ingest, paid once, off every inner loop. The
propagation is total: a boundary answer applied to one ingress and not its
siblings is the ADR-0012 meta-failure ("the right idea applied once, not
propagated") and is itself the violation this rule names. A **closure statement**
(ADR-0000's 2026-07-02 amendment) enumerates the axes each ingress must cover —
size, count, magnitude, encoding, value, ordering, concurrency — and every
sibling entry point, so a covered axis on one path and an open one on its twin is
a named, not a silent, gap.

*Enforcement surface: construction/import-time + run-time + test/CI gate.*

> **Extracted record — the fact-mining boundary types**
> *(moved verbatim to [`history/0016-fact-mining-worked-instances.md`](history/0016-fact-mining-worked-instances.md))*:
> this rule's first worked instance is a family of frozen, only-constructor-decode
> wire-boundary types — a request/document model per ingress, each with a hard
> count/size cap, which are Specimen 1's `BoundedBatch` made concrete — plus a
> transport-level max-message-size cap enforced before the socket binds,
> single-frame-only receipt, an opt-in gate before wire content can trigger
> privileged I/O, and an allowlisted (not arbitrary) resource key, each carrying
> its own adversarial property test. The lesson: `BoundedBatch`-at-every-ingress,
> not at the one wire someone remembered to guard.

The *judgment* that a new ingress is a boundary is review-only; the boundary
type and its cap are code.

### Rule 2 — The standing-service invariant is a standing gate, co-equal with the fidelity gate — an audit that ran once is not it

A standing service carries an **adversarial property gate** — a `hypothesis`/`deal`
suite that generates hostile inputs across every axis of the invariant and proves
no generated input makes the warm service crash, wedge, desync, corrupt, hang,
leak, or diverge from its steady state — and this gate is **as mandatory in CI as
the equivalence gate**. The `standing-service-invariant` *workflow* that found the
class is the **audit** form: a one-time, human-commissioned fan-out. Per ADR-0011's
2026-07-02 amendment — at the life-critical / standing-service bar the net ships
*with* the first fix, because serial independent executors each re-buy an
un-mechanized lesson — the audit is not the mechanism; the **standing gate** is,
and a foreclosure is not complete until the gate that catches its recurrence
exists. The gate obeys ADR-0011's 2026-07-02 Rule 3 legs: a **negative control**
(the property is demonstrated to fail on the pre-fix tree or a mutated boundary
before its green is credited — a gate never seen red is a claim, not a net) and a
**shipped binding** (the property exercises the configuration and code path
actually served, not a convenient seam).

*Enforcement surface: test/CI gate — partly built, the umbrella named-and-filed.*
The per-boundary property tests named in Rule 1 are the built portion. **Filed for
ratification (this is beyond the seed's letter — the seed said "as mandatory in CI
as equivalence"; the audit-vs-standing-gate distinction and the negative-control
mandate are this draft's sharpening):** a single CI job that runs the
standing-service property suite over *every* ingress of *every* declared standing
service as one net, with the negative control per boundary, so a new service or a
new entry point cannot ship without its adversarial coverage. Until that umbrella
gate exists, Rule 2 is honestly partial, and saying so is the point (ADR-0011
Rule 1).

### Rule 3 — Readiness is proven coverage of the input space, and the advertised limits are part of the contract

"Advertise ready" is earned, not asserted. A standing service reaches READY only
after it has **warmed the full finite shape space** it will serve (every rung of
its derived compile/autotune ladder) *and* survived the real corpus's worst case
— so there is no "first one of this shape is special," no lazily-deferred work a
later request pays. Readiness is a **typed token** that the serve loop cannot
obtain until coverage is proven; "bound but not fully warm" is made
unconstructable, not guarded. **Beyond the seed's three candidate rules (flagged
as this draft's addition, landed in commit `5e9be34`):** the service's
*advertised limits are themselves part of the contract*. A typed refusal of a
limit the service never told the client about is still a **system** failure — the
client could not have avoided it — so a standing service advertises its ceilings
(batch, text, token, frame, memory envelope) *before* inference, from the gates'
own SSOT (single source of truth) constants, and a client plans against the
advertisement. Refusal is the sanctioned failure only when it is a refusal the
client could predict.

*Enforcement surface: construction/import-time + run-time invariant + test/CI
gate.*

> **Extracted record — the fact-mining readiness token**
> *(moved verbatim to [`history/0016-fact-mining-worked-instances.md`](history/0016-fact-mining-worked-instances.md))*:
> this rule's first worked instance is a typed readiness token minted only once
> every required warmup cell is recorded complete, so a partial sweep cannot
> yield a ready service, at zero warm-path cost; a warmup ladder derived from the
> advertised envelope; the advertised limits surfaced on the service's own
> readiness reply with a client-side planner that partitions against them; and a
> memory-envelope check that fails loud before the underlying cache fails slow.
> The lesson: the empty-warm-cache readiness lie — a service that reported
> itself ready while its cache, warm in name only, was empty — is exactly what a
> typed readiness token forecloses.

The coverage-derivation and the token are code; the judgment "is this the full
worst case" is review-owned but checkable against the advertised envelope.

### Rule 4 — The plumbing is held to the core's bar — the mother's-life bar applied uniformly, not by glamour

The unglamorous service surface — input validation, readiness coverage, error and
protocol handling, resource bounds, telemetry side effects — gets the same bar as
the novel core, without exception. The tell of the violation is the **glamour
bias**: rigor tracking how interesting the code felt rather than where a client
can reach. This is ADR-0013's execution attrition raised to executive scale — the
corner cut on the boring surface, arriving in the honest register ("it works on my
input," "fine for the plumbing"), and therefore invisible as a corner. The
**14-year-old code** — this corpus's own shorthand (ADR-0000's register) for
code so old and untouched that no one still working here would vouch for it,
used as the standard for "code no one would trust a life to" — hides
precisely where the work felt boring.

*Enforcement surface: review-only, backed by the mechanized siblings.* No gate
reads "did this surface get the same care." The external backstop is that Rules 1
and 2 do not care whether an ingress is glamorous: a boundary type is demanded of
the plumbing ingress exactly as of the core's, and the adversarial property gate
generates hostile input against every entry point regardless of how interesting
its code is. The review question — "was the bar applied by where-a-client-reaches
or by how-the-code-felt?" — is the hack-rationalization detector's kind of
out-of-frame check (ADR-0013 Rule 3), run on the *scope* the executive gave the
service, not on a single fix.

## Consequences

**Positive.** The standing-service invariant becomes a checkable, gated property
instead of an unstated hope. A client can no longer break a warm service through
the boundary; a service cannot advertise readiness it has not earned; the boring
plumbing is held to the bar mechanically, not by remembering to care. The class
the workflow found fails loudly at CI time (Rule 2) rather than three layers deep
on a real corpus document.

**Negative.** Ceremony on every standing service: a boundary type per ingress, a
warmup sweep over the full ladder, an adversarial property suite. The umbrella
gate (Rule 2) is named-and-filed, not built — so the tenet is honestly partial
until it lands, and Rule 4 is review-only and enforced by the faculty (the
executive's own sense of where rigor is owed) most prone to the glamour bias it
guards. Advertised-limit SSOTs (single sources of truth) and memory envelopes
can go stale (they are facts this corpus's own P1 principle governs — one
owned home per fact, derived everywhere else it is needed, per
[ADR-0012](0012-compositional-and-structural-hygiene.md)).

**Neutral.** No retroactive sweep (ADR-0004); services gain the gates on touch.

> **Extracted record — first worked instance, dated**
> *(moved verbatim to [`history/0016-fact-mining-worked-instances.md`](history/0016-fact-mining-worked-instances.md))*:
> the Rules 1 and 3 worked instances above landed, by commit, before this tenet
> was written — the tenet records the lesson so the next service does not
> re-buy it, exactly as ADR-0015 records the OOM incident.

## Revisit when…

1. **A rule introduces its own failure mode** — most plausibly Rule 2's property
   gate hardening into ceremony on a service with a genuinely tiny input space, or
   Rule 3's warmup ladder growing to a boot cost that dwarfs the cold-JIT it
   forecloses. Dated amendment here (ADR-0005 Rule 8).
2. **The umbrella standing-service CI gate is built** (Rule 2's filed mechanism).
   Record it, wire its negative control, and tighten Rule 2 from partly-built
   toward fully-mechanized.
3. **A second standing service joins the corpus** (the deductive-engine main loop
   is the near candidate). Confirm the four rules transferred as *contract
   discipline* and re-derive the ladders/envelopes for its input space — the rules
   are service-independent, the numbers are not.
4. **The invariant is measured to hold** (ADR-0011 Rule 3, measure-first). The
   claim that these gates foreclose the class is itself a claim wanting
   substantiation; a subsequent adversarial fan-out that finds the class *absent*
   is the evidence the tenet held.

## What this tenet does NOT mean

- **Not "every service needs a property-testing framework regardless of surface."**
  A service with a genuinely closed, tiny input space that a boundary type makes
  unconstructable needs no generative gate to prove a class it cannot represent.
  The discriminator is whether an axis of the input can *reach* a detonation, not
  ceremony for its own sake.
- **Not "refuse more."** A typed refusal is the sanctioned failure only when the
  client could have predicted it from the advertised contract (Rule 3). A refusal
  of an un-advertised limit is a system failure, not a discharge of this tenet.
- **Not a license to expand a service's scope.** Hardening the *contract* of a
  ratified service is not adding features to it (ADR-0004, ADR-0013's no-expansion
  clause). The gates serve the promise already made, not a larger one.
- **Not self-certifying.** Per ADR-0011 Rule 1, Rule 4 is review-only and Rule 2
  is partly filed; the tenet's protection is the boundary types, the readiness
  token, and the (to-be-built) standing gate, not the executive's good intentions —
  which, per the workflow, were present in a carefully-built stack and did not stop
  the class.

## Related

- **ADR-0000 (type-driven design).** Rule 1's boundary is Specimen 1's
  `BoundedBatch`; this tenet is Rule 2(b) ("what did the executive fail to put in
  place?") answered for the whole class of standing services.
- **ADR-0011 (mechanization discipline).** The enforcement-surface register and
  the 2026-07-02 amendment (the net ships with the first fix; a gate proves itself
  by failing) are the spine of Rules 2 and 4.
- **ADR-0012 (compositional and structural hygiene).** P2 (translate-and-validate,
  refuse what you cannot honor) is Rule 1's shape; the "right idea applied once,
  not propagated" meta-failure is the disease, at the executive.
- **ADR-0013 (execution integrity).** The plumbing-coasts-on-glamour failure is
  attrition at executive scale (Rule 4); Rule 5's amendment (the artifact
  terminates at the deployed effect) is why readiness is proven over the input
  space (Rule 3).
- **ADR-0015 (verification-substrate discipline).** The sibling substrate tenet;
  they meet at the memory envelope — a leak is both a starved-substrate hazard and
  a standing-service violation.
- **ADR-0014 (second opinion).** The five blind adversaries are the out-of-frame
  check run as a fan-out; this tenet standing-ifies it.
- **The originating `standing-service-invariant` workflow** — see the Extracted
  record under Context; the audit this tenet generalizes into a standing gate.

## Amendments

### 2026-07-03 — Ratified; Rule 2's umbrella gate built and wired (partly-built → built-and-wired)

*(Dated append per ADR-0005 Rule 8; discharges Revisit #2 — "the umbrella
standing-service CI gate is built: record it, wire its negative control, and
tighten Rule 2 from partly-built toward fully-mechanized." Recorded at
ratification, so the body's point-in-time "named-and-filed, not built" language
above stands as the draft record and is superseded here rather than retro-edited.)*

The maintainer ratified this ADR on 2026-07-03. Two honest caveats on the
ratification itself: it is an acceptance of the **principle and the Rule-2 gate**,
not a claim that a full Fable-session compliance sweep ran across the corpus
(economics); and Rule 4 remains review-only by the ADR's own declaration.

Rule 2's umbrella gate now **exists and is wired**:

- **Built.** `tools/standing_service_gate.py` is the single invocation Rule 2
  prescribed: it walks `experiments/fact-mining/standing_service_registry.py`
  (the SSOT of declared standing services / ingresses / axes), prints the
  coverage table (covered · declared-gap · SILENT-gap), and runs the gate's own
  completeness/red-proof teeth together with every bound property suite as **one
  pytest net**. A SILENT coverage gap fails; a declared gap (with a BACKLOG
  pointer) passes with a printed warning. Measured end-to-end on the guest:
  **300 passed, 4 skipped, ~33 s pytest / ~35 s wall, ~3.25 GB peak RSS**, 0
  SILENT gaps, 4 declared gaps.
- **Negative control (Revisit #2's "wire its negative control").** Carried
  per-suite as each bound suite's red-proof, censused by the runner (at
  ratification: 25 bound suites — 15 `raises`, 10 `degrade`). The umbrella does
  not stand a single global red card up; each boundary carries its own.
- **Shipped-binding residual (unchanged).** The net runs on the **guest**; a
  handful of bound suites skip their GPU/live-model path (the 4 skips above).
  Those axes are proven on the guest subset; host-only cluster fidelity is
  covered elsewhere (e.g. `load_facts --coref-verify`). This is the ADR-0011
  2026-07-02 shipped-binding leg's honest partiality, not closed here.

- **Wired — at the pre-commit chain, path-gated, and why that surface.** Rule 2's
  letter says "a single CI job." This repo has **no CI system** (`.github/`
  workflows absent); its only mechanical gate surface is the `tools/hooks/`
  pre-commit chain (the ADR-0011 mechanism that already runs the lazy-import
  gate). The umbrella net is too heavy to run *unconditionally* on every commit —
  ~35 s and ~3.25 GB (it imports torch/spaCy), against the lazy-import gate's
  sub-second pure-stdlib cost — and forcing a 3.25 GB spike on every commit is
  itself a substrate hazard on this host (see `OOM-TMPFS-INCIDENT-2026-07-02.md`,
  ADR-0015's register). So the gate is wired into pre-commit **path-gated**: it
  fires only when a commit touches the standing-service surface
  (`experiments/fact-mining/**` or `tools/standing_service_gate.py`), and when it
  fires it runs the **full** net over every declared service (the "one net"
  spirit is preserved — path-gating scopes *when* it runs, not *what* it covers).
  This is the literal mechanization of the ADR's own scope clause — "no
  retroactive sweep (ADR-0004); a service gains these gates on touch" — so a
  commit that adds a new standing service or ingress necessarily touches the
  surface and cannot land without the full adversarial net going green. If a CI
  system is later adopted, the same one invocation is the natural CI job and the
  path-gate becomes redundant, not wrong.

Rule 2 is therefore tightened from **partly-built** (per the body) to
**built-and-wired**, with the shipped-binding guest-subset residual and Rule 4's
review-only status as the named, still-open remainder.

## License

Public Domain (The Unlicense).
