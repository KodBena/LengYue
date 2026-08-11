# LYT synthesis spike — benchmark + joint structure/sizing synthesizer

Research spike, ledger row 1848 commission. LYT's stated goal is
AUTOMATIC layout from ontology — the tree should be FOUND, not
hand-written. This report answers two measured questions: how expensive
is the EXISTING sizing solve (bounding what any exterior search could
afford), and does a FIRST joint structure+sizing CP-SAT model — searching
tree shape and sizing together, in one solve — find the hand-written
clean-room tree, an equivalent one, or a better one.

Read for this spike: `research/lyt/SPEC.md`, `research/lyt/README.md`,
`research/lyt/compiler.py`, and `.claude/dispatch-reports/layout-
language-consult.md` in full (not merely §2, since the found-tree
comparison below cites §5's worked encodings and §6's OR-Tools sketch
too).

New modules: `research/lyt/bench_solve.py`, `research/lyt/synthesize.py`,
`research/lyt/tests/test_bench_solve.py`,
`research/lyt/tests/test_synthesize.py`. `frontend/` untouched, per scope
discipline. Read-only on `compiler.py` and the `encodings/*.lyt` files
(a concurrent W4 builder is touching that neighborhood) — the two
verbatim imports named below are the only place this spike reaches into
`compiler.py`, and no line of it was changed.

## Machine context

`platform=Linux-6.19.12-1-default-x86_64-with-glibc2.43`,
`python=3.13.13`, `cpu_count=4`, everything run under `nice -n 19`.
Load average at benchmark time: `0.21 0.35 0.28` (1/5/15 min) — a
lightly-loaded 4-core box, not a dedicated benchmark rig; the numbers
below should be read as "this machine, this load," not an absolute
hardware-independent figure.

## 1. Benchmark: the existing sizing solve

`research/lyt/bench_solve.py`, `--n 1000` (batched, mean/p95, real
`CpSolver` wall time only — parse/load/presence-prune hoisted out of the
timed loop).

### Real encodings (full staged lexicographic solve: board-max, aspect-slack, reach-preferred, minimize-slack — up to 4 CP-SAT solves per call)

| encoding | n | mean ms | p95 ms | min ms | max ms | solves/s |
|---|---:|---:|---:|---:|---:|---:|
| lengyue-landscape@1920x1080 | 1000 | 8.038 | 10.521 | 5.047 | 69.606 | 124.4 |
| lengyue-portrait@1080x1920 | 1000 | 7.456 | 9.167 | 4.717 | 29.520 | 134.1 |
| current-row-asis@1920x1080 | 1000 | 12.944 | 15.101 | 9.660 | 71.662 | 77.3 |

All 3000 solves came back `OPTIMAL`, no timeouts.

### Synthetic flat-H programs (single stage only — `board_widget=None`, `reach_preferred_widgets=None`, so only the minimize-slack stage runs; isolates slot-count scaling from the real encodings' own multi-stage cost)

| slots | n | mean ms | p95 ms | min ms | max ms | solves/s |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 1000 | 2.152 | 3.168 | 1.351 | 4.528 | 464.7 |
| 10 | 1000 | 2.466 | 3.468 | 1.484 | 25.586 | 405.6 |
| 20 | 1000 | 2.972 | 3.977 | 1.940 | 39.060 | 336.5 |
| 40 | 1000 | 3.942 | 5.254 | 2.865 | 51.374 | 253.7 |

All 4000 solves came back `OPTIMAL`.

**Reading this.** A real, full staged solve costs roughly 7-13ms on this
machine (~75-135 solves/sec) — cheap in absolute terms, but each one is
actually *up to four* CP-SAT solves internally (board-max, aspect-slack
resolution, reach-preferred, minimize-slack), so per-CP-SAT-invocation
cost is closer to 2-4ms, consistent with the single-stage synthetic
numbers. Slot count alone scales sub-linearly-to-linearly in this
range (5→40 slots is roughly a 1.8x cost increase for an 8x slot-count
increase) — CP-SAT's own propagation, not brute enumeration, is doing
the work.

