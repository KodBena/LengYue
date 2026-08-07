# Diagnosis — Defect 1 STILL BROKEN after the merged fix (KataGo model-select hover reassert)

Docs read before this work: `.claude/dispatch-reports/ui-defects-investigation.md`
§Defect 1, `.claude/dispatch-reports/ui-fix-1-toolbar-flicker.md`,
`.claude/dispatch-reports/ui-fixes-batch1-review.md` item 1,
`.claude/dispatch-reports/sgf-pass-diagnosis.md` §WITH-ENGINE (connection
method). Read-only: no source files touched, only this report and
`ui-fix-1b-*.png` screenshots under this same directory.

## Freshness check

`frontend/dist/assets/index-DTp5we1_.js` built 2026-08-06 14:12, **after**
`ToolbarEngineMetrics.vue`'s last edit (13:51, the merged fix commit
`c0f3867e`). Preview at `http://127.0.0.1:4173` (pid 555811) serves this
build. Confirmed fresh — no rebuild needed.

## Reproduction — WITNESSED

Connected the real engine per the proven WITH-ENGINE method: Settings →
Advanced Registry → engine URL, `Connect`, selected model `14` in the
SELECTOR-mode `<select class="engine-model-select">` (options: `14`,
`18 (unavailable)`, `nbttrf (unavailable)`, `08_01 (unavailable)`,
`b11c768h12nbt3tflrs`). Persisted engine URL was read as
`ws://127.0.0.1:1235` before this session and left unchanged (confirmed via
a fresh page load after cleanup — same value).

The native `<select>` popup is OS-rendered and unobservable in headless
Chromium, so per the dispatch brief I instrumented the DOM side instead:
installed property-setter spies on the select element's `value` /
`selectedIndex` IDL properties, plus a `MutationObserver` (`attributes`,
`subtree: true`) on the element, dispatched a `mouseover`/`mouseenter` on a
non-active `<option>` ("18"), then held for 4.2s.

**Result: the reassert mechanism is still firing.** 30 attribute-mutation
records on `<option>` `value` attributes, in bursts, at t ≈ **597, 1597,
2601 (Δ754), 3601 ms** — a period of essentially **exactly 1000ms** between
the dominant bursts, matching `ENGINE_METRICS_TICK_MS` to the millisecond.
(One extra burst at t≈1846-1847 sits ~250ms off the 1597 burst, matching
`TOOLBAR_METRICS_REDRAW_THROTTLE_MS` — a second, faster-cadence trigger
riding the same throttle, not investigated further here since it doesn't
change the diagnosis.) The `<select>` element's own `.value`/`.selectedIndex`
IDL setters were never called directly (`writeCount: 0`) — Vue's runtime-dom
only reassigns `select.value` via the IDL property when the value actually
differs, but it unconditionally re-touches every `<option>`'s `value`
content attribute on each patch of the `v-for`, which is enough by itself to
make a browser's native open-`<select>` popup redraw and drop the user's
hover highlight back to the selected entry — the exact symptom, still
present, on a ~1Hz cadence.

Screenshots: `ui-fix-1b-01-loaded.png` through `ui-fix-1b-07-final-cleanup.png`
(load, Settings/Advanced Registry, URL set, after-connect, model selected,
after the 4.2s spy window, final cleanup state).

## Diagnosis — hypothesis (b) confirmed, file:line

The merged fix (`ui-fix-1-toolbar-flicker.md`) routed `watchdogClasses`
through `displayed.value.*` — the `useThrottledSnapshot` output — instead of
raw `metrics.value.*`. That stopped nothing, because of the throttle's own
semantics:

- `frontend/src/composables/useThrottledSnapshot.ts:57-77`
  (`createTrailingThrottle`) only **coalesces bursts closer together than
  `intervalMs`**. `schedule()`'s wait is `max(0, intervalMs - elapsedSinceLastRun)`
  — when the driving signal already arrives *slower* than `intervalMs`, that
  wait is always 0 and every single tick still fires immediately. It is not
  a rate cap in the sense the fix's own comment assumed; it is a
  burst-coalescer that is a no-op against a signal already below its cap
  rate.
- `frontend/src/components/chrome/ToolbarEngineMetrics.vue:230`:
  `useThrottledSnapshot(liveMetrics, TOOLBAR_METRICS_REDRAW_THROTTLE_MS)`
  with `TOOLBAR_METRICS_REDRAW_THROTTLE_MS = 250` (`frontend/src/lib/timing.ts:148,93`).
