# two-col-class-closure-build

ADR-0000 Rule 2(a) closure for the defect-(e) guard (ledger rows 2564/2565).
The prior fix (`statusbar-cards-completion-build`) ANDed a container-measured
guard onto `ForestDirectory.vue`'s `props.twoColumnReflow`; the commissioner
ruled that insufficient because the wrong-currency signal (a viewport-derived
boolean) stayed representable at the seam — any future consumer could wire
`getPanelContentPolicy(...).twoColumnReflow` to a new column-split decision
and re-mint the exact bug. This build removes the signal from the seam
entirely rather than guarding around it.

## Base

Started on local `next` tip `fa12e353` (confirmed via `git rev-parse HEAD`
after merging into the worktree, whose prior HEAD was `dc8e3b12`, stale).
Mid-session `next` advanced to `403128fa` (`docs(reports): LytNode
recursive-update crash (row 2562) — investigation, STALL disposition`) — a
docs-only commit (confirmed via `git diff --stat fa12e353 403128fa --
frontend/src frontend/tests`: no output, zero source/test changes). Merged
cleanly (only added dispatch-report markdown/PNGs and `frontend/scratch-shot.mjs`,
which is exactly the Playwright driver this build's mandate calls for
recovering — no conflict, nothing to re-gate). Final HEAD before this
report's commit: `bb4edc9d` (merge of `403128fa`).

## Consumer universe (grep evidence)

```
grep -rn "twoColumnReflow" src/ tests/ --include="*.ts" --include="*.vue"
```

Found exactly two live consumers of the prop, matching (not merely trusting)
the prior review's claim:

- `src/components/tree/ForestDirectory.vue` — `defineProps<{
  twoColumnReflow?: boolean }>()`, ANDed with a container-measured guard
  (`effectiveTwoColumnReflow`).
- `src/components/library/LibraryTab.vue` — `defineProps<{ twoColumnReflow?:
  boolean }>()`, gating a `panel-content-two-col` class directly (no guard).

One producer:

- `src/App.vue` — `panelContentPolicy = computed(() =>
  getPanelContentPolicy(layoutClass.value))`, threading
  `panelContentPolicy.twoColumnReflow` to both consumers as the
  `:two-column-reflow` prop. `layoutClass` is the WHOLE-WORKSPACE viewport
  width/axis class (`useDeferredLayoutClass`), the wrong currency for a
  per-panel decision.

One shared machinery module:

- `src/state/layout-model.ts` — `PanelContentPolicy` (interface),
  `SINGLE_COLUMN_PANEL_CONTENT_POLICY` / `TWO_COLUMN_PANEL_CONTENT_POLICY`,
  `PANEL_CONTENT_POLICY_BY_WIDTH_CLASS`, `getPanelContentPolicy`. Checked
  whether `readingMeasureCh` (the interface's OTHER field) had any consumer
  reading it off the policy object (`grep -n "readingMeasureCh\b" src/
  tests/`): none — both former consumers import
  `PANEL_CONTENT_READING_MEASURE_CH` directly. So nothing legitimately
  viewport-scoped survives in this module that needs a replacement export;
  the whole `PanelContentPolicy` machinery is dead once `twoColumnReflow` is
  removed, and is deleted rather than left as an unused, re-mintable seam.

No sibling viewport-width-class signal feeding a *different* per-panel
column-split decision was found:
`grep -rn "panelContentPolicy\|PanelContentPolicy\|PANEL_CONTENT_POLICY_BY_WIDTH_CLASS"
src/ tests/` returned only the same three files above (plus their own test
files). `grep -rn "panel-content-two-col" src/ tests/` surfaced one more
file, `src/components/CardMetadataPanel.vue`, which only *documents* the
class in a comment and consumes no viewport signal — not a fourth consumer.

## Per-consumer disposition

**`ForestDirectory.vue` — prop deleted; guard collapses to single input.**
`defineProps<{ twoColumnReflow?: boolean }>()` is removed entirely.
`effectiveTwoColumnReflow` reduces from
`(props.twoColumnReflow ?? false) && !treePanelTooNarrowForTwoCol.value` to
`!treePanelTooNarrowForTwoCol.value` — the `useDeferredContainerBreakpoint(
FOREST_TREE_TWO_COL_THRESHOLD_PX)` mechanism (mid-drag-flip-avoidance,
identical to the pre-existing `forestNarrow` sibling) is now the ONLY input.
The ancestor-intent operand is gone, not defaulted to `true`/`false` — the
wrong currency is unrepresentable at this seam because there is no seam
left for it to enter through.

**`LibraryTab.vue` — prop deleted; cap made unconditional, no guard added.**
This consumer's `twoColumnReflow` gated a MAX-WIDTH CEILING on
`.library-split` (`max-width: calc(2 * 60ch)`), never a forced column split:
`.library-split`'s `grid-template-columns: 3fr 2fr` is unconditional in the
component's own CSS, and the tab's actual narrow/wide reorg has always been
a separate, already self-measuring `@container (max-width: 700px)` query on
`.library-tab` — untouched by any of this. A max-width ceiling can never
reproduce defect (e)'s squeeze: capping an already-narrower-than-the-cap
split is a no-op, so mirroring ForestDirectory's container-measured guard
here would be a guard against a defect class that cannot occur on this
consumer's own CSS shape — the 2026-07-22 "name the consumer" anecdote in
ADR-0000 names exactly this failure mode (ritual guarding with no defect to
catch). The cap is applied UNCONDITIONALLY on the base `.library-split` rule
instead: no prop, no gating class, no width signal of any kind, viewport or
container. `librarySplitMaxWidthCss` (the `v-bind`-sourced `ch` figure) is
unchanged; only its consumption site moved from a gated selector to the
base rule.

**`App.vue` — producer deleted.** `panelContentPolicy` computed and its
`getPanelContentPolicy` import are removed; the two `:two-column-reflow="..."`
template bindings are removed (both components now take zero relevant props
from App.vue for this concern).

**`layout-model.ts` — dead machinery deleted, not left dangling.**
`PanelContentPolicy`, `SINGLE_COLUMN_PANEL_CONTENT_POLICY`,
`TWO_COLUMN_PANEL_CONTENT_POLICY`, `PANEL_CONTENT_POLICY_BY_WIDTH_CLASS`,
`getPanelContentPolicy` are all deleted. `PANEL_CONTENT_READING_MEASURE_CH`
(the reading-measure constant both consumers import directly) is untouched
— it was never the wrong-currency fact, only bundled alongside it in the
now-deleted interface. `FOREST_TREE_TWO_COL_THRESHOLD_PX` and its SSOT
derivation (`computeForestNarrowThresholdPx(FOREST_TREE_USABLE_FLOOR_PX,
FOREST_TREE_USABLE_FLOOR_PX)`, reusing the same region-floor helper
`FOREST_NARROW_THRESHOLD_PX` already uses) are untouched — the denomination
was already correct; only the AND-operand was wrong.

**No fourth consumer, no "genuinely viewport-scoped" tension found.**
`CardMetadataPanel.vue`'s one hit is a comment cross-reference, not a
consumer; no other per-panel column-split decision anywhere in the tree
reads `layoutClass`/`panelContentPolicy`. Nothing here triggered the
Rule-4 stop-and-report escape (a consumer where viewport currency is
arguably right) — both real consumers' correct currency is their OWN
measured container width (ForestDirectory) or no width signal at all
(LibraryTab).

## Closure statement (ADR-0000 Rule 2(a), 2026-07-02 amendment)

**Invariant.** No column-split (or column-split-adjacent max-width-ceiling)
decision reads a currency other than the deciding panel's own measured
width — and where the decision needs no width signal at all to be correct
(a ceiling that only ever shrinks toward a fixed measure), it reads no
width signal, rather than a viewport one "because it was already there."

**Quantification universe.**
- *Axis*: width (viewport vs. container) — the only axis in play; no
  count/magnitude/time/encoding/ordering/concurrency axis was found feeding
  either decision.
- *Sibling surfaces*: every consumer of `getPanelContentPolicy` /
  `panelContentPolicy` / `twoColumnReflow` in the tree (enumerated above,
  by grep, not by trusting the prior review) — ForestDirectory.vue and
  LibraryTab.vue, both migrated. No sibling code path, sibling component,
  or sibling config field was found reading the same viewport-currency
  fact for a column-split decision.
- *Named-not-covered*: none. Every consumer found was either migrated to
  its own container measurement (ForestDirectory) or had its viewport
  dependency deleted outright because no width signal was needed
  (LibraryTab) — nothing is deferred.

**Denomination check.** `FOREST_TREE_TWO_COL_THRESHOLD_PX` is derived from
`FOREST_TREE_USABLE_FLOOR_PX` (the same "renders unintelligibly below this"
content floor `FOREST_NARROW_THRESHOLD_PX` already uses) via
`computeForestNarrowThresholdPx` — no bare literal, same SSOT as before
this build (untouched). `PANEL_CONTENT_READING_MEASURE_CH` (60ch) is the
SSOT for LibraryTab's ceiling, consumed via the same `v-bind`-sourced
`librarySplitMaxWidthCss` computed as before — no second hand-typed `ch`
literal introduced.

## Tests

- `tests/integration/forest-directory-two-col-narrow-guard.test.ts` —
  rewritten. The AND-shape's third test ("never applies when the ancestor
  says narrow, regardless of measured width") is deleted — the ancestor
  operand it pinned no longer exists. The remaining two tests pin the new,
  honest single-input invariant: `.panel-content-two-col` applies IFF
  `.tree-panel`'s own measured width is at/above
  `FOREST_TREE_TWO_COL_THRESHOLD_PX`; no `props` object is passed to
  `mount()` at all (the prop is gone).
- `tests/integration/panel-content-two-col-reflow.test.ts` — deleted. Its
  entire premise (component-level coverage of the `twoColumnReflow` PROP for
  both consumers) is retired along with the prop; ForestDirectory's
  container-measured invariant is now covered in full by the narrow-guard
  test above, and LibraryTab's unconditional CSS ceiling has no
  class-application branch left to assert in jsdom (see "Honest not-done"
  below).
- `tests/unit/state/layout-model.test.ts` — the `getPanelContentPolicy` /
  `PANEL_CONTENT_POLICY_BY_WIDTH_CLASS` describe block (4 tests) is deleted
  along with the exports it pinned; a HISTORICAL comment in its place
  points at the closure. Dead imports (`getPanelContentPolicy`,
  `PANEL_CONTENT_POLICY_BY_WIDTH_CLASS`, `PANEL_CONTENT_READING_MEASURE_CH`
  — the last only used by the deleted block) removed from the import list.
  `FOREST_TREE_TWO_COL_THRESHOLD_PX`'s own describe block (3 tests,
  including the exact 383px/399px live-witnessed numbers) is untouched.
