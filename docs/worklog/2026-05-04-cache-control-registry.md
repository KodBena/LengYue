# Proxy cache-control flags surface in the registry editor

- **Status:** Shipped on `frontend/cache-control-registry`
  (stacked atop `frontend/mint-card-gamma-control`'s γ commit),
  2026-05-04. Build green. Closes the second of the two
  missing-control items named in the γ-control worklog's forward
  note (the first — γ at mint time — shipped in `94d1ea2`).
- **Genre:** Feature — surfaces all three existing proxy
  wire-protocol replay-cache flags (`cache`, `lookup_cache`,
  `replay_final_only`) as user-editable settings. No backend /
  wire change.
- **Date:** 2026-05-04.

## Context

`KataGoAnalysisQuery` (`engine/katago/types.ts`) declares three
proxy control flags — `cache`, `lookup_cache`, `replay_final_only`
— that govern the query's interaction with the proxy's replay
cache (pubsub_hub.py's "Cache semantics"). Two of them
(`cache` and `lookup_cache`) were hard-coded in
`analysis-service.ts::analyzeRange` (literal `cache: false,
lookup_cache: false`) and absent from `analyzeActiveNode` (which
the proxy reads as wire-default `false` — same effective
behaviour). The third, `replay_final_only`, was never set
anywhere in the frontend; absent → wire-default `false` →
full-stream replay during any cache hit.

The user surfaced this gap when shipping γ ("γ at mint time and
middleware cache control are missing controls"); the γ-control
worklog noted cache-control as a deferred follow-up. The user
also clarified at PR-time that `replay_final_only` should be
surfaced alongside the other two — the original draft had
deferred it as sub-flag-shaped, but the surfacing posture is
"give the user the knob, document its meaning, let them decide
when to use it" rather than "preempt-decide which knobs are
worth surfacing."

The canonical use cases in the wire-type docstring justify
making all three user-editable:

- `cache: true` for SR review sessions where the same position
  may be analysed on each visit;
- `lookup_cache: true` (paired with `cache: true` upstream) for
  qEUBO calibration sweeps, where the same engine query gets
  replayed many times under different `analysis_config`
  payloads;
- `replay_final_only: true` to suppress mid-search packets
  during a cache replay — useful when the caller only wants
  the canonical settled answer (e.g. a one-shot batch analysis
  that doesn't render an anytime-stream).

All three default `false` because most live navigation
shouldn't pollute the cache with positions the user is unlikely
to revisit, and observing the full stream is the correct default
for the live UI — the same defaults the wire-type docstring
names. `replay_final_only`'s default is benign in another sense
too: the flag has no effect when not replaying (`lookup_cache:
false` or cache miss), so a user who toggles it without also
enabling `lookup_cache` sees no behaviour change.

## What changed

### `frontend/src/types.ts`

`AppSettings.engine.katago` gains `cache: boolean`,
`lookup_cache: boolean`, and `replay_final_only: boolean`,
sitting alongside `url` and `analysis_env`. JSDoc names the
wire-protocol projection (verbatim to `KataGoAnalysisQuery`'s
three proxy-control fields), the snake-case spelling rationale
(matches the wire vocabulary, same convention `analysis_env`
follows), the canonical use cases (SR re-visits, qEUBO
calibration, final-only replay), the default rationale (all
`false` preserves pre-surfacing behaviour), and the read site
(`services/analysis-service.ts`). `replay_final_only`'s
"only-meaningful-during-replay" semantics are noted in the
JSDoc so a future user toggling it without `lookup_cache: true`
isn't surprised when nothing changes.

The flags pass through the service as `cache:
store.profile.settings.engine.katago.cache` (and similarly for
the other two — no rename, no projection); a camel-case domain
alias would have introduced an indirection without buying
anything — the user is reaching for proxy wire flags here.

### `frontend/src/store/defaults.ts`

`defaultSettings.engine.katago.cache = false`,
`lookup_cache = false`, `replay_final_only = false`. Comment
names the pre-surfacing source for each: literal `false`s in
`analyzeRange` for the first two, absent fields everywhere for
the third (proxy reads absent boolean fields as `false` per its
wire-default).

### `frontend/src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumped 13 → 14. New migration appends
`cache: false, lookup_cache: false, replay_final_only: false`
to `profile.settings.engine.katago` when each field is missing
or non-boolean. Idempotent — pre-existing boolean values are
preserved per-field. The migration's docstring names the
pre-surfacing behaviour the default `false` preserves and
points at the wire-type for authoritative semantics.

Strictly speaking, `deepMerge` in `updateFromRemote` would
backfill these fields via the default profile shape, so a v13
blob would render correctly even without the migration. The
migration ships anyway because the project's discipline is
"bump and migrate when adding fields" (precedent: γ migration
12 → 13, PvAnimation migration 9 → 10, both shipping with the
same deepMerge fallback property). Bump-and-migrate keeps the
schema-version marker honest about the data shape.

### `frontend/src/services/analysis-service.ts`

Both `analyzeRange` and `analyzeActiveNode` construct a local
`cacheFlags` object reading all three flags from settings, then
spread it into the query (`...cacheFlags`):

- `analyzeRange`: replaces the literal `cache: false,
  lookup_cache: false` lines.
- `analyzeActiveNode`: adds `...cacheFlags` (previously absent
  → wire-default `false` → effective behaviour preserved for the
  default profile, but now respects the user's setting).

The fresh-read-per-call pattern is intentional: the
`restartCallbacks` thunk re-enters `analyzeRange` /
`analyzeActiveNode`, so a registry-edit-then-restart picks up
the new value immediately. The brief inline comment at the
`analyzeRange` site names the schema-version where these were
surfaced (v14) so a future contributor following the field
back to its source has an anchor.

## Why no backend dispatch

The wire shape is unchanged — `cache`, `lookup_cache`, and
`replay_final_only` are proxy-recognised fields on
`KataGoAnalysisQuery` that have been in the protocol since
before the v1.0.0 cut (the keep-alive middleware dispatch
already discusses the cache flags; `replay_final_only` was
documented in the same wire-type block at the same time). The
frontend was hard-coding two of them and leaving the third
absent on a wire that already accepted them; this change just
lets the user pick the values. No schema renegotiation, no new
protocol surface, no proxy-side work implied.

The qEUBO calibration loop benefits when `cache: true` is on
during the per-card analyse (so the first sweep populates the
cache) and `lookup_cache: true` is on during subsequent
replays. The composable could plausibly also want
`replay_final_only: true` during the replay phase to suppress
the anytime-optimization stream and just settle on the final
answer. All three are now toggleable; whether the qEUBO
composable should temporarily flip them on during a calibration
session (rather than leaving the user to pre-flip in the
registry editor) is a separate scope question — not on the
critical path for this PR.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual: open the Settings tab → registry editor → engine →
  katago. Three new checkboxes appear ("cache", "lookup_cache",
  "replay_final_only"), all unchecked. Toggle one; the next
  analyse-range or analyse-active call sends the new value.
- Migration sanity: a v13 blob with no
  `engine.katago.{cache,lookup_cache,replay_final_only}`
  hydrates cleanly; the migration sets all three to `false`;
  the registry editor opens with all three unchecked. A v13
  blob with `cache: true` (hand-edited) preserves the user's
  value while still backfilling the absent siblings.
- Non-regression: legacy default profiles continue to issue the
  same wire (`cache: false, lookup_cache: false,
  replay_final_only: false`) as before; user-visible behaviour
  unchanged for unconfigured installs. (`replay_final_only` was
  always wire-absent → wire-default `false`; now it's
  wire-explicit `false` for the default profile, same effect.)
- Non-regression: the γ control shipped in `94d1ea2` continues
  to work — the changes here are orthogonal (different settings
  subtree, different call-site read pattern, different schema
  version).

## Forward notes

The qEUBO composable could plausibly want a temporary
cache-flags override during a calibration sweep (independent of
whatever the user has configured globally). That's a deferred
question — `analyze*` already accept a `configOverride` for
`analysis_config`, so a parallel `cacheOverride` parameter
would be the obvious extension if/when the use case
crystallises. Not worth speculating on the shape now.

The broader "tighten the inner gradingParameter shape" arc
(`handoff-current.md`'s "Rough edges" section) is unchanged by
this PR — the cache flags live on `AppSettings.engine.katago`,
not on `gradingParameter.data`, so they don't add to the
localized-cast count there.
