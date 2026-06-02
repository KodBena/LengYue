# Audit — the "green" perf arc, with fresh eyes (2026-05-31)

A principal-engineer post-mortem of `bork/perf/green-integration`, requested
with the explicit brief to be read-mostly, fair, and light-spirited but
unsparing where a practice was avoidably sloppy. Six wins landed across five
branches (four parallel + the post-retrospective TreeWidget decouple). I read
the retrospective, the branch inventory, all five worklogs, the deferred-items
ledger, and the prior render-coupling postmortem end to end before touching
code; then I read the diffs (`48f556b…2ae1506`) and the resulting source.

The headline, stated plainly so the rest can be nuance: **this is good work,
honestly documented, and the bugs it fixed were mostly invisible-until-profiled
rather than negligent.** The two genuinely instructive things are (a) one
anti-pattern that recurred *after the project had already written a postmortem
naming it*, and (b) an analysis-discipline gap (aggregating `render` but not
`patch`) that the arc itself caught and corrected mid-flight. Both are more
interesting than the fixes.

---

## Question 1 — the anti-patterns, with the mitigating circumstances

### A1. One DOM/SVG node per data point in a fixed-size visual

**Where:** `BoardTab.vue`'s analysis-depth rugplot (one `<div class="meter-slice">`
per path move, each with a per-slice i18n `:title` → `t()` + `toLocaleString()`);
`HorizontalTimelineVisualizer.vue`'s data track (one `<linearGradient>` with one
`<stop>` *per turn* + one `<rect>` per segment).

**The cost.** For a ~340-move game this is ~340 vnodes + ~340 i18n
interpolations rebuilt *per render* on `BoardTab`, and ~340 `<stop>` nodes on the
timeline — and because both templates *read the data array*, every 4 Hz analysis
update re-rendered the whole component. BoardTab was the single most expensive
component render in combined-stress (782 ms); the timeline was #2 (304 ms,
3.2 ms/render). The meter is an 86×4 px strip — each slice is ~0.25 px, sub-pixel.
The per-slice DOM granularity and its tooltip bought *nothing*: you cannot hover a
quarter-pixel.

**Fairness.** This is the one place I'll press, gently, because **the project
already knew the answer.** `HeatmapChart` had been rendered on `<canvas>`
precisely because "many tiny cells in a fixed area with no per-cell
layout/interaction is a canvas job, not a DOM job" — the worklogs cite this
reasoning explicitly as the precedent. So the principle existed; it simply hadn't
been *generalized* from "the heatmap" to "the class of data-dense fixed-size
visuals." That is a real (mild) discipline lapse: a known principle left as a
one-off instead of a named rule.

The extenuation is genuine and I'll grant most of it. (1) The rugplot/timeline
were almost certainly correct-and-naive first cuts — `v-for` over the data is the
idiomatic Vue thing, it *worked*, and it reads cleanly. (2) The cost is invisible
without a profiler: at 5 moves it's free, and it degrades smoothly with game
length, so there's no cliff a manual eyeball would catch. (3) The
*template-reads-the-array → re-render-on-every-packet* coupling is the same
silent Vue mechanic the render-coupling postmortem spent 300 lines on — it is
structurally invisible at authoring and typecheck time. So: not negligence, but a
**missed generalization** of a principle the codebase had already paid to learn
once. The fix is exactly right (canvas, `ResizeObserver`-cached dims, draw in a
`watch` off the render path) and the worklogs name the HeatmapChart precedent each
time — which is the project correcting its own under-generalization in real time.

### A2. `v-html` for structured, reactive content

**Where:** `ChartPreviewBox.vue` injected a full board SVG *string* via
`v-html` on every navigation.

**The cost.** `v-html` replaces `innerHTML` wholesale: the entire board subtree
is torn down and reparsed each nav, landing as native `ContentRangeInserted` +
~6.6 ms style recalc per injection (prod marker-stack diagnosis), *outside* any
component-render mark — so it was invisible to render-time aggregation. The fix
routes a `BoardSnapshot` through the reactive `MiniBoard`, which `v-memo`s the
grid on board-size and per-stone, so a nav patches only the one or two stones
that changed (~0.57 ms/render, ~10× cheaper per update).

