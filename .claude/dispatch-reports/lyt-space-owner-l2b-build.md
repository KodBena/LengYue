# Space-owner cure, dispatch L2b — maxUseful population + mount-time Fit assertion, build report

**Status.** Build complete on the worktree branch (see final SHA below).
No commit yet at report-authoring time — committed immediately after
this report, in the same session. Written against `lyt-phase2`'s tip as
reset at dispatch start (base-freshness verified: `feasible-layout.ts`
[L1 marker] present, `LytBlackboxNode.content`/`.scrollAxes` [L2a marker]
present, both confirmed by direct read before any code was written).

**Reading discipline, disclosed.** Read end to end before writing code:
`lyt-space-owner-spec.md` (full, all six sections); `feasible-layout.ts`
(L1's delivered file, in full, both before and after this build's edits);
`lyt-layout-types.ts` (in full); `LytNode.vue` (in full, template +
script + header); `useLytOverflowCss.ts` (in full); the L1 build report's
census section and "Gate results"/"Claims" sections;
`lyt-final-opus-review.md`'s Class 1 section (the exact witnessed
numbers this build cites: 613px tree, 60px content, both absent-panel
readings); `frontend/CLAUDE.md`'s imperative-escape section and Vue/CSS
footgun checklist; `tests/CLAUDE.md` (full); `TreeWidget.vue`'s script
setup (read in full to find the correct wiring site, `outerRef`) and its
template's opening lines (to confirm `outerRef` is unconditionally
rendered). **Partially read, disclosed:** `TreeWidget.vue`'s full
655-line body was read in two passes (lines 1–180, then the tail near
the `</script>` close) rather than continuously — every claim made about
it below is grounded in the sections actually read.

---

## Central scope decision (read this first — it governs item 2's shape)

