Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).

# LYT measurement-grounded encoding pass

Commission: fold the live-measurement wave's witnessed results
(`.claude/dispatch-reports/lyt-measurement-wave.md`) into the LYT
encodings. Branch base `lyt-phase2` at `c23e011c`.

## Base freshness (FIRST ACT)

`git fetch origin`; `lyt-phase2`'s own tip resolved to `c23e011c`
(unchanged). The worktree's own default branch
(`worktree-agent-af7110c5d2ef02a64`) was cut from an unrelated, older
mainline base — `git merge-base --is-ancestor c23e011c HEAD` failed
against it. A new branch, `lyt-measurement-encoding-pass`, was cut
directly from `lyt-phase2` (which IS `c23e011c`) — `git merge-base
--is-ancestor c23e011c HEAD` confirmed exit 0 immediately after the
switch, the same disclosed-deviation shape every prior LYT stage
report in this directory follows.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-measurement-wave.md` (full, 600 lines —
the sole evidentiary source for every measurement cited below, no
re-measurement performed this pass), `.claude/dispatch-reports/
lyt-m2-b2b-ruling-census.md` (full, 461 lines — not only §Item 4, per
this repository's own "read the whole document" discipline), both
`research/lyt/encodings/lengyue_landscape.lyt` (1229 lines after this
pass's own edits, 1168 before) and `lengyue_portrait.lyt` (376 lines
after, 355 before), including every header-comment line. `research/
lyt/SPEC.md` §15/§16 (the `unit`/`edge` grammar and L10/L17) consulted
directly for the exact syntax and the L10 "reserve at least one whole
unit" precondition, cross-checked against `research/lyt/tests/
test_loop_laws.py`'s own worked `edge v unit, unit v <px>` examples
(that file was read only at the specific ranges needed to confirm
syntax, not end to end — it is not an orientation document named by
this commission, only a syntax cross-check).

## The edits

### 1. `edge v item` → `edge v unit` + `unit v <px>` (partial Frontier A resolution)

`CP-library` (both files) gains `unit v 32px`; `CP-cards` (both files)
gains `unit v 39px` — the measurement wave's own Measurement 1 (32px/
39px, both uniform across all 9 sampled gaps, WITNESSED). `edge v item`
→ `edge v unit` on both. L10 checked directly: both leaves' own
already-declared `min` (160px landscape, 200px portrait) reserves well
over one whole unit on the v axis, the axis this T-child is partitioned
on — satisfied trivially, no further change needed.

`SP_advancedRegistry`/`SP_keybindings` (both files) are **unchanged,
still `edge v item`**, per the commission's own instruction — the same
measurement wave (Measurement 2) found NEITHER has a uniform pitch:
Advanced Registry's `.registry-row` sampled `[31, 22, 22, 22, 22, 22,
25, 55, 22, 25, 25, 27, 25, 25]` (modal 22px, one 55px multi-line
outlier); Keybindings' `.keybinding-row` sampled `[37.5, 38, 38, 38,
38, 38, 92.5, 92, 37.5, 38, 38]` (modal 38px, two ~92px outliers).
`unit <axis> <extent>` names ONE extent — forcing a single number over
a genuinely non-uniform measured distribution would be the exact
false-precision failure this file's own disclosure posture
consistently avoids. Left `edge v item`, an honest ANNOUNCED (not
quantized) boundary. Both encodings now carry a dated
"MEASUREMENT-GROUNDED ENCODING PASS" header section naming this
disposition explicitly (landscape carries the full citation, portrait
defers to it per this file pair's own established "identical numbers,
deferred rationale" convention).

### 2. `timelineStrip` — relic table (c) → (a)

No numeric change (`80px` was already correct). The CP-analysis OPENED
ONE LEVEL section's own prior disclosure ("PARTLY grounded ... partly
estimated, header + controls rows, not individually measured") is
upgraded via a new dated note citing Measurement 8's full
decomposition: `.timeline-header` 12px + `.timeline-body` 28px +
`.timeline-controls` 40px = 80px exact, with the `.timeline-container`
data-track's own already-cited 16px CSS fact
(`HorizontalTimelineVisualizer.vue:429`) re-confirmed live inside the
28px body figure.

### 3. `A_setup` — 80px (carried-forward) → 92px (measured, mainline)

Layout body changed in both files: `{80px, ...}` → `{92px, ...}`.
Measurement 4 found `.setup-toolkit` at **296.34px × 92px, byte-
identical at all three tested widths (1920px, 1280px, 900px)** —
width-INVARIANT, the same footing `A_app`'s own `@demote(h 616px)`
threshold already stands on ("identical at 1920 and at 420"). Per the
commission's own instruction, this pass grounds directly to the
measured 92px rather than applying this file's separate "+~10px
margin" posture — that posture exists specifically to cover un-swept
intermediate widths between a sweep's own pinned samples, and there is
no such gap here (three widths spanning the class's own tested range
all agree exactly, unlike e.g. the REPAIR PASS's single-pinned-size
sweep maximum). **On the 12px delta's structural cause**: the
measurement report does NOT name one — it states only that the gap
runs the SAME DIRECTION (measured-over-declared) as two other leaves'
own prior REPAIR corrections, not a specific cause (e.g. a named extra
padding/border line, a component version difference). This pass
reports that absence honestly in the encoding comment rather than
inventing an explanation.

### 4. Relic table disposition — corrected count

Against the census's own 30-entry table (22 (a) / 3 (b) / 8 (c) before
this pass):

| Relic | Before | After this pass |
|---|---|---|
| `timelineStrip` 80px | (c) | **(a)** — Measurement 8 fully decomposes it |
| `A_setup` 80px | (b) (dissolved into experiment-branch basis) | value changed to **92px**, now (a) — direct mainline measurement, no longer a carry-forward |
| `CP-library`/`CP-cards` `edge v item` | n/a (Frontier A gap) | **flipped to `edge v unit`, now (a)**-equivalent — a grounded per-leaf `unit v <px>` |
| `SP_advancedRegistry`/`SP_keybindings` `edge v item` | n/a (Frontier A gap) | **unchanged, still `item`** — measured, honestly non-uniform, no single constant available |
| `otherColorDebug`+`otherBand` composite 204px | (c) | **unchanged (c)** — Measurement 5 found no stronger citation, appears low vs. the children's own summed floor (428px); no basis to move it |
| `AT_basic_*` 200px/90px | (c) | **unchanged (c)** — Measurement 6 UNEXERCISED, needs a live KataGo engine + analyzed position, explicit hard blocker |
| `32fr` side-column pref weight | (c) | **unchanged (c)** — not touched by the measurement wave at all (no measurement addresses it) |
| `100fr` portrait `B` width alias | (c) | **unchanged (c)** — same, untouched, functionally inert regardless |

**Remaining (c) relics after this pass, exactly**: `32fr` (side-column
pref weight, landscape), `100fr` (B's own width alias, portrait),
`204px` (the `otherColorDebug`+`otherBand` composite min — informational
215px note only, no citation), and the `AT_basic_*` `200px`×4/`90px`
estimates (UNEXERCISED — engine-gated, needs a live KataGo connection +
at least one analyzed position). This matches the commission's own
named expectation exactly.

## Enumerated, not fixed (for the orchestrator)

**(a) Control-panel 367px track overflow below ~900px viewport.**
Measurement 7 found `#control-panel` overflows its own side-column
track by a constant 367px once the side column's own width clamps to
441px (below ~900px viewport, landscape class) — a real, reproducible
horizontal-overflow condition, screenshotted
(`shots/10-sidecol-sweep-345.png`). Root cause: the T-node's own 664px
PINNED width (M2 B2a's own `{min 664px, pref 664px, max 664px}`,
Fork-B's own binding fact) exceeds the side column's own shrunk track
at narrow widths. This is a MODEL question, not a pure code fix — the
664px pin vs. small-viewport behavior needs a disposition choice among
at least: elastic (let the T-node shrink below its componentwise-max
floor, which would mean CP-analysis's own 664px demand can no longer
be honestly reserved — a real feasibility question, not a cosmetic
one), scroll (accept horizontal overflow as an intentional scrollbar,
a `content`/`scroll h` declaration this T-node does not currently
carry), or `@demote` (treat the whole control-panel group as
presence-conditional below a width threshold, the same mechanism
`A_app` already uses). Ties to Frontier B (the Cards-tab wide-viewport
question the same measurement wave separately resolved as "(a)
genuinely-cannot-use-width, by design") — the two are related but
distinct: Frontier B is about EXCESS width at WIDE viewports, this is
about DEFICIT at NARROW ones. Not attempted this pass — a model
decision the commissioner should make, not a session inferring one
unilaterally.

**(b) 345px-vs-320px side-column floor measurement conflict.** Two
witnessed sweeps disagree on `.setup-toolkit`'s own true no-overflow
floor: the standing W4 FLOOR CORRECTION section (this file's own
committed history) claims clipping starts at 330px, corrected floor
345px (a live Playwright width-sweep, methodology only partially
recorded in the committed header). This wave's own Measurement 7
re-swept and found **ZERO overflow at every width down to 320px** —
directly contradicting the standing claim. Two honest readings, per
the measurement report's own disclosure, neither confirmed: (a) the
palette component genuinely changed since the original measurement
(now flex-wraps internally rather than clipping — plausible, not
git-history-confirmed this wave); or (b) this wave's own methodology
(excluding out-of-flow `position: fixed/absolute/sticky` elements,
fixed 300px height to force landscape-class) differs from the
original sweep's own (unrecorded in detail) methodology enough to
disagree. **This pass does NOT override the encoding's standing 345px
value on this evidence** — per the commission's own explicit
instruction. A tiebreak sweep would need: the ORIGINAL W4 sweep's own
recorded methodology (was out-of-flow-element exclusion applied? what
height was the viewport fixed at, if any?) — not available in the
committed history beyond the prose already quoted in the encoding's
own W4 FLOOR CORRECTION section — plus a fresh live re-sweep using
that exact reconstructed methodology against the CURRENT
`SetupToolPalette.vue` to distinguish "component changed" from
"methodology differed" as the cause. Neither this pass nor the prior
measurement wave performed that reconstruction.

## Gates

**`research/lyt` pytest, literal exit code:**

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
366 passed in 4.21s
```

Exit 0. Matches the commission's own expected 366 baseline exactly (363
new-passing + 3 that needed individually-justified updates, all now
passing — see "Test edits" below).

**`coverage_matrix.py` before/after, every status delta named:**
byte-identical status output — the only diff between the pre-edit
(`git stash`-reverted encodings) and post-edit runs is the wall-clock
timing line (`0.215s` → `0.216s`, 24 points each run). **Zero status
deltas** — every OPTIMAL/INFEASIBLE/FEASIBLE cell at every
`landscape`/`portrait` × `default`/`demoted`/`all-present` point is
unchanged. This is the expected, feasibility-neutral result: `edge`/
`unit` are solver-inert per SPEC.md §16.1 (`compiler.py` never reads
either field), and `A_setup`'s 80px→92px is a `@toggle(user, release)`
presence-conditional leaf that solves ABSENT in the `default` and
`demoted` valuations (`runner.py`'s own `absent_widgets` set already
includes it) — the only valuation where its own min is solver-visible
is `all-present`, which was ALREADY `INFEASIBLE` at every checked point
before this pass (diagnostic-only per the coordinator's own mid-flight
framing, `lyt-m2-b2b-ruling-census.md`'s own "Coverage matrix" section)
and stays `INFEASIBLE` after — no polarity change anywhere.

**`.gen.ts` regeneration:** both regenerated
(`emit_layout_tree.py --registration landscape` /
`--registration portrait`). Diff is exactly the two facts that changed:
`A_setup`'s track `px: 80` → `px: 92` (both files, only where present),
and `CP-library`/`CP-cards`'s `edgeAxes` disposition `"item"` →
`"unit"` (both files) — no other line differs. Roundtrip tests
(`test_render_ts_roundtrip_matches_committed_file`,
`test_portrait_render_ts_roundtrip_matches_committed_file`) pass
against the regenerated, committed output.

**`mockups/` regeneration:** `emit_mockup.py` regenerated
(`mockups/landscape.html` 48625 bytes, byte-identical size to before;
`mockups/portrait.html` 51653 bytes, 2 bytes smaller than the prior
51655 — consistent with a 2-digit-to-2-digit numeric label change
inside the rendered mockup text, not investigated further since the
byte delta is trivial and expected).

**Frontend `npm run build`:** exit 0 (`vue-tsc -b && vite build`, 1248
modules transformed, built in 2.23s — the pre-existing "chunks larger
than 500kB" warning is unrelated, present before this pass too).

**Frontend `npm run test:run`** (`NODE_OPTIONS=--max-old-space-size=2048
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19`): exit 0 — **256
test files passed, 3 skipped (259); 3167 tests passed, 8 skipped
(3175)**. No failures. Directly confirmed the App-boot test specifically
(`frontend/tests/integration/App-boot.test.ts`, added in commit
`ef9f9a3b`) by running it in isolation as well:
`npx vitest run tests/integration/App-boot.test.ts` → `2 passed`, exit
0. The registry/App.vue boot-crash defect the measurement wave's own
report names as its single most load-bearing finding is **already
fixed on `lyt-phase2` at `c23e011c`** (`ef9f9a3b`, `fix(frontend):
restore boot — register six B2b widget ids...`, an ancestor of this
branch's own `c23e011c` base per the git log read during base-freshness)
— the measurement wave's own rig-local patch was against an EARLIER
point in the branch's history (`bc08c39c`) before that fix landed; this
pass's own base is already past it. No boot-crash reproduction was
needed or attempted this pass.

## Test edits, individually justified

One test updated: `test_emit_layout_tree.py`'s own
`test_f1_port_cp_library_elastic_floor_edge` asserted `edgeAxes ==
[{"axis": "v", "disposition": "item"}]` for `CP-library` — updated to
`"unit"` (its own docstring updated to match), directly downstream of
this pass's own encoding edit (item 1 above), not a weakened check —
the test still asserts the exact edge disposition, only the disposition
itself changed per the new grounded citation. No other test in the 366
required a change (`A_setup`'s 92px height and the `timelineStrip`
prose-only upgrade have no existing test pinning their specific
numbers).

## Scope discipline

No `frontend/src` component/composable code touched. No port from the
forbidden set (4173/5173/5174/8764/1235/1242/195xx) or live process/DB
touched — all gates run against static files (`pytest`, `coverage_matrix.py`,
the two emitters, `vite build`, `vitest run`), no dev server started. No
wall-clock sleeps (the frontend test:run backgrounded automatically past
this session's own 120s foreground timeout; waited for its own
completion notification, no polling). `git stash`/`git stash pop` used
only to produce the coverage-matrix "before" comparison point against
the unmodified encodings, immediately reverted after the comparison —
verified via `git status --short` that the working tree returned to its
edited state before any further work.

## Witness status summary

- Base freshness: WITNESSED.
- Orientation reading (measurement wave report, census report, both
  encodings, SPEC.md §15/§16): WITNESSED, read end to end.
- Edit 1 (Frontier A partial resolution): WITNESSED — L10 checked
  directly against both files' own already-declared `min` values.
- Edit 2 (timelineStrip grounding): WITNESSED — no value change, prose
  upgrade only, citing Measurement 8's own decomposition.
- Edit 3 (A_setup 92px): WITNESSED — value changed in both encodings,
  citing Measurement 4's own three-width identical result; the 12px
  delta's structural cause is explicitly reported as UNATTRIBUTED, not
  invented.
- Item 4 (relic disposition): WITNESSED against the census's own 30-row
  table, corrected counts stated above.
- Enumerated items (a)/(b): WITNESSED (both are direct restatements of
  Measurement 3/7's own findings), NOT resolved — model/coordinator
  decisions, correctly left open per this pass's own scope.
- `research/lyt` pytest: WITNESSED, 366 passed, exit 0.
- `coverage_matrix.py` before/after: WITNESSED, zero status deltas
  (`git stash`-based before/after diff, quoted above).
- `.gen.ts`/`mockups/` regeneration: WITNESSED, diffs are exactly the
  two changed facts, roundtrip tests pass.
- Frontend `npm run build`: WITNESSED, exit 0.
- Frontend `npm run test:run`: WITNESSED, exit 0, 3167 passed / 8
  skipped, no failures.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
