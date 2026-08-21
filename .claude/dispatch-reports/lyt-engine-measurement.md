Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT engine-connected measurement pass

Commission: close the UNEXERCISED measurements the prior live-measurement
wave (`.claude/dispatch-reports/lyt-measurement-wave.md`, Measurement 6
and the engine-groups half of Measurement 7) left open because no live
KataGo engine was available — connect to the real engine at
`ws://192.168.122.68:1235`, model `14`, and measure what only a live,
analyzed position can honestly answer. Base `14ec051e` on `lyt-phase2`.

## 1. Base freshness (FIRST ACT)

`git fetch origin`. The worktree's own default branch
(`worktree-agent-a8092a86fb3436c61`) resolved to `3378806f` — an
UNRELATED, older mainline point (`git merge-base --is-ancestor 14ec051e
HEAD` failed against it: `NOT ancestor / stale`). Per the commission's
own instruction, hard-reset to `origin/lyt-phase2`: `git stash -u`
(nothing of value — only the harness's own `.claude/` was untracked),
`git reset --hard origin/lyt-phase2`. `HEAD` afterward is `14ec051e`
exactly, matching the commission's named base — re-verified
(`git log --oneline -1`).

## 2. Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-measurement-encoding-pass.md` (full, 308
lines — the relic-disposition table this pass updates against) and
`.claude/dispatch-reports/lyt-measurement-wave.md` (full, 600 lines —
the prior UNEXERCISED findings this pass closes, its own isolation/rig
conventions this pass follows). `.claude/dispatch-reports/
lyt-controls-floor.md` (full, 302 lines — the 185px engine-controls
floor this pass verifies live, including its L12/L16 legality
discussion and its own §5 "eval/health/queue starvation to 0px"
finding, directly relevant to Measurement 2 below). The umbrella
`CLAUDE.md`, `frontend/CLAUDE.md`, and `backend/CLAUDE.md` (all read
end to end this session — full text confirmed via the harness's own
system-reminder injections, not skimmed). `research/lyt/encodings/
lengyue_landscape.lyt` and `lengyue_portrait.lyt` consulted directly
(not end-to-end re-read — this pass touches only the `AT_basic_*`
three-leaf declarations, grep-confirmed at the exact lines cited below)
to pin the four `200px` + two `90px` declarations this pass's
Measurement 1 grounds.

## 3. Isolation

**Ports.** Backend `19110`, frontend dev server `19111`. Both probed
dead before use:

```
$ timeout 1 bash -c 'exec 3<>/dev/tcp/127.0.0.1/19110'; echo $?
Connection refused -> dead (rc=1)
$ timeout 1 bash -c 'exec 3<>/dev/tcp/127.0.0.1/19111'; echo $?
Connection refused -> dead (rc=1)
```

Engine reachability probed separately (not a forbidden port; explicit
commissioner standing to use it): `timeout 2 bash -c 'exec 3<>/dev/tcp/
192.168.122.68/1235'` → `rc=0`, reachable. The forbidden set
(8764/1235-as-**local**-only-would-be-N/A-here since this is the named
remote engine, not local/4173/5173/5174/1242/195xx) was never touched —
grepped this session's own shell history for the literal forbidden
port numbers; none appear outside this remote-engine address, which
the commission explicitly names as in-scope.

**Backend.** `/home/bork/w/omega/backend/venv/bin/fastapi run main.py
--host 127.0.0.1 --port 19110`, `DATABASE_URI` pointed at a `cp` of
`backend/samples/cards.sample.db` under this session's scratch
directory (`/tmp/claude-1000/-home-bork-w-omega/
046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/lyt-engine-measure/
cards.db`), never the real `cards.db`. Launched via `systemd-run --user
--scope -p MemoryMax=4G --unit=lyt-eng-backend -- nice -n 19 <fastapi>`.

