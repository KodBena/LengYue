# W4 fix pass — clearing `lyt-w4-chrome-review.md`'s three findings

Target: worktree `/home/bork/w/omega/.claude/worktrees/agent-a4228b6ed3fec5360`,
branch `worktree-agent-a4228b6ed3fec5360`, base commit `ff085762`. Authority:
`.claude/dispatch-reports/lyt-w4-chrome-review.md`, read end to end before
any of the three fixes below were made.

Scope: exactly the three findings the review named (MAJOR item 6, MINOR
item 2's dead SGF forwarding, MINOR doc-discipline `FILES.md` gap). No
other files touched — `git diff --stat` against `ff085762` below confirms
the diff maps 1:1 onto the three items.

## 1. Side-column floor (the MAJOR finding)

### Grounding

The review's own width-sweep table (`lyt-w4-chrome-review.md` item 6)
measured the true no-clip floor at **~335px** (0px overflow at 335px,
first clipping — `.setup-toolkit`, 2px — at 330px), against the shipped
280px floor's measured 52px of clipping. Corrected floor: **345px**
(335px + a 10px safety margin), matching the same margin-over-measured
posture the file's own earlier REPAIR PASS section used (374px measured
→ 384px shipped, "10px margin over the real-app floor").

Changed: `research/lyt/encodings/lengyue_landscape.lyt`'s side column
`min` (`280px → 345px`), with a new "W4 FLOOR CORRECTION" header section
documenting the derivation and the disclosed tension (below). Regenerated
via the documented chain (`cd research/lyt && nice -n 19
~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration
landscape`) — `frontend/src/state/lyt-layout.gen.ts` line 71's
`board-priority-clamp` track now carries `minPx: 345` (was 280).

### Direction (a): re-swept width sweep at the corrected floor

Wrote `.claude/dispatch-reports/lyt-w4-fix-floor-sweep-probe.mjs`,
reproducing the review's own methodology (force the `.lyt-node` grid-track
element hosting `.lyt-toolbar-strip` to descending widths, walk
descendants for right-edge overflow past the forced container). One
methodology correction made while building it, disclosed in the probe's
own header: measuring the OUTER `.lyt-node`'s `scrollWidth - clientWidth`
is NOT a usable proxy — `.lyt-toolbar-strip` declares `overflow-y: auto`,
which per spec computes `overflow-x` to `auto` too, so it becomes its own
scroll container and does not propagate content overflow up to the side
column's own `scrollWidth` (a first draft using that metric produced
49px/64px "overflow" readings at 345px/330px that traced, on direct DOM
inspection, to the UNRELATED tree/T-node sibling row, not `.setup-toolkit`
at all). Measuring `.setup-toolkit`'s own `getBoundingClientRect()`
against the forced container's right edge directly reproduces the
review's own numbers closely:

| Forced column width | Overflow (this pass) | Review's own table |
|---|---|---|
| 820–350px | 0px | 0px (820–340px) |
| 346px | 0px | (not in review's table) |
| 345px (**corrected floor**) | **0px** | (not in review's table) |
| 344–335px | 0px | 0px (335px) |
| 330px | 1.73px | 2px |
| 325px | 6.73px | 7px |
| 320px | 11.73px | 12px |
| 300px | 31.73px | 32px |
| 280px (old shipped floor) | 51.73px | 52px |
| 260px | 71.73px | 72px |

Run against a dev server on dead scratch ports (probe-isolation section
below); full output:

```
PASS  toolbar strip present

| width | overflowPx | firstClipped |
|---|---|---|
| 820px | 0px | none |
| 400px | 0px | none |
| 350px | 0px | none |
| 346px | 0px | none |
| 345px | 0px | none |
| 344px | 0px | none |
| 340px | 0px | none |
| 335px | 0px | none |
| 330px | 1.73px | setup-toolkit |
| 325px | 6.73px | setup-toolkit |
| 320px | 11.73px | setup-toolkit |
| 300px | 31.73px | setup-toolkit |
| 280px | 51.73px | setup-toolkit |
| 260px | 71.73px | setup-toolkit |
PASS  PROBE ISOLATION: no request ever targeted a live/dead-but-forbidden port

ALL CHECKS PASSED
```

No clipping at or above the corrected 345px floor, matching direction (a)
exactly. The margin between the corrected floor (345px) and the first
measured clip point (330px, one increment below 335px) is real — the
344px/340px rows are informational only (below the floor, not asserted),
included so the margin is visible in the table rather than asserted at
the single edge value.

### Direction (b): the three feasibility pins — a genuine tension found, not papered over

Re-solving `research/lyt/tests/test_lyt.py` at 345px surfaces a real cost
the review's own recommendation ("~345–350px with margin") did not
predict in detail. Of the three landscape sizes the W4 FLOOR SOFTENING
pass flipped to OPTIMAL under the **default** presence valuation
(1280x1024, 1024x700, 900x600):

| Size | Status at 280px (softened) | Status at 345px (corrected) |
|---|---|---|
| 1280x1024 | OPTIMAL | **INFEASIBLE** |
| 1024x700 | OPTIMAL | OPTIMAL |
| 900x600 | OPTIMAL | **INFEASIBLE** |

Only 1024x700 survives. Binary-searching the breakpoints (informational,
not shipped as intermediate values):

- **1280x1024** flips to INFEASIBLE at any floor ≥ 297px — i.e. it was
  ALREADY infeasible at the review's own measured 335px true no-clip
  floor, before any safety margin was even added. There is no floor that
  is both clip-free (≥335px) and keeps this pin OPTIMAL.
- **900x600** flips to INFEASIBLE somewhere between 335px and 341px — it
  survives at the bare 335px floor but not with the +10px margin.

This is the genuine tension the commission anticipated and asked to have
reported rather than resolved by re-lowering: **the same tree cannot be
both clip-free at ≥335px AND solver-OPTIMAL at 1280x1024/900x600 under
the default valuation.** The floor was corrected to 345px anyway (not
re-lowered) because clipping a permanently-reserved, standing-law-
protected UI element is the worse failure mode of the two, and because
"no compact class" (the ruling item 6 originally served) is a distinct
concern from "must the CP-SAT solve still call every debug-overlay pin
OPTIMAL" — the live app does not enforce or depend on the overlay's own
solve status at these two sizes; it enforces the CSS `clamp()` the
solve's `minPx` compiles to.

Under ALL-PRESENT, 1280x1024/1024x700/900x600 were already pinned
INFEASIBLE before this correction (unaffected: raising an
already-exceeded min cannot un-exceed it). 1366x768 stays OPTIMAL in
both valuations at 345px.

`research/lyt/tests/test_lyt.py`'s `known_infeasible_by_valuation` set
gains `("default", "landscape", "1280x1024")` and `("default",
"landscape", "900x600")`, both with an updated docstring naming the
tension explicitly (not silently re-pinned). `test_landscape_side_
column_track_carries_the_board_priority_clamp`'s pinned clamp string
moves `280px → 345px`. `research/lyt/tests/test_emit_layout_tree.py`'s
`test_board_priority_clamp_applied_to_side_column_only` moves its
`minPx` assertion `280.0 → 345.0` with the same disclosure. All 120
`research/lyt` tests pass with the updated pins (gate output below).

**This is surfaced for commissioner ratification, not resolved
unilaterally**: the floor is at the review's own recommended value and
the live-app clipping defect is genuinely fixed, but two of the three
"NO compact class" feasibility pins the Q3 ruling originally bought are
now spent to buy that fix back.

## 2. FILES.md: DebugMenu.vue entry

Added, alphabetically placed under `chrome/`, tagged `[B1]` (generic
chrome — no domain-coupled import; matches its sibling dev-only-affordance
composables' own bands):

```
│   │   ├── DebugMenu.vue              [B1]  W4 (roadmap §8 W4 item 5): dev-build-only pill trigger consolidating the four developer affordances (Clear Cache, Auto-Nav Perf, Popover Stress, Jank Test) that used to be scattered across Toolbar.vue/SidebarWidget.vue into one popover. Gated on `import.meta.env.DEV` at the component's own root `v-if` — never renders in a prod build (disclosed: still ships in the prod JS bundle, a pre-existing Vite dead-code-elimination limitation, not a regression). Mounted in App.vue's `#lyt-corner-chrome` overlay cluster — zero grid-track reservation.
```

## 3. BoardRailPopoverTrigger.vue: stale comment + dead SGF forwarding

Verified before removing: grepped `src/` and `tests/` for every
`load-sgf`/`save-sgf` reference. Nothing outside this file and App.vue's
matching corner-chrome mount consumed the emit — the toolbar strip's own
buttons (`App.vue` `#leaf-A_go`/`#leaf-A_top`) are a fully independent,
already-live code path (direct `@click="openFileDialog"` /
`@click="downloadActiveBoard"` calls, no event-forwarding chain at all).
`SidebarWidget.vue` itself confirmed to have no `defineEmits` and no SGF
button markup (already the case before this pass, per the review).

Changes:

- `BoardRailPopoverTrigger.vue`: removed the `defineEmits<{load-sgf,
  save-sgf}>()` declaration and the `@load-sgf="$emit(...)"
  @save-sgf="$emit(...)"` forwarding on its `<SidebarWidget>` mount.
  Header comment corrected — the old "both copies of the affordance stay
  live" claim is replaced with a CORRECTION paragraph naming what changed
  and why (SidebarWidget's own SGF affordance was removed earlier; this
  mount had nothing left to forward from).
- `App.vue`'s `#lyt-corner-chrome` mount of `<BoardRailPopoverTrigger>`:
  dropped the now-nonexistent `@load-sgf="openFileDialog"
  @save-sgf="downloadActiveBoard"` listeners (same dead chain, other end).

Left untouched, and flagged here as a related-but-out-of-scope
observation (not part of the three named fixes): App.vue's THIRD
`SidebarWidget` mount, at `#leaf-boardRail` (style-A rail slot, line
~711), also still wires `@load-sgf="openFileDialog"
@save-sgf="downloadActiveBoard"` onto a `SidebarWidget` that no longer
emits either event. The review's item 2 finding named only the
toolbar-strip copy and the BoardRailPopoverTrigger (style-B) copy as
"both copies of the affordance" — this third, style-A leaf mount wasn't
named, and removing it wasn't part of this commission's three items, so
it's left as-is. Worth a follow-up note if a future pass wants full
closure on this dead-code family.

Added a regression pin in `frontend/tests/unit/lyt-w4-chrome.test.ts`
(mirroring the existing `SidebarWidget.vue` "one home for Load/Save SGF"
pin): `BoardRailPopoverTrigger.vue` no longer declares or forwards
`load-sgf`/`save-sgf`, and App.vue's corner-chrome mount no longer
listens for them.

## Probe isolation (executed personally)

Dev server: `VITE_API_BASE_URL=http://127.0.0.1:19301
VITE_KATAGO_WS_URL=ws://127.0.0.1:19302 npx vite --port 19300
--strictPort` — three fresh dead scratch ports (confirmed nothing
listening beforehand via `ss -ltn`), none of them the world's
already-listening `19100`, none of the standing forbidden set
(`8764`/`1235`/`1242`/`4173`/`5173`/`5174`). The sweep probe instrumented
every Playwright request and asserted none ever targeted a forbidden
port — `PASS  PROBE ISOLATION: ...` in the output above. Dev server
process confirmed killed after the run (`ps aux | grep 19300` empty).

## Gates (foreground, literal exit codes)

| Gate | Command | Result |
|---|---|---|
| Vitest | `npx vitest run` | **exit 0** — 3028 passed, 8 skipped, 240 files (one new regression-pin test file addition over the review's 3025/240 baseline) |
| Typecheck | `npx vue-tsc -b` | **exit 0** |
| Build | `npm run build` | **exit 0** |
| research/lyt pytest | `pytest tests/ -q` (via `~/w/vdc/venvs/generic/bin/python`, the `ortools`-equipped venv — the default environment lacks it, same as the review's own setup) | **exit 0** — 120 passed |

## Scope check

`git diff --stat ff085762..HEAD` (this pass's commit) touches exactly:
`research/lyt/encodings/lengyue_landscape.lyt`,
`research/lyt/tests/test_lyt.py`, `research/lyt/tests/test_emit_
layout_tree.py`, `frontend/src/state/lyt-layout.gen.ts` (item 1);
`frontend/FILES.md` (item 2); `frontend/src/components/chrome/
BoardRailPopoverTrigger.vue`, `frontend/src/App.vue`, `frontend/tests/
unit/lyt-w4-chrome.test.ts` (item 3); plus this build report and the
review report itself (committed alongside, matching the W4 build's own
precedent of committing its review artifact). Nothing else.

License: Public Domain (The Unlicense)
