# `firstReportDuringSearchAfter` values below ~25 ms are silently substituted with `reportDuringSearchEvery`

A draft for filing at https://github.com/lightvector/KataGo. The body is
designed to be copy-pastable; the data tables and reproducer attachments
in this directory are the evidence.

## Summary

In KataGo's analysis-engine protocol, `firstReportDuringSearchAfter`
is documented as the delay between query start and the first
`isDuringSearch: true` report. Inspecting the source suggests a lower
bound of 0.001 s.

Empirically, values **below an absolute ~25 ms threshold are silently
ignored**. The first `isDuringSearch: true` packet instead arrives at
`reportDuringSearchEvery + ~70–100 ms` — i.e., pinned to the first
regular cadence tick. The threshold is **absolute** (does not scale
with `reportDuringSearchEvery`), and behaviour in the 0.020 – 0.030 s
strip is non-deterministic per query.

## Environment

- KataGo `1.16.4` (per `query_version`).
- Analysis engine launched via a transparent WebSocket bridge that
  forwards JSON frames to/from the engine's stdin/stdout.
- Linux host, x86_64, CUDA backend (incidental — symptom expected to be
  backend-independent because the timing logic is in the analysis-engine
  scheduler, not the NN backend).

## Repro shape

A single 19×19 mid-game position (39 moves, attached in `reproducer.py`).
For each of three cadences (0.5 s, 2 s, 10 s), sweep
`firstReportDuringSearchAfter ∈ {0.001, 0.002, 0.005, 0.01, 0.015, 0.02,
0.025, 0.03, 0.05, 0.1, 0.3}`, hold all other parameters constant, log
the wall-clock delta from `send` to the first response with the matching
`id`.

Wire shape (the constants in the reproducer):
```
maxVisits: 2_000_000
includeOwnership: true
overrideSettings:
  reportAnalysisWinratesAs: WHITE
  rootNumSymmetriesToSample: 8
  wideRootNoise: 0.02
```

Per-query terminate after the first packet; 600 ms settle between
queries.

## Expected

For `F = firstReportDuringSearchAfter`, the first
`isDuringSearch: true` packet arrives at approximately `t = F + ε`,
where `ε` is the irreducible startup overhead (NN warm-up, first batch
processing — empirically ~30–50 ms here). Subsequent during-search
packets arrive at `t + n × reportDuringSearchEvery`.

## Observed

The first packet's wall-clock time is bimodal:

- **Fast regime** (`F ≳ 0.030 s`): first packet arrives at
  approximately `max(F, ~30 ms) + ~30 ms` overhead, independent of
  cadence.
- **Cadence-pinned regime** (`F ≲ 0.020 s`): first packet arrives at
  `reportDuringSearchEvery + ~70 – 100 ms` instead of at `F`, again
  independent of cadence's specific value.
- **Non-deterministic strip** (`0.020 ≤ F ≤ 0.030 s`): the regime
  selection is non-deterministic across otherwise-identical runs.

Three cadence runs (single combined sweep against the same KataGo
instance, in the order shown):

| `firstReportAfter` | cadence=0.5 s | cadence=2.0 s | cadence=10.0 s |
|---:|---:|---:|---:|
| 0.001 s | +540 ms (≈cad) | +2100 ms (≈cad) | +10072 ms (≈cad) |
| 0.002 s | +554 ms (≈cad) | +2163 ms (≈cad) | +10073 ms (≈cad) |
| 0.005 s | +570 ms (≈cad) | +2053 ms (≈cad) | +10056 ms (≈cad) |
| 0.010 s | +588 ms (≈cad) | +2050 ms (≈cad) | +10081 ms (≈cad) |
| 0.015 s | +568 ms (≈cad) | +2172 ms (≈cad) | +10070 ms (≈cad) |
| 0.020 s | +555 ms (≈cad) | +2090 ms (≈cad) | +10068 ms (≈cad) |
| 0.025 s | +587 ms (≈cad) | +2106 ms (≈cad) | **+56 ms (fast)** |
| 0.030 s | **+34 ms (fast)** | **+37 ms (fast)** | +45 ms (fast) |
| 0.050 s | +70 ms (fast) | +81 ms (fast) | +73 ms (fast) |
| 0.100 s | +151 ms (fast) | +123 ms (fast) | +148 ms (fast) |
| 0.300 s | +331 ms (fast) | +359 ms (fast) | +358 ms (fast) |

