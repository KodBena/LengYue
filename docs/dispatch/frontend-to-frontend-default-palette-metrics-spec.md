# Default-Palette Metrics — Specification for Successor Implementation

- **Date:** 2026-04-28
- **From:** frontend (authoring session, 2026-04-28)
- **To:** frontend (successor implementation session)
- **Type:** spec / design proposal
- **Status:** open — awaiting implementation
- **Suggested filing:** `docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`
  per ADR-0005's dispatch-ledger convention.

This document specifies the work required to (a) repair the
long-standing default-palette regression and (b) replace the single
under-developed seed palette with a curated set of metrics that gives
out-of-the-box users something genuinely informative across the
common axes of MCTS-derived position analysis. The successor
implementing this spec works frontend-side: editing
`src/store/defaults.ts`, writing a schema migration in
`src/store/migrations.ts`, and verifying the seed compiles cleanly
through the proxy's `RegistryInterpreter`.

The output is a draft. Item-by-item review and metric culling is
expected before merge; the spec is deliberately broader than the
final seed, to give the user genuine choice over what ships.

## Provenance and licensing

This spec was authored from three sources:

1. **`/home/bork/omega/proxy/NOTICE`** — established that the proxy
   root is public domain (Unlicense); only `goboard_transposition/`
   carries attribution obligations. That subdirectory is derived
   from two upstream MIT-licensed projects: KataGo (for the search
   / analysis-data structure) and nlohmann/json (vendored under
   `goboard_transposition/third_party/nlohmann/` to make distribution
   tractable). Nothing in this spec touches `goboard_transposition/`
   or its third-party vendor tree. No attribution shadow falls on
   the metric definitions below.

2. **`/home/bork/omega/proxy/{baduk.py, reginterp.py, bsa.py,
   proxy_server.py}`** — public-domain proxy source defining the
   lambda evaluation environment. Read freely; the metric
   definitions below are original work informed by that environment's
   capabilities.

3. **`KataGo/docs/Analysis_Engine.md`** (MIT, upstream KataGo) —
   read for *capability inventory*: which fields KataGo emits and
   what they mean. The metric definitions in this spec are designed
   *against* that field inventory but transcribe none of KataGo's
   own metric logic. The doc itself proposes example metrics in its
   "Possible metrics that might be interesting" section; those have
   informed the *axes* I'm thinking along but the formulas below
   are independent.

Per the project's Unlicense posture, the metric definitions in this
spec are public domain.

## Part 0 — The trivial fix (atomic, must ship even if everything else gets re-scoped)

The current seed's `visit_ratio` symbol calls a function `uservisits`
that does not exist. The proxy's stdlib provides `_uservisits` (with
underscore). Whenever the profile is wiped (fresh install, defaults
restoration, store-reset on logout), the broken seed re-installs and
per-color and summary analyses regenerate the failure mode.

The bare-minimum fix is one substitution in
`src/store/defaults.ts`:

```diff
- visit_ratio: 'uservisits(x[0]) / x[0]["rootInfo"]["visits"]',
+ visit_ratio: '_uservisits(x[0]) / x[0]["rootInfo"]["visits"]',
```

This is what the "trivial" fix has been deferred against. The
successor implementing this spec ships this substitution as the
floor, regardless of how deep the rest of the metric work goes.

There is, however, a **semantic question** lurking that is worth
resolving before we re-establish the seed for the long term: what
the right denominator is.

Three candidates exist in the codebase:

```python
# Broken seed — share of total search budget
uservisits(x[0]) / x[0]['rootInfo']['visits']

# Stdlib's `_visit_ratio` — fraction of order-0 move's visits
_uservisits(x[0]) / x[0]['moveInfos'][0]['visits']

# Recommended — fraction of *most-visited* move's visits
_uservisits(x[0]) / _maxvisits(x[0])
```

The first two have semantic problems. The seed's `rootInfo.visits`
denominator collapses the metric to "share of budget" — when the
user picks the top move, the result equals `spread`, not the
natural identity. The stdlib's `moveInfos[0].visits` denominator
*looks* clean but isn't quite right either: per
`Analysis_Engine.md`, `moveInfos[0]` is the move with the highest
`playSelectionValue` — the move KataGo would actually play —
which is *not necessarily the most-visited move*.
`playSelectionValue` is a heuristic combining winrate, score, and
other properties; visit count is a separate search-derived
statistic. They usually correlate but can diverge.

