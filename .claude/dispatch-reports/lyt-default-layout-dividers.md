# "Default layout" button + draggable-dividers audit (commission ledger row 2379)

Branch: `worktree-agent-a2dce018a3dbd92b8` (worktree cut from `lyt-phase2`).
Base at start: worktree `HEAD` was `3378806f` (a dependabot-merge chain,
diverged from `lyt-phase2`) — **stale**, per the brief's own first-act
instruction. Hard-reset to `origin/lyt-phase2` (`522131e6`) before reading
any code, no ancestor-check conflict (clean working tree at the time).

## Scope recap

(a) A "default layout" button that discards the user's dragged panel
widths and re-lays-out for the current window geometry. (b) An audit of
every draggable-divider boundary in the compiled LYT program, implementing
only the clearly-safe additions. (c) The reset composes with width-
conditional demotion — a reset at a narrow width may leave a panel
demoted, and that's correct.

## (a) The override-cell enumeration

Grepped `frontend/src/store/schema.ts` for every `Px`-suffixed field
(`grep -n "Px" schema.ts`) and read the `UISession` interface (lines
639–1025) in full. Exactly **two** persisted layout-override cells exist
on `session.ui`:

- `treeControlRegionWidthPx?: number` — the OUTER bar's fact (the side
  column / tree+control+preview region's own width).
- `treePanelWidthPx?: number` — the INNER bar's fact (the tree panel's
  own width).

The one other `Px`-suffixed field in the file, `ThumbnailSettings.sizePx`,
lives on `ProfileState.thumbnailSettings` — a completely different
persisted slice (profile, not session UI) — and is not a layout override.
No other numeric geometry override exists on `session.ui`; `lytPresence`
(a `Record<string, boolean>`) and `railStyle` (`'slot' | 'popover'`) are
presence/style facts, not geometry, and are — per the ruling — untouched
by the reset.

**Implementation**: `resetLayoutOverrides()`
(`frontend/src/composables/chrome/useResizablePanel.ts`) clears both
cells to `undefined` and calls `touchSession()`. `undefined` is not an
invented sentinel — it is the exact "never dragged" state
`effectiveTreeControlRegionWidthPx`/`effectiveTreePanelWidthPx` (the same
file) already resolve via their existing stored-or-default precedence;
the reset only clears the stored half, so the very next render recomputes
the default from the row's **current live width** — not a remembered
factory pixel value (see the "(c)" section below for the live proof).

`useLytPresenceMenu.ts` exposes this as `resetLayout`, a **plain
re-export** (`resetLayout: resetLayoutOverrides`), not a re-implementation
— one home for the clearing logic (ADR-0012 P1), asserted by reference
equality in the new test suite.

**Placement**: the corner "Panels" popover (`LytPresenceMenu.vue`) — the
existing layout-adjacent menu the commission pointed at. A third divider
+ a full-width "Default layout" button sits below the panel checkboxes
and the rail-style selector, reading as the popover's own closing,
broader-scoped action rather than being interleaved with the per-target
controls. No confirmation dialog — the action is symmetric with a drag
(an immediately visible, non-destructive geometry change), matching the
presence checkboxes' own no-confirmation precedent one row up. Disclosed
in the component's own header comment.

**Locale strings**: `app.chrome.presence.resetLayoutButton` /
`resetLayoutTitle` added to `en.json` (source) and `ja.json`/`ko.json`/
`zh-CN.json` with the established `[TODO] <english>` convention (matched
against `widthDemotedHint`'s own precedent in those three files).

## (b) Draggable-dividers audit

Read `frontend/src/state/lyt-layout.gen.ts` (landscape, full) and
`lyt-layout-portrait.gen.ts` (portrait, full) — the compiled programs —
plus `LytNode.vue` (full) and `useResizablePanel.ts` (full) to understand
how the two existing bars are wired: both are **zero-track-cost absolute
overlays** anchored on a leaf's own `position: relative` box (not a grid
track of their own), driven by a `trackStyleOverrides` path→px map that
wins verbatim over the compiled program's own track. That mechanism only
works where **both sides of the boundary are already flexible tracks**
in the compiled program — a fixed track has no budget for a drag to
redistribute.

