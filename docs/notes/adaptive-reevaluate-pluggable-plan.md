# Pluggable Adaptive Re-evaluation — Design Note

**Status:** `design-note: planned`. Pre-implementation planning
record for widening the proxy's `adaptive_reevaluate` middleware
along two axes (pluggable selection metric, per-color displacement
window). Cross-boundary: proxy first, frontend authoring surface
follows. The dispatch to the proxy team
(`docs/dispatch/frontend-to-proxy-adaptive-reevaluate-pluggable.md`,
not yet authored) is the next artifact in this arc; this note is
the umbrella-side roadmap the dispatch will draw from.

**Genre.** Cross-boundary widening plan. Names the design space,
proposes a shape, surfaces seams the project author may want to
weigh in on before either side commits code. Not a spec — the
open questions in §"Open questions" are genuinely open.

**Date:** 2026-05-18.

**Scope.** `proxy/` for the middleware and wire-shape changes;
`frontend/` for the eventual authoring surface. Backend
unaffected — adaptive_reevaluate is a proxy-side analysis-time
concern, not a persistence concern.

**Author audience.** The project author, reviewing whether the
shape proposed here is the right widening before a dispatch goes
to the proxy team.

---

## What this document is

A planning record for lifting `adaptive_reevaluate` from a
proof-of-concept selection-by-implicit-metric over a symmetric
window into a configurable selection-by-authored-expression over
a contextually-correct window. The widening is structural — the
middleware's session-state shape, GPU-budget posture, and Hub
coalescing semantics stay as they are.

## Motivation

Three honest observations about the current shape:

### 1. The "worst" metric is implicit and hard-coded

`AdaptiveReevaluateMiddleware._find_worst_turns` selects by an
internal notion of move quality computed from KataGo's emitted
fields. There is no user-controllable expression of "what makes a
turn worth re-evaluating" — the metric is whatever the
middleware's author committed to at PoC time. By contrast,
`delta_analysis` (the palette-driven enricher) lets the user
author arbitrary `state_fn` / `delta_fn` / `summary_fn`
expressions over the same packet contents. The asymmetry is real:
two middleware-shaped consumers of the same packet structure
admit very different authoring discipline.

### 2. The PoC population is narrow

The middleware was shaped around a high-dan phenomenon: strong
players sometimes play moves that look bad on first sight, and
KataGo's MCTS distribution converges toward agreement (even if
not full agreement) on deeper search. For weaker players, "bad-
looking" moves are usually bad, and deeper search confirms that
verdict — adaptive re-evaluation surfaces little new signal.

Lifting the metric out of the implementation widens the
population dramatically: a beginner working tactical positions
benefits from re-evaluation triggered by policy entropy or by
policy-vs-played divergence, even if the high-dan vindication
phenomenon does not apply to their games.

### 3. The symmetric window mixes colors and inflates cost

The current window is symmetric ±N around a candidate move M
(default N=3, so {M-3, M-2, M-1, M, M+1, M+2, M+3}). For a Black
move at M:

- M-1, M+1, M-3, M+3 are White moves (responses or unrelated).
- M-2, M+2 are Black's own prior and next on the same trajectory.
- M-3, M+3 are increasingly unrelated to M's choice rationale.