The recommended denominator `_maxvisits(x[0])` is **heuristic-
oblivious**: it discards `playSelectionValue`-derived ranking and
works purely with visit counts. This is the formulation the
robust-child-selection literature uses — most-visited child is
the trusted child, justified by UCT's regret-minimising
exploration policy concentrating budget on the genuinely best
arm. Compositions like `quality_delta` reduce cleanly to identity
when the user picks the most-visited move, regardless of what
KataGo's playSelectionValue would have ranked first.

`_maxvisits` is exactly the stdlib symbol provided for this
purpose (see `proxy/reginterp.py`). The successor's recommended
fix:

```diff
- visit_ratio: 'uservisits(x[0]) / x[0]["rootInfo"]["visits"]',
+ visit_ratio: '_uservisits(x[0]) / _maxvisits(x[0])',
```

See Part 4 for the recommended composition with the rest of the
seed.

## Part 1 — Lambda evaluation environment, summarised for reference

The successor will be writing strings that the proxy compiles into
asteval lambdas. Two evaluation contexts exist:

### Context A — `state_fns` (per-packet, unwindowed)

`x` is the **single preprocessed packet** at this turn — a dict with
the full KataGo response (`id`, `turnNumber`, `isDuringSearch`,
`moveInfos`, `rootInfo`, optionally `ownership`, `policy`, ...) plus
two proxy-injected fields:

- `x['userMove']` — GTP coord of the move actually played at this
  turn (drawn from the query's `moves` array).
- `x['userMoveInfo']` — the moveInfo entry for `userMove`, or
  `None` if the user's move wasn't analysed.

State functions run from turn 0 (no need for a preceding packet).
Returned values appear in `extra.state[turn][label]` per the
`state_fns` mapping.

### Context B — `delta_fn` and `summary_fn` (windowed pair)

`x` is a **two-element list** `[packet[t-1], packet[t]]` produced by
the BSA pipeline's `Window(-1, 0)`. So:

- `x[0]` — preprocessed packet at the previous turn (the position
  *before* the move at index `t-1` was played).
- `x[1]` — preprocessed packet at the current turn (the position
  *after* the move was played).

The delta-stream is then segregated by colour (BSA's per-colour
branches) and reduced through `summary_fn` over intervals to fill
the per-colour triangular matrix. `summary_fn` receives a list of
delta values for one player over an interval and returns the
interval's summary.

### Stdlib symbols (always available)

From `proxy/reginterp.py`:

| Symbol | Context | Definition (semantically) |
|---|---|---|
| `safe(v)` | universal | `0` if `np.isnan(v)` else `v`. NaN-safe identity. |
| `_uniform_entropy(n)` | universal | `log(n)` if `n > 1` else `1`. |
| `_visit_entropy(packet)` | A | Shannon entropy of `[mi.visits for mi in moveInfos]`. |
| `_spread(packet)` | A | `moveInfos[0].visits / rootInfo.visits` — order-0 move's share of root visits. ⚠ Heuristic-aware: uses `playSelectionValue`-ranked move, not the most-visited. |
| `_visit_ratio(window)` | B | `_uservisits(window[0]) / window[0].moveInfos[0].visits`. ⚠ Same caveat: denominator is order-0 move's visits, not max visits. |
| `_uservisits(packet)` | A | `userMoveInfo.visits` if present, else `0`. |
| `_maxvisits(packet)` | A | `max(mi.visits for mi in moveInfos)`. The **heuristic-oblivious** primitive — depends only on visit counts, ignoring `playSelectionValue`. Robust-child-aligned. |
| `np` | universal | numpy module. |
| `entropy` | universal | `scipy.stats.entropy`. |

A subtle hazard: `_spread` is defined twice in the stdlib, with the
second (single-packet form) shadowing the first (array form). The
working definition is the single-packet form. User symbols that
need a windowed spread should write `_spread(x[0])` or `_spread(x[1])`
explicitly.

### KataGo native fields, partitioned by likely usefulness

From `Analysis_Engine.md`. These are accessed directly from
`packet['rootInfo']` or `packet['moveInfos'][i]`:

**Position-level (`rootInfo`) — useful for state metrics:**
`winrate`, `scoreLead`, `scoreSelfplay`, `scoreStdev`, `utility`,
`visits`, `lcb`, `currentPlayer`, `rawWinrate`, `rawLead`,
`rawStWrError`, `rawStScoreError`, `rawVarTimeLeft`.

**Per-move (`moveInfos[i]`) — useful for top-vs-user metrics:**
`move`, `visits`, `edgeVisits`, `winrate`, `scoreLead`, `scoreMean`,
`scoreSelfplay`, `scoreStdev`, `prior`, `utility`,
`utilityLcb`, `lcb`, `weight`, `edgeWeight`, `order`,
`playSelectionValue`, `pv`, `pvVisits`, `pvEdgeVisits`,
optionally `noResultValue`, `ownership`, `ownershipStdev`.

(KataGo emits additional `human*` fields — `humanWinrate`,
`humanScoreMean`, `humanPrior`, etc. — when `-human-model` is
loaded. These are deliberately excluded from this spec; see Part 8
"Excluded by design" for the rationale.)

**Perspective caveat:** by KataGo's default config,
`reportAnalysisWinratesAs = SIDETOMOVE` — `winrate` and `scoreLead`
on each packet are from the perspective of the side to move at that
turn. A delta computed naively (`x[1].rootInfo.scoreLead -
x[0].rootInfo.scoreLead`) mixes perspectives across the move
boundary. The BSA pipeline mitigates this by *segregating deltas by
colour* before summary, so per-colour streams have consistent
intra-stream perspective even if the raw delta value's sign requires
contextual interpretation. The successor should preserve any
metric formulas as written in this spec; perspective normalisation
is a downstream concern handled (or not) by the BSA per-colour
treatment.

## Part 2 — Mandatory metrics

### `quality_delta` (preserved; canonical delta_fn)

```python
quality_delta(x) = visit_ratio(x) ** (spread(x[0]) ** alpha)
```

Where (with the heuristic-obliviousness correction applied
throughout):

- `visit_ratio(x)` = `_uservisits(x[0]) / _maxvisits(x[0])` — the
  user's chosen-move's visits as a fraction of the most-visited
  move's visits. `1.0` exactly when the user picked the
  most-visited (robust) child.
- `spread(x[0])` = `_maxvisits(x[0]) / x[0]['rootInfo']['visits']`
  — the most-visited move's share of total root visits. The
  pre-move position's top-heaviness, computed independently of
  KataGo's `order` ranking. The frontend redefines `spread` to
  override the stdlib's heuristic-aware version.
- `alpha` is a calibration parameter (current default `0.25`).

**Rationale to preserve in source:** The metric quantifies how well
the user's move aligns with the search's robust-child selection,
calibrated by the search's own confidence in that selection.
Robust-child selection (picking the *most-visited* child at search
end) is the standard MCTS extraction policy, justified by the
regret-minimising properties of UCT — the most-visited arm at
horizon tends to coincide with the optimal arm because the
exploration policy concentrates budget on promising candidates.
The use of `_maxvisits` (rather than `moveInfos[0].visits`) keeps
the metric heuristic-oblivious: it ignores
`playSelectionValue`-derived ranking and works purely with visit
counts, the substrate the regret bound is stated against.

The exponent `spread^alpha` is the calibrated smoother. When the
search is confident (top move dominates, `spread → 1`), the
exponent stays near 1 and `quality_delta` tracks `visit_ratio`
faithfully — the engine knew its preference, and deviation matters.
When the search is uncertain (broad, `spread → 0`), the exponent
compresses toward 0, lifting `quality_delta` toward 1 even for low
`visit_ratio` — many candidates were viable and the user's
deviation is forgiven proportionally.

Empirically (per the project author), `_visit_entropy` normalised
by `_uniform_entropy(N)` is closely correlated with the local
`spread` (the heuristic-oblivious `_maxvisits / rootInfo.visits`);
for positions with similar move-count `N`, the two are nearly
interchangeable as smoother inputs. A future iteration could swap
in an `entropy_normalised` symbol to make the smoother dimensionless
across positions of varying branching factor; for the seed,
`spread` is the existing choice and works well.

### `scoreLead_delta` (new; mandatory inclusion)

```python
scoreLead_delta(x) = x[1]['rootInfo']['scoreLead'] - x[0]['rootInfo']['scoreLead']
```

Direct, intuitive: the change in `scoreLead` across the move. Under
SIDETOMOVE perspective the raw value alternates sign by mover; the
BSA per-colour segregation handles this for chart purposes.

**Rationale:** A user-friendly counterpoint to `quality_delta`'s
visit-share calibration. `scoreLead_delta` is interpretable in
absolute Go-points terms — "this move cost N points of estimated
final score." Many users prefer points-of-loss over visit-share for
intuitive grasp of mistake size. Pairing it with `quality_delta`
gives the seed two metrics that approach the same underlying
question from orthogonal angles (search-attention vs.
predicted-outcome).

## Part 3 — Candidate metric library (curated, for review and culling)

These are candidates beyond the two mandatory metrics. Each is
proposed with its formula, the axis it measures, and its expected
behaviour. The user should select which to include in the seed and
which to relegate to user-creatable.

The candidates are organised by axis. State-context metrics are
labelled `(A)`, windowed-context `(B)`.

### Axis 1 — Direct loss vs the engine's choice

Useful for "how much score / winrate did the user leave on the
table compared to KataGo's recommendation, evaluated at the pre-move
position."

#### `winrate_loss_topvsuser` (B)

```python
'(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0'
```

Difference between the engine's top-move predicted winrate and the
user's chosen-move predicted winrate, both evaluated at the
pre-move position. A natural counterpart to `scoreLead_delta` that
operates on winrate rather than score-points.

Interpretation: `0` if the user picked the top move. Positive
otherwise. Bounded in `[0, 1]`.

#### `scoreLead_loss_topvsuser` (B)

```python
'(x[0]["moveInfos"][0]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0'
```

Score-points equivalent of the above. Differs from `scoreLead_delta`
in that it compares *user's predicted result vs top's predicted
result* at the pre-move position, rather than the *root-position
delta across the move boundary*. The two are different things:
`scoreLead_delta` is "how the position changed"; this is "how it
could have changed had the user played optimally."

Many users will find this more directly interpretable than
`scoreLead_delta` because it doesn't entangle with the perspective
flip across the move boundary. Worth including alongside or in
place of `scoreLead_delta`, depending on which feels more natural
to the user.

### Axis 2 — Position-context state functions

Useful for state_fns that contextualise *the position*, independent
of what the user did.

#### `complexity` (A)

```python
'safe(_visit_entropy(x) / _uniform_entropy(len(x["moveInfos"])))'
```

Normalised visit-entropy. Maps `[0, 1]`: `0` = single-move position
(search collapsed onto one candidate), `1` = uniform exploration
across all considered moves (high genuine choice). Replaces the
existing seed's bare `visit_entropy` (which is unnormalised and
varies in scale with move-count).

