# LYT finish-pass-2 wave N1 — status bar overflow (N1 BLOCKER / N4 MAJOR)

HEAD: `9d2683c0` on `worktree-agent-ac32f20ee2452dde4`, base `85c5f023`
(`origin/lyt-phase2`).

## 1. Base freshness (FIRST ACT)

`git fetch origin lyt-phase2` resolved `85c5f023960bcd4c8371505ecf9f1703df83a978`
— exactly the commission's named base. This worktree started at
`3378806f` (a stale dependabot-merge tip); `git merge-base
--is-ancestor 85c5f023 HEAD` → exit 1, NOT an ancestor. Hard-reset to
`origin/lyt-phase2`; re-verified `git log --oneline -1` = `85c5f023`.

## 2. Orientation read

`.claude/dispatch-reports/lyt-finish-pass-2.md` (380 lines, read end to
end) — specifically §6 findings N1 and N4, §8's F1/F2 disposition (this
is the SAME defect class relocated to the status bar, not a fresh
one), and §11's closing framing ("N1, N4, and N2 are three instances of
one unresolved question: what yields when a row's content exceeds its
track"). `StatusBar.vue` and its consumer (`App.vue`'s `#leaf-I_board`
mount) read in full before editing. The umbrella `CLAUDE.md` and
`frontend/CLAUDE.md`/`frontend/tests/CLAUDE.md` were injected in full
by the harness this session.

## 3. The defect, as measured by the predecessor

`statusbar.json` (predecessor's rig): at 1280×1024, `#status-bar`
`scrollWidth: 530` vs `clientWidth: 472` — `B: 0 · W: 0` unreachable
(`x=643.5`). At 420×880: `scrollWidth: 530` vs `clientWidth: 420` —
BOTH `Pass` (`x=411.3…451.5`, centre outside the 420px viewport) and
`B: 0 · W: 0` (`x=463.5…529.5`) unreachable, no scrollbar. A regression
against the predecessor's own certified "no offscreen children at any
of the five sizes, including 420px."

`StatusBar.vue`'s existing G12 narrow-mode collapse (`.status-bar--narrow`,
engaged below a 700px bar width) already dropped `.game-info` /
`.move-numbers-btn` / `UserBadge` and ellipsized `.player-names` to
`max-width: 40%` — narrow mode WAS engaged at both defect viewports,
and still wasn't enough.

## 4. Root cause (found via a live rig re-measurement, not guessed)

Two compounding issues, both confirmed live before fixing:

