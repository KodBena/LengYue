# Nav-algebra fix — build report (2026-08-06)

FIX/BUILD dispatch per ledger rows 483/494/497 (commission text in
the dispatch header). Diagnosis read in full first:
`.claude/dispatch-reports/nav-algebra-diagnosis.md`. All claims below
are **WITNESSED** (command output shown/summarized) unless marked
otherwise.

Worktree: `.claude/worktrees/nav-algebra-fix`, branch
`bork/fix/nav-algebra-fix`, head commit `d7720697`. No push. No
production process/port touched (no dev server, no browser — the
logic is pure and the gates are build/lint/test only, per the
dispatch's explicit "no live/browser verification required" waiver).

## What changed

`frontend/src/engine/navigator.ts`:

1. **`findNearestFork`** — the fork-selection loop now starts its
   `children.length > 1` test at the cursor's **parent**, never at the
   cursor itself. Old code tested `nodeId` on iteration 1 before ever
   walking to an ancestor; new code always walks up one level first.
   This is the root-cause fix for defects 1 (self-fork misidentifies
   the breadth frame) named in the diagnosis.
2. **`navigateVariation` / `navigateToggleMainLine`** — both now
   return a `BranchSwitchOutcome` (`{ok:true}` or
   `{ok:false, reason:'no-fork'|'out-of-range'}`) instead of `void`.
   The bounds check at the former `navigator.ts:277` (no `else`
   branch — a silent no-op) is fixed by making the failure case an
   explicit, named return rather than falling through.

`frontend/src/composables/useNavigation.ts`:

3. `variation`/`toggleMainLine` capture the `BranchSwitchOutcome` from
   inside `mutateBoard`'s callback (the callback's own return value is
   discarded by `mutateBoard`, so a local closure variable carries it
   out) and surface a `false` outcome via `pushSystemMessage('info', …)`
   — the loud-feedback idiom every other user-facing no-op in this
   codebase uses (`sgf-loader.ts`'s throw → catch → `pushSystemMessage`
   chain is the closest architectural precedent: **every**
   `pushSystemMessage` call site in the repo lives in a composable /
   service / component, never in `src/engine/` — grep-verified, 60+
   call sites, zero in `src/engine/`). `navigator.ts` therefore stays
   Tier-1 pure (no DOM, no fakes, no service import — `frontend/tests/
   CLAUDE.md`'s Tier-1 boundary), reporting the fact; the composable
   layer decides how to surface it, matching the established split.

`frontend/src/locales/en.json`:

4. Two new keys, `nav.branchSwitchNoFork` / `nav.branchSwitchBoundary`
   (added to `en.json` only — the three CJK catalogs ship `{}` and
   fall back to `en` by design, per `src/i18n/index.ts`'s own header
   comment; this is the established pattern, not a shortcut).

## Truth-table diff (defect rows, before → after)

All against **fixture A** (the maintainer's exact shape: `M1` forks
into main-line `A→A2` and branch `B`, where `B` is *itself* a fork
into `B0`/`B1`) from the diagnosis, ported verbatim into
`navigator-algebra.test.ts`.

| # | Scenario | Before (diagnosis, WITNESSED) | After (this fix, WITNESSED) |
|---|---|---|---|
| 1 | Standing exactly on `M1`, right | → `B` ("correct by coincidence" — self-check happened to match) | Loud no-op, `{ok:false, reason:'no-fork'}` — standing exactly on a fork has no ancestor frame above it to switch within (closure law: you're not *in* a line yet) |
| 2 | Standing on `B` (self-forking branch head), right | → `B1` (a **child** of `B` — depth-as-breadth, complaint **(b)**) | Loud no-op, `{ok:false, reason:'out-of-range'}` — `B` is resolved in `M1`'s frame, where `B` is the *last* child |
| 3 | Standing on `B`, left | Silent no-op, cursor unchanged (complaint **(c)**) | **Succeeds**, lands on `A` (unvisited main-line head) — L3 orientation now reachable |
| 4 | `B` →right→`B1`→left | → `B0`, NOT back to `B` (complaint **(a)** verbatim) | Right from `B` no longer succeeds at all — the complaint's own first step is foreclosed |
| 5 | `A2` →right→`B`→left | Stays at `B` (no return) | `A2`→`B`(unvisited head)→`A2` — exact L1 round trip |
| 6 | Visit `B1`, return to `A2`, right | → `B1` directly, skipping `B` | **Unchanged** — this is L5 memory (adjudicated-correct, option 3 leaves it intact), not a defect |
| 7 | Toggle (`u`) at `B` | Never reaches main line `A` | Reaches `A` — toggle shares the same parent-first fork walk |

Fixture B (cousins, non-self-forking branch head `Y`) rows B1-B3 are
**unchanged** — they were already correct pre-fix (proof the bug was
specific to a *self-forking* branch head, not branch heads generally)
and stay green under the new walk. WITNESSED via
`navigator-algebra.test.ts`'s `TRUTH TABLE` describe blocks (18
tests, all passing).

## Law → test name

| Law | Test(s) |
|---|---|
| L1 — memory-qualified inverse | `property: L1 — memory-qualified inverse …` (8 seeds); truth-table row 5 (`A2`↔`B` round trip) |
| L2 — closure over branch identity | `property: L2 — closure over branch identity …` (8 seeds); truth-table row 6 (memory-deep landing still within the chosen branch's subtree) |
| L3 — orientation | `property: L3 — orientation …` (visits `fork.children[]` in array order, asserts overrun is a loud no-op) |
| L4 — identity-with-feedback | `property: L4 — a no-op never mutates the cursor or any board field` (8 seeds); every no-op test in `navigator.test.ts` now asserts the returned `BranchSwitchOutcome` |
| L5 — memory write-through | `property: L5 — memory write-through invariant …` (8 seeds) |

Regression locks (maintainer's three verbatim complaints), each named
for the complaint it closes, in `navigator-algebra.test.ts`'s
"regression locks" describe block:
- **complaint (a)** — "right takes the right child [B1], then left
  takes the LEFT child [B0]"
- **complaint (b)** — depth-as-breadth at a self-forking branch head
- **complaint (c)** — silent no-op instead of orienting to the main
  line (both halves: the reachability fix AND the independent L4
  loudness contract)

## Loud-feedback idiom followed

Surveyed the codebase (`grep -rn "pushSystemMessage(" src`, 60+ call
sites) before choosing where to wire this in: **every** call site is
in a composable, service, or component — never in `src/engine/`. This
matches `sgf-loader.ts`'s own documented pattern (throw at the pure
layer → `pushSystemMessage` at the two user-facing composable callers)
for the analogous "pure engine signals, composable surfaces" split.
So `navigator.ts` returns a typed `BranchSwitchOutcome`; the new
`surfaceBranchSwitchNoOp` helper in `useNavigation.ts` calls
`pushSystemMessage('info', i18n.global.t(key))` on a `false` outcome —
console-only was explicitly ruled insufficient by the dispatch, and
this is user-visible via the existing system-log surface
(`SystemLogPanel.vue`), the same channel `sgf.saved` /
`sync.workspaceLoaded` and every other transient-log notice uses.

## Gates (WITNESSED, run in the worktree)

```
$ npm run build
✓ 1096 modules transformed.
✓ built in 2.09s
(chunk-size warning is pre-existing, unrelated to this change)

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  109 passed | 3 skipped (112)
      Tests  1411 passed | 4 skipped (1415)
```

## Per-claim evidentiary status

- **WITNESSED**: both root-cause fixes land as described; the 11
  diagnosis truth-table rows behave exactly as predicted post-fix
  (18 ported tests green); the three regression locks pass; all five
  laws hold under 8-seed property testing (54 tests in
  `navigator-algebra.test.ts`, all green); build/lint/test:run all
  green; no `fast-check` dependency exists in this repo (checked:
  `package.json` and `node_modules` both absent it) so a hand-written
  seeded generator (`nav-tree-generator.ts`, `mulberry32`, no
  `Math.random`) was used per the dispatch's fallback instruction.
- **UNEXERCISED**: no live/browser verification was performed — the
  dispatch explicitly waived it for this logic-only change. The
  `nav.branchSwitchNoFork`/`nav.branchSwitchBoundary` system messages
  have not been visually confirmed to render correctly in
  `SystemLogPanel.vue` (only that `pushSystemMessage` is called with
  the right arguments, unit/integration-level).
- **Self-reported note (point 13 convention)**: none of this dispatch's
  own subagent-usage token counts are being ledgered here — this
  report was produced directly by the dispatched build agent, not via
  a further sub-dispatch.

## Final summary

Branch: `bork/fix/nav-algebra-fix`, head `d7720697`, worktree
`.claude/worktrees/nav-algebra-fix`. Both located defects fixed
(parent-first fork walk; loud `BranchSwitchOutcome` on every no-op).
Truth table ported and flipped to the lawful outcome; property tests
for all five adjudicated laws (L1-L5) added over a seeded, dependency-
free tree generator; regression locks for the maintainer's three
verbatim complaints added. Gates: `npm run build` ✓, `npx eslint .` ✓
(clean), `npm run test:run` ✓ (1411 passed, 4 pre-existing skipped, 0
failed). No push performed; no live/browser verification performed
(waived by the dispatch).
