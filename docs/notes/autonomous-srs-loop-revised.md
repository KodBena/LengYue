# Autonomous SRS loop — revised design note

Status: design-note: revised (2026-05-09, post-SELECTOR + capability-
negotiation shipping). Supersedes the planning-time record at
`docs/notes/autonomous-srs-loop.md` per ADR-0005 Rule 8 (sibling
revisions over silent edits). The original captured the idea-space
when the load-bearing components were still speculation; this
revision is the pre-implementation note now that those components
have shipped end-to-end (proxy v1.0.14 capability negotiation,
v1.0.15 SELECTOR role, frontend `playEngineMatch` / `usePlayMatch`
+ engine-match modal). What was "if the proxy registry exposes
networks" is now "the SPA toolbar already lets you pick one."

This note proposes a first-slice shape for the autonomous loop and
takes positions on the open questions the planning-time record
left for later. Each position carries a "revisit when…" hook so
specific decisions can be pushed back on without a full redesign.

## Why this revision exists

Three things changed between the original and now:

1. **SELECTOR is real.** The "Multiple weights" policy in the
   planning-time record was conditional on the proxy gaining a
   model-selection mechanism; that mechanism shipped as proxy
   v1.0.15. Per-query `model: <label>` routing is on the wire,
   `availableModels` is in the frontend store, and the SELECTOR
   Toolbar dropdown is the user-facing affordance. Multi-weights
   policies are no longer a "wait for infrastructure" item.

2. **Engine-vs-engine match shipped.** `playEngineMatch` (pure)
   and `usePlayMatch` (composable) drive a per-color match against
   one WebSocket; the SELECTOR's per-upstream pool fans alternating
   queries out. The match modal lets a user trigger this from any
   board position. This is a *new* primitive the original didn't
   anticipate — it gives the autonomous loop a "play forward from
   here" capability beyond the original's "play one move and have
   the review session score it" shape.

3. **Per-query capability negotiation shipped.** Proxy v1.0.14's
   per-query `capabilities` field lets the loop opt out of
   `delta_analysis` (skip the enricher for raw throughput
   measurement), opt in to `adaptive_reevaluate` with custom
   `worst_quantile` / `extra_visits` metadata, etc. The loop has
   finer-grained control over what the proxy does on each query
   than the planning-time record assumed.

Plus a fix surfaced during end-to-end testing: the analysis ledger
now keys on the SELECTOR target (model leg in the descriptor hash),
so a loop that interleaves queries against different networks
produces clean per-network ledger buckets without cross-pollination.

## The substrate, post-SELECTOR

What the loop can compose from today, organised by where each
piece lives:

**Frontend pure async primitives** (`src/composables/usePlayFromPosition.ts`):
  - `playEngineMoves` — single-engine self-play forward from a
    starting board.
  - `queryEngineMove` — one-shot top-move query at the current
    board's turn.
  - `playEngineMatch` — engine-vs-engine match with per-color
    `{model, maxVisits}` (new since the planning-time record).

  All three accept optional `model` + `capabilities` per the
  shipped wire contract. The pure form takes its own
  `katagoUrl` per call, so the loop can address the SELECTOR
  directly without touching the SPA's singleton.

**Frontend reactive composables** (same file):
  - `usePlayFromPosition(boardIdRef)` — single-engine, reactive
    `start/stop/isRunning`.
  - `usePlayMatch(boardIdRef)` — engine-vs-engine, same lifecycle
    (new since the planning-time record).

  Useful for an in-browser observer slice (deferred per the
  runtime decision below); the Node-script form uses the pure
  primitives directly.

**Frontend SR composable** (`src/composables/useReviewSession.ts`):
  - `processUserMove` — robust against the cache-race that the
    planning-time record's review-session-deltas investigation
    surfaced and fixed; safe to drive from a non-human "player."

**Test-harness seed helpers** (`tests/e2e/seed.ts`):
  - `seedTestUser`, `seedTestCard` — reusable as-is for
    autonomous identity bring-up.

**Standalone-Vitest harness pattern** (`tests/e2e/review-session-harness.test.ts`):
  - The reference for env-var-gated, node-env, real-backend +
    real-proxy-driven flows. The autonomous-loop runner adopts
    the same shape — see runtime decision below.

What's missing remains roughly what the planning-time record
named, with the gaps narrowed:
  - The driver loop itself (orchestration of card → policy → score → record).
  - A `Policy` abstraction the loop dispatches against.
  - Result logging (SGF / CSV / both — open question below).
  - Card-forest visualisation in real time (deferred to its own slice).

## The loop's shape — three abstractions