1. **The `40%` cap didn't resolve the way its own comment assumed.**
   `.player-names` is a descendant of `.status-left`, an auto-width
   (shrink-to-fit) flex item. A percentage `max-width` on such a
   descendant doesn't resolve against a small "just enough" basis —
   witnessed live, Chromium resolved it against the BAR's own width.
   At a witnessed 647px bar (this session's own rig, heavier worst-case
   content than the predecessor's — see §6), the "capped" element still
   rendered **~250px** wide, alone consuming roughly a third of a
   759px natural content need. This generalizes the predecessor's
   472px/420px findings: the cap's absolute footprint scales UP with
   the very width it's supposed to help free.
2. **Even with (1) fixed, spacing/padding sized for the wide (non-
   narrow) bar still didn't leave room at 420px** with realistic
   worst-case content (a long game, heavy captures, long player
   names) — confirmed by re-running the live rig after fixing (1)
   alone: `scrollWidth` dropped from 759→600.7 at 647px width, still
   over budget at 420px.

## 5. The fix

`frontend/src/components/board/StatusBar.vue`, inside the existing
`.status-bar--narrow` tier (no new breakpoint/tier added — see §5.1
for why a two-tier design was tried first and reverted):

- `.player-names` caps at a **flat `90px`**, not a percentage —
  deterministic regardless of the bar's own width.
- `.status-left` / `.status-right` gaps tighten from `--space-medium`
  (12px) to `--space-tight` (4px).
- `ToolbarMoveNav`'s own cluster gap and button padding tighten (via
  `:deep()`, the same cross-component idiom `:deep(.user-badge)`
  already uses to reach `UserBadge`'s root class) — padding only, the
  |</>| glyphs' own font-size and the G30 24px pointer-target floor
  (`ToolbarMoveNav.vue`'s own `min-height`/`min-width`) are untouched.
- `.move-badge` and `.pass-btn` padding trim lightly (never below a
  legible/tappable floor).
- The bar's own horizontal padding tightens from `--space-default`
  (8px) to `--space-tight` (4px).

**Priority ranking used** (disclosed per the commission's ask):
`Pass` (interactive control) and `.move-badge`/`.caps` (game-state
facts — move number, captures) are NEVER hidden, NEVER capped, and
never shrunk below a legible floor — this is a structural property of
the stylesheet (no rule in this diff touches their `display` or
imposes a `max-width`), not a threshold that has to stay tuned.
`.player-names` — identity prose, lower priority than the above per
this bar's own pre-existing header comment — is the one segment that
gets a hard width cap; it was already the ONLY segment narrow mode
ellipsized rather than hid, so this fix sharpens an existing priority
call rather than introducing a new one. The move-navigation cluster
(`ToolbarMoveNav`, S7-relocated genre convention `|< < > >|`) keeps
its full glyph set and pointer-target floor at every width — only its
padding/gap tightens — because removing entries from it would be a
functional regression against the S7 relocation commission, not a
compaction; this is a judgment call, named per the commission's ask
for disclosure rather than silent narrowing.

### 5.1 A two-tier design was tried first, then reverted

The first attempt added a SECOND `useDeferredContainerBreakpoint`
threshold (`STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX`, 500px) so the
heavier compaction only engaged once narrow mode alone still
overflowed. Live re-measurement showed the SAME overflow recurring at
a 647px bar width — above the 500px ultra-narrow threshold, so that
tier never engaged there, and the defect persisted at 1280×1024 with
this session's own (heavier) worst-case content. Rather than tune a
second threshold to also cover 647px (risking a third recalibration
the next time content grows), the two tiers were collapsed into one:
apply the full tightening for the ENTIRE `<700px` range narrow mode
already covers. Being more compact than strictly necessary at the
wide end of that range (e.g. 680px) is not a defect — every element
stays legible and tappable — so the simpler, single-threshold design
was kept. This is disclosed as a design deliberation, not silently
dropped.

## 6. RIG WITNESS

**Ports.** Verified dead before use, dead again after teardown
(`python3 portcheck.py`, `socket.connect_ex`):

```
before: 19100 DEAD  19101 DEAD  19102 DEAD  19103 DEAD
after:  19100 DEAD  19101 DEAD  19102 DEAD  19103 DEAD
```

None of 4173/5173/5174/8764/1235/1242/195xx was touched (5173/5174/
8764/1235 were ALIVE throughout — other sessions' — and left alone).

- **Backend** `127.0.0.1:19100` — `/home/bork/scratchpad/venv`
  (fastapi 0.135.1, matching `backend/requirements.txt`),
  `DATABASE_URI` → a **copy** of `backend/samples/cards.sample.db`
  (`n1-rig/cards.rig.db`, not the real `backend/cards.db`).
  `QEUBO_ENABLED=false`. Verified live: `GET /docs` → 200, log line
  `Database initialized: sqlite+aiosqlite:////…/n1-rig/cards.rig.db`.
- **Frontend** `127.0.0.1:19101` — `vite --strictPort`,
  `VITE_API_BASE_URL` → the rig backend.
- **Engine** — dead-pinned (`VITE_KATAGO_WS_URL=ws://192.168.122.68:1235`
  configured but never connected) per the commission's explicit
  allowance ("engine dead-pin fine — captures can be driven by loading
  a game with captures or stubbing state").
- **Theme seed.** `'cluster'`, set via the DEV-only `window.store`
  console handle (`src/main.ts`'s own `import.meta.env.DEV` gate) —
  re-asserted after the SGF-load step, which was observed to refresh
  profile state from the backend and clobber the first assertion.
  Every measurement confirms `document.documentElement.getAttribute('data-theme')
  === 'cluster'`; Playwright forced `colorScheme: 'light'`; screenshots
  show the pink `rgb(255,245,255)`-family surface, not dark leakage.
- **Playwright** — `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024`, chromium at `/usr/bin/chromium`
  (`--js-flags=--max-old-space-size=1024`), one browser closed in a
  `finally`. Every measurement gate is a real DOM-condition
  `waitForFunction` (theme attribute, `MOVE \d+` text, captures text)
  or a real Playwright event (`filechooser`); the one `waitForTimeout`
  is a post-navigation settle bound after `nav.end`'s synchronous click
  dispatch, not a substitute for a real condition.
- **Worst-case content**: a real 245-move SGF
  (`/home/bork/sgf_validation/1986-11-06c.sgf`) loaded via a real
  `filechooser` event, navigated to its final move (`MOVE 245`), with
  captures and player names overridden via the DEV `window.store`
  handle to `B: 27 · W: 19` and two 33/34-character player names —
  heavier than the predecessor's own worst-case, deliberately, since
  it's what exposed the `40%`-resolution root cause in §4.

### 6.1 Measurements

| Viewport | `.status-bar` width | Minimum content need | Pass reachable | Captures reachable | Screenshot |
|---|---|---|---|---|---|
| 420×880 | 420px | **365px** (55px margin) | **yes** | **yes** | `vp420x880.png` |
| 1280×1024 | 647px | **365px** (282px margin) | yes (was already OK pre-fix) | **yes** (was the N4 defect) | `vp1280x1024.png` |
| 1920×1080 | 1114px | n/a (non-narrow; untouched by this diff) | yes | yes | `vp1920x1080.png` |

`scrollWidth === clientWidth` at both 420 and 1280 (no overflow, no
hidden scrollbar-worthy excess) — `.transient-hint`'s `flex: 1 1 0`
absorbs the remaining slack (55px / 282px respectively) rather than
the row overflowing. Reachability: a real Playwright `elementFromPoint`
hit-test at each interactive element's own bounding-rect centre
confirms `Pass`, the nav cluster's four buttons, and (as a non-
button but protected fact) `.caps` all resolve to themselves or a
descendant/ancestor — no occlusion, no off-screen centre. The four
"unreachable" entries the probe still flags at both narrow viewports
are `display: none` elements (`.game-info`'s `<select>`/`<input>`,
`.move-numbers-btn`, `UserBadge`) — the EXISTING, unchanged G12
demotion, correctly reported as a 0×0 rect by the DOM, not a defect.

**1920×1080 regression check**: `.status-bar--narrow`'s class never
engages at 1114px (well over the 700px threshold), so every rule this
diff touches is inert there — the wide-mode render path is provably
byte-identical to pre-fix by construction (no shared selector was
edited), confirmed live: `scrollWidth === clientWidth === 1114`, 0
unreachable elements, full rules-select/komi-input/UserBadge/game-info
all present exactly as before.

Screenshots (scratch, not committed — established LYT convention):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/n1-rig/shots/vp{420x880,1280x1024,1920x1080}.png`.
Raw measurement JSON: `n1-rig/statusbar-n1.json`.

### 6.2 Style bans

No rule added or edited introduces `box-shadow`, a non-zero
`transition`, or `blur()`. `--surface-2`/`--text-0`/`--space-tight`
tokens only — no new color or spacing literal. Confirmed by diff
inspection (the full diff is 6 CSS declarations plus their preceding
comments — see the commit).

### 6.3 One disclosed rig fault

The first backend launch attempt used the venv's shebang directly
(`.../venv/bin/uvicorn`), which pointed at a stale, session-specific
Python path from an earlier scratchpad and failed immediately (`bad
interpreter`) — caught before any DB touch; switched to
`.../venv/bin/python -m uvicorn`, which worked. No stray file resulted
from this one; the `.jwt_secret` the backend DOES generate on first
boot (into `backend/`'s cwd, not the rig directory — an existing
backend behavior, not something this session's setup caused) was
deleted at teardown, and `git status` after teardown shows only the
intended `StatusBar.vue` + test-file changes.

## 7. Gates (from `frontend/`)

| Gate | Exit |
|---|---|
| `eslint .` | **0** |
| `npm run build` (`vue-tsc -b && vite build`) | **0** |
| `npm run test:run` | **0** — `3285 passed | 8 skipped` (3277 baseline + 8 new, in the new `StatusBar-narrow-no-overflow.test.ts`) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **0** — `5 passed` |

## 8. New test

`frontend/tests/integration/StatusBar-narrow-no-overflow.test.ts` — 8
tests, two tiers:

1. **Computed-style pin** (the `status-bar-hint-no-reflow.test.ts`
   idiom: install the SFC's own `<style scoped>` block as a real
   stylesheet, read `getComputedStyle`) — confirms the fixed `90px`
   `.player-names` cap (not a percentage), the tightened gaps, and
   that `.pass-btn`/`.move-badge`/`.caps` carry no `display: none` at
   any tier while `.game-info`/`.move-numbers-btn` still do (the
   pre-existing G12 collapse, unchanged). One assertion hit a jsdom
   CSSOM quirk (a `padding: 0 var(--space-tight)` shorthand round-trips
   as `0` on every longhand AND the shorthand itself — not a real-
   browser behaviour, same family as the flex-shorthand footgun
   `status-bar-hint-no-reflow.test.ts`'s own header already documents);
   worked around by asserting the SFC's own source text for that one
   declaration instead of `getComputedStyle`, and disclosed the reason
   in the test's own comment rather than silently switching approach.
2. **Arithmetic no-overflow/reachability check** — real widths from
   this session's live rig probe (`TOOLBAR_MOVE_NAV_PX`,
   `MOVE_BADGE_PX`, `PLAYER_NAMES_CAPPED_PX`, `PASS_BTN_PX`,
   `CAPS_PX`), reused verbatim as named constants rather than
   re-derived, matching `ToolbarEngineMetrics-overlap-fix.test.ts`'s
   own `EVAL_SUMMARY_WORST_CASE_PX` discipline. Confirms the 365px
   minimum need fits under both 420px (with margin assertion, not
   just "fits") and the 647px bar width witnessed at 1280×1024, and
   reconstructs Pass/caps' flex-row positions to confirm both land
   fully inside a 420px track (a jsdom-feasible proxy for the real
   `elementFromPoint` hit-test the live rig performed).

## 9. Documentation audit (per umbrella `CLAUDE.md`)

- **Work-status store**: no work-status item was named in the
  commission text itself (it references the dispatch report's finding
  IDs, not a `todo` DB row) — no SQL write made. Flagging this rather
  than silently assuming: if N1/N4 have a corresponding open row, it
  should be closed against this commit; I don't have a row id to
  target from the commission text alone.
- **`FEATURES.md`**: not touched. This is a fix restoring existing,
  already-documented capability (Pass, captures) to reachability at
  supported widths — not a new, removed, or materially altered
  user-facing capability per the "bug fixes that preserve behaviour…
  don't need FEATURES.md edits" carve-out.
- **`frontend/FILES.md`**: not touched — no file created, moved, or
  deleted; `StatusBar.vue`'s existing `[B3]` band tag and one-line
  purpose are unaffected by this change (still board-state vocabulary
  chrome, same dependencies).
- **Doc-graph**: not touched — no documentation file added, removed,
  or re-cross-referenced; this dispatch report itself is filed under
  the existing `docs/dispatch-reports/` convention the same way its
  predecessor was.
- **ADR-0006 headers**: `StatusBar.vue`'s existing header (pathname +
  purpose + license, already present) is unchanged in shape; the new
  test file's header follows the same convention the sibling test
  files in `tests/integration/` use.

## 10. Disciplines checklist

- **Exactly this class**: only `.status-bar--narrow`-scoped rules
  touched; no model/encoding edit (the row facts stay `I_board`/
  `A_board` 24/28px height, unchanged — confirmed by diff: no
  `min-height`, `font-size`, or board-derivation logic touched).
- **Per-claim witness status**: every pixel figure in this report is
  either cited from the predecessor's own `statusbar.json` (marked as
  such) or from this session's own live rig probe (marked as such,
  with the JSON file's path given). No estimated/guessed number is
  presented as measured.
- **px only as cited measurements**: no arithmetic invented — the
  90px/4px/365px figures are the ones actually observed or the flat
  values actually shipped in the diff.
- **Ports**: 19100–19103 only, verified dead before and after; no
  contact with 4173/5173/5174/8764/1235/1242/195xx.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
