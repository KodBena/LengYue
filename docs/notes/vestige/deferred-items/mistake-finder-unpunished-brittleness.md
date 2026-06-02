# Mistake-finder un-punished-flag brittleness

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `mistake-finder-unpunished-brittleness` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='mistake-finder-unpunished-brittleness'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-28.
- **Concern:** The un-punished red-flag heuristic in
  `useMistakeFinder` (Stage 2 of the mistake-finder substrate)
  uses a per-board quantile threshold (default worst 15%) to
  decide what counts as a mistake, then flags consecutive
  user-mistake → opponent-mistake pairs as un-punished. In a
  clean game with few real mistakes, the worst-15% bracket
  pulls in marginal moves that aren't mistakes in any absolute
  sense; a marginal move followed by a marginal opponent move
  then surfaces as a false-positive un-punished red flag.
- **Surfacing case (2026-05-28, project author, verbatim):**
  > there's a "not-really-a-mistake" that is marked as a
  > flagged mistake because the opponent didn't play as the
  > neural net wanted on the follow-up. In reality, my move
  > was the second preferred move for the weakest net, the
  > preferred for the strongest net, and the opponent played
  > the second-preferred move for the strongest net. So, it
  > is brittle, but that is expected — after all, it's an
  > under-explored area of knowledge acquisition.
- **Why deferred:** detecting mistakes in Go from a single
  net's terminal eval is the brittle special case, not a
  fix-able bug in the heuristic. The substrate already has —
  or is queued to grow — the equipment a future de-brittling
  arc would draw from. Stage 2's scope was to land the
  consumer-side substrate honestly; de-brittling is its own
  arc with its own design question.
- **Avenues to revisit (none on the critical path; pick
  whichever the surfacing case justifies):**
  1. **Absolute-severity floor alongside the quantile.** A
     move qualifies only if oriented-delta crosses both the
     per-board quantile AND a palette-specific absolute
     magnitude. Cheap; modest improvement; doesn't address
     marginal cross-net mistakes.
  2. **Cross-net agreement via SELECTOR routing.** The
     surfacing example is a cross-net divergence: weak-net
     and strong-net disagree on the move's ranking. The
     SELECTOR capability shipped on the proxy side (v1.0.15+);
     a frontend extension would issue parallel queries to a
     labelled model pool and treat agreement as a confidence
     signal. Substantial cross-team arc.
  3. **Within-position stability.** The stability-surface arc
     (`stability-surface-design-space.md`) is a different axis
     (V-axis within a single net's search trajectory) but
     composes: a marginal-call mistake by a single net's
     terminal eval might be unstable across V, which the
     stability surface would surface. A future un-punished
     gate could require both moves to be stably-bad.
  4. **Cross-palette agreement.** A move that quality_delta,
     scoreLead_loss, and rank_quality all flag is more
     credible than one only flagged by quality_delta. No new
     substrate; a multi-palette consumer over the existing
     per-palette outputs.
- **Glossary note (terminology surfaced in the same exchange):**
  the closest standard label for the broader question is
  *applied epistemology*; skill-domain corners include
  *deliberate practice* (Ericsson, Chase & Simon),
  *calibration* (Lichtenstein–Fischhoff, Tetlock),
  *performance epistemology* (Sosa), and chess's
  *centipawn-loss analysis* for engine-substantiated error
  attribution. The Go-equivalent vocabulary has not
  crystallised; the palette substrate is the surface where it
  would.

---

License: Public Domain (The Unlicense).
