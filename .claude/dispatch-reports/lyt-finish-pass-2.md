Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish pass #2 — cantankerous re-verdict

Verdict: **MET-WITH-FIXES.** Which must close: §7.

## 1. Base freshness (FIRST ACT)

`git fetch origin lyt-phase2` resolved `origin/lyt-phase2` to
`85c5f023` — exactly the commit the commission names. This worktree
started on `worktree-agent-abf7a077de7f6e432` at `3378806f`
(`git merge-base --is-ancestor 85c5f023 HEAD` → exit 1, NOT an
ancestor). Hard-reset onto `85c5f023`; re-verified `git log --oneline -1`
= `85c5f023 fix(frontend): engine-metrics compact realization…`.

## 2. Orientation read (end to end, before any capture)

`.claude/dispatch-reports/lyt-finish-pass.md` (232 lines),
`lyt-wA-width-demotion.md` (715), `lyt-wB1-portrait-priority.md` (368),
`lyt-wB2-controls-menu.md` (425), `lyt-wC-contrast.md` (223),
`lyt-controls-floor.md` (302), `lyt-metrics-overlap-fix.md` (389),
`lyt-engine-measurement.md` (522), and `FEATURES.md` (824) — each read
in full. The umbrella `CLAUDE.md` and `frontend/CLAUDE.md` were
injected in full by the harness this session.

## 3. Rig (isolation)

Ports, probed dead via a Python `socket.connect_ex` before use (the
sandbox refuses `/dev/tcp` redirection in this worktree) and confirmed
dead again after teardown:

```
before: 19100 DEAD  19101 DEAD  19102 DEAD  19103 DEAD
after:  19100 DEAD-good  19101 DEAD-good  19102 DEAD-good  19103 DEAD-good
```

- **Backend** `127.0.0.1:19100` — main checkout's venv,
  `DATABASE_URI=sqlite+aiosqlite:///…/finish2-rig/cards.rig.db`, a
  **copy** of `backend/samples/cards.sample.db`. `QEUBO_ENABLED=false`.
  Verified live: `GET /docs` → 200, and the log line
  `Database initialized: sqlite+aiosqlite:////…/finish2-rig/cards.rig.db`.
- **Frontend** `127.0.0.1:19101` — `vite --strictPort`,
  `VITE_API_BASE_URL` → the rig backend, `VITE_KATAGO_WS_URL` → the
  real engine.
- **Engine** — `ws://192.168.122.68:1235`, probed reachable, model
  `"14"` (confirmed live: `EngineModelSelect` in SELECTOR mode, options
  `["14","18","nbttrf","08_01","b11c768h12nbt3tflrs"]`, `"14"` selected
  by default, no re-selection needed). Every script disconnects through
  the app's own Disconnect button and waits for `.btn-connected` to
  clear before closing the browser.
- None of 4173 / 5173 / 5174 / 8764 / 1242 / 195xx, and no local 1235,
  was contacted. `pgrep` after teardown shows no residual process from
  this session.
- `frontend/node_modules` symlinked from the main checkout after
  `diff`-confirming `package-lock.json` (`LOCK-IDENTICAL`); symlink
  removed at teardown (no git footprint).
- **Theme seed.** `profile.settings.appearance.theme` `'dark'` →
  `'cluster'` and `profile.settings.engine.katago.url` →
  `'ws://192.168.122.68:1235'`, written into the DB **copy** via
  Python `json.loads`/`json.dumps`. Every capture asserts
  `document.documentElement.getAttribute('data-theme') === 'cluster'`
  before measuring, and Playwright forces `colorScheme: 'light'`;
  `getComputedStyle(document.body).backgroundColor` reads
  `rgb(255, 245, 255)` in every run.
- **Playwright** — `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024`, chromium at `/usr/bin/chromium`
  with `--js-flags=--max-old-space-size=1024`, one browser per script
  closed in a `finally`. Every measurement gate is a
  `waitForSelector`/`waitForFunction`/`waitForEvent` on a real DOM
  condition (theme attribute, `MOVE \d+` after SGF load, the visible
  `.btn-connected` class, `aria-expanded="true"`, `.queue-count`
  crossing zero). Short `waitForTimeout` calls appear only as
  chart-mount settle bounds **after** a real condition resolved, and as
  the cadence between polls of a real DOM read — never as the sole
  condition for a measurement.

