# LYT compiler prototype

Exploratory research tooling implementing the LYT layout-description
language from `.claude/dispatch-reports/layout-language-consult.md`
end to end: a concrete-syntax parser (`parser.py`), a raw-tree → typed-AST
loader that enforces the language's typed prohibitions and structural
well-formedness laws (`loader.py`, `lyt_ast.py`, `wellformed.py`), a
CP-SAT compiler and staged lexicographic solver (`compiler.py`), an ASCII
renderer (`render.py`), and a CLI runner that solves every worked
encoding at several representative screen sizes (`runner.py`).

Not application code — `frontend/` is untouched, per the umbrella's scope
discipline. See `.claude/dispatch-reports/lyt-compiler-prototype-build.md`
for the original build report and
`.claude/dispatch-reports/lyt-compiler-prototype-review.md` for the
adversarial review that followed it (REJECT, 2 MAJOR / 4 MODERATE / 5
MINOR findings); the fixes for that review's findings are recorded in
`.claude/dispatch-reports/lyt-compiler-fix1-build.md`. Two language
amendments, adjudicated via the commissioner-delegated ledger (rows
1670/1671), are implemented on top of that fix pass — see
`SPEC-AMENDMENTS.md` for the rulings and their rationale, and the two
sections below for what changed in this checker/loader as a result.

## Well-formedness checking scope (L1-L4)

`errors.py`'s `LytLoadError` docstring references "L1-L4" as the laws it
enforces; here is what that actually covers in this prototype, since
neither the code nor this README stated it plainly before the cold
review (`.claude/dispatch-reports/lyt-compiler-cold-review.md`) flagged
the gap:

- **L1** (control stability) is not structurally checked — it quantifies
  over runtime screen-class/toggle/drag states, not static tree shape.
  AMENDMENT 1 (ledger row 1670, `SPEC-AMENDMENTS.md`) tightens the one
  corner of L1 this prototype DOES touch: `preserve` presence now raises
  a slot's `min` to its `pref` at load time (`loader.py`'s
  `_apply_preserve_reservation`), so a `preserve` slot's promised
  geometry is a genuine reservation the solver can no longer squeeze to
  zero — see "AMENDMENT 1 consequence" below for what that does to the
  reported feasibility.
- **L2** (no band of a partition axis reserved for a hide/show affordance
  alone) IS checked, by `wellformed.py`. AMENDMENT 2 (ledger row 1671,
  `SPEC-AMENDMENTS.md`) REPLACES the previous local tree-shape
  approximation with a magnitude (dominance) test: a Split node violates
  L2 when its direct chrome/action-leaf children's combined `pref`
  exceeds half of the split's own total reserved extent (all direct
  children's `pref`, along the split's own partition axis). The
  previously-disclosed decoy loophole — flagged by the cold review, "a
  single near-zero non-chrome sibling (as little as 1px, under 4% of the
  wrapped band) is enough to flip the checker's verdict from VIOLATION to
  CONFORMS" — is now CLOSED: the near-zero decoy no longer dilutes the
  ratio enough to hide a genuine majority. See `wellformed.py`'s module
  docstring for the full derivation, the two witnesses (decoy flagged,
  mixed toolbar conforms), and the one remaining disclosed gap (a
  genuinely-incomparable case — chrome content sharing a band with an
  elastic `fr`-pref sibling — is refused loudly rather than guessed, not
  silently resolved either way).
- **L3** (envelope-state coverage) is checked at load time (loader.py).
- **L4** (a slot's extent has at most one writer among {solver constant,
  user drag}) is **entirely unimplemented**. The `drag-persisted` sizing
  keyword parses but is dropped after parsing — never reaching the typed
  AST, the loader, or the compiler. This is a defensible scope call for a
  static, offline solver with no runtime drag state to arbitrate, but it
  means an `.lyt` file with `drag-persisted` gets no enforcement of L4
  from this prototype at all. See `wellformed.py`'s "L4 ACCOUNTING"
  paragraph for the full disclosure.

## AMENDMENT 1 consequence: preserve reservations are now genuine, and the
## board sometimes has to shrink to pay for them

Before AMENDMENT 1, `current_row_repaired.lyt`'s three system-preserve
banners (`captureBanner`/`saveBanner`/`systemLog`, declared `min 0px`)
solved to `h=0` at every landscape size the runner exercises — the cold
review's own OBSERVATION finding. After the amendment, their loaded
`min` equals their `pref` (32/32/250px), a genuine hard floor the
compiler can no longer route around by starving it.

Re-running the runner's own four representative sizes
(`1920x1080`/`2560x1440`/`1280x1024`/`1080x1920-portrait`), the
FEASIBILITY pattern for every registration is **unchanged** by this
amendment — `current-row-repaired` stays `OPTIMAL` at the first three
and was already `INFEASIBLE` at portrait pre-amendment, for the
unrelated aspect/exact-cross-fill reason the "Honest caveat" section
below describes. What DOES change, at the three landscape sizes, is the
SOLVED geometry: the board-maximize stage now has to leave room for the
banners' genuine 314px combined floor, so it settles for a smaller
board instead of the value it found when the banners were squeezable to
nothing:

| size | board `w` before | board `w` after | stage-2 objective before | stage-2 objective after |
|---|---|---|---|---|
| 1920×1080 | 1024 | 710 | −314.0 | −0.0 |
| 2560×1440 | 1384 | 1070 | −314.0 | −0.0 |
| 1280×1024 | 664 | 654 | −10.0 | −0.0 |

