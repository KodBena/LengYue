# FIX — Defect 4: tab-strip close button clipped by `.thumb-list`

Spec: `.claude/dispatch-reports/ui-defects-investigation.md`, "Defect 4 —
tab-strip close button is clipped/occluded". Read in full, along with
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, and the umbrella
`CLAUDE.md`, per each file's own read-end-to-end discipline.

## Worktree/branch note

This worktree's initial HEAD (`3378806f`, a dependabot vite-bump merge) was
**not** a descendant of `b3bfe8c1` (the tabstrip-virtualization commit the
brief is keyed to) — it predates `next`, which has since merged that work
(`95e85b0d`). Rebased this branch onto `next` (`git rebase next`, clean, no
conflicts) before starting, so the fix lands on top of the real
virtualization code, not a stale pre-virtualization `SidebarWidget.vue`.

## Root cause (re-derived, not just cited)

`.thumb-list` (`SidebarWidget.vue`) is a real scroll/clip container
(`overflow-y: auto`; per CSS 2.1 §11.1.1 the un-authored `overflow-x`
computes to `auto` too). `.close-board-btn` (`BoardTab.vue`) sits at
`top: -6px; right: -6px` relative to `.tab-thumb`, poking outside its own
`.thumb-container`'s box by design (the "detached affordance" look).

