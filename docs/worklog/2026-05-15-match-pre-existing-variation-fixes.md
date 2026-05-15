# `playEngineMatch` — two bugs surfaced and fixed under pre-existing forward variation

- **Status:** Both fixes landed (PRs #243, #244). Postmortem filed
  separately at `docs/notes/postmortem-match-pre-existing-variation-2026-05.md`
  — it carries the analysis, the audit trigger, and the rigor-
  proportionality rubric proposed in §5c.
- **Genre:** Bug-fix arc. No new feature surface; no new
  substrate; no migration.
- **Date:** 2026-05-15.

## Context

The project author surfaced two anomalies in engine-vs-engine
matches started inside a pre-existing forward variation (cursor
mid-tree, with the active variation extending past it):

1. "20 moves from ply 37 → 38…168" — match advanced the cursor
   by 131 plies instead of the requested 20.
2. "First match move wrong, succeeding moves alright" — the
   first move played by the engine didn't match the live ponder
   overlay's top recommendation; subsequent moves did.

Both reproduced reliably. Both went unobserved through the
entire post-v1.0.0 cycle because every prior consumer of
`playEngineMatch` / `playEngineMoves` happened to start from
`currentNodeId == leaf` — the case where the bugs are
equivalently invisible.

## What changed

### PR #243 — `playEngineMatch` iteration counter

`while`-loop termination tested for active-path-length growth
past a target. `applyGoMove` descends into a matching
pre-existing child without growing the path, so descents (each
consulting KataGo at full `maxVisits`) silently ran through the
existing tree before counting any move toward `numMoves`.
Replaced with an explicit `movesPlayed` counter.

### PR #244 — `buildAnalyzeQuery` root → current

Query `moves` list constructed from `getActiveVariationPath`
(root → leaf). KataGo evaluated the leaf's position rather than
the cursor's, returning a top move for the wrong board state;
`applyGoMove` then played that move at the cursor. Replaced
with `getPath(board.nodes, board.currentNodeId)` so the
analysis query matches the position the engine actually plays
from.

The two PRs touch the same file but different functions; no
textual conflict, merge in either order.

## Why this arc warranted a postmortem

The fixes themselves are small (one iteration counter, one
import + one path-helper swap). The diagnosis arc and the
*class* of bug — semantic confusion between root→leaf and
root→current path helpers, latent across multiple consumers,
surfacing only under a specific cursor condition — warrants
analysis beyond what fits in a PR body. The sibling postmortem
records:

- Why five independent paths failed to surface the bug class
  (test fixtures all use `current == leaf`; SR / auto-SR
  consumers happen to align with the lucky case; SELECTOR-role
  demo verified wire dispatch, not move correctness; the match
  system had no organic observer).
- Why the combination of automaticity + resource consumption +
  low detectability is the failure-mode class worth naming
  separately.
- A four-axis rigor-proportionality rubric (Autonomy / Resource /
  Detectability / Reversibility) as a proposed audit trigger
  for future features. The match system scores rigor-warranted
  by the rubric but was delivered as YAGNI-grade; that
  mismatch is the actionable signal.

## What this arc does NOT close

- **Audit of all `getActiveVariationPath` call sites** for
  latent confusion of the same class. Recommended in postmortem
  §5b; not done in this arc. A grep + per-site intent-naming
  pass is the natural shape.
- **`playEngineMoves` regression test** against a hand-built
  multi-ply tree with the cursor mid-line. Both fixes are now
  load-bearingly trivial — a single targeted Tier-3 integration
  test would lock the contract against future re-introduction.
  Not done in this arc; recommended if the bug class recurs.
- **Branded path types** (`RootToLeafPath` vs `RootToCurrentPath`).
  Type-system enforcement of the path-traversal intent at call
  sites. Premature today per ADR-0003 (N=2 use case is on the
  threshold; defer until a third site of confusion surfaces).
- **Match-system docstring tightening** to explicitly name the
  contract the fixes now satisfy ("plays exactly `numMoves`
  engine turns from `currentNodeId`; `buildAnalyzeQuery`
  evaluates at `currentNodeId`, never at the active-variation
  leaf"). Recommended in postmortem §5a as the lightest
  follow-up; landing it as a minor doc PR is fine.
- **Formal adoption of the rigor-proportionality rubric**
  (postmortem §5c). The rubric is proposed; whether to
  formalise it as an ADR amendment, a handoff section, or a
  standalone doc-graph entry is the project author's call.

## The reactive-authoring issue

This worklog and the sibling postmortem were authored *after*
the fixes shipped, in response to the project author surfacing
the documentation-discipline question. Per ADR-0005 Rule 6
("documentation lifecycle — author as you decide"), the
concurrent shape would have been: draft the worklog at the
moment of the first fix, decide whether the bug class warrants
a postmortem before merging, write whichever is appropriate.

This is recorded explicitly in postmortem §6 — the gap itself
is one of the lessons. Future fixes in the same class should
have their worklog drafted alongside the PR body, with the
postmortem decision made before the first merge.

## Cross-references

- `docs/notes/postmortem-match-pre-existing-variation-2026-05.md`
  — sibling postmortem with the analysis, the rigor-rubric
  proposal, and the documentation-discipline acknowledgment.
- PR #243 — `frontend(fix): playEngineMatch — count iterations,
  not active-path-length growth`.
- PR #244 — `frontend(fix): buildAnalyzeQuery uses root→current
  path, not root→leaf`.
- `frontend/src/composables/board/usePlayFromPosition.ts` — the
  fixed file.
- `frontend/src/engine/navigator.ts` — `getPath`'s canonical home.
- `frontend/src/engine/util.ts` — `getActiveVariationPath`'s
  canonical home; the helper the bugs both misused.
- ADR-0002 (fail loudly) — applied to the "wasted GPU cycles
  without surfacing" failure mode.
- ADR-0005 (documentation discipline) — applied to §"The
  reactive-authoring issue" above.

## License

Public Domain (The Unlicense).
