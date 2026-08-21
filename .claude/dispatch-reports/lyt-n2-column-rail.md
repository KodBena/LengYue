Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish-pass-2 wave N2 — the blank demoted column and the locked board rail

Commission: findings N2 and N3 (MAJOR) from
`.claude/worktrees/agent-abf7a077de7f6e432/.claude/dispatch-reports/lyt-finish-pass-2.md`,
read in full before starting, along with the two ratified fix-shape
reports it names (`lyt-wA-width-demotion.md`,
`lyt-wB1-portrait-priority.md`).

## 1. Base freshness (FIRST ACT)

`git fetch origin lyt-phase2` resolved `origin/lyt-phase2` to `85c5f023`
— exactly the commit the commission named, and `git log --oneline -1
origin/lyt-phase2..85c5f023` (both directions) showed zero commits
either way: the base was already fresh, no drift. This worktree
(`worktree-agent-a5d61403f86f31e3e`) started on an unrelated branch at
`3378806f` (`git merge-base --is-ancestor 85c5f023 HEAD` — exit 1, NOT
an ancestor). Hard-reset onto `85c5f023`; re-verified `git log --oneline
-1` matches.

**HEAD after this wave's commit: `2d958faf74230e897bf3547cc7296962ec63902f`.**

## 2. N2 — the fix

**Root cause (per W-A's own STOP-and-report §7/§9 item 2, and W-B1's
own narrower reading of it):** `resolvePortraitTreeRowWidthPx`
(`state/layout-model.ts`) already implemented exactly the right
mechanism — delegate the shrink half to `clampTreeWidthForSideColumn`,
then RAISE the un-dragged default to the row's own measured width when
every fixed-demand sibling is absent — but its App.vue call site
(`lytTrackStyleOverrides`) only invoked it for `activeScreenClassId
=== 'portrait'`; landscape fell through to the shrink-only
`clampTreeWidthForSideColumn` call, which never grows a track, only
shrinks it. At 1920×1080 the un-dragged default (230px) was well under
the measured 614px side column, so the shrink clamp was a no-op and
230px stood — 384px of the row left unclaimed.

**The fix, exactly the shape the commission specified — extend, don't
invent:** the function itself was already class-agnostic (nothing in
its body reads or branches on screen class; "portrait" was only in its
name and its one call site). Renamed `resolvePortraitTreeRowWidthPx` →
`resolveTreeRowWidthPx` and made App.vue's `lytTrackStyleOverrides`
call it unconditionally for both classes, dropping the
`activeScreenClassId === 'portrait' ? ... : ...` branch entirely. No
new pixel literals, no new mechanism — the same `isUnsetDefault` /
`reservedPx === 0` double gate as before now also governs landscape.

