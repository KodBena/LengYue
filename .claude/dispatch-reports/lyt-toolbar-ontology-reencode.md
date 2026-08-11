# LYT toolbar ontology reencode — build report

Commissioner-ratified 2026-08-11, ledger rows 1930/1931. Base: `lyt-phase2`
@ `4e068acb` (verified at session start — HEAD matched exactly, no rebase
needed to begin). Worktree branch: `worktree-agent-a6778bf337765d5e2`.

## Orientation (ADR-0002 read-end-to-end discipline)

Read in full before substantive work: root `CLAUDE.md`, `frontend/CLAUDE.md`
(including `frontend/tests/CLAUDE.md` once test-authoring came into scope),
`docs/adr/0002-fail-loudly.md`, `docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`,
`research/lyt/README.md`, `research/lyt/SPEC.md` (1083 lines, read in full —
no skip), `research/lyt/encodings/lengyue_landscape.lyt`'s header comments
(REPAIR PASS / W4 FLOOR SOFTENING / W4 FLOOR CORRECTION sections read in
full), `frontend/src/state/lyt-layout.gen.ts`, `frontend/src/state/lyt-widget-registry.ts`,
`frontend/src/components/chrome/LytNode.vue` (all read in full).

**Disclosed gap, surfaced per ADR-0002's documentation-consumption
corollary rather than silently absorbed:** the brief named
`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` as required
reading. That path does not exist on `lyt-phase2` (or anywhere in this
worktree's history) — `git log --all` found it only on the `next` branch,
at two commits (`6a76dddd`, `ae7f032a`), never merged toward `lyt-phase2`.
Read via `git show ae7f032a:.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
(the newer of the two, full text) rather than treated as absent — this
satisfies the read-end-to-end discipline (the document WAS read, in full,
just not from a checked-out path) but the cross-branch situation itself
is worth the commissioner's attention: the toolbar reencode's own
predecessor artifacts assume this document lives in-tree on `lyt-phase2`,
and it doesn't.

## Per-ratified-point delivery status

### Item 1 — BOARD CONTROLS GO TO THE BOARD

**DELIVERED, WITNESSED.** `ToolbarMoveNav.vue` (the existing |< < > >|
component, unchanged) now mounts inside `StatusBar.vue` — the same
component that already spans the `.lyt` encoding's `I_board`(24px)/
`A_board`(28px) leaves (registry: `A_board` absorbed into `I_board`).
Placed leftmost in `.status-left`, board-adjacent, matching genre
convention. Applies identically to both screen classes (StatusBar.vue is
class-agnostic; no registry override needed).

Witnessed real-app height at 1920×1080 with move-nav present:
`{"width":1282,"height":25}` — well inside the existing 52px (24+28)
reservation; **no encoding change needed for this item.**

### Items 2+3 — ONE ENGINE CLUSTER (envelope-reserved) / ONE APP CLUSTER

**DELIVERED, WITNESSED.** `Toolbar.vue` (227 lines) is retired, split
into:

- **`ToolbarEngineCluster.vue`** (mounted at the `.lyt` encoding's own
  `A_engine` leaf, both classes): connect/disconnect, the literal
  `.engine-controls` button bundle (mint-card/learn-path/play/match), and
  `ToolbarEngineMetrics` (`v-if="isConnected"`). The leaf's own sizing
  block is `envelope: {disconnected, connected}` — genuinely reserved at
  the max across states now (previously the metrics mount had NO
  reservation of its own at all; `ToolbarEngineMetrics` simply appeared/
  disappeared inside the merged Toolbar's own flex-wrap, which could
  reflow sibling buttons onto a different row on connect — the
  commissioner's witnessed defect).
- **`ToolbarAppCluster.vue`** (mounted at the `.lyt` encoding's own
  `A_app` leaf, both classes): Load/Save SGF, `ToolbarSliderPopover`,
  `PboPopover`, `SetupToolPalette`, `ToolbarEngineUri`, `LocalePicker`.
  Self-contained (sources its own `useSgfLoader`/`useSgfDownload` rather
  than App.vue threading them through) — this also let App.vue's
  duplicated `.lyt-toolbar-strip` template block (landscape's `#leaf-A_go`
  and portrait's `#leaf-A_top`) collapse to one shared `#leaf-A_app`
  slot each class fills identically.

**Closure statement (ADR-0000 Rule 2a, the three-part form):**

1. **Invariant:** no widget's mount is conditionally inserted/removed
   from flow by engine connection state; every engine-state-conditional
   element's reservation is sized at the max across states it can take.
2. **Quantification universe, swept:** every `v-if` in the toolbar
   region's own component tree was enumerated (`ToolbarEngineCluster`,
   `ToolbarAppCluster`, `ToolbarSliderPopover`, `PboPopover`,
   `SetupToolPalette`, `ToolbarEngineUri`) — `ToolbarEngineMetrics`'s
   `v-if="isConnected"` is the ONLY one gated on engine-connection state;
   every other popover-style `v-if` in that region gates on its OWN
   open/closed state (already an overlay, contributing no standing
   reservation, per the codebase's standing "popovers don't reserve
   space" law) — not a sibling of this defect class. The sweep found
   exactly one instance, now closed.
3. **Denomination check:** the envelope reservation (`60px` landscape,
   `60px` portrait) is derived from a real Playwright measurement of the
   connected-state rendered height (not a round literal) — see the
   measurement table below.

### Item 4 — RE-MEASURE, RE-SOLVE, GIVE SPACE TO THE BOARD

**DELIVERED, WITNESSED**, with one disclosed tension named below (not
silently absorbed).

## Measurement (real-app Playwright, own dev server, port 19100)

**PROBE ISOLATION INCIDENT, disclosed in full (not minimized).** The
first sweep run contacted `127.0.0.1:8764` nine times (GET
`/resources/visit-distribution`, `/auth/token`, `/auth/me`,
`/qeubo/experiment/status`, `/cards/hashes`, `/analysis-bundles`,
`/documents/user_workspace_01`, `/stats/tags`, `/positions/hash-batch`)
— the dev server's default `VITE_API_BASE_URL` fallback
(`http://localhost:8764`) was not overridden, and `timeout 3 bash -c
"cat < /dev/null > /dev/tcp/127.0.0.1/8764"` confirmed a live service WAS
listening and reachable from this sandbox (exit 0) — i.e. this was a
REAL contact against the commissioner's live backend, not a no-op against
a dead port. All nine were read-only GETs (auth-check / resource-fetch
shapes; no POST/PUT/DELETE observed), which bounds but does not excuse
the severity. **Immediately on discovering this** (via the sweep's own
forbidden-port assertion): the dev server was killed, `VITE_API_BASE_URL`/
`VITE_KATAGO_WS_URL` were pinned to dead, unreachable ports (19199/19198,
verified unreachable via the same `/dev/tcp` probe before use), and every
subsequent measurement (all tables below) re-ran clean —
`PROBE ISOLATION forbidden-port contacts: NONE`, verified after every
sweep from that point on, including the final DOM/console sanity check.

### Landscape — `ToolbarEngineCluster`/`ToolbarAppCluster` natural height, width sweep (1920×1080 viewport, side-column track forced)

| width | engine-cluster (disconnected) | engine-cluster (connected) | app-cluster |
|---|---|---|---|
| 340px | 52px | 78px | 199px |
| 345px | 52px | 78px | 199px |
| 400px | 28px | 50px | 150px |
| 480px | 28px | 50px | 124px |
| 560px | 28px | 50px | 124px |
| 640px | 28px | 50px | 124px |
| 720px | 28px | 43px | 124px |
| 820px | 28px | 43px | 118px |

### Portrait — same components, full-viewport width (no side-column nesting)

| viewport | engine-cluster (disconnected) | engine-cluster (connected) | app-cluster |
|---|---|---|---|
| 420×880 | 28px | 50px | 150px |
| 1080×1920 | 28px | 28px | 92px |

### Chosen reservation and derivation

Following the REPAIR PASS's own established precedent (that section's own
header note: the real app's actual operating width at the pinned
representative sizes runs close to ~374–400px, not the absolute 345px
floor, which is reached only under extreme squeeze) — the **400px**
sample (landscape) / **420px** sample (portrait, its own pinned
`test_lengyue_portrait_default_valuation_solves_optimal_at_420x880` test
width) is the basis, plus a ~10px margin, same posture as every prior
disclosed number in this file:

- `A_engine`: `50px + 10px → 60px` (landscape and portrait both).
- `A_app`: `150px + 10px → 160px` (landscape and portrait both).

**DISCLOSED TENSION (named, not hidden).** At the absolute 345px floor
specifically (reached only under extreme squeeze, per the REPAIR PASS's
own framing), the connected-state engine cluster (measured 78px) and the
app cluster (measured 199px) both exceed this reservation. Witnessed via
a targeted overflow probe (forcing the side column to 345px/400px/480px
and reading `scrollHeight` vs. the reserved cell's own
`getBoundingClientRect().height`):

| width | engine-cluster overflow | app-cluster overflow |
|---|---|---|
| 345px | 78px content in 60px cell → **overflowing** | 199px content in 160px cell → **overflowing** |
| 400px | 60px content in 60px cell → clean | 160px content in 160px cell → clean |
| 480px | 60px content in 60px cell → clean | 160px content in 160px cell → clean |

`.lyt-toolbar-strip`'s own pre-existing `overflow-y: auto` degrades this
to an internal scrollbar at the 345px edge case — content stays reachable
(never clipped/hidden, per the standing "never hide content" law), not a
broken layout, but not zero-scroll either. **A more conservative
alternative exists and is named here for the commissioner:** `88px`/
`210px` (derived from the 345px-floor measurement itself, same ~10px
margin posture) would close this gap entirely, at the cost of ~78px more
standing side-column height at every OTHER width. This build chose the
tighter number because item 4's own mandate is "give space to the
board," and the 345px floor is the exception, not the common case — but
the alternative is a one-line change if the commissioner weighs it
differently.

