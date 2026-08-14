# Space-owner cure — dispatch L4 build report

**Status.** Built and gated on branch `lyt-space-owner-l4`, reset to
`lyt-phase2`'s tip (`e9dcc998`) before work started. Per
`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step 4, ledger rows
2447/2484 — the purity/path-equality property gate that closes Class 3,
plus the L3 build report's own parked "no sibling to diagnose against"
fork.

## 1. Roadmap

Two independent deliverables, both scoped to `frontend/src/state/
feasible-layout.ts` and its test tree:

1. **The purity gate** (`tests/unit/state/feasible-layout-purity.test.ts`,
   new). A property-level CI suite driving `FeasibleLayout.validate` and
   `resolveSideColumnLiveLayout` directly across the review's own §Class 3
   traversal plus three additional seeded/deterministic randomized
   traversals, asserting every visited geometry's resolved layout matches
   an isolated, canonical computation for that same geometry — path
   independence, with content demands held constant throughout (stated
   explicitly in the file's own header and in each `describe` block, per
   this dispatch's own instruction).
2. **The parked fork** (`state/feasible-layout.ts`, extended). The L3
   build report's own §7 finding 2 / §8 STOP-and-report item — a sovereign
   `tree` drag that overflows the wrapper's own physical capacity with no
   sibling to diagnose against produced no diagnostic at all. Closed via a
   new `Measured<'wrapper'>` demand run through the SAME
   `FeasibleLayout.validate` mechanism this module already uses
   everywhere — no new type, since `StarvationDiagnostic.region` was
   already `string`, not a closed union.

A third, minimal-touch supporting change: the numeric track-list
solver and L3's own side-column row-fact helpers (previously private to
`feasible-layout-geometry-sweep.test.ts`) moved to a new plain module,
`tests/unit/state/feasible-layout-fixtures.ts`, so the purity suite can
drive the SAME candidate-generation logic those suites already trust
rather than re-deriving a second copy (this codebase's own "single home
per fact" discipline, spec §2). The move is verbatim — no logic changed —
and is disclosed in both files' own headers.

## 2. Per-directive coverage

1. **The property gate (SCOPE item 1).** WITNESSED —
   `feasible-layout-purity.test.ts`'s three `describe` blocks (§A
   `FeasibleLayout.validate`, §B `resolveSideColumnLiveLayout`
   non-sovereign, §C `resolveSideColumnLiveLayout` sovereign) each run
   the review's own literal traversal plus three seeded traversals
   (`mulberry32`, seeds 1001/2002/3003 — dependency-free, deterministic,
   reproduced identically on a second call, WITNESSED by its own
   `describe('traversal construction...')` sanity block) over the seven
   distinct geometries named in spec §3 step 4's own traversal text. Every
   `describe` block's own header states explicitly that content demands
   (`TREE_LIVE_CONTENT_OVERLAY`, the `others` row facts) are held constant
   across the traversal — purity is asserted about the PURE LAYER given
   fixed inputs, not about whether a live `useContentDemand` reading
   itself would stay fixed across a real resize (the spec's own §4 step-4
   risk row's own disclosed limit, restated in this file's own header).
2. **Sovereign-override path-dependence (SCOPE item 3).** WITNESSED —
   purity §C holds a persisted `treeSovereignPx` (500) fixed across the
   entire traversal (matching how a real persisted override behaves,
   `feasible-layout.ts`'s own §2 measurement-seam table: "carried
   verbatim across a viewport change") and asserts the resolved
   `treePx`/`others`/`diagnostics` triple — diagnostics included — is
   path-independent. The override value is chosen (not arbitrary) so the
   traversal's own three distinct `wrapperWidthPx` values (820/638/345)
   span all three outcome shapes at once — a sibling starvation, a
   wrapper-capacity starvation, and a clean fit — verified by its own
   "not vacuous over one shape" sanity test before the path-independence
   assertions run.
3. **The parked fork (SCOPE item 2).** WITNESSED, resolution (a) taken —
   no new type. `wrapperCapacityStarvation` mints a `Measured<'wrapper'>`
   demand (`min` = the row's own actual total claim, `candidate` = the
   wrapper's own real `wrapperWidthPx`) and runs it through the SAME
   `FeasibleLayout.validate` call this module uses everywhere else,
   producing a `'starved'` diagnostic for the region name `'wrapper'`
   whenever the row's total claim exceeds the wrapper's own capacity.
   `mergeWrapperCapacityDiagnostic` folds this into whatever
   `resolveSovereignOverrides` already produced for the SAME drag —
   appended to an existing `location:'tree'` diagnostic's own `starved`
   array when a sibling starvation is ALSO real, or synthesized fresh when
   `resolveSovereignOverrides` found nothing (the exact parked-fork
   shape). Three new tests in `feasible-layout.test.ts`'s own "Branch 7"
   cover: no sibling at all (the L3 build report's own exact repro), a
   sibling starvation AND a wrapper overflow merged into one diagnostic,
   and a negative control (no spurious diagnostic when the sovereign claim
   genuinely fits).
4. **Gates.** See §6 — three clean, one honestly non-clean and
   root-caused, matching L3's own disclosed precedent exactly (see §7).

## 3. Purity gate — design notes

**Traversal set.** `GEOMETRIES` is the review's own §Class 3 traversal's
seven DISTINCT points (1920×1080, 480×900, 2560×1440, 1024×768,
1080×1920, 1366×768, 900×600 — the traversal's closing 1920×1080 is a
revisit of index 0, not an eighth point). `TRAVERSALS[0]` is the review's
own literal 8-step order; `TRAVERSALS[1..3]` are `mulberry32`-seeded,
each two independent Fisher–Yates shuffles of all seven indices
concatenated — guaranteeing every geometry is revisited at least twice
per seeded traversal (not left to chance the way a single long random
walk would be), with genuinely different, deterministic orderings
(WITNESSED: the three seeded traversals are pairwise different; a given
seed reproduces its own sequence identically on a second call).

**Comparison against a canonical baseline, not pairwise against prior
steps.** Each `describe` block computes one canonical, ISOLATED result
per geometry before any traversal runs, then asserts every traversal
step — first visit or revisit — matches that canonical value. This is
strictly stronger than "every REVISITED geometry matches its own first
visit within one traversal" (the spec's own literal wording): it also
catches a divergence between an isolated call and a call embedded inside
a long, interleaved traversal, which is exactly the shape a hidden
module-scope cache or an accidentally-mutated shared object would
produce. `feasible-layout.ts` and `feasible-layout-fixtures.ts` were both
read in full for this dispatch and carry no such state (no module-scope
`let`/cache, no in-place mutation of a `Map`/array parameter) — the gate
is a regression guard against a FUTURE lapse, not evidence of a present
one.

**Float tolerance.** `normalize()` rounds every number to the nearest
`1e-6` before comparison, per this dispatch's own explicit "modulo float
tolerance" instruction — the numeric solver's own `elastic`/
`elastic-capped` fr-distribution (`feasible-layout-fixtures.ts`'s own
`solveRowTracks`) can produce fractional pixel values, though the same
deterministic arithmetic on the same inputs is bit-for-bit reproducible
within one JS engine in practice.

## 4. The parked fork — worked trace

The L3 build report's own repro (§7 finding 2): a landscape-dragged wide
`treePanelWidthPx` replayed against a narrow wrapper with no sibling
present. Reproduced directly as a unit test
(`feasible-layout.test.ts`, Branch 7):

```
wrapperWidthPx=480, others=[], treeSovereignPx=820
-> treePx = 820 (verbatim, sovereignty)
-> totalRowClaimPx = 820 (no others to add)
-> wrapperCapacityStarvation(820, 480, ...) -> min=820, candidate=480, 480<820
   -> { kind: 'starved', region: 'wrapper', axis: 'h', demandPx: 820, grantedPx: 480 }