**The ratified invariant reading (ledger row 414) is unchanged from
wave B1's own argument, extended to landscape by the same logic:** the
invariant protects the PERSISTED, user-dragged value as the single
write channel (`session.ui.treePanelWidthPx`, written only by
`useResizablePanel.ts`'s INNER-bar drag handler). It says nothing about
the un-dragged DEFAULT's own sibling-presence sensitivity — that
default was already live-reactive to viewport width before either wave
touched it (`computeTreePanelDefaultWidthPx`'s own doc: "varies with
the WINDOW... not with content"). A user who has dragged the inner bar
keeps that width verbatim in EITHER class now; the residual beyond it
stays blank for that user, precisely as W-B1 already documented for
portrait. Full derivation and the module-header addendum live in
`frontend/src/state/layout-model.ts` (search "2026-08-13 dated
addendum" near `resolveTreeRowWidthPx`).

**Disclosed fork, not resolved here (unchanged from W-A's own
STOP-and-report):** whether a USER'S OWN DRAG should also widen when
siblings free up space is a separate, still-open, still-unfiled
question — this fix only widens the un-dragged default. Per the
commission's own framing: "the dragged-case disposition is a filed
commissioner fork, not yours."

### Tests

`tests/unit/state/layout-model.test.ts`:

- Renamed the existing portrait describe block's references
  (`resolvePortraitTreeRowWidthPx` → `resolveTreeRowWidthPx`
  throughout — a mechanical rename, zero behavioral change to those 7
  cases).
- New describe block, `resolveTreeRowWidthPx — finish-pass-2 N2
  (landscape tree-row un-dragged default...)`, four independent cases
  against landscape's own compiled fixtures (`tree` minPx 110,
  `controlPanel` fixed 664, `previewBoard` fixed 160):
  1. Panel demoted, both siblings absent, un-dragged: widens 230→614
     (the finding's own reported 1920×1080 numbers).
  2. A user drag on record: stays at the dragged value (180), never
     widened to 614 — sovereignty preserved.
  3. `previewBoard` present (`controlPanel` absent), un-dragged: the
     widen path is disabled (`reservedPx > 0`), falls through to the
     shrink clamp, landing at exactly `614 - (160+4) = 450` — matches
     `clampTreeWidthForSideColumn` byte-for-byte.
  4. `controlPanel` present (the ordinary case): reproduces W-A's own
     2560×1440 completion-pass figure (307 natural → 151), landscape's
     everyday composition genuinely untouched.

## 3. N3 — the fix

**Root cause:** `useLytPresenceMenu.ts`'s last-remaining-panel guard
(`isOnlyVisible` / `activeTargetIds`) ported the mockup's own N2 fix
mechanism verbatim — but the mockup's own toggle registry included the
BOARD itself as one of its seven targets ("Board & Controls"), so
guarding against an all-off state was real protection there. This
module's own header already documents that the Vue realization
narrowed the toggle set to four targets specifically BECAUSE
`B`/`I_board`/`A_board` mount through the always-present board
composite — "the board is architecturally always-mounted" (roadmap
§5) — and are therefore excluded from the toggle set entirely. The
guard's protected invariant ("never strand the user with zero
surfaces") consequently never applied to the four targets it actually
governs: the board is unconditionally a surface regardless of what
`boardRail`/`previewBoard`/`controlPanel`/`A_setup` resolve to. In
portrait, repetition-first already defaults all four absent — the row
this guard was meant to protect never had a genuine "last panel" to
begin with on a fresh session — but if the persisted map ever DOES
land on exactly one visible target (a legacy `sidebarExpanded: true`
migration, or the user's own prior choices), the guard's stale premise
pinned it ON permanently, rendering the empty `board-preview` shelf
(150×150, `childCount: 0` — the finding's own measurement) the user
could never dismiss.

**The fix:** removed `isOnlyVisible` and `activeTargetIds` from
`useLytPresenceMenu.ts` entirely — every target is now freely
toggleable to fully off, including the last one. The ONE remaining
`disabled` source (`boardRail` while `railStyle === 'popover'`, an
UNRELATED reason — that style unconditionally collapses `boardRail`'s
own grid track regardless of the checkbox) is untouched.
`LytPresenceMenu.vue`'s `targetTitle` simplified accordingly (no more
per-id branch, since only one disable reason survives); the now-orphaned
`app.chrome.presence.guardTooltip` locale key removed from all four
locale files (`en`/`ja`/`ko`/`zh-CN`). `SystemLogToggle.vue`'s own
placement-rationale comment, which cited the guard as a reason NOT to
fold the system log into the presence popover, updated to describe the
still-valid part of that rationale (grid-presence toggles vs. an
overlay-stratum affordance) without leaning on the removed guard.

**STOP-and-report check (the commission's own instruction — "if the
guard's original protective purpose has a case your change would
break, STOP-and-report it"):** No live case found. The presence menu's
own trigger button (`#lyt-presence-menu-btn`) is an always-present
overlay, never gated behind any of its own targets — a user who
toggles every target off can always reopen the menu and toggle one
back on. Rig-witnessed directly (§4): toggling `boardRail` on then off
again, with it as the sole visible target throughout, succeeded both
directions with no refusal and no empty box left behind.

### Tests

`tests/integration/useLytPresenceMenu.test.ts`, the former
"last-remaining-panel guard" describe block replaced with "no
last-remaining-panel guard (removed, finding N3)":

- With only `controlPanel` visible (defaults), NONE of the four
  targets is disabled.
- `toggle()` freely hides the sole visible target — write succeeds,
  not refused; the resulting all-off state is asserted directly.
- Toggling every target off one at a time never re-engages a disable
  on the last one standing.

The `railStyle === 'popover'` describe block's own test updated: it
used to assert `controlPanel` disabled too (the guard's own effect,
since `boardRail` drops out of the guard's accounting in that style,
leaving `controlPanel` as the sole "active" visible target) — now
asserts `controlPanel`/`previewBoard`/`A_setup` are all NOT disabled,
only `boardRail` (the unrelated popover-style reason) is.

## 4. Gates (literal exit codes, frontend/)

| Gate | Result |
|---|---|
| `npx eslint .` | **0** (0 errors, 0 warnings) |
| `npm run build` (`vue-tsc -b && vite build`) | **0** |
| `npx vitest run` | **0** — **3281** passed, 8 skipped (baseline 3277 + 4 net new: +4 landscape-widen cases, the guard-removal describe block traded 3-for-3 with the removed guard block) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **0** — 5 passed |
| `research/lyt` | **untouched** — `git status` confirms zero changes under `research/lyt/`; no `.lyt` encoding or Python file was touched (this wave is realization-layer only, per the commission's own framing) |

One incidental fix mid-wave: `LytPresenceMenu.vue`'s `targetTitle`
originally kept an `id: LytPresenceTargetId` parameter that became
unused once the per-id guard branch was removed (`vue-tsc -b` caught
it, TS6133) — dropped the parameter and updated the one call site.

## 5. Rig witness

Own ports `19610` (backend) / `19611` (frontend) / `19612`
(katago-ws-stub, never contacted), each probed dead via a Python
`socket.connect_ex` before use and confirmed dead again after
teardown. `pgrep -af` before/after use confirmed only this session's
own three PIDs existed and were explicitly killed at the end.

- **Backend** `127.0.0.1:19610` — main checkout's venv
  (`/home/bork/w/omega/backend/venv/bin/python -m fastapi run`), run
  from the WORKTREE's own `backend/` (not the main checkout's),
  `DATABASE_URI` pointed at a **copy** of
  `backend/samples/cards.sample.db` in scratchpad
  (`…/scratchpad/n2-rig/cards.rig.db`). The real `cards.db` was never
  opened. `QEUBO_ENABLED=false`. Verified live via `GET /docs` → 200
  and the app's own successful boot.
- **Frontend** `127.0.0.1:19611` — `vite --strictPort`,
  `VITE_API_BASE_URL` → the rig backend, `VITE_KATAGO_WS_URL` →
  `19612` (never contacted — this wave's findings are pure layout/
  presence facts, no engine interaction needed).
- **Disclosed data correction**, same precedent W-B1's own report
  established: the sample DB's persisted document carries
  `session.ui.lytPresence.boardRail: true` / `sidebarExpanded: true`
  (a legacy migration artifact predating the repetition-first
  disposition) — corrected via direct `UPDATE` SQL against the SQLite
  **copy** to `lytPresence: { boardRail: false, previewBoard: false }`
  so the default-composition measurements reflect the compiled
  program's actual intent rather than inherited legacy residue. Theme
  seeded to `'cluster'` the same way (`profile.settings.appearance.
  theme`), confirmed via `data-theme="cluster"` before every
  measurement.
- **Auth.** The rig backend's single seeded user (`local_user`, no
  password) auto-authenticates via the app's own `tryAutoLogin` —
  confirmed via the `.user-badge.auth-authenticated` class rather than
  driving an interactive login form (a discrepancy from prior waves'
  own rig notes, disclosed rather than silently assumed: this sample
  DB's `users` row has `has_password: 0`).
- **Playwright**: `playwright-core` (no `@playwright/test`), chromium
  at `/usr/bin/chromium` with `--js-flags=--max-old-space-size=1024`,
  one browser instance for the whole run, closed in a `finally`. Every
  wait is `waitForSelector`/`waitForFunction` on a real DOM condition
  (the auth badge's own class, the theme attribute, a measured
  non-zero width), except two disclosed short settle timeouts (150–
  200ms) strictly AFTER a real mouse-drag or click event resolved —
  never as the sole condition for a measurement.
- **Own rig contamination, caught and corrected** (the same class W-A's
  own report disclosed): an early run's resizer-drag attempts at
  2560×1440 persisted `session.ui.treePanelWidthPx` into the shared
  rig document, which a SUBSEQUENT run's 1920×1080 phase then
  inherited (reading 231px/140px instead of the true un-dragged 230px
  default) — reordered the script so the drag-testing phase
  (2560×1440) runs LAST, and reset the persisted value via SQL before
  the final, reported run. The numbers below are from that clean,
  reproduced-twice run.
- Systemd-run `MemoryMax` wrapper: **not used for these ad-hoc probe
  scripts** — a disclosed narrowing from the fuller prior-wave rigs
  (mirroring W-B1's own precedent for the same class of script); each
  process was still short-lived, single-browser, explicitly closed.

### 1920×1080 — panel demoted, tree fills the column (N2)

```
wrapperRect:        { x: 1306, y: 252, width: 614, height: 828, right: 1920 }
wrapperGridColumns: "614px 0px 0px"
treeRect:           { x: 1306, y: 252, width: 614, height: 828, right: 1920 }
```

Tree's own rect is byte-identical to the wrapper's — the full 614px
column, zero blank residual. Before this fix, the same composition
measured `"230px 0px 0px"` (W-A's own reported figure) — 384px
unclaimed.

**`#resizer-inner` NOT found in this state** — confirming, live, W-A's
own §8 disclosure (F14): the inner resizer bar mounts inside the
`controlPanel` Exclusive's own slot content, which doesn't exist in
the DOM at all when the panel is demoted (not merely hidden via CSS —
absent). This fix does not change that; per the commission's own
instruction not to redesign the resizer, it's disclosed as-is. There
is, in this specific state, no resizer to drag or persist — the
"drag the resizer where present" verification (below) is against the
2560×1440 composition, where the panel IS present.

**Disclosed, out of this fix's scope:** `#main-area` measured
`scrollWidth: 1925` vs `clientWidth: 1920` — a 5px overflow, traced
(via a one-off diagnostic pass) to the DEMOTED `#control-panel` div
itself still rendering a 1px-wide DOM sliver at `x: 1924..1925` even
though its own grid track computes to `"0px"` — an empty grid cell at
a 0px track apparently still claiming a sub-pixel width. This is not
a fact this fix's tree-width change touches (`#control-panel`'s own
rendering is untouched by this wave); reproduced identically across
three independent runs, so it's real, not flaky measurement — but it
predates this wave and is not one of the two named findings. Named
here rather than silently absorbed into a "no overflow" claim.

The screenshot `n2-1920-before-resize.png` witnesses this composition.

### 2560×1440 — panel present, resizer drag + persistence (N2 regression check)

```
before:       "151px 664px 0px"   (W-A's own completion-pass figure, byte-identical)
after drag:   "140px 664px 0px"   (dragged LEFT — narrower; RIGHT has no room, already at ceiling)
after reload: "140px 664px 0px"   (persisted)
```

The resizer is present (`#resizer-inner` found), draggable, and its
drag persists across a reload — landscape's everyday, panel-present
composition is unaffected by this wave. (Dragging RIGHT was tried
first and correctly produced no visible change — at this exact
viewport the tree is already at its measured ceiling with the panel
present, zero slack, per W-A's own report — not a resizer defect;
dragging LEFT, toward the tree's own compiled floor, is the
unambiguous test and is what's reported above.) The Advanced Registry
view after reload confirms `treePanelWidthPx: 140` persisted.

The screenshots `n2-2560-before.png`, `n2-2560-after-drag.png`, and
`n2-2560-after-reload.png` witness this composition.

### 420×880 — no empty rail box, presence menu reachability (N3)

```
portraitDefault:  { railPresent: false, boardRect: { width: 420, height: ~420 } }
before toggle:    { disabled: false, checked: false, title: "" }
after toggle ON:  { disabled: false, checked: true,  railPresent: true }
after toggle OFF: { disabled: false, checked: false, railPresent: false }
```

No empty rail box at default (repetition-first: board + tree, per
W-B1's own composition). The presence menu's `boardRail` checkbox is
never disabled — toggling it ON summons the rail (screenshot confirms
the docked rail panel, including the SEPARATE, disclosed, out-of-scope
empty preview shelf — N5, not this wave's concern), and toggling it
back OFF — while it is the SOLE visible target among the four,
exactly the case the removed guard used to refuse — succeeds cleanly:
`railPresent: false`, no refusal, no stuck checkbox.

The screenshots `n2-420-default.png`, `n2-420-presence-menu-open.png`,
`n2-420-rail-summoned.png`, and `n2-420-rail-dismissed.png` witness
this arc.

Raw measurements: `results.json` alongside the screenshots, under
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/n2-rig/shots/`
(scratch, not committed — established LYT convention).

## 6. Per-claim witness status

- N2 fix (landscape widen): **witnessed live** (§5, 1920×1080) —
  matches the unit-test-derived expectation exactly (614px).
- N2 regression check (landscape panel-present, resizer): **witnessed
  live** (§5, 2560×1440) — drag + reload-persistence both confirmed.
- N2 dragged-width sovereignty (a user's drag stays verbatim in
  landscape): **witnessed by unit test only**, not independently
  rig-verified this pass (the rig's own 2560×1440 phase drags but
  doesn't separately re-verify the "stays at dragged value, doesn't
  widen" case against a FRESH un-dragged baseline at a size where
  siblings are absent — the unit test's case 2, §2, covers this
  directly and is the authoritative witness for that specific claim).
- N3 fix (guard removal, reachability): **witnessed live** (§5,
  420×880) — the exact "sole visible target, toggle off" case the
  removed guard used to refuse.
- N3 no-regression (the popover-style boardRail disable is still
  live): **witnessed by unit test only**, not independently
  rig-verified this pass (`railStyle` toggling wasn't exercised in the
  live rig — out of this wave's own two named findings' measurement
  set; the unit test suite's own `railStyle conditioning` describe
  block is the authoritative witness).
- The pre-existing 1px `#control-panel` DOM sliver / 5px `#main-area`
  overflow at 1920×1080: **witnessed live**, reproduced three times,
  disclosed as pre-existing and out of this wave's named scope — not
  investigated to root cause beyond locating the offending element.

## 7. Style/discipline checks

- No hardcoded pixel literals introduced — every number in the new
  test cases and the App.vue call site is either a compiled-program
  fact (`requireTrack`) or a live DOM measurement (`sideColumnWidthPx`,
  `effectiveTreePanelWidthPx`), matching the existing module's own
  discipline (px norm, ledger row 2047).
- `resolveTreeRowWidthPx` is unchanged in body — only its name and its
  App.vue call-site scope changed; every existing portrait test case's
  own expectation is untouched (a pure rename, `replace_all`, verified
  by the full portrait describe block staying green).
- The four locale files' `guardTooltip` removals are deletions only —
  no new translation authored, no `[TODO]` marker needed.
- Ports 4173/5173/5174/8764/1235/1242/195xx never touched — verified
  by `pgrep -af` before and after this session's rig use.

## 8. STOP-and-report items

None from this wave's own two findings. Two items carried forward,
unchanged, from the prior waves' own disclosed forks (not re-opened or
re-judged here):

1. **W-A's own broader fork** (`lyt-wA-width-demotion.md` §7/§9 item
   2): should a USER'S OWN DRAG also widen when a sibling frees up
   space, in either class? Still open, still a commissioner decision,
   not this wave's to make (the commission's own framing: "the
   dragged-case disposition is a filed commissioner fork, not yours").
2. **The pre-existing `#control-panel` 1px DOM sliver** (§5, 1920×1080):
   a small (5px `#main-area` overflow), reproducible, pre-existing
   artifact unrelated to either named finding — named so it isn't
   silently absorbed into a "no overflow" claim, not investigated
   further (out of this wave's own scope).

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
