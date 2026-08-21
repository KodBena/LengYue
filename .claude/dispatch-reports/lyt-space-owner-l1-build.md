# Space-owner cure, dispatch L1 — additive validation layer, build report

**Status.** Built, committed to this worktree's branch. Ledger rows
2446/2447. Governing spec: `.claude/dispatch-reports/lyt-space-owner-spec.md`
§3 step 1. Charter: `.claude/dispatch-reports/lyt-final-opus-review.md`.

**Reading discipline.** Read end to end before any code was written:
`lyt-space-owner-spec.md` (993 lines), `lyt-final-opus-review.md` (301
lines), `frontend/src/state/lyt-layout-types.ts`, `frontend/src/state/
layout-model.ts` (1174 lines, both halves), `frontend/src/state/
lyt-layout.gen.ts`, `frontend/src/state/lyt-layout-portrait.gen.ts`. Also
read in full, as needed to derive the geometry-sweep gate honestly:
`frontend/src/composables/chrome/useLytTrackCss.ts` (the CSS-string
per-track-kind formulas this build's numeric solver mirrors),
`research/lyt/runner.py`'s `SCREEN_SIZES` declaration (to confirm no
per-geometry solved data exists for the review's own sweep), and the two
`lyt-solved-layout*.gen.ts` shadow-harness files (to confirm and disclose
their staleness against the C3-rewritten widget set). `LytNode.vue` and
`useResizablePanel.ts` were NOT read end to end for this build — the
dispatch names them as required reading for the SPEC's authorship, not for
this step's own scope, and step 1 is additive-only (no realization-path
code touched).

