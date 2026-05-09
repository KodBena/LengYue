# Autonomous SRS loop — exploratory design note

Status: idea, not scheduled. Captured here because the components
that surfaced from the review-session-deltas investigation are
load-bearing for it.

## The thought

The fuzzing harness in `frontend/tests/e2e/` already drives a real
review session against two KataProxies — strong (review-time
analysis) and weak (human-simulator). The pieces that make this
work — `playEngineMoves`, `queryEngineMove`, `seedTestUser`,
`seedTestCard` — are exactly the pieces needed to run the spaced-
repetition loop *autonomously*, with a non-human "player" exploring
positions over time.

Concretely:

1. The autonomous player gets a queue of due cards from the backend
   (same as a human session).
2. For each card it produces a move via some policy.
3. The standard review pipeline scores the move and posts the
   delta back to the backend, mutating the Ebisu model.
4. The next session gets a fresh due-card sample shaped by those
   updates. The card forest evolves.

## Why this is psychedelic

The forest grows asymmetrically. A weaker autonomous policy
explores positions where the strong engine has high-information
moves to score; a stronger policy converges on "obvious" reviews
that quickly hit `model.alpha + model.beta` saturation and stop
generating new branches. Mixed policies — tactical vs positional,
narrow vs broad — produce qualitatively different review forests
even from the same starting deck. Watching the forest shape is
itself a diagnostic for the SRS scheduler.

## Policy options

The harness's current "weak proxy at 10–30 visits" is one policy.
Others worth running:

- **Visit ladders**: cycle the autonomous player's visit budget
  through a range so the forest accumulates moves from a spread of
  strengths rather than a single calibration point.
- **Multiple weights**: run with different KataGo network sizes if
  the proxy registry exposes them. Each network has its own bias;
  the union explores positions a single network's moves would
  funnel away from.
- **LLM at the seat**: an LLM generates a move *intent* in natural
  language ("attach underneath, then turn"), then a KataProxy
  query is shaped to find the most-visited candidate matching that
  intent. The LLM never sees coordinates directly — it reasons
  about shape, the proxy outsources the move-legality and
  candidate-selection. This separates "judgement under
  uncertainty" (LLM strength) from "tactical accuracy" (KataGo
  strength), which is the inversion of how humans typically pair
  them.

The interesting policies are the ones that don't dominate or get
dominated by the strong-proxy reviewer — they produce the densest
information per move. A pure ResNet at low visits is too weak; a
pure ResNet at high visits is too strong; the LLM-at-seat shape
might land in the productive middle.

## The "non-political" sample DB

A second-order benefit: the autonomous-loop sessions produce a
card forest that is by construction not derived from games of
specific human opponents. Some of the project's existing card
material comes from games against human players who may have a
non-trivial relationship with the project author; an autonomously-
generated parallel deck side-steps that entirely. It's a sample
DB that ships with the project as a neutral fixture — useful for
demos, regression tests, and onboarding — without depending on
permissions or feelings about the source games.

## Components that already exist

- `frontend/src/composables/usePlayFromPosition.ts` — the
  composable wraps engine self-play with a reactive `isRunning`
  / `lastError` / `stop` surface, and exports `playEngineMoves` /
  `queryEngineMove` as pure async primitives. The harness uses
  the pure form; the autonomous loop would use the composable form
  to surface progress to a watcher UI.
- `frontend/tests/e2e/seed.ts` — `seedTestUser` /
  `seedTestCard`. Reusable as-is for autonomous identity bring-up.
- `frontend/src/composables/useReviewSession.ts` — the loop the
  autonomous player would drive. After the path-scan + Promise.all
  fixes, robust to the cache-race that previously surfaced as
  silent `0.5` reviews.
- The flat `visit_ratio` palette in the harness — directly
  interpretable scores, useful for the autonomous loop's policy
  to consume as a reward signal if it learns from feedback.

## What's missing

- A driver loop that asks the backend for the next due card,
  invokes the policy, calls `processUserMove`, records the result.
  The harness has all the steps; what's missing is the policy
  abstraction and the multi-card progression.
- Card-forest visualisation: the existing tree-layout composables
  could render the autonomous loop's growing forest in real time,
  which is half the appeal.
- Decision: where does the autonomous loop run? In-browser via a
  dev affordance? As a Node script? The harness's standalone-Vitest
  posture means a Node runner is feasible without bringing up a
  browser, which is probably the right shape for long-running
  exploratory sessions.

## License

Public Domain (The Unlicense).