| Boundary | Compiled shape | Status |
|---|---|---|
| tree \| control-panel (INNER bar) | tree: elastic; controlPanel: fixed-664, but the render-time clamp (`resolveTreeRowWidthPx`) reconciles it against the row's live width | **Draggable today** (`#resizer-inner`, both classes) |
| board \| side-column (root split) | board: elastic; side column: `board-priority-clamp` (min/max formula) | **Draggable today** — the OUTER bar (`#resizer-outer`) drags exactly this boundary; it's anchored cosmetically at the tree panel's left edge but topologically governs the side column's own width (verified: `lytTrackStyleOverrides` in `App.vue` overrides the side-column's own path, not a separate wrapper path) |
| engine row height (landscape `2.0`/`2.1`; portrait `4`'s neighbours) | both sides **fixed** px (80/160, or a `board-priority-self-clamp` formula next to a fixed row) | **Not safe** — no flexible budget on either side; a drag would fight the compiled track, needs an encoding change |
| controlPanel \| previewBoard (`2.3.1`/`2.3.2` landscape, `5.1`/`5.2` portrait) | both **fixed** (664 / 160, 664 / 96); previewBoard's own default presence is `false` | **Not safe** — both sides fixed by design; controlPanel's own 664px is itself a render-time-clamped complement, not a free width |
| boardRail \| board composite (root `0`/`1`) | boardRail: fixed-168 (presence `false` by default, a control rail); composite: elastic | **Not safe / not meaningful** — one side fixed by design (an icon rail, not a content pane); dragging a rail's edge has no product meaning here |
| portrait's root row boundaries (`0`/`1`/`2`/`3`/`4`/`5`) | every adjacent pair is fixed/fixed, fixed/special-formula, or fixed/elastic | **Not safe** — no adjacent pair is flexible on BOTH sides; the board row's own height is a `board-priority-self-clamp` formula, not a free track |
| engine row's own INTERNAL sub-panel boundaries (`A_engine_controls`/`_eval`/`_health`/`_queue`, landscape `2.0.0..3`, portrait `4.0..3`) | **all four are elastic** (`frWeight: 1` each) — genuinely flexible/flexible on every adjacent pair | **Meets the literal criteria but ENUMERATED ONLY, not implemented** — see below |

**On the engine sub-panel boundaries**: these are the one place in either
compiled program where the "both sides already flexible" bar is
literally met by three adjacent boundaries at once. Not implemented,
for three disclosed reasons: (1) not named in the commission's own
enumerated boundary list ("tree|control-panel... board|side-column...
the engine row's height boundary... portrait's row boundaries" — a
*height* boundary, not this row's internal *width* splits); (2) it
would triple the persisted-cell surface this same report just pinned at
exactly two, needing a new enumeration discipline (widget-id-keyed, not
path-keyed, since the four widgets occupy different paths per class);
(3) one candidate sibling (`A_engine_eval`) has `minPx: 0`, so an
unbounded drag could visually zero out a live info strip — a UX
question (should it floor above 0?) with no existing precedent in this
codebase to crib from. Flagged as follow-up requiring ratification, per
the brief's own "STOP-and-report anything further" instruction, rather
than silently expanding scope under time pressure.

**Net implementation**: no new dividers were added. Every boundary the
commission named by description is either already draggable via the two
existing bars (tree|control-panel, board|side-column — the latter is the
SAME OUTER bar, not a separate one, a fact worth surfacing since it's not
obvious from the bar's on-screen anchor point) or genuinely blocked by a
fixed/formula-driven compiled track that would need an encoding change
first.

## (c) Composition with width-conditional demotion

`resetLayoutOverrides()` only clears the two stored cells; it does not
read or write presence. The width-conditional demotion machinery
(`App.vue`'s `resolveWidthConditionalPresence`, `controlPanelDemote`,
consulted via the `demote: { belowPx: N }` field the compiled program
already carries) operates entirely downstream of the recomputed default
width — so a reset at a narrow/short window can genuinely leave a panel
demoted, and that is the CORRECT outcome, not a partial reset. Live-
witnessed below: at 1920×1080 in this rig, the control panel is
width-demoted **even for the un-dragged default** (a pre-existing,
already-documented behavior — `state/layout-model.ts`'s own "finish-
pass-2 finding N2... at the flagship desktop resolution the primary
panel is absent from the layout" comment, not something this change
introduced) — the "Default layout" click correctly returns to that same
demoted state, with the presence menu's own `forcedAbsent` hint
("Not enough width right now — reachable via the summon button")
visible in the post-reset screenshot.

## Tests

New file: `frontend/tests/integration/lyt-default-layout.test.ts` (11
tests, Tier-3 composable-integration, mirroring
`resizer-restore-clamp.test.ts`'s established `mountSplitWorkspace`/
`withSetup` idiom):

- clears both enumerated cells; leaves `lytPresence`/`railStyle`
  untouched; idempotent on an already-default session; bumps
  `sessionVersion`.
- a mechanized "exactly these two keys changed" diff against a dragged
  snapshot (not just "the two I expect are undefined" — an independent
  cross-check, with its own disclosed limit: it doesn't re-derive the
  enumeration from the schema, so a future third cell wouldn't be
  caught by this test alone).
- post-reset widths equal `computeTreeControlRegionDefaultWidthPx`/
  `treePanelDefaultWidthPx` **at the CURRENT mounted geometry**,
  exercised at two different widths (1920 vs 1024) to prove
  per-geometry recomputation rather than a cached value, plus one case
  at a floor-pinned narrow geometry (500px).
- `useLytPresenceMenu.resetLayout` is reference-equal to
  `resetLayoutOverrides` (not a re-implementation) and produces the
  same store effect through the menu-level entry point.

No new/changed dividers to test (per (b)'s finding), so no drag+persist+
reset test was added beyond the existing coverage the two current bars
already have (`resizer-persistence-roundtrip.test.ts`,
`useResizablePanel.test.ts`) — unaffected by this change.

## Gates (from `frontend/`)

| Gate | Result |
|---|---|
| `eslint .` | **0** |
| `npm run build` (`vue-tsc -b && vite build`) | **0** |
| `npm run test:run` | **0** — baseline **3289 passed \| 8 skipped**; after this change **3300 passed \| 8 skipped** (263 files, 3 skipped) — delta of 11 is exactly the new test file |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **0** — 5 passed |
| `research/lyt/` | untouched (`git status` confirms no diff under that tree) |

## RIG WITNESS

Own ports: **19100** (backend) / **19101** (frontend dev), verified DEAD
before use and DEAD again after teardown (`socket.connect_ex`):

```
before: 19100 DEAD  19101 DEAD
after:  19100 DEAD  19101 DEAD
```

None of 4173/5173/5174/8764/1235/1242/195xx was touched.

- **Backend** `127.0.0.1:19100` — `/home/bork/scratchpad/venv` (fastapi
  0.135.1, matching `backend/requirements.txt`), `DATABASE_URI` → a
  **copy** of `backend/samples/cards.sample.db`
  (`.../scratchpad/dl-rig/cards.rig.db`, never the real `backend/cards.db`),
  `QEUBO_ENABLED=false`. Launched via `systemd-run --user --scope -p
  MemoryMax=4G -- nice -n 19 .../venv/bin/python -m uvicorn`.
- **Frontend** `127.0.0.1:19101` — `vite --port 19101 --strictPort`
  (`systemd-run ... MemoryMax=4G`), `VITE_API_BASE_URL` → the rig backend.
- **Engine** — dead-pinned: `VITE_KATAGO_WS_URL=ws://192.168.122.68:1235`
  configured but never connected (this witness needs no live engine —
  only chrome/layout geometry).
- **Theme seed** `'cluster'` — set via the DEV-only `window.store` console
  handle on every fresh page (`src/main.ts`'s `import.meta.env.DEV` gate),
  re-asserted per page since each Playwright context is a fresh profile;
  every screenshot shows the pink `cluster` surface, not dark leakage.
- **Playwright** — `playwright-core` (an existing `frontend/` devDependency,
  no install needed) driving `/usr/bin/chromium`, launched under
  `systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 node
  --max-old-space-size=1024`, `--js-flags=--max-old-space-size=1024`
  passed to chromium itself. Every measurement gate is a real DOM-
  condition `waitForFunction` (element width delta, store field
  `=== undefined`, `data-theme` attribute) — no wall-clock waits used as
  a substitute for a condition (two short `waitForTimeout(50-100ms)`
  calls exist only as a settle buffer immediately after a synchronous
  click dispatch, not as the wait itself).
- **Auth**: the fresh rig backend requires a JWT for the SPA's own
  sync/auto-login (unrelated to the board/tree/layout chrome under test);
  registered one throwaway rig user via `/auth/register` + `/auth/token`
  and injected the resulting JWT into `localStorage['auth_token']` via
  Playwright's `addInitScript` before navigation — using the app's own
  documented storage-key contract (`api-client.ts`'s `TOKEN_KEY`), not a
  modification to any auth/LoginModal/sync-service file (none touched,
  per the brief's explicit exclusion for the parallel auth investigation).

### Measurements

**1920×1080 — OUTER bar (board \| side-column boundary):**

| Step | `#tree-control-wrapper` width | stored `treeControlRegionWidthPx` |
|---|---|---|
| Un-dragged default | 614px | `undefined` |
| After drag (+200px pointer delta) | 814px | `814` |
| After "Default layout" click | **614px** (back to the SAME un-dragged default) | `undefined` |

`lytPresence`/`railStyle` confirmed byte-identical before and after
(`{boardRail:false, previewBoard:false}`, `railStyle:'slot'`).

**2560×1080 — INNER bar (tree \| control-panel "tree divider"):**

Disclosed adaptation: at 1920×1080 in this rig, the control panel is
width-demoted by default (see "(c)" above), so `#resizer-inner` does not
mount there at all (it lives inside the control-panel Exclusive's own
slot, which unmounts entirely — not just visually hides — when absent).
Verified live across four viewports before choosing 2560×1080:

```
1920x1080  resizerInner=false
1920x700   resizerInner=false
1920x500   resizerInner=false
2560x1080  resizerInner=true
```

At 2560×1080, the region's own un-dragged default (819px) is almost
entirely claimed by the control panel's own fixed 664px, leaving the
tree only ~150px of room regardless of how far the INNER bar is dragged
— so the OUTER bar was widened first (a real, independent, everyday user
action, not a scripted workaround) to free room for the INNER-bar drag
to visibly register:

| Step | `#vue-tree-panel` width | `#tree-control-wrapper` width | stored `treePanelWidthPx` | stored `treeControlRegionWidthPx` |
|---|---|---|---|---|
| Un-dragged default | 151px | 819px | `undefined` | `undefined` |
| After widening OUTER (+300px) | 307px | 1119px | `undefined` | `1119` |
| After dragging INNER (+220px) | 451px | 1119px | `527` | `1119` |
| After "Default layout" click | **151px** | **819px** | `undefined` | `undefined` |

Both cells return to exactly their pre-drag values — the reset recomputed
BOTH facts independently for the current (2560px) geometry, landing back
on the same numbers a fresh, never-dragged session at this width would
show. `lytPresence`/`railStyle` again confirmed untouched.

**Portrait (480×900):** `#resizer-inner`/`#resizer-outer` both absent —
confirmed by design, not a bug: portrait's control panel defaults absent
(repetition-first) and its board is a full-width row, not a side-column
sibling with an OUTER-bar concept (see (b)'s audit table). "Default
layout" was clicked anyway (menu → button, no divider needed to exercise
the click path) and completed without error — a safe no-op when nothing
is dragged, matching the idempotency test in the new suite.

Screenshots (scratch, not committed — established LYT convention):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/dl-rig/{00..08}-*.png`.
Raw measurement JSON: `.../dl-rig/results.json`.

## STOP-and-report items

1. **Engine row's internal sub-panel boundaries** (landscape
   `2.0.0..2.0.3`, portrait `4.0..4.3` — `A_engine_controls`/`_eval`/
   `_health`/`_queue`) are the one place both sides are genuinely
   flexible in the compiled program, outside this commission's named
   boundary list. Not implemented — see "(b)" above for the three
   disclosed reasons. Needs ratification before building.
2. **Work-status store**: no `todo`-DB item id was named in the
   commission text (only "ledger row 2379", which does not resolve
   against the `items` table's slug-shaped ids — a `SELECT ... WHERE
   title ILIKE '%default layout%'` found no match either). No SQL write
   made; flagging per RCA guard G5 rather than silently assuming there
   is nothing to close.
3. **Pre-existing doc-shapes finding** (unrelated to this change): the
   apparatus doc-shapes gate flagged `FEATURES.md:542`
   ("`Design rationale: ...`" — a 3-word fragment, not a sentence) on
   every edit to this file. That line predates this change and sits
   well outside the two bullets touched here; not fixed, per ADR-0004
   minimal-touch under partial visibility — flagged rather than silently
   left for the next session to rediscover.

## Files changed

`frontend/src/composables/chrome/useResizablePanel.ts`,
`frontend/src/composables/chrome/useLytPresenceMenu.ts`,
`frontend/src/components/chrome/LytPresenceMenu.vue`,
`frontend/src/locales/{en,ja,ko,zh-CN}.json`,
`frontend/tests/integration/lyt-default-layout.test.ts` (new),
`FEATURES.md`.

## Documentation audit (per umbrella `CLAUDE.md`)

- **`FEATURES.md`**: updated (see above) — a new user-facing capability
  (the reset button) landed in the "Workspace and chrome" section, in
  the existing "Resizers" and "Corner presence menu" bullets rather than
  a new bullet, since it's a small addition to two already-documented
  surfaces.
- **`frontend/FILES.md`**: not touched — no `src/` TypeScript/Vue file
  was created, moved, or deleted (the new test file lives under
  `tests/`, outside this map's scope per `frontend/CLAUDE.md`'s own
  "every TypeScript and Vue source file under `src/`" scoping).
- **Doc-graph**: not touched — no documentation file added, removed, or
  re-cross-referenced; the `FEATURES.md` edit is content-only within an
  already-tracked node.
- **Work-status store**: see STOP-and-report item 2.
