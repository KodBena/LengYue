# ADR-0009: Performance Investigation Discipline

- **Status:** Accepted
- **Genre:** Tenet (cross-cutting authoring discipline) — the
  seventh tenet in this codebase, after ADR-0002 (fail-loudly),
  ADR-0004 (minimal-touch), ADR-0005 (documentation discipline),
  ADR-0006 (source-file headers), ADR-0007 (file size and
  information density), and ADR-0008 (classification discipline).
  Sibling of ADR-0008: same shape of unsubstantiated-claim failure,
  different domain — classification discipline forbids fuzzy
  vocabulary-fit; this tenet forbids unsubstantiated perf-fit
  ("this is faster," "this regressed," "no change") against the
  closed vocabulary of perf claims.
- **Date:** 2026-05-27
- **Scope:** All authoring work that asserts a performance
  property — improvement, regression, or null result — across
  `frontend/`, `backend/`, `proxy/`, and any sub-project added to
  the umbrella. Applies equally to the worklog that announces a
  change, the PR body that lands it, and the user-facing tour
  entry if one is added or revised.

## Context

The 2026-05-27 perf arc surfaced a recurring authoring posture
worth naming. Four sequenced fixes shipped under perf-improvement
worklogs, each landing real structural work (rAF-coalesced keydown,
O(1) `boardsById` lookup, PV-hover packet-watch guard, per-board
auto-save watchers). The same week, a Phase 2 dispatcher refactor
shipped without any attached profile, and within hours of release
a user-perceived near-threshold jitter prompted a follow-up
investigation that proceeded ad-hoc — `jq` queries derived against
a Firefox Performance profile, with no canonical metric vocabulary,
no shared profile-share format, and no pre-Phase-2 baseline
capture to enable direct comparison.

The investigation was diligent. It was also definitionally
ad-hoc: the project author named it as such, and named the
underlying preference — *"I really don't like ad-hoc anything"*
— as the trigger for codifying a discipline. The pattern's
component failures, generalised:

- **Perf claims without substantiation.** "This is faster" /
  "this regressed" / "no change observed" are closed-vocabulary
  assertions. Without a captured before/after profile attached
  to the claim, the assertion is the closest-match selection
  ADR-0008's positive register forbids — a defensible-looking
  classification picked without verification of fit.
- **Structural refactors of hot paths without a pre/post
  baseline.** A change that touches the keydown dispatcher,
  the reactivity graph, or any other path the user feels at
  60 Hz produces perception-level effects that no test surface
  catches. Without a baseline capture taken before the change
  lands, post-hoc investigation has no reference point against
  which to attribute any felt difference.
- **Per-investigation tooling re-derivation.** Each ad-hoc
  perf investigation re-derives its parsing infrastructure (the
  `jq` reverse-engineering of Firefox's columnar markers
  array), its metric definitions (which percentile? which
  event class?), and its filing convention (which profile lives
  where, referenced how). The cost compounds; the comparability
  across investigations drops.
- **User-perceived issues investigated without a captured
  profile of the perception.** A perception report is itself
  evidence (per the project's existing posture: *trust user
  signal over synthetic probe when they contradict*), but the
  perception's substrate — the runtime conditions under which
  the user felt the issue — vanishes if not captured. A future
  investigation cannot compare its profile against the user's
  reported feel without that substrate.

The pattern's structural root is the same one ADR-0002 names at
the runtime level and ADR-0008 names at the categorisation
level: when a closed-vocabulary claim is being made, the claim
is honest only when its substantiation is attached. The
documentation register of this discipline already lives in
ADR-0005 (documentation as you decide, not in retrospect); the
classification register in ADR-0008 (refuse fuzzy matches
against an inadequate vocabulary). The performance register —
perf claims as a closed vocabulary that the discipline must
gate — has been the missing piece, and this tenet is shaped to
fill it.

## Decision

We adopt **Performance Investigation Discipline** as a
codebase-wide tenet. A perf-property claim — improvement,
regression, or null result — is honest only when the
investigation behind it is captured in a form the next reader
can reproduce. The vocabulary of perf claims is closed; the
substantiation is what gives any specific claim its meaning.

### Triggers — when to profile

Three conditions warrant a profile capture before the work is
considered complete:

1. **Before claiming a perf improvement landed.** A worklog or
   PR body that asserts a change made something faster attaches
   the before/after profile pair that supports the assertion.
   Without the pair, the claim reduces to author intuition; the
   intuition may be right, but it is not the closed-vocabulary
   substantiation the worklog's reader will read it as.

2. **When investigating user-reported feel issues.** A
   perception report is itself triggering evidence (see
   "Calibration on perception" below). The investigation's job
   is to capture the runtime substrate of the perception while
   it is reproducible, then to attempt diagnosis against that
   substrate. The capture happens before diagnosis, not after —
   the substrate vanishes if not preserved while the symptom
   is producible.

3. **Before / after structural refactors that touch hot paths.**
   Changes to the keydown dispatcher, the reactivity graph, the
   per-frame paint cadence, the per-packet receive path, or any
   surface the user observes at interactive frequencies produce
   perception-level effects no test surface catches. A baseline
   capture before the refactor lands gives a reference point
   for post-hoc investigation if the refactor surfaces felt
   regressions later. Without the baseline, the investigation
   has no anchor; with it, the comparison is direct.

### Tools — canonical surface

Two tools earn canonical-tool status as of this tenet's
codification. The diagnostic uplift each delivers is
empirically established, not anticipated: the 2026-05-27
side-by-side comparison documented in
`docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md`
ran the same investigation question through an ad-hoc `jq`
method and a tooled method against the same profile substrate,
and the tooled method closed the per-component attribution gap
the ad-hoc method could not reach while collapsing wall-clock
investigation time from ~30+ minutes to ~10.

- **Firefox DevTools Performance**, with the frontend's
  `app.config.performance = true` setting enabled in dev. The
  flag instructs Vue to emit `performance.mark()` and
  `performance.measure()` points for component setup, render,
  patch, and unmount. These markers surface in the same profile
  timeline as everything else and attribute per-frame work to
  specific components / composables — the attribution gap whose
  absence had forced the ad-hoc investigation into
  marker-only-no-stacks territory, and which the tooled
  investigation closed with a single `thread markers
  --auto-group` query.
- **`@firefox-devtools/profiler-cli`** as the canonical parser
  for the Firefox profile JSON format. Replaces the ad-hoc
  `jq` reverse-engineering future investigations would
  otherwise re-derive. The empirical 30-min → 10-min reduction
  recorded in the comparison report establishes the uplift.
- **Chrome DevTools Performance + CDP-over-Playwright capture**,
  for *automated* and *concurrent-load (regime-B)* captures —
  added 2026-06-01 (see the amendment below). `profiler-cli`
  parses the Firefox profile format **only**: it cannot ingest a
  Chrome trace (`Image is not defined` — its Chrome-trace importer
  is browser-UI-only). A Chrome DevTools trace nonetheless carries
  every signal the metric vocabulary below names (per-component
  `render` / `patch` UserTiming spans, the harness marks), so the
  Chrome path uses a dedicated dependency-free parser
  (`frontend/scripts/perf-trace-parse.mjs`) rather than
  `profiler-cli`. Capture is scripted via
  `frontend/scripts/perf-capture.mjs` (Playwright drives the system
  Chromium through CDP `Tracing`). Firefox DevTools + `profiler-cli`
  remain canonical for **manual Firefox** investigation; the
  Chrome/CDP path is canonical for **automated / repeatable**
  capture.
- **CDP `HeapProfiler` (memory)**, for the leak-detection class —
  added 2026-06-01. The same Playwright/CDP harness drives it:
  `frontend/scripts/perf-heap.mjs` runs a scenario N times, forces GC
  and reads the retained heap each cycle (the *retained-heap
  tail-slope* metric below), and optionally writes a `.heapsnapshot`
  for attribution. Distinct from `Tracing` — the intra-run heap
  *counters* (`UpdateCounters`: heap / nodes / listeners / documents)
  are already in every capture (`disabled-by-default-devtools.timeline`
  emits them; the DevTools "Memory" checkbox only toggles the display
  lane), so `perf-trace-parse.mjs` surfaces that coarse grow-during-run
  timeline directly — but it is GC-sawtooth intra-run, NOT a leak metric;
  leak *detection* and *attribution* are the `HeapProfiler` domain.

