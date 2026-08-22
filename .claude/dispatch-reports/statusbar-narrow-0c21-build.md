# statusbar-narrow-0c21-build

Base: `next` tip `0c21780d` at dispatch, confirmed via `git log --oneline -1
next` and hard-reset in the worktree before any edit. A concurrent builder
advanced `next` to `008c136d` (toolbar/divider hardening,
`toolbar-space-0c21-build.md`) during this session; `git diff --stat
0c21780d..next -- frontend/src/components/board/StatusBar.vue
frontend/src/components/chrome/ToolbarMoveNav.vue
frontend/src/assets/css/theme.css` is empty — no conflict — and the merge +
regate against the moved tip is recorded in §7 below.

Ledger: autoharn row 2641 (`statusbar-narrow-0c21`), opened from the main
repo root per the mandate.

## Fences honored

Touched only `frontend/src/components/board/StatusBar.vue`,
`frontend/src/components/chrome/ToolbarMoveNav.vue` (StatusBar's own
mounted child, never used elsewhere — `grep -rln ToolbarMoveNav src`
confirms the only other reference is the widget registry),
`frontend/src/assets/css/theme.css` (one new token, additive, no existing
declaration edited), and the StatusBar test tier. No touch to the toolbar
cluster, divider/drag paths, sink/store, `.lyt`/`.gen.ts`, or `proxy/`.

## Per-item status

### Item 1 — narrow-register player-name occlusion + Pass overlap: FIXED, LIVE-WITNESSED, gates green

Two independent witness shots reproduced two DIFFERENT severities of the
same underlying class:

- `~/ys/0c21_status_bar_...png` (~431 CSS px bar width, estimated from a
  raw-pixel border-scan against an assumed 2x DPR capture): both names
  fully elided (bare stone chips, no character of either name) despite the
  bar's `.transient-hint` slot — normally empty — sitting on hundreds of
  free pixels the mandate's own contract says should have gone to player
  identity instead.
- `~/ys/63a0_gaslighted.png` (~290-300 CSS px, live-reproduced at that
  width with the pre-fix code): the active-turn chip rendering literally
  INSIDE the `Pass` button's box — not a cosmetic ring-bleed, a real
  overlap.

Root causes, both diagnosed via a live Playwright rig (not guessed) driving
the actual dev server against real content (long player names, 3-digit
move numbers, double-digit captures, both turn colors):

1. **The flat 90px `.status-bar--narrow .player-names { max-width: 90px }`
   cap** (from the earlier `lyt-n1-statusbar.md` fix) was a step function
   independent of genuine available width — it engaged the instant
   `.status-bar--narrow` flipped, regardless of how much of the bar was
   actually free. `.transient-hint` (base rule `flex-grow: 1`, almost
   always empty) absorbed every pixel of that free space instead of
   letting names use it.
2. Below ~300px, even `.player-names` at its own `min-width: 32px` floor no
   longer fit beside `.status-right` on the nav cluster's line — and
   because `.status-left` carries `min-width: 0` (S4, needed for the FIRST
   cause's own shrink), the overflow bled directly into `.status-right`,
   producing the deep chip-inside-Pass overlap.

Fix (three composing mechanisms, all in `StatusBar.vue` unless noted):

1. The flat 90px cap is **removed**. `.player-names` reverts to plain
   `flex: 1 1 auto` — genuinely reactive to available width in every tier.
2. `.status-bar--narrow .transient-hint { flex-grow: 0; }` — the ephemeral
   hint slot yields its claim on the bar's surplus to player identity once
   the bar is genuinely narrow (the same "lowest-priority segments yield
   first" policy `.game-info`/`.move-numbers-btn` already follow, extended
   to a segment nothing previously asked to yield). The bar's "byte-for-
   byte identical geometry whether a hint is active or not" invariant
   (commission row 837) still holds — this segment's width is ~0 before
   and after a hint's arrival/departure in narrow mode either way.
3. `.status-bar` reserves a `gap: var(--space-default)` between its three
   direct children — a structural minimum separation, defense-in-depth
   against the active-turn ring's `outline` (which "takes no layout space"
   by design) bleeding into whatever sits flush next to it.
4. **A second, independently-committed breakpoint**
   (`STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX = 300`, mirroring `narrow`'s own
   `useDeferredContainerBreakpoint` drag-continuity discipline): below it,
   `.status-bar--ultra-narrow .status-right { flex-basis: 100%; }` forces
   `Pass`/move-numbers/captures onto their own second flex line. Two
   elements on different lines cannot overlap regardless of how tight
   either line's own content is — this is the commissioner-ruled shape for
   this residual class: the bar's height is not a fixed cap, it grows to
   fit a genuine, measured demand rather than starving `.player-names`
   further (there is no lower floor than "bare chips, no name") or
   corrupting `Pass`.