### 3.1 Two rig faults of my own, disclosed

1. **First backend launch omitted `DATABASE_URI`.** It came up against
   `sqlite+aiosqlite:///./cards.db` relative to its CWD — the
   **worktree's** `backend/`, not the main checkout's. The real
   `/home/bork/w/omega/backend/cards.db` retains mtime
   `2026-08-13 01:05:57`, four hours before this session began: it was
   never opened. The accidental 147 KB worktree DB and the `.jwt_secret`
   it generated were deleted; `git status` clean. Named rather than
   quietly fixed.
2. **My own resizer drag contaminated the shared rig workspace.** The
   2560 sweep dragged the inner resizer, persisting
   `session.ui.treePanelWidthPx` into the workspace blob, which the
   later portrait runs then inherited — making the portrait tree render
   at its 140px floor and appearing to refute W-B1's F4 fix. Caught,
   the DB re-seeded pristine, and both portraits re-run clean. **On a
   clean profile F4 is genuinely closed** (§6). Had I not re-run, this
   report would have carried a false REGRESSED verdict.

### 3.2 Disclosed limitations

- The sample DB's SGF **library is empty**, so the populated Library
  table, preview pane, and dirty-board guard were not exercisable; the
  Library **empty state** was judged instead.
- The board rail accumulates a board per Match-modal open, so
  "Board 1…6" across screenshots is my own runs' residue, not a defect.
- `QEUBO_ENABLED=false`, so the qEUBO surfaces are unjudged.
- A single `503` console error (`/resources/visit-distribution`)
  appears at boot in every run — the same rig/sample-data artifact
  every prior LYT report records.

## 4. THE MANDATED CENTERPIECE — whole-game range analysis

`/home/bork/sgf_validation/1986-11-06c.sgf` (Shiraishi Yutaka vs Yukawa
Mitsuhisa, **245 moves**) loaded through a real `filechooser` event,
engine connected, control panel summoned, Analysis → Basic.

The range control **already defaults to the whole game**: `245 nodes
selected · turns 0–245`, and the Visits input **already defaults to
200** — the commission's "~200 visits over the full game" is literally
the default, no drag or edit required. `Analyse Selection (245)`
clicked.

**It works.** Queue took work (`.queue-count` 0 → 1), packet rate rose
to 74 pps, and the run settled — queue back to zero and holding across
four consecutive polls — in **~8 seconds**. Faster than I expected for
245 × 200 visits; the populated charts (dense traces across the full
0–245 domain, plausible per-player values) are consistent with a real
whole-game pass, so I report the timing as observed rather than
disputing it.

Populated by that one run, at 1920×1080 and re-confirmed at 2560×1440:

| Panel | State after the run |
|---|---|
| Interval Summary | populated — Black `moves 0–122`, White `moves 0–121`, real values (0.764 / 0.648 at 2560) |
| Game State (Turns) | populated — Complexity / Win Probability / Score Advantage over 0–245 |
| Per-Player Performance (Delta View) | populated — Black Delta / White Delta / Mistakes over 0–122 |
| Per-Move Delta Distribution (KDE) | populated — bimodal, with confidence bands, axis labelled `delta_fn output` |
| Gaps Between Own-Colour Mistakes | populated — per-colour histogram, axis labelled `own-colour move gap` |
| **Stability** | **populated** — see §5 |
| Multiresolution Interval Analysis | rendered — 3 canvases, 612×422 |

Screenshots: `cp-04-analysis-pre-1920.png` (empty states),
`cp-05-analysis-running-1920.png` (in flight),
`cp-06-analysis-complete-basic-1920.png`,
`vp2560x1440-07-analysis-complete.png`,
`vp2560x1440-08-subtab-distributions.png`.

## 5. THE STABILITY SUB-TAB (row 2372's open question) — REFUTED

The measurement pass left this open: Stability showed "No Per-Turn
Stability (log-V weighted) data yet." after a completed 40-visit
analysis.

