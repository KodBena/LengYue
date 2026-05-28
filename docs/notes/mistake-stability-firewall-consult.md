# Mistake / stability surface — firewall-style synthesis review

- **Status:** `design-note: external review`
- **Date:** 2026-05-28
- **Scope:** a fresh-eyes synthesis read across the four-document
  cluster on mistake-finder and stability-surface substrate design:
  `mistake-finder-design-space.md`, `stability-surface-design-space.md`,
  `mistake-stability-surface-synthesis.md`,
  `mistake-finder-pedagogy-and-followups.md`. The goal is naming the
  invisible seams — places where the four documents have couplings,
  missed axes, or framings that compose oddly when read together.
- **Genre:** synthesis review. Commissioned by the project author as
  an outside-the-momentum read; the firewall posture is the feature.

## How to read this note

This is not a recap. Each of the four notes already carries its own
recommendation, its own "what this note does not settle," and its
own grounding-gap audit. The read below assumes those are in view
and asks the question they cannot ask themselves: when the four are
placed against each other, what's coherent that isn't visible
per-note, and what's incoherent in ways the per-note framing hides?

The findings are organised in three layers. **Invisible seams** —
places where one document's framing silently constrains another's.
**Vestigial framings** — language one note carries that revisions in
another note have moved past. **Serendipity** — things that emerge
from the cross-read that none of the four notes claim.

## Layer 1 — Invisible seams

### Seam 1: the "non-opinionation" posture cuts unevenly across the two surfaces

The mistake-finder note's load-bearing pivot
(§"Where the design space actually lies", item 2) is the project's
non-opinionation about `delta_fn`'s sign convention and bounds.
That posture rules out a universal `1 - goodness` transform and
drives Option α (per-palette `move_selector_fn` declaration).
The stability-surface note then ships a **curated catalogue of
six extractors fixed at v1** (§"Recommendation") — the opposite
posture, where the SPA picks the extractors and the user does
not author them. The synthesis note endorses "ship curated
catalogue first, plumb for DSL second" as the *shared* shape
across both surfaces (§"Recommendation"), and the friction lives
here.

On the mistake-finder side non-opinionation is **strong** — it's
*because of* user ownership that a per-palette declaration
channel is needed rather than a curated default. On the
stability-surface side non-opinionation is **deferred** — the
curated catalogue is opinionated on empirical grounds, with DSL
authoring named as a later arc that would invert the posture.

The synthesis's comparison table (§"Recommendation", rows
"Authoring shape" and "Per-palette calibration") makes this
visible — mistake-finder reads "yes — palette author authors
their own ranking expression," stability reads "no — the
curated extractors are fixed" — but it doesn't say what that
asymmetry costs at the shared-infrastructure lift point.

If the v1 stability surface ships as a fixed catalogue and v1
mistake-finder ships as a per-palette declaration, the "shared
infrastructure" the synthesis names (ranking composable,
selection-knob pattern, signal-distribution diagnostic) lands
asymmetrically: mistake-finder's ranking composable consumes
*palette-declared* score functions; stability's ranking
composable consumes *catalogue-named* score functions. The
unified ranking-composable type signature the synthesis defers
(last item under "What this synthesis does not settle") has to
absorb that asymmetry, and the asymmetry is the reason it's
harder to defer than the synthesis suggests.

### Seam 2: per-palette calibration cost is the implicit blocker the design notes don't price

The mistake-finder note's recommendation (Option α) carries an
acknowledged-but-underweighted v1 cost. §"What this note does
not settle" item 2: *"each shipped palette (robust child, the
score-loss palettes, the rank palette, the default palette)
needs a declared `move_selector_fn` for the mistake-finder
consumer to be honest. Authoring those defaults is a per-palette
calibration question — what the palette author considers 'worst
move' — and is the substantive work of the v1 shipment beyond
the consumer-side code."*

The synthesis records this under "Substrate growth" as a
parenthetical: *"zero new vocabulary... but per-palette work to
declare the binding on each shipped palette"*. The
mistake-finder's recommendation reads "no substrate growth";
the actual v1 cost is a calibration arc across every shipped
palette.