**Base freshness.** Worktree was reset to `ee93a4c5` (the C3 merge) per the
dispatch's instruction before any work began; `research/lyt/encodings/
lengyue_landscape.lyt` verified at 61 lines.

---

## What shipped

### 1. `frontend/src/state/feasible-layout.ts` — the type surface

Implements, verbatim in intent, spec §1.1 (`Px`/`px()`,
`OverflowDiscipline`, `Measured<Region>`/`measured()`), §1.2
(`RegionAllotment`, `StarvationDiagnostic`, `FeasibleLayout` with private
constructor + static `validate`), §1.3 (`RegionPresence`), and §1.6
(`SovereignOverride`/`SovereignOverrideDiagnostic`/
`resolveSovereignOverrides`, with the REAL threaded
`screenClassId`/`viewport` signature the spec's own sketch elides). §1.4
(`CornerStack`) and §1.5 (`OverlayContract`) are explicitly OUT of this
step's scope per the dispatch brief's own item list and are not present in
the file.

Ratified fork defaults (ledger row 2447) are threaded through: sovereignty
`source` is the closed union of one member, `'user-drag'`; the adapter
synthesizes `preferred = min`; board aspect-coupled leaves (any leaf with
`aspect !== null` — `B`, `previewBoard`) and the board-composite's own
coupled-axis tracks (`board-priority-clamp`/`board-priority-self-clamp`)
are excluded from `measuredFromLytProgram`'s output, documented in the
module's own header rather than silently dropped.

ADR-0006 header present. Every `as` cast (two: `px()`'s brand mint, one
generic-widening re-assertion inside `validate()`) carries an adjacent
justification per `frontend/CLAUDE.md`'s cast-hygiene rule — confirmed by
a clean `eslint src/state/feasible-layout.ts` run (the project's
`local/justification-adjacency` rule caught both on the first pass and
both are now satisfied).

**One implementation deviation from the spec's own literal type, disclosed
here rather than silently made:** `FeasibleLayout`'s constructor could not
use the spec's own parameter-property shorthand (`private constructor(
public readonly allotments: ..., ...)`) — this project's TS config sets
`erasableSyntaxOnly`, which forbids that syntax (it requires a runtime
class-field emission the config's own type-erasure contract disallows).
The fields are declared explicitly and assigned in the constructor body
instead; the public shape (`allotments`/`screenClassId`/`viewport` as
readonly instance properties) is byte-identical to the spec's own
sketch. This is a syntax accommodation, not a representation fork — no
STOP-and-report is warranted, but it is named here per the "representation
forks beyond the spec = STOP-and-report" discipline's own spirit
(disclosed, not silent).

**Second disclosed departure from the spec's own literal signature:**
`FeasibleLayout.screenClassId`/`validate()`'s `screenClassId` parameter is
typed as a plain `LytScreenClassIdInput = string`, not the spec sketch's
bare `LytScreenClassId` (from `layout-model.ts`). This module deliberately
does not import from `layout-model.ts` — the spec's own migration map
(§3 step 3) describes `layout-model.ts`'s clamp functions as things a
LATER step DELETES in favor of this module, which would make an import
the wrong direction today. A caller passing a real `LytScreenClassId`
(a string-literal union) satisfies the plain-`string` parameter
structurally with no cast needed — confirmed by the geometry-sweep test,
which does exactly this.

### 2. `measuredFromLytProgram` adapter

Reads every track-bearing leaf/blackbox/exclusive node of a compiled
`LytProgram` into `Measured<string>` entries: `fixed` tracks get
`min=preferred=maxUseful=px`; `elastic` tracks get `min=preferred=minPx`,
`maxUseful=null`; `elastic-capped` tracks get `min=preferred=minPx`,
`maxUseful=maxPx`; the two `board-priority-*` kinds are excluded
per the fork default above. Recurses through `split` nodes and through an
`exclusive` node's own tab children when a tab's `node` is ITSELF a
further `split` (so `settingsSubstrip`/`SP_session` inside the Settings
tab, and `otherColorDebug`/`otherBand` inside the Other tab, still yield
entries) — a bare leaf/blackbox tab (`CP-library`/`CP-cards`/
`CP-analysis`) carries no `LytChild.track` of its own (SPEC.md §2: every
Exclusive child shares the parent's rectangle) and yields none, a
disclosed step-1 narrowing named in the module's own header, not a silent
omission.

### 3. The report-only CI gate

`frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts`. For
every geometry in the review's own sweep — landscape 1280/1366/1600/1800/
1920/2200/2560/2880/3000 at the review's own `s12` height (1000px);
portrait 420x880/540x960/768x1024/1080x1920/1200x1600 — the suite:

1. Builds `demands` from the real compiled program via
   `measuredFromLytProgram`.
2. Builds a `candidate` allotment map honestly DERIVED from the SAME
   compiled program's own track list (no per-geometry solved data exists
   for this sweep — confirmed against `research/lyt/runner.py`'s own
   `SCREEN_SIZES`, four points only, none of which are this sweep's; the
   two `lyt-solved-layout-{landscape,asis}.gen.ts` shadow files were
   checked and found STALE against the C3-rewritten widget set — `A_engine`
   as one region rather than the split `A_engine_controls`/`_eval`/
   `_health`/`_queue`, `CP-other` rather than `otherColorDebug`/
   `otherBand` — and were therefore NOT used, since joining against a
   mismatched region set would be dishonest rather than merely
   approximate).
3. Runs `FeasibleLayout.validate` and asserts ONLY the meta-property the
   report-only gate is scoped to at this step: a `FeasibleLayout` or a
   non-empty `refused`, never `undefined`/a throw — never
   `diagnostics.length === 0`, which would make the suite BLOCKING.
4. Accumulates every diagnostic into a full census, logged via
   `console.info` and reproduced below.

The candidate derivation (`solveRowTracks`) is a NUMERIC evaluation of the
SAME per-track-kind formulas `useLytTrackCss.ts`'s `trackCssValue` emits
as CSS strings — this Vitest suite has no real browser Grid layout engine
to defer a CSS string to. It is a disclosed simplification of CSS Grid
Level 1's own multi-pass algorithm (elastic-capped tracks grow toward
their own max in one proportional pass before elastic/`fr` tracks receive
the remainder, mirroring the spec's "Maximize Tracks before Expand
Flexible Tracks" step order but not its iterative fair-share). Presence
for `boardRail`/`A_setup`/`previewBoard` follows the compiled
`presenceDefaultVisible` field directly (a fresh-boot, default-layout
scenario). Presence for `controlPanel`/`A_app` (the two nodes carrying a
compiled `demote`) reuses `resolveWidthConditionalPresence` and
`sumFixedRowSiblingReservationPx` DIRECTLY from `layout-model.ts` — the
SAME pure functions the running app calls — rather than re-deriving the
demotion rule a second time (ADR-0012 P1).

**A caught bug, disclosed rather than silently fixed:** the first draft of
this derivation fed `A_app`/`A_setup`'s candidate on axis `'h'`; both are
children of a `v`-axis split (the side column's own nested v-split in
landscape, root directly in portrait), so their `Measured` entries (from
`measuredFromLytProgram`, which derives axis from the ENCLOSING split's
own axis) carry axis `'v'`. The mismatch made `FeasibleLayout.validate`
skip both regions silently as "not modeled this axis" — the meta-property
assertion still passed (validate never throws on a mismatch, by design),
but the census was thinner than it should have been. Caught by comparing
the first census run's output against hand-derived expectations before
trusting it (the dispatch brief's own instruction: "if your census is
empty, suspect your adapter before trusting it" — generalized here to "if
a census entry you expect is MISSING, suspect the derivation before
trusting the pass"). Fixed; the corrected census is below.

### 4. Unit tests

`frontend/tests/unit/state/feasible-layout.test.ts` (18 tests) —
`px()`'s four refusal/acceptance cases; `measured()`'s five
construction/refusal cases including the exact "534 exceeds 139" shape
the review's own `ToolbarEngineMetrics.vue` witness names;
`FeasibleLayout.validate()`'s starved+hoarding pair from ONE call (the
review's own 613px-tree/0px-controlPanel canonical instance), the
"skipped as not modeled" case, the presence-as-zero omission case (with a
sanity check proving the SAME candidate DOES starve when the demand isn't
omitted, isolating what suppresses the diagnostic), and the axis-mismatch
case; `resolveSovereignOverrides()`'s exemption, its casualty diagnostic
(location/starved/message/remediation/nextAction all asserted), its
"never checks the overridden region" case, and its empty-diagnostics
shape.

`frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts` also
carries adapter-level unit assertions (6 tests): the aspect-exclusion, the
untracked-Exclusive-tab-child exclusion, the nested-split reachability,
the `preferred = min` synthesis, `controlPanel`'s fixed 664/664/664
triple in both classes, and that every emitted entry is independently
constructible via `measured()`.

---

## Full diagnostic census (the centerpiece)

Fourteen geometries, forty diagnostics, all `starved` (see "Honest limits"
below for why no `hoarding` diagnostic can appear at this step).

```
landscape 1280x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_app (v): demand=28px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
landscape 1366x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_app (v): demand=28px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
landscape 1600x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
landscape 1800x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
landscape 1920x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
landscape 2200x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
landscape 2560x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
landscape 2880x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
landscape 3000x1000:
    STARVED  boardRail (h): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