-> diagnostics = [{ location: 'tree', starved: [that], message:
     'Your geometry modification no longer fits within the available space.',
     remediation: '...', nextAction: 'open-default-layout-control' }]
```

Before this dispatch: `diagnostics` was `[]` at this exact input — the
overflow was real (visible to the layout-audit's own `viewport-escape`
rule, §7's own disclosed residual finding) but silently undiagnosed.

The merge case (both a sibling AND a wrapper starvation real at once,
`wrapperWidthPx=820, others=[controlPanel present/demote778],
treeSovereignPx=1000`): `controlPanel`'s own candidate floors to `0`
(genuinely starved, `resolveSovereignOverrides`'s own mechanism, already
correct before this dispatch), AND the row's own total claim (`1000 + 4 +
0 = 1004`) exceeds `820` — both diagnosed in the SAME `location:'tree'`
entry's own `starved` array (`[{controlPanel: 664/0}, {wrapper:
1004/820}]`), never two competing diagnostics, matching §1.2's own
"starved+hoarding pair from ONE call" discipline extended to this second
diagnostic source.

## 5. Message text

`'wrapper'` is not itself a renderable region — folding it into the
existing "no longer permits X to render" sentence would misdescribe what
happened (nothing "renders wrapper"). `sovereignMessage()` therefore
builds a distinct clause for it: `"...no longer fits within the available
space."`, joined with the existing render-target clause via `", and "`
when both are real. This is free text (per §1.6's own closure statement:
"the diagnostic's own message is the one place free text is legitimate"),
not a new structured field.

