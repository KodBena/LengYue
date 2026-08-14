# Space-owner cure — dispatch L3 REPAIR (fresh-context, severe-delinquency path)

**Artifact.** Worktree `/home/bork/w/omega/.claude/worktrees/agent-a937ba0f1e3d9424d`,
branch `worktree-agent-a937ba0f1e3d9424d`. Set up via `git reset --hard a65dd291`
from the L3 branch tip; verified `feasible-layout.ts` contained
`resolveSideColumnLiveLayout` before starting. One commit on top,
`27394bbc1c952f6f75fbf52ebcbe865923a5e47d` — verified `git rev-parse HEAD` equals
the branch tip after the commit (row 2460 practice).

**Governing documents read end to end.** `.claude/dispatch-reports/
lyt-space-owner-l3-review.md` (the review this repair discharges — its §basis
items 3/4/5, its §1 test-surgery-honesty section, and its §Verdict's three
numbered conditions are this repair's scope). `feasible-layout.ts` in full
(803 lines, `resolveSideColumnLiveLayout`/`resolveSovereignOverrides` read
closely). `tests/unit/state/feasible-layout.test.ts` and
`feasible-layout-geometry-sweep.test.ts` in full (the latter split across two
reads, 1088 lines total). The deleted-test region of `layout-model.test.ts`'s
own history at `c9a9f1aa` (its parent) — `computeTreePanelClampedWidthPx`,
`resolveWidthConditionalPresence`, `clampTreeWidthForSideColumn`,
`resolveTreeRowWidthPx` (both waves), `sumFixedRowSiblingReservationPx`, and
the end-to-end composition block, ~750 lines, read in full. Per the brief's
own instruction, the L3 builder's report was NOT read — the review supersedes
it for this repair's purposes.

---

## Condition 1: direct unit coverage for the six named branches

Added a new `describe('resolveSideColumnLiveLayout()', ...)` block to
`tests/unit/state/feasible-layout.test.ts` — the location the deletion
comment already (falsely) claimed carried this coverage. Twelve new `it()`
blocks, one per named branch (two throw guards get two tests each):

- **ADR-0002 throw guard 1** (non-`'elastic'` tree track): asserts the exact
  message shape (`/tree's own compiled track is "fixed"/`).
- **ADR-0002 throw guard 2** (non-`'h'` demote axis on an `others` entry):
  `/unsupported demote axis/`.
- **Not-yet-measured pass-through**: `treeDefaultPx` wins verbatim at
  `wrapperWidthPx` of `0`/`-10`/`NaN`; a sovereign `treeSovereignPx` wins over
  `treeDefaultPx` even pre-measurement (disclosed as a genuinely NEW branch —
  sovereignty did not exist in the deleted mechanism, so this precedence is
  not a recovered assertion); `others` pass through per `desiredVisible`
  verbatim, no demote math runs.
- **Unbounded (`maxUsefulPx: null`) widen path**: three worked numbers
  recovered VERBATIM from the deleted `resolveTreeRowWidthPx` suite — 420
  (portrait, F4's own "un-dragged default... widens to 420"), 768 (portrait's
  own "representative width" figure), 614 (landscape N2's own "widens all the
  way to the measured 614px side column").
- **Demote-boundary exact `>=` inclusivity**: 778/110 pair recovered verbatim
  from the deleted `clampTreeWidthForSideColumn`'s own "right at the compiled
  demote boundary" case; 777/777 as the one-px-below counterpart.
- **previewBoard-present reservation arithmetic**: 450 (614 wrapper, recovered
  verbatim from the deleted N2 "previewBoard PRESENT" case) and 819/164/942/655
  (recovered from the deleted "generalized reservation... end-to-end
  composition at 2560x1440" scenario — that test never asserted `655` as a
  literal, only via a row-sum identity; re-derived here directly and pinned as
  a literal, disclosed as such).

Every worked number is either byte-identical to a number the deleted suite
pinned, or explicitly marked as a fresh derivation / a genuinely new branch
sovereignty introduces. WITNESSED: all twelve pass in the full suite run
(§Gates below).

## Condition 2: the false deletion comment corrected

`layout-model.test.ts`'s deletion comment previously claimed
`tests/unit/state/feasible-layout.test.ts` carried
`resolveSideColumnLiveLayout`'s own pure-function contract — the review's own
`grep` proved this false (zero describe blocks called the function; only an
unused import existed). Replaced with a comment that:

- States the original claim was false, dated and attributed to this repair.
- Names the REAL coverage locations: `feasible-layout-geometry-sweep.test.ts`'s
  own "dispatch L3: resolveSideColumnLiveLayout — live-solve regression
  oracle" and "dispatch L3: sovereignty — WITNESSED trace" describe blocks
  (already present in the L3 build, genuinely exercising the function), plus
  the new direct-coverage block from condition 1 (this repair).
- Names the specific worked numbers recovered, so a future reader can
  cross-check without re-deriving them.

WITNESSED: `grep -n "resolveSideColumnLiveLayout\|describe("` against the
post-repair `feasible-layout.test.ts` now shows the function called inside a
real `describe` block, closing the exact gap the review's own `grep`
identified.

## Condition 3: remediation/nextAction wired to the sink

Read `pushSystemMessage`'s own structure (`src/services/system-message-sink.ts`)
before touching anything: a `push(type, text)` port, registered once by the
store, re-exported through `src/store/index.ts` for ~18 existing call sites
across components/composables. The sink was NOT structurally incapable of
carrying the fields — it could be extended additively, so the brief's
"STOP and report" escape hatch does not apply here; the extension was made:

- `SystemMessage` (`src/types/app.ts`) gains optional
  `remediation?: string` / `nextAction?: string` fields, documented as
  additive and naming the C8 provenance.
- `SystemMessagePushDetails` (new, `system-message-sink.ts`) is the shape of
  an optional third `pushSystemMessage(type, text, details?)` parameter —
  every existing two-argument call site is unaffected (verified: full suite
  green, no call-site changes needed elsewhere).
- The store's sink implementation (`src/store/index.ts`) folds `details` into
  the constructed `SystemMessage`, conditionally spreading each field so a
  push with no `details` produces a byte-identical message to before.
- `useSideColumnLiveLayout.ts`'s own watcher — the INNER bar's own producer
  of a `SovereignOverrideDiagnostic` — now passes
  `{ remediation: d.remediation, nextAction: d.nextAction }` as the third
  argument, so the user's push actually carries both fields end to end.
  **CORRECTED 2026-08-14** (delta review of this repair): the sentence here
  originally read "the ONE real producer of a `SovereignOverrideDiagnostic`."
  That was false — `App.vue`'s own `outerRowSovereignPushGate` watcher
  (`resolveSovereignOverrides` called from `useResizablePanel.ts`'s
  `outerRowSovereignDiagnostic`, for the OUTER bar / `#board-area` vs
  `#tree-control-wrapper`) is the SYMMETRIC second producer, documented in
  the original L3 review's own §3, and it received ZERO changes in this
  repair's first pass — it kept pushing a bare
  `pushSystemMessage('warning', d.message)`. Fixed below, in the same
  commit as this correction (not a silent reword — see
  `git log -- .claude/dispatch-reports/lyt-space-owner-l3-repair.md` for
  the pre-correction wording this sentence replaces).
- `SystemLogPanel.vue` renders `remediation`/`nextAction` as their own
  subordinate lines (`v-if`, so every other message type is visually
  unchanged) rather than flattening them into `msg.text`.

**Disclosed, not silently left.** `nextAction` renders as a plain label
(`{{ $t('systemLog.nextAction') }}: {{ msg.nextAction }}`), not a clickable
control. `open-default-layout-control` names an affordance that does not
exist on THIS branch — the "Default layout" reset button (ledger row 2379,
commits `45416fed`/`148899f7`) landed on `lyt-phase2` concurrently with this
L3 arc and is not present here (this L3 branch forked from `c9a9f1aa`, before
that work). Wiring an actual click handler to it is out of this repair's
scope (a cross-branch integration, not a test/wiring repair) and is named
explicitly in `SystemMessage`'s own doc comment and in `SystemLogPanel.vue`'s
template comment, rather than silently implied by the label's presence — the
review's own "or disclose the C8 presentation gap explicitly" alternative,
taken honestly rather than half-satisfied.

`systemLog.nextAction` ("Next") added to all four locale catalogs
(`en`/`ja`/`ko`/`zh-CN`) to keep `m8-m11-locale-parity.test.ts` green.

Two new tests added to `tests/unit/services/system-message-sink.test.ts`
covering the additive third argument (present → lands on the message;
absent → both fields stay `undefined`, matching every pre-repair caller).

### Residual: the outer bar (App.vue) — RESOLVED

The delta review of this repair caught the false extent claim named above.
`App.vue`'s own `outerRowSovereignPushGate` watcher (script-setup body,
around the `outerRowSovereignDiagnostic` import from `useResizablePanel.ts`)
is the symmetric second bar's own diagnostic producer — same
`SovereignOverrideDiagnostic[]` shape (`resolveSovereignOverrides`'s own
return type, `state/feasible-layout.ts`), same push-dedup convention
(`lastPushedOuterRowDiagnosticKey`), same `pushSystemMessage` sink — and it
was left untouched by this repair's first pass. Fixed now, mirroring the
inner bar's own wiring exactly:

```
for (const d of diagnostics) {
  pushSystemMessage('warning', d.message, { remediation: d.remediation, nextAction: d.nextAction });
}
```

No divergence between the two bars' diagnostic shapes remains — both now
thread `remediation`/`nextAction` through the same `SystemMessagePushDetails`
parameter.

**Symmetric test added.** `tests/integration/App-boot.test.ts` gains a new
describe block, `'App.vue — outer-bar sovereignty diagnostic pushes
remediation/nextAction (dispatch L3 repair residual)'`: mounts the full
`App.vue` (the outer bar's push watcher lives inline in its own
`<script setup>`, not in a separately-testable composable, so a genuine
integration mount is the only way to exercise it end to end), stubs
`#split-workspace` at 1024×700 (landscape), then sets
`store.session.ui.treeControlRegionWidthPx = 900` post-mount — the same
900px-on-1024px-row starvation `resizer-restore-clamp.test.ts`'s own ui-5-3
suite already uses at the composable level — and asserts the resulting
pushed `SystemMessage` carries `remediation: 'reduce this region\'s width,
or use Default Layout to reset'` and `nextAction:
'open-default-layout-control'`, the SAME values the inner bar's own
sink-level tests pin. WITNESSED: this test passes in isolation
(`npx vitest run tests/integration/App-boot.test.ts`, 6/6 passed) and in the
full suite (§Gates below).

This residual also surfaces a gap the original report's own "what was NOT
done" section named honestly but did not close: no dedicated
composable-level integration test existed for EITHER bar's watcher wiring
before this correction. The new App-boot.test.ts block closes it for the
outer bar; the inner bar (`useSideColumnLiveLayout.ts`) still has no
dedicated integration test of its own watcher — its `pushSystemMessage`
call is exercised only indirectly, through the sink-level unit tests
verifying the mechanism `pushSystemMessage` itself exposes, and through
`feasible-layout-geometry-sweep.test.ts`'s own pure-function sovereignty
trace (which pins the diagnostic's own shape but does not mount a component
or observe a push). Disclosed, not silently left for a future reader to
rediscover; out of THIS residual's own scope (which named the outer bar
specifically), but named here for completeness.

