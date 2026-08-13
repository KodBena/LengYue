Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT — engine-controls group width floor (frontier item B2b closed)

Commission: author `A_engine_controls`' own width floor, the frontier
item B2b left open ("WIDTH RESERVATION, DELIBERATELY NOT AUTHORED" —
`research/lyt/encodings/lengyue_landscape.lyt`'s own header, item (1))
pending live measurement, using wave W-B2's own live measurement
(`.claude/dispatch-reports/lyt-wB2-controls-menu.md`).

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `088fc0c4` — the
commit named in the commission. This agent's worktree started BEHIND
that commit (`3378806f`, an ancestor of `088fc0c4` — not diverged, so no
hard-reset was needed): `git merge-base --is-ancestor 088fc0c4
origin/lyt-phase2` exit 0, and `HEAD` (`3378806f`) was itself an
ancestor of `088fc0c4` (`git merge-base --is-ancestor HEAD 088fc0c4`
exit 0), so `git merge --ff-only origin/lyt-phase2` fast-forwarded
cleanly with no risk of discarding local work (there was none — the
only pre-existing untracked path was `.claude/`).

## 2. Orientation read (full, before any edit)

`research/lyt/SPEC.md` (all 1784 lines, end to end — both halves, the
truncated-render continuation included), with particular attention to
§16 (Amendment 8: `min <axis>`/L12, `floor <axis>`/L16) per the
commission's own instruction to check the language idiom before
authoring. Also read in full: the W-B2 dispatch report
(`.claude/dispatch-reports/lyt-wB2-controls-menu.md`, at the path the
commission named, `.claude/worktrees/agent-aba9f1f9ec838c784/...`);
`research/lyt/encodings/lengyue_landscape.lyt`'s own header, in full,
from the ENGINE STATUS DECOMPOSITION item through the LYT PRESENCE ARC
P1 item (roughly lines 800–1310) — this is where the "80px height,
0px-width-undetermined" prior state and its own disclosed reasoning
live; `research/lyt/encodings/lengyue_portrait.lyt`'s corresponding
header section; `research/lyt/wellformed.py`'s `find_l12_violations`/
`find_l16_violations` (read in full, not skimmed) to confirm the
SPEC's own prose against the actual checker code; `research/lyt/
loader.py`'s `_load_axis_mins`/`_load_floor_axes` (read in full) for
the load-time half of the same two laws.

## 3. The threshold, and why it needs no added margin

Wave W-B2's own live-measured worst-case button widths (Mint Card(s)
105.625px, Learn Path 90.015625px, Play 43.21875px, Stop Match
90.015625px, Disconnect 90.015625px; `--space-tight` 4px between; 24px
`.toolbar-btn` row height) and its own greedy-flex-wrap arithmetic name
the EXACT column width where the cluster's 4-row need (108px+,
clipping the row's already-reserved 80px) collapses to 3 (80px, exact
fit): `90.015625 + 4 + 90.015625 = 184.03125px` (the last two items'
own row, the tightest pair). `compiler.py` declares INTEGER `(w, h)`
CP-SAT variables (SPEC.md §8) — a `min 184px` floor would let the
solver legally pick exactly 184px, 0.03125px short of the real
breakpoint, so the authored floor is the CEILING of the exact
threshold: **185px**, not the truncated `184px` the commission's own
prose citation uses.

No margin was added on top of that ceiling. This file's own
established convention (`lengyue_landscape.lyt`'s MEASUREMENT-GROUNDED
ENCODING PASS item, `A_setup`'s 80px→92px correction) reserves the
`+~10px margin` posture for a SWEPT-SAMPLE maximum, where the margin
covers un-swept widths between pinned samples. `184.03125px` is a
closed-form geometric sum of independently-measured constants, not a
sample with an interpolation gap to cover — so per that same file's own
"there is no such gap here" reasoning, only the integer-px ceiling
applies, nothing more.

## 4. Encoding form chosen: plain `min`, not `min <axis>`/L12 or `floor <axis>`/L16

`A_engine_controls` sits as a direct child of `H(A_engine_controls,
A_engine_eval, A_engine_health, A_engine_queue)` — an ordinary
SPLIT-CHILD position (not root, not a direct child of an
Exclusive/T node).

- **`min <axis>` (L12) is illegal here by construction.**
  `wellformed.find_l12_violations` structurally refuses an axis-keyed
  `min` everywhere except the both-axes position (root, or a T-child) —
  verified by direct read of the checker, not inferred from prose.
  `loader._load_axis_mins`'s own docstring states the identical
  restriction from the load-time side. Using it at this Split-child
  position would be a load-time refusal, not a style choice.
- **`floor <axis>` (L16) is legal to declare here but does not do the
  job.** Its own trigger (clause (a), `find_l16_violations`) is scoped
  to a leaf that has ALREADY claimed `content unbounded` + `elastic
  <axis>` + `scroll <axis>` — a leaf reasoning about having too MUCH
  room that must also reason about too LITTLE. `A_engine_controls`
  declares `content bounded` (a fixed five-button vocabulary, never
  elastic, never scroll) — L16's own narrative does not describe this
  leaf. More decisively: `floor` is SOLVER-INERT (`find_l16_violations`'s
  own docstring: "`compiler.py` never reads `floor_axes`... what is NOT
  inert is the reservation clause (b) obliges... an ordinary `min`").
  Declaring `floor h 185px` here would add words the CP-SAT model never
  reads — decorative, not a real floor.
- **The legal, solver-visible construct is the BASE grammar's plain
  `min <extent>`** — the un-amended sizing production every Split
  child already carries for its own along-axis (here, width, since the
  parent is an `H`). This predates Amendment 8 entirely; no new law
  construct was needed, and no STOP-and-report applies, since a legal
  construct genuinely exists at this position.

**Landed:** `{min 185px, pref 1fr, content bounded} A_engine_controls[go, action]`
in both `research/lyt/encodings/lengyue_landscape.lyt` (the
`A_engine_controls` leaf inside the side column's engine-status `H`)
and `research/lyt/encodings/lengyue_portrait.lyt` (the same leaf inside
the root `V`'s own engine-status `H`) — `pref 1fr` and `content
bounded` unchanged, `max` still defaulting to `inf` (unchanged). Full
derivation, the L12/L16 legality discussion, and the feasibility
re-solve are written into each file's own header, following this
repository's established "measured, cited, disclosed" convention (see
each file's own new "ENGINE-CONTROLS WIDTH FLOOR" header item).

The other three groups (`A_engine_eval`/`A_engine_health`/
`A_engine_queue`) are **UNTOUCHED** — they remain `{pref 1fr, content
bounded}`, `min` at the loader's `0px` default, per the commission's
own instruction not to author floors for them without their own
measured bases (their own live-measurement pass — the "OTHER THREE
GROUPS, CHECKED (disclosed non-runtime-measured)" gap named in the
landscape header's own ENGINE-ROW HEIGHT RE-GROUNDING item — has not
run).

## 5. Per-size solver allocation, all four groups (re-solved, not reasoned about)

Solved directly via `compiler.solve_lexicographic` against the
committed registration (`runner.REGISTRATIONS["lengyue_landscape+portrait"]`,
`default` valuation — the same valuation `coverage_matrix.py` checks),
before AND after this edit, at every one of `coverage_matrix.py`'s own
representative points (`LANDSCAPE_SIZES`/`PORTRAIT_SIZES`):

| Class | Size | Status | `A_engine_controls` (w×h) | `A_engine_eval` | `A_engine_health` | `A_engine_queue` |
|---|---|---|---|---|---|---|
| landscape | 1920×1080 | OPTIMAL | 808×80 | 0×80 | 0×80 | 0×80 |
| landscape | 2560×1440 | OPTIMAL | 808×80 | 0×80 | 0×80 | 0×80 |
| landscape | 1280×1024 | INFEASIBLE | — | — | — | — |
| portrait | 1080×1920 | OPTIMAL | 1068×80 | 0×80 | 0×80 | 0×80 |
| portrait | 1200×1600 | OPTIMAL | 1188×80 | 0×80 | 0×80 | 0×80 |
| portrait | 768×1024 | OPTIMAL | 756×80 | 0×80 | 0×80 | 0×80 |
| portrait | 540×960 | OPTIMAL | 528×80 | 0×80 | 0×80 | 0×80 |
| portrait | 420×880 | OPTIMAL | 408×80 | 0×80 | 0×80 | 0×80 |

**Every number above is IDENTICAL before and after this edit** — the
new `min 185px` floor is satisfied with wide margin at every
representative point (`A_engine_controls` was already solving to
808px/1068px/etc., far above the 185px floor, at every OPTIMAL point),
so the floor changes nothing OBSERVABLE at these specific sizes. It IS
a genuine new hard constraint in the model (verifiable: an artificially
narrow synthetic window below ~197px total row width, which no
representative point in this repository reaches, would now go
INFEASIBLE where a pre-floor model would have silently squeezed
`A_engine_controls` below its real content need) — the floor is real,
solver-visible work, just not work any currently-representative point
happens to exercise.

**The eval/health/queue starvation to 0px is PRE-EXISTING, not caused by
this edit.** It traces to a disclosed gap in this model's own stage-3
objective: `runner._gather_reach_preferred_widgets` only auto-enrolls
plain-`px`-`pref` leaves into the reach-preferred stage; an `fr`-`pref`
leaf (all three of these are) has no stage rewarding it for reaching
any particular share, so the solver is free to leave it at its `0px`
floor whenever ANY feasible partition exists — a genuine divergence
from the real CSS Grid realization, whose native `1fr` tracks DO split
evenly (SPEC.md §10). Verified directly: the three groups already
solved to 0px at every representative point BEFORE this edit
(`A_engine_controls` already claimed the whole row). This edit neither
causes nor worsens that gap — named per the commission's own "starve
them below usability" concern, but the honest finding is that this
edit didn't move that needle in either direction; the gap was already
maximal.

## 6. Feasibility — coverage_matrix before/after, every delta named

Ran `coverage_matrix.py` before (via `git stash` on the two `.lyt`
files) and after this edit — 24 axis points each (2 classes × 3
valuations × 3/5 sizes). **The two verdict tables are byte-identical —
zero deltas.** (The two JSON artifacts differ only in the
non-deterministic `elapsed_s` wall-clock field; every `status` cell
matches exactly, confirmed by direct diff, not by eyeballing.)

```
class      valuation    size             status
landscape  all-present  1920x1080        INFEASIBLE   (unchanged)
landscape  all-present  2560x1440        INFEASIBLE   (unchanged)
landscape  all-present  1280x1024        INFEASIBLE   (unchanged)
portrait   all-present  1080x1920        OPTIMAL      (unchanged)
portrait   all-present  1200x1600        OPTIMAL      (unchanged)
portrait   all-present  768x1024         INFEASIBLE   (unchanged)
portrait   all-present  540x960          INFEASIBLE   (unchanged)
portrait   all-present  420x880          INFEASIBLE   (unchanged)
landscape  default      1920x1080        OPTIMAL      (unchanged)
landscape  default      2560x1440        OPTIMAL      (unchanged)
landscape  default      1280x1024        INFEASIBLE   (unchanged)
portrait   default      1080x1920        OPTIMAL      (unchanged)
portrait   default      1200x1600        OPTIMAL      (unchanged)
portrait   default      768x1024         OPTIMAL      (unchanged)
portrait   default      540x960          OPTIMAL      (unchanged)
portrait   default      420x880          OPTIMAL      (unchanged)
landscape  demoted      1920x1080        OPTIMAL      (unchanged)
landscape  demoted      2560x1440        OPTIMAL      (unchanged)
landscape  demoted      1280x1024        INFEASIBLE   (unchanged)
portrait   demoted      1080x1920        OPTIMAL      (unchanged)
portrait   demoted      1200x1600        OPTIMAL      (unchanged)
portrait   demoted      768x1024         OPTIMAL      (unchanged)
portrait   demoted      540x960          OPTIMAL      (unchanged)
portrait   demoted      420x880          OPTIMAL      (unchanged)
```

`landscape default 1280x1024` and the three `landscape all-present`
points were ALREADY `INFEASIBLE` before this edit, for the
presence-independent board/tree-row structural collision SPEC.md §11/§12
already document — entirely unrelated to the engine row. The `portrait
all-present` floor-violated diagnostic (`768x1024`/`540x960`/`420x880`
INFEASIBLE under `all-present`) is likewise pre-existing and unrelated
(the `all-present` valuation is a diagnostic upper envelope, not the
feasibility-bearing `default` valuation, per SPEC.md §11's own
disclosure). **No point flipped OPTIMAL→INFEASIBLE, no point flipped
INFEASIBLE→OPTIMAL, and the side column's own `min 345px`/`max
340px+60ch` track was never approached** (185px + 3×4px gap = 197px
against a 345px floor is comfortable headroom, re-solved directly, not
merely reasoned about) — the STOP-and-report condition the commission
named (a floor forcing the side column's own track composition past
its clamp) did not arise.

## 7. Gates, literal exit codes

| Gate | Command | Result |
|---|---|---|
| `research/lyt` pytest | `nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q` | **exit 0** — 375 passed (2 roundtrip tests failed pre-regen as expected, confirming the encoding edit reached the emitter; both pass after regen) |
| `coverage_matrix.py` | `nice -n 19 .../python coverage_matrix.py` | exit 0; verdict table byte-identical before/after (§6) |
| `.gen.ts` regen | `emit_layout_tree.py --registration landscape` / `--registration portrait` | exit 0 both; delta below |
| mockups regen | `emit_mockup.py` | exit 0; delta below |
| frontend build | `npm run build` (`vue-tsc -b && vite build`) | **exit 0** |
| frontend `test:run` | `npm run test:run` | **exit 0** — 3241 passed, 8 skipped (257 files passed, 3 skipped) — matches the W-B2 report's own cited pre-existing baseline (3241) exactly; no test's expectation needed updating, since no frontend test asserts the old `minPx: 0` figure for this widget |
| App-boot | `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **exit 0** — 5 passed |

**`.gen.ts` delta, stated precisely** (one line changed per file, both
the SAME shape — `A_engine_controls`'s own `track` field):
- `frontend/src/state/lyt-layout.gen.ts`, path `"2.0.0"`:
  `track: { kind: "elastic", minPx: 0, frWeight: 1 }` →
  `track: { kind: "elastic", minPx: 185, frWeight: 1 }`.
- `frontend/src/state/lyt-layout-portrait.gen.ts`, path `"4.0"`: same
  `minPx: 0` → `minPx: 185` change.

Both path strings (`"2.0.0"` landscape, `"4.0"` portrait) match the
commission's own citation exactly. `git diff --stat`: 2 insertions/2
deletions across the two `.gen.ts` files — nothing else moved.

**Mockup delta, stated precisely**: one line changed per HTML file —
the CSS Grid track for `A_engine_controls`'s own column,
`minmax(0px, 1fr)` → `minmax(185px, 1fr)`, in both `mockups/
landscape.html` and `mockups/portrait.html`. `git diff --stat`: 2
insertions/2 deletions across the two mockup files — nothing else
moved.

**No frontend test needed updating** — `npm run test:run` passed clean
(exit 0, 3241/8 skipped, matching the pre-existing baseline exactly) on
the first run after the `.gen.ts` regen, confirming no test asserts a
literal `minPx`/track value for this widget.

## 8. Disciplines followed

- No px beyond the cited W-B2 measurement and its own direct arithmetic
  consequence (the 185px ceiling) — no invented numbers anywhere in
  this change.
- Per-claim witness status: every solver number in §5/§6 above is a
  DIRECT re-solve output (script + `coverage_matrix.py` itself), not a
  hand-computed estimate; every px citation traces to the W-B2 report's
  own measured table.
- Ports 4173/5173/5174/8764/1235/1242/195xx were never touched — this
  pass ran only `pytest`, `coverage_matrix.py`, the two emitters,
  `vite build` (build-only, no dev server), and `vitest run` (jsdom,
  no dev server).
- `frontend/node_modules` symlinked from the main checkout after
  `diff`-confirming `package-lock.json` byte-identical (this worktree
  had no `node_modules` of its own) — same posture the W-B2 report's
  own rig setup used.

## 9. STOP-and-report

None. A legal, solver-visible construct (the base grammar's plain
`min`) existed at this position; the floor is feasibility-neutral at
every representative point re-solved; the side column's own track was
never approached; no frontend test needed a value update.

**Named, not a STOP-and-report, but worth the commissioner's attention
for a future item**: §5's finding that `A_engine_eval`/
`A_engine_health`/`A_engine_queue` solve to a degenerate `0px` at
EVERY representative point (a pre-existing gap, unrelated to and
unmoved by this edit) is a real divergence between this model's own
solver behavior and the real CSS Grid realization's `1fr`-even-split
semantics. It does not block this item (the commission scoped floors
to `A_engine_controls` alone, and the three groups' own live
measurement pass has not run) — flagged so it isn't silently
re-discovered as a surprise when their own floors are eventually
authored.

## License

Public Domain (The Unlicense), matching the umbrella's ADR-0006
per-file convention.