### Net effect on side-column reservation

`384px` (128px × 3, the pre-reencode A_go/I_engine/A_common merge) →
`220px` (60px + 160px) — **164px returned to the board's own vertical
budget** at every width where the side column doesn't hit its own
absolute floor.

## A real regression caught mid-build (ADR-0000 Rule 2b, the operational-lapse question)

Collapsing the side column from three V-children to two shifted the
tree/panels/preview row's own tree path from `2.3` to `2.2` — and **eight
separate path-keyed consumers** across the Python tooling and the Vue
realization hardcoded the old path as a literal string:
`emit_mockup.py`'s `TOGGLE_TARGETS`, `emit_layout_tree.py`'s
`DEFAULT_VISIBLE_BY_PATH`, `App.vue`'s `lytTrackStyleOverrides`'
`treePanelPath` and `LYT_DOM_ID_BY_PATH_LANDSCAPE`, plus five now-stale
test/comment sites (`test_emit_layout_tree.py`, `store/defaults.ts`,
`useLytPresenceMenu.ts`, and two prose comments). The pytest suite caught
two of these (mockup content + toggle-target cross-check tests failed
loudly); the frontend Vitest suite caught **none** of the App.vue-side
path drift — `npm run test:run` passed 3050/3050 both before and after
that fix, because the only DOM-id-wiring test in the suite
(`LytNode-dom-id-wiring.test.ts`) exercises a synthetic tree, not the
real compiled program. Found instead by a deliberate real-app Playwright
check (`#vue-tree-panel`/`#control-panel`/`#tree-control-wrapper`
resolution) run as due diligence after the fix, not by any existing gate.

**Rule 2b answer:** this is a real gap in the mechanized net, not
implementer error — no test in either suite asserts that
`LYT_DOM_ID_BY_PATH_LANDSCAPE`'s keys and `lytTrackStyleOverrides`'
`treePanelPath` resolve against the REAL compiled `LYT_LANDSCAPE`
program's actual paths. Named here as a disclosed follow-up a future
wave should mechanize (a small integration test asserting every literal
path string in App.vue resolves to a real node in `LYT_LANDSCAPE.root`/
`LYT_PORTRAIT.root`), not silently patched around by this build.

## Encoding numbers changed (research/lyt/encodings/*.lyt)

### `lengyue_landscape.lyt`