I worked out the geometry before picking a fix location, because the
report's literal suggested location (a one-time `padding-top` on
`.thumb-list`, i.e. before ALL content) only protects **scrollTop = 0**
(tab index 0). A scroll/clip box's clip boundary is the container's own
fixed client rect; content — including a single leading padding — scrolls
past it like any other content once `scrollTop` exceeds that padding's
height. So a single top-of-list buffer does nothing for tab 1, 2, … once
scrolled to. But `SidebarWidget.vue`'s own `scrollToIndex` (fired on every
`activeBoardIndex` change — i.e. every board switch) snaps a tab's top
**exactly** to the container's top edge (`el.scrollTop = index * h`) —
meaning **every** tab, not just tab 0, reaches a state where its own body
is 100% visible/flush at the container's top edge, and at that exact
state the button (which lives entirely above the tab's own box) is
entirely clipped regardless of which tab it is. This is exactly what the
report's mechanism paragraph claims ("each newly-topmost tab's button gets
clipped in turn") but the report's own suggested single-padding
implementation does not actually fix.

**Deviation from the report's literal suggested location, disclosed:**
fixed it at the per-tab level instead — `padding-top: 6px` on
`.thumb-container` (`BoardTab.vue`), not on `.thumb-list`
(`SidebarWidget.vue`). Because `offsetHeight`/`getBoundingClientRect`
include padding, this space travels with every tab as it scrolls, so
whichever tab lands flush-at-top (the `scrollToIndex` case, reached by
every board) has room for its button inside its own box. The button's own
`top: -6px; right: -6px` relative to `.tab-thumb` is **unchanged** — the
detached, half-overlapping-corner look is intact; only a container-level
padding was added, which is not "moving the button inside the tab box."

**Disclosed visual side effect:** tabs, previously flush against each
other in the rail, now have a uniform 6px gap between them. This is a
real, visible change to the rail's density (not free), traded for actual
correctness across every tab rather than only the first one. Flagging
this explicitly rather than picking it silently, per the report's own
framing of the button-position alternative.

## Height math (verified by reading `useVirtualList.ts` in full)

`frontend/src/composables/chrome/useVirtualList.ts` is a fixed-height
windower: `itemHeight()` is read as a single scalar for every slot (no
per-item measurement — the file's own header says so explicitly), used
for `window` (slice bounds), `topPadPx`/`bottomPadPx` (spacers), and
`scrollToIndex`'s `index * h` math. `SidebarWidget.vue` supplies
`itemHeight: () => tabHeight.value`, a `ref` defaulted to a magic-literal
tied to `BoardTab.vue`'s CSS and **self-corrected in `onMounted`** by
measuring `.thumb-container.offsetHeight` directly off the live DOM.
`offsetHeight` includes padding (content + padding + border), so the new
`padding-top: 6px` is picked up by that existing measurement with **no
composable change required** — confirmed by reading `onMounted`'s body:
`firstTab.offsetHeight` is read straight off `querySelector('.thumb-container')`,
which now naturally returns 52 instead of 46. Updated the `ref(46)`
default to `ref(52)` (32 `.tab-thumb` + 2 `.indicator-row` margin-top + 12
`.indicator-row` + 6 new padding-top) purely to remove a one-frame
mismatch before the mount-time correction runs; the correction itself
needed no code change. `window`/`topPadPx`/`bottomPadPx`/`scrollToIndex`
all read `itemHeight()` fresh on every computation, so once `tabHeight.value`
updates to 52 the whole windowing/spacer/scroll-to math is internally
consistent — no drift, no separate compensation term needed. The virtual
windowing itself (which items render, how many) is untouched: only the
per-slot height constant changed, which is exactly the axis this
composable is built to abstract over.

## Right-edge case

Checked, not fixed. `.close-board-btn`'s `right: -6px` pokes past
`.tab-thumb`/`.thumb-container` (same width, 86px), but `#sidebar-widget`
is a fixed 168px, giving ~35–40px of static horizontal gutter each side —
far more than the 6px overshoot — so right-edge clipping cannot occur
under the current fixed-width layout (vertical scroll doesn't move
horizontal geometry). Did not add `padding-right` to `.thumb-container`:
it would shift the tab-thumb's horizontal centering within its own column
by ~3px, a cosmetic regression for zero present benefit. **Residual,
named per the brief:** if `#sidebar-widget` or `--tab-width` narrow in a
future change such that the horizontal gutter drops under ~10px, this
residual reopens and would need the same per-tab treatment horizontally.

## Files changed

- `frontend/src/components/board/BoardTab.vue` — `.thumb-container` gets
  `padding-top: 6px`, with an inline comment carrying the reasoning above
  and a cross-reference from `.close-board-btn`'s existing comment.
- `frontend/src/components/chrome/SidebarWidget.vue` — `tabHeight` default
  `ref(46)` → `ref(52)`, comment updated to include the new padding term.

No change to `useVirtualList.ts` itself, and no change to the virtual
window's item count/visibility logic — the perf commit's point (bounded
live DOM) is untouched.

## Test — acceptance probe

`.claude/dispatch-reports/ui-fix-4-probe.mjs` (Playwright, `playwright-core`,
already a frontend devDependency). Drives the real app through its own
"+" affordance to seed >20 boards, then scrolls `.thumb-list` through a
spread of `scrollTop` values split into two kinds:

- **`aligned`** (`k * measured-tab-height`, tab body 100% visible, flush
  at the container's top edge — the real `scrollToIndex`-reachable state
  every board hits): asserted, `btnRect.top >= listRect.top`.
- **`mid-scroll`** (in-between positions, topmost tab's own body already
  partially cut): reported for visibility, **not** asserted — a partially
  scrolled tab's button being invisible too is ordinary scroll clipping,
  not the defect.

Tab height is measured live off the DOM (`.thumb-container`'s own
`getBoundingClientRect().height`), not hardcoded, so the "aligned" target
set is correct against whichever build (pre- or post-fix) the probe runs
against.

**WITNESSED — probe self-test, against the pre-fix `4173` preview build**
(this host's only long-running LengYue server; serves the build predating
this session's source edits — see the script's own header comment):
25 boards seeded, 50 scroll positions sampled, 45 `aligned` / 5
`mid-scroll`. Result: **45/45 aligned positions CLIPPED**
(`btnTop=37.00 < listTop=41.00`, exactly the report's own witnessed
`4173` measurement, reproduced identically at every tab-flush scroll
position, not just tab 0) — confirms the probe is a live, sensitive guard
(not vacuously passing) and confirms the "every tab via `scrollToIndex`"
mechanism claim empirically, not just by the geometric argument above.

**UNEXERCISED — post-fix live assertion.** The 4173 preview build predates
this session's `BoardTab.vue`/`SidebarWidget.vue` edits. Verifying the fix
closes the gap requires `npm run build && npm run preview` (or equivalent)
picking up the new source, which this brief explicitly instructs me not to
do (no rebuild/restart of servers). Concrete blocker: no rebuilt/restarted
preview server was available this session. `npm run build` itself (gate
below) does succeed against the changed source, which is the closest
available signal that the change compiles and typechecks cleanly, but is
not a substitute for the live DOM-clip assertion.

## Gates (actual tails)

```
$ npm run build
✓ 1081 modules transformed.
✓ built in 1.98s
(only warning: main chunk >500kB, pre-existing, unrelated to this change)

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  82 passed | 3 skipped (85)
      Tests  1114 passed | 4 skipped (1118)
   Duration  96.67s
```

`npm install` was required first (worktree had no `node_modules`); ran it
before the gates, no `package.json`/lockfile changes resulted.

## Verification checklist (frontend/CLAUDE.md §Output structure)

- Separation of concerns intact: both edits are pure CSS/`ref`-default
  changes in existing SFCs; no new logic, no new composable, no service
  call.
- No wire shapes touched (unrelated to the ACL).
- No `as` assertions introduced.
- `useVirtualList.ts` (the perf-sensitive B1 composable) was **read in
  full**, not edited — confirmed its `itemHeight()`-is-a-getter design
  already absorbs the new padding with zero code change, per the height-
  math section above.
