# Session handoff (2026-05-22, stability-classifier reframe) — successor brief

Continuation of the visit-scaling research arc from
`session-handoff-2026-05-22-overnight.md`. The user woke up after the
overnight pipeline produced the comprehensive allocator-sim report,
read the morning verdict, and **made his first architectural
intervention of the whole arc**: predict the operational decision
directly (P(top-1 stable)) rather than the continuous shape
descriptors (H asymptote, delta-to-V_max) the prior firewall consults
had recommended.

The fourth firewall consult endorsed the reframe strongly and noted
the prior three consults had missed it. The current session is
executing the firewall's recommended τ ablation × multi-extractor
sweep.

## Where we are RIGHT NOW

**A background process is running**:
`allocator_sim_stability.py` (PID will vary; see `pgrep -af
allocator_sim_stability`). Doing Phase A — batched-fetch from Postgres
to build per-position stability labels, with disk + Redis cache. As of
this writing: ~64/1012 positions fetched, ETA ~18 min.

**Phase B follows automatically** (no orchestration needed): for each
of 5 thresholds × 7 extractors = 35 (classifier, allocator-sim) runs.
~5 min total once Phase A completes. Output:
- `~/plots/allocator_pareto_stability/stability_pareto_tau_sweep.png` —
  multi-panel Pareto curves
- `~/plots/allocator_pareto_stability/summary_stability_sweep.txt` —
  full per-(extractor, threshold) AUC + log-loss + Pareto table

**Logs**: `/tmp/allocator_sim_stability_v3.log`

If the process is dead by the time this is read, just re-launch:
```bash
cd /home/bork/w/omega/research
/home/bork/w/vdc/venvs/kataproxy/bin/python allocator_sim_stability.py
```
Phase A is restartable via the disk cache at
`research/data/stability_cache/<shard>/<stem>_t<turn>.pkl`. Skip-done
logic on the cache key `V_term_floor` means partial progress is
preserved.

## The architectural reframe (load-bearing context)

The user proposed:

> Instead of predicting continuous shape descriptors (H, delta) and
> translating into a τ-thresholded allocator decision, **predict the
> operational outcome itself**: P(top-1 move remains stable from
> V_current to V_max). Train a binary classifier. Decision rule:
> P(stable) > τ → terminate.

Refined the label to **percentile-thresholded stability** ("top-1 at
V_current matches in ≥X% of subsequent V-weighted intervals", default
X=0.97), robust to transposition-driven late flips.

Refined further into a **functorial framing**: the StabilityTrajectory
is parameterized by `extract: packet → Q | None` for any equality-typed
Q. Top-1-move is one instance; there's a family of operationally
meaningful extractors.

The firewall (consult #4) confirmed:
1. The reframe is **correct** and the prior three consults missed it.
2. **Don't drop the regression heads** — keep H and delta as
   complementary signals (deployable as parallel heads for diagnostic
   coverage, or shipped sequentially if maintenance budget tight).
3. **Tune τ via ablation** — running it now over {0.80, 0.90, 0.95,
   0.97, 0.99}.
4. **Add `top2_margin_quintile` extractor** — visit-fraction margin
   between top-1 and top-2, bucketed; the operationally important
   signal that `top1_move` misses. Done.
5. **Replace `winrate_polarity` with `winrate_change_threshold(δ)`** —
   polarity has degenerate label distribution (pos_rate=0.97 confirmed
   empirically). Threshold-crossing variant captures the meaningful
   signal. Added 0.05 and 0.10 variants.
6. **Capability dispatch shape unchanged** — proxy emits trajectory
   packets at SPA-declared budgets; SPA does extractor work locally.
   Don't put stability tracking in the proxy (its job stays
   wire-stable + minimal).

## What changed in code (not yet committed)

Files modified or added since the last overnight commit (`286778d`):

| File | Change |
|---|---|
| `research/stability_trajectory.py` | NEW — generic `StabilityTrajectory[Q]` data structure with change-point map; registry of 8 extractors (`scoreLead_sign`, `winrate_polarity` retained but flagged degenerate, `winrate_quintile`, `search_agrees_with_policy`, `top1_move`, `top3_set`, `top2_margin_quintile`, `winrate_change_threshold_factory(δ)`). |
| `research/allocator_sim_stability.py` | NEW — Phase A (build per-position stability labels via batched Postgres fetch, disk + Redis cache, skip-done logic) + Phase B (per-(extractor, threshold) classifier training + allocator sim). Multi-panel Pareto plot output. |
| `research/pg_sink.py` | ADDED `fetch_positions_bundle_lossless_batch(conn, keys)` — cross-position bulk fetch via VALUES + JOIN. Modest speedup (~1.2×) because the per-position bottleneck is data serialization, not query planning. Documented limitation. |

These should be committed once the in-flight sweep completes and the
results are inspected.

## Pre-committed empirical predictions (firewall consult #4 §confidence)