**Fairness.** Strong extenuation here, and a structural one. The team had
*already* done the hard part: `ChartPreviewBox` was a properly-isolated leaf
taking an **accessor** (`() => string`) — the exact SolidJS-shaped contract the
render-coupling postmortem recommended to dissolve composition-node coupling. So
the read-locality was correct; the residual cost was purely the *string sink* at
the bottom of the accessor. `v-html` for a thumbnail is a reasonable first cut: a
pre-rendered SVG string is the cheapest possible *authoring* move, and the cost
lived in a native recalc bucket that no UserTiming mark surfaced — you had to
`marker stack` a forced-style block to even find it. This is squarely in the "no
one could have known without a profiler, *and* the right diagnostic move (stack
the native block) is non-obvious" category. The SSOT consolidation that came with
the fix (one `board-geometry` module, one `BoardSnapshot` primitive, two
non-drifting projections — string for legacy v-html sinks, reactive `MiniBoard`
for components) is a genuine code-health win beyond the perf: it killed a
two-implementations-of-board-geometry drift risk. Exemplary.

### A3. O(N)-per-frame recomputation forced eager by downstream consumers

**Where:** `useEnrichedData`'s `enriched` was a `computed` doing an
O(path-length) pass (N `ledger.getRaw` reads) — re-run *per frame* during a
packet flood because chart watchers read it eagerly.

**The cost.** Vue reactive `get`/`track` over ~N nodes every frame; the
retrospective initially attributed ~13% of combined-stress reactive cost here.

**Fairness.** This is the *least* culpable of the set and arguably wasn't a
"bug" at all — it's a correct-but-O(N) derivation that only bites under a
sustained high-frequency packet stream, a regime that only exists under streaming
KataGo at full tilt. A `computed` re-deriving from source is the *textbook
correct* Vue idiom; the pathology is purely the interaction of "eager consumer" ×
"high packet rate" × "long game." The fix (a pure `EnrichedAccumulator` with
`patchNode` O(1) incremental + a `rebuild` full path, pinned by a 9-case
`patchNode-sequence ≡ rebuild` equivalence test) is the *most* rigorous deliverable
in the arc and the one I'd hold up as a model: it chose exactness-with-a-testable-
local-invariant (B) over throttle-with-an-unenforceable-global-invariant (A), and
the worklog's reasoning for that choice is exactly the project's type-sanity-first
posture applied correctly. It also did the honest thing and *empirically
de-escalated* a suspected delta-arbitration bug with live-proxy probes rather than
"fixing" a non-bug. No notes.

### A4. Synchronous layout read on the nav hot path (forced reflow)

**Where:** `TreeWidget.vue`'s auto-center watcher read
`scrollLeft`/`clientWidth`/`scrollTop`/`clientHeight` synchronously per nav,
right after its `nextTick` DOM patch had dirtied layout → a forced synchronous
reflow.

**Fairness.** Almost fully exonerated, and the worklog's own honesty is the
reason. Reading geometry to decide "is the active node in view?" is the obvious
implementation; that *reading laid-out geometry while layout is dirty forces a
flush* is exactly the kind of thing only a `marker stack` on a `Reflow (sync)`
block reveals. The fix (`useViewportFollow`: cache scroll from a passive listener,
dims from a `ResizeObserver`, both at layout-clean times) is correct-by-
construction. **And the worklog records a dead end** — an rAF deferral that
*didn't work* (rAF fires at the start of `RefreshDriverTick`, before the style/
layout pass, so the read still forces the flush) — with the measured numbers
showing it landed inside the drift floor. Recording a negative result with its
disproof is precisely ADR-0009 behaviour and is worth more than the fix. The one
fair caveat is that this win was *banked, not measured* (reflow is ~1% of autonav;
maintainer skipped re-capture) — correctly labelled as such, no over-claim.

### A5. The recurrence — render-coupling at a composition node, *again*

This is the sharpest finding, and it's not in my list above because it's
subtler: **the anti-pattern the project had already written a full postmortem
about (`postmortem-render-coupling-at-composition-nodes-2026-05-29.md`) recurred
inside this very arc** — in `TreeWidget`, a component that had *already been
partially hardened against it*.

The story: the active-node ring had already been pulled out of the node `v-for`
into a standalone `<circle v-if="activeRingPos">`, and edges/nodes carry per-item
`v-memo`. Someone had clearly internalized "decouple the high-frequency element."
But the standalone circle was **still bound reactively in the template**, and
`activeRingPos → currentNodeId`. So every nav re-read it and re-ran TreeWidget's
*entire render function* — the full `v-for` over edges + `nodeList`, evaluating
every `v-memo` key for hundreds of nodes. The `v-memo` spared the *patch*
(59.8 ms) but not the *render* (762 ms — the single biggest JS cost in the Chrome
capture). The fix makes the ring fully imperative (`<circle ref>` with `cx/cy/
display` set in a `watch`), so the template reads nothing nav-reactive and
TreeWidget renders only on tree-structure change.

