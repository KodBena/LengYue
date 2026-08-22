# LytNode recursive-update crash (row 2562) — second-opinion build, FIXED

**Disposition: FIXED.** Root cause named with direct scheduler-level evidence
(not inference), closed at its owning boundary per ADR-0000 Rule 2, and
verified live: crash present on the base commit, absent after the fix on the
byte-identical fixture, Settings still fully functional, `cards`/`analysis`/
`other` confirmed clean before and after. Full gates green.

## Base

Started per dispatch instruction on local `next` at `403128fa` (the prior
STALL report's commit). Confirmed via `git log --oneline -1 next` before any
work. Mid-session the orchestrator merged the concurrent two-column-reflow
seam (`ff54ae05`, App.vue/ForestDirectory.vue/LibraryTab.vue/layout-model.ts)
into `next`; merged cleanly (`git merge --no-ff ff54ae05`, no conflicts) and
re-verified `next`'s tip hadn't moved again before final gates. That seam
touches nothing in LytNode's reactivity or the Settings sub-components, per
the orchestrator's own note and my own diff inspection.

## The named effect, with scheduler-dump evidence (verbatim)

Per the brief's mandated instrument, `checkRecursiveUpdates`
(`@vue/runtime-core`, throwaway-patched, reverted before delivery — see
"Instrumentation, reverted" below) was made to dump the job's owner and kind
at count 60/80/90 during a live repro (boot with
`session.ui.activeTab: 'settings'` persisted, otherwise schema-default,
matching the prior report's minimal fixture exactly). First pass (checking
`instance.update === fn`) gave a false negative — `instance.update` and the
actually-scheduled `instance.job` are two *different* bound wrappers of the
same effect (`effect.run.bind(effect)` vs `effect.runIfDirty.bind(effect)`,
`@vue/runtime-core` `setupRenderEffect`). Fixed to check
`instance.job === fn`, which is unambiguous:

```
[LYTDBG-SCHED] {"count":90,"componentName":"LytNode","isRenderJob":false,
"isRenderJobFixed":true,"pathProp":"2.3.1.2","nodeKind":"split",
"jobId":30,"jobFlags":5,"jobName":"bound runIfDirty"}
```

`isRenderJobFixed: true` — this is `<LytNode>`'s **own component
render/update job** (`instance.job`, Vue 3.4's `runIfDirty`-wrapped render
effect), for the nested instance at LYT path `"2.3.1.2"` (`node.kind:
"split"`). This settles the prior report's own disclosed uncertainty
("Vue 3.4's lazy dirty-check means a job can be re-queued and counted
without the render body re-executing") the other way: it *is* the render
job, genuinely re-queued dozens of times in one flush — not a mis-attributed
watcher, and not the CardSetEditor/PaletteEditor CodeMirror integration the
prior report recommended as the next lead (that lead is now ruled out; see
"What the prior report's lead did NOT pan out" below).

A second pass with `onRenderTriggered` (Vue's own trigger-introspection
hook, added temporarily to `LytNode.vue`, reverted) named the *dependency*
directly, at the same path:

```
[LYTDBG-TRIGGER] {"path":"2.3.1.2","n":4,"type":"set","key":"0",
"target":"[object Array]",
"oldValue":"{...\"text\":\"Sync: workspace loaded.\"...}",
"newValue":"{...\"type\":\"error\",\"text\":\"Layout defect: \\\"settingsSubstrip\\\" ...\"}"}
[LYTDBG-TRIGGER] {"path":"2.3.1.2","n":6..25+,"type":"set","key":"count",
"target":"[object Object]","oldValue":"N","newValue":"N+1"}
```

This instance's render depends on `store.engine.messages` (index 0 and its
`.count` field) — a dependency it has no business holding, since
`LytNode.vue`'s own script never reads `store` at all.

## The mechanism (closure statement, ADR-0000's 2026-07-02 amendment)

**Invariant.** A `<LytNode>` leaf/blackbox cell whose compiled `content` is
`'bounded'`/`'designed'` (Fit-disciplined) is registered with
`useLytFitAssertion.ts` via a template `:ref` function-ref callback
(`onLeafCellRef`), which Vue invokes **synchronously during the host
component's own patch** — i.e. while `<LytNode>`'s render effect
(`instance.job`) is Vue's `activeEffect`. `useLytFitAssertion`'s `observe()`
runs an immediate synchronous `checkFit` (by its own header's design:
"makes 'on mount' true rather than 'on the next animation frame after
mount'"), which on a genuine overflow calls `pushSystemMessage(...)` →
`system-message-sink.ts`'s registered `push()` → reads
`store.engine.messages[0]` for its show-once dedup comparison, then writes
(`unshift` for a new message, or `head.count++`/`head.timestamp = ...` in
place for a repeat).

Because that read happens while `<LytNode>`'s render effect is active, it
gets **silently tracked as a dependency of that effect** — an accidental,
invisible subscription the sink's own port contract never advertises.
The very next line's write **re-triggers the same effect** (writes are
never gated by Vue's tracking-pause mechanism, only reads are), which
re-runs `<LytNode>`'s render, re-invokes the same `:ref` callback on the
same (still-genuinely-overflowing) element, re-detects the same overflow,
calls `pushSystemMessage` again, re-reads `messages[0]` (re-arming the same
dependency), writes again — forever, until Vue's own `RECURSION_LIMIT`
(100) breaker fires. This is Vue's own diagnostic text, literally: "a
reactive effect that is mutating its own dependencies and thus recursively
triggering itself."

**Quantification universe.**
- **Axis: which producer.** Every current caller of `pushSystemMessage`
  (grep shows ~13 component/composable importers, per the sink's own header
  comment) is equally exposed *if* it is ever invoked synchronously from
  inside an active render/patch/watcher effect — `useLytFitAssertion` is the
  one that happens to be wired that way today (a template `:ref` callback,
  by design, per its own header), but nothing in the type system or the
  sink's contract prevented a *future* producer from doing the same. The
  fix is at the sink (the port every producer already funnels through), not
  at `useLytFitAssertion`'s call site, so it is quantified over the whole
  producer set, not just the one that detonated first.
- **Axis: which `<LytNode>` cell.** Any Fit-disciplined leaf/blackbox that
  genuinely overflows its cell hits this, regardless of *which* leaf. The
  live witness names `settingsSubstrip` (the Settings sub-tab strip,
  6 sub-tabs in a `content: bounded/designed` cell) as the one leaf whose
  genuine overflow (24px too short, height) exists in this build today —
  `cards`/`library`/`analysis`/`other` mount no Fit-disciplined leaf that
  currently overflows, which is *why* only Settings crashed, not because
  the mechanism is Settings-specific.
- **Sibling surface, explicitly checked and cleared.** A genuine consumer
  that reads `store.engine.messages` in **its own** render/watcher (e.g.
  `SystemLogPanel.vue`) is a *different* shape — that read establishes a
  *legitimate* dependency the sink's write is supposed to satisfy. The fix
  (below) preserves this: it only shields the *sink's own internal*
  bookkeeping read from being attributed to an *unrelated* caller, never the
  write's normal trigger/notify to a genuine subscriber. Pinned by the
  test's second case ("a genuine subscriber ... still sees a push").
- **Not covered, named explicitly (per the amendment's "name what's not
  covered" clause):** the `settingsSubstrip` 24px shortfall itself — a real,
  pre-existing layout defect — is **not** fixed by this change and is not
  in scope per the brief's fence (no divider-mechanics/layout re-land).
  Post-fix, that defect surfaces correctly and *safely* as a single (or
  count-bumped) system-diagnostics toast instead of crashing the app — see
  the live witness screenshot. Filing that shortfall is a separate,
  layout-owned follow-up; not filed here per the fence.

**Denomination check.** The bound is denominated in the actual resource that
detonates: Vue's own `shouldTrack` reactive-tracking flag (the mechanism
that turns a read into a dependency), gated by `pauseTracking()`/
`resetTracking()` — the exact primitive Vue's own internals use for "read
reactive state without recording a dependency." Not a retry cap, not a
depth clamp, not a debounce — a currency-correct foreclosure of the tracking
event itself, at the one place (the sink) every producer's read passes
through.

## The two questions (ADR-0000 Rule 2)

**(a) What type/typing discipline forecloses the class?** The general shape:
any code that runs **synchronously inside another effect's active
tracking scope** (a template `:ref` callback during patch, a watcher body, a
computed getter) and calls into a **side-channel port** (a diagnostic sink,
a telemetry emitter — anything whose contract is "fire and forget, not a
value the caller's own computation depends on") must have its **internal**
reads of shared reactive state excluded from that caller's dependency set.
Vue's reactivity system has no static type for "this function may be called
from inside anyone's effect and must not leak tracking" — the runtime
primitive that expresses it is `pauseTracking()`/`resetTracking()` (already
Vue's own vocabulary for this exact situation, used internally throughout
`@vue/runtime-core`). Applied at `system-message-sink.ts`'s registered
`push()` implementation (`src/store/index.ts`), wrapping the dedup read and
both write branches in a `try { pauseTracking(); ... } finally {
resetTracking(); }` block — the same "collapse at the sink, not the
instance" idiom this exact function already uses for the show-once dedup
(its own header: "Collapsing at the sink closes the class rather than the
instance: quantified over every producer, not opt-in per call site").
`pauseTracking` gates `track()` (read-side dependency collection) only,
never `trigger()` (write-side notification) — so a genuine subscriber is
untouched (pinned by the second regression-test case).

`@vue/reactivity` (the package `pauseTracking`/`resetTracking` live in) was
not previously a **direct** frontend dependency — only transitive via
`vue` — so it's added explicitly to `frontend/package.json` (pinned
`^3.5.31`, matching `vue`'s own pin exactly; both packages ship in
lockstep from the same release), and `frontend/package-lock.json` is
regenerated via `npm install --package-lock-only` (no network fetch
needed — the package was already resolved in the lockfile as a transitive
dependency at the identical version) so `npm ci` in CI stays in sync with
`package.json`.

**(b) What operational lapse let this recur?** No discipline in this
codebase names "write-locality" as the sibling of ADR-0010's
read-locality rule — read-locality governs which *component* may read a
high-frequency value, but nothing governs whether a *side-channel emitter*
invoked from inside a render/patch callback may safely read-then-write
shared state without contaminating the caller's own dependency set. The
"imperative-escape pattern" (`frontend/CLAUDE.md`) explicitly describes a
`:ref` callback doing an *imperative update*, but its four-step contract
never addressed a **diagnostic push with an internal reactive read**
specifically — `useLytFitAssertion`'s own header confidently frames its
`pushSystemMessage` call as one-way ("report-only ... no clamp, no layout
write, no CSS change"), missing that the SINK's own dedup logic reads
before it writes, and that read is what leaks. The executive gap: the
"collapse at the sink" idiom already used for the dedup mechanism (this
exact function, same file, same PR history) was never extended to cover
tracking-safety, because no incident had yet forced the question. This
report is that incident; the fix generalizes the SAME choke point the
dedup fix already established, so a future producer inherits the
protection automatically rather than needing its own fix.

## What the prior report's lead did NOT pan out

The prior STALL report's own recommendation ("focused instrumentation on
`CardSetEditor.vue`/`PaletteEditor.vue`'s CodeMirror integration — the one
architecturally-distinguishing, unexamined surface") is **refuted** by the
scheduler-dump evidence: the exploding job's `pathProp` is `"2.3.1.2"`,
`nodeKind: "split"` — a plain LYT Split node inside the outer skeleton, not
one of the six keep-mounted Settings sub-components (those aren't LYT nodes
at all; per `LytNode.vue`'s own header, "Settings' interior ... is inside a
blackbox whose interior escaped the LYT contract" — CodeMirror never
enters this picture). The actual overflowing leaf, `settingsSubstrip`, is
the **tab strip half** of the docked-Exclusive split composition
(`SettingsSubstrip.vue`/`SettingsPane.vue`'s shared `V(settingsSubstrip,
SP_session)` pair, per `TabWidget.vue`'s own header) — a plain `<ul
role="tablist">`, not a CodeMirror surface at all. `TabWidget.vue` itself
was re-verified in full (`grep -n "computed(\|watch(\|ref(\|onMounted\|emit("`)
and is genuinely stateless, confirming the prior report's own finding
there.

## Live witnesses

Environment recipe (superseding/matching the prior report's, updated ports
to avoid collision with concurrent sessions): isolated SQLite at a scratch
path, backend via `/home/bork/scratchpad/venv/bin/python backend/main.py`
with `HOST=127.0.0.1 PORT=19765`; `cd frontend && npx vite --port 19174
--strictPort --host 0.0.0.0` (must run with `frontend/` as actual cwd);
`frontend/.env.local` pointing `VITE_API_BASE_URL` at the isolated backend
(never `192.168.122.1:8764`); `frontend/scratch-shot.mjs` (banked, reverted
to its base state before delivery) as the Playwright driver.

- **Crash present, base (`403128fa` + merged `ff54ae05`), before the fix**:
  reproduced live, fresh SQLite, fresh user (`lyt_repro2`), boot with
  `session.ui.activeTab: 'settings'` persisted via the app's own Settings
  tab click + debounced auto-save + reload (not a hand-rolled payload) —
  `[RootErrorBoundary] Caught error: Maximum recursive updates exceeded in
  component <LytNode>. ... watcher callback` console output, `.reb-overlay`
  fallback rendered.
- **Crash absent, same fixture, after the fix**: identical repro sequence
  (same user, same persisted document, fresh reload) — no recursive-update
  error in console, app renders normally into the Settings tab, with the
  `settingsSubstrip` Fit violation now surfacing correctly as a *single*
  system-diagnostics toast ("Layout defect: \"settingsSubstrip\" is
  declared Fit (no scroll) but its content overflows its own cell — 24px
  too short (height). This is a compiled-program or measurement bug, not
  something you can fix by resizing the window.") — screenshot
  `witness_fixed_settings_boot.png`.
- **Settings still functional live**: from that same booted session,
  clicked through the Card Sets (Decks) and Advanced Registry sub-tabs
  (real DOM interaction, not just "no crash") — both rendered correctly,
  editable controls visible and responsive (`analysisStorageEnabled`
  checkbox, `ponderMaxVisits`/`watchdogAnimationMs` numeric fields, the
  Advanced Registry's live key/value tree) — screenshot
  `witness_settings_interact.png`.
- **`cards`/`analysis` still clean, before and after**: fresh user
  (`lyt_other`), default boot (`cards`), click to `Analysis`, reload — alive
  at every step, both pre- and post-fix.
- **`other` — the prior report's missing data point, now filled in**: same
  fresh-user flow, clicked `Other`, reload — alive both before and after
  the reload. Confirms the prior report's own hedge ("I'd bet with moderate
  confidence it doesn't crash either") — `other` does not crash, consistent
  with the mechanism being about a genuinely-overflowing Fit-disciplined
  leaf (which `other`'s content doesn't have today), not about the
  `'settings'` tab id specifically.

(Screenshots referenced above were captured to the session scratchpad
during this build and are not committed alongside this report — the
existing base-state screenshots from the prior STALL report,
`lytnode-recursion-crash-settings-boot.png` /
`lytnode-recursion-crash-postmerge-fa12e353.png`, already document the
crash-present state and are not duplicated here.)

## Instrumentation, reverted

- `frontend/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js`
  (shared tree via the mandated symlink): `checkRecursiveUpdates` was
  throwaway-patched to dump the job's owner/kind at specific counts.
  **Reverted** — diffed byte-for-byte against the pre-patch content read at
  session start; confirmed identical.
- `frontend/node_modules/.vite/deps/` (the pre-bundled dep cache Vite
  actually serves — editing the `dist/` source alone was insufficient; Vite
  caches the pre-bundled chunk in memory per-process and a concurrent
  session sharing the same physical `node_modules` regenerated it from
  stale content once mid-session, a disclosed hazard of the symlink):
  **deleted** (`rm -rf node_modules/.vite/deps`) rather than hand-reverted,
  so it regenerates cleanly from the now-pristine source on next use.
- `frontend/src/components/chrome/LytNode.vue`: a temporary
  `onRenderTriggered` debug block (plus its import) was added and removed;
  `git diff` against the merge-base is empty for this file.
- `frontend/scratch-shot.mjs`: a temporary `LYTDBG_ALL` unfiltered-dump line
  was added and removed; `git diff` is empty for this file.

`git status`/`git diff --stat` at delivery time shows exactly four changed
files, all intentional: `frontend/package.json`,
`frontend/package-lock.json`, `frontend/src/store/index.ts`,
`frontend/tests/unit/services/system-message-sink.test.ts`.

## Regression test (unit tier — the mechanism, not the symptom)

`frontend/tests/unit/services/system-message-sink.test.ts`, new
`describe('untracked read/write (row 2562 ...)')` block, two cases:

1. **The pin.** A raw `ReactiveEffect` (`@vue/reactivity`) with
   `EffectFlags.ALLOW_RECURSE` set and a scheduler that re-runs it — the
   exact shape Vue gives a component's own render effect
   (`toggleRecurse(instance, true)`, `@vue/runtime-core`) and *not* what a
   plain `watch`/`watchEffect` carries. This distinction was verified while
   drafting the test: a `watchEffect`-based version of the same test does
   **not** reproduce the bug (Vue's own recursion guard silently swallows a
   plain effect's self-trigger), which is itself useful negative evidence
   pinpointing *why* only a component's own render effect (never a
   watcher) can hit this class. The effect's body calls
   `pushSystemMessage` on every run; asserts `runs === 1`.
2. **The counter-check.** A `watchEffect` that legitimately reads
   `store.engine.messages` in its own body still gets notified when an
   unrelated call pushes a message — proving the fix doesn't silently break
   real consumers (e.g. `SystemLogPanel.vue`).

Verified both ways before finalizing: reverting the fix
(`git stash` on `src/store/index.ts`/`package.json`) turns case 1 red
(`runs` hits the 10-iteration cap instead of staying at 1); restoring the
fix turns it green. `App.vue`'s full render tree cannot be exercised in
jsdom for this (jsdom never computes a real `scrollWidth`/`clientHeight`
overflow, so `useLytFitAssertion` never detects a violation there — this
matches the prior report's own jsdom finding) — but the actual defect is a
Vue reactivity-tracking-mechanics bug, not a layout bug, so it is pinned
correctly at the level where it actually lives.

## Gates (run synchronously, output read)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output.
- `npx vitest run` — **3571 passed, 8 skipped, 0 failed** (292 files
  passed, 3 skipped), exit 0.
- `npm run build` (`vue-tsc -b && vite build`) — succeeds, exit 0 (the
  same pre-existing "chunk larger than 500kB" advisory the prior report
  also saw, unrelated).

All three re-run and re-confirmed after the `package-lock.json`
regeneration, as the final state.

## Fence compliance

- `StatusBar.vue` and status-bar-related code: untouched.
- Divider-mechanics: untouched, not re-landed.
- `proxy/`: untouched.
- The concurrent two-column-reflow seam (`App.vue`
  `panelContentPolicy`/`ForestDirectory`/`LibraryTab`): untouched by this
  session; merged in from `next` (`ff54ae05`) per the orchestrator's
  mid-session instruction, verified via `git log --oneline -1` that
  `next`'s tip hadn't moved again before final gates.
- Edits outside the named fix: none. Final diff is exactly
  `frontend/package.json`, `frontend/package-lock.json`,
  `frontend/src/store/index.ts`, and the one test file.

## What was honestly NOT done

- **The `settingsSubstrip` 24px Fit shortfall itself.** Named explicitly in
  the closure statement's "not covered" clause. It's a real, independent
  layout defect (the strip's compiled/allotted height is 24px short of its
  six-sub-tab natural height) that now surfaces correctly as a single
  diagnostic toast instead of crashing the app. Fixing the layout itself is
  out of scope per the brief's fence (no divider-mechanics/layout re-land)
  and is not this session's defect class to close.
- **A component-level (full `App.vue` mount) regression test.** Attempted
  implicitly by re-confirming the prior report's own jsdom finding (real
  `scrollWidth`/`clientHeight` overflow never occurs in jsdom); not
  re-attempted as a fresh pinning vehicle since the unit-tier
  `ReactiveEffect` test above pins the actual mechanism more precisely and
  without the jsdom gap.
- **A dispatch to the layout owner about `settingsSubstrip`'s shortfall.**
  Not filed — the brief's fence draws the line at "no divider-
  mechanics/layout re-land," and filing a report finding without shipping a
  fix seemed better done by whoever owns that surface next, rather than by
  this session inventing a new deferral record outside its mandate. Flagged
  here so it isn't silently lost.

## Addendum, 2026-08-22: perf regression test for the sink path (ledger row 2568)

Follow-up commit on the same branch, per the commissioner's delivery
condition on the fix above (row 2568): nothing covered the sink path's
performance property before this. Worked in-place in the same worktree
(`c15429e7` was the tip; the delivery above was intact and untouched).
Amended gates from the orchestrator mid-session (a full `npx vitest run`
and `npm run build` were named too slow for this diff's shape): the
targeted gates below, run synchronously, are what actually gated this
commit — no full-suite or build run was started, so nothing needed to be
killed.

### What was pinned

Two cases added to the existing `describe('untracked read/write (row
2562 …)')` sibling block in
`frontend/tests/unit/services/system-message-sink.test.ts`, in a new
`describe('subscriber notification cadence (row 2568 — perf regression,
consumer side)')`:

1. **Deterministic effect-storm pin.** A `watchEffect` (`flush: 'sync'`)
   shaped like `SystemLogPanel.vue`'s own `v-for="msg in
   store.engine.messages"` body — it iterates the list and reads each
   row's `text`/`count`/`timestamp`, the exact fields that component
   renders — asserted to run **exactly once per push**, across a
   sequence that includes two consecutive dedup-hit pushes (same
   type/text as the current head) as well as fresh-row pushes. The
   established contract, read out of the sink's own `push()` header
   comment (`src/store/index.ts`): a dedup hit is NOT a no-op — it
   widens the existing row in place (`head.count++`, `head.timestamp =
   …`), a genuine mutation of reactive state a real subscriber must see.
   So the pin is "exactly one notification per push, whichever branch of
   `push()` ran" — not "zero notifications on a dedup hit." Bidirectional
   guard: if a future edit widens the `pauseTracking` window to also
   swallow the write's notification, a real subscriber would silently
   miss pushes and this test goes red for missing runs; if a future edit
   narrows it (moves a read outside the pause), row 2562 reopens and
   the *producer*-side test above (already in the file) goes red first,
   but this consumer-side test would also show extra runs if the leak
   ever manifested as the subscriber's own effect re-entering.
2. **Wall-clock backstop.** 10,000 pushes through the registered sink
   (`sink.pushSystemMessage`), alternating a fresh row with an immediate
   dedup-hit repeat of it (a realistic 50/50 mix of `push()`'s two
   branches), asserted to complete in well under 8000ms. Not attempted
   as a tight benchmark — see the measurement below for why 8000ms is
   the chosen bound (roughly 17-20x the measured value, not a
   CI-variance-flaky tight number).

Both cases pass; full targeted run below.

### Measured overhead statement (ADR-0009; report-only, not asserted)

Method: a throwaway scratch test file
(`frontend/tests/unit/services/__scratch10k.test.ts`, never committed —
created, used, then deleted) ran 10,000 `pushSystemMessage` calls
(alternating fresh/dedup-hit pairs, same shape as the committed backstop
test) through the real registered sink and timed the loop with
`performance.now()`. Three consecutive runs with the fix as shipped:

```
437.789ms, 452.247ms, 450.191ms   (mean ≈ 447ms)
```

`src/store/index.ts`'s `push()` was then temporarily edited — the
`pauseTracking()` call commented out and the matching `resetTracking()`
in the `finally` block commented out — and the same scratch test rerun
three times:

```
439.564ms, 445.634ms, 441.099ms   (mean ≈ 442ms)
```

The two distributions overlap entirely (~440-452ms either way) — no
measurable overhead from the `pauseTracking()`/`resetTracking()` pair
itself at this scale (10k calls, ~44µs/call all-in). The ~44µs/call cost
is dominated by the array `unshift`/`pop` capping-at-50 behavior and
`Math.random()` id minting on the non-dedup half, not by the tracking
guard, which is consistent with `pauseTracking`/`resetTracking` being
cheap flag flips in `@vue/reactivity` rather than anything that walks
reactive state. This substantiates the fix's "costs nothing" framing
(dispatch report body, "Denomination check" section) with a number
rather than leaving it asserted on reasoning alone.

The edit was reverted immediately after measuring; `git diff
src/store/index.ts` was confirmed empty before proceeding, and the
scratch test file was deleted (never staged, never committed).

### Gates (amended, run synchronously, output read)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output.
- `npx vitest run tests/unit/services/system-message-sink.test.ts` (the
  file this follow-up touches, containing both this addendum's two new
  cases and the row-2562 regression test from the delivery above) —
  **15 passed, 0 failed**, exit 0. The wall-clock backstop case itself
  ran in 459ms in this run (consistent with the standalone measurement
  above).
- No full `npx vitest run` and no `npm run build` were run this
  follow-up, per the orchestrator's amended-gates directive — the diff
  is test-file-plus-report only, and the commissioner's amendment named
  the targeted form as sufficient for that shape of change.

### Fence compliance

- `src/store/index.ts`: touched only transiently for the measurement
  above, reverted before commit — `git diff --stat` confirms zero net
  changes to it.
- Only file changed in this follow-up commit:
  `frontend/tests/unit/services/system-message-sink.test.ts` (+117
  lines), plus this addendum to the report itself.
- No other `src/` file touched. No divider-mechanics, no `proxy/`, no
  `StatusBar.vue` — untouched, as before.

### What was honestly NOT done

- The wall-clock bound (8000ms) is generous by design and will not
  catch a *mild* regression (say, a 3x slowdown) — only a gross one (an
  effect-storm-shaped blowup or an accidental O(n²) creeping into the
  dedup path). The deterministic effect-storm pin (case 1) is the test
  that actually catches the specific regression class this delivery
  condition names; the wall-clock case is explicitly the coarser
  backstop, not a substitute for it.
- No component-level (mounted `SystemLogPanel.vue`) version of the
  subscriber-cadence test was attempted — the `watchEffect`-based
  stand-in reads the identical reactive surface
  (`store.engine.messages[].{text,count,timestamp}`) the real component
  reads in its `v-for`, so it pins the same dependency shape without the
  added jsdom-mount machinery; this mirrors the delivery report's own
  choice for the row-2562 producer-side test.