The mechanical wiring that lands this decision: the one-line
DEV-gated `app.config.performance = true` ships in
`frontend/src/main.ts` (done), a contributor-doc pointer for
`profiler-cli` usage lands under `frontend/`'s README, and the
Chrome/CDP capture + parse scripts plus the pluggable scenario
harness (`frontend/src/composables/perf/`) land the automated path
(done 2026-06-01; see the amendment below). This ADR records the
decision; the wiring is the residual action.

### Metric vocabulary

A canonical metric vocabulary lets investigations compare
across time. The vocabulary the 2026-05-27 investigation used,
codified here as the project's starting set:

- **Per-handler duration distributions** (p50 / p90 / p99) for
  the event class under investigation — `keydown`, `wheel`,
  `pointermove`, packet-receive, render-tick.
- **Per-active-frame `RefreshObserver` duration** (p50 / p99)
  — the per-frame work the browser does between paints.
- **`LongTask` count and cumulative duration** over the profile
  window — the surface a sustained-input modality presents to
  the main thread.
- **`GCMinor` and `GCMajor` count / sum** — the
  allocation-pressure substrate; useful for the per-packet
  normalisation and per-frame reactivity paths.
- **Inter-arrival distributions** for cadence questions — the
  gap between events of the same class, useful when the
  question is "is the dispatcher backing up?".

- **Per-component cost ranking** aggregates *both* the `render`
  and the `patch` UserTiming marks Vue emits (under
  `app.config.performance`), not `render` alone; a component whose
  `render` cost dominates its `patch` cost (`render` ≫ `patch`) is
  read as render-coupling — the whole render function re-running on
  a reactive read it should not hold (see ADR-0010). Ranking by
  `render` alone hid the #1 cost (`TreeWidget render`) for most of
  the 2026-05-31 "green" arc; the `patch` marks were present in the
  same profile all along.

- **Retained-heap tail-slope per cycle** is the memory-leak metric
  (added 2026-06-01). A leak surfaces only under *repetition*: drive a
  scenario N times, force a major GC between cycles (CDP
  `HeapProfiler.collectGarbage`), and read the *retained* heap
  (`Runtime.getHeapUsage` post-GC). The discriminant is the **slope of
  the retained-heap series over the steady-state tail** (last third),
  in KB/cycle — NOT the whole-series slope. **Calibration
  (warmup-vs-leak):** one-time allocations — V8 inline-cache / compiled-
  code warming, lazy singletons, bounded caches filling — inflate the
  *early* cycles, so the whole-series slope over-reads them; a genuine
  unbounded leak (module-scope state keyed by an id a cleanup forgot, a
  listener never removed) keeps the *same* per-cycle delta into the
  tail. A high whole-slope with a flat/sub-threshold tail-slope is
  bounded warmup, NOT a leak. A `--warmup` run before the baseline
  absorbs the one-time init so only steady-state growth is measured.
  Attribution (which constructor / retainer) is a `.heapsnapshot`
  (`HeapProfiler.takeHeapSnapshot`) opened in DevTools → Memory.

Reusing the same vocabulary across investigations is the
discipline; the vocabulary itself is expected to extend as new
investigation classes surface. Additions go here, not in
per-investigation worklogs.

### Profile-share convention

