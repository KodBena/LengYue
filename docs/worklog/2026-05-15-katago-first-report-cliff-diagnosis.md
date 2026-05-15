# KataGo `firstReportDuringSearchAfter` cliff — diagnosis arc

- **Status:** Diagnosis closed; root cause identified in KataGo
  upstream. Bug-report package staged at `~/katago_bugreport`
  pending the project author's executive bandwidth to file. SPA-side
  mitigation proposed (see "Proposed mitigation" below); the
  shipped-outcome companion is the sibling worklog
  `2026-05-15-katago-first-report-floor-mitigation.md`.
- **Genre:** Diagnosis arc. No SPA-side code change in this worklog
  except for one DEV-only instrumentation line that earned its keep
  during the investigation and stays in as a future diagnostic
  surface.
- **Date:** 2026-05-15.

## Context

The KataGo cadence-knobs feature shipped earlier today
(`docs/worklog/2026-05-15-katago-cadence-knobs.md`) promoting two
report-cadence values to user-controllable knobs:
`reportDuringSearchEvery` and `firstReportDuringSearchAfter`.
Defaults: 0.15 s cadence, 0.05 s first-after. The companion
structural fix in the frontend ledger
(`docs/worklog/2026-05-15-ledger-first-packet-sync-bump.md`) closed
the no-data → has-data rAF coalescer delay so the SPA's reactive
path no longer adds a one-frame lag to first paint. The cadence-
knobs worklog already named the upstream KataGo report timing as
"the dominant remaining first-paint contributor" — an informed
suspicion.

The author surfaced the failing scenario soon after merge:

> When the first report after is sufficiently low, the first report
> appears to be reached when the first "real" reported should have
> arrived. So for example, if cadence is around 2 seconds and I put
> "first report" around 0.03, then it takes at least 2 seconds for
> the first UI update.

The author also noted that KataGo's source advertises a 0.001 s
lower bound on `firstReportDuringSearchAfter` — so 0.03 s should
have been well above the documented floor. The symptom thus had two
suspect surfaces: an SPA-side delay between WebSocket receipt and
visible paint, or an upstream KataGo path that didn't honour the
documented lower bound.

## Investigation arc

Vector by vector (all headless, no manual UI reproduction needed):

### Ruled out: SPA receive path

`src/services/katago-client.ts:65-67` is a fully-synchronous
`onmessage → JSON.parse → dispatch` chain. `src/services/analysis-
ledger.ts:144-154` bumps the version ref **synchronously** on the
no-data → has-data transition (the rAF coalescer is explicitly
bypassed for first paint). No throttle, no debounce, no timer.
There is no SPA-side delay that would push first paint by seconds.

### Ruled out: KataProxy transformer chain / enricher / adaptive_reevaluate

Three sweeps against `~/kataproxy_logs/selector.jsonl`'s live
SELECTOR proxy (capabilities: `delta_analysis`, `adaptive_reevaluate`,
`selector`) showed the same cliff. Stripped capabilities, varied
opt-in (legacy auto-engage vs explicit none vs explicit
`delta_analysis` vs explicit `delta_analysis + adaptive_reevaluate`)
— pattern persisted. A separate sweep against the transparent
proxy at `192.168.122.1:1232` (KataGo native protocol only, no
extensions) showed the same cliff in cleaner form. Proxy
contribution: none for the cliff itself.

### Ruled out: kernel / libvirt boundary

The LengYue host is a libvirt guest (`192.168.122.68/24`), and the
proxies / KataGo binary run on the host (`192.168.122.1`). So WS
traffic crosses virtio-net. Decisively ruled out by reading the
LEAF proxy's own log timestamps: the 2.19 s gap sits between the
LEAF's `wrote to stdin` and the LEAF's `katago stdout` entries —
both timestamped inside the LEAF process on the host. No VM
boundary in that measurement. Magnitudes also rule it out:
realistic virtio-net / TCP / pipe-IO costs are µs–ms, not seconds.

### Confirmed: KataGo upstream

Three independent client stacks against the same KataGo 1.16.4
binary (Node + native WebSocket + KataProxy SELECTOR proxy; Node +
native WebSocket + transparent proxy; Python + `websockets` +
transparent proxy) all reproduced the same cliff. The
cadence-scaling sweep (cadence ∈ {0.5, 2, 10} s, `firstReportAfter
∈ {0.001 .. 0.3}` s) pinned the cliff at an **absolute ~25 ms
regardless of cadence**. Below the cliff, first packet arrives at
`reportDuringSearchEvery + ~70–100 ms`. The 0.020–0.030 s strip is
reproducibly non-monotonic across runs — flip-flop pattern
consistent with a race or off-by-something in KataGo's report-loop
scheduling.

Full data: `~/katago_bugreport/findings.md` and the captured logs
in `~/katago_bugreport/logs/`.

