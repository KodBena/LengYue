# Performance Investigation Tooling — Side-by-side Comparison (2026-05-27)

Archival record of two parallel performance investigations
conducted on the same day, ad-hoc-then-tooled, occasioned by
the keybindings Phase 2 dispatcher rewrite (PR #283) and a
user-reported near-threshold jitter perception. The
investigation prompted ADR-0009 (Performance Investigation
Discipline); ADR-0009 references this document as optional
grounding — read for context, but the workflow recorded here
is descriptive, not template. Future investigators should
exercise sound judgement on what tools and queries fit the
question at hand.

The two investigations target the same subject (does the Phase
2 dispatcher cause a perceptible perf regression?), span the
same code base in the same morning, and produce the same
verdict (no regression detected). Their difference is the
toolchain — Method A is ad-hoc `jq` against a markers-only
Firefox profile; Method B is `@firefox-devtools/profiler-cli`
v0.2.0 against a profile captured with Vue's
`app.config.performance = true` enabled. The comparison is what
this document is for.

## Background

The Phase 2 commit (`bbd75c1`) replaced the hardcoded keydown
switch in `useUserIORegistry` with a registry-driven
dispatcher. The user tested locally and reported jitter while
holding ArrowDown, "near the threshold of noticeability,"
explicitly acknowledging they might be imagining it.

The first investigation (Method A) ran against two Firefox
profiles — an arrow-key hold and a wheel-scroll — both captured
against then-current main with the dispatcher rewrite live.
Per-handler durations + RefreshObserver costs were extracted
via hand-rolled `jq` queries reverse-engineering Firefox's
profile-JSON columnar marker format. The conclusion was "no
smoking-gun Phase 2 regression visible in markers; perception
plausibly inherent to sustained-input modality."

The second investigation (Method B) ran after the user pushed
for stronger ground-truth: re-capture a before/after pair on
the precise commits the regression-claim brackets (commit
`4725eed` = main immediately before any keybindings work;
commit `bbd75c1` = Phase 2 dispatcher rewrite), with Vue's
`app.config.performance = true` enabled in the dev build so
per-component patch/render marks would appear alongside the
browser-side markers.

## Method A — ad-hoc `jq` on markers-only profiles

### Capture

- Arrow profile: user held ArrowDown for "a few seconds" against
  current main (post-#283-merged).
- Wheel profile: user did "four scrollings" on the same SPA
  state.
- Saved as gzipped JSON via Firefox DevTools' Performance panel.

### Investigation procedure

The Firefox profile format is a JSON document with per-thread
columnar marker arrays and a global string table. Vue's
`app.config.performance` flag was NOT set, so the profile
contained only browser-side markers (`DOMEvent`,
`RefreshObserver`, `RefreshDriverTick`, `Styles`, `LongTask`,
`GCMinor`, `MozAfterPaint`, etc.) — no per-component
attribution.

Queries iterated to answer the question "what is the per-step
work distribution?":

1. `jq 'keys'` — discover top-level structure.
2. `jq '.meta.markerSchema[].name'` — enumerate marker types.
3. `jq '.threads[] | {name, isMainThread, ...}'` — identify
   the heaviest content thread.
4. Pair phase-2 / phase-3 `DOMEvent` markers manually to compute
   per-event durations (Firefox uses two-phase markers for
   intervals; the format isn't documented in obvious places, so
   the pairing logic was reverse-engineered from the data).
5. Compute `keydown` / `wheel` event-duration distributions
   (p50, p90, p99, max, sum) via inline sort + percentile-index
   arithmetic in `jq`.
6. Compute `RefreshObserver` interval durations as the per-
   active-frame work proxy.
7. Compute `LongTask` count + cumulative-duration as the
   "perceptible-pause" proxy.
8. Compute `MozAfterPaint` inter-arrival distributions for
   frame-pacing.

### What was visible

- Per-handler event-dispatch duration distributions.
- Per-frame `RefreshObserver` total work (aggregated; not
  attributable).
- LongTask count and cumulative cost.
- GC pause count and cost.
- Paint frame inter-arrival distributions.

### What was NOT visible

- **Which component(s) consumed the per-frame work.** The 6ms
  median `RefreshObserver` per active frame was opaque — known
  only that it included rAF callbacks + Vue reactivity walks +
  styles + layout, with no way to attribute fraction to
  component-level patches or renders.
- **Whether specific components were doing more work in one
  scenario vs the other.** The arrow-vs-wheel comparison was
  done at the aggregate `RefreshObserver` level, not at the
  per-component level.

### Time + verdict

- Approximately 30+ minutes of iterative `jq`. Each query
  required reverse-engineering some aspect of the format
  (column structure, phase semantics, string-table lookup).
  Several queries returned empty results before the structure
  was understood.
- Conclusion: no smoking-gun Phase 2 regression in the data,
  but the attribution gap meant the verdict came with low
  confidence on "what's the 6 ms per frame doing."

## Method B — profiler-cli + Vue `app.config.performance = true`

### Capture

A small change to `frontend/src/main.ts` (uncommitted, working-
tree only, dev-gated):

```ts
if (import.meta.env.DEV) {
  app.config.performance = true;
}
```

Two profiles captured against the precise before/after commits:

| Profile | Commit | What it isolates |
|---|---|---|
| Before | `4725eed` | Main immediately before any keybindings work |
| After | `bbd75c1` | Phase 2 dispatcher rewrite commit |

Capture protocol: scroll through an entire game (deterministic
stopping criterion, vs the earlier "few seconds" timing). Each
profile ~1.1 MB gzipped, ~7 MB uncompressed.

Note: the first re-capture attempt produced an empty `.json.gz`
because the disk was full (Firefox writes silently on ENOSPC);
this surfaced when an attempt to install profiler-cli also
failed with ENOSPC. User cleared cache; both captures
succeeded on retry. Worth noting because the failure was
silent — the file existed at 0 bytes, no error surfaced until
attempted use.

### Investigation procedure

```bash
# Install profiler-cli (npx; v0.2.0 is brand new, published
# 2026-05-26, but the API shape is solid for v0.x).
npx -y @firefox-devtools/profiler-cli --help

# Load each profile (daemon-session model — both sessions can
# be alive simultaneously for direct comparison).
npx -y @firefox-devtools/profiler-cli load ~/perf-profile-before-4725eed.json.gz
# Session started: c7oh0vejut

npx -y @firefox-devtools/profiler-cli load ~/perf-profile-after-bbd75c1.json.gz
# Session started: krvv3tzcrg

# Single command produced the per-component breakdown the
# earlier `jq` investigation never reached.
npx -y @firefox-devtools/profiler-cli thread markers --auto-group --top-n 20
```

The auto-group output paged the `UserTiming` markers (which is
what Vue's `app.config.performance` emits) by name, producing
per-component sub-groups directly:

```
By Name (top 15):
  UserTiming                 9696 markers  (interval: min=9.614μs, avg=1.240ms, max=109.22ms)
    Grouped by name:
    <BoardTab> render: 334 markers (avg=1.300ms, max=43.651ms)
      Examples: m-1194 ✗ (43.651ms), m-1359 ✗ (10.950ms), m-1360 ✗ (7.114ms)
    <BoardTab> patch: 334 markers (avg=324.71μs, max=6.129ms)
      Examples: m-1403 ✗ (6.129ms), m-1404 ✗ (3.882ms), m-1405 ✗ (1.394ms)
    ...
```

Switching sessions via `session use <id>` re-runs the same
query against the other profile; comparison was direct visual
inspection of two output blocks.

Custom `jq` was used once to compute side-by-side per-component
percentile distributions in a single pass (profiler-cli's
`--auto-group` reports min/avg/max only; p50/p90/p99 required
manual computation against the marker data).

### What was visible

Everything Method A surfaced PLUS:

- **Per-component patch and render duration distributions.**
  E.g., `<RootErrorBoundary> patch` averaged 9.99ms in both
  before and after — immediately identifying it as the
  dominant per-frame cost (inherent to its position wrapping
  the whole app; any reactive update propagates through it).
- **Drill-down via marker handles.** `marker info m-1192`
  pulls the full payload for the worst RootErrorBoundary patch
  outlier (109 ms in before, 99 ms in after).
- **CPU-activity bursts annotated automatically.** Profile-info
  shows e.g. "120% for 13.5ms: [ts-A → ts-b]" — high-CPU
  intervals surfaced without manual query.

### Time + verdict

- Approximately 10 minutes total. Per-component breakdown +
  before/after comparison + outlier drill-down — most of which
  was thinking time, not query-construction time.
- Conclusion (data-grounded): No per-component regression in
  before vs after. Every component's per-step patch/render is
  within noise; several slightly faster in after. Max outliers
  are also LOWER in after (RootErrorBoundary patch max 109 ms
  before vs 99 ms after). The dispatcher rewrite is invisible
  at the component-render level.

## Comparison

| Axis | Method A (jq) | Method B (profiler-cli + Vue flag) |
|---|---|---|
| Wall-clock investigation time | ~30+ min | ~10 min |
| Query count for per-component breakdown | unattainable | 1 |
| Per-handler durations | yes (reverse-engineered) | yes (one command) |
| Per-frame total work | yes (aggregated) | yes (aggregated) |
| Per-component attribution | no | yes |
| Outlier drill-down | manual (find timestamp, grep nearby markers) | one command (`marker info m-<N>`) |
| Multi-profile comparison | open two terminals | session-switch, same query |
| Capture preparation | none (just record) | one DEV-gated line in `main.ts` |
| Setup cost | nothing | one-time `npx -y @firefox-devtools/profiler-cli` |
| Conclusion confidence | medium (attribution gap) | high (per-component verified) |

## Null findings

The investigation produced a definitive null result: **no
Phase 2 regression detected at the per-component level**.
Every per-component patch/render duration distribution is
either within noise or slightly faster in after vs before. The
biggest per-frame cost (`<RootErrorBoundary> patch` at ~10 ms
median) is identical in both profiles and pre-exists Phase 2.

The user's reported perception of jitter, in this case, was
likely environmental, imagination, or confirmation bias — the
investigation could not reproduce the perception in
measurement.

### The orthogonal posture this null finding illustrates

The project's existing posture on user perception vs synthetic
probe (recorded in author memory as
"trust user signal over synthetic probe when they contradict")
was originally framed around a case where the probe was wrong
and the user was right (the under-specified probe had missed a
real signal the user had picked up). The lesson recorded there
was "investigate the probe's under-specification rather than
generalise its negative finding."

This investigation's null finding is the **orthogonal case**:
user signal triggered investigation; investigation concluded
the perception probably didn't reflect a measurable phenomenon.
Both outcomes — "user right, probe wrong" and "user perceives,
measurement doesn't substantiate" — are legitimate. The
discipline is to investigate the gap honestly and report
whichever way it lands, without pre-committing to either side
being privileged.

Said differently: the discipline is **trust the user signal
enough to investigate**, not **the user signal is always
literal truth**. The two are easy to conflate but cleanly
separable. Phase 2.1's micro-optimizations were still
defensively warranted (and harmless even under the null
finding); the verdict on "did Phase 2 introduce a perceptible
regression" remains "not detectable in measurement."

## What this report is NOT

- **Not a procedure manual.** The query sequences recorded
  above are this investigator's path through this investigation
  on this date; future investigators should exercise sound
  judgement on what tools and queries fit their question at
  hand. Profile-CLI's API will evolve; Vue's marker format may
  change; the marker schema in Firefox profiles continues to
  shift. The lessons worth carrying forward are the structural
  ones (Vue perf flag closes the per-component attribution gap;
  profiler-cli reduces query construction overhead), not the
  command incantations.

- **Not a guarantee against false negatives.** This
  investigation could not find a per-component regression in
  the data. It is possible — though not strongly supported by
  the data — that some sub-component-level or interaction-
  level cost shifted in a way that no per-component patch /
  render duration captures. The "no regression" verdict is
  bounded by what these specific metrics surface.

- **Not the ADR.** ADR-0009 is the tenet; this report is one
  data point informing one of its open questions (the tool
  adoption depth). Other open questions remain at the ADR.

## References

- **Triggering worklog:**
  `docs/worklog/2026-05-27-keybindings-phase2.1-micro-optimizations.md`
  (the Phase 2.1 commit that bundled the speculative
  optimizations and named the investigation).
- **ADR-0009:** `docs/adr/0009-performance-investigation-discipline.md`.
- **Vue performance docs:**
  https://vuejs.org/api/application#app-config-performance
  (documentation for `app.config.performance`).
- **profiler-cli:**
  https://www.npmjs.com/package/@firefox-devtools/profiler-cli
  (v0.2.0, published 2026-05-26).
- **The profile artefacts** are NOT committed to the repo;
  they live at `~/perf-profile-before-4725eed.json.gz` and
  `~/perf-profile-after-bbd75c1.json.gz` on the author's
  machine.

License: Public Domain (The Unlicense)