- Two unrelated test files (`tests/integration/library/
  LibraryPreviewDensity.test.ts`, `tests/integration/LibraryTab-open-path.test.ts`)
  had a stale comment cross-reference to the now-deleted
  `panel-content-two-col-reflow.test.ts`; both updated to point at
  `LibraryTable-column-fit.test.ts` / `tests/CLAUDE.md` respectively instead
  of a dangling filename.

## Live re-witness

Environment: isolated backend (`/home/bork/scratchpad/venv/bin/python
backend/main.py`, `DATABASE_URI=sqlite+aiosqlite:///<scratch>/isolated.db`,
`HOST=127.0.0.1 PORT=19864`, `SECRET_KEY_FILE=<scratch>/.jwt_secret`, fresh
per this session) + `cd frontend && npx vite --port 19273 --strictPort
--host 0.0.0.0` + `frontend/.env.local` (`VITE_API_BASE_URL=http://127.0.0.1:19864`,
gitignored, removed after the session) + `frontend/scratch-shot.mjs`
recovered per the mandate (`git show b289ec32:frontend/scratch-shot.mjs`,
already present in the tree from the `403128fa` merge). Never touched
`192.168.122.1:8764`. A fresh user (`witness2col`) and a fresh card
(`POST /cards/`, a 3-move SGF root) were minted via the backend REST API
directly rather than through UI click choreography for SGF-load/mint —
orthogonal setup, not the layout mechanism under test; the actual
rendering, measurement, and class-application below all ran through the
real DOM/CSS/ResizeObserver pipeline in a real headless Chromium.

**Defect (e) scenario — re-witnessed, still closed, now via the
single-input guard alone.** Booted fresh, navigated Cards → Browse,
selected the one game row (auto-rendered its one-root tree), clicked the
rendered SVG node (ECharts `renderer: 'svg'` — the tree draws `<path>`
symbols, not `<canvas>`). Measured via `getBoundingClientRect()`
before/after, not eyeballed:

- `.tree-panel` measured **383px** wide — the exact live-witnessed number
  from the original defect-(e) report, reproduced independently in this
  session (the Cards surface still shares the split layout's right column
  with the goban).
- `.forest-container`'s className after the click: `"forest-container"` —
  `panel-content-two-col` correctly ABSENT, because 383px <
  `FOREST_TREE_TWO_COL_THRESHOLD_PX` (399px), and the guard now fires from
  this measurement ALONE (no ancestor prop exists to override or confirm
  it).
