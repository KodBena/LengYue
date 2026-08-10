# ADR-0012 — the cross-device (host↔device) bench saga

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0012-compositional-and-structural-hygiene.md` at commit `0f7b3e4` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

This is the full measurement narrative behind the 2026-06-20 amendment that lifted
P7 from the cross-language wire to the cross-device (host↔device) boundary: what
fired the recurrence (a JAX micro-benchmark proving a ~57 µs per-call cost was a
repeated params host→device transfer no one site owned), the AST-lint-plus-
ratcheting-baseline mechanism built to enforce it, the baseline recorded at
adoption, a same-day refinement that decomposed the cost precisely, the follow-on
consolidation landed in the production inference server, and a final assessment
that refuted the remaining input/output crossing as a further local lever. The
parent ADR keeps the rule itself, the anti-pattern checklist row, and a condensed
statement of the enforcement mechanism; this file is the dated evidence — the
specific benchmarks, commit hashes, module names, and measured numbers — that a
zero-context reader in a different project does not need to apply the rule, only
to see how it was proven out once, in full, on a real hot path.

---

**What fired this (ADR-0011 Rule 2 / this ADR's Revisit #4 — a review-only
principle's enforcement recurring into a *measured* cost).** P7's
"derive-don't-re-author across a boundary" was stated and enforced for the
cross-*language* wire (`transport.py`, the C++ mirror, `tests/test_wire_drift.py`).
The same compositional sin — a boundary crossing scattered across N sites
instead of isolated at *one* auditable home — recurs at the cross-*device*
(host↔device, numpy↔jax) boundary, and the recurrence is now **empirical, not
hypothetical**: the just-merged low-overhead-JAX micro-lib bench (commit
`feca4f2`; numbers under `~/w/vdc/chocobo/bench/lowlatency/`, ADR-0009 honesty —
warm, R²>0.99 linear fits) found that a **~57 µs per-call cost was nothing but a
repeated params host→device transfer** that `jax.jit(params, jnp.asarray(x))`
redoes every call (the robust AOT handle stages params device-resident *once* at
construction and drops it, intercept ≈121 µs → ≈64 µs, slope unchanged), and the
inference server's `run_microbatch` pays an even larger **~85–135 µs on the
input host→device hand-off plus a blocking device→host pull**. Scattered
transfers *are* the cost; isolating + consolidating them is the lever. A
recurrence with a measured cost is exactly the ADR-0011 Rule-2 trigger that
converts a review-only principle to a mechanism.

**The mechanism (ADR-0011 Rule 1 — this principle's enforcement surface, now
upgraded for the cross-device boundary from review-only to a test/CI gate).**
`tools/lint_host_device_transfers.py` is a **pure-`ast`** walker (imports neither
jax nor any analyzed module — the host is reserved for timing-sensitive
benchmarks) that flags transfer call-sites by name pattern and asserts each is at
a boundary or grandfathered:

- **Boundary** = an inline `# host-device-boundary: <reason>` marker on the
  transfer's own line, **or** membership in a small named `BOUNDARY_MODULES`
  whitelist (the jax backends `az/{mlp_jax,mlp_jax_train,optimizer,forward,
  lowlatency}.py` and the dispatch micro-bench, whose declared job *is* the
  device edge).
- **Ratcheting baseline** (`tools/host_device_baseline.json`, mirroring
  `tests/test_mypy_strict.py`'s `STRICT_CLEAN` monotonic ratchet, ADR-0011
  Rule 1): TODAY's non-boundary transfers are grandfathered (keyed structurally
  by `relpath::scope::kind` — ADR-0011 Rule 4, over the class of crossings, not a
  churning line number). A NEW transfer not at a boundary and not baselined
  **fails**; removing a baselined one **shrinks** the baseline (a stale entry
  also fails, so the file can only monotonically decrease).