The *user-authored-palette* form of this question is what's
truly invisible. A user authors a custom palette with no
`move_selector_fn` bound; the mistake-finder ranks their game;
the substrate's default (per the note §"What the substrate
already provides": mean of per-arrival policy deltas) is what
they see. The user has never seen "mean of per-arrival policy
deltas" and has no way to know that's what's ranking their
moves. That's an ADR-0002 silent-failure shape at the
consumer surface: the user sees a worst-moves list whose
ranking criterion is opaque.

The mistake-finder note explicitly defers UI placement ("a new
tab? overlay? modal?"), which is the right call for
*placement*, but the *what-criterion-do-we-name-to-the-user*
sub-question is closer to the substrate than placement is, and
it's not deferred — it's invisible.

### Seam 3: the pedagogy note's "surface the punishment" requirement crosses the wire-shape gap the mistake-finder note flags

The pedagogy note §"API implications for the mistake-finder"
item 2: *"Surface the punishment alongside the mistake... This
is what the substrate already gives the consumer:
`MoveView.before` / `MoveView.after` carry the full pre/post
`AnalyzeResponse`, so the proxy already has the PV available;
the SPA-side mistake-finder needs to consume and display it."*

The mistake-finder note §"What this note does not settle" opens
with: *"The wire-shape prerequisite. Does the proxy emit
per-move `move_selector_fn` output on non-adaptive queries
today?"* And inside Option α: *"the MoveView's `before` /
`after` AnalyzeResponse references may or may not be
reconstructible from the SPA's stream"*.

These passages interact more sharply than either note surfaces.
The pedagogy note treats PV display as a *free* implication of
the substrate; the mistake-finder note's wire-shape audit is
about whether the *scalar* output crosses the wire — not whether
`MoveView`'s richer fields do. If the answer is "scalar yes,
MoveView no," the pedagogy note's API implication doesn't ship
with the v1 substrate decision.

This isn't a bug in either note; it's a seam. The mistake-finder
prices the scalar wire; the pedagogy prices the PV display; the
synthesis links them but doesn't ask whether the *union* of
their wire requirements composes into a single coherent v1
shape. The implication is procedural: the enricher-emission-path
read the mistake-finder names as the first concrete step should
answer the PV question in the same pass.

### Seam 4: the stability surface's "aggregation across positions" gap is the same gap as the synthesis's unified ranking composable

The stability-surface note §"What this note does not settle"
item 2 flags that stability is *per-position* and that
aggregation across positions in an analysis range is
undefined, contrasting this against the mistake-finder's
per-move shape.

The synthesis note §"Where they overlap" item 2 nonetheless
claims both surfaces produce "per-unit scalars consumed by SPA
ranking," with a shared composable shape
`(items, scoreOf, policy) → items[]`. Its comparison-table row
"Ranking" reads, for stability: *"(deferred — stability is
per-position; aggregation across positions is a UI question)"*.

That parenthetical is exactly the work the synthesis claims is
shared. For the mistake-finder, "top-K" is "the K worst moves
in the range." For the stability surface, the range carries M
positions × N extractors × P V-windows of scalar values, and
*which dimension is `Item`* (a position? a
(position, extractor) pair? a triple?) is undecided. The
mistake-finder doesn't have this question — Items are moves.

This composes back to seam 1's asymmetry. The mistake-finder's
per-palette declaration carries both *item classification*
(moves) and *score function* (per-palette selector) into the
consumer. The stability catalogue carries the score functions
but defers the item classification. Sibling-surfaces with
shared ranking infrastructure works only if both sides have
decided what counts as an Item — and only one side has.

### Seam 5: the synthesis's "stateful closures" rejection commits a substrate shape the v1 stability catalogue doesn't actually need

The synthesis §"Where they diverge" item 3 frames stateful
extractors (the research arc's
`extract_winrate_change_threshold_factory(δ)`) as the rock that
breaks unification: *"if a unified palette is attempted, it has
to absorb stateful extractors. Either the language grows... or
the surface bifurcates."*

But the stability note's v1 catalogue (§"Recommendation" item 2)
includes six extractors, **five of which are pure per-packet
functions with no closure state.** The single stateful family
(`winrate_change_threshold_factory(δ)`) was the degenerate
δ=0.10 instance that the catalogue excluded on pos-rate
grounds. So the synthesis's "stateful closures break
unification" argument is true as a *future-state* claim (when
DSL admits the stateful family) but overweighted as a *v1*
claim.

