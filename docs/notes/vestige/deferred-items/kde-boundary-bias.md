# KDE boundary bias for bounded-support palettes

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `kde-boundary-bias` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='kde-boundary-bias'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-28.
- **Concern:** The Stage 3 distribution primitive uses standard
  fixed-bandwidth Gaussian KDE, which exhibits well-known
  *boundary bias* near the edges of a bounded support. For
  palettes whose `delta_fn` output lives on a known compact
  interval — `quality_delta` and `rank_quality` are both [0, 1]
  — the estimated density visibly extends past the support
  boundary (the project author observed nonzero density at
  x < 0 on the [0, 1]-supported quality palette). The Gaussian
  kernel has infinite support; each sample's kernel "leaks"
  mass across any bounded edge, biasing the density downward
  at the boundary itself and producing a cosmetic tail outside.
- **Surfacing question (2026-05-28, project author, verbatim):**
  > Density shows negative for this [0,1] quantity. So then
  > naturally the question becomes whether it's possible to
  > constrain the shape of the estimated density (including
  > derived uncertainty estimates? or maybe not?) if the range
  > is e.g. known to be compact (as here — it's actually an
  > exponentially smoothed visit ratio so that could tell us
  > even more I suppose) or the distribution is having certain
  > known moments or functionals etc etc.
- **Why deferred:** functional impact today is cosmetic. The
  integral over the displayed range slightly exceeds 1 by the
  leaked mass (typically <5% for moderate sample sizes); the
  density curve is readable near boundaries with the
  understanding that the tail extending past the support is a
  smoothing artefact, not a probability statement. Stage 3's
  scope was the generic distribution primitive, not per-palette
  KDE specialisation.
- **Disciplined approaches (rough order of complexity):**
  1. **Reflection method** (Schuster 1985; Silverman 1986
     §2.10). For each sample s and boundary a, add a reflected
     kernel contribution at 2a − s; same for the upper
     boundary. Effectively folds the leaked mass back inside
     the support — exactly compensates for the boundary
     loss. Output clipped to the support. ~5 lines in
     `distributions.ts`'s KDE loop; the SE formula needs a
     minor adjustment (the equivalent kernel is no longer
     Gaussian-symmetric near the boundary; effective n at the
     boundary is roughly doubled). Cheapest disciplined fix.
  2. **Boundary kernels** (Müller 1991; Jones 1993). Modified
     kernel near the boundary that integrates to 1 within
     support. More principled, more parameters to choose.
  3. **Transformation method.** Map the support to (−∞, ∞)
     (logit for [0, 1]: u = log(x/(1−x))), run standard KDE on
     the transformed samples, transform back with the Jacobian
     correction. Eliminates boundary bias by construction.
     Composes naturally with the author's observation that the
     quantity is an exponentially-smoothed visit ratio — a
     tailored transformation exploiting the visit-ratio's
     functional form could surface more structure still.
  4. **Beta-kernel KDE** (Chen 1999). Beta-distribution kernels
     are naturally [0, 1]-supported — no boundary correction
     needed. Cleanest match for the specific case but doesn't
     generalise to other supports.
- **Substrate shape if implemented:** add a per-palette
  `support?: [number, number]` field to `AnalysisPalette`
  (parallel to `delta_ordering`), threaded through to the KDE
  consumer. Only the bounded-support palettes (quality, rank)
  declare it; score-loss palettes leave it unset. The KDE
  variant of DistributionChart accepts a `support` option and
  applies the chosen method (reflection is the recommended
  default given its complexity / benefit ratio). Upper-bound
  band clipping at the support edge is a natural companion:
  a ±1.96·SE band reaching above 1 on a [0, 1] support is
  honestly informative ("the curve estimate has more
  uncertainty than the support's full width") but visually
  conflates with the (true) fact that density can exceed 1 on
  bounded intervals, so clipping to the support per convention
  is the safer call.

---

License: Public Domain (The Unlicense).
