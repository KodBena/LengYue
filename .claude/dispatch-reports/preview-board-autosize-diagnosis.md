# previewBoard track autosize — diagnosis (witness-first, no fix shipped)

**Disposition: MECHANISM NAMED, live-witnessed, geometry measured. No fix shipped** (this is a diagnosis-only dispatch; a builder session should apply the fix shape below).

## Base

`git rev-parse HEAD` = `0c21780d10ee135651a6c7b7108de9d154cd4611`, confirmed equal to `git rev-parse next` at dispatch time (the commissioned base). `git diff` is empty at the end of this session — all instrumentation described below was reverted via `git checkout --` before finalizing; nothing shipped.

## Live-repro environment (recipe, confirmed working)

- Isolated backend: `DATABASE_URI=sqlite+aiosqlite:///<scratch>/isolated.db HOST=127.0.0.1 PORT=19765 SECRET_KEY_FILE=<scratch>/.jwt_secret /home/bork/scratchpad/venv/bin/python backend/main.py` (bare `python3` fails — no `sqlalchemy` outside the scratchpad venv).
- Frontend dev server: **must be launched with `frontend/` as the actual shell cwd** (`cd frontend; npx vite --port 19174 --strictPort --host 0.0.0.0`) — invoking `npx vite --config frontend/vite.config.ts ...` from the repo root serves the WRONG root and 404s on `/` (confirmed by reproducing the 404 first, then fixing it — matches the prior session's own documented lesson).
- `frontend/.env.local`: `VITE_API_BASE_URL=http://127.0.0.1:19765`.
- `frontend/scratch-shot.mjs` (committed at base) drives Playwright headless Chromium. It needed one addition to complete this repro — a `type` action (`page.type(selector, text)`) — because the existing `eval`-based value-set on the login username field doesn't dispatch the `input` event Vue's `v-model` needs, which leaves the "Register & Sign In" button permanently `disabled`. **This addition was reverted** (`git checkout -- frontend/scratch-shot.mjs`) before finalizing; a future session redoing this repro will need to re-add it (or use `page.fill`/`page.type` directly in an ad hoc script).
- Registration flow: click `button.user-badge` → `#login-username` → type any username → click `button:has-text('Register & Sign In')`. No password required. A fresh username avoids reusing a prior run's persisted `onboarding.completed`/board state.
- The onboarding `SetupWizardModal` reliably needs **three** separate `dismissWizard()` calls with ~800ms waits between them to fully close (a single call right after registration frequently races the modal's own mount/step-transition timing and leaves it open, which then intercepts clicks on unrelated UI like the presence-menu button with a "modal-backdrop intercepts pointer events" Playwright error).
- previewBoard toggle: click `#lyt-presence-menu-btn` (opens `#lyt-presence-popover`), then click `[data-lyt-presence-target="previewBoard"] input[type="checkbox"]`. Defaults off; must be enabled per run.

## What was witnessed and measured

At 1920×1080, after enabling `previewBoard`, `document.querySelectorAll('.lyt-board-cell')` finds exactly two elements — the main board's leaf cell and previewBoard's — with `getBoundingClientRect()`:

- Main board (`widget: 'B'`) cell: `{x:12, y:0, width:1016, height:1028}`.
- previewBoard cell: `{x:1760, y:120, width:160, height:960}`.
- The actually-rendered `.preview-board-panel` (the square board itself, `src/components/board/PreviewBoardPanel.vue`): `{x:1760, y:520, width:160, height:160}`.

**The panel is a correctly-square 160×160 box, vertically centered inside a cell that is 960px tall.** That leaves roughly 400px of empty space above the panel and 400px below it — this is the "floating/detached" look in both commissioner screenshots (`~/xs/preview_board_not_autosized.png`, `~/xs/preview_board_not_showing_best_move_variation.png`): a small board marooned in a much taller empty column segment, not filling its allotted area.

## The causal chain (file:line, all read in full)

1. **`src/components/chrome/LytNode.vue`** compiles previewBoard's declared shape (per the file's own header comment, lines 476–499) as `{min 160px, pref 160px, max 160px, aspect 1}` — a `fixed` track. The `trackList` computed (lines 457–502) special-cases exactly this combination at **lines 497–499**:
   ```
   if (isAspectLeaf(c) && c.track.kind === 'fixed') {
     return `minmax(0px, ${c.track.px}px)`;
   }
   ```
   This patches the CSS grid track value **only along the axis this particular Split node uses** — `gridTemplateColumns` when `axis === 'h'`, `gridTemplateRows` when `axis === 'v'` (see `gridStyle`, lines 506–525). I confirmed via a throwaway `console.log` in this branch (reverted) that previewBoard's compiled `track` really is `{kind:'fixed', px:160}` and that the parent Split's `axis` is `'h'` here — consistent with the measured geometry (width clamped to 160, height not).

2. **The orthogonal dimension is never touched.** For an `axis:'h'` split, `gridTemplateRows` is hardcoded to `'1fr'` at **line 513** (and the mirror, `gridTemplateColumns:'1fr'` for `axis:'v'`, at line 521) — this is unconditional, with no analog of the `isAspectLeaf` special-case on the cross-axis. So previewBoard's cell gets its width correctly clamped to `minmax(0px,160px)` but its **height is whatever the enclosing row's single `1fr` track gives it** — in this repro, the full 960px available height of the side column. Nothing in `trackList`/`gridStyle` constrains the cross-axis extent of an aspect-locked leaf; only the leaf's own declared axis is patched.

3. **`.lyt-board-cell`'s CSS (lines 809–813: `container-type:size; display:flex; place-items:center;`)** combined with **`PreviewBoardPanel.vue`'s own `.preview-board-panel` rule (lines 126–139: `width/height: min(100cqw,100cqh); margin:auto`)** does successfully clamp the *rendered board* to a true 160×160 square (the narrower of the cell's 160×960 container-relative extents) — so the board itself is never distorted or clipped. But this only hides the symptom for the *slotted content*; the *cell* (`.lyt-board-cell` div, the actual grid item) stays 960px tall, and `margin:auto` centers the 160×160 panel inside that oversized box rather than the panel's parent shrinking to match it.

So: the defect is **not** in `PreviewBoardPanel.vue` (already correctly ported from `LibraryPreviewPane.vue`'s pattern per its own header, and its `min(100cqw,100cqh)` fix is doing exactly the square-clamp job it was built for). The defect is that **`LytNode.vue`'s W4 "fixed track on an aspect leaf" fix (the `minmax(0px, Npx)` patch, lines 476–499) is one-axis-only** — it recovers the *declared* axis from over-constraint (the documented original bug: "MiniBoard can be pushed partially off-viewport") but never bounds the *cross*-axis, which a `fixed`+`aspect:1` leaf's own `.lyt` declaration implies should also be ≤160px. The original W4 fix comment (lines 476–496) explicitly frames this as "only" fixing the declared-axis shrink-to-0 floor; it does not claim to solve cross-axis containment, and indeed doesn't.

## Fix shape (to ratify, not built here)

The cleanest fix keeps the existing containment machinery (`.lyt-board-cell` + `min(100cqw,100cqh)`) but stops the grid **item** itself from stretching to fill the cross-axis track. Concretely, in the `isAspectLeaf(c) && c.track.kind === 'fixed'` branch's *sibling* handling — the per-leaf inline style applied via the `.lyt-leaf-cell` template binding (around line 762, `:style="{...placementStyle(group), minWidth:'0', minHeight:'0', ...}"`) — add, for exactly this leaf shape, an explicit cap on the cross-axis dimension (`maxHeight: '${track.px}px'` when the split's own `axis==='h'`, `maxWidth` when `axis==='v'`) plus `alignSelf`/`justifySelf: 'start'` (or `'center'`, matching the existing `place-items:center` on `.lyt-board-cell` at the parent level) to stop the default grid-item `stretch`. This collapses the cell itself to the true 160×160 box rather than leaving 800px of dead space around a correctly-sized-but-marooned panel — the visual symptom the commissioner's screenshots show. It is a small, local, disclosed extension of the existing W4 special-case (same `isAspectLeaf(c) && c.track.kind === 'fixed'` guard), not a new sizing system.

## Fence compliance

- Only throwaway instrumentation touched: one `console.log` line added to `LytNode.vue`'s `trackList` computed, and one `type` action added to `frontend/scratch-shot.mjs`. Both reverted via `git checkout --` before finalizing.
- `git diff` against base `0c21780d` is **empty**.
- The running preview on :5174 was never touched; this session used its own isolated backend (port 19765) and frontend dev server (port 19174).
- No proxy, no StatusBar, no divider-mechanics code touched.

## What was NOT done

- The fix itself — not built, per this dispatch's diagnosis-only mandate.
- A regression test pinning the cross-axis containment. The fix shape above is a strong candidate for a `tests/integration/lyt-*.test.ts` (a mounted-DOM assertion on `.lyt-board-cell`'s rendered height/width ratio for an aspect+fixed leaf under a non-square parent cell) once the fix lands.
- Re-checking the "best-move variation" half of the commissioner's second screenshot title (`preview_board_not_showing_best_move_variation.png`) — that screenshot shows a genuinely empty board (no PV lines drawn), but `PreviewBoardPanel.vue`'s own header (lines 41–56, read in full) documents that PV is sourced from `useMoveSuggestions` and only renders when a `suggestions.find(s => s.isBest)` packet already exists for the active board's current node — i.e., the empty-PV screenshot may simply predate any analysis packet arriving for that position, not a separate defect. This wasn't independently re-verified live (out of this diagnosis's scope, which was pointed at the autosize geometry) — flagging rather than silently dropping it, since the commissioner's filename implies it's a live concern.