The trajectory accumulation is the stateful part of v1 — but
it lives in SPA storage, not in user-authored expression. The
palette's expression language could absorb stateless extractors
straightforwardly. The honest reason against unifying is closer
to seam 4's input-shape mismatch — the palette is authored over
move/turn-axis units (`MoveView`, `TurnView`) and the stability
substrate is authored over V-trajectories. Different *input
shapes*, not different *language shapes*. The sibling-surfaces
recommendation may still be right, but the cited reason
overstates the rock.

## Layer 2 — Vestigial framings

### Vestigial 1: the mistake-finder note's revisions left a recommendation that reads smaller than it is

The mistake-finder note visibly reflects three sequential
revisions in its prose — the channel correction, the
goodness-[0,1] retraction, the non-opinionation reframing.
Its §"Recommendation" describes Option α as "zero substrate
vocabulary growth, no pre-commitment to a sign convention" —
language carrying the *negative* shape of the revisions
(what α no longer assumes). The *positive* shape of α —
what it actually does at v1 — is the per-palette calibration
arc named in §"What this note does not settle" item 2.

The headline reads small; the actual v1 reads larger. The
synthesis (table) and the pedagogy note (implicit dependence
on the substrate) both inherit the small reading without the
larger reading. The pedagogy note in particular treats the
mistake-finder as a feature the substrate hands you on a
plate; the calibration arc is invisible in it.

### Vestigial 2: the synthesis note's symmetry table overclaims symmetry

The synthesis comparison table maps mistake-surface to
stability-surface across nine axes. On six rows the mapping
is honest. On three the synthesis is reaching:

- *Ranking* — mistake-side is a recommendation, stability-side
  is a deferral. Not peer entries.
- *Deferred substrate questions* — mistake-side names three
  concrete itemised questions; stability-side names one later
  arc generically. Different granularities.
- *Cross-team work* — mistake-side's wire work is required (a
  load-bearing prerequisite); stability-side's is contingent
  on demand. Different in kind.

The high-level symmetry the synthesis names (authoring posture,
infrastructure sharing) is real; the *recommendation-level*
symmetry the table presents does more rhetorical work than the
underlying material carries. Sibling-surfaces is still the
right call — but a reader convinced by the table is convinced
of more than the table delivers.

### Vestigial 3: the stability note's "forward-compatibility plumbing" framing is doing two jobs

The stability surface's recommendation hinges on
forward-compatibility plumbing: *"registry indirection,
key-prefixed namespace, configurable V-windows,
extractor-typed not extractor-named consumers"* (Option α). Its
own §"What this note does not settle" item 5 walks the framing
back partway: over-investing is its own failure mode.

The plumbing is doing two distinct jobs the note doesn't
distinguish:

1. **Registry indirection job.** Preventing the curated v1
   from hardcoding extractor names into UI/consumers. A clear
   win, matching ADR-0003 at the right granularity (the
   second consumer is the eventual DSL-authored extractor).
2. **DSL-readiness job.** Claiming the v1 infrastructure makes
   DSL extension incremental. Harder to verify in advance;
   "incremental" depends on the DSL's eventual shape (stateful
   closures, input typing, V-axis range parameters).

A v1 implementer has to make this call without explicit
guidance. Configurable V-windows are a job-2 element worth
sizing against actual v1 use (if all six extractors ship with
fixed defaults, configurability is over-investment).
Extractor-typed-not-named consumers depend on UI presentation
(per-extractor affordances vs a generic "show this stability
metric" affordance). The note's recommendation list preserves
optionality at v1 time — consistent with the project's
"let the chips fall where they may" posture — but the
no-regrets layer and the speculative-payoff layer aren't drawn
apart, and the temptation under "forward-compatibility"
pressure is to do job 2 prematurely.

## Layer 3 — Serendipity

### Observation A: the substrate is converging on the same "lift at second consumer" pattern at three different scales

Three places in the four notes invoke "extract / lift / ship
when the second concrete consumer appears":

1. Mistake-finder §"Recommendation" — Option α reuses
   `move_selector_fn` rather than adding `severity_fn`; the
   split happens "when deepening rank and user-visible mistake
   rank diverge for any shipped palette." (ADR-0003 cited.)
2. Stability note Option α — registry indirection and
   key-prefixed namespace; DSL extension lands at second
   consumer.
3. Synthesis §"Recommendation" item 3 — *"the shared
   infrastructure gets lifted at the transition"* (ranking
   composable, selection-knob pattern, distribution diagnostic).
   ADR-0003 cited.