## 6. Gates

- **eslint** (`npx eslint .`): exit `0`, no output. WITNESSED.
- **`vue-tsc -b --noEmit`**: exit `0`, no output. WITNESSED.
- **`npm run build`**: exit `0`, 1256 modules transformed, the SAME
  pre-existing chunk-size notice every prior space-owner dispatch
  reported, no new warnings. WITNESSED.
- **Full suite** (`NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --maxWorkers=2`): exit `0`, **271 files passed | 3 skipped (274)**,
  **3368 passed | 8 skipped (3376)**. Measured directly against this
  SAME branch's own L3 tip in this SAME environment (not cited from an
  older report): `git stash` of every L4 change reproduces **270 files
  passed | 3 skipped (273)**, **3348 passed | 8 skipped (3356)** — a net
  `+20`, matching exactly `+3` (Branch 7, `feasible-layout.test.ts`) plus
  `+17` (the new purity suite's own runtime test count, `it()` blocks
  inside traversal loops expand at runtime past their static count) plus
  `+0` (the fixtures-extraction refactor changes no test behavior).
  WITNESSED.
- **layout-audit**: **NOT clean** — see §7. Root-caused, not silently
  reported as "0 new."

## 7. layout-audit — residual finding, disclosed and root-caused

Ran `npm run layout-audit` at this dispatch's own tip, then `git stash`
every source change and re-ran the identical gate against the untouched
L3 tip (`e9dcc998`) — the SAME before/after methodology L2b's and L3's
own reports used — then restored (`git stash pop`, confirmed clean
working tree, all changes back verbatim).