(Stage-2's objective is "reach-preferred shortfall, negated" — `-0.0`
after the amendment means every reach-preferred widget, including the
now-genuinely-floored banners, reaches its `pref` exactly; `-314.0`
before meant the banners' entire combined `pref` was unmet shortfall,
i.e. they were rendering at zero height while nominally "preserved".)

The amendment's own predicted consequence — some encodings becoming
INFEASIBLE at some screen sizes, which is correct behavior surfacing a
real design choice, not a bug to dodge — is real, just not visible at
the runner's four representative sizes for this fixture: bisecting the
height at a fixed 1920px width finds the new infeasibility threshold
between 640px (still `OPTIMAL`) and 650px (`INFEASIBLE`) — a viewport
short enough that the mandatory 314px banner reservation plus the nav
bar's own floor leaves no room for a board at all. Pre-amendment, the
SAME fixture solved `OPTIMAL` all the way down to 340px (only going
`INFEASIBLE` below 330px, for unrelated reasons). This is pinned as a
regression test,
`tests/test_lyt.py::test_current_row_repaired_1920x600_is_expected_infeasible`,
naming the mechanism in its own docstring — this prototype does not
silently narrow the affected screen-size range to dodge the honest
result; a real design tradeoff (afford the reserved banner height, or
move the banners to an overlay stratum) now surfaces as a load-bearing
solver outcome instead of a silently-broken promise.

## Honest caveat on the "infeasibility proof" results (review finding F5)

The build report's "single most interesting thing the solver revealed"
section presents a table of `INFEASIBLE` results (q5go and OGS failing to
solve at several landscape sizes, `current-row-repaired` failing at
portrait) as evidence — described there as "not a bug — a proof" — that a
single static layout tree cannot serve every screen orientation, which is
offered as empirical support for LYT's own multi-class/nearest-neighbor
design (§4.4).

That per-row geometry is accurate, and remains accurate after the F1/F2/F6
fixes recorded in the fix report above (re-verified — see that report's
"F5" section). But the framing needs a caveat the original report doesn't
state: **the specific pattern of which sizes are feasible and which are
infeasible depends on the DIRECTION of a disclosed cross-axis relaxation
this compiler applies, not on raw geometry alone.**

The spec's §4.1 semantics for `H`/`V` are literal: "every child's height
is R.h" (a Split's children fill the CROSS axis exactly). Under that
literal reading, an `aspect`-bearing leaf (the board) makes almost every
encoding infeasible almost everywhere — including the rows the build
report's own table shows as `OPTIMAL` — because an exact-fill equality
generally can't be reconciled with a leaf whose cross dimension is
determined by its own aspect ratio, not by its parent's share. This
compiler's own disclosed invention 25 relaxes that equality to `<=` on the
CROSS axis specifically for aspect-locked leaves (`compiler.py`'s
`_constrain`, Split branch), letting the leaf shrink within whatever room
its column leaves it. That one-directional choice is exactly what makes
q5go/OGS/the clean-room encodings solvable at all at the sizes the build
report labels feasible.

The relaxation could just as defensibly have gone the other way. Applying
the SAME kind of `<=` relaxation to the ALONG axis instead (letting a row
absorb slack lengthwise rather than the aspect leaf shrinking crosswise)
turns some of the report's `INFEASIBLE` rows `OPTIMAL` — reproduced during
the review as "PROBE 5": q5go's `A` strip given `max inf` (instead of a
fixed height) makes the 1280×1024 case solve, with a 960×960 board, where
the as-shipped relaxation direction reports `INFEASIBLE`.

So the honest statement is: **the spec's exact-cross-fill law genuinely
collides with `aspect`, this prototype patches that collision in one
particular direction, and the reported feasible/infeasible split is a
consequence of encoding-plus-patch-direction, not of geometry alone.**
The underlying spec unsoundness this prototype surfaced (the literal §4.1
semantics and `aspect` are jointly unsatisfiable in general) is real and
arguably the prototype's most valuable finding — it just needs to be
named as what it is, rather than narrated as a geometry-only proof.

## The `--baseline` load mode (lyt-constants-swap, ledger row 1687)

`load_layouts` / `check_wellformed` accept an optional `waivers`
parameter — a `layout name -> [wellformed.Waiver, ...]` map — for loading
an encoding that is HONESTLY L2-non-conformant rather than either (a)
refusing to load it at all, or (b) silently weakening the checker for
every encoding. Every `Waiver` is a loud, enumerated exemption at one
exact tree path, and must name the law and a citation (`wellformed.py`'s
`Waiver` docstring has the full mechanism and its stale-waiver-refusal
safety net). Omitting `waivers` (the default) is byte-identical to this
prototype's pre-baseline, strict-mode behavior — every OTHER encoding is
unaffected.

`research/lyt/baseline.py`'s `BASELINE_WAIVERS` is the one registry this
mechanism is populated from today, covering
`encodings/current_row_asis.lyt` — the LYT shadow-harness's AS-IS
conformance baseline (today's SPA row-axis layout transcribed
warts-and-all, unlike `current_row_repaired.lyt`, which structurally
repairs its L1/L2 warts). `runner.py`'s `Registration.waivers` field and
`emit_ts.py --registration current_row_asis.lyt` both thread this map
through, so the CLI runner and the codegen agree on what's waived and
why. See `encodings/current_row_asis.lyt`'s own header for the two
disclosed L2 sites and `.claude/dispatch-reports/lyt-constants-swap-build.md`
for the divergence-report evidence this baseline produced.