These are three nested applications of the same architectural
principle: within-palette-substrate scale, within-extractor-
surface scale, across-surfaces scale. The codebase's
Ports-when-second-consumer instinct is deeply internalised in
these notes.

The serendipitous question this poses: is there a meta-trigger
that fires when all three lifts are pending simultaneously?
The notes describe three independent triggers (per-palette
divergence, DSL-author demand, second consumer of the ranking
composable). If they fire close together, the implementer
faces three substrate-lift decisions at once — and the order
matters (lift the ranking composable before or after the
curated-to-DSL split?). The lift triggers are named as
independent in framing but won't be independent in time.

### Observation B: the pedagogy note's win-attribution rejection is structurally the same as the stability note's `winrate_polarity` rejection

The pedagogy note's central rejection of the win-attribution
paradigm (§"Win attribution as a paradigm") names the
population-level blind spot: *"those who are just out to win
fall behind precisely because they have a blind-spot of
'opponent failed to punish, therefore my move was fantastic'."*
The substrate consequence: don't filter or down-rank
unpunished mistakes.

The stability note's rejection of two extractors
(§"What the research arc produced", "Two operational lessons"):
`winrate_polarity` and `winrate_change_threshold(0.10)` look
like signal under AUC but are degenerate under label imbalance
(pos_rate ≈ 0.97–0.99) — *"a ranking artefact of extreme label
imbalance, not a real signal."*

These are the same shape. Win attribution is the "95% of moves
are unpunished, therefore most moves were fine" inference;
`winrate_polarity` is the "95% of positions have winrate > 0.5
for one player, therefore polarity is stable" inference. Both
fail the same way: degenerate label distributions producing
meaningless rankings.

Neither note connects this. The pedagogy stays at the
cognitive-psychology framing (outcome bias / resulting /
counterfactual neglect — the right framing for the *user*).
The stability note stays at the empirical-degeneracy framing
(the right framing for the *catalogue curator*). The synthesis
§"Where they overlap" item 4 ("Both want the same diagnostic
vocabulary") gestures at it but doesn't go further.

The connection is genuine. The synthesis's planned
"signal-distribution diagnostic" — built once, serves both
surfaces — also has a cross-surface use neither note names: it
prevents the system from silently importing the
win-attribution paradigm via a degenerate ranking signal. The
diagnostic isn't just a code-reuse argument; it's a
substrate-level instance of the pedagogical commitment.

### Observation C: the cards-vs-mistakes triage state is invisible across all four notes

The mistake-finder feeds the autonomous-SR loop (cited but not
read for this consult). The pedagogy note discusses how a
card should be *authored* once a mistake is identified. The
synthesis touches on autonomous-SR loop integration as a
future second consumer.

But none of the four notes asks: when the mistake-finder
surfaces N mistakes and the user wants to make M ≤ N cards,
what substrate holds *the user's decision about which mistakes
are worth carding*? The ranked list is a *candidate pool*;
the cards subsystem is a *committed pool*; the missing seam
is the user's filtering work between them — "this mistake has
been triaged but not carded."

This is closer to a UX question than a substrate question, so
its absence is defensible. But the pedagogy note's thesis —
the cognitive bias is under-processing of unpunished mistakes
— interacts with this in an ironic way. A substrate that
surfaces a mistake, lets the user dismiss it, and forgets the
dismissal is itself under-processing the user's *prior
decision*. The cognitive bias the pedagogy targets is
mirrored in the system's potential for state amnesia. None of
the notes catches the analogy.

### Observation D: the substrate-growth budget is honestly zero on the proxy side and quietly larger on the SPA side

Net read of substrate growth across the four notes:

- Mistake-finder: zero new proxy vocabulary; one wire-shape
  clarification; per-palette calibration arc.
- Stability: zero proxy vocabulary; modest SPA substrate
  (TypeScript port of `StabilityTrajectory[Q]`, registry,
  derived metrics); contingent `staged_analysis` capability.
- Synthesis: defers all unification; identifies shared
  consumer-side infrastructure as the lift point.
- Pedagogy: no substrate growth claimed; one implicit
  wire-shape implication (PV reachability — seam 3).

The aggregate posture is aggressively conservative on
substrate growth, consistent with ADR-0008 (refuse fuzzy
synthetic categories) and ADR-0003. Across what could be a
substantial feature arc, the proposal is **zero new substrate
vocabulary entries on the proxy side**. That's an impressive
design discipline.

The serendipity is the asymmetry: proxy growth is zero; SPA
growth is non-trivial (trajectory storage, registry, ranking
composable, diagnostic module, eventual authoring UI). The
"zero growth" headline is true at the cross-team boundary;
SPA-internal growth is where the design notes' deferrals (UI
question, registry indirection, the unified-ranking-composable
type signature, item classification) accumulate. A reader
scanning for substrate-growth signals comes away with a "this
is shippable cheaply" impression that's accurate on the proxy
side and misleading on the SPA side.

