<!--
resolution-audit.md — ADR-0019 resolution/geometry audit of the LengYue SPA.
Scope: geometry, proportion, fit, truncation, overflow, dead space, element and
text sizing relative to viewport. Colour is OUT OF SCOPE by commission and no
finding below rests on one.
License: Public Domain (The Unlicense)
-->

# Resolution audit — does LengYue look good at different resolutions?

> Also published, with ten of the screenshots embedded, at
> <http://192.168.122.68:8080/index.php/Notes:OmegaGo_issues/Resolution_audit>
> (summarised and linked from the parent `Notes:OmegaGo issues` page).

**Verdict: no, and the reason is structural rather than cosmetic.** The frontend
contains **zero `@media` queries** (`grep -rn "@media" frontend/src` → 0 hits) and
three `@container` queries, all three inside single panels. There is therefore no
viewport-responsive layout in this application at all. What exists instead is one
flex row — sidebar | board | tree | control panel — plus a handful of fixed pixel
constants, stretched or squeezed by flexbox from 1280 px to 3840 px. Between about
1366×768 and 1920×1080 that accident works and the app is genuinely well
proportioned. Outside that band it fails in two opposite directions, both
measurable: at ≥2560 the right-hand column becomes a **1.7 %–19 %-ink desert**,
and in a tiled half-screen window the control panel collapses to its 220 px floor
where **its own navigation no longer fits inside it** and two information-bearing
tables are clipped by `overflow-x: hidden` with no scrollbar, no ellipsis and no
user-reachable recovery.

The board itself is the one thing that was clearly engineered on purpose, and it
is excellent — 92.5 %→97.4 % of its column, 47.8 %→53.2 % of the viewport, at every
aspect ratio. Everything to the right of it was left to chance.

---

## Method (short form; full detail in §Methodology)

Production build (`frontend/dist`, built on `next`) served by `vite preview` on
:19300; a scratch FastAPI backend on :19301 over a throwaway SQLite file; the
built bundle pointed at it through the Tauri override hook
`window.__LENGYUE_BACKEND_PORT__` (`frontend/src/config/env.ts`), with
`window.__LENGYUE_PROXY_PORT__` pinned to a dead port so no analysis engine was
ever contacted. playwright-core + `/usr/bin/chromium`, headless,
`deviceScaleFactor: 1`. Six viewports: 1366×768, 1600×900, 1920×1080, 2560×1440,
3840×2160 and 1280×1440 (a half-screen tile of a 2560×1440 desktop). Both the true
first-run state (fresh DB, wizard auto-open) and a hydrated workspace (39 moves
played onto the board) were measured. Every number below came from
`getBoundingClientRect` / `scrollWidth` / `Range.getClientRects`, never from
looking at a picture.

"Ink %" below is coverage of a panel by real glyph rectangles and real control
boxes on an 8 px sampling grid — a full-width empty `<div>` cannot inflate it.

---

## Findings

### R1 — CRITICAL — Information-bearing table columns are clipped by `overflow-x: hidden` with no scrollbar, no ellipsis and no user recovery

At 1280×1440 (half-screen tile) the control panel sits at its 220 px floor, and
two of its content surfaces are hard-clipped:

| surface | `scrollWidth` | `clientWidth` | lost | `overflow-x` | `text-overflow` |
|---|---|---|---|---|---|
| `.library-split-list` (Library game table) | 284 | 195 | **89 px (31 %)** | `hidden` | `clip` |
| `.dashboard` (Analysis range panel) | 313 | 219 | **94 px (30 %)** | `hidden` | `clip` |

The Library table's **`Result` column renders 3.1 px of its 80 px** — 96 % of the
win/loss column of a Go game library, gone. `overflow-x: hidden` is not
user-scrollable: a wheel, a trackpad swipe and a scrollbar all do nothing (the
element only moves under a programmatic `scrollLeft` assignment, which no user
has). There is no ellipsis to signal the loss either, because `text-overflow` is
`clip`. The panel simply lies about how many columns it has.