| slot | old | new | derivation |
|---|---|---|---|
| `A_go`/`I_engine`/`A_common` (3 leaves, 128px each) | retired | `A_engine[go, action+info]` `60px` (envelope: disconnected/connected) + `A_app[common, action]` `160px` | Playwright measurement, see table above |
| side-column `min` | `345px` | `345px` (unchanged) | SetupToolPalette's own 296px minimum content width, unaffected by this rework — not re-swept (disclosed narrowing) |

### `lengyue_portrait.lyt`

| slot | old | new | derivation |
|---|---|---|---|
| `A_top[common, action]` `28px` | retired | `A_app[common, action]` `160px` | same measurement basis as landscape, at portrait's own 420px pinned width |
| `I_engine[common, info]` `28px` (mounted NOTHING — disclosed W3 gap) | retired | `A_engine[go, action+info]` `60px` (envelope: disconnected/connected) | same basis; portrait now has a REAL, working engine cluster it never had before |

No `gap` value changed in either file (Amendment 3's "rhythm is not
negotiable" respected verbatim, per this file's own established
discipline).

## Feasibility pins — every one verified unchanged

`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest tests/ -q` from
`research/lyt/`: **120 passed, 0 failed** (WITNESSED, final run). No pin
changed: `test_lengyue_landscape_default_valuation_solves_optimal`
(1920×1080/2560×1440/3440×1440/1366×768 all OPTIMAL),
`test_lengyue_portrait_default_valuation_solves_optimal_at_420x880`
(OPTIMAL), the known-`INFEASIBLE` set
(1280x1024/1024x700/900x600 under all-present valuation only — unrelated
presence-independent WRAPPER_MIN collision, pre-existing;
1080×1920-portrait — pre-existing aspect/board-composite collision) all
unchanged. Lowering a `min` (which this build did nowhere) is the only
lever that can turn a feasible point infeasible in this solver; every
change here only RENAMED leaves or changed their `pref`/fixed extent
within an unchanged `min` on the side column itself, so no regression was
structurally possible — verified anyway, per this file's own established
"verify, don't just reason" posture.

**Disclosed, non-gated shadow-mode oddity:** regenerating
`frontend/src/state/lyt-solved-layout-landscape.gen.ts` via `emit_ts.py
--registration lengyue_landscape+portrait --class-id landscape` (its own
undocumented required flags, discovered by trial) shows `1280x1024` as
`INFEASIBLE` — this is `emit_ts.py`'s own "all slots present" default
valuation (not the `default_valuation` the gating pytest suite and the
live app both use), a pre-existing behavior of this specific CLI tool
unrelated to this build's changes and not gated by any test. Named here
rather than silently left, per this file's own disclosure posture.

## Feasibility-pin changes

**None.** No pin moved in either direction.

## Regenerated artifacts

- `frontend/src/state/lyt-layout.gen.ts` (`emit_layout_tree.py --registration landscape`)
- `frontend/src/state/lyt-layout-portrait.gen.ts` (`emit_layout_tree.py --registration portrait`)
- `frontend/src/state/lyt-solved-layout-landscape.gen.ts` (`emit_ts.py`, shadow-mode, non-gated — see disclosed oddity above)
- `research/lyt/mockups/landscape.html` / `portrait.html` (`emit_mockup.py`, design-review artifact, non-gated)

All four regenerated AFTER the final `.lyt` source edits (including the
disclosed header notes), never hand-edited.

## Vue realization — files touched

**New** (both carry ADR-0006 headers):
- `frontend/src/components/chrome/ToolbarEngineCluster.vue`
- `frontend/src/components/chrome/ToolbarAppCluster.vue`

**Deleted:** `frontend/src/components/chrome/Toolbar.vue` (227 lines,
fully absorbed into the two new components above).

