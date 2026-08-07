# Branch/variation-navigation algebra — diagnosis + draft (2026-08-06)

READ-ONLY diagnosis per ledger row 483. No production code touched. All
claims below are WITNESSED (vitest output shown) or UNEXERCISED (marked).
Law read in full before this diagnosis: ADR-0000, ADR-0002, ADR-0008,
ADR-0021 (`/home/bork/w/vdc/1/autoharn/law/adr/`), `frontend/CLAUDE.md`,
`.claude/dispatch-reports/branch-switch-semantics-build.md`,
`.claude/dispatch-reports/branch-switch-review.md`.

## 0. Key-to-operation mapping (pinned first, per dispatch instructions)

Source: `frontend/src/composables/keybindings-catalog.ts` (defaults),
wired through `frontend/src/composables/useNavigation.ts` into
`frontend/src/engine/navigator.ts`.

| Default key | Action id | Handler | Navigator function |
|---|---|---|---|
| `ArrowUp` | `nav.prev` | `nav.prev` | `navigatePrev` — depth, to `curr.parent` |
| `ArrowDown` | `nav.next` | `nav.next` | `navigateNext` — depth, to `curr.children[activeChildIndex]` |
| `ArrowLeft` | `nav.variationPrev` | `() => nav.variation(-1)` | `navigateVariation(state, -1)` |
| `ArrowRight` | `nav.variationNext` | `() => nav.variation(1)` | `navigateVariation(state, 1)` |
| `u` | `nav.toggleMainLine` | `nav.toggleMainLine` | `navigateToggleMainLine(state, mainLineToggleMemory)` |

So the maintainer's "left/right arrow" complaint is unambiguously
**`navigateVariation`** (breadth), never `navigateNext`/`navigatePrev`
(depth) — those are Up/Down and are not implicated in any of (a)/(b)/(c).
`navigateVariation` and `navigateToggleMainLine` are the two operators
under diagnosis; both route through the shared `findNearestFork` →
`switchToBranch` → `resolveBranchTarget` pipeline
(`frontend/src/engine/navigator.ts:162-237`).

## 1. Truth table — WITNESSED via vitest driven directly against navigator.ts

Method: `navigator.ts` and `sgf-loader.ts` are pure TS (no Vue import,
grep-verified). Ran a scratch vitest config
(`/tmp/.../scratchpad/vitest.scratch.config.mjs`, node environment, no
jsdom/Vue needed) against a scratch test file
(`/tmp/.../scratchpad/nav-truth-table.test.ts`) that imports
`navigateTo`/`navigateVariation`/`navigateToggleMainLine` directly from
the repo's `src/engine/navigator.ts` and builds fixtures with `loadSgf`
(same loader production code uses). **11/11 tests passed** — every
prediction below is the code's actual, current behavior, not a
hypothesis.

### Fixture A — the maintainer's exact shape

```
R
 └─ M1 (fork, 2 children)         [B[pd]]
     ├─ A  (main line, 1 child)   [W[dp]]
     │    └─ A2 (leaf)            [B[qq]]
     └─ B  (branch head AND itself a fork, 2 children)  [W[pp]]
          ├─ B0 (leaf)            [B[dq]]
          └─ B1 (leaf)            [B[fq]]
```

`B` is exactly the maintainer's "a node that is a parent of two children
and is itself a sibling of the main line."

| # | Start | Op | Result | Laws violated |
|---|---|---|---|---|
| 1 | M1 | right (`variation(1)`) | → **B** (unvisited memory ⇒ branch head) | — (correct: this is the baseline breadth move) |
| 2 | **B** | right (`variation(1)`) | → **B1** (a CHILD of B) | **L2 closure** (depth move where a breadth move was requested) — this is complaint **(b)** |
| 3 | **B** | left (`variation(-1)`) | **no-op**, cursor unchanged, **no feedback of any kind** | **L3 orientation** (should move toward main line A) + **L4 identity/feedback** (ADR-0002: silent no-op) — this is complaint **(c)** |
| 4 | B → right → **B1** → left | (`variation(-1)` from B1) | → **B0**, NOT back to B | **L1 inverse** — this is complaint **(a)** verbatim: *"right takes the right child [B1], then left takes the LEFT child [B0]"* |
| 5 | A2 → right → **B** → left | (`variation(-1)` from B) | stays at **B** (no-op, per row 3) — does not return to A2 | **L1 inverse** |
| 6 | visit B1 (writes memory), return to A2, then right from the M1 fork | (`variation(1)`) | → **B1** directly (skips B entirely) | **L2 closure** — a "switch sibling line" op lands two generations deep; this is where memory (L5, adjudicated-correct) and closure collide — **the crux**, see §4 |
| 7 | B, toggle (`u`) | `navigateToggleMainLine` | → **B1** (never reaches the main line A at all) | Same defect as row 2 — toggle shares `findNearestFork`, so it inherits the identical self-fork misidentification |