**A top-level, unscoped `flex-wrap: wrap` was tried and reverted.**
Chromium's line-breaking pass uses each item's un-shrunk *hypothetical*
main size, and `.status-left`'s is its full unclamped natural content
width now that `.player-names` is genuinely uncapped (fix 1 above) — large
enough that an unscoped wrap was live-witnessed triggering a premature
line-break at 900px AND 1920px bar widths, an unrelated regression.
Scoping the wrap (and the 100%-basis force) to ONLY `.status-right`,
gated by its own dedicated breakpoint rather than the browser's implicit
fit decision, avoids that regression entirely — confirmed clean at every
non-ultra-narrow width tested down to 310px.

Live witnesses (rig: `127.0.0.1:19110` backend / `127.0.0.1:19111`
frontend, both dead before use and killed after; a copy of
`backend/samples/cards.sample.db`, never the real `cards.db`;
`window.store` DEV console handle for board-state overrides, per this
codebase's established convention):

- Before/after at ~270px (ultra-narrow tier, matching the `gaslighted`
  shot's geometry): `before-270.png` shows the black active-turn chip
  rendered inside the `Pass` button; `after-270-final.png` shows Pass
  cleanly on its own second line, both chips + partial names visible on
  line 1, `overlapPassBlack: {overlaps: false}` confirmed via a real
  `getBoundingClientRect` probe.
- Before/after at 431px (matching the first shot's estimated geometry):
  before shows names truncated to "A..." / "F..." (the old flat 90px cap,
  showing almost nothing even at ample-relative-to-need width); after
  shows "Alexan..." / "Feathe..." — visibly more of each name, using the
  freed space instead of leaving it to `.transient-hint`.
- 1920×1080: both full names render ("Alexandrescu Constantinopoulos" vs
  "Featherstonehaugh Cholmondeley"), unified control heights visible,
  `overlapPassWhiteChip: {overlaps: false}`.
- A live width sweep (fresh page per width — a sequential
  `setViewportSize()` on one page left the breakpoint composable's
  committed ref stale, a drag-release-shaped settle signal a scripted
  resize never fires) from 200px to 1920px, both short and long player
  names, both turn colors: **zero overlap at any tested width**, full
  names rendering wherever width allows, symmetric proportional
  degradation under genuine narrowness, clean single-line down to 310px,
  clean two-line below 300px.

Screenshots referenced above are scratch (not committed, per this
codebase's established LYT-report convention) — available at
`/tmp/claude-1000/-home-bork-w-omega/34662d1c-abab-419f-acb0-b36c9a5e7de0/scratchpad/sb-rig/witness/` for the duration of this session.

### Item 2 — unused vertical space: FIXED as a CONSEQUENCE of item 3's height unification, not a separate cap

Diagnosis: the bar's own `min-height: 20px` had silently drifted from the
bar's REAL floor once the move-nav cluster relocated into this bar (per
its own header comment, "item 1 — BOARD CONTROLS GO TO THE BOARD") — the
nav cluster's own G30 24px pointer-target floor already forced the row
taller than the bar's stated 20px minimum, so the declared floor no longer
described reality, and shorter controls (`.pass-btn` at 18px, `.komi-input`
at 20px) rendered with asymmetric dead space around them relative to the
24px the row was ALREADY being forced to.

**Per the commissioner's mid-task ruling on this item**: the fix is not a
cap that starves the bar, it is raising the *stated* floor
(`.status-bar`'s own `min-height`) to match the height its content
honestly already needed (24px, `--control-height-min`) — no `max-height`
is introduced anywhere, and the ultra-narrow tier (item 1) demonstrates the
bar growing PAST that floor to a full second line when content genuinely
needs more room, which the bar's CSS permits unconditionally (no cap).
Live-measured bar height: 25px (24px content + 1px border-top) at every
single-line width; 65px (two 24px content lines + border + the
`--space-default` row-gap `flex-wrap` inserts between them) in the
ultra-narrow tier — both are the bar's genuine content demand, not a
tuned number.

**Handoff (named per the ruling, NOT actioned by this build — outside this
component's fence):** the ultra-narrow tier's extra height (65px vs. the
single-line 25px) is real, measured content demand on whatever column/LYT
track this bar is mounted in below ~300px bar width. If that ancestor
track has a fixed or clamped height, the second line this fix introduces
could still be clipped there — this build did not verify the ancestor
column's behavior (LytNode/track allocation is outside this file's fence,
per the mandate), and the live rig used a bare component mount / direct
viewport resize, not the full LYT column chain. Flagging this explicitly
rather than silently assuming the ancestor already accommodates it.

### Item 3 — nav/pass control-height mismatch: FIXED, LIVE-WITNESSED, gates green

Root cause (measured, not guessed): `ToolbarMoveNav.vue`'s `.toolbar-btn`
carried its own independent `min-height: 24px` (G30 pointer-target floor);
`StatusBar.vue`'s `.pass-btn` carried no `min-height` at all (rendering
18px given its own padding/line-height/border); `.komi-input` carried an
independent `min-height: 20px`. Three numbers, three independent authoring
decisions, agreeing only by coincidence — the exact ADR-0012 P1 (single-
source-of-truth) shape this codebase already names for the SAME 24px floor
at eight OTHER sites (`style.css`'s checkbox-rule comment: "one document-
wide rule... instead of eight per-site sprinkles").

Fix: minted `--control-height-min: 24px` in `theme.css`'s spacing-scale
section (one new anchor, additive — no existing token's value changed,
confirmed by a new source-count assertion:
`StatusBar-ultra-narrow-and-control-height.test.ts`'s "theme.css mints
exactly one --control-height-min anchor" test). Grepped for an existing
size/height token before minting (per ADR-0012 P1's own check and the
mandate's explicit instruction) — none exists; the 24px G30 floor was
previously encoded as a bare literal at every site, never as a token.
`.pass-btn`, `.komi-input`, `.move-numbers-btn` (StatusBar.vue) and
`.toolbar-btn` (ToolbarMoveNav.vue — StatusBar's own mounted child, per
the fence) now all read the same token; `.pass-btn` additionally gained
the same `display: inline-flex; align-items: center; justify-content:
center;` centering recipe `.toolbar-btn` already used, so its label
centers in the taller box without touching padding/font-size (the visual
language, untouched). No other G30 site (Toolbar.vue's other copies,
`ToolbarEngineControls.vue`, `ToolbarAppCluster.vue`, `RegistryEditor.vue`,
etc.) was swept — out of this fix's scope per ADR-0004's no-retroactive-
sweep posture; each retrofits on its own future touch.

Live-witnessed: `after-1920-crop-big.png` (cropped/zoomed status-bar row
at 1920×1080) shows the nav cluster, Pass, and text baseline all sharing
one visual height band — no more mismatched dead space around the
previously-18px Pass button.

## Gates (from `frontend/`, synchronous, foreground, outputs read)

- `npx vue-tsc -b --noEmit` — **clean, no output.**
- Targeted `npx vitest run` (StatusBar suites + every test file
  transitively importing `StatusBar.vue` / `ToolbarMoveNav.vue` /
  `theme.css`, found via `grep -rl`): **all passed** after updating three
  pre-existing tests that pinned the superseded shape (see below).
- Full `npx vitest run` (whole suite, import-graph reach beyond the
  targeted set): **292 files / 3610 passed, 8 skipped, 1 failed** —
  `system-message-sink.test.ts` ("a SystemLogPanel-shaped subscriber runs
  exactly once per push, INCLUDING dedup-hit pushes", `runs` off by one).
  **Isolation re-run** (`npx vitest run
  tests/unit/services/system-message-sink.test.ts` alone): **16/16
  passed** — confirmed unrelated to this change (the file has zero
  relationship to StatusBar/ToolbarMoveNav/theme.css; a pre-existing
  order-dependent flake in the full-suite run, not a regression this
  build introduced).
- `npm run build` (`vue-tsc -b && vite build`) — clean, 1274 modules
  transformed, `dist/` emitted. Pre-existing single-bundle chunk-size
  warning (3.2MB), unrelated, not addressed.

## Tests added/adjusted

- `tests/integration/StatusBar-narrow-no-overflow.test.ts` — rewritten in
  place (not left red, not deleted): the former 90px-cap pin is replaced
  with an absence pin (`.player-names carries NO narrow-mode max-width`);
  new pins for the `.transient-hint` demotion and the `.status-bar` gap;
  the arithmetic no-overflow section re-derives `MINIMUM_BAR_WIDTH_PX`
  using `.player-names`' `min-width: 32px` FLOOR (the terminal value that
  survives the cap's removal) instead of the former 90px cap value, plus a
  new assertion that this minimum sits strictly between the ultra-narrow
  (300px) and narrow-floor (420px) breakpoints — the tier boundaries don't
  overlap.
- `tests/integration/StatusBar-ultra-narrow-and-control-height.test.ts`
  (new) — pins `.status-bar--ultra-narrow .status-right`'s `flex-basis:
  100%` + the bar's own `flex-wrap: wrap` (both ONLY under the ultra-
  narrow class, confirming the unscoped-wrap regression can't reappear);
  the breakpoint-ordering invariant (ultra-narrow < narrow); all four
  control-height consumers (`.pass-btn`, `.komi-input`,
  `.move-numbers-btn`, `ToolbarMoveNav.vue`'s `.toolbar-btn`) reading the
  shared token; `.pass-btn`'s flex-centering; and a source-count assertion
  that `theme.css` mints exactly one `--control-height-min` declaration.
- `tests/integration/status-bar-player-names-ellipsis.test.ts` — the one
  test pinning the former 90px cap's rule text is updated to assert the
  rule's ABSENCE; an addendum note added to the file's own header
  documenting the supersession per this codebase's amend-by-append
  discipline.
- `tests/unit/pointer-target-minimum-size.test.ts` — the two assertions
  regexing a bare `24px` literal for `.move-numbers-btn` and
  `ToolbarMoveNav.vue`'s `.toolbar-btn` now also accept
  `var(--control-height-min)` (the two sites this build actually touched);
  the OTHER two files' `.toolbar-btn` copies (`ToolbarEngineControls.vue`,
  `ToolbarAppCluster.vue`) are untouched and still assert the bare
  literal, unaffected.

## A jsdom cascade-ordering accommodation, disclosed

`.status-bar--narrow .transient-hint { flex-grow: 0; }` had to be declared
in source AFTER the base `.transient-hint` rule (not grouped with its
narrow-mode siblings earlier in the file) — jsdom's computed-style
resolution was witnessed NOT preferring the more-specific narrow-mode
selector over the base rule's own same-property declaration when the
narrow-mode rule appeared EARLIER in source, even though a real browser's
cascade (specificity first, source order only as a tie-break) prefers the
more-specific selector regardless of declaration order. This is the same
family of jsdom-only accommodation this file already documents twice (the
padding-shorthand and flex-shorthand round-trip quirks); the rule's own
comment names the reordering and why.

## Documentation audit (per umbrella CLAUDE.md)

- **Work-status store**: ledger row 2641 opened at task start, claimed for
  this build; closed on delivery with this report + witness paths per the
  mandate.
- **`FEATURES.md`**: not touched — this is a bug fix restoring/improving
  already-documented capability (player names, Pass reachability) at
  narrow widths, not a new/removed/materially-altered user-facing
  capability.
- **`frontend/FILES.md`**: not touched — no file created, moved, or
  deleted under `src/`; the one new file
  (`StatusBar-ultra-narrow-and-control-height.test.ts`) is under `tests/`,
  outside that map's stated scope. `StatusBar.vue`'s and
  `ToolbarMoveNav.vue`'s existing band tags/purpose lines are unaffected
  (same dependencies, same domain-coupling).
- **Doc-graph**: not touched — no documentation file added, removed, or
  re-cross-referenced.
- **ADR-0006 headers**: both touched SFCs' existing headers (pathname +
  purpose + license) are unchanged in shape; the new test file's header
  follows the sibling StatusBar test files' convention.

## Not done / honestly disclosed

- **The ultra-narrow tier's extra height is a named handoff, not verified
  end-to-end against the real LYT column** — see item 2's own handoff
  paragraph above. This build's live rig mounted the app directly against
  a bare viewport resize, not through whatever ancestor grid/track sizes
  this bar's column in the shipped layout; if that ancestor clips or
  fixes its row height, the second line this fix introduces below ~300px
  could still be invisible there. Flagged for the column/track owner
  (outside this file's fence) to confirm or size for.
- **No sweep of the other G30 24px sites** (`ToolbarEngineControls.vue`,
  `ToolbarAppCluster.vue`, `RegistryEditor.vue`, `style.css`'s checkbox
  rule, etc.) onto the new `--control-height-min` token — ADR-0004
  no-retroactive-sweep; each retrofits on its own future touch, named as
  a pointer in the token's own theme.css comment.
- **The exact CSS pixel width of either witness screenshot is an estimate**
  (a raw-pixel border-scan against an ASSUMED 2x device-pixel-ratio,
  since the screenshots' true capture DPR is not recorded metadata this
  build had access to) — the live rig instead swept the FULL plausible
  range (200-1920px) with real content and confirmed zero overlap at every
  width outside the intentional two-line ultra-narrow tier, which is a
  stronger claim than pinning one exact width would have been, but the
  specific "is 431px or 290px the TRUE geometry of shot 1" question is
  disclosed as unresolved rather than silently assumed.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