The lesson the prior postmortem missed, made concrete here: **`v-memo` and
"pull the element out of the loop" address the *patch*, not the *render*.** A
reactive *read anywhere in the template* re-runs the whole render function; memo
only short-circuits the subsequent diff. "Render ≫ patch" is the signature. The
postmortem's own recommended structural fix (accessor-passing / imperative
escape) is what finally worked — the arc is, in effect, the postmortem's
Recommendation being applied the second time the bug bit, which is both
vindication of the postmortem *and* evidence that naming a pattern in a doc does
not by itself stop it recurring one component over. That gap — name-without-
enforcement — is the central prevention target in Question 2.

---

## The arc as evidence — the two mid-flight corrections

The retrospective was revised twice, and to its credit it *shows its work* (the
"Correction (post-Chrome-capture)" section and the "revised — the first cut
undersold it" verdict are both preserved inline). Three self-corrections:

1. **The `render`-only aggregation miss.** The analysis had been ranking
   component cost by `render` marks alone; a maintainer Chrome capture exposed
   `<TreeWidget> render` at 762 ms / 24.1% self as the #1 JS cost, which the
   Firefox analysis had *not surfaced as #1* — not because Firefox lacked the
   data (the `patch` marks were present all along, 5,822 of them) but because the
   workflow never aggregated `patch` alongside `render`. The corrective ("pull
   both `render` and `patch`; read render≫patch as render-coupling") is exactly
   right and was folded into the workflow. **This is the most valuable single
   output of the arc** — a durable analysis-method fix worth more than any one
   perf win. That it took a second tool (Chrome) to expose a number the first
   tool (Firefox) had all along is the uncomfortable part: the gap was in the
   *analyst's aggregation*, not the instrument, and it's honest that the doc says
   so.

2. **The "TreeWidget is low-ROI diffuse remainder" misjudgment.** The first-draft
   retrospective relegated TreeWidget to a "diffuse/lower-ROI remainder," and the
   Chrome capture proved that was the #1 lever. Caught and reversed. Good — but
   it's a reminder that prose verdicts ("diffuse remainder") written *ahead* of
   the capture are exactly the unsubstantiated closed-vocabulary claims ADR-0009
   exists to forbid; the discipline caught it, but only after it had been
   written.

3. **The 13% reactive-cost over-attribution / the machine-drift misread.** The
   retrospective tempers its own earlier framing (the incremental-projection cost
   share, and a "machine drift" misread of cross-run numbers). This is the
   `feedback-perf-counts-not-crossrun-wallclock` lesson biting in practice:
   absolute cross-run numbers confounded by environment drift, corrected toward
   counts/relative-within-run.

**Were they handled well once caught?** Yes — unambiguously. Every correction is
preserved *in situ* (not silently overwritten), each names what was wrong and why,
and the method fix (#1) was generalized into the workflow rather than applied
once. That is the ADR-0009 posture working as designed. The fair criticism is not
about the handling but about the *timing*: the verdicts and rankings were authored
before the substantiating capture in two of three cases, which is the precise
posture ADR-0009 was written to prevent. The discipline is reactive (post-ship,
post-claim) and it shows; see Question 2 for the preventive lever.

One more piece of evidence worth naming: **most of the arc's validations are
"pending capture."** BoardTab, timeline, ChartPreviewBox-v-html, TreeWidget-render
all carry "Validation (pending [re-]capture)" or "Expected" sections rather than
measured after-numbers, except where a specific capture is cited
(`after_rug_fix.json.gz`, `green_checkpoint_1`). The combined `green_checkpoint_1`
does substantiate the two big ones (BoardTab 782→0; timeline 304→13.5 ms). This is
acceptable — the maintainer gates on felt QA and the structural fixes are
correct-by-construction — but it means the arc's claims rest partly on
expected-by-mechanism rather than measured, which the docs are honest about.

---

## Question 2 — prevention, ranked

### (a) Architectural principles to encode

**P1 (highest leverage) — Codify "data-dense fixed-size visuals are canvas, not
DOM" as a named rule, and "reactive nav/packet reads belong in leaves, not
composition nodes" as its sibling.** The project has *paid to learn both twice*
(HeatmapChart→rugplot→timeline for the first; Arc 2 / RB-1 / now TreeWidget for
the second) and written a postmortem on the second — yet both recurred. The
single highest-leverage act is not more profiling; it's promoting these from
"a precedent the worklogs cite" to a **named tenet** the author reaches for at
authoring time and a reviewer checks against. This is exactly Recommendation 1 of
the render-coupling postmortem (the candidate ADR-0010 / a `frontend/CLAUDE.md`
section), still un-adopted — the recurrence in *this* arc is the strongest
possible argument that the name needs to exist. Concretely, two rules:
  - *Canvas rule:* a fixed-size visual whose element count scales with data and
    that has no per-element layout/hit-test is a `<canvas>` job. Threshold for
    the question: "does this `v-for` produce sub-pixel or non-interactive
    elements at realistic data sizes?"
  - *Read-locality rule:* a component reads a high-frequency reactive value only
    if its *own job is to display it*. Orchestration/chrome/composition nodes read
    structural/low-frequency state and let leaves self-source (accessor `() => T`
    at the boundary, or imperative escape via a `ref` + `watch`). **Corollary the
    postmortem under-stated and this arc proves:** *`v-memo` and "pull the element
    out of the loop" fix the patch, not the render. A reactive read anywhere in a
    template re-runs the whole render. Render≫patch is the tell.* This corollary
    belongs in the tenet verbatim — it's the exact trap TreeWidget fell into.

**P2 — Generalize the imperative-escape idiom as a sanctioned pattern, not a
"trick."** The worklogs repeatedly call it "the same trick as the canvas
rug-plots." It's used four times in this arc (BoardTab, timeline, TreeWidget ring,
the `ResizeObserver`-cached-dims pattern). When a thing is used four times it's a
pattern, and a pattern deserves a one-paragraph home (a `useImperativeDraw` /
`useOffRenderPath` note or a `frontend/CLAUDE.md` paragraph) naming the shape
(static element/canvas in template + `watch`-driven imperative update + RO-cached
geometry + `onUnmounted` release), so the next author reaches for it deliberately
instead of re-deriving it. Tie-in: this composes with the resource-ownership-at-
mutation-sites discipline (every one of these registers an observer/listener that
*must* be released in `onUnmounted` — BoardTab does, correctly).

### (b) Coding-discipline / CI reinforcements

**P3 (concrete, buildable now) — There is no ESLint in the frontend at all.**
I checked: no `.eslintrc*`, no `eslint.config*`, no `lint` script in
`package.json`. The strict `vue-tsc` is the only static gate. That means *zero*
of the lightweight heuristics the render-coupling postmortem floated (flag
template/computed reads of a curated high-frequency source set inside
orchestrator-tagged components) can exist, because there's no lint host to carry
them. Standing up a minimal flat-config ESLint with `eslint-plugin-vue` is the
enabling move; even before any custom rule, `vue/no-v-html` (built in) would have
*flagged the ChartPreviewBox `v-html`* and `vue/require-v-for-key` /
template-complexity rules give a foothold. This is the single most concrete,
ship-now reinforcement. Rank it just below the tenet because the tenet is what the
lint would encode.

**P4 — A render-count assertion harness in the test tree.** The codebase already
has the seam: UserTiming `<Component> render`/`patch` marks exist (that's how the
profiling works), and Tier-3 integration tests drive composables against fakes.
A small utility that mounts a component, fires N synthetic nav/packet events, and
asserts `renderCount ≤ k` (via a spy on the render function or a
`performance.getEntriesByName` count) would convert "render-coupling" from a
profile-only finding into a *test-catchable* one. This is the preventive analog
of ADR-0009's reactive net: ADR-0009 catches it post-ship with a profile; a
render-count test catches the regression in CI. Start with the four components
this arc just fixed (TreeWidget, BoardTab, timeline, ChartPreviewBox) as
regression guards — they have known-good post-fix render counts (TreeWidget:
structure-change-only; BoardTab: label/active-change-only).

**P5 — Make ADR-0009 gate "rank by render *and* patch" explicitly.** The single
most valuable correction of this arc (the `render`-only aggregation miss) should
be written into ADR-0009's method, not left in a retrospective's correction
section where the next investigator may not see it. One sentence: *component-cost
ranking aggregates both `render` and `patch` marks; render≫patch is read as
render-coupling.* Cheap, durable, and it closes the exact gap that hid the #1 cost
for most of the arc.

### (c) Highest-priority remaining refactor targets, ranked

Per the retrospective's "remaining levers" and the deferred-items ledger:

1. **MiniBoard / preview subtree (the robust top lever).** The retrospective
   names this as the lever that's #1 across *both* captures (`ChartPreviewBox
   patch` ~865 ms Firefox / 604 ms Chrome), and `MiniBoard` is now the top
   *component* render (386 ms, 683 renders ≈ 32/s) — "it smells like residual
   per-packet preview coupling." This is the natural next fix and it's the same
   read-locality question one level down: is the preview re-rendering per *packet*
   when it only needs to re-render per *hover/nav target change*? First diagnostic
   move per P5: confirm whether MiniBoard's render count tracks packets or
   navigations. Highest priority; B3.

2. **The "collapsed charts still process packets" bug (deferred-items).** This is
   the highest-*value* item in the ledger and it's a correctness-shaped perf bug,
   not a micro-optimization: a rolled-up chart panel uses `v-show`
   (`display:none`), stays *mounted*, and runs ECharts `setOption` on every packet
   (~250 ms of patch work while "off" in the hidden-charts capture). The fix
   (unmount via `v-if`, or gate the `BaseChart` `series`→`setOption` watch on
   `expanded`) is well-scoped and the maintainer's call is recorded ("unmount
   unless there's a real reason not to"). This is arguably *higher* user-value than
   #1 because it's pure waste — a disabled feature costing 250 ms/packet — and it
   ties to a wanted Settings → Analysis Layout affordance. I'd rank it 1b,
   co-equal with MiniBoard.

3. **`useStabilityMetrics` — the same O(N)/frame computed shape the incremental-
   projection fix just solved next door.** The incremental-projection worklog
   explicitly names it: `useStabilityMetrics` reads `stabilityTrajectoryStore`
   (same per-key version refs + coalesced flush) with the identical O(N)-per-frame
   pathology, "the same treatment applies and is the next step." A
   ready-to-apply `EnrichedAccumulator`-shaped fix with a template already proven.
   Medium priority, low risk (the pattern and its equivalence-test discipline are
   established).

4. **The container-query recompute tax (deferred-items).** De-CQ the responsive
   preview-hide: `AnalysisChartPanel`'s `container-type: inline-size` makes every
   ECharts-font-forced style flush re-evaluate the `@container` query (907
   `UpdateContainerQueryStyles` / ~186 ms in `x1.json.gz` ≈ 2%). The
   `ResizeObserver`-driven `.narrow`-class toggle reproduces the behavior exactly.
   **Correctly self-flagged as low priority** (the entry applies the reflow-arc
   lesson to its own magnitude — 2%, and only removes the CQ portion of each
   flush). Low priority; do it when touching that file, not before.

5. **The native `RefreshDriverTick` floor (~82% of wall under maximal load).**
   The retrospective's honest conclusion: combined-stress jank is native style/
   layout/paint-bound, not JS-bound, and *this arc barely moved it* (6.7/s
   LongTasks vs pre-arc 6.3/s). This is the real ceiling and it's a different
   class of work (DOM/paint complexity reduction — fewer nodes, simpler layout,
   `content-visibility`, containment), not a JS micro-opt. **Lowest priority for
   now and correctly so:** it's the sustained-maximal-load frame ceiling, *not*
   per-interaction latency, and the retrospective is right that the latter is what
   users feel. Naming it as the eventual ceiling is the right move; chasing it
   before the per-interaction levers above would be misallocated effort.

---

## If you do only three things

**(1) Promote the two recurring patterns to a named tenet** (the canvas rule +
the read-locality rule, *with the "render≫patch: memo fixes the patch, not the
render" corollary written in verbatim*) — this arc is the proof that a postmortem
which only *describes* a pattern doesn't stop it recurring one component over.
**(2) Stand up a minimal ESLint** (there is none today) so `vue/no-v-html` and a
future high-frequency-read heuristic have a host — the cheapest static gate that
would have flagged real defects this arc fixed by hand. **(3) Fix the two
highest-value remaining levers** — the MiniBoard per-packet preview coupling and
the `v-show`-keeps-charts-mounted-and-running-`setOption` waste — and write
ADR-0009's "rank by render *and* patch" sentence while you're in there, since
that one-line method fix was the most valuable thing the arc discovered and it's
currently stranded in a retrospective's correction note. The fixes here were sound
and the documentation is a model of honesty; the gap is purely that the project's
hard-won lessons live in prose that the next keystroke doesn't have to consult.

License: Public Domain (The Unlicense).
