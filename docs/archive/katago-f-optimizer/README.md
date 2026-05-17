# `docs/archive/katago-f-optimizer/` — archive

The bug-report package and characterisation sweep that fed the SPA-side
F-optimizer landed in PR #254 (feature) and PR #255 (retrospective).
This directory is the **archaeological deposit** — the raw data, the
Python tooling, and the bug-report body — preserved in-repo so a
future archaeologist can reconstruct the analysis without external
state. The companion retrospective at
`../../notes/retrospective-katago-f-optimizer-2026-05.md` is the
narrative; this directory is the substrate.

## Upstream filing

The bug was filed against KataGo upstream as
**https://github.com/lightvector/KataGo/issues/1197** on 2026-05-16
("firstReportDuringSearchAfter apparently not honored"). The local
`findings.md` and `background_note.md` are the SPA-side drafts that
fed the filing; the canonical issue body is on GitHub.

## Contents

```
findings.md             SPA-side draft of the bug-report body
background_note.md      Diagnosis arc and executive-bandwidth context
af.cfg                  KataGo analysis-engine config used in the sweeps
parameter_sweep.py      The full plotly-backed sweep tool. 15800-trial
                        characterisation across (model × cadence × F).
                        Re-runnable; see `--help` for subcommands
                        (`run`, `serve`, `analyze`).
optimize_f.py           Python reference implementation of the
                        bisection algorithm. Validated offline against
                        the sweep CSV via the `validate` subcommand;
                        same algorithmic shape as the SPA's TypeScript
                        port at `frontend/src/engine/katago/optimize-f.ts`.
reproducer.py           Three-cadence sweep over a WebSocket bridge
                        (single-file, dep: `websockets`).
reproducer_node.mjs     Node 24 mirror of the Python reproducer.
                        Cross-stack confirmation (rules out Python/
                        websockets as the source of the symptom).
reproducer_stdio.py     stdin/stdout reproducer: spawns KataGo
                        directly and talks to its analysis stdio.
                        Removes the WebSocket bridge as a possible
                        (already-ruled-out) confounder. Output of
                        running it is captured at repro_output.txt.
repro_output.txt        Captured stdio-reproducer output. The
                        decisive evidence: at C=10s F=0.001s the
                        engine completes 103,198 node visits and
                        STILL refuses to fire the first report until
                        the cadence tick. Visit counts at first
                        packet are the smoking gun.
sweep_results/
  sweep_results.csv     15,800 trials. The data underlying every
                        statistical claim in the retrospective.
                        Columns: model, cadence_s, first_report_s,
                        trial_idx, max_visits, dt_ms,
                        visits_at_first_packet, error, timestamp.
f_star_sweep.csv        Per-(model, cadence) optimizer recommendations
                        across the cadence grid. One row per cadence.
logs/                   Three captured reproducer runs from the
                        diagnosis arc, kept as cross-stack evidence
                        (Python single-cadence, Python cadence-scaling,
                        Node transparent-WS).
```

## Re-running the analyses

The sweep tool requires `aiohttp`, `numpy`, `scipy`, `plotly`, and
`websockets`; the user's machine has them in
`/home/bork/w/vdc/venvs/kataproxy/`. With a KataProxy SELECTOR running:

```bash
cd docs/archive/katago-f-optimizer/
$VENV parameter_sweep.py run \
    --bind 0.0.0.0 \
    --port 8000 \
    --trials 50
```

The dashboard streams live results at the bound URL; the CSV grows in
`sweep_results/sweep_results.csv` (resumable). The Python reference
algorithm validates against the existing CSV:

```bash
$VENV optimize_f.py validate
```

For the stdio reproducer (no proxy needed; talks directly to a
KataGo binary):

```bash
python3 reproducer_stdio.py \
    -katago-path /path/to/katago \
    -config-path af.cfg \
    -model-path /path/to/weights.bin.gz
```

## Why preserved in-repo

The sweep CSV is ~1.1 MB and the Python tooling another ~130 KB —
modest compared to the analytical value they carry. Pulling them
in-repo means the retrospective's claims are reproducible from the
repository alone, without dependencies on the project author's
`~/katago_bugreport/` staging directory.

License: Public Domain (The Unlicense)
