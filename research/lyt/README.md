# LYT compiler prototype

This directory holds a research prototype that checks whether a proposed
screen layout for LengYue's SPA is even geometrically possible, before
anyone builds it — for a reader (human or LLM) orienting to the LYT
project cold.

Exploratory research tooling implementing the LYT layout-description
language from [.claude/dispatch-reports/layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md)
end to end: a concrete-syntax parser (`parser.py`), a raw-tree → typed-AST
loader that enforces the language's typed prohibitions and structural
well-formedness laws (`loader.py`, `lyt_ast.py`, `wellformed.py`), a
CP-SAT compiler and staged lexicographic solver (`compiler.py`), an ASCII
renderer (`render.py`), and a CLI runner that solves every worked
encoding at several representative screen sizes (`runner.py`). LYT
itself — what it is, its full syntax and semantics, its well-formedness
laws, the CP-SAT and CSS-Grid compilation contracts, and its known
limitations — is specified standalone in [SPEC.md](SPEC.md); this file no longer
restates that content and instead points there. What follows in this
section is the human-readable *why*: what problem LYT is solving and
why it is shaped the way it is, for a reader arriving cold before the
operational how-to below.

## Why LYT exists

LYT exists because LengYue's SPA had, on inspection, a repeating
control-panel bug family that no amount of one-off patching was
converging on: a toolbar control moves out from under the user's mouse
the instant the engine finishes connecting, or the instant a latency
readout grows from one digit to two, because nothing reserved room for
the state that hadn't arrived yet — content was measuring itself and
then re-partitioning its neighbors. A sibling bug, standing-cost
chrome, is the same failure in reverse: a toggle button that exists
only to hide another panel sits in its own permanently-reserved band
of screen real estate whether or not anything is hidden, paying rent
every frame for a feature nobody is using this second. Both bugs
trace to the same missing primitive — a reservation that content lives
*inside* rather than dictates — and the codebase had already
reinvented that primitive locally three separate times (a
permanently-reserved hint slot, a `visibility:hidden` box-preserving
toggle, digit-count `—`-placeholder padding) before anyone asked
whether it should be the *default* semantics of a layout description
instead of a per-site fix. LYT's answer is to make "every extent is a
reservation, never an emergent content measurement" the language's one
load-bearing idea, and to make the two defect classes above into
*type errors* — literally unconstructable values in the typed AST
([SPEC.md](SPEC.md) §3, §4.2) — rather than review comments a tired reviewer
can miss. The board-first objective ([SPEC.md](SPEC.md) §7–§8: maximize the
board's own dimension before anything else, as a lexicographic
priority rather than a hard constraint that would make an
information-dense row unsatisfiable) is the same idea applied to what
the layout is *for*: LengYue is a Go-study tool, so the board's own
size is the thing worth spending free space on first, and everything
else is arbitrated afterward.

The shape LYT takes — three separated strata (structure, sizing,
presence) compiled once into two different consumers, rather than one
ad-hoc description read by one renderer — follows from treating layout
as a *solvable program* instead of a hand-tuned stylesheet: the same
typed tree that a CP-SAT solver can verify offline ([SPEC.md](SPEC.md) §8; does
this screen size even admit a feasible layout, and if not, why not) is
also, unmodified, the tree a browser's own CSS Grid engine realizes
live ([SPEC.md](SPEC.md) §10) — one description, two independent consumers,
rather than a solver whose findings have to be hand-translated into
CSS by someone who might translate them wrong. The well-formedness laws
([SPEC.md](SPEC.md) §4.3–§5) are the boundary of the admissible design space
this buys: L2's dominance test, for instance, isn't a lint rule bolted
on afterward, it's the mechanized form of "no band of the screen may
exist solely to hide/show another band," checked the same way a type
error is checked, at load time, before a solver or a browser ever sees
the tree. None of this is free of rough edges — [SPEC.md](SPEC.md)'s own
"Known limitations and open questions" section (§12) names them in
full (a genuine, unresolved collision between the language's
exact-cross-fill semantics and its `aspect` constraint; two of the four
well-formedness laws with no structural checker at all; a presence-
independent infeasibility at several real screen sizes even after the
per-valuation presence work below) — but the strata separation is what
let those rough edges be *found and named precisely*, by hand-evaluating
the laws and by solving the tree, rather than staying as vague
unease about "the layout feels fragile sometimes."

