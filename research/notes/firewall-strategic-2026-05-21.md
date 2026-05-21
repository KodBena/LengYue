# Strategic firewall consultation — 2026-05-21 (evening)

Second independent-opinion pass on the visit-scaling research arc.
Two-turn back-and-forth, asking opinionated operational direction
rather than per-decision critique. The arc state at the time of
consultation:

- 437 positions in the curated corpus (year2000 pro + 68 cards.db
  Hatsuyoron-level volatile expansions); phase-3 collection in
  flight, targeting ~750 more cards.db positions.
- The 2026-05-20 firewall consult's Tier-0 (bootstrap label-noise)
  diagnostic landed: every target has 6-14× recoverable signal
  headroom in log-space.
- Multi-timestep INPUT features close most of the gap on the
  parametric target: `scoreLead_drift|hyperbolic|H` from baseline
  +0.119 → +0.70 R² at 2/3 search budget.
- Three modes recovered by shape-invariant K-means clustering
  (fast-tactical / reading-paradox / clean-monotone); cards.db tag
  distributions cross-validate.
- The architectural fork: the 2026-05-21 interim memo proposed a
  two-stage mode-conditioned allocator; the LATER session-handoff
  (post `regression_per_mode.py` and `regression_soft_mode.py`)
  revised toward "one global head with mode-as-continuous-feature."
  Per-mode heads lose on 11/12 targets; soft-mode continuous
  centroid-distance features beat one-hot by +0.037 R².

This document carries:
1. The turn-1 brief sent to the firewall (verbatim).
2. The firewall's turn-1 response (verbatim).
3. The turn-2 follow-up brief, after I verified the most
   load-bearing missing data point (verbatim).
4. The firewall's turn-2 response (verbatim).
5. The distillation — operational direction.
6. Action register (populated as recommendations are acted on).

Filing this under `research/notes/` so it can be referenced
historically. The arc continues to be guided by this kind of
external direction-setting at structural-fork moments.

---

## 1. Turn 1 — the brief sent to the firewall

(verbatim; sent via the Agent tool with subagent_type=general-purpose,
model=opus)