| geometry | L3 tip (before) | L4 tip (after) | delta |
|---|---|---|---|
| 2560×1440 | 13, 0 new | 13, 0 new | — |
| 1920×1080 | 13, 0 new | 13, 0 new | — |
| 1366×768 | 13, **8 new** | 13, **8 new** | — (pre-existing, byte-identical selectors both times, matches L3's own disclosed font-rendering drift) |
| 1024×768 | 7, 0 new | 7, 0 new | — |
| 900×600 | 7, 0 new | 7, 0 new | — |
| 480×900 | 8, **1 new** (`viewport-escape::#main-area`) | 11, **4 new** | **+3** |
| 1080×1920 | 28, **3 new** (`SystemLogPanel` target-size) | 28, **3 new** | — |
| **total new vs. committed baseline** | **12** | **15** | **+3** |

The `+3` at 480×900, all `target-size` findings on
`#lyt-overlay-stack>div.system-log-panel`'s own `clear-btn` and two
`dismiss-btn` rows, are directly attributable to this dispatch — and are
the SAME pre-existing defect class L3's own §7 finding 1 already
disclosed at 1080×1920 (`SystemLogPanel`'s dismiss/clear buttons are
already too small for the audit's `target-size` rule on EVERY message
row, at every geometry the panel is open with a message present),
surfacing at ONE ADDITIONAL geometry for the direct reason this dispatch
exists: before L4, the wrapper-capacity overflow at 480×900 (L3's own
disclosed `viewport-escape` finding) produced NO diagnostic and therefore
NO new `SystemLogPanel` message row; after L4, `resolveSideColumnLiveLayout`
correctly diagnoses it, `useSideColumnLiveLayout.ts`'s own pre-existing
watcher (unmodified by this dispatch) pushes it through `pushSystemMessage`
exactly as designed, and the new message row's own dismiss button inherits
the SAME pre-existing sizing defect every other message row already
carries.

**Root cause, same as L3's own §7.** The 480×900/1080×1920 findings both
trace to this dev environment's own live backend (port 8764) carrying a
REAL, previously-persisted wide `treePanelWidthPx` — confirmed by the
same evidence L3's own review independently verified (a live
FastAPI process on 8764, `API_BASE_URL`'s own default-URL fallback). Per
this same environment fact, `resolveSideColumnLiveLayout`'s own sovereign
branch — and therefore this dispatch's own new `wrapperCapacityStarvation`
check — never runs at all on a genuinely fresh boot (no persisted
override, `treeSovereignPx === undefined`): a fresh install never reaches
this path, matching L3's own "a genuinely fresh install... never reaches
this path" finding verbatim.

**Not attempted, disclosed.** Per the standing "backend 8764 forbidden"
access boundary for reviewers/builders on this host, no attempt was made
to clear or reseed the persisted profile to directly falsify the
hypothesis by mutation — the before/after commit comparison above
achieves the same substantive verification (the root cause is this dev
environment's own persisted state, not a code regression this dispatch
introduces) without requiring write access to the forbidden channel.

**Disposition.** This is the SAME class of finding L3's own build report
and review both accepted as a disclosed, non-blocking residual (L3's own
gate was likewise "NOT a clean 0-new," and the merge at `e9dcc998`
proceeded with it disclosed rather than blocking on it). This dispatch
does not treat "0 new attributable findings" as achieved — it is
genuinely not — but the +3 findings are the pre-existing `SystemLogPanel`
button-sizing defect (orthogonal to this dispatch's own scope: the
space-owner layout mechanism, not `SystemLogPanel`'s own CSS) surfacing
at one more geometry as the DIRECT and CORRECT consequence of closing the
silent-diagnostic gap this dispatch exists to close. Fixing
`SystemLogPanel`'s own button sizing is out of scope for this dispatch;
flagging it as a real, ready-to-file follow-up (a `target-size` fix for
`.system-log-panel .clear-btn`/`.dismiss-btn`, independent of any
space-owner mechanism) is the honest disposition rather than silently
suppressing the diagnostic to keep the gate green.

## 8. Scope disclosures

- **`mergeWrapperCapacityDiagnostic` scope.** The wrapper-capacity check
  runs ONLY in the sovereign branch. A non-sovereign candidate is already
  constructed to fit within `wrapperWidthPx` by its own clamp — it can
  still fall short of `tree`'s own compiled floor at a pathologically
  narrow wrapper (`treeTrack.minPx` exceeding `wrapperWidthPx` outright),
  but that is a DIFFERENT, pre-existing gap this dispatch does not open;
  named in `feasible-layout.ts`'s own header comment rather than silently
  folded in.
- **Fixtures extraction.** `feasible-layout-geometry-sweep.test.ts`'s own
  numeric solver and L3's own side-column row-fact helpers moved to
  `feasible-layout-fixtures.ts` verbatim (no logic changed) so the purity
  suite could reuse them without importing a `.test.ts` file as a module
  (which would re-register its `describe`/`it` blocks a second time).
  Disclosed as a refactor beyond the dispatch's own literal ask, in
  service of avoiding a second, drifting copy of ~250 lines of solver
  math (this codebase's own "single home per fact" discipline).
- **`doc-graph`.** This dispatch touches no `.md` document beyond this
  report and a content-only `FILES.md` entry update (no new/removed/
  re-cross-referenced doc node) — `node tools/doc-graph/generate.mjs` is
  NOT required, matching L3's own "content-only edit need not" carve-out.
  `FEATURES.md` is unaffected — this dispatch changes an internal layout
  mechanism and its test coverage, not a user-facing capability (the
  diagnostic message channel itself already existed and is unchanged in
  shape).

## Files touched

- `frontend/src/state/feasible-layout.ts` (`wrapperCapacityStarvation`,
  `mergeWrapperCapacityDiagnostic`, `sovereignMessage`; wired into
  `resolveSideColumnLiveLayout`'s own sovereign branch)
- `frontend/tests/unit/state/feasible-layout-fixtures.ts` (new — the
  extracted numeric solver + L3 row-fact helpers, verbatim relocation)
- `frontend/tests/unit/state/feasible-layout-purity.test.ts` (new — the
  L4 purity gate, three property `describe` blocks + traversal-
  construction sanity checks)
- `frontend/tests/unit/state/feasible-layout.test.ts` (extended: Branch 7,
  the parked-fork unit coverage)
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts`
  (imports from the new fixtures module instead of defining its own
  copies; no test behavior changed)
- `frontend/FILES.md` (one entry updated: `feasible-layout.ts`'s own L4
  addendum)

License: Public Domain (The Unlicense), per ADR-0006.

---

## Discharge — L4 review conditions (`lyt-space-owner-l4-review.md`,
verdict ACCEPT-WITH-CONDITIONS)

Fork disposition ratified at orchestrator level, ledger row 2498 (per the
coordinator's own message relaying it) — the review's own condition 1
(a ledger ratification entry) is satisfied by that orchestrator-level act
and is not re-filed here. The remaining three items — the coordinator's
own numbering — are addressed below, same worktree, same branch.

### Condition 1 — rename the minted capacity region

**Discharged.** `'wrapper'` collided with `useResizablePanel.ts`'s own
pre-existing (L3-vintage) `outerRowSovereignDiagnostic`, which already
uses the literal string `'wrapper'` for a DIFFERENT region (the
sovereign, rendered control pane itself — the drag target) — the L4
review's own §2 "coincidental prior-art wrinkle" finding. Renamed the L4
mechanism's own region to `'side-column-capacity'`
(`SIDE_COLUMN_CAPACITY_REGION` in `feasible-layout.ts`, matching the
coordinator's own suggested name) throughout: the two function names
(`wrapperCapacityStarvation` → `sideColumnCapacityStarvation`,
`mergeWrapperCapacityDiagnostic` → `mergeSideColumnCapacityDiagnostic`),
every `region: 'wrapper'` literal, `sovereignMessage`'s own filter/check,
and the three "Branch 7" tests in `feasible-layout.test.ts` (region
literal, describe-block title, two it()-title wordings). Verified by
direct `grep` after the rename: zero occurrences of the literal
`'wrapper'` remain in `feasible-layout.ts` or its own test file outside
disclosure prose (the header comment naming the OLD collision, for a
future reader's benefit); `useResizablePanel.ts`'s own `'wrapper'` usage
is untouched, as the coordinator's own instruction scoped the rename to
"the minted capacity region," not the pre-existing sovereign-pane sense.

### Condition 2 — correct the imprecise spec citation

**Discharged.** The prior comment claimed "the spec's own §1.2 closure
names the viewport as part of `FeasibleLayout`'s own quantification
universe" — the L4 review read the spec directly and found this
inaccurate: the quoted sentence is §1.1's closure text (§1.2's own
closure statement says only "§1.1's universe, inherited," no independent
claim), and §1.1's own enumerated universe names things that RENDER
content (in-flow leaves, blackbox interiors, corner overlays,
modal/popover boxes, chart containers) — `FeasibleLayout.viewport` is
descriptive context metadata in the spec's own §1.2 type, never itself
checked against a `Measured` entry. `sideColumnCapacityStarvation`'s own
doc comment (`feasible-layout.ts`) is rewritten to state the honest
basis precisely: `StarvationDiagnostic.region`'s own pre-existing,
unchanged-by-this-dispatch `string` type (not a closed union) plus
ledger row 2498's explicit ratification — never a spec sentence that
doesn't say what the old comment claimed. The mechanism itself is
unchanged; only the comment's own citation and its overreach ("names the
viewport as part of the quantification universe") are corrected, per the
review's own condition 2 instruction to "drop or soften" that specific
claim.

### Condition 3 — fix the red ratchet at its root

**The mechanism itself: discharged, verified deterministic.**
`scripts/layout-audit.mjs` now probes for a genuinely dead TCP port at
or above 19000 (`pickDeadBackendPort`/`probePortDead`, refusing the
scratch preview port and the project's own forbidden live ports,
re-probing on the rare chance a candidate unexpectedly answers, and
refusing loudly per ADR-0002 if the whole search range is exhausted) and
builds with `VITE_API_BASE_URL` pointed at it whenever the script itself
runs `npm run build` (the `--build` flag, `npm run layout-audit`'s own
canonical invocation). `API_BASE_URL` is baked in at BUILD time
(`src/config/env.ts`'s own `import.meta.env` read, not a runtime fetch),
so the resulting `dist/` genuinely cannot reach any live service on this
or any other host — cold boot becomes a pure function of the committed
source, independent of what else happens to be running locally. Without
`--build`, the override does not apply; this is now a printed warning,
not a silent gap.

**What running it revealed: NOT green — a much larger, fully isolated,
NON-attributable wave.** `npm run layout-audit` at this dispatch's own
tip now reports **223 total findings, 172 new vs. the committed
baseline** (up from the pre-fix run's 89/12) — spanning all 5 rule
classes (`target-size`, `pointer-occlusion`, `focus-invisible`,
`unreachable-control`, `viewport-escape`) at EVERY one of the 7
geometries, not merely the 2 geometries the pre-fix disclosure named.
Root-caused directly, not merely inferred: the report's own new findings
include `button.auth-error.user-badge` (an authentication-failure state
class name) and `div.wizard-card` (a first-run/onboarding modal) at
every geometry — the SPA, now genuinely unable to reach ANY backend,
renders a real auth-error indicator and a first-run wizard modal that
covers most of the viewport, which in turn produces a wide
`pointer-occlusion` cascade (the modal backdrop intercepting
`elementFromPoint` for everything beneath it) neither the pre-fix nor
any prior dispatch's own audit run ever exercised, because a live
backend on this host has apparently always been reachable at every
previous audit invocation.

**Isolation, performed exactly as the coordinator's own instruction
names ("if genuinely-new findings survive isolation, report them").**
Checked out `frontend/src/state/feasible-layout.ts` verbatim from the L3
tip (`e9dcc998`, `git checkout e9dcc998 -- ...`) — i.e., this dispatch's
OWN layout mechanism entirely removed, leaving only the deterministic
audit-runner fix — rebuilt and re-ran the identical audit. Result:
**223 total findings, 172 new vs. baseline — byte-identical to the
figure at this dispatch's own full tip.** This proves, not merely
argues, that the wave is 100% attributable to the audit-determinism fix
itself (this dispatch's own condition-3 work) revealing a previously
NEVER-baselined cold-boot state, and 0% attributable to the
space-owner layout mechanism (L1–L4's own `feasible-layout.ts` work) —
the SAME 172 findings appear whether or not that mechanism exists.
Restored (`git checkout HEAD -- frontend/src/state/feasible-layout.ts`)
immediately after the isolation run; the working tree's own final state
was re-verified clean and identical to the pre-isolation diff.

**Disposition: reported, not silently baselined, per the coordinator's
own explicit fallback instruction.** Adding 172 new keys to
`layout-audit-baseline.json` unilaterally, in this dispatch, would be
exactly the "baselining silently" anti-pattern the coordinator's own
instruction names as the wrong move — this is a materially different
scale and kind of disclosure than L3's own 2-finding residual (a
narrowly root-caused, single-mechanism side effect): it is the FIRST
TIME this project's layout-audit has ever run against a genuinely
isolated cold boot, and it surfaces a real, previously-invisible
first-run/auth-error UI surface this dispatch has no charter to
evaluate, triage, or fix (wizard-modal markup and dismiss-affordances
are entirely outside `feasible-layout.ts`'s own scope). Baselining 172
un-triaged findings — many potentially real accessibility defects on a
UI surface no prior dispatch has ever audited — is a bigger, more
consequential act than this dispatch's own remit; it is filed here as
the concrete STOP-and-report item, not resolved unilaterally.

**`npm run layout-audit --check` therefore remains RED (exit 1) at this
dispatch's own tip** — genuinely not achieved, disclosed with full
isolation evidence rather than forced green by an unreviewed baseline
edit. The mechanism this condition asked for (a deterministic,
host-independent cold boot) is real, verified, and working exactly as
specified; what it found is the actual state of affairs, not a defect
in the fix. Recommending a dedicated follow-up dispatch — "layout-audit
baseline: capture genuine cold-boot state" — scoped to triaging and
either baselining-with-justification or fixing the 172 newly-visible
findings (the auth-error/wizard-modal surface first, since it accounts
for the bulk of the `pointer-occlusion` cascade), separate from any
space-owner work.

### Gates, re-run at this dispatch's own final tip

- **eslint** (`npx eslint .`): exit `0`, no output. WITNESSED.
- **`vue-tsc -b --noEmit`**: exit `0`, no output. WITNESSED.
- **`npm run build`**: exit `0`, 1256 modules transformed, same
  pre-existing chunk-size notice, no new warnings. WITNESSED.
- **Full suite** (`NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --maxWorkers=2`): exit `0`, **271 files passed | 3 skipped (274)**,
  **3368 passed | 8 skipped (3376)** — unchanged from the pre-discharge
  numbers (the rename and citation fix touch no test assertions'
  meaning, only literal region-name strings and a comment; the audit
  script change touches no `.test.ts` file). WITNESSED.
- **`npm run layout-audit`**: exit `1`. **NOT green** — see above for
  the full isolation evidence and disposition. This is the one gate this
  discharge does not close, reported precisely rather than papered over.

### Files touched, this discharge

- `frontend/src/state/feasible-layout.ts` (rename: `'wrapper'` →
  `'side-column-capacity'`, `SIDE_COLUMN_CAPACITY_REGION` const,
  function renames; doc-comment citation correction)
- `frontend/tests/unit/state/feasible-layout.test.ts` (Branch 7: region
  literal, describe/it titles updated for the rename)
- `frontend/FILES.md` (the `feasible-layout.ts` entry's L4 addendum
  updated for the rename + ledger row 2498)
- `frontend/scripts/layout-audit.mjs` (`probePortDead`,
  `pickDeadBackendPort`, wired into `main()`'s `--build` step; header
  doc's "Deterministic cold boot" section added)

License: Public Domain (The Unlicense), per ADR-0006.