## What changed in the codebase

### `src/services/analysis-service.ts` — DEV-only per-packet arrival log (kept)

A small DEV-only timing log was added to `onAnalysisUpdate` during
the investigation:

```ts
if (import.meta.env.DEV) {
  const q = this.activeQueries.get(queryId);
  const dt = q ? (performance.now() - q.startedAt).toFixed(1) : 'n/a';
  console.log(
    `[analysis-service] packet +${dt}ms queryId=${queryId} `
    + `isDuringSearch=${response.isDuringSearch} rootVisits=${response.rootInfo?.visits} `
    + `moveInfos=${response.moveInfos?.length ?? 0} hasExtra=${!!response.extra}`
  );
}
```

A `startedAt: number` field was added to the per-query `activeQueries`
map entry (required, set at both `analyzeRange` and
`analyzeActiveNode` creation sites). The log was load-bearing for
the diagnosis — it confirmed the 2.2 s first-paint delay was at the
wire receipt point, not downstream of any consumer. It is left in
place as a future diagnostic surface, matching the SPA's existing
DEV-only logging posture (see `katago-client.ts`'s
`if (import.meta.env.DEV) console.log(...)` lines).

`vue-tsc -b` clean. No production-build impact (gated by `DEV`).

### Nothing else

No knob, no slider, no clamp, no warning, no documentation update
in this worklog. Those are the mitigation work, which is its own
arc (see "Proposed mitigation" below).

## Findings

(Compact summary; the full report body is at
`~/katago_bugreport/findings.md`.)

1. **Absolute cliff at ~25 ms.** Below this threshold,
   `firstReportDuringSearchAfter` is silently substituted with
   `reportDuringSearchEvery`. The cliff does NOT scale with
   cadence — same ~25 ms with cadence at 0.5 s, 2 s, or 10 s.
2. **Cadence-pin lands at `cadence + ~70-100 ms`.** Consistent
   across the three cadence settings — suggests KataGo schedules
   the first report at `search_start + cadence` and then adds one
   polling-tick of processing latency.
3. **Non-deterministic strip 0.020–0.030 s.** Specific values flip
   between fast and cadence-pinned across otherwise-identical
   runs. Boundary edges are stable; flip pattern inside isn't.
   Characteristic of a race.
4. **Floor in the honoured regime is ~30–50 ms.** When the cliff
   doesn't kick in, first packet arrives at roughly
   `max(firstReportAfter, ~30 ms) + processing`. This is the
   irreducible NN-warmup + first-batch cost; no upstream change
   would push first paint below it.

The cadence-knobs worklog's "upstream KataGo cadence dominates
first paint" suspicion is now an empirical finding with three
independent reproductions.

## Proposed mitigation (NOT in this worklog)

The user is currently exposed to broken behaviour whenever they
configure `firstReportDuringSearchAfter` below the ~25 ms cliff.
The cadence-knobs worklog's
`KnobInputDecl.maxFromKnob` substrate is the cross-knob
constraint substrate; this proposed mitigation extends the same
pattern with an *absolute* floor.