*Evidence:* `resaudit-library-clip-1280x1440.png`,
`resaudit-analysis-clip-1280x1440.png`.
*Rule:* appendix C13 (typed semantic elements — a table with real columns), and
ADR-0019 Rule 1: no exemplar in the genre (OGS's game list, Sabaki's file list,
KaTrain's panels) silently deletes a table column. Sabaki and OGS wrap, stack, or
scroll; none clip.
*Shortest honest fix:* `overflow-x: auto` on both containers, so the clip becomes
a scroll. One line each. A better fix drops columns by declared priority below a
container-query threshold, as OGS does.
*Substitution test (ADR-0008):* the observed instance costs the `Result` column.
The failure shape is "a container that is narrower than its content deletes the
content and says nothing" — substitute the Cards review queue, a score summary,
or an engine winrate column and the same code path silently hides the number the
user opened the panel to read. Worst case is a wrong decision made on a
confidently-rendered partial row. CRITICAL.

---

### R2 — HIGH — The control panel's 220 px floor is smaller than the control panel's own navigation

`CONTROL_PANEL_MIN_WIDTH_PX = 220`
(`frontend/src/composables/chrome/useResizablePanel.ts:190`). Its own comment
states the derivation: *"4 tabs × ~50px each + gaps"*. There are **five** tabs.
Measured at 1280×1440:

- top-level tab strip natural width **252 px** vs `clientWidth` **219 px**;
- the `Other` tab spans x = 1269.8 → 1312.8, i.e. **32.8 px beyond the 1280 px
  viewport**, showing **10.3 px of its 43 px (24 %)**;
- the Settings sub-tab strip is **393 px** natural vs 219 px client — `Analysis
  Layout` and `Keybindings` measure **0 px visible**, both before and after
  exhausting `#control-panel`'s entire 33 px of horizontal scroll;
- 19 elements in the Settings tab and 6 in the Library tab have their right edge
  past the viewport.

Recovery exists but is undiscoverable: a scroll-less `overflow-x: auto` on
`div.tab-body` (393 → 219) and on `#control-panel` (252 → 219). No scrollbar is
painted, no chevron, no "more" affordance, and the `li` elements carry
`tabIndex: -1` with no `role`, so keyboard traversal is not an escape hatch
either. The user's only visible cue that a fifth tab exists is a 10 px sliver of
un-lettered background.

The floor is also reachable at ordinary desktop sizes, not just tiles: any window
narrower than ~1300 px with the board expanded lands on it.

*Evidence:* `resaudit-boot-1280x1440.png`, `resaudit-workspace-1280x1440.png`,
`resaudit-settings-subtabs-1280x1440.png`.
*Rule:* ADR-0019 Rule 1 (Sabaki, KaTrain and Lizzie all keep their panel tabs
whole and wrap or shorten rather than amputate); appendix C21 (a 10.3 px-wide
pointer target against a 24 px baseline); C25 (navigation must remain navigable).
*Shortest honest fix:* raise the constant to the measured natural strip width
(252 px covers today's five tabs; derive it rather than hand-count it again), and
give the tab strips `overflow-x: auto` with a visible scroll affordance. Note the
in-repo coupling the same comment records: the 479 px container-query threshold in
`ForestDirectory.vue` is derived from this constant, so it moves too.
*Substitution test:* the observed instance hides `Other` and two Settings
sections. The shape is "a hard-coded minimum derived by counting the children that
existed on the day it was written." Substitute a sixth tab, a longer locale
(German `Einstellungen` is 40 % wider than `Settings`), or a user-added section —
the same arithmetic amputates whatever landed last. Under a translated build this
is reached at 1920×1080, not only in a tile. HIGH.

---

### R3 — HIGH — Above 1920 the right-hand column stops being a panel and becomes a wall

Ink coverage of `#control-panel`, hydrated workspace, per tab, per viewport:

| tab | 1366×768 | 1600×900 | 1920×1080 | 2560×1440 | 3840×2160 |
|---|---|---|---|---|---|
| Library | 13.1 % | 9.8 % | 7.2 % | **3.9 %** | **2.3 %** |
| Cards | 23.7 % | 18.1 % | 8.4 % | **4.2 %** | **1.7 %** |
| Settings | 62.9 % | 50.1 % | 35.7 % | 19.0 % | **8.6 %** |
| Analysis | 53.5 % | 53.0 % | 38.2 % | 28.3 % | 18.6 % |
| Other | 50.6 % | 47.7 % | 44.9 % | 31.1 % | 16.7 % |

At 2560×1440 the Library tab's entire content occupies the **top 172 px of a
1408 px panel** — 1235 px of dead height, 87.7 % of the panel. At 3840×2160 it is
the top 172 px of 2128 px: **1955 px dead, 91.9 %**. The panel is 836 px and
1396 px wide respectively, and the five-column game-list header spreads those five
labels across the full width with hundreds of pixels between them rather than
setting a measure and stopping.

Nothing in the panel has a `max-width`, and nothing reflows into columns, so extra
width becomes gap and extra height becomes void. Contrast Sabaki, which caps its
side panel and gives surplus to the board; KaTrain, which stacks additional
information into the freed space; and OGS, whose game list reflows to more rows
and a fixed measure.

*Evidence:* `resaudit-tab-library-2560x1440.png`,
`resaudit-tab-library-3840x2160.png`, `resaudit-tab-cards-3840x2160.png`,
`resaudit-workspace-3840x2160.png`.
*Rule:* ADR-0019 Rule 1; appendix C12 (a bounded measure, not a viewport
function).
*Shortest honest fix:* cap the panel's content column at a real measure
(~`60ch`) and let the surplus width go to the board, or reflow the panel to two
columns past a container-query threshold. The board is already capped by
`boardColumnMaxWidthPx`; the same discipline just was not applied on the other
side of the resizer.
*Substitution test:* worst case is not aesthetic. The panel where an operator
reads analysis output degrades toward 1.7 % ink, so information density per unit
of screen falls by an order of magnitude exactly on the hardware bought to see
more at once. HIGH.

---

### R4 — HIGH — The toolbar's contents are a viewport-invariant 900 px spread across up to 3672 px, producing ~690 px gaps

`.top-nav-bar` measured content width is **899.7 px at every one of the six
viewports**. The bar itself grows 1112 → 3672 px. The four inter-group gaps grow
with it:

| viewport | bar width | ink | ink % | largest gap |
|---|---|---|---|---|
| 1280×1440 | 1112 | 899.7 | 71.6 % | 56.8 px |
| 1366×768 | 1198 | 899.7 | 65.3 % | 78.3 px |
| 1600×900 | 1432 | 899.7 | 55.6 % | 136.8 px |
| 1920×1080 | 1752 | 899.7 | 45.4 % | 216.8 px |
| 2560×1440 | 2392 | 899.7 | 33.3 % | 376.8 px |
| 3840×2160 | 3672 | 899.7 | **21.7 %** | **696.8 px** |

At 4K, `Setup` and `Mint Card` are 689 px apart — a third of a metre of empty bar
between two buttons the user alternates between. Fitts's Law is not a suggestion:
the spread multiplies pointer travel by ~4× for zero informational gain, and the
buttons stay 18 px tall throughout.

*Evidence:* `resaudit-workspace-3840x2160.png` (measure the header row),
`resaudit-workspace-1366x768.png` for the comparison.
*Rule:* ADR-0019 Rule 1 — Sabaki, KaTrain and Lizzie all group their toolbar
buttons at one edge and leave the surplus empty as one block; none `space-between`
their toolbar across a 4K width. Appendix C21 (Fitts) is the mechanism.
*Shortest honest fix:* group the toolbar left (or centre it as a fixed-width
cluster) instead of distributing free space between the groups.
*Substitution test:* the shape is "free space distributed between controls rather
than outside them." Substitute the status bar, the tab rail, or any future
button row and the same rule scatters related controls further apart the better
the user's monitor is. HIGH.

---

### R5 — MEDIUM — The game-tree panel is a hard-coded 140 px at every resolution from 1280 to 3840

`#vue-tree-panel` measured width: **140.0 px at all six viewports**. Ink coverage
of that panel falls 44.6 % → 21.4 % as the viewport grows, and the bounding box of
its content is 75.4 px wide — the tree uses **53.9 % of 140 px** and never more,
while at 3840×2160 it is **3.6 % of the screen width** sitting next to a 1396 px
panel that is 16.7 % ink. A 39-move game renders as a single-file vertical chain
of stones; there is no width for a branch to go sideways into, at any resolution.

This is a deliberate constant with a written rationale (`App.vue`: "no
fit-to-content, no auto-grow on branch expansion or navigation"), and the
no-auto-grow half of that decision is right — a panel that jumps while you
navigate is worse. But "never grows on content change" was implemented as "never
varies with the viewport either," and those are different claims.

*Evidence:* `resaudit-tab-library-2560x1440.png` (the tree column),
`resaudit-workspace-3840x2160.png`.
*Rule:* ADR-0019 Rule 1 — Sabaki's game graph and Lizzie's variation tree both
scale with the window; a 19×19 game tree is the second most information-dense
object in the genre after the board.
*Shortest honest fix:* keep the drag-owned `treePanelWidthPx` as the single write
channel, but make the *unset* default a fraction of `#split-workspace` width
(clamped to a 140 px floor) rather than the literal 140. Content changes still
never touch it.
*Substitution test:* the shape is "a default expressed as an absolute pixel
constant in a layout with no breakpoints." At 3840 the user's most-consulted
navigation surface is 1/27th of their screen. MEDIUM — it degrades a primary
surface but hides nothing and is drag-correctable, and the drag **does** persist
(witnessed: `PUT /documents/user_workspace_01`, survives reload).

---

### R6 — MEDIUM — Half-screen tiling wastes 48 % of the board column and the layout has no answer for it

At 1280×1440 the board column is 744 × 1408 px, the goban is 736 × 736, and the
SVG letterboxes **322 px above and 322 px below** — 644 px, **48.3 % of the
column's area is empty**, versus 2.6 %–7.5 % at every conventional aspect ratio.
Simultaneously the control panel is starved to its 220 px floor and clipping (R1,
R2). The application therefore holds 645 px of unusable vertical space in one
column while amputating navigation in the next one over.

`App.vue` documents a `boardColumnMaxWidthPx` cap built for exactly the mirror
case ("a HEIGHT-bound board-square can't render past the row's own height … the
excess became dead centered margin"). The tall-narrow case has no counterpart,
because in a single-row layout there is nothing to hand the surplus *height* to.

*Evidence:* `resaudit-workspace-1280x1440.png` (measured: goban 51.7 % of the
column area, 29.4 % of the viewport, versus 92.5 %–97.4 % / 47.8 %–53.2 %
elsewhere).
*Rule:* ADR-0019 Rule 1 — the genre's answer is a breakpoint: Sabaki and OGS both
move the side panel *below* the board when the window is taller than it is wide.
The app has no breakpoint to do this with.
*Shortest honest fix:* one container query on `#split-workspace` — when
`aspect-ratio < ~0.9`, switch `flex-direction` to `column` and put the tree +
control region under the board. That single change also dissolves R1 and R2,
because the control panel then gets the full viewport width.
*Substitution test:* the shape is "one layout for all viewport shapes." Substitute
a portrait monitor (1440×2560, common for code and for reading) and the waste and
the clipping both get worse, not better. MEDIUM as observed (a tiled window is a
minority case); it is the *root* of two higher findings, which is why the fix is
worth more than its own severity.

---

### R7 — MEDIUM — Five of the setup wizard's seven steps run 101–107 characters to the line

The wizard card is a fixed 640 × 352 px at every viewport (16.7 % × 16.3 % of a
4K screen, 50 % × 24.4 % of the tile) — that fixed-ness is correct and is *not*
the finding. The finding is the measure inside it. Longest line per step,
measured against that step's own font metrics:

| step | title | longest line | measure |
|---|---|---|---|
| 1 | Choose a theme | 357.6 px | 64 ch |
| 2 | Engine connection | 595.7 px | **107 ch** |
| 3 | Default palette | 474.1 px | **85 ch** |
| 4 | Try the analysis overlays | 587.4 px | **106 ch** |
| 5 | Principal-variation display | 576.8 px | **104 ch** |
| 6 | Import your games | 564.1 px | **101 ch** |
| 7 | You're all set | 336.5 px | 61 ch |

The Bringhurst band appendix C12 names is 45–75 ch. Steps 2–6 exceed the upper
bound by 35–43 %, at 10 px, in a four-line block of unbroken explanatory prose —
the first substantial text a new user is ever shown.

*Evidence:* `resaudit-wizard-step2-1920x1080.png` through
`resaudit-wizard-step6-1920x1080.png`; `resaudit-firstrun-1280x1440.png`.
*Rule:* appendix C12.
*Shortest honest fix:* `max-width: 68ch` on the wizard body's prose elements. The
card stays 640 px; the paragraph stops at the measure.
*Substitution test:* the shape is "prose whose width is the container's width."
It is currently bounded only because the card happens to be 640 px; any future
wider dialog, or a locale with longer words, inherits an unbounded measure.
MEDIUM.

---

### R8 — LOW — Type is fully viewport-invariant, and 6 information-bearing elements render at 9 px

The computed font-size histogram is **byte-identical at 1366×768 and at
3840×2160**: 2 × 16 px, 41 × 12 px, 76 × 11 px, 17 × 10 px, 6 × 9 px. Nothing in
the application expresses a size relative to the viewport. At 3840×2160 with
`deviceScaleFactor: 1`, an 11 px label sits beside a 2100 px goban whose
coordinate letters are ~40 px — a 4× mismatch in apparent scale between the two
halves of the same window.

Honest calibration: most 4K desktop users run OS scaling at 150–200 %, which is
`deviceScaleFactor` 2 and makes this a non-event; the commission mandated dSF 1,
which is the 100 %-scaling case (real, and common on 32" panels). The 9 px and
10 px tiers are a defect at *any* resolution, not a resolution-dependent one, so
they sit at the edge of this audit's jurisdiction and are reported as LOW rather
than argued up.

*Evidence:* `p02-regions.mjs` `fontSizes` output, identical across all six
viewports; `resaudit-workspace-3840x2160.png`.
*Rule:* appendix C12's neighbourhood (legibility), ADR-0019 Rule 1 — Sabaki and
KaTrain both inherit an OS/user-settable UI font size.
*Shortest honest fix:* express the type scale in `rem` off a root size, and give
the root a `clamp()` against viewport width. That is one variable, not a redesign.
*Substitution test:* the shape is "absolute px type in an application with no
breakpoints." Worst case reached is a user on a large 100 %-scaled panel reading
9 px status text. LOW.

---

## What is actually fine

Stated with the same measurements, because calibrated grumpiness is worth more
than blanket contempt.

- **The board.** This is the best-engineered geometry in the application and it is
  not close. The goban occupies **92.5 % / 93.7 % / 94.7 % / 96.1 % / 97.4 %** of
  its column at 1366 → 3840, and **47.8 % → 53.2 %** of the whole viewport, with a
  perfectly symmetric 10 px letterbox on each side and zero top/bottom letterbox
  at every conventional aspect. It gets *better* as the screen grows. The
  `aspect-ratio` square split out onto `#board-square`, plus the
  `boardColumnMaxWidthPx` cap, do exactly what their comments claim.
- **No layout breakage at any conventional resolution.** At 1366×768, 1600×900,
  1920×1080, 2560×1440 and 3840×2160 the document `scrollWidth` equals
  `clientWidth` exactly, the overflow list is **empty**, and the truncation list
  is **empty**. There is no horizontal page scroll and nothing falls off the
  viewport anywhere in that band. That is not nothing — it is the failure mode
  most SPAs of this complexity exhibit first.
- **1366×768 specifically.** The smallest mandated size is clean: zero overflow,
  zero truncation, control panel 314 px with all five tabs whole (252 px natural),
  board 708 × 708 filling 92.5 % of its column. The 768 px-tall laptop case has
  clearly been tested.
- **Modal sizing.** 420 px for Mint Card and Play, 640 × 352 for the wizard,
  identical at every viewport, always fully on-screen, always centred. Fixed-size
  dialogs are the genre convention (Sabaki does the same), and 16.7 % of a 4K
  width is small but not wrong. The wizard's step-1 and step-7 measures (64 ch,
  61 ch) are inside the Bringhurst band.
- **The resizer contract holds and persists.** Dragging `#resizer-outer` left
  200 px at 1280×1440 moves the control panel 220 → 422 px, every clipped tab
  becomes whole, and the value **survives a reload** (witnessed
  `PUT /documents/user_workspace_01`). An earlier reading of mine that suggested
  otherwise was a race against the save debounce and is retracted. Recovery is
  undiscoverable (R2), but it is real and it is durable.
- **The board column's own dead space, at normal aspects.** 2.6 %–7.5 %. The
  48 % figure in R6 is exclusively the tall-narrow tile.

---

## Methodology

**Served artefacts.** `frontend/dist` as built on `next` (timestamped 02:11,
2026-08-08), served by `npx vite preview --port 19300 --strictPort` from
`/home/bork/w/omega/frontend`. No rebuild, no source edit — this audit is
read-only toward source.

**Backend.** `backend/venv/bin/uvicorn main:app --port 19301 --host 127.0.0.1`
with
`DATABASE_URI=sqlite+aiosqlite:///<scratchpad>/resaudit/scratch.db` and a scratch
`SECRET_KEY_FILE`. The live backend on :8764 was never contacted. The passwordless
local-install path auto-provisioned `local_user` on first token request, which is
the genuine first-run identity. The DB was **deleted and the backend restarted**
midway, after a resizer-persistence probe wrote workspace state, so that the
first-run captures in `resaudit-firstrun-*.png` are a true fresh profile and not a
profile contaminated by earlier probes.

**Engine.** Never contacted. `window.__LENGYUE_PROXY_PORT__` was pinned to 19399
(nothing listening) in an init script, so the bundle's
`ws://127.0.0.1:1242` default was overridden away from anything live.
`ws://192.168.122.68:1235` and `ws://192.168.122.1:1242` were not touched.

**Driver.** `playwright-core` 1.60 from `frontend/node_modules` against
`/usr/bin/chromium`, headless, `--force-device-scale-factor=1`,
`deviceScaleFactor: 1`, a fresh `BrowserContext` per viewport.
`window.__LENGYUE_BACKEND_PORT__ = 19301` injected via `addInitScript` (the
documented Tauri override hook in `frontend/src/config/env.ts`), so the
build-time-baked `http://localhost:8764` default never applied.

**No wall-clock sleeps.** Every wait is a `waitForSelector` /
`waitForFunction` / `waitForResponse` condition. The one place a duration appears
is a bounded `timeout:` ceiling on those conditions.

**Surfaces exercised per viewport.** First-run boot with the setup wizard
auto-open; the wizard's seven steps (at 1920×1080); a hydrated workspace with 39
moves clicked onto the board; all five control-panel tabs (Library, Cards,
Settings, Analysis, Other); the Settings sub-tab strip; the Mint Card and Play
Engine modals; the toolbar; the tree panel; the board.

**Measurements.** `getBoundingClientRect` for geometry; `scrollWidth` vs
`clientWidth` plus computed `overflow-x` / `text-overflow` for truncation;
`Range.getClientRects` over text nodes for real glyph extents and for the
character-measure figures (calibrated per element against a hidden 100-glyph probe
in that element's own computed font); an 8 px sampling grid over the union of
glyph and control rectangles for ink coverage. No finding rests on eyeballing a
screenshot.

**Probe scripts** (committed alongside this report, in
`.claude/dispatch-reports/`): `probe-lib.mjs`, `probe-ink.mjs`, `p01-boot.mjs`,
`p02-regions.mjs`, `p03-tabs.mjs`, `p04-detail.mjs`, `p05-tile.mjs`,
`p06-persist-wizard.mjs`, `p07-firstrun.mjs`, `p08-final.mjs`,
`p09-goban.mjs`, `p10-settings-tile.mjs`, `p11-scrollrecover.mjs`,
`p12-verify.mjs`. Screenshots in `assets/resaudit-*.png` (72 files).

**Memory hygiene.** `nice -n 19` and `NODE_OPTIONS=--max-old-space-size=2048` on
every browser-driving and server command.

**Teardown.** The scratch uvicorn (:19301) and the `vite preview` server (:19300)
were killed at the end of the audit; the scratch SQLite file, its sidecars and the
scratch JWT secret live only under the session scratchpad. No sub-agents were
spawned. No `git stash` was used. Nothing outside this worktree was written.

## Out of scope, and deliberately dropped

Colour was excluded by commission. Several observations were discarded on that
ground rather than reported: the theme in force during capture, every
figure-against-ground question, and the `ColorDebugStrip` surface in the Other
tab. No finding above depends on a hue, and none would change if the palette did.

Two further observations are noted but not filed as findings because they are not
resolution-dependent: the tab-strip `li` elements carry `tabIndex: -1` with no
`role` (an appendix C17 matter, relevant here only because it removes a recovery
path from R2), and a large number of controls fall below the 24 px pointer-target
baseline at every resolution equally (appendix C21, constant across the range).
