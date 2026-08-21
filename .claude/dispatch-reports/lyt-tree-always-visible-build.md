# lyt-tree-always-visible build report

Commission: worktree `agent-a2713c4583bf20cac` (slug `lyt-tree-always-visible`),
rebased onto `lyt-phase2` @ `b4d096b3` (verified fresh at session start --
`verify_power_set.mjs` present, HEAD was actually main's tip and an
ancestor of `lyt-phase2`, so a rebase was needed and performed before any
edit).

Commissioner's original words (reviewing the clean-room mockups):
"'Tree & Panels' look like it has tabs, one for tree and one for the
other stuff in the control panel, but the tree should always be
visible." Two further brief additions landed mid-task (both explicitly
"address before completing"): (1) reinstate `boardRail` (the open-boards
thumbnail rail, omitted from the clean-room encodings) as a
user-toggleable, default-OFF, space-releasing slot; (2) add
`previewBoard`, a variation-preview mini board, lower-right, aspect-1,
also default-OFF toggleable. All three are implemented below in one
pass since they touch the same two encodings and the same generator.

## Read record (ADR-0002)

Read end to end before any claim: `research/lyt/README.md`,
`research/lyt/SPEC-AMENDMENTS.md`, both `.lyt` encodings (pre-edit),
`.claude/dispatch-reports/lyt-cleanroom-mockups-build.md`,
`/home/bork/w/omega/.claude/dispatch-reports/layout-language-consult.md`
(untracked in this worktree, read from the main checkout's absolute
path per the same disclosed practice the cleanroom-mockups report used),
`frontend/src/state/layout-model.ts` (the `PanelGeometryPolicy`
section), `research/lyt/encodings/current_row_asis.lyt` (for boardRail's
real DOM shape/reservation and the as-is app's own
`H(tree, resizerInner, T(CP-*))` shape -- the direct precedent for the
tree-always-visible restructuring), `frontend/src/components/library/
LibraryPreviewPane.vue` (the 160x160 precedent cited for previewBoard),
the umbrella `CLAUDE.md`, `frontend/CLAUDE.md`. `emit_mockup.py` was
read in full before editing (module docstring, `_child_wrap`,
`render_split`, `render_leaf`, `render_exclusive`, `TOGGLE_TARGETS`,
`_SCRIPT`, `_find_board_composite_child`/`_board_priority_tracks`).
`compiler.py`'s aspect-slack machinery (`_collect_aspect_slack_terms`,
Stage 1.5) was read to confirm it is generic over every aspect leaf,
not hardcoded to the board -- relevant to previewBoard being a second
aspect-locked leaf.

## What changed, structurally

`research/lyt/encodings/lengyue_landscape.lyt` and `..._portrait.lyt`:

1. **Tree pulled out of the T(...) exclusive group into a permanent
   sibling.** `T(tree, CP-library, ..., CP-other)` becomes
   `H(tree, T(CP-library, ..., CP-other), previewBoard)`. This
   reproduces (function-consolidated, minus the resizer leaf and
   `drag-persisted`, per this prototype's disclosed L4 non-enforcement)
   the SAME shape `encodings/current_row_asis.lyt` already transcribes
   for the real app's row-axis layout. Tree's reservation is
   `min=pref=max=140px`, grounded directly in `layout-model.ts`'s
   `TREE_PANEL_MIN_WIDTH_PX` / `TREE_PANEL_DEFAULT_WIDTH_PX` (both 140,
   the one shared `ROW_AXIS_PANEL_GEOMETRY_POLICY` object every width
   class currently points at).
2. **`boardRail` reinstated** as the new FIRST child of each class's
   root split, `min=pref=max=168px` -- the exact width
   `current_row_asis.lyt`'s own `{min 168px, pref 168px, max 168px}
   V(loadSave, boardRail, addBoard, jankTest, preview)` rail column
   occupies. Only `boardRail` itself is added (not its as-is siblings
   loadSave/addBoard/jankTest/preview) since the commission named only
   "boardRail (the open-boards thumbnail rail)". Landscape: leftmost
   root child (168px WIDTH, "the left edge as today"). Portrait: a
   judgment call, disclosed in that file's own header -- the as-is
   168px is a WIDTH (a rail column), and portrait's root partitions on
   HEIGHT, so there is no literal "left edge" in a single-column stack;
   reinterpreted as a 168px-tall strip at the TOP of the page (same
   leading structural position, axis reinterpreted).
3. **`previewBoard` added**, a second aspect-1 leaf
   (`min=pref=max=160px` landscape / `96px` portrait, `aspect 1`), as
   the RIGHTMOST child of the new tree/panels row -- the bottom of the
   side column (landscape's rightmost region) / the bottom row (portrait).
   Reservation grounded in `LibraryPreviewPane.vue`'s own "160×160 box
   (both dimensions capped)" precedent; scaled down to 96px in portrait,
   disclosed as a deliberate down-scale for that class's tighter shared
   row-width budget (not a re-derivation from a stronger precedent).
4. Gap declarations (Amendment 3) extended to the new nested H row
   (`gap 4px`, `--space-tight`, matching the side column's own tier) in
   both files; the outer gaps (`--space-medium` root, `--space-tight`
   side column) are unchanged.

Full rationale, citations, and disclosed judgment calls are in each
`.lyt` file's own header comment (read those in full -- this report
restates the load-bearing facts, not the complete disclosure).

## `emit_mockup.py` changes

- `TOGGLE_TARGETS` extended to 3-tuples: `(label, presence,
  default_visible)`. Every pre-existing entry keeps `default_visible=
  True` (explicit, not implicit) -- unchanged behavior. Two new entries
  per class, both `("...", "release", False)`: "Board Rail" and
  "Preview Board". "Tree & Panels" now names ONLY the `T(CP-*)` node
  (tree itself is not a toggle target at all, per "always visible"
  meaning it isn't in this registry).
- `_child_wrap`: the board-only `is_board_leaf` (`widget == "B"`) gate
  generalized to `is_aspect_leaf` (`child.sizing.aspect is not None`) --
  previewBoard needed the SAME cross-axis container-query containment
  the board leaf already had (`.board-cell` class, kept as-is rather
  than renamed -- it is a rendering-mechanism hook, not a board-specific
  identity marker). A default-hidden release target's own element gets
  `display:none` seeded at generation time.
- `render_split`: a NEW `default_hidden_overrides` accumulator seeds
  `{track_prop}:0px;` inline on the PARENT grid's own `style` for any
  default-hidden release child -- the exact override the click-handler
  JS (`_SCRIPT`) would apply at runtime, just pre-seeded so the page
  loads already collapsed rather than flashing open-then-closed. The
  `var(--track-N, <computed>)` FALLBACK stays the full computed value
  unchanged, so checking the box (`removeProperty`) correctly restores
  it.
- `build_html_for_class`: the presence-menu checkbox's `checked`
  attribute is now conditional on `default_visible`.
- `render_leaf`: new `previewBoard` branch reuses `_board_html()`
  verbatim (same honest-proxy goban, scales via the same %/cq-based
  `.board-square` sizing). `WIDGET_CONTENT["boardRail"]` added (a
  4-row honest-proxy open-boards list, reusing the existing
  `.blackbox-body`/`.tree-row` CSS rather than inventing new rules).

## `verify_power_set.mjs` fix

Baseline geometry is now captured AFTER forcing every checkbox checked
(`setCombo(page, targets, allOnMask)`), not from the raw initial page
load. Required because boardRail/previewBoard default OFF: the old
code captured baseline from the as-loaded state (partially unchecked)
and later compared every mask's "restore all checked" result against
that baseline, which would have failed on every combination. This is a
strict superset of the old behavior -- when every target defaults on
(the pre-existing state), forcing all-checked before baseline capture
is a no-op.

## Per-claim WITNESSED status

1. **Tree always visible, both classes.** WITNESSED --
   `mockups/shots/landscape-1920x1080.png` / `portrait-1080x1920.png`
   show the tree rendered permanently alongside a 5-tab (Library / Cards
   / Settings / Analysis / Other) control panel with no "Tree" tab.
   Solved geometry (below) confirms tree's own 140px-wide rect is
   independent of, and simultaneous with, the T-node's rect.
2. **boardRail reinstated, default OFF, corner-menu wired.** WITNESSED
   -- `landscape-1920x1080-menu-open.png` shows "Board Rail" as an
   UNCHECKED entry in the presence popover; the main-set screenshots
   (menu closed) show no boardRail content, confirming default-hidden.
   An ad-hoc check (`/tmp/.../landscape-both-on.png` during this
   session, not committed) confirms toggling it on renders the 4-row
   open-boards list at the page's left edge and the board remains
   square.
3. **previewBoard added, default OFF, aspect-1, lower-right.**
   WITNESSED -- same menu-open screenshot shows "Preview Board"
   unchecked; the ad-hoc both-on check shows a small square goban at
   the lower-right of the tree/panels row, board still square
   (Δ=0.0px at every one of the 14 tested viewports per
   `mockups/shots/measurements.json`).
4. **Power-set verification, all states 0 violations.** WITNESSED --
   `node research/lyt/mockups/verify_power_set.mjs` (systemd-run
   wrapped, `frontend/node_modules` symlinked in at the worktree root
   for the run and REMOVED immediately after -- confirmed via
   `git status` showing no untracked `node_modules`): landscape now
   walks **128 states** (2^7, up from 2^5=32 -- 2 new targets), portrait
   **64 states** (2^6, up from 2^4=16). `total violations: 0` both
   classes; every restore-all deep-equals the (now correctly captured)
   baseline; the N2 last-checkbox guard fired correctly at every
   applicable mask (12 landscape / 10 portrait guard checks).
5. **Pytest, 84+ green.** WITNESSED -- `nice -n 19
   ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q`, **84
   passed**, exit 0, no pipes, foreground. Test count is unchanged from
   pre-commission HEAD (84) -- four existing tests were updated
   in-place (meaning-preserving; see "Test updates" below), none added
   or removed, since the commission's own instruction was to update
   tests pinning the OLD tree placement, not necessarily grow the
   count.
6. **Screenshots regenerated.** WITNESSED -- `shoot.mjs` run in the
   foreground under `systemd-run --user --scope -p MemoryMax=4G`, no
   timeout needed (completed well under a minute); 18 screenshots +
   `measurements.json` written, board Δ=0.0px at all 14 viewports.

## Test updates (meaning-preserving, per instructions)

- `test_generated_pages_carry_every_declared_toggle_target`: unpacks
  the new 3-tuple; ADDS an assertion that each target's checkbox
  `checked`-attribute-presence matches its `default_visible` flag
  (strictly more coverage, not a narrowing).
- `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`:
  `known_infeasible` set expanded (see "New solver-only INFEASIBLE
  sizes" below) -- same assertion shape, more sizes named.
- `test_board_has_star_points_and_coordinates`: counts doubled (9->18
  hoshi, 19->38 coords per axis) since previewBoard reuses
  `_board_html()` -- still verifies "every emitted board carries a full
  standard 19x19 hoshi/coordinate set", just now for two boards instead
  of one.
- `test_find_board_composite_child_recognizes_both_encodings_shapes`:
  pinned composite index shifted (landscape 0->1, portrait 1->2) since
  boardRail is a new leading sibling -- `_find_board_composite_child`
  itself is index-agnostic (scans by shape), so this is purely the
  expected consequence of a new sibling being inserted before the
  board composite, not a change to what the function does.

No test's MEANING needed to change; nothing here was a STOP-and-report
case.

## Before/after solved geometry, the affected region

At the two registration sizes `test_tiling_invariants_hold_on_every_
solvable_encoding` exercises (1920x1080 landscape, 1080x1920 portrait),
via `solve_lexicographic` directly against both the pre-commission HEAD
encoding and the new one:

**Landscape @ 1920x1080** (status: OPTIMAL, both before and after):

| region | BEFORE | AFTER |
|---|---|---|
| board (`B`) | x=30,y=0, **1028×1028** | x=180,y=0, **1028×1028** (unchanged) |
| tree+panels (was one `T` node) | x=1100,y=96, 820×984 (all 6 children share this rect) | -- (no longer one node) |
| tree (now a plain leaf) | -- | x=1220,y=96, **140×984** |
| panels `T(CP-*)` (5 children share this rect) | -- | x=1364,y=96, **392×984** |
| boardRail (new) | -- | x=0,y=0, **168×1080** |
| previewBoard (new) | -- | x=1760,y=508, **160×160** |
| side column outer width | 820px | 700px (narrowed -- boardRail's 168+12px gap claimed the difference; board's own size is unaffected) |

**Portrait @ 1080x1920** (status: OPTIMAL, both before and after):

| region | BEFORE | AFTER |
|---|---|---|
| board (`B`) | x=0,y=40, **1080×1080** | x=0,y=220, **1080×1080** (unchanged) |
| tree+panels (was one `T` node) | x=0,y=1224, 1080×696 | -- |
| tree (now a plain leaf) | -- | x=0,y=1404, **140×516** |
| panels `T(CP-*)` | -- | x=144,y=1404, **836×516** |
| boardRail (new) | -- | x=0,y=0, **1080×168** |
| previewBoard (new) | -- | x=984,y=1614, **96×96** |

The board's own solved size is byte-identical before/after at both
canonical sizes -- boardRail and previewBoard's fixed reservations come
out of the SIDE COLUMN's/BOTTOM ROW's own elastic budget, not the
board-maximize stage's share, which is the intended outcome (board
priority is untouched by this commission).

## New solver-only INFEASIBLE sizes (disclosed, not silently absorbed)

Re-solving `emit_mockup.py`'s full `OVERLAY_SIZES` sweep:

**Landscape** (was `{1280x1024, 1080x1920-in-landscape}`, now also
`{1366x768, 1024x700, 900x600}` -- 5 of 8 sizes INFEASIBLE):

| size | before | after |
|---|---|---|
| 1920x1080 | OPTIMAL | OPTIMAL |
| 2560x1440 | OPTIMAL | OPTIMAL |
| 1280x1024 | INFEASIBLE (pre-existing) | INFEASIBLE |
| 3440x1440 | OPTIMAL | OPTIMAL |
| 1366x768 | OPTIMAL | **INFEASIBLE (new)** |
| 1024x700 | OPTIMAL | **INFEASIBLE (new)** |
| 900x600 | OPTIMAL | **INFEASIBLE (new)** |
| 1080x1920-in-landscape | INFEASIBLE (pre-existing) | INFEASIBLE |

**Portrait** (was fully OPTIMAL, now `{420x880}` INFEASIBLE):

| size | before | after |
|---|---|---|
| 1080x1920 | OPTIMAL | OPTIMAL |
| 1200x1600 | OPTIMAL | OPTIMAL |
| 768x1024 | OPTIMAL | OPTIMAL |
| 540x960 | OPTIMAL | OPTIMAL |
| 420x880 | OPTIMAL | **INFEASIBLE (new)** |
| 1920x1080-in-portrait | OPTIMAL | OPTIMAL |

**Root cause, and why this is a disclosed limitation rather than a bug
to route around.** `compiler.py`'s own module docstring: "presence:
only the 'all slots present' valuation is solved." The CP-SAT solve
backing the debug overlay has no notion of "default hidden" -- it
reserves boardRail's 168px and previewBoard's 160px/96px (plus their
gaps) at EVERY size, unconditionally, exactly like every `@fixed` leaf.
The LIVE CSS page does not have this problem (a default-off release
target's grid track is genuinely collapsed to 0px, confirmed by the
power-set verifier's own geometry assertions above) -- only the debug
overlay's solved-rect verification is affected, and it already
degrades gracefully (`drawOverlay`'s own `status !== 'OPTIMAL'` branch
renders status text instead of crashing, unchanged pre-existing
behavior).

Per the commission's own instruction ("if a size goes INFEASIBLE,
disclose and propose the reservation adjustment rather than silently
shrinking something else"): the three new reservations (140px tree,
168px boardRail, 160px/96px previewBoard) are each grounded in a cited,
specific real-app or component precedent; further shrinking any of
them to force these five sizes back to solver-OPTIMAL would mean
picking a number NOT grounded in anything, purely to make the
presence-blind solver happy -- the wrong trade given the ruling's own
grounding requirement. The disclosed alternative (properly modeling
multiple presence valuations in the solver) is a pre-existing,
named prototype limitation, not something this commission's scope
extends to fixing. No shrinking was done; the `known_infeasible` set in
`tests/test_lyt.py::test_generated_pages_embed_valid_overlay_json_
matching_overlay_sizes` was expanded instead, with the mechanism named
in its own docstring.

One secondary consequence worth flagging: at the three sizes the
`shoot.mjs` overlay-verification screenshots are captured (1920x1080 /
2560x1440 landscape, 1080x1920 portrait -- all still OPTIMAL), the
solved-rect overlay no longer lands EXACTLY on the live grid's board
edges the way the original cleanroom-mockups report's WITNESSED claim
#1 described -- `overlay B vs live` deltas of up to 8px now appear
(`landscape 1920x1080`: dw=2,dh=2; `portrait 1080x1920`: dx=-4,dy=164,
dw=8,dh=8), because the solve reserves boardRail/previewBoard's space
that the live default-hidden page does not. This is the SAME root
cause as the table above, just visible in a different place (the
overlay screenshots rather than the OPTIMAL/INFEASIBLE status), and is
disclosed here for the same reason.

## Design note (no build action -- Vue-realization-phase fork)

The commissioner separately floated boardRail-as-POPOVER (overlay
stratum, zero standing cost, triggered from chrome) as an alternative
to the presence-slot shape built here. Recorded as an open fork for
whoever picks up the eventual Vue implementation. This session was
explicitly instructed to keep building the presence-slot version, which
is what shipped.

## Scope discipline

`frontend/` untouched -- confirmed via `git status` before finalizing.
The `frontend/node_modules` symlink used to run the two Playwright
scripts was removed before this report was written (confirmed absent
via `git status`, no untracked `node_modules` anywhere in the tree).

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
