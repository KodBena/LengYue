Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT P2c — the portrait zero-height tree row, model side

Commission: P2c, ledger rows 2358/2359. Base `dfc3df1b` on
`lyt-phase2`.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `dfc3df1b`. This
agent's own isolated worktree started on an unrelated branch
(`worktree-agent-a7258ee971ae66213`, tip `3378806f`, NOT an ancestor
of `dfc3df1b`). The literal branch name `lyt-phase2` was unavailable
(already checked out in the shared main checkout, `/home/bork/w/omega`
— the same disclosed-deviation shape every prior LYT stage report in
this directory uses), so a new branch, `p2c-portrait-row-floor`, was
cut directly from `dfc3df1b` (`git rev-parse origin/lyt-phase2` ==
`dfc3df1b`). `git merge-base --is-ancestor dfc3df1b HEAD` — exit 0,
confirmed on the new branch before any other work.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/encodings/lengyue_portrait.lyt` (full, 415 lines, every
header-comment line including the M2 STAGE B2a/B2b, OPTION C, and
LYT PRESENCE ARC P1 sections); `research/lyt/SPEC.md` §16 (Amendment
8, `min <axis>`/L12 through `edge <axis>`/L17, lines 1369-1575) and
§17 (Amendment 9, derived orientation and L18, lines 1576-1729), read
as part of a full top-to-bottom pass of the file (§1-§17 plus "Status
of the other LYT documents", 1759 lines); `.claude/dispatch-reports/
lyt-p1-presence-model.md` (full, 375 lines — the diagnosis this
commission builds on, in particular item 3's "the zero-height tree
row at portrait 768x1024" and item 4's derived-orientation table).
Also read in full, as procedural precedent for the screenshot-witness
rig (not cited for any orientation claim): `.claude/dispatch-reports/
lyt-p2a-presence-contract.md` (432 lines — its own "Screenshot
witness" section is the methodology this session's rig reuses:
ports, backend/frontend startup shape, theme-rewrite mechanism,
Playwright discipline).

Code sections consulted directly against the running source as
needed: `research/lyt/presence.py` (`prune_absent`/`is_named_absent`
— confirmed absent children are REMOVED from the parent Split's
`children` list before compiling, not merely sized to zero);
`research/lyt/compiler.py` (`SolveResult.rects`); `research/lyt/
orientation.py` (`derive_orientation`, `compute_derived_orientations`);
`research/lyt/wellformed.py` (`find_residual_leaves`); `research/lyt/
coverage_matrix.py` (the before/after harness reused as-is).

## THE DEFECT, confirmed directly

`lengyue_portrait.lyt`'s tree/control/preview row —

```
{pref 1fr, gap 4px} H(
  {min 140px, pref 1fr, max inf} tree[board, info+action],
  @demote(h 808px) {min 664px, pref 664px, max 664px} T(...)[BLACK BOX],
  @toggle(user, release) {min 96px, pref 96px, max 96px, aspect 1} previewBoard[common, info]
)
```

— is itself a direct child of the root `V(...)`. Its own sizing bag
declared `pref 1fr` but no `min`. Per SPEC.md §1.1's completion rule
an undeclared `min` defaults to `0px`, so nothing stopped board-
maximize (the objective's first stage) from squeezing this row's own
solved height to a literal, honestly-reported zero once every other
sibling had claimed its own share of the height budget — witnessed
directly at 768x1024 before this session's edit:

```
tree   root/V3/H0   x=0 y=1024 w=768 h=0
```

(re-verified independently this session, matching P1's own item 3
exactly, before any edit was made).

## THE FIX

One line changed in `lengyue_portrait.lyt`:

```
-    {pref 1fr, gap 4px} H(
+    {min 140px, pref 1fr, gap 4px} H(
```

**The arithmetic, and why it's the row's OWN honest floor, not a
freshly invented number.** Neither Amendment-8 key applies to this
Split child, so this is not a `floor v`/`min v` decision:

- `floor <axis>` (L16) is LEAF-only (SPEC.md §16.1: "`floor <axis>
  <extent>`... LEAF-only") — this row is an `H(...)` Split, not a
  leaf.
- `min <axis>` (L12) is legal "only where the slot's rectangle is
  its parent's on both axes (root, or a direct child of an
  Exclusive/T node)" (SPEC.md §16.1) — this row is a Split child of
  the root `V`, neither position; L12 would refuse it structurally.

The construct that DOES apply is the plain, un-axis-keyed `min`
every node's own sizing bag already carries (SPEC.md §4.1) — the
SAME idiom `tree` itself already uses two lines below (`{min 140px,
pref 1fr, max inf} tree[...]`), not a fresh grammar decision.

The number is `tree`'s own already-declared 140px floor
(`TREE_PANEL_MIN_WIDTH_PX`, named in this file's own LYT PRESENCE ARC
P1 header section), reused cross-axis rather than freshly invented
(row 2047's own "a decision posed in pixels is a defect" discipline).
Under this row's own `default`/`demoted` valuations, `T(...)` and
`previewBoard` are both absent (P1's repetition-first arc), so
`tree` is the row's SOLE, residual-holding content (Amendment 9,
SPEC.md §17) at those points — there is no OTHER child whose own
declared facts could honestly ground this row's height floor
instead. This is disclosed as reuse, not a rigorous componentwise-max
derivation the way `T(...)`'s own 664px is: no rule in this language
computes a Split's along-axis `min` from its children's cross-axis
facts (`T(...)`'s componentwise-max is a documented Exclusive-only
mechanism, SPEC.md §2). 140px is the honest anchor available — the
number this file already treats as "not usefully visible" on `tree`'s
other axis — not a rigorously derived quantity dressed up as more
derived than it is.

## Feasibility — the crux, checked before/after

`coverage_matrix.py`, run before and after the edit (24 axis points:
2 classes x 3 valuations x 3/5 sizes each):

```
$ diff /tmp/coverage_before.txt /tmp/coverage_after.txt
31c31
< solve wall time for the full matrix: 0.205s (24 points)
---
> solve wall time for the full matrix: 0.208s (24 points)
```

**Zero status/orientation deltas anywhere in the matrix** — every
cell (class, valuation, size) → (tree_orient, status) is byte-
identical before and after; only the reported wall-clock timing line
differs (solver-timing noise, not a feasibility signal). In
particular, none of the three previously-`INFEASIBLE`→`OPTIMAL`
portrait points P1's arc won (768x1024/540x960/420x880, `default`/
`demoted`) flipped back — the new 140px floor did not cost any
portrait point its feasibility. The pre-existing, disclosed,
presence-independent `all-present` infeasibility at those same three
narrow portrait sizes is unchanged too (not this fix's concern —
named in P1's own report as diagnostic-only).

Full before/after coverage table (identical both times):

| class | valuation | size | status |
|---|---|---|---|
| landscape | all-present | 1920x1080/2560x1440/1280x1024 | INFEASIBLE/INFEASIBLE/INFEASIBLE |
| portrait | all-present | 1080x1920/1200x1600 | OPTIMAL/OPTIMAL |
| portrait | all-present | 768x1024/540x960/420x880 | INFEASIBLE/INFEASIBLE/INFEASIBLE |
| landscape | default | 1920x1080/2560x1440 | OPTIMAL/OPTIMAL |
| landscape | default | 1280x1024 | INFEASIBLE |
| portrait | default | 1080x1920/1200x1600 | OPTIMAL/OPTIMAL |
| portrait | default | 768x1024/540x960/420x880 | OPTIMAL/OPTIMAL/OPTIMAL |
| landscape | demoted | 1920x1080/2560x1440 | OPTIMAL/OPTIMAL |
| landscape | demoted | 1280x1024 | INFEASIBLE |
| portrait | demoted | 1080x1920/1200x1600 | OPTIMAL/OPTIMAL |
| portrait | demoted | 768x1024/540x960/420x880 | OPTIMAL/OPTIMAL/OPTIMAL |

No fork needed to be posed to the commissioner — every portrait point
that was `OPTIMAL` stays `OPTIMAL`.

## Row height / derived orientation, before and after (own probe)

Direct solve, portrait class, `default` valuation, at every
representative size, tracing `tree`'s own solved rectangle (which
equals the row's own rectangle under `default`, since `tree` is the
row's sole present child there):

| size | tree/row h — BEFORE | tree/row h — AFTER | derived orientation — BEFORE | derived orientation — AFTER |
|---|---|---|---|---|
| 1080x1920 | 512px | 512px (unchanged) | h | h |
| 1200x1600 | 72px | **140px** | h | h |
| 768x1024 | **0px** | **140px** | v (degenerate `h<=0` fallback) | **h** (genuine) |
| 540x960 | 92px | **140px** | h | h |
| 420x880 | 132px | **140px** | h | h |

Four of five points were raised to the new 140px floor (only
1080x1920 was already above it and is untouched); 768x1024 is the
one qualitative change — its derived orientation flips from the
degenerate `'v'` fallback (`derive_orientation`'s documented `h<=0`
branch) to a genuine `'h'` derivation, since the row now has real,
positive height. No other portrait point's derived orientation
changed.

## Gates

**`research/lyt` pytest, literal exit code:**

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
370 passed in 3.76s
$ echo $?
0
```

370 passed both before and after this session's edit (one transient
failure in between — `test_portrait_render_ts_roundtrip_matches_
committed_file`, expected, since the emitter output changed; resolved
by regenerating `.gen.ts`, not by editing the test). No test was
weakened or its assertion loosened.

**`.gen.ts` regeneration:** `emit_layout_tree.py --registration
portrait` re-run; `frontend/src/state/lyt-layout-portrait.gen.ts`
diff is exactly one line — the tree/panel row's own compiled track
gains `minPx: 140` (was `0`), `frWeight` unchanged:

```
-        track: { kind: "elastic", minPx: 0, frWeight: 1 },
+        track: { kind: "elastic", minPx: 140, frWeight: 1 },
```

`lyt-layout.gen.ts` (landscape) untouched — this commission's own
fix is portrait-only, and landscape's `.lyt` file was not edited.

**Mockup regeneration:** `emit_mockup.py` re-run;
`research/lyt/mockups/landscape.html` byte-identical (zero diff);
`research/lyt/mockups/portrait.html` changed 2 lines — the embedded
solved-data JSON blob, reflecting the 768x1024/540x960/420x880 points'
real, now-nonzero row heights.

**Frontend `npm run build`:** exit 0, 1249 modules transformed, built
in 1.93s (pre-existing "chunks larger than 500 kB" warning,
unrelated). `node_modules` symlinked from the main checkout after a
byte-identical `package-lock.json` diff (established convention),
removed again after this session's gates.

**Frontend `npm run test:run`** (`NODE_OPTIONS=--max-old-space-size=2048
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19`): 257 test files
passed, 3 skipped (260); 3181 tests passed, 8 skipped (3189). No
failures. `tests/integration/App-boot.test.ts` confirmed green in
isolation too (`npx vitest run tests/integration/App-boot.test.ts`):
2 passed, exit 0.

## Screenshot witness — isolated rig

Own ports, all verified dead before use and again after teardown:
backend `127.0.0.1:19410`, frontend dev server `127.0.0.1:19411`,
KataGo WS placeholder `127.0.0.1:19412` (pinned, never contacted —
verified dead throughout). None of the forbidden ports
(4173/5173/5174/8764/1235/1242/195xx) were touched.

- **Backend**: the main checkout's shared venv
  (`/home/bork/w/omega/backend/venv/bin/python`) `-m fastapi run
  backend/main.py --host 127.0.0.1 --port 19410`, `DATABASE_URI`
  pointed at a COPY of `backend/samples/cards.sample.db`
  (`cards.rig.db`, under this session's own scratch dir — never the
  real `cards.db`). `QEUBO_ENABLED=false`.
- **Theme**: the DB copy's `documents` row (`key='user_workspace_01'`)
  `profile.settings.appearance.theme` rewritten `'dark'` → `'cluster'`
  via a direct sqlite3/Python write, verified by re-reading the row
  after the write. Playwright's own `colorScheme: 'light'` context
  option forced the second half of the mandate. All three real
  screenshots confirm `data-theme="cluster"` and `background-color:
  rgb(255, 245, 255)` live.
- **Frontend**: `vite --port 19411 --host 127.0.0.1 --strictPort`,
  `VITE_API_BASE_URL=http://127.0.0.1:19410`,
  `VITE_KATAGO_WS_URL=ws://127.0.0.1:19412`.
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024 <script>.mjs`, chromium
  launched with `executablePath: '/usr/bin/chromium'` and `args:
  ['--js-flags=--max-old-space-size=1024']`, one browser instance,
  closed in a `finally`. No wall-clock waits — every wait is
  `waitForSelector('#split-workspace')` /
  `waitForFunction(() => el.children.length > 0)` /
  `waitForSelector('#board-area')`, real-condition waits on the
  actual boot signal.

**Live DOM measurements** (`#vue-tree-panel`/`#control-panel`
`getBoundingClientRect()`, not eyeballed):

