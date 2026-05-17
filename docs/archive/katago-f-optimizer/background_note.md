# Background — what this directory is and why

This is a staged bug-report package for a KataGo upstream issue. It
was assembled on 2026-05-15 during diagnosis of a frontend-perceived
"first paint stuck at cadence" symptom in LengYue (the umbrella
project this directory is filed alongside). The package can sit here
indefinitely; nothing depends on it being filed on a particular date.

The bug itself is fully characterised in `findings.md`. This note
captures the *path to the diagnosis* and the *executive-bandwidth*
considerations that informed staging it here instead of filing
immediately.

## How the symptom arrived

1. **2026-05-15, earlier in the day** — a feature PR (`#231,
   katago-cadence-knobs`) promoted two KataGo report-cadence values
   to user-controllable knobs: `reportDuringSearchEvery` and
   `firstReportDuringSearchAfter`. Default cadence 0.15 s, default
   first-after 0.05 s. Worklog:
   `docs/worklog/2026-05-15-katago-cadence-knobs.md` in the umbrella.
2. **Same session** — a sibling structural fix landed in the
   ledger's first-packet path so that the no-data → has-data
   transition doesn't pay a one-frame rAF coalescer delay. Worklog:
   `docs/worklog/2026-05-15-ledger-first-packet-sync-bump.md`. The
   worklog noted that the dominant remaining first-paint contributor
   was "upstream" — at the time, an informed suspicion.
3. **Later in the session** — the project author tried cadence 2 s
   with first-after 0.03 s and observed first paint reliably arriving
   at ~2 s rather than at 0.03 s. The "informed suspicion" upstream
   became a load-bearing claim that needed evidence.
4. **The diagnosis arc that produced this directory** — headless
   probes across three independent client stacks (Node + native WS,
   Node + KataProxy SELECTOR proxy, Python + `websockets`) hitting
   the same KataGo binary all reproduced the same cliff. Frontend,
   KataProxy enricher, kernel/libvirt boundary, and per-query
   capabilities were each ruled out. The cadence-scaling sweep
   pinned the cliff at an absolute ~25 ms regardless of cadence.

## Why this is staged, not filed

The project author flagged the work as "executive bandwidth
unavailable" at staging time. Filing an upstream bug well is its own
arc — selecting the right channel (GitHub Issues vs Discord vs a
direct ping), writing the body to KataGo-upstream conventions,
responding to clarification requests, possibly attaching a more
KataGo-native reproducer (stdin/stdout instead of WebSocket). None of
that is in the critical path of LengYue's local work; the local
mitigation is a small SPA-side clamp. So the diagnosis is fully
captured in this directory and can sit until the bandwidth shows up.

## What this directory is for, concretely

- `findings.md` — the upstream report body, copy-pasteable into a
  GitHub issue at https://github.com/lightvector/KataGo. Data tables,
  expected/actual, reproducer instructions, what is not yet
  established.
- `reproducer.py` — single-file Python reproducer. The decisive
  three-cadence sweep. Requires `websockets`; takes a
  `KATAGO_WS_URL` environment variable so it doesn't bake in local
  network details.
- `reproducer_node.mjs` — Node mirror. Cross-stack evidence that the
  symptom is not Python-side. Uses Node 24's built-in WebSocket — no
  `ws` install needed.
- `logs/` — three captured runs:
  - `python_cadence_scaling.txt` — the decisive evidence; cadence
    scaling rules out the "proportional to cadence" hypothesis.
  - `python_single_cadence.txt` — earlier single-cadence run; first
    establishes the noisy 0.020–0.030 s strip.
  - `node_transparent.txt` — cross-stack confirmation.
- `CLAUDE.md` — for a future LLM collaborator who picks up the
  filing.

## Open questions worth chasing if a future investigator has the time

These would tighten the upstream report further but are not necessary
for filing:

1. **Backend-independence.** The original reproduction was on CUDA.
   Confirming the cliff on the CPU backend (Eigen / OpenCL) would
   foreclose "this is a CUDA-only timing artefact" as a possible
   upstream pushback. Same reproducer; just point at a CPU-backend
   KataGo instance.
2. **`maxVisits` independence.** The captured logs are all at
   `maxVisits=2_000_000`. Earlier ad-hoc probes (`maxVisits=200_000`,
   `maxVisits=50_000`) qualitatively showed the same cliff but the
   exact threshold value wasn't characterised. A small parameter
   sweep would close this.
3. **stdin/stdout reproducer.** The current reproducer talks to a
   WebSocket bridge that forwards to the engine's stdio. Some KataGo
   maintainers prefer reproducers that talk directly to the analysis
   binary. A `subprocess.Popen` + write-to-stdin + read-from-stdout
   variant in Python would be ~50 lines and removes the bridge as a
   possible (already-ruled-out) confounder.
4. **Source pointer.** The pattern strongly suggests a comparison
   somewhere in the analysis-engine report loop that uses a fixed
   ~25 ms floor when deciding to honour `firstReportDuringSearchAfter`
   vs falling back to the cadence tick. The reporter has not read
   KataGo source for the exact site; doing so before filing would
   let the issue body point at the file and make the maintainer's
   triage cheaper.

## Channels for filing

- **GitHub Issues** at https://github.com/lightvector/KataGo —
  primary channel. Issue body = `findings.md`, attachments =
  `reproducer.py` + `logs/python_cadence_scaling.txt`. The other
  files are nice-to-have, not necessary.
- **KataGo Discord** (community.computer-go.org or the Computer Go
  Discord) — secondary, lower-friction for asking a maintainer
  "before I open an issue, does this match anything you've already
  triaged?". Useful if the GitHub Issues tab has a lot of stale
  things and a maintainer ping would surface a known explanation.

## SPA-side mitigation

The umbrella worklog
`docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`
proposes a wire-side absolute floor of ~0.035 s on
`firstReportDuringSearchAfter` in `analysis-service.ts`, plus a
`KnobInputDecl` extension so the slider can't even produce sub-floor
values. That mitigation is independent of the upstream filing and
should land regardless — users are exposed to the broken band right
now. See the worklog for the full proposal.