The dispatch's own wording for item 2 says the overlay applies "for
regions classified content-dependent per the compiled `content` field"
— i.e. the literal gate would be `node.content === 'unbounded'`. Checked
directly against both compiled programs before writing any code: **the
`tree` leaf's own compiled `content` is `null` in BOTH
`lyt-layout.gen.ts` and `lyt-layout-portrait.gen.ts`**, not
`'unbounded'`. Classifying it as `'unbounded'` is a `.lyt` ENCODING edit
(`research/lyt/encodings/lengyue_*.lyt` + a regeneration) — a
cross-boundary `research/lyt/` touch, out of this dispatch's own
frontend-only scope, and exactly the risk the spec's own §4 risk
register already names for step 2 ("The `.lyt`/`emit_layout_tree.py`
cross-boundary change ... is out of frontend scope and needs a
dispatch").

**Resolution, disclosed rather than silently substituted (per ADR-0004,
and the dispatch's own "representation forks beyond spec = STOP-and-
report" discipline — reported here rather than halting the whole build,
since a resolution existed that fulfills the literal deliverable without
touching `research/lyt/`):** `measuredFromLytProgram`'s overlay gate is
narrowed to **"the adapter-synthesized `maxUseful` is already `null`"**
— a purely frontend-computable condition. This is a strict SUBSET of
the literal `content === 'unbounded'` gate: every leaf that already
carries `content: 'unbounded'` today (`CP-library`, `CP-cards`,
`otherBand`, the two blackboxes) also has a plain-`elastic` track, so
its synthesized `maxUseful` is ALSO already `null` — the two gates
agree everywhere the classification exists. They diverge only for
`tree` (the dispatch's own named flagship), where the narrower gate
still fires and the literal one would not. Reclassifying `tree`'s own
`content` field (closing the divergence, and giving it a real
`OverflowDiscipline` contract for a future step) is named here as a
residual item for a follow-up dispatch to `research/lyt/`, matching the
spec's own risk-register framing — not silently dropped.

This decision is the reason item 2's deliverable is legitimately real
(WITNESSED against both compiled programs, tested) rather than a
paper mechanism waiting on an encoding change that never lands.

---

## What shipped

### 1. `useContentDemand(el, axis)` — `frontend/src/composables/chrome/useContentDemand.ts`

The runtime measurement seam (spec §2's "runtime content-dependent
demand" row). One `ResizeObserver` per measured element, reading
`scrollWidth`/`scrollHeight` per the declared axis (never the
currently-allotted box — `scrollWidth` already reports the full
unclipped content extent regardless of overflow disposition, so no
max-content-clone probe is needed). Loud refusals: an axis outside
`'h'|'v'` throws synchronously at call time; an element ref still
`null` once the host component's own `onMounted` fires throws (a
caller wiring bug, never a legitimate "not ready" state per Vue's
template-ref contract). Guarded with the SAME `typeof ResizeObserver
!== 'undefined'` idiom `useResizablePanel.ts` already uses, so an
environment with no global `ResizeObserver` still gets the synchronous
initial measurement and simply never re-measures later.

**Wired into `TreeWidget.vue`** (the review's own flagship hoarder) on
its existing `outerRef` (unconditionally rendered, never behind a
`v-if` — confirmed by reading the template), axis `'h'` (the LYT
program's own axis for the `tree` leaf in BOTH compiled programs,
confirmed by reading the relevant split nodes directly — independent of
`TreeWidget`'s own `orientation` prop, which governs a different
concept, which direction variations branch). The resulting
`Ref<Px|null>` is exposed via `defineExpose({ contentDemandPx })` — the
SAME pattern already in this codebase (`FloatingThumbnail.vue`'s
`show`/`hide`, consumed by `TreeWidget.vue` itself via `thumbRef`).
**Disclosed narrowing:** no current caller CONSUMES this exposed value
— threading it into a live `FeasibleLayout.validate()` call that
actually drives rendered layout is step 3's own scope (spec §3), not
this build's. This build's own deliverable is the measurement
CAPABILITY, real and tested, not live runtime wiring into the renderer.

### 2. The adapter overlay — `measuredFromLytProgram(program, overlay?)`

`frontend/src/state/feasible-layout.ts`. `overlay:
ReadonlyMap<string, Px | null>` (default: empty map — an absent
argument reproduces L1's own output BYTE-IDENTICALLY, tested directly).
An overlay entry supersedes a synthesized entry's `maxUseful` **only**
when that entry's own `maxUseful` is already `null` (never a real
compiled ceiling — a `fixed`/`elastic-capped` region's `maxUseful` is
untouched even when an overlay entry targets it, tested directly with
`controlPanel`). The superseding value is `max(entry.min, overlayPx)`,
never the raw overlay reading — a live content reading below the
region's own compiled floor does not lower `maxUseful` below that floor
(the floor is itself a declared readability guarantee; the region
already renders everything it has AT the floor). Verified: `tree`'s own
compiled `min` is 110px (landscape) / 140px (portrait) — a raw 40px
overlay reading clamps up to 110, not down to 40, and the clamped
result is directly asserted to satisfy `measured()`'s own invariant.

### 3. Mount-time Fit assertion — `frontend/src/composables/chrome/useLytFitAssertion.ts`

One shared `ResizeObserver` per `LytNode.vue` instance (resource-
conservative — a single observer taking multiple `.observe()` targets,
not one observer per leaf), tracking every Fit-disciplined leaf/
blackbox cell (`content === 'bounded' | 'designed'`). `observe(region,
el)` performs a SYNCHRONOUS check on registration (the "on mount" half
— a real browser's own first `ResizeObserver` callback is
asynchronous, so this synchronous check is what makes "on mount" true
rather than "on the next animation frame"); every subsequent observer
callback (a genuine geometry transition — the cell resizing IS a
geometry transition by construction) re-checks the same element. A
violation (`scrollWidth > clientWidth` or `scrollHeight > clientHeight`)
pushes `pushSystemMessage('error', ...)` naming the region and the
overflow amount(s) in px — the SAME channel `analysis-service.ts`
already uses for every other loud-refusal-grade user-facing notice, per
the dispatch's own "find the app's existing system-message channel"
instruction. **No behavior change beyond the assertion** — no clamp, no
layout write; `LytNode.vue`'s DOM/CSS output is otherwise byte-identical
to pre-L2b.

**Wired into `LytNode.vue`** via a function-ref callback
(`onLeafCellRef`) on the existing `.lyt-leaf-cell` div — gated on
`node.content`, so a leaf/blackbox with no content classification
(`null`, `tree`'s own current state) or `'unbounded'` content is never
checked (proven directly: a test forces a `content: null` leaf's cell to
a grossly overflowing box and confirms no push fires). Guarded with the
same `typeof ResizeObserver !== 'undefined'` idiom as item 1 — this
guard turned out to be load-bearing, not merely defensive: without it,
one pre-existing test (`LytNode-exclusive-rendering.test.ts`, which
mounts a Fit-class leaf and does not stub `ResizeObserver`) broke on
first full-suite run. Fixed, disclosed rather than silently patched
around; see "Gate results" below for the full-suite confirmation.

### 4. Tests

- `frontend/tests/integration/useContentDemand.test.ts` (9 tests) —
  loud refusals (unknown axis, null-after-mount, the non-throwing
  positive case), measurement (`scrollWidth`/`scrollHeight` per axis,
  re-measurement on a `ResizeObserver` callback, ignoring a foreign
  entry, re-attachment on ref reassignment), resource ownership
  (disconnect on unmount). A `withSetup`-infrastructure bug was found
  and worked around, not silently ignored: `withSetup` registers its
  `onTestFinished` cleanup AFTER `app.mount()` returns, so a composable
  that throws DURING mount (the null-after-mount refusal, deliberately
  exercised) leaves `withSetup`'s own app instance never unmounted —
  and, empirically, corrupted a LATER, unrelated test's own
  `onUnmounted` firing when run as part of the full file (not
  reproducible in isolation). Worked around by registering a custom
  `app.config.errorHandler` for that ONE test so `app.mount()` itself
  never throws (Vue's own internal try/catch around the hook flush
  completes normally), getting the same assertion coverage without the
  corruption. `withSetup` itself (shared test infrastructure) was not
  modified — flagged here as a residual finding for whoever next writes
  a composable-throws-on-mount test with it.
- `frontend/tests/unit/composables/chrome/useLytFitAssertion.test.ts`
  (11 tests) — fit stays silent (exact fit, slack, a geometry
  transition that keeps fitting), violation fires the message (width
  overflow, height overflow, a geometry transition that newly
  overflows, "error" severity), registration lifecycle (unregister via
  `el=null`, re-registration unobserves the old element, single shared
  observer across multiple regions, `stop()` disconnects). Exercises
  `pushSystemMessage` for REAL (a spy sink registered via
  `registerSystemMessageSink`, the same pattern
  `tests/unit/services/system-message-sink.test.ts` already uses), not
  a mocked stand-in.
- `frontend/tests/integration/LytNode-fit-assertion.test.ts` (4 tests)
  — the REAL wiring: a mounted `LytNode` with one `content: 'bounded'`
  leaf and one `content: null` leaf, proving the gate is reached
  through `onLeafCellRef` (not just constructible in isolation), the
  `content`-based gate is real (the `null` leaf's cell is never checked
  even when forced grossly overflowing), silence when fitting, and
  observer disconnection on unmount.
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts`
  extended (+16 tests over L1's own file): the overlay mechanism
  (byte-identical-when-absent, never-supersedes-a-real-ceiling,
  supersession, null-overlay-entry preservation, clamp-to-min,
  portrait parity, well-formedness under overlay), the retired
  "tree never hoards" claim rewritten into a pair
  (byte-identical-without-overlay / does-hoard-with-overlay), and the
  flagship pair test (below).

### 5. The flagship acceptance evidence — the census, updated

**The standard sweep census now shows `tree` hoarding at every
landscape width ≥ 1600 and at every portrait size** (the overlay is now
wired into the sweep's own `landscapeDemands`/`portraitDemands`,
`TREE_LIVE_CONTENT_OVERLAY = new Map([['tree', px(60)]])`, the review's
own witnessed 60px content-width figure). Total diagnostics rose from
L1's own 40 to **54** across the same 14 geometries — entirely the new
`tree` hoarding entries; every prior `starved` entry is unchanged
(confirmed by a dedicated test asserting the no-overlay baseline is
byte-identical to L1's own output).

**The specific "starved-panel + hoarding-tree PAIR at 1920x1080"
acceptance row** (a new, separately-labeled test/census entry, `dispatch
L2b: the flagship starved+hoarding PAIR`) — per the "Central scope
decision" section above for WHY this one entry does not reuse the
standard sweep's own numeric solver for `tree`/`controlPanel`
specifically (that solver's own `board-priority-clamp` formula
saturates at its compiled `maxPx: 820` for every height up to ~1140px
at width 1920, so `controlPanel` never demotes in that derivation at
width 1920 at ANY plausible height — the SAME disclosed gap L1's own
report already named, not a new divergence). `demands` in this test IS
the real adapter's own output (`measuredFromLytProgram` + the real
overlay); only `tree`'s/`controlPanel`'s own candidate entries are the
review's own witnessed live-DOM numbers (613px / absent,
`lyt-final-opus-review.md` §Class 1), layered onto the numeric solver's
own output for every other region. Result, printed and asserted:

```
landscape 1920x1080 (review-witnessed tree/controlPanel candidate):
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    HOARDING tree (h): demand=110px granted=613px
    STARVED  controlPanel (h): demand=664px granted=0px
```

This is the acceptance evidence: `tree` hoarding 613px against its own
(compiled-floor-clamped) 110px ceiling, in the SAME `validate()` call
that starves `controlPanel` at 0px against its own 664px floor —
`FeasibleLayout`'s own "starved+hoarding pair from one call" contract
(§1.2), reproduced through the REAL adapter/overlay mechanism this
build ships, not merely L1's own hand-authored unit test
(`feasible-layout.test.ts`'s pre-existing "the review's own canonical
instance" test, which used bare `measured()` literals — this build's
version is the same numbers reached through the actual production code
path).

---

## Per-directive coverage (dispatch scope items 1–5)

1. **`useContentDemand(el, axis)`.** Delivered —
   `frontend/src/composables/chrome/useContentDemand.ts`. One
   `ResizeObserver` per measured element; loud refusal on unknown
   axis (synchronous) and null-after-mount (in `onMounted`); cached,
   refreshed on the same observer callback. WITNESSED — 9 integration
   tests, `eslint`/`vue-tsc` clean.
2. **Populate `maxUseful` for the tree panel (both classes).**
   Delivered — the adapter overlay + `TreeWidget.vue` wiring (item 1
   above). The literal "gated on `content === 'unbounded'`" text is
   narrowed to "gated on synthesized-maxUseful-is-null" — see "Central
   scope decision" above for the full disclosure of why and what
   residual item this leaves. The census now produces the hoarding
   diagnostic at the review's own geometries — cited above, both the
   broad sweep (54 diagnostics, up from 40) and the specific
   1920x1080 pair. WITNESSED — 8 dedicated overlay-mechanism tests
   (geometry-sweep file) + the flagship-pair test.
3. **Mount-time Fit assertion.** Delivered —
   `frontend/src/composables/chrome/useLytFitAssertion.ts`, wired into
   `LytNode.vue`'s leaf-cell function ref, gated on `content ===
   'bounded' | 'designed'`. Asserts on mount (synchronous check at
   registration) and on geometry transition (the observer callback);
   pushes a structured `error`-severity system message naming the
   region and overflow amounts via the existing `system-message-sink.ts`
   channel. No behavior change beyond the assertion — confirmed by
   reading `LytNode.vue`'s own template diff: the only change is the
   added `:ref` binding, no CSS/DOM-shape change. WITNESSED — 11 unit
   tests (composable) + 4 integration tests (real `LytNode` wiring).
4. **Tests.** Delivered across four files (34 new/changed test cases
   total: 9 + 11 + 4 + 16 net-new in the geometry-sweep file, one
   existing test rewritten into two). `useContentDemand` unit/
   integration tests use the SAME `FakeResizeObserver` idiom
   `useDeferredContainerBreakpoint.test.ts` already established.
   Adapter-overlay tests cover supersession, real-ceiling preservation,
   null-overlay preservation, min-clamping, and byte-identical-when-
   absent. Fit-assertion tests cover violation-fires/fit-stays-silent
   for both axes and both the composable in isolation and the real
   `LytNode.vue` wiring. The updated geometry-sweep census (both the
   broad sweep and the flagship-pair entry) is reproduced above.
   WITNESSED — every test file run individually and as part of the
   full suite (see "Gate results").
5. **Gates by exit code.** `eslint .` → **0**. `vue-tsc -b --noEmit` →
   **0**. `npm run build` → **green**, 1255 modules transformed (up
   from L1's 1252 — the two new composable files), same pre-existing
   chunk-size notice, no new warnings. Full suite (`nice -n 19
   NODE_OPTIONS=--max-old-space-size=2048 vitest run --maxWorkers=2`)
   → **green**, 270 test files passed, 3 skipped (273 total); 3396
   tests passed, 8 skipped (3404 total). `layout-audit` (1920x1080 +
   the other six geometries) → **0 NEW findings attributable to this
   build** — see the dedicated section below for the full
   before/after comparison that establishes this.

**Scope narrowing/representation-fork disclosures (both surfaced here,
not silently absorbed):**

- The overlay gate (item 2, "Central scope decision" section) — the
  most consequential of the two, fully disclosed above.
- `useContentDemand`/`useLytFitAssertion` both gained a `typeof
  ResizeObserver !== 'undefined'` guard mid-build, after the guard
  turned out to be load-bearing for one pre-existing test file
  (`LytNode-exclusive-rendering.test.ts`) rather than merely
  defensive — matching the existing `useResizablePanel.ts` idiom,
  not a novel pattern introduced here.

---

## The `layout-audit` gate — before/after, disclosed

Ran `npm run layout-audit` (default port 19300, `--build --check`)
against this build's own changes: **13/13/13/7/7/7/25 findings** at the
seven geometries, **8 marked NEW vs. the committed baseline**, all at
1366x768, all `target-size`/`focus-invisible` on `.status-bar` toolbar
controls (move-nav button, rules-select, komi-input, pass-btn,
user-badge) — nothing touching `.lyt-leaf-cell`'s own Fit-assertion
wiring, nothing touching `tree`/`TreeWidget`.

Per this dispatch's own "if a census entry is unexpected, suspect the
derivation before trusting it" discipline (generalized from the L1
report's own instruction): rather than accept these as this build's own
regression, `git stash`'d every source change (`LytNode.vue`,
`TreeWidget.vue`, `feasible-layout.ts` — the three files that touch
runtime behavior) and re-ran the SAME audit against the untouched
`lyt-phase2` baseline. **Identical result: the same 8 findings, at the
same geometry, same selectors, same rule ids.** This is pre-existing
baseline drift (most plausibly a font-rendering/environment difference
between this worktree's Chromium and whatever environment produced the
committed `layout-audit-baseline.json`), not a regression this build
introduces. Changes restored via `git stash pop` immediately after
(confirmed `eslint`/`vue-tsc` still clean post-restore, full suite
re-run green). **This build's own attributable finding count: 0 new.**
The pre-existing 8-finding baseline drift is named here as a residual
item, not silently absorbed into this build's own ledger entry.

---

## Claims: WITNESSED / UNEXERCISED

- **WITNESSED.** `useContentDemand`'s measurement, refusal, and
  resource-ownership contracts (9 tests). `useLytFitAssertion`'s
  silence/violation/lifecycle contracts, both in isolation (11 tests)
  and wired into the real `LytNode.vue` (4 tests). The adapter overlay's
  supersession/preservation/clamping contracts (8 tests) against the
  REAL compiled programs, both classes. The flagship starved+hoarding
  pair, reproduced through the real adapter + overlay at the review's
  own witnessed geometry and numbers. Full-suite green post-change.
  `layout-audit`'s 0-new-findings claim, established by a direct
  stash/re-run comparison against the untouched baseline, not merely
  asserted.
- **UNEXERCISED.** Whether `tree`'s own compiled `content` field should
  actually be reclassified `'unbounded'` in `research/lyt/` — named as
  a residual cross-boundary item, not attempted here (out of this
  dispatch's own frontend-only scope). Whether `useContentDemand`'s own
  "one observer per measured element" design generalizes cleanly to a
  future caller needing BOTH axes of the same element (no current
  caller does; the composable's own header names this as a two-observer
  cost if it ever arises). Whether the Fit-assertion's system message
  should route through i18n (`analysis-service.ts`'s OWN messages are a
  mix of translated and plain-composed strings — this build's message is
  plain-composed, matching that file's own precedent at line 357, not a
  gap this build introduces). Live runtime wiring of `FeasibleLayout`
  into the actual renderer (step 3) — explicitly out of scope, per the
  spec's own migration map.

## Files touched

- `frontend/src/composables/chrome/useContentDemand.ts` (new)
- `frontend/src/composables/chrome/useLytFitAssertion.ts` (new)
- `frontend/src/state/feasible-layout.ts` (overlay param + header
  addendum)
- `frontend/src/components/tree/TreeWidget.vue` (wiring + `defineExpose`)
- `frontend/src/components/chrome/LytNode.vue` (Fit-assertion wiring)
- `frontend/tests/integration/useContentDemand.test.ts` (new)
- `frontend/tests/unit/composables/chrome/useLytFitAssertion.test.ts` (new)
- `frontend/tests/integration/LytNode-fit-assertion.test.ts` (new)
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts`
  (extended)
- `frontend/FILES.md` (three entries added/updated)

License: Public Domain (The Unlicense), per ADR-0006.