Not application code — `frontend/` is untouched, per the umbrella's scope
discipline. See [.claude/dispatch-reports/lyt-compiler-prototype-build.md](../../.claude/dispatch-reports/lyt-compiler-prototype-build.md)
for the original build report and
[.claude/dispatch-reports/lyt-compiler-prototype-review.md](../../.claude/dispatch-reports/lyt-compiler-prototype-review.md) for the
adversarial review that followed it (REJECT, 2 MAJOR / 4 MODERATE / 5
MINOR findings); the fixes for that review's findings are recorded in
[.claude/dispatch-reports/lyt-compiler-fix1-build.md](../../.claude/dispatch-reports/lyt-compiler-fix1-build.md). Four language
amendments, adjudicated via the commissioner-delegated ledger (the
project's append-only decision log, written and read with the
`./autoharn led` command from the repository root; "rows
1670/1671/1715/1737" are entries in it), are implemented on top of
that fix pass — see
[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md) for the rulings and their rationale, and the two
sections below for what AMENDMENTS 1/2 changed in this checker/loader
(AMENDMENT 3, the split-node `gap` declaration, touches the parser/
loader/compiler/mockup-generator seam instead — see
[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s own Amendment 3 section, `loader.py`'s
`_load_gap_px` docstring, and the
[.claude/dispatch-reports/lyt-gap-amendment-build.md](../../.claude/dispatch-reports/lyt-gap-amendment-build.md)
dispatch report for the full account; AMENDMENT 4, per-valuation presence
solving, is covered in its own section further below).

## Well-formedness checking scope (L1-L4, plus Amendment 5's L5 family)

The full current-implementation status of each law — which of L1-L4 is
structurally checked, which is a construction-time type refusal, and
which is entirely unimplemented, with the checkable form of each — is
specified in [SPEC.md](SPEC.md) §4.3 (laws overview) and §5 (L2's dominance test
in full). `errors.py`'s `LytLoadError` docstring references "L1-L4" as
the laws it enforces; [SPEC.md](SPEC.md) is where that reference actually
resolves. In brief, for a reader orienting inside this file: L1 has no
structural checker beyond the one corner AMENDMENT 1 touches (below);
L2 is checked, by `wellformed.py`, per AMENDMENT 2's dominance test; L3
is checked at load time; L4 is entirely unimplemented (the
`drag-persisted` keyword parses and is then dropped on the floor). See
`wellformed.py`'s own module docstring for the code-level derivation
this README no longer duplicates.

AMENDMENT 5 (ledger row 1937) adds four more laws — L5, L5a, L5b, L5c,
overflow honesty for the new `scroll`/`content` sizing-bag keys — in the
SAME `wellformed.py` structural-walk family as L2. See [SPEC.md](SPEC.md) §13 for
the full grammar/semantics and [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s own Amendment 5
entry for the ruling and rationale. All four are dormant (fire on zero
encodings) until an encoding declares `scroll` or `content` — neither
clean-room encoding does yet, so this amendment changes no existing
encoding's behavior.

## AMENDMENT 1 consequence: preserve reservations are now genuine, and the board sometimes has to shrink to pay for them

Before AMENDMENT 1, `current_row_repaired.lyt`'s three system-preserve
banners (`captureBanner`/`saveBanner`/`systemLog`, declared `min 0px`)
solved to `h=0` at every landscape size the runner exercises — the
adversarial review's own OBSERVATION finding (an OBSERVATION — a
non-blocking note outside the review's MAJOR/MODERATE/MINOR severity
scale). After the amendment, their loaded
`min` equals their `pref` (32/32/250px), a genuine hard floor the
compiler can no longer route around by starving it.

Re-running the runner's own four representative sizes
(`1920x1080`/`2560x1440`/`1280x1024`/`1080x1920-portrait`), the
FEASIBILITY pattern for every registration is **unchanged** by this
amendment — `current-row-repaired` stays `OPTIMAL` at the first three
and was already `INFEASIBLE` at portrait pre-amendment, for the
unrelated aspect/exact-cross-fill reason the "Honest caveat" section
below describes. What DOES change, at the three landscape sizes, is the
SOLVED geometry: the board-maximize stage (stage 1 of the solver's
ordered objective — maximize the board's own dimension first; stage 2
then minimizes every other widget's shortfall from its preferred size)
now has to leave room for the banners' genuine 314px combined floor,
so it settles for a smaller board instead of the value it found when
the banners were squeezable to nothing:

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
design ([SPEC.md](SPEC.md) §6).

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
compiler's own disclosed invention relaxes that equality to `<=` on the
CROSS axis specifically for aspect-locked leaves (`compiler.py`'s
`_constrain`, Split branch), letting the leaf shrink within whatever room
its column leaves it. That one-directional choice is exactly what makes
q5go/OGS/the clean-room encodings — the from-scratch `lengyue_landscape.lyt`
and `lengyue_portrait.lyt` registrations, as opposed to the as-is
transcriptions of existing UIs — solvable at all at the sizes the build
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

## AMENDMENT 4: per-valuation presence solving (ledger row 1737)

Pre-Amendment-4, this prototype solved exactly ONE presence valuation —
"every slot present" — regardless of any slot's own declared default-
hidden state (`compiler.py`'s own module docstring disclosed this
outright). That is now closed: `presence.py` (new module) lets a
registration declare a `default_valuation` (which release-toggled widgets
are ABSENT by default) plus optional named "common" valuations, per the
spec's own §6 presence paragraph ([layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md) line
636-641) — implemented literally, not a new law. The lengyue registration
declares `{"boardRail", "previewBoard"}` absent by default, matching both
`.lyt` encodings' own now-genuine `@toggle(user, release)` presence on
those two leaves (was `@fixed`, pre-amendment).

An absent slot is PRUNED from its parent split's children entirely (not
sized to zero) before compiling, so the existing `(k-1)*gap` partition
term automatically uses the present count — no `compiler.py` change was
needed. Of the five sizes the motivating investigation's own build report
([.claude/dispatch-reports/lyt-tree-always-visible-build.md](../../.claude/dispatch-reports/lyt-tree-always-visible-build.md),
the work that added `boardRail`/`previewBoard` as user-toggleable slots)
named as newly, falsely `INFEASIBLE` once boardRail/previewBoard's
always-present reservations were counted, solving the default valuation
flips **two** to `OPTIMAL` — landscape 1366x768 and portrait 420x880. The
other three (landscape 1024x700, 900x600, 1280x1024) remain `INFEASIBLE`
for a genuine, presence-INDEPENDENT reason (the board composite — the
V-split subtree containing the board leaf and its info/action strips —
forces an exact board size from the viewport height alone, which
collides with the tree/panels row's `WRAPPER_MIN` floor — the
tree/panels row's own minimum-width constant, `loader.WRAPPER_MIN_PX`;
see [SPEC.md](SPEC.md) §11's infeasibility discussion — regardless of
boardRail/previewBoard) — see [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s own Amendment 4
section for the full derivation, before/after table, and what this means
for the debug overlay's own solved-vs-live comparison. Build report:
[.claude/dispatch-reports/lyt-presence-valuation-solve.md](../../.claude/dispatch-reports/lyt-presence-valuation-solve.md).

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
`encodings/current_row_asis.lyt` — the LYT shadow-harness's (a
"shadow" measurement rig, `frontend/scripts/lyt-conformance.mjs`, that
measures the LIVE SPA's rendered DOM geometry and diffs it against
LYT's solved layout, without altering the app) AS-IS
conformance baseline (today's SPA row-axis layout transcribed
warts-and-all, unlike `current_row_repaired.lyt`, which structurally
repairs its L1/L2 warts). `runner.py`'s `Registration.waivers` field and
`emit_ts.py --registration current_row_asis.lyt` both thread this map
through, so the CLI runner and the codegen agree on what's waived and
why. See `encodings/current_row_asis.lyt`'s own header for the two
disclosed L2 sites and [.claude/dispatch-reports/lyt-constants-swap-build.md](../../.claude/dispatch-reports/lyt-constants-swap-build.md)
for the divergence-report evidence this baseline produced.