portrait 420x880:
    STARVED  boardRail (v): demand=168px granted=0px
    STARVED  A_app (v): demand=56px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
portrait 540x960:
    STARVED  boardRail (v): demand=168px granted=0px
    STARVED  A_app (v): demand=56px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
portrait 768x1024:
    STARVED  boardRail (v): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
portrait 1080x1920:
    STARVED  boardRail (v): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
    STARVED  controlPanel (h): demand=664px granted=0px
portrait 1200x1600:
    STARVED  boardRail (v): demand=168px granted=0px
    STARVED  A_setup (v): demand=92px granted=0px
=== 40 diagnostics across 14 geometries ===
```

**Reading the census.** Three findings recur structurally at (nearly)
every geometry — `boardRail`/`A_setup` (both `presenceDefaultVisible:
false`, so their literal compiled candidate is `0px` against a nonzero
fixed-track floor at EVERY geometry regardless of width) and, at narrow
landscape widths and every portrait width, `controlPanel` (demoted below
its own compiled threshold, or off by default in portrait). These are the
"presence and starvation are indistinguishable today" mechanism §1.3 was
designed to eventually separate — not a step-1 discovery of a NEW defect,
but the literal, undifferentiated behavior `min`-only validation surfaces
before that separation is wired in (spec §3 step 1's own text: "min-only
validation already catches the review's own... starved-control-panel
instance[s]").

`controlPanel` clears at landscape widths ≥1600 in this derivation
(present and exactly satisfied at its own 664px fixed track) — narrower
than the review's own live-DOM witness of demotion persisting through
1920 and even 2560 (§Class 1, `02-workspace-1920.png`/`25-setup-open.png`).
This is a genuine, disclosed gap between this derivation's static formula
evaluation and the review's live-browser measurement, not a contradiction
of the review's finding: the review measured the REAL rendered DOM (real
font metrics, real flex/grid interaction with siblings this derivation
approximates); this suite evaluates the compiled program's OWN declared
formula in isolation. Worth naming as a concrete, load-bearing reason a
later step's gate should prefer live-DOM measurement over static
derivation once one is available (the review's own mount-time Fit
assertion, spec §3 step 2's gate).

**On the missing hoarding-tree pairing, named rather than silently
absent.** The dispatch brief anticipated the review's own canonical
starved-control-panel + hoarding-tree PAIR appearing together at
1920x1080. Only the starved half appears in this census, and it is not an
adapter defect: `measuredFromLytProgram` synthesizes `maxUseful: null` for
EVERY plain-`elastic` leaf (`tree` among them) — this is §3 step 1's own
explicit, named design ("step 1 changes nothing about what the app
allows... `maxUseful: null`... which is most leaves today"), not a
derivation choice made for this build. A `hoarding` diagnostic requires a
non-null `maxUseful` to be exceeded (`FeasibleLayout.validate`'s own `d.
maxUseful !== null && got.px > d.maxUseful` guard); `tree` cannot produce
one until step 2 populates its track as `elastic-capped`. The review's
613px-tree/60px-content finding remains real; it is invisible to a
`min`-only pass by construction — this IS what "step 1 makes the current
permissiveness explicit and checkable" means for the hoarding half
specifically. Verified directly by a dedicated test
(`never produces a hoarding diagnostic for 'tree' — maxUseful is null by
step 1's own design, not an adapter gap`), not left as an unexplained gap
in the numbers.