Pedagogically valuable: positions with high `complexity` are
genuinely hard regardless of who's reviewing them. A study session
could prioritise high-complexity positions for the user.

#### `decisiveness` (A) — alias for `spread`

The local `spread` symbol (defined in Part 5's inventory using
`_maxvisits / rootInfo.visits`) doubles as a state_fn and can be
exposed in palettes under the user-facing label "Decisiveness" —
it's the inverse of `complexity`, measuring how much of the
search budget concentrated on the single most-visited move.

No separate symbol definition needed. Use `spread` directly in the
`state_fns` mapping with the label of choice (`'Decisiveness':
'spread'` or similar).

#### `winrate` (A)

```python
'x["rootInfo"]["winrate"]'
```

Existing in the seed. Worth keeping as a standard state function;
shows up in chart panels for "where is the game heading."

#### `score_lead` (A)

```python
'x["rootInfo"]["scoreLead"]'
```

Existing in the seed. Same role.

#### `score_volatility` (A)

```python
'x["rootInfo"]["scoreStdev"]'
```

The engine's predicted standard deviation of final score from this
position. Useful as a "how settled is this game?" indicator. Note
KataGo's documentation flag: this value is biased high in absolute
terms but informative as a *relative* indicator.

#### `nn_uncertainty` (A)