---

## Per-directive coverage

1. **Direct unit coverage for the six branches.** WITNESSED — twelve new
   tests in `feasible-layout.test.ts`, all pass, worked numbers cross-checked
   against the deleted suite's own git history by hand before writing each
   assertion.
2. **Deletion-comment correction.** WITNESSED — the false claim is gone; the
   comment now names real locations, `grep`-verifiable.
3. **remediation/nextAction wiring.** WITNESSED — threaded end to end for
   BOTH bars (diagnostic → composable/App.vue watcher → sink → store →
   rendered panel), additive at every existing call site, the presentation
   gap (no clickable `open-default-layout-control`) named rather than
   hidden. The outer bar was missed in this repair's first pass (the false
   extent claim the coordinator's delta review caught) and is fixed as of
   this correction — see "Residual: the outer bar" above.
4. **Gates.** WITNESSED, all four, RE-RUN after the outer-bar fix:
   - `npx eslint .`: exit 0, no output.
   - `npx vue-tsc -b --noEmit`: exit 0, no output.
   - `npm run build`: exit 0, 1256 modules transformed, same pre-existing
     chunk-size notice as the L3 build, no new warnings.
   - Full suite (`nice -19 env NODE_OPTIONS=--max-old-space-size=2048 npx
     vitest run --maxWorkers=2`): exit 0, **270 files passed | 3 skipped
     (273)**, **3348 passed | 8 skipped (3356)** — up from the L3 build's own
     3333, **+15 new tests** (12 in `feasible-layout.test.ts`, 2 in
     `system-message-sink.test.ts`, 1 in `App-boot.test.ts` for the outer-bar
     residual).

## What was NOT done, disclosed

`layout-audit` (the residual-audit gate the L3 review's own §5 covered) was
not re-run — it is not named in this repair's own SCOPE item 4 gate list
(eslint/vue-tsc/build/suite only), and the review's own §5 findings there are
orthogonal to the three conditions this repair discharges (a live dev-backend
persistence artifact, not a code regression). No dedicated composable-level
test exists for `useSideColumnLiveLayout.ts`'s own watcher wiring
(`tests/integration/` has no file for it, before or after this repair) — the
new sink-level tests cover the mechanism `pushSystemMessage` exposes; a full
integration test driving the composable's watcher against a live diagnostic
was not added, as it was not named in the brief's scope and the existing
`feasible-layout-geometry-sweep.test.ts` sovereignty trace already pins the
diagnostic's own shape at the pure-function boundary.

Report: `/home/bork/w/omega/.claude/dispatch-reports/lyt-space-owner-l3-repair.md`

License: Public Domain (The Unlicense), per ADR-0006.