Three minimal abstractions name themselves cleanly:

  - **`Driver`**: the per-iteration orchestrator. For each iteration
    it (a) obtains a card to work on, (b) hands it to the policy
    for a move, (c) calls the review-session machinery to score the
    move and post the delta, (d) records the result. The driver
    owns the loop's lifecycle (start / stop / per-iteration error
    handling).

  - **`Policy`**: a function from `(boardState, cardMetadata, drawCount)`
    to a move. The signature is small on purpose so policies stay
    composable and testable in isolation. A policy may issue any
    number of proxy queries internally (a visit-ladder policy
    queries at multiple visit budgets and picks; an LLM-at-seat
    policy queries a Python-side LLM for an intent and then a
    KataGo query shaped to find the candidate matching it).

  - **`Recorder`**: writes results back. At minimum: review
    submission to the backend (the existing path). Optionally: a
    log file with one entry per iteration (position, played move,
    delta, recall update, policy name) for post-hoc analysis.

A scheduler abstraction is *not* called for at this slice — the
backend's due-card endpoint already handles "what's next."
Scheduling becomes interesting once policies start generating
*new* cards (the match-as-card-generator policy below); revisit
the abstraction at that point.

A watcher abstraction is also not called for at this slice — the
Node-script form logs to stdout; the SPA opened separately
displays the card forest as backend updates land. If the in-
browser observer slice ships later, that slice introduces the
watcher.

## Where the loop runs

**Decision: Node script via the Vitest-harness pattern, for the
first slice.**

The runner lives at something like `frontend/scripts/autonomous-srs-loop.ts`,
follows the same env-var-gated invocation shape as
`tests/e2e/review-session-harness.test.ts` (`AUTONOMOUS_PROXY=ws://...`,
`AUTONOMOUS_BACKEND=https://...`, etc.), runs under node-env via
`tsx` or as a Vitest test scoped to never auto-run. Long-running
sessions are headless; clean Ctrl-C tears the loop down; output
flows to stdout and a result log file.

Why this over an in-browser dev affordance:
  - Long-running exploratory runs (the original note's "watch the
    forest grow asymmetrically over hours") chew browser tab
    lifetime; a closed tab kills the loop.
  - The harness already proves the pattern: standalone Vitest under
    node-env, real backend + real proxy, env vars for instance
    selection. Reusing that pattern means the runner inherits the
    pattern's solved problems (jsdom WS defects, jwt storage
    polyfills via `tests/setup.ts`, env-var skip behaviour).
  - Headless = no UI churn during runs. The SPA opened separately
    shows the card forest growing via the existing card-tree views;
    the user gets the live observation without the loop running
    in the same process as the UI.

Why an in-browser dev affordance is the natural follow-on slice:
  - It's the demo / onboarding artefact the project benefits from
    publicly. "Click here, watch engines explore" is a compelling
    surface that "ssh in, run a script, open the SPA in another
    window" is not.
  - The composable form (`usePlayMatch`-shaped, but for the
    autonomous loop) lets the SPA host a panel that surfaces
    `isRunning` / `currentCard` / `lastDelta` reactively. Builds
    naturally on the engine-match panel pattern.
  - Browser-tab-lifetime is fine for short runs (50 iterations,
    let it finish, close tab). Long runs use the Node form;
    short interactive runs use the SPA form. Two surfaces, one
    domain logic.

The Node-first decision means `Policy` and `Recorder` are pure-TS
modules importable from both the script and (later) the browser
composable — the abstraction line lives below the runtime choice.

**Revisit when:** the in-browser observer slice opens. At that
point we'll know whether the abstraction line was drawn correctly,
or whether the script and the composable need to share less than
expected.

## First slice — concrete shape

Smallest implementable loop that exercises the substrate
end-to-end. Explicitly *not* multi-network or LLM-policy on this
slice; the orchestration's correctness has to be solid before the
policy space opens.

  - **Identity**: a dedicated autonomous user, bootstrapped via
    `seedTestUser` from the harness. The loop never authenticates
    against a real human's account — keeps the "non-political"
    benefit (below) load-bearing from day one.
  - **Card source**: the backend's existing due-card endpoint,
    same as the SPA's review session pulls from.
  - **Policy**: `FixedNetworkPolicy(model?: string, maxVisits: number)` —
    issues `queryEngineMove` against the configured proxy with
    the configured `model`. When `model` is undefined, plays
    through whatever the proxy's default upstream is (LEAF mode,
    or RELAY's load-balanced pool). When set, addresses one
    SELECTOR-routed network.
  - **Driver**: `for cardCount in 1..N: card = nextDueCard();
    move = policy(card.position); processUserMove(move);
    recordResult(card, move, delta)`. Stops on `cardCount >= N`
    or on Ctrl-C. Per-iteration errors are caught, logged, and
    the loop advances; a configurable error budget aborts the
    run if the rate climbs.
  - **Recorder**: appends to a JSONL file (one record per
    iteration: timestamp, card_id, position SGF, played move,
    delta, recall_after) and writes review submissions through
    the existing backend path.
  - **Output**: stdout (one line per iteration with key fields)
    + the JSONL file.
  - **Stop conditions**: card budget, time budget, error budget,
    Ctrl-C.

