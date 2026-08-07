# FIX 4b — tab-strip close button still clipped after ui-fix-4-tab-clip.md

Maintainer REJECTED `ui-fix-4-tab-clip.md`'s merged fix (`1917b70c` /
`f98d0c2d`, on `next`) as still broken. Evidence: `/home/bork/close_unresolved.png`
(read with image tooling), showing the close glyph on the ACTIVE tab
("Board 5") clipped along its top-right — the visible remainder is a
lower-left crescent — at the maintainer's real geometry (~10 boards,
4k/96dpi, light/pink theme).

Docs read in full per `frontend/CLAUDE.md`'s read-end-to-end discipline:
`frontend/CLAUDE.md`, umbrella `CLAUDE.md`, `.claude/dispatch-reports/
ui-defects-investigation.md` (Defect 4), `.claude/dispatch-reports/
ui-fix-4-tab-clip.md`.

## Worktree note

This worktree's initial HEAD (`3378806f`) predated `next`'s merge of the
prior (insufficient) fix. Rebased onto `next` (`git rebase next`, clean)
before starting, so this fix lands on top of the actually-merged
`1917b70c` code, not a stale pre-fix `BoardTab.vue`.

## Diagnosis — re-derived by measurement, not by re-reading the old report

The prior fix solved a real bug (`.thumb-list`'s scroll-container clipping
the topmost tab's button on **top** at particular **scroll positions**),
but that is not what the maintainer's screenshot shows: "Board 5" is
the **active** tab, not scrolled to the container's edge, and the clip
is on the **top-right**, not purely top.

Live measurement (Playwright + `/usr/bin/chromium`, viewport 3840×2160,
`deviceScaleFactor: 1` — matching 4k/96dpi — `data-theme="cluster"` for
the light/pink theme, 10 boards seeded via the app's own `+` affordance,
hovering the active mid-list tab) walked `getComputedStyle` for
`overflow`/`overflow-x`/`overflow-y`/`clip-path`/`clip`/`mask`/
`border-radius`/`transform` on **every** ancestor from `.close-board-btn`
up to `<html>`. **WITNESSED**, pre-fix:

```
.close-board-btn   rect: top=43 right=130.5 bottom=59 left=114.5  (16×16, border-radius:50%)
.tab-thumb.active   rect: top=47 right=126.5 bottom=79 left=40.5   overflow: hidden  <-- clips
.thumb-container    rect: top=41 ...                               overflow: visible
.thumb-list         rect: top=41 right=167 ...                     overflow: auto (not the clipper here)
```

`.tab-thumb`'s computed `overflow` is `hidden`, and the button's box
overshoots it on **both** the top (43 < 47) and the right (130.5 > 126.5)
— a rectangular clip cutting the top-right off a circular 16px button,
leaving exactly the lower-left crescent the screenshot shows, with the
"×" glyph (centered near the clipped corner) appearing detached. This
reproduces the maintainer's screenshot pixel-for-pixel in class (see
`repro-full.png`-style capture during diagnosis, superseded by the
post-fix screenshots below).

**Root cause.** `frontend/src/components/board/BoardTab.vue`'s own
*scoped* `.tab-thumb` rule never declares `overflow` at all — it
overrides width/height/border/background/border-radius via the `[data-v-*]`
scoping attribute's specificity, but CSS cascades **per property**, not
per rule. `frontend/src/assets/css/style.css` carries an **unscoped,
dead** global `.tab-thumb` block (`overflow: hidden`, 88×88 dimensions,
a sibling `.tab-thumb img` rule, commented-out `:hover`/`.active`
variants) — residue from `BoardTab`'s pre-rewrite thumbnail-card design.
`grep -rn "tab-thumb" src/` confirms the class is used **only** by
`BoardTab.vue`'s own scoped template today; no `<img>` markup, no
`.tab-thumb img` consumer exists anywhere. Since the scoped rule never
touches `overflow`, the dead global's `overflow: hidden` silently wins
the cascade for that one property, clipping `.close-board-btn`'s
deliberate `top:-6px; right:-6px` overshoot on **every** tab, at
**every** scroll position and board count — independent of, and a
different edge/ancestor than, the `.thumb-list` scroll-clip the prior
fix addressed. That's why the prior fix (real, but for a different bug)
didn't touch this one.

## Fix