- **Heuristic + opt-out (ADR-0011 Rule 3 measure-first / ADR-0008 vocabulary
  precision).** The host→device jax names and `.block_until_ready()` are
  *unambiguous* (jax-only — no false positive). The device→host pulls
  (`np.asarray`/`np.array`/`float`/`int`/`bool`/`.tolist`/`.item`) are
  *name-ambiguous* (the same call constructs numpy from a list or casts a Python
  scalar), so they are flagged **only when the argument carries a static jax/
  device signal** (a `forward`/`predict`/`device_put` call, or a device-residence
  name like `x_dev`) — the canonical `np.asarray(forward_fn(...))` *is* caught
  while the ~514 host-only scalar casts in the tree are *not* swept (netting them
  would be the cargo-cult net ADR-0011's "Negative" warns is worse than none). An
  inline `# host-device-allow: <reason>` marker silences a heuristic
  false positive at the site. **The pytest hook is `tests/test_no_gratuitous_
  transfers.py`** (always-on, pure `ast`, no jax import), with a negative/mutation
  self-check proving a synthetic new transfer fails and the boundary marker
  passes (mirroring `test_wire_drift.py` leg 2). The checker joins the mypy
  `--strict` gate's `STRICT_CLEAN` set (P8).

**Baseline at adoption (2026-06-20):** **3** grandfathered non-boundary
device→host pulls (all genuine, all device-signaled) — `inference_server.py::
run_microbatch::np.asarray` (the canonical offender), `netvalue_ismcts.py::
NetValueISMCTS._leaf_value::float`, `feature_response.py::partial_dependence::
float` — plus **38** transfer sites already at a designated boundary (the jax
backends + the dispatch bench). The rule **grandfathers today's** sites;
*consolidating* the biggest offender (`run_microbatch`'s input/output crossing —
keep the input device-resident across the drain and batch the device→host pull)
is the queued follow-on, not this record's scope.

**Scope (ADR-0004 no-retroactive-sweep, unchanged).** This amendment adds a
mechanism and grandfathers the existing crossings; it sweeps *nothing*. The
consolidation the bench motivates is separate forward work. The enforcement-
surface declaration in §"Self-application" for **P7** is hereby extended: P7 is
now mechanized at the **test/CI-gate** level for the **cross-DEVICE** boundary
(the AST lint + ratcheting baseline above), in addition to its existing
cross-LANGUAGE surfaces (the runtime manifest for the dynamic weight layout, the
`test_wire_drift.py` parity backstop for the static result format).

**Refinement (later same day — the real-MLP intercept decomposition, `fb9cfbc`).**
The `~85–135 µs run_microbatch input/output` figure cited above was a rough
pre-decomposition estimate. The standalone real-MLP benchmark
(`chocofarm/az/bench/bench_mlp_lowlatency.py` — the production 241→256→65 forward,
ADR-0009 rigor: warm, median + IQR over 9×2000 calls, R²≈0.998, four `allclose`-
verified variants) decomposes the ~129 µs *fixed* per-call cost precisely:
**params transfer ~45–53 µs** (the dominant consolidatable lever — staged
device-resident *once* via the `lowlatency` handle, confirming the toy bench's
~57 µs on the production net), **input + output transfer ~14.5 µs** (the
*smaller* component the rough figure over-weighted — input host→device ~5.5 µs,
batched device→host pull ~9 µs), and an **irreducible ~69 µs pjit/XLA dispatch
floor** (~54 %, unremovable by staging — the "unsafe" direct-executable path was
*refuted*, +103 µs worse). Net: consolidatable transfer ≈ 60 µs (~46 %), the
floor ≈ 54 %. The rule, the new anti-pattern row, and the gate are
**unchanged** — the refinement only sharpens *which* crossing is the lever:
**params-staging**, not the input/output pull the rougher figure implied.

**Follow-on landed (2026-06-20 — the params-staging consolidation in the live
server).** The queued params lever above is now wired into the production leaf
evaluator: `inference_server.py::build_staged_forward` builds the server's
forward as a `lowlatency.LowLatencyFn` whose weights are staged device-resident
once, and `InferenceServer._effective_forward` calls it from `run_microbatch`
(default path) instead of re-passing the host weight dict each forward.
**RECONFIG:** the staged handle is **rebuilt on every version-gated reload** —
the reload rebinds a fresh params dict (ADR-0001 rebind-not-mutate), detected by
object identity, so a forward never runs against a stale-version staged net
(ADR-0002); the rebuild is a **warm XLA-cache hit (~2.7 ms** — the fixed
`(max_batch, in_dim)` graph is already compiled, only the params re-stage),
amortized over the version's many forwards, so the cheap-restage extension the
record contemplated was **not** needed (the lib is used as-is; the cold ~170 ms
compile stays the one-time `warmup()` cost). Measured in the **real
`run_microbatch` path** (ADR-0009: warm, median+IQR, fit `time =
intercept + slope·rows`, R²>0.998, numbers under
`~/w/vdc/chocobo/bench/run_microbatch_staging/`): the fixed-cost intercept drops
**~50–80 µs/forward** (the staged intercept is stable ~95 µs across reps; the
`current` baseline intercept carries the dispatch floor's run-to-run variance,
putting the delta at +52.8 µs one rep, +79.4 µs another) with the **per-row
slope unchanged** (≈4.37 vs ≈4.44 µs/row) — a pure fixed-cost reduction
consistent with (and at the high end exceeding) the ~45–53 µs params-transfer
the decomposition isolated. Equivalence is behavior-preserving (ADR-0012 P6 /
ADR-0009): the server-parity opt-in tests pass against the staged path
(max|Δ| ≈ 2–5×10⁻⁷, residual ON/OFF, batched + the coalescing floor), and a new
jax-gated test pins `build_staged_forward` allclose (1e-4) to `jit_forward_core`
through `run_microbatch` plus the rebuild-on-reload guard. The **input/output
crossing remains the open follow-on** (the grandfathered
`run_microbatch::np.asarray` pull is untouched — the ~14.5 µs smaller lever).

**Input/output crossing assessed — REFUTED as a local lever (2026-06-20).**
The remaining `~14.5 µs` input+output crossing the params-staging follow-on left
open was investigated in the **real `run_microbatch` path** (ADR-0009: warm,
median+IQR over 7×3000 calls, fresh host `Xb` every forward, 3 reps incl. the
isolated core; numbers under `~/w/vdc/chocobo/bench/run_microbatch_io/`) and is
**not a cleanly-extractable local win** — the bench's 5.5 µs (input) and 9 µs
(output) deltas were **counterfactuals**, not achievable per-call operations.
**Input:** the staged path's implicit host→device inside `_compiled(params,
x_host)` is already the cheapest achievable path — pulling it out to an eager
`jax.device_put` is **+125–139 µs WORSE**, and `donate_x=True` is a measured
no-op (≈0 µs; jax warns "buffers not usable" — donating a *host* numpy `x`
cannot bite). The `staged_params_input` bench variant's 5.5 µs was the cost of
an input transfer the bench amortized by placing `x` device-resident *once*
outside the loop; in the server `Xb` is fresh host leaf-feature data every
forward, so the transfer is **inherent**. **Output:** the grandfathered
`run_microbatch::np.asarray` device→host pull is already the best local option —
`jax.device_get` is **+56–60 µs WORSE**, `copy_to_host_async` is **+16–21 µs
WORSE** (no overlap within a single sequential call), and
`block_until_ready()`+`np.asarray` is a marginal ≈−3 µs (within IQR, and would
*add* a flagged d2h call-site for sub-dispatch-noise). The ~9 µs is **inherent**
to a blocking device→host of a result that must reach host for the wire; hiding
it requires **pipelining the sequential serve loop** (overlap the pull with the
next microbatch's compute — a structural rework of
`_serve_batch`/`serve_forever`, gain capped at ~9 µs and only when
forward-bound), recommended **deferred**. Net: the params-staging lever
(~45–53 µs) was the whole of the consolidatable transfer; the input/output
crossing is **inherent** in the real path. The grandfathered
`run_microbatch::np.asarray` baseline entry and the lint gate are **unchanged** —
no code landed, a substantiated negative (ADR-0009).