A 100-iteration run against the existing harness's strong proxy,
playing one weak network, against a small seeded card pool, is a
realistic shape for the first end-to-end exercise. If the loop
runs clean for 100 iterations, the abstraction line is sound; the
policy space opens.

## Policy space, post-SELECTOR

The planning-time record listed three policies; SELECTOR shipping
makes each more concrete, and the new match primitive adds a fourth
worth naming.

- **Visit ladders**. `LadderPolicy(visits: number[])` cycles the
  per-iteration visit budget through a range so the forest
  accumulates moves from a spread of strengths rather than a
  single calibration point. Implementation is one-line on top of
  `FixedNetworkPolicy`. Already feasible without SELECTOR; SELECTOR
  doesn't change this policy's shape.

- **Multiple weights**. `MultiNetworkPolicy(models: string[],
  visits: number)` rotates per-iteration through a set of SELECTOR
  labels. Each network has its own bias; the union explores
  positions a single network's moves would funnel away from.
  *Now feasible* given SELECTOR. The model-in-hash fix makes the
  per-network ledger buckets honest, which matters for any future
  policy that wants to learn from feedback (different networks'
  scores belong to different histories).

- **LLM at the seat**. Unchanged in design from the planning-time
  record. The LLM generates a move *intent* in natural language;
  a KataGo query shaped to find the most-visited candidate
  matching that intent translates intent to coordinates. The LLM
  never sees coordinates directly — it reasons about shape; the
  proxy outsources move-legality and candidate-selection. Capability
  negotiation lets this policy opt out of `adaptive_reevaluate`
  (the LLM doesn't benefit from worst-quantile re-evaluation; the
  intent has already been chosen). This policy is the most
  speculative; not part of the first slice.

- **Match-as-card-generator** (new). `MatchPolicy(black: string,
  white: string, depth: number)` drives `playEngineMatch` forward
  from each card position for `depth` moves, then mines the
  resulting positions for new cards to mint. The mint criterion is
  an open question (every position? positions where the two
  networks' top moves disagree? positions where the active
  palette's quality_delta exceeds a threshold?). This policy
  *generates* cards rather than *reviewing* them, closing the loop
  in a different shape: the SR scheduler eventually surfaces the
  newly minted positions for the review-policy iterations to
  exercise, and the forest grows in two directions at once. The
  match primitive that shipped this cycle is what makes this
  policy real; the original note's substrate didn't include
  per-color match queries on a single connection.

The interesting policies per the planning-time record's framing
remain the ones that don't dominate or get dominated by the
strong-proxy reviewer — they produce the densest information per
move. With SELECTOR + match in hand, the productive-middle
hypothesis becomes testable instead of theoretical.

## The forest as a non-political sample DB

Carrying the original's framing forward: an autonomously generated
parallel deck side-steps any provenance question about the
project's existing card material (some of which derives from
games against human players whose relationship to the project may
be non-trivial). The autonomous deck ships as a neutral fixture
useful for demos, regression tests, and onboarding without
depending on permissions or feelings about source games.

The match-as-card-generator policy makes this benefit larger: the
fixture deck can be *substantially expanded* by an overnight run
of engine-vs-engine matches, with the resulting positions forming
a rich card pool that no human ever played. Per-network bias
diversity (multiple-weights policy stacked with match-policy)
gives the fixture a second axis along with position diversity:
positions reached by strong-vs-weak play differ from positions
reached by strong-vs-strong play, and both differ from the human
games the existing pool draws from.

## Open questions and decisions to revisit

- **Mint criterion for match-as-card-generator.** Three plausible
  shapes: (a) every position from the match is a candidate card,
  (b) only positions where the two networks' top moves disagree,
  (c) only positions whose quality_delta under the active palette
  exceeds a threshold. (b) is appealing because disagreement is a
  signal the position is non-trivial; (c) requires the
  `delta_analysis` capability and ties the criterion to whichever
  palette is active. Settle when the policy ships.

- **Result logging shape.** JSONL per iteration is the first-slice
  proposal. Alternatives: SGF-per-card with delta annotations
  baked into the SGF properties (more useful for post-hoc study
  in standard SGF tools), or a CSV summary (easier to tabulate,
  loses the position record). Probably both JSONL and SGF-per-card
  eventually; first slice picks JSONL for speed.

- **Identity persistence across runs.** Does each run get a fresh
  user (clean Ebisu state, easy to compare runs), or does the
  loop accumulate against a long-lived autonomous identity (the
  forest grows across sessions, more interesting to watch over
  time)? Both have value; the first slice picks fresh-per-run for
  reproducibility. Long-lived identities become the default once
  the cross-run comparison machinery exists.

