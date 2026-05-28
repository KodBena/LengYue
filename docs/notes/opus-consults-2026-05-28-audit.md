# Opus consults — audit record (2026-05-28)

- **Status:** `audit-record`
- **Date:** 2026-05-28
- **Scope:** verbatim record of two Opus 4.7 consult invocations
  conducted during the mistake-finder / stability-surface
  design-space deliberation. Recorded for auditability per the
  project author's request after the original branch was merged.
- **Genre:** audit. This file preserves the prompts and (where
  not already on disk verbatim) the responses, so the
  deliberation arc is reconstructable without resort to
  conversation transcript.

## Why this exists

The 2026-05-27 / 2026-05-28 conversation arc produced five
design-space notes plus a TODO entry, all on the
`bork/docs/mistake-stability-substrate-notes` branch (merged
into `main` as PR #290, commit `cf36cd4`). Two of those
artifacts were Opus 4.7 consult agent invocations:

1. **Firewall consult** — fresh review of the four design notes;
   the agent wrote `docs/notes/mistake-stability-firewall-consult.md`
   directly to disk (467 lines). The agent's output is on disk
   verbatim.
2. **Round-table consult** — follow-up on the project author's
   binary `delta_ordering` flag proposal. The agent returned a
   response in the tool-result channel; only excerpts were
   quoted in the firewall consult's appendix.

This file fills the gap. For (1) it preserves the prompt that
elicited the on-disk document. For (2) it preserves both the
prompt and the full verbatim response.

## Agent metadata (both consults)

| | Consult 1 (firewall) | Consult 2 (round-table) |
|---|---|---|
| Agent type | `general-purpose` | `general-purpose` |
| Model override | `opus` (Opus 4.7) | `opus` (Opus 4.7) |
| Foreground / background | foreground | foreground |
| Worktree isolation | none | none |
| Approximate duration | ~6 min | ~2 min |
| Approximate token cost | ~90k | ~75k |
| Verbatim response location | `docs/notes/mistake-stability-firewall-consult.md` (on disk) | inline below |

## Consult 1 — Firewall review of the four design notes

### Invocation context

After authoring four design-space notes, the project author
requested an "unbiased second opinion synthesis, commissioning
an Opus 4.7 agent firewall style, on the four documents that
you have just produced, as a sort of 'fill in the invisible
seams' run since there's so much to digest." Length budget
~250-400 lines, "doesn't have to be committed to github
doesn't have to be very long."

The agent was instructed to read the four design notes plus
ADR-synopsis and CLAUDE.md as needed for context, and produce
a synthesis-style document focused on cross-cutting reads
("invisible seams" — couplings, missed axes, propagating
assumptions, framings that compose oddly across the four
notes; "serendipitous observations" — connections that emerge
from cross-reading).

### Prompt (verbatim)

```
You are commissioned as a firewall-style fresh review of four
design-space notes recently authored for the LengYue project —
a spaced-repetition Go study tool structured as a soft monorepo
with frontend (Vue 3 + TypeScript SPA), backend (FastAPI +
SQLAlchemy), and proxy (KataProxy submodule) sub-projects. The
notes explore substrate questions around two user-judgement
surfaces over KataGo analysis packets: an automatic
mistake-finder and a user-defined stability metrics surface.

You arrive cold. That's the feature. The note author has been
deep in the design space for several conversation turns with
the user, accumulating clarifications and revisions. The user
wants an outside-the-momentum read to "fill in the invisible
seams" — places where the four documents don't quite compose,
unstated assumptions that propagate across them, framings that
read elegantly in isolation but have unspoken couplings, axes
that have been missed.

**Read end to end (no skimming) — these are the primary
target:**

1. `/home/bork/w/omega/docs/notes/mistake-finder-design-space.md`
   — the per-move mistake-detection substrate. Three sequential
   revisions are visible in the prose: a channel correction
   (`state_fns` is per-turn, `delta_fn` is per-move), a
   goodness-in-[0,1] universality retraction, and a per-palette
   non-opinionation constraint that reshapes the recommendation.
2. `/home/bork/w/omega/docs/notes/stability-surface-design-space.md`
   — exposing the shelved visit-scaling research arc's stability
   metrics for user judgement. The recommendation is a curated
   extractor catalogue (SPA-side) with forward-compatibility
   plumbing.
3. `/home/bork/w/omega/docs/notes/mistake-stability-surface-synthesis.md`
   — the cross-cutting view; recommends sibling surfaces with
   shared consumer-side infrastructure.
4. `/home/bork/w/omega/docs/notes/mistake-finder-pedagogy-and-followups.md`
   — companion note covering: the win-attribution paradigm and
   the project's stance against it; a cognitive bias around
   un-punished mistakes; the "reason for the move" pedagogical
   hint; and two tangential SPA visualisation features
   (gaps-between-mistakes histogram, delta histogram).

**Read as needed for context (these inform the notes'
vocabulary):**

- `/home/bork/w/omega/docs/adr-synopsis.md` — the project's
  nine ADRs in condensed form. The notes cite ADR-0002 (fail
  loudly), ADR-0003 (portability bands and Port-extraction
  rule), ADR-0005 (documentation discipline), and ADR-0008
  (classification discipline) explicitly.
- `/home/bork/w/omega/CLAUDE.md` (umbrella) — project authoring
  posture and the dispatch-ledger convention for cross-team
  work.
- `/home/bork/w/omega/frontend/CLAUDE.md` if you need
  frontend-specific framing (layering, type-driven design, the
  ACL boundary).

Don't go further than that into the codebase — your job is to
read the design notes, not validate them against the
implementation. If a note flags an unverified assumption, treat
it as a flagged assumption rather than a research target.

**Produce:** a single note at
`/home/bork/w/omega/docs/notes/mistake-stability-firewall-consult.md`,
length **250–400 lines** (hand-wavy, not strict; quality over
count). Frontmatter following the other notes' style (Status /
Date / Scope / Genre). Date is 2026-05-28.

**What's wanted in the body:**

- An honest synthesis-style read. Look for what emerges when
  the four documents are read together that isn't visible
  reading them individually.
- "Invisible seams" — places where the documents have couplings
  the author may not have foregrounded; axes that are missed;
  assumptions that propagate silently; framings that compose
  oddly across the four notes; tensions between recommendations
  that aren't surfaced.
- Serendipitous observations — connections, analogies, or
  implications that emerge from the cross-reading.
- Specific citation. Reference file paths and section names;
  quote where useful. The user can navigate from your text back
  to the source.
- A *frank* posture. You are not the original author. You can
  name where the synthesis note overclaims symmetry, where the
  pedagogy note may not have fully reckoned with its own
  implications, where the stability note's
  "forward-compatibility" framing might be doing too much work,
  where the mistake-finder's revisions left vestigial framing.
  Be direct but not aggressive; the goal is illumination, not
  score-keeping.

**What's NOT wanted:**

- Don't tear down or aggressively critique. The notes are
  explicitly exploratory; many decisions are deferred by
  design. Naming what's been deferred isn't a finding unless
  the deferral itself creates tension with another note's
  recommendation.
- Don't author yet another design-space exploration. The task
  is synthesis review, not extension. If a seam suggests a
  concrete next-step probe, name it; don't manufacture new
  options.
- Don't write a summary of each document. The user already
  knows what's in them. Synthesis means the cross-cutting view,
  not the per-document recap.
- Don't include implementation recommendations beyond what
  surfaces organically from the synthesis. The notes themselves
  carry their recommendations; your job is to surface what
  those recommendations don't quite say to each other.
- Don't commit or push. Write the file to disk and stop there.

Be specific. Be direct. Look for what's actually interesting
at the seams.
```

### Response

The agent wrote the response directly to disk at
`docs/notes/mistake-stability-firewall-consult.md` (lines 1-466
in its initial form, 467 with trailing newline; extended later
to 585 lines by the round-table follow-up appendix authored by
the original note author, not the consult agent). The original
agent-authored portion is the file content from its first line
through the closing horizontal rule that precedes the
"Round-table follow-up (2026-05-28)" heading. The follow-up
appendix is identifiable by its explicit section heading and is
not part of the verbatim consult response.

The consult identified five invisible seams (non-opinionation
asymmetry; "zero substrate growth" misleading; conflated
wire-shape prerequisites; aggregation-across-positions gap;
stateful-closures-as-the-rock framing), three vestigial framings
(robust-child-palette as "canonical"; "single source of truth"
applied across non-overlapping axes; the synthesis note's
"DSL-shaped already" claim), and four serendipitous observations
(three-scale "lift at second consumer" cascade; degenerate-
distribution-rejection as cross-surface pattern; cards-vs-mistakes
triage state amnesia; substrate growth asymmetry between proxy
and SPA sides).

The agent ended with a procedural suggestion: bundle three
co-pending wire-shape reads (mistake-finder's selector
emission, pedagogy's PV reachability, stability's per-preview
field presence) into a single enricher-emission-path study.

## Consult 2 — Round-table on the binary `delta_ordering` flag

### Invocation context

After the firewall consult was delivered, the project author
surfaced a follow-up proposal:

> a binary flag on the semantics of delta in terms of ordering
> (though that presupposes ordering is independent of color,
> but if it isn't then a simple change of variables — even if
> scalene, like if you have two players of widely different
> playing strength and you want different metrics for each —
> could theoretically be cramped into that shape. Whether
> we're unopinionated or not, it's my feeling that this should
> cover a huge swath of the design space regardless, but I'd
> also be happy to be proved wrong, and I'm not just saying
> that to be glib).

The author framed the exchange as a "round-table of three"
(project author, original note author, consult agent) and
asked for the consult's opinion before any amendments were
made to the design notes.

### Prompt (verbatim)

```
You are continuing the firewall consult role on the
mistake-finder substrate question. The previous consult
delivered an end-to-end synthesis at
`/home/bork/w/omega/docs/notes/mistake-stability-firewall-consult.md`
— please read that note end-to-end first, then read the four
original design notes if you need to refresh context:

1. `/home/bork/w/omega/docs/notes/mistake-finder-design-space.md`
2. `/home/bork/w/omega/docs/notes/stability-surface-design-space.md`
3. `/home/bork/w/omega/docs/notes/mistake-stability-surface-synthesis.md`
4. `/home/bork/w/omega/docs/notes/mistake-finder-pedagogy-and-followups.md`

The project author has now surfaced a follow-up proposal on the
mistake-finder substrate question. The framing for this
exchange has become a "round-table of three" — project author,
original note author, and you. The author asked for the round
table's opinion on a candidate that may have been
low-hanging-fruit-shaped enough not to glare in the original
design space.

Their framing, verbatim:

> a binary flag on the semantics of delta in terms of ordering
> (though that presupposes ordering is independent of color,
> but if it isn't then a simple change of variables -- even
> if scalene, like if you have two players of widely different
> playing strength and you want different metrics for each --
> could theoretically be cramped into that shape. Whether we're
> unopinionated or not, it's my feeling that this should cover
> a huge swath of the design space regardless, but I'd also be
> happy to be proved wrong, and I'm not just saying that to be
> glib).

**The proposal in concrete shape** (the note author's reading;
verify or correct):

Add a binary field to `AnalysisPalette`, something like
`delta_ordering: 'lower_is_worse' | 'higher_is_worse'`, where
each palette declares which direction of its `delta_fn`'s
output counts as bad. The mistake-finder consumer (and any
other ranker) reads this declaration alongside `delta_fn`'s
output to sort moves. For palettes whose ranking needs more
than a direction declaration — color-asymmetric metrics
("scalene"), MoveView-context-dependent weighting, asymmetric
blunder severity curves — the palette author falls back to the
more expressive `move_selector_fn` shape, which still exists
as the escalation path.

**The author's claim:** this shape covers "a huge swath of the
design space" without forcing every palette to author a
`move_selector_fn` expression.

**The substantive question for the round-table:**

Is the author right that this covers a huge swath? What seams
does the binary-flag shape have that aren't visible at first
read? Given that the mistake-finder note's Option α currently
recommends `move_selector_fn` reuse as the per-palette
declaration mechanism, what does the binary-flag candidate do
to that recommendation:

- Replace it (binary flag is the new α; `move_selector_fn`
  becomes only the escalation path)?
- Supplement it (graceful-degradation: binary flag for the
  common case, `move_selector_fn` for the expressive case)?
- Expose where Option α was overspecified (the per-palette
  work the firewall consult flagged as a hidden cost is mostly
  just "pick a direction")?

Cross-reference your prior consult's findings — especially
Seam 1 (non-opinionation asymmetry) and Seam 2 (Option α's
"zero substrate growth" is misleading). Does the binary-flag
candidate change either reading?

Also: the author's "scalene" framing — does it actually hold?
If a palette's per-color metrics aren't comparable on the same
scale (player A measured in score-points, player B in winrate),
can the binary-flag-plus-`delta_fn`-change-of-variables really
absorb that? Or does that case force escalation to
`move_selector_fn` (or to per-color partitioning in selection
policy, which is a separate axis)?

**Format:** direct prose, conversational round-table register.
Not another full note. **Keep it tight** — a few paragraphs,
not exhaustive enumeration. The user will read it; the note
author will fold whatever lands cleanly into amendments.

**Posture:** same as the prior consult. Illumination over
score-keeping. Frank where frankness illuminates. If the
author is right, say so clearly and name what that means for
the substrate. If the proposal has a seam the author hasn't
seen, name it specifically. If it's an over-promise on the
"huge swath" claim, identify the cases it doesn't cover.

Output as your response text — no file write needed this time,
just the response.
```

### Response (verbatim)

The agent's response is reproduced below in full. The agent
returned the response as a single text block; the section
headings and emphasis are the agent's own.

---

I have the full context now. Let me think through the proposal
carefully and draft the round-table response.

The proposal: add `delta_ordering: 'lower_is_worse' |
'higher_is_worse'` (or similar binary direction-flag) to
`AnalysisPalette`, declaring which direction of the `delta_fn`
output counts as bad. The mistake-finder consumer reads this
alongside `delta_fn` to sort. For palettes where direction-flag
isn't enough (asymmetric metrics, MoveView-context-dependent
weighting), the palette author falls back to
`move_selector_fn`.