**What this bounds.** If a hypothetical structure search called this
solver once per candidate tree, a 60-second budget affords roughly
4,500-9,000 candidates at real-encoding cost (~75-135/s), or
15,000-28,000 at synthetic single-stage cost (~250-465/s). §3's
combinatorics estimate below shows why that number matters: even a
modest 8-region skeleton search has on the rough order of ~4×10^5
distinct (region-placement × axis-choice) combinations — within reach
of the low end of that budget, but not comfortably so, and growing fast
with region count. This is the concrete case for why §2's JOINT model
(structure and sizing decided together, in ONE CP-SAT solve, rather than
one solve per candidate tree) is worth trying at all.

## 2. Joint structure+sizing synthesizer

`research/lyt/synthesize.py`. Full design rationale, the bounded-skeleton
shape, and the disclosed reuse-vs-parallel-model boundary are in the
module's own docstring (read in full before relying on any claim below
that cites it) — this section states the *results*.

### The region census

Grounded directly in the CURRENT `encodings/lengyue_landscape.lyt` /
`encodings/lengyue_portrait.lyt` files (not `SPEC.md`'s own worked
example, which quotes the pre-"REPAIR PASS, ledger row 1781" 340px/28px
side-column numbers — the landscape file's own header records the bump
to 480px/128px; this spike reads the file, not the stale doc quote).

**Landscape (8 regions):** `rail`(168px), `boardComposite`(compound —
`V(B aspect-1, I_board 24px, A_board 28px)`), `A_go`(128px),
`I_engine`(128px), `A_common`(128px), `tree`(140px), `blackbox`(compound
— the 5-tab `T(...)`, `WRAPPER_MIN`=300px floor), `preview`(160px,
aspect 1).

**Portrait (7 regions):** `rail`(168px), `A_top`(28px — portrait merges
`A_go`+`A_common` into one strip, never received landscape's repair
pass), `boardComposite`(compound, identical internals),
`I_engine`(28px — genuinely still 28px in this file, not 128px),
`tree`(140px), `blackbox`(compound, 200px per-child floor),
`preview`(96px, aspect 1).

Both counts sit in the commission's own "~6-8" band. The two encodings
genuinely diverge in region count and in `I_engine`'s reservation — a
real fact about the current state of the two `.lyt` files, not a
modeling inconsistency introduced here.

### The bounded skeleton

Three potential internal H/V nodes (matching the real encodings' own
depth exactly: root H / side-column V / tree-row H is 3 levels in
`lengyue_landscape.lyt` itself), default slot capacities 4/5/4 (root/
nested/nested-nested). Each node's axis is a decision variable; each
slot holds a region, a delegate to the next node down, or is empty
(front-packed). See the module docstring's "Why NOT more of
compiler.py" section for exactly which parts reuse `compiler._collect`/
`compiler._constrain` verbatim (the two compound regions' own internal
structure) versus which parts are a disclosed parallel minimal model
(structure search itself, and the six atomic regions' reified bound
application — not code-compatible with `compiler.py`'s unconditional
`model.Add(...)` calls, since structure is a decision variable here, not
a fixed tree fact at model-build time).

### (a) Does it reproduce, match, or beat the hand-written tree?

**Board-maximization optimum: reproduced EXACTLY, both classes.**

| class | hand-written board `w` (ALL-PRESENT valuation) | synthesized board `w` |
|---|---:|---:|
| landscape @ 1920×1080 | 1028 | **1028** |
| portrait @ 1080×1920 | 1080 | **1080** |

(The hand-written numbers above are the ALL-PRESENT valuation — every
leaf including `boardRail`/`previewBoard` counted — not `runner.py`'s
own DEFAULT valuation, which prunes those two toggle leaves entirely and
would give the board strictly more room. This spike's joint model does
not model presence/toggling at all — see §3 — so ALL-PRESENT is the
honest apples-to-apples comparison, not the default one.)

