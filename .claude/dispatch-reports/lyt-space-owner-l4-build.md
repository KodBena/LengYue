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
