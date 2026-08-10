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
`.claude/dispatch-reports/lyt-compiler-fix1-build.md`.

## Well-formedness checking scope (L1-L4)

`errors.py`'s `LytLoadError` docstring references "L1-L4" as the laws it
enforces; here is what that actually covers in this prototype, since
neither the code nor this README stated it plainly before the cold
review (`.claude/dispatch-reports/lyt-compiler-cold-review.md`) flagged
the gap:

- **L1** (control stability) is not structurally checked — it quantifies
  over runtime screen-class/toggle/drag states, not static tree shape.
- **L2** (no band of a partition axis reserved for a hide/show affordance
  alone) IS checked, by `wellformed.py`, but only as a local tree-shape
  approximation of the spec's prose law — see that module's docstring for
  the reasoning. Worth stating plainly: the check is easy to defeat. A
  single near-zero non-chrome sibling (as little as 1px, under 4% of the
  wrapped band in the review's witness) is enough to flip the checker's
  verdict from VIOLATION to CONFORMS on a tree that is, geometrically,
  still exactly the kind of reserved-band-for-a-toggle-alone construction
  L2 forbids. Treat a clean L2 pass as weak assurance against adversarial
  or accidental decoys, not a guarantee.
- **L3** (envelope-state coverage) is checked at load time (loader.py).
- **L4** (a slot's extent has at most one writer among {solver constant,
  user drag}) is **entirely unimplemented**. The `drag-persisted` sizing
  keyword parses but is dropped after parsing — never reaching the typed
  AST, the loader, or the compiler. This is a defensible scope call for a
  static, offline solver with no runtime drag state to arbitrate, but it
  means an `.lyt` file with `drag-persisted` gets no enforcement of L4
  from this prototype at all. See `wellformed.py`'s "L4 ACCOUNTING"
  paragraph for the full disclosure.

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
