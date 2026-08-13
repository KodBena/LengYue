Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT N1–N4 closure verification — independent witness

Verdict: **N1 CLOSED. N4 CLOSED. N2 CLOSED. N3 CLOSED (fresh-install
default; the sample fixture's default is contaminated — see §4).**
Full frontend suite: **exit 0**, 262 files / 3289 tests passed, 3
files / 8 tests skipped.

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `f63ace69` — exactly
the commit the commission names, and its own subject line
(`fix(frontend): N2/N3 — tree absorbs freed column on demotion in
both classes (un-dragged default; drag sovereign), last-panel rail
guard removed …; finish-pass-2 majors`) already names N2/N3 as its
target. This worktree started on `worktree-agent-ae8d9fc073675e114`
at `3378806f` (`git merge-base --is-ancestor f63ace69 HEAD` → exit 1,
NOT an ancestor — `f63ace69` sat ahead of this worktree's start
point). Hard-reset onto `f63ace69`; re-verified `git log --oneline -1`
= `f63ace69 fix(frontend): N2/N3 — …`. `git status --short` clean
before and after (only this session's own `.claude/logs/` scaffolding
untracked).

## 2. Orientation read (end to end, before witnessing)

`.claude/dispatch-reports/lyt-finish-pass-2.md` (381 lines) read in
full — the N1/N2/N3/N4 finding rows (§6), the "what must close" gate
(§7), and the per-predecessor disposition table (§8). The umbrella
`CLAUDE.md` and `frontend/CLAUDE.md` were injected in full by the
harness this session. Per the commission, the closure waves' own
reports (`lyt-n1-statusbar.md`, `lyt-n2-column-rail.md`) were **not**
read before witnessing — only consulted afterward, and only to
identify source-level markers (see §3) for cross-reference, not to
borrow their measurements.

## 3. Rig (isolation)

Ports probed dead via a Python `socket.connect_ex` before use and
confirmed dead again after full teardown:

```
before: 19110 DEAD  19111 DEAD  19112 DEAD  19113 DEAD
after:  19110 DEAD  19111 DEAD  19112 DEAD  19113 DEAD
```

- **Backend** `127.0.0.1:19110` (later `19112` for the pristine rig,
  §4) — a fresh Python venv under scratch
  (`n-rig/venv`, `pip install -r backend/requirements.txt`, since
  neither the worktree nor the system Python had SQLAlchemy
  installed), `DATABASE_URI` pointed at a **copy** of
  `backend/samples/cards.sample.db`. `QEUBO_ENABLED=false`. Verified
  live: `GET /docs` → 200.
- **Frontend** `127.0.0.1:19111` (later `19113`) — `vite --strictPort`,
  `VITE_API_BASE_URL` → the matching rig backend, `VITE_KATAGO_WS_URL`
  → the real engine (`ws://192.168.122.68:1235`, probed reachable —
  not exercised; none of these findings needs analysis data, per the
  commission's dead-pin allowance).
- **Theme seed.** `profile.settings.appearance.theme` `'dark'` →
  `'cluster'`, written into each DB copy via Python `json.loads`/
  `json.dumps` on the `documents` table's `user_workspace_01` row (the
  JSON blob store backing `GlobalStore` — no separate `settings`/
  `profile` table exists). Every capture asserts
  `document.documentElement.getAttribute('data-theme') === 'cluster'`
  before measuring; Playwright forced `colorScheme: 'light'`;
  `getComputedStyle(document.body).backgroundColor` read
  `rgb(255, 245, 255)` in every run.
- **Playwright** — `systemd-run --user --scope -p MemoryMax=4G --
  nice -n 19 node --max-old-space-size=1024`, chromium at
  `/usr/bin/chromium` with `--js-flags=--max-old-space-size=1024`, one
  browser per script closed in a `finally`. Every measurement gate is
  a `waitForSelector`/`waitForFunction` on a real DOM condition
  (`#main-area` nonzero width, `data-theme`, a `filechooser` event,
  `aria-expanded`). Short `waitForTimeout` calls appear only as
  post-interaction settle bounds (200–400ms after a click/toggle,
  1300ms for SyncService's documented debounce before a reload) —
  never as the sole condition for a measurement.
- `node_modules` symlinked from the main checkout after
  `diff`-confirming `frontend/package-lock.json` byte-identical;
  removed at teardown (`ls frontend/ | grep node_modules` → empty,
  `git status --short` clean).
- Ports 4173/5173/5174/8764/1235/1242/195xx were never contacted; a
  full `ps -ef | grep -E "uvicorn|vite"` at teardown showed only
  other sessions' unrelated processes (8764 ×2, 5174, 19501) — none
  touched. Only this session's own PIDs (`3369103`/`3369154`/
  `3369166`, the pristine-rig pair) were killed.

## 4. A rig fault of my own, disclosed — same class as the predecessor's §3.1

**The sample DB's persisted `session.ui.lytPresence.boardRail: true`
is a migrated legacy value, not the app's compiled default**, and my
first N3 pass (against the untouched `cards.sample.db` copy) read it
as "the default" — which would have produced a false NOT-CLOSED
verdict for N3's "default composition" clause. Caught before finalizing:

- `backend/samples/cards.sample.db` ships at `schemaVersion: 9`, with
  a legacy `session.ui.sidebarExpanded: true` field (pre-LYT-presence
  schema).
- `frontend/src/store/migrations.ts` (~line 276) carries that legacy
  boolean forward verbatim into `lytPresence.boardRail` on load:
  `presence.boardRail = typeof u.sidebarExpanded === 'boolean' ?
  u.sidebarExpanded : false`.
- `useLytPresenceMenu.ts`'s `isVisible()` reads
  `store.session.ui.lytPresence[id] ?? defaultFor(id)` — a `??`
  chain. Because the migration **always** assigns a concrete boolean,
  the compiled per-screen-class `classDefaults` (the actual "fresh
  default" App.vue threads in) is **never** consulted for `boardRail`
  on any document that went through this legacy-migration path — only
  a document with the key genuinely absent falls through to it. Both
  `defaults.ts`'s own `DEFAULT_SESSION_UI.lytPresence` (`{ boardRail:
  false, previewBoard: false }`) and the static
  `LYT_PRESENCE_DEFAULT.boardRail` fallback are `false` — so a
  genuinely fresh install (no legacy baggage at all) computes
  `boardRail: false`, not the `true` this fixture's stale
  `sidebarExpanded: true` carries forward.

I rebuilt a second, isolated rig (backend `19112` / frontend `19113`,
its own venv reused, its own DB copy) with `sidebarExpanded` forced
`false` before first boot — reproducing what a genuinely fresh
install's post-migration state carries, rather than this fixture's
stale `true`. Also disclosed: my first attempt at this correction used
a **live `cp` of a WAL-mode SQLite file while the backend held it
open** — an unsafe copy that can read a torn/stale snapshot; I killed
the backend cleanly first before all four DB copies used in this
report's final findings (`n-rig/cards.rig.db`,
`n-rig/cards.pristine.db`) were cut, and confirmed `updated_at`
freshness before trusting any read. §6's N3 verdict rests on the
freshly-rebuilt pristine rig; §6 still names the original contaminated
reading for cross-reference.

## 5. N1 / N4 — status bar, real captures

Loaded `/home/bork/sgf_validation/1700-ish.sgf` (an old-rules 1700s
game with genuine repeated-point captures) through a real
`filechooser` event, navigated to the final node via the move-nav
cluster's last button.

| Viewport | `scrollWidth` | `clientWidth` | Pass hit-test | `.caps` hit-test | Captures |
|---|---|---|---|---|---|
| **N1** 420×880 | 420 | 420 | reachable, `BUTTON.pass-btn` at (327.9, 597) | reachable, `SPAN.caps` at (383, 597) | `B: 4 · W: 3` |
| **N4** 1280×1024 | 647 | 647 | reachable, `BUTTON.pass-btn` at (734.9, 985) | reachable, `SPAN.caps` at (790, 985) | `B: 4 · W: 3` |

Both bars: `scrollWidth === clientWidth` (no overflow at all, not just
"has a scrollbar"), Pass rect fully inside the viewport (420×880:
`left=309.8, right=346`; 1280×1024: `left=716.8, right=753`), `.caps`
rect fully inside the viewport with real nonzero counts. This is the
regression the finish-pass-2 report flagged as the sole BLOCKER
(`scrollWidth 530` vs `clientWidth 420`, `Pass` centre outside the
viewport, `B: 0 · W: 0` wholly outside) — now closed at both named
viewports.

Screenshots: `N1-vp420x880-0{1,2,3}-*.png`,
`N4-vp1280x1024-0{1,2,3}-*.png`; raw facts in
`N1-vp420x880-statusbar-facts.json` / `N4-vp1280x1024-statusbar-facts.json`.

**Verdict: N1 CLOSED. N4 CLOSED.**

## 6. N2 — 1920×1080 side column

At 1920×1080 the control panel is demoted by default
(`#control-panel-summon-btn` present, confirming the width-evaluator
still yields the same class of composition finish-pass-2 witnessed).
The side-column grid node (`id="tree-control-wrapper"`) resolves to:

```
gridTemplateColumns: "614px 0px 0px"   (was "230px 0px 0px" — 384px unclaimed)
```

Tree gets the **full 614px** track; the second and third tracks are
genuinely `0px` (not present-but-empty) — **0 unclaimed pixels**,
against the finding's own 384px / ~318,000px² blank band. The tree
widget's own SVG is still only 60px wide inside that 614px wrapper
(60×2340) — a real defect, but it is N6 ("featureless vertical line"),
explicitly **not** in this commission's must-close set, and is not
conflated with N2's "does the column go unclaimed" question here.

Summon popover: clicking `#control-panel-summon-btn` sets
`aria-expanded="true"` and mounts one `.control-panel-popover` element
at `664×600` — matching the finding's own cited dimensions, confirming
the popover fallback still works.

`#main-area` overflow: `scrollWidth 1925` vs `clientWidth 1920` — **5px**
horizontal overflow, `scrollHeight 1080 === clientHeight 1080` — **no**
vertical overflow. 5px is exactly the commission's disclosed figure
(the pre-existing 1px sliver × ~5, or however the prior reports
characterized it) — confirmed as the **only** overflow on this
element at this viewport.

Screenshots: `N2-vp1920x1080-01-initial.png`,
`N2-vp1920x1080-02-summon-popover.png`; raw facts in
`N2-vp1920x1080-grid-facts.json`.