**A second honest limit, named.** CSS Grid never shrinks a track below
its own declared minimum (it overflows the container instead); this
derivation mirrors that — every visible track resolves to AT LEAST its
own min/px, even when siblings overcommit the container. Consequence: this
census's `starved` diagnostics arise EXCLUSIVELY from the presence/demote
0px mechanism, never from genuine sibling overcommitment (which manifests
as container OVERFLOW — the review's own 5px/30px horizontal-escape
findings, §Class 2 — a defect class `Measured`/`FeasibleLayout` as
specified does not yet catch, since `validate` checks each `(region,
axis)` pair against its OWN candidate, never against a container-capacity
sum). Flagged here as an honest scope limit of the type as specified, not
folded silently into the spec's own six §5 open questions.

---

## Per-directive coverage (dispatch scope items 1–5)

1. **`feasible-layout.ts` types (§1.1/§1.2/§1.3/§1.6).** Delivered at one
   site — `frontend/src/state/feasible-layout.ts` — every named type/
   function present: `Px`/`px`, `OverflowDiscipline`, `Measured`/
   `measured`, `RegionAllotment`, `StarvationDiagnostic`, `FeasibleLayout`
   (private ctor + static `validate`), `RegionPresence`, `SovereignOverride`,
   `SovereignOverrideDiagnostic`, `resolveSovereignOverrides` (real
   threaded signature). ADR-0006 header present. ADR-0002 loud refusals in
   `px()`, `measured()`, and both exhaustiveness guards. WITNESSED —
   `vue-tsc -b` and `eslint .` both clean against the file.
2. **`measuredFromLytProgram` adapter.** Delivered at one site, same file.
   Fixed/elastic/elastic-capped mapping per spec; board-priority-* and
   aspect-locked leaves excluded and documented; preferred=min synthesis;
   axis from enclosing-split context. WITNESSED — six dedicated adapter
   unit tests plus the geometry-sweep suite's own live use against both
   real compiled programs.
