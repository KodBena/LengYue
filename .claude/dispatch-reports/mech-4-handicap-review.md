# Fresh-context review — mech-4-handicap-affordance

**Artifact reviewed:** branch `worktree-agent-aac2b7ea9c64e189c`, commit `a431d1e3` ("fix+finish(frontend):
handicap affordance test coverage + build fixes"), reachable from the WIP salvage base `6b8f74eb`.
Reviewed from a fresh checkout of the same commit object in an isolated worktree (local branch
`review-mech4-a431d1e3` pointed at `a431d1e3`, no ref shared with the builder's worktree).
Posture: REFUTE. The builder's own self-report (`.claude/dispatch-reports/mech-4-handicap-build.md`)
was **not** read until after all findings below were formed independently.

**Note on report location:** the canonical path
`/home/bork/w/omega/.claude/dispatch-reports/mech-4-handicap-review.md` (the shared checkout)
could not be written from this isolated worktree (harness refusal: "Edit the worktree copy of
this file instead of the shared-checkout path"). This is the fallback location, per the dispatch
brief's own fallback instruction.

## Gate results (witnessed, this session, this worktree)

| Gate | Command | Exit |
|---|---|---|
| Build | `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npm run build` | **0** |
| Tests | `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` | **0** — 1642 passed, 4 skipped, 128/131 test files passed (3 skipped) |
| Lint | `nice -n 19 npx eslint .` (whole repo) | **0** |

## Red-then-green witness

**1. Build-time fix (`HandicapTable.center`'s tuple mutability, the commit's headline claim).**

Reverted the one-line fix (`center: [number, number]` → `center: readonly [number, number]`,
`frontend/src/engine/handicap.ts:66`) and reran the build:

```
RED:  src/engine/handicap.ts(130,37): error TS4104: The type 'readonly [number, number]' is
      'readonly' and cannot be assigned to the mutable type '[number, number]'.
      (+2 more, same code, lines 132/134)  — build exit 2
GREEN: restored the fix — build exit 0, clean `git status` after restore.
```

Confirms the claimed TS4104 regression was real and the fix is both necessary and sufficient.

**2. Load-bearing behavior fix (white-to-move wiring).**

Commented out `rootProps.PL = ['W'];` in `applyHandicap` and reran the two new suites:

```
RED:  5 failed / 42 total — handicap.test.ts "hands the first move to White", the SGF
      round-trip test (missing `PL[W]` in serialized output), and the
      analysis-service-handicap-query "played move" case (initialPlayer undefined
      where 'W' expected).
GREEN: restored the line — 42/42 passed, clean `git status` after restore.
```

Confirms the test suite is not vacuously green — it actually exercises the PL-wiring
the commission required, and a real regression there is caught.

## Findings

**F1 — Placement tables are genuinely convention-correct. WITNESSED, no defect.**
Checked `frontend/src/engine/handicap.ts`'s `HANDICAP_TABLES` against the standard Go
handicap-stone convention (GNU Go/Sabaki/q5go structure — the same one nearly every SGF
generator implements): 19×19 N=2,3,4 = incremental corners; N=5 = 4 corners + tengen;
N=6 = 4 corners + left/right edge stars, **no** tengen; N=7 = N=6 + tengen; N=8 = 4
corners + all 4 edge stars, **no** tengen; N=9 = all 8 + tengen. This is exactly what the
code computes (`handicapPoints`'s switch, cross-checked coordinate-by-coordinate against
the 3-3/9-9/3-9 star-point grid for a 0-indexed, y=0-is-bottom board). The
non-monotonic tengen inclusion (present at 5, absent at 6/8, present at 7/9) is the
correct, well-known quirk of this convention and is explicitly pinned by its own test
(`handicap.test.ts:106`). 13×13 (caps at N=5, corners+tengen) and 9×9 (caps at N=4,
corners only) match common software defaults (Sabaki/q5go both cap smaller boards well
short of 9); this is a documented, not-FF4-mandated choice and is honestly labeled as
such in the module header. No blocker.

**F2 — Engine white-to-move wiring is real, not just a store-side flag. WITNESSED.**
`applyHandicap` writes both `BoardState.turn = 'W'` (live session) and root `PL[W]`
(SGF property). `sgf-loader.ts::loadSgf` now reads `getInitialPlayer` to seed `turn` on
reload (was hardcoded `'B'` before this commission). `analysis-service.ts` reads the same
accessor in **both** `analyzeRange` and `analyzeActiveNode` and includes `initialPlayer:
'W'` on the wire query only when the root says so — confirmed by a real integration test
against the actual `AnalysisService` singleton and a mock WebSocket (not a
unit-level re-derivation), including a negative control (non-handicap board: field
omitted) and a "handicap + one played move" case (moves carry the color directly, root
still needs `initialPlayer` for the turn-0 position `initialStones` describes). Matches
the acceptance item's explicit ask ("engine query carries initialStones — query-builder-
level test, don't assume"). No blocker.

**F3 — SGF round-trip both directions. WITNESSED.** `applyHandicap` → `serializeBoard` →
`loadSgf` preserves `AB[]`, `HA[n]`, and White-to-move (via `PL[W]`). A separate
hand-authored fixture (`HA[2]AB[cg][gc]`, no `PL`) is loaded and asserts `turn === 'B'`
(default) — this is not a bug: SGF FF[4] treats `PL` as the property that names who
moves next, and its absence has no HA-triggered override in this codebase; defaulting to
Black on a genuinely ambiguous foreign file is the conservative, spec-consistent choice,
not a guess. Reasonable.

**F4 — Refusal path is real and caught, not vacuous. WITNESSED (red-then-green, above).**
`applyHandicap` throws `HandicapOnStartedGameError` when `rootNode.children.length > 0`.
Verified `applySetup` (the setup-toolkit's own substrate, `src/logic.ts:53`) mutates
`state.currentNodeId`'s properties **in place** and never appends a child node — so a
board with hand-placed setup stones (via the setup toolkit) but **no moves** still has
`children.length === 0` and handicap is correctly still available; only an actual played
move (`applyGoMove`, which does create a child) trips the refusal. This matches the
acceptance item's exact wording ("loud refusal on a board that already has moves") and
does not over-refuse on setup-only boards. `useHandicap.ts::selectHandicap` catches the
error and turns it into a `pushSystemMessage('warning', …)`, never an unhandled
exception (ADR-0002) — and rethrows anything it doesn't recognize, so a genuine bug isn't
swallowed. No blocker.

**F5 — Komi defaults are ruleset-INVARIANT (0.5 flat), not "per active ruleset" as the
acceptance text literally reads. ADVISORY, not a blocker.** The acceptance item says
"handicap-appropriate default komi per active ruleset (user-editable)." The
implementation (`HANDICAP_KOMI = 0.5`, applied uniformly regardless of which of the four
ratified rulesets is active) documents, in a load-bearing comment, that it deliberately
does *not* vary by ruleset because 0.5 is the near-universal handicap-komi convention
across AGA/Chinese/Japanese/Tromp-Taylor alike, and this codebase's four rulesets don't
actually diverge on it. This is a defensible, genre-correct reading (0.5 handicap komi is
in fact what nearly every Go client uses regardless of scoring system) and it is named as
a considered decision with the rejected alternative stated ("derived per-ruleset") and
why — the CLAUDE.md point-12 shape for a load-bearing decision, even though it lives in a
code comment rather than a ledger row here. It stays user-editable (`StatusBar.vue`'s
komi input, confirmed independent of the ruleset dropdown — see F6). Recommend the
closing item's countersign explicitly note this reading of "per active ruleset" is
accepted, since a literal reading of the acceptance text would expect per-ruleset
variation that does not exist.

**F6 — Changing ruleset AFTER handicap application does not silently mutate komi.
WITNESSED.** Traced `App.vue`'s `handleUpdateRules` (writes only root `RU`) and
`handleUpdateKomi` (writes only root `KM`) — the two handlers are fully independent; a
ruleset change never touches `KM`. So there is no risk of a post-handicap ruleset switch
silently reverting or recomputing komi. Consistent with F5's "komi is only ever a seeded
default, permanently user-owned after that" framing.

**F7 — Re-selection and "setup stones present but no moves" are both correctly handled.
WITNESSED (unit tests + code trace).** Re-picking a different N on an untouched root
replaces the `AB` set (doesn't accumulate) — verified by test and by code (root is
rebuilt from a cleared copy before reapplying `applySetup` per point). A prior
hand-placed `AW`/triangle from the setup toolkit is deliberately preserved across a
handicap re-pick (removal is by decoded AB coordinate, not a blanket stones rebuild) —
this is a real design choice, not incidental, and it is not exercised by a test (no test
places an unrelated `AW` stone, applies handicap, and asserts it survives). Gap noted
below (F9).

**F8 — Toggling a handicap stone off via the setup palette afterward leaves `HA[n]`
stale relative to the actual `AB` count. ADVISORY, out of the commission's explicit
scope, low practical impact.** `applySetup`'s toggle semantics (re-clicking the same
color at an occupied point erases it) apply uniformly to handicap-placed stones, since a
handicap stone is architecturally indistinguishable from any other `AB` stone once
placed (the module header is explicit that this is intentional: "a handicap IS root
setup stones," "no parallel placement mechanism"). Erasing one via the generic palette
does **not** update or clear the root's `HA[n]`/`PL[W]`/`KM` properties — grepped the
whole `src/` tree and confirmed nothing in this codebase currently *reads* `HA` except
`handicap.ts` itself (write-only elsewhere), so this has no live functional consequence
today, but it does mean an exported SGF can end up claiming `HA[4]` while carrying only 3
(or 5, if the user adds an unrelated `AB` stone via the palette) `AB` points — a
downstream tool reading the file would see an internally inconsistent handicap record.
Not in the acceptance criteria's enumerated list, not covered by a test, and the
commission's own placement-table docstring frames "handicap IS setup stones" as the
intentional unification — so this reads as an accepted consequence of the design rather
than an oversight, but it is worth a named ledger row (assumption or decision) rather
than leaving it as a silent implication for a future reader to rediscover.

**F9 — No keybinding/action-id registration, correctly.** Grepped
`src/lib/keybindings.ts` and the composables tree: no handicap action id was added, and
none is needed — the whole affordance is click-only by construction
(`HandicapPanel.vue`'s own header states this explicitly, citing ADR-0019: "click-based,
same as its parent palette... no drag, no hover preview"). Consistent with genre
convention for a setup/config action, not a hotkey-worthy one.

**F10 — i18n.** New keys (`handicapButton`, `handicapTooltip`, `handicapUnavailable`,
`handicapInvalidCount`, `handicapRefusedStarted`) only landed in `en.json`; `ja.json`,
`ko.json`, `zh-CN.json` don't have them. Checked: this is **pre-existing** project state,
not a regression — the entire `toolbar.setupToolkit.*` namespace (added weeks earlier for
the setup toolkit) is already absent from all three other locale files (`grep -c
setupToolkit` returns 0 for all three), so the handicap keys are consistent with how the
rest of that namespace already behaves. Brace interpolation in
`handicapInvalidCount` (`{n}`, `{size}` used twice) matches the call site's `{ n, size }`
param object. No defect.

**F11 — FILES.md / eslint config updates are accurate and complete.** New files
(`HandicapPanel.vue`, `useHandicap.ts`) both have `FILES.md` rows with correct paths,
one-line purposes, and `[B2]` band tags consistent with their actual imports (both reach
into `BoardState`/SGF vocabulary via `applyHandicap`/`useSetupTools`-style channels, no
rendering-only or wire-protocol logic). `handicap.ts`, `sgf-loader.ts`, `util.ts` entries
were correctly updated in place rather than duplicated. The `eslint.config.js` addition
allowlists `useHandicap.ts`'s `updateBoardState` call under
`local/board-mutation-entry-point`, with the same class-of-reasoning comment as the
pre-existing `useSetupTools.ts` entry it sits beside — correct precedent, not a bespoke
carve-out.

**F12 — Diff is scoped exactly to the commit message's own claim.** `git diff 6b8f74eb
a431d1e3 --stat` (the salvage base to the delivered commit) touches exactly: the dispatch
report, `FILES.md` (+2), `eslint.config.js` (+7), `handicap.ts` (the TS4104 fix, +6/-1),
and the two new test files. No silent scope creep beyond "fix the build breakage +
backfill the test coverage the WIP commit shipped without," which is exactly what the
commit message claims. Cross-checked `git status` after every red/green revert in this
session — always came back clean before the next step.

## Verdict

**MERGE.**

No blockers found. F5 (ruleset-invariant komi against a literally-per-ruleset acceptance
wording) and F8 (stale `HA[n]` after a post-handicap manual stone toggle) are both real,
both documented in code comments already, both defensible on inspection, and neither
breaks anything live in this codebase today — they are REQUIRED-adjacent only in the
sense that the closing ledger row should name them explicitly rather than let the
commission's literal text stand uncorrected against what was actually built. Recommend:

- **REQUIRED (close-time, not code):** the work item's close row (or a `decision`/
  `assumption` row per CLAUDE.md point 7) should state, in the commissioner's own words,
  that "per active ruleset" komi was interpreted as "one flat convention-correct default,
  not ruleset-varying" — so a future reader doesn't mistake the current 0.5-flat behavior
  for an unfinished per-ruleset table.
- **ADVISORY:** a follow-up ledger item (not this one) for the stale-`HA[n]`-after-manual-
  toggle case (F8) if the maintainer wants SGF export hygiene tightened; not required for
  this item to close, since nothing in-app currently reads `HA` and the module's own
  docstring already frames "handicap IS setup stones, no parallel mechanism" as the
  intentional design.

Gates: build exit 0, tests exit 0 (1642 passed / 4 skipped), eslint exit 0 (whole repo).
Red-then-green witnessed on both the build-time fix and the white-to-move behavior fix.
Placement tables independently verified against the standard Go handicap convention.