Stage 1 (board-width maximization, the literal analog of
`compiler.py`'s own stage 1) is reproduced to the pixel on both screen
classes. That is the headline result: **the joint model's sizing
half is not just "close" — it finds the identical optimum a hand-tuned
CP-SAT solve over the hand-written tree finds**, using a completely
different, from-scratch-searched tree shape to get there.

**Found structure: valid, but NOT the hand-written tree — and NOT as
sensible.** Landscape, rendered from the actual solve:

```
H(
  V(
    preview        [w=160 h=160]
    H(
      A_go         [w=128 h=468]
      I_engine     [w=128 h=468]
    )
    rail           [w=260 h=168]
    A_common       [w=260 h=128]
    tree           [w=260 h=140]
  )
  blackbox         [w=608 h=1080]
  boardComposite   [w=1028 h=1080]
)
```

versus the hand-written tree's own shape (§1.2's worked example / the
`.lyt` file itself): `H(rail, boardComposite, V(A_go, I_engine,
A_common, H(tree, blackbox, preview)))`.

The synthesized tree is GEOMETRICALLY VALID (every partition equality
and cross-fill constraint holds, board reaches the exact same optimum)
but structurally worse by inspection: `tree` and `blackbox` — which the
"tree always visible" ledger ruling (~row 1735, both `.lyt` files' own
headers) deliberately keeps adjacent as one row — end up in DIFFERENT
branches of the tree entirely, and `blackbox` balloons to 608px (more
than double its 300px floor) for no functional reason. Neither defect
is a bug in the CP-SAT encoding; both are the DIRECT, honest consequence
of what the objective does and doesn't reward — see (d) below, which is
exactly where this finding earns its keep: it names precisely what
ontology input is missing to prevent it.

Portrait's synthesized tree shows the identical pattern (`tree` and
`blackbox` separated; `blackbox` again balloons, this time to
`w=1080 h=736`).

