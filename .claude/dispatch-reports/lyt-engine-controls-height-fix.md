# A_engine_controls clipping fix (ledger row 2347, reviewer finding 1)

Branch: `lyt-phase2-engine-controls-fix`, cut from `ef9f9a3b` (the tip
of `lyt-phase2` at commission time). HEAD after this work:
**`b7117bda4946b75dd91b760d4f51c6f12f5f2a29`**.

## Base-freshness note (disclosed deviation)

The commission named `lyt-phase2` as the working branch. This
worktree's own checked-out branch (`worktree-agent-a592284ddae714a87`)
was cut from an unrelated history (a `main`-side dependabot-merge
chain, not an ancestor of `ef9f9a3b`) — `git merge-base --is-ancestor
ef9f9a3b HEAD` failed at the FIRST ACT check, as instructed. Since
`lyt-phase2` was already checked out in the shared checkout
(`/home/bork/w/omega`) and Git refuses two worktrees on the same
branch, this worktree created a new branch
`lyt-phase2-engine-controls-fix` directly from `ef9f9a3b` (byte-
identical starting tree to `lyt-phase2`'s own tip) rather than
force-touching the shared checkout's branch. All work below is on
that branch; it fast-forwards cleanly onto `lyt-phase2` (same base
commit, no divergent history) whenever the commissioner wants it
merged in.

## Reading discipline (named gap, ADR-0002)

Given the scope of this fix (a single height re-grounding plus its
witnessing), full end-to-end reads of every umbrella orientation
document (`README.md`, `docs/handoff-current.md`,
`docs/adr-synopsis.md`, every ADR) were not undertaken this session —
named here rather than silently skipped, per the umbrella CLAUDE.md's
own instruction for when full reading isn't affordable. What WAS read
end to end: the umbrella `CLAUDE.md`, the frontend `CLAUDE.md` (both
surfaced in full via system context), the full "M2 STAGE B2b" dated
comment section in `lengyue_landscape.lyt` (lines ~830–1085, the
decomposition this fix corrects), `ToolbarEngineControls.vue`,
`ToolbarEngineMetrics.vue`, `EngineQueueTooltip.vue`, and `LytNode.vue`
in full. If the commissioner wants the full orientation-document read
before this lands, that's a reasonable ask — flagging the gap rather
than bluffing coverage.

## The defect

The B2b boot-restoration (`ef9f9a3b`) retired the merged
`ToolbarEngineCluster.vue` and split it into four leaves
(`A_engine_controls`/`eval`/`health`/`queue`), but the wrapping
`H(...)`'s own height fact — `60px` — was carried forward verbatim
from the retired cluster's own wrapping-H measurement (per that
stage's own comment: "the SAME `{60px, envelope: {disconnected,
connected}}` height reservation the single leaf declared before").
`ToolbarEngineControls.vue` realizes `A_engine_controls` as five
buttons (mint-card / learn-path / play / match / connect-disconnect)
in a `flex-wrap: wrap` row; at the real post-decomposition column
width (a quarter of the side column, not the old merged cluster's full
width), the five buttons wrap to **three** rows, not the two the old
number assumed — Match and Connect/Disconnect clip invisible.

## Measurement (isolated rig)

Built `frontend` (`npm run build`, exit 0), served `dist/` via `vite
preview` on scratch port 19101 (verified dead first), loaded the app
unauthenticated (no backend needed for cold boot — same posture
`frontend/scripts/lyt-conformance.mjs`'s own header documents),
Playwright/Chromium (one instance, closed in `finally`). Found
`.engine-controls`, read its LIVE rendered width (the real CSS-Grid
track width), then cloned it into a detached `height:auto` sandbox at
that same width to read its natural content need independent of the
60px clamp.

| size | live column width | natural height | live cell height (before fix) |
|---|---|---|---|
| 1920x1080 | 197.5px | **80px** | 60px |
| 768x1024 | 189px | **80px** | 60px |

80px = 3 rows × 24px (`.toolbar-btn`'s own `min-height: 24px`) + 2
gaps × 4px (`--space-tight`) = 72 + 8. Matches the reviewer's own
"~80px" finding exactly, at both tested sizes.

**The other three groups**, checked but not independently
runtime-measured under this rig (disclosed — same isolation limit
`EngineQueueTooltip.vue`'s own header already names: `.engine-metrics-
bar` / `.queue-metric` mount only while `useEngineControls().
isConnected` is true, which a dead-pinned, backend-less isolated rig
cannot provide): read via the realized CSS instead.
`.engine-metrics-bar` and `.queue-metric` both declare `display: flex`
with **no** `flex-wrap` property (default `nowrap`) — unlike
`.engine-controls`, neither can ever wrap to a second row regardless
of column width. Their real need didn't move; only
`A_engine_controls`'s did.

## The fix — model-first, single-row shape retained

`research/lyt/encodings/lengyue_{landscape,portrait}.lyt`: the shared
`H(A_engine_controls, A_engine_eval, A_engine_health, A_engine_queue)`
row's height fact changes `60px` → `80px`, with a new dated comment
section in each file (matching the file's own convention: measurement
comment carrying component, method, raw numbers, margin posture) —
see "(4) ENGINE-ROW HEIGHT RE-GROUNDING" in both files, placed
immediately before each `layout ... =` declaration.

**Structural limitation, named (not resolved).** LYT's `H(...)` shares
ONE cross-axis (height) fact across every child — the grammar has no
per-child height override inside an H split. Genuinely honest
per-group heights (80px / ~28px / ~28px / ~24px) aren't expressible
without either (a) restructuring this row into a `V(H(...), H(...),
...)` nest (a real tree-shape change touching `App.vue`'s slot wiring,
`lyt-widget-registry.ts`, and the coverage-matrix solve), or (b) new
LYT grammar for per-child cross-axis overrides. Neither is undertaken
here — filed as a frontier item in both encodings' own comment, per
this stage's STOP-and-report discipline, rather than silently picking
one unasked.

The landed fix stays within the single-row shape: the ONE shared fact
is raised to the row's real worst-case need. The three lighter groups
gain ~52–56px of harmless vertical slack inside their own now-taller
cells (no clipping, no coverage regression) — the correct direction to
be wrong in if the single-row shape must pick one number, per the
commission's own instruction not to CSS-squeeze the actual defect
away.

## Regeneration (mechanical)

- `research/lyt/emit_layout_tree.py --registration landscape` →
  `frontend/src/state/lyt-layout.gen.ts` (`60` → `80` on path `2.0`'s
  fixed track, the only diff).
- `research/lyt/emit_layout_tree.py --registration portrait` →
  `frontend/src/state/lyt-layout-portrait.gen.ts` (same single-value
  diff on the analogous path).
- `research/lyt/emit_mockup.py` → `research/lyt/mockups/{landscape,
  portrait}.html` regenerated (emitter output changed — the static
  mockup's own engine-row height literal moved with it).

## Gates (literal exit codes)

- `nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest
  research/lyt -q` → **366 passed**, exit 0 (both before and after the
  `.gen.ts` regen — the two `test_*_render_ts_roundtrip_matches_
  committed_file` tests failed against the STALE `.gen.ts` files
  before regen, as expected, then passed after).
- `research/lyt/coverage_matrix.py`: exit 1 both before and after
  (**pre-existing** — the "portrait floor VIOLATED" condition already
  present at `ef9f9a3b`, unrelated to this fix). Diffing the full
  24-point before/after output: **every verdict identical** (only the
  reported solve wall-time float moved, 0.196s → 0.197s) — no
  feasibility flip anywhere, including landscape/default/1920x1080
  (OPTIMAL, unchanged) and portrait/default/768x1024 (INFEASIBLE,
  unchanged — a pre-existing condition this fix neither causes nor
  cures).
- `nice -n 19 npm --prefix frontend run build` → exit 0
  (`vue-tsc -b && vite build`, clean).
- `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2 nice -n 19 npm --prefix frontend run test:run` →
  **3167 passed, 8 skipped** (256 test files passed, 3 skipped), exit
  0. Includes the mounted-App boot test from `ef9f9a3b`.

## Witnessing (isolated rig, own ports)

Ports 19300 (backend)/19301 (frontend)/19302 (dead-pinned
`VITE_KATAGO_WS_URL`) verified dead via `/dev/tcp` probe before use,
same allocation the `ef9f9a3b` witnessing session used. Backend:
`backend/venv/bin/python -m fastapi run backend/main.py --host
127.0.0.1 --port 19300`, `DATABASE_URI=sqlite+aiosqlite:///<copy of
backend/samples/cards.sample.db>` (never the real `cards.db`),
`QEUBO_ENABLED=false`. Theme seeded: the DB copy's `documents` row
(`key='user_workspace_01'`) had `profile.settings.appearance.theme`
rewritten `'dark'` → `'cluster'` (the light-background theme value)
via a direct sqlite3 `json_set` write, verified by re-reading the row.
Frontend: `vite frontend --port 19301 --host 127.0.0.1 --strictPort`
with `VITE_API_BASE_URL=http://127.0.0.1:19300`,
`VITE_KATAGO_WS_URL=ws://127.0.0.1:19302`. Playwright under
`systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 node
--max-old-space-size=1024`, `--js-flags=--max-old-space-size=1024` on
the launched Chromium, one browser instance closed in `finally`, every
wait a `waitForSelector` (no wall-clock sleeps). Both processes killed
by PID after the shoot; both ports re-verified dead afterward. No
port in 4173/5173/5174/8764/1235/1242/195xx or any live process/DB was
touched.