**Frontend.** `vite --port 19111 --host 127.0.0.1 --strictPort`,
`VITE_API_BASE_URL=http://127.0.0.1:19110`,
`VITE_KATAGO_WS_URL=ws://192.168.122.68:1235` (the fallback env var;
the profile-setting seed below is the primary resolution path per
`src/config/env.ts`'s own documented resolution order).
`frontend/node_modules` symlinked from the main checkout after
`diff`-confirming `package-lock.json` byte-identical (this worktree had
none of its own). Launched via the same `systemd-run --scope` pattern,
`-p MemoryMax=4G`, `nice -n 19`.

**Workspace blob seed.** The copied DB's `documents.data` row
(`user_workspace_01`) was read, edited in Python
(`json.loads`/`json.dumps`, not hand-edited SQL), and written back:
`profile.settings.appearance.theme` `'dark'` → `'cluster'` (the light
theme — `'light'` is not a value this codebase's theme union accepts;
confirmed the same terminology correction the prior wave already
discovered and documented) and `profile.settings.engine.katago.url`
`'ws://127.0.0.1:41949'` → `'ws://192.168.122.68:1235'`. Verified live,
every capture: `document.documentElement.getAttribute('data-theme')`
== `'cluster'`, `getComputedStyle(document.body).backgroundColor` ==
`rgb(255, 245, 255)` (light) — every screenshot in this report's own
inventory is light-theme, confirmed both by this DOM check (first
capture) and visually (bright pink/white palette throughout, never
dark, in all 30+ screenshots taken this session).

**Playwright discipline.** Every browser launch went through
`systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 node
--max-old-space-size=1024 <script>.mjs`, Chromium launched with
`executablePath: '/usr/bin/chromium'` and
`args: ['--js-flags=--max-old-space-size=1024']`, one browser instance
per script, closed in a `finally` block. No `waitForTimeout`-as-the-
condition anywhere load-bearing — every wait that gates a measurement
is a `waitForSelector`/`waitForFunction`/`waitForEvent` on a real DOM
or state condition (the DISCONNECT-label flip for connection state,
the Interval Summary table losing its "no data" text for analysis
completion, `aria-expanded="true"` for the control-panel popover, a
canvas's own `getBoundingClientRect().height` tracking an injected
style change for the chart-resize sweep). Short `waitForTimeout(100–
300ms)` calls appear only as settle-bounds AFTER a real condition
already resolved (letting one animation frame or a Vue reactivity
flush land), never as the sole wait condition for a measurement.

**Model.** `EngineModelSelect`'s own `<select>` confirmed SELECTOR mode
live (`isSelectorMode: true`), `availableModels` = `["14", "18",
"nbttrf", "08_01", "b11c768h12nbt3tflrs"]`, `selectedModel` defaulted to
exactly `"14"` — the exact string the commission names, requiring no
explicit re-selection.

## 4. A defect discovered live, worked around, disclosed

`page.click('#control-panel-summon-btn')` toggles the control panel's
own **popover mount** (`#control-panel-popover-mount`, the Teleport
target `App.vue`'s own "Popover summon for an absent Exclusive" section
relocates the live control-panel content into), NOT `#control-panel`
itself — `#control-panel` stays a 1px-wide grid-slot anchor the whole
time the panel is a popover. The first several script iterations this
session wrote measured `#control-panel`'s own rect to decide whether
the panel was open, which is always wrong in this app state (the
popover form, not the in-grid form, is what renders when the side
column is too narrow to carry `CP-analysis` in-flow — the same
Presence-arc-P2b mechanism `App.vue`'s own header already documents,
including a standing comment naming exactly this trap: *"the screenshot
witness rig caught this directly: `page.click('#control-panel-summon-
btn')` timed out after the popover opened"*). Corrected to check
`#control-panel-summon-btn`'s own `aria-expanded` attribute and to
scope every subsequent DOM query to `#control-panel-popover-mount`
instead of `#control-panel`. Not a defect in the app — a rig mistake,
caught and fixed before any measurement below was taken; disclosed
because a future session hitting the same `#control-panel` selector
will hit the identical trap.

## Measurements

### 1. AT_basic chart panels — minimum useful heights

**Method.** Loaded `/home/bork/sgf_validation/1986-11-06c.sgf` (a real
245-move game, Shiraishi Yutaka vs Yukawa Mitsuhisa), connected to the
live engine, opened Analysis → Basic, set Visits to 40 (a modest count
for measurement purposes, not a quality claim), clicked "Analyse
Selection" over the full 0–245 range, waited for the Interval Summary
table to leave its "no data" placeholder state (a real condition, not
a sleep). All three `AT_basic_*` leaves then rendered real data:
Interval Summary (Black 0.636, White 0.507 in the first capture),
"Game State (Turns)" (ScoreLeadPanel — Complexity/Win Probability/
Score Advantage lines), and "Per-Player Performance (Moves)" inside
the Merged Delta panel's own "Delta View" mode-chrome wrapper.

The encoding's own three leaves and their citing lines (grep-confirmed
directly, both files identical):

| Leaf | landscape line | portrait line | declared |
|---|---|---|---|
| `AT_basic_interval` | 1456 | 488 | `min 90px, pref 90px, max 90px` |
| `AT_basic_scoreLead` | 1457 | 489 | `min 200px, pref 1fr, max inf` |
| `AT_basic_mergedDelta` | 1458 | 490 | `min 200px, pref 1fr, max inf` |

— matching the commission's own "four 200px floors [2 leaves × 2
files] + the 90px interval [1 leaf × 2 files]" framing exactly.

