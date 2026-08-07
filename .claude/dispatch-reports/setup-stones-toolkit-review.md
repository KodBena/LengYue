# Fresh-context review: setup-stones-toolkit (ledger rows 603/604)

Branch `bork/feat/setup-stones-toolkit`, head `a90ecee9`, reviewed in an
independently-verified worktree at `/tmp/omega-setup-stones-toolkit` (a
genuine `git worktree`; confirmed via `git worktree list` and
`git rev-parse --show-toplevel`). No content from the builder's report was
taken on trust — every claim below was independently re-derived.

## VERDICT: ACCEPT-WITH-NITS

Two required pre-merge nits (both concrete, both cheap — see below). The
data-layer work, the SGF round-trip, the toggle-semantics fix, the
click-toggle palette, and the review-grading isolation are all WITNESSED
sound. The gap is a persistence/cleanup-registry omission (nit 1) and an
ADR-0002 loudness gap on the disclosed analysis seam, refined by the
maintainer's own protocol-doc adjudication (row 622) into a smaller,
concretely-actionable fix (nit 2).

---

## Required pre-merge nits

### Nit 1 (BLOCKING) — `useSetupTools.ts`'s workspace-reset handler is not guaranteed to register in production, and the census test was not updated to catch it

`src/store/teardown-registrations.ts` is this codebase's explicit,
documented single-side-effect-import bootstrap: its own header states
plainly that "nothing else forces the owners' module init to run" and that
an owner missing from this file has its teardown handler "silently
absent" — the exact defect class `tests/integration/
teardown-registry-completeness.test.ts` exists to catch, by asserting the
COMPLETE expected `registeredWorkspaceResetLabels()` set against the real
bootstrap.

The builder's report claims: "Released on `resetWorkspace` via a
registered `registerWorkspaceResetHandler`... Registered once at module
init, mirroring every other owner in this file's import." This is not
accurate as shipped:

- WITNESSED: `grep -n "useSetupTools" src/store/teardown-registrations.ts
  tests/integration/teardown-registry-completeness.test.ts` returns
  nothing — `useSetupTools.ts` is imported by neither the bootstrap nor
  named in the census test's expected label array.
- WITNESSED: `npx vitest run tests/integration/
  teardown-registry-completeness.test.ts` passes (4/4) on this branch —
  it passes not because the new handler is proven present, but because
  the census test never loads `useSetupTools.ts` in the first place (it
  imports *only* the bootstrap file), so `'setup-tools:close-palette'`
  never enters `registeredWorkspaceResetLabels()` and the un-updated
  expected array matches by omission on both sides. The test is silently
  blind to this handler, precisely the failure mode its own header names.

In production, the handler likely still registers today because
`BoardWidget.vue` and `SetupToolPalette.vue` import `useSetupTools.ts` at
module scope, and those SFCs are presumably in the eagerly-loaded bundle.
But that is exactly the accidental, timing-dependent path the
bootstrap+census-test discipline was built to eliminate — it is silent
today and would stay silent if a future refactor code-splits either
component, or if `resetWorkspace` is ever reachable before any board view
has rendered. A stale armed setup tool surviving an identity flip is
low-severity (UI-only mis-arm, not a data leak), but the omission is the
same *shape* of defect this registry exists to make impossible to miss.

**Fix** (small, mechanical): add `import '../composables/board/
useSetupTools';` to `src/store/teardown-registrations.ts` (DEFAULT band,
alongside the other order-independent owners), and add
`'setup-tools:close-palette'` to the expected array in
`registeredWorkspaceResetLabels()` in
`tests/integration/teardown-registry-completeness.test.ts`. Re-run that
suite to confirm it then genuinely proves the registration, not merely
tolerates its absence.

### Nit 2 (BLOCKING) — ADR-0002 loudness gap on the mid-tree-setup analysis seam, scoped per the maintainer's protocol-doc adjudication (ledger row 622)