> You're being asked for an independent strategic opinion — an "analytic
> firewall" pass. The user has been doing visit-scaling research for
> ~36 hours; he's out of his depth on the ML side and is leaning on
> Claude+consultants for direction. End goal is noble and philanthropic
> — a learned visit-allocator that will eventually live inside the
> KataProxy `adaptive_reevaluate` middleware to serve LengYue (a
> spaced-repetition Go study tool, public-domain). The user wants
> honest direction, not validation. The collaborator instance writing
> this brief has been corrected before for paraphrasing-drift; he asks
> you to quote passages you cite and to be loud about what you don't
> know.
>
> The brief is self-contained but you have read access. Three files are
> particularly load-bearing if you want depth:
>
> - `/home/bork/w/omega/research/notes/interim-research-memo-2026-05-21.md`
>   (533 lines) — comprehensive synthesis as of mid-day 2026-05-21
> - `/home/bork/w/omega/research/notes/session-handoff-2026-05-21.md`
>   (152 lines) — the LATEST state (supersedes the memo on the
>   architectural fork — see below)
> - `/home/bork/w/omega/research/notes/firewall-strategic-2026-05-20.md`
>   (419 lines) — the original firewall consult that anchored the
>   arc; useful for the "where we started" framing
>
> Other notes in `/home/bork/w/omega/research/notes/` for context if
> needed (mode discovery details, DLP / Cornish-Bowden, etc.).
>
> ## Setting
>
> We are predicting the *shape* of KataGo MCTS visit-scaling curves at
> Go positions, with the eventual deployment target being a cost-aware
> allocator in `adaptive_reevaluate` — given a position, decide how
> many MCTS visits to spend. Substrate: ~437 positions across year2000
> pro games + cards.db volatile cards, 10 MCTS realizations each at
> `maxVisits=15000`, stored as full per-packet streams in Postgres.
> Phase-3 collection is doubling this (750 phase-3 volatile cards in
> flight, ETA ~3hr).
>
> ## Empirical state (key numbers)
>
> - **Bootstrap label-noise ceilings (log-space)** across the 4 drift
>   targets: +0.375 to +0.839 R². So labels are NOT noise-bound —
>   every target has 6-14× headroom over current performance.
> - **V_pre regression** (23 phase35 features extracted from the V≈80
>   pre-search packet): best R² is +0.119 on `scoreLead_drift|H`
>   (LGBM), most other (target, family, param) triples at chance or
>   negative.
> - **Multi-timestep INPUT regression** (V_pre + index-based-window
>   features at 1/3 / 2/3 / full of trajectory): `scoreLead_drift|H`
>   goes baseline +0.119 → 1/3 +0.41 → 2/3 +0.70 → full +0.70. 6× the
>   baseline. `scoreLead_drift|κ` similarly: baseline −0.226 → 2/3
>   +0.53, near the bootstrap ceiling of +0.59.
> - **Non-parametric drift labels** (y_range, y_at_V_max, slope features
>   etc. — no curve_fit, 100% coverage) give 2-3× R² improvement over
>   the parametric (H, κ) framing on single-timestep V_pre features.
> - **Mode classification accuracy**: V_pre alone 31% (BELOW chance
>   baseline of 36%); +1/3 search 67% AUC 0.86; +2/3 search 82% AUC
>   0.94. Three modes recovered by K-means on shape-invariant features
>   (fast-tactical / reading-paradox / clean-monotone), cross-validated
>   by cards.db tags (sabaki/punish/endgame → fast-tactical,
>   technical/judgement → reading-paradox, volatile-bulk →
>   clean-monotone).
> - **DLP (Eisenthal–Cornish-Bowden) two-point invariant**: implemented
>   as `H_dlp_median`, `log_kappa_dlp_median`, `dlp_n_valid_pairs`.
>   100% label coverage. NOT a predictability multiplier (DLP-H
>   regression ≈ curve_fit-H regression). But `dlp_n_valid_pairs` is a
>   powerful monotonicity feature that drove the mode-discovery
>   clustering.
>
> ## The architectural fork (where the memo and handoff disagree)
>
> The 2026-05-21 interim memo proposed a **two-stage mode-conditioned
> allocator**: tasting → mode classifier → mode-conditioned allocation
> policy with three discrete modes.
>
> The LATER session-handoff (after `regression_per_mode.py` and
> `regression_soft_mode.py` were run) **revises** that finding. Quoted
> from the handoff:
>
>> "`per_mode` (specialized heads, one per mode) **loses on 11/12
>> targets.** Specializing the head is a net loss; modes share more
>> structure than they differ."
>
> and
>
>> "Continuous distance-to-centroid features beat one-hot by **+0.037
>> R²** on the test target (+0.345 → +0.382). The K=3 categorical
>> bottleneck has been costing us throughout, not just here."
>
> The handoff's pivot becomes:
>
>> "tasting → derive-mode → feed-as-feature into one global head", NOT
>> "classify-then-route to mode-specific head."
>
> and the architectural conclusions section says:
>
>> "Don't do classification → regression. Mode-as-feature works;
>> mode-as-routing-key doesn't."
>> "The categorical bottleneck is costly. Even K=3 hard assignment
>> loses ~+0.04 R² vs continuous distances."
>> "Pivot for next phase: 'tasting → direct partial-search features →
>> one global regression head → cost-aware allocation' (mode may
>> re-enter at the *allocation* step as a policy switch, but not at
>> the regression step)."
>
> So the live architectural question is: given we've established (a)
> multi-timestep partial-search features carry the signal, (b)
> non-parametric drift labels are 2-3× more predictable than parametric
> (H, κ), (c) one global head with mode-as-continuous-feature beats
> per-mode heads, **what's the right architecture to commit to next,
> and what's the right empirical experiment to validate it before we
> burn compute or before the cross-team dispatch is written?**
>
> Underlying axes the user wants you to weigh in on (rank by
> impact-per-effort, give an opinionated read, push back where you
> disagree):
>
> 1. **Direct partial-search regression** — feed multi-timestep features
>    straight into a regression head predicting the non-parametric
>    drift label (`y_at_V_max` or similar), skipping any explicit mode
>    step. Soft-mode features can be auxiliary inputs but not
>    architectural partitions. The handoff calls this "the real test
>    of the pivot." Is it?
>
> 2. **What we're predicting matters.** Right now we predict shape
>    descriptors (H, κ, y_range, y_at_V_max). The allocator's question
>    is downstream: "given partial-search state, how many more visits
>    should I spend?" Should we collapse the target — predict directly
>    the marginal EIG of `V → V+ΔV`, or the cost-normalised "visits to
>    reach a decision quality threshold" — rather than shape
>    descriptors that require a secondary translation step? What's the
>    cleanest framing for the eventual `adaptive_reevaluate`
>    integration?
>
> 3. **Sequence models on the (V, y) packet stream.** Opus 4.7's
>    previous consult flagged LSTM/GRU/Transformer as the natural
>    escalation if anytime-decoding is needed beyond a discrete
>    two-stage. At our N (~437 positions, doubling soon) and
>    per-position-trajectory-length (~50-800 packets), is a sequence
>    model genuinely tractable or are we under-data for it? DeepSets /
>    NPE was also floated.
>
> 4. **Validation.** Cards.db cleanness classifier (trained on
>    year2000 pro games) does NOT generalize to cards.db OOD positions
>    (LGBM 45%, Logistic 20%). What's the right validation framework
>    for the next architecture? Cross-decade holdout? OOD source
>    holdout? Time-based folds? We're at risk of measuring CV R² that
>    doesn't transfer to the SPA-side production case.
>
> 5. **The cross-team dispatch.** The eventual proxy integration ships
>    through `docs/dispatch/spa-to-proxy-...md`. When do we lock in
>    the wire shape vs leave it open? Is there a contract we can commit
>    to now (e.g., "the SPA sends an extra `target_quality` field; the
>    proxy emits a multi-stage analysis with progressively-deeper
>    search bursts") that doesn't depend on which exact regression
>    target we land on?
>
> ## What would be most useful
>
> - Pick the architectural commitment you think the next 1-2 weeks of
>   work should anchor on, and name the cheap empirical experiment
>   that would falsify it. Don't enumerate options as a checklist —
>   opinionated direction is what the user wants.
> - Push back where you disagree with the framing. The "mode-as-feature
>   beats per-mode heads" finding is one experiment on one target —
>   don't over-update on it if you think the design space is bigger.
> - Specifically name what you *can't* tell from this brief and what
>   you'd need to know. Naming a missing diagnostic is more useful
>   than guessing.
> - Don't pad. The user has memory entries about paraphrase-drift and
>   product-thesis-authoring and will catch over-claims. Hedge audibly
>   when you hedge.
>
> Output length: match the substance. Match the
> firewall-strategic-2026-05-20.md format if it helps — a "Framework
> first" framing followed by per-question answers, ending with "what
> I'd want to know but can't tell from this brief."

---

## 2. Turn 1 — the firewall's response

(verbatim)

> # Strategic firewall consultation — 2026-05-21 (evening)
>
> ## Framework first
>
> The arc has compressed an enormous distance in 36 hours, and that
> compression itself is the thing I want to flag before answering
> specific questions. You started with **+0.119 R² on V_pre features**,
> you now have **+0.70 R² on multi-timestep features** within shouting
> distance of the **+0.84 bootstrap ceiling**, and the entire
> "two-stage mode-conditioned" architecture proposed by the interim
> memo has been **revised within hours** by `regression_per_mode.py`
> and `regression_soft_mode.py`. That's healthy. It also means **the
> design space is moving faster than the diagnostics are stabilising**,
> and the live risk is committing architecturally to a finding that
> hasn't been pressure-tested.
>
> The framework I want to apply throughout: **at +0.70 R² with 437
> positions and a multi-axis fork (target choice × feature regime ×
> mode-as-feature-vs-routing × sequence-vs-tabular ×
> parametric-vs-anchor) the dominant uncertainty is not which
> architecture wins on a held-out fold of the current corpus — it's
> whether the winning architecture transfers to the SPA-side production
> case.** Cards.db OOD generalization of the cleanness classifier
> failed at 45/20%. That single number says more about where the next
> two weeks should go than the +0.037 soft-mode improvement does.
>
> So I'm going to disagree with the handoff's framing, not on the
> experiments it ran (those findings are real) but on what they license
> as a next commitment. The handoff says:
>
>> "Pivot for next phase: 'tasting → direct partial-search features →
>> one global regression head → cost-aware allocation' (mode may
>> re-enter at the *allocation* step as a policy switch, but not at
>> the regression step)."
>
> I think that's roughly right *as a regression architecture* but **the
> regression architecture is not the load-bearing question right now**.
> The load-bearing question is what target you're predicting and how
> you'll validate it transfers. Let me unpack that under the numbered
> axes.
>
> ---
>
> ## On your specific questions
>
> ### Q1 — Direct partial-search regression as "the real test of the pivot"
>
> I'd push back on the framing that this is *the* test. It's *a* test,
> and it's worth running, but at this point you already have strong
> evidence the answer will be yes:
>
> - §2.8 of the memo: `scoreLead_drift | hyperbolic | H` goes baseline
>   +0.119 → 1/3 +0.41 → 2/3 +0.70 → full +0.70 with multi-timestep
>   INPUT features.
> - The handoff's `+mode_oh` and `+soft_mode` runs already operate on
>   this regime; the +0.345 → +0.382 soft-mode delta is on top of
>   partial-search.
>
> The marginal information from running "skip mode entirely, just
> partial-search features into LGBM" is: does the +0.037 R² that
> soft-mode adds come from genuinely new information, or is LGBM with
> enough partial-search features able to derive the centroid distances
> itself? That's a useful ablation but it's a **diagnostic refinement**,
> not a pivot validator.
>
> The thing that would actually falsify the pivot is **OOD transfer**.
> The cleanness classifier failed at it. You don't yet know whether
> the +0.70 R² on year2000 positions holds on cards.db positions, or
> holds on, say, year1995 positions, or holds on the volatile-tagged
> subset specifically. Until you have at least one cross-distribution
> number, the +0.70 is a within-corpus finding that may or may not
> survive deployment.
>
> **My opinionated read:** the next experiment shouldn't be "skip mode
> entirely." It should be **"train on year2000, evaluate on cards.db
> phase-3 (which is collecting now), report R² on both."** That single
> number — held-out OOD R² on the partial-search-features regression
> head — is the one that licences (or kills) the architectural
> commitment. If it's +0.60, you ship. If it's +0.15, you have a
> corpus-distribution problem that no amount of regression-head
> fiddling will fix, and the dispatch should not be written yet.
>
> I'd want to know but can't tell from this brief: **has anyone run
> year2000 → cards.db transfer on the multi-timestep regression yet?**
> Or only on the cleanness classifier? The brief says the cleanness
> classifier doesn't generalize; it doesn't say whether the
> H-prediction transfer was attempted.
>
> ### Q2 — What we're predicting matters
>
> This is the question I think is being underweighted. Quoting the
> brief:
>
>> "Should we collapse the target — predict directly the marginal EIG
>> of `V → V+ΔV`, or the cost-normalised 'visits to reach a decision
>> quality threshold' — rather than shape descriptors that require a
>> secondary translation step?"
>
> **Yes.** And I'd be more emphatic than the question allows. Here's
> the reasoning:
>
> The current target stack is: predict shape descriptors
> (`y_at_V_max`, `y_range`, `H_dlp_median`, etc.) → at allocator time,
> combine these with a cost model to make a visit decision. That's
> **two estimation steps glued together**, each with its own variance,
> and you have no end-to-end metric for what matters operationally.
>
> The original firewall consultation already had a thread on this —
> Q6's "predict F-at-anchors" idea was a step toward "predict the thing
> the allocator actually consumes, not the parametric intermediate".
> The arc since then has gone further from anchor prediction (the work
> is on `y_range`, `y_at_V_max`, drift labels) but the underlying
> tension is the same.
>
> The allocator's decision is: **given the current state at V_current,
> should I spend ΔV more visits or terminate?** The quantity that
> decision needs is **`E[ΔQuality | spend ΔV more]` minus `cost(ΔV)`**,
> where Quality is whatever decision-metric you actually care about
> (probability-of-correct-move, expected-policy-improvement, whatever).
>
> Predicting `y_at_V_max` is **a 15000-visit-asymptote prediction**, and
> then the allocator has to back out marginal-utility from that. But:
>
> 1. The asymptote is the noisiest part of the curve (κ-conditioning
>    issues you already documented).
> 2. The shape of `value(V) - value(V_current)` is what matters for
>    "should I spend more", and that's a derivative quantity.
> 3. Going through an asymptote estimate and then differentiating loses
>    information vs. predicting the derivative directly.
>
> **The cleanest reframing:** train a regressor where the target is
> **`y(V_target) - y(V_current)`** for several `(V_current, V_target)`
> pairs sampled from the trajectory. That's a delta-prediction task,
> the labels are directly observable (you have them per realization,
> no curve_fit), and the allocator can query the trained model with
> arbitrary (V_current, V_target) and get the answer it actually needs.
>
> This is closer to the firewall's earlier "predict F-at-anchors"
> suggestion, but framed as a **conditional delta** rather than absolute
> anchor values. It also has a sequence-model interpretation if you
> want it (Q3), but the tabular version is straightforward and runnable
> now.
>
> I want to be loud that this is a reframe of the target, not a small
> tweak. It would invalidate some of the comparison numbers you've
> accumulated (`y_range` LGBM vs `y_at_V_max` LGBM, etc., which are
> predicting shape-descriptor targets that wouldn't be the new
> prediction target). If you commit to this reframe, the +0.345 and
> +0.382 numbers from the handoff become reference points for "how
> predictable were the old proxy targets" rather than the metric you're
> trying to maximize.
>
> **What I don't know:** how aligned the existing trajectory data is
> with `(V_current, V_target)` pair-sampling. The packet cadence is
> `reportDuringSearchEvery=0.02s` which is dense but irregular in V;
> whether that's enough to construct clean (V_current, V_target) pairs
> at arbitrary anchors, or whether you'd need to interpolate, I can't
> tell from the brief.
>
> ### Q3 — Sequence models on the packet stream
>
> Honest answer: **probably not yet, but yes eventually, and the data
> shape is right for it.**
>
> At N=437 (doubling soon to ~1200) with sequences of length 50-800,
> you have ~50k-700k packet observations in total. That's tabular
> regression scale, and it's at the bottom edge of where small
> transformers/GRUs become tractable. Two things temper my enthusiasm:
>
> 1. **Sequence models will win in expressiveness but lose in
>    interpretability and operational integration.** You're going to
>    ship this into KataProxy's `adaptive_reevaluate` middleware. A GBM
>    that says "based on these 75 features at 1/3 search, predict
>    ΔQuality" is operationally inspectable. A GRU running over the
>    live packet stream is a black box and a deployment risk. The cost
>    asymmetry on a production-bound research project is real.
>
> 2. **The signal is largely linear (handoff §2.7: Logistic at 1/3 gets
>    67%, same as LGBM).** That's strong evidence the structure is
>    mostly captured by the right tabular features. Sequence models
>    would buy you maybe +0.05 R² over LGBM with well-engineered
>    partial-search features, at substantial cost in implementation,
>    validation, and deployment complexity.
>
> The escalation makes sense **after** the partial-search-LGBM ceiling
> is empirically established and shown insufficient. Not now. The
> interim memo's recommendation #4 — "Sequence model investigation if
> anytime-decoding is needed beyond the discrete two-stage" — is the
> right cadence. The handoff's reformulation to "one global head with
> mode-as-feature" doesn't change that.
>
> DeepSets / NPE I'd defer more strongly. The data is naturally a time
> series, not a set, and the NPE framing (posteriors over (H, κ)) is
> exactly the framing the non-parametric labels are moving away from.
> Don't add a parametric posterior to a problem you've successfully
> de-parametricised.
>
> ### Q4 — Validation framework
>
> This is where I think the most leverage is. **Cross-decade holdout,
> OOD source holdout, and time-based folds are all defensible; the
> binding question is which most closely matches the SPA-side
> production distribution.**
>
> The SPA serves LengYue, which is a spaced-repetition Go study tool.
> The positions the allocator will see in production are:
>
> - User study positions from cards.db (volatile + non-volatile, full
>   tag spread)
> - Possibly user-uploaded SGF positions (broader distribution)
>
> So the right validation framework is:
>
> 1. **Primary OOD metric: train on year2000 pro positions, evaluate on
>    cards.db (phase-3 + existing volatile/non-volatile cards).** This
>    is the most representative test of production transfer. The
>    cleanness classifier failed this at 45/20%; the regression head
>    needs to pass it.
>
> 2. **Secondary cross-decade fold: hold out year1995 or year2005 as a
>    validation slice.** Tests within-pro-corpus distribution shift.
>    Less critical than the cards.db OOD test but cheap to run.
>
> 3. **Tertiary stratified-by-mode fold: train on positions classified
>    as cluster 0/2, hold out cluster 1 (reading-paradox).** Tests
>    within-distribution-mode generalization. This is the test that
>    would tell you whether the architecture is overfitting to the easy
>    modes. If +0.70 R² collapses to +0.20 when reading-paradox is held
>    out, that's a useful signal.
>
> The current GroupKFold-by-position is the right *within-distribution*
> CV, but it's not telling you what you need to know about transfer.
> **The single most important diagnostic before the dispatch is the
> year2000 → cards.db OOD R² on the partial-search regression head.**
> This may already be runnable on the current 437 + 68 corpus; it
> doesn't need to wait for phase-3 completion.
>
> What I don't know: whether the cards.db 68-card OOD set has the same
> packet density and methodology as the year2000 corpus, or whether
> there's a methodological mismatch that would confound the transfer
> measurement. The memo says they were matched at n_realizations=10
> but I can't tell from the brief whether `reportDuringSearchEvery` and
> `maxVisits` were identical.
>
> ### Q5 — The cross-team dispatch
>
> The handoff and the memo both recommend writing the dispatch now.
> **I'd hold it for one more week.**
>
> Reasoning:
>
> 1. The architectural fork between "two-stage mode-conditioned" (memo)
>    and "one global head with mode-as-feature" (handoff) was resolved
>    in hours by a single regression experiment. If a similar reframe
>    lands in the next week (e.g., the delta-prediction target reframe
>    in Q2), the dispatch's wire shape would be wrong on the first
>    revision.
>
> 2. The dispatch's load-bearing claim — that the proxy should emit "a
>    multi-stage analysis with progressively-deeper search bursts" —
>    does NOT depend on which regression target you land on. It depends
>    on whether the *allocator* needs partial-search visibility before
>    committing to a budget. The answer to that is unambiguously yes
>    per §2.7. So the *capability* the dispatch should request from the
>    proxy (a `tasting_visits` parameter, a callback / streaming
>    contract for partial-search packets that the SPA can intercept and
>    feed into a local model) is stable.
>
> 3. But the *consumption shape* — what the SPA does with those
>    packets, what features it extracts, what model it runs them
>    through, what wire format the eventual `target_quality` field
>    carries — is in flux.
>
> **My recommendation:** write a *capability dispatch*, not a *contract
> dispatch*. The capability dispatch says:
>
> - "The SPA needs the proxy to support a partial-search-observation
>   mode where MCTS reports trajectory packets at configurable V
>   checkpoints (e.g., 1/3 and 2/3 of nominal budget) and the SPA can
>   decide whether to continue or terminate."
> - "The capability negotiation (per v1.0.14's two-sided capability
>   pattern in `proxy/CLAUDE.md`) would advertise this as something
>   like `partial_search_observation` or `staged_analysis`."
> - "The exact wire shape for the SPA's termination decision and the
>   proxy's continuation behavior will be specified in a follow-up
>   dispatch once the SPA-side allocator design is settled."
>
> This is the cheap commitment that doesn't depend on which regression
> target lands. It also gives the proxy maintainer time to absorb the
> capability design before being asked to land an exact wire shape.
> Per the umbrella's CLAUDE.md on dispatches:
>
>> "When a piece of work has implications for another sub-project (a
>> needed endpoint, a wire-shape change, an integration assumption),
>> the right first step is often a dispatch document — not direct
>> implementation."
>
> A capability dispatch fits this; a wire-shape dispatch would be
> premature.
>
> ---
>
> ## What I'd want to know but can't tell from this brief
>
> 1. **Year2000 → cards.db OOD R² on the multi-timestep regression
>    head.** The single most important number that isn't in the brief.
>    If this exists, it changes my whole recommendation; if it
>    doesn't, running it is the cheapest high-value experiment
>    available.
>
> 2. **The actual loss on `regression_per_mode.py`'s 11-of-12 losses.**
>    "Loses on 11/12 targets" is reported as a fact but the magnitude
>    matters. If the losses are -0.005 R² and the win on the 12th is
>    +0.153 R², the per-mode head might be the right choice on a
>    target-weighted-by-importance basis. If the losses are -0.10 each,
>    the handoff's conclusion stands. I'd want the table.
>
> 3. **The "headroom" comparison between modes 0/1/2.** The
>    fast-tactical mode has κ ≈ 1000 << 5000 (memo §3) so the
>    bootstrap-ceiling R² may be much lower for that mode (less
>    variance to explain). The reading-paradox mode has the
>    dip-rebound structure that's hardest to predict but also has the
>    highest variance. Per-mode bootstrap ceilings would tell you
>    whether "per_mode loses 11/12" is an artifact of comparing R²
>    across modes with very different irreducible variance.
>
> 4. **Whether the partial-search regression at +0.70 R² is on the
>    parametric (H) labels or the non-parametric labels.** §2.8 of the
>    memo reports +0.70 on `scoreLead_drift | hyperbolic | H` which is
>    the parametric target. §2.3 reports the non-parametric labels are
>    2-3× more predictable on V_pre features. I can't tell whether the
>    multi-timestep advantage is *additive* with the non-parametric
>    advantage, or whether the gains overlap.
>
> 5. **The connection to what KataGo's network actually exposes about
>    position type.** KataGo emits `policy_entropy`, `score_stdev`,
>    `policy_kl` etc. — features that are the network's own guess at
>    "how settled is this position." Is there a baseline that's just
>    "rule-based allocation policy from these network-emitted features,
>    no learned model"? That would be the right "no-ML" baseline for
>    the eventual allocator. A learned model with +0.70 R² may or may
>    not beat a heuristic that says "if `score_stdev > 4`, spend full
>    budget; else terminate at 1/3."
>
> 6. **What "cost-aware allocation" means quantitatively.** The brief
>    mentions it but doesn't pin it down. Is the cost-utility function
>    `quality_gain / visits_spent`? `quality_gain - λ × visits_spent`?
>    Is there a target SLA on per-position latency? The right
>    regression target depends on the cost function, and the cost
>    function isn't specified.
>
> ---
>
> ## The opinionated direction I'd commit to
>
> If I had to pick what the next 1-2 weeks anchor on:
>
> **Anchor: validate transfer before deciding architecture.** Concretely:
>
> 1. **Week 1 (this week, before phase-3 completes):** Train the
>    partial-search-features regression head (the handoff's pivot
>    architecture, mode-as-feature) on year2000. Evaluate on the
>    existing 68-card cards.db OOD set. **Report year2000 → cards.db
>    OOD R².** If it's > +0.40, the architecture is shippable; if it's
>    between +0.15 and +0.40, the architecture works but needs more
>    diverse training data (which phase-3 will provide); if it's <
>    +0.15, the architecture is overfit to year2000 distribution and
>    the pivot needs rethinking.
>
> 2. **Week 1 also:** Reframe one target as a **delta-prediction task**
>    (`y(V_target) - y(V_current)` for sampled pairs) and run the same
>    OOD-transfer test. This is the cheap empirical test of the Q2
>    reframe. If delta-prediction transfers better than shape-descriptor
>    prediction, that's the target framing that goes into the dispatch.
>
> 3. **Week 2 (after phase-3):** Retrain on year2000 + phase-3
>    (mixed-distribution training set), re-evaluate on held-out
>    cards.db slice. If OOD R² jumps materially, you've confirmed the
>    data-diversity bottleneck. If it doesn't, the gap is architectural.
>
> 4. **Throughout:** Write the **capability dispatch** to the proxy
>    (not a wire-shape dispatch). The proxy maintainer can start
>    scoping the partial-search-observation capability against the
>    v1.0.14 capability-negotiation pattern while the SPA-side
>    architecture firms up.
>
> **The cheap empirical experiment that would falsify the architectural
> commitment:** the year2000 → cards.db OOD R² being < +0.20 on the
> partial-search head. If that happens, "tasting → derive-mode →
> feed-as-feature into one global head" is not yet a shippable
> architecture; it's a within-distribution overfit that needs either
> more diverse training data or a different target framing before it
> can serve LengYue users.
>
> ---
>
> ## Where I disagree with the existing framing
>
> - The handoff says "Don't do classification → regression. Mode-as-feature
>   works; mode-as-routing-key doesn't." This generalizes from one
>   experiment on one target. I'd weaken it to: **"On the targets
>   tested, mode-as-routing-key underperforms mode-as-feature, with the
>   strongest single win being +0.153 R² on
>   `scoreLead_drift|H_dlp_median`."** The headline conclusion is
>   plausible but the evidence is thinner than the framing suggests.
>   Don't write it into the dispatch yet.
>
> - The handoff calls direct-partial-search-regression "the
>   architectural test of the pivot." It's a confirmatory experiment
>   that's worth running but it's not the falsifying one. **The
>   falsifying experiment is OOD transfer.** I'd promote that to the
>   highest-priority next step.
>
> - Both the memo and the handoff treat the target as fixed (shape
>   descriptors). I think this is the largest underweighted axis:
>   **the prediction target should match what the allocator consumes,
>   which is a delta or a marginal-EIG quantity, not a shape
>   descriptor.** Reframing the target is more leveraged than refining
>   the regression head.
>
> - The interim memo's recommendation #1 ("Commit the two-stage
>   architecture in a design note and a dispatch to the proxy
>   maintainer") is explicitly superseded by the handoff but the
>   underlying urge — lock in the architecture, write the dispatch —
>   survives. I'd resist that urge for one more week. Write the
>   *capability* dispatch (proxy-side support for partial-search
>   observation) but not the *contract* dispatch (exact wire shape
>   and SPA-side consumption pattern).
>
> ---
>
> ## What I genuinely don't know
>
> I'm an LLM giving direction on an ML research arc. I've read the
> three documents end-to-end, but I have not run the experiments, not
> seen the code beyond what's quoted, not seen the actual per-fold
> residuals, and not seen the OOD transfer number that I'm claiming is
> load-bearing. My push for "validate transfer before locking
> architecture" is based on a single data point (cleanness classifier
> OOD failure) extrapolated to a different model (the regression head).
> That extrapolation might be wrong — maybe the regression transfers
> cleanly because trajectory features generalise better than V_pre
> features do. I can't tell from the brief.
>
> The thing I'd most want before being more confident: **the actual
> scatter plot of predicted-vs-actual on year2000 with cards.db points
> overlaid in a different color.** That single visualization would
> resolve more uncertainty than any further analytical argument.