- `frontend/src/services/analysis-service.ts:504-507` (`startMetrics`):
  `window.setInterval(() => { recordPacketRate(...) }, ENGINE_METRICS_TICK_MS)`,
  `ENGINE_METRICS_TICK_MS = 1000` (`frontend/src/lib/timing.ts:318`) — **4x
  slower** than the 250ms throttle window, so it is never coalesced; every
  tick reaches `useThrottledSnapshot.ts:94-96`'s `fn` and reassigns
  `snapshot.value = source.value` with a **brand-new object** (`liveMetrics`
  at `ToolbarEngineMetrics.vue:223-229` constructs a fresh object literal
  every evaluation). A `ref` reassignment to a new object reference always
  triggers its dependents (Vue's `hasChanged` sees a different reference,
  regardless of the fields' actual values), so every one of that dependent
  computed's/template's consumers re-runs on this exact 1Hz cadence —
  `watchdogClasses` (`:73`), and, independently, the template's own direct
  bindings to `displayed.value.winrate/scoreLead/pps/latency`, both of which
  live in the **same render function** as the `<select v-for="entry in
  availableModels">` block. Per ADR-0010's render-locality corollary
  (already quoted in the merged fix's own comments): a reactive read
  anywhere in the template reruns the *whole* render function. The select's
  `v-for` block is rebuilt on this cadence regardless of `availableModels`/
  `selectedModel` being unchanged, and Vue's option-patch path (which,
  unlike the `<select>` itself, writes unconditionally — see the WITNESS
  section above) touches the live `<option>` DOM nodes every time.

**Hypothesis (b) is confirmed, and it is the sharper diagnosis exactly as
suspected**: the fix stopped nothing measurable. It only moved the
un-throttled read behind a throttle whose window (250ms) is narrower than
the driving signal's own period (1000ms) — a throttle that never has a
burst to coalesce is inert. Hypotheses (a) (a still-un-throttled sibling
read) and (c) (`:key`/`v-if` churn) were not needed to explain the
observation — the throttled snapshot itself reassigning at ~1Hz is
sufficient and matches the measured cadence exactly.

## Proposed fix that closes the CLASS (not just this instance)

Per ADR-0000: the representable-shape question is *what makes "a periodic
metrics tick can still patch the select's DOM" unrepresentable*, not "make
this one throttle narrower/wider." A narrower throttle window doesn't fix
anything (any window < 1000ms is still inert against a 1000ms source); a
*wider* one (>1000ms) only trades one visible cadence for a slower one and
still eventually reasserts mid-hover.

**The class-level fix: the model `<select>` must be its own leaf component
that reads no metrics at all.** Split
`ToolbarEngineMetrics.vue`'s SELECTOR-mode `<select>` block
(`:217-230` currently) out into a new, small component — e.g.
`EngineModelSelect.vue` — whose only reactive reads are
`store.engine.info.availableModels`, `store.engine.selectedModel`, and
`isSelectorMode`, none of which the metrics tick (or any throttled
projection of it) ever touches. Mount it as a sibling of the metrics strip
in the parent template, not a descendant. This makes "a metrics-driven
re-render can patch the select" **structurally unrepresentable** — there is
no reactive dependency path from `ENGINE_METRICS_TICK_MS`'s interval to this
component's render function at all, regardless of throttle tuning,
independent of whether a future contributor adds yet another metric field to
`liveMetrics`. (The existing leaf-component rationale in this file's own
header comment — "this leaf is the next step so per-tick metric reads no
longer re-render the whole toolbar" — is the same principle one level up;
this fix pushes it one level further, to the one child that must never
re-render on a metrics tick.)

Single new file (`EngineModelSelect.vue`) plus trimming
`ToolbarEngineMetrics.vue`'s template/script to mount it — both files stay
under the ADR-0007 250-line target.

## How a live witness would prove it

The same property-spy + `MutationObserver` harness used above, as a
Playwright-driven acceptance check: connect a real engine in SELECTOR mode,
hover a non-active `<option>` (or just idle-observe the live `<select>` and
its `<option>` children, since the popup itself can't be inspected
headless), and assert **zero** `value`/`selectedIndex` IDL writes AND zero
`MutationObserver` attribute records on the select/its options over a
**3-second** idle window while metrics are actively ticking (confirm the
tick is live by independently observing `store.engine.metrics` — or, after
the fix, by observing the *sibling* metrics strip's own DOM churning on its
own 1Hz/250ms cadence while the model-select node registers nothing at all).
A pass requires literally no mutation records anywhere under the select's
subtree for the full window — the exact assertion this session's harness
already makes, just gated on zero instead of describing the current
non-zero count.

## Live-run scratch artifact

Reproduction script (ephemeral, not committed, documents the exact
Playwright/CDP sequence for replay):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/repro.mjs`.

License: Public Domain (The Unlicense)