The firewall set ~50% / 30% / 20% prior on three outcomes:

- **50% likely the reframe wins unambiguously**: top2_margin_quintile
  beats top1_move on AUC OOD; per-mode discrimination survives the
  head swap; enriched features add ≥3pp AUC OOD.
- **30% middle case**: classifier wins on strategic axes (calibrated,
  value-function-free, deployable) but is empirically comparable to
  the H-allocator. Still ship classifier as primary; keep H as
  diagnostic.
- **20% empirical signal too weak**: all extractors AUC OOD < 0.60.
  Ship the H-allocator first; revisit classifier after more data
  lands.

Initial single-threshold run (τ=0.97, three extractors only) already
landed before the broader sweep: `top1_move` AUC OOD=+0.566, smooth
Pareto, slightly dominates H-allocator at mid-budget. `winrate_polarity`
useless (degenerate distribution; now replaced). `top3_set` shows
unusual OOD > within (+0.631 vs +0.549) — could be signal or N-noise.

The current sweep is gathering the full picture.

## What to do next (after the sweep finishes)

In rough order:

1. **Read the multi-panel Pareto + summary table.** Identify the
   winning (extractor, threshold) cell on AUC OOD and on Pareto
   dominance. The two metrics may disagree; the firewall recommends
   prioritizing Pareto dominance.

2. **Verify per-mode discrimination survives.** Run the equivalent of
   `allocator_sim_per_mode.py` but using the stability classifier as
   the predictor head. The firewall expects the implicit
   discrimination (cluster 0 saves more visits than cluster 1) to
   survive the head swap; if it doesn't, the regression head was
   capturing something the classifier isn't.

3. **Re-run hyperparam_sweep.py with classifier loss** (log-loss /
   AUC) instead of regression R². The overnight sweep optimized for
   the regression head; the classifier needs its own.

4. **Test classifier + enriched features** (`--advanced-csv
   /home/bork/w/omega/research/data/advanced_multitimestep.csv` or
   equivalent extension). Firewall expects +2-4pp AUC OOD because
   ownership + policy features are more aligned with "what's top-1?"
   than with "what's H?".

5. **Commit the stability-trajectory + classifier work.** All current
   modifications are uncommitted. The post-Phase-A commit should
   include the multi-panel Pareto and the summary as artifacts.

6. **Draft the `staged_analysis` capability dispatch** to the proxy
   maintainer. Shape per firewall consult #2 §Q3 (preserved at
   `firewall-strategic-2026-05-21.md`). The wire content needs to
   include `moveInfos.visits` per packet so the SPA can run any
   stability extractor over the trajectory.

## File inventory (artifacts produced this session)

Current session's results, scattered across `~/plots/`:
- `~/plots/allocator_pareto_stability/` — stability classifier
  Pareto + summary (first run with 3 extractors only)
- `~/plots/allocator_pareto_stability/stability_pareto_tau_sweep.png`
  + `summary_stability_sweep.txt` — pending, populated when the
  in-flight sweep completes

Cached intermediate data:
- `research/data/trajectory_cache.npz` — the bundled-fetch trajectory
  cache from the overnight session. Substrate for everything.
- `research/data/advanced_multitimestep.csv` — ownership + policy
  distribution features at 5 V-checkpoints. Available for the enriched
  classifier follow-up.
- `research/data/stability_cache/<shard>/<stem>_t<turn>.pkl` — NEW per-position
  stability fractions cache. Survives kills mid-pass.

Firewall consult records:
- `research/notes/firewall-strategic-2026-05-21.md` — consults #2 + #3.
  Consult #4 (the one validating the stability reframe) is in this
  session's conversation transcript; should be filed as
  `firewall-strategic-2026-05-22.md` when the user has time.

## Reading priority for the successor

1. The overnight report
   `research/notes/overnight-allocator-results-2026-05-21.md` — the
   morning verdict + per-section findings. Comprehensive.
2. The previous session-handoff
   `research/notes/session-handoff-2026-05-22-overnight.md`.
3. This document — current state.
4. `research/notes/firewall-strategic-2026-05-21.md` — full
   verbatim of consults #2 and #3.
5. The summary table at
   `~/plots/allocator_pareto_stability/summary_stability_sweep.txt`
   once the sweep completes.

## User preferences locked in this session

- "Everything is today" — don't use "this week / next week" timing
  language. Just do or queue concrete actions.
- The user is awake and engaged; not autonomous mode anymore. Ask
  before kill-and-restart-style operations.
- Reduce monitor event verbosity — current monitor filters to every
  20 batches plus structural events (extractor names, AUC, plot
  paths). The user explicitly asked for this calibration.
- Postgres bottleneck is data serialization, not query planning —
  batched fetches give ~20% wall-clock improvement. Documented in
  `pg_sink.fetch_positions_bundle_lossless_batch` docstring.

License: Public Domain (The Unlicense)