---

## 3. Turn 2 — the follow-up brief (after verifying the load-bearing data point)

Between turn 1 and turn 2 I (the collaborator) verified the firewall's
most load-bearing missing data point: whether the year2000 → cards.db
OOD R² test had been run on the multi-timestep regression head. The
verification confirmed it had NOT — `summary_averaged.csv` (which all
the impressive within-corpus numbers were measured against) is
pro-corpus only; the 68 cards.db rows sit in `trajectory_features_dlp.csv`
but are not used as a held-out OOD slice on the regression head.

The turn-2 brief reported that gap back to the firewall and asked for
concrete operational direction.

(verbatim; sent via the Agent tool with subagent_type=general-purpose,
model=opus)

> Continuing the strategic firewall consultation from the previous
> turn (you should treat this as a follow-up; the previous response is
> preserved at `/home/bork/w/omega/research/notes/opus-consult-2026-05-21-strategic.md`
> format but unwritten — the collaborator is going to file it after we
> converge). This is a fresh agent invocation but I'll repeat the key
> context.
>
> ## Context recap
>
> Previous consult was on a visit-scaling research arc. Substrate:
> predicting MCTS visit-scaling curves at Go positions to feed a
> learned allocator in KataProxy's `adaptive_reevaluate` middleware
> (end-application: LengYue, a public-domain spaced-repetition Go
> study tool). 437 pro positions + 68 cards.db (Hatsuyoron-level
> volatile) positions; phase-3 collection of 750 more cards.db
> positions in flight.
>
> Your previous response anchored on:
>
> 1. **"Validate transfer before deciding architecture."** Year2000 →
>    cards.db OOD R² on the multi-timestep regression head is the
>    single most important number that wasn't in the brief.
> 2. **Target reframe** to delta prediction (`y(V_target) -
>    y(V_current)`) instead of shape descriptors.
> 3. **Capability dispatch** to proxy, not contract dispatch.
> 4. **Don't escalate to sequence models yet** — signal is largely
>    linear.
>
> You explicitly flagged "I'd want to know but can't tell from this
> brief: has anyone run year2000 → cards.db transfer on the
> multi-timestep regression yet?"
>
> ## I checked. The answer is: no.
>
> I verified by grepping the regression scripts:
>
> - `regression_multitimestep_input.py` (the script that produced
>   +0.70 R² on `scoreLead_drift|hyperbolic|H`): loads
>   `/tmp/summary_averaged.csv`. That CSV contains 284 unique stems,
>   ALL year2000-era pro-game stems (e.g. `1700JQXG209`,
>   `1701-12-23`, `1710CLR1-16`). **Zero cards.db rows.**
> - `regression_soft_mode.py` (the +0.345 → +0.382 soft-mode result):
>   same — labels loaded from `summary_averaged.csv` (pro-only). The
>   cards.db mode-feature rows sit in `trajectory_features_dlp.csv`
>   but are not used as a held-out OOD slice; the script only joins on
>   stem to attach DLP-features.
> - `regression_per_mode.py` (the "11/12 lose" finding): also
>   `summary_averaged.csv`.
>
> So all the impressive within-corpus numbers (+0.70, +0.345, +0.382)
> are **GroupKFold-by-position within the year2000 pro-game
> distribution**. The 68 cards.db positions are collected and
> feature-extracted but **never tested as a held-out OOD slice on the
> regression head**. The cleanness classifier OOD failure (45/20%) is
> currently the ONLY transfer measurement we have.
>
> Other partial answers to your previous "what I'd want to know" list:
>
> - **+0.70 R² is on parametric labels.** The memo's §2.8 reports it on
>   `scoreLead_drift|hyperbolic|H` — the curve_fit H, not the
>   non-parametric drift labels. So the multi-timestep advantage and
>   the non-parametric advantage are **not yet demonstrated additive**
>   on the same model run.
> - **Per-mode loss magnitudes table** and **per-mode bootstrap
>   ceilings**: not run yet. Would require ~30 min experiment time.
> - **Cost-utility function**: not specified anywhere I can find. The
>   downstream `adaptive_reevaluate` middleware's existing decision
>   rule is also not pinned to a quantitative utility — it currently
>   does adaptive-deepening based on quantile-of-worst-decision-quality
>   after a partial-search burst, but the SPA-side allocator wrapping
>   that hasn't named its operating point.
>
> ## The drill-down questions for turn 2
>
> Given that confirmation, three concrete questions:
>
> ### Q1 — Order of operations next 1-2 weeks
>
> You recommended:
> - Week 1: train partial-search head on year2000, evaluate OOD on
>   existing 68 cards.db; reframe one target as delta-prediction and
>   re-run.
> - Week 2: retrain on year2000 + phase-3 mixed; re-evaluate.
> - Throughout: write capability dispatch.
>
> Phase-3 is still in flight (collecting ~750 more cards.db positions;
> ~360 done as of context-wrap, ETA ~3hr from then, so probably ~24-48
> hours total). **Should the OOD-R² test run on the existing 68
> cards.db RIGHT NOW (today), or wait for phase-3 to provide a more
> statistically meaningful OOD set (~200-500+)?** Tradeoffs:
>
> - Running now on 68: cheap (~30 min), gives a directional answer
>   immediately, may have noisy R² with only 68 positions × 4-7
>   targets.
> - Waiting for phase-3: more statistical power, but delays the
>   architectural commit by 1-2 days. The phase-3 corpus is
>   volatile-card-only (no non-volatile controls); current 68 includes
>   20 non-volatile controls, which gives a useful mix.
>
> The user's running concern is that "decision quality" research has a
> tendency to drift into perpetual diagnostic refinement. He wants a
> forcing function. Which timeline is right?
>
> ### Q2 — Delta-prediction reframe: concrete shape
>
> You recommended reframing the target to "`y(V_target) - y(V_current)`
> for several `(V_current, V_target)` pairs sampled from the trajectory."
>
> The user can implement this but wants you to be concrete on the loss
> / pair-sampling shape. Specifically:
>
> - **Sampling strategy**: uniform over (V_current, V_target) pairs
>   where V_current < V_target? Or anchored — e.g. V_current ∈ {V_pre,
>   1/3, 2/3} fixed × V_target sampled? Or paired-uniform-in-log-V?
> - **Loss**: MSE on the delta? Or relative-delta (delta / y_range)?
>   Or a quantile loss (since the allocator cares about the worst-case,
>   not mean)?
> - **Per-realization vs averaged label**: predict the delta on a
>   single realization (noisier but more data points) or on the
>   across-realization average (cleaner but only N=437 positions)?
> - **Output dimension**: scalar (predict delta for one specific (V_c,
>   V_t) pair) or vector (predict delta at K anchor V_t's
>   simultaneously)?
>
> These are technical-choice axes that the user can't easily pick
> blindly; opinionated direction here matters.
>
> ### Q3 — Capability dispatch shape
>
> You recommended a "capability dispatch" rather than a "contract
> dispatch." The proxy's existing v1.0.14 capability-negotiation
> pattern (from `/home/bork/w/omega/proxy/CLAUDE.md` and the umbrella's
> CLAUDE.md) advertises capabilities like `delta_analysis`,
> `transposition`, `adaptive_reevaluate`, `selector`. The frontend
> opts in per-query.
>
> If the SPA-side allocator needs the proxy to support staged search
> with intermediate-budget observations, what's the right capability
> name + advertisement shape? Possible options:
>
> - `staged_analysis` capability — proxy commits to emitting trajectory
>   packets at SPA-specifiable visit thresholds, SPA can terminate
>   after each stage
> - `tasting_search` — SPA requests a partial-search burst of N visits,
>   gets packets back, then issues a follow-up query with the previous
>   state to continue
> - `visit_budget_callback` — proxy supports a per-query `on_progress`
>   callback that triggers at user-specified V thresholds; SPA can
>   short-circuit by returning a termination signal
>
> Any of these need to compose with the existing `adaptive_reevaluate`
> capability (which already does some adaptive deepening but inside
> the proxy, with the SPA blind to the trajectory).
>
> You don't need to write the dispatch document — but a one-paragraph
> sketch of the capability shape (which option, what's advertised,
> what's the per-query opt-in) would let me prepare the dispatch with
> the right scaffolding when the time comes.
>
> ## What I'd love from this turn
>
> A concrete, opinionated set of operational answers — not three more
> option enumerations. The user wants direction so he can move. Pick
> what you think the answer is, name why, name what you'd change your
> mind on. If a question is best answered "depends on X — measure X
> first," name X concretely.
>
> Match the format of the previous turn if it helps: framework-first,
> per-question, what-you-don't-know.

---

## 4. Turn 2 — the firewall's response

(verbatim)

> # Turn 2: Operational answers
>
> Three concrete questions, three concrete answers. I'll be opinionated
> and name the conditions under which I'd flip.
>
> ---
>
> ## Framework reminder
>
> The forcing function the user wants is real and the right instinct.
> "Decision-quality research" drifts into diagnostic refinement
> because every measurement suggests another measurement. The cure is
> to pre-commit to **what number, measured how, would cause what
> action** — before running the measurement. I'll try to name that for
> each question.
>
> The overarching frame I'd hold: **the regression head is a means,
> not an end.** The end is "the SPA allocator spends visits where they
> buy decision quality." Every research choice should be scored on
> "does this get us closer to a deployable allocator," not "does this
> improve R² on a held-out slice." That filter answers most of the
> sub-questions below.
>
> ---
>
> ## Q1 — Order of operations: run OOD on 68 *today*
>
> **Answer: run it today, on the existing 68. Do not wait for phase-3.**
>
> Why:
>
> 1. **The directional signal is the load-bearing bit.** You don't need
>    a tight confidence interval to decide architecture. You need to
>    know whether the regression head transfers at all, transfers
>    partially, or collapses to the floor like the cleanness
>    classifier did (45→20%). Those three regimes look different even
>    at N=68 × 4-7 targets — you'd see them in the point estimate plus
>    a bootstrap CI wide enough to be honest about the noise.
>
> 2. **The forcing-function value of "I ran the test and it told me
>    X" today is higher than the statistical-power value of "I ran the
>    test and it told me X more precisely" in 48 hours.** This is the
>    anti-perpetual-refinement move. If you wait for phase-3 to make
>    the OOD test "more meaningful," you've started doing exactly the
>    thing the user is worried about: deferring the decision pending
>    one more measurement.
>
> 3. **The 20 non-volatile controls are load-bearing for
>    interpretation.** Phase-3 is volatile-card-only. If transfer holds
>    on the 48 volatile cards.db positions but the 20 non-volatile
>    controls regress to year2000-pro-game-like behaviour, that's a
>    *qualitative* finding about the volatility axis that phase-3
>    alone cannot give you. Running now preserves that signal;
>    running only after phase-3 mixes it into a larger volatile-heavy
>    slice where the controls get drowned.
>
> 4. **Re-running on phase-3 when it lands is ~30 minutes more.**
>    You're not committing to skipping the more-powerful measurement,
>    you're sequencing it after the directional one.
>
> **What I'd pre-commit to as decision rules:**
>
> - If R² on cards.db OOD ≥ 0.5× within-corpus R² → transfer is real,
>   proceed to delta-reframe and capability dispatch on the current
>   architecture. Phase-3 firms up the estimate but doesn't change the
>   plan.
> - If R² is in 0.2× to 0.5× → transfer is partial, the delta-reframe
>   is doing double duty (better target *and* possibly closing some of
>   the transfer gap). Re-evaluate after phase-3 lands.
> - If R² < 0.2× or negative → the regression head as currently shaped
>   does not transfer. This is the cleanness-classifier-redux outcome.
>   Stop architecture work, ask whether the year2000/cards.db
>   distribution gap is bridgeable by mixing (which phase-3 lets you
>   test directly) or whether the target is wrong at a level deeper
>   than delta-vs-shape.
>
> **Tiebreaker test that costs almost nothing**: also run **year2000 →
> year2000** within-corpus performance on the same 68-sized random
> subset (held out by position), as a noise-floor reference for "how
> much R² wobble does N=68 produce when nothing has changed about the
> distribution." If the cards.db OOD R² is within the wobble band of
> that 68-sized within-corpus number, your transfer-or-not signal is
> too noisy to act on and you do need phase-3. If it's clearly
> outside, the 68 is enough.
>
> **What would change my mind**: if the 68 is so unbalanced (e.g. 20
> non-volatile + 48 volatile but the volatile cluster is dominated by
> 3 distinctive position types) that even a directional answer is
> suspect on representativeness grounds. You'd know this from looking
> at the 68 positions, not from waiting for phase-3.
>
> ---
>
> ## Q2 — Delta-prediction reframe: concrete shape
>
> The user wants opinionated technical-choice answers. Here they are,
> in the order they matter.
>
> ### Sampling strategy: **anchored, not uniform**
>
> Use **fixed `V_current` anchors** at decision-relevant budgets — not
> uniform pairs.
>
> - `V_current ∈ {V_floor, V_floor × 4, V_floor × 16}` where `V_floor`
>   is the SPA's smallest allocatable budget (probably ~100-400 visits
>   per the existing adaptive_reevaluate behaviour, but the user knows
>   the actual number).
> - `V_target` sampled log-uniformly from `[V_current × 2, V_max]`
>   where `V_max` is the trajectory's recorded ceiling.
>
> Why anchored: the allocator's decision is "given that I'm currently
> at V_current, should I spend more to reach V_target?" The allocator
> never asks "given an arbitrary V_current..." — it asks given a
> specific budget state. Anchoring the training distribution to the
> operating budget states puts the model's resolution where it's
> needed. Uniform sampling spreads it over (V_current, V_target)
> regions the allocator will never query.
>
> Why log-V_target: the trajectories are monotone-ish in log-V (this
> is implicit in why the parametric forms — exponential, hyperbolic —
> fit at all). Log-uniform pairing makes the per-decade signal weight
> comparable.
>
> Why exclude `V_target < 2 × V_current`: deltas there are at-or-below
> the realization noise floor and you'd be training on noise. The
> factor-of-2 is conservative; if mode-stratified noise estimates
> suggest you can go tighter, do so.
>
> ### Loss: **MSE on the delta, with per-position normalization**
>
> Predict `(y(V_target) - y(V_current)) / σ_position`, where
> `σ_position` is the across-realization standard deviation of `y` at
> the position (computed on the *training* data, not target-leakage-aware
> on the eval side).
>
> Why per-position normalization: positions vary by 2-3 orders of
> magnitude in trajectory volatility. An unnormalized MSE will be
> dominated by the noisy positions and the model will under-fit the
> quiet ones. Per-position normalization puts the loss on a comparable
> footing across the corpus.
>
> Why MSE not quantile: the allocator does care about the worst-case,
> but the *clean way to get worst-case behaviour* is to predict the
> delta distribution (mean + uncertainty) and let the allocator's
> decision rule consume both, rather than to bake worst-case-bias into
> the regression loss. A quantile loss couples training and decision
> rule in a way that's hard to reason about. Defer that coupling.
>
> If you want one cheap step in the direction of uncertainty-aware:
> train two heads simultaneously — mean delta and `log σ_delta` —
> with a Gaussian-NLL loss. Costs nearly nothing, gives the allocator
> a calibrated uncertainty band, decouples the worst-case decision rule
> from the training signal.
>
> ### Per-realization vs averaged: **averaged, with realization count as a feature**
>
> Train on across-realization average deltas. Add `n_realizations` (or
> `log n_realizations`) as an input feature so the model can learn to
> discount its own confidence on low-N positions.
>
> Why averaged: with the parametric labels you already have a
> "smoothed" view of the trajectory; per-realization noise is mostly
> nuisance for the delta-prediction task. The information loss from
> averaging is small relative to the noise reduction.
>
> Why expose `n_realizations` to the model: it lets you train on
> positions with varying N without forcing them onto the same noise
> scale, and (more useful) it gives the deployment-time allocator the
> right thing to ask: "what would the model predict if I had only
> seen one realization so far?" by passing `n_realizations=1` at
> inference.
>
> ### Output dimension: **vector at K=3 anchor targets, multi-head**
>
> Output a length-K vector of deltas at fixed `V_target` anchors per
> `V_current`. K=3 is plenty: e.g. `V_target ∈ {V_current × 4, V_current
> × 16, V_max}`.
>
> Why vector not scalar: the K outputs share most of the representation
> work (same position, same V_current); training them jointly is
> essentially free and the model picks up "trajectories tend to
> flatten / continue / oscillate" as shared structure across K heads
> without needing an explicit shape descriptor.
>
> Why fixed anchors not (V_current, V_target) as input: making
> V_target a feature is also fine, but with K=3 fixed anchors you get
> a sharper decision interface (the allocator asks one of three
> discrete questions) and avoid the model having to learn smoothness
> in V_target as a separate axis.
>
> **What would change my mind on the whole reframe**: if you ran the
> delta-reframe and within-corpus R² *dropped* relative to the
> shape-descriptor target on a comparable validation slice. The
> reframe's argument rests on "the delta is the decision-relevant
> quantity *and* a denser signal" — if R² drops, one of those is
> wrong, most likely the second, and you'd want to understand why
> (probably: parametric H is smoothing out the very thing you want to
> predict).
>
> ---
>
> ## Q3 — Capability dispatch shape
>
> Of the three options, **`staged_analysis` is closest to right, but
> I'd reshape it.**
>
> ### Sketch
>
> **Capability name**: `staged_analysis` — keeps the noun-verb shape of
> `delta_analysis`, `transposition`, `selector`, `adaptive_reevaluate`.
> Reads as "the proxy supports analysis staged across multiple visit
> budgets."
>
> **What's advertised** (in the v1.0.14 capability dict on
> `query_version` responses):
>
> ```
> "staged_analysis": {
>   "supported_budgets": "log-spaced",   // or "arbitrary"
>   "min_budget_per_stage": <int>,       // proxy's floor; SPA can't go below
>   "max_stages_per_query": <int>,       // proxy's ceiling per query
>   "supports_early_termination": true,  // SPA can stop after stage k < N
>   "trajectory_packet_shape": "delta_state_v1"
> }
> ```
>
> The capability *advertises shape*, not policy. The SPA learns what
> the proxy can do; the SPA's allocator decides what to ask for.
>
> **Per-query opt-in** (on the analysis query payload, symmetric to
> `analysis_config`):
>
> ```
> "staged_analysis": {
>   "stages": [
>     {"budget": V1, "emit_trajectory": true},
>     {"budget": V2, "emit_trajectory": true},
>     {"budget": V3, "emit_trajectory": false}
>   ],
>   "early_termination_token": "<spa-generated-cid>"
> }
> ```
>
> The SPA pre-declares the visit budgets it wants observations at. The
> proxy fires off the search, emits `delta_state_v1` packets at each
> declared budget, and (if `supports_early_termination` is true)
> listens for a wire-side termination signal keyed by the token.
>
> ### Why this shape and not the others
>
> - **`tasting_search` (SPA polls, re-issues with state)** loses the
>   proxy's continuous-search context. The proxy would have to
>   checkpoint+restore the MCTS tree on each follow-up, which is
>   expensive and re-opens the empty-board-ponder class of bugs the
>   v1.0.0 freeze-lift fixed. Don't do this.
>
> - **`visit_budget_callback` (proxy calls back into SPA)** inverts the
>   existing direction (SPA queries, proxy responds) and complicates
>   the wire shape — bidirectional within a single query is a much
>   larger contract change. The capability negotiation pattern is
>   one-way per query for a reason.
>
> - **`staged_analysis`** keeps the existing direction (SPA queries
>   with a pre-declared staging plan, proxy emits a sequence of
>   authoritative-or-preview packets), composes with
>   `adaptive_reevaluate` (the proxy can still do its own adaptive
>   deepening *inside* a stage if asked), and matches the
>   trajectory-substrate's own conceptual shape (positions sampled at
>   log-spaced visit budgets — the same shape your training data was
>   collected in).
>
> ### Composition with `adaptive_reevaluate`
>
> The two capabilities address different layers:
>
> - `adaptive_reevaluate` = proxy-internal adaptive deepening based on
>   quantile-of-worst-decision-quality. Decision authority lives in
>   the proxy. SPA blind to trajectory.
> - `staged_analysis` = SPA-controlled multi-budget search with
>   trajectory observability. Decision authority lives in the SPA's
>   allocator. SPA sees trajectory.
>
> These compose: the SPA can request `staged_analysis` with
> `adaptive_reevaluate` enabled per-stage, in which case the proxy
> does its own quantile-driven deepening within the stage's budget,
> and the staged-emission machinery wraps it. Or the SPA can use
> `staged_analysis` alone and have the SPA-side allocator do the
> budget decisions — which is the deployment target for the
> visit-scaling work.
>
> The decision rule for "which capability handles the deepening" stays
> clear: if the SPA has a trained allocator with a position-specific
> budget plan, use `staged_analysis`. If it doesn't (the legacy path,
> or positions the allocator hasn't been trained on), use
> `adaptive_reevaluate` alone. The two are not redundant; they're
> stacked.
>
> **What would change my mind**: if the SPA's allocator wants to make
> budget decisions *mid-stage* based on a partial-stage observation —
> e.g. "I asked for 1024 visits but at 512 the trajectory looks
> settled, kill it." Then you do want a callback shape, and
> `staged_analysis` as I've described it is insufficient. Worth asking
> the user whether that's a realistic allocator behaviour before
> locking the capability shape.
>
> ---
>
> ## What I still don't know
>
> - **The SPA allocator's existing decision rule** at any level of
>   detail. I'm guessing it's a quantile-of-worst-decision-quality rule
>   because that's what `adaptive_reevaluate` does, but the SPA-side
>   allocator may be qualitatively different.
> - **Whether the SPA's deployment-side visit-budget grid is fixed or
>   learned.** If it's fixed (e.g. the SPA always asks {256, 1024,
>   4096}), `staged_analysis`'s `"supported_budgets": "log-spaced"`
>   shape with a fixed grid is fine. If the allocator learns
>   position-specific budgets, you need `"arbitrary"`.
> - **Whether realization noise on the cards.db 68 is comparable to
>   year2000 noise.** If cards.db positions are systematically noisier
>   per realization (likely, given Hatsuyoron-level volatility), the
>   σ_position normalization may need to be split by domain.
> - **The cost-utility function**, which I noted in turn 1 and which
>   the user confirmed is still unspecified. The delta-prediction
>   reframe is *less* sensitive to this than the shape-descriptor
>   target was, but it's not zero-sensitive: K=3 anchor targets and
>   the `[V_target × 4, V_target × 16, V_max]` defaults bake in *an*
>   implicit utility shape. If the allocator's utility turns out to be
>   sharply asymmetric (e.g. only the top 5% of decision-quality wins
>   matter), the anchors are wrong. The user should at least sketch a
>   utility shape before phase-3 lands.
>
> ---
>
> ## Recommended sequence for the next 7 days
>
> 1. **Today**: run cards.db OOD R² test on existing 68 + the
>    within-corpus 68-subset noise-floor reference. Decision tree
>    above.
> 2. **Day 2-3**: assuming the R² test passes the 0.5× bar, implement
>    the delta-reframe (anchored sampling, MSE on per-position-normalized
>    delta, averaged labels with `n_realizations` exposed, K=3 vector
>    head). Re-evaluate OOD.
> 3. **Day 3-4**: phase-3 lands. Re-evaluate both heads (shape-descriptor
>    and delta) on the larger OOD slice. This confirms or revises the
>    day-1 directional read.
> 4. **Day 4-5**: draft `staged_analysis` capability dispatch to proxy.
>    One-page memo following the format of existing dispatches in
>    `docs/dispatch/`. User sends.
> 5. **Day 5-7**: cost-utility function sketch (one page), and on the
>    modelling side, integrate utility into the allocator's decision
>    rule on top of the trained delta-head.
>
> If the day-1 cards.db OOD test fails the 0.2× bar, the sequence is
> different: stop the architecture work, redirect to "is the
> year2000/cards.db gap bridgeable by training-set mixing or is it a
> deeper target-specification problem?" That's a separate one-week arc
> and I'd want to consult again before naming its shape.

