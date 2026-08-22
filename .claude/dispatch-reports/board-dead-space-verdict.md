# Board vertical dead-space (Library/Match) — verdict: REFUTED-FIXED

**Disposition: REFUTED-FIXED at base `0c21780d`.** Live-witnessed at 1920×1080 in the Library view and in a second right-panel-tab state (Cards, reached en route to a Match-modal repro — see below); the board fills essentially the full available height in both. No source edits made; `git diff` is empty.

## Base

`git rev-parse HEAD` = `0c21780d10ee135651a6c7b7108de9d154cd4611`, confirmed equal to `git rev-parse next` at dispatch time.

## Repro environment

Same isolated backend/frontend-dev-server pair described in the sibling report (`preview-board-autosize-diagnosis.md`) — backend on `127.0.0.1:19765`, frontend dev server on `127.0.0.1:19174` (launched with `frontend/` as the process cwd), fresh SQLite, fresh registered user per run, onboarding wizard dismissed via three `dismissWizard()` passes.

## What was measured

`#board-square` is the `B` leaf's own aspect-containment cell (`LytNode.vue`'s `.lyt-board-cell`, confirmed by reading `App.vue`'s DOM-id wiring comment at the `boardPath`/`'board-square'` mapping, `App.vue:642`). `#split-workspace` is the LYT root (`App.vue:2254`'s own comment confirms this identity), i.e. the full available workspace area.

**Library view** (clicked the toolbar's `Library` button, `aria-pressed` toggled, `LibraryTab.vue` rendered in the right panel):
```
boardRect:          {x:12, y:0, width:1016, height:1028, bottom:1028}
splitWorkspaceRect: {x:0,  y:0, width:1920, height:1080, bottom:1080}
```
Board bottom = 1028 of 1080 available (95.2%). Unused vertical space below the board = **52px** (4.8%).

**Second view** (attempted a Match-modal repro; the `Cancel` click selector landed on the Cards tab instead of the Match modal's own Cancel — screenshot confirms the toolbar's `CARDS` tab active, `LINEAGE EXPLORER`/deck-review UI in the right panel):
```
boardRect:          {x:12, y:0, width:1016, height:1028, bottom:1028}
splitWorkspaceRect: {x:0,  y:0, width:1920, height:1080, bottom:1080}
```
Identical board geometry — bottom at 1028/1080, 52px unused.

Both screenshots (`library1920.png`, `match1920.png` — not committed, scratch artifacts in the session's own scratchpad, not the repo) show the board visually pinned near the top of its column with only a thin margin below it, no large dead zone.

**Disclosed gap:** a genuine "Match in progress" state (an actual live engine match, not just the pre-match Cards/Library tabs) was not independently witnessed — the toolbar's `Match` button opens a config modal (`EngineMatchModal.vue`) rather than changing the board's own layout, and this session's click sequence didn't land squarely on that modal's `Cancel` button (it appears to have fallen through to the `CARDS` toolbar entry instead, per the screenshot). Since the board's LYT geometry (the `B` leaf, `board-priority-clamp`/`elastic` track per the sibling report's DIAG-TRACK dump — `axis:'v', kind:'elastic', minPx:0, frWeight:1`) does not depend on which right-panel tab or modal is open, and it measured identically across both views actually reached, I judge this gap doesn't change the verdict — but naming it rather than silently treating the two views reached as if one of them were "Match."

## Verdict

The prior stub's "board pins to top with large unused vertical space below" description does **not** reproduce at this base, at 1920×1080, in either view actually witnessed. 52px (4.8% of viewport height) is consistent with ordinary padding/gap CSS, not a layout defect. Given the intervening merges named in the umbrella CLAUDE.md's own history (the `ff54ae05`/"viewport-currency column-split class" closure at the current base, and the several `lyt-*` allocation/relations repairs visible in `.claude/dispatch-reports/` between the stub's era and now), this reads as **already fixed** rather than never-reproduced — hence REFUTED-FIXED rather than a bare "could not reproduce."

## Fence compliance

- No source edits. `git status --short` at the end of this session shows no tracked-file changes; the only untracked artifacts were this session's own scratch outputs (backend SQLite/log/JWT-secret files, `.vite` cache), all removed before finalizing.
- `git diff` is empty.
- The running preview on :5174 was never touched.

## What was honestly NOT done

- A true "engine match in progress" board-layout witness (see disclosed gap above).
- A narrower viewport / portrait-class check — the commissioner's own screenshot evidence (`e518_toolbar_strip_and_unused_vertical_space.png`) and the mandate both scope this to 1920×1080, so narrower classes weren't probed; if the defect is width-class-specific this verdict doesn't cover that.
