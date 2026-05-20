# Opus 4.7 strategic consult — 2026-05-21

Consultation for strategic gut-check on the visit-scaling research arc.
Full Q&A transcript preserved verbatim. Brief sent to a fresh Opus 4.7
agent with three documents (firewall consult, session state, session
report) and four ranked strategic questions.

## Brief sent (paraphrased — see actual session transcript for full text)

Asked for opinionated, concrete answers on:

- Q1: Given the headroom is in features/model not labels, the most
  valuable next investment is (a) multi-timestep input features,
  (b) ResNet retraining with the per-target-σ² loss fix, (c) a new
  curve family for the dip-then-rise reading-paradox, (d) something
  else entirely? Pick ONE and justify why.

- Q2: The user's "volatile" annotation and our (H, κ) signal diverge
  on specific cards. Should we treat the user's labels as gold
  standard (force the model to predict them) or treat the divergences
  as informative findings? Pick ONE stance.

- Q3: Non-parametric labels show 2-3× improvement but still capture
  only ~30-40% of the bootstrap ceiling. Most likely cause of the
  remaining gap — feature insufficiency, model capacity, label noise,
  or methodology issue?

- Q4: The user is considering collecting another 5GB of uniformly
  sampled positions. Should they?

## Opus 4.7 response (verbatim)

### Q1. Pick ONE next investment: multi-timestep features (a).

Not (b), not (c), not (d). Reasoning:

- Your log-space ceiling is +0.4 to +0.84 and you're at +0.28-+0.33
  on the best non-parametric labels. The Kalman intuition from the
  firewall is now *more* load-bearing, not less: trajectory features
  look at samples that have already partially integrated the very
  thing you're trying to predict. The reading-paradox dip-then-rise
  pattern (finding B) is precisely the kind of structure that a
  V=500 + V=2000 snapshot reveals and V_pre cannot — the dip *is*
  the second derivative, observable directly if you query the
  trajectory mid-flight.
- (b) ResNet retraining is downstream of features. Loss-fix on a
  feature-starved input gets you a better optimum of a model that
  still can't see the trajectory shape. Worth doing eventually, but
  second.
- (c) A new curve family is the wrong response to finding B. You've
  already shown non-parametric labels are 2-3× better than any
  hyperbolic variant; the *labels* are no longer the issue.
  Inventing dip-then-rise families re-creates the same identifiability
  swamp at one parameter higher.
- The data exists. The cost is feature extraction, not collection.
  This is the firewall's "single most defensible cheap experiment"
  and the case got stronger, not weaker, since.

### Q2. Treat the divergences as informative findings — not gold standard.

The user's "volatile" tag is a behavioural marker (does this position
annoy me / am I uncertain in SR?), not a property of MCTS scaling.
Forcing the model to predict it conflates two things: positions where
*the user* needs more thinking time, and positions where *KataGo's
search* extracts meaningful information by deepening. Card 1408 —
"non-volatile" parent, κ ≈ 32× corpus median for visit_entropy — is
the most informative data point you have: it tells you the (H, κ)
signal captures a *different and real* facet
(slow-information-extraction-from-boring-looking-positions) that
doesn't map onto user-annoyance. Heredity at 2× tightness across all
four targets is the kind of structural finding you don't get if your
discriminator is just a user-label regressor. Use the user labels as
a sanity prior and as a *source of curated OOD positions*, not as
the truth.

### Q3. The gap is feature insufficiency — specifically, single-timestep myopia.

Not capacity (LGBM with depth-7 and 23 features is comfortably
under-capacity for n=2300). Not label noise (you measured this; the
bootstrap is honest). Not methodology (GroupKFold-by-position is
correct). Your top LOFO features — `policy_entropy`, `score_stdev`,
`raw_noresult` — are all V_pre proxies for "how confused is the
net". They cannot distinguish a position whose confusion *resolves*
at V=500 from one whose confusion *deepens*. That's exactly the
dip-then-rise distinction, and exactly the gap multi-timestep closes.
Expect +0.15-+0.25 R² on the best targets from this alone.

### Q4. No. Don't collect another 5 GB of year2000-style positions.

Collecting more uniformly-sampled pro positions samples *more of the
same distribution* you've already saturated at 344 positions / +0.12
R². The bottleneck is not coverage; it's that each position has 23
scalars when it has 50,000+ floats available. The marginal 5 GB buys
maybe +0.03 R² ceiling at LGBM's rate-of-N curve. What *would* be
worth collecting: the **2200 cards.db volatile-tagged positions** at
n=10 each. That gets you an OOD test set with known structure, lets
the cleanness classifier actually be evaluated, and tests whether
multi-timestep features generalise off-distribution — which is the
real question for the eventual SPA-side allocator.

## Outcome

All four recommendations adopted. Specifically:

- Q1 (multi-timestep features) → implemented `regression_multitimestep_input.py`
  with index-based windowing (1/3, 2/3, full). Confirmed +0.70 R² on
  `scoreLead_drift|hyperbolic|H` (vs baseline +0.119), well exceeding
  the +0.15-+0.25 prediction.

- Q2 (divergences as findings) → adopted as session policy. Card 1408
  (non-volatile parent with extreme κ) was treated as a feature of
  the signal rather than a label error; subsequent clustering placed
  it in the "clean-monotone" mode, confirming Opus 4.7's read.

- Q3 (single-timestep myopia) → confirmed quantitatively by the
  V2 mode classifier: V_pre alone gives 31% accuracy (below chance),
  V_pre + 1/3 search gives 67%, V_pre + 2/3 search gives 82%. Exactly
  the gap multi-timestep closes.

- Q4 (no 5GB year2000 collection) → adopted. Instead expanded the
  cards.db sample to 73 positions (5 seeds + 13 family + 30 expanded
  volatile + 20 non-volatile controls), per the recommendation.