---

## 5. Distillation — operational direction

Each item carries a pointer back to the supporting passage in §2 or
§4 above. The priority numbering reflects the firewall's overall
message: **validate transfer before locking architecture**, then
reframe the target to match what the allocator actually consumes,
then commit only a capability-shaped dispatch.

### Tier 0: do this today

**0.1. Run year2000 → cards.db OOD R² on the existing 68 positions.**

> *Source: turn 1, "The opinionated direction I'd commit to" §1; turn
> 2, Q1.* The single load-bearing experiment. Forcing-function value
> beats statistical-power value at this stage; phase-3 statistical
> power is a Day 3-4 follow-up, not a Day 1 prerequisite.

Pre-committed decision rules (turn 2, Q1):

| OOD R² / within-corpus R² | Action |
|---|---|
| ≥ 0.5× | Architecture is shippable. Proceed to delta-reframe and capability dispatch. Phase-3 firms up the estimate but doesn't change the plan. |
| 0.2× to 0.5× | Partial transfer. Delta-reframe may close the gap; phase-3 will tell us. |
| < 0.2× | Architecture doesn't transfer. Stop, redirect to distribution-gap question (mixing vs deeper target specification). |

**0.2. Tiebreaker: year2000 → year2000 on a random 68-position holdout.**

> *Source: turn 2, Q1 "Tiebreaker test that costs almost nothing".*
> Noise-floor reference for "what does R² wobble look like at N=68 when
> distribution is held constant?" If cards.db OOD R² falls within the
> wobble band of this reference, the signal is too noisy to act on at
> N=68 and phase-3 is needed.