The shape (deferred for the author's bandwidth):

1. **Wire-side absolute floor in `analysis-service.ts`.** Change
   the clamp from `Math.min(stored, cadence)` to
   `Math.max(KATAGO_FIRST_REPORT_FLOOR, Math.min(stored, cadence))`
   at both call sites. With `KATAGO_FIRST_REPORT_FLOOR = 0.035` (a
   safety margin above the noisy strip). Defence-in-depth — the
   slider widget would also enforce the floor, but the wire-side
   clamp catches stored-leaf drift.

2. **Slider-side floor via `KnobInputDecl.minFloor`.** This
   sibling of `maxFromKnob` is a small substrate addition. The
   cadence-knobs worklog's §"What this arc does NOT close"
   explicitly anticipated the minFromKnob shape and deemed it
   premature *at that time* on N=1 use case grounds — but this
   diagnosis arc supplies the N=2 use case that justifies it
   (absolute floor, not from-knob). A simple `minFloor?: number`
   on `KnobInputDecl` is the minimum-shape way to declare it; a
   bigger `minFromKnob` substrate could subsume it later if a
   linked-min use case ever materialises.

3. **Tooltip / system-message explanation.** When the user drags
   the slider down to the floor and is held there, a one-time
   `pushSystemMessage('info', ...)` naming the upstream limitation
   and pointing at the bug-report directory makes the constraint
   honest per ADR-0002.

4. **Update the cadence-knobs i18n labels** to reflect the
   effective minimum if the slider's static `range[0]` would
   otherwise advertise a position the wire refuses. Same posture
   as the existing `effectiveMax` story for `maxFromKnob`.

Each of (1)-(4) is independently landable. (1) alone would close
the user-facing bug; (2) makes the constraint visible at decl
time; (3) makes it visible to the user; (4) keeps the i18n
catalogue truthful. The minimum-honest set is (1) + (2). Suggested
order: (1) first (smallest, defence-in-depth), (2) next (substrate
addition), then (3) + (4) together when bandwidth permits.

## How to proceed given the constraints

The author named two constraints at staging time: "executive
bandwidth unavailable for filing today" and "I don't know what to
do with it" (the disposition of the bug-report package). Reading
both together:

- **The upstream filing is on the author's plate, not the next
  contributor's.** The diagnosis arc is closed; nothing in the
  diagnosis depends on the filing happening. The bug-report
  package is staged at `~/katago_bugreport` (outside the umbrella
  tree, per the umbrella's "this isn't LengYue work" boundary). It
  can sit there for weeks if needed.
- **The SPA-side mitigation, conversely, should not wait.** Users
  hitting the broken band today have no recourse other than
  rediscovering by experiment that the slider has an invisible
  floor. The proposed (1) + (2) above is small enough that a
  contributor with no executive-bandwidth pressure could land it
  cleanly inside a single session.

Recommendation, if the author agrees: land mitigation (1) + (2) in
the next session (separate PR from any other in-flight work; small
diff; tests for the `minFloor` substrate path the same way the
`maxFromKnob` path is tested in
`tests/unit/lib/knobs.test.ts`). File the upstream report when
bandwidth permits; the package is staged and self-contained.

## What this arc does NOT close

- **The upstream KataGo bug.** It's at
  https://github.com/lightvector/KataGo and the report body is at
  `~/katago_bugreport/findings.md`. Not filed.
- **SPA-side mitigation (1)-(4) above.** Proposed, not landed.
- **The KataProxy SELECTOR-side `firstReportAfter=0.018 →
  NO-PACKET` artefact** observed in the Node-on-SELECTOR runs but
  NOT in the transparent-proxy or Python runs (see
  `~/katago_bugreport/logs/python_single_cadence.txt` for the
  cross-stack comparison). That specific value's complete-drop
  behaviour on the SELECTOR side is a separate, proxy-side
  concern; out of scope for the umbrella per the proxy-submodule
  boundary discipline.
- **Cross-backend / `maxVisits` independence checks** for the
  upstream report. Listed as "open questions" in
  `~/katago_bugreport/background_note.md`. Each would tighten the
  upstream report but is not necessary for filing.
- **A stdin/stdout (no-WS-bridge) reproducer.** The WebSocket
  reproducer is the diagnosis-arc's artefact; a stdin-talking
  variant would close the "is the bridge a confounder" question
  for KataGo maintainers. Listed in the bug-report directory's
  open questions.

## Cross-references

- `~/katago_bugreport/CLAUDE.md` — entry point for the staged
  bug-report package.
- `~/katago_bugreport/findings.md` — the upstream report body
  ready to file; data tables, expected/actual, reproducer
  instructions.
- `~/katago_bugreport/background_note.md` — diagnosis-arc context,
  open questions, filing channels.
- `~/katago_bugreport/reproducer.py` — Python single-file
  reproducer; cadence-scaling sweep.
- `~/katago_bugreport/reproducer_node.mjs` — Node mirror for
  cross-stack confirmation.
- `~/katago_bugreport/logs/` — captured runs from the diagnosis
  arc.
- `docs/worklog/2026-05-15-katago-cadence-knobs.md` — the sibling
  arc that promoted the cadence knobs and named the suspicion
  this arc confirmed.
- `docs/worklog/2026-05-15-ledger-first-packet-sync-bump.md` —
  the sibling SPA-side structural fix that closed the rAF-coalescer
  first-paint delay so the upstream contribution became visible.
- `src/services/analysis-service.ts` — DEV-only arrival log added
  during the diagnosis; kept as a future diagnostic surface.
- `src/services/analysis-ledger.ts` — receive-path verification
  during the diagnosis arc; nothing changed here.
- `src/engine/katago/katago-client.ts` — WS receive-path
  verification during the diagnosis arc; nothing changed here.
- ADR-0002 (fail loudly) — applies to the proposed mitigation: the
  knob slider exposing positions the wire silently refuses is the
  silent-failure mode ADR-0002 names; the proposed wire-floor +
  slider-floor pair surfaces the constraint at both layers.
- ADR-0002 applied to documentation consumption (the "fail loudly
  for LLM collaborators" corollary in the umbrella `CLAUDE.md`) —
  applies to `~/katago_bugreport/CLAUDE.md`'s opening directive to
  read the staged docs end-to-end before acting on the report.
- ADR-0004 (minimal-touch) — applies to the DEV-only log addition;
  the only line touched in `analysis-service.ts` is the one this
  arc needed.

## License

Public Domain (The Unlicense).