```python
'x["rootInfo"]["rawStWrError"]'
```

Raw NN's predicted short-term winrate error. Higher = the network
itself is less confident in this position before search. A useful
"raw uncertainty" signal that complements search-derived
`complexity`/`decisiveness`.

### Axis 3 — User-vs-engine alignment, beyond `quality_delta`

Different smoothers / different axes for the same underlying
"how much does the user's move match the engine's recommendation."

#### `user_order` (B)

```python
'x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else None'
```

KataGo's ranking of the user's move (0-indexed, 0 = top). Returns
`None` when the user's move was not among the analysed candidates.

A direct integer that's easy to display ("you played KataGo's #4
choice"). Less smooth than `quality_delta` but more interpretable.

#### `policy_loss` (B)

```python
'x[0]["moveInfos"][0]["prior"] - (x[0]["userMoveInfo"]["prior"] if x[0]["userMoveInfo"] else 0)'
```

Difference in raw policy prior between top move and user move at
the pre-move position. Interpretation: how much the *neural network
itself* (pre-search) preferred the top move over the user's. A
useful "intuition gap" signal — large `policy_loss` with small
`scoreLead_loss_topvsuser` indicates "your move was decent but the
NN really wanted something else."

### Axis 4 — Risk-adjusted loss

Combines loss with position volatility for a "how unusual is this
size of mistake given the position's volatility" reading.

#### `risk_adjusted_score_loss` (B)

```python
'safe((x[0]["moveInfos"][0]["scoreLead"] - (x[0]["userMoveInfo"]["scoreLead"] if x[0]["userMoveInfo"] else x[0]["moveInfos"][0]["scoreLead"])) / x[0]["rootInfo"]["scoreStdev"])'
```

`scoreLead_loss_topvsuser` divided by position scoreStdev. A move
that loses 2 points in a position with scoreStdev=20 (volatile) is
very different from one that loses 2 points in a position with
scoreStdev=2 (settled). This metric normalises.