### Tier 1: this week (conditional on Tier 0 ≥ 0.5×)

**1.1. Delta-prediction reframe.**

> *Source: turn 1, Q2; turn 2, Q2.* Predict `(y(V_target) -
> y(V_current)) / σ_position` rather than shape descriptors. The
> allocator's decision is "given current V_current, should I spend ΔV
> more visits?" — that's a delta quantity. Going through an
> asymptote-then-differentiate path loses information.

Concrete shape (turn 2, Q2):
- **Sampling**: anchored `V_current ∈ {V_floor, V_floor × 4, V_floor
  × 16}` × `V_target` log-uniform from `[V_current × 2, V_max]`.
  Anchored not uniform — the allocator only queries from specific
  budget states.
- **Loss**: MSE on per-position-normalized delta. Optionally add a
  `log σ_delta` head with Gaussian-NLL loss for calibrated
  uncertainty at near-zero extra cost.
- **Labels**: averaged across realizations; expose `n_realizations`
  as a feature so deployment can pass `n_realizations=1`.
- **Output**: K=3 vector head at fixed `V_target` anchors per
  `V_current`. Cheaper than scalar+V_target-as-input and gives a
  sharper decision interface.

Kill-criterion: if within-corpus R² *drops* on the reframe vs
shape-descriptor targets, the "delta is a denser signal" claim is
wrong — likely because parametric H is smoothing out the very thing
we want to predict. Investigate before continuing.

