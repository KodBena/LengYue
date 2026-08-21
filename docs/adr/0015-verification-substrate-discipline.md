# ADR-0015: Verification-Substrate Discipline — a result is only as good as the environment that produced it

- **Status:** Proposed (drafted by RCA over the fact-mining recidivism study;
  filed for maintainer ratification).
- **Genre:** Tenet (cross-cutting execution discipline) — the substrate
  register of the ADR-0009/0011/0013 verification family. ADR-0009 says a
  perf claim carries its investigation; ADR-0011 says a reading carries its
  code state (the commit-stamp amendment); ADR-0013 Rule 5 says verify the
  artifact, not the claim. This tenet supplies their shared premise: **the
  machine state under which a verification ran is part of the verification's
  meaning**, and a run outside its declared envelope is not evidence.
- **Date:** 2026-07-02
- **Provenance:** Native. A named, dated failure with measured cost: the
  2026-07-01/02 OOM/tmpfs death spiral (`OOM-TMPFS-INCIDENT-2026-07-02.md`).
  A test staged a 1.74 GB npz into tmpfs (RAM) on a swapless 9.6 GiB VM;
  every OOM SIGKILL leaked 1.7 GB of unevictable tmpfs; a retry loop re-ran
  the job (54 kills in one night; a kill every ~2 minutes at the peak).
  Executors read the resulting bare exit codes as tool flakiness and
  blind-retried — each retry worsening the substrate — and a hardening pass's
  verification stages ran degraded, with one reviewer reduced to a static
  read. The defect was invisible from inside the session precisely because
  nothing in the law named the substrate as a thing with an envelope.
- **Scope:** Every execution whose result will be treated as evidence — test
  runs, benchmarks, gates, workflow verification stages — on any host this
  corpus's projects run on. It binds the *setup and interpretation* of runs,
  not the code under test (ADR-0012) nor the will to finish them (ADR-0013).

## Context

The corpus's verification machinery assumes an honest substrate: ADR-0013
Rule 5 says read the command's output, ADR-0009 says capture the bench,
ADR-0011 says stamp the code state. The OOM incident broke the assumption
underneath all three at once: commands returned bare exit codes with no
output and no side effects; retries silently consumed the RAM that the next
verification needed; and a SIGKILL — a *substrate* verdict — was read as a
*code* or *tool* verdict and retried, which is exactly the
silent-fallback-under-anomaly posture ADR-0002 forbids, applied to the
machine itself. Meanwhile heavy artifacts staged to `/tmp` (tmpfs) converted
disk writes into unevictable RAM consumption, so the failure compounded
per attempt.

The general form: **a verification's environment has invariants (available
memory, temp-staging medium, process limits, exclusive use of contended
resources), and when they are violated the run's result — pass, fail, or
silence — is not about the code.** Treating it as about the code produces
false defects, false clears, and death spirals.

## Decision

Four rules.

### Rule 1 — Heavy runs declare and enforce a resource envelope

A run known or measured to be resource-heavy (model-scale memory, large
staging artifacts, long wall time) is launched inside an enforced cap
(e.g. `systemd-run --user --scope -p MemoryMax=…`), so the *job* dies and
the *box* survives. The envelope (memory ceiling, staging location, expected
duration) is declared where the run is defined — the test file, the harness,
the instrument — not tribal knowledge. Preflight before model-scale runs:
required headroom is checked and the run refuses loudly (ADR-0002) if the
substrate cannot honor it, rather than starting a run the kernel will
adjudicate.
*Enforcement surface: run-time (the cap and the preflight are code);
review-only for the judgment of which runs are heavy — with any OOM kill the
mechanization trigger (ADR-0011 Rule 2) for capping that run class.*

### Rule 2 — Big temporary artifacts never stage to RAM

Anything beyond trivial size goes to real disk — an explicit repo staging
dir or `TMPDIR` pointed at disk — never to a tmpfs `/tmp` by default. A
SIGKILLed process cannot run its cleanup, so RAM-backed temp files are leaks
by construction under exactly the memory pressure that causes the kill.
*Enforcement surface: write-time (the staging path is set in the code that
stages); a lint over `TemporaryDirectory()`/`mkdtemp()` calls without an
explicit `dir=` in heavy-run code is the named mechanization.*

### Rule 3 — Exit codes are a closed vocabulary; a substrate verdict is never retried blind

Exit 137 / SIGKILL means the substrate killed the job — presumptively OOM —
and is handled as an incident (stop, measure `free`/`df`, clean up), never
as flakiness to retry. A bare exit code with no output and no side effects
means the substrate could not run the command at all; the result is
**quarantined** — treated as no result, exactly as ADR-0011's commit-stamp
amendment treats a DIRTY-tree reading — not as a pass, not as a fail.
Blind-retrying a substrate verdict is the silent-automatic-retry ADR-0002
Rule 1 forbids, in the register where each retry makes the anomaly worse.
*Enforcement surface: review-only on human/LLM conduct; mechanizable in any
harness that wraps runs (map 137 to a distinct, loud, non-retryable status),
which is the ADR-0011 Rule 2 trigger on the next blind-retry incident.*

### Rule 4 — A verification claims its substrate

A run whose result is offered as evidence states the substrate condition it
ran under when that condition is load-bearing — at minimum, that Rule 1's
envelope held. A verification stage that ran degraded (could not execute
tests, fell back to static reading) says so **in its verdict**, so a
downstream reader never mistakes "could not test" for "tested clean". This
is ADR-0009's captured-investigation honesty and ADR-0011's stamped-reading
honesty, extended to the machine.
*Enforcement surface: review-only; where verdicts are schema-carried, a
required substrate/degradation field is the mechanization.*

## Consequences

**Positive.** The box survives its jobs; a kill is diagnosed in minutes
instead of spiraling overnight; degraded verifications are visibly degraded
instead of silently thin; retries stop manufacturing the failure they retry.

**Negative.** Ceremony on heavy runs (cap + preflight); the "which runs are
heavy" judgment is review-only until an incident mechanizes it; envelope
declarations can go stale (they are P1 facts — one home, derived where
possible).

**Neutral.** No retroactive sweep; existing tests gain envelopes on touch
(ADR-0004). The 2026-07-02 remediation (`ab979a4`: one on-disk staging home
+ measured RAM preflight) is this tenet's first worked instance, landed
before the tenet was written — the tenet records the lesson so the next
project does not re-buy it.

## Revisit when…

1. A rule introduces its own failure mode (most plausibly Rule 1 hardening
   into ceremony on genuinely light runs) — dated amendment here.
2. A harness mechanizes Rule 3's exit-code vocabulary — record it; tighten
   from review-only.
3. A second host class joins (different memory/temp topology) — re-derive
   the envelope defaults; the rules are topology-independent, the numbers
   are not.

## Related

- **ADR-0002 (fail loudly).** Rules 1 and 3 are ADR-0002 applied to the
  machine: refuse loudly at preflight; never silent-retry a substrate
  verdict.
- **ADR-0009 / ADR-0011.** The verification family this tenet gives a
  floor: a captured bench or a stamped reading from a starved box is not a
  reading. The DIRTY-tree quarantine is Rule 3's precedent.
- **ADR-0013 Rule 5.** "Read the command's output" presumes the command
  could run; Rule 4 makes the presumption a stated, checkable fact.
- **`OOM-TMPFS-INCIDENT-2026-07-02.md`** — the substrate incident and its
  runbook; this tenet is its standing generalization.

## License

Public Domain (The Unlicense).