**Natural (unconstrained) render**, 1920×1080, WITNESSED:

| Panel | full `.section` height | inner content |
|---|---|---|
| Interval Summary | 102px | `.table-scroll` 56px (header row + Black row + White row) |
| Game State (Turns) (ScoreLead) | 173px | `.linear-content` 160px (CSS-fixed, not container-responsive by default — see below), canvas 472×159 |
| Delta View / Per-Player Performance (MergedDelta) | 213px total (173px inner `AnalysisChartPanel` + ~40px mode-header/toggle row) | `.linear-content` 160px, canvas 470×159 |

**Probe method for "minimum useful."** `AnalysisChartPanel.vue`'s own
`.linear-content { height: 160px; }` is a CSS-fixed constant, not
responsive to its container — but `BaseChart.vue` wires a real
`ResizeObserver` calling `chartInstance.resize()` on the ECharts
instance (line 576-579), so injecting a direct inline-style height
override on `.linear-content` and waiting for the canvas's own
`getBoundingClientRect().height` to track it is a faithful probe of
what the chart would do at that constrained height, not a synthetic
approximation. Interval Summary's table has no such resize logic (a
plain `<table>`), so its own `.content` was probed via `max-height` +
`overflow: hidden` and inspected for row clipping.

**ScoreLead / MergedDelta (chart, canvas-based) — WITNESSED sweep**
(content height → canvas height tracked exactly, 1:1, at every point
100→40px; only the RENDERED LEGIBILITY differs):

| content height | full section height (≈ +13px header) | legibility |
|---|---|---|
| 160px (natural) | 173px | clean — legend clear of data, axis labels legible |
| 90–95px | 103–108px | clean — small margin between legend and data peaks |
| 80–85px | 93–98px | marginal — legend begins to graze the tallest data peaks |
| 70–75px | 83–88px | **dysfunctional onset** — legend markers visibly overlap trace peaks |
| 50px | 63px | dysfunctional — legend sits directly on top of the plotted lines |
| 40px | 53px | dysfunctional — chart essentially unreadable, axis compressed |