**Modified:** `App.vue` (import swap, two leaf-mount blocks replaced,
dead SGF-composable imports removed, path-shift fix, CSS override rules
simplified — see the file's own "Finding A, dated note"),
`StatusBar.vue` (mounts `ToolbarMoveNav`), `lyt-widget-registry.ts`
(A_go/I_engine/A_common → A_engine/A_app; the W3 class-scoped-override
table is now EMPTY, retained rather than deleted per its own header
note), `ToolbarEngineMetrics.vue`/`BoardRailPopoverTrigger.vue`/
`SidebarWidget.vue`/`useLytPresenceMenu.ts`/`store/defaults.ts` (stale
prose/path-comment updates, no behavior change), `scripts/lyt-conformance.mjs`
(selector table).

SFC line counts (ADR-0007 ≤250 target): `ToolbarEngineCluster.vue` ≈118
lines, `ToolbarAppCluster.vue` ≈74 lines — both comfortably under target
(the old 227-line `Toolbar.vue` is gone, not merely shrunk).

## Docs

- **FEATURES.md** — new "Toolbar organisation" bullet under "Workspace
  and chrome," describing the two clusters and the move-nav relocation
  in user-facing terms (content-only edit; doc-graph structure
  unaffected, no regeneration needed per the umbrella CLAUDE.md's own
  "content-only edit need not" rule).
- **frontend/FILES.md** — `Toolbar.vue`'s row replaced by
  `ToolbarAppCluster.vue`/`ToolbarEngineCluster.vue`; `ToolbarMoveNav.vue`
  gained an entry (a pre-existing gap, unrelated to this build, filled
  incidentally); `StatusBar.vue`'s description updated.
- Doc-graph: not regenerated — no doc added/removed/renamed, only
  existing FEATURES.md/FILES.md content edited (the umbrella CLAUDE.md's
  own "content-only edit" exemption).

## Gates — literal exit codes

| gate | command | exit |
|---|---|---|
| Python solver suite | `cd research/lyt && pytest tests/ -q` | **0** (120 passed) |
| Frontend build | `cd frontend && npm run build` (`vue-tsc -b && vite build`) | **0** |
| Frontend tests | `cd frontend && NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` | **0** (3050 passed, 8 skipped) |

**eslint** (not in this brief's named gate list, but CI runs it): `npx
eslint .` exits 1 with 19 pre-existing errors, all in files this build
never touched (`ProxyUpstreamSettingField.vue`, `SettingsTab.vue`, and
others — a repo-wide "cast-hygiene stage 2" ratchet, mid-rollout on
`lyt-phase2` before this build started). Verified via `grep` that none
of this build's touched/new files appear in the eslint output. WITNESSED,
not asserted: the pre-existing-ness is confirmed by `git stash` + rerun
showing the SAME two toggle-target test failures pass/fail symmetrically
around this build's own diff (see the path-shift section above for the
one real regression this build DID cause and then fixed, which IS in
this diff).

## Witness statuses, summarized

- Item 1 (move-nav relocation): **WITNESSED** (real-app render, DOM
  presence, height budget check).
- Items 2+3 (cluster split, envelope reservation): **WITNESSED** (real
  component split, both engine states measured, `.lyt` encoding updated
  and solver-verified).
- Item 4 (re-measure/re-solve): **WITNESSED** for the primary
  measurement and the pytest feasibility re-verification; the 345px-floor
  scroll tension is **WITNESSED as present**, not resolved (disclosed
  tradeoff, alternative numbers named).
- Path-shift regression: **WITNESSED found and fixed** (real-app DOM-id
  resolution check, before/after).
- Probe isolation incident: **WITNESSED occurred, then WITNESSED fixed**
  — disclosed in full above, not minimized.
- `emit_ts.py` shadow-file oddity: **WITNESSED, UNEXERCISED further**
  (traced to the tool's own default valuation choice; not gated,
  correcting it is out of this build's scope).
- `synthesize.py`'s own frozen A_go/I_engine/A_common census snapshot:
  **UNEXERCISED, deliberately** — that module's own docstring frames its
  region list as grounded against the encoding "as they stand today" AS
  OF ledger row 1848, a point-in-time research snapshot, not a
  live-tracking mirror; updating it would misrepresent its own framing.
  Its own test suite (`test_synthesize.py`) passed unchanged as part of
  the 120-test run above, confirming it is internally self-consistent
  against its own frozen numbers.

## Commit and delivery-time rebase

Committed on this worktree's own branch
(`worktree-agent-a6778bf337765d5e2`), never on `lyt-phase2` directly.
Commit sha and delivery-time `git merge-base HEAD <lyt-phase2 tip>`
recorded in the final message to the commissioner (fetched and rebased
against the tip immediately before commit, per the brief's own
"expect the tip to move" instruction).

License: Public Domain (The Unlicense).
