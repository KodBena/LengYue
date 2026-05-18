# Phase 3.5+ design notes — emerging from the v1.0.25 benchmark

Notes pulled from the 2026-05-18 benchmark session, while the sweep
was producing data. Promote to a proper proxy/docs/roadmap-* design
note once the v1.0.25 release lands and the supervised-VF arc
starts in earnest.

## What the benchmark is telling us (preliminary, b10c128 only)

- **Hand-crafted value functions cap out around 0.6 efficiency** on
  the principled metric (`visit_entropy_reduction × piecewise`
  scaling). `lcb_spread` reaches ~0.62; `score_stdev` is ≈ uniform
  baseline ~0.47 because its per-turn output has CV ≈ 0.03 across a
  12-turn window — it's effectively constant on consecutive
  mid-game turns and gives the allocator nothing to differentiate.
- **The visit-distribution entropy curve is steeper than any
  parametric scaling predicts.** Empirical median
  `ΔH_int / ΔH_full ≈ 0.78` (~80% captured in the first 800
  visits); even `log` scaling predicts only 0.50. Suggests the
  Phase 3 substrate's `monte_carlo_sqrt` default visit-scaling
  model is mis-tuned for entropy-based value functions. Revisit
  the v1.0.25 §3.6.3 §11.11 prescription with the empirical curve
  in hand.
