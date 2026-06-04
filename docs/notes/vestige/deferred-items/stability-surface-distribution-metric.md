# Stability surface: distribution-level (information-geometric) metric

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `stability-surface-distribution-metric` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='stability-surface-distribution-metric'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-28.
- **Concern:** The Stage 4 stability substrate operates on
  *categorical* extractors (`Q → packet`-mapping returning a
  primitive value like `top1_move` or `winrate_quintile`). Four
  metric variants aggregate the resulting per-V categorical
  trajectory: anchored-at-V_term, anchored-at-V_max, longest-run-
  fraction, and inverse-change-rate. None of these capture the
  user's stated intuition for what "stability" should mean —
  *"the search visit distribution is stable, integrated in some
  sense over the range of packets observed"* (project author,
  2026-05-28). That intuition is asking for a distribution-level
  metric that operates on the full visit distribution as a
  continuous probability vector, not a categorical reduction.
- **Surfacing framing (2026-05-28, project author, verbatim):**
  > my intuition on "stability" is that the search visit
  > distribution is stable, integrated in some sense over the
  > range of packets observed, I guess there's a technical term
  > that names an integral whose summands are Bayesian
  > transition functionals or something.
- **Why deferred:** different abstraction class than the v1
  substrate. The extractor framework returns scalars;
  distribution-level metrics need the full per-packet visit
  distribution (a probability vector over moveInfos entries).
  That changes the trajectory storage (changepoint compression
  doesn't apply to continuous distributions — every packet's
  vector contributes), the extractor signature (`packet →
  ProbabilityVector` not `packet → Q`), the metric registry
  (functions over distribution streams, not categorical
  changepoint lists), and the panel interpretation
  ("information traveled" reads differently from "value
  persisted"). Reasonable to ship as a parallel substrate
  alongside the v1 categorical one rather than retrofitting.
- **Technical references the substrate would draw from:**
  - **Information length** (Wootters 1981; Heseltine & Kim
    2016) — geodesic length in distribution space under the
    Fisher–Rao metric, L = ∫√I(θ)dt where I is Fisher
    information. The continuous analog of cumulative Bayesian
    surprise.
  - **Cumulative Bayesian surprise** (Itti & Baldi 2009) —
    discrete sum Σ KL(p_{i+1} ‖ p_i) over successive belief
    states. Operationally simpler than information length; same
    "did the posterior move" reading.
  - **Jensen–Shannon divergence** between adjacent packets —
    symmetric variant of KL; bounded in [0, log 2] which makes
    [0, 1] normalisation straightforward.
  - **Stein discrepancy** / **information geometry of MCMC
    convergence** for the broader framing; tangential to the
    immediate Go-search application but the same family of ideas.
- **Concrete v1 substrate shape if implemented:**
  - New extractor class: `distill: packet → ProbabilityVector`
    (alongside the existing categorical `extract: packet → Q`).
    One canonical implementation surfaces the moveInfos visit
    distribution as a probability vector over the top-K moves
    (K=10 say, padded with zeros).
  - New trajectory storage parallel to
    `StabilityTrajectory<Q>`: keeps the distribution per
    packet (no changepoint compression).
  - New metric registry: functions over distribution streams.
    Candidates: total-information-length, mean-pairwise-KL,
    max-pairwise-JS. All map to [0, 1] via 1/(1+L) or exp(-L).
  - Sibling panel (or extension of `StabilityPanel.vue`) with
    the new metric registry alongside the categorical one.
- **What this would settle:** the user's exchange flagged the
  current categorical metrics as not quite matching their
  intuition. The distribution-level metric is the canonical
  mathematical formalisation of "did the posterior actually
  move" — exactly the reading the user named. Composes
  cleanly with the existing per-turn time-series and
  cross-correlation infrastructure (the distribution metric is
  just another column in the cross-correlation matrix).

---

License: Public Domain (The Unlicense).