### Fixture B — deeper tree with cousins (control fixture, isolates the bug's true trigger)

```
R
 └─ G1 (fork, 2 children)                    [B[pd]]
     ├─ X (main, 1 child)                    [W[dp]]
     │    └─ X1 (fork, 2 children)           [B[qq]]
     │         ├─ X1a (leaf)                 [W[jj]]
     │         └─ X1b (leaf)                 [W[kk]]
     └─ Y (branch head, NOT itself a fork — 1 child only)  [W[pp]]
          └─ Y1 (leaf)                       [B[dq]]
```

| # | Start | Op | Result | Notes |
|---|---|---|---|---|
| B1 | X1a | right | → X1b | Correct local sibling-cycling at a genuine two-generations-down fork — not itself buggy in isolation. |
| B2 | Y1 (child of non-fork branch head Y) | left | → **X** (branch head; unvisited) | Correct: `findNearestFork` walks past Y (1 child) up to G1, matching L2/L3. |
| B3 | **Y** (branch head, NOT itself a fork) | left | → **X** | **Contrast case.** Y occupies the identical structural role as B in fixture A (a branch head that is a sibling of the main line) but has only one child. The bug does **not** reproduce here. This isolates the true trigger precisely to "branch head that also happens to be a fork" — confirming the root cause is the self-vs-ancestor ambiguity in `findNearestFork`, not something about branch heads generally. |

## 2. Root cause, at file:line

**Single root cause for (a) and (b):** `findNearestFork`,
`frontend/src/engine/navigator.ts:162-169`:

```ts
function findNearestFork(state: BoardState, nodeId: NodeId): GameNode | null {
  let node = state.nodes[nodeId];
  for (;;) {
    if (node.children.length > 1) return node;   // line 165 — SELF-CHECK FIRST
    if (!node.parent) return null;
    node = state.nodes[node.parent];
  }
}
```

The loop's first iteration tests `nodeId` **itself** before ever
considering an ancestor. This conflates two genuinely different
questions that "am I at (or near) a fork?" can mean:

- **Breadth frame** ("which sibling-line am I currently in, and what are
  its neighbours?") — the frame `navigateVariation`/
  `navigateToggleMainLine` actually need, always answered by an
  **ancestor** fork (the fork whose children the current line descends
  from).
- **Depth frame** ("do I, right here, have more than one way to go
  deeper?") — a fact about the node's own children, irrelevant to a
  breadth operator.

Because the self-check runs first, any node that is simultaneously (i) a
branch head chosen at some ancestor fork and (ii) itself a fork
(`children.length > 1`) gets exclusively the depth-frame answer. The
ancestor fork that the breadth operator actually needs is never reached
— `findNearestFork` returns on iteration 1 and the `for(;;)` loop's
ancestor-walking branch (`node = state.nodes[node.parent]`) never
executes. Fixture B's contrast case (row B3) proves this precisely: the
identical branch-head position with 1 child instead of 2 does *not*
trigger the bug, because the self-check fails on iteration 1 and the
loop actually walks to the ancestor.

`switchToBranch` (`navigator.ts:234-237`) and `resolveBranchTarget`
(`navigator.ts:207-221`) — the shared landing-selection primitives — are
NOT implicated; they correctly compute a target once handed a
(fork, targetIdx) pair. The defect is entirely upstream, in which fork
gets handed to them.

Both call sites inherit the defect identically:
- `navigateVariation`, `navigator.ts:274` — `const fork = findNearestFork(state, state.currentNodeId);`
- `navigateToggleMainLine`, `navigator.ts:325` — same call, same argument.

This is why row 7 (toggle at B) reproduces the identical wrong landing
as row 2 (variation at B): the shared primitive was the maintainer's
own explicit "share exact same semantics" requirement, correctly
implemented for the landing logic — but it also faithfully propagates
the upstream fork-selection bug to both operators, undiminished.

**Second, independent root cause for (c):** `navigateVariation`,
`navigator.ts:273-280`:

```ts
export function navigateVariation(state: BoardState, direction: number) {
  const fork = findNearestFork(state, state.currentNodeId);
  if (!fork) return;
  const targetIdx = fork.activeChildIndex + direction;
  if (targetIdx >= 0 && targetIdx < fork.children.length) {
    switchToBranch(state, fork, targetIdx);
  }
  // no else — an out-of-range targetIdx is a silent no-op
}
```

Line 277's bounds check has no `else` branch. ADR-0002 rung 4 ("logged
warning / surfaced diagnostic — appropriate for 'this shouldn't happen,
but the run can continue'") is the floor for any op whose precondition
fails; this falls straight to rung 5 (silent fallback/default, here
degenerating to a silent identity) with no justification on file. At
`B` in fixture A, this compounds with the first root cause: `fork` is
resolved to `B` itself (wrong frame, `B.activeChildIndex` defaults to
`0` at construction — `sgf-loader.ts:160`), so `left` computes
`targetIdx = -1`, fails the bounds check, and the operation vanishes
with zero trace. Two defects stack at exactly this one call to produce
complaint (c)'s specific symptom: wrong frame chosen (so orienting
toward the main line is structurally impossible — M1 is never even
looked at) **and** the wrong frame's own failure is invisible.

`findNearestFork` walking the wrong direction on the *first* iteration
is also the reason **the toggle's memory can drift silently**: `key =
\`${state.id}::${fork.id}\`` (`navigator.ts:328`) is keyed off whatever
`fork` was misresolved to, so a toggle sequence performed while
standing at a self-forking branch head writes toggle history against
the wrong fork identity — an under-exercised secondary consequence, not
separately witnessed above (flagged for the maintainer's awareness,
UNEXERCISED as its own row).

## 3. Draft algebra for adjudication

### Operators

- `depthStep(dir: +1|-1)` — `navigateNext` / `navigatePrev`. Unaffected
  by this diagnosis; already closed and invertible along any fixed root
  path (walking `parent`/`children[activeChildIndex]` is a true
  bijection between adjacent tree levels). Kept out of the algebra below
  except as a boundary case.
- `variationStep(dir: +1|-1)` — `navigateVariation`. Under diagnosis.
- `toggleStep()` — `navigateToggleMainLine`. Under diagnosis; per the
  maintainer's binding prior adjudication, shares `variationStep`'s
  fork-selection and landing rule exactly (only its target-index
  selection policy differs — plain ±1 vs. two-value memory).

### The fix the truth table implies (stated as a law, not as code)

**Fork selection must walk from the cursor's PARENT, never test the
cursor itself.** I.e. `findNearestFork`'s loop should begin its
`children.length > 1` test at `node.parent`, not at `node`. This one
change is sufficient to eliminate both root causes' shared trigger:

- A node that is itself a fork (ready to be entered depth-wise) no
  longer masquerades as its own breadth frame — `variationStep` at such
  a node now correctly uses the SAME ancestor fork it would use one
  step earlier or later in the same line (fixture A's `B` would resolve
  to `M1`, exactly as fixture B's non-forking `Y` already does today —
  row B3 is the existing-correct behavior this fix generalizes to `B`
  too).
- Depth movement (`depthStep`, entering B's own children) remains
  `navigateNext`'s job, never `variationStep`'s — the two concerns
  become structurally incapable of being confused (ADR-0000: the type/
  shape, not a downstream guard, forecloses the class).

This single change resolves complaint **(b)** outright (no more
depth-as-breadth), resolves complaint **(c)**'s "wrong frame" half (left
from `B` now correctly considers `M1`, so orienting toward the main line
becomes reachable), and narrows complaint **(a)** from "returns to a
sibling of where I started" down to the memory tension discussed in §4.

Complaint (c)'s other half — **silent no-op** — needs its own,
independent fix: `variationStep`'s failed-bounds-check branch must fire
an ADR-0002 rung-4-or-stronger signal (at minimum a `console.warn`
naming the fork and the exhausted direction, mirroring
`resolveBranchTarget`'s existing pruned-memory warning at
`navigator.ts:213-217`; a UI-visible toast/flash is a defensible
stronger choice but is a UI-layer decision outside this diagnosis's
navigator-only scope).

### Laws (refined by what the truth table showed)

- **L1 — Inverse (qualified).** `variationStep(-dir)` immediately after
  `variationStep(dir)` returns to the same **branch** always. It returns
  to the exact same **node** only if no navigation touched that branch's
  `lastVisitedDescendant` between the two steps. *Justification:* a
  strict, unqualified inverse law is incompatible with the maintainer's
  own binding adjudication that switching restores "the actual last
  node visited" (memory, L5) — see §4. Stating L1 as a conditional
  identity is the honest law; testing it as an unconditional one would
  either falsify a real, sanctioned feature (memory) or falsify the law
  itself.
- **L2 — Closure over branch identity, not over depth.** Every
  `variationStep` moves the cursor's **branch membership** (which child
  of the governing fork the cursor's line descends through) by exactly
  one position; it never depends on how many children the CURRENT
  branch head itself has. *Justification:* this is the corrected,
  precise form of "never move to a direct child/parent" — the truth
  table's row 6 shows the literal tree-depth of the landing node can
  legitimately differ from the branch head's depth (memory), so
  "constant generation" (the originally-suspected form of L2) is too
  strong; "constant branch-choice, at a fork found by walking from the
  cursor's PARENT" is the form that survives the memory feature.
- **L3 — Orientation.** Sibling order at any fork is the fixed,
  structural `GameNode.children` array order (index 0 = the branch SGF
  encodes first — the conventional "main line" position). `left`
  (`dir=-1`) always decreases index, `right` (`dir=+1`) always
  increases it, at whichever fork `findNearestFork` (parent-walking
  form) resolves. *Justification:* this requires no new state — it
  already holds structurally today; the bug was never in the ordering,
  only in which fork's ordering got consulted (§2).
- **L4 — Identity-with-feedback.** An op with no valid target (no fork
  found; `targetIdx` out of range) is a no-op that surfaces an
  ADR-0002-compliant signal naming the reason, never a bare `return`.
  *Justification:* ADR-0002 rung 4 is the floor for "this shouldn't
  happen but the run continues" — a boundary-clamp is exactly that
  case, and it is currently rung 5 (silent) with no exception on file
  (none of ADR-0002's three named exceptions — bit-identical fallback,
  idempotence, bounded compat shim — applies to a plain arrow-key
  boundary clamp).
- **L5 — Memory.** `switchToBranch`/`resolveBranchTarget`'s existing
  behavior (land on the target branch's `lastVisitedDescendant`,
  falling back loudly to the branch head) is UNCHANGED by this draft —
  it is the maintainer's own prior, binding adjudication, and no defect
  in the truth table traces to it directly. It is the *source* of the
  L1 qualification, not itself defective.

### The crux tension — L1 vs. L5, option space

Row 6 is the sharpest specimen: switching from the main line to branch
`B` at fork `M1`, having previously visited `B1`, lands on `B1` — two
generations below the branch head `B` that `L2`'s "branch identity"
reading would naively suggest is the landing target. This is **not** a
bug per the maintainer's binding ruling (memory is intentional and
correct); it is the genuine, honest tension the maintainer's own two
adjudications place on each other: "switching restores the actual last
node visited" (memory) vs. "no rhyme or reason... mathematical
simplicity and discipline" (algebraic law). Three resolution options,
justified and ranked:

1. **Memory only on `toggleStep`; `variationStep` always lands exactly
   on the branch head, ignoring `lastVisitedDescendant`.** Makes
   `variationStep` a true, unconditional involution — L1 holds without
   qualification for it. *Cost:* directly reopens the maintainer's own
   explicit prior ruling ("toggle and previous/next-variation share
   EXACT same semantics") — this option requires the maintainer to
   revise that ruling, not just accept a bugfix. Not recommended as a
   silent choice; only viable if raised to the maintainer explicitly.
2. **Memory consulted only on first entry into a branch since the last
   time the cursor left it via a DIFFERENT fork; an immediate reversal
   ignores memory and returns to the exact departure node.** Restores
   unconditional L1 for the common "step, changed my mind, step back"
   case while preserving memory for genuine cross-session or
   cross-navigation re-entry. *Cost:* a second piece of memory state
   (a "where did the last variationStep leave from" back-pointer,
   structurally similar to `mainLineToggleMemory`'s own two-value
   history) with its own lifetime/invalidation questions (does entering
   via `nav.next`/`nav.prev` invalidate it? does it survive a tab
   switch?) — genuinely new scope, not a narrow bugfix, and itself a
   new classification question under ADR-0008 (what event invalidates
   the back-pointer needs its own honest vocabulary, not a closest-fit
   guess).
3. **Accept L1 as conditional (the qualified form stated above) and
   test it as such.** No code or memory-model change beyond the two
   `findNearestFork`/feedback fixes in §3. *Cost:* the maintainer's
   "mathematical simplicity" ask is only partially met — the law that
   ships is an "if-clean, then-inverse" law, not a bare inverse law.

**Recommendation: option 3 as the adjudicated baseline**, because it
requires no reopening of the maintainer's existing binding memory
ruling, it is the cheapest to implement and to state precisely, and it
is honestly testable via property-based tests over arbitrary trees (see
below) without inventing new state whose own semantics would need a
fresh round of adjudication. Option 2 is worth flagging to the
maintainer as a genuine UX enhancement ("undo my last branch-switch
exactly") but should be its own ledgered work item if wanted, decided
on its own merits, not bundled into the fork-selection bugfix. Option 1
is not recommended without an explicit maintainer decision to revise
the toggle/variation parity ruling.

### Property-based test shape (for whichever option is adjudicated)

Over arbitrary trees (generated with bounded branching factor and
depth):
- **L2/L3 (always testable, no memory involved):** for any node `n` and
  any fork `F` found by the parent-walking `findNearestFork` from `n`,
  `variationStep(+1)` then `variationStep(-1)` (or vice versa) from `n`
  — with `lastVisitedDescendant` untouched between the two calls (a
  "clean" round trip) — returns to `F`'s child that `n` descends
  through, exactly. This is a strict, unconditional property today
  after the §3 fix and should be the first property-test written.
- **L4:** for any node `n` with no valid fork or an exhausted direction,
  `variationStep` leaves `state.currentNodeId` unchanged AND a
  fail-loud signal (spy-observed `console.warn` call, or whatever
  channel is adjudicated) fires exactly once. Per ADR-0021 Rule 2, this
  is a negative claim ("no silent no-op") converted to a positive
  tripwire observation — a spy on the warn channel, not "the test still
  passes."
- **L1 (qualified):** generate a random walk of `depthStep`/
  `variationStep` calls; after any subsequence that is exactly
  `variationStep(dir)` immediately followed by `variationStep(-dir)`
  with no intervening call, assert branch-identity return always, and
  assert exact-node return additionally whenever no OTHER navigation
  wrote to the target branch's `lastVisitedDescendant` in between (this
  side-condition is checkable directly against the fixture, since the
  test controls every navigation call in the walk).

## Summary

Two independent, precisely-located defects share one trigger condition
("branch head that is itself a fork") and together produce all three
complaints:

1. `findNearestFork` (`navigator.ts:162-169`) tests the cursor itself
   before any ancestor, so a branch head with its own children gets
   treated in the depth frame instead of the breadth frame it needs for
   `navigateVariation`/`navigateToggleMainLine` — root cause of
   complaints **(a)** and **(b)**, and of half of **(c)**.
2. `navigateVariation`'s bounds check (`navigator.ts:277`) has no
   `else`, so an exhausted direction is a silent no-op with zero
   ADR-0002-compliant feedback — root cause of the other half of
   **(c)**.

The crux for adjudication: complaint **(a)**'s inverse-law expectation
is in genuine, honest tension with the maintainer's own binding prior
ruling that branch-switching restores the actual last-visited node
(memory). The draft algebra above resolves the two located defects
outright (parent-first fork walk + loud no-op) and recommends stating
L1 as a memory-qualified law (option 3 of three) rather than reopening
the toggle/variation-parity ruling, pending maintainer adjudication.

Report path: `/home/bork/w/omega/.claude/dispatch-reports/nav-algebra-diagnosis.md`.
Scratch witness files (not committed, per this dispatch's read-only
scope): `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/nav-truth-table.test.ts`
and its `vitest.scratch.config.mjs`.
