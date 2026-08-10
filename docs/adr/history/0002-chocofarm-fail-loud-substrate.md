Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
`law/adr/0002-fail-loudly.md` at commit `ff691bb9bc430ad497d74ff82d580f758a969f99` under
`design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
retro-edited; the lessons these records teach live as rules in the parent ADR.

# Extracted from ADR-0002 (Fail Loudly) — the chocofarm substrate

This file holds the project-specific ("chocofarm") material the ADR-0002 portability
refactor moved out of the live ADR text, per
[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../../design/MAINT-ADR-PORTABILITY-SPEC.md)
§2's row for ADR-0002. The parent ADR keeps an Extraction Pointer or an inline link at
each place material left, summarizing what moved; this file is the destination those
pointers resolve to. "chocofarm" here is the source project (a research codebase)
ADR-0002 was originally authored against, before this refactor generalized the tenet for
reuse by other projects; "the audit" in the frozen text below is chocofarm's 2026-06-15
architectural audit, an artifact of that project not held in this repository. This intro,
the `## From …` headings, and the one section marked as added at extraction time are
2026-07-13 framing; everything else is the frozen record, verbatim from the source commit
in the banner. The extraction is sentence-faithful but partial: sentences that stayed
normative (the ADR's "Rule of thumb" lines, for instance) remain in the parent ADR and
are not duplicated here, so a frozen block may begin or end mid-paragraph relative to the
source.

## From "Context": six decisions already made under the fail-loudly tenet

- **The parallel-executor deadlock band-aids.** The JAX-training parallel
  loop suffered intermittent deadlocks (the parent parking in
  `multiprocessing.imap_unordered` awaiting a worker incapacitated by
  JAX-to-spawn-child thread residue; RCA in
  `docs/notes/jaxtrain-deadlock-rca.md`). The remedy converts a permanent
  hang into a **loud, diagnosable RuntimeError** naming the phase, the run,
  and the iteration (`az/parallel.py`), with bounded socket timeouts and a
  loud-now ping if redis is unreachable. Rationale: a silent permanent park
  looks like progress until someone checks; a loud abort with
  "restart from the last checkpoint" is actionable.
- **The hp registry's RESTART-drift refusal.** Changing a baked field
  (`lr`, `l2`, search width) mid-run is refused **loudly**, naming the field,
  the construction-time value, and the new value (`az`/`hp/registry.py`,
  `RestartRequired`), rather than silently running on a config the net is
  invalid against. The registry also refuses a malformed write at the source
  (`schema.py` strict decode) and never coerces a missing/drifted blob to a
  default — `RegistryDecodeError`, `RegistryKeyMissing`, `RegistryUnavailable`
  are distinct so the operator's mental model stays true.
- **The env's config validation.** `with_scenario` raises `ValueError` on a
  wrong-length value vector; `restrict` raises on an empty/out-of-range
  `keep` or a `k_local` exceeding `|keep|` (`model/env.py`). A wrong-length
  value vector is a config error, not something to silently broadcast or
  truncate to N.
- **The AZ block-param shape checks.** Loading weights with a corrupt or
  dimension-mismatched residual block fails **loudly at load** (`az/mlp.py`,
  `tests/test_az_loop.py`) — "fail informative HERE, not deep in the first
  forward."
- **The dtype/precision guard.** An unrecognised precision request is a
  configuration error that raises, not a silent fallback (`az/dtypes.py`).
- **The decomp boundedness abort.** `decomp.py`'s reachable-state
  enumeration aborts loudly on an over-cap synthetic blob rather than
  hanging or OOMing (`solvers/decomp.py`).

## From "Exceptions": the three subsections' chocofarm instances

### Bit-identical structural fallbacks

`env.d(a, b)` serves from the precomputed distance table and **falls back to
a live `math.hypot` compute** for any coord pair absent from the table. This
is not a coercion: the table was built from the same `math.hypot` inputs, so
the fallback is bit-identical. The fallback keeps the contract total; it
never hides a wrong answer.

### Idempotent / no-op-when-already-done operations

A teardown that runs twice, a `seed_registry` that no-ops when the blob
already exists (a `--resume` re-binds rather than clobbering operator
overrides), a cache rebuild skipped when the signature is unchanged — these
are idempotence guarantees, not failures.

### Bounded, scheduled-for-removal compat shims

A defensive fallback during a bounded transition (e.g. the worker
core-pinning's fail-soft `except: widx = 0` while the
process-name-scraping approach is replaced) is acceptable **if** the
alternative would produce a failure the operator cannot action, and **if**
it is commented as bounded and scheduled. (The audit flags the core-pinning
fail-soft as a band-aid to remove, not a permanent exception — see ADR-0009's
sibling and the audit's §2.H.)

## From Concrete Rule 2: the named env validators

`with_scenario`/`restrict` validate shapes and
ranges.

## From Concrete Rule 4: the three lying signatures

The audit's "lying signature" finding (a `train_epochs(lr,
l2)` that ignored its args; a `build(marg)` ignored; a `restrict_faces`
gating `pass`) is the same failure in the parameter register: a seam that
looks configured but is dead.

## From Concrete Rule 6: the reference-rate drift trace

The three reference rates (static floor, clairvoyant ceiling, decomp anchor) are *derived*
from the env. `eval/harness.py` computes them live; where they are instead hardcoded as
literals (`exit_loop.py`, and the `%VoI` divisor), the metric will silently misreport the
moment the env's value vector moves — and a test that pins the literal (`test_smoke.py`)
*forbids the legitimate retune that should update it*. The fix is to derive, never freeze,
and to assert the recompute is sane rather than pinning a number. (This is the audit's §4
trace and L4; the firing is currently latent, not realized.)

## Cross-reference added at extraction time (framing, not frozen record)

The drift traced in the frozen block above — one of the derived reference rates hardcoded
where it feeds the "%VoI" divisor (chocofarm's value-of-information percentage metric) —
is the same underlying incident that [ADR-0008](../0008-classification-discipline.md)'s
severity-calibration substitution test uses as its worked example; see
[history/0008-chocofarm-classification-substrate.md](0008-chocofarm-classification-substrate.md).
There the calibration point is that the identical failure shape ranges from near-zero cost
(a display-only literal) to catastrophic (a numerical input feeding a provable bound), so
the discipline is calibrated to the worst case, not the observed instance.
