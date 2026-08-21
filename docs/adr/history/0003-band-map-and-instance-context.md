*Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
`law/adr/0003-domain-coupling-bands.md` at commit
`ff691bb9bc430ad497d74ff82d580f758a969f99` under
`design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
retro-edited; the lessons these records teach live as rules in the parent ADR.*

# chocofarm's instance map — the worked example ADR-0003 abstracts

This file holds three passages moved out of ADR-0003 by the portability refactor: the
project's own domain-coupling narrative, its three-band map with the two porting
inventories, and the audit evidence backing the "caution" horn of the extraction-timing
tradeoff. All three are chocofarm-specific (they cite `FFXIII`, `chocofarm`, and
project file paths) and are preserved here verbatim rather than deleted, per
`law/adr/history/README.md`'s Extraction Pointer convention.

## The chocofarm Context (instance narrative)

chocofarm exists to compute optimal gil farming in FFXIII, formalized as
adaptive stochastic orienteering under partial observation (a belief-state
MDP). That is two facts glued together: a *specific game* (FFXIII chocobo
treasure digging, with concrete treasure coordinates, teleports, and
detection geometry) and a *general OR problem class* (belief-MDP, Dinkelbach
renewal-rate optimization, orienteering). The codebase mixes both, and the
mix is not uniform: some modules know about treasure coordinates and the CSNE
teleport; some speak only in beliefs, worlds, and rates; some don't care
which problem they're solving at all.

Two prospective futures make the coupling worth mapping honestly:

1. **A different OR problem** (a different orienteering/belief-MDP instance —
   not FFXIII at all). What would survive? The belief mechanics, the
   Dinkelbach loop, the orienteering/route machinery, the solvers, the
   AlphaZero stack, the dual bound — all of it is problem-class machinery, not
   FFXIII machinery. Only the instance data and the FFXIII-specific geometry
   would be replaced.

2. **A different game with the same OR shape** (another treasure-hunt-style
   game). The FFXIII coordinates, teleports, and arrangement faces would be
   replaced; the OR machinery and the env/Policy seam would survive.

Without a map, future features can't be honestly designed against the
boundary — and without a principle, the map is just inventory.

## The three bands

The codebase's modules sit on a spectrum.

### Band 1 — Solver-agnostic / the simulation–solver seam

These modules speak in concepts no specific solver and no specific game
needs. The load-bearing instance is the **env/Policy inversion of control**:
`Environment` owns dynamics, belief, and simulation; `Policy` is a thin
injected `decide(env, loc, bw, collected, lam, rng)` seam; `env.py` imports
no solver. A new solution method is a new `Policy` subclass with zero env
edits. This seam is the single hardest architectural decision in the system,
made right (the audit's §1), and it is solver-agnostic by construction: the
env doesn't know whether it's being driven by greedy, ISMCTS, or AlphaZero.

### Band 2 — OR-general (belief-MDP / orienteering machinery)

These modules speak the operations-research problem class, not the FFXIII
instance. They would survive a port to *any* adaptive-stochastic-orienteering
/ belief-MDP problem:

- The **belief mechanics** (the world-set, filtering, marginals) — a
  belief-MDP concept, not an FFXIII one.
- The **Dinkelbach renewal-rate machinery** (`rate`, `dinkelbach_rate`, the
  λ-penalty threaded as a live per-call argument) — the rate-optimization
  abstraction; λ is the OR-general control variable.
- The **orienteering / routing** (`route_time`, `exit_cost`, the
  greedy/CE/rollout/sparse-sampling/UCT/ISMCTS/NMCS solvers) — orienteering
  machinery parameterized by a distance function, not by FFXIII coordinates.
- The **AlphaZero/Gumbel stack** (`az/`), the **provable dual bound**
  (`bounds/`), and the **structural analyzer** (`analysis/`) — all phrased
  over `worlds`, `cover`, `value`, `N`, `K`, never over "treasure 8" or
  "the CSNE teleport."

A different OR instance replaces the data, not this machinery.

### Band 3 — FFXIII-bound

These modules carry FFXIII facts that don't exist outside the game (or carry
FFXIII-specific encodings of general concepts). Porting them is replacement,
not refactoring:

- The **instance data** (`instance.json`, `faces.json`): the 20 treasure
  coordinates, the 3 teleports (CSNE/CSCE/τ_4), the detection-region geometry.
- The **arrangement faces / detector geometry** (`arrangement.py`,
  `facemodel.py`): the planar arrangement of FFXIII's 16 detection polygons
  into 44 atomic faces, the corrected sense model
  (`docs/consults/consult-002-detector-misspec-report.md` §(4)).
- The **instance-loading and geometry tooling** that parses the FFXIII
  GeoGebra/WKT source.

A different game replaces all of this; a different OR problem keeps the
*shape* (an instance file, a distance function, an observation model) but
swaps the contents.

### Band-mixed — the seams

A few modules straddle bands and are where seam-design matters most:

- **`Environment`** is Band 1 in its seam (the env/Policy contract) and Band
  2 in its mechanics (belief, Dinkelbach), but loads Band 3 instance data.
  The copy-on-write `with_scenario`/`restrict` (ADR-0001) are the clean seam
  that keeps the Band-2 machinery sharable across Band-3 instance changes.
- **`features.py` / `actions.py`** are Band 2 (an AZ feature/action encoding
  over a general belief) but their *layout* is derived from the env's
  instance shape (`feature_dim(env)`, `n_action_slots(env)`). The derived-
  dimension discipline is what keeps them instance-agnostic in form while
  instance-sized in fact. (The audit's three-writer FEATURE_LAYOUT finding is
  exactly a case where this seam was not kept clean enough — see ADR-0011.)

## What a different OR problem would actually require

A useful concrete sizing. To retarget chocofarm to a *different*
adaptive-stochastic-orienteering / belief-MDP instance (not FFXIII):

- **Replace** (Band 3): the instance file, the detection geometry, the
  game-specific loader. The observation model would be re-derived for the new
  problem's sensing structure.
- **Keep, parameterized** (Band 2): the belief mechanics, Dinkelbach,
  orienteering, all eight solvers, the AZ stack, the dual bound, the
  analyzer — they are phrased over `worlds`/`value`/`N`/`K`/`cover` and a
  distance function, so a new instance with the same primitives reuses them.
- **No change** (Band 1): the env/Policy seam. A new instance is a new
  `Environment` and the same `Policy` subclasses drive it.

The Band-2 surface is the overwhelming majority of the codebase by line
count, which is *why* this is a research toolkit for the problem class rather
than a single hardcoded solver — and it is so because the env/Policy seam and
the derived-dimension discipline were honored as the code grew.

## What a different game (same OR shape) would require

The inverse partition: replace **only** the Band-3 instance data and
geometry; keep Band 1 and Band 2 entirely. This is the cheaper port, because
the OR machinery is already instance-agnostic — it is the partition the
copy-on-write `with_scenario`/`restrict` seams were built to make cheap.

## The Metz-horn evidence (2026-06-15 audit lesson E)

Sandi Metz's principle applies: *duplication is cheaper than the wrong
abstraction.* An abstraction extracted before a second concrete instance
exists is shaped by speculation and is almost always wrong-shaped. chocofarm
has exactly one game instance and one OR instance today, so the cost-benefit
tilts toward "extract when the second use case exists." The 2026-06-15 audit
makes the same point from the dual direction (its E lesson — abstractions
built then abandoned beside a live inline copy are *worse* than no
abstraction): the `facemodel.SenseAction` object is fully built, documented,
and dead, while the env reimplements it inline. The discipline is not "build
abstractions"; it is "design clean seams and extract only when a second
instance forces it."

## Related

- The parent ADR: [`law/adr/0003-domain-coupling-bands.md`](../0003-domain-coupling-bands.md).
- `law/adr/history/README.md` — this directory's naming and Extraction Pointer
  conventions.
