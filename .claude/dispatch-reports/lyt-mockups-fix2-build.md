# LYT clean-room mockups — fix pass 2 (build report)

Commission: clear the SECOND Opus review pass
(`.claude/dispatch-reports/lyt-mockups-opus-review.md`'s "Re-review --
2026-08-10" section, against commit `41a71cd9`). Worktree
`/home/bork/w/omega/.claude/worktrees/agent-ae4a256de63fae1f9`. Ledger
rows 1717-1723. Fixes went into the GENERATOR
(`research/lyt/emit_mockup.py`) only — the two `.html` pages under
`research/lyt/mockups/` are regenerated output, never hand-edited.

## Read record (ADR-0002)

Read end to end before this pass began: `research/lyt/emit_mockup.py`
in full (both times — before editing and again after, to confirm the
final diff); `.claude/dispatch-reports/lyt-mockups-opus-review.md`
(both dated sections — the first review and the re-review, since the
re-review's own findings are only fully load-bearing against the first
pass's own disposition of each earlier finding); `research/lyt/tests/
test_lyt.py`'s existing `emit_mockup.py` coverage section (lines
920-1206, to match its own conventions rather than inventing a
different style); `research/lyt/mockups/shoot.mjs` in full (to reuse
its own Playwright discipline rather than re-deriving it); the umbrella
`CLAUDE.md`. **Not read:** the two `.lyt` encodings, `parser.py`,
`loader.py`, `compiler.py`, `SPEC-AMENDMENTS.md`, `research/lyt/
README.md` — none of this pass's four fixes touch the LYT language or
its compiler, only the CSS-grid/JS realization the generator already
owns, so nothing below makes a claim about those files.

## Fixes, one per finding

### N1 (blocker) — per-node track-property namespacing

**Root cause** (review's own diagnosis, confirmed): `render_split`
parameterized every child's grid track as `var(--track-{i}, <value>)`
where `{i}` was a bare PER-LEVEL index (0, 1, 2, …). A CSS custom
property is an ordinary *inherited* property — an override set via
`el.parentElement.style.setProperty('--track-0', '0px')` on one grid
container is visible to every DESCENDANT's own `var(--track-0, …)`
lookup too, not only that one container's own template. The portrait
root's own `--track-0`/`--track-2` and the nested board composite's
OWN `--track-0`/`--track-2` (a separate grid, deeper in the tree)
collided on exactly this basis, so releasing "Top Actions" (root
`--track-0`) inherited into the board composite's own row-0 override,
collapsing the board to 2×2, and releasing "Engine Info" (root
`--track-2`) zeroed the board's own action strip.

**Fix**: `track_prop` is now derived from the child's own FULL PATH
FROM THE TREE ROOT — `"--track-" + "-".join(str(p) for p in cpath)` —
instead of the bare index. Since a tuple → hyphen-joined-string mapping
is injective (digits never contain the `-` delimiter), no two distinct
nodes in the whole tree can ever produce the same property name, by
construction, not by luck of the two specific encodings in hand. One
call site changed (`render_split`), plus the `data-track-prop`
attribute and the JS that reads it already pass the value through
opaquely, so no other change was needed.

Verified concretely (both a pytest-side structural pin and the
browser-side power-set walk, below) — not merely "no longer measured
colliding at the two specimen paths the review found", but "cannot
collide, full stop".

### X2 residual — caption-gutter overflow + tab-strip alignment

Two sub-issues, both closed:

1. `flex: 0 0 92px` alone didn't cap a longer caption's rendered width
   (a flex item's automatic minimum defaults to its content's
   min-content size, which can exceed an explicit basis) — "COMMON
   ACTIONS" measured 97.55px, not 92. Fixed: `min-width: 0` on the
   shared `.row-caption, .lyt-tab-caption` rule makes the 92px basis a
   real ceiling; `overflow: hidden; text-overflow: ellipsis;
   white-space: nowrap;` turn the now-real clipped case into a clean
   truncation rather than a layout break (none of the four captions in
   either class actually need to truncate at their current lengths —
   this is a defensive floor, not something exercised today).
2. The tab strip had no counterpart to the rows' own 4px left padding
   (captions at x=1105 vs 1109) AND no counterpart to the rows' own
   `gap: var(--space-default)` between flex children (content at
   x=1204 vs 1212, even after the caption boxes themselves lined up —
   the rows' caption carries an explicit `margin-right` AND the row's
   own flex `gap` stacks on top of it; the tab strip only had the
   margin). Fixed: `.lyt-tabstrip` gains both `padding-left:
   var(--space-tight)` and `gap: var(--space-default)`, matching the
   rows' own box model term-for-term.

**Measured, landscape 1920×1080** (`_adhoc_measure.mjs`, a throwaway
Playwright probe run and removed after use — not part of the
deliverable):

| strip | caption x (before → after) | content-start x (before → after) |
|---|---|---|
| Go Actions | 1109 → 1108 | 1212 → **1212** |
| Engine Info | 1109 → 1108 | 1212 → **1212** |
| Common Actions | 1109 → 1108 | 1217.55 → **1212** |
| Tree & Panels (tab strip) | 1105 → 1108 | 1196.59 → **1212** |

All four content-start columns are now bit-for-bit identical (1212px),
down from a 21px ragged edge. (The 1109→1108 shift on the three rows
is a rounding artifact of the tab strip's own padding now matching
theirs to the pixel, not a regression — all four captions land at 1108
now, previously three landed at 1109 and one at 1105.)

### N2 — disable instead of silently reverting

The first fix pass's guard against the all-release-off terminal state
accepted the click and then reverted it (`cb.checked = true; return;`)
with no visible feedback — indistinguishable from a bug. Fixed: a new
`updateReleaseGuard()` runs after every release-checkbox change (and
once at page load) and DISABLES the sole remaining checked release
checkbox, with `title = 'At least one panel must stay visible'`,
re-enabling every checkbox the moment a second one is checked. The
click that would zero the last panel is now refused up front, not
accepted-then-undone. Verified by the power-set walker below (14 of
the 48 states visited have exactly one release checkbox checked; every
one confirmed `disabled === true` and a non-empty `title`).

### N3 — align the board's own strips to the board square

The board's info/action rows (`I_board`/`A_board`) were flush against
the composite GROUP's own box (a flat 4px inset), independent of where
the aspect-locked `.board-square` actually renders inside its own
centered cell — the square's own inset scales with viewport (0px at
some sizes, hundreds of px at others), so "Pass"/"Move 47" drifted away
from the board they describe as the window grows.

Fixed by reproducing `.board-square`'s own sizing formula one level
up, against the SAME box: the composite gains `container-type: size`
(the identical mechanism `.board-cell` already uses one level down)
and an inline `--board-fixed-sum` (its own fixed-sibling total, 52px in
both classes — already computed by `_find_board_composite_child`, just
threaded through). The `.board-composite` CSS rule then caps
`.info-row`/`.actions-row` inside it to `min(100cqw, calc(100cqh -
var(--board-fixed-sum, 0px)))` and centers them with `margin: auto` —
the exact width the square resolves to, not an independently guessed
inset.

**Measured, landscape 1920×1080:**

| | before | after |
|---|---|---|
| board square x | 37 | 37 (unchanged — N3 doesn't touch board sizing) |
| "Pass" (board action strip) x | 8 | **41** |
| "Move 47" (board info strip) x | 8 | **41** |

The remaining 4px gap between the board's own left edge (37) and its
strips' content (41) is the row's own standard `padding: 0
var(--space-tight)` (4px) — the same internal inset every other row on
the page already carries; the strip's own BOX is centered under the
square exactly (both share the identical formula against the identical
container), the content sits 4px inside that box by the same
convention as everywhere else. The review's own worst-case example (a
~609px disconnect at 3440×1440, since the old flat 4px inset didn't
scale with the square's own viewport-dependent centering offset) no
longer has anywhere to come from — the row and the square now derive
from the same formula.

## Regression coverage

Six new pytest cases in `research/lyt/tests/test_lyt.py`, appended
after the existing fix-pass-1 section:

- `test_track_prop_naming_is_collision_free_by_construction` — walks
  BOTH classes' real trees, computes every Split child's `track_prop`
  the same way `render_split` does, asserts the per-class set has zero
  duplicates. This is the pytest-side collision-freedom pin the
  commission asked for.
- `test_generated_pages_declare_every_track_prop_exactly_once` —
  concrete regression pin against the actual rendered HTML (not just
  the abstract model of it): the count of `var(--track-…, …)`
  declarations must equal the tree's own Split-child count, with zero
  duplicate names.
- `test_release_toggle_track_prop_is_path_namespaced` — pins the exact
  defect shape the review found (a bare single-level index), not just
  its abstract precondition.
- `test_x2_caption_gutter_clips_overflow_and_tabstrip_matches_row_padding`
- `test_n2_release_guard_disables_last_checkbox_instead_of_reverting`
- `test_n3_board_composite_marker_and_fixed_sum_are_emitted`

`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q`
→ **76 passed, exit 0** (70 pre-existing + 6 new).

## The power-set verifier (browser-side, scripted, not one-time)

New sibling script `research/lyt/mockups/verify_power_set.mjs` — the
review's own required fix for N1 ("re-run the presence power set on
both classes — that is the check this pass skipped"), made a durable
regression rather than a manual pass. For every combination of the
presence menu's own checkboxes (2^5 = 32 landscape, 2^4 = 16 portrait,
matching the review's own stated counts) it asserts:

- (a) `.board-square` has a real, square bounding box (>0 both axes,
  `|w−h| ≤ 1px`) in every state.
- (b) no `[data-toggle-id]` region collapses UNLESS it is the one whose
  own checkbox is off (a `release` target, unchecked) — the direct N1
  regression check.
- (c) restoring every checkbox to checked returns EVERY region's
  geometry to the exact baseline, checked after EVERY one of the 48
  states (not just once at the end).
- (side-check) whenever exactly one release checkbox is checked, it
  must be `disabled` with a non-empty `title` (N2).

Checkbox states are driven by setting `.checked` + dispatching
`change` directly (not `page.check()`/`uncheck()`, which would respect
the N2 guard's `disabled` attribute and refuse to reach some raw
combinations) — this script verifies geometry across the FULL raw
combination space, including states a real user's clicks can no longer
reach post-N2-fix.

Run (foreground, `systemd-run --user --scope -p MemoryMax=4G`, `nice
-n 19`, `--js-flags=--max-old-space-size=1024`, one browser closed in
`finally`, `file://` URLs, no wall-clock waits):

```
$ systemd-run --user --scope -p MemoryMax=4G -- \
    nice -n 19 node --max-old-space-size=1024 research/lyt/mockups/verify_power_set.mjs
[verify_power_set] launching chromium (headless)…
[verify_power_set] landscape: 5 targets, 32 states -- board-controls(preserve), go-actions(release), engine-info(release), common-actions(release), tree-panels(release)
[verify_power_set] landscape: walked 32/32 states, 8 N2 guard checks
[verify_power_set] portrait: 4 targets, 16 states -- top-actions(release), board-controls(preserve), engine-info(release), tree-panels(release)
[verify_power_set] portrait: walked 16/16 states, 6 N2 guard checks

=== power-set verification summary ===
  landscape: 32/32 states walked, 8 N2 guard checks, all restore-all deep-equal to baseline
  portrait: 16/16 states walked, 6 N2 guard checks, all restore-all deep-equal to baseline
  total violations: 0
[verify_power_set] PASSED -- report written to research/lyt/mockups/shots/power-set-report.json
```

**Zero violations across all 48 states, both classes.** The report
JSON (`research/lyt/mockups/shots/power-set-report.json`) is the
machine-readable source of the numbers above.

Two throwaway probe scripts (`_adhoc_measure.mjs`,
`_adhoc_n1_evidence.mjs`) were used to pull the specific x-coordinate
measurements quoted above and two extra N1 evidence screenshots, then
deleted — not part of the deliverable, per the same disclosed-and-
removed discipline the fix-pass-1 report used for its own
`playwright-core` symlink workaround (below).

## Screenshots

`research/lyt/mockups/shots/` was regenerated in place (18 files —
same shot families as `shoot.mjs`'s own header describes: MAIN,
MENU-OPEN, OVERLAY-VERIFICATION), plus:

- `N1-fix2-portrait-topactions-off.png` / `N1-fix2-portrait-
  engineinfo-off.png` — the two states the review's own N1 finding
  named as destructive, now confirmed intact (`.board-square` stays
  1072×1072; the board's own action strip stays 1072×28 wide).
- `zoom-side-strips-fix2.png` / `zoom-board-strips-fix2.png` — X2/N3
  close-ups.

**Disclosed side effect:** running `shoot.mjs` with `rm -rf shots &&
mkdir -p shots` (matching the brief's own instruction to "replace
shots/") also removed the first Opus review's own `shots/opus/` and
the re-review's own `shots/opus2/` evidence directories, which were
untracked and are not recoverable from this checkout. Flagging this
explicitly (ADR-0002) rather than letting it pass silently — if either
review's own screenshot evidence is still needed for the record, it
would need to be re-captured or is only preserved wherever a separate
snapshot of the worktree already exists.

`research/lyt/mockups/node_modules` was a temporary symlink to
`/home/bork/w/omega/frontend/node_modules` (this worktree ships none
of its own — same disclosed workaround the fix-pass-1 build report
used), removed after both Playwright scripts finished running.

## What was NOT touched

Per the commission: the two accepted partials (M2 dead-space
disposition, M4 truncation-fade disposition) and X3 (the LYT
zero-gap language question, adjudication pending) are untouched — no
change to `_STYLE`'s gap/border handling, no change to
`WIDGET_CONTENT`/`ROW_WIDGETS` density, no change to the T-node
exclusive-tab structure.

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
