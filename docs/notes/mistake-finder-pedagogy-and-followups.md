# Mistake-finder pedagogy and follow-up features

- **Status:** `design-note: exploratory`
- **Date:** 2026-05-28
- **Scope:** pedagogical posture and API-shaping observations
  for the mistake-finder feature, plus two tangentially-related
  SPA visualisations the project author has wanted for a while.
  Companion to `mistake-finder-design-space.md`,
  `stability-surface-design-space.md`, and
  `mistake-stability-surface-synthesis.md`.
- **Genre:** capture. The project author surfaced four threads
  in one conversation turn (2026-05-27 / 2026-05-28) on the
  shared topic of mistake review; this note records them so
  they're act-on-able rather than lost to memory. Per the
  author's framing: "they need to be recorded in order to act
  on it."

## Win attribution as a paradigm — and why this project doesn't pursue it

The project author named the "win attribution" framing
directly: explaining why someone tends to win a game (or
games) — including by accounting for opportunities the
opponent failed to punish. Mistakes that go unpunished
*matter* under this framing because they explain the win
without explaining the play.

The author's stance on this paradigm: not a fan. The
quoted framing:

> I'm not a fan of this paradigm of "discovering how to
> beat opponents" but it's a common theme in chess anyways,
> or so I've been told; I prefer the paradigm of "understand
> the game on its own merits".

The "accumulant variant" the author flagged is the
session/game-cumulative form of win attribution — across
many games, where do this player's wins come from? — which
sharpens the "discovering how to beat opponents" reading by
making it statistical. The project deliberately does not
adopt this orientation. The mistake-finder is not a
scouting tool.

**Consequence for the mistake-finder.** The feature surfaces
mistakes-as-such, not mistakes-conditional-on-punishment.
An un-punished mistake is still a mistake by the substrate's
own evaluation (the palette's `delta_fn` doesn't know whether
the game continued correctly afterward); the consumer
shouldn't filter or down-rank it on the basis of "the
opponent didn't capitalise." Filtering by punishment-status
would import the win-attribution paradigm by the back door.

### The winning-vs-improving distinction (motivating the stance)

The author's motivation for rejecting the win-attribution
paradigm sharpens into a population-level observation about
how it harms its adherents:

> Think of it as a hint to beginning learners who are
> serious about improving, not just about winning (and you
> can see the distinction easily — those who are just out
> to win fall behind precisely because they have a
> blind-spot of "opponent failed to punish, therefore my
> move was fantastic".)

The winning-vs-improving distinction is the cohort axis
the project's pedagogy serves. The blind-spot framing
("opponent failed to punish, therefore my move was
fantastic") is the *exact* expression of the cognitive bias
the next section names — at the individual move level for
the player, and at the population level for the paradigm.
The two sections — win-attribution rejection and
under-processing-of-un-punished-mistakes — are the same
phenomenon read at two scales.

## The cognitive bias when reviewing one's own mistakes

The author's observation, in the dual perspective — applied
to one's own play rather than to an opponent's:

> when *we* review our mistakes and make a note of them, we
> might forget to make a note of how to punish it, if it
> turns out that the opponent failed to do so (...) instead,
> we just think "oh, I should have played here" and then we
> go on to forget what the problem really was there.

This is the same phenomenon as the win-attribution
paradigm's selective inattention, but pointed inward. When
the opponent failed to punish, the post-game review
under-processes the mistake — substituting "I should have
played X" for the (more useful) "Y was bad because the
punishment is Z."

### Name of the bias

The author asked whether there's a precise name for this
"sibling bias to confirmation bias." There isn't, in any
formal sense — the closest standard terms are:

- **Outcome bias** — judging a decision's quality by the
  outcome it produced, rather than by the soundness of the
  decision-making process. Under outcome bias, an un-punished
  mistake reads as "fine, actually" because the outcome was
  fine, even though the move's quality was bad. Documented
  in the cognitive-psychology literature; the closest
  standard match.
- **Resulting** / **results-oriented thinking** — informal
  poker parlance for outcome bias applied to
  probabilistic-decision domains. Popularised by Annie
  Duke's *Thinking in Bets*. Fits the Go context closely
  because the cognitive shape is the same: probabilistic
  decisions whose quality and outcome can diverge.
- **Counterfactual neglect** — not a standard term but used
  occasionally for "we under-process what could have
  happened when nothing did." Captures the part of the bias
  that outcome bias proper doesn't quite name (the
  unrealised punishment is a *counterfactual*).

Neither outcome bias nor resulting is a formal sibling of
confirmation bias (confirmation bias is about evidence
selection; outcome bias is about decision evaluation), but
the shared shape is "we selectively under-process
information that doesn't bear on the outcome we noticed."
The informal "sibling" framing the author used reads as
shape-similarity, not lineage.

## The "reason for the move" principle

The author's prescription, follow-on to the bias observation:

> in fact, it's useful to record the reason we played the
> move to begin with so we can discriminate that against the
> punishment for better memory anchoring.

The pedagogy: when a mistake is recorded for review, both the
*original reasoning* (why I played the move) and the
*punishment* (why the move was bad) are load-bearing for
memory anchoring. The original reasoning is what the
reviewing player carries forward as the *wrong* model; the
punishment is the corrective. Recording only the punishment
without naming the wrong model leaves the wrong model
implicit, harder to dislodge, more likely to recur.

This is a discrimination-via-contrast pedagogy — the same
cognitive principle Spaced Repetition relies on at the
between-cards level applied within a single card. The card's
content should let the reviewer mentally walk through
"here's what I was thinking → here's why it was wrong →
here's what punishes it" rather than just "here's what was
wrong."

## API implications for the mistake-finder

The pedagogical posture above isn't ornamental — it shapes
what the mistake-finder must do and must not do. Three
concrete consequences:

1. **Un-punished mistakes deserve *active emphasis*, not parity.**
   Earlier framing of this item ("don't filter or down-rank
   un-punished mistakes") was too weak; the project author
   clarified (2026-05-28) that un-punished mistakes are
   *more* important to surface than punished ones, because
   they require red-flagging against the user's natural
   laziness. The diligent-student UI behaviour is to study
   one's own delta panel and hide the opponent's chart to
   unclutter — exactly the move that conceals when an
   opponent failed to punish. The mistake-finder must
   counterweight this: detect the "user-mistake followed by
   opponent-mistake" consecutive pattern and surface it with
   emphasis the user cannot accidentally hide.

   The substrate already provides the data: both colours'
   per-move severity scalars flow through the per-palette
   ranking (`mistake-finder-design-space.md` Option α —
   `delta_fn` oriented by the palette's `delta_ordering`
   flag); the consecutive-mistakes pattern is a join across
   moves the SPA can compute locally.

2. **The opponent's-follow-up position is where the diligent
   card goes.** A subtle but load-bearing pedagogy point the
   earlier note framing inverted. When you mint an SR card to
   learn from your mistake, the *position of interest* is not
   your move — it's the position *after* your move, where the
   opponent's punishment was or should-have-been played. The
   project author's framing, verbatim:

   > we played a mistake because we couldn't see the
   > punishment.

   The diligent student adds the card on the opponent's
   follow-up position because that's where they need to be
   able to read the punishment to recognize, at their *own*
   move, that the move was bad. The mistake-finder's
   card-mint affordance should default-target the
   opponent's-follow-up position, not the user's mistake
   position. The user's mistake position is the *finding*
   that surfaces the card; the opponent's-follow-up
   position is the *study target* the card carries.

   The substrate has the data: `MoveView.before` /
   `MoveView.after` carry the full pre/post `AnalyzeResponse`,
   and the principal variation from the pre-mistake position
   names the punishment. The SPA-side mistake-finder needs
   to consume the PV and the post-mistake position; the
   former populates the card's "what should have been
   played" surface, the latter is the position the card
   actually points at.

   **Target-audience caveat.** The project author flagged
   that this pedagogy is "for the ideal and diligent
   student, not players given to trickplay and other
   insincere people." Trick-play players' worldview is
   win-attribution-shaped — find moves that work because the
   opponent fails to punish — and excluded from the pedagogy
   this note articulates. The mistake-finder is designed for
   the diligent cohort; it does not need to defend against
   trick-play readings of its output.

3. **The "reason for the move" principle is a pedagogical
   hint, not an API requirement.** Earlier in this note the
   discriminate-via-contrast pedagogy was translated into "the
   mint flow should prompt for original-move reasoning" — that
   was overreach. The project author corrected the framing
   (2026-05-28):

   > "capturing original reasoning" was more like my
   > expert(-ish, I'm mid-high dan amateur) pedagogical
   > opinion on what users should keep in mind. Of course
   > the cards themselves can record this and surface that
   > accommodation (...) but it will be a great deal of work
   > for the card set curator, probably more than any
   > player is willing to commit to.

   The technical capability exists: SR cards can carry
   freeform text (via `gradingParameter.data` or analogous),
   and a card-set curator who chooses to author original-
   reasoning notes can do so. Whether the *mint flow*
   surfaces a prompt for it is a UX cost-benefit call
   weighing pedagogical value against authoring burden, and
   the author's view is that the cost is too high to make it
   a default prompt. The pedagogy belongs in user-facing
   guidance (the eventual long-term home named below), not
   in a hard-coded mint-flow step.

These three together are the "API" — not in the wire-shape
sense, but in the sense of what the feature commits to as a
contract with the user's workflow.

## Two follow-up SPA features (tangentially related)

The author named two visualisation components that have been
"pensile" for a while:

### Histogram of gaps between mistakes

Distribution of move-count distances between consecutive
mistakes within a game (or analysis range, or session). The
input is the same per-move ranking signal the mistake-finder
consumes (per-palette `move_selector_fn` output thresholded
or filtered to a worst-set); the histogram's bins are
move-count gaps.

Possible uses include: spotting "patches" of high-mistake
density vs. clean stretches; comparing across games or across
players to see whether mistakes cluster or scatter. The
project author has not enumerated specific reads they want
from this view; the histogram is the substrate that supports
whichever reads emerge.

### Histogram of deltas

Distribution of per-move `delta_fn` output across the
analysis range or session. The input is the raw per-move
move-evaluation signal already on the wire as
`extra.<color>.deltas`; the histogram's bins are
delta-value ranges.

This is essentially a "what does the move-evaluation
distribution look like for this game?" view — calibration-
adjacent. Useful for spotting whether the bulk of moves are
near a palette's neutral point with a long tail, or whether
the distribution is bimodal (which would suggest a different
character of play than a unimodal one).

### Placement and scoping

Both are chart-components, candidate homes under
`src/components/charts/`. They consume the per-move signals
the mistake-finder already requires, so they compose with
its implementation arc rather than competing with it — once
the per-move severity wire is honest (whether by the
mistake-finder's α option emitting `move_selector_fn` output
or otherwise), both histograms are downstream consumers of
the same data.

They are explicitly *not* on the mistake-finder's critical
path; they're independent features that share substrate. The
author flagged them as "only tangentially related" to the
current substrate-design thinking, and the note honours that
framing — they're listed here for capture, not as
prerequisites.

## Where the pedagogical material eventually lives

The author named the eventual placement as undetermined:

> These pedagogical remarks should probably be recorded for
> the benefit of users somewhere, but it does have bearing
> on how the mistake finder is actually used in practice and
> what it's "API" should look like.

The doc-graph candidates for the user-facing pedagogy half:

- `docs/handoff-current.md`'s "What this product is" section
  already enumerates five "vantage points" on the project's
  pedagogy (fearlessness, reading-as-discipline,
  no-demoralisation, heredity-offload, compression-not-
  memorisation), with the explicit framing that the list is
  partial. The win-attribution-rejection posture and the
  discriminate-via-contrast principle are natural additions
  to that list — the section's existing tone is conducive.
- `FEATURES.md` — the user-facing tour. The mistake-finder
  will get a tour entry when it ships; the entry can
  reference the pedagogical motivation. But `FEATURES.md` is
  descriptive of capabilities, not motivational prose; the
  detailed pedagogy lives elsewhere.
- A new `docs/pedagogy.md` (or `docs/notes/pedagogy.md`) —
  if the volume of pedagogical material grows beyond
  handoff-current.md's section, a dedicated home is the
  cleaner answer. Premature today; the existing section is
  the natural extension target for now.

This note is the *capture*, not the canonical long-term
home. When the mistake-finder feature ships, the pedagogical
half of this material migrates (per ADR-0005 Rule 1: single
source of truth per nominal handle) into whichever location
becomes the user-facing canonical reference. Until then,
this note carries the substance.

## What this note does not settle

- **Whether the eventual user-facing pedagogy doc surfaces
  the "reason for the move" principle as guidance.** Per the
  author's clarification, this is the right home for it (a
  hint to serious-improvement learners), as opposed to a
  mint-flow prompt. The exact framing and wording is for the
  doc author when that doc materialises.
- **Where un-punished-mistake annotation lives.** The
  recommendation says "surface the punishment alongside
  the mistake" but doesn't pin down whether
  "un-punished-ness" is a first-class label on the card or
  an inferable property from the recorded analysis. The
  pedagogy says treat them the same as punished mistakes;
  the data model question of whether to record the
  punished/un-punished flag separately is open.
- **The eventual long-term home of the pedagogical
  material.** Per the section above — `handoff-current.md`'s
  vantage-points section is the natural extension target for
  now, but if pedagogical material grows further, a
  dedicated `docs/pedagogy.md` emerges as the right home.
- **Histogram bin choice.** Both histograms have substrate
  questions (linear vs. log bins, fixed vs. adaptive
  bin-count, per-color partitioning vs. pooled) that the
  implementing arc settles. The author has not committed to
  defaults; the implementing arc proposes and the author
  calibrates.

## Gaps in this note's grounding

- The bias-name discussion stands on standard
  cognitive-psychology references (outcome bias) and on
  Annie Duke's poker-context popularisation (resulting). No
  formal-literature citation was consulted; if a precise
  formal reference is needed, the implementing arc verifies.
- The pedagogical observations are quoted from the project
  author's stated views in the 2026-05-27 / 2026-05-28
  conversation; they are not synthesised. Per the standing
  preference recorded in
  `[[feedback_dont_author_product_thesis]]`, the note does
  not attempt to unify these into a single pedagogy thesis —
  they're recorded as named vantage points consistent with
  the existing `docs/handoff-current.md` § "What this
  product is" framing of partial-enumeration.
- The card-mint integration recommendation cites
  `gradingParameter.data` as the natural carrier for the
  freeform text. The handoff document flags that field as
  "the most opaque field in the domain model — `Record<string,
  any>`"; whether the SPA's existing mint flow already
  writes to it is asserted on the basis of the handoff's
  description, not verified by reading the mint composable.
- The two histogram features' specific charting library
  affordances (whether the existing `HeatmapChart.vue` or
  `AnalysisDashboard.vue` provides reusable histogram
  primitives) were not investigated. Implementation arc
  surfaces this.