A per-color displacement window over 2 elements (M and M-2 for
the same-color trajectory, optionally including M+1 for the
opponent's response when the metric calls for it) is both
contextually sharper — it asks "what was Black thinking moving
from M-2 to M?" — and cheaper.

## The current shape (inventory)

For grounding. From the proxy's middleware:

- `AdaptiveReevaluateMiddleware` (`middleware/adaptive_reevaluate.py`),
  per-session, stateful, async.
- Constructor parameters: `worst_quantile` (default 0.25),
  `extra_visits` (default 800), `window_size` (default 3),
  `max_inflight` (operational backpressure).
- Per-query metadata channel (from the selector dispatch's
  capability-negotiation arc): `worst_quantile` and
  `extra_visits` overridable per query via
  `capabilities.adaptive_reevaluate.{worst_quantile, extra_visits}`.
- Behavior: on first authoritative response, identify the
  worst-quantile turns by the implicit metric; for each, submit
  a deeper-analysis sub-query at `original_maxVisits +
  extra_visits` over a window of `window_size` consecutive
  turns around the worst one.
- Cache-continuation: the increment-not-absolute `extra_visits`
  semantic exists so KataGo's NN cache continues the search
  from where the original left off; preserved.

The session-state shape (`_expected`, `_buffered`,
`_orig_queries`, per-orig_id slots) is independent of selection
metric and window — it stays as-is.

## The proposal — three composable widenings

### Widening 1: Pluggable selection metric

The selection step accepts a user-authored expression in the same
DSL the palette uses for `state_fn` / `delta_fn` / `summary_fn`.
The expression maps a per-turn view of the packet to a scalar;
the selection step sorts turns by that scalar and selects the
top-K (or quantile, preserving the existing semantic).

The metric expression sees the same packet structure the palette
sees. Crucially, **the palette's state_fns run before adaptive's
selection runs**, so the metric expression has access to
`extra.state[turn][...]` — every metric the palette has already
computed is available without recomputation. Adaptive composes
on top of palette enrichment rather than running in parallel to
it.

Worked examples of metrics the user might author:

- **Policy entropy.** `H(policy) = -Σ p_i log p_i` over KataGo's
  policy head. Cheap (no extra MCTS). High entropy = KataGo is
  uncertain — a candidate for "worth re-evaluating to see if more
  visits collapse the entropy or confirm it."
- **Policy-vs-played divergence.** `1 - policy[played_move]`. Also
  cheap. Surfaces moves played far from KataGo's prior — useful
  for both the high-dan vindication case (sometimes those moves
  are good) and the beginner-mistake case (often those moves are
  bad).
- **Score-lead absolute change.** `|scoreLead[turn] -
  scoreLead[turn-1]|`. Surfaces tactical inflection points
  regardless of player strength.
- **Ownership flux.** `Σ |ownership[turn][i] -
  ownership[turn-1][i]|`. Cross-turn; needs the palette DSL to
  grow windowing if expressed there, or adaptive's selector to
  accept its own multi-turn shape (see §"Per-turn vs cross-turn"
  below).

The dispatch arc to the proxy team is where the
exact-expression-language semantics get pinned down (the palette
DSL's `extra.state` access pattern is the natural starting
shape).

### Widening 2: Per-color displacement window

The window shape becomes:

```
window = {
  upstream_same_color: int,   # how many same-color prior turns
  upstream_opposite_color: int,
  downstream_same_color: int,
  downstream_opposite_color: int,
}
```

Defaults that subsume the user's "2-element per-color" suggestion:
`upstream_same_color=1`, `downstream_opposite_color=1`, others 0
— so for a Black move at M the window is {M-2, M, M+1}. Three
turns total, contextually clean: M-2 is Black's previous move on
the same trajectory, M is the candidate, M+1 is White's
immediate response (sometimes load-bearing for "did the response
confirm or refute M's intent"; can be turned off).

The current symmetric ±3 (7-turn window) becomes
`{upstream_same: 1, upstream_opposite: 2, downstream_same: 2,
downstream_opposite: 2}` — preserved by explicit configuration if
a user wants the old shape. The default changes to the cheaper
contextually-correct shape; old behavior is opt-in.

### Widening 3: (Implied) selection over arbitrary metric

Selection is "top K turns by `metric_fn(turn)`" or "top quantile
by metric, with K = ceil(N_turns * quantile)" — preserving the
existing `worst_quantile` semantic but parameterised on the
user's metric. K-vs-quantile is presented in §"Open questions"
since it's a small UX call.

## Wire shape

The seam to choose. The proxy's existing precedent (per the
selector dispatch's status reply, §"A factoring worth naming"):
small scalar middleware knobs live in
`capabilities.adaptive_reevaluate.{...}`; substantial DSL
expressions ride on a separate field analogous to
`analysis_config` for the palette.

Three options, ordered by amount of wire surface added:

### Option A — Stuff the metric expression into capability metadata

```json
"capabilities": {
  "adaptive_reevaluate": {
    "worst_quantile": 0.25,
    "extra_visits": 800,
    "metric": "<expression-source-here>",
    "window": { "upstream_same_color": 1, "downstream_opposite_color": 1 }
  }
}
```

Compact. No new top-level wire field. Asymmetric with the
palette though — expressions of comparable shape and size live
inside capability metadata here while the palette's expressions
ride on `analysis_config`. The asymmetry would be load-bearing
if a future capability also grew expression-shaped configuration
— each would either repeat the pattern or have to invent a
sibling.

### Option B — New top-level `adaptive_config` field

```json
{
  "id": "...",
  "moves": [...],
  "analysis_config": { "palette": {...} },
  "adaptive_config": { "metric": "...", "window": {...} },
  "capabilities": { "adaptive_reevaluate": { "worst_quantile": 0.25 } }
}
```

Mirrors `analysis_config`. Expression and window live in the
new field; only scalar knobs stay in capability metadata. Adds
wire surface, but the pattern is the one the palette set —
"expressions ride on dedicated fields; capability metadata is
scalar."

### Option C — Embed the adaptive metric in the existing palette

The palette already declares named `state_fn`s. The capability
metadata names one of them:

```json
"analysis_config": {
  "palette": {
    "state_fns": {
      "Win Probability": "...",
      "Adaptive Score": "<expression>"
    }
  }
},
"capabilities": {
  "adaptive_reevaluate": {
    "metric_ref": "Adaptive Score",
    "worst_quantile": 0.25
  }
}
```

The metric is a state_fn like any other; adaptive references it
by name. No new wire field; no new authoring surface
(palette-editor extension covers it). The palette's `state_fn`
runs once per packet, both for chart display and for adaptive's
selection step — single-evaluation efficiency.

The cost: it tangles two concerns (display palette and adaptive
selector) on one substrate. A user wanting to author an adaptive
metric they don't want to display would either pollute their
palette with a hidden entry or need a "non-display state_fn" tag.

**Recommendation seam.** Option C is the most architecturally
coherent if the palette substrate is the canonical home for
"named expressions over packet data." Option B is the most
honest about adaptive-config being its own thing. Option A is the
cheapest wire-wise but the most asymmetric. The dispatch arc to
the proxy team is the right place to settle this — they have
the canonical view of which seam composes best with the
existing palette evaluator.

## Per-turn vs cross-turn metrics

A tension in the worked examples. Policy entropy and
policy-vs-played divergence are per-turn — the expression sees
one turn at a time and returns a scalar. Score-lead change and
ownership flux are cross-turn — they need access to adjacent
turns' packet contents.

Two paths:

- **Ship per-turn metrics first; defer cross-turn.** The palette's
  `state_fn` is already per-turn, so the DSL doesn't have to
  grow. Cross-turn metrics become a v2 once per-turn lands and
  is used.
- **Design cross-turn now.** Grow the DSL's surface area to
  include a per-turn-trajectory view (or a small windowing
  primitive). Bigger upfront cost; more flexible at landing.

Lean toward the first path. Per-turn metrics cover the
most-asked-for shapes (entropy, divergence) and ship with a
smaller blast radius; cross-turn lands later if demand surfaces.
This is the "let the chips fall where they may" posture applied
to scope: ship what's settled, name what isn't, don't preempt
the v2.

## Backwards compatibility / defaults

When a query carries no `metric` (or `metric_ref`) and no
`window`:

- The metric defaults to today's implicit selection (the
  middleware's existing computation, preserved as a built-in
  named metric — call it `"default"` for now).
- The window defaults to today's symmetric ±N.

In other words, **a query that opts in to `adaptive_reevaluate`
without supplying the new fields gets today's behavior bit-for-
bit.** New users opt into the new shape by supplying the new
fields. The implicit-metric path stays available as long as the
PoC's existing user base benefits from it; deprecation (if any)
happens in a separate arc.

The defaults can shift after the new shape lands and the
implicit-metric path turns out to be subsumed by user-authored
metrics. That's an ADR-0005-Rule-8 revision when it happens, not
a v1 decision.

## Cross-boundary sequencing

The arc splits cleanly into three phases:

**Phase 1 — Proxy.** Middleware accepts the new metric and
window shape via the chosen wire option. Today's behavior
preserved as the no-new-fields default. New regression tests for
the per-color displacement window and for at least one
user-authored metric (policy entropy as the canonical example).
Suggested tag: a minor proxy bump.

**Phase 2 — Frontend authoring surface.** Extend the palette
editor (or add a sibling editor, depending on the wire choice)
with an "adaptive metric" surface. Surface the per-color
displacement window in the registry editor or a new toolbar
control. The SPA's analyze ACL composes the new fields when the
user has authored them. Umbrella PR.

**Phase 3 (optional) — Cross-turn metric DSL.** Grow the
palette DSL to include cross-turn views. Only if Phase 2's
per-turn shape turns out insufficient in practice; not preempted.

Phase 1 ships proxy-side first (its own arc per
`proxy/CLAUDE.md`'s submodule-release discipline). Phase 2 ships
as an umbrella PR after the proxy bump lands. Phase 3 is
genuinely deferrable.

## Open questions

For the project author. The note proposes a direction on each
but does not pre-commit:

1. **Wire shape: Option A, B, or C?** The recommendation lean is
   C (single substrate, palette as canonical home for named
   expressions) with the polluting-the-palette caveat. The
   proxy team's view is load-bearing here — they have the
   canonical read on which seam composes with the existing
   evaluator. The dispatch arc to the proxy is the right venue.
2. **Per-turn first vs cross-turn now?** Lean per-turn first; the
   v2 path is honest and doesn't preempt.
3. **Window default — include `M+1` (opponent's response)?** Lean
   yes by default; the response-confirmation case is common
   enough that the cost is justified. User can opt out.
4. **Selection shape — quantile (today's semantic) or top-K?**
   Lean both — quantile as the default (preserves today's
   posture), top-K as an alternative when the user knows how
   many turns they want to inspect regardless of move count.
5. **Naming.** "Pluggable adaptive metric" / "configurable
   adaptive selector" / "adaptive trigger expression" — the
   user-facing handle this work ships under. The dispatch arc
   to the proxy will pick the wire-facing name; the SPA's
   editor label can differ if `metric_ref` (or whatever) ends
   up feeling jargon-heavy.
6. **Frontend authoring surface placement.** Extend
   PaletteEditor with an "Adaptive Metric" tab? A new sibling
   editor? A knob-registry entry? The right answer depends on
   the wire shape chosen — Option C lives naturally in
   PaletteEditor; Options A/B might warrant a sibling.

## What this does NOT cover

To bound the scope honestly:

- **Not redesigning the middleware's session-state machinery.**
  Per-orig_id slots, the `_expected` / `_buffered` /
  `_orig_queries` shape stays as it is. The widening is at the
  selection-input layer only.
- **Not changing what the deeper-analysis sub-query does once
  selected.** `extra_visits + KataGo cache continuation`
  remains the mechanism. The increment-not-absolute semantic is
  preserved for the cache-continuation reason the selector
  dispatch's status reply named.
- **Not exposing `window_size` (the old scalar) in capability
  metadata.** The richer window shape subsumes it; the old
  scalar is honored as a backwards-compat default only.
- **Not generalising other middlewares.** The proxy's other
  middlewares (keep-alive, etc.) are unrelated and stay as
  they are.
- **Not committing to a deprecation of the implicit-metric
  path.** It stays as the no-new-fields default. Whether it
  eventually retires is a future-arc question.

## Composition with existing tenets

- **ADR-0002 (fail loudly).** A metric expression that fails to
  parse or evaluate surfaces an error structured the same way
  the palette's parse / eval errors do today. Silent fallback
  to the implicit metric would be the failure mode the tenet
  forbids; the metric either runs or the proxy refuses the
  query.
- **ADR-0003 (frontend bands).** The metric authoring surface is
  Band 2 (game-tree-coupled — operates on KataGo packets, which
  are KataGo-specific but generalisable to other engines under
  the same family). The proxy-side selector is Band 3 (KataGo-
  bound by construction, like the rest of the proxy). No new
  band placements required.
- **ADR-0005 Rule 8 (sibling revisions).** Status transitions
  from `planned` to `implemented` when the proxy arc + frontend
  arc both ship. Status transitions to `revised` (via sibling
  note) if the proxy team's review surfaces a fundamentally
  different shape than this note proposes.
- **ADR-0007 (file size).** The middleware file likely grows
  modestly; if it crosses the SFC-or-TS budget the refactor
  triggers the same incremental split posture as any other
  growing file.

## Maintenance contract

- **Retirement trigger.** Phase 1 (proxy) ships AND Phase 2
  (frontend) ships with at least a default user-authored metric
  exercised end-to-end → status transitions to
  `design-note: implemented` with a worklog citation.
- **Revision trigger.** Proxy team's review of the dispatch
  arc identifies a fundamentally different shape (e.g., the
  palette DSL turns out to be the wrong evaluator for adaptive
  selection; a separate evaluator is needed) → status
  transitions to `design-note: revised` via a sibling note;
  this body is preserved as the planning-time record.
- **Open-ended.** §"Open questions" entries that the project
  author addresses become resolved decisions in this body via
  an Amendment block dated to the resolution, mirroring the
  knob-registry-plan's amendment shape.

## Related

- **`docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`**
  and its status reply
  (`docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`)
  — the capability-negotiation arc that this widening lives
  inside. The status reply's §"A factoring worth naming"
  paragraph is the source of the "scalar in capability
  metadata, expression on dedicated field" precedent.
- **`docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`**
  — the most recent investigation that touched adaptive's
  enrichment path. The diagnosis arc in §3 is relevant context
  for what "the deeper-analysis query's response shape" means
  in practice; the widening proposed here does not change that
  shape but composes with it.
- **`proxy/middleware/adaptive_reevaluate.py`** — the canonical
  source. The dispatch arc names specific line ranges; this
  note stays at the design level.
- **Palette substrate** — `frontend/src/composables/usePalette.ts`
  (or successor) is where palette state_fns are authored on the
  SPA side. The Option C wire shape's authoring surface
  extends this.