Two parts, addressing the class ("the close affordance renders fully
unclipped at every scroll position, board count, and edge") rather than
the one demonstrated edge:

1. **Removed** the dead global `.tab-thumb` block (and its
   now-orphaned `.tab-thumb img` rule and commented-out `:hover`/
   `.active` lines) from `frontend/src/assets/css/style.css` outright —
   confirmed unreachable by any live markup, so it is a landmine, not
   living style, and patching around it (e.g. only adding a counter-
   declaration) would leave the same silent-property-leak class of bug
   available to the next unset property.
2. **Declared `overflow: visible` explicitly** on `BoardTab.vue`'s own
   scoped `.tab-thumb` rule, with a comment naming why (the
   close-button's deliberate overshoot) and pointing at this
   investigation — defense-in-depth so a future global rule touching
   `.tab-thumb` can't silently reintroduce the same clip; the component
   that owns the overhanging child now owns the overflow declaration
   that makes it safe.

No change to `.thumb-container`'s `padding-top: 6px` or `SidebarWidget.vue`'s
`tabHeight` (the prior fix's `.thumb-list` scroll-clip fix) — both are
still correct for the separate bug they address.

Files changed:
- `frontend/src/assets/css/style.css` — dead `.tab-thumb` block removed.
- `frontend/src/components/board/BoardTab.vue` — scoped `.tab-thumb`
  gets an explicit `overflow: visible` + comment.

The "move the button inside the tab's own box" alternative (explicitly
authorized by this dispatch's brief if edge-patching turned out to be
whack-a-mole) was **not** needed: once the actual clipping ancestor
(`.tab-thumb`, not `.thumb-list`) is identified and its `overflow` is
made deliberate rather than accidental, the existing "detached
affordance" look (button half on/half off the tab's rounded corner) is
fully preservable and unclipped. No visual-design trade-off was made.

## Live validation

Built in this worktree (`npm run build`; **not** the main checkout's
`dist`), served on a spare port (`npx vite preview --port 4601`,
separate from the maintainer's own `4173`), killed after validation.

**Ancestor-chain re-check post-fix** (same probe, same geometry):
`.tab-thumb`'s `overflow` now reads `visible`/`visible` on both axes;
no ancestor in the full chain (`.tab-thumb`, `.thumb-container`,
`.thumb-virt`, `.thumb-list`, `#sidebar-widget`, `body`, `html`) clips
any of the button's four edges.

**Full sweep** (`.claude/dispatch-reports/sweep-close-btn.mjs` — every
tab, hovered, at every sampled scroll position, checked against every
clipping ancestor on all four edges), 3840×2160 viewport,
`deviceScaleFactor: 1`:

```
boards=10 theme=cluster  scrollPositions=43  checks=1591   PASS: 0 clips
boards=25 theme=cluster  scrollPositions=67  checks=2479   PASS: 0 clips
boards=10 theme=dark     scrollPositions=76  checks=2812   PASS: 0 clips
```

(`dark` theme included as a cross-theme sanity check since the bug is
CSS-cascade-shaped, not theme-shaped — it was never expected to differ,
and didn't.)

**Screenshots** (`.claude/dispatch-reports/ui-fix-4b-sidebar-context.png`,
`ui-fix-4b-button-zoom.png`) — 4k/96dpi viewport, `cluster` (light/pink)
theme, 10 boards seeded, an active mid-list tab hovered (mirroring
`close_unresolved.png`'s "Board 5" framing). The close button renders as
a complete, unclipped circle with a clean centered "×", no crescent,
no detached glyph. (Board numbers read high because boards persist
across localStorage between script runs in this worktree's dev profile —
cosmetic to the validation, not a defect.)

**WITNESSED status**: every claim above is a live measurement or a
live screenshot against this session's own rebuilt bundle, not a
static-code inference.

## Gates (actual tails)

```
$ npm run build
✓ 1084 modules transformed.
✓ built in 1.85s
(only warning: main chunk >500kB, pre-existing, unrelated)

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  90 passed | 3 skipped (93)
      Tests  1156 passed | 4 skipped (1160)
   Duration  90.11s
```

## Verification checklist (frontend/CLAUDE.md §Output structure)

- Separation of concerns intact: pure CSS changes (one rule removed,
  one property added) in existing SFC/global stylesheet; no new logic,
  no composable, no service call.
- No wire shapes touched.
- No `as` assertions introduced.
- `grep -rn "tab-thumb" src/` re-run post-edit to confirm the removed
  global block had no live consumer other than `BoardTab.vue`'s own
  scoped markup — clean.
