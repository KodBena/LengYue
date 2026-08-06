# Fix — KataGo model-select hover flicker (Defect 1)

Fix dispatch for `docs/dispatch-reports/ui-defects-investigation.md`'s
Defect 1 (spec: SECTION "Defect 1" in that report). Docs read in full before
this work: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, and the whole
investigation report (including its Environment-correction section).

## Diff summary

Single production file touched as scoped:
`frontend/src/components/chrome/ToolbarEngineMetrics.vue`. One
documentation-accuracy follow-up in `frontend/src/lib/timing.ts` (see
below).

- `watchdogClasses` (was lines ~63-72) now reads `displayed.value.pingPendingSince`
  / `displayed.value.latency` — the throttled snapshot — instead of
  `metrics.value.pingPendingSince` / `metrics.value.latencyMs` directly.
  The computed's declaration order was left where it was (it closes over
  `displayed`, a `const` declared later in the same `<script setup>` scope;
  the closure only evaluates at first template access, by which point
  `<script setup>` has fully run, so there is no TDZ hazard — verified by
  `vue-tsc -b` passing).
- `MetricsDisplay` gained a `pingPendingSince: number | null` field;
  `liveMetrics` now projects it alongside the existing four scalars, so it
  flows through the same `useThrottledSnapshot(liveMetrics,
  TOOLBAR_METRICS_REDRAW_THROTTLE_MS)` call the rest of the strip already
  used. No new throttle instance.
- Comments updated in both files to state the mechanism and the
  minimal-touch alternative rejected (a second, faster throttle) and why.

## Throttle choice + property preserved

The report flagged that the un-throttled watchdog read existed
specifically to keep "a latency spike flips promptly" true (component's
own comment, was line 183), and sanctioned either folding the watchdog
fields into the existing throttled projection or adding a second, faster
throttle for them alone.

**Choice: fold into the existing 250ms (`TOOLBAR_METRICS_REDRAW_THROTTLE_MS`
= `SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS`) throttle, no second timer.**
Rejected the second-throttle option because the watchdog's own cadences —
the animated ping-tandem duration (`watchdogAnimationMs`, default 500ms)
and the un-animated sample poll (~5000ms) — are both an order of magnitude
slower than 250ms. A worst-case 250ms delay before the dot's class updates
is imperceptible against either cadence, so "flips promptly" still holds
in practice, and a single shared throttle is simpler to reason about than
two independently-scheduled timers on the same component. This is stated
explicitly in the code comment (`ToolbarEngineMetrics.vue`, throttled-
snapshot section) so a future reader who needs sub-250ms watchdog
responsiveness knows where the deliberate line was drawn, rather than
rediscovering it.

Also updated a now-stale comment in `frontend/src/lib/timing.ts` (the
`TOOLBAR_METRICS_REDRAW_THROTTLE_MS` doc comment), which asserted "the
watchdog dot is intentionally NOT throttled" — that assertion described
the exact bug this fix removes, so leaving it unedited would ship a false
statement about the code it documents (ADR-0002 applied to comments).
One-line-scope edit; flagging the second file here rather than treating
"single file expected" as license to leave a comment actively describing
removed behavior.

## Test status — honest, UNEXERCISED for the unit-testable-seam leg

Considered extracting `watchdogClasses`'s branch logic (animated
ping-tandem vs threshold-sample mode) as a pure function to unit-test, per
the task's suggestion. Concluded this doesn't fit the codebase's own
conventions for this task and did NOT ship it — UNEXERCISED, not a
decorative test:

- The property actually being fixed is a **render-coupling** property
  (does a per-tick metrics mutation re-run this component's render), not a
  branch-logic property. A pure-function extraction of the classification
  arithmetic would be correct in isolation but would prove nothing about
  whether the read is throttled — it would pass identically whether fed
  from `metrics.value` (the bug) or `displayed.value` (the fix), so it
  would be decorative relative to the actual defect.
- A test that actually exercises the render-coupling property (recompute
  count under a live vs. throttled source) is the shape
  `tests/integration/render-count/` already formalizes — but per
  `frontend/tests/CLAUDE.md`, that harness mounts a full component; this
  task's own TEST section marks component-level tests out of scope for
  this fix, and `tests/unit/`'s own tier definition explicitly excludes
  Vue reactivity (`ref`/`computed`) from Tier 1, which is what a
  recompute-count assertion would need even without a mounted component.
- Extracting the derivation into its own testable module (a second
  `<script>` block or a new `.ts` file) also conflicts with this dispatch's
  "single file expected" scoping, and the codebase's own precedent
  (`MiniBoardCanvas.vue`'s header comment) treats a bare plain-`<script>`
  extraction as the footgun-prone shape for anything beyond truly inert
  constants — a mismatch for a change whose whole point is a reactivity
  property.

**Blocker, concretely:** no test shape in this codebase's current
conventions (Tier 1 unit / Tier 2 fakes / Tier 3 composable-integration /
the narrow render-count exception) covers "a computed depends on a
throttled ref, not a live one" without either mounting a component
(explicitly out of scope here) or writing a Vue-reactivity test Tier 1
explicitly disallows. Flagging rather than shipping a test that would pass
regardless of whether the bug were still present.

**Maintainer-runnable check (per the report's own acceptance criterion):**
connect a real engine (dev build + `__perfScenario`, or the maintainer's
own browser) in SELECTOR mode, open DevTools Elements panel on the
`<select class="engine-model-select">`, hover an `<option>` for >1.5s, and
confirm via a `MutationObserver` (or manual observation) that no DOM
mutation record fires on the `<select>`'s `value`/`selectedIndex` during
the hover. Live engine validation itself is known-blocked in this
environment (no engine reachable in the preview/dev build available to
this session) — this is the same blocker the investigation report
recorded for Defect 1's live leg, unchanged by this fix.

## Gate tails

`cd frontend && npm run build`:
```
> gogui@0.0.0 build
> vue-tsc -b && vite build
...
✓ 1080 modules transformed.
...
dist/assets/index-hOg0CLT2.js   2,920.82 kB │ gzip: 1,032.37 kB
✓ built in 2.85s
```
(the chunk-size warning is pre-existing and unrelated to this change.)

`npx eslint .`: no output, clean exit.

`npm run test:run`:
```
 Test Files  81 passed | 3 skipped (84)
      Tests  1101 passed | 4 skipped (1105)
   Start at  13:33:34
   Duration  118.08s
```

`node_modules` was absent in this worktree at dispatch start; ran `npm
install` first (not part of the fix diff).

License: Public Domain (The Unlicense)