**Confirmed populating via the range-analysis flow.** After the
whole-game 200-visit run, the Stability sub-tab renders the STABILITY
metric selector (Top-1 move / Top-3 move set / Score-lead sign /
Winrate quintile / confidence margin / `Anchored at V_term` /
`Anchored at V_max` / Longest run) **and** a
`PER-TURN STABILITY (LOG-V WEIGHTED)` chart with a real Stability trace
plotted across turns 0–245 on a 470×159 canvas. The empty-state text is
gone. Witness: `cp-07-subtab-stability-1920.png`,
`vp2560x1440-08-subtab-stability.png`.

So the sub-tab is **not broken**; the prior pass's 40-visit run simply
did not produce the data. Row 2372's question can be closed.

**One caveat, filed as m1.** With `Top-1 move` / `Anchored at V_term`
selected, the trace is a **flat line at 1.00 across the entire game**,
plotted on a **0.00–2.00 y-axis** for a metric that cannot exceed 1.00.
Half the plot area is structurally unreachable and the chart tells the
reader nothing. The mechanism works; the default view of it is
degenerate.

## 6. Ranked findings

| # | Sev | Viewport(s) | Surface | What is wrong / why it fails the bar | Witness |
|---|---|---|---|---|---|
| **N1** | **BLOCKER** | 420x880 | Status bar | The **`Pass` button and the capture counts are off-screen and unreachable.** `#status-bar` `scrollWidth 530` vs `clientWidth 420`, ancestor `overflow-x: hidden`, **no scrollbar**. `Pass` rect `x=411.3…451.5` — its centre (431) lies outside the 420px viewport, so `elementFromPoint` cannot reach it; `B: 0 · W: 0` (`x=463.5…529.5`) is wholly outside. Pass is the app's only pass affordance (FEATURES.md's own "alongside Pass" toolbar note). **This is a REGRESSION**: the predecessor explicitly certified "no offscreen children at any of the five sizes, including 420px". | `statusbar.json`, `clean-vp420x880-02-sgf.png` |
| **N2** | MAJOR *(borderline blocker)* | 1920x1080 | Side column / control panel | At the flagship desktop resolution the **primary 5-tab panel is absent from the layout while 384px of the column it would occupy is permanently blank**. `gridTemplateColumns: "230px 0px 0px"` in a 614px side column: tree 230px, control panel 0px, **384px unclaimed**, floor to ceiling (828px) — ~318,000 px², 15% of the viewport, empty pink. The substitute is a 664×600 popover that **covers 67,488 px² of the board** (114×592, hiding the right coordinate rail). The only recovery is the outer resizer, which restores the panel in-flow (`"230px 664px 0px"`) **only by collapsing the board to 109px wide** — 5.7px per line, unusable. So 1920×1080 offers board **or** panel, never both. F1's clipping is closed by eviction, not by fitting. | `vp1920x1080-01-initial.png`, `gaps-vp1920x1080.json`, `cp-06-analysis-complete-basic-1920.png` |
| **N3** | MAJOR | 420x880, 768x1024 | Board rail, portrait | The board rail is **locked on** and consumes **168px — 19% of an 880px viewport — at the very top**, of which a **150×150 `board-preview` box is measurably empty** (`empty: true, childCount: 0`). The presence menu's Board Rail checkbox is `disabled` with title *"At least one panel must stay visible"*, so the user **cannot** reclaim it. Consequence: chrome above the board is **270px** at both portrait sizes and the drawn board is **306×306 (35% of height)** at 420 and **760×450 (44%)** at 768. Repetition-first says board primary; a guard enforces the opposite. F3 is much improved (306px ≫ the predecessor's 128px) but the priority is still inverted. | `clean-vp420x880-02-sgf.png`, `facts-clean-vp420x880.json`, `facts-clean-vp768x1024.json` |
| **N4** | MAJOR | 1280x1024 | Status bar | Same class as N1, smaller blast radius: the bar is 472px wide under a 647px board while its content needs 530px, so `B: 0 · W: 0` is unreachable (`x=643.5`, hit-test fails). `Pass` survives here. | `statusbar.json` |
| **N5** | MAJOR | all | Empty preview shelves | Two independent surfaces ship a permanently empty preview box. (a) The board rail's `board-preview`, 150×150, `childCount: 0`, at every viewport — and its `thumb-list` is 862px tall holding 224px of thumbs, ~638px blank. (b) In the Basic sub-tab, **two wood-textured empty board thumbnails sit permanently to the right of the Game State and Per-Player charts**, each stealing ~150px of chart width. Both read as unfinished scaffolding. F8 STILL OPEN. | `gaps-vp1920x1080.json`, `vp2560x1440-07-analysis-complete.png` |
| **N6** | MAJOR | 1920, 2560, 1280 | Game tree, landscape | The node chain svg is **60px wide** inside a **230px** (1920) / **151px** (2560) / **140px** (1280) column — 170 / 91 / 80px of dead width, directly beside the column N2 says is starving. Worse as a *widget*: for a 245-move game it is a **featureless vertical line of alternating dots** — no move numbers, no branch structure, 34 of 247 nodes visible at 1920 (svg 60×5940 in an 828px viewport). It scrolls correctly, so nothing is unreachable; it simply conveys almost nothing. F7 STILL OPEN. | `vp1920x1080-01-initial.png`, `vp1920x1080-02b-tree.png` |
| **N7** | MAJOR | 1920, 2560 | Toolbar region | No spacing rhythm. At 1920: the engine cluster is 185×80 at `x=1306`; the eval/health/queue badges sit on the same top line spread from `x=1495` to 1920; then a **~90px vertical gap**; then the app-cluster row (LOAD/SAVE SGF, ENGINE URI, SLIDERS, locale) at `y≈163`; then **~90px more blank** before the tree at `y=252`. At 2560 the same shape with the same two arbitrary gaps. The gaps are neither consistent nor purposeful. F6 STILL OPEN. | `vp1920x1080-01-initial.png`, `vp2560x1440-01-initial.png` |
| m1 | MINOR | all | Stability chart | Trace is **flat at 1.00** across all 245 turns on a **0.00–2.00 axis** for a [0,1] metric — half the plot area structurally unusable, and the default metric pairing conveys nothing. Data is present; the default view of it is degenerate. | `cp-07-subtab-stability-1920.png` |
| m2 | MINOR | all | Glyph contrast | 6 sub-floor text instances remain, all glyphs: the watchdog `●` at **1.06:1** (`rgb(0,255,136)` on pink) and three `⚠` tooltip hints at **1.89:1**. The dot is defensible as a status light (W-C's own ornament carve-out); a **`⚠` warning marker at 1.89:1** is a semantic signal that does not read. The predecessor's named sites (`CLEAR ALL`, the `MOVE` chip) are gone. | `sweep-*.log` contrast probe (identical 6 at all five viewports) |
| m3 | MINOR | all | Corner chrome | The `DEBUG` pill is `border-radius: 999px` beside three 3px-radius siblings — two shape languages in a 4-item cluster. Dev-build only. (The predecessor's duplicate-`☰` half is closed — see F10.) | `gaps-vp1920x1080.json` |
| m4 | MINOR | 420x880 | App cluster | **Zero gap** between the `SAVE SGF` button's right edge and the `ENGINE URI` label — they abut. | `clean-vp420x880-02-sgf.png` |
| m5 | MINOR | 420x880 | Eval badge | The eval column is **74.3px** at 420, against the **119.94px worst-case content width** `ToolbarEngineMetrics.vue`'s own header cites. No overlap was witnessed (live values are short: `EVAL 48.4%/-1.3`, `overlapEH:false`), so this is a **latent** negative margin, not an observed defect — named because the component's own cited arithmetic does not hold at this column. | `sweep-420x880.log` metrics probe |
| m6 | MINOR | — | `FEATURES.md` | Self-contradictory on Pass: line 51 says "no UI surface for issuing one ships today `[planned]`"; line 659 places Pass on the status bar. The status bar does ship a Pass button (and N1 is about its reachability). One of the two entries is wrong. | `FEATURES.md` |

## 7. What must close

**N1 is the only blocker.** A core game control unreachable at a
supported viewport, and a regression against a property the previous
pass certified, is not shippable at any bar.

**To reach MET, N1 and N4 must close** (one root cause: the status
bar's content exceeds its track and its ancestor hides the overflow
with no scrollbar), **and N2 must close or be explicitly accepted by
the commissioner as the intended composition at 1920×1080.** N2 is the
single most damaging thing a demanding Go player meets in this build,
and I have deliberately not called it a blocker only because nothing is
unreachable — the panel is one click away. If the commissioner reads
"384px of blank pink where the primary panel should be, at the most
common desktop resolution" as unshippable, escalating N2 to blocker is
a reading I would not argue with.

N3 and N5–N7 should close before this reaches users; m1–m6 are
defensible to defer, though m6 is a one-line doc fix.

## 8. Per-predecessor-finding disposition

| # | Predecessor finding | Disposition | Evidence |
|---|---|---|---|
| F1 | Side column narrower than content, 284/367/156px unreachable, no scrollbar | **CLOSED** | `#main-area` `scrollWidth === clientWidth` at 1920 / 2560 / 1280 / 768. Registry `↺` buttons and selects that read "offscreen" are inside a **scrollable** popover (`scrollHeight 1240` vs `clientHeight 598`) — reachable by scrolling, which the standing disposition permits in registries. `Re-run setup wizard` hit-tested **reachable**. *But see N2: closed by eviction, and N1/N4 are the same defect class relocated to the status bar.* |
| F2 | `Connect` unreachable at 1280x1024 / 420x880 | **CLOSED** | Hit-tested reachable at **all five** viewports; `button-cluster` form everywhere (the 185px floor landed), `overflowsStrip: false`. At 1280: `Disconnect` at `x=894,y=56,w=90`, `atTag: BUTTON.toolbar-btn`. At 420: `x=55,y=704`. |
| F3 | Portrait board 128px @420 / 272px @768, 48% chrome | **PARTIALLY CLOSED** → **N3** | Board now **306×306** @420 (was 128) and **760×450** @768 (was 272). But chrome above the board is **270px (30.7%)** @420, dominated by a **locked-on** 168px board rail. Better, not right. |
| F4 | Portrait tree a 140×140 square in a 768px row, 5/97 nodes | **CLOSED** | On a **pristine** profile: tree panel spans the **full row** — 420px @420, 768px @768, `gridTemplateColumns: "420px 0px 0px"` / `"768px 0px 0px"`, `unusedRowPx: 0`, svg 5940×60 (genuinely horizontal), 18 / 33 of 247 nodes visible, `overflow-x: auto` so the rest is reachable. (My first reading of 140px was my own drag contamination — §3.1.) |
| F5 | System-log overlay occludes interactive chrome | **CLOSED** | Opened deliberately: rect `1644,944 264×84`, `overlapsBoard: false`, **`occludedControls: []`**. |
| F6 | ~470×250 / 1000×260px of empty toolbar space, no rhythm | **STILL OPEN** → **N7** | Unchanged shape at 1920 and 2560. |
| F7 | 60px tree svg in a 230/307px column | **STILL OPEN** → **N6** | svg still 60px; column 230px @1920, 151px @2560, 140px @1280. |
| F8 | Permanently empty ~150×150 preview shelf; rail mostly blank | **STILL OPEN** → **N5** | `board-preview` 150×150, `empty: true`, `childCount: 0`, every viewport. The portrait `Board 1` hit-test half is closed — rail tabs test `reachable: true`. |
| F9 | 7 low-contrast text instances; `--accent-primary` 2.08:1 on `CLEAR ALL` and the `MOVE 95` chip | **CLOSED** for the named sites | Runtime WCAG audit: the two named sites no longer violate. **6** residual instances remain, all glyphs (m2). |
| F10 | Two identical `☰` glyphs; `DEBUG` pill shape mismatch | **CLOSED** (glyph half) | Now three **distinct** glyphs with titles: `☰` *Open Control Panel*, `⚙` *Panels*, `≡` *Toggle system log*. Radius mismatch persists (m3). |
| F11 | Summon popover paints `--surface-0`, identical to page background | **CLOSED** | Popover `rgb(254,218,247)` vs page `rgb(255,245,255)`, `1px solid rgb(122,111,109)` border — a distinct surface at every viewport. |
| F12 | Mid-word truncation in tab labels | **CLOSED** | Truncation probe: **0** clipped elements at 1920 / 2560 / 768. The single hit at 1280 / 420 is `.player-names` with `text-overflow: ellipsis` — legitimate. |
| F13 | Focusing a clipped control silently scrolls the workspace | **CLOSED** | No overflow to scroll; `#main-area` `scrollLeft: 0`, `scrollWidth === clientWidth`. |
| F14 | Inner resizer inert at 1280 | **CHANGED, not closed** | The inner resizer **no longer exists** at 1280 or 1920 — it renders inside the control-panel node, which is demoted, so the affordance is *absent* rather than inert. The **outer** resizer works but see N2 (restores the panel only by collapsing the board to 109px). At 2560 the inner resizer moves the tree 151→140 (its floor); my restore attempt did not return it to 151, but I re-grabbed at a stale coordinate, so I do **not** claim irreversibility. |

## 9. What is genuinely good

Named honestly, not as ballast.

- **The style bans hold, exactly.** Runtime audit over every rendered
  element at every viewport: **0 box-shadows, 0 non-zero transition
  durations, 0 blur filters**. Still zero, not "mostly".
- **Light is unambiguously the face.** `data-theme="cluster"`,
  `rgb(255,245,255)`, no dark leakage in any of 100+ captures.
- **The two blockers the predecessor named are genuinely closed.** No
  clipped side column, and `Connect` reachable everywhere.
- **The centerpiece works end to end.** A 245-turn, 200-visit
  whole-game range analysis against the real engine completes and
  populates seven panels across four sub-tabs — including Stability,
  which the open question doubted.
- **The Distributions charts are genuinely well made** — a KDE with
  confidence bands and a per-colour mistake-gap histogram, both with
  labelled axes, legends, and honest scales. These would not embarrass
  the app in front of a researcher.
- **Form invariance is real.** connect → open the Match modal → close
  leaves the engine cluster's form and height **byte-identical**
  (`button-cluster`, 80px) at every one of the five viewports — the
  property W-B2's state-invariance correction claimed, witnessed live
  rather than stubbed.
- **The engine-metrics overlap is closed under real telemetry.** eval
  `right=1596.2` vs health `x=1638`; health `right=1719.8` vs queue
  `x=1781` — 42px and 54px of genuine clearance, `overlapEH: false`,
  `overlapHQ: false`.
- **The compact badge + popover tradeoff is the right call.** The eval
  popover carries VERSION, the **real interactive** model `<select>`
  with all five options, and full winrate/lead; health carries full
  PPS/latency/watchdog. Judged explicitly, as the commission asked:
  **hover-to-reach-the-model-selector is worth it.** Model selection is
  a rare, deliberate act; winrate/lead are the glanceable pair and they
  stay inline at full precision. The cost is real — the selector is no
  longer keyboard-reachable without a hover-equivalent, and it mounts
  only while open — but 139px cannot hold a 175px `<select>`, and every
  alternative (truncating the value, dropping identity) loses more.
- **The presence menu is honest.** The demoted row reads *"Control
  Panel — Not enough width right now — reachable via the summon
  button"*, carries the same text as a `title`, keeps the checkbox
  **enabled** and **checked** (user sovereignty preserved), and the
  disabled Board Rail row explains itself (*"At least one panel must
  stay visible"*) — even though that explanation is the cause of N3.
- **All three popover dismiss paths work in portrait** — Escape,
  outside click, re-trigger, each verified to return
  `aria-expanded="false"` in a clean cycle at 420 and 768.
- **The setup tool palette obeys its standing rule.** Enabled via the
  presence menu it renders `setup-toolkit open` at `x=1304, 296×92`
  with `overlapsBoard: false` — board right edge 1292, trigger left
  edge 1304.
- **The board is still the best thing in the application** — 1114×1028
  at 1920, 1549×1388 at 2560, four-edge coordinates, gradient stones,
  legible last-move ring.
- **Empty states remain honest** — "No games in library. Import some
  SGFs to begin.", "No Game State (Turns) data yet.", "Run a deck to
  populate the view.", "No queries in flight."

## 10. Screenshot index

All under
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/finish2-rig/shots/`
(scratch, not committed — established LYT convention).

**Centerpiece (1920x1080, engine connected):**

| File | Surface |
|---|---|
| `cp-01-initial-1920.png` | initial load |
| `cp-02-sgf-loaded-1920.png` / `cp-02b-tree-landscape-1920.png` | SGF loaded; tree crop |
| `cp-03-connected-1920.png` / `cp-03b-toolbar-connected-1920.png` | engine connected; toolbar crop |
| `cp-04-analysis-pre-1920.png` | Analysis → Basic, empty states |
| `cp-05-analysis-running-1920.png` / `cp-05b-toolbar-running-1920.png` | range analysis in flight |
| `cp-06-analysis-complete-basic-1920.png` | **charts populated by the whole-game run** |
| `cp-07-subtab-{distributions,stability,multiresolution}-1920.png` | the three other sub-tabs, populated |
| `cp-09-eval-popover-1920.png` / `cp-10-health-popover-1920.png` / `cp-11-queue-popover-1920.png` | the three badge popovers |
| `cp-12-disconnected-1920.png` | clean teardown |

**Per-viewport sweep**, `TAG` ∈ {`vp1920x1080`, `vp2560x1440`,
`vp1280x1024`, `vp768x1024`, `vp420x880`}:

| File | Surface |
|---|---|
| `TAG-01-initial.png` | initial load |
| `TAG-02-sgf-loaded.png` / `TAG-02b-tree.png` | SGF loaded; game-tree crop |
| `TAG-03-connected.png` / `TAG-03b-toolbar.png` | engine connected; toolbar crop |
| `TAG-04-controlpanel-open.png` | control panel (in-flow or summoned) |
| `TAG-05-analysis-pre.png` / `TAG-06-analysis-running.png` / `TAG-07-analysis-complete.png` | the range-analysis arc |
| `TAG-08-subtab-{distributions,stability,multiresolution}.png` | analysis sub-tabs |
| `TAG-09-tab-{library,cards,settings,other}.png` | every control-panel tab |
| `TAG-10-settings-*.png` (5) | Session (UI), Analysis Environment, Advanced Registry, Analysis Layout, Keybindings |
| `TAG-11-advanced-registry.png` | registry reachability evidence |
| `TAG-12-presence-menu.png` | presence menu open |
| `TAG-14-after-resizer-drag.png` | after resizer drag |
| `TAG-15-eval-popover.png` / `TAG-16-health-popover.png` | badge popovers |
| `TAG-17-match-modal.png` | Match modal (form-invariance check) |
| `vp{768x1024,420x880}-18/19/20-portrait-*.png` | portrait summon flow |
| `TAG-21-final.png` | after clean disconnect |

**Clean-profile portrait re-run** (`clean-vp420x880-*`,
`clean-vp768x1024-*`): `01-initial`, `02-sgf`, `03-tree-row`,
`04-presence-menu`, `05-summoned`, `06-dismissed`.

**Gap probes** (`vp1920x1080-G1…G6`): outer-resizer dragged left,
inner resizer dragged, outer restored, system log open, corner chrome,
settings reachability.

**Palette** (`pal-vp1920x1080-01…03`): presence menu open, Setup Tools
enabled, setup palette open.

Machine-readable measurements accompany the shots as
`centerpiece-facts.json`, `facts-vp*.json`, `facts-clean-vp*.json`,
`gaps-vp1920x1080.json`, `statusbar.json`, and the per-viewport
`sweep-*.log`.

## 11. Verdict

**MET-WITH-FIXES.**

The fix waves did the work they claimed. Both of the predecessor's
blockers are genuinely closed, four of its six majors are closed, four
of its five minors are closed, and the mandated centerpiece — a real
whole-game 200-visit range analysis against the real engine — runs and
populates every default chart including the Stability sub-tab the
ledger doubted. The style discipline, the theme coherence, the honest
empty states, the presence-menu disclosure, and the form-invariance
property all hold under live measurement rather than only in tests.

What stops it from being MET is one regression and one composition
failure. `Pass` is unreachable at 420×880 — a control the previous pass
certified as fine, lost since. And at 1920×1080 the app's answer to
"the panel doesn't fit" is to evict it and leave 384px of the column
blank, so the flagship desktop resolution shows board-or-panel and a
large field of empty pink either way.

The encouraging read is the same one the predecessor offered, one layer
up: the *decisions* are now landing correctly — demote when narrow,
horizontal tree in portrait, compact badges with full-fidelity
popovers, cluster form stable across state — and what remains is that
the **proportions those decisions land in** are still being chosen by
arithmetic that nobody has reconciled against the width actually
available. N1, N4, and N2 are three instances of one unresolved
question: what yields when a row's content exceeds its track. Answer it
once and all three close together.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