- **Card-forest visualisation in real time.** Deferred to its own
  slice. The SPA's existing card-tree views render the forest as
  backend updates land; for "real-time" the user opens the SPA
  alongside the loop. A dedicated visualisation that shows the
  loop's iteration timeline (which card just got reviewed, what
  the policy chose, what the delta was) is a separate UI slice
  that doesn't block the loop itself.

- **Per-card model preference.** Should a card carry a preferred
  network in its `gradingParameter`, so the loop's review-policy
  uses the network the card was minted under? This is the cleanest
  way to keep matched-pair comparisons honest (same network mints
  and reviews) but adds a load-bearing field to the card schema.
  Settle when the multi-network match-as-card-generator policy
  ships, because that's the first time the question becomes
  unavoidable.

- **`delta_analysis` opt-out for raw-throughput policies.** A
  policy that only reads `moveInfos[0].move` doesn't need the
  enricher; opting out per query saves the proxy's Python↔C++
  boundary cost. Mechanically straightforward via the per-query
  `capabilities` field; flag the threshold at which it's worth
  bothering (probably "any policy that doesn't use deltas at all,"
  i.e., the FixedNetworkPolicy and the MultiNetworkPolicy and the
  match-driver loop in MatchPolicy).

## Relation to the planning-time record

The planning-time record at the original note's location stays
unchanged per ADR-0005 Rule 8. It captured the idea-space when
SELECTOR was speculation, the match primitive didn't exist, and
capability negotiation was a future contract. Reading the original
as a "what we believed when we hadn't built it yet" record gives
useful context for *why* the substrate ended up shipping in the
shape it did — the original's policy wishlist directly motivated
the SELECTOR design, and the design note for SELECTOR
(`docs/notes/proxy-selector-and-capability-negotiation.md`) cites
the autonomous-SR loop as the destination the SELECTOR is shaped
to enable. Both notes are now planning-time records; this revision
is the pre-implementation note that takes positions on what to
build first.

## Resumption — where the work paused (2026-05-10)

State at pause:

  - Design note (this file): shipped.
  - First-slice implementation: structurally complete, type-checked,
    integration-tested. 11 new tests pass (7 driver integration,
    4 policy unit); full frontend suite 162/165 green.
  - Live validation against a real proxy: not yet run.

Preconditions before resuming live validation:

  1. **User review of the diff.** The position calls this note takes
     on contested questions (where the loop runs, mint criterion, log
     shape, identity persistence) deserve a once-over before live
     runs commit to them. Specific files for review: the design note
     itself; `src/composables/autonomous-srs.ts`;
     `tests/e2e/autonomous-srs-loop.test.ts`;
     `tests/integration/autonomous-srs.test.ts`;
     `tests/unit/composables/autonomous-srs-policies.test.ts`.
  2. **Regression triage in adjacent paths.** Two regressions surfaced
     during this session — SELECTOR routing on the proxy side, and
     `adaptive_reevaluate` on range queries (re-evaluated responses
     dropped before they reach the SPA). Neither path is structurally
     on the first slice's hot path: `FixedNetworkPolicy` uses
     `queryEngineMove` (single-turn, no adaptive engagement), and the
     singleton's review-session analysis uses `analyzeRange` in
     snapshot mode (which the per-query capability helper omits
     adaptive from). But live validation should wait until the
     regressions are diagnosed so a failure surfaced during the
     autonomous-loop run isn't mistaken for an autonomous-loop bug.

Resumption sequence once both preconditions clear:

  1. `AUTONOMOUS_PROXY=ws://… npm run test:run -- tests/e2e/autonomous-srs-loop.test.ts`
     with the env-var surface documented in the runner's docstring
     (defaults to 10 cards × 5 moves × 30 policy visits × 100
     review visits).
  2. Inspect the JSONL log + stdout summary for the loop's first
     end-to-end behaviour. Driver-level invariants are pinned by
     the integration tests; the live run is verifying that the
     proxy + backend round-trip plays nicely under sustained load.
  3. Clean run → file a sibling `design-note: implemented` per
     ADR-0005 Rule 8, and the policy space opens for the next
     slice. Next-slice candidates listed in the **Policy space**
     section above; multi-network and match-as-card-generator
     are the two highest-leverage extensions once orchestration
     is solid. The in-browser observer slice (per **Where the
     loop runs**) is the natural follow-on after that.
  4. Issues surface → diagnose;
     `tests/integration/autonomous-srs.test.ts` is the regression
     net for the orchestration layer (one driver bug — the
     `cardStatus !== 'idle'` guard — was caught here before live
     validation would have surfaced it as undebuggable IDLE entries
     in the JSONL log).

## License

Public Domain (The Unlicense).