| size | `#vue-tree-panel` (w×h) | `#control-panel` (w×h) |
|---|---|---|
| portrait 768x1024 | **140×140** | 664×140 |
| portrait 420x880 | **140×140** | 664×140 |
| landscape 1920x1080 (unchanged) | 230×736 | 664×736 |

Both portrait sizes: the tree panel is now genuinely `140px` tall
(was `140×0` per P2a's own A/B-witnessed before-state) — visibly
present in both captures (the "GAME TREE" node-dot column renders
under the board). Landscape's own `#control-panel`/`#vue-tree-panel`
shape (`664×736`) is unchanged from P2a's own witnessed landscape
measurement — this fix touches portrait only.

**Captures** (saved under this session's own scratch directory,
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/lyt-p2c-rig/`,
not committed — established LYT-session convention):

- `portrait-768x1024.png` — tree panel visibly present (was collapsed
  to zero height before this fix).
- `portrait-420x880.png` — tree panel visibly present.
- `landscape-1920x1080.png` — unchanged, as required; board, game
  tree, and control panel (Session (UI) settings tab open by
  App-level default — a pre-existing, unrelated App.vue/defaults.ts
  hardcode P2a's own report already named, not touched here) all
  render as before.

Console noise observed in all three captures (`/resources/visit-
distribution` 500, a 503 from the dead-pinned KataGo WS shim): both
pre-existing, unrelated to layout, and expected given the sample DB
and the deliberately dead-pinned engine — not a regression this
session introduced, and not investigated further (out of scope).

## STOP-and-report items

None. Feasibility held at every portrait representative point; no
fork needed to be posed to the commissioner. Scope stayed exactly to
the one-line `.lyt` sizing-bag edit plus its consequent
`.gen.ts`/mockup regeneration.

## Discipline notes

- Scope held to `research/lyt/encodings/lengyue_portrait.lyt`
  (one sizing-bag `min` addition plus a disclosed header-comment
  section) plus the two mechanical consequences
  (`frontend/src/state/lyt-layout-portrait.gen.ts` regeneration,
  `research/lyt/mockups/portrait.html` regeneration) and this
  dispatch report. `lengyue_landscape.lyt` — genuinely a different
  class with its own tree/panel row — was NOT touched; this
  commission was scoped to portrait only, and landscape's own row
  floor (if any equivalent gap exists there) is out of scope, not
  investigated.
- No px used as bare reasoning currency without a cited basis — the
  140px floor is `tree`'s own already-named `TREE_PANEL_MIN_WIDTH_PX`
  fact, reused cross-axis and disclosed as such, not a fresh
  invention.
- No wall-clock sleeps anywhere in the screenshot rig; every wait is
  a real-condition wait. `research/lyt` pytest and the frontend
  `test:run` were both run to completion synchronously.
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx or any live
  process/DB — the isolated rig used 19410/19411/19412, all
  independently verified dead before use and torn down (processes
  killed, ports re-verified dead, `node_modules` symlink removed,
  `.jwt_secret` scratch artifact and stray `__pycache__` directories
  from this session's own runs cleaned up) after.
- `FEATURES.md`/`docs/handoff-current.md`: neither touched. This is a
  model-side layout-floor correction to an already-shipped
  repetition-first default (P1); it makes an existing, intended
  surface (the tree, primary per the repetition-first disposition)
  actually visible at sizes where it was previously and incorrectly
  collapsed to zero height — arguably a bugfix restoring intended
  behavior rather than a new capability. `research/lyt/coverage_matrix_
  result.json` is left untracked (generated scratch, same P1
  precedent).

## Commit

Committed on this worktree's own branch, `p2c-portrait-row-floor`
(cut directly from `origin/lyt-phase2` at `dfc3df1b`, the exact
commit named in this commission). Not pushed/merged by this session.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
