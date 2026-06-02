# Perceptual event projection — design note

> SSOT: `perceptual-event-projection` — status lives in the work-status SSOT
> (ADR-0005 Rule 9); this note's lifecycle is that item's state.

Status: idea / design-note, not scheduled. Captured at the maintainer's
request during the 2026-06-01 perf-scenario-harness work. A medium-sized
subproject; documented here so it is not lost, with an honest feasibility
assessment (verdict: doable, with one heuristic seam and one hard
dependency named below).

## The thought

`scripts/perf-trace-parse.mjs` answers *"which code components rendered /
patched, how often"* — a code-structural view (per-component
`render`/`patch` counts, the render≫patch tell). Useful for attribution,
but it is organised by **how the SPA is built**, not by **what the user
perceives**. The maintainer wants the complementary view: from a captured
trace, reconstruct a faithfully-charted representation of the **event
stream as the user would observe it** — input went in *here*, the screen
responded *there*, it stalled *for this long*, the analysis update became
visible *then*.

The two views are duals. The render/patch ranking is the *cause* side
(work the code did); the perceptual stream is the *effect* side (what
reached the eyes). A perf claim about "felt crispness" lives on the effect
side; today we only chart the cause side and infer the effect.

## The ACL framing (the load-bearing idea)

The maintainer's framing — and the reason this is more than a different
chart — is that the perceptual event stream should be defined **outside
the SPA**, as a vocabulary of what a user observes, *independent of how
the code emits markers*. An **anti-corruption layer** then maps the trace's
code-coupled events onto that vocabulary, exactly as
`services/backend-service.ts` maps wire shapes (snake_case, backend's
model) onto domain types (the SPA's model). Here the ACL maps:

> raw trace events (Vue `render` measures, `autonav:step` marks,
> compositor `Paint` events, input events, `LongTask`s) — coupled to *how
> this SPA happens to be instrumented* —

onto

> a **perceptual vocabulary** — coupled to *what any interactive Go-study
> tool's user observes* — so the chart would mean the same thing if the
> SPA were rewritten, the markers renamed, or the framework swapped.

That independence is the whole point: the vocabulary is a specification of
the observable experience; the markers are an implementation detail the ACL
absorbs. Marker churn (a new `scenario:*` name, a renamed Vue measure)
changes the adapter, never the chart's meaning.

## A first-cut perceptual vocabulary

Defined as user-observable events/spans, not code events:

- **Stimulus** — the user did something: a navigation keystroke, a hover,
  a click. (Trace source: input events; `autonav:step` / `popover:*`
  marks stand in for the synthetic-driver equivalents.)
- **Visual response** — the first frame that changed *after* a stimulus.
  The felt latency is `response.ts − stimulus.ts`. (Trace source: the next
  compositor `Paint` / frame after the stimulus.)
- **Settled / quiescent** — no further visual change for ≥ N frames after a
  stimulus; the screen has stopped reacting. (Derived from paint cadence.)
- **Stall / jank** — a gap where the user expected motion (between stimulus
  and settle) but no frame painted for > one frame budget. (Trace source:
  inter-paint gaps; corroborated by `LongTask`.)
- **Asynchronous update reflected** — an *unprompted* visual change driven
  by arriving data, not input: an analysis packet → the chart repaints.
  The felt latency is `paint.ts − packet.ts`. (Trace source: WS
  message / `rb3:*` mark → next chart-region `Paint`.)

These five already cover the regime-B question the green arc cared about:
*while analysis streams, how long after each nav keystroke does the board
respond, and does the streaming starve the response?*

## The adapter (where the heuristic seam is)

Trace events with timestamps are abundant (`devtools.timeline` carries
`Paint`, `CompositeLayers`, frame markers; `blink.user_timing` carries the
Vue/harness marks; input events are present). Mapping the *timing* is
mechanical. The **heuristic seam** is **causal attribution**: deciding
*which* stimulus a given paint is the response to, and *which* packet a
given chart repaint reflects. The honest approach is a bounded
causality window (a paint within the next ~K ms of a stimulus, on the
relevant region, is attributed to it), with explicit handling of the
ambiguous cases (overlapping stimuli; a paint serving two causes). This is
attribution-by-proximity, not ground truth — the chart must mark
low-confidence attributions rather than assert them (ADR-0002 applied to
the projection: a guessed cause→effect link is surfaced as guessed).

## The chart ("gantt-like but not gantt-proper")

The maintainer's instinct is right: it is not a dependency gantt (tasks
with predecessors). It is closer to a **swimlane perceptual timeline** —
one lane per observable channel (input, board paint, chart paint, popover
paint), events as points/short spans on each lane, and **latency
connectors** drawn from a stimulus on the input lane to its visual response
on a paint lane (the connector's length *is* the felt latency). Stalls
render as gaps highlighted on the paint lanes. It is data-dense and fixed
per-frame → a `<canvas>` job, not a `v-for` of SVG (ADR-0010 canvas rule);
the existing rugplot/timeline canvases are the precedent. (It need not live
in the SPA at all — it could be a standalone analysis view over a trace
file, like `perf-trace-parse.mjs` is.)

## Feasibility verdict

**Doable, not blocked.** The two caveats, named honestly:

1. **Causal attribution is heuristic**, not exact — the adapter guesses
   cause→effect by temporal proximity. Mitigated by surfacing confidence,
   not by pretending to certainty.
2. **Faithfulness depends on a faithful capture.** A headless trace's
   `Paint` events do not reflect real compositor/vsync timing; the
   perceptual chart is only as honest as the capture. It therefore depends
   on the **`--headed` / `--connect` (real-X11) capture modes** in
   `scripts/perf-capture.mjs` — a headless capture would produce a
   confidently-wrong perceptual chart. This is the hard dependency: build
   the faithful-capture path first (done 2026-06-01), validate that its
   paint timing matches felt experience, *then* project.

Neither caveat makes it impractical; both shape it. The subproject is: (1)
freeze the perceptual vocabulary, (2) write the trace→vocabulary adapter
with confidence-tagged attribution, (3) build the canvas swimlane view, (4)
validate against a known-janky vs known-crisp capture pair.

## Relation

- `scripts/perf-trace-parse.mjs` — the code-structural dual; shares the
  trace-parsing front end.
- `scripts/perf-capture.mjs` `--headed` / `--connect` — the faithful
  capture this depends on.
- ADR-0009 (perf-investigation discipline) — this would be a new
  investigation *class* (perceptual-stream analysis); if built, its metric
  vocabulary (felt latency distributions, stall counts, async-reflect lag)
  extends ADR-0009's metric vocabulary via the append-a-rule pattern.
- ADR-0010 (canvas rule) — governs the chart's implementation.

## License

Public Domain (The Unlicense).