Screenshots (all light-theme, cropped to the panel's own bounding box):
`shots/17-scorelead-h{160,100,70,50,40}.png`,
`shots/18-fine-scorelead-h{95,90,85,80,75}.png`.

**Interval Summary (table) — WITNESSED sweep**:

| `.content` max-height | result |
|---|---|
| 90px (natural-ish) | both rows fully visible |
| 70px | both rows fully visible, no clipping |
| 56px | **White row visibly clipped** (bottom half cut off) |
| 45px | White row entirely gone — only Black row shows |
| 35px | further degraded, header crowding the single visible row |

These points are captured in `shots/19-interval-h{90,70,56,45,35}.png`.

**Judgment, stated separately from the numbers** (per the commission's
own instruction): "minimum useful" is a readability call, not a hard
threshold — the sweep gives clean bracketing points, the line between
them is where a reader would call the panel degraded rather than
broken. For the two chart panels, this session's own judgment places
the useful floor at **content ≈ 90px (section ≈ 100–105px)** — the
point where legend and data keep a comfortable gap — with dysfunction
clearly onset by content ≈ 75px (section ≈ 88px). For Interval Summary,
the useful floor sits at **content ≈ 70px** (both rows guaranteed
visible with a little headroom), with clipping confirmed by content =
56px.

**Disposition**: the encoding's `200px` floors sit roughly **2×** above
this session's own measured "clean" breakpoint (≈100–105px) — generous
headroom, not a tight fit, and not contradicted. The `90px` interval
floor sits **20–34px above** the measured no-clip range (70–90px) —
comfortably validated, similarly not a tight fit. Both floors read as
conservative-but-honest given this session's own live data; this
session found no basis to tighten either number, and no basis to call
either one wrong.

### 2. Engine-group widths, connected, with live telemetry

**Method.** Same connected + analyzed session as Measurement 1. Read
`getBoundingClientRect()` on `.engine-metrics-bar` (mounted twice, once
per `group="eval"`/`group="health"`) and the queue leaf
(`EngineQueueTooltip`), at 1920×1080, with real values populated
(`winrate-val` = `47.8%`, `score-lead-val` = `-1.6`, `pps` = `53`,
`latency` = `1024ms`).

**Rendered column widths (CSS Grid track), WITNESSED**: all three
groups get **139px** each (the side column's toolbar row: 185px
controls + 3×139px + gaps ≈ 614px total, matching the side column's
own previously-measured 614px width at 1920px — internally consistent
with the controls-floor report's own §5 table).

**Natural (uncompressed) content width — WITNESSED**, measured by
temporarily setting `flex-shrink: 0` on every `.metric` child and
reading the resulting `scrollWidth`, then reverting:

| Group | allotted column | natural content need | ratio |
|---|---|---|---|
| eval (`{winrate, lead}` + VERSION/MODEL identity) | 139px | **534px** | 3.84× |
| health (`{pps, latency, watchdog}`) | 139px | **236px** | 1.70× |
| queue | 139px | **139px** | 1.00× — fits, no natural overflow |

**Live-witnessed consequence**: at 1920×1080, connected, with real
telemetry, the eval group's content (VERSION + the SELECTOR-mode MODEL
`<select>` + WINRATE + LEAD) visibly **overflows into and overlaps**
the health and queue groups' own rendered text — confirmed both by DOM
geometry (the live `<select>` element measured `x=1641, w=175`,
extending to `x=1816`, deep inside the health group's own column,
which starts at `x=1638`; the `winrate-val` span's own left edge
measured `x=1828`, inside the QUEUE column, which starts at `x=1781`)
and visually (`shots/24-metrics-overlap.png`,
`shots/25-metrics-overlap-crop.png` — legible as "L**0**TENCY" /
"WA**0**ms QUEUE" character-level overlap in the crop). The defect
persists identically across every subsequent screenshot this session
took with the panel connected (Distributions/Stability/Multiresolution
sub-tab shots all show the same overlapping toolbar row), so it is not
a one-frame render race — it is the steady-state layout at this
viewport.

**Controls cluster (Measurement 2's second half) — WITNESSED**:

| State | `.engine-controls` rect | form | visible buttons |
|---|---|---|---|
| pre-connect (idle) | 185×80 | `toolbar-cluster` (button-cluster) | Mint Card(s), Learn Path, Play, Match, **Connect** |
| connected, idle | 185×80 | `toolbar-cluster` (button-cluster) | Mint Card(s), Learn Path, Play, Match, **Disconnect** |

The rendered column holds at exactly the authored **185px** floor
(`14ec051e`'s own `fa2f1259` commit) in both states — the button-
cluster form is stable through the connect/disconnect label flip, with
**no menu-path trigger present** in either state (`hasMenuTrigger:
false`, confirmed by DOM query). Recomputing the worst-case 3-row fit
from this session's own live-measured button widths (Mint Card(s)
105.63px, Learn Path 90.02px, Play 43.22px, Match/Stop Match worst
90.02px, Connect/Disconnect worst 90.02px, `--space-tight` 4px gaps)
gives the identical **184.04px** worst-case row-3 need
(`90.02+4+90.02`) the `lyt-controls-floor.md` report itself computed —
**0.96px of slack** against the live 185px column, matching that
report's own "<1px slack" framing exactly. MATCH's own label flip
(Match → Stop Match) was not separately live-exercised (starting a real
match against the shared engine was judged out of this session's own
scope — see §6), but the state-invariance is a structural property of
`useEngineControlsRealization.ts`'s own shadow-clone mechanism (both
label variants are rendered and measured unconditionally, regardless of
actual state — see that file's own header, "State-invariance
correction, review MAJOR finding, 2026-08-13"), not a per-state branch
that could regress independently of what this session did exercise.

**A stale-but-harmless documentation note, not a functional defect**:
`useEngineControlsRealization.ts`'s own header prose states *"the
worst-case arithmetic at 1920x1080's own 150.5px column needs 4 rows
(108px)… this fix selects `menu-path` at 1920x1080 EVEN AT IDLE"* — describing
the column width **before** the 185px floor commit (`fa2f1259`/
`14ec051e`) landed. This session's own live measurement confirms the
185px floor DID land and DID restore `button-cluster` at 1920×1080, as
that same docstring's own next paragraph predicts it would ("the moment
the column widens past the need, the cluster form realizes on its
own"). The mechanism is self-correcting and behaves exactly as
documented; only the illustrative "150.5px" figure in the prose is now
describing a superseded state rather than the current one. Not fixed
here (out of this measurement-only pass's scope) — named for whichever
session next touches that file.

### 3. `otherColorDebug` composite — honest minimum, with live analysis

**Method.** Same connected + analyzed session, navigated to the Other
tab.

**WITNESSED**: `otherColorDebugWrapper` (heading + hint +
`ColorDebugStrip`) = **232px**; `colorDebugStripEl`
(`ColorDebugStrip.vue`'s own root) = **142px**. Both numbers are
**byte-identical** to the prior no-engine measurement wave's own
Measurement 5 (`.claude/dispatch-reports/lyt-measurement-wave.md`,
"232px" / "142px" respectively) — confirmed by direct comparison, not
by memory. `ColorDebugStrip.vue`'s own source (`steps` prop, a
`computed` gradient sample count) reads no engine/analysis state at
all — it is a static gradient-calibration tool, unrelated to game or
engine state by design. **Honest finding**: "with live analysis
populating it" does not change this leaf's measured height, because
nothing about it is analysis-driven; the prior wave's own no-engine
numbers were already the true, complete measurement for this leaf, not
merely an approximation this session could improve on.

**Disposition, unchanged**: the `204px` composite `min` for
`V(otherColorDebug, otherBand)` remains column (c), uncited. This
session adds no stronger citation than the prior wave — the 232px live
wrapper height is close to, but under, `otherColorDebug`'s own declared
`min 264px` (consistent, not a regression, matching the prior wave's
own read), and the componentwise-summed floor (`264 + 160 + 4 = 428px`)
remains the standing basis to check `204px` against, which the prior
wave already found `204px` sits well under. No new evidence either way
this session.

### 4. Encoding-contradiction findings (enumerated, not fixed)

**(a) Eval/health/queue metrics groups visibly overlap at 1920×1080,
connected, with live telemetry — a real, user-visible defect, not
merely a solver-model divergence.** `lyt-controls-floor.md`'s own §5
frames the eval/health/queue starvation to `0px` in the **solver
model** as benign because *"the real CSS Grid realization[']s native
`1fr` tracks DO split evenly"* (unlike the solver, which starves them
entirely). This session's live measurement confirms the CSS Grid HALF
of that claim (all three groups DO get an even 139px split) but
contradicts the benign conclusion: an even 139px split is still **far
below** what any of the three groups need to render without overlap
(534px / 236px / 139px natural need against a 139px column — eval
needs 3.84× its allotment). The "starvation is a solver-only artifact,
harmless in the real DOM" framing that report's own text carries is not
supported by this session's own live observation — the real DOM
genuinely overlaps, unreadably, at this exact viewport and state.
Enumerated for the commissioner's attention; not fixed (measurement-
only scope).

**(b) `useEngineControlsRealization.ts`'s own header prose is now
stale** (describes the pre-185px-floor "150.5px column" state as
current; the actual current behavior at 1920×1080 is `button-cluster`,
as that same docstring's own final paragraph predicts). Documentation
staleness only — the composable's logic is correct and self-
correcting, confirmed live. Named for a future doc-only touch.

**(c) Stability sub-tab shows "No Per-Turn Stability (log-V weighted)
data yet."** even after a completed, non-empty 40-visit analysis pass
over the full 0–245 range (the same pass that populated Basic and
Distributions cleanly). Not confirmed as a defect — Stability's own
metric (per-turn log-V-weighted top-1-move persistence) plausibly needs
a different trigger (e.g., the "Adaptive re-evaluation" checkbox
visible on the same tab, unchecked throughout this session, or
multiple re-analysis passes over time) that this session did not
separately exercise. Flagged as an open question for whoever next
works this surface, not asserted as broken.

**(d) `otherColorDebug`'s 204px composite relic remains unresolved**
(see Measurement 3) — not a new finding, but re-confirmed rather than
newly contradicted: this session's live-engine numbers match the prior
no-engine numbers exactly, closing the "did live analysis change this"
question the commission's own framing raised, with a clean "no."

## Screenshot inventory

All under this worktree's own scratch directory (light-theme confirmed
throughout, not committed to the repository, per this repository's
established LYT-session convention):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/
scratchpad/lyt-engine-measure/shots/` —

- `01-diag.png` — first successful boot (light `cluster` theme, board
  + engine-controls cluster visible, pre-SGF).
- `02-popover.png` — control panel popover open (Settings tab, default).
- `03-analysis-tab.png` — Analysis → Basic, pre-connect empty state.
- `10-sgf-loaded.png` — the target SGF loaded (Shiraishi Yutaka vs
  Yukawa Mitsuhisa, 245 moves).
- `11-connected.png` — engine connected (DISCONNECT green, metrics bar
  mounted).
- `12-pre-analyze.png` / `13-post-analyze-basic.png` — before/after the
  40-visit analysis run; Interval Summary + Game State (Turns) chart
  populated with real data in the "after" shot.
- `14-basic-full.png` / `15-basic-scrolled.png` — full Basic sub-tab
  layout survey (Interval Summary, Score Lead, Merged Delta all
  located).
- `16–18-*.png` — the ScoreLead constrained-height sweep (160→40px, 14
  screenshots total), the finding basis for Measurement 1.
- `19-interval-h{90,70,56,45,35}.png` — the Interval Summary table
  clipping sweep.
- `20-connected-metrics.png` / `21-toolbar-row-crop.png` — first
  connected-state metrics-bar capture (placeholder telemetry).
- `22-connected-live-full.png` / `23-toolbar-live-crop.png` —
  connected + analyzed, real telemetry.
- `24-metrics-overlap.png` / `25-metrics-overlap-crop.png` — the
  eval/health/queue text-overlap defect, zoomed.
- `26-other-tab-live.png` — Other tab, connected + analyzed.
- `27-subtab-{distributions,stability,multiresolution}.png` — the
  three remaining Analysis sub-tabs, sanity-checked.
- `28-disconnected-final.png` — post-DISCONNECT, confirming clean
  session teardown.

## Disposition table (against the census's relic table, updated for this pass)

| Relic | Prior column | This pass's finding | Disposition |
|---|---|---|---|
| `AT_basic_interval` 90px | (c), self-disclosed estimate, UNEXERCISED | Live sweep: clean 70px, clipped 56px | Measured basis now exists — 90px sits 20–34px above the no-clip range; candidate (a) for a future encoding-update pass (not applied here — measurement-only scope) |
| `AT_basic_scoreLead`/`AT_basic_mergedDelta` 200px×2/file | (c), self-disclosed estimate, UNEXERCISED | Live sweep: clean ≈90–95px content, dysfunction onset ≈75–80px | Measured basis now exists — 200px sits ~2× above the clean breakpoint; candidate (a), not applied here |
| Engine-controls 185px floor | (a), measured (`14ec051e`) | Re-confirmed live: 185×80, button-cluster, holds through connect/disconnect, 0.96px slack matches the citing report exactly | (a), reconfirmed, unchanged |
| `A_engine_eval`/`_health`/`_queue` unauthored floors | frontier item, "live-engine-gated follow-up" | Live natural-content need measured: 534px / 236px / 139px against a 139px column each; REAL overlap witnessed, not merely a solver artifact | Still (c) — no floor authored this pass (measurement-only scope) — but the "harmless in the real DOM" framing in `lyt-controls-floor.md` §5 is now contradicted by live evidence; flagged for the commissioner |
| `otherColorDebug`+`otherBand` composite 204px | (c), uncited | Live numbers identical to the prior no-engine wave (232px/142px) | (c), unchanged — re-confirmed, not newly resolved |

## Cleanup

Backend and frontend `systemd-run --scope` units stopped via
`systemctl --user stop lyt-eng-backend.scope lyt-eng-frontend.scope`;
both ports (19110/19111) reprobed dead afterward (`Connection refused`,
rc=1 each). `pgrep -af "chromium|vite|fastapi"` afterward shows no
process from this session (the matches present belong to unrelated,
pre-existing sessions on the host — a different worktree's own vite on
19501, the main checkout's own vite on 5174, an unrelated fastapi
`run0` wrapper — none reference this session's own ports or scratch
DB). The engine session was terminated via the app's own DISCONNECT
button (`useEngineControls.disconnect()`'s own docstring: "Terminate
the WebSocket and clear all active analyses") rather than simply
closing the browser — confirmed live: the button's own label returned
to "Connect" before the browser closed (`shots/28-disconnected-final.png`),
so no hung analysis was left on the shared engine. No `.lyt` encoding
file, no frontend/backend source file, was edited this pass — per the
commission's own "measurement report ONLY, no encoding edits"
instruction.

## Witness status summary

- Base freshness: WITNESSED (hard-reset performed, disclosed).
- Isolation (ports, DB copy, engine reachability, no forbidden-port
  contact): WITNESSED, probe outputs quoted above.
- Theme resolves light (`cluster`) throughout: WITNESSED (DOM check +
  visual, every screenshot).
- Model defaults to exactly `"14"`: WITNESSED.
- Measurement 1 (AT_basic panel minimum-useful heights): WITNESSED —
  full constrained-height sweeps for both chart panels and the table,
  screenshots at every bracketing point; the "minimum useful" judgment
  is explicitly separated from the measured breakpoints per the
  commission's own instruction.
- Measurement 2 (engine-group widths connected + controls cluster
  stability): WITNESSED — natural-content-width measured via a
  flex-shrink:0 probe (not estimated), the overlap defect confirmed
  both geometrically and visually, the controls-cluster 185px/button-
  cluster form confirmed stable across connect/disconnect with the
  exact 0.96px-slack arithmetic reconciled against the citing report.
- Measurement 3 (otherColorDebug composite): WITNESSED — numbers
  identical to the prior no-engine wave, confirming the leaf is
  analysis-independent by design.
- Measurement 4 (encoding contradictions): four items enumerated, none
  fixed, each with a specific live-witnessed basis (DOM geometry,
  screenshot, or direct source read).
- A rig-local defect (the `#control-panel` vs.
  `#control-panel-popover-mount` selector trap): WITNESSED, corrected,
  disclosed rather than hidden.
- Cleanup: WITNESSED — ports reprobed dead, no residual process from
  this session, engine session terminated via the app's own Disconnect
  affordance before browser close.

## Scope discipline

No `.lyt` encoding file, no `frontend/src` or `backend/` source file
touched — this pass is measurement-only, per the commission's own
explicit instruction. No port from the forbidden set
(4173/5173/5174/8764/1235-local/1242/195xx) or the shared live backend
(8764) was contacted at any point; the remote engine
(`192.168.122.68:1235`) was contacted only under the commissioner's own
explicit standing grant (ledger row 2366) and was cleanly disconnected
before session end. No wall-clock sleeps stand in for a real condition
anywhere load-bearing in the measurement scripts. `git stash`/hard-
reset used only for the base-freshness correction at the very start,
disclosed above; no other destructive git operation was run.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