- `.chart-wrapper` measured **383px × 677px** after the click — full
  panel width, NOT squeezed to a sliver. `.card-metadata-panel` mounted at
  383px × 216px, STACKED below the chart (CSS's un-gated default), exactly
  the intended non-two-col layout.
- Screenshot: `.claude/dispatch-reports/two-col-class-closure-e-witness-1920.png`.

Attempted to also live-witness the "legitimate two-col case stays intact"
branch (`.tree-panel` measured AT/ABOVE the threshold) by widening the
viewport to 2560×1200 and by writing
`store.session.ui.treeControlRegionWidthPx = 1400` directly: `.tree-panel`
stayed at exactly 383px in both attempts. The live-solved side-column width
in this default (never-dragged) session resolves through the LYT compiler
pipeline (`resolveSideColumnLiveLayout` / `rootSplitLayout` in App.vue), not
through a direct read of that store field, and no user-facing drag
affordance was scripted in this session to move it. This branch is
therefore verified ONLY by the automated integration test
(`forest-directory-two-col-narrow-guard.test.ts`'s second case, a
controlled `FakeResizeObserver` width above threshold) — disclosed
honestly rather than claimed live-witnessed.

**LibraryTab narrow/wide behavior — witnessed unchanged.** Booted fresh,
switched to the Library tab. `.library-tab` measured 663px (same
control-panel-width constraint as Cards); `.library-split`'s
`getComputedStyle(...).gridTemplateColumns` read `"639px"` (single
column — the pre-existing, untouched `@container (max-width: 700px)` query
correctly fired since 663px < 700px) and `.maxWidth` read `"667.383px"`
(the new unconditional cap, PRESENT in computed style and correctly INERT
at 639px < 667px — no visual change, no regression). Repeated at
2560×1200 with the same `treeControlRegionWidthPx` override attempt: same
663px/639px/667.383px readings — confirming the cap's unconditional
presence doesn't depend on viewport size, and (same LYT-compiler caveat as
above) this session did not manage to live-drive `.library-tab` past 700px
to observe the two-column `@container` branch — that branch is CSS-only
(no JS class binding gates it, before or after this build) and was not
touched by this change. Screenshots:
`.claude/dispatch-reports/two-col-class-closure-library-narrow-1920.png`.

No LytNode crash fired at any point across roughly a dozen fresh page
loads/reloads in this session (fresh sqlite each backend start, per the
mandate's warning) — consistent with the concurrent LytNode-crash
investigation's own finding that the crash requires a *persisted*
`activeTab: 'settings'` document, which this session's fresh-user boots
never carried.

## Gates (synchronous, foreground, outputs read)

- `npx vue-tsc -b --noEmit` — clean, no output, exit 0.
- `npx vitest run` — `Test Files 292 passed | 3 skipped (295)`,
  `Tests 3569 passed | 8 skipped (3577)`, exit 0. Run twice in this
  session (once before the `403128fa` merge, once after, since the merge
  touched no `src/`/`tests/` file — confirmed by `git diff --stat`); both
  green with identical counts.
- `npm run build` (`vue-tsc -b && vite build`) — `✓ 1274 modules
  transformed`, `✓ built in ~2s`, exit 0. The chunk-size warning
  (`index-*.js` 3.2MB) is pre-existing and unrelated to this change.
  `dist/` removed after the build per the host's tight disk budget (6.4G
  free at session start).

## Honest not-done list

- The "legitimate two-col case, live" and "LibraryTab wide/two-column
  `@container` branch, live" scenarios are NOT live-witnessed — both are
  gated behind a live-solved side-column width this session could not
  drive past ~663-680px without scripting an actual resizer-drag gesture
  (out of this closure's scope; the LYT compiler pipeline that solves that
  width is untouched by this change). Both are covered by the existing
  automated test suite instead (disclosed per-scenario above), which is
  sufficient to pin the logic but is not the same evidentiary weight as a
  live pixel measurement.
- No new ADR or FEATURES.md entry: this is a pure internal-mechanism
  refactor (removes an internal prop/computed chain, no user-facing
  capability added, removed, or altered) — per the umbrella CLAUDE.md's
  FEATURES.md bar, out of scope. `frontend/FILES.md` unaffected (no file
  created, moved, or deleted; `layout-model.ts`, `App.vue`,
  `ForestDirectory.vue`, `LibraryTab.vue` all keep their existing entries
  and bands).
- `frontend/scratch-shot.mjs` is already tracked, committed on `next` as
  part of the merged `403128fa` (the LytNode investigation banked it there
  per its own report) — no separate action needed here; this build only
  used it, it did not add or move it.