The builder's disclosed finding — that `getInitialStones`/
`buildMovesAndTurnIndex` silently drop mid-tree AB/AW/AE from what KataGo
analyzes — is real and pre-existing (confirmed: `git blame` on
`getInitialStones`'s "Mid-tree setup... is out of scope" comment dates to
`3be6ed081` / 2026-04-30, well before this branch). It is not a
regression this branch introduces. But per the coordinator-supplied
KataGo protocol context (row 622), the seam splits into three cases with
different verdicts, and this branch's own architecture already resolves
two of them cleanly:

1. **Root-level setup (the handicap case — this feature's strategic
   purpose).** WITNESSED correct, not a missing wire-up:
   `getInitialStones` (`src/engine/util.ts`) reads `AB`/`AW` off
   `state.nodes[state.rootNodeId]` directly, and `analysis-service.ts`
   calls it and splices the result into the wire query as
   `initialStones` at both of its query-building sites (lines 663/797 and
   944/1034). `applySetup` on a freshly-loaded board (current node =
   root) writes exactly the properties `getInitialStones` reads. Existing
   coverage: `tests/unit/engine/util.test.ts` already tests
   `getInitialStones`. No fix needed here — the maintainer's docs-cited
   case (1) is already correctly wired, both before and after this
   branch.
2. **Mid-tree setup with later moves.** Genuinely unrepresentable
   faithfully in the wire protocol (no insert-at-move-k primitive) —
   confirmed by tracing `buildMovesAndTurnIndex`, which only collects
   `node.move` along the analyzed path, so a moveless AB/AW-only node
   contributes nothing to `moves`. Per the maintainer's adjudication (row
   622), the honest treatment is flattening with a loud one-time notice,
   never silence. **This notice does not exist today**, and this branch
   is what makes the gap UI-reachable by an ordinary user (previously
   only reachable by hand-authoring an SGF with mid-tree AB/AW). This
   matches ADR-0002 Rule 3 almost exactly ("a silently-returned wrong
   number is the worst case... because it surfaces as a plausible
   result") — an analysis panel showing confident winrate/score numbers
   computed on a board state that silently excludes stones the user can
   see on the board is exactly the class of failure the tenet forbids,
   and it is genuinely cheap to close: `analysis-service.ts` already
   imports and uses `pushSystemMessage` for an analogous one-time
   advisory (the ponder-ceiling notice, same file, ~line 1346), and
   `buildMovesAndTurnIndex` already walks `pathPrefix` node-by-node — a
   check for "does any non-root node in `pathPrefix` carry `AB`/`AW`/`AE`
   with no `move`" is a same-shaped, small addition at the existing
   `analyzeRange` call sites (lines ~661/944), not a redesign. This does
   NOT snowball into client-side query re-basing (the deferred, correctly
   out-of-scope fix) — it is strictly a notice, not a correctness change.
3. **Positions with no history (root-only, no moves).** Docs-sanctioned
   `initialStones`-only representation; already the shape case (1)
   produces. No further action.

**Fix required before merge**: add a one-time `pushSystemMessage`
('warning') at the `analyzeRange` call site(s) when a moveless setup-only
node is detected in the analyzed path, naming the limitation in the
message text (e.g. "This analysis excludes mid-game setup stones the
engine's protocol cannot represent after the first move"). If the
maintainer prefers this land as its own immediately-following commit
rather than blocking this branch, that is an acceptable variant IF it is
ledgered as a `blocks-close`-dependent follow-on item opened before this
branch merges — a bare "named future seam" prose note in this report is
not sufficient per row 622's adjudication that silence here is not
acceptable.

---

## Scrutiny findings, each WITNESSED / REFUSED-AS-EXPECTED / UNEXERCISED

**1. Dormant `applySetup` primitive, and the toggle-bugfix.**
WITNESSED. `git grep -n "applySetup" bc565beb -- frontend/src` (merge-base
of this branch against `next`) returns only the definition in
`logic.ts`, a doc-comment mention in `thumbnail-render-resources.ts`, and
a doc-comment mention in `types/game.ts` — zero call sites, confirming
"caller-less at HEAD" as claimed. `applyMarkup` did not exist at all at
that revision. Round-trip constructed independently: loaded a fresh SGF,
applied `applySetup`/`applyMarkup` (AB/AW/TR, including mid-tree on an
already-played-move node), serialized via `serializeBoard`, reloaded, and
diffed — all preserved correctly (this exercises the same path the
builder's own new `sgf-writer-setup-roundtrip.test.ts` covers; read in
full and independently re-derived, not merely trusted).

The toggle-bugfix claim was independently reproduced: reverted
`effectiveColor` back to the raw `color` parameter in a scratch copy of
`src/logic.ts`, re-ran `tests/unit/logic-setup.test.ts` — the
"same-color toggle removes the stone" test failed for exactly the stated
reason (`expected 'B' to be undefined, received "B"` — a same-color
re-click does not clear the point). Restored the file; suite green again.
WITNESSED, no discrepancy from the builder's claim.

**2. Setup-vs-move semantics, adversarial.**
WITNESSED via `tests/unit/logic-setup.test.ts`'s "places a setup stone
that a SUBSEQUENT MOVE can capture" test (independently read and traced
through `applyGoMove`'s capture logic, which operates uniformly over
`state.stones` with no setup/move distinction — a setup stone is
captured identically to a placed one). Illegal setup positions (a
surrounded dead group, a suicide shape): confirmed by code trace that
`applySetup` never calls `validateMove` — it writes directly to
`state.stones`/`node.properties` with no legality check, so an illegal
setup position is silently accepted and does not crash, matching classic
editor behavior (Sabaki/q5go/cgoban all permit illegal setup) — this is a
genre-appropriate choice, not a silent-wrong-result violation, since no
plausible-looking wrong *number* results — the board simply shows what
was placed, honestly. Setup on a node with an already-played move: the
builder's choice (allowed, mutates whichever node is current, no new
child, no refusal) is exercised directly by
`sgf-writer-setup-roundtrip.test.ts`'s "preserves setup edits applied on
a NON-ROOT (mid-tree) node" test and documented in `applySetup`'s doc
comment with the genre-survey justification (no reference editor refuses
this). Adequately documented and witnessed.

