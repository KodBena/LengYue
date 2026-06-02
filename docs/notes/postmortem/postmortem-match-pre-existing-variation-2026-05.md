# Postmortem — `playEngineMatch` correctness under pre-existing forward variation

- **Date filed:** 2026-05-15
- **Status:** Both bugs fixed and merged (PRs #243, #244). Postmortem
  authored same-day, but *reactively* — only after the project
  author surfaced the question of documentation discipline, not at
  the moment of the fix. The reactive authoring is itself one of
  the items this postmortem treats; see §6.
- **Audience:** Author + LLM collaborators. Focus is on operational
  rigor proportionality, audit triggers, and the bug-class
  prevention; not on blame.
- **Scope:** `playEngineMatch` (and its sibling `playEngineMoves`)
  in `frontend/src/composables/board/usePlayFromPosition.ts`. Two
  distinct bugs, both latent for many consumers but surfacing only
  when an engine-vs-engine match is started at a cursor position
  that has pre-existing forward variation past it.

---

## 1. What happened

Two bugs, independent in mechanism but both arising under the same
trigger condition (cursor != active-variation leaf at match start):

**Bug A — iteration termination counted path-length growth instead
of iterations** (PR #243). The `while` loop in `playEngineMatch`
terminated when `getActiveVariationPath(board).length >=
startPathLength + numMoves`. But `applyGoMove` *descends into a
matching pre-existing child* when the engine's top move duplicates
an existing variation node — descent leaves the path length
unchanged. So when the user started a match at ply 37 in a tree
already extending to ply 148, the loop silently descended 111
plies (each iteration still consulting KataGo at full
per-side `maxVisits`) before counting *any* move toward the
user's requested `numMoves`, then created the requested fresh
nodes. A request for 20 moves played 131 plies forward.

**Bug B — query construction used root → leaf, not root →
current** (PR #244). `buildAnalyzeQuery` took the moves list
from `getActiveVariationPath(board)` — root → active leaf — when
constructing the analysis query. KataGo therefore evaluated the
position *at the leaf*, not at the cursor, and returned the top
move for the wrong board state. `applyGoMove` then played that
wrong-position move against the cursor's actual position.
Manifested as "first match move wrong, succeeding moves alright":
after the first non-matching apply, the active variation collapsed
to root → current and subsequent queries happened to use the
correct `expectedTurn` by accident.

Both bugs shipped to `main` and went unreported for the entire
post-v1.0.0 cycle. Neither would have been observable in any
automated test or by anyone who didn't manually start a match
from a mid-tree cursor.

## 2. Why undetected

Five independent paths could have surfaced these bugs; none did:

1. **E2E test coverage** (`tests/e2e/`). `playEngineMoves` has
   harness coverage but the harness always starts from fresh
   boards — `current == leaf` is universally true at the start
   of every e2e fixture. The bugs' trigger condition is
   `current != leaf`, which the harness never constructs.

2. **Review-session SR consumer**. Spaced-repetition cards are
   loaded by `useReviewSession.loadCard` against SGFs that the
   review machinery navigates to the *last node* (current ==
   leaf) before any analysis fires. Bug B's wrong-position
   evaluation would have manifested if SR ever fired
   `playEngineMoves` from mid-tree, but it does not.

3. **Autonomous-SR loop**. The auto-SR loop generates positions
   by `playEngineMoves` from a fresh / empty board. `current ==
   leaf` again — there is no pre-existing future variation
   past the cursor.

4. **SELECTOR-role demo verification**. The project author
   verified the SELECTOR demo via GPU telemetry — confirming
   the multi-weights dispatch landed the right queries on the
   right upstream LEAFs. Game-correctness was not part of the
   verification surface. Wrong moves played for the right
   reason (the wire dispatch was correct; the moves were not)
   would have shown identical GPU telemetry to right moves.

5. **Project-author personal use**. The match system was a
   stepping-stone for SR / auto-SR development plus a
   SELECTOR-role demo, not a personal-use feature. Match SGFs
   were never visually replayed; the author had no
   habitual-use trigger that would have surfaced the move-
   correctness gap.

Each of those five paths is individually rational. *In aggregate*
they constitute a feature surface that ran autonomously,
consumed real engine cycles, and had no organic observer.

## 3. Why this is concerning

Three properties of the bug compound:

**Automaticity.** The match system runs unattended once started.
A user clicks MATCH, sets a move count, and walks away. The
loop fires real KataGo queries on a real GPU. There is no
per-move review step that would surface a wrong move.

**Resource consumption.** Each iteration of bug A's silent
descent consulted KataGo at full per-side `maxVisits`. A user
requesting 20 moves at 1000 visits/move could see the engine
spin through 131 queries × 1000 visits = 131 000 visits — six
times the intended workload — without any UI indication of
the excess. On a shared SELECTOR upstream, this wastefully
contends with other consumers.

**Low detectability.** Bug B's wrong-position evaluation produces
*plausible-looking moves*. A first-move wrong choice at ply 38
isn't obviously broken to the eye — Go positions tolerate many
reasonable openings. The author noticed only because they
happened to compare the played move to the move-suggestions
"blue spot" at the same visit budget; without that overlap, the
bug could have run indefinitely.

The combination of (autonomous + resource-consuming + hard to
detect by casual observation) is the failure mode worth naming
specifically: features in this combination silently consume the
user's machine and the user's trust, and trust erodes faster than
discovery.

## 4. Root-cause analysis

The two bugs share one underlying confusion: **two helpers with
similar names mean different things, and call sites choose by
intuition rather than by type-enforced intent.**

- `getActiveVariationPath(board)` (`engine/util.ts`): walks
  `currentNodeId` forward along `activeChildIndex` to the
  variation's leaf, then back to root. Returns root → leaf.
- `getPath(nodes, targetId)` (`engine/navigator.ts`): walks
  `targetId` back to root via `parent`. Returns root → target.

For "what moves has the engine seen?", the correct answer is
root → currentNodeId (use `getPath`). For "what does the active
variation as a whole look like?" the correct answer is root →
leaf (use `getActiveVariationPath`). Both are legitimate
questions; both helpers are correct in isolation.

`buildAnalyzeQuery`'s docstring read "evaluate this position at
the next turn." The phrase "this position" is locally ambiguous
between the cursor's position and the variation's terminal
position. Without a formal contract, the author who wrote
`buildAnalyzeQuery` reached for the first path-traversal helper
that came to mind. The choice happened to be wrong, and the
mistake was invisible in every test the harness exercised
because every test placed the cursor at the leaf.

Bug A is a separate but adjacent confusion: the termination
condition expressed in terms of *path-length growth* implicitly
assumed each iteration grew the path by 1. `applyGoMove`'s
dedup-into-existing-child behaviour breaks that assumption, but
the assumption was never written down — it was inferred from
"each turn plays a new move," which is true only when no
existing children match.

## 5. Recommendations

Organized by scope; pick by appetite. None of these are urgent in
isolation; together they reduce the recurrence probability.

### 5a. Specific to the match system (smallest scope)

The match system remains a stepping-stone / demo feature. With
the two fixes landed, the bug is closed. **No further investment
warranted** — but document the contract that the fixes now
satisfy, so a future contributor can't quietly regress them:

- A two-line docstring on `playEngineMatch` saying "plays
  exactly `numMoves` engine turns from `currentNodeId`,
  regardless of whether each move dedups into existing
  variation children or creates fresh ones."
- A docstring on `buildAnalyzeQuery` naming the path as
  root→currentNodeId explicitly and warning future readers off
  `getActiveVariationPath` for the same role.

These are tiny; landing them as a follow-up minor doc PR is
fine. (Not done in this PR; flagging as the lightest concrete
next step.)

### 5b. Specific to the bug class (medium scope) — audit `getActiveVariationPath` uses

The two bugs both arose from confused use of one helper. Other
call sites may carry the same latent confusion. Concrete audit:

1. Grep every site that calls `getActiveVariationPath`.
2. For each, name explicitly what the consumer wants: root → leaf
   (e.g., chart x-axis, full SGF export) or root → current (e.g.,
   "what moves has the engine seen?", "what move-numbers should
   I render up to here?").
3. Where root → current is the right answer, replace with
   `getPath(board.nodes, board.currentNodeId)`.

The audit itself is the deliverable; the per-site changes are
mechanical once intent is named.

Optional intensification: introduce branded path types
(`RootToLeafPath`, `RootToCurrentPath` — branded `NodeId[]`)
so the type system catches the mismatch at compile time.
ADR-0001-shaped substrate addition; lightweight; not urgent
until a third site of this confusion class surfaces.

### 5c. Meta — rigor proportionality framework (largest scope)

The author's framing was sharp: *not all features are owed the
same level of rigor by nature of their scope, and it strikes me
that this is the kind of meta one should audit for.* This
postmortem proposes a four-axis rubric for the audit. The
rubric is the artifact; whether and where it's formalised
(ADR? handoff section? doc-graph standalone?) is the author's
call.

The four axes, scored high / low per feature:

| Axis | Question | High = more rigor |
|---|---|---|
| **Autonomy** | Does this run unattended once started? | yes |
| **Resource consumption** | Does it spend GPU cycles, network, money, or wall-time the user can't easily afford to waste? | yes |
| **Detectability** | Can a casual observer notice an error from the rendered output? | no |
| **Reversibility** | Can an error be undone after the fact? | no |

A feature high on Autonomy + Resource and low on Detectability +
Reversibility belongs in the **rigor-warranted** bucket: deserves
explicit contracts, dedicated tests covering its actual usage
shape (not just the happy path), telemetry-detectable
invariants, and an explicit declaration of the conditions under
which it has been validated.

A feature high on Detectability and Reversibility, low on
Autonomy and Resource, belongs in the **YAGNI bucket**: ship
quickly, iterate based on observation, no formal spec needed.

Examples from this codebase, scored against the rubric:

| Feature | Autonomy | Resource | Detectability | Reversibility | Bucket |
|---|---|---|---|---|---|
| Match system | high | high | **low** | medium | **rigor-warranted** ⚠ |
| Auto-SR loop | high | high | medium | high | rigor-warranted (lighter) |
| Review session SR | medium | low–medium | high | high | YAGNI-ish |
| Toolbar slider popover | low | none | high | high | YAGNI |
| Cadence-knob defaults | low | low | high | high | YAGNI |
| KataGo first-report floor | low | low | medium | high | YAGNI for the SPA-side; rigor-warranted for the *upstream report* (and is being treated that way — full reproducer package staged) |

The match system scored as rigor-warranted but was treated as
YAGNI. The discrepancy between the rubric's verdict and the
treatment is the actionable signal. Two bugs shipping into a
feature that, by the rubric, deserved a contract document and
dedicated tests is exactly the failure mode the rubric is
designed to surface earlier.

**The audit trigger.** When adding a feature that touches
analysis-service queries, automated SR loops, autonomous engine
consultation, or any background service that runs unattended:
score it on the four axes. If the score lands in the
rigor-warranted bucket, the PR's "What this arc does NOT close"
section names what level of rigor was actually delivered, so a
future reader can compare against the rubric and surface the
gap.

This is the smallest discipline change that would have
prevented this postmortem: a single rubric-score line in the
match system's original PR would have made it visible that the
delivered rigor (zero tests, single docstring) did not match
the warranted rigor (contract + tests + telemetry).

## 6. The documentation-discipline gap

The two bug fixes (PRs #243, #244) shipped with diagnosis arcs
in their commit messages and PR bodies, but no worklog entry
and no postmortem. The umbrella `CLAUDE.md`'s "Documentation
is part of the work" section names this as an incomplete
delivery — code-only PRs with documentation implications are
not done.

The gap surfaced because the project author asked. The healthy
shape would have been: at the moment of writing the fix, the
LLM collaborator drafts the worklog entry, asks "is this the
right scope of doc?", and either writes the postmortem inline
or names it as a follow-up. Reactive postmortems are weaker
than concurrent ones — the diagnosis is fresher, the lessons
are more honest, and the documentation graph stays current.

This postmortem and its sibling worklog
(`docs/worklog/2026-05-15-match-pre-existing-variation-fixes.md`)
close the local gap. The broader lesson is the §5c audit-trigger
recommendation applied to documentation itself: a fix that
exposes a *class* of bug (not just an instance) warrants a
postmortem; a fix that's confined to a single function
warrants a worklog at minimum.

## 7. Cross-references

- PR #243 — `frontend(fix): playEngineMatch — count iterations,
  not active-path-length growth`. Bug A's fix.
- PR #244 — `frontend(fix): buildAnalyzeQuery uses root→current
  path, not root→leaf`. Bug B's fix.
- `docs/worklog/2026-05-15-match-pre-existing-variation-fixes.md`
  — sibling worklog recording the arc.
- `frontend/src/composables/board/usePlayFromPosition.ts` —
  `playEngineMatch`, `playEngineMoves`, `buildAnalyzeQuery`.
- `frontend/src/engine/navigator.ts` — `getPath(nodes, targetId)`.
- `frontend/src/engine/util.ts` — `getActiveVariationPath(board)`.
- `frontend/src/logic.ts::applyGoMove` — dedup-into-existing-child
  behaviour underlying bug A.
- ADR-0002 (fail loudly) — applies to the "silent wrong-move
  played at full visits" failure mode: a feature that wastes
  resources without surfacing the waste is the silent-failure
  mode the tenet forbids.
- ADR-0005 (documentation discipline) — applies to §6's
  acknowledgment that the worklog and postmortem were authored
  reactively rather than concurrently. Rule 6 (author as you
  decide) is the rule the gap violated.

## License

Public Domain (The Unlicense).