**Verdict on (a): reproduces the SIZING optimum exactly; finds a
DIFFERENT, valid-but-worse tree.** Not "equivalent-scoring" in the
naive sense (the objective used genuinely scores this tree at least as
well as the hand-written one, by construction — stage 1 ties, stage 2
strictly favors the found tree's oversized black box) — the finding is
that the OBJECTIVE ITSELF, at this region granularity, does not
penalize the structural choices a human reviewer would flag. That gap is
squarely an ontology/objective-completeness question, not a solver
capability question.

### (b) Wall time per joint solve

| class | status | solve_ms (2-stage CP-SAT wall time) | bool vars | total vars |
|---|---|---:|---:|---:|
| landscape (8 regions) | OPTIMAL | 3933.9 | 131 | 186 |
| portrait (7 regions) | OPTIMAL | 1528.5 | 118 | 173 |

Both comfortably inside a `--time-limit-s 60` budget, and inside any
interactive or CI-time budget. This is the two-stage lexicographic solve
(board-max, then a black-box-growth stage — see (d) for why that second
stage is a narrower proxy than `compiler.py`'s own reach-preferred/
minimize-slack pair), each stage a fresh CP-SAT model build+solve,
mirroring `compiler.py`'s own "rebuild is cheap" staging discipline.

### (c) How the space grows with region count — stated honestly

At 7-8 regions and the 4/5/4-slot skeleton: ~120-190 total CP-SAT
variables, 118-131 of them boolean, solved to `OPTIMAL` in 1.5-4
seconds. A rough combinatorial estimate for THIS skeleton shape — every
region independently choosing one of 3 nodes (ignoring slot order within
a node, since front-packing removes that as a free dimension) times each
active node's own axis choice — is on the order of `3^n_regions × 2^3`,
which is ~52,000 at n=8 and ~1.4M at n=12. That estimate is a LOWER
bound on the real branching complexity (it ignores delegation-topology
choices and doesn't account for infeasible branches CP-SAT prunes early)
but its GROWTH RATE — exponential in region count, base 3 for the
node-choice alone — is the honest headline: this is not a search space
that stays flat as the census gets richer.

**Empirical confirmation, not just the formula.** A follow-up probe —
12 regions (10 fixed/aspect + 2 compound slack-absorbers), a widened
6/6/6-slot skeleton, single stage 1 objective only, 120-second budget —
did NOT reach a proven `OPTIMAL`: it returned `FEASIBLE` at the 120s
wall-clock cutoff (`bool_vars=251, total_vars=316`). Going from 7-8
regions (seconds, proven optimal) to 12 regions with a wider skeleton
(120+ seconds, not even proven optimal) is a real, measured cliff, not
merely the formula's prediction — this spike did not chase the exact
knee of that curve (a genuine further-work item, not attempted here
given the spike's own time budget), but the direction and roughness of
the growth are now grounded in two real data points, not one estimate.

### (d) Ontology inputs: what was genuinely sufficient vs. what had to be hard-coded

This is the deliverable the commission actually wants — it names exactly
what "providing the proper ontology" must include for a real system.

**Sufficient, drawn directly from existing LYT/census artifacts:**

- The consolidated region list itself, with grounded `min`/`pref`/`max`/
  `aspect` values — read straight off the current `.lyt` files, no
  invention needed.
- The atomic-vs-compound distinction, and the compound regions'
  (`boardComposite`, `blackbox`) OWN internal structure — already fully
  specified; the joint model reuses `compiler._collect`/`_constrain`
  verbatim for both, no re-derivation.
- The lead objective term (maximize board width) — a direct port of
  `compiler.py`'s own stage 1, no invention.
- Screen-class dimensions.

**NOT supplied by anything existing — genuinely hard-coded by this
spike, and exactly what a production ontology would need to declare:**

1. **Gap px per split tier.** Fixed at 12px (root) / 4px (nested), not
   searched, not declared anywhere the synthesizer reads — a real system
   needs either a tier-selection rule (which splits get which
   `--space-*` value) or gap as a genuine decision variable.
2. **Adjacency/grouping preferences.** The single biggest finding of
   this spike: nothing tells the synthesizer that `tree`, `blackbox`,
   and `preview` should stay siblings in one row (the "tree always
   visible" ruling the hand-written encoding structurally encodes but
   which is nowhere in the region CENSUS itself, only in the tree
   someone already wrote). Without it, the found tree scatters them
   across branches. A real ontology needs an explicit, machine-readable
   adjacency/co-location declaration per region (or region group), not
   just a flat list with reservations.
3. **A bound on elastic-region growth.** `compiler.py`'s own
   reach-preferred/minimize-slack stages never reward an `max=inf`
   widget growing (only a concrete px `pref` gets a reach term, only a
   finite `max` gets a slack term) — so "don't let the black box balloon
   to 608px" isn't something the REAL compiler's objective would reward
   either; this spike's own stage-2 proxy (maximize black-box along-
   extent, as a stand-in for the vacuous reach-preferred/slack stages at
   this region granularity — see the next point) actively made this
   WORSE by rewarding growth outright. A faithful joint objective needs
   either a genuine per-elastic-region soft target (not present in any
   census today) or to accept that elastic-region sizing is
   underdetermined by design, and say so — not paper over it with a
   growth-rewarding proxy.
4. **The skeleton shape itself.** 3 potential nodes, 4/5/4 slot caps —
   chosen by ALREADY KNOWING the hand-written tree's depth. A genuinely
   blind synthesizer wouldn't have this a priori; either the skeleton
   needs to be its own declared input (bounded by some other principled
   source — screen real estate budget? region count?) or discovered by
   iterative deepening (not attempted here).
5. **Presence/toggle behavior per region.** Entirely unmodeled — every
   region is always-present in this joint model. A real ontology needs,
   per region, its `Presence` (per §3's typed vocabulary) declared and
   the synthesizer would need to jointly reason across valuations, not
   just one.
6. **Domain/facet tags, for laws that need them.** None of the 8/7
   consolidated regions are bare `chrome`/`action` leaves, so L2's
   dominance test never actually fires in this joint model — it sits
   ABOVE the granularity where L2 bites (L2's real targets, the four
   `chrome` toggle buttons, are sub-components of these consolidated
   regions, not top-level census entries themselves). A synthesizer
   meant to genuinely enforce L2 needs a finer-grained census than this
   consolidated one, with domain/facet tags threaded through.
7. **Perceptual/reading-order preferences.** Front-packing is a genuine
   mathematical symmetry for the SIZING objective (permuting active
   slot order changes no scored quantity), so this spike's found trees'
   left-to-right/top-to-bottom order is a solver artifact, not itself
   optimized — nothing in the census says "rail should read before the
   board." §2's own structure semantics says order IS perceptually
   significant; a production synthesizer needs an explicit ordering
   preference input, or needs to accept order as genuinely free (and say
   so, rather than let a solver's tie-breaking silently stand in for a
   design decision).

## 3. Honest limits

What this spike does NOT show:

- **Multi-class joint synthesis.** Landscape and portrait are solved as
  two fully independent joint solves. Nothing here penalizes, rewards,
  or even notices structural divergence between the two classes'
  found trees (they do, in fact, diverge more than the hand-written
  pair does — compare the two ASCII trees in §2(a) against each other).
  A real system might want a shared-structure preference across
  classes; untested.
- **Presence valuations in the joint model.** Every region is
  always-present. `boardRail`/`previewBoard`'s real `@toggle(user,
  release)` presence, and the ALL-PRESENT-vs-DEFAULT distinction that
  matters for a fair board-width comparison (§2(a)'s own caveat), is
  entirely outside this model's scope.
- **Aesthetic terms.** Beyond board-maximization and the narrow,
  arguably-counterproductive black-box-growth proxy (§2(d) point 3), no
  term here models whitespace balance, visual grouping quality, or any
  preference beyond the two lexicographic stages actually implemented.
- **L2 (or any well-formedness law) as a genuine hard constraint in the
  joint model.** The commission asked for laws as hard constraints
  "where expressible (L2 dominance...)" — at this region granularity, L2
  is VACUOUSLY satisfied (no bare chrome/action leaf exists among the
  consolidated regions to trigger it), so this spike does not actually
  exercise a genuine law-as-hard-constraint case. A finer-grained
  census (§2(d) point 6) would be needed to test that honestly.
- **Region counts beyond ~12.** The one data point past the 7-8-region
  census (§2(c)'s empirical probe) already misses a 120-second budget.
  Nothing here characterizes the curve beyond that single additional
  point.

**Measured verdict on viability.** At the scale this spike actually
tested — a single screen class, 7-8 consolidated census regions, a
3-node/4-5-4-slot bounded skeleton — joint CP-SAT structure+sizing
synthesis is **clearly viable, seconds not minutes** (1.5-4 seconds,
proven `OPTIMAL`, reproducing the hand-written board-maximization
optimum exactly). That viability is narrow, not general: the one
empirical scaling probe beyond this range (12 regions, a widened 6/6/6
skeleton) already failed to reach proven optimality within 120 seconds,
consistent with the combinatorics estimate's exponential-in-region-count
growth. The realistic reading is **"viable today for a bounded,
consolidated census at roughly this size; unproven and plausibly
minutes-to-intractable beyond it without either a decomposition strategy
(e.g., recursing this spike's own compound-region trick — solve
sub-groups' internal structure independently, as already done here for
`boardComposite`/`blackbox` — one more level up) or a tighter, ontology-
informed skeleton that doesn't have to search as much of the space"** —
not "hopeless," but not a blank check either. The bigger blocker to
actually FINDING a good tree, at any scale, is not solver capability at
all: it's §2(d)'s adjacency/grouping-preference gap, which produced a
geometrically-valid but structurally-worse-than-hand-written tree even
at the one scale this spike solved comfortably.