**3. Palette state machine.**
WITNESSED. `grep`ed `SetupToolPalette.vue` for `mouseenter`/hover
triggers — none; the trigger button's only interaction is `@click`. ESC
handling (`onKeydown`) explicitly does not touch `anyModalOpen` — read in
full, confirmed a plain local `document`-level listener installed only
while `paletteOpen`, same shape as `LocalePicker.vue`. Closing-deselects
is asserted directly by `tests/integration/useSetupTools.test.ts`'s first
two tests (`togglePalette` close path and `closePalette` ESC/outside-click
path), both independently re-run and green.

Review-grading gate bypass: `BoardWidget.vue::onBoardClick` calls
`setupTools.applyToolAt(x, y)` and returns *before* `emit('move', x, y)`
when a tool is armed — confirmed by direct read of the function (lines
268-271). `useBoardMoveRouting.ts` (the grading gate, confirmed by
`grep`: `reviewSession.state.value === 'AWAITING_MOVE'` lives only there)
is driven exclusively off the `move` emit chain, which a setup click
never reaches when a tool is armed. This is a structural guarantee (an
early return, not a conditional check that could be bypassed), so
"cannot leak into review grading" holds by construction. One soft gap
noted but not blocking: there is no integration test that explicitly
drives a live `AWAITING_MOVE` review session, arms a setup tool, clicks
the board, and asserts the review session's state is untouched — the
guarantee rests on reading the two call sites rather than a dedicated
regression test. Given the early-return structure makes the two code
paths genuinely disjoint (not merely coincidentally non-interacting), I
do not treat this as blocking, but flag it as a cheap test worth adding
if the maintainer wants the belt-and-braces version — UNEXERCISED as a
dedicated test, WITNESSED as a structural guarantee by code reading.

**4. KataGo silent-drop seam.** See "Nit 2" above — this supersedes the
brief's original framing with the coordinator's row-622 refinement.
Pre-existing confirmed via `git blame` (comment dates to `3be6ed081`,
2026-04-30). Root-level case verified correct and wired (no fix needed);
mid-tree case requires the loud notice as a blocking pre-merge nit, per
the maintainer's own adjudicated disposition.

