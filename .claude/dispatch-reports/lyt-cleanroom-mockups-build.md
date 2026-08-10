# lyt-cleanroom-mockups build report

Commission: ledger row 1703, worktree `lyt-cleanroom-mockups`
(`worktree-agent-ae4a256de63fae1f9`, cut from `lyt-phase2` @ 956551bd,
verified fresh at session start — HEAD matched exactly, no rebase
needed). Commissioner's words: "can we try to produce something that
doesn't look amateurish, now that we can consolidate all widgets by
function and build something hierarchically correct?"

Two commissioner amendments landed mid-task, both **before any code was
written** (the first draft already incorporates both — nothing was
converted after the fact):

1. Realize the LYT tree as a **live CSS layout** (browser resizes
   correctly), not absolute-positioned solved rectangles; the CP-SAT
   solve becomes a toggleable verification overlay.
2. Realize each LYT inner node as a **single-axis CSS Grid** (not flex),
   nested to the tree's own depth, one grid per node.

## Read record (ADR-0002)

Read end to end before any claim: `research/lyt/README.md`,
`research/lyt/SPEC-AMENDMENTS.md`,
`.claude/dispatch-reports/layout-language-consult.md` (**note**: this
file is untracked in git and therefore absent from this worktree's own
checkout — read from the main checkout's absolute path,
`/home/bork/w/omega/.claude/dispatch-reports/layout-language-consult.md`,
disclosed at the time per ADR-0002), `frontend/src/assets/css/theme.css`
(full file, not just the header — 686 lines, read in full since real
token values were needed for the mockup's own inline CSS), the umbrella
`CLAUDE.md`, `frontend/CLAUDE.md`. Also read in full: `emit_ts.py`,
`runner.py`, `lyt_ast.py`, `loader.py` (the sizing-resolution sections),
`compiler.py` (the `SolveResult`/`_constrain` sections), both
`encodings/lengyue_landscape.lyt` and `encodings/lengyue_portrait.lyt`.

## Deliverables

- `research/lyt/emit_mockup.py` — the generator. Loads the two
  clean-room encodings via `loader.load_layouts` (byte-identical
  registration to `runner.py`'s `"lengyue_landscape+portrait"` entry),
  walks the resulting `ast.Slot` tree recursively, and emits one static
  self-contained HTML page per screen class realizing the tree as nested
  CSS Grid containers. The CP-SAT solve
  (`compiler.solve_lexicographic`, reused verbatim — no second solving
  logic) is embedded as JSON data for a toggleable debug overlay, not
  used for positioning.
- `research/lyt/mockups/landscape.html`, `research/lyt/mockups/portrait.html`
  — generated output (regenerate, don't hand-edit).
- `research/lyt/mockups/shoot.mjs` — Playwright screenshot script
  (file:// URLs, no dev server).
- `research/lyt/mockups/shots/*.png` — 8 screenshots (inventory below).
- `research/lyt/tests/test_lyt.py` — 14 new tests for the emitter
  (appended, following the existing `emit_ts.py` test-block convention
  in the same file).

## LYT → CSS Grid mapping table (second amendment's required disclosure)

Restated from `emit_mockup.py`'s own module docstring, which is the
canonical copy:

| LYT construct | CSS realization |
|---|---|
| `H(...)` node | `display:grid; grid-auto-flow:column; grid-template-columns:<tracks>; grid-template-rows:1fr;` |
| `V(...)` node | transpose: `grid-auto-flow:row; grid-template-rows:<tracks>; grid-template-columns:1fr;` |
| `T(...)` node | tab strip (auto-height row) + single active body (1fr row) — a disclosed simplification, see below |
| fixed sizing (`min=pref=max`) | track = `<v>px` |
| elastic uncapped (`max:inf`, `pref: Nfr`) | track = `minmax(<min>px, Nfr)` |
| elastic **+ capped** (`max: Xpx`, `pref: Nfr`) | track = `minmax(<min>px, Xpx)` — **the fr weight is dropped**; CSS `minmax()` has only two argument slots, and the hard `max` (a genuine LYT constraint) wins over the soft `pref` (an LYT *objective* term, not a constraint) |
| T node's own track floor | `_exclusive_derived_min_px` reproduces `compiler.py`'s `_constrain` Exclusive branch (componentwise max of children's own `min`, both axes) exactly, rather than the loader's un-derived 0px default |
| board leaf (aspect-locked) | grid's default `stretch` is overridden on the item (`justify-self`/`align-self:center` on the cross axis) + `aspect-ratio:1/1` + `max-width/max-height:100%` — the CSS-grid analog of `compiler.py`'s own disclosed one-directional cross-axis relaxation for aspect leaves |

Every track is additionally parameterized as `var(--track-N, <computed
value>)` rather than the bare value — this is load-bearing for the
presence-menu's `release` semantics (see Defect 1 below), not a stylistic
choice.

## Per-claim WITNESSED status

1. **Geometry from the solver** (superseded by amendment 1 into a
   verification role) — WITNESSED. `build_overlay_data` calls
   `compiler.solve_lexicographic` with the same inputs `runner.py` /
   `emit_ts.py` use; `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
   asserts every embedded solve is `OPTIMAL` with a real `B` rect.
   Visually confirmed: the overlay-verification screenshots show the
   solved-rect outlines landing exactly on the live grid's own edges at
   every region boundary (see `landscape-1920x1080-overlay-verification.png`).
2. **Functional consolidation visible** — WITNESSED. Five (landscape) /
   four (portrait) top-level groups get a subtle `--border-1` border
   (`.lyt-group`); real widget names render as honest, fixed-sample
   proxies (buttons at 24px height, `KataGo v1.0.27 · Connected ·
   Model: b18-8192 · 1200 pps · 40 ms · Queue 2` for the engine info
   envelope, etc.) — no content that would vary at runtime.
   Debug-class (C) widgets (autoNav / popStress / clearCache, per the
   census, folded into `A_common`'s own `.lyt` comment) render as one
   relegated, non-interactive `Debug (3)` pill, not three separate
   buttons on the main row.
3. **Corner presence-menu** — WITNESSED, with one real defect found and
   fixed during verification (Defect 1 below). A single 28×28px button
   in the extreme lower-right opens an opaque `--surface-0` popover
   listing every toggle target; toggling actually shows/hides the
   corresponding region and either releases (`display:none` + the
   region's own grid track collapsed to 0px) or preserves
   (`visibility:hidden`, box keeps its exact footprint) its space, per
   each target's declared presence. Confirmed via direct Playwright
   `boundingBox()` assertions (not just visual inspection) for both a
   `release` and a `preserve` target — see Defect 1.
4. **Standing design law** — WITNESSED. Real dark-theme tokens copied
   from `theme.css` (hex values, not re-derived); every readable text
   node is `--text-0`; no `box-shadow` / `transition` / `blur` /
   translucent-fill anywhere in the generated CSS (`grep -c` confirms
   zero occurrences); the popover is opaque and sits in the lower-right
   corner of the SIDE COLUMN / bottom of the TREE region, never over the
   board (board occupies the left/upper area in both classes — visually
   confirmed in every screenshot); buttons are 24px tall, checkboxes are
   16px inside a 24px-min-height label row (the label, not the bare
   checkbox, is the pointer target); no `text-overflow:ellipsis`
   anywhere in the stylesheet.
5. **Screenshots** — WITNESSED, 8 files (inventory below), captured
   under `systemd-run --user --scope -p MemoryMax=4G` with
   `--js-flags=--max-old-space-size=1024`, one browser instance closed
   in `finally`, no `waitForTimeout`, `file://` URLs (no scratch port
   needed — pages are fully self-contained).

## Defect found and fixed during verification: release-toggle track mis-tracking

While ad-hoc-verifying the presence-menu (not part of the screenshot
set, but done before finalizing it — a broken interactive affordance in
a "professional, hierarchically correct" mockup would have been exactly
the wrong thing to ship silently), toggling "Go Actions" off in the
**first working version** collapsed the "Tree & Panels" region from
996px tall to 28px tall. Root cause: relying on implicit `grid-auto-flow`
placement meant a `display:none` sibling was removed from the
auto-placement item list entirely, so the *remaining* siblings shifted
into the wrong explicit tracks — the elastic T-node track never got
claimed by anything.

Fix: every grid child now gets **explicit** `grid-row`/`grid-column`
placement (immune to siblings' presence), and every track is
parameterized by its own CSS custom property
(`var(--track-N, <computed>)`) that a `release` toggle sets to `0px`
(collapsing exactly that track) and a re-check removes (restoring the
original value via the `var()` fallback). Verified with direct
`boundingBox()` assertions: toggling "Go Actions" off now correctly
grows "Tree & Panels" from 996px → 1024px (reclaiming exactly the
released 28px) and toggling back on restores the exact original
geometry byte-for-byte. This mechanism and its rationale are documented
inline in `emit_mockup.py`'s `render_split` and the embedded `_SCRIPT`.

A second smaller defect (also fixed pre-screenshot): the first draft
used a `position:absolute` overlay label for each group's caption,
which overlapped the region's own content on every fixed-height 28px
strip (visible in an early "GO ACTIONS" over "Mint Card" screenshot,
not committed). Fixed by splicing captions inline into the row's own
flex content (`.row-caption` for leaf strips, `.lyt-tab-caption` for
the T node's tabstrip) instead of a separate absolutely-positioned div;
the Board group (a Split with no single row to splice into) simply
carries no text caption — its content is unambiguous without one.

## Disclosed judgment calls (none touch a solved rectangle, the census
assignment, or add/remove a widget — the commission's own STOP-and-
report boundary was not crossed by any of these)

- **Corner presence-menu targets and release/preserve choice.** Neither
  `.lyt` source file declares an `@toggle` presence — both are entirely
  `@fixed`. The corner menu is therefore an ADDED UI affordance, not a
  rendering of declared presence. Targets: the five (landscape) / four
  (portrait) top-level consolidated groups. Board and Tree & Panels use
  `preserve`; the action/info strips use `release` — matching the
  census's own sidebar-collapse-rail / board-tree-controls-toggle
  family.
- **Theme: dark only.** The commission's own phrasing ("both themes if
  cheap, else the cluster default — say which") is ambiguous about
  whether "cluster" names the fallback theme or is a slip for "just
  default." Interpreted as: pick one, disclose it. Dark chosen (theme.css's
  own docstring calls it "the long-standing default"). Flagging this
  explicitly in case the commissioner meant the literal cluster theme —
  cheap to redo if so, now that the token-copy mechanism exists.
- **T-node mapping is a tab strip + single active body**, not a literal
  stacked six-child grid cell. The five inactive CP-* tabs render as
  labels only, not duplicate placeholder body DOM (they're the census's
  own declared BLACK BOX). The exclusive/shared-rectangle property still
  holds structurally: the body area's size comes from the T node's own
  track in its parent, never from whichever child happens to be active.
- **T-node tabs are not click-interactive.** Per the commission's own
  "This is the ONE interactive element" (the corner menu). Tree renders
  active by construction (first child in both encodings).
- **Board leaf content** is plain black/white circles, not the app's
  `engine/constants.ts` domain palette — this script imports no
  application code at all, per the umbrella's scope discipline.
- **Debug-pill text stays `--text-0`** (not `--text-disabled`) per the
  standing "all readable text is max-contrast always" ruling — the pill
  is visually de-emphasized only via a slightly darker background
  (`--surface-2`/`--border-1`), never via dimmed text.

## Regeneration commands

```
cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_mockup.py
```

```
cd research/lyt/mockups && systemd-run --user --scope -p MemoryMax=4G -- \
  node --max-old-space-size=1024 shoot.mjs
```
(`shoot.mjs` needs `playwright-core`, resolvable via `frontend/`'s own
`node_modules` — this worktree had none installed; a local symlink was
used to run it and removed again afterward. Whoever regenerates
screenshots from a checkout without `frontend/node_modules` installed
will need the same, or `npm install` in `frontend/` first.)

## Screenshot inventory (`research/lyt/mockups/shots/`)

| file | size | state |
|---|---|---|
| `landscape-1920x1080-menu-closed.png` | 1920×1080 | main set |
| `landscape-1920x1080-menu-open.png` | 1920×1080 | main set |
| `landscape-1920x1080-overlay-verification.png` | 1920×1080 | solve-vs-grid verification |
| `landscape-2560x1440-menu-closed.png` | 2560×1440 | main set |
| `landscape-2560x1440-menu-open.png` | 2560×1440 | main set |
| `portrait-1080x1920-menu-closed.png` | 1080×1920 | main set |
| `portrait-1080x1920-menu-open.png` | 1080×1920 | main set |
| `portrait-1080x1920-overlay-verification.png` | 1080×1920 | solve-vs-grid verification |

## Gate

`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q`
→ **63 passed** (49 pre-existing + 14 new, foreground, exit 0, no
retries needed).

## Scope discipline

`frontend/` is untouched — confirmed via `git status` before finalizing
this report. Nothing under this commission reads or writes application
code; `emit_mockup.py` reads only `research/lyt/`'s own modules and
`theme.css` (read-only, for token values copied by hand into the
mockup's own inline stylesheet, not imported).

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