### Tier 2: this week (independent of Tier 0/1 outcomes)

**2.1. Capability dispatch to proxy — `staged_analysis`, not contract.**

> *Source: turn 1, Q5; turn 2, Q3.* Write a *capability* dispatch
> (proxy commits to a shape) not a *contract* dispatch (exact wire
> format for the SPA's consumption). The capability is stable
> regardless of which regression target lands; the contract isn't.

Sketch (turn 2, Q3):
- **Capability name**: `staged_analysis` (composes with the existing
  `adaptive_reevaluate`).
- **Advertised in `query_version`**: `supported_budgets`,
  `min_budget_per_stage`, `max_stages_per_query`,
  `supports_early_termination`, `trajectory_packet_shape`.
- **Per-query opt-in**: SPA pre-declares a `stages: [{budget: V_i,
  emit_trajectory: bool}, ...]` plan + an `early_termination_token`.
  Proxy emits trajectory packets at each declared budget; SPA can
  short-circuit via the token.
- **Composition with `adaptive_reevaluate`**: stacked, not redundant.
  SPA-trained allocator → `staged_analysis` alone (SPA owns budget
  decisions). Legacy / untrained positions → `adaptive_reevaluate`
  alone (proxy owns).

Rejected alternatives: `tasting_search` loses MCTS state across the
SPA-proxy boundary (re-opens the empty-board-ponder bug class);
`visit_budget_callback` inverts query direction and bloats the wire
contract.

Mid-stage termination decision needed before drafting: if the SPA's
allocator may want to terminate within a stage (not just at stage
boundaries), `staged_analysis` as sketched is insufficient and a
callback shape becomes necessary. User-discretionary call.

### Tier 3: deferred until Tier 0-2 lands

**3.1. Sequence models on the (V, y) packet stream.**

> *Source: turn 1, Q3.* Probably not yet. The signal is largely
> linear (Logistic ≈ LGBM at 1/3 search per handoff §2.7), so the
> structure is mostly capturable by tabular features. Sequence models
> would buy ~+0.05 R² at substantial implementation, validation, and
> deployment-risk cost — the cost asymmetry on a production-bound
> research project is real.

Escalate **after** the partial-search-LGBM ceiling is empirically
established and shown insufficient. Defer DeepSets / NPE more
strongly — data is naturally a time series not a set, and the NPE
framing reintroduces a parametric posterior we've successfully
de-parametricised.

**3.2. Cost-utility function sketch.**

> *Source: turn 1, "What I'd want to know" #6; turn 2 "What I still
> don't know".* Unspecified throughout the arc. The K=3 anchor
> defaults (`V_target × 4, × 16, V_max`) bake in *an* implicit
> utility shape. If utility is sharply asymmetric (only top-5% wins
> matter), the anchors are wrong. User-discretionary; sketch before
> phase-3 lands.

### Open questions the firewall flagged for the user

These are calls the firewall couldn't make alone and the user should
weigh in on:

- **The cost-utility function.** Is it `quality_gain / visits_spent`?
  `quality_gain - λ × visits_spent`? A latency SLA?
- **Mid-stage termination in scope?** Changes the capability from
  `staged_analysis` to a callback shape.
- **Is the deployment budget grid fixed or learned?** Determines
  whether the capability advertises `"supported_budgets":
  "log-spaced"` (fixed) or `"arbitrary"`.
- **The SPA allocator's existing decision rule** at the protocol
  level, if any beyond the proxy-side `adaptive_reevaluate`.

### Where the firewall disagrees with the existing framing

- The handoff's "Don't do classification → regression. Mode-as-feature
  works; mode-as-routing-key doesn't" generalizes from one experiment
  on one target. Weaken to the per-target statement until more
  evidence accumulates. Don't write this into the dispatch yet.
- The handoff calls direct-partial-search-regression "the
  architectural test of the pivot." It's a confirmatory experiment,
  not a falsifying one. **The falsifying experiment is OOD transfer.**
- Both the memo and the handoff treat the target as fixed (shape
  descriptors). The largest underweighted axis is **the prediction
  target should match what the allocator consumes** — reframing the
  target is more leveraged than refining the regression head.
- The interim memo's recommendation #1 ("commit the architecture in a
  design note and a dispatch to the proxy maintainer") is explicitly
  superseded by the handoff, but the underlying urge survives. Resist
  it for one more week. Capability dispatch yes; contract dispatch
  not yet.

---

## 6. Action register

(populated as recommendations are acted on)

| Date | Recommendation | Status | Notes |
|---|---|---|---|
| | 0.1 — year2000 → cards.db OOD R² | open | Pre-committed decision rules in §5 Tier 0. |
| | 0.2 — year2000 → year2000 noise-floor reference | open | Tiebreaker for "is N=68 enough?" |
| | 1.1 — delta-prediction reframe | conditional on 0.1 ≥ 0.5× | Concrete shape in §5 Tier 1. |
| | 2.1 — capability dispatch (`staged_analysis`) | open, this week | Sketch in §5 Tier 2; mid-stage-termination decision needed first. |
| | 3.1 — sequence models | deferred | Re-evaluate after Tier 1 ceiling is known. |
| | 3.2 — cost-utility function sketch | open, before phase-3 lands | User-discretionary. |

---

License: Public Domain (The Unlicense)