This isn't criticism of the recommendations — the asymmetry
is honest given which sub-projects own which work. But the
four notes describe an SPA-heavy arc with proxy-light
contracts. The "clarification dispatch" the mistake-finder
flags is the *only* cross-team work in v1; the rest is
frontend.

## A small next-step suggestion

The mistake-finder note already names the first concrete step:
*"a worklog-style code read of the enricher's emission path
settles it"* (whether the proxy emits per-move
`move_selector_fn` output on non-adaptive queries today). If
that read happens, two co-pending questions can be answered in
the same pass at no extra cost:

1. **PV reachability (seam 3).** Does the SPA's existing
   stream carry the `before`/`after` AnalyzeResponse
   references that the pedagogy note's "surface the punishment"
   requires? If not, the v1 wire change is two-shaped, not
   one-shaped.
2. **Preview content (stability note's grounding gap).**
   Per-preview field presence of `moveInfos.visits` and
   `rootInfo.visits` — confirmed by the existing analysis-
   service ingestion or not?

Bundling the three reads into one enricher-emission-path study
is consistent with ADR-0002's posture (surface multiple
unsubstantiated assumptions together rather than serially) and
reduces the "implementation prerequisite" surface across all
four notes to a single concrete deliverable.

## What this consult is not claiming

To stay honest:

- The consult did not read the autonomous-SR loop note in
  full, the research-branch session-handoff notes, the
  proxy-side enricher emission code, or
  `frontend/src/types.ts:300-358`. Claims stand on the four
  design notes as primary text and the ADR synopsis as cited
  reference. Where seams reach into material outside that
  scope, the seams are flagged but the inferences are
  tentative.
- The seams are *seams*, not necessarily bugs. The notes are
  explicitly exploratory and many seams are deferred-by-design.
  Several observations above (especially the symmetry-table
  overclaim and the forward-compatibility framing) are
  rhetorical observations about how the documents will land
  with future readers, not claims that the underlying
  recommendations are wrong.
- This is synthesis review, not re-design. None of the
  observations proposes new options for the design space.
  Where a seam suggests a next-step probe (the bundled
  enricher-emission read), it's named as a follow-up to the
  notes' existing first steps, not a redirection.

---

## Round-table follow-up (2026-05-28): the binary-flag proposal

After this consult was delivered, the project author surfaced a
candidate substrate shape that recasts several of the seams
identified above. The exchange — author proposes, original note
author records, consult agent weighs in — has become the
"round-table of three" framing for these deliberations. This
section records the round-table outcome for posterity; the
canonical recommendation now lives in the amended
`mistake-finder-design-space.md` § Option α.

### The proposal, quoted

> a binary flag on the semantics of delta in terms of ordering
> (though that presupposes ordering is independent of color, but
> if it isn't then a simple change of variables -- even if
> scalene, like if you have two players of widely different
> playing strength and you want different metrics for each --
> could theoretically be cramped into that shape. Whether we're
> unopinionated or not, it's my feeling that this should cover a
> huge swath of the design space regardless, but I'd also be
> happy to be proved wrong, and I'm not just saying that to be
> glib).