**Verdict: N2 CLOSED.** No blank band (0px, was 384px); summon
popover functional; the 5px `#main-area` overflow is real, quantified,
and the only overflow present.

## 7. N3 — 420×880 board rail

**Two runs, disclosed separately** (§4): the first, against the
unmodified sample fixture, shows `lytPresence.boardRail: true`
(a migrated legacy value) — default composition still shows the
168px-tall rail with an empty 150×150 `.board-preview` at the top,
board offset `top: 270`. Read in isolation this would look like N3
had NOT closed. The **second run**, against the corrected pristine
rig (§4), shows what a fresh install actually computes:

| Check | Pristine result |
|---|---|
| `window.store.session.ui.lytPresence` | `{ boardRail: false, previewBoard: false }` |
| `.board-preview` mounted by default? | **No** (`boardPreviewPresent: false`) |
| Board top offset | `102px` (toolbar/status chrome only — not the 168px rail's 270px) |
| Presence-menu `boardRail` checkbox | unchecked, **not** disabled |
| Toggle ON | `.board-preview` mounts, `150×150`, `top: 56` |
| Toggle OFF again | `.board-preview` unmounts (`present: false`) — no dead 150×150 box left behind |

The rail is genuinely **off by default** on a fresh install; the
168px/empty-box composition the original N3 finding described is
reachable only if a user (or, as here, a stale fixture) explicitly
carries `boardRail: true` forward. The **guarded case** the commission
specifically calls out — "the presence menu can toggle boardRail on
AND back off" — is witnessed working cleanly both ways, at both
default states (checkbox `disabled: false` in both the contaminated
and pristine runs — the last-remaining-panel guard removal holds
regardless of the persisted value).

One caveat: the 150×150 box is still content-empty when toggled ON
(`childCount: 0`) — that is N5 ("permanently empty preview shelves"),
explicitly **not** in this commission's must-close set, and unrelated
to N3's "is there a dead box in the *default* composition" question.

Screenshots: `N3-pristine-0{1,2,3,4}-*.png` (authoritative),
`N3-vp420x880-0{1,2,3,4}-*.png` (contaminated-fixture run, kept for
contrast); raw facts in `N3-pristine-facts.json`.

**Verdict: N3 CLOSED**, on the fresh-install default the app actually
computes. Flagging for the commissioner: the **shipped sample fixture**
(`backend/samples/cards.sample.db`) itself defaults to the
pre-closure composition (rail on, 270px chrome) because of the
`sidebarExpanded: true` legacy carry-forward — cosmetic for this
verification (not a regression in application code — the fixture
predates the presence-menu schema and nothing regenerated it), but
worth a follow-up note if that sample DB is ever used as a "what does
a new user see" demo.

## 8. Regression spot-checks

- **2560×1440 panel presence + resizer persistence.** No
  `#control-panel-summon-btn` at this width (`summonBtnPresent:
  false`) — the panel renders **in-flow**, one element measured at
  `663×33` (a tab-header strip; the panel body extends below it).
  `#resizer-outer` present at `left: 1742, width: 1, height: 1188`.
  Dragged it left by 100px, read
  `window.store.session.ui.treeControlRegionWidthPx` before (`919`)
  and after a full page reload (`919`) — **persists across reload**.
- **420×880 board dominance + horizontal portrait tree.** With
  `1700-ish.sgf` loaded: board element `420×314` (top `270`, matching
  the pre-N3-pristine-fix chrome height since this run reused the
  contaminated-fixture rig — the board itself still clears the
  commission's "~306px+" bar), tree SVG `4860×60` — width far exceeds
  height, confirming the horizontal-in-portrait rendering holds.

Screenshots: `REGR-vp2560x1440-0{1,2}-*.png`,
`REGR-vp2560x1440-panel-check.png`, `REGR-vp420x880-board-01-*.png`.

**Verdict: both regression spot-checks hold — no regression found.**

## 9. Full frontend suite

```
NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 \
  nice -n 19 npm run test:run
```

Run under the same `systemd-run --user --scope -p MemoryMax=4G` wrapper.

```
Test Files  262 passed | 3 skipped (265)
     Tests  3289 passed | 8 skipped (3297)
  Duration  116.16s
```

**Exit code: 0.**

## 10. Summary table

| Finding | Verdict | Key measurement |
|---|---|---|
| N1 (420×880 status bar) | **CLOSED** | `scrollWidth 420 === clientWidth 420`; Pass + `B:4·W:3` caps both hit-test-reachable and fully in-viewport |
| N4 (1280×1024 status bar) | **CLOSED** | `scrollWidth 647 === clientWidth 647`; same reachability + real captures |
| N2 (1920×1080 side column) | **CLOSED** | Tree column `614px 0px 0px` — 0 unclaimed px (was 384px); summon popover `664×600` functional; `#main-area` overflow exactly 5px, horizontal-only |
| N3 (420×880 board rail) | **CLOSED** (fresh-install default) | Pristine rig: `lytPresence.boardRail: false` by default, no `.board-preview` mounted, checkbox unchecked+enabled, toggles both ways cleanly. Shipped sample fixture itself still defaults rail-on via a legacy `sidebarExpanded` carry-forward — disclosed, not an app regression |
| Regression: 2560×1440 panel + resizer persistence | **HOLDS** | Panel in-flow (no summon btn), resizer drag `919px` survives reload |
| Regression: 420×880 board dominance + horizontal tree | **HOLDS** | Board `420×314`; tree SVG `4860×60` |
| Full frontend suite | **PASS** | exit 0, 3289/3297 tests passed (8 skipped), 262/265 files |

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