Full log including `rootInfo.visits` at first packet:
`logs/python_cadence_scaling.txt`.

### The cliff is absolute, not proportional to cadence

The two decisive cells from the table above:

- `F=0.05, C=10` (`F = 0.5%` of `C`) → **fast** (+73 ms). A
  proportional cliff at ~1% of `C` would have produced a cadence-pin.
- `F=0.005, C=0.5` (`F = 1%` of `C`) → **cadence-pinned** (+570 ms).
  A proportional cliff at ~1% of `C` would have produced fast or noisy.

Both cells point the same way: the cliff sits at a fixed ~25 ms in wall
time, regardless of `reportDuringSearchEvery`.

### The non-deterministic strip is reproducibly non-deterministic

At a single cadence (~2.16 s) across three independent runs (two Node
runs, one Python run, against the same KataGo binary):

| `firstReportAfter` | Run A (Node) | Run B (Node) | Run C (Python) |
|---:|---:|---:|---:|
| 0.020 s | ≈cadence | ≈cadence | **fast** |
| 0.022 s | ≈cadence | **fast** | ≈cadence |
| 0.025 s | **fast** | **fast** | **fast** |
| 0.028 s | ≈cadence | **fast** | **fast** |
| 0.030 s | **fast** | ≈cadence | **fast** |

The flip-flop pattern shuffles between runs. This is characteristic of
a race or a comparison whose result depends on which of two thread
schedulings wins on a given query. The boundaries themselves (0.020 s
lower edge, 0.030 s upper edge) are stable across runs; only the
specific values inside the strip flip.

### Pinning lands at `cadence + ~70–100 ms`, not at `cadence`

The slow-regime first-packet delays sit at:

- cadence 0.5 s → 540–588 ms (`Δ ≈ +40–90 ms above cadence`)
- cadence 2 s → 2050–2172 ms (`Δ ≈ +50–170 ms above cadence`)
- cadence 10 s → 10056–10081 ms (`Δ ≈ +60–80 ms above cadence`)

The consistent `cadence + ~70 ms` offset suggests the implementation
schedules the first report at `search_start + reportDuringSearchEvery`
and then the report itself adds one polling-tick of processing
latency. The cadence value is honoured exactly as the first-report
deadline when `firstReportDuringSearchAfter` is "too small".

## Reproducer

`reproducer.py` (Python 3.11+, depends on `websockets`) does the full
three-cadence sweep. Point it at any KataGo-protocol WebSocket bridge:

```sh
pip install websockets
KATAGO_WS_URL=ws://localhost:PORT python3 reproducer.py
```

A Node 24 mirror (no `ws` dependency, uses the built-in WebSocket) is
in `reproducer_node.mjs` for cross-stack confirmation.

Raw outputs from the diagnosis arc: `logs/python_cadence_scaling.txt`,
`logs/python_single_cadence.txt`, `logs/node_transparent.txt`.

## Probable code area

(Speculative; the reporter has not read the KataGo source on this
point.) The pattern — absolute threshold near a small fixed value,
non-monotonic flip-flop near it, exact `cadence + one tick` pinning —
suggests a comparison or scheduling decision in the analysis engine's
report-loop that uses a hardcoded floor (somewhere around 25 ms) when
deciding whether to honour `firstReportDuringSearchAfter` versus
falling back to the first cadence tick. The race between this
comparison and the search-init path likely accounts for the
non-deterministic strip.

## What's not yet established

- Whether the threshold scales with backend speed (CPU vs CUDA),
  batch size, or NN evaluation latency. The current data is from one
  configuration; replication across backends would tighten the
  diagnosis.
- Whether the threshold depends on `maxVisits` or position complexity.
  Earlier informal probes (smaller `maxVisits`, empty board) showed
  qualitatively the same cliff but the boundary values weren't
  characterised as carefully.
- Whether the original-stdio analysis engine (no proxy at all) shows
  identical behaviour. The transparent proxy used in the reproducer
  passes JSON through unchanged but does interpose a thread; a
  stdin/stdout-only reproducer would close that gap.

## Notes

- The reporter's product (a Go-study spaced-repetition application)
  exposed a `firstReportDuringSearchAfter` slider to end users. The
  default cadence (2 s) combined with the documented 0.001 s lower
  bound led users to set very small values, expecting snappy first
  paints. Symptom: "first paint feels stuck at cadence". This bug
  report is the upstream surface; the application has implemented a
  client-side absolute floor of ~0.035 s as a workaround.
