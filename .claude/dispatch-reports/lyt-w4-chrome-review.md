# W4 — chrome finishing pass (independent review)

Reviewer posture: REFUTE, fresh context, executed everything personally (no
sub-delegation). Target: worktree `/home/bork/w/omega/.claude/worktrees/agent-a4228b6ed3fec5360`,
branch `worktree-agent-a4228b6ed3fec5360`, commit `ff085762` (docs commit on
top of the actual build commit `50d1b289`). Build report:
`.claude/dispatch-reports/lyt-w4-chrome-build.md`.

## Base freshness

`git merge-base HEAD da324ca6` = `da324ca6c408af65de80d767ac087128033ade59`
— matches the build report's claimed delivery-time merge-base exactly, and
`50d1b289^` is literally `da324ca6`. The W4 diff proper is `50d1b289^..50d1b289`
(24 files, +1306/-377); `ff085762` is a docs-only commit (the build report
file) on top. Verified directly, not taken on the report's word.

## Verdict: **ACCEPT-WITH-NOTES**

Items 1–5 are solid: independently re-run gates all green, independently
re-probed live-app behavior (a superset of the builder's own probe, at all
four mandated sizes plus two the builder didn't cover) confirms the overlay
stratum, popover z-index ladder, toolbar structural fixes, and MiniBoard
clamp all hold. Item 6 (floor softening) is **not fully safe as shipped**:
the disclosed, unswept 280px side-column floor is a real defect, not merely
an "unmeasured but probably fine" gap — see below for the measured true
floor and the mechanism. This is scoped and fixable (raise one `min`
literal); it does not implicate items 1–5 or the overall skeleton
architecture, hence ACCEPT-WITH-NOTES rather than REJECT — but it should
not be treated as closed until the floor is corrected or the SETUP palette's
reservation is revisited.

## Gates (run personally, foreground, literal exit codes)

| Gate | Command | Result |
|---|---|---|
| Vitest | `npx vitest run` | **exit 0** — 3025 passed, 8 skipped, 240 files (matches build report) |
| Typecheck | `npx vue-tsc -b` | **exit 0** |
| Build | `npm run build` | **exit 0** |
| research/lyt pytest | `pytest tests/ -q` (via a `lytvenv` with `ortools` installed — the default environment lacks it) | **exit 0** — 120 passed |

Bonus: `npx eslint` scoped to every file this pass touched — 0 errors (1
pre-existing "no config" warning on `theme.css`, irrelevant).

## Per-item witnesses

**1. Overlay stratum.** Re-probed live (dead-port isolation, see below) at
all four mandated sizes (1920×1080, 1280×1024, 1024×700, portrait
1080×1920), each with the save-error banner AND the system-log panel, each
also re-checked with `boardRail` forced on (adversarial: does the rail's
own presence change anything about overlay non-interference — it doesn't).
24/24 rect-stability assertions pass (`#board-square`/`#split-workspace`/
toolbar-strip byte-identical rects before/during), 8/8 non-intersection
assertions pass, banner-element opacity confirmed non-transparent at every
size (corrected my own first-draft probe bug: `#lyt-overlay-stack` itself
is a transparent flex *positioning* wrapper — App.vue's own comments say
so — the opaque claim is per-child, not per-wrapper; verified against the
actual child element instead). Transient auto-reveal confirmed still
firing and correctly outranking chrome popovers by design
(`--z-chrome-overlay` 2000 > `--z-popover-chrome` 1000) — this actually
tripped up my *first* popover-occlusion probe run (false failures) until I
adopted the builder's own 8.3s drain-and-clear discipline; once adopted,
clean.

**2. Toolbar.** `ToolbarSliderPopover.vue`/`EngineQueueTooltip.vue`'s
concatenated-text bugs: read the actual diffs — both now declare their own
`.metric`-equivalent layout rule locally rather than borrowing a
scoped-style class from `ToolbarEngineMetrics.vue`; source-verified, and
`.sliders-trigger` renders as a real `<button>`. SLIDERS/QUEUE popovers
open correctly with proper gap/spacing in the live probe.

Load/Save SGF "one home": grepped the whole `src/` tree, not just
`chrome/`. Initial grep of `Toolbar.vue` found *zero* SGF references,
which looked like a regression (the report claims "the toolbar strip" is
the one home) — traced further and found the actual mount site is
`App.vue`'s own `#leaf-A_go` (landscape) / `#leaf-A_top` (portrait) leaf
templates, each rendering the same two `sidebar.loadSgf`/`sidebar.saveSgf`-
keyed buttons directly beside the `<Toolbar>` mount, with an explicit
disclosed comment naming the migration from `SidebarWidget.vue`. The two
occurrences are mutually exclusive by screen class (only one LYT tree
mounts at a time), so this genuinely is one home per class, not a
duplicate — confirmed, not a bug.

**Found (not in the build report): a stale dependent file.**
`BoardRailPopoverTrigger.vue` (the `railStyle==='popover'` fork, W2-authored,
untouched substantively by this diff) mounts its own `SidebarWidget`
instance and still wires `@load-sgf="$emit('load-sgf')"` /
`@save-sgf="$emit('save-sgf')"` on it, and its own header comment claims
"both copies of the affordance stay live." Since `SidebarWidget.vue` no
longer has a `defineEmits` at all (verified: empty grep) and no longer
renders any SGF button markup, this listener chain is now provably dead —
opening the rail-as-popover shows no SGF buttons inside it at all (live-
verified: `.board-rail-popover`'s innerHTML contains neither `lyt-sgf-btn`
nor "Load SGF" text). This is **not a functional regression** — the
toolbar-strip copy is still reachable regardless of `railStyle`, so the
capability itself is not lost, and "ONE home" is arguably *more* true now
than intended — but `BoardRailPopoverTrigger.vue`'s own header comment is
now an inaccurate claim about live behavior, and the dead
`@load-sgf`/`@save-sgf` forwarding in both that file and `App.vue`'s own
corner-chrome mount (`@load-sgf="openFileDialog" @save-sgf="downloadActiveBoard"`
on `<BoardRailPopoverTrigger>`) is dead code nobody flagged. MINOR:
worth a follow-up cleanup pass (drop the dead emit-forwarding, correct the
header comment), not blocking.

**3. Z-index.** theme.css ladder verified coherent:
`--z-popover: 10` < `--z-affordance: 50` < `--z-popover-chrome: 1000` <
`--z-chrome-overlay: 2000` < `--z-modal: 9999` < `--z-overlay: 99999`.
Grepped every touched chrome file for raw `z-index:` literals — all seven
sites the build report names now use `var(--z-popover-chrome)`, each with
an explanatory comment; the two remaining raw literals in `App.vue`
(`z-index: 900` on `#lyt-corner-chrome`, `z-index: 10` on `.lyt-resizer`)
are confirmed **not touched by this diff** (pre-existing from W2/W3), so
"no raw literals left in files this pass touched" holds. Live-probed
presence menu, DEBUG menu, and SLIDERS popover (click/hover as
appropriate) at 1920×1080 — `elementFromPoint` at each popover's own
center resolves inside it in all three cases. Also live-probed the
board-rail popover (`railStyle='popover'` fork) the same way — passes.
PBO popover (`.pbo-metric`, `v-if="visible"`) was not reachable live
without driving a full qEUBO session — verified statically instead
(`PboPopover.vue:188` already uses `var(--z-popover-chrome)`, confirmed in
the earlier grep sweep), consistent with the brief's own "if reachable"
qualifier.

**4. MiniBoard.** Live-probed at all four mandated sizes, each with
`boardRail` also forced on (adversarial: the review brief's "try to force
it off-screen adversarially" — narrowing the viewport while also
consuming rail width): previewBoard stays within-viewport (X and Y),
square (±2px), and nonzero at every one of the 4×1 = 4 combinations
tested (16 assertions, all pass). Could not force it off-screen or
non-square in any of the attempted adversarial configurations.

**5. Debug menu.** Dev build: `.debug-pill` present, live-probed opens a
popover with the four affordances (source-verified against
`Toolbar.vue`/`SidebarWidget.vue` — both no longer import the relocated
composables/handlers). Production build: built `dist/` myself and grepped
the bundle. The `.debug-pill` CSS class string, "Popover Stress" label
text, and `clearCache`-named logic (19 hits — shared with other,
legitimately-shipped cache-clearing call sites, not debug-menu-exclusive)
are present in the compiled JS — confirming the build report's own
disclosed finding that Vite's minifier does not eliminate the `v-if`
branch's compiled code, only its runtime rendering. The report's own
framing ("never renders in prod, does ship in the bundle, pre-existing
characteristic not introduced by this pass") is accurate as stated; I did
not independently verify the "pre-existing" claim against `lyt-phase2`'s
prior `Toolbar.vue` clearCache comment, but the mechanism (Vue SFC
compilation not being traced through by Vite's dead-code elimination) is a
well-known, plausible limitation and not specific to this diff.

**6. Floor softening — the substantive finding.**

Re-solved the CP-SAT compiler myself (not the build report's assertion):
`pytest tests/test_lyt.py` includes
`test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes` and
`test_landscape_side_column_track_carries_the_board_priority_clamp` /
`test_tree_panels_t_node_track_carries_its_derived_floor`, all passing,
and I read the actual test diff (not just the pass/fail): the `known_
infeasible_by_valuation` set genuinely drops `("default", "landscape",
"1280x1024")`, `("default", "landscape", "1024x700")`, `("default",
"landscape", "900x600")`, and `("all-present", "landscape", "1366x768")`
between the pre- and post-W4 test file — confirms the claimed OPTIMAL
flips are real, re-derived, not hand-edited pins. `lyt-layout.gen.ts`'s
diff confirms the regenerated constant genuinely carries `minPx: 280`
(was 480) into the shipped `board-priority-clamp` track and `minPx: 160`
(was 300) into the T-node children's floor — this is not just a research-
tooling change, it reaches the live renderer.

**The builder's own disclosed concern — resolved via a live measured
width-sweep, as instructed.** I drove the actual running dev app (not the
CP-SAT solver, not a synthetic harness) and forced the real `.lyt-node`
grid-track element hosting `.lyt-toolbar-strip` (the side column's live
DOM ancestor) to a sequence of descending widths, measuring
`scrollWidth - clientWidth` and walking every descendant for a child whose
right edge exceeds the container's right edge, at each width:

| Forced column width | Horizontal overflow | First clipped element |
|---|---|---|
| 820–340px | 0px | none |
| 335px | 0px | none |
| 330px | 2px | `.setup-toolkit` |
| 325px | 7px | `.setup-toolkit` |
| 320px | 12px | `.setup-toolkit` |
| 300px | 32px | `.setup-toolkit` |
| **280px (the shipped floor)** | **52px** | **`.setup-toolkit`** |
| 260px | 72px | `.setup-toolkit` |

**Measured true floor: ~335px, not the shipped 280px** — a ~55px
understatement. The mechanism: `SetupToolPalette.vue`'s own standing
no-occlusion ruling makes `.setup-palette` permanently `position: static`,
in normal flow, at its full open width (measured 296px) **at all times**,
open or closed (`visibility: hidden` on close, never `display: none` —
this is deliberate, documented, and correct on its own terms: it is what
keeps the palette's reservation from silently collapsing). `.setup-toolkit`
is a flex **column**, so its own rendered width is the max of its
children — the palette's fixed 296px, not the trigger's 51px — and
because that palette never shrinks or wraps, no amount of the OTHER
toolbar clusters' flex-wrap degradation (the mechanism the build report's
disclosed judgment call leans on: "the toolbar's own proven flex-wrap
mechanism... degrades ANY width squeeze onto more rows rather than
clipping") can rescue it: flex-wrap moves *other* row content onto new
rows, but `.setup-toolkit`'s own minimum content width is untouched by
wrapping its neighbors. The 280px floor is therefore not merely
"unswept" — it is provably wrong, and the wrongness is **live-reachable**:
`lyt-layout.gen.ts`'s `board-priority-clamp` track literally compiles to
`clamp(280px, calc(100% - (100vh - 52px) - 12px), 820px)` in the shipped
CSS (verified: this exact string is what the mockup-page test also
asserts), so any real viewport whose height leaves the `calc(...)`
term below 280px will hit the clamp's floor and produce genuine,
measured, ~52px+ horizontal clipping of the SETUP palette — a direct
violation of the "never clip" standing law `SetupToolPalette.vue`'s own
header comments and LYT's `basis: 'reserved'` semantics (SPEC.md §4.2)
both exist to guarantee.

This is scoped to one number. Recommendation: raise the side column's
`min` back toward the measured ~335px floor plus a safety margin (the W1
REPAIR pass's own precedent added ~10px of measured margin over its own
sweep — a comparable ~345–350px here would match that posture), or
reconsider whether `.setup-toolkit`'s permanent reservation should itself
shrink at extreme widths (a larger, unscoped redesign this review does not
recommend attempting inside a follow-up floor correction). The two OTHER
lowered floors (T-node children 300→160px, tree leaf 140→110px) were not
implicated by this sweep — they govern a different row (the tree/panels
row, not the toolbar-strip row) and are not this review's finding; I did
not independently re-sweep them, since the tree leaf's own 110px number is
already disclosed as solver-only/rendering-dead (verified: `useResizable
PanelTs`'s `effectiveTreePanelWidthPx` override is real, matches the
report's own claim) and the T-node floor's own live effect is bounded by
a different mechanism (five fixed-registry tab panels, not a
permanently-reserved sibling like SETUP) that this review had no specific
adversarial hypothesis against.

## Probe-isolation evidence (executed personally)

Dev server launched via `VITE_API_BASE_URL=http://127.0.0.1:19201
VITE_KATAGO_WS_URL=ws://127.0.0.1:19202 npx vite --port 19273 --strictPort`
— three fresh dead scratch ports (≥19100, confirmed nothing listening
beforehand via `ss -ltn`), distinct from the builder's own probe's ports
(19101/19102/19173) as an extra isolation margin, and distinct from every
forbidden port. My probe instrumented every Playwright network request and
asserted none ever targeted `127.0.0.1:8764/:1235/:1242/:4173/:5173/:5174`
(the full forbidden set named in this commission, a superset of the
builder's own three-port check). Final assertion output from my own probe
run (full log: extended size-matrix + popover run, `ALL CHECKS PASSED`
after fixing two of my own probe's false-positive bugs, detailed above):

```
PASS  PROBE ISOLATION: no request ever targeted a live/dead-but-forbidden port
```

Dev server process confirmed killed after the run (`ps aux | grep 19273`
empty).

## Scope table

| # | Item | In scope, addressed | Notes |
|---|---|---|---|
| 1 | Overlay stratum | Yes | Verified at all 4 sizes, adversarial rail-on variant |
| 2 | Toolbar structure | Yes | SLIDERS/QUEUE fix confirmed; SGF one-home confirmed (with a stale-dependent-file note) |
| 3 | Z-index ladder | Yes | Token sweep + live occlusion checks, incl. rail popover |
| 4 | MiniBoard clamp | Yes | All 4 sizes × rail-on, no off-screen/non-square forcing achieved |
| 5 | Debug menu | Yes | Dev pill live; prod bundle grep confirms disclosed non-elimination |
| 6 | Floor softening | Yes, but incompletely safe | 280px side-column floor genuinely clips; true floor ~335px |

Anything outside the six items: none found. All touched files (`App.vue`,
`theme.css`, the eight chrome/board components, `lyt-layout.gen.ts`, the
`.lyt` encoding, and the test files) map cleanly onto one of the six items;
no unrelated drive-by changes.

**One doc-discipline gap found, outside the six functional items:**
`DebugMenu.vue` is a new file (206 lines) under `src/components/chrome/`
with no corresponding `frontend/FILES.md` entry — `frontend/CLAUDE.md`'s
File map section requires one in the same PR ("When you create a new
TypeScript or Vue file under `src/`, add a corresponding entry to
`FILES.md`"). Grepped `FILES.md` for `DebugMenu` — no hit. MINOR/
mechanical, easy same-PR fix; not a functional concern. `FEATURES.md` was
not checked for an update by the build report either, but debug-only
affordances are arguably out of scope for a user-facing tour aimed at Go
students — I judge no FEATURES.md entry is warranted, so this is not
flagged as a gap.

## Summary of findings by severity

- **MAJOR** (item 6): the 280px side-column floor is live-reachable and
  demonstrably clips `.setup-toolkit`'s permanently-reserved palette by up
  to 52px+ at the shipped value; measured true floor ≈335px. Recommend
  raising the floor (≈345–350px with margin) before this is treated as
  closed.
- **MINOR** (item 2, undisclosed by the build report): `BoardRailPopoverTrigger.vue`'s
  header comment and `@load-sgf`/`@save-sgf` event-forwarding chain (both
  in that file and in `App.vue`'s corner-chrome mount) are dead code as of
  this pass — the claimed "both copies stay live" is no longer true,
  though the capability itself is not lost (toolbar-strip copy still
  works). Cosmetic/documentation cleanup, not functional.
- **MINOR** (doc discipline): `DebugMenu.vue` is missing its `FILES.md`
  entry.

Everything else — items 1, 3, 4, 5, all four gates, probe isolation — held
up under independent re-execution.