Bounded only loosely (the divisor isn't guaranteed > 1) — `safe()`
guards against NaN if scoreStdev is 0.

Pedagogically valuable for advanced users: identifies moves that are
"unusually bad given how stable the position was" — a sharper
mistake signal than absolute score-loss alone.

## Part 4 — Recommended seed palettes

The proxy supports multiple named palettes; the user can switch
between them via the existing PaletteEditor / palette dropdown. The
seed should ship with two or three palettes representing different
"out-of-the-box" study philosophies. Recommendation:

### Palette A — "Quality" (the visit-share-aligned default)

The closest evolution of the existing seed's intent.

```js
{
  id: 'quality',
  name: 'Quality (Robust-Child Calibrated)',
  delta_fn: 'quality_delta',
  summary_fn: 'min_summary',
  state_fns: {
    'Complexity':    'complexity',
    'Win Probability': 'winrate',
    'Score Advantage': 'score_lead',
  }
}
```

Where the symbols are the recommended versions defined above. This
palette emphasises the user's alignment with robust-child selection,
calibrated by position branching.

### Palette B — "Score" (the points-loss-aligned alternative)

For users who prefer absolute score-points framing.

```js
{
  id: 'score',
  name: 'Score Loss',
  delta_fn: 'scoreLead_loss_topvsuser',
  summary_fn: 'mean_summary',
  state_fns: {
    'Volatility':    'score_volatility',
    'Win Probability': 'winrate',
    'Score Advantage': 'score_lead',
  }
}
```

`scoreLead_loss_topvsuser` (rather than `scoreLead_delta`) is the
recommended delta_fn here because its semantic is cleanly "points
left on the table at the pre-move position," independent of the
SIDETOMOVE perspective flip. `mean_summary` (an arithmetic mean of
the deltas in an interval) is the natural aggregator for an
already-positive-only loss metric.

### Palette C — "Engine Rank" (the most-permissive alternative)

For lighter pedagogical use; rewards the user for being in the top-K
even if not exactly top.

```js
{
  id: 'rank',
  name: 'Engine Rank',
  delta_fn: 'rank_quality',     // see below
  summary_fn: 'mean_summary',
  state_fns: {
    'Complexity':    'complexity',
    'Win Probability': 'winrate',
  }
}
```

Where `rank_quality` is a new symbol:

```python
rank_quality(x) = 1.0 / (1 + (x[0]['userMoveInfo']['order'] if x[0]['userMoveInfo'] else 999))
```

— hyperbolic in the user's order: `1.0` for top move, `0.5` for
second, `0.33` for third, ..., near-zero for unranked.

### Required summary functions

Two summary_fns referenced above:

```python
min_summary(deltas) = float(np.min(deltas))
mean_summary(deltas) = float(np.mean(deltas))
```

The existing seed uses `min_summary` (preserved). `mean_summary` is
new and required for palettes B and C above.

## Part 5 — `analysis_env` seed inventory (for the successor)

The full set of `symbols` to install in
`store.profile.settings.engine.katago.analysis_env.symbols`:

```python
# Universal helpers (small)
safe              # use stdlib's `safe` directly; not redefined locally

# State-context helpers (single packet)
visit_entropy     'safe(entropy([mi["visits"] for mi in x["moveInfos"]]))'
spread            '_maxvisits(x) / x["rootInfo"]["visits"]'
complexity        'safe(_visit_entropy(x) / _uniform_entropy(len(x["moveInfos"])))'
winrate           'x["rootInfo"]["winrate"]'
score_lead        'x["rootInfo"]["scoreLead"]'
score_volatility  'x["rootInfo"]["scoreStdev"]'
nn_uncertainty    'x["rootInfo"]["rawStWrError"]'

# Window-context helpers (windowed pair)
visit_ratio       '_uservisits(x[0]) / _maxvisits(x[0])'
quality_delta     'visit_ratio(x) ** (spread(x[0]) ** alpha)'
scoreLead_delta   'x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"]'
winrate_loss_topvsuser
                  '(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0'
scoreLead_loss_topvsuser
                  '(x[0]["moveInfos"][0]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0'
user_order        'x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999'
policy_loss       'x[0]["moveInfos"][0]["prior"] - (x[0]["userMoveInfo"]["prior"] if x[0]["userMoveInfo"] else 0)'
risk_adjusted_score_loss
                  'safe((x[0]["moveInfos"][0]["scoreLead"] - (x[0]["userMoveInfo"]["scoreLead"] if x[0]["userMoveInfo"] else x[0]["moveInfos"][0]["scoreLead"])) / x[0]["rootInfo"]["scoreStdev"])'
rank_quality      '1.0 / (1 + (x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999))'

# Summary functions
min_summary       'float(np.min(x))'
mean_summary      'float(np.mean(x))'
```

Notes on the symbol set:

- `spread` is **redefined** locally (overriding the stdlib's
  `_spread`). The local version uses `_maxvisits` and is therefore
  heuristic-oblivious; the stdlib's `_spread` is heuristic-aware
  (uses `moveInfos[0]`). Local naming wins in asteval's symtable
  per `RegistryInterpreter`'s compile order. Per-state-fn callers
  use `spread(x)`; per-window-callers (e.g., `quality_delta`) use
  `spread(x[0])`.
- `visit_ratio` similarly avoids the stdlib's `_visit_ratio`; the
  local definition uses `_maxvisits` for heuristic-obliviousness.
- The "loss" metrics (`winrate_loss_topvsuser`,
  `scoreLead_loss_topvsuser`, `policy_loss`) deliberately *do*
  reference `moveInfos[0]` rather than the most-visited move,
  because they measure alignment with **KataGo's actual
  recommendation** — the move it would play, ranked by
  `playSelectionValue`. This is a different axis from
  robust-child alignment; both are useful and the spec keeps
  them distinct.
- Asteval resolves names lazily at call time, so the order of
  definitions in the symbol table doesn't matter — but every
  referenced symbol must be defined or imported by the time
  `quality_delta` is invoked.

### Two distinct axes summarised

| Axis | Symbols | Reference move | Question answered |
|---|---|---|---|
| Robust-child alignment | `visit_ratio`, `quality_delta`, `spread` | most-visited (`_maxvisits`) | "How aligned is the user with the search's most-trusted child?" |
| Engine-recommendation alignment | `*_loss_topvsuser`, `user_order`, `policy_loss`, `rank_quality` | `moveInfos[0]` (`playSelectionValue`-ranked) | "How aligned is the user with what KataGo would have played?" |

The two axes correlate strongly but measure different things;
shipping both gives users a choice about which dimension of "user
vs engine" they want to grade against.

The `parameters` block stays at:

```python
parameters: { alpha: 0.25 }
```

The default-active palette is `'quality'` (Palette A).

## Part 6 — Migration concerns

### Schema migration (5 → 6)

Required: a migration that updates pre-existing
`profile.settings.engine.katago.analysis_env` blocks to the new
shape. Append-only per `migrations.ts`'s discipline.

Concerns:

1. **User customisations.** A user who has manually edited their
   palette (added their own symbols, replaced the default palette
   with their own composition) must not have those edits silently
   overwritten. The migration should:
   - Add new stdlib-aligned symbols (`complexity`, `score_volatility`,
     etc.) only if not already present.
   - For symbols whose definition is changing (`visit_ratio`,
     `quality_delta`), preserve the user's version if it differs
     from the prior broken default. **Detection rule:** if the
     existing definition exactly matches the broken seed, replace;
     otherwise leave alone.
   - Similarly for the `palettes` array: if a `'default'` palette
     exists with the broken composition, replace; if it has been
     customised (delta_fn, state_fns, or summary_fn differ), leave
     alone and add the new palettes alongside.
   - Add new palettes (`'quality'`, `'score'`, `'rank'`) only if not
     already present; never overwrite existing palette IDs.

2. **`activePaletteId`.** If the current active is `'default'` and
   the migration is replacing the broken default with the new
   `'quality'` palette, update `activePaletteId` accordingly.
   Otherwise leave alone.

3. **`alpha` parameter.** Preserve user's value if customised; set
   to 0.25 if missing.

The migration's discipline matches the de-branding migrations
(1→2, 2→3, etc.): structuredClone, idempotent, defensive against
partial state.

### Wire-protocol concerns

None. The metric definitions live entirely in the
`analysis_config.symbols` and `bindings` payload sent to the proxy
on each query. No change to the proxy itself; the spec is
implementable purely frontend-side.

### Compatibility with existing reviewed cards

`gradingParameter.data.analysis_config` on existing cards may carry
the old broken seed. Cards reviewed under the old seed will
continue to use it (their gradingParameter is preserved on the
card record). New reviews on those cards will use the user's
*current* palette (resolved via `compileAnalysisConfig`), so the
fix is forward-applying.

## Part 7 — Verification checklist for the successor

1. **Symbol-by-symbol asteval compile check.** Each new symbol
   must compile without error in `RegistryInterpreter`. The
   simplest check: write a tiny Python script that instantiates
   `RegistryInterpreter` with the new config and verifies all
   `bindings` resolve to non-fallback functions. Recommend
   committing this as a backend-side smoke test.

2. **Live engine test.** With a fresh profile (cleared workspace
   blob), connect to KataGo + proxy, request analysis on a real
   game position, and verify:
   - No "FALLBACK: no binding for key=..." warnings in the proxy
     log.
   - `extra.state[turn]` is populated with the state_fns labels.
   - `extra.black.deltas` and `extra.white.deltas` are populated.
   - `extra.black.triangular` and `extra.white.triangular` are
     populated as the search progresses.

3. **Migration round-trip.** Persist a v5 blob with the broken
   default; reload; confirm the migration corrects the symbol
   definitions; confirm the user's customised symbols (if any) are
   preserved.

4. **Frontend chart rendering.** With the new palettes, all chart
   panels in `AnalysisDashboard` and `BoardTab` should render
   without blank cells or `null` values. The `score_volatility`
   and `nn_uncertainty` state_fns are new and should appear if
   the user enables them in their palette.

5. **Card grading.** Spaced-repetition card grading uses
   `delta_fn`'s output via the `gradingParameter` mechanism. After
   the migration, a fresh card review under the new seed must
   produce a sensible numeric score (not NaN, not 0 due to
   FALLBACK) for `quality_delta` and the alternatives.

## Part 8 — Out of scope (explicitly)

### Excluded by design

- **Human-policy metrics and a human-style palette.** The
  `humanPrior` field is available on each moveInfo when KataGo is
  loaded with `-human-model`, and `Analysis_Engine.md` documents
  several interesting metrics derivable from it. They are
  deliberately *not* part of this spec because LengYue is an
  educational tool aimed at strongest play. The teaching signal
  is "the engine's robust child differs from your choice — here's
  by how much," not "humans of your rank also disagreed with the
  engine here." Including `humanPrior`-based metrics would dilute
  the pedagogical posture.

  Users who want to flatten the visit distribution to surface
  reasonable alternatives (rather than collapse onto a single
  recommendation) have orthogonal levers at the **query** layer:
  `wideRootNoise` and `rootPolicyTemperature` in KataGo's
  `overrideSettings`. These are query-time configuration, not
  symbol-DSL concerns; the metric design here assumes the user
  has tuned those externally if they want a flatter analysis.

### Deferred

- **Removing `pchipN` and `ALPHA_KNOTS` from `helper.ts`.** They
  are currently unreferenced in the gradient pipeline but are
  retained for use in the qEUBO calibration phase of the project;
  not in scope for the metric-design work.

- **Per-card palette overrides at mint time.** The
  `MintCardModal` already exposes `defaultPaletteId`; no metric
  work is needed there.

- **Custom `state_fns` colour schemes.** The chart panels render
  state_fns through their own colour pipeline; the metric work
  here doesn't change colours, only what's plotted.

- **qEUBO calibration over `alpha` and other parameters.** Out of
  scope for this metric-design spec; it's the next phase, and is
  blocked on its own clean-room treatment per the `proxy/NOTICE`
  attribution discipline (the qEUBO source carries MIT
  obligations).

- **CWT-based metrics.** The BSA pipeline supports `cwt_fns` (full-
  delta-stream reductions) but no symbol DSL surface exists for
  them yet. Adding CWT metrics requires extending the
  RegistryInterpreter's binding schema; defer.

- **Move-level ownership integration into metrics.** The proxy
  doesn't currently surface per-move ownership through the symbol
  DSL; the ownership overlay (PR #17) reads it directly from the
  packet. A metric that consumed ownership (e.g., "territory
  shifted by N points after this move") would require additional
  pipeline work; defer.

- **Sign-correction for SIDETOMOVE perspective.** Could be added
  as a `from_movers_perspective(x)` helper that flips sign on
  alternate turns. Not strictly necessary because BSA's per-colour
  segregation handles this for chart purposes, but would clean up
  some metric semantics. Defer.

## Documentation follow-up

When this spec is implemented:

- Worklog entry recording the implementation.
- TODO row under Frontend Completed.
- `docs/notes/frontend-backlog.md` — no entry to update; this is
  direct follow-on from in-session diagnosis, not a backlog item.
- No ADR amendment required.

## Summary for review

The spec proposes:

- A trivial fix (`uservisits` → `_uservisits`) bracketed as Part 0,
  shippable independent of everything else.
- A semantic correction to `visit_ratio`: the denominator becomes
  `_maxvisits(x[0])`, the most-visited move's visits — making the
  metric heuristic-oblivious (independent of KataGo's
  `playSelectionValue`-driven `order` ranking) and aligning it
  with the robust-child literature.
- Parallel correction to `spread` (and therefore `quality_delta`'s
  smoother): use `_maxvisits` rather than `moveInfos[0].visits`.
- Two mandatory metrics: `quality_delta` (preserved with the new
  heuristic-oblivious denominator) and `scoreLead_delta` (new).
- A library of seven candidate metrics across four axes for review
  and culling, partitioned into two semantic dimensions:
  robust-child alignment (visit-share) vs engine-recommendation
  alignment (order-based).
- Three recommended seed palettes (`quality`, `score`, `rank`)
  representing different study philosophies.
- A migration (5 → 6) that preserves user customisations while
  installing the new seed.

The user's review should focus on:

1. Whether the candidate library should be culled before
   implementation, or all installed and made user-toggleable in the
   PaletteEditor.
2. Which palette ships as `activePaletteId`'s default — `quality`
   is the natural choice given user preference, but `score` is more
   universally interpretable.
3. Any metric the spec missed that the user wants explicitly
   considered.

— end spec —