Let me work through this carefully against Seam 1, Seam 2, and
the "scalene" claim.

**On the proposal's coverage claim — does the binary flag
cover "a huge swath"?**

The relevant axes from the design space note §"What is a
mistake":
1. Severity (magnitude of eval drop)
2. Direction (mover's losses count)
3. Game phase
4. Difficulty
5. Recoverability
6. Pattern

The binary flag addresses *only* axis 1 (severity, via
sign-direction interpretation of `delta_fn`). Direction (axis
2 — only mover's losses count) is handled by the existing
per-color selection-policy primitives orthogonally, not by the
palette's own declaration; the binary flag composes with
per-color partitioning without conflict. Phase, difficulty,
recoverability — these need to read `move_index`, the policy
distribution at `before`, `summary_fn` / `round_history` —
none of which a "direction of `delta_fn`" flag reaches.

So when the proposal claims "huge swath": this is true *for
the canonical case* of "rank moves by the magnitude-with-sign
of their evaluation drop." The shipped palettes — robust
child, score-loss family, rank — are all in that canonical
case today. For them the binary flag really does suffice. The
author's intuition matches the current substrate.

**On Seam 2 (per-palette calibration cost) — does the proposal
collapse the hidden cost?**

Yes, materially. The consult's Seam 2 reading was: Option α's
"zero substrate growth" hides a per-palette authoring arc —
every shipped palette needs a `move_selector_fn` expression
that the palette author authors carefully consistent with the
palette's `delta_fn` semantics. That's a calibration arc, not
a one-liner per palette.

The binary flag reduces *that specific cost* to "pick a
direction." For the shipped palettes the consult specifically
named:
- Robust child palette: `lower_is_worse` (goodness in [0,1],
  lower goodness is worse). One bit.
- Score-loss palette with "positive = loss" sign convention:
  `higher_is_worse`. One bit.
- Score-loss palette with "negated, more-negative = loss":
  `lower_is_worse`. One bit.
- Rank palette, default palette: one bit each.

This reads-as-overspecification for Seam 2's reading. The
"per-palette calibration question" of what the palette author
considers "worst move" was, for the shipped palettes, *just a
direction declaration*. The Option α framing makes it look
like it requires authoring a `move_selector_fn` expression
because that's the substrate route; the actual semantic
content is one bit per palette. The consult was right that the
cost is per-palette and right that it's underweighted in
Option α — but the cost it identified is much smaller than the
consult's framing suggested. The author is right to push back.

So Seam 2 partly inverts. The hidden cost is real (every
palette needs an answer), but the answer is one bit, not an
expression. That changes the architectural conclusion: a
one-bit-per-palette schema growth is *cheaper* than a
per-palette expression-authoring arc, and also *more legible*
to UI affordances (a direction declaration is enumerable in a
dropdown; an expression isn't).

**On Seam 1 (non-opinionation asymmetry)**

Seam 1's reading was: mistake-finder ships per-palette
declaration; stability ships curated catalogue. The asymmetry
composed badly at the shared-ranking-composable boundary.

The binary flag doesn't change the asymmetry direction, but
does make the mistake-side authoring story much closer to
"curated + per-palette parametrisation" rather than "fully
user-authored." A direction flag is a structured parameter,
not free-form code. The palette still owns the choice
(non-opinionation preserved), but the choice is constrained to
an enumerable set.

The unified-ranking-composable type signature (the "synthesis
defers this" item) becomes easier: the score function for the
mistake side is `delta_fn(move_view)` with a flag-determined
orientation; for stability it's a catalogue extractor output.
Both reduce to "scalar + sign convention," and the sign
convention is parameter-not-expression on both sides. The
composable's `scoreOf` parameter can be a discriminated union
over (palette-with-direction-flag, catalogue-extractor-with-
known-direction).

So Seam 1 softens noticeably under the binary flag.

**On the "scalene" framing — does it hold?**

The author's hedge: "scalene, like if you have two players of
widely different playing strength and you want different
metrics for each — could theoretically be cramped into that
shape." The hedge is "theoretically" and "cramped" — the
author is already flagging this as a stretch.

The honest answer: it doesn't quite hold for genuinely
asymmetric per-color metrics. If player A's mistakes are
measured in winrate-loss and player B's in score-loss, a
single `delta_fn` returning a single scalar plus a single
direction flag can't represent two incommensurable scales.
The "change of variables" the author gestures at would have to
be color-aware *inside* `delta_fn`'s evaluation — `if
move_view.color == 'B' then winrate_loss else score_loss` —
and that already requires the palette author to read
`MoveView` context inside the expression. At that point you're
back to expression authoring, which is the `move_selector_fn`
escalation path.

But: this is exactly the escalation path the author preserves.
"Falls back to `move_selector_fn` for the expressive case"
handles scalene metrics correctly. The "cramping" the author
worries about is real (you can't squeeze scalene into the
binary flag), but the escalation absorbs it.

There's a subtler case: *per-color partitioning of the ranking
output*. Even with a single homogeneous `delta_fn`, the user
may want "show me B's worst 5 moves and W's worst 5 moves"
rather than "show me the 10 worst pooled." This is the
selection-policy axis (per-color quantile vs pooled), not the
per-palette severity declaration. The binary flag is on the
palette; the per-color partitioning is on the selection
policy (knob-registry). They compose orthogonally. The
author's "scalene" framing partly conflates these — but the
substrate already has them split, so the binary flag doesn't
compromise anything.

**The architectural verdict**

The proposal is the right α. Here's the structural reading:

1. **Replace α as the recommended path.** The binary flag is
   the new α; `move_selector_fn` becomes the escalation path
   (γ-ish, though it's reuse not new substrate). The pedagogy
   note's "rank by per-move signal" requirement is satisfied
   with one bit per palette plus the existing `delta_fn`. No
   `move_selector_fn` authoring needed for v1.
2. **Substrate growth is one schema field**, not zero. The
   original α's "zero substrate vocabulary growth" claim was
   the over-promise; the binary flag's "one enum field" is
   the honest cost. That's a smaller cost than the per-palette
   expression-authoring arc Seam 2 named.
3. **The escalation triggers are still well-defined.** When a
   palette needs scalene metrics, weighted-by-move-context
   severity, or rank-by-non-`delta_fn`-quantity (e.g., visit
   margin), the palette declares a `move_selector_fn` instead.
   The substrate gracefully degrades from "binary flag" to
   "expression"; both can coexist with a precedence rule
   ("`move_selector_fn` if present, else `delta_fn` oriented
   by `delta_ordering`").
4. **The mistake-finder consumer code is simpler.** Reading
   `delta_fn` output and a direction flag is a smaller surface
   than evaluating `move_selector_fn` per move (which carries
   `MoveView` context the SPA may not have fully reconstructed).
   Wire-shape question Seam 3 named gets easier:
   `extra.<color>.deltas` is already on the wire; multiply by
   the flag's sign; rank. No new wire emission needed.

**One seam the author hasn't quite named**

The "more than direction" cases include *one type* that's
worth flagging: phase-aware severity. If the palette author
wants "winrate drops are 2x worse in the endgame than in
fuseki," that's not direction (it's a magnitude-by-context
weighting); it's not scalene (no per-color asymmetry); but it
can't be expressed by a binary direction flag. The escalation
to `move_selector_fn` handles it correctly, but the proposal's
"huge swath" claim should acknowledge phase-weighting as part
of what falls outside the swath, not just scalene.

But phase-weighting is something *no shipped palette does
today*. So for v1 the swath really is huge — most shipped
palettes don't even use the escalation.

**The Seam 3 (PV reachability) note**

Independent of the binary-flag question, the pedagogy note's
"surface the punishment alongside the mistake" requirement
still needs `MoveView.before` / `MoveView.after`'s `pv`
reachable on the wire. The binary flag doesn't change that.
The bundled enricher-emission-path read the consult suggested
still does its three jobs (selector emission, PV reachability,
preview-field presence). The binary flag makes job 1 easier
(it removes the selector-emission question by routing
severity through `delta_fn` instead), but jobs 2 and 3 remain.

Now let me write the response.

---

**Round-table response:**

The author's hunch is mostly right, and it lands in a place
worth naming carefully: the binary flag is the better α, not a
supplement to the existing α.

What it does to Seam 2 (Option α's "zero substrate growth" is
misleading) is the most important thing. The consult's reading
was that the hidden v1 cost was a per-palette
`move_selector_fn` authoring arc — *expressions* authored to
match each palette's `delta_fn` sign convention. The binary
flag exposes what that "calibration arc" actually contains for
the shipped palettes: one bit. Robust child is
`lower_is_worse`, score-loss-with-positive-loss is
`higher_is_worse`,
score-loss-with-negated-loss is `lower_is_worse`, etc. The
"calibration" was overspecified — it's a direction
declaration, not an expression. The consult was right that the
cost was per-palette and right that Option α underweighted it,
but the cost it identified is much smaller than the framing
suggested, and the right architectural move is to size the
substrate to the actual cost rather than route it through
expression-authoring. So: the binary flag *replaces* Option α;
`move_selector_fn` retreats to the escalation path.

On the "huge swath" claim: yes, for the shipped palettes and
probably for any near-future palette in the same family. The
mistake-finder design note's §"axes of what is a mistake"
enumerates six things; the binary flag handles axis 1
(severity, via sign-direction on `delta_fn`) and composes
orthogonally with axis 2 (direction / mover's-losses-count —
which lives in selection-policy per-color partitioning, not in
the palette). Phase, difficulty, recoverability, pattern — the
binary flag doesn't reach those, but no shipped palette uses
them at the `delta_fn` level either. The cases it doesn't
cover are genuinely outside today's swath.

On Seam 1 (non-opinionation asymmetry): softens noticeably.
The mistake-side authoring story shifts from "fully
user-authored expression" to "structured parameter declared
per palette," which is closer to the stability side's
curated-catalogue posture without giving up the user's
ownership of the choice. The unified-ranking-composable type
signature the synthesis deferred gets easier — both sides now
hand the composable a scalar plus a sign convention rather
than a scalar plus a free-form expression contract. The
asymmetry doesn't vanish (stability's score functions are
catalogue-named; mistake's are per-palette-flagged), but it
stops being "expression vs catalogue" and becomes
"parametrised-by-palette vs parametrised-by-catalogue," which
is the same shape at different granularities. That's a much
easier composable to design.

On "scalene": the hedge in the author's own framing
("theoretically be cramped into that shape") is right to be
hedged. The honest answer is that the binary flag plus a
change-of-variables on `delta_fn` can absorb scalene metrics
*only when both per-color metrics are expressible on a single
comparable scalar scale*. If one player is measured in
score-points and the other in winrate, no `delta_fn` returning
one scalar can carry both — you'd need to read
`MoveView.color` inside the expression and emit a calibrated
cross-scale value, which is the kind of thing
`move_selector_fn` exists for. Critically, per-color
*partitioning* of the *ranking output* (show me B's worst 5
and W's worst 5 separately rather than top-10 pooled) is a
different axis — that lives in selection-policy, not in the
palette, and the binary flag doesn't touch it. The author's
"scalene" framing partly conflates these, but the substrate
already has them split, so it doesn't matter — the binary flag
is honest about what it covers, and the escalation absorbs the
rest.

One seam the author didn't name that the round-table should
flag: *phase-aware severity* (winrate drops in endgame
weighted higher than in fuseki) is not scalene and not
directional — it's magnitude-by-context-weighting. It can't be
expressed by a direction flag. It also can't be expressed by
*any* function of `delta_fn`'s single scalar without reading
`move_index` or position context. The escalation to
`move_selector_fn` handles it correctly because `MoveView`
carries that context, but the proposal's "huge swath" claim
should acknowledge that phase-weighting and difficulty-
weighting fall outside the swath alongside scalene. The good
news: no shipped palette does these today, so the swath
really is huge for v1.

One downstream win the proposal collects nearly for free:
Seam 3's wire-shape question gets simpler. The original α
needed the proxy to emit per-move `move_selector_fn` output
on non-adaptive queries (or the SPA to reconstruct it); under
the binary flag, `extra.<color>.deltas` is already on the
wire, the SPA multiplies by the flag's sign, ranks, done. No
new wire emission, no enricher-path question for the
*severity* sub-problem. The PV-reachability sub-problem
(pedagogy note's "surface the punishment") is unchanged —
`MoveView.before.pv` still needs to be reachable in the SPA's
stream — but that's a separate read that has to happen
regardless. So the bundled enricher-emission-path read the
consult suggested becomes a two-job read (PV reachability +
preview-field presence) rather than three-job.

The architectural move the round-table should propose, if the
author wants a one-line summary: rename the substrate growth
from "per-palette `move_selector_fn` calibration arc" to
"one-enum-field schema addition." That's a more honest cost,
a much smaller cost, and a more legible UI affordance (a
dropdown, not an expression editor). `move_selector_fn` stays
in the substrate as the escalation path — for
adaptive_reevaluate's existing use, and for any palette that
genuinely needs expression-level severity authoring — but
it's no longer the v1 carrier for mistake-finder ranking.

A small honest caveat: this also slightly weakens the
synthesis note's "ship curated catalogue first, plumb for DSL
second" framing on the mistake side, because the binary-flag
v1 *is* a curated set of two options rather than an
authoring-DSL surface. That's fine — it makes the symmetry
with the stability side cleaner (curated v1 on both sides;
DSL extension is a deferred third arc on both sides) — but it
does mean the synthesis table's "already DSL-shaped" row for
mistake-surface ("`move_selector_fn` is a palette-author
expression") becomes vestigial under the binary flag and
would want amending.

---

## How the round-table outcome propagated

The agent's response landed cleanly into the subsequent
amendments:

- `docs/notes/mistake-finder-design-space.md` — Option α
  reformulated from `move_selector_fn` reuse to binary
  `delta_ordering` flag; `move_selector_fn` retreats to
  escalation path. A "Historical note on the prior α
  formulation" sub-section preserves the prior framing per
  ADR-0005 Rule 8.
- `docs/notes/mistake-stability-surface-synthesis.md` —
  comparison table updated; the "Forward-compat to DSL: already
  DSL-shaped" row (the vestigial framing the agent flagged) is
  retired.
- `docs/notes/mistake-stability-firewall-consult.md` — a
  "Round-table follow-up (2026-05-28)" appendix records the
  exchange and quotes selected paragraphs from this consult.
  The full verbatim record lives here.

Commits carrying these amendments: `8410e80` (the round-table
substantive amendments), with later commits `71fe314` (ADR-0009
cross-reference), `d8d961d` (TODO entry), `4b116a4` (pedagogy
correction).
