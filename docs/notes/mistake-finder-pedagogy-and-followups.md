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

1. **Don't filter or down-rank un-punished mistakes.** The
   mistake-finder ranks by the substrate's per-move severity
   (per the `mistake-finder-design-space.md` recommendation:
   the palette's `move_selector_fn` output). Whether the
   opponent punished is downstream information — useful for
   the user to *see*, never to filter on. Filtering would
   import the win-attribution paradigm the author explicitly
   rejects.

2. **Surface the punishment alongside the mistake.** When the
   mistake-finder identifies a move as a mistake, the UI
   should present the move *and* what KataGo considered the
   correct response (the principal variation from the
   pre-mistake position) — so the user authoring a card
   doesn't have to dig for it. This is what the substrate
   already gives the consumer: `MoveView.before` /
   `MoveView.after` carry the full pre/post `AnalyzeResponse`,
   so the proxy already has the PV available; the SPA-side
   mistake-finder needs to consume and display it.

3. **Card-mint integration: prompt for the original
   reasoning.** When a mistake is minted into an SR card,
   the mint flow should *prompt* for the original-move
   reasoning (a small text field, "why did you play it?").
   The card content then carries both halves — the wrong
   model and the corrective. This is a small UX addition,
   but it's the load-bearing one for honoring the discriminate-
   via-contrast pedagogy. The flow can optionally pre-populate
   from a placeholder if the user wants to skip (the field
   itself is the prompt; whether the user fills it is their
   choice), and the existing `gradingParameter.data` opaque
   field on the card is a natural carrier for the freeform
   text.

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

- **The exact card-mint UX for capturing the original
  reasoning.** "Prompt for a text field" is the principle;
  the UX specifics (when in the flow it appears, default
  populations, optional vs. required, character limits) are
  for the implementing arc. The existing card-metadata
  inline-edit work (`docs/dispatch/backend-to-frontend-
  card-metadata-inline-edit-arc*-shipped.md`) shipped the
  schema and PATCH route that would carry the freeform
  text; whether to extend the card shape further or to use
  `gradingParameter.data` is an authoring-time decision.
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