3. **Report-only CI gate.** Delivered at one site —
   `feasible-layout-geometry-sweep.test.ts`. Covers all nine landscape
   sweep widths and all five portrait sweep sizes (14 geometries, matching
   the dispatch's own list exactly). Asserts only the meta-property (never
   `diagnostics.length === 0`) — confirmed report-only by inspection: the
   suite is 100% green regardless of the 40 real diagnostics it surfaces.
   Full census emitted via `console.info` and reproduced above,
   non-empty — WITNESSED, per the brief's own "if empty, suspect your
   adapter" instruction, this passes.
4. **Unit tests.** Delivered — `measured()`/`px()` refusals (§1.1),
   `validate()`'s starved+hoarding-from-one-call plus presence-as-zero
   semantics (§1.2/§1.3), sovereign-override exemption + diagnostic shape
   (§1.6) — all in `feasible-layout.test.ts` (18 tests); adapter-level
   assertions in `feasible-layout-geometry-sweep.test.ts` (6 tests).
   WITNESSED — `vitest run` on both files: 42/42 pass.
5. **Gates by exit code.** `eslint .` → 0. `vue-tsc -b`/`npm run build` →
   0 (build completes, 1252 modules transformed). Full frontend suite —
   see "Gate results" below for the complete-run confirmation (run under
   `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
   `vitest --maxWorkers=2`, no browsers, no rigs, no ports, per the
   dispatch's own constraint).

**Scope narrowing/representation-fork disclosures (no STOP-and-report
warranted, both disclosed inline above and here):** the parameter-property
constructor syntax was replaced with explicit field declarations
(`erasableSyntaxOnly` TS config incompatibility, not a design choice);
`FeasibleLayout.screenClassId`'s type is a plain `string` rather than an
imported `LytScreenClassId` (deliberate one-directional-dependency
avoidance, matching the spec's own migration-map direction). Neither
changes the type's public shape or the spec's own invariants.

---

## Gate results

- `eslint .` (full frontend tree): **0** findings.
- `vue-tsc -b --noEmit`: **0** errors.
- `npm run build` (`vue-tsc -b && vite build`): **green**, 1252 modules
  transformed, no new warnings beyond the pre-existing chunk-size notice.
- `vitest run` (targeted, `feasible-layout.test.ts` +
  `feasible-layout-geometry-sweep.test.ts`): **42/42 pass.**
- `vitest run` (full frontend suite, `nice -n 19
  NODE_OPTIONS=--max-old-space-size=2048 --maxWorkers=2`): **green** —
  265 test files passed, 3 skipped (268 total); 3343 tests passed, 8
  skipped (3351 total); exit code 0; 264.6s wall.

---

## Claims: WITNESSED / UNEXERCISED

- **WITNESSED.** Every type in scope constructs and refuses as specified
  (18 direct unit tests). `FeasibleLayout.validate`'s starved+hoarding
  pairing surfaces from one call. `resolveSovereignOverrides` exempts the
  overridden region and names casualties correctly. The adapter's
  exclusion/inclusion boundaries (aspect-locked leaves out, untracked
  Exclusive-tab leaves out, nested-split leaves in) all hold against both
  real compiled programs. The census is non-empty and structurally
  explicable at every entry.
- **UNEXERCISED.** Whether this derivation's numeric track-solver
  actually predicts LIVE DOM behavior at the swept geometries (it does
  not attempt to — see "Reading the census" above for the disclosed
  landscape-controlPanel divergence from the review's own live
  measurement). Whether a richer step-1 gate that ALSO simulates
  non-default Exclusive tabs (settings/other active rather than library)
  would surface additional starved findings for `settingsSubstrip`/
  `SP_session`/`otherColorDebug`/`otherBand` — not attempted this step,
  since only the default/active tab is genuinely rendered in a fresh boot
  and simulating tab switches is a richer scenario than this sweep's own
  "fresh boot at each geometry" scope.

## Files touched

- `frontend/src/state/feasible-layout.ts` (new)
- `frontend/tests/unit/state/feasible-layout.test.ts` (new)
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts` (new)
- `frontend/FILES.md` (one entry added)

License: Public Domain (The Unlicense), per ADR-0006.