Screenshots (not committed — scratchpad convention, same as prior LYT
sessions):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/witness/engine-controls-fix-1920x1080.png`
and `...-768x1024.png`.

- **1920x1080**: `dataTheme: "cluster"`, `bodyBg: "rgb(255, 245,
  255)"`, `errorBoundaryPresent: false`. All five buttons' bounding
  rects verified programmatically within the 80px `A_engine_controls`
  cell (`cellRect.bottom = 80`, every button's own `bottom <= 80`):
  MINT CARD(S) row 1 (0–24), LEARN PATH/PLAY row 2 (28–52), MATCH/
  CONNECT row 3 (56–80). Visually: all five buttons legible, no
  clipping. Zero console/page errors.
- **768x1024**: same `dataTheme`/`bodyBg`/no-error-boundary facts,
  same 3-row/80px shape (cell at y=932–1012), all five buttons
  verified within-cell and visually legible, including MATCH and
  CONNECT. One pre-existing, unrelated 500 on `GET
  /resources/visit-distribution` (the same known `QEUBO_ENABLED=false`
  cousin already documented in the `ef9f9a3b` witnessing report) —
  not from `RootErrorBoundary`, not from this fix.

## Scope discipline

Touched exactly the engine-row height fact (both encodings, the one
honestly-discovered same-fact sibling being the OTHER three groups
sharing the same stale row — checked, confirmed unaffected, not
independently re-grounded since their own need never moved) plus its
mechanical regen and witnessing. No CSS was touched. No other leaf,
row, or component was modified.

## Feasibility delta

None. `coverage_matrix.py`'s all-24-point verdict set is byte-for-byte
identical before and after (see Gates above) — the `60px → 80px` bump
is small enough, and lands inside a `min 345px` / `pref 32fr`-bounded
side column, that it doesn't flip any class/valuation/size point from
OPTIMAL/FEASIBLE to INFEASIBLE or vice versa.

## STOP-and-report items

1. **Per-group height differentiation** (named above under "The fix"):
   the current single-row `H(...)` shape cannot express genuinely
   different heights for the four groups. The landed fix (uniform
   80px) is honest and non-clipping but leaves ~52–56px of unused
   vertical space under the three lighter groups. A tree restructure
   (`V(H(...), H(...), ...)`) or new grammar would close that gap —
   both are real work, out of this stage's scope, filed as a frontier
   item in both `.lyt` files' own comments.
2. **Base-branch mismatch** (see "Base-freshness note" above): this
   worktree's own checked-out branch was not an ancestor of
   `ef9f9a3b`. Work landed on a fresh branch cut from `ef9f9a3b`
   instead — fast-forwards cleanly onto `lyt-phase2`, but the
   commissioner should confirm the merge path before this ships.
3. **Reading-discipline gap** (see "Reading discipline" above): full
   umbrella orientation documents were not re-read end-to-end this
   session; named rather than silently skipped.

## Work-status note

Ledger row 2347 / reviewer finding 1 appears ready for closure
pending commissioner review of this report and the commit; not closed
unilaterally here (todo DB items weren't queryable by this row number
under this session's `legacy_number` lookup — worth reconciling before
closing).
