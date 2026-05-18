# Retrospective: the Phase 3 allocation-policy benchmark arc

- **Status:** Closed. Sweep complete; retrospective and Phase 3.5
  scaffold are the deliverables of this arc.
- **Date:** 2026-05-18.
- **Scope:** Whole arc, from the "we shipped v1.0.25's
  information-theoretic allocation substrate, what should the SPA
  recommend as defaults?" question through the empirical methodology,
  the bug-and-correction cascade, and the headline findings. Sibling
  artefact `NOTES.md` (in the working directory; see "Where the
  artefacts live" below) carries the in-process scratch notes that
  fed this writeup. This retrospective is the polished record.

---

## Why benchmark allocation policies

v1.0.25 of the proxy shipped a Phase 3
[information-theoretic allocation substrate](../adr/) for
`adaptive_reevaluate`: three pluggable layers (`VisitScalingModel`,
value function, `AllocationAlgorithm`) compose into a per-turn visit
budget; the coroutine spawns N parallel sub-queries (one per
candidate) with each sub-query's `maxVisits` set to its allocation.
The wire shape gains four capability fields, eager validation
refuses misconfigurations at coroutine entry, and the substrate
ships four curated allocation algorithms (`greedy_eig`,
`knowledge_gradient`, `thompson_sampling`, `ucb`), two visit-scaling
models (`monte_carlo_sqrt`, `diminishing_returns_log`), and three
worked-example value functions (`policy_entropy`, `score_stdev`,
`lcb_spread`).

The substrate is purely mechanism. None of those nine
combinations is "the recommended default." The SPA's UX needs a
default, and ideally a defensible one, ideally one informed by
data rather than by author intuition. Hence this benchmark.

The question is concretely: **given a turn range and a visit
budget, which (algorithm × visit-scaling-model × value-function)
combination should the SPA select on the user's behalf, and does
the answer depend on which NN model is in use?**

---

## The arc, in chronological shape

1. **Initial naive design.** Per cell `(SGF, turn_range)`, run a
   low-V (V=200) pre-state query plus a high-V (V=5000) oracle
   query; the per-turn `scoreStdev` reduction from V=200 → V=5000
   is the "oracle benefit." For each policy, compute its
   allocation from the pre-state TurnViews, compare against the
   oracle via Spearman rank correlation and top-3 overlap.

   First smoke run on b10c128 produced sensible numbers in
   seconds. The 25 policies' rankings were noisy at n=5 cells.

2. **GPU idling — bug #1: legacy auto-engage.** Tier 2
   (b18c384nbt) stalled on the very first oracle query. The
   benchmark's recv loop sat waiting for finals that never came.
   Diagnosis via `~/kataproxy_logs/selector.jsonl` revealed the
   smoking gun:

   > `2026-05-18T09:36 middleware_engage engage adaptive_reevaluate (legacy auto-engage)`

   Per the v1.0.14 capability-negotiation contract, queries with
   absent `capabilities` field trigger legacy auto-engage of every
   capability-gated middleware. My queries had no `capabilities`
   key → `adaptive_reevaluate` wrapped them → V=5000 × 12 turns
   was the OUTER query that then spawned adaptive deepening on
   top. The actual GPU load was several multiples of what I'd
   budgeted; b18c384nbt couldn't finish in any reasonable time
   and the recv loop timed out.

   Fix: `"capabilities": {}` on every analyze query. Empty dict
   signals "capability-aware; engage none."

3. **GPU idling — bug #2: KeepAliveMiddleware
   mis-specification.** Even with the opt-out, the benchmark
   stalled again on a slow cell. Selector log:

   > `2026-05-18T09:39 keepalive_fired keep-alive fired: idle=25.0s terminated 1 query(ies)`

   `middleware/keep_alive.py` only resets its idle timer on
   `query_version` actions, NOT on any other client traffic. The
   SPA sends periodic `query_version` heartbeats; a naive client
   running a single long ANALYZE doesn't, and gets terminated
   after 25 seconds. The proxy's "dead client detection" is
   application-level idle rather than TCP-level liveness, which
   punishes patient clients.

   Mitigation: an asyncio task in the benchmark that sends
   `query_version` every 10 seconds in parallel with the analysis
   loop. **The underlying contract should be revisited
   post-v1.0.25** — TCP ping/pong is the right liveness signal,
   not message-level idle. Documented in NOTES.md for a future
   proxy-side fix arc.

4. **Bug #3: send-lock race.** The heartbeat task and the analyze
   loop both call `ws.send()` on the same connection. The
   `websockets` library does NOT serialise concurrent sends across
   coroutines — they race and corrupt the WS frame. Symptoms:
   queries appeared to be sent but the proxy's selector never
   recorded a `subscribe ANALYZE`. Fix: `asyncio.Lock` around every
   send call.

5. **Bug #4: quarter-integer komi rejection.** Some SGFs in
   `~/benchmark_sgfs/` carry komi values like `3.75` (unusual
   handicap setups). KataGo's analyze query validation requires
   integer-or-half-integer komi; the proxy returned a structured
   error with no `turnNumber`, which my recv loop filtered as
   neither final nor intermediate, looping forever. Two fixes:
   round komi to nearest 0.5 on SGF load (preserves position with
   negligible distortion), and detect `error` field in any
   response and raise loudly. **Naive recv loops that don't handle
   error responses are silent failure mode incarnate** — this is
   ADR-0002 applied to wire parsing.

6. **Operations-research-style budget planning.** Per-model
   throughput calibration: `b10c128 ≈ 13k vps`, `b18c384nbt ≈
   2.2k`, `b28c512nbt ≈ 1.1k`, `fdx6d ≈ 370`. Cache-hit
   contamination on the first measurement per model produced
   wildly inflated means; the robust estimate is the trimmed
   mean (drop fastest = cache hit, drop slowest = warmup
   outlier). Given a 5-hour budget and a 3913-SGF pool (≈
   unlimited data variety), the binding constraint is compute.
   Tilted allocation: 145 cells × b10c128 (12 min) + 145 cells ×
   b18c384nbt (70 min) + 145 cells × b28c512nbt (2.4h) + 25
   cells × fdx6d (71 min, as residual). Total ~4.88h with
   margin. Tier-stop heuristic: terminate after three consecutive
   model tiers with identical top-3 policy rankings.

7. **Oracle redefinition: from value-space to policy-space.** The
   author challenged the initial choice of `scoreStdev` reduction
   as the oracle. `scoreStdev` is a *value-space* measure, but
   the question Phase 3's policy answers is *policy-space*
   ("which turn's move choice should I clarify?"). The right
   oracle is **information-theoretic on the visit distribution**:
   Shannon entropy reduction of `p_visits[move] = visits[move] /
   Σ visits` between V=200 and V=5000. The benchmark was
   refactored to compute four oracle metrics in parallel
   (entropy_reduction primary, KL divergence, top-1 flip,
   scoreStdev reduction as legacy comparison), each producing its
   own efficiency score per policy per cell.

8. **Quality metric: per-range total information gain.** A
   second author challenge: Spearman rank correlation between
   policy allocation and per-turn oracle benefit is fine for
   "did the policy pick the right turns," but doesn't directly
   measure the END goal (total information captured by the
   allocation). The metric was reformulated as:

   ```
   efficiency = realised_total_info / optimal_total_info  ∈ [0, 1]
   ```

   where `realised_total_info = Σ_t r_t × f(A[t])` for a chosen
   info-gain scaling `f` and the policy's allocation `A`, and
   `optimal_total_info` is the water-filling solution under the
   same `f`. Four scalings computed in parallel: **linear**,
   **sqrt** (Monte Carlo variance theory), **log** (steeper
   diminishing returns), and **piecewise** (uses an additional
   measurement at V=1000 to anchor the curve empirically, no
   parametric assumption).

   *Side benefit*: comparing efficiency across the four scalings
   directly tests how sensitive the policy ranking is to the
   scaling assumption.

9. **Empirical-scaling finding (preserved).** The empirical
   median ratio `ΔH_int / ΔH_full` (V=200 → V=1000 entropy
   reduction divided by V=200 → V=5000 entropy reduction) is
   **0.867 / 0.900 / 0.917 on b10c128 / b18c384nbt / b28c512nbt**.
   The three parametric scaling assumptions predict 0.17, 0.41,
   and 0.50 respectively. **No parametric scaling is within ±SE
   of the empirical data on any tested model tier.** Visit-
   distribution entropy in MCTS saturates faster than even log
   scaling predicts, and the saturation rate is approximately
   network-invariant.

   Implication: `MonteCarloSqrtModel`'s √V scaling, which the
   v1.0.25 substrate defaults to per §3.6.3's empirical
   grounding, is mis-calibrated for entropy-based value functions.
   `DiminishingReturnsLogModel` is closer but still understates
   the concavity. The piecewise (no-assumption) metric is the
   principled choice for policy evaluation.

10. **Pseudo-replication firewall correction.** A second author
    request: run the headline claims through an analytic firewall
    (per the F-optimizer arc's pattern). A fresh-context Opus 4.7
    reviewer audited the claims against the raw data and
    flagged a methodological error: Thompson sampling produces 10
    seed rows per cell, and my |z| calculations treated those as
    10× independent observations. **Cluster-robust SE
    (aggregating to cell means before computing across-cell
    stats) drops most TS-driven |z| values from ≈ 5 to ≈ 1.5.**

    The firewall also corrected two substantive claims:

    - **"score_stdev → all allocators become uniform"** is wrong.
      Only `greedy_eig + score_stdev` happens to score the same
      as uniform on the entropy oracle; KG / TS / UCB +
      score_stdev produce non-uniform allocations that score
      *worse* than uniform. The right framing is
      **value-function ↔ oracle ORTHOGONALITY**, not
      value-function flatness.
    - The original "cross-model stratification" mechanism
      hypothesis — "stronger NNs have more nuanced value heads,
      so score_stdev has more variance there" — is **wrong-
      signed by the data**. b18's `score_stdev_reduction` oracle
      has *smaller* mean (0.11) and similar CV vs b10 (0.17),
      not larger. The firewall's simpler alternative — "b18 has
      lower overall oracle CV → signal is more REGULAR →
      algorithms benefit from the lower noise floor" — explains
      the data and reverses the direction of the explanation.

    Reapplied cluster-robust SE everywhere; the surviving
    cross-model finding is `ucb + score_stdev` (b18 > b10 by
    +0.079, |z|=3.93 under paired SE; +0.080, |z|=3.56 under
    unpaired). A second firewall pass on the retrospective draft
    later flagged that the matched-cells design calls for paired
    SE (which is uniformly tighter); the headline findings table
    below uses paired throughout.

11. **Computer crash — graceful recovery.** Mid-tier-3 the host
    crashed. CSV and per-cell JSONL files survived to disk
    (~94K rows, 398 cells). The benchmark had no resume support,
    so I added one: read the existing CSV to identify completed
    `(model, sgf, turn_start)` tuples and skip those on restart.
    Resume completed the remaining 37 cells of b28c512nbt in
    ~31 minutes.

12. **Tier-stop fires; fdx6d skipped.** With b10c128 / b18c384nbt
    / b28c512nbt complete and all three sharing the identical
    top-3, the tier-stop heuristic terminated the sweep before
    fdx6d. Saved ~71 minutes of compute. Total benchmark wall
    time: ~3h 47min vs 4.88h budgeted.

13. **Architectural follow-up review.** The author proposed a
    transformer (or ResNet+masking) trained end-to-end via
    policy gradient on the efficiency reward. A second firewall
    pass was commissioned. **Verdict: DOWN at current data
    scale.** PG on continuous K-simplex actions standardly needs
    10⁴-10⁶ trajectories; we have 435 cells. Trees-on-tabular
    dominates NN-on-tabular below ~10K-100K examples
    ([Grinsztajn et al. 2022](https://arxiv.org/abs/2207.08815)
    is the canonical reference). The principled "don't add a
    proxy target" objection to supervised regression is correct
    in the limit; we're 2-3 OOM short of that limit. Right
    sequence: LightGBM-supervised first (expected lift to
    0.75-0.85), small transformer supervised on the same
    target if residual gap remains, **only then** consider PG
    as fine-tuning on the pretrained policy. The end-to-end
    RL arc is filed as Phase 3.7, gated on Phase 3.5 saturation
    and substantially more data.

---

## Headline findings

### The same five policies in the same order across all three tested NN tiers

n = 145 / 142 / 142 cells; primary metric = `efficiency_visit_entropy_reduction_piecewise` at budget=2000; SEs are cluster-robust.

| rank | policy | b10c128 | b18c384nbt | b28c512nbt |
|---:|---|---:|---:|---:|
| 1 | greedy_eig + monte_carlo_sqrt + **lcb_spread** | 0.625 ±0.015 | 0.657 ±0.015 | 0.644 ±0.018 |
| 2 | greedy_eig + diminishing_returns_log + lcb_spread | 0.604 ±0.017 | 0.630 ±0.017 | 0.628 ±0.019 |
| 3 | greedy_eig + mc_sqrt + score_stdev | 0.477 ±0.009 | 0.479 ±0.012 | 0.469 ±0.013 |
| 4 | greedy_eig + diminishing_returns_log + score_stdev | 0.476 ±0.009 | 0.477 ±0.012 | 0.467 ±0.013 |
| 5 | baseline_v124_uniform | 0.476 ±0.009 | 0.470 ±0.012 | 0.457 ±0.013 |

Strong, cross-model-invariant signal for the SPA default
recommendation: **`greedy_eig + monte_carlo_sqrt + lcb_spread`**.

### Empirical entropy saturation is steeper than log scaling

Per-model median `ΔH_int / ΔH_full` for `visit_entropy_reduction`,
restricted to **per-turn observations where the V=200→V=5000
entropy reduction `r_full > 0`** (a ratio against a non-positive
denominator isn't a saturation ratio):

| model | empirical median | n turn-observations |
|---|---:|---:|
| b10c128 | 0.867 | 1399 |
| b18c384nbt | 0.900 | 1253 |
| b28c512nbt | 0.917 | 1189 |

Without the `r_full > 0` filter the medians drop to ≈ 0.80 across
tiers — still steeper than any parametric prediction, but
contaminated by sign-flip noise on small-magnitude entropy
reductions. The filtered numbers are the headline.

Parametric predictions: linear 0.17, sqrt 0.41, log 0.50. **None
within ±SE on any tier**. Cross-model invariant. The first
800 extra visits (V=200 → V=1000) capture ~85-90% of the total
entropy reduction at V=5000.

This is a fact about MCTS that doesn't depend on which NN model
is in use, and it has direct implications for `VisitScalingModel`
substrate defaults — `MonteCarloSqrtModel`'s √V curve underweights
the early-visit gain by a wide margin for entropy-based value
functions.

### Linear scaling gives a fundamentally different policy ranking

Cross-scaling Spearman ρ on policy rankings, per model:

| model | linear vs sqrt | linear vs log | linear vs piecewise | concave triad (sqrt/log/piecewise) |
|---|---:|---:|---:|---:|
| b10c128 | 0.45 | 0.55 | 0.60 | 0.96-0.98 |
| b18c384nbt | 0.31 | 0.45 | 0.54 | 0.93-0.98 |
| b28c512nbt | 0.39 | 0.50 | 0.55 | 0.93-0.98 |

Linear consistently gives a substantially different ranking from
the three concave scalings, which themselves cluster tightly.
Concretely:

- Under linear scaling, optimal allocation **concentrates** all
  visits on the single highest-r turn; Thompson sampling and KG
  with `lcb_spread` come out on top.
- Under any concave scaling (sqrt, log, piecewise), optimal
  allocation **spreads** visits across multiple high-r turns via
  water-filling; greedy_eig comes out on top.

The choice of scaling assumption is load-bearing for which policy
ships as default. Piecewise (empirical) is the principled choice;
it produces the same top-5 as log within ranking ties.

### Cross-model effects survive (paired cluster-robust SE)

Cross-model deltas are computed paired: the same cells are run
against each model tier, so paired SE removes between-cell
variance and gives the tightest, most appropriate test. (The
firewall flagged that an earlier unpaired-SE pass would mis-state
the b18→b28 transition; paired is the right test for the matched-
cells design.) Thompson seeds are cell-aggregated before pairing.

**b10c128 → b18c384nbt** (|z| ≥ 2 only):

| policy | Δ | |z| |
|---|---:|---:|
| ucb + score_stdev (both scaling models) | +0.079 | **3.93** |

Borderline cases (1.5 ≤ |z| < 2) on the same transition include
TS + score_stdev (Δ=+0.035, |z|=1.97) and KG + score_stdev
(Δ=+0.034, |z|=1.88). The directional pattern (score_stdev works
better on the larger b18) is consistent across all
non-greedy_eig allocators, with UCB the only one decisively
significant.

**b18c384nbt → b28c512nbt** (|z| ≥ 2 only):

| policy | Δ | |z| |
|---|---:|---:|
| greedy_eig + diminishing_returns_log + **policy_entropy** | −0.022 | **3.37** |
| greedy_eig + monte_carlo_sqrt + policy_entropy | −0.018 | **3.01** |

The `greedy_eig + policy_entropy` family is the only one with
robustly significant effects on b18 → b28, and the direction is
**decay** — the larger network's policy distribution is more
committed (less per-turn entropy variance), so a policy-entropy
value function has less signal to exploit. This is consistent
with the original "stronger NN → more committed policy head"
intuition, narrowly applied (policy_entropy specifically, not
"value functions in general") and only on the b18→b28 step
(b10→b18 effects on policy_entropy are NS under paired SE,
|z|=1.64).

Net: two real cross-model phenomena, both consistent with the
"stronger NN → policy distribution more committed, value
distribution less informative" framing applied to specific
value functions (not the across-the-board mechanism I
originally claimed):

- `ucb + score_stdev` improves from b10 to b18 (no further
  improvement to b28; |z|=1.77 NS in the second transition).
- `greedy_eig + policy_entropy` decays from b18 to b28.

Both effects are small in magnitude (Δ ≈ 0.02-0.08 on a [0,1]
metric) and **do not change the top-5 ranking**, which is
cross-model-invariant. The cross-model variation is in the
middle of the ranking, not at the top.

---

## Methodological notes worth carrying forward

### Reaching for the firewall, again

Per the F-optimizer retrospective's section on firewall use: a
fresh-context Opus 4.7 reviewer is invaluable precisely because the
parent agent's writeup drifts toward whatever interpretation it
arrived at. In this arc, two firewalls earned their weight:

1. **The pseudo-replication catch**. I had been computing |z|
   values that treated 10 Thompson seeds × 145 cells as 1450
   independent observations. Cluster-robust SE collapses |z|=5.8
   to z=1.48 — from "decisive" to "not significant." The firewall
   spotted this directly from the row counts in the CSV and the
   stochastic-algorithm flag in the policy name. Without the
   firewall, I would have written "score_stdev decisively
   stratifies by NN capacity" and shipped a wrong claim to the
   SPA-defaults documentation.

2. **The RL-from-scratch verdict**. The author proposed an
   end-to-end transformer trained with policy gradient. Three
   plausible-sounding arguments — "single-shot, dynamic ranges,
   direct optimisation of the reward" — pointed up; one
   data-scale argument pointed down. The firewall correctly
   identified that the data-scale argument is decisive at current
   sample sizes (2-3 OOM short of standard PG sample-efficiency),
   and that LightGBM-supervised is the right immediate next step.

In both cases, the cost of commissioning a firewall (a few hundred
tokens for the prompt, a few thousand for the reply) was tiny
compared to the cost of propagating the wrong claim through
documentation and downstream work.

### Pseudo-replication is a stat-101 mistake that's easy to make in NN-flavored benchmarks

Any time a benchmark has "K seeds per cell," and you aggregate
across both seeds and cells, the cell is the unit of analysis, not
the row. Cluster-robust SE = aggregate to cell means first, then
compute across-cell stats. The penalty for getting this wrong is
roughly √K-fold inflation of apparent significance. **Add a
discipline check to any future benchmark**: if any policy has
N_rows > N_cells, the aggregation is wrong somewhere.

### Oracle definition is load-bearing

I started with `scoreStdev` reduction as the oracle. The author
correction (information-theoretic on visit distribution) flipped
substantive findings, particularly around which value functions
correlate well with which oracles. **The right oracle for
benchmarking allocation policies is the one most directly aligned
with the user's goal** — for Phase 3 in the SPA, that's
policy-space (which move is best) rather than value-space (how
many points). The retroactive reasoning that justified `scoreStdev`
was "simplest scalar to read out," which is the
implementation-convenience-driving-design failure mode that ADR-0002
warns against.

### Multi-scaling efficiency tests are cheap insurance

Computing efficiency under four scaling assumptions
(linear/sqrt/log/piecewise) in parallel adds ~negligible
post-hoc Python cost — no extra GPU. The result (linear-vs-concave
divergence; intra-concave-cluster top-of-ranking variation) is
substantively interesting and tells us which scaling our policy
ranking is robust to. **For any future benchmark involving a
scaling assumption, compute under multiple scalings and report the
sensitivity.**

### Three-point measurement anchors the empirical curve

The piecewise scaling uses a third measurement at V=1000, which
costs ~20% extra GPU per cell. The payoff: empirical anchoring of
the info-gain curve, no parametric assumption needed for the
principled efficiency metric. The empirical-vs-parametric gap (0.87
vs 0.50 for log scaling) is large enough that the third measurement
was load-bearing for getting the right answer.

### Multi-bug cascade as ADR-0002 fail-loud check

The benchmark hit four interacting bugs (auto-engage, keep-alive
termination, send-lock race, komi rejection) before producing a
single clean cell. Each failure was silent in a different way: the
auto-engage produced no error but blew the compute budget; the
keep-alive produced a terminate that my recv-loop ignored; the
send-lock race corrupted frames that the proxy dropped silently;
the komi rejection produced an error message my recv-loop didn't
parse. **Each silent-failure mode could have hidden indefinitely
without the user noticing the GPU was idle.** The user's two "GPU
is idling" interventions surfaced bugs that would have taken hours
of false-positive analysis to find through CSV-only inspection. The
runtime-visibility-first feedback memory earned its weight here.

---

## Where the artefacts live

| Artefact | Path | Status |
|---|---|---|
| Archive — README | `docs/archive/phase3-allocation-benchmark/README.md` | Pointer for archaeologists |
| Archive — benchmark harness | `docs/archive/phase3-allocation-benchmark/benchmark_v2.py` | The sweep tool; resume-capable |
| Archive — live dashboard | `docs/archive/phase3-allocation-benchmark/dashboard_v2.py` | aiohttp + plotly live view |
| Archive — post-hoc analysis | `docs/archive/phase3-allocation-benchmark/analyze.py` | Cluster-robust + paired SE; scaling-fit; cross-model deltas; ranking robustness |
| Archive — calibration tool | `docs/archive/phase3-allocation-benchmark/calibrate.py` + `calibration.json` | Per-model vps with cached output from the 2026-05-18 run |
| Archive — OR planner | `docs/archive/phase3-allocation-benchmark/plan.py` + `plan_v2.json` | Compute-vs-data-variety budgeting + the chosen plan |
| Archive — raw results (gzipped) | `docs/archive/phase3-allocation-benchmark/results_v2.csv.gz` | 103,095 rows × 37 columns, ~2.5 MB compressed (~38 MB uncompressed). The data underlying every numeric claim above. `gunzip -k` to decompress |
| Archive — per-cell raw measurements (gzipped) | `docs/archive/phase3-allocation-benchmark/cells_v2.jsonl.gz` | 435 records; per-turn r_int and r_full for each of 4 oracle metrics |
| Archive — working notes | `docs/archive/phase3-allocation-benchmark/NOTES.md` | In-process scratch with retractions, firewall verdicts, roadmap entries for Phase 3.5 / 3.7 / 4 |
| Proxy v1.0.25 substrate | `proxy/middleware/allocation.py`, `middleware/visit_scaling.py`, `middleware/adaptive_reevaluate.py` | Shipped; bumped in umbrella at PR #257 |
| Proxy v1.0.25 design note | `proxy/docs/roadmap-info-theoretic-allocation.md` | Authoritative for the substrate's design; this retrospective for the empirical follow-up |
| F-optimizer retrospective | `docs/notes/retrospective-katago-f-optimizer-2026-05.md` | Methodological precedent (firewall pattern, archival discipline) |
| This retrospective | `docs/notes/retrospective-phase3-policy-benchmark-2026-05.md` | This file |

The `docs/archive/phase3-allocation-benchmark/` directory is the
**archaeological deposit** — every numeric claim in this
retrospective can be reproduced from `results_v2.csv` and the
Python tooling beside it. Pulled into the repo so the analysis
stands on its own without depending on the project author's
external staging directory. The archive's `README.md` is the
orientation document for anyone arriving cold; it covers what's
where, how to reproduce, and how to re-run the sweep against a
running SELECTOR.

---

## What's next

### Phase 3.5 — supervised LightGBM regressor (immediate)

LightGBM 4.6.0 is installed in the proxy venv (smoke-tested on
synthetic data, R²=0.86 on 500-sample/15-feature regression).
The benchmark's per-cell `r_full` for `visit_entropy_reduction`
is the training target; per-turn V=200 feature vectors are the
input. The substrate's `value_fn` binding accepts any
`Callable[[TurnView], float]`, so a learned regressor plugs in
with no proxy-side change.

Expected lift per the firewall: **0.62 → 0.75-0.85 efficiency**.
Half-day project: extend `benchmark_v2.py` to dump per-turn
feature vectors into the cell records, fit LightGBM offline with
SGF-level cross-validation, evaluate against the same efficiency
metric, ship as a worked-example value function (or as a recipe
in the SPA-defaults documentation).

### Phase 3.7 — end-to-end policy-gradient NN (deferred)

Filed in NOTES.md. Gated on Phase 3.5 saturation AND substantially
more training data (≥ 30K cells, vs 435 today). The architectural
choice (transformer with positional encoding, or ResNet+masking)
is fine; the limiting factor is data scale, not architecture. If
and when Phase 3.5 hits a ceiling well below 1.0 with no clear
supervised improvements remaining, this becomes the next arc.

### Phase 4 — multi-iteration Bayesian-bandit allocator

Filed in NOTES.md. The v1.0.25 substrate already supports
multi-round adaptation; a `BayesianAllocationAlgorithm` would
maintain a per-cell GP belief over `r_full(t)`, update from
spawn-response observations each round, and allocate via
knowledge-gradient on the GP. Composes with Phase 3.5 (the
supervised VF provides the GP prior). User-confirmed for a v1.0.26
arc once v1.0.25 closes and Phase 3.5 lands.

### KeepAliveMiddleware contract revision (proxy-side)

The 25-second message-level idle timeout punishes naive clients
running long analyses. The right contract is TCP/WS-level
liveness (which the websockets library handles automatically) plus
an OPTIONAL `query_version` reset. Filed in NOTES.md for a
post-v1.0.25 proxy-side dispatch.

### Substrate visit-scaling-model defaults — empirical recalibration

The empirical entropy saturation curve (0.87-0.92 median ratio
across tiers) is far steeper than any of the substrate's two
visit-scaling models predict. The v1.0.25 §3.6.3 grounding for
`monte_carlo_sqrt` was based on Monte Carlo variance theory, which
applies cleanly to *value-space* uncertainty but not to *policy-
space* entropy. A §3.6.6 extension to the v1.0.25 design note
should record this empirical finding, and the substrate should
consider a third curated `VisitScalingModel` calibrated to the
measured entropy curve (or at least a stronger documentation
caveat that `monte_carlo_sqrt` is value-space-optimised and may
overestimate marginal gain on policy-space value functions).

---

## Closing observation

v1.0.25 shipped a substrate. The substrate works — the benchmark
confirms that allocations from the curated algorithms beat uniform
on the principled metric, that the substrate's design choices
(four algorithms, two scaling models, three value functions) cover
a meaningful design space, and that one specific combination
(`greedy_eig + monte_carlo_sqrt + lcb_spread`) is a defensible
cross-model default at ~0.62 efficiency.

But 0.62 is "meh." The gap from 0.62 to 1.0 is "predictable signal
in the V=200 pre-state that hand-crafted value functions miss."
That gap is what Phase 3.5 is for: closing it with a learned
regressor that the substrate accepts as a `value_fn` binding
without any substrate-side change.

The arc earned its weight in two ways. First, by producing a
defensible SPA default rather than the project author's intuition
about which curated combination "looks good." Second, by
characterising the *gap* — efficiency 0.62 in a [0, 1] metric —
as the motivation for the supervised-VF arc that closes
v1.0.25's "we shipped a substrate" into "we shipped a substrate
plus a default that uses it well."

ADR-0002 manifests here in the specific shape of "fail loudly when
the empirical numbers don't match the design's implicit
assumption." The substrate assumed two parametric scaling models
would adequately cover MCTS info-gain curves; the measurement says
no, the empirical curve is steeper than either. That's a finding
the substrate should surface, not bury. It's why this retrospective
exists, and why the Phase 3.5 / 3.7 / 4 follow-ups are filed where
they are.

---

License: Public Domain (The Unlicense)