- **Linear scaling produces a fundamentally different ranking from
  sqrt / log / piecewise** (Spearman ρ ≈ −0.30 to −0.40 vs the
  concave cluster's ρ ≈ 0.85+). Pick wrong and the SPA defaults
  swing. Piecewise (empirical) is the principled choice.

## Phase 3.5 — supervised learned value function

**Goal**: replace hand-crafted `Callable[[TurnView], float]` value
functions with a learned regressor `features → per_turn_r_full`. The
substrate accepts any `Callable`; no proxy-side substrate change.

**Training data**: the current benchmark already produces it.
Per (cell, turn) we have features at V=200 and the target r_full at
V=5000. Need to dump per-turn feature vectors into the cell records
(not currently done). Expand `cells_v2.jsonl` to include features.

**Features to extract from the V=200 pre-state**:

Per-turn (already in the analyze response):
  - `rootInfo.scoreStdev` (current uniform-CV signal; useful as
    normalizer, not on its own).
  - `rootInfo.scoreLead`, `rootInfo.winrate`.
  - `rootInfo.rawWinrate − rootInfo.winrate` (how much did search
    move the picture? a "search did meaningful work" signal).
  - `rootInfo.rawVarTimeLeft` (NN's guess of meaningful-game-left;
    small = winner clear or about to be; large = long game ahead).
  - `rootInfo.visits` (the V=200 count; modest range).
  - `rootInfo.weight / rootInfo.visits` (search confidence proxy).
  - `moveInfos[0..K].utilityLcb` spread (the current `lcb_spread`).
  - `moveInfos[0..K].visits` distribution shape (variance, entropy,
    Gini, top-1 mass fraction).
  - `moveInfos[0..K].prior` distribution shape (NN prior entropy).
  - Top-1 winrate − top-2 winrate gap.
  - `pv` length and `pvVisits[0] / pvVisits[-1]` decay ratio.
  - Color-to-play (even/odd turn).
  - `policy` Shannon entropy (the existing `policy_entropy` VF).

Per-range / context features (the user's nudge — important because
the metric is evaluated over the whole turn-range, so the policy
should see the range too):
  - Turn number relative to game length (opening / middle / endgame
    phase as fraction).
  - Range-level summary stats: mean / std / max / min of each
    per-turn feature across the 12 turns. The allocator should
    know "this range is high-variance" vs "this range is uniform"
    (which we showed matters for the score_stdev case).
  - Range-level visit-distribution-entropy mean/std.
  - Game metadata: total game length, rule set (Chinese / Japanese
    / Tromp-Taylor), board size, komi.
  - SGF metadata if available: opponents' ranks, time controls.

Model choice: gradient-boosted trees (LightGBM / XGBoost). ~1700
data points × ~20-30 features is well-conditioned. Cross-validate
by holding out entire SGFs.

`noResultValue` correction (caught by user 2026-05-18): this is the
per-move predicted no-result probability (game terminator quality),
**not** a meaningful-game-left measure. The right field for the
latter is `rootInfo.rawVarTimeLeft`. Update §3.6.1 of the v1.0.25
roadmap accordingly.

## Phase 3.7 (gated) — end-to-end policy-gradient on allocation NN

User proposal (2026-05-18): single-shot transformer (or ResNet+
masking) takes range feature tensor, outputs allocation directly,
trained via policy gradient against the efficiency reward.

**Firewall (Opus 4.7) verdict: DOWN at current data scale.**

Reasons:

- 435 cells × ~20 turns/cell = ~9K supervised examples vs 435
  scalar PG rewards. PG has 20× less effective signal.
- Continuous 20-simplex action space needs 10⁴-10⁶ trajectories
  for from-scratch PG (MuJoCo-class benchmarks). We have 2-4
  orders of magnitude less.
- Tree models dominate NN on tabular features at this data scale
  (Grinsztajn et al. 2022 confirms this generalises).
- Reward bandwidth is narrow (efficiency 0.4-0.6 cluster) and the
  single-V=5000 oracle noise probably dominates the PG gradient.

**The right sequence**:

1. **LightGBM** on `(per-turn features → r_full)` + water-fill.
   Expected lift: 0.62 → 0.75-0.85.
2. If gap remains, small transformer **supervised** on r_full.
3. **Only then** consider PG fine-tuning on the pretrained
   supervised model (NEVER from scratch).

Conceptually the user's intuition that end-to-end optimisation
of the actual reward is theoretically superior is correct. It's
just premature at 2-3 OOM of data short.

This becomes a real arc when (a) the supervised model saturates
and (b) we have ≥30K cells of training data — likely after
fdx6d is fully benchmarked AND a larger SGF pool is sampled.

## Phase 4 — multi-iteration intelligent policies (RL)

The v1.0.24 substrate runs multi-round adaptation; the v1.0.25
Phase 3 allocator runs PER ROUND with the current state as input.
That's a sequential decision process — natural fit for RL on top
of the substrate.

**MDP formalization**:
  - State at round k: `AdaptiveState` snapshot. Per-turn current
    visits, current value-fn outputs, history of allocations,
    history of observed `r_full`-as-it-grows.
  - Action: per-round allocation `dict[TurnIndex, int]`.
  - Reward: per-round info gain (instantaneous) or cumulative info
    gain at budget exhaustion (delayed).
  - Termination: budget exhausted, convergence (per v1.0.24
    `ConvergenceCheck`), or learned stop signal.

What RL buys over the static (per-round greedy) policy:

1. **Learned stopping**: marginal value of round k+1 vs cost. Current:
   `Budget.max_rounds`. RL: learn to terminate when expected info
   gain drops below cost.

2. **Cross-round re-allocation**: if round 1 deepened turn X
   and r_full came in lower than expected, round 2 should
   reweight DOWN. The static allocator re-evaluates from scratch
   each round; an RL agent can carry belief.

3. **Bayesian belief updates**: each round's observation refines
   per-turn r_full estimates. A Bayesian-RL agent (Thompson
   sampling over posteriors, or Q-learning with belief-state
   features) integrates this naturally.

4. **Exploration-exploitation balance** in the right space: not
   just "explore new turns" (UCB does this within a round) but
   "explore allocation strategies across rounds."

**Algorithmic candidates** (in order of complexity):

  - **Bayesian Optimization over allocations**: model `r_full(t)`
    with a Gaussian Process; sample acquisition function per
    round. Each round's deeper-query observation updates the GP.
    Closed-form, principled, doesn't require training a NN.
  - **Contextual bandit with belief state**: LinUCB or
    Thompson-sampling-over-posteriors. Round-level decisions
    treated as contextual arms with the AdaptiveState as
    context.
  - **Policy gradient on the allocation distribution**: train a
    NN to output Dirichlet parameters over allocations given
    AdaptiveState. Needs many episodes (≫ benchmark data).
  - **MCTS on the allocation space** (meta-MCTS): allocate-then-
    observe is a tree-shaped decision; UCT could search it.

**Substrate fit**: v1.0.25 already exposes the right primitives:

  - `AdaptiveState.round_history` carries cross-round per-turn
    history.
  - `AllocationAlgorithm.allocate(...)` is called per round and
    has full state visibility.
  - Phase 4 of the umbrella design note explicitly anticipates
    "user-authored adaptation policies as small programs" —
    program-shaped bindings via `RegistryInterpreter`. A learned
    multi-round policy IS that program.

**Training signal**: the benchmark's `cells_v2.jsonl` could be
extended to record the multi-round trajectory under different
policies. Each (cell, policy_trajectory) → cumulative info gain
is one training episode. The benchmark substrate already supports
multi-round; we just need the harness to walk through rounds and
log per-round observations.

**Compute cost**: training RL on simulator data requires running
KataGo many times. Sample-inefficiency is the killer; mitigations:

  - Pre-train on supervised data (Phase 3.5's learned VF) to
    initialise the value-function head, then fine-tune with RL.
  - Use the visit-scaling model as a SIMULATOR (no GPU needed)
    for rollouts in early training; reality-check periodically.

## Proxy KeepAliveMiddleware mis-specification (2026-05-18 finding)

While running the benchmark we hit this twice. Documented because
it should be a proxy-side fix arc later.

**The contract** (proxy/middleware/keep_alive.py): a session is
considered idle if no `query_version` action has arrived within
`idle_timeout_seconds` (default 25s in v1.0.18). When idle and any
ANALYZE is in-flight, the watchdog terminates every in-flight
ANALYZE on the session. v1.0.17 widened the timeout band-aid to
250s; v1.0.18 reverted because the SELECTOR's heartbeat-broadcast
bug was the real cause (the watchdog wasn't being reset on
non-first upstreams).

**The problem**: the contract assumes a client sends periodic
`query_version` heartbeats. The SPA does. **A naive client that
sends a single long-running ANALYZE doesn't, gets terminated after
25s.** A query that takes 30+ seconds to complete (which our V=5000
oracle queries did on the slower models) is killed by its own proxy.

**Why this is a mis-specification, not a bug-fix-able implementation
problem**:

The KeepAliveMiddleware's purpose is "detect dead clients to free
engine compute on phantom sessions." A dead client is one whose
TCP/WebSocket connection is broken but didn't send a clean close —
the proxy can't see the disconnect. The right detection signal is
**TCP-level / WS-level**, not application-level:

  - The `websockets` library handles WebSocket ping/pong frames
    automatically. If a peer is alive at the TCP layer, ping/pong
    succeeds; if dead, the connection times out and the proxy's
    `recv()` loop sees a clean close.
  - Application-level idle (no `query_version` for 25s) is
    orthogonal to liveness. A patient client running a 60-second
    ANALYZE is alive; punishing it is incorrect.

**Better contract** (proposal for a proxy-side arc):

  - Treat any active ANALYZE as evidence the client is alive
    (the engine is doing work for them; if the client were dead,
    the work would be wasted, yes — but the right fix is to detect
    the dead-client signal directly, not to assume silence).
  - Rely on WS-level ping/pong for liveness detection.
  - Keep `query_version`-resets as a secondary signal (the SPA
    already sends them; they're cheap; no harm in respecting them
    too). But don't treat the ABSENCE of them as proof of death.

**Concrete fix-it sketch** for `middleware/keep_alive.py`:

  - Reset `_last_heartbeat` on `on_query(ANALYZE)` too — any
    client-initiated activity counts as liveness.
  - Optionally: reset on every received message from the peer,
    not just `query_version`. WS-level ping/pong frames are
    handled by the library and don't surface as messages, so the
    next layer would still need a TCP keepalive option.

**Workaround we used in this benchmark**: parallel asyncio task
that sends `query_version` every 10s while the main coroutine
runs long analyses. Sufficient but ugly — every naive client
script will hit this and need the same workaround.

**Filed as**: `~/benchmark_allocation/NOTES.md` "KeepAlive
mis-specification" — should be promoted to a `docs/dispatch/`
entry in the proxy repo when the v1.0.25 arc closes and we move
on to maintenance work. The dispatch should propose either (a)
the contract change above or (b) keep contract, but document the
heartbeat requirement prominently in `proxy/README.md` so external
client authors don't get bitten.

## RETRACTIONS (2026-05-18, firewall review by Opus 4.7)

A fresh-context Opus 4.7 reviewer audited the parent claims against
the raw data. Three of four claims need correction or retraction.
Recording the corrections here for future reference; the original
narrative below this section is preserved with **[RETRACTED]**
strikethroughs so the reasoning trail is intact for retrospective.

### Methodological error: pseudo-replication

Thompson-sampling rows: 10 seeds × N cells = 10N rows. The parent's
|z| calculations treated these as 10N independent observations.
**They aren't** — within-cell seeds share the same pre-state and
oracle data, so they're correlated cluster-mates.

Cluster-robust correction: aggregate to cell means BEFORE computing
SE. The firewall checked TS+monte_carlo_sqrt+score_stdev's b10-vs-
b18 delta with cluster aggregation: naive |z|=5.0 collapses to
**z=1.48 — not significant.**

Going forward: every cross-policy or cross-model |z| computed on
TS rows should use cell-cluster aggregation. Update the analyze.py
post-hoc analyzer to compute cluster-robust SE before any |z|
claim.

### Claim 3 retraction: not all allocators degenerate on score_stdev

**Original parent claim**: score_stdev's CV-across-12-turns is ~0.03,
which makes ALL allocators degenerate to approximately uniform
allocation.

**Firewall finding**:
- The actual per-allocation CV from `allocation_json` column is
  **~0.084 (median, greedy_eig+score_stdev)**, not 0.003.
  Allocations are moderately non-uniform.
- KG/TS/UCB+score_stdev score 0.19-0.28, FAR worse than baseline
  (0.476). They do NOT degenerate to uniform.
- Only greedy_eig+score_stdev coincidentally matches baseline.

**Correct framing**: this is a **value-fn ↔ oracle ORTHOGONALITY**
finding. greedy_eig+score_stdev produces a non-uniform allocation
that happens to score ~same as uniform on the visit-entropy oracle
(because the allocation isn't aligned with where entropy actually
reduces). The other allocators with the same VF produce
allocations that score WORSE than uniform — they're actively
misallocating.

The "all allocators → uniform" framing is wrong and should not
propagate to SPA documentation.

### Claim 4 retraction: cross-model "stratification" is overreach

**Original parent claim**: value functions stratify by network
capacity — score_stdev works better on b18+ (|z| up to 5.8);
policy_entropy works better on b10; lcb_spread is model-invariant.
Mechanism: stronger networks have less policy variance, more
value variance.

**Firewall findings**:

1. **Pseudo-replication inflated confidence**: corrected |z| values
   for the score_stdev cross-model effect drop below 2 with
   cluster-robust SE on TS rows. The strongest remaining effect
   is `ucb+score_stdev` Δ=0.073 (deterministic, no
   pseudo-replication concern).

2. **lcb_spread is NOT model-invariant**: TS+lcb_spread has
   Δ=0.024 with naive |z|=3.2-3.5 (and likely cluster-robust z>2
   too, given TS's 10× row factor doesn't fully account for the
   gap). The "downstream of both → network-agnostic" story is
   contradicted directly by the data.

3. **greedy_eig+score_stdev IS model-invariant**: Δ ≈ 0.001 with
   |z|<0.2. The parent's "0.04-0.08 stratification" range only
   applies to UCB/TS/KG variants, not greedy_eig. The bracket is
   misleading.

4. **Mechanism is wrong-signed**: parent hypothesis predicted b18
   should have MORE scoreStdev variance ("more nuanced value
   heads"). Firewall pulled the oracle distributions:
   - b10c128 score_stdev_reduction: mean 0.17, std 0.20
   - b18c384nbt score_stdev_reduction: mean **0.11**, std 0.14

   b18 has SMALLER scoreStdev variance, not larger. Mechanism is
   contradicted by the data.

**Firewall's simpler alternative**: b18 has LOWER overall oracle
CV (0.60 vs 0.78 for visit_entropy_reduction). The signal is
MORE REGULAR on the larger network. Allocators that respond to
any per-turn signal benefit; algorithms that lean on noise (TS)
benefit from the lower noise floor. This explains TS+lcb_spread's
cross-model effect (which my mechanism couldn't) and reverses
the direction of the explanation entirely.

### Implication for SPA defaults: less clear-cut than parent suggested

The "lcb_spread = safe cross-model default" story is now uncertain
(TS+lcb_spread cross-varies). The "policy_entropy for small nets,
score_stdev for large nets" SPA recommendation needs more
investigation before shipping — current support is at most one
deterministic algorithm × one VF (ucb+score_stdev) and would
benefit from b28/fdx6d tier data with cluster-robust analysis.

### Claim 2 nuance: top-of-ranking divergence within "concave triad"

Parent's framing: linear is distinct (ρ ≈ 0.45-0.60); sqrt/log/
piecewise cluster (ρ ≈ 0.94-0.98). **True in aggregate, but the
top of the ranking differs even within the concave cluster**:

- sqrt and log top-1: baseline_v124_uniform (eff ~0.77 / ~0.70)
- piecewise top-1: greedy_eig+monte_carlo_sqrt+lcb_spread (eff ~0.62)

The Spearman ρ ≈ 0.98 is dominated by similarly-ranked bad
policies in the long tail; the top-of-ranking is **materially
different**. For "which policy should we ship", this matters more
than aggregate rank-correlation.

### Going forward

- ✓ Run analyze.py with cluster-robust SE (aggregate TS seeds to
  cell means before computing |z|). Done 2026-05-18 post-crash.
- ✓ Re-derive cross-model deltas with proper statistics.
- Investigate the firewall's "lower CV → better signal" mechanism
  hypothesis empirically: per-cell, does TS efficiency correlate
  with oracle CV?
- Don't propagate the "score_stdev → uniform" or
  "lcb_spread model-invariant" framings to SPA documentation
  until corrected.

### Cluster-robust findings (2026-05-18 post-crash, 3 tiers)

After applying cluster-robust SE (cell-mean aggregation before
across-cell stats), with n=145/142/110 cells on b10/b18/b28:

**Top-5 is identical across all three tested model tiers**:
1. greedy_eig + monte_carlo_sqrt + lcb_spread (0.62-0.66)
2. greedy_eig + diminishing_returns_log + lcb_spread (0.60-0.63)
3. greedy_eig + monte_carlo_sqrt + score_stdev (0.47-0.48)
4. greedy_eig + diminishing_returns_log + score_stdev (0.47-0.48)
5. baseline_v124_uniform (0.46-0.48)

Strong cross-model stability of the SPA-default candidate.

**Only one cross-model effect survives cluster-robust SE**:
`ucb+score_stdev` on b18 vs b10 by +0.080, |z|=3.56. All other
cross-model effects I previously claimed (TS+score_stdev,
policy_entropy stratification, lcb_spread model-variance) are
borderline (|z|≈2) or NS (|z|<2). The "value functions stratify
by NN capacity" narrative is much weaker than my pre-firewall
write-up suggested.

**Empirical scaling ratio is cross-model invariant**: 0.87/0.90/0.91
for b10/b18/b28 on visit_entropy_reduction — all far steeper than
log scaling's prediction of 0.50. This is a real, network-agnostic
property of MCTS visit-distribution entropy saturation, and
suggests the v1.0.25 substrate's `monte_carlo_sqrt` default
visit-scaling model is empirically miscalibrated for entropy-based
value functions.

**SPA-default recommendation (now firmer)**:
- Default: greedy_eig + monte_carlo_sqrt + lcb_spread.
- Cross-model-invariant; works across the 3 tested NN capacities.
- Efficiency ~0.62 — motivates the Phase 3.5 supervised-VF arc.

## Cross-model finding (2026-05-18, **[PARTIAL RETRACTION — see above]**): value functions stratify by network capacity

Worth investigating fully when more tier data is in. Documenting now
because the pattern is striking and consistent across all four
scaling assumptions.

**Observation** (b10c128 full + b18c384nbt partial @ 50 cells, oracle =
visit_entropy_reduction, budget = 2000):

| value function | cross-model behaviour |
|---|---|
| `score_stdev` | b18c384nbt > b10c128 by 0.06-0.08 efficiency, |z| up to 5.8. |
| `policy_entropy` | b10c128 > b18c384nbt by ~0.03-0.05, |z| ≈ 1-2. |
| `lcb_spread` | Model-invariant; Δ within SE. |

**Mechanism hypothesis**:

- Smaller networks have **less-committed policy heads** → more
  per-turn variation in policy entropy → `policy_entropy` carries
  signal on b10c128.
- Larger networks have **more nuanced value heads** (each visit
  resolves finer uncertainty) → more per-turn variation in
  scoreStdev → `score_stdev` carries signal on b18+.
- `lcb_spread` is downstream of both (utility LCB integrates
  policy × value) → network-agnostic.

**If this generalises** to b28c512nbt and fdx6d, the SPA UX could
be:

- Default: `lcb_spread` (safest cross-model).
- Per-model recommendation: detect the model tier, recommend
  `policy_entropy` for small nets, `score_stdev` for large nets.

**Research-y angle (deferred until v1.0.25 closes)**:

The "stronger NN → policy-head certainty up, value-head detail up"
direction is itself an interesting empirical claim about MCTS
information accumulation. Worth a focused analysis after the full
sweep lands — fdx6d data will tell us whether the trend continues
or asymptotes. If consistent, propose a §3.6.6 addition to the
v1.0.25 roadmap: "value-function recommendation by NN capacity."

## Concrete next steps

1. After v1.0.25 ships and the umbrella's submodule bumps:
   write `proxy/docs/roadmap-learned-value-function.md` (Phase 3.5)
   from this NOTES.md content.
2. Extend `benchmark_v2.py` to dump per-turn feature vectors so
   the supervised regression can train offline. Cheap addition.
3. **Scaffold the Bayesian-bandit multi-round agent as a v1.0.26 arc**
   (user-confirmed 2026-05-18). Substrate is ready; the agent is the
   only new piece. Concrete shape:

   - Add `BayesianAllocationAlgorithm` to `middleware/allocation.py`
     as a 5th curated algorithm.
   - Per-cell state: GP belief over `r_full(t)`. Prior from a
     supervised VF (Phase 3.5 prerequisite — for the prior mean;
     diagonal kernel variance covers our ignorance otherwise).
   - Per round: compute knowledge-gradient acquisition function
     for each candidate; water-fill the budget against the
     acquisition curve.
   - Per round, after spawn responses arrive: update the GP from
     `state.last_packet(t)`-derived observations.
   - Convergence: terminate when `max(acquisition) < threshold`.
     Adds a new convergence-metric trajectory:
     `belief_max_acquisition`.
   - Plumbing: the `AllocationAlgorithm` Protocol is unchanged;
     the new algorithm just maintains per-call mutable state
     (the GP). The substrate doesn't need to expose mutability —
     the algorithm instance is per-cell-scope when constructed
     via `_parse_allocation_algorithm`.
   - Tests: regression coverage for the GP update math + the
     acquisition function shape. Likely scipy.stats Multivariate
     Normal or just a hand-rolled diagonal GP since we don't need
     cross-turn covariance for the MVP.

   Expected v1.0.26 release notes: "BayesianAllocationAlgorithm —
   GP-belief multi-round allocator. Reuses v1.0.25 substrate;
   composes with Phase 3.5 supervised VF as prior."