Concretely: a `delta_ordering: 'lower_is_worse' | 'higher_is_worse'`
field on `AnalysisPalette`. Each palette declares which direction
of its `delta_fn`'s output counts as bad. The mistake-finder
consumer orients by the flag and ranks the existing
`extra.<color>.deltas` wire data.

### Consult-agent response, key findings

The consult agent endorsed the proposal as a *replacement* for
the prior Option α (per-palette `move_selector_fn` authoring),
not a supplement:

> the binary flag *replaces* Option α; `move_selector_fn`
> retreats to the escalation path.

> The architectural move the round-table should propose, if the
> author wants a one-line summary: rename the substrate growth
> from "per-palette `move_selector_fn` calibration arc" to
> "one-enum-field schema addition." That's a more honest cost,
> a much smaller cost, and a more legible UI affordance (a
> dropdown, not an expression editor).

### What this does to the seams identified above

- **Seam 2 partly inverts.** The "per-palette calibration arc"
  this consult flagged as Option α's hidden cost turns out to
  be one bit per palette, not an expression-authoring arc. The
  consult was right that the cost was per-palette and right
  that the original α framing underweighted it, but the cost
  it identified is much smaller than the framing suggested.
  The amended α sizes the substrate to the actual cost
  (one schema field) rather than routing it through expression
  evaluation.
- **Seam 1 softens.** The non-opinionation asymmetry between
  mistake (per-palette declaration) and stability (curated
  catalogue) becomes "parametrised-by-palette enum vs
  parametrised-by-catalogue enum" — same shape at different
  granularities. The synthesis note's deferred unified-ranking-
  composable type signature gets easier: both sides now hand
  the composable a scalar plus a sign-convention parameter,
  rather than a scalar plus a free-form expression contract.
- **Seam 3 simplifies on one of its two sub-questions.** The
  mistake-finder's wire-shape prerequisite ("does the proxy
  emit per-move selector output on non-adaptive queries?") is
  no longer needed: `extra.<color>.deltas` is already on the
  wire; the SPA orients by the flag and ranks. The pedagogy
  note's PV-reachability requirement (surface the punishment
  alongside the mistake) is independent and unchanged. The
  bundled enricher-emission-path read this consult suggested
  becomes a two-job read (PV reachability + preview-field
  presence for the stability surface) rather than three-job.

### One seam the round-table newly flagged

Phase-aware severity ("endgame mistakes count more than fuseki
mistakes") is not directional and not scalene; it can't be
expressed by a binary direction flag. It also can't be expressed
by any monotonic function of `delta_fn`'s single scalar without
reading `move_index` or position context. The escalation to
`move_selector_fn` handles it correctly because `MoveView`
carries that context, but the proposal's "huge swath" claim
should acknowledge phase-weighting and difficulty-weighting as
falling outside the swath alongside scalene-on-incommensurable-
scales. The good news: no shipped palette does these today.

### Vestigial framings the round-table retired

- The synthesis note's comparison-table row "Forward-compat to
  DSL: already DSL-shaped (`move_selector_fn` is a palette-author
  expression)" became vestigial under the binary flag — v1 is no
  longer DSL-shaped on the mistake side. The amended synthesis
  table reflects this.
- The mistake-finder note's "What this note does not settle"
  section's wire-shape prerequisite item retired (no new emission
  needed). Replaced by the schema-migration question.

### What the round-table preserved

The recommendation against Option γ (new `severity_fn` substrate
family) and Option δ (overload `delta_fn` semantics) stands
unchanged. Both fail ADR-0008 for the same reasons; the binary
flag fits the actual semantic content of severity-declaration
better than either would.

ADR-0003's "Ports extracted when a second concrete consumer
exists" still governs the escalation triggers. The binary flag's
introduction is not itself a Port extraction — it's a smaller
substrate addition (one field) — and the existing
`move_selector_fn` substrate is not refactored. The Port-extraction
calculus reopens only when a palette demonstrates a need for
expressive ranking that the binary flag cannot absorb.