**5. ESLint allowlist entry (`local/board-mutation-entry-point`).**
WITNESSED, genuinely disciplined. The new `useSetupTools.ts` entry's
one-line reason ("setup-toolkit edit... not a user MOVE, no grading
applies") is consistent with the surrounding allowlist's existing
entries (read the full block: `useReviewSession.ts`, `useEngineResponder
.ts`, `usePlayFromPosition.ts`, `loadIntoBoard.ts`) and matches the
architecture confirmed under point 3 — the write flows through
`updateBoardState`, the same channel `applyGoMove`'s callers use, and the
gate this rule polices (`useBoardMoveRouting.ts`) is a different,
disjoint call path. Persistence: setup edits ARE persistence-relevant
(the game tree persists), and the builder's claim that no new
`sync-session-version.test.ts` coverage was needed holds — `updateBoardState`
bumps `boardsVersion`, a channel that suite's existing "board MUTATE
schedules a save" case already generalizes over; confirmed by reading
`useSetupTools.ts::applyToolAt`, which calls `updateBoardState` and
nothing else for persistence purposes. No gap here.

**6. Teardown registry.** See Nit 1 above — this is the one genuine
defect found.

**7. Standing checks.** `grep`ed the full diff for `waitForTimeout` /
`chromium` — none. i18n keys: `npx vitest run tests/unit/
i18n-messages-compile.test.ts` (the all-keys compilation tripwire) —
WITNESSED green (13 passed / 1526 skipped, i.e. ran only the relevant
suite; the keys `toolbar.setupToolkit.{button,tooltip,stoneBlack,
stoneWhite,triangle}` are present in `en.json` and compile). ADR-0004
proportionality: diff is scoped to the setup-toolkit's own new files plus
minimal, well-justified touches to `BoardDisplay.vue`, `BoardWidget.vue`,
`Toolbar.vue`, `eslint.config.js`, `engine/util.ts`, `engine/
constants.ts`, `logic.ts`, `FILES.md` — no drive-by unrelated edits
found. No migrations touched (`CURRENT_SCHEMA_VERSION` untouched, per
grep). `FILES.md` diff (checked directly) is accurate and complete for
every new/changed file this branch touches.

**8. Gates, in the worktree, merged against CURRENT `next`.**
`next` had moved two commits ahead of this branch's merge-base
(`git log --oneline bc565beb..next`): `8fc9dd81` (reset buttons stop
using `--border-2` as background) and `9391f8f8` (PBO Bookmarks new-btn
surface-0 background) — both style-only, unrelated to this branch's
files. Trial-merged `next` into the branch worktree with `git merge --no-commit
--no-ff next`: **clean, zero conflicts** (only pre-existing files
touched by the style commits — `MatchPlayerOverridesConfig.vue`,
`PerQueryOverridesConfig.vue`, `VisitsLerpConfig.vue`,
`QeuboBookmarks.vue` — none overlapping this branch's files). On the
merged tree:
- `npm run build` (`vue-tsc -b && vite build`): **WITNESSED green.**
- `npx eslint .`: **WITNESSED green**, no output/errors.
- `npm run test:run`: **WITNESSED green** — 120 files / 1535 tests
  passed, 3 files / 4 tests skipped, 0 failures. Matches the builder's
  claimed count exactly.

---

## Summary

The data layer is sound and independently re-verified, not merely
trusted: the caller-less-primitive claim, the SGF round-trip, the
toggle-bugfix (reproduced red-then-green myself), and the
grading-gate-bypass architecture all hold up under adversarial retest.
The click-toggle palette genuinely does not use hover, and ESC correctly
bypasses the modal stack as intended. The two required nits are concrete
and small: (1) wire `useSetupTools.ts` into the production teardown
bootstrap and its census test, which currently passes by never observing
the new handler rather than by proving it; (2) add the one-time
`pushSystemMessage` advisory for the mid-tree-setup-dropped-from-analysis
case, per the maintainer's own row-622 adjudication that root-level setup
is already correctly wired (no fix needed there) but the mid-tree lossy
case may not ship silent.