Captured profiles live in a user-local location (the project
author's convention is `~/perf-profiles/`), referenced from
worklogs and PRs by path + timestamp + gzipped size, not
pasted inline. Profile binaries do not enter the repository —
they are user-local diagnostic artifacts whose value is in
being shared with the next investigator, not in being
versioned. The reference shape:

> `~/perf-profiles/2026-05-27-arrow-hold-baseline.json.gz`
> (660 KB gzipped, 3.3 MB uncompressed, ~70 keydowns over a
> few seconds)

A worklog or PR that asserts a perf property names the
profile(s) it relies on by this reference shape, so the next
reader knows which substrate to request if they want to
reproduce the analysis. The 2026-05-27 keybindings Phase 2.1
worklog is the first instance of the convention applied at
authoring time.

The location is user-local and may vary by machine (Revisit #5):
on the current dev host, Chrome DevTools traces (which are large
— tens of MB uncompressed) live under `~/w/vdc/chromium_profiles/`
for space reasons, overriding the `~/perf-profiles/` default for
that trace class. The discipline (reference by path + timestamp +
size; binaries stay out of the repo) is unchanged; only the path
differs.

### Acceptance criteria for perf-claimed changes

A change whose worklog or PR body asserts a perf property
attaches its substantiation:

- **Perf-improvement claims** attach a before/after profile
  pair, both captured under the same reproducible scenario
  (same board count, same input cadence, same configuration).
  The metric vocabulary above is the comparison axis.
- **Regression-investigation worklogs** attach the captured
  profile even when the conclusion is "no regression found."
  The negative finding is itself evidence — it tells the next
  reader the investigation was substantive, and it gives them
  a baseline for any future investigation of the same surface.
- **Structural-refactor PRs touching hot paths** attach the
  pre-refactor baseline capture as a separate reference in the
  PR body, so a future reader investigating felt effects has a
  reference point.

The absence of substantiation does not block the change from
landing — perf work proceeds at the author's judgement — but
the worklog states the absence explicitly rather than carrying
an unsubstantiated claim. The shape: *"This change is
defensively sound but is not substantiated by a profile pair;
the speculative win is `<X>`, the cost is `<Y>`, the user-side
test is the gate."* This is the loudly-marked unsubstantiated
case, parallel to ADR-0008's `[experimental]` and `[B?]` tags
— an honest admission of what the investigation did and didn't
cover, not a fuzzy-fit claim against the closed vocabulary.

## Calibration on perception

A user-perceived performance issue is legitimate triggering
evidence. Perception substantiates the *trigger*; the
investigation is the attempt to substantiate the *diagnosis*.
The two are different acts and this tenet does not collapse
them. The investigation's substantiation lives in the captured
profile and the conclusion drawn from it, whichever way that
conclusion lands.

The investigation's outcome falls into one of three
distinguishable classes, each with its own correct response:

1. **User perceives, measurement substantiates.** The
   investigation grounds the diagnosis; the fix follows from
   what the measurement shows. Standard case; no further
   calibration needed.

2. **User perceives, measurement finds nothing.** The
   investigation legitimately concludes the perception was not
   measurable. Possible causes include environmental factors
   on the user's side, confirmation bias, imagination, or a
   real effect below the measurement floor of the chosen
   tools. The user being wrong about a perception is itself a
   legitimate measurement outcome to surface, not a failure
   of the investigation. Acceptable responses include:
   (a) ship defensive structural improvements the perception
   pointed at if they are separately warranted on their own
   merits; (b) acknowledge the null finding and accept it as
   the verdict; or both. Choice between (a), (b), or the
   combination is per-arc judgement; this tenet does not
   mandate either. The 2026-05-27 arc happened to land both —
   defensive Phase 2.1 micro-optimisations and the null
   verdict on the Phase 2 regression question — but a future
   arc that lands only the null finding is equally
   well-formed under this tenet.

3. **User perceives, measurement contradicts.** This is the
   case the project's existing *trust user signal over
   synthetic probe when they contradict* posture covers. The
   correct response is to investigate whether the probe is
   under-specified before generalising its negative finding —
   the probe may be measuring the wrong axis, the wrong
   window, or at the wrong granularity.

Cases 2 and 3 are orthogonal, not the same situation
differently described. In case 2 the measurement is taken to
be sound and the perception is taken to be the thing under
question; in case 3 the measurement is taken to be suspect
and the perception is taken to be the thing the measurement
should have caught. The 2026-05-27 investigation was case 2
(per-component attribution via the Vue flag closed the
measurement gap the prior investigation lacked, and the
resulting measurement found no regression). The orthogonality
matters because the *trust user signal* posture, applied
unaltered, would produce the wrong answer in case 2:
contradictory measurement is not always evidence of an
under-specified probe.

The discipline survives all three cases: investigate the gap
honestly, report the finding (whether it confirms or
contradicts the perception), do not pre-commit to either
side being privileged. The
`docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md`
report's §"The orthogonal posture this null finding
illustrates" carries the worked example of the case-2 / case-3
distinction.

The failure mode this tenet does forbid is the inverse of all
three: a perf claim made without an investigation having
taken place at all. "Faster" / "no regression" asserted on
author intuition alone, unaccompanied by either a captured
profile or an explicit "unsubstantiated" qualifier, is the
silent-failure shape this tenet exists to prevent.

## Consequences

### Positive

- **Perf claims become legible across time.** A worklog whose
  claim is backed by a profile reference is one a future
  investigator can extend; a claim without it is a dead end
  the future investigator has to re-derive from scratch.
- **Substantiation cost is paid up-front.** Capturing a
  profile during the work is cheaper than reconstructing the
  runtime conditions later. The discipline composes with
  ADR-0005's "author as you decide, not in retrospect."
- **Perception evidence and quantitative evidence compose
  without conflict.** The tenet names both as legitimate at
  the trigger / substantiation distinction, removing the
  category error that would otherwise force them into
  competition.
- **Tooling investment pays back across investigations.**
  Adopting `app.config.performance = true` once and
  `profiler-cli` once amortises across every future perf arc;
  the per-investigation re-derivation cost drops to near zero.

### Negative

- **Per-perf-claim authoring overhead.** Each perf assertion
  now carries the question "is this substantiated?" and the
  answer must be either "yes, profile attached" or "no,
  explicitly marked unsubstantiated." Real cost in aggregate.
- **Discipline is policy, not mechanism.** Like the other
  tenets, this one lives in code review, worklog authoring,
  and audit. No automated check verifies that a worklog's
  perf claim is backed by a referenced profile.
- **Profile-share convention is user-local.** Profiles live
  outside the repository; a contributor who lacks the
  referenced profile must request it. This is the right
  trade — versioning multi-MB diagnostic binaries fights both
  the repository's scope and the profiles' intended lifecycle
  — but it does introduce a coordination step that did not
  exist before.

### Neutral

- **No retroactive sweep.** Existing worklogs whose perf
  claims lack substantiation are not targeted for rewrite.
  ADR-0004 / ADR-0006's incremental-retrofit posture applies:
  the discipline operates at the moment of new authoring; old
  worklogs stay as they are.
- **No mandate on a specific benchmark suite or harness.**
  The tenet names tools and metrics, not a specific
  reproducibility harness. The "same reproducible scenario"
  requirement for before/after pairs is left to per-arc
  judgement; over-prescribing here would fight the
  variety of perf surfaces (input cadence, board count, packet
  rate, paint frequency) the project actually has.

## Exceptions

### Trivial perf-adjacent changes

A change whose perf effect is structural-by-inspection — an
O(N²) replaced by O(N) at a hot path, a redundant computation
removed, an obvious allocation eliminated — does not require
a profile pair to land. The structural argument substantiates
the claim. The worklog still names the structural argument
explicitly; what it does not need is the captured profile.

This parallels ADR-0002's UI-input-validation exception:
when the win is structurally provable, the empirical
substantiation is redundant. The discipline catches the
*non-trivial* cases where structural argument alone is
insufficient.

### Unsubstantiated-by-design speculative ships

A defensive micro-optimisation whose theoretical win is small
enough that profile capture wouldn't reliably detect it ships
under the explicit-unsubstantiated qualifier. The 2026-05-27
Phase 2.1 micro-optimisations are the first worked example:
two trims of constant-factor work per coalesced dispatch, each
on the order of a single Proxy trap or function call, against
a per-dispatch budget already at 22 µs at median. Sub-
threshold-of-measurement by construction; the worklog marks
the speculation explicitly.

### Worklog-internal exploratory observations

A worklog may include exploratory perf observations made
during investigation without elevating them to the
authoritative-claim register — "I noticed X in the
investigation; further investigation needed before X becomes
a load-bearing finding." The discipline applies to the
authoritative register, not to the exploratory.

## Revisit when…

This tenet would be worth reconsidering if:

1. **A specific rule introduces its own failure mode.**
   Unlikely but worth flagging as the trigger for revisit.
2. **The canonical-tool surface needs replacement.** Firefox
   DevTools Performance and `profiler-cli` are the right
   surface today; if the project's platform changes (a different
   browser becomes the development target, an alternate
   profiling stack becomes substantially better) the canonical
   surface updates accordingly. The tenet's discipline survives
   the substitution; only the tool names change.
3. **The metric vocabulary stops covering the perf-relevant
   axes.** A new perf-investigation class — say, WebSocket
   back-pressure analysis, or worker-thread scheduling — that
   doesn't fit the existing metric set warrants extending the
   vocabulary. Extensions go in this ADR via the append-a-rule
   pattern, following the precedent ADR-0002 and ADR-0005 set.
4. **A linter or CI gate can mechanise the substantiation
   check.** A check that scans worklog / PR text for perf-claim
   tokens and verifies adjacent profile-reference markers would
   partially mechanise the discipline. Not feasible today; flag
   as the trigger for relaxing the policy from "review
   responsibility" toward "compile-time-equivalent enforcement."
5. **The user-local profile-share convention proves
   insufficient** — e.g., a multi-contributor scenario where
   profiles need shared storage. At that point the convention
   updates; the discipline survives.

## Related

- **ADR-0002 (fail loudly).** The reactive ancestor. An
  unsubstantiated perf claim is the silent-failure shape
  ADR-0002 names at the runtime level, applied to the
  worklog / PR-body authoring register. This tenet is one of
  the per-domain instances of ADR-0002 Rule 6 (design-time
  drift surfaces too): a perf claim that turns out to be
  wrong, made without substantiation, is the design-time
  drift that vanishes silently into the post-state.
- **ADR-0005 (documentation discipline).** Perf claims are
  documentation events; the per-domain authoring discipline
  for them composes with the umbrella discipline ADR-0005
  governs. Rule 6 of ADR-0005 (author as you decide, not in
  retrospect) is the temporal posture this tenet relies on
  for profile capture — captures during the investigation,
  not reconstructed after.
- **ADR-0008 (classification discipline).** The proactive
  sibling. "Perf improvement" / "regression" / "no change" are
  closed-vocabulary claims; ADR-0008's positive register
  forbids fuzzy matches against inadequate vocabularies. This
  tenet is the per-domain instance for the performance
  vocabulary: substantiation by attached profile is the
  vocabulary-fit verification ADR-0008 implies for this
  register. The two tenets compose the same way ADR-0002 and
  ADR-0008 do — different intervention points on the same
  family of unsubstantiated-claim failures.
- **`docs/notes/audit/perf-audit-nav-and-pv-hover-2026-05-27.md`** —
  the worked example of a more-structured perf investigation:
  symptom matrix, root causes ranked by severity, eliminated-as-
  cause section, multi-tasking preservation requirements, per-
  fix verification gates. The shape this tenet encourages for
  investigation-class worklogs.
- **`docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md`** —
  the side-by-side comparison of ad-hoc `jq` against
  `profiler-cli` + Vue's `app.config.performance` flag, on the
  same investigation question. Empirically substantiates the
  canonical-tool decision in the Tools section above, and
  documents the case-2 (measurement-finds-nothing) outcome the
  Calibration section names. Optional grounding for agents
  who want concrete detail on the investigation that informed
  this ADR — not required reading; this ADR's body stands on
  its own and the report's depth is available for those who
  want it.
- **`docs/worklog/2026-05-27-keybindings-phase2.1-micro-optimizations.md`** —
  the worklog whose investigation triggered the codification
  of this tenet. The "Perf tooling notes" section of that
  worklog flagged this ADR as the natural follow-up.
- **`docs/worklog/2026-05-27-perf-fix1-raf-coalesce-keydown.md`**,
  **`docs/worklog/2026-05-27-perf-fix2-boards-by-id-lookup.md`**,
  **`docs/worklog/2026-05-27-perf-fix3-pv-hover-watch-guard.md`**,
  **`docs/worklog/2026-05-27-perf-fix4-per-board-watchers.md`** —
  the four perf-claimed worklogs that pre-date this tenet.
  Each substantiates its claim structurally (via the audit
  doc's diagnosis) rather than empirically; the trivial-change
  exception above is what their substantiation shape
  retroactively becomes under this tenet.

## What this tenet does NOT mean

- **Not a profile-capture mandate for every change.** Changes
  with no perf claim attached do not need a profile. The tenet
  operates on the assertion register, not on every commit.
- **Not a benchmark-suite requirement.** The tenet names tools
  and metrics, not a shared benchmark harness. Per-arc
  reproducibility is the contributor's judgement; a future
  arc that produces a shared harness can update the tenet at
  that time.
- **Not a quantitative-confirmation gate on perception.** A
  user-perceived feel issue triggers investigation; the
  investigation's profile is the substantiation of the
  *investigation*, not of the *perception*. Perception
  stands on its own as triggering evidence per the
  Calibration section.
- **Not a refactoring mandate for existing perf claims.** No
  retroactive sweep of existing worklogs. Incremental retrofit
  when files are touched for other reasons, per ADR-0004 /
  ADR-0006.
- **Not a substitute for ADR-0002 or ADR-0008.** This tenet
  catches the specific failure shape — unsubstantiated perf
  claims — in the specific register where it surfaces;
  ADR-0002's reactive register and ADR-0008's proactive
  register cover the broader family of failures this is one
  instance of.

## Resolved (user review, 2026-05-31)

The drafter flagged three decisions for the user; resolved on
acceptance:

1. **Profile-share location.** `~/perf-profiles/` **is** the
   location — the settled convention captures live under, referenced
   from worklogs and PRs by the path + timestamp + gzipped-size shape
   above. (Not mandated as a hard gate; it is the project convention,
   consistent with the non-blocking posture in #2.)
2. **Acceptance-criteria stringency.** The middle position stands:
   **pragmatic but rigorous, and non-blocking.** A perf-claimed change
   is *not* gated on the profile pair — but an unsubstantiated claim
   must carry the explicit qualifier rather than reading as a
   closed-vocabulary assertion. The discipline is the loud-marking, not
   a merge gate.
3. **Tenet vs. decision classification.** A **tenet** — a cross-cutting
   authoring discipline, as the drafter filed it.

## Amended (2026-06-01): Chrome/CDP capture path + scenario harness

Revisit trigger **#2** ("the canonical-tool surface needs replacement …
an alternate profiling stack becomes substantially better") fired, in the
specific form the trigger anticipated: an *automated, repeatable* capture
stack became available where the manual Firefox-DevTools flow could not
reach. The discipline survives the substitution unchanged; only the tool
surface extends. What changed:

- **A second canonical capture surface** — Chrome DevTools Performance via
  CDP-over-Playwright — is added for automated and concurrent-load
  (regime-B) captures, recorded in the Tools section above. The empirical
  fact forcing the split: `@firefox-devtools/profiler-cli` cannot ingest a
  Chrome trace (`Image is not defined`), so the Chrome path gets a
  dedicated dependency-free parser (`frontend/scripts/perf-trace-parse.mjs`)
  that produces the same metric vocabulary (per-component `render`/`patch`
  ranking, the render≫patch render-coupling tell) the Firefox tooling does.

- **A pluggable scenario harness** (`frontend/src/composables/perf/`,
  `window.__perfScenario`) addresses the "same reproducible scenario" the
  acceptance criteria require for before/after pairs — the thing the
  Consequences §Neutral "No mandate on a specific benchmark suite or
  harness" deliberately left to per-arc judgement. **This is still not a
  mandate.** The harness is the *recommended* way to achieve a reproducible
  scenario (especially regime-B: UI navigation concurrent with a streaming
  range analysis, which the manual hold-arrow flow could not reproduce);
  per-arc judgement still governs whether to use it. The Neutral clause is
  not overturned — a harness now *exists* and is recommended; the tenet
  still does not *require* it.

- **The capture protocol is a contributor choice, recorded per-capture.**
  The first sanity capture used b10 / 1000 visits-per-move / no adaptive
  re-evaluation / cold cache (the protocol the green arc used implicitly).
  The harness pins these explicitly (`connectEngine({model, adaptive})`,
  `clearCache()`) so a capture is self-describing rather than dependent on
  ambient browser state — directly serving the reproducibility this tenet
  exists to protect. Cold-cache is load-bearing: a warm KataGo result cache
  returns cached packets instantly, suppressing the per-packet render work
  the capture is meant to measure (see the perf-capture normalization
  protocol).

- **Memory profiling folds onto the same harness** (the quartet's item 3).
  `frontend/scripts/perf-heap.mjs` drives a scenario N times, forces GC and
  reads the retained heap per cycle (CDP `HeapProfiler`) → the
  *retained-heap tail-slope* metric added to the vocabulary above. The
  first session found the board-lifecycle and analysis-lifecycle paths
  (create → load → analyze → `closeBoard`, ×40 and ×12) **leak-free**:
  retained heap plateaus, tail-slope flat — the resource-ownership
  cleanups hold. Full record:
  `docs/worklog/2026-06-01-memory-profiling-session.md`.

Full record: `docs/worklog/2026-06-01-perf-scenario-harness.md`.

## License

Public Domain (The Unlicense).
